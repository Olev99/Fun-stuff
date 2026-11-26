// Same progress on your phone and your Mac, without accounts or a server.
// One device shows a code (and a QR code), the other types or scans it, and
// they connect straight to each other over WebRTC (PeerJS broker, 'sync'
// namespace). Both devices merge the two saves the same way and end up identical.
//
// THE LEDGER (save field `led`, code in ledger.js and career.js)
// Merging must give the same result in any order, any number of times, across
// any number of devices, and must never refund spending or lose earnings. So
// the numbers that go up and down are not stored as totals but as grow-only
// counters per device (a G-counter CRDT), merged by per-device, per-key max:
//
//   led = {
//     v: 1,                       format (FMT); sync and backups refuse another one
//     d: { <deviceId>: {          one entry per install (ledger.js deviceId, kept in
//                                 localStorage 'zoomies-device', never in a save)
//       t,                        last change (ms), only to pick entries to fold
//       e, s,                     coins earned, coins spent
//       n,                        lifetime earned (the `earned` field)
//       ke, ku,                   free capsules earned, used
//       x,                        XP
//       st: { stat: n },          lifetime stat counters (not bests like dodgeBest)
//       pa: { part: n }, ps: { part: n }, pv: { part: coins }   parts acquired, sold, sale coins
//     } },
//     gone: [ids],                devices folded into '~' (ignored if they come back)
//     cl: { dd, md, wk },         claim bit sets (hex): Daily, all-missions days, Weekly weeks
//     pt, ph, lt, lh,             when and what (hash) you drive and wear, and the fitted
//                                 parts, were last changed (each taken from the newer side)
//     off,                        clamp offsets of the numbers last shown (local bookkeeping)
//   }
//
// Visible values are derived, never merged directly:
//   coins    = sum(e) - sum(s) + one-off coins - coins of sales of a copy sold twice
//   freeCaps = sum(ke) - sum(ku) + one-off capsules
//   parts    = sum(pa) + parts dropped by events - sum(ps)   (shown up to MAX_PARTS)
//   xp = sum(x), stats = sum(st), earned = sum(n) + one-off coins
// One-off rewards pay once across all devices because they come from merged claim
// markers, not from a device's counters: first clears (`done`, union) and stars
// (`stars`, max) of Career and League events, trophies (`ach`, union), level
// capsules (`lvlPaid`, max), mastery capsules (`mastery.capLevels`, max), event part
// drops (`drops`, union) and the day/week bit sets (OR). A device that pays one
// writes the marker and the coins together, so its own ledger never counts it.
// The save's own fields are reconciled into this device's entry on every save
// (career.js reconcile): rises are earnings, drops spending. A save from elsewhere
// is shown only as its ledger says (cleanCareer(save, null)).
//
// Old saves (no `led`) become one entry of a synthetic device named after their
// lineage, 'L' + their old sync id: two copies of the same old save are taken whole
// (more XP wins, then less money left), so restoring an old backup again adds nothing.
// More than MAX_DEV devices: the least recently active fold into '~'.
// Everything else merges by union, max or min; what you drive and wear, and the
// fitted parts, come from the save that changed them last.

import qrcode from '../vendor/qrcode.mjs';
import { PeerTransport, LocalTransport, NetSession, makeCode } from './net.js';
import { saveCareer, loadCareer, newCareer, cleanCareer, BEST_STATS } from './career.js';
import { parseGhost, ghostJSON } from './ghost.js';
import { saveRecords } from './settings.js';
import { levelOf } from './profile.js';
import { ownedCount } from './cosmetics.js';
import { TRACKS } from './tracks.js';
import { FMT, deviceId, joinLedger, prefsWinner, store } from './ledger.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const transport = (cb) => (params.get('net') === 'local' ? new LocalTransport(cb, 'sync') : new PeerTransport(cb, 'sync'));
const GHOST = 'zoomies.ghost.v1.';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
// Set-like lists merge as a sorted union, so the result is the same in any order.
const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])].sort();
// The other device's data is checked before it is merged or stored.
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
// Ghost keys: a real track id, plus '-r' for reverse.
const GHOST_KEYS = new Set(TRACKS.flatMap((t) => [t.id, `${t.id}-r`]));
export const GHOST_KEY = { test: (k) => typeof k === 'string' && GHOST_KEYS.has(k) };
export const MAX_PEER_GHOST = 120_000; // characters of one ghost a peer or backup may write (about 9 minutes)
// Either of two values for the same key, the same whichever side it is on.
const pick = (a, b) => (a === undefined ? b : b === undefined ? a : JSON.stringify(a) >= JSON.stringify(b) ? a : b);

