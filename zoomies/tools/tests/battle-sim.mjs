import { chromium } from 'playwright-core';
const ID = process.argv[2] || 'barnyard';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 600)); });
await p.goto('http://localhost:8000/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
// Headless: let the player be driven by the battle AI, run a whole battle in sim time.
const out = await p.evaluate(async (id) => {
  const a = window.zoomies;
  a.settings.arena = id;
  a.startFromMenu('battle');
  const r = a.race; r.skipIntro = true; a.paused = true;
  const { BattleAI } = await import('./src/battle.js');
  r.player.ai = new BattleAI(r.player, r, 0.9, r.diff);
  const log = [];
  let n = 0, last = '';
  const used = {};
  const orig = r.items.use.bind(r.items);
  r.items.use = (kk, f, rs, aim) => { const it = orig(kk, f, rs, aim); if (it && !f) used[it] = (used[it] || 0) + 1; return it; };
  while (!r.results && n < 60 * 200) {
    r.update(1 / 60); n++;
    // D: down and waiting for the comeback, X: out for good.
    const st = r.karts.map((k) => `${k.ch.id}:${k.down ? 'D' : k.out ? 'X' : k.balloons}`).join(' ');
    if (st !== last) { log.push(`${r.raceTime.toFixed(1)} ${st}`); last = st; }
    if (r.battle.done && !r._doneAt) r._doneAt = n;
    if (r._doneAt && n - r._doneAt > 60 * 4) break;
  }
  const walls = r.karts.map((k) => `${k.ch.id} d=${k.trk.d.toFixed(1)} spd=${k.speed.toFixed(1)}`);
  return { n, state: r.state, time: r.raceTime.toFixed(1), log: log.slice(0, 40), rows: r.battle.rows && r.battle.rows.map((x) => `${x.place}.${x.ch.id}${x.isPlayer ? '*' : ''} 🎈${x.balloons} hits ${x.hits}${x.out ? ' OUT' : ''}`), used, walls };
}, ID);
console.log(JSON.stringify(out, null, 1));
// The comeback HUD: pop all the player's balloons in a fresh battle, then
// watch the countdown and the comeback in real time.
await p.evaluate(() => {
  const a = window.zoomies;
  a.startFromMenu('battle');
  const r = a.race; r.skipIntro = true; a.paused = true;
  for (let i = 0; i < 60 * 5 && r.state !== 'race'; i++) r.update(1 / 60);
  for (let i = 0; i < 60; i++) r.update(1 / 60);
  const k = r.player;
  for (let i = 0; i < 8 && !k.out; i++) { k.invuln = 0; k.starTime = 0; k.shield = 0; k.hit('spin'); }
  a.paused = false;
});
// Hold the banner where it is fully shown, however slow the machine is.
const holdBanner = () => p.evaluate(() => { window.zoomies.paused = true; for (const an of document.getElementById('hud-banner').getAnimations()) { an.pause(); an.currentTime = 700; } });
await p.waitForTimeout(1500);
await holdBanner();
console.log('down:', await p.evaluate(() => `${window.zoomies.race.player.down ? 'down' : 'not down'} hud="${document.getElementById('hud-lap').textContent}"`));
await p.screenshot({ path: 'bat/comeback-down.png', timeout: 120000 });
await p.evaluate(() => {
  const a = window.zoomies, r = a.race;
  a.paused = true;
  for (let i = 0; i < 60 * 8 && r.player.out; i++) r.update(1 / 60);
  a.paused = false;
});
await p.waitForTimeout(500);
await holdBanner();
console.log('back:', await p.evaluate(() => { const k = window.zoomies.race.player; return `balloons ${k.balloons} safe ${k.invuln.toFixed(1)}s banner="${document.getElementById('hud-banner').textContent}"`; }));
await p.screenshot({ path: 'bat/comeback.png', timeout: 120000 });
console.log('errors', errs.length);
await b.close();
