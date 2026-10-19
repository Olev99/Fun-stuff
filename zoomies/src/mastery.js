import { CHARACTERS } from './characters.js';
import { BODIES } from './karts.js';

// Mastery: every racer and every ride (kart or bike body) earns Mastery XP in
// races. Levels 1-10 give titles, stars and free capsules, never stats.
// Save field: c.mastery = { r: {racerId: xp}, b: {bodyId: xp}, capLevels }
// capLevels = total mastery levels already paid with free capsules (a multiple of 5).

export const MAX_LEVEL = 10;
// Total XP to reach level L: 60, 180, 360 ... 2700 (each level asks 60 more than the last).
// A good racer earns about 36 a race, so level 3 takes ~5 races, 6 ~25 and 10 ~75 with one combo.
export const levelAt = (L) => 30 * (L - 1) * (L - 1) + 30 * (L - 1);
export const MAX_XP = levelAt(MAX_LEVEL);
export const CAP_EVERY = 5;
export const emptyMastery = () => ({ r: {}, b: {}, capLevels: 0 });
export const RACER_IDS = CHARACTERS.map((c) => c.id);
export const BODY_IDS = Object.keys(BODIES);

export function masteryLevel(xp) {
  xp = Math.max(0, Math.min(MAX_XP, Number.isFinite(xp) ? xp : 0));
  let level = 1;
  while (level < MAX_LEVEL && xp >= levelAt(level + 1)) level++;
  const need = level >= MAX_LEVEL ? 0 : levelAt(level + 1) - levelAt(level);
  return { level, into: xp - levelAt(level), need };
}

// What one finished race adds: finishing 20, a podium bonus, style (up to 20) and 15 per medal tier gained.
export function masteryGain(info) {
  const podium = info.mode === 'tt' ? 0 : [15, 8, 4][(info.place || 0) - 1] || 0;
  const style = Math.min(20, Math.round((info.style || 0) / 40));
  const medal = info.medal && info.medal.tier ? 15 * info.medal.tier : 0;
  return 20 + podium + style + medal;
}

// Funny titles at levels 3, 6 and 10, one set per racer.
export const TITLES = {
  mochi: ['Whisker Rookie', 'Nine-Lives Drifter', 'Grand Cat of the Circuit'],
  pip: ['Ice Cub', 'Belly-Slide Boss', 'Emperor of Zoom'],
  bruno: ['Honey Hauler', 'Brakes? Never Heard of Them', 'Grizzly Grand Master'],
  rexi: ['Little Stomper', 'Tail-Whip Terror', 'Jurassic Jetstream'],
  volt: ['Beta Tester', 'Perfect-Line Processor', 'Overclocked Overlord'],
  ember: ['Sly Sparkler', 'Smirk Express', 'Foxfire Legend'],
  zorp: ['Gem Abductor', 'Drift Dimension Hopper', 'Cosmic Cruiser Supreme'],
  hopper: ['Lily Pad Learner', 'Landing Gear Guru', 'Ribbit Royalty'],
  yuzu: ['Chill Cadet', 'Nap-Time Navigator', 'Zen Speed Master'],
  lulu: ['Smiley Swimmer', 'Sideways Sweetheart', 'Hairpin Highness'],
  bao: ['Bamboo Bumper', 'Snack-Powered Shover', 'Gentle Giant of the Grid'],
  hoot: ['Night Shift Newbie', 'Line-Spotting Sage', 'Wise Old Wheelman'],
  bandit: ['Slipstream Pickpocket', 'Gem Snatcher', 'Master of the Midnight Line'],
  fizz: ['Buzz Rookie', 'Honey Rush Regular', 'Hive Mind Hotshot'],
  ollie: ['Eight-Arm Apprentice', 'Wave-and-Steer Wizard', 'Tentacle Titan'],
  gus: ['Deckhand Driver', 'First Mate on Wheels', 'Admiral of the Asphalt'],
  gloop: ['Sticky Starter', 'Gap Squeezer', 'Gelatinous Great'],
  nimbus: ['Little Puff', 'Breeze Rider', 'Storm Front Sovereign'],
  pebble: ['Pebble Pupil', 'Boulder Bruiser', 'Mountain Mover'],
  boris: ['Snowball Rookie', 'Fluffy Menace', 'Abominable Champion'],
};
const TITLE_AT = [3, 6, 10];

// The best title a racer has earned at a mastery level, or ''.
export function titleFor(id, level) {
  const t = TITLES[id];
  let out = '';
  if (t) TITLE_AT.forEach((L, i) => { if (level >= L) out = t[i]; });
  return out;
}

export const masteryOf = (c, kind, id) => masteryLevel(((c.mastery || {})[kind] || {})[id]);
export const racerTitle = (c, id) => titleFor(id, masteryOf(c, 'r', id).level);

// Star colour by level (none at level 1).
export const STAR_COLORS = ['', '#c98a4b', '#c98a4b', '#c5d0e0', '#c5d0e0', '#ffd23f', '#ffd23f', '#3fe0b0', '#3fe0b0', '#ff5ad8'];

// Mastery levels gained in total (a level 1 racer has gained none).
export function totalLevels(m) {
  let n = 0;
  for (const k of ['r', 'b']) for (const xp of Object.values(m[k] || {})) n += masteryLevel(xp).level - 1;
  return n;
}

// Count a finished race for the racer and ride used. info: awardRace's info
// plus racer and body ids. Returns { gain, parts: [{kind, id, level, from, up}], caps } or null.
export function addMastery(c, info) {
  const kinds = [['r', info.racer, RACER_IDS], ['b', info.body, BODY_IDS]].filter(([, id, ids]) => ids.includes(id));
  if (!kinds.length) return null;
  const m = (c.mastery = c.mastery || emptyMastery());
  const gain = masteryGain(info);
  const parts = kinds.map(([k, id]) => {
    m[k] = m[k] || {};
    const from = masteryLevel(m[k][id]).level;
    m[k][id] = Math.min(MAX_XP, (m[k][id] || 0) + gain);
    const level = masteryLevel(m[k][id]).level;
    return { kind: k, id, level, from, up: level > from };
  });
  // A free capsule for every CAP_EVERY levels gained across everything.
  const paid = Math.floor(totalLevels(m) / CAP_EVERY) * CAP_EVERY;
  const caps = Math.max(0, (paid - (m.capLevels || 0)) / CAP_EVERY);
  if (caps) { m.capLevels = paid; c.freeCaps = (c.freeCaps || 0) + caps; }
  return { gain, parts, caps };
}
