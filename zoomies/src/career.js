import { CHARACTERS, charById } from './characters.js';
import { BODIES, UPGRADES, MAX_UPGRADE, kartStats } from './karts.js';
import { trackById } from './tracks.js';
import { fmtTime } from './util.js';
import { levelOf, oldLevel } from './profile.js';

// Career: start in the scrapyard with the Rust Bucket and one racer, win
// coins in story events and spend them in the garage on karts, upgrades,
// paint and new racers. Seven chapters, each with a rival to beat.

const KEY = 'zoomies-career-v1';

// Racers join your team once you have beaten them in their chapter.
export const RACER_PRICE = {
  mochi: 0, hopper: 600, zorp: 900, pip: 1200, ember: 1500, volt: 1900, rexi: 2300, bruno: 3000,
  ...Object.fromEntries(CHARACTERS.filter((c) => c.price).map((c) => [c.id, c.price])),
};

export const PAINTS = [
  { id: 'stock', name: 'Racer colours', color: null, price: 0 },
  { id: 'cherry', name: 'Cherry', color: '#e8203a', price: 150 },
  { id: 'sunny', name: 'Sunshine', color: '#ffc21a', price: 150 },
  { id: 'lagoon', name: 'Lagoon', color: '#12b5c8', price: 200 },
  { id: 'grape', name: 'Grape Soda', color: '#7a3cff', price: 200 },
  { id: 'mint', name: 'Mint', color: '#34e0a1', price: 250 },
  { id: 'midnight', name: 'Midnight', color: '#23284a', price: 300 },
  { id: 'pearl', name: 'Pearl', color: '#f4f1ea', price: 350 },
  { id: 'gold', name: 'Gold Rush', color: '#d9a520', price: 900 },
];
export const paintById = (id) => PAINTS.find((p) => p.id === id) || PAINTS[0];

// Coins by finishing place (8-kart races); duels pay the first two.
const PLACE_COINS = [120, 90, 70, 55, 45, 35, 30, 25];
const GEM_COINS = 2;
const STAR_COINS = 40;

export const SPEAKERS = {
  gramps: { name: 'Gramps Gearbox', icon: '🔧', color: '#ffb347' },
  mic: { name: 'Mic the Announcer', icon: '🎙️', color: '#36a9ff' },
};

