// The save's per-device ledger (format documented at the top of sync.js).
// Pure functions on plain data: no game rules here, career.js derives the
// visible coins, capsules, parts and stats from it.

export const FMT = 1; // ledger format; syncing and backups refuse a different one
export const MAX_DEV = 24; // device entries kept; older ones fold into OVER
export const MAX_GONE = 256;
export const OVER = '~';
const MAX = 1e9;
const MAX_KEYS = 64; // keys per counter map
const MAX_BITS = 4096; // bits per claim set (hex chars x 4): days from 2024 to 2035
const DEV_ID = /^[A-Za-z0-9~_-]{1,16}$/;
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const HEX = /^[0-9a-f]*$/;
const SCALARS = ['t', 'e', 's', 'n', 'ke', 'ku', 'x'];
const MAPS = ['st', 'pa', 'ps', 'pv'];
export const CLAIMS = ['dd', 'md', 'wk'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const cnt = (v, max = MAX) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
const isLegacy = (id) => id[0] === 'L';

export const newLedger = () => ({ v: FMT, d: {}, gone: [], cl: {}, pt: 0, ph: '', lt: 0, lh: '', off: {} });

// ---- this install's id (never inside a save or a backup) ----
const DEV_KEY = 'zoomies-device';
let memDev = '';
const randId = () => Array.from({ length: 10 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
export function deviceId() {
  try {
    const v = localStorage.getItem(DEV_KEY);
    if (v && DEV_ID.test(v) && !isLegacy(v) && v !== OVER) return v;
  } catch (e) { /* storage blocked */ }
  if (!memDev) memDev = randId();
  try { localStorage.setItem(DEV_KEY, memDev); } catch (e) { /* this session only */ }
  return memDev;
}
// A Replace-restore starts a new id, so the restored ledger's old entry for this device stays frozen.
export function newDeviceId() {
  memDev = randId();
  try { localStorage.setItem(DEV_KEY, memDev); } catch (e) { /* this session only */ }
  return memDev;
}

// ---- writing to storage ----
// Writes key = value. When storage is full the oldest ghosts (ghost.js, by when they were saved)
// are deleted first, then it tries again; progress matters more than a ghost. A write that still
// fails tells the page (safeui.js shows a toast with Back up now) and returns false.
const GHOST = 'zoomies.ghost.v1.';
function dropOldestGhost(except) {
  let old = null, at = Infinity;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(GHOST) || k === except) continue;
      let t = 0;
      try { t = Number(JSON.parse(localStorage.getItem(k)).at) || 0; } catch (e) { /* unreadable: oldest */ }
      if (t < at) { at = t; old = k; }
    }
    if (old) localStorage.removeItem(old);
  } catch (e) { return false; }
  return !!old;
}
export function store(key, value, what = 'save') {
  for (let i = 0; i < 64; i++) {
    try { localStorage.setItem(key, value); return true; } catch (e) {
      if (!dropOldestGhost(key)) break;
    }
  }
  try { window.dispatchEvent(new CustomEvent('zoomies-save-failed', { detail: what })); } catch (e) { /* no page (tests) */ }
  return false;
}

// ---- cleaning (hostile input) ----
function cleanMap(o) {
  const out = {};
  if (!isObj(o)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (n >= MAX_KEYS) break;
    if (!KEY.test(k) || !Number.isFinite(v)) continue;
    const c = cnt(v);
    if (c) { out[k] = c; n++; }
  }
  return out;
}
export function cleanEntry(e) {
  const out = {};
  if (!isObj(e)) return out;
  for (const k of SCALARS) { const v = cnt(e[k], k === 't' ? 1e14 : MAX); if (v) out[k] = v; }
  for (const k of MAPS) { const m = cleanMap(e[k]); if (Object.keys(m).length) out[k] = m; }
  return out;
}
const cleanHex = (v) => (typeof v === 'string' && HEX.test(v) ? v.slice(0, MAX_BITS / 4).replace(/0+$/, '') : '');

