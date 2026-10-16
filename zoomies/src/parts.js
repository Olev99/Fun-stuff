// Parts for Gramps's Workshop. Every vehicle has a few sockets; each socket
// holds one part. Stat parts come in three tiers (Tier III is "race-spec": a
// big bonus with a real drawback) and only one of each family fits at a time.
// Special parts are single perks that suit some tracks. This file is plain
// data plus the maths that turns a list of parts into kart stats, so the
// race, the Workshop and the save code can all share it.

export const FAMILIES = {
  engine: { id: 'engine', name: 'Engine', icon: '🔧', blurb: 'Higher top speed.' },
  turbo: { id: 'turbo', name: 'Turbo Coil', icon: '💨', blurb: 'Quicker acceleration and stronger drift boosts.' },
  tyres: { id: 'tyres', name: 'Tyres', icon: '🛞', blurb: 'Sharper steering and more grip, especially on ice.' },
  armor: { id: 'armor', name: 'Armour', icon: '🛡️', blurb: 'Heavier bumps and shorter spin-outs.' },
};
export const FAMILY_LIST = Object.values(FAMILIES);
export const TIER_NAME = ['', 'I', 'II', 'III'];

// Stat deltas per part (added to the racer + body stats). grip, turbo, armor and
// soft are multipliers' deltas: grip +0.05 means 5% more grip, soft < 1 slows sand/mud.
const STAT_FX = {
  engine: [null, { speed: 0.4 }, { speed: 0.85 }, { speed: 1.4, accel: -0.4 }],
  turbo: [null, { accel: 0.35, turbo: 0.06 }, { accel: 0.7, turbo: 0.13 }, { accel: 1.2, turbo: 0.24, speed: -0.3 }],
  tyres: [null, { handling: 0.3, grip: 0.05 }, { handling: 0.6, grip: 0.1 }, { handling: 1.1, grip: 0.18, soft: 0.88 }],
  armor: [null, { weight: 0.35, armor: -0.06 }, { weight: 0.7, armor: -0.12 }, { weight: 1.2, armor: -0.2, accel: -0.4 }],
};
const DRAWBACK = {
  engine: 'Slower acceleration',
  turbo: 'Slightly lower top speed',
  tyres: 'Slower on sand and mud',
  armor: 'Slower acceleration',
};
// [Tier I, II, III] coins; chapter (0-based) the Workshop starts selling Tier I/II.
const STAT_PRICE = { engine: [180, 760, 1400], turbo: [160, 680, 1250], tyres: [150, 600, 1100], armor: [130, 520, 950] };
const STAT_FROM = { engine: [0, 2], turbo: [0, 3], tyres: [0, 2], armor: [0, 4] };

const SPECIALS = [
  { id: 'driftSpring', name: 'Drift Spring', icon: '🌀', price: 850, from: 2, blurb: 'Drift charges 35% faster.', suits: 'twisty tracks' },
  { id: 'slipSail', name: 'Slip Sail', icon: '⛵', price: 780, from: 2, blurb: 'Slipstream starts sooner, reaches further and boosts harder.', suits: 'busy packs' },
  { id: 'scoutLamp', name: 'Scout Lamp', icon: '🔦', price: 700, from: 3, blurb: 'Shortcut gems count double, shortcut entrances glow, and sand and candy shortcuts slow you less.', suits: 'shortcut tracks' },
  { id: 'gemVac', name: 'Gem Vac', icon: '🧹', price: 650, from: 1, blurb: 'Gems fly in from further away, and a hit only costs you 1 gem instead of 3.', suits: 'gem hunts' },
  { id: 'mudBoots', name: 'Mud Boots', icon: '🥾', price: 900, from: 1, blurb: 'Mud, sand, grass and oil barely slow you.', suits: 'mud, sand and oil' },
  { id: 'iceStuds', name: 'Ice Studs', icon: '❄️', price: 980, from: 3, blurb: 'Black ice and snow grip like tarmac, at a small speed cost on dry roads.', suits: 'snow and ice' },
  { id: 'rocketPill', name: 'Rocket Pill', icon: '💊', price: 1180, from: 4, blurb: 'A stronger rocket start and a free little boost off every grid.', suits: 'every race' },
  { id: 'wingKit', name: 'Wing Kit', icon: '🪽', price: 1100, from: 5, blurb: 'Glide further and land with a bigger boost.', suits: 'glide ramps and moon jumps' },
  { id: 'bumperPlate', name: 'Bumper Plate', icon: '🛡', price: 1050, from: 4, blurb: 'Your bumps shove rivals harder and you get shoved less.', suits: 'duels and battles' },
  { id: 'itemPouch', name: 'Item Pouch', icon: '👝', price: 1400, from: 5, blurb: 'Carry a second item. Grab another box while you hold one.', suits: 'everything' },
  { id: 'comebackSpring', name: 'Comeback Spring', icon: '🔄', price: 1180, from: 5, blurb: 'When you are last, every hit you take ends with a free boost.', suits: 'chaotic fields' },
];