// Event types: race (finish in the top `goal`), gems (collect `n` gems and
// finish), time (solo time trial under `target` seconds), duel (beat the
// rival one on one) and cup (win a 4-race Grand Prix overall).
export const CHAPTERS = [
  {
    id: 'c1', name: 'Rookie Road', rival: 'hopper', alt: 'pip', cls: 'chill', diff: 'easy', bossDiff: 'normal',
    blurb: 'Farm lanes and beach laps. Everyone starts somewhere.',
    ai: { bodies: ['buggy'], up: 0 }, boss: { body: 'buggy', up: 1 },
    intro: [
      ['gramps', 'Found this in the scrapyard. One headlight, three good wheels. Four, if you squint.'],
      ['gramps', 'The Zoomies Circuit starts today. Win races, earn coins, and we will turn this heap into a champion.'],
      ['mic', 'Welcome to Rookie Road! Seven leagues stand between you and the Golden Wheel.'],
      ['hopper', 'Ribbit! Nice... bucket? See you at the finish. Well, I will see you behind me.'],
    ],
    bossIntro: [['hopper', 'My home turf, one on one. Try to keep up with the hop!']],
    outro: [
      ['hopper', 'Okay, okay, you are quick! I could race for your team. For a small fee.'],
      ['gramps', 'Not bad, kid. Now get to the garage. That engine sounds like a blender full of bolts.'],
    ],
    events: [
      { id: 'c1-1', type: 'race', track: 'sprout', goal: 3, title: 'First Laps', reward: 150 },
      { id: 'c1-2', type: 'gems', track: 'downs', n: 12, title: 'Shiny Things', reward: 150 },
      { id: 'c1-3', type: 'race', track: 'coral', goal: 3, title: 'Beach Day', reward: 170 },
      { id: 'c1-4', type: 'time', track: 'sprout', target: 118, title: 'Beat the Clock', reward: 170 },
      { id: 'c1-b', type: 'duel', track: 'downs', title: 'Hopper Hops In', reward: 400, boss: true },
    ],
  },
  {
    id: 'c2', name: 'Sun & Surf', rival: 'zorp', alt: 'ember', cls: 'chill', diff: 'normal', bossDiff: 'normal',
    blurb: 'Boardwalks, blossoms and sand in everything.',
    ai: { bodies: ['buggy', 'classic'], up: 0 }, boss: { body: 'tub', up: 0 },
    intro: [
      ['mic', 'The Sun and Surf league! Sand, sea and a very strange visitor.'],
      ['zorp', 'Greetings, Earth racer. Zorp has come for your gems. All of them.'],
      ['gramps', 'Gems give you a little extra top speed, and I pay a few coins for every one you grab.'],
    ],
    bossIntro: [['zorp', 'Zorp scanners predict a 97 percent chance of Zorp victory.']],
    outro: [
      ['zorp', 'Recalculating... Zorp would like to join your crew. Zorp accepts coins.'],
      ['gramps', 'Next stop is the mountains. Pack a scarf.'],
    ],
    events: [
      { id: 'c2-1', type: 'race', track: 'tidal', goal: 3, title: 'Twist and Shout', reward: 220 },
      { id: 'c2-2', type: 'gems', track: 'blossom', n: 14, title: 'Petal Pickup', reward: 220 },
      { id: 'c2-3', type: 'time', track: 'coral', target: 106, title: 'Sandbar Sprint', reward: 220 },
      { id: 'c2-4', type: 'race', track: 'dunes', goal: 3, title: 'Desert Heat', reward: 250 },
      { id: 'c2-b', type: 'duel', track: 'tidal', title: 'Close Encounter', reward: 550, boss: true },
    ],
  },
  {
    id: 'c3', name: 'Frostbite Trials', rival: 'pip', alt: 'volt', cls: 'zoom', diff: 'normal', bossDiff: 'normal',
    blurb: 'Snow, black ice and a penguin who never brakes.',
    ai: { bodies: ['classic'], up: 0 }, boss: { body: 'classic', up: 1 },
    intro: [
      ['mic', 'Frostbite Trials! It is minus twenty and the tyres are not happy about it.'],
      ['pip', 'Ice is my best friend. It is about to be your worst enemy!'],
      ['gramps', 'Less grip up here. Lift before the bend, drift long and do not fight the slide. Tyre upgrades help.'],
    ],
    bossIntro: [['pip', 'Glacier Gorge. Just you, me and a whole lot of nothing to hold on to.']],
    outro: [
      ['pip', 'Wheee... wait, you won? Teach me that line!'],
      ['gramps', 'Speed class goes up from here. Time to think about a proper kart.'],
    ],
    events: [
      { id: 'c3-1', type: 'race', track: 'frost', goal: 3, title: 'Cold Start', reward: 280 },
      { id: 'c3-2', type: 'race', track: 'candy', goal: 3, title: 'Sugar Rush', reward: 280 },
      { id: 'c3-3', type: 'gems', track: 'frost', rev: true, n: 15, title: 'Ice Crystals', reward: 280 },
      { id: 'c3-4', type: 'time', track: 'glacier', target: 126, title: 'Black Ice', reward: 300 },
      { id: 'c3-b', type: 'duel', track: 'glacier', title: 'Penguin Showdown', reward: 700, boss: true },
    ],
  },
  {
    id: 'c4', name: 'Spooky Season', rival: 'ember', alt: 'zorp', cls: 'zoom', diff: 'normal', bossDiff: 'hard',
    blurb: 'Haunted lanes, falling leaves and a fox with a grudge.',
    ai: { bodies: ['classic', 'tub'], up: 1 }, boss: { body: 'comet', up: 2 },
    intro: [
      ['mic', 'Spooky Season! Ghosts in the hollow, boulders in the jungle and leaves on the racing line.'],
      ['ember', 'Oh, the rookie from the scrapyard. Cute. Try not to get lost in the dark.'],
    ],
    bossIntro: [['ember', 'Temple Tunnel is my shortcut. Let us see if you can find it.']],
    outro: [
      ['ember', 'Fine. You are good. Like, annoyingly good. I am in, if the pay is right.'],
      ['gramps', 'Next up is the factory district. Watch for oil.'],
    ],
    events: [
      { id: 'c4-1', type: 'race', track: 'hollow', goal: 3, title: 'Things That Go Bump', reward: 330 },
      { id: 'c4-2', type: 'race', track: 'maple', goal: 2, title: 'Red Leaves', reward: 350 },
      { id: 'c4-3', type: 'gems', track: 'jungle', n: 18, title: 'Temple Treasure', reward: 330 },
      { id: 'c4-4', type: 'time', track: 'maple', target: 142, title: 'Down the Ridge', reward: 350 },
      { id: 'c4-b', type: 'duel', track: 'jungle', title: 'Fox Hunt', reward: 850, boss: true },
    ],
  },
  {
    id: 'c5', name: 'Heavy Metal', rival: 'volt', alt: 'rexi', cls: 'zoom', diff: 'normal', bossDiff: 'hard',
    blurb: 'Oil slicks, barrels and a robot that never makes mistakes.',
    ai: { bodies: ['classic', 'comet', 'tub'], up: 1 }, boss: { body: 'comet', up: 3 },
    intro: [
      ['volt', 'ANALYSIS: YOUR KART IS 34 PERCENT TAPE.'],
      ['gramps', 'Gearworks is oil and barrels, and Neon Nebula is a long night. The racers here are sharp.'],
    ],
    bossIntro: [['volt', 'INITIATING DUEL PROTOCOL. PROBABILITY OF YOUR VICTORY: LOW.']],
    outro: [
      ['volt', 'ERROR: DEFEAT NOT FOUND IN DATABASE. ...ADDING IT NOW.'],
      ['mic', 'The rookie is still climbing! Next: the volcano.'],
    ],
    events: [
      { id: 'c5-1', type: 'race', track: 'gear', goal: 3, title: 'Grease Monkey', reward: 400 },
      { id: 'c5-2', type: 'time', track: 'neon', target: 113, title: 'Night Shift', reward: 400 },
      { id: 'c5-3', type: 'gems', track: 'gear', rev: true, n: 18, title: 'Nuts and Bolts', reward: 400 },
      { id: 'c5-4', type: 'race', track: 'neon', rev: true, goal: 2, title: 'Flipside Flyover', reward: 430 },
      { id: 'c5-b', type: 'duel', track: 'gear', title: 'Man vs Machine', reward: 1000, boss: true },
    ],
  },
  {
    id: 'c6', name: 'Trial by Fire', rival: 'rexi', alt: 'bruno', cls: 'turbo', diff: 'normal', bossDiff: 'hard',
    blurb: 'Lava, obsidian and a floating fairground. Turbo class.',
    ai: { bodies: ['classic', 'comet', 'stomper'], up: 2 }, boss: { body: 'stomper', up: 3 },
    intro: [
      ['mic', 'Trial by Fire, in Turbo class! Hold on to your helmets.'],
      ['rexi', 'STOMP! Magma Mountain eats rookies for breakfast!'],
      ['gramps', 'At this speed every mistake costs double. Max out that engine if you can.'],
    ],
    bossIntro: [['rexi', 'Top of the volcano, one on one. Last one down is a fossil!']],
    outro: [
      ['rexi', 'You did not melt? RESPECT. Stomp stomp.'],
      ['gramps', 'Only one league left, kid. And it is not on this planet.'],
    ],
    events: [
      { id: 'c6-1', type: 'race', track: 'magma', goal: 3, title: 'Hot Wheels', reward: 480 },
      { id: 'c6-2', type: 'race', track: 'obsidian', goal: 2, title: 'Black Glass', reward: 500 },
      { id: 'c6-3', type: 'time', track: 'cloud', target: 99, title: 'Head in the Clouds', reward: 480 },
      { id: 'c6-4', type: 'gems', track: 'obsidian', rev: true, n: 20, title: 'Lava Gems', reward: 480 },
      { id: 'c6-b', type: 'duel', track: 'magma', title: 'Dino Might', reward: 1200, boss: true },
    ],
  },
  {
    id: 'c7', name: 'To the Moon', rival: 'bruno', alt: 'rexi', cls: 'turbo', diff: 'hard', bossDiff: 'hard',
    blurb: 'Low gravity, the Big Bear and the Golden Wheel.',
    ai: { bodies: ['comet', 'stomper', 'classic'], up: 2 }, boss: { body: 'bolt', up: 3 },
    intro: [
      ['mic', 'The final league! Racing on the moon: low gravity, big air and the Big Bear himself.'],
      ['bruno', 'Five years I have held the Golden Wheel, kid. You and that junk heap will not change that.'],
      ['gramps', 'Win the Golden Wheel Cup and the title is yours. No pressure.'],
    ],
    bossIntro: [['bruno', 'Four races. Most points takes the Wheel. Let us go.']],
    outro: [
      ['mic', 'UNBELIEVABLE! A rookie from the scrapyard has won the Golden Wheel!'],
      ['bruno', 'Heh. Good racing, champ. Rematch any time. And I would race for you, for the right price.'],
      ['gramps', 'I always knew that bucket had it in her. Now go polish that trophy.'],
    ],
    events: [
      { id: 'c7-1', type: 'race', track: 'moon', goal: 3, title: 'One Small Step', reward: 560 },
      { id: 'c7-2', type: 'time', track: 'moon', target: 94, title: 'Moonwalk', reward: 560 },
      { id: 'c7-3', type: 'race', track: 'glacier', rev: true, goal: 3, title: 'Frozen Flip', reward: 580 },
      { id: 'c7-4', type: 'gems', track: 'cloud', n: 22, title: 'Sky High', reward: 560 },
      { id: 'c7-b', type: 'cup', tracks: ['moon', 'obsidian', 'glacier', 'neon'], title: 'Golden Wheel Cup', reward: 2500, boss: true },
    ],
  },
];

