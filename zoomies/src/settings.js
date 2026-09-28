const KEY = 'zoomies.settings.v1';
const REC = 'zoomies.records.v1';

import { isTouch, isDesktop } from './platform.js';

export const DEFAULTS = {
  // Phones: tilt | touch. Computers: keys (keyboard or gamepad) | wheel (a phone as a wheel).
  steering: isTouch ? 'tilt' : 'keys',
  tiltSens: 0.5,
  invertTilt: false,
  quality: 'auto',
  music: true,
  sfx: true,
  showFps: false,
  speedClass: 'zoom',
  difficulty: 'normal',
  char: 'mochi',
  track: 'sprout',
  reverse: false,
  name: '', // multiplayer nickname
  tags: 'all', // name tags over karts: all | friends | off
  assist: 'off', // steering assist: off | light | strong
};

export function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch (e) {
    s = {};
  }
  const out = { ...DEFAULTS, ...s };
  // Touch steering makes no sense without a touch screen, and vice versa.
  if (isDesktop && (out.steering === 'tilt' || out.steering === 'touch')) out.steering = 'keys';
  if (!isDesktop && (out.steering === 'keys' || out.steering === 'wheel')) out.steering = 'tilt';
  return out;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* storage unavailable: settings last for this session only */
  }
}

export function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(REC) || '{}') || {};
  } catch (e) {
    return {};
  }
}

export function saveRecords(r) {
  try {
    localStorage.setItem(REC, JSON.stringify(r));
  } catch (e) {
    /* ignore */
  }
}

// Render quality presets, tuned for iPhone 15 Pro and newer (A17 Pro GPU and
// up). Every preset scales its render resolution with frame time between
// minPR and maxPR to hold 60 fps.
export const QUALITY = {
  // Macs and other computers (Apple M-series and up): Auto picks this one.
  // 4096 shadows over a wider area, denser scenery, grass and weather, sun
  // shafts, crisper far karts and up to full Retina resolution.
  max: {
    name: 'max', shadows: 4096, shadowRadius: 2.6, shadowRange: 84, treeShadows: true, density: 1.45, msaa: 4, bloom: true, weather: 1.6, grass: 2.2,
    minPR: 1, maxPR: 2, startPR: 1.5, shafts: 1, lodDist: 2.2,
  },
  high: { name: 'high', shadows: 2048, shadowRadius: 2.2, treeShadows: true, density: 1.15, msaa: 4, bloom: true, weather: 1, grass: 1, minPR: 1.8, maxPR: 3, startPR: 2.5 },
  auto: { name: 'auto', shadows: 2048, shadowRadius: 2.2, treeShadows: true, density: 1, msaa: 4, bloom: true, weather: 1, grass: 1, minPR: 1.35, maxPR: 2.4, startPR: 2 },
  low: { name: 'low', shadows: 1024, shadowRadius: 1.6, treeShadows: false, density: 0.7, msaa: 2, bloom: false, weather: 0.5, grass: 0.4, minPR: 1.2, maxPR: 1.6, startPR: 1.4 },
};
