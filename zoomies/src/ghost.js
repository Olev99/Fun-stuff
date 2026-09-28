import * as THREE from 'three';
import { kartGeometry, wheelGeometry, bodyById } from './karts.js';
import { charById } from './characters.js';
import { pbrMat } from './util.js';
import { hatById } from './cosmetics.js';

// Time trial ghosts: your best run on each track (and direction) is recorded
// at 10 samples a second, saved on the phone and replayed as a see-through
// kart next time. Positions are stored as 16-bit integers (5 cm steps).

const KEY = 'zoomies.ghost.v1.';
const HZ = 10;
const POS = 20, YAW = 5000;

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function toB64(i16) {
  const u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new Int16Array(u8.buffer);
}

export function loadGhost(key) {
  try {
    const raw = localStorage.getItem(KEY + key);
    if (!raw) return null;
    const g = JSON.parse(raw);
    g.samples = fromB64(g.data);
    return g.samples.length >= 8 ? g : null;
  } catch (e) {
    return null;
  }
}

export class GhostRecorder {
  constructor() {
    this.buf = [];
    this.next = 0;
  }

  sample(time, k) {
    if (time < this.next || this.buf.length > 4 * HZ * 60 * 12) return;
    this.next += 1 / HZ;
    const clamp16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));
    this.buf.push(clamp16(k.pos.x * POS), clamp16(k.pos.y * POS), clamp16(k.pos.z * POS), clamp16(wrap(k.yaw + k.visualYaw) * YAW));
  }

  // Keep this run if it beats the saved ghost. Returns true when saved.
  save(key, time, splits, kart) {
    const old = loadGhost(key);
    if (old && old.time <= time) return false;
    const g = { time, splits, char: kart.ch.id, body: kart.bodyDef.id, paint: kart.paint || null, hat: (kart.look && kart.look.hat) || null, data: toB64(new Int16Array(this.buf)) };
    try {
      localStorage.setItem(KEY + key, JSON.stringify(g));
      return true;
    } catch (e) {
      return false;
    }
  }
}

// The replayed kart: a translucent copy of the recorded kart.
export class GhostPlayer {
  constructor(scene, g) {
    this.g = g;
    this.n = g.samples.length / 4;
    const ch = charById(g.char);
    const body = bodyById(g.body);
    const geo = kartGeometry(ch, { body: body.id, paint: g.paint, hat: typeof g.hat === 'string' ? hatById(g.hat).id : null });
    this.mat = pbrMat({ color: '#bfeaff', transparent: true, opacity: 0.42, depthWrite: false });
    this.root = new THREE.Group();
    this.root.add(new THREE.Mesh(geo.chassis, this.mat));
    const drv = new THREE.Mesh(geo.driver, this.mat);
    drv.position.set(0, body.seat, 0);
    this.root.add(drv);
    this.wheelGeo = wheelGeometry(true);
    this.wheels = body.wheels.map((w) => {
      const m = new THREE.Mesh(this.wheelGeo, this.mat);
      m.position.set(w.x, w.y, w.z);
      m.scale.set(w.w, w.r, w.r);
      this.root.add(m);
      return m;
    });
    this.root.renderOrder = 2;
    this.root.traverse((o) => { o.renderOrder = 2; });
    scene.add(this.root);
    this.spin = 0;
    this._last = null;
    this.update(0);
  }

  update(time) {
    const s = this.g.samples;
    const f = time * HZ;
    if (f >= this.n - 1) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    const i = Math.max(0, Math.floor(f)), t = Math.max(0, f - i), j = i * 4, k = j + 4;
    const x = (s[j] + (s[k] - s[j]) * t) / POS;
    const y = (s[j + 1] + (s[k + 1] - s[j + 1]) * t) / POS;
    const z = (s[j + 2] + (s[k + 2] - s[j + 2]) * t) / POS;
    const a0 = s[j + 3] / YAW, a1 = s[k + 3] / YAW;
    const yaw = a0 + wrap(a1 - a0) * t;
    if (this._last) {
      const d = Math.hypot(x - this._last.x, z - this._last.z);
      if (d < 20) this.spin += d / 0.38;
    }
    this._last = { x, z };
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    for (const w of this.wheels) w.rotation.x = this.spin;
  }

  dispose(scene) {
    scene.remove(this.root);
    this.mat.dispose();
  }
}
