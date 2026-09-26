import * as THREE from 'three';

// Ambient weather particles (snow, petals, embers...) and wind-blown grass.
// Both run entirely on the GPU: the CPU only updates a time uniform.

const TYPES = {
  snow: { count: 1500, box: [70, 36, 70], vel: [0.8, -3.4, 0.4], sway: 0.9, size: 0.2, colors: ['#ffffff', '#e6f1ff'], k: 1.2, alpha: 0.95 },
  petals: { count: 380, box: [80, 26, 80], vel: [1.4, -1.0, 0.7], sway: 1.6, size: 0.24, colors: ['#ffc2de', '#fff4f8'], k: 1.1, alpha: 0.95 },
  dust: { count: 600, box: [80, 12, 80], vel: [4.5, 0.15, 1.2], sway: 0.6, size: 0.16, colors: ['#e9c08a', '#fff0d6'], k: 1, alpha: 0.45, near: 6 },
  sprinkles: { count: 520, box: [70, 30, 70], vel: [0.4, -1.8, 0.2], sway: 1.1, size: 0.2, rainbow: true, k: 1.1, alpha: 1 },
  motes: { count: 650, box: [80, 30, 80], vel: [0.2, 0.7, 0.1], sway: 1.3, size: 0.17, colors: ['#39f5ff', '#ff3dc8'], k: 3, additive: true, alpha: 1 },
  embers: { count: 750, box: [70, 30, 70], vel: [0.6, 3.2, 0.3], sway: 1.1, size: 0.15, colors: ['#ff5a1a', '#ffd23f'], k: 4, additive: true, alpha: 1, flicker: true },
  wisps: { count: 260, box: [80, 20, 80], vel: [0.3, 0.4, 0.2], sway: 2.2, size: 0.22, colors: ['#9dff8a', '#6fe8ff'], k: 3, additive: true, alpha: 1, flicker: true },
  jleaves: { count: 300, box: [80, 26, 80], vel: [0.8, -1.2, 0.5], sway: 1.8, size: 0.26, colors: ['#4fa83a', '#9ad85a'], k: 1, alpha: 0.95 },
  autumn: { count: 420, box: [80, 26, 80], vel: [1.6, -1.3, 0.8], sway: 1.8, size: 0.28, colors: ['#e8762a', '#d9412a'], k: 1.05, alpha: 0.95 },
  sparks: { count: 380, box: [60, 26, 60], vel: [0.4, -5.5, 0.2], sway: 0.4, size: 0.12, colors: ['#ffb13d', '#ffe07a'], k: 4, additive: true, alpha: 1, flicker: true },
  sparkles: { count: 420, box: [80, 30, 80], vel: [0.1, 0.35, 0.1], sway: 0.8, size: 0.2, colors: ['#ffffff', '#ffe9a8'], k: 2.6, additive: true, alpha: 1, flicker: true },
};

const WEATHER_VERT = /* glsl */ `
uniform float time; uniform vec3 box; uniform vec3 camPos; uniform vec3 vel; uniform float sway; uniform float size;
uniform float viewH; uniform vec3 colA; uniform vec3 colB; uniform float rainbow; uniform float flicker; uniform float near;
attribute vec2 rnd;
varying vec3 vColor; varying float vAlpha;
vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float ph = rnd.x * 6.2831;
  vec3 p = position * box + vel * time * (0.7 + 0.6 * rnd.y);
  p.x += sin(time * 0.9 + ph) * sway;
  p.z += cos(time * 0.7 + ph * 1.3) * sway;
  vec3 o = camPos - box * 0.5;
  p = mod(p - o, box) + o;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = size * (0.6 + 0.8 * rnd.y) * viewH * 0.5 * projectionMatrix[1][1] / max(dist, 0.5);
  vColor = rainbow > 0.5 ? mix(hsv(rnd.y), vec3(1.0), 0.25) : mix(colA, colB, rnd.y);
  float tw = flicker > 0.5 ? 0.55 + 0.45 * sin(time * (4.0 + rnd.x * 6.0) + ph) : 1.0;
  vAlpha = smoothstep(box.x * 0.5, box.x * 0.3, length(p.xz - camPos.xz)) * smoothstep(near * 0.3, near, dist) * tw;
}`;

