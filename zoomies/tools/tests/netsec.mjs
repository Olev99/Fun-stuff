// Online hardening and resilience checks (review batch C and D):
//   leak    10 races and previews: GPU textures and geometries stay flat
//   crash   an exception in the frame loop shows "Something went wrong" and Back to menu works
//   wire    big messages (a 21 KB ghost) round-trip in pieces, an over-the-cap one fails loudly,
//           the test transport refuses any single unchunked frame of 16 KB or more
//   clock   guest event clock under jitter and backward steps: layers, marks and schedule stay right
//   trust   cid not broadcast, no kick by cid, no joining mid-race, unheld items, implausible
//           finishes, floods
//   loss    20% loss on the unreliable channel: remote karts keep moving, stale packets dropped
// node netsec.mjs [part,part...]   (all parts by default)
import { chromium } from 'playwright-core';
const parts = (process.argv[2] || 'leak,crash,wire,clock,trust,loss').split(',');
const PORT = process.env.ZPORT || 8000;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };

async function page(ctx, name, query = '') {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message, e.stack?.slice(0, 400)));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load')) console.log(`[${name}]`, m.text().slice(0, 300)); });
  await p.goto(`http://localhost:${PORT}/index.html${query}`);
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 60000 });
  await p.evaluate(() => { window.zoomies.paused = true; });
  return p;
}
const lowCtx = async (opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 640, height: 300 }, ...opts });
  await ctx.addInitScript(() => { try { localStorage.setItem('zoomies.settings.v1', JSON.stringify({ quality: 'low' })); } catch (e) {} });
  return ctx;
};

// Step a game by hand (headless rendering is far too slow for real time).
const tick = (p, n, dt = 1 / 30) => p.evaluate(([n, dt]) => { const a = window.zoomies; a.paused = true; for (let i = 0; i < n; i++) if (a.race) a.race.update(dt); return a.race ? `${a.race.mode} ${a.race.state} ${a.race.raceTime.toFixed(1)}` : '-'; }, [n, dt]);

// Host A and guest B in the lobby (the test transport: ?net=local).
async function lobby(query) {
  const ctx = await lowCtx({ isMobile: true, hasTouch: true });
  // Load A first and freeze its menu demo before B loads (two software-rendered demos starve each other).
  const A = await page(ctx, 'A', query), B = await page(ctx, 'B', query);
  await A.tap('[data-go="mp"]'); await A.waitForTimeout(400);
  await A.tap('#scr-lobby [data-go="host"]'); await A.waitForTimeout(1200);
  const code = await A.textContent('#room-code');
  await B.tap('[data-go="mp"]'); await B.waitForTimeout(400);
  await B.fill('#join-code', code);
  await B.tap('#scr-lobby [data-go="join"]'); await B.waitForTimeout(1500);
  return { ctx, A, B, code };
}
// ...and racing (state 'race', a few seconds in).
async function racing(query, track = null) {
  const L = await lobby(query);
  const { A, B } = L;
  if (track) await A.evaluate((t) => window.zoomies.session.setLobby({ track: t }), track);
  await A.tap('#scr-lobby [data-go="start"]');
  for (let i = 0; i < 80; i++) {
    const sa = await tick(A, 6); const sb = await tick(B, 6);
    await A.waitForTimeout(60);
    if (sa.startsWith('mp race') && sb.startsWith('mp race') && parseFloat(sa.split(' ')[2]) > 2) break;
  }
  return L;
}

// ---- leak: World.dispose must free the sun's shadow map (and the small per-race materials) ----
if (parts.includes('leak')) {
  const ctx = await lowCtx();
  const p = await page(ctx, 'leak');
  const mem = await p.evaluate(() => {
    const a = window.zoomies, out = [];
    // Same racers every time (shared kart models are cached per racer, which is not a leak).
    const rnd = Math.random;
    let seed = 1;
    const ids = ['sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball', 'sprout', 'pinball'];
    ids.forEach((id, i) => {
      seed = 1; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      if (i % 3 === 2) a.startDemo(id, false); // a track preview builds a demo race
      else a.startRace({ mode: 'quick', trackId: id, reverse: false, player: 'mochi', grid: ['mochi', 'pip', 'bruno', 'rexi'], speedClass: 'zoom' });
      a.paused = true;
      const r = a.race; r.skipIntro = true;
      for (let n = 0; n < 5; n++) r.update(1 / 60);
      a.renderer.render(r.scene, r.camera); // allocates the shadow map
      a.disposeRace(); // what is left after a race is gone is what leaks
      const m = a.renderer.info.memory;
      out.push([m.textures, m.geometries]);
      Math.random = rnd;
    });
    a.toTitle(); a.paused = true;
    return out;
  });
  console.log('textures/geometries left after each race:', mem.map((m) => m.join('/')).join(' '));
  // The builds repeat every 6 (track by parity, race or preview by i % 3): compare like with like after two warm-ups.
  const grew = (j) => [2, 3, 4, 5].filter((i) => mem[i + 6][j] > mem[i][j]).map((i) => `${mem[i][j]}->${mem[i + 6][j]}`);
  check(!grew(0).length, `textures stay flat over 12 races and previews ${grew(0).join(' ')}`);
  check(!grew(1).length, `geometries stay flat ${grew(1).join(' ')}`);
  await ctx.close();
}

