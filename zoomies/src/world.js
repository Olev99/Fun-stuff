import * as THREE from 'three';
import { GeoBuilder, rng, toonMat, clamp, disposeObject } from './util.js';
import * as TX from './textures.js';

export const THEMES = {
  meadow: {
    sky: ['#2c7be5', '#bfe6ff', '#e4f5ff'], sunGlow: '#fff2c4', stars: 0,
    fog: '#c5e5fb', fogNear: 150, fogFar: 700,
    sun: '#fff0d4', sunI: 2.6, sunDir: [-0.5, 0.9, 0.35],
    hemi: ['#d6ecff', '#5f8f3e', 1.35],
    road: 'asphalt', ground: 'grass', wall: 'redwhite', curb: ['#e8413c', '#ffffff'],
    groundTint: ['#ffffff', '#cfe6b0', '#f2ffd9'], beach: '#f1d79b', water: ['#1f8fd1', '#56d0f0'],
    mountains: ['#4f8f45', '#77a35a', '#a7b8a0', '#ffffff'], clouds: 24,
  },
  desert: {
    sky: ['#e7743f', '#ffd29a', '#ffe8c2'], sunGlow: '#fff0c0', stars: 0,
    fog: '#f7cf9c', fogNear: 150, fogFar: 720,
    sun: '#ffe2b8', sunI: 2.8, sunDir: [0.55, 0.7, -0.3],
    hemi: ['#ffe0b0', '#b0683a', 1.3],
    road: 'dirt', ground: 'sand', wall: 'sandstone', curb: ['#ff8a2b', '#fff1d0'],
    groundTint: ['#ffffff', '#f0c9a0', '#fff0dc'], beach: null, water: null,
    mountains: ['#b65a31', '#cf7340', '#e39457', '#f1b47a'], clouds: 8,
  },
  frost: {
    sky: ['#5a8fd6', '#d9ecff', '#f2f8ff'], sunGlow: '#ffffff', stars: 0,
    fog: '#dcebfa', fogNear: 120, fogFar: 600,
    sun: '#f4f8ff', sunI: 2.3, sunDir: [-0.35, 0.8, -0.5],
    hemi: ['#e6f0ff', '#8aa6c8', 1.45],
    road: 'ice', ground: 'snow', wall: 'snowbank', curb: ['#2f7bff', '#ffffff'],
    groundTint: ['#ffffff', '#dbe8f7', '#f7fbff'], beach: '#cfe3f6', water: ['#6fa7d8', '#bfe3ff'],
    mountains: ['#6d7f99', '#8d9fb8', '#c9d7e8', '#ffffff'], clouds: 18,
  },
  neon: {
    sky: ['#070419', '#3a1a6b', '#140a2e'], sunGlow: '#ff6ad5', stars: 1,
    fog: '#2a1450', fogNear: 120, fogFar: 640,
    sun: '#b9a6ff', sunI: 1.6, sunDir: [0.3, 0.8, 0.4],
    hemi: ['#8f7bff', '#2a1a55', 1.6],
    road: 'neon', ground: 'tiles', wall: 'neon', curb: ['#ff3dc8', '#39f5ff'],
    groundTint: ['#ffffff', '#b7a8ff', '#ffffff'], beach: null, water: null,
    mountains: null, clouds: 0,
  },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 glow; uniform vec3 sunDir; uniform float stars;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.75)) : mix(horizon, bottom, smoothstep(0.0, -0.15, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += glow * (pow(s, 600.0) * 2.0 + pow(s, 14.0) * 0.28);
  if (stars > 0.5 && h > 0.02) {
    vec3 cell = floor(d * 260.0);
    float n = hash(cell);
    float tw = step(0.9965, n);
    col += vec3(tw) * smoothstep(0.02, 0.3, h) * (0.6 + 0.4 * hash(cell + 3.1));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const WATER_VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */ `
uniform float time; uniform vec3 deep; uniform vec3 shallow;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz;
  float w = sin(p.x * 0.045 + time * 0.7) * sin(p.y * 0.05 - time * 0.55);
  float w2 = sin((p.x + p.y) * 0.11 + time * 1.3) * 0.5 + 0.5;
  vec3 col = mix(deep, shallow, 0.45 + 0.22 * w + 0.18 * w2);
  float g = fract(sin(dot(floor(p * 0.35), vec2(12.9898, 78.233))) * 43758.5453);
  float sparkle = step(0.985, g) * (0.5 + 0.5 * sin(time * 4.0 + g * 40.0));
  col += sparkle * 0.35;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// Builds the complete visual environment for a track.
export class World {
  constructor(track, quality) {
    this.track = track;
    this.theme = THEMES[track.def.theme] || THEMES.meadow;
    this.quality = quality;
    this.group = new THREE.Group();
    this.animated = [];
    this.textures = [];
    this.time = 0;
    this.r = rng(track.def.id.length * 977 + (track.reverse ? 5 : 0));
    this._build();
  }

  _tex(t) {
    this.textures.push(t);
    return t;
  }

  _build() {
    const th = this.theme;
    const tr = this.track;
    const g = this.group;

    // Lights
    this.hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]);
    g.add(this.hemi);
    this.sun = new THREE.DirectionalLight(th.sun, th.sunI);
    this.sunDir = new THREE.Vector3(...th.sunDir).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(80);
    const shadows = this.quality.shadows;
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(shadows, shadows);
      const c = this.sun.shadow.camera;
      c.left = -46; c.right = 46; c.top = 46; c.bottom = -46; c.near = 1; c.far = 220;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    g.add(this.sun);
    g.add(this.sun.target);

    // Sky dome
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        top: { value: new THREE.Color(th.sky[0]) },
        horizon: { value: new THREE.Color(th.sky[1]) },
        bottom: { value: new THREE.Color(th.sky[2]) },
        glow: { value: new THREE.Color(th.sunGlow) },
        sunDir: { value: this.sunDir.clone() },
        stars: { value: th.stars },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    g.add(this.sky);
    this.fog = new THREE.Fog(th.sky[1], th.fogNear, th.fogFar);

    this._buildGround();
    this._buildTrackSurface();
    this._buildStart();
    this._buildRampsAndPads();
    this._buildScenery();
    this._buildBackdrop();
  }

  _buildGround() {
    const th = this.theme;
    const tr = this.track;
    const R = tr.radius + 210;
    const rings = 22, segs = 90;
    const pos = [], col = [], uv = [], idx = [];
    const r = rng(42);
    const tints = th.groundTint.map((c) => new THREE.Color(c));
    const beach = th.beach ? new THREE.Color(th.beach) : null;
    const hasWater = !!th.water;
    const noise = [];
    for (let s = 0; s < segs; s++) noise.push(0.9 + r() * 0.2);
    for (let i = 0; i <= rings; i++) {
      const f = i / rings;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const n = noise[s % segs] * (0.94 + 0.06 * Math.sin(a * 5 + 1.3));
        const rad = hasWater ? R * f * (i === rings ? n : i === rings - 1 ? (n + 1) / 2 : 1) : R * 1.6 * f;
        const x = tr.center.x + Math.cos(a) * rad;
        const z = tr.center.z + Math.sin(a) * rad;
        let y = -0.25;
        if (hasWater && i >= rings - 1) y = i === rings ? -3 : -0.6;
        pos.push(x, y, z);
        uv.push(x / 14, z / 14);
        const c = tints[Math.floor(r() * tints.length)].clone();
        if (beach && i >= rings - 2) c.copy(beach);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let s = 0; s < segs; s++) {
        const a = i * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = this._tex(TX.groundTexture(th.ground));
    const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = !!this.quality.shadows;
    this.group.add(ground);

    if (hasWater) {
      const wm = new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          { time: { value: 0 }, deep: { value: new THREE.Color(th.water[0]) }, shallow: { value: new THREE.Color(th.water[1]) } },
        ]),
        fog: true,
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), wm);
      water.rotation.x = -Math.PI / 2;
      water.position.set(tr.center.x, -1.1, tr.center.z);
      this.group.add(water);
      this.waterMat = wm;
    }
  }

  _buildTrackSurface() {
    const th = this.theme;
    const tr = this.track;
    const shadows = !!this.quality.shadows;
    const roadTex = this._tex(TX.roadTexture(th.road, 3));
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    if (th.road === 'neon') {
      roadMat.emissiveMap = roadTex;
      roadMat.emissive = new THREE.Color('#ffffff');
      roadMat.emissiveIntensity = 0.55;
    }
    const road = new THREE.Mesh(tr.strip(-tr.halfRoad, tr.halfRoad, { vScale: 1 / 16, across: 2 }), roadMat);
    road.receiveShadow = shadows;
    this.group.add(road);

    const curbTex = this._tex(TX.curbTexture(th.curb[0], th.curb[1]));
    const curbMat = new THREE.MeshLambertMaterial({ map: curbTex });
    if (th.road === 'neon') {
      curbMat.emissiveMap = curbTex;
      curbMat.emissive = new THREE.Color('#ffffff');
      curbMat.emissiveIntensity = 0.8;
    }
    for (const side of [-1, 1]) {
      const a = side * tr.halfRoad, b = side * tr.edgeD;
      const geo = tr.strip(Math.min(a, b), Math.max(a, b), { vScale: 1 / 3, lift: 0.015 });
      const m = new THREE.Mesh(geo, curbMat);
      m.receiveShadow = shadows;
      this.group.add(m);
    }

    const shTex = this._tex(TX.groundTexture(th.ground, 11));
    const shMat = new THREE.MeshLambertMaterial({ map: shTex, color: th.road === 'neon' ? '#ffffff' : '#f4f4f4' });
    for (const side of [-1, 1]) {
      const a = side * tr.edgeD, b = side * tr.wallD;
      const geo = tr.strip(Math.min(a, b), Math.max(a, b), { vScale: 1 / 14, uRepeat: tr.shoulder / 14 });
      const m = new THREE.Mesh(geo, shMat);
      m.receiveShadow = shadows;
      this.group.add(m);
    }

    // Walls
    const wallTex = this._tex(TX.wallTexture(th.wall));
    const wallMat = toonMat({ map: wallTex });
    if (th.wall === 'neon') {
      wallMat.emissiveMap = wallTex;
      wallMat.emissive = new THREE.Color('#ffffff');
      wallMat.emissiveIntensity = 1.0;
    }
    const sideMat = toonMat({ color: this._wallSideColor() });
    const H = tr.wallH, T = 0.7;
    for (const side of [-1, 1]) {
      const inner = tr.ribbon((i, o) => {
        const d = side * tr.wallD, y = tr.yAt(i, d);
        o[0] = tr.px[i] + tr.rx[i] * d; o[1] = y - 0.3; o[2] = tr.pz[i] + tr.rz[i] * d;
        o[3] = o[0]; o[4] = y + H; o[5] = o[2];
      }, () => [-side * tr.rx[0], 0, -side * tr.rz[0]], 1 / 8);
      const m1 = new THREE.Mesh(inner, wallMat);
      m1.castShadow = false;
      m1.receiveShadow = shadows;
      this.group.add(m1);
      const top = tr.ribbon((i, o) => {
        const d0 = side * tr.wallD, d1 = side * (tr.wallD + T);
        const y = tr.yAt(i, d0) + H;
        o[0] = tr.px[i] + tr.rx[i] * d0; o[1] = y; o[2] = tr.pz[i] + tr.rz[i] * d0;
        o[3] = tr.px[i] + tr.rx[i] * d1; o[4] = y; o[5] = tr.pz[i] + tr.rz[i] * d1;
      }, () => [0, 1, 0], 1 / 8);
      this.group.add(new THREE.Mesh(top, sideMat));
      const outer = tr.ribbon((i, o) => {
        const d = side * (tr.wallD + T);
        const y = tr.yAt(i, side * tr.wallD) + H;
        o[0] = tr.px[i] + tr.rx[i] * d; o[1] = y; o[2] = tr.pz[i] + tr.rz[i] * d;
        o[3] = o[0]; o[4] = -3; o[5] = o[2];
      }, () => [side * tr.rx[0], 0, side * tr.rz[0]], 1 / 8);
      this.group.add(new THREE.Mesh(outer, sideMat));
    }
  }

  _wallSideColor() {
    return { redwhite: '#d9d4cc', sandstone: '#b8643a', snowbank: '#e3eefa', neon: '#1a1438' }[this.theme.wall] || '#cccccc';
  }

  _buildStart() {
    const tr = this.track;
    const checker = this._tex(TX.checkerTexture());
    checker.repeat.set(4, 1);
    const line = new THREE.Mesh(tr.patch(-1.5, 1.5, -tr.halfRoad, tr.halfRoad, { lift: 0.03, segs: 2 }),
      new THREE.MeshLambertMaterial({ map: checker }));
    line.receiveShadow = !!this.quality.shadows;
    // rotate UVs: checker repeats across the road
    const uv = line.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, u * 8, v);
    }
    this.group.add(line);

    // Gantry
    const fr = tr.frame(0, {});
    const yaw = Math.atan2(fr.tx, fr.tz);
    const gantry = new THREE.Group();
    const B = new GeoBuilder();
    const span = tr.wallD + 1.2;
    const colA = '#1d1537', colB = '#ffd23f';
    for (const s of [-1, 1]) {
      B.add(new THREE.BoxGeometry(1.4, 9, 1.4), colA, [s * span, 4.5, 0]);
      B.add(new THREE.BoxGeometry(1.8, 0.6, 1.8), colB, [s * span, 0.3, 0]);
      B.add(new THREE.SphereGeometry(0.7, 10, 8), colB, [s * span, 9.4, 0]);
    }
    B.add(new THREE.BoxGeometry(span * 2 + 1.4, 0.5, 1.6), colA, [0, 9.0, 0]);
    const frame = new THREE.Mesh(B.build(), toonMat({ vertexColors: true }));
    frame.castShadow = !!this.quality.shadows;
    gantry.add(frame);
    const bt = this._tex(TX.bannerTexture('ZOOMIES!'));
    const bannerW = span * 1.5;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerW * 96 / 512),
      new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, fog: true }));
    banner.position.set(0, 7.2, 0);
    banner.rotation.y = Math.PI; // face oncoming karts
    gantry.add(banner);
    gantry.position.set(fr.x, tr.heightAtFrame(fr, 0) - 0.2, fr.z);
    gantry.rotation.y = yaw;
    this.group.add(gantry);
  }

  _buildRampsAndPads() {
    const tr = this.track;
    const padTex = this._tex(TX.boostTexture());
    padTex.repeat.set(1, 2);
    this.padTex = padTex;
    const padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, fog: true });
    for (const b of tr.boosts) {
      const geo = tr.patch(b.s, b.s + b.len, b.d - b.w / 2, b.d + b.w / 2, { lift: 0.05 });
      const m = new THREE.Mesh(geo, padMat);
      m.renderOrder = 1;
      this.group.add(m);
    }
    const rampTex = this._tex(TX.curbTexture('#ffd23f', '#1d1537'));
    const rampMat = toonMat({ map: rampTex });
    for (const r of tr.ramps) {
      const top = tr.patch(r.s, r.s + r.len, -tr.halfRoad, tr.halfRoad, { lift: 0.02, segs: 8 });
      const uv = top.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 3);
      const mt = new THREE.Mesh(top, rampMat);
      mt.receiveShadow = !!this.quality.shadows;
      this.group.add(mt);
      // front face at the drop
      const fr = tr.frame(r.s + r.len, {});
      const p = [];
      for (const d of [-tr.halfRoad, tr.halfRoad]) {
        const base = tr.heightAtFrame({ ...fr, s: -99999 }, d);
        p.push([fr.x + fr.rx * d, base, fr.z + fr.rz * d], [fr.x + fr.rx * d, base + r.h, fr.z + fr.rz * d]);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute([...p[0], ...p[1], ...p[2], ...p[1], ...p[3], ...p[2]], 3));
      fg.computeVertexNormals();
      const face = new THREE.Mesh(fg, toonMat({ color: '#1d1537', side: THREE.DoubleSide }));
      this.group.add(face);
    }
  }

  // ---------------- Scenery ----------------

  _scatter(count, minD, maxD, spacing = 4) {
    const tr = this.track;
    const r = this.r;
    const out = [];
    const cell = new Map();
    const key = (x, z) => `${Math.floor(x / spacing)},${Math.floor(z / spacing)}`;
    let tries = 0;
    while (out.length < count && tries < count * 25) {
      tries++;
      const i = Math.floor(r() * tr.N);
      const side = r() < 0.5 ? -1 : 1;
      const d = side * (minD + Math.pow(r(), 1.6) * (maxD - minD));
      const x = tr.px[i] + tr.rx[i] * d + (r() - 0.5) * 6;
      const z = tr.pz[i] + tr.rz[i] * d + (r() - 0.5) * 6;
      if (tr.distToCenter(x, z) < minD) continue;
      if (this.theme.water && Math.hypot(x - tr.center.x, z - tr.center.z) > tr.radius + 185) continue;
      const k = key(x, z);
      if (cell.has(k)) continue;
      cell.set(k, 1);
      out.push([x, z]);
    }
    return out;
  }

  _instanced(geo, mat, spots, { scale = [1, 1], y = -0.25, tilt = 0, castShadow = true, colors = null, yScale = null } = {}) {
    if (!spots.length) return null;
    const r = this.r;
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const sc = scale[0] + r() * (scale[1] - scale[0]);
      e.set((r() - 0.5) * tilt, r() * Math.PI * 2, (r() - 0.5) * tilt);
      q.setFromEuler(e);
      p.set(x, y, z);
      const ys = yScale ? sc * (yScale[0] + r() * (yScale[1] - yScale[0])) : sc;
      s.set(sc, ys, sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (colors) {
        c.set(colors[Math.floor(r() * colors.length)]);
        mesh.setColorAt(i, c);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow && !!this.quality.shadows && this.quality.treeShadows;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  _buildScenery() {
    const theme = this.track.def.theme;
    const tr = this.track;
    const near = tr.wallD + 3;
    const vc = toonMat({ vertexColors: true });
    this.propMat = vc;
    const dens = this.quality.density;
    const n = (x) => Math.round(x * dens);

    if (theme === 'meadow') {
      this._instanced(P.tree('#3f9b3a', '#57b848'), vc, this._scatter(n(150), near + 2, 110, 7), { scale: [0.8, 1.5] });
      this._instanced(P.tree('#ff9ecb', '#ffc2de'), vc, this._scatter(n(50), near + 2, 80, 7), { scale: [0.8, 1.3] });
      this._instanced(P.bush('#4ea83f'), vc, this._scatter(n(110), near, 40, 4), { scale: [0.7, 1.4] });
      this._instanced(P.rock('#a9a9b8'), vc, this._scatter(n(40), near, 90, 6), { scale: [0.6, 2.2], tilt: 0.5 });
      this._instanced(P.flowers(), vc, this._scatter(n(140), near - 1, 60, 3), { scale: [0.8, 1.3], castShadow: false,
        colors: ['#ffffff', '#fff27a', '#ff9ecb', '#ffb36b', '#c7a0ff'] });
      this._landmarkWindmill();
      this._balloons();
    } else if (theme === 'desert') {
      this._instanced(P.cactus(), vc, this._scatter(n(90), near + 1, 100, 6), { scale: [0.8, 1.6] });
      this._instanced(P.rock('#c77a4a'), vc, this._scatter(n(70), near, 100, 6), { scale: [0.7, 3.2], tilt: 0.6 });
      this._instanced(P.deadBush(), vc, this._scatter(n(70), near, 60, 4), { scale: [0.8, 1.4], castShadow: false });
      this._instanced(P.palm(), vc, this._scatter(n(22), near + 3, 70, 9), { scale: [0.9, 1.3] });
      this._instanced(P.mesa(), vc, this._scatter(n(18), 70, 170, 40), { scale: [0.8, 1.6], yScale: [0.7, 1.3], castShadow: false });
      this._landmarkArch('#c8693a', '#e39457');
    } else if (theme === 'frost') {
      this._instanced(P.pine(), vc, this._scatter(n(190), near + 1, 110, 6), { scale: [0.8, 1.7] });
      this._instanced(P.snowman(), vc, this._scatter(n(10), near, 30, 12), { scale: [1, 1.2] });
      this._instanced(P.rock('#8e9bb0', true), vc, this._scatter(n(40), near, 90, 6), { scale: [0.7, 2.4], tilt: 0.5 });
      this._instanced(P.crystal(), vc, this._scatter(n(40), near, 70, 6), { scale: [0.6, 1.6], tilt: 0.4, castShadow: false });
      this._instanced(P.igloo(), vc, this._scatter(n(6), near + 4, 60, 20), { scale: [1, 1.3] });
      this._landmarkArch('#bfe3ff', '#ffffff');
    } else if (theme === 'neon') {
      const win = this._tex(TX.windowsTexture(9));
      const bmat = new THREE.MeshLambertMaterial({ map: win, emissiveMap: win, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9 });
      const bgeo = new THREE.BoxGeometry(1, 1, 1);
      bgeo.translate(0, 0.5, 0);
      const spots = this._scatter(n(90), near + 6, 150, 14);
      const bm = new THREE.InstancedMesh(bgeo, bmat, spots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      const r = this.r;
      spots.forEach(([x, z], i) => {
        const w = 7 + r() * 9, h = 12 + r() * 50, dpt = 7 + r() * 9;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
        m.compose(new THREE.Vector3(x, -0.3, z), q, new THREE.Vector3(w, h, dpt));
        bm.setMatrixAt(i, m);
        bm.setColorAt(i, c.set(['#ffffff', '#c9b8ff', '#9ff6ff', '#ffc2f0'][i % 4]));
      });
      bm.instanceMatrix.needsUpdate = true;
      bm.computeBoundingSphere();
      this.group.add(bm);
      this.textures.push(win);
      const glow = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
      this._instanced(P.pylon(), glow, this._scatter(n(60), near, 40, 8), { scale: [0.9, 1.3], castShadow: false });
      this._neonRings();
      this._planet();
    }
  }

  _landmarkWindmill() {
    const tr = this.track;
    const spots = this._scatter(1, tr.wallD + 18, 50, 30);
    if (!spots.length) return;
    const [x, z] = spots[0];
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(2.2, 3.4, 16, 8), '#fff4e2', [0, 8, 0]);
    B.add(new THREE.ConeGeometry(3.2, 4, 8), '#e8413c', [0, 18, 0]);
    B.add(new THREE.BoxGeometry(1.6, 2.6, 0.4), '#7a4b2a', [0, 1.3, 3.1]);
    const tower = new THREE.Mesh(B.build(), this.propMat);
    tower.position.set(x, -0.25, z);
    tower.castShadow = !!this.quality.shadows;
    this.group.add(tower);
    const BB = new GeoBuilder();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      BB.add(new THREE.BoxGeometry(1.4, 9, 0.2), '#fff8ec', [Math.sin(a) * 4.8, Math.cos(a) * 4.8, 0], [0, 0, -a]);
    }
    BB.add(new THREE.SphereGeometry(0.8, 8, 6), '#e8413c', [0, 0, 0]);
    const blades = new THREE.Mesh(BB.build(), this.propMat);
    blades.position.set(x, 15.5, z);
    const look = Math.atan2(tr.center.x - x, tr.center.z - z);
    blades.rotation.y = look;
    tower.rotation.y = look;
    blades.translateZ(3.2);
    this.group.add(blades);
    this.animated.push((dt) => { blades.rotateZ(dt * 0.9); });
  }

  _balloons() {
    const tr = this.track;
    const r = this.r;
    const cols = [['#ff5a5f', '#ffd23f'], ['#36a9ff', '#ffffff'], ['#19e3b1', '#ff6b35']];
    cols.forEach((cc, i) => {
      const B = new GeoBuilder();
      B.add(new THREE.SphereGeometry(4, 12, 10), cc[0], [0, 6, 0], [0, 0, 0], [1, 1.15, 1]);
      B.add(new THREE.CylinderGeometry(4.05, 1.4, 3.2, 12, 1, true), cc[1], [0, 2.4, 0]);
      B.add(new THREE.BoxGeometry(1.6, 1.2, 1.6), '#8a5530', [0, -0.3, 0]);
      const m = new THREE.Mesh(B.build(), this.propMat);
      const a = r() * Math.PI * 2;
      const rad = tr.radius * (0.4 + r() * 0.8);
      const base = new THREE.Vector3(tr.center.x + Math.cos(a) * rad, 35 + r() * 30, tr.center.z + Math.sin(a) * rad);
      m.position.copy(base);
      this.group.add(m);
      const ph = r() * 10;
      this.animated.push((dt, t) => {
        m.position.y = base.y + Math.sin(t * 0.4 + ph) * 3;
        m.position.x = base.x + Math.sin(t * 0.05 + ph) * 20;
      });
    });
  }

  _landmarkArch(c1, c2) {
    const tr = this.track;
    const at = (tr.length * 0.18) % tr.length;
    const fr = tr.frame(at, {});
    const R = tr.wallD + 4;
    const B = new GeoBuilder();
    B.add(new THREE.TorusGeometry(R, 3.2, 8, 20, Math.PI), c1, [0, 0, 0]);
    B.add(new THREE.TorusGeometry(R + 2.2, 1.2, 6, 20, Math.PI), c2, [0, 0, 0]);
    B.add(new THREE.CylinderGeometry(4.6, 5.4, 3, 8), c1, [R, 0, 0]);
    B.add(new THREE.CylinderGeometry(4.6, 5.4, 3, 8), c1, [-R, 0, 0]);
    const arch = new THREE.Mesh(B.build(), this.propMat);
    arch.position.set(fr.x, tr.heightAtFrame(fr, 0) - 1, fr.z);
    arch.rotation.y = Math.atan2(fr.tx, fr.tz) + Math.PI / 2;
    arch.rotateY(-Math.PI / 2);
    arch.castShadow = !!this.quality.shadows;
    this.group.add(arch);
  }

  _neonRings() {
    const tr = this.track;
    const mat = new THREE.MeshBasicMaterial({ color: '#ff3dc8', fog: true });
    const mat2 = new THREE.MeshBasicMaterial({ color: '#39f5ff', fog: true });
    const geo = new THREE.TorusGeometry(tr.wallD + 2, 0.45, 6, 40);
    for (let k = 0; k < 6; k++) {
      const s = tr.length * (0.12 + k * 0.14);
      const fr = tr.frame(s, {});
      const m = new THREE.Mesh(geo, k % 2 ? mat : mat2);
      m.position.set(fr.x, tr.heightAtFrame(fr, 0) + 2, fr.z);
      m.rotation.y = Math.atan2(fr.tx, fr.tz);
      this.group.add(m);
      const ph = k;
      this.animated.push((dt, t) => { m.scale.setScalar(1 + Math.sin(t * 2 + ph) * 0.03); });
    }
  }

  _planet() {
    const tr = this.track;
    const B = new GeoBuilder();
    B.add(new THREE.SphereGeometry(60, 24, 16), '#ff7ad9');
    const planet = new THREE.Mesh(B.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    planet.position.set(tr.center.x - 350, 180, tr.center.z - 420);
    this.group.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(80, 110, 48), new THREE.MeshBasicMaterial({ color: '#39f5ff', side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.set(1.2, 0.3, 0.2);
    this.group.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd23f', fog: false }));
    moon.position.set(tr.center.x + 380, 240, tr.center.z + 200);
    this.group.add(moon);
  }

  _buildBackdrop() {
    const th = this.theme;
    const tr = this.track;
    const r = this.r;
    if (th.mountains) {
      const B = new GeoBuilder();
      const count = 26;
      const cols = th.mountains.map((c) => new THREE.Color(c));
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + r() * 0.2;
        const dist = tr.radius + 300 + r() * 160;
        const h = 70 + r() * 130;
        const rad = 60 + r() * 70;
        const geo = th === THEMES.desert ? new THREE.CylinderGeometry(rad * 0.7, rad, h * 0.6, 7, 3) : new THREE.ConeGeometry(rad, h, 7, 4);
        const g = geo.toNonIndexed();
        const pos = g.attributes.position;
        const col = new Float32Array(pos.count * 3);
        const hh = th === THEMES.desert ? h * 0.6 : h;
        for (let i = 0; i < pos.count; i++) {
          const f = clamp((pos.getY(i) + hh / 2) / hh, 0, 1);
          const idx = Math.min(cols.length - 1, Math.floor(f * cols.length * 0.999));
          const c = th === THEMES.desert ? cols[(idx + k) % cols.length] : f > 0.78 ? cols[cols.length - 1] : cols[Math.min(idx, cols.length - 2)];
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.translate(tr.center.x + Math.cos(a) * dist, hh / 2 - 6, tr.center.z + Math.sin(a) * dist);
        B.addRaw(g);
      }
      const mesh = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      this.group.add(mesh);
    }
    if (th.clouds) {
      const B = new GeoBuilder();
      for (let k = 0; k < 5; k++) {
        B.add(new THREE.IcosahedronGeometry(1, 1), '#ffffff', [(k - 2) * 1.5, Math.sin(k) * 0.3, (k % 2) * 0.6], [0, 0, 0], 1 + (k % 3) * 0.3);
      }
      const geo = B.build();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.45 });
      const spots = [];
      for (let k = 0; k < th.clouds; k++) {
        const a = r() * Math.PI * 2;
        const d = tr.radius * 0.3 + r() * (tr.radius + 280);
        spots.push([tr.center.x + Math.cos(a) * d, tr.center.z + Math.sin(a) * d]);
      }
      const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
      const m = new THREE.Matrix4();
      spots.forEach(([x, z], i) => {
        const s = 6 + r() * 8;
        m.compose(new THREE.Vector3(x, 80 + r() * 70, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(s, s * 0.55, s));
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.clouds = mesh;
    }
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.sky.position.copy(camera.position);
    if (this.waterMat) this.waterMat.uniforms.time.value = this.time;
    if (this.padTex) this.padTex.offset.y = (this.padTex.offset.y - dt * 1.6) % 1;
    for (const f of this.animated) f(dt, this.time);
    if (this.clouds) this.clouds.rotation.y += dt * 0.002;
    if (focus && this.sun.castShadow) {
      // keep the shadow frustum centred on the action, snapped to texels to avoid shimmer
      const snap = 92 / this.sun.shadow.mapSize.x;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx + this.sunDir.x * 90, focus.y + this.sunDir.y * 90, fz + this.sunDir.z * 90);
    }
  }

  dispose() {
    disposeObject(this.group);
    for (const t of this.textures) t.dispose();
  }
}

// ---------------- Prop prototypes (vertex coloured) ----------------

const P = {
  tree(c1, c2) {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(0.35, 0.55, 3.2, 6), '#7a4b2a', [0, 1.6, 0]);
    B.add(new THREE.IcosahedronGeometry(2.4, 0), c1, [0, 4.4, 0]);
    B.add(new THREE.IcosahedronGeometry(1.8, 0), c2, [1.2, 5.6, 0.4]);
    B.add(new THREE.IcosahedronGeometry(1.6, 0), c2, [-1.1, 5.2, -0.6]);
    B.add(new THREE.IcosahedronGeometry(1.4, 0), c1, [0.1, 6.6, -0.2]);
    return B.build();
  },
  bush(c) {
    const B = new GeoBuilder();
    B.add(new THREE.IcosahedronGeometry(1.1, 0), c, [0, 0.7, 0]);
    B.add(new THREE.IcosahedronGeometry(0.8, 0), '#63c052', [0.8, 0.6, 0.2]);
    B.add(new THREE.IcosahedronGeometry(0.7, 0), '#3f9b3a', [-0.7, 0.5, -0.3]);
    return B.build();
  },
  rock(c, snow = false) {
    const B = new GeoBuilder();
    B.add(new THREE.DodecahedronGeometry(1, 0), c, [0, 0.5, 0], [0, 0, 0], [1.3, 0.9, 1.1]);
    B.add(new THREE.DodecahedronGeometry(0.6, 0), c, [0.9, 0.3, 0.4]);
    if (snow) B.add(new THREE.DodecahedronGeometry(0.9, 0), '#ffffff', [0, 0.95, 0], [0, 0, 0], [1.2, 0.35, 1]);
    return B.build();
  },
  flowers() {
    const B = new GeoBuilder();
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      B.add(new THREE.OctahedronGeometry(0.28, 0), '#ffffff', [Math.cos(a) * 0.7, 0.35, Math.sin(a) * 0.7]);
    }
    return B.build();
  },
  cactus() {
    const B = new GeoBuilder();
    const c = '#3f9a55', c2 = '#57b86b';
    B.add(new THREE.CapsuleGeometry(0.55, 4.2, 3, 8), c, [0, 2.6, 0]);
    B.add(new THREE.CapsuleGeometry(0.38, 1.2, 3, 8), c2, [0.95, 2.6, 0], [0, 0, Math.PI / 2]);
    B.add(new THREE.CapsuleGeometry(0.38, 1.4, 3, 8), c2, [1.5, 3.5, 0]);
    B.add(new THREE.CapsuleGeometry(0.34, 1.0, 3, 8), c2, [-0.85, 2.0, 0], [0, 0, Math.PI / 2]);
    B.add(new THREE.CapsuleGeometry(0.34, 1.0, 3, 8), c2, [-1.3, 2.7, 0]);
    B.add(new THREE.SphereGeometry(0.3, 6, 4), '#ff6fa8', [0, 5.3, 0]);
    return B.build();
  },
  deadBush() {
    const B = new GeoBuilder();
    for (let k = 0; k < 5; k++) {
      const a = k * 1.25;
      B.add(new THREE.CylinderGeometry(0.05, 0.09, 1.4, 4), '#8a5a36', [Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3], [Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6]);
    }
    return B.build();
  },
  palm() {
    const B = new GeoBuilder();
    for (let k = 0; k < 6; k++) {
      B.add(new THREE.CylinderGeometry(0.34, 0.42, 1.4, 6), k % 2 ? '#a0703f' : '#8a5a36', [k * 0.18, 0.7 + k * 1.3, 0], [0, 0, -0.12]);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      B.add(new THREE.ConeGeometry(0.7, 4.2, 4), k % 2 ? '#3fae52' : '#2f9444', [1.1 + Math.cos(a) * 1.7, 8.1, Math.sin(a) * 1.7], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25 + Math.PI / 2 * 0], [1, 1, 0.35]);
    }
    B.add(new THREE.SphereGeometry(0.35, 6, 4), '#6b4a2a', [1.0, 7.9, 0.3]);
    return B.build();
  },
  mesa() {
    const B = new GeoBuilder();
    const cols = ['#b65a31', '#cf7340', '#e39457', '#c8693a'];
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const h = 5 + k * 1.5;
      const r0 = 18 - k * 1.6;
      B.add(new THREE.CylinderGeometry(r0 - 1.2, r0, h, 7), cols[k], [0, y + h / 2, 0]);
      y += h;
    }
    return B.build();
  },
  pine() {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(0.3, 0.45, 2, 6), '#6b4a2a', [0, 1, 0]);
    const c = ['#1f6b4a', '#2b7f58', '#338f63'];
    for (let k = 0; k < 3; k++) {
      const y = 2.2 + k * 1.9;
      const r0 = 2.6 - k * 0.7;
      B.add(new THREE.ConeGeometry(r0, 3, 7), c[k], [0, y + 1.2, 0]);
      B.add(new THREE.ConeGeometry(r0 * 0.55, 1.1, 7), '#ffffff', [0, y + 2.3, 0]);
    }
    return B.build();
  },
  snowman() {
    const B = new GeoBuilder();
    B.add(new THREE.SphereGeometry(1.3, 10, 8), '#ffffff', [0, 1.2, 0]);
    B.add(new THREE.SphereGeometry(0.95, 10, 8), '#ffffff', [0, 2.9, 0]);
    B.add(new THREE.SphereGeometry(0.7, 10, 8), '#ffffff', [0, 4.2, 0]);
    B.add(new THREE.ConeGeometry(0.14, 0.7, 6), '#ff7a1a', [0, 4.2, 0.9], [Math.PI / 2, 0, 0]);
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 10), '#1d1537', [0, 5.0, 0]);
    B.add(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 10), '#1d1537', [0, 4.7, 0]);
    B.add(new THREE.TorusGeometry(0.72, 0.16, 6, 12), '#e8413c', [0, 3.55, 0], [Math.PI / 2, 0, 0]);
    return B.build();
  },
  crystal() {
    const B = new GeoBuilder();
    B.add(new THREE.OctahedronGeometry(1, 0), '#9fdcff', [0, 1.6, 0], [0, 0, 0], [0.6, 1.8, 0.6]);
    B.add(new THREE.OctahedronGeometry(0.7, 0), '#d7f1ff', [0.7, 0.9, 0.2], [0, 0, 0.4], [0.5, 1.4, 0.5]);
    return B.build();
  },
  igloo() {
    const B = new GeoBuilder();
    B.add(new THREE.SphereGeometry(3.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#f4f9ff', [0, 0, 0]);
    B.add(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 10, 1, false, 0, Math.PI), '#e3eefa', [0, 0.6, 3.2], [Math.PI / 2, 0, 0]);
    return B.build();
  },
  pylon() {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), '#2a2350', [0, 3.5, 0]);
    B.add(new THREE.OctahedronGeometry(0.9, 0), '#39f5ff', [0, 7.6, 0]);
    B.add(new THREE.TorusGeometry(0.9, 0.12, 4, 12), '#ff3dc8', [0, 5.2, 0], [Math.PI / 2, 0, 0]);
    return B.build();
  },
};
