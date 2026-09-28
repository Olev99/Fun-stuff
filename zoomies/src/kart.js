import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';
import { kartGeometry, kartStats, bodyById } from './karts.js';
import { PATCHES } from './track.js';
import { pbrMat, GeoBuilder } from './util.js';
import { trailById } from './cosmetics.js';

const STAR_COLS = ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'];

const GRAVITY = 34;
const DRIFT_COLORS = [null, '#43c8ff', '#ff9a1f', '#d45cff'];
const DRIFT_THRESH = [0, 0.85, 1.9, 3.1];
const DRIFT_BOOST = [0, 0.75, 1.25, 1.8];

let _shieldGeo, _shieldMat, _shadowGeo, _shadowMat, _gliderGeo;
function gliderGeometry() {
  if (_gliderGeo) return _gliderGeo;
  const B = new GeoBuilder('fabric');
  B.add(new THREE.BoxGeometry(4.2, 0.08, 1.3), '#ffffff', [0, 2.7, -0.3], [0.12, 0, 0]);
  B.add(new THREE.BoxGeometry(2.1, 0.1, 1.32), '#ff5a8a', [-1.05, 2.72, -0.3], [0.12, 0, 0]);
  B.add(new THREE.BoxGeometry(0.5, 0.12, 1.34), '#ffd23f', [0, 2.74, -0.3], [0.12, 0, 0]);
  for (const x of [-0.7, 0.7]) B.add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), '#2a2438', [x, 1.95, -0.3], [0, 0, x * 0.4]);
  _gliderGeo = B.build();
  _gliderGeo.userData.shared = true;
  return _gliderGeo;
}
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
    this.bodyDef = bodyById(opts.body || 'classic');
    this.paint = opts.paint || null;
    // Cosmetics from the gumball machine: hat, boost trail and horn.
    this.look = opts.look || null;
    this.trailDef = trailById(this.look && this.look.trail);
    const st = (this.stats = opts.stats || kartStats(ch, this.bodyDef.id, opts.upgrades));
    const cls = race.speedClass;
    this.baseTop = cls.top * (0.93 + st.speed * 0.022);
    this.accelK = 0.55 + st.accel * 0.12;
    this.turnRate = 1.8 + st.handling * 0.12;
    this.driftTurn = 2.35 + st.handling * 0.1;
    this.weight = 0.8 + st.weight * 0.1;
    const mods = race.mods || {};
    const trackGrip = Math.min(race.trackDef.grip ?? 1, mods.grip ?? 1);
    this.grip = 9 * trackGrip * (st.grip ?? 1);
    this.driftGrip = 2.6 * trackGrip * (st.grip ?? 1);
    // How well the tyres put power down (snow and ice tracks are below 1).
    this.traction = Math.min(race.trackDef.traction ?? 1, mods.traction ?? 1);
    // Low gravity on the moon: longer, floatier jumps.
    this.gravityK = Math.min(race.trackDef.gravity ?? 1, mods.gravity ?? 1);
    this.patch = null;
    this.path = race.track;
    this.gliding = false;
    this.respawnT = 0;
    this.lastRamp = null;
    this.safeS = 0;
    this.wallT = 0;
    this.slipTime = 0; // oil: tyres lose grip
    this.slipSpin = 0;
    this.ghostTime = 0; // Boo Mask: pass through everything
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
    this.rocketTime = 0;
    this.magnetTime = 0;
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
    this.progT = 0;
    this.progAt = 0;
    this.wallStall = 0;
    this.visualYaw = 0;
    this.spinAngle = 0;
    this.wheelSpin = 0;
    this.events = [];

    this._buildVisual();
  }

  _buildVisual() {
    const gopt = { body: this.bodyDef.id, paint: this.paint, hat: this.look && this.look.hat };
    const geo = (this.geoHi = kartGeometry(this.ch, gopt));
    this.geoLo = kartGeometry(this.ch, { ...gopt, lo: true });
    this.lodFar = false;
    const sh = kartShared(this.race.shadowTex);
    this.mat = pbrMat({ physical: true });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const cast = !!this.race.quality.shadows;
    this.chassis = new THREE.Mesh(geo.chassis, this.mat);
    this.chassis.castShadow = cast;
    this.body.add(this.chassis);
    this.driverPivot = new THREE.Group();
    this.driverPivot.position.set(0, 0.8 + this.bodyDef.seat, -0.3);
    this.body.add(this.driverPivot);
    this.driver = new THREE.Mesh(geo.driver, this.mat);
    this.driver.position.set(0, -0.8, 0.3);
    this.driver.castShadow = cast;
    this.driverPivot.add(this.driver);
    this.wheels = this.bodyDef.wheels.map((w) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(w.x, w.y, w.z);
      const spin = new THREE.Object3D();
      spin.scale.set(w.w, w.r, w.r);
      pivot.add(spin);
      this.body.add(pivot);
      return { pivot, spin, def: w };
    });
    this.gliderMesh = new THREE.Mesh(gliderGeometry(), this.mat);
    this.gliderMesh.visible = false;
    this.body.add(this.gliderMesh);
    this.shieldMesh = new THREE.Mesh(sh._shieldGeo, sh._shieldMat);
    this.shieldMesh.position.y = 0.95;
    this.shieldMesh.visible = false;
    this.body.add(this.shieldMesh);
    this.shadow = new THREE.Mesh(sh._shadowGeo, sh._shadowMat);
    this.shadow.renderOrder = 1;
  }

  // Swap to the cheaper model when far from the camera (also used for its
  // shadow). Wheels are switched by the race's instanced wheel meshes.
  setLOD(far) {
    if (far === this.lodFar) return;
    this.lodFar = far;
    const g = far ? this.geoLo : this.geoHi;
    this.chassis.geometry = g.chassis;
    this.driver.geometry = g.driver;
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get fwdSpeed() {
    return this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
  }

  get topSpeed() {
    let top = this.baseTop * this.speedMul * (1 + this.gems * 0.009) * this.path.speedMul;
    if (this.shrinkTime > 0) top *= 0.78;
    if (this.starTime > 0) top *= 1.14;
    if (this.magnetTime > 0) top *= 1.08;
    if (this.rocketTime > 0) top *= 1.5;
    if (this.offroad && this.boostTime <= 0 && this.starTime <= 0 && this.rocketTime <= 0) top *= this.stats.offroad ?? 0.5;
    if (this.boostTime > 0) top *= 1.32;
    return top;
  }

  // Ran over an oil slick: slide for a moment. Returns true if it took.
  slip(t) {
    if (this.starTime > 0 || this.rocketTime > 0 || this.ghostTime > 0 || this.slipTime > 0.3) return false;
    this.slipTime = t;
    this.slipSpin = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random());
    this.drifting = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.emit('slip');
    return true;
  }

  // The road patch (ice, mud, oil...) under the kart, if any.
  _patchAt() {
    const ps = this.path.patches;
    if (!ps || !ps.length || !this.grounded || !this.trk) return null;
    const L = this.path.length, s = this.trk.s, d = this.trk.d;
    for (const p of ps) {
      let u = s - p.s;
      if (this.path.closed && u < 0) u += L;
      if (u >= 0 && u <= p.len && Math.abs(d - p.d) < p.w / 2) return PATCHES[p.type];
    }
    return null;
  }

  placeAt(s, d) {
    this.path = this.track;
    this.seg = -1;
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
    if (this.starTime > 0 || this.rocketTime > 0 || this.invuln > 0 || this.ghostTime > 0 || this.finishedLock) return false;
    if (this.shield > 0) {
      this.shield = 0;
      this.invuln = 0.6;
      this.emit('shieldPop');
      return false;
    }
    this.spinDur = (kind === 'zap' ? 0.9 : kind === 'bump' ? 0.6 : 1.3) * (this.stats.armor ?? 1);
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
    if (this.rocketTime > 0) {
      this.rocketTime -= dt;
      if (this.rocketTime <= 0) this.invuln = Math.max(this.invuln, 1);
    }
    if (this.magnetTime > 0) this.magnetTime -= dt;
    if (this.shrinkTime > 0) this.shrinkTime -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.boostTime > 0) this.boostTime -= dt;
    if (this.trickWindow > 0) this.trickWindow -= dt;
    if (this.slipTime > 0) this.slipTime -= dt;
    if (this.ghostTime > 0) {
      this.ghostTime -= dt;
      if (this.ghostTime <= 0) this.emit('ghostEnd');
    }
    if (this.hitFlash > 0) this.hitFlash -= dt * 2.5;

    const driftEdge = c.drift && !this.prevDrift;
    const driftRelease = !c.drift && this.prevDrift;
    this.prevDrift = c.drift;

    if (locked) {
      this.vel.set(0, 0, 0);
      this.steerS = damp(this.steerS, c.steer, 10, dt);
      return;
    }

    if (this.rescueReq) {
      this.rescueReq = false;
      this._rescue();
    }
    if (this.respawnT > 0) this.respawnT -= dt;
    const spinning = this.spinTime > 0 || this.respawnT > 0.3;
    const steerIn = spinning ? 0 : clamp(c.steer, -1, 1);
    this.steerS = damp(this.steerS, steerIn, 14, dt);

    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let rxk = -fz, rzk = fx;
    let vf = this.vel.x * fx + this.vel.z * fz;
    let vl = this.vel.x * rxk + this.vel.z * rzk;
    const top = this.topSpeed;
    const spd = Math.abs(vf);

    // Drift input. No hop: holding DRIFT arms it, and the slide starts as
    // soon as we're on the ground and steering (or at once if already turning).
    if (driftEdge && !spinning) {
      if (!this.grounded && this.rampAir && this.trickWindow > 0 && !this.trickDone) {
        this.trickDone = true;
        this.trickAnim = 1;
        this.emit('trick');
      }
      if (spd > 7 || !this.grounded) this.driftPending = true;
    }
    if (driftRelease) {
      if (this.drifting && this.driftLevel > 0) {
        this.startBoost(DRIFT_BOOST[this.driftLevel] * (this.stats.turbo ?? 1), 4 + this.driftLevel * 2);
        this.emit('driftBoost', this.driftLevel);
      }
      this.drifting = false;
      this.driftPending = false;
      this.driftCharge = 0;
      this.driftLevel = 0;
    }
    const steerNow = Math.abs(c.steer) > Math.abs(this.steerS) ? c.steer : this.steerS;
    if (c.drift && this.driftPending && !this.drifting && this.grounded && spd > 10 && Math.abs(steerNow) > 0.1) {
      this.drifting = true;
      this.driftDir = Math.sign(steerNow);
      this.driftCharge = 0;
      this.driftLevel = 0;
      this.driftPending = false;
      this.squash = Math.max(this.squash, 0.45);
      this.emit('driftStart');
    }
    if (this.drifting && (spd < 7 || spinning)) {
      this.drifting = false;
      this.driftCharge = 0;
      this.driftLevel = 0;
    }

    // Longitudinal
    const patch = (this.patch = this._patchAt());
    const trac = this.traction * (patch ? patch.traction : 1);
    if (spinning) {
      this.spinTime -= dt;
      vf *= Math.exp(-2.4 * dt);
      vl *= Math.exp(-3 * dt);
    } else if (c.brake) {
      if (vf > 1) vf -= 36 * dt * trac;
      else vf = Math.max(vf - 14 * dt * trac, -9);
    } else if (c.throttle > 0) {
      const tgt = top * c.throttle * (patch ? patch.speed : 1);
      if (vf < tgt) {
        vf += (tgt - vf) * (1 - Math.exp(-this.accelK * trac * dt)) + 2.5 * trac * dt;
        if (vf > tgt) vf = tgt;
      } else {
        vf = damp(vf, tgt, this.offroad ? 2.6 : 0.9, dt);
      }
    } else {
      vf = damp(vf, 0, 0.8, dt);
    }
    if ((this.boostTime > 0 || this.rocketTime > 0) && vf < top * 0.97) vf = damp(vf, top, 4, dt);

    // Steering
    // Arcade karts can still pivot at a crawl (e.g. nose against a wall).
    // Right after touching a wall it gets full lock so it can turn away.
    const pivot = this.wallT > 0 ? 1 : c.throttle > 0 || c.brake ? 0.55 : 0;
    if (this.wallT > 0) this.wallT -= dt;
    const sf = Math.max(clamp(spd / 9, 0, 1), pivot) * (1 - 0.16 * clamp(spd / this.baseTop, 0, 1.3));
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
      // Reversing on purpose steers like a car in reverse. Rolling back after
      // bouncing off a wall doesn't, or steering away would turn you into it.
      yawRate = -this.steerS * this.turnRate * sf * (vf < -0.5 && c.brake ? -1 : 1);
      if (!this.grounded) yawRate *= 0.6;
    }
    if (spinning) yawRate = 0;
    if (this.slipTime > 0) yawRate = yawRate * 0.4 + this.slipSpin * Math.min(1, this.slipTime);
    this.yaw += yawRate * dt;

    // Re-express velocity in the new heading and apply grip.
    let vx = fx * vf + rxk * vl;
    let vz = fz * vf + rzk * vl;
    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    rxk = -fz; rzk = fx;
    vf = vx * fx + vz * fz;
    vl = vx * rxk + vz * rzk;
    const gm = this.path.gripMul * (patch ? patch.grip : 1) * (this.slipTime > 0 ? 0.12 : 1);
    const grip = !this.grounded ? 0.8 : (this.drifting ? this.driftGrip : this.offroad ? this.grip * 0.8 : this.grip) * gm;
    vl *= Math.exp(-grip * dt);
    vx = fx * vf + rxk * vl;
    vz = fz * vf + rzk * vl;
    this.vel.x = vx;
    this.vel.z = vz;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;

    // Track projection and walls; may switch between main road and shortcuts.
    const prevPath = this.path;
    const vn = tr.resolve(this, 1.15, 0.3);
    const trk = this.trk;
    if (this.path !== prevPath) {
      if (this.path !== tr) this.emit('shortcut', this.path);
      this.seg = trk.idx;
    }
    if (vn > 0) {
      this.wallT = 0.6;
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
      // Nudge the nose off the wall and back towards the race direction so
      // the kart slides along it instead of grinding into it. It always
      // swings the way that points away from the wall, even when the kart
      // hit the wall facing backwards, so you never end up driving the
      // wrong way along it. The driver's own steering away takes over.
      const awayFromWall = this.steerS * Math.sign(trk.d) < -0.15;
      if (!awayFromWall && !c.brake) {
        let rel = this.yaw - Math.atan2(trk.tx, trk.tz);
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        // d > 0 is the right-hand wall; turning right lowers yaw.
        if (-Math.sign(trk.d) * rel > 0) this.yaw -= rel * Math.min(1, dt * 3);
      }
    }
    this.offroad = this.path.offroadAll || Math.abs(trk.d) > trk.ed - 0.3;

    // Vertical motion
    const overVoid = this.path.voids.length > 0 && this.path.isVoid(trk.s);
    const groundY = overVoid ? -80 : trk.y;
    const rampH = this.path.rampHeight(trk.s, trk.d);
    const ramp = rampH > 0 ? this.path.rampAt(trk.s, trk.d) : null;
    if (this.grounded) {
      if (groundY < this.pos.y - 0.5) {
        this.grounded = false;
        if (this.lastRampH > 0.4) {
          this.vy += 5.5;
          this.rampAir = true;
          this.trickWindow = 0.55;
          this.trickDone = false;
          if (this.lastRamp && this.lastRamp.glide) {
            this.gliding = true;
            this.vy += 3;
            this.emit('glide');
          }
          this.emit('ramp');
        }
      } else {
        this.vy = clamp((groundY - this.pos.y) / dt, -25, 25);
        this.pos.y = groundY;
      }
    }
    this.lastRampH = rampH;
    this.lastRamp = ramp;
    if (!this.grounded) {
      if (this.gliding) {
        this.vy -= GRAVITY * this.gravityK * 0.28 * dt;
        if (this.vy < -5) this.vy = -5;
      } else this.vy -= GRAVITY * this.gravityK * dt;
      this.pos.y += this.vy * dt;
      this.airTime += dt;
      if (this.pos.y <= groundY) {
        // Only land if we actually reach the surface; falling short of the
        // far edge of a gap means we are in the pit.
        if (groundY - this.pos.y < 2.5 || this.path.voids.length === 0) {
          this.pos.y = groundY;
          this._land();
        }
      }
      if (this.pos.y < trk.y - 14) this._fall();
    }
    if (this.grounded && this.path === tr) this.safeS = trk.s;

    // Progress & laps (shortcuts map onto the main loop)
    const L = tr.length;
    const ms = tr.mainS(this);
    const dS = ms - this.lastS;
    if (dS < -L / 2) this.laps++;
    else if (dS > L / 2) this.laps--;
    this.lastS = ms;
    this.mainPos = ms;
    this.total = this.laps * L + ms;

    // Wrong way detection
    const heading = Math.sin(this.yaw) * trk.tx + Math.cos(this.yaw) * trk.tz;
    if (heading < -0.35 && spd > 4) this.wrongWay += dt;
    else this.wrongWay = Math.max(0, this.wrongWay - dt * 2);

    // Stuck detection: trying to drive but barely moving for a few seconds.
    const trying = (c.throttle > 0 || c.brake) && !spinning && this.respawnT <= 0 && this.grounded;
    if (trying && this.speed < 2.5) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt * 2);
    // Also catch a kart that isn't getting anywhere: pinned on a wall,
    // bouncing back and forth, wedged, or going round in circles. Progress
    // counts from the furthest-back point, so it has to be real forward
    // progress; brief spins and hops don't reset the clock.
    if (c.throttle > 0 && this.respawnT <= 0 && !this.finished) {
      this.progT += dt;
      if (this.total < this.progAt) this.progAt = this.total;
      else if (this.total - this.progAt > 12) { this.progAt = this.total; this.progT = 0; }
      if (vn > 0) this.wallStall = 1.5;
    } else {
      this.progT = 0;
      this.progAt = this.total;
    }
    if (this.wallStall > 0) this.wallStall -= dt;
    if (this.stuck > 2.8 || this.progT > (this.wallStall > 0 ? 4 : 6.5)) this._rescue();

    // Item button edge
    const itemEdge = c.item && !this.prevItem;
    this.prevItem = c.item;
    if (itemEdge) this.emit('useItem');
  }

  // Pinned against something for a while: the drone lifts us back onto
  // the middle of the road, facing the right way.
  _rescue() {
    this.stuck = 0;
    this.progT = 0;
    this.safeS = this.path === this.track ? this.trk.s : this.safeS;
    this._fall();
  }

  _fall() {
    // Dropped into a gap: a drone plucks you back onto the main road.
    const tr = this.track;
    const s = this.path !== tr ? (this.path.fromS - 6 + tr.length) % tr.length : this.safeS;
    const fr = tr.frame(s, {});
    this.path = tr;
    this.seg = -1;
    this.pos.set(fr.x, 0, fr.z);
    tr.project(this.pos.x, this.pos.z, fr.idx ?? -1, this.trk);
    this.seg = this.trk.idx;
    this.pos.y = this.trk.y + 5;
    this.yaw = Math.atan2(fr.tx, fr.tz);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = false;
    this.gliding = false;
    this.drifting = false;
    this.driftPending = false;
    this.boostTime = 0;
    this.respawnT = 1.1;
    this.invuln = Math.max(this.invuln, 2);
    this.emit('fall');
  }

  _land() {
    const hard = this.airTime > 0.3;
    this.grounded = true;
    this.gliding = false;
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
    const ghost = this.ghostTime > 0;
    if (ghost !== !!this._ghostVis) {
      this._ghostVis = ghost;
      m.transparent = ghost;
      m.depthWrite = !ghost;
      m.opacity = 1;
      m.needsUpdate = true;
    }
    if (ghost) {
      m.opacity = 0.32 + 0.12 * Math.sin(time * 9);
      m.emissive.set('#b8a8ff');
      m.emissiveIntensity = 0.55;
    } else if (this.rocketTime > 0) {
      m.emissive.set(Math.floor(time * 12) % 2 ? '#ff6a1a' : '#ffd23f');
      m.emissiveIntensity = 0.6;
    } else if (this.starTime > 0) {
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
    this.gliderMesh.visible = this.gliding;
    if (this.gliding) this.gliderMesh.rotation.z = -this.steerS * 0.25;
    this.shieldMesh.visible = this.shield > 0;
    if (this.shield > 0) this.shieldMesh.scale.setScalar(1 + Math.sin(time * 6) * 0.04);

    // Blob shadow stays on the ground
    const h = this.pos.y - this.trk.y;
    this.shadow.position.set(this.pos.x, this.trk.y + 0.07, this.pos.z);
    this.shadow.rotation.y = this.yaw;
    const sc = root.scale.x * clamp(1 - h * 0.08, 0.4, 1);
    this.shadow.scale.set(sc, 1, sc);
    this.shadow.visible = !(this.path.voids.length && this.path.isVoid(this.trk.s));
    this.root.visible = !(this.respawnT > 0.3 && Math.floor(time * 20) % 2 === 0);
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
    if (this.boostTime > 0 || this.starTime > 0 || this.rocketTime > 0) {
      const td = this.trailDef;
      const big = this.rocketTime > 0 ? 2 : td.big || 1;
      for (const sx of big > 1.5 ? [-0.3, 0.3, 0, -0.3, 0.3] : [-0.3, 0.3]) {
        local(sx, 0.72, -1.62, v);
        const cols = this.starTime > 0 ? STAR_COLS : td.cols;
        fx.glow.emit(v[0], v[1], v[2], -fxs * 8 + (Math.random() - 0.5) * 2, 0.5 + Math.random(), -fzs * 8 + (Math.random() - 0.5) * 2,
          cols[Math.floor(Math.random() * cols.length)], 0.9 * big, 0.2, (0.18 + Math.random() * 0.1) * big, 0, 3);
      }
      // Trail sparkles hang in the air behind you.
      if (td.spark && this.boostTime > 0 && Math.random() < 0.7) {
        local((Math.random() - 0.5) * 1.4, 0.3 + Math.random() * 0.8, -1.4, v);
        const col = td.spark === 'rainbow' ? `hsl(${Math.floor(Math.random() * 360)},100%,65%)` : td.spark;
        fx.glow.emit(v[0], v[1], v[2], (Math.random() - 0.5), 0.6, (Math.random() - 0.5), col, 0.35, 0.06, 0.7, -0.5, 1);
      }
    }
    // Dust when off-road
    if (this.offroad && this.grounded && this.speed > 8 && Math.random() < 0.7) {
      const sx = Math.random() < 0.5 ? -0.85 : 0.85;
      local(sx, 0.2, -0.9, v);
      fx.soft.emit(v[0], v[1], v[2], (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3,
        dustColor, 0.7, 2.2, 0.6, -1, 2, 0.6);
    }
    // Magnet sparkles
    if (this.magnetTime > 0 && Math.random() < 0.5) {
      local((Math.random() - 0.5) * 3, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3, v);
      fx.glow.emit(v[0], v[1], v[2], 0, 0.5, 0, '#46f0ff', 0.4, 0.05, 0.4, 0, 1);
    }
    // Rainbow sparkle trail
    if (this.starTime > 0 && Math.random() < 0.8) {
      local((Math.random() - 0.5) * 1.6, 0.4 + Math.random(), -1, v);
      fx.glow.emit(v[0], v[1], v[2], 0, 1, 0, `hsl(${Math.floor(Math.random() * 360)},100%,65%)`, 0.4, 0.08, 0.5, -1, 1);
    }
  }
}
