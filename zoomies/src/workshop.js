import { BODIES } from './karts.js';
import { PARTS, PART_LIST, partById, isPart, cleanFit, baseSockets, chassisPrice, EARNED_SELL, MAX_PARTS, MAX_SOLD, MAX_SOCKETS, FAMILY_LIST } from './parts.js';

// Gramps's Workshop: the rules for owning, fitting, buying and selling parts.
// Everything works on the career save `c` so the UI, the race and the tests
// share one set of rules. Save fields:
//   parts     { partId: copies owned }
//   bought    { partId: copies that were bought (sell back for the full price) }
//   sold      { partId: copies ever sold; lets a sale survive a sync with a device that still holds the part }
//   loadouts  { bodyId: { cur: [partIds fitted], pre: [3 saved presets] } }
//   sockets   { bodyId: 0 | 1 }  extra sockets from Chassis Mods
//   drops     { eventId: partId } parts already earned from events
//   pnew      true while there is a part you have not looked at yet

export const PRESET_NAMES = ['Grip', 'Speed', 'Allround'];

export function ensure(c) {
  for (const k of ['parts', 'bought', 'sold', 'loadouts', 'sockets', 'drops']) if (!c[k] || typeof c[k] !== 'object' || Array.isArray(c[k])) c[k] = {};
  return c;
}

export const owned = (c, id) => (c.parts && c.parts[id]) || 0;
export const socketsOf = (c, body) => Math.min(MAX_SOCKETS, baseSockets(body) + ((c.sockets && c.sockets[body]) || 0));

export function loadout(c, body) {
  ensure(c);
  let l = c.loadouts[body];
  if (!l || typeof l !== 'object') l = c.loadouts[body] = {};
  if (!Array.isArray(l.cur)) l.cur = [];
  if (!Array.isArray(l.pre)) l.pre = [];
  while (l.pre.length < 3) l.pre.push([]);
  return l;
}
export const fittedIds = (c, body) => loadout(c, body).cur;

// Copies of a part sitting in sockets, on every vehicle (or all but `exceptBody`).
export function fittedCount(c, id, exceptBody = null) {
  let n = 0;
  for (const [b, l] of Object.entries(c.loadouts || {})) if (b !== exceptBody && l && Array.isArray(l.cur)) n += l.cur.filter((x) => x === id).length;
  return n;
}
export const freeCopies = (c, id) => owned(c, id) - fittedCount(c, id);

// Drop a part from the first other vehicle that has it fitted.
function steal(c, id, exceptBody) {
  for (const [b, l] of Object.entries(c.loadouts)) {
    if (b === exceptBody || !l || !Array.isArray(l.cur)) continue;
    const i = l.cur.indexOf(id);
    if (i >= 0) { l.cur.splice(i, 1); return b; }
  }
  return null;
}

// Put part `id` in socket `slot` of a vehicle. A part of the same family
// already fitted elsewhere on the vehicle swaps into the socket this one
// leaves. Returns { ok, moved } or { ok: false, why }.
export function equip(c, body, slot, id) {
  if (!isPart(id) || owned(c, id) < 1) return { ok: false, why: 'You do not own that part.' };
  const l = loadout(c, body);
  const cap = socketsOf(c, body);
  if (!(slot >= 0 && slot < cap)) return { ok: false, why: 'No such socket.' };
  slot = Math.min(slot, l.cur.length);
  const fam = PARTS[id].family;
  const old = l.cur[slot];
  const j = l.cur.findIndex((x, i) => i !== slot && PARTS[x].family === fam);
  if (j >= 0) {
    // Same family fitted in another socket: swap what was here into it.
    if (old) l.cur[j] = old; else l.cur.splice(j, 1);
    if (!old) slot = Math.min(slot, l.cur.length);
  }
  let moved = null;
  if (old !== id && fittedCount(c, id, body) >= owned(c, id)) moved = steal(c, id, body);
  l.cur[slot] = id;
  return { ok: true, moved };
}

export function unequip(c, body, slot) {
  const l = loadout(c, body);
  if (slot >= 0 && slot < l.cur.length) l.cur.splice(slot, 1);
}

export function setFit(c, body, ids) {
  const l = loadout(c, body);
  l.cur = [];
  for (const id of cleanFit(ids, socketsOf(c, body))) {
    if (owned(c, id) < 1) continue;
    if (fittedCount(c, id) >= owned(c, id)) steal(c, id, body);
    l.cur.push(id);
  }
}

export function savePreset(c, body, i) {
  const l = loadout(c, body);
  l.pre[i] = l.cur.slice();
}
export function loadPreset(c, body, i) {
  const l = loadout(c, body);
  setFit(c, body, l.pre[i] || []);
}

// ---- getting parts ----
// Fit a new part straight away when the current vehicle has a free socket and
// no part of that family yet, so a first part is never left in the box.
export function grant(c, id, { paid = false, fresh = true } = {}) {
  if (!isPart(id)) return false;
  ensure(c);
  if (owned(c, id) >= MAX_PARTS) return false;
  c.parts[id] = owned(c, id) + 1;
  if (paid) c.bought[id] = (c.bought[id] || 0) + 1;
  if (fresh) c.pnew = true;
  const body = c.body;
  const l = loadout(c, body);
  if (l.cur.length < socketsOf(c, body) && !l.cur.some((x) => PARTS[x].family === PARTS[id].family) && freeCopies(c, id) > 0) l.cur.push(id);
  return true;
}

