import * as THREE from 'three';
import { GeoBuilder, toonMat } from './util.js';
import * as TX from './textures.js';

export const ITEMS = {
  chili: { icon: '🌶️', name: 'Chili Boost' },
  honey: { icon: '🍯', name: 'Honey Pot' },
  ball: { icon: '🥎', name: 'Bumper Ball' },
  bee: { icon: '🐝', name: 'Buzz Bee' },
  bubble: { icon: '🫧', name: 'Bubble Shield' },
  rainbow: { icon: '🌈', name: 'Rainbow Rush' },
  storm: { icon: '⛈️', name: 'Thunder Cloud' },
};
export const ITEM_ICONS = Object.values(ITEMS).map((i) => i.icon);

// Odds depend on race position: leaders get defence, stragglers get catch-up.
const TABLES = [
  { honey: 36, ball: 30, bubble: 24, chili: 10 },
  { honey: 20, ball: 22, bee: 16, chili: 22, bubble: 10, chili3: 8, storm: 2 },
  { chili: 16, chili3: 22, bee: 22, rainbow: 12, ball: 12, storm: 6, bubble: 10 },
  { chili3: 30, rainbow: 26, bee: 20, storm: 12, chili: 12 },
];

function weighted(table) {
  let sum = 0;
  for (const k in table) sum += table[k];
  let r = Math.random() * sum;
  for (const k in table) {
    r -= table[k];
    if (r <= 0) return k;
  }
  return Object.keys(table)[0];
}

let _geo = null;
function geos() {
  if (_geo) return _geo;
  const honey = new GeoBuilder()
    .add(new THREE.SphereGeometry(1.6, 16, 6), '#ffb21f', [0, 0.02, 0], [0, 0, 0], [1, 0.1, 1])
    .add(new THREE.SphereGeometry(0.7, 10, 6), '#ffc93f', [0.9, 0.05, 0.5], [0, 0, 0], [1, 0.15, 1])
    .add(new THREE.CylinderGeometry(0.42, 0.36, 0.62, 12), '#d98a1a', [0, 0.36, 0])
    .add(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 12), '#fff3d6', [0, 0.7, 0])
    .add(new THREE.CylinderGeometry(0.43, 0.43, 0.2, 12), '#fff3d6', [0, 0.36, 0])
    .build();
  const ball = new GeoBuilder()
    .add(new THREE.SphereGeometry(0.62, 16, 12), '#d8ff3a')
    .add(new THREE.TorusGeometry(0.62, 0.05, 6, 24), '#ffffff', [0, 0, 0], [0.5, 0.3, 0])
    .build();
  const bee = new GeoBuilder()
    .add(new THREE.SphereGeometry(0.5, 14, 10), '#ffd21f', [0, 0, 0], [0, 0, 0], [0.9, 0.9, 1.25])
    .add(new THREE.TorusGeometry(0.44, 0.08, 6, 16), '#1d1537', [0, 0, 0.12])
    .add(new THREE.TorusGeometry(0.4, 0.08, 6, 16), '#1d1537', [0, 0, -0.22])
    .add(new THREE.ConeGeometry(0.12, 0.3, 6), '#1d1537', [0, 0, -0.72], [-Math.PI / 2, 0, 0])
    .add(new THREE.SphereGeometry(0.34, 10, 6), '#e9f7ff', [0.36, 0.42, -0.05], [0, 0, 0.5], [0.5, 0.15, 1])
    .add(new THREE.SphereGeometry(0.34, 10, 6), '#e9f7ff', [-0.36, 0.42, -0.05], [0, 0, -0.5], [0.5, 0.15, 1])
    .add(new THREE.SphereGeometry(0.09, 8, 6), '#1d1537', [0.17, 0.12, 0.55])
    .add(new THREE.SphereGeometry(0.09, 8, 6), '#1d1537', [-0.17, 0.12, 0.55])
    .build();
  _geo = { honey, ball, bee };
  for (const g of Object.values(_geo)) g.userData.shared = true;
  return _geo;
}

export class ItemSystem {
  constructor(race) {
    this.race = race;
    this.track = race.track;
    this.group = new THREE.Group();
    race.scene.add(this.group);
    this.boxes = [];
    this.gems = [];
    this.hazards = [];
    this.projectiles = [];
    this.mat = toonMat({ vertexColors: true });
    this.geo = geos();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._fr = {};
    this._buildBoxes(race.mode !== 'tt');
    this._buildGems(race.mode !== 'tt');
  }

