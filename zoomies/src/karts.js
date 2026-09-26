import * as THREE from 'three';
import { GeoBuilder } from './util.js';
import { driverGeometry } from './characters.js';

// Kart bodies. Each has its own shape, wheel layout and stat modifiers that
// add to the driver's stats. Quick races, Grand Prix and multiplayer use the
// Zoom Classic; career players buy and upgrade the others.

const DARK = '#2a2438';
const METAL = '#9aa3b5';
const SEAT = '#3b2f5c';

// Geometry helpers. With LOW set they halve their segment counts, which is
// how the distant-kart level of detail is made.
let LOW = false;
const seg = (n, min = 5) => (LOW ? Math.max(min, Math.round(n / 2)) : n);
const sphere = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, seg(w, 6), seg(h, 4));
const capsule = (r, l, cs = 5, rs = 14) => new THREE.CapsuleGeometry(r, l, LOW ? 2 : cs, seg(rs, 6));
const cyl = (a, b, h, n = 12, open = false) => new THREE.CylinderGeometry(a, b, h, seg(n), 1, open);
const cone = (r, h, n = 12) => new THREE.ConeGeometry(r, h, seg(n));
const hemi = (r, w = 18, h = 10) => new THREE.SphereGeometry(r, seg(w, 6), seg(h, 4), 0, Math.PI * 2, 0, Math.PI / 2);
const torus = (R, r, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, seg(rs, 3), seg(ts, 6), arc);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const PI2 = Math.PI / 2;

const std = (front, rear, x = 0.82) => [
  { x, y: front.r, z: front.z, r: front.r, w: front.w, front: true },
  { x: -x, y: front.r, z: front.z, r: front.r, w: front.w, front: true },
  { x: x + 0.04, y: rear.r, z: rear.z, r: rear.r, w: rear.w, front: false },
  { x: -x - 0.04, y: rear.r, z: rear.z, r: rear.r, w: rear.w, front: false },
];

export const BODIES = {
  buggy: {
    id: 'buggy', name: 'Rust Bucket', price: 0,
    blurb: 'Your first kart. Held together by tape, hope and one headlight.',
    stats: { speed: -0.8, accel: -0.3, handling: -0.4, weight: -0.3 },
    wheels: std({ r: 0.31, z: 0.92, w: 0.26 }, { r: 0.37, z: -0.82, w: 0.34 }, 0.78), seat: 0,
  },
  classic: {
    id: 'classic', name: 'Zoom Classic', price: 900,
    blurb: 'The all-rounder everyone learns on. No surprises, no weaknesses.',
    stats: { speed: 0, accel: 0, handling: 0, weight: 0 },
    wheels: std({ r: 0.34, z: 0.9, w: 0.3 }, { r: 0.41, z: -0.82, w: 0.4 }, 0.8), seat: 0,
  },
  tub: {
    id: 'tub', name: 'Splish Splash', price: 1600,
    blurb: 'A bathtub with an engine. Turns on a dime, launches like a cork.',
    stats: { speed: -0.3, accel: 1, handling: 1, weight: -0.4 },
    wheels: std({ r: 0.33, z: 0.88, w: 0.28 }, { r: 0.38, z: -0.84, w: 0.34 }, 0.86), seat: 0.05,
  },
  comet: {
    id: 'comet', name: 'Comet', price: 2400,
    blurb: 'Long, low and pointy. Loves straights, sulks in tight corners.',
    stats: { speed: 1, accel: -0.3, handling: 0.4, weight: 0 },
    wheels: std({ r: 0.32, z: 1.05, w: 0.28 }, { r: 0.43, z: -0.92, w: 0.46 }, 0.86), seat: -0.05,
  },
  stomper: {
    id: 'stomper', name: 'Stomper', price: 3200,
    blurb: 'Monster wheels. Shrugs off bumps, grass and anyone who gets close.',
    stats: { speed: 0.3, accel: 0.4, handling: -0.4, weight: 1.6 }, offroad: 0.72,
    wheels: std({ r: 0.54, z: 0.95, w: 0.44 }, { r: 0.58, z: -0.9, w: 0.5 }, 1.02), seat: 0.32,
  },
  bolt: {
    id: 'bolt', name: 'Starbolt', price: 5200,
    blurb: 'A rocket that someone bolted wheels to. The fastest thing you can buy.',
    stats: { speed: 1.6, accel: 0.6, handling: 0.5, weight: 0.3 },
    wheels: std({ r: 0.33, z: 1.0, w: 0.3 }, { r: 0.42, z: -0.88, w: 0.44 }, 0.86), seat: 0,
  },
};
export const BODY_LIST = Object.values(BODIES);

