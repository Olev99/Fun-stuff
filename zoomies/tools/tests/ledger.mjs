// Save ledger and sync merge: a randomized property test plus the review's
// regression scenarios. Pure node (no browser):
//
//   node ledger.mjs [runs=3000] [seed=1]
//
// Simulates 2-4 devices doing random earn, spend, buy, sell, prize spins,
// one-off claims (trophies, first clears and stars, drops, Daily, missions,
// Weekly, level and mastery capsules), JSON round trips, syncs in random
// pairs with lost replies, backups and Merge or Replace restores. Every
// operation gets an id; each device knows the ids its state has seen. After
// every step, each device's coins, capsules, parts, XP and race count must
// equal the truth computed from the operations it knows (so nothing is lost
// and nothing is minted). Reachable states are also checked for
// merge(a,b) = merge(b,a), merge(merge(a,b),c) = merge(a,merge(b,c)) and
// merge(a,a) = a.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const three = pathToFileURL(`${root}/vendor/three.module.min.js`).href;
register(`data:text/javascript,export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(three)},shortCircuit:true};return n(s,c)}`);
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
globalThis.document = { getElementById: () => null };
globalThis.location = { search: '', href: 'http://x/', pathname: '/' };
const src = (f) => import(pathToFileURL(`${root}/src/${f}`).href);
// Devices never change things in the same millisecond: a clock that ticks on every read.
let clock = Date.UTC(2026, 10, 26);
Date.now = () => (clock += 1);

const C = await src('career.js'), S = await src('sync.js'), W = await src('workshop.js'), L = await src('ledger.js');
const P = await src('profile.js'), Co = await src('cosmetics.js'), Pz = await src('prizes.js'), M = await src('mastery.js'), PA = await src('parts.js');

const RUNS = Number(process.argv[2]) || 3000;
let seed = Number(process.argv[3]) || 1;
let fails = 0, checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) { fails++; if (fails <= 25 || !name.startsWith('merge')) console.log(`FAIL ${name} ${info}`); } };
const rng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clone = (x) => JSON.parse(JSON.stringify(x));
// Canonical form for comparing saves: sorted keys; `bought` (the higher count, clamped by the copies owned) left out.
// Lists of ids are sets (merging sorts them), so they compare sorted.
const canon = (c) => { const o = clone(c); delete o.bought; for (const e of Object.values(o.led.d)) delete e.t; const s = (v) => (Array.isArray(v) ? (v.every((x) => typeof x !== 'object') ? [...v].sort() : v.map(s)) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, s(v[k])])) : v); return JSON.stringify(s(o)); };
const VERBOSE = process.env.VERBOSE !== undefined ? Number(process.env.VERBOSE) : -1;
const join = (a, b) => S.mergeCareer(clone(a), clone(b), null);
const diff = (x, y) => { let i = 0; while (i < x.length && x[i] === y[i]) i++; return i >= x.length && i >= y.length ? '' : `@${i}: ${x.slice(Math.max(0, i - 80), i + 60)}  <>  ${y.slice(Math.max(0, i - 80), i + 60)}`; };

const TROPHIES = P.ACHIEVEMENTS.slice(0, 8);
const EVENTS = C.CHAPTERS.slice(0, 2).flatMap((ch) => ch.events);
const DROPS = EVENTS.filter((e) => e.drop);
const SHOP = PA.PART_LIST.filter((p) => !(p.kind === 'stat' && p.tier === 3)).slice(0, 10).map((p) => p.id);

