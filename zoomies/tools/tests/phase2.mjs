// Phase 2: medals, daily missions, the reward screen and ghost challenge links.
//   node run.mjs phase2            (LINKS=all also prints the link length for every track)
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
const boot = async (save, hash = '') => {
  await p.close();
  p = await ctx.newPage();
  watch(p);
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, save || null]);
  await p.goto(URL + hash, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (hash) await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
};
const shot = async (name) => {
  // The software renderer starves CSS animations for seconds: wait until the one-off ones are done.
  await p.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect.getComputedTiming().iterations === Infinity), null, { timeout: 20000 }).catch(() => {});
  for (const [w, h, tag] of [[852, 393, 'phone'], [1470, 860, 'desk']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `ui/phase2-${name}-${tag}.png` });
  }
  await p.setViewportSize({ width: 852, height: 393 });
  await p.waitForTimeout(300);
};
// Drive a Time Trial with a Hard computer driver until the results screen shows.
const aiTT = (trackId) => p.evaluate(async (tid) => {
  const app = window.zoomies;
  const { AIDriver, DIFFICULTY } = await import('./src/ai.js');
  app.startRace({ mode: 'tt', trackId: tid, reverse: false, player: 'mochi', speedClass: 'zoom', playerLoadout: { body: 'classic' } });
  app.paused = true;
  const race = app.race;
  race.player.ai = new AIDriver(race.player, race, 1, DIFFICULTY.hard);
  for (let s = 0; s < 60 * 900 && app.ui.current !== 'results'; s++) race.update(1 / 60);
  app.paused = false;
  return { time: race.player.finishTime, results: app.ui.current === 'results' };
}, trackId);

// ---------------- 1. medals: the maths ----------------
await boot();
const med = await p.evaluate(async () => {
  const M = await import('./src/medals.js');
  const { TRACKS } = await import('./src/tracks.js');
  const out = { missing: TRACKS.filter((t) => !(M.REF[t.id] > 0)).map((t) => t.id), bad: [] };
  for (const id of Object.keys(M.REF)) {
    const [br, si, go, zo] = M.medalTimes(id), r = M.REF[id];
    const ok = Math.abs(br - r * 1.15) < 0.01 && Math.abs(si - r * 1.07) < 0.01 && go === r && Math.abs(zo - r * 0.94) < 0.01
      && M.medalTier(id, zo) === 4 && M.medalTier(id, zo + 0.01) === 3 && M.medalTier(id, go) === 3 && M.medalTier(id, go + 0.01) === 2
      && M.medalTier(id, si) === 2 && M.medalTier(id, si + 0.01) === 1 && M.medalTier(id, br) === 1 && M.medalTier(id, br + 0.01) === 0
      && M.medalTier(id, 0) === 0 && M.medalTier(id, NaN) === 0 && M.medalTier(id, undefined) === 0;
    if (!ok) out.bad.push(id);
  }
  const t = 'sprout', [br, si, go, zo] = M.medalTimes(t);
  // XP is paid for the tier gained over the old best, once.
  const a = M.medalAward(t, undefined, br - 1), b2 = M.medalAward(t, br - 1, br - 2), c = M.medalAward(t, br - 1, si - 0.1), d = M.medalAward(t, undefined, zo - 1), e = M.medalAward(t, si - 0.1, si - 0.2);
  out.award = [a && a.xp, b2, c && c.xp, d && d.xp, e];
  const nx = M.nextMedal(t, si - 0.5);
  out.next = nx && [nx.medal.id, +nx.gap.toFixed(2), +(si - 0.5 - go).toFixed(2)];
  out.none = M.nextMedal(t, zo - 1);
  out.count = M.medalCount({ sprout: { tt: go }, coral: { tt: 9999 }, dunes: { tt: M.medalTimes('dunes')[0] } });
  return out;
});
console.log('medals', JSON.stringify(med));
check('every track has a medal reference', med.missing.length === 0, med.missing.join(','));
check('tier maths on every track', med.bad.length === 0, med.bad.join(','));
check('medal XP once: bronze 50, no repeat, silver 100, zoomie 400, none for same tier', JSON.stringify(med.award) === JSON.stringify([50, null, 100, 400, null]));
check('next medal: gold, gap and target', med.next && med.next[0] === 'gold' && med.next[1] === med.next[2]);
check('no next medal after Zoomie', med.none === null);
check('medal count: gold counts 3, bronze 1', med.count === 4);

