// Track events in the rest of the game: the Career and League assignment (off / signature / wild, evOnly),
// stable seeds, the Storm Week and Calm Skies twists (Daily and Weekly), the event chips and Gramps hints on
// the cards, the new trophies and the saved list of seen events (hostile saves, merging); screenshots at
// 852x393 and 1470x860 in ui/ (eventsint-*.png).
//
//   node run.mjs eventsint
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
let p = await ctx.newPage();
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const watch = (pg) => {
  pg.setDefaultTimeout(120000);
  pg.on('pageerror', (e) => { fails++; console.log('[pageerror]', e.message, e.stack?.slice(0, 600)); });
  pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) console.log('[console]', m.text().slice(0, 300)); });
};
watch(p);
const URL = 'http://localhost:8000/index.html';
const KEY = 'zoomies-career-v1';
const boot = async (save, fixed) => {
  await p.close();
  p = await ctx.newPage();
  watch(p);
  if (fixed) await p.clock.setFixedTime(fixed);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, save || null]);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
};
const shot = async (name) => {
  await p.evaluate(() => { window.zoomies.paused = true; });
  await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect.getComputedTiming().iterations === Infinity), null, { timeout: 20000 }).catch(() => {});
  for (const [w, h, tag] of [[852, 393, 'phone'], [1470, 860, 'desk']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `ui/eventsint-${name}-${tag}.png` });
  }
  await p.setViewportSize({ width: 852, height: 393 });
  await p.waitForTimeout(300);
};
// A save that has finished the story and every chapter scene, with a lot of the League open.
const storyDone = (extra = {}) => {
  const seen = { 'c1-prologue': true, 'L1-intro': true };
  const done = { 'c1-0': true };
  for (let i = 1; i <= 7; i++) { seen[`c${i}-intro`] = true; seen[`c${i}-boss`] = true; seen[`c${i}-outro`] = true; done[`c${i}-b`] = true; for (let k = 1; k <= 4; k++) done[`c${i}-${k}`] = true; }
  return {
    v: 1, pv: 2, coins: 5000, racer: 'mochi', racers: ['mochi', 'hopper', 'zorp', 'pip', 'ember', 'volt', 'rexi', 'bruno'], body: 'classic', bodies: ['buggy', 'classic', 'comet'], paint: 'stock', paints: ['stock'],
    champion: true, xp: 6000, beaten: ['hopper', 'zorp', 'pip', 'ember', 'volt', 'rexi', 'bruno'], stars: {}, done, seen, ...extra,
  };
};

// ---------------- 1. the assignment table (constants) ----------------
await boot();
const asg = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const E = await import('./src/events.js');
  const out = { rows: [], bad: [] };
  for (const [name, list] of [['story', C.CHAPTERS], ['league', C.LEAGUE]]) for (const ch of list) {
    if (ch.ev !== undefined && !C.EV_ASSIGN.includes(ch.ev)) out.bad.push(`${ch.id} ev ${ch.ev}`);
    for (const ev of ch.events) {
      if (ev.ev !== undefined && !C.EV_ASSIGN.includes(ev.ev)) out.bad.push(`${ev.id} ev ${ev.ev}`);
      if (ev.evOnly !== undefined && !(Array.isArray(ev.evOnly) && ev.evOnly.every((id) => E.EVENTS[id]))) out.bad.push(`${ev.id} evOnly`);
      const plan = C.evPlan(ev, ch);
      out.rows.push(`${ev.id}:${ev.type}:${plan.mode}`);
    }
    out[`${name}-${ch.id}`] = ch.events.map((ev) => C.evPlan(ev, ch).mode[0]).join('');
  }
  // every id a track lists exists, and each event's hint text is short
  out.hintsOk = Object.keys(C.EV_HINTS).every((id) => E.EVENTS[id] && C.EV_HINTS[id].length < 120);
  out.assignedNoTrackEvents = [];
  return out;
});
console.log('assignment', JSON.stringify(Object.fromEntries(Object.entries(asg).filter(([k]) => k !== 'rows'))));
check('ev fields are off / signature / wild and evOnly ids exist', asg.bad.length === 0, asg.bad.join('; '));
const MODES = { 'story-c1': 'oooooo', 'story-c2': 'noono', 'story-c3': 'nnnon', 'story-c4': 'nnnon', 'story-c5': 'nonnn', 'story-c6': 'wnonw', 'story-c7': 'wownw', 'league-L1': 'nnonnn', 'league-L2': 'nnownw', 'league-L3': 'wwowww' };
check('prologue and chapter 1: events off', asg['story-c1'] === MODES['story-c1'] && asg.rows.includes('c1-0:race:off'));
for (const [k, v] of Object.entries(MODES)) check(`assignment ${k}: ${v} (o off, n Normal, w Wild, per event)`, asg[k] === v, asg[k]);
check('every Time Trial event is off', asg.rows.filter((r) => r.includes(':time:')).every((r) => r.endsWith(':off')));
check('hints exist only for real events', asg.hintsOk);

