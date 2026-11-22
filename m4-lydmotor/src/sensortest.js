// Syntetisk kjøretur gjennom sensorfusjonen i main.js, i hodeløs Chrome over http://localhost.
// Bruk: node m4-lydmotor/src/sensortest.js [sti til html, standard ../index.html]
// Simulerer akselerometer (60 Hz, støy, skjevhet) og GPS-fart som kommer 0,11 s for sent (målt på iPhone; andre forsinkelser i egne
// turer, som appen måler selv), og sjekker
// fartsestimat (ingen sagtann), stigning, rykk i telefonen og at siden starter uten konsollfeil.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));

// Statisk tjener for mappen siden ligger i ('/' = siden). OVR: innhold som overstyrer filer (test av ny versjon).
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const OVR = {};
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]), rel = p === '/' ? path.basename(file) : p.slice(1);
  const f = p === '/' || rel === 'index.html' ? file : path.join(path.dirname(file), rel);
  if (rel.includes('..') || (!OVR[rel] && !fs.existsSync(f))) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  r.end(OVR[rel] != null ? OVR[rel] : fs.readFileSync(f));
});
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); };

// Kjøreprofil: [varighet s, akselerasjon m/s², stigning (andel)]
const PROFILE = [[2, 0, 0], [10, 2, 0], [8, 0, 0], [6, -2.5, 0], [4, 0, 0], [10, 2, 0], [12, 0, 0], // kalibrering + måling
  [8, 0, 0], [30, 0, 0.06], [12, 0, 0], [30, 0, -0.06], [10, 0, 0], // bakker i konstant fart (25 m/s)
  [1, 0, 0, 'jolt'], [4, 0, 0], // telefonen løftes
  [3, 0, 0], [2, 3, 0], [2, 0, 0]]; // trinn i gass for responstid

async function sim(page, lag) {
  return page.evaluate(([PROFILE, LAG]) => {
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
        if (T >= nextFix) { // GPS: farten fra LAG ms siden, levert nå
          nextFix += 1000;
          const old = truth.find((x) => x.t >= T - LAG) || truth[0];
          const before = S.vEst;
          M.onGps({ timestamp: T - LAG, coords: { speed: Math.max(0, old.v + gauss() * 0.1), accuracy: 5, heading: null, latitude: 59.9, longitude: 10.7 } });
          jump = S.vEst - before;
        }
        out.push({ t: T / 1000, seg: si, v, est: S.vEst, thr: S.thr, brk: S.brk, jump, fwd: !!S.fwd, grade: S.grade || 0 });
      }
    }
    return out;
  }, [PROFILE, lag || 110]);
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
  // målt forsinkelse på eierens iPhone: 0,11 s. Umålt bruker reverslogikken 1,0 s; målt (lagret) den målte verdien.
  { name: 'parkering, GPS 0,11 s, ikke målt ennå', segs: CAL.concat(PARK), lag: 110 },
  { name: 'parkering, GPS 0,11 s, målt', segs: CAL.concat(PARK), lag: 110, known: 110, seed: 515 },
  { name: 'stopp og kjør med retningsskifte, GPS 0,11 s, målt', segs: CAL.concat([[4, 1.5], [3, 0], [4, -1.5], [2, 0], [2, -1], [3, 0], [2, 1], [2, 0], [4, 2], [3, 0]]), lag: 110, known: 110 },
  { name: 'kø, GPS 0,11 s, målt', segs: CAL.concat(QUEUE), lag: 110, known: 110, seed: 616 },
  { name: 'parkering, GPS 1,0 s, målt', segs: CAL.concat(PARK), lag: 1000, known: 1000 },
  { name: 'revers før kalibrering', segs: [[2, 0], [2, -1.5], [3, 0], [2, 1.5], [2, 0]].concat(CAL, [[5, 2], [3, 0]]), noCal: true }
];

async function simRev(page, sc) {
  return page.evaluate(([segs, LAG, BIAS, seed, FIX, KNOWN]) => {
    const M = window.__m4, S = M.S, st = M.st;
    let rs = seed; const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    let sent = null; st.core = { msg: (m) => { sent = m; } }; st.mode = 'drive'; // fang det motoren får
    // Telefonen står skrått i holderen: bilens fremover er en blanding av -z og x. y = opp.
    const f = [0.3, 0, -0.954], lat = [0.954, 0, 0.3];
    let T = 0, v = 0, nextFix = 1000, wob = 0, latA = 0, last = null, jump = null; const truth = [], out = [];
    if (FIX) S.lag = FIX;
    if (KNOWN) { S.lag = KNOWN; S.lagOk = true; } // som lest fra lagret kalibrering
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
          if (FIX) S.lag = FIX;
          const before = S.vEst;
          M.onGps({ timestamp: T - LAG, coords: { speed: speed, accuracy: 6, heading: null, latitude: 59.9, longitude: 10.7 } });
          if (FIX) S.lag = FIX;
          jump = S.vEst - before;
        } else jump = null;
        out.push({ t: T / 1000, v, dir: S.dir, est: S.vEst, sv: sent ? sent.v : 0, sthr: sent ? sent.thr : 0, jump, lag: S.lag,
          fwdOk: S.fwd ? S.fwd[0] * f[0] + S.fwd[2] * f[2] : null, dec: S.rvLast !== last ? (last = S.rvLast) : null });
      }
    }
    return out;
  }, [sc.segs, sc.lag || 1000, sc.bias == null ? 0.2 : sc.bias, sc.seed || 777, sc.fix || 0, sc.known || 0]);
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

