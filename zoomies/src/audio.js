// All audio is synthesised with WebAudio: no files to download.
import { Music } from './music.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.musicVol = 0.7; // 0..1 from Settings
    this.sfxOn = true;
    this.engine = null;
    this.song = null;
  }

  unlock() {
    // iOS mutes Web Audio when the ringer is on silent unless the page asks
    // for a "playback" audio session (Safari 17+).
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } catch (e) {
      /* not supported */
    }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = this.sfxOn ? 0.7 : 0;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = this.musicOn ? this.musicLevel : 0;
      this.music.connect(this.master);
      // one second of white noise, reused everywhere
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this._primeSession();
  }

  // Older iOS: playing a (silent) media element switches the page to the
  // playback audio session, which also un-mutes Web Audio on silent.
  _primeSession() {
    if (this._silent || navigator.audioSession || !/iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) || !('ontouchend' in document)) return;
    const rate = 8000, n = 800;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    const el = document.createElement('audio');
    el.setAttribute('playsinline', '');
    el.loop = true;
    el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    el.play().catch(() => {});
    this._silent = el;
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  get musicLevel() {
    return 0.42 * this.musicVol * this.musicVol;
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? this.musicLevel : 0, this.ctx.currentTime, 0.1);
  }

  setMusicVolume(v) {
    this.musicVol = Math.max(0, Math.min(1, v));
    if (this.music) this.music.gain.setTargetAtTime(this.musicOn ? this.musicLevel : 0, this.ctx.currentTime, 0.1);
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  // ---- building blocks ----
  _tone(type, f0, f1, dur, vol, when = 0, dest = this.sfx, attack = 0.005) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterType, f0, f1, when = 0, dest = this.sfx, q = 1) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // ---- horns (gumball machine) ----
  horn(id, when = 0) {
    if (!this.ready || !this.sfxOn) return;
    const T = (type, f0, f1, dur, vol, at = 0, attack) => this._tone(type, f0, f1, dur, vol, when + at, this.sfx, attack);
    const N = (dur, vol, type, f0, f1, at = 0, q) => this._noise(dur, vol, type, f0, f1, when + at, this.sfx, q);
    switch (id) {
      case 'duck':
        for (const at of [0, 0.2]) { T('sawtooth', 1100, 600, 0.14, 0.09, at); T('square', 700, 420, 0.14, 0.06, at); }
        break;
      case 'clown':
        T('sawtooth', 520, 470, 0.22, 0.12, 0, 0.02); T('square', 260, 240, 0.22, 0.08, 0, 0.02);
        T('sawtooth', 390, 350, 0.3, 0.12, 0.26, 0.02); T('square', 195, 180, 0.3, 0.08, 0.26, 0.02);
        break;
      case 'kazoo':
        [0, 4, 7, 12].forEach((s, i) => { T('sawtooth', mtof(67 + s), mtof(67 + s) * 1.02, 0.14, 0.08, i * 0.12, 0.02); N(0.14, 0.05, 'bandpass', 1400, 1400, i * 0.12, 6); });
        break;
      case 'meow':
        T('sawtooth', 700, 1100, 0.18, 0.08, 0, 0.03); T('sawtooth', 1100, 520, 0.32, 0.08, 0.16);
        N(0.45, 0.04, 'bandpass', 1800, 900, 0, 4);
        break;
      case 'laser':
        for (const at of [0, 0.14, 0.28]) T('square', 1800, 180, 0.13, 0.08, at);
        break;
      case 'train':
        for (const f of [277, 349, 415]) T('sawtooth', f, f * 0.99, 0.75, 0.05, 0, 0.06);
        N(0.8, 0.12, 'bandpass', 700, 500, 0, 1.5);
        break;
      case 'airhorn':
        for (const at of [0, 0.3, 0.6]) { T('sawtooth', 466, 460, 0.24, 0.1, at, 0.01); T('sawtooth', 554, 548, 0.24, 0.08, at, 0.01); N(0.24, 0.1, 'bandpass', 1200, 1000, at, 2); }
        break;
      case 'fanfare':
        [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36]].forEach(([s, at]) => T('square', mtof(72 + s), 0, at === 0.36 ? 0.5 : 0.14, 0.09, at));
        T('triangle', mtof(60), 0, 0.8, 0.12, 0.36);
        break;
      case 'dino':
        N(0.9, 0.35, 'lowpass', 900, 160, 0, 1.2);
        T('sawtooth', 190, 70, 0.9, 0.14, 0, 0.08); T('sawtooth', 240, 90, 0.8, 0.08, 0.05, 0.08);
        break;
      default: // beep beep
        for (const at of [0, 0.18]) { T('square', 440, 430, 0.13, 0.1, at); T('square', 554, 544, 0.13, 0.08, at); }
    }
  }

  // ---- sound effects ----
  play(name, arg) {
    if (!this.ready || !this.sfxOn) return;
    switch (name) {
      case 'count':
        this._tone('square', 440, 440, 0.25, 0.25);
        break;
      case 'go':
        this._tone('square', 880, 880, 0.55, 0.28);
        this._tone('triangle', 1320, 1320, 0.5, 0.15);
        break;
      case 'boost':
        this._noise(0.6, 0.35, 'bandpass', 400, 3000, 0, this.sfx, 2);
        this._tone('sawtooth', 180, 520, 0.4, 0.1);
        break;
      case 'miniturbo':
        this._noise(0.35, 0.28, 'bandpass', 900, 3500, 0, this.sfx, 3);
        this._tone('square', 300, 700, 0.25, 0.08);
        break;
      case 'driftLevel': {
        const f = [0, 880, 1175, 1568][arg] || 880;
        this._tone('square', f, f * 1.5, 0.12, 0.09);
        break;
      }
      case 'boom':
        this._noise(0.9, 0.7, 'lowpass', 900, 60, 0, this.sfx, 0.8);
        this._tone('sine', 110, 32, 0.6, 0.5);
        this._noise(0.25, 0.35, 'bandpass', 2400, 600, 0, this.sfx, 1);
        break;
      case 'horn':
        this._tone('square', 330, 320, 0.28, 0.14);
        this._tone('square', 415, 405, 0.28, 0.12);
        this._noise(0.35, 0.25, 'lowpass', 1600, 200, 0.05, this.sfx, 0.7);
        break;
      case 'firework':
        this._tone('triangle', 900, 2600, 0.5, 0.08);
        this._noise(0.4, 0.2, 'highpass', 3000, 6000, 0, this.sfx, 0.7);
        break;
      case 'twister':
        this._noise(1.2, 0.3, 'bandpass', 300, 1400, 0, this.sfx, 2);
        this._noise(1.0, 0.2, 'bandpass', 900, 2400, 0.2, this.sfx, 3);
        break;
      case 'ghost':
        this._tone('sine', 520, 380, 0.6, 0.12);
        this._tone('sine', 780, 560, 0.6, 0.08, 0.08);
        this._tone('triangle', 260, 190, 0.7, 0.08, 0.15);
        break;
      case 'slip':
        this._noise(0.5, 0.22, 'bandpass', 2200, 1500, 0, this.sfx, 6);
        this._tone('triangle', 700, 350, 0.35, 0.06);
        break;
      case 'driftStart':
        this._noise(0.14, 0.1, 'bandpass', 2600, 1700, 0, this.sfx, 4);
        this._tone('triangle', 220, 330, 0.08, 0.07);
        break;
      case 'land':
        this._tone('sine', 120, 60, 0.18, 0.3);
        this._noise(0.12, 0.15, 'lowpass', 800, 200);
        break;
      case 'trick':
        this._tone('triangle', 660, 1320, 0.18, 0.18);
        this._tone('triangle', 990, 1980, 0.18, 0.12, 0.08);
        break;
      case 'item':
        [0, 4, 7, 12].forEach((s, i) => this._tone('square', mtof(76 + s), 0, 0.09, 0.1, i * 0.05));
        break;
      case 'tick':
        this._tone('square', 1200 + Math.random() * 400, 0, 0.03, 0.05);
        break;
      case 'itemReady':
        this._tone('triangle', 1046, 1046, 0.12, 0.15);
        this._tone('triangle', 1568, 1568, 0.18, 0.15, 0.08);
        break;
      case 'throw':
        this._noise(0.25, 0.25, 'highpass', 1200, 4000);
        break;
      case 'honey':
        this._tone('sine', 300, 120, 0.25, 0.25);
        break;
      case 'hit':
        this._tone('square', 520, 90, 0.5, 0.18);
        this._noise(0.35, 0.3, 'lowpass', 2000, 300);
        break;
      case 'bump':
        this._tone('sine', 140, 70, 0.16, 0.3);
        break;
      case 'wall':
        this._noise(0.14, Math.min(0.35, 0.1 + (arg || 0) * 0.015), 'bandpass', 1400, 600, 0, this.sfx, 1.5);
        break;
      case 'gem':
        this._tone('sine', 1760, 1760, 0.08, 0.14);
        this._tone('sine', 2637, 2637, 0.14, 0.12, 0.06);
        break;
      case 'shield':
        this._tone('sine', 400, 900, 0.35, 0.16);
        break;
      case 'shieldPop':
        this._noise(0.2, 0.3, 'highpass', 2000, 5000);
        this._tone('sine', 900, 300, 0.2, 0.14);
        break;
      case 'rainbow':
        [0, 4, 7, 11, 14, 19].forEach((s, i) => this._tone('square', mtof(72 + s), 0, 0.1, 0.09, i * 0.045));
        break;
      case 'zap':
        this._noise(0.6, 0.4, 'bandpass', 3000, 200, 0, this.sfx, 0.8);
        this._tone('sawtooth', 90, 45, 0.6, 0.2);
        break;
      case 'bee':
        this._tone('sawtooth', 220, 260, 0.4, 0.06);
        break;
      case 'lap':
        [0, 7, 12].forEach((s, i) => this._tone('triangle', mtof(79 + s), 0, 0.14, 0.16, i * 0.09));
        break;
      case 'finalLap':
        [0, 4, 7, 12, 7, 12].forEach((s, i) => this._tone('square', mtof(76 + s), 0, 0.12, 0.12, i * 0.1));
        break;
      case 'finish':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this._tone('square', mtof(72 + s), 0, 0.2, 0.12, i * 0.09));
        this._tone('triangle', mtof(60), 0, 1.2, 0.18, 0.63);
        break;
      case 'lose':
        [7, 4, 0, -5].forEach((s, i) => this._tone('triangle', mtof(67 + s), 0, 0.25, 0.14, i * 0.18));
        break;
      case 'ui':
        this._tone('triangle', 880, 1100, 0.07, 0.12);
        break;
      case 'levelup':
        [0, 4, 7, 12].forEach((st, i) => this._tone('square', mtof(76 + st), 0, 0.16, 0.11, i * 0.08));
        this._tone('triangle', mtof(88), 0, 0.5, 0.12, 0.34);
        break;
      case 'podium': {
        // A little victory fanfare.
        const mel = [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.3], [76, 0.8, 0.14], [79, 0.95, 0.6]];
        for (const [n, at, d] of mel) { this._tone('square', mtof(n), 0, d, 0.1, at); this._tone('triangle', mtof(n - 12), 0, d, 0.08, at); }
        [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]].forEach((ch, i) => ch.forEach((n) => this._tone('triangle', mtof(n), 0, i === 3 ? 1.2 : 0.3, 0.05, i * 0.4)));
        this._noise(0.5, 0.15, 'highpass', 4000, 8000, 0.95, this.sfx, 0.7);
        break;
      }
      case 'crank':
        for (let i = 0; i < 6; i++) this._noise(0.04, 0.3, 'bandpass', 2600, 1800, i * 0.09, this.sfx, 4);
        this._tone('triangle', 300, 120, 0.3, 0.12, 0.62);
        break;
      case 'capsule':
        this._tone('sine', 900, 1500, 0.08, 0.12);
        this._noise(0.12, 0.25, 'bandpass', 1500, 3000, 0.02, this.sfx, 2);
        break;
      case 'reveal': {
        const run = { common: [0, 7], rare: [0, 4, 7, 12], epic: [0, 4, 7, 11, 14, 19], legendary: [0, 4, 7, 12, 16, 19, 24, 28] }[arg] || [0, 7];
        run.forEach((s, i) => this._tone('square', mtof(76 + s), 0, 0.16, 0.1, i * 0.07));
        if (arg === 'epic' || arg === 'legendary') this._tone('triangle', mtof(64), 0, 1, 0.14, run.length * 0.07);
        break;
      }
      case 'coin':
        this._tone('square', 988, 988, 0.07, 0.1);
        this._tone('square', 1319, 1319, 0.22, 0.1, 0.07);
        break;
      case 'uiBack':
        this._tone('triangle', 660, 440, 0.08, 0.12);
        break;
      case 'select':
        this._tone('square', 660, 660, 0.06, 0.08);
        this._tone('square', 990, 990, 0.1, 0.08, 0.06);
        break;
      case 'warp':
        this._tone('sine', 300, 1600, 0.4, 0.15);
        this._tone('triangle', 1600, 300, 0.4, 0.1, 0.35);
        break;
      case 'secret':
        [0, 7, 12, 16, 19, 24].forEach((s, i) => this._tone('triangle', mtof(72 + s), 0, 0.12, 0.12, i * 0.06));
        break;
      case 'fall':
        this._tone('sine', 700, 120, 0.7, 0.18);
        break;
      case 'crate':
        this._noise(0.25, 0.4, 'bandpass', 900, 300, 0, this.sfx, 1.2);
        this._tone('square', 160, 80, 0.15, 0.12);
        break;
      case 'burnout':
        this._noise(0.5, 0.3, 'lowpass', 600, 100);
        break;
    }
  }

  // ---- engines ----
  // A small single-cylinder kart engine: a pulse-shaped waveform at the
  // firing rate, a detuned copy for grit, a sub-octave for body, soft
  // clipping that grows with load, an exhaust resonance, intake noise and a
  // slow random wobble that makes idle sound like real combustion.
  _engineWave() {
    if (this._ew) return this._ew;
    const N = 40;
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) {
      // decaying harmonics with a bump around the 2nd-4th (the "bark")
      const a = (1 / Math.pow(n, 0.85)) * (n >= 2 && n <= 4 ? 1.5 : 1) * (n % 2 ? 1 : 0.8);
      const ph = n * 0.9;
      re[n] = a * Math.cos(ph);
      im[n] = a * Math.sin(ph);
    }
    this._ew = this.ctx.createPeriodicWave(re, im);
    return this._ew;
  }

  _shaper() {
    if (this._sc) return this._sc;
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
    }
    this._sc = curve;
    return curve;
  }

  _engineVoice(out, level = 1) {
    const c = this.ctx;
    const v = { level };
    const src = (node) => { node.start(); return node; };
    v.o1 = src(c.createOscillator());
    v.o1.setPeriodicWave(this._engineWave());
    v.o2 = src(c.createOscillator());
    v.o2.setPeriodicWave(this._engineWave());
    v.sub = src(c.createOscillator());
    v.sub.type = 'sine';
    v.drive = c.createGain();
    v.shaper = c.createWaveShaper();
    v.shaper.curve = this._shaper();
    v.shaper.oversample = '2x';
    v.lp = c.createBiquadFilter();
    v.lp.type = 'lowpass';
    v.lp.Q.value = 0.9;
    v.body = c.createBiquadFilter();
    v.body.type = 'peaking';
    v.body.frequency.value = 320;
    v.body.Q.value = 1.2;
    v.body.gain.value = 6;
    v.amp = c.createGain();
    v.amp.gain.value = 0;
    const g2 = c.createGain();
    g2.gain.value = 0.55;
    const gs = c.createGain();
    gs.gain.value = 0.5;
    v.o1.connect(v.drive);
    v.o2.connect(g2).connect(v.drive);
    v.sub.connect(gs).connect(v.lp);
    v.drive.connect(v.shaper).connect(v.lp);
    v.lp.connect(v.body).connect(v.amp);
    // intake / exhaust air
    v.air = c.createBufferSource();
    v.air.buffer = this.noise;
    v.air.loop = true;
    v.airBp = c.createBiquadFilter();
    v.airBp.type = 'bandpass';
    v.airBp.Q.value = 0.8;
    v.airG = c.createGain();
    v.airG.gain.value = 0;
    v.air.connect(v.airBp).connect(v.airG).connect(v.amp);
    v.air.start(0, Math.random());
    // combustion wobble: very low-passed noise nudging the volume
    v.jit = c.createBufferSource();
    v.jit.buffer = this.noise;
    v.jit.loop = true;
    v.jit.playbackRate.value = 0.25;
    const jl = c.createBiquadFilter();
    jl.type = 'lowpass';
    jl.frequency.value = 18;
    v.jitG = c.createGain();
    v.jitG.gain.value = 0;
    v.jit.connect(jl).connect(v.jitG).connect(v.amp.gain);
    v.jit.start(0, Math.random());
    if (c.createStereoPanner) {
      v.pan = c.createStereoPanner();
      v.amp.connect(v.pan).connect(out);
    } else v.amp.connect(out);
    v.nodes = [v.o1, v.o2, v.sub, v.air, v.jit];
    return v;
  }

  // rpm 1500-12500, load 0-1, vol 0-1
  _setVoice(v, rpm, load, vol, t, pan = 0) {
    const f = rpm / 60;
    const k = 0.04;
    v.o1.frequency.setTargetAtTime(f, t, k);
    v.o2.frequency.setTargetAtTime(f * 1.007, t, k);
    v.sub.frequency.setTargetAtTime(f * 0.5, t, k);
    v.drive.gain.setTargetAtTime(0.35 + load * 0.9, t, 0.06);
    v.lp.frequency.setTargetAtTime(380 + (rpm / 12500) * 2600 + load * 900, t, 0.06);
    v.body.frequency.setTargetAtTime(220 + (rpm / 12500) * 380, t, 0.1);
    v.airBp.frequency.setTargetAtTime(700 + (rpm / 12500) * 2200, t, 0.1);
    v.airG.gain.setTargetAtTime((0.05 + load * 0.2) * (rpm / 12500), t, 0.08);
    const base = vol * v.level * (0.55 + 0.45 * load);
    v.amp.gain.setTargetAtTime(base, t, 0.05);
    // (the filtered noise is small, hence the large factor)
    v.jitG.gain.setTargetAtTime(base * 7 * Math.max(0, 1 - rpm / 6500), t, 0.1);
    if (v.pan) v.pan.pan.setTargetAtTime(pan, t, 0.1);
  }

  _stopVoice(v, t) {
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setTargetAtTime(0, t, 0.05);
    for (const n of v.nodes) n.stop(t + 0.4);
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const e = (this.engine = { rpm: 1800, gear: 0, shift: 0, last: c.currentTime });
    e.bus = c.createGain();
    e.bus.gain.value = 0.16;
    e.bus.connect(this.sfx);
    e.voice = this._engineVoice(e.bus, 1);
    e.rival = this._engineVoice(e.bus, 0.55);
    e.rivalRpm = 3000;
    // turbo whine while boosting
    e.turbo = c.createOscillator();
    e.turbo.type = 'triangle';
    e.turboG = c.createGain();
    e.turboG.gain.value = 0;
    e.turbo.connect(e.turboG).connect(e.bus);
    e.turbo.start();
    // tyre squeal while drifting
    e.sq = c.createBufferSource();
    e.sq.buffer = this.noise;
    e.sq.loop = true;
    e.sqBp = c.createBiquadFilter();
    e.sqBp.type = 'bandpass';
    e.sqBp.Q.value = 7;
    e.sqBp.frequency.value = 1900;
    e.sqG = c.createGain();
    e.sqG.gain.value = 0;
    e.sq.connect(e.sqBp).connect(e.sqG).connect(e.bus);
    e.sq.start();
    e.sqTone = c.createOscillator();
    e.sqTone.type = 'sine';
    e.sqToneG = c.createGain();
    e.sqToneG.gain.value = 0;
    e.sqTone.connect(e.sqToneG).connect(e.bus);
    e.sqTone.start();
  }

  // s: { speed 0..1.3 (fraction of top speed), throttle, brake, boost, drift,
  //      driftLevel, air, offroad, active, rival: { dist, speed, pan } }
  updateEngine(s) {
    const e = this.engine;
    if (!e || !this.ready) return;
    const c = this.ctx;
    const t = c.currentTime;
    const dt = Math.min(0.1, Math.max(0.001, t - e.last));
    e.last = t;
    const IDLE = 1900, RED = 12200;
    // Gearbox: rpm climbs through each gear and drops on the shift.
    const tops = [0.3, 0.52, 0.74, 0.96, 1.5];
    const spd = Math.max(0, s.speed);
    let g = e.gear;
    if (g < tops.length - 1 && spd > tops[g] * 1.01) g++;
    else if (g > 0 && spd < tops[g - 1] * 0.86) g--;
    if (g > e.gear) {
      e.shift = 0.14;
      if (e.rpm > 9000 && s.active) this.pop();
    }
    e.gear = g;
    const lo = g ? tops[g - 1] * 0.62 : 0;
    const frac = Math.min(1, Math.max(0, (spd - lo) / (tops[g] - lo)));
    const throttle = s.active ? Math.max(0, s.throttle ?? 1) : 0;
    let target = IDLE + (RED - IDLE) * Math.pow(frac, 0.85);
    if (s.air && throttle > 0) target = Math.max(target, RED * 0.92); // free-revving off a jump
    if (!throttle || s.brake) target = Math.max(IDLE, target * 0.75);
    if (s.boost) target = Math.min(RED * 1.04, target * 1.08 + 800);
    const kUp = e.shift > 0 ? 3 : 9, kDn = 6;
    e.rpm += (target - e.rpm) * (1 - Math.exp(-(target > e.rpm ? kUp : kDn) * dt));
    e.shift = Math.max(0, e.shift - dt);
    let load = s.active ? (throttle * (s.air ? 0.35 : 1) * (s.brake ? 0.2 : 1)) : 0;
    if (s.boost) load = Math.min(1, load + 0.4);
    if (s.offroad) load = Math.min(1, load + 0.15);
    const dip = e.shift > 0.06 ? 0.55 : 1; // lift during the shift
    this._setVoice(e.voice, e.rpm, load * dip, s.active ? 1 : 0, t);
    // Nearest rival: fades in when close, panned to their side, with a
    // little Doppler from the closing speed.
    const r = s.rival;
    if (r && s.active) {
      const near = Math.max(0, 1 - r.dist / 26);
      const rr = IDLE + (RED - IDLE) * Math.min(1, 0.35 + Math.max(0, r.speed) * 0.55) * (1 + (r.closing || 0) * 0.004);
      e.rivalRpm += (rr - e.rivalRpm) * (1 - Math.exp(-4 * dt));
      this._setVoice(e.rival, e.rivalRpm, 0.7, near * near, t, r.pan);
    } else this._setVoice(e.rival, 3000, 0, 0, t);
    // turbo
    e.turbo.frequency.setTargetAtTime(1500 + (e.rpm / RED) * 1600, t, 0.1);
    e.turboG.gain.setTargetAtTime(s.boost && s.active ? 0.05 : 0, t, s.boost ? 0.05 : 0.2);
    // tyres
    const squeal = s.active && !s.air && s.drift && spd > 0.3 ? 0.11 + 0.03 * (s.driftLevel || 0) : s.active && s.brake && spd > 0.45 && !s.air ? 0.07 : 0;
    const wob = Math.sin(t * 7.3) * 120 + Math.sin(t * 3.1) * 80;
    e.sqBp.frequency.setTargetAtTime(1700 + (s.driftLevel || 0) * 180 + wob, t, 0.05);
    e.sqG.gain.setTargetAtTime(squeal * (s.offroad ? 0.3 : 1), t, 0.06);
    e.sqTone.frequency.setTargetAtTime(1450 + wob * 0.6, t, 0.05);
    e.sqToneG.gain.setTargetAtTime(squeal * 0.12 * (s.offroad ? 0 : 1), t, 0.06);
  }

  // A backfire pop (gear shifts at high rpm, lifting off the throttle).
  pop() {
    if (!this.ready || !this.engine) return;
    this._noise(0.06, 0.18, 'bandpass', 900, 300, 0, this.engine.bus, 1.5);
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    this._stopVoice(e.voice, t);
    this._stopVoice(e.rival, t);
    e.turboG.gain.setTargetAtTime(0, t, 0.05);
    e.sqG.gain.setTargetAtTime(0, t, 0.05);
    e.sqToneG.gain.setTargetAtTime(0, t, 0.05);
    for (const n of [e.turbo, e.sq, e.sqTone]) n.stop(t + 0.4);
    this.engine = null;
  }

  // ---- music (see music.js) ----
  playSong(def, theme) {
    if (!this.ctx) return;
    if (!this.musicGen) this.musicGen = new Music(this.ctx, this.music, this.noise);
    this.musicGen.play(def || {}, theme);
  }

  setTempo(mul) {
    if (this.musicGen) this.musicGen.setTempo(mul);
  }

  finalLap() {
    if (this.musicGen) this.musicGen.finalLap();
  }

  stopSong() {
    if (this.musicGen) this.musicGen.stop();
  }
}
