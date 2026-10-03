import { TRACKS, trackById } from './tracks.js';
import { BODY_LIST } from './karts.js';
import { ownedCount, COSMETIC_TOTAL, cosmeticById } from './cosmetics.js';
import { rng } from './util.js';

// The player profile lives in the career save (one wallet for everything):
// XP and levels from every race, coins from the career, lifetime stats,
// achievements and the daily challenge streak.

// ---------------- levels ----------------
// Each level takes longer than the last. A good racer (about 300 XP a race)
// needs about 6 races for level 5, 25 for level 10 and 100 for level 18.
export const xpToNext = (level) => 250 + 100 * (level - 1) + 8 * (level - 1) ** 2;

// The old, much faster curve; only used to avoid paying the same level
// rewards twice for saves from before the change.
export function oldLevel(xp) {
  let level = 1, left = xp;
  while (left >= 100 + 40 * (level - 1)) left -= 100 + 40 * (level - 1), level++;
  return level;
}

export function levelOf(xp) {
  let level = 1, need = xpToNext(1), left = xp;
  while (left >= need) {
    left -= need;
    level++;
    need = xpToNext(level);
  }
  return { level, into: left, need };
}

export const levelReward = (level) => 80 + 20 * level;

// ---------------- race rewards ----------------
const PLACE_COINS = [60, 45, 35, 28, 22, 16, 12, 8];
const PLACE_XP = [80, 60, 45, 35, 28, 20, 14, 10];

// Style labels from the race and the stat they count towards.
const STYLE_STATS = {
  'PERFECT START': ['perfect'], 'SPARK BOOST': ['turbos'], 'BLAZE BOOST': ['turbos'], 'NOVA BOOST': ['turbos', 'ultra'],
  TRICK: ['tricks'], HIT: ['hits'], SLIPSTREAM: ['slips'], 'CLEAN LAP': ['clean'], OVERTAKE: ['overtakes'], SHORTCUT: ['shortcutRuns'],
};

function addStat(c, k, n = 1) {
  c.stats = c.stats || {};
  c.stats[k] = (c.stats[k] || 0) + n;
}

function addToSet(c, k, v) {
  c.stats = c.stats || {};
  const a = (c.stats[k] = c.stats[k] || []);
  if (!a.includes(v)) a.push(v);
}

// Apply a finished race to the profile. info: { mode, place, gems, style,
// styleCounts, trackId, online, coins (override), xpBonus, careerCoins }.
// Returns what was earned, for the results screen.
export function awardRace(c, info) {
  const place = info.place || 0;
  let coins = 0, xp = 0;
  // Coins are only earned in the career (it passes them in); every other
  // mode pays XP.
  if (info.coins !== undefined) coins = info.coins;
  // Style points count for half, so levels come from racing well, not farming tricks.
  xp = (info.mode === 'tt' ? 50 : 40 + (PLACE_XP[place - 1] || 8)) + Math.round((info.style || 0) / 2) + (info.online ? 30 : 0) + (info.xpBonus || 0);
  // stats
  addStat(c, 'races');
  // Race wins and podiums (battles have their own trophy).
  if (info.mode !== 'tt' && info.mode !== 'battle') {
    if (place === 1) addStat(c, 'wins');
    if (place && place <= 3) addStat(c, 'podiums');
  }
  if (info.online) {
    addStat(c, 'mpRaces');
    if (place === 1) addStat(c, 'mpWins');
  }
  addStat(c, 'gems', info.gems || 0);
  if (info.trackId) addToSet(c, 'tracks', info.trackId);
  for (const [label, n] of Object.entries(info.styleCounts || {})) for (const st of STYLE_STATS[label] || []) addStat(c, st, n);
  return grant(c, coins, xp);
}

