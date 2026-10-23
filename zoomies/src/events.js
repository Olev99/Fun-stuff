import * as THREE from 'three';
import { clamp, lerp, rng, smoothstep, stdMat } from './util.js';
import { BATTLE_TIME } from './battle.js';
import { SHAKE } from './settings.js';
import * as TX from './textures.js';

// Track events: things that happen during a race (a blizzard, lava rain, a
// sandstorm, the tide coming in). See docs/TRACK_EVENTS.md.
//
// The schedule comes from a seed and the race clock alone, so every phone in
// an online race computes the same one (the host sends the seed once with the
// race setup). Each phone applies the effects to the karts it simulates (its
// own kart; the host also its computer racers). Hazards an event spawns are
// placed from the seed, so they land at the same spot and time everywhere.
//
// Adding an event is data: a definition in EVENTS (name, icon, announcer
// line, warning and effect seconds, weight, a sound cue and its telegraph /
// begin / update / end hooks, which work through the shared modifiers of
// TrackEvents below) and its id in a track's `events` list in tracks.js.

export const EV_MODES = ['off', 'normal', 'wild'];
export const EV_SEED_MAX = 0x7fffffff;

// The track-event part of an online race setup as the host sent it: an
// integer seed in range and a known mode. Anything else turns events off.
export function cleanEvCfg(seed, mode) {
  return Number.isInteger(seed) && seed >= 0 && seed <= EV_SEED_MAX && EV_MODES.includes(mode) ? { evSeed: seed, evMode: mode } : { evSeed: 0, evMode: 'off' };
}

export const EV_FIRST = 25; // no warning before this many seconds of racing
export const EV_GAP = 20; // at least this long between one event's end and the next warning
export const EV_LAST = 0.92; // nothing in the last 8% of the race

// A quick winner's race time (seconds), so "the last 8%" holds for the leader too.
export function estRaceTime(len, laps, top) {
  return (len * laps) / (top * 1.25);
}