// What the Workshop sells at chapter `chap` (0-based): Tier I and II from the
// start of their chapter, specials too; Tier III only after the Golden Wheel.
export function inStock(c, id, chap) {
  const p = partById(id);
  if (!p) return false;
  if (p.kind === 'stat' && p.tier === 3) return !!c.champion;
  return chap >= p.from;
}
export const shopList = (c, chap) => PART_LIST.filter((p) => inStock(c, p.id, chap));

export function buy(c, id, chap) {
  const p = partById(id);
  if (!p || !inStock(c, id, chap)) return { ok: false, why: 'Gramps does not have that yet.' };
  if (owned(c, id) >= MAX_PARTS) return { ok: false, why: 'You have plenty of those.' };
  if (c.coins < p.price) return { ok: false, why: 'Not enough coins.' };
  c.coins -= p.price;
  grant(c, id, { paid: true, fresh: false });
  return { ok: true };
}

export function sellValue(c, id) {
  const p = partById(id);
  if (!p) return 0;
  return (c.bought && c.bought[id] > 0) ? p.price : EARNED_SELL;
}
export function sell(c, id) {
  if (!isPart(id) || owned(c, id) < 1) return { ok: false, why: 'You do not own that part.' };
  if (freeCopies(c, id) < 1) return { ok: false, why: 'Take it off the kart first.' };
  const v = sellValue(c, id);
  c.coins += v;
  c.parts[id]--;
  c.sold[id] = Math.min(MAX_SOLD, (c.sold[id] || 0) + 1);
  if (c.bought[id] > 0) c.bought[id]--;
  if (c.parts[id] <= 0) { delete c.parts[id]; delete c.bought[id]; }
  return { ok: true, coins: v };
}

export function chassisCost(c, body) {
  if (c.sockets && c.sockets[body] >= 1) return null;
  return chassisPrice(BODIES[body]);
}
export function buyChassis(c, body) {
  const cost = chassisCost(c, body);
  if (cost === null) return { ok: false, why: 'Already modded.' };
  if (c.coins < cost) return { ok: false, why: 'Not enough coins.' };
  c.coins -= cost;
  ensure(c);
  c.sockets[body] = 1;
  return { ok: true };
}

// ---- keeping saves consistent ----
// After loading or merging: only known parts, never more fitted than owned,
// no more parts than sockets, one per family.
export function normalize(c) {
  ensure(c);
  for (const id of Object.keys(c.parts)) if (!isPart(id) || !(c.parts[id] > 0)) delete c.parts[id];
  for (const id of Object.keys(c.bought)) if (!isPart(id) || !(c.bought[id] > 0)) delete c.bought[id];
  for (const id of Object.keys(c.sold)) if (!isPart(id) || !(c.sold[id] > 0)) delete c.sold[id];
  for (const id of Object.keys(c.bought)) c.bought[id] = Math.min(c.bought[id], owned(c, id));
  for (const b of Object.keys(c.sockets)) if (!BODIES[b] || !(c.sockets[b] > 0)) delete c.sockets[b];
  const used = {};
  for (const b of Object.keys(c.loadouts)) {
    if (!BODIES[b]) { delete c.loadouts[b]; continue; }
    const l = loadout(c, b);
    const cap = socketsOf(c, b);
    l.cur = cleanFit(l.cur, cap).filter((id) => {
      used[id] = (used[id] || 0) + 1;
      return used[id] <= owned(c, id);
    });
    l.pre = l.pre.slice(0, 3).map((p) => cleanFit(p, cap));
    while (l.pre.length < 3) l.pre.push([]);
  }
  return c;
}

// Part-pairs hard to tell apart in text: a short summary of what a loadout does.
export function kitOf(c, body = c.body) {
  return { parts: loadout(c, body).cur.slice() };
}

// ---- old saves ----
// The old upgrade ladder (4 families x 5 levels, per vehicle) becomes parts:
// levels 1-2 give Tier I, 3-4 Tier II, 5 Tier III, one per vehicle and family,
// plus a spare of the best one in the box. They are fitted best first up to
// the vehicle's sockets; the rest wait in the box. Nobody loses value.
export function migrateUpgrades(c, upgrades) {
  ensure(c);
  const tierOf = (lv) => (lv >= 5 ? 3 : lv >= 3 ? 2 : lv >= 1 ? 1 : 0);
  const fams = FAMILY_LIST.map((f) => f.id);
  const best = {};
  for (const [body, up] of Object.entries(upgrades || {})) {
    if (!BODIES[body] || !up || typeof up !== 'object') continue;
    const items = [];
    for (const fam of fams) {
      const t = tierOf(Number(up[fam]) || 0);
      if (!t) continue;
      const id = `${fam}${t}`;
      c.parts[id] = Math.min(MAX_PARTS, owned(c, id) + 1);
      items.push({ id, t, lv: Number(up[fam]) || 0 });
      if (!best[fam] || best[fam].lv < t * 10) best[fam] = { id, lv: t * 10 };
    }
    items.sort((a, b) => b.lv - a.lv);
    const l = loadout(c, body);
    for (const it of items) if (l.cur.length < socketsOf(c, body) && !l.cur.includes(it.id)) l.cur.push(it.id);
  }
  for (const b of Object.values(best)) c.parts[b.id] = Math.min(MAX_PARTS, owned(c, b.id) + 1);
  // Everything migrated was paid for with coins.
  for (const id of Object.keys(c.parts)) c.bought[id] = c.parts[id];
  if (Object.keys(c.parts).length) c.pnew = true;
  return normalize(c);
}
