import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: +(process.env.W || 852), height: +(process.env.H || 393) }, isMobile: true, hasTouch: true });
let p = await ctx.newPage();
const errs = [];
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const watch = (pg) => {
  pg.setDefaultTimeout(60000);
  pg.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 600)); });
  pg.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) console.log('[console]', m.text().slice(0, 300)); });
};
watch(p);
const KEY = 'zoomies-career-v1';
// Each boot gets a fresh page (the software GL renderer is slow to tear down).
const boot = async (save) => {
  await p.close();
  p = await ctx.newPage();
  watch(p);
  await p.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.evaluate(([k, s]) => { localStorage.removeItem(k); if (s) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, save || null]);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
};

// ---------------- 1. old save migration ----------------
// A save from before parts: 4 upgrade levels per kart. Nothing may be lost.
const legacy = {
  v: 1, coins: 777, racer: 'mochi', racers: ['mochi'], body: 'classic', bodies: ['buggy', 'classic'],
  upgrades: { buggy: { engine: 3, turbo: 1, tyres: 0, armor: 5 }, classic: { engine: 5, turbo: 2, tyres: 4, armor: 0 } },
  paint: 'stock', paints: ['stock'], stars: { 'c1-1': 2 }, done: { 'c1-1': true }, seen: { 'c1-intro': true }, beaten: [], xp: 500,
};
await boot(legacy);
const mig = await p.evaluate(() => {
  const c = window.zoomies.career;
  return { pv: c.pv, up: c.upgrades, parts: c.parts, bodyLoad: c.loadouts, coins: c.coins, d0: c.done['c1-0'], pnew: c.pnew };
});
console.log('migrated', JSON.stringify(mig));
check('migration: new format written', mig.pv === 2 && Object.keys(mig.up).length === 0);
check('migration: coins untouched', mig.coins === 777);
// Rust Bucket (2 sockets): best first = armour III, engine II; classic (3 sockets): engine III, tyres II, turbo I.
check('migration: bucket fitted best first', JSON.stringify(mig.bodyLoad.buggy.cur) === JSON.stringify(['armor3', 'engine2']), JSON.stringify(mig.bodyLoad.buggy.cur));
check('migration: classic fitted best first', JSON.stringify(mig.bodyLoad.classic.cur) === JSON.stringify(['engine3', 'tyres2', 'turbo1']), JSON.stringify(mig.bodyLoad.classic.cur));
check('migration: leftovers go to the box', mig.parts.turbo1 >= 2 && mig.parts.armor3 >= 1 && mig.parts.engine3 >= 2, JSON.stringify(mig.parts));
check('migration: prologue not nagging', mig.d0 === true);
// saving writes the new format and a reload keeps it
await p.evaluate(() => window.zoomies.openCareer());
await p.waitForTimeout(500);
const saved = await p.evaluate((k) => { window.zoomies.careerUI.endStory(); return JSON.parse(localStorage.getItem(k)); }, KEY);
check('migration: saved in the new format', saved.pv === 2 && saved.parts && saved.loadouts && (!saved.upgrades || Object.keys(saved.upgrades).length === 0));

// ---------------- 2. fresh career: story, hub ----------------
await boot(null);
await p.screenshot({ path: 'car/0-title.png' });
await p.tap('[data-go="career"]');
await p.waitForTimeout(1500);
await p.screenshot({ path: 'car/1-story.png' });
console.log('screen', await p.evaluate(() => window.zoomies.ui.current));
check('story opens with the prologue', await p.evaluate(() => window.zoomies.ui.current === 'story' && document.getElementById('story-title').textContent === 'Prologue'));
let n = 0;
while (n++ < 30 && await p.evaluate(() => window.zoomies.ui.current === 'story')) {
  if (n === 6) await p.screenshot({ path: 'car/1b-story-baron.png' });
  await p.tap('#scr-story .story-box'); await p.waitForTimeout(250);
}
const names = await p.evaluate(() => Object.keys(window.zoomies.career.seen));
check('story: prologue and intro seen', names.includes('c1-prologue') && names.includes('c1-intro'), names.join());
console.log('screen after story', await p.evaluate(() => window.zoomies.ui.current));
await p.waitForTimeout(1200);
await p.screenshot({ path: 'car/2-hub.png' });
const hub = await p.evaluate(() => ({ evs: [...document.querySelectorAll('#ev-list [data-ev]')].map((e) => e.dataset.ev), sel: document.querySelector('#ev-list .ev.sel .gtip')?.textContent || '' }));
check('hub: prologue event first, with a Gramps tip', hub.evs[0] === 'c1-0' && hub.sel.includes('Gramps says'), hub.evs.join());
// event hints for a track with traits
await p.tap('#ev-list [data-ev="c1-4"]');
await p.waitForTimeout(900);
await p.screenshot({ path: 'car/3-hub-sel.png' });