export const TYPE_ICON = { race: '🏁', gems: '💎', time: '⏱️', duel: '⚔️', cup: '🏆' };

export function eventById(id) {
  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    const ch = CHAPTERS[ci];
    const ei = ch.events.findIndex((e) => e.id === id);
    if (ei >= 0) return { chapter: ch, ev: ch.events[ei], ci, ei };
  }
  return null;
}

// ---------------- save data ----------------
export function newCareer() {
  return {
    v: 1, coins: 0, racer: 'mochi', racers: ['mochi'], body: 'buggy', bodies: ['buggy'],
    upgrades: { buggy: { engine: 0, turbo: 0, tyres: 0, armor: 0 } }, paint: 'stock', paints: ['stock'],
    stars: {}, done: {}, best: {}, seen: {}, beaten: [], champion: false, earned: 0,
    // profile: XP, lifetime stats, trophies, daily streak and cosmetics
    xp: 0, stats: {}, ach: {}, daily: { done: '', streak: 0, best: 0 }, freeCaps: 0,
    lvlPaid: 1, // highest level whose rewards were paid
    // gumball machine prizes: owned ids and what you're wearing
    cos: [], hat: 'nohat', trail: 'classic', horn: 'beep',
  };
}

// Saves come from this phone's storage or from another device (sync), so
// every field is type-checked: counters become whole numbers from 0 to 1e9,
// lists keep only short strings, unknown objects are dropped. Returns null
// for something that isn't a save at all.
export const MAX_COUNT = 1e9;
const count = (v, max = MAX_COUNT) => (Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length <= 64;
const strList = (v) => [...new Set(v.filter(isStr))].slice(0, 1000);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
// Copy an object's entries through f (undefined = drop that entry).
function mapObj(o, f) {
  const out = {};
  if (isObj(o)) for (const [k, v] of Object.entries(o).slice(0, 2000)) {
    if (UNSAFE.has(k) || k.length > 64) continue;
    const w = f(v);
    if (w !== undefined) out[k] = w;
  }
  return out;
}
const counts = (o) => mapObj(o, (v) => (Number.isFinite(v) ? count(v) : undefined));

export function cleanCareer(saved) {
  if (!isObj(saved)) return null;
  const c = newCareer();
  // Unknown fields from newer versions: keep plain values only.
  for (const [k, v] of Object.entries(saved)) {
    if (k in c || k === 'sync' || UNSAFE.has(k)) continue;
    if (typeof v === 'boolean' || Number.isFinite(v) || (typeof v === 'string' && v.length <= 200)) c[k] = v;
  }
  for (const k of ['coins', 'xp', 'earned', 'freeCaps']) c[k] = count(saved[k]);
  // Saves from before the steeper level curve: their old level's rewards were paid.
  c.lvlPaid = saved.lvlPaid === undefined ? oldLevel(c.xp) : count(saved.lvlPaid, 10000);
  for (const k of ['racer', 'body', 'paint', 'hat', 'trail', 'horn']) if (isStr(saved[k])) c[k] = saved[k];
  for (const k of ['racers', 'bodies', 'paints', 'beaten', 'cos']) if (Array.isArray(saved[k])) c[k] = strList(saved[k]);
  c.champion = !!saved.champion;
  if (isObj(saved.upgrades)) c.upgrades = mapObj(saved.upgrades, (u) => (isObj(u) ? mapObj(u, (v) => (Number.isFinite(v) ? count(v, MAX_UPGRADE) : undefined)) : undefined));
  c.stars = mapObj(saved.stars, (v) => (Number.isFinite(v) ? count(v, 3) : undefined));
  const flag = (v) => (typeof v === 'boolean' || Number.isFinite(v) || isStr(v) ? v : undefined);
  c.done = mapObj(saved.done, flag);
  c.seen = mapObj(saved.seen, flag);
  c.best = mapObj(saved.best, (v) => (Number.isFinite(v) && v > 0 ? v : undefined));
  c.ach = mapObj(saved.ach, (v) => (v === true || (Number.isFinite(v) && v > 0) ? v : undefined));
  // Lifetime stats: counters, or lists of ids.
  c.stats = mapObj(saved.stats, (v) => (Array.isArray(v) ? v.filter((x) => isStr(x) || Number.isFinite(x)).slice(0, 1000) : Number.isFinite(v) ? count(v) : undefined));
  const d = isObj(saved.daily) ? saved.daily : {};
  c.daily = { done: isStr(d.done) ? d.done : '', streak: count(d.streak), best: count(d.best) };
  const sy = saved.sync;
  if (isObj(sy) && isStr(sy.id) && isObj(sy.base)) {
    const b = sy.base;
    c.sync = { id: sy.id, at: Number.isFinite(sy.at) ? sy.at : 0, base: { xp: count(b.xp), coins: count(b.coins), earned: count(b.earned), freeCaps: count(b.freeCaps), stats: counts(b.stats) } };
  }
  return c;
}

export function loadCareer() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = cleanCareer(JSON.parse(raw));
      if (!c) return null;
      if (!BODIES[c.body]) c.body = 'buggy';
      if (!c.bodies.includes(c.body)) c.bodies.push(c.body);
      if (!c.racers.includes(c.racer)) c.racer = c.racers[0] || 'mochi';
      return c;
    }
  } catch (e) { /* private mode or corrupt save: start fresh */ }
  return null;
}

