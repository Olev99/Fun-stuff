// How hard is the Legends League? Runs the League's races and duels headlessly
// with a computer-driven player (no parts, a given kart) and prints where it
// finishes, so the AI strength per season can be sanity checked.
//
//   node zoomies/tools/league-sim.mjs [--bodies buggy,classic,bolt] [--n 3] [--events boss|races|all] [--only L1-6,L2-1]
//
// The player runs at the top of the Normal skill range, like tools/balance.mjs,
// so a human with a decent Workshop build should beat this. Needs playwright-core
// (cd tests && npm install). Serves zoomies/ itself on a free port.
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

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const bodies = arg('bodies', 'buggy,classic,bolt').split(',');
const n = +arg('n', 3);
const which = arg('events', 'boss');
const only = arg('only', '').split(',').filter(Boolean);

const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 } })).newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${srv.address().port}/index.html`);
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 60000 });

const list = await p.evaluate(async ([which, only]) => {
  const { LEAGUE } = await import('./src/league.js');
  return LEAGUE.flatMap((s) => s.events.filter((e) => ['race', 'duel'].includes(e.type) && (only.length ? only.includes(e.id) : which === 'all' || (which === 'boss' ? e.boss : e.type === 'race' || e.boss))).map((e) => ({ id: e.id, season: s.id, title: e.title, type: e.type, goal: e.goal || 1, boss: !!e.boss })));
}, [which, only]);

console.log(`Idle computer-driven player, no parts, ${n} runs per event and kart (place 1 = wins). Goal = the place needed to pass.\n`);
console.log('event   kind   goal  ' + bodies.map((x) => x.padEnd(22)).join(''));
for (const ev of list) {
  const row = [];
  for (const body of bodies) {
    const places = [];
    for (let i = 0; i < n; i++) {
      const r = await p.evaluate(async ({ id, body, seed }) => {
        let st = seed >>> 0;
        Math.random = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const app = window.zoomies;
        const { AIDriver } = await import('./src/ai.js');
        app.gp = null;
        app.career.body = body;
        if (!app.career.bodies.includes(body)) app.career.bodies.push(body);
        app.career.loadouts = {};
        app.paused = true;
        app.startCareerEvent(id);
        app.paused = true;
        const race = app.race;
        race.skipIntro = true;
        race.results = [];
        race.player.ai = new AIDriver(race.player, race, 0.95, race.diff);
        let steps = 0;
        const ks = race.karts;
        while (steps++ < 60 * 600 && !ks.every((k) => k.finished)) race.update(1 / 60);
        const order = [...ks].sort((a, c) => (a.finishTime || 1e9) - (c.finishTime || 1e9));
        return order.findIndex((k) => k.isPlayer) + 1;
      }, { id: ev.id, body, seed: 1000 + i * 77 + body.length });
      places.push(r);
    }
    row.push(`${places.join(',')}`.padEnd(22));
  }
  console.log(ev.id.padEnd(8) + (ev.boss ? 'boss  ' : ev.type.padEnd(6)) + String(ev.goal).padEnd(6) + row.join(''), ev.title);
}
await b.close();
srv.close();