// ---------------- 2. missions: dates, progress, merge, migration ----------------
const mis = await p.evaluate(async () => {
  const X = await import('./src/missions.js');
  const C = await import('./src/career.js');
  const S = await import('./src/sync.js');
  const out = {};
  const a = X.missionsFor('2026-10-16').map((g) => g.id), a2 = X.missionsFor('2026-10-16').map((g) => g.id);
  out.same = JSON.stringify(a) === JSON.stringify(a2) && new Set(a).size === 3;
  const sets = new Set();
  for (let d = 1; d <= 28; d++) sets.add(X.missionsFor(`2026-11-${String(d).padStart(2, '0')}`).map((g) => g.id).sort().join());
  out.varied = sets.size;
  out.pool = X.POOL.length;
  // progress on a made-up day
  const day = '2026-03-10', day2 = '2026-03-11', day4 = '2026-03-13';
  const goals = X.missionsFor(day);
  const c = C.newCareer();
  const infoFor = (g) => ({
    drift: { styleCounts: { 'SPARK BOOST': 6, 'NOVA BOOST': 4 } }, finish: { mode: 'quick', place: 5 }, bike: { mode: 'quick', place: 1, bike: true }, gems: { gems: 25 },
    short: { styleCounts: { SHORTCUT: 3 } }, trick: { styleCounts: { TRICK: 5 } }, pop: { mode: 'battle', battle: true, place: 1, pops: 5 }, top3: { mode: 'quick', place: 3 },
    hit: { styleCounts: { HIT: 3 } }, clean: { styleCounts: { 'CLEAN LAP': 1 } }, pass: { styleCounts: { OVERTAKE: 10 } }, start: { styleCounts: { 'PERFECT START': 1 } },
  })[g.id];
  const half = { ...infoFor(goals[0]) };
  out.first = X.bumpMissions(c, { mode: 'quick', place: 9, gems: 0 }, day);
  out.xpEach = [];
  out.caps0 = c.freeCaps || 0;
  for (const g of goals) {
    const r = X.bumpMissions(c, { mode: 'quick', place: 4, gems: 0, ...infoFor(g) }, day);
    out.xpEach.push(r.xp);
    out.allAt = r.capsule;
  }
  out.done1 = c.missions.done.length;
  out.caps1 = c.freeCaps;
  out.streak1 = c.missions.streak;
  // the same day again pays nothing more
  const again = X.bumpMissions(c, { mode: 'quick', place: 1, gems: 25, styleCounts: { TRICK: 9, SHORTCUT: 9 } }, day);
  out.again = [again.xp, again.capsule, c.freeCaps];
  // next day all done: streak 2; skipping a day: streak back to 1
  for (const g of X.missionsFor(day2)) X.bumpMissions(c, { mode: 'quick', place: 4, ...infoFor(g) }, day2);
  out.streak2 = c.missions.streak;
  out.view = X.missionStreak(c, day2) + ',' + X.missionStreak(c, '2026-03-12') + ',' + X.missionStreak(c, day4);
  for (const g of X.missionsFor(day4)) X.bumpMissions(c, { mode: 'quick', place: 4, ...infoFor(g) }, day4);
  out.streak3 = c.missions.streak;
  // a new day shows zero progress without touching the save
  out.fresh = X.missionView(c, '2026-03-20').every((g) => g.prog === 0 && !g.done);
  // merge: same day takes the best progress and every done goal; different days the newer wins
  const mk = (m) => { const x = C.newCareer(); x.missions = m; return x; };
  const m1 = S.mergeCareer(mk({ day, prog: { drift: 4, gems: 9 }, done: ['finish'], streak: 2, last: '2026-03-09' }), mk({ day, prog: { drift: 7, trick: 2 }, done: ['gems'], streak: 3, last: '2026-03-09' }));
  out.mergeSame = m1.missions;
  const m2 = S.mergeCareer(mk({ day, prog: { drift: 4 }, done: [], streak: 1, last: day }), mk({ day: day2, prog: { gems: 3 }, done: [], streak: 5, last: '2026-03-01' }));
  out.mergeDiff = m2.missions;
  // migration and hostile data
  const old = JSON.parse(JSON.stringify(C.newCareer()));
  delete old.missions;
  out.oldOk = JSON.stringify(C.cleanCareer(old).missions) === JSON.stringify({ day: '', prog: {}, done: [], streak: 0, last: '' });
  const bad = C.cleanCareer({ ...old, missions: { day: '<script>', prog: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 1e12])), done: Array(100).fill('x'), streak: -5, last: 5, __proto__: { x: 1 } } }).missions;
  out.bad = [bad.day, Object.keys(bad.prog).length, Math.max(...Object.values(bad.prog)), bad.done.length, bad.streak, bad.last];
  return out;
});
console.log('missions', JSON.stringify(mis));
check('missions: 3 distinct goals, same on a date, vary by date', mis.same && mis.varied >= 6 && mis.pool >= 12, `pool ${mis.pool}, ${mis.varied} different sets in 28 days`);
check('missions: +100 XP per goal, capsule once on the third', JSON.stringify(mis.xpEach) === '[100,100,100]' && mis.allAt === true && mis.caps1 === mis.caps0 + 1, JSON.stringify([mis.xpEach, mis.caps0, mis.caps1]));
check('missions: nothing more on the same day', JSON.stringify(mis.again) === JSON.stringify([0, false, mis.caps1]));
check('missions: streak 1, 2, then reset after a gap', mis.streak1 === 1 && mis.streak2 === 2 && mis.streak3 === 1 && mis.view === '2,2,0', `${mis.streak1} ${mis.streak2} ${mis.streak3} ${mis.view}`);
check('missions: new day reads as zero progress', mis.fresh);
const ms = mis.mergeSame, md = mis.mergeDiff;
check('missions merge: same day = max progress, union done', ms.prog.drift === 7 && ms.prog.gems === 9 && ms.prog.trick === 2 && ms.done.length === 2 && ms.streak === 3, JSON.stringify(ms));
check('missions merge: different days = newer day wins, streak from latest finish', md.day === '2026-03-11' && md.prog.gems === 3 && !md.prog.drift && md.last === '2026-03-10' && md.streak === 1, JSON.stringify(md));
check('missions: old save without the field loads', mis.oldOk);
check('missions: hostile field is bounded', mis.bad[0] === '' && mis.bad[1] <= 12 && mis.bad[2] <= 1000 && mis.bad[3] <= 12 && mis.bad[4] === 0 && mis.bad[5] === '', JSON.stringify(mis.bad));