// ---- GPS-forsinkelsen måles fortløpende (S.lag): bykjøring med ekte forsinkelse 0,1-1,5 s ----
// Bykjøringen er syntetisk, med omtrent samme statistikk som eierens første tur (iPhone, 6,4 min): fart median ~6 m/s,
// maks ~16 m/s, akselerasjon opptil ~2,8 m/s², hyppige stopp og nesten-stopp. Ingen data fra loggen er med.
function city(seed, dur) {
  let rs = seed; const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };
  const segs = CAL.slice(); let v = 0, T = 0;
  while (T < dur) {
    const vt = 6 + rnd() * 10, a = 1.2 + rnd() * 1.6, d1 = Math.max(0.5, (vt - v) / a);
    segs.push([d1, a]); v = Math.max(v, vt); T += d1;
    const c = 3 + rnd() * 7; segs.push([c, 0, { wob: 0.5 + rnd() * 0.6 }]); T += c;
    const stop = rnd() < 0.4, vb = stop ? 0 : 2.5 + rnd() * 3.5, b = 0.8 + rnd() * 1.7, d2 = (v - vb) / b;
    segs.push([d2 + (stop ? 0.5 : 0), -b]); v = vb; T += d2;
    if (stop) { const w = 2 + rnd() * 4; segs.push([w, 0]); T += w; }
  }
  return segs;
}
async function lagRuns(browser, url, watch) {
  const ctx = await browser.newContext(); const res = [];
  for (const lag of [100, 500, 1000, 1500]) for (const fix of [0, 1000]) {
    const pg = await ctx.newPage(); watch(pg);
    await pg.addInitScript(() => { window.__T = 0; performance.now = () => window.__T; try { localStorage.clear(); } catch (e) {} });
    await pg.goto(url);
    const o = await simRev(pg, { segs: city(4000 + lag, 200), lag: lag, seed: 31 + lag, fix: fix });
    // kalibreringen (med forsinkelsen) lagres hvert 30. s fra driveTick; en ny side leser den inn igjen
    const cal = await pg.evaluate(() => { const M = window.__m4; M.st.mode = 'drive'; M.S.saveT = -1e9; M.driveTick(); return JSON.parse(localStorage.getItem('m4cal') || 'null'); });
    const pg2 = await ctx.newPage(); await pg2.goto(url); const back = await pg2.evaluate(() => window.__m4.S.lag); await pg2.close();
    await pg.close();
    res.push({ lag, fix, o, cal, back });
  }
  await ctx.close();
  return res;
}
function lagReport(res) {
  console.log('\nGPS-FORSINKELSE (bykjøring 200 s, målt fortløpende; "fast 1,0 s" = den gamle antakelsen):');
  const st = (o, t0) => { const a = o.filter((x) => x.t >= t0), j = a.filter((x) => x.jump !== null && x.v > 2).map((x) => Math.abs(x.jump));
    return { rms: Math.sqrt(a.reduce((s, x) => s + (x.est - x.v) ** 2, 0) / a.length), jump: j.reduce((s, x) => s + x, 0) / j.length }; };
  for (const lag of [100, 500, 1000, 1500]) {
    const ad = res.find((r) => r.lag === lag && !r.fix), fx = res.find((r) => r.lag === lag && r.fix), o = ad.o;
    const fin = o[o.length - 1].lag, conv = o.find((x, i) => o.slice(i).every((y) => Math.abs(y.lag - lag) <= 100));
    const A = st(o, 0), A2 = st(o, 100), B = st(fx.o, 0), B2 = st(fx.o, 100);
    const ser = []; for (let t = 30; t <= 200; t += 20) { const x = o.find((y) => y.t >= t); if (x) ser.push(Math.round(x.lag)); }
    console.log('INFO ekte ' + lag + ' ms: målt ' + Math.round(fin) + ' ms' + (conv ? ', innen ±0,1 s fra ' + conv.t.toFixed(0) + ' s' : '') + ' (hvert 20. s: ' + ser.join(' ') + ')' +
      '; fartsfeil rms ' + A.rms.toFixed(2) + ' (fra 100 s ' + A2.rms.toFixed(2) + '), sprang ved GPS ' + A.jump.toFixed(2) + ' m/s; fast 1,0 s: rms ' + B.rms.toFixed(2) + ' (' + B2.rms.toFixed(2) + '), sprang ' + B.jump.toFixed(2));
    check('gps-forsinkelse: ekte ' + lag + ' ms måles innen ±0,1 s (' + Math.round(fin) + ' ms) og lagres med kalibreringen', Math.abs(fin - lag) <= 100 && ad.cal && Math.abs(ad.cal.lag - fin) <= 1 && Math.abs(ad.back - fin) <= 1, 'lagret ' + (ad.cal ? ad.cal.lag : '–') + ', lest inn ' + Math.round(ad.back));
    check('gps-forsinkelse: ekte ' + lag + ' ms: fartsfeil som den faste 1,0 s eller bedre (fra 100 s, +0,05 m/s slingring)', A2.rms <= B2.rms + 0.05, A2.rms.toFixed(2) + ' mot ' + B2.rms.toFixed(2));
    check('gps-forsinkelse: ekte ' + lag + ' ms: ingen falsk revers', o.every((x) => !(x.dir === 'R' && x.v > 0.05)));
    // motoren regner slipp etter 0,15 s under 0,05 og avslutter over 0,08: gass som blir liggende 0,015-0,09 lenger enn 0,2 s
    // (ikke bare passerer på vei til eller fra slipp) gir girjakt
    let run = 0, hov = 0; const mv = o.filter((x) => x.t > 20 && x.v > 1);
    for (const x of mv) { run = x.sthr > 0.015 && x.sthr < 0.09 ? run + 1 : 0; if (run > 12) hov++; }
    check('gass: i bykjøring blir gassen ikke liggende rundt motorens slipp-terskler (> 0,2 s i 0,015-0,09: ' + (100 * hov / mv.length).toFixed(1) + ' % av tiden)', hov / mv.length < 0.01);
  }
}

