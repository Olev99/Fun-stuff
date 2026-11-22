// Offline test- og demo-rigg for EngineCore. Bruk: node test.js [bil-id ...] | node test.js demo [bil-id]
const fs = require('fs');
const EngineCore = require('./engine.js');
const SR = 48000, N = 128;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < h; j++) {
        const a = i + j, b = a + h;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// ---- en "sesjon": motor + opptak + hendelseslogg ----
// Sess.prof / Sess.out: profil og utgang som alle nye sesjoner starter med (null = innebygd standard)
class Sess {
  constructor(cfg) {
    this.e = new EngineCore(SR);
    if (Sess.out) this.e.msg({ k: 'out', o: Sess.out, now: true });
    if (Sess.prof) this.e.msg({ k: 'profile', p: Sess.prof, now: true });
    this.e.msg(Object.assign({ k: 'cfg', vol: 1, burble: 0.7, exMode: 1, auto: true }, cfg || {}));
    this.L = []; this.R = []; this.ev = []; this.trace = []; this.t = 0;
    this.e.onEv = (x) => this.ev.push(x);
    this.bl = new Float32Array(N); this.br = new Float32Array(N);
    this.thr = 0; this.brake = 0; this.tunnel = []; // tunnel: per-blokk 0/1
    this.inTunnel = 0;
  }
  run(sec, thr, brake) {
    const blocks = Math.round(sec * SR / N);
    for (let b = 0; b < blocks; b++) {
      const th = typeof thr === 'function' ? thr(this.t) : thr, br = typeof brake === 'function' ? brake(this.t) : (brake || 0);
      this.e.msg({ k: 'in', thr: th, brake: br });
      this.e.render(this.bl, this.br, N);
      for (let i = 0; i < N; i++) { this.L.push(this.bl[i]); this.R.push(this.br[i]); }
      this.trace.push({ t: this.t, rpm: this.e.rpmS, gear: this.e.gear, v: this.e.v, load: this.e.load });
      this.tunnel.push(this.inTunnel);
      this.t += N / SR;
    }
    return this;
  }
  shift(d) { this.e.msg({ k: 'shift', d }); return this; }
  seg(t0, t1) { return this.L.slice(Math.round(t0 * SR), Math.round(t1 * SR)); }
  evs(k, t0, t1) { return this.ev.filter((x) => x.k === k && x.t >= (t0 || 0) && x.t < (t1 === undefined ? 1e9 : t1)); }
  rpmAt(t) { const i = Math.min(this.trace.length - 1, Math.max(0, Math.round(t * SR / N))); return this.trace[i].rpm; }
}

function stats(a) {
  let pk = 0, sq = 0, bad = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i]; if (!isFinite(x)) bad++; const ax = Math.abs(x); if (ax > pk) pk = ax; sq += x * x; }
  return { peak: pk, rms: Math.sqrt(sq / a.length), bad };
}
function spectrum(a, n) {
  n = n || 16384; const re = new Float64Array(n), im = new Float64Array(n), off = Math.max(0, a.length - n);
  for (let i = 0; i < n && i + off < a.length; i++) re[i] = a[i + off] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  fft(re, im);
  const mag = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) mag[i] = re[i] * re[i] + im[i] * im[i];
  return { mag, hz: SR / n };
}
function bandPct(sp) {
  const b = [0, 0, 0, 0, 0]; let tot = 0;
  for (let i = 2; i < sp.mag.length; i++) { const f = i * sp.hz, m = sp.mag[i]; b[f < 500 ? 0 : f < 2000 ? 1 : f < 5000 ? 2 : f < 10000 ? 3 : 4] += m; tot += m; }
  return b.map((x) => 100 * x / tot);
}
function linePow(sp, f, tol) { // effekt rundt f (± tol Hz)
  let s = 0; const i0 = Math.max(1, Math.floor((f - tol) / sp.hz)), i1 = Math.ceil((f + tol) / sp.hz);
  for (let i = i0; i <= i1; i++) s += sp.mag[i]; return s;
}
const dB = (x) => 20 * Math.log10(x + 1e-12);

// ---- tunnel: samme graf som i nettleseren, regnet offline ----
function convolve(x, h) {
  let n = 1; while (n < x.length + h.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  for (let i = 0; i < x.length; i++) ar[i] = x[i];
  for (let i = 0; i < h.length; i++) br[i] = h[i];
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i], im = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; ai[i] = -im; }
  fft(ar, ai);
  const out = new Float32Array(x.length + h.length);
  for (let i = 0; i < out.length; i++) out[i] = ar[i] / n;
  return out;
}
const TUN = { send: 0.9, wet: 0.28, dryBoost: 1.12, tauIn: 0.10, tauOut: 0.20, irDur: 3.4 };
function shelf(x, f, gdB, hi) { // enkel 1.-ordens hylle (tilnærmer BiquadFilter low/highshelf)
  const k = 1 - Math.exp(-2 * Math.PI * f / SR), g = Math.pow(10, gdB / 20) - 1; let lp = 0; const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { lp += k * (x[i] - lp); y[i] = x[i] + g * (hi ? x[i] - lp : lp); }
  return y;
}
function softClip(x) { const a = Math.abs(x); return a < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); }
function applyTunnel(s, amount) {
  const ir = EngineCore.tunnelIR(SR, TUN.irDur), n = s.L.length;
  const g = new Float32Array(n); let cur = 0;
  for (let i = 0; i < n; i++) { const tg = s.tunnel[Math.min(s.tunnel.length - 1, (i / N) | 0)]; cur += (tg - cur) * (1 - Math.exp(-1 / (SR * (tg > cur ? TUN.tauIn : TUN.tauOut)))); g[i] = cur; }
  const out = [new Float32Array(n), new Float32Array(n)]; let wetE = 0, clipN = 0;
  [s.L, s.R].forEach((ch, c) => {
    const snd = new Float32Array(n); for (let i = 0; i < n; i++) snd[i] = ch[i] * g[i] * TUN.send;
    let wet = convolve(snd, ir[c]); wet = shelf(shelf(wet, 250, 4, false), 3000, -6, true);
    for (let i = 0; i < n; i++) {
      const w = wet[i] * g[i] * TUN.wet * amount; wetE += w * w;
      const y = ch[i] * (1 + (TUN.dryBoost - 1) * g[i]) + w; if (Math.abs(y) > 0.8) clipN++;
      out[c][i] = softClip(y);
    }
  });
  return { L: out[0], R: out[1], g, clipFrac: clipN / (2 * n) };
}

function writeWav(path, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(path, buf);
}

// A-veiing (effekt) og fast driftspunkt: kjøremodus, låst gir, jevn fart og gass. Tone = effekt innen ±2,5 Hz fra hver halve orden
// (o/min / 120), støy = resten i 200-6000 Hz, begge A-veid. Gir lvA (A-veid nivå, dBFS), tn (støy mot tone, dB), hi (1,5-6 kHz mot alt, A).
const aW = (f) => { const f2 = f * f, r = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); return r * r * 1.585; };
function opPoint(p, o, rpm, thr, gear, cfg) {
  const e = new EngineCore(SR); e.msg({ k: 'out', o, now: true }); e.msg({ k: 'profile', p, now: true });
  e.msg(Object.assign({ k: 'cfg', vol: 1, burble: 0.7, exMode: 1, auto: false }, cfg || {})); e.msg({ k: 'mode', drive: true });
  const v = rpm / (e.ratios[gear] * e.finalDrive) * 2 * Math.PI * e.wheelR / 60, L = [], bl = new Float32Array(N), br = new Float32Array(N);
  for (let t = 0; t < 5; t += N / SR) { e.msg({ k: 'drive', v, thr, brake: 0 }); e.gear = gear; e.render(bl, br, N); if (t > 2.5) for (let i = 0; i < N; i++) L.push(0.5 * (bl[i] + br[i])); }
  const sp = spectrum(L, 65536), f0 = e.rpmS / 120; let h = 0, nz = 0, hi = 0, tw = 0, t0 = 0, ms = 0;
  for (let i = 1; i < sp.mag.length; i++) {
    const f = i * sp.hz, m = sp.mag[i] * aW(f); tw += m; t0 += sp.mag[i]; if (f >= 1500 && f < 6000) hi += m;
    if (f >= 200 && f < 6000) { if (Math.abs(f - Math.round(f / f0) * f0) < 2.5) h += m; else nz += m; }
  }
  for (const x of L) ms += x * x;
  return { lvA: 10 * Math.log10(ms / L.length * tw / t0), tn: 10 * Math.log10(nz / h), hi: 10 * Math.log10(hi / tw), rpm: e.rpmS };
}
// Bykjøring i kjøremodus (som kjøreloggen: rolig gass, små slipp fra lett gass, bremsing med nedgir på lavt turtall): antall smell
function cityPops(p, o, seed) {
  const e = new EngineCore(SR); e.msg({ k: 'out', o, now: true }); e.msg({ k: 'profile', p, now: true });
  e.msg({ k: 'cfg', vol: 1, burble: 0.7, exMode: 1, auto: true }); e.msg({ k: 'mode', drive: true }); if (seed) e.seed = seed;
  let n = 0, v = 0, t = 0; e.onEv = (x) => { if (x.k === 'pop') n++; }; const dt = N / SR, bl = new Float32Array(N), br = new Float32Array(N);
  const step = (sec, thr, acc, brake) => { for (let k = 0; k < sec / dt; k++) { v = Math.max(0, v + acc * dt); e.msg({ k: 'drive', v, thr, brake }); e.render(bl, br, N); t += dt; } };
  for (let c = 0; c < 6; c++) {
    const top = 9 + 2 * c; // 32-76 km/t
    step(top / 1.6, 0.25, 1.6, 0); step(4, 0.12, 0, 0);   // rolig opp, jevn fart
    step(1.5, 0.15, 0, 0); step(2.5, 0, -0.6, 0);         // slipp fra lett gass (0,15), rull
    step(2, 0.12, 0, 0); step(v / 2.2, 0, -2.2, 0);       // litt gass igjen, regenerering til stopp (i4: brems = 0, nedgir på lavt turtall)
    step(3, 0, 0, 0);
  }
  return n / (t / 60);
}