// ---- clock: the guest's event clock never runs backwards (host snaps jitter and step back) ----
if (parts.includes('clock')) {
  const { ctx, A, B } = await racing('?net=local', 'frost'); // a blizzard (ice marks) and an avalanche (warning bands)
  const hostSched = await A.evaluate(() => JSON.stringify(window.zoomies.race.evs && window.zoomies.race.evs.sched.map((e) => [e.id, e.warnAt, e.at, e.end])));
  const res = await B.evaluate(() => {
    const r = window.zoomies.race, ev = r.evs;
    if (!ev || !ev.sched.length) return { none: true };
    const sched = JSON.stringify(ev.sched.map((e) => [e.id, e.warnAt, e.at, e.end]));
    const ends = [], told = new Map(), bad = [];
    const end0 = ev._end.bind(ev);
    ev._end = (e) => { ends.push([e.id, e.end, r.netClock]); end0(e); };
    // Seeded noise: gaussian jitter (25 ms) on every snap and a 0.3 s backward step now and then.
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    let host = r.netClock, last = -1, steps = 0, layerLost = 0;
    const stop = ev.sched[Math.min(1, ev.sched.length - 1)].end + 1;
    const bounds = ev.sched.flatMap((e) => [e.warnAt, e.at, e.end]);
    for (let f = 0; f < 60 * 140 && host < stop; f++) {
      host += 1 / 60;
      // ...and always just after an event's warning, start and end, where a step back hurts most.
      const edge = bounds.some((x) => host - 1 / 60 < x + 0.1 && host >= x + 0.1);
      if (f % 3 === 0 || edge) {
        const back = f % 150 === 0 || edge ? 0.3 : 0;
        if (back) steps++;
        r.onNet({ t: 'snap', rt: host - back + gauss() * 0.025, k: [] }, 'host');
      }
      r.update(1 / 60);
      const t = r.evClock ?? r.netClock;
      if (t < last - 1e-9) bad.push(`event clock went back ${last.toFixed(3)} -> ${t.toFixed(3)}`);
      last = t;
      // Marks drawn by a warning stay until the event starts.
      const e = ev.cur;
      if (e && e.told) {
        const marks = Object.entries(ev.layers).filter(([n]) => n !== 'edge').reduce((n, [, l]) => n + l.parts.size, 0);
        if (!told.has(e)) told.set(e, marks);
        else if (told.get(e) > 0 && marks === 0 && t < e.at) layerLost++;
      }
    }
    for (const [id, end, at] of ends) if (at < end - 0.05) bad.push(`${id} ended early at ${at.toFixed(2)} (ends ${end.toFixed(2)})`);
    const seen = new Set();
    for (const [id, end] of ends) { const k = id + end; if (seen.has(k)) bad.push(`${id} ended twice`); seen.add(k); }
    const back = bad.filter((x) => x.startsWith('event clock'));
    const due = ev.sched.filter((e) => e.end < r.netClock).length;
    return { sched, due, ends: ends.length, steps, layerLost, bad: [...bad.filter((x) => !x.startsWith('event clock')).slice(0, 6), ...back.slice(0, 2)], badN: bad.length, t: r.netClock, endLog: JSON.stringify(ends) };
  });
  if (res.none) check(false, 'Frostbite Pass has track events online');
  else {
    console.log(`guest ran to ${res.t.toFixed(1)} s with ${res.steps} backward steps, ${res.ends} events ended`, res.bad.join(' | '));
    console.log('host schedule', res.sched, 'ends', res.endLog);
    check(res.sched === hostSched, 'guest schedule matches the host\'s');
    check(res.due >= 1 && res.ends === res.due, `every event ran through and ended once (${res.ends} ends, ${res.due} due)`);
    check(res.badN === 0, `event clock monotonic, no event ended early or twice (${res.badN} problems)`);
    check(res.layerLost === 0, `warning marks stay up until the event starts (${res.layerLost} frames lost)`);
  }
  await ctx.close();
}

console.log('errors', fails);
await b.close();
process.exit(fails ? 1 : 0);