// Records: { trackKey: { tt, lap }, 'cup:id': '1st', battle: { arena: wins }, found: { track: [names] } }.
export function cleanRecords(r) {
  const out = {};
  if (!isObj(r)) return out;
  const field = (x) => x === null || Number.isFinite(x) || (Array.isArray(x) && x.length <= 100 && x.every((y) => (typeof y === 'string' && y.length <= 64) || Number.isFinite(y)));
  for (const [k, v] of Object.entries(r).slice(0, 2000)) {
    if (UNSAFE.has(k) || k.length > 64) continue;
    if (typeof v === 'string' && v.length <= 16) out[k] = v;
    else if (isObj(v)) {
      out[k] = {};
      for (const [f, x] of Object.entries(v).slice(0, 500)) if (!UNSAFE.has(f) && f.length <= 64 && field(x)) out[k][f] = x;
    }
  }
  return out;
}

// Merge a save from this device (A) with one from elsewhere (B). A is first brought up to date
// with this device's changes (`dev`); B counts only as far as its ledger goes. dev = null merges
// two saves that are both treated as from elsewhere (tests: the pure join).
export function mergeCareer(A, B, dev = deviceId()) {
  const a = cleanCareer(A, dev) || cleanCareer(newCareer(), null), b = cleanCareer(B, null) || cleanCareer(newCareer(), null);
  const aWins = prefsWinner(a.led, b.led) === 'a';
  const win = aWins ? a : b, other = aWins ? b : a;
  // What you drive and wear, the fitted parts and unknown fields from newer versions: the save that changed them last.
  const m = { ...other, ...win };
  m.led = joinLedger(a.led, b.led);
  m.lvlPaid = Math.max(num(a.lvlPaid), num(b.lvlPaid));
  for (const k of ['racers', 'bodies', 'paints', 'beaten', 'cos']) m[k] = union(a[k], b[k]);
  m.champion = !!(a.champion || b.champion);
  // A bounded "highest day seen" (economy rules): the later one.
  const dm = [a.dayMax, b.dayMax].filter((x) => x !== undefined);
  if (dm.length) m.dayMax = dm.reduce((p, q) => (q > p ? q : p));
  const maxOf = (x, y) => {
    const out = {};
    for (const k of union(Object.keys(x || {}), Object.keys(y || {}))) out[k] = Math.max(num((x || {})[k]), num((y || {})[k]));
    return out;
  };
  const both = (x, y, f) => {
    const out = {};
    for (const k of union(Object.keys(x || {}), Object.keys(y || {}))) out[k] = f((x || {})[k], (y || {})[k]);
    return out;
  };
  // Parts (Gramps's Workshop): owned, sold and sale coins come from the ledger; extra sockets
  // and the copies bought (full sale price) take the higher; drops are claims (union).
  m.bought = maxOf(a.bought, b.bought);
  m.sockets = maxOf(a.sockets, b.sockets);
  m.drops = both(a.drops, b.drops, pick);
  m.pnew = !!(a.pnew || b.pnew);
  m.loadouts = (prefsWinner(a.led, b.led, 'lt', 'lh') === 'a' ? a : b).loadouts;
  m.upgrades = {};
  m.pv = 2;
  // Career events: most stars, first clears, best times.
  m.stars = maxOf(a.stars, b.stars);
  m.done = both(a.done, b.done, pick);
  m.seen = both(a.seen, b.seen, pick);
  m.best = both(a.best, b.best, (va, vb) => (typeof va === 'number' && typeof vb === 'number' ? Math.min(va, vb) : va ?? vb));
  // Trophies: keep the earliest unlock date.
  m.ach = both(a.ach, b.ach, (va, vb) => (typeof va === 'number' && typeof vb === 'number' ? Math.min(va, vb) : pick(va, vb)));
  // Lifetime stats: counters come from the ledger, lists are combined, bests take the higher.
  const sa = a.stats || {}, sb = b.stats || {};
  m.stats = {};
  for (const k of union(Object.keys(sa), Object.keys(sb))) {
    if (Array.isArray(sa[k]) || Array.isArray(sb[k])) m.stats[k] = union(sa[k], sb[k]).slice(0, 1000);
    else if (BEST_STATS.includes(k)) m.stats[k] = Math.max(num(sa[k]), num(sb[k]));
  }
  m.evSeen = union(a.evSeen, b.evSeen);
  // Daily challenge: the latest day done (its streak), the longer best streak.
  const da = a.daily, db = b.daily;
  const later = da.done > db.done || (da.done === db.done && da.streak >= db.streak) ? da : db;
  m.daily = { done: later.done, streak: later.streak, best: Math.max(da.best, db.best) };
  // Daily missions: the newest day; on the same day the best progress and every finished goal.
  // The streak comes from whichever finished a day last (the longer one on a tie).
  const ma = a.missions, mb = b.missions;
  const day = ma.day > mb.day ? ma.day : mb.day;
  const same = [ma, mb].filter((x) => x.day === day);
  const lastM = ma.last > mb.last || (ma.last === mb.last && ma.streak >= mb.streak) ? ma : mb;
  m.missions = { day, prog: {}, done: [], streak: lastM.streak, last: lastM.last };
  for (const x of same) { m.missions.prog = maxOf(m.missions.prog, x.prog); m.missions.done = union(m.missions.done, x.done); }
  // Weekly Cup: the newer week wins (same week: best placing, 0 = none). Streak
  // and last podium week come from the save that played a podium latest.
  const wa = a.weekly, wb = b.weekly;
  const week = wa.week > wb.week ? wa.week : wb.week;
  const wLast = wa.last > wb.last || (wa.last === wb.last && wa.streak >= wb.streak) ? wa : wb;
  const wBest = [wa, wb].filter((x) => x.week === week && x.best > 0).map((x) => x.best);
  m.weekly = {
    week, best: wBest.length ? Math.min(...wBest) : 0, trophies: union(wa.trophies, wb.trophies).slice(-200),
    streak: wLast.streak, last: wLast.last, capGiven: union(wa.capGiven, wb.capGiven).slice(-12),
  };
  // Mastery: the higher XP of each racer and ride; capsules already paid is the higher count.
  m.mastery = { r: maxOf(a.mastery.r, b.mastery.r), b: maxOf(a.mastery.b, b.mastery.b), capLevels: Math.max(a.mastery.capLevels, b.mastery.capLevels) };
  // Make sure what you're driving is something you own.
  if (!m.racers.includes(m.racer)) m.racer = m.racers.includes('mochi') ? 'mochi' : m.racers[0];
  if (!m.bodies.includes(m.body)) m.body = m.bodies.includes('buggy') ? 'buggy' : m.bodies[0];
  if (!m.paints.includes(m.paint)) m.paint = 'stock';
  // Rebuild the visible numbers from the merged ledger and claims.
  return cleanCareer(m, null);
}

