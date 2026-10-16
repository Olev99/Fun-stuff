// Economy report for the Career: coins earned per chapter for a typical player,
// what the Workshop sells, what drops, and how much of a "wishlist" build the
// player could pay for after each chapter. Plain node, no browser:
//   node zoomies/tools/economy.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// career.js pulls in three.js through an import map in the browser; here we point it at the vendored copy.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const three = pathToFileURL(resolve(root, 'vendor/three.module.min.js')).href;
register(`data:text/javascript,export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(three)},shortCircuit:true};return n(s,c)}`);

const src = (f) => import(pathToFileURL(resolve(root, 'src', f)).href);
const { CHAPTERS, RACER_PRICE, scoreEvent, chapterMult } = await src('career.js');
const { PART_LIST, partById, chassisPrice } = await src('parts.js');
const { BODIES } = await src('karts.js');
const { inStock } = await src('workshop.js');

// ---- the typical player: 2nd place, 2 stars, a few gems, first clears ----
const GEMS = 8; // per race that has gems
const STAR_COINS = 40;
const P3 = 0.35; // share of events a decent player three-stars (and so earns their drop)
function eventCoins(ev, ci) {
  const res = { place: 2, gems: GEMS, finished: true, margin: 2, time: (ev.target || 0) * 0.95, wins: 2 };
  if (ev.type === 'duel' || ev.type === 'cup') res.place = 1;
  if (ev.type === 'race' && ev.goal <= 2) res.place = 2;
  const sc = scoreEvent(ev, res, chapterMult(ci));
  return sc.placeCoins + sc.gemCoins + ev.reward + 2 * STAR_COINS;
}

// ---- the wishlists: sensible full builds ----
// "lean" is the literal brief: 1 kart upgrade, 3 racers, parts on 2 vehicles, 2 Chassis Mods, 3 specials.
// "full" is what a keen player wants: two more vehicles to tune (a Starbolt and a bike) and parts for them.
// `parts` = Tier II parts per vehicle (the sockets left after the specials). Edit and rerun to try other builds.
const WISHES = {
  lean: { bodies: ['comet'], racers: ['volt', 'rexi', 'bruno'], chassis: ['buggy', 'comet'], specials: ['driftSpring', 'mudBoots', 'rocketPill'], parts: { buggy: 2, comet: 3 } },
  full: { bodies: ['comet', 'bolt', 'chopper'], racers: ['volt', 'rexi', 'bruno'], chassis: ['comet', 'bolt'], specials: ['driftSpring', 'mudBoots', 'rocketPill'], parts: { buggy: 2, comet: 4, bolt: 4, chopper: 4 } },
};
const FAMS = ['engine', 'turbo', 'tyres', 'armor'];
function wishItems(w) {
  const items = [];
  for (const b of w.bodies) items.push({ id: 'body:' + b, cost: BODIES[b].price, g: 'karts+bikes' });
  for (const r of w.racers) items.push({ id: 'racer:' + r, cost: RACER_PRICE[r], g: 'racers' });
  for (const b of w.chassis) items.push({ id: 'chassis:' + b, cost: chassisPrice(BODIES[b]), g: 'chassis mods' });
  for (const s of w.specials) items.push({ id: s, cost: partById(s).price, g: 'specials' });
  for (const n of Object.values(w.parts)) for (let i = 0; i < n; i++) items.push({ id: FAMS[i] + '2', cost: partById(FAMS[i] + '2').price, g: 'tier II parts' });
  return items;
}
const wl = Object.entries(WISHES).map(([name, w]) => {
  const items = wishItems(w), left = {};
  for (const i of items) left[i.id] = (left[i.id] || 0) + 1;
  return { name, items, left, total: items.reduce((a, i) => a + i.cost, 0), drop: 0 };
});

// ---- run the chapters ----
const rows = [];
let cum = 0;
const stocked = new Set();
for (let ci = 0; ci < CHAPTERS.length; ci++) {
  const ch = CHAPTERS[ci];
  const coins = Math.round(ch.events.reduce((a, e) => a + eventCoins(e, ci), 0));
  cum += coins;
  // drops: the guaranteed ones (boss Blueprint, prologue) plus P3 of the 3-star ones; value = price of a wished-for copy
  const drops = [];
  for (const e of ch.events) {
    if (!e.drop) continue;
    const p = e.bp || e.dropAny ? 1 : P3;
    drops.push(`${e.drop}${p < 1 ? '*' : ''}`);
    for (const w of wl) if (w.left[e.drop] > 0) { const t = Math.min(w.left[e.drop], p); w.left[e.drop] -= t; w.drop += t * partById(e.drop).price; }
  }
  const fresh = PART_LIST.filter((p) => !stocked.has(p.id) && !(p.kind === 'stat' && p.tier === 3) && inStock({}, p.id, ci));
  fresh.forEach((p) => stocked.add(p.id));
  rows.push({ ch: `c${ci + 1}`, coins, cum, shop: fresh.map((p) => p.id).join(' ') || '-', shopCum: [...stocked].reduce((a, id) => a + partById(id).price, 0), drops: drops.join(' ') || '-', share: wl.map((w) => Math.min(1, (cum + w.drop) / w.total)), dv: wl.map((w) => Math.round(w.drop)) });
}

// ---- print ----
const pad = (s, n) => String(s).padEnd(n);
console.log(`Typical player: place 2, 2 stars, ${GEMS} gems, first clears; 3-star drops at ${P3 * 100}% of events (* = 3-star drop)\n`);
console.log(pad('ch', 4), pad('coins', 6), pad('cum', 7), pad('shop 1x', 8), ...wl.map((w) => pad(`${w.name} (drops)`, 16)), 'new in shop / drops');
for (const r of rows) {
  console.log(pad(r.ch, 4), pad(r.coins, 6), pad(r.cum, 7), pad(r.shopCum, 8), ...r.share.map((x, i) => pad(`${Math.round(x * 100)}% (${r.dv[i]})`, 16)), `shop: ${r.shop}`);
  console.log(' '.repeat(66), `drops: ${r.drops}`);
}
for (const w of wl) {
  const g = {};
  for (const i of w.items) g[i.g] = (g[i.g] || 0) + i.cost;
  console.log(`\nWishlist ${w.name}: ${w.total} coins = ${Object.entries(g).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
const parts1 = PART_LIST.filter((p) => !(p.kind === 'stat' && p.tier === 3)).reduce((a, p) => a + p.price, 0);
console.log(`\nOne copy of every Tier I/II part and special: ${parts1} coins. Tier III sells only after the Golden Wheel.`);
const noParts = Object.values(BODIES).reduce((a, b) => a + b.price, 0) + Object.values(RACER_PRICE).reduce((a, p) => a + p, 0);
console.log(`Every kart, bike and Career racer, no parts at all: ${noParts} coins (story income ${cum}).`);