// Garage upgrades, 5 levels each. Costs are per level.
export const UPGRADES = {
  engine: { id: 'engine', name: 'Engine', icon: '🔧', blurb: 'Higher top speed.', costs: [180, 360, 620, 950, 1400] },
  turbo: { id: 'turbo', name: 'Turbo', icon: '💨', blurb: 'Quicker acceleration and stronger drift boosts.', costs: [160, 320, 560, 860, 1250] },
  tyres: { id: 'tyres', name: 'Tyres', icon: '🛞', blurb: 'Sharper steering and more grip, especially on ice.', costs: [150, 300, 520, 800, 1150] },
  armor: { id: 'armor', name: 'Armour', icon: '🛡️', blurb: 'Heavier bumps and shorter spin-outs.', costs: [140, 280, 480, 740, 1100] },
};
export const MAX_UPGRADE = 5;

// Effective stats for a racer in a body with upgrades. Speed/accel/handling/
// weight are on the same scale as the racers' 1-5 stats (they can go past 5);
// the rest are multipliers.
export function kartStats(ch, bodyId = 'classic', up = {}) {
  const body = bodyById(bodyId);
  const b = body.stats;
  const lv = (k) => Math.max(0, Math.min(MAX_UPGRADE, up[k] || 0));
  return {
    speed: ch.stats.speed + b.speed + lv('engine') * 0.32,
    accel: ch.stats.accel + b.accel + lv('turbo') * 0.3,
    handling: ch.stats.handling + b.handling + lv('tyres') * 0.28,
    weight: ch.stats.weight + b.weight + lv('armor') * 0.3,
    grip: 1 + lv('tyres') * 0.06,
    turbo: 1 + lv('turbo') * 0.05,
    armor: 1 - lv('armor') * 0.07,
    offroad: body.offroad ?? 0.5,
  };
}
export const bodyById = (id) => BODIES[id] || BODIES.classic;

// Kept for code that only needs the classic layout.
export const WHEELS = BODIES.classic.wheels;

// ---------------- bodies ----------------
function headlights(B, xs, y, z, r = 0.1) {
  for (const x of xs) {
    B.add(sphere(r, 14, 10), '#c9ced8', [x, y, z - 0.03], [0, 0, 0], 1, 'chrome');
    B.add(sphere(r * 0.75, 12, 8), '#fff4c8', [x, y, z + 0.03], [0, 0, 0], 1, 'glowHot');
  }
}

function cockpit(B, y = 0, z = 0, seatCol = SEAT) {
  B.add(box(0.78, 0.6, 0.16), seatCol, [0, 0.98 + y, -0.62 + z], [-0.18, 0, 0], 1, 'fabric');
  B.add(torus(0.2, 0.045, 8, 20), DARK, [0, 1.02 + y, 0.42 + z], [-0.9, 0, 0], 1, 'rubber');
  B.add(cyl(0.04, 0.04, 0.5, 6), DARK, [0, 0.86 + y, 0.6 + z], [0.9, 0, 0], 1, 'metal');
}

