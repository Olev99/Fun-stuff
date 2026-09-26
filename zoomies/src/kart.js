import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';
import { kartGeometry, WHEELS } from './characters.js';
import { toonMat } from './util.js';

const GRAVITY = 34;
const DRIFT_COLORS = [null, '#43c8ff', '#ff9a1f', '#d45cff'];
const DRIFT_THRESH = [0, 0.85, 1.9, 3.1];
const DRIFT_BOOST = [0, 0.75, 1.25, 1.8];

let _shieldGeo, _shieldMat, _shadowGeo, _shadowMat;
export function kartShared(shadowTex) {
  if (!_shieldGeo) {
    _shieldGeo = new THREE.SphereGeometry(1.95, 20, 14);
    _shieldGeo.userData.shared = true;
    _shieldMat = new THREE.MeshBasicMaterial({ color: '#8fe6ff', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    _shieldMat.userData.shared = true;
    _shadowGeo = new THREE.PlaneGeometry(2.4, 3.3);
    _shadowGeo.rotateX(-Math.PI / 2);
    _shadowGeo.userData.shared = true;
  }
  if (!_shadowMat || _shadowMat.map !== shadowTex) {
    _shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: '#000000', opacity: 1 });
    _shadowMat.userData.shared = true;
    _shadowMat.map.userData.shared = true;
  }
  return { _shieldGeo, _shieldMat, _shadowGeo, _shadowMat };
}

export class Kart {
  constructor(race, ch, opts = {}) {
    this.race = race;
    this.track = race.track;
    this.ch = ch;
    this.isPlayer = !!opts.isPlayer;
    this.index = opts.index ?? 0;
    const st = ch.stats;
    const cls = race.speedClass;
    this.baseTop = cls.top * (0.93 + st.speed * 0.022);
    this.accelK = 0.55 + st.accel * 0.12;
    this.turnRate = 1.8 + st.handling * 0.12;
    this.driftTurn = 2.35 + st.handling * 0.1;
    this.weight = 0.8 + st.weight * 0.1;
    this.grip = 9 * (race.trackDef.grip ?? 1);
    this.driftGrip = 2.6 * (race.trackDef.grip ?? 1);
    this.speedMul = 1; // AI rubber banding / difficulty

    this.ctl = { steer: 0, throttle: 0, brake: false, drift: false, item: false };
    this.prevDrift = false;
    this.prevItem = false;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.grounded = true;
    this.steerS = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.driftPending = false;
    this.boostTime = 0;
    this.boostKick = 0;
    this.spinTime = 0;
    this.spinDur = 1;
    this.invuln = 0;
    this.starTime = 0;
    this.shrinkTime = 0;
    this.shield = 0;
    this.airTime = 0;
    this.rampAir = false;
    this.trickWindow = 0;
    this.trickDone = false;
    this.trickAnim = 0;
    this.lastRampH = 0;
    this.squash = 0;
    this.hitFlash = 0;
    this.item = null;
    this.itemCount = 0;
    this.rolling = 0;
    this.gems = 0;
    this.trk = { d: 0, s: 0, y: 0 };
    this.seg = -1;
    this.laps = -1;
    this.maxLap = 0;
    this.lastS = 0;
    this.total = 0;
    this.place = 1;
    this.finished = false;
    this.finishTime = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.offroad = false;
    this.wallBump = 0;
    this.wrongWay = 0;
    this.stuck = 0;
    this.visualYaw = 0;
    this.spinAngle = 0;
    this.wheelSpin = 0;
    this.events = [];

    this._buildVisual();
  }

  _buildVisual() {
    const geo = kartGeometry(this.ch);
    const sh = kartShared(this.race.shadowTex);
    this.mat = toonMat({ vertexColors: true });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const cast = !!this.race.quality.shadows;
    this.chassis = new THREE.Mesh(geo.chassis, this.mat);
    this.chassis.castShadow = cast;
    this.body.add(this.chassis);
    this.driverPivot = new THREE.Group();
    this.driverPivot.position.set(0, 0.8, -0.3);
    this.body.add(this.driverPivot);
    this.driver = new THREE.Mesh(geo.driver, this.mat);
    this.driver.position.set(0, -0.8, 0.3);
    this.driver.castShadow = cast;
    this.driverPivot.add(this.driver);
    this.wheels = WHEELS.map((w) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(w.x, w.y, w.z);
      const spin = new THREE.Object3D();
      spin.scale.set(w.w, w.r, w.r);
      pivot.add(spin);
      this.body.add(pivot);
      return { pivot, spin, def: w };
    });
    this.shieldMesh = new THREE.Mesh(sh._shieldGeo, sh._shieldMat);
    this.shieldMesh.position.y = 0.95;
    this.shieldMesh.visible = false;
    this.body.add(this.shieldMesh);
    this.shadow = new THREE.Mesh(sh._shadowGeo, sh._shadowMat);
    this.shadow.renderOrder = 1;
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get fwdSpeed() {
    return this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
  }

