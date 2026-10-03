import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('console', m => { if (['error'].includes(m.type()) && !m.text().includes('Failed to load resource')) console.log('[console]', m.text().slice(0, 400)); });
p.on('pageerror', e => console.log('[pageerror]', e.message, e.stack?.slice(0, 600)));
await p.goto('http://localhost:8000/index.html');
await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
const trackIds = (process.argv[2] || 'sprout,coral,dunes,frost,candy,neon,magma,cloud').split(',');
const diffArg = process.argv[3] || 'normal';
for (const tid of trackIds) for (const rev of [false, true]) {
  const res = await p.evaluate(async ({ tid, rev, diff }) => {
    const app = window.zoomies;
    app.paused = true; // stop the rAF loop from advancing things
    app.startRace({ mode: 'quick', trackId: tid, reverse: rev, player: 'mochi', speedClass: 'zoom', difficulty: diff });
    app.paused = true;
    const race = app.race;
    const { AIDriver } = await import('./src/ai.js');
    race.player.ai = new AIDriver(race.player, race, 0.95, race.diff);
    const t0 = performance.now();
    let steps = 0; let sc = 0, falls = 0; const log = []; let maxAir = 0; let wallHits = 0; let items = 0; let hits = 0;
    const origHit = race.player.hit.bind(race.player);
    let lastLap = -1;
    while (steps < 60 * 400 && !race.results) {
      race.update(1 / 60); steps++;
      for (const k of race.karts) { if (!k.grounded) maxAir = Math.max(maxAir, k.airTime); if (k.events.includes('wall')) wallHits++; if (k.events.includes('useItem')) items++; if (k.events.includes('hit')) hits++; if (k.events.includes('shortcut')) sc++; if (k.events.includes('fall')) falls++; }
      if (race.player.laps !== lastLap) { lastLap = race.player.laps; log.push(`lap${lastLap}@${race.raceTime.toFixed(1)}`); }
    }
    const ms = performance.now() - t0;
    const rows = race.results ? race.results.map(r => `${r.place}.${r.ch.id}${r.isPlayer ? '*' : ''} ${r.time.toFixed(1)}${r.finished ? '' : '~'}`) : null;
    const stuck = race.karts.filter(k => !k.finished).map(k => `${k.ch.id}: total=${k.total.toFixed(0)} d=${k.trk.d.toFixed(1)} spd=${k.speed.toFixed(1)}`);
    return { sc, falls, tid, rev, steps, msPerStep: (ms / steps).toFixed(3), state: race.state, raceTime: race.raceTime.toFixed(1), rows, maxAir: maxAir.toFixed(2), wallHits, items, hits, log: log.join(' '), unfinished: stuck, lapTimes: race.player.lapTimes.map(t => t.toFixed(1)) };
  }, { tid, rev, diff: diffArg });
  console.log(JSON.stringify(res, null, 1));
}
await b.close();
