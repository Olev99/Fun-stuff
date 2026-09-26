const KEY = 'zoomies.settings.v1';
const REC = 'zoomies.records.v1';

const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const DEFAULTS = {
  steering: isTouch ? 'tilt' : 'touch',
  tiltSens: 0.5,
  invertTilt: false,
  quality: 'auto',
  music: true,
  sfx: true,
  showFps: false,
  speedClass: 'zoom',
  char: 'mochi',
  track: 'sprout',
  reverse: false,
};

export function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch (e) {
    s = {};
  }
  return { ...DEFAULTS, ...s };
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

// Render quality presets. "auto" also scales resolution with frame time.
export const QUALITY = {
  high: { name: 'high', shadows: 2048, treeShadows: true, density: 1, minPR: 1.25, maxPR: 2, startPR: 2 },
  auto: { name: 'auto', shadows: 1024, treeShadows: false, density: 0.9, minPR: 1, maxPR: 2, startPR: 1.5 },
  low: { name: 'low', shadows: 0, treeShadows: false, density: 0.6, minPR: 0.85, maxPR: 1.25, startPR: 1 },
};
