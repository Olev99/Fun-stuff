import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true })).newPage();
const errs = [];
p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 300)); });
await p.goto('http://localhost:8000/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
await p.tap('#scr-title [data-go="quick"]');
await p.waitForTimeout(800);
await p.screenshot({ path: 'ui/chars-grid.png' });
await p.tap('#char-grid [data-id="gus"]'); await p.waitForTimeout(500);
await p.tap('#scr-char [data-go="next"]'); await p.waitForTimeout(400);
console.log('still on char after locked next:', await p.evaluate(() => !document.getElementById('scr-char').hidden));
await p.screenshot({ path: 'ui/chars-locked.png' });
// showroom montage of the new racers
const ids = ['fizz', 'boris', 'pebble'];
for (const id of ids) {
  await p.evaluate(async (id) => { const { charById } = await import('./src/characters.js'); const a = window.zoomies; a.showroom.setChar(charById(id), { body: 'classic' }); a.showroom.angle = 0.5; a.showroom.bounce = 0; }, id);
  await p.waitForTimeout(450);
  await p.screenshot({ path: `ui/char-${id}.png`, clip: { x: 0, y: 20, width: 400, height: 330 } });
}
// unlock by level -> race as gus
await p.evaluate(() => { const a = window.zoomies; a.career.racers.push('gus'); a.ui.charSelect(); });
await p.waitForTimeout(500);
await p.tap('#char-grid [data-id="gus"]'); await p.waitForTimeout(300);
await p.tap('#scr-char [data-go="next"]'); await p.waitForTimeout(500);
await p.tap('#scr-track [data-go="race"]'); await p.waitForTimeout(2500);
console.log('race:', await p.evaluate(() => { const r = window.zoomies.race; return r.player.ch.id + ' grid ' + r.karts.length + ': ' + r.karts.map((k) => k.ch.id).join(','); }));
console.log('errors', errs.length);
await b.close();
