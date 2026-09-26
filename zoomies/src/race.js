import * as THREE from 'three';
import { Track } from './track.js';
import { World } from './world.js';
import { Kart } from './kart.js';
import { AIDriver, DIFFICULTY } from './ai.js';
import { ItemSystem } from './items.js';
import { FX } from './particles.js';
import { charById } from './characters.js';
import { wheelGeometry } from './karts.js';
import { clamp, damp, dampAngle, pbrMat } from './util.js';
import { SkidMarks } from './skids.js';
import * as TX from './textures.js';

export const SPEED_CLASSES = {
  chill: { id: 'chill', name: 'Chill', top: 27 },
  zoom: { id: 'zoom', name: 'Zoom', top: 32 },
  turbo: { id: 'turbo', name: 'Turbo', top: 38 },
};

const PHYS_DT = 1 / 60;
const SNAP_HZ = 20;
const STATE_HZ = 30;

// Compact kart state for the network. Flags: 1 grounded, 2 drifting,
// 4 boosting, 8 offroad, 16 gliding, 32 finished, 64 trick, 128 respawning.
function kartState(k) {
  const r = (v) => Math.round(v * 100) / 100;
  const flags = (k.grounded ? 1 : 0) | (k.drifting ? 2 : 0) | (k.boostTime > 0 ? 4 : 0) | (k.offroad ? 8 : 0) |
    (k.gliding ? 16 : 0) | (k.finished ? 32 : 0) | (k.trickAnim > 0 ? 64 : 0) | (k.respawnT > 0 ? 128 : 0) | (k.ghostTime > 0 ? 256 : 0);
  return [r(k.pos.x), r(k.pos.y), r(k.pos.z), r(k.yaw), r(k.vel.x), r(k.vel.z), r(k.vy), flags, k.driftDir, k.driftLevel,
    r(k.steerS), k.laps, r(k.total), k.place, k.gems, r(k.spinTime), r(k.starTime), r(k.shrinkTime), r(k.shield), r(k.rocketTime),
    k.path && k.path.id !== undefined ? k.path.id : -1, r(k.finishTime || 0)];
}

// Glue between the item system and the network session.
class RaceNet {
  constructor(race, session) {
    this.race = race;
    this.s = session;
    this.isHost = session.isHost;
    this.isGuest = session.isGuest;
  }
  claimBox(i) {
    const k = this.race.player;
    const want = !(k.item || k.rolling > 0);
    if (want) {
      k.rolling = 1.25;
      k.pendingItem = null;
      k.awaitGrant = 1.8;
    }
    this.s.send({ t: 'box', i, want });
  }
  claimGem(i) { this.s.send({ t: 'gem', i }); }
  useItem(k, it, aim = 0) { this.s.send({ t: 'use', it, aim, x: k.pos.x, z: k.pos.z, yaw: k.yaw, sp: Math.max(0, k.fwdSpeed) }); }
  sendBlast(x, y, z, r, kind, owner, spares) {
    const q = (v) => Math.round(v * 10) / 10;
    this.s.send({ t: 'blast', x: q(x), y: q(y), z: q(z), r, kind, o: owner ? owner.index : -1, sp: !!spares });
  }
  hitObject(kind, id) { this.s.send({ t: 'hitobj', kind, id }); }
  sendHit(k, kind) {
    const id = this.race.slotPeer.get(k.index);
    if (id) this.s.sendTo(id, { t: 'hit', kind });
  }
}

