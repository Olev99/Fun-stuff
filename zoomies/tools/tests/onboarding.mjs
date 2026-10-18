// First steps: the new-save flow, tilt step, Driving School lessons, tips,
// the steering-help offer, Screen shake Off, an idle prologue and the
// Driving School replay. Screenshots land in test-out/onb/.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir('onb', { recursive: true });
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const watch = (pg) => {
  pg.setDefaultTimeout(60000);
  pg.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.slice(0, 600)));
  pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) console.log('[console]', m.text().slice(0, 300)); });
};
const open = async (touch) => {
  const ctx = await b.newContext(touch ? { viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true } : { viewport: { width: 1470, height: 860 } });
  const p = await ctx.newPage();
  watch(p);
  await p.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.waitForTimeout(800);
  return p;
};
// Step the paused race (and the coach) until a state is reached (no eval: the page's CSP forbids it).
const until = (p, want, max = 60 * 30) => p.evaluate(([want, max]) => {
  const app = window.zoomies;
  const f = () => (want === 'results' ? app.ui.current === 'results' : app.race.state === want);
  let n = 0;
  while (n++ < max && !f()) { app.race.update(1 / 60); app.coach.tick(1 / 60); }
  return f();
}, [want, max]);
const tick = (p, secs, steerInput = null) => p.evaluate(([secs, st]) => {
  const app = window.zoomies;
  for (let t = 0; t < secs; t += 0.05) { if (st !== null) app.race.lastInput = { steer: st }; app.coach.tick(0.05); }
}, [secs, steerInput]);
// Let the real loop draw one frame for a screenshot, then pause again.
const shot = async (p, path) => {
  await p.evaluate(() => { window.zoomies.paused = false; window.zoomies.applyControls(); });
  await p.waitForTimeout(900); // software GL is slow: let the CSS fades finish
  await p.screenshot({ path });
  await p.evaluate(() => { window.zoomies.paused = true; });
};
const coach = (p) => p.evaluate(() => {
  const c = window.zoomies.coach;
  return { i: c.lessons ? c.lessons.i : -1, mode: c.mode || '', text: document.getElementById('coach-tx').textContent, show: document.getElementById('coach').classList.contains('show'), lit: [...document.querySelectorAll('.teach')].map((e) => e.id || e.className) };
});

// ---------------- 1. new save on a phone ----------------
let p = await open(true);
const t0 = await p.evaluate(() => ({ first: document.getElementById('scr-title').classList.contains('first-run'), btn: getComputedStyle(document.querySelector('[data-go="story"]')).display, s: window.zoomies.settings }));
check('new save: title shows Start your story', t0.first && t0.btn !== 'none');
check('new save: steering assist defaults to Light', t0.s.assist === 'light', t0.s.assist);
await p.screenshot({ path: 'onb/1-title-phone.png' });
await p.tap('[data-go="story"]');
await p.waitForTimeout(400);
check('tilt step opens', await p.evaluate(() => window.zoomies.ui.current === 'intro'));
await p.screenshot({ path: 'onb/2-tilt-step.png' });
await p.waitForTimeout(2400);
const fb = await p.evaluate(() => ({ steer: window.zoomies.settings.steering, cls: document.querySelector('#scr-intro .intro').className, msg: document.getElementById('intro-status').textContent }));
check('tilt step: no motion events in 2 s falls back to touch', fb.steer === 'touch' && fb.cls.includes('touchsteer'), fb.msg);
await p.screenshot({ path: 'onb/3-tilt-fallback.png' });
await p.tap('#scr-intro [data-go="go"]');
await p.waitForTimeout(600);
check('intro done is saved', await p.evaluate(() => JSON.parse(localStorage.getItem('zoomies.settings.v1')).introDone === true));
let n = 0;
while (n++ < 30 && await p.evaluate(() => window.zoomies.ui.current === 'story')) { await p.tap('#scr-story .story-box'); await p.waitForTimeout(200); }
await p.waitForTimeout(800);
check('story leads to the career hub', await p.evaluate(() => window.zoomies.ui.current === 'career'));
await p.tap('#ev-list [data-ev="c1-0"]');
await p.tap('#car-go');
await p.waitForTimeout(1500);
const r0 = await p.evaluate(() => ({ ev: window.zoomies.race && window.zoomies.race.careerEv && window.zoomies.race.careerEv.id, teaching: window.zoomies.coach.teaching }));
check('new-save flow reaches the first race', r0.ev === 'c1-0', JSON.stringify(r0));
check('lessons are on in the prologue', r0.teaching);

