import * as THREE from 'three';
import { clamp, lerp } from './util.js';

// A closed racing circuit defined by a Catmull-Rom spline. Everything about the
// track (road surface, walls, banking, racing line) is derived from evenly
// spaced samples, and karts are simulated in "track space" (distance along the
// track + lateral offset), which is cheap and very robust.
export class Track {
  constructor(def, reverse = false) {
    this.def = def;
    this.reverse = reverse;
    this.roadW = def.width ?? 17;
    this.halfRoad = this.roadW / 2;
    this.curbW = 1.3;
    this.shoulder = def.shoulder ?? 6;
    this.edgeD = this.halfRoad + this.curbW;
    this.wallD = this.edgeD + this.shoulder;
    this.wallH = def.wallH ?? 1.3;

    let pts = def.points.map((p) => new THREE.Vector3(p[0], p[2] ?? 0, p[1]));
    if (reverse) pts = [pts[0], ...pts.slice(1).reverse()];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = 4000;
    const len = curve.getLength();
    const N = Math.round(len / 2);
    const sp = curve.getSpacedPoints(N);
    this.N = N;
    this.length = len;
    this.ds = len / N;

    const px = (this.px = new Float32Array(N));
    const py = (this.py = new Float32Array(N));
    const pz = (this.pz = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      px[i] = sp[i].x;
      py[i] = Math.max(0, sp[i].y);
      pz[i] = sp[i].z;
    }
    // Smooth heights a little so hills never have kinks.
    this._smoothInPlace(py, 3);

    const tx = (this.tx = new Float32Array(N));
    const tz = (this.tz = new Float32Array(N));
    const rx = (this.rx = new Float32Array(N));
    const rz = (this.rz = new Float32Array(N));
    const grade = (this.grade = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      let dx = px[b] - px[a];
      let dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      tx[i] = dx;
      tz[i] = dz;
      rx[i] = -dz;
      rz[i] = dx;
      grade[i] = (py[b] - py[a]) / (2 * this.ds);
    }

    // Signed curvature (negative = right-hand turn).
    const curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      const cross = tz[a] * tx[b] - tx[a] * tz[b];
      const dot = tx[a] * tx[b] + tz[a] * tz[b];
      curv[i] = Math.atan2(cross, dot) / (2 * this.ds);
    }
    this.curv = this._smooth(curv, 3);
    const curvWide = this._smooth(curv, 16);
    this.curvWide = curvWide;

    const bankK = def.bank ?? 3.0;
    const slope = new Float32Array(N);
    for (let i = 0; i < N; i++) slope[i] = clamp(curvWide[i] * bankK, -0.09, 0.09);
    this.slope = this._smooth(slope, 6);

    // Racing line: hug the inside of corners.
    const lim = this.halfRoad - 2.6;
    const rl = new Float32Array(N);
    for (let i = 0; i < N; i++) rl[i] = clamp(-curvWide[i] * 330, -lim, lim);
    this.racingLine = this._smooth(rl, 10);

    // Features (positions given as fractions of a lap in the definition).
    const f = (at) => (reverse ? (1 - at + 1) % 1 : at) * len;
    const sd = (d) => (reverse ? -d : d);
    this.ramps = (def.ramps || []).map((r) => {
      const l = r.len ?? 8;
      // In reverse, keep the ramp at the same spot but make it rise the other way.
      const start = reverse ? (f(r.at) - l + len) % len : f(r.at);
      return { s: start, len: l, h: r.h ?? 1.7 };
    });
    this.boosts = (def.boosts || []).map((b) => ({ s: f(b.at), d: sd(b.d ?? 0), len: 7, w: 4.6 }));
    this.itemRows = (def.items || []).map((at) => f(at));
    this.gemLines = (def.gems || []).map((g) => ({ s: f(g.at), d: sd(g.d ?? 0), n: g.n ?? 5 }));

    // Bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, px[i]);
      maxX = Math.max(maxX, px[i]);
      minZ = Math.min(minZ, pz[i]);
      maxZ = Math.max(maxZ, pz[i]);
      maxY = Math.max(maxY, py[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ, maxY };
    this.center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.radius = Math.max(maxX - minX, maxZ - minZ) / 2;
  }