// an old save really boots the app
const legacy = { v: 1, coins: 321, racer: 'mochi', racers: ['mochi'], body: 'buggy', bodies: ['buggy'], xp: 900, stats: { races: 12 } };
await boot(legacy);
const boots = await p.evaluate(() => ({ m: window.zoomies.career.missions, coins: window.zoomies.career.coins, panel: document.getElementById('missions').children.length }));
check('old save boots with missions defaults and a missions panel', boots.coins === 321 && boots.m && boots.m.day === '' && boots.panel === 5, JSON.stringify(boots));

// ---------------- 3. title with missions (a bit of progress) ----------------
await p.evaluate(async () => {
  const app = window.zoomies;
  const X = await import('./src/missions.js');
  const g = X.missionsFor();
  X.bumpMissions(app.career, { mode: 'quick', place: 5, gems: 0, styleCounts: { 'SPARK BOOST': 4, TRICK: 2, 'CLEAN LAP': 1, HIT: 1, OVERTAKE: 4, SHORTCUT: 1, 'PERFECT START': 1 }, bike: true, pops: 2 });
  app.career.missions.streak = 3; app.career.missions.last = X.dayBefore(X.dayStr());
  app.toTitle();
});
await p.waitForTimeout(800);
const tp = await p.evaluate(() => {
  const el = document.getElementById('missions').getBoundingClientRect();
  const menu = document.querySelector('#scr-title .menu').getBoundingClientRect();
  return { rows: document.querySelectorAll('#missions .mis').length, text: document.getElementById('missions').innerText.replace(/\n/g, ' | '), bottom: el.bottom, top: el.top, right: el.right, menuLeft: menu.left, vh: innerHeight };
});
console.log('title panel', JSON.stringify(tp));
check('title shows 3 missions and fits the screen', tp.rows === 3 && tp.bottom <= tp.vh && tp.right <= tp.menuLeft, `bottom ${tp.bottom}/${tp.vh}, right ${tp.right}/${tp.menuLeft}`);
await shot('title-missions');

