// Economy and rules checks from the November 2026 review (Batch A). Node logic first, then a few
// checks in the real app. Needs the static server run.mjs starts (ZPORT overrides port 8000).
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { CHROME_PATH } from './chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
register(`data:text/javascript,export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(pathToFileURL(root + '/vendor/three.module.min.js').href)},shortCircuit:true};return n(s,c)}`);
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
globalThis.document = { getElementById() { return null; } };
globalThis.location = { search: '', href: 'http://x/', pathname: '/' };
globalThis.window = globalThis;
const src = (f) => import(pathToFileURL(resolve(root, 'src', f)).href);

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const Co = await src('cosmetics.js'), Pz = await src('prizes.js'), C = await src('career.js'), P = await src('profile.js');
const M = await src('missions.js'), W = await src('weekly.js'), L = await src('league.js'), Med = await src('medals.js');

// ---- R2-7: free capsules never mint coins ----
{
  const c = C.newCareer();
  c.coins = 0;
  let n = 0;
  for (let i = 0; i < 3000; i++) { c.freeCaps = 1; if (Co.spinGumball(c, Math.random, Pz.rollJackpot)) n++; }
  check('free capsules: 3000 turns, coins stay 0', c.coins === 0 && n === 3000, `coins ${c.coins}`);
  // The coin jackpot roll on a free turn becomes a part, never coins.
  const d = C.newCareer(); d.freeCaps = 1;
  const r = Co.spinGumball(d, () => 0.06, Pz.rollJackpot); // 0.06 lands in the coin band (0.03 + 0.025 + 0.015)
  check('free capsule: coin jackpot rerolled', !(r.item && r.item.prize === 'coins') && d.coins === 0, JSON.stringify(r.item && r.item.prize));
  const e = C.newCareer(); e.coins = 600;
  const r2 = Co.spinGumball(e, () => 0.06, Pz.rollJackpot);
  check('paid capsule: coin jackpot unchanged', r2.item.prize === 'coins' && e.coins === Pz.JACKPOT_COINS, `coins ${e.coins}`);
  // Paid duplicates still refund.
  const f = C.newCareer(); f.coins = 1e6;
  let refunds = 0;
  for (let i = 0; i < 600; i++) { const x = Co.spinGumball(f, Math.random, null); if (x.dup) refunds += x.refund; }
  check('paid duplicates still refund', refunds > 0);
}

// ---- R2-10: pity and "always prefer new" ----
{
  const c = C.newCareer(); c.coins = 1e9;
  c.pity = Co.PITY_SPINS;
  const r = Co.spinGumball(c, () => 0.999, null); // would roll the top rarity band anyway; use a low roll instead below
  const d = C.newCareer(); d.coins = 1e9; d.pity = Co.PITY_SPINS;
  const q = Co.spinGumball(d, () => 0.01, null); // 0.01 = common
  check('pity: 40 paid spins force a new legendary', q.item.rarity === 'legendary' && !q.dup && d.pity === 0, `${q.item.rarity} pity ${d.pity}`);
  check('legendary weight is 4', Co.RARITY.legendary.weight === 4);
  // Within a tier a new item always wins over a duplicate: own all but one common, 200 spins at the common roll.
  const e = C.newCareer(); e.coins = 1e9;
  const commons = Co.HATS.concat(Co.TRAILS, Co.HORNS).filter((it) => it.rarity === 'common' && !Co.owns(e, it.id));
  const keep = commons.pop();
  e.cos = commons.map((it) => it.id);
  const s = Co.spinGumball(e, () => 0.01, null);
  check('new item preferred inside the tier', s.item.id === keep.id && !s.dup);
  // The counter survives cleanCareer and is bounded.
  check('pity validated', C.cleanCareer({ ...C.newCareer(), pity: 1e9 }).pity === 100 && C.cleanCareer({ ...C.newCareer(), pity: 'x' }).pity === 0);
  // Spins to Completionist stay sane.
  const runs = 200, arr = [];
  for (let k = 0; k < runs; k++) { const z = C.newCareer(); z.coins = 1e9; let n = 0; while (Co.ownedCount(z) < Co.COSMETIC_TOTAL && n < 5000) { Co.spinGumball(z, Math.random, Pz.rollJackpot); n++; } arr.push(n); }
  arr.sort((a, b) => a - b);
  console.log('info completionist spins (paid, 200 runs): median', arr[runs / 2], 'p90', arr[Math.floor(runs * 0.9)]);
  check('completionist median below 226 (was)', arr[runs / 2] < 226);
}

