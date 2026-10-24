// Track events (src/events.js): the schedule's fairness rules and
// determinism, when events are off, the online setup check, what each effect
// does to a kart, the same hazards on two pages, warnings, draw calls, and
// screenshots of each flagship event's warning, peak and end (in ev/).
//
//   node run.mjs events            (prints "errors N"; any failure counts)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('ev', { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
ctx.setDefaultTimeout(180000);
const url = 'http://localhost:8000/index.html';
let errors = 0;
const fail = (msg) => { errors++; console.log('FAIL', msg); };
const ok = (cond, msg) => (cond ? console.log('ok  ', msg) : fail(msg));
const page = async (n) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors++; console.log(`[${n} pageerror]`, e.message, e.stack?.slice(0, 500)); });
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load')) console.log(`[${n}]`, m.text().slice(0, 300)); });
  await p.goto(url);
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 60000 });
  await p.evaluate(() => { window.zoomies.paused = true; });
  return p;
};
const A = await page('A');

// ---- 1. the schedule: fairness rules, determinism, Off, Wild ----
const sch = await A.evaluate(async () => {
  const { schedule, estRaceTime, legWindow, EV_FIRST, EV_GAP, EV_LAST, EVENTS } = await import('./src/events.js');
  const { TRACKS } = await import('./src/tracks.js');
  const { ARENAS } = await import('./src/arenas.js');
  const { Track } = await import('./src/track.js');
  const { SPEED_CLASSES } = await import('./src/race.js');
  const bad = [];
  const count = { normal: 0, wild: 0 };
  let n = 0;
  for (const def of [...TRACKS, ...ARENAS].filter((t) => t.events)) for (const rev of def.arena || def.laps === 1 ? [false] : [false, true]) {
    const tr = new Track(def, rev);
    for (const cls of Object.values(SPEED_CLASSES)) {
      const T = def.arena ? 150 : estRaceTime(tr.length, def.laps || 3, cls.top);
      const wins = {};
      for (const id of def.events) if (EVENTS[id].leg) wins[id] = legWindow(tr, EVENTS[id].leg);
      for (const mode of ['normal', 'wild']) for (let seed = 1; seed < 160; seed++) {
        const s = schedule(seed * 7919, mode, def.events, T, wins);
        n++;
        count[mode] += s.length;
        if (JSON.stringify(s) !== JSON.stringify(schedule(seed * 7919, mode, def.events, T, wins))) bad.push(`${def.id} not deterministic`);
        s.forEach((e, i) => {
          if (e.warnAt < EV_FIRST) bad.push(`${def.id} ${mode} ${seed}: warning at ${e.warnAt}`);
          if (e.at - e.warnAt < 3) bad.push(`${def.id} ${mode} ${seed}: warning only ${e.at - e.warnAt}s`);
          if (e.end > T * EV_LAST + 1e-6) bad.push(`${def.id} ${mode} ${seed}: ends ${e.end} > ${(T * EV_LAST).toFixed(1)}`);
          if (e.end - e.at !== EVENTS[e.id].dur && Math.abs(e.end - e.at - EVENTS[e.id].dur) > 0.01) bad.push(`${def.id}: wrong duration`);
          if (i && e.warnAt - s[i - 1].end < EV_GAP - 1e-6) bad.push(`${def.id} ${mode} ${seed}: gap ${(e.warnAt - s[i - 1].end).toFixed(1)}s`);
        });
      }
    }
  }
  const off = schedule(5, 'off', ['blizzard'], 200).length + schedule(5, 'bogus', ['blizzard'], 200).length + schedule(5, 'wild', [], 200).length + schedule(5, 'wild', ['nope'], 200).length;
  return { bad: bad.slice(0, 8), nBad: bad.length, n, normal: count.normal / (n / 2), wild: count.wild / (n / 2), off };
});
ok(sch.nBad === 0, `schedule rules hold over ${sch.n} schedules (first 25 s, warning >= 3 s, 20 s gaps, nothing in the last 8%, deterministic) ${sch.bad.join('; ')}`);
ok(sch.off === 0, 'Off, an unknown mode or a track without events schedules nothing');
ok(sch.wild > sch.normal, `Wild has more events: ${sch.wild.toFixed(2)} per race vs Normal ${sch.normal.toFixed(2)}`);

