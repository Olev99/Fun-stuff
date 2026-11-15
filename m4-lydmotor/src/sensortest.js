// Syntetisk kjøretur gjennom sensorfusjonen i main.js, i hodeløs Chrome over http://localhost.
// Bruk: node m4-lydmotor/src/sensortest.js [sti til html, standard ../index.html]
// Simulerer akselerometer (60 Hz, støy, skjevhet) og GPS-fart som kommer ett sekund for sent, og sjekker
// fartsestimat (ingen sagtann), stigning, rykk i telefonen og at siden starter uten konsollfeil.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));

const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(file)); });
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); };

// Kjøreprofil: [varighet s, akselerasjon m/s², stigning (andel)]
const PROFILE = [[2, 0, 0], [10, 2, 0], [8, 0, 0], [6, -2.5, 0], [4, 0, 0], [10, 2, 0], [12, 0, 0], // kalibrering + måling
  [8, 0, 0], [30, 0, 0.06], [12, 0, 0], [30, 0, -0.06], [10, 0, 0], // bakker i konstant fart (25 m/s)
  [1, 0, 0, 'jolt'], [4, 0, 0], // telefonen løftes
  [3, 0, 0], [2, 3, 0], [2, 0, 0]]; // trinn i gass for responstid

async function sim(page) {
  return page.evaluate((PROFILE) => {
    const M = window.__m4, S = M.S;
    let T = 0, rs = 12345; const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    window.__T = 0;
    // Telefonen i holder: skjermen mot føreren. Telefonens y = opp, z = bakover, x = høyre. Bilens fremover = -z.
    const truth = []; let v = 0, nextFix = 1000; const out = [];
    for (let si = 0, t0 = 0; si < PROFILE.length; si++) {
      const [dur, acc, grade, kind] = PROFILE[si];
      for (let k = 0; k < Math.round(dur * 60); k++) {
        T += 1000 / 60; window.__T = T;
        v = Math.max(0, v + acc / 60);
        truth.push({ t: T, v });
        const th = Math.atan(grade), up = [0, Math.cos(th), -Math.sin(th)]; // opp i telefonens akser
        const lin = [gauss() * 0.25, gauss() * 0.25, -(acc + 0.2) + gauss() * 0.25]; // 0.2 m/s² skjevhet langs bilen
        let rot = { alpha: gauss() * 2, beta: gauss() * 2, gamma: gauss() * 2 };
        if (kind === 'jolt' && k < 30) { for (let i = 0; i < 3; i++) lin[i] += (rnd() - 0.5) * 14; rot = { alpha: 150, beta: -120, gamma: 90 }; }
        M.onMotion({ acceleration: { x: lin[0], y: lin[1], z: lin[2] },
          accelerationIncludingGravity: { x: lin[0] + 9.81 * up[0], y: lin[1] + 9.81 * up[1], z: lin[2] + 9.81 * up[2] }, rotationRate: rot });
        let jump = null;
        if (T >= nextFix) { // GPS: farten fra ett sekund siden, levert nå
          nextFix += 1000;
          const old = truth.find((x) => x.t >= T - 1000) || truth[0];
          const before = S.vEst;
          M.onGps({ timestamp: T - 1000, coords: { speed: Math.max(0, old.v + gauss() * 0.1), accuracy: 5, heading: null, latitude: 59.9, longitude: 10.7 } });
          jump = S.vEst - before;
        }
        out.push({ t: T / 1000, seg: si, v, est: S.vEst, thr: S.thr, brk: S.brk, jump, fwd: !!S.fwd, grade: S.grade || 0 });
      }
    }
    return out;
  }, PROFILE);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();
  const errs = [];
  const watch = (p) => { p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text())) errs.push(m.text()); }); };

  // 1) Siden: testmodus, så bytte til kjøremodus (sensorer skal slå seg på uten eget trykk). NO_UI=1 hopper over (for eldre bygg).
  if (!process.env.NO_UI) {
    const ctx = await browser.newContext(); const p = await ctx.newPage(); watch(p);
    await p.goto(url); await p.click('#startTest'); await p.waitForTimeout(1500);
    const a = await p.evaluate(() => ({ state: window.__m4.st.ctx && window.__m4.st.ctx.state, sys: document.querySelector('#stSys').textContent }));
    await p.click('#mDrive'); await p.waitForTimeout(800);
    const b = await p.evaluate(() => ({ on: window.__m4.S.on, btn: document.querySelector('#sensBtn').hidden, sys: document.querySelector('#stSys').textContent }));
    await p.click('summary'); await p.click('#calReset');
    check('side: testmodus starter, statuslinje vises', !!a.sys, 'lyd ' + a.state + ' | ' + a.sys);
    check('side: bytte til Kjør slår på sensorer uten eget trykk', b.on && b.btn, b.sys);
    await ctx.close();
  }
  // 2) Syntetisk kjøretur med falsk klokke
  const ctx = await browser.newContext(); const page = await ctx.newPage(); watch(page);
  await page.addInitScript(() => { window.__T = 0; performance.now = () => window.__T; try { localStorage.clear(); } catch (e) {} });
  await page.goto(url);
  const o = await sim(page);
  check('ingen konsollfeil', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close(); server.close();

  const segs = {}; o.forEach((x) => (segs[x.seg] = segs[x.seg] || []).push(x));
  const tail = (si, sec) => { const a = segs[si]; return a.slice(Math.max(0, a.length - sec * 60)); };
  const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
  const rms = (a, f) => Math.sqrt(mean(a, (x) => f(x) * f(x)));
  const calAt = o.find((x) => x.fwd); check('kalibrering: lærer fremover i første akselerasjon', calAt && calAt.t < 14, calAt ? 'ved ' + calAt.t.toFixed(1) + ' s' : 'aldri');
  const meas = o.filter((x) => x.seg >= 3 && x.seg <= 6);
  const jumps = meas.filter((x) => x.jump !== null).map((x) => Math.abs(x.jump));
  const accJ = segs[5].filter((x) => x.jump !== null).map((x) => x.jump);
  const err = rms(meas, (x) => x.est - x.v), errAcc = mean(segs[5].slice(120), (x) => x.est - x.v);
  console.log('INFO fart: rms-feil ' + err.toFixed(2) + ' m/s, snitt-sprang ved GPS ' + mean(jumps, (x) => x).toFixed(2) + ' m/s (maks ' + Math.max(...jumps).toFixed(2) + '), skjevhet under akselerasjon ' + errAcc.toFixed(2) + ' m/s');
  check('fart: ingen sagtann ved GPS-oppdatering (snittsprang < 0.15 m/s)', mean(jumps, (x) => x) < 0.15, 'sprang under akselerasjon: ' + accJ.map((x) => x.toFixed(2)).join(' '));
  check('fart: følger sann fart under akselerasjon (snittavvik < 0.6 m/s)', Math.abs(errAcc) < 0.6, errAcc.toFixed(2) + ' m/s');
  const flat = mean(tail(7, 5), (x) => x.thr), up = mean(tail(8, 15), (x) => x.thr), flat2 = mean(tail(9, 5), (x) => x.thr), dn = mean(tail(10, 15), (x) => x.thr);
  const dnBrk = Math.max(...tail(10, 15).map((x) => x.brk));
  console.log('INFO bakke (25 m/s): gass flat ' + flat.toFixed(2) + ', 6 % opp ' + up.toFixed(2) + ', flat ' + flat2.toFixed(2) + ', 6 % ned ' + dn.toFixed(2) + ' (stigning lest ' + mean(tail(8, 15), (x) => x.grade).toFixed(3) + ' / ' + mean(tail(10, 15), (x) => x.grade).toFixed(3) + ')');
  check('bakke: oppover i jevn fart gir mer gass enn flatt, ikke slipp', up > flat + 0.05 && up < 0.5, 'opp ' + up.toFixed(2) + ' flat ' + flat.toFixed(2));
  check('bakke: nedover i jevn fart leses som slipp, ikke brems', dn < 0.03 && dnBrk < 0.05, 'ned ' + dn.toFixed(2) + ' brems maks ' + dnBrk.toFixed(2));
  const j = segs[12].concat(segs[13].slice(0, 60)), base = mean(tail(11, 3), (x) => x.thr);
  const jmax = Math.max(...j.map((x) => x.thr)), jbrk = Math.max(...j.map((x) => x.brk)), vdev = Math.max(...j.map((x) => Math.abs(x.est - x.v)));
  console.log('INFO rykk: gass før ' + base.toFixed(2) + ', maks under/etter rykk ' + jmax.toFixed(2) + ', brems maks ' + jbrk.toFixed(2) + ', fartsavvik maks ' + vdev.toFixed(2) + ' m/s');
  check('rykk i telefonen: ingen falsk gass/kickdown eller brems', jmax < base + 0.15 && jbrk < 0.1, 'maks gass ' + jmax.toFixed(2) + ' brems ' + jbrk.toFixed(2));
  const pre = tail(14, 2), noise = Math.sqrt(mean(pre, (x) => (x.thr - mean(pre, (y) => y.thr)) ** 2));
  const step = segs[15], fin = mean(step.slice(24, 36), (x) => x.thr), t0 = step[0].t, hit = step.find((x) => x.thr >= mean(pre, (y) => y.thr) + 0.9 * (fin - mean(pre, (y) => y.thr)));
  console.log('INFO gassvei: støy (std) ' + noise.toFixed(3) + ', 90 % av trinn etter ' + (hit ? Math.round((hit.t - t0) * 1000) + ' ms' : '–'));
  check('gassvei: rask respons (< 150 ms til 90 %) uten mye støy (std < 0.03)', hit && hit.t - t0 < 0.15 && noise < 0.03);
  console.log(fails ? '\n' + fails + ' FEIL' : '\nALT OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
