import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 300 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('zoomies.settings.v1', JSON.stringify({ quality: 'low' })); } catch (e) {} });
const A = await ctx.newPage(), B = await ctx.newPage();
for (const [n, p] of [['A', A], ['B', B]]) {
  p.on('pageerror', e => console.log(`[${n} pageerror]`, e.message, e.stack?.slice(0, 400)));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) console.log(`[${n}]`, m.text().slice(0, 300)); });
}
const url = 'http://localhost:8000/index.html?net=local&lag=40';
await A.goto(url); await B.goto(url);
for (const p of [A, B]) await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
await A.tap('[data-go="mp"]'); await A.waitForTimeout(400);
await A.tap('#scr-lobby [data-go="host"]'); await A.waitForTimeout(1200);
const code = await A.textContent('#room-code');
console.log('room code', code);
await B.tap('[data-go="mp"]'); await B.waitForTimeout(400);
await B.fill('#join-code', code);
await B.tap('#scr-lobby [data-go="join"]'); await B.waitForTimeout(1500);
console.log('A players:', await A.$$eval('#lobby-players .pl:not(.empty)', els => els.map(e => e.textContent)));
console.log('B players:', await B.$$eval('#lobby-players .pl:not(.empty)', els => els.map(e => e.textContent)));
// guest changes racer
await B.tap('#scr-lobby [data-go="char"]'); await B.waitForTimeout(800);
await B.tap('#char-grid .card:nth-child(7)'); await B.waitForTimeout(300);
await B.tap('#scr-char [data-go="next"]'); await B.waitForTimeout(1000);
await A.tap('#lobby-settings [data-lb="track-next"]'); await A.waitForTimeout(800);
console.log('A players after pick:', await A.$$eval('#lobby-players .pl:not(.empty)', els => els.map(e => e.textContent)));
await A.screenshot({ path: 'mp-lobby-host.png' });
await B.screenshot({ path: 'mp-lobby-guest.png' });
await A.tap('#scr-lobby [data-go="start"]');
// Step both games by hand (headless rendering is far too slow for real time here).
const tick = (p, n) => p.evaluate((n) => { const a = window.zoomies; a.paused = true; for (let i = 0; i < n; i++) if (a.race) a.race.update(1 / 30); return a.race ? a.race.mode + ' ' + a.race.state + ' ' + a.race.raceTime.toFixed(1) : '-'; }, n);
for (let i = 0; i < 60; i++) {
  const sa = await tick(A, 6); const sb = await tick(B, 6);
  await A.waitForTimeout(60);
  if (i % 10 === 0) console.log('tick', sa, '|', sb);
  if (sa.startsWith('mp race') && parseFloat(sa.split(' ')[2]) > 3) break;
}
const st = async (p) => p.evaluate(() => { const r = window.zoomies.race; return { mode: r.mode, state: r.state, rt: r.raceTime.toFixed(1), slot: r.mySlot, me: r.player.ch.id, karts: r.karts.map(k => `${k.ch.id}${k.isPlayer ? '*' : ''}${k.remote ? 'R' : ''}${k.ai ? 'A' : ''}:${k.total.toFixed(0)}/${k.place}`).join(' ') }; });
console.log('A', JSON.stringify(await st(A)));
console.log('B', JSON.stringify(await st(B)));
await A.screenshot({ path: 'mp-race-host.png' });
await B.screenshot({ path: 'mp-race-guest.png' });
// Guest uses a ball; host should spawn it
await B.evaluate(() => { const k = window.zoomies.race.player; k.item = 'honey'; k.itemCount = 1; window.zoomies.race.items.use(k); });
await A.waitForTimeout(1500);
console.log('A hazards:', await A.evaluate(() => window.zoomies.race.items.hazards.map(p => p.type + ' owner=' + (p.owner && p.owner.ch.id))));
console.log('B hazards:', await B.evaluate(() => window.zoomies.race.items.hazards.map(p => p.type + ' owner=' + (p.owner && p.owner.ch.id))));
console.log('A', JSON.stringify(await st(A)));
console.log('B', JSON.stringify(await st(B)));
// finish both quickly
for (const p of [B, A]) await p.evaluate(() => { const r = window.zoomies.race; const k = r.player; k.laps = r.laps; r._checkLap(k); });
for (let i = 0; i < 80; i++) { await tick(A, 6); await tick(B, 6); await A.waitForTimeout(120); if (await B.evaluate(() => window.zoomies.ui.current === 'results')) break; }
console.log('A screen:', await A.evaluate(() => window.zoomies.ui.current), 'B screen:', await B.evaluate(() => window.zoomies.ui.current));
console.log('A results:', await A.$$eval('#res-body .res', els => els.map(e => e.textContent.replace(/\s+/g, ' ')).slice(0, 8)));
console.log('B results:', await B.$$eval('#res-body .res', els => els.map(e => e.textContent.replace(/\s+/g, ' ')).slice(0, 8)));
await B.screenshot({ path: 'mp-results-guest.png' });
await A.tap('#res-buttons [data-go="lobby"]'); await A.waitForTimeout(1500);
console.log('after lobby: A', await A.evaluate(() => window.zoomies.ui.current), 'B', await B.evaluate(() => window.zoomies.ui.current));
// host leaves: guest should be notified
await A.tap('#scr-lobby [data-go="leave"]'); await A.waitForTimeout(1500);
console.log('guest after host left:', await B.evaluate(() => window.zoomies.ui.current), await B.textContent('#lobby-error'));
await b.close();
