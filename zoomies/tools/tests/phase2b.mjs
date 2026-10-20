// Phase 2b: the Weekly Cup and Mastery (maths, save migration, merging, hostile saves, screens).
//   node run.mjs phase2b
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
const boot = async (save) => {
  await p.close();
  p = await ctx.newPage();
  watch(p);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, save || null]);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
};
const shot = async (name) => {
  await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect.getComputedTiming().iterations === Infinity), null, { timeout: 20000 }).catch(() => {});
  for (const [w, h, tag] of [[852, 393, 'phone'], [1470, 860, 'desk']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `ui/phase2b-${name}-${tag}.png` });
  }
  await p.setViewportSize({ width: 852, height: 393 });
  await p.waitForTimeout(300);
};

// ---------------- 1. week derivation ----------------
await boot();
const wk = await p.evaluate(async () => {
  const W = await import('./src/weekly.js');
  const at = (s) => W.weekOf(new Date(s));
  const out = {};
  // [UTC moment, ISO week from an independent calendar]
  const cases = [
    ['2020-12-31T12:00:00Z', '2020-W53'], ['2021-01-01T00:00:00Z', '2020-W53'], ['2021-01-03T23:59:59Z', '2020-W53'], ['2021-01-04T00:00:00Z', '2021-W01'],
    ['2024-12-29T23:59:59Z', '2024-W52'], ['2024-12-30T00:00:00Z', '2025-W01'], ['2025-12-29T00:00:00Z', '2026-W01'], ['2026-01-01T00:00:00Z', '2026-W01'],
    ['2027-01-03T23:59:59Z', '2026-W53'], ['2027-01-04T00:00:00Z', '2027-W01'],
    // clock changes (EU spring/autumn, US spring): the week must not move
    ['2026-03-28T23:30:00Z', '2026-W13'], ['2026-03-29T00:30:00Z', '2026-W13'], ['2026-03-29T23:59:59Z', '2026-W13'], ['2026-03-30T00:00:00Z', '2026-W14'],
    ['2026-10-25T00:30:00Z', '2026-W43'], ['2026-10-25T23:59:59Z', '2026-W43'], ['2026-10-26T00:00:00Z', '2026-W44'],
    ['2026-03-08T07:30:00Z', '2026-W10'], ['2026-11-01T06:30:00Z', '2026-W44'],
  ];
  out.bad = cases.filter(([d, w]) => at(d) !== w).map(([d, w]) => `${d} gave ${at(d)} want ${w}`);
  // start, previous week, time left
  out.start = new Date(W.weekStart('2026-W43')).toISOString();
  out.prev = [W.prevWeek('2021-W01'), W.prevWeek('2026-W01'), W.prevWeek('2026-W14'), W.prevWeek('2027-W01')];
  out.left = [W.msLeft(new Date('2026-10-25T23:00:00Z')), W.msLeft(new Date('2026-10-19T00:00:00Z')) / 864e5];
  out.text = [W.timeLeftText(new Date('2026-10-19T00:00:00Z')), W.timeLeftText(new Date('2026-10-25T21:30:00Z')), W.timeLeftText(new Date('2026-10-25T23:50:00Z'))];
  out.weekNum = W.weekNum('2026-W43');
  return out;
});
console.log('weeks', JSON.stringify(wk));
check('ISO week keys on year ends, W53 years, clock changes', wk.bad.length === 0, wk.bad.join('; '));
check('week start is Monday 00:00 UTC', wk.start === '2026-10-19T00:00:00.000Z');
check('previous week across year ends', JSON.stringify(wk.prev) === JSON.stringify(['2020-W53', '2025-W52', '2026-W13', '2026-W53']));
check('time left in the week', wk.left[0] === 36e5 && wk.left[1] === 7 && wk.text[0] === '7d 0h left' && wk.text[1] === '2h 30m left' && wk.text[2] === '10m left' && wk.weekNum === 43);