// Add coins and XP; handles level-ups.
export function grant(c, coins, xp) {
  const before = levelOf(c.xp || 0).level;
  c.xp = (c.xp || 0) + xp;
  const after = levelOf(c.xp).level;
  let levelCoins = 0;
  const ups = [], caps = [];
  // Free capsules are paid once per level, ever (even if a save's level
  // dropped when the curve got steeper).
  c.lvlPaid = c.lvlPaid || 1;
  for (let L = before + 1; L <= after; L++) {
    levelCoins += levelReward(L);
    ups.push(L);
    if (L % 5 === 0 && L > c.lvlPaid) { c.freeCaps = (c.freeCaps || 0) + 1; caps.push(L); }
  }
  c.lvlPaid = Math.max(c.lvlPaid, after);
  c.coins += coins;
  c.earned = (c.earned || 0) + coins;
  // Level-ups no longer pay coins (coins come from the career only).
  return { coins, xp, levelCoins: 0, ups, caps, level: after };
}

// ---------------- achievements ----------------
const S = (c, k) => (Array.isArray(c.stats[k]) ? c.stats[k].length : c.stats[k] || 0);
const count = (k, n) => ({ prog: (c) => [Math.min(S(c, k), n), n] });
const TOTAL_SHORTCUTS = TRACKS.reduce((a, t) => a + (t.shortcuts || []).length, 0);
const foundCount = (records) => Object.values((records && records.found) || {}).reduce((a, l) => a + l.length, 0);

