import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 300 }, isMobile: true, hasTouch: true });
ctx.setDefaultTimeout(120000); // building a battle on a busy machine can take a while
await ctx.addInitScript(() => { try { localStorage.setItem('zoomies.settings.v1', JSON.stringify({ quality: 'low' })); } catch (e) {} });
const A = await ctx.newPage(), B = await ctx.newPage();
const errs = [];
for (const [n, p] of [['A', A], ['B', B]]) {
  p.on('pageerror', e => { errs.push(e.message); console.log(`[${n} pageerror]`, e.message, e.stack?.slice(0, 500)); });
}
const url = 'http://localhost:8000/index.html?net=local&lag=40';
// Load A first and freeze its menu demo race before B loads: a running software-rendered demo
// starves the second page's load (it took ~28 s of the 30 s limit once the world got richer).
await A.goto(url); await A.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
await A.evaluate(() => { window.zoomies.paused = true; });
await B.goto(url); await B.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
// Freeze the menu's demo race so two phones in one browser don't starve each other.
for (const p of [A, B]) await p.evaluate(() => { window.zoomies.paused = true; });
await A.tap('[data-go="mp"]'); await A.waitForTimeout(400);
await A.tap('#scr-lobby [data-go="host"]'); await A.waitForTimeout(1200);
const code = await A.textContent('#room-code');
await B.tap('[data-go="mp"]'); await B.waitForTimeout(400);
await B.fill('#join-code', code);
await B.tap('#scr-lobby [data-go="join"]'); await B.waitForTimeout(1500);
await A.tap('#lobby-settings [data-lb="track-prev"]'); await A.waitForTimeout(800);
console.log('host picker:', await A.textContent('#lobby-settings .picker span'), '| start btn:', await A.textContent('#scr-lobby [data-go="start"]'));
console.log('guest summary:', (await B.textContent('#lobby-settings')).slice(0, 60));
await A.screenshot({ path: 'bat/mp-lobby.png' });
await A.tap('#scr-lobby [data-go="start"]');
const tick = (p, n) => p.evaluate((n) => { const a = window.zoomies; a.paused = true; for (let i = 0; i < n; i++) if (a.race) a.race.update(1 / 30); return a.race ? a.race.mode + ' ' + a.race.state + ' ' + a.race.raceTime.toFixed(1) : '-'; }, n);
for (let i = 0; i < 400; i++) { // a busy machine can take a while to build the arena on both phones
  const sa = await tick(A, 6); const sb = await tick(B, 6);
  await A.waitForTimeout(60);
  if (sa.startsWith('mp race') && sb.startsWith('mp race') && parseFloat(sa.split(' ')[2]) > 3) break;
}
const st = (p) => p.evaluate(() => { const r = window.zoomies.race; return `${r.state} battle=${!!r.battle} t=${r.battle ? r.battle.timeLeft.toFixed(0) : '-'} ` + r.karts.map((k) => `${k.ch.id}${k.isPlayer ? '*' : ''}${k.remote ? 'R' : ''}:${k.down ? 'D' : k.out ? 'X' : k.balloons}`).join(' '); });
console.log('A', await st(A)); console.log('B', await st(B));
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await tick(A, 3); await tick(B, 3); await A.waitForTimeout(50); } };
// Host pops its own balloon; guest pops its own.
await A.evaluate(() => { const p = window.zoomies.race.player; p.invuln = 0; p.hit('spin'); });
await B.evaluate(() => { const p = window.zoomies.race.player; p.invuln = 0; p.hit('spin'); });
await settle();
console.log('after one pop each:'); console.log('A', await st(A)); console.log('B', await st(B));
await B.evaluate(() => { const p = window.zoomies.race.player; p.invuln = 0; p.spinTime = 0; });
await settle();
// Each kart's balloons as the device that simulates it sees them.
const view = (p) => p.evaluate(() => window.zoomies.race.karts.map((k) => (k.remote ? null : { b: k.balloons, out: k.out, down: !!k.down })));
const owned = async () => { const a = await view(A), g = await view(B); return a.map((x, i) => x || g[i]); };
const total = (v) => v.reduce((n, x) => n + (x.out ? 0 : x.b), 0);
// From here the host's computer racers hold still, so only rams change balloons.
await A.evaluate(() => { for (const k of window.zoomies.race.karts) if (k.ai) { k.frozenAi = k.ai; k.ai = null; Object.assign(k.ctl, { throttle: 0, steer: 0, drift: false, item: false, brake: true }); } });
await settle(6);
// Ram stress under lag: boosted rams from either phone, some seen by both
// phones, some by only one. A balloon may only be gained by popping one, so
// the total never goes up.
const slots = await A.evaluate(() => { const r = window.zoomies.race; return { g: r.karts.findIndex((k) => k.remote), ais: r.karts.map((k, i) => (k.frozenAi ? i : -1)).filter((i) => i >= 0) }; });
// Line att up 2.6 m behind vic on page p; with boost, ram.
const lineUp = (p, att, vic, boost) => p.evaluate(([a, v, boost]) => {
  const r = window.zoomies.race, at = r.karts[a], vi = r.karts[v];
  // Its own phone places it properly on the road; elsewhere just for this check.
  if (!at.remote) at.placeAt(vi.trk.s - 2.6, vi.trk.d);
  else { const fr = r.track.frame(vi.trk.s, {}); at.yaw = Math.atan2(fr.tx, fr.tz); at.pos.set(vi.pos.x - Math.sin(at.yaw) * 2.6, vi.pos.y, vi.pos.z - Math.cos(at.yaw) * 2.6); }
  at.vel.set(0, 0, 0);
  if (!boost) return true;
  at.ramT = 1; vi.ramT = 0;
  return r.battle.ram(at, vi, 10);
}, [att, vic, boost]);
// Everyone hittable again (each phone clears its own karts).
const reset = (p) => p.evaluate(() => { for (const k of window.zoomies.race.karts) { k.ramCool = 0; if (!k.remote) { k.invuln = 0; k.spinTime = 0; k.shield = 0; k.starTime = 0; k.ramT = 0; } } });
let steals = 0, pops = 0, bad = 0, rams = 0, comebacks = 0;
const byKind = [0, 0, 0, 0]; // steals per kind of ram
for (let i = 0; i < 32; i++) {
  const ais = [...slots.ais];
  const cur = await owned();
  ais.sort((x, y) => (cur[y].out ? -9 : cur[y].b) - (cur[x].out ? -9 : cur[x].b));
  const kind = i % 4;
  let att, vic, onA = false, onB = false;
  if (kind === 0) { att = ais[1]; vic = slots.g; onA = true; } // AI rams the guest, seen by the host only
  else if (kind === 1) { att = slots.g; vic = ais[0]; onB = true; } // guest rams an AI, seen by the guest only
  else if (kind === 2) { att = slots.g; vic = ais[0]; onA = onB = true; } // seen by both phones at once
  else { att = ais[1]; vic = ais[0]; onA = true; } // AI rams AI
  if (att === undefined || vic === undefined || cur[vic].out || cur[vic].b < 2 || cur[att].out) continue;
  // The attacker's own phone moves it next to the victim first, so both phones agree where it is.
  await lineUp(att === slots.g ? B : A, att, vic, false);
  await reset(A); await reset(B);
  await settle(3);
  const before = await owned();
  rams++;
  if (onA) await lineUp(A, att, vic, true);
  if (onB) await lineUp(B, att, vic, true);
  await settle(8);
  const after = await owned();
  // Conservation: balloons gained never exceed balloons popped.
  let gained = 0, lost = 0;
  // (A racer coming back from being down gets its one balloon legitimately.)
  after.forEach((x, n) => {
    if (before[n].down && !x.out) { comebacks++; return; }
    const d = (x.out ? 0 : x.b) - (before[n].out ? 0 : before[n].b);
    if (d > 0) gained += d; else lost -= d;
  });
  if (gained === 1 && lost === 1) { steals++; byKind[kind]++; }
  else if (lost > 0 && !gained) pops++;
  if (gained > lost || after.some((x) => x.b > 6)) {
    bad++;
    errs.push(`ram ${i}: gained ${gained}, popped ${lost}`);
    console.log(`BAD ram ${i} kind ${kind}: total ${total(before)}->${total(after)}, gained ${gained}, popped ${lost}`);
  }
}
await settle(6);
const own = await owned(), seenA = await A.evaluate(() => window.zoomies.race.karts.map((k) => k.balloons)), seenB = await B.evaluate(() => window.zoomies.race.karts.map((k) => k.balloons));
const agree = own.every((x, i) => x.b === seenA[i] && x.b === seenB[i]);
if (!agree) errs.push('phones disagree on balloons after the ram stress');
// A host-seen ram on the guest and a guest-only ram on an AI must each move balloons.
if (!byKind[0] || !byKind[1]) errs.push(`missing steals: AI on guest ${byKind[0]}, guest on AI (guest only) ${byKind[1]}`);
console.log(`ram stress (lag 40ms): ${rams} rams, ${steals} steals, ${pops} pops without a steal, ${comebacks} comebacks, ${bad} bad (steals by kind ${byKind.join('/')}); phones agree: ${agree}`);
console.log('A', await st(A)); console.log('B', await st(B));
await A.evaluate(() => { for (const k of window.zoomies.race.karts) if (k.frozenAi) { k.ai = k.frozenAi; k.frozenAi = null; } });