// ---------------- 2. the cup of the week ----------------
const cups = await p.evaluate(async () => {
  const W = await import('./src/weekly.js');
  const { TRACKS } = await import('./src/tracks.js');
  const size = Object.fromEntries(TRACKS.map((t) => [t.id, t.size]));
  const out = { bad: [], sigs: new Set(), mods: new Set(), diffs: new Set(), cls: new Set(), same: true, sizes: new Set() };
  for (let n = 1; n <= 53; n++) for (const y of [2025, 2026, 2027, 2028]) {
    const wkKey = `${y}-W${String(n).padStart(2, '0')}`;
    const c = W.weeklyFor(wkKey), c2 = W.weeklyFor(wkKey);
    if (JSON.stringify(c) !== JSON.stringify(c2)) out.same = false;
    const ts = c.tracks;
    const why = [];
    if (ts.length !== 4 || new Set(ts).size !== 4) why.push('not 4 different tracks');
    if (ts.some((t) => !size[t] || size[t] === 'Epic')) why.push('bad track');
    if (new Set(ts.map((t) => size[t])).size < 2) why.push('sizes not mixed');
    if (!['chill', 'zoom', 'turbo'].includes(c.cls) || !['normal', 'hard'].includes(c.diff)) why.push('class/difficulty');
    if (!W.WEEKLY_MODS.some((m) => m.id === c.mod.id)) why.push('twist');
    if (c.mod.cls && c.cls !== c.mod.cls) why.push('twist class');
    if (why.length) out.bad.push(`${wkKey}: ${why.join(',')}`);
    out.sigs.add(JSON.stringify([ts, c.mod.id, c.cls, c.diff]));
    out.mods.add(c.mod.id); out.diffs.add(c.diff); out.cls.add(c.cls);
    ts.forEach((t) => out.sizes.add(size[t]));
  }
  out.nSigs = out.sigs.size; out.nMods = out.mods.size; out.diffs = [...out.diffs]; out.cls = [...out.cls]; out.sizes = [...out.sizes];
  delete out.sigs; delete out.mods;
  out.consecutive = [0, 1, 2, 3].map((i) => { const w = W.weeklyFor(`2026-W${43 + i}`); return `${w.name}: ${w.tracks.join('/')} ${w.cls} ${w.diff} ${w.mod.id}`; });
  out.mods2 = W.WEEKLY_MODS.map((m) => m.id);
  return out;
});
console.log('cups', JSON.stringify(cups));
check('same week, same cup (always)', cups.same);
check('every cup has 4 different non-Epic tracks of mixed size, valid class/difficulty/twist', cups.bad.length === 0, cups.bad.slice(0, 3).join('; '));
check('different weeks give different cups (212 weeks)', cups.nSigs >= 200, `${cups.nSigs} different`);
check('twists, classes and difficulties vary', cups.nMods >= 6 && cups.diffs.length === 2 && cups.cls.length >= 2, `${cups.nMods} twists`);
for (const l of cups.consecutive) console.log('  ' + l);

// ---------------- 3. weekly rewards and streak ----------------
const rew = await p.evaluate(async () => {
  const W = await import('./src/weekly.js');
  const { newCareer } = await import('./src/career.js');
  const c = newCareer();
  const xpSum = (r) => r.xp;
  const out = {};
  const r1 = W.weeklyFinish(c, 3, '2026-W43'); // first podium: 250 XP, trophy, capsule
  out.first = [r1.xp, r1.trophy, r1.capsule, r1.streak, c.freeCaps, c.xp];
  const r2 = W.weeklyFinish(c, 3, '2026-W43'); // same again: nothing
  const r3 = W.weeklyFinish(c, 5, '2026-W43'); // worse: nothing
  out.same = [r2.xp, r2.improved, r2.trophy, r2.capsule, r3.xp, r3.improved, c.weekly.best];
  const r4 = W.weeklyFinish(c, 1, '2026-W43'); // improve to 1st: 500 - 250
  const r5 = W.weeklyFinish(c, 1, '2026-W43');
  out.improve = [r4.xp, r4.improved, r4.trophy, r4.capsule, r5.xp, c.weekly.best, c.xp, c.freeCaps, c.weekly.trophies.length];
  // farming: 8th -> 7th -> ... -> 4th -> 3rd -> 2nd -> 1st in a fresh week pays exactly 500 in total
  const f = newCareer();
  let tot = 0;
  for (const pl of [8, 7, 6, 5, 4, 8, 3, 3, 2, 4, 1, 1, 1]) tot += W.weeklyFinish(f, pl, '2026-W44').xp;
  out.farm = [tot, f.xp, f.freeCaps];
  // a finish outside the podium: 150, no trophy, no capsule
  const g = newCareer();
  const r6 = W.weeklyFinish(g, 6, '2026-W44');
  out.finish = [r6.xp, r6.trophy, r6.capsule, g.freeCaps, g.weekly.last, g.weekly.streak];
  // streaks: W43 W44 W45 podiums = 3, skip W46, W47 = 1; a non-podium week does not count
  const s = newCareer();
  const st = [];
  for (const [w, pl] of [['2026-W43', 2], ['2026-W44', 1], ['2026-W45', 3], ['2026-W46', 5], ['2026-W47', 2], ['2026-W48', 2]]) st.push(W.weeklyFinish(s, pl, w).streak);
  out.streak = st;
  out.alive = [W.weeklyStreak(s, '2026-W48'), W.weeklyStreak(s, '2026-W49'), W.weeklyStreak(s, '2026-W50')];
  out.across = (() => { const y = newCareer(); W.weeklyFinish(y, 1, '2020-W53'); return W.weeklyFinish(y, 1, '2021-W01').streak; })();
  // a new week forgets last week's placing but keeps trophies
  out.reset = [W.weeklyBest(s, '2026-W48'), W.weeklyBest(s, '2026-W49'), s.weekly.trophies.length, s.weekly.capGiven.length];
  // a XP/level check: xp is added through grant
  out.sum = xpSum(r1);
  return out;
});
console.log('rewards', JSON.stringify(rew));
check('first podium: 250 XP for 3rd, trophy, one capsule, streak 1', JSON.stringify(rew.first) === JSON.stringify([250, true, true, 1, 1, 250]));
check('retry with the same or a worse placing pays nothing', JSON.stringify(rew.same) === JSON.stringify([0, false, false, false, 0, false, 3]));
check('improving 3rd to 1st pays the 250 difference once, no 2nd trophy or capsule', JSON.stringify(rew.improve) === JSON.stringify([250, true, false, false, 0, 1, 500, 1, 1]));
check('retries cannot farm: a week pays 500 XP at most', JSON.stringify(rew.farm) === JSON.stringify([500, 500, 1]));
check('finishing outside the podium pays 150, no trophy or capsule', JSON.stringify(rew.finish) === JSON.stringify([150, false, false, 0, '', 0]));
check('streak counts consecutive podium weeks', JSON.stringify(rew.streak) === JSON.stringify([1, 2, 3, 3, 1, 2]), JSON.stringify(rew.streak));
check('streak stays alive one week, then ends', JSON.stringify(rew.alive) === JSON.stringify([2, 2, 0]));
check('streak continues across a year end (W53 to W01)', rew.across === 2);
check('new week: placing resets, trophies and capsules stay', JSON.stringify(rew.reset) === JSON.stringify([2, 0, 5, 5]));

