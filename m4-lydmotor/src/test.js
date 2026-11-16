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

Sess.prof = null; Sess.out = null;
module.exports = { Sess, stats, spectrum, bandPct, linePow, dB, applyTunnel, writeWav, SR, N, TUN, EngineCore };

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
    let okTraj = true; const info = [];
    for (const u of ups.slice(0, 5)) {
      const r0 = s.rpmAt(u.t - 0.01), r1 = s.rpmAt(u.t + 0.2), exp = r0 * s.e.ratios[u.b] / s.e.ratios[u.a];
      info.push(Math.round(r0) + '>' + Math.round(r1) + ' (forv. ' + Math.round(exp) + ')');
      if (r0 < rr(6800) || Math.abs(r1 - exp) > rr(260)) okTraj = false;
    }
    check('WOT-oppgir: skifter > ' + rr(6800) + ' og lander på neste girs turtall innen 200 ms', okTraj, info.join('; '));
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
    const z = new Sess({ auto: false, burble: 0 }); z.run(0.5, 0).run(1.2, 1); z.shift(1); z.run(1.9, 1); z.shift(1); z.run(0.4, 1);
    while (z.e.rpm < rr(6500) && z.t < 20) z.run(0.02, 1);
    const tz = z.t; z.run(1, 0);
    const zd = dB(stats(z.seg(tz + 0.25, tz + 0.6)).rms / stats(z.seg(tz - 0.2, tz)).rms);
    check('slipp: grunnlyden (uten burble) faller > 12 dB', zd < -12, f1(zd) + ' dB');
    check('slipp: med burble ligger overrun 4-16 dB under full gass', dB(a.rms / pre.rms) < -4 && dB(a.rms / pre.rms) > -16, f1(dB(a.rms / pre.rms)) + ' dB');
    // forventet antall følger bilens burble-mengde i Sport (M4 = 5)
    const minP = Math.max(2, Math.round(5 * Math.min(1, p.ovr.mode[1] * p.ovr.rate * p.popK / (0.8 * 13))));
    check('slipp: burble samlet tidlig (>=' + minP + ' smell første 1.5 s, færre senere)', p01 >= minP && p23 < p01 * 0.6, 'første 1.5 s: ' + p01 + ', 2.5-4 s: ' + p23);
    const hiP = (seg) => { const sp = spectrum(seg, 8192); return linePow(sp, 3500, 1500); };
    const dRasp = 10 * Math.log10(hiP(s.seg(tL + 0.3, tL + 0.6)) / hiP(s.seg(tL - 0.2, tL)));
    const dRaspZ = 10 * Math.log10(hiP(z.seg(tz + 0.3, tz + 0.6)) / hiP(z.seg(tz - 0.2, tz)));
    check('slipp: raspen (2-5 kHz) faller > 10 dB (uten burble)', dRaspZ < -10, f1(dRaspZ) + ' dB; med burble ' + f1(dRasp) + ' dB');
    // komfort: nesten ingen burble
    const c = new Sess({ auto: false, exMode: 0 }); c.run(0.5, 0).run(1.2, 1); c.shift(1); c.run(1.9, 1); c.shift(1); c.run(0.4, 1);
    while (c.e.rpm < rr(6500) && c.t < 20) c.run(0.02, 1);
    const tc = c.t; c.run(3, 0);
    check('komfort: lite burble', c.evs('pop', tc).length <= 3, 'smell ' + c.evs('pop', tc).length + ' (sport: ' + s.evs('pop', tL).length + ')');
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
    check('sperre: holder ' + (p.lim.on - 180) + '-' + (p.lim.max + 5) + ' i 1. gir med flagring og smell', s.e.gear === 1 && mx <= p.lim.max + 5 && mn > p.lim.on - 230 && mx - mn > 60 && pops >= 5, 'rpm ' + Math.round(mn) + '-' + Math.round(mx) + ', smell/s ' + pops);
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
    const c = new Sess(); c.run(0.5, 0).run(6, 0.7); const g0 = c.e.gear, t0 = c.t; c.run(8, 0);
    const tr = c.trace.filter((x) => x.t > t0 + 0.5 && x.v > 3), lo = Math.min(...tr.map((x) => x.rpm)), hi = Math.max(...tr.map((x) => x.rpm));
    check('girvakt: slipp og rull holder turtallet fornuftig (' + rr(1200) + '-' + rr(4700) + ')', lo > rr(1200) && hi < rr(4700),
      'gir ' + g0 + '>' + c.e.gear + ', rpm ' + Math.round(lo) + '-' + Math.round(hi));
  }
  // ---- 10. alle eksosmodi + tomgang av ----
  {
    const lv = [];
    for (const m of [0, 1, 2]) {
      const s = new Sess({ exMode: m }); s.run(0.5, 0).run(8, 1).run(2, 0).run(3, 0, 1);
      const st = stats(s.L); const t = s.trace.find((x) => x.gear === 3 && x.rpm > rr(5500) && x.load > 0.9).t; const w = s.seg(t, t + 0.1);
      lv.push({ m, peak: st.peak, bad: st.bad, rms: stats(w).rms, hi: bandPct(spectrum(w, 4096))[2] });
    }
    check('eksosmodi: Komfort < Sport <= Bane i nivå og rasp, ingen klipping', lv.every((x) => x.bad === 0 && x.peak < 0.9) && lv[0].rms < lv[1].rms && lv[1].rms <= lv[2].rms * 1.05 && lv[0].hi < lv[2].hi,
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
    }
    check0('tomgangssus: A-veid 1.5-6 kHz under -15 dB av totalen for de nye bilene (M4 urørt)', ok, info.join(', '));
  }
  { // bytte bil midt i full gass: kort uttoning, ingen klikk, ny bil på tomgang i riktig gir
    Sess.prof = null; const s = new Sess({ auto: false }); s.run(0.5, 0).run(1.2, 1);
    const tS = s.t; s.e.msg({ k: 'profile', p: PROFS.f12 }); s.run(0.4, 0.2);
    const seg = s.seg(tS, tS + 0.4); let dmax = 0; for (let i = 1; i < seg.length; i++) dmax = Math.max(dmax, Math.abs(seg[i] - seg[i - 1]));
    const pre = s.seg(tS - 0.3, tS); let dpre = 0; for (let i = 1; i < pre.length; i++) dpre = Math.max(dpre, Math.abs(pre[i] - pre[i - 1]));
    const mid = stats(s.seg(tS + 0.068, tS + 0.075)).rms;
    check0('bilbytte: tones ut på ~70 ms, ingen sprang større enn under vanlig kjøring, F12 aktiv etterpå', mid < 0.01 && dmax <= dpre * 1.05 && s.e.pr.id === 'f12' && s.e.rpm > PROFS.f12.idle - 100 && s.e.rpm < PROFS.f12.redline * 0.5,
      'nivå midt i bytte ' + f1(dB(mid)) + ' dB, største sprang ' + dmax.toFixed(3) + ' (før: ' + dpre.toFixed(3) + '), etter: gir ' + s.e.gear + ' rpm ' + Math.round(s.e.rpm));
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
      if (st > O.lim + 1e-6 || tp > 0.95 || tc > 0.005 || bad || sub > -25 || hf > -25 || 10 * Math.log10(sd / md) > -12) pk = 9;
    }
    check0('utgang i4 HK: topper <= -3 dBFS i verste fall uten tunnel (Bane, full burble, sperre), i tunnel < -0.5 dBFS og nesten ingen mykklipp, < 25 Hz under -25 dB, > 16 kHz under -25 dB, stereo mono-vennlig (side < -12 dB av mid)', pk <= O.lim + 1e-6, '\n      ' + info.join('\n      '));
    Sess.out = null; Sess.prof = null;
  }
  console.log(results.join('\n'));
  console.log(fails ? '\n' + fails + ' FEIL' : '\nALT OK');
  process.exit(fails ? 1 : 0);
}