// ---------------- 2. seeds ----------------
const sd = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const P = await import('./src/profile.js');
  const a = C.evSeedFor('c3-1', 1), b2 = C.evSeedFor('c3-1', 2), c = C.evSeedFor('c3-1', 1, 1);
  const seeds = [];
  for (const id of ['c3-1', 'c6-b', 'L3-5']) for (let at = 1; at <= 40; at++) for (let i = 0; i < 4; i++) seeds.push(C.evSeedFor(id, at, i));
  return { a, again: C.evSeedFor('c3-1', 1), differs: a !== b2 && a !== c && b2 !== c, ok: seeds.every((s) => Number.isInteger(s) && s >= 0 && s <= 0x7fffffff), unique: new Set(seeds).size / seeds.length, daily: P.evSeedOf('daily#2026-10-22') };
});
console.log('seeds', JSON.stringify(sd));
check('seed scheme is stable: pinned values for the same event and attempt', sd.a === 1912533510 && sd.again === sd.a && sd.daily === 297377773, `${sd.a} ${sd.daily}`);
check('a retry or another cup race gets another seed; all in range', sd.differs && sd.ok && sd.unique > 0.99, `unique ${sd.unique}`);

// ---------------- 3. twists: Storm Week, Calm Skies ----------------
const tw = await p.evaluate(async () => {
  const P = await import('./src/profile.js');
  const W = await import('./src/weekly.js');
  const out = {};
  out.ids = P.DAILY_MODS.map((m) => m.id).join();
  out.storm = P.DAILY_MODS.find((m) => m.id === 'storm').evMode;
  out.calm = P.DAILY_MODS.find((m) => m.id === 'calm').evMode;
  // the Daily never rolls them (its old days stay as they were), and its difficulty is the old formula
  let dailyNew = 0;
  for (let i = 0; i < 800; i++) { const d = new Date(Date.UTC(2026, 0, 1) + i * 864e5); if (['storm', 'calm'].includes(P.dailyFor(P.today(d)).mod.id)) dailyNew++; }
  out.dailyNew = dailyNew;
  // the Weekly Cup: tracks, class and difficulty do not depend on the twist roll; the twist is a plain one, Storm Week or Calm Skies
  const mods = {}, bad = [];
  for (let y = 2026; y < 2030; y++) for (let n = 1; n <= 52; n++) {
    const k = `${y}-W${String(n).padStart(2, '0')}`, w = W.weeklyFor(k);
    mods[w.mod.id] = (mods[w.mod.id] || 0) + 1;
    if (['storm', 'calm'].includes(w.mod.id) && (w.mod.cls || w.mod.diff)) bad.push(k);
    if (!['chill', 'zoom', 'turbo'].includes(w.cls) || !['normal', 'hard'].includes(w.diff)) bad.push(k + ' cd');
  }
  out.mods = mods; out.bad = bad;
  out.next = [44, 45, 46, 47].map((n) => { const w = W.weeklyFor(`2026-W${n}`); return `W${n} ${w.mod.id} ${w.cls}/${w.diff} ${w.tracks.join(',')}`; });
  return out;
});
console.log('twists', JSON.stringify(tw));
check('Storm Week and Calm Skies are the last two twists, Wild and Off', tw.ids.endsWith(',storm,calm') && tw.storm === 'wild' && tw.calm === 'off', tw.ids);
check('the Daily never rolls them', tw.dailyNew === 0);
check('the Weekly rolls both, with an ordinary class and difficulty', tw.mods.storm >= 10 && tw.mods.calm >= 5 && tw.bad.length === 0, JSON.stringify(tw.mods));
check('next weeks pinned (old weeks keep their cup)', tw.next.join('|') === 'W44 storm zoom/hard cloud,candy,hollow,moon|W45 calm zoom/hard hollow,sprout,gear,downs|W46 pure zoom/normal neon,gear,sprout,candy|W47 bombs zoom/hard blossom,downs,neon,glacier', tw.next.join('|'));

