import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 200 } });
p.on('pageerror', e => console.log('[pageerror]', e.message, e.stack?.slice(0, 400)));
await p.goto('http://localhost:8000/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 60000 });
// `node shortcuts.mjs ai [tracks] [difficulties] [races]`: full races of
// computer racers, counting how often they take each shortcut and how long
// the stretch takes through the cut and along the road.
if (process.argv[2] === 'ai') {
  const tracks = (process.argv[3] || 'dunes,frost').split(',');
  const diffs = (process.argv[4] || 'normal,hard').split(',');
  const races = +(process.argv[5] || 2);
  for (const tid of tracks) for (const rev of [false, true]) for (const diff of diffs) {
    const r = await p.evaluate(async ({ tid, rev, diff, races }) => {
      const a = window.zoomies;
      const { AIDriver } = await import('./src/ai.js');
      const st = {}, times = [];
      for (let n = 0; n < races; n++) {
        a.startRace({ mode: 'quick', trackId: tid, reverse: rev, player: 'mochi', speedClass: 'zoom', difficulty: diff });
        a.paused = true;
        const race = a.race, tr = race.track, L = tr.length;
        race.skipIntro = true;
        race.player.ai = new AIDriver(race.player, race, 0.95, race.diff);
        for (const sc of tr.shortcuts) st[sc.name] = st[sc.name] || { pass: 0, plan: 0, took: 0, cut: [], road: [] };
        const plan = new Map(), seg = new Map(), was = new Map();
        for (let f = 0; f < 60 * 400 && !race.results; f++) {
          race.update(1 / 60);
          for (const k of race.karts) {
            if (!k.ai) continue;
            const ms = tr.mainS(k);
            for (const sc of tr.shortcuts) {
              const key = k.index * 64 + sc.id, s = st[sc.name], pv = k.ai.plan[sc.id];
              if (plan.get(key) === undefined && pv !== undefined) { s.pass++; if (pv) s.plan++; }
              plan.set(key, pv);
              // The stretch from 60 m before the cut to 30 m after it rejoins.
              const a0 = sc.fromS - 60, span = sc.toS + 30 - a0, u = (ms - a0 + L * 2) % L;
              let g = seg.get(key);
              if (!g && u < 15 && k.respawnT <= 0) seg.set(key, (g = { t0: race.raceTime, cut: false }));
              if (!g) continue;
              if (k.path === sc) g.cut = true;
              if (u >= span && u < span + 40) { (g.cut ? s.cut : s.road).push(race.raceTime - g.t0); seg.delete(key); }
              else if (race.raceTime - g.t0 > 60 || k.respawnT > 0) seg.delete(key);
            }
            const prev = was.get(k);
            if (prev === tr && k.path !== tr) st[k.path.name].took++;
            was.set(k, k.path);
          }
        }
        if (race.results) for (const row of race.results) if (row.finished) times.push(row.time);
      }
      const avg = (v) => (v.length ? (v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) + 's' : '-');
      return { times: avg(times), rows: Object.entries(st).map(([nm, s]) => `${nm}: taken ${s.took} of ${s.pass} passes (planned ${s.plan}); stretch ${avg(s.cut)} via the cut (${s.cut.length}), ${avg(s.road)} via the road (${s.road.length})`) };
    }, { tid, rev, diff, races });
    console.log(`${tid}${rev ? '-r' : ''} ${diff}: average finish ${r.times}\n  ${r.rows.join('\n  ')}`);
  }
  await b.close();
  process.exit(0);
}
const only = process.argv[2] || '';
const onlySc = process.argv[3] || '';
const onlyRev = process.argv[4] || '';
const res = await p.evaluate(async ([only, onlySc, onlyRev]) => {
  const { TRACKS } = await import('./src/tracks.js');
  const a = window.zoomies;
  const out = [];
  for (const def of TRACKS) {
    if (only && def.id !== only) continue;
    for (const rev of [false, true]) {
      if (onlyRev && String(rev) !== onlyRev) continue;
      a.startRace({ mode: 'quick', trackId: def.id, reverse: rev, player: 'mochi', speedClass: 'zoom' });
      a.paused = true;
      const r = a.race; r.skipIntro = true; const tr = r.track;
      for (let i = 0; i < 60 * 6.5; i++) r.update(1 / 60);
      for (const o of r.karts) if (o !== r.player) { o.pos.set(9999, 0, 9999); o.ai = null; o.remote = true; }
      const k = r.player;
      const inp = { steer: 0, throttle: 1, drift: false, brake: false, item: false };
      a.input.read = () => ({ ...inp });
      const fr = {};
      for (const sc of tr.shortcuts) {
        if (onlySc && sc.name !== onlySc) continue;
        const log = [];
        const s0 = (sc.fromS - 90 + tr.length) % tr.length;
        k.path = tr; k.seg = -1; k.placeAt(s0, 0); k.respawnT = 0; k.stuck = 0; k.progT = 0; k.boostTime = 0;
        tr.frame(s0, fr); k.yaw = Math.atan2(fr.tx, fr.tz); k.vel.set(Math.sin(k.yaw) * 24, 0, Math.cos(k.yaw) * 24);
        let maxS = -1, fell = 0, done = false;
        for (let f = 0; f < 60 * 25 && !done; f++) {
          r.state = 'race';
          // Pursue a point on the branch: before entering, 25 m into it; on it, 14 m ahead.
          let tx, tz;
          if (k.path === sc) {
            sc.frame(Math.min(sc.length - 1, k.trk.s + 14), fr);
            tx = fr.x; tz = fr.z;
          } else {
            const dist = (sc.fromS - k.trk.s + tr.length * 1.5) % tr.length - tr.length / 2;
            if (maxS < 0 && dist > 45) { tr.frame(k.trk.s + 14, fr); tx = fr.x + fr.rx * sc.side * Math.min(fr.hw - 2, 6); tz = fr.z + fr.rz * sc.side * Math.min(fr.hw - 2, 6); }
            // Aim past where the branch leaves the road (lead-in mouths run inside it for a while).
            else if (maxS < 0) { sc.frame(Math.min(Math.max(25, sc.entryEnd * sc.ds + 8), sc.length - 1), fr); tx = fr.x; tz = fr.z; }
            else { tr.frame(k.trk.s + 14, fr); tx = fr.x; tz = fr.z; }
          }
          let diff = Math.atan2(tx - k.pos.x, tz - k.pos.z) - k.yaw;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          inp.steer = Math.max(-1, Math.min(1, -diff * 2.4));
          r.update(1 / 60);
          if (onlySc && f % 4 === 0) log.push(`f=${f} ${k.path === sc ? 'SC' : 'main'} s=${k.trk.s.toFixed(1)} d=${k.trk.d.toFixed(1)}/${k.trk.wd.toFixed(1)} y=${k.pos.y.toFixed(1)}/${k.trk.y.toFixed(1)} gr=${k.grounded} spd=${k.speed.toFixed(1)} steer=${inp.steer.toFixed(2)} resp=${k.respawnT.toFixed(1)} gap=${tr.gap[sc.side > 0 ? 1 : 0][k.trk.idx]}`);
          if (k.path === sc) maxS = Math.max(maxS, k.trk.s);
          if (k.respawnT > 1.0 && fell === 0) fell = maxS;
          if (maxS > Math.min(sc.length - 20, sc.exitStart * sc.ds - 4) && k.path !== sc && k.respawnT <= 0) done = true;
          if (maxS < 0 && ((k.trk.s - sc.fromS + tr.length * 1.5) % tr.length - tr.length / 2) > 60 && k.path === tr) break;
        }
        const flag = sc.ramps.some((q) => q.glide) ? 'glide' : sc.voids.length ? 'jump' : '';
        if (onlySc) out.push(...log.slice(0, 150));
        out.push(`${def.id}${rev ? '-r' : ''} ${sc.name}${flag ? ' [' + flag + ']' : ''}: ${done ? 'completed' : maxS < 0 ? 'COULD NOT ENTER' : `STOPPED at ${maxS.toFixed(0)}/${sc.length.toFixed(0)}`}${fell ? ` (fell once at ${fell.toFixed(0)})` : ''}`);
      }
    }
  }
  return out;
}, [only, onlySc, onlyRev]);
console.log(res.join('\n'));
// Dune Surf must not hold a hairpin in either direction (the reversed cut was boost-only with a 7 m corner).
if (!only || only === 'dunes') {
  const bad = await p.evaluate(() => {
    const a = window.zoomies, out = [];
    for (const rev of [false, true]) {
      a.startRace({ mode: 'quick', trackId: 'dunes', reverse: rev, player: 'mochi', speedClass: 'zoom' });
      a.paused = true;
      const sc = a.race.track.shortcuts.find((s) => s.name === 'Dune Surf');
      let mn = 1e9; for (let i = 0; i < sc.count; i++) mn = Math.min(mn, 1 / Math.max(1e-4, Math.abs(sc.curv[i])));
      if (mn < 12) out.push(`${rev ? 'reverse' : 'forward'} ${mn.toFixed(1)} m`);
    }
    return out;
  });
  console.log(bad.length ? `FAIL Dune Surf corner under 12 m: ${bad.join(', ')}\nerrors ${bad.length}` : 'ok   Dune Surf corners are at least 12 m in both directions');
}
await b.close();