// The events of one race: [{ id, warnAt, at, end, seed }] in race-clock
// seconds (warnAt: the warning starts, at: the effect starts, end: all over).
// `wins` (optional): an event id -> [from, to] as fractions of the race, for events that belong to
// one leg of an adventure track (a river surge only makes sense while the leader is in the river).
export function schedule(seed, mode, ids, raceT, wins = {}) {
  const out = [];
  const pool = (ids || []).filter((id) => EVENTS[id]);
  if (mode !== 'normal' && mode !== 'wild') return out;
  if (!pool.length || !(raceT > 0)) return out;
  const wild = mode === 'wild';
  const r = rng(seed);
  const stop = raceT * EV_LAST;
  let t = EV_FIRST + r() * (wild ? 5 : 20);
  let last = null;
  for (let n = 0; n < 12 && t < stop;) {
    // Weighted pick, never the same event twice in a row when there is a choice.
    const inWin = (id) => !wins[id] || (t + EVENTS[id].warn >= wins[id][0] * raceT && t + EVENTS[id].warn + EVENTS[id].dur * 0.6 <= wins[id][1] * raceT);
    const opts = (pool.length > 1 ? pool.filter((id) => id !== last) : pool).filter(inWin);
    if (!opts.length) { t += 2; continue; } // nothing fits this part of the race yet
    n++;
    let w = r() * opts.reduce((a, id) => a + EVENTS[id].weight, 0);
    let id = opts[opts.length - 1];
    for (const o of opts) if ((w -= EVENTS[o].weight) <= 0) { id = o; break; }
    const d = EVENTS[id];
    const at = t + d.warn, end = at + d.dur;
    if (end > stop) break;
    out.push({ id, warnAt: +t.toFixed(3), at: +at.toFixed(3), end: +end.toFixed(3), seed: Math.floor(r() * EV_SEED_MAX) });
    last = id;
    t = end + (wild ? EV_GAP + r() * 6 : EV_GAP + 12 + r() * 24);
  }
  return out;
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, { wrap = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// A target circle: a bold ring, a soft fill and a cross.
const ringTex = () => canvasTex(128, 128, (g, w) => {
  const c = w / 2;
  const f = g.createRadialGradient(c, c, 0, c, c, c);
  f.addColorStop(0, 'rgba(255,255,255,0.35)');
  f.addColorStop(0.75, 'rgba(255,255,255,0.12)');
  f.addColorStop(0.8, 'rgba(255,255,255,1)');
  f.addColorStop(0.93, 'rgba(255,255,255,1)');
  f.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = f;
  g.fillRect(0, 0, w, w);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillRect(c - 3, c - 22, 6, 44);
  g.fillRect(c - 22, c - 3, 44, 6);
});
// Warning stripes across the road.
const bandTex = () => canvasTex(64, 64, (g, w) => {
  g.clearRect(0, 0, w, w);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let k = -2; k < 3; k++) {
    g.beginPath();
    g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 16 + 64, 64); g.lineTo(k * 32 + 64, 64);
    g.fill();
  }
}, { wrap: true });
// A soft round blob (lava puddles; syrup and craters take other colours).
const blobTex = (c0 = 'rgba(255,255,255,1)', c1 = 'rgba(255,210,150,0.95)', c2 = 'rgba(180,60,20,0.85)', c3 = 'rgba(60,10,0,0)') => canvasTex(128, 128, (g, w) => {
  const c = w / 2;
  const f = g.createRadialGradient(c, c, 0, c, c, c);
  f.addColorStop(0, c0);
  f.addColorStop(0.55, c1);
  f.addColorStop(0.8, c2);
  f.addColorStop(1, c3);
  g.fillStyle = f;
  g.fillRect(0, 0, w, w);
});
// Seawater from the left edge to the middle, with a foam crest; clear beyond.
const waterTex = () => {
  const t = canvasTex(256, 4, (g, w, h) => {
    const f = g.createLinearGradient(0, 0, w, 0);
    f.addColorStop(0, 'rgba(20,110,200,0.9)');
    f.addColorStop(0.4, 'rgba(50,170,230,0.85)');
    f.addColorStop(0.455, 'rgba(255,255,255,0.95)');
    f.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    f.addColorStop(0.505, 'rgba(255,255,255,0)');
    f.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = f;
    g.fillRect(0, 0, w, h);
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
};
// A rolling wall of dust: thick at the bottom, ragged at the top.
const dustTex = () => canvasTex(128, 128, (g, w, h) => {
  const r = rng(7);
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = h * (0.35 + r() * 0.65), rad = 14 + r() * 26;
    const f = g.createRadialGradient(x, y, 0, x, y, rad);
    f.addColorStop(0, 'rgba(255,255,255,0.5)');
    f.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = f;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const f = g.createLinearGradient(0, 0, 0, h);
  f.addColorStop(0, 'rgba(255,255,255,0)');
  f.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  f.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = f;
  g.fillRect(0, 0, w, h);
}, { wrap: true });

// Merge road decals (track.patch geometries: position, normal, uv, index) into one geometry.
function mergeDecals(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    uv.set(g.attributes.uv.array, ov * 2);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    ov += g.attributes.position.count;
    oi += ix.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// One material's worth of road decals, merged into a single draw call.
class Layer {
  constructor(group, mat, order = 2) {
    this.mat = mat;
    this.parts = new Map();
    this.dirty = false;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    group.add(this.mesh);
  }
  set(key, geo) { this.parts.set(key, geo); this.dirty = true; }
  del(key) { if (this.parts.delete(key)) this.dirty = true; }
  clear() { if (this.parts.size) { this.parts.clear(); this.dirty = true; } }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.parts.size ? mergeDecals([...this.parts.values()]) : new THREE.BufferGeometry();
    this.mesh.visible = this.parts.size > 0;
  }
  dispose() {
    this.mesh.geometry.dispose();
    for (const g of this.parts.values()) g.dispose();
    if (this.mat.map) this.mat.map.dispose();
    this.mat.dispose();
  }
}

const glowBasic = (map, color, k, extra = {}) => new THREE.MeshBasicMaterial({
  map, color: new THREE.Color(color).multiplyScalar(k), transparent: true, depthWrite: false, fog: true,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4, ...extra,
});

// ---------------------------------------------------------------- the events
// Instanced props the events draw: [obstacle model, material, how rot turns it].
const INST = {
  meteor: ['fireball', 'glow', 'tumble'], lump: ['snowball', 'mat', 'tumble'], ghost: ['ghost', 'mat', 'spin'], lantern: ['lantern', 'mat', 'spin'],
  hay: ['hay', 'mat', 'roll'], boulder: ['boulder', 'mat', 'tumble'], gumball: ['gumball', 'mat', 'tumble'], twister: ['twister', 'twister', 'spin'], press: ['crate', 'mat', 'spin'],
};
const POOL = 96;

// Gusts: a smooth swell every `period` seconds; returns 0..1 and the gust's index.
function gust(t, period, len) {
  const n = Math.floor(t / period), ph = t - n * period;
  return { g: ph < len ? Math.sin((ph / len) * Math.PI) ** 2 : 0, n };
}
// Fade in over a, hold, fade out over b before the end (an effect's envelope).
const env = (t, dur, a = 2.5, b = 3) => clamp(Math.min(t / a, (dur - t) / b), 0, 1);

export const EVENTS = {
  // Frostbite Pass
  blizzard: {
    name: 'Blizzard', icon: '🌨️', line: 'BLIZZARD INCOMING! Ice on the road, hold your line!', warn: 5, dur: 18, weight: 3, cue: 'wind', vis: true,
    telegraph(sys, e) {
      e.side = e.rand() < 0.5 ? -1 : 1;
      // Ice patches show faintly during the warning and freeze solid when it hits.
      e.ice = sys.spots(e, 6, 4).map((p) => ({ ...p, len: 14 + e.rand() * 8, w: 6 + e.rand() * 3 }));
      e.ice.forEach((p, i) => sys.layer('ice').set(i, sys.tr.patch(p.s, p.s + p.len, p.d - p.w / 2, p.d + p.w / 2, { lift: 0.045, segs: 8 })));
      sys.layer('ice').mat.opacity = 0.35;
    },
    begin(sys, e) {
      e.patches = e.ice.map((p) => sys.addPatch('ice', p.s, p.len, p.d, p.w));
      sys.layer('ice').mat.opacity = 0.85;
      sys.sound('thunder');
    },
    update(sys, e, t) {
      const k = env(t, this.dur);
      const gs = gust(t, 4.2, 1.8);
      const dir = (gs.n % 2 ? -1 : 1) * e.side; // gusts swap sides
      e.gust = gs.g;
      sys.mods.wind = dir * sys.amp * (2.2 + gs.g * 5.2) * k;
      sys.mods.traction = 1 - 0.1 * k;
      sys.mods.grip = 1 - 0.08 * k;
      sys.setVis(0.82 * k, '#eef4ff');
      sys.storm(dir, k, '#ffffff', 5);
      if (gs.g > 0.6 && !e.gusted?.[gs.n]) { (e.gusted ||= {})[gs.n] = 1; sys.sound('wind'); }
    },
    end(sys, e) { for (const p of e.patches || []) sys.removePatch(p); },
    kartEvent: surfGust,
  },
  avalanche: {
    name: 'Avalanche', icon: '🏔️', line: 'AVALANCHE! Snow slides at the striped spots, dodge it!', warn: 4, dur: 10, weight: 2, cue: 'rumble',
    telegraph(sys, e) {
      e.spots = sys.spots(e, 3, 0).map((p) => ({ ...p, side: e.rand() < 0.5 ? -1 : 1 }));
      e.spots.forEach((p, i) => sys.layer('band').set(i, sys.tr.patch(p.s - 3, p.s + 3, -p.hw, p.hw, { lift: 0.05, segs: 3 })));
      sys.layerColor('band', '#ff5a5f', 1.6);
      sys.shake(0.25);
    },
    begin(sys) { sys.sound('rumble'); sys.shake(0.35); },
    update(sys, e, t, dt) {
      const tr = sys.tr, fr = sys.fr;
      // Each spot sends a lump of snow across the road every 1.3 s; the gaps are the way through.
      const cross = 2.6;
      for (let si = 0; si < e.spots.length; si++) {
        const p = e.spots[si];
        for (let j = 0; j * 1.3 < this.dur - cross; j++) {
          const u = (t - j * 1.3) / cross;
          if (u < 0 || u > 1) continue;
          const s = p.s + ((j * 7 + si * 3) % 5) - 2;
          tr.frame(s, fr);
          const d = p.side * (fr.hw + 4) * (1 - 2 * u);
          const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d, y = tr.heightAtFrame(fr, clamp(d, -fr.hw, fr.hw)) + 1.5;
          sys.put('lump', x, y, z, 1 + 0.15 * Math.sin(j * 2.1), sys.time * 4 * p.side);
          sys.hazard(x, z, 1.8);
          if (Math.random() < dt * 20) sys.fx.soft.emit(x, y - 1, z, (Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.5) * 4, '#ffffff', 1.1, 0.3, 0.8, 4, 1.5, 0.9);
          for (const k of sys.local()) {
            if (k.ghostTime > 0 || k.starTime > 0 || k.rocketTime > 0 || (k._evBury || -9) > sys.time - 1.5) continue;
            if ((k.pos.x - x) ** 2 + (k.pos.z - z) ** 2 < 2.9 * 2.9 && Math.abs(k.pos.y + 0.8 - y) < 3) bury(sys, k);
          }
        }
        // DODGED! for driving through a live slide without being buried.
        const pl = sys.race.player;
        if (pl && !pl.remote && t < this.dur - 1) {
          const ds = Math.abs(sys.ahead(pl.mainPos ?? pl.trk.s, p.s));
          if (ds < 4) p.near = true;
          else if (p.near) {
            p.near = false;
            if ((pl._evBury || -9) < sys.time - 2) sys.style('DODGED!', 15, 'mint');
          }
        }
      }
    },
    end() {},
  },
  // Magma Mountain
  lavaRain: {
    name: 'Lava Rain', icon: '☄️', line: 'LAVA RAIN! Steer clear of the glowing circles!', warn: 4, dur: 18, weight: 3, cue: 'siren',
    telegraph(sys, e) {
      // Every wave marks circles all round the lap; meteors land 2 s later and leave lava for 8 s.
      const waves = sys.wild ? 5 : 4, gap = sys.wild ? 2 : 2.5;
      const per = Math.round(clamp(sys.tr.length / 130, 6, 14) * sys.amp);
      e.rocks = [];
      for (let w = 0; w < waves; w++) {
        for (const p of sys.spots(e, per, 3)) e.rocks.push({ ...p, r: 2.4, mark: w * gap, hit: w * gap + 2, gone: w * gap + 10, st: 0 });
      }
    },
    begin(sys) { sys.sound('thunder'); },
    update(sys, e, t) {
      const tr = sys.tr;
      const pl = sys.race.player;
      for (let i = 0; i < e.rocks.length; i++) {
        const c = e.rocks[i];
        if (t < c.mark) continue;
        if (c.st === 0) { c.st = 1; sys.layer('ring').set(i, tr.patch(c.s - c.r, c.s + c.r, c.d - c.r, c.d + c.r, { lift: 0.07, segs: 3 })); }
        if (c.st === 1) {
          // Falling meteor for the last 0.8 s before impact.
          const f = (c.hit - t) / 0.8;
          if (f < 1) {
            const y = c.y + 0.6 + f * 38;
            sys.put('meteor', c.x + f * 8, y, c.z + f * 5, 0.9, sys.time * 6);
            sys.fx.glow.emit(c.x + f * 8, y + 1, c.z + f * 5, 0, 2, 0, Math.random() < 0.5 ? '#ff6a1a' : '#ffd23f', 1.4, 0.2, 0.5, 0, 1);
          }
          if (t < c.hit) {
            sys.hazard(c.x, c.z, t > c.hit - 1 ? c.r : 0.1);
            if (pl && !pl.remote && (pl.pos.x - c.x) ** 2 + (pl.pos.z - c.z) ** 2 < (c.r + 0.6) ** 2) c.near = true;
            continue;
          }
          // Impact: the circle turns into a lava puddle.
          c.st = 2;
          sys.layer('ring').del(i);
          sys.layer('lava').set(i, tr.patch(c.s - c.r, c.s + c.r, c.d - c.r, c.d + c.r, { lift: 0.06, segs: 3 }));
          sys.fx.burst(c.x, c.y + 0.6, c.z, ['#ff6a1a', '#ffd23f', '#3b3134'], 14, 9, 0.6, 0.6, 12);
          if (sys.near(c.x, c.z, 45)) { sys.sound('boom'); sys.shake(Math.max(0.15, 0.5 - Math.sqrt((pl.pos.x - c.x) ** 2 + (pl.pos.z - c.z) ** 2) / 90)); }
          let struck = false;
          for (const k of sys.local()) if ((k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 < (c.r + 0.4) ** 2 && Math.abs(k.pos.y - c.y) < 3 && k.hit('spin') && k === pl) struck = true;
          if (c.near && !struck && pl && pl.spinTime <= 0) sys.style('DODGED!', 15, 'mint');
        }
        if (c.st === 2) {
          if (t >= c.gone) { c.st = 3; sys.layer('lava').del(i); continue; }
          sys.hazard(c.x, c.z, c.r);
          for (const k of sys.local()) {
            if (!k.grounded || (k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 > c.r * c.r || Math.abs(k.pos.y - c.y) > 2) continue;
            if (k.hit('spin') && k === pl) sys.toast('HOT HOT HOT!');
          }
        }
      }
    },
    end(sys) { sys.layer('ring').clear(); sys.layer('lava').clear(); },
  },
  eruption: {
    name: 'Eruption', icon: '🌋', line: 'ERUPTION! Ash ahead, ride the boost lanes through the smoke!', warn: 4, dur: 14, weight: 2, cue: 'rumble', vis: true,
    telegraph(sys, e) {
      e.lanes = sys.spots(e, 3, 3.5);
      e.lanes.forEach((p, i) => sys.layer('band').set(i, sys.tr.patch(p.s, p.s + 14, p.d - 2.5, p.d + 2.5, { lift: 0.05, segs: 6 })));
      sys.layerColor('band', '#ffd23f', 1.8);
      sys.shake(0.3);
    },
    begin(sys, e) {
      sys.layer('band').clear();
      e.live = e.lanes.map((p) => sys.addLane(p.s, p.d, 14));
      sys.sound('boom');
      sys.shake(0.7);
      sys.flash(0.3);
    },
    update(sys, e, t) {
      const k = env(t, this.dur, 2, 3);
      sys.setVis(0.6 * k, '#6a5550');
      sys.storm(0, k, '#9a8a86', 3);
      // Aftershocks.
      const n = Math.floor(t / 3.2);
      if (n > (e.shock ?? -1) && t < this.dur - 3) { e.shock = n; sys.shake(0.35); if (n) sys.sound('rumble'); }
      const pl = sys.race.player;
      if (pl && !pl.remote) for (const ln of e.live) {
        const on = pl.path === sys.tr && pl.grounded && sys.ahead(ln.s, pl.trk.s) >= 0 && sys.ahead(ln.s, pl.trk.s) <= ln.len && Math.abs(pl.trk.d - ln.d) < ln.w / 2 + 0.4;
        if (on && !ln.used) { ln.used = true; sys.style('ASH DASH', 10, 'gold'); }
      }
    },
    end(sys, e) { for (const ln of e.live || []) sys.removeLane(ln); sys.layer('band').clear(); },
  },
  // Dune Dash Canyon
  sandstorm: {
    name: 'Sandstorm', icon: '🌪️', line: 'SANDSTORM! The wind shoves you to the wall, follow the glowing edge!', warn: 5, dur: 16, weight: 3, cue: 'wind', vis: true,
    telegraph(sys, e) { e.side = e.rand() < 0.5 ? -1 : 1; },
    begin(sys) { sys.sound('wind'); },
    update(sys, e, t) {
      const k = env(t, this.dur, 1.5, 3);
      const gs = gust(t, 3.6, 1.6);
      e.gust = gs.g;
      sys.mods.wind = e.side * sys.amp * (3.2 + gs.g * 4.2) * k;
      sys.mods.traction = 1 - 0.06 * k;
      sys.setVis(0.78 * k, '#d9a868');
      sys.storm(e.side, k, '#e2b47a', 6);
      if (gs.g > 0.6 && !e.gusted?.[gs.n]) { (e.gusted ||= {})[gs.n] = 1; sys.sound('wind'); }
    },
    // The dust wall rolls in from the windward side during the warning and sweeps past as the storm hits.
    wall: true,
    end() {},
    kartEvent: surfGust,
  },
  // Coral Cove and Tidal Twist
  tide: {
    name: 'Rising Tide', icon: '🌊', line: 'RISING TIDE! Waves wash in, keep to the dry side or ride the crest!', warn: 5, dur: 16, weight: 3, cue: 'wave',
    telegraph(sys, e) {
      e.zones = sys.spots(e, Math.round(clamp(sys.tr.length / 180, 4, 7)), 0).map((p) => ({ ...p, len: 34, sea: e.rand() < 0.5 ? -1 : 1 }));
      const tr = sys.tr, fr = sys.fr;
      e.zones.forEach((z, i) => {
        tr.frame(z.s + z.len / 2, fr);
        z.hw = fr.hw;
        // u runs from the sea edge (0) to the far edge (1): the texture offset moves the waterline.
        sys.layer('water').set(i, tr.patch(z.s, z.s + z.len, z.sea * fr.hw, -z.sea * fr.hw, { lift: 0.05, segs: 10 }));
      });
    },
    begin(sys, e) {
      e.patches = e.zones.map((z) => sys.addPatch('sand', z.s, z.len, z.sea * z.hw, 0.01));
      sys.sound('wave');
    },
    update(sys, e, t) {
      // Two waves of 8 s each wash over up to 60% of the road (70% when Wild), then recede.
      const ph = (t % 8) / 8;
      const cov = 0.6 * Math.min(1.17, sys.amp) * Math.sin(Math.PI * Math.min(1, ph * 1.25)) ** 1.5;
      const rising = ph * 1.25 < 0.5;
      e.cov = cov;
      sys.waterline(cov);
      e.zones.forEach((z, i) => {
        const covW = cov * 2 * z.hw;
        const p = e.patches[i];
        p.w = Math.max(0.01, covW);
        p.d = z.sea * (z.hw - covW / 2);
        if (!rising || covW < 1.5) return;
        const crest = z.sea * (z.hw - covW);
        for (const k of sys.local()) {
          if (k.path !== sys.tr || !k.grounded || (k._evCrest || -9) > sys.time - 3) continue;
          const u = sys.ahead(z.s, k.trk.s);
          if (u < 0 || u > z.len || Math.abs(k.trk.d - crest) > 1.1) continue;
          k._evCrest = sys.time;
          k.startBoost(0.8, 7);
          if (k === sys.race.player) { sys.style('STORM SURFER', 20, 'gold'); sys.sound('wave'); }
          sys.fx.burst(k.pos.x, k.pos.y + 0.4, k.pos.z, ['#ffffff', '#bfefff'], 12, 6, 0.8, 0.6, 10, false);
        }
      });
      if (Math.floor(t / 8) !== e.wave) { e.wave = Math.floor(t / 8); if (t > 0.2) sys.sound('wave'); }
    },
    telegraphUpdate(sys, e, t) { sys.waterline(0.05 + 0.04 * Math.sin(t * 5)); },
    end(sys, e) { for (const p of e.patches || []) sys.removePatch(p); sys.layer('water').clear(); },
  },
};

// Blizzard and Sandstorm: a drift boost let go in a gust surfs it for extra speed.
function surfGust(sys, e, k, type, data) {
  if (type !== 'driftBoost' || !(data >= 1) || !(e.gust > 0.45)) return;
  k.startBoost(0.6, 5);
  if (k === sys.race.player) sys.style('STORM SURFER', 20, 'gold');
}

// Hit by an avalanche lump: half the speed and a short slide, never a dead stop.
export function bury(sys, k) {
  k._evBury = sys.time;
  k.vel.x *= 0.5;
  k.vel.z *= 0.5;
  k.slip(0.5);
  sys.fx.burst(k.pos.x, k.pos.y + 1, k.pos.z, ['#ffffff', '#dbe8f7'], 22, 7, 0.9, 0.7, 10, false);
  if (k === sys.race.player) { sys.toast('BURIED! Dig out!'); sys.shake(0.5); sys.sound('bump'); }
}

// ---------------------------------------------------------------- the other signature events
// A drift boost let go in a gust surfs it for extra speed (like Blizzard), with its own popup.
const surf = (label) => (sys, e, k, type, data) => {
  if (type !== 'driftBoost' || !(data >= 1) || !(e.gust > 0.45)) return;
  k.startBoost(0.6, 5);
  if (k === sys.race.player) sys.style(label, 20, 'gold');
};

// Boost-lane events: striped marks while warning, lanes afterwards; the first drive down each lane pays a popup.
function lanesMark(sys, e, n, len, { col = '#ffd23f', within = null, margin = 3.5, best = false } = {}) {
  e.lanes = sys.spots(e, n, margin, within, len + 4).map((p) => ({ ...p, len }));
  if (best) for (const p of e.lanes) p.d = sys.bestD(p.s + len / 2);
  e.lanes.forEach((p, i) => sys.layer('band').set(i, sys.tr.patch(p.s, p.s + len, p.d - 2.5, p.d + 2.5, { lift: 0.05, segs: 6 })));
  sys.layerColor('band', col, 1.8);
}
const lanesOpen = (sys, e) => { sys.layer('band').clear(); e.live = e.lanes.map((p) => sys.addLane(p.s, p.d, p.len)); };
const lanesClose = (sys, e) => { for (const ln of e.live || []) sys.removeLane(ln); sys.layer('band').clear(); };
function lanesPay(sys, e, label, pts = 10) {
  const pl = sys.race.player;
  if (!pl || pl.remote || !e.live) return;
  for (const ln of e.live) {
    const u = sys.ahead(ln.s, pl.trk.s);
    if (!ln.used && pl.path === sys.tr && pl.grounded && u >= 0 && u <= ln.len && Math.abs(pl.trk.d - ln.d) < ln.w / 2 + 0.4) { ln.used = true; sys.style(label, pts, 'gold'); }
  }
}
// Sparkles falling on every live lane (a few glow particles, no extra draw call).
function lanesGlow(sys, e, cols, k = 1, up = 3) {
  for (const ln of e.live || []) {
    if (Math.random() > k * 0.7) continue;
    const q = sys.at(ln.s + Math.random() * ln.len, ln.d + (Math.random() - 0.5) * ln.w, up);
    sys.fx.glow.emit(q.x, q.y, q.z, 0, -2.5, 0, cols[(Math.random() * cols.length) | 0], 0.5, 0.1, 0.8, 0, 0.5);
  }
}

// Things crossing the road at marked spots, line after line (ghosts, hay carts): a hit is a bump, the gaps are the way through.
// Each spot sends `n` items in a diagonal row every `period` seconds; c: { put, n, step, stagger, cross, period, y, r, kind, scale, label, dur, roll, glow }.
function cross(sys, e, t, c) {
  const pl = sys.race.player;
  e.spots.forEach((p) => {
    for (let w = 0; w * c.period < c.dur - c.cross; w++) {
      for (let i = 0; i < c.n; i++) {
        const u = (t - w * c.period - i * c.stagger) / c.cross;
        if (u < 0 || u > 1) continue;
        const d = p.side * (p.hw + 3) * (1 - 2 * u);
        const q = sys.at(p.s + (i - (c.n - 1) / 2) * c.step, d, c.y + (c.roll ? 0 : Math.sin(sys.time * 3 + i + w) * 0.25));
        const fr = sys._f2, x = q.x, y = q.y, z = q.z, yaw = Math.atan2(-p.side * fr.rx, -p.side * fr.rz);
        if (c.roll) sys.put(c.put, x, y, z, c.scale, sys.time * 7 * p.side, yaw);
        else sys.put(c.put, x, y, z, c.scale, yaw);
        sys.hazard(x, z, c.r);
        if (c.glow && Math.random() < 0.4) sys.fx.glow.emit(x, y - 0.5, z, 0, 0.6, 0, c.glow, 0.7, 0.1, 0.6, 0, 1, 0.6);
        for (const k of sys.local()) {
          if ((k.pos.x - x) ** 2 + (k.pos.z - z) ** 2 < (c.r + 0.9) ** 2 && Math.abs(k.pos.y + 0.8 - y) < 3 && sys.hurt(k, c.kind) && k === pl) sys.sound('bump');
        }
      }
    }
    // A popup for slipping through a live crossing without being hit.
    if (pl && !pl.remote && t < c.dur - 1) {
      const ds = Math.abs(sys.ahead(pl.mainPos ?? pl.trk.s, p.s));
      if (ds < 6) p.near = true;
      else if (p.near) {
        p.near = false;
        if ((pl._evHit || -9) < sys.time - 3) sys.style(c.label, 15, 'mint');
      }
    }
  });
}
const crossMarks = (sys, e, c, col) => {
  e.spots.forEach((p, i) => sys.layer('band').set(i, sys.tr.patch(p.s - (c.n * c.step) / 2 - 2, p.s + (c.n * c.step) / 2 + 2, -p.hw, p.hw, { lift: 0.05, segs: 5 })));
  sys.layerColor('band', col, 1.6);
};

// Marked circles, then something lands: the shape of Syrup Shower, Temple Tremor and the meteor showers.
// cfg: waves, gap, every (metres of road per circle), r, life (s on the ground), ring (colour), fall (flying model), fs, dust, dodge, sound, thump,
// land(sys, e, c, i), gone(sys, e, c, i), hit(sys, k, c) -> true if it got the kart, live(sys, e, c, t), each(sys, e, t, dt), tele(sys, e), start(sys, e), finish(sys, e), soft (the AI ignores it).
function rain(cfg) {
  return {
    telegraph(sys, e) {
      const per = Math.round(clamp(sys.tr.length / cfg.every, 5, 12) * sys.amp);
      e.rocks = [];
      for (let w = 0; w < cfg.waves + (sys.wild ? 1 : 0); w++) {
        for (const p of sys.spots(e, per, 3)) e.rocks.push({ ...p, r: cfg.r, mark: w * cfg.gap, hit: w * cfg.gap + 2, gone: w * cfg.gap + 2 + cfg.life, st: 0 });
      }
      sys.layerColor('ring', cfg.ring, 2);
      if (cfg.tele) cfg.tele(sys, e);
    },
    begin(sys, e) { sys.sound(cfg.sound); if (cfg.start) cfg.start(sys, e); },
    update(sys, e, t, dt) {
      const tr = sys.tr, pl = sys.race.player;
      for (let i = 0; i < e.rocks.length; i++) {
        const c = e.rocks[i];
        if (t < c.mark || c.st === 3) continue;
        if (c.st === 0) { c.st = 1; sys.layer('ring').set(i, tr.patch(c.s - c.r, c.s + c.r, c.d - c.r, c.d + c.r, { lift: 0.07, segs: 3 })); }
        if (c.st === 1) {
          const f = (c.hit - t) / 0.8;
          if (f < 1) {
            const y = c.y + 0.6 + f * 38;
            sys.put(cfg.fall, c.x + f * 8, y, c.z + f * 5, cfg.fs, sys.time * 6);
            sys.fx.glow.emit(c.x + f * 8, y + 1, c.z + f * 5, 0, 2, 0, cfg.dust[(Math.random() * cfg.dust.length) | 0], 1.2, 0.2, 0.5, 0, 1);
          }
          if (t < c.hit) {
            sys.hazard(c.x, c.z, t > c.hit - 1 ? c.r : 0.1);
            if (pl && !pl.remote && (pl.pos.x - c.x) ** 2 + (pl.pos.z - c.z) ** 2 < (c.r + 0.6) ** 2) c.near = true;
            continue;
          }
          c.st = 2;
          sys.layer('ring').del(i);
          cfg.land(sys, e, c, i);
          sys.fx.burst(c.x, c.y + 0.6, c.z, cfg.dust, 12, 8, 0.6, 0.6, 10);
          if (sys.near(c.x, c.z, 45)) { sys.sound(cfg.thump); sys.shake(Math.max(0.12, 0.4 - Math.sqrt((pl.pos.x - c.x) ** 2 + (pl.pos.z - c.z) ** 2) / 100)); }
          let struck = false;
          for (const k of sys.local()) if ((k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 < (c.r + 0.4) ** 2 && Math.abs(k.pos.y - c.y) < 3 && cfg.hit(sys, k, c) && k === pl) struck = true;
          if (c.near && !struck && pl && pl.spinTime <= 0) sys.style(cfg.dodge, 15, 'mint');
        }
        if (c.st === 2) {
          if (t >= c.gone) { c.st = 3; if (cfg.gone) cfg.gone(sys, e, c, i); continue; }
          if (!cfg.soft) sys.hazard(c.x, c.z, c.r);
          if (cfg.live) cfg.live(sys, e, c, t);
        }
      }
      if (cfg.each) cfg.each(sys, e, t, dt);
    },
    end(sys, e) {
      (e.rocks || []).forEach((c, i) => { if (c.st === 2 && cfg.gone) cfg.gone(sys, e, c, i); });
      sys.layer('ring').clear();
      if (cfg.finish) cfg.finish(sys, e);
    },
  };
}

// A crater is a small bump: a grounded kart rolling over one hops a little and loses a touch of speed.
function craterBump(sys, c) {
  for (const k of sys.local()) {
    if (!k.grounded || (k._evBump || -9) > sys.time - 1 || (k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 > (c.r * 0.85) ** 2 || Math.abs(k.pos.y - c.y) > 2) continue;
    k._evBump = sys.time;
    k.vel.x *= 0.95;
    k.vel.z *= 0.95;
    k.vy = 3.4;
    k.grounded = false;
    if (k === sys.race.player) sys.sound('bump');
  }
}
const impactMeteors = (o) => rain({
  waves: 4, gap: 2.5, every: 140, r: 2.4, life: 1e6, ring: '#ff8a3a', fall: 'meteor', fs: 0.9, dust: ['#c9ccd6', '#8a8fa0', '#ffd23f'], dodge: 'DODGED!', sound: 'rumble', thump: 'boom', soft: true,
  land(sys, e, c, i) { sys.layer('crater').set(i, sys.tr.patch(c.s - c.r, c.s + c.r, c.d - c.r, c.d + c.r, { lift: 0.06, segs: 3 })); },
  hit: (sys, k) => sys.hurt(k, 'spin'),
  live: (sys, e, c) => craterBump(sys, c),
  finish(sys) { sys.layer('crater').clear(); },
  each(sys, e, t) {
    const k = env(t, o.dur, 1.5, 2.5);
    sys.setVis(0.2 * k, '#ff9a4a', '#ffb347'); // solar flare
    if (!o.gravity) return;
    // A gravity pulse every 5.5 s: everything floats for a moment.
    const g = gust(t, 5.5, 1.8);
    sys.mods.gravity = 1 - 0.38 * g.g * k;
    const pl = sys.race.player;
    if (pl && g.g > 0.5 && pl.airTime > 0.4 && e.gp !== g.n) { e.gp = g.n; sys.style('MOON HOP', 10, 'gold'); }
  },
});

const METEORS = impactMeteors({ dur: 17, gravity: true });
const CRATER_METEORS = impactMeteors({ dur: 16, gravity: false });
const SYRUP = rain({
  waves: 4, gap: 2.4, every: 150, r: 2.6, life: 8, ring: '#ff5fa8', fall: 'gumball', fs: 0.7, dust: ['#ff7ab8', '#ffffff', '#7fe8ff'], dodge: 'SWEET DODGE!', sound: 'honey', thump: 'honey',
  land(sys, e, c, i) {
    sys.layer('syrup').set(i, sys.tr.patch(c.s - c.r, c.s + c.r, c.d - c.r, c.d + c.r, { lift: 0.06, segs: 3 }));
    c.patch = sys.addPatch('mud', c.s - c.r, c.r * 2, c.d, c.r * 2);
  },
  gone(sys, e, c, i) { sys.layer('syrup').del(i); if (c.patch) sys.removePatch(c.patch); c.patch = null; },
  hit(sys, k) { k.vel.x *= 0.7; k.vel.z *= 0.7; if (k === sys.race.player) sys.toast('STICKY!'); return true; },
  finish(sys) { sys.layer('syrup').clear(); },
});
const TREMOR = rain({
  waves: 3, gap: 2.6, every: 170, r: 2.6, life: 0.3, ring: '#ffb347', fall: 'boulder', fs: 0.8, dust: ['#8a7a66', '#5a4d50', '#c9b48a'], dodge: 'DODGED!', sound: 'rumble', thump: 'thud',
  tele(sys, e) { lanesMark(sys, e, sys.wild ? 3 : 2, 26, { col: '#ffd23f' }); }, // the temple gate
  land() {},
  hit: (sys, k) => sys.hurt(k, 'spin'),
  start(sys) { sys.shake(0.6); },
  each(sys, e, t) {
    const n = Math.floor(t / 1.8);
    if (n !== e.sh) { e.sh = n; sys.shake(0.2); }
    // Once the boulders have fallen the gate swings open: a boost lane through it.
    if (t > 7 && !e.live) { lanesOpen(sys, e); sys.sound('chime'); }
    lanesPay(sys, e, 'TEMPLE RUSH', 15);
  },
  finish: lanesClose,
});

// The river, sky and volcano events share one shape: lanes along a stretch of the leg, a vehicle-sized reward.
const streamEvent = (o) => ({
  telegraph(sys, e) {
    const lg = sys.tr.legs;
    lanesMark(sys, e, sys.wild ? 5 : 4, o.len, { col: o.col, margin: o.margin, within: o.zone ? { zone: o.zone } : { s0: lg[1].s + 20, s1: (lg[2] ? lg[2].s : sys.tr.length) - 10 } });
    if (o.move) e.lanes.forEach((p) => { p.s0 = p.s; });
  },
  begin(sys, e) { lanesOpen(sys, e); sys.sound(o.sound); },
  update(sys, e, t) {
    const k = env(t, this.dur, 2, 3);
    lanesPay(sys, e, o.label, 20);
    lanesGlow(sys, e, o.glow, k, 1.2);
    if (o.vis) { sys.setVis(o.vis * k, o.fog, o.edge); sys.storm(0, k, o.ash, 3); }
    if (o.move) {
      // Swells roll down the canal: the lane moves with the wave (rebuilt a few times a second).
      const z = sys.tr.zones.find((q) => q.kind === o.zone), end = z.s0 + z.len - o.len - 4;
      e.live.forEach((ln, i) => { ln.s = Math.min(end, e.lanes[i].s0 + t * o.move); });
      if (t - (e.rb ?? -9) > 0.2) {
        e.rb = t;
        e.live.forEach((ln) => sys.layer('lane').set(ln, sys.tr.patch(ln.s, ln.s + ln.len, ln.d - ln.w / 2, ln.d + ln.w / 2, { lift: 0.06, segs: 8 })));
      }
    }
    if (o.foam) for (const ln of e.live) {
      if (Math.random() > k * 0.8) continue;
      const q = sys.at(ln.s + Math.random() * ln.len, ln.d + (Math.random() < 0.5 ? -1 : 1) * ln.w * 0.5, 0.3);
      sys.fx.soft.emit(q.x, q.y, q.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, '#ffffff', 0.5, 0.2, 0.7, 4, 1, 0.8);
    }
  },
  end: lanesClose,
});

Object.assign(EVENTS, {
  // Sprout Speedway
  harvestGust: {
    name: 'Harvest Gust', icon: '🌾', line: 'HARVEST GUST! Petals and hay fly sideways, drift into it for a boost!', warn: 4, dur: 14, weight: 3, cue: 'wind',
    telegraph(sys, e) { e.side = e.rand() < 0.5 ? -1 : 1; },
    begin(sys) { sys.sound('wind'); },
    update(sys, e, t) {
      const k = env(t, this.dur, 1.5, 2.5), gs = gust(t, 3.4, 1.7);
      e.gust = gs.g;
      sys.mods.wind = e.side * sys.amp * (2 + gs.g * 4.4) * k;
      sys.mods.traction = 1 - 0.04 * k;
      sys.storm(e.side, k, '#ffb3d1', 3);
      sys.storm(e.side, k, '#e8c65a', 3);
      if (gs.g > 0.6 && !e.gusted?.[gs.n]) { (e.gusted ||= {})[gs.n] = 1; sys.sound('wind'); }
    },
    end() {},
    kartEvent: surf('GUST SURFER'),
  },
  // Blossom Gardens
  lanternFest: {
    name: 'Lantern Festival', icon: '🏮', line: 'LANTERN FESTIVAL! Follow the floating lanterns for a boost!', warn: 4, dur: 14, weight: 3, cue: 'chime',
    telegraph(sys, e) { lanesMark(sys, e, sys.wild ? 5 : 4, 26, { col: '#ff9a3c', best: true }); },
    begin(sys, e) { lanesOpen(sys, e); },
    update(sys, e, t) {
      const k = env(t, this.dur, 1.5, 2);
      lanesPay(sys, e, 'LANTERN LIGHT', 12);
      lanesGlow(sys, e, ['#ffd27a', '#ff9a3c'], k, 3);
      // Lantern lights float along both sides of every lane (glow sprites: no triangles, no draw call).
      for (const ln of e.live) for (let u = 0; u <= ln.len; u += 7) for (const sd of [-1, 1]) {
        const q = sys.at(ln.s + u, ln.d + sd * 3.4, 3 + Math.sin(sys.time * 1.6 + u + sd) * 0.4);
        sys.fx.glow.emit(q.x, q.y, q.z, 0, 0, 0, sd > 0 ? '#ff5a3c' : '#ffb347', 2.2 * k, 2.2 * k, 0.07, 0, 0, 0.9);
      }
    },
    end: lanesClose,
  },
  // Sweet Tooth Valley
  syrupShower: {
    name: 'Syrup Shower', icon: '🍯', line: 'SYRUP SHOWER! Sticky splats at the pink circles, grab a candy spark to clean up!', warn: 4, dur: 18, weight: 3, cue: 'honey',
    telegraph(sys, e) {
      SYRUP.telegraph(sys, e);
      // Candy sparks appear along the way; driving through one wipes the puddles round it.
      const n = e.rocks.length;
      e.sparks = [0.2, 0.5, 0.8].map((f, i) => { const c = e.rocks[Math.floor(f * n)]; return { s: c.s + 7, d: c.d, from: 4 + i * 3.5 }; });
    },
    begin: SYRUP.begin,
    update(sys, e, t, dt) {
      SYRUP.update(sys, e, t, dt);
      for (const sp of e.sparks) {
        if (sp.got || t < sp.from || t > this.dur - 1.5) continue;
        const q = sys.at(sp.s, sp.d, 1.3);
        const x = q.x, y = q.y, z = q.z;
        sys.fx.glow.emit(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8, 0, 1, 0, ['#ffffff', '#ff7ab8', '#7fe8ff'][(Math.random() * 3) | 0], 1.1, 0.2, 0.45, 0, 1);
        for (const k of sys.local()) {
          if ((k.pos.x - x) ** 2 + (k.pos.z - z) ** 2 > 2.8 * 2.8 || Math.abs(k.pos.y - y) > 3) continue;
          sp.got = true;
          e.rocks.forEach((c, i) => {
            if (c.st !== 2 || (c.x - x) ** 2 + (c.z - z) ** 2 > 24 * 24) return;
            c.st = 3;
            sys.layer('syrup').del(i);
            if (c.patch) sys.removePatch(c.patch);
            c.patch = null;
          });
          sys.fx.burst(x, y, z, ['#ffffff', '#ff7ab8', '#7fe8ff'], 22, 8, 0.7, 0.7, 6);
          sys.sound('chime');
          if (k === sys.race.player) sys.style('SWEET RELIEF', 20, 'gold');
          break;
        }
      }
    },
    end: SYRUP.end,
  },
  // Windmill Downs
  twisterCrossing: {
    name: 'Twister Crossing', icon: '🌪️', line: 'TWISTER CROSSING! It wanders over the striped path, wait for it to pass!', warn: 5, dur: 14, weight: 3, cue: 'twister',
    telegraph(sys, e) {
      e.spots = sys.spots(e, sys.wild ? 2 : 1, 0).map((p) => ({ ...p, side: e.rand() < 0.5 ? -1 : 1, ph: e.rand() * 6 }));
      e.spots.forEach((p, i) => sys.layer('band').set(i, sys.tr.patch(p.s - 8, p.s + 8, -p.hw, p.hw, { lift: 0.05, segs: 5 })));
      sys.layerColor('band', '#ffb347', 1.6);
    },
    begin(sys) { sys.sound('wind'); },
    update(sys, e, t) {
      const pl = sys.race.player;
      for (const p of e.spots) {
        const u = (t - 0.5) / 12;
        if (u < 0 || u > 1) continue;
        // Across the field and the road in about 12 s, wandering up and down the road as it goes.
        const q = sys.at(p.s + Math.sin(t * 0.9 + p.ph) * 7, p.side * (p.hw + 22) * (1 - 2 * u), 0.1);
        const x = q.x, y = q.y, z = q.z;
        sys.put('twister', x, y, z, 2.4, sys.time * 5);
        sys.hazard(x, z, 3.8);
        if (Math.random() < 0.8) sys.fx.soft.emit(x + (Math.random() - 0.5) * 4, y + Math.random() * 5, z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6, Math.random() < 0.5 ? '#9a8a6a' : '#7fae5a', 0.5, 0.2, 0.8, 0, 1, 0.8);
        for (const k of sys.local()) if ((k.pos.x - x) ** 2 + (k.pos.z - z) ** 2 < 3.4 * 3.4 && Math.abs(k.pos.y - y) < 4 && sys.hurt(k, 'bump') && k === pl) sys.toast('WHIRL!');
        if (pl && !pl.remote) {
          const d2 = (pl.pos.x - x) ** 2 + (pl.pos.z - z) ** 2;
          if (d2 < 9 * 9) p.near = true;
          else if (p.near && d2 > 13 * 13) {
            p.near = false;
            if ((pl._evHit || -9) < sys.time - 3) sys.style('TWISTER DANCE', 15, 'mint');
          }
        }
      }
    },
    end() {},
  },
  // Spooky Hollow
  ghostParade: {
    name: 'Ghost Parade', icon: '👻', line: 'GHOST PARADE! Friendly ghosts float across, slip through the gaps!', warn: 5, dur: 20, weight: 3, cue: 'ghost', vis: true,
    cross: { put: 'ghost', n: 4, step: 5, stagger: 0.55, cross: 3.4, period: 5.5, y: 1.6, r: 1.4, kind: 'bump', scale: 1.1, label: 'BOO-GIE', dur: 20, glow: '#9dff8a' },
    telegraph(sys, e) {
      e.spots = sys.spots(e, 3, 0).map((p) => ({ ...p, side: e.rand() < 0.5 ? -1 : 1 }));
      crossMarks(sys, e, this.cross, '#9dff8a');
    },
    begin(sys) { sys.sound('ghost'); },
    update(sys, e, t) {
      // Fog rolls in; lantern light marks the road edges.
      sys.setVis(0.5 * env(t, this.dur, 3, 3), '#2a2a52', '#8affc4');
      cross(sys, e, t, this.cross);
    },
    end() {},
  },
  // Jungle Ruins
  templeTremor: {
    name: 'Temple Tremor', icon: '🗿', line: 'TEMPLE TREMOR! Boulders drop on the circles, then the temple gate opens!', warn: 4, dur: 17, weight: 3, cue: 'rumble',
    ...TREMOR,
  },
  // Gearworks
  factoryAlarm: {
    name: 'Factory Alarm', icon: '🚨', line: 'FACTORY ALARM! Belts flip on every siren, presses slam on the beat!', warn: 4, dur: 18, weight: 3, cue: 'siren',
    telegraph(sys, e) {
      e.belts = sys.spots(e, 3, 0).map((p) => ({ ...p, len: 24 }));
      e.presses = sys.spots(e, 2, 4).map((p) => ({ ...p, r: 2.7 }));
      e.belts.forEach((p, i) => sys.layer('band').set(i, sys.tr.patch(p.s, p.s + p.len, -p.hw, p.hw, { lift: 0.05, segs: 6 })));
      sys.layerColor('band', '#ffcf2a', 1.5);
    },
    begin(sys, e) {
      sys.layer('band').clear();
      e.belts.forEach((p, i) => sys.layer('lane').set(i, sys.tr.patch(p.s, p.s + p.len, -p.hw, p.hw, { lift: 0.06, segs: 8 })));
      sys.layerColor('lane', '#ffb347', 1.6);
      sys.sound('siren');
      sys.shake(0.3);
    },
    update(sys, e, t, dt) {
      const pl = sys.race.player, fr = sys.fr;
      // Conveyors: forward for 5.5 s, then the siren and they run backwards, and so on.
      const phase = Math.floor(t / 5.5);
      sys.laneDir = phase % 2 ? -1 : 1;
      if (phase !== e.phase) { e.phase = phase; e.paid = {}; if (phase) sys.sound('siren'); }
      for (const k of sys.local()) {
        if (!k.grounded || k.path !== sys.tr) continue;
        for (const b of e.belts) {
          const u = sys.ahead(b.s, k.trk.s);
          if (u < 0 || u > b.len) continue;
          sys.tr.frame(k.trk.s, fr);
          if (sys.laneDir > 0 && k.vel.x * fr.tx + k.vel.z * fr.tz > k.baseTop * 1.15) continue;
          k.vel.x += fr.tx * sys.laneDir * 7 * dt;
          k.vel.z += fr.tz * sys.laneDir * 7 * dt;
          if (k === pl && sys.laneDir > 0 && !e.paid[b.s]) { e.paid[b.s] = 1; sys.style('CONVEYOR RIDE', 12, 'gold'); }
        }
      }
      // Presses: a 2.4 s beat. Hover, a quick slam, a moment down, then back up.
      if (t < 5) return;
      for (const c of e.presses) {
        const idx = Math.floor((t - 5) / 2.4), ph = (t - 5) - idx * 2.4;
        const h = ph < 1.1 ? 5.5 : ph < 1.25 ? lerp(5.5, 0, (ph - 1.1) / 0.15) : ph < 1.8 ? 0 : lerp(0, 5.5, (ph - 1.8) / 0.6);
        sys.put('press', c.x, c.y + h + 2.3, c.z, 2.6, 0);
        if (ph > 0.6 && ph < 1.9) sys.hazard(c.x, c.z, c.r);
        if (ph >= 1.25 && c.cyc !== idx) {
          c.cyc = idx;
          if (sys.near(c.x, c.z, 50)) { sys.sound('thud'); sys.shake(0.25); }
          sys.fx.burst(c.x, c.y + 0.4, c.z, ['#ffcf2a', '#ffffff', '#8a8f9c'], 10, 7, 0.5, 0.5, 10);
          for (const k of sys.local()) if ((k.pos.x - c.x) ** 2 + (k.pos.z - c.z) ** 2 < c.r * c.r && Math.abs(k.pos.y - c.y) < 3) sys.hurt(k, 'spin');
        }
        // A popup for driving under a raised press and out the other side.
        if (pl && !pl.remote) {
          const d2 = (pl.pos.x - c.x) ** 2 + (pl.pos.z - c.z) ** 2;
          if (d2 < c.r * c.r && h > 4) c.thru = true;
          else if (c.thru && d2 > (c.r + 2.5) ** 2) { c.thru = false; if ((pl._evHit || -9) < sys.time - 1) sys.style('UNDER THE PRESS', 20, 'gold'); }
        }
      }
    },
    end(sys) { sys.layer('lane').clear(); },
  },
  // Maple Ridge
  leafStorm: {
    name: 'Leaf Storm', icon: '🍂', line: 'LEAF STORM! Leaves hide the line, find the calm eye for a boost!', warn: 5, dur: 17, weight: 3, cue: 'wind', vis: true,
    telegraph(sys, e) { e.side = e.rand() < 0.5 ? -1 : 1; lanesMark(sys, e, 1, 26, { col: '#ffb347' }); },
    begin(sys) { sys.sound('wind'); },
    update(sys, e, t) {
      const k = env(t, this.dur, 2, 3), gs = gust(t, 2.8, 2.2), pl = sys.race.player;
      if (t > 5 && !e.live) lanesOpen(sys, e);
      // The wind swirls (it changes side with every gust) and drops to almost nothing in the eye.
      let calm = 1;
      if (pl && !pl.remote) calm = 0.1 + 0.9 * smoothstep(10, 40, Math.abs(sys.ahead(e.lanes[0].s + 13, pl.trk.s)));
      e.gust = gs.g * calm;
      const dir = (gs.n % 2 ? -1 : 1) * e.side;
      sys.mods.wind = dir * sys.amp * (2.4 + gs.g * 4.6) * k * calm;
      sys.mods.traction = 1 - 0.04 * k;
      sys.setVis(0.5 * k, '#b46a2c', '#ffd27a');
      sys.storm(dir, k, '#e8742c', 4);
      sys.storm(dir, k, '#ffb347', 3);
      lanesPay(sys, e, 'EYE OF THE STORM', 25);
    },
    end: lanesClose,
    kartEvent: surf('LEAF SURFER'),
  },
  // Neon Nebula
  powerSurge: {
    name: 'Power Surge', icon: '🔌', line: 'POWER SURGE! Lights out, follow the neon arrows, then the big show!', warn: 5, dur: 16, weight: 3, cue: 'siren', vis: true,
    telegraph(sys, e) { lanesMark(sys, e, 3, 26, { col: '#39f5ff' }); },
    begin(sys, e) { lanesOpen(sys, e); sys.sound('thunder'); },
    update(sys, e, t) {
      const pl = sys.race.player;
      lanesPay(sys, e, 'LIGHTS OUT', 20);
      lanesGlow(sys, e, ['#39f5ff', '#ff3dc8'], 1, 2);
      // Blackout from 1.5 s to 8 s: the fog turns near-black but the road edge glows and the lane arrows stay lit.
      const dark = smoothstep(0.3, 1.5, t) * (1 - smoothstep(7.2, 8.4, t));
      if (dark > 0) sys.setVis(0.7 * dark, '#0b0620', '#39f5ff');
      // Then the light show: four beats of colour.
      if (t > 8.4) {
        const beat = Math.floor((t - 8.4) / 1.3);
        const col = ['#ff3dc8', '#39f5ff', '#ffd23f', '#9dff8a'][beat % 4];
        if (beat !== e.beat && t < this.dur - 1) {
          e.beat = beat;
          sys.flash(0.16);
          const base = pl ? pl.trk.s : e.lanes[0].s;
          for (let i = 0; i < 3; i++) {
            const q = sys.at(base + 25 + Math.random() * 60, (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 8), 8 + Math.random() * 8);
            sys.fx.burst(q.x, q.y, q.z, [col, '#ffffff'], 24, 12, 0.9, 1, 4);
          }
          sys.sound('firework');
        }
        sys.setVis(0.2 * env(t - 8.4, this.dur - 8.4, 0.5, 1.5), col, col);
      }
    },
    end: lanesClose,
  },
  // Cloud Carnival
  fireworks: {
    name: 'Fireworks Finale', icon: '🎆', line: 'FIREWORKS FINALE! Sparkle lanes light up, rainbow gusts push you along!', warn: 4, dur: 16, weight: 3, cue: 'chime',
    telegraph(sys, e) { lanesMark(sys, e, sys.wild ? 5 : 4, 24, { col: '#ff9ae6' }); },
    begin(sys, e) { lanesOpen(sys, e); sys.sound('firework'); },
    update(sys, e, t) {
      const k = env(t, this.dur, 1.5, 2.5), gs = gust(t, 3, 1.8), pl = sys.race.player;
      e.gust = gs.g;
      const dir = gs.n % 2 ? -1 : 1;
      sys.mods.wind = dir * sys.amp * (1.2 + gs.g * 2.6) * k;
      sys.storm(dir, k, ['#ff7ab8', '#ffd23f', '#7fe8ff', '#9dff8a'][Math.floor(sys.time * 3) % 4], 3);
      lanesPay(sys, e, 'SPARKLE RUSH', 15);
      lanesGlow(sys, e, ['#ffffff', '#ff9ae6', '#ffd23f', '#7fe8ff'], k, 6);
      // A show in the sky ahead of the leading player.
      const n = Math.floor(t / 0.75);
      if (n !== e.nb && t < this.dur - 1.5) {
        e.nb = n;
        const q = sys.at((pl ? pl.trk.s : e.lanes[0].s) + 35 + Math.random() * 70, (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10), 14 + Math.random() * 10);
        sys.fx.burst(q.x, q.y, q.z, [['#ff7ab8', '#ffd23f'], ['#7fe8ff', '#ffffff'], ['#9dff8a', '#ffd23f']][n % 3], 26, 13, 1, 1.2, 5);
        if (n % 3 === 0) sys.sound('firework');
      }
    },
    end: lanesClose,
    kartEvent: surf('RAINBOW SURFER'),
  },
  // Glacier Gorge
  iceQuake: {
    name: 'Ice Quake', icon: '🧊', line: 'ICE QUAKE! Cracks run over the striped spots and the road turns to black ice!', warn: 4, dur: 15, weight: 3, cue: 'rumble',
    telegraph(sys, e) {
      e.cracks = sys.spots(e, sys.wild ? 4 : 3, 0).map((p) => ({ ...p, len: 22 + e.rand() * 8 }));
      e.cracks.forEach((p, i) => sys.layer('band').set(i, sys.tr.patch(p.s, p.s + p.len, -p.hw, p.hw, { lift: 0.05, segs: 6 })));
      sys.layerColor('band', '#9fe8ff', 1.6);
      sys.shake(0.2);
    },
    begin(sys) { sys.sound('rumble'); sys.layer('ice').mat.color.set('#3b5068'); sys.layer('ice').mat.opacity = 0.9; },
    update(sys, e, t) {
      const pl = sys.race.player;
      sys.mods.grip = 0.96;
      e.cracks.forEach((c, i) => {
        // One section at a time freezes, 2.6 s apart.
        if (!c.on && t >= i * 2.6) {
          c.on = true;
          c.patch = sys.addPatch('ice', c.s, c.len, 0, c.hw * 2);
          sys.layer('band').del(i);
          sys.layer('ice').set(i, sys.tr.patch(c.s, c.s + c.len, -c.hw, c.hw, { lift: 0.05, segs: 6 }));
          if (sys.near(c.x, c.z, 70)) { sys.sound('crack'); sys.shake(0.35); }
          sys.fx.burst(c.x, c.y + 0.5, c.z, ['#ffffff', '#9fe8ff'], 18, 9, 0.6, 0.6, 10, false);
        }
        // A popup for gliding over a black-ice section without leaving the road.
        if (c.on && pl && !pl.remote) {
          const u = sys.ahead(c.s, pl.trk.s);
          if (u >= 0 && u <= c.len) { c.in = true; if (pl.offroad) c.bad = true; }
          else if (c.in) { c.in = false; if (!c.bad) sys.style('BLACK ICE SLIDE', 15, 'gold'); c.bad = false; }
        }
      });
    },
    end(sys, e) { for (const c of e.cracks || []) if (c.patch) sys.removePatch(c.patch); sys.layer('ice').clear(); },
  },
  // Obsidian Rush
  glassCrack: {
    name: 'Glass Crack', icon: '💎', line: 'GLASS CRACK! Panels flash, then crack, drive the safe side!', warn: 4, dur: 18, weight: 3, cue: 'crack',
    telegraph(sys, e) {
      e.panels = sys.spots(e, sys.wild ? 4 : 3, 0).map((p, i) => ({ ...p, len: 20, side: e.rand() < 0.5 ? -1 : 1, off: i * 1.3 }));
      sys.layerColor('band', '#c9a8ff', 1.7);
    },
    begin(sys) { sys.sound('crack'); sys.layer('ice').mat.color.set('#4a2f8a'); sys.layer('ice').mat.opacity = 0.9; },
    update(sys, e, t) {
      const pl = sys.race.player;
      e.panels.forEach((c, i) => {
        // A learnable 4 s beat: the cracking half flashes for 1.3 s, cracks (low grip) for 1.8 s, then rests.
        const ph = (((t - c.off) % 4) + 4) % 4, st = t < c.off ? 'rest' : ph < 1.3 ? 'flash' : ph < 3.1 ? 'crack' : 'rest';
        if (st !== c.st) {
          const half = () => sys.tr.patch(c.s, c.s + c.len, c.side > 0 ? 0 : -c.hw, c.side > 0 ? c.hw : 0, { lift: 0.05, segs: 5 });
          if (c.st === 'crack') { sys.removePatch(c.patch); c.patch = null; sys.layer('ice').del(i); }
          if (c.st === 'flash') sys.layer('band').del(i);
          c.st = st;
          if (st === 'flash') sys.layer('band').set(i, half());
          if (st === 'crack') {
            sys.layer('ice').set(i, half());
            c.patch = sys.addPatch('ice', c.s, c.len, (c.side * c.hw) / 2, c.hw);
            if (sys.near(c.x, c.z, 60)) sys.sound('crack');
            sys.fx.burst(c.x + c.side * c.hw / 2, c.y + 0.5, c.z, ['#c9a8ff', '#ffffff'], 14, 8, 0.5, 0.6, 10, false);
          }
        }
        // A popup for crossing a cracked panel on the safe half.
        if (pl && !pl.remote && c.st === 'crack') {
          const u = sys.ahead(c.s, pl.trk.s);
          if (u >= 0 && u <= c.len) { c.in = true; if (Math.sign(pl.trk.d) === c.side) c.bad = true; }
        } else if (pl && c.in && c.st !== 'crack') { c.in = false; if (!c.bad) sys.style('GLASS WALKER', 15, 'gold'); c.bad = false; }
      });
    },
    end(sys, e) { for (const c of e.panels || []) if (c.patch) sys.removePatch(c.patch); sys.layer('ice').clear(); },
  },
  // Moonbase Loop
  meteorShower: {
    name: 'Meteor Shower', icon: '☄️', line: 'METEOR SHOWER! Craters pop up where the circles glow, gravity wobbles!', warn: 4, dur: 17, weight: 3, cue: 'siren', vis: true,
    ...METEORS,
  },
  // Jungle Odyssey: the river leg (a boat) and the sky leg (a plane)
  riverSurge: {
    name: 'River Surge', icon: '🌊', line: 'RIVER SURGE! The current speeds up in the glowing channels, ride it!', warn: 4, dur: 14, weight: 3, cue: 'wave', leg: { zone: 1, skew: 1.2 },
    ...streamEvent({ zone: 1, len: 30, col: '#7fe8ff', sound: 'wave', label: 'RIDE THE SURGE', glow: ['#ffffff', '#7fe8ff'], foam: true }),
  },
  jetStream: {
    name: 'Jet Stream', icon: '💨', line: 'JET STREAM! Fly through the glowing lanes for a boost!', warn: 4, dur: 14, weight: 3, cue: 'wind', leg: { zone: 2, skew: 1.15 },
    ...streamEvent({ zone: 2, len: 36, col: '#c9efff', margin: 5, sound: 'wind', label: 'JET STREAM', glow: ['#ffffff', '#c9efff'] }),
  },
  // Island Hopper: the canal leg (a boat) and the volcano leg (the road)
  harborSwell: {
    name: 'Harbor Swell', icon: '🌊', line: 'HARBOR SWELL! Big swells roll down the canal, catch one!', warn: 4, dur: 14, weight: 3, cue: 'wave', leg: { zone: 1, skew: 1.1 },
    ...streamEvent({ zone: 1, len: 26, col: '#7fe8ff', sound: 'wave', label: 'SWELL RIDER', glow: ['#ffffff', '#7fe8ff'], foam: true, move: 9 }),
  },
  ashCloud: {
    name: 'Ash Cloud', icon: '🌋', line: 'ASH CLOUD! Smoke rolls over the climb, ride the lit lanes through it!', warn: 4, dur: 15, weight: 3, cue: 'rumble', vis: true, leg: { leg: 1, skew: 1.1 },
    ...streamEvent({ len: 18, col: '#ffd23f', margin: 3, sound: 'rumble', label: 'ASH DASH', glow: ['#ffb347', '#ffd23f'], vis: 0.55, fog: '#5a4a48', edge: '#ff8a3a', ash: '#9a8a86' }),
  },
  // Balloon Battle arenas (events here only shove, slow and hop karts; the battle rules decide every balloon)
  stampede: {
    name: 'Hay Stampede', icon: '🐄', line: 'STAMPEDE! Hay carts roll over the striped lines, find the gaps!', warn: 4, dur: 16, weight: 3, cue: 'rumble',
    cross: { put: 'hay', n: 3, step: 7, stagger: 0.45, cross: 4.2, period: 5, y: 1.3, r: 1.7, kind: 'bump', scale: 1.1, label: 'HAY HOPPER', dur: 16, roll: true },
    telegraph(sys, e) {
      e.spots = sys.spots(e, 4, 0).map((p) => ({ ...p, side: e.rand() < 0.5 ? -1 : 1 }));
      crossMarks(sys, e, this.cross, '#ffcf2a');
    },
    begin(sys) { sys.sound('rumble'); },
    update(sys, e, t) { cross(sys, e, t, this.cross); sys.shake(0.08); },
    end() {},
  },
  whiteout: {
    name: 'Whiteout', icon: '❄️', line: 'WHITEOUT! Gusts shove you about, follow the glowing rim!', warn: 4, dur: 16, weight: 3, cue: 'wind', vis: true,
    telegraph(sys, e) { e.side = e.rand() < 0.5 ? -1 : 1; },
    begin(sys) { sys.sound('wind'); },
    update(sys, e, t) {
      const k = env(t, this.dur, 2, 3), gs = gust(t, 3.6, 1.8);
      const dir = (gs.n % 2 ? -1 : 1) * e.side;
      e.gust = gs.g;
      sys.mods.wind = dir * sys.amp * (2.2 + gs.g * 4.4) * k;
      sys.mods.traction = 1 - 0.05 * k;
      sys.setVis(0.62 * k, '#eef4ff');
      sys.storm(dir, k, '#ffffff', 6);
      if (gs.g > 0.6 && !e.gusted?.[gs.n]) { (e.gusted ||= {})[gs.n] = 1; sys.sound('wind'); }
    },
    end() {},
    kartEvent: surf('GUST SURFER'),
  },
  overload: {
    name: 'Overload', icon: '⚡', line: 'OVERLOAD! Lasers spin faster, boost strips flash on!', warn: 4, dur: 14, weight: 3, cue: 'siren',
    telegraph(sys, e) { lanesMark(sys, e, sys.wild ? 5 : 4, 24, { col: '#ff3dc8', margin: 6 }); },
    begin(sys, e) {
      lanesOpen(sys, e);
      sys.sound('thunder');
      e.lasers = sys.race.items.obstacles.filter((o) => o.type === 'laser').map((o) => ({ o, base: o.speed }));
    },
    update(sys, e, t) {
      // Faster lasers, with the phase kept so they never jump.
      const T = sys.race.session ? sys.race.netClock : sys.race.time;
      const m = 1 + 0.7 * env(t, this.dur, 1.5, 2);
      for (const l of e.lasers) { const v = l.base * m; l.o.ph += T * (l.o.speed - v); l.o.speed = v; }
      lanesPay(sys, e, 'OVERCHARGE', 15);
      lanesGlow(sys, e, ['#ff3dc8', '#39f5ff'], 1, 2);
    },
    end(sys, e) {
      const T = sys.race.session ? sys.race.netClock : sys.race.time;
      for (const l of e.lasers || []) { l.o.ph += T * (l.o.speed - l.base); l.o.speed = l.base; }
      lanesClose(sys, e);
    },
  },
  craterMeteors: {
    name: 'Meteor Strike', icon: '☄️', line: 'METEOR STRIKE! Craters pop up where the circles glow, hop the bumps!', warn: 4, dur: 16, weight: 3, cue: 'siren', vis: true,
    ...CRATER_METEORS,
  },
});
// Sandcastle Cove: the tide of Coral Cove, flooding the outer rim of the bowl in long arcs.
EVENTS.tideRush = {
  ...EVENTS.tide,
  name: 'Tide Rush', line: 'TIDE RUSH! The sea floods the outer rim, stay inland or ride the crest!', warn: 5, dur: 18,
  telegraph(sys, e) {
    const tr = sys.tr, fr = sys.fr;
    e.zones = sys.spots(e, 3, 0).map((p) => ({ ...p, len: 70 }));
    e.zones.forEach((z, i) => {
      tr.frame(z.s + z.len / 2, fr);
      z.hw = fr.hw;
      z.sea = Math.sign(fr.x * fr.rx + fr.z * fr.rz) || 1; // the outer side of the ring
      sys.layer('water').set(i, tr.patch(z.s, z.s + z.len, z.sea * fr.hw, -z.sea * fr.hw, { lift: 0.05, segs: 10 }));
    });
  },
};

// Where in the race (fractions of its time) an adventure leg is: { zone: 1 | 2 } or { leg: index }.
// Time follows distance roughly; `skew` stretches it where karts are slower or faster than average.
export function legWindow(tr, lg) {
  const L = tr.length, z = lg.zone && tr.zones.find((q) => q.kind === lg.zone);
  const a = z ? z.s0 : tr.legs[lg.leg] ? tr.legs[lg.leg].s : 0, b = z ? z.s0 + z.len : tr.legs[lg.leg + 1] ? tr.legs[lg.leg + 1].s : L;
  return [clamp(a / L * (lg.skew || 1), 0, 1), clamp(b / L * (lg.skew || 1), 0, 1)];
}

// ---------------------------------------------------------------- the runner
export class TrackEvents {
  // Returns null when this race has no events (time trials, the menu demo, Off, a track with none).
  static create(race, opts) {
    const mode = opts.evMode;
    const ids = race.trackDef.events;
    if (mode !== 'normal' && mode !== 'wild') return null;
    if (race.mode === 'tt' || race.mode === 'demo' || !ids || !ids.length) return null;
    const raceT = race.battle ? race.battle.timeLeft || BATTLE_TIME : estRaceTime(race.track.length, race.laps, race.speedClass.top);
    const wins = {};
    for (const id of ids) if (EVENTS[id].leg) wins[id] = legWindow(race.track, EVENTS[id].leg);
    const sched = schedule(opts.evSeed >>> 0, mode, ids, raceT, wins);
    return sched.length ? new TrackEvents(race, sched, mode) : null;
  }

  constructor(race, sched, mode) {
    this.race = race;
    this.tr = race.track;
    this.fx = race.fx;
    this.sched = sched;
    this.mode = mode;
    this.wild = mode === 'wild';
    this.amp = this.wild ? 1.2 : 1;
    this.fr = {};
    this._f2 = {};
    this._v = new THREE.Vector3();
    this.time = 0;
    this.laneDir = 1;
    this.edgeCol = '#ffcf6a';
    this.cur = null;
    this.hazards = [];
    this.mods = { grip: 1, traction: 1, gravity: 1, wind: 0 };
    this.hud = null;
    this.group = new THREE.Group();
    race.scene.add(this.group);
    this.layers = {};
    this.inst = {};
    // What the visibility modifier changes, to restore it afterwards.
    const w = race.world;
    this.base = {
      near: w.fog.near, far: w.fog.far, fog: w.fog.color.clone(), tint: race.grade.tint,
      sky: ['top', 'horizon', 'bottom'].map((n) => w.skyMat.uniforms[n].value.clone()),
      wvel: w.weather && w.weather.points ? w.weather.mat.uniforms.vel.value.clone() : null,
    };
    this.vis = 0;
    this.visCol = new THREE.Color();
    this._c = new THREE.Color();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  // ---- shared helpers the events use ----
  get feel() { return SHAKE[this.race.app.settings.shake] ?? 1; }
  local() { return this.race.karts.filter((k) => !k.remote && !k.out); }
  near(x, z, R) { const p = this.race.player; return !!p && (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < R * R; }
  // Signed distance along the lap from a to b.
  ahead(a, b) { const L = this.tr.length; let d = b - a; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; }
  sound(n) { if (this.race.mode !== 'demo') this.race.app.audio.play(n); }
  shake(a) { this.race.shake = Math.max(this.race.shake, a); }
  flash(a) { if (this.feel > 0) this.race.flash = Math.max(this.race.flash, a * Math.min(1, this.feel)); }
  style(label, pts, cls) { this.race.style(label, pts, cls); }
  toast(text) { if (this.race.mode !== 'demo') this.race.app.hud.toast(text); }
  hazard(x, z, r) { if (r > 0) this.hazards.push({ pos: { x, z }, r }); }

  // n spots spread round the main lap from the event's own random numbers,
  // `margin` metres in from the edges (0: the middle), off ramps, gaps, water and sky.
  // `within` limits them to a stretch: { zone: 1 | 2 } (a river or sky lane) or { s0, s1 }; `room` keeps that much road after each spot.
  spots(e, n, margin, within = null, room = 0) {
    const tr = this.tr, fr = this.fr, L = tr.length, out = [];
    let a = 0, b = L;
    if (within) {
      const z = within.zone && tr.zones.find((q) => q.kind === within.zone);
      if (within.zone && !z) return out;
      a = z ? z.s0 + 8 : within.s0;
      b = z ? z.s0 + z.len : within.s1;
    }
    for (let i = 0; i < n; i++) {
      let s = within ? a + ((i + 0.15 + e.rand() * 0.7) / n) * Math.max(1, b - a - room) : ((i + 0.15 + e.rand() * 0.7) / n) * L;
      const u = e.rand() * 2 - 1;
      for (let k = 0; !within && k < 20 && ((tr.zones.length && tr.zoneAt(s)) || (tr.voids.length && tr.isVoid(s)) || tr.rampHeight(s, 0) > 0 || s < 30 || s > L - 15); k++) s = (s + 9) % L;
      tr.frame(s, fr);
      const d = margin ? u * Math.max(0, fr.hw - margin) : 0;
      out.push({ s, d, hw: fr.hw, x: fr.x + fr.rx * d, z: fr.z + fr.rz * d, y: tr.heightAtFrame(fr, d) });
    }
    return out;
  }

  layer(name) {
    if (this.layers[name]) return this.layers[name];
    let mat, order = 2;
    if (name === 'ring') mat = glowBasic(ringTex(), '#ff7a1a', 2, { blending: THREE.AdditiveBlending });
    else if (name === 'band') mat = glowBasic(bandTex(), '#ff5a5f', 1.4);
    else if (name === 'lava') mat = glowBasic(blobTex(), '#ff8a2a', 2.2);
    else if (name === 'syrup') mat = glowBasic(blobTex('rgba(255,236,246,1)', 'rgba(255,120,190,0.95)', 'rgba(200,40,120,0.85)', 'rgba(120,10,70,0)'), '#ffffff', 1.5);
    else if (name === 'crater') mat = glowBasic(blobTex('rgba(25,25,35,0.9)', 'rgba(55,55,70,0.85)', 'rgba(225,228,240,0.95)', 'rgba(225,228,240,0)'), '#ffffff', 1.1);
    else if (name === 'water') { mat = glowBasic(waterTex(), '#ffffff', 1); this.waterTex = mat.map; order = 1; }
    else if (name === 'lane') { mat = glowBasic(TX.boostTexture(), '#ffffff', 1.8); mat.map.repeat.set(1, 2); this.laneTex = mat.map; }
    else if (name === 'edge') { mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf6a').multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }); order = 3; }
    else mat = stdMat({ map: TX.patchTexture(21), color: '#d4efff', roughness: 0.03, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3, emissive: new THREE.Color('#6fb8ff'), emissiveIntensity: 0.12 }); // ice
    return (this.layers[name] = new Layer(this.group, mat, order));
  }
  layerColor(name, col, k) { const l = this.layers[name]; if (l) l.mat.color.set(col).multiplyScalar(k); }
  waterline(cov) { this.layer('water'); this.waterTex.offset.x = 0.5 - cov; }

  // Instanced props drawn this frame (meteors, snow lumps, ghosts...): one draw call per kind.
  // Kinds: [obstacle model, material, how `rot` turns it: spin (yaw), tumble, roll].
  put(name, x, y, z, s = 1, rot = 0, yaw = 0) {
    let it = this.inst[name];
    if (!it) {
      const items = this.race.items, def = INST[name];
      const geo = def[0] === 'twister' ? items.geo.twister : def[0] === 'crate' ? items.geo.crate : items.geo.obs[def[0]];
      const mesh = new THREE.InstancedMesh(geo, def[1] === 'glow' ? items.glowMat : def[1] === 'twister' ? items.twisterMat : items.mat, POOL);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      it = this.inst[name] = { mesh, n: 0, how: def[2] };
    }
    if (it.n >= POOL) return;
    if (it.how === 'spin') this._e.set(0, rot, 0);
    else if (it.how === 'roll') this._e.set(rot, yaw, 0, 'YXZ');
    else this._e.set(rot, rot * 0.7, 0);
    this._q.setFromEuler(this._e);
    this._m.compose(this._p.set(x, y, z), this._q, this._s.setScalar(s));
    it.mesh.setMatrixAt(it.n++, this._m);
  }
  // World position of a spot on the road (s along, d across, `up` above the surface).
  at(s, d, up = 0) {
    const fr = this._f2;
    this.tr.frame(s, fr);
    return this._v.set(fr.x + fr.rx * d, this.tr.heightAtFrame(fr, clamp(d, -fr.hw, fr.hw)) + up, fr.z + fr.rz * d);
  }
  // The inside of the next bend: where a good driver would aim.
  bestD(s, margin = 3) {
    const a = this._f2, b = {};
    this.tr.frame(s, a);
    this.tr.frame(s + 14, b);
    return clamp(((b.tx - a.tx) * a.rx + (b.tz - a.tz) * a.rz) * 60, -(a.hw - margin), a.hw - margin);
  }
  // A shove from an event. Races: the kart's own hit (a spin or a bump).
  // Balloon Battle: balloons are decided by the battle rules, so an event only knocks the kart aside, slows it and hops it.
  hurt(k, kind = 'bump') {
    k._evHit = this.time;
    if (!this.race.battle) return k.hit(kind);
    if (k.starTime > 0 || k.rocketTime > 0 || k.ghostTime > 0 || k.finishedLock || (k._evHurt || -9) > this.time - 1.5) return false;
    k._evHurt = this.time;
    k.vel.x *= 0.55;
    k.vel.z *= 0.55;
    k.slip(0.9);
    if (k.grounded) { k.vy = 3; k.grounded = false; }
    return true;
  }

  // A timed road patch (ice, mud, sand, oil): karts read it like the track's own.
  addPatch(type, s, len, d, w) {
    const p = { s: ((s % this.tr.length) + this.tr.length) % this.tr.length, len, d, w, type, ev: true };
    this.tr.patches.push(p);
    return p;
  }
  removePatch(p) { const i = this.tr.patches.indexOf(p); if (i >= 0) this.tr.patches.splice(i, 1); }
  // A short-lived boost strip (the race's pad check picks it up).
  addLane(s, d, len) {
    const b = { s: ((s % this.tr.length) + this.tr.length) % this.tr.length, d, len, w: 4.6, ev: true };
    this.tr.boosts.push(b);
    this.layer('lane').set(b, this.tr.patch(b.s, b.s + len, d - b.w / 2, d + b.w / 2, { lift: 0.06, segs: 8 }));
    return b;
  }
  removeLane(b) {
    const i = this.tr.boosts.indexOf(b);
    if (i >= 0) this.tr.boosts.splice(i, 1);
    if (this.layers.lane) this.layers.lane.del(b);
  }

  // Visibility: fog closes in and the sky takes the storm's colour. The fog
  // never closes nearer than 55 m, and glowing strips mark the road edges.
  setVis(v, col, edge = '#ffcf6a') { if (v > this.vis) { this.vis = v; this.visCol.set(col); this.edgeCol = edge; } }
  _applyVis(v) {
    const b = this.base, w = this.race.world;
    v = clamp(v, 0, 0.85);
    w.fog.near = lerp(b.near, 2, v);
    w.fog.far = lerp(b.far, Math.min(b.far, 55), v);
    w.fog.color.copy(b.fog).lerp(this.visCol, v);
    ['top', 'horizon', 'bottom'].forEach((n, i) => w.skyMat.uniforms[n].value.copy(b.sky[i]).lerp(this.visCol, v * 0.92));
    this.race.grade.tint = v > 0 ? '#' + this._c.set(b.tint || '#ffffff').lerp(this.visCol, v * 0.25).getHexString() : b.tint;
    if (v > 0 && !this.layers.edge) {
      const tr = this.tr, L = this.layer('edge');
      L.set(1, tr.strip((i) => tr.hw[i] - 0.55, (i) => tr.hw[i] - 0.15, { lift: 0.07 }));
      L.set(-1, tr.strip((i) => -tr.hw[i] + 0.15, (i) => -tr.hw[i] + 0.55, { lift: 0.07 }));
    }
    if (this.layers.edge) {
      const L = this.layers.edge;
      L.flush();
      L.mat.opacity = smoothstep(0.1, 0.5, v) * 0.85;
      L.mat.color.set(this.edgeCol).multiplyScalar(2.2);
      L.mesh.visible = L.mat.opacity > 0;
    }
  }

  // Storm particles round the camera and the weather blown sideways.
  storm(side, k, col, n) {
    const race = this.race, cam = race.camera.position, p = race.player || race.karts[0];
    const w = race.world.weather;
    if (this.base.wvel && w) w.mat.uniforms.vel.value.copy(this.base.wvel).setX(this.base.wvel.x + side * 14 * k);
    if (!p || k <= 0) return;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const cnt = Math.round(n * k * (race.quality.weather ?? 1));
    for (let i = 0; i < cnt; i++) {
      const a = 4 + Math.random() * 26, l = (Math.random() - 0.5) * 30;
      this.fx.soft.emit(cam.x + fx * a - fz * l, cam.y - 1 + Math.random() * 6, cam.z + fz * a + fx * l, -fz * side * 16 + (Math.random() - 0.5) * 3, -1.5, fx * side * 16, col, 0.35, 0.25, 1.1, 0, 0, 0.8);
    }
  }

  // The sandstorm's dust wall, placed beside the player's kart (looks only).
  _wall(e, t) {
    const p = this.race.player || this.race.karts[0];
    const off = e.side * 30 * -t; // t < 0 while warning: on the windward side, closing in
    if (!p || off * e.side < -40 || Math.abs(off) > 140) { if (this.wallMesh) this.wallMesh.visible = false; return; }
    if (!this.wallMesh) {
      const mat = new THREE.MeshBasicMaterial({ map: dustTex(), color: '#e8c08a', transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      mat.map.repeat.set(3, 1);
      this.wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(220, 34), mat);
      this.wallMesh.renderOrder = 4;
      this.group.add(this.wallMesh);
    }
    const tk = p.trk;
    const rx = tk.rx ?? Math.cos(p.yaw), rz = tk.rz ?? -Math.sin(p.yaw);
    const m = this.wallMesh;
    m.visible = true;
    m.position.set(p.pos.x + rx * off, p.pos.y + 12, p.pos.z + rz * off);
    m.rotation.set(0, Math.atan2(rx, rz), 0);
    m.material.map.offset.x = (this.time * 0.08 * e.side) % 1;
    m.material.opacity = 0.9 * smoothstep(0, 18, Math.abs(off)) * smoothstep(140, 90, Math.abs(off));
  }

  // ---- the frame ----
  update(dt) {
    const race = this.race;
    this.time += dt;
    this.hazards.length = 0;
    const m = this.mods;
    m.grip = 1; m.traction = 1; m.gravity = 1; m.wind = 0;
    this.vis = 0;
    for (const it of Object.values(this.inst)) it.n = 0;
    const running = race.state === 'race' || race.state === 'finished';
    const t = race.netClock;
    // The event whose window we are in (they never overlap).
    let e = null;
    if (running) for (const s of this.sched) if (t >= s.warnAt && t < s.end) { e = s; break; }
    if (this.cur && this.cur !== e) this._end(this.cur);
    this.cur = e;
    let hud = null;
    if (e) {
      const def = EVENTS[e.id];
      if (!e.told) {
        e.told = true;
        e.rand = rng(e.seed);
        def.telegraph(this, e);
      }
      const et = t - e.at;
      if (et < 0) {
        if (def.telegraphUpdate) def.telegraphUpdate(this, e, et);
        const short = race.app.settings.evWarn === 'short';
        const secs = Math.ceil(-et);
        if (!short || -et <= 3) {
          hud = { id: e.id, icon: def.icon, name: def.name, line: short ? '' : def.line, phase: 'warn', secs };
          if (!e.cued) { e.cued = true; this.sound('evAlert'); this.sound(def.cue); }
        }
      } else {
        if (!e.began) { e.began = true; def.begin(this, e); }
        def.update(this, e, Math.min(et, def.dur), dt);
        hud = { id: e.id, icon: def.icon, name: def.name, phase: 'on', secs: Math.max(0, Math.ceil(def.dur - et)) };
      }
      if (def.wall) this._wall(e, et);
    }
    this.hud = race.player && race.player.finished ? null : hud;
    // Publish the modifiers, clamped small (kart.js reads race.evMods).
    const on = e && e.began;
    race.evMods = on ? { grip: clamp(m.grip, 0.6, 1), traction: clamp(m.traction, 0.6, 1), gravity: clamp(m.gravity, 0.6, 1.2), wind: clamp(m.wind, -8, 8) } : null;
    if (this.vis > 0 || this._visOn) { this._applyVis(this.vis); this._visOn = this.vis > 0; }
    // Warning marks pulse.
    for (const n of ['ring', 'band']) if (this.layers[n]) this.layers[n].mat.opacity = 0.72 + 0.28 * Math.sin(this.time * 9);
    for (const l of Object.values(this.layers)) l.flush();
    for (const it of Object.values(this.inst)) { it.mesh.count = it.n; it.mesh.visible = it.n > 0; it.mesh.instanceMatrix.needsUpdate = true; }
    if (this.laneTex) this.laneTex.offset.y = (this.laneTex.offset.y - dt * 1.6 * this.laneDir) % 1;
  }

  _end(e) {
    const def = EVENTS[e.id];
    if (e.told) def.end(this, e);
    if (e.ice) this.layer('ice').clear();
    if (this.layers.band) this.layers.band.clear();
    if (this.wallMesh) this.wallMesh.visible = false;
    if (this.base.wvel && this.race.world.weather) this.race.world.weather.mat.uniforms.vel.value.copy(this.base.wvel);
    this.race.evMods = null;
    this.laneDir = 1;
    // Whatever an event forgot: no timed patches, boost lanes or marks left behind.
    const tr = this.tr;
    tr.patches = tr.patches.filter((p) => !p.ev);
    tr.boosts = tr.boosts.filter((b) => !b.ev);
    for (const [n, l] of Object.entries(this.layers)) if (n !== 'edge') l.clear();
  }

  // A kart event from the race loop (drift boosts for gust surfing).
  kartEvent(k, type, data) {
    const e = this.cur;
    if (e && e.began && EVENTS[e.id].kartEvent) EVENTS[e.id].kartEvent(this, e, k, type, data);
  }

  dispose() {
    for (const l of Object.values(this.layers)) l.dispose();
    for (const it of Object.values(this.inst)) it.mesh.dispose();
    if (this.wallMesh) { this.wallMesh.geometry.dispose(); this.wallMesh.material.map.dispose(); this.wallMesh.material.dispose(); }
    this.race.scene.remove(this.group);
  }
}
