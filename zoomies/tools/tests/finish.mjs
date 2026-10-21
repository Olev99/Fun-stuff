// The four finishing jobs: reversed Dune Surf, Balloon Battle results with a racer who is down,
// sell-then-sync (sold counts), and Workshop parts in the quick modes. Screenshots go to fin/.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const KEY = 'zoomies-career-v1';
const errs = [];
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const open = async (w, h, mobile) => {
  const ctx = await b.newContext(mobile ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('zoomies.settings.v1', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  const p = await ctx.newPage();
  p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 500)); });
  await p.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.evaluate(() => { window.zoomies.paused = true; });
  return p;
};
let p = await open(852, 393, true);

// ---------------- 3. sell then sync: sold counts ----------------
const sync = await p.evaluate(async () => {
  const { mergeCareer } = await import('./src/sync.js');
  const { newCareer, cleanCareer } = await import('./src/career.js');
  const W = await import('./src/workshop.js');
  const mk = (xp, f) => { const c = newCareer(); c.xp = xp; c.bodies = ['buggy', 'classic']; c.body = 'classic'; f(c); return cleanCareer(c); };
  const both = (A, B) => [mergeCareer(A, B), mergeCareer(B, A)];
  const out = {};
  // Sell on A (2 copies, one sold), B still holds both.
  const A1 = mk(900, (c) => { c.parts = { engine1: 2 }; c.bought = { engine1: 2 }; c.coins = 500; });
  const sold = (() => { const c = JSON.parse(JSON.stringify(A1)); const r = W.sell(c, 'engine1'); return { c, r }; })();
  const B1 = mk(400, (c) => { c.parts = { engine1: 2 }; c.bought = { engine1: 2 }; });
  out.sellOne = { r: sold.r.ok, sold: sold.c.sold.engine1, parts: sold.c.parts.engine1, m: both(sold.c, B1).map((m) => [m.parts.engine1, m.sold.engine1]) };
  // Selling the only copy: it must not come back, and a loadout that fitted it on B loses it.
  const A2 = mk(300, (c) => { c.parts = { engine1: 1 }; c.bought = { engine1: 1 }; });
  W.setFit(A2, 'classic', []); const s2 = W.sell(A2, 'engine1');
  const B2 = mk(900, (c) => { c.parts = { engine1: 1 }; c.loadouts = { classic: { cur: ['engine1'], pre: [[], [], []] } }; });
  out.sellOnly = { r: s2.ok, m: both(A2, B2).map((m) => [m.parts.engine1 || 0, m.sold.engine1, m.loadouts.classic.cur.join(',')]) };
  // Buy on B after A sold one: the purchase is not lost.
  const B3 = mk(400, (c) => { c.parts = { engine1: 3 }; c.bought = { engine1: 3 }; });
  out.buyB = both(sold.c, B3).map((m) => [m.parts.engine1, m.sold.engine1]);
  // Sold on both devices (the same single copy).
  const A4 = mk(900, (c) => { c.sold = { tyres1: 1 }; }), B4 = mk(400, (c) => { c.sold = { tyres1: 1 }; });
  out.sellBoth = both(A4, B4).map((m) => [m.parts.tyres1 || 0, m.sold.tyres1]);
  // Merging twice changes nothing (idempotent), and old saves (no sold field) load with none.
  const m1 = mergeCareer(sold.c, B1), m2 = mergeCareer(m1, B1), m3 = mergeCareer(m1, sold.c);
  out.again = [m2.parts.engine1, m2.sold.engine1, m3.parts.engine1, m3.sold.engine1];
  const old = cleanCareer({ ...newCareer(), parts: { engine1: 2 } });
  delete old.sold;
  out.old = { sold: JSON.stringify(cleanCareer(old).sold), parts: cleanCareer(old).parts.engine1 };
  // Hostile sold values.
  const H = cleanCareer({ ...newCareer(), parts: { engine1: 3, turbo1: 1 }, sold: { engine1: 1e12, turbo1: -5, nope: 4, tyres1: 'x', armor1: NaN, ['__proto__']: 3, ['x'.repeat(80)]: 2, driftSpring: 2.6 } });
  out.hostile = { sold: H.sold, keys: Object.keys(H.sold).sort().join(',') };
  const HM = mergeCareer(H, B1);
  out.hostileMerge = { parts: HM.parts, sold: HM.sold };
  out.hostileSold = mergeCareer(cleanCareer({ ...newCareer(), sold: { engine1: 1e12 } }), B1); // a huge sold count only ever removes that part
  const HA = cleanCareer({ ...newCareer(), sold: [1, 2, 3] }), HB = cleanCareer({ ...newCareer(), sold: 'x' });
  out.hostileShape = [JSON.stringify(HA.sold), JSON.stringify(HB.sold)];
  // Counts stay within bounds after merging huge acquired counts.
  const big = mergeCareer(mk(5, (c) => { c.parts = { engine1: 20 }; c.sold = { engine1: 1000 }; }), mk(4, (c) => { c.parts = { engine1: 20 }; c.sold = { engine1: 1000 }; }));
  out.big = [big.parts.engine1, big.sold.engine1];
  return out;
});
console.log('sync', JSON.stringify(sync));
check('sell: a sale lowers the count and records it', sync.sellOne.r && sync.sellOne.sold === 1 && sync.sellOne.parts === 1);
check('sell on A, B still holds it: the sale survives the merge (both orders)', sync.sellOne.m.every(([n, s]) => n === 1 && s === 1), JSON.stringify(sync.sellOne.m));
check('sell the only copy: it does not come back, loadouts drop it (both orders)', sync.sellOnly.r && sync.sellOnly.m.every(([n, s, l]) => n === 0 && s === 1 && l === ''), JSON.stringify(sync.sellOnly.m));
check('buy on B after a sale on A: purchase kept, sale kept (both orders)', sync.buyB.every(([n, s]) => n === 2 && s === 1), JSON.stringify(sync.buyB));
check('sold on both devices: stays sold', sync.sellBoth.every(([n, s]) => n === 0 && s === 1), JSON.stringify(sync.sellBoth));
check('merging again changes nothing', sync.again.join() === '1,1,1,1', sync.again.join());
check('old save without sold loads with none', sync.old.sold === '{}' && sync.old.parts === 2, JSON.stringify(sync.old));
check('hostile sold values are bounded and cleaned', sync.hostile.sold.engine1 === 1000 && sync.hostile.sold.driftSpring === 3 && sync.hostile.keys === 'driftSpring,engine1', JSON.stringify(sync.hostile));
check('hostile merge stays within bounds', Object.values(sync.hostileMerge.parts).every((n) => n >= 1 && n <= 20) && sync.hostileMerge.sold.engine1 === 1000 && sync.hostileMerge.parts.engine1 === 3 && !('engine1' in sync.hostileSold.parts), JSON.stringify([sync.hostileMerge, sync.hostileSold]));
check('sold of the wrong shape is ignored', sync.hostileShape.join() === '{},{}', sync.hostileShape.join());
check('huge acquired counts stay bounded', sync.big.join() === '20,1000', sync.big.join());

