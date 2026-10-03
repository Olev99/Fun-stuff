import { chromium } from 'playwright-core';
const out = 'items'; const fs = await import('fs'); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 852, height: 393 } });
const errs = [];
p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 600)); });
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) { errs.push(m.text()); console.log('[err]', m.text().slice(0, 300)); } });
await p.goto('http://localhost:8000/index.html');
await p.waitForTimeout(3500);
const log = await p.evaluate(() => {
  const a = window.zoomies;
  a.startRace({ mode: 'quick', trackId: 'sprout', reverse: false, player: 'mochi', speedClass: 'zoom' });
  a.paused = true;
  const r = a.race; r.skipIntro = true;
  const AI = r.karts.find((k) => k.ai).ai.constructor;
  r.player.ai = new AI(r.player, r, 1, r.diff);
  for (let i = 0; i < 60 * 12; i++) r.update(1 / 60);
  const out = [];
  const k = r.player;
  const test = (it, aim, frames = 90) => {
    const hitsBefore = r.karts.map((o) => o.spinTime > 0 ? 1 : 0);
    const n0 = r.items.projectiles.length, h0 = r.items.hazards.length;
    r.items.use(k, it, null, aim);
    let maxP = r.items.projectiles.length, maxH = r.items.hazards.length, spins = 0, slips = 0;
    for (let i = 0; i < frames; i++) { r.update(1 / 60); maxP = Math.max(maxP, r.items.projectiles.length); maxH = Math.max(maxH, r.items.hazards.length); spins += r.karts.filter((o) => o.spinTime > 0).length; slips += r.karts.filter((o) => o.slipTime > 0).length; }
    out.push(`${it} aim=${aim}: projectiles ${n0}->${maxP} hazards ${h0}->${maxH} kart-frames spinning=${spins} slipping=${slips} fx=${r.items.effects.length}`);
  };
  test('bomb', 1, 150); test('bomb', -1, 150); test('oil', -1); test('oil', 1, 120); test('honey', 1, 120); test('firework', 1); test('firework', -1);
  test('ball', -1); test('boomerang', -1); test('twister', 0, 200); test('horn', 0, 30); test('pogo', 0, 90); test('mirror', 0, 60); test('freeze', 1, 120); test('freeze', -1, 120); test('drum', 0, 60); test('gems', 0, 90);
  r.items.use(k, 'ghost'); const g0 = k.ghostTime; for (let i = 0; i < 60 * 5.5; i++) r.update(1 / 60);
  out.push(`ghost: t0=${g0} after=${k.ghostTime.toFixed(2)} item=${k.item || k.pendingItem} rolling=${k.rolling.toFixed(2)}`);
  // AI usage over a longer race
  const used = {};
  const orig = r.items.use.bind(r.items);
  r.items.use = (kk, f, rs, aim) => { const it = orig(kk, f, rs, aim); if (it && !f) used[`${it}${aim ? (aim > 0 ? '+' : '-') : ''}`] = (used[`${it}${aim ? (aim > 0 ? '+' : '-') : ''}`] || 0) + 1; return it; };
  for (let i = 0; i < 60 * 60; i++) r.update(1 / 60);
  out.push('AI used: ' + JSON.stringify(used));
  a.paused = false;
  return out;
});
console.log(log.join('\n'));
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/race.png` });
console.log('errors', errs.length);
await b.close();