// ---------------- 3. the prologue race: easy, one lap, drops a part ----------------
await p.tap('#ev-list [data-ev="c1-0"]');
await p.tap('#car-go');
await p.waitForTimeout(2500);
await p.screenshot({ path: 'car/3b-prologue-race.png' });
const pro = await p.evaluate(async () => {
  const app = window.zoomies; const race = app.race;
  const { AIDriver } = await import('./src/ai.js');
  race.player.ai = new AIDriver(race.player, race, 0.9, race.diff);
  app.paused = true;
  let n = 0; while (!race.results && n++ < 60 * 300) race.update(1 / 60);
  app.paused = false;
  return { laps: race.laps, diff: race.diff.id, body: race.player.bodyDef.id, place: race.results && race.results.find((r) => r.isPlayer).place };
});
console.log('prologue', JSON.stringify(pro));
check('prologue: one lap on easy', pro.laps === 1 && pro.diff === 'easy');
await p.waitForTimeout(1500);
if (await p.isVisible('#podium-ui')) { await p.tap('#podium-ui'); await p.waitForTimeout(700); }
await p.screenshot({ path: 'car/3c-prologue-results.png' });
const pr = await p.evaluate(() => { const c = window.zoomies.career; return { done: c.done['c1-0'], parts: c.parts, drops: c.drops, fit: c.loadouts.buggy && c.loadouts.buggy.cur, pnew: c.pnew, coins: c.coins }; });
console.log('after prologue', JSON.stringify(pr));
check('prologue: cleared and first part dropped and fitted', pr.done && pr.parts.engine1 === 1 && pr.drops['c1-0'] === 'engine1' && pr.fit.includes('engine1') && pr.pnew);
check('results show the drop', await p.evaluate(() => document.getElementById('res-body').textContent.includes('New part: Engine I')));
await p.tap('#res-buttons [data-go="career"]');
await p.waitForTimeout(1500);
const sc = await p.evaluate(() => ({ ui: window.zoomies.ui.current, line: document.getElementById('story-text').textContent }));
check('prologue: Gramps scene plays after the first clear', sc.ui === 'story' && sc.line.includes('shopping trolley'), sc.line);
while (await p.evaluate(() => window.zoomies.ui.current === 'story')) { await p.tap('#scr-story .story-box'); await p.waitForTimeout(250); }
await p.waitForTimeout(800);
check('hub: NEW PART badge', await p.isVisible('#car-ws-badge'));
await p.screenshot({ path: 'car/3d-hub-badge.png' });