Sess.prof = null; Sess.out = null;
module.exports = { Sess, stats, spectrum, bandPct, linePow, dB, applyTunnel, writeWav, SR, N, TUN, EngineCore, opPoint, cityPops };

// =====================================================================
if (require.main === module) {
  const results = []; let fails = 0;
  const check0 = (name, ok, info) => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); if (!ok) fails++; };
  const f1 = (x) => (Math.round(x * 10) / 10).toString();

  const PROFS = EngineCore.profiles();
  if (process.argv[2] === 'demo') {
    const pid = process.argv[3] || 'm4csl'; Sess.prof = PROFS[pid];
    if (process.argv[4]) Sess.out = EngineCore.outputs()[process.argv[4]];
    const s = new Sess({ exMode: 1, burble: 0.8, vol: 1 });
    s.e.msg({ k: 'start' });
    s.run(3.0, 0);                                         // start + tomgang
    s.run(0.35, 0.5).run(0.5, 0).run(0.3, 0.8).run(0.9, 0); // to gasstøt i fri
    s.run(9.0, 1);                                         // full gass 1 -> 4
    s.run(2.4, 0);                                         // slipp: overrun med burble
    s.run(4.6, 0, 1);                                      // hard brems med mellomgass ned
    s.run(1.0, 0);
    s.run(3.2, 0.42);                                      // rolig akselerasjon, myke skift
    s.e.msg({ k: 'cfg', auto: false });
    s.run(2.6, 1);                                         // manuelt: holder giret til sperren
    s.shift(1); s.run(2.4, 1); s.shift(1); s.run(1.2, 1);
    s.inTunnel = 1;                                        // tunnel
    s.run(2.2, 1); s.run(1.3, 0);
    s.run(0.9, 0, 0.7); s.shift(-1); s.run(0.8, 0, 0.5); s.shift(-1); s.run(1.0, 0);
    s.run(2.6, 1);
    s.inTunnel = 0; s.run(1.2, 1);
    s.e.msg({ k: 'cfg', auto: true });
    s.run(1.8, 0); s.run(4.2, 0, 0.8); s.run(2.5, 0);
    const o = applyTunnel(s, 1);
    const fn = pid === 'm4csl' && !process.argv[4] ? 'demo.wav' : 'demo-' + pid + (process.argv[4] ? '-' + process.argv[4] : '') + '.wav';
    writeWav(__dirname + '/' + fn, o.L, o.R);
    const st = stats(o.L);
    console.log(fn, (o.L.length / SR).toFixed(1) + ' s', 'peak', st.peak.toFixed(3), 'rms', st.rms.toFixed(3), 'bad', st.bad, 'softclip-andel', (o.clipFrac * 100).toFixed(2) + '%');
    console.log(s.ev.filter((x) => x.k !== 'pop' && x.k !== 'done').map((x) => x.t.toFixed(2) + ':' + x.k + (x.b !== undefined ? ' ' + x.a + '>' + x.b : '')).join('  '));
    console.log('smell totalt:', s.evs('pop').length);
    process.exit(0);
  }

  // Hele pakken kjøres per bil. Terskler i o/min skaleres med rødsonen (R = rødsone / 7200), så M4 får de opprinnelige tallene.
  function suite(pid) {
  const p = PROFS[pid]; Sess.prof = p;
  const R = p.redline / 7200, rr = (x) => Math.round(x * R), cyl = p.cyl, pre = pid === 'm4csl' ? '' : '[' + p.short + '] ';
  const check = (name, ok, info) => check0(pre + name, ok, info);
  const res = {};
  // ---- 1. tomgang ----
  {
    const s = new Sess(); s.run(4, 0);
    const st = stats(s.seg(1, 4));
    check('tomgang: endelig og hørbar', st.bad === 0 && st.rms > 0.01 && st.peak < 0.5, 'rms ' + st.rms.toFixed(3) + ' peak ' + st.peak.toFixed(2) + ' rpm ' + Math.round(s.e.rpm));
    check('tomgang: turtall ' + (p.idle - 80) + '-' + (p.idle + 80), s.e.rpm > p.idle - 80 && s.e.rpm < p.idle + 80);
    res.idle = stats(s.seg(1.5, 4)).rms;
  }
  // ---- 2. start + full gass gjennom girene ----
  {
    const s = new Sess(); s.run(1, 0).run(24, 1);
    const all = stats(s.L);
    const ups = s.evs('up');
    check('WOT: ingen NaN/Inf', all.bad === 0);
    check('WOT: toppnivå < 0.9', all.peak < 0.9, 'peak ' + all.peak.toFixed(3));
    check('WOT: 5+ oppgir, i rekkefølge', ups.length >= 5 && ups.every((u, i) => u.a === i + 1 && u.b === i + 2), ups.map((u) => u.t.toFixed(1) + 's ' + u.a + '>' + u.b).join(', '));
    const kmh100 = s.trace.find((x) => x.v * 3.6 >= 100), kmh200 = s.trace.find((x) => x.v * 3.6 >= 200);
    check('WOT: 0-100 km/t ' + f1(p.acc100 - 0.4) + '-' + f1(p.acc100 + 1) + ' s', kmh100 && kmh100.t - 1 > p.acc100 - 0.4 && kmh100.t - 1 < p.acc100 + 1, kmh100 ? f1(kmh100.t - 1) + ' s; 0-200: ' + (kmh200 ? f1(kmh200.t - 1) + ' s' : '-') : 'nådde ikke');
    // oppgir-turtall og fall
    // forventet = neste girs turtall ved samme fart som målingen (bilen akselererer videre når skiftet ikke kutter helt, box.cut);
    // landetid 200 ms, eller lenger når girkassen med vilje glir sakte (Sport-oppgirtid > 0,21 s, Vanquish S sin ZF)
    let okTraj = true; const info = [], tLand = Math.max(0.2, p.box.hardT[1] * 0.85 + 0.02);
    const vAt = (t) => s.trace[Math.min(s.trace.length - 1, Math.max(0, Math.round(t * SR / N)))].v;
    for (const u of ups.slice(0, 5)) {
      const r0 = s.rpmAt(u.t - 0.01), r1 = s.rpmAt(u.t + tLand), exp = r0 * s.e.ratios[u.b] / s.e.ratios[u.a] * vAt(u.t + tLand) / vAt(u.t - 0.01);
      info.push(Math.round(r0) + '>' + Math.round(r1) + ' (forv. ' + Math.round(exp) + ')');
      if (r0 < rr(6800) || Math.abs(r1 - exp) > rr(260)) okTraj = false;
    }
    check('WOT-oppgir: skifter > ' + rr(6800) + ' og lander på neste girs turtall innen ' + Math.round(tLand * 1000) + ' ms', okTraj, info.join('; '));
    // smell i skiftevinduet
    const popsShift = ups.slice(0, 5).map((u) => s.evs('pop', u.t, u.t + 0.25).length);
    check('WOT-oppgir: 1-4 smell per skift', popsShift.every((c) => c >= 1 && c <= 4), popsShift.join(','));
    // nivådipp under tenningskutt
    const u2 = ups[1]; const pre = stats(s.seg(u2.t - 0.15, u2.t - 0.02)).rms, post = stats(s.seg(u2.t + 0.3, u2.t + 0.45)).rms;
    check('WOT-oppgir: nivå tilbake etter skift (±6 dB)', Math.abs(dB(post / pre)) < 6, f1(dB(post / pre)) + ' dB');
    // tenningsfrekvens og spektrum ved faste turtall
    const tf = [];
    const m4 = new Sess({ auto: false }); m4.run(0.5, 0).run(1.7, 1); m4.shift(1); m4.run(0.4, 0.2); m4.shift(1); m4.run(0.4, 0.2); m4.shift(1); m4.run(0.5, 0.2);
    const tm4 = m4.t; m4.run(16, 1);
    let okFire = true, okBand = true, lv = [];
    for (const target of [3000, 4000, 5000, 6000, 6800].map(rr)) {
      // finn et øyeblikk i 3. gir eller høyere der turtallet passerer target under last
      const i = m4.trace.findIndex((x) => x.gear === 4 && x.load > 0.9 && x.t > tm4 + 0.6 && Math.abs(x.rpm - target) < 25);
      if (i < 0) { okFire = false; tf.push(target + ': ikke funnet'); continue; }
      const t = m4.trace[i].t, seg = m4.seg(t - 0.045, t + 0.045), sp = spectrum(seg, 4096), rpm = m4.trace[i].rpm, ff = rpm / 60 * cyl / 2;
      const tol = Math.max(8, ff * 0.06);
      const pF = linePow(sp, ff, tol);
      let mx = 0; for (let k = 3; k < sp.mag.length; k++) if (sp.mag[k] > mx) mx = sp.mag[k];
      let pMax = 0, fMax = 0; for (let f = 25; f < 3000; f += sp.hz) { const p = linePow(sp, f, tol); if (p > pMax) { pMax = p; fMax = f; } }
      const rel = 10 * Math.log10(pF / pMax);
      const bp = bandPct(sp), st = stats(seg);
      lv.push(dB(st.rms));
      tf.push(Math.round(rpm) + ': f_tenn ' + Math.round(ff) + ' Hz rel ' + f1(rel) + ' dB (maks ved ' + Math.round(fMax) + '), bånd ' + bp.map((x) => f1(x)).join('/') + ', rms ' + f1(dB(st.rms)) + ' dB');
      if (rel < -8) okFire = false;
      if (bp[0] + bp[1] < 88 || bp[3] + bp[4] > 3 || bp[2] < 0.15) okBand = false;
    }
    res.wot = lv.reduce((a, b) => a + b, 0) / lv.length;
    check('WOT: tenningsfrekvens (o/min / ' + (120 / cyl) + ') er blant de sterkeste linjene (innen 8 dB)', okFire, '\n      ' + tf.join('\n      '));
    check('WOT: spektral balanse (>=88 % under 2 kHz, rasp 2-5 kHz til stede, <3 % over 5 kHz)', okBand);
    check('WOT: jevnt nivå ' + rr(2000) + '-' + rr(6800) + ' o/min (spenn < 9 dB)', Math.max(...lv) - Math.min(...lv) < 9, 'spenn ' + f1(Math.max(...lv) - Math.min(...lv)) + ' dB');
  }
  // ---- 3. myke skift på lett gass ----
  {
    const s = new Sess(); s.run(1, 0).run(14, 0.3);
    const ups = s.evs('up');
    const pops = s.evs('pop').length;
    const rs = ups.map((u) => Math.round(s.rpmAt(u.t - 0.01)));
    check('lett gass: skifter tidlig (' + rr(2500) + '-' + rr(4200) + ') uten smell', ups.length >= 3 && rs.every((r) => r > rr(2300) && r < rr(4300)) && pops === 0, 'oppgir ved ' + rs.join(',') + ' smell ' + pops);
    const dn = s.evs('blip').length + s.evs('kick').length;
    check('lett gass: ingen girjakt (0 nedgir)', dn === 0, 'nedgir ' + dn);
  }
  // ---- 4. slipp ved høyt turtall (overrun) ----
  {
    const s = new Sess({ auto: false }); s.run(0.5, 0).run(1.2, 1); s.shift(1); s.run(1.9, 1); s.shift(1); s.run(0.4, 1);
    while (s.e.rpm < rr(6500) && s.t < 20) s.run(0.02, 1);
    const tL = s.t, rL = s.e.rpm; s.run(4, 0);
    const pre = stats(s.seg(tL - 0.2, tL)), a = stats(s.seg(tL + 0.25, tL + 0.6));
    const p01 = s.evs('pop', tL, tL + 1.5).length, p23 = s.evs('pop', tL + 2.5, tL + 4).length;
    check('slipp: løftet ved ~' + rr(6500), rL > rr(6400) && s.evs('lift', tL).length === 1, 'rpm ' + Math.round(rL));
    // slippet krever 0,15 s under 0,05 (mot holderstøy), men et ekte slipp skal fortsatt gi overrun og første smell raskt
    { const l = s.evs('lift', tL)[0], pp = s.evs('pop', tL)[0], dl = l ? l.t - tL : 9, dp = pp ? pp.t - tL : 9;
      check('slipp: overrun innen 0,2 s og første smell innen 0,25 s etter slippet', dl <= 0.2 && dp <= 0.25, 'overrun etter ' + Math.round(dl * 1000) + ' ms, første smell etter ' + Math.round(dp * 1000) + ' ms'); }
    const z = new Sess({ auto: false, burble: 0 }); z.run(0.5, 0).run(1.2, 1); z.shift(1); z.run(1.9, 1); z.shift(1); z.run(0.4, 1);
    while (z.e.rpm < rr(6500) && z.t < 20) z.run(0.02, 1);
    const tz = z.t; z.run(1, 0);
    const zd = dB(stats(z.seg(tz + 0.25, tz + 0.6)).rms / stats(z.seg(tz - 0.2, tz)).rms);
    check('slipp: grunnlyden (uten burble) faller > 12 dB', zd < -12, f1(zd) + ' dB');
    // V12-ene og GT3: opptak av seriebilene gir nesten ingen smell ved slipp, så de har svake smell (lav popK) og et roligere overrun
    // (nedre grense -20 dB i stedet for -16); for alle biler må burble fortsatt løfte overrun minst 8 dB over overrun uten burble
    const ovLo = ['vanqs', 'v12vs', 'f12', 'gt3', 'f812', 'gt3rs4'].includes(pid) ? -20 : -16, ovD = dB(a.rms / pre.rms);
    check('slipp: med burble ligger overrun 4-' + (-ovLo) + ' dB under full gass, minst 8 dB over overrun uten burble', ovD < -4 && ovD > ovLo && ovD - zd >= 8, f1(ovD) + ' dB (uten burble ' + f1(zd) + ' dB)');
    // forventet antall følger bilens burble-mengde i Sport (M4 = 5)
    const minP = Math.max(2, Math.round(5 * Math.min(1, p.ovr.mode[1] * p.ovr.rate * p.popK / (0.8 * 13))));
    check('slipp: burble samlet tidlig (>=' + minP + ' smell første 1.5 s, færre senere)', p01 >= minP && p23 < p01 * 0.6, 'første 1.5 s: ' + p01 + ', 2.5-4 s: ' + p23);
    const hiP = (seg) => { const sp = spectrum(seg, 8192); return linePow(sp, 3500, 1500); };
    const dRasp = 10 * Math.log10(hiP(s.seg(tL + 0.3, tL + 0.6)) / hiP(s.seg(tL - 0.2, tL)));
    const dRaspZ = 10 * Math.log10(hiP(z.seg(tz + 0.3, tz + 0.6)) / hiP(z.seg(tz - 0.2, tz)));
    check('slipp: raspen (2-5 kHz) faller > 10 dB (uten burble)', dRaspZ < -10, f1(dRaspZ) + ' dB; med burble ' + f1(dRasp) + ' dB');
    // komfort: nesten ingen burble. Smellene er tilfeldige (V12 Vantage S: ca. 1,2 i snitt, over 3 i ca. 1 av 40 frø), så kravet gjelder
    // medianen av tre frø (standardfrøet og to til), ikke ett enkelt trekk
    const kp = [0x1234567, 8919, 16838].map((sd) => {
      const c = new Sess({ auto: false, exMode: 0 }); c.e.seed = sd; c.run(0.5, 0).run(1.2, 1); c.shift(1); c.run(1.9, 1); c.shift(1); c.run(0.4, 1);
      while (c.e.rpm < rr(6500) && c.t < 20) c.run(0.02, 1);
      const tc = c.t; c.run(3, 0); return c.evs('pop', tc).length; });
    const kMed = kp.slice().sort((a, b) => a - b)[1];
    check('komfort: lite burble (median av tre frø <= 3 smell)', kMed <= 3, 'smell ' + kp.join('/') + ' (sport: ' + s.evs('pop', tL).length + ')');
  }
  // ---- 5. brems fra 200 km/t med automatiske nedgir ----
  {
    const s = new Sess(); s.run(0.5, 0);
    while (s.e.v * 3.6 < 200 && s.t < 30) s.run(0.05, 1);
    s.run(1.0, 0.25);
    const tB = s.t, g0 = s.e.gear; s.run(7, 0, 0.9);
    const bl = s.evs('blip', tB);
    let ok = bl.length >= 3, info = [];
    for (const b of bl) {
      if (b.b < 2) continue;
      const r0 = s.rpmAt(b.t - 0.005); let tHit = -1, peak = 0;
      const v = s.trace[Math.round((b.t + 0.13) * SR / N)].v;
      const target = v / (2 * Math.PI * s.e.wheelR) * 60 * s.e.finalDrive * s.e.ratios[b.b];
      for (let t = b.t; t < b.t + 0.2; t += N / SR) { const r = s.rpmAt(t); if (r > peak) peak = r; if (tHit < 0 && r >= target * 0.97) tHit = t - b.t; }
      info.push(b.a + '>' + b.b + ': ' + Math.round(r0) + '>' + Math.round(peak) + ' på ' + (tHit < 0 ? '?' : Math.round(tHit * 1000)) + ' ms');
      if (target > rr(2500) && (tHit < 0 || tHit > 0.13 || peak - r0 < 500 || peak > p.redline)) ok = false;
    }
    check('brems 200->0: >=3 mellomgass-nedgir, turtallet hopper opp til målgir innen 130 ms', ok, 'fra gir ' + g0 + ': ' + info.join('; '));
    const gaps = bl.slice(1).map((b, i) => b.t - bl[i].t);
    check('brems: nedgir kommer enkeltvis (>=0.3 s mellom)', gaps.every((g) => g >= 0.3), gaps.map((g) => f1(g)).join(','));
    const withPop = bl.filter((b) => b.b >= 2 && s.evs('pop', b.t, b.t + 0.35).length > 0).length;
    check('brems: smell etter mellomgass på de fleste nedgir', withPop >= Math.min(3, bl.length - 1), withPop + ' av ' + bl.length);
    // blippen skal høres: nivå under blip vs rett før
    const b = bl[0]; const q0 = stats(s.seg(b.t - 0.12, b.t - 0.01)).rms, q1 = stats(s.seg(b.t + 0.01, b.t + 0.14)).rms;
    check('brems: mellomgassen høres (>= +6 dB mot overrun rett før)', dB(q1 / q0) > 6, f1(dB(q1 / q0)) + ' dB');
    { const bb = bl.find((x) => x.b >= 3) || bl[0]; const w = stats(s.seg(bb.t + 0.03, bb.t + 0.15)).rms; const near = (g) => s.trace.findIndex((x) => x.load > 0.9 && x.gear >= g && Math.abs(x.rpm - s.rpmAt(bb.t + 0.1)) < 150); let i = near(3); if (i < 0) i = near(2); const ref = i < 0 ? 1 : stats(s.seg(s.trace[i].t, s.trace[i].t + 0.1)).rms;
      check('brems: mellomgassen ligger innen 8 dB av full gass ved samme turtall', i >= 0 && dB(w / ref) > -8, i < 0 ? 'fant ikke full gass ved ' + Math.round(s.rpmAt(bb.t + 0.1)) : f1(dB(w / ref)) + ' dB'); }
    check('brems: stopper i 1. gir på tomgang', s.e.v < 0.5 && s.e.gear === 1 && s.e.rpm < p.idle + 120, 'v ' + f1(s.e.v) + ' gir ' + s.e.gear + ' rpm ' + Math.round(s.e.rpm));
    check('brems: ingen NaN, peak < 0.9', stats(s.L).bad === 0 && stats(s.L).peak < 0.9, 'peak ' + stats(s.L).peak.toFixed(3));
  }
  // ---- 6. manuelle padleskift ----
  {
    const s = new Sess({ auto: false }); s.run(0.5, 0).run(1.3, 1); s.shift(1); s.run(1.5, 1); s.shift(1); s.run(1.5, 1); s.shift(1); s.run(2.5, 1); s.shift(1); s.run(3.2, 0, 0.6).run(0.5, 0.3);
    const g = s.e.gear, r0 = s.e.rpm, t0 = s.t;
    s.run(0.3, 0); s.shift(-1); s.run(0.02, 0);
    const started = s.evs('blip', t0).length === 1;
    s.run(0.4, 0);
    const r1 = s.rpmAt(t0 + 0.3 + 0.13), exp = s.rpmAt(t0 + 0.29) * s.e.ratios[g - 1] / s.e.ratios[g];
    check('padle ned: starter i samme blokk, turtall på mål innen 130 ms', started && Math.abs(r1 - exp) < 300 && s.e.gear === g - 1, Math.round(s.rpmAt(t0 + 0.29)) + ' > ' + Math.round(r1) + ' (forv. ' + Math.round(exp) + ')');
    // to raske nedgir etter hverandre (kø)
    const t1 = s.t; s.shift(-1); s.run(0.03, 0); s.shift(-1); s.run(0.6, 0);
    check('padle ned x2 raskt: begge utføres', s.evs('blip', t1).length === 2 && s.e.gear === g - 3, 'gir ' + s.e.gear);
    // overturtallsvern
    const s2 = new Sess({ auto: false }); s2.run(0.5, 0).run(1.3, 1); s2.shift(1); s2.run(1.8, 1);
    while (s2.e.rpm * s2.e.ratios[1] / s2.e.ratios[2] < p.lim.deny + rr(150) && s2.t < 10) s2.run(0.05, 1); // høyt nok til at 1. gir gir overturtall
    const gg = s2.e.gear; s2.shift(-1); s2.run(0.1, 1);
    check('padle ned nektes når det gir overturtall', s2.evs('deny').length === 1 && s2.e.gear === gg, 'rpm ' + Math.round(s2.e.rpm));
  }
  // ---- 7. turtallssperre ----
  {
    const s = new Sess({ auto: false }); s.run(0.5, 0).run(4.5, 1);
    const tr = s.trace.filter((x) => x.t > 3.5);
    const mx = Math.max(...tr.map((x) => x.rpm)), mn = Math.min(...tr.map((x) => x.rpm));
    const pops = s.evs('pop', 3.5).length;
    // lim.pop (myk sperre med færre smell, V12-ene og GT3): med vilje færre smell, så kravet er >= 2 i stedet for >= 5
    const minLimP = p.lim.pop === undefined ? 5 : 2;
    check('sperre: holder ' + (p.lim.on - 180) + '-' + (p.lim.max + 5) + ' i 1. gir med flagring og >= ' + minLimP + ' smell', s.e.gear === 1 && mx <= p.lim.max + 5 && mn > p.lim.on - 230 && mx - mn > 60 && pops >= minLimP, 'rpm ' + Math.round(mn) + '-' + Math.round(mx) + ', smell på 1,5 s ' + pops);
    const seg = s.seg(3.5, 5), env = []; for (let i = 0; i + 240 < seg.length; i += 240) env.push(stats(seg.slice(i, i + 240)).rms);
    const eMax = Math.max(...env), eMin = Math.min(...env);
    check('sperre: hørbar av/på-flagring (> 6 dB modulasjon)', dB(eMax / eMin) > 6, f1(dB(eMax / eMin)) + ' dB');
  }
  // ---- 8. kickdown ----
  {
    const s = new Sess(); s.run(0.5, 0).run(9, 0.3).run(2, 0.15);
    const g = s.e.gear, t0 = s.t; s.run(1.0, 1);
    const k = s.evs('kick', t0);
    check('kickdown: hopper ned flere gir og havner på ' + rr(4000) + '-' + rr(6400), k.length >= 1 && g - s.e.gear >= 2 && s.rpmAt(t0 + 0.5) > rr(4000) && s.rpmAt(t0 + 0.5) < rr(6500), 'gir ' + g + '>' + s.e.gear + ' rpm ' + Math.round(s.rpmAt(t0 + 0.5)));
  }
  // ---- 9. kjøremodus (ekstern fart) ----
  {
    const s = new Sess(); s.e.msg({ k: 'mode', drive: true });
    let v = 0; const dt = N / SR;
    for (let t = 0; t < 30; t += dt) {
      const acc = t < 10 ? 3 : t < 16 ? 0 : t < 24 ? -4 : 0; v = Math.max(0, v + acc * dt);
      s.e.msg({ k: 'drive', v, thr: acc > 0 ? 0.4 : 0, brake: acc < -1 ? 0.4 : 0 }); s.e.render(s.bl, s.br, N);
      for (let i = 0; i < N; i++) s.L.push(s.bl[i]);
      s.t += dt;
    }
    const st = stats(s.L);
    check('kjøremodus: skifter opp og ned av seg selv, ender på tomgang', s.evs('up').length >= 3 && s.evs('blip').length >= 2 && s.e.rpm < p.idle + 120 && st.bad === 0 && st.peak < 0.9, 'opp ' + s.evs('up').length + ' ned ' + s.evs('blip').length + ' peak ' + st.peak.toFixed(2));
  }
  // ---- 9b. girvakter: brått fartsfall til stillstand (kjøremodus) og slipp med rulling (auto) ----
  {
    const s = new Sess(); s.e.msg({ k: 'mode', drive: true }); const dt = N / SR;
    for (let t = 0; t < 12; t += dt) { const v = t < 8 ? Math.min(25, t * 4) : t < 9 ? 25 * (9 - t) : 0;
      s.e.msg({ k: 'drive', v, thr: t < 6 ? 0.5 : 0, brake: 0 }); s.e.render(s.bl, s.br, N); s.t += dt; }
    check('girvakt: brått fartsfall til stillstand ender i 1. gir på tomgang', s.e.gear === 1 && s.e.rpm < p.idle + 120, 'gir ' + s.e.gear + ' rpm ' + Math.round(s.e.rpm));
    // turtallet skal aldri dykke under tomgang mens motoren går: rampe ned på 1 s og fall rett til 0, auto og manuell
    let minR = 1e9; const info = [];
    for (const auto of [true, false]) for (const inst of [false, true]) {
      const z = new Sess({ auto }); z.e.msg({ k: 'mode', drive: true }); let mn = 1e9;
      for (let t = 0; t < 12; t += dt) { const v = t < 8 ? Math.min(25, t * 4) : inst || t >= 9 ? 0 : 25 * (9 - t);
        z.e.msg({ k: 'drive', v, thr: t < 6 ? 0.5 : 0, brake: 0 }); z.e.render(z.bl, z.br, N); if (t > 1) mn = Math.min(mn, z.e.rpm); }
      minR = Math.min(minR, mn); info.push((auto ? 'auto' : 'man') + (inst ? ' brått' : ' rampe') + ' ' + Math.round(mn));
    }
    check('girvakt: turtallet under fartsfall til stillstand holder seg over ' + Math.round(p.idle * 0.95), minR >= p.idle * 0.95, info.join(', '));
    const c = new Sess(); c.run(0.5, 0).run(6, 0.7); const g0 = c.e.gear, t0 = c.t, rL = c.e.rpm; c.run(8, 0);
    const tr = c.trace.filter((x) => x.t > t0 + 0.5 && x.v > 3), lo = Math.min(...tr.map((x) => x.rpm)), hi = Math.max(...tr.map((x) => x.rpm));
    // korte gir (GT3) kan stå høyere enn rr(4700) når føreren slipper; da skal turtallet bare ikke stige etter slippet
    check('girvakt: slipp og rull holder turtallet fornuftig (' + rr(1200) + '-' + rr(4700) + ', eller under slipp-turtallet)', lo > rr(1200) && hi < Math.max(rr(4700), rL + 50),
      'gir ' + g0 + '>' + c.e.gear + ', slipp ved ' + Math.round(rL) + ', rpm ' + Math.round(lo) + '-' + Math.round(hi));
  }
  // ---- 9c. full gass gjennom alle gir, rulling ned fra toppfart, støyete fart i kjøremodus ----
  {
    const s = new Sess(); s.run(1, 0);
    // toppgiret: første gir der toppfarten gir lavere turtall enn oppgirpunktet (overgir brukes ikke på full gass)
    const k = 60 / (2 * Math.PI * s.e.wheelR) * s.e.finalDrive; let gTop = 1; while (gTop < s.e.nG && p.vmax * k * s.e.ratios[gTop] > s.e.K.wot) gTop++;
    while (s.e.gear < gTop && s.t < 60) s.run(0.5, 1);
    s.run(3, 1);
    const ups = s.evs('up'), rs = ups.map((u) => Math.round(s.rpmAt(u.t - 0.01)));
    check('alle gir: full gass fra stillstand gjennom alle gir til ' + gTop + '. (toppfart), hvert oppgir > ' + rr(6800) + ', ingen nedgir',
      s.e.gear === gTop && ups.length === gTop - 1 && ups.every((u, i) => u.a === i + 1 && u.b === i + 2) && rs.every((r) => r > rr(6800)) && s.evs('kick').length + s.evs('blip').length === 0,
      ups.map((u, i) => u.a + '>' + u.b + '@' + rs[i] + ' (' + f1(u.t) + ' s)').join(', ') + '; topp ' + Math.round(s.e.v * 3.6) + ' km/t, ' + Math.round(s.e.rpm) + ' o/min');
    // slipp ved toppfart og rull lenge (rullenedgir), så brems (bremsenedgir) til stillstand
    const t0 = s.t; s.run(100, 0); const t1 = s.t; s.run(12, 0, 0.6);
    const dn = s.evs('blip', t0).concat(s.evs('kick', t0)), dnC = dn.filter((x) => x.t < t1), tr = s.trace.filter((x) => x.t > t0 + 0.3 && x.v > 3);
    const lo = Math.min(...tr.map((x) => x.rpm)), hi = Math.max(...tr.map((x) => x.rpm));
    check('rulling fra toppfart og brems: nedgir ett og ett med mellomgass (>= 2 under ren rulling), turtall ' + (p.idle - 50) + '-' + p.redline + ', stopper i 1. gir',
      dnC.length >= 2 && dn.every((x) => x.k === 'blip' && x.b === x.a - 1) && lo > p.idle - 50 && hi < p.redline && s.e.gear === 1 && s.e.v < 0.5,
      'nedgir ' + dn.map((x) => x.a + '>' + x.b + '@' + f1(x.t - t0)).join(' ') + ' (brems fra ' + f1(t1 - t0) + ' s, ' + Math.round(s.trace[Math.round(t1 * SR / N) - 1].v * 3.6) + ' km/t); rpm ' + Math.round(lo) + '-' + Math.round(hi) + '; slutt gir ' + s.e.gear);
    // GPS-lignende fart: trinn hvert sekund + støy, jevn lett gass i 20 m/s
    const d = new Sess(); d.e.msg({ k: 'mode', drive: true }); const dt = N / SR; let seed = 99, vG = 0, nx = 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
    for (let t = 0; t < 40; t += dt) {
      const vT = Math.min(20, t * 2.5); if (t >= nx) { nx += 1; vG = Math.max(0, vT + rnd() * 1.2); }
      d.e.msg({ k: 'drive', v: Math.max(0, vG + rnd() * 0.4), thr: t < 8 ? 0.4 : 0.15 + rnd() * 0.1, brake: 0 }); d.e.render(d.bl, d.br, N); d.t += dt;
      for (let i = 0; i < N; i++) d.L.push(d.bl[i]);
    }
    const late = d.ev.filter((x) => x.t > 15 && (x.k === 'up' || x.k === 'blip' || x.k === 'kick')), st = stats(d.L);
    check('støyete fart (GPS-trinn ±0.6 m/s + støy): ingen girjakt i jevn fart (<= 1 skift etter 15 s), ingen NaN/klipping', late.length <= 1 && st.bad === 0 && st.peak < 0.9,
      'skift etter 15 s: ' + late.length + ', gir ' + d.e.gear + ', rpm ' + Math.round(d.e.rpm) + ', peak ' + st.peak.toFixed(2));
  }
  // ---- 9d. jevn fart med gassestimatet fra main.js (gassgulv +0.04, akselerasjonsstøy): ingen girjakt i noen modus ----
  {
    const dt = N / SR; let worst = 0; const info = [];
    for (const m of [0, 1, 2]) for (const kmh of [30, 50, 70, 90, 110]) {
      let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const gauss = () => { let q = 0; for (let i = 0; i < 6; i++) q += rnd(); return (q - 3) / 0.707; };
      const v = kmh / 3.6, aDrag = 0.12 + 0.00026 * v * v, aAvail = Math.min(9.5, 344000 / (1750 * Math.max(v, 4)));
      const est = (a) => Math.pow(Math.min(1, Math.max(0, 1.3 * (aDrag + a) / aAvail + 0.04)), 0.8); // som main.js
      const s = new Sess({ exMode: m }); s.e.msg({ k: 'mode', drive: true });
      // main.js (gassestimatet etter kjøreloggen): slipp under -0,35 m/s² til over -0,2 (hysterese), ellers gass minst 0,1
      let thr = 0.5, a = 0, lifted = false;
      for (let t = 0; t < 45; t += dt) {
        let tt = 0.5; if (t > v / 3) { a += (gauss() * 0.5 - a) * 0.3; lifted = lifted ? a < -0.2 : a < -0.35; tt = lifted ? 0 : Math.max(0.1, est(a)); }
        thr += (tt - thr) * Math.min(1, dt / (tt > thr ? 0.03 : 0.08));
        s.e.msg({ k: 'drive', v: Math.min(v, t * 3), thr, brake: 0 }); s.e.render(s.bl, s.br, N);
      }
      const n = s.ev.filter((x) => x.t > 15 && (x.k === 'up' || x.k === 'blip' || x.k === 'kick')).length;
      worst = Math.max(worst, n); if (n) info.push('KSB'[m] + kmh + ': ' + n);
    }
    check('jevn fart 30-110 km/t med gassgulvet fra main.js og støy, alle modi: ingen girjakt (0 skift på 30 s)', worst === 0, info.join(', ') || '0 skift');
  }
  // ---- 9d2. mye støyete gass (holdervibrasjon): snitt 0,12-0,15, std 0,05 og 0,08, lavpass 30 ms, rundt slippterskelen 0,05 ----
  // Kun styringen (control) kjøres, uten lyd, så testen er rask. Maks 1 skift på 30 s etter innsvingning.
  {
    const dt = N / SR; let worst = 0; const info = [];
    for (const [mu, sd] of [[0.12, 0.05], [0.12, 0.08], [0.15, 0.05], [0.15, 0.08]]) for (const m of [0, 1, 2]) for (const kmh of [30, 50, 70, 90, 110]) {
      let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const gauss = () => { let q = 0; for (let i = 0; i < 6; i++) q += rnd(); return (q - 3) / 0.707; };
      const a = Math.exp(-dt / 0.03), b = Math.sqrt(1 - a * a), v = kmh / 3.6, T0 = v / 3 + 10; let x = 0, n = 0;
      const e = new Sess({ exMode: m }).e; e.msg({ k: 'mode', drive: true });
      e.onEv = (ev) => { if (ev.t > T0 && (ev.k === 'up' || ev.k === 'blip' || ev.k === 'kick')) n++; };
      for (let t = 0; t < T0 + 30; t += dt) {
        x = a * x + b * gauss();
        e.msg({ k: 'drive', v: Math.min(v, t * 3), thr: t < v / 3 + 1 ? 0.4 : Math.min(1, Math.max(0, mu + sd * x)), brake: 0 }); e.control(dt);
      }
      worst = Math.max(worst, n); if (n) info.push(mu + '/' + sd + ' ' + 'KSB'[m] + kmh + ': ' + n);
    }
    check('støyete gass (snitt 0,12-0,15, std 0,05/0,08) 30-110 km/t, alle modi: maks 1 skift på 30 s', worst <= 1, info.join(', ') || '0 skift');
  }
  // ---- 9e. fritt turtall (kobling slurer på stillestående bil): stigning og fall følger profilens svinghjul ----
  {
    const s = new Sess(); s.run(1, 0); const r0 = s.e.rpm, t0 = s.t; let tUp = -1;
    while (s.t < t0 + 1.5) { s.run(N / SR, 1, 1); if (tUp < 0 && s.e.rpm >= r0 + 1500) tUp = s.t - t0; }
    const top = s.e.rpm, t1 = s.t; let tDn = -1;
    while (s.t < t1 + 2) { s.run(N / SR, 0); if (tDn < 0 && s.e.rpm <= top - 1500) tDn = s.t - t1; }
    const up = 1500 / tUp, dn = 1500 / tDn, rv = p.rev || [2500, 7500, 2600], eUp = 0.9 * (rv[0] + rv[1]), eDn = 0.9 * rv[2];
    const toRed = (p.redline - p.idle) / up;
    check('fritt turtall: stiger ca. ' + Math.round(eUp) + ' o/min/s og faller ca. ' + Math.round(eDn) + ' o/min/s (±25 %)' + (p.rev ? ', tomgang -> rødsone på <= 0,7 s' : ''),
      Math.abs(up / eUp - 1) < 0.25 && Math.abs(dn / eDn - 1) < 0.25 && (!p.rev || toRed <= 0.7),
      'stiger ' + Math.round(up) + ', faller ' + Math.round(dn) + ' o/min/s, tomgang -> rødsone tilsvarer ' + toRed.toFixed(2) + ' s');
  }
  // ---- 9f. lett last i bilen (i4 HK, som kjøreloggen: by, 0,05-0,25 last, 1 200-2 400 o/min) ----
  // Eieren hørte "mye støy når man ikke gasser direkte" og at lyden var lav. Ved 0,12 last og ca. 2 000 o/min (skalert) skal tonen
  // dominere (A-veid støy mellom de halve ordenene minst 13 dB under tonen), og nivået skal ligge høyst 14 dB (M4) / 20 dB (andre)
  // under full gass ved 5 000 o/min (før: 18-31 dB). Rulling uten gass (drivstoffkutt): støyen minst 4 dB under tonen.
  {
    const O = EngineCore.outputs().i4hk, lt = opPoint(p, O, rr(2000), 0.12, 3), co = opPoint(p, O, rr(2000), 0, 3), w = opPoint(p, O, rr(5000), 1, 4);
    check('lett last (i4 HK, 0,12 last, ' + rr(2000) + ' o/min): tone over støy (A-veid støy mellom ordenene <= -13 dB), rulling <= -4 dB',
      lt.tn <= -13 && co.tn <= -4, 'lett last ' + f1(lt.tn) + ' dB (1,5-6 kHz ' + f1(lt.hi) + ' dB av alt), rulling ' + f1(co.tn) + ' dB');
    const lim = pid === 'm4csl' ? -14 : -20, d = lt.lvA - w.lvA;
    check('lett last (i4 HK): A-veid nivå ' + (-lim) + ' til 6 dB under full gass ved ' + rr(5000) + ' o/min', d >= lim && d <= -6, f1(d) + ' dB');
    // bykjøring med små slipp fra lett gass og nedgir på lavt turtall: få smell (før: 2,6-6,2 per minutt), median av tre frø
    const pm = [0x1234567, 99, 777].map((sd) => cityPops(p, O, sd)).sort((a, b) => a - b);
    check('bykjøring (i4 HK): små slipp og nedgir på lavt turtall gir <= 2 smell per minutt (median av tre frø)', pm[1] <= 2, pm.map((x) => f1(x)).join('/') + ' per min');
  }
  // ---- 9g. girjakt fra kjøreloggen: gass av etter et rykk gir et deltgass-oppgir, slipp et sekund senere skal ikke gire ned igjen ----
  // (2 s: etter det kan rullingen på -0,6 m/s² ha senket turtallet så mye at et rullenedgir er riktig)
  {
    const dt = N / SR; const info = []; let bad = 0;
    for (const m of [0, 1, 2]) for (const top of [8, 10, 12, 14, 17, 20]) for (const ease of [0.04, 0.1, 0.15]) {
      const e = new Sess({ exMode: m }).e; e.msg({ k: 'mode', drive: true }); const evs = [];
      e.onEv = (x) => { if (x.k === 'up' || x.k === 'blip' || x.k === 'kick') evs.push(x); };
      let v = 0, t = 0;
      const step = (sec, thr, acc) => { for (let k = 0; k < sec / dt; k++) { v = Math.max(0, v + acc * dt); e.msg({ k: 'drive', v, thr, brake: 0 }); e.control(dt); t += dt; } };
      step(top / 2.5, 0.5, 2.5); step(1.0, ease, 0); step(4, 0, -0.6);
      for (let i = 1; i < evs.length; i++) if (evs[i - 1].k === 'up' && evs[i].k !== 'up' && evs[i].t - evs[i - 1].t < 2) { bad++; info.push('KSB'[m] + top + '/' + ease + ': ' + evs[i - 1].a + '>' + evs[i - 1].b + ' så ' + evs[i].a + '>' + evs[i].b); }
    }
    check('girjakt: gass av etter et rykk og slipp et sekund senere gir aldri oppgir og nedgir innen 2 s (alle modi, 8-20 m/s, rulling -0,6 m/s²)', bad === 0, info.slice(0, 6).join(', ') || '0 par');
  }
  // ---- 10. alle eksosmodi + tomgang av ----
  {
    const lv = [];
    for (const m of [0, 1, 2]) {
      const s = new Sess({ exMode: m }); s.run(0.5, 0).run(8, 1).run(2, 0).run(3, 0, 1);
      const st = stats(s.L); const t = s.trace.find((x) => x.gear === 3 && x.rpm > rr(5500) && x.load > 0.9).t; const w = s.seg(t, t + 0.1);
      lv.push({ m, peak: st.peak, bad: st.bad, rms: stats(w).rms, hi: bandPct(spectrum(w, 4096))[2] });
    }
    check('eksosmodi: Komfort < Sport <= Bane i nivå og rasp, ingen klipping', lv.every((x) => x.bad === 0 && x.peak < 0.9) && lv[0].rms < lv[1].rms && lv[1].rms <= lv[2].rms * 1.05 && (p.flap.rpmOnly || lv[0].hi < lv[2].hi),
      lv.map((x) => 'm' + x.m + ' rms ' + f1(dB(x.rms)) + ' dB, 2-5k ' + f1(x.hi) + ' %, peak ' + x.peak.toFixed(2)).join(' | '));
    { // klaff i Sport: lukket (~0.2) på tomgang, åpner raskt ved gass, lukker sakte
      const k = new Sess({ exMode: 1 }); k.run(2, 0); const fIdle = k.e.flap;
      k.run(0.1, 1); const fOpen = k.e.flap;      check('klaff Sport: ~' + p.flap.s[5] + ' på tomgang, > 0.9 etter 0.1 s full gass', fIdle < p.flap.s[5] + 0.05 && fIdle > p.flap.s[5] - 0.05 && fOpen > 0.9, 'tomgang ' + fIdle.toFixed(2) + ', etter 0.1 s gass ' + fOpen.toFixed(2));
    }
    const s = new Sess({ idleOn: false }); s.run(2, 0);
    check('tomgang av: stille når bilen står', stats(s.seg(1.5, 2)).rms < 0.002);
  }
  // ---- 11. tunnel ----
  {
    const s = new Sess({ auto: false }); s.run(0.5, 0).run(1.2, 1); s.shift(1);
    s.run(1.0, 0.6); s.inTunnel = 1; s.run(3.0, 0.6); const tOut = s.t; s.inTunnel = 0;
    s.e.msg({ k: 'cfg', vol: 0 }); s.run(4, 0); // motoren dempes helt: det som er igjen er ren hale
    const dry = stats(s.seg(2.5, 5.5)).rms;
    const o = applyTunnel(s, 1);
    const sl = (a, t0, t1) => Array.prototype.slice.call(a, Math.round(t0 * SR), Math.round(t1 * SR));
    const inT = stats(sl(o.L, 3.5, 5.5)).rms, before = stats(sl(o.L, 1.7, 2.6)).rms, dryBefore = stats(s.seg(1.7, 2.6)).rms;
    check('tunnel: tørr vei upåvirket utenfor tunnel', Math.abs(dB(before / dryBefore)) < 0.3, f1(dB(before / dryBefore)) + ' dB');
    check('tunnel: høyere nivå inne (+2 til +8 dB)', dB(inT / dry) > 2 && dB(inT / dry) < 8, '+' + f1(dB(inT / dry)) + ' dB');
    const spD = bandPct(spectrum(s.seg(3.5, 5.5), 32768)), spW = bandPct(spectrum(sl(o.L, 3.5, 5.5), 32768));
    check('tunnel: mer bass/mellomtone (andel < 500 Hz øker)', spW[0] > spD[0], f1(spD[0]) + ' % -> ' + f1(spW[0]) + ' %');
    // hale når kilden kuttes inne i tunnelen (bruk egen kjøring der tunnelen står på)
    const s3 = new Sess({ auto: false }); s3.run(0.5, 0).run(1.2, 1); s3.shift(1); s3.inTunnel = 1; s3.run(3, 0.6); const tc = s3.t; s3.e.msg({ k: 'cfg', vol: 0 }); s3.run(4, 0);
    const o3 = applyTunnel(s3, 1); const lvl = [];
    for (const d of [0.1, 0.5, 1.0, 2.0, 3.0]) lvl.push(dB(stats(sl(o3.L, tc + d, tc + d + 0.2)).rms / stats(sl(o3.L, tc - 1, tc)).rms));
    const mono = lvl.every((x, i) => i === 0 || x < lvl[i - 1]);
    check('tunnel: lang, jevnt avtagende hale (RT ca. 2-4 s)', mono && lvl[1] > -30 && lvl[3] < -25 && lvl[3] > -75, 'nivå etter 0.1/0.5/1/2/3 s: ' + lvl.map((x) => f1(x)).join(' / ') + ' dB');
    const tail = dB(stats(sl(o.L, tOut + 0.7, tOut + 0.9)).rms / inT);
    check('tunnel: ut av tunnelen er halen borte innen ~0.7 s (< -25 dB)', tail < -25, f1(tail) + ' dB');
    check('tunnel: ingen klipping (peak < 1, mykklipp-andel < 1 %)', stats(o.L).peak < 1 && o.clipFrac < 0.01, 'peak ' + stats(o.L).peak.toFixed(3) + ' andel ' + (o.clipFrac * 100).toFixed(2) + ' %');
  }
  // ---- 12. CPU ----
  {
    const e = new Sess().e; const a = new Float32Array(N), b = new Float32Array(N);
    e.msg({ k: 'in', thr: 1, brake: 0 });
    for (let i = 0; i < 2000; i++) e.render(a, b, N);
    const secs = 60, blocks = Math.round(secs * SR / N); const t0 = process.hrtime.bigint();
    for (let i = 0; i < blocks; i++) { if (i % 3000 === 0) e.msg({ k: 'in', thr: (i / 3000) % 2 ? 0 : 1, brake: 0 }); e.render(a, b, N); }
    const el = Number(process.hrtime.bigint() - t0) / 1e9;
    check('CPU: sanntidsfaktor < 0.05', el / secs < 0.05, (100 * el / secs).toFixed(2) + ' % av én kjerne (' + secs + ' s lyd på ' + el.toFixed(2) + ' s)');
  }
  return res;
  }

  const ids = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(PROFS);
  const all = {};
  for (const id of ids) all[id] = suite(id);
  Sess.prof = null;

  // ---- 13. på tvers av biler: nivå, tomgangssus, bilbytte ----
  const aW = (f) => { const f2 = f * f, r = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)); return r * r * 1.585; };
  const bandRel = (seg, lo, hi, w) => { const sp = spectrum(seg, 32768); let b = 0, t = 0; for (let i = 1; i < sp.mag.length; i++) { const f = i * sp.hz, m = sp.mag[i] * (w ? aW(f) : 1); t += m; if (f >= lo && f < hi) b += m; } return 10 * Math.log10(b / t + 1e-30); };
  if (all.m4csl) {
    for (const id of ids) {
      if (id === 'm4csl') continue;
      const a = all[id], m = all.m4csl, dW = dB(Math.pow(10, a.wot / 20)) - m.wot, dI = dB(a.idle / m.idle);
      check0('[' + PROFS[id].short + '] nivå mot M4 innen ±6 dB (full gass og tomgang)', Math.abs(dW) < 6 && Math.abs(dI) < 6, 'full gass ' + f1(dW) + ' dB, tomgang ' + f1(dI) + ' dB');
    }
  }
  {
    const info = []; let ok = true;
    for (const id of ids) {
      Sess.prof = PROFS[id]; const s = new Sess(); s.run(4, 0);
      const h = bandRel(s.seg(1.5, 4), 1500, 6000, true); info.push(PROFS[id].short + ' ' + f1(h) + ' dB');
      if (id !== 'm4csl' && h > -15) ok = false;
      if (id === 'gt3' && h > -23.9) ok = false; // GT3: ventiltikk, men ikke mer sus enn den roligste V12-en (Vanquish S)
      if ((id === 'lfa' || id === 'cgt') && h > -19) ok = false; // V10-ene: samme krav som V12 Vantage S
      if ((id === 'f812' || id === 'gt3rs4') && h > -19) ok = false; // 812 og GT3 RS 4.0: samme krav
    }
    check0('tomgangssus: A-veid 1.5-6 kHz under -15 dB av totalen for de nye bilene (M4 urørt), GT3 under -23.9 dB, V10-ene, 812 og GT3 RS 4.0 under -19 dB', ok, info.join(', '));
  }
  if (all.lfa && all.cgt) { // V10-ene: Carrera GT (68/76 grader) skal ha tydelig mer 2,5. orden (bankrytme) enn den jevne LFA-en; LFA løfter 2. og 3. orden
    const ord = (id) => {
      Sess.prof = PROFS[id]; const s = new Sess({ auto: false }); s.run(0.5, 0).run(1.3, 1); s.shift(1); s.run(1.5, 1); s.shift(1); s.run(0.4, 0.2); s.shift(1); s.run(0.5, 0.2); s.run(8, 1);
      const i = s.trace.findIndex((x) => x.gear === 4 && x.load > 0.9 && Math.abs(x.rpm - 6000) < 30), t = s.trace[i].t, rpm = s.trace[i].rpm;
      const a = Math.round((t - 0.06) * SR), mid = s.L.slice(a, a + Math.round(0.12 * SR)).map((x, k) => x + s.R[a + k]); // midt (L+R): sidekanalen bærer bankforskjellen
      const sp = spectrum(mid, 8192), o = (k) => linePow(sp, k * rpm / 60, Math.max(6, k * rpm / 60 * 0.03)), F = o(5);
      return { o2: 10 * Math.log10(o(2) / F), o25: 10 * Math.log10(o(2.5) / F), o3: 10 * Math.log10(o(3) / F), o75: 10 * Math.log10(o(7.5) / F) };
    };
    const L = ord('lfa'), C = ord('cgt'), fm = (x) => '2.: ' + f1(x.o2) + ', 2,5.: ' + f1(x.o25) + ', 3.: ' + f1(x.o3) + ', 7,5.: ' + f1(x.o75) + ' dB';
    check0('V10: ved 6 000 o/min (L+R) har Carrera GT >= 6 dB mer 2,5. orden enn LFA, og LFA har 2. og 3. orden innen 12 dB av tenningslinjen',
      C.o25 - L.o25 >= 6 && L.o2 > -12 && L.o3 > -12, 'LFA ' + fm(L) + ' | Carrera GT ' + fm(C) + ' (mot tenningslinjen, 5. orden)');
    Sess.prof = null;
  }
  for (const to of ids.filter((x) => x !== 'm4csl')) { // bytte bil midt i full gass: kort uttoning, ingen klikk, ny bil på tomgang i riktig gir
    Sess.prof = null; const s = new Sess({ auto: false }); s.run(0.5, 0).run(1.2, 1);
    const tS = s.t, P2 = PROFS[to]; s.e.msg({ k: 'profile', p: P2 }); s.run(0.4, 0.2);
    const seg = s.seg(tS, tS + 0.4); let dmax = 0; for (let i = 1; i < seg.length; i++) dmax = Math.max(dmax, Math.abs(seg[i] - seg[i - 1]));
    const pre = s.seg(tS - 0.3, tS); let dpre = 0; for (let i = 1; i < pre.length; i++) dpre = Math.max(dpre, Math.abs(pre[i] - pre[i - 1]));
    const mid = stats(s.seg(tS + 0.068, tS + 0.075)).rms;
    check0('bilbytte M4 -> ' + P2.short + ': tones ut på ~70 ms, ingen sprang større enn under vanlig kjøring, ny bil aktiv etterpå', mid < 0.01 && dmax <= dpre * 1.05 && s.e.pr.id === to && s.e.rpm > P2.idle - 100 && s.e.rpm < P2.redline * 0.5,
      'nivå midt i bytte ' + f1(dB(mid)) + ' dB, største sprang ' + dmax.toFixed(3) + ' (før: ' + dpre.toFixed(3) + '), etter: gir ' + s.e.gear + ' rpm ' + Math.round(s.e.rpm));
    // kjøremodus i 25 m/s: bytt til den nye bilen og tilbake; giret skal passe farten og lyden holde seg ren
    const d = new Sess(); d.e.msg({ k: 'mode', drive: true }); const dt = N / SR; let info = '', ok = true;
    for (let t = 0, step = 0; t < 9; t += dt) {
      if (step === 0 && t >= 3) { d.e.msg({ k: 'profile', p: P2 }); step = 1; }
      if (step === 1 && t >= 4) { const r = d.e.rpm; info += P2.short + ' gir ' + d.e.gear + ' ' + Math.round(r) + ' o/min; '; if (d.e.pr.id !== to || r < P2.idle || r > P2.redline * 0.6) ok = false; step = 2; }
      if (step === 2 && t >= 6) { d.e.msg({ k: 'profile', p: PROFS.m4csl }); step = 3; }
      d.e.msg({ k: 'drive', v: Math.min(25, t * 5), thr: 0.25, brake: 0 }); d.e.render(d.bl, d.br, N); d.t += dt;
      for (let i = 0; i < N; i++) d.L.push(d.bl[i]);
    }
    const st = stats(d.L); info += 'M4 gir ' + d.e.gear + ' ' + Math.round(d.e.rpm) + ' o/min, peak ' + st.peak.toFixed(2);
    check0('bilbytte i kjøremodus (25 m/s) M4 -> ' + P2.short + ' -> M4: gir passer farten, ingen NaN/klipping', ok && d.e.pr.id === 'm4csl' && d.e.rpm < 7200 * 0.6 && st.bad === 0 && st.peak < 0.9, info);
  }
  { // utgangsprofil for i4 M50 Harman Kardon: topper under -3 dBFS, ren bunn, smalere stereo
    const O = EngineCore.outputs().i4hk; Sess.out = O; let pk = 0; const info = [];
    for (const id of ids) {
      Sess.prof = PROFS[id];
      const s = new Sess({ exMode: 2, burble: 1 }); s.run(0.5, 0).run(10, 1).run(2, 0).run(4, 0, 1);
      const tu = new Sess({ exMode: 2, burble: 1 }); tu.inTunnel = 1; tu.run(0.5, 0).run(8, 1).run(2, 0).run(3, 0, 1); const to = applyTunnel(tu, 1), tp = Math.max(stats(to.L).peak, stats(to.R).peak), tc = to.clipFrac;
      const z = new Sess({ auto: false, exMode: 2, burble: 1 }); z.run(0.5, 0).run(4, 1);
      const st = Math.max(stats(s.L).peak, stats(s.R).peak, stats(z.L).peak), bad = stats(s.L).bad;
      const w = new Sess(); w.run(8, 0); const sub = bandRel(w.seg(2, 8), 0, 25), hf = bandRel(s.L.slice(48000, 480000), 16000, 24000);
      let sd = 0, md = 0; for (let i = 48000; i < 480000; i++) { const a = s.L[i], b = s.R[i]; sd += (a - b) * (a - b); md += (a + b) * (a + b); }
      pk = Math.max(pk, st);
      info.push(PROFS[id].short + ': topp ' + f1(dB(st)) + ' dBFS (i tunnel ' + f1(dB(tp)) + ', mykklipp ' + (tc * 100).toFixed(2) + ' %), <25 Hz ' + f1(sub) + ' dB, >16 kHz ' + f1(hf) + ' dB, side/mid ' + f1(10 * Math.log10(sd / md)) + ' dB');
      // taket er eksakt (begrenserens hylle faller aldri under dagens topp): Float32-utgangen når høyst fround(lim)
      if (st > Math.fround(O.lim) || tp > 0.95 || tc > 0.005 || bad || sub > -25 || hf > -25 || 10 * Math.log10(sd / md) > -12) pk = 9;
    }
    check0('utgang i4 HK: topper <= -3 dBFS i verste fall uten tunnel (Bane, full burble, sperre), i tunnel < -0.5 dBFS og nesten ingen mykklipp, < 25 Hz under -25 dB, > 16 kHz under -25 dB, stereo mono-vennlig (side < -12 dB av mid)', pk <= Math.fround(O.lim), '\n      ' + info.join('\n      '));
    Sess.out = null; Sess.prof = null;
  }
  console.log(results.join('\n'));
  console.log(fails ? '\n' + fails + ' FEIL' : '\nALT OK');
  process.exit(fails ? 1 : 0);
}
