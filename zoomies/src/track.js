import * as THREE from 'three';
import { clamp, lerp } from './util.js';

// A drivable corridor defined by a Catmull-Rom spline: either the closed main
// loop or an open shortcut branch. Karts are simulated in "path space"
// (distance along the path + lateral offset), which makes walls, banking,
// ramps and AI cheap and robust.
export class Path {
  constructor(pts, opts = {}) {
    const closed = (this.closed = opts.closed !== false);
    this.width = opts.width ?? 17;
    this.curbW = opts.curb ?? 1.3;
    this.shoulder = opts.shoulder ?? 6;
    this.wallH = opts.wallH ?? 1.3;
    this.offroadAll = !!opts.offroad;
    this.gripMul = opts.grip ?? 1;

    const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
    curve.arcLengthDivisions = Math.max(3000, pts.length * 300);
    const len = curve.getLength();
    const segs = Math.max(6, Math.round(len / (opts.step ?? 2)));
    const sp = curve.getSpacedPoints(segs);
    const count = closed ? segs : segs + 1;
    this.count = count;
    this.N = count;
    this.segs = segs;
    this.length = len;
    this.ds = len / segs;

    const A = () => new Float32Array(count);
    const px = (this.px = A()), py = (this.py = A()), pz = (this.pz = A());
    for (let i = 0; i < count; i++) {
      px[i] = sp[i].x;
      py[i] = sp[i].y;
      pz[i] = sp[i].z;
    }
    if (opts.minY !== undefined) for (let i = 0; i < count; i++) py[i] = Math.max(opts.minY, py[i]);
    this._smoothInPlace(py, 3);

    const tx = (this.tx = A()), tz = (this.tz = A()), rx = (this.rx = A()), rz = (this.rz = A()), grade = (this.grade = A());
    for (let i = 0; i < count; i++) {
      const a = this.I(i - 1), b = this.I(i + 1);
      let dx = px[b] - px[a], dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      tx[i] = dx; tz[i] = dz;
      rx[i] = -dz; rz[i] = dx;
      const span = closed ? 2 : Math.max(1, b - a);
      grade[i] = (py[b] - py[a]) / (span * this.ds);
    }

    // The sample nearest each control point (searched forwards, so a
    // road that crosses itself still finds the right pass).
    const cp = (this.cpIdx = []);
    let from = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      let best = from, bd = Infinity;
      const end = k === 0 ? Math.min(count, 8) : count;
      for (let i = k === 0 ? 0 : from; i < end; i++) {
        const d = (px[i] - p.x) ** 2 + (pz[i] - p.z) ** 2 + (py[i] - p.y) ** 2 * 0.01;
        if (d < bd) { bd = d; best = i; }
        if (d > bd + 1e4 && bd < 25) break;
      }
      cp.push(best);
      from = best;
    }
    // Width multipliers per control point -> per sample.
    const mult = new Float32Array(count).fill(1);
    if (opts.widths && opts.widths.some((w) => w !== 1)) {
      const K = pts.length;
      const last = closed ? K : K - 1;
      for (let k = 0; k < last; k++) {
        const a = cp[k];
        let b = k + 1 < K ? cp[k + 1] : cp[0] + count;
        if (b <= a) b += closed ? count : 0;
        const w0 = opts.widths[k], w1 = opts.widths[(k + 1) % K];
        for (let i = a; i <= b; i++) mult[this.I(i)] = lerp(w0, w1, b > a ? (i - a) / (b - a) : 0);
      }
      mult.set(this._smooth(mult, 10));
    }
    const hw = (this.hw = A()), ed = (this.ed = A()), wd = (this.wd = A());
    for (let i = 0; i < count; i++) {
      hw[i] = (this.width / 2) * mult[i];
      ed[i] = hw[i] + this.curbW;
      wd[i] = ed[i] + this.shoulder;
    }
    this.halfRoad = this.width / 2;
    this.maxWallD = Math.max(...wd);
    this.wallD = this.maxWallD;
    this.edgeD = this.halfRoad + this.curbW;

    // Signed curvature (negative = right-hand turn).
    const curv = A();
    for (let i = 0; i < count; i++) {
      const a = this.I(i - 1), b = this.I(i + 1);
      const cross = tz[a] * tx[b] - tx[a] * tz[b];
      const dot = tx[a] * tx[b] + tz[a] * tz[b];
      const span = closed ? 2 : Math.max(1, b - a);
      curv[i] = Math.atan2(cross, dot) / (span * this.ds);
    }
    this.curv = this._smooth(curv, 3);
    this.curvWide = this._smooth(curv, 16);