  get topSpeed() {
    let top = this.baseTop * this.speedMul * (1 + this.gems * 0.009);
    if (this.shrinkTime > 0) top *= 0.78;
    if (this.starTime > 0) top *= 1.14;
    if (this.offroad && this.boostTime <= 0 && this.starTime <= 0) top *= 0.5;
    if (this.boostTime > 0) top *= 1.32;
    return top;
  }

  placeAt(s, d) {
    const fr = this.track.frame(s, {});
    this.pos.set(fr.x + fr.rx * d, 0, fr.z + fr.rz * d);
    this.yaw = Math.atan2(fr.tx, fr.tz);
    this.visualYaw = 0;
    this.vel.set(0, 0, 0);
    this.track.project(this.pos.x, this.pos.z, -1, this.trk);
    this.seg = this.trk.idx;
    this.pos.y = this.trk.y;
    this.lastS = this.trk.s;
    this.grounded = true;
  }

  emit(type, data) {
    this.events.push(type, data);
  }

  startBoost(t, kick = 6) {
    this.boostTime = Math.max(this.boostTime, t);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const vf = this.vel.x * fx + this.vel.z * fz;
    const add = Math.max(0, Math.min(kick, this.baseTop * 1.3 - vf));
    this.vel.x += fx * add;
    this.vel.z += fz * add;
    this.emit('boost', t);
  }

  hit(kind = 'spin') {
    if (this.starTime > 0 || this.invuln > 0 || this.finishedLock) return false;
    if (this.shield > 0) {
      this.shield = 0;
      this.invuln = 0.6;
      this.emit('shieldPop');
      return false;
    }
    this.spinDur = kind === 'zap' ? 0.9 : kind === 'bump' ? 0.6 : 1.3;
    this.spinTime = this.spinDur;
    this.invuln = this.spinDur + 1.2;
    this.drifting = false;
    this.driftPending = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.boostTime = 0;
    this.hitFlash = 1;
    if (kind === 'zap') this.shrinkTime = 4;
    const lost = Math.min(this.gems, 3);
    this.gems -= lost;
    this.emit('hit', lost);
    if (this.grounded) {
      this.vy = kind === 'spin' ? 6 : 3;
      this.grounded = false;
    }
    return true;
  }

