// Stamps every code file's URL with a hash of its contents, so browsers never
// run a mix of old and new files after an update (GitHub Pages lets them
// cache each file for 10 minutes). Run it before committing:
//
//   node tools/stamp.mjs
//
// It rewrites the import map and main script tag in index.html, and writes
// version.json, which the game checks on startup to reload itself once when
// a newer version is live.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);
const files = [
  ...readdirSync(`${root}/src`).filter((f) => f.endsWith('.js')).sort().map((f) => `src/${f}`),
  'vendor/three.module.min.js',
  'vendor/qrcode.mjs',
];
const v = {};
for (const f of files) v[f] = hash(readFileSync(`${root}/${f}`));
const version = hash(Object.entries(v).map(([f, h]) => f + h).join('|')).slice(0, 7);

const imports = { three: `./vendor/three.module.min.js?v=${v['vendor/three.module.min.js']}` };
for (const f of files) if (f !== 'vendor/three.module.min.js') imports[`./${f}`] = `./${f}?v=${v[f]}`;

let html = readFileSync(`${root}/index.html`, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify({ imports }, null, 1).replace(/\n\s*/g, ' ')}</script>`);
html = html.replace(/<script type="module" src="\.\/src\/main\.js[^"]*"><\/script>/, `<script type="module" src="./src/main.js?v=${v['src/main.js']}"></script>`);
html = html.replace(/<meta name="zoomies-version" content="[^"]*">/, `<meta name="zoomies-version" content="${version}">`);
if (!html.includes('name="zoomies-version"')) html = html.replace('<title>', `<meta name="zoomies-version" content="${version}">\n<title>`);
writeFileSync(`${root}/index.html`, html);
writeFileSync(`${root}/version.json`, `${JSON.stringify({ v: version })}\n`);
console.log(`version ${version}, ${files.length} files stamped`);
