import { missionView } from './missions.js';
import { MEDALS, REF, medalTimes, medalTier } from './medals.js';
import { levelOf } from './profile.js';
import { CHARACTERS } from './characters.js';
import { CHAPTERS, LEAGUE, eventUnlocked } from './career.js';
import { trackById } from './tracks.js';
import { fmtTime } from './util.js';

// The "Next up" teaser on a results screen: the goal that is closest to done.
// Every candidate gets a score from 0 to 1; the highest wins.
export function nextUp(c, records) {
  const cands = [];
  // A mission that is partly done (the last one left counts extra).
  const open = missionView(c).filter((g) => !g.done);
  for (const g of open) {
    const frac = g.prog / g.target;
    if (g.prog > 0 || open.length === 1) cands.push({ score: 0.45 + 0.5 * frac + (open.length === 1 ? 0.05 : 0), icon: g.icon, text: `Mission: ${g.text} (${g.prog}/${g.target})${open.length === 1 ? ' · last one for a free capsule!' : ''}` });
  }
  // The medal you are closest to (under 8% of the target time away).
  let best = null;
  for (const id of Object.keys(REF)) {
    const tt = records && records[id] && records[id].tt;
    if (!(tt > 0)) continue;
    const tier = medalTier(id, tt);
    if (tier >= MEDALS.length) continue;
    const target = medalTimes(id)[tier], ratio = (tt - target) / target;
    if (!best || ratio < best.ratio) best = { id, tier, target, ratio, gap: tt - target };
  }
  if (best && best.ratio < 0.08) {
    const m = MEDALS[best.tier];
    cands.push({ score: 0.95 - best.ratio * 5, icon: m.icon, text: `${m.name} medal on ${trackById(best.id).name} is ${best.gap.toFixed(2)}s away (${fmtTime(best.target)})` });
  }
  // The next level, when more than half way.
  const lv = levelOf(c.xp || 0);
  if (lv.into / lv.need >= 0.5) {
    const gets = CHARACTERS.filter((ch) => ch.lvl === lv.level + 1).map((ch) => ` · unlocks ${ch.name}`).join('');
    cands.push({ score: 0.9 * (lv.into / lv.need), icon: '⭐', text: `${(lv.need - lv.into).toLocaleString('en-US')} XP to level ${lv.level + 1}${gets}` });
  }
  // The next Career event.
  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    const ei = CHAPTERS[ci].events.findIndex((e, i) => !c.done[e.id] && eventUnlocked(c, ci, i));
    if (ei >= 0) {
      cands.push({ score: 0.3, icon: '🏁', text: `Career: ${CHAPTERS[ci].events[ei].title}` });
      break;
    }
  }
  if (c.champion) {
    for (let si = 0; si < LEAGUE.length; si++) {
      const ei = LEAGUE[si].events.findIndex((e, i) => !c.done[e.id] && eventUnlocked(c, si, i, LEAGUE));
      if (ei >= 0) { cands.push({ score: 0.28, icon: '🏛️', text: `Legends League: ${LEAGUE[si].events[ei].title}` }); break; }
    }
  }
  cands.push({ score: 0.1, icon: '📅', text: 'Try today\'s Daily Challenge' });
  return cands.sort((a, b) => b.score - a.score)[0];
}