// ---------------- 1. Dune Surf geometry ----------------
const dunes = await p.evaluate(async () => {
  const a = window.zoomies, out = {};
  for (const rev of [false, true]) {
    a.startRace({ mode: 'quick', trackId: 'dunes', reverse: rev, player: 'mochi', speedClass: 'zoom' });
    a.paused = true;
    const sc = a.race.track.shortcuts.find((s) => s.name === 'Dune Surf');
    let mn = 1e9; for (let i = 0; i < sc.count; i++) mn = Math.min(mn, 1 / Math.max(1e-4, Math.abs(sc.curv[i])));
    out[rev ? 'rev' : 'fwd'] = { minR: +mn.toFixed(1), len: Math.round(sc.length), noBoost: sc.def.aiNoBoost };
  }
  return out;
});
console.log('dunes', JSON.stringify(dunes));
check('Dune Surf: tightest corner is at least 12 m in both directions', dunes.fwd.minR >= 12 && dunes.rev.minR >= 12, JSON.stringify(dunes));
check('Dune Surf: computer racers plan it in both directions', dunes.fwd.noBoost === 'both' && dunes.rev.noBoost === 'both');

// ---------------- 2. Balloon Battle results with a racer who is down ----------------
const battleScenario = (pg) => pg.evaluate(async () => {
  const a = window.zoomies;
  a.startFromMenu('battle');
  const r = a.race; r.skipIntro = true; a.paused = true;
  for (let i = 0; i < 60 * 6 && r.state !== 'race'; i++) r.update(1 / 60);
  for (let i = 0; i < 30; i++) r.update(1 / 60);
  const ks = r.karts, bt = r.battle;
  // player 3 balloons, k1 one balloon, k2 down, k3 down (fewer hits), the rest out for good
  const pk = r.player, others = ks.filter((k) => k !== pk);
  const [k1, k2, k3, ...rest] = others;
  for (const k of ks) { k.invuln = 0; k.starTime = 0; k.shield = 0; }
  pk.balloons = 3; k1.balloons = 1;
  k2.hitsLanded = 2; k3.hitsLanded = 1; k1.hitsLanded = 0; pk.hitsLanded = 0;
  for (const k of [k2, k3]) k.balloons = 1;
  let guard = 0;
  while (guard++ < 12 && !(k2.down && k3.down)) for (const k of [k2, k3]) if (!k.down) { k.invuln = 0; k.shield = 0; k.hit('spin'); }
  for (const k of rest) { k.outAt = 1; k.balloons = 0; k.out = true; k.down = false; }
  k2.downT = k3.downT = 999;
  bt.timeLeft = 0;
  bt._end();
  const rows = bt.rows;
  return {
    down: [k2.down, k3.down], order: r.order.map((k) => (k === pk ? 'P' : k === k1 ? 'A' : k === k2 ? 'D2' : k === k3 ? 'D3' : 'x')).join(','),
    rows: rows.map((x) => ({ place: x.place, balloons: x.balloons, hits: x.hits, out: x.out, isPlayer: x.isPlayer })),
    cells: rows.map((x) => window.zoomies.ui.battleCell(x).replace(/<[^>]+>/g, '|')),
  };
});
const showBattle = async (pg, shot) => {
  await pg.evaluate(() => {
    const a = window.zoomies, r = a.race;
    a.onRaceComplete(r, r.battle.rows, true);
  });
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: shot });
  return pg.evaluate(() => [...document.querySelectorAll('#res-body .res .plus')].map((e) => e.textContent + (e.classList.contains('down') ? '*' : '')));
};
const bs = await battleScenario(p);
console.log('battle', JSON.stringify(bs));
check('battle: two racers are waiting to come back at the end', bs.down[0] && bs.down[1]);
check('battle standings: balloons first, then down racers by hits, then the knocked out', bs.order.startsWith('P,A,D2,D3,'), bs.order);
check('battle results rows: a down racer shows DOWN (not an empty cell)', bs.cells.filter((c) => c.includes('DOWN')).length === 2 && bs.cells.filter((c) => c.includes('OUT')).length === 2 && bs.cells[0].includes('🎈🎈🎈'), JSON.stringify(bs.cells));
const cellsShown = await showBattle(p, 'fin/battle-down-852.png');
check('battle results screen: DOWN cells are styled', cellsShown.filter((c) => c === 'DOWN*').length === 2, JSON.stringify(cellsShown));
// The podium names show the balloons or DOWN too.
const pod = await p.evaluate(() => {
  const a = window.zoomies, r = a.race;
  const rows = r.battle.rows;
  a.hud.podium(rows.slice(0, 3), rows.find((x) => x.isPlayer));
  return document.getElementById('pod-names').textContent;
});
check('battle podium: balloons left or DOWN beside the names', /🎈3/.test(pod) && /🎈1/.test(pod) && /DOWN/.test(pod), pod);
await p.evaluate(() => window.zoomies.hud.podium(null));
// An online results row has the same shape (b, h, out): the guest's cell must say DOWN too.
const mpCell = await p.evaluate(() => window.zoomies.ui.battleCell({ ch: {}, balloons: 0, hits: 2, out: false }).replace(/<[^>]+>/g, '|') + window.zoomies.ui.battleCell({ ch: {}, balloons: 0, hits: 0, out: true }).replace(/<[^>]+>/g, '|'));
check('battle online rows: down shows DOWN, out shows OUT', /DOWN/.test(mpCell) && /OUT/.test(mpCell), mpCell);