// ---------------- 4. Workshop: buy, fit, sockets, swap, chassis, sell ----------------
await p.evaluate(() => { window.zoomies.career.coins = 3000; });
await p.tap('#scr-career [data-go="workshop"]');
await p.waitForTimeout(1500);
check('workshop opens, badge cleared', await p.evaluate(() => window.zoomies.ui.current === 'workshop' && !window.zoomies.career.pnew));
await p.screenshot({ path: 'car/4-workshop-parts.png' });
const stat = () => p.evaluate(async () => { const { playerStats } = await import('./src/career.js'); const s = playerStats(window.zoomies.career); return { speed: s.speed, accel: s.accel, handling: s.handling, weight: s.weight, grip: s.grip, soft: s.soft }; });
const cur = () => p.evaluate(() => { const c = window.zoomies.career; return { cur: c.loadouts.buggy.cur.slice(), coins: c.coins, parts: { ...c.parts }, sockets: c.sockets.buggy || 0 }; });
const s0 = await stat();
// buy Tyres I in the shop with real taps
await p.tap('#ws-tabs [data-tab="shop"]');
await p.tap('#ws-list [data-pid="tyres1"]');
await p.waitForTimeout(300);
await p.screenshot({ path: 'car/4b-workshop-shop.png' });
await p.tap('#ws-act');
await p.waitForTimeout(300);
let w = await cur();
const s1 = await stat();
check('buy: coins spent, part owned and auto-fitted', w.coins === 3000 - 150 && w.parts.tyres1 === 1 && w.cur.length === 2 && w.cur.includes('tyres1'), JSON.stringify(w));
check('buy: handling went up, speed unchanged', s1.handling > s0.handling && Math.abs(s1.speed - s0.speed) < 1e-9);
// the Rust Bucket has 2 sockets: a third part cannot be fitted without replacing one
await p.tap('#ws-tabs [data-tab="shop"]');
await p.tap('#ws-list [data-pid="turbo1"]');
await p.tap('#ws-act');
await p.tap('#ws-tabs [data-tab="fit"]');
await p.tap('#ws-sockets [data-slot="1"]');
await p.tap('#ws-list [data-pid="turbo1"]');
await p.waitForTimeout(200);
await p.screenshot({ path: 'car/4c-workshop-swap.png' });
const preview = await p.evaluate(() => document.getElementById('ws-stats').textContent);
check('swap preview shows the change', preview.includes('→'), preview);
await p.tap('#ws-act');
w = await cur();
const s2 = await stat();
check('sockets: never more fitted than sockets', w.cur.length === 2, JSON.stringify(w.cur));
check('swap: turbo replaced tyres in socket 2, accel up, handling down', w.cur[1] === 'turbo1' && s2.accel > s1.accel && s2.handling < s1.handling);
const sockets = await p.evaluate(() => document.querySelectorAll('#ws-sockets .sock').length);
check('two sockets on the Rust Bucket', sockets === 2);
// Chassis Mod: +1 socket, once
await p.tap('#ws-chassis');// economy: parts stay scarce (see tools/economy.mjs)
const eco = await p.evaluate(async () => {
  const W = await import('./src/workshop.js');
  const C = await import('./src/career.js');
  const P = await import('./src/parts.js');
  const bosses = C.CHAPTERS.map((ch) => ch.events.find((e) => e.boss).drop);
  const drops = C.CHAPTERS.flatMap((ch, ci) => ch.events.filter((e) => e.drop && !e.bp && !e.dropAny).map((e) => ({ ci, p: P.partById(e.drop) })));
  const c = { champion: false };
  return {
    bosses, dropsPerChapter: C.CHAPTERS.map((ch) => ch.events.filter((e) => e.drop).length),
    tier3Drop: drops.some((d) => d.p.tier === 3), early2: drops.some((d) => d.ci < 2 && d.p.tier >= 2),
    shopC1: W.shopList(c, 0).some((p) => p.tier >= 2), shopC2: W.shopList(c, 1).some((p) => p.kind === 'stat' && p.tier >= 2),
    t2: ['engine2', 'turbo2', 'tyres2', 'armor2'].map((id) => P.partById(id).price),
  };
});
check('economy: every chapter boss gives a different special', new Set(eco.bosses).size === 7 && eco.bosses.every((id) => id), JSON.stringify(eco.bosses));
check('economy: no Tier III drops, no Tier II drops in chapters 1-2', !eco.tier3Drop && !eco.early2);
check('economy: Tier II not sold in chapters 1-2, every chapter drops something', !eco.shopC1 && !eco.shopC2 && eco.dropsPerChapter.every((n) => n >= 1), JSON.stringify(eco.dropsPerChapter));
check('economy: Tier II prices raised', JSON.stringify(eco.t2) === '[760,680,600,520]', JSON.stringify(eco.t2));

