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
    const st = r.karts.map((k) => `${k.ch.id}:${k.out ? 'X' : k.balloons}`).join(' ');
    if (st !== last) { log.push(`${r.raceTime.toFixed(1)} ${st}`); last = st; }
    if (r.battle.done && !r._doneAt) r._doneAt = n;
    if (r._doneAt && n - r._doneAt > 60 * 4) break;
  }
  const walls = r.karts.map((k) => `${k.ch.id} d=${k.trk.d.toFixed(1)} spd=${k.speed.toFixed(1)}`);
  return { n, state: r.state, time: r.raceTime.toFixed(1), log: log.slice(0, 40), rows: r.battle.rows && r.battle.rows.map((x) => `${x.place}.${x.ch.id}${x.isPlayer ? '*' : ''} 🎈${x.balloons} hits ${x.hits}${x.out ? ' OUT' : ''}`), used, walls };
}, ID);
console.log(JSON.stringify(out, null, 1));
console.log('errors', errs.length);
await b.close();