// ---- 2. when events are off ----
const offs = await A.evaluate(() => {
  const a = window.zoomies;
  const run = (cfg, setting = 'wild') => {
    a.settings.trackEvents = setting;
    a.startRace({ reverse: false, player: 'mochi', speedClass: 'zoom', trackId: 'frost', ...cfg });
    a.paused = true;
    return !!a.race.evs;
  };
  const r = {
    quickWild: run({ mode: 'quick' }),
    quickNormal: run({ mode: 'quick' }, 'normal'),
    quickOff: run({ mode: 'quick' }, 'off'),
    gp: run({ mode: 'gp' }),
    timeTrial: run({ mode: 'tt' }),
    timeTrialForced: run({ mode: 'tt', evMode: 'wild', evSeed: 3 }),
    school: run({ mode: 'quick', school: true, laps: 1 }),
    schoolForced: run({ mode: 'quick', school: true, evMode: 'wild', evSeed: 3 }),
    career: run({ mode: 'quick', careerEv: { id: 'x', type: 'race' } }),
    daily: run({ mode: 'quick', dailyEv: { mod: { icon: '', name: '' }, goal: 3 } }),
  };
  a.settings.trackEvents = 'normal';
  return r;
});
ok(offs.quickWild && offs.quickNormal && offs.gp, `events on in Quick Race and Grand Prix (${JSON.stringify(offs)})`);
ok(!offs.quickOff && !offs.timeTrial && !offs.timeTrialForced && !offs.school && !offs.schoolForced, 'events off with the setting Off, in Time Trial (medals) and Driving School');
ok(!offs.career && !offs.daily, 'events off in the Career and the Daily for now (Phase B brings their own)');

// ---- 3. the online race setup: hostile evSeed / evMode turn events off ----
const hostile = await A.evaluate(async () => {
  const { validStart } = await import('./src/net.js');
  const base = () => ({ trackId: 'frost', grid: ['mochi', 'bao'], humans: [{ id: 'host', slot: 0 }, { id: 'g', slot: 1 }] });
  const res = [];
  for (const [evSeed, evMode] of [[-1, 'wild'], [1.5, 'wild'], ['123', 'wild'], [2 ** 31, 'wild'], [NaN, 'wild'], [1e20, 'normal'], [null, 'normal'], [{}, 'normal'],
    [12, 'WILD'], [12, 'nope'], [12, 5], [12, null], [12, ['wild']], [12, { toString: () => 'wild' }], [undefined, undefined]]) {
    const c = { ...base(), evSeed, evMode };
    const v = validStart(c);
    res.push(v && c.evMode === 'off' && c.evSeed === 0);
  }
  const good = { ...base(), evSeed: 424242, evMode: 'wild' };
  return { all: res.every(Boolean), res, good: validStart(good) && good.evSeed === 424242 && good.evMode === 'wild' };
});
ok(hostile.all, `hostile evSeed/evMode are turned off (${hostile.res.map((x) => (x ? 1 : 0)).join('')})`);
ok(hostile.good, 'a valid seed and mode pass through');

// Helpers inside the page: start a race with a seed and run it to a time.
const prep = () => {
  window.evStart = (tid, seed, mode = 'normal', extra = {}) => {
    const a = window.zoomies;
    const arena = ['barnyard', 'snowglobe', 'pinball', 'sandcastle', 'crater'].includes(tid);
    a.startRace({ mode: arena ? 'battle' : 'quick', trackId: tid, reverse: false, player: 'mochi', speedClass: 'zoom', evMode: mode, evSeed: seed, ...extra });
    a.paused = true;
    const r = a.race;
    r.skipIntro = true;
    const AI = r.karts.find((k) => k.ai).ai.constructor;
    r.player.ai = new AI(r.player, r, 0.95, r.diff);
    return r;
  };
  window.evRun = (r, t, each) => { let n = 0; while (r.netClock < t && n++ < 60 * 400) { r.update(1 / 60); if (each) each(r); } };
  window.evFind = (tid, id, mode = 'normal') => {
    // A seed whose schedule has event `id`.
    for (let seed = 1; seed < 400; seed++) {
      const r = window.evStart(tid, seed * 101, mode);
      const e = r.evs && r.evs.sched.find((x) => x.id === id);
      if (e) return { r, e, seed: seed * 101 };
    }
    return null;
  };
};
await A.evaluate(prep);