await p.waitForTimeout(300);
const w2 = await cur();
check('chassis mod: +1 socket for 800 coins', w2.sockets === 1 && await p.evaluate(() => document.querySelectorAll('#ws-sockets .sock').length) === 3 && w2.coins === 3000 - 150 - 160 - 800, JSON.stringify(w2));
check('chassis mod: only once (button disabled, buying again refused)', await p.evaluate(async () => {
  const W = await import('./src/workshop.js');
  const c = window.zoomies.career, coins = c.coins;
  return document.getElementById('ws-chassis').disabled && !W.buyChassis(c, 'buggy').ok && c.coins === coins && c.sockets.buggy === 1;
}));
// third part now fits
await p.tap('#ws-sockets [data-slot="2"]');
await p.tap('#ws-list [data-pid="tyres1"]');
await p.tap('#ws-act');
w = await cur();
check('third socket takes a third part', w.cur.length === 3 && w.cur.includes('tyres1'), JSON.stringify(w.cur));
await p.screenshot({ path: 'car/4d-workshop-3sockets.png' });
// Tier III drawback: engine III is faster but slower to accelerate (granted directly)
const t3 = await p.evaluate(async () => {
  const { kartStats } = await import('./src/karts.js');
  const { charById } = await import('./src/characters.js');
  const ch = charById('mochi');
  const base = kartStats(ch, 'classic', { parts: [] });
  const e1 = kartStats(ch, 'classic', { parts: ['engine1'] }), e2 = kartStats(ch, 'classic', { parts: ['engine2'] }), e3 = kartStats(ch, 'classic', { parts: ['engine3'] });
  const t3c = kartStats(ch, 'classic', { parts: ['turbo3'] }), ty3 = kartStats(ch, 'classic', { parts: ['tyres3'] }), ar3 = kartStats(ch, 'classic', { parts: ['armor3'] });
  const sp = kartStats(ch, 'classic', { parts: ['iceStuds', 'gemVac'] });
  const dup = kartStats(ch, 'classic', { parts: ['engine3', 'engine1'] }); // only one engine fits
  const ai = kartStats(ch, 'classic', { flat: 3 }), old = kartStats(ch, 'classic', { engine: 3, turbo: 3, tyres: 3, armor: 3 });
  return { base, e1, e2, e3, t3c, ty3, ar3, sp, dup, ai, old };
});
check('stats: engines get faster with tier', t3.e1.speed > t3.base.speed && t3.e2.speed > t3.e1.speed && t3.e3.speed > t3.e2.speed);
check('stats: engine III drawback is acceleration', t3.e3.accel < t3.base.accel);
check('stats: turbo III is quicker but a little slower at the top', t3.t3c.accel > t3.base.accel && t3.t3c.speed < t3.base.speed && t3.t3c.turbo > 1);
check('stats: tyres III grip with a soft-ground drawback', t3.ty3.grip > 1 && t3.ty3.soft < 1);
check('stats: armour III heavier, shorter spins, slower accel', t3.ar3.weight > t3.base.weight && t3.ar3.armor < 1 && t3.ar3.accel < t3.base.accel);
check('stats: specials do not change stats but set perks', t3.sp.perks.iceStuds && t3.sp.perks.gemVac && t3.sp.speed === t3.base.speed);
check('stats: one engine at a time', t3.dup.speed === t3.e3.speed);
check('stats: computer racers use the old flat boost', Math.abs(t3.ai.speed - t3.old.speed) < 1e-9 && Math.abs(t3.ai.grip - t3.old.grip) < 1e-9 && Math.abs(t3.ai.armor - t3.old.armor) < 1e-9);
// Selling: bought parts return the full price, earned parts a small fixed sum
const sold = await p.evaluate(async () => {
  const W = await import('./src/workshop.js');
  const c = window.zoomies.career;
  W.setFit(c, 'buggy', []); // nothing fitted so everything can be sold
  const coins0 = c.coins;
  const r1 = W.sell(c, 'tyres1'); // bought for 150
  const r2 = W.sell(c, 'engine1'); // earned from the prologue
  const buy = W.buy(c, 'engine1', 0);
  const after = c.coins;
  W.setFit(c, 'buggy', []); // buying fitted it; take it off to sell
  const r3 = W.sell(c, 'engine1'); // that copy was bought
  return { coins0, r1, r2, buy, after, r3, end: c.coins };
});
check('sell: bought part pays 100%', sold.r1.ok && sold.r1.coins === 150);
check('sell: earned part pays a small fixed sum', sold.r2.ok && sold.r2.coins === 40);
check('sell: no coin exploit (buy then sell is free)', sold.buy.ok && sold.r3.coins === 180 && sold.end === sold.after + 180 && sold.after === sold.coins0 + 150 + 40 - 180, JSON.stringify(sold));
// Loadout presets: save, change, load
const pre = await p.evaluate(async () => {
  const W = await import('./src/workshop.js');
  const c = window.zoomies.career;
  W.grant(c, 'tyres1'); W.grant(c, 'engine1'); W.grant(c, 'armor1');
  W.setFit(c, 'buggy', ['engine1', 'tyres1', 'armor1']);
  W.savePreset(c, 'buggy', 0);
  W.setFit(c, 'buggy', ['armor1']);
  const mid = c.loadouts.buggy.cur.slice();
  W.loadPreset(c, 'buggy', 0);
  return { mid, loaded: c.loadouts.buggy.cur.slice(), pre: c.loadouts.buggy.pre };
});
check('presets: save and load', JSON.stringify(pre.mid) === '["armor1"]' && pre.loaded.length === 3 && pre.pre.length === 3 && pre.pre[0].length === 3, JSON.stringify(pre));
await p.evaluate(() => { window.zoomies.careerUI.renderWorkshop(); });
await p.tap('#ws-presets [data-pre="save"]');
await p.tap('#ws-presets [data-pre="1"]');
check('presets: tap saving via the UI', await p.evaluate(() => window.zoomies.career.loadouts.buggy.pre[1].length > 0));

