// Lager PNG-ikonene fra icon.svg i hodeløs Chrome. Bruk: node m4-lydmotor/icon/render.js [mappe for prøvebilder]
// Maskerbar variant: kunsten skaleres til 82 % rundt midten (Androids trygge sone er sirkelen med radius 40 %).
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const dir = __dirname, out = path.join(dir, '..');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const mask = svg.replace('<g id="art">', '<g id="art" transform="translate(512 512) scale(.82) translate(-512 -512)">');
const JOBS = [['apple-touch-icon.png', 180, svg], ['icon-192.png', 192, svg], ['icon-512.png', 512, svg],
  ['icon-maskable-512.png', 512, mask], ['favicon.png', 64, svg]];
const extra = process.argv[2]; // valgfritt: prøvebilder i 1024 og 60 px
if (extra) JOBS.push([path.join(extra, 'icon-1024.png'), 1024, svg], [path.join(extra, 'icon-60.png'), 60, svg]);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, n, s] of JOBS) {
    await page.setViewportSize({ width: n, height: n });
    const src = 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');
    await page.setContent('<html><body style="margin:0;background:#000"><img src="' + src + '" width="' + n + '" height="' + n + '" style="display:block"></body></html>');
    await page.waitForFunction(() => document.images[0].complete);
    const file = path.isAbsolute(name) ? name : path.join(out, name);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: n, height: n } });
    console.log(file, n + 'x' + n);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
