import * as THREE from 'three';

// Things to win from the gumball machine: hats for your racer, colours for
// your boost flames, and the horn you honk when you pass someone.

export const RARITY = {
  common: { name: 'Common', weight: 60, refund: 40, color: '#9ee7ff' },
  rare: { name: 'Rare', weight: 28, refund: 80, color: '#7dff9a' },
  epic: { name: 'Epic', weight: 10, refund: 150, color: '#c77dff' },
  legendary: { name: 'Legendary', weight: 2, refund: 300, color: '#ffd23f' },
};

export const CAPSULE_PRICE = 250;

const cone = (r, h, n = 16) => new THREE.ConeGeometry(r, h, n);
const cyl = (r0, r1, h, n = 20) => new THREE.CylinderGeometry(r0, r1, h, n);
const ball = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const dome = (r) => new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const ring = (r, t, n = 24) => new THREE.TorusGeometry(r, t, 8, n);

// Hats are built sitting on the origin (the top of the head), facing +z.
export const HATS = [
  { id: 'nohat', name: 'No hat', rarity: 'common', icon: '🙂', build: null },
  {
    id: 'party', name: 'Party Hat', rarity: 'common', icon: '🥳',
    build: (B) => {
      B.add(cone(0.2, 0.46), '#ff5a8a', [0, 0.2, 0], [-0.12, 0, 0], 1, 'fabric');
      B.add(ring(0.13, 0.025, 16), '#ffd23f', [0, 0.1, -0.012], [Math.PI / 2 - 0.12, 0, 0], 1, 'fabric');
      B.add(ball(0.07), '#fff3a0', [0, 0.44, -0.05], [0, 0, 0], 1, 'fabric');
    },
  },
  {
    id: 'beanie', name: 'Cosy Beanie', rarity: 'common', icon: '🧶',
    build: (B) => {
      B.add(dome(0.4), '#36a9ff', [0, -0.12, 0], [0, 0, 0], [1, 0.95, 1], 'fabric');
      B.add(cyl(0.41, 0.41, 0.12), '#ffffff', [0, -0.08, 0], [0, 0, 0], 1, 'fabric');
      B.add(ball(0.11), '#ffffff', [0, 0.28, 0], [0, 0, 0], 1, 'fabric');
    },
  },
  {
    id: 'cap', name: 'Racing Cap', rarity: 'common', icon: '🧢',
    build: (B) => {
      B.add(dome(0.38), '#ff3d3d', [0, -0.1, 0], [0, 0, 0], [1, 0.85, 1], 'fabric');
      B.add(cyl(0.26, 0.26, 0.03), '#ff3d3d', [0, -0.08, 0.32], [0, 0, 0], [1, 1, 0.9], 'fabric');
      B.add(ball(0.05), '#ffffff', [0, 0.22, 0], [0, 0, 0], 1, 'fabric');
    },
  },
  {
    id: 'cone', name: 'Traffic Cone', rarity: 'common', icon: '🚧',
    build: (B) => {
      B.add(new THREE.BoxGeometry(0.5, 0.05, 0.5), '#ff7a1a', [0, -0.02, 0], [0, 0, 0], 1, 'plastic');
      B.add(cone(0.19, 0.55), '#ff7a1a', [0, 0.28, 0], [0, 0, 0], 1, 'plastic');
      B.add(cyl(0.12, 0.15, 0.1), '#ffffff', [0, 0.26, 0], [0, 0, 0], 1, 'plastic');
    },
  },
  {
    id: 'bow', name: 'Big Bow', rarity: 'common', icon: '🎀',
    build: (B) => {
      for (const s of [-1, 1]) B.add(ball(0.17), '#ff6fa8', [s * 0.17, 0.08, 0], [0, 0, s * 0.5], [1.2, 0.8, 0.45], 'fabric');
      B.add(ball(0.08), '#ff3d8a', [0, 0.08, 0.02], [0, 0, 0], 1, 'fabric');
    },
  },
  {
    id: 'cowboy', name: 'Cowboy Hat', rarity: 'rare', icon: '🤠',
    build: (B) => {
      B.add(cyl(0.58, 0.58, 0.04, 28), '#9a5b2a', [0, 0.02, 0], [0, 0, 0], [1, 1, 0.85], 'fabric');
      B.add(ring(0.52, 0.05, 28), '#9a5b2a', [0, 0.06, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1], 'fabric');
      B.add(cyl(0.26, 0.3, 0.3), '#a8683a', [0, 0.18, 0], [0, 0, 0], [1, 1, 0.85], 'fabric');
      B.add(cyl(0.305, 0.305, 0.07), '#3a2418', [0, 0.08, 0], [0, 0, 0], [1, 1, 0.85], 'fabric');
    },
  },
  {
    id: 'chef', name: 'Chef Hat', rarity: 'rare', icon: '👨‍🍳',
    build: (B) => {
      B.add(cyl(0.3, 0.28, 0.3), '#ffffff', [0, 0.1, 0], [0, 0, 0], 1, 'fabric');
      for (const [x, z] of [[0, 0], [0.16, 0.06], [-0.16, 0.06], [0.08, -0.14], [-0.1, -0.12]]) B.add(ball(0.2), '#ffffff', [x, 0.34, z], [0, 0, 0], 1, 'fabric');
    },
  },
  {
    id: 'tophat', name: 'Top Hat', rarity: 'rare', icon: '🎩',
    build: (B) => {
      B.add(cyl(0.44, 0.44, 0.04, 28), '#1d1a22', [0, 0.02, 0], [0, 0, 0], 1, 'plastic');
      B.add(cyl(0.27, 0.27, 0.5, 24), '#1d1a22', [0, 0.27, 0], [0, 0, 0], 1, 'plastic');
      B.add(cyl(0.275, 0.275, 0.09, 24), '#e8303a', [0, 0.1, 0], [0, 0, 0], 1, 'fabric');
    },
  },
  {
    id: 'flowers', name: 'Flower Crown', rarity: 'rare', icon: '🌸',
    build: (B) => {
      B.add(ring(0.36, 0.035, 28), '#3fbf5a', [0, 0, 0], [Math.PI / 2, 0, 0], 1, 'fabric');
      const cols = ['#ff6fa8', '#ffd23f', '#ffffff', '#c77dff', '#ff8a3a', '#6fd8ff'];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        B.add(ball(0.09), cols[i % cols.length], [Math.sin(a) * 0.36, 0.04, Math.cos(a) * 0.36], [0, 0, 0], [1, 0.6, 1], 'fabric');
        B.add(ball(0.035), '#ffd23f', [Math.sin(a) * 0.38, 0.08, Math.cos(a) * 0.38], [0, 0, 0], 1, 'fabric');
      }
    },
  },
  {
    id: 'bunny', name: 'Bunny Ears', rarity: 'rare', icon: '🐰',
    build: (B) => {
      B.add(ring(0.34, 0.03, 24), '#ff6fa8', [0, -0.02, 0], [0, 0, 0], [1, 1, 1], 'plastic');
      for (const s of [-1, 1]) {
        B.add(new THREE.CapsuleGeometry(0.08, 0.42, 4, 10), '#ffffff', [s * 0.14, 0.3, -0.02], [0, 0, -s * 0.18], [1, 1, 0.55], 'fabric');
        B.add(new THREE.CapsuleGeometry(0.04, 0.34, 4, 8), '#ffb3d1', [s * 0.14, 0.3, 0.02], [0, 0, -s * 0.18], [1, 1, 0.4], 'fabric');
      }
    },
  },
  {
    id: 'viking', name: 'Viking Helmet', rarity: 'epic', icon: '🪓',
    build: (B) => {
      B.add(dome(0.42), '#aab6c8', [0, -0.14, 0], [0, 0, 0], 1, 'metal');
      B.add(cyl(0.43, 0.43, 0.08), '#ffd23f', [0, -0.1, 0], [0, 0, 0], 1, 'metal');
      B.add(cyl(0.04, 0.04, 0.84), '#ffd23f', [0, 0.1, 0], [Math.PI / 2, 0, 0], [1, 1, 0.9], 'metal');
      for (const s of [-1, 1]) {
        B.add(cone(0.09, 0.34, 12), '#fff3dc', [s * 0.44, 0.1, 0], [0, 0, -s * 1.0], 1, 'gloss');
        B.add(cone(0.07, 0.22, 12), '#fff3dc', [s * 0.56, 0.3, 0], [0, 0, -s * 0.2], 1, 'gloss');
      }
    },
  },
  {
    id: 'witch', name: 'Witch Hat', rarity: 'epic', icon: '🧙',
    build: (B) => {
      B.add(cyl(0.56, 0.56, 0.035, 28), '#3a2a5a', [0, 0.02, 0], [0, 0, 0], 1, 'fabric');
      B.add(cyl(0.18, 0.3, 0.36), '#3a2a5a', [0, 0.2, 0], [0, 0, 0], 1, 'fabric');
      B.add(cone(0.18, 0.4), '#3a2a5a', [0, 0.52, -0.08], [-0.45, 0, 0], 1, 'fabric');
      B.add(cyl(0.305, 0.305, 0.07), '#8f5cff', [0, 0.06, 0], [0, 0, 0], 1, 'fabric');
      B.add(new THREE.BoxGeometry(0.12, 0.1, 0.03), '#ffd23f', [0, 0.06, 0.3], [0, 0, 0], 1, 'metal');
    },
  },
  {
    id: 'propeller', name: 'Propeller Cap', rarity: 'epic', icon: '🚁',
    build: (B) => {
      const cols = ['#ff3d3d', '#ffd23f', '#36a9ff', '#35b85c'];
      for (let i = 0; i < 4; i++) B.add(new THREE.SphereGeometry(0.38, 8, 8, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2), cols[i], [0, -0.1, 0], [0, 0, 0], [1, 0.8, 1], 'plastic');
      B.add(cyl(0.025, 0.025, 0.22, 8), '#e6e9ef', [0, 0.28, 0], [0, 0, 0], 1, 'metal');
      B.add(new THREE.BoxGeometry(0.62, 0.02, 0.09), '#ff3d3d', [0, 0.39, 0], [0, 0.4, 0.12], 1, 'plastic');
      B.add(new THREE.BoxGeometry(0.62, 0.02, 0.09), '#36a9ff', [0, 0.39, 0], [0, 0.4 + Math.PI / 2, -0.12], 1, 'plastic');
      B.add(ball(0.04), '#ffd23f', [0, 0.4, 0], [0, 0, 0], 1, 'metal');
    },
  },
  {
    id: 'pirate', name: 'Pirate Hat', rarity: 'epic', icon: '🏴‍☠️',
    build: (B) => {
      B.add(dome(0.34), '#1d1a22', [0, -0.08, 0], [0, 0, 0], [1, 0.8, 1], 'fabric');
      B.add(new THREE.CylinderGeometry(0.55, 0.55, 0.26, 3), '#1d1a22', [0, 0.12, 0], [0, Math.PI, 0], [1, 1, 0.8], 'fabric');
      B.add(ball(0.08), '#ffffff', [0, 0.16, 0.3], [0, 0, 0], [1, 1, 0.5], 'fabric');
      B.add(new THREE.BoxGeometry(0.2, 0.03, 0.02), '#ffffff', [0, 0.08, 0.32], [0, 0, 0.6], 1, 'fabric');
      B.add(new THREE.BoxGeometry(0.2, 0.03, 0.02), '#ffffff', [0, 0.08, 0.32], [0, 0, -0.6], 1, 'fabric');
      B.add(ring(0.47, 0.02, 3), '#ffd23f', [0, 0.25, 0], [Math.PI / 2, 0, Math.PI / 2], [1, 0.8, 1], 'metal');
    },
  },
  {
    id: 'halo', name: 'Halo', rarity: 'epic', icon: '😇',
    build: (B) => {
      B.add(ring(0.3, 0.045, 32), '#fff3a0', [0, 0.28, 0], [Math.PI / 2, 0, 0], 1, 'glowHot');
    },
  },
  {
    id: 'crown', name: 'Golden Crown', rarity: 'legendary', icon: '👑',
    build: (B) => {
      B.add(cyl(0.3, 0.27, 0.2, 24), '#ffd23f', [0, 0.06, 0], [0, 0, 0], 1, 'metal');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        B.add(cone(0.07, 0.2, 8), '#ffd23f', [Math.sin(a) * 0.28, 0.25, Math.cos(a) * 0.28], [0, 0, 0], 1, 'metal');
        B.add(ball(0.04), '#fff3a0', [Math.sin(a) * 0.28, 0.36, Math.cos(a) * 0.28], [0, 0, 0], 1, 'metal');
      }
      const gems = ['#ff3d6a', '#36a9ff', '#35b85c', '#c77dff'];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        B.add(ball(0.05), gems[i], [Math.sin(a) * 0.3, 0.07, Math.cos(a) * 0.3], [0, 0, 0], [1, 1, 0.5], 'gloss');
      }
    },
  },
  {
    id: 'unicorn', name: 'Unicorn Horn', rarity: 'legendary', icon: '🦄',
    build: (B) => {
      B.add(ring(0.34, 0.03, 24), '#ffffff', [0, -0.02, 0], [0, 0, 0], 1, 'plastic');
      const cols = ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'];
      for (let i = 0; i < 5; i++) B.add(cyl(0.1 - i * 0.018, 0.12 - i * 0.018, 0.1, 12), cols[i], [0, 0.05 + i * 0.09, 0.2], [0.35, 0, 0], 1, 'glow');
      B.add(cone(0.035, 0.12, 10), '#ffffff', [0, 0.52, 0.34], [0.35, 0, 0], 1, 'glowHot');
      for (const s of [-1, 1]) B.add(cone(0.08, 0.16, 6), '#ffffff', [s * 0.3, 0.08, -0.05], [0, 0, -s * 0.5], 1, 'fabric');
    },
  },
];