// ---------------- 5. part drop on a 3-star clear, boss Blueprint, final unlock ----------------
const drops = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const c = window.zoomies.career;
  const before = c.parts.tyres1 || 0;
  const r1 = C.applyResult(c, 'c1-1', { place: 3, finished: true, time: 100, gems: 0, margin: 0 }); // 1 star: no drop
  const noDrop = !r1.drop && !c.drops['c1-1'];
  const r2 = C.applyResult(c, 'c1-1', { place: 1, finished: true, time: 100, gems: 0, margin: 5 }); // 3 stars
  const got = r2.drop && r2.drop.id;
  const r3 = C.applyResult(c, 'c1-1', { place: 1, finished: true, time: 100, gems: 0, margin: 5 });
  const boss = (c.done['c1-2'] = c.done['c1-3'] = true, C.applyResult(c, 'c1-b', { place: 1, finished: true, time: 90, gems: 0, margin: 0 }));
  return { noDrop, got, again: r3.drop, tyresBefore: before, tyresAfter: c.parts.tyres1, boss: boss.drop && boss.drop.id, bossBP: boss.drop && boss.drop.blueprint, story: boss.stories.map((s) => s.key), drops: { ...c.drops } };
});
console.log('drops', JSON.stringify(drops));
check('drop: none for a 1-star clear', drops.noDrop);
check('drop: 3-star clear drops the event part', drops.got === 'tyres1' && drops.tyresAfter === drops.tyresBefore + 1);
check('drop: only once per event', !drops.again);
check('drop: boss Blueprint on first clear, outro queued', drops.boss === 'driftSpring' && drops.bossBP && drops.story.includes('c1-outro'));
// the final: the Wheel unlocks Tier III in the shop
const fin = await p.evaluate(async () => {
  const W = await import('./src/workshop.js');
  const C = await import('./src/career.js');
  const c = window.zoomies.career;
  const before = W.inStock(c, 'engine3', 6);
  for (const id of ['c7-1', 'c7-2', 'c7-3']) c.done[id] = true;
  const r = C.applyResult(c, 'c7-b', { place: 1, wins: 4, gems: 0, finished: true });
  return { before, after: W.inStock(c, 'engine3', 6), bp: r.blueprint, champion: c.champion, stories: r.stories.map((s) => s.key), unlocked: r.unlocked, beaten: c.beaten.includes('bruno') };
});
check('final: Tier III unlocked after the Golden Wheel, epilogue queued, Bruno joins', !fin.before && fin.after && fin.bp && fin.champion && fin.stories.includes('c7-epilogue') && fin.unlocked === 'bruno' && fin.beaten, JSON.stringify(fin));

