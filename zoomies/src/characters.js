import * as THREE from 'three';
import { GeoBuilder } from './util.js';
import { addHat } from './cosmetics.js';

// Sixteen original racers. Stats are 1-5 and each racer's total is 12.
// The first eight are open from the start; the rest (with `lvl`) unlock at
// that player level in quick play and can be hired in the Career Garage.
export const CHARACTERS = [
  { id: 'mochi', name: 'Mochi', species: 'Cat', tagline: 'Balanced, unflappable, always lands on four wheels.', color: '#ff7eb0', accent: '#fff3e0', stats: { speed: 3, accel: 3, handling: 3, weight: 3 } },
  { id: 'pip', name: 'Pip', species: 'Penguin', tagline: 'Tiny, zippy and totally fearless on ice.', color: '#3fb0ff', accent: '#ffffff', stats: { speed: 2, accel: 5, handling: 4, weight: 1 } },
  { id: 'bruno', name: 'Bruno', species: 'Bear', tagline: 'Heavy paws, huge top speed, brakes optional.', color: '#e0503a', accent: '#ffd23f', stats: { speed: 5, accel: 1, handling: 2, weight: 4 } },
  { id: 'rexi', name: 'Rexi', species: 'Dino', tagline: 'Big stomps, bigger bumps.', color: '#1fa9b0', accent: '#ff8a2b', stats: { speed: 4, accel: 2, handling: 2, weight: 4 } },
  { id: 'volt', name: 'Volt', species: 'Robot', tagline: 'Computes the perfect drift line in 0.01s.', color: '#aab6c8', accent: '#39f5ff', stats: { speed: 3, accel: 2, handling: 5, weight: 2 } },
  { id: 'ember', name: 'Ember', species: 'Fox', tagline: 'Quick paws and an even quicker smirk.', color: '#ff7a1a', accent: '#1d1537', stats: { speed: 4, accel: 3, handling: 3, weight: 2 } },
  { id: 'zorp', name: 'Zorp', species: 'Alien', tagline: 'Came for the gems. Stayed for the drifts.', color: '#8f5cff', accent: '#7dff9a', stats: { speed: 3, accel: 4, handling: 2, weight: 3 } },
  { id: 'hopper', name: 'Hopper', species: 'Frog', tagline: 'Sticks every landing. Every. Single. One.', color: '#a6dd2a', accent: '#ff5a8a', stats: { speed: 2, accel: 4, handling: 4, weight: 2 } },
  { id: 'yuzu', name: 'Yuzu', species: 'Capybara', tagline: 'So relaxed it naps at the start line. Still somehow on the podium.', color: '#c98a4b', accent: '#ff9f1a', lvl: 2, price: 900, stats: { speed: 4, accel: 2, handling: 2, weight: 4 } },
  { id: 'lulu', name: 'Lulu', species: 'Axolotl', tagline: 'Smiles through every hairpin, even sideways.', color: '#ff8fc7', accent: '#7a3cff', lvl: 3, price: 1000, stats: { speed: 2, accel: 4, handling: 4, weight: 2 } },
  { id: 'bao', name: 'Bao', species: 'Panda', tagline: 'Gentle giant. Snacks on bamboo between laps, shoves you on corners.', color: '#2ec27e', accent: '#ffffff', lvl: 4, price: 1100, stats: { speed: 3, accel: 2, handling: 3, weight: 4 } },
  { id: 'hoot', name: 'Hoot', species: 'Owl', tagline: 'Sees every racing line, even at night. Especially at night.', color: '#8a5ad6', accent: '#ffd23f', lvl: 5, price: 1200, stats: { speed: 4, accel: 3, handling: 3, weight: 2 } },
  { id: 'bandit', name: 'Bandit', species: 'Raccoon', tagline: 'Steals the racing line, your slipstream and the last gem.', color: '#3a3f55', accent: '#ff3d6a', lvl: 7, price: 1400, stats: { speed: 4, accel: 4, handling: 2, weight: 2 } },
  { id: 'fizz', name: 'Fizz', species: 'Bee', tagline: 'Zero to buzzing in half a second. Terrible at sitting still.', color: '#ffc21f', accent: '#1d1537', lvl: 8, price: 1500, stats: { speed: 2, accel: 5, handling: 3, weight: 2 } },
  { id: 'ollie', name: 'Ollie', species: 'Octopus', tagline: 'Eight arms: two for the wheel, six for waving at the crowd.', color: '#ff6f61', accent: '#39f5ff', lvl: 10, price: 1700, stats: { speed: 3, accel: 3, handling: 4, weight: 2 } },
  { id: 'gus', name: 'Gus', species: 'Walrus', tagline: 'Retired sea captain. Heavy, stubborn and very, very fast.', color: '#3f6fb0', accent: '#ffd23f', lvl: 12, price: 2000, stats: { speed: 5, accel: 2, handling: 1, weight: 4 } },
];

