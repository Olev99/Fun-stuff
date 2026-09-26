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
  boomerang: { icon: '🪃', name: 'Boomerang' },
  magnet: { icon: '🧲', name: 'Gem Magnet' },
  warp: { icon: '🌀', name: 'Warp Swirl' },
  rocket: { icon: '🚀', name: 'Rocket Ride' },
};
export const ITEM_ICONS = Object.values(ITEMS).map((i) => i.icon);

// Odds depend on race position: leaders get defence, stragglers get catch-up.
const TABLES = [
  { honey: 30, ball: 26, bubble: 22, chili: 10, boomerang: 12 },
  { honey: 16, ball: 18, bee: 14, chili: 18, bubble: 8, chili3: 8, boomerang: 12, magnet: 6 },
  { chili: 12, chili3: 18, bee: 18, rainbow: 10, ball: 8, storm: 5, bubble: 6, magnet: 10, warp: 8, boomerang: 5 },
  { chili3: 24, rainbow: 20, rocket: 18, bee: 14, storm: 10, warp: 8, magnet: 6 },
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

// Moving obstacles: how they look and what they do.
const OBSTACLES = {
  hay: { r: 1.6, hit: 'bump', col: '#e8c65a', col2: '#c9a23a', y: 1.2 },
  crab: { r: 1.3, hit: 'bump', col: '#ff5a3c', col2: '#ffd0c0', y: 0.5 },
  tumbleweed: { r: 1.2, hit: 'bump', col: '#b58a5a', col2: '#8a5a36', y: 1.2, bounce: 1.2 },
  snowball: { r: 1.8, hit: 'spin', col: '#ffffff', col2: '#dbe8f7', y: 1.8 },
  penguin: { r: 1.1, hit: 'bump', col: '#1f2a44', col2: '#ffffff', y: 0 },
  gumball: { r: 1.5, hit: 'bump', col: '#ff5a8a', col2: '#36a9ff', y: 1.5, bounce: 2.5 },
  laser: { r: 1.2, hit: 'spin', col: '#ff3dc8', col2: '#39f5ff', y: 1.0, glow: true },
  fireball: { r: 1.5, hit: 'spin', col: '#ff6a1a', col2: '#ffd23f', y: 1.5, jump: true, glow: true },
  boulder: { r: 2.0, hit: 'spin', col: '#3b3134', col2: '#5a4d50', y: 2.0 },
  balloon: { r: 1.5, hit: 'bump', col: '#ff9ecb', col2: '#9ee7ff', y: 2.2, bounce: 0.8 },
};

let _geo = null;
function geos() {
  if (_geo) return _geo;
  const B = () => new GeoBuilder();
  const honey = B()
    .add(new THREE.SphereGeometry(1.6, 16, 6), '#ffb21f', [0, 0.02, 0], [0, 0, 0], [1, 0.1, 1])
    .add(new THREE.SphereGeometry(0.7, 10, 6), '#ffc93f', [0.9, 0.05, 0.5], [0, 0, 0], [1, 0.15, 1])
    .add(new THREE.CylinderGeometry(0.42, 0.36, 0.62, 12), '#d98a1a', [0, 0.36, 0])
    .add(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 12), '#fff3d6', [0, 0.7, 0])
    .add(new THREE.CylinderGeometry(0.43, 0.43, 0.2, 12), '#fff3d6', [0, 0.36, 0])
    .build();
  const ball = B()
    .add(new THREE.SphereGeometry(0.62, 16, 12), '#d8ff3a')
    .add(new THREE.TorusGeometry(0.62, 0.05, 6, 24), '#ffffff', [0, 0, 0], [0.5, 0.3, 0])
    .build();
  const bee = B()
    .add(new THREE.SphereGeometry(0.5, 14, 10), '#ffd21f', [0, 0, 0], [0, 0, 0], [0.9, 0.9, 1.25])
    .add(new THREE.TorusGeometry(0.44, 0.08, 6, 16), '#1d1537', [0, 0, 0.12])
    .add(new THREE.TorusGeometry(0.4, 0.08, 6, 16), '#1d1537', [0, 0, -0.22])
    .add(new THREE.ConeGeometry(0.12, 0.3, 6), '#1d1537', [0, 0, -0.72], [-Math.PI / 2, 0, 0])
    .add(new THREE.SphereGeometry(0.34, 10, 6), '#e9f7ff', [0.36, 0.42, -0.05], [0, 0, 0.5], [0.5, 0.15, 1])
    .add(new THREE.SphereGeometry(0.34, 10, 6), '#e9f7ff', [-0.36, 0.42, -0.05], [0, 0, -0.5], [0.5, 0.15, 1])
    .add(new THREE.SphereGeometry(0.09, 8, 6), '#1d1537', [0.17, 0.12, 0.55])
    .add(new THREE.SphereGeometry(0.09, 8, 6), '#1d1537', [-0.17, 0.12, 0.55])
    .build();
  const boomerang = B()
    .add(new THREE.BoxGeometry(1.6, 0.16, 0.45), '#ff8a2b', [0.6, 0, 0], [0, 0.5, 0])
    .add(new THREE.BoxGeometry(1.6, 0.16, 0.45), '#ffd23f', [-0.6, 0, 0], [0, -0.5, 0])
    .build();
  const crate = B()
    .add(new THREE.BoxGeometry(1.8, 1.8, 1.8), '#c9955d')
    .add(new THREE.BoxGeometry(1.86, 0.3, 1.86), '#8a5a36', [0, 0.75, 0])
    .add(new THREE.BoxGeometry(1.86, 0.3, 1.86), '#8a5a36', [0, -0.75, 0])
    .add(new THREE.BoxGeometry(0.3, 1.86, 1.86), '#8a5a36', [0, 0, 0], [0, 0, 0.78])
    .build();
  const obs = {};
  for (const [k, o] of Object.entries(OBSTACLES)) {
    const b = B();
    switch (k) {
      case 'hay':
        b.add(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 14), o.col, [0, 0, 0], [0, 0, Math.PI / 2]);
        b.add(new THREE.TorusGeometry(1.21, 0.08, 4, 16), '#8a5a36', [0.5, 0, 0], [0, Math.PI / 2, 0]);
        b.add(new THREE.TorusGeometry(1.21, 0.08, 4, 16), '#8a5a36', [-0.5, 0, 0], [0, Math.PI / 2, 0]);
        break;
      case 'crab':
        b.add(new THREE.SphereGeometry(0.8, 10, 8), o.col, [0, 0.4, 0], [0, 0, 0], [1.2, 0.6, 0.9]);
        for (const s of [-1, 1]) {
          b.add(new THREE.SphereGeometry(0.35, 8, 6), o.col, [s * 1.2, 0.6, 0.5]);
          b.add(new THREE.SphereGeometry(0.16, 6, 4), '#ffffff', [s * 0.3, 0.95, 0.5]);
          b.add(new THREE.SphereGeometry(0.08, 6, 4), '#1d1537', [s * 0.3, 0.98, 0.64]);
        }
        break;
      case 'tumbleweed':
        b.add(new THREE.IcosahedronGeometry(1.1, 1), o.col);
        b.add(new THREE.IcosahedronGeometry(0.8, 0), o.col2, [0, 0, 0], [0.5, 0.5, 0]);
        break;
      case 'snowball':
        b.add(new THREE.IcosahedronGeometry(1.7, 2), o.col);
        break;
      case 'penguin':
        b.add(new THREE.CapsuleGeometry(0.55, 0.7, 4, 10), o.col, [0, 0.95, 0]);
        b.add(new THREE.SphereGeometry(0.45, 10, 8), o.col2, [0, 0.9, 0.22], [0, 0, 0], [1, 1.2, 0.7]);
        b.add(new THREE.ConeGeometry(0.12, 0.3, 6), '#ff9a1f', [0, 1.4, 0.55], [Math.PI / 2, 0, 0]);
        break;
      case 'gumball':
        b.add(new THREE.SphereGeometry(1.4, 14, 10), '#ffffff');
        break;
      case 'laser':
        b.add(new THREE.BoxGeometry(0.4, 2.2, 0.4), '#ffffff', [0, 0, 0]);
        b.add(new THREE.BoxGeometry(1.2, 0.3, 1.2), '#1d1537', [0, -1.2, 0]);
        break;
      case 'fireball':
        b.add(new THREE.IcosahedronGeometry(1.3, 1), o.col);
        b.add(new THREE.IcosahedronGeometry(0.9, 1), o.col2, [0, 0.2, 0.3]);
        break;
      case 'boulder':
        b.add(new THREE.DodecahedronGeometry(1.9, 0), o.col);
        b.add(new THREE.DodecahedronGeometry(0.9, 0), '#ff6a1a', [0.9, 0.6, 1.1]);
        break;
      case 'balloon':
        b.add(new THREE.SphereGeometry(1.3, 12, 10), '#ffffff', [0, 0.4, 0], [0, 0, 0], [1, 1.2, 1]);
        b.add(new THREE.CylinderGeometry(0.03, 0.03, 2, 4), '#ffffff', [0, -1.6, 0]);
        break;
    }
    obs[k] = b.build();
  }
  _geo = { honey, ball, bee, boomerang, crate, obs };
  for (const g of [honey, ball, bee, boomerang, crate, ...Object.values(obs)]) g.userData.shared = true;
  return _geo;
}