// ---------------- 2. lessons advance on actions ----------------
await p.evaluate(() => { window.zoomies.paused = true; });
await until(p, 'race');
await tick(p, 0.2);
let c = await coach(p);
check('lesson 1: steer banner', c.i === 0 && c.show && /Steer/i.test(c.text), JSON.stringify(c));
await shot(p, 'onb/4-lesson-steer.png');
// ignored: fades after 6 s, comes back after 12 s
await tick(p, 7);
c = await coach(p);
check('lesson banner fades when ignored', !c.show && c.i === 0, JSON.stringify(c));
await tick(p, 5.2);
c = await coach(p);
check('lesson hint repeats after 12 s without progress', c.show && c.i === 0, JSON.stringify(c));
await tick(p, 1.5, 0.8);
c = await coach(p);
check('steering passes the steer lesson', c.i === 1 && c.mode === 'done', JSON.stringify(c));
await shot(p, 'onb/5-lesson-tick.png');
await tick(p, 1.4);
c = await coach(p);
check('lesson 2: drift banner lights the DRIFT button', c.i === 1 && /DRIFT/.test(c.text) && c.lit.includes('btn-drift'), JSON.stringify(c));
await shot(p, 'onb/6-lesson-drift.png');
const fire = (type, data, set = {}) => p.evaluate(([type, data, set]) => { const app = window.zoomies, k = app.race.player; Object.assign(k, set.k || {}); Object.assign(k.ctl, set.ctl || {}); app.coach.event(type, data, k); app.coach.tick(1.4); }, [type, data, set]);
await fire('driftLevel', 1);
c = await coach(p);
check('sparks pass the drift lesson', c.i === 2 && /let go/i.test(c.text), JSON.stringify(c));
await shot(p, 'onb/7-lesson-boost.png');
await fire('driftBoost', 2);
c = await coach(p);
check('a drift boost passes the boost lesson', c.i === 3 && /orb/i.test(c.text), JSON.stringify(c));
await shot(p, 'onb/8-lesson-orb.png');
await fire('orb', null, { k: { item: 'ball', itemCount: 1 } });
c = await coach(p);
check('an orb passes the orb lesson, ITEM lights up', c.i === 4 && /ITEM/.test(c.text) && c.lit.includes('btn-item'), JSON.stringify(c));
await shot(p, 'onb/9-lesson-item.png');
await fire('used', 'ball', { k: { item: 'ball', itemCount: 1 }, ctl: { aim: 0 } });
c = await coach(p);
check('using it passes the item lesson; THROW BACK next (touch)', c.i === 5 && /THROW BACK/.test(c.text) && c.lit.includes('btn-throwback'), JSON.stringify(c));
await shot(p, 'onb/10-lesson-throwback.png');
await fire('used', 'ball', { ctl: { aim: -1 } });
const ld = await p.evaluate(() => ({ t: window.zoomies.coach.teaching, s: window.zoomies.settings.lessonsDone, pts: window.zoomies.race.stylePts }));
check('throwing back finishes the lessons', !ld.t && ld.s === true, JSON.stringify(ld));
check('each lesson pays style points', ld.pts >= 60, String(ld.pts));

// ---------------- 3. skip lessons ----------------
await p.evaluate(() => { const app = window.zoomies; app.settings.lessonsDone = false; app.settings.lesson = 0; app.startCareerEvent('c1-0'); app.paused = true; });
await until(p, 'race');
await tick(p, 0.2);
await p.evaluate(() => { window.zoomies.paused = false; });
await p.waitForTimeout(300);
await p.tap('#coach-skip');
await p.waitForTimeout(200);
const sk = await p.evaluate(() => ({ t: window.zoomies.coach.teaching, s: window.zoomies.settings.lessonsDone, show: document.getElementById('coach').classList.contains('show') }));
check('Skip lessons ends them for good', !sk.t && sk.s && !sk.show, JSON.stringify(sk));

// ---------------- 4. idle prologue on Easy ----------------
for (let run = 1; run <= 3; run++) {
  const idle = await p.evaluate(() => {
    const app = window.zoomies;
    app.startCareerEvent('c1-0');
    app.paused = true;
    const race = app.race;
    let steps = 0;
    while (steps++ < 60 * 300 && !race.player.finished) race.update(1 / 60);
    const ev = race.careerEv;
    return { place: race.player.place, finished: race.player.finished, pass: race.player.place <= ev.goal, time: race.raceTime.toFixed(1), diff: race.diff && race.diff.name, assist: app.settings.assist };
  });
  console.log('idle prologue', JSON.stringify(idle));
  check(`idle player clears the prologue (finish the race), run ${run}`, idle.finished && idle.pass, `place ${idle.place}`);
}