// ---------------- 4. Workshop parts in the quick modes ----------------
const prep = () => {
  const c = window.zoomies.career;
  c.bodies = [...new Set([...(c.bodies || []), 'buggy', 'classic'])];
  c.parts = { engine3: 1, turbo3: 1, tyres3: 1, rocketPill: 1, engine1: 1 };
  c.loadouts = { classic: { cur: ['engine3', 'turbo3', 'tyres3'], pre: [[], [], []] }, buggy: { cur: ['engine1'], pre: [[], [], []] } };
  c.body = 'classic';
  window.zoomies.settings.vehicle = 'classic';
  window.zoomies.settings.workshopParts = true;
};
const modes = await p.evaluate(async (prepSrc) => {
  const a = window.zoomies;
  new Function('return ' + prepSrc)()();
  const { kartStats } = await import('./src/karts.js');
  const { charById } = await import('./src/characters.js');
  const { statsFrom } = await import('./src/parts.js');
  const out = {};
  const speed = () => a.race.player.stats.speed;
  const stock = kartStats(charById('mochi'), 'classic', {}).speed;
  const tuned = kartStats(charById('mochi'), 'classic', { parts: ['engine3', 'turbo3', 'tyres3'] }).speed;
  out.stock = stock; out.tuned = tuned;
  const run = (name, f) => { f(); a.paused = true; out[name] = { speed: speed(), perks: Object.keys(a.race.player.stats.perks || {}), mode: a.race.mode }; };
  run('quick', () => a.startFromMenu('quick'));
  run('gp', () => a.startFromMenu('gp'));
  run('battle', () => a.startFromMenu('battle'));
  run('tt', () => a.startFromMenu('tt'));
  run('daily', () => a.startDaily());
  run('weekly', () => a.startWeekly());
  run('school', () => a.startSchool('title'));
  a.settings.workshopParts = false;
  run('quickOff', () => a.startFromMenu('quick'));
  run('battleOff', () => a.startFromMenu('battle'));
  a.settings.workshopParts = true;
  // A vehicle with nothing fitted is stock; another vehicle uses its own parts.
  a.settings.vehicle = 'buggy';
  run('buggy', () => a.startFromMenu('quick'));
  out.menu = [JSON.stringify(a.menuLoadout(true)), JSON.stringify(a.menuLoadout())];
  return out;
}, `(${prep.toString()})`);
console.log('modes', JSON.stringify(modes));
const near = (x, y) => Math.abs(x - y) < 1e-6;
for (const m of ['quick', 'gp', 'battle']) check(`${m}: the fitted Workshop parts count`, near(modes[m].speed, modes.tuned), `${modes[m].speed} vs ${modes.tuned}`);
for (const m of ['tt', 'daily', 'weekly', 'school', 'quickOff', 'battleOff']) check(`${m}: stock stats`, near(modes[m].speed, modes.stock), `${modes[m].speed} vs ${modes.stock}`);
check('another vehicle uses its own loadout', modes.buggy.speed > 0 && modes.menu[0].includes('"engine1"') && !modes.menu[1].includes('upgrades'), modes.menu.join(' | '));

