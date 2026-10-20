// The Legends League: locked before the Golden Wheel, open after; event ids and
// saves; a League event paying coins and drops; Legend Rank maths and rewards;
// merging saves; hostile and old saves; screenshots at 852x393 and 1470x860.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
let p = await ctx.newPage();
const errs = [];
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const watch = (pg) => {
  pg.setDefaultTimeout(60000);
  pg.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror]', e.message, e.stack?.slice(0, 600)); });
  pg.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) console.log('[console]', m.text().slice(0, 300)); });
};
watch(p);
const KEY = 'zoomies-career-v1';
const boot = async (save) => {
  await p.close();
  p = await ctx.newPage();
  watch(p);
  await p.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.evaluate(([k, s]) => { localStorage.removeItem(k); if (s) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, save || null]);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
  await p.waitForTimeout(1200);
};
const skipStory = async () => {
  let n = 0;
  while (n++ < 40 && await p.evaluate(() => window.zoomies.ui.current === 'story')) { await p.tap('#scr-story .story-box'); await p.waitForTimeout(200); }
};

// A save that has finished the story. seen: every chapter scene, so only League scenes play.
const storyDone = (extra = {}) => {
  const seen = { 'c1-prologue': true };
  const done = { 'c1-0': true };
  for (let i = 1; i <= 7; i++) { seen[`c${i}-intro`] = true; seen[`c${i}-boss`] = true; seen[`c${i}-outro`] = true; done[`c${i}-b`] = true; for (let k = 1; k <= 4; k++) done[`c${i}-${k}`] = true; }
  return {
    v: 1, pv: 2, coins: 5000, racer: 'mochi', racers: ['mochi', 'hopper', 'zorp', 'pip', 'ember', 'volt', 'rexi', 'bruno'], body: 'classic', bodies: ['buggy', 'classic', 'comet'], paint: 'stock', paints: ['stock'],
    champion: true, xp: 6000, beaten: ['hopper', 'zorp', 'pip', 'ember', 'volt', 'rexi', 'bruno'], stars: {}, done, seen, ...extra,
  };
};

// ---------------- 1. locked before the Golden Wheel ----------------
await boot({ ...storyDone(), champion: false });
await p.evaluate(() => window.zoomies.openCareer());
await p.waitForTimeout(800);
await skipStory();
const lockedCard = await p.evaluate(() => ({ text: document.getElementById('chap-league').textContent, locked: document.getElementById('chap-league').classList.contains('locked') }));
check('locked: card says Win the Golden Wheel to enter', lockedCard.locked && lockedCard.text.includes('Win the Golden Wheel to enter'), lockedCard.text);
await p.screenshot({ path: 'car/L0-locked.png' });
await p.tap('#chap-league');
await p.waitForTimeout(300);
const stillStory = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const c = window.zoomies.career;
  return { league: window.zoomies.careerUI.league, unlocked: C.chapterUnlocked(c, 0, C.LEAGUE), ev: C.eventUnlocked(c, 0, 0, C.LEAGUE), name: document.getElementById('chap-name').textContent };
});
check('locked: tapping the card stays on the story map, nothing unlocked', !stillStory.league && !stillStory.unlocked && !stillStory.ev && stillStory.name === 'To the Moon', JSON.stringify(stillStory));