// ---- ekte kjørelogg (valgfri): DRIVELOG=<fil> spilles gjennom fusjonen, med målt og med fast 1,0 s forsinkelse ----
// Loggen ligger aldri i repoet; uten DRIVELOG hoppes dette over. Posisjoner sendes ikke inn (bredde/lengde 0).
async function replayLog(browser, url, watch, L, fix) {
  const s = L.s, g = L.gps, T = s.t, n = T.length, i0 = s.aLin.findIndex((x) => x != null);
  if (i0 < 0) return null;
  const t0 = T[i0] - 1000, rows = [], fixes = [], gb = (L.state && L.state.gBase) || 0;
  for (let i = i0; i < n; i++) rows.push([T[i] - t0, s.aLin[i] == null ? 0 : s.aLin[i], s.rot[i] || 0, s.grade[i] || 0]);
  for (let i = 0; i < g.t.length; i++) if (g.t[i] - t0 > 0 && g.t[i] <= T[n - 1]) fixes.push([g.t[i] - t0, g.ts[i] - t0, g.spd[i], g.acc[i], g.hdg[i]]);
  const ctx = await browser.newContext(); const pg = await ctx.newPage(); watch(pg);
  await pg.addInitScript((gb) => { window.__T = 0; performance.now = () => window.__T; try { localStorage.clear();
    localStorage.setItem('m4cal', JSON.stringify({ t: Date.now(), F: [0, 0, -10], g: [0, 1, 0], gb: gb, b: 0 })); } catch (e) {} }, gb); // kalibrert: fremover = -z
  await pg.goto(url);
  const r = await pg.evaluate(([rows, fixes, FIX, gb]) => {
    const M = window.__m4, S = M.S, st = M.st; let sent = null;
    st.core = { msg: (m) => { if (m.k === 'drive') sent = m; } }; st.mode = 'drive';
    const out = [], fx = []; let fi = 0, ri = 0;
    if (FIX) S.lag = FIX;
    for (let t = rows[0][0]; t < rows[rows.length - 1][0]; t += 1000 / 60) { // 10 Hz-loggen interpolert til 60 Hz
      while (ri + 1 < rows.length && rows[ri + 1][0] <= t) ri++;
      const a = rows[ri], b = rows[Math.min(ri + 1, rows.length - 1)], k = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 0;
      const al = a[1] + (b[1] - a[1]) * k, th = Math.asin(Math.max(-0.2, Math.min(0.2, a[3] + gb)));
      while (fi < fixes.length && fixes[fi][0] <= t) {
        const f = fixes[fi++], before = S.vEst; window.__T = f[0];
        M.onGps({ timestamp: f[1], coords: { speed: f[2] == null ? NaN : f[2], accuracy: f[3] == null ? 999 : f[3], heading: f[4], latitude: 0, longitude: 0 } });
        if (FIX) S.lag = FIX;
        fx.push([f[0], f[2], S.vEst - before, S.lag]);
      }
      window.__T = t;
      M.onMotion({ acceleration: { x: 0, y: 0, z: -al }, accelerationIncludingGravity: { x: 0, y: 9.81 * Math.cos(th), z: -al - 9.81 * Math.sin(th) }, rotationRate: { alpha: a[2], beta: 0, gamma: 0 } });
      if (sent) out.push([t, S.vEst, sent.v, sent.thr, sent.brake || 0]);
    }
    return { out, fx };
  }, [rows, fixes, fix, gb]);
  await ctx.close();
  // fartsfeil mot GPS ved loggens målte forsinkelse (loganalyze), sagtann, og motoren (M4, Sport) på det den fikk
  const { analyze } = require('./loganalyze.js'), lagT = (analyze(L).lagSensor || { lag: 110 }).lag, O = r.out;
  const at = (t) => { let lo = 0, hi = O.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (O[m][0] <= t) lo = m; else hi = m; } return O[lo][1]; };
  const err = [], jumps = [];
  for (const f of r.fx) if (f[1] != null && f[1] >= 0 && f[0] > O[0][0] + 2000) { err.push(at(f[0] - lagT) - f[1]); if (f[1] > 2) jumps.push(Math.abs(f[2])); }
  const EngineCore = require('./engine.js'), e = new EngineCore(48000);
  e.msg({ k: 'out', o: EngineCore.outputs().i4hk, now: true }); e.msg({ k: 'profile', p: EngineCore.profiles().m4csl, now: true });
  e.msg({ k: 'cfg', vol: 0.8, burble: 0.7, exMode: 1, auto: true, idleOn: true }); e.msg({ k: 'start' }); e.msg({ k: 'mode', drive: true });
  const Lb = new Float32Array(128), Rb = new Float32Array(128), ev = []; let oi = 0;
  e.onEv = (x) => { if (x.k === 'up' || x.k === 'blip' || x.k === 'kick') ev.push([x.t, Math.sign(x.b - x.a)]); };
  for (let t = O[0][0]; t < O[O.length - 1][0]; t += 128 / 48) {
    while (oi + 1 < O.length && O[oi + 1][0] <= t) oi++;
    e.msg({ k: 'drive', v: O[oi][2], thr: O[oi][3], brake: O[oi][4] }); e.render(Lb, Rb, 128);
  }
  let hunt = 0; for (let k = 1; k < ev.length; k++) if (ev[k][1] !== ev[k - 1][1] && ev[k][0] - ev[k - 1][0] < 3) hunt++;
  return { rms: Math.sqrt(err.reduce((a, b) => a + b * b, 0) / err.length), jump: jumps.reduce((a, b) => a + b, 0) / jumps.length,
    lag: r.fx[r.fx.length - 1][3], lagT: lagT, shifts: ev.length, hunt: hunt, min: (O[O.length - 1][0] - O[0][0]) / 60000 };
}

