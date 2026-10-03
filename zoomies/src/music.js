// Procedural soundtrack. Every track gets its own full song, generated from
// the track's seed and theme: an intro, verses, choruses, a breakdown and a
// bridge (about 40-60 bars before anything repeats, and repeats come back
// varied), played by soft synthesised instruments (plucks, warm pads,
// filtered leads, bells) over bass lines and drum grooves that change with
// each section. The final lap lifts the key and picks up the pace.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
};

// 8-bar chord progressions as scale degrees.
const PROGS = {
  major: [
    [0, 4, 5, 3, 0, 4, 3, 4], [0, 5, 3, 4, 0, 5, 1, 4], [3, 4, 2, 5, 3, 4, 0, 0], [0, 2, 3, 4, 0, 2, 3, 4],
    [5, 3, 0, 4, 5, 3, 1, 4], [0, 3, 5, 4, 0, 3, 4, 4],
  ],
  minor: [
    [0, 5, 2, 6, 0, 5, 3, 4], [0, 3, 6, 2, 0, 3, 4, 4], [5, 6, 0, 0, 5, 6, 4, 4], [0, 6, 5, 6, 0, 6, 5, 4],
    [0, 3, 0, 4, 5, 3, 6, 4],
  ],
  dorian: [[0, 3, 0, 3, 0, 3, 6, 4], [0, 6, 3, 0, 0, 6, 3, 3], [0, 1, 3, 0, 6, 3, 1, 0]],
  mixo: [[0, 6, 3, 0, 0, 6, 3, 4], [0, 3, 6, 3, 0, 3, 4, 4]],
};

// Sound and groove per theme.
const STYLES = {
  meadow: { lead: 'pluck', pad: 'warm', arp: 'pluck', drums: 'bounce', bass: 'octave', bells: true },
  beach: { lead: 'soft', pad: 'warm', arp: 'marimba', drums: 'shuffle', bass: 'syncop', bells: false },
  desert: { lead: 'reed', pad: 'airy', arp: 'pluck', drums: 'rock', bass: 'eighths', scale: 'mixo' },
  frost: { lead: 'bell', pad: 'airy', arp: 'bell', drums: 'half', bass: 'hold', bells: true },
  candy: { lead: 'square', pad: 'warm', arp: 'marimba', drums: 'bounce', bass: 'octave', bells: true },
  neon: { lead: 'saw', pad: 'synth', arp: 'saw', drums: 'four', bass: 'eighths' },
  volcano: { lead: 'saw', pad: 'dark', arp: 'pluck', drums: 'rock', bass: 'eighths' },
  cloud: { lead: 'soft', pad: 'airy', arp: 'bell', drums: 'half', bass: 'walk', bells: true },
  haunted: { lead: 'organ', pad: 'dark', arp: 'bell', drums: 'shuffle', bass: 'walk' },
  jungle: { lead: 'reed', pad: 'warm', arp: 'marimba', drums: 'tribal', bass: 'syncop' },
  factory: { lead: 'square', pad: 'synth', arp: 'saw', drums: 'four', bass: 'syncop' },
  moon: { lead: 'bell', pad: 'synth', arp: 'saw', drums: 'half', bass: 'hold' },
  autumn: { lead: 'soft', pad: 'warm', arp: 'pluck', drums: 'shuffle', bass: 'walk' },
  garden: { lead: 'reed', pad: 'airy', arp: 'marimba', drums: 'half', bass: 'hold', scale: 'major' },
};

// Rhythm cells for one bar: note lengths in 16ths, negative = rest.
const CELLS = {
  sparse: [[8, 8], [6, 2, 8], [4, 4, 8], [12, 4], [4, -4, 8]],
  mid: [[4, 2, 2, 4, 4], [2, 2, 4, 4, 4], [3, 3, 2, 8], [4, 4, 2, 2, 4], [2, 2, 2, 2, 8], [6, 2, 4, 4]],
  busy: [[2, 2, 2, 2, 2, 2, 4], [1, 1, 2, 2, 2, 4, 4], [2, 1, 1, 2, 2, 2, 2, 4], [3, 3, 2, 2, 2, 4], [2, 2, 4, 2, 2, 4]],
};

