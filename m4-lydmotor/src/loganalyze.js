// Analyse av en kjørelogg fra Lydmotor (Innstillinger › Kjørelogg › Last ned logg). Formatet: CLAUDE.md «Kjørelogg».
// Bruk: node m4-lydmotor/src/loganalyze.js lydmotor-logg-….json
// Skriver: GPS-forsinkelse (krysskorrelasjon av fartsendring mellom GPS-punkter mot fusjonert fart og mot integrert
// akselerometer), for hele turen og per vindu, appens egen måling (versjon 2: hendelsene 'lag'), fartsfeil, forsinkelsen
// gjennom filtrene fra akselerometer til motor, fordeling av gass og brems, girjakt, retningsskifter og hendelser.
// Leser versjon 1 og 2.
'use strict';

function interp(T, Y, t) { // lineær interpolasjon i en stigende tidsserie, NaN utenfor
  const n = T.length;
  if (!n || t < T[0] || t > T[n - 1]) return NaN;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  const a = Y[lo], b = Y[hi];
  if (a == null || b == null) return NaN;
  return T[hi] === T[lo] ? a : a + (b - a) * (t - T[lo]) / (T[hi] - T[lo]);
}
function pearson(a, b) {
  const n = a.length; if (n < 3) return NaN;
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}
const pct = (arr, p) => { if (!arr.length) return NaN; const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function analyze(L) {
  if (!L || L.format !== 'lydmotor-logg' || !L.s || !L.gps) throw new Error('ikke en Lydmotor-logg');
  const s = L.s, g = L.gps, T = s.t, n = T.length, R = { rows: n, fixes: g.t.length };
  R.durS = n ? (T[n - 1] - T[0]) / 1000 : 0;
  const dts = []; for (let i = 1; i < n; i++) dts.push(T[i] - T[i - 1]);
  R.rowMs = pct(dts, 0.5);
  // GPS-punkter med fart
  const fx = [];
  for (let i = 0; i < g.t.length; i++) if (g.good[i] === 1 && g.spd[i] != null && g.spd[i] >= 0) fx.push({ t: g.t[i], v: g.spd[i] });
  R.goodFixes = fx.length;
  const accs = g.acc.filter((x) => x != null);
  R.accMedian = pct(accs, 0.5);
  R.hdgShare = g.t.length ? g.hdg.filter((x) => x != null).length / g.t.length : NaN;
  // Integrert akselerometer (tyngdeseparert, langs fremover), NaN-rader teller som 0
  const cum = new Float64Array(n);
  const az = (i) => (s.aLin[i] == null ? 0 : s.aLin[i]), gap = new Float64Array(n); // gap: rader uten akselerasjon (før kalibrering) eller med rykk
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + (az(i - 1) + az(i)) / 2 * (T[i] - T[i - 1]) / 1000; // trapes
    gap[i] = gap[i - 1] + (s.aLin[i] == null || s.held[i] === 1 ? 1 : 0);
  }
  const xcorr = (delta, F) => { // GPS-fartsendring mellom to punkter mot signalets endring i samme vindu flyttet lag ms tilbake
    let best = null; const curve = []; F = F || fx;
    for (let lag = 0; lag <= 3000; lag += 50) {
      const a = [], b = [];
      for (let k = 1; k < F.length; k++) {
        const f0 = F[k - 1], f1 = F[k], dt = f1.t - f0.t;
        if (dt < 500 || dt > 2500) continue;
        const d = delta(f0.t - lag, f1.t - lag);
        if (isFinite(d)) { a.push(f1.v - f0.v); b.push(d); }
      }
      const r = pearson(a, b); curve.push([lag, r]);
      if (a.length >= 10 && isFinite(r) && (!best || r > best.r)) best = { lag: lag, r: r, n: a.length };
    }
    if (best) { // parabel gjennom toppen for bedre oppløsning enn 50 ms
      const i = curve.findIndex((c) => c[0] === best.lag), y0 = curve[i - 1], y2 = curve[i + 1];
      if (y0 && y2 && isFinite(y0[1]) && isFinite(y2[1])) { const den = y0[1] - 2 * best.r + y2[1]; if (den < 0) best.lag += 25 * (y0[1] - y2[1]) / den; }
    }
    return best;
  };
  const dSens = (t0, t1) => (interp(T, gap, t1 + 100) - interp(T, gap, t0 - 100) > 0 ? NaN : interp(T, cum, t1) - interp(T, cum, t0));
  R.lagFused = xcorr((t0, t1) => interp(T, s.vEst, t1) - interp(T, s.vEst, t0));
  R.lagSensor = xcorr(dSens);
  // per vindu (60 s, steg 30 s), bare punkter i fart (GPS-fart under 2 m/s er treg på iPhone): er forsinkelsen stabil?
  R.lagWin = [];
  for (let w0 = T[0]; n && w0 + 30000 < T[n - 1]; w0 += 30000) {
    const F = fx.filter((f) => f.t >= w0 && f.t < w0 + 60000 && f.v >= 2), b = xcorr(dSens, F);
    R.lagWin.push({ t: (w0 - T[0]) / 1000, n: F.length, lag: b ? b.lag : NaN, r: b ? b.r : NaN });
  }
  // appens egen måling (versjon 2): [t, est, r, brukt, ny verdi]
  R.lagApp = (L.ev || []).filter((e) => e[1] === 'lag' && e[2] && typeof e[2] === 'object').map((e) => ({ t: (e[0] - (n ? T[0] : e[0])) / 1000, est: e[2].est, r: e[2].r, use: e[2].use, lag: e[2].lag }));
  R.appLag = L.gpsLag; R.version = L.version || 1;
  // forsinkelse i filtrene (målt i loggen): rå akselerasjon -> gass, gass -> motorlast, fusjonert fart -> motorens fart
  const xc = (x, y, sel) => { // nivå-krysskorrelasjon, y forskjøvet 0-600 ms senere, 10 ms steg med parabeltopp
    let best = null; const c = [];
    for (let d = 0; d <= 600; d += 10) {
      const a = [], b = [];
      for (let i = 0; i < n; i++) if (sel(i) && x[i] != null) { const v = interp(T, y, T[i] + d); if (isFinite(v)) { a.push(x[i]); b.push(v); } }
      const r = pearson(a, b); c.push(r); if (a.length > 50 && isFinite(r) && (!best || r > best.r)) best = { d: d, r: r, i: c.length - 1 };
    }
    if (best && c[best.i - 1] != null && c[best.i + 1] != null) { const den = c[best.i - 1] - 2 * best.r + c[best.i + 1]; if (den < 0) best.d += 5 * (c[best.i - 1] - c[best.i + 1]) / den; }
    return best;
  };
  const mov = (i) => s.vEst[i] > 3 && s.held[i] !== 1;
  R.path = { thr: xc(s.aLin, s.thr, mov), load: s.load ? xc(s.thr, s.load, mov) : null, vEng: xc(s.vEst, s.vEng, mov) };
  // fartsfeil: fusjonert fart på tidspunktet GPS-målingen gjaldt (med estimert forsinkelse) minus GPS-fart
  const lag = R.lagSensor ? R.lagSensor.lag : R.lagFused ? R.lagFused.lag : (L.gpsLag || 1000);
  R.lagUsed = lag;
  const err = []; for (const f of fx) { const v = interp(T, s.vEst, f.t - lag); if (isFinite(v)) err.push(v - f.v); }
  const ae = err.map(Math.abs);
  R.speedErr = { n: err.length, mean: err.reduce((x, y) => x + y, 0) / (err.length || 1), rms: Math.sqrt(err.reduce((x, y) => x + y * y, 0) / (err.length || 1)), p95: pct(ae, 0.95), max: ae.length ? Math.max(...ae) : NaN };
  // gass og brems (bare i fart)
  const thr = [], brk = [];
  for (let i = 0; i < n; i++) if (s.vEst[i] > 0.5) { thr.push(s.thr[i] || 0); brk.push(s.brk[i] || 0); }
  const hist = (a) => { const h = new Array(10).fill(0); for (const x of a) h[Math.min(9, Math.max(0, Math.floor(x * 10)))]++; return h.map((c) => (a.length ? c / a.length : 0)); };
  R.thr = { n: thr.length, lift: thr.filter((x) => x < 0.05).length / (thr.length || 1), mean: thr.reduce((x, y) => x + y, 0) / (thr.length || 1), hist: hist(thr) };
  R.brk = { share: brk.filter((x) => x > 0.05).length / (brk.length || 1), max: brk.length ? Math.max(...brk) : 0, hist: hist(brk) };
  // girjakt: et girskift etterfulgt av et skift motsatt vei innen 3 s
  const ch = [];
  for (let i = 1; i < n; i++) if (s.gear[i] != null && s.gear[i - 1] != null && s.gear[i] !== s.gear[i - 1]) ch.push({ t: T[i], d: Math.sign(s.gear[i] - s.gear[i - 1]) });
  let hunt = 0; for (let k = 1; k < ch.length; k++) if (ch[k].d !== ch[k - 1].d && ch[k].t - ch[k - 1].t < 3000) hunt++;
  const moving = thr.length * (R.rowMs || 100) / 1000;
  R.shifts = ch.length; R.hunting = hunt; R.huntPerHour = moving > 0 ? hunt / (moving / 3600) : 0;
  // retning
  let dch = 0, rev = 0; for (let i = 1; i < n; i++) { if (s.dir[i] !== s.dir[i - 1]) dch++; if (s.dir[i] === -1) rev += (T[i] - T[i - 1]) / 1000; }
  R.dirChanges = dch; R.reverseS = rev;
  R.heldShare = n ? s.held.filter((x) => x === 1).length / n : 0;
  R.events = {}; for (const e of L.ev || []) { const k = e[1] === 'eng' ? 'eng ' + String(e[2]).split(' ')[0] : e[1]; R.events[k] = (R.events[k] || 0) + 1; }
  return R;
}