export function saveCareer(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* storage full or blocked */ }
}

export function resetCareer() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

// ---------------- progress ----------------
export const eventStars = (c, id) => c.stars[id] || 0;
export const chapterStars = (c, ch) => ch.events.reduce((a, e) => a + eventStars(c, e.id), 0);
export const totalStars = (c) => CHAPTERS.reduce((a, ch) => a + chapterStars(c, ch), 0);
export const MAX_STARS = CHAPTERS.reduce((a, ch) => a + ch.events.length * 3, 0);

export function chapterUnlocked(c, ci) {
  return ci === 0 || !!c.done[CHAPTERS[ci - 1].events.find((e) => e.boss).id];
}

// The boss event opens once three of the chapter's other events are cleared.
export const BOSS_NEEDS = 3;
export function eventUnlocked(c, ci, ei) {
  if (!chapterUnlocked(c, ci)) return false;
  const ch = CHAPTERS[ci];
  const ev = ch.events[ei];
  if (!ev.boss) return true;
  return ch.events.filter((e) => !e.boss && c.done[e.id]).length >= BOSS_NEEDS;
}

// The chapter to show first: the newest unlocked one that is not finished.
export function currentChapter(c) {
  let ci = 0;
  while (ci + 1 < CHAPTERS.length && chapterUnlocked(c, ci + 1)) ci++;
  return ci;
}

