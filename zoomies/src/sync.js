// Same progress on your phone and your Mac, without accounts or a server.
// One device shows a code (and a QR code), the other types or scans it, and
// they connect straight to each other over WebRTC (PeerJS broker, 'sync'
// namespace). The device showing the code merges both saves and sends the
// result back, so both end up identical:
// - collections (karts, racers, paints, prizes, trophies, stars, found
//   shortcuts) are combined, the better record or ghost wins;
// - coins, XP and stats: after a sync both devices remember the shared
//   totals, so next time the merge is shared + what each device earned or
//   spent since. Two saves that never synced before take the higher value.

import qrcode from '../vendor/qrcode.mjs';
import { PeerTransport, LocalTransport, NetSession, makeCode } from './net.js';
import { saveCareer, loadCareer, newCareer } from './career.js';
import { saveRecords } from './settings.js';
import { levelOf, oldLevel } from './profile.js';
import { ownedCount } from './cosmetics.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const transport = (cb) => (params.get('net') === 'local' ? new LocalTransport(cb, 'sync') : new PeerTransport(cb, 'sync'));
const GHOST = 'zoomies.ghost.v1.';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];

// Numbers that go up and down with play: merged three-way when both saves
// share a sync base, otherwise the higher one wins.
function mergeNum(a, b, base) {
  a = num(a); b = num(b);
  if (base === undefined) return Math.max(a, b);
  base = num(base);
  return Math.max(0, base + (a - base) + (b - base));
}

export function mergeCareer(A, B) {
  const a = { ...newCareer(), ...A }, b = { ...newCareer(), ...B };
  const shared = a.sync && b.sync && a.sync.id === b.sync.id ? a.sync.base : null;
  const base = (k) => (shared ? shared[k] : undefined);
  // The more played save decides what you're driving and wearing.
  const main = num(a.xp) >= num(b.xp) ? a : b;
  const m = { ...main };
  m.xp = mergeNum(a.xp, b.xp, base('xp'));
  m.coins = mergeNum(a.coins, b.coins, base('coins'));
  m.earned = mergeNum(a.earned, b.earned, base('earned'));
  m.freeCaps = mergeNum(a.freeCaps, b.freeCaps, base('freeCaps'));
  // Level rewards already paid on either device (older saves: by their old level).
  m.lvlPaid = Math.max(...[A, B].map((x) => (x && x.lvlPaid) || oldLevel(num(x && x.xp))));
  for (const k of ['racers', 'bodies', 'paints', 'beaten', 'cos']) m[k] = union(a[k], b[k]);
  m.champion = !!(a.champion || b.champion);
  // Upgrades: the higher level of each, per kart.
  m.upgrades = {};
  for (const id of union(Object.keys(a.upgrades || {}), Object.keys(b.upgrades || {}))) {
    const ua = (a.upgrades || {})[id] || {}, ub = (b.upgrades || {})[id] || {};
    m.upgrades[id] = {};
    for (const u of union(Object.keys(ua), Object.keys(ub))) m.upgrades[id][u] = Math.max(num(ua[u]), num(ub[u]));
  }
  // Career events: most stars, first clears, best times.
  m.stars = {};
  for (const k of union(Object.keys(a.stars || {}), Object.keys(b.stars || {}))) m.stars[k] = Math.max(num((a.stars || {})[k]), num((b.stars || {})[k]));
  m.done = { ...(b.done || {}), ...(a.done || {}) };
  m.seen = { ...(b.seen || {}), ...(a.seen || {}) };
  m.best = {};
  for (const k of union(Object.keys(a.best || {}), Object.keys(b.best || {}))) {
    const va = (a.best || {})[k], vb = (b.best || {})[k];
    m.best[k] = typeof va === 'number' && typeof vb === 'number' ? Math.min(va, vb) : va ?? vb;
  }
  // Trophies: keep the earliest unlock date.
  m.ach = {};
  for (const k of union(Object.keys(a.ach || {}), Object.keys(b.ach || {}))) {
    const va = (a.ach || {})[k], vb = (b.ach || {})[k];
    m.ach[k] = va && vb ? Math.min(va, vb) : va || vb;
  }
  // Lifetime stats: counters add up, lists are combined.
  m.stats = {};
  const sa = a.stats || {}, sb = b.stats || {}, sbase = (shared && shared.stats) || null;
  for (const k of union(Object.keys(sa), Object.keys(sb))) {
    if (Array.isArray(sa[k]) || Array.isArray(sb[k])) m.stats[k] = union(sa[k], sb[k]);
    else m.stats[k] = mergeNum(sa[k], sb[k], sbase ? sbase[k] : undefined);
  }
  // Daily challenge: the latest day done, the longer streaks.
  const da = a.daily || {}, db = b.daily || {};
  const later = (da.done || '') >= (db.done || '') ? da : db;
  m.daily = { done: later.done || '', streak: later.streak || 0, best: Math.max(num(da.best), num(db.best)) };
  // Make sure what you're driving is something you own.
  if (!m.racers.includes(m.racer)) m.racer = m.racers[0];
  if (!m.bodies.includes(m.body)) m.body = m.bodies[0];
  if (!m.paints.includes(m.paint)) m.paint = 'stock';
  delete m.sync;
  return m;
}