export const ACHIEVEMENTS = [
  { id: 'race1', icon: '🏁', name: 'Green Flag', desc: 'Finish your first race', reward: 50, ...count('races', 1) },
  { id: 'races50', icon: '🛞', name: 'Road Warrior', desc: 'Finish 50 races', reward: 300, ...count('races', 50) },
  { id: 'races200', icon: '🗺️', name: 'Mileage Monster', desc: 'Finish 200 races', reward: 800, ...count('races', 200) },
  { id: 'win1', icon: '🥇', name: 'Winner!', desc: 'Win a race', reward: 100, ...count('wins', 1) },
  { id: 'win10', icon: '🏆', name: 'Serial Winner', desc: 'Win 10 races', reward: 300, ...count('wins', 10) },
  { id: 'win50', icon: '👑', name: 'Legend', desc: 'Win 50 races', reward: 1000, ...count('wins', 50) },
  { id: 'pod25', icon: '🥉', name: 'Podium Regular', desc: 'Finish in the top 3 25 times', reward: 250, ...count('podiums', 25) },
  { id: 'cup1', icon: '🏆', name: 'Cup Winner', desc: 'Win a Grand Prix cup', reward: 200, ...count('cups', 1) },
  { id: 'cup5', icon: '🗄️', name: 'Trophy Cabinet', desc: 'Win 5 different cups', reward: 600, ...count('cups', 5) },
  { id: 'perfect1', icon: '🚀', name: 'Rocket Science', desc: 'Nail a perfect start', reward: 50, ...count('perfect', 1) },
  { id: 'perfect25', icon: '🛫', name: 'Launch Control', desc: '25 perfect starts', reward: 300, ...count('perfect', 25) },
  { id: 'ultra1', icon: '💖', name: 'Supernova', desc: 'Fire a nova boost (hot pink sparks)', reward: 75, ...count('ultra', 1) },
  { id: 'ultra100', icon: '🌀', name: 'Drift King', desc: 'Fire 100 nova boosts', reward: 600, ...count('ultra', 100) },
  { id: 'turbo500', icon: '🔥', name: 'Sideways', desc: 'Fire 500 drift boosts', reward: 500, ...count('turbos', 500) },
  { id: 'trick50', icon: '🤸', name: 'Showboat', desc: 'Land 50 ramp tricks', reward: 300, ...count('tricks', 50) },
  { id: 'hit1', icon: '🎯', name: 'Bullseye', desc: 'Hit a racer with an item', reward: 50, ...count('hits', 1) },
  { id: 'hit100', icon: '💥', name: 'Menace', desc: 'Hit racers 100 times', reward: 500, ...count('hits', 100) },
  { id: 'slip50', icon: '💨', name: 'Drafting Pro', desc: 'Get 50 slipstream boosts', reward: 300, ...count('slips', 50) },
  { id: 'clean10', icon: '✨', name: 'Squeaky Clean', desc: 'Drive 10 laps without touching a wall', reward: 250, ...count('clean', 10) },
  { id: 'over100', icon: '⏩', name: 'Slalom Star', desc: 'Make 100 overtakes', reward: 300, ...count('overtakes', 100) },
  { id: 'gems1000', icon: '💎', name: 'Gem Hoarder', desc: 'Collect 1,000 gems', reward: 400, ...count('gems', 1000) },
  { id: 'tracks', icon: '🌍', name: 'Globetrotter', desc: `Race on all ${TRACKS.length} tracks`, reward: 500, ...count('tracks', TRACKS.length) },
  {
    id: 'sc5', icon: '🔍', name: 'Explorer', desc: 'Find 5 secret shortcuts', reward: 150,
    prog: (c, r) => [Math.min(foundCount(r), 5), 5],
  },
  {
    id: 'scall', icon: '🗺️', name: 'Cartographer', desc: 'Find every secret shortcut', reward: 1000,
    prog: (c, r) => [Math.min(foundCount(r), TOTAL_SHORTCUTS), TOTAL_SHORTCUTS],
  },
  { id: 'tt10', icon: '⏱️', name: 'Stopwatch', desc: 'Set 10 time trial records', reward: 300, ...count('tt', 10) },
  { id: 'ghost', icon: '👻', name: 'Ghostbuster', desc: 'Beat your own ghost', reward: 150, ...count('ghosts', 1) },
  { id: 'mp1', icon: '📱', name: 'Friends Forever', desc: 'Finish an online race', reward: 100, ...count('mpRaces', 1) },
  { id: 'mpwin', icon: '🎉', name: 'Party Champ', desc: 'Win an online race', reward: 250, ...count('mpWins', 1) },
  { id: 'daily1', icon: '📅', name: 'Daily Driver', desc: 'Complete a daily challenge', reward: 100, ...count('dailies', 1) },
  { id: 'streak7', icon: '🔥', name: 'On a Roll', desc: 'Keep a 7-day daily streak', reward: 700, prog: (c) => [Math.min((c.daily && c.daily.best) || 0, 7), 7] },
  { id: 'battle1', icon: '🎈', name: 'Balloon Buster', desc: 'Win a balloon battle', reward: 150, ...count('battleWins', 1) },
  { id: 'lv10', icon: '⭐', name: 'Rising Star', desc: 'Reach level 10', reward: 300, prog: (c) => [Math.min(levelOf(c.xp || 0).level, 10), 10] },
  { id: 'lv30', icon: '🌟', name: 'Superstar', desc: 'Reach level 25', reward: 1500, prog: (c) => [Math.min(levelOf(c.xp || 0).level, 25), 25] },
  { id: 'cap1', icon: '🍬', name: 'Sweet Tooth', desc: 'Open a gumball capsule', reward: 50, ...count('capsules', 1) },
  { id: 'cos10', icon: '🎩', name: 'Dress Up', desc: 'Collect 10 gumball prizes', reward: 300, prog: (c) => [Math.min(ownedCount(c), 10), 10] },
  { id: 'cosall', icon: '🧺', name: 'Completionist', desc: 'Collect every gumball prize', reward: 2000, prog: (c) => [ownedCount(c), COSMETIC_TOTAL] },
  { id: 'legend', icon: '🦄', name: 'Lucky Dip', desc: 'Win a legendary prize', reward: 250, prog: (c) => [(c.cos || []).some((id) => (cosmeticById(id) || {}).rarity === 'legendary') ? 1 : 0, 1] },
  { id: 'garage', icon: '🏎️', name: 'Full Garage', desc: 'Own every kart', reward: 800, prog: (c) => [c.bodies.length, BODY_LIST.length] },
  { id: 'champ', icon: '🥇', name: 'Golden Wheel', desc: 'Become the career champion', reward: 1000, prog: (c) => [c.champion ? 1 : 0, 1] },
];

// Unlock any achievements that are now complete; pays their rewards.
export function checkAchievements(c, records) {
  c.ach = c.ach || {};
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (c.ach[a.id]) continue;
    const [cur, max] = a.prog(c, records);
    if (cur >= max) {
      c.ach[a.id] = Date.now();
      c.coins += a.reward;
      c.earned = (c.earned || 0) + a.reward;
      got.push(a);
    }
  }
  return got;
}