// ---------------- 5. tips: once each, 20 s apart, not in the countdown or online ----------------
await p.evaluate(() => {
  const app = window.zoomies;
  app.settings.tips = {};
  app.coach.lastTip = -99;
  app.startRace({ mode: 'quick', trackId: 'sprout', reverse: false, player: 'mochi', speedClass: 'chill' });
  app.paused = true;
});
await until(p, 'countdown');
await p.evaluate(() => { const app = window.zoomies; app.coach.event('orb', null, app.race.player); app.coach.tick(0.1); });
c = await coach(p);
check('no tip during the countdown', !c.show, JSON.stringify(c));
await until(p, 'race', 60 * 10);
await tick(p, 0.1);
c = await coach(p);
check('first item tip shows once racing', c.show && c.mode === 'tip' && /item/i.test(c.text), JSON.stringify(c));
await shot(p, 'onb/11-tip.png');
await p.evaluate(() => { const app = window.zoomies; app.coach.event('shortcut', { id: 1, name: 'x' }, app.race.player); });
await tick(p, 10);
c = await coach(p);
check('second tip waits for the 20 s gap', !c.show, JSON.stringify(c));
await tick(p, 10.5);
c = await coach(p);
check('second tip shows after 20 s', c.show && /shortcut/i.test(c.text), JSON.stringify(c));
const again = await p.evaluate(() => { const app = window.zoomies; app.coach.event('orb', null, app.race.player); return app.coach.queue.length; });
check('a seen tip never comes back', again === 0);
const online = await p.evaluate(() => { const app = window.zoomies, co = app.coach; const keep = co.online; co.online = true; co.tip('battle', 'x y'); const q = co.queue.length; co.online = keep; return q; });
check('tips are skipped online', online === 0);

// ---------------- 6. smart assist ----------------
await p.evaluate(() => {
  const app = window.zoomies;
  Object.assign(app.settings, { assist: 'light', assistOffered: false, racesRun: 0 });
  app.startRace({ mode: 'quick', trackId: 'sprout', reverse: false, player: 'mochi', speedClass: 'chill' });
  app.paused = true;
});
await until(p, 'race');
await p.evaluate(() => { const app = window.zoomies; for (let i = 0; i < 6; i++) app.coach.event('wall', 6, app.race.player); });
check('6 wall hits offer stronger steering help', await p.evaluate(() => !document.getElementById('coach-ask').hidden));
await shot(p, 'onb/12-assist-toast.png');
await p.evaluate(() => { window.zoomies.paused = false; });
await p.tap('#coach-ask [data-v="yes"]');
await p.evaluate(() => { window.zoomies.paused = true; });
check('Yes sets Steering assist to Strong', await p.evaluate(() => window.zoomies.settings.assist === 'strong'));
const twice = await p.evaluate(() => { const app = window.zoomies; app.settings.assist = 'light'; app.coach.walls = 0; for (let i = 0; i < 8; i++) app.coach.event('wall', 6, app.race.player); return !document.getElementById('coach-ask').hidden; });
check('the offer comes only once', !twice);

// ---------------- 7. screen shake ----------------
const sh = await p.evaluate(() => {
  const app = window.zoomies, race = app.race;
  const off = (mode) => {
    app.settings.shake = mode;
    race.shake = 0.8;
    race._updateCamera(1 / 60);
    return race.camera.position.distanceTo(race.camPos);
  };
  const normal = off('normal');
  const none = off('off');
  app.hitStopT = 0; app.hitStopCool = 0;
  app.coach.feel('hit');
  const hsOff = app.hitStopT;
  app.settings.shake = 'normal';
  app.coach.feel('hit');
  const hsOn = app.hitStopT;
  app.coach.feel('hit');
  const stacked = app.hitStopT;
  return { normal, none, hsOff, hsOn, stacked };
});
check('Screen shake Normal moves the camera', sh.normal > 0, JSON.stringify(sh));
check('Screen shake Off keeps the camera still', sh.none === 0);
check('hit-stop: off with shake Off, 70 ms on Normal, never stacked', sh.hsOff === 0 && sh.hsOn > 0.06 && sh.hsOn <= 0.08 && sh.stacked === sh.hsOn);
// a boost + hit frame sequence
await p.evaluate(() => { const app = window.zoomies; app.hitStopT = 0; app.hitStopCool = 0; app.race.player.startBoost(1.2, 14); app.race.shake = 0.6; app.paused = false; });
for (const ms of [0, 120, 300, 700]) {
  if (ms) await p.waitForTimeout(ms === 120 ? 120 : ms === 300 ? 180 : 400);
  await p.screenshot({ path: `onb/13-feel-${ms}.png` });
}
const fov = await p.evaluate(() => window.zoomies.race.camera.fov);
console.log('fov during boost', fov.toFixed(1));
await p.evaluate(() => { window.zoomies.paused = true; });

