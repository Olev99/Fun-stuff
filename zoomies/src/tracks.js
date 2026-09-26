// Track layouts. Points are [x, z, height]. Feature positions are fractions of
// a lap (0 = start line), lateral offsets are in metres (+ = right).

export const TRACKS = [
  {
    id: 'sprout',
    name: 'Sprout Speedway',
    blurb: 'Rolling meadows, a windmill and one big hill jump.',
    theme: 'meadow',
    music: { key: 0, bpm: 138, seed: 11, scale: 'major' },
    points: [
      [0, -110, 0], [0, -20, 0], [8, 58, 0], [44, 116, 2], [105, 138, 7], [162, 116, 7.5],
      [196, 58, 2], [180, -6, 0], [132, -30, 0], [118, -84, 0], [156, -138, 0],
      [142, -196, 0], [88, -222, 0], [34, -196, 0],
    ],
    items: [0.1, 0.46, 0.76],
    boosts: [{ at: 0.3, d: 0 }, { at: 0.62, d: -3 }, { at: 0.93, d: 3 }],
    ramps: [{ at: 0.345, len: 8, h: 1.9 }],
    gems: [{ at: 0.04, d: -4, n: 5 }, { at: 0.2, d: 4, n: 5 }, { at: 0.55, d: 0, n: 6 }, { at: 0.85, d: -3, n: 5 }],
  },
  {
    id: 'dunes',
    name: 'Dune Dash Canyon',
    blurb: 'Blazing sand, towering mesas and a clifftop drop.',
    theme: 'desert',
    music: { key: 2, bpm: 146, seed: 23, scale: 'dorian' },
    points: [
      [0, -150, 0], [0, -50, 0], [12, 40, 0], [62, 96, 0], [142, 104, 3], [196, 54, 7],
      [192, -30, 11], [146, -84, 11], [86, -98, 6], [58, -150, 2], [92, -212, 0],
      [66, -276, 0], [-4, -292, 0], [-52, -250, 0], [-40, -196, 0],
    ],
    items: [0.08, 0.42, 0.72],
    boosts: [{ at: 0.24, d: 3 }, { at: 0.58, d: -3 }, { at: 0.88, d: 0 }],
    ramps: [{ at: 0.5, len: 8, h: 2.0 }],
    gems: [{ at: 0.03, d: 3, n: 5 }, { at: 0.3, d: -3, n: 6 }, { at: 0.64, d: 2, n: 5 }, { at: 0.8, d: -2, n: 5 }],
    shoulder: 6,
    wallH: 2.4,
  },
  {
    id: 'frost',
    name: 'Frostbite Pass',
    blurb: 'Icy corners, pine forests and a slippery summit.',
    theme: 'frost',
    music: { key: 5, bpm: 132, seed: 37, scale: 'minor' },
    points: [
      [0, -120, 0], [0, -30, 0], [-14, 50, 2], [-66, 98, 5], [-138, 90, 9], [-172, 30, 10],
      [-146, -26, 8], [-92, -44, 5], [-66, -94, 2], [-100, -150, 0], [-66, -212, 0],
      [8, -222, 0], [44, -174, 0],
    ],
    items: [0.1, 0.45, 0.78],
    boosts: [{ at: 0.28, d: 0 }, { at: 0.66, d: 3 }],
    ramps: [{ at: 0.43, len: 8, h: 1.8 }],
    gems: [{ at: 0.05, d: 0, n: 5 }, { at: 0.22, d: -3, n: 5 }, { at: 0.56, d: 3, n: 6 }, { at: 0.88, d: 0, n: 5 }],
    grip: 0.72,
  },
  {
    id: 'neon',
    name: 'Neon Nebula',
    blurb: 'A glowing skyway city under a sky full of stars.',
    theme: 'neon',
    music: { key: 7, bpm: 152, seed: 51, scale: 'minor' },
    points: [
      [0, -130, 0], [0, -20, 0], [4, 66, 0], [38, 112, 0], [96, 116, 2], [130, 80, 5],
      [132, 4, 9], [164, -42, 9], [222, -48, 8], [250, -96, 6], [232, -160, 2],
      [178, -190, 0], [104, -184, 0], [62, -218, 0], [18, -196, 0],
    ],
    items: [0.08, 0.4, 0.7],
    boosts: [{ at: 0.2, d: -3 }, { at: 0.36, d: 3 }, { at: 0.55, d: 0 }, { at: 0.8, d: -3 }, { at: 0.95, d: 3 }],
    ramps: [{ at: 0.62, len: 8, h: 1.8 }],
    gems: [{ at: 0.04, d: 0, n: 6 }, { at: 0.27, d: 3, n: 5 }, { at: 0.5, d: -3, n: 5 }, { at: 0.86, d: 0, n: 6 }],
  },
];

export const CUPS = [
  { id: 'sprout-cup', name: 'Sprout Cup', tracks: ['sprout', 'dunes', 'frost', 'neon'], reverse: false },
  { id: 'mirror-cup', name: 'Flipside Cup', tracks: ['neon', 'frost', 'dunes', 'sprout'], reverse: true },
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