// ---------------- 2. open after the Golden Wheel: enter, intro, seasons ----------------
await boot(storyDone());
await p.evaluate(() => window.zoomies.openCareer());
await p.waitForTimeout(800);
await skipStory();
const newCard = await p.evaluate(() => document.getElementById('chap-league').textContent);
check('open: card invites you in', newCard.includes('Legends League') && newCard.includes('NEW'), newCard);
await p.screenshot({ path: 'car/L1-hub-card.png' });
await p.tap('#chap-league');
await p.waitForTimeout(900);
const intro = await p.evaluate(() => ({ ui: window.zoomies.ui.current, title: document.getElementById('story-title').textContent, name: document.getElementById('story-name').textContent, text: document.getElementById('story-text').textContent }));
check('open: season 1 intro plays, the Baron makes the proposal', intro.ui === 'story' && intro.title === 'Comeback Season', JSON.stringify(intro));
await p.waitForTimeout(1200);
await p.screenshot({ path: 'car/L2-intro-scene.png' });
for (let i = 0; i < 2; i++) { await p.tap('#scr-story .story-box'); await p.waitForTimeout(250); }
await p.waitForTimeout(1200);
await p.screenshot({ path: 'car/L2b-intro-baron.png' });
await skipStory();
await p.waitForTimeout(900);
const hub = await p.evaluate(() => ({
  ui: window.zoomies.ui.current, num: document.getElementById('chap-num').textContent, name: document.getElementById('chap-name').textContent,
  evs: [...document.querySelectorAll('#ev-list [data-ev]')].map((e) => e.dataset.ev), off: [...document.querySelectorAll('#ev-list .ev.off')].map((e) => e.dataset.ev),
  story: document.getElementById('chap-story').textContent, back: document.getElementById('chap-league').textContent,
}));
check('league map: season 1 of 3, six events L1-1..L1-6, boss locked', hub.ui === 'career' && hub.num.includes('Season 1 of 3') && hub.evs.join() === 'L1-1,L1-2,L1-3,L1-4,L1-5,L1-6' && hub.off.join() === 'L1-6', JSON.stringify(hub));
check('league map: Legend Rank strip and a way back', hub.story.includes('Legend Rank 1') && hub.back.includes('Story map'), hub.story);
await p.screenshot({ path: 'car/L3-league-map.png' });
// an event card with its hint, twist and drop
await p.evaluate(() => { window.zoomies.careerUI.ci = 1; window.zoomies.careerUI.sel = null; window.zoomies.career.seen['L2-intro'] = true; window.zoomies.career.done['L1-6'] = true; window.zoomies.careerUI.render(); });
await p.tap('#ev-list [data-ev="L2-1"]');
await p.waitForTimeout(700);
const card = await p.evaluate(() => document.querySelector('#ev-list .ev.sel .mid').textContent);
check('event card: goal, twist, drop line and a Gramps tip', card.includes('Boom Boom Bash') && card.includes('Twist') && card.includes('Gramps says') && /Finish in the top 3/.test(card), card.slice(0, 200));
await p.screenshot({ path: 'car/L4-event-card-twist.png' });
await p.tap('#ev-list [data-ev="L2-2"]');
await p.waitForTimeout(500);
const dropCard = await p.evaluate(() => document.querySelector('#ev-list .ev.sel .dropl')?.textContent || '');
check('event card: shows the 3-star drop', dropCard.includes('3 stars drop') && dropCard.includes('Armour III'), dropCard);
await p.screenshot({ path: 'car/L5-event-card-drop.png' });
await p.evaluate(() => { window.zoomies.careerUI.ci = 0; window.zoomies.careerUI.sel = 'L1-3'; window.zoomies.careerUI.render(); });
await p.waitForTimeout(500);
const goldCard = await p.evaluate(() => document.querySelector('#ev-list .ev.sel .mid').textContent);
check('time event: Gold medal time goal and a drop', goldCard.includes('Gold medal time') && goldCard.includes('Engine III'), goldCard.slice(0, 160));
await p.screenshot({ path: 'car/L5b-event-card-gold.png' });
// season navigation and boss lock
await p.tap('#chap-next');
await p.waitForTimeout(300);
await p.tap('#chap-next');
await p.waitForTimeout(300);
const s3 = await p.evaluate(() => ({ num: document.getElementById('chap-num').textContent, blurb: document.getElementById('chap-blurb').textContent, name: document.getElementById('chap-name').textContent }));
check('season 3 is locked until season 2 is cleared', s3.num.includes('Season 3') && s3.blurb.includes('season 2') && s3.name === 'Gearbox Gus', JSON.stringify(s3));
await p.tap('#chap-league');
await p.waitForTimeout(500);
check('card returns to the story map', await p.evaluate(() => !window.zoomies.careerUI.league && document.getElementById('chap-num').textContent.startsWith('Chapter')));

// the two new story characters on screen
for (const [id, nm] of [['mask', 'mask'], ['gearbox', 'gearbox']]) {
  await p.evaluate((who) => { window.zoomies.careerUI.playStories([{ key: `x-${who}`, lines: [[who, who === 'mask' ? 'The League has gone soft. Let us fix that. Heh.' : 'Thirty years since I raced the Wheel, and I would not pick anyone else to race now.']], title: 'Portrait check' }], () => {}); }, id);
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `car/L2c-portrait-${nm}.png` });
  await p.evaluate(() => window.zoomies.careerUI.endStory());
}

// ---------------- 3. structure: ids, fields, tracks, medals ----------------
const st = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const L = await import('./src/league.js');
  const M = await import('./src/medals.js');
  const { trackById } = await import('./src/tracks.js');
  const { DAILY_MODS } = await import('./src/profile.js');
  const evs = L.LEAGUE_EVENTS;
  const ok = (e) => !!e.id && !!e.type && !!e.title && e.reward > 0 && (e.type === 'cup' ? e.tracks.length === 4 && e.tracks.every((t) => trackById(t)) : !!trackById(e.track));
  return {
    n: evs.length, ids: evs.map((e) => e.id).join(), okAll: evs.every(ok), seasons: L.LEAGUE.map((s) => s.events.length),
    types: [...new Set(evs.map((e) => e.type))].sort().join(), rev: evs.filter((e) => e.rev).length, mods: evs.filter((e) => e.mod).map((e) => e.mod),
    modsKnown: evs.filter((e) => e.mod).every((e) => DAILY_MODS.some((m) => m.id === e.mod && !m.gems && !m.cls)),
    epics: evs.filter((e) => e.track === 'odyssey' || e.track === 'hopper').map((e) => e.track).sort().join(),
    gold: evs.filter((e) => e.type === 'time').every((e) => e.gold && e.target === +M.medalTimes(e.track)[2].toFixed(2)),
    bosses: L.LEAGUE.map((s) => s.events.filter((e) => e.boss).length).join(),
    drops: evs.filter((e) => e.drop).map((e) => e.drop), bpOk: L.LEAGUE.every((s) => s.events.find((e) => e.boss).bp),
    byId: C.eventById('L3-6').chapter.id, ci: C.eventById('L2-4').ci, story: C.eventById('c3-1').chapter.id,
    chars: L.LEAGUE.every((s) => ['mic', 'baron', 'gramps'].concat(s.intro.concat(s.outro, s.bossIntro).map((l) => l[0])).length > 0),
    diffs: L.LEAGUE.map((s) => `${s.cls}/${s.diff}/${s.boss.up}/${s.ai.up}`).join(' '),
    s3bodies: L.LEAGUE[2].ai.bodies.join(), s3boss: L.LEAGUE[2].boss.body,
  };
});
console.log('structure', JSON.stringify(st));
check('18 events, 6 per season, ids L1-1..L3-6', st.n === 18 && st.seasons.join() === '6,6,6' && st.ids.startsWith('L1-1,L1-2') && st.ids.endsWith('L3-5,L3-6') && st.okAll);
check('variety: race, gems, time, duel, cup, reversed tracks and twists', st.types === 'battle,cup,duel,gems,race,time' && st.rev >= 2 && st.mods.length >= 4 && st.modsKnown, JSON.stringify([st.types, st.rev, st.mods]));
check('both Epic adventures are in', st.epics === 'hopper,odyssey', st.epics);
check('time attacks are Gold medal times from medals.js', st.gold);
check('one boss with a Blueprint per season', st.bosses === '1,1,1' && st.bpOk, st.bosses);
check('difficulty: S1 Hard up 2-3, S2 Turbo up 3-4, S3 up 4-5 with comet/stomper/bolt', st.diffs === 'zoom/hard/3/2 turbo/hard/4/3 turbo/hard/5/4' && st.s3bodies === 'comet,stomper,bolt' && st.s3boss === 'bolt', st.diffs);
check('eventById finds League and story events', st.byId === 'L3' && st.ci === 1 && st.story === 'c3');

