import { chromium } from 'playwright-core';
import { CHROME_PATH } from './chrome.mjs';
const out = 'items'; const fs = await import('fs'); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME_PATH, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 852, height: 393 } });
const errs = [];
p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 600)); });
p.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) { errs.push(m.text()); console.log('[err]', m.text().slice(0, 300)); } });
await p.goto('http://localhost:' + (process.env.ZPORT || 8000) + '/index.html');
await p.waitForTimeout(3500);
const log = await p.evaluate(async () => {
  const { ITEMS } = await import('./src/items.js');
  const fails = [];
  const a = window.zoomies;
  a.startRace({ mode: 'quick', trackId: 'sprout', reverse: false, player: 'mochi', speedClass: 'zoom' });
  a.paused = true;
  const r = a.race; r.skipIntro = true;
  const AI = r.karts.find((k) => k.ai).ai.constructor;
  r.player.ai = new AI(r.player, r, 1, r.diff);
  for (let i = 0; i < 60 * 12; i++) r.update(1 / 60);
  const out = [];
  const k = r.player;
  // want: 'p' a projectile must fly, 'h' a hazard must land (fails if the item stops doing its job).
  const test = (it, aim, frames = 90, want = '') => {
    const hitsBefore = r.karts.map((o) => o.spinTime > 0 ? 1 : 0);
    const n0 = r.items.projectiles.length, h0 = r.items.hazards.length;
    r.items.use(k, it, null, aim);
    let maxP = r.items.projectiles.length, maxH = r.items.hazards.length, spins = 0, slips = 0;
    for (let i = 0; i < frames; i++) { r.update(1 / 60); maxP = Math.max(maxP, r.items.projectiles.length); maxH = Math.max(maxH, r.items.hazards.length); spins += r.karts.filter((o) => o.spinTime > 0).length; slips += r.karts.filter((o) => o.slipTime > 0).length; }
    if (want === 'p' && !(maxP > n0)) fails.push(`${it} aim=${aim} threw nothing`);
    if (want === 'h' && !(maxH > h0)) fails.push(`${it} aim=${aim} dropped nothing`);
    out.push(`${it} aim=${aim}: projectiles ${n0}->${maxP} hazards ${h0}->${maxH} kart-frames spinning=${spins} slipping=${slips} fx=${r.items.effects.length}`);
  };
  test('bomb', 1, 150, 'p'); test('bomb', -1, 150, 'p'); test('oil', -1, 90, 'h'); test('oil', 1, 120, 'p'); test('honey', 1, 120, 'p'); test('firework', 1, 90, 'p'); test('firework', -1);
  test('ball', -1, 90, 'p'); test('boomerang', -1, 90, 'p'); test('twister', 0, 200); test('horn', 0, 30); test('pogo', 0, 90); test('mirror', 0, 60); test('freeze', 1, 120); test('freeze', -1, 120); test('drum', 0, 60); test('gems', 0, 90);
  r.items.use(k, 'ghost'); const g0 = k.ghostTime; for (let i = 0; i < 60 * 5.5; i++) r.update(1 / 60);
  out.push(`ghost: t0=${g0} after=${k.ghostTime.toFixed(2)} item=${k.item || k.pendingItem} rolling=${k.rolling.toFixed(2)}`);
  // Every item: hand it to the player the normal way (one in hand), use it, run a second.
  for (const id of Object.keys(ITEMS)) {
    k.spinTime = 0; k.rolling = 0; k.item = id; k.itemCount = 1;
    let got = null;
    try { got = r.items.use(k); for (let i = 0; i < 60; i++) r.update(1 / 60); } catch (e) { fails.push(`${id} threw ${e.message}`); continue; }
    if (got !== id) fails.push(`${id} could not be used (got ${got})`);
  }
  out.push(`every item used: ${Object.keys(ITEMS).length}`);
  // AI usage over a longer race
  const used = {};
  const orig = r.items.use.bind(r.items);
  r.items.use = (kk, f, rs, aim) => { const it = orig(kk, f, rs, aim); if (it && !f) used[`${it}${aim ? (aim > 0 ? '+' : '-') : ''}`] = (used[`${it}${aim ? (aim > 0 ? '+' : '-') : ''}`] || 0) + 1; return it; };
  for (let i = 0; i < 60 * 60; i++) r.update(1 / 60);
  out.push('AI used: ' + JSON.stringify(used));
  a.paused = false;
  for (const f of fails) out.push(`FAIL ${f}`);
  return out;
});
console.log(log.join('\n'));
for (const l of log) if (l.startsWith('FAIL')) errs.push(l);
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/race.png` });
console.log('errors', errs.length);
await b.close();