export class ItemSystem {
  constructor(race, replica = false) {
    this.race = race;
    this.track = race.track;
    this.replica = replica; // multiplayer guest: state comes from the host
    this.group = new THREE.Group();
    race.scene.add(this.group);
    this.boxes = [];
    this.gems = [];
    this.hazards = [];
    this.projectiles = [];
    this.obstacles = [];
    this.crates = [];
    this.nextId = 1;
    this.mat = toonMat({ vertexColors: true });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    this.geo = geos();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._fr = {};
    const on = race.mode !== 'tt';
    this._buildBoxes(on);
    this._buildGems(on);
    this._buildObstacles();
    this._buildCrates();
  }

  _paths() {
    return [this.track, ...this.track.shortcuts];
  }

  _buildBoxes(enabled) {
    if (!enabled) return;
    const v = new THREE.Vector3();
    for (const p of this._paths()) {
      for (const s of p.itemRows) {
        const fr = p.frame(s, {});
        const k = fr.hw / 8.5;
        const offs = fr.hw > 7 ? [-6, -2, 2, 6] : [-3, 3];
        for (const d of offs) {
          p.pointAt(s, d * k, v);
          this.boxes.push({ pos: v.clone().setY(v.y + 1.4), active: true, t: 0, ph: Math.random() * 6 });
        }
      }
    }
    if (!this.boxes.length) return;
    this.qTex = TX.itemBoxTexture();
    const mat = new THREE.MeshBasicMaterial({ map: this.qTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), mat, this.boxes.length);
    this.boxMesh.renderOrder = 2;
    this.coreMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.boxes.length);
    for (let i = 0; i < this.boxes.length; i++) {
      this.boxMesh.setColorAt(i, this._c.set('#ffffff'));
      this.coreMesh.setColorAt(i, this._c.set('#ffffff'));
    }
    this.group.add(this.coreMesh, this.boxMesh);
  }

  _buildGems(enabled) {
    if (!enabled) return;
    const v = new THREE.Vector3();
    const lines = [...this.track.gemLines.map((g) => ({ ...g, path: this.track }))];
    for (const sc of this.track.shortcuts) for (const g of sc.gems) lines.push({ ...g, path: sc });
    for (const g of lines) {
      for (let n = 0; n < g.n; n++) {
        const s = g.s + n * 3.2;
        if (g.path.voids.length && g.path.isVoid(s)) continue;
        g.path.pointAt(s, g.d, v);
        this.gems.push({ pos: v.clone().setY(v.y + 0.9), active: true, t: 0 });
      }
    }
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(1, 1.35, 1);
    const mat = new THREE.MeshLambertMaterial({ color: '#46f0ff', emissive: new THREE.Color('#1c8cff'), emissiveIntensity: 0.55 });
    this.gemMesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.gems.length));
    if (!this.gems.length) this.gemMesh.count = 0;
    this.group.add(this.gemMesh);
  }

  _buildObstacles() {
    const list = [...this.track.obstacles.map((o) => ({ ...o, path: this.track }))];
    for (const sc of this.track.shortcuts) list.push(...sc.obstacles);
    for (const o of list) {
      const def = OBSTACLES[o.type];
      if (!def) continue;
      const mesh = new THREE.Mesh(this.geo.obs[o.type], def.glow ? this.glowMat : this.mat);
      if (o.type === 'gumball' || o.type === 'balloon') {
        mesh.material = mesh.material.clone();
        mesh.material.color = new THREE.Color(['#ff5a8a', '#36a9ff', '#ffd23f', '#19e3b1'][this.obstacles.length % 4]);
      }
      mesh.castShadow = !!this.race.quality.shadows;
      this.group.add(mesh);
      this.obstacles.push({
        ...o, def, mesh, pos: mesh.position, d: 0, ph: Math.random() * 6,
        s: o.s, path: o.path, amp: o.amp ?? 6, speed: o.speed ?? 1, hitCool: new Map(),
      });
    }
  }

  _buildCrates() {
    for (const sc of this.track.shortcuts) {
      if (!sc.def.crates) continue;
      const fr = {};
      const s = Math.min(sc.length - 4, (sc.entryEnd + 1) * sc.ds);
      sc.frame(s, fr);
      const h = sc.heightAtFrame(fr, 0);
      const group = [];
      for (const d of [-3.4, -1.1, 1.2, 3.3]) {
        for (let lvl = 0; lvl < (Math.abs(d) < 2 ? 2 : 1); lvl++) {
          const m = new THREE.Mesh(this.geo.crate, this.mat);
          m.position.set(fr.x + fr.rx * d, h + 0.9 + lvl * 1.8, fr.z + fr.rz * d);
          m.rotation.y = Math.atan2(fr.tx, fr.tz) + (Math.random() - 0.5) * 0.3;
          m.castShadow = !!this.race.quality.shadows;
          this.group.add(m);
          group.push(m);
        }
      }
      this.crates.push({ meshes: group, pos: new THREE.Vector3(fr.x, h, fr.z), r: 5.5, t: 0, broken: false });
    }
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

  settle(kart) {
    const it = kart.pendingItem;
    kart.pendingItem = null;
    if (!it) return;
    if (it === 'chili3') {
      kart.item = 'chili';
      kart.itemCount = 3;
    } else {
      kart.item = it;
      kart.itemCount = 1;
    }
  }

  // Apply an item's effect. Karts simulated elsewhere (multiplayer) only get
  // world-side effects here; their own effects run on their device.
  use(kart, forcedItem = null, remoteSpawn = null) {
    const it = forcedItem || kart.item;
    if (!it) return null;
    if (!forcedItem) {
      if (kart.rolling > 0 || kart.spinTime > 0) return null;
      kart.itemCount--;
      if (kart.itemCount <= 0) { kart.item = null; kart.itemCount = 0; }
    }
    if (this.race.net && this.race.net.isGuest && !remoteSpawn) {
      // Guests apply self effects locally and ask the host to spawn the rest.
      this._selfEffect(kart, it);
      this.race.net.useItem(kart, it);
      return it;
    }
    this._selfEffect(kart, it);
    const src = remoteSpawn || { x: kart.pos.x, z: kart.pos.z, yaw: kart.yaw, speed: Math.max(0, kart.fwdSpeed) };
    const fx = Math.sin(src.yaw), fz = Math.cos(src.yaw);
    switch (it) {
      case 'honey':
        this.addHoney(src.x - fx * 2.8, src.z - fz * 2.8, kart);
        break;
      case 'ball': {
        const sp = src.speed + 30;
        this.addProjectile('ball', kart, src.x + fx * 2.4, src.z + fz * 2.4, fx * sp, fz * sp);
        break;
      }
      case 'boomerang': {
        const sp = src.speed + 26;
        this.addProjectile('boomerang', kart, src.x + fx * 2.4, src.z + fz * 2.4, fx * sp, fz * sp);
        break;
      }
      case 'bee': {
        const target = this.race.karts.find((o) => o.place === kart.place - 1 && !o.finished) || null;
        this.addProjectile('bee', kart, src.x + fx * 2, src.z + fz * 2, 0, 0, target);
        break;
      }
      case 'storm':
        this.race.storm(kart);
        break;
    }
    return it;
  }

  _selfEffect(kart, it) {
    if (kart.remote) return;
    switch (it) {
      case 'chili': kart.startBoost(1.35, 9); break;
      case 'bubble': kart.shield = 14; break;
      case 'rainbow': kart.starTime = 7.5; kart.startBoost(0.6, 6); break;
      case 'magnet': kart.magnetTime = 6; break;
      case 'rocket': kart.rocketTime = 4.2; kart.startBoost(0.4, 12); break;
      case 'warp': this.race.warp(kart); break;
    }
  }

  addHoney(x, z, owner, id) {
    const o = { pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), path: owner ? owner.path : this.track, seg: owner ? owner.seg : -1, trk: {} };
    this.track.resolve(o, 1.5, 0);
    const trk = o.trk;
    const mesh = new THREE.Mesh(this.geo.honey, this.mat);
    mesh.position.set(o.pos.x, trk.y + 0.02, o.pos.z);
    mesh.rotation.y = Math.random() * 6;
    this.group.add(mesh);
    const h = { id: id ?? this.nextId++, type: 'honey', mesh, pos: mesh.position, s: this.track.mainS(o), d: trk.d, path: o.path, owner, grace: 0.5, life: 45 };
    this.hazards.push(h);
    return h;
  }

  addProjectile(type, owner, x, z, vx, vz, target = null, id) {
    const mesh = new THREE.Mesh(type === 'ball' ? this.geo.ball : type === 'bee' ? this.geo.bee : this.geo.boomerang, this.mat);
    const p = {
      id: id ?? this.nextId++, type, owner, mesh, pos: mesh.position, vel: new THREE.Vector3(vx, 0, vz),
      path: owner ? owner.path : this.track, seg: owner ? owner.seg : -1, trk: {},
      life: type === 'ball' ? 7 : type === 'boomerang' ? 4.5 : 12, grace: 0.35, bounces: 0, target, age: 0,
      prog: owner ? owner.total + 2 : 0, d: owner ? owner.trk.d : 0, hitSet: new Set(),
    };
    mesh.position.set(x, 0, z);
    this.track.resolve(p, 0.7, 1);
    mesh.position.y = p.trk.y + 0.7;
    this.group.add(mesh);
    this.projectiles.push(p);
    return p;
  }

  removeHazard(h) {
    this.group.remove(h.mesh);
    const i = this.hazards.indexOf(h);
    if (i >= 0) this.hazards.splice(i, 1);
  }

  removeProjectile(p) {
    this.group.remove(p.mesh);
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
  }

  // Can kart k be hit by world objects on this device?
  _local(k) {
    return !k.remote;
  }

  update(dt, time) {
    const race = this.race;
    const karts = race.karts;
    const fx = race.fx;
    const authority = !this.replica;

    // Item boxes
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.active && authority) {
        b.t -= dt;
        if (b.t <= 0) { b.active = true; b.pop = 0.35; }
      }
      const pop = b.pop > 0 ? ((b.pop -= dt), 1 - b.pop / 0.35) : 1;
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
        if (!authority && !k.isPlayer) continue;
        if (authority && k.remote) {
          // remote humans claim boxes themselves
          continue;
        }
        const dx = k.pos.x - b.pos.x, dz = k.pos.z - b.pos.z, dy = k.pos.y + 0.8 - b.pos.y;
        if (dx * dx + dz * dz < 4.4 && Math.abs(dy) < 2.4) {
          this._popBox(i);
          if (authority) this.give(k);
          else race.net.claimBox(i);
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
      if (!g.active && authority) {
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
        if (k.remote || (!authority && !k.isPlayer)) continue;
        const dx = k.pos.x - g.pos.x, dz = k.pos.z - g.pos.z, dy = k.pos.y + 0.7 - g.pos.y;
        const R = k.magnetTime > 0 ? 110 : 3.2;
        if (dx * dx + dz * dz < R && Math.abs(dy) < (k.magnetTime > 0 ? 5 : 2)) {
          this._popGem(i);
          if (k.gems < 10) k.gems++;
          if (!authority) race.net.claimGem(i);
          race.onGem(k);
          break;
        }
      }
    }
    if (this.gemMesh) this.gemMesh.instanceMatrix.needsUpdate = true;

    // Moving obstacles
    const fr = this._fr;
    for (const o of this.obstacles) {
      const p = o.path;
      p.frame(o.s, fr);
      const t = time * o.speed + o.ph;
      let d = Math.sin(t) * Math.min(o.amp, fr.hw - 1.5);
      let y = p.heightAtFrame(fr, d) + o.def.y;
      if (o.def.jump) {
        d = Math.sin(o.ph * 3) * (fr.hw - 3);
        y = p.heightAtFrame(fr, d) - 1 + Math.max(0, Math.sin(t * 1.6)) * 7;
      }
      if (o.def.bounce) y += Math.abs(Math.sin(t * 3)) * o.def.bounce;
      o.pos.set(fr.x + fr.rx * d, y, fr.z + fr.rz * d);
      o.d = d;
      o.mesh.rotation.y = Math.atan2(fr.tx, fr.tz) + (o.type === 'crab' ? Math.PI / 2 : 0);
      if (o.type === 'hay' || o.type === 'snowball' || o.type === 'boulder' || o.type === 'tumbleweed') o.mesh.rotation.x = -Math.cos(t) * t * 0.9;
      if (o.type === 'fireball') o.mesh.rotation.x = t * 3;
      if (o.def.glow && Math.random() < 0.5) fx.glow.emit(o.pos.x, o.pos.y, o.pos.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, o.def.col2, 0.8, 0.1, 0.4, -2, 1);
      for (const k of karts) {
        if (k.remote && authority) continue;
        if (!authority && !k.isPlayer) continue;
        const cool = o.hitCool.get(k) || 0;
        if (time < cool) continue;
        const dx = k.pos.x - o.pos.x, dz = k.pos.z - o.pos.z, dy = k.pos.y + 0.8 - o.pos.y;
        const R = o.def.r + 1.1;
        if (dx * dx + dz * dz < R * R && Math.abs(dy) < o.def.r + 1.2) {
          o.hitCool.set(k, time + 1.5);
          if (k.starTime > 0 || k.rocketTime > 0) continue;
          const l = Math.hypot(dx, dz) || 1;
          k.vel.x += (dx / l) * 10;
          k.vel.z += (dz / l) * 10;
          k.hit(o.def.hit);
          race.onObstacleHit(k, o);
        }
      }
    }

    // Breakable crates hiding shortcut entrances
    for (const c of this.crates) {
      if (c.broken) {
        c.t -= dt;
        if (c.t <= 0) { c.broken = false; for (const m of c.meshes) m.visible = true; }
        continue;
      }
      for (const k of karts) {
        const dx = k.pos.x - c.pos.x, dz = k.pos.z - c.pos.z;
        if (dx * dx + dz * dz < c.r * c.r && Math.abs(k.pos.y - c.pos.y) < 3) {
          c.broken = true;
          c.t = 14;
          for (const m of c.meshes) {
            m.visible = false;
            fx.burst(m.position.x, m.position.y, m.position.z, ['#c9955d', '#8a5a36', '#ffd9a0'], 8, 8, 0.6, 0.7, 14, false);
          }
          if (!k.remote) { k.vel.x *= 0.88; k.vel.z *= 0.88; }
          race.onCrates(k);
          break;
        }
      }
    }

    // Hazards
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (authority) {
        h.life -= dt;
        if (h.grace > 0) h.grace -= dt;
        if (h.life <= 0) { this.removeHazard(h); continue; }
      }
      for (const k of karts) {
        if (!this._local(k)) continue;
        if (!authority && !k.isPlayer) continue;
        if (h.grace > 0 && k === h.owner) continue;
        const dx = k.pos.x - h.pos.x, dz = k.pos.z - h.pos.z;
        if (dx * dx + dz * dz < 3.6 && Math.abs(k.pos.y - h.pos.y) < 2) {
          k.hit('spin');
          fx.burst(h.pos.x, h.pos.y + 0.5, h.pos.z, ['#ffb21f', '#ffd76b'], 12, 6, 0.6, 0.6, 14, false);
          race.onHazardHit(k, h);
          if (authority) this.removeHazard(h);
          else race.net.hitObject('h', h.id);
          break;
        }
      }
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!authority) {
        // replica: position comes from snapshots; just check hits on the local kart
        this._replicaHit(p);
        continue;
      }
      p.life -= dt;
      p.age += dt;
      if (p.grace > 0) p.grace -= dt;
      if (p.life <= 0 || p.bounces > 7) {
        fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffffff', '#ffd23f'], 8, 5, 0.4, 0.4, 8);
        this.removeProjectile(p);
        continue;
      }
      if (p.type === 'ball') this._updBall(p, dt, time);
      else if (p.type === 'boomerang') { if (this._updBoomerang(p, dt, time)) continue; }
      else this._updBee(p, dt, time);

      let removed = false;
      for (const k of karts) {
        if (p.grace > 0 && k === p.owner) continue;
        if (p.type === 'boomerang' && (k === p.owner || p.hitSet.has(k))) continue;
        const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 3.2 && Math.abs(k.pos.y + 0.6 - p.pos.y) < 2) {
          if (k.remote) continue; // remote players detect their own hits
          k.hit('spin');
          fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffffff', '#ffd23f', '#ff6b35'], 16, 9, 0.6, 0.5, 10);
          race.onProjectileHit(k, p);
          if (p.type === 'boomerang') { p.hitSet.add(k); continue; }
          this.removeProjectile(p);
          removed = true;
          break;
        }
      }
      if (removed || p.type === 'boomerang') continue;
      for (const h of this.hazards) {
        const dx = h.pos.x - p.pos.x, dz = h.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 3) {
          fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffb21f', '#ffffff'], 12, 7, 0.5, 0.5, 10);
          this.removeHazard(h);
          this.removeProjectile(p);
          break;
        }
      }
    }
  }

  _replicaHit(p) {
    const k = this.race.player;
    if (!k || (p.owner === k && p.age < 0.4)) return;
    if (p.type === 'boomerang' && p.owner === k) return;
    const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
    if (dx * dx + dz * dz < 3.2 && Math.abs(k.pos.y + 0.6 - p.pos.y) < 2) {
      if (p._hitLocal) return;
      p._hitLocal = true;
      k.hit('spin');
      this.race.fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffffff', '#ffd23f', '#ff6b35'], 16, 9, 0.6, 0.5, 10);
      this.race.net.hitObject('p', p.id);
    }
  }

  _popBox(i) {
    const b = this.boxes[i];
    if (!b.active) return;
    b.active = false;
    b.t = 2.2;
    this.race.fx.burst(b.pos.x, b.pos.y, b.pos.z, ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'], 14, 9, 0.5, 0.6, 12);
  }

  _popGem(i) {
    const g = this.gems[i];
    if (!g.active) return;
    g.active = false;
    g.t = 12;
    this.race.fx.burst(g.pos.x, g.pos.y, g.pos.z, ['#46f0ff', '#ffffff'], 8, 5, 0.4, 0.45, 6);
  }

  _updBall(p, dt, time) {
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    if (this.track.resolve(p, 0.7, 1) > 0) {
      p.bounces++;
      this.race.onBallBounce(p);
    }
    p.pos.y = p.trk.y + 0.62 + Math.abs(Math.sin(time * 9)) * 0.25;
    if (p.path.voids.length && p.path.isVoid(p.trk.s)) p.life = 0;
    p.mesh.rotation.x += dt * 14;
    p.mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
  }

  // Returns true if the boomerang was removed.
  _updBoomerang(p, dt, time) {
    const o = p.owner;
    if (p.age > 1.1 && o) {
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      const sp = Math.max(40, o.speed + 14);
      p.vel.x += ((dx / l) * sp - p.vel.x) * Math.min(1, dt * 4);
      p.vel.z += ((dz / l) * sp - p.vel.z) * Math.min(1, dt * 4);
      if (l < 2.5) {
        this.removeProjectile(p);
        return true;
      }
    }
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    this.track.project(p.pos.x, p.pos.z, -1, p.trk);
    p.pos.y = Math.max(p.pos.y - dt * 4, p.trk.y + 1.6);
    p.mesh.rotation.y += dt * 20;
    if (Math.random() < 0.5) this.race.fx.glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0.3, 0, '#ffb13d', 0.35, 0.05, 0.3);
    void time;
    return false;
  }

  _updBee(p, dt, time) {
    const tr = this.track;
    const t = p.target;
    const speed = 56;
    if (t && !t.finished && t.total - p.prog > 14) {
      p.prog += speed * dt;
      p.d += (t.trk.d - p.d) * Math.min(1, dt * 2);
      tr.frame(p.prog, this._fr);
      const dd = Math.max(-this._fr.hw, Math.min(this._fr.hw, p.d));
      p.pos.set(this._fr.x + this._fr.rx * dd, tr.heightAtFrame(this._fr, dd) + 1.6, this._fr.z + this._fr.rz * dd);
    } else if (t && !t.finished) {
      const dx = t.pos.x - p.pos.x, dy = t.pos.y + 0.8 - p.pos.y, dz = t.pos.z - p.pos.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = Math.max(speed, t.speed + 12);
      p.pos.x += (dx / l) * sp * dt;
      p.pos.y += (dy / l) * sp * dt;
      p.pos.z += (dz / l) * sp * dt;
      p.prog = t.total;
    } else {
      p.prog += speed * dt;
      tr.frame(p.prog, this._fr);
      const lane = tr.racingLine[this._fr.i];
      p.d += (lane - p.d) * Math.min(1, dt * 2);
      p.pos.set(this._fr.x + this._fr.rx * p.d, tr.heightAtFrame(this._fr, p.d) + 1.4, this._fr.z + this._fr.rz * p.d);
    }
    const lx = p.pos.x - (p.lx ?? p.pos.x), lz = p.pos.z - (p.lz ?? p.pos.z);
    if (lx * lx + lz * lz > 1e-6) p.mesh.rotation.y = Math.atan2(lx, lz);
    p.lx = p.pos.x;
    p.lz = p.pos.z;
    p.mesh.position.y += Math.sin(time * 14) * 0.08;
    p.mesh.scale.set(1.25, 1.25 + Math.sin(time * 40) * 0.05, 1.25);
    if (Math.random() < 0.5) this.race.fx.glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0.5, 0, '#ffe45c', 0.35, 0.05, 0.35);
  }

  // ---- multiplayer snapshot helpers ----
  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      b: this.boxes.map((b) => (b.active ? 1 : 0)).join(''),
      g: this.gems.map((g) => (g.active ? 1 : 0)).join(''),
      p: this.projectiles.map((p) => [p.id, p.type, r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.mesh.rotation.y), p.owner ? p.owner.index : -1]),
      h: this.hazards.map((h) => [h.id, r(h.pos.x), r(h.pos.y), r(h.pos.z), h.owner ? h.owner.index : -1]),
    };
  }

  applySnapshot(s, time) {
    const karts = this.race.karts;
    if (s.b) for (let i = 0; i < this.boxes.length; i++) {
      const on = s.b[i] === '1';
      const b = this.boxes[i];
      if (on && !b.active) { b.active = true; b.pop = 0.35; }
      else if (!on && b.active) this._popBox(i);
    }
    if (s.g) for (let i = 0; i < this.gems.length; i++) {
      const on = s.g[i] === '1';
      if (on) this.gems[i].active = true;
      else if (this.gems[i].active) this._popGem(i);
    }
    // projectiles
    const seen = new Set();
    for (const [id, type, x, y, z, ry, oi] of s.p || []) {
      seen.add(id);
      let p = this.projectiles.find((q) => q.id === id);
      if (!p) {
        const mesh = new THREE.Mesh(type === 'ball' ? this.geo.ball : type === 'bee' ? this.geo.bee : this.geo.boomerang, this.mat);
        this.group.add(mesh);
        p = { id, type, mesh, pos: mesh.position, owner: karts[oi] || null, age: 0, target: new THREE.Vector3(x, y, z) };
        mesh.position.set(x, y, z);
        this.projectiles.push(p);
      }
      p.target.set(x, y, z);
      p.ry = ry;
    }
    for (const p of [...this.projectiles]) if (!seen.has(p.id)) {
      this.race.fx.burst(p.pos.x, p.pos.y, p.pos.z, ['#ffffff', '#ffd23f'], 8, 5, 0.4, 0.4, 8);
      this.removeProjectile(p);
    }
    const hseen = new Set();
    for (const [id, x, y, z, oi] of s.h || []) {
      hseen.add(id);
      if (!this.hazards.find((h) => h.id === id)) {
        const mesh = new THREE.Mesh(this.geo.honey, this.mat);
        mesh.position.set(x, y, z);
        this.group.add(mesh);
        this.hazards.push({ id, type: 'honey', mesh, pos: mesh.position, s: 0, d: 0, path: this.track, owner: karts[oi] || null, grace: 0.6, life: 99 });
      }
    }
    for (const h of [...this.hazards]) if (!hseen.has(h.id)) this.removeHazard(h);
    void time;
  }

  // Smoothly move replicated projectiles toward their latest snapshot position.
  tickReplica(dt) {
    for (const p of this.projectiles) {
      if (!p.target) continue;
      p.age += dt;
      p.pos.lerp(p.target, 1 - Math.exp(-14 * dt));
      if (p.ry !== undefined) p.mesh.rotation.y = p.ry;
    }
    for (const h of this.hazards) if (h.grace > 0) h.grace -= dt;
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
    this.glowMat.dispose();
    for (const o of this.obstacles) if (o.mesh.material !== this.mat && o.mesh.material !== this.glowMat) o.mesh.material.dispose();
    if (this.qTex) this.qTex.dispose();
  }
}