// ---------------- 4. a real Time Trial: medal line, reward screen, race again ----------------
await boot();
const xp0 = await p.evaluate(() => window.zoomies.career.xp);
const tt = await aiTT('blossom');
check('time trial finished and showed results', tt.results, `time ${tt.time && tt.time.toFixed(2)}`);
await p.waitForTimeout(400);
const res = await p.evaluate(async () => {
  const app = window.zoomies;
  const M = await import('./src/medals.js');
  const tier = M.trackTier(app.records, 'blossom');
  return {
    tier, tt: app.records.blossom.tt, xpGain: app.career.xp - 0, medalLine: (document.querySelector('.medal-line') || {}).innerText,
    medalXp: document.querySelector('.rw-medal') ? document.querySelector('.rw-medal').innerText : null,
    next: document.querySelector('.rw-next') ? document.querySelector('.rw-next').innerText : null,
    barTo: document.querySelector('.xpbar i[data-to]').dataset.to, bigBtn: !!document.querySelector('#res-buttons .btn.big[data-go="retry"]'),
    challengeBtn: !!document.querySelector('#res-buttons [data-go="challenge"]'),
    recGhost: !!localStorage.getItem('zoomies.ghost.v1.blossom'),
  };
});
console.log('tt results', JSON.stringify(res));
check('TT results show the medal line with a next medal', /medal/i.test(res.medalLine || '') && (res.tier === 4 ? /every medal/.test(res.medalLine) : /next medal .* in [\d.]+s/.test(res.medalLine)), res.medalLine);
check('medal toast row only when a medal was won', (res.tier > 0) === !!res.medalXp, String(res.medalXp));
check('XP from the first medal is in the career XP', await p.evaluate(async ([t]) => {
  const M = await import('./src/medals.js');
  const gain = window.zoomies.career.xp - 0;
  return t === 0 || gain >= 50 + M.MEDALS[t - 1].xp;
}, [res.tier]), `xp ${xp0}→`);
check('reward screen: Next up teaser and a big RACE AGAIN button', !!res.next && res.bigBtn, res.next);
// the XP bar is done in under 3 seconds and the buttons were never blocked
await p.waitForTimeout(2600);
const barDone = await p.evaluate(() => { const i = document.querySelector('.xpbar i[data-to]'); return [i.style.width, i.dataset.to + '%']; });
check('XP bar reaches its final width within 3 seconds', barDone[0] === barDone[1], barDone.join(' vs '));
await shot('tt-results');
check('Challenge button appears once a ghost is saved', res.challengeBtn && res.recGhost);
// race again restarts the same race with one tap
await p.tap('#res-buttons [data-go="retry"]');
await p.waitForTimeout(800);
const again = await p.evaluate(() => ({ mode: window.zoomies.race.mode, track: window.zoomies.race.trackDef.id, ghost: !!window.zoomies.race.ghost }));
check('RACE AGAIN restarts the same Time Trial, now with the ghost', again.mode === 'tt' && again.track === 'blossom' && again.ghost, JSON.stringify(again));