// ---- R2-9: League out-earns chapter 7 ----
check('League season multipliers 2.6/2.9/3.2', L.LEAGUE.map((s) => s.mult).join() === '2.6,2.9,3.2');

// ---- R2-12: dates ----
{
  const c = C.newCareer();
  c.dayMax = '2099-01-01'; // the device date is earlier than the highest day seen
  const info = { mode: 'quick', place: 1, gems: 0, style: 0, styleCounts: { OVERTAKE: 20 } };
  const s = P.awardRace(c, { ...info, place: 1 });
  check('clock back: missions pay nothing', s.mis.xp === 0 && s.mis.gained.length === 0 && c.freeCaps === 0);
  check('clock back: daily pays nothing', P.completeDaily(c) === null && c.freeCaps === 0 && c.daily.streak === 0);
  c.weekly.best = 3;
  const w = W.weeklyFinish(c, 1);
  check('clock back: weekly pays nothing and keeps best', w.xp === 0 && !w.trophy && !w.capsule && c.weekly.best === 3 && c.freeCaps === 0);
  check('clock back: daily card shows done', P.dailyDoneToday(c));
  const t = C.newCareer(); // normal day moves dayMax forward
  P.awardRace(t, info);
  check('normal day: dayMax set to today', t.dayMax === P.today());
  check('dayMax validated', C.cleanCareer({ ...C.newCareer(), dayMax: '<b>' }).dayMax === '' && C.cleanCareer({ ...C.newCareer(), dayMax: '2026-11-26' }).dayMax === '2026-11-26');
  // A Daily started yesterday fills yesterday's slot, not today's.
  const d = C.newCareer();
  const y = M.dayBefore(P.today());
  const r = P.completeDaily(d, y);
  check('daily completes its own started day', r && d.daily.done === y && d.daily.streak === 1);
  const r2 = P.completeDaily(d);
  check('today still open after yesterday finished late', r2 && d.daily.done === P.today() && d.daily.streak === 2);
  const Sy = await src('sync.js');
  check('sync keeps the later dayMax', Sy.mergeCareer({ ...C.newCareer(), dayMax: '2026-11-20' }, { ...C.newCareer(), dayMax: '2026-11-25' }).dayMax === '2026-11-25');
}

// ---- R2-13: paint in the online look ----
{
  const l = Co.cleanLook({ hat: 'nohat', paint: 'cherry' });
  check('look carries a known paint', l.paint === 'cherry' && Co.lookPaint(l) === '#e8203a');
  check('hostile paint becomes none', ['__proto__', '<img>', 5, null, 'nope'].every((v) => Co.cleanLook({ paint: v }).paint === 'stock' && Co.lookPaint(Co.cleanLook({ paint: v })) === null));
  const c = C.newCareer(); c.paint = 'lg_teal';
  check('lookOf has the paint', Co.lookOf(c).paint === 'lg_teal');
}

// ---- R2-3: every time target is reachable (>= the stock Hard-AI time at its class) ----
{
  const stock = JSON.parse(readFileSync(resolve(here, 'stock-times.json'), 'utf8'));
  let bad = 0;
  for (const [list, name] of [[C.CHAPTERS, 'story'], [L.LEAGUE, 'league']]) {
    for (const ch of list) for (const ev of ch.events) {
      if (ev.type !== 'time') continue;
      const cls = ev.cls || ch.cls;
      const ref = name === 'league' ? Med.medalTimes(ev.track)[2] : stock[`${ev.track}:${cls}`];
      const ok = ref && ev.target >= ref - 0.01;
      if (!ok) bad++;
      check(`time target ${ev.id} ${ev.track} ${cls}`, ok, `target ${ev.target} vs Hard AI ${ref}`);
      // 3-star thresholds stay at or above the Hard-AI time too.
      const tm = ev.tm || [0.96, 0.92];
      if (name === 'story') check(`  ${ev.id} 3-star within reach`, ev.target * tm[1] >= ref * 0.97, `${(ev.target * tm[1]).toFixed(1)}`);
    }
  }
}

