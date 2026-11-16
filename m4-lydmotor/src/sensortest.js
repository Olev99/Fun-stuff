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

// ---- revers: syntetiske turer med fortegnet fart. Segment: [varighet s, akselerasjon langs bilen m/s², valg] ----
// valg: wob = ekte akselerasjon svinger (m/s², sees av både sensor og GPS), jolt = telefonen rykkes, lat = sideveis (svinger)
const CAL = [[2, 0], [6, 2], [5, 0], [6, -2], [3, 0]]; // første tur lærer "fremover", ender i ro
const PARK = [[2, 1, { lat: 1 }], [1, 0], [2, -1], [2, 0], [1.5, -1, { lat: 1 }], [1, 0, { lat: 1 }], [1.5, 1], [2, 0],
  [1.5, 1, { lat: 1 }], [1, 0], [1.5, -1], [2, 0], [1.5, -1, { lat: 1 }], [1.5, 1], [2, 0], [2, 1.5], [2, 0]];
const QUEUE = []; for (let i = 0; i < 8; i++) QUEUE.push([2.5, 2, { wob: 0.6 }], [1, 0], [2.5, -2], [1.5, 0, i === 3 ? { jolt: 1 } : null]);
const REV = [
  { name: 'fremover fra stillstand', segs: CAL.concat([[5, 2], [5, 0]]) },
  { name: 'revers fra stillstand', segs: CAL.concat([[2, -1.2], [4, 0], [2, 1.2], [3, 0]]) },
  { name: 'stopp og kjør med retningsskifte', segs: CAL.concat([[4, 1.5], [3, 0], [4, -1.5], [2, 0], [2, -1], [3, 0], [2, 1], [2, 0], [4, 2], [3, 0]]) },
  { name: 'fremover i fart, støyete akselerasjon', segs: CAL.concat([[4, 2.5], [30, 0, { wob: 1.5 }], [10, 0, { wob: 2.5 }], [1, 0, { jolt: 1 }], [10, 0, { wob: 2 }]]) },
  { name: 'slipp, brems, kort stopp, rullende nesten-stopp', segs: CAL.concat([[5, 3], [4, -0.8], [3, -4], [1.5, 0], [4, 3], [2, -2], [1, 0.5], [3, 2], [5, -3], [0.8, 0], [3, 2.5]]) },
  { name: 'parkering frem-stopp-revers-stopp-frem', segs: CAL.concat(PARK) },
  { name: 'kø: stopp og gå fremover, rykk i ro', segs: CAL.concat(QUEUE) },
  // robusthet: GPS-forsinkelsen er ikke målt på iPhone (koden antar 1,0 s), skjevheten kan være større
  { name: 'parkering, GPS 0,5 s forsinket', segs: CAL.concat(PARK), lag: 500 },
  { name: 'parkering, GPS 1,6 s forsinket', segs: CAL.concat(PARK), lag: 1600 },
  { name: 'kø, skjevhet 0,6 m/s², annet frø', segs: CAL.concat(QUEUE), bias: 0.6, seed: 4242 },
  { name: 'revers fra stillstand, skjevhet 0,6, GPS 1,4 s', segs: CAL.concat([[2, -1.2], [4, 0], [2, 1.2], [3, 0]]), bias: 0.6, lag: 1400, seed: 99 },
  { name: 'revers før kalibrering', segs: [[2, 0], [2, -1.5], [3, 0], [2, 1.5], [2, 0]].concat(CAL, [[5, 2], [3, 0]]), noCal: true }
];