// ---------------- 6. specials work in a race ----------------
const perks = await p.evaluate(async () => {
  const app = window.zoomies; const out = {};
  const { Kart } = await import('./src/kart.js');
  const { charById } = await import('./src/characters.js');
  const start = (parts, track) => {
    app.paused = true;
    app.startRace({ mode: 'quick', trackId: track, player: 'mochi', speedClass: 'zoom', difficulty: 'easy', playerLoadout: { body: 'classic', upgrades: { parts } } });
    app.paused = true;
    return app.race;
  };
  // extra karts in the same race (cheaper than a new race each time)
  const mk = (r, parts) => new Kart(r, charById('mochi'), { index: 40, body: 'classic', upgrades: { parts } });
  let r = start(['driftSpring', 'itemPouch', 'gemVac'], 'sprout');
  const k = r.player;
  out.flags = k.perks;
  // Item Pouch: a second item
  k.item = 'chili'; k.itemCount = 1;
  r.items.give(k, 'ball');
  for (let i = 0; i < 200; i++) r.update(1 / 60);
  out.pouch = { item: k.item, item2: k.item2, rolling: k.rolling };
  r.items.use(k);
  out.after = { item: k.item, item2: k.item2 };
  // without the pouch a second box is ignored
  const plain = mk(r, []);
  plain.item = 'chili'; plain.itemCount = 1; r.items.give(plain, 'ball');
  out.noPouch = { rolling: plain.rolling, item2: plain.item2 };
  // Gem Vac: a hit costs 1 gem
  const hitGems = (parts) => { const q = mk(r, parts); q.gems = 6; q.invuln = 0; q.hit('spin'); return q.gems; };
  out.gems = { vac: hitGems(['gemVac']), plain: hitGems([]) };
  out.tarmac = { plain: mk(r, []).baseTop, studs: mk(r, ['iceStuds']).baseTop };
  out.rest = Object.keys(mk(r, ['slipSail', 'rocketPill', 'wingKit', 'bumperPlate', 'scoutLamp', 'mudBoots']).perks).sort();
  const cs = mk(r, ['comebackSpring']);
  cs.place = r.karts.length; cs.invuln = 0; cs.hit('spin'); out.comeback = cs.comeback;
  cs.spinTime = 0.001; cs.step(0.02, false); out.comebackBoost = cs.boostTime > 0;
  const mb = mk(r, ['mudBoots']); mb.slip(2.6);
  const pl = mk(r, []); pl.slip(2.6);
  out.slip = { boots: mb.slipTime, plain: pl.slipTime };
  // Ice Studs: grip on a snow track
  r = start([], 'frost');
  out.ice = { plain: mk(r, []).grip, studs: mk(r, ['iceStuds']).grip };
  app.paused = false;
  return out;
});
console.log('perks', JSON.stringify(perks));
check('perks: flags reach the kart', perks.flags.driftSpring && perks.flags.itemPouch && perks.flags.gemVac);
check('perks: Item Pouch holds two items', perks.pouch.item === 'chili' && perks.pouch.item2 === 'ball' && perks.after.item === 'ball' && !perks.after.item2, JSON.stringify(perks.pouch));
check('perks: no pouch, no second item', !(perks.noPouch.rolling > 0) && !perks.noPouch.item2);
check('perks: Gem Vac keeps gems on a hit', perks.gems.vac === 5 && perks.gems.plain === 3, JSON.stringify(perks.gems));
check('perks: Ice Studs grip on snow, small cost on tarmac', perks.ice.studs > perks.ice.plain * 1.5 && perks.tarmac.studs < perks.tarmac.plain, JSON.stringify([perks.ice, perks.tarmac]));
check('perks: the rest are carried', ['bumperPlate', 'mudBoots', 'rocketPill', 'scoutLamp', 'slipSail', 'wingKit'].every((x) => perks.rest.includes(x)), perks.rest.join());
check('perks: Comeback Spring boosts after a hit in last place', perks.comeback === true && perks.comebackBoost);
check('perks: Mud Boots shorten an oil slip', perks.slip.boots < perks.slip.plain);

// ---------------- 7. the original garage flow and a normal event ----------------
await p.evaluate(() => { const a = window.zoomies; a.paused = false; a.career.coins = 3000; a.openCareer(); });
await p.waitForTimeout(1200);
await p.evaluate(() => { const u = window.zoomies.careerUI; if (u.story) u.endStory(); });
await p.tap('#scr-career [data-go="garage"]');
await p.waitForTimeout(1500);
await p.screenshot({ path: 'car/5-garage-karts.png' });
await p.tap('#garage-list [data-pick="classic"]');
await p.waitForTimeout(800);
await p.tap('#gar-act');
await p.waitForTimeout(500);
await p.tap('#garage-tabs [data-tab="workshop"]');
await p.waitForTimeout(800);
check('garage: Workshop tab opens the Workshop', await p.evaluate(() => window.zoomies.ui.current === 'workshop' && window.zoomies.career.body === 'classic'));
await p.screenshot({ path: 'car/6-garage-workshop.png' });
await p.tap('#scr-workshop [data-go="garage"]').catch(() => {});
await p.evaluate(() => window.zoomies.careerUI.openGarage());
await p.waitForTimeout(500);
await p.tap('#garage-tabs [data-tab="racers"]');
await p.waitForTimeout(600);
await p.screenshot({ path: 'car/7-garage-racers.png' });
await p.tap('#garage-tabs [data-tab="paint"]');
await p.tap('#garage-list [data-pick="grape"]');
await p.waitForTimeout(600);
await p.tap('#gar-act');
await p.waitForTimeout(600);
await p.screenshot({ path: 'car/8-garage-paint.png' });
console.log('career', await p.evaluate(() => JSON.stringify(window.zoomies.career)));
await p.tap('#scr-garage [data-go="back"]');
await p.waitForTimeout(1200);
console.log('screen', await p.evaluate(() => window.zoomies.ui.current));
await p.evaluate(() => { const c = window.zoomies.career; for (const id of ['c1-1', 'c1-2', 'c1-3', 'c1-b']) c.done[id] = true; window.zoomies.careerUI.ci = 1; window.zoomies.careerUI.open(); });
await p.waitForTimeout(800);
await p.evaluate(() => { const u = window.zoomies.careerUI; if (u.story) u.endStory(); u.sel = 'c2-1'; u.render(); });
await p.waitForTimeout(600);
await p.screenshot({ path: 'car/11-hub-ch2.png' });
check('career loadout carries the fitted parts', await p.evaluate(async () => { const C = await import('./src/career.js'); const c = window.zoomies.career; return JSON.stringify(C.playerLoadout(c).upgrades.parts) === JSON.stringify(c.loadouts[c.body].cur); }));