    // A bend tighter than the wall offset would fold the inside wall over
    // itself and leave a pocket karts can get wedged in: pull both walls in.
    const cap = A();
    for (let i = 0; i < count; i++) cap[i] = Math.max(ed[i] + 1.2, 0.9 / Math.max(1e-4, Math.abs(curv[i])));
    const reach = Math.ceil(12 / this.ds);
    let capped = false;
    for (let i = 0; i < count; i++) {
      let m = Infinity;
      for (let k = -reach; k <= reach; k++) m = Math.min(m, cap[this.I(i + k)]);
      if (m < wd[i]) { wd[i] = m; capped = true; }
    }
    if (capped) {
      const sm = this._smooth(wd, 3);
      for (let i = 0; i < count; i++) wd[i] = Math.max(ed[i] + 1.2, Math.min(wd[i], sm[i]));
    }

    const bankK = opts.bank ?? 3.0;
    const slope = A();
    for (let i = 0; i < count; i++) slope[i] = clamp(this.curvWide[i] * bankK, -0.09, 0.09);
    this.slope = this._smooth(slope, 6);

    // Racing line: hug the inside of corners.
    const rl = A();
    for (let i = 0; i < count; i++) {
      const lim = Math.max(0, hw[i] - 2.6);
      rl[i] = clamp(-this.curvWide[i] * 330, -lim, lim);
    }
    this.racingLine = this._smooth(rl, 10);

