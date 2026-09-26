import * as THREE from 'three';
import { GeoBuilder } from './util.js';

// Eight original racers. Stats are 1-5 and each racer's total is 12.
export const CHARACTERS = [
  { id: 'mochi', name: 'Mochi', species: 'Cat', tagline: 'Balanced, unflappable, always lands on four wheels.', color: '#ff7eb0', accent: '#fff3e0', stats: { speed: 3, accel: 3, handling: 3, weight: 3 } },
  { id: 'pip', name: 'Pip', species: 'Penguin', tagline: 'Tiny, zippy and totally fearless on ice.', color: '#3fb0ff', accent: '#ffffff', stats: { speed: 2, accel: 5, handling: 4, weight: 1 } },
  { id: 'bruno', name: 'Bruno', species: 'Bear', tagline: 'Heavy paws, huge top speed, brakes optional.', color: '#e0503a', accent: '#ffd23f', stats: { speed: 5, accel: 1, handling: 2, weight: 4 } },
  { id: 'rexi', name: 'Rexi', species: 'Dino', tagline: 'Big stomps, bigger bumps.', color: '#35b85c', accent: '#ffd23f', stats: { speed: 4, accel: 2, handling: 2, weight: 4 } },
  { id: 'volt', name: 'Volt', species: 'Robot', tagline: 'Computes the perfect drift line in 0.01s.', color: '#aab6c8', accent: '#39f5ff', stats: { speed: 3, accel: 2, handling: 5, weight: 2 } },
  { id: 'ember', name: 'Ember', species: 'Fox', tagline: 'Quick paws and an even quicker smirk.', color: '#ff7a1a', accent: '#1d1537', stats: { speed: 4, accel: 3, handling: 3, weight: 2 } },
  { id: 'zorp', name: 'Zorp', species: 'Alien', tagline: 'Came for the gems. Stayed for the drifts.', color: '#8f5cff', accent: '#7dff9a', stats: { speed: 3, accel: 4, handling: 2, weight: 3 } },
  { id: 'hopper', name: 'Hopper', species: 'Frog', tagline: 'Sticks every landing. Every. Single. One.', color: '#a6dd2a', accent: '#ff5a8a', stats: { speed: 2, accel: 4, handling: 4, weight: 2 } },
];

export function charById(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

const DARK = '#2a2438';
const METAL = '#9aa3b5';
const SEAT = '#3b2f5c';

const sphere = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);
const capsule = (r, l, cs = 5, rs = 14) => new THREE.CapsuleGeometry(r, l, cs, rs);

// Wheel geometry (unit radius and width, axis along X); instanced for all karts.
let _wheelGeo = null;
export function wheelGeometry() {
  if (_wheelGeo) return _wheelGeo;
  const B = new GeoBuilder('rubber');
  B.add(new THREE.CylinderGeometry(1, 1, 1, 24), '#26212f', [0, 0, 0], [0, 0, Math.PI / 2]);
  B.add(new THREE.TorusGeometry(0.86, 0.16, 8, 24), '#2e2838', [0.5, 0, 0], [0, Math.PI / 2, 0]);
  B.add(new THREE.TorusGeometry(0.86, 0.16, 8, 24), '#2e2838', [-0.5, 0, 0], [0, Math.PI / 2, 0]);
  B.add(new THREE.CylinderGeometry(0.58, 0.58, 1.06, 18), '#ffffff', [0, 0, 0], [0, 0, Math.PI / 2], 1, 'paint');
  B.add(new THREE.CylinderGeometry(0.22, 0.22, 1.12, 10), '#c9ced8', [0, 0, 0], [0, 0, Math.PI / 2], 1, 'chrome');
  // spokes and tread blocks so rolling is visible
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    B.add(new THREE.BoxGeometry(1.1, 0.1, 0.5), '#d8dce6', [0, Math.cos(a) * 0.3, Math.sin(a) * 0.3], [a, 0, 0], 1, 'chrome');
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    B.add(new THREE.BoxGeometry(1.02, 0.14, 0.26), '#3d3648', [0, Math.cos(a) * 0.95, Math.sin(a) * 0.95], [a, 0, 0]);
  }
  _wheelGeo = B.build();
  _wheelGeo.userData.shared = true;
  return _wheelGeo;
}