// ---------------- 4. hostile saves, merging, trophies ----------------
const sv = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const P = await import('./src/profile.js');
  const S = await import('./src/sync.js');
  const out = {};
  const known = ['blizzard', 'sandstorm'];
  const mk = (extra) => ({ ...C.newCareer(), ...extra });
  const hostile = (v) => C.cleanCareer(mk({ evSeen: v })).evSeen;
  out.junk = [hostile('blizzard'), hostile({ 0: 'blizzard' }), hostile(null), hostile(7), hostile([1, null, {}, ['x'], 'x'.repeat(100), '__proto__', 'nonsense']), hostile(['blizzard', 'blizzard', 'sandstorm'])];
  out.big = hostile(Array.from({ length: 5000 }, (_, i) => (i % 2 ? 'blizzard' : `e${i}`))).length;
  out.stats = C.cleanCareer(mk({ stats: { dodgeBest: -4, surfs: 'x', eyes: 1e99 } })).stats;
  out.fresh = C.newCareer().evSeen.length;
  out.old = C.cleanCareer({ v: 1, coins: 5 }).evSeen.length; // a save from before the field
  out.saveRound = JSON.stringify(C.cleanCareer(JSON.parse(JSON.stringify(mk({ evSeen: known })))).evSeen);
  // merge: union of seen events, the better dodge race, surfs add
  const A = mk({ evSeen: ['blizzard'], stats: { dodgeBest: 4, surfs: 3 } }), B = mk({ evSeen: ['sandstorm', 'blizzard'], stats: { dodgeBest: 9, surfs: 5 } });
  const m = S.mergeCareer(A, B), m2 = S.mergeCareer(B, A);
  out.merge = [m.evSeen.slice().sort().join(), m2.evSeen.slice().sort().join(), m.stats.dodgeBest, m2.stats.dodgeBest, m.stats.surfs];
  out.mergeBad = S.mergeCareer(mk({ evSeen: ['nonsense', 'blizzard'] }), mk({ evSeen: 'x' })).evSeen.join();
  // trophies: each pays once
  const t = C.newCareer();
  const c0 = t.coins, got = [];
  const NEW = ['surf10', 'dodge10', 'eye', 'weather'];
  const ids = (l) => l.map((a) => a.id).filter((x) => NEW.includes(x)).join();
  P.awardRace(t, { mode: 'quick', place: 1, styleCounts: { 'STORM SURFER': 6 } });
  got.push(ids(P.checkAchievements(t)));
  P.awardRace(t, { mode: 'quick', place: 1, styleCounts: { 'STORM SURFER': 4 } });
  got.push(ids(P.checkAchievements(t)));
  got.push(ids(P.checkAchievements(t)));
  P.awardRace(t, { mode: 'quick', place: 1, styleCounts: { 'STORM SURFER': 20 } });
  got.push(ids(P.checkAchievements(t)));
  out.surfer = got; out.surfCoins = t.coins - c0;
  const d = C.newCareer();
  for (let i = 0; i < 5; i++) P.awardRace(d, { mode: 'quick', place: 2, styleCounts: { 'DODGED!': 4 } });
  const none = P.checkAchievements(d).map((a) => a.id).filter((x) => NEW.includes(x)).join();
  P.awardRace(d, { mode: 'quick', place: 2, styleCounts: { 'DODGED!': 11 } });
  const first = P.checkAchievements(d).map((a) => a.id).filter((x) => NEW.includes(x)).join();
  P.awardRace(d, { mode: 'quick', place: 2, styleCounts: { 'DODGED!': 12 } });
  out.dodge = [none, first, ids(P.checkAchievements(d)), d.stats.dodgeBest];
  const e = C.newCareer();
  P.awardRace(e, { mode: 'quick', place: 2, evEye: false });
  const e0 = P.checkAchievements(e).map((a) => a.id).filter((x) => NEW.includes(x)).join();
  P.awardRace(e, { mode: 'quick', place: 2, evEye: true });
  const e1 = P.checkAchievements(e).map((a) => a.id).filter((x) => NEW.includes(x)).join();
  P.awardRace(e, { mode: 'quick', place: 2, evEye: true });
  out.eye = [e0, e1, ids(P.checkAchievements(e)), e.stats.eyes];
  const w = C.newCareer();
  out.sigs = P.SIGNATURE_EVENTS.slice();
  const half = P.SIGNATURE_EVENTS.slice(0, -1);
  P.awardRace(w, { mode: 'quick', place: 2, evSeen: [...half, 'madeup', 7, null] });
  const w0 = P.checkAchievements(w).map((a) => a.id).filter((x) => NEW.includes(x)).join();
  P.awardRace(w, { mode: 'quick', place: 2, evSeen: P.SIGNATURE_EVENTS });
  const w1 = P.checkAchievements(w).map((a) => a.id).filter((x) => NEW.includes(x)).join();
  out.weather = [w0, w1, ids(P.checkAchievements(w)), w.evSeen.includes('madeup')];
  // bounded
  const z = C.newCareer();
  P.awardRace(z, { mode: 'quick', place: 1, evSeen: ['tide', 'sandstorm', 'blizzard', 'lavaRain', 'eruption', 'avalanche', 'nope'] });
  out.bounded = z.evSeen.length <= 60 && !z.evSeen.includes('nope') ? 60 : -1;
  out.achNames = ['surf10', 'dodge10', 'eye', 'weather'].map((id) => { const a = P.ACHIEVEMENTS.find((x) => x.id === id); return a && `${a.name}:${a.reward}`; });
  out.total = P.ACHIEVEMENTS.length;
  return out;
});
console.log('saves', JSON.stringify(sv));
check('hostile evSeen: not a list, junk, proto names, unknown ids, duplicates all cleaned', JSON.stringify(sv.junk) === JSON.stringify([[], [], [], [], [], ['blizzard', 'sandstorm']]), JSON.stringify(sv.junk));
check('evSeen is bounded and a new or old save starts empty', sv.big <= 60 && sv.fresh === 0 && sv.old === 0, `${sv.big}`);
check('hostile stats stay whole numbers', sv.stats.dodgeBest === 0 && sv.stats.eyes === 1e9 && sv.stats.surfs === undefined, JSON.stringify(sv.stats));
check('merging two saves: seen events are united, the better dodge race wins, surf counts take the higher without a shared sync base', sv.merge.join('|') === 'blizzard,sandstorm|blizzard,sandstorm|9|9|5', sv.merge.join('|'));
check('merging a hostile list keeps only known ids', sv.mergeBad === 'blizzard', sv.mergeBad);
check('Storm Surfer is awarded once, at 10 gust or crest boosts', JSON.stringify(sv.surfer) === JSON.stringify(['', 'surf10', '', '']), JSON.stringify(sv.surfer));
check('Dodge Master needs 10 dodges in ONE race, and is awarded once', sv.dodge[0] === '' && sv.dodge[1] === 'dodge10' && sv.dodge[2] === '' && sv.dodge[3] === 12, JSON.stringify(sv.dodge));
check('Eye of the Storm is awarded once', sv.eye[0] === '' && sv.eye[1] === 'eye' && sv.eye[2] === '' && sv.eye[3] === 2, JSON.stringify(sv.eye));
check('Weather Report needs every signature event, ignores made-up ids, awarded once', sv.weather[0] === '' && sv.weather[1] === 'weather' && sv.weather[2] === '' && sv.weather[3] === false, JSON.stringify(sv.weather));
check('seen list is bounded at 60', sv.bounded === 60);
console.log('trophies', JSON.stringify(sv.achNames), 'total', sv.total, 'signatures', sv.sigs.join());

