// Opt-in suite: `node run.mjs balance`. Runs a small fixed, seeded sample of
// AI-only races (see balance-lib.mjs) and checks the balance metrics stay in
// their bands. The full report is `node zoomies/tools/balance.mjs`. With only
// 16 races the bands are wide: they catch a broken table or rubber band, not a
// few percent of drift.
import { runRaces, summarize, share, oddsPct, oddsClasses, ATTACK, CATCHUP } from './balance-lib.mjs';

const recs = await runRaces({ tracks: ['sprout', 'coral', 'dunes', 'candy'], diffs: ['normal', 'hard'], n: 2, seed: 1 });
let errors = 0;
const check = (name, value, ok, shown = value) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${typeof shown === 'number' ? shown.toFixed(2) : shown}`);
  if (!ok) errors++;
};
const sum = (o, list) => list.reduce((s, k) => s + (o[k] || 0), 0);
const within = (v, lo, hi) => v >= lo && v <= hi;

for (const diff of ['normal', 'hard']) {
  const m = summarize(recs.filter((r) => r.diff === diff));
  check(`${diff}: races finished`, m.finished, m.finished === m.races, `${m.finished}/${m.races}`);
  check(`${diff}: gap 1st to last, % of race time (<14)`, m.gapLastPct, m.gapLastPct < 14);
  check(`${diff}: last at end of lap 1 gains 0.5 to 3.5 places`, m.lastGain, within(m.lastGain, 0.5, 3.5));
  check(`${diff}: overtakes per race (>6)`, m.overtakes, m.overtakes > 6);
  check(`${diff}: item hits per race (3 to 25)`, m.hits, within(m.hits, 3, 25));
  check(`${diff}: front starter wins at most half the races`, m.poleWinPct, m.poleWinPct <= 50);
}
const all = summarize(recs);
check('last at end of lap 1 wins at most 25% of races', all.lastWinPct, all.lastWinPct <= 25);
const top = share(all)[0];
check(`no item causes over 30% of position swings (top: ${top.item})`, top.pct, top.pct <= 30);

// The odds tables: smooth from place to place, defensive at the front, catch-up at the back.
const odds = oddsPct(recs.odds), cls = oddsClasses(recs.odds);
let jump = 0, jumpAt = '';
for (let p = 1; p < odds.length; p++) for (const k of new Set([...Object.keys(odds[p - 1]), ...Object.keys(odds[p])])) {
  const d = Math.abs((odds[p][k] || 0) - (odds[p - 1][k] || 0));
  if (d > jump) { jump = d; jumpAt = `${k} ${p}->${p + 1}`; }
}
check(`odds change by under 6 points between neighbouring places (worst: ${jumpAt})`, jump, jump < 6);
check('leader: at least 65% defence or neutral items', 100 - cls[0].attack - cls[0].catchup, 100 - cls[0].attack - cls[0].catchup >= 65);
check('last place: a mix of catch-up (>=35%) and attack (>=20%)', cls[7].catchup, cls[7].catchup >= 35 && cls[7].attack >= 20, `catch-up ${cls[7].catchup.toFixed(0)}%, attack ${cls[7].attack.toFixed(0)}%`);
check('back of the field gets more catch-up than the front', cls[7].catchup - cls[0].catchup, cls[7].catchup > cls[3].catchup && cls[3].catchup >= cls[0].catchup);
check('Zap Cloud is not in the leader or mid-front odds', odds[0].storm || 0, !(odds[0].storm || 0) && !(odds[1].storm || 0));
console.log(`errors ${errors}`);
process.exit(errors ? 1 : 0);
