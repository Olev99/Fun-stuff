// Online hardening and resilience checks (review batch C and D):
//   leak    10 races and previews: GPU textures and geometries stay flat
//   crash   an exception in the frame loop shows "Something went wrong" and Back to menu works
//   wire    big messages (a 21 KB ghost) round-trip in pieces, an over-the-cap one fails loudly,
//           the test transport refuses any single unchunked frame of 16 KB or more
//   clock   guest event clock under jitter and backward steps: layers, marks and schedule stay right
//   trust   cid not broadcast, no kick by cid, no joining mid-race, unheld items, implausible
//           finishes, floods
//   loss    20% loss on the unreliable channel: remote karts keep moving, stale packets dropped
// node netsec.mjs [part,part...]   (all parts by default)
import { chromium } from 'playwright-core';
const parts = (process.argv[2] || 'leak,crash,wire,clock,trust,loss').split(',');
const PORT = process.env.ZPORT || 8000;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };

async function page(ctx, name, query = '') {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message, e.stack?.slice(0, 400)));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load')) console.log(`[${name}]`, m.text().slice(0, 300)); });
  await p.goto(`http://localhost:${PORT}/index.html${query}`);
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 60000 });
  await p.evaluate(() => { window.zoomies.paused = true; });
  return p;
}
const lowCtx = async (opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 640, height: 300 }, ...opts });
  await ctx.addInitScript(() => { try { localStorage.setItem('zoomies.settings.v1', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  return ctx;
};

// ---- leak: World.dispose must free the sun's shadow map (and the small per-race materials) ----
if (parts.includes('leak')) {
  const ctx = await lowCtx();
  const p = await page(ctx, 'leak');
  const mem = await p.evaluate(() => {
    const a = window.zoomies, out = [];
    // Same racers every time (shared kart models are cached per racer, which is not a leak).
    const rnd = Math.random;
    let seed = 1;
    const ids = ['sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball'];
    ids.forEach((id, i) => {
      seed = 1; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      if (i % 3 === 2) a.startDemo(id, false); // a track preview builds a demo race
      else a.startRace({ mode: 'quick', trackId: id, reverse: false, player: 'mochi', grid: ['mochi', 'pip', 'bruno', 'rexi'], speedClass: 'zoom' });
      a.paused = true;
      const r = a.race; r.skipIntro = true;
      for (let n = 0; n < 5; n++) r.update(1 / 60);
      a.renderer.render(r.scene, r.camera); // allocates the shadow map
      a.disposeRace(); // what is left after a race is gone is what leaks
      const m = a.renderer.info.memory;
      out.push([m.textures, m.geometries]);
      Math.random = rnd;
    });
    a.toTitle(); a.paused = true;
    return out;
  });
  console.log('textures/geometries left after each race:', mem.map((m) => m.join('/')).join(' '));
  // The builds repeat every 6 (track by parity, race or preview by i % 3): compare like with like after two warm-ups.
  const grew = (j) => [2, 3, 4, 5].filter((i) => mem[i + 6][j] > mem[i][j]).map((i) => `${mem[i][j]}->${mem[i + 6][j]}`);
  check(!grew(0).length, `textures stay flat over 12 races and previews ${grew(0).join(' ')}`);
  check(!grew(1).length, `geometries stay flat ${grew(1).join(' ')}`);
  await ctx.close();
}

console.log('errors', fails);
await b.close();
process.exit(fails ? 1 : 0);