  // ---- Physics step ----
  step(dt, locked) {
    const tr = this.track;
    const c = this.ctl;
    this.events.length = 0;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.starTime > 0) this.starTime -= dt;
    if (this.shrinkTime > 0) this.shrinkTime -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.boostTime > 0) this.boostTime -= dt;
    if (this.trickWindow > 0) this.trickWindow -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt * 2.5;

    const driftEdge = c.drift && !this.prevDrift;
    const driftRelease = !c.drift && this.prevDrift;
    this.prevDrift = c.drift;

    if (locked) {
      this.vel.set(0, 0, 0);
      this.steerS = damp(this.steerS, c.steer, 10, dt);
      return;
    }

    const spinning = this.spinTime > 0;
    const steerIn = spinning ? 0 : clamp(c.steer, -1, 1);
    this.steerS = damp(this.steerS, steerIn, 14, dt);

    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let rxk = -fz, rzk = fx;
    let vf = this.vel.x * fx + this.vel.z * fz;
    let vl = this.vel.x * rxk + this.vel.z * rzk;
    const top = this.topSpeed;
    const spd = Math.abs(vf);

    // Drift input
    if (driftEdge && !spinning) {
      if (this.grounded && spd > 7) {
        this.vy = 5.2;
        this.grounded = false;
        this.driftPending = true;
        this.emit('hop');
      } else if (!this.grounded && this.rampAir && this.trickWindow > 0 && !this.trickDone) {
        this.trickDone = true;
        this.trickAnim = 1;
        this.emit('trick');
      }
    }
    if (driftRelease) {
      if (this.drifting && this.driftLevel > 0) this.startBoost(DRIFT_BOOST[this.driftLevel], 4 + this.driftLevel * 2);
      this.drifting = false;
      this.driftPending = false;
      this.driftCharge = 0;
      this.driftLevel = 0;
    }
    if (c.drift && this.driftPending && !this.drifting && this.grounded && spd > 11 && Math.abs(this.steerS) > 0.22) {
      this.drifting = true;
      this.driftDir = Math.sign(this.steerS);
      this.driftCharge = 0;
      this.driftLevel = 0;
      this.driftPending = false;
    }
    if (this.drifting && (spd < 7 || spinning)) {
      this.drifting = false;
      this.driftCharge = 0;
      this.driftLevel = 0;
    }

    // Longitudinal
    if (spinning) {
      this.spinTime -= dt;
      vf *= Math.exp(-2.4 * dt);
      vl *= Math.exp(-3 * dt);
    } else if (c.brake) {
      if (vf > 1) vf -= 36 * dt;
      else vf = Math.max(vf - 14 * dt, -9);
    } else if (c.throttle > 0) {
      const tgt = top * c.throttle;
      if (vf < tgt) {
        vf += (tgt - vf) * (1 - Math.exp(-this.accelK * dt)) + 2.5 * dt;
        if (vf > tgt) vf = tgt;
      } else {
        vf = damp(vf, tgt, this.offroad ? 2.6 : 0.9, dt);
      }
    } else {
      vf = damp(vf, 0, 0.8, dt);
    }
    if (this.boostTime > 0 && vf < top * 0.97) vf = damp(vf, top, 4, dt);

    // Steering
    const sf = clamp(spd / 9, 0, 1) * (1 - 0.16 * clamp(spd / this.baseTop, 0, 1.3));
    let yawRate;
    if (this.drifting) {
      const rel = clamp(this.steerS * this.driftDir, -1, 1);
      yawRate = -this.driftDir * this.driftTurn * (0.56 + 0.44 * rel) * sf;
      if (this.grounded) this.driftCharge += dt * (0.7 + 0.8 * Math.max(0, rel));
      let lvl = 0;
      for (let k = 3; k >= 1; k--) if (this.driftCharge >= DRIFT_THRESH[k]) { lvl = k; break; }
      if (lvl > this.driftLevel) {
        this.driftLevel = lvl;
        this.emit('driftLevel', lvl);
      }
    } else {
      yawRate = -this.steerS * this.turnRate * sf * (vf < -0.5 ? -1 : 1);
      if (!this.grounded) yawRate *= 0.6;
    }
    if (spinning) yawRate = 0;
    this.yaw += yawRate * dt;

    // Re-express velocity in the new heading and apply grip.
    let vx = fx * vf + rxk * vl;
    let vz = fz * vf + rzk * vl;
    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    rxk = -fz; rzk = fx;
    vf = vx * fx + vz * fz;
    vl = vx * rxk + vz * rzk;
    const grip = !this.grounded ? 0.8 : this.drifting ? this.driftGrip : this.offroad ? this.grip * 0.8 : this.grip;
    vl *= Math.exp(-grip * dt);
    vx = fx * vf + rxk * vl;
    vz = fz * vf + rzk * vl;
    this.vel.x = vx;
    this.vel.z = vz;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;

    // Track projection
    const trk = tr.project(this.pos.x, this.pos.z, this.seg, this.trk);
    this.seg = trk.idx;

    // Walls
    const lim = tr.wallD - 1.15;
    if (Math.abs(trk.d) > lim) {
      const sg = Math.sign(trk.d);
      const push = Math.abs(trk.d) - lim;
      this.pos.x -= trk.rx * sg * push;
      this.pos.z -= trk.rz * sg * push;
      trk.d -= sg * push;
      const vn = (this.vel.x * trk.rx + this.vel.z * trk.rz) * sg;
      if (vn > 0) {
        this.vel.x -= trk.rx * sg * vn * 1.45;
        this.vel.z -= trk.rz * sg * vn * 1.45;
        if (vn > 4) {
          const k = clamp(1 - vn * 0.012, 0.72, 0.97);
          this.vel.x *= k;
          this.vel.z *= k;
          this.emit('wall', vn);
          if (vn > 13 && this.drifting) {
            this.drifting = false;
            this.driftCharge = 0;
            this.driftLevel = 0;
          }
        }
        // nudge heading to slide along the wall instead of grinding into it
        const along = Math.atan2(trk.tx, trk.tz);
        const fwdDot = Math.sin(this.yaw) * trk.tx + Math.cos(this.yaw) * trk.tz;
        const target = fwdDot >= 0 ? along : along + Math.PI;
        let dy = target - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 3);
      }
      trk.y = tr.heightAtFrame(trk, trk.d);
    }
    this.offroad = Math.abs(trk.d) > tr.edgeD - 0.3;

    // Vertical motion
    const groundY = trk.y;
    const rampH = tr.rampHeight(trk.s, trk.d);
    if (this.grounded) {
      if (groundY < this.pos.y - 0.5) {
        this.grounded = false;
        if (this.lastRampH > 0.4) {
          this.vy += 5.5;
          this.rampAir = true;
          this.trickWindow = 0.55;
          this.trickDone = false;
          this.emit('ramp');
        }
      } else {
        this.vy = clamp((groundY - this.pos.y) / dt, -25, 25);
        this.pos.y = groundY;
      }
    }
    this.lastRampH = rampH;
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      this.airTime += dt;
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        this._land();
      }
    }

    // Progress & laps
    const L = tr.length;
    const dS = trk.s - this.lastS;
    if (dS < -L / 2) this.laps++;
    else if (dS > L / 2) this.laps--;
    this.lastS = trk.s;
    this.total = this.laps * L + trk.s;

    // Wrong way detection
    const heading = Math.sin(this.yaw) * trk.tx + Math.cos(this.yaw) * trk.tz;
    if (heading < -0.35 && spd > 4) this.wrongWay += dt;
    else this.wrongWay = Math.max(0, this.wrongWay - dt * 2);

    // Item button edge
    const itemEdge = c.item && !this.prevItem;
    this.prevItem = c.item;
    if (itemEdge) this.emit('useItem');
  }

  _land() {
    const hard = this.airTime > 0.3;
    this.grounded = true;
    if (hard) {
      this.squash = Math.min(1, this.airTime * 1.4);
      this.emit('land', this.airTime);
    }
    if (this.trickDone) {
      this.startBoost(0.9, 5);
      this.trickDone = false;
    }
    this.rampAir = false;
    this.airTime = 0;
    this.vy = 0;
  }

  // ---- Visuals (once per rendered frame) ----
  updateVisual(dt, time) {
    const root = this.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    const s = this.shrinkTime > 0 ? 0.62 : 1;
    root.scale.setScalar(damp(root.scale.x, s, 10, dt));

    // Drift angle and spin
    const dTarget = this.drifting ? -this.driftDir * 0.42 : 0;
    this.visualYaw = damp(this.visualYaw, dTarget, 8, dt);
    if (this.spinTime > 0) {
      const p = 1 - this.spinTime / this.spinDur;
      this.spinAngle = p * Math.PI * 4;
    } else this.spinAngle = 0;
    let trick = 0;
    if (this.trickAnim > 0) {
      this.trickAnim = Math.max(0, this.trickAnim - dt * 2.4);
      trick = (1 - this.trickAnim) * Math.PI * 2;
    }

    // Tilt with the ground
    const trk = this.trk;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const along = fx * trk.tx + fz * trk.tz;
    const pitchT = this.grounded ? -Math.atan(trk.grade * along) : clamp(-this.vy * 0.02, -0.35, 0.35);
    const slopeRel = trk.slope * (-fz * trk.rx + fx * trk.rz);
    const rollT = this.grounded ? -Math.atan(slopeRel) : 0;
    const b = this.body;
    b.rotation.order = 'YXZ';
    b.rotation.x = damp(b.rotation.x, pitchT, 12, dt);
    b.rotation.z = damp(b.rotation.z, rollT + (this.drifting ? this.driftDir * 0.06 : 0), 10, dt);
    b.rotation.y = this.visualYaw + this.spinAngle + trick;
    this.squash = Math.max(0, this.squash - dt * 4);
    const bob = this.grounded && this.speed > 2 ? Math.sin(time * 38 + this.index) * 0.012 * Math.min(1, this.speed / 20) : 0;
    b.scale.set(1 + this.squash * 0.12, 1 - this.squash * 0.18, 1 + this.squash * 0.08);
    b.position.y = bob + (this.offroad && this.grounded ? Math.sin(time * 55) * 0.025 : 0);

    // Driver lean
    this.driverPivot.rotation.z = damp(this.driverPivot.rotation.z, this.steerS * 0.22 + (this.drifting ? this.driftDir * 0.12 : 0), 10, dt);
    this.driverPivot.rotation.x = damp(this.driverPivot.rotation.x, this.boostTime > 0 ? -0.12 : 0, 6, dt);

    // Wheels
    this.wheelSpin += (this.fwdSpeed / 0.38) * dt;
    const steerA = -this.steerS * 0.42;
    for (const w of this.wheels) {
      if (w.def.front) w.pivot.rotation.y = steerA;
      w.spin.rotation.x = this.wheelSpin;
    }

    // Effects on materials
    const m = this.mat;
    if (this.starTime > 0) {
      m.emissive.setHSL((time * 1.8) % 1, 1, 0.5);
      m.emissiveIntensity = 0.65;
    } else if (this.hitFlash > 0) {
      m.emissive.set('#ffffff');
      m.emissiveIntensity = this.hitFlash * 0.8;
    } else if (this.invuln > 0 && Math.floor(time * 16) % 2 === 0) {
      m.emissive.set('#ffffff');
      m.emissiveIntensity = 0.25;
    } else {
      m.emissiveIntensity = 0;
    }
    this.shieldMesh.visible = this.shield > 0;
    if (this.shield > 0) this.shieldMesh.scale.setScalar(1 + Math.sin(time * 6) * 0.04);

    // Blob shadow stays on the ground
    const h = this.pos.y - this.trk.y;
    this.shadow.position.set(this.pos.x, this.trk.y + 0.07, this.pos.z);
    this.shadow.rotation.y = this.yaw;
    const sc = root.scale.x * clamp(1 - h * 0.08, 0.4, 1);
    this.shadow.scale.set(sc, 1, sc);
    this.shadow.material.opacity = 1;
  }

  // Particle effects
  emitFX(dt, fx, dustColor) {
    const fxs = Math.sin(this.yaw), fzs = Math.cos(this.yaw);
    const rx = -fzs, rz = fxs;
    const p = this.pos;
    const sc = this.root.scale.x;
    const local = (lx, ly, lz, out) => {
      out[0] = p.x + (rx * -lx + fxs * lz) * sc;
      out[1] = p.y + ly * sc;
      out[2] = p.z + (rz * -lx + fzs * lz) * sc;
      return out;
    };
    const v = this._v || (this._v = [0, 0, 0]);
    // Drift sparks
    if (this.drifting && this.grounded) {
      const col = DRIFT_COLORS[this.driftLevel] || '#fff3b0';
      const n = this.driftLevel ? 2 : 1;
      for (const sx of [-0.85, 0.85]) {
        for (let k = 0; k < n; k++) {
          local(sx, 0.15, -0.95, v);
          fx.glow.emit(v[0], v[1], v[2], (Math.random() - 0.5) * 4 - fxs * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 4 - fzs * 3,
            col, this.driftLevel ? 0.5 : 0.28, 0.05, 0.25 + Math.random() * 0.15, 14, 2);
        }
      }
    }
    // Boost flames
    if (this.boostTime > 0 || this.starTime > 0) {
      for (const sx of [-0.3, 0.3]) {
        local(sx, 0.72, -1.62, v);
        const cols = this.starTime > 0 ? ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'] : ['#fff3a0', '#ffb020', '#ff6a1f'];
        fx.glow.emit(v[0], v[1], v[2], -fxs * 8 + (Math.random() - 0.5) * 2, 0.5 + Math.random(), -fzs * 8 + (Math.random() - 0.5) * 2,
          cols[Math.floor(Math.random() * cols.length)], 0.9, 0.2, 0.18 + Math.random() * 0.1, 0, 3);
      }
    }
    // Dust when off-road
    if (this.offroad && this.grounded && this.speed > 8 && Math.random() < 0.7) {
      const sx = Math.random() < 0.5 ? -0.85 : 0.85;
      local(sx, 0.2, -0.9, v);
      fx.soft.emit(v[0], v[1], v[2], (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3,
        dustColor, 0.7, 2.2, 0.6, -1, 2, 0.6);
    }
    // Rainbow sparkle trail
    if (this.starTime > 0 && Math.random() < 0.8) {
      local((Math.random() - 0.5) * 1.6, 0.4 + Math.random(), -1, v);
      fx.glow.emit(v[0], v[1], v[2], 0, 1, 0, `hsl(${Math.floor(Math.random() * 360)},100%,65%)`, 0.4, 0.08, 0.5, -1, 1);
    }
  }
}
