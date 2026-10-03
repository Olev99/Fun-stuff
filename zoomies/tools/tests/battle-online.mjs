import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 300 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('zoomies.settings.v1', JSON.stringify({ quality: 'low' })); } catch (e) {} });
const A = await ctx.newPage(), B = await ctx.newPage();
const errs = [];
for (const [n, p] of [['A', A], ['B', B]]) {
  p.on('pageerror', e => { errs.push(e.message); console.log(`[${n} pageerror]`, e.message, e.stack?.slice(0, 500)); });
}
const url = 'http://localhost:8000/index.html?net=local&lag=40';
await A.goto(url); await B.goto(url);
for (const p of [A, B]) await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
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
for (let i = 0; i < 80; i++) {
  const sa = await tick(A, 6); const sb = await tick(B, 6);
  await A.waitForTimeout(60);
  if (sa.startsWith('mp race') && sb.startsWith('mp race') && parseFloat(sa.split(' ')[2]) > 3) break;
}
const st = (p) => p.evaluate(() => { const r = window.zoomies.race; return `${r.state} battle=${!!r.battle} t=${r.battle ? r.battle.timeLeft.toFixed(0) : '-'} ` + r.karts.map((k) => `${k.ch.id}${k.isPlayer ? '*' : ''}${k.remote ? 'R' : ''}:${k.out ? 'X' : k.balloons}`).join(' '); });
console.log('A', await st(A)); console.log('B', await st(B));
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await tick(A, 3); await tick(B, 3); await A.waitForTimeout(50); } };
// Host pops its own balloon; guest pops its own.
await A.evaluate(() => { const p = window.zoomies.race.player; p.invuln = 0; p.hit('spin'); });
await B.evaluate(() => { const p = window.zoomies.race.player; p.invuln = 0; p.hit('spin'); });
await settle();
console.log('after one pop each:'); console.log('A', await st(A)); console.log('B', await st(B));
await B.evaluate(() => { const p = window.zoomies.race.player; p.invuln = 0; p.spinTime = 0; });
await settle();
// Host's AI kart rams the guest with a chili: the guest should lose a balloon via a hit message.
const ram = await A.evaluate(() => {
  const r = window.zoomies.race; const g = r.karts.find((k) => k.remote); const ai = r.karts.find((k) => k.ai && !k.out);
  g.ramCool = 0; ai.ramT = 1; ai.yaw = Math.atan2(g.pos.x - ai.pos.x, g.pos.z - ai.pos.z);
  ai.pos.set(g.pos.x - Math.sin(ai.yaw) * 1.5, g.pos.y, g.pos.z - Math.cos(ai.yaw) * 1.5);
  const before = ai.balloons; const ok = r.battle.ram(ai, g, 10); return `ram ok=${ok} ai ${before}->${ai.balloons}`;
});
console.log(ram);
await B.evaluate(() => { window.zoomies.race.player.invuln = 0; });
await A.evaluate(() => { const r = window.zoomies.race; const g = r.karts.find((k) => k.remote); g.ramCool = 0; });
await settle();
console.log('after ram:'); console.log('A', await st(A)); console.log('B', await st(B));
// Knock the guest out, then all host AI: the host should end the battle and send results.
await B.evaluate(() => { const p = window.zoomies.race.player; for (let i = 0; i < 5 && !p.out; i++) { p.invuln = 0; p.starTime = 0; p.hit('spin'); } });
await settle();
console.log('guest out:'); console.log('A', await st(A)); console.log('B', await st(B));
await A.evaluate(() => { const r = window.zoomies.race; for (const k of r.karts) if (k.ai) for (let i = 0; i < 6 && !k.out; i++) { k.invuln = 0; k.starTime = 0; k.hit('spin'); } });
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