// ---- 4. warnings come at least 3 s before any effect (Full and Short) ----
const warn = await A.evaluate(async () => {
  const out = {};
  for (const w of ['full', 'short']) {
    window.zoomies.settings.evWarn = w;
    const { r, e } = window.evFind('frost', 'blizzard');
    let first = null, early = false;
    window.evRun(r, e.at + 0.5, (rr) => {
      const h = rr.evs.hud;
      if (h && h.phase === 'warn' && first === null) first = rr.netClock;
      if (rr.netClock < e.at - 1 / 30 && (rr.evMods || rr.track.patches.some((p) => p.ev) || rr.evs.vis > 0)) early = true;
    });
    out[w] = { lead: e.at - first, early, on: !!r.evMods };
  }
  window.zoomies.settings.evWarn = 'full';
  return out;
});
ok(warn.full.lead >= 3 && warn.short.lead >= 2.98 && warn.short.lead <= 3.1, `the warning shows ${warn.full.lead.toFixed(2)} s (Full) / ${warn.short.lead.toFixed(2)} s (Short) before the effect`);
ok(!warn.full.early && !warn.short.early && warn.full.on, 'no modifier, patch or fog before the effect starts; modifiers on once it does');

// ---- 5. the effects ----
const fx = await A.evaluate(async () => {
  const { PATCHES } = await import('./src/track.js');
  const { EVENTS, bury } = await import('./src/events.js');
  const out = {};
  // Wind: a steady crosswind drifts a kart sideways, within the clamp.
  const drift = (wind) => {
    const a = window.zoomies;
    a.startRace({ mode: 'quick', trackId: 'sprout', reverse: false, player: 'mochi', speedClass: 'zoom', evMode: 'off' });
    a.paused = true;
    const r = a.race; r.skipIntro = true;
    window.evRun(r, 0.5);
    const k = r.player;
    k.ai = null;
    k.placeAt(r.track.length * 0.02, 0);
    let maxLat = 0;
    for (let i = 0; i < 120; i++) {
      r.evMods = wind ? { grip: 1, traction: 1, gravity: 1, wind } : null;
      Object.assign(k.ctl, { steer: 0, throttle: 1, brake: false, drift: false, item: false });
      k.step(1 / 60, false);
      const vl = k.vel.x * -Math.cos(k.yaw) + k.vel.z * Math.sin(k.yaw);
      maxLat = Math.max(maxLat, Math.abs(vl));
    }
    r.evMods = null;
    return { d: k.trk.d, lat: maxLat };
  };
  const calm = drift(0), windy = drift(8), back = drift(-8);
  out.wind = { calm: calm.d, windy: windy.d, back: back.d, lat: windy.lat };
  // The published wind is clamped even if an event asks for more.
  {
    const { r, e } = window.evFind('dunes', 'sandstorm');
    const orig = EVENTS.sandstorm.update;
    EVENTS.sandstorm.update = function (sys) { sys.mods.wind = 100; sys.mods.grip = 0.1; };
    window.evRun(r, e.at + 1);
    out.clamp = { ...r.evMods };
    EVENTS.sandstorm.update = orig;
  }
  // Ice patch: a kart on one gets the ice patch's low grip.
  {
    const { r, e } = window.evFind('frost', 'blizzard');
    window.evRun(r, e.at + 1);
    const p = r.evs.cur.patches[0];
    const k = r.karts[3];
    k.placeAt(p.s + p.len / 2, p.d);
    k.vel.set(Math.sin(k.yaw) * 20, 0, Math.cos(k.yaw) * 20);
    k.step(1 / 60, false);
    out.ice = { on: k.patch === PATCHES.ice, grip: k.patch ? k.patch.grip : 1, n: r.evs.cur.patches.length };
    window.evRun(r, e.end + 0.5);
    out.ice.after = r.track.patches.some((q) => q.ev);
  }
  // Lava puddle: a kart that drives into one spins out.
  {
    const { r, e } = window.evFind('magma', 'lavaRain');
    window.evRun(r, e.at + 3);
    const c = r.evs.cur.rocks.find((q) => q.st === 2);
    const k = r.karts[2];
    k.invuln = 0; k.starTime = 0; k.rocketTime = 0; k.ghostTime = 0; k.shield = 0; k.spinTime = 0;
    k.placeAt(c.s, c.d);
    window.evRun(r, r.netClock + 0.1);
    out.lava = { spin: k.spinTime, puddles: r.evs.cur.rocks.filter((q) => q.st === 2).length, marked: r.evs.cur.rocks.filter((q) => q.st === 1).length, aiHazards: r.evs.hazards.length };
    window.evRun(r, e.end + 0.5);
    out.lava.after = r.evs.layers.lava.parts.size + r.evs.layers.ring.parts.size;
  }
  // Avalanche: a snow lump slows a kart a lot but never stops it dead.
  {
    const { r, e } = window.evFind('frost', 'avalanche');
    window.evRun(r, e.at + 1.3);
    const k = r.karts[4];
    k.invuln = 0; k.starTime = 0; k.rocketTime = 0; k.ghostTime = 0; k._evBury = -9;
    // a lump that is on the road now
    const lump = r.evs.hazards.map((h) => ({ h, pr: r.track.project(h.pos.x, h.pos.z, -1, {}) })).find((q) => Math.abs(q.pr.d) < q.pr.hw - 2);
    const v0 = 25;
    k.placeAt(lump.pr.s, lump.pr.d);
    k.vel.set(Math.sin(k.yaw) * v0, 0, Math.cos(k.yaw) * v0);
    r.update(1 / 60);
    const s1 = k.speed;
    let minS = s1;
    for (let i = 0; i < 60; i++) { r.update(1 / 60); minS = Math.min(minS, k.speed); }
    out.aval = { buried: k._evBury > 0, s1, minS, spin: k.spinTime };
    // and directly: half the speed, a short slide
    const k2 = r.karts[5];
    k2.vel.set(Math.sin(k2.yaw) * v0, 0, Math.cos(k2.yaw) * v0);
    k2.slipTime = 0;
    bury(r.evs, k2);
    out.aval.direct = k2.speed;
  }
  return out;
});
ok(Math.abs(fx.wind.windy - fx.wind.calm) > 0.4 && Math.sign(fx.wind.windy - fx.wind.calm) === -Math.sign(fx.wind.back - fx.wind.calm), `wind drifts a kart sideways: ${fx.wind.calm.toFixed(2)} m calm, ${fx.wind.windy.toFixed(2)} m / ${fx.wind.back.toFixed(2)} m with a full crosswind either way`);
ok(fx.wind.lat < 2.5, `wind's sideways speed stays small (${fx.wind.lat.toFixed(2)} m/s at the 8 m/s² clamp)`);
ok(fx.clamp.wind === 8 && fx.clamp.grip === 0.6, `modifiers are clamped (asked 100 / 0.1, got ${fx.clamp.wind} / ${fx.clamp.grip})`);
ok(fx.ice.on && fx.ice.grip < 0.5 && fx.ice.n >= 4 && !fx.ice.after, `blizzard ice patches lower grip (${fx.ice.grip}) and are gone afterwards (${fx.ice.n} patches)`);
ok(fx.lava.spin > 0 && fx.lava.puddles > 0 && fx.lava.aiHazards > 0 && fx.lava.after === 0, `a lava puddle spins a kart out (spin ${fx.lava.spin.toFixed(2)} s; ${fx.lava.puddles} puddles, ${fx.lava.marked} circles marked, ${fx.lava.aiHazards} hazards the AI sees; ${fx.lava.after} left after)`);
ok(fx.aval.buried && fx.aval.minS > 5 && fx.aval.s1 >= 0.4 * 25 - 1 && fx.aval.spin <= 0, `an avalanche lump buries a kart: ${fx.aval.s1.toFixed(1)} m/s right after (from 25), never below ${fx.aval.minS.toFixed(1)} m/s, no spin`);
ok(Math.abs(fx.aval.direct - 12.5) < 0.01, `buried: exactly half speed (${fx.aval.direct.toFixed(2)} m/s from 25)`);