// ---------------- daily challenge ----------------
export const DAILY_MODS = [
  { id: 'bombs', name: 'Boom Boom Bash', icon: '💣', desc: 'Every item box holds bombs, fireworks or twisters.', items: ['bomb', 'firework', 'twister'] },
  { id: 'speed', name: 'Speed Freaks', icon: '🌶️', desc: 'Only chilis, rockets and rainbows. Go go go!', items: ['chili3', 'rocket', 'rainbow'] },
  { id: 'ice', name: 'Ice Age', icon: '🧊', desc: 'The whole track is as slippery as black ice.', grip: 0.5, traction: 0.8 },
  { id: 'moon', name: 'Moon Jumps', icon: '🌙', desc: 'Low gravity everywhere: huge air off every bump.', gravity: 0.55 },
  { id: 'pure', name: 'Pure Racing', icon: '🏎️', desc: 'No items at all. Just you, your line and your drifts.', noItems: true },
  { id: 'turbo', name: 'Turbo Trouble', icon: '⚡', desc: 'Turbo speed against hard racers.', cls: 'turbo', diff: 'hard' },
  { id: 'bees', name: 'Bee Swarm', icon: '🐝', desc: 'Buzz bees, boomerangs and bumper balls only.', items: ['bee', 'boomerang', 'ball'] },
  { id: 'gems', name: 'Gem Rush', icon: '💎', desc: 'Grab 25 gems and finish in the top 3.', gems: 25 },
  { id: 'ghosts', name: 'Spooky Swap', icon: '👻', desc: 'Only Spook Masks, oil and honey. Sneaky!', items: ['ghost', 'oil', 'honey'] },
];

export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return today(d);
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// The same challenge for everyone on a given day.
export function dailyFor(day = today()) {
  const r = rng(hashStr(`zoomies-${day}`) % 100000 + 1);
  const track = TRACKS[Math.floor(r() * TRACKS.length)];
  const rev = r() < 0.3;
  const mod = DAILY_MODS[Math.floor(r() * DAILY_MODS.length)];
  const goal = mod.gems ? 3 : r() < 0.35 ? 1 : 3;
  const cls = mod.cls || ['zoom', 'zoom', 'turbo'][Math.floor(r() * 3)];
  const diff = mod.diff || (goal === 1 ? 'normal' : 'hard');
  return { day, track: track.id, rev, mod, goal, gems: mod.gems || 0, cls, diff };
}

export function dailyGoalText(d) {
  const place = d.goal === 1 ? 'Win the race' : 'Finish in the top 3';
  return d.gems ? `Grab ${d.gems} gems and finish in the top 3` : place;
}

export const dailyDoneToday = (c) => !!(c.daily && c.daily.done === today());

export function dailyStreak(c) {
  const dl = c.daily || {};
  // A streak survives until the end of the day after the last completion.
  return dl.done === today() || dl.done === yesterday() ? dl.streak || 0 : 0;
}

export const dailyReward = (streak) => 150 + 25 * Math.min(streak, 10);

// Record a successful daily. Returns the reward (0 if already done today).
export function completeDaily(c) {
  const dl = (c.daily = c.daily || { done: '', streak: 0, best: 0 });
  const t = today();
  if (dl.done === t) return null;
  dl.streak = dl.done === yesterday() ? (dl.streak || 0) + 1 : 1;
  dl.best = Math.max(dl.best || 0, dl.streak);
  dl.done = t;
  addStat(c, 'dailies');
  // A daily pays XP (more with a streak) and a free prize capsule, not coins.
  c.freeCaps = (c.freeCaps || 0) + 1;
  return { ...grant(c, 0, 150 + dailyReward(dl.streak) / 2), streak: dl.streak, capsule: true };
}

export function dailyTrackName(d) {
  return trackById(d.track).name + (d.rev ? ' (reverse)' : '');
}

export { addStat, addToSet };