// ---------------- 4. mastery ----------------
const ms = await p.evaluate(async () => {
  const M = await import('./src/mastery.js');
  const { newCareer } = await import('./src/career.js');
  const { awardRace } = await import('./src/profile.js');
  const { CHARACTERS } = await import('./src/characters.js');
  const out = {};
  out.thresholds = [0, 59, 60, 179, 180, 359, 360, 899, 900, 2699, 2700, 99999, -5, NaN, undefined, '900', Infinity].map((x) => M.masteryLevel(x).level);
  out.table = Array.from({ length: 10 }, (_, i) => M.levelAt(i + 1));
  out.progress = [M.masteryLevel(100), M.masteryLevel(2700)];
  out.gain = [M.masteryGain({ place: 1, style: 0 }), M.masteryGain({ place: 2, style: 400 }), M.masteryGain({ place: 8, style: 0 }), M.masteryGain({ mode: 'tt', place: 1, style: 100000 }), M.masteryGain({ mode: 'tt', place: 1, medal: { tier: 3 } })];
  // races it takes with one combo (a decent racer: 2nd place, 400 style = 38 a race)
  const c = newCareer();
  const need = {};
  for (let n = 1; n <= 200; n++) {
    awardRace(c, { mode: 'quick', place: 2, style: 400, racer: 'mochi', body: 'classic' });
    const L = M.masteryOf(c, 'r', 'mochi').level;
    for (const t of [3, 6, 10]) if (L >= t && !need[t]) need[t] = n;
  }
  out.need = need;
  out.capped = [c.mastery.r.mochi, c.mastery.b.classic];
  // a weak racer (8th, no style = 20 a race) and a great one (1st, big style = 55)
  out.weak = Math.ceil(M.MAX_XP / 20); out.great = Math.ceil(M.MAX_XP / M.masteryGain({ place: 1, style: 2000 }));
  // capsules: one free capsule per 5 levels gained across all racers and rides
  const d = newCareer();
  const caps = [];
  let before = 0, spent = 0;
  const ids = ['mochi', 'pip', 'bruno'];
  for (let n = 0; n < 150; n++) {
    const r = awardRace(d, { mode: 'quick', place: 1, style: 400, racer: ids[n % 3], body: n % 2 ? 'bike' : 'buggy' });
    if (r.mastery.caps) caps.push([n, M.totalLevels(d.mastery)]);
  }
  out.caps = caps.length; out.capLevels = d.mastery.capLevels; out.total = M.totalLevels(d.mastery);
  // only mastery: the free capsules in the save match the levels gained
  const e = newCareer();
  for (let n = 0; n < 150; n++) M.addMastery(e, { place: 1, style: 400, racer: ids[n % 3], body: n % 2 ? 'bike' : 'buggy' });
  out.free = e.freeCaps; out.eTotal = M.totalLevels(e.mastery);
  out.capsAt = caps.slice(0, 3);
  // titles
  out.titles = CHARACTERS.map((ch) => (M.TITLES[ch.id] || []).length);
  const all = CHARACTERS.flatMap((ch) => M.TITLES[ch.id] || []);
  out.unique = new Set(all).size === all.length && all.every((t) => t && t.length <= 32);
  out.at = ['mochi', 'pip'].map((id) => [M.titleFor(id, 1), M.titleFor(id, 2), M.titleFor(id, 3), M.titleFor(id, 5), M.titleFor(id, 6), M.titleFor(id, 9), M.titleFor(id, 10)]);
  out.unknown = [M.addMastery(newCareer(), { racer: 'nobody', body: 'nothing', place: 1 }), M.addMastery(newCareer(), { racer: 'mochi', place: 1 }) && 'racer only'];
  // Stats are never touched: kartStats does not read mastery
  const { kartStats } = await import('./src/karts.js');
  const { charById } = await import('./src/characters.js');
  const s0 = JSON.stringify(kartStats(charById('mochi'), 'classic', {}));
  d.mastery.r.mochi = 2700;
  out.stats = JSON.stringify(kartStats(charById('mochi'), 'classic', {})) === s0;
  return out;
});
console.log('mastery', JSON.stringify(ms));
check('level thresholds 60/180/360/.../2700, capped at 10, junk is level 1', JSON.stringify(ms.thresholds) === JSON.stringify([1, 1, 2, 2, 3, 3, 4, 5, 6, 9, 10, 10, 1, 1, 1, 1, 1]), JSON.stringify(ms.thresholds));
check('threshold table', JSON.stringify(ms.table) === JSON.stringify([0, 60, 180, 360, 600, 900, 1260, 1680, 2160, 2700]));
check('progress inside a level', ms.progress[0].level === 2 && ms.progress[0].into === 40 && ms.progress[0].need === 120 && ms.progress[1].level === 10 && ms.progress[1].need === 0);
check('race gain: finish 20 + podium + style (max 20) + 15 per medal tier', JSON.stringify(ms.gain) === JSON.stringify([35, 38, 20, 40, 65]), JSON.stringify(ms.gain));
check('level 10 takes roughly 60-80 races with one combo', ms.need[10] >= 60 && ms.need[10] <= 80 && ms.need[3] <= 8 && ms.need[6] >= 15 && ms.need[6] <= 35, JSON.stringify(ms.need));
check('weak and great racers still land in a sensible range', ms.weak <= 140 && ms.great >= 45, `${ms.weak} / ${ms.great}`);
check('XP is capped at level 10', ms.capped[0] === 2700 && ms.capped[1] === 2700);
check('a free capsule for every 5 levels gained, never twice', ms.caps === Math.floor(ms.total / 5) && ms.free === Math.floor(ms.eTotal / 5) && ms.free > 0 && ms.capLevels === ms.caps * 5, `${ms.caps} capsules, ${ms.total} levels, paid ${ms.capLevels}, free ${ms.free}`);
check('capsules arrive when the total reaches 5, 10, 15 levels', ms.capsAt.length === 3 && ms.capsAt.every((x, i) => Math.floor(x[1] / 5) === i + 1), JSON.stringify(ms.capsAt));
check('every racer has 3 unique titles', ms.titles.every((n) => n === 3) && ms.titles.length >= 20 && ms.unique);
check('titles unlock at levels 3, 6 and 10', ms.at.every((a) => a[0] === '' && a[1] === '' && a[2] && a[3] === a[2] && a[4] !== a[2] && a[5] === a[4] && a[6] !== a[4]));
check('unknown ids earn nothing, a known id alone still counts', ms.unknown[0] === null && ms.unknown[1] === 'racer only');
check('mastery never changes kart stats', ms.stats);