export function cleanLedger(L) {
  const out = newLedger();
  if (!isObj(L)) return out;
  out.gone = Array.isArray(L.gone) ? [...new Set(L.gone.filter((id) => typeof id === 'string' && DEV_ID.test(id)))].sort().slice(-MAX_GONE) : [];
  const gone = new Set(out.gone);
  if (isObj(L.d)) {
    let n = 0;
    for (const [id, e] of Object.entries(L.d)) {
      if (n >= 4 * MAX_DEV) break;
      if (!DEV_ID.test(id) || gone.has(id)) continue;
      const c = cleanEntry(e);
      if (Object.keys(c).length) { out.d[id] = c; n++; }
    }
  }
  if (isObj(L.cl)) for (const k of CLAIMS) { const h = cleanHex(L.cl[k]); if (h) out.cl[k] = h; }
  for (const [t, h] of [['pt', 'ph'], ['lt', 'lh']]) {
    out[t] = cnt(L[t], 1e14);
    out[h] = typeof L[h] === 'string' && /^[0-9a-z]{0,16}$/.test(L[h]) ? L[h] : '';
  }
  // Clamp offsets of the numbers last shown (career.js applyLedger): local bookkeeping, rebuilt on every load.
  const o = isObj(L.off) ? L.off : {}, int = (v) => (Number.isFinite(v) ? Math.max(-MAX, Math.min(MAX, Math.round(v))) : 0);
  if (int(o.c)) out.off.c = int(o.c);
  if (int(o.k)) out.off.k = int(o.k);
  if (isObj(o.p)) { const p = {}; for (const [k, v] of Object.entries(o.p).slice(0, MAX_KEYS)) if (KEY.test(k) && int(v)) p[k] = int(v); if (Object.keys(p).length) out.off.p = p; }
  return compact(out);
}

// ---- joining two ledgers: per device, per counter max ----
const maxMap = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v);
  return out;
};
function maxEntry(a = {}, b = {}) {
  const out = {};
  for (const k of SCALARS) { const v = Math.max(a[k] || 0, b[k] || 0); if (v) out[k] = v; }
  for (const k of MAPS) { const m = maxMap(a[k], b[k]); if (Object.keys(m).length) out[k] = m; }
  return out;
}
// A legacy entry (a whole old save, see career.js) is taken whole from one side: the more played
// copy, and on a tie the one with less money left, so an older copy can never refund spending.
function legacyRank(e) { return [e.x || 0, e.n || 0, -((e.e || 0) - (e.s || 0)), -((e.ke || 0) - (e.ku || 0))]; }
export function pickLegacy(a, b) {
  const ra = legacyRank(a), rb = legacyRank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}
function orHex(a = '', b = '') {
  const n = Math.max(a.length, b.length);
  let s = '';
  for (let i = 0; i < n; i++) s += ((parseInt(a[i] || '0', 16) | parseInt(b[i] || '0', 16))).toString(16);
  return s.replace(/0+$/, '');
}

export function joinLedger(A, B) {
  const out = newLedger();
  out.gone = [...new Set([...A.gone, ...B.gone])].sort().slice(-MAX_GONE);
  const gone = new Set(out.gone);
  for (const id of new Set([...Object.keys(A.d), ...Object.keys(B.d)])) {
    if (gone.has(id)) continue;
    const a = A.d[id], b = B.d[id];
    out.d[id] = !a || !b ? { ...(a || b) } : isLegacy(id) ? pickLegacy(a, b) : maxEntry(a, b);
  }
  for (const k of CLAIMS) { const h = orHex(A.cl[k], B.cl[k]); if (h) out.cl[k] = h; }
  // What you drive and wear (pt/ph) and the fitted parts (lt/lh): the side changed last wins, each on its own.
  for (const [t, h] of [['pt', 'ph'], ['lt', 'lh']]) { const w = prefsWinner(A, B, t, h) === 'a' ? A : B; out[t] = w[t]; out[h] = w[h]; }
  return compact(out);
}
// 'a' or 'b': whose stamp is newer (ties: the larger hash, so the choice is the same in any order).
export const prefsWinner = (A, B, t = 'pt', h = 'ph') => (A[t] > B[t] || (A[t] === B[t] && A[h] >= B[h]) ? 'a' : 'b');