// ---------------- 4. a League event in a real race pays coins, stars and a drop ----------------
await boot(storyDone({ seen: { ...storyDone().seen, 'L1-intro': true } }));
const race1 = await p.evaluate(async () => {
  const app = window.zoomies; const c = app.career;
  app.openCareer();
  app.careerUI.endStory && app.careerUI.story && app.careerUI.endStory();
  app.careerUI.league = true; app.careerUI.ci = 0;
  app.startCareerEvent('L2-1'.replace('L2', 'L1')); // L1-1: top 3 on Downs
  app.paused = true;
  const race = app.race;
  const out = { track: race.trackDef.id, cls: race.speedClass.id || race.speedClass.name, diff: race.diff.id, grid: race.karts.map((k) => k.ch.id), mods: race.mods && race.mods.id, careerEv: race.careerEv && race.careerEv.id };
  app.paused = false;
  return out;
});
check('L1-1 starts: Downs, Hard, rival Ember in the grid with returning champions', race1.track === 'downs' && race1.diff === 'hard' && race1.grid.includes('ember') && race1.grid.filter((g) => ['hopper', 'zorp', 'pip', 'volt'].includes(g)).length >= 3 && race1.careerEv === 'L1-1', JSON.stringify(race1));
const twist = await p.evaluate(() => {
  const app = window.zoomies;
  app.startCareerEvent('L2-1');
  const r1 = { mods: app.race.mods && app.race.mods.id, cls: app.race.speedClass.id, rival: app.race.karts.some((k) => k.ch.id === 'mask'), goal: document.getElementById('hud-goal') && document.getElementById('hud-goal').textContent };
  app.startCareerEvent('L2-3');
  const r2 = { mode: app.race.mode, cls: app.race.speedClass.id, target: app.race.careerEv.target };
  app.startCareerEvent('L2-5');
  const r3 = { track: app.race.trackDef.id, laps: app.race.laps };
  app.startCareerEvent('L3-5');
  const r4 = { mods: app.gp && app.gp.extra.mods && app.gp.extra.mods.id, raceMods: app.race.mods && app.race.mods.id, tracks: app.gp && app.gp.tracks.join() };
  app.startCareerEvent('L3-6');
  const r5 = { grid: app.race.karts.map((k) => k.ch.id).sort().join(), body: app.race.karts.find((k) => k.ch.id === 'gearbox').bodyDef.id };
  return { r1, r2, r3, r4, r5 };
});
console.log('twists', JSON.stringify(twist));
check('twist: Boom Boom Bash reaches the race, the masked rival is in the grid', twist.r1.mods === 'bombs' && twist.r1.rival);
check('time event runs in Zoom class (Gold medal times are Zoom class)', twist.r2.mode === 'tt' && twist.r2.cls === 'zoom');
check('Epic adventure is a one-lap race', twist.r3.track === 'odyssey' && twist.r3.laps === 1);
check('cup keeps its twist for every race', twist.r4.mods === 'bees' && twist.r4.raceMods === 'bees' && twist.r4.tracks === 'glacier,moon,obsidian,neon', JSON.stringify(twist.r4));
check('final duel: Gramps on the Starbolt', twist.r5.body === 'bolt' && twist.r5.grid.includes('gearbox'), JSON.stringify(twist.r5));
// a Balloon Battle event: the career flow starts the battle and maps its results
const bat = await p.evaluate(async () => {
  const app = window.zoomies;
  app.gp = null;
  app.startCareerEvent('L2-2');
  const r = app.race; r.skipIntro = true; app.paused = true;
  const { BattleAI } = await import('./src/battle.js');
  r.player.ai = new BattleAI(r.player, r, 0.9, r.diff);
  const out = { mode: r.mode, battle: !!r.battle, arena: r.trackDef.id, grid: r.karts.map((k) => k.ch.id), diff: r.diff.id, goal: document.getElementById('hud-goal').textContent };
  let n = 0;
  while (!r.results && n++ < 60 * 220) r.update(1 / 60);
  app.paused = false;
  out.place = r.results && r.results.find((x) => x.isPlayer).place;
  return out;
});
console.log('battle', JSON.stringify(bat));
check('battle event: Balloon Battle in Neon Pinball against the masked rival', bat.mode === 'battle' && bat.battle && bat.arena === 'pinball' && bat.grid.length === 6 && bat.grid.includes('mask') && bat.diff === 'hard', JSON.stringify(bat));
await p.waitForTimeout(2500);
if (await p.isVisible('#podium-ui')) { await p.tap('#podium-ui'); await p.waitForTimeout(800); }
const batRes = await p.evaluate(() => { const c = window.zoomies.career; return { ui: window.zoomies.ui.current, res: document.getElementById('res-body').textContent, star: c.stars['L2-2'] || 0, done: !!c.done['L2-2'] }; });
check('battle event: results map the place to stars and show balloons and the Legend Rank', batRes.ui === 'results' && batRes.res.includes('Legend Rank') && batRes.res.includes('Balloon Battle') && (/^[12](st|nd) place/m.test(batRes.res.replace(/^[\s\S]*?Finish in the top 2|^[\s\S]*?finish in the top 2/, '').trim()) ? batRes.done && batRes.star >= 1 : !batRes.done && batRes.star === 0), JSON.stringify({ place: bat.place, ...batRes, res: batRes.res.slice(0, 200) }));
await p.screenshot({ path: 'car/L6b-battle-results.png' });
// drive a real League race with the computer at the wheel and look at the results
const real = await p.evaluate(async () => {
  const app = window.zoomies; const c = app.career;
  app.gp = null; // the hub clears the cup state, as the real flow does
  app.startCareerEvent('L1-1');
  const race = app.race;
  const { AIDriver } = await import('./src/ai.js');
  race.player.ai = new AIDriver(race.player, race, 0.95, race.diff);
  app.paused = true;
  let n = 0; while (!race.results && n++ < 60 * 400) race.update(1 / 60);
  app.paused = false;
  return { place: race.results && race.results.find((r) => r.isPlayer).place, coins0: c.coins };
});
await p.waitForTimeout(2500);
if (await p.isVisible('#podium-ui')) { await p.tap('#podium-ui'); await p.waitForTimeout(800); }
const after1 = await p.evaluate(() => { const c = window.zoomies.career; return { coins: c.coins, star: c.stars['L1-1'] || 0, done: !!c.done['L1-1'], ui: window.zoomies.ui.current, res: document.getElementById('res-body').textContent }; });
console.log('real race', JSON.stringify({ place: real.place, ...after1, res: after1.res.slice(-300) }));
check('League race finishes into the results screen', after1.ui === 'results' && after1.res.includes('Legend Rank'), after1.ui);
check('result matches the place: pass pays coins and a star', real.place <= 3 ? after1.done && after1.star >= 1 && after1.coins > real.coins0 : !after1.done && after1.star === 0);
await p.screenshot({ path: 'car/L6-real-results.png' });