export const PARTS = {};
for (const f of FAMILY_LIST) {
  for (let t = 1; t <= 3; t++) {
    const id = `${f.id}${t}`;
    PARTS[id] = {
      id, kind: 'stat', family: f.id, tier: t, name: `${f.name} ${TIER_NAME[t]}`, icon: f.icon,
      price: STAT_PRICE[f.id][t - 1], from: t === 3 ? 99 : STAT_FROM[f.id][t - 1], fx: STAT_FX[f.id][t],
      blurb: f.blurb, drawback: t === 3 ? DRAWBACK[f.id] : null,
    };
  }
}
for (const s of SPECIALS) PARTS[s.id] = { ...s, kind: 'special', family: s.id, tier: 0, drawback: null };

export const PART_LIST = Object.values(PARTS);
export const partById = (id) => PARTS[id] || null;
export const isPart = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PARTS, id);

// Earned parts (drops) sell back for a small fixed amount.
export const EARNED_SELL = 40;
export const MAX_PARTS = 20; // copies of one part
export const MAX_SOCKETS = 6;

// Sockets a vehicle has from the factory; a Chassis Mod adds one more.
export const BASE_SOCKETS = { buggy: 2, classic: 3, tub: 3, bike: 3, scooter: 3, comet: 4, stomper: 4, chopper: 4, sportbike: 4, bolt: 5 };
export const baseSockets = (bodyId) => BASE_SOCKETS[bodyId] || 3;
export const chassisPrice = (body) => Math.min(3000, Math.max(800, Math.round((800 + (body.price || 0) * 0.5) / 50) * 50));

// A set of part ids fitted together: at most one stat part per family, and
// each special once.
export function cleanFit(ids, sockets = MAX_SOCKETS) {
  const out = [], seen = new Set();
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!isPart(id)) continue;
    const key = PARTS[id].family;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
    if (out.length >= sockets) break;
  }
  return out;
}

// The multiplier an AI chapter's flat "up" level stands for (the old ladder):
// every level is worth about this much of each stat.
const FLAT = { speed: 0.32, accel: 0.3, handling: 0.28, weight: 0.3, grip: 0.06, turbo: 0.05, armor: -0.07 };

// Effective stats of a racer in a body with a kit of parts. `kit` is
// { parts: [ids] } (the player), { flat: n } (computer racers, n = 0..5 old
// upgrade levels) or the old { engine, turbo, tyres, armor } levels.
// speed/accel/handling/weight are on the racers' 1-5 scale and can pass it;
// the rest are multipliers.
export function statsFrom(base, bodyStats, kit = {}, bodyOffroad = 0.5) {
  const d = { speed: 0, accel: 0, handling: 0, weight: 0, grip: 0, turbo: 0, armor: 0 };
  let soft = 1;
  const perks = {};
  if (kit && Array.isArray(kit.parts)) {
    for (const id of cleanFit(kit.parts)) {
      const p = PARTS[id];
      if (p.kind === 'special') { perks[id] = true; continue; }
      for (const [k, v] of Object.entries(p.fx)) {
        if (k === 'soft') soft *= v;
        else d[k] += v;
      }
    }
  } else if (kit && Number.isFinite(kit.flat)) {
    const n = Math.max(0, Math.min(5, kit.flat));
    for (const k of Object.keys(FLAT)) d[k] = FLAT[k] * n;
  } else if (kit) {
    const lv = (k) => Math.max(0, Math.min(5, kit[k] || 0));
    d.speed = lv('engine') * FLAT.speed; d.accel = lv('turbo') * FLAT.accel; d.handling = lv('tyres') * FLAT.handling;
    d.weight = lv('armor') * FLAT.weight; d.grip = lv('tyres') * FLAT.grip; d.turbo = lv('turbo') * FLAT.turbo; d.armor = lv('armor') * FLAT.armor;
  }
  return {
    speed: base.speed + bodyStats.speed + d.speed,
    accel: base.accel + bodyStats.accel + d.accel,
    handling: base.handling + bodyStats.handling + d.handling,
    weight: base.weight + bodyStats.weight + d.weight,
    grip: 1 + d.grip,
    turbo: 1 + d.turbo,
    armor: 1 + d.armor,
    offroad: bodyOffroad,
    soft,
    perks,
  };
}