// ---------------- 5. migration of old saves ----------------
const mig = await p.evaluate(async () => {
  const { cleanCareer, newCareer } = await import('./src/career.js');
  const old = newCareer();
  delete old.weekly; delete old.mastery; delete old.missions;
  old.xp = 1234; old.coins = 77; old.freeCaps = 2; old.racers = ['mochi', 'pip'];
  const c = cleanCareer(JSON.parse(JSON.stringify(old)));
  const a = cleanCareer({ v: 1 });
  return { weekly: c.weekly, mastery: c.mastery, xp: c.xp, coins: c.coins, caps: c.freeCaps, racers: c.racers, bare: [a.weekly, a.mastery], round: JSON.stringify(cleanCareer(JSON.parse(JSON.stringify(c)))) === JSON.stringify(c) };
});
check('old save: weekly and mastery default to empty', JSON.stringify(mig.weekly) === JSON.stringify({ week: '', best: 0, trophies: [], streak: 0, last: '', capGiven: [] }) && JSON.stringify(mig.mastery) === JSON.stringify({ r: {}, b: {}, capLevels: 0 }));
check('old save keeps everything else', mig.xp === 1234 && mig.coins === 77 && mig.caps === 2 && mig.racers.length === 2);
check('minimal save loads; saving and loading again changes nothing', mig.bare[0].week === '' && mig.bare[1].capLevels === 0 && mig.round);
// and an old save really boots the game
await boot({ v: 1, coins: 500, racer: 'mochi', racers: ['mochi'], body: 'buggy', bodies: ['buggy'], paint: 'stock', paints: ['stock'], xp: 900, stats: { races: 12 }, ach: {}, daily: { done: '', streak: 0, best: 0 }, freeCaps: 0 });
const booted = await p.evaluate(() => { const c = window.zoomies.career; return [c.xp, c.weekly.best, Object.keys(c.mastery.r).length, window.zoomies.ui.current]; });
check('an old save boots into the title screen', booted[0] === 900 && booted[1] === 0 && booted[2] === 0 && booted[3] === 'title', JSON.stringify(booted));