export class Race {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.mode = opts.mode; // 'gp' | 'quick' | 'tt' | 'demo' | 'mp'
    this.trackDef = opts.trackDef;
    this.laps = opts.laps ?? 3;
    this.speedClass = SPEED_CLASSES[opts.speedClass] || SPEED_CLASSES.zoom;
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.quality = app.quality;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.3, 1000);
    this.track = new Track(opts.trackDef, !!opts.reverse);
    this.world = new World(this.track, this.quality);
    this.scene.add(this.world.group);
    this.scene.fog = this.world.fog;
    this.world.applyEnvironment(app.renderer, this.scene);
    this.grade = this.world.grade;
    this.grade.boost = 0;
    // Soft fill from the camera so the side of the karts we look at is never
    // lost in shadow (the sun can be anywhere relative to the camera).
    this.fill = new THREE.DirectionalLight(this.world.theme.hemi[0], this.world.fx.fill ?? 0.55);
    this.scene.add(this.fill, this.fill.target);
    this.skids = new SkidMarks(1200, this.world.theme.floating || this.world.theme.road === 'neon' ? '#241a3a' : '#1a1418');
    this.scene.add(this.skids.mesh);
    this.camRoll = 0;
    this.shadowTex = TX.blobShadowTexture();
    this.fx = new FX(this.scene);
    this.dust = this.world.theme.dust || '#cccccc';

    // Multiplayer
    this.session = opts.net || null;
    this.net = this.session ? new RaceNet(this, this.session) : null;
    this.slotPeer = new Map(); // slot -> peer id (host side)
    this.peerSlot = new Map();
    for (const h of opts.humans || []) {
      this.slotPeer.set(h.slot, h.id);
      this.peerSlot.set(h.id, h.slot);
    }
    this.mySlot = opts.playerSlot ?? -1;

    this.state = this.mode === 'demo' ? 'race' : this.session ? 'wait' : 'intro';
    this.stateTime = 0;
    this.time = 0;
    this.raceTime = 0;
    this.results = null;
    this.flash = 0;
    this.shake = 0;
    this.found = new Set();

    this._makeKarts(opts);
    this.items = new ItemSystem(this, !!(this.net && this.net.isGuest));
    if (this.mode === 'tt' && this.player) {
      this.player.item = 'chili';
      this.player.itemCount = 3;
    }

    this.camYaw = this.player ? this.player.yaw : 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camTrk = {};
    this.camSeg = -1;
    this.camPath = null;
    this.fov = 68;
    this.demoTarget = 0;
    this.demoTimer = 0;
    this._v = new THREE.Vector3();
    this.rocket = { pressT: -1 };
    this.netClock = 0;
    this.placeCam(true);
  }

  _makeKarts(opts) {
    const tr = this.track;
    this.karts = [];
    const grid = this.mode === 'tt' ? [opts.player] : opts.grid;
    // All wheels are two instanced draws: full detail near the camera, a
    // cheap version for distant karts (the unused slot gets a zero matrix).
    this.wheelMesh = new THREE.InstancedMesh(wheelGeometry(), pbrMat(), grid.length * 4);
    this.wheelMeshLo = new THREE.InstancedMesh(wheelGeometry(true), this.wheelMesh.material, grid.length * 4);
    this._zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const m of [this.wheelMesh, this.wheelMeshLo]) {
      m.castShadow = !!this.quality.shadows;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    const col = new THREE.Color();
    const guest = this.net && this.net.isGuest;
    grid.forEach((id, i) => {
      const ch = charById(id);
      const isPlayer = this.mode === 'mp' ? i === this.mySlot : this.mode !== 'demo' && id === opts.player;
      const lo = (opts.loadouts && opts.loadouts[i]) || (isPlayer && opts.playerLoadout) || {};
      const k = new Kart(this, ch, { isPlayer, index: i, body: lo.body, upgrades: lo.upgrades, paint: lo.paint });
      const slot = tr.gridSlot(i);
      k.placeAt(slot.s, this.mode === 'tt' ? 0 : slot.d);
      if (isPlayer) this.player = k;
      else if (this.mode === 'mp' && (guest || this.slotPeer.has(i))) {
        k.remote = true;
        k.human = this.slotPeer.has(i) || (opts.humanSlots || []).includes(i);
      } else {
        const [a, b] = this.diff.skill;
        const skill = this.mode === 'demo' ? 0.9 + Math.random() * 0.1 : a + Math.random() * (b - a);
        k.ai = new AIDriver(k, this, skill, this.mode === 'demo' ? DIFFICULTY.normal : this.diff);
      }
      this.scene.add(k.root);
      this.scene.add(k.shadow);
      col.set(ch.accent === '#1d1537' ? '#ffd23f' : ch.accent);
      for (let w = 0; w < 4; w++) {
        this.wheelMesh.setColorAt(i * 4 + w, col);
        this.wheelMeshLo.setColorAt(i * 4 + w, col);
      }
      k.wheelBase = i * 4;
      this.karts.push(k);
    });
    for (const m of [this.wheelMesh, this.wheelMeshLo]) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.count = this.karts.length * 4;
    }
  }

  setSize(w, h, pr) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewH = h * pr;
    this.fx.setScale(this.viewH, this.camera.fov);
    this.world.setViewH(this.viewH);
  }

  // ---------------- main update ----------------
  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    const hud = this.app.hud;

    if (this.state === 'intro') {
      if (this.stateTime > 3.2 || this.skipIntro) this.setState('countdown');
    } else if (this.state === 'countdown') {
      const t = this.stateTime;
      const n = 3 - Math.floor(t);
      if (n !== this._lastCount && n > 0) {
        this._lastCount = n;
        hud.countdown(n);
        this.app.audio.play('count');
      }
      if (t >= 3) {
        this.setState('race');
        hud.countdown('GO!');
        this.app.audio.play('go');
        this._applyRocketStarts();
      }
    } else if (this.state === 'finished') {
      if (!this.results && !this.session && this.stateTime > 4.5) this._finishResults();
    }
    if (this.net && this.net.isHost && !this.results) this._checkNetEnd(dt);

    const inp = this.player && this.player.ai == null && this.state !== 'wait' ? this.app.input.read(dt) : null;
    if (inp && this.player) {
      Object.assign(this.player.ctl, inp);
      if (this.state === 'countdown') this._trackRocket(inp);
    }

    const locked = this.state === 'intro' || this.state === 'countdown' || this.state === 'wait';
    if (!locked) {
      this.raceTime += dt;
      this.netClock += dt;
    }

    this._rubberBand();

    const steps = Math.min(5, Math.max(1, Math.ceil(dt / PHYS_DT - 0.01)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this._physics(h, locked);

    for (const k of this.karts) if (k.remote) this._updateRemote(k, dt);

    this.items.update(dt, this.session ? this.netClock : this.time);
    if (this.net && this.net.isGuest) this.items.tickReplica(dt);
    if (!(this.net && this.net.isGuest)) this._positions();

    for (const k of this.karts) {
      k.updateVisual(dt, this.time);
      k.emitFX(dt, this.fx, this.dust);
    }
    this._updateLOD();
    this._updateWheels();
    this._updateSkids(dt);
    this.fx.update(dt);
    this._updateCamera(dt);
    this.world.update(dt, this.camera, this.player ? this.player.pos : this.karts[this.demoTarget % this.karts.length].pos);
    this._netSend(dt);

    const a = this.app.audio;
    if (this.player && this.mode !== 'demo') {
      const p = this.player;
      a.updateEngine(this._engineState(p));
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    if (this.mode !== 'demo') hud.update(this, dt);
  }

  // What the engine sound needs to know about the player's kart, plus the
  // nearest rival (heard panned to their side).
  _engineState(p) {
    let rival = null, best = 26 * 26;
    for (const k of this.karts) {
      if (k === p) continue;
      const d2 = (k.pos.x - p.pos.x) ** 2 + (k.pos.z - p.pos.z) ** 2;
      if (d2 < best) { best = d2; rival = k; }
    }
    const es = this._es || (this._es = {});
    const r = this._esRival || (this._esRival = { dist: 0, speed: 0, pan: 0, closing: 0 });
    const c = p.ctl;
    es.speed = p.speed / p.baseTop;
    es.throttle = this.state === 'finished' ? 0.6 : c.throttle;
    es.brake = !!c.brake;
    es.boost = p.boostTime > 0 || p.rocketTime > 0;
    es.drift = p.drifting;
    es.driftLevel = p.driftLevel;
    // free-revving in the air, or revving on the grid for a rocket start
    es.air = !p.grounded || (this.state === 'countdown' && !!c.drift);
    es.offroad = p.offroad;
    es.active = this.state !== 'wait';
    es.rival = rival ? r : null;
    if (rival) {
      const d = Math.sqrt(best) || 1;
      const dx = rival.pos.x - p.pos.x, dz = rival.pos.z - p.pos.z;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      r.dist = d;
      r.speed = rival.speed / rival.baseTop;
      r.pan = clamp((dx * -fz + dz * fx) / d, -1, 1) * 0.8;
      r.closing = -((rival.vel.x - p.vel.x) * dx + (rival.vel.z - p.vel.z) * dz) / d;
    }
    return es;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
    if (s === 'countdown') this.app.hud.showTrackName(null);
    // Online races start in 'wait': show the thumb buttons once racing begins.
    if (this.mode !== 'demo' && this.app.race === this) this.app.applyControls();
  }

  _rubberBand() {
    const humans = this.karts.filter((k) => k.isPlayer || k.human);
    if (!humans.length || this.mode === 'demo') {
      for (const k of this.karts) if (k.ai) k.speedMul = 0.97 + k.ai.skill * 0.03;
      return;
    }
    const ref = humans.reduce((s, k) => s + k.total, 0) / humans.length;
    const allDone = humans.every((k) => k.finished);
    for (const k of this.karts) {
      if (!k.ai || k.isPlayer) continue;
      let mul = this.diff.speed * (0.95 + k.ai.skill * 0.05);
      if (!allDone) {
        const gap = ref - k.total;
        if (gap > 0) mul *= 1 + Math.min(gap / 240, 1) * this.diff.rubberUp;
        else mul *= 1 - Math.min(-gap / 240, 1) * this.diff.rubberDown;
      }
      k.speedMul = mul;
    }
  }

  _trackRocket(inp) {
    const t = this.stateTime;
    if (inp.drift && this.rocket.pressT < 0) this.rocket.pressT = t;
    if (!inp.drift) this.rocket.pressT = -1;
  }

  _applyRocketStarts() {
    for (const k of this.karts) {
      if (k.remote) continue;
      if (k.ai) {
        if (Math.random() < this.diff.rocketStart * (this.mode === 'demo' ? 0.5 : 1)) k.startBoost(0.9, 12);
        continue;
      }
      const pt = this.rocket.pressT;
      if (pt >= 1.85 && pt <= 2.8) {
        k.startBoost(1.2, 14);
        this.app.hud.toast('ROCKET START!');
        this.app.audio.play('boost');
      } else if (pt >= 0 && pt < 1.85) {
        k.spinTime = 0.7;
        k.spinDur = 0.7;
        this.app.hud.toast('Too early... engine stalled!');
        this.app.audio.play('burnout');
      }
    }
  }

  _physics(h, locked) {
    const time = this.time;
    for (const k of this.karts) {
      if (k.remote) continue;
      if (k.rocketTime > 0 && !locked) {
        if (!k.pilot) k.pilot = new AIDriver(k, this, 1, this.diff, true);
        k.pilot.update(h, time);
      } else if (k.ai) k.ai.update(h, time);
      k.step(h, locked);
      if (k.rolling > 0) {
        k.rolling -= h;
        if (k.isPlayer && Math.random() < h * 14) this.app.audio.play('tick');
        if (k.rolling <= 0) {
          if (k.awaitGrant > 0 && !k.pendingItem) {
            k.awaitGrant -= h;
            k.rolling = k.awaitGrant > 0 ? 0.02 : 0;
          } else {
            k.awaitGrant = 0;
            this.items.settle(k);
            if (k.isPlayer && k.item) this.app.audio.play('itemReady');
          }
        }
      }
      this._handleEvents(k);
      if (!locked) this._checkPads(k);
      this._checkLap(k);
    }
    this._collide();
  }

  _handleEvents(k) {
    const ev = k.events;
    if (!ev.length) return;
    const a = this.app.audio;
    const hud = this.app.hud;
    const near = k.isPlayer || (this.player && k.pos.distanceToSquared(this.player.pos) < 400);
    for (let i = 0; i < ev.length; i += 2) {
      const type = ev[i], data = ev[i + 1];
      switch (type) {
        case 'useItem': {
          const used = this.items.use(k, null, null, k.ctl.aim || 0);
          if (used && near) {
            const snd = {
              chili: 'boost', bubble: 'shield', rainbow: 'rainbow', honey: 'honey', ball: 'throw', bee: 'bee', boomerang: 'throw', rocket: 'boost',
              magnet: 'shield', warp: 'warp', bomb: 'throw', oil: 'honey', firework: 'firework', twister: 'twister', ghost: 'ghost',
            }[used];
            if (snd && (k.isPlayer || used !== 'chili')) a.play(snd);
            if (k.isPlayer && used === 'rocket') hud.toast('ROCKET RIDE!');
          }
          break;
        }
        case 'boost':
          if (k.isPlayer && data < 1.3) a.play('miniturbo');
          if (k.isPlayer) this.shake = Math.max(this.shake, 0.15);
          break;
        case 'driftLevel':
          if (k.isPlayer) a.play('driftLevel', data);
          break;
        case 'driftStart':
          if (k.isPlayer) a.play('driftStart');
          break;
        case 'slip':
          if (near) a.play('slip');
          break;
        case 'ghostEnd':
          this.items.surprise(k);
          if (k.isPlayer) hud.toast('SURPRISE!');
          break;
        case 'land':
          if (k.isPlayer) a.play('land');
          this.fx.burst(k.pos.x, k.pos.y + 0.2, k.pos.z, [this.dust], 8, 4, 1.2, 0.5, 2, false);
          break;
        case 'trick':
          if (k.isPlayer) { a.play('trick'); hud.toast('TRICK!'); }
          this.fx.burst(k.pos.x, k.pos.y + 1, k.pos.z, ['#ffd23f', '#ffffff', '#46f0ff'], 12, 6, 0.5, 0.5, 4);
          break;
        case 'glide':
          if (k.isPlayer) { a.play('trick'); hud.toast('GLIDE!'); }
          break;
        case 'hit':
          if (near) a.play('hit');
          if (k.isPlayer) { this.shake = 0.6; this.flash = Math.max(this.flash, 0.25); }
          for (let n = 0; n < data; n++) {
            this.fx.glow.emit(k.pos.x, k.pos.y + 1, k.pos.z, (Math.random() - 0.5) * 8, 6 + Math.random() * 4, (Math.random() - 0.5) * 8, '#46f0ff', 0.7, 0.3, 0.9, 16, 0.5);
          }
          break;
        case 'shieldPop':
          if (near) a.play('shieldPop');
          this.fx.burst(k.pos.x, k.pos.y + 1, k.pos.z, ['#8fe6ff', '#ffffff'], 18, 8, 0.5, 0.5, 2);
          break;
        case 'wall':
          if (k.isPlayer) { a.play('wall', data); this.shake = Math.max(this.shake, Math.min(0.4, data * 0.02)); }
          this.fx.burst(k.pos.x + Math.sin(k.yaw) * 1.2, k.pos.y + 0.5, k.pos.z + Math.cos(k.yaw) * 1.2, ['#ffd23f', '#ffffff'], 6, 7, 0.3, 0.3, 14);
          break;
        case 'ramp':
          if (k.isPlayer && !this._rampHinted) { this._rampHinted = true; hud.hint('Tap DRIFT in the air for a trick!', 1.6); }
          break;
        case 'shortcut':
          if (k.isPlayer) {
            const first = !this.found.has(data.id);
            this.found.add(data.id);
            hud.toast(first ? `SECRET! ${data.name}` : data.name);
            if (first) a.play('secret');
          }
          break;
        case 'fall':
          if (k.isPlayer) { hud.toast('Oops! Back on track'); a.play('fall'); this.flash = Math.max(this.flash, 0.3); }
          break;
      }
    }
  }

  _checkPads(k) {
    if (!k.grounded) return;
    const p = k.path;
    for (const b of p.boosts) {
      let u = k.trk.s - b.s;
      if (p.closed && u < 0) u += p.length;
      if (u >= 0 && u <= b.len && Math.abs(k.trk.d - b.d) < b.w / 2 + 0.4) {
        if (!k._padCool || this.time - k._padCool > 0.5) {
          k._padCool = this.time;
          k.startBoost(1.0, 10);
          if (k.isPlayer) this.app.audio.play('boost');
        }
      }
    }
  }

  _checkLap(k) {
    if (k.finished) return;
    if (k.laps > k.maxLap) {
      k.maxLap = k.laps;
      if (k.laps >= 1) {
        k.lapTimes.push(this.raceTime - k.lapStart);
        k.lapStart = this.raceTime;
      }
      if (k.laps >= this.laps) {
        k.finished = true;
        k.finishTime = this.raceTime;
        this._onFinish(k);
      } else if (k.isPlayer && k.laps >= 1) {
        if (k.laps === this.laps - 1) {
          this.app.hud.banner('FINAL LAP!', 'final');
          this.app.audio.play('finalLap');
          this.app.audio.setTempo(1.12);
        } else {
          this.app.hud.banner(`LAP ${k.laps + 1}`, 'lap');
          this.app.audio.play('lap');
        }
      }
    }
  }

  _onFinish(k) {
    if (!k.isPlayer || this.mode === 'demo') return;
    this.setState('finished');
    k.ai = new AIDriver(k, this, 0.9, DIFFICULTY.normal);
    k.speedMul = 0.92;
    this._positions();
    const place = this.mode === 'tt' ? null : k.place;
    this.app.hud.finish(place);
    this.app.audio.play(!place || place <= 3 ? 'finish' : 'lose');
    this.app.input.resetButtons();
    this.app.applyControls();
    this.fx.burst(k.pos.x, k.pos.y + 2, k.pos.z, ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'], 60, 14, 0.6, 1.4, 12);
    if (this.net && this.net.isGuest) this.session.send({ t: 'finish', time: k.finishTime, laps: k.lapTimes });
    if (this.net) this.app.hud.hint('Waiting for the others to finish…', 30);
  }

  _estimate(k) {
    if (k.finished) return k.finishTime;
    const remaining = this.laps * this.track.length - k.total;
    return this.raceTime + Math.max(0, remaining) / (k.baseTop * 0.86);
  }

  _finishResults() {
    const rows = this.karts.map((k) => ({ ch: k.ch, time: this._estimate(k), isPlayer: k.isPlayer, finished: k.finished, lapTimes: k.lapTimes.slice(), slot: k.index }));
    rows.sort((a, b) => a.time - b.time);
    rows.forEach((r, i) => (r.place = i + 1));
    this.results = rows;
    if (this.net && this.net.isHost) {
      this.session.send({ t: 'results', rows: rows.map((r) => ({ slot: r.slot, id: r.ch.id, time: r.time, finished: r.finished, place: r.place })) });
    }
    this.app.onRaceComplete(this, rows);
  }

  // Host: end the race once every connected human has finished. Players who
  // disconnect are dropped by the session heartbeat (their kart turns into a
  // computer racer), and a long safety net covers anyone who is stuck.
  _checkNetEnd() {
    const live = this.karts.filter((k) => k.isPlayer || (k.human && k.remote));
    const done = live.filter((k) => k.finished).length;
    if (done && this.firstHumanFinish === undefined) this.firstHumanFinish = this.raceTime;
    if (live.length && done === live.length) {
      if (this.allDoneAt === undefined) this.allDoneAt = this.raceTime;
      if (this.raceTime - this.allDoneAt > 3) this._finishResults();
    } else {
      this.allDoneAt = undefined;
      if (this.firstHumanFinish !== undefined && this.raceTime - this.firstHumanFinish > 150) this._finishResults();
    }
  }

  _collide() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        if (a.remote && b.remote) continue;
        if (a.ghostTime > 0 || b.ghostTime > 0) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const R = 1.2 * (a.root.scale.x + b.root.scale.x);
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d, nz = dz / d;
        const ov = R - d;
        const heavy = (k) => (k.starTime > 0 || k.rocketTime > 0 ? 4 : 1);
        const ma = a.weight * heavy(a) * a.root.scale.x;
        const mb = b.weight * heavy(b) * b.root.scale.x;
        let wa = mb / (ma + mb), wb = ma / (ma + mb);
        if (a.remote) { wa = 0; wb = 1; }
        if (b.remote) { wb = 0; wa = 1; }
        a.pos.x -= nx * ov * wa; a.pos.z -= nz * ov * wa;
        b.pos.x += nx * ov * wb; b.pos.z += nz * ov * wb;
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          const j2 = (-(1 + 0.4) * rv) / (1 / ma + 1 / mb);
          if (!a.remote) { a.vel.x -= (nx * j2) / ma; a.vel.z -= (nz * j2) / ma; }
          if (!b.remote) { b.vel.x += (nx * j2) / mb; b.vel.z += (nz * j2) / mb; }
          if ((a.isPlayer || b.isPlayer) && -rv > 3) {
            this.app.audio.play('bump');
            this.shake = Math.max(this.shake, 0.2);
          }
        }
        const strong = (k) => k.starTime > 0 || k.rocketTime > 0;
        if (strong(a) && !strong(b) && !b.remote) b.hit('spin');
        else if (strong(b) && !strong(a) && !a.remote) a.hit('spin');
        else if (a.shrinkTime > 0 && b.shrinkTime <= 0 && !a.remote) a.hit('bump');
        else if (b.shrinkTime > 0 && a.shrinkTime <= 0 && !b.remote) b.hit('bump');
      }
    }
  }

  _positions() {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishTime - b.finishTime;
      return b.total - a.total;
    });
    sorted.forEach((k, i) => (k.place = i + 1));
    this.order = sorted;
  }

  // Distant karts (not the player's) switch to their low-detail models.
  _updateLOD() {
    const cp = this.camera.position;
    for (const k of this.karts) {
      const d2 = k.pos.distanceToSquared(cp);
      k.setLOD(k === this.player && this.mode !== 'demo' ? false : d2 > (k.lodFar ? 26 * 26 : 30 * 30));
    }
  }

  _updateWheels() {
    const hi = this.wheelMesh, lo = this.wheelMeshLo, Z = this._zeroM;
    for (const k of this.karts) {
      k.root.updateMatrixWorld(true);
      for (let w = 0; w < 4; w++) {
        const m = k.wheels[w].spin.matrixWorld;
        hi.setMatrixAt(k.wheelBase + w, k.lodFar ? Z : m);
        lo.setMatrixAt(k.wheelBase + w, k.lodFar ? m : Z);
      }
    }
    hi.instanceMatrix.needsUpdate = true;
    lo.instanceMatrix.needsUpdate = true;
  }

  _updateSkids(dt) {
    const sk = this.skids;
    for (const k of this.karts) {
      const spd = k.speed;
      const on = k.grounded && !k.offroad && k.respawnT <= 0 && spd > 8 && (k.drifting || (k.ctl.brake && k.fwdSpeed > 12));
      for (let w = 2; w < 4; w++) {
        const key = k.index * 4 + w;
        if (!on) { sk.lift(key); continue; }
        const e = k.wheels[w].spin.matrixWorld.elements;
        const sc = k.root.scale.x;
        sk.add(key, e[12], e[13] - k.wheels[w].def.r * sc + 0.03, e[14], k.vel.x / spd, k.vel.z / spd, 0.34 * sc, k.drifting ? 0.5 : 0.32);
      }
    }
    sk.update(dt);
  }

  // Thunder Cloud: zap everyone ahead of the user.
  storm(user) {
    for (const k of this.karts) {
      if (k === user || k.place > user.place) continue;
      if (k.remote) this.net.sendHit(k, 'zap');
      else k.hit('zap');
      for (let n = 0; n < 10; n++) {
        this.fx.glow.emit(k.pos.x + (Math.random() - 0.5), k.pos.y + 1 + n * 1.4, k.pos.z + (Math.random() - 0.5), 0, 0, 0, n % 2 ? '#fff6a0' : '#9fe8ff', 1.2, 0.4, 0.35);
      }
    }
    if (this.player && (user === this.player || this.player.place < user.place)) this.flash = 0.8;
    this.app.audio.play('zap');
  }

  // Warp Swirl: jump forward along the main road.
  warp(k) {
    const tr = this.track;
    const swirl = (x, y, z) => {
      for (let n = 0; n < 24; n++) {
        const a = (n / 24) * Math.PI * 2;
        this.fx.glow.emit(x + Math.cos(a) * 1.5, y + 1 + (n % 3) * 0.4, z + Math.sin(a) * 1.5, Math.cos(a + 1.5) * 5, 2, Math.sin(a + 1.5) * 5, n % 2 ? '#b07aff' : '#46f0ff', 0.6, 0.1, 0.6, 0, 1);
      }
    };
    swirl(k.pos.x, k.pos.y, k.pos.z);
    const s = tr.mainS(k) + 75;
    const fr = tr.frame(s, {});
    const d = clamp(k.path === tr ? k.trk.d : 0, -fr.hw + 1.5, fr.hw - 1.5);
    const sp = Math.max(k.speed, k.baseTop * 0.8);
    k.path = tr;
    k.seg = -1;
    k.pos.set(fr.x + fr.rx * d, 0, fr.z + fr.rz * d);
    tr.project(k.pos.x, k.pos.z, -1, k.trk);
    k.seg = k.trk.idx;
    k.pos.y = k.trk.y + 0.5;
    k.yaw = Math.atan2(fr.tx, fr.tz);
    k.vel.set(Math.sin(k.yaw) * sp, 0, Math.cos(k.yaw) * sp);
    k.invuln = Math.max(k.invuln, 1.2);
    swirl(k.pos.x, k.pos.y, k.pos.z);
    if (k.isPlayer) { this.flash = 0.4; this.app.hud.toast('WARP!'); }
  }

  onBoxHit(k) { if (k.isPlayer) this.app.audio.play('item'); }
  onGem(k) { if (k.isPlayer) this.app.audio.play('gem'); }
  onHazardHit() {}
  onProjectileHit() {}
  onSlip(k) { if (k.isPlayer) this.app.hud.toast('SLIPPERY!'); }
  onBlastHit(k) { if (k.isPlayer) this.shake = Math.max(this.shake, 0.7); }
  onBlast(x, y, z, r, kind) {
    const p = this.player;
    const d2 = p ? (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 : 1e9;
    if (d2 < 3600) {
      this.app.audio.play(kind === 'bump' ? 'horn' : 'boom');
      this.shake = Math.max(this.shake, kind === 'bump' ? 0.25 : Math.max(0.2, 0.9 - Math.sqrt(d2) / 60));
    }
  }
  onObstacleHit(k) { if (k.isPlayer) this.shake = Math.max(this.shake, 0.4); }
  onCrates(k) {
    if (this.player && k.pos.distanceToSquared(this.player.pos) < 900) this.app.audio.play('crate');
  }
  onBallBounce(p) {
    if (this.player && p.pos.distanceToSquared(this.player.pos) < 600) this.app.audio.play('bump');
  }

  // ---------------- multiplayer ----------------
  netGo() {
    if (this.state === 'wait') this.setState('intro');
  }

  onPeerLeft(id) {
    const slot = this.peerSlot.get(id);
    if (slot === undefined) return;
    const k = this.karts[slot];
    this.peerSlot.delete(id);
    this.slotPeer.delete(slot);
    if (k && k.remote) {
      // Their kart keeps racing as a computer driver.
      k.remote = false;
      k.human = false;
      k.path = this.track;
      k.seg = -1;
      k.ai = new AIDriver(k, this, 0.9, this.diff);
      this.app.hud.toast(`${k.ch.name} left the race`);
    }
  }

  _applyState(k, a) {
    const n = k.net || (k.net = {});
    n.x = a[0]; n.y = a[1]; n.z = a[2]; n.yaw = a[3]; n.vx = a[4]; n.vz = a[5]; n.vy = a[6];
    n.t = performance.now();
    const f = a[7];
    n.grounded = !!(f & 1);
    k.grounded = n.grounded;
    k.drifting = !!(f & 2);
    k.boostTime = f & 4 ? 0.15 : 0;
    k.offroad = !!(f & 8);
    k.gliding = !!(f & 16);
    if (f & 64 && !(k.trickAnim > 0)) k.trickAnim = 1;
    k.respawnT = f & 128 ? 0.5 : 0;
    k.ghostTime = f & 256 ? 0.25 : 0;
    k.driftDir = a[8];
    k.driftLevel = a[9];
    k.steerS = a[10];
    k.laps = a[11];
    k.total = a[12];
    if (this.net.isGuest) k.place = a[13];
    k.gems = a[14];
    if (a[15] > 0 && !(k.spinTime > 0)) k.spinDur = Math.max(0.6, a[15]);
    k.spinTime = a[15];
    k.starTime = a[16];
    k.shrinkTime = a[17];
    k.shield = a[18];
    k.rocketTime = a[19];
    const pathId = a[20];
    const want = pathId >= 0 ? this.track.shortcuts[pathId] : this.track;
    if (want && k.path !== want) { k.path = want; k.seg = -1; }
    if (f & 32 && !k.finished) { k.finished = true; k.finishTime = a[21]; }
  }

  _updateRemote(k, dt) {
    const n = k.net;
    if (!n) return;
    const age = Math.min(0.25, (performance.now() - n.t) / 1000);
    const tx = n.x + n.vx * age, tz = n.z + n.vz * age, ty = n.y + (n.grounded ? 0 : n.vy * age);
    const dx = tx - k.pos.x, dy = ty - k.pos.y, dz = tz - k.pos.z;
    if (dx * dx + dy * dy + dz * dz > 100) k.pos.set(tx, ty, tz);
    else {
      const f = 1 - Math.exp(-14 * dt);
      k.pos.x += dx * f; k.pos.y += dy * f; k.pos.z += dz * f;
    }
    k.yaw = dampAngle(k.yaw, n.yaw, 14, dt);
    k.vel.set(n.vx, 0, n.vz);
    for (const key of ['spinTime', 'starTime', 'shrinkTime', 'shield', 'rocketTime', 'ghostTime']) if (k[key] > 0) k[key] -= dt;
    this.track.attach(k);
  }

  _netSend(dt) {
    if (!this.net || this.state === 'wait') return;
    this._netAcc = (this._netAcc || 0) + dt;
    if (this.net.isHost) {
      if (this._netAcc < 1 / SNAP_HZ) return;
      this._netAcc = 0;
      this.session.send({ t: 'snap', rt: this.raceTime, k: this.karts.map(kartState), it: this.items.snapshot() });
    } else {
      if (this._netAcc < 1 / STATE_HZ) return;
      this._netAcc = 0;
      if (this.player) this.session.send({ t: 'st', s: kartState(this.player) });
    }
  }

  onNet(msg, from) {
    const items = this.items;
    if (this.net.isHost) {
      const slot = this.peerSlot.get(from);
      const k = slot !== undefined ? this.karts[slot] : null;
      switch (msg.t) {
        case 'st':
          if (k && k.remote) this._applyState(k, msg.s);
          break;
        case 'box': {
          const b = items.boxes[msg.i];
          if (b && b.active) items._popBox(msg.i);
          if (k && msg.want) this.session.sendTo(from, { t: 'grant', item: items.roll(k) });
          break;
        }
        case 'gem':
          if (items.gems[msg.i]) items._popGem(msg.i);
          break;
        case 'use':
          if (k) items.use(k, msg.it, { x: msg.x, z: msg.z, yaw: msg.yaw, speed: msg.sp }, msg.aim || 0);
          break;
        case 'hitobj':
          if (msg.kind === 'h') {
            const h = items.hazards.find((q) => q.id === msg.id);
            if (h) items.removeHazard(h);
          } else {
            const p = items.projectiles.find((q) => q.id === msg.id);
            if (p && p.type !== 'boomerang') items.removeProjectile(p);
            else if (p && k) p.hitSet.add(k);
          }
          break;
        case 'finish':
          if (k && !k.finished) {
            k.finished = true;
            k.finishTime = msg.time;
            k.lapTimes = msg.laps || [];
          }
          break;
      }
      return;
    }
    // guest
    switch (msg.t) {
      case 'snap':
        this.netClock = msg.rt;
        msg.k.forEach((a, i) => {
          const k = this.karts[i];
          if (!k) return;
          if (k === this.player) k.place = a[13];
          else this._applyState(k, a);
        });
        items.applySnapshot(msg.it, this.time);
        break;
      case 'grant':
        if (this.player) this.player.pendingItem = msg.item;
        break;
      case 'blast':
        items.blast(msg.x, msg.y, msg.z, msg.r, msg.kind, this.karts[msg.o] || null, msg.sp, false);
        break;
      case 'hit':
        if (this.player) this.player.hit(msg.kind);
        break;
      case 'results': {
        const rows = msg.rows.map((r) => ({ ch: charById(r.id), time: r.time, finished: r.finished, place: r.place, isPlayer: r.slot === this.mySlot, slot: r.slot, lapTimes: [] }));
        this.results = rows;
        this.app.onRaceComplete(this, rows);
        break;
      }
    }
  }

  // ---------------- camera ----------------
  placeCam(snap) {
    const k = this.player || this.karts[0];
    if (!k) return;
    this.camYaw = k.yaw;
    if (this.state === 'intro' || this.state === 'wait') this._introCam();
    else this._chase(1, true, k);
    if (snap) this.camera.position.copy(this.camPos);
  }

  _introCam() {
    const tr = this.track;
    const t = this.state === 'wait' ? 0 : this.stateTime / 3.2;
    const fr = tr.frame(tr.length - 20, {});
    const cx = fr.x, cz = fr.z;
    const base = Math.atan2(fr.tx, fr.tz);
    const a = base + Math.PI * (0.3 + t * 1.1) + (this.state === 'wait' ? this.time * 0.1 : 0);
    const r = 34 - t * 12;
    this.camPos.set(cx + Math.sin(a) * r, tr.heightAtFrame(fr, 0) + 10 - t * 5, cz + Math.cos(a) * r);
    this.camLook.set(cx, tr.heightAtFrame(fr, 0) + 1, cz);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.fov = 60;
  }

  _chase(dt, snap = false, target = null, far = 0) {
    const k = target || this.player;
    const spd = k.speed;
    const sf = clamp(spd / (k.baseTop * 1.3), 0, 1);
    let tgt = k.yaw;
    if (spd > 4) {
      const vy = Math.atan2(k.vel.x, k.vel.z);
      const fwdDot = Math.sin(k.yaw) * k.vel.x + Math.cos(k.yaw) * k.vel.z;
      if (fwdDot > 0) tgt = dampAngle(k.yaw, vy, 1, 0.45);
    }
    if (k.drifting) tgt += k.driftDir * -0.12;
    this.camYaw = snap ? tgt : dampAngle(this.camYaw, tgt, 5.5, dt);
    const distT = 5.9 + sf * 0.9 + (k.boostTime > 0 || k.rocketTime > 0 ? 0.9 : 0) + (k.gliding ? 1.5 : 0) + far;
    this.camDist = snap || !this.camDist ? distT : damp(this.camDist, distT, 3, dt);
    const dist = this.camDist;
    const height = 2.5 + far * 0.3 + (k.gliding ? 0.8 : 0);
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    this.camPos.x = k.pos.x - fx * dist;
    this.camPos.z = k.pos.z - fz * dist;
    const wantY = k.pos.y + height;
    this.camPos.y = snap ? wantY : damp(this.camPos.y, wantY, 7, dt);
    const cp = k.path || this.track;
    if (cp !== this.camPath) { this.camPath = cp; this.camSeg = -1; }
    const trk = cp.project(this.camPos.x, this.camPos.z, this.camSeg, this.camTrk);
    this.camSeg = trk.idx;
    if (Math.abs(trk.d) < trk.wd + 1 && !(cp.voids.length && cp.isVoid(trk.s))) this.camPos.y = Math.max(this.camPos.y, trk.y + 1.3);
    this.camLook.set(k.pos.x + fx * 3.5, k.pos.y + 1.25, k.pos.z + fz * 3.5);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
    // Lean the camera slightly into turns and drifts.
    const rollT = k.drifting ? -k.driftDir * 0.035 : -(k.steerS || 0) * 0.015 * sf;
    this.camRoll = snap ? rollT : damp(this.camRoll, rollT, 4, dt);
    this.camera.rotateZ(this.camRoll);
    this.fov = 68 + sf * 7 + (k.boostTime > 0 ? 7 : 0) + (k.rocketTime > 0 ? 6 : 0);
  }

  _orbitCam(dt, k) {
    const a = this.stateTime * 0.35 + k.yaw + Math.PI * 0.75;
    const want = this._v.set(k.pos.x + Math.sin(a) * 8.5, k.pos.y + 3.2, k.pos.z + Math.cos(a) * 8.5);
    this.camPos.lerp(want, 1 - Math.exp(-4 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(k.pos.x, k.pos.y + 1.2, k.pos.z);
    this.fov = damp(this.fov, 55, 3, dt);
  }

  _demoCam(dt) {
    this.demoTimer -= dt;
    if (this.demoTimer <= 0) {
      this.demoTimer = 7 + Math.random() * 4;
      this.demoTarget = Math.floor(Math.random() * this.karts.length);
      this.demoStyle = Math.random() < 0.55 ? 'chase' : 'side';
      this._snapNext = true;
    }
    const k = this.karts[this.demoTarget % this.karts.length];
    if (this.demoStyle === 'side') {
      const rx = -Math.cos(k.yaw), rz = Math.sin(k.yaw);
      const want = this._v.set(k.pos.x + rx * 7 + Math.sin(k.yaw) * 4, k.pos.y + 2.2, k.pos.z + rz * 7 + Math.cos(k.yaw) * 4);
      if (this._snapNext) this.camPos.copy(want);
      else this.camPos.lerp(want, 1 - Math.exp(-5 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(k.pos.x, k.pos.y + 1, k.pos.z);
      this.fov = 60;
    } else {
      this._chase(dt, !!this._snapNext, k, 2.5);
    }
    this._snapNext = false;
  }

  _updateCamera(dt) {
    if (this.mode === 'demo') this._demoCam(dt);
    else if (this.state === 'intro' || this.state === 'wait') this._introCam();
    else if (this.state === 'finished' || this.state === 'done') this._orbitCam(dt, this.player);
    else this._chase(dt, this.stateTime < 0.02 && this.state === 'countdown');
    // Radial speed blur while boosting (post-processing).
    const pk = this.mode === 'demo' ? null : this.player;
    const bt = pk && this.state === 'race' && (pk.boostTime > 0 || pk.rocketTime > 0) ? (pk.rocketTime > 0 ? 1.3 : 1) : 0;
    this.grade.boost = damp(this.grade.boost, bt, bt ? 8 : 3, dt);
    if (this.grade.boost < 0.01) this.grade.boost = 0;
    this.fill.position.copy(this.camera.position);
    this.fill.position.y += 4;
    this.fill.target.position.copy(this.camLook);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, this.fov, 6, dt);
      this.camera.updateProjectionMatrix();
      this.fx.setScale(this.viewH || 800, this.camera.fov);
    }
  }

  dispose() {
    this.world.dispose();
    this.items.dispose();
    this.fx.dispose();
    this.wheelMesh.material.dispose();
    this.wheelMesh.dispose();
    this.wheelMeshLo.dispose();
    for (const k of this.karts) k.mat.dispose();
    this.shadowTex.dispose();
    this.skids.dispose();
    this.scene.clear();
    if (this.session && this.session.race === this) this.session.race = null;
  }
}
