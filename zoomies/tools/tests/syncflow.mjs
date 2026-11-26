// Progress sync between two devices through the real screens (?net=local): two pages, each
// with its own storage, so each is its own device in the save ledger (sync.js). Checks that
// earnings add up, a second sync changes nothing, spending stays spent, ghosts come only for
// real tracks, and a device on an older save format is refused without merging anything.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const url = `http://localhost:${process.env.ZPORT || 8000}/index.html?net=local`;
const page = async (n) => {
  const p = await ctx.newPage();
  // Pages of one browser share localStorage; give each its own, as two devices have.
  await p.addInitScript(() => {
    const m = new Map([['zoomies.settings.v1', JSON.stringify({ quality: 'low' })]]);
    const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
    Object.defineProperty(window, 'localStorage', { value: s, configurable: true });
  });
  p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message, e.stack?.slice(0, 400)));
  await p.goto(url);
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.evaluate(() => { window.zoomies.paused = true; });
  return p;
};
const A = await page('A'), B = await page('B');
const ids = await Promise.all([A, B].map((p) => p.evaluate(async () => (await import('./src/ledger.js')).deviceId())));
check('each page is its own device', ids[0] !== ids[1], ids.join(' '));

// Some progress on each device, saved the way the game saves.
const earn = (p, coins) => p.evaluate(async (coins) => { const C = await import('./src/career.js'); const c = window.zoomies.career; c.coins += coins; c.earned += coins; C.saveCareer(c); return c.coins; }, coins);
await earn(A, 1000);
await earn(B, 300);
await B.evaluate(async () => {
  const G = await import('./src/ghost.js');
  const g = (time) => JSON.stringify({ time, splits: [], char: 'mochi', body: 'buggy', data: G.toB64(new Int16Array(160)), at: 1 });
  localStorage.setItem('zoomies.ghost.v1.sprout', g(70));
  localStorage.setItem('zoomies.ghost.v1.nope', g(10)); // not a track: never sent or stored
});

const sync = async () => {
  await A.evaluate(() => window.zoomies.sync.open('title'));
  await A.click('#sync-show');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('sync-code').textContent), null, { timeout: 20000 });
  const code = await A.textContent('#sync-code');
  await B.evaluate(() => window.zoomies.sync.open('title'));
  await B.fill('#sync-code-in', code);
  await B.click('#sync-join');
  await B.waitForFunction(() => !document.getElementById('sync-done').hidden, null, { timeout: 30000 });
  await A.waitForFunction(() => !document.getElementById('sync-done').hidden, null, { timeout: 30000 });
  await A.waitForTimeout(500); // ghosts follow the reply
  return Promise.all([A, B].map((p) => p.evaluate(() => window.zoomies.career.coins)));
};

let coins = await sync();
await A.screenshot({ path: 'sync-host.png' });
await B.screenshot({ path: 'sync-guest.png' });
check('first sync: both devices hold 1000 + 300', coins.join() === '1300,1300', coins.join());
const ghosts = await A.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('zoomies.ghost.v1.')).sort().join());
check('the real track ghost came over, the made-up key did not', ghosts === 'zoomies.ghost.v1.sprout', ghosts);
coins = await sync();
check('syncing again changes nothing', coins.join() === '1300,1300', coins.join());
await B.evaluate(async () => { const C = await import('./src/career.js'); const c = window.zoomies.career; c.coins -= 200; C.saveCareer(c); });
await earn(A, 50);
coins = await sync();
check('spent on one, earned on the other: 1300 - 200 + 50 on both', coins.join() === '1150,1150', coins.join());
const saved = await Promise.all([A, B].map((p) => p.evaluate(() => JSON.parse(localStorage.getItem('zoomies-career-v1')).coins)));
check('both devices saved the result', saved.join() === '1150,1150', saved.join());

// A device on the old save format (no handshake, its whole save in the first message) is refused.
await A.evaluate(() => window.zoomies.sync.open('title'));
await A.click('#sync-show');
await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('sync-code').textContent), null, { timeout: 20000 });
const code = await A.textContent('#sync-code');
const reply = await B.evaluate(async (code) => {
  const { LocalTransport } = await import('./src/net.js');
  const got = [];
  const t = new LocalTransport({ join() {}, leave() {}, message: (id, m) => got.push(m.t), error() {} }, 'sync');
  await t.start('guest', code);
  t.send('host', { t: 'sync', v: 1, career: { v: 1, coins: 999999, xp: 5 }, records: {}, ghosts: {} });
  await new Promise((r) => setTimeout(r, 1500));
  t.close();
  return got.join();
}, code);
const after = await A.evaluate(() => [window.zoomies.career.coins, document.getElementById('sync-status').textContent]);
await A.screenshot({ path: 'sync-refused.png' });
check('an old-format device is refused and nothing is merged', reply === 'refuse' && after[0] === 1150 && /different version/.test(after[1]), JSON.stringify([reply, after]));

await b.close();
console.log(`errors ${fails}`);
process.exit(fails ? 1 : 0);