// Online: your own kart carries the parts, and the state validation accepts what a tuned, boosting kart sends.
const net = await p.evaluate(async (prepSrc) => {
  const a = window.zoomies;
  new Function('return ' + prepSrc)()();
  const { kartState, cleanState } = await import('./src/race.js');
  a.settings.speedClass = 'turbo';
  a.settings.vehicle = 'classic';
  a.startFromMenu('quick');
  a.paused = true;
  const r = a.race; r.skipIntro = true;
  const k = r.player;
  const inp = { steer: 0, throttle: 1, drift: false, brake: false, item: false };
  a.input.read = () => ({ ...inp });
  let worst = 0, bad = 0, n = 0, maxSpeed = 0;
  for (let i = 0; i < 60 * 40; i++) {
    r.update(1 / 60);
    if (r.state !== 'race') continue;
    if (i % 90 === 0) { k.startBoost(1.4, 10); k.gems = 10; }
    for (const q of r.karts) {
      const s = kartState(q), c = cleanState(s);
      n++; // timers can dip a hair below 0 and get clamped: fine, only rejected or far-off values count
      if (!c || c.some((v, j) => Math.abs(v - s[j]) > 0.05)) { bad++; if (!window.__bad) window.__bad = JSON.stringify({ s, c, ai: !!q.ai, player: q.isPlayer }); }
    }
    maxSpeed = Math.max(maxSpeed, Math.hypot(k.vel.x, k.vel.z));
  }
  return { bad, n, maxSpeed: +maxSpeed.toFixed(1), tuned: k.stats.speed, first: window.__bad };
}, `(${prep.toString()})`);
console.log('net', JSON.stringify(net));
check('online state validation accepts a tuned, boosting kart', net.bad === 0 && net.n > 1000 && net.maxSpeed > 20, JSON.stringify(net));