// ---- 6. the same hazards on two pages ----
const B = await page('B');
await B.evaluate(prep);
const fp = async (p) => p.evaluate(() => {
  const out = [];
  for (const [tid, seed] of [['frost', 1234], ['magma', 777], ['dunes', 99], ['coral', 4321], ['tidal', 55],
    ['sprout', 11], ['blossom', 12], ['candy', 13], ['downs', 14], ['hollow', 15], ['jungle', 16], ['gear', 17], ['maple', 18], ['neon', 19], ['cloud', 20], ['glacier', 21], ['obsidian', 22], ['moon', 23],
    ['odyssey', 24], ['hopper', 25], ['barnyard', 26], ['snowglobe', 27], ['pinball', 28], ['sandcastle', 29], ['crater', 30]]) {
    const r = window.evStart(tid, seed, 'wild');
    const sched = r.evs.sched.map((e) => `${e.id}@${e.warnAt}/${e.at}/${e.end}`).join(',');
    const seen = [];
    for (const e of r.evs.sched) {
      window.evRun(r, e.at + 2.5);
      const c = r.evs.cur;
      const pts = (c.rocks || c.ice || c.spots || c.lanes || c.zones || c.cracks || c.panels || c.belts || []).map((q) => `${q.x.toFixed(2)},${q.z.toFixed(2)}`).join(' ');
      const hz = r.evs.hazards.map((h) => `${h.pos.x.toFixed(2)},${h.pos.z.toFixed(2)}`).join(' ');
      seen.push(`${e.id}[${pts}](${hz}) side ${c.side ?? ''} wind ${r.evMods ? r.evMods.wind.toFixed(3) : '-'}`);
    }
    out.push(`${tid}: ${sched} :: ${seen.join(' | ')}`);
  }
  return out;
});
const fa = await fp(A), fb = await fp(B);
fa.forEach((s, i) => ok(s === fb[i] && s.length > 40, `two pages, same seed: same schedule and hazard positions on ${s.split(':')[0]} (${s.length} chars)`));
console.log('  e.g.', fa[1].slice(0, 260));
await B.close();