// ---------------- 5. the races get the right settings ----------------
await boot(storyDone());
const run = await p.evaluate(async () => {
  const app = window.zoomies;
  const C = await import('./src/career.js');
  const out = {};
  const go = (id) => {
    app.gp = null;
    app.startCareerEvent(id);
    app.paused = true;
    const r = app.race, cfg = app.lastCfg;
    return { id, mode: cfg.evMode, seed: cfg.evSeed, only: cfg.evOnly || null, evs: r.evs ? r.evs.mode : null, ids: r.trackDef.events || null, n: r.evs ? r.evs.sched.length : 0 };
  };
  out.pro = go('c1-0');
  out.c11 = go('c1-1');
  out.c31 = go('c3-1');
  out.c31again = go('c3-1'); // the next attempt of the same event: a new seed
  out.c34 = go('c3-4'); // a time event
  out.c61 = go('c6-1');
  out.c6b = go('c6-b');
  out.L24 = go('L2-4');
  out.L36 = go('L3-6');
  // an event that wants one specific storm
  const ev = C.eventById('c3-3').ev;
  ev.evOnly = ['avalanche']; ev.ev = 'signature';
  out.only = go('c3-3');
  delete ev.evOnly; delete ev.ev;
  // a cup: each race has its own seed from the same attempt
  app.gp = null;
  app.startCareerEvent('c7-b');
  app.paused = true;
  out.cup0 = { mode: app.lastCfg.evMode, seed: app.lastCfg.evSeed, att: app.careerRun.attempt };
  app.gp.index = 1; app.startGPRace(); app.paused = true;
  out.cup1 = { mode: app.lastCfg.evMode, seed: app.lastCfg.evSeed };
  app.gp.index = 0; app.startGPRace(); app.paused = true;
  out.cup0again = { seed: app.lastCfg.evSeed };
  out.exp = { c31: [C.evSeedFor('c3-1', 1), C.evSeedFor('c3-1', 2)], cup0: C.evSeedFor('c7-b', 1, 0), cup1: C.evSeedFor('c7-b', 1, 1) };
  // Driving School and Time Trial are always off, even with the setting on Wild
  app.settings.trackEvents = 'wild';
  app.startSchool('title'); app.paused = true;
  out.school = app.race.evs ? 'events' : 'none';
  app.startRace({ mode: 'tt', trackId: 'frost', player: 'mochi', grid: ['mochi'], speedClass: 'zoom', difficulty: 'normal' }); app.paused = true;
  out.tt = app.race.evs ? 'events' : 'none';
  // the Daily stays calm whatever the setting says
  app.startDaily(); app.paused = true;
  out.daily = app.race.evs ? 'events' : 'none';
  // Quick Race follows the setting; a twist can set it
  const P = await import('./src/profile.js');
  const storm = P.DAILY_MODS.find((m) => m.id === 'storm'), calm = P.DAILY_MODS.find((m) => m.id === 'calm');
  const quick = (mods) => { app.startRace({ mode: 'quick', trackId: 'frost', player: 'mochi', grid: ['mochi', 'pip'], speedClass: 'zoom', difficulty: 'normal', mods }); app.paused = true; return app.race.evs ? app.race.evs.mode : 'none'; };
  app.settings.trackEvents = 'normal';
  out.quickNormal = quick(null);
  out.stormTwist = quick(storm);
  app.settings.trackEvents = 'wild';
  out.calmTwist = quick(calm);
  out.daySeed = P.evSeedOf(`daily#${P.dailyFor().day}`);
  return out;
});
console.log('run', JSON.stringify(run));
check('prologue and chapter 1 races: events off, nothing scheduled', run.pro.mode === 'off' && run.pro.evs === null && run.c11.mode === 'off' && run.c11.evs === null && run.pro.seed === 0);
check('Cold Start (chapter 3, Frostbite): Normal with the track\'s own events and the pinned seed', run.c31.mode === 'normal' && run.c31.evs === 'normal' && run.c31.n >= 1 && run.c31.seed === run.exp.c31[0], JSON.stringify(run.c31));
check('a retry gets a new seed, reproducible from the event and attempt', run.c31again.seed === run.exp.c31[1] && run.c31again.seed !== run.c31.seed);
check('Time Trial events never have events', run.c34.mode === 'off' && run.c34.evs === null);
check('Hot Wheels (chapter 6) and the boss duel are Wild; the League lava run too', run.c61.mode === 'wild' && run.c6b.mode === 'wild' && run.L24.mode === 'wild' && run.c61.evs === 'wild', `${run.c61.mode} ${run.c6b.mode} ${run.L24.mode}`);
check('League season 3 final duel is Wild', run.L36.mode === 'wild');
check('evOnly cuts the track\'s list to the wanted event', run.only.evs === 'normal' && JSON.stringify(run.only.ids) === JSON.stringify(['avalanche']), JSON.stringify(run.only));
check('a cup: every race has its own seed, the same on a replay', run.cup0.mode === 'wild' && run.cup0.seed === run.exp.cup0 && run.cup1.seed === run.exp.cup1 && run.cup0again.seed === run.cup0.seed && run.cup0.seed !== run.cup1.seed, JSON.stringify([run.cup0, run.cup1, run.cup0again]));
check('Driving School, Time Trial and the Daily stay calm even with the setting on Wild', run.school === 'none' && run.tt === 'none' && run.daily === 'none');
check('Quick Race follows the setting; Storm Week makes it Wild and Calm Skies makes it Off', run.quickNormal === 'normal' && run.stormTwist === 'wild' && run.calmTwist === 'none', `${run.quickNormal} ${run.stormTwist} ${run.calmTwist}`);