// ---- kjørelogg: syntetisk tur gjennom den ekte fusjonen med opptak på, så loganalyze.js på loggen ----
async function logSim(browser, url, watch, lag) {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); watch(page);
  await page.addInitScript(() => { window.__T = 0; performance.now = () => window.__T; try { localStorage.clear(); } catch (e) {} });
  await page.goto(url); await page.waitForFunction(() => window.__m4.REC.ready);
  await page.evaluate(() => window.__m4.recSet(true));
  await sim(page, lag);
  const json = await page.evaluate(() => JSON.stringify(window.__m4.logData()));
  if (process.env.LOGOUT) fs.writeFileSync(process.env.LOGOUT + '-' + lag + '.json', json); // eksempel-logg for loganalyze.js
  // lagring i IndexedDB overlever omlasting
  const n1 = await page.evaluate(async () => { await window.__m4.recPersist(); return window.__m4.REC.n; });
  await page.reload(); await page.waitForFunction(() => window.__m4.REC.ready);
  const n2 = await page.evaluate(() => window.__m4.REC.n);
  await ctx.close();
  return { log: JSON.parse(json), bytes: json.length, n1, n2 };
}
function logChecks(r, lag) {
  const { analyze, report } = require('./loganalyze.js');
  const L = r.log, A = analyze(L);
  console.log('\nKJØRELOGG (syntetisk tur, GPS ' + lag + ' ms forsinket, ' + (r.bytes / 1e6).toFixed(2) + ' MB JSON):\n' + report(A));
  check('logg: format, kolonner og 10 rader i sekundet', L.format === 'lydmotor-logg' && L.version === 2 && A.rows > 1500 && Math.abs(A.rowMs - 100) <= 17 && ['aRaw', 'aLin', 'rot', 'vEst', 'thr', 'brk', 'dir', 'grade', 'rpm', 'gear', 'volDb'].every((k) => Array.isArray(L.s[k]) && L.s[k].length === A.rows), A.rows + ' rader, median ' + A.rowMs + ' ms');
  check('logg: hvert GPS-punkt er med, uten posisjon som standard', A.fixes >= 150 && L.gps.lat.every((x) => x === null) && L.pos === false, A.fixes + ' punkter');
  check('logg: lagret i IndexedDB og lest inn igjen etter omlasting', r.n1 > 0 && r.n2 === r.n1, r.n1 + ' -> ' + r.n2);
  const v1 = JSON.parse(JSON.stringify(L)); v1.version = 1; v1.ev = v1.ev.filter((e) => e[1] !== 'lag'); delete v1.state.lag; let A1 = null;
  try { A1 = analyze(v1); } catch (e) {}
  check('loganalyze: versjon 2 har appens målte GPS-forsinkelse (hendelser og tilstand), versjon 1 leses fortsatt', A.version === 2 && A.lagApp.length > 0 && typeof L.state.lag === 'number' && L.gpsLag === L.state.lag && A1 && A1.lagApp.length === 0 && A1.rows === A.rows, A.lagApp.length + ' målinger');
  check('loganalyze: forsinkelse per vindu og gjennom filtrene', A.lagWin.length > 2 && A.path.thr && A.path.thr.d > 10 && A.path.thr.d < 200, A.path.thr ? Math.round(A.path.thr.d) + ' ms' : '–');
  const ls = A.lagSensor, lf = A.lagFused;
  check('loganalyze: GPS-forsinkelse fra akselerometeret innen ±0,15 s', ls && Math.abs(ls.lag - lag) <= 150, ls ? Math.round(ls.lag) + ' ms' : '–');
  if (lag === 110) {
    check('loganalyze: GPS-forsinkelse fra fusjonert fart innen ±0,25 s', lf && Math.abs(lf.lag - lag) <= 250, lf ? Math.round(lf.lag) + ' ms' : '–');
    check('loganalyze: fartsfeil liten (rms < 0,6 m/s), ingen girjakt i data uten motor', A.speedErr.rms < 0.6 && A.dirChanges === 0, 'rms ' + A.speedErr.rms.toFixed(2));
  }
}