// Boost flame colours, and the sparkles left behind while boosting.
export const TRAILS = [
  { id: 'classic', name: 'Classic Flames', rarity: 'common', icon: '🔥', cols: ['#fff3a0', '#ffb020', '#ff6a1f'] },
  { id: 'frost', name: 'Frost Jet', rarity: 'common', icon: '❄️', cols: ['#e8fbff', '#7fd8ff', '#2f7bff'], spark: '#bff3ff' },
  { id: 'toxic', name: 'Toxic Fumes', rarity: 'common', icon: '🧪', cols: ['#eaffb0', '#9dff3a', '#2fcf4f'], spark: '#caff6a' },
  { id: 'sakura', name: 'Sakura Puff', rarity: 'common', icon: '🌸', cols: ['#fff0f6', '#ffb3d1', '#ff6fa8'], spark: '#ffd0e4' },
  { id: 'plasma', name: 'Plasma', rarity: 'rare', icon: '🟣', cols: ['#f3e0ff', '#c77dff', '#7a3cff'], spark: '#d9a8ff' },
  { id: 'gold', name: 'Gold Rush', rarity: 'rare', icon: '🪙', cols: ['#fffbe0', '#ffd23f', '#ffb020'], spark: '#ffe680' },
  { id: 'neon', name: 'Neon Nights', rarity: 'rare', icon: '💡', cols: ['#e0fffd', '#39f5ff', '#ff3dc8'], spark: '#ff8ae0' },
  { id: 'inferno', name: 'Inferno', rarity: 'epic', icon: '🌋', cols: ['#ffffff', '#ff3d3d', '#b01010', '#ffb020'], spark: '#ff5a1a', big: 1.35 },
  { id: 'galaxy', name: 'Galaxy', rarity: 'epic', icon: '🌌', cols: ['#ffffff', '#8f5cff', '#36a9ff', '#ff5ad8'], spark: '#ffffff' },
  { id: 'rainbow', name: 'Rainbow Road', rarity: 'legendary', icon: '🌈', cols: ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'], spark: 'rainbow', big: 1.25 },
];

// Honked when you overtake someone and when you cross the line.
export const HORNS = [
  { id: 'beep', name: 'Beep Beep', rarity: 'common', icon: '📢' },
  { id: 'duck', name: 'Rubber Duck', rarity: 'common', icon: '🦆' },
  { id: 'clown', name: 'Clown Honk', rarity: 'common', icon: '🤡' },
  { id: 'kazoo', name: 'Kazoo', rarity: 'common', icon: '🎶' },
  { id: 'meow', name: 'Meow', rarity: 'rare', icon: '🐱' },
  { id: 'laser', name: 'Laser Zap', rarity: 'rare', icon: '⚡' },
  { id: 'train', name: 'Choo Choo', rarity: 'rare', icon: '🚂' },
  { id: 'airhorn', name: 'Air Horn', rarity: 'epic', icon: '📯' },
  { id: 'fanfare', name: 'Fanfare', rarity: 'epic', icon: '🎺' },
  { id: 'dino', name: 'Dino Roar', rarity: 'legendary', icon: '🦖' },
];

export const KINDS = [
  { id: 'hat', name: 'Hats', list: HATS, slot: 'hat', def: 'nohat' },
  { id: 'trail', name: 'Trails', list: TRAILS, slot: 'trail', def: 'classic' },
  { id: 'horn', name: 'Horns', list: HORNS, slot: 'horn', def: 'beep' },
];

const ALL = KINDS.flatMap((k) => k.list.map((it) => ({ ...it, kind: k.id })));

export const hatById = (id) => HATS.find((h) => h.id === id) || HATS[0];
export const trailById = (id) => TRAILS.find((t) => t.id === id) || TRAILS[0];
export const hornById = (id) => HORNS.find((h) => h.id === id) || HORNS[0];
export const cosmeticById = (id) => ALL.find((it) => it.id === id) || null;

// Everything the player starts with.
export const STARTER = ['nohat', 'classic', 'beep'];

// Where a hat sits on each racer's head (driver model space).
const ANCHOR = {
  mochi: [2.04, -0.24, 1], pip: [2.08, -0.22, 1], bruno: [2.1, -0.22, 1.08], rexi: [1.98, -0.28, 0.95],
  volt: [1.95, -0.22, 1.05], ember: [2.04, -0.24, 1], zorp: [2.2, -0.22, 1.05], hopper: [2.03, -0.26, 1.08],
};

// Add a hat to a racer's driver model.
export function addHat(B, ch, hatId) {
  const hat = hatById(hatId);
  if (!hat.build) return;
  const [y, z, s] = ANCHOR[ch.id] || [2.05, -0.22, 1];
  const H = { parts: [], mat: B.mat, add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, mat = null) {
    // Scale and move the hat part onto the head.
    const sc = Array.isArray(scale) ? scale.map((v) => v * s) : scale * s;
    B.add(geo, color, [pos[0] * s, y + pos[1] * s, z + pos[2] * s], rot, sc, mat);
    return this;
  } };
  hat.build(H);
}