// ---- 7. screenshots (warning, peak, end) and draw calls ----
await A.evaluate(async () => { window.evMod = await import('./src/events.js'); });
const SHOTS = [['frost', 'blizzard'], ['frost', 'avalanche'], ['magma', 'lavaRain'], ['magma', 'eruption'], ['dunes', 'sandstorm'], ['coral', 'tide'], ['tidal', 'tide'],
  ['sprout', 'harvestGust'], ['blossom', 'lanternFest'], ['candy', 'syrupShower'], ['downs', 'twisterCrossing'], ['hollow', 'ghostParade'], ['jungle', 'templeTremor'],
  ['gear', 'factoryAlarm'], ['maple', 'leafStorm'], ['neon', 'powerSurge'], ['cloud', 'fireworks'], ['glacier', 'iceQuake'], ['obsidian', 'glassCrack'], ['moon', 'meteorShower'],
  ['odyssey', 'riverSurge'], ['odyssey', 'jetStream'], ['hopper', 'harborSwell'], ['hopper', 'ashCloud'],
  ['barnyard', 'stampede'], ['snowglobe', 'whiteout'], ['pinball', 'overload'], ['sandcastle', 'tideRush'], ['crater', 'craterMeteors']];
// Seconds into the effect that show an event at its best (default: 45% of it).
const PEAK = { tide: 3.2, tideRush: 3.5, powerSurge: 4.5, glassCrack: 2.2, factoryAlarm: 7.4, templeTremor: 10, twisterCrossing: 6.3, ghostParade: 6.2, syrupShower: 9, iceQuake: 6, harborSwell: 3, stampede: 3.2 };
const shotInfo = [];
const ONLY = process.env.EV_ONLY ? process.env.EV_ONLY.split(',') : null;
for (const [tid, id] of SHOTS.filter(([, i]) => !ONLY || ONLY.includes(i))) {
  for (const [phase, at] of [['warn', -2], ['peak', 0.45], ['end', 1]]) {
    const info = await A.evaluate(({ tid, id, phase, at, peak }) => {
      const a = window.zoomies;
      const { r, e } = window.evFind(tid, id, ['jetStream', 'ashCloud', 'harborSwell'].includes(id) ? 'wild' : 'normal');
      const { EVENTS } = window.evMod;
      const def = EVENTS[id];
      const t = phase === 'warn' ? e.at + at : phase === 'peak' ? e.at + (peak ?? def.dur * at) : e.end + at;
      // Drive to a little before the moment, then put the player just before the action.
      window.evRun(r, t - 1.2);
      const c = r.evs.cur;
      const spot = c && (c.spots || c.lanes || c.zones || c.ice || c.cracks || c.panels || c.belts || (c.rocks && c.rocks.filter((q) => q.st === 1 || q.st === 2)));
      if (spot && spot.length) r.player.placeAt((spot[0].s - 52 + r.track.length) % r.track.length, 0);
      r.camSeg = -1; // the camera's track hint is stale after a teleport
      const k = r.player, sp = 24;
      k.vel.set(Math.sin(k.yaw) * sp, 0, Math.cos(k.yaw) * sp);
      r.placeCam(true);
      window.evRun(r, t);
      a.hud.update(r, 1 / 60);
      window.evShot = () => { a.hud.update(r, 1 / 60); if (a.post.active) a.post.render(r.scene, r.camera, r.grade, 1 / 60); else a.renderer.render(r.scene, r.camera); };
      const R = a.renderer;
      const draw = () => { R.info.reset(); R.render(r.scene, r.camera); return { calls: R.info.render.calls, tris: R.info.render.triangles }; };
      const withEv = draw();
      r.evs.group.visible = false;
      const without = draw();
      r.evs.group.visible = true;
      return { t: +t.toFixed(1), withEv, without, fogFar: r.world.fog.far.toFixed(0), hud: r.evs.hud && `${r.evs.hud.phase} ${r.evs.hud.name} ${r.evs.hud.secs}`, mods: r.evMods && JSON.stringify(r.evMods) };
    }, { tid, id, phase, at, peak: PEAK[id] });
    await A.waitForTimeout(2600); // let the HUD's own animations (GO!, toasts) settle
    await A.evaluate(() => window.evShot());
    await A.screenshot({ path: `ev/${tid}-${id}-${phase}.png` });
    console.log(`shot ev/${tid}-${id}-${phase}.png`, JSON.stringify(info));
    shotInfo.push({ tid, id, phase, ...info });
  }
}
// ---- 8. draw calls and triangles of every new event at its peak, hidden versus shown (from the shots above) ----
const heavy = shotInfo.filter((x) => x.phase === 'peak' && (x.withEv.calls - x.without.calls > 2 || x.withEv.tris - x.without.tris > 10000));
shotInfo.filter((x) => x.phase === 'peak').forEach((x) => console.log(`  cost ${x.tid}/${x.id}: +${x.withEv.calls - x.without.calls} calls, +${x.withEv.tris - x.without.tris} triangles`));
ok(heavy.length === 0, `every event stays within +2 draw calls and +10000 triangles at its peak ${heavy.map((x) => `${x.id} +${x.withEv.calls - x.without.calls}/+${x.withEv.tris - x.without.tris}`).join('; ')}`);