// ---------------- the truth: what a set of known operations is worth ----------------
function truth(ops, known) {
  let net = 0, caps = 0, xp = 0, races = 0;
  const acq = {}, sold = {}, pv = {}, cl = new Map();
  for (const op of ops) {
    if (!known.has(op.id)) continue;
    net += op.coins; caps += op.caps; xp += op.xp; races += op.races;
    for (const [id, d] of Object.entries(op.parts)) { if (d > 0) acq[id] = (acq[id] || 0) + d; else sold[id] = (sold[id] || 0) - d; }
    for (const [id, v] of Object.entries(op.pv)) pv[id] = (pv[id] || 0) + v;
    for (const k of op.claims) if (!k.fromXp) cl.set(k.key, k);
  }
  let rc = 0, rk = 0;
  const rp = {};
  for (const k of cl.values()) { rc += k.coins || 0; rk += k.caps || 0; if (k.part) rp[k.part] = (rp[k.part] || 0) + 1; }
  rk += Math.floor(P.levelOf(xp).level / 5); // level capsules: every 5th level reached (see career.js claims)
  const parts = {};
  let debt = 0;
  for (const id of new Set([...Object.keys(acq), ...Object.keys(sold), ...Object.keys(rp)])) {
    const raw = (acq[id] || 0) + (rp[id] || 0) - (sold[id] || 0);
    if (raw > 0) parts[id] = Math.min(PA.MAX_PARTS, raw);
    else if (raw < 0) debt += -raw * Math.max(PA.EARNED_SELL, Math.ceil((pv[id] || 0) / (sold[id] || 1)));
  }
  return { coins: Math.max(0, net + rc - debt), caps: Math.max(0, caps + rk), parts, xp, races };
}

