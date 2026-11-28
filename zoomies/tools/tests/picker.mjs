import { chromium } from 'playwright-core';
import { CHROME_PATH } from './chrome.mjs';
const b = await chromium.launch({ executablePath: CHROME_PATH, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true })).newPage();
const errs = [];
const expect = (name, ok, info = '') => { if (!ok) { errs.push(name); console.log(`FAIL ${name} ${info}`); } };
p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 300)); });
await p.goto('http://localhost:' + (process.env.ZPORT || 8000) + '/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
await p.tap('#scr-title [data-go="quick"]');
await p.waitForTimeout(700);
console.log('btn:', await p.textContent('#veh-btn'));
await p.tap('#veh-btn');
await p.waitForTimeout(500);
await p.screenshot({ path: 'ui/picker-open.png' });
// Every ride has a card, and a card is locked exactly when the game says the ride is locked.
const vp = await p.evaluate(async () => {
  const { BODY_LIST, bodyLocked } = await import('./src/karts.js');
  const c = window.zoomies.career, cards = [...document.querySelectorAll('#vp-grid .vcard')];
  const wrong = BODY_LIST.filter((b) => { const el = cards.find((x) => x.dataset.id === b.id); return !el || el.classList.contains('locked') !== !!bodyLocked(b.id, c); });
  return { n: cards.length, want: BODY_LIST.length, free: cards.filter((x) => !x.classList.contains('locked')).length, wrong: wrong.map((b) => b.id) };
});
console.log('rides listed:', vp.n, 'of', vp.want, 'unlocked', vp.free);
expect('every ride listed', vp.n === vp.want, `${vp.n}/${vp.want}`);
expect('ride locks match bodyLocked', !vp.wrong.length, vp.wrong.join(','));
expect('the five free rides are unlocked', vp.free >= 5, vp.free);
// Every racer has a card, locked exactly when charLocked says so.
const cg = await p.evaluate(async () => {
  const { CHARACTERS, charLocked } = await import('./src/characters.js');
  const { levelOf } = await import('./src/profile.js');
  const c = window.zoomies.career, lvl = levelOf((c && c.xp) || 0).level, cards = [...document.querySelectorAll('#char-grid .card')];
  const wrong = CHARACTERS.filter((ch) => { const el = cards.find((x) => x.dataset.id === ch.id); return !el || el.classList.contains('locked') !== !!charLocked(ch.id, lvl, c); });
  return { n: cards.length, want: CHARACTERS.length, free: cards.filter((x) => !x.classList.contains('locked')).length, wrong: wrong.map((ch) => ch.id) };
});
console.log('racers listed:', cg.n, 'of', cg.want, 'unlocked', cg.free);
expect('every racer listed', cg.n === cg.want, `${cg.n}/${cg.want}`);
expect('racer locks match charLocked', !cg.wrong.length, cg.wrong.join(','));
expect('the 8 starter racers are unlocked', cg.free >= 8, cg.free);
await p.tap('#vp-grid [data-id="sportbike"]');
await p.waitForTimeout(600);
const lockedNote = await p.textContent('#vp-note');
console.log('locked note:', lockedNote, '| still:', await p.textContent('#veh-nm'));
expect('a locked ride says so', /locked/i.test(lockedNote), lockedNote);
await p.screenshot({ path: 'ui/picker-locked.png' });
await p.tap('#vp-grid [data-id="scooter"]');
await p.waitForTimeout(600);
const picked = await p.textContent('#veh-nm'), hidden = await p.evaluate(() => document.getElementById('veh-pop').hidden);
console.log('picked:', picked, 'popup hidden:', hidden);
expect('picking a free ride selects it', hidden && (await p.evaluate(() => window.zoomies.settings.vehicle)) === 'scooter', picked);
await p.screenshot({ path: 'ui/picker-scooter.png' });
// buy sportbike in career data -> unlocked
await p.evaluate(() => { const a = window.zoomies; a.career.bodies.push('sportbike'); });
await p.tap('#veh-btn'); await p.waitForTimeout(300);
await p.tap('#vp-grid [data-id="sportbike"]'); await p.waitForTimeout(300);
console.log('after buying:', await p.textContent('#veh-nm'));
await p.tap('#scr-char [data-go="next"]'); await p.waitForTimeout(600);
await p.tap('#scr-track [data-go="race"]'); await p.waitForTimeout(2500);
const raceBody = await p.evaluate(() => window.zoomies.race.player.bodyDef.id);
console.log('race body:', raceBody);
expect('the bought ride is the one raced', raceBody === 'sportbike', raceBody);
// remove from career: menuLoadout falls back to classic
const fb = await p.evaluate(() => { const a = window.zoomies; a.career.bodies = a.career.bodies.filter((x) => x !== 'sportbike'); return a.menuLoadout().body; });
console.log('fallback:', fb);
expect('a ride no longer owned falls back to a free one', fb === 'classic', fb);
await p.screenshot({ path: 'ui/race-back.png' });
console.log('errors', errs.length);
await b.close();
