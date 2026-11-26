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

// ---- wire: long messages travel in pieces; too long fails loudly ----
if (parts.includes('wire')) {
  const { ctx, A, B } = await lobby('?net=local');
  // Watch the host's incoming messages and the guest's outgoing pieces.
  await A.evaluate(() => { const s = window.zoomies.session, m0 = s._message.bind(s); window.got = []; s._message = (f, m, z) => { if (m && m.t === 'ghost') window.got.push([m.k, m.g, z]); m0(f, m, z); }; });
  const res = await B.evaluate(() => {
    const T = window.zoomies.session.transport, post = T.ch.postMessage.bind(T.ch);
    const frames = [];
    T.ch.postMessage = (m) => { if (m.kind === 'msg') frames.push([m.data.length, new TextEncoder().encode(m.data).length, m.data.isWellFormed ? m.data.isWellFormed() : true]); post(m); };
    // The ghost of a 200 s run (10 samples a second, 8 bytes each, base64), as sync.js sends it.
    const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let data = ''; for (let i = 0; i < Math.ceil((200 * 10 * 8) / 3) * 4; i++) data += b64[(i * 7919) % 64];
    const g = JSON.stringify({ time: 200.123, splits: [66.1, 133.2, 200.1], char: 'mochi', body: 'classic', paint: null, hat: null, data });
    T.send('host', { t: 'ghost', k: 'magma-r', g });
    // Emoji across a piece boundary (an odd start puts a surrogate pair on the cut).
    const e = 'x' + '\u{1F3CE}'.repeat(9000);
    T.send('host', { t: 'ghost', k: 'emoji', g: e });
    const n1 = frames.length;
    T.send('host', { t: 'ghost', k: 'huge', g: 'A'.repeat(300 * 1024) }); // over the cap
    return { size: JSON.stringify({ t: 'ghost', k: 'magma-r', g }).length, g, e, frames, n1, after: frames.length };
  });
  await A.waitForTimeout(800);
  const got = await A.evaluate(() => window.got.map(([k, g, z]) => [k, g.length, z, g]));
  const ghost = got.find((x) => x[0] === 'magma-r'), emoji = got.find((x) => x[0] === 'emoji');
  console.log(`ghost message ${res.size} characters went in ${res.n1} pieces (largest ${Math.max(...res.frames.map((f) => f[1]))} bytes)`);
  check(res.size > 16300 && ghost && ghost[3] === res.g, `a ${(res.size / 1024).toFixed(1)} KB ghost message round-trips`);
  check(emoji && emoji[3] === res.e && res.frames.every((f) => f[2]), 'emoji split across pieces arrive intact (every piece is well-formed text)');
  check(res.frames.every((f) => f[1] < 16300), 'no single piece reaches 16 KB');
  check(res.after === res.n1 && !got.some((x) => x[0] === 'huge'), 'an over-the-cap message is not sent');
  const err = await B.textContent('#lobby-error');
  check(/too big/i.test(err), `...and the player is told ("${err}")`);
  // The test transport refuses one oversized unchunked piece (so no suite can miss the real limit).
  const refused = await B.evaluate(() => { try { window.zoomies.session.transport._postFrame('host', 'x'.repeat(17000)); return 'sent'; } catch (e) { return e.message; } });
  check(/Unchunked/.test(refused), `the test transport refuses a 17 KB single piece (${refused})`);
  await ctx.close();
}

