// Medals: four time targets on every track, derived from your best Time Trial
// time (records[trackId].tt), so there is no save field of its own. The
// reference is a Hard computer racer's best Time Trial with the stock Zoom
// Classic (measure it again with tools/medal-times.mjs after a track change).
// Zoomie is faster than the reference: it needs the shortcuts and a clean lap.

export const REF = {
  sprout: 85.28,
  coral: 84.78,
  dunes: 136.23,
  frost: 124.08,
  candy: 117.68,
  neon: 153.68,
  magma: 204.8,
  cloud: 164.18,
  downs: 107.37,
  tidal: 98.97,
  glacier: 167.13,
  obsidian: 158.8,
  hollow: 109.4,
  jungle: 125.98,
  gear: 112.5,
  moon: 177.23,
  maple: 134.78,
  blossom: 78.13,
  odyssey: 130.97,
  hopper: 132.82,
};

export const MEDALS = [
  { id: 'bronze', name: 'Bronze', icon: '🥉', mult: 1.15, xp: 50 },
  { id: 'silver', name: 'Silver', icon: '🥈', mult: 1.07, xp: 100 },
  { id: 'gold', name: 'Gold', icon: '🥇', mult: 1.0, xp: 200 },
  { id: 'zoomie', name: 'Zoomie', icon: '⚡', mult: 0.94, xp: 400 },
];

// The four target times for a track, or null for a track with no reference.
export function medalTimes(trackId) {
  const ref = REF[trackId];
  return ref > 0 ? MEDALS.map((m) => +(ref * m.mult).toFixed(2)) : null;
}

// 0 none, 1 bronze, 2 silver, 3 gold, 4 zoomie.
export function medalTier(trackId, time) {
  const t = medalTimes(trackId);
  if (!t || !(time > 0)) return 0;
  let tier = 0;
  for (let i = 0; i < t.length; i++) if (time <= t[i]) tier = i + 1;
  return tier;
}

// The next medal to chase: { tier, medal, target, gap } (gap in seconds), or null.
export function nextMedal(trackId, time) {
  const t = medalTimes(trackId);
  if (!t) return null;
  const tier = medalTier(trackId, time);
  if (tier >= MEDALS.length) return null;
  const target = t[tier];
  return { tier: tier + 1, medal: MEDALS[tier], target, gap: time > 0 ? time - target : null };
}

// Medal XP for a Time Trial that improved from prev (or no time) to time:
// the bonus for the new tier only, paid once because the tier comes from the old best.
export function medalAward(trackId, prev, time) {
  const was = medalTier(trackId, prev), now = medalTier(trackId, time);
  return now > was ? { tier: now, was, medal: MEDALS[now - 1], xp: MEDALS[now - 1].xp } : null;
}

// Tier per track from the records (forward direction only).
export const trackTier = (records, trackId) => medalTier(trackId, records && records[trackId] && records[trackId].tt);

// Medal total: each tier you hold counts, so a Gold track is worth 3.
export function medalCount(records, trackIds = Object.keys(REF)) {
  return trackIds.reduce((a, id) => a + trackTier(records, id), 0);
}

export const bestTier = (records) => Object.keys(REF).reduce((a, id) => Math.max(a, trackTier(records, id)), 0);

export const medalMax = () => Object.keys(REF).length * MEDALS.length;
