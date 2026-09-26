import * as THREE from 'three';
import { GeoBuilder, pbrMat, stdMat } from './util.js';
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
  bomb: { icon: '💣', name: 'Gum Bomb' },
  oil: { icon: '🛢️', name: 'Oil Slick' },
  horn: { icon: '📯', name: 'Honk Blast' },
  firework: { icon: '🎆', name: 'Firework' },
  twister: { icon: '🌪️', name: 'Twister' },
  ghost: { icon: '👻', name: 'Boo Mask' },
};
export const ITEM_ICONS = Object.values(ITEMS).map((i) => i.icon);

// Which way each item goes when you just tap: +1 ahead, -1 behind. These are
// the ones you can aim (swipe the ITEM button, or hold BRAKE to throw back).
export const AIM_DEFAULT = { honey: -1, oil: -1, ball: 1, boomerang: 1, bomb: 1, firework: 1 };

// Odds depend on race position: leaders get defence, stragglers get catch-up.
const TABLES = [
  { honey: 24, ball: 20, bubble: 18, chili: 8, boomerang: 10, oil: 12, horn: 8 },
  { honey: 12, ball: 14, bee: 10, chili: 14, bubble: 6, chili3: 6, boomerang: 10, magnet: 5, oil: 8, bomb: 8, firework: 7, horn: 4 },
  { chili: 10, chili3: 14, bee: 14, rainbow: 8, ball: 6, storm: 4, bubble: 4, magnet: 8, warp: 6, boomerang: 4, bomb: 8, firework: 6, twister: 6, ghost: 6 },
  { chili3: 20, rainbow: 16, rocket: 16, bee: 12, storm: 8, warp: 8, magnet: 4, twister: 8, ghost: 8 },
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
  ghost: { r: 1.4, hit: 'bump', col: '#f2f0ff', col2: '#9dff8a', y: 1.6, bounce: 0.6 },
  barrel: { r: 1.3, hit: 'spin', col: '#3a6ab0', col2: '#ffcf2a', y: 1.2 },
  rover: { r: 1.6, hit: 'bump', col: '#e8ecf4', col2: '#6fd8ff', y: 0.2 },
};