// ---------------- 8. merging two saves with parts (sync) ----------------
const merged = await p.evaluate(async () => {
  const { mergeCareer } = await import('./src/sync.js');
  const { newCareer, cleanCareer } = await import('./src/career.js');
  const A = newCareer(); A.xp = 900; A.bodies = ['buggy', 'classic']; A.body = 'classic';
  A.parts = { engine1: 1, tyres2: 2, driftSpring: 1 }; A.bought = { engine1: 1, tyres2: 2 }; A.sockets = { buggy: 1 }; A.drops = { 'c1-0': 'engine1' };
  A.loadouts = { classic: { cur: ['engine1', 'tyres2'], pre: [['engine1'], [], []] }, buggy: { cur: ['tyres2'], pre: [[], [], []] } };
  const B = newCareer(); B.xp = 400; B.bodies = ['buggy']; B.body = 'buggy';
  B.parts = { engine1: 3, armor1: 1, bogus: 4, turbo3: 1 }; B.bought = { engine1: 2 }; B.drops = { 'c1-1': 'tyres1', 'c1-2': 'nothing' }; B.sockets = { classic: 1 };
  B.loadouts = { buggy: { cur: ['armor1', 'engine1', 'turbo3'], pre: [[], ['armor1'], []] }, tank: { cur: ['engine1'], pre: [] } };
  const m = mergeCareer(A, B);
  const rev = mergeCareer(B, A);
  // hostile input is cleaned: counts bounded, unknown ids and bodies dropped, long arrays cut
  const hostile = cleanCareer({ ...newCareer(), parts: { engine1: 1e12, nope: 5, __proto__: 3 }, loadouts: { buggy: { cur: new Array(50).fill('engine1'), pre: [[], [], [], ['x']] }, ['x'.repeat(100)]: { cur: [] } }, sockets: { buggy: 99 }, drops: { a: 'engine1', b: 7 } });
  return { m: { parts: m.parts, bought: m.bought, sockets: m.sockets, drops: m.drops, load: m.loadouts, body: m.body, pv: m.pv, up: m.upgrades }, rev: { parts: rev.parts, load: rev.loadouts }, hostile: { parts: hostile.parts, load: hostile.loadouts, sockets: hostile.sockets, drops: hostile.drops } };
});
console.log('merged', JSON.stringify(merged));
check('merge: higher count of each part, unknown ids dropped', merged.m.parts.engine1 === 3 && merged.m.parts.tyres2 === 2 && merged.m.parts.armor1 === 1 && merged.m.parts.turbo3 === 1 && merged.m.parts.driftSpring === 1 && !('bogus' in merged.m.parts), JSON.stringify(merged.m.parts));
check('merge: sockets and earned drops combined', merged.m.sockets.buggy === 1 && merged.m.sockets.classic === 1 && merged.m.drops['c1-0'] === 'engine1' && merged.m.drops['c1-1'] === 'tyres1' && !('c1-2' in merged.m.drops), JSON.stringify([merged.m.sockets, merged.m.drops]));
check('merge: loadouts from the more played save, other vehicles kept', JSON.stringify(merged.m.load.classic.cur) === '["engine1","tyres2"]' && merged.m.load.buggy.cur.join() === 'tyres2' && !merged.m.load.tank, JSON.stringify(merged.m.load));
check('merge: more fitted than sockets are trimmed, presets kept', merged.rev.load.buggy.cur.length <= 3 && merged.m.load.classic.pre[0].join() === 'engine1', JSON.stringify(merged.rev.load));
const sortKeys = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
check('merge: both orders keep the same parts', sortKeys(merged.m.parts) === sortKeys(merged.rev.parts));
check('merge: new format', merged.m.pv === 2 && Object.keys(merged.m.up).length === 0);
check('clean: counts bounded, hostile data dropped', merged.hostile.parts.engine1 === 20 && !('nope' in merged.hostile.parts) && merged.hostile.load.buggy.cur.length <= 1 && Object.keys(merged.hostile.load).length === 1 && merged.hostile.sockets.buggy === 1 && merged.hostile.drops.a === 'engine1' && !('b' in merged.hostile.drops), JSON.stringify(merged.hostile));