// Stamp both devices with the shared totals after a sync.
function stamp(c, id) {
  const counts = {};
  for (const [k, v] of Object.entries(c.stats || {})) if (typeof v === 'number') counts[k] = v;
  c.sync = { id, at: Date.now(), base: { xp: num(c.xp), coins: num(c.coins), earned: num(c.earned), freeCaps: num(c.freeCaps), stats: counts } };
  return c;
}

export function mergeRecords(A = {}, B = {}) {
  const m = {};
  for (const k of union(Object.keys(A), Object.keys(B))) {
    const a = A[k], b = B[k];
    if (k === 'found') {
      m.found = {};
      for (const t of union(Object.keys(a || {}), Object.keys(b || {}))) m.found[t] = union((a || {})[t], (b || {})[t]);
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      m[k] = {};
      for (const f of union(Object.keys(a), Object.keys(b))) {
        const va = a[f], vb = b[f];
        m[k][f] = typeof va === 'number' && typeof vb === 'number' ? Math.min(va, vb) : va ?? vb;
      }
    } else if (typeof a === 'string' && typeof b === 'string') {
      m[k] = parseInt(a, 10) <= parseInt(b, 10) ? a : b; // cup places like "1st"
    } else m[k] = a ?? b;
  }
  return m;
}

function ghostTimes() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(GHOST)) continue;
      try { out[k.slice(GHOST.length)] = JSON.parse(localStorage.getItem(k)).time; } catch (e) { /* skip */ }
    }
  } catch (e) { /* storage blocked */ }
  return out;
}

function readGhost(key) {
  try { return localStorage.getItem(GHOST + key); } catch (e) { return null; }
}

function writeGhost(key, raw) {
  try {
    const g = JSON.parse(raw);
    if (typeof g.time !== 'number' || typeof g.data !== 'string') return;
    const old = readGhost(key);
    if (old && JSON.parse(old).time <= g.time) return;
    localStorage.setItem(GHOST + key, raw);
  } catch (e) { /* ignore bad data or a full storage */ }
}

export class Sync {
  constructor(app) {
    this.app = app;
    this.t = null;
    this.code = params.get('sync') ? params.get('sync').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : '';
    this.peer = null;
    this.from = 'title';
    $('sync-join').addEventListener('click', () => this.join());
    $('sync-show').addEventListener('click', () => this.host());
  }

  get wanted() { return !!this.code; }

  open(from = 'title') {
    this.from = from;
    this.back = this.app.ui.returnTo;
    this._reset();
    this.app.ui.show('sync');
    if (this.code) $('sync-code-in').value = this.code;
    if (!NetSession.supported()) this._say('Open the game in its own browser tab (not inside another page) to sync.');
    else this._say(this.code ? 'Tap Sync to bring your progress over.' : 'Show a code on one device, then type or scan it on the other.');
  }

  close() {
    this._reset();
    this.code = '';
    if (params.get('sync')) history.replaceState(null, '', location.pathname + (params.get('net') ? `?net=${params.get('net')}` : ''));
    if (this.from === 'settings') this.app.ui.overlay('settings', this.back || 'title');
    else this.app.ui.title();
  }

  _reset() {
    if (this.t) this.t.close();
    this.t = null;
    this.peer = null;
    $('sync-qr-wrap').hidden = true;
    $('sync-done').hidden = true;
  }

  _say(msg) { $('sync-status').textContent = msg; }

