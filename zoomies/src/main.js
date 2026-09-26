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
import { NetSession } from './net.js';
import { PostFX } from './post.js';

const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

// Can this browser render into half-float targets (needed for HDR bloom)?
const HDR = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ok = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return ok;
  } catch (e) {
    return false;
  }
})();
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
      // With HDR post-processing the scene is drawn (with MSAA) into an
      // offscreen target, so the screen buffer needs no AA and no depth.
      canvas: this.canvas, antialias: !HDR, depth: !HDR, powerPreference: 'high-performance', stencil: false,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    // Only used if half-float render targets are missing and we draw straight
    // to the screen; the post pipeline does its own tone mapping.
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    this.post = new PostFX(r);
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
    // iOS only applies :active styles when a touch listener exists.
    document.addEventListener('touchstart', () => {}, { passive: true });
    // Any tap unlocks (or, after a phone call or app switch, revives) audio.
    const kick = () => { if (!this.paused && !this.audio.ready) this.audio.unlock(); };
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, kick, { capture: true, passive: true });
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
    this.post.configure({ samples: this.quality.msaa, bloom: this.quality.bloom });
    this.drTimer = 0;
    this.goodTime = 0;
    this.blockRaise = 3;
    if (!initial) this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(Math.floor(w * this.pr), Math.floor(h * this.pr));
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
    const racing = this.race && this.race.mode !== 'demo' && !this.paused && !this.menuOpen && ['intro', 'countdown', 'race'].includes(this.race.state);
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
    clearTimeout(this._prevT);
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
      mode: cfg.mode, trackDef: trackById(cfg.trackId), reverse: cfg.reverse, player: cfg.player, grid, speedClass: cfg.speedClass,
      difficulty: cfg.difficulty || this.settings.difficulty, laps: trackById(cfg.trackId).laps || 3,
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
    if (!r || r.mode === 'demo' || this.paused || !['intro', 'countdown', 'race', 'wait'].includes(r.state)) return;
    document.querySelector('#scr-pause [data-go="restart"]').hidden = r.mode === 'mp';
    if (r.mode === 'mp') {
      // Online races cannot stop for one player: show the menu but keep racing.
      this.menuOpen = true;
      this.input.resetButtons();
      this.ui.show('pause');
      this.applyControls();
      return;
    }
    this.paused = true;
    this.audio.suspend();
    this.input.resetButtons();
    this.ui.show('pause');
    this.applyControls();
  }

  resume() {
    if (this.menuOpen) {
      this.menuOpen = false;
      this.ui.hideAll();
      this.applyControls();
      return;
    }
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
      if (this.race && this.race.mode !== 'demo' && this.race.mode !== 'mp' && ['intro', 'countdown', 'race'].includes(this.race.state)) this.pause();
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
    this.menuOpen = false;
    this.applyControls();
    this.hud.show(false);
    const ui = this.ui;
    const me = rows.find((r) => r.isPlayer);
    if (race.mode === 'mp') {
      const host = this.session && this.session.isHost;
      ui.results({
        title: me ? `${me.place}${ordinal(me.place).toLowerCase()} place` : 'Results',
        sub: `Online · ${race.trackDef.name}`,
        html: `<div class="results">${rows.map((r) => ui.row(r, `<span></span><span class="pts">${r.finished ? fmtTime(r.time) : '--'}</span>`)).join('')}</div>`
          + (host ? '' : '<p class="lobby-summary" style="margin:8px 0 0">Waiting for the host to pick the next race…</p>'),
        buttons: host ? [['leave', 'Leave', 'ghost small'], ['lobby', 'Back to lobby', 'hot']] : [['leave', 'Leave', 'ghost small']],
      });
      return;
    }
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
      case 'lobby':
        this.backToLobby();
        break;
      case 'leave':
        this.leaveMP();
        break;
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

  // ---------------- multiplayer ----------------
  openMultiplayer() {
    if (!NetSession.supported()) {
      this.ui.lobby('start', 'Online races need the full game page (open it in Safari, not inside another app).');
      return;
    }
    this.ui.lobby(this.session ? 'room' : 'start');
  }

  onLobbyAction(action) {
    if (action === 'host') this.hostMP();
    else if (action === 'join') this.joinMP(document.getElementById('join-code').value.trim());
    else if (action === 'leave') this.leaveMP();
    else if (action === 'char') { this.ui.mode = 'mp'; this.ui.charSelect(); }
    else if (action === 'start') this.startMP();
  }

  _wireSession(ses) {
    ses.onLobby = () => {
      if (this.ui.current === 'lobby') this.ui.renderLobby();
      if (ses.isGuest && this.ui.current === 'lobby') this.previewTrack(ses.lobby.track, ses.lobby.reverse);
    };
    ses.onClosed = (reason) => {
      const inRace = this.race && this.race.mode === 'mp';
      this.session = null;
      ses.close();
      if (inRace) this.toTitle();
      this.ui.lobby('start', reason || 'Disconnected.');
    };
    ses.onError = (e) => {
      if (this.ui.current === 'lobby' && !ses.players.length) this.ui.lobby('start', (e && e.message) || 'Connection problem.');
    };
    ses.onStart = (cfg) => this.startNetRace(cfg);
    ses.onToLobby = () => this.returnToLobbyView();
  }

  // Tear down any half-open session (a double tap on Host/Join used to leave
  // an orphaned connection behind, which showed up as an extra idle player).
  _resetSession() {
    if (this.session) {
      const old = this.session;
      this.session = null;
      old.close();
    }
  }

  async hostMP() {
    if (this._netBusy) return;
    this._netBusy = true;
    try {
      await this._hostMP();
    } finally {
      this._netBusy = false;
    }
  }

  async joinMP(code) {
    if (this._netBusy) return;
    this._netBusy = true;
    try {
      await this._joinMP(code);
    } finally {
      this._netBusy = false;
    }
  }

  async _hostMP() {
    this._resetSession();
    this.ui.lobby('start', 'Creating a room…');
    const ses = new NetSession(this);
    this._wireSession(ses);
    try {
      await ses.host(this.settings.char);
    } catch (e) {
      ses.close();
      this.ui.lobby('start', `Could not create a room: ${(e && e.message) || e}. Check your internet connection.`);
      return;
    }
    this.session = ses;
    ses.lobby = { track: this.settings.track, reverse: false, speedClass: this.settings.speedClass, difficulty: this.settings.difficulty, ai: true };
    this.ui.lobby('room');
    this.previewTrack(ses.lobby.track, false);
  }

  async _joinMP(code) {
    if (!/^[A-Za-z0-9]{4}$/.test(code)) {
      this.ui.lobby('start', 'Type the 4-letter code shown on the host\'s phone.');
      return;
    }
    this._resetSession();
    this.ui.lobby('start', 'Connecting…');
    const ses = new NetSession(this);
    this._wireSession(ses);
    try {
      await ses.join(code, this.settings.char);
    } catch (e) {
      ses.close();
      this.ui.lobby('start', (e && e.message) || 'Could not connect.');
      return;
    }
    this.session = ses;
    this.ui.lobby('room');
  }

  mpCharDone() {
    if (this.session) this.session.pickChar(this.settings.char);
    this.returnToLobbyView();
  }

  returnToLobbyView() {
    this.menuOpen = false;
    this.hud.show(false);
    this.audio.stopEngine();
    this.audio.setTempo(1);
    if (!this.session) { this.toTitle(); return; }
    this.ui.lobby('room');
    this.previewTrack(this.session.lobby.track, this.session.lobby.reverse);
    this.applyControls();
  }

  backToLobby() {
    const ses = this.session;
    if (!ses) { this.toTitle(); return; }
    ses.inRace = false;
    if (ses.isHost) ses.send({ t: 'toLobby' });
    ses.race = null;
    this.returnToLobbyView();
  }

  leaveMP() {
    const ses = this.session;
    this.session = null;
    if (ses) ses.close();
    this.menuOpen = false;
    this.toTitle();
  }

  startMP() {
    const ses = this.session;
    if (!ses || !ses.isHost || ses.players.length < 2) return;
    const L = ses.lobby;
    // Only players we've heard from recently get a kart.
    const now = performance.now();
    const humans = ses.players.filter((p) => p.id === 'host' || now - (ses.seen.get(p.id) ?? -1e9) < 5000).map((p) => ({ id: p.id, char: p.char }));
    if (humans.length < 2) return;
    const taken = new Set(humans.map((h) => h.char));
    const ai = L.ai ? shuffle(CHARACTERS.map((c) => c.id).filter((id) => !taken.has(id))).slice(0, Math.max(0, 8 - humans.length)) : [];
    // Computer racers start in front, humans in shuffled slots at the back.
    const grid = [...ai];
    const hs = shuffle(humans.slice());
    const slots = [];
    for (const h of hs) { slots.push({ id: h.id, slot: grid.length }); grid.push(h.char); }
    const cfg = { trackId: L.track, reverse: L.reverse, speedClass: L.speedClass, difficulty: L.difficulty, grid, humans: slots };
    ses.inRace = true;
    ses.send({ t: 'start', cfg });
    this.startNetRace(cfg);
    const waiting = new Set(humans.filter((h) => h.id !== 'host').map((h) => h.id));
    let went = false;
    const go = () => {
      if (went || !this.race || this.race.mode !== 'mp') return;
      went = true;
      ses.send({ t: 'go' });
      this.race.netGo();
    };
    ses.onReady = (id) => { waiting.delete(id); if (!waiting.size) go(); };
    setTimeout(go, 8000);
  }

  startNetRace(cfg) {
    const ses = this.session;
    if (!ses) return;
    const me = ses.isHost ? 'host' : ses.meId;
    const mine = cfg.humans.find((h) => h.id === me);
    if (!mine) return;
    this.disposeRace();
    this.paused = false;
    this.menuOpen = false;
    this.gp = null;
    const def = trackById(cfg.trackId);
    this.race = new Race(this, {
      mode: 'mp', trackDef: def, reverse: cfg.reverse, grid: cfg.grid, speedClass: cfg.speedClass, difficulty: cfg.difficulty,
      laps: def.laps || 3, net: ses, playerSlot: mine.slot, humans: ses.isHost ? cfg.humans.filter((h) => h.id !== 'host') : [],
      humanSlots: cfg.humans.map((h) => h.slot),
    });
    ses.race = this.race;
    this.race.setSize(this.w, this.h, this.pr);
    this.view = this.race;
    this.ui.hideAll();
    this.hud.reset(this.race);
    this.hud.show(true);
    this.hud.hint('Get ready…', 3);
    this.input.resetButtons();
    this.applyControls();
    this.audio.unlock();
    this.audio.startEngine();
    this.audio.setTempo(1);
    this.audio.playSong(def.music);
    this._tiltChecked = false;
    this.requestWake();
    if (ses.isGuest) ses.send({ t: 'ready' });
  }

  // ---------------- loop ----------------
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 0.05);

    if (!this.paused && this.view) {
      this.renderer.info.reset();
      this.view.update(dt);
      this._checkTilt();
      this._frameStats(dt);
      if (this.post.active) this.post.render(this.view.scene, this.view.camera, this.view.grade, dt);
      else this.renderer.render(this.view.scene, this.view.camera);
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
    // Dynamic resolution. Low Power Mode caps Safari at 30 fps; a steady
    // 30 fps cadence is treated as the target so we don't blur the picture
    // for nothing.
    this.dtHist = this.dtHist || [];
    this.dtHist.push(dt);
    if (this.dtHist.length > 90) this.dtHist.shift();
    if (this.dtHist.length === 90 && this.fpsFrames === 0) {
      const sorted = this.dtHist.slice().sort((a, b) => a - b);
      const med = sorted[45];
      const spread = sorted[80] - sorted[10];
      if (med > 0.03 && med < 0.037 && spread < 0.004) this.capped = true;
      else if (med < 0.022) this.capped = false;
    }
    const target = this.capped ? 1 / 30 : 1 / 60;
    if (this.blockRaise > 0) this.blockRaise -= dt;
    this.drTimer += dt;
    if (this.ft > target * 1.18) {
      this.goodTime = 0;
      if (this.drTimer > 1.2 && this.pr > this.minPR + 0.01) {
        this.pr = Math.max(this.minPR, this.pr - (this.ft > target * 1.5 ? 0.3 : 0.15));
        this.drTimer = 0;
        this.blockRaise = 15;
        this.resize();
      }
    } else if (this.ft < target * 1.05) {
      this.goodTime += dt;
      if (this.goodTime > 4 && this.blockRaise <= 0 && this.pr < this.maxPR - 0.01) {
        this.pr = Math.min(this.maxPR, this.pr + 0.15);
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

