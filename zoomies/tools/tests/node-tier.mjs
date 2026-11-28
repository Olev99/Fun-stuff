// Pure-logic checks in node, no browser (a few seconds):
//
//   node node-tier.mjs
//
// Every track (both ways) and arena builds from its data; event schedules are
// the same for the same seed and keep the spacing rules of events.js
// `schedule`; a Career save survives cleanCareer -> JSON -> cleanCareer
// unchanged; the online race setup checks (validStart, cleanEvCfg) refuse
// bad input. Prints FAIL lines and "errors N" (run.mjs fails on N > 0).
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Same preamble as ledger.mjs: resolve 'three' to the vendored copy, fake the browser bits the modules touch.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const three = pathToFileURL(`${root}/vendor/three.module.min.js`).href;
register(`data:text/javascript,export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(three)},shortCircuit:true};return n(s,c)}`);
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: (i) => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = { getElementById: () => null };
globalThis.location = { search: '', href: 'http://x/', pathname: '/' };
const src = (f) => import(pathToFileURL(`${root}/src/${f}`).href);

const t0 = Date.now();
let fails = 0, checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) { fails++; if (fails <= 40) console.log(`FAIL ${name} ${info}`); } };

const { Track } = await src('track.js');
const { TRACKS } = await src('tracks.js');
const { ARENAS } = await src('arenas.js');
const E = await src('events.js');
const C = await src('career.js');
const N = await src('net.js');

// ---- tracks and arenas build from data ----
let built = 0;
for (const d of [...TRACKS, ...ARENAS]) for (const rev of d.arena ? [false] : [false, true]) {
  let t = null, err = '';
  try { t = new Track(d, rev); } catch (e) { err = e.message; }
  check(`track ${d.id}${rev ? '-r' : ''} builds`, t && t.length > 100 && Number.isFinite(t.length), err || `length ${t && t.length}`);
  if (t) built++;
}
console.log(`tracks: ${built} layouts built`);

// ---- event schedules ----
let races = 0, evs = 0;
for (const d of [...TRACKS, ...ARENAS]) {
  const ids = d.events || [];
  check(`${d.id} events known`, ids.every((id) => E.EVENTS[id]), ids.join(','));
  for (const mode of ['normal', 'wild']) for (const raceT of [90, 180, 300]) for (let seed = 1; seed <= 25; seed++) {
    const a = E.schedule(seed * 7919, mode, ids, raceT), b = E.schedule(seed * 7919, mode, ids, raceT);
    const tag = `${d.id} ${mode} T${raceT} seed ${seed * 7919}`;
    races++; evs += a.length;
    check(`schedule deterministic ${tag}`, JSON.stringify(a) === JSON.stringify(b));
    check(`schedule at most 12 ${tag}`, a.length <= 12, a.length);
    a.forEach((e, i) => {
      const def = E.EVENTS[e.id], p = a[i - 1];
      check(`first warning after ${E.EV_FIRST}s ${tag}`, e.warnAt >= E.EV_FIRST, e.warnAt);
      check(`warn and dur match ${tag} ${e.id}`, Math.abs(e.at - e.warnAt - def.warn) < 0.01 && Math.abs(e.end - e.at - def.dur) < 0.01, JSON.stringify(e));
      check(`ends before the last 8% ${tag}`, e.end <= raceT * E.EV_LAST + 1e-6, `${e.end} > ${raceT * E.EV_LAST}`);
      check(`seed in range ${tag}`, Number.isInteger(e.seed) && e.seed >= 0 && e.seed <= E.EV_SEED_MAX, e.seed);
      if (p) {
        check(`gap of ${E.EV_GAP}s ${tag}`, e.warnAt - p.end >= E.EV_GAP - 0.01, `${p.end} -> ${e.warnAt}`);
        if (ids.length > 1) check(`no repeat in a row ${tag}`, e.id !== p.id, e.id);
      }
    });
  }
  check(`${d.id} off mode has no events`, E.schedule(5, 'off', ids, 300).length === 0);
}
console.log(`events: ${races} schedules, ${evs} events checked`);

// ---- cleanCareer round trip ----
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));
const c1 = C.cleanCareer(C.newCareer());
check('cleanCareer of a new save', !!c1);
const c2 = C.cleanCareer(JSON.parse(JSON.stringify(c1)));
check('cleanCareer round trip is stable', canon(c1) === canon(c2));
check('cleanCareer twice is stable', canon(c2) === canon(C.cleanCareer(JSON.parse(JSON.stringify(c2)))));
for (const bad of [null, 5, 'x', [], undefined]) check(`cleanCareer refuses ${JSON.stringify(bad)}`, C.cleanCareer(bad) === null);
const hostile = C.cleanCareer({ coins: -50, xp: 'lots', racers: 'mochi', __proto__x: 1, pity: 1e9 });
check('cleanCareer clamps a hostile save', hostile && hostile.coins === 0 && hostile.xp === 0 && Array.isArray(hostile.racers) && hostile.pity <= 100, canon(hostile));

// ---- online setup checks ----
check('cleanEvCfg keeps a good setup', canon(E.cleanEvCfg(42, 'wild')) === canon({ evSeed: 42, evMode: 'wild' }));
for (const [s, m] of [[-1, 'normal'], [1.5, 'normal'], [E.EV_SEED_MAX + 1, 'normal'], ['7', 'normal'], [7, 'chaos'], [7, undefined], [NaN, 'wild']]) {
  check(`cleanEvCfg refuses ${s} ${m}`, canon(E.cleanEvCfg(s, m)) === canon({ evSeed: 0, evMode: 'off' }));
}
const good = () => ({ grid: [{}, {}, {}], humans: [{ id: 'a', slot: 0 }, { id: 'b', slot: 2 }], evSeed: 9, evMode: 'normal' });
check('validStart takes a good setup', N.validStart(good()));
const g2 = Object.assign(good(), { evSeed: -3 });
check('validStart turns bad events off', N.validStart(g2) && g2.evMode === 'off' && g2.evSeed === 0);
for (const [name, mut] of [
  ['not an object', () => null], ['an array', () => []], ['no grid', (c) => { delete c.grid; return c; }],
  ['grid too long', (c) => { c.grid = Array(17).fill({}); return c; }], ['too many humans', (c) => { c.humans = Array(5).fill({ id: 'x', slot: 0 }); return c; }],
  ['slot out of grid', (c) => { c.humans[0].slot = 3; return c; }], ['negative slot', (c) => { c.humans[0].slot = -1; return c; }],
  ['fractional slot', (c) => { c.humans[0].slot = 0.5; return c; }], ['id not a string', (c) => { c.humans[0].id = 7; return c; }],
]) check(`validStart refuses ${name}`, N.validStart(mut(good())) === false);

console.log(`node tier: ${checks} checks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('errors', fails);
process.exit(fails ? 1 : 0);