  _smooth(arr, r) {
    const N = arr.length;
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += arr[(i + k + N) % N];
      out[i] = s / (2 * r + 1);
    }
    return out;
  }

  _smoothInPlace(arr, r) {
    const s = this._smooth(arr, r);
    arr.set(s);
  }

  // Ground height at sample i and lateral offset d (excluding ramps).
  yAt(i, d) {
    const sl = this.slope[i];
    return this.py[i] + sl * d + Math.abs(sl) * this.wallD;
  }

  rampHeight(s, d) {
    if (this.ramps.length === 0 || Math.abs(d) > this.halfRoad) return 0;
    for (const r of this.ramps) {
      let u = s - r.s;
      if (u < 0) u += this.length;
      if (u >= 0 && u <= r.len) {
        const k = u / r.len;
        return r.h * k * k * 0.35 + r.h * k * 0.65;
      }
    }
    return 0;
  }

  // Interpolated frame at distance s along the track.
  frame(s, out) {
    const N = this.N;
    s = ((s % this.length) + this.length) % this.length;
    const fi = s / this.ds;
    const i = Math.floor(fi) % N;
    const j = (i + 1) % N;
    const t = fi - Math.floor(fi);
    out.i = i;
    out.t = t;
    out.s = s;
    out.x = lerp(this.px[i], this.px[j], t);
    out.z = lerp(this.pz[i], this.pz[j], t);
    out.baseY = lerp(this.py[i], this.py[j], t);
    let rxv = lerp(this.rx[i], this.rx[j], t);
    let rzv = lerp(this.rz[i], this.rz[j], t);
    const l = Math.hypot(rxv, rzv) || 1;
    out.rx = rxv / l;
    out.rz = rzv / l;
    out.tx = out.rz;
    out.tz = -out.rx;
    out.slope = lerp(this.slope[i], this.slope[j], t);
    out.grade = lerp(this.grade[i], this.grade[j], t);
    return out;
  }

  heightAtFrame(fr, d) {
    return fr.baseY + fr.slope * d + Math.abs(fr.slope) * this.wallD + this.rampHeight(fr.s, d);
  }

  // World position of (s, d). Writes into a Vector3.
  pointAt(s, d, v, fr = _fr) {
    this.frame(s, fr);
    v.set(fr.x + fr.rx * d, this.heightAtFrame(fr, d), fr.z + fr.rz * d);
    return v;
  }

  // Project a world point onto the track. `hint` is the last known sample
  // index (or -1 for a full search). Results are written into `out`.
  project(x, z, hint, out) {
    const N = this.N;
    const px = this.px, pz = this.pz;
    let best = 0;
    let bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < N; i++) {
        const dx = x - px[i], dz = z - pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let k = -14; k <= 14; k++) {
        const i = (hint + k + N) % N;
        const dx = x - px[i], dz = z - pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    // Refine on the two adjacent segments.
    const a1 = best, b1 = (best + 1) % N;
    const a2 = (best - 1 + N) % N, b2 = best;
    const r1 = segProj(px[a1], pz[a1], px[b1], pz[b1], x, z);
    const d1 = _segDist;
    const r2 = segProj(px[a2], pz[a2], px[b2], pz[b2], x, z);
    const d2 = _segDist;
    let a, t;
    if (d1 <= d2) { a = a1; t = r1; } else { a = a2; t = r2; }
    const s = (a + t) * this.ds;
    this.frame(s, out);
    out.d = (x - out.x) * out.rx + (z - out.z) * out.rz;
    out.y = this.heightAtFrame(out, out.d);
    out.idx = t < 0.5 ? a : (a + 1) % N;
    return out;
  }

  // ---------- Geometry helpers ----------

  // A strip of road surface between lateral offsets d0..d1 along the whole loop.
  strip(d0, d1, { vScale = 1 / 12, lift = 0, uRepeat = 1, across = 1 } = {}) {
    const N = this.N;
    const rings = N + 1;
    const cols = across + 1;
    const pos = new Float32Array(rings * cols * 3);
    const uv = new Float32Array(rings * cols * 2);
    for (let r = 0; r < rings; r++) {
      const i = r % N;
      for (let a = 0; a < cols; a++) {
        const d = d0 + ((d1 - d0) * a) / across;
        const o = r * cols + a;
        pos[o * 3] = this.px[i] + this.rx[i] * d;
        pos[o * 3 + 1] = this.yAt(i, d) + lift;
        pos[o * 3 + 2] = this.pz[i] + this.rz[i] * d;
        uv[o * 2] = (a / across) * uRepeat;
        uv[o * 2 + 1] = r * this.ds * vScale;
      }
    }
    const idx = [];
    for (let r = 0; r < N; r++) {
      for (let a = 0; a < across; a++) {
        const A = r * cols + a, B = A + 1, C = A + cols, D = C + 1;
        idx.push(A, B, C, B, D, C);
      }
    }
    return finishGeo(pos, uv, idx, [0, 1, 0]);
  }

  // A generic ribbon along the loop. fn(i, out6) writes two points per ring.
  ribbon(fn, expectedNormal, vScale = 1 / 8) {
    const N = this.N;
    const rings = N + 1;
    const pos = new Float32Array(rings * 6);
    const uv = new Float32Array(rings * 4);
    const tmp = new Float32Array(6);
    for (let r = 0; r < rings; r++) {
      fn(r % N, tmp);
      pos.set(tmp, r * 6);
      const v = r * this.ds * vScale;
      uv[r * 4] = 0; uv[r * 4 + 1] = v;
      uv[r * 4 + 2] = 1; uv[r * 4 + 3] = v;
    }
    const idx = [];
    for (let r = 0; r < N; r++) {
      const A = r * 2, B = A + 1, C = A + 2, D = A + 3;
      idx.push(A, B, C, B, D, C);
    }
    return finishGeo(pos, uv, idx, expectedNormal(0));
  }

  // A patch covering s0..s1 and d0..d1 that follows the road surface.
  patch(s0, s1, d0, d1, { lift = 0.04, segs = 0, heightFn = null } = {}) {
    const len = s1 - s0;
    const n = segs || Math.max(2, Math.ceil(len / 1.2));
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const fr = {};
    for (let k = 0; k <= n; k++) {
      const s = s0 + (len * k) / n;
      this.frame(s, fr);
      for (let a = 0; a < 2; a++) {
        const d = a === 0 ? d0 : d1;
        const o = k * 2 + a;
        const h = heightFn ? heightFn(s, d, fr) : this.heightAtFrame(fr, d);
        pos[o * 3] = fr.x + fr.rx * d;
        pos[o * 3 + 1] = h + lift;
        pos[o * 3 + 2] = fr.z + fr.rz * d;
        uv[o * 2] = a;
        uv[o * 2 + 1] = k / n;
      }
    }
    const idx = [];
    for (let k = 0; k < n; k++) {
      const A = k * 2, B = A + 1, C = A + 2, D = A + 3;
      idx.push(A, B, C, B, D, C);
    }
    return finishGeo(pos, uv, idx, [0, 1, 0]);
  }

  // Minimum distance from (x,z) to the centreline (coarse; for scenery placement).
  distToCenter(x, z) {
    let best = Infinity;
    for (let i = 0; i < this.N; i += 2) {
      const dx = x - this.px[i], dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  gridSlot(k) {
    const s = this.length - 8 - k * 3.4;
    const d = (k % 2 === 0 ? -1 : 1) * Math.min(4, this.halfRoad - 2.5);
    return { s, d };
  }
}

const _fr = {};
let _segDist = 0;
function segProj(ax, az, bx, bz, x, z) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  let t = ((x - ax) * vx + (z - az) * vz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + vx * t - x, qz = az + vz * t - z;
  _segDist = qx * qx + qz * qz;
  return t;
}

function finishGeo(pos, uv, idx, expected) {
  // Make sure the first triangle faces the expected way; flip all if not.
  const i0 = idx[0] * 3, i1 = idx[1] * 3, i2 = idx[2] * 3;
  const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2];
  const bx = pos[i2] - pos[i0], by = pos[i2 + 1] - pos[i0 + 1], bz = pos[i2 + 2] - pos[i0 + 2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  if (nx * expected[0] + ny * expected[1] + nz * expected[2] < 0) {
    for (let k = 0; k < idx.length; k += 3) {
      const t = idx[k + 1];
      idx[k + 1] = idx[k + 2];
      idx[k + 2] = t;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
