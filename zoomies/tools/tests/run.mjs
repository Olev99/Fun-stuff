// Runs the headless browser tests and prints a pass/fail summary.
//
//   cd zoomies/tools/tests && npm install      (once: playwright-core)
//   node run.mjs              quick suites (about 5 minutes)
//   node run.mjs full         every suite (about 25 minutes)
//   node run.mjs battle-sim crater   one suite, with its own arguments
//
// It serves zoomies/ on http://localhost:8000 (or uses a server already
// running there) and runs each script in zoomies/test-out/, where the
// screenshots land. A suite fails on a non-zero exit, a page error or a
// non-zero "errors N" line.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(root, 'test-out');

const SUITES = {
  // name: [script, args, timeout minutes]
  tracks: ['tracks.mjs', [], 6],
  'battle-sim': ['battle-sim.mjs', ['pinball'], 8],
  items: ['items.mjs', [], 5],
  picker: ['picker.mjs', [], 5],
  'race-sim': ['race-sim.mjs', ['sprout,odyssey'], 15],
  career: ['career.mjs', [], 8],
  cup: ['cup.mjs', [], 10],
  racers: ['racers.mjs', [], 6],
  'battle-online': ['battle-online.mjs', [], 10],
  online: ['online.mjs', [], 10],
  shortcuts: ['shortcuts.mjs', [], 25],
};
const QUICK = ['tracks', 'battle-sim', 'items', 'picker'];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((ok) => {
    const srv = http.createServer(async (req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      try {
        const body = await readFile(join(root, path === '/' ? '/index.html' : path));
        res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    srv.once('error', () => ok(null)); // port taken: use the server already there
    srv.listen(8000, () => ok(srv));
  });
}

function run(name, script, args, mins) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [join(here, script), ...args], { cwd: out });
    let log = '';
    p.stdout.on('data', (d) => (log += d));
    p.stderr.on('data', (d) => (log += d));
    const kill = setTimeout(() => { log += '\n[timeout]'; p.kill('SIGKILL'); }, mins * 60000);
    p.on('close', (code) => {
      clearTimeout(kill);
      const bad = code !== 0 || /\[pageerror\]|\[timeout\]|errors [1-9]/.test(log);
      ok({ name, ok: !bad, secs: Math.round((Date.now() - t0) / 1000), log });
    });
  });
}

const argv = process.argv.slice(2);
let plan;
if (argv[0] && SUITES[argv[0]]) plan = [[argv[0], argv.length > 1 ? argv.slice(1) : null]];
else plan = (argv[0] === 'full' ? Object.keys(SUITES) : QUICK).map((n) => [n, null]);

for (const d of ['', 'car', 'ui', 'bat', 'items', 'adv']) await mkdir(join(out, d), { recursive: true });
const srv = await serve();
const results = [];
for (const [name, args] of plan) {
  const [script, defArgs, mins] = SUITES[name];
  process.stdout.write(`${name} … `);
  const r = await run(name, script, args || defArgs, mins);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} (${r.secs}s)`);
  if (!r.ok || plan.length === 1) console.log(r.log.split('\n').slice(-40).join('\n'));
  results.push(r);
}
if (srv) srv.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` · failed: ${failed.map((r) => r.name).join(', ')}` : ''} · screenshots in zoomies/test-out/`);
process.exit(failed.length ? 1 : 0);
