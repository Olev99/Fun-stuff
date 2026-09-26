import * as THREE from 'three';
import { loadSettings, saveSettings, loadRecords, saveRecords, QUALITY } from './settings.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { Showroom } from './showroom.js';
import { Race } from './race.js';
import { CHARACTERS } from './characters.js';
import { TRACKS, CUPS, trackById } from './tracks.js';
import { setMaxAniso } from './textures.js';
import { fmtTime, ordinal } from './util.js';

const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
const isTouch = matchMedia('(pointer: coarse)').matches;
const $ = (id) => document.getElementById(id);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class App {
  constructor() {
    this.settings = loadSettings();
    this.records = loadRecords();
    this.canvas = $('gl');
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.type = THREE.PCFShadowMap;
    setMaxAniso(r.capabilities.getMaxAnisotropy());
    this.applyQuality(true);

    this.audio = new Audio();
    this.audio.musicOn = this.settings.music;
    this.audio.sfxOn = this.settings.sfx;
    this.input = new Input(this.settings);
    this.input.bindTouch($('controls'));
    this.hud = new HUD(this);
    this.ui = new UI(this);
    this.showroom = new Showroom(this);
    this.portraits = this.showroom.portraits(r, 112);
    $('fps').hidden = !this.settings.showFps;

    this.race = null;
    this.view = null;
    this.paused = false;
    this.gp = null;
    this.ft = 1 / 60;
    this.drTimer = 0;
    this.goodTime = 0;
    this.blockRaise = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;

    this.resize();
    addEventListener('resize', () => this.resize());
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.paused) this.resume();
        else this.pause();
      }
    });
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
    this.canvas.addEventListener('webglcontextrestored', () => location.reload());

    this.toTitle();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    setTimeout(() => {
      const l = $('loading');
      l.style.opacity = 0;
      setTimeout(() => l.remove(), 450);
    }, 60);
  }

  // ---------------- setup ----------------
  applyQuality(initial = false) {
    this.quality = QUALITY[this.settings.quality] || QUALITY.auto;
    const dpr = window.devicePixelRatio || 1;
    this.maxPR = Math.min(dpr, this.quality.maxPR);
    this.minPR = Math.min(dpr, this.quality.minPR);
    this.pr = Math.min(dpr, this.quality.startPR);
    this.renderer.shadowMap.enabled = !!this.quality.shadows;
    if (!initial) this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.showroom.setSize(w, h);
    if (this.race) this.race.setSize(w, h, this.pr);
  }

  firstGesture() {
    this.audio.unlock();
    if (this._gestured) return;
    this._gestured = true;
    if (this.settings.steering === 'tilt' && isTouch) {
      this.input.requestTilt().then((ok) => {
        if (!ok) {
          this.settings.steering = 'touch';
          saveSettings(this.settings);
        }
        this.applyControls();
      });
    }
    if (this.race && this.race.mode === 'demo') this.audio.playSong(this.race.trackDef.music);
  }

  applyControls() {
    const el = $('controls');
    const racing = this.race && this.race.mode !== 'demo' && !this.paused && ['intro', 'countdown', 'race'].includes(this.race.state);
    el.hidden = !(isTouch && racing);
    const tilt = this.settings.steering === 'tilt' && this.input.tilt.listening;
    el.className = tilt ? 'tilt' : 'touch';
  }

  // ---------------- views ----------------
  disposeRace() {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
  }

  toTitle() {
    this.paused = false;
    this.gp = null;
    this.audio.stopEngine();
    this.audio.setTempo(1);
    this.hud.show(false);
    const def = TRACKS[Math.floor(Math.random() * TRACKS.length)];
    this.startDemo(def.id, false);
    this.ui.title();
    this.applyControls();
    this.releaseWake();
  }

  startDemo(trackId, reverse) {
    this.disposeRace();
    const grid = shuffle(CHARACTERS.map((c) => c.id));
    this.race = new Race(this, { mode: 'demo', trackDef: trackById(trackId), reverse, grid, speedClass: 'zoom', laps: 99 });
    this.race.setSize(this.w, this.h, this.pr);
    // let the demo pack spread out a little before we show it
    for (let i = 0; i < 90; i++) this.race.update(1 / 60);
    this.view = this.race;
    if (this.audio.ready) this.audio.playSong(this.race.trackDef.music);
  }

  previewTrack(trackId, reverse) {
    clearTimeout(this._prevT);
    this._prevT = setTimeout(() => {
      const r = this.race;
      if (r && r.mode === 'demo' && r.trackDef.id === trackId && r.track.reverse === !!reverse) {
        this.view = r;
        return;
      }
      this.startDemo(trackId, !!reverse);
    }, 60);
  }

  showShowroom() {
    this.disposeRace();
    this.view = this.showroom;
  }

  makeGrid(player, gpOrder = null) {
    const others = CHARACTERS.filter((c) => c.id !== player).map((c) => c.id);
    if (gpOrder) return gpOrder;
    shuffle(others);
    others.splice(5, 0, player);
    return others;
  }

  startFromMenu(mode) {
    const s = this.settings;
    if (mode === 'gp') {
      const cup = CUPS.find((c) => c.id === s.cup) || CUPS[0];
      this.gp = { cup, tracks: cup.tracks, reverse: cup.reverse, index: 0, points: {}, speedClass: s.speedClass, player: s.char };
      for (const c of CHARACTERS) this.gp.points[c.id] = 0;
      this.startGPRace();
    } else {
      this.gp = null;
      this.startRace({ mode, trackId: s.track, reverse: s.reverse, player: s.char, speedClass: s.speedClass });
    }
  }

  startGPRace() {
    const gp = this.gp;
    let order = null;
    if (gp.index > 0) {
      // Leader starts at the back.
      order = CHARACTERS.map((c) => c.id).sort((a, b) => gp.points[a] - gp.points[b] || (a === gp.player ? 1 : -1));
    }
    this.startRace({ mode: 'gp', trackId: gp.tracks[gp.index], reverse: gp.reverse, player: gp.player, speedClass: gp.speedClass, order });
  }

  startRace(cfg) {
    this.lastCfg = cfg;
    this.disposeRace();
    this.paused = false;
    const grid = this.makeGrid(cfg.player, cfg.order);
    this.race = new Race(this, {
      mode: cfg.mode, trackDef: trackById(cfg.trackId), reverse: cfg.reverse, player: cfg.player, grid, speedClass: cfg.speedClass, laps: 3,
    });
    this.race.setSize(this.w, this.h, this.pr);
    this.view = this.race;
    this.ui.hideAll();
    this.hud.reset(this.race);
    this.hud.show(true);
    this.input.resetButtons();
    this.applyControls();
    this.audio.unlock();
    this.audio.startEngine();
    this.audio.setTempo(1);
    this.audio.playSong(this.race.trackDef.music);
    this._tiltChecked = false;
    this.requestWake();
  }

  restart() {
    if (this.lastCfg) this.startRace(this.lastCfg);
  }

  pause() {
    const r = this.race;
    if (!r || r.mode === 'demo' || this.paused || !['intro', 'countdown', 'race'].includes(r.state)) return;
    this.paused = true;
    this.audio.suspend();
    this.input.resetButtons();
    this.ui.show('pause');
    this.applyControls();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.audio.resume();
    this.ui.hideAll();
    this.input.resetButtons();
    this.applyControls();
    this.last = performance.now();
  }

  onVisibility() {
    if (document.hidden) {
      if (this.race && this.race.mode !== 'demo' && ['intro', 'countdown', 'race'].includes(this.race.state)) this.pause();
      this.audio.suspend();
    } else {
      if (!this.paused) this.audio.resume();
      if (this.race && this.race.mode !== 'demo') this.requestWake();
      this.last = performance.now();
    }
  }

  async requestWake() {
    try {
      if ('wakeLock' in navigator && !this.wake && !document.hidden) {
        this.wake = await navigator.wakeLock.request('screen');
        this.wake.addEventListener('release', () => { this.wake = null; });
      }
    } catch (e) {
      this.wake = null;
    }
  }

  releaseWake() {
    if (this.wake) {
      this.wake.release().catch(() => {});
      this.wake = null;
    }
  }

  // ---------------- results ----------------
  onRaceComplete(race, rows) {
    this.audio.stopEngine();
    this.applyControls();
    this.hud.show(false);
    const ui = this.ui;
    const me = rows.find((r) => r.isPlayer);
    const key = race.trackDef.id + (race.track.reverse ? '-r' : '');
    if (race.mode === 'tt') {
      const rec = this.records[key] || {};
      const total = me.time;
      const bestLap = Math.min(...(me.lapTimes.length ? me.lapTimes : [Infinity]));
      const newBest = !rec.tt || total < rec.tt;
      if (newBest) rec.tt = total;
      if (!rec.lap || bestLap < rec.lap) rec.lap = bestLap;
      this.records[key] = rec;
      saveRecords(this.records);
      ui.results({
        title: newBest ? 'New record!' : 'Time trial',
        sub: race.trackDef.name,
        html: `<div class="big-msg"><em>${fmtTime(total)}</em></div>
          <div class="tt-times">${me.lapTimes.map((t, i) => `<div><small>Lap ${i + 1}</small>${fmtTime(t)}</div>`).join('')}
          <div><small>Best total</small>${fmtTime(rec.tt)}</div><div><small>Best lap</small>${fmtTime(rec.lap)}</div></div>`,
        buttons: [['menu', 'Menu', 'ghost small'], ['tracks', 'Tracks', 'alt'], ['retry', 'Retry', 'hot']],
      });
      return;
    }
    if (race.mode === 'gp') {
      const gp = this.gp;
      for (const r of rows) {
        r.plus = POINTS[r.place - 1] || 0;
        gp.points[r.ch.id] += r.plus;
      }
      const last = gp.index >= gp.tracks.length - 1;
      ui.results({
        title: `${me.place}${ordinal(me.place).toLowerCase()} place`,
        sub: `Race ${gp.index + 1} of ${gp.tracks.length} · ${race.trackDef.name}`,
        html: `<div class="results">${rows.map((r) => ui.row(r, `<span class="plus">+${r.plus}</span><span class="pts">${gp.points[r.ch.id]}</span>`)).join('')}</div>`,
        buttons: last ? [['menu', 'Quit', 'ghost small'], ['final', 'Final standings', 'hot']] : [['menu', 'Quit', 'ghost small'], ['next', 'Next race', 'hot']],
      });
      return;
    }
    ui.results({
      title: `${me.place}${ordinal(me.place).toLowerCase()} place`,
      sub: race.trackDef.name,
      html: `<div class="results">${rows.map((r) => ui.row(r, `<span></span><span class="pts">${fmtTime(r.time)}</span>`)).join('')}</div>`,
      buttons: [['menu', 'Menu', 'ghost small'], ['tracks', 'Tracks', 'alt'], ['retry', 'Race again', 'hot']],
    });
  }

  showGPFinal() {
    const gp = this.gp;
    const table = CHARACTERS.map((c) => ({ ch: c, pts: gp.points[c.id], isPlayer: c.id === gp.player }))
      .sort((a, b) => b.pts - a.pts || (a.isPlayer ? -1 : 1));
    table.forEach((r, i) => (r.place = i + 1));
    const me = table.find((r) => r.isPlayer);
    const trophy = me.place === 1 ? '🏆' : me.place === 2 ? '🥈' : me.place === 3 ? '🥉' : '🏁';
    const key = `cup:${gp.cup.id}`;
    const prevBest = this.records[key];
    const prevN = prevBest ? parseInt(prevBest, 10) : 99;
    if (me.place < prevN) {
      this.records[key] = `${me.place}${ordinal(me.place).toLowerCase()}`;
      saveRecords(this.records);
    }
    const msg = me.place === 1 ? `You won the <em>${gp.cup.name}</em>!` : `You finished <em>${me.place}${ordinal(me.place).toLowerCase()}</em> overall`;
    this.audio.play(me.place <= 3 ? 'finish' : 'lose');
    this.ui.results({
      title: 'Final standings',
      sub: gp.cup.name,
      html: `<div class="trophy">${trophy}</div><div class="big-msg" style="margin:4px 0 10px">${msg}</div>
        <div class="results">${table.map((r) => this.ui.row(r, `<span></span><span class="pts">${r.pts}</span>`)).join('')}</div>`,
      buttons: [['menu', 'Menu', 'ghost small'], ['again', 'Play again', 'hot']],
    });
  }

  onResultsAction(action) {
    switch (action) {
      case 'retry':
        this.restart();
        break;
      case 'tracks':
        this.ui.mode = this.lastCfg.mode;
        this.ui.trackSelect();
        break;
      case 'menu':
        this.toTitle();
        break;
      case 'next':
        this.gp.index++;
        this.startGPRace();
        break;
      case 'final':
        this.showGPFinal();
        break;
      case 'again': {
        const cup = this.gp.cup;
        this.settings.cup = cup.id;
        this.startFromMenu('gp');
        break;
      }
    }
  }

  // ---------------- loop ----------------
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);

    if (!this.paused && this.view) {
      this.view.update(dt);
      this._checkTilt();
      this._frameStats(dt);
      this.renderer.render(this.view.scene, this.view.camera);
    }
    this.ui.tick(dt);
  }

  _checkTilt() {
    const r = this.race;
    if (!r || r.mode === 'demo' || this._tiltChecked || r.state !== 'race' || r.raceTime < 2.5) return;
    this._tiltChecked = true;
    if (isTouch && this.settings.steering === 'tilt' && !this.input.tiltLive) {
      this.settings.steering = 'touch';
      saveSettings(this.settings);
      this.applyControls();
      this.hud.toast('No tilt sensor: touch steering on');
      this.hud.hint('Drag on the left side of the screen to steer', 4);
    }
  }

  _frameStats(dt) {
    this.ft += (dt - this.ft) * 0.08;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      if (this.settings.showFps) {
        const info = this.renderer.info.render;
        this.hud.fps(`${Math.round(this.fpsFrames / this.fpsTime)} fps · ${this.pr.toFixed(2)}x · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris`);
      }
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    // Dynamic resolution
    if (this.blockRaise > 0) this.blockRaise -= dt;
    this.drTimer += dt;
    if (this.ft > 1 / 50) {
      this.goodTime = 0;
      if (this.drTimer > 1.2 && this.pr > this.minPR + 0.01) {
        this.pr = Math.max(this.minPR, this.pr - 0.25);
        this.drTimer = 0;
        this.blockRaise = 20;
        this.resize();
      }
    } else if (this.ft < 1 / 57) {
      this.goodTime += dt;
      if (this.goodTime > 5 && this.blockRaise <= 0 && this.pr < this.maxPR - 0.01) {
        this.pr = Math.min(this.maxPR, this.pr + 0.25);
        this.goodTime = 0;
        this.drTimer = 0;
        this.resize();
      }
    }
  }
}

function boot() {
  try {
    window.zoomies = new App();
  } catch (e) {
    console.error(e, e.stack);
    const m = $('loading-msg');
    if (m) m.textContent = `Could not start: ${e.message}. Try reloading.`;
  }
}

const fontsReady = document.fonts && document.fonts.load ? Promise.race([
  Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('700 16px "Baloo 2"')]),
  new Promise((r) => setTimeout(r, 1500)),
]) : Promise.resolve();
fontsReady.then(boot, boot);

