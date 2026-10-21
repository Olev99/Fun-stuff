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
  const { schedule, estRaceTime, EV_FIRST, EV_GAP, EV_LAST, EVENTS } = await import('./src/events.js');
  const { TRACKS } = await import('./src/tracks.js');
  const { Track } = await import('./src/track.js');
  const { SPEED_CLASSES } = await import('./src/race.js');
  const bad = [];
  const count = { normal: 0, wild: 0 };
  let n = 0;
  for (const def of TRACKS.filter((t) => t.events)) for (const rev of [false, true]) {
    const tr = new Track(def, rev);
    for (const cls of Object.values(SPEED_CLASSES)) {
      const T = estRaceTime(tr.length, def.laps || 3, cls.top);
      for (const mode of ['normal', 'wild']) for (let seed = 1; seed < 160; seed++) {
        const s = schedule(seed * 7919, mode, def.events, T);
        n++;
        count[mode] += s.length;
        if (JSON.stringify(s) !== JSON.stringify(schedule(seed * 7919, mode, def.events, T))) bad.push(`${def.id} not deterministic`);
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
    a.startRace({ mode: 'quick', trackId: tid, reverse: false, player: 'mochi', speedClass: 'zoom', evMode: mode, evSeed: seed, ...extra });
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
  for (const [tid, seed] of [['frost', 1234], ['magma', 777], ['dunes', 99], ['coral', 4321], ['tidal', 55]]) {
    const r = window.evStart(tid, seed, 'wild');
    const sched = r.evs.sched.map((e) => `${e.id}@${e.warnAt}/${e.at}/${e.end}`).join(',');
    const seen = [];
    for (const e of r.evs.sched) {
      window.evRun(r, e.at + 2.5);
      const c = r.evs.cur;
      const pts = (c.rocks || c.ice || c.spots || c.lanes || c.zones || []).map((q) => `${q.x.toFixed(2)},${q.z.toFixed(2)}`).join(' ');
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
const SHOTS = [['frost', 'blizzard'], ['frost', 'avalanche'], ['magma', 'lavaRain'], ['magma', 'eruption'], ['dunes', 'sandstorm'], ['coral', 'tide'], ['tidal', 'tide']];
for (const [tid, id] of SHOTS) {
  for (const [phase, at] of [['warn', -2], ['peak', 0.45], ['end', 1]]) {
    const info = await A.evaluate(({ tid, id, phase, at }) => {
      const a = window.zoomies;
      const { r, e } = window.evFind(tid, id);
      const { EVENTS } = window.evMod;
      const def = EVENTS[id];
      const t = phase === 'warn' ? e.at + at : phase === 'peak' ? e.at + def.dur * at : e.end + at;
      // Drive to a little before the moment, then put the player just before the action.
      window.evRun(r, t - 1.2);
      const c = r.evs.cur;
      const spot = c && (c.spots || c.lanes || c.zones || c.ice || (c.rocks && c.rocks.filter((q) => q.st === 1 || q.st === 2)));
      if (spot && spot.length) r.player.placeAt((spot[0].s - 52 + r.track.length) % r.track.length, 0);
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
    }, { tid, id, phase, at });
    await A.waitForTimeout(2600); // let the HUD's own animations (GO!, toasts) settle
    await A.evaluate(() => window.evShot());
    await A.screenshot({ path: `ev/${tid}-${id}-${phase}.png` });
    console.log(`shot ev/${tid}-${id}-${phase}.png`, JSON.stringify(info));
  }
}
console.log('errors', errors);
await b.close();