// Racers still locked for a player in quick play: null if open, else why.
export function charLocked(id, level = 1, career = null) {
  const ch = charById(id);
  if (!ch.lvl || level >= ch.lvl || (career && career.racers && career.racers.includes(id))) return null;
  return `Reach level ${ch.lvl}, or hire ${ch.name} in the Career Garage`;
}

export function charById(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

const DARK = '#2a2438';

// Distant karts use a cheaper driver: sphere and capsule segment counts halve.
let LOW = false;
const seg = (n, min) => (LOW ? Math.max(min, Math.round(n / 2)) : n);
const sphere = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, seg(w, 6), seg(h, 4));
const capsule = (r, l, cs = 5, rs = 14) => new THREE.CapsuleGeometry(r, l, LOW ? 2 : cs, seg(rs, 6));

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

function driver(ch, hat) {
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
      const skin = '#2bb8b0';
      B.mat = 'skin';
      torso(skin, '#d6f5ee');
      armL(skin);
      B.add(sphere(0.44), skin, [H.x, H.y, H.z - 0.05], [0, 0, 0], [0.95, 0.9, 1.1]);
      B.add(sphere(0.3), skin, [0, H.y - 0.1, H.z + 0.38], [0, 0, 0], [1.05, 0.72, 1]);
      for (const s of [-1, 1]) B.add(sphere(0.035, 6, 4), '#1b1530', [s * 0.1, H.y - 0.02, H.z + 0.66]);
      for (let k = 0; k < 4; k++) B.add(new THREE.ConeGeometry(0.035, 0.08, 4), '#ffffff', [-0.15 + k * 0.1, H.y - 0.24, H.z + 0.56], [Math.PI, 0, 0]);
      googlyEyes(B, 0, H.y + 0.2, H.z + 0.22, 0.2, 0.13);
      for (let k = 0; k < 4; k++) B.add(new THREE.ConeGeometry(0.1, 0.24, 4), '#ff8a2b', [0, H.y + 0.38 - k * 0.2, H.z - 0.36 - k * 0.14], [-0.6 - k * 0.2, 0, 0]);
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
    case 'yuzu': {
      // capybara: long blunt snout, tiny ears, sleepy eyes and a yuzu fruit on its head
      const fur = '#b57a45';
      torso(suit, '#e3b27a');
      armL(fur);
      B.add(sphere(0.44), fur, [H.x, H.y - 0.02, H.z - 0.05], [0, 0, 0], [0.98, 0.92, 1.12]);
      B.add(sphere(0.3), fur, [0, H.y - 0.1, H.z + 0.38], [0, 0, 0], [1.05, 0.85, 1.05]);
      B.add(sphere(0.16), '#5a3a22', [0, H.y - 0.06, H.z + 0.66], [0, 0, 0], [1.3, 0.75, 0.6], 'gloss');
      for (const s of [-1, 1]) {
        B.add(sphere(0.09, 10, 8), fur, [s * 0.26, H.y + 0.34, H.z - 0.12], [0, 0, 0], [1, 0.7, 0.6]);
        B.add(sphere(0.06, 10, 8), '#1b1530', [s * 0.2, H.y + 0.12, H.z + 0.33], [0, 0, 0], [1.2, 0.55, 0.6], 'eye');
        B.add(new THREE.BoxGeometry(0.14, 0.025, 0.03), fur, [s * 0.2, H.y + 0.15, H.z + 0.36], [0, 0, -s * 0.1]);
      }
      B.add(sphere(0.15, 14, 10), '#ffb21f', [0.06, H.y + 0.48, H.z - 0.04], [0, 0, 0], 1, 'gloss');
      B.add(new THREE.ConeGeometry(0.06, 0.16, 4), '#4fb33f', [0.12, H.y + 0.64, H.z - 0.04], [0, 0, -0.6], [1, 1, 0.3], 'leaf');
      break;
    }
    case 'lulu': {
      // axolotl: wide smiley head with three feathery gills each side
      const skin = '#ffb3d1';
      B.mat = 'skin';
      torso(suit, '#ffd6e8');
      armL(skin);
      B.add(sphere(0.44), skin, [H.x, H.y - 0.04, H.z], [0, 0, 0], [1.28, 0.86, 1]);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const a = 0.5 - k * 0.5;
          B.add(capsule(0.05, 0.3, 3, 8), '#ff4f9a', [s * (0.52 + k * 0.02), H.y + 0.1 + a * 0.22, H.z - 0.06], [0, 0, -s * (0.9 + a)], 1, 'skin');
          B.add(sphere(0.07, 8, 6), '#ff7ab8', [s * (0.68 + k * 0.03), H.y + 0.2 + a * 0.3, H.z - 0.06], [0, 0, 0], [1, 0.7, 0.7]);
        }
        B.add(sphere(0.06, 8, 6), '#ff8fb0', [s * 0.32, H.y - 0.1, H.z + 0.33], [0, 0, 0], [1, 0.6, 0.6]);
      }
      eyes(B, 0, H.y + 0.06, H.z + 0.36, 0.25, 0.07);
      B.add(new THREE.TorusGeometry(0.16, 0.022, 4, 14, Math.PI), '#7a1f4a', [0, H.y - 0.06, H.z + 0.4], [0.15, 0, Math.PI]);
      break;
    }
    case 'bao': {
      // panda: white head, black ears and eye patches, a bamboo sprig
      const white = '#f6f4ee', black = '#24202c';
      torso(suit, white);
      armL(black);
      B.add(sphere(0.48), white, [H.x, H.y, H.z]);
      for (const s of [-1, 1]) {
        B.add(sphere(0.15, 10, 8), black, [s * 0.34, H.y + 0.36, H.z - 0.06]);
        B.add(sphere(0.12, 12, 8), black, [s * 0.17, H.y + 0.05, H.z + 0.37], [0, 0, s * 0.5], [0.9, 1.3, 0.6]);
        B.add(sphere(0.05, 8, 6), '#ffffff', [s * 0.16, H.y + 0.08, H.z + 0.45], [0, 0, 0], 1, 'gloss');
        B.add(sphere(0.03, 6, 4), '#1b1530', [s * 0.16, H.y + 0.08, H.z + 0.49], [0, 0, 0], 1, 'eye');
      }
      B.add(sphere(0.07, 10, 8), black, [0, H.y - 0.1, H.z + 0.46], [0, 0, 0], [1.3, 0.9, 0.8], 'gloss');
      B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), '#7ac74f', [0.2, H.y - 0.2, H.z + 0.42], [0, 0, 1.2], 1, 'leaf');
      B.add(new THREE.ConeGeometry(0.06, 0.18, 4), '#4fb33f', [0.46, H.y - 0.06, H.z + 0.42], [0, 0, -0.5], [1, 1, 0.3], 'leaf');
      break;
    }
    case 'hoot': {
      // owl: round feathered head, huge ringed eyes, ear tufts, little beak, scarf
      const feather = '#8a6a4a';
      torso(suit, '#e8d2b0');
      armL(feather);
      B.add(sphere(0.47), feather, [H.x, H.y, H.z], [0, 0, 0], [1.05, 1, 1]);
      B.add(sphere(0.38), '#d9b98a', [0, H.y - 0.02, H.z + 0.14], [0, 0, 0], [1.05, 0.9, 0.8]);
      for (const s of [-1, 1]) {
        B.add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20), '#ffd23f', [s * 0.17, H.y + 0.06, H.z + 0.44], [Math.PI / 2, 0, 0], 1, 'gloss');
        B.add(sphere(0.09, 12, 10), '#1b1530', [s * 0.17, H.y + 0.06, H.z + 0.47], [0, 0, 0], [1, 1, 0.5], 'eye');
        B.add(sphere(0.03, 6, 4), '#ffffff', [s * 0.17 + 0.03, H.y + 0.1, H.z + 0.51]);
        B.add(new THREE.ConeGeometry(0.08, 0.26, 4), feather, [s * 0.3, H.y + 0.46, H.z - 0.04], [0, 0.78, -s * 0.4]);
      }
      B.add(new THREE.ConeGeometry(0.06, 0.16, 6), '#ff9a1f', [0, H.y - 0.1, H.z + 0.5], [Math.PI / 2 + 0.6, 0, 0], 1, 'plastic');
      B.add(new THREE.TorusGeometry(0.3, 0.08, 8, 20), '#ffd23f', [0, H.y - 0.42, H.z + 0.02], [Math.PI / 2, 0, 0], 1, 'fabric');
      break;
    }
    case 'bandit': {
      // raccoon: grey head, black mask, white muzzle, pointy ears and a striped tail
      const fur = '#8a8f9f';
      torso(suit, '#c9ccd6');
      armL(fur);
      B.add(sphere(0.45), fur, [H.x, H.y, H.z]);
      B.add(sphere(0.2), '#f2f2f2', [0, H.y - 0.12, H.z + 0.36], [0, 0, 0], [1.2, 0.8, 1]);
      B.add(sphere(0.06, 10, 8), '#1b1530', [0, H.y - 0.06, H.z + 0.56], [0, 0, 0], 1, 'gloss');
      B.add(new THREE.BoxGeometry(0.64, 0.16, 0.2), '#24202c', [0, H.y + 0.08, H.z + 0.33], [0, 0, 0], [1, 1, 1], 'fur');
      eyes(B, 0, H.y + 0.08, H.z + 0.43, 0.15, 0.07);
      for (const s of [-1, 1]) {
        B.add(new THREE.ConeGeometry(0.14, 0.3, 4), fur, [s * 0.27, H.y + 0.4, H.z - 0.04], [0, 0.78, -s * 0.3]);
        B.add(new THREE.ConeGeometry(0.07, 0.14, 4), '#24202c', [s * 0.3, H.y + 0.49, H.z - 0.02], [0, 0.78, -s * 0.3]);
      }
      for (let k = 0; k < 5; k++) B.add(sphere(0.13 - k * 0.012, 10, 8), k % 2 ? '#24202c' : fur, [0.18, 1.2 + k * 0.13, -0.66 - k * 0.07], [0, 0, 0], [1, 0.8, 1]);
      break;
    }
    case 'fizz': {
      // bee: striped body, round yellow head, antennae and see-through wings
      const yellow = '#ffc21f', black = '#24202c';
      torso(yellow);
      for (const y of [0.92, 1.12]) B.add(new THREE.TorusGeometry(0.33, 0.06, 6, 20), black, [0, y, -0.28], [Math.PI / 2, 0, 0], [1, 1, 1], 'fabric');
      armL(black);
      B.add(sphere(0.44), yellow, [H.x, H.y, H.z]);
      googlyEyes(B, 0, H.y + 0.08, H.z + 0.32, 0.17, 0.13);
      B.add(new THREE.TorusGeometry(0.12, 0.02, 4, 12, Math.PI), black, [0, H.y - 0.16, H.z + 0.4], [0.2, 0, Math.PI]);
      for (const s of [-1, 1]) {
        B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 5), black, [s * 0.15, H.y + 0.56, H.z - 0.02], [0, 0, -s * 0.35]);
        B.add(sphere(0.07, 10, 8), black, [s * 0.22, H.y + 0.74, H.z - 0.02], [0, 0, 0], 1, 'gloss');
        B.add(sphere(0.32, 14, 10), '#e8f7ff', [s * 0.4, 1.38, -0.62], [0.3, s * 0.4, -s * 0.5], [0.45, 1, 0.12], [0.1, 0, 0.3]);
      }
      break;
    }
    case 'ollie': {
      // octopus: big spotty dome head with goggles and curling arms round the seat
      const skin = '#ff6f61';
      B.mat = 'skin';
      torso(skin, '#ffb3a8');
      armL(skin);
      B.add(sphere(0.5), skin, [H.x, H.y + 0.1, H.z - 0.06], [0, 0, 0], [1, 1.22, 1.05]);
      for (const [x, y, z, r] of [[0.2, 0.42, 0.25, 0.07], [-0.24, 0.3, 0.3, 0.06], [0.05, 0.6, 0.1, 0.05], [-0.1, 0.5, 0.28, 0.045]]) B.add(sphere(r, 8, 6), '#ffb3a8', [x, H.y + y, H.z + z]);
      googlyEyes(B, 0, H.y - 0.02, H.z + 0.4, 0.16, 0.12);
      B.add(new THREE.TorusGeometry(0.43, 0.04, 6, 24), '#39f5ff', [0, H.y + 0.06, H.z], [Math.PI / 2 - 0.1, 0, 0], 1, 'plastic');
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        B.add(capsule(0.07, 0.42, 3, 8), skin, [Math.cos(a) * 0.42, 0.84, -0.3 + Math.sin(a) * 0.36], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]);
      }
      break;
    }
    case 'gus': {
      // walrus: big whiskery face, two long tusks, a captain's cap
      const skin = '#9a7a6a';
      B.mat = 'skin';
      torso(suit, '#c9a890');
      armL(skin);
      B.add(sphere(0.5), skin, [H.x, H.y, H.z], [0, 0, 0], [1.1, 1, 1]);
      B.add(sphere(0.2), '#b8957f', [-0.12, H.y - 0.14, H.z + 0.42], [0, 0, 0], [1, 0.8, 0.8]);
      B.add(sphere(0.2), '#b8957f', [0.12, H.y - 0.14, H.z + 0.42], [0, 0, 0], [1, 0.8, 0.8]);
      B.add(sphere(0.07, 10, 8), '#1b1530', [0, H.y - 0.02, H.z + 0.52], [0, 0, 0], [1.3, 0.8, 0.8], 'gloss');
      for (const s of [-1, 1]) {
        B.add(new THREE.ConeGeometry(0.05, 0.42, 8), '#fffbe8', [s * 0.12, H.y - 0.42, H.z + 0.48], [Math.PI, 0, s * 0.1], 1, 'gloss');
        for (let k = 0; k < 3; k++) B.add(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 3), '#3a2a22', [s * 0.3, H.y - 0.14 + k * 0.05, H.z + 0.48], [0, 0, s * (1.4 + k * 0.1)]);
      }
      eyes(B, 0, H.y + 0.14, H.z + 0.42, 0.18, 0.06);
      // captain's cap
      B.add(new THREE.CylinderGeometry(0.36, 0.4, 0.2, 18), '#ffffff', [0, H.y + 0.46, H.z - 0.04], [0.1, 0, 0], 1, 'fabric');
      B.add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 18), '#1d2a4a', [0, H.y + 0.37, H.z], [0.1, 0, 0], 1, 'fabric');
      B.add(new THREE.BoxGeometry(0.36, 0.04, 0.2), '#1d2a4a', [0, H.y + 0.38, H.z + 0.42], [0.25, 0, 0], 1, 'plastic');
      B.add(sphere(0.06, 8, 6), '#ffd23f', [0, H.y + 0.48, H.z + 0.33], [0, 0, 0], 1, 'metal');
      break;
    }
    default:
      torso(suit);
      B.add(sphere(0.45), suit, [H.x, H.y, H.z]);
  }
  if (hat) addHat(B, ch, hat);
  return B.build();
}

export function driverGeometry(ch, lo = false, hat = null) {
  LOW = lo;
  try {
    return driver(ch, hat);
  } finally {
    LOW = false;
  }
}