export function rivalFor(c, chapter) {
  return chapter.rival === c.racer ? chapter.alt : chapter.rival;
}

// ---------------- karts ----------------
export function upgradesFor(c, body = c.body) {
  if (!c.upgrades[body]) c.upgrades[body] = { engine: 0, turbo: 0, tyres: 0, armor: 0 };
  return c.upgrades[body];
}

export function playerLoadout(c) {
  return { body: c.body, upgrades: { ...upgradesFor(c) }, paint: paintById(c.paint).color };
}

export function playerStats(c, racer = c.racer, body = c.body) {
  return kartStats(charById(racer), body, upgradesFor(c, body));
}

const flatUp = (n) => ({ engine: n, turbo: n, tyres: n, armor: n });

// Loadouts for the computer racers of a chapter, keyed by racer id.
export function aiLoadouts(chapter, ids, rival) {
  const out = {};
  ids.forEach((id, i) => {
    if (id === rival) out[id] = { body: chapter.boss.body, upgrades: flatUp(chapter.boss.up) };
    else out[id] = { body: chapter.ai.bodies[i % chapter.ai.bodies.length], upgrades: flatUp(chapter.ai.up) };
  });
  return out;
}

export function upgradeCost(key, level) {
  return level >= MAX_UPGRADE ? null : UPGRADES[key].costs[level];
}