function report(R) {
  const f = (x, d) => (x == null || !isFinite(x) ? '–' : x.toFixed(d == null ? 2 : d));
  const lagS = (b) => (b ? f(b.lag / 1000) + ' s (r ' + f(b.r) + ', ' + b.n + ' par)' : '–');
  const app = R.lagApp.filter((x) => x.use), P = R.path, ms = (b) => (b ? Math.round(b.d) + ' ms (r ' + f(b.r) + ')' : '–');
  return [
    'Rader ' + R.rows + ' (' + f(R.durS / 60, 1) + ' min, median ' + f(R.rowMs, 0) + ' ms), GPS-punkter ' + R.fixes + ' (gode med fart ' + R.goodFixes + ', nøyaktighet median ' + f(R.accMedian, 1) + ' m, kurs ' + f(100 * R.hdgShare, 0) + ' %)',
    'GPS-forsinkelse: mot integrert akselerometer ' + lagS(R.lagSensor) + ', mot fusjonert fart ' + lagS(R.lagFused) + ' (appen brukte ' + f((R.appLag || 1000) / 1000) + ' s ved nedlasting' + (R.version < 2 ? ', fast' : '') + ')',
    'GPS-forsinkelse per 60 s (fart >= 2 m/s): ' + (R.lagWin.map((w) => Math.round(w.t) + ' s: ' + (isFinite(w.lag) && w.r >= 0.7 ? f(w.lag / 1000) + ' (r ' + f(w.r) + ')' : '–')).join(', ') || '–'),
    'Appens måling (' + R.lagApp.length + ' vinduer, ' + app.length + ' brukt): ' + (R.lagApp.length ? R.lagApp.map((x) => Math.round(x.t) + ' s ' + f(x.est / 1000) + (x.use ? '' : '*') + '>' + f(x.lag / 1000)).join(', ') + ' (* = forkastet)' : 'ingen (versjon 1 eller for lite fartsendring)'),
    'Filtre fra akselerometer til lyd (målt): akselerasjon -> gass ' + ms(P.thr) + ', gass -> motorlast ' + ms(P.load) + ', fart -> motorens fart ' + ms(P.vEng) + ' (10 Hz-logg, motoren melder hvert 30. ms); i koden: ' + FILTERS,
    'Fartsfeil (vEst ' + f(R.lagUsed / 1000) + ' s før GPS-punktet minus GPS): snitt ' + f(R.speedErr.mean) + ', rms ' + f(R.speedErr.rms) + ', 95 % ' + f(R.speedErr.p95) + ', maks ' + f(R.speedErr.max) + ' m/s (' + R.speedErr.n + ' punkter)',
    'Gass i fart: snitt ' + f(R.thr.mean) + ', slipp (< 0,05) ' + f(100 * R.thr.lift, 0) + ' %, fordeling per 0,1: ' + R.thr.hist.map((x) => f(100 * x, 0)).join(' '),
    'Brems i fart: ' + f(100 * R.brk.share, 1) + ' % av tiden, maks ' + f(R.brk.max) + ', fordeling: ' + R.brk.hist.map((x) => f(100 * x, 0)).join(' '),
    'Girskift ' + R.shifts + ', girjakt ' + R.hunting + ' (' + f(R.huntPerHour, 1) + ' per time i fart)',
    'Retningsskifter ' + R.dirChanges + ', i revers ' + f(R.reverseS, 1) + ' s, telefonen rykket ' + f(100 * R.heldShare, 1) + ' % av tiden',
    'Hendelser: ' + Object.keys(R.events).map((k) => k + ' ' + R.events[k]).join(', ')
  ].join('\n');
}

// Tidskonstanter mellom akselerometeret og lyden (main.js og engine.js), for rapporten
const FILTERS = 'aF 35 ms, gass 30 ms opp / 80 ms ned, motorens gass 22/40 ms, last 9 ms (et sprang i akselerasjonen gir 50 % last etter ca. 86 ms og 90 % etter ca. 165 ms), ' +
  'motorens fart 50 ms, turtall 20 ms; turbo 320 ms (38 % av lydstyrken, lite under 2000 o/min), slipp først etter 0,15 s; ' +
  'skift: treg gass 0,25 s, oppgir holdes 0,9 s og nedgir 0,3 s etter et skift; lydutgang: baseLatency + outputLatency (Bluetooth/CarPlay ukjent)';
module.exports = { analyze, report, interp };
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Bruk: node loganalyze.js <logg.json>'); process.exit(2); }
  console.log(report(analyze(JSON.parse(require('fs').readFileSync(file, 'utf8')))));
}