// ---------------- the simulation ----------------
function simulate(run) {
  const r = rng(run * 7919 + seed);
  const ri = (n) => Math.floor(r() * n);
  const ops = [];
  let opId = 0, day = 1, devSeq = 0;
  const newDev = () => `d${run}x${devSeq++}`;
  const nDev = 2 + ri(3);
  const devs = Array.from({ length: nDev }, () => ({ id: newDev(), c: C.cleanCareer(C.newCareer(), null), known: new Set() }));
  const backups = [];
  const dayStr = () => `2026-${String(1 + Math.floor(day / 28) % 12).padStart(2, '0')}-${String(1 + (day % 28)).padStart(2, '0')}`;
  const weekStr = () => `2026-W${String(1 + Math.floor(day / 7) % 52).padStart(2, '0')}`;

  // Run fn on a device's save, record what it did as an operation, then save (reconcile).
  const act = (d, fn) => {
    const c = d.c;
    const before = { coins: c.coins, caps: c.freeCaps, xp: c.xp, races: c.stats.races || 0, parts: { ...c.parts }, pv: { ...c.soldFor } };
    const claims = fn(c);
    if (!claims) return;
    const cc = claims.reduce((a, k) => a + (k.coins || 0), 0), ck = claims.reduce((a, k) => a + (k.caps || 0), 0);
    const op = { id: opId++, coins: c.coins - before.coins - cc, caps: c.freeCaps - before.caps - ck, xp: c.xp - before.xp, races: (c.stats.races || 0) - before.races, parts: {}, pv: {}, claims };
    for (const id of new Set([...Object.keys(before.parts), ...Object.keys(c.parts)])) {
      const dd = (c.parts[id] || 0) - (before.parts[id] || 0) - claims.filter((k) => k.part === id).length;
      if (dd) op.parts[id] = dd;
    }
    for (const id of Object.keys(c.soldFor)) if ((c.soldFor[id] || 0) > (before.pv[id] || 0)) op.pv[id] = c.soldFor[id] - (before.pv[id] || 0);
    ops.push(op);
    d.known.add(op.id);
    C.reconcile(c, d.id);
  };
  // Level capsules paid by grant: counted from XP in truth(), like career.js claims().
  const lvl = (res) => res.caps.map((L) => ({ key: `lv:${L}`, caps: 1, fromXp: true }));

  const steps = 10 + ri(50);
  for (let s = 0; s < steps; s++) {
    const d = devs[ri(devs.length)];
    const k = ri(20);
    if (r() < 0.1) day++;
    if (run === VERBOSE) console.log(`step ${s} dev ${devs.indexOf(d)} (${d.id}) op ${k} day ${day}`);
    if (k === 0) act(d, (c) => { const n = 1 + ri(400); c.coins += n; c.earned += n; return []; });
    else if (k === 1) act(d, (c) => { const n = 1 + ri(600); if (c.coins < n) return null; c.coins -= n; return []; });
    else if (k === 2) act(d, (c) => (W.buy(c, SHOP[ri(SHOP.length)], 9).ok ? [] : null));
    else if (k === 3) act(d, (c) => { const ids = Object.keys(c.parts); if (!ids.length) return null; W.setFit(c, c.body, []); return W.sell(c, ids[ri(ids.length)]).ok ? [] : null; });
    else if (k === 4) act(d, (c) => { const a = TROPHIES[ri(TROPHIES.length)]; if (c.ach[a.id]) return null; c.ach[a.id] = 1 + ri(1e6); c.coins += a.reward; c.earned += a.reward; return [{ key: `a:${a.id}`, coins: a.reward }]; });
    else if (k === 5) act(d, (c) => {
      // A career result: place coins (ordinary) plus first clear and new stars (claims), like applyResult.
      const ev = EVENTS[ri(EVENTS.length)], cl = [];
      const place = 20 + ri(100);
      c.coins += place;
      if (!c.done[ev.id]) { c.done[ev.id] = true; c.coins += ev.reward; cl.push({ key: `d:${ev.id}`, coins: ev.reward }); }
      const st = 1 + ri(3), prev = c.stars[ev.id] || 0;
      for (let i = prev + 1; i <= st; i++) { c.coins += 40; cl.push({ key: `s:${ev.id}:${i}`, coins: 40 }); }
      c.stars[ev.id] = Math.max(prev, st);
      return cl;
    });
    else if (k === 6) act(d, (c) => { const ev = DROPS[ri(DROPS.length)]; if (c.drops[ev.id] || !W.grant(c, ev.drop)) return null; c.drops[ev.id] = ev.drop; return [{ key: `p:${ev.id}`, part: ev.drop }]; });
    else if (k === 7) act(d, (c) => { const t = dayStr(); if (c.daily.done >= t) return null; c.daily.done = t; c.freeCaps++; return [{ key: `dd:${t}`, caps: 1 }]; });
    else if (k === 8) act(d, (c) => { const t = dayStr(); if (c.missions.last >= t) return null; c.missions.last = t; c.freeCaps++; return [{ key: `md:${t}`, caps: 1 }]; });
    else if (k === 9) act(d, (c) => { const w = weekStr(); if (c.weekly.capGiven.includes(w) || c.weekly.capGiven.some((x) => x > w)) return null; c.weekly.capGiven.push(w); c.freeCaps++; return [{ key: `wk:${w}`, caps: 1 }]; });
    else if (k === 10) act(d, (c) => lvl(P.grant(c, 0, 50 + ri(4000))));
    else if (k === 11) act(d, (c) => { if (c.freeCaps < 1) return null; c.freeCaps--; return []; });
    else if (k === 12) act(d, (c) => (Co.spinGumball(c, r, Pz.rollJackpot) ? [] : null));
    else if (k === 13) act(d, (c) => { c.stats.races = (c.stats.races || 0) + 1; return lvl(P.grant(c, 0, 10 + ri(100))); });
    else if (k === 14) act(d, (c) => {
      const was = c.mastery.capLevels, res = M.addMastery(c, { racer: ['mochi', 'hopper'][ri(2)], body: 'buggy', place: 1 + ri(8), mode: 'race' });
      const out = [];
      for (let L = was + M.CAP_EVERY; L <= c.mastery.capLevels; L += M.CAP_EVERY) out.push({ key: `m:${L}`, caps: 1 });
      return res ? out : null;
    });
    else if (k === 15 || k === 16) {
      // Sync: the guest sends its save, the host merges and keeps it; the reply can be lost.
      const g = devs[ri(devs.length)];
      if (g === d) continue;
      const sent = clone(g.c), sentKnown = new Set(g.known);
      d.c = S.mergeCareer(d.c, sent, d.id);
      for (const x of sentKnown) d.known.add(x);
      if (r() < 0.25) continue; // lost "synced" reply
      g.c = S.mergeCareer(g.c, clone(d.c), g.id);
      for (const x of d.known) g.known.add(x);
    } else if (k === 17) backups.push({ c: clone(C.cleanCareer(clone(d.c), null)), known: new Set(d.known) });
    else if (k === 18 && backups.length) {
      const b = backups[ri(backups.length)];
      if (r() < 0.6) { d.c = S.mergeCareer(d.c, clone(b.c), d.id); for (const x of b.known) d.known.add(x); }
      else { d.id = newDev(); d.c = C.cleanCareer(clone(b.c), null); C.reconcile(d.c, d.id); d.known = new Set(b.known); }
    } else if (k === 19) d.c = C.cleanCareer(JSON.parse(JSON.stringify(d.c)), d.id); // saved and loaded again
    // Every device shows exactly what the operations it knows are worth.
    for (const x of devs) {
      const t = truth(ops, x.known);
      const ok = x.c.coins === t.coins && x.c.freeCaps === t.caps && x.c.xp === t.xp && (x.c.stats.races || 0) === t.races && JSON.stringify(Object.entries(x.c.parts).sort()) === JSON.stringify(Object.entries(t.parts).sort());
      check('device = truth of what it knows', ok, ok ? '' : `run ${run} step ${s} op ${k}: coins ${x.c.coins}/${t.coins} caps ${x.c.freeCaps}/${t.caps} xp ${x.c.xp}/${t.xp} races ${x.c.stats.races}/${t.races} parts ${JSON.stringify(x.c.parts)}/${JSON.stringify(t.parts)}`);
      if (!ok) { if (run === VERBOSE) console.log(JSON.stringify(x.c.led), JSON.stringify(ops.filter((o) => x.known.has(o.id)))); return; }
    }
  }
  // Merge laws on reachable states (devices and backups).
  const pool = [...devs.map((x) => x.c), ...backups.map((b) => b.c)];
  const pickS = () => pool[ri(pool.length)];
  for (let i = 0; i < 3; i++) {
    const a = pickS(), b = pickS(), c = pickS();
    check('merge(a,b) = merge(b,a)', canon(join(a, b)) === canon(join(b, a)), `run ${run}`);
    check('merge(merge(a,b),c) = merge(a,merge(b,c))', canon(join(join(a, b), c)) === canon(join(a, join(b, c))), `run ${run}`);
    check('merge(a,a) = a', canon(join(a, a)) === canon(C.cleanCareer(clone(a), null)), `run ${run} ${diff(canon(join(a, a)), canon(C.cleanCareer(clone(a), null)))}`);
  }
  // Everyone syncs with everyone, no losses: nothing any device still knows is lost.
  const all = new Set(devs.flatMap((x) => [...x.known]));
  for (let i = 1; i < devs.length; i++) devs[0].c = S.mergeCareer(devs[0].c, clone(devs[i].c), devs[0].id);
  for (let i = 1; i < devs.length; i++) devs[i].c = S.mergeCareer(devs[i].c, clone(devs[0].c), devs[i].id);
  const t = truth(ops, all);
  for (const x of devs) check('after a full sync every device holds every known operation', x.c.coins === t.coins && x.c.freeCaps === t.caps && x.c.xp === t.xp, `run ${run}: ${x.c.coins}/${t.coins} ${x.c.freeCaps}/${t.caps}`);
  check('after a full sync all devices are identical', devs.every((x) => canon(x.c) === canon(devs[0].c)), `run ${run} ${devs.map((x) => JSON.stringify([x.c.loadouts, x.c.led.lt, x.c.led.lh]) + diff(canon(x.c), canon(devs[0].c)).slice(0, 300)).join(' | ')}`);
}