// Comeback: the guest loses every balloon, is down (the host sees it), then
// comes back with one balloon and a few safe seconds.
await B.evaluate(() => { const p = window.zoomies.race.player; for (let i = 0; i < 8 && !p.out; i++) { p.invuln = 0; p.starTime = 0; p.shield = 0; p.hit('spin'); } });
await settle(4);
const downA = await A.evaluate(() => { const g = window.zoomies.race.karts.find((k) => k.remote); return `${g.down ? 'down' : g.out ? 'OUT' : 'in'} b${g.balloons}`; });
const downB = await B.evaluate(() => `${window.zoomies.race.player.down ? 'down' : 'not down'} hud="${document.getElementById('hud-lap').textContent}"`);
console.log(`guest down: host sees ${downA}; guest ${downB}`);
if (!downA.startsWith('down') || !downB.startsWith('down')) errs.push('guest did not go down');
await settle(55);
const backA = await A.evaluate(() => { const g = window.zoomies.race.karts.find((k) => k.remote); return `${g.down ? 'down' : g.out ? 'OUT' : 'in'} b${g.balloons}`; });
const backB = await B.evaluate(() => { const p = window.zoomies.race.player; return `${p.down ? 'down' : p.out ? 'OUT' : 'in'} b${p.balloons} safe=${p.invuln > 0}`; });
console.log(`guest after the wait: host sees ${backA}; guest ${backB}`);
if (backA !== 'in b1' || !backB.startsWith('in b1')) errs.push('guest did not come back with one balloon');
// Knock the guest out for good (the comeback is used), then all host AI: the
// host should end the battle and send results.
await B.evaluate(() => { const p = window.zoomies.race.player; for (let i = 0; i < 5 && !p.out; i++) { p.invuln = 0; p.starTime = 0; p.shield = 0; p.hit('spin'); } });
await settle();
console.log('guest out:'); console.log('A', await st(A)); console.log('B', await st(B));
await A.evaluate(() => {
  const r = window.zoomies.race;
  for (const k of r.karts) {
    if (k.remote || k.isPlayer) continue;
    k.comeback = true;
    if (k.down) r.battle._knockOut(k);
    for (let i = 0; i < 8 && !k.out; i++) { k.invuln = 0; k.starTime = 0; k.shield = 0; k.hit('spin'); }
  }
});
await settle(40);
await A.waitForTimeout(3600);
await settle(10);
console.log('A screen', await A.evaluate(() => `${window.zoomies.ui.current} ${window.zoomies.race && window.zoomies.race.state}`), '| B screen', await B.evaluate(() => `${window.zoomies.ui.current} ${window.zoomies.race && window.zoomies.race.state}`));
console.log('B results rows:', await B.evaluate(() => (window.zoomies.race.results || []).map((r) => `${r.place}.${r.ch.id}${r.isPlayer ? '*' : ''} b${r.balloons} h${r.hits}${r.out ? ' OUT' : ''}`).join(' | ')));
await A.evaluate(() => window.zoomies.race && window.zoomies.race.state === 'podium' && window.zoomies.race.endPodium());
await B.evaluate(() => window.zoomies.race && window.zoomies.race.state === 'podium' && window.zoomies.race.endPodium());
await A.waitForTimeout(800); await B.waitForTimeout(800);
await B.screenshot({ path: 'bat/mp-results-guest.png' });
console.log('B res title:', await B.textContent('#res-title'), '| A res title:', await A.textContent('#res-title'));
console.log('errors', errs.length);
await b.close();
