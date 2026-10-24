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
export function schedule(seed, mode, ids, raceT) {
  const out = [];
  const pool = (ids || []).filter((id) => EVENTS[id]);
  if (mode !== 'normal' && mode !== 'wild') return out;
  if (!pool.length || !(raceT > 0)) return out;
  const wild = mode === 'wild';
  const r = rng(seed);
  const stop = raceT * EV_LAST;
  let t = EV_FIRST + r() * (wild ? 5 : 20);
  let last = null;
  for (let n = 0; n < 12; n++) {
    // Weighted pick, never the same event twice in a row when there is a choice.
    const opts = pool.length > 1 ? pool.filter((id) => id !== last) : pool;
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
// A soft round blob (lava puddles).
const blobTex = () => canvasTex(128, 128, (g, w) => {
  const c = w / 2;
  const f = g.createRadialGradient(c, c, 0, c, c, c);
  f.addColorStop(0, 'rgba(255,255,255,1)');
  f.addColorStop(0.55, 'rgba(255,210,150,0.95)');
  f.addColorStop(0.8, 'rgba(180,60,20,0.85)');
  f.addColorStop(1, 'rgba(60,10,0,0)');
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

// ---------------------------------------------------------------- the runner
export class TrackEvents {
  // Returns null when this race has no events (time trials, the menu demo, Off, a track with none).
  static create(race, opts) {
    const mode = opts.evMode;
    const ids = race.trackDef.events;
    if (mode !== 'normal' && mode !== 'wild') return null;
    if (race.mode === 'tt' || race.mode === 'demo' || !ids || !ids.length) return null;
    const raceT = race.battle ? race.battle.timeLeft || BATTLE_TIME : estRaceTime(race.track.length, race.laps, race.speedClass.top);
    const sched = schedule(opts.evSeed >>> 0, mode, ids, raceT);
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
    this.time = 0;
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
  spots(e, n, margin) {
    const tr = this.tr, fr = this.fr, L = tr.length, out = [];
    for (let i = 0; i < n; i++) {
      let s = ((i + 0.15 + e.rand() * 0.7) / n) * L;
      const u = e.rand() * 2 - 1;
      for (let k = 0; k < 20 && ((tr.zones.length && tr.zoneAt(s)) || (tr.voids.length && tr.isVoid(s)) || tr.rampHeight(s, 0) > 0 || s < 30 || s > L - 15); k++) s = (s + 9) % L;
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
    else if (name === 'water') { mat = glowBasic(waterTex(), '#ffffff', 1); this.waterTex = mat.map; order = 1; }
    else if (name === 'lane') { mat = glowBasic(TX.boostTexture(), '#ffffff', 1.8); mat.map.repeat.set(1, 2); this.laneTex = mat.map; }
    else if (name === 'edge') { mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf6a').multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }); order = 3; }
    else mat = stdMat({ map: TX.patchTexture(21), color: '#d4efff', roughness: 0.03, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3, emissive: new THREE.Color('#6fb8ff'), emissiveIntensity: 0.12 }); // ice
    return (this.layers[name] = new Layer(this.group, mat, order));
  }
  layerColor(name, col, k) { const l = this.layers[name]; if (l) l.mat.color.set(col).multiplyScalar(k); }
  waterline(cov) { this.layer('water'); this.waterTex.offset.x = 0.5 - cov; }

  // Instanced props drawn this frame (meteors, snow lumps): one draw call each.
  put(name, x, y, z, s = 1, rot = 0) {
    let it = this.inst[name];
    if (!it) {
      const items = this.race.items;
      const geo = name === 'meteor' ? items.geo.obs.fireball : items.geo.obs.snowball;
      const mesh = new THREE.InstancedMesh(geo, name === 'meteor' ? items.glowMat : items.mat, 48);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
      it = this.inst[name] = { mesh, n: 0 };
    }
    if (it.n >= 48) return;
    this._e.set(rot, rot * 0.7, 0);
    this._q.setFromEuler(this._e);
    this._m.compose(this._p.set(x, y, z), this._q, this._s.setScalar(s));
    it.mesh.setMatrixAt(it.n++, this._m);
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
  setVis(v, col) { if (v > this.vis) { this.vis = v; this.visCol.set(col); } }
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
    for (const it of Object.values(this.inst)) { it.mesh.count = it.n; it.mesh.instanceMatrix.needsUpdate = true; }
    if (this.laneTex) this.laneTex.offset.y = (this.laneTex.offset.y - dt * 1.6) % 1;
  }

  _end(e) {
    const def = EVENTS[e.id];
    if (e.told) def.end(this, e);
    if (e.ice) this.layer('ice').clear();
    if (this.layers.band) this.layers.band.clear();
    if (this.wallMesh) this.wallMesh.visible = false;
    if (this.base.wvel && this.race.world.weather) this.race.world.weather.mat.uniforms.vel.value.copy(this.base.wvel);
    this.race.evMods = null;
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