// ---------------- 5. scoring, coins, drops, first-clear bonus ----------------
const pay = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const c = window.zoomies.career;
  c.coins = 0; c.stars = {}; c.done = { ...c.done }; for (const k of Object.keys(c.done)) if (k.startsWith('L')) delete c.done[k];
  const r1 = C.applyResult(c, 'L1-2', { place: 1, gems: 26, finished: true, margin: 3 }); // gems 3 stars
  const parts1 = c.parts.mudBoots || 0;
  const coinsAfter1 = c.coins;
  const r1b = C.applyResult(c, 'L1-2', { place: 1, gems: 26, finished: true, margin: 3 });
  const paidAgain = c.coins - coinsAfter1;
  const lines = r1.lines.map((l) => l[0]);
  const t = C.applyResult(c, 'L1-3', { place: 1, time: C.eventById('L1-3').ev.target * 0.95, finished: true });
  const tFail = C.applyResult(c, 'L2-3', { place: 1, time: C.eventById('L2-3').ev.target * 1.02, finished: true });
  return { stars: r1.stars, firstClear: r1.firstClear, lines, coinsAfter1, ev: C.eventById('L1-2').ev.reward, drop: r1.drop && r1.drop.id, parts1, dropAgain: !!r1b.drop, firstAgain: r1b.firstClear, paidAgain, tStars: t.stars, tPass: t.pass, tFail: tFail.pass, tFailStars: tFail.stars, mult: C.eventById('L1-2').chapter.mult };
});
console.log('pay', JSON.stringify(pay));
check('gems event 3 stars: first clear bonus + stars + coins paid', pay.stars === 3 && pay.firstClear && pay.lines.includes('First clear bonus') && pay.coinsAfter1 >= pay.ev + 3 * 40, JSON.stringify(pay.lines));
check('3-star League drop granted once (Mud Boots)', pay.drop === 'mudBoots' && pay.parts1 === 1 && !pay.dropAgain);
check('replay pays place coins only, no second first clear', !pay.firstAgain && pay.paidAgain > 0 && pay.paidAgain < pay.ev);
check('Gold medal event: under gold passes with 2 stars at 0.95, over gold fails', pay.tPass && pay.tStars >= 2 && !pay.tFail && pay.tFailStars === 0, JSON.stringify([pay.tStars, pay.tFail]));

