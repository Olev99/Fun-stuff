// A cup in progress (Grand Prix, Weekly Cup or a Career cup such as the Golden
// Wheel) survives a reload, a lost GPU context or a closed tab: main.js saves the
// standings after each race, and the title screen offers "Resume cup" for a day.
// The save is checked like any other stored data before it is used.
import { CUPS } from './tracks.js';
import { RACER_IDS } from './mastery.js';
import { eventById } from './career.js';
import { weekOf, weeklyFor } from './weekly.js';
import { store } from './ledger.js';

const KEY = 'zoomies-cup-v1';
const DAY = 864e5;
const CLASSES = ['chill', 'zoom', 'turbo'];
const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

// `gp` is main.js's cup state with its index on the race just finished.
export function saveCup(gp, attempt = 0) {
  const kind = gp.careerEv ? 'career' : gp.weekly ? 'weekly' : 'gp';
  const id = kind === 'career' ? gp.careerEv.id : kind === 'weekly' ? gp.weekly.week : gp.cup.id;
  store(KEY, JSON.stringify({
    v: 1, t: Date.now(), kind, id, attempt, next: gp.index + 1, cls: gp.speedClass, player: gp.player,
    field: gp.field, points: gp.points, wins: gp.wins || 0, gems: gp.gems || 0,
  }), 'cup');
}

export function clearCup() {
  try { localStorage.removeItem(KEY); } catch (e) { /* nothing saved */ }
}

// The saved cup, or null (and the save is dropped) when it is missing, too old or not valid.
export function loadCup(now = Date.now()) {
  let raw = null, r = null;
  try { raw = localStorage.getItem(KEY); r = JSON.parse(raw); } catch (e) { /* unreadable */ }
  const ok = checkCup(r, now);
  if (!ok && raw !== null) clearCup();
  return ok || null;
}

export function checkCup(r, now = Date.now()) {
  if (!r || typeof r !== 'object' || r.v !== 1 || !(now - r.t >= -60e3 && now - r.t <= DAY)) return null;
  let tracks = null, name = '';
  if (r.kind === 'gp') {
    const cup = CUPS.find((c) => c.id === r.id);
    if (cup) [tracks, name] = [cup.tracks, cup.name];
  } else if (r.kind === 'weekly') {
    if (r.id === weekOf(new Date(now))) { const w = weeklyFor(r.id); [tracks, name] = [w.tracks, w.name]; }
  } else if (r.kind === 'career') {
    const e = typeof r.id === 'string' && eventById(r.id);
    if (e && e.ev.type === 'cup' && int(r.attempt, 1, 1e6)) [tracks, name] = [e.ev.tracks, e.ev.title];
  }
  if (!tracks || !int(r.next, 1, tracks.length) || !CLASSES.includes(r.cls)) return null;
  const f = r.field;
  if (!Array.isArray(f) || f.length < 2 || f.length > 8 || new Set(f).size !== f.length || !f.every((id) => RACER_IDS.includes(id)) || !f.includes(r.player)) return null;
  const p = r.points;
  if (!p || typeof p !== 'object' || Object.keys(p).length !== f.length || !f.every((id) => int(p[id], 0, 999))) return null;
  if (!int(r.wins, 0, r.next) || !int(r.gems, 0, 9999)) return null;
  return {
    kind: r.kind, id: r.id, attempt: r.attempt | 0, next: r.next, cls: r.cls, player: r.player, field: f.slice(),
    points: Object.fromEntries(f.map((id) => [id, p[id]])), wins: r.wins, gems: r.gems, name, races: tracks.length,
  };
}
