import { EVENTS } from './events.js';
import { trackById } from './tracks.js';

// Small helpers for showing track events in menus (cards, chips). The events
// themselves live in events.js; career.js decides which ones a story event has.

export const EV_LABEL = { off: 'Off', normal: 'Normal', wild: 'Wild' };

// Known event definitions of a track (or of several), in track order, without repeats.
export function evDefs(trackIds, only = null) {
  const ids = [].concat(trackIds).flatMap((t) => trackById(t).events || []);
  return [...new Set(ids)].filter((id) => EVENTS[id] && (!only || only.includes(id))).map((id) => ({ id, ...EVENTS[id] }));
}

// '🌨️ Blizzard, Avalanche' (the first icon, then the names).
export const evNames = (defs) => (defs.length ? `${defs[0].icon} ${defs.map((d) => d.name).join(', ')}` : '');

// The chip on a track card: '⛈ Events: Normal · 🌨️ Blizzard, Avalanche'. Empty when the track has none.
export function evChip(trackIds, mode) {
  const defs = evDefs(trackIds);
  if (!defs.length) return '';
  return mode === 'off' ? '⛈ Events: Off' : `⛈ Events: ${EV_LABEL[mode] || 'Normal'} · ${evNames(defs)}`;
}