const WEATHER_FRAG = /* glsl */ `
uniform float alpha;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * vAlpha * alpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export class Weather {
  constructor(type, amount = 1, theme = null) {
    this.points = null;
    const cfg = TYPES[type];
    if (!cfg || amount <= 0) return;
    const n = Math.round(cfg.count * amount);
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random();
      pos[i * 3 + 1] = Math.random();
      pos[i * 3 + 2] = Math.random();
      rnd[i * 2] = Math.random();
      rnd[i * 2 + 1] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 2));
    const cols = cfg.colors || ['#ffffff', '#ffffff'];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: WEATHER_VERT, fragmentShader: WEATHER_FRAG,
      uniforms: {
        time: { value: Math.random() * 100 }, box: { value: new THREE.Vector3(...cfg.box) }, camPos: { value: new THREE.Vector3() },
        vel: { value: new THREE.Vector3(...cfg.vel) }, sway: { value: cfg.sway }, size: { value: cfg.size }, viewH: { value: 800 },
        colA: { value: new THREE.Color(cols[0]).multiplyScalar(cfg.k) }, colB: { value: new THREE.Color(cols[1]).multiplyScalar(cfg.k) },
        rainbow: { value: cfg.rainbow ? 1 : 0 }, flicker: { value: cfg.flicker ? 1 : 0 }, alpha: { value: cfg.alpha }, near: { value: cfg.near || 3 },
      },
      transparent: true, depthWrite: false,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewH(h) {
    if (this.points) this.mat.uniforms.viewH.value = h;
  }

  update(dt, camera) {
    if (!this.points) return;
    this.mat.uniforms.time.value += dt;
    this.mat.uniforms.camPos.value.copy(camera.position);
  }
}

// A clump of three crossed blades, darker at the root.
function tuftGeometry(dark, light) {
  const pos = [], col = [], nor = [];
  const c0 = new THREE.Color(dark), c1 = new THREE.Color(light);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (const off of [-0.22, 0.22]) {
      const bx = ca * off, bz = sa * off;
      const h = 0.75 + Math.abs(off) + k * 0.12;
      const lean = 0.18 * (k - 1);
      // one blade: triangle, base width 0.16
      pos.push(bx - ca * 0.08, 0, bz - sa * 0.08, bx + ca * 0.08, 0, bz + sa * 0.08, bx + lean, h, bz + lean * 0.5);
      col.push(c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
      // normals mostly up so the tufts pick up sky light like the ground does
      for (let q = 0; q < 3; q++) nor.push(-sa * 0.35, 0.93, ca * 0.35);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class Grass {
  constructor(colors, spots, receiveShadow) {
    this.time = { value: 0 };
    const geo = tuftGeometry(colors[0], colors[1]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 ip = instanceMatrix[3].xz;
          #else
            vec2 ip = vec2(0.0);
          #endif
          float gph = uTime * 1.9 + ip.x * 0.13 + ip.y * 0.09;
          float gh = max(position.y, 0.0);
          transformed.x += (sin(gph) * 0.7 + sin(gph * 2.3) * 0.3) * gh * 0.2;
          transformed.z += cos(gph * 0.8) * gh * 0.12;`);
    };
    mat.customProgramCacheKey = () => 'grass1';
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, y], i) => {
      q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
      const k = 0.7 + Math.random() * 0.8;
      s.set(k, k * (0.8 + Math.random() * 0.6), k);
      p.set(x, (y ?? -0.25) + 0.02, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = receiveShadow;
    this.mesh = mesh;
  }

  update(dt) {
    this.time.value += dt;
  }
}