// ---- the real app ----
const b = await chromium.launch({ executablePath: CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true })).newPage();
p.setDefaultTimeout(60000);
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${process.env.ZPORT || 8000}/index.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
await p.waitForTimeout(1000);

// R1-1: a free Time Trial is always Zoom; a career time event keeps its class.
const tt = await p.evaluate(() => {
  const app = window.zoomies;
  app.startRace({ mode: 'tt', trackId: 'sprout', reverse: false, player: 'mochi', speedClass: 'turbo', playerLoadout: { body: 'classic' } });
  const a = app.race.speedClass.id;
  app.startRace({ mode: 'tt', trackId: 'sprout', reverse: false, player: 'mochi', speedClass: 'turbo', playerLoadout: { body: 'classic' }, careerEv: { id: 'x' } });
  const b2 = app.race.speedClass.id;
  app.startChallenge && (app.challenge = { trackId: 'sprout', reverse: false, speedClass: 'chill', ghost: null }, app.startChallenge());
  return { free: a, career: b2, link: app.race.speedClass.id };
});
check('Time Trial is always Zoom', tt.free === 'zoom' && tt.link === 'zoom' && tt.career === 'turbo', JSON.stringify(tt));
await p.evaluate(() => window.zoomies.ui.trackSelect && (window.zoomies.ui.mode = 'tt', window.zoomies.ui.trackSelect()));
check('Time Trial screen explains the Zoom class', (await p.evaluate(() => document.getElementById('ws-line').textContent)).includes('Zoom speed'));

// R2-8: Ember's League grid has one of each racer.
const grid = await p.evaluate(() => {
  const app = window.zoomies;
  const must = ['pip', 'hopper', 'zorp', 'pip', 'volt']; // rival (alt) + the season's returning field, as for Ember
  const out = [];
  for (let i = 0; i < 40; i++) { const g = app.makeGrid('ember', null, must); out.push({ n: g.length, uniq: new Set(g).size, has: ['pip', 'hopper', 'zorp', 'volt'].every((id) => g.includes(id)) }); }
  return out;
});
check('League grid: 8 unique racers, all returning racers in', grid.every((g) => g.n === 8 && g.uniq === 8 && g.has));

// R2-13: paint in menuLoadout.
const paint = await p.evaluate(() => {
  const app = window.zoomies;
  app.career.paint = 'cherry';
  return app.menuLoadout().paint + ' ' + app.menuLoadout(true).paint;
});
check('menuLoadout carries the paint', paint === '#e8203a #e8203a', paint);

// R3-1: a Grand Prix final pays XP and no coins.
const gp = await p.evaluate(async () => {
  const app = window.zoomies;
  const c = app.career;
  const { ACHIEVEMENTS } = await import('./src/profile.js');
  for (const a of ACHIEVEMENTS) c.ach[a.id] = true; // trophy rewards are one-off coins; leave them out
  const coins = c.coins, xp = c.xp;
  const field = app.makeGrid('mochi', null, []);
  app.gp = { cup: { id: 'test-cup', name: 'Test Cup' }, field, points: Object.fromEntries(field.map((id, i) => [id, id === 'mochi' ? 99 : i])), player: 'mochi', tracks: [], index: 0 };
  app.showGPFinal(true);
  return { dCoins: c.coins - coins, dXp: c.xp - xp, text: document.body.innerText.includes('Cup bonus') };
});
check('Grand Prix pays XP only', gp.dCoins === 0 && gp.dXp > 0 && !gp.text, JSON.stringify(gp));

await b.close();
console.log(`errors ${fails}`);
process.exit(fails ? 1 : 0);