// ---- trust: what a guest (or a stranger with the room code) can and cannot do ----
if (parts.includes('trust')) {
  const { ctx, A, B } = await lobby('?net=local');
  // The lobby broadcast a guest sees carries nobody's private id.
  await B.evaluate(() => { const s = window.zoomies.session, m0 = s._message.bind(s); window.raw = []; s._message = (f, m, z) => { if (m && m.t === 'lobby') window.raw.push(JSON.stringify(m.players)); m0(f, m, z); }; });
  await A.evaluate(() => window.zoomies.session.broadcastLobby());
  await B.waitForTimeout(400);
  const raw = await B.evaluate(() => window.raw);
  check(raw.length > 0 && !raw.some((x) => x.includes('cid')), `lobby broadcast holds no cid (${raw.length ? raw[raw.length - 1].slice(0, 90) : 'none seen'})`);
  // A stranger with a made-up cid can't take a seat from anyone.
  const bId = await A.evaluate(() => window.zoomies.session.players[1].id);
  const bCid = await B.evaluate(() => window.zoomies.session.cid);
  await A.evaluate(() => window.zoomies.session._message('gStranger', { t: 'hello', cid: 'abcdefgh', char: 'pip' }, 50));
  check(await A.evaluate((id) => window.zoomies.session.players.some((p) => p.id === id), bId), 'a hello with a guessed cid kicks nobody');
  await A.evaluate(() => window.zoomies.session._drop('gStranger'));
  // Race.
  await A.tap('#scr-lobby [data-go="start"]');
  for (let i = 0; i < 80; i++) {
    const sa = await tick(A, 6); const sb = await tick(B, 6);
    await A.waitForTimeout(60);
    if (sa.startsWith('mp race') && sb.startsWith('mp race') && parseFloat(sa.split(' ')[2]) > 2) break;
  }
  const r = await A.evaluate(async ([bId, bCid]) => {
    const a = window.zoomies, s = a.session, race = a.race, it = race.items;
    const out = {};
    // Mid-race, a joiner replaying B's real cid is turned away and B keeps its seat.
    s._message('gLate', { t: 'hello', cid: bCid, char: 'pip' }, 50);
    out.lateKick = !s.players.some((p) => p.id === bId);
    out.lateIn = s.players.some((p) => p.id === 'gLate');
    // ...and cannot pop boxes or gems.
    const bi = it.boxes.findIndex((b) => b.active), gi = it.gems.findIndex((g) => g.active);
    s._message('gLate', { t: 'box', i: bi, want: true }, 30);
    if (gi >= 0) s._message('gLate', { t: 'gem', i: gi }, 30);
    out.boxSafe = bi < 0 || it.boxes[bi].active;
    out.gemSafe = gi < 0 || it.gems[gi].active;
    // B's kart can't use an item the host never gave it.
    const k = race.karts[race.peerSlot.get(bId)];
    const n0 = it.projectiles.length + it.hazards.length;
    s._message(bId, { t: 'use', it: 'bomb', aim: 0, x: k.pos.x, z: k.pos.z, yaw: k.yaw, sp: 10 }, 60);
    out.unheld = it.projectiles.length + it.hazards.length - n0;
    // A real box claim gets a grant, which it can then use once.
    const bj = it.boxes.findIndex((b) => b.active);
    s._message(bId, { t: 'box', i: bj, want: true }, 30);
    out.held = (k.netHeld || []).map((g) => `${g.it}x${g.n}`).join(',');
    const g = k.netHeld && k.netHeld[0];
    if (g) for (let i = 0; i < g.n; i++) s._message(bId, { t: 'use', it: g.it, aim: 0, x: k.pos.x, z: k.pos.z, yaw: k.yaw, sp: 10 }, 60);
    out.spent = (k.netHeld || []).length;
    s._message(bId, { t: 'box', i: bj, want: true }, 30); // the same box again: it is gone
    out.again = (k.netHeld || []).length;
    // Finishing: not before the laps, and not faster than the host's clock.
    s._message(bId, { t: 'finish', time: 1, laps: [1] }, 30);
    out.earlyFinish = k.finished;
    k.laps = race.laps;
    race.raceTime = 100; // as if 100 s in
    s._message(bId, { t: 'finish', time: 0.5, laps: [0.2, 0.2, 0.1] }, 30);
    out.finish = [k.finished, +k.finishTime.toFixed(2), +race.raceTime.toFixed(2)];
    // A flood: 1000 messages at once, only about a burst's worth get through.
    let n = 0; const ol = s.onLobby; s.onLobby = () => { n++; };
    for (let i = 0; i < 1000; i++) s._message(bId, { t: 'pick', char: 'pip' }, 30);
    s.onLobby = ol;
    out.flood = n;
    s._message(bId, { t: 'pick', char: 'bruno' }, 70000); // over the size cap
    return out;
  }, [bId, bCid]);
  console.log('trust:', JSON.stringify(r));
  check(!r.lateKick && !r.lateIn, 'a joiner mid-race replaying a cid is refused and kicks nobody');
  check(r.boxSafe && r.gemSafe, 'a joiner mid-race cannot pop boxes or gems');
  check(r.unheld === 0, 'an item that was never granted cannot be used');
  check(r.held !== '' && r.spent === 0 && r.again === 0, `a granted item (${r.held}) can be used, then it is gone; a popped box grants nothing`);
  check(!r.earlyFinish, 'a finish before the laps are done is rejected');
  check(r.finish[0] && r.finish[1] >= r.finish[2] - 3.01, `a finish faster than the host's clock gets the host's (${r.finish[1]} at ${r.finish[2]})`);
  check(r.flood > 0 && r.flood <= 130, `a flood of 1000 messages is cut to ${r.flood}`);
  await ctx.close();
}

