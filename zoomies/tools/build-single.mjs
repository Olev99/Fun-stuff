// Bundles the game into one self-contained HTML file (handy for sharing or
// embedding somewhere that cannot serve multiple files).
//
//   npx esbuild --version   # esbuild must be available
//   node tools/build-single.mjs [out.html] [--fragment]
//
// --fragment omits <!doctype>/<html>/<head>/<body> wrappers (for hosts that add their own).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(args.find((a) => !a.startsWith('--')) || `${root}/dist/zoomies-single.html`);

const js = execFileSync('npx', [
  'esbuild', `${root}/src/main.js`, '--bundle', '--minify', '--format=iife', '--target=es2020',
  `--alias:three=${root}/vendor/three.module.min.js`, '--legal-comments=none',
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/<\/script/gi, '<\\/script');

const html = readFileSync(`${root}/index.html`, 'utf8');
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g)].map((m) => m[0]).join('\n');
let body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
body = body.replace(/<script type="importmap">[\s\S]*?<\/script>/, '').replace(/<script type="module"[^>]*><\/script>/, '');
const script = `<script>${js}</script>`;

const page = fragment
  ? `${title}\n${fonts}\n${style}\n${body}\n${script}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n${title}\n${fonts}\n${style}\n</head>\n<body>\n${body}\n${script}\n</body>\n</html>\n`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