const t0 = Date.now();
for (let run = 0; run < RUNS; run++) simulate(run);
console.log(`property: ${RUNS} random runs, ${checks} checks, ${fails} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
const propFails = fails;

// ---------------- the review's scenarios ----------------
const dev = (id, c = C.newCareer()) => ({ id, c: C.cleanCareer(c, null) });
const save = (d) => C.reconcile(d.c, d.id);
const sync = (host, guest, lost = false) => { host.c = S.mergeCareer(host.c, clone(guest.c), host.id); if (!lost) guest.c = S.mergeCareer(guest.c, clone(host.c), guest.id); };

// t1 (R2-1): Merge-restoring your own backup must not refund what you spent since.
{
  const d = dev('A');
  d.c.coins = 5000; d.c.earned = 5000; save(d);
  const backup = clone(d.c);
  W.buy(d.c, 'engine1', 0); d.c.coins -= 600; d.c.racers.push('hopper'); save(d);
  const spent = d.c.coins;
  for (let i = 0; i < 3; i++) d.c = S.mergeCareer(d.c, clone(backup), d.id);
  check('t1 restore Merge of an own backup refunds nothing (3 times)', d.c.coins === spent && d.c.parts.engine1 === 1 && d.c.racers.includes('hopper'), `${d.c.coins} vs ${spent}`);
  // The reviewer's exact script: never-saved save objects, one device.
  const c = C.newCareer(); c.coins = 5000; c.done['c1-0'] = true;
  const bk = JSON.parse(JSON.stringify(c));
  W.buy(c, 'engine1', 0); c.coins -= 600; c.racers.push('hopper');
  const m = S.mergeCareer(c, bk, 'X');
  check('t1 literal: no refund', m.coins === 4220 && m.parts.engine1 === 1, `${m.coins}`);
  // Two devices sell the same synced copy: one sale pays, the other is taken back.
  const A = dev('A'), B = dev('B');
  A.c.coins = 1000; save(A); W.buy(A.c, 'engine1', 0); save(A);
  sync(A, B);
  W.setFit(A.c, A.c.body, []); W.setFit(B.c, B.c.body, []);
  const sa = W.sell(A.c, 'engine1'); save(A);
  const sb = W.sell(B.c, 'engine1'); save(B);
  sync(A, B);
  check('t1 the same copy sold on two devices pays once', sa.ok && sb.ok && A.c.coins === 1000 && !A.c.parts.engine1 && B.c.coins === 1000, `${A.c.coins} ${JSON.stringify(A.c.parts)}`);
  // A dropped copy sold on both, then a second drop of that part: it settles the second sale (seed 1 run 215).
  const D = dev('D'), E = dev('E');
  W.grant(D.c, 'armor1'); D.c.drops['c1-3'] = 'armor1'; save(D);
  sync(D, E);
  for (const x of [D, E]) { W.setFit(x.c, x.c.body, []); W.sell(x.c, 'armor1'); save(x); }
  sync(D, E);
  const owed = E.c.coins;
  W.grant(E.c, 'armor1'); E.c.drops['c2-2'] = 'armor1'; save(E);
  check('t1 a second drop settles a copy sold twice: both sales pay, no part left', E.c.coins === owed + PA.EARNED_SELL && !E.c.parts.armor1, `${E.c.coins}/${owed + PA.EARNED_SELL} ${JSON.stringify(E.c.parts)}`);
}
// t2 (R2-4): three devices, a lost reply, and a tie on what you drive.
{
  const A = dev('A'), B = dev('B'), Cc = dev('C');
  A.c.coins = 1000; A.c.xp = 5000; save(A);
  sync(A, B); sync(B, Cc);
  A.c.coins += 500; save(A); B.c.coins += 300; save(B);
  sync(A, B);
  check('t2 three devices: +500 and +300 on top of 1000 make 1800', A.c.coins === 1800 && B.c.coins === 1800, `${A.c.coins}`);
  sync(Cc, A);
  check('t2 the third device gets 1800 too', Cc.c.coins === 1800, `${Cc.c.coins}`);
  const P1 = dev('P'), Q = dev('Q');
  P1.c.coins = 1000; save(P1); sync(P1, Q);
  sync(P1, Q, true); // the host merged, the reply was lost
  P1.c.coins -= 400; save(P1); Q.c.coins += 200; save(Q);
  sync(P1, Q);
  check('t2 a lost reply never brings spent coins back (1000 - 400 + 200)', P1.c.coins === 800 && Q.c.coins === 800, `${P1.c.coins}`);
  const X = dev('X'), Y = dev('Y');
  X.c.racers.push('hopper'); X.c.racer = 'hopper'; save(X); save(Y);
  check('t2 merge picks the same racer in both orders', S.mergeCareer(X.c, Y.c, null).racer === S.mergeCareer(Y.c, X.c, null).racer);
  check('t2 Balloon Battle wins merge by the higher count', S.mergeRecords({ battle: { pinball: 12 } }, { battle: { pinball: 1 } }).battle.pinball === 12);
}
// t7 (R2-1): spend capsules and coins, Merge-restore the backup, again and again.
{
  const d = dev('A');
  d.c.coins = 6000; d.c.earned = 6000; d.c.freeCaps = 0; save(d);
  for (let i = 0; i < 3; i++) d.c.daily.done = `2026-11-2${i}`, d.c.freeCaps++, save(d);
  const backup = clone(d.c);
  let prizes = 0;
  for (let loop = 1; loop <= 3; loop++) {
    while (d.c.freeCaps > 0 || d.c.coins >= 600) { Co.spinGumball(d.c, rng(loop), Pz.rollJackpot); save(d); }
    const coins = d.c.coins;
    d.c = S.mergeCareer(d.c, clone(backup), d.id);
    if (loop === 1) prizes = Co.ownedCount(d.c);
    check(`t7 loop ${loop}: restoring the backup gives back no capsules or coins`, d.c.freeCaps === 0 && d.c.coins === coins && Co.ownedCount(d.c) === prizes, `${d.c.coins} ${d.c.freeCaps}`);
  }
}
// t8 (R2-5): the same part bought on two devices is two parts for two payments; bought + dropped is two.
{
  const A = dev('A'), B = dev('B');
  A.c.coins = 1000; save(A); sync(A, B);
  W.buy(A.c, 'engine1', 0); save(A); W.buy(B.c, 'engine1', 0); save(B);
  sync(A, B);
  check('t8 bought on both: 2 parts, both paid', A.c.parts.engine1 === 2 && A.c.coins === 640, `${JSON.stringify(A.c.parts)} ${A.c.coins}`);
  const A2 = dev('A2'), B2 = dev('B2');
  A2.c.coins = 1000; save(A2); sync(A2, B2);
  W.buy(A2.c, 'gemVac', 1); save(A2); W.grant(B2.c, 'gemVac'); B2.c.drops['c2-b'] = 'gemVac'; save(B2);
  sync(A2, B2);
  check('t8 bought on one, dropped on the other: 2 parts', A2.c.parts.gemVac === 2 && A2.c.coins === 350, `${JSON.stringify(A2.c.parts)} ${A2.c.coins}`);
  // The same drop earned on both devices is one part.
  const A3 = dev('A3'), B3 = dev('B3');
  for (const x of [A3, B3]) { W.grant(x.c, 'gemVac'); x.c.drops['c2-b'] = 'gemVac'; save(x); }
  sync(A3, B3);
  check('t8 the same drop on both devices is one part', A3.c.parts.gemVac === 1);
}
// t9 (R2-4): a Replace-restore on a second browser, then synced with the original, doubles nothing.
{
  const A = dev('A');
  A.c.coins = 1000; save(A);
  A.c.coins += 2000; save(A);
  const B = { id: 'B2', c: C.cleanCareer(clone(A.c), null) }; save(B); // Replace on another browser (new device id)
  sync(A, B);
  check('t9 a replaced copy synced with its original: 3000, not 5000', A.c.coins === 3000 && B.c.coins === 3000, `${A.c.coins}`);
  B.c.coins += 100; save(B); A.c.coins += 50; save(A); sync(B, A);
  check('t9 and both keep earning on top', A.c.coins === 3150 && B.c.coins === 3150, `${A.c.coins}`);
}
// R2-6: one-off rewards pay once across devices.
{
  const A = dev('A'), B = dev('B');
  for (const x of [A, B]) {
    x.c.stats.races = 1; P.checkAchievements(x.c, {}); // trophy coins
    x.c.daily.done = '2026-11-26'; x.c.freeCaps++; // Daily capsule
    x.c.missions.last = '2026-11-26'; x.c.freeCaps++; // all missions
    x.c.weekly.capGiven.push('2026-W48'); x.c.freeCaps++; // Weekly
    save(x);
  }
  const one = A.c.coins;
  sync(A, B);
  check('R2-6 the same trophy, Daily, missions and Weekly on two devices pay once', A.c.coins === one && A.c.freeCaps === 3 && B.c.freeCaps === 3, `${A.c.coins}/${one} caps ${A.c.freeCaps}`);
}

// ---------------- migration: old saves ----------------
{
  const old = { v: 1, coins: 5000, earned: 9000, xp: 120000, freeCaps: 3, parts: { engine1: 2, gemVac: 1 }, sold: { tyres1: 1 }, drops: { 'c2-b': 'gemVac' }, done: { 'c1-1': true }, stars: { 'c1-1': 2 }, ach: { race1: 5 }, stats: { races: 40, wins: 7, dodgeBest: 4, tracks: ['sprout'] }, lvlPaid: 9, sync: { id: 'ab12cd', at: 1, base: { xp: 1, coins: 1, earned: 1, freeCaps: 0, stats: {} } } };
  const c = C.cleanCareer(clone(old));
  check('migration keeps coins, XP, capsules, parts and stats exactly', c.coins === 5000 && c.xp === 120000 && c.freeCaps === 3 && c.parts.engine1 === 2 && c.parts.gemVac === 1 && c.stats.races === 40 && c.stats.wins === 7 && c.stats.dodgeBest === 4 && c.stats.tracks.join() === 'sprout', JSON.stringify([c.coins, c.xp, c.freeCaps, c.parts, c.stats]));
  check('migration: one legacy entry named after the old sync id, the old sync fields are gone', Object.keys(c.led.d).join() === 'Lab12cd' && !('sync' in c), Object.keys(c.led.d).join());
  // On this device, the migrated save keeps going; an old backup of it is Merge-restored (twice): nothing comes back.
  const d = { id: 'me', c };
  W.buy(d.c, 'tyres1', 0); d.c.coins -= 1000; d.c.freeCaps -= 2; save(d);
  const after = { coins: d.c.coins, caps: d.c.freeCaps };
  for (let i = 0; i < 2; i++) d.c = S.mergeCareer(d.c, clone(old), d.id);
  check('migration: merging the old backup into the migrated save adds nothing', d.c.coins === after.coins && d.c.freeCaps === after.caps && d.c.parts.tyres1 === 1, `${d.c.coins}/${after.coins} ${d.c.freeCaps}/${after.caps}`);
  // An older backup of the same old save (less XP, more coins) never wins.
  const older = { ...clone(old), coins: 9000, xp: 100000, freeCaps: 5 };
  const m = S.mergeCareer(clone(old), older, 'me');
  check('migration: of two copies of one old save the more played one counts', m.coins === 5000 && m.freeCaps === 3, `${m.coins} ${m.freeCaps}`);
  // A never-synced old save merged with a different never-synced one: the higher one (as before).
  const m2 = S.mergeCareer({ v: 1, coins: 300, xp: 10 }, { v: 1, coins: 700, xp: 20 }, null);
  check('migration: two never-synced old saves take the more played one', m2.coins === 700, `${m2.coins}`);
  // A new device joining a migrated one: the old totals once, plus the new device's own.
  const N = dev('N'); N.c.coins = 100; save(N);
  const O = { id: 'O', c: C.cleanCareer(clone(old), 'O') };
  sync(O, N);
  check('migration: a new device syncing with a migrated one adds up', O.c.coins === 5100 && N.c.coins === 5100, `${O.c.coins}`);
}

// ---------------- hostile input and bounds ----------------
{
  const h = C.cleanCareer({ ...C.newCareer(), coins: 1e12, freeCaps: 1e9, xp: 1e15, parts: { engine1: 20 }, stats: { races: 1e9 } }, null);
  check('hostile: visible numbers without a ledger entry count for nothing', h.coins === 0 && h.freeCaps === 0 && h.xp === 0 && !h.parts.engine1 && !h.stats.races, JSON.stringify([h.coins, h.freeCaps, h.xp, h.parts]));
  const big = { v: 1, d: {}, gone: [], cl: { dd: 'f'.repeat(100000) } };
  for (let i = 0; i < 500; i++) big.d[`x${i}`] = { e: 1e12, s: -5, st: Object.fromEntries(Array.from({ length: 300 }, (_, j) => [`k${j}`, 1e12])), pa: { engine1: 1e12, ['__proto__']: 1, ['x'.repeat(80)]: 1 } };
  big.d['bad id!'] = { e: 5 };
  const L0 = L.cleanLedger(big);
  check('hostile: at most MAX_DEV entries plus the fold, counters and maps bounded', Object.keys(L0.d).length <= L.MAX_DEV + 1 && Object.values(L0.d).every((e) => (e.e || 0) <= 1e9 * 100 && Object.keys(e.st || {}).length <= 64) && !L0.d['bad id!'] && L0.cl.dd.length <= 1024 && L0.gone.length <= L.MAX_GONE, `${Object.keys(L0.d).length}`);
  const many = { v: 1, d: {} };
  for (let i = 0; i < 40; i++) many.d[`dev${i}`] = { t: 1000 + i, e: 100 + i, s: i, ke: 2, st: { races: i }, pa: { engine1: 1 } };
  const before = L.totals(L.cleanLedger({ v: 1, d: Object.fromEntries(Object.entries(many.d).slice(0, 20)) })).e + L.totals(L.cleanLedger({ v: 1, d: Object.fromEntries(Object.entries(many.d).slice(20)) })).e;
  const folded = L.cleanLedger(many), tf = L.totals(folded);
  check('compaction: 40 devices fold to MAX_DEV plus one, the oldest first, sums unchanged', Object.keys(folded.d).length === L.MAX_DEV + 1 && !folded.d.dev0 && !!folded.d.dev39 && tf.e === before && tf.s === 780 && tf.ke === 80 && tf.st.races === 780 && tf.pa.engine1 === 40, JSON.stringify([Object.keys(folded.d).length, tf.e, before]));
  // A folded device that comes back is ignored, never counted twice.
  const back = L.cleanLedger({ v: 1, d: { [L0.gone[0]]: { e: 1e9 } } });
  check('hostile: a folded device coming back adds nothing', L.totals(L.joinLedger(L0, back)).e === L.totals(L0).e);
  const lots = C.cleanCareer({ ...C.newCareer(), lvlPaid: 10000, mastery: { r: {}, b: {}, capLevels: 1000 } }, null);
  check('hostile: level and mastery capsule markers count only as far as XP backs them', lots.freeCaps === 0, `${lots.freeCaps}`);
  // Unknown future parts and fields are kept (bounded), not shown.
  const fut = C.cleanCareer({ ...C.newCareer(), futureThing: { a: 1, b: [1, 2] }, huge: { x: 'y'.repeat(5000) }, led: { v: 1, d: { A: { pa: { warpDrive9: 2, engine1: 1 } } } } }, null);
  check('version skew: unknown parts stay in the ledger, unknown small fields are kept', fut.led.d.A.pa.warpDrive9 === 2 && !fut.parts.warpDrive9 && fut.parts.engine1 === 1 && fut.futureThing.b.length === 2 && !('huge' in fut));
  const fm = S.mergeCareer(fut, C.newCareer(), 'Z');
  check('version skew: merging keeps them', fm.led.d.A.pa.warpDrive9 === 2 && fm.futureThing.a === 1);
}

// ---------------- ghosts ----------------
{
  check('ghost keys: real tracks and their reverse only', S.GHOST_KEY.test('sprout') && S.GHOST_KEY.test('sprout-r') && !S.GHOST_KEY.test('zzz') && !S.GHOST_KEY.test('__proto__') && !S.GHOST_KEY.test('sprout-x'));
  const G = await src('ghost.js');
  const g = (time, n = 40) => JSON.stringify({ time, splits: [], char: 'mochi', body: 'buggy', data: G.toB64(new Int16Array(n * 4)) });
  check('ghost: unknown key refused', S.writeGhost('nope', g(50)) === false && !localStorage.getItem('zoomies.ghost.v1.nope'));
  check('ghost: known key written, slower one refused', S.writeGhost('sprout', g(50)) === true && S.writeGhost('sprout', g(60)) === false);
  check('ghost: oversize ghost refused', S.writeGhost('coral', g(50, 40000)) === false);
  // Storage full: the oldest ghost makes room for the career.
  for (const k of Object.keys(mem)) delete mem[k];
  const quota = 19700;
  globalThis.localStorage.setItem = (k, v) => { const used = Object.entries(mem).reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0); if (used + String(v).length > quota) throw new Error('QuotaExceeded'); mem[k] = String(v); };
  mem['zoomies.ghost.v1.coral'] = JSON.stringify({ at: 1, data: 'x'.repeat(9600) });
  mem['zoomies.ghost.v1.moon'] = JSON.stringify({ at: 2, data: 'x'.repeat(9600) });
  const ok = C.saveCareer(C.newCareer());
  check('storage full: the oldest ghost is deleted first and the save succeeds', ok === true && !mem['zoomies.ghost.v1.coral'] && !!mem['zoomies.ghost.v1.moon']);
  globalThis.localStorage.setItem = () => { throw new Error('blocked'); };
  check('storage blocked: saveCareer reports failure', C.saveCareer(C.newCareer()) === false);
}

console.log(`scenarios: ${fails - propFails} failed`);
console.log(`errors ${fails}`);
process.exit(fails ? 1 : 0);