    this.ramps = [];
    this.boosts = [];
    this.patches = [];
    this.voids = [];
    this.speedMul = 1;
    this.bridge = new Uint8Array(count);
    this.gap = [new Uint8Array(count), new Uint8Array(count)]; // [left(-1), right(+1)] -> shortcut id + 1
    this.gapOwners = [new Array(count), new Array(count)]; // every shortcut id using each opening
    this.noWall = [new Uint8Array(count), new Uint8Array(count)];
    // Vehicle zones: stretches where every kart turns into a boat (water) or
    // a plane (sky). zoneT holds the zone per sample (0 road, 1 water, 2 sky).
    this.zones = [];
    this.zoneT = new Uint8Array(count);
  }

  // 0 on the road, 1 on water, 2 in the sky.
  zoneAt(s) {
    if (!this.zones.length) return 0;
    for (const z of this.zones) {
      let u = s - z.s0;
      if (this.closed && u < 0) u += this.length;
      if (u >= 0 && u <= z.len) return z.kind;
    }
    return 0;
  }

  // How far s is inside its zone (metres to the nearest zone edge), or 0.
  zoneDepth(s) {
    for (const z of this.zones) {
      let u = s - z.s0;
      if (this.closed && u < 0) u += this.length;
      if (u >= 0 && u <= z.len) return Math.min(u, z.len - u);
    }
    return 0;
  }

  _setZones(list) {
    this.zones = list.filter((z) => z.len > 0);
    for (let i = 0; i < this.count; i++) this.zoneT[i] = this.zoneAt(i * this.ds);
    if (!this.zones.length) return;
    // Rivers and sky lanes are flat across (no banking) and have no grass
    // shoulder to slow you down.
    const k = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) k[i] = this.zoneT[i] ? 0 : 1;
    const ks = this._smooth(k, 4);
    for (let i = 0; i < this.count; i++) this.slope[i] *= ks[i];
  }

  isVoid(s) {
    for (const v of this.voids) if (s >= v.s0 && s <= v.s1) return true;
    return false;
  }

  I(i) {
    const c = this.count;
    if (this.closed) return ((i % c) + c) % c;
    return i < 0 ? 0 : i >= c ? c - 1 : i;
  }

  _smooth(arr, r) {
    const n = arr.length;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += arr[this.I(i + k)];
      out[i] = s / (2 * r + 1);
    }
    return out;
  }

  _smoothInPlace(arr, r) {
    arr.set(this._smooth(arr, r));
  }

  wrapS(s) {
    return this.closed ? ((s % this.length) + this.length) % this.length : clamp(s, 0, this.length);
  }

  yAt(i, d) {
    const sl = this.slope[i];
    return this.py[i] + sl * d + Math.abs(sl) * this.wd[i];
  }

  rampAt(s, d) {
    if (this.ramps.length === 0) return null;
    for (const r of this.ramps) {
      if (Math.abs(d) > (r.halfW ?? 999)) continue;
      let u = s - r.s;
      if (this.closed && u < 0) u += this.length;
      if (u >= 0 && u <= r.len) return r;
    }
    return null;
  }

  rampHeight(s, d) {
    if (this.ramps.length === 0) return 0;
    for (const r of this.ramps) {
      if (Math.abs(d) > (r.halfW ?? 999)) continue;
      let u = s - r.s;
      if (this.closed && u < 0) u += this.length;
      if (u >= 0 && u <= r.len) {
        const k = u / r.len;
        return r.h * k * k * 0.35 + r.h * k * 0.65;
      }
    }
    return 0;
  }

  // Interpolated frame at distance s along the path.
  frame(s, out) {
    s = this.wrapS(s);
    const fi = s / this.ds;
    let i = Math.floor(fi);
    let t = fi - i;
    if (!this.closed && i >= this.segs) { i = this.segs - 1; t = 1; }
    i = this.I(i);
    const j = this.I(i + 1);
    out.i = i;
    out.t = t;
    out.s = s;
    out.x = lerp(this.px[i], this.px[j], t);
    out.z = lerp(this.pz[i], this.pz[j], t);
    out.baseY = lerp(this.py[i], this.py[j], t);
    const rxv = lerp(this.rx[i], this.rx[j], t), rzv = lerp(this.rz[i], this.rz[j], t);
    const l = Math.hypot(rxv, rzv) || 1;
    out.rx = rxv / l;
    out.rz = rzv / l;
    out.tx = out.rz;
    out.tz = -out.rx;
    out.slope = lerp(this.slope[i], this.slope[j], t);
    out.grade = lerp(this.grade[i], this.grade[j], t);
    out.hw = lerp(this.hw[i], this.hw[j], t);
    out.ed = lerp(this.ed[i], this.ed[j], t);
    out.wd = lerp(this.wd[i], this.wd[j], t);
    out.idx = t < 0.5 ? i : j;
    out.over = 0;
    return out;
  }

  heightAtFrame(fr, d) {
    return fr.baseY + fr.slope * d + Math.abs(fr.slope) * fr.wd + this.rampHeight(fr.s, d);
  }

  pointAt(s, d, v, fr = _fr) {
    this.frame(s, fr);
    v.set(fr.x + fr.rx * d, this.heightAtFrame(fr, d), fr.z + fr.rz * d);
    return v;
  }

  // Project a world point onto the path. `hint` is the last sample index or -1.
  project(x, z, hint, out) {
    const px = this.px, pz = this.pz;
    let best = 0, bestD = Infinity;
    if (hint < 0 || hint === undefined) {
      for (let i = 0; i < this.count; i++) {
        const dx = x - px[i], dz = z - pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let k = -14; k <= 14; k++) {
        const i = this.I(hint + k);
        const dx = x - px[i], dz = z - pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    let a = best, t = 0, dd = Infinity;
    const canNext = this.closed || best + 1 < this.count;
    const canPrev = this.closed || best - 1 >= 0;
    if (canNext) {
      const b = this.I(best + 1);
      const r = segProj(px[best], pz[best], px[b], pz[b], x, z);
      if (_segDist < dd) { dd = _segDist; a = best; t = r; }
    }
    if (canPrev) {
      const p = this.I(best - 1);
      const r = segProj(px[p], pz[p], px[best], pz[best], x, z);
      if (_segDist < dd) { dd = _segDist; a = p; t = r; }
    }
    this.frame((a + t) * this.ds, out);
    out.d = (x - out.x) * out.rx + (z - out.z) * out.rz;
    out.over = 0;
    if (!this.closed) {
      if (a === 0 && t <= 0) out.over = Math.min(0, (x - px[0]) * this.tx[0] + (z - pz[0]) * this.tz[0]);
      const e = this.count - 1;
      if (a === e - 1 && t >= 1) out.over = Math.max(0, (x - px[e]) * this.tx[e] + (z - pz[e]) * this.tz[e]);
    }
    out.y = this.heightAtFrame(out, out.d);
    return out;
  }

  // ---------- Geometry helpers ----------
  // Road surface strip between lateral offsets (numbers or (i) => d) over [i0, i1].
  strip(d0, d1, { vScale = 1 / 12, lift = 0, uRepeat = 1, across = 1, i0 = 0, i1 = -1, uWorld = 0 } = {}) {
    const f0 = typeof d0 === 'function' ? d0 : () => d0;
    const f1 = typeof d1 === 'function' ? d1 : () => d1;
    const end = i1 < 0 ? (this.closed ? this.count : this.count - 1) : i1;
    const rings = end - i0 + 1;
    const cols = across + 1;
    const pos = new Float32Array(rings * cols * 3);
    const uv = new Float32Array(rings * cols * 2);
    for (let r = 0; r < rings; r++) {
      const i = this.I(i0 + r);
      const a0 = f0(i), a1 = f1(i);
      for (let a = 0; a < cols; a++) {
        const d = a0 + ((a1 - a0) * a) / across;
        const o = r * cols + a;
        pos[o * 3] = this.px[i] + this.rx[i] * d;
        pos[o * 3 + 1] = this.yAt(i, d) + lift;
        pos[o * 3 + 2] = this.pz[i] + this.rz[i] * d;
        uv[o * 2] = uWorld ? d / uWorld : (a / across) * uRepeat;
        uv[o * 2 + 1] = (i0 + r) * this.ds * vScale;
      }
    }
    const idx = [];
    for (let r = 0; r < rings - 1; r++) {
      for (let a = 0; a < across; a++) {
        const A0 = r * cols + a, B = A0 + 1, C = A0 + cols, D = C + 1;
        idx.push(A0, B, C, B, D, C);
      }
    }
    return finishGeo(pos, uv, idx, [0, 1, 0]);
  }

  // Generic ribbon over [i0, i1]; fn(i, out6) writes two points per ring.
  ribbon(fn, expected, vScale = 1 / 8, i0 = 0, i1 = -1) {
    const end = i1 < 0 ? (this.closed ? this.count : this.count - 1) : i1;
    const rings = end - i0 + 1;
    const pos = new Float32Array(rings * 6);
    const uv = new Float32Array(rings * 4);
    const tmp = new Float32Array(6);
    for (let r = 0; r < rings; r++) {
      const i = this.I(i0 + r);
      fn(i, tmp);
      pos.set(tmp, r * 6);
      const v = (i0 + r) * this.ds * vScale;
      uv[r * 4] = 0; uv[r * 4 + 1] = v;
      uv[r * 4 + 2] = 1; uv[r * 4 + 3] = v;
    }
    const idx = [];
    for (let r = 0; r < rings - 1; r++) {
      const A0 = r * 2, B = A0 + 1, C = A0 + 2, D = A0 + 3;
      idx.push(A0, B, C, B, D, C);
    }
    return finishGeo(pos, uv, idx, expected(this.I(i0)));
  }

  // Split [0, end] into contiguous runs where pred(i) is true.
  runs(pred) {
    const end = this.closed ? this.count : this.count - 1;
    const out = [];
    let start = -1;
    for (let r = 0; r <= end; r++) {
      const ok = pred(this.I(r));
      if (ok && start < 0) start = r;
      if ((!ok || r === end) && start >= 0) {
        const stop = ok ? r : r - 1;
        if (stop > start) out.push([start, stop]);
        start = -1;
      }
    }
    return out;
  }

  // A patch covering s0..s1 and d0..d1 that follows the surface.
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
      const A0 = k * 2, B = A0 + 1, C = A0 + 2, D = A0 + 3;
      idx.push(A0, B, C, B, D, C);
    }
    return finishGeo(pos, uv, idx, [0, 1, 0]);
  }
}

