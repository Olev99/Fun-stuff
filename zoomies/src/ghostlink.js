import { parseGhost, toB64 } from './ghost.js';
import { TRACKS } from './tracks.js';
import { CHARACTERS } from './characters.js';
import { BODIES } from './karts.js';
import { hatById } from './cosmetics.js';
import { cleanNick } from './nametags.js';
import { fmtTime } from './util.js';

// "Beat my ghost" links. A Time Trial ghost is squeezed into a URL fragment
// (the part after #, which a browser never sends to any server):
//   header JSON + newline + 4 channels (x, y, z, yaw) of 5 samples a second,
//   each coded as the miss of a straight-line guess, as varints; then gzip,
//   then base64url. A typical lap is 1.5 to 3.5 thousand characters.
// A link is hostile input: everything is size-capped and validated, and a
// bad one gives null, never an exception.

const PARAM = 'ch=';
const MAX_FRAG = 12000; // characters in the fragment
const MAX_BYTES = 9000; // compressed
const MAX_RAW = 64 * 1024; // decompressed (bomb guard)
const MAX_SAMPLES = 3600; // 5 per second: the 12 minutes the recorder allows
const POS = 20, YAW = 5000; // the ghost format's int16 scales (ghost.js)
const QP = 10, QY = 40; // link precision: 10 cm, 1/40 rad

const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

