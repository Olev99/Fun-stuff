// Release safety: backup codes, offline play, safe updates, About, volumes, portrait.
//   node run.mjs release
// Pages that only need the game are served straight from zoomies/. The
// service worker tests copy zoomies/ to a temp folder, stamp it as "version A"
// and again as "version B" (one file changed), and serve whichever the test
// asks for on their own port, so they can publish, update and go offline.
import http from 'node:http';
import { chromium } from 'playwright-core';
import { cpSync, mkdtempSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const zroot = resolve(here, '../..');
let BASE = '';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

let fails = 0, pageErrors = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== '' ? ` (${detail})` : ''}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const phone = { viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true };

async function open(opts = {}, url = BASE, init = null) {
  const ctx = await browser.newContext({ ...phone, ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => { pageErrors++; console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
  await page.goto(url, { timeout: 90000 });
  await page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  return { ctx, page, logs };
}
const shot = (page, name) => page.screenshot({ path: `ui/${name}.png` });

// This suite serves the game itself on a free port (other suites share port 8000).
const web0 = await serve();
web0.root = zroot;
BASE = `${web0.url}index.html`;

// ---- a copy of the game that can be served as "version A" or "version B" ----
const tmp = mkdtempSync(join(tmpdir(), 'zoomies-release-'));
function site(name, mark) {
  const dir = join(tmp, name);
  cpSync(zroot, dir, { recursive: true, filter: (p) => !/\/(test-out|node_modules|\.git|dist)(\/|$)/.test(p) });
  if (mark) appendFileSync(join(dir, 'src/util.js'), `\nwindow.__mark = '${mark}';\n`);
  execFileSync(process.execPath, [join(dir, 'tools/stamp.mjs')], { stdio: 'pipe' });
  return dir;
}
function serve() {
  const s = { root: null, down: false, hits: [] };
  s.srv = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    s.hits.push(path);
    try {
      const body = readFileSync(join(s.root, path === '/' ? '/index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => s.srv.listen(0, () => { s.port = s.srv.address().port; s.url = `http://localhost:${s.port}/`; ok(s); }));
}
const swState = (page) => page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return { regs: regs.length, controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() };
});
const cacheCount = (page, name) => page.evaluate(async (n) => (await (await caches.open(n)).keys()).length, name);

// ============ 1. backup codes ============
console.log('--- backup codes');
const A = await open();
const lateGame = await A.page.evaluate(async () => {
  const app = window.zoomies;
  const { CHAPTERS } = await import('./src/career.js');
  const { LEAGUE } = await import('./src/league.js');
  const { ACHIEVEMENTS } = await import('./src/profile.js');
  const { HATS, TRAILS, HORNS } = await import('./src/cosmetics.js');
  const { PART_LIST } = await import('./src/parts.js');
  const c = app.career;
  const events = [...CHAPTERS, ...LEAGUE].flatMap((ch) => ch.events);
  for (const e of events) { c.done[e.id] = true; c.stars[e.id] = 3; c.best[e.id] = 61.234; c.seen[e.id] = true; }
  c.xp = 90000; c.coins = 123456; c.earned = 400000;
  for (const a of ACHIEVEMENTS) c.ach[a.id] = Date.now();
  for (const k of ['races', 'wins', 'podiums', 'cups', 'perfect', 'ultra', 'turbos', 'tricks', 'hits', 'slips', 'clean', 'overtakes', 'gems', 'battleWins', 'mpRaces', 'mpWins']) c.stats[k] = 1234;
  c.cos = [...HATS, ...TRAILS, ...HORNS].map((x) => x.id);
  for (const p of PART_LIST) { c.parts[p.id] = 3; c.bought[p.id] = 3; }
  const app2 = app;
  app2.settings.name = 'Zed';
  app2.settings.musicVol = 0.4;
  app2.records = { sprout: { tt: 61.5, lap: 20.1 }, 'cup:mushroom': '1st', found: { sprout: ['a', 'b'] } };
  // 40 best-lap ghosts of about 90 seconds
  let n = 0;
  for (const t of ['sprout', 'dunes', 'crater', 'harbor', 'alpine', 'neon', 'swamp', 'candy', 'ruins', 'sky']) {
    for (const r of ['', '-r', '-x', '-y']) {
      const s = new Int16Array(900 * 4);
      let x = 0, z = 0, yaw = 0;
      for (let i = 0; i < 900; i++) { yaw += (Math.random() - 0.5) * 300; x += Math.cos(yaw / 5000) * 14; z += Math.sin(yaw / 5000) * 14; s.set([x, 0, z, yaw], i * 4); }
      const u8 = new Uint8Array(s.buffer); let b = '';
      for (const v of u8) b += String.fromCharCode(v);
      localStorage.setItem(`zoomies.ghost.v1.${t}${r}`, JSON.stringify({ time: 60 + n++, splits: [20, 40], char: 'mochi', body: 'buggy', paint: null, hat: null, data: btoa(b) }));
    }
  }
  return { coins: c.coins, level: (await import('./src/profile.js')).levelOf(c.xp).level, chapters: CHAPTERS.length };
});
const built = await A.page.evaluate(async () => {
  const { buildBackup } = await import('./src/backup.js');
  const app = window.zoomies;
  const full = await buildBackup(app, { ghosts: true });
  const slim = await buildBackup(app, { ghosts: false });
  return { full: full.code, fullGhosts: full.ghosts, slim: slim.code };
});
check('backup code has the version prefix and a checksum', /^ZB1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/.test(built.full));
console.log(`     late-game code: ${built.full.length} characters with ${built.fullGhosts} ghosts, ${built.slim.length} without`);
check('ghosts stay within the size budget', built.full.length < 250000, built.full.length);

await A.ctx.close(); // software rendering is slow: keep only one game page running
// restore into a clean device: preview, replace
const B = await open();
const prev = await B.page.evaluate(async (code) => {
  const { readBackup, describeBackup } = await import('./src/backup.js');
  const r = await readBackup(code);
  return r.error ? { error: r.error } : describeBackup(r);
}, built.full);
check('restore preview shows level, coins, chapters, rank', prev.level === lateGame.level && prev.coins === 123456 && prev.chapters === lateGame.chapters && prev.rank >= 1 && prev.ghosts === built.fullGhosts, JSON.stringify(prev));
// merge into a device that has its own progress
await B.page.evaluate(() => { const a = window.zoomies; a.career.coins = 50; a.career.xp = 10; a.career.stats.races = 5000; a.career.racers.push('zed-test'); });
const merged = await B.page.evaluate(async (code) => {
  const { readBackup, applyBackup } = await import('./src/backup.js');
  const app = window.zoomies;
  applyBackup(app, await readBackup(code), 'merge');
  const c = app.career;
  return { coins: c.coins, stats: c.stats.races, done: Object.keys(c.done).length, ghosts: Object.keys(localStorage).filter((k) => k.startsWith('zoomies.ghost.v1.')).length, saved: JSON.parse(localStorage.getItem('zoomies-career-v1')).coins };
}, built.full);
check('merge keeps the best of both', merged.coins === 123456 && merged.stats === 5000 && merged.done > 20 && merged.ghosts === built.fullGhosts && merged.saved === 123456, JSON.stringify(merged));
const replaced = await B.page.evaluate(async (code) => {
  const { readBackup, applyBackup } = await import('./src/backup.js');
  const app = window.zoomies;
  applyBackup(app, await readBackup(code), 'replace');
  const c = app.career;
  return { coins: c.coins, races: c.stats.races, racers: c.racers.includes('zed-test'), name: app.settings.name, vol: app.settings.musicVol, rec: app.records['cup:mushroom'], saved: JSON.parse(localStorage.getItem('zoomies-career-v1')).coins, savedSet: JSON.parse(localStorage.getItem('zoomies.settings.v1')).name };
}, built.full);
check('replace makes this device match the backup', replaced.coins === 123456 && replaced.races === 1234 && !replaced.racers && replaced.name === 'Zed' && replaced.vol === 0.4 && replaced.rec === '1st' && replaced.saved === 123456 && replaced.savedSet === 'Zed', JSON.stringify(replaced));

// ============ 2. hostile restore input ============
console.log('--- hostile restore input');
const hostile = await B.page.evaluate(async (good) => {
  const { readBackup } = await import('./src/backup.js');
  const { gzip, b64uEncode } = await import('./src/ghostlink.js');
  const fnv = (u8) => { let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 0x01000193); return (h >>> 0).toString(16).padStart(8, '0'); };
  const pack = async (obj, prefix = 'ZB1') => { const z = await gzip(typeof obj === 'string' ? new TextEncoder().encode(obj) : new TextEncoder().encode(JSON.stringify(obj))); return `${prefix}.${b64uEncode(z)}.${fnv(z)}`; };
  const out = {};
  const t = async (name, input) => { const t0 = performance.now(); try { const r = await readBackup(input); out[name] = { err: r.error || null, ms: Math.round(performance.now() - t0), r: r.error ? null : r }; } catch (e) { out[name] = { threw: String(e) }; } };
  await t('empty', '');
  await t('garbage', 'hello world');
  await t('nonstring', { a: 1 });
  await t('null', null);
  await t('oversized', 'ZB1.' + 'A'.repeat(2_000_000) + '.00000000');
  await t('badsum', good.slice(0, -1) + (good.slice(-1) === '0' ? '1' : '0'));
  await t('truncated', good.slice(0, good.length >> 1));
  await t('badbase64', 'ZB1.!!!!.00000000');
  await t('oddlen', 'ZB1.A.00000000');
  await t('notgzip', (() => { const u = new TextEncoder().encode('not gzip at all, just plain text'); return `ZB1.${b64uEncode(u)}.${fnv(u)}`; })());
  await t('version', await pack({ app: 'zoomies' }, 'ZB2'));
  await t('wrongapp', await pack({ app: 'other', career: {} }));
  await t('notjson', await pack('{{{{'));
  await t('nocareer', await pack({ app: 'zoomies', career: 'x' }));
  // decompression bomb: 100 MB of zeros squeezed into a small code
  const bomb = await gzip(new Uint8Array(100 * 1024 * 1024));
  const bombCode = `ZB1.${b64uEncode(bomb)}.${fnv(bomb)}`;
  out.bombSize = bombCode.length;
  await t('bomb', bombCode);
  // a well-formed code with hostile contents
  const evil = JSON.parse('{"app":"zoomies","at":"x","career":{"coins":1e30,"xp":-5,"racer":{"a":1},"racers":["mochi",{"x":1},"' + 'z'.repeat(500) + '"],"__proto__":{"polluted":1},"stats":{"__proto__":{"p":1},"races":"many","gems":4e99},"stars":{"c1-0":99},"done":{"constructor":{"prototype":{"x":1}}},"unknownBig":"' + 'y'.repeat(5000) + '"},"settings":{"name":"<img src=x onerror=alert(1)>","musicVol":99,"steering":"hack","sfx":"yes","track":{"a":1},"vehicle":"bike"},"records":{"__proto__":{"q":1},"sprout":{"tt":"bad","lap":12.5}},"ghosts":{"../../etc":{"time":1},"sprout":{"time":-4,"data":"zzz"},"dunes":"str","ok-key":{"time":50,"data":"AAAA"}}}');
  await t('evil', await pack(evil));
  out.polluted = ({}).polluted !== undefined || ({}).p !== undefined || ({}).q !== undefined || ({}).x !== undefined;
  return out;
}, built.full);
for (const n of ['empty', 'garbage', 'nonstring', 'null', 'oversized', 'badsum', 'truncated', 'badbase64', 'oddlen', 'notgzip', 'version', 'wrongapp', 'notjson', 'nocareer', 'bomb']) {
  const h = hostile[n];
  check(`hostile "${n}" is refused with a message and no throw`, !h.threw && typeof h.err === 'string' && h.err.length > 5, h.threw || h.err);
}
console.log(`     the bomb code was ${hostile.bombSize} characters; refused in ${hostile.bomb.ms} ms`);
check('bomb is stopped quickly', hostile.bomb.ms < 5000, hostile.bomb.ms);
check('wrong version names the problem', /different version/.test(hostile.version.err));
check('damaged code names the problem', /damaged/.test(hostile.badsum.err));
const ev = hostile.evil.r;
check('hostile contents are cleaned, not trusted', !!ev && ev.career.coins <= 1e9 && ev.career.xp === 0 && typeof ev.career.racer === 'string' && ev.career.racers.every((r) => typeof r === 'string' && r.length <= 64)
  && ev.career.stars['c1-0'] <= 3 && !('unknownBig' in ev.career) && ev.career.stats.races === undefined && ev.career.stats.gems <= 1e9, ev && JSON.stringify([ev.career.coins, ev.career.xp, ev.career.stars]));
check('hostile settings are cleaned', !!ev && !/[<>]/.test(ev.settings.name || '') && ev.settings.musicVol === 1 && !('steering' in ev.settings) && !('sfx' in ev.settings) && !('track' in ev.settings) && ev.settings.vehicle === 'bike', ev && JSON.stringify(ev.settings));
check('hostile records and ghosts are dropped', !!ev && !('bad' in (ev.records.sprout || {})) && ev.records.sprout.tt === undefined && Object.keys(ev.ghosts).length === 0, ev && JSON.stringify([ev.records, Object.keys(ev.ghosts)]));
check('nothing polluted Object.prototype', hostile.polluted === false);

await B.ctx.close();

// ============ 3. the screens: Settings, backup, restore preview, About, volumes ============
console.log('--- screens and volume sliders');
const S = await open();
await S.page.tap('#scr-title [data-go="settings"]');
await S.page.waitForTimeout(300);
await S.page.evaluate(() => document.querySelector('#scr-settings .scroll').scrollTo(0, 99999));
await shot(S.page, 'release-settings-phone');
check('Settings shows "Progress protected"', /Progress protected: (yes|no|unknown)/.test(await S.page.textContent('#scr-settings')));
await S.page.tap('#scr-settings [data-go="backup"]');
await S.page.waitForTimeout(300);
await S.page.tap('#bk-build');
await S.page.waitForSelector('#bk-out:not([hidden])');
const code = await S.page.inputValue('#bk-code');
check('Make my code fills the box', /^ZB1\./.test(code), (await S.page.textContent('#bk-size')));
await shot(S.page, 'release-backup-phone');
await S.page.fill('#bk-paste', built.full);
await S.page.tap('#bk-check');
await S.page.waitForSelector('#bk-preview:not([hidden])');
await S.page.evaluate(() => document.querySelector('#scr-backup .scroll').scrollTo(0, 99999));
await shot(S.page, 'release-restore-preview-phone');
check('preview lists what the backup holds', /Level/.test(await S.page.textContent('#bk-facts')) && /123,456/.test(await S.page.textContent('#bk-facts')));
await S.page.fill('#bk-paste', 'ZB1.junk.00000000');
await S.page.tap('#bk-check');
await S.page.waitForTimeout(200);
check('a bad paste shows a friendly message', /damaged|not look|valid/.test(await S.page.textContent('#bk-msg')) && await S.page.isHidden('#bk-preview'), await S.page.textContent('#bk-msg'));
await S.page.tap('#scr-backup [data-go="close"]');
await S.page.waitForTimeout(200);
check('Done returns to Settings', await S.page.isVisible('#scr-settings'));
await S.page.tap('#scr-settings [data-go="about"]');
await S.page.waitForTimeout(300);
await shot(S.page, 'release-about-phone');
const about = await S.page.textContent('#scr-about');
check('About credits and privacy', /three\.js/.test(about) && /PeerJS/.test(about) && /qrcode-generator/.test(about) && /Kazuhiko Arase/.test(about) && /Baloo 2 and Bungee/.test(about) && /SIL Open Font License/.test(about) && /no accounts, no tracking and no ads/i.test(about) && /public matchmaking server/.test(about) && /original/.test(about), '');
check('About shows the version from the page', /Version /.test(await S.page.textContent('#ab-version')));
await S.page.tap('#scr-about [data-go="close"]');
await S.page.waitForTimeout(200);
// volume sliders persist
await S.page.evaluate(() => {
  for (const [id, v] of [['set-musicvol', 0.3], ['set-sfxvol', 0.25]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
});
const saved = await S.page.evaluate(() => JSON.parse(localStorage.getItem('zoomies.settings.v1')));
check('both volume sliders are saved', saved.musicVol === 0.3 && saved.sfxVol === 0.25, JSON.stringify([saved.musicVol, saved.sfxVol]));
await S.page.reload();
await S.page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
const vols = await S.page.evaluate(() => { const a = window.zoomies; a.ui.overlay('settings', 'title'); return [document.getElementById('set-musicvol').value, document.getElementById('set-sfxvol').value, a.audio.musicVol, a.audio.sfxVol]; });
check('volume sliders come back after a restart and reach the audio', vols.join() === '0.3,0.25,0.3,0.25', vols.join());
// audio pauses while hidden, and the first touch unlocks it
const aud = await S.page.evaluate(async () => {
  const a = window.zoomies;
  a.audio.unlock();
  await new Promise((r) => setTimeout(r, 400));
  const before = a.audio.ctx && a.audio.ctx.state;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 300));
  const hidden = a.audio.ctx && a.audio.ctx.state;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 400));
  return [before, hidden, a.audio.ctx && a.audio.ctx.state];
});
check('audio suspends when the page is hidden and resumes cleanly', aud[0] === 'running' && aud[1] === 'suspended' && aud[2] === 'running', aud.join());
await S.ctx.close();

// desktop sizes
const D = await open({ viewport: { width: 1470, height: 860 }, isMobile: false, hasTouch: false });
await D.page.click('#scr-title [data-go="settings"]');
await D.page.waitForTimeout(300);
await D.page.evaluate(() => document.querySelector('#scr-settings .scroll').scrollTo(0, 99999));
await shot(D.page, 'release-settings-desktop');
await D.page.click('#scr-settings [data-go="backup"]');
await D.page.click('#bk-build');
await D.page.waitForSelector('#bk-out:not([hidden])');
await D.page.fill('#bk-paste', built.full);
await D.page.click('#bk-check');
await D.page.waitForSelector('#bk-preview:not([hidden])');
await shot(D.page, 'release-backup-desktop');
await D.page.click('#scr-backup [data-go="close"]');
await D.page.click('#scr-settings [data-go="about"]');
await shot(D.page, 'release-about-desktop');
const rotDesk = await D.page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
check('no turn-sideways overlay on a computer', rotDesk === 'none', rotDesk);
await D.ctx.close();

// portrait
const P = await open({ viewport: { width: 390, height: 844 } });
const rot = await P.page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
await shot(P.page, 'release-portrait');
check('portrait phone shows "Turn your phone sideways"', rot === 'flex' && /Turn your phone sideways/.test(await P.page.textContent('#rotate')), rot);
await P.ctx.close();

// ============ 4. persist(), install card and backup reminder ============
console.log('--- storage persistence, install card, reminders');
const persistCase = async (name, init, want) => {
  const c = await open({}, BASE, init);
  await c.page.tap('body');
  await c.page.waitForTimeout(400);
  const got = await c.page.evaluate(() => { window.zoomies.ui.overlay('settings', 'title'); return [window.zoomies.pwa.persistLabel, document.getElementById('set-persist').textContent]; });
  check(`persist() ${name}`, got[0] === want && got[1] === want, got.join());
  await c.ctx.close();
};
await persistCase('granted', () => { Object.defineProperty(navigator, 'storage', { value: { persist: async () => true, persisted: async () => false }, configurable: true }); }, 'yes');
await persistCase('refused', () => { Object.defineProperty(navigator, 'storage', { value: { persist: async () => false, persisted: async () => false }, configurable: true }); }, 'no');
await persistCase('not supported', () => { Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true }); }, 'unknown');
await persistCase('throws', () => { Object.defineProperty(navigator, 'storage', { value: { persist: async () => { throw new Error('no'); }, persisted: async () => { throw new Error('no'); } }, configurable: true }); }, 'unknown');
await persistCase('already persisted', () => { Object.defineProperty(navigator, 'storage', { value: { persist: async () => { throw new Error('should not ask'); }, persisted: async () => true }, configurable: true }); }, 'yes');

