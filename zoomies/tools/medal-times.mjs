// Measures a Hard computer racer's best Time Trial time on every track with
// the stock Zoom Classic, and prints the reference table for src/medals.js.
//   node tools/medal-times.mjs [runs=3] [trackIds,comma]
// Needs playwright-core (cd tests && npm install). Serves zoomies/ itself.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './tests/node_modules/playwright-core/index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = await readFile(join(root, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
await new Promise((ok) => srv.once('listening', ok));
const port = srv.address().port;

const runs = +process.argv[2] || 3;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 } })).newPage();
p.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text().slice(0, 300)));
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${port}/index.html`);
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
const ids = process.argv[3] ? process.argv[3].split(',') : await p.evaluate(async () => (await import('./src/tracks.js')).TRACKS.map((t) => t.id));
const out = {};
for (const tid of ids) {
  const times = await p.evaluate(async ({ tid, runs }) => {
    const app = window.zoomies;
    const { AIDriver, DIFFICULTY } = await import('./src/ai.js');
    const res = [];
    for (let i = 0; i < runs; i++) {
      app.startRace({ mode: 'tt', trackId: tid, reverse: false, player: 'mochi', speedClass: 'zoom', playerLoadout: { body: 'classic' } });
      app.paused = true; // we step the race ourselves
      const race = app.race;
      race.player.ai = new AIDriver(race.player, race, 1, DIFFICULTY.hard);
      for (let s = 0; s < 60 * 900 && !race.player.finished; s++) race.update(1 / 60);
      res.push(race.player.finished ? +race.player.finishTime.toFixed(2) : null);
    }
    return res;
  }, { tid, runs });
  const ok = times.filter((t) => t);
  out[tid] = ok.length ? Math.min(...ok) : null;
  console.error(tid, times.join(' '));
}
console.log(JSON.stringify(out, null, 1));
await b.close();
srv.close();
