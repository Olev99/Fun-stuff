// All audio is synthesised with WebAudio: no files to download.
import { rng } from './util.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
// Chord progressions as scale degrees (0-based).
const PROGS = {
  major: [[0, 4, 5, 3], [0, 5, 3, 4]],
  minor: [[0, 5, 2, 6], [0, 3, 5, 4]],
  dorian: [[0, 3, 0, 6], [0, 6, 3, 4]],
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.engine = null;
    this.song = null;
  }

  unlock() {
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
      this.music.gain.value = this.musicOn ? 0.32 : 0;
      this.music.connect(this.master);
      // one second of white noise, reused everywhere
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1);
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
      case 'hop':
        this._tone('triangle', 260, 420, 0.1, 0.12);
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
      case 'uiBack':
        this._tone('triangle', 660, 440, 0.08, 0.12);
        break;
      case 'select':
        this._tone('square', 660, 660, 0.06, 0.08);
        this._tone('square', 990, 990, 0.1, 0.08, 0.06);
        break;
      case 'burnout':
        this._noise(0.5, 0.3, 'lowpass', 600, 100);
        break;
    }
  }

  // ---- engine (player only) ----
  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    const lp = c.createBiquadFilter();
    const g = c.createGain();
    o1.type = 'sawtooth';
    o2.type = 'square';
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.Q.value = 3;
    g.gain.value = 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.sfx);
    o1.start();
    o2.start();
    this.engine = { o1, o2, lp, g };
  }

  updateEngine(speedFrac, boosting, active) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const f = 55 + speedFrac * 95 + (boosting ? 30 : 0);
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5 + 1.5, t, 0.05);
    e.lp.frequency.setTargetAtTime(350 + speedFrac * 1400 + (boosting ? 800 : 0), t, 0.08);
    e.g.gain.setTargetAtTime(active ? 0.045 + speedFrac * 0.04 : 0, t, 0.1);
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.05);
    e.o1.stop(t + 0.3);
    e.o2.stop(t + 0.3);
    this.engine = null;
  }

  // ---- music: a tiny procedural chiptune sequencer ----
  playSong(def, intensity = 1) {
    this.stopSong();
    if (!this.ctx) return;
    const r = rng(def.seed || 1);
    const scale = SCALES[def.scale] || SCALES.major;
    const prog = PROGS[def.scale || 'major'][Math.floor(r() * 2)];
    const root = 48 + (def.key || 0);
    const note = (deg, oct = 0) => {
      const o = Math.floor(deg / 7);
      const dd = ((deg % 7) + 7) % 7;
      return root + scale[dd] + 12 * (o + oct);
    };
    // Melody: chord tones on strong beats, passing tones between.
    const rhythms = [
      [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0],
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0],
      [1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
    ];
    const bars = [];
    for (let b = 0; b < 4; b++) {
      const rh = rhythms[Math.floor(r() * rhythms.length)];
      const chord = prog[b];
      const notes = [];
      let cur = chord + 7 + [0, 2, 4][Math.floor(r() * 3)];
      for (let s = 0; s < 16; s++) {
        if (!rh[s]) { notes.push(null); continue; }
        if (s % 4 === 0) {
          const tones = [chord, chord + 2, chord + 4].map((d) => d + 7);
          cur = tones.reduce((a, b2) => (Math.abs(b2 - cur) < Math.abs(a - cur) ? b2 : a));
          if (r() < 0.3) cur += 7 * (r() < 0.5 ? 0 : 0);
        } else {
          cur += r() < 0.5 ? 1 : -1;
          if (r() < 0.2) cur += r() < 0.5 ? 2 : -2;
        }
        notes.push(cur);
      }
      bars.push(notes);
    }
    // AABA'
    const melody = [bars[0], bars[1], bars[0], bars[3]];
    const bpm = def.bpm || 140;
    this.song = {
      step: 0, next: this.ctx.currentTime + 0.1, bpm, tempo: 1, melody, prog, note, intensity,
      timer: setInterval(() => this._schedule(), 25),
    };
  }

  setTempo(mul) {
    if (this.song) this.song.tempo = mul;
  }

  stopSong() {
    if (this.song) {
      clearInterval(this.song.timer);
      this.song = null;
    }
  }

  _schedule() {
    const s = this.song;
    if (!s || !this.ready) return;
    const c = this.ctx;
    const stepDur = 60 / (s.bpm * s.tempo) / 4;
    if (s.next < c.currentTime - 0.2) s.next = c.currentTime + 0.05;
    while (s.next < c.currentTime + 0.12) {
      this._playStep(s, s.step, s.next - c.currentTime, stepDur);
      s.next += stepDur;
      s.step = (s.step + 1) % 64;
    }
  }

  _playStep(s, step, when, dur) {
    const bar = Math.floor(step / 16);
    const st = step % 16;
    const chord = s.prog[bar];
    const M = this.music;
    // drums
    if (st % 8 === 0 || st === 10) this._kick(when);
    if (st === 4 || st === 12) this._noise(0.12, 0.35, 'bandpass', 1800, 900, when, M, 0.8);
    if (st % 2 === 0) this._noise(0.035, 0.12, 'highpass', 7000, 0, when, M);
    // bass
    if (st % 2 === 0) {
      const pat = [0, 0, 7, 0, 0, 7, 4, 7];
      const deg = chord + (pat[st / 2] === 7 ? 7 : pat[st / 2] === 4 ? 4 : 0);
      this._tone('triangle', mtof(s.note(chord) - 12 + (pat[st / 2] === 7 ? 12 : pat[st / 2] === 4 ? 7 : 0)), 0, dur * 1.8, 0.5, when, M);
      void deg;
    }
    // arpeggio
    const arp = [0, 2, 4, 7][st % 4];
    this._tone('square', mtof(s.note(chord + arp, 1)), 0, dur * 0.9, 0.05, when, M);
    // lead
    const n = s.melody[bar][st];
    if (n !== null && n !== undefined) this._tone('square', mtof(s.note(n, 0) + 12), 0, dur * 1.9, 0.11, when, M, 0.01);
  }

  _kick(when) {
    this._tone('sine', 150, 45, 0.18, 0.7, when, this.music, 0.002);
  }
}