  _url(code) {
    const u = new URL(location.href);
    u.hash = '';
    const keep = new URLSearchParams();
    for (const k of ['net', 'peerhost', 'peerport', 'peerpath']) if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k));
    keep.set('sync', code);
    u.search = keep.toString();
    return u.toString();
  }

  // This device shows a code and does the merging.
  async host() {
    this._reset();
    const code = makeCode();
    $('sync-code').textContent = code;
    const qr = qrcode(0, 'M');
    qr.addData(this._url(code));
    qr.make();
    const n = qr.getModuleCount(), cell = Math.max(3, Math.floor(170 / (n + 8))), size = cell * (n + 8);
    const cv = $('sync-qr');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1d1537';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
    $('sync-qr-wrap').hidden = false;
    this._say('Getting a code…');
    this.t = transport({
      join: (id) => { this.peer = id; this._say('Connected. Syncing…'); },
      leave: () => {},
      message: (id, m) => this._hostMsg(id, m),
      error: () => {},
    });
    try {
      await this.t.start('host', code);
      this._say('On your other device: scan the code, or open Settings → Sync progress and type it.');
    } catch (e) {
      this.t = null;
      this._say(`Couldn't reach the pairing server. Check the internet connection. (${e.message || e})`);
    }
  }

  _hostMsg(id, m) {
    if (!m || id !== this.peer) return;
    const app = this.app;
    if (m.t === 'sync' && m.career && typeof m.career === 'object') {
      const merged = stamp(mergeCareer(app.career, m.career), Math.random().toString(36).slice(2, 10));
      const records = mergeRecords(app.records, m.records || {});
      this._apply(merged, records);
      // Ghosts: send ours where they're faster, ask for theirs where they are.
      const mine = ghostTimes(), theirs = m.ghosts || {};
      const want = Object.keys(theirs).filter((k) => !(k in mine) || theirs[k] < mine[k]);
      this.t.send(id, { t: 'synced', career: merged, records, want });
      for (const k of Object.keys(mine)) if (!(k in theirs) || mine[k] < theirs[k]) {
        const raw = readGhost(k);
        if (raw) this.t.send(id, { t: 'ghost', k, g: raw });
      }
      this._done();
    } else if (m.t === 'ghost' && typeof m.k === 'string') {
      writeGhost(m.k, m.g);
    }
  }

  // This device typed or scanned the code.
  async join() {
    const code = $('sync-code-in').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length !== 4) { this._say('The code has 4 letters.'); return; }
    this._reset();
    this._say('Connecting…');
    this.t = transport({
      join: () => {},
      leave: () => {},
      message: (id, m) => this._guestMsg(m),
      error: () => {},
    });
    try {
      await this.t.start('guest', code);
    } catch (e) {
      this.t = null;
      this._say(e.message || 'Could not connect. Check the code and try again.');
      return;
    }
    this._say('Connected. Syncing…');
    this.t.send('host', { t: 'sync', v: 1, career: this.app.career, records: this.app.records, ghosts: ghostTimes() });
  }

  _guestMsg(m) {
    if (!m) return;
    if (m.t === 'synced' && m.career && typeof m.career === 'object') {
      this._apply({ ...newCareer(), ...m.career }, m.records || {});
      for (const k of m.want || []) {
        const raw = readGhost(k);
        if (raw) this.t.send('host', { t: 'ghost', k, g: raw });
      }
      this._done();
    } else if (m.t === 'ghost' && typeof m.k === 'string') {
      writeGhost(m.k, m.g);
    }
  }

  _apply(career, records) {
    const app = this.app;
    app.career = career;
    saveCareer(career);
    app.records = records;
    saveRecords(records);
    // Reload through the normal loader so any fix-ups apply.
    app.career = loadCareer() || career;
    app.careerUI.ci = null;
    app.ui.refreshChip();
  }

  _done() {
    const c = this.app.career;
    const lv = levelOf(c.xp || 0).level;
    $('sync-done').hidden = false;
    $('sync-done').innerHTML = `✅ <b>Synced!</b> Both devices now have level ${lv}, 🪙 ${c.coins.toLocaleString('en-US')}, ${Object.keys(c.ach || {}).length} trophies and ${ownedCount(c)} prizes.`;
    this._say('You can sync again any time to bring them back in step.');
    this.app.audio.play('secret');
  }
}