const I = await open({ userAgent: IPHONE });
const noteKind = () => I.page.evaluate(() => { const n = document.getElementById('pwa-note'); return n.hidden ? '' : n.dataset.kind; });
await I.page.evaluate(() => window.zoomies.toTitle());
check('no install card before the first race', (await noteKind()) === '');
await I.page.evaluate(() => { window.zoomies.career.stats.races = 1; window.zoomies.toTitle(); });
await I.page.waitForTimeout(500);
check('install card appears on iPhone Safari after the first race', (await noteKind()) === 'install' && /Add to Home Screen/.test(await I.page.textContent('#pwa-note')));
await shot(I.page, 'release-install-card');
await I.page.evaluate(() => window.zoomies.ui.overlay('settings', 'title'));
check('the card is gone on other screens', (await noteKind()) === '');
await I.page.evaluate(() => window.zoomies.toTitle());
check('the install card shows only once', (await noteKind()) !== 'install');
await I.page.evaluate(() => window.zoomies.toTitle());
await I.page.reload();
await I.page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
check('and not again after a restart', (await noteKind()) !== 'install');
// backup reminder: after the first completed chapter, then at most every 14 days
const bossId = await I.page.evaluate(async () => { const { CHAPTERS } = await import('./src/career.js'); return CHAPTERS[0].events.find((e) => e.boss).id; });
await I.page.evaluate((id) => { window.zoomies.career.done[id] = true; window.zoomies.toTitle(); }, bossId);
check('backup reminder after the first chapter', (await noteKind()) === 'backup');
await shot(I.page, 'release-backup-reminder');
await I.page.tap('#pn-no');
await I.page.evaluate(() => window.zoomies.toTitle());
check('reminder stays away for 14 days', (await noteKind()) === '');
await I.page.evaluate(() => { window.zoomies.settings.nudgeAt = Date.now() - 15 * 864e5; window.zoomies.toTitle(); });
check('reminder comes back after 14 days', (await noteKind()) === 'backup');
await I.page.tap('#pn-go');
await I.page.waitForTimeout(300);
check('"Back up now" opens the backup screen', await I.page.isVisible('#scr-backup'));
await I.page.evaluate(() => { window.zoomies.settings.nudgeAt = Date.now() - 15 * 864e5; window.zoomies.settings.backupAt = Date.now() - 864e5; window.zoomies.toTitle(); });
check('no reminder right after a backup', (await noteKind()) === '');
await I.ctx.close();
const SA = await open({ userAgent: IPHONE }, BASE, () => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); });
await SA.page.evaluate(() => { window.zoomies.career.stats.races = 3; window.zoomies.toTitle(); });
check('no card when already on the Home Screen', (await SA.page.evaluate(() => document.getElementById('pwa-note').hidden)));
await SA.ctx.close();