export const WHEELS = [
  { x: 0.8, y: 0.34, z: 0.9, r: 0.34, w: 0.3, front: true },
  { x: -0.8, y: 0.34, z: 0.9, r: 0.34, w: 0.3, front: true },
  { x: 0.84, y: 0.41, z: -0.82, r: 0.41, w: 0.4, front: false },
  { x: -0.84, y: 0.41, z: -0.82, r: 0.41, w: 0.4, front: false },
];

function chassis(ch) {
  const B = new GeoBuilder('paint');
  const body = ch.color;
  const trim = ch.accent;
  // floor pan
  B.add(new THREE.BoxGeometry(1.25, 0.18, 2.3), DARK, [0, 0.32, 0], [0, 0, 0], 1, 'plastic');
  // main tub
  B.add(capsule(0.5, 1.5), body, [0, 0.6, -0.05], [Math.PI / 2, 0, 0], [1.3, 0.6, 1]);
  // nose
  B.add(capsule(0.34, 0.5), body, [0, 0.54, 1.02], [Math.PI / 2, 0, 0], [1.45, 0.72, 1]);
  // front bumper
  B.add(capsule(0.13, 1.3), DARK, [0, 0.36, 1.42], [0, 0, Math.PI / 2], 1, 'rubber');
  // side pods
  for (const s of [-1, 1]) {
    B.add(capsule(0.22, 0.95), trim, [s * 0.68, 0.47, 0.02], [Math.PI / 2, 0, 0]);
    // fenders over the front wheels
    B.add(sphere(0.36, 18, 10), body, [s * 0.8, 0.62, 0.9], [0, 0, 0], [0.55, 0.35, 0.95]);
    // racing stripe on the pod
    B.add(capsule(0.05, 0.9, 3, 8), '#ffffff', [s * 0.86, 0.55, 0.02], [Math.PI / 2, 0, 0], 1, 'gloss');
  }
  // engine + exhausts
  B.add(new THREE.BoxGeometry(0.9, 0.42, 0.55), METAL, [0, 0.72, -1.0], [0, 0, 0], 1, [0.35, 0.35, 0]);
  B.add(new THREE.BoxGeometry(0.6, 0.2, 0.35), DARK, [0, 0.98, -1.0], [0, 0, 0], 1, 'plastic');
  for (let k = 0; k < 3; k++) B.add(new THREE.BoxGeometry(0.94, 0.04, 0.5), '#6d7486', [0, 0.62 + k * 0.1, -1.0], [0, 0, 0], 1, [0.3, 0.5, 0]);
  for (const s of [-1, 1]) {
    B.add(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 14), '#d0d6e2', [s * 0.3, 0.72, -1.36], [Math.PI / 2, 0, 0], 1, 'chrome');
    B.add(new THREE.CylinderGeometry(0.07, 0.07, 0.52, 12), '#ff7a2a', [s * 0.3, 0.72, -1.37], [Math.PI / 2, 0, 0], 1, 'glow');
  }
  // spoiler
  B.add(new THREE.BoxGeometry(1.6, 0.08, 0.4), trim, [0, 1.28, -1.22]);
  B.add(new THREE.BoxGeometry(0.08, 0.3, 0.42), body, [0.8, 1.2, -1.22]);
  B.add(new THREE.BoxGeometry(0.08, 0.3, 0.42), body, [-0.8, 1.2, -1.22]);
  for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.07, 0.42, 0.12), DARK, [s * 0.36, 1.04, -1.18], [0, 0, 0], 1, 'metal');
  // tail lights
  for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.22, 0.09, 0.05), '#ff2a3a', [s * 0.62, 0.66, -1.16], [0, 0, 0], 1, 'glow');
  // seat back
  B.add(new THREE.BoxGeometry(0.78, 0.6, 0.16), SEAT, [0, 0.98, -0.62], [-0.18, 0, 0], 1, 'fabric');
  // steering wheel + column
  B.add(new THREE.TorusGeometry(0.2, 0.045, 8, 20), DARK, [0, 1.02, 0.42], [-0.9, 0, 0], 1, 'rubber');
  B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), DARK, [0, 0.86, 0.6], [0.9, 0, 0], 1, 'metal');
  // windscreen
  B.add(new THREE.BoxGeometry(0.62, 0.22, 0.03), '#bfe9ff', [0, 0.9, 0.62], [-0.5, 0, 0], 1, 'gloss');
  // nose emblem + headlights
  B.add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), trim, [0, 0.8, 1.02], [-0.25, 0, 0], 1, 'chrome');
  for (const s of [-1, 1]) {
    B.add(sphere(0.1, 14, 10), '#c9ced8', [s * 0.36, 0.58, 1.31], [0, 0, 0], 1, 'chrome');
    B.add(sphere(0.075, 12, 8), '#fff4c8', [s * 0.36, 0.58, 1.37], [0, 0, 0], 1, 'glowHot');
  }
  return B.build();
}