// ---------------- text ----------------
export function trackLabel(id, rev) {
  const t = trackById(id);
  return t.name + (rev ? ' (reverse)' : '');
}

export function goalLabel(ev, c) {
  switch (ev.type) {
    case 'race': return ev.goal === 1 ? 'Win the race' : `Finish in the top ${ev.goal}`;
    case 'gems': return `Grab ${ev.n} gems and finish`;
    case 'time': return `Finish under ${fmtTime(ev.target)}`;
    case 'duel': {
      const ch = eventById(ev.id).chapter;
      return `Beat ${charById(c ? rivalFor(c, ch) : ch.rival).name} one on one`;
    }
    case 'cup': return 'Win the cup overall';
  }
  return '';
}

export function starHints(ev) {
  switch (ev.type) {
    case 'race': return ev.goal > 2 ? [goalLabel(ev), 'Top 2', 'Win'] : [goalLabel(ev), 'Win', 'Win by 3 s'];
    case 'gems': return [`${ev.n} gems and finish`, `${ev.n} gems, top 3`, `${ev.n + 6} gems, win`];
    case 'time': return [`Under ${fmtTime(ev.target)}`, `Under ${fmtTime(ev.target * 0.96)}`, `Under ${fmtTime(ev.target * 0.92)}`];
    case 'duel': return ['Win', 'Win by 2 s', 'Win by 5 s'];
    case 'cup': return ['Win the cup', 'Win 2 races', 'Win 3 races'];
  }
  return [];
}

// Live HUD line for the event goal.
export function hudGoal(ev, race) {
  const p = race.player;
  if (!p) return '';
  if (ev.type === 'gems') return `💎 ${Math.min(p.gemsGot || 0, 99)} / ${ev.n}`;
  if (ev.type === 'time') return `Target ${fmtTime(ev.target)}`;
  if (ev.type === 'race') return ev.goal === 1 ? 'Goal: win' : `Goal: top ${ev.goal}`;
  if (ev.type === 'duel') return `Duel: beat ${race.karts.find((k) => !k.isPlayer)?.ch.name || 'your rival'}`;
  return '';
}