// ---- nye funksjoner på siden: Media Session, veistøy, innstillinger, per bil, bilderate, service worker, skjermbilder ----
async function features(browser, url, watch, port) {
  const shots = process.env.SHOTS; // mappe for skjermbilder
  const shot = async (p, name) => { if (shots) await p.screenshot({ path: path.join(shots, name + '.png') }); };
  // Media Session: handlerne fanges opp (Chrome viser dem ikke)
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, acceptDownloads: true }); const p = await ctx.newPage(); watch(p);
  await p.addInitScript(() => {
    if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); try { localStorage.clear(); } catch (e) {} }
    window.__msH = {}; const ms = navigator.mediaSession, o = ms.setActionHandler.bind(ms);
    ms.setActionHandler = (a, f) => { window.__msH[a] = f; o(a, f); };
  });
  await p.goto(url); await p.click('#startTest'); await p.waitForTimeout(600);
  const m1 = await p.evaluate(() => { const m = navigator.mediaSession.metadata; return { t: m && m.title, a: m && m.artist, art: m ? m.artwork.length : 0, st: navigator.mediaSession.playbackState, h: Object.keys(window.__msH).sort().join(',') }; });
  check('media: metadata (Lydmotor, bilnavn, to ikoner), spiller, play/pause/stop koblet', m1.t === 'Lydmotor' && /M4 CSL/.test(m1.a) && m1.art === 2 && m1.st === 'playing' && m1.h === 'pause,play,stop', JSON.stringify(m1));
  await p.evaluate(() => window.__m4.setCar('gt3'));
  const a2 = await p.evaluate(() => navigator.mediaSession.metadata.artist);
  check('media: bilbytte oppdaterer artist', /911 GT3/.test(a2), a2);
  await p.evaluate(() => window.__msH.pause()); await p.waitForTimeout(600);
  const m2 = await p.evaluate(() => { const M = window.__m4; M.sysTick(); return { g: M.st.master.gain.value, st: navigator.mediaSession.playbackState, keep: M.st.keep.paused, chip: document.querySelector('#chMute') ? document.querySelector('#chMute').textContent : '', run: M.st.ctx.state }; });
  check('media: pause demper mykt (master-gain), lydspor og lydkontekst går videre', m2.g < 0.01 && m2.st === 'paused' && !m2.keep && m2.run === 'running' && /Dempet/.test(m2.chip), JSON.stringify(m2));
  await p.click('#chMute'); await p.waitForTimeout(600);
  const m3 = await p.evaluate(() => ({ g: window.__m4.st.master.gain.value, st: navigator.mediaSession.playbackState }));
  check('media: trykk på Dempet (eller play) slår lyden på igjen', m3.g > 0.99 && m3.st === 'playing', JSON.stringify(m3));

  // veistøykompensasjon: kartlegging, glatting, tak, testmodus
  const vc = await p.evaluate(() => {
    const M = window.__m4, st = M.st, S = M.S, r = {}; let T = performance.now() + 1e6;
    M.vcTick(T);
    const run = (sec) => { for (let i = 0; i < sec * 4; i++) { T += 250; M.vcTick(T); } };
    document.querySelector('#vol').value = 0.8; st.vc = 2; st.mode = 'drive'; S.on = true; S.vEst = 120 / 3.6;
    run(1); r.after1 = st.vcDb; run(9); r.db120 = st.vcDb; r.vol = st.volSent; r.gain = st.gainSent;
    S.vEst = 60 / 3.6; run(10); r.db60 = st.vcDb;
    S.vEst = 200 / 3.6; st.vc = 3; document.querySelector('#vol').value = 1; run(10); r.capGain = st.gainSent; r.capVol = M.effVol();
    st.tunOn = true; r.tunK = M.tunK(); document.querySelector('#vol').value = 0.3; r.tunK3 = M.tunK(); document.querySelector('#vol').value = 1; st.tunOn = false;
    st.mode = 'test'; run(10); r.testDb = st.vcDb; r.testGain = st.gainSent;
    S.on = false; document.querySelector('#vol').value = 0.8; st.vc = 2; run(1);
    r.lim = M.store && 0; return r;
  });
  console.log('INFO veistøy: ' + JSON.stringify(vc));
  check('veistøy: Normal = +3,5 dB ved 120 km/t, +1,75 ved 60, glattet (63 % etter 1 s)', Math.abs(vc.db120 - 3.5) < 0.01 && Math.abs(vc.db60 - 1.75) < 0.02 && vc.after1 > 0.55 * 3.5 && vc.after1 < 0.7 * 3.5, vc.db120.toFixed(2) + ' / ' + vc.db60.toFixed(2) + ' / ' + vc.after1.toFixed(2));
  check('veistøy: +3,5 dB ved 120 km/t går som cfg gain 1,50 (før begrenseren), volumet 0,8 urørt', Math.abs(vc.gain - Math.pow(10, 3.5 / 20)) < 0.003 && vc.vol === 0.8, vc.gain.toFixed(3) + ' / ' + vc.vol);
  // i4hk: tak 0,84; i tunnel dempes tørr vei og klang så vol × tak × TUN_PK <= PEAK_MAX (TUN_PK 2,0; vol 1: 0,79 / (0,84 × 2,0) = 0,470), ingen demping når det er plass
  check('veistøy: Høy ved 200 km/t gir gain 1,78 og volum 1 (toppene holdes av begrenseren), tunneldemping 0,470 ved volum 1, 1 ved volum 0,3',
    Math.abs(vc.capGain - Math.pow(10, 5 / 20)) < 0.003 && vc.capVol === 1 && Math.abs(vc.tunK - 0.79 / (0.84 * 2.0)) < 1e-6 && vc.tunK3 === 1, vc.capGain.toFixed(3) + ' / ' + vc.capVol + ' / ' + vc.tunK.toFixed(3) + ' / ' + vc.tunK3);
  check('veistøy: testmodus går tilbake til 0 dB', vc.testDb < 0.01 && Math.abs(vc.testGain - 1) < 0.003, vc.testDb.toFixed(3));

  // skjermbilder av de nye delene: statusrad med brikker, innstillinger
  await p.evaluate(() => { const M = window.__m4; M.recSet(true); M.REC.dur = 754000; M.SW.ready = {}; M.setMuted(true); });
  await p.click('summary'); await p.waitForTimeout(200);
  await shot(p, 'status-393x852');
  await p.locator('#vcLbl').scrollIntoViewIfNeeded(); await shot(p, 'settings-veistoy-393x852');
  await p.locator('#logDl').scrollIntoViewIfNeeded(); await shot(p, 'settings-logg-393x852');
  await p.setViewportSize({ width: 852, height: 393 }); await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0)); await shot(p, 'status-852x393');
  await p.locator('#logDl').scrollIntoViewIfNeeded(); await shot(p, 'settings-logg-852x393');
  await p.setViewportSize({ width: 393, height: 852 });
  await p.evaluate(() => { const M = window.__m4; M.SW.ready = null; M.setMuted(false); M.recSet(false); M.REC.dur = 0; });

  // innstillinger: streng kontroll, eksport, import, ugyldig fil
  const cl = await p.evaluate(() => {
    const C = window.__m4.cleanCfg;
    return [JSON.stringify(C({ vol: 5, bur: 'x', foo: 1, car: 'nope', ex: 1.6, vc: -3, rec: 1, cars: { m4csl: { vol: -1, zz: 3, ex: 9 }, nope: { vol: 0.5 } } })),
      JSON.stringify(C(null)), JSON.stringify(C('tekst')), JSON.stringify(C({ cars: 5, tunAmt: NaN, idle: false })), JSON.stringify(C([1, 2]))];
  });
  check('innstillinger: ukjente nøkler forkastes, tall klemmes, kaster aldri', cl[0] === '{"vol":1,"ex":2,"vc":0,"cars":{"m4csl":{"vol":0,"ex":2}}}' && cl[1] === '{}' && cl[2] === '{}' && cl[3] === '{"idle":false}' && cl[4] === '{}', cl.join(' '));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cfgExp')]);
  const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('innstillinger: eksport gir JSON med format og innstillinger', exp.format === 'lydmotor-innstillinger' && exp.settings && exp.settings.car === 'gt3', dl.suggestedFilename());
  const imp = { format: 'lydmotor-innstillinger', version: 1, settings: { vol: 0.42, ex: 0, car: 'lfa', vc: 3, ukjent: true, cars: { m4csl: { vol: 0.33, ex: 2, bur: 0.1 } } } };
  await p.setInputFiles('#cfgFile', { name: 'inn.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imp)) }); await p.waitForTimeout(500);
  const im = await p.evaluate(() => ({ vol: +document.querySelector('#vol').value, car: window.__m4.st.car, ex: window.__m4.st.exMode, vc: window.__m4.st.vc, msg: document.querySelector('#cfgMsg').textContent, tele: window.__m4.st.tele.car }));
  check('innstillinger: import tar i bruk bil, volum, eksos og veistøy', im.vol === 0.42 && im.car === 'lfa' && im.ex === 0 && im.vc === 3 && /Importert/.test(im.msg) && im.tele === 'lfa', JSON.stringify(im));
  await p.setInputFiles('#cfgFile', { name: 'feil.json', mimeType: 'application/json', buffer: Buffer.from('{ikke json') }); await p.waitForTimeout(300);
  const bad = await p.evaluate(() => ({ msg: document.querySelector('#cfgMsg').textContent, vol: +document.querySelector('#vol').value }));
  check('innstillinger: ugyldig fil gir melding og endrer ingenting', /Kunne ikke lese/.test(bad.msg) && bad.vol === 0.42, bad.msg);
  // per bil: volum, eksos og burble huskes og hentes ved bilbytte
  const pc = await p.evaluate(() => {
    const M = window.__m4, vol = document.querySelector('#vol'), r = [];
    M.setCar('m4csl'); r.push(+vol.value, M.st.exMode); // fra import: 0.33 / 2
    M.setCar('vanqs'); r.push(+vol.value); // ingen forhåndsinnstilling: arver 0.33
    vol.value = 0.55; vol.dispatchEvent(new Event('input')); document.querySelector('[data-ex="1"]').click();
    M.setCar('m4csl'); r.push(+vol.value, M.st.exMode);
    M.setCar('vanqs'); r.push(+vol.value, M.st.exMode);
    return r.concat([JSON.stringify(M.store.get().cars.vanqs)]);
  });
  check('per bil: volum og eksos huskes per bil, ny bil arver', pc.slice(0, 7).join() === '0.33,2,0.33,0.33,2,0.55,1', pc.join(' '));
  await p.reload(); await p.waitForTimeout(300);
  const rl = await p.evaluate(() => ({ car: window.__m4.st.car, vol: +document.querySelector('#vol').value, ex: window.__m4.st.exMode }));
  check('per bil: lagret over omlasting', rl.car === 'vanqs' && rl.vol === 0.55 && rl.ex === 1, JSON.stringify(rl));
  await ctx.close();

  // gamle lagrede innstillinger (uten per bil) og en bil motoren ikke kjenner: ingen feil, M4 eller lagret bil
  const c3 = await browser.newContext(); const q = await c3.newPage(); watch(q);
  await q.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.clear(); localStorage.setItem('m4csl', JSON.stringify({ vol: 0.6, ex: 0, car: 'gt3', bur: 0.2 })); } });
  await q.goto(url);
  const mg = await q.evaluate(() => ({ car: window.__m4.st.car, vol: +document.querySelector('#vol').value, ex: window.__m4.st.exMode, acc: getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() }));
  check('migrering: gamle innstillinger leses (bil, volum, eksos)', mg.car === 'gt3' && mg.vol === 0.6 && mg.ex === 0 && mg.acc === '#ffd60a', JSON.stringify(mg));
  await q.evaluate(() => localStorage.setItem('lydmotor', JSON.stringify({ car: 'f812', cars: { f812: { vol: 0.3 } } })));
  await q.reload();
  const uk = await q.evaluate(() => { const P = EngineCore.profiles(); return { car: window.__m4.st.car, known: !!P.f812, tag: document.querySelector('#carTag').textContent, acc: getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() }; });
  check('ukjent bil (f812 før motorgrenen): faller tilbake uten feil', uk.known ? uk.car === 'f812' && uk.acc === '#d8001e' : uk.car === 'm4csl' && uk.acc === '#29b6ff', JSON.stringify(uk));
  await c3.close();

  // bilderate: 30 fps, 15 fps etter 20 s stillstand, tilbake ved trykk, 0 når skjult
  const c4 = await browser.newContext({ viewport: { width: 393, height: 852 } }); const f = await c4.newPage(); watch(f);
  await f.goto(url); await f.click('#startTest'); await f.waitForTimeout(1500);
  const frames = (ms) => f.evaluate((ms) => new Promise((res) => { const a = window.__m4.st.frames; setTimeout(() => res((window.__m4.st.frames - a) * 1000 / ms), ms); }), ms);
  const fFast = await frames(2000);
  await f.evaluate(() => { window.__m4.st.moveT = performance.now() - 21000; window.__m4.st.touchT = -1e9; });
  const fSlow = await frames(2000);
  await f.mouse.click(200, 300); const fBack = await frames(1000);
  await f.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  const fHid = await frames(1000);
  await f.evaluate(() => { delete document.hidden; });
  console.log('INFO bilderate: ' + [fFast, fSlow, fBack, fHid].map((x) => x.toFixed(1)).join(' / ') + ' bilder/s (i fart / stillstand > 20 s / etter trykk / skjult)');
  check('turteller: ~30 fps, ~15 fps i stillstand, 30 igjen ved trykk, 0 når skjult', fFast > 25 && fFast < 33 && fSlow > 12 && fSlow < 17 && fBack > 25 && fHid === 0);
  await c4.close();

  // service worker: forhåndslager, frakoblet oppstart, ny versjon (stille bytte eller «Ny versjon klar»)
  const c5 = await browser.newContext({ viewport: { width: 393, height: 852 } }); const w = await c5.newPage(); watch(w);
  await w.goto(url);
  await w.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  const build = await w.evaluate(() => window.__m4.BUILD);
  const ck = await w.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { ks, files: (await c.keys()).map((r) => r.url.split('/').pop()).sort() }; });
  check('sw: forhåndslager med byggets versjon (index, manifest, ikoner)', ck.ks.length === 1 && ck.ks[0] === 'lydmotor-' + build && ck.files.length === 7 && ck.files.includes('index.html'), ck.ks.join() + ' | ' + ck.files.join(' '));
  await c5.setOffline(true);
  await w.reload(); await w.click('#startTest'); await w.waitForTimeout(500);
  const off = await w.evaluate(async (port) => {
    const r = { started: window.__m4.st.started, build: window.__m4.BUILD };
    try { r.icon = (await fetch('icon-192.png')).ok; } catch (e) { r.icon = false; }
    try { await fetch('http://127.0.0.1:' + port + '/icon-192.png'); r.cross = 'svar'; } catch (e) { r.cross = 'feilet'; }
    return r;
  }, port);
  check('sw: frakoblet starter siden i testmodus, ikoner fra cache, annen opprinnelse røres ikke', off.started && off.build === build && off.icon && off.cross === 'feilet', JSON.stringify(off));
  await c5.setOffline(false);
  // nytt bygg (ny hash i både sw.js og index.html): siden er alt ny, arbeideren byttes stille og gammel cache slettes
  const html = fs.readFileSync(file, 'utf8'), swSrc = fs.readFileSync(path.join(path.dirname(file), 'sw.js'), 'utf8');
  OVR['index.html'] = html.split(build).join('nytt2'); OVR['sw.js'] = swSrc.split(build).join('nytt2');
  await w.reload(); await w.waitForTimeout(300);
  await w.evaluate(() => window.__m4.SW.reg.update());
  const keys = () => w.evaluate(async () => (await caches.keys()).join());
  for (let i = 0; i < 50 && (await keys()) !== 'lydmotor-nytt2'; i++) await w.waitForTimeout(200);
  const k2 = await w.evaluate(async () => ({ ks: (await caches.keys()).join(), build: window.__m4.BUILD, chip: !!window.__m4.SW.ready }));
  check('sw: nytt bygg gir ny cache-versjon og sletter den gamle, uten melding når siden alt er ny', k2.ks === 'lydmotor-nytt2' && k2.build === 'nytt2' && !k2.chip, JSON.stringify(k2));
  // enda et bygg mens den åpne siden er gammel: «Ny versjon klar», trykk laster på nytt
  OVR['sw.js'] = swSrc.split(build).join('nytt3');
  await w.click('#startTest'); await w.waitForTimeout(300);
  await w.evaluate(() => window.__m4.SW.reg.update());
  await w.waitForSelector('#chNew', { timeout: 15000 }).catch(() => {});
  const hasChip = await w.evaluate(() => (document.querySelector('#chNew') || {}).textContent || '');
  await shot(w, 'ny-versjon-393x852');
  check('sw: ny versjon mens siden er gammel gir brikken «Ny versjon klar»', /Ny versjon klar/.test(hasChip), hasChip);
  if (hasChip) {
    await Promise.all([w.waitForEvent('load', { timeout: 10000 }).catch(() => {}), w.click('#chNew')]);
    await w.waitForTimeout(500);
    const k3 = await w.evaluate(async () => ({ ks: (await caches.keys()).join(), started: window.__m4.st.started }));
    check('sw: trykk på brikken tar i bruk ny versjon og laster siden på nytt', k3.ks === 'lydmotor-nytt3' && !k3.started, JSON.stringify(k3));
  }
  delete OVR['index.html']; delete OVR['sw.js'];
  await c5.close();
}