  _buildBoxes(enabled) {
    const tr = this.track;
    if (!enabled) return;
    const k = tr.halfRoad / 8.5;
    const v = new THREE.Vector3();
    for (const s of tr.itemRows) {
      for (const d of [-6, -2, 2, 6]) {
        tr.pointAt(s, d * k, v);
        this.boxes.push({ pos: v.clone().setY(v.y + 1.4), active: true, t: 0, ph: Math.random() * 6 });
      }
    }
    this.qTex = TX.itemBoxTexture();
    const mat = new THREE.MeshBasicMaterial({ map: this.qTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), mat, this.boxes.length);
    this.boxMesh.renderOrder = 2;
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.coreMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.42, 0), coreMat, this.boxes.length);
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxMesh.setColorAt(i, this._c.set('#ffffff'));
      this.coreMesh.setColorAt(i, this._c.set('#ffffff'));
    }
    this.group.add(this.coreMesh, this.boxMesh);
  }

  _buildGems(enabled) {
    const tr = this.track;
    if (!enabled) return;
    const v = new THREE.Vector3();
    for (const g of tr.gemLines) {
      for (let n = 0; n < g.n; n++) {
        tr.pointAt(g.s + n * 3.2, g.d, v);
        this.gems.push({ pos: v.clone().setY(v.y + 0.9), active: true, t: 0 });
      }
    }
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(1, 1.35, 1);
    const mat = new THREE.MeshLambertMaterial({ color: '#46f0ff', emissive: new THREE.Color('#1c8cff'), emissiveIntensity: 0.55 });
    this.gemMesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.gems.length));
    this.group.add(this.gemMesh);
  }

  roll(kart) {
    const n = this.race.karts.length;
    const p = n > 1 ? (kart.place - 1) / (n - 1) : 0;
    const table = kart.place === 1 ? TABLES[0] : p < 0.45 ? TABLES[1] : p < 0.8 ? TABLES[2] : TABLES[3];
    return weighted(table);
  }

  give(kart, forced) {
    if (kart.item || kart.rolling > 0) return;
    kart.pendingItem = forced || this.roll(kart);
    kart.rolling = kart.isPlayer ? 1.25 : 0.5;
  }

  // Called when rolling finishes.
  settle(kart) {
    const it = kart.pendingItem;
    kart.pendingItem = null;
    if (it === 'chili3') {
      kart.item = 'chili';
      kart.itemCount = 3;
    } else {
      kart.item = it;
      kart.itemCount = 1;
    }
  }

  use(kart) {
    const it = kart.item;
    if (!it || kart.rolling > 0 || kart.spinTime > 0) return null;
    kart.itemCount--;
    if (kart.itemCount <= 0) {
      kart.item = null;
      kart.itemCount = 0;
    }
    const race = this.race;
    const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw);
    switch (it) {
      case 'chili':
        kart.startBoost(1.35, 9);
        break;
      case 'bubble':
        kart.shield = 14;
        break;
      case 'rainbow':
        kart.starTime = 7.5;
        kart.startBoost(0.6, 6);
        break;
      case 'honey': {
        const x = kart.pos.x - fx * 2.8, z = kart.pos.z - fz * 2.8;
        this.addHoney(x, z, kart);
        break;
      }
      case 'ball': {
        const sp = Math.max(0, kart.fwdSpeed) + 30;
        this.addProjectile('ball', kart, kart.pos.x + fx * 2.4, kart.pos.z + fz * 2.4, fx * sp, fz * sp);
        break;
      }
      case 'bee': {
        const target = race.karts.find((o) => o.place === kart.place - 1 && !o.finished) || null;
        this.addProjectile('bee', kart, kart.pos.x + fx * 2, kart.pos.z + fz * 2, 0, 0, target);
        break;
      }
      case 'storm':
        race.storm(kart);
        break;
    }
    return it;
  }

  addHoney(x, z, owner) {
    const tr = this.track;
    const trk = tr.project(x, z, owner ? owner.seg : -1, {});
    const lim = tr.wallD - 1.5;
    if (Math.abs(trk.d) > lim) {
      const sg = Math.sign(trk.d);
      x -= trk.rx * sg * (Math.abs(trk.d) - lim);
      z -= trk.rz * sg * (Math.abs(trk.d) - lim);
      trk.d = sg * lim;
    }
    const mesh = new THREE.Mesh(this.geo.honey, this.mat);
    mesh.position.set(x, tr.heightAtFrame(trk, trk.d) + 0.02, z);
    mesh.rotation.y = Math.random() * 6;
    this.group.add(mesh);
    this.hazards.push({ type: 'honey', mesh, pos: mesh.position, s: trk.s, d: trk.d, owner, grace: 0.5, life: 45 });
  }

  addProjectile(type, owner, x, z, vx, vz, target = null) {
    const tr = this.track;
    const mesh = new THREE.Mesh(type === 'ball' ? this.geo.ball : this.geo.bee, this.mat);
    const trk = tr.project(x, z, owner.seg, {});
    mesh.position.set(x, trk.y + 0.7, z);
    this.group.add(mesh);
    const p = {
      type, owner, mesh, pos: mesh.position, vx, vz, seg: trk.idx, trk,
      life: type === 'ball' ? 7 : 12, grace: 0.35, bounces: 0, target,
      prog: owner.total + 2, d: owner.trk.d,
    };
    this.projectiles.push(p);
    return p;
  }

  removeHazard(h) {
    this.group.remove(h.mesh);
    this.hazards.splice(this.hazards.indexOf(h), 1);
  }

  removeProjectile(p) {
    this.group.remove(p.mesh);
    this.projectiles.splice(this.projectiles.indexOf(p), 1);
  }

  update(dt, time) {
    const race = this.race;
    const tr = this.track;
    const karts = race.karts;
    const fx = race.fx;

    // Item boxes
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.active) {
        b.t -= dt;
        if (b.t <= 0) { b.active = true; b.pop = 0.35; }
      }
      const pop = b.pop > 0 ? (b.pop -= dt, 1 - b.pop / 0.35) : 1;
      const sc = b.active ? pop : 0;
      this._e.set(time * 0.9 + b.ph, time * 1.3 + b.ph, 0.3);
      this._q.setFromEuler(this._e);
      this._p.copy(b.pos);
      this._p.y += Math.sin(time * 2.2 + b.ph) * 0.18;
      this._m.compose(this._p, this._q, this._s.setScalar(sc));
      this.boxMesh.setMatrixAt(i, this._m);
      this._e.set(-time * 1.5, -time * 2, 0);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p, this._q, this._s.setScalar(sc));
      this.coreMesh.setMatrixAt(i, this._m);
      this._c.setHSL((time * 0.25 + i * 0.07) % 1, 0.95, 0.62);
      this.boxMesh.setColorAt(i, this._c);
      this.coreMesh.setColorAt(i, this._c);
      if (!b.active) continue;
      for (const k of karts) {
        const dx = k.pos.x - b.pos.x, dz = k.pos.z - b.pos.z, dy = k.pos.y + 0.8 - b.pos.y;
        if (dx * dx + dz * dz < 4.4 && Math.abs(dy) < 2.4) {
          b.active = false;
          b.t = 2.2;
          fx.burst(b.pos.x, b.pos.y, b.pos.z, ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'], 14, 9, 0.5, 0.6, 12);
          this.give(k);
          race.onBoxHit(k);
          break;
        }
      }
    }
    if (this.boxMesh) {
      this.boxMesh.instanceMatrix.needsUpdate = true;
      this.boxMesh.instanceColor.needsUpdate = true;
      this.coreMesh.instanceMatrix.needsUpdate = true;
      this.coreMesh.instanceColor.needsUpdate = true;
    }

    // Gems
    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i];
      if (!g.active) {
        g.t -= dt;
        if (g.t <= 0) g.active = true;
      }
      this._q.setFromAxisAngle(this._p.set(0, 1, 0), time * 2.5 + i * 0.5);
      this._p.copy(g.pos);
      this._p.y += Math.sin(time * 3 + i) * 0.12;
      this._m.compose(this._p, this._q, this._s.setScalar(g.active ? 1 : 0));
      this.gemMesh.setMatrixAt(i, this._m);
      if (!g.active) continue;
      for (const k of karts) {
        const dx = k.pos.x - g.pos.x, dz = k.pos.z - g.pos.z, dy = k.pos.y + 0.7 - g.pos.y;
        if (dx * dx + dz * dz < 3.2 && Math.abs(dy) < 2) {
          g.active = false;
          g.t = 12;
          if (k.gems < 10) k.gems++;
          fx.burst(g.pos.x, g.pos.y, g.pos.z, ['#46f0ff', '#ffffff'], 8, 5, 0.4, 0.45, 6);
          race.onGem(k);
          break;
        }
      }
    }
    if (this.gemMesh) this.gemMesh.instanceMatrix.needsUpdate = true;

    // Hazards
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      if (h.grace > 0) h.grace -= dt;
      if (h.life <= 0) { this.removeHazard(h); continue; }
      for (const k of karts) {
        if (h.grace > 0 && k === h.owner) continue;
        const dx = k.pos.x - h.pos.x, dz = k.pos.z - h.pos.z;
        if (dx * dx + dz * dz < 3.6 && Math.abs(k.pos.y - h.pos.y) < 2) {
          k.hit('spin');
          fx.burst(h.pos.x, h.pos.y + 0.5, h.pos.z, ['#ffb21f', '#ffd76b'], 12, 6, 0.6, 0.6, 14, false);
          race.onHazardHit(k, h);
          this.removeHazard(h);
          break;
        }
      }
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.grace > 0) p.grace -= dt;
      if (p.life <= 0 || p.bounces > 7) {
        fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffffff', '#ffd23f'], 8, 5, 0.4, 0.4, 8);
        this.removeProjectile(p);
        continue;
      }
      if (p.type === 'ball') this._updBall(p, dt, time);
      else this._updBee(p, dt, time);

      // Hit karts
      let removed = false;
      for (const k of karts) {
        if (p.grace > 0 && k === p.owner) continue;
        const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 3.2 && Math.abs(k.pos.y + 0.6 - p.pos.y) < 2) {
          k.hit('spin');
          fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffffff', '#ffd23f', '#ff6b35'], 16, 9, 0.6, 0.5, 10);
          race.onProjectileHit(k, p);
          this.removeProjectile(p);
          removed = true;
          break;
        }
      }
      if (removed) continue;
      // Hit hazards
      for (const h of this.hazards) {
        const dx = h.pos.x - p.pos.x, dz = h.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 3) {
          fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffb21f', '#ffffff'], 12, 7, 0.5, 0.5, 10);
          this.removeHazard(h);
          this.removeProjectile(p);
          removed = true;
          break;
        }
      }
    }
  }

  _updBall(p, dt, time) {
    const tr = this.track;
    p.pos.x += p.vx * dt;
    p.pos.z += p.vz * dt;
    const trk = tr.project(p.pos.x, p.pos.z, p.seg, p.trk);
    p.seg = trk.idx;
    const lim = tr.wallD - 0.7;
    if (Math.abs(trk.d) > lim) {
      const sg = Math.sign(trk.d);
      p.pos.x -= trk.rx * sg * (Math.abs(trk.d) - lim);
      p.pos.z -= trk.rz * sg * (Math.abs(trk.d) - lim);
      const vn = (p.vx * trk.rx + p.vz * trk.rz) * sg;
      if (vn > 0) {
        p.vx -= 2 * vn * trk.rx * sg;
        p.vz -= 2 * vn * trk.rz * sg;
        p.bounces++;
        this.race.onBallBounce(p);
      }
    }
    p.pos.y = tr.heightAtFrame(trk, trk.d) + 0.62 + Math.abs(Math.sin(time * 9)) * 0.25;
    p.mesh.rotation.x += dt * 14;
    p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
  }

  _updBee(p, dt, time) {
    const tr = this.track;
    const t = p.target;
    const speed = 56;
    let tx, ty, tz;
    if (t && !t.finished && t.total - p.prog > 14) {
      p.prog += speed * dt;
      p.d += (t.trk.d - p.d) * Math.min(1, dt * 2);
      tr.frame(p.prog, this._fr);
      tx = this._fr.x + this._fr.rx * p.d;
      tz = this._fr.z + this._fr.rz * p.d;
      ty = tr.heightAtFrame(this._fr, p.d) + 1.6;
      p.pos.set(tx, ty, tz);
    } else if (t && !t.finished) {
      // Final dive straight at the target.
      const dx = t.pos.x - p.pos.x, dy = t.pos.y + 0.8 - p.pos.y, dz = t.pos.z - p.pos.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = Math.max(speed, t.speed + 12);
      p.pos.x += (dx / l) * sp * dt;
      p.pos.y += (dy / l) * sp * dt;
      p.pos.z += (dz / l) * sp * dt;
      p.prog = t.total;
    } else {
      // No target: cruise along the racing line.
      p.prog += speed * dt;
      tr.frame(p.prog, this._fr);
      const lane = tr.racingLine[this._fr.i];
      p.d += (lane - p.d) * Math.min(1, dt * 2);
      p.pos.set(this._fr.x + this._fr.rx * p.d, tr.heightAtFrame(this._fr, p.d) + 1.4, this._fr.z + this._fr.rz * p.d);
    }
    // face direction of travel
    const lx = p.pos.x - (p.lx ?? p.pos.x), lz = p.pos.z - (p.lz ?? p.pos.z);
    if (lx * lx + lz * lz > 1e-6) p.mesh.rotation.y = Math.atan2(lx, lz);
    p.lx = p.pos.x;
    p.lz = p.pos.z;
    p.mesh.position.y += Math.sin(time * 14) * 0.08;
    p.mesh.scale.set(1.25, 1.25 + Math.sin(time * 40) * 0.05, 1.25);
    if (Math.random() < 0.5) this.race.fx.glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0.5, 0, '#ffe45c', 0.35, 0.05, 0.35);
  }

  dispose() {
    this.race.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isInstancedMesh) {
        o.geometry.dispose();
        o.material.dispose();
        o.dispose();
      }
    });
    this.mat.dispose();
    if (this.qTex) this.qTex.dispose();
  }
}
