import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Small, fast, seedable PRNG (mulberry32).
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick(r, arr) {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Collects primitive parts, bakes a colour into each as a vertex attribute and
// merges everything into one BufferGeometry. One mesh = one draw call.
export class GeoBuilder {
  // defaultMat: the MAT preset used by add() when no material is given.
  constructor(defaultMat = null) {
    this.parts = [];
    this.mat = defaultMat;
  }

  // mat: a MAT preset name or [roughness, metalness, emissive]; read by pbrMat().
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, mat = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _p.set(pos[0], pos[1], pos[2]);
    if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]);
    else _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = _c.r;
      cols[i * 3 + 1] = _c.g;
      cols[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const pb = matOf(mat ?? this.mat);
    const pbr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pbr[i * 3] = pb[0];
      pbr[i * 3 + 1] = pb[1];
      pbr[i * 3 + 2] = pb[2];
    }
    g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 3));
    this.parts.push(g);
    return this;
  }

  // Add a pre-transformed geometry with its own vertex colours.
  addRaw(g) {
    this.parts.push(g.index ? g.toNonIndexed() : g);
    return this;
  }

  build() {
    let n = 0;
    for (const g of this.parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const pbr = new Float32Array(n * 3);
    const def = matOf(this.mat);
    let o = 0;
    for (const g of this.parts) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o);
      nor.set(g.attributes.normal.array, o);
      if (g.attributes.color) col.set(g.attributes.color.array, o);
      else col.fill(1, o, o + c * 3);
      if (g.attributes.pbr) pbr.set(g.attributes.pbr.array, o);
      else for (let i = o; i < o + c * 3; i += 3) { pbr[i] = def[0]; pbr[i + 1] = def[1]; pbr[i + 2] = def[2]; }
      o += c * 3;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('pbr', new THREE.BufferAttribute(pbr, 3));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    this.parts.length = 0;
    return out;
  }
}

// Surface presets: [roughness, metalness, emissive multiplier of the vertex colour].
export const MAT = {
  paint: [0.32, 0.05, 0],
  metal: [0.3, 1, 0],
  chrome: [0.12, 1, 0],
  rubber: [0.88, 0, 0],
  plastic: [0.45, 0, 0],
  matte: [0.8, 0, 0],
  fur: [0.78, 0, 0],
  skin: [0.55, 0, 0],
  gloss: [0.1, 0, 0],
  eye: [0.05, 0, 0],
  glow: [0.5, 0, 2.2],
  glowHot: [0.4, 0, 5],
  leaf: [0.72, 0, 0],
  wood: [0.85, 0, 0],
  stone: [0.9, 0, 0],
  snow: [0.5, 0, 0],
  ice: [0.1, 0, 0.12],
  candy: [0.18, 0, 0],
  frosting: [0.55, 0, 0],
  fabric: [0.95, 0, 0],
};
const DEF_MAT = [0.8, 0, 0];
function matOf(m) {
  if (!m) return DEF_MAT;
  if (Array.isArray(m)) return m;
  return MAT[m] || DEF_MAT;
}

// Physically based material driven by the per-vertex "pbr" attribute that
// GeoBuilder writes, so one draw call can mix paint, rubber, chrome and lights.
export function pbrMat(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 pbr;\nvarying vec3 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbr;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vPbr.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vPbr.y;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * vPbr.z;');
  };
  m.customProgramCacheKey = () => 'pbr1';
  return m;
}

// Plain physically based material for textured or single-colour surfaces.
export function stdMat(opts = {}) {
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.userData && m.userData.shared) continue;
      for (const k of ['map', 'emissiveMap', 'alphaMap']) {
        if (m[k] && !(m[k].userData && m[k].userData.shared)) m[k].dispose();
      }
      m.dispose();
    }
  });
}

export function ordinal(n) {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function fmtTime(t) {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
