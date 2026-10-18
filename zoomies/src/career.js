import { CHARACTERS, charById } from './characters.js';
import { BODIES, kartStats } from './karts.js';
import { trackById } from './tracks.js';
import { fmtTime } from './util.js';
import { levelOf, oldLevel } from './profile.js';
import { partById, isPart, MAX_PARTS, MAX_SOCKETS } from './parts.js';
import { normalize as normalizeShop, migrateUpgrades, grant as grantPart, kitOf } from './workshop.js';

// Career: start in the scrapyard with the Rust Bucket and one racer, win
// coins in story events and spend them in the garage and Gramps's Workshop on
// karts, parts, paint and new racers. A prologue and seven chapters, each with
// a rival to beat, lead to the Golden Wheel and the Baron of Boost Corp.

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
// Every event can drop a part: `drop` is earned with 3 stars; with `bp` (boss
// Blueprints) or `dropAny` it comes with the first clear. `after` is a scene
// that plays on the hub after the first clear. A chapter's `clue` is the
// thread of the story it adds, shown on the hub once the chapter is done.
// `ai.up` / `boss.up` are flat stat levels for the computer racers (parts.js).
export const CHAPTERS = [
  {
    id: 'c1', name: 'Rookie Road', rival: 'hopper', alt: 'pip', cls: 'chill', diff: 'easy', bossDiff: 'normal',
    blurb: 'Farm lanes and beach laps. Everyone starts somewhere.',
    ai: { bodies: ['buggy'], up: 0 }, boss: { body: 'buggy', up: 1 },
    clue: 'Boost Corp sells every team the same "approved" kart, and hides fine print in the deal.',
    prologue: [
      ['gramps', 'Found this under a mattress. One headlight, three good wheels. Four, if you squint.'],
      ['gramps', 'She is the Rust Bucket. Do not hurt her feelings. She is sensitive. And leaky.'],
      ['gramps', 'See the banner on the fence? BOOST CORP, official sponsor of the Zoomies Circuit. Every racer out there drives the same shiny kart they sell.'],
      ['gramps', 'We have a bucket and a gut feeling. That is a better plan than it sounds. First, one quick lap to shake the rust loose.'],
    ],
    intro: [
      ['mic', 'Welcome to Rookie Road, racing fans! Seven leagues, one Golden Wheel and a kart that sounds like a blender full of bolts!'],
      ['baron', 'Greetings, Circuit. Baron Von Boost, owner of Boost Corp. Every kart today is Boost Corp Approved. Equal is fair, and fair is very profitable.'],
      ['gramps', 'Approved. Hm. Funny word. Never mind, kid. Eyes on the road.'],
      ['hopper', 'Ribbit! Nice... bucket? See you at the finish. Well, I will see you behind me.'],
    ],
    bossIntro: [['hopper', 'My home turf, one on one. Try to keep up with the hop!']],
    outro: [
      ['hopper', 'Okay, okay, you are quick! Boost Corp offered me a free kart, but the fine print says I must shout "BOOST IT!" every time I land.'],
      ['gramps', 'Fine print. Of course there is fine print.'],
      ['hopper', 'So I could race for your team, if you will have me. For a small fee. And no shouting.'],
    ],
    events: [
      {
        id: 'c1-0', type: 'race', track: 'sprout', goal: 8, laps: 1, tutorial: true, tip: 'Hold DRIFT in a bend and let go on the sparks for a boost. Parts come from the Workshop after this one.', title: 'Scrapyard Dash', reward: 100, drop: 'engine1', dropAny: true,
        after: [
          ['gramps', 'You drift like a shopping trolley. I have never been prouder.'],
          ['gramps', 'You earned your first part! Open my Workshop from the Career menu. Parts go into sockets, and the Bucket only has two. Choose wisely.'],
        ],
      },
      { id: 'c1-1', type: 'race', track: 'sprout', goal: 3, title: 'First Laps', reward: 150, drop: 'tyres1' },
      { id: 'c1-2', type: 'gems', track: 'downs', n: 12, title: 'Shiny Things', reward: 150, drop: 'turbo1' },
      { id: 'c1-3', type: 'race', track: 'coral', goal: 3, title: 'Beach Day', reward: 170, drop: 'armor1' },
      { id: 'c1-4', type: 'time', track: 'sprout', target: 118, title: 'Beat the Clock', reward: 170 },
      { id: 'c1-b', type: 'duel', track: 'downs', title: 'Hopper Hops In', reward: 400, boss: true, drop: 'driftSpring', bp: true },
    ],
  },
  {
    id: 'c2', name: 'Sun & Surf', rival: 'zorp', alt: 'ember', cls: 'chill', diff: 'normal', bossDiff: 'normal',
    blurb: 'Boardwalks, blossoms and sand in everything.',
    ai: { bodies: ['buggy', 'classic'], up: 0 }, boss: { body: 'tub', up: 0 },
    clue: 'The Starbolt statue in the Boost Corp lobby says the Baron designed it alone.',
    intro: [
      ['mic', 'The Sun and Surf league! Sand, sea and a very strange visitor.'],
      ['zorp', 'Greetings, Earth racer. Zorp has come for your gems. All of them.'],
      ['gramps', 'Gems give you a little extra top speed, and I pay a few coins for every one you grab. Mud Boots are handy on all this sand.'],
    ],
    bossIntro: [['zorp', 'Zorp scanners predict a 97 percent chance of Zorp victory.']],
    outro: [
      ['zorp', 'Recalculating... Zorp would like to join your crew. Zorp accepts coins.'],
      ['zorp', 'Also. Zorp visited the Boost Corp lobby. There is a statue of the Starbolt. The plaque says "designed by Baron Von Boost". A photo behind it is cropped, but Zorp can see an elbow.'],
      ['gramps', 'That elbow is my best feature. ...Gearbox Gus, they called me. Champion, once. A long time ago.'],
    ],
    events: [
      { id: 'c2-1', type: 'race', track: 'tidal', goal: 3, title: 'Twist and Shout', reward: 220, drop: 'turbo1' },
      { id: 'c2-2', type: 'gems', track: 'blossom', n: 14, title: 'Petal Pickup', reward: 220, drop: 'armor1' },
      { id: 'c2-3', type: 'time', track: 'coral', target: 106, title: 'Sandbar Sprint', reward: 220 },
      { id: 'c2-4', type: 'race', track: 'dunes', goal: 3, title: 'Desert Heat', reward: 250 },
      { id: 'c2-b', type: 'duel', track: 'tidal', title: 'Close Encounter', reward: 550, boss: true, drop: 'gemVac', bp: true },
    ],
  },
  {
    id: 'c3', name: 'Frostbite Trials', rival: 'pip', alt: 'volt', cls: 'zoom', diff: 'normal', bossDiff: 'normal',
    blurb: 'Snow, black ice and a penguin who never brakes.',
    ai: { bodies: ['classic'], up: 0 }, boss: { body: 'classic', up: 1 },
    clue: 'Gramps and the Baron built the Starbolt together. The Baron kept the plans and pushed Gramps out.',
    intro: [
      ['mic', 'Frostbite Trials! It is minus twenty and the tyres are not happy about it.'],
      ['pip', 'Ice is my best friend. It is about to be your worst enemy!'],
      ['gramps', 'Less grip up here. Lift before the bend, drift long and do not fight the slide. Fresh Tyres or Ice Studs in the sockets help a lot.'],
    ],
    bossIntro: [['pip', 'Glacier Gorge. Just you, me and a whole lot of nothing to hold on to.']],
    outro: [
      ['pip', 'Wheee... wait, you won? Teach me that line! Also, Boost Corp makes us all wear the same scarf. I like my own scarf.'],
      ['gramps', 'I had a partner once. We built a kart called the Starbolt. He kept the plans, and I kept my spanner. I got the better deal.'],
      ['gramps', 'Speed class goes up from here. Time to think about a proper kart.'],
    ],
    events: [
      { id: 'c3-1', type: 'race', track: 'frost', goal: 3, title: 'Cold Start', reward: 280, drop: 'tyres2' },
      { id: 'c3-2', type: 'race', track: 'candy', goal: 3, title: 'Sugar Rush', reward: 280 },
      { id: 'c3-3', type: 'gems', track: 'frost', rev: true, n: 15, title: 'Ice Crystals', reward: 280, drop: 'turbo2' },
      { id: 'c3-4', type: 'time', track: 'glacier', target: 126, title: 'Black Ice', reward: 300 },
      { id: 'c3-b', type: 'duel', track: 'glacier', title: 'Penguin Showdown', reward: 700, boss: true, drop: 'iceStuds', bp: true },
    ],
  },
  {
    id: 'c4', name: 'Spooky Season', rival: 'ember', alt: 'zorp', cls: 'zoom', diff: 'normal', bossDiff: 'hard',
    blurb: 'Haunted lanes, falling leaves and a fox with a grudge.',
    ai: { bodies: ['classic', 'tub'], up: 1 }, boss: { body: 'comet', up: 2 },
    clue: 'Ember drove for Boost Corp until she read her contract. Rivals can change sides.',
    intro: [
      ['mic', 'Spooky Season! Ghosts in the hollow, boulders in the jungle and leaves on the racing line.'],
      ['ember', 'Oh, the rookie from the scrapyard. Cute. Boost Corp pays for my pads, my paint and my smile. Try not to get lost in the dark.'],
      ['gramps', 'Shortcuts are narrow and half hidden up here. A Scout Lamp helps you find them.'],
    ],
    bossIntro: [['ember', 'Temple Tunnel is my shortcut. Let us see if you can find it.']],
    outro: [
      ['ember', 'Fine. You are good. Like, annoyingly good. And I finally read my contract by torchlight.'],
      ['ember', '"Driver must lose to nobody, ever, or be replaced." Replaced! I am done with that. I am in, if the pay is right.'],
      ['gramps', 'Welcome to the scrapyard, fox. Next up is the factory district. Watch for oil.'],
    ],
    events: [
      { id: 'c4-1', type: 'race', track: 'hollow', goal: 3, title: 'Things That Go Bump', reward: 330 },
      { id: 'c4-2', type: 'race', track: 'maple', goal: 2, title: 'Red Leaves', reward: 350, drop: 'engine2' },
      { id: 'c4-3', type: 'gems', track: 'jungle', n: 18, title: 'Temple Treasure', reward: 330 },
      { id: 'c4-4', type: 'time', track: 'maple', target: 142, title: 'Down the Ridge', reward: 350 },
      { id: 'c4-b', type: 'duel', track: 'jungle', title: 'Fox Hunt', reward: 850, boss: true, drop: 'scoutLamp', bp: true },
    ],
  },
  {
    id: 'c5', name: 'Heavy Metal', rival: 'volt', alt: 'rexi', cls: 'zoom', diff: 'normal', bossDiff: 'hard',
    blurb: 'Oil slicks, barrels and a robot that never makes mistakes.',
    ai: { bodies: ['classic', 'comet', 'tub'], up: 1 }, boss: { body: 'comet', up: 3 },
    clue: 'The Baron offered you a golden seat. You folded the contract into a paper plane.',
    intro: [
      ['volt', 'ANALYSIS: YOUR KART IS 34 PERCENT TAPE.'],
      ['baron', 'Rookie! A word. Drive for Boost Corp: a golden kart, free parts for life, a seat on the Circuit board. All you must do is forget your mentor.'],
      ['mic', 'And the rookie folds the contract into a paper plane! It lands in the Baron\'s coffee! The crowd goes wild!'],
      ['gramps', 'You did not have to do that. ...Thank you, kid. Gearworks is oil and barrels, and the racers here are sharp.'],
    ],
    bossIntro: [['volt', 'INITIATING DUEL PROTOCOL. PROBABILITY OF YOUR VICTORY: LOW.']],
    outro: [
      ['volt', 'ERROR: DEFEAT NOT FOUND IN DATABASE. ...ADDING IT NOW.'],
      ['volt', 'SECRET FILE UNLOCKED: MAGMA MOUNTAIN BOOST PADS ARE WIRED TO HELP APPROVED KARTS ONLY. WARNING YOU. COMPASSION.EXE LOADED.'],
      ['mic', 'The rookie is still climbing! Next: the volcano.'],
    ],
    events: [
      { id: 'c5-1', type: 'race', track: 'gear', goal: 3, title: 'Grease Monkey', reward: 400 },
      { id: 'c5-2', type: 'time', track: 'neon', target: 113, title: 'Night Shift', reward: 400 },
      { id: 'c5-3', type: 'gems', track: 'gear', rev: true, n: 18, title: 'Nuts and Bolts', reward: 400 },
      { id: 'c5-4', type: 'race', track: 'neon', rev: true, goal: 2, title: 'Flipside Flyover', reward: 430, drop: 'armor2' },
      { id: 'c5-b', type: 'duel', track: 'gear', title: 'Man vs Machine', reward: 1000, boss: true, drop: 'slipSail', bp: true },
    ],
  },
  {
    id: 'c6', name: 'Trial by Fire', rival: 'rexi', alt: 'bruno', cls: 'turbo', diff: 'normal', bossDiff: 'hard',
    blurb: 'Lava, obsidian and a floating fairground. Turbo class.',
    ai: { bodies: ['classic', 'comet', 'stomper'], up: 2 }, boss: { body: 'stomper', up: 3 },
    clue: 'The Baron keeps a locked garage on the moon base. Gramps\'s first Starbolt blueprint is inside.',
    intro: [
      ['mic', 'Trial by Fire, in Turbo class! Hold on to your helmets.'],
      ['rexi', 'STOMP! Magma Mountain eats rookies for breakfast! Also the boost pads keep flickering. I just stomp. I do not ask.'],
      ['gramps', 'Rigged pads, wired to the approved karts. The Bucket has no sticker, so mind the flickering ones. A Wing Kit gets you over the worst of it.'],
    ],
    bossIntro: [['rexi', 'Top of the volcano, one on one. Last one down is a fossil!']],
    outro: [
      ['rexi', 'You did not melt? RESPECT. Stomp stomp. I did not know about the pads. I am telling the Baron what I think of that.'],
      ['gramps', 'Only one league left, kid. And it is not on this planet. The Baron\'s private garage is up there, locked tight.'],
      ['gramps', 'Behind that door sits the first Starbolt blueprint, with my name on the corner. I would bet my spanner on it.'],
    ],
    events: [
      { id: 'c6-1', type: 'race', track: 'magma', goal: 3, title: 'Hot Wheels', reward: 480 },
      { id: 'c6-2', type: 'race', track: 'obsidian', goal: 2, title: 'Black Glass', reward: 500 },
      { id: 'c6-3', type: 'time', track: 'cloud', target: 99, title: 'Head in the Clouds', reward: 480, drop: 'turbo2' },
      { id: 'c6-4', type: 'gems', track: 'obsidian', rev: true, n: 20, title: 'Lava Gems', reward: 480 },
      { id: 'c6-b', type: 'duel', track: 'magma', title: 'Dino Might', reward: 1200, boss: true, drop: 'bumperPlate', bp: true },
    ],
  },
  {
    id: 'c7', name: 'To the Moon', rival: 'baron', alt: 'bruno', field: ['bruno'], joins: ['bruno'], cls: 'turbo', diff: 'hard', bossDiff: 'hard',
    blurb: 'Low gravity, the Big Bear and the Golden Wheel.',
    ai: { bodies: ['comet', 'stomper', 'classic'], up: 2 }, boss: { body: 'bolt', up: 3 },
    clue: 'The Baron raced the Golden Wheel himself, in a kart that was the same as everyone else\'s.',
    intro: [
      ['mic', 'The final league! Racing on the moon: low gravity, big air and the Big Bear himself.'],
      ['bruno', 'Five years I have held the Golden Wheel, kid. You and that junk heap will not change that.'],
      ['baron', 'Bruno, please. A gentleman steps in when it matters. I have entered the Golden Wheel Cup myself. Do try to keep up, scrapyard.'],
      ['gramps', 'Win the Golden Wheel Cup and the title is yours. No pressure. Well. A little pressure.'],
    ],
    bossIntro: [['baron', 'Four races. One Wheel. And a company that owns the road. Shall we?']],
    outro: [
      ['mic', 'UNBELIEVABLE! A rookie from the scrapyard has won the Golden Wheel!'],
      ['baron', 'Impossible. My kart is perfect. It is exactly the same as everyone else\'s... Oh. I see the problem.'],
      ['gramps', 'That is what approved means, Baron. Nobody is allowed to be better than the plan.'],
      ['baron', 'Take the keys to my garage, Gus. The blueprints, the first Starbolt, all of it. I should have said sorry thirty years ago.'],
      ['bruno', 'Heh. Good racing, champ. Rematch any time. And I would race for you, for the right price.'],
    ],
    epilogue: [
      ['gramps', 'The Starbolt plans are back where they belong. Race-spec parts are on my shelves now, Tier III, no questions asked.'],
      ['mic', 'But wait! A letter from the Circuit: the Zoomies League begins soon, with harder tracks, wilder rivals and a brand new adventure!'],
      ['gramps', 'Coming soon. The Bucket is retired. Well, parked. Well, still racing. Polish that trophy, champ.'],
    ],
    events: [
      { id: 'c7-1', type: 'race', track: 'moon', goal: 3, title: 'One Small Step', reward: 560 },
      { id: 'c7-2', type: 'time', track: 'moon', target: 94, title: 'Moonwalk', reward: 560 },
      { id: 'c7-3', type: 'race', track: 'glacier', rev: true, goal: 3, title: 'Frozen Flip', reward: 580 },
      { id: 'c7-4', type: 'gems', track: 'cloud', n: 22, title: 'Sky High', reward: 560 },
      { id: 'c7-b', type: 'cup', tracks: ['moon', 'obsidian', 'glacier', 'neon'], title: 'Golden Wheel Cup', reward: 2500, boss: true, drop: 'rocketPill', bp: true },
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
    paint: 'stock', paints: ['stock'],
    // Gramps's Workshop (workshop.js): owned parts, what is fitted, extra sockets, parts already earned
    pv: 2, upgrades: {}, parts: {}, bought: {}, loadouts: {}, sockets: {}, drops: {}, pnew: false,
    stars: {}, done: {}, best: {}, seen: {}, beaten: [], champion: false, earned: 0,
    // profile: XP, lifetime stats, trophies, daily streak and cosmetics
    xp: 0, stats: {}, ach: {}, daily: { done: '', streak: 0, best: 0 }, freeCaps: 0,
    missions: { day: '', prog: {}, done: [], streak: 0, last: '' }, // daily missions (missions.js)
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

const DAY = /^\d{4}-\d\d-\d\d$/;
const day = (v) => (typeof v === 'string' && DAY.test(v) ? v : '');
// Daily missions: a date, up to 12 progress counters, the finished ids and the streak.
export function cleanMissions(m) {
  if (!isObj(m)) return { day: '', prog: {}, done: [], streak: 0, last: '' };
  const prog = {};
  for (const [k, v] of Object.entries(m.prog && isObj(m.prog) ? m.prog : {}).slice(0, 12)) if (!UNSAFE.has(k) && k.length <= 16 && Number.isFinite(v)) prog[k] = count(v, 1000);
  const done = Array.isArray(m.done) ? [...new Set(m.done.filter((x) => typeof x === 'string' && x.length <= 16))].slice(0, 12) : [];
  return { day: day(m.day), prog, done, streak: count(m.streak, 10000), last: day(m.last) };
}

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
  // Parts (see workshop.js). Old saves (no pv) had 4 upgrade levels per kart: they become parts.
  c.parts = mapObj(saved.parts, (v) => (Number.isFinite(v) && v > 0 ? count(v, MAX_PARTS) : undefined));
  c.bought = mapObj(saved.bought, (v) => (Number.isFinite(v) && v > 0 ? count(v, MAX_PARTS) : undefined));
  c.sockets = mapObj(saved.sockets, (v) => (Number.isFinite(v) ? count(v, 1) : undefined));
  c.drops = mapObj(saved.drops, (v) => (isStr(v) && isPart(v) ? v : undefined));
  c.loadouts = mapObj(saved.loadouts, (l) => (isObj(l) ? {
    cur: Array.isArray(l.cur) ? l.cur.filter(isStr).slice(0, MAX_SOCKETS) : [],
    pre: Array.isArray(l.pre) ? l.pre.slice(0, 3).map((p) => (Array.isArray(p) ? p.filter(isStr).slice(0, MAX_SOCKETS) : [])) : [],
  } : undefined));
  c.pnew = !!saved.pnew;
  if (saved.pv !== 2 && isObj(saved.upgrades)) {
    const lv = mapObj(saved.upgrades, (u) => (isObj(u) ? mapObj(u, (v) => (Number.isFinite(v) ? count(v, 5) : undefined)) : undefined));
    migrateUpgrades(c, lv);
  }
  c.upgrades = {};
  c.pv = 2;
  normalizeShop(c);
  c.stars = mapObj(saved.stars, (v) => (Number.isFinite(v) ? count(v, 3) : undefined));
  const flag = (v) => (typeof v === 'boolean' || Number.isFinite(v) || isStr(v) ? v : undefined);
  c.done = mapObj(saved.done, flag);
  // Saves from before the prologue race: it counts as done, so it never nags.
  if (saved.pv !== 2 && Object.keys(c.done).length) c.done['c1-0'] = true;
  c.seen = mapObj(saved.seen, flag);
  c.best = mapObj(saved.best, (v) => (Number.isFinite(v) && v > 0 ? v : undefined));
  c.ach = mapObj(saved.ach, (v) => (v === true || (Number.isFinite(v) && v > 0) ? v : undefined));
  // Lifetime stats: counters, or lists of ids.
  c.stats = mapObj(saved.stats, (v) => (Array.isArray(v) ? v.filter((x) => isStr(x) || Number.isFinite(x)).slice(0, 1000) : Number.isFinite(v) ? count(v) : undefined));
  const d = isObj(saved.daily) ? saved.daily : {};
  c.daily = { done: isStr(d.done) ? d.done : '', streak: count(d.streak), best: count(d.best) };
  c.missions = cleanMissions(saved.missions);
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

// Story so far: how many chapters are finished and the clues they gave.
export const chaptersDone = (c) => CHAPTERS.filter((ch) => c.done[ch.events.find((e) => e.boss).id]).length;
export const storyClues = (c) => CHAPTERS.filter((ch) => c.done[ch.events.find((e) => e.boss).id]).map((ch) => ch.clue);

export function rivalFor(c, chapter) {
  return chapter.rival === c.racer ? chapter.alt : chapter.rival;
}

// ---------------- karts ----------------
// What a vehicle runs with: the parts fitted in its sockets.
export function playerLoadout(c) {
  return { body: c.body, upgrades: kitOf(c, c.body), paint: paintById(c.paint).color };
}

export function playerStats(c, racer = c.racer, body = c.body) {
  return kartStats(charById(racer), body, kitOf(c, body));
}

// Loadouts for the computer racers of a chapter, keyed by racer id. They run
// old-school flat boosts (the `up` level) instead of sockets and parts.
export function aiLoadouts(chapter, ids, rival) {
  const out = {};
  ids.forEach((id, i) => {
    if (id === rival) out[id] = { body: chapter.boss.body, upgrades: { flat: chapter.boss.up } };
    else out[id] = { body: chapter.ai.bodies[i % chapter.ai.bodies.length], upgrades: { flat: chapter.ai.up } };
  });
  return out;
}

// ---------------- event hints ----------------
// What a track is like, from its definition: shown on the event card with a
// tip from Gramps about which parts suit it.
export function trackTraits(id) {
  const t = trackById(id);
  const out = [];
  const patches = new Set((t.patches || []).map((p) => p.type));
  const scs = t.shortcuts || [];
  const surf = new Set(scs.map((s) => s.surface));
  const rampsOf = (list) => list.flatMap((s) => s.ramps || []);
  const add = (key, icon, label) => out.push({ key, icon, label });
  if ((t.grip ?? 1) < 0.8 || patches.has('ice') || surf.has('ice')) add('ice', '❄️', 'Ice and snow');
  if (patches.has('mud')) add('mud', '🟤', 'Mud');
  if (patches.has('sand') || surf.has('offroad')) add('sand', '🏖️', 'Sand');
  if (patches.has('oil')) add('oil', '🛢️', 'Oil');
  if ((t.ramps || []).some((r) => r.glide) || rampsOf(scs).some((r) => r.glide)) add('glide', '🪂', 'Glide ramps');
  else if ((t.ramps || []).length || scs.some((s) => (s.voids || []).length)) add('jumps', '🦘', 'Jumps');
  if ((t.gravity ?? 1) < 1) add('lowg', '🌙', 'Low gravity');
  if (scs.length) add('shortcuts', '🧭', `${scs.length} shortcut${scs.length > 1 ? 's' : ''}`);
  if (scs.some((s) => (s.width || 10) <= 9)) add('narrow', '↔️', 'Narrow shortcuts');
  return out;
}

const TIPS = {
  ice: 'Ice Studs keep you on the road, and Tyres bite harder than any engine.',
  mud: 'Mud Boots shrug off the sticky patches.',
  sand: 'Mud Boots and a Scout Lamp make the sandy shortcuts worth it.',
  oil: 'Mud Boots also shrug off oil slicks.',
  glide: 'A Wing Kit stretches every glide and lands with a boost.',
  lowg: 'A Wing Kit makes the long floaty jumps even better.',
  shortcuts: 'A Scout Lamp lights up the shortcut entrances.',
  narrow: 'Light, grippy builds fit the narrow shortcuts best.',
};
export function grampsTip(ev) {
  if (ev.tip) return ev.tip;
  const traits = new Set(trackTraits(ev.type === 'cup' ? ev.tracks[0] : ev.track).map((t) => t.key));
  const tips = [];
  if (ev.type === 'gems') tips.push('Gem Vac sucks gems in from further away, and Scout Lamp doubles the ones in shortcuts.');
  else if (ev.type === 'time') tips.push('Drift Spring and Rocket Pill shave seconds off a solo lap.');
  else if (ev.type === 'duel') tips.push('Bumper Plate wins shoving matches, and a Turbo Coil wins the sprint.');
  else if (ev.type === 'cup') tips.push('Four tracks, four builds. Swap parts between races in the Workshop.');
  for (const k of ['ice', 'mud', 'sand', 'oil', 'glide', 'lowg', 'shortcuts', 'narrow']) if (traits.has(k) && tips.length < 2) tips.push(TIPS[k]);
  if (!tips.length) tips.push('Engine for the straights, Tyres for the bends. Try both.');
  return tips.join(' ');
}

// ---------------- parts earned from events ----------------
// A 3-star clear drops the event's part once; boss Blueprints and the
// prologue part come with the first clear.
function earnDrop(c, ev, pass, stars) {
  if (!pass || !ev.drop || !isPart(ev.drop) || c.drops[ev.id]) return null;
  if (!(ev.bp || ev.dropAny) && stars < 3) return null;
  if (!grantPart(c, ev.drop)) return null;
  c.drops[ev.id] = ev.drop;
  return { id: ev.drop, part: partById(ev.drop), blueprint: !!ev.bp };
}

// ---------------- text ----------------
export function trackLabel(id, rev) {
  const t = trackById(id);
  return t.name + (rev ? ' (reverse)' : '');
}

export function goalLabel(ev, c) {
  switch (ev.type) {
    case 'race': return ev.goal === 1 ? 'Win the race' : ev.goal >= 8 ? 'Finish the race' : `Finish in the top ${ev.goal}`;
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
  if (ev.type === 'race') return ev.goal === 1 ? 'Goal: win' : ev.goal >= 8 ? 'Goal: finish' : `Goal: top ${ev.goal}`;
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
  let unlocked = null, chapterDone = false, blueprint = false;
  if (firstClear && ev.boss) {
    chapterDone = true;
    // The rivals who join the team: the beaten rival (and the alternate, if you drive the rival).
    const joiners = chapter.joins || [chapter.rival, rivalFor(c, chapter)];
    for (const j of joiners) if (!c.beaten.includes(j)) c.beaten.push(j);
    unlocked = joiners[0];
    if (ci === CHAPTERS.length - 1) { c.champion = true; blueprint = true; }
  }
  const drop = earnDrop(c, ev, sc.pass, c.stars[evId]);
  // Scenes to play on the hub: this event's, the chapter's outro and the epilogue.
  const stories = [];
  if (firstClear && ev.after) stories.push({ key: `${evId}-after`, lines: ev.after, title: ev.title });
  if (chapterDone) {
    stories.push({ key: `${chapter.id}-outro`, lines: chapter.outro, title: chapter.name });
    if (chapter.epilogue) stories.push({ key: `${chapter.id}-epilogue`, lines: chapter.epilogue, title: 'Epilogue' });
  }
  saveCareer(c);
  return { ...sc, coins, lines, firstClear, newStars, prevStars, unlocked, chapterDone, drop, blueprint, stories, ev, chapter, ci };
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Racers you can hire: beaten rivals (Mochi is always on the team), and the
// newer racers once you reach their player level.
export const racerAvailable = (c, id) => id === 'mochi' || c.beaten.includes(id) || (!!charById(id).lvl && levelOf(c.xp || 0).level >= charById(id).lvl);

export const ALL_RACERS = CHARACTERS.map((ch) => ch.id);