// More than MAX_DEV devices: the least recently active fold into OVER (same sums on this
// device) and their ids are remembered in `gone`, so if one comes back it is ignored rather
// than counted twice. shortcut: past MAX_DEV devices a stale fold can lose (never add) progress.
function compact(L) {
  const ids = Object.keys(L.d).filter((id) => id !== OVER);
  if (ids.length <= MAX_DEV) return L;
  ids.sort((p, q) => (L.d[p].t || 0) - (L.d[q].t || 0) || (p < q ? -1 : 1));
  const fold = ids.slice(0, ids.length - MAX_DEV);
  let o = L.d[OVER] || {};
  for (const id of fold) {
    const e = L.d[id], sum = {};
    for (const k of SCALARS) if (k !== 't') sum[k] = (o[k] || 0) + (e[k] || 0);
    for (const k of MAPS) { sum[k] = { ...(o[k] || {}) }; for (const [p, v] of Object.entries(e[k] || {})) sum[k][p] = (sum[k][p] || 0) + v; }
    o = cleanEntry(sum);
    delete L.d[id];
  }
  L.d[OVER] = o;
  L.gone = [...new Set([...L.gone, ...fold])].sort().slice(-MAX_GONE);
  return L;
}

// ---- reading and writing ----
export function totals(L) {
  const t = { e: 0, s: 0, n: 0, ke: 0, ku: 0, x: 0, st: {}, pa: {}, ps: {}, pv: {} };
  for (const e of Object.values(L.d)) {
    for (const k of SCALARS) if (k !== 't') t[k] += e[k] || 0;
    for (const k of MAPS) for (const [p, v] of Object.entries(e[k] || {})) t[k][p] = (t[k][p] || 0) + v;
  }
  return t;
}
// Add d (same shape as an entry, positive numbers only) to device `dev`.
export function credit(L, dev, d, now = Date.now()) {
  const e = (L.d[dev] = L.d[dev] || {});
  let any = false;
  for (const k of SCALARS) if (k !== 't' && d[k] > 0) { e[k] = cnt((e[k] || 0) + d[k]); any = true; }
  for (const k of MAPS) for (const [p, v] of Object.entries(d[k] || {})) if (v > 0) { (e[k] = e[k] || {})[p] = cnt((e[k][p] || 0) + v); any = true; }
  if (any) e.t = Math.max(e.t || 0, now);
  if (!Object.keys(e).length) delete L.d[dev];
  return compact(L);
}

// ---- claim sets: one bit per day or week a capsule was paid ----
const EPOCH = Date.UTC(2024, 0, 1);
export function dayBit(day) {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(day || '');
  if (!m) return -1;
  const i = Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCH) / 864e5);
  return i >= 0 && i < MAX_BITS ? i : -1;
}
export function weekBit(wk) {
  const m = /^(\d{4})-W(\d\d)$/.exec(wk || '');
  if (!m) return -1;
  const i = (+m[1] - 2024) * 54 + +m[2];
  return i >= 0 && i < MAX_BITS ? i : -1;
}
export function setBit(L, set, i) {
  if (i < 0) return;
  const h = (L.cl[set] || '').padEnd((i >> 2) + 1, '0');
  const j = i >> 2;
  L.cl[set] = (h.slice(0, j) + (parseInt(h[j], 16) | (1 << (i & 3))).toString(16) + h.slice(j + 1)).replace(/0+$/, '');
}
export function popcount(h = '') {
  let n = 0;
  for (const ch of h) { let v = parseInt(ch, 16); while (v) { n += v & 1; v >>= 1; } }
  return n;
}