// ============ 5. service worker: offline play, updates, safety valves ============
console.log('--- service worker');
const sA = site('A', 'A'), sB = site('B', 'B'), sC = site('C', 'C');
const pre = JSON.parse(readFileSync(join(sA, 'precache.json'), 'utf8'));
console.log(`     precache (${pre.urls.length} files, version ${pre.v}): ${pre.urls.join(' ')}`);
check('stamp wrote precache.json and the worker version', pre.urls.length > 60 && /const VERSION = '[0-9a-f]{7}'/.test(readFileSync(join(sA, 'sw.js'), 'utf8')));
const web = await serve();
web.root = sA;
const ready = async (page, version) => {
  await page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await page.waitForFunction(async (v) => { const k = await caches.keys(); return !!(await navigator.serviceWorker.ready) && k.includes(`zoomies-${v}`) && (await (await caches.open(`zoomies-${v}`)).keys()).length >= 60; }, version, { timeout: 30000 });
};
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => { pageErrors++; console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
  await page.goto(`${web.url}index.html?sw=1`);
  await ready(page, pre.v);
  check('worker registers and fills the cache', (await cacheCount(page, `zoomies-${pre.v}`)) >= pre.urls.length, await cacheCount(page, `zoomies-${pre.v}`));
  check('PeerJS broker traffic is never cached', (await page.evaluate(async (v) => (await (await caches.open(`zoomies-${v}`)).keys()).every((r) => new URL(r.url).origin === location.origin), pre.v)));
  // offline: the server stops, the browser goes offline, the game still loads and races
  web.srv.close();
  web.srv.closeAllConnections();
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  const st = await swState(page);
  check('the game loads offline from the cache', st.controlled && (await page.evaluate(() => !!window.zoomies)));
  await page.tap('#scr-title [data-go="quick"]');
  await page.waitForTimeout(700);
  await page.tap('#scr-char [data-go="next"]');
  await page.waitForTimeout(700);
  await page.tap('#scr-track [data-go="race"]');
  await page.waitForTimeout(3500);
  const racing = await page.evaluate(() => ({ mode: window.zoomies.race.mode, state: window.zoomies.race.state }));
  check('a race starts offline', racing.mode !== 'demo', JSON.stringify(racing));
  await page.screenshot({ path: 'ui/release-offline-race.png' });
  check('offline run logged no errors or CSP violations', !logs.some((l) => /Content Security Policy|Refused|violat/i.test(l)), logs.slice(0, 3).join(' | '));
  await ctx.close();
}
const web2 = await serve();
{
  // relaunch: A is installed, B is published, the player opens the game again
  web2.root = sA;
  const ctx = await browser.newContext(phone);
  let page = await ctx.newPage();
  page.on('pageerror', (e) => { pageErrors++; console.log('[pageerror]', e.message); });
  await page.goto(`${web2.url}index.html?sw=1`);
  await ready(page, pre.v);
  check('version A runs first', (await page.evaluate(() => window.__mark)) === 'A');
  await page.close();
  web2.root = sB;
  page = await ctx.newPage();
  page.on('pageerror', (e) => { pageErrors++; console.log('[pageerror]', e.message); });
  await page.goto(`${web2.url}index.html?sw=1`);
  await page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  check('after a relaunch version B is what runs', (await page.evaluate(() => window.__mark)) === 'B');
  const preB = JSON.parse(readFileSync(join(sB, 'precache.json'), 'utf8'));
  await page.close();
  // the old caches go once B takes over (at a launch with no other game page open)
  let keys = [];
  for (let launch = 0; launch < 4 && keys.join() !== `zoomies-${preB.v}`; launch++) {
    await new Promise((r) => setTimeout(r, 2500));
    page = await ctx.newPage();
    await page.goto(`${web2.url}index.html?sw=1`);
    await page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
    await page.waitForTimeout(1500);
    keys = await page.evaluate(() => caches.keys());
    await page.close();
  }
  check('old caches are deleted when the new worker takes over', keys.length === 1 && keys[0] === `zoomies-${preB.v}`, keys.join());
  await ctx.close();
}
{
  // a page that stays open while an update arrives: "Update ready" on the title screen
  web2.root = sA;
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { pageErrors++; console.log('[pageerror]', e.message); });
  await page.goto(`${web2.url}index.html?sw=1`);
  await ready(page, pre.v);
  web2.root = sC;
  const preC = JSON.parse(readFileSync(join(sC, 'precache.json'), 'utf8'));
  await page.evaluate(() => window.zoomies.pwa.reg.update());
  await page.waitForFunction(() => { const n = document.getElementById('pwa-note'); return !n.hidden && n.dataset.kind === 'update'; }, null, { timeout: 30000 });
  check('"Update ready, tap to restart" shows on the title screen', /Update ready/.test(await page.textContent('#pwa-note')) && /restart/i.test(await page.textContent('#pn-go')));
  check('the page still runs the old version until the player taps', (await page.evaluate(() => window.__mark)) === 'A');
  await shot(page, 'release-update-toast');
  await page.evaluate(() => window.zoomies.ui.overlay('settings', 'title'));
  check('the update toast is hidden outside the title screen', await page.isHidden('#pwa-note'));
  await page.evaluate(() => window.zoomies.toTitle());
  const nav = page.waitForNavigation({ timeout: 30000 });
  await page.tap('#pn-go');
  await nav;
  await page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  check('tapping restarts into the new version', (await page.evaluate(() => window.__mark)) === 'C');
  await page.waitForFunction(async (v) => (await caches.keys()).join() === `zoomies-${v}`, preC.v, { timeout: 20000 }).catch(() => {});
  check('only the new cache is left', (await page.evaluate(() => caches.keys())).join() === `zoomies-${preC.v}`);
  // ---- ?nosw
  await page.goto(`${web2.url}index.html?nosw`);
  await page.waitForFunction(() => window.zoomies && window.zoomies.race && !location.search, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const after = await swState(page);
  check('?nosw removes the worker and every cache and reloads once', after.regs === 0 && after.caches.length === 0 && !/nosw/.test(page.url()), JSON.stringify(after));
  check('and the game still runs without it', await page.evaluate(() => !!window.zoomies.race));
  // ---- Settings > Repair
  await page.goto(`${web2.url}index.html?sw=1`);
  await page.evaluate(() => sessionStorage.removeItem('zoomies.nosw'));
  await page.goto(`${web2.url}index.html?sw=1`);
  await ready(page, preC.v);
  page.on('dialog', (d) => d.accept());
  const nav2 = page.waitForNavigation({ timeout: 30000 });
  await page.evaluate(() => window.zoomies.safeUI.open('repair'));
  await nav2;
  await ready(page, preC.v);
  check('Repair clears and rebuilds the cache', (await cacheCount(page, `zoomies-${preC.v}`)) === preC.urls.length);
  await ctx.close();
}
{
  // a broken worker can never strand a phone: if the files cannot be downloaded the old version keeps working
  web2.root = sA;
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { pageErrors++; console.log('[pageerror]', e.message); });
  await page.goto(`${web2.url}index.html?sw=1`);
  await ready(page, pre.v);
  const sD = site('D', 'D');
  rmSync(join(sD, 'vendor/fonts/bungee-latin.woff2')); // listed in precache.json but missing: the install must fail
  web2.root = sD;
  await page.evaluate(() => window.zoomies.pwa.reg.update().catch(() => {}));
  await page.waitForTimeout(3000);
  const st = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, installing: !!r.installing, active: !!r.active }; });
  check('a failed download leaves the working version alone', st.active && !st.waiting, JSON.stringify(st));
  check('and the page keeps running', (await page.evaluate(() => window.__mark)) === 'A');
  await ctx.close();
}
web2.srv.close();

// ============ 6. single-file build and file:// ============
console.log('--- single-file build');
const single = join(tmp, 'single.html');
execFileSync(process.execPath, [join(zroot, 'tools/build-single.mjs'), single], { stdio: 'pipe', cwd: zroot });
const web3 = await serve();
web3.root = tmp;
for (const [label, url] of [['over http', `${web3.url}single.html?sw=1`], ['from file://', `file://${single}`]]) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  const logs = [];
  await page.route('**/favicon.ico', (r) => r.fulfill({ status: 204 })); // the single page has no icon links
  page.on('pageerror', (e) => { pageErrors++; console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const regs = await page.evaluate(async () => { try { return (await navigator.serviceWorker.getRegistrations()).length; } catch (e) { return 0; } }); // file:// has none to ask for
  check(`single-file build ${label}: loads and registers no worker`, regs === 0);
  check(`single-file build ${label}: no console errors`, logs.length === 0, logs.slice(0, 3).join(' | '));
  await ctx.close();
}
web3.srv.close();

await browser.close();
web0.srv.close();
rmSync(tmp, { recursive: true, force: true });
console.log(`errors ${fails + pageErrors}`);
process.exit(fails + pageErrors ? 1 : 0);