// ---------------- 6. Legend Rank maths and rewards (given once) ----------------
const rank = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const L = await import('./src/league.js');
  const { cosmeticById, owns } = await import('./src/cosmetics.js');
  const c = C.newCareer(); c.champion = true;
  const evs = L.LEAGUE_EVENTS;
  const rankOf = (n) => L.rankForStars(n);
  const at = [0, 2, 3, 7, 8, 13, 14, 19, 20, 26, 27, 33, 34, 40, 41, 45, 46, 49, 50, 54].map((n) => [n, rankOf(n)]);
  // earn stars event by event through applyResult and note when rewards arrive
  const log = [];
  let seen = new Set();
  const full = { place: 1, gems: 40, time: 1, margin: 9, finished: true, wins: 4, balloons: 4 };
  for (const e of evs) {
    const r = C.applyResult(c, e.id, full);
    const gotNow = [...r.rank.cos, ...r.rank.paints];
    log.push([e.id, L.leagueStars(c), L.legendRank(c), gotNow.join('+')]);
  }
  const owned = ['lg_laurel', 'lg_gong', 'lg_flare', 'lg_checker', 'lg_stadium', 'lg_aurora', 'lg_crest'].every((id) => owns(c, id));
  const dup = c.cos.length === new Set(c.cos).size && c.paints.length === new Set(c.paints).size;
  const again = L.grantLeagueRewards(c);
  const first = L.rankInfo(C.newCareer());
  return { at, log, owned, dup, again, paints: c.paints, title: L.profileTitle(c), ach: (await import('./src/profile.js')).checkAchievements(c, {}).map((a) => a.id), max: L.leagueStars(c), cosCount: c.cos.length, info: L.rankInfo(c), first };
});
console.log('rank', JSON.stringify(rank.at), JSON.stringify(rank.log.map((l) => l.join(':'))));
const want = { 0: 1, 2: 1, 3: 2, 7: 2, 8: 3, 13: 3, 14: 4, 19: 4, 20: 5, 26: 5, 27: 6, 33: 6, 34: 7, 40: 7, 41: 8, 45: 8, 46: 9, 49: 9, 50: 10, 54: 10 };
check('rank maths: thresholds 3 8 14 20 27 34 41 46 50 stars', rank.at.every(([n, r]) => want[n] === r), JSON.stringify(rank.at));
const rewardRows = rank.log.filter((l) => l[3]);
check('rewards arrive at ranks 2, 4, 6, 8, 10 only, each once', rewardRows.length === 5 && rewardRows.map((l) => l[2]).join() === '2,4,6,8,10', JSON.stringify(rewardRows));
check('all 3 hats, 2 trails, 2 horns, 2 paints are owned with no duplicates', rank.owned && rank.dup && rank.cosCount === 7 && rank.paints.includes('lg_teal') && rank.paints.includes('lg_plum'), JSON.stringify(rank.paints));
check('granting again adds nothing', rank.again.cos.length === 0 && rank.again.paints.length === 0);
check('rank 10: Legend title and the League achievements', rank.title === 'Legend' && ['lgfirst', 'lgseasons', 'lgstars', 'lgrank'].every((id) => rank.ach.includes(id)), rank.ach.join());
check('fresh save is rank 1 with 0 stars', rank.first.rank === 1 && rank.first.stars === 0 && rank.first.next === 3);

// ---------------- 7. the results screen shows rank progress and rewards ----------------
await boot(storyDone({ seen: { ...storyDone().seen, 'L1-intro': true }, stars: { 'L1-1': 1, 'L1-2': 1 } }));
await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const app = window.zoomies;
  app.openCareer();
  if (app.careerUI.story) app.careerUI.endStory();
  app.careerUI.league = true;
  const out = C.applyResult(app.career, 'L1-3', { place: 1, time: C.eventById('L1-3').ev.target * 0.9, finished: true });
  app.careerUI.results(out, '', '');
});
await p.waitForTimeout(600);
const resTxt = await p.evaluate(() => document.getElementById('res-body').textContent);
check('results: RANK UP with the new laurel and gong', resTxt.includes('RANK UP') && resTxt.includes('Legend Rank 2') && resTxt.includes('Champion') && resTxt.includes('Victory Gong'), resTxt.slice(0, 260));
await p.evaluate(() => { const r = document.querySelector('#res-body .car-rank'); if (r) r.scrollIntoView({ block: 'center' }); });
await p.waitForTimeout(300);
await p.screenshot({ path: 'car/L7-results-rank-up.png' });
await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const app = window.zoomies;
  const out = C.applyResult(app.career, 'L1-4', { place: 3, finished: true });
  app.careerUI.results(out, '', '');
});
await p.waitForTimeout(500);
const res2 = await p.evaluate(() => document.getElementById('res-body').textContent);
check('results: failed event shows rank progress without rewards', res2.includes('Legend Rank') && !res2.includes('RANK UP'), res2.slice(0, 200));
await p.screenshot({ path: 'car/L7b-results-rank.png' });