// ---------------- 9. gumball jackpot: a free part ----------------
const jp = await p.evaluate(async () => {
  const P = await import('./src/prizes.js');
  const { newCareer } = await import('./src/career.js');
  const c = newCareer();
  const seq = [0.05 + 0.0, 0.01]; // 0.03 paint then 0.025 part: r in (0.03, 0.055) hits the part prize
  let i = 0; const rnd = () => (i++ === 0 ? 0.04 : 0.3);
  const it = P.rollJackpot(c, rnd);
  return { it: it && { prize: it.prize, ref: it.ref, name: it.name }, parts: c.parts };
});
check('jackpot: free Tier I/II part', jp.it && jp.it.prize === 'part' && /^(engine|turbo|tyres|armor)[12]$/.test(jp.it.ref) && jp.parts[jp.it.ref] === 1, JSON.stringify(jp));

// ---------------- 10. desktop screenshots ----------------
await p.close(); // the software renderer can only keep one busy page going
const dctx = await b.newContext({ viewport: { width: 1470, height: 860 } });
const d = await dctx.newPage();
d.on('pageerror', e => { errs.push(e.message); console.log('[pageerror desktop]', e.message); });
d.setDefaultTimeout(90000);
await d.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
await d.evaluate(([k]) => { localStorage.setItem(k, JSON.stringify({ v: 1, pv: 2, coins: 2400, racer: 'mochi', racers: ['mochi'], body: 'classic', bodies: ['buggy', 'classic'], paint: 'stock', paints: ['stock'], stars: { 'c1-0': 3, 'c1-1': 3, 'c1-2': 2 }, done: { 'c1-0': true, 'c1-1': true, 'c1-2': true, 'c1-3': true, 'c1-b': true }, seen: { 'c1-prologue': true, 'c1-intro': true, 'c1-outro': true, 'c1-boss': true }, beaten: ['hopper', 'pip'], xp: 1500, parts: { engine1: 1, engine2: 1, tyres1: 1, tyres2: 1, turbo1: 1, armor1: 1, driftSpring: 1, gemVac: 1 }, bought: { engine2: 1 }, loadouts: { classic: { cur: ['engine2', 'tyres1', 'driftSpring'], pre: [['tyres2', 'armor1', 'gemVac'], ['engine2', 'turbo1', 'driftSpring'], []] } }, sockets: {}, drops: { 'c1-0': 'engine1', 'c1-b': 'driftSpring' }, pnew: true })); }, [KEY]);
await d.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await d.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
await d.waitForTimeout(1500);
await d.evaluate(() => { window.zoomies.careerUI.ci = null; window.zoomies.careerUI.open(); });
await d.waitForTimeout(1500);
await d.evaluate(() => { const u = window.zoomies.careerUI; if (u.story) u.endStory(); });
await d.waitForTimeout(1500);
await d.screenshot({ path: 'car/12-desktop-hub.png' });
await d.evaluate(() => { const u = window.zoomies.careerUI; u.sel = 'c2-1'; u.render(); });
await d.waitForTimeout(500);
await d.screenshot({ path: 'car/12b-desktop-hub-sel.png' });
await d.evaluate(() => { window.zoomies.careerUI.openWorkshop(); const u = window.zoomies.careerUI; u.ws.sel = 'tyres2'; u.ws.slot = 1; u.renderWorkshop(); });
await d.waitForTimeout(1500);
await d.screenshot({ path: 'car/13-desktop-workshop.png' });
await d.evaluate(() => { const u = window.zoomies.careerUI; u.ws.tab = 'shop'; u.ws.sel = 'mudBoots'; u.renderWorkshop(); });
await d.waitForTimeout(600);
await d.screenshot({ path: 'car/13b-desktop-workshop-shop.png' });
await d.evaluate(() => { window.zoomies.careerUI.playStories([{ key: 'x', lines: [['baron', 'Greetings, Circuit. Baron Von Boost, owner of Boost Corp.'], ['gramps', 'Approved. Hm. Funny word.']], title: 'Rookie Road' }], () => {}); });
await d.waitForTimeout(800);
await d.screenshot({ path: 'car/14-desktop-story.png' });
await dctx.close();

console.log('errors', errs.length + fails);
await b.close();