// ---------------- 6. Weekly Cup in Storm Week (fixed to W44) ----------------
await boot(storyDone(), '2026-10-27T10:00:00Z');
const wk = await p.evaluate(async () => {
  const app = window.zoomies;
  const W = await import('./src/weekly.js');
  const P = await import('./src/profile.js');
  const w = W.weeklyFor();
  app.startWeekly(); app.paused = true;
  const c0 = { mode: app.lastCfg.evMode ?? null, seed: app.lastCfg.evSeed, mods: app.lastCfg.mods && app.lastCfg.mods.id, cls: app.lastCfg.speedClass, diff: app.lastCfg.difficulty };
  app.gp.index = 2; app.startGPRace(); app.paused = true;
  const c2 = { seed: app.lastCfg.evSeed };
  return { week: w.week, mod: w.mod.id, cls: w.cls, diff: w.diff, c0, c2, e0: P.evSeedOf(`weekly#${w.week}#0`), e2: P.evSeedOf(`weekly#${w.week}#2`), ev: app.race.evs ? 'events' : 'none' };
});
console.log('weekly', JSON.stringify(wk));
check('Storm Week: the cup runs with Wild events, per-race seeds, its own class and difficulty', wk.week === '2026-W44' && wk.mod === 'storm' && wk.c0.mods === 'storm' && wk.c0.cls === wk.cls && wk.c0.diff === wk.diff && wk.c0.seed === wk.e0 && wk.c2.seed === wk.e2, JSON.stringify(wk));