// ---------------- 6. merging two saves ----------------
const mer = await p.evaluate(async () => {
  const { newCareer } = await import('./src/career.js');
  const { mergeCareer } = await import('./src/sync.js');
  const mk = (f) => { const c = newCareer(); c.racers = ['mochi']; f(c); return c; };
  const out = {};
  // same week: best placing, union of capsules and trophies
  let m = mergeCareer(
    mk((c) => { c.weekly = { week: '2026-W43', best: 3, trophies: ['2026-W42', '2026-W43'], streak: 2, last: '2026-W43', capGiven: ['2026-W43'] }; }),
    mk((c) => { c.weekly = { week: '2026-W43', best: 1, trophies: ['2026-W43', '2026-W41'], streak: 1, last: '2026-W43', capGiven: ['2026-W42'] }; }));
  out.same = [m.weekly.week, m.weekly.best, m.weekly.trophies, m.weekly.streak, m.weekly.last, m.weekly.capGiven];
  // same week, one device never raced it: its 0 does not win
  m = mergeCareer(mk((c) => { c.weekly = { week: '2026-W43', best: 0, trophies: [], streak: 0, last: '', capGiven: [] }; }), mk((c) => { c.weekly = { week: '2026-W43', best: 4, trophies: [], streak: 0, last: '', capGiven: [] }; }));
  out.zero = m.weekly.best;
  // older week loses
  m = mergeCareer(
    mk((c) => { c.weekly = { week: '2026-W42', best: 1, trophies: ['2026-W42'], streak: 1, last: '2026-W42', capGiven: ['2026-W42'] }; }),
    mk((c) => { c.weekly = { week: '2026-W43', best: 5, trophies: [], streak: 0, last: '', capGiven: [] }; }));
  out.older = [m.weekly.week, m.weekly.best, m.weekly.trophies, m.weekly.streak, m.weekly.last];
  // streak from the save that played the latest podium week
  m = mergeCareer(
    mk((c) => { c.weekly = { week: '2026-W44', best: 2, trophies: ['2026-W40', '2026-W44'], streak: 1, last: '2026-W44', capGiven: [] }; }),
    mk((c) => { c.weekly = { week: '2026-W42', best: 1, trophies: ['2026-W40', '2026-W41', '2026-W42'], streak: 3, last: '2026-W42', capGiven: [] }; }));
  out.streak = [m.weekly.streak, m.weekly.last, m.weekly.week, m.weekly.trophies.length];
  // trophies are capped
  const many = (n, off) => Array.from({ length: n }, (_, i) => `${2000 + ((i + off) % 90)}-W${String(1 + ((i + off) % 52)).padStart(2, '0')}`);
  m = mergeCareer(mk((c) => { c.weekly = { ...c.weekly, trophies: many(400, 0) }; }), mk((c) => { c.weekly = { ...c.weekly, trophies: many(400, 7) }; }));
  out.capped = m.weekly.trophies.length <= 200;
  // mastery: max per id, union of ids, capsules paid is the max
  m = mergeCareer(
    mk((c) => { c.mastery = { r: { mochi: 500, pip: 70 }, b: { classic: 100 }, capLevels: 5 }; }),
    mk((c) => { c.mastery = { r: { mochi: 300, bruno: 2000 }, b: { classic: 900, bike: 60 }, capLevels: 0 }; }));
  out.mast = [m.mastery.r, m.mastery.b, m.mastery.capLevels];
  // an old save merges with a new one
  const old = newCareer(); delete old.weekly; delete old.mastery;
  m = mergeCareer(old, mk((c) => { c.mastery = { r: { mochi: 400 }, b: {}, capLevels: 0 }; c.weekly = { week: '2026-W43', best: 2, trophies: ['2026-W43'], streak: 1, last: '2026-W43', capGiven: ['2026-W43'] }; }));
  out.old = [m.mastery.r.mochi, m.weekly.best, m.weekly.streak];
  out.symmetric = JSON.stringify(mergeCareer(old, m).weekly) === JSON.stringify(mergeCareer(m, old).weekly);
  return out;
});
console.log('merge', JSON.stringify(mer));
check('merge same week: best placing and union of capsules and trophies', JSON.stringify(mer.same) === JSON.stringify(['2026-W43', 1, ['2026-W41', '2026-W42', '2026-W43'], 2, '2026-W43', ['2026-W42', '2026-W43']]), JSON.stringify(mer.same));
check('merge: a device that has not raced the cup does not zero the best', mer.zero === 4);
check('merge: the older week loses, trophies kept', JSON.stringify(mer.older) === JSON.stringify(['2026-W43', 5, ['2026-W42'], 1, '2026-W42']), JSON.stringify(mer.older));
check('merge: streak comes from the save with the latest podium', JSON.stringify(mer.streak) === JSON.stringify([1, '2026-W44', '2026-W44', 4]), JSON.stringify(mer.streak));
check('merge: trophies capped', mer.capped);
check('merge mastery: max XP per id, all ids kept, capsules paid = max', JSON.stringify(mer.mast) === JSON.stringify([{ mochi: 500, pip: 70, bruno: 2000 }, { classic: 900, bike: 60 }, 5]), JSON.stringify(mer.mast));
check('merge with an old save works both ways', JSON.stringify(mer.old) === JSON.stringify([400, 2, 1]) && mer.symmetric);