// ---------------- 8. rank rewards are wearable and not in the gumball machine ----------------
const gum = await p.evaluate(async () => {
  const K = await import('./src/cosmetics.js');
  const c = window.zoomies.career;
  const before = K.ownedCount(c);
  const seq = { s: 7 }; const rnd = () => { seq.s = (seq.s * 16807) % 2147483647; return seq.s / 2147483647; };
  const probe = { cos: [], freeCaps: 3000, coins: 0, stats: {}, racers: [], paints: [], bodies: [] };
  const got = new Set();
  for (let i = 0; i < 3000; i++) { const r = K.spinGumball(probe, rnd, null); if (r) got.add(r.item.id); }
  c.cos.push('lg_crest'); c.hat = 'lg_crest'; c.trail = 'lg_aurora'; c.horn = 'lg_stadium';
  const look = K.cleanLook(K.lookOf(c));
  return { total: K.COSMETIC_TOTAL, before, after: K.ownedCount(c), leagueRolled: [...got].filter((id) => id.startsWith('lg_')), rolled: got.size, look, items: K.LEAGUE_COSMETICS.length, hats: K.HATS.filter((h) => h.rarity === 'league').length, trails: K.TRAILS.filter((h) => h.rarity === 'league').length, horns: K.HORNS.filter((h) => h.rarity === 'league').length };
});
console.log('gumball', JSON.stringify(gum));
check('League cosmetics never roll in the machine and do not count towards the collection', gum.leagueRolled.length === 0 && gum.before === gum.after && gum.rolled > 20);
check('3 hats, 2 trails, 2 horns', gum.hats === 3 && gum.trails === 2 && gum.horns === 2 && gum.items === 7);
check('online look keeps League hat, trail and horn', gum.look.hat === 'lg_crest' && gum.look.trail === 'lg_aurora' && gum.look.horn === 'lg_stadium', JSON.stringify(gum.look));
// every League hat builds on every racer, and the horns play
const build = await p.evaluate(async () => {
  const { CHARACTERS, STORY_CHARS, driverGeometry } = await import('./src/characters.js');
  const K = await import('./src/cosmetics.js');
  let n = 0, bad = 0;
  for (const ch of [...CHARACTERS, ...STORY_CHARS]) for (const h of K.HATS.filter((x) => x.rarity === 'league')) {
    try { const g = driverGeometry(ch, false, h.id); if (g.attributes.position.count > 0) n++; else bad++; } catch (e) { bad++; }
  }
  const au = window.zoomies.audio; let horns = 0;
  for (const id of ['lg_gong', 'lg_stadium']) { try { au.horn(id); horns++; } catch (e) { /* counted below */ } }
  return { n, bad, horns, chars: CHARACTERS.length, story: STORY_CHARS.map((s) => s.id).join() };
});
check('League hats build on every racer and story character; story characters are not racers', build.bad === 0 && build.n === (build.chars + 3) * 3 && build.horns === 2 && build.chars === 20, JSON.stringify(build));
// the gumball screen shows them with the rank to reach
await p.evaluate(() => { const c = window.zoomies.career; c.cos = c.cos.filter((id) => id !== 'lg_crest'); c.hat = 'nohat'; c.trail = 'classic'; c.horn = 'beep'; window.zoomies.gumballUI.open('career'); window.zoomies.gumballUI.tab = 'hat'; window.zoomies.gumballUI.render(); });
await p.evaluate(() => { const b = document.getElementById('gum-body'); b.scrollTop = b.scrollHeight; const c = window.zoomies.career; c.hat = 'lg_laurel'; window.zoomies.gumballUI.render(); window.zoomies.gumballUI.pick('lg_laurel'); });
await p.waitForTimeout(1200);
await p.screenshot({ path: 'car/L8-hats-league.png' });
for (const h of ['lg_laurel', 'lg_checker', 'lg_crest']) {
  await p.evaluate((id) => { const c = window.zoomies.career; if (!c.cos.includes(id)) c.cos.push(id); window.zoomies.gumballUI.pick(id); }, h);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `car/L8b-hat-${h}.png`, clip: { x: 0, y: 60, width: 400, height: 230 } });
}
const hatsTxt = await p.evaluate(() => [...document.querySelectorAll('#gum-body .cos')].map((e) => e.textContent).join('|'));
check('hats tab: League hats listed by name once owned', hatsTxt.includes('Champion') && hatsTxt.includes('Checkered') && hatsTxt.includes('Crest'), hatsTxt.slice(-120));
await p.evaluate(() => { window.zoomies.openCareer(); window.zoomies.careerUI.openGarage(); window.zoomies.careerUI.tab = 'paint'; window.zoomies.careerUI.pick.paint = 'lg_plum'; window.zoomies.careerUI.renderGarage(); });
await p.waitForTimeout(900);
await p.evaluate(() => { const l = document.getElementById('garage-list'); l.scrollTop = l.scrollHeight; });
await p.waitForTimeout(400);
const pnt = await p.evaluate(() => ({ cards: [...document.querySelectorAll('#garage-list .pcard')].map((e) => e.textContent).join('|'), act: document.getElementById('gar-act').textContent, dim: document.getElementById('gar-act').classList.contains('dim') }));
check('garage: League paints show their rank and cannot be bought', pnt.cards.includes('Rank 8') && pnt.cards.includes('Rank 4') && pnt.dim, JSON.stringify(pnt));
await p.screenshot({ path: 'car/L9-garage-paint-league.png' });

