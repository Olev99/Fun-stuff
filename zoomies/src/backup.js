import { b64uEncode, b64uDecode, gzip, gunzip } from './ghostlink.js';
import { cleanCareer, saveCareer, loadCareer, chaptersDone, CHAPTERS } from './career.js';
import { mergeCareer, mergeRecords, cleanRecords, writeGhost, GHOST_KEY } from './sync.js';
import { parseGhost, ghostJSON } from './ghost.js';
import { DEFAULTS, saveSettings, saveRecords } from './settings.js';
import { rankInfo } from './league.js';
import { levelOf } from './profile.js';
import { cleanNick } from './nametags.js';

// Backup codes: everything that matters (the Career save, the settings worth
// keeping, records and best-lap ghosts) as one line of text that can be saved
// in Notes or sent to yourself:  ZB1 . base64url(gzip(JSON)) . checksum
// A pasted code is hostile input: size-capped, checksummed, decompressed with
// a bomb guard, and every part goes through the same validators as a synced
// save. Reading a code never throws; it returns { error } instead.

const PREFIX = 'ZB1';
const MAX_CODE = 1_200_000; // characters pasted
const MAX_BYTES = 800_000; // compressed
const MAX_RAW = 4 * 1024 * 1024; // decompressed
const GHOST_BUDGET = 160_000; // characters of ghost data a code carries
const GHOST = 'zoomies.ghost.v1.';
// Device-specific settings (steering, tilt, graphics) stay on the device.
const SETTING_KEYS = ['vehicle', 'music', 'musicVol', 'sfx', 'sfxVol', 'speedClass', 'difficulty', 'char', 'track', 'reverse', 'name', 'tags', 'assist', 'shake', 'cup', 'arena', 'introDone', 'lessonsDone'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// FNV-1a over the compressed bytes: catches a code that was cut or mistyped before it is unpacked.
function fnv(u8) {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function collectGhosts() {
  const out = {};
  let used = 0;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(GHOST)) keys.push(k.slice(GHOST.length));
    }
    for (const k of keys.sort()) {
      const raw = localStorage.getItem(GHOST + k);
      const g = GHOST_KEY.test(k) ? parseGhost(raw) : null;
      if (!g || used + g.data.length > GHOST_BUDGET) continue;
      used += g.data.length;
      out[k] = JSON.parse(ghostJSON(g));
    }
  } catch (e) { /* storage blocked: no ghosts */ }
  return out;
}

// { career, settings, records } -> { code, ghosts }. Ghosts are optional (they make the code longer).
export async function buildBackup({ career, settings, records }, { ghosts = true } = {}) {
  const g = ghosts ? collectGhosts() : {};
  const s = {};
  for (const k of SETTING_KEYS) if (settings && settings[k] !== undefined) s[k] = settings[k];
  const bytes = await gzip(new TextEncoder().encode(JSON.stringify({ app: 'zoomies', at: Date.now(), career, settings: s, records: records || {}, ghosts: g })));
  return { code: `${PREFIX}.${b64uEncode(bytes)}.${fnv(bytes)}`, ghosts: Object.keys(g).length };
}

function cleanSettings(s) {
  const out = {};
  if (!isObj(s)) return out;
  for (const k of SETTING_KEYS) {
    let v = s[k];
    const ok = typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6) || (typeof v === 'string' && v.length <= 64);
    if (!ok || (k in DEFAULTS && typeof DEFAULTS[k] !== typeof v)) continue;
    if (k === 'musicVol' || k === 'sfxVol') v = Math.min(1, Math.max(0, v));
    out[k] = k === 'name' ? cleanNick(v) : v;
  }
  return out;
}

// Pasted text -> { career, settings, records, ghosts, at } (all validated), or { error }.
export async function readBackup(text) {
  try {
    const t = String(text || '').replace(/\s+/g, '');
    if (!t) return { error: 'Paste your backup code first.' };
    if (t.length > MAX_CODE) return { error: 'That is too long to be a Zoomies backup code.' };
    const m = /^(ZB\d{1,3})\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(t);
    if (!m) return { error: 'That does not look like a Zoomies backup code. Copy the whole code, starting with ZB1.' };
    if (m[1] !== PREFIX) return { error: 'This backup comes from a different version of Zoomies. Update the game and try again.' };
    const bytes = b64uDecode(m[2]);
    if (!bytes || bytes.length > MAX_BYTES) return { error: 'That code is not a valid backup.' };
    if (fnv(bytes) !== m[3]) return { error: 'The code is damaged: part of it is missing or changed. Copy it again.' };
    const raw = await gunzip(bytes, MAX_RAW);
    if (!raw) return { error: 'That code is not a valid backup.' };
    const d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    if (!isObj(d) || d.app !== 'zoomies') return { error: 'That code is not a Zoomies backup.' };
    const career = cleanCareer(d.career);
    if (!career) return { error: 'The save inside that code is not valid.' };
    const ghosts = {};
    if (isObj(d.ghosts)) {
      for (const [k, v] of Object.entries(d.ghosts).slice(0, 200)) {
        const g = GHOST_KEY.test(k) ? parseGhost(JSON.stringify(v)) : null;
        if (g) ghosts[k] = ghostJSON(g);
      }
    }
    return { career, settings: cleanSettings(d.settings), records: cleanRecords(d.records), ghosts, at: Number.isFinite(d.at) ? d.at : 0 };
  } catch (e) {
    return { error: 'Could not read that code. Copy it again, all of it.' };
  }
}

// What a restored backup holds, for the preview.
export function describeBackup(b) {
  const c = b.career;
  return { level: levelOf(c.xp || 0).level, coins: c.coins || 0, chapters: chaptersDone(c), chaptersTotal: CHAPTERS.length, rank: rankInfo(c).rank, ghosts: Object.keys(b.ghosts).length, at: b.at };
}

// Put a read backup on this device ('merge' combines it with the save here,
// 'replace' makes this device exactly the backup, keeping only device-specific
// settings). The caller reloads the page afterwards so every screen starts clean.
export function applyBackup(app, b, mode) {
  let career, records;
  if (mode === 'replace') {
    career = b.career;
    records = b.records;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(GHOST)) localStorage.removeItem(k);
      }
      for (const [k, raw] of Object.entries(b.ghosts)) localStorage.setItem(GHOST + k, raw);
    } catch (e) { /* storage full or blocked */ }
    app.settings = { ...app.settings, ...b.settings };
    saveSettings(app.settings);
  } else {
    career = mergeCareer(app.career, b.career);
    records = mergeRecords(app.records, b.records);
    for (const [k, raw] of Object.entries(b.ghosts)) writeGhost(k, raw);
  }
  saveCareer(career);
  saveRecords(records);
  app.career = loadCareer() || career;
  app.records = records;
}