// ---- 9. a seeded Wild race on every track and arena: no page errors, it finishes, effects stay inside the clamps, nothing kills or stalls ----
const sweep = await A.evaluate(() => {
  const ids = ['sprout', 'coral', 'dunes', 'frost', 'candy', 'neon', 'magma', 'cloud', 'downs', 'tidal', 'glacier', 'obsidian', 'hollow', 'jungle', 'gear', 'moon', 'maple', 'blossom', 'odyssey', 'hopper',
    'barnyard', 'snowglobe', 'pinball', 'sandcastle', 'crater'];
  const out = [];
  for (const tid of ids) {
    const r = window.evStart(tid, 9001 + tid.length, 'wild');
    const bat = !!r.battle;
    let n = 0, bad = '', stall = 0, worst = 0, hits = 0, pops = 0, inEv = false, evSeen = new Set();
    const upd = r.evs.update.bind(r.evs);
    r.evs.update = (dt) => { inEv = true; upd(dt); inEv = false; };
    if (bat) {
      for (const k of r.karts) { const h = k.hit.bind(k); k.hit = (...a) => { if (inEv) hits++; return h(...a); }; }
      const oh = r.battle.onHit.bind(r.battle);
      r.battle.onHit = (k) => { if (inEv) pops++; return oh(k); };
    }
    const slow = new Map();
    while (n++ < 60 * 420 && !(bat ? r.battle.done : r.player.finished)) {
      r.update(1 / 60);
      const m = r.evMods;
      if (m && (m.wind < -8 || m.wind > 8 || m.grip < 0.6 || m.grip > 1 || m.traction < 0.6 || m.traction > 1 || m.gravity < 0.6 || m.gravity > 1.2)) bad = 'modifier out of range';
      if (r.evs.cur) evSeen.add(r.evs.cur.id);
      if (r.netClock > 8 && r.state === 'race') for (const k of r.karts) {
        if (k.out || k.finished) { slow.delete(k); continue; }
        const t0 = slow.get(k);
        if (k.speed < 1.5 && !k.spinTime) { if (t0 === undefined) slow.set(k, r.netClock); else worst = Math.max(worst, r.netClock - t0); } else slow.delete(k);
      }
    }
    out.push({ tid, secs: +r.netClock.toFixed(0), done: bat ? r.battle.done : r.player.finished, events: [...evSeen].join(','), bad, worst: +worst.toFixed(1), hits, pops, left: r.track.patches.filter((p) => p.ev).length + r.track.boosts.filter((p) => p.ev).length });
  }
  return out;
});
for (const x of sweep) console.log('  race', JSON.stringify(x));
ok(sweep.every((x) => x.done), `a Wild race finishes on every track and arena (${sweep.filter((x) => !x.done).map((x) => x.tid)})`);
ok(sweep.every((x) => x.events), `every track and arena showed an event (${sweep.filter((x) => !x.events).map((x) => x.tid)})`);
ok(sweep.every((x) => !x.bad), `modifiers stay inside the clamps on every track (${sweep.filter((x) => x.bad).map((x) => x.tid)})`);
ok(sweep.every((x) => x.worst < 5), `no kart is stuck for 5 s or more (worst ${Math.max(...sweep.map((x) => x.worst))} s)`);
ok(sweep.every((x) => x.hits === 0 && x.pops === 0), `arena events never call a kart hit or pop a balloon (${sweep.filter((x) => x.hits || x.pops).map((x) => `${x.tid} ${x.hits}/${x.pops}`)})`);
ok(sweep.every((x) => x.left === 0 || !x.done), 'no timed patch or boost lane is left on the road after the events');