// ---------------- 7. screenshots ----------------
await p.evaluate(() => document.querySelector('[data-go="weekly"]').click());
await p.waitForTimeout(900);
const wkCard = await p.evaluate(() => ({ mod: document.getElementById('weekly-mod').textContent, desc: document.getElementById('weekly-desc').textContent }));
check('Weekly card names the twist and what it does to events', wkCard.mod === 'Storm Week' && /event/i.test(wkCard.desc), JSON.stringify(wkCard));
await shot('weekly-storm');

await boot(storyDone({ done: { ...storyDone().done, 'L1-1': true, 'L1-2': true, 'L1-3': true, 'L1-6': true } }));
await p.evaluate(() => { const a = window.zoomies; a.openCareer(); });
await p.waitForTimeout(900);
for (let n = 0; n < 40 && await p.evaluate(() => window.zoomies.ui.current === 'story'); n++) { await p.tap('#scr-story .story-box'); await p.waitForTimeout(200); }
const card = async (ci, evId, name, league) => {
  await p.evaluate(([ci, evId, league]) => { const u = window.zoomies.careerUI; u.league = league; u.ci = ci; u.sel = evId; u.render(); }, [ci, evId, league]);
  await p.waitForTimeout(1200);
  const t = await p.evaluate(() => { const el = document.querySelector('#ev-list .ev.sel'); return el ? { chip: [...el.querySelectorAll('.evc')].map((x) => x.textContent), tip: (el.querySelector('.gtip') || {}).textContent || '' } : null; });
  await shot(name);
  return t;
};
const c3 = await card(2, 'c3-1', 'career-card', false);
check('Career card: Frostbite shows the event chip and the avalanche hint from Gramps', !!c3 && c3.chip.length === 1 && /Blizzard/.test(c3.chip[0]) && /Avalanche/.test(c3.chip[0]) && /Lift before the avalanche, then drift through the gap/.test(c3.tip), JSON.stringify(c3));
const l2 = await card(1, 'L2-4', 'league-card', true);
check('League card: Wild lava run shows its chip and Gramps hint', !!l2 && l2.chip.length === 1 && /Lava Rain/.test(l2.chip[0]) && /Wild/.test(l2.chip[0]) && /Glowing circles/.test(l2.tip), JSON.stringify(l2));
const c1 = await card(0, 'c1-1', 'career-card-calm', false);
check('Chapter 1 card has no event chip', !!c1 && c1.chip.length === 0, JSON.stringify(c1));
await p.evaluate(() => window.zoomies.careerUI.close && window.zoomies.careerUI.close());