export function mergeRecords(A = {}, B = {}) {
  const m = {};
  for (const k of union(Object.keys(A), Object.keys(B))) {
    if (UNSAFE.has(k)) continue;
    const a = A[k], b = B[k];
    if (k === 'found') {
      m.found = {};
      for (const t of union(Object.keys(a || {}), Object.keys(b || {}))) m.found[t] = union((a || {})[t], (b || {})[t]);
    } else if (k === 'battle' && isObj(a) && isObj(b)) {
      // Balloon Battle wins per arena: a running count, so the higher one.
      m.battle = {};
      for (const f of union(Object.keys(a), Object.keys(b))) m.battle[f] = Math.max(num(a[f]), num(b[f]));
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      m[k] = {};
      for (const f of union(Object.keys(a), Object.keys(b))) {
        const va = a[f], vb = b[f];
        m[k][f] = typeof va === 'number' && typeof vb === 'number' ? Math.min(va, vb) : pick(va, vb);
      }
    } else if (typeof a === 'string' && typeof b === 'string') {
      const pa = parseInt(a, 10), pb = parseInt(b, 10);
      m[k] = pa < pb || (pa === pb && a <= b) ? a : b; // cup places like "1st"
    } else m[k] = pick(a, b);
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

// A ghost from another device or a backup: only for a real track, at most MAX_PEER_GHOST
// characters, and only when it is faster. Returns true when written.
export function writeGhost(key, raw) {
  if (!GHOST_KEY.test(key) || typeof raw !== 'string' || raw.length > MAX_PEER_GHOST + 400) return false;
  const g = parseGhost(raw);
  if (!g || g.data.length > MAX_PEER_GHOST) return false;
  const old = parseGhost(readGhost(key));
  if (old && old.time <= g.time) return false;
  g.at = Date.now();
  return store(GHOST + key, ghostJSON(g), 'ghost');
}

// The meta tag stamped by tools/stamp.mjs (shown in messages only).
const VERSION = (typeof document !== 'undefined' && document.querySelector && (document.querySelector('meta[name="zoomies-version"]') || {}).content) || 'dev';
const SKEW = 'The other device runs a different version of Zoomies. Reload the game on both devices (or update the Home Screen app) and sync again.';

export class Sync {
  constructor(app) {
    this.app = app;
    this.t = null;
    this.code = params.get('sync') ? params.get('sync').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : '';
    this.peer = null;
    this.got = new Set(); // ghost keys written this session (one each)
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
    this.got = new Set();
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
    if (m.t === 'sync' && isObj(m.career)) {
      // A different save format (an older or newer game) is refused, never half-merged.
      if (m.fmt !== FMT) { this.t.send(id, { t: 'refuse', fmt: FMT, ver: VERSION }); this._say(SKEW); return; }
      const merged = mergeCareer(app.career, m.career);
      const records = mergeRecords(app.records, cleanRecords(m.records));
      const ok = this._apply(merged, records);
      // Ghosts: send ours where they're faster, ask for theirs where they are.
      const mine = ghostTimes(), theirs = isObj(m.ghosts) ? m.ghosts : {};
      const want = Object.keys(theirs).filter((k) => GHOST_KEY.test(k) && Number.isFinite(theirs[k]) && (!(k in mine) || theirs[k] < mine[k]));
      this.want = new Set(want);
      this.t.send(id, { t: 'synced', fmt: FMT, ver: VERSION, career: app.career, records: app.records, want });
      for (const k of Object.keys(mine)) if (GHOST_KEY.test(k) && (!(k in theirs) || mine[k] < theirs[k])) {
        const raw = readGhost(k);
        if (raw) this.t.send(id, { t: 'ghost', k, g: raw });
      }
      this._done(ok);
    } else if (m.t === 'ghost' && this.want && this.want.delete(m.k)) {
      writeGhost(m.k, m.g); // only ghosts this device asked for, once each
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
    saveCareer(this.app.career); // bring the ledger up to date before it leaves this device
    this.t.send('host', { t: 'sync', v: 2, fmt: FMT, ver: VERSION, career: this.app.career, records: this.app.records, ghosts: ghostTimes() });
  }

  _guestMsg(m) {
    if (!m) return;
    if (m.t === 'refuse' || (m.t === 'synced' && m.fmt !== FMT)) { this._say(SKEW); return; }
    if (m.t === 'synced' && isObj(m.career)) {
      // Merging again here is safe (merging is idempotent) and keeps this device's own state if the reply was cut short.
      const ok = this._apply(mergeCareer(this.app.career, m.career), mergeRecords(this.app.records, cleanRecords(m.records)));
      for (const k of Array.isArray(m.want) ? m.want.slice(0, GHOST_KEYS.size) : []) {
        const raw = GHOST_KEY.test(k) ? readGhost(k) : null;
        if (raw) this.t.send('host', { t: 'ghost', k, g: raw });
      }
      this._done(ok);
    } else if (m.t === 'ghost' && GHOST_KEY.test(m.k) && !this.got.has(m.k)) {
      this.got.add(m.k); // one ghost per track from a peer, so it cannot fill the storage
      writeGhost(m.k, m.g);
    }
  }

  // Returns false when this device could not store the result.
  _apply(career, records) {
    const app = this.app;
    app.career = career;
    let ok = saveCareer(career);
    app.records = records;
    ok = saveRecords(records) && ok;
    // Reload through the normal loader so any fix-ups apply.
    app.career = (ok && loadCareer()) || career;
    app.careerUI.ci = null;
    app.ui.refreshChip();
    return ok;
  }

  _done(ok = true) {
    const c = this.app.career;
    const lv = levelOf(c.xp || 0).level;
    $('sync-done').hidden = false;
    $('sync-done').innerHTML = `✅ <b>Synced!</b> Both devices now have level ${lv}, 🪙 ${c.coins.toLocaleString('en-US')}, ${Object.keys(c.ach || {}).length} trophies and ${ownedCount(c)} prizes.`;
    this._say(ok ? 'You can sync again any time to bring them back in step.' : 'Synced, but this device could not save it (storage full or blocked). Make a backup code now.');
    this.app.audio.play('secret');
  }
}
