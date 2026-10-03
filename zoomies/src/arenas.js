// Balloon Battle arenas. The engine's roads are corridors along a closed
// spline, so an arena is a ring road as wide as its own radius: an open bowl
// you can drive across in any direction, round a central island.

// Control points for a ring of radius R (x, z, height). `sx`/`sz` stretch it
// into an oval; `hills` rolls the floor up and down `waves` times round it.
function ring(R, { n = 28, sx = 1, sz = 1, hills = 0, waves = 2, base = 0.5 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * R * sx, Math.sin(a) * R * sz, base + hills * (0.5 + 0.5 * Math.sin(a * waves))]);
  }
  return pts;
}

export const ARENAS = [
  {
    id: 'barnyard', arena: true, name: 'Barnyard Bowl', theme: 'meadow',
    blurb: 'A grassy bowl round the old hay barn. Hay bales roll across.',
    music: { key: 2, bpm: 146, seed: 211, scale: 'major' },
    points: ring(46, { hills: 1.6 }), width: 56, shoulder: 2.5, wallH: 1.6,
    items: [0, 0.167, 0.333, 0.5, 0.667, 0.833],
    boosts: [{ at: 0.083, d: -10 }, { at: 0.417, d: 10 }, { at: 0.75, d: -10 }],
    patches: [{ at: 0.25, len: 16, d: 8, w: 10, type: 'mud' }, { at: 0.58, len: 16, d: -12, w: 10, type: 'mud' }],
    obstacles: [{ at: 0.3, type: 'hay', amp: 22, speed: 0.5 }, { at: 0.8, type: 'hay', amp: 22, speed: 0.6 }],
  },
  {
    id: 'snowglobe', arena: true, name: 'Snowglobe Rink', theme: 'frost',
    blurb: 'A frozen rink inside a snowglobe. Everything slides!',
    music: { key: 1, bpm: 136, seed: 223, scale: 'minor' },
    points: ring(42), width: 52, shoulder: 2.5, wallH: 1.6,
    grip: 0.55, traction: 0.8,
    items: [0.083, 0.25, 0.417, 0.583, 0.75, 0.917],
    patches: [{ at: 0.12, len: 26, d: -6, w: 14, type: 'ice' }, { at: 0.45, len: 24, d: 10, w: 12, type: 'ice' }, { at: 0.78, len: 26, d: -14, w: 12, type: 'ice' }],
    obstacles: [{ at: 0.2, type: 'snowball', amp: 20, speed: 0.45 }, { at: 0.7, type: 'snowball', amp: 20, speed: 0.55 },
      { at: 0.45, type: 'penguin', amp: 18, speed: 0.7 }, { at: 0.95, type: 'penguin', amp: 18, speed: 0.8 }],
  },
  {
    id: 'pinball', arena: true, name: 'Neon Pinball', theme: 'neon',
    blurb: 'A long neon oval with boost strips and laser sweepers.',
    music: { key: 7, bpm: 152, seed: 239, scale: 'minor' },
    points: ring(46, { sx: 1.22, sz: 0.92, n: 32 }), width: 50, shoulder: 2.5, wallH: 1.6,
    items: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875],
    boosts: [{ at: 0.06, d: -14 }, { at: 0.19, d: 12 }, { at: 0.31, d: -14 }, { at: 0.44, d: 12 }, { at: 0.56, d: -14 }, { at: 0.69, d: 12 }, { at: 0.81, d: -14 }, { at: 0.94, d: 12 }],
    obstacles: [{ at: 0.25, type: 'laser', amp: 20, speed: 0.7 }, { at: 0.75, type: 'laser', amp: 20, speed: 0.8 }],
  },
  {
    id: 'sandcastle', arena: true, name: 'Sandcastle Cove', theme: 'beach',
    blurb: 'Rolling dunes round a palm island. Mind the crabs.',
    music: { key: 9, bpm: 142, seed: 251, scale: 'major' },
    points: ring(50, { hills: 2.4, waves: 3 }), width: 60, shoulder: 2.5, wallH: 1.6,
    items: [0.04, 0.2, 0.37, 0.54, 0.7, 0.87],
    boosts: [{ at: 0.12, d: 0 }, { at: 0.45, d: -12 }, { at: 0.79, d: 12 }],
    patches: [{ at: 0.28, len: 18, d: -10, w: 12, type: 'sand' }, { at: 0.62, len: 18, d: 12, w: 12, type: 'sand' }, { at: 0.95, len: 16, d: -16, w: 10, type: 'sand' }],
    obstacles: [{ at: 0.15, type: 'crab', amp: 24, speed: 0.6 }, { at: 0.48, type: 'crab', amp: 24, speed: 0.7 }, { at: 0.82, type: 'crab', amp: 24, speed: 0.65 }],
  },
  {
    id: 'crater', arena: true, name: 'Moon Crater', theme: 'moon',
    blurb: 'Low gravity and big bumps: every hill is a jump.',
    music: { key: 4, bpm: 128, seed: 263, scale: 'minor' },
    points: ring(48, { hills: 3.6, waves: 4, n: 32 }), width: 56, shoulder: 2.5, wallH: 1.6,
    gravity: 0.55,
    items: [0, 0.167, 0.333, 0.5, 0.667, 0.833],
    boosts: [{ at: 0.1, d: -8 }, { at: 0.35, d: 8 }, { at: 0.6, d: -8 }, { at: 0.85, d: 8 }],
    obstacles: [{ at: 0.25, type: 'rover', amp: 22, speed: 0.5 }, { at: 0.75, type: 'rover', amp: 22, speed: 0.55 }],
  },
];

export const arenaById = (id) => ARENAS.find((a) => a.id === id) || null;
