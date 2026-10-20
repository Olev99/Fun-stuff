// Balance report for races: runs AI-only 8-kart races headlessly and prints
// how close, how swingy and how item-driven they are.
//
//   node zoomies/tools/balance.mjs [--tracks a,b,c] [--diffs normal,hard] [--n 3] [--seed 1]
//   node zoomies/tools/balance.mjs > zoomies/tools/balance-baseline.txt
//
// Needs `npm install` in tools/tests once. Starts its own static server unless
// run.mjs already serves zoomies/ on port 8000. Races are seeded, so the same
// arguments print the same numbers.
import { runRaces, summarize, share, classShare, oddsPct, oddsClasses, DEFAULT_TRACKS } from './tests/balance-lib.mjs';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const tracks = arg('tracks', DEFAULT_TRACKS.join(',')).split(',');
const diffs = arg('diffs', 'normal,hard').split(',');
const n = +arg('n', 3), seed = +arg('seed', 1);

// --tuned: the computer-driven player runs a fully fitted ride (classic: 3 sockets; bolt: 5) instead of stock stats.
const KITS = { boltstock: { body: 'bolt', parts: [] }, classic: { body: 'classic', parts: ['engine3', 'turbo3', 'tyres3'] }, bolt: { body: 'bolt', parts: ['engine3', 'turbo3', 'tyres3', 'armor3', 'driftSpring'] } };
const kit = KITS[arg('tuned', '')] || null;
const recs = await runRaces({ tracks, diffs, n, seed, kit, log: (s) => console.error(s) });
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
console.log(`Balance report: ${tracks.length} tracks x ${diffs.join('+')} x ${n} races, seed ${seed}, 8 karts, mixed racers, the player kart is computer-driven too.`);
console.log(`tracks: ${tracks.join(', ')}\n`);
for (const diff of [...diffs, 'all']) {
  const rs = diff === 'all' ? recs : recs.filter((r) => r.diff === diff);
  const m = summarize(rs);
  console.log(`=== ${diff.toUpperCase()} (${m.finished}/${m.races} races finished) ===`);
  console.log(`gap 1st to last: ${f(m.gapLastS)} s = ${f(m.gapLastPct)}% of race time`);
  console.log(`gap 1st to 2nd: ${f(m.gapSecondS)} s`);
  console.log(`median leader's lead at start of last lap: ${f(m.leadLastLapS)} s`);
  console.log(`the player (${kit ? arg('tuned', '') : 'stock classic'}): average place ${f(rs.reduce((a, r) => a + r.playerPlace, 0) / rs.length, 2)}, won ${f(100 * rs.filter((r) => r.playerPlace === 1).length / rs.length, 0)}%, finish time ${f(100 * rs.reduce((a, r) => a + r.playerTime / r.fieldTime, 0) / rs.length, 1)}% of the field's median`);
  console.log(`front starter won: ${f(m.poleWinPct, 0)}%   (computer-driven player won: ${f(m.playerWinPct, 0)}%)`);
  console.log(`last at end of lap 1: gained ${f(m.lastGain, 2)} places on average, won ${f(m.lastWinPct, 0)}% of races`);
  console.log(`places changed (overtakes) per race: ${f(m.overtakes)}`);
  console.log(`item hits per race: ${f(m.hits)}   (leader hit ${f(m.hitLeaderPer, 2)} per race, last place hit ${f(m.hitLastPer, 2)} per race)`);
  const fmt = (o) => Object.entries(o).sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${f(v, 2)}`).join(', ');
  console.log(`  hits on the leader per race by item: ${fmt(m.leaderHitsBy)}`);
  console.log(`  hits on last place per race by item: ${fmt(m.lastHitsBy)}`);
  console.log(`  hits absorbed by a Bubble Shield per race: ${fmt(m.shieldPops)}`);
  console.log(`races where the winner was hit by 0 items: ${f(m.winnerNoHitPct, 0)}%`);
  const sh = share(m);
  console.log('position swing by item (places lost by victims within 4 s of a hit, places gained by users within 5 s of a boost item):');
  console.log('  ' + sh.map((x) => `${x.item} ${f(x.pct, 0)}% (${x.hits})`).join(', '));
  console.log('item class by place rolled (attack / defence-neutral / catch-up %):');
  const cs = classShare(m);
  console.log('  ' + Object.keys(cs).map((p) => `${p}: ${f(cs[p].attack, 0)}/${f(cs[p].defence, 0)}/${f(cs[p].catchup, 0)}`).join('   '));
  console.log('');
}
console.log('=== ODDS TABLES BY PLACE (8 karts), percent ===');
const op = oddsPct(recs.odds);
const items = [...new Set(op.flatMap((o) => Object.keys(o)))];
console.log('item        ' + [1, 2, 3, 4, 5, 6, 7, 8].map((p) => String(p).padStart(5)).join(''));
for (const it of items) console.log(it.padEnd(12) + op.map((o) => f(o[it] || 0, 0).padStart(5)).join(''));
const oc = oddsClasses(recs.odds);
for (const c of ['attack', 'defence', 'catchup']) console.log(c.padEnd(12) + oc.map((o) => f(o[c], 0).padStart(5)).join(''));
