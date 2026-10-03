import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 400, height: 200 } });
p.on('pageerror', e => console.log('[pageerror]', e.message, e.stack?.slice(0, 400)));
await p.goto('http://localhost:8000/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 60000 });
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
            else if (maxS < 0) { sc.frame(Math.min(25, sc.length - 1), fr); tx = fr.x; tz = fr.z; }
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
await b.close();