// Setup lines and the Settings toggle.
const lines = await p.evaluate(() => {
  const a = window.zoomies, ui = a.ui, text = () => document.getElementById('ws-line').textContent;
  const o = {};
  a.settings.workshopParts = true;
  for (const m of ['quick', 'gp', 'battle', 'tt']) { ui.mode = m; ui.trackSelect(); o[m] = text(); }
  a.settings.workshopParts = false; ui.mode = 'quick'; ui.trackSelect(); o.off = text();
  a.settings.workshopParts = true;
  ui.dailyScreen(); o.daily = document.getElementById('daily-reward').textContent;
  ui.weeklyScreen(); o.weekly = document.getElementById('weekly-reward').textContent;
  ui.overlay('settings', 'title');
  const cb = document.getElementById('set-ws');
  o.toggle = cb.checked;
  cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  o.saved = a.settings.workshopParts;
  cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
  o.back = a.settings.workshopParts;
  return o;
});
console.log('lines', JSON.stringify(lines));
check('setup lines say what the mode uses', lines.quick === 'Workshop parts: on' && lines.gp === 'Workshop parts: on' && lines.battle === 'Workshop parts: on' && /^Stock stats/.test(lines.tt) && /off/.test(lines.off), JSON.stringify(lines));
check('daily and weekly screens say stock stats', /Stock stats/.test(lines.daily) && /Stock stats/.test(lines.weekly));
check('settings toggle: default on, turns off and on', lines.toggle === true && lines.saved === false && lines.back === true);
// default for a new settings file is on
const def = await p.evaluate(async () => (await import('./src/settings.js')).DEFAULTS.workshopParts);
check('workshopParts defaults to on', def === true);