async function simRev(page, sc) {
  return page.evaluate(([segs, LAG, BIAS, seed]) => {
    const M = window.__m4, S = M.S, st = M.st;
    let rs = seed; const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    let sent = null; st.core = { msg: (m) => { sent = m; } }; st.mode = 'drive'; // fang det motoren får
    // Telefonen står skrått i holderen: bilens fremover er en blanding av -z og x. y = opp.
    const f = [0.3, 0, -0.954], lat = [0.954, 0, 0.3];
    let T = 0, v = 0, nextFix = 1000, wob = 0, latA = 0, last = null; const truth = [], out = [];
    for (let si = 0; si < segs.length; si++) {
      const [dur, acc, o] = segs[si], op = o || {};
      const sd = v !== 0 ? Math.sign(v) : Math.sign(acc); // innen et segment skifter bilen aldri retning
      for (let k = 0; k < Math.round(dur * 60); k++) {
        T += 1000 / 60; window.__T = T;
        wob += (gauss() * (op.wob || 0) - wob) * 0.05; // langsom, ekte svingning i akselerasjonen
        let a = acc + (op.wob ? wob * 3 : 0), nv = v + a / 60;
        if (nv * sd < 0 || (Math.abs(nv) < 1e-6 && acc === 0)) nv = 0;
        a = (nv - v) * 60; v = nv;
        latA += ((Math.abs(v) > 0.3 && op.lat ? gauss() * 3 : 0) - latA) * 0.05;
        truth.push({ t: T, v });
        const lin = [0, 0, 0];
        for (let i = 0; i < 3; i++) lin[i] = (a + BIAS) * f[i] + latA * lat[i] + gauss() * 0.25; // 0.2 m/s² skjevhet
        let rot = { alpha: gauss() * 2, beta: gauss() * 2, gamma: gauss() * 2 };
        if (op.jolt && k < 30) { for (let i = 0; i < 3; i++) lin[i] += (rnd() - 0.5) * 14; rot = { alpha: 150, beta: -120, gamma: 90 }; }
        M.onMotion({ acceleration: { x: lin[0], y: lin[1], z: lin[2] },
          accelerationIncludingGravity: { x: lin[0], y: lin[1] + 9.81, z: lin[2] }, rotationRate: rot });
        if (T >= nextFix) { // GPS: fart uten fortegn, LAG ms gammel; i ro gir iPhone 0 eller -1 (ugyldig)
          nextFix += 1000;
          const old = (truth.find((x) => x.t >= T - LAG) || truth[0]).v, sp = Math.abs(old);
          const speed = sp < 0.3 ? (rnd() < 0.7 ? 0 : -1) : Math.max(0, sp + gauss() * (sp < 2 ? 0.2 : 0.1));
          M.onGps({ timestamp: T - LAG, coords: { speed: speed, accuracy: 6, heading: null, latitude: 59.9, longitude: 10.7 } });
        }
        out.push({ t: T / 1000, v, dir: S.dir, est: S.vEst, sv: sent ? sent.v : 0, sthr: sent ? sent.thr : 0,
          fwdOk: S.fwd ? S.fwd[0] * f[0] + S.fwd[2] * f[2] : null, dec: S.rvLast !== last ? (last = S.rvLast) : null });
      }
    }
    return out;
  }, [sc.segs, sc.lag || 1000, sc.bias == null ? 0.2 : sc.bias, sc.seed || 777]);
}