// ---------------- 9. saves: round trip, merge, hostile, old ----------------
const sv = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const L = await import('./src/league.js');
  const { mergeCareer } = await import('./src/sync.js');
  // round trip through localStorage
  const c = window.zoomies.career;
  c.stars['L2-2'] = 2; c.done['L2-2'] = true; c.best['L2-3'] = 120.5; c.drops['L2-2'] = 'armor3';
  C.saveCareer(c);
  const back = C.loadCareer();
  const rt = { stars: back.stars['L2-2'], done: back.done['L2-2'], best: back.best['L2-3'], drops: back.drops['L2-2'], rank: L.legendRank(back) === L.legendRank(c) };
  // merge: stars take the max, done and drops combine, rank follows the merged stars, rewards follow the rank
  const A = C.newCareer(); A.champion = true; A.xp = 100;
  for (const id of ['L1-1', 'L1-2', 'L1-3']) { A.stars[id] = 3; A.done[id] = true; }
  const B = C.newCareer(); B.champion = true; B.xp = 50;
  for (const id of ['L1-4', 'L1-5', 'L1-6', 'L2-1']) { B.stars[id] = 3; B.done[id] = true; }
  B.stars['L1-1'] = 1; B.drops['L1-4'] = 'turbo3'; B.parts.turbo3 = 1;
  const m = mergeCareer(A, B), m2 = mergeCareer(B, A);
  const merge = { stars: L.leagueStars(m), s11: m.stars['L1-1'], done: ['L1-1', 'L1-6', 'L2-1'].every((id) => m.done[id]), rank: L.legendRank(m), rev: L.leagueStars(m2), cos: m.cos.slice().sort().join(), revCos: m2.cos.slice().sort().join(), drop: m.drops['L1-4'], rankA: L.legendRank(A) };
  // hostile: unknown event ids, huge and odd numbers, prototype keys, a non-champion with stars
  const hostile = C.cleanCareer({
    ...C.newCareer(), champion: true,
    stars: { 'L1-1': 1e15, 'L9-9': 3, 'L2-2': -5, 'L3-1': 'x', 'L3-2': NaN, __proto__: 3, ['L'.repeat(200)]: 3 },
    done: { 'L1-1': true, 'L7-7': true, constructor: 1 }, best: { 'L1-3': Infinity, 'L1-4': -3, 'L2-3': 99.5 }, drops: { 'L1-2': 'bogus', 'L1-3': 'engine3', 'L5-5': 'engine3' },
    cos: ['lg_crest', ['x'], 5, 'y'.repeat(100)], paints: 'nope', seen: { 'L1-intro': 1e30 },
  });
  const nochamp = C.cleanCareer({ ...C.newCareer(), champion: false, stars: Object.fromEntries(L.LEAGUE_EVENTS.map((e) => [e.id, 3])) });
  const huge = C.cleanCareer({ ...C.newCareer(), champion: true, stars: Object.fromEntries(L.LEAGUE_EVENTS.map((e) => [e.id, 1e9])) });
  return { rt, merge, hostile: { stars: hostile.stars, rank: L.legendRank(hostile), ls: L.leagueStars(hostile), keys: Object.keys(hostile.stars).length, drops: hostile.drops, best: hostile.best, cos: hostile.cos, paints: hostile.paints, proto: Object.getPrototypeOf(hostile.stars) === Object.prototype }, nochampCos: nochamp.cos, nochampRank: L.legendRank(nochamp), huge: { ls: L.leagueStars(huge), rank: L.legendRank(huge), cos: huge.cos.length } };
});
console.log('saves', JSON.stringify(sv));
check('round trip: League stars, done, best time, drops survive a save and load', sv.rt.stars === 2 && sv.rt.done && sv.rt.best === 120.5 && sv.rt.drops === 'armor3' && sv.rt.rank);
check('merge: most stars per event, all clears, rank from the merged stars', sv.merge.s11 === 3 && sv.merge.done && sv.merge.stars === 21 && sv.merge.rank === 5 && sv.merge.rankA === 3 && sv.merge.rev === 21, JSON.stringify(sv.merge));
check('merge: rank rewards follow the merged rank in both orders, drops combine', sv.merge.cos === sv.merge.revCos && sv.merge.cos.includes('lg_flare') && !sv.merge.cos.includes('lg_checker') && sv.merge.drop === 'turbo3', sv.merge.cos);
check('hostile: huge and odd star counts are clamped to 0-3', sv.hostile.stars['L1-1'] === 3 && sv.hostile.stars['L2-2'] === 0 && !('L3-1' in sv.hostile.stars) && !('L3-2' in sv.hostile.stars) && sv.hostile.ls === 3);
check('hostile: unknown ids stay harmless (bounded, not counted), bad drops dropped', sv.hostile.rank === 2 && sv.hostile.drops['L1-2'] === undefined && sv.hostile.drops['L1-3'] === 'engine3' && sv.hostile.keys <= 8 && sv.hostile.proto, JSON.stringify(sv.hostile));
check('hostile: League cosmetics claimed without the rank are removed, earned ones stay', !sv.hostile.cos.includes('lg_crest') && sv.hostile.cos.includes('lg_laurel') && sv.hostile.cos.includes('lg_gong'), JSON.stringify(sv.hostile.cos));
check('hostile: best times must be positive numbers, cos/paints cleaned', sv.hostile.best['L2-3'] === 99.5 && !('L1-4' in sv.hostile.best) && sv.hostile.cos.every((x) => typeof x === 'string' && x.length <= 64) && Array.isArray(sv.hostile.paints), JSON.stringify([sv.hostile.best, sv.hostile.cos]));
check('hostile: no champion flag, no rewards; max stars is rank 10 with exactly the rewards', sv.nochampCos.length === 0 && sv.nochampRank === 10 && sv.huge.ls === 54 && sv.huge.cos === 7);

