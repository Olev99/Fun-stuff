import { TRACKS } from './tracks.js';
import { DAILY_MODS, grant } from './profile.js';
import { rng } from './util.js';

// Weekly Cup: one special Grand Prix per ISO week (UTC), the same for everyone,
// with one twist from the Daily list. Retry it all week; the best placing counts.
// Save field: c.weekly = { week, best, trophies, streak, last, capGiven }
// week = this week's key ('2026-W43'), best = best cup placing this week (0 = none),
// trophies = weeks with a podium, last = latest podium week, capGiven = weeks that paid the capsule.

export const WEEKLY_XP = [500, 350, 250]; // 1st, 2nd, 3rd; finishing at all is WEEKLY_XP_BASE
export const WEEKLY_XP_BASE = 150;
export const xpFor = (place) => (place >= 1 ? WEEKLY_XP[place - 1] || WEEKLY_XP_BASE : 0);
export const emptyWeekly = () => ({ week: '', best: 0, trophies: [], streak: 0, last: '', capGiven: [] });

const DAY = 864e5;
const p2 = (n) => String(n).padStart(2, '0');

// ISO week key of a moment, in UTC (the week starts Monday 00:00 UTC).
export function weekOf(d = new Date()) {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const thu = t + (3 - ((new Date(t).getUTCDay() + 6) % 7)) * DAY; // Thursday of this week decides the ISO year
  const y = new Date(thu).getUTCFullYear();
  return `${y}-W${p2(Math.floor((thu - Date.UTC(y, 0, 1)) / DAY / 7) + 1)}`;
}

// Start of a week key (Monday 00:00 UTC) in ms.
export function weekStart(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = Date.UTC(y, 0, 4);
  return jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + (w - 1) * 7 * DAY;
}

export const prevWeek = (key) => weekOf(new Date(weekStart(key) - DAY));
export const weekNum = (key) => parseInt(key.split('-W')[1], 10);
export const msLeft = (d = new Date()) => weekStart(weekOf(d)) + 7 * DAY - d.getTime();

export function timeLeftText(d = new Date()) {
  const m = Math.floor(msLeft(d) / 6e4), days = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return days ? `${days}d ${h}h left` : h ? `${h}h ${m % 60}m left` : `${m}m left`;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Twists that work for a whole cup. The Gem Rush goal is a Daily thing, so it stays out.
export const WEEKLY_MODS = DAILY_MODS.filter((m) => !m.gems);
const POOL = TRACKS.filter((t) => t.size !== 'Epic'); // Epic adventures are one-lap journeys, not cup tracks

// The same cup for everyone in a given week: 4 different tracks of mixed size.
export function weeklyFor(week = weekOf()) {
  const r = rng(hashStr(`zoomies-weekly-${week}`) % 100000 + 1);
  const pool = POOL.slice();
  const picks = [];
  while (picks.length < 4) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  // Mixed size: if all four match, the last one is swapped for the next track of another size.
  if (picks.every((t) => t.size === picks[0].size)) picks[3] = pool.find((t) => t.size !== picks[0].size);
  const mod = WEEKLY_MODS[Math.floor(r() * WEEKLY_MODS.length)];
  const cls = mod.cls || ['zoom', 'zoom', 'turbo'][Math.floor(r() * 3)];
  const diff = mod.diff || (r() < 0.5 ? 'normal' : 'hard');
  return { week, tracks: picks.map((t) => t.id), cls, diff, mod, name: `Week ${weekNum(week)} Cup` };
}

// This week's record; a new week starts with no placing (trophies and streak stay).
export function weeklyState(c, week = weekOf()) {
  const w = (c.weekly = c.weekly || emptyWeekly());
  if (w.week !== week) { w.week = week; w.best = 0; }
  return w;
}

// Podium weeks in a row, still alive if the last one was this week or last week.
export function weeklyStreak(c, week = weekOf()) {
  const w = c.weekly || emptyWeekly();
  return w.last === week || w.last === prevWeek(week) ? w.streak : 0;
}

// Best cup placing this week (0 = none yet), without touching the save.
export const weeklyBest = (c, week = weekOf()) => (c.weekly && c.weekly.week === week ? c.weekly.best : 0);

// Record a finished cup (place 1-8). Pays XP only for the part of this week's
// maximum not yet earned, so retries cannot farm. Returns the summary.
export function weeklyFinish(c, place, week = weekOf()) {
  const w = weeklyState(c, week);
  const was = w.best;
  const improved = !was || place < was;
  const xp = improved ? xpFor(place) - xpFor(was) : 0;
  if (improved) w.best = place;
  let capsule = false, trophy = false;
  if (place <= 3 && !w.trophies.includes(week)) {
    trophy = true;
    w.trophies.push(week);
    w.streak = w.last === prevWeek(week) ? w.streak + 1 : 1;
    w.last = week;
  }
  if (place <= 3 && !w.capGiven.includes(week)) {
    capsule = true;
    w.capGiven.push(week);
    c.freeCaps = (c.freeCaps || 0) + 1;
  }
  return { ...grant(c, 0, xp), place, improved, was, trophy, capsule, streak: w.streak, best: w.best };
}
