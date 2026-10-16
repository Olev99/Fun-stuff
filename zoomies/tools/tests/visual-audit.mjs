// Visual audit (opt-in, not in quick or full): free-camera shots of the world outside the road.
//   node run.mjs visual-audit [trackids|all] [tag]
// Writes 8 shots per track/arena plus a 2x4 contact sheet to test-out/audit/ and prints
// renderer draw calls and triangles. A tag (e.g. before/after) goes into the file names;
// when tag is "after" and a "before" sheet exists, a stacked before/after sheet is made too.
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const arg = process.argv[2];
const tag = process.argv[3] || '';
const OUT = 'audit/';
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:8000/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
const all = await p.evaluate(async () => {
  const { TRACKS } = await import('./src/tracks.js'); const { ARENAS } = await import('./src/arenas.js');
  return [...TRACKS.map((d) => d.id), ...ARENAS.map((d) => d.id + ':a')];
});
const want = !arg || arg === 'all' ? null : arg.split(',');
const ids = all.filter((i) => !want || want.includes(i.split(':')[0]));
await p.addStyleTag({ content: '#ui,#hud{display:none!important}' });
const sfx = tag ? '_' + tag : '';
for (const idr of ids) {
  const [id, arena] = idr.split(':');
  const cams = await p.evaluate(async ({ id, arena }) => {
    const a = window.zoomies; a.paused = true;
    if (arena) { a.settings.arena = id; a.startFromMenu('battle'); } else a.startRace({ mode: 'quick', trackId: id, player: 'mochi', speedClass: 'zoom' });
    a.paused = true;
    const r = a.race; r.skipIntro = true; for (let i = 0; i < 60; i++) r.update(1 / 60);
    const tr = r.track; let cx = 0, cz = 0;
    for (let i = 0; i < tr.px.length; i++) { cx += tr.px[i]; cz += tr.pz[i]; } cx /= tr.px.length; cz /= tr.px.length;
    const fr = {}, out = [];
    for (let i = 0; i < 8; i++) {
      tr.frame(tr.length * (i + 0.5) / 8, fr);
      const side = i % 2 ? 1 : -1;
      let ox = fr.x - cx, oz = fr.z - cz; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const y0 = tr.heightAtFrame(fr, 0), t = i % 4; let pos, look;
      if (t === 0) { pos = [fr.x + fr.rx * side * fr.wd * 0.9, y0 + 2.2, fr.z + fr.rz * side * fr.wd * 0.9]; look = [pos[0] + side * fr.rx * 100, pos[1] + 1, pos[2] + side * fr.rz * 100]; } // road edge, looking out
      else if (t === 1) { pos = [fr.x + ox * 6, y0 + 45, fr.z + oz * 6]; look = [pos[0] + ox * 300, y0 + 25, pos[2] + oz * 300]; } // high, to the horizon
      else if (t === 2) { pos = [fr.x, y0 + 1.3, fr.z]; look = [fr.x + fr.rx * side * fr.wd * 1.4 + fr.tx * 8, y0 + 1.5, fr.z + fr.rz * side * fr.wd * 1.4 + fr.tz * 8]; } // at the wall
      else { pos = [fr.x + fr.rx * side * (fr.wd + 4), y0 + 8, fr.z + fr.rz * side * (fr.wd + 4)]; look = [pos[0] + side * fr.rx * 60, y0 - 4, pos[2] + side * fr.rz * 60]; } // above the edge
      out.push({ pos, look });
    }
    return out;
  }, { id, arena });
  let info;
  for (let i = 0; i < cams.length; i++) {
    info = await p.evaluate((c) => {
      const a = window.zoomies, r = a.race; r.camera.position.set(...c.pos); r.camera.lookAt(...c.look); r.camera.fov = 70; r.camera.updateProjectionMatrix();
      r.camera.updateMatrixWorld(); r.world.update(0.0001, r.camera, r.camera.position);
      const ri = a.renderer.info; ri.autoReset = false; ri.reset(); a.renderer.render(r.scene, r.camera); const s = { calls: ri.render.calls, tris: ri.render.triangles }; ri.autoReset = true;
      if (a.post && a.post.active) a.post.render(r.scene, r.camera, r.grade || a.view.grade, 0); else a.renderer.render(r.scene, r.camera);
      return s;
    }, cams[i]);
    await p.screenshot({ path: `${OUT}${id}${sfx}_${i}.png` });
  }
  console.log(id, tag, 'calls', info.calls, 'tris', info.tris); // numbers of the last shot
  // contact sheet 2x4, composed in the page from the PNGs
  const imgs = [];
  for (let i = 0; i < 8; i++) imgs.push((await readFile(`${OUT}${id}${sfx}_${i}.png`)).toString('base64'));
  const prev = tag === 'after' && existsSync(`${OUT}${id}_before_sheet.png`) ? (await readFile(`${OUT}${id}_before_sheet.png`)).toString('base64') : null;
  const sheets = await p.evaluate(async ({ imgs, prev }) => {
    const load = (b64) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = 'data:image/png;base64,' + b64; });
    const W = 426, H = 197, c = document.createElement('canvas'); c.width = W * 4; c.height = H * 2; const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) g.drawImage(await load(imgs[i]), (i % 4) * W, Math.floor(i / 4) * H, W, H);
    const sheet = c.toDataURL('image/png').split(',')[1]; let both = null;
    if (prev) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height * 2; const h = d.getContext('2d'); h.drawImage(await load(prev), 0, 0); h.drawImage(c, 0, c.height); both = d.toDataURL('image/png').split(',')[1]; }
    return { sheet, both };
  }, { imgs, prev });
  await writeFile(`${OUT}${id}${sfx}_sheet.png`, Buffer.from(sheets.sheet, 'base64'));
  if (sheets.both) await writeFile(`${OUT}${id}_before_after.png`, Buffer.from(sheets.both, 'base64'));
}
await b.close();