// an old save (before the League existed) loads and shows the locked card
const oldSave = { v: 1, coins: 777, racer: 'mochi', racers: ['mochi'], body: 'buggy', bodies: ['buggy'], upgrades: { buggy: { engine: 2 } }, paint: 'stock', paints: ['stock'], stars: { 'c1-1': 2 }, done: { 'c1-1': true }, seen: { 'c1-intro': true }, beaten: [], xp: 500 };
await boot(oldSave);
const old = await p.evaluate(async () => {
  const L = await import('./src/league.js');
  const c = window.zoomies.career;
  window.zoomies.openCareer();
  if (window.zoomies.careerUI.story) window.zoomies.careerUI.endStory();
  return { coins: c.coins, rank: L.legendRank(c), champion: c.champion, card: document.getElementById('chap-league').textContent, cos: c.cos.length, league: window.zoomies.careerUI.league };
});
check('old save loads: League locked, rank 1, nothing granted', old.coins === 777 && old.rank === 1 && !old.champion && old.card.includes('Win the Golden Wheel') && old.cos === 0 && !old.league, JSON.stringify(old));
// an old champion (flag set before the League existed) sees the League open with the NEW hint
await boot(storyDone());
await p.evaluate(() => window.zoomies.openCareer());
await p.waitForTimeout(800);
check('old champion save: the League is open and flagged NEW', await p.evaluate(() => document.getElementById('chap-league').textContent.includes('NEW') && !document.getElementById('chap-league').classList.contains('locked')));

// ---------------- 10. the season stories play and the Career epilogue points to the League ----------------
const story = await p.evaluate(async () => {
  const C = await import('./src/career.js');
  const L = C.LEAGUE;
  const lines = (s) => [...s.intro, ...s.bossIntro, ...s.outro, ...(s.epilogue || []), ...s.events.flatMap((e) => e.after || [])];
  const all = L.flatMap(lines);
  const speakers = [...new Set(all.map((l) => l[0]))].sort();
  const { SPEAKERS } = C;
  const { charById } = await import('./src/characters.js');
  const known = speakers.every((s) => SPEAKERS[s] || charById(s).id === s);
  const epi = C.CHAPTERS[6].epilogue.map((l) => l[1]).join(' ');
  // the clue chain: M note, honey, "Heh", paw prints; the reveal names Bruno
  const text = all.map((l) => l[1]).join(' ');
  return { speakers: speakers.join(), known, len: all.length, short: all.every((l) => l[1].length < 330), epiLeague: epi.includes('Legends League') && !/coming soon/i.test(epi), clues: ['honey', 'Heh', 'paw prints', 'welds'].every((w) => text.includes(w)), reveal: L[1].outro[1][0] === 'mic' && L[1].outro.some((l) => l[0] === 'bruno'), final: L[2].boss.body, epilogueSoon: /coming soon/i.test(L[2].epilogue.map((l) => l[1]).join(' ')) };
});
console.log('story', JSON.stringify(story));
check('story: every speaker is a known character or narrator', story.known, story.speakers);
check('story: Career epilogue points to the League', story.epiLeague);
check('story: clues planted, Bruno unmasked, Season 3 epilogue sets up future seasons', story.clues && story.reveal && story.epilogueSoon);

// ---------------- 11. desktop screenshots ----------------
await p.close();
const dctx = await b.newContext({ viewport: { width: 1470, height: 860 } });
const d = await dctx.newPage();
d.on('pageerror', (e) => { errs.push(e.message); console.log('[pageerror desktop]', e.message); });
d.setDefaultTimeout(90000);
await d.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
const dsave = storyDone({ seen: { ...storyDone().seen, 'L1-intro': true, 'L2-intro': true }, stars: { 'L1-1': 3, 'L1-2': 3, 'L1-3': 2, 'L1-4': 1, 'L1-5': 2, 'L1-6': 3 } });
dsave.done = { ...dsave.done, 'L1-1': true, 'L1-2': true, 'L1-3': true, 'L1-4': true, 'L1-5': true, 'L1-6': true };
await d.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, dsave]);
await d.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await d.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 90000 });
await d.waitForTimeout(1500);
await d.evaluate(() => { const u = window.zoomies.careerUI; u.league = true; u.ci = null; window.zoomies.openCareer(); });
await d.waitForTimeout(1500);
await d.evaluate(() => { const u = window.zoomies.careerUI; if (u.story) u.endStory(); u.sel = 'L2-1'; u.render(); });
await d.waitForTimeout(800);
await d.screenshot({ path: 'car/L10-desktop-league-map.png' });
await d.evaluate(() => { const u = window.zoomies.careerUI; u.sel = 'L2-3'; u.render(); });
await d.waitForTimeout(500);
await d.screenshot({ path: 'car/L10b-desktop-event-card.png' });
await d.evaluate(() => { window.zoomies.careerUI.playStories([{ key: 'x', lines: window.zoomies.careerUI.list[1].outro, title: 'Masked Rival' }], () => {}); });
await d.waitForTimeout(800);
for (let i = 0; i < 2; i++) { await d.click('#scr-story .story-box'); await d.waitForTimeout(250); }
await d.screenshot({ path: 'car/L11-desktop-story-reveal.png' });
await d.evaluate(async () => {
  const C = await import('./src/career.js');
  const app = window.zoomies;
  app.career.stars['L2-1'] = 1; app.career.stars['L2-2'] = 1; app.career.stars['L2-4'] = 1;
  const out = C.applyResult(app.career, 'L2-3', { place: 1, time: C.eventById('L2-3').ev.target * 0.9, finished: true });
  app.careerUI.results(out, '', '');
});
await d.waitForTimeout(800);
await d.screenshot({ path: 'car/L12-desktop-results-rank.png' });
await d.evaluate(() => { window.zoomies.gumballUI.open('career'); window.zoomies.gumballUI.tab = 'trail'; window.zoomies.gumballUI.render(); });
await d.waitForTimeout(900);
await d.screenshot({ path: 'car/L13-desktop-trails.png' });
await dctx.close();

console.log('errors', errs.length + fails);
await b.close();