// Quick Race track card with the chip, and the setting in sync
await boot(storyDone());
const qc = await p.evaluate(async () => {
  const app = window.zoomies;
  app.hud.show(false);
  app.settings.trackEvents = 'normal';
  app.ui.mode = 'quick'; app.ui.trackSelect();
  const text = () => [...document.querySelectorAll('#track-row .tcard')].map((c) => [c.querySelector('.tn').textContent, (c.querySelector('.evc') || {}).textContent || '']);
  const normal = text();
  app.settings.trackEvents = 'wild'; app.ui.trackSelect();
  const wild = text();
  app.settings.trackEvents = 'off'; app.ui.trackSelect();
  const off = text();
  app.settings.trackEvents = 'normal'; app.ui.mode = 'tt'; app.ui.trackSelect();
  const tt = text();
  const line = document.getElementById('ws-line').textContent;
  app.ui.mode = 'quick'; app.ui.trackSelect();
  return { normal, wild, off, tt, line };
});
const pick = (l, n) => (l.find((x) => x[0].startsWith(n)) || [])[1] || '';
check('Quick Race card: chip names the events and the setting', /Events: Normal/.test(pick(qc.normal, 'Frost')) && /Blizzard/.test(pick(qc.normal, 'Frost')) && /Events: Wild/.test(pick(qc.wild, 'Frost')) && /Events: Off/.test(pick(qc.off, 'Frost')), JSON.stringify([pick(qc.normal, 'Frost'), pick(qc.wild, 'Frost'), pick(qc.off, 'Frost')]));
check('a track with no events has no chip', pick(qc.normal, 'Sprout') === '' || /Harvest/.test(pick(qc.normal, 'Sprout')));
check('Time Trial cards say events are off there', /No events in Time Trial/.test(pick(qc.tt, 'Frost')) && /no track events/i.test(qc.line), JSON.stringify([pick(qc.tt, 'Frost'), qc.line]));
await p.evaluate(() => { const a = window.zoomies; a.settings.trackEvents = 'normal'; a.ui.mode = 'quick'; a.ui.trackSelect(); document.querySelector('#track-row .tcard:nth-child(2)').scrollIntoView({ inline: 'center' }); });
await p.waitForTimeout(900);
await shot('quick-card');
await p.evaluate(() => { const a = window.zoomies; a.ui.mode = 'tt'; a.ui.trackSelect(); });
await p.waitForTimeout(900);
await shot('tt-card');

console.log(`errors ${fails}`);
await b.close();
process.exit(fails ? 1 : 0);