function revReport(rv) {
  let eps = 0, hit = 0, fp = 0, fpT = 0, epsCal = 0, hitCal = 0, mF = 9, mR = -9; const lat = [];
  console.log('\nREVERS (GPS-fart uten fortegn, forsinket, telefonen skrått i holderen):');
  for (const r of rv) {
    const o = r.o; let e = 0, h = 0, f = 0, maxSv = 0, maxThr = 0; const L = [];
    for (let i = 0; i < o.length; i++) {
      const x = o[i];
      if (x.dir === 'R' && x.v > 0.05) f++;
      if (x.dec) { // avgjørelse ved start: u/v er +1 fremover og -1 bakover; terskel -0,5
        const back = o.slice(Math.max(0, i - 240), i).some((y) => y.v < 0) && x.v <= 0, q = x.dec.u / x.dec.v;
        if (back) mR = Math.max(mR, q); else mF = Math.min(mF, q);
        if (process.env.DBG) console.log('  [' + r.name + '] dec t=' + x.t.toFixed(1) + (back ? ' bak' : ' frem') + ' u=' + x.dec.u.toFixed(2) + ' v=' + x.dec.v.toFixed(2) + ' T=' + x.dec.T.toFixed(1));
      }
      if (x.dir === 'R') { maxSv = Math.max(maxSv, x.sv); maxThr = Math.max(maxThr, x.sthr); }
      if (x.v < 0 && (i === 0 || o[i - 1].v >= 0)) { // ny revers-episode
        e++; let j = i, found = null;
        while (j < o.length && o[j].v <= 0 && !(o[j].v === 0 && j > i)) { if (o[j].dir === 'R' && !found) found = o[j]; j++; }
        if (found) { h++; L.push(found.t - x.t); }
      }
    }
    eps += e; hit += h; if (!r.sc.noCal) { epsCal += e; hitCal += h; } fp += f; fpT += f / 60; lat.push(...L);
    console.log('INFO ' + r.name + ': revers-episoder ' + e + ', oppdaget ' + h + (L.length ? ' (etter ' + L.map((x) => x.toFixed(1)).join(', ') + ' s)' : '') +
      ', falsk revers fremover ' + (f / 60).toFixed(2) + ' s' + (h ? ', til motoren i R: fart maks ' + maxSv.toFixed(1) + ' m/s, gass maks ' + maxThr.toFixed(2) : ''));
    check('revers: ' + r.name + ': aldri "Rygger" mens bilen kjører fremover', f === 0, f + ' prøver');
    if (r.sc.noCal) { const last = o[o.length - 1]; check('revers: rygging før kalibrering lærer ikke fremover feil vei', last.fwdOk > 0.9, 'fwd·sann ' + (last.fwdOk == null ? '–' : last.fwdOk.toFixed(2))); }
    if (h) check('revers: ' + r.name + ': motoren får lav fart og dempet gass i R', maxSv <= 3.41 && maxThr <= 0.5);
  }
  const mean = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : NaN;
  console.log('INFO revers totalt: ' + hit + ' av ' + eps + ' episoder oppdaget, ventetid snitt ' + mean.toFixed(1) + ' s (maks ' + Math.max(...lat).toFixed(1) + ' s), falsk revers fremover ' + fpT.toFixed(2) + ' s');
  console.log('INFO revers margin: u/v ved start fremover minst ' + mF.toFixed(2) + ', bakover høyst ' + mR.toFixed(2) + ' (terskel -0.5)');
  check('revers: minst 70 % av rygge-episodene oppdages (etter kalibrering; korte rygg med lang GPS-forsinkelse kan glippe)', hitCal >= 0.7 * epsCal, hitCal + '/' + epsCal);
  // Motoren i R: 1. gir, lavt turtall, også i Sport og Sport+
  const EngineCore = require('./engine.js');
  for (const ex of [0, 1, 2]) {
    const e = new EngineCore(48000), L = new Float32Array(128), R = new Float32Array(128); let gmax = 1, rmax = 0;
    e.msg({ k: 'cfg', vol: 1, burble: 0.7, exMode: ex, auto: true });
    for (let b = 0; b < 48000 * 6 / 128; b++) {
      const t = b * 128 / 48000; e.msg({ k: 'drive', v: Math.min(t * 0.8, 3.4), thr: 0.5, brake: 0 }); e.render(L, R, 128);
      gmax = Math.max(gmax, e.gear); rmax = Math.max(rmax, e.rpmS);
    }
    check('revers: motoren blir i 1. gir under 2200 o/min (modus ' + ex + ')', gmax === 1 && rmax < 2200, 'gir ' + gmax + ', maks ' + Math.round(rmax) + ' o/min');
  }
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
    const c = await p.evaluate(() => { const M = window.__m4; M.S.dir = 'R'; M.sysTick(); const t = document.querySelector('#stSys').textContent; M.S.dir = 'F'; M.sysTick(); return t; });
    check('side: statuslinjen viser "Rygger" i revers', /Rygger/.test(c), c);
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
  // 3) Revers: hver kjøretur på en fersk side (ingen lagret kalibrering)
  const rv = [];
  for (const sc of REV) {
    const pg = await ctx.newPage(); watch(pg);
    await pg.addInitScript(() => { window.__T = 0; performance.now = () => window.__T; try { localStorage.clear(); } catch (e) {} });
    await pg.goto(url);
    rv.push({ name: sc.name, o: await simRev(pg, sc), sc: sc });
    await pg.close();
  }
  check('revers: ingen konsollfeil', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close(); server.close();
  revReport(rv);

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