// ---------------- 7. hostile saves ----------------
const bad = await p.evaluate(async () => {
  const { cleanCareer, newCareer, MAX_COUNT } = await import('./src/career.js');
  const { mergeCareer } = await import('./src/sync.js');
  const { MAX_XP } = await import('./src/mastery.js');
  const out = {};
  const hostile = JSON.parse(`{
    "weekly": {"week": "<img src=x onerror=alert(1)>", "best": 1e308, "trophies": ["2026-W43", "evil", 5, null, {"a":1}, "2026-W99999", "2026-W7", "__proto__"], "streak": -50, "last": ["2026-W43"], "capGiven": "2026-W43"},
    "mastery": {"r": {"mochi": 1e300, "__proto__": 5, "nobody": 100, "constructor": 9, "pip": "9999", "bruno": -40, "rexi": null, "volt": [1,2], "ember": 1e9}, "b": {"classic": 1, "bike": 1, "nothing": 5, "buggy": 3.7}, "capLevels": 1e12}
  }`);
  hostile.mastery.b.classic = Infinity; hostile.mastery.b.bike = NaN; // cannot be written as JSON text
  const c = cleanCareer(hostile);
  out.weekly = c.weekly;
  out.r = c.mastery.r; out.b = c.mastery.b; out.cap = c.mastery.capLevels;
  out.proto = ({}).polluted === undefined && Object.getPrototypeOf(c.mastery.r) === Object.prototype && !('nobody' in c.mastery.r) && !Object.prototype.hasOwnProperty.call(c.mastery.r, '__proto__');
  // wrong types everywhere
  const types = [null, 5, 'x', [], [1, 2], true, { r: 5, b: 'x' }, { r: [], b: [] }, { week: 5, best: 'a', trophies: 'x' }];
  out.types = types.map((t) => { const x = cleanCareer({ weekly: t, mastery: t }); return JSON.stringify([x.weekly, x.mastery]); });
  out.typesOk = out.types.every((s) => s.length < 400);
  // a huge string is not a week
  out.long = cleanCareer({ weekly: { week: '2026-W43' + 'x'.repeat(100000), last: '2026-W4' } }).weekly;
  // merging a hostile save stays within bounds
  const m = mergeCareer(hostile, newCareer());
  out.merged = [Object.keys(m.mastery.r), m.mastery.capLevels, m.weekly.trophies, m.weekly.best, m.weekly.week];
  out.max = MAX_XP;
  // too many keys in a mastery object are ignored: only known ids are looked up
  const big = {}; for (let i = 0; i < 50000; i++) big['k' + i] = 5;
  big.mochi = 70;
  out.big = Object.keys(cleanCareer({ mastery: { r: big, b: big } }).mastery.r);
  return out;
});
console.log('hostile', JSON.stringify(bad));
check('hostile weekly: junk week/last cleared, best bounded, only valid week keys kept', bad.weekly.week === '' && bad.weekly.best === 8 && JSON.stringify(bad.weekly.trophies) === JSON.stringify(['2026-W43']) && bad.weekly.streak === 0 && bad.weekly.last === '' && bad.weekly.capGiven.length === 0, JSON.stringify(bad.weekly));
check('hostile mastery: known ids only, XP capped, junk values dropped', JSON.stringify(bad.r) === JSON.stringify({ mochi: bad.max, ember: bad.max }) && JSON.stringify(bad.b) === JSON.stringify({ buggy: 4 }), JSON.stringify([bad.r, bad.b]));
check('hostile capLevels is bounded and a multiple of 5', bad.cap <= 1000 && bad.cap % 5 === 0);
check('no prototype pollution through mastery', bad.proto);
check('wrong types (null, numbers, strings, arrays) give empty defaults', bad.typesOk, bad.types.slice(0, 2).join(' | '));
check('a huge string is not a week', bad.long.week === '' && bad.long.last === '');
check('merging a hostile save stays clean', bad.merged[0].every((id) => ['mochi', 'ember'].includes(id)) && bad.merged[1] <= 1000 && bad.merged[2].length === 1 && bad.merged[3] <= 8 && bad.merged[4] === '', JSON.stringify(bad.merged));
check('50,000 junk keys are ignored, a known id inside still counts', JSON.stringify(bad.big) === JSON.stringify(['mochi']));

