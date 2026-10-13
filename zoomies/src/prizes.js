import { CHARACTERS } from './characters.js';
import { BODY_LIST, bodyIcon } from './karts.js';
import { PAINTS } from './career.js';
import { PART_LIST } from './parts.js';
import { grant as grantPart, owned } from './workshop.js';

// Jackpots: rare real prizes from the gumball machine, rolled before the
// cosmetics. Each is only offered while there is something left to win.
export const JACKPOT_COINS = 1500;
const TABLE = [
  { prize: 'paint', chance: 0.03 },
  { prize: 'part', chance: 0.025 },
  { prize: 'coins', chance: 0.015 },
  { prize: 'body', chance: 0.007 },
  { prize: 'racer', chance: 0.003 },
];
export const JACKPOT_CHANCE = TABLE.reduce((a, t) => a + t.chance, 0);

const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

// What each prize would be right now, or null if there is nothing left.
function offer(c, prize, rnd) {
  const base = { kind: 'jackpot', rarity: 'jackpot', prize };
  if (prize === 'paint') {
    const left = PAINTS.filter((p) => p.price && !(c.paints || []).includes(p.id));
    if (!left.length) return null;
    const p = pick(left, rnd);
    return { ...base, id: `paint:${p.id}`, ref: p.id, icon: '🎨', name: `${p.name} paint`, note: 'New paint job in your Garage!' };
  }
  if (prize === 'part') {
    // A free random Tier I or II stat part for Gramps's Workshop.
    const left = PART_LIST.filter((p) => p.kind === 'stat' && p.tier <= 2 && owned(c, p.id) < 5);
    if (!left.length) return null;
    const p = pick(left, rnd);
    return { ...base, id: `part:${p.id}`, ref: p.id, icon: p.icon, name: `Free ${p.name}`, note: 'A new part for the Workshop!' };
  }
  if (prize === 'coins') {
    return { ...base, id: 'coins', ref: JACKPOT_COINS, icon: '💰', name: `${JACKPOT_COINS.toLocaleString('en-US')} coins`, note: 'Coin jackpot!' };
  }
  if (prize === 'body') {
    const left = BODY_LIST.filter((b) => b.price && !c.bodies.includes(b.id));
    if (!left.length) return null;
    const b = pick(left, rnd);
    return { ...base, id: `body:${b.id}`, ref: b.id, icon: bodyIcon(b), name: b.name, note: `A free ${b.kind === 'bike' ? 'bike' : 'kart'}! Drive it anywhere.` };
  }
  if (prize === 'racer') {
    const left = CHARACTERS.filter((ch) => ch.lvl && !c.racers.includes(ch.id));
    if (!left.length) return null;
    const ch = pick(left, rnd);
    return { ...base, id: `racer:${ch.id}`, ref: ch.id, icon: '⭐', name: `${ch.name} the ${ch.species}`, note: 'Joins your team! Race with them anywhere.' };
  }
  return null;
}

// Roll for a jackpot; on a hit, give it and return the prize.
export function rollJackpot(c, rnd = Math.random) {
  let r = rnd();
  for (const t of TABLE) {
    if ((r -= t.chance) >= 0) continue;
    const it = offer(c, t.prize, rnd);
    if (it) give(c, it);
    return it;
  }
  return null;
}

function give(c, it) {
  if (it.prize === 'paint') c.paints.push(it.ref);
  else if (it.prize === 'part') grantPart(c, it.ref);
  else if (it.prize === 'coins') { c.coins += it.ref; c.earned = (c.earned || 0) + it.ref; }
  else if (it.prize === 'body') c.bodies.push(it.ref);
  else if (it.prize === 'racer') c.racers.push(it.ref);
}
