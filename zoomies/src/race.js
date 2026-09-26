import * as THREE from 'three';
import { Track } from './track.js';
import { World } from './world.js';
import { Kart } from './kart.js';
import { AIDriver } from './ai.js';
import { ItemSystem } from './items.js';
import { FX } from './particles.js';
import { wheelGeometry, charById } from './characters.js';
import { clamp, damp, dampAngle, lerp } from './util.js';
import * as TX from './textures.js';

export const SPEED_CLASSES = {
  chill: { id: 'chill', name: 'Chill', top: 27, ai: 0.9 },
  zoom: { id: 'zoom', name: 'Zoom', top: 32, ai: 0.96 },
  turbo: { id: 'turbo', name: 'Turbo', top: 38, ai: 1.0 },
};

const DUST = { meadow: '#b9d98f', desert: '#f0c48c', frost: '#ffffff', neon: '#b48cff' };
const PHYS_DT = 1 / 60;

export class Race {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.mode = opts.mode; // 'gp' | 'quick' | 'tt' | 'demo'
    this.trackDef = opts.trackDef;
    this.laps = opts.laps ?? 3;
    this.speedClass = SPEED_CLASSES[opts.speedClass] || SPEED_CLASSES.zoom;
    this.quality = app.quality;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.3, 1000);
    this.track = new Track(opts.trackDef, !!opts.reverse);
    this.world = new World(this.track, this.quality);
    this.scene.add(this.world.group);
    this.scene.fog = this.world.fog;
    this.shadowTex = TX.blobShadowTexture();
    this.fx = new FX(this.scene);
    this.dust = DUST[this.trackDef.theme] || '#cccccc';

    this.state = this.mode === 'demo' ? 'race' : 'intro';
    this.stateTime = 0;
    this.time = 0;
    this.raceTime = 0;
    this.results = null;
    this.flash = 0;
    this.shake = 0;

    this._makeKarts(opts);
    this.items = new ItemSystem(this);
    if (this.mode === 'tt' && this.player) {
      this.player.item = 'chili';
      this.player.itemCount = 3;
    }

    // Camera state
    this.camYaw = this.player ? this.player.yaw : 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camTrk = {};
    this.camSeg = -1;
    this.fov = 68;
    this.demoTarget = 0;
    this.demoTimer = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.rocket = { pressT: -1, ok: false };
    this.placeCam(true);
  }

  _makeKarts(opts) {
    const tr = this.track;
    this.karts = [];
    // Array of character ids in grid order (front first). Time trial races alone.
    const grid = this.mode === 'tt' ? [opts.player] : opts.grid;
    const wheelCount = grid.length * 4;
    this.wheelMesh = new THREE.InstancedMesh(wheelGeometry(), this._wheelMat(), wheelCount);
    this.wheelMesh.castShadow = !!this.quality.shadows;
    this.wheelMesh.frustumCulled = false;
    this.scene.add(this.wheelMesh);
    const col = new THREE.Color();
    grid.forEach((id, i) => {
      const ch = charById(id);
      const isPlayer = this.mode !== 'demo' && id === opts.player;
      const k = new Kart(this, ch, { isPlayer, index: i });
      const slot = tr.gridSlot(i);
      k.placeAt(slot.s, this.mode === 'tt' ? 0 : slot.d);
      if (!isPlayer) {
        const skill = this.mode === 'demo' ? 0.9 + Math.random() * 0.1 : 0.86 + Math.random() * 0.14;
        k.ai = new AIDriver(k, this, skill);
      } else {
        this.player = k;
      }
      this.scene.add(k.root);
      this.scene.add(k.shadow);
      for (let w = 0; w < 4; w++) this.wheelMesh.setColorAt(i * 4 + w, col.set(ch.accent === '#1d1537' ? '#ffd23f' : ch.accent));
      this.karts.push(k);
    });
    if (this.wheelMesh.instanceColor) this.wheelMesh.instanceColor.needsUpdate = true;
    this.wheelMesh.count = this.karts.length * 4;
    this.karts.forEach((k, i) => (k.wheelBase = i * 4));
  }

  _wheelMat() {
    const m = new THREE.MeshToonMaterial({ vertexColors: true });
    return m;
  }

  setSize(w, h, pr) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewH = h * pr;
    this.fx.setScale(this.viewH, this.camera.fov);
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
      if (this.stateTime > 4.5 && !this.results) this._finishResults();
    }

    // Player input
    const inp = this.player && this.player.ai == null ? this.app.input.read(dt) : null;
    if (inp && this.player) {
      Object.assign(this.player.ctl, inp);
      if (this.state === 'countdown') this._trackRocket(inp);
    }

    const locked = this.state === 'intro' || this.state === 'countdown';
    if (!locked) this.raceTime += dt;

    // Rubber banding
    for (const k of this.karts) {
      if (!k.ai) continue;
      let mul = this.speedClass.ai * (0.95 + k.ai.skill * 0.05);
      if (this.player && !this.player.finished && this.mode !== 'demo') {
        const gap = this.player.total - k.total;
        mul *= 1 + clamp(gap / 240, -0.09, 0.12);
      }
      if (k === this.player) mul = 1;
      k.speedMul = mul;
    }

    const steps = Math.min(5, Math.max(1, Math.ceil(dt / PHYS_DT - 0.01)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this._physics(h, locked);

    this.items.update(dt, this.time);
    this._positions();

    for (const k of this.karts) {
      k.updateVisual(dt, this.time);
      k.emitFX(dt, this.fx, this.dust);
    }
    this._updateWheels();
    this.fx.update(dt);
    this._updateCamera(dt);
    this.world.update(dt, this.camera, this.player ? this.player.pos : this.karts[this.demoTarget % this.karts.length].pos);

    // Audio
    const a = this.app.audio;
    if (this.player && this.mode !== 'demo') {
      const p = this.player;
      a.updateEngine(clamp(p.speed / (p.baseTop * 1.3), 0, 1), p.boostTime > 0, true);
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    if (this.mode !== 'demo') hud.update(this, dt);
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
    if (s === 'countdown') this.app.hud.showTrackName(null);
    if (s === 'race') {
      for (const k of this.karts) k.lapStart = 0;
    }
  }

  _trackRocket(inp) {
    const t = this.stateTime;
    if (inp.drift && this.rocket.pressT < 0) this.rocket.pressT = t;
    if (!inp.drift) this.rocket.pressT = -1;
  }

  _applyRocketStarts() {
    for (const k of this.karts) {
      if (k.ai) {
        const r = Math.random();
        if (r < 0.35 * k.ai.skill) k.startBoost(0.9, 12);
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
      if (k.ai) k.ai.update(h, time);
      k.step(h, locked);
      if (k.rolling > 0) {
        k.rolling -= h;
        if (k.isPlayer && Math.random() < h * 14) this.app.audio.play('tick');
        if (k.rolling <= 0) {
          this.items.settle(k);
          if (k.isPlayer) this.app.audio.play('itemReady');
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
    const near = k.isPlayer || (this.player && k.pos.distanceToSquared(this.player.pos) < 400);
    for (let i = 0; i < ev.length; i += 2) {
      const type = ev[i], data = ev[i + 1];
      switch (type) {
        case 'useItem': {
          const used = this.items.use(k);
          if (used && near) {
            const snd = { chili: 'boost', bubble: 'shield', rainbow: 'rainbow', honey: 'honey', ball: 'throw', bee: 'bee' }[used];
            if (snd && (k.isPlayer || used !== 'chili')) a.play(snd);
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
        case 'hop':
          if (k.isPlayer) a.play('hop');
          break;
        case 'land':
          if (k.isPlayer) a.play('land');
          this.fx.burst(k.pos.x, k.pos.y + 0.2, k.pos.z, [this.dust], 8, 4, 1.2, 0.5, 2, false);
          break;
        case 'trick':
          if (k.isPlayer) { a.play('trick'); this.app.hud.toast('TRICK!'); }
          this.fx.burst(k.pos.x, k.pos.y + 1, k.pos.z, ['#ffd23f', '#ffffff', '#46f0ff'], 12, 6, 0.5, 0.5, 4);
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
          if (k.isPlayer) this.app.hud.hint('Tap DRIFT in the air for a trick!', 1.2);
          break;
      }
    }
  }

  _checkPads(k) {
    const tr = this.track;
    if (!k.grounded) return;
    for (const b of tr.boosts) {
      let u = k.trk.s - b.s;
      if (u < 0) u += tr.length;
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
    k.ai = new AIDriver(k, this, 0.9);
    k.speedMul = 0.92;
    this._positions();
    const place = this.mode === 'tt' ? 1 : k.place;
    this.app.hud.finish(place, this.mode === 'tt' ? null : place);
    this.app.audio.play(place <= 3 ? 'finish' : 'lose');
    this.app.input.resetButtons();
    this.fx.burst(k.pos.x, k.pos.y + 2, k.pos.z, ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'], 60, 14, 0.6, 1.4, 12);
  }

  _finishResults() {
    const est = (k) => {
      if (k.finished) return k.finishTime;
      const remaining = this.laps * this.track.length - k.total;
      return this.raceTime + Math.max(0, remaining) / (k.baseTop * 0.86);
    };
    const rows = this.karts.map((k) => ({ ch: k.ch, time: est(k), isPlayer: k.isPlayer, finished: k.finished, lapTimes: k.lapTimes.slice() }));
    rows.sort((a, b) => a.time - b.time);
    rows.forEach((r, i) => (r.place = i + 1));
    this.results = rows;
    this.app.onRaceComplete(this, rows);
  }

  _collide() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      const a = ks[i];
      for (let j = i + 1; j < ks.length; j++) {
        const b = ks[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const R = 1.2 * (a.root.scale.x + b.root.scale.x);
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || Math.abs(a.pos.y - b.pos.y) > 1.6) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d, nz = dz / d;
        const ov = R - d;
        const ma = a.weight * (a.starTime > 0 ? 4 : 1) * a.root.scale.x;
        const mb = b.weight * (b.starTime > 0 ? 4 : 1) * b.root.scale.x;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.pos.x -= nx * ov * wa; a.pos.z -= nz * ov * wa;
        b.pos.x += nx * ov * wb; b.pos.z += nz * ov * wb;
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          const j2 = (-(1 + 0.4) * rv) / (1 / ma + 1 / mb);
          a.vel.x -= (nx * j2) / ma; a.vel.z -= (nz * j2) / ma;
          b.vel.x += (nx * j2) / mb; b.vel.z += (nz * j2) / mb;
          if ((a.isPlayer || b.isPlayer) && -rv > 3) {
            this.app.audio.play('bump');
            this.shake = Math.max(this.shake, 0.2);
          }
        }
        if (a.starTime > 0 && b.starTime <= 0) b.hit('spin');
        else if (b.starTime > 0 && a.starTime <= 0) a.hit('spin');
        else if (a.shrinkTime > 0 && b.shrinkTime <= 0) a.hit('bump');
        else if (b.shrinkTime > 0 && a.shrinkTime <= 0) b.hit('bump');
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

  _updateWheels() {
    const m = this.wheelMesh;
    for (const k of this.karts) {
      k.root.updateMatrixWorld(true);
      for (let w = 0; w < 4; w++) m.setMatrixAt(k.wheelBase + w, k.wheels[w].spin.matrixWorld);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  // Thunder Cloud: zap everyone ahead of the user.
  storm(user) {
    let any = false;
    for (const k of this.karts) {
      if (k === user || k.place > user.place) continue;
      if (k.hit('zap')) any = true;
      for (let n = 0; n < 10; n++) {
        this.fx.glow.emit(k.pos.x + (Math.random() - 0.5), k.pos.y + 1 + n * 1.4, k.pos.z + (Math.random() - 0.5), 0, 0, 0, n % 2 ? '#fff6a0' : '#9fe8ff', 1.2, 0.4, 0.35);
      }
    }
    if (this.player && (user === this.player || this.player.place < user.place)) this.flash = 0.8;
    this.app.audio.play('zap');
    void any;
  }

  onBoxHit(k) {
    if (k.isPlayer) this.app.audio.play('item');
  }

  onGem(k) {
    if (k.isPlayer) this.app.audio.play('gem');
  }

  onHazardHit() {}
  onProjectileHit() {}
  onBallBounce(p) {
    if (this.player && p.pos.distanceToSquared(this.player.pos) < 600) this.app.audio.play('bump');
  }

  // ---------------- camera ----------------
  placeCam(snap) {
    const k = this.player || this.karts[0];
    if (!k) return;
    this.camYaw = k.yaw;
    if (this.state === 'intro') {
      this._introCam(0);
    } else {
      this._chase(1, true, k);
    }
    if (snap) this.camera.position.copy(this.camPos);
  }

  _introCam(dt) {
    const tr = this.track;
    const t = this.stateTime / 3.2;
    const fr = tr.frame(tr.length - 20, {});
    const cx = fr.x, cz = fr.z;
    const base = Math.atan2(fr.tx, fr.tz);
    const a = base + Math.PI * (0.3 + t * 1.1);
    const r = 34 - t * 12;
    this.camPos.set(cx + Math.sin(a) * r, tr.heightAtFrame(fr, 0) + 10 - t * 5, cz + Math.cos(a) * r);
    this.camLook.set(cx, tr.heightAtFrame(fr, 0) + 1, cz);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.fov = 60;
    void dt;
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
    // Distance eases in/out with speed and boosts; the camera never lags behind.
    const distT = 5.9 + sf * 0.9 + (k.boostTime > 0 ? 0.9 : 0) + far;
    this.camDist = snap || !this.camDist ? distT : damp(this.camDist, distT, 3, dt);
    const dist = this.camDist;
    const height = 2.5 + far * 0.3;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const want = this._v.set(k.pos.x - fx * dist, k.pos.y + height, k.pos.z - fz * dist);
    this.camPos.x = want.x;
    this.camPos.z = want.z;
    this.camPos.y = snap ? want.y : damp(this.camPos.y, want.y, 7, dt);
    const trk = this.track.project(this.camPos.x, this.camPos.z, this.camSeg, this.camTrk);
    this.camSeg = trk.idx;
    if (Math.abs(trk.d) < this.track.wallD + 1) this.camPos.y = Math.max(this.camPos.y, trk.y + 1.3);
    this.camLook.set(k.pos.x + fx * 3.5, k.pos.y + 1.25, k.pos.z + fz * 3.5);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
    this.fov = 68 + sf * 7 + (k.boostTime > 0 ? 7 : 0);
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
    else if (this.state === 'intro') this._introCam(dt);
    else if (this.state === 'finished' || this.state === 'done') this._orbitCam(dt, this.player);
    else this._chase(dt, this.stateTime < 0.02 && this.state === 'countdown');
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
    for (const k of this.karts) k.mat.dispose();
    this.shadowTex.dispose();
    this.scene.clear();
  }
}
