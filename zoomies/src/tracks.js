// Track layouts. Points are [x, z, height, widthMultiplier]. Feature positions
// are fractions of a lap (0 = start line); lateral offsets are metres (+ = right).
// Shortcuts leave the main road through a gap in the wall on `side` at `from`
// and rejoin at `to`; `pts` are [lapFraction, lateralOffset, height?] waypoints.

export const TRACKS = [
  {
    id: 'sprout', name: 'Sprout Speedway', size: 'Short', theme: 'meadow',
    blurb: 'Rolling meadows, a windmill and one big hill jump.',
    music: { key: 0, bpm: 138, seed: 11, scale: 'major' },
    points: [
      [0, -120, 0], [0, -20, 0], [8, 62, 0, 1.15], [48, 124, 2], [112, 148, 7], [172, 124, 7.5, 0.85],
      [208, 62, 2], [192, -6, 0], [140, -34, 0, 1.2], [124, -92, 0], [164, -148, 0, 0.9],
      [150, -210, 0], [92, -238, 0, 1.2], [34, -210, 0],
    ],
    items: [0.1, 0.46, 0.77],
    boosts: [{ at: 0.29, d: 0 }, { at: 0.62, d: -3 }, { at: 0.94, d: 3 }],
    ramps: [{ at: 0.335, len: 8, h: 1.9 }],
    gems: [{ at: 0.04, d: -4, n: 5 }, { at: 0.2, d: 4, n: 5 }, { at: 0.55, d: 0, n: 6 }, { at: 0.86, d: -3, n: 5 }],
    obstacles: [{ at: 0.7, type: 'hay', amp: 6, speed: 0.9 }, { at: 0.13, type: 'hay', amp: 6, speed: 0.7 }],
    lakes: [{ x: 58, z: -168, rx: 24, rz: 30 }],
    shortcuts: [
      { name: 'Barn Lane', from: 0.195, to: 0.5, side: 1, surface: 'dirt', width: 10, deco: 'barn', crates: true,
        wpts: [[42, 70], [82, 64], [122, 50], [160, 44], [186, 30]], gems: [{ at: 0.22, n: 5 }], obstacles: [{ at: 0.7, type: 'hay', amp: 3, speed: 1.1 }] },
    ],
  },
  {
    id: 'coral', name: 'Coral Cove', size: 'Short', theme: 'beach',
    blurb: 'Palm-lined beach laps with a sneaky sandbar.',
    music: { key: 4, bpm: 142, seed: 71, scale: 'major' },
    points: [
      [0, -110, 0], [0, -10, 0, 1.1], [4, 70, 0], [-26, 132, 0, 0.9], [-90, 150, 0], [-160, 132, 0, 1.15],
      [-214, 92, 0], [-236, 26, 0, 0.9], [-204, -34, 0], [-146, -64, 0, 1.2], [-104, -110, 0], [-74, -170, 0, 0.9],
      [-40, -204, 0], [-4, -196, 0],
    ],
    items: [0.1, 0.45, 0.78],
    boosts: [{ at: 0.26, d: 0 }, { at: 0.7, d: 3 }],
    ramps: [],
    gems: [{ at: 0.05, d: 3, n: 5 }, { at: 0.35, d: -3, n: 5 }, { at: 0.6, d: 0, n: 5 }, { at: 0.88, d: 2, n: 5 }],
    obstacles: [{ at: 0.4, type: 'crab', amp: 7, speed: 1.1 }, { at: 0.83, type: 'crab', amp: 6, speed: 1.3 }],
    lakes: [{ x: -110, z: 16, rx: 70, rz: 50 }],
    shortcuts: [
      { name: 'Sandbar', from: 0.15, to: 0.665, side: -1, surface: 'offroad', width: 11, deco: 'palms', crates: true,
        wpts: [[-30, 24], [-70, 16], [-110, 22], [-150, 14], [-186, -2]], boosts: [{ at: 0.45 }], gems: [{ at: 0.2, n: 5 }, { at: 0.72, n: 4 }] },
    ],
  },
  {
    id: 'dunes', name: 'Dune Dash Canyon', size: 'Medium', theme: 'desert', scale: 1.18,
    blurb: 'Blazing sand, a tight canyon and a secret cave.',
    music: { key: 2, bpm: 146, seed: 23, scale: 'dorian' },
    points: [
      [0, -170, 0], [0, -60, 0, 1.1], [14, 44, 0], [70, 108, 0], [158, 118, 3], [220, 62, 7, 0.8],
      [216, -30, 11, 0.7], [164, -92, 11, 0.75], [96, -106, 6], [64, -166, 2], [104, -236, 0, 1.2],
      [74, -310, 0], [-6, -330, 0, 1.15], [-60, -282, 0], [-46, -222, 0],
    ],
    items: [0.08, 0.42, 0.73],
    boosts: [{ at: 0.24, d: 3 }, { at: 0.58, d: -3 }, { at: 0.89, d: 0 }],
    ramps: [{ at: 0.5, len: 8, h: 2.0 }],
    gems: [{ at: 0.03, d: 3, n: 5 }, { at: 0.3, d: -3, n: 6 }, { at: 0.64, d: 2, n: 5 }, { at: 0.8, d: -2, n: 5 }],
    obstacles: [{ at: 0.66, type: 'tumbleweed', amp: 7, speed: 1.2 }, { at: 0.15, type: 'tumbleweed', amp: 7, speed: 0.9 }],
    shoulder: 6, wallH: 2.4,
    lakes: [{ x: 110, z: 20, rx: 30, rz: 24 }],
    shortcuts: [
      { name: 'Mesa Cave', from: 0.39, to: 0.57, side: 1, surface: 'road', width: 10, deco: 'cave',
        wpts: [[200, 28, 9], [180, -5, 9.5], [160, -38, 9.5], [140, -70, 9]], gems: [{ at: 0.35, n: 5 }] },
    ],
  },
  {
    id: 'frost', name: 'Frostbite Pass', size: 'Medium', theme: 'frost', scale: 1.28,
    blurb: 'Icy corners, pine forests and a frozen lake.',
    music: { key: 5, bpm: 132, seed: 37, scale: 'minor' },
    points: [
      [0, -140, 0], [0, -40, 0], [-16, 50, 2, 1.1], [-72, 106, 5], [-150, 98, 9, 0.85], [-190, 32, 10],
      [-160, -30, 8], [-100, -50, 5, 1.2], [-72, -104, 2], [-110, -166, 0, 0.9], [-72, -234, 0],
      [8, -246, 0, 1.15], [48, -196, 0],
    ],
    items: [0.1, 0.45, 0.78],
    boosts: [{ at: 0.28, d: 0 }, { at: 0.66, d: 3 }],
    ramps: [{ at: 0.43, len: 8, h: 1.8 }],
    gems: [{ at: 0.05, d: 0, n: 5 }, { at: 0.22, d: -3, n: 5 }, { at: 0.56, d: 3, n: 6 }, { at: 0.88, d: 0, n: 5 }],
    obstacles: [{ at: 0.34, type: 'snowball', amp: 6, speed: 1 }, { at: 0.72, type: 'penguin', amp: 7, speed: 0.8 }],
    grip: 0.72,
    lakes: [{ x: -80, z: 22, rx: 40, rz: 44 }],
    shortcuts: [
      { name: 'Ice Shelf', from: 0.33, to: 0.52, side: -1, surface: 'ice', width: 10, deco: 'iceArch', crates: true,
        wpts: [[-138, 82, 9], [-150, 55, 9.5], [-146, 28, 9.5], [-162, -4, 9]], gems: [{ at: 0.3, n: 5 }] },
    ],
  },
  {
    id: 'candy', name: 'Sweet Tooth Valley', size: 'Medium', theme: 'candy', scale: 1.22,
    blurb: 'Chocolate roads, gumdrop hills and ribbon-candy bends.',
    music: { key: 7, bpm: 150, seed: 91, scale: 'major' },
    points: [
      [0, -160, 0], [0, -60, 0], [30, 10, 1, 0.9], [4, 84, 3], [44, 150, 5, 1.1], [120, 158, 5], [160, 104, 3, 0.85],
      [140, 40, 1], [180, -10, 0, 1.2], [246, 0, 0], [276, -62, 2], [246, -136, 4, 0.9], [176, -156, 3],
      [118, -214, 0, 1.1], [44, -226, 0],
    ],
    items: [0.08, 0.38, 0.7],
    boosts: [{ at: 0.2, d: 0 }, { at: 0.52, d: -3 }, { at: 0.86, d: 3 }],
    ramps: [{ at: 0.3, len: 8, h: 1.8 }],
    gems: [{ at: 0.04, d: 0, n: 6 }, { at: 0.24, d: 3, n: 5 }, { at: 0.47, d: -3, n: 5 }, { at: 0.78, d: 0, n: 6 }],
    obstacles: [{ at: 0.13, type: 'gumball', amp: 6, speed: 1 }, { at: 0.62, type: 'gumball', amp: 7, speed: 1.3 }],
    lakes: [{ x: 88, z: 80, rx: 26, rz: 34 }],
    shortcuts: [
      { name: 'Gingerbread Lane', from: 0.625, to: 0.785, side: 1, surface: 'road', width: 10, deco: 'house', crates: true,
        wpts: [[240, -55], [222, -85], [205, -112], [192, -132]], gems: [{ at: 0.25, n: 5 }] },
    ],
  },
  {
    id: 'neon', laps: 2, name: 'Neon Nebula', size: 'Long', theme: 'neon', scale: 1.3,
    blurb: 'A glowing figure-eight skyway with a flyover.',
    music: { key: 7, bpm: 152, seed: 51, scale: 'minor' },
    points: [
      [0, -170, 0], [0, -70, 0, 1.1], [0, 30, 0], [6, 120, 0], [48, 190, 2], [128, 214, 5, 0.9], [200, 176, 8],
      [214, 100, 10], [160, 56, 11], [80, 36, 11, 1.1], [-10, 26, 11], [-100, 10, 10], [-176, -30, 8, 0.9],
      [-212, -104, 5], [-176, -176, 2], [-100, -212, 0, 1.15], [-30, -214, 0],
    ],
    items: [0.07, 0.36, 0.64, 0.86],
    boosts: [{ at: 0.18, d: -3 }, { at: 0.33, d: 3 }, { at: 0.52, d: 0 }, { at: 0.76, d: -3 }, { at: 0.95, d: 3 }],
    ramps: [{ at: 0.6, len: 8, h: 1.8 }],
    gems: [{ at: 0.04, d: 0, n: 6 }, { at: 0.25, d: 3, n: 5 }, { at: 0.47, d: -3, n: 5 }, { at: 0.72, d: 0, n: 6 }, { at: 0.9, d: 2, n: 5 }],
    obstacles: [{ at: 0.42, type: 'laser', amp: 7, speed: 1.2 }, { at: 0.8, type: 'laser', amp: 7, speed: 1 }],
    shortcuts: [
      { name: 'Hyperlane Leap', from: 0.3, to: 0.435, side: 1, surface: 'road', width: 9, deco: 'neonRings',
        wpts: [[120, 195, 5], [145, 175, 6.5], [168, 152, 8], [190, 132, 9.5]],
        ramps: [{ at: 0.3, len: 8, h: 2.4 }], voids: [{ at: 0.44, len: 0.13 }], boosts: [{ at: 0.72 }] },
    ],
  },
  {
    id: 'magma', laps: 2, name: 'Magma Mountain', size: 'Long', theme: 'volcano',
    blurb: 'Climb a smoking volcano, then bomb down its lava slopes.',
    music: { key: 9, bpm: 144, seed: 63, scale: 'minor' },
    points: [
      [0, -200, 0], [0, -90, 0, 1.1], [16, 10, 2], [70, 72, 6], [150, 90, 10, 0.85], [212, 50, 14], [206, -24, 17, 0.8],
      [146, -52, 20], [110, -110, 22, 0.8], [150, -170, 22], [232, -170, 19, 1.1], [300, -116, 15], [330, -30, 11],
      [312, 64, 7, 0.9], [340, 150, 4], [280, 214, 1, 1.2], [180, 214, 0], [120, 168, 0], [60, 192, 0], [-10, 180, 0, 0.9],
      [-70, 120, 0], [-80, 30, 0], [-70, -60, 0], [-94, -160, 0, 1.1], [-88, -246, 0], [-36, -284, 0], [22, -256, 0],
    ],
    items: [0.07, 0.3, 0.55, 0.8],
    boosts: [{ at: 0.2, d: 0 }, { at: 0.47, d: 3 }, { at: 0.66, d: -3 }, { at: 0.92, d: 0 }],
    ramps: [{ at: 0.43, len: 9, h: 2.2, glide: true }],
    gems: [{ at: 0.04, d: 0, n: 6 }, { at: 0.24, d: -3, n: 5 }, { at: 0.5, d: 3, n: 5 }, { at: 0.7, d: 0, n: 6 }, { at: 0.86, d: -2, n: 5 }],
    obstacles: [{ at: 0.36, type: 'fireball', amp: 6, speed: 1 }, { at: 0.58, type: 'fireball', amp: 6, speed: 1.3 }, { at: 0.75, type: 'boulder', amp: 7, speed: 0.8 }],
    shoulder: 6, wallH: 1.8,
    lakes: [{ x: 184, z: -104, rx: 22, rz: 14, lava: true }, { x: 205, z: 132, rx: 30, rz: 24, lava: true }],
    shortcuts: [
      { name: 'Crater Leap', from: 0.305, to: 0.4, side: -1, surface: 'road', width: 9, deco: 'lavaRocks',
        wpts: [[140, -105, 22], [172, -118, 21.5], [205, -128, 20], [232, -140, 18.5]],
        ramps: [{ at: 0.28, len: 8, h: 2.3 }], voids: [{ at: 0.4, len: 0.13 }], gems: [{ at: 0.7, n: 4 }] },
    ],
  },
  {
    id: 'cloud', laps: 2, name: 'Cloud Carnival', size: 'Long', theme: 'cloud', scale: 1.22,
    blurb: 'A floating fairground in the sky. Glide ramps included.',
    music: { key: 5, bpm: 148, seed: 83, scale: 'major' },
    points: [
      [0, -150, 4], [0, -50, 4, 1.1], [-20, 40, 4], [-90, 90, 5], [-180, 80, 6, 0.9], [-230, 10, 6], [-200, -70, 6],
      [-120, -90, 6], [-40, -30, 10], [40, 40, 14, 1.1], [120, 90, 14], [200, 80, 12, 0.9], [240, 10, 10], [210, -70, 8],
      [140, -110, 6, 1.1], [100, -180, 5], [50, -226, 4], [10, -214, 4],
    ],
    items: [0.08, 0.34, 0.6, 0.84],
    boosts: [{ at: 0.2, d: 0 }, { at: 0.45, d: -3 }, { at: 0.7, d: 3 }, { at: 0.93, d: 0 }],
    ramps: [{ at: 0.52, len: 9, h: 2.4, glide: true }, { at: 0.78, len: 8, h: 2.0, glide: true }],
    gems: [{ at: 0.05, d: 0, n: 6 }, { at: 0.27, d: 3, n: 5 }, { at: 0.56, d: -3, n: 5 }, { at: 0.83, d: 0, n: 6 }],
    obstacles: [{ at: 0.15, type: 'balloon', amp: 7, speed: 0.8 }, { at: 0.65, type: 'balloon', amp: 7, speed: 1 }],
    shortcuts: [
      { name: 'Rainbow Leap', from: 0.595, to: 0.73, side: 1, surface: 'road', width: 9, deco: 'rainbow',
        wpts: [[130, 64, 13.5], [162, 40, 13], [192, 16, 12], [220, -4, 11]],
        ramps: [{ at: 0.24, len: 8, h: 2.4, glide: true }], voids: [{ at: 0.38, len: 0.24 }] },
      { name: 'Cotton Candy Cut', from: 0.2, to: 0.35, side: -1, surface: 'offroad', width: 11, deco: 'cotton', crates: true,
        wpts: [[-140, 70], [-160, 40], [-175, 10], [-190, -25]], gems: [{ at: 0.3, n: 5 }, { at: 0.7, n: 4 }] },
    ],
  },
];

export const CUPS = [
  { id: 'sprout-cup', name: 'Sprout Cup', tracks: ['sprout', 'coral', 'dunes', 'frost'], reverse: false },
  { id: 'star-cup', name: 'Star Cup', tracks: ['candy', 'neon', 'magma', 'cloud'], reverse: false },
  { id: 'flip-sprout', name: 'Flipside Cup', tracks: ['frost', 'dunes', 'coral', 'sprout'], reverse: true },
  { id: 'flip-star', name: 'Flipside Star Cup', tracks: ['cloud', 'magma', 'neon', 'candy'], reverse: true },
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