const BUILD = {
  classic(B, body, trim) {
    B.add(box(1.25, 0.18, 2.3), DARK, [0, 0.32, 0], [0, 0, 0], 1, 'plastic');
    B.add(capsule(0.5, 1.5), body, [0, 0.6, -0.05], [PI2, 0, 0], [1.3, 0.6, 1]);
    B.add(capsule(0.34, 0.5), body, [0, 0.54, 1.02], [PI2, 0, 0], [1.45, 0.72, 1]);
    B.add(capsule(0.13, 1.3), DARK, [0, 0.36, 1.42], [0, 0, PI2], 1, 'rubber');
    for (const s of [-1, 1]) {
      B.add(capsule(0.22, 0.95), trim, [s * 0.68, 0.47, 0.02], [PI2, 0, 0]);
      B.add(sphere(0.36, 18, 10), body, [s * 0.8, 0.62, 0.9], [0, 0, 0], [0.55, 0.35, 0.95]);
      B.add(capsule(0.05, 0.9, 3, 8), '#ffffff', [s * 0.86, 0.55, 0.02], [PI2, 0, 0], 1, 'gloss');
    }
    B.add(box(0.9, 0.42, 0.55), METAL, [0, 0.72, -1.0], [0, 0, 0], 1, [0.35, 0.35, 0]);
    B.add(box(0.6, 0.2, 0.35), DARK, [0, 0.98, -1.0], [0, 0, 0], 1, 'plastic');
    for (let k = 0; k < 3; k++) B.add(box(0.94, 0.04, 0.5), '#6d7486', [0, 0.62 + k * 0.1, -1.0], [0, 0, 0], 1, [0.3, 0.5, 0]);
    for (const s of [-1, 1]) {
      B.add(cyl(0.11, 0.13, 0.5, 14), '#d0d6e2', [s * 0.3, 0.72, -1.36], [PI2, 0, 0], 1, 'chrome');
      B.add(cyl(0.07, 0.07, 0.52, 12), '#ff7a2a', [s * 0.3, 0.72, -1.37], [PI2, 0, 0], 1, 'glow');
    }
    B.add(box(1.6, 0.08, 0.4), trim, [0, 1.28, -1.22]);
    B.add(box(0.08, 0.3, 0.42), body, [0.8, 1.2, -1.22]);
    B.add(box(0.08, 0.3, 0.42), body, [-0.8, 1.2, -1.22]);
    for (const s of [-1, 1]) B.add(box(0.07, 0.42, 0.12), DARK, [s * 0.36, 1.04, -1.18], [0, 0, 0], 1, 'metal');
    for (const s of [-1, 1]) B.add(box(0.22, 0.09, 0.05), '#ff2a3a', [s * 0.62, 0.66, -1.16], [0, 0, 0], 1, 'glow');
    cockpit(B);
    B.add(box(0.62, 0.22, 0.03), '#bfe9ff', [0, 0.9, 0.62], [-0.5, 0, 0], 1, 'gloss');
    B.add(cyl(0.17, 0.17, 0.05, 20), trim, [0, 0.8, 1.02], [-0.25, 0, 0], 1, 'chrome');
    headlights(B, [-0.36, 0.36], 0.58, 1.34);
  },

  buggy(B, body, trim) {
    const rust = '#8a5a3c', tube = '#7d746c';
    B.add(box(1.15, 0.12, 2.15), DARK, [0, 0.3, 0], [0, 0, 0], 1, 'plastic');
    // tube frame
    for (const s of [-1, 1]) {
      B.add(cyl(0.05, 0.05, 2.1, 8), tube, [s * 0.6, 0.45, 0], [PI2, 0, 0], 1, [0.55, 0.6, 0]);
      B.add(cyl(0.045, 0.045, 0.7, 8), tube, [s * 0.45, 0.7, 0.7], [0.7, 0, s * 0.3], 1, [0.55, 0.6, 0]);
    }
    B.add(cyl(0.05, 0.05, 1.2, 8), tube, [0, 0.45, 1.05], [0, 0, PI2], 1, [0.55, 0.6, 0]);
    B.add(cyl(0.05, 0.05, 1.2, 8), tube, [0, 0.45, -1.05], [0, 0, PI2], 1, [0.55, 0.6, 0]);
    // roll hoop
    B.add(torus(0.48, 0.05, 6, 16, Math.PI), tube, [0, 0.72, -0.78], [0, 0, 0], 1, [0.5, 0.6, 0]);
    // mismatched panels
    B.add(box(0.95, 0.32, 0.6), body, [0, 0.55, 0.95], [-0.25, 0, 0], 1, [0.6, 0.05, 0]);
    B.add(box(0.4, 0.33, 0.3), '#c9c1b0', [0.2, 0.56, 1.02], [-0.25, 0, 0.03], 1, 'matte');
    B.add(box(0.2, 0.34, 0.62), rust, [-0.5, 0.52, 0.2], [0, 0, 0.08], 1, [0.9, 0.2, 0]);
    B.add(box(0.2, 0.34, 0.62), body, [0.5, 0.52, 0.2], [0, 0, -0.08], 1, [0.6, 0.05, 0]);
    // duct tape
    B.add(box(0.98, 0.05, 0.12), '#c8c8c8', [0, 0.73, 0.88], [-0.25, 0, 0], 1, 'fabric');
    // engine block and a single bent exhaust
    B.add(box(0.72, 0.42, 0.5), '#6d6258', [0, 0.7, -0.98], [0, 0, 0.04], 1, [0.6, 0.4, 0]);
    B.add(cyl(0.09, 0.1, 0.55, 10), '#9a8f86', [0.28, 0.82, -1.28], [1.2, 0, 0], 1, [0.4, 0.8, 0]);
    B.add(cyl(0.06, 0.06, 0.1, 10), '#ff7a2a', [0.28, 0.95, -1.5], [1.2, 0, 0], 1, 'glow');
    B.add(box(0.2, 0.08, 0.05), '#ff2a3a', [-0.3, 0.6, -1.24], [0, 0, 0], 1, 'glow');
    cockpit(B, 0, 0, '#5a4a3a');
    // one headlight works, one doesn't
    headlights(B, [0.3], 0.62, 1.26, 0.11);
    B.add(sphere(0.11, 12, 8), '#3a3440', [-0.3, 0.62, 1.23], [0, 0, 0], 1, 'plastic');
    B.add(sphere(0.07, 8, 6), trim, [0, 0.95, 1.1], [0, 0, 0], 1, 'plastic');
  },

  tub(B, body, trim) {
    B.add(box(1.2, 0.14, 2.1), DARK, [0, 0.3, 0], [0, 0, 0], 1, 'plastic');
    // the tub itself: glossy white, rolled rim, painted stripe
    B.add(capsule(0.55, 1.2, 6, 20), '#fbfbff', [0, 0.72, 0], [PI2, 0, 0], [1.25, 0.72, 1], 'gloss');
    B.add(torus(0.62, 0.07, 8, 28), '#ffffff', [0, 1.05, 0], [PI2, 0, 0], [1.18, 1.65, 1], 'gloss');
    for (const s of [-1, 1]) B.add(capsule(0.04, 1.4, 3, 8), body, [s * 0.69, 0.78, 0], [PI2, 0, 0], 1, 'paint');
    // water and bubbles
    B.add(sphere(0.55, 20, 8), '#8fd8ff', [0, 0.98, 0.05], [0, 0, 0], [1.25, 0.12, 1.65], 'gloss');
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9;
      B.add(sphere(0.12 + (k % 3) * 0.03, 10, 8), '#ffffff', [Math.cos(a) * 0.55, 1.1, Math.sin(a) * 0.9], [0, 0, 0], 1, [0.1, 0, 0.15]);
    }
    // golden claw feet
    for (const x of [-0.62, 0.62]) for (const z of [-0.55, 0.55]) B.add(sphere(0.1, 10, 8), '#ffcf4a', [x, 0.36, z], [0, 0, 0], 1, 'metal');
    // shower head on a chrome pole
    B.add(cyl(0.035, 0.035, 1.1, 8), '#d8dde8', [0.5, 1.4, -0.95], [0, 0, 0], 1, 'chrome');
    B.add(cyl(0.035, 0.035, 0.4, 8), '#d8dde8', [0.5, 1.95, -0.78], [PI2, 0, 0], 1, 'chrome');
    B.add(cone(0.14, 0.18, 12), '#d8dde8', [0.5, 1.88, -0.58], [Math.PI, 0, 0], 1, 'chrome');
    // rubber duck figurehead
    B.add(sphere(0.2, 14, 10), '#ffd23f', [0, 1.02, 1.05], [0, 0, 0], [1, 0.85, 1.1], 'plastic');
    B.add(sphere(0.13, 12, 10), '#ffd23f', [0, 1.26, 1.12], [0, 0, 0], 1, 'plastic');
    B.add(cone(0.06, 0.14, 8), '#ff8a1f', [0, 1.24, 1.27], [PI2, 0, 0], 1, 'plastic');
    for (const s of [-1, 1]) B.add(sphere(0.025, 6, 4), '#1b1530', [s * 0.06, 1.3, 1.23], [0, 0, 0], 1, 'eye');
    B.add(box(0.7, 0.36, 0.4), '#8a92a6', [0, 0.62, -1.02], [0, 0, 0], 1, [0.35, 0.5, 0]);
    for (const s of [-1, 1]) B.add(cyl(0.08, 0.08, 0.3, 10), '#ff7a2a', [s * 0.22, 0.62, -1.24], [PI2, 0, 0], 1, 'glow');
    cockpit(B, 0.02, 0.05, trim);
    headlights(B, [-0.34, 0.34], 0.66, 1.2, 0.09);
  },

  comet(B, body, trim) {
    B.add(box(1.1, 0.14, 2.4), DARK, [0, 0.28, 0], [0, 0, 0], 1, 'plastic');
    B.add(capsule(0.45, 1.9, 6, 18), body, [0, 0.5, -0.05], [PI2, 0, 0], [1.3, 0.5, 1]);
    // long pointed nose with a chrome tip
    B.add(cone(0.38, 1.1, 16), body, [0, 0.46, 1.45], [PI2, 0, 0], [1.3, 1, 0.55]);
    B.add(sphere(0.08, 10, 8), '#e8ecf4', [0, 0.46, 2.0], [0, 0, 0], 1, 'chrome');
    B.add(box(1.7, 0.05, 0.36), trim, [0, 0.36, 1.35], [0, 0, 0]);
    // side intakes and stripes
    for (const s of [-1, 1]) {
      B.add(capsule(0.16, 0.9, 4, 12), trim, [s * 0.62, 0.45, -0.2], [PI2, 0, 0], [1, 1.2, 1]);
      B.add(cyl(0.1, 0.1, 0.05, 12), DARK, [s * 0.62, 0.45, 0.35], [PI2, 0, 0], 1, 'plastic');
      B.add(box(0.05, 0.3, 0.6), trim, [s * 0.55, 0.9, -1.15], [0.35, 0, s * 0.15]);
    }
    // cockpit canopy
    B.add(hemi(0.36, 18, 12), '#9fdcff', [0, 0.7, 0.35], [0, 0, 0], [1, 0.6, 1.3], 'gloss');
    // big rear wing
    B.add(box(1.75, 0.07, 0.45), trim, [0, 1.25, -1.2], [0.08, 0, 0]);
    for (const s of [-1, 1]) {
      B.add(box(0.06, 0.55, 0.12), DARK, [s * 0.4, 0.98, -1.15], [0, 0, 0], 1, 'metal');
      B.add(box(0.07, 0.36, 0.5), body, [s * 0.88, 1.18, -1.2], [0, 0, 0]);
    }
    B.add(box(0.8, 0.3, 0.45), METAL, [0, 0.58, -1.05], [0, 0, 0], 1, [0.3, 0.6, 0]);
    for (const s of [-1, 1]) {
      B.add(cyl(0.09, 0.11, 0.4, 12), '#d0d6e2', [s * 0.22, 0.6, -1.35], [PI2, 0, 0], 1, 'chrome');
      B.add(cyl(0.06, 0.06, 0.42, 10), '#6fe8ff', [s * 0.22, 0.6, -1.36], [PI2, 0, 0], 1, 'glowHot');
      B.add(box(0.3, 0.05, 0.04), '#ff2a3a', [s * 0.45, 0.72, -1.3], [0, 0, 0], 1, 'glow');
      B.add(box(0.22, 0.05, 0.06), '#fff4c8', [s * 0.3, 0.5, 1.72], [0, s * 0.3, 0], 1, 'glowHot');
    }
    cockpit(B, -0.08, 0);
  },

  stomper(B, body, trim) {
    const Y = 0.38;
    B.add(box(1.4, 0.2, 2.3), DARK, [0, 0.45 + Y * 0.4, 0], [0, 0, 0], 1, 'plastic');
    B.add(capsule(0.5, 1.4, 5, 16), body, [0, 0.72 + Y, -0.05], [PI2, 0, 0], [1.45, 0.62, 1]);
    B.add(box(1.2, 0.45, 0.6), body, [0, 0.72 + Y, 1.0], [-0.12, 0, 0]);
    // bull bar and chunky fenders
    B.add(cyl(0.06, 0.06, 1.3, 10), '#dfe3ea', [0, 0.62 + Y, 1.42], [0, 0, PI2], 1, 'chrome');
    B.add(cyl(0.06, 0.06, 1.3, 10), '#dfe3ea', [0, 0.9 + Y, 1.38], [0, 0, PI2], 1, 'chrome');
    for (const s of [-1, 1]) {
      B.add(cyl(0.05, 0.05, 0.45, 8), '#dfe3ea', [s * 0.5, 0.76 + Y, 1.4], [0, 0, 0], 1, 'chrome');
      B.add(hemi(0.5, 18, 10), trim, [s * 1.02, 0.72 + Y * 0.9, 0.95], [0, 0, 0], [0.6, 0.7, 1]);
      B.add(hemi(0.55, 18, 10), trim, [s * 1.06, 0.74 + Y * 0.9, -0.9], [0, 0, 0], [0.6, 0.7, 1]);
    }
    // roll cage with spotlights
    for (const x of [-0.55, 0.55]) for (const z of [-0.85, 0.15]) B.add(cyl(0.045, 0.045, 0.95, 8), '#3a3448', [x, 1.45 + Y * 0.6, z], [0, 0, 0], 1, 'metal');
    for (const z of [-0.85, 0.15]) B.add(cyl(0.045, 0.045, 1.15, 8), '#3a3448', [0, 1.93 + Y * 0.6, z], [0, 0, PI2], 1, 'metal');
    for (const x of [-0.55, 0.55]) B.add(cyl(0.045, 0.045, 1.05, 8), '#3a3448', [x, 1.93 + Y * 0.6, -0.35], [PI2, 0, 0], 1, 'metal');
    for (const x of [-0.35, -0.12, 0.12, 0.35]) {
      B.add(cyl(0.08, 0.07, 0.1, 10), '#2a2438', [x, 2.02 + Y * 0.6, 0.2], [PI2, 0, 0], 1, 'metal');
      B.add(cyl(0.06, 0.06, 0.02, 10), '#fff4c8', [x, 2.02 + Y * 0.6, 0.26], [PI2, 0, 0], 1, 'glowHot');
    }
    // stacks
    for (const s of [-1, 1]) {
      B.add(cyl(0.08, 0.08, 1.0, 10), '#d0d6e2', [s * 0.35, 1.4 + Y, -1.15], [0, 0, 0], 1, 'chrome');
      B.add(cyl(0.06, 0.06, 0.04, 10), '#ff7a2a', [s * 0.35, 1.91 + Y, -1.15], [0, 0, 0], 1, 'glow');
      B.add(box(0.24, 0.1, 0.05), '#ff2a3a', [s * 0.5, 0.78 + Y, -1.17], [0, 0, 0], 1, 'glow');
    }
    B.add(box(0.95, 0.5, 0.55), METAL, [0, 0.85 + Y, -1.0], [0, 0, 0], 1, [0.35, 0.5, 0]);
    cockpit(B, Y * 0.85, 0);
    headlights(B, [-0.42, 0.42], 0.8 + Y, 1.32, 0.12);
  },

  bolt(B, body, trim) {
    B.add(box(1.1, 0.14, 2.4), DARK, [0, 0.3, 0], [0, 0, 0], 1, 'plastic');
    B.add(capsule(0.5, 1.8, 6, 20), body, [0, 0.58, -0.1], [PI2, 0, 0], [1.2, 0.58, 1]);
    B.add(cone(0.4, 1.0, 18), body, [0, 0.55, 1.4], [PI2, 0, 0], [1.2, 1, 0.62]);
    B.add(cone(0.12, 0.3, 12), '#e8ecf4', [0, 0.55, 1.98], [PI2, 0, 0], 1, 'chrome');
    // swept wings with glowing tips
    for (const s of [-1, 1]) {
      B.add(box(0.9, 0.05, 0.6), trim, [s * 0.9, 0.55, -0.45], [0, s * 0.35, s * 0.08]);
      B.add(sphere(0.07, 10, 8), s > 0 ? '#3dff8a' : '#ff3d6a', [s * 1.32, 0.58, -0.65], [0, 0, 0], 1, 'glowHot');
      B.add(box(0.05, 0.35, 0.4), trim, [s * 0.35, 1.0, -1.15], [0.4, 0, 0]);
      B.add(box(0.5, 0.04, 0.3), trim, [s * 0.5, 0.52, 1.05], [0, s * 0.3, 0]);
    }
    // canopy
    B.add(hemi(0.38, 18, 12), '#b8f4ff', [0, 0.82, 0.35], [0, 0, 0], [1, 0.55, 1.35], 'gloss');
    // the jet engine
    B.add(cyl(0.34, 0.28, 0.7, 20), '#b8c0d0', [0, 0.72, -1.2], [PI2, 0, 0], 1, 'chrome');
    B.add(cyl(0.24, 0.24, 0.72, 18), '#1a1a24', [0, 0.72, -1.21], [PI2, 0, 0], 1, 'metal');
    B.add(cyl(0.2, 0.2, 0.05, 18), '#6ff7ff', [0, 0.72, -1.55], [PI2, 0, 0], 1, [0.3, 0, 6]);
    B.add(torus(0.3, 0.035, 6, 24), trim, [0, 0.72, -1.52], [0, 0, 0], 1, 'glow');
    for (const s of [-1, 1]) B.add(box(0.2, 0.05, 0.04), '#fff4c8', [s * 0.28, 0.46, 1.66], [0, s * 0.35, 0], 1, 'glowHot');
    cockpit(B, 0, 0);
  },
};

