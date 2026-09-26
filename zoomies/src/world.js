import * as THREE from 'three';
import { GeoBuilder, rng, toonMat, clamp, disposeObject } from './util.js';
import * as TX from './textures.js';

export const THEMES = {
  meadow: {
    sky: ['#2c7be5', '#bfe6ff', '#e4f5ff'], sunGlow: '#fff2c4', stars: 0, fogNear: 160, fogFar: 760,
    sun: '#fff0d4', sunI: 2.6, sunDir: [-0.5, 0.9, 0.35], hemi: ['#d6ecff', '#5f8f3e', 1.35],
    road: 'asphalt', ground: 'grass', wall: 'redwhite', curb: ['#e8413c', '#ffffff'],
    groundTint: ['#ffffff', '#cfe6b0', '#f2ffd9'], beach: '#f1d79b', water: ['#1f8fd1', '#56d0f0'], lake: ['#2a8fd6', '#6fd6f5'],
    mountains: ['#4f8f45', '#77a35a', '#a7b8a0', '#ffffff'], clouds: 24, dust: '#b9d98f', wallSide: '#d9d4cc',
  },
  beach: {
    sky: ['#1f9fe8', '#c7f1ff', '#eafaff'], sunGlow: '#fff6d0', stars: 0, fogNear: 180, fogFar: 800,
    sun: '#fff4dc', sunI: 2.8, sunDir: [0.4, 0.85, 0.35], hemi: ['#e0f6ff', '#d8b98a', 1.4],
    road: 'boardwalk', ground: 'sand', wall: 'wood', curb: ['#19c3c9', '#ffffff'],
    groundTint: ['#ffffff', '#fff1d6', '#f6e2bf'], beach: '#f7e3b5', water: ['#0b8fc4', '#3fe0e0'], lake: ['#0fb0c9', '#7ff2e6'],
    mountains: ['#3f9a6a', '#5fb07a', '#8bc49a', '#c9e8c0'], clouds: 16, dust: '#f3dcae', wallSide: '#8a5a30', seaNear: true,
  },
  desert: {
    sky: ['#e7743f', '#ffd29a', '#ffe8c2'], sunGlow: '#fff0c0', stars: 0, fogNear: 160, fogFar: 780,
    sun: '#ffe2b8', sunI: 2.8, sunDir: [0.55, 0.7, -0.3], hemi: ['#ffe0b0', '#b0683a', 1.3],
    road: 'dirt', ground: 'sand', wall: 'sandstone', curb: ['#ff8a2b', '#fff1d0'],
    groundTint: ['#ffffff', '#f0c9a0', '#fff0dc'], beach: null, water: null, lake: ['#1aa6a0', '#5fe0c8'],
    mountains: ['#b65a31', '#cf7340', '#e39457', '#f1b47a'], mesa: true, clouds: 8, dust: '#f0c48c', wallSide: '#b8643a',
  },
  frost: {
    sky: ['#5a8fd6', '#d9ecff', '#f2f8ff'], sunGlow: '#ffffff', stars: 0, fogNear: 140, fogFar: 680,
    sun: '#f4f8ff', sunI: 2.3, sunDir: [-0.35, 0.8, -0.5], hemi: ['#e6f0ff', '#8aa6c8', 1.45],
    road: 'ice', ground: 'snow', wall: 'snowbank', curb: ['#2f7bff', '#ffffff'],
    groundTint: ['#ffffff', '#dbe8f7', '#f7fbff'], beach: '#cfe3f6', water: ['#6fa7d8', '#bfe3ff'], lake: ['#9fd0f5', '#e2f4ff'],
    mountains: ['#6d7f99', '#8d9fb8', '#c9d7e8', '#ffffff'], clouds: 18, dust: '#ffffff', wallSide: '#e3eefa',
  },
  candy: {
    sky: ['#ff8fc7', '#ffe0f0', '#fff4fa'], sunGlow: '#fffbe0', stars: 0, fogNear: 150, fogFar: 720,
    sun: '#fff4f8', sunI: 2.5, sunDir: [0.3, 0.9, 0.3], hemi: ['#fff0f8', '#d77ab0', 1.45],
    road: 'chocolate', ground: 'frosting', wall: 'candycane', curb: ['#ff3d6a', '#ffffff'],
    groundTint: ['#ffffff', '#ffe6f2', '#f6f0ff'], beach: null, water: null, lake: ['#5a2e18', '#8a4a28'],
    mountains: ['#ff8fc7', '#ffb3d6', '#ffd0e6', '#ffffff'], clouds: 20, dust: '#ffc7e2', wallSide: '#ffd6e6',
  },
  neon: {
    sky: ['#070419', '#3a1a6b', '#140a2e'], sunGlow: '#ff6ad5', stars: 1, fogNear: 130, fogFar: 700,
    sun: '#b9a6ff', sunI: 1.6, sunDir: [0.3, 0.8, 0.4], hemi: ['#8f7bff', '#2a1a55', 1.6],
    road: 'neon', ground: 'tiles', wall: 'neon', curb: ['#ff3dc8', '#39f5ff'],
    groundTint: ['#ffffff', '#b7a8ff', '#ffffff'], beach: null, water: null, lake: ['#1a0f40', '#3a1a8a'],
    mountains: null, clouds: 0, dust: '#b48cff', wallSide: '#1a1438', glowRoad: true,
  },
  volcano: {
    sky: ['#2a0f1e', '#b8452a', '#3a1414'], sunGlow: '#ff9a4a', stars: 0.6, fogNear: 120, fogFar: 640,
    sun: '#ffb27a', sunI: 2.0, sunDir: [-0.4, 0.7, 0.5], hemi: ['#ffb08a', '#3a1f24', 1.35],
    road: 'basalt', ground: 'ash', wall: 'basalt', curb: ['#ff5a1a', '#2b2527'],
    groundTint: ['#ffffff', '#d8c6c0', '#b8a6a6'], beach: null, water: null, lake: ['#ff3a00', '#ffc23a'],
    mountains: ['#2b2426', '#3b3134', '#4b3f42', '#6b3a2a'], volcano: true, clouds: 0, dust: '#6a5d60', wallSide: '#221c1d', glowRoad: true,
  },
  cloud: {
    sky: ['#7fb8ff', '#ffe9f6', '#fff6fb'], sunGlow: '#fffbe6', stars: 0, fogNear: 170, fogFar: 760,
    sun: '#fffaf0', sunI: 2.5, sunDir: [-0.3, 0.9, 0.4], hemi: ['#ffffff', '#c7b8ff', 1.55],
    road: 'pastel', ground: 'cloud', wall: 'cloudrail', curb: ['#ff9ecb', '#9ee7ff'],
    groundTint: ['#ffffff'], beach: null, water: ['#f2eaff', '#ffffff'], lake: null,
    mountains: null, clouds: 60, dust: '#ffffff', wallSide: '#f4efff', floating: true,
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
  if (stars > 0.01 && h > 0.02) {
    vec3 cell = floor(d * 260.0);
    float n = hash(cell);
    float tw = step(0.9965, n);
    col += vec3(tw) * smoothstep(0.02, 0.3, h) * (0.6 + 0.4 * hash(cell + 3.1)) * stars;
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
uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform float scale; uniform float glow;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz * scale;
  float w = sin(p.x * 0.045 + time * 0.7) * sin(p.y * 0.05 - time * 0.55);
  float w2 = sin((p.x + p.y) * 0.11 + time * 1.3) * 0.5 + 0.5;
  vec3 col = mix(deep, shallow, 0.45 + 0.22 * w + 0.18 * w2);
  float g = fract(sin(dot(floor(p * 0.35), vec2(12.9898, 78.233))) * 43758.5453);
  float sparkle = step(0.985, g) * (0.5 + 0.5 * sin(time * 4.0 + g * 40.0));
  col += sparkle * 0.35 * (1.0 - glow);
  col *= 1.0 + glow * (0.25 + 0.25 * w2);
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
    this.waterMats = [];
    this.time = 0;
    this.r = rng(track.def.id.length * 977 + (track.reverse ? 5 : 0));
    const k = track.def.scale ?? 1;
    this.lakes = (track.def.lakes || []).map((l) => ({ x: l.x * k, z: l.z * k, rx: l.rx * k, rz: l.rz * k, lava: !!l.lava }));
    this.lenScale = clamp(track.length / 1100, 0.8, 2.2);
    this._build();
  }

  _tex(t) {
    this.textures.push(t);
    return t;
  }

  _build() {
    const th = this.theme;
    const g = this.group;
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
      c.left = -46; c.right = 46; c.top = 46; c.bottom = -46; c.near = 1; c.far = 240;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    g.add(this.sun);
    g.add(this.sun.target);

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: {
        top: { value: new THREE.Color(th.sky[0]) }, horizon: { value: new THREE.Color(th.sky[1]) },
        bottom: { value: new THREE.Color(th.sky[2]) }, glow: { value: new THREE.Color(th.sunGlow) },
        sunDir: { value: this.sunDir.clone() }, stars: { value: th.stars },
      },
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    g.add(this.sky);
    this.fog = new THREE.Fog(th.sky[1], th.fogNear, th.fogFar);

    this.roadTex = this._tex(TX.roadTexture(th.road, 3));
    this.groundTex = this._tex(TX.groundTexture(th.ground, 11));
    this._buildGround();
    this._buildLakes();
    this._buildTrackSurface();
    this._buildShortcuts();
    this._buildStart();
    this._buildRampsAndPads();
    this._buildScenery();
    this._buildBackdrop();
  }

  _waterMat(cols, { scale = 1, glow = 0 } = {}) {
    const m = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: { value: 0 }, deep: { value: new THREE.Color(cols[0]) }, shallow: { value: new THREE.Color(cols[1]) },
        scale: { value: scale }, glow: { value: glow },
      }]),
      fog: true,
    });
    this.waterMats.push(m);
    return m;
  }

  _buildGround() {
    const th = this.theme;
    const tr = this.track;
    if (th.floating) {
      // A sea of clouds far below the floating track.
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), this._waterMat(th.water, { scale: 0.5 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(tr.center.x, -26, tr.center.z);
      this.group.add(sea);
      return;
    }
    const hasWater = !!th.water;
    const R = tr.radius + (th.seaNear ? 150 : 230);
    const rings = 22, segs = 90;
    const pos = [], col = [], uv = [], idx = [];
    const r = rng(42);
    const tints = th.groundTint.map((c) => new THREE.Color(c));
    const beach = th.beach ? new THREE.Color(th.beach) : null;
    const noise = [];
    for (let s = 0; s < segs; s++) noise.push(0.9 + r() * 0.2);
    for (let i = 0; i <= rings; i++) {
      const f = i / rings;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const n = noise[s % segs] * (0.94 + 0.06 * Math.sin(a * 5 + 1.3));
        const rad = hasWater ? R * f * (i === rings ? n : i === rings - 1 ? (n + 1) / 2 : 1) : R * 1.7 * f;
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
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }));
    ground.receiveShadow = !!this.quality.shadows;
    this.group.add(ground);
    if (hasWater) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), this._waterMat(th.water));
      water.rotation.x = -Math.PI / 2;
      water.position.set(tr.center.x, -1.1, tr.center.z);
      this.group.add(water);
    }
  }

  _buildLakes() {
    const th = this.theme;
    for (const l of this.lakes) {
      const cols = l.lava ? ['#ff2a00', '#ffc23a'] : th.lake || th.water;
      if (!cols) continue;
      const geo = new THREE.CircleGeometry(1, 48);
      // wobble the shoreline a little
      const p = geo.attributes.position;
      for (let i = 1; i < p.count; i++) {
        const a = Math.atan2(p.getY(i), p.getX(i));
        const k = 1 + Math.sin(a * 3 + l.x) * 0.06 + Math.sin(a * 5 + l.z) * 0.04;
        p.setXY(i, p.getX(i) * k, p.getY(i) * k);
      }
      const m = new THREE.Mesh(geo, this._waterMat(cols, { scale: 1.6, glow: l.lava ? 1 : 0 }));
      m.rotation.x = -Math.PI / 2;
      m.scale.set(l.rx, l.rz, 1);
      m.position.set(l.x, -0.12, l.z);
      this.group.add(m);
      // shore ring
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 48), new THREE.MeshLambertMaterial({ color: l.lava ? '#1c1516' : th.beach || '#e8d6a8' }));
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(l.rx, l.rz, 1);
      ring.position.set(l.x, -0.14, l.z);
      this.group.add(ring);
    }
  }

  inLake(x, z, margin = 4) {
    for (const l of this.lakes) {
      const dx = (x - l.x) / (l.rx + margin), dz = (z - l.z) / (l.rz + margin);
      if (dx * dx + dz * dz < 1) return true;
    }
    return false;
  }

  _roadMaterials(th) {
    const roadMat = new THREE.MeshLambertMaterial({ map: this.roadTex });
    if (th.glowRoad) {
      roadMat.emissiveMap = this.roadTex;
      roadMat.emissive = new THREE.Color('#ffffff');
      roadMat.emissiveIntensity = th.road === 'basalt' ? 0.35 : 0.55;
    }
    const curbTex = this._tex(TX.curbTexture(th.curb[0], th.curb[1]));
    const curbMat = new THREE.MeshLambertMaterial({ map: curbTex });
    if (th.glowRoad) {
      curbMat.emissiveMap = curbTex;
      curbMat.emissive = new THREE.Color('#ffffff');
      curbMat.emissiveIntensity = 0.7;
    }
    const shMat = new THREE.MeshLambertMaterial({ map: this.groundTex, color: '#f4f4f4' });
    const wallTex = this._tex(TX.wallTexture(th.wall));
    const wallMat = toonMat({ map: wallTex });
    if (th.wall === 'neon' || th.wall === 'basalt') {
      wallMat.emissiveMap = wallTex;
      wallMat.emissive = new THREE.Color('#ffffff');
      wallMat.emissiveIntensity = th.wall === 'neon' ? 1.0 : 0.8;
    }
    const sideMat = toonMat({ color: th.wallSide || '#cccccc' });
    return { roadMat, curbMat, shMat, wallMat, sideMat };
  }

  // Wall ribbons (inner face, top and outer skirt) for one side over [i0, i1].
  _walls(path, side, i0, i1, mats, H, floating) {
    const T = 0.7;
    const inner = path.ribbon((i, o) => {
      const d = side * path.wd[i], y = path.yAt(i, d);
      o[0] = path.px[i] + path.rx[i] * d; o[1] = y - 0.3; o[2] = path.pz[i] + path.rz[i] * d;
      o[3] = o[0]; o[4] = y + H; o[5] = o[2];
    }, (i) => [-side * path.rx[i], 0, -side * path.rz[i]], 1 / 8, i0, i1);
    const m1 = new THREE.Mesh(inner, mats.wallMat);
    m1.receiveShadow = !!this.quality.shadows;
    this.group.add(m1);
    const top = path.ribbon((i, o) => {
      const d0 = side * path.wd[i], d1 = side * (path.wd[i] + T);
      const y = path.yAt(i, d0) + H;
      o[0] = path.px[i] + path.rx[i] * d0; o[1] = y; o[2] = path.pz[i] + path.rz[i] * d0;
      o[3] = path.px[i] + path.rx[i] * d1; o[4] = y; o[5] = path.pz[i] + path.rz[i] * d1;
    }, () => [0, 1, 0], 1 / 8, i0, i1);
    this.group.add(new THREE.Mesh(top, mats.sideMat));
    const outer = path.ribbon((i, o) => {
      const d = side * (path.wd[i] + T);
      const yTop = path.yAt(i, side * path.wd[i]) + H;
      o[0] = path.px[i] + path.rx[i] * d; o[1] = yTop; o[2] = path.pz[i] + path.rz[i] * d;
      o[3] = o[0]; o[4] = floating || path.bridge[i] ? yTop - H - 2.2 : -3; o[5] = o[2];
    }, (i) => [side * path.rx[i], 0, side * path.rz[i]], 1 / 8, i0, i1);
    this.group.add(new THREE.Mesh(outer, mats.sideMat));
  }

  _underside(path, i0, i1, mat) {
    const geo = path.ribbon((i, o) => {
      const w = path.wd[i] + 0.7;
      const yl = path.yAt(i, -path.wd[i]) - 2.5, yr = path.yAt(i, path.wd[i]) - 2.5;
      o[0] = path.px[i] - path.rx[i] * w; o[1] = yl; o[2] = path.pz[i] - path.rz[i] * w;
      o[3] = path.px[i] + path.rx[i] * w; o[4] = yr; o[5] = path.pz[i] + path.rz[i] * w;
    }, () => [0, -1, 0], 1 / 8, i0, i1);
    this.group.add(new THREE.Mesh(geo, mat));
  }

  _buildTrackSurface() {
    const th = this.theme;
    const tr = this.track;
    const shadows = !!this.quality.shadows;
    const mats = (this.mats = this._roadMaterials(th));
    const road = new THREE.Mesh(tr.strip((i) => -tr.hw[i], (i) => tr.hw[i], { vScale: 1 / 16, across: 2 }), mats.roadMat);
    road.receiveShadow = shadows;
    this.group.add(road);
    for (const side of [-1, 1]) {
      const a = (i) => side * tr.hw[i], b = (i) => side * tr.ed[i];
      const geo = side < 0 ? tr.strip(b, a, { vScale: 1 / 3, lift: 0.015 }) : tr.strip(a, b, { vScale: 1 / 3, lift: 0.015 });
      const m = new THREE.Mesh(geo, mats.curbMat);
      m.receiveShadow = shadows;
      this.group.add(m);
      const c = (i) => side * tr.ed[i], d = (i) => side * tr.wd[i];
      const geo2 = side < 0 ? tr.strip(d, c, { vScale: 1 / 14, uWorld: 14 }) : tr.strip(c, d, { vScale: 1 / 14, uWorld: 14 });
      const m2 = new THREE.Mesh(geo2, mats.shMat);
      m2.receiveShadow = shadows;
      this.group.add(m2);
    }
    // Walls, with gaps where shortcuts branch off.
    for (const side of [-1, 1]) {
      const gap = tr.gap[side > 0 ? 1 : 0];
      for (const [a, b] of tr.runs((i) => !gap[i])) this._walls(tr, side, a, b, mats, tr.wallH, th.floating);
    }
    // Bridge undersides and support pillars.
    const underMat = toonMat({ color: th.wallSide || '#aaaaaa' });
    const pred = th.floating ? () => true : (i) => tr.bridge[i] === 1;
    for (const [a, b] of tr.runs(pred)) this._underside(tr, a, b, underMat);
    if (!th.floating) {
      const B = new GeoBuilder();
      for (let i = 0; i < tr.count; i += 7) {
        if (!tr.bridge[i]) continue;
        for (const side of [-1, 1]) {
          const d = side * (tr.wd[i] - 1);
          const x = tr.px[i] + tr.rx[i] * d, z = tr.pz[i] + tr.rz[i] * d;
          if (this._roadBelow(x, z, i)) continue;
          const top = tr.yAt(i, d) - 2.4;
          B.add(new THREE.CylinderGeometry(0.9, 1.1, top + 0.3, 8), th.wallSide || '#aaaaaa', [x, top / 2 - 0.3, z]);
        }
      }
      if (B.parts.length) this.group.add(new THREE.Mesh(B.build(), toonMat({ vertexColors: true })));
    }
  }

  // Is there another part of the road under (x, z), ignoring samples near i?
  _roadBelow(x, z, near) {
    const tr = this.track;
    for (let j = 0; j < tr.count; j += 2) {
      let di = Math.abs(j - near);
      di = Math.min(di, tr.count - di);
      if (di < 30) continue;
      const dx = x - tr.px[j], dz = z - tr.pz[j];
      if (dx * dx + dz * dz < (tr.wd[j] + 3) ** 2) return true;
    }
    return false;
  }

  _buildShortcuts() {
    const th = this.theme;
    const shadows = !!this.quality.shadows;
    for (const sc of this.track.shortcuts) {
      const mats = this.mats;
      let surf = mats.roadMat;
      if (sc.surface === 'dirt') surf = new THREE.MeshLambertMaterial({ map: this._tex(TX.roadTexture('dirt', 5)) });
      else if (sc.surface === 'ice') surf = new THREE.MeshLambertMaterial({ map: this._tex(TX.roadTexture('ice', 6)), emissive: new THREE.Color('#9fd0ff'), emissiveIntensity: 0.15 });
      else if (sc.surface === 'offroad') surf = new THREE.MeshLambertMaterial({ map: this.groundTex, color: sc.def.deco === 'cotton' ? '#ffc6e4' : '#e8e8e8' });
      else surf = mats.roadMat.clone();
      surf.polygonOffset = true;
      surf.polygonOffsetFactor = -1;
      surf.polygonOffsetUnits = -2;
      const shoulder = new THREE.MeshLambertMaterial({ map: this.groundTex, color: '#eeeeee', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
      const e0 = Math.max(0, sc.entryEnd - 3), e1 = Math.min(sc.count - 1, sc.exitStart + 2);
      const pred = (i) => i >= e0 && i <= e1 && !sc.isVoid(i * sc.ds) && !sc.isVoid((i + 1) * sc.ds);
      for (const [a, b] of sc.runs(pred)) {
        const m = new THREE.Mesh(sc.strip((i) => -sc.hw[i], (i) => sc.hw[i], { vScale: 1 / 14, lift: 0.02, i0: a, i1: b }), surf);
        m.receiveShadow = shadows;
        this.group.add(m);
        for (const side of [-1, 1]) {
          const f0 = (i) => side * sc.hw[i], f1 = (i) => side * sc.wd[i];
          const geo = side < 0 ? sc.strip(f1, f0, { vScale: 1 / 14, uWorld: 14, lift: 0.02, i0: a, i1: b }) : sc.strip(f0, f1, { vScale: 1 / 14, uWorld: 14, lift: 0.02, i0: a, i1: b });
          const m2 = new THREE.Mesh(geo, shoulder);
          m2.receiveShadow = shadows;
          this.group.add(m2);
        }
      }
      const wpred = (i) => !sc.overlap[i] && !sc.isVoid(i * sc.ds);
      for (const side of [-1, 1]) for (const [a, b] of sc.runs(wpred)) this._walls(sc, side, a, b, mats, sc.wallH, th.floating);
      if (th.floating) for (const [a, b] of sc.runs(wpred)) this._underside(sc, a, b, toonMat({ color: th.wallSide }));
      this._shortcutDeco(sc);
      // Boost pads on shortcuts
      for (const b of sc.boosts) {
        const geo = sc.patch(b.s, b.s + b.len, -b.w / 2, b.w / 2, { lift: 0.06 });
        this._padMesh(geo);
      }
    }
  }

  _frameGroup(path, s, dy = 0) {
    const fr = path.frame(s, {});
    const g = new THREE.Group();
    g.position.set(fr.x, path.heightAtFrame(fr, 0) + dy, fr.z);
    g.rotation.y = Math.atan2(fr.tx, fr.tz);
    this.group.add(g);
    return { g, fr };
  }

  _shortcutDeco(sc) {
    const deco = sc.def.deco;
    const mid = sc.length * 0.5;
    const shadows = !!this.quality.shadows;
    const vc = toonMat({ vertexColors: true });
    const W = sc.wd[Math.floor(sc.count / 2)] + 0.8;
    if (deco === 'barn' || deco === 'house') {
      const { g } = this._frameGroup(sc, mid);
      const B = new GeoBuilder();
      const wallC = deco === 'barn' ? '#c8372d' : '#b8743e', trim = deco === 'barn' ? '#ffffff' : '#fff4f8';
      const roofC = deco === 'barn' ? '#5b3a29' : '#ff8fc7';
      const L = 16, H = 7;
      for (const s of [-1, 1]) {
        B.add(new THREE.BoxGeometry(1, H, L), wallC, [s * W, H / 2, 0]);
        B.add(new THREE.BoxGeometry(1.2, 0.5, L + 0.4), trim, [s * W, H, 0]);
        B.add(new THREE.BoxGeometry(1.2, H, 0.5), trim, [s * W, H / 2, L / 2]);
        B.add(new THREE.BoxGeometry(1.2, H, 0.5), trim, [s * W, H / 2, -L / 2]);
        // roof halves
        B.add(new THREE.BoxGeometry(W * 1.25, 0.6, L + 2), roofC, [s * W * 0.52, H + W * 0.36, 0], [0, 0, -s * 0.62]);
      }
      if (deco === 'house') {
        for (let k = 0; k < 8; k++) B.add(new THREE.SphereGeometry(0.45, 8, 6), ['#ff3d6a', '#36a9ff', '#ffd23f', '#19e3b1'][k % 4], [(k % 2 ? 1 : -1) * (W + 0.6), 2 + (k >> 1) * 1.2, -6 + k * 1.7]);
        B.add(new THREE.ConeGeometry(0.7, 2.2, 8), '#ffffff', [0, H + W * 0.8, 0]);
      } else {
        B.add(new THREE.BoxGeometry(0.4, 3, 0.4), trim, [W + 0.7, 1.5, L / 2 + 0.3], [0, 0, 0.6]);
        B.add(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 12), '#e8c65a', [W + 3, 0.7, 4], [0, 0, Math.PI / 2]);
      }
      const m = new THREE.Mesh(B.build(), vc);
      m.castShadow = shadows;
      g.add(m);
    } else if (deco === 'cave' || deco === 'iceArch') {
      const ice = deco === 'iceArch';
      const s0 = sc.length * (ice ? 0.3 : 0.18), s1 = sc.length * (ice ? 0.7 : 0.82);
      const segsA = 9;
      const pos = [], col = [];
      const fr = {};
      const c1 = new THREE.Color(ice ? '#bfe6ff' : '#b8643a'), c2 = new THREE.Color(ice ? '#e8f7ff' : '#8a4527');
      const rows = [];
      for (let s = s0; s <= s1 + 0.01; s += 2) {
        sc.frame(s, fr);
        const base = sc.heightAtFrame(fr, 0);
        const row = [];
        for (let k = 0; k <= segsA; k++) {
          const a = (k / segsA) * Math.PI;
          const R = W + 1.2 + Math.sin(k * 1.7 + s * 0.3) * 0.5;
          const d = Math.cos(a) * R, h = Math.sin(a) * (R * 0.85) - 0.5;
          row.push([fr.x + fr.rx * d, base + h, fr.z + fr.rz * d]);
        }
        rows.push(row);
      }
      for (let r = 0; r < rows.length - 1; r++) {
        for (let k = 0; k < segsA; k++) {
          const a = rows[r][k], b = rows[r][k + 1], c = rows[r + 1][k], d = rows[r + 1][k + 1];
          pos.push(...a, ...c, ...b, ...b, ...c, ...d);
          const cc = (r + k) % 3 === 0 ? c2 : c1;
          for (let q = 0; q < 6; q++) col.push(cc.r, cc.g, cc.b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const mat = toonMat({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
      if (ice) { mat.transparent = true; mat.opacity = 0.75; mat.emissive = new THREE.Color('#6fb8ff'); mat.emissiveIntensity = 0.2; }
      const tunnel = new THREE.Mesh(geo, mat);
      this.group.add(tunnel);
      // glowing crystals / lanterns inside
      const B = new GeoBuilder();
      for (let s = s0 + 6; s < s1; s += 14) {
        sc.frame(s, fr);
        const base = sc.heightAtFrame(fr, 0);
        for (const side of [-1, 1]) {
          const d = side * (W - 0.2);
          B.add(new THREE.OctahedronGeometry(0.6, 0), ice ? '#9ff6ff' : '#ffd23f', [fr.x + fr.rx * d, base + 3.2, fr.z + fr.rz * d]);
        }
      }
      if (B.parts.length) this.group.add(new THREE.Mesh(B.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
    } else if (deco === 'neonRings' || deco === 'rainbow') {
      const rainbow = deco === 'rainbow';
      const cols = rainbow ? ['#ff5a5f', '#ffb13d', '#ffe45c', '#5fe08a', '#4fb8ff', '#b07aff'] : ['#39f5ff', '#ff3dc8'];
      if (rainbow) {
        const { g } = this._frameGroup(sc, sc.voids.length ? (sc.voids[0].s0 + sc.voids[0].s1) / 2 : mid, -2);
        cols.forEach((c, i) => {
          const m = new THREE.Mesh(new THREE.TorusGeometry(W + 6 - i * 1.1, 0.55, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: c, fog: true }));
          m.rotation.y = Math.PI / 2;
          g.add(m);
        });
      } else {
        for (let s = 10, k = 0; s < sc.length - 6; s += 22, k++) {
          const { g } = this._frameGroup(sc, s, 1.5);
          const m = new THREE.Mesh(new THREE.TorusGeometry(W + 1.5, 0.3, 6, 28), new THREE.MeshBasicMaterial({ color: cols[k % 2], fog: true }));
          g.add(m);
          this.animated.push((dt, t) => { m.rotation.z = t * (k % 2 ? 1 : -1) * 0.8; });
        }
      }
    } else if (deco === 'lavaRocks' || deco === 'cotton' || deco === 'palms') {
      const B = new GeoBuilder();
      const fr = {};
      const r = this.r;
      for (let s = 6; s < sc.length - 6; s += deco === 'palms' ? 26 : 9) {
        if (sc.isVoid(s)) continue;
        sc.frame(s, fr);
        const base = sc.heightAtFrame(fr, 0);
        for (const side of [-1, 1]) {
          const d = side * (W + 1.8 + r() * 2);
          const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d;
          if (deco === 'lavaRocks') B.add(new THREE.ConeGeometry(1.2 + r(), 3 + r() * 5, 5), r() < 0.5 ? '#2b2527' : '#3d3336', [x, base + 1, z], [r() * 0.3, r() * 6, r() * 0.3]);
          else if (deco === 'cotton') B.add(new THREE.IcosahedronGeometry(1.6 + r(), 1), ['#ffc6e4', '#c8e8ff', '#fff0f8'][Math.floor(r() * 3)], [x, base + 0.6, z]);
          else {
            B.addRaw(P.palmAt(x, base - 0.2, z, 0.9 + r() * 0.3, r() * 6));
          }
        }
      }
      if (B.parts.length) {
        const m = new THREE.Mesh(B.build(), deco === 'lavaRocks' ? toonMat({ vertexColors: true, flatShading: true }) : vc);
        m.castShadow = shadows && deco !== 'cotton';
        this.group.add(m);
      }
    }
  }

  _buildStart() {
    const tr = this.track;
    const checker = this._tex(TX.checkerTexture());
    const fr = tr.frame(0, {});
    const line = new THREE.Mesh(tr.patch(-1.5, 1.5, -fr.hw, fr.hw, { lift: 0.03, segs: 2 }), new THREE.MeshLambertMaterial({ map: checker }));
    line.receiveShadow = !!this.quality.shadows;
    const uv = line.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i));
    this.group.add(line);
    const yaw = Math.atan2(fr.tx, fr.tz);
    const gantry = new THREE.Group();
    const B = new GeoBuilder();
    const span = fr.wd + 1.2;
    const colA = '#1d1537', colB = '#ffd23f';
    for (const s of [-1, 1]) {
      B.add(new THREE.BoxGeometry(1.4, 9, 1.4), colA, [s * span, 4.5, 0]);
      B.add(new THREE.BoxGeometry(1.8, 0.6, 1.8), colB, [s * span, 0.3, 0]);
      B.add(new THREE.SphereGeometry(0.7, 10, 8), colB, [s * span, 9.4, 0]);
      if (this.theme.floating) B.add(new THREE.BoxGeometry(1.4, 4, 1.4), colA, [s * span, -2, 0]);
    }
    B.add(new THREE.BoxGeometry(span * 2 + 1.4, 0.5, 1.6), colA, [0, 9.0, 0]);
    const frame = new THREE.Mesh(B.build(), toonMat({ vertexColors: true }));
    frame.castShadow = !!this.quality.shadows;
    gantry.add(frame);
    const bt = this._tex(TX.bannerTexture('ZOOMIES!'));
    const bannerW = span * 1.5;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, (bannerW * 96) / 512), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, fog: true }));
    banner.position.set(0, 7.2, 0);
    banner.rotation.y = Math.PI;
    gantry.add(banner);
    gantry.position.set(fr.x, tr.heightAtFrame(fr, 0) - 0.2, fr.z);
    gantry.rotation.y = yaw;
    this.group.add(gantry);
  }

  _padMesh(geo) {
    if (!this.padMat) {
      const padTex = this._tex(TX.boostTexture());
      padTex.repeat.set(1, 2);
      this.padTex = padTex;
      this.padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, fog: true });
    }
    const m = new THREE.Mesh(geo, this.padMat);
    m.renderOrder = 1;
    this.group.add(m);
  }

  _buildRampsAndPads() {
    const paths = [this.track, ...this.track.shortcuts];
    for (const b of this.track.boosts) this._padMesh(this.track.patch(b.s, b.s + b.len, b.d - b.w / 2, b.d + b.w / 2, { lift: 0.05 }));
    const rampTex = this._tex(TX.curbTexture('#ffd23f', '#1d1537'));
    const rampMat = toonMat({ map: rampTex });
    const glideTex = this._tex(TX.curbTexture('#36a9ff', '#ffffff'));
    const glideMat = toonMat({ map: glideTex, emissive: new THREE.Color('#36a9ff'), emissiveIntensity: 0.25 });
    for (const p of paths) {
      for (const r of p.ramps) {
        const fr0 = p.frame(r.s, {});
        const hw = Math.min(fr0.hw, r.halfW ?? 99);
        const top = p.patch(r.s, r.s + r.len, -hw, hw, { lift: 0.03, segs: 8 });
        const uv = top.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 3);
        const mt = new THREE.Mesh(top, r.glide ? glideMat : rampMat);
        mt.receiveShadow = !!this.quality.shadows;
        this.group.add(mt);
        const fr = p.frame(r.s + r.len, {});
        const pts = [];
        for (const d of [-hw, hw]) {
          const base = fr.baseY + fr.slope * d + Math.abs(fr.slope) * fr.wd;
          pts.push([fr.x + fr.rx * d, base, fr.z + fr.rz * d], [fr.x + fr.rx * d, base + r.h, fr.z + fr.rz * d]);
        }
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute([...pts[0], ...pts[1], ...pts[2], ...pts[1], ...pts[3], ...pts[2]], 3));
        fg.computeVertexNormals();
        this.group.add(new THREE.Mesh(fg, toonMat({ color: '#1d1537', side: THREE.DoubleSide })));
      }
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
    const floating = this.theme.floating;
    const seaR = this.theme.water && !floating ? tr.radius + (this.theme.seaNear ? 130 : 205) : Infinity;
    while (out.length < count && tries < count * 25) {
      tries++;
      const i = Math.floor(r() * tr.count);
      const side = r() < 0.5 ? -1 : 1;
      const d = side * (tr.wd[i] + minD + Math.pow(r(), 1.6) * (maxD - minD));
      const x = tr.px[i] + tr.rx[i] * d + (r() - 0.5) * 6;
      const z = tr.pz[i] + tr.rz[i] * d + (r() - 0.5) * 6;
      if (tr.clearance(x, z) < minD) continue;
      if (Math.hypot(x - tr.center.x, z - tr.center.z) > seaR) continue;
      if (this.inLake(x, z)) continue;
      const k = key(x, z);
      if (cell.has(k)) continue;
      cell.set(k, 1);
      out.push([x, z, floating ? tr.py[i] - 5 - r() * 10 : -0.25]);
    }
    return out;
  }

  _instanced(geo, mat, spots, { scale = [1, 1], tilt = 0, castShadow = true, colors = null, yScale = null } = {}) {
    if (!spots.length) return null;
    const r = this.r;
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    spots.forEach(([x, z, y], i) => {
      const sc = scale[0] + r() * (scale[1] - scale[0]);
      e.set((r() - 0.5) * tilt, r() * Math.PI * 2, (r() - 0.5) * tilt);
      q.setFromEuler(e);
      p.set(x, y ?? -0.25, z);
      const ys = yScale ? sc * (yScale[0] + r() * (yScale[1] - yScale[0])) : sc;
      s.set(sc, ys, sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (colors) mesh.setColorAt(i, c.set(colors[Math.floor(r() * colors.length)]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow && !!this.quality.shadows && this.quality.treeShadows;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  _buildScenery() {
    const theme = this.track.def.theme;
    const vc = toonMat({ vertexColors: true });
    this.propMat = vc;
    const dens = this.quality.density * this.lenScale;
    const n = (x) => Math.round(x * dens);
    const S = (count, minD, maxD, sp) => this._scatter(n(count), minD, maxD, sp);

    if (theme === 'meadow') {
      this._instanced(P.tree('#3f9b3a', '#57b848'), vc, S(150, 3, 100, 7), { scale: [0.8, 1.5] });
      this._instanced(P.tree('#ff9ecb', '#ffc2de'), vc, S(50, 3, 70, 7), { scale: [0.8, 1.3] });
      this._instanced(P.bush('#4ea83f'), vc, S(110, 1, 30, 4), { scale: [0.7, 1.4] });
      this._instanced(P.rock('#a9a9b8'), vc, S(40, 1, 80, 6), { scale: [0.6, 2.2], tilt: 0.5 });
      this._instanced(P.flowers(), vc, S(140, 0, 50, 3), { scale: [0.8, 1.3], castShadow: false, colors: ['#ffffff', '#fff27a', '#ff9ecb', '#ffb36b', '#c7a0ff'] });
      this._instanced(P.cow(), vc, S(12, 8, 60, 14), { scale: [1, 1.1] });
      this._landmarkWindmill();
      this._balloons(3);
    } else if (theme === 'beach') {
      this._instanced(P.palm(), vc, S(90, 2, 70, 7), { scale: [0.9, 1.35] });
      this._instanced(P.umbrella(), vc, S(40, 1, 30, 8), { scale: [0.9, 1.2], colors: ['#ff5a5f', '#ffd23f', '#19c3c9', '#ff8fc7', '#ffffff'] });
      this._instanced(P.rock('#b9a58a'), vc, S(40, 1, 60, 6), { scale: [0.6, 2.4], tilt: 0.6 });
      this._instanced(P.hut(), vc, S(8, 6, 40, 20), { scale: [1, 1.2] });
      this._instanced(P.starfish(), vc, S(60, 0, 25, 3), { scale: [0.8, 1.3], castShadow: false, colors: ['#ff8a5c', '#ffd23f', '#ff5a8a'] });
      this._lighthouse();
      this._boats();
    } else if (theme === 'desert') {
      this._instanced(P.cactus(), vc, S(90, 2, 90, 6), { scale: [0.8, 1.6] });
      this._instanced(P.rock('#c77a4a'), vc, S(70, 1, 90, 6), { scale: [0.7, 3.2], tilt: 0.6 });
      this._instanced(P.deadBush(), vc, S(70, 0, 50, 4), { scale: [0.8, 1.4], castShadow: false });
      this._instanced(P.palm(), vc, S(18, 4, 60, 9), { scale: [0.9, 1.3] });
      this._instanced(P.mesa(), vc, S(18, 55, 160, 40), { scale: [0.8, 1.6], yScale: [0.7, 1.3], castShadow: false });
      this._landmarkArch('#c8693a', '#e39457');
    } else if (theme === 'frost') {
      this._instanced(P.pine(), vc, S(190, 2, 100, 6), { scale: [0.8, 1.7] });
      this._instanced(P.snowman(), vc, S(10, 1, 25, 12), { scale: [1, 1.2] });
      this._instanced(P.rock('#8e9bb0', true), vc, S(40, 1, 80, 6), { scale: [0.7, 2.4], tilt: 0.5 });
      this._instanced(P.crystal(), vc, S(40, 1, 60, 6), { scale: [0.6, 1.6], tilt: 0.4, castShadow: false });
      this._instanced(P.igloo(), vc, S(6, 5, 50, 20), { scale: [1, 1.3] });
      this._landmarkArch('#bfe3ff', '#ffffff');
    } else if (theme === 'candy') {
      this._instanced(P.lollipop(), vc, S(60, 2, 70, 7), { scale: [0.9, 1.6], colors: ['#ff5a8a', '#36a9ff', '#ffd23f', '#19e3b1', '#b07aff'] });
      this._instanced(P.candyCane(), vc, S(50, 1, 50, 6), { scale: [0.9, 1.5] });
      this._instanced(P.gumdrop(), vc, S(120, 1, 60, 4), { scale: [0.7, 1.6], colors: ['#ff5a8a', '#36a9ff', '#ffd23f', '#19e3b1', '#b07aff', '#ff8a2b'] });
      this._instanced(P.cupcake(), vc, S(24, 3, 60, 10), { scale: [1, 1.6], colors: ['#ffffff', '#ffd6ea', '#d6f0ff', '#fff2b8'] });
      this._instanced(P.donut(), vc, S(20, 3, 60, 10), { scale: [1, 1.5], colors: ['#ff8fc7', '#6b3b24', '#ffd23f', '#c8a8ff'] });
      this._cake();
      this._balloons(4);
    } else if (theme === 'neon') {
      const win = this._tex(TX.windowsTexture(9));
      const bmat = new THREE.MeshLambertMaterial({ map: win, emissiveMap: win, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9 });
      const bgeo = new THREE.BoxGeometry(1, 1, 1);
      bgeo.translate(0, 0.5, 0);
      const spots = S(100, 6, 150, 14);
      const bm = new THREE.InstancedMesh(bgeo, bmat, spots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      const r = this.r;
      spots.forEach(([x, z], i) => {
        const w = 7 + r() * 9, h = 12 + r() * 50, dp = 7 + r() * 9;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
        m.compose(new THREE.Vector3(x, -0.3, z), q, new THREE.Vector3(w, h, dp));
        bm.setMatrixAt(i, m);
        bm.setColorAt(i, c.set(['#ffffff', '#c9b8ff', '#9ff6ff', '#ffc2f0'][i % 4]));
      });
      bm.instanceMatrix.needsUpdate = true;
      bm.computeBoundingSphere();
      this.group.add(bm);
      this._instanced(P.pylon(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), S(60, 0, 40, 8), { scale: [0.9, 1.3], castShadow: false });
      this._neonRings();
      this._planet('#ff7ad9', '#39f5ff');
    } else if (theme === 'volcano') {
      this._instanced(P.deadTree(), vc, S(70, 2, 80, 7), { scale: [0.8, 1.5] });
      this._instanced(P.rock('#3b3134'), toonMat({ vertexColors: true, flatShading: true }), S(90, 1, 90, 6), { scale: [0.8, 3.4], tilt: 0.6 });
      this._instanced(P.crystal('#7a3cff', '#c08aff'), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#5a1ab0'), emissiveIntensity: 0.6 }), S(40, 1, 60, 6), { scale: [0.8, 2], tilt: 0.4, castShadow: false });
      this._instanced(P.vent(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), S(30, 1, 40, 8), { scale: [0.8, 1.4], castShadow: false });
    } else if (theme === 'cloud') {
      this._instanced(P.cloudPuff(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 }),
        S(140, 2, 90, 9), { scale: [1.2, 3.2], castShadow: false, colors: ['#ffffff', '#fff0f8', '#eef4ff', '#f6efff'] });
      this._floatingIslands();
      this._ferrisWheel();
      this._balloons(8);
    }
  }

  _landmarkWindmill() {
    const tr = this.track;
    const spots = this._scatter(1, 16, 50, 30);
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

  _balloons(count) {
    const tr = this.track;
    const r = this.r;
    const cols = [['#ff5a5f', '#ffd23f'], ['#36a9ff', '#ffffff'], ['#19e3b1', '#ff6b35'], ['#b07aff', '#ffe45c']];
    for (let i = 0; i < count; i++) {
      const cc = cols[i % cols.length];
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
    }
  }

  _landmarkArch(c1, c2) {
    const tr = this.track;
    const at = tr.length * 0.18;
    const fr = tr.frame(at, {});
    const R = fr.wd + 4;
    const B = new GeoBuilder();
    B.add(new THREE.TorusGeometry(R, 3.2, 8, 20, Math.PI), c1, [0, 0, 0]);
    B.add(new THREE.TorusGeometry(R + 2.2, 1.2, 6, 20, Math.PI), c2, [0, 0, 0]);
    B.add(new THREE.CylinderGeometry(4.6, 5.4, 3, 8), c1, [R, 0, 0]);
    B.add(new THREE.CylinderGeometry(4.6, 5.4, 3, 8), c1, [-R, 0, 0]);
    const arch = new THREE.Mesh(B.build(), this.propMat);
    arch.position.set(fr.x, tr.heightAtFrame(fr, 0) - 1, fr.z);
    arch.rotation.y = Math.atan2(fr.tx, fr.tz);
    arch.castShadow = !!this.quality.shadows;
    this.group.add(arch);
  }

  _lighthouse() {
    const spots = this._scatter(1, 20, 60, 30);
    if (!spots.length) return;
    const [x, z] = spots[0];
    const B = new GeoBuilder();
    for (let k = 0; k < 5; k++) B.add(new THREE.CylinderGeometry(2.6 - k * 0.3, 2.9 - k * 0.3, 4, 12), k % 2 ? '#ffffff' : '#e8413c', [0, 2 + k * 4, 0]);
    B.add(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 10), '#fff6c9', [0, 21.2, 0]);
    B.add(new THREE.ConeGeometry(2.2, 2.4, 10), '#1d1537', [0, 23.6, 0]);
    const m = new THREE.Mesh(B.build(), this.propMat);
    m.position.set(x, -0.25, z);
    m.castShadow = !!this.quality.shadows;
    this.group.add(m);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3, 26, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#fff6c9', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(13, 0, 0);
    const pivot = new THREE.Group();
    pivot.position.set(x, 21.2, z);
    pivot.add(beam);
    this.group.add(pivot);
    this.animated.push((dt) => { pivot.rotation.y += dt * 0.8; });
  }

  _boats() {
    const tr = this.track;
    const r = this.r;
    for (let i = 0; i < 4; i++) {
      const B = new GeoBuilder();
      B.add(new THREE.BoxGeometry(3, 1.2, 8), '#ffffff', [0, 0.4, 0]);
      B.add(new THREE.BoxGeometry(2.4, 0.6, 7.6), ['#ff5a5f', '#36a9ff', '#ffd23f', '#19c3c9'][i], [0, 1.1, 0]);
      B.add(new THREE.CylinderGeometry(0.15, 0.15, 7, 5), '#8a5530', [0, 4.5, 0.5]);
      B.add(new THREE.ConeGeometry(2.6, 6, 3), '#ffffff', [0, 4.8, -0.8], [0, Math.PI / 2, 0], [0.15, 1, 1]);
      const m = new THREE.Mesh(B.build(), this.propMat);
      const a = r() * Math.PI * 2;
      const d = tr.radius + 190 + r() * 80;
      const bx = tr.center.x + Math.cos(a) * d, bz = tr.center.z + Math.sin(a) * d;
      m.position.set(bx, -1, bz);
      m.rotation.y = r() * 6;
      this.group.add(m);
      const ph = r() * 6;
      this.animated.push((dt, t) => { m.rotation.z = Math.sin(t * 1.2 + ph) * 0.06; m.position.y = -1 + Math.sin(t * 0.9 + ph) * 0.2; });
    }
  }

  _cake() {
    const spots = this._scatter(1, 18, 70, 30);
    if (!spots.length) return;
    const [x, z] = spots[0];
    const B = new GeoBuilder();
    const tiers = [[14, 6, '#ffd6ea'], [10, 5, '#ffffff'], [6.5, 4.5, '#ff8fc7']];
    let y = 0;
    for (const [rad, h, c] of tiers) {
      B.add(new THREE.CylinderGeometry(rad, rad, h, 24), c, [0, y + h / 2, 0]);
      B.add(new THREE.TorusGeometry(rad, 0.6, 6, 24), '#ffffff', [0, y + h, 0], [Math.PI / 2, 0, 0]);
      y += h;
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      B.add(new THREE.CylinderGeometry(0.35, 0.35, 3, 6), ['#36a9ff', '#ffd23f', '#19e3b1', '#ff5a8a', '#b07aff'][k], [Math.cos(a) * 3.5, y + 1.5, Math.sin(a) * 3.5]);
      B.add(new THREE.SphereGeometry(0.4, 6, 4), '#ffb13d', [Math.cos(a) * 3.5, y + 3.3, Math.sin(a) * 3.5]);
    }
    B.add(new THREE.SphereGeometry(1.6, 12, 8), '#e8413c', [0, y + 1.4, 0]);
    const m = new THREE.Mesh(B.build(), this.propMat);
    m.position.set(x, -0.25, z);
    m.castShadow = !!this.quality.shadows;
    this.group.add(m);
  }

  _floatingIslands() {
    const tr = this.track;
    const r = this.r;
    const B = new GeoBuilder();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r();
      const d = tr.radius * (0.7 + r() * 0.9) + 60;
      const x = tr.center.x + Math.cos(a) * d, z = tr.center.z + Math.sin(a) * d;
      const y = -8 + r() * 30;
      const R = 10 + r() * 14;
      B.add(new THREE.ConeGeometry(R, R * 1.4, 7), '#b58a6a', [x, y - R * 0.7, z], [Math.PI, 0, 0]);
      B.add(new THREE.CylinderGeometry(R, R, 1.6, 7), '#8fe08a', [x, y + 0.8, z]);
      for (let k = 0; k < 3; k++) B.addRaw(translate(P.tree('#5fd06a', '#8fe88a'), x + (r() - 0.5) * R, y + 1.4, z + (r() - 0.5) * R, 0.8 + r() * 0.5));
    }
    const m = new THREE.Mesh(B.build(), toonMat({ vertexColors: true }));
    this.group.add(m);
  }

  _ferrisWheel() {
    const spots = this._scatter(1, 30, 80, 30);
    if (!spots.length) return;
    const [x, z] = spots[0];
    const y0 = -6;
    const base = new GeoBuilder();
    base.add(new THREE.CylinderGeometry(9, 12, 6, 10), '#ffffff', [0, 0, 0]);
    for (const s of [-1, 1]) base.add(new THREE.CylinderGeometry(0.6, 0.8, 26, 6), '#ff8fc7', [s * 6, 13, 0], [0, 0, s * 0.22]);
    const bm = new THREE.Mesh(base.build(), this.propMat);
    bm.position.set(x, y0, z);
    this.group.add(bm);
    const W = new GeoBuilder();
    W.add(new THREE.TorusGeometry(18, 0.5, 6, 40), '#ffd23f', [0, 0, 0]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      W.add(new THREE.BoxGeometry(0.3, 18, 0.3), '#ffffff', [Math.cos(a) * 9, Math.sin(a) * 9, 0], [0, 0, a + Math.PI / 2]);
      W.add(new THREE.BoxGeometry(2.4, 2, 2), ['#ff5a5f', '#36a9ff', '#19e3b1', '#b07aff'][k % 4], [Math.cos(a) * 18, Math.sin(a) * 18 - 1.4, 0]);
    }
    const wheel = new THREE.Mesh(W.build(), this.propMat);
    wheel.position.set(x, y0 + 26, z);
    wheel.rotation.y = this.r() * 3;
    this.group.add(wheel);
    this.animated.push((dt) => { wheel.rotateZ(dt * 0.15); });
  }

  _neonRings() {
    const tr = this.track;
    const mat = new THREE.MeshBasicMaterial({ color: '#ff3dc8', fog: true });
    const mat2 = new THREE.MeshBasicMaterial({ color: '#39f5ff', fog: true });
    for (let k = 0; k < 6; k++) {
      const s = tr.length * (0.12 + k * 0.14);
      const fr = tr.frame(s, {});
      const m = new THREE.Mesh(new THREE.TorusGeometry(fr.wd + 2, 0.45, 6, 40), k % 2 ? mat : mat2);
      m.position.set(fr.x, tr.heightAtFrame(fr, 0) + 2, fr.z);
      m.rotation.y = Math.atan2(fr.tx, fr.tz);
      this.group.add(m);
      const ph = k;
      this.animated.push((dt, t) => { m.scale.setScalar(1 + Math.sin(t * 2 + ph) * 0.03); });
    }
  }

  _planet(c1, c2) {
    const tr = this.track;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: c1, fog: false }));
    planet.position.set(tr.center.x - 350, 180, tr.center.z - 420);
    this.group.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(80, 110, 48), new THREE.MeshBasicMaterial({ color: c2, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false }));
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
        const dist = tr.radius + (th.seaNear ? 330 : 300) + r() * 160;
        const h = 70 + r() * 130;
        const rad = 60 + r() * 70;
        const geo = th.mesa ? new THREE.CylinderGeometry(rad * 0.7, rad, h * 0.6, 7, 3) : new THREE.ConeGeometry(rad, h, 7, 4);
        const g = geo.toNonIndexed();
        const pos = g.attributes.position;
        const col = new Float32Array(pos.count * 3);
        const hh = th.mesa ? h * 0.6 : h;
        for (let i = 0; i < pos.count; i++) {
          const f = clamp((pos.getY(i) + hh / 2) / hh, 0, 1);
          const idx = Math.min(cols.length - 1, Math.floor(f * cols.length * 0.999));
          const c = th.mesa ? cols[(idx + k) % cols.length] : f > 0.78 ? cols[cols.length - 1] : cols[Math.min(idx, cols.length - 2)];
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.translate(tr.center.x + Math.cos(a) * dist, hh / 2 - 6, tr.center.z + Math.sin(a) * dist);
        B.addRaw(g);
      }
      this.group.add(new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    }
    if (th.volcano) {
      // The big volcano with a glowing crater.
      const a = 0.8;
      const d = tr.radius + 260;
      const x = tr.center.x + Math.cos(a) * d, z = tr.center.z + Math.sin(a) * d;
      const B = new GeoBuilder();
      B.add(new THREE.CylinderGeometry(40, 170, 170, 9, 4), '#3a2f31', [0, 85, 0]);
      B.add(new THREE.CylinderGeometry(36, 40, 6, 9), '#ff5a1a', [0, 170, 0]);
      const m = new THREE.Mesh(B.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      m.position.set(x, -6, z);
      this.group.add(m);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 0.5, 18), new THREE.MeshBasicMaterial({ color: '#ffb03a', fog: false }));
      glow.position.set(x, 168, z);
      this.group.add(glow);
      const smoke = new GeoBuilder();
      for (let k = 0; k < 7; k++) smoke.add(new THREE.IcosahedronGeometry(18 + k * 5, 1), k < 2 ? '#6b5a5a' : '#4a3f40', [Math.sin(k) * 14, 185 + k * 22, Math.cos(k * 1.3) * 12]);
      const sm = new THREE.Mesh(smoke.build(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
      sm.position.set(x, 0, z);
      this.group.add(sm);
      this.animated.push((dt) => { sm.rotation.y += dt * 0.05; });
    }
    if (th.clouds) {
      const B = new GeoBuilder();
      for (let k = 0; k < 5; k++) B.add(new THREE.IcosahedronGeometry(1, 1), '#ffffff', [(k - 2) * 1.5, Math.sin(k) * 0.3, (k % 2) * 0.6], [0, 0, 0], 1 + (k % 3) * 0.3);
      const geo = B.build();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.45 });
      const n = th.clouds;
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = tr.radius * 0.3 + r() * (tr.radius + 280);
        const s = 6 + r() * 8;
        const y = th.floating ? (r() < 0.5 ? -40 + r() * 20 : 60 + r() * 80) : 80 + r() * 70;
        m.compose(new THREE.Vector3(tr.center.x + Math.cos(a) * d, y, tr.center.z + Math.sin(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(s, s * 0.55, s));
        mesh.setMatrixAt(i, m);
      }
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.clouds = mesh;
    }
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.sky.position.copy(camera.position);
    for (const m of this.waterMats) m.uniforms.time.value = this.time;
    if (this.padTex) this.padTex.offset.y = (this.padTex.offset.y - dt * 1.6) % 1;
    for (const f of this.animated) f(dt, this.time);
    if (this.clouds) this.clouds.rotation.y += dt * 0.002;
    if (focus && this.sun.castShadow) {
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

function translate(geo, x, y, z, s = 1) {
  geo.scale(s, s, s);
  geo.translate(x, y, z);
  return geo;
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
  cow() {
    const B = new GeoBuilder();
    B.add(new THREE.BoxGeometry(1.4, 1.2, 2.4), '#ffffff', [0, 1.3, 0]);
    B.add(new THREE.BoxGeometry(1.42, 0.7, 0.9), '#2a2438', [0, 1.5, 0.3]);
    B.add(new THREE.BoxGeometry(0.9, 0.9, 1), '#ffffff', [0, 1.7, 1.5]);
    B.add(new THREE.BoxGeometry(0.95, 0.45, 0.4), '#ffb3c6', [0, 1.45, 2.05]);
    for (const x of [-0.5, 0.5]) for (const z of [-0.8, 0.8]) B.add(new THREE.BoxGeometry(0.3, 0.8, 0.3), '#2a2438', [x, 0.4, z]);
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
  deadTree() {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(0.3, 0.5, 5, 5), '#1f1a1b', [0, 2.5, 0]);
    B.add(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 4), '#1f1a1b', [0.8, 4, 0], [0, 0, -0.9]);
    B.add(new THREE.CylinderGeometry(0.12, 0.2, 2, 4), '#1f1a1b', [-0.7, 3.4, 0.2], [0.2, 0, 0.9]);
    B.add(new THREE.SphereGeometry(0.25, 5, 4), '#ff7a1a', [1.5, 4.8, 0]);
    return B.build();
  },
  vent() {
    const B = new GeoBuilder();
    B.add(new THREE.ConeGeometry(1.6, 1.8, 7), '#2b2527', [0, 0.7, 0]);
    B.add(new THREE.CylinderGeometry(0.6, 0.8, 0.4, 7), '#ff7a1a', [0, 1.5, 0]);
    B.add(new THREE.SphereGeometry(0.45, 6, 4), '#ffd23f', [0, 1.8, 0]);
    return B.build();
  },
  palm() {
    return P.palmAt(0, 0, 0, 1, 0);
  },
  palmAt(x, y, z, s, rot) {
    const B = new GeoBuilder();
    for (let k = 0; k < 6; k++) B.add(new THREE.CylinderGeometry(0.34, 0.42, 1.4, 6), k % 2 ? '#a0703f' : '#8a5a36', [k * 0.18, 0.7 + k * 1.3, 0], [0, 0, -0.12]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      B.add(new THREE.ConeGeometry(0.7, 4.2, 4), k % 2 ? '#3fae52' : '#2f9444', [1.1 + Math.cos(a) * 1.7, 8.1, Math.sin(a) * 1.7], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], [1, 1, 0.35]);
    }
    B.add(new THREE.SphereGeometry(0.35, 6, 4), '#6b4a2a', [1.0, 7.9, 0.3]);
    const g = B.build();
    g.rotateY(rot);
    g.scale(s, s, s);
    g.translate(x, y, z);
    return g;
  },
  umbrella() {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(0.1, 0.1, 4, 5), '#ffffff', [0, 2, 0]);
    B.add(new THREE.ConeGeometry(2.6, 1.1, 10), '#ffffff', [0, 4.1, 0]);
    B.add(new THREE.BoxGeometry(1.2, 0.2, 2.4), '#ffffff', [1.6, 0.3, 0.4]);
    return B.build();
  },
  hut() {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(2.6, 2.6, 3, 8), '#e8c68a', [0, 1.5, 0]);
    B.add(new THREE.ConeGeometry(3.6, 2.8, 8), '#c9a25a', [0, 4.4, 0]);
    B.add(new THREE.BoxGeometry(1.2, 2, 0.3), '#6b4424', [0, 1, 2.55]);
    return B.build();
  },
  starfish() {
    const B = new GeoBuilder();
    for (let k = 0; k < 5; k++) B.add(new THREE.ConeGeometry(0.22, 0.9, 4), '#ffffff', [Math.cos(k * 1.2566) * 0.35, 0.1, Math.sin(k * 1.2566) * 0.35], [Math.PI / 2, 0, -k * 1.2566 + Math.PI / 2]);
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
  crystal(c1 = '#9fdcff', c2 = '#d7f1ff') {
    const B = new GeoBuilder();
    B.add(new THREE.OctahedronGeometry(1, 0), c1, [0, 1.6, 0], [0, 0, 0], [0.6, 1.8, 0.6]);
    B.add(new THREE.OctahedronGeometry(0.7, 0), c2, [0.7, 0.9, 0.2], [0, 0, 0.4], [0.5, 1.4, 0.5]);
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
  lollipop() {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(0.2, 0.2, 7, 6), '#ffffff', [0, 3.5, 0]);
    B.add(new THREE.CylinderGeometry(2.4, 2.4, 0.6, 20), '#ffffff', [0, 8.6, 0], [Math.PI / 2, 0, 0]);
    B.add(new THREE.TorusGeometry(1.5, 0.3, 6, 20), '#ffffff', [0, 8.6, 0.32]);
    B.add(new THREE.TorusGeometry(0.7, 0.25, 6, 16), '#ffffff', [0, 8.6, 0.32]);
    return B.build();
  },
  candyCane() {
    const B = new GeoBuilder();
    for (let k = 0; k < 8; k++) B.add(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 8), k % 2 ? '#ffffff' : '#ff3d6a', [0, 0.4 + k * 0.8, 0]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      B.add(new THREE.SphereGeometry(0.47, 8, 6), k % 2 ? '#ffffff' : '#ff3d6a', [1.2 - Math.cos(a) * 1.2, 6.8 + Math.sin(a) * 1.2, 0]);
    }
    return B.build();
  },
  gumdrop() {
    const B = new GeoBuilder();
    B.add(new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', [0, 0, 0], [0, 0, 0], [1, 1.3, 1]);
    return B.build();
  },
  cupcake() {
    const B = new GeoBuilder();
    B.add(new THREE.CylinderGeometry(1.8, 1.3, 2, 12), '#ff8fc7', [0, 1, 0]);
    B.add(new THREE.SphereGeometry(1.9, 12, 8), '#ffffff', [0, 2.3, 0], [0, 0, 0], [1, 0.7, 1]);
    B.add(new THREE.SphereGeometry(0.45, 8, 6), '#e8413c', [0, 3.6, 0]);
    return B.build();
  },
  donut() {
    const B = new GeoBuilder();
    B.add(new THREE.TorusGeometry(2, 0.95, 10, 20), '#e0a860', [0, 1, 0], [Math.PI / 2, 0, 0]);
    B.add(new THREE.TorusGeometry(2, 0.7, 8, 20), '#ffffff', [0, 1.45, 0], [Math.PI / 2, 0, 0], [1, 1, 0.6]);
    return B.build();
  },
  cloudPuff() {
    const B = new GeoBuilder();
    B.add(new THREE.IcosahedronGeometry(1.4, 1), '#ffffff', [0, 0, 0]);
    B.add(new THREE.IcosahedronGeometry(1.1, 1), '#ffffff', [1.3, -0.2, 0.3]);
    B.add(new THREE.IcosahedronGeometry(1, 1), '#ffffff', [-1.2, -0.3, -0.2]);
    return B.build();
  },
};