// ---------------- scoring ----------------
// res: { place, gems, time, margin, finished, wins, count }
export function scoreEvent(ev, res, mult) {
  let pass = false, stars = 0;
  switch (ev.type) {
    case 'race':
      pass = res.place <= ev.goal;
      // Top 3 events: top 2, then a win. Top 2 events: a win, then a win by 3 s.
      stars = pass ? 1 + (res.place <= (ev.goal > 2 ? 2 : 1) ? 1 : 0) + (res.place === 1 && (ev.goal > 2 || res.margin >= 3) ? 1 : 0) : 0;
      break;
    case 'gems':
      pass = res.finished && res.gems >= ev.n;
      stars = pass ? 1 + (res.place <= 3 ? 1 : 0) + (res.place === 1 && res.gems >= ev.n + 6 ? 1 : 0) : 0;
      break;
    case 'time':
      pass = res.time <= ev.target;
      stars = pass ? 1 + (res.time <= ev.target * 0.96 ? 1 : 0) + (res.time <= ev.target * 0.92 ? 1 : 0) : 0;
      break;
    case 'duel':
      pass = res.place === 1;
      stars = pass ? 1 + (res.margin >= 2 ? 1 : 0) + (res.margin >= 5 ? 1 : 0) : 0;
      break;
    case 'cup':
      pass = res.place === 1;
      stars = pass ? 1 + (res.wins >= 2 ? 1 : 0) + (res.wins >= 3 ? 1 : 0) : 0;
      break;
  }
  stars = Math.min(3, stars);
  let placeCoins = 0;
  if (ev.type === 'time') placeCoins = pass ? 100 : 30;
  else if (ev.type === 'duel') placeCoins = res.place === 1 ? 150 : 60;
  else if (ev.type === 'cup') placeCoins = PLACE_COINS[res.place - 1] * 3 || 60;
  else placeCoins = PLACE_COINS[res.place - 1] || 20;
  return {
    pass, stars,
    placeCoins: Math.round(placeCoins * mult),
    gemCoins: ev.type === 'time' ? 0 : (res.gems || 0) * GEM_COINS,
  };
}

export const chapterMult = (ci) => 1 + ci * 0.3;

// Apply a result to the save. Returns what changed, for the results screen.
export function applyResult(c, evId, res) {
  const { ev, ci, chapter } = eventById(evId);
  const sc = scoreEvent(ev, res, chapterMult(ci));
  const prevStars = eventStars(c, evId);
  const firstClear = sc.pass && !c.done[evId];
  const newStars = Math.max(0, sc.stars - prevStars);
  const lines = [[`${ev.type === 'time' ? (sc.pass ? 'Beat the target' : 'Time trial') : ev.type === 'cup' ? `Cup: ${res.place}${ordinalSuffix(res.place)}` : `${res.place}${ordinalSuffix(res.place)} place`}`, sc.placeCoins]];
  if (sc.gemCoins) lines.push([`${res.gems} gems`, sc.gemCoins]);
  if (firstClear) lines.push(['First clear bonus', ev.reward]);
  if (newStars) lines.push([`${newStars} new star${newStars > 1 ? 's' : ''}`, newStars * STAR_COINS]);
  const coins = lines.reduce((a, l) => a + l[1], 0);
  c.coins += coins;
  c.earned = (c.earned || 0) + coins;
  if (sc.pass) c.done[evId] = true;
  c.stars[evId] = Math.max(prevStars, sc.stars);
  if (ev.type === 'time' && (!c.best[evId] || res.time < c.best[evId])) c.best[evId] = res.time;
  let unlocked = null, chapterDone = false;
  if (firstClear && ev.boss) {
    chapterDone = true;
    const rival = rivalFor(c, chapter);
    if (!c.beaten.includes(chapter.rival)) c.beaten.push(chapter.rival);
    if (rival !== chapter.rival && !c.beaten.includes(rival)) c.beaten.push(rival);
    unlocked = chapter.rival;
    if (ci === CHAPTERS.length - 1) c.champion = true;
  }
  saveCareer(c);
  return { ...sc, coins, lines, firstClear, newStars, prevStars, unlocked, chapterDone, ev, chapter, ci };
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Racers you can hire: beaten rivals (Mochi is always on the team), and the
// newer racers once you reach their player level.
export const racerAvailable = (c, id) => id === 'mochi' || c.beaten.includes(id) || (!!charById(id).lvl && levelOf(c.xp || 0).level >= charById(id).lvl);

export const ALL_RACERS = CHARACTERS.map((ch) => ch.id);