let _geo = null;
function geos() {
  if (_geo) return _geo;
  const B = (m = null) => new GeoBuilder(m);
  const honey = B('gloss')
    .add(new THREE.SphereGeometry(1.6, 16, 6), '#ffb21f', [0, 0.02, 0], [0, 0, 0], [1, 0.1, 1])
    .add(new THREE.SphereGeometry(0.7, 10, 6), '#ffc93f', [0.9, 0.05, 0.5], [0, 0, 0], [1, 0.15, 1])
    .add(new THREE.CylinderGeometry(0.42, 0.36, 0.62, 20), '#d98a1a', [0, 0.36, 0], [0, 0, 0], 1, 'plastic')
    .add(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 20), '#fff3d6', [0, 0.7, 0], [0, 0, 0], 1, 'fabric')
    .add(new THREE.CylinderGeometry(0.43, 0.43, 0.2, 20), '#fff3d6', [0, 0.36, 0], [0, 0, 0], 1, 'fabric')
    .build();
  const ball = B('plastic')
    .add(new THREE.SphereGeometry(0.62, 24, 16), '#d8ff3a')
    .add(new THREE.TorusGeometry(0.62, 0.05, 6, 24), '#ffffff', [0, 0, 0], [0.5, 0.3, 0])
    .build();
  const bee = B('fur')
    .add(new THREE.SphereGeometry(0.5, 20, 14), '#ffd21f', [0, 0, 0], [0, 0, 0], [0.9, 0.9, 1.25])
    .add(new THREE.TorusGeometry(0.44, 0.08, 6, 16), '#1d1537', [0, 0, 0.12])
    .add(new THREE.TorusGeometry(0.4, 0.08, 6, 16), '#1d1537', [0, 0, -0.22])
    .add(new THREE.ConeGeometry(0.12, 0.3, 6), '#1d1537', [0, 0, -0.72], [-Math.PI / 2, 0, 0])
    .add(new THREE.SphereGeometry(0.34, 12, 8), '#e9f7ff', [0.36, 0.42, -0.05], [0, 0, 0.5], [0.5, 0.15, 1], 'gloss')
    .add(new THREE.SphereGeometry(0.34, 12, 8), '#e9f7ff', [-0.36, 0.42, -0.05], [0, 0, -0.5], [0.5, 0.15, 1], 'gloss')
    .add(new THREE.SphereGeometry(0.09, 10, 8), '#1d1537', [0.17, 0.12, 0.55], [0, 0, 0], 1, 'eye')
    .add(new THREE.SphereGeometry(0.09, 10, 8), '#1d1537', [-0.17, 0.12, 0.55], [0, 0, 0], 1, 'eye')
    .build();
  const boomerang = B('paint')
    .add(new THREE.BoxGeometry(1.6, 0.16, 0.45), '#ff8a2b', [0.6, 0, 0], [0, 0.5, 0])
    .add(new THREE.BoxGeometry(1.6, 0.16, 0.45), '#ffd23f', [-0.6, 0, 0], [0, -0.5, 0])
    .build();
  const bomb = B('candy')
    .add(new THREE.SphereGeometry(0.62, 20, 14), '#ff5a9a')
    .add(new THREE.TorusGeometry(0.62, 0.07, 6, 24), '#ffd6ea', [0, 0, 0], [Math.PI / 2, 0, 0], 1, 'plastic')
    .add(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 10), '#3a3448', [0, 0.66, 0], [0, 0, 0], 1, 'metal')
    .add(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5), '#c9b28a', [0.06, 0.9, 0], [0, 0, -0.35], 1, 'fabric')
    .add(new THREE.SphereGeometry(0.1, 8, 6), '#ffd23f', [0.14, 1.07, 0], [0, 0, 0], 1, 'glowHot')
    .build();
  const firework = B('paint')
    .add(new THREE.CylinderGeometry(0.22, 0.22, 1.3, 12), '#ff3d6a', [0, 0, 0], [Math.PI / 2, 0, 0])
    .add(new THREE.CylinderGeometry(0.23, 0.23, 0.18, 12), '#ffffff', [0, 0, 0.25], [Math.PI / 2, 0, 0])
    .add(new THREE.CylinderGeometry(0.23, 0.23, 0.18, 12), '#ffd23f', [0, 0, -0.25], [Math.PI / 2, 0, 0])
    .add(new THREE.ConeGeometry(0.26, 0.5, 12), '#36a9ff', [0, 0, 0.9], [Math.PI / 2, 0, 0])
    .add(new THREE.BoxGeometry(0.05, 0.5, 0.35), '#ffd23f', [0, 0.2, -0.55])
    .add(new THREE.BoxGeometry(0.5, 0.05, 0.35), '#ffd23f', [0, 0, -0.55])
    .add(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10), '#ffb13d', [0, 0, -0.7], [Math.PI / 2, 0, 0], 1, 'glowHot')
    .build();
  // A swirl of rings that widens towards the top; drawn see-through.
  const tw = B([1, 0, 0.25]);
  for (let k = 0; k < 9; k++) {
    const r = 0.5 + k * 0.28;
    tw.add(new THREE.TorusGeometry(r, 0.12 + k * 0.02, 5, 18), k % 2 ? '#e8ecf4' : '#b8c0d0', [Math.sin(k * 1.3) * 0.25, 0.3 + k * 0.55, Math.cos(k * 1.3) * 0.25], [Math.PI / 2 + Math.sin(k) * 0.2, 0, 0]);
  }
  const twister = tw.build();
  const oilGeo = new THREE.CircleGeometry(1, 28);
  const op = oilGeo.attributes.position;
  for (let i = 1; i < op.count; i++) {
    const a = Math.atan2(op.getY(i), op.getX(i));
    const k = 1 + Math.sin(a * 3) * 0.12 + Math.sin(a * 7 + 1) * 0.06;
    op.setXY(i, op.getX(i) * k, op.getY(i) * k);
  }
  oilGeo.rotateX(-Math.PI / 2);
  const oil = oilGeo;
  const crate = B('wood')
    .add(new THREE.BoxGeometry(1.8, 1.8, 1.8), '#c9955d')
    .add(new THREE.BoxGeometry(1.86, 0.3, 1.86), '#8a5a36', [0, 0.75, 0])
    .add(new THREE.BoxGeometry(1.86, 0.3, 1.86), '#8a5a36', [0, -0.75, 0])
    .add(new THREE.BoxGeometry(0.3, 1.86, 1.86), '#8a5a36', [0, 0, 0], [0, 0, 0.78])
    .build();
  const obs = {};
  for (const [k, o] of Object.entries(OBSTACLES)) {
    const b = B({ hay: 'fabric', crab: 'gloss', tumbleweed: 'wood', snowball: 'snow', penguin: 'plastic', gumball: 'candy', laser: 'metal', boulder: 'stone', balloon: [0.25, 0, 0] }[k] || null);
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
        b.add(new THREE.SphereGeometry(1.4, 24, 16), '#ffffff');
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
        b.add(new THREE.DodecahedronGeometry(0.9, 0), '#ff6a1a', [0.9, 0.6, 1.1], [0, 0, 0], 1, 'glowHot');
        break;
      case 'ghost':
        b.add(new THREE.SphereGeometry(1, 16, 12), o.col, [0, 0.4, 0], [0, 0, 0], 1, [0.6, 0, 0.3]);
        b.add(new THREE.ConeGeometry(1, 1.8, 16, 1, true), o.col, [0, -0.6, 0], [Math.PI, 0, 0], 1, [0.6, 0, 0.3]);
        for (const x of [-0.35, 0.35]) b.add(new THREE.SphereGeometry(0.16, 8, 6), o.col2, [x, 0.55, 0.88], [0, 0, 0], 1, 'glowHot');
        break;
      case 'barrel':
        b.add(new THREE.CylinderGeometry(1, 1, 2, 16), o.col, [0, 0, 0], [0, 0, Math.PI / 2], 1, 'paint');
        for (const x of [-0.6, 0.6]) b.add(new THREE.TorusGeometry(1.01, 0.07, 5, 18), '#2a2632', [x, 0, 0], [0, Math.PI / 2, 0], 1, 'metal');
        b.add(new THREE.BoxGeometry(0.1, 0.6, 0.9), o.col2, [1.01, 0, 0], [0, 0, 0], 1, 'paint');
        break;
      case 'rover':
        b.add(new THREE.BoxGeometry(2, 0.8, 2.6), o.col, [0, 1, 0], [0, 0, 0], 1, 'paint');
        b.add(new THREE.BoxGeometry(1.6, 0.1, 1.2), '#2a3a6a', [0, 1.46, -0.4], [0, 0, 0], 1, [0.15, 0.6, 0]);
        for (const x of [-1.1, 1.1]) for (const z of [-0.9, 0.9]) b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), '#3a3448', [x, 0.45, z], [0, 0, Math.PI / 2], 1, 'rubber');
        b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), '#c8ccd4', [0.6, 2.1, 0.8], [0, 0, 0], 1, 'metal');
        b.add(new THREE.SphereGeometry(0.14, 8, 6), o.col2, [0.6, 2.85, 0.8], [0, 0, 0], 1, 'glowHot');
        break;
      case 'balloon':
        b.add(new THREE.SphereGeometry(1.3, 24, 16), '#ffffff', [0, 0.4, 0], [0, 0, 0], [1, 1.2, 1]);
        b.add(new THREE.CylinderGeometry(0.03, 0.03, 2, 4), '#ffffff', [0, -1.6, 0]);
        break;
    }
    obs[k] = b.build();
  }
  _geo = { honey, ball, bee, boomerang, crate, obs, bomb, firework, twister, oil };
  for (const g of [honey, ball, bee, boomerang, crate, bomb, firework, twister, oil, ...Object.values(obs)]) g.userData.shared = true;
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
    this.mat = pbrMat();
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, color: new THREE.Color(2.6, 2.6, 2.6) });
    this.twisterMat = pbrMat({ transparent: true, opacity: 0.55, depthWrite: false });
    this.oilMat = stdMat({ color: '#140e1c', roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.93, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3, emissive: new THREE.Color('#2a1850'), emissiveIntensity: 0.4 });
    this.effects = []; // short-lived visuals (shockwave rings)
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
    const mat = new THREE.MeshBasicMaterial({ map: this.qTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.35, 1.35, 1.35) });
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), mat, this.boxes.length);
    this.boxMesh.renderOrder = 2;
    this.coreMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) }), this.boxes.length);
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
    const mat = stdMat({ color: '#46f0ff', roughness: 0.08, metalness: 0.1, emissive: new THREE.Color('#1c8cff'), emissiveIntensity: 1.5 });
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
        // (cloning would drop pbrMat's shader hook, so make a fresh one)
        mesh.material = pbrMat({ color: ['#ff5a8a', '#36a9ff', '#ffd23f', '#19e3b1'][this.obstacles.length % 4] });
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
  // aim: +1 throw ahead, -1 behind, 0 = the item's usual direction.
  use(kart, forcedItem = null, remoteSpawn = null, aim = 0) {
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
      this.race.net.useItem(kart, it, aim);
      return it;
    }
    this._selfEffect(kart, it);
    const src = remoteSpawn || { x: kart.pos.x, z: kart.pos.z, yaw: kart.yaw, speed: Math.max(0, kart.fwdSpeed) };
    const dir = AIM_DEFAULT[it] ? (aim || AIM_DEFAULT[it]) : 1;
    const fx = Math.sin(src.yaw), fz = Math.cos(src.yaw);
    switch (it) {
      case 'honey':
      case 'oil':
        if (dir < 0) this.addHazard(it, src.x - fx * 2.8, src.z - fz * 2.8, kart);
        else this.addProjectile('lob', kart, src.x + fx * 2.4, src.z + fz * 2.4, fx * (src.speed + 16), fz * (src.speed + 16), null, undefined, { payload: it, vy: 8 });
        break;
      case 'ball': {
        const sp = dir > 0 ? src.speed + 30 : -24;
        this.addProjectile('ball', kart, src.x + fx * 2.4 * dir, src.z + fz * 2.4 * dir, fx * sp, fz * sp);
        break;
      }
      case 'boomerang': {
        const sp = dir > 0 ? src.speed + 26 : -30;
        this.addProjectile('boomerang', kart, src.x + fx * 2.4 * dir, src.z + fz * 2.4 * dir, fx * sp, fz * sp);
        break;
      }
      case 'bomb': {
        const sp = dir > 0 ? src.speed + 18 : Math.max(0, src.speed - 12);
        this.addProjectile('bomb', kart, src.x + fx * 2.4 * dir, src.z + fz * 2.4 * dir, fx * sp, fz * sp, null, undefined, { vy: dir > 0 ? 9 : 3 });
        break;
      }
      case 'firework': {
        const sp = dir > 0 ? src.speed + 52 : -40;
        this.addProjectile('firework', kart, src.x + fx * 2.6 * dir, src.z + fz * 2.6 * dir, fx * sp, fz * sp);
        break;
      }
      case 'twister':
        this.addProjectile('twister', kart, src.x + fx * 4, src.z + fz * 4, 0, 0);
        break;
      case 'horn':
        this.blast(src.x, kart.pos.y, src.z, 9.5, 'bump', kart, true);
        break;
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
      case 'ghost': kart.ghostTime = 5; kart.startBoost(0.4, 4); break;
    }
  }

  // Boo Mask wears off: a surprise item appears.
  surprise(kart) {
    if (kart.item || kart.rolling > 0) return;
    if (this.replica) { if (kart.isPlayer) this.race.net.claimBox(-1); return; }
    this.give(kart, weighted(TABLES[2]));
  }

  // Explosion or shockwave. Hits the karts this device simulates and tells
  // the other phones (a guest's own kart is checked on that phone). Clears
  // traps and shots inside the radius.
  blast(x, y, z, r, kind, owner, sparesOwner = false, relay = true) {
    const race = this.race;
    const fx = race.fx;
    if (kind === 'bump') {
      this._ring(x, y + 0.6, z, r, '#ffe7a8');
      fx.burst(x, y + 1, z, ['#ffffff', '#ffe7a8', '#ffd23f'], 26, 14, 0.5, 0.5, 2);
    } else {
      this._ring(x, y + 0.8, z, r, '#ff9a4a');
      fx.burst(x, y + 1, z, ['#ff5a9a', '#ffd23f', '#ffffff', '#ff6b35'], 60, 18, 0.9, 0.8, 6);
      fx.burst(x, y + 1, z, ['#5a4a50', '#8a7a80'], 18, 6, 1.6, 1.4, -1, false);
    }
    for (const k of race.karts) {
      if (k.remote || (sparesOwner && k === owner) || k.ghostTime > 0) continue;
      if (this.replica && !k.isPlayer) continue;
      const dx = k.pos.x - x, dz = k.pos.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || Math.abs(k.pos.y - y) > r) continue;
      const l = Math.sqrt(d2) || 1;
      const push = kind === 'bump' ? 16 : 10;
      if (k.starTime <= 0 && k.rocketTime <= 0) {
        k.vel.x += (dx / l) * push;
        k.vel.z += (dz / l) * push;
      }
      if (k.hit(kind) && kind === 'spin') k.vy = Math.max(k.vy, 9);
      race.onBlastHit(k, kind);
    }
    if (!this.replica) {
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        if ((h.pos.x - x) ** 2 + (h.pos.z - z) ** 2 < r * r) this.removeHazard(h);
      }
      if (kind === 'bump') {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
          const p = this.projectiles[i];
          if (p.owner !== owner && (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < r * r) this.removeProjectile(p);
        }
      }
    }
    race.onBlast(x, y, z, r, kind);
    if (relay && race.net && race.net.isHost) race.net.sendBlast(x, y, z, r, kind, owner, sparesOwner);
  }

  // Expanding ring that fades out.
  _ring(x, y, z, r, color) {
    const m = new THREE.Mesh(this._ringGeo || (this._ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 48)), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, depthWrite: false, fog: true }));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    this.group.add(m);
    this.effects.push({ mesh: m, t: 0, dur: 0.45, r });
  }

  addHazard(type, x, z, owner, id) {
    const o = { pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), path: owner ? owner.path : this.track, seg: owner ? owner.seg : -1, trk: {} };
    this.track.resolve(o, 1.5, 0);
    const trk = o.trk;
    const oil = type === 'oil';
    const mesh = new THREE.Mesh(oil ? this.geo.oil : this.geo.honey, oil ? this.oilMat : this.mat);
    mesh.position.set(o.pos.x, trk.y + (oil ? 0.04 : 0.02), o.pos.z);
    mesh.rotation.y = Math.random() * 6;
    if (oil) mesh.scale.setScalar(3.2);
    mesh.renderOrder = oil ? 1 : 0;
    this.group.add(mesh);
    const h = { id: id ?? this.nextId++, type, mesh, pos: mesh.position, s: this.track.mainS(o), d: trk.d, path: o.path, owner, grace: 0.5, life: oil ? 24 : 45, r: oil ? 3.2 : 1.6 };
    this.hazards.push(h);
    return h;
  }

  // Legacy name used by older code paths.
  addHoney(x, z, owner, id) {
    return this.addHazard('honey', x, z, owner, id);
  }

  _projMesh(type, payload) {
    const g = this.geo;
    if (type === 'twister') return new THREE.Mesh(g.twister, this.twisterMat);
    const geo = { ball: g.ball, bee: g.bee, boomerang: g.boomerang, bomb: g.bomb, firework: g.firework, lob: payload === 'oil' ? g.bomb : g.honey }[type] || g.ball;
    const m = new THREE.Mesh(geo, this.mat);
    if (type === 'lob' && payload === 'oil') m.scale.setScalar(0.8);
    return m;
  }

  addProjectile(type, owner, x, z, vx, vz, target = null, id, extra = {}) {
    const mesh = this._projMesh(type, extra.payload);
    const p = {
      id: id ?? this.nextId++, type, owner, mesh, pos: mesh.position, vel: new THREE.Vector3(vx, 0, vz),
      path: owner ? owner.path : this.track, seg: owner ? owner.seg : -1, trk: {},
      life: { ball: 7, boomerang: 4.5, bomb: 6, firework: 3, twister: 9, lob: 4 }[type] ?? 12, grace: 0.35, bounces: 0, target, age: 0,
      prog: owner ? owner.total + 4 : 0, d: owner ? owner.trk.d : 0, hitSet: new Set(),
      payload: extra.payload || null, vy: extra.vy || 0, landed: false, fuse: 1.1,
    };
    mesh.position.set(x, 0, z);
    this.track.resolve(p, 0.7, 1);
    mesh.position.y = p.trk.y + (type === 'twister' ? 0 : 0.7);
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
    this._updEffects(dt);

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
      if (o.type === 'hay' || o.type === 'snowball' || o.type === 'boulder' || o.type === 'tumbleweed' || o.type === 'barrel') o.mesh.rotation.x = -Math.cos(t) * t * 0.9;
      if (o.type === 'rover') o.mesh.rotation.y += Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (o.type === 'fireball') o.mesh.rotation.x = t * 3;
      if (o.def.glow && Math.random() < 0.5) fx.glow.emit(o.pos.x, o.pos.y, o.pos.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, o.def.col2, 0.8, 0.1, 0.4, -2, 1);
      for (const k of karts) {
        if (k.remote && authority) continue;
        if (!authority && !k.isPlayer) continue;
        const cool = o.hitCool.get(k) || 0;
        if (time < cool || k.ghostTime > 0) continue;
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
        if ((h.grace > 0 && k === h.owner) || k.ghostTime > 0) continue;
        const dx = k.pos.x - h.pos.x, dz = k.pos.z - h.pos.z;
        const R2 = h.type === 'oil' ? 8.5 : 3.6;
        if (dx * dx + dz * dz < R2 && Math.abs(k.pos.y - h.pos.y) < 2) {
          if (h.type === 'oil') {
            // Oil stays put and sends everyone who crosses it sliding.
            if (k.slip(1.5)) race.onSlip(k);
            continue;
          }
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
      else if (p.type === 'bee') this._updBee(p, dt, time);
      else {
        // Bombs, fireworks, twisters and tossed traps handle their own hits.
        this._updSpecial(p, dt, time);
        continue;
      }

      let removed = false;
      for (const k of karts) {
        if ((p.grace > 0 && k === p.owner) || k.ghostTime > 0) continue;
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
    if (!k || (p.owner === k && p.age < 0.4) || k.ghostTime > 0) return;
    if (p.type === 'boomerang' && p.owner === k) return;
    // Bombs and fireworks explode on the host (which tells us); tossed traps
    // turn into hazards there too.
    if (p.type === 'bomb' || p.type === 'firework' || p.type === 'lob') return;
    if (p.type === 'twister') {
      const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
      if (dx * dx + dz * dz < 7 && !p._hitLocal) {
        p._hitLocal = true;
        if (k.hit('spin')) k.vy = Math.max(k.vy, 11);
        this.race.onBlastHit(k, 'twister');
      }
      return;
    }
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

  // Arcing throws land on the road; fireworks fly straight; twisters roam
  // down the track. Any kart (even one simulated on another phone) sets off
  // bombs and fireworks; the blast is relayed to the others.
  _updSpecial(p, dt, time) {
    const race = this.race;
    const fx = race.fx;
    const karts = race.karts;
    const near = (r, skipOwner) => {
      for (const k of karts) {
        if ((skipOwner && k === p.owner) || k.ghostTime > 0) continue;
        const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
        if (dx * dx + dz * dz < r * r && Math.abs(k.pos.y + 0.6 - p.pos.y) < 2.4) return k;
      }
      return null;
    };
    if (p.type === 'bomb' || p.type === 'lob') {
      if (!p.landed) {
        p.pos.x += p.vel.x * dt;
        p.pos.z += p.vel.z * dt;
        this.track.resolve(p, 0.7, 0.6);
        p.vy -= 22 * dt;
        p.pos.y += p.vy * dt;
        const ground = p.trk.y + 0.62;
        p.mesh.rotation.x += dt * 8;
        if (p.path.voids.length && p.path.isVoid(p.trk.s)) { if (p.pos.y < ground - 8) p.life = 0; }
        else if (p.pos.y <= ground && p.vy < 0) {
          p.pos.y = ground;
          p.landed = true;
          p.vel.set(0, 0, 0);
          p.mesh.rotation.x = 0;
          if (p.type === 'lob') {
            this.addHazard(p.payload, p.pos.x, p.pos.z, p.owner);
            this.removeProjectile(p);
            return;
          }
        }
        if (p.type === 'bomb' && p.age > 0.25 && near(1.9, p.grace > 0)) return this._boom(p);
      } else {
        p.fuse -= dt;
        const blink = Math.floor(p.fuse * (p.fuse < 0.5 ? 16 : 7)) % 2 === 0;
        p.mesh.scale.setScalar(blink ? 1.12 : 1);
        if (Math.random() < 0.6) fx.glow.emit(p.pos.x + 0.14, p.pos.y + 1.1, p.pos.z, 0, 1.5, 0, '#ffd23f', 0.3, 0.05, 0.25);
        if (p.fuse <= 0 || near(2.2, false)) return this._boom(p);
      }
      if (p.life <= 0.05 && p.type === 'bomb') return this._boom(p);
      return;
    }
    if (p.type === 'firework') {
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      const wall = this.track.resolve(p, 0.6, 0);
      p.pos.y = p.trk.y + 1.0 + Math.sin(p.age * 30) * 0.05;
      p.mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      p.mesh.rotation.z += dt * 12;
      for (let n = 0; n < 2; n++) fx.glow.emit(p.pos.x, p.pos.y, p.pos.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, ['#ff3d6a', '#ffd23f', '#36a9ff', '#19e3b1'][Math.floor(Math.random() * 4)], 0.45, 0.05, 0.4);
      if (wall > 0 || p.life < 0.1 || near(1.9, p.grace > 0)) return this._boom(p, 4.2);
      return;
    }
    if (p.type === 'twister') {
      // Tears down the track ahead, weaving across the road.
      const tr = this.track;
      p.prog += 44 * dt;
      tr.frame(p.prog, this._fr);
      const hw = this._fr.hw - 2;
      const dd = Math.sin(p.age * 1.7 + p.id) * hw * 0.8;
      p.pos.set(this._fr.x + this._fr.rx * dd, tr.heightAtFrame(this._fr, dd), this._fr.z + this._fr.rz * dd);
      p.mesh.rotation.y += dt * 9;
      const sc = Math.min(1, p.age * 3) * (p.life < 0.6 ? p.life / 0.6 : 1);
      p.mesh.scale.set(sc, sc * (1 + Math.sin(time * 6) * 0.05), sc);
      if (Math.random() < 0.8) fx.soft.emit(p.pos.x + (Math.random() - 0.5) * 3, p.pos.y + 0.3, p.pos.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6, race.dust, 0.9, 1.8, 0.7, -1, 1, 0.5);
      for (const k of karts) {
        if (k === p.owner || k.remote || p.hitSet.has(k) || k.ghostTime > 0) continue;
        const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 7) {
          p.hitSet.add(k);
          if (k.hit('spin')) k.vy = Math.max(k.vy, 11);
          race.onBlastHit(k, 'twister');
        }
      }
    }
  }

  _boom(p, r = 7) {
    const owner = p.owner;
    this.removeProjectile(p);
    this.blast(p.pos.x, p.pos.y - 0.6, p.pos.z, r, 'spin', owner, false);
  }

  _updEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const f = e.t / e.dur;
      if (f >= 1) {
        this.group.remove(e.mesh);
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      e.mesh.scale.setScalar(0.5 + e.r * f);
      e.mesh.material.opacity = 1 - f;
    }
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
      p: this.projectiles.map((p) => [p.id, p.payload ? `lob-${p.payload}` : p.type, r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.mesh.rotation.y), p.owner ? p.owner.index : -1]),
      h: this.hazards.map((h) => [h.id, r(h.pos.x), r(h.pos.y), r(h.pos.z), h.owner ? h.owner.index : -1, h.type]),
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
        const lob = type.startsWith('lob-');
        const mesh = this._projMesh(lob ? 'lob' : type, lob ? type.slice(4) : null);
        this.group.add(mesh);
        p = { id, type: lob ? 'lob' : type, mesh, pos: mesh.position, owner: karts[oi] || null, age: 0, target: new THREE.Vector3(x, y, z) };
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
    for (const [id, x, y, z, oi, type = 'honey'] of s.h || []) {
      hseen.add(id);
      if (!this.hazards.find((h) => h.id === id)) {
        const oil = type === 'oil';
        const mesh = new THREE.Mesh(oil ? this.geo.oil : this.geo.honey, oil ? this.oilMat : this.mat);
        mesh.position.set(x, y, z);
        if (oil) mesh.scale.setScalar(3.2);
        this.group.add(mesh);
        this.hazards.push({ id, type, mesh, pos: mesh.position, s: 0, d: 0, path: this.track, owner: karts[oi] || null, grace: 0.6, life: 99, r: oil ? 3.2 : 1.6 });
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
    this.twisterMat.dispose();
    this.oilMat.dispose();
    for (const e of this.effects) e.mesh.material.dispose();
    if (this._ringGeo) this._ringGeo.dispose();
    for (const o of this.obstacles) if (o.mesh.material !== this.mat && o.mesh.material !== this.glowMat) o.mesh.material.dispose();
    if (this.qTex) this.qTex.dispose();
  }
}