// The main closed circuit plus its features and shortcut branches.
export class Track extends Path {
  constructor(def, reverse = false) {
    let raw = def.points.slice();
    if (reverse) raw = [raw[0], ...raw.slice(1).reverse()];
    const sc = def.scale ?? 1;
    const pts = raw.map((p) => new THREE.Vector3(p[0] * sc, p[2] ?? 0, p[1] * sc));
    const widths = raw.map((p) => p[3] ?? 1);
    super(pts, { closed: true, width: def.width ?? 17, shoulder: def.shoulder ?? 6, wallH: def.wallH ?? 1.3, bank: def.bank, widths, minY: 0 });
    this.def = def;
    this.reverse = reverse;
    const len = this.length;
    const f = (at) => (reverse ? (1 - at + 1) % 1 : at) * len;
    this.f = f;
    this.sd = (d) => (reverse ? -d : d);
    const fr = {};
    // Features can sit at a lap fraction (`at`) or at a control point
    // (`p`, plus `off` metres along the forward direction). Either way `at`
    // is in forward lap fractions, and f() maps it onto this direction.
    const K = raw.length;
    const cpS = this.cpIdx.map((i) => i * this.ds);
    const atP = (k, off = 0) => {
      const fwd = reverse ? (k === 0 ? 0 : 1 - cpS[K - k] / len) : cpS[k] / len;
      return (((fwd + off / len) % 1) + 1) % 1;
    };
    this.atP = atP;
    const pos = (o) => (o.p !== undefined ? { ...o, at: atP(o.p, o.off) } : o);
    // `dir` keeps a feature to one direction (1 forwards, -1 reversed).
    const dirOk = (o) => !o.dir || o.dir === (reverse ? -1 : 1);
    def = { ...def };
    for (const key of ['ramps', 'boosts', 'patches', 'gems', 'obstacles']) if (def[key]) def[key] = def[key].filter(dirOk).map(pos);
    if (def.items) def.items = def.items.map((a) => (typeof a === 'object' ? atP(a.p, a.off) : a));
    this.ramps = (def.ramps || []).map((r) => {
      const l = r.len ?? 8;
      const start = reverse ? (f(r.at) - l + len) % len : f(r.at);
      this.frame(start, fr);
      return { s: start, len: l, h: r.h ?? 1.7, glide: !!r.glide, halfW: fr.hw };
    });
    this.boosts = (def.boosts || []).map((b) => ({ s: f(b.at), d: this.sd(b.d ?? 0), len: 7, w: 4.6 }));
    // Surface patches on the road: black ice, mud, oil...
    this.patches = (def.patches || []).map((p) => {
      const l = p.len ?? 18;
      return { s: reverse ? (f(p.at) - l + len) % len : f(p.at), len: l, d: this.sd(p.d ?? 0), w: p.w ?? 9, type: p.type || 'ice' };
    });
    this.itemRows = (def.items || []).map((at) => f(at));
    this.gemLines = (def.gems || []).map((g) => ({ s: f(g.at), d: this.sd(g.d ?? 0), n: g.n ?? 5 }));
    this.obstacles = (def.obstacles || []).map((o) => ({ ...o, s: f(o.at) }));
    this._setZones((def.zones || []).map((z) => {
      const a = z.p0 !== undefined ? atP(z.p0, z.off0) : z.at;
      const zl = z.p0 !== undefined ? (((atP(z.p1, z.off1) - a) % 1) + 1) % 1 : z.len;
      const l = zl * len;
      return { kind: z.type === 'sky' ? 2 : 1, type: z.type, name: z.name || '', s0: reverse ? (f(a) - l + len) % len : f(a), len: l };
    }));
    this.hasZones = this.zones.length > 0;
    // Legs split a long one-lap adventure into named parts for the HUD.
    const lg = (def.legs || []).map((g) => (g.p !== undefined ? { ...g, at: atP(g.p, g.off) } : g));
    this.legs = reverse
      ? lg.map((g, i) => ({ s: i === 0 ? 0 : (1 - lg[lg.length - i].at) * len, name: lg[lg.length - 1 - i].name }))
      : lg.map((g) => ({ s: g.at * len, name: g.name }));

    // Bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    for (let i = 0; i < this.count; i++) {
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
      maxY = Math.max(maxY, this.py[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ, maxY };
    this.center = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.radius = Math.max(maxX - minX, maxZ - minZ) / 2;

    this._findBridges();
    this.shortcuts = (def.shortcuts || []).map((sc, n) => new Shortcut(this, sc, n));
    this._grid = null;
  }

  // Mark samples where this road passes over another part of itself.
  _findBridges() {
    const skip = Math.ceil(40 / this.ds);
    for (let i = 0; i < this.count; i++) {
      for (let j = 0; j < this.count; j++) {
        let di = Math.abs(i - j);
        di = Math.min(di, this.count - di);
        if (di < skip) continue;
        const dx = this.px[i] - this.px[j], dz = this.pz[i] - this.pz[j];
        const r = this.wd[i] + this.wd[j] + 3;
        if (dx * dx + dz * dz < r * r && this.py[i] - this.py[j] > 3.5) {
          for (let k = -4; k <= 4; k++) this.bridge[this.I(i + k)] = 1;
          break;
        }
      }
    }
  }

  // Minimum distance from (x,z) to any drivable centreline (for scenery placement).
  clearance(x, z) {
    let best = Infinity;
    for (let i = 0; i < this.count; i += 2) {
      if (this.zoneT[i] === 2 && this.py[i] > 24) continue;
      const dx = x - this.px[i], dz = z - this.pz[i];
      const d = Math.sqrt(dx * dx + dz * dz) - this.wd[i];
      if (d < best) best = d;
    }
    for (const sc of this.shortcuts) {
      for (let i = 0; i < sc.count; i += 2) {
        if (sc.zoneT[i] === 2 && sc.py[i] > 24) continue;
        const dx = x - sc.px[i], dz = z - sc.pz[i];
        const d = Math.sqrt(dx * dx + dz * dz) - sc.wd[i];
        if (d < best) best = d;
      }
    }
    return best;
  }

  distToCenter(x, z) {
    let best = Infinity;
    for (let i = 0; i < this.count; i += 2) {
      const dx = x - this.px[i], dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  gridSlot(k) {
    const s = this.length - 8 - k * 3.4;
    const fr = this.frame(s, {});
    const d = (k % 2 === 0 ? -1 : 1) * Math.min(4, fr.hw - 2.5);
    return { s, d };
  }

  // Keep an object (kart or projectile) inside the drivable space, switching
  // between the main loop and shortcuts through wall gaps. Returns the speed
  // of any wall impact. o: { pos, vel, path, seg, trk }.
  resolve(o, radius, bounce = 0.45) {
    const p = o.path || this;
    const trk = p.project(o.pos.x, o.pos.z, o.seg, o.trk);
    o.seg = trk.idx;
    const lim = trk.wd - radius;
    if (p === this) {
      if (Math.abs(trk.d) <= lim) return 0;
      const side = trk.d > 0 ? 1 : 0;
      const owners = this.gapOwners[side][trk.idx];
      if (owners) {
        // Through the opening onto whichever branch we're actually on.
        let best = null, bestK = Infinity;
        for (const id of owners) {
          const sc = this.shortcuts[id];
          const t2 = sc.project(o.pos.x, o.pos.z, -1, _tmpTrk);
          const k = Math.abs(t2.d) / t2.wd;
          if (t2.over === 0 && Math.abs(t2.d) < t2.wd - radius * 0.5 && k < bestK) {
            best = sc;
            bestK = k;
            Object.assign(_bestTrk, t2);
          }
        }
        if (best) {
          o.path = best;
          o.seg = _bestTrk.idx;
          Object.assign(o.trk, _bestTrk);
          return 0;
        }
      }
      return this._push(o, trk, lim, bounce);
    }
    // On a shortcut
    if (trk.over === 0 && Math.abs(trk.d) <= lim) return 0;
    // Flying over the middle of a branch (a jump or a glide): stay on it,
    // even where the main road runs close by, instead of being handed back
    // to the main road in mid-air.
    if (o.grounded === false && trk.over === 0 && trk.s > 14 && trk.s < p.length - 14) return this._push(o, trk, lim, bounce, p);
    const m = this.project(o.pos.x, o.pos.z, p.mainHint(trk.s), _tmpTrk);
    if (Math.abs(m.d) < m.wd - radius * 0.3) {
      o.path = this;
      o.seg = m.idx;
      Object.assign(o.trk, m);
      return 0;
    }
    if (trk.over !== 0) {
      // Past the end of a branch without reaching the main road: step back.
      const sg = Math.sign(trk.over);
      o.pos.x -= trk.tx * trk.over;
      o.pos.z -= trk.tz * trk.over;
      const vn = (o.vel.x * trk.tx + o.vel.z * trk.tz) * sg;
      if (vn > 0) { o.vel.x -= trk.tx * sg * vn * (1 + bounce); o.vel.z -= trk.tz * sg * vn * (1 + bounce); }
      p.project(o.pos.x, o.pos.z, o.seg, trk);
      return vn;
    }
    return this._push(o, trk, lim, bounce, p);
  }

  _push(o, trk, lim, bounce, path = this) {
    const sg = Math.sign(trk.d);
    const push = Math.abs(trk.d) - lim;
    o.pos.x -= trk.rx * sg * push;
    o.pos.z -= trk.rz * sg * push;
    trk.d -= sg * push;
    trk.y = path.heightAtFrame(trk, trk.d);
    const vn = (o.vel.x * trk.rx + o.vel.z * trk.rz) * sg;
    if (vn > 0) {
      o.vel.x -= trk.rx * sg * vn * (1 + bounce);
      o.vel.z -= trk.rz * sg * vn * (1 + bounce);
      return vn;
    }
    return 0;
  }

  // Attach without pushing (for remote karts whose position is authoritative elsewhere).
  attach(o) {
    const p = o.path || this;
    const trk = p.project(o.pos.x, o.pos.z, o.seg, o.trk);
    o.seg = trk.idx;
    if (Math.abs(trk.d) <= trk.wd + 1 && trk.over === 0) return;
    if (p === this) {
      for (const sc of this.shortcuts) {
        const t2 = sc.project(o.pos.x, o.pos.z, -1, _tmpTrk);
        if (t2.over === 0 && Math.abs(t2.d) < t2.wd) { o.path = sc; o.seg = t2.idx; Object.assign(o.trk, t2); return; }
      }
    } else {
      o.path = this;
      o.seg = -1;
      this.project(o.pos.x, o.pos.z, -1, o.trk);
      o.seg = o.trk.idx;
    }
  }

  // Progress along the main loop for an object that may be on a shortcut.
  mainS(o) {
    return o.path && o.path !== this ? o.path.toMain(o.trk.s) : o.trk.s;
  }
}

// An open branch leaving the main loop through a gap in its wall and
// rejoining it further on.
export class Shortcut extends Path {
  constructor(main, def, id) {
    const L = main.length;
    const rev = main.reverse;
    const mapAt = (at) => (rev ? (1 - at + 1) % 1 : at);
    // Ends can also be pinned to main-road control points (fromP/toP + offsets in metres).
    const fromAt = def.fromP !== undefined ? main.atP(def.fromP, def.fromOff) : def.from;
    const toAt = def.toP !== undefined ? main.atP(def.toP, def.toOff) : def.to;
    let from = mapAt(fromAt), to = mapAt(toAt);
    let inner = (def.pts || []).map((p) => [mapAt(p[0]), rev ? -p[1] : p[1], p[2]]);
    const k = main.def.scale ?? 1;
    // World-space waypoints [x, z, y?] in track units (scaled like the main points).
    let world = (def.wpts || []).map((p) => new THREE.Vector3(p[0] * k, p[2] ?? NaN, p[1] * k));
    if (rev) {
      [from, to] = [to, from];
      inner = inner.reverse();
      world = world.reverse();
    }
    const fr = {};
    // Work out which side of the main road the branch leaves from its first waypoint.
    let side = rev ? -(def.side || 1) : def.side || 1;
    if (world.length || inner.length) {
      const probe = {};
      if (world.length) main.project(world[0].x, world[0].z, -1, probe);
      else probe.d = inner[0][1];
      side = Math.sign(probe.d) || side;
    }
    const P = [];
    const add = (at, d, y) => {
      main.frame(at * L, fr);
      const dd = clamp(d, -fr.wd, fr.wd);
      const yy = y !== undefined && y !== null ? y : Math.abs(d) <= fr.wd ? main.heightAtFrame(fr, dd) : main.heightAtFrame(fr, Math.sign(d) * fr.wd);
      P.push(new THREE.Vector3(fr.x + fr.rx * d, yy, fr.z + fr.rz * d));
    };
    // `lead` (metres): branch off earlier and peel away gently instead of
    // turning straight across the kerb, and rejoin the same way.
    const lead = (def.lead || 0) / L;
    const wrap = (a) => (a + 1) % 1;
    if (lead) {
      main.frame(from * L, fr);
      const out = side * (fr.wd + 5);
      from = wrap(from - lead);
      main.frame(from * L, fr);
      add(from, side * Math.max(1, fr.hw - 3));
      add(wrap(from + lead), out);
    } else {
      main.frame(from * L, fr);
      add(from, side * Math.max(1, fr.hw - 3));
    }
    for (const p of inner) add(p[0], p[1], p[2]);
    const tmp = {};
    // With a lead-in the outer waypoints sit too close to the lead points and
    // make a kink; the lead points replace them.
    if (lead && world.length > 3) world = world.slice(1, -1);
    for (const w of world) {
      if (Number.isNaN(w.y)) {
        main.project(w.x, w.z, -1, tmp);
        w.y = tmp.baseY;
      }
      P.push(w);
    }
    if (lead) {
      main.frame(to * L, fr);
      add(to, side * (fr.wd + 5));
      to = wrap(to + lead);
    }
    main.frame(to * L, fr);
    add(to, side * Math.max(1, fr.hw - 3));
    const surf = SURFACES[def.surface] || SURFACES.road;
    // With a lead-in the mouths flare out into a funnel that is easy to hit.
    const widths = lead ? P.map((_, i) => (i === 0 || i === P.length - 1 ? 1.8 : i === 1 || i === P.length - 2 ? 1.5 : 1)) : undefined;
    super(P, { closed: false, width: def.width ?? 10, curb: 0.6, shoulder: def.shoulder ?? 1.4, wallH: def.wallH ?? 1.1, bank: 0,
      offroad: !!surf.offroad, grip: surf.grip, widths });
    this.main = main;
    this.id = id;
    this.def = def;
    this.name = def.name || 'Shortcut';
    this.side = side;
    this.surface = def.surface || 'road';
    this.speedMul = surf.speed;
    const flip = (a) => (rev ? 1 - a : a);
    this.voids = (def.voids || []).map((v) => {
      const a = rev ? 1 - v.at - v.len : v.at;
      return { s0: a * this.length, s1: (a + v.len) * this.length };
    });
    this.obstacles = (def.obstacles || []).map((o) => ({ ...o, s: flip(o.at) * this.length, path: this }));
    this.fromS = from * L;
    let toS = to * L;
    if (toS < this.fromS) toS += L;
    this.toS = toS;
    this.gems = (def.gems || []).map((g) => ({ s: flip(g.at) * this.length, d: g.d ?? 0, n: g.n ?? 4 }));
    this.boosts = (def.boosts || []).map((b) => ({ s: Math.max(0, flip(b.at) * this.length - (rev ? 6 : 0)), d: b.d ?? 0, len: 6, w: 4 }));
    // Ramps must still rise in the driving direction when the track is reversed.
    // Jumps over gaps always get their ramp right before the gap.
    const r0 = (def.ramps || [])[0] || {};
    if (this.voids.length) {
      const l = r0.len ?? 8;
      this.ramps = this.voids.map((v) => ({ s: Math.max(0, v.s0 - l), len: l, h: r0.h ?? 2.2, glide: !!r0.glide, halfW: 99 }));
    } else {
      this.ramps = (def.ramps || []).map((r) => {
        const l = r.len ?? 7;
        return { s: rev ? flip(r.at) * this.length - l : r.at * this.length, len: l, h: r.h ?? 1.8, glide: !!r.glide, halfW: 99 };
      });
    }
    this.itemRows = (def.items || []).map((at) => flip(at) * this.length);
    this._link();
    // A branch can be a river channel or a sky lane (fractions of the branch).
    this._setZones((def.zones || []).map((z) => {
      const a = rev ? 1 - z.at - z.len : z.at;
      return { kind: z.type === 'sky' ? 2 : 1, type: z.type, name: z.name || '', s0: a * this.length, len: z.len * this.length };
    }));
    if (this.zones.length) main.hasZones = true;
  }

  toMain(s) {
    const u = clamp(s / this.length, 0, 1);
    return (this.fromS + (this.toS - this.fromS) * u) % this.main.length;
  }

  mainHint(s) {
    return Math.round(this.toMain(s) / this.main.ds) % this.main.count;
  }

  // Cut matching gaps into the main wall and mark where our own walls merge.
  _link() {
    const m = this.main;
    const t = {};
    this.overlap = new Uint8Array(this.count);
    for (let i = 0; i < this.count; i++) {
      m.project(this.px[i], this.pz[i], -1, t);
      const reach = Math.abs(t.d);
      const w = this.wd[i];
      if (reach - w < t.wd + 0.5) this.overlap[i] = 1;
      if (reach - w * 1.2 < t.wd + 1 && reach + w * 1.2 > t.wd - 1) {
        const span = Math.ceil((w * 2) / m.ds) + 1;
        const sideIdx = t.d > 0 ? 1 : 0;
        for (let k = -span; k <= span; k++) {
          const j = m.I(t.idx + k);
          if (!m.gap[sideIdx][j]) m.gap[sideIdx][j] = this.id + 1;
          // One opening can serve two branches (one's exit next to another's entrance).
          const own = (m.gapOwners[sideIdx][j] = m.gapOwners[sideIdx][j] || []);
          if (!own.includes(this.id)) own.push(this.id);
        }
      }
    }
    // Keep a little wall at the very end of the overlap so the branch is not wide open.
    this.entryEnd = this.overlap.indexOf(0);
    const lastOut = this.overlap.lastIndexOf(0);
    this.exitStart = lastOut >= 0 ? lastOut + 1 : this.count;
  }
}

// Patches on top of the road. grip scales sideways grip, traction scales
// acceleration and braking, speed scales top speed.
export const PATCHES = {
  ice: { grip: 0.26, traction: 0.5, speed: 1.02 },
  oil: { grip: 0.2, traction: 0.75, speed: 1 },
  mud: { grip: 0.8, traction: 0.6, speed: 0.7 },
  snow: { grip: 0.7, traction: 0.8, speed: 0.88 },
  sand: { grip: 0.85, traction: 0.75, speed: 0.8 },
};

export const SURFACES = {
  road: { speed: 1, grip: 1 },
  dirt: { speed: 0.87, grip: 0.9 },
  offroad: { speed: 1, grip: 0.85, offroad: true },
  ice: { speed: 1.03, grip: 0.24 },
};

const _fr = {};
const _tmpTrk = {};
const _bestTrk = {};
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
  if (idx.length >= 3) {
    const i0 = idx[0] * 3, i1 = idx[1] * 3, i2 = idx[2] * 3;
    const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2];
    const bx = pos[i2] - pos[i0], by = pos[i2 + 1] - pos[i0 + 1], bz = pos[i2 + 2] - pos[i0 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * expected[0] + ny * expected[1] + nz * expected[2] < 0) {
      for (let k = 0; k < idx.length; k += 3) {
        const tt = idx[k + 1];
        idx[k + 1] = idx[k + 2];
        idx[k + 2] = tt;
      }
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