// Cute eyes: glossy dark ovals with a highlight.
function eyes(B, hx, hy, hz, spread, r = 0.1) {
  for (const s of [-1, 1]) {
    B.add(sphere(r, 16, 12), '#1b1530', [hx + s * spread, hy, hz], [0, 0, 0], [0.8, 1.15, 0.6], 'eye');
    B.add(sphere(r * 0.35, 8, 6), '#ffffff', [hx + s * spread + 0.03, hy + r * 0.45, hz + r * 0.45], [0, 0, 0], 1, [0.3, 0, 0.6]);
  }
}

function googlyEyes(B, hx, hy, hz, spread, r = 0.14) {
  for (const s of [-1, 1]) {
    B.add(sphere(r, 16, 12), '#ffffff', [hx + s * spread, hy, hz], [0, 0, 0], 1, 'gloss');
    B.add(sphere(r * 0.5, 12, 8), '#1b1530', [hx + s * spread, hy, hz + r * 0.62], [0, 0, 0], 1, 'eye');
  }
}

function driver(ch) {
  const B = new GeoBuilder('fur');
  const H = { x: 0, y: 1.66, z: -0.22 };
  const suit = ch.color;
  const glove = '#ffffff';
  const armL = (fur) => {
    for (const s of [-1, 1]) {
      B.add(capsule(0.1, 0.38, 4, 12), fur, [s * 0.27, 1.1, 0.08], [Math.PI / 2 + 0.35, 0, s * 0.35]);
      B.add(sphere(0.1, 12, 8), glove, [s * 0.18, 1.04, 0.36], [0, 0, 0], 1, 'fabric');
    }
  };
  const torso = (c, belly) => {
    B.add(sphere(0.36, 18, 14), c, [0, 1.07, -0.28], [0, 0, 0], [1, 1.05, 0.9], 'fabric');
    if (belly) B.add(sphere(0.28, 16, 12), belly, [0, 1.02, -0.1], [0, 0, 0], [0.9, 1, 0.6], 'fabric');
  };

  switch (ch.id) {
    case 'mochi': {
      const fur = '#fff1e0';
      torso(suit, '#ffffff');
      armL(fur);
      B.add(sphere(0.46), fur, [H.x, H.y, H.z]);
      for (const s of [-1, 1]) {
        B.add(new THREE.ConeGeometry(0.16, 0.3, 4), fur, [s * 0.26, H.y + 0.4, H.z - 0.02], [0, 0.78, -s * 0.35]);
        B.add(new THREE.ConeGeometry(0.09, 0.18, 4), '#ff9ec4', [s * 0.25, H.y + 0.39, H.z + 0.05], [0, 0.78, -s * 0.35]);
        for (const k of [-1, 1]) B.add(new THREE.BoxGeometry(0.28, 0.018, 0.018), '#6b5a70', [s * 0.36, H.y - 0.08 + k * 0.05, H.z + 0.36], [0, s * 0.3, k * s * 0.15]);
      }
      eyes(B, 0, H.y + 0.05, H.z + 0.39, 0.16);
      B.add(sphere(0.055, 10, 8), '#ff6f9f', [0, H.y - 0.06, H.z + 0.45], [0, 0, 0], 1, 'gloss');
      B.add(sphere(0.07, 12, 8), '#ffd23f', [0, H.y - 0.43, H.z + 0.26], [0, 0, 0], 1, 'metal');
      break;
    }
    case 'pip': {
      const navy = '#1f2a44';
      torso(navy, '#ffffff');
      armL(navy);
      B.add(sphere(0.46), navy, [H.x, H.y, H.z]);
      B.add(sphere(0.4), '#ffffff', [0, H.y - 0.04, H.z + 0.12], [0, 0, 0], [0.9, 0.8, 0.85]);
      eyes(B, 0, H.y + 0.06, H.z + 0.45, 0.15, 0.085);
      B.add(new THREE.ConeGeometry(0.1, 0.26, 12), '#ff9a1f', [0, H.y - 0.08, H.z + 0.55], [Math.PI / 2, 0, 0], 1, 'plastic');
      // aviator goggles on the forehead
      B.add(new THREE.TorusGeometry(0.44, 0.05, 8, 28), '#3fb0ff', [0, H.y + 0.2, H.z], [Math.PI / 2 - 0.25, 0, 0], 1, 'plastic');
      for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16), '#bfe9ff', [s * 0.14, H.y + 0.3, H.z + 0.38], [Math.PI / 2 - 0.5, 0, 0], 1, 'gloss');
      break;
    }
    case 'bruno': {
      const fur = '#8a5530';
      torso(suit, '#d9a36a');
      armL(fur);
      B.add(sphere(0.5), fur, [H.x, H.y, H.z]);
      for (const s of [-1, 1]) {
        B.add(sphere(0.16, 10, 8), fur, [s * 0.34, H.y + 0.36, H.z - 0.04]);
        B.add(sphere(0.09, 8, 6), '#d9a36a', [s * 0.34, H.y + 0.36, H.z + 0.06]);
      }
      B.add(sphere(0.22), '#e2b07a', [0, H.y - 0.12, H.z + 0.38], [0, 0, 0], [1.1, 0.8, 0.8]);
      B.add(sphere(0.08, 12, 8), '#1b1530', [0, H.y - 0.04, H.z + 0.56], [0, 0, 0], [1.3, 1, 1], 'gloss');
      eyes(B, 0, H.y + 0.1, H.z + 0.42, 0.18, 0.075);
      break;
    }
    case 'rexi': {
      const skin = '#35b85c';
      B.mat = 'skin';
      torso(skin, '#ffe7a1');
      armL(skin);
      B.add(sphere(0.44), skin, [H.x, H.y, H.z - 0.05], [0, 0, 0], [0.95, 0.9, 1.1]);
      B.add(sphere(0.3), skin, [0, H.y - 0.1, H.z + 0.38], [0, 0, 0], [1.05, 0.72, 1]);
      for (const s of [-1, 1]) B.add(sphere(0.035, 6, 4), '#1b1530', [s * 0.1, H.y - 0.02, H.z + 0.66]);
      for (let k = 0; k < 4; k++) B.add(new THREE.ConeGeometry(0.035, 0.08, 4), '#ffffff', [-0.15 + k * 0.1, H.y - 0.24, H.z + 0.56], [Math.PI, 0, 0]);
      googlyEyes(B, 0, H.y + 0.2, H.z + 0.22, 0.2, 0.13);
      for (let k = 0; k < 4; k++) B.add(new THREE.ConeGeometry(0.1, 0.24, 4), '#ffd23f', [0, H.y + 0.38 - k * 0.2, H.z - 0.36 - k * 0.14], [-0.6 - k * 0.2, 0, 0]);
      break;
    }
    case 'volt': {
      const metal = '#c9d2e0';
      torso('#8a96aa', '#39f5ff');
      armL(metal);
      B.add(sphere(0.12, 12, 8), '#39f5ff', [0, 1.1, 0.06], [0, 0, 0], [1, 1, 0.4], 'glow');
      B.add(new THREE.BoxGeometry(0.74, 0.58, 0.64), metal, [H.x, H.y, H.z], [0, 0, 0], 1, [0.28, 0.9, 0]);
      B.add(new THREE.BoxGeometry(0.62, 0.26, 0.06), '#1d1537', [0, H.y + 0.04, H.z + 0.33], [0, 0, 0], 1, 'gloss');
      for (const s of [-1, 1]) {
        B.add(sphere(0.07, 12, 8), '#6ff7ff', [s * 0.15, H.y + 0.05, H.z + 0.36], [0, 0, 0], [1.4, 1, 0.5], 'glowHot');
        B.add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16), '#ffd23f', [s * 0.4, H.y, H.z], [0, 0, Math.PI / 2], 1, 'metal');
      }
      B.add(new THREE.BoxGeometry(0.3, 0.05, 0.05), '#6ff7ff', [0, H.y - 0.17, H.z + 0.33], [0, 0, 0], 1, 'glow');
      B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), DARK, [0.12, H.y + 0.45, H.z], [0, 0, 0], 1, 'metal');
      B.add(sphere(0.08, 12, 8), '#ff3d6a', [0.12, H.y + 0.64, H.z], [0, 0, 0], 1, 'glow');
      break;
    }
    case 'ember': {
      const fur = '#ff7a1a';
      torso('#1d1537', '#ffffff');
      armL(fur);
      B.add(sphere(0.45), fur, [H.x, H.y, H.z]);
      for (const s of [-1, 1]) {
        B.add(new THREE.ConeGeometry(0.17, 0.46, 4), fur, [s * 0.26, H.y + 0.46, H.z - 0.04], [0, 0.78, -s * 0.28]);
        B.add(new THREE.ConeGeometry(0.07, 0.16, 4), '#1d1537', [s * 0.32, H.y + 0.66, H.z - 0.04], [0, 0.78, -s * 0.28]);
        B.add(sphere(0.16, 8, 6), '#ffffff', [s * 0.2, H.y - 0.14, H.z + 0.3], [0, 0, 0], [1, 0.8, 0.8]);
      }
      B.add(new THREE.ConeGeometry(0.16, 0.32, 8), '#ffffff', [0, H.y - 0.1, H.z + 0.5], [Math.PI / 2, 0, 0]);
      B.add(sphere(0.055, 10, 8), '#1b1530', [0, H.y - 0.1, H.z + 0.66], [0, 0, 0], 1, 'gloss');
      eyes(B, 0, H.y + 0.08, H.z + 0.38, 0.17, 0.09);
      // scarf
      B.add(new THREE.TorusGeometry(0.3, 0.08, 8, 20), '#ffd23f', [0, H.y - 0.42, H.z + 0.02], [Math.PI / 2, 0, 0], 1, 'fabric');
      break;
    }
    case 'zorp': {
      const skin = '#7dff9a';
      B.mat = 'skin';
      torso('#8f5cff', '#c7a0ff');
      armL(skin);
      B.add(sphere(0.5), skin, [H.x, H.y + 0.04, H.z], [0, 0, 0], [1, 1.12, 1]);
      B.add(sphere(0.22, 18, 14), '#ffffff', [0, H.y + 0.08, H.z + 0.36], [0, 0, 0], 1, 'gloss');
      B.add(sphere(0.12, 14, 10), '#1b1530', [0, H.y + 0.08, H.z + 0.53], [0, 0, 0], 1, 'eye');
      B.add(sphere(0.04, 6, 4), '#ffffff', [0.04, H.y + 0.13, H.z + 0.63]);
      for (const s of [-1, 1]) {
        B.add(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 5), '#4fcf6b', [s * 0.2, H.y + 0.62, H.z - 0.05], [0, 0, -s * 0.35]);
        B.add(sphere(0.08, 12, 8), '#ff5ad8', [s * 0.28, H.y + 0.84, H.z - 0.05], [0, 0, 0], 1, 'glow');
      }
      B.add(new THREE.TorusGeometry(0.1, 0.02, 4, 10, Math.PI), '#1b1530', [0, H.y - 0.18, H.z + 0.44], [0, 0, Math.PI]);
      break;
    }
    case 'hopper': {
      const skin = '#a6dd2a';
      B.mat = [0.35, 0, 0];
      torso(skin, '#f2ffb8');
      armL(skin);
      B.add(sphere(0.46), skin, [H.x, H.y - 0.05, H.z], [0, 0, 0], [1.25, 0.8, 1]);
      googlyEyes(B, 0, H.y + 0.28, H.z + 0.14, 0.26, 0.16);
      for (const s of [-1, 1]) B.add(sphere(0.18, 8, 6), skin, [s * 0.26, H.y + 0.2, H.z + 0.08], [0, 0, 0], [1, 0.9, 1]);
      B.add(new THREE.TorusGeometry(0.22, 0.025, 4, 14, Math.PI), '#6b1f3a', [0, H.y - 0.08, H.z + 0.4], [0.2, 0, Math.PI]);
      for (const s of [-1, 1]) B.add(sphere(0.07, 6, 4), '#ff8fb0', [s * 0.36, H.y - 0.1, H.z + 0.3], [0, 0, 0], [1, 0.6, 0.6]);
      B.add(new THREE.ConeGeometry(0.22, 0.3, 16), '#ff5a8a', [0.18, H.y + 0.3, H.z - 0.18], [0, 0, -0.4], 1, 'fabric');
      break;
    }
    default:
      torso(suit);
      B.add(sphere(0.45), suit, [H.x, H.y, H.z]);
  }
  return B.build();
}

const _cache = new Map();
export function kartGeometry(ch) {
  if (_cache.has(ch.id)) return _cache.get(ch.id);
  const g = { chassis: chassis(ch), driver: driver(ch) };
  g.chassis.userData.shared = true;
  g.driver.userData.shared = true;
  _cache.set(ch.id, g);
  return g;
}