// ---------------- wheels ----------------
// Unit radius and width, axis along X; instanced for all karts. The tyre is
// a rounded lathe profile, which looks smoother with fewer triangles than
// the old cylinder-and-torus build.
const _wheel = {};
export function wheelGeometry(lo = false) {
  const key = lo ? 'lo' : 'hi';
  if (_wheel[key]) return _wheel[key];
  const B = new GeoBuilder('rubber');
  if (lo) {
    B.add(new THREE.CylinderGeometry(1, 1, 1, 12), '#26212f', [0, 0, 0], [0, 0, PI2]);
    B.add(new THREE.CylinderGeometry(0.6, 0.6, 1.04, 8), '#ffffff', [0, 0, 0], [0, 0, PI2], 1, 'paint');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      B.add(new THREE.BoxGeometry(1.02, 0.14, 0.3), '#3d3648', [0, Math.cos(a) * 0.95, Math.sin(a) * 0.95], [a, 0, 0]);
    }
  } else {
    const prof = [[0.6, -0.5], [0.86, -0.5], [0.96, -0.44], [1, -0.32], [1, 0.32], [0.96, 0.44], [0.86, 0.5], [0.6, 0.5]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const tyre = new THREE.LatheGeometry(prof, 22);
    B.add(tyre, '#26212f', [0, 0, 0], [0, 0, PI2]);
    B.add(new THREE.CylinderGeometry(0.61, 0.61, 1.0, 16), '#ffffff', [0, 0, 0], [0, 0, PI2], 1, 'paint');
    B.add(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), '#c9ced8', [0, 0, 0], [0, 0, PI2], 1, 'chrome');
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      B.add(new THREE.BoxGeometry(1.06, 0.09, 0.46), '#d8dce6', [0, Math.cos(a) * 0.32, Math.sin(a) * 0.32], [a, 0, 0], 1, 'chrome');
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      B.add(new THREE.BoxGeometry(0.86, 0.12, 0.28), '#3d3648', [0, Math.cos(a) * 0.97, Math.sin(a) * 0.97], [a, 0, 0]);
    }
  }
  const g = B.build();
  g.userData.shared = true;
  _wheel[key] = g;
  return g;
}

// ---------------- assembled karts ----------------
const _cache = new Map();

// { chassis, driver } geometries for a racer in a body. `lo` builds the
// cheaper version used for karts far from the camera; `paint` overrides the
// body colour (career paint jobs).
export function kartGeometry(ch, { body = 'classic', lo = false, paint = null } = {}) {
  const key = `${ch.id}|${body}|${lo ? 1 : 0}|${paint || ''}`;
  if (_cache.has(key)) return _cache.get(key);
  LOW = lo;
  let chassis;
  try {
    const B = new GeoBuilder('paint');
    (BUILD[body] || BUILD.classic)(B, paint || ch.color, ch.accent);
    chassis = B.build();
  } finally {
    LOW = false;
  }
  const g = { chassis, driver: driverGeometry(ch, lo) };
  g.chassis.userData.shared = true;
  g.driver.userData.shared = true;
  _cache.set(key, g);
  return g;
}
