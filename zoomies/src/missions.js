import { rng } from './util.js';

// Daily missions: three small goals a day, the same for everyone on a given
// date (like the Daily Challenge). Progress is counted as races finish.
// Save field: c.missions = { day, prog: {id: n}, done: [ids], streak, last }
// where `last` is the latest day all three were done.

export const MISSION_XP = 100;

// gain(info) is how much one finished race adds. info comes from awardRace:
// { mode, place, gems, styleCounts, bike, pops }.
const sc = (info, ...labels) => labels.reduce((a, l) => a + ((info.styleCounts || {})[l] || 0), 0);
const race = (info) => info.mode !== 'battle' && info.mode !== 'demo' && !info.battle;
export const POOL = [
  { id: 'drift', icon: '🔥', text: 'Drift-boost 10 times', target: 10, gain: (i) => sc(i, 'SPARK BOOST', 'BLAZE BOOST', 'NOVA BOOST') },
  { id: 'finish', icon: '🏁', text: 'Finish 3 races', target: 3, gain: (i) => (race(i) ? 1 : 0) },
  { id: 'bike', icon: '🏍️', text: 'Win a race on a bike', target: 1, gain: (i) => (i.bike && i.place === 1 && race(i) && i.mode !== 'tt' ? 1 : 0) },
  { id: 'gems', icon: '💎', text: 'Collect 25 gems', target: 25, gain: (i) => i.gems || 0 },
  { id: 'short', icon: '🔍', text: 'Drive 3 shortcuts', target: 3, gain: (i) => sc(i, 'SHORTCUT') },
  { id: 'trick', icon: '🤸', text: 'Land 5 ramp tricks', target: 5, gain: (i) => sc(i, 'TRICK') },
  { id: 'pop', icon: '🎈', text: 'Pop 5 balloons in a battle', target: 5, gain: (i) => i.pops || 0 },
  { id: 'top3', icon: '🥉', text: 'Finish a race in the top 3', target: 1, gain: (i) => (race(i) && i.mode !== 'tt' && i.place >= 1 && i.place <= 3 ? 1 : 0) },
  { id: 'hit', icon: '🎯', text: 'Hit 3 rivals with items', target: 3, gain: (i) => sc(i, 'HIT') },
  { id: 'clean', icon: '✨', text: 'Drive a lap without touching a wall', target: 1, gain: (i) => sc(i, 'CLEAN LAP') },
  { id: 'pass', icon: '⏩', text: 'Overtake 10 racers', target: 10, gain: (i) => sc(i, 'OVERTAKE') },
  { id: 'start', icon: '🚀', text: 'Nail a perfect start', target: 1, gain: (i) => sc(i, 'PERFECT START') },
];

export function dayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayBefore(day) {
  const [y, m, d] = day.split('-').map(Number);
  return dayStr(new Date(y, m - 1, d - 1));
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Three different goals, the same for everyone on a given day.
export function missionsFor(day = dayStr()) {
  const r = rng(hashStr(`zoomies-missions-${day}`) % 100000 + 1);
  const pool = POOL.slice();
  const out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

export const emptyMissions = () => ({ day: '', prog: {}, done: [], streak: 0, last: '' });

// Today's missions with progress; reads only (a new day shows zero progress).
export function missionView(c, day = dayStr()) {
  const m = c.missions && c.missions.day === day ? c.missions : emptyMissions();
  return missionsFor(day).map((g) => ({ ...g, prog: Math.min(m.prog[g.id] || 0, g.target), done: m.done.includes(g.id) }));
}

// The streak still counts if all three were done today or yesterday.
export function missionStreak(c, day = dayStr()) {
  const m = c.missions || emptyMissions();
  return m.last === day || m.last === dayBefore(day) ? m.streak : 0;
}

export const missionsAllDone = (c, day = dayStr()) => missionView(c, day).every((g) => g.done);

// Count a finished race. Returns what changed so the results screen can show
// it: { xp, gained: [{...goal, prog, was, done, justDone}], all, capsule }.
// The caller adds `xp` to the race's XP; the free capsule is already counted.
export function bumpMissions(c, info, day = dayStr()) {
  if (!c.missions || c.missions.day !== day) c.missions = { ...emptyMissions(), streak: (c.missions || {}).streak || 0, last: (c.missions || {}).last || '', day };
  const m = c.missions;
  const gained = [];
  let xp = 0;
  for (const g of missionsFor(day)) {
    if (m.done.includes(g.id)) continue;
    const add = Math.max(0, Math.floor(g.gain(info) || 0));
    if (!add) continue;
    const was = m.prog[g.id] || 0;
    const prog = Math.min(g.target, was + add);
    m.prog[g.id] = prog;
    const justDone = prog >= g.target;
    if (justDone) { m.done.push(g.id); xp += MISSION_XP; }
    gained.push({ ...g, prog, was, done: justDone, justDone });
  }
  let capsule = false;
  const all = missionsFor(day).every((g) => m.done.includes(g.id));
  if (all && m.last !== day) {
    m.streak = m.last === dayBefore(day) ? m.streak + 1 : 1;
    m.last = day;
    c.freeCaps = (c.freeCaps || 0) + 1;
    capsule = true;
  }
  return { xp, gained, all: capsule, capsule };
}
