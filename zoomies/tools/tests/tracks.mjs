import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 } })).newPage();
const errs = [];
p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 300)); });
await p.goto('http://localhost:8000/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
const out = await p.evaluate(async () => {
  const { TRACKS } = await import('./src/tracks.js');
  const { ARENAS } = await import('./src/arenas.js');
  const a = window.zoomies; const res = [];
  for (const d of [...TRACKS, ...ARENAS]) for (const rev of d.arena ? [false] : [false, true]) {
    const t0 = performance.now();
    a.startRace({ mode: 'quick', trackId: d.id, reverse: rev, player: 'mochi', speedClass: 'zoom' });
    a.paused = true;
    const r = a.race; r.skipIntro = true;
    for (let i = 0; i < 60; i++) r.update(1 / 60);
    let tris = 0; r.scene.traverse((o) => { if (o.isMesh && o.geometry && o.visible) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    res.push(`${d.id}${rev ? '-r' : '  '} build ${(performance.now() - t0).toFixed(0)}ms len ${r.track.length.toFixed(0)} tris ${(tris / 1000).toFixed(0)}k`);
  }
  return res.join('\n');
});
console.log(out); console.log('errors', errs.length);
await b.close();
