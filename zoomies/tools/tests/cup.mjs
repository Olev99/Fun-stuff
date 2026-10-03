import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message, e.stack?.slice(0, 500)));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) console.log('[err]', m.text()); });
await p.goto('http://localhost:8000/index.html');
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
  if (i < 3) { await p.tap('#res-buttons [data-go="next"]'); await p.waitForTimeout(500); }
  else { await p.screenshot({ path: 'gp-race4.png' }); await p.tap('#res-buttons [data-go="final"]'); await p.waitForTimeout(1500); await p.screenshot({ path: 'gp-podium.png' }); console.log('podium:', await p.evaluate(() => [window.zoomies.race.state, document.getElementById('pod-title').textContent, document.getElementById('pod-names').textContent].join(' | '))); await p.tap('#podium-ui'); await p.waitForTimeout(800); await p.screenshot({ path: 'gp-final.png' }); }
}
await p.tap('#res-buttons [data-go="menu"]'); await p.waitForTimeout(800);
console.log('back at title:', await p.isVisible('#scr-title'));
await b.close();