// ---- veistøyløftets tak: verste topper før mykklipperen, gjennom sidens egen lydgraf (OfflineAudioContext) ----
// Hver bil: Bane, full burble, manuell, full gass i sperren, slipp (smell), gass igjen. Tørt og tunnel (klang 1,5).
async function peaks(browser, url, watch) {
  const ctx = await browser.newContext(); const p = await ctx.newPage(); watch(p);
  await p.goto(url);
  const res = await p.evaluate(async () => {
    const M = window.__m4, st = M.st, TUN = M.TUN, sr = 48000, out = [], P = EngineCore.profiles(), O = EngineCore.outputs();
    const cases = Object.keys(P).map((k) => [k, 'i4hk']).concat([['m4csl', 'std']]);
    for (const [car, o] of cases) {
      const e = new EngineCore(sr); e.msg({ k: 'out', o: O[o], now: true }); e.msg({ k: 'profile', p: P[car], now: true });
      e.msg({ k: 'cfg', vol: 1, burble: 1, exMode: 2, auto: false, idleOn: true }); e.msg({ k: 'start' });
      const n = sr * 6, L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0; i < n; i += 128) { const t = i / sr; e.msg({ k: 'in', thr: t < 3 || t > 4.5 ? 1 : 0, brake: 0 }); e.render(L.subarray(i, i + 128), R.subarray(i, i + 128), 128); }
      const r = { car: car, o: o, lim: O[o].lim };
      // samme kjøring med største veistøyløft (Høy, +5 dB før begrenseren): toppene skal ikke øke
      { const e2 = new EngineCore(sr); e2.msg({ k: 'out', o: O[o], now: true }); e2.msg({ k: 'profile', p: P[car], now: true });
        e2.msg({ k: 'cfg', vol: 1, gain: Math.pow(10, 5 / 20), burble: 1, exMode: 2, auto: false, idleOn: true }); e2.msg({ k: 'start' });
        const a = new Float32Array(128), b = new Float32Array(128); let pk = 0;
        for (let i = 0; i < n; i += 128) { const t = i / sr; e2.msg({ k: 'in', thr: t < 3 || t > 4.5 ? 1 : 0, brake: 0 }); e2.render(a, b, 128); for (let j = 0; j < 128; j++) pk = Math.max(pk, Math.abs(a[j]), Math.abs(b[j])); }
        r.boost = pk / O[o].lim; }
      for (const amt of [0, 1.5]) {
        const oac = new OfflineAudioContext(2, n, sr), b = oac.createBuffer(2, n, sr); b.getChannelData(0).set(L); b.getChannelData(1).set(R);
        const src = oac.createBufferSource(); src.buffer = b; M.buildGraph(oac, src); st.shaper.curve = null; // lineært: mål før klipperen
        const on = amt > 0; st.sendG.gain.value = on ? TUN.send : 0; st.wet.gain.value = on ? TUN.wet * amt : 0; st.dry.gain.value = on ? 1 + (TUN.dryBoost - 1) * Math.min(1, amt) : 1;
        src.start(); const buf = await oac.startRendering(); let pk = 0;
        for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; } }
        r[on ? 'tun' : 'dry'] = pk / O[o].lim;
      }
      // sidens volum og tunneldemping (tunK) for volum 0,2-1: tørt = vol × tak × topp/tak, i tunnel × tunK; verste tunneltopp
      st.outId = o; let worst = -99, ok = true; st.tunOn = true;
      for (let v = 0.2; v <= 1.0001; v += 0.05) {
        document.querySelector('#vol').value = v;
        const pk = M.effVol() * O[o].lim * M.tunK() * r.tun, base = v * O[o].lim * r.tun;
        if (pk > Math.min(base, M.PEAK_MAX) * 1.0005) ok = false;
        worst = Math.max(worst, 20 * Math.log10(pk));
      }
      st.tunOn = false; document.querySelector('#vol').value = 0.8; r.worstBoostDb = worst; r.ok = ok; out.push(r);
    }
    return { out: out, TUN_PK: M.TUN_PK };
  });
  await ctx.close();
  console.log('\nVEISTØY-TAK (topp/tak ved vol 1, Bane, full burble, sperre; verste topp med løft):');
  for (const r of res.out) console.log('INFO ' + r.car + '/' + r.o + ': tørt ' + r.dry.toFixed(4) + ' (med +5 dB løft ' + r.boost.toFixed(4) + '), tunnel ' + r.tun.toFixed(3) + ', verste tunneltopp med demping ' + r.worstBoostDb.toFixed(2) + ' dBFS');
  check('veistøy: motorens begrenser holder tørre topper på taket (≤ +0,05 %), også med største løft (+5 dB før begrenseren)', res.out.every((r) => r.dry <= 1.0005 && r.boost <= 1.0005), res.out.map((r) => r.dry.toFixed(4) + '/' + r.boost.toFixed(4)).join(' '));
  check('veistøy: tunnelklangens toppfaktor under TUN_PK (' + res.TUN_PK + ')', res.out.every((r) => r.tun <= res.TUN_PK), 'maks ' + Math.max(...res.out.map((r) => r.tun)).toFixed(3));
  check('tunnel: med sidens demping aldri over -2 dBFS før mykklipperen (volum 0,2-1, klang 1,5), og aldri høyere enn uten demping', res.out.every((r) => r.ok && r.worstBoostDb <= -1.99), 'verste ' + Math.max(...res.out.map((r) => r.worstBoostDb)).toFixed(2) + ' dBFS');
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();
  const errs = [];
  const watch = (p) => { p.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text())) errs.push(m.text()); }); };

  // 1) Siden: testmodus, så bytte til kjøremodus (sensorer skal slå seg på uten eget trykk). NO_UI=1 hopper over (for eldre bygg).
  if (!process.env.NO_UI) {
    const ctx = await browser.newContext(); await ctx.grantPermissions(['accelerometer', 'gyroscope']); const p = await ctx.newPage(); watch(p);
    await p.goto(url); await p.click('#startTest'); await p.waitForTimeout(1500);
    const a = await p.evaluate(() => ({ state: window.__m4.st.ctx && window.__m4.st.ctx.state, sys: document.querySelector('#stSys').textContent }));
    await p.click('#mDrive'); await p.waitForTimeout(800);
    const b = await p.evaluate(() => ({ on: window.__m4.S.on, btn: document.querySelector('#sensBtn').hidden, sys: document.querySelector('#stSys').textContent }));
    // kjørepanelet viser GPS-forsinkelsen: først startverdien (ikke målt), så en målt verdi
    const lagTxt = await p.evaluate(() => { const M = window.__m4, r = [], e = () => document.querySelector('#dpLag').textContent;
      M.S.tickT = 0; M.driveTick(); r.push(e()); M.S.lag = 110; M.S.lagOk = true; M.driveTick(); r.push(e()); return r; });
    check('side: kjørepanelet viser GPS-forsinkelsen', lagTxt[0] === 'ca. 0,12 s (ikke målt ennå)' && lagTxt[1] === 'ca. 0,11 s', lagTxt.join(' | '));
    if (process.env.SHOTS) { await p.setViewportSize({ width: 393, height: 852 }); await p.waitForTimeout(300); await p.locator('#dpLag').scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(process.env.SHOTS, 'kjorepanel-393x852.png') }); }
    const c = await p.evaluate(() => { const M = window.__m4; M.S.dir = 'R'; M.sysTick(); const t = document.querySelector('#stSys').textContent; M.S.dir = 'F'; M.sysTick(); return t; });
    check('side: statuslinjen viser "Rygger" i revers', /Rygger/.test(c), c);
    await p.click('summary'); await p.click('#calReset');
    check('side: testmodus starter, statuslinje vises', !!a.sys, 'lyd ' + a.state + ' | ' + a.sys);
    check('side: bytte til Kjør slår på sensorer uten eget trykk', b.on && b.btn, b.sys);
    await ctx.close();
    // bilvelgeren: alle profiler listes, og bytte til hver bil mens lyden går når motoren (telemetrien sier hvilken bil som kjører)
    const c2 = await browser.newContext({ viewport: { width: 393, height: 852 } }); const q = await c2.newPage(); watch(q);
    await q.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await q.goto(url); await q.click('#startTest'); await q.waitForTimeout(800);
    await q.click('summary'); await q.locator('#car').scrollIntoViewIfNeeded();
    const opts = await q.$$eval('#car option', (o) => o.map((x) => x.value));
    const want = await q.evaluate(() => Object.keys(EngineCore.profiles()));
    check('side: bilvelgeren lister alle bilene', want.every((k) => opts.includes(k)) && opts.length === want.length, opts.join(', '));
    const got = [];
    for (const k of want.slice(1).concat(want[0])) { await q.selectOption('#car', k); await q.waitForTimeout(500); got.push(k + '=' + (await q.evaluate(() => window.__m4.st.tele.car + ' ' + document.querySelector('#carTag').textContent))); }
    check('side: bytte bil mens lyden går (motoren melder ny bil og navnet øverst skifter)', got.every((g) => { const [k, rest] = g.split('='); return rest.startsWith(k + ' '); }), got.join(' | '));
    await q.selectOption('#car', process.env.SHOT_CAR || 'gt3'); await q.waitForTimeout(400);
    if (process.env.SHOT) await q.screenshot({ path: process.env.SHOT });
    await c2.close();
    await features(browser, url, watch, server.address().port);
    await peaks(browser, url, watch);
    for (const lag of [110, 1500]) logChecks(await logSim(browser, url, watch, lag), lag);
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
  // 4) GPS-forsinkelsen: bykjøring med kjent forsinkelse, og (valgfritt) eierens ekte logg
  const lr = await lagRuns(browser, url, watch);
  const dl = process.env.DRIVELOG && fs.existsSync(process.env.DRIVELOG) ? JSON.parse(fs.readFileSync(process.env.DRIVELOG, 'utf8')) : null;
  const rl = dl ? [await replayLog(browser, url, watch, dl, 0), await replayLog(browser, url, watch, dl, 1000)] : null;
  check('gps-forsinkelse: ingen konsollfeil', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close(); server.close();
  revReport(rv);
  lagReport(lr);
  if (!rl) console.log('INFO ekte kjørelogg: hoppet over (sett DRIVELOG=<fil>)');
  else if (!rl[0]) console.log('INFO ekte kjørelogg: ingen kalibrerte rader');
  else {
    const f = (r) => 'fartsfeil rms ' + r.rms.toFixed(2) + ' m/s, sprang ved GPS ' + r.jump.toFixed(2) + ' m/s, girskift ' + r.shifts + ', girjakt ' + r.hunt + ' (' + (r.hunt / r.min * 60).toFixed(0) + ' per time)';
    console.log('INFO ekte kjørelogg (' + rl[0].min.toFixed(1) + ' min, loggens forsinkelse ' + Math.round(rl[0].lagT) + ' ms): målt forsinkelse ' + Math.round(rl[0].lag) + ' ms: ' + f(rl[0]) + ' | fast 1,0 s: ' + f(rl[1]));
    check('ekte kjørelogg: målt forsinkelse innen ±0,1 s av loggens, fartsfeil og sagtann lavere enn med fast 1,0 s', Math.abs(rl[0].lag - rl[0].lagT) <= 100 && rl[0].rms < rl[1].rms && rl[0].jump < rl[1].jump);
  }

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
