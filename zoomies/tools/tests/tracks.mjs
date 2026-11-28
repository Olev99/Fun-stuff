import { chromium } from 'playwright-core';
import { CHROME_PATH } from './chrome.mjs';
const b = await chromium.launch({ executablePath: CHROME_PATH, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
// Per-track render budget (the worst of the two cameras), checked on every track and arena.
// main: draw calls of the main pass, shadow: of the shadow pass, tris: main-pass triangles.
// Set about 20% above the worst measured on 2026-11-28 (desktop viewport 852x393, so Quality
// Auto runs as Max, software GL): calls 310 (hopper; odyssey 309), shadow 73 (tidal-r),
// tris 586k (odyssey). The review's iPhone target is 250 / 120 / 600k; the two Epic tracks
// are over 250 calls at Max. Each run prints the worst again in its "worst" line.
const BUDGET = { main: 375, shadow: 90, tris: 705000 };
const p = await (await b.newContext({ viewport: { width: 852, height: 393 } })).newPage();
const errs = [];
p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 300)); });
await p.goto('http://localhost:' + (process.env.ZPORT || 8000) + '/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
const out = await p.evaluate(async (BUDGET) => {
  const { TRACKS } = await import('./src/tracks.js');
  const { ARENAS } = await import('./src/arenas.js');
  const a = window.zoomies; const res = [];
  const B = BUDGET, worst = { main: 0, shadow: 0, tris: 0 }; let bad = 0;
  for (const d of [...TRACKS, ...ARENAS]) for (const rev of d.arena ? [false] : [false, true]) {
    const t0 = performance.now();
    a.startRace({ mode: 'quick', trackId: d.id, reverse: rev, player: 'mochi', speedClass: 'zoom' });
    a.paused = true;
    const r = a.race; r.skipIntro = true;
    for (let i = 0; i < 60; i++) r.update(1 / 60);
    let tris = 0; r.scene.traverse((o) => { if (o.isMesh && o.geometry && o.visible) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    // Draw calls and triangles as the renderer counts them, from two fixed cameras: the start
    // (the race camera on the grid) and a road-level view at half distance looking ahead.
    const R = a.renderer, cam = r.camera, mid = cam.clone(), V = cam.position.constructor;
    mid.position.copy(r.track.pointAt(r.track.length * 0.5, 0, new V())).y += 4;
    mid.lookAt(r.track.pointAt(r.track.length * 0.5 + 25, 0, new V()).add(new V(0, 1, 0)));
    // three.js counts a draw before it hands it to GL, so the GL draws are skipped while
    // counting (software GL would take minutes to rasterise them).
    const gl = R.getContext(), DRAWS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'], keep = DRAWS.map((f) => gl[f]);
    for (const f of DRAWS) gl[f] = () => {};
    const meas = [];
    for (const c of [cam, mid]) {
      const pass = (sh) => { R.shadowMap.autoUpdate = R.shadowMap.needsUpdate = sh; R.info.reset(); R.render(r.scene, c); return { ...R.info.render }; };
      const all = pass(true), main = pass(false);
      meas.push({ main: main.calls, shadow: all.calls - main.calls, tris: main.triangles });
    }
    R.shadowMap.autoUpdate = true;
    DRAWS.forEach((f, i) => { gl[f] = keep[i]; });
    const m = { main: Math.max(...meas.map((x) => x.main)), shadow: Math.max(...meas.map((x) => x.shadow)), tris: Math.max(...meas.map((x) => x.tris)) };
    const over = Object.keys(B).filter((k) => m[k] > B[k]);
    res.push(`${over.length ? 'FAIL over budget (' + over.join(', ') + ') ' : ''}${d.id}${rev ? '-r' : '  '} build ${(performance.now() - t0).toFixed(0)}ms len ${r.track.length.toFixed(0)} tris ${(tris / 1000).toFixed(0)}k · drawn: calls ${m.main} shadow ${m.shadow} tris ${(m.tris / 1000).toFixed(0)}k`);
    worst.main = Math.max(worst.main, m.main); worst.shadow = Math.max(worst.shadow, m.shadow); worst.tris = Math.max(worst.tris, m.tris);
    if (over.length) bad++;
  }
  res.push(`worst: calls ${worst.main} shadow ${worst.shadow} tris ${(worst.tris / 1000).toFixed(0)}k · budget calls ${B.main} shadow ${B.shadow} tris ${(B.tris / 1000).toFixed(0)}k · over budget ${bad}`);
  return { text: res.join('\n'), bad };
}, BUDGET);
console.log(out.text); console.log('errors', errs.length + out.bad);
await b.close();