// ---------------- 8. the game: weekly cup flow, results, screens ----------------
await boot();
await p.evaluate(async () => {
  const app = window.zoomies;
  const W = await import('./src/weekly.js');
  const c = app.career;
  // a lived-in save: mastery on several racers and rides, a few Week badges
  c.xp = 4200; c.coins = 1200; c.freeCaps = 2;
  c.racers = ['mochi', 'pip', 'bruno', 'volt', 'ember'];
  c.bodies = ['buggy', 'classic', 'bike', 'comet'];
  c.mastery = { r: { mochi: 1300, pip: 190, bruno: 2700, volt: 70, ember: 920, zorp: 400 }, b: { classic: 1700, bike: 365, buggy: 60 }, capLevels: 15 };
  const wk = W.weekOf();
  c.weekly = { week: wk, best: 2, trophies: ['2026-W38', '2026-W40', '2026-W41', wk], streak: 3, last: wk, capGiven: [wk] };
  app.settings.char = 'mochi';
  app.settings.vehicle = 'classic';
  app.settings.introDone = true; // the Daily and Weekly cards only show after the first-run intro
  app.ui.title();
});
await p.waitForTimeout(500);
await shot('title');
const title = await p.evaluate(() => ({ weekly: document.getElementById('menu-weekly').innerText, daily: document.getElementById('menu-daily').innerText }));
console.log('title card', JSON.stringify(title));
check('title shows the Weekly Cup card with twist, time left and best placing', /left/.test(title.weekly) && /best 2nd/.test(title.weekly) && title.weekly.length > 12);
// the card must not spill out of its button
const cardFit = await p.evaluate(() => [...document.querySelectorAll('.menu-row.two .btn')].map((b) => [b.scrollWidth <= b.clientWidth + 1, Math.round(b.getBoundingClientRect().bottom)]));
check('weekly and daily cards fit their buttons and the screen', cardFit.every(([ok, bottom]) => ok && bottom < 393), JSON.stringify(cardFit));
await p.evaluate(() => document.querySelector('[data-go="weekly"]').click());
await p.waitForTimeout(600);
await shot('weekly-screen');
const wscr = await p.evaluate(() => [window.zoomies.ui.current, document.getElementById('weekly-facts').innerText, document.getElementById('weekly-reward').innerText.length]);
check('Weekly Cup screen opens with tracks, speed and best', wscr[0] === 'weekly' && /tracks/i.test(wscr[1]) && /2nd/i.test(wscr[1]) && wscr[2] > 50, wscr[1].replace(/\n/g, ' '));

// start the cup for real: tracks, twist, class, difficulty reach the races
const run = await p.evaluate(async () => {
  const app = window.zoomies;
  const W = await import('./src/weekly.js');
  const w = W.weeklyFor();
  app.ui.hideAll();
  app.startWeekly();
  const r = app.race;
  const { DIFFICULTY } = await import('./src/ai.js');
  const out = {
    gp: !!(app.gp && app.gp.weekly), tracks: JSON.stringify(app.gp.tracks) === JSON.stringify(w.tracks), track0: r.trackDef.id === w.tracks[0],
    mods: r.mods && r.mods.id === w.mod.id, diff: r.diff === DIFFICULTY[w.diff], mode: r.mode, hud: document.getElementById('hud-trackname').innerText.replace(/\n/g, ' '),
  };
  return out;
});
console.log('weekly run', JSON.stringify(run));
check('startWeekly builds the cup: 4 tracks, twist, difficulty, grand prix mode', run.gp && run.tracks && run.track0 && run.mods && run.mode === 'gp' && run.diff && /weekly cup/i.test(run.hud), JSON.stringify(run));

// finish the cup (fast): feed the final-standings screen a result and check rewards
const fin = await p.evaluate(async () => {
  const app = window.zoomies;
  const { CHARACTERS } = await import('./src/characters.js');
  const gp = app.gp;
  const before = { xp: app.career.xp, caps: app.career.freeCaps, best: app.career.weekly.best, tro: app.career.weekly.trophies.length };
  app.paused = true;
  const field = gp.field.slice();
  const table = field.map((id, i) => ({ ch: CHARACTERS.find((c) => c.id === id), pts: 50 - i * 4, isPlayer: id === gp.player, place: i + 1 }));
  // put the player 1st (improves on 2nd): +150 XP, no new trophy or capsule this week
  const me = table.find((t) => t.isPlayer);
  table.sort((a, b) => (a === me ? -1 : b === me ? 1 : b.pts - a.pts)).forEach((t, i) => { t.place = i + 1; t.pts = 60 - i * 5; });
  app.onWeeklyFinal(table, me);
  const after = { xp: app.career.xp, caps: app.career.freeCaps, best: app.career.weekly.best, tro: app.career.weekly.trophies.length };
  return { before, after, ui: app.ui.current, text: document.querySelector('#scr-results .rewards').innerText };
});
console.log('weekly final', JSON.stringify({ ...fin, text: fin.text.replace(/\n/g, ' | ') }));
check('weekly cup results: only the improvement pays (2nd to 1st = +150 XP), no 2nd trophy or capsule', fin.ui === 'results' && fin.after.xp - fin.before.xp === 150 && fin.after.best === 1 && fin.after.caps === fin.before.caps && fin.after.tro === fin.before.tro, JSON.stringify([fin.before, fin.after]));
await p.waitForTimeout(800);
await shot('weekly-results');

// a first podium in a new week: trophy, capsule and XP shown
const first = await p.evaluate(async () => {
  const app = window.zoomies;
  const { CHARACTERS } = await import('./src/characters.js');
  app.career.weekly = { week: '2026-W01', best: 0, trophies: [], streak: 0, last: '', capGiven: [] };
  const gp = app.gp;
  const table = gp.field.map((id, i) => ({ ch: CHARACTERS.find((c) => c.id === id), pts: 40 - i * 4, isPlayer: id === gp.player, place: i + 1 }));
  const me = table.find((t) => t.isPlayer);
  table.sort((a, b) => (a === me ? -1 : b === me ? 1 : b.pts - a.pts)).forEach((t, i) => { t.place = i + 1; t.pts = 60 - i * 5; });
  me.place = 3; // 3rd overall
  const caps = app.career.freeCaps;
  app.onWeeklyFinal(table, me);
  return { text: document.querySelector('#scr-results .rewards').innerText.replace(/\n/g, ' | '), caps: app.career.freeCaps - caps, w: app.career.weekly };
});
check('first podium shows the Week trophy, streak and free capsule', /Week \d+ trophy/.test(first.text) && /Free prize capsule/.test(first.text) && first.caps === 1, first.text);
check('weekly results screen is not empty of rewards', /XP/.test(first.text));