// Screenshots: setup line, settings.
await p.evaluate(() => { const ui = window.zoomies.ui; ui.mode = 'quick'; ui.trackSelect(); });
await p.waitForTimeout(800);
await p.screenshot({ path: 'fin/setup-852.png' });
await p.evaluate(() => { const ui = window.zoomies.ui; ui.mode = 'tt'; ui.trackSelect(); });
await p.waitForTimeout(500);
await p.screenshot({ path: 'fin/setup-tt-852.png' });
await p.evaluate(() => { const ui = window.zoomies.ui; ui.overlay('settings', 'title'); document.getElementById('set-ws').scrollIntoView({ block: 'center' }); });
await p.waitForTimeout(500);
await p.screenshot({ path: 'fin/settings-852.png' });

// Reversed Dune Surf shot: a kart driving into the reversed cut.
const dsShot = async (pg, shot) => {
  await pg.evaluate(() => { window.zoomies.ui.hideAll(); });
  await pg.addStyleTag({ content: '#hud{display:none!important}' });
  await pg.evaluate(async () => {
    const a = window.zoomies;
    a.startRace({ mode: 'quick', trackId: 'dunes', reverse: true, player: 'mochi', speedClass: 'zoom' });
    a.paused = true;
    const r = a.race; r.skipIntro = true;
    for (let i = 0; i < 60 * 6.5; i++) r.update(1 / 60);
    for (const o of r.karts) if (o !== r.player) { o.pos.set(9999, 0, 9999); o.ai = null; o.remote = true; }
    const k = r.player, tr = r.track, sc = tr.shortcuts.find((s) => s.name === 'Dune Surf'), fr = {};
    const s0 = (sc.fromS - 30 + tr.length) % tr.length;
    k.path = tr; k.seg = -1; k.placeAt(s0, 0); k.respawnT = 0; k.stuck = 0; k.progT = 0;
    tr.frame(s0, fr); k.yaw = Math.atan2(fr.tx, fr.tz); k.vel.set(Math.sin(k.yaw) * 22, 0, Math.cos(k.yaw) * 22);
    const inp = { steer: 0, throttle: 1, drift: false, brake: false, item: false };
    a.input.read = () => ({ ...inp });
    for (let f = 0; f < 60 * 3.2; f++) {
      let tx, tz;
      if (k.path === sc) { sc.frame(Math.min(sc.length - 1, k.trk.s + 14), fr); tx = fr.x; tz = fr.z; }
      else { sc.frame(Math.min(Math.max(25, sc.entryEnd * sc.ds + 8), sc.length - 1), fr); tx = fr.x; tz = fr.z; }
      let d = Math.atan2(tx - k.pos.x, tz - k.pos.z) - k.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      inp.steer = Math.max(-1, Math.min(1, -d * 2.4));
      r.state = 'race'; r.update(1 / 60);
    }
    window.__onCut = k.path === sc;
  });
  await pg.evaluate(() => { window.zoomies.paused = false; }); // a paused game draws nothing: let one frame render
  await pg.waitForTimeout(500);
  await pg.evaluate(() => { window.zoomies.paused = true; });
  await pg.screenshot({ path: shot });
  return pg.evaluate(() => window.__onCut);
};
check('reversed Dune Surf: a kart drives into the cut', await dsShot(p, 'fin/dunes-rev-852.png'));

await p.context().close();

// ---------------- desktop screenshots ----------------
p = await open(1470, 860, false);
await p.evaluate(() => {
  const c = window.zoomies.career;
  c.parts = { engine3: 1 }; c.loadouts = { classic: { cur: ['engine3'], pre: [[], [], []] } };
});
await p.evaluate(() => { const ui = window.zoomies.ui; ui.mode = 'quick'; ui.trackSelect(); });
await p.waitForTimeout(1200);
await p.screenshot({ path: 'fin/setup-1470.png' });
await battleScenario(p);
await showBattle(p, 'fin/battle-down-1470.png');
check('desktop: battle results show DOWN', (await p.evaluate(() => document.getElementById('res-body').textContent)).includes('DOWN'));
await dsShot(p, 'fin/dunes-rev-1470.png');

console.log('errors', errs.length + fails);
await b.close();