// ---- 10. what the new events do ----
const eff = await A.evaluate(async () => {
  const { PATCHES } = await import('./src/track.js');
  const out = {};
  const onEvent = (tid, id, extra = 1.5) => {
    const f = window.evFind(tid, id, ['jetStream', 'ashCloud', 'harborSwell', 'riverSurge', 'templeTremor'].includes(id) ? 'wild' : 'normal');
    window.evRun(f.r, f.e.at + extra);
    return f;
  };
  const free = (k) => { k.invuln = 0; k.starTime = 0; k.rocketTime = 0; k.ghostTime = 0; k.shield = 0; k.spinTime = 0; k.slipTime = 0; };
  { // lanes pay a boost
    const { r } = onEvent('blossom', 'lanternFest');
    const ln = r.evs.cur.live[0], k = r.karts[2];
    free(k); k.boostTime = 0; k._padCool = 0;
    k.placeAt(ln.s + 2, ln.d);
    k.vel.set(Math.sin(k.yaw) * 20, 0, Math.cos(k.yaw) * 20);
    r._checkPads(k);
    out.lane = { boost: k.boostTime, lanes: r.evs.cur.live.length };
  }
  { // syrup: sticky mud, and a candy spark wipes the puddles round it
    const { r } = onEvent('candy', 'syrupShower', 9);
    const c = r.evs.cur.rocks.find((q) => q.st === 2), k = r.karts[3];
    free(k);
    k.placeAt(c.s, c.d);
    k.step(1 / 60, false);
    out.syrup = { mud: k.patch === PATCHES.mud, puddles: r.evs.cur.rocks.filter((q) => q.st === 2).length };
    const sp = r.evs.cur.sparks.find((q) => !q.got && q.from < 9);
    if (sp) {
      k.placeAt(sp.s, sp.d);
      r.update(1 / 60);
      out.syrup.after = r.evs.cur.rocks.filter((q) => q.st === 2).length;
      out.syrup.got = sp.got;
    }
  }
  { // twister: a hop-spin, never a stall
    const { r } = onEvent('downs', 'twisterCrossing', 6.5);
    const sp = r.evs.cur.spots[0], k = r.karts[4];
    free(k);
    const q = r.evs.hazards[0];
    const pr = r.track.project(q.pos.x, q.pos.z, -1, {});
    k.placeAt(pr.s, Math.max(-pr.hw + 1, Math.min(pr.hw - 1, pr.d)));
    k.vel.set(Math.sin(k.yaw) * 22, 0, Math.cos(k.yaw) * 22);
    r.update(1 / 60);
    let minS = 99;
    for (let i = 0; i < 90; i++) { r.update(1 / 60); minS = Math.min(minS, k.speed); }
    out.twister = { hit: k._evHit > 0, minS, spin: k.spinDur };
  }
  { // black ice and glass: grip drops on the section
    const { r } = onEvent('glacier', 'iceQuake', 1);
    const c = r.evs.cur.cracks[0], k = r.karts[2];
    k.placeAt(c.s + 3, 0); k.vel.set(Math.sin(k.yaw) * 20, 0, Math.cos(k.yaw) * 20); k.step(1 / 60, false);
    out.ice = { on: k.patch === PATCHES.ice };
    const g = onEvent('obsidian', 'glassCrack', 2.6);
    const p = g.r.evs.cur.panels[0], k2 = g.r.karts[2];
    k2.placeAt(p.s + 3, p.side * p.hw / 2); k2.vel.set(Math.sin(k2.yaw) * 20, 0, Math.cos(k2.yaw) * 20); k2.step(1 / 60, false);
    out.glass = { st: p.st, on: k2.patch === PATCHES.ice };
  }
  { // factory: the belt pushes along the road, forwards then backwards
    const { r } = onEvent('gear', 'factoryAlarm', 1.5);
    const b = r.evs.cur.belts[0], k = r.karts[2];
    free(k);
    const speed = () => { k.placeAt(b.s + 4, 0); k.vel.set(Math.sin(k.yaw) * 10, 0, Math.cos(k.yaw) * 10); for (let i = 0; i < 15; i++) { r.evs.update(1 / 60); k.step(1 / 60, false); } return k.fwdSpeed ?? k.speed; };
    out.belt = { forward: speed() };
    window.evRun(r, r.evs.cur.at + 6.5);
    out.belt.back = speed();
    out.belt.dir = r.evs.laneDir;
  }
  { // meteor craters: a small hop, no spin
    const { r } = onEvent('moon', 'meteorShower', 8);
    const c = r.evs.cur.rocks.find((q) => q.st === 2), k = r.karts[2];
    free(k);
    k.placeAt(c.s, c.d);
    k.vel.set(Math.sin(k.yaw) * 20, 0, Math.cos(k.yaw) * 20);
    r.update(1 / 60);
    out.crater = { vy: k.vy, spin: k.spinTime, craters: r.evs.cur.rocks.filter((q) => q.st === 2).length };
  }
  { // battle: an event shove slows and hops a kart but leaves its balloons alone
    const f = window.evStart('barnyard', 5, 'wild');
    const k = f.karts[3], b0 = f.karts.map((x) => x.balloons).join();
    free(k);
    k.vel.set(0, 0, 20);
    const ok1 = f.evs.hurt(k, 'spin');
    out.battle = { ok: ok1, v: Math.hypot(k.vel.x, k.vel.z), same: f.karts.map((x) => x.balloons).join() === b0 };
  }
  return out;
});
console.log('  effects', JSON.stringify(eff));
ok(eff.lane.boost > 0.5, `a Lantern Festival lane boosts a kart (${eff.lane.boost.toFixed(2)} s, ${eff.lane.lanes} lanes)`);
ok(eff.syrup.mud && eff.syrup.puddles > 0 && (eff.syrup.got ? eff.syrup.after < eff.syrup.puddles : true), `syrup puddles are sticky mud and a candy spark wipes them (${JSON.stringify(eff.syrup)})`);
ok(eff.twister.hit && eff.twister.minS > 3, `a twister hit is a hop-spin, never a stall (${JSON.stringify(eff.twister)})`);
ok(eff.ice.on && eff.glass.st === 'crack' && eff.glass.on, `ice quake and glass crack sections drop the grip (${JSON.stringify([eff.ice, eff.glass])})`);
ok(eff.belt.forward > 10.5 && eff.belt.back < eff.belt.forward - 2, `conveyors push forwards then backwards (${eff.belt.forward.toFixed(1)} then ${eff.belt.back.toFixed(1)} m/s from 10, direction ${eff.belt.dir})`);
ok(eff.crater.vy > 2 && eff.crater.spin === 0 && eff.crater.craters > 0, `a crater is a small hop, no spin (${JSON.stringify(eff.crater)})`);
ok(eff.battle.ok && eff.battle.v < 14 && eff.battle.same, `in a battle an event shove slows a kart and leaves the balloons (${JSON.stringify(eff.battle)})`);

console.log('errors', errors);
await b.close();