// a real race through awardRace shows mastery in the results (AI drives a Time Trial)
const tt = await p.evaluate(async () => {
  const app = window.zoomies;
  const { AIDriver, DIFFICULTY } = await import('./src/ai.js');
  app.career.mastery = { r: { mochi: 55 }, b: { classic: 0 }, capLevels: 0 };
  app.gp = null;
  app.startRace({ mode: 'tt', trackId: 'blossom', reverse: false, player: 'mochi', speedClass: 'zoom', playerLoadout: { body: 'classic' } });
  app.paused = true;
  const race = app.race;
  race.player.ai = new AIDriver(race.player, race, 1, DIFFICULTY.hard);
  for (let s = 0; s < 60 * 900 && app.ui.current !== 'results'; s++) race.update(1 / 60);
  app.paused = false;
  return { results: app.ui.current === 'results', text: document.querySelector('#scr-results .rewards').innerText.replace(/\n/g, ' | '), mast: app.career.mastery };
});
console.log('tt', JSON.stringify(tt));
check('a finished race adds mastery to the racer and the ride and shows it', tt.results && /Mastery \+\d+/.test(tt.text) && /reached mastery level 2/.test(tt.text) && tt.mast.r.mochi > 55 && tt.mast.b.classic > 0, tt.text);
await p.waitForTimeout(800);
await shot('race-results-mastery');

// racer select with mastery stars, the ride picker, the profile
await p.evaluate(() => { const a = window.zoomies; a.toTitle(); });
await p.waitForTimeout(1200);
await p.evaluate(async () => {
  const app = window.zoomies;
  app.career.mastery = { r: { mochi: 1300, pip: 190, bruno: 2700, volt: 70, ember: 920, zorp: 400 }, b: { classic: 1700, bike: 365, buggy: 60 }, capLevels: 15 };
  const W = await import('./src/weekly.js');
  const wk = W.weekOf();
  app.career.weekly = { week: wk, best: 0, trophies: ['2026-W38', '2026-W40', '2026-W41', wk], streak: 4, last: wk, capGiven: [] };
  app.settings.char = 'mochi';
  app.ui.mode = 'quick';
  app.ui.charSelect();
});
await p.waitForTimeout(1200);
const sel = await p.evaluate(() => ({ stars: [...document.querySelectorAll('#char-grid .card')].filter((c) => c.querySelector('.ms').textContent).map((c) => c.dataset.id + ':' + c.querySelector('.ms').textContent), info: document.getElementById('ci-mast').innerText }));
console.log('select', JSON.stringify(sel));
check('racer cards show mastery stars with levels; the info shows level and title', sel.stars.includes('mochi:★7') && sel.stars.includes('bruno:★10') && sel.stars.includes('pip:★3') && !sel.stars.some((s) => s.startsWith('rexi')) && /Mastery 7/.test(sel.info) && /Nine-Lives Drifter/.test(sel.info), JSON.stringify(sel));
await shot('racer-select');
await p.evaluate(() => document.getElementById('veh-btn').click());
await p.waitForTimeout(500);
const veh = await p.evaluate(() => [...document.querySelectorAll('#vp-grid .vcard')].filter((c) => c.querySelector('.ms').textContent).map((c) => c.dataset.id + ':' + c.querySelector('.ms').textContent));
check('ride cards show mastery stars', veh.includes('classic:★8') && veh.includes('bike:★4'), JSON.stringify(veh));
await shot('ride-picker');
await p.evaluate(() => { window.zoomies.ui._vehiclePicker(false); window.zoomies.ui.profileScreen(); });
await p.waitForTimeout(600);
const prof = await p.evaluate(() => ({ rows: document.querySelectorAll('#prof-extra .mrow').length, badges: document.querySelectorAll('#prof-extra .wbadge').length, text: document.getElementById('prof-extra').innerText.replace(/\n/g, ' | ') }));
console.log('profile', JSON.stringify(prof));
check('profile lists mastery rows with titles and the Week badges', prof.rows === 9 && prof.badges === 4 && /Grizzly Grand Master/.test(prof.text) && /Week \d+/.test(prof.text) && /4 week streak/.test(prof.text), prof.text);
await shot('profile');
// scrolled to the mastery list
await p.evaluate(() => { const s = document.querySelector('#scr-profile .scroll'); s.scrollTop = document.querySelector('#prof-extra .mast-grid').offsetTop - 70; });
await p.waitForTimeout(300);
await shot('profile-mastery');

console.log(fails ? `\n${fails} failed` : '\nall ok');
console.log('errors', fails);
await b.close();
process.exit(fails ? 1 : 0);
