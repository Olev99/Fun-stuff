import * as THREE from 'three';

// Tyre marks left while drifting or braking hard. One ring buffer of quads
// for every kart; old marks fade out in the shader and are overwritten.

const VERT = /* glsl */ `
#include <fog_pars_vertex>
attribute vec2 info; // alpha, birth time
uniform float time; uniform float life;
varying float vA;
void main() {
  float age = time - info.y;
  vA = info.x * (1.0 - smoothstep(life * 0.6, life, age));
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 color;
varying float vA;
void main() {
  gl_FragColor = vec4(color, vA);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class SkidMarks {
  constructor(max = 1200, color = '#1a1418') {
    this.max = max;
    this.head = 0;
    this.time = 0;
    this.last = new Map();
    const pos = new Float32Array(max * 4 * 3);
    const info = new Float32Array(max * 4 * 2);
    for (let i = 0; i < max * 4; i++) info[i * 2 + 1] = -1e4;
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4;
      idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.info = new THREE.BufferAttribute(info, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('info', this.info);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: { value: 0 }, life: { value: 16 }, color: { value: new THREE.Color(color) },
      }]),
      transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.dirtyA = Infinity;
    this.dirtyB = -1;
  }

  // Extend the trail `key` to (x, y, z) heading along (dx, dz).
  add(key, x, y, z, dx, dz, width = 0.34, alpha = 0.42) {
    const hw = width / 2;
    const lx = x - dz * hw, lz = z + dx * hw, rx = x + dz * hw, rz = z - dx * hw;
    const prev = this.last.get(key);
    if (prev) {
      const d2 = (x - prev.x) ** 2 + (z - prev.z) ** 2;
      if (d2 < 0.3 * 0.3) return;
      if (d2 < 4 * 4 && Math.abs(y - prev.y) < 1) {
        const i = this.head;
        const p = this.pos.array, f = this.info.array;
        p.set([prev.lx, prev.y, prev.lz, prev.rx, prev.y, prev.rz, lx, y, lz, rx, y, rz], i * 12);
        const t = this.time;
        f.set([prev.a, t, prev.a, t, alpha, t, alpha, t], i * 8);
        this.dirtyA = Math.min(this.dirtyA, i);
        this.dirtyB = Math.max(this.dirtyB, i);
        this.head = (i + 1) % this.max;
      }
    }
    this.last.set(key, { x, y, z, lx, lz, rx, rz, a: alpha });
  }

  // Lift the tyre: the next add() starts a new trail.
  lift(key) {
    this.last.delete(key);
  }

  update(dt) {
    this.time += dt;
    this.mat.uniforms.time.value = this.time;
    if (this.dirtyB >= 0) {
      const a = this.dirtyA, n = this.dirtyB - a + 1;
      this.pos.clearUpdateRanges();
      this.pos.addUpdateRange(a * 12, n * 12);
      this.pos.needsUpdate = true;
      this.info.clearUpdateRanges();
      this.info.addUpdateRange(a * 8, n * 8);
      this.info.needsUpdate = true;
      this.dirtyA = Infinity;
      this.dirtyB = -1;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