// ---- bytes <-> base64url ----
function b64uEncode(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(t) {
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return null;
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// ---- gzip ----
async function gzip(u8) {
  const cs = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(cs).arrayBuffer());
}

// Decompress, giving up (null) as soon as the output passes `max` bytes.
async function gunzip(u8, max) {
  const reader = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---- varints (zigzag LEB128) ----
function putVar(out, v) {
  let z = v < 0 ? -2 * v - 1 : 2 * v;
  while (z > 127) { out.push((z % 128) | 128); z = Math.floor(z / 128); }
  out.push(z);
}

function getVar(u8, pos) {
  let z = 0, mul = 1;
  for (let i = 0; i < 4; i++) {
    if (pos.i >= u8.length) throw new Error('short');
    const b = u8[pos.i++];
    z += (b & 127) * mul;
    if (b < 128) return z % 2 ? -(z + 1) / 2 : z / 2;
    mul *= 128;
  }
  throw new Error('long');
}

// ---- ghost samples <-> link bytes ----
// samples: Int16Array (x, y, z, yaw) at 10 per second, as the ghost recorder saves them.
function packSamples(samples) {
  const n = samples.length / 4, m = Math.ceil(n / 2);
  const out = [];
  putVar(out, m);
  for (let c = 0; c < 4; c++) {
    let p1 = 0, p2 = 0, yawPrev = 0;
    for (let i = 0; i < m; i++) {
      const raw = samples[Math.min(i * 2, n - 1) * 4 + c];
      let q;
      if (c < 3) q = Math.round(raw / (POS / QP));
      else {
        // unwrap so the yaw never jumps by a whole turn between two samples
        let y = raw / YAW;
        if (i) y = yawPrev + wrap(y - yawPrev);
        yawPrev = y;
        q = Math.round(y * QY);
      }
      putVar(out, q - (2 * p1 - p2));
      p2 = p1;
      p1 = q;
    }
  }
  return Uint8Array.from(out);
}

// Back to a 10 per second Int16Array (the in-between samples are averaged), or null.
function unpackSamples(u8, pos) {
  const m = getVar(u8, pos);
  if (m < 4 || m > MAX_SAMPLES) return null;
  const q = [0, 1, 2, 3].map(() => new Float64Array(m));
  for (let c = 0; c < 4; c++) {
    let p1 = 0, p2 = 0;
    for (let i = 0; i < m; i++) {
      const v = getVar(u8, pos) + 2 * p1 - p2;
      q[c][i] = v;
      p2 = p1;
      p1 = v;
      if (Math.abs(v) > (c < 3 ? 16383 : 130000)) return null;
    }
  }
  const total = 2 * m - 1, out = new Int16Array(total * 4);
  const val = (c, i) => (c < 3 ? q[c][i] * (POS / QP) : wrap(q[c][i] / QY) * YAW);
  for (let i = 0; i < total; i++) {
    for (let c = 0; c < 4; c++) {
      const a = i >> 1;
      let v = i % 2 ? (c < 3 ? (val(c, a) + val(c, a + 1)) / 2 : (q[c][a] + q[c][a + 1]) / 2) : null;
      if (v === null) v = val(c, a);
      else if (c === 3) v = wrap(v / QY) * YAW;
      out[i * 4 + c] = Math.max(-32767, Math.min(32767, Math.round(v)));
    }
  }
  return out;
}

// ---- public ----
// Build the fragment text ("ch=...") for a ghost on a track. g is a parsed
// ghost (parseGhost); returns null if it can't be shared.
export async function encodeChallenge({ trackId, reverse, name, speedClass }, g) {
  try {
    if (!g || !g.samples || !TRACKS.some((t) => t.id === trackId)) return null;
    const head = JSON.stringify({
      k: trackId, r: reverse ? 1 : 0, x: speedClass, t: +g.time.toFixed(2), n: cleanNick(name) || undefined,
      c: g.char, b: g.body, p: g.paint || undefined, h: g.hat || undefined, s: (g.splits || []).map((v) => (v === null ? null : +v.toFixed(2))),
    });
    const body = packSamples(g.samples);
    const enc = new TextEncoder().encode(`${head}\n`);
    const raw = new Uint8Array(enc.length + body.length);
    raw.set(enc);
    raw.set(body, enc.length);
    return PARAM + b64uEncode(await gzip(raw));
  } catch (e) {
    return null;
  }
}

// The whole URL to share, for the page that is open now.
export const challengeUrl = (frag) => `${location.origin}${location.pathname}#${frag}`;

// Is there a challenge in this URL or fragment text?
export const hasChallenge = (hash) => typeof hash === 'string' && hash.replace(/^#/, '').startsWith(PARAM);

// Read a challenge fragment ("#ch=..." or "ch=..."). Returns
// { trackId, trackName, reverse, speedClass, time, name, ghost } or null for anything wrong.
export async function decodeChallenge(hash) {
  try {
    const frag = String(hash || '').replace(/^#/, '');
    if (!frag.startsWith(PARAM) || frag.length > MAX_FRAG) return null;
    const comp = b64uDecode(frag.slice(PARAM.length));
    if (!comp || comp.length > MAX_BYTES) return null;
    const raw = await gunzip(comp, MAX_RAW);
    if (!raw) return null;
    const nl = raw.indexOf(10);
    if (nl < 2 || nl > 2000) return null;
    const h = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, nl)));
    if (!h || typeof h !== 'object') return null;
    const track = typeof h.k === 'string' ? TRACKS.find((t) => t.id === h.k) : null;
    if (!track || !Number.isFinite(h.t) || h.t < 5 || h.t > 3600) return null;
    const pos = { i: nl + 1 };
    const samples = unpackSamples(raw, pos);
    if (!samples || pos.i !== raw.length) return null;
    const str = (v) => (typeof v === 'string' ? v : '');
    const good = (h.s === undefined || (Array.isArray(h.s) && h.s.length <= 100 && h.s.every((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 4000)))) ? h.s : null;
    // Everything the ghost carries is checked against what the game knows.
    const ghost = parseGhost(JSON.stringify({
      time: h.t,
      splits: good || undefined,
      char: CHARACTERS.some((c) => c.id === h.c) ? h.c : 'mochi',
      body: BODIES[h.b] ? h.b : 'classic',
      paint: /^#[0-9a-fA-F]{6}$/.test(str(h.p)) ? h.p : null,
      hat: h.h && hatById(str(h.h)).id === h.h ? h.h : null,
      data: toB64(samples),
    }));
    if (!ghost) return null;
    return { trackId: track.id, trackName: track.name, reverse: h.r === 1, speedClass: ['chill', 'zoom', 'turbo'].includes(h.x) ? h.x : 'zoom', time: h.t, name: cleanNick(str(h.n)) || 'A friend', ghost };
  } catch (e) {
    return null;
  }
}

export const challengeText = (c) => `Beat ${c.name}'s ${fmtTime(c.time).replace(/^0:/, '')} on ${c.trackName}${c.reverse ? ' (reverse)' : ''}!`;