// ---------------- 8. Driving School ----------------
const before = await p.evaluate(() => ({ coins: window.zoomies.career.coins, xp: window.zoomies.career.xp }));
await p.evaluate(() => { window.zoomies.startSchool('career'); window.zoomies.paused = true; });
const ds = await p.evaluate(() => ({ karts: window.zoomies.race.karts.length, i: window.zoomies.coach.lessons && window.zoomies.coach.lessons.i }));
check('Driving School: a solo lap with the lessons from the start', ds.karts === 1 && ds.i === 0, JSON.stringify(ds));
await until(p, 'results', 60 * 200);
const after = await p.evaluate(() => ({ cur: window.zoomies.ui.current, title: document.getElementById('res-title') ? document.getElementById('res-title').textContent : '', coins: window.zoomies.career.coins, xp: window.zoomies.career.xp }));
check('Driving School ends on its own results', after.cur === 'results' && /Lap done/.test(after.title), JSON.stringify(after));
check('Driving School pays nothing', after.coins === before.coins && after.xp === before.xp);
await p.evaluate(() => { window.zoomies.paused = false; });
await p.screenshot({ path: 'onb/14-school-done.png' });
await p.tap('#res-buttons [data-go="schoolout"]');
await p.waitForTimeout(500);
check('Done goes back to the career hub', await p.evaluate(() => window.zoomies.ui.current === 'career'));
await p.screenshot({ path: 'onb/15-hub.png' });

// reload: an existing player never sees the intro again
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
check('returning player: no first-run title', await p.evaluate(() => !document.getElementById('scr-title').classList.contains('first-run')));
// first online lobby tip, once
await p.evaluate(() => window.zoomies.ui.lobby('start'));
const lt = await p.evaluate(() => document.getElementById('lobby-error').textContent);
await p.evaluate(() => window.zoomies.ui.lobby('start'));
const lt2 = await p.evaluate(() => document.getElementById('lobby-error').textContent);
check('first online lobby shows a tip once', /host/i.test(lt) && !lt2, lt);
await p.context().close();

// ---------------- 9. desktop ----------------
p = await open(false);
await p.screenshot({ path: 'onb/16-title-desktop.png' });
await p.click('[data-go="story"]');
await p.waitForTimeout(400);
await p.screenshot({ path: 'onb/17-keys-desktop.png' });
check('desktop: the controls step shows the keyboard', await p.evaluate(() => window.zoomies.ui.current === 'intro' && getComputedStyle(document.querySelector('.intro-keys')).display !== 'none' && window.zoomies.settings.steering === 'keys'));
await p.keyboard.press('Enter');
await p.waitForTimeout(400);
check('desktop: Enter moves on', await p.evaluate(() => window.zoomies.settings.introDone === true));
await p.evaluate(() => { const app = window.zoomies; app.startCareerEvent('c1-0'); app.paused = true; });
await until(p, 'race');
await tick(p, 0.2);
await tick(p, 1.5, 1);
await tick(p, 1.4);
c = await coach(p);
check('desktop: drift lesson names SPACE, no THROW BACK lesson', /SPACE/.test(c.text), JSON.stringify(c));
await shot(p, 'onb/18-lesson-desktop.png');
await p.evaluate(() => { const app = window.zoomies, k = app.race.player; app.coach.event('driftLevel', 1, k); app.coach.event('driftBoost', 1, k); k.item = 'ball'; app.coach.event('orb', null, k); app.coach.tick(1.4); app.coach.event('used', 'ball', k); });
check('desktop: lessons end after the item lesson', await p.evaluate(() => !window.zoomies.coach.teaching && window.zoomies.settings.lessonsDone));
await p.evaluate(() => { const app = window.zoomies; app.settings.tips = {}; app.coach.lastTip = -99; app.coach.event('orb', null, app.race.player); app.coach.tick(0.1); });
await shot(p, 'onb/19-tip-desktop.png');

await b.close();
console.log(`errors ${fails}`);
process.exit(fails ? 1 : 0);