// ---- loss: 20% of the fast messages lost, remote karts keep moving ----
if (parts.includes('loss')) {
  const { ctx, A, B } = await racing('?net=local&lag=40&loss=20');
  // Give B's kart a computer driver so it moves.
  await B.evaluate(async () => { const { AIDriver } = await import('./src/ai.js'); const r = window.zoomies.race; r.player.ai = new AIDriver(r.player, r, 0.9, r.diff); });
  const seen = { a: [], b: [] };
  for (let i = 0; i < 25; i++) {
    await tick(B, 6); await tick(A, 6);
    await A.waitForTimeout(80);
    seen.a.push(await A.evaluate(() => { const r = window.zoomies.race, k = r.karts.find((q) => q.remote); return [k.pos.x, k.pos.z, (performance.now() - (k.net ? k.net.t : 0)) / 1000]; }));
    seen.b.push(await B.evaluate(() => { const r = window.zoomies.race, k = r.karts.find((q) => q.remote && !q.human); return [k.pos.x, k.pos.z, (performance.now() - (k.net ? k.net.t : 0)) / 1000]; }));
  }
  const moved = (s) => s.slice(1).filter((p, i) => Math.hypot(p[0] - s[i][0], p[1] - s[i][1]) > 0.3).length;
  const fresh = (s) => s.filter((p) => p[2] < 1).length;
  console.log(`host sees the guest's kart move in ${moved(seen.a)}/24 steps (fresh ${fresh(seen.a)}/25); guest sees a computer kart move in ${moved(seen.b)}/24 (fresh ${fresh(seen.b)}/25)`);
  check(moved(seen.a) >= 18 && fresh(seen.a) >= 22, 'host: the guest\'s kart keeps moving under 20% loss');
  check(moved(seen.b) >= 18 && fresh(seen.b) >= 22, 'guest: the host\'s karts keep moving under 20% loss');
  // A late or repeated fast message is dropped.
  const stale = await B.evaluate(() => {
    const ib = window.zoomies.session.transport.inbox;
    const last = ib.last.get('host|snap');
    return [last > 1, ib.take('host', JSON.stringify({ t: 'snap', q: last, rt: 0, k: [] })), ib.take('host', JSON.stringify({ t: 'snap', q: 1, rt: 0, k: [] })), !!ib.take('host', JSON.stringify({ t: 'snap', q: last + 1, rt: 0, k: [] }))];
  });
  check(stale[0] && stale[1] === null && stale[2] === null && stale[3], 'stale and repeated snapshots are dropped, the next one is taken');
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
