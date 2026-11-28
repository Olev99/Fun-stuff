import { chromium } from 'playwright-core';
import { CHROME_PATH } from './chrome.mjs';
const b = await chromium.launch({ executablePath: CHROME_PATH, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message, e.stack?.slice(0, 500)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) console.log('[err]', m.text()); });
await p.goto('http://localhost:' + (process.env.ZPORT || 8000) + '/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
await p.tap('[data-go="gp"]'); await p.waitForTimeout(800);
await p.tap('#scr-char [data-go="next"]'); await p.waitForTimeout(800);
await p.tap('#track-row .tcard:nth-child(2)'); await p.waitForTimeout(500);
await p.tap('#scr-track [data-go="race"]'); await p.waitForTimeout(800);
// pause/resume check
await p.tap('#btn-pause'); await p.waitForTimeout(400);
console.log('paused screen visible:', await p.isVisible('#scr-pause'));
await p.tap('#scr-pause [data-go="resume"]'); await p.waitForTimeout(300);
console.log('resumed:', await p.evaluate(() => !window.zoomies.paused));
const simRace = async () => p.evaluate(async () => {
  const app = window.zoomies; app.paused = true;
  const race = app.race; const { AIDriver } = await import('./src/ai.js');
  race.player.ai = new AIDriver(race.player, race, 0.97);
  let n = 0; while (!race.results && n++ < 60 * 300) race.update(1 / 60);
  app.paused = false;
  return { track: race.trackDef.id, rev: race.track.reverse, place: race.results.find(r => r.isPlayer).place, pts: { ...app.gp.points }, index: app.gp.index };
});
for (let i = 0; i < 4; i++) {
  const r = await simRace();
  console.log('race', i + 1, JSON.stringify(r));
  await p.waitForTimeout(400);
  const btns = await p.$$eval('#res-buttons [data-go]', els => els.map(e => e.dataset.go));
  console.log('  buttons', btns);
  if (i === 0) {
    // Resume cup: the standings survive a reload and the cup carries on with race 2.
    const before = await p.evaluate(() => JSON.stringify(window.zoomies.gp.points));
    await p.reload(); await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 }); await p.waitForTimeout(800);
    const vis = await p.isVisible('#scr-title .resume-btn');
    console.log('resume button after reload:', vis, await p.textContent('#menu-resume'));
    await p.screenshot({ path: 'gp-resume-title.png' });
    if (!vis) { console.log('FAIL no Resume cup button'); process.exitCode = 1; }
    await p.tap('#scr-title .resume-btn'); await p.waitForTimeout(800);
    const st = await p.evaluate(() => ({ index: window.zoomies.gp.index, pts: JSON.stringify(window.zoomies.gp.points), mode: window.zoomies.race.mode }));
    console.log('resumed:', JSON.stringify(st));
    if (st.index !== 1 || st.pts !== before || st.mode !== 'gp') { console.log('FAIL resume did not restore the cup'); process.exitCode = 1; }
  } else if (i < 3) { await p.tap('#res-buttons [data-go="next"]'); await p.waitForTimeout(500); }
  else { await p.screenshot({ path: 'gp-race4.png' }); await p.tap('#res-buttons [data-go="final"]'); await p.waitForTimeout(1500); await p.screenshot({ path: 'gp-podium.png' }); console.log('podium:', await p.evaluate(() => [window.zoomies.race.state, document.getElementById('pod-title').textContent, document.getElementById('pod-names').textContent].join(' | '))); await p.tap('#podium-ui'); await p.waitForTimeout(800); await p.screenshot({ path: 'gp-final.png' }); }
}
await p.tap('#res-buttons [data-go="menu"]'); await p.waitForTimeout(800);
console.log('back at title:', await p.isVisible('#scr-title'));
const noResume = !(await p.isVisible('#scr-title .resume-btn'));
console.log('no Resume cup after the final:', noResume);
if (!noResume) { console.log('FAIL the finished cup is still offered'); process.exitCode = 1; }
// The checks on a stored cup: too old, unknown ids, bad standings are all refused; Golden Wheel and final-standings resumes.
const chk = await p.evaluate(async () => {
  const { checkCup, loadCup } = await import('./src/cupsave.js');
  const app = window.zoomies, now = Date.now();
  const { CHARACTERS } = await import('./src/characters.js');
  const ids = CHARACTERS.map((c) => c.id).slice(0, 8);
  const pts = Object.fromEntries(ids.map((id) => [id, 3]));
  const good = { v: 1, t: now, kind: 'gp', id: 'sprout-cup', attempt: 0, next: 2, cls: 'zoom', player: ids[0], field: ids, points: pts, wins: 0, gems: 0 };
  const bad = {
    old: { ...good, t: now - 25 * 3600e3 }, future: { ...good, t: now + 3600e3 }, ver: { ...good, v: 2 }, cup: { ...good, id: 'nope' },
    next: { ...good, next: 9 }, cls: { ...good, cls: 'warp' }, racer: { ...good, field: [...ids.slice(1), 'evil'] }, dup: { ...good, field: [ids[0], ids[0]] },
    pts: { ...good, points: { ...pts, [ids[1]]: 1e9 } }, extra: { ...good, points: { ...pts, __proto__x: 1 } }, week: { ...good, kind: 'weekly', id: '1999-W01' },
    career: { ...good, kind: 'career', id: 'c7-b', attempt: 0 }, notcup: { ...good, kind: 'career', id: 'c1-1', attempt: 1 },
  };
  const out = { good: !!checkCup(good, now), refused: Object.entries(bad).filter(([, r]) => !checkCup(r, now)).map(([k]) => k).length, of: Object.keys(bad).length };
  localStorage.setItem('zoomies-cup-v1', '{"v":1,');
  out.junkDropped = loadCup() === null && localStorage.getItem('zoomies-cup-v1') === null;
  // Golden Wheel Cup, last race.
  const racer = app.career.racer;
  const gw = [racer, ...ids.filter((id) => id !== racer)].slice(0, 8);
  localStorage.setItem('zoomies-cup-v1', JSON.stringify({ ...good, kind: 'career', id: 'c7-b', attempt: 2, next: 3, player: racer, field: gw, points: Object.fromEntries(gw.map((id) => [id, 5])) }));
  app.toTitle();
  out.gwLabel = document.getElementById('menu-resume').textContent;
  app.resumeCup();
  out.gw = { mode: app.race.mode, track: app.race.trackDef.id, index: app.gp.index, ev: app.gp.careerEv && app.gp.careerEv.id, attempt: app.careerRun && app.careerRun.attempt };
  app.quitRace();
  out.quitCleared = localStorage.getItem('zoomies-cup-v1') === null;
  // A cup saved after its last race resumes straight into the final standings.
  localStorage.setItem('zoomies-cup-v1', JSON.stringify({ ...good, next: 4 }));
  app.toTitle();
  app.resumeCup();
  await new Promise((r) => setTimeout(r, 300));
  out.final = document.getElementById('res-title').textContent;
  out.finalCleared = localStorage.getItem('zoomies-cup-v1') === null;
  return out;
});
console.log('cup save checks:', JSON.stringify(chk));
if (!chk.good || chk.refused !== chk.of || !chk.junkDropped || chk.gw.track !== 'neon' || chk.gw.index !== 3 || chk.gw.ev !== 'c7-b' || chk.gw.attempt !== 2 || !chk.quitCleared || chk.final !== 'Final standings' || !chk.finalCleared) {
  console.log('FAIL cup save checks'); process.exitCode = 1;
}
await b.close();