export class Music {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.song = null;
    // A touch of room: a short feedback delay on everything musical.
    const d = ctx.createDelay(1);
    d.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.send = ctx.createGain();
    this.send.connect(d);
    d.connect(lp).connect(fb).connect(d);
    lp.connect(wet).connect(out);
  }

  // ---------- composition ----------
  play(def = {}, theme = 'meadow') {
    this.stop();
    const r = rng((def.seed || 1) * 7919 + 13);
    const style = { ...(STYLES[theme] || STYLES.meadow) };
    const scaleName = style.scale || def.scale || 'major';
    const scale = SCALES[scaleName] || SCALES.major;
    const progs = PROGS[scaleName] || PROGS.major;
    const pick = (a) => a[Math.floor(r() * a.length)];
    const progA = pick(progs);
    let progB = pick(progs);
    if (progB === progA) progB = progs[(progs.indexOf(progA) + 1) % progs.length];
    const progC = progs[(progs.indexOf(progB) + 1) % progs.length];
    const root = 48 + (def.key || 0);

    // Motifs: two-bar phrases built from chord tones with stepwise passing notes.
    const motif = (prog, density, startBar) => {
      const bars = [];
      let cur = prog[startBar % 8] + 7 + pick([0, 2, 4]);
      for (let b = 0; b < 2; b++) {
        const chord = prog[(startBar + b) % 8];
        const cell = pick(CELLS[density]);
        const notes = [];
        let t = 0;
        cell.forEach((len, i) => {
          const L = Math.abs(len);
          if (len > 0) {
            const strong = t % 4 === 0;
            if (strong || i === 0) {
              const tones = [chord, chord + 2, chord + 4, chord + 7].map((d) => d + 7);
              cur = tones.reduce((a, c) => (Math.abs(c - cur) < Math.abs(a - cur) ? c : a));
              if (r() < 0.25) cur = tones[Math.floor(r() * 3)];
            } else {
              cur += r() < 0.5 ? 1 : -1;
              if (r() < 0.2) cur += r() < 0.5 ? 2 : -2;
            }
            cur = Math.max(4, Math.min(16, cur));
            notes.push({ t, len: L, deg: cur });
          }
          t += L;
        });
        bars.push(notes);
      }
      return bars;
    };
    // An 8-bar melody: motif, varied answer, motif moved to the new chords, cadence.
    const melody8 = (prog, density) => {
      const m1 = motif(prog, density, 0);
      const m2 = motif(prog, density, 2);
      const shift = (bars, by) => bars.map((bar) => bar.map((n) => ({ ...n, deg: n.deg + by })));
      const m3 = shift(m1, prog[4] - prog[0]);
      const cad = motif(prog, 'sparse', 6);
      // End on a chord tone of the last chord, held.
      const last = cad[1];
      if (last.length) last[last.length - 1] = { ...last[last.length - 1], deg: prog[7] + 7, len: 16 - last[last.length - 1].t };
      return [...m1, ...m2, ...m3, ...cad];
    };
    const verse = melody8(progA, 'mid');
    const chorus = melody8(progB, r() < 0.5 ? 'busy' : 'mid');
    const bridge = melody8(progC, 'sparse');

    // Song form. Each section: chords, melody (or none), and which parts play.
    const S = (name, prog, mel, parts) => ({ name, prog, mel, bars: 8, ...parts });
    const intro = { name: 'intro', prog: progA, mel: null, bars: 4, pad: 1, arp: 1, drums: 'intro', bass: 'hold' };
    const form = [
      S('verse', progA, verse, { pad: 1, arp: 0, drums: 'main', bass: style.bass }),
      S('chorus', progB, chorus, { pad: 1, arp: 1, drums: 'main', bass: style.bass, bells: style.bells }),
      S('verse2', progA, verse, { pad: 1, arp: 1, drums: 'main', bass: style.bass, vary: 1 }),
      { name: 'break', prog: progC, mel: null, bars: 4, pad: 1, arp: 1, drums: 'break', bass: 'hold' },
      S('bridge', progC, bridge, { pad: 1, arp: 0, drums: 'half', bass: 'walk', counter: 1 }),
      S('chorus2', progB, chorus, { pad: 1, arp: 1, drums: 'main', bass: style.bass, bells: style.bells, vary: 2 }),
    ];
    const bpm = (def.bpm || 140) * 0.92;
    this.song = {
      root, scale, style, intro, form, bpm, tempo: 1, lift: 0,
      sec: -1, secBar: 0, step: 0, next: this.ctx.currentTime + 0.12,
      timer: setInterval(() => this._schedule(), 25),
    };
    this._enter(-1);
  }

  stop() {
    if (this.song) {
      clearInterval(this.song.timer);
      this.song = null;
    }
  }

  setTempo(mul) {
    if (this.song) this.song.tempo = mul;
  }

  // Final lap: up a key, a touch faster, straight into a chorus.
  finalLap() {
    const s = this.song;
    if (!s || s.lift) return;
    s.lift = 1;
    s.tempo = 1.06;
    s.pendingChorus = true;
  }

  _enter(i) {
    const s = this.song;
    s.sec = i;
    s.secBar = 0;
    s.cur = i < 0 ? s.intro : s.form[i % s.form.length];
    s.loop = i < 0 ? 0 : Math.floor(i / s.form.length);
  }

  _schedule() {
    const s = this.song;
    if (!s || this.ctx.state !== 'running') return;
    if (s.next < this.ctx.currentTime - 0.2) s.next = this.ctx.currentTime + 0.05;
    this.scheduleUntil(this.ctx.currentTime + 0.14);
  }

  // Queue every note that starts before time t (also used to pre-render).
  scheduleUntil(t) {
    const s = this.song;
    if (!s) return;
    while (s.next < t) {
      const stepDur = 60 / (s.bpm * s.tempo) / 4;
      this._step(s, s.next, stepDur);
      s.next += stepDur;
      s.step++;
      if (s.step === 16) {
        s.step = 0;
        s.secBar++;
        if (s.secBar >= s.cur.bars) {
          let n = s.sec + 1;
          if (s.pendingChorus) {
            s.pendingChorus = false;
            const base = Math.max(0, n) - (Math.max(0, n) % s.form.length);
            n = base + 1;
          }
          this._enter(n);
        }
      }
    }
  }

  // ---------- performance ----------
  _deg(s, deg, oct = 0) {
    const o = Math.floor(deg / 7);
    const d = ((deg % 7) + 7) % 7;
    return s.root + s.lift + s.scale[d] + 12 * (o + oct);
  }

  _step(s, when, dur) {
    const sec = s.cur, st = s.step, bar = s.secBar;
    const chord = sec.prog[bar % 8];
    const lastBar = bar === sec.bars - 1;
    const style = s.style;
    // Drums
    this._drums(sec.drums, style.drums, st, when, dur, lastBar, s.loop);
    // Bass
    this._bass(sec.bass, s, chord, st, when, dur);
    // Pad: the chord, held for the bar
    if (sec.pad && st === 0) {
      const notes = [chord, chord + 2, chord + 4].map((d) => this._deg(s, d, 0));
      if (sec.name.startsWith('chorus') || sec.name === 'bridge') notes.push(this._deg(s, chord + 6, 0));
      for (const n of notes) this._pad(style.pad, mtof(n), when, dur * 16);
    }
    // Arpeggio
    if (sec.arp && (sec.name !== 'intro' || bar >= 1)) {
      const pat = [0, 2, 4, 7, 4, 2, 0, 4];
      if (st % 2 === 0) this._inst(style.arp, mtof(this._deg(s, chord + pat[(st / 2) % 8], 1)), when, dur * 1.5, 0.035);
    }
    // Lead melody (varied on repeats: an octave up, or thinned out)
    if (sec.mel) {
      const notes = sec.mel[bar % sec.mel.length];
      for (const n of notes) {
        if (n.t !== st) continue;
        const up = sec.vary === 2 || s.loop % 2 === 1 ? 12 : 0;
        if (sec.vary === 1 && n.len <= 2 && (bar + st) % 3 === 0) continue;
        this._inst(style.lead, mtof(this._deg(s, n.deg, 0) + up), when, dur * n.len * 0.95, 0.08);
      }
    }
    // Counter-melody in the bridge: slow bells a third above the chord
    if (sec.counter && (st === 0 || st === 8)) this._inst('bell', mtof(this._deg(s, chord + (st ? 4 : 2) + 7, 1)), when, dur * 8, 0.03);
    // Sparkle bells in choruses
    if (sec.bells && st % 4 === 2 && (bar + st) % 3 === 0) this._inst('bell', mtof(this._deg(s, chord + 4, 2)), when, dur * 4, 0.02);
  }

  _drums(kind, groove, st, when, dur, lastBar, loop) {
    if (kind === 'intro') {
      if (st % 4 === 0) this._hat(when, 0.05);
      if (st === 0) this._kick(when, 0.5);
      return;
    }
    if (kind === 'break') {
      if (st % 2 === 0) this._hat(when, 0.04);
      if (lastBar && st >= 8) this._snare(when, 0.1 + (st - 8) * 0.03);
      return;
    }
    if (lastBar && st >= 12) {
      // Fill into the next section
      this._snare(when, 0.14 + (st - 12) * 0.04);
      if (st === 12) this._kick(when, 0.6);
      return;
    }
    const g = kind === 'half' ? 'half' : groove;
    const K = { four: [0, 4, 8, 12], rock: [0, 8, 10], bounce: [0, 6, 8, 11], shuffle: [0, 7, 10], half: [0, 10], tribal: [0, 3, 6, 10, 12] }[g] || [0, 8];
    const S = { four: [4, 12], rock: [4, 12], bounce: [4, 12], shuffle: [4, 12], half: [8], tribal: [4, 12] }[g] || [4, 12];
    if (K.includes(st)) this._kick(when, 0.6);
    if (S.includes(st)) this._snare(when, 0.17);
    if (g === 'tribal' && (st === 2 || st === 14)) this._tom(when);
    const swing = g === 'shuffle' && st % 2 === 1 ? dur * 0.33 : 0;
    if (st % 2 === 0 || g === 'four') this._hat(when + swing, st % 4 === 2 ? 0.05 : 0.03);
    if (g === 'four' && st % 4 === 2) this._hat(when, 0.05, true);
    if (loop % 2 === 1 && st === 14) this._hat(when, 0.04, true);
  }

  _bass(kind, s, chord, st, when, dur) {
    const r0 = this._deg(s, chord, -1);
    const n = (semi) => mtof(r0 + semi);
    const b = (f, len, v = 0.3) => this._inst('bass', f, when, dur * len, v);
    switch (kind) {
      case 'hold': if (st === 0) b(n(0), 15, 0.26); break;
      case 'eighths': if (st % 2 === 0) b(n(st === 6 || st === 14 ? 7 : 0), 1.6, 0.24); break;
      case 'octave': if (st % 2 === 0) b(n([0, 12, 0, 12, 0, 12, 7, 12][st / 2]), 1.6, 0.24); break;
      case 'syncop': if ([0, 3, 6, 10, 12].includes(st)) b(n(st === 10 ? 7 : 0), st === 12 ? 3.5 : 2.5, 0.26); break;
      case 'walk': if (st % 4 === 0) {
        const third = s.scale[(((chord + 2) % 7) + 7) % 7] - s.scale[((chord % 7) + 7) % 7];
        b(n([0, (third + 12) % 12, 7, 10][st / 4]), 3.6, 0.26);
      } break;
      default: if (st % 4 === 0) b(n(0), 3.5, 0.26);
    }
  }

  // ---------- instruments ----------
  _env(g, when, attack, peak, decayTo, dur, release) {
    const p = g.gain;
    p.setValueAtTime(0.0001, when);
    p.linearRampToValueAtTime(peak, when + attack);
    p.setTargetAtTime(Math.max(0.0001, decayTo), when + attack, Math.max(0.01, dur * 0.35));
    p.setTargetAtTime(0.0001, when + dur, release);
  }

  _osc(type, f, when, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(when);
    o.stop(end);
    return o;
  }

  _inst(kind, f, t0, dur, vol) {
    const c = this.ctx;
    const when = c.currentTime + Math.max(0, t0 - c.currentTime);
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.connect(g);
    g.connect(this.out);
    if (kind !== 'bass') g.connect(this.send);
    const end = when + dur + 0.6;
    switch (kind) {
      case 'pluck':
        lp.frequency.setValueAtTime(3800, when);
        lp.frequency.exponentialRampToValueAtTime(700, when + 0.3);
        this._osc('triangle', f, when, end, lp);
        this._osc('square', f, when, end, lp, 6);
        this._env(g, when, 0.004, vol * 0.9, vol * 0.05, Math.min(dur, 0.35), 0.12);
        break;
      case 'marimba':
        lp.frequency.value = 3000;
        this._osc('sine', f, when, end, lp);
        this._osc('sine', f * 4, when, when + 0.08, lp);
        this._env(g, when, 0.003, vol * 1.2, vol * 0.02, Math.min(dur, 0.25), 0.08);
        break;
      case 'bell':
        lp.frequency.value = 6000;
        this._osc('sine', f, when, end + 0.8, lp);
        this._osc('sine', f * 2.76, when, when + 0.4, lp);
        this._env(g, when, 0.004, vol * 1.1, vol * 0.2, dur, 0.5);
        break;
      case 'soft':
        lp.frequency.value = 1900;
        this._osc('sawtooth', f, when, end, lp, -7);
        this._osc('triangle', f, when, end, lp, 5);
        this._env(g, when, 0.03, vol * 0.8, vol * 0.55, dur, 0.18);
        break;
      case 'saw':
        lp.frequency.setValueAtTime(900, when);
        lp.frequency.linearRampToValueAtTime(2600, when + 0.08);
        lp.Q.value = 3;
        this._osc('sawtooth', f, when, end, lp, -9);
        this._osc('sawtooth', f, when, end, lp, 9);
        this._env(g, when, 0.01, vol * 0.7, vol * 0.45, dur, 0.12);
        break;
      case 'square':
        lp.frequency.value = 2200;
        this._osc('square', f, when, end, lp);
        this._env(g, when, 0.008, vol * 0.6, vol * 0.4, dur, 0.1);
        break;
      case 'reed':
        lp.frequency.value = 1500;
        lp.Q.value = 2;
        this._osc('sawtooth', f, when, end, lp);
        this._osc('square', f * 2, when, end, lp, 3);
        this._env(g, when, 0.04, vol * 0.6, vol * 0.5, dur, 0.15);
        break;
      case 'organ':
        lp.frequency.value = 2400;
        for (const [m, v] of [[1, 1], [2, 0.5], [3, 0.3]]) {
          const og = c.createGain();
          og.gain.value = v;
          og.connect(lp);
          this._osc('sine', f * m, when, end, og);
        }
        this._env(g, when, 0.02, vol * 0.7, vol * 0.6, dur, 0.1);
        break;
      case 'bass':
        lp.frequency.value = 700;
        this._osc('triangle', f, when, end, lp);
        this._osc('sine', f / 2, when, end, lp);
        this._env(g, when, 0.006, vol, vol * 0.6, dur, 0.06);
        break;
      default:
        this._osc('triangle', f, when, end, lp);
        this._env(g, when, 0.01, vol, vol * 0.4, dur, 0.1);
    }
  }

  _pad(kind, f, t0, dur) {
    const c = this.ctx;
    const when = c.currentTime + Math.max(0, t0 - c.currentTime);
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = { warm: 900, airy: 1500, synth: 1200, dark: 600 }[kind] || 900;
    lp.connect(g);
    g.connect(this.out);
    g.connect(this.send);
    const end = when + dur + 0.8;
    const type = kind === 'airy' ? 'triangle' : 'sawtooth';
    this._osc(type, f, when, end, lp, -8);
    this._osc(type, f, when, end, lp, 8);
    const v = kind === 'airy' ? 0.03 : 0.018;
    const p = g.gain;
    p.setValueAtTime(0.0001, when);
    p.linearRampToValueAtTime(v, when + Math.min(0.5, dur * 0.3));
    p.setValueAtTime(v, when + dur * 0.85);
    p.linearRampToValueAtTime(0.0001, when + dur + 0.6);
  }

  _noiseHit(when, vol, type, f0, f1, dur, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, when);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(when, Math.random() * 0.5);
    s.stop(when + dur + 0.02);
  }

  _kick(t0, v = 0.6) {
    const c = this.ctx;
    const when = c.currentTime + Math.max(0, t0 - c.currentTime);
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(130, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.14);
    g.gain.setValueAtTime(v, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.25);
  }

  _snare(t0, v) {
    const when = this.ctx.currentTime + Math.max(0, t0 - this.ctx.currentTime);
    this._noiseHit(when, v, 'bandpass', 2200, 1200, 0.14, 0.7);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(220, when);
    o.frequency.exponentialRampToValueAtTime(140, when + 0.08);
    g.gain.setValueAtTime(v * 0.5, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.1);
  }

  _hat(t0, v, open = false) {
    const when = this.ctx.currentTime + Math.max(0, t0 - this.ctx.currentTime);
    this._noiseHit(when, v, 'highpass', 7500, 0, open ? 0.16 : 0.035);
  }

  _tom(t0) {
    const c = this.ctx;
    const when = c.currentTime + Math.max(0, t0 - c.currentTime);
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(180, when);
    o.frequency.exponentialRampToValueAtTime(90, when + 0.2);
    g.gain.setValueAtTime(0.25, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.3);
  }
}