// Validate a look sent by another phone.
export function cleanLook(l) {
  if (!l || typeof l !== 'object') return null;
  return { hat: hatById(l.hat).id, trail: trailById(l.trail).id, horn: hornById(l.horn).id };
}

export function lookOf(c) {
  return { hat: hatById(c.hat).id, trail: trailById(c.trail).id, horn: hornById(c.horn).id };
}

export function owns(c, id) {
  return STARTER.includes(id) || (c.cos || []).includes(id);
}

export function ownedCount(c) {
  return ALL.filter((it) => !STARTER.includes(it.id) && owns(c, it.id)).length;
}

export const COSMETIC_TOTAL = ALL.length - STARTER.length;

// One turn of the gumball machine. Costs a free capsule if you have one,
// otherwise CAPSULE_PRICE coins. Duplicates pay back coins.
export function spinGumball(c, rnd = Math.random) {
  const free = (c.freeCaps || 0) > 0;
  if (!free && c.coins < CAPSULE_PRICE) return null;
  if (free) c.freeCaps--;
  else c.coins -= CAPSULE_PRICE;
  const pool = ALL.filter((it) => !STARTER.includes(it.id));
  let r = rnd() * Object.values(RARITY).reduce((a, b) => a + b.weight, 0);
  let rarity = 'common';
  for (const [k, v] of Object.entries(RARITY)) {
    if ((r -= v.weight) < 0) { rarity = k; break; }
  }
  // Prefer something new within the rolled rarity, but duplicates can happen.
  const tier = pool.filter((it) => it.rarity === rarity);
  const fresh = tier.filter((it) => !owns(c, it.id));
  const list = fresh.length && rnd() < 0.7 ? fresh : tier;
  const item = list[Math.floor(rnd() * list.length)];
  const dup = owns(c, item.id);
  let refund = 0;
  if (dup) {
    refund = RARITY[item.rarity].refund;
    c.coins += refund;
  } else {
    c.cos = c.cos || [];
    c.cos.push(item.id);
  }
  c.stats = c.stats || {};
  c.stats.capsules = (c.stats.capsules || 0) + 1;
  return { item, dup, refund, free };
}