// ---------------- 5. ghost links ----------------
const link = await p.evaluate(async () => {
  const L = await import('./src/ghostlink.js');
  const G = await import('./src/ghost.js');
  const out = {};
  const g = G.loadGhost('blossom');
  const frag = await L.encodeChallenge({ trackId: 'blossom', reverse: false, name: 'Mia', speedClass: 'zoom' }, g);
  out.len = frag.length;
  const url = L.challengeUrl(frag);
  out.url = url.length;
  const d = await L.decodeChallenge('#' + frag);
  out.ok = !!d;
  if (d) {
    out.name = d.name; out.time = d.time; out.track = d.trackId; out.text = L.challengeText(d); out.cls = d.speedClass;
    const a = g.samples, s = d.ghost.samples;
    out.n = [a.length / 4, s.length / 4];
    let maxPos = 0, maxYaw = 0;
    for (let i = 0; i < s.length / 4; i++) {
      const j = Math.min(i, a.length / 4 - 1) * 4;
      maxPos = Math.max(maxPos, Math.hypot(s[i * 4] - a[j], s[i * 4 + 2] - a[j + 2]) / 20);
      let dy = Math.abs(s[i * 4 + 3] - a[j + 3]) / 5000; if (dy > Math.PI) dy = Math.PI * 2 - dy;
      maxYaw = Math.max(maxYaw, dy);
    }
    out.maxPos = +maxPos.toFixed(2); out.maxYaw = +maxYaw.toFixed(3);
    // the ghost drives through the real player class
    out.parsed = Array.isArray(Array.from(d.ghost.samples)) && Math.abs(d.ghost.time - g.time) < 0.01;
  }
  // hostile input: nothing may throw and all must be rejected
  const enc = new TextEncoder();
  const gz = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const b64u = (u8) => { let s = ''; u8.forEach((c) => (s += String.fromCharCode(c))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const rej = {};
  const tryIt = async (k, h) => { try { rej[k] = await L.decodeChallenge(h) === null; } catch (e) { rej[k] = 'threw ' + e.message; } };
  await tryIt('garbage', '#ch=!!!notbase64!!!');
  await tryIt('empty', '#ch=');
  await tryIt('plain text', '#ch=aGVsbG8');
  await tryIt('not gzip', '#ch=' + b64u(enc.encode('{"k":"sprout"}\n')));
  await tryIt('huge text', '#ch=' + 'A'.repeat(20000));
  await tryIt('odd length', '#ch=AAAAA');
  await tryIt('truncated', '#' + frag.slice(0, Math.floor(frag.length / 2)));
  await tryIt('bomb', '#ch=' + b64u(await gz(new Uint8Array(40 * 1024 * 1024))));
  await tryIt('corrupt crc', '#' + frag.slice(0, -6) + (frag.slice(-6) === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA'));
  const wrongTrack = (k, extra = {}) => ({ k, r: 0, t: 80, c: 'mochi', b: 'classic', ...extra });
  // a valid body with a bad header
  const gunz = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const unb64u = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const body = await gunz(unb64u(frag.slice(3)));
  const nl = body.indexOf(10);
  const rebuild = async (head) => { const h = enc.encode(JSON.stringify(head) + '\n'); const o = new Uint8Array(h.length + body.length - nl - 1); o.set(h); o.set(body.subarray(nl + 1), h.length); return '#ch=' + b64u(await gz(o)); };
  await tryIt('unknown track', await rebuild(wrongTrack('no-such-track')));
  await tryIt('arena as track', await rebuild(wrongTrack('crater')));
  await tryIt('proto key', await rebuild(wrongTrack('__proto__')));
  await tryIt('time NaN', await rebuild(wrongTrack('sprout', { t: 'fast' })));
  await tryIt('time negative', await rebuild(wrongTrack('sprout', { t: -4 })));
  await tryIt('time huge', await rebuild(wrongTrack('sprout', { t: 1e9 })));
  await tryIt('header not json', '#ch=' + b64u(await gz(Uint8Array.from([...enc.encode('{{{\n'), ...body.subarray(nl + 1)]))));
  await tryIt('no samples', await (async () => '#ch=' + b64u(await gz(enc.encode(JSON.stringify(wrongTrack('sprout')) + '\n'))))());
  // a mostly-valid link carrying nasty strings is cleaned, not trusted
  const nasty = await L.decodeChallenge(await rebuild(wrongTrack('sprout', { n: '<img src=x onerror=alert(1)>Bob   &"', c: 'zzz', b: 'nope', p: 'url(javascript:1)', h: '<b>', x: 'warp', s: [1, 2] })));
  out.nasty = nasty && { name: nasty.name, char: nasty.ghost.char, body: nasty.ghost.body, paint: nasty.ghost.paint, hat: nasty.ghost.hat, cls: nasty.speedClass };
  out.rej = rej;
  return out;
});
console.log('link', JSON.stringify(link));
check('link round trip: time, track, name, speed', link.ok && link.name === 'Mia' && link.track === 'blossom' && link.cls === 'zoom' && link.parsed, link.text);
check('link keeps the lap smooth (5 samples a second: under 1 m and 0.4 rad off at worst)', link.maxPos <= 1 && link.maxYaw <= 0.4, `pos ${link.maxPos} m, yaw ${link.maxYaw}`);
check('link is short enough for a message (under 4000 characters)', link.url < 4000, `${link.len} fragment, ${link.url} url on blossom`);
const bad = Object.entries(link.rej).filter(([, v]) => v !== true).map(([k, v]) => `${k}=${v}`);
check('hostile links rejected without throwing', bad.length === 0, bad.join(' '));
check('nasty strings are sanitised', link.nasty && !/[<>&"]/.test(link.nasty.name) && link.nasty.char === 'mochi' && link.nasty.body === 'classic' && link.nasty.paint === null && link.nasty.hat === null && link.nasty.cls === 'zoom', JSON.stringify(link.nasty));

// link lengths on more tracks (every track with LINKS=all)
const ids = process.env.LINKS === 'all' ? await p.evaluate(async () => (await import('./src/tracks.js')).TRACKS.map((t) => t.id)) : ['sprout', 'magma'];
const lens = {};
for (const id of ids) {
  await aiTT(id);
  lens[id] = await p.evaluate(async (tid) => {
    const L = await import('./src/ghostlink.js');
    const G = await import('./src/ghost.js');
    const g = G.loadGhost(tid);
    const frag = await L.encodeChallenge({ trackId: tid, reverse: false, name: 'Mia', speedClass: 'zoom' }, g);
    const d = await L.decodeChallenge('#' + frag);
    return [frag.length, g.time.toFixed(1), !!d];
  }, id);
}
console.log('link lengths', JSON.stringify(lens));
check('links under 4000 characters on the tracks tried', Object.values(lens).every(([n, , ok]) => n + 60 < 4000 && ok), JSON.stringify(lens));

// ---------------- 6. opening a link: card and race ----------------
await boot();
await aiTT('blossom');
const hash = await p.evaluate(async () => {
  const L = await import('./src/ghostlink.js');
  const G = await import('./src/ghost.js');
  return '#' + await L.encodeChallenge({ trackId: 'blossom', reverse: false, name: 'Mia', speedClass: 'turbo' }, G.loadGhost('blossom'));
});
await boot(null, hash);
const card = await p.evaluate(() => ({ cur: window.zoomies.ui.current, text: (document.getElementById('chal-text') || {}).textContent, sub: (document.getElementById('chal-sub') || {}).textContent, hash: location.hash }));
console.log('card', JSON.stringify(card));
check('opening a link shows the Beat-card and clears the fragment', card.cur === 'challenge' && /^Beat Mia's \d+:\d\d\.\d\d on Blossom/.test(card.text || '') && card.hash === '', JSON.stringify(card));
await shot('challenge-card');
await p.tap('#scr-challenge [data-go="race"]');
await p.waitForTimeout(1000);
const started = await p.evaluate(() => ({ mode: window.zoomies.race.mode, track: window.zoomies.race.trackDef.id, ghost: !!window.zoomies.race.ghost, cls: window.zoomies.race.opts.speedClass }));
check('Race the ghost starts a Time Trial against the link\'s ghost', started.mode === 'tt' && started.track === 'blossom' && started.ghost && started.cls === 'turbo', JSON.stringify(started));
await boot(null, '#ch=this-is-not-a-real-link');
const junk = await p.evaluate(() => ({ cur: window.zoomies.ui.current, hash: location.hash }));
check('a garbage link is ignored: title screen, no card, no error', junk.cur === 'title' && junk.hash === '', JSON.stringify(junk));

// ---------------- 7. reward screen with a mission and the level teaser ----------------
await boot();
await p.evaluate(async () => {
  const app = window.zoomies;
  const P = await import('./src/profile.js');
  const X = await import('./src/missions.js');
  // sit close to a level and leave one mission nearly done
  app.career.xp = 560;
  const sum = P.awardRace(app.career, { mode: 'quick', place: 2, gems: 12, style: 40, trackId: 'sprout', styleCounts: { 'SPARK BOOST': 8, TRICK: 3 } });
  const html = app.rewardsFinish(sum);
  app.ui.results({
    title: '2nd place', sub: 'Sprout Speedway', html: html + '<div class="results"><div class="res me"><span class="p">2nd</span><span>Mochi</span><span></span><span class="pts">1:31.20</span></div></div>',
    buttons: [['menu', 'Menu', 'ghost small'], ['tracks', 'Tracks', 'alt small'], ['retry', 'Race again', 'hot big']],
  });
});
await p.waitForTimeout(2800);
const rw = await p.evaluate(() => ({ next: (document.querySelector('.rw-next') || {}).innerText, mis: [...document.querySelectorAll('.rw-mis')].map((e) => e.innerText), lv: document.querySelector('.rw-l').innerText }));
console.log('reward', JSON.stringify(rw));
check('reward screen lists mission progress and a Next up', rw.mis.length >= 1 && /NEXT UP/.test(rw.next || ''), JSON.stringify(rw));
await shot('reward-next-up');

console.log(`errors ${fails}`);
await b.close();
process.exit(fails ? 1 : 0);
