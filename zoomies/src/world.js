import * as THREE from 'three';
import { GeoBuilder, rng, pbrMat, stdMat, clamp, disposeObject } from './util.js';
import * as TX from './textures.js';
import { skyEnvironment } from './env.js';
import { Weather, Grass } from './weather.js';

export const THEMES = {
  meadow: {
    sky: ['#2c7be5', '#bfe6ff', '#e4f5ff'], sunGlow: '#fff2c4', stars: 0, fogNear: 160, fogFar: 760,
    sun: '#fff0d4', sunI: 2.6, sunDir: [-0.5, 0.9, 0.35], hemi: ['#d6ecff', '#5f8f3e', 1.35],
    road: 'asphalt', ground: 'grass', wall: 'redwhite', curb: ['#e8413c', '#ffffff'],
    groundTint: ['#ffffff', '#cfe6b0', '#f2ffd9'], beach: '#f1d79b', water: ['#1f8fd1', '#56d0f0'], lake: ['#2a8fd6', '#6fd6f5'],
    mountains: ['#4f8f45', '#77a35a', '#a7b8a0', '#ffffff'], clouds: 24, dust: '#b9d98f', wallSide: '#d9d4cc',
  },
  beach: {
    sky: ['#1f9fe8', '#c7f1ff', '#eafaff'], sunGlow: '#fff6d0', stars: 0, fogNear: 180, fogFar: 800,
    sun: '#fff4dc', sunI: 2.8, sunDir: [0.4, 0.85, 0.35], hemi: ['#e0f6ff', '#d8b98a', 1.4],
    road: 'boardwalk', ground: 'sand', wall: 'wood', curb: ['#19c3c9', '#ffffff'],
    groundTint: ['#ffffff', '#fff1d6', '#f6e2bf'], beach: '#f7e3b5', water: ['#0b8fc4', '#3fe0e0'], lake: ['#0fb0c9', '#7ff2e6'],
    mountains: ['#3f9a6a', '#5fb07a', '#8bc49a', '#c9e8c0'], clouds: 16, dust: '#f3dcae', wallSide: '#8a5a30', seaNear: true,
  },
  desert: {
    sky: ['#e7743f', '#ffd29a', '#ffe8c2'], sunGlow: '#fff0c0', stars: 0, fogNear: 160, fogFar: 780,
    sun: '#ffe2b8', sunI: 2.8, sunDir: [0.55, 0.7, -0.3], hemi: ['#ffe0b0', '#b0683a', 1.3],
    road: 'dirt', ground: 'sand', wall: 'sandstone', curb: ['#ff8a2b', '#fff1d0'],
    groundTint: ['#ffffff', '#f0c9a0', '#fff0dc'], beach: null, water: null, lake: ['#1aa6a0', '#5fe0c8'],
    mountains: ['#b65a31', '#cf7340', '#e39457', '#f1b47a'], mesa: true, clouds: 8, dust: '#f0c48c', wallSide: '#b8643a',
  },
  frost: {
    sky: ['#5a8fd6', '#d9ecff', '#f2f8ff'], sunGlow: '#ffffff', stars: 0, fogNear: 140, fogFar: 680,
    sun: '#f4f8ff', sunI: 2.3, sunDir: [-0.35, 0.8, -0.5], hemi: ['#e6f0ff', '#8aa6c8', 1.45],
    road: 'ice', ground: 'snow', wall: 'snowbank', curb: ['#2f7bff', '#ffffff'],
    groundTint: ['#ffffff', '#dbe8f7', '#f7fbff'], beach: '#cfe3f6', water: ['#6fa7d8', '#bfe3ff'], lake: ['#9fd0f5', '#e2f4ff'],
    mountains: ['#6d7f99', '#8d9fb8', '#c9d7e8', '#ffffff'], clouds: 18, dust: '#ffffff', wallSide: '#e3eefa',
  },
  candy: {
    sky: ['#ff8fc7', '#ffe0f0', '#fff4fa'], sunGlow: '#fffbe0', stars: 0, fogNear: 150, fogFar: 720,
    sun: '#fff4f8', sunI: 2.5, sunDir: [0.3, 0.9, 0.3], hemi: ['#fff0f8', '#d77ab0', 1.45],
    road: 'chocolate', ground: 'frosting', wall: 'candycane', curb: ['#ff3d6a', '#ffffff'],
    groundTint: ['#ffffff', '#ffe6f2', '#f6f0ff'], beach: null, water: null, lake: ['#5a2e18', '#8a4a28'],
    mountains: ['#ff8fc7', '#ffb3d6', '#ffd0e6', '#ffffff'], clouds: 20, dust: '#ffc7e2', wallSide: '#ffd6e6',
  },
  neon: {
    sky: ['#070419', '#3a1a6b', '#140a2e'], sunGlow: '#ff6ad5', stars: 1, fogNear: 130, fogFar: 700,
    sun: '#b9a6ff', sunI: 1.6, sunDir: [0.3, 0.8, 0.4], hemi: ['#8f7bff', '#2a1a55', 1.6],
    road: 'neon', ground: 'tiles', wall: 'neon', curb: ['#ff3dc8', '#39f5ff'],
    groundTint: ['#ffffff', '#b7a8ff', '#ffffff'], beach: null, water: null, lake: ['#1a0f40', '#3a1a8a'],
    mountains: null, clouds: 0, dust: '#b48cff', wallSide: '#1a1438', glowRoad: true,
  },
  volcano: {
    sky: ['#2a0f1e', '#b8452a', '#3a1414'], sunGlow: '#ff9a4a', stars: 0.6, fogNear: 120, fogFar: 640,
    sun: '#ffb27a', sunI: 2.0, sunDir: [-0.4, 0.7, 0.5], hemi: ['#ffb08a', '#3a1f24', 1.35],
    road: 'basalt', ground: 'ash', wall: 'basalt', curb: ['#ff5a1a', '#2b2527'],
    groundTint: ['#ffffff', '#d8c6c0', '#b8a6a6'], beach: null, water: null, lake: ['#ff3a00', '#ffc23a'],
    mountains: ['#2b2426', '#3b3134', '#4b3f42', '#6b3a2a'], volcano: true, clouds: 0, dust: '#6a5d60', wallSide: '#221c1d', glowRoad: true,
  },
  haunted: {
    sky: ['#140d24', '#4a3a6a', '#1c1430'], sunGlow: '#c8ffe0', stars: 0.7, fogNear: 90, fogFar: 520,
    sun: '#b8c8ff', sunI: 1.3, sunDir: [-0.4, 0.6, 0.5], hemi: ['#8a8ac8', '#2a2438', 1.4],
    road: 'cobble', ground: 'darkgrass', wall: 'iron', curb: ['#8a3aff', '#2a2438'],
    groundTint: ['#ffffff', '#c8d0c0', '#b0b8a8'], beach: null, water: null, lake: ['#10201c', '#2f5a48'],
    mountains: ['#221c30', '#2e2840', '#3a3452', '#5a5480'], clouds: 0, dust: '#5a5a6a', wallSide: '#231f2c',
  },
  jungle: {
    sky: ['#3a8fd8', '#c8f0d8', '#e8fff0'], sunGlow: '#fff6c0', stars: 0, fogNear: 120, fogFar: 600,
    sun: '#fff2cc', sunI: 2.4, sunDir: [0.3, 0.85, -0.4], hemi: ['#d8f0c8', '#2f6a2a', 1.4],
    road: 'slabs', ground: 'jungle', wall: 'mossstone', curb: ['#e8b83a', '#3a5a2a'],
    groundTint: ['#ffffff', '#cfe8b0', '#e0f5c8'], beach: '#c8b078', water: null, lake: ['#127064', '#4fc8a8'],
    mountains: ['#2f6a3a', '#3f8a4a', '#5aa860', '#8ac880'], clouds: 10, dust: '#8ab870', wallSide: '#6a6450',
  },
  factory: {
    sky: ['#5a4e62', '#e8b890', '#f4d8b8'], sunGlow: '#ffd8a0', stars: 0, fogNear: 110, fogFar: 560,
    sun: '#ffe0c0', sunI: 2.3, sunDir: [0.5, 0.55, 0.4], hemi: ['#f0d8c0', '#5a5050', 1.3],
    road: 'plate', ground: 'gravel', wall: 'hazard', curb: ['#ffcf2a', '#1d1a22'],
    groundTint: ['#ffffff', '#d8d4cc', '#c8c4bc'], beach: null, water: null, lake: ['#1e1c26', '#3c3a4a'],
    mountains: null, clouds: 6, dust: '#9a948a', wallSide: '#3a3640', skyline: true,
  },
  moon: {
    sky: ['#02030a', '#10142a', '#05060e'], sunGlow: '#ffffff', stars: 1.3, fogNear: 220, fogFar: 950,
    sun: '#ffffff', sunI: 3.0, sunDir: [-0.6, 0.5, 0.3], hemi: ['#8a9ab8', '#3a3c44', 1.1],
    road: 'regolith', ground: 'moondust', wall: 'barrier', curb: ['#6fd8ff', '#e6e9ef'],
    groundTint: ['#ffffff', '#d8dade', '#c8cace'], beach: null, water: null, lake: null,
    mountains: ['#4a4c54', '#5a5c64', '#6a6c74', '#8a8c94'], clouds: 0, dust: '#b0b2b8', wallSide: '#4a4c54', earth: true,
  },
  autumn: {
    sky: ['#4a8ad8', '#ffe0b8', '#fff0dc'], sunGlow: '#ffe0a0', stars: 0, fogNear: 150, fogFar: 700,
    sun: '#ffe2c0', sunI: 2.6, sunDir: [-0.45, 0.7, 0.4], hemi: ['#ffe8d0', '#8a5a2a', 1.35],
    road: 'leafy', ground: 'leaves', wall: 'fence', curb: ['#d9412a', '#fff2dc'],
    groundTint: ['#ffffff', '#f0d8b0', '#e8c8a0'], beach: null, water: null, lake: ['#2a6a8a', '#6ab0c8'],
    mountains: ['#8a4a2a', '#b8602a', '#d88a3a', '#f0c070'], clouds: 16, dust: '#c8903a', wallSide: '#6a4a2a',
  },
  garden: {
    sky: ['#6aa8e8', '#ffe8f0', '#fff4f8'], sunGlow: '#fff8e0', stars: 0, fogNear: 150, fogFar: 700,
    sun: '#fff4ec', sunI: 2.5, sunDir: [0.4, 0.8, 0.35], hemi: ['#fff0f4', '#6a8a4a', 1.4],
    road: 'paving', ground: 'moss', wall: 'bamboo', curb: ['#c83a2a', '#fff6e6'],
    groundTint: ['#ffffff', '#e0f0c8', '#f0fae0'], beach: '#e8dcc0', water: null, lake: ['#2a7ab0', '#6ad0e8'],
    mountains: ['#5a8a6a', '#7aa880', '#a8c8a8', '#ffffff'], clouds: 14, dust: '#c8d8a0', wallSide: '#8a7a5a',
  },
  cloud: {
    sky: ['#7fb8ff', '#ffe9f6', '#fff6fb'], sunGlow: '#fffbe6', stars: 0, fogNear: 170, fogFar: 760,
    sun: '#fffaf0', sunI: 2.5, sunDir: [-0.3, 0.9, 0.4], hemi: ['#ffffff', '#c7b8ff', 1.55],
    road: 'pastel', ground: 'cloud', wall: 'cloudrail', curb: ['#ff9ecb', '#9ee7ff'],
    groundTint: ['#ffffff'], beach: null, water: ['#f2eaff', '#ffffff'], lake: null,
    mountains: null, clouds: 60, dust: '#ffffff', wallSide: '#f4efff', floating: true,
  },
};

// Per-theme look: colour grade, weather, road gloss, sky clouds and grass.
export const THEME_FX = {
  meadow: {
    grade: { saturation: 1.12, tint: '#fff9f0', bloom: 0.7 }, weather: 'petals', roadRough: 0.8, clouds: 0.5, hills: 26,
    grass: ['#3f8f2f', '#8fd05a'], env: 1.0,
  },
  beach: {
    grade: { saturation: 1.12, tint: '#fffaf2', bloom: 0.7 }, weather: null, roadRough: 0.72, clouds: 0.35, hills: 10,
    grass: ['#8fa851', '#d6d38a'], env: 1.0,
  },
  desert: {
    grade: { saturation: 1.0, tint: '#fff8f2', contrast: 0.16, bloom: 0.7 }, weather: 'dust', roadRough: 0.95, clouds: 0.22, hills: 18,
    grass: ['#b98f4a', '#e3c27e'], env: 1.0, fill: 0.7,
  },
  frost: {
    grade: { exposure: 0.9, tint: '#f1f6ff', saturation: 1.05, bloom: 0.85 }, weather: 'snow', roadRough: 0.14, clouds: 0.55, env: 1.0, hills: 34,
  },
  candy: {
    grade: { saturation: 1.12, tint: '#fff7fb', bloom: 0.8 }, weather: 'sprinkles', roadRough: 0.32, clouds: 0.45, env: 1.05, hills: 22,
  },
  neon: {
    grade: { bloom: 1.7, threshold: 0.8, saturation: 1.15, vignette: 0.5, contrast: 0.16, flare: 0 }, weather: 'motes', roadRough: 0.3, clouds: 0,
    nebula: ['#6a2bd6', '#ff3dc8'], env: 1.1, fill: 0.8,
  },
  volcano: {
    grade: { bloom: 1.45, threshold: 0.85, tint: '#fff1e8', vignette: 0.45, contrast: 0.16, flare: 0.4 }, weather: 'embers', roadRough: 0.65, clouds: 0.3, hills: 24,
    cloudCol: ['#5a3a3a', '#1e1214'], env: 1.0,
  },
  haunted: {
    grade: { bloom: 1.35, threshold: 0.85, saturation: 1.05, vignette: 0.55, contrast: 0.18, tint: '#eef2ff', flare: 0 }, weather: 'wisps',
    roadRough: 0.55, clouds: 0.3, cloudCol: ['#4a4060', '#1a1428'], hills: 22, grass: ['#2c4433', '#4a6a50'], env: 1.15, fill: 0.85,
    nebula: ['#3a2a6a', '#1a5a4a'],
  },
  jungle: {
    grade: { saturation: 1.15, tint: '#f4fff0', bloom: 0.7 }, weather: 'jleaves', roadRough: 0.85, clouds: 0.4, hills: 32,
    grass: ['#2a6a26', '#6ab84f'], env: 1.0,
  },
  factory: {
    grade: { saturation: 1.0, contrast: 0.16, tint: '#fff4ea', bloom: 0.9, flare: 0.8 }, weather: 'sparks', roadRough: 0.42, clouds: 0.55,
    cloudCol: ['#9a8a88', '#4a4048'], hills: 0, env: 1.0,
  },
  moon: {
    grade: { contrast: 0.2, saturation: 1.05, bloom: 1.0, vignette: 0.45 }, weather: null, roadRough: 0.8, clouds: 0, hills: 28,
    nebula: ['#1a2a6a', '#4a1a5a'], env: 0.9, fill: 0.7,
  },
  autumn: {
    grade: { saturation: 1.12, tint: '#fff4e6', bloom: 0.7 }, weather: 'autumn', roadRough: 0.8, clouds: 0.45, hills: 34,
    grass: ['#8a7a2a', '#d0a040'], env: 1.0,
  },
  garden: {
    grade: { saturation: 1.12, tint: '#fffaf6', bloom: 0.75 }, weather: 'petals', roadRough: 0.7, clouds: 0.4, hills: 20,
    grass: ['#4a7a32', '#8ac860'], env: 1.0,
  },
  cloud: {
    grade: { exposure: 0.88, saturation: 1.22, contrast: 0.2, bloom: 0.8, threshold: 1.1 }, weather: 'sparkles', roadRough: 0.4, clouds: 0.6, env: 1.0, fill: 0.4,
  },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 glow; uniform vec3 sunDir; uniform float stars;
uniform float time; uniform float cover; uniform vec3 cloudLit; uniform vec3 cloudDark; uniform vec3 nebulaA; uniform vec3 nebulaB;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 sd = normalize(sunDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.75)) : mix(horizon, bottom, smoothstep(0.0, -0.15, h));
  float s = max(dot(d, sd), 0.0);
  // sun disc (HDR, so it blooms), tight halo and broad glow
  col += glow * (smoothstep(0.99955, 0.9998, s) * 14.0 + pow(s, 280.0) * 1.2 + pow(s, 12.0) * 0.28);
  if (dot(nebulaA, nebulaA) > 0.0 && h > 0.0) {
    vec2 q = d.xz / (h + 0.4) * 2.2;
    float n = fbm(q + vec2(time * 0.004, 0.0));
    float n2 = fbm(q * 1.7 - 3.1);
    col += (nebulaA * smoothstep(0.45, 0.85, n) + nebulaB * smoothstep(0.5, 0.9, n2) * 0.7) * smoothstep(0.02, 0.4, h) * 0.55;
  }
  if (cover > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.25 + vec2(time * 0.006, time * 0.0025);
    float n = fbm(uv);
    float c = smoothstep(1.0 - cover, 1.25 - cover, n);
    // light the cloud from the sun side by sampling towards it
    float lit = clamp(0.55 + (n - fbm(uv + sd.xz * 0.12)) * 2.5, 0.0, 1.0);
    vec3 cc = mix(cloudDark, cloudLit, lit);
    cc += glow * pow(s, 10.0) * 0.8 * (1.0 - c);
    c *= smoothstep(0.0, 0.2, h);
    col = mix(col, cc, c * 0.94);
  }
  if (stars > 0.01 && h > 0.02) {
    vec3 cell = floor(d * 260.0);
    float n = hash(cell);
    float tw = step(0.9965, n) * (0.7 + 0.3 * sin(time * 3.0 + n * 90.0));
    col += vec3(tw) * smoothstep(0.02, 0.3, h) * (0.8 + 1.2 * hash(cell + 3.1)) * stars;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const WATER_VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */ `
uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform float scale; uniform float mode;
uniform vec3 skyTop; uniform vec3 skyHorizon; uniform vec3 sunCol; uniform vec3 sunDir; uniform vec4 lake;
varying vec3 vWorld;
#include <fog_pars_fragment>
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Sum of travelling waves; returns height, writes the slope.
float waves(vec2 p, float t, out vec2 g) {
  float h = 0.0;
  g = vec2(0.0);
  vec2 d; float ph;
  d = vec2(0.8, 0.6);   ph = dot(d, p) * 0.09 + t * 0.9;  h += sin(ph) * 0.5;  g += d * cos(ph) * 0.5 * 0.09;
  d = vec2(-0.5, 0.86); ph = dot(d, p) * 0.13 + t * 1.1;  h += sin(ph) * 0.35; g += d * cos(ph) * 0.35 * 0.13;
  d = vec2(0.2, -0.98); ph = dot(d, p) * 0.31 + t * 1.7;  h += sin(ph) * 0.14; g += d * cos(ph) * 0.14 * 0.31;
  d = vec2(-0.93, -0.36); ph = dot(d, p) * 0.57 + t * 2.3; h += sin(ph) * 0.07; g += d * cos(ph) * 0.07 * 0.57;
  return h;
}
void main() {
  vec2 p = vWorld.xz * scale;
  vec2 g;
  float wh = waves(p, time, g);
  float w2 = noise(p * 0.35 + time * 0.25);
  vec3 col;
  if (mode > 1.5) {
    // Sea of clouds: soft billows that catch the sun.
    float n = noise(p * 0.04 + time * 0.02) * 0.6 + noise(p * 0.11 - time * 0.03) * 0.4;
    col = mix(deep, shallow, smoothstep(0.25, 0.8, n));
    col += sunCol * pow(max(n, 0.0), 3.0) * 0.25;
  } else if (mode > 0.5) {
    // Lava: dark crust drifting over a white-hot flow (HDR so it glows).
    float n = noise(p * 0.18 + vec2(time * 0.12, time * 0.05)) * 0.65 + noise(p * 0.5 - time * 0.2) * 0.35;
    float crust = smoothstep(0.42, 0.62, n);
    vec3 hot = mix(deep, shallow, 0.5 + 0.5 * wh) * (2.2 + 1.6 * w2);
    col = mix(hot, vec3(0.08, 0.03, 0.03), crust * 0.85);
  } else {
    vec3 N = normalize(vec3(-g.x * 2.2, 1.0, -g.y * 2.2));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(skyHorizon, skyTop, clamp(R.y * 1.6, 0.0, 1.0));
    vec3 base = mix(deep, shallow, 0.4 + 0.25 * wh + 0.2 * w2);
    col = mix(base, sky, fres * 0.85);
    col += sunCol * pow(max(dot(R, normalize(sunDir)), 0.0), 220.0) * 5.0;
    float gl = h2(floor(p * 0.35));
    col += step(0.985, gl) * (0.5 + 0.5 * sin(time * 4.0 + gl * 40.0)) * 0.6;
    if (lake.z > 0.0) {
      // foam along the shore
      float e = length((vWorld.xz - lake.xy) / lake.zw);
      float f = smoothstep(0.84, 0.98, e + (noise(vWorld.xz * 0.35 + time * 0.4) - 0.5) * 0.08);
      col = mix(col, vec3(0.95), f * (0.55 + 0.25 * sin(time * 2.0 + e * 30.0)));
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function hash2(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < 4; o++) {
    s += a * vnoise(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s / 0.9375;
}

// An HDR colour: values above 1 feed the bloom.
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const glowMat = (c, k, extra = {}) => new THREE.MeshBasicMaterial({ color: hdr(c, k), fog: true, ...extra });

// Builds the complete visual environment for a track.
export class World {
  constructor(track, quality) {
    this.track = track;
    this.theme = THEMES[track.def.theme] || THEMES.meadow;
    this.fx = THEME_FX[track.def.theme] || THEME_FX.meadow;
    this.grade = { ...this.fx.grade };
    this.quality = quality;
    this.group = new THREE.Group();
    this.animated = [];
    this.textures = [];
    this.waterMats = [];
    this.time = 0;
    this.r = rng(track.def.id.length * 977 + (track.reverse ? 5 : 0));
    const k = track.def.scale ?? 1;
    this.lakes = (track.def.lakes || []).map((l) => ({ x: l.x * k, z: l.z * k, rx: l.rx * k, rz: l.rz * k, lava: !!l.lava }));
    this.lenScale = clamp(track.length / 1100, 0.8, 2.2);
    this._build();
  }

  _tex(t) {
    this.textures.push(t);
    return t;
  }

  _build() {
    const th = this.theme;
    const g = this.group;
    this.hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]);
    g.add(this.hemi);
    this.sun = new THREE.DirectionalLight(th.sun, th.sunI);
    this.sunDir = new THREE.Vector3(...th.sunDir).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(80);
    const shadows = this.quality.shadows;
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(shadows, shadows);
      const c = this.sun.shadow.camera;
      const R = shadows >= 2048 ? 56 : 46;
      c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 260;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
      this.sun.shadow.radius = this.quality.shadowRadius || 1.5;
      this.shadowR = R;
    }
    g.add(this.sun);
    g.add(this.sun.target);

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: {
        top: { value: new THREE.Color(th.sky[0]) }, horizon: { value: new THREE.Color(th.sky[1]) },
        bottom: { value: new THREE.Color(th.sky[2]) }, glow: { value: new THREE.Color(th.sunGlow) },
        sunDir: { value: this.sunDir.clone() }, stars: { value: th.stars }, time: { value: 0 },
        cover: { value: this.fx.clouds || 0 },
        cloudLit: { value: new THREE.Color((this.fx.cloudCol || ['#ffffff'])[0]) },
        cloudDark: { value: new THREE.Color((this.fx.cloudCol || [])[1] || th.sky[1]).lerp(new THREE.Color('#8a90a8'), this.fx.cloudCol ? 0 : 0.35) },
        nebulaA: { value: new THREE.Color(this.fx.nebula ? this.fx.nebula[0] : '#000000') },
        nebulaB: { value: new THREE.Color(this.fx.nebula ? this.fx.nebula[1] : '#000000') },
      },
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.skyMat = skyMat;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    // Drawn after the opaque scene so the cloud noise only runs where the sky shows.
    this.sky.renderOrder = 50;
    g.add(this.sky);
    this.fog = new THREE.Fog(th.sky[1], th.fogNear, th.fogFar);

    this.roadTex = this._tex(TX.roadTexture(th.road, 3));
    this.groundTex = this._tex(TX.groundTexture(th.ground, 11));
    this._buildGround();
    this._buildLakes();
    this._buildTrackSurface();
    this._buildShortcuts();
    this._buildStart();
    this._buildRampsAndPads();
    this._buildScenery();
    this._buildBackdrop();
    this.weather = new Weather(this.fx.weather, this.quality.weather ?? 1, this.theme);
    if (this.weather.points) g.add(this.weather.points);
  }

  // Image-based lighting from this theme's sky; replaces the hemisphere fill.
  applyEnvironment(renderer, scene) {
    const th = this.theme;
    // Lighting sky: the visible sky nudged towards the theme's fill colour so
    // night tracks still light the karts.
    const top = new THREE.Color(th.sky[0]).lerp(new THREE.Color(th.hemi[0]), 0.55);
    const horizon = new THREE.Color(th.sky[1]).lerp(new THREE.Color(th.hemi[0]), 0.25);
    this.envRT = skyEnvironment(renderer, {
      top, horizon, ground: th.hemi[1], glow: th.sunGlow, sunDir: th.sunDir,
    });
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = (this.fx.env ?? 1) * th.hemi[2] * 0.72;
    this.hemi.intensity = 0;
  }

  _waterMat(cols, { scale = 1, mode = 0, lake = null } = {}) {
    const th = this.theme;
    const m = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: { value: 0 }, deep: { value: new THREE.Color(cols[0]) }, shallow: { value: new THREE.Color(cols[1]) },
        scale: { value: scale }, mode: { value: mode },
        skyTop: { value: new THREE.Color(th.sky[0]) }, skyHorizon: { value: new THREE.Color(th.sky[1]) },
        sunCol: { value: new THREE.Color(th.sunGlow) }, sunDir: { value: this.sunDir.clone() },
        lake: { value: lake ? new THREE.Vector4(lake.x, lake.z, lake.rx, lake.rz) : new THREE.Vector4(0, 0, 0, 0) },
      }]),
      fog: true,
    });
    this.waterMats.push(m);
    return m;
  }

  _buildGround() {
    const th = this.theme;
    const tr = this.track;
    if (th.floating) {
      // A sea of clouds far below the floating track.
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), this._waterMat(['#d9d0f5', '#ffffff'], { scale: 0.5, mode: 2 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(tr.center.x, -26, tr.center.z);
      this.group.add(sea);
      return;
    }
    const hasWater = !!th.water;
    const R = tr.radius + (th.seaNear ? 150 : 230);
    this.groundR = hasWater ? R : R * 1.7;
    this._buildRoadField(this.groundR + 30);
    const amp = this.fx.hills || 0;
    const rings = 64, segs = 180;
    const pos = [], col = [], uv = [], idx = [];
    const r = rng(42);
    const tints = th.groundTint.map((c) => new THREE.Color(c));
    const beach = th.beach ? new THREE.Color(th.beach) : null;
    const noise = [];
    for (let s = 0; s < segs; s++) noise.push(0.9 + r() * 0.2);
    for (let i = 0; i <= rings; i++) {
      const f = i / rings;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const n = noise[s % segs] * (0.94 + 0.06 * Math.sin(a * 5 + 1.3));
        // wavy coastline: the outer rings take on the shoreline noise
        const rad = this.groundR * f * (hasWater ? 1 + (n - 1) * smooth(0.9, 1, f) : 1);
        const x = tr.center.x + Math.cos(a) * rad;
        const z = tr.center.z + Math.sin(a) * rad;
        let y = -0.25;
        const h = this.hillHeight(x, z);
        if (hasWater && f > 0.93) y = -0.25 - 2.75 * smooth(0.93, 1, f);
        else y += h;
        pos.push(x, y, z);
        uv.push(x / 14, z / 14);
        const c = tints[Math.floor(r() * tints.length)].clone();
        if (amp) c.multiplyScalar(0.94 + 0.14 * Math.min(1, h / amp));
        if (beach && f > 0.9) c.lerp(beach, smooth(0.9, 0.93, f));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let s = 0; s < segs; s++) {
        const a = i * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = this._tex(TX.groundTexture(th.ground));
    const gm = stdMat({ map: tex, vertexColors: true, roughness: th.ground === 'snow' ? 0.6 : 0.95 });
    this._detail(gm, tex, { bump: 1.4, rough: th.ground === 'snow' ? [0.35, 0.7] : [0.8, 1] }, 0.55);
    const ground = new THREE.Mesh(geo, gm);
    ground.receiveShadow = !!this.quality.shadows;
    this.group.add(ground);
    if (hasWater) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), this._waterMat(th.water));
      water.rotation.x = -Math.PI / 2;
      water.position.set(tr.center.x, -1.1, tr.center.z);
      this.group.add(water);
    }
  }

  // Distance from every point to the nearest road (main track and
  // shortcuts), on a 4-unit grid: road cells first, then a two-pass
  // chamfer sweep. Used to keep hills and grass off the road.
  _buildRoadField(extent) {
    const tr = this.track;
    const cell = 4;
    const x0 = tr.center.x - extent, z0 = tr.center.z - extent;
    const W = Math.ceil((2 * extent) / cell) + 1, H = W;
    const D = new Float32Array(W * H).fill(1e9);
    const mark = (p) => {
      for (let i = 0; i < p.count; i++) {
        const cr = (p.wd[i] + 2) / cell;
        const cx = (p.px[i] - x0) / cell, cz = (p.pz[i] - z0) / cell;
        for (let gz = Math.max(0, Math.floor(cz - cr)); gz <= Math.min(H - 1, Math.ceil(cz + cr)); gz++) {
          for (let gx = Math.max(0, Math.floor(cx - cr)); gx <= Math.min(W - 1, Math.ceil(cx + cr)); gx++) {
            if ((gx - cx) ** 2 + (gz - cz) ** 2 <= cr * cr) D[gz * W + gx] = 0;
          }
        }
      }
    };
    mark(tr);
    for (const sc of tr.shortcuts) mark(sc);
    const c1 = cell, c2 = cell * 1.4142;
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        let v = D[i];
        if (x > 0) v = Math.min(v, D[i - 1] + c1);
        if (z > 0) {
          v = Math.min(v, D[i - W] + c1);
          if (x > 0) v = Math.min(v, D[i - W - 1] + c2);
          if (x < W - 1) v = Math.min(v, D[i - W + 1] + c2);
        }
        D[i] = v;
      }
    }
    for (let z = H - 1; z >= 0; z--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = z * W + x;
        let v = D[i];
        if (x < W - 1) v = Math.min(v, D[i + 1] + c1);
        if (z < H - 1) {
          v = Math.min(v, D[i + W] + c1);
          if (x < W - 1) v = Math.min(v, D[i + W + 1] + c2);
          if (x > 0) v = Math.min(v, D[i + W - 1] + c2);
        }
        D[i] = v;
      }
    }
    this._rf = { D, W, H, x0, z0, cell };
  }

  roadDist(x, z) {
    const f = this._rf;
    if (!f) return 1e9;
    const gx = (x - f.x0) / f.cell, gz = (z - f.z0) / f.cell;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    if (ix < 0 || iz < 0 || ix >= f.W - 1 || iz >= f.H - 1) return 1e9;
    const tx = gx - ix, tz = gz - iz, D = f.D, i = iz * f.W + ix;
    return (D[i] * (1 - tx) + D[i + 1] * tx) * (1 - tz) + (D[i + f.W] * (1 - tx) + D[i + f.W + 1] * tx) * tz;
  }

  // Rolling hills away from the road; flat near roads, lakes and the coast.
  hillHeight(x, z) {
    const amp = this.fx.hills || 0;
    if (!amp || this.theme.floating) return 0;
    let m = smooth(16, 75, this.roadDist(x, z));
    if (m <= 0) return 0;
    for (const l of this.lakes) m *= smooth(1.15, 1.9, Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz));
    const tr = this.track;
    if (this.theme.water) m *= 1 - smooth(0.7, 0.88, Math.hypot(x - tr.center.x, z - tr.center.z) / this.groundR);
    if (m <= 0) return 0;
    const n = fbm2(x * 0.0062 + 17.3, z * 0.0062 - 5.1);
    return amp * m * smooth(0.28, 0.9, n) * (0.7 + 0.6 * fbm2(x * 0.02, z * 0.02));
  }

  // Height of the ground (not the road) at x, z.
  groundAt(x, z) {
    return -0.25 + this.hillHeight(x, z);
  }

  _buildLakes() {
    const th = this.theme;
    for (const l of this.lakes) {
      const cols = l.lava ? ['#ff2a00', '#ffc23a'] : th.lake || th.water;
      if (!cols) continue;
      const geo = new THREE.CircleGeometry(1, 48);
      // wobble the shoreline a little
      const p = geo.attributes.position;
      for (let i = 1; i < p.count; i++) {
        const a = Math.atan2(p.getY(i), p.getX(i));
        const k = 1 + Math.sin(a * 3 + l.x) * 0.06 + Math.sin(a * 5 + l.z) * 0.04;
        p.setXY(i, p.getX(i) * k, p.getY(i) * k);
      }
      const m = new THREE.Mesh(geo, this._waterMat(cols, { scale: 1.6, mode: l.lava ? 1 : 0, lake: l.lava ? null : l }));
      m.rotation.x = -Math.PI / 2;
      m.scale.set(l.rx, l.rz, 1);
      m.position.set(l.x, -0.12, l.z);
      this.group.add(m);
      // shore ring
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 48), stdMat({ color: l.lava ? '#1c1516' : th.beach || '#e8d6a8', roughness: 0.95 }));
      ring.receiveShadow = !!this.quality.shadows;
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(l.rx, l.rz, 1);
      ring.position.set(l.x, -0.14, l.z);
      this.group.add(ring);
    }
  }

  inLake(x, z, margin = 4) {
    for (const l of this.lakes) {
      const dx = (x - l.x) / (l.rx + margin), dz = (z - l.z) / (l.rz + margin);
      if (dx * dx + dz * dz < 1) return true;
    }
    return false;
  }

  // Relief + varying shine for a colour texture (see TX.surfaceMaps).
  _detail(mat, tex, opts, scale = 0.7) {
    const m = TX.surfaceMaps(tex, opts);
    mat.normalMap = this._tex(m.normal);
    mat.normalScale.set(scale, scale);
    mat.roughnessMap = this._tex(m.rough);
    mat.roughness = 1;
    return mat;
  }

  _roadMaterials(th) {
    const rough = this.fx.roadRough ?? 0.8;
    const roadMat = stdMat({ map: this.roadTex, roughness: rough, metalness: 0 });
    // Tarmac: glossier worn patches, rougher aggregate. Ice and neon stay glassy.
    this._detail(roadMat, this.roadTex, { bump: 1.6, rough: [Math.max(0.05, rough - 0.22), Math.min(1, rough + 0.1)] }, rough < 0.3 ? 0.25 : 0.45);
    if (th.glowRoad) {
      roadMat.emissiveMap = this.roadTex;
      roadMat.emissive = new THREE.Color('#ffffff');
      roadMat.emissiveIntensity = th.road === 'basalt' ? 0.6 : 0.9;
    }
    const curbTex = this._tex(TX.curbTexture(th.curb[0], th.curb[1]));
    const curbMat = stdMat({ map: curbTex, roughness: 0.55 });
    if (th.glowRoad) {
      curbMat.emissiveMap = curbTex;
      curbMat.emissive = new THREE.Color('#ffffff');
      curbMat.emissiveIntensity = 1.6;
    }
    const shMat = stdMat({ map: this.groundTex, color: '#f4f4f4', roughness: 0.95 });
    this._detail(shMat, this.groundTex, { bump: 1.6, rough: [0.75, 1] }, 0.6);
    const wallTex = this._tex(TX.wallTexture(th.wall));
    const wr = th.wall === 'snowbank' ? 0.6 : th.wall === 'candycane' ? 0.3 : 0.75;
    const wallMat = stdMat({ map: wallTex, roughness: wr });
    this._detail(wallMat, wallTex, { bump: 1.8, rough: [Math.max(0.1, wr - 0.2), Math.min(1, wr + 0.15)] }, 0.5);
    if (th.wall === 'neon' || th.wall === 'basalt') {
      wallMat.emissiveMap = wallTex;
      wallMat.emissive = new THREE.Color('#ffffff');
      wallMat.emissiveIntensity = th.wall === 'neon' ? 2.2 : 1.4;
    }
    const sideMat = stdMat({ color: th.wallSide || '#cccccc', roughness: 0.85 });
    return { roadMat, curbMat, shMat, wallMat, sideMat };
  }

  // Wall ribbons (inner face, top and outer skirt) for one side over [i0, i1].
  _walls(path, side, i0, i1, mats, H, floating) {
    const T = 0.7;
    const inner = path.ribbon((i, o) => {
      const d = side * path.wd[i], y = path.yAt(i, d);
      o[0] = path.px[i] + path.rx[i] * d; o[1] = y - 0.3; o[2] = path.pz[i] + path.rz[i] * d;
      o[3] = o[0]; o[4] = y + H; o[5] = o[2];
    }, (i) => [-side * path.rx[i], 0, -side * path.rz[i]], 1 / 8, i0, i1);
    const m1 = new THREE.Mesh(inner, mats.wallMat);
    m1.receiveShadow = !!this.quality.shadows;
    m1.castShadow = (this.quality.shadows || 0) >= 2048;
    this.group.add(m1);
    const top = path.ribbon((i, o) => {
      const d0 = side * path.wd[i], d1 = side * (path.wd[i] + T);
      const y = path.yAt(i, d0) + H;
      o[0] = path.px[i] + path.rx[i] * d0; o[1] = y; o[2] = path.pz[i] + path.rz[i] * d0;
      o[3] = path.px[i] + path.rx[i] * d1; o[4] = y; o[5] = path.pz[i] + path.rz[i] * d1;
    }, () => [0, 1, 0], 1 / 8, i0, i1);
    this.group.add(new THREE.Mesh(top, mats.sideMat));
    const outer = path.ribbon((i, o) => {
      const d = side * (path.wd[i] + T);
      const yTop = path.yAt(i, side * path.wd[i]) + H;
      o[0] = path.px[i] + path.rx[i] * d; o[1] = yTop; o[2] = path.pz[i] + path.rz[i] * d;
      o[3] = o[0]; o[4] = floating || path.bridge[i] ? yTop - H - 2.2 : -3; o[5] = o[2];
    }, (i) => [side * path.rx[i], 0, side * path.rz[i]], 1 / 8, i0, i1);
    this.group.add(new THREE.Mesh(outer, mats.sideMat));
  }

  _underside(path, i0, i1, mat) {
    const geo = path.ribbon((i, o) => {
      const w = path.wd[i] + 0.7;
      const yl = path.yAt(i, -path.wd[i]) - 2.5, yr = path.yAt(i, path.wd[i]) - 2.5;
      o[0] = path.px[i] - path.rx[i] * w; o[1] = yl; o[2] = path.pz[i] - path.rz[i] * w;
      o[3] = path.px[i] + path.rx[i] * w; o[4] = yr; o[5] = path.pz[i] + path.rz[i] * w;
    }, () => [0, -1, 0], 1 / 8, i0, i1);
    this.group.add(new THREE.Mesh(geo, mat));
  }

  _buildTrackSurface() {
    const th = this.theme;
    const tr = this.track;
    const shadows = !!this.quality.shadows;
    const mats = (this.mats = this._roadMaterials(th));
    const road = new THREE.Mesh(tr.strip((i) => -tr.hw[i], (i) => tr.hw[i], { vScale: 1 / 16, across: 2 }), mats.roadMat);
    road.receiveShadow = shadows;
    this.group.add(road);
    for (const side of [-1, 1]) {
      const a = (i) => side * tr.hw[i], b = (i) => side * tr.ed[i];
      const geo = side < 0 ? tr.strip(b, a, { vScale: 1 / 3, lift: 0.015 }) : tr.strip(a, b, { vScale: 1 / 3, lift: 0.015 });
      const m = new THREE.Mesh(geo, mats.curbMat);
      m.receiveShadow = shadows;
      this.group.add(m);
      const c = (i) => side * tr.ed[i], d = (i) => side * tr.wd[i];
      const geo2 = side < 0 ? tr.strip(d, c, { vScale: 1 / 14, uWorld: 14 }) : tr.strip(c, d, { vScale: 1 / 14, uWorld: 14 });
      const m2 = new THREE.Mesh(geo2, mats.shMat);
      m2.receiveShadow = shadows;
      this.group.add(m2);
    }
    // Walls, with gaps where shortcuts branch off.
    for (const side of [-1, 1]) {
      const gap = tr.gap[side > 0 ? 1 : 0];
      for (const [a, b] of tr.runs((i) => !gap[i])) this._walls(tr, side, a, b, mats, tr.wallH, th.floating);
    }
    // Bridge undersides and support pillars.
    const underMat = stdMat({ color: th.wallSide || '#aaaaaa', roughness: 0.9 });
    const pred = th.floating ? () => true : (i) => tr.bridge[i] === 1;
    for (const [a, b] of tr.runs(pred)) this._underside(tr, a, b, underMat);
    if (!th.floating) {
      const B = new GeoBuilder();
      for (let i = 0; i < tr.count; i += 7) {
        if (!tr.bridge[i]) continue;
        for (const side of [-1, 1]) {
          const d = side * (tr.wd[i] - 1);
          const x = tr.px[i] + tr.rx[i] * d, z = tr.pz[i] + tr.rz[i] * d;
          if (this._roadBelow(x, z, i)) continue;
          const top = tr.yAt(i, d) - 2.4;
          B.add(new THREE.CylinderGeometry(0.9, 1.1, top + 0.3, 8), th.wallSide || '#aaaaaa', [x, top / 2 - 0.3, z]);
        }
      }
      if (B.parts.length) {
        const pm = new THREE.Mesh(B.build(), pbrMat());
        pm.castShadow = shadows;
        pm.receiveShadow = shadows;
        this.group.add(pm);
      }
    }
  }

  // Is there another part of the road under (x, z), ignoring samples near i?
  _roadBelow(x, z, near) {
    const tr = this.track;
    for (let j = 0; j < tr.count; j += 2) {
      let di = Math.abs(j - near);
      di = Math.min(di, tr.count - di);
      if (di < 30) continue;
      const dx = x - tr.px[j], dz = z - tr.pz[j];
      if (dx * dx + dz * dz < (tr.wd[j] + 3) ** 2) return true;
    }
    return false;
  }

  _buildShortcuts() {
    const th = this.theme;
    const shadows = !!this.quality.shadows;
    for (const sc of this.track.shortcuts) {
      const mats = this.mats;
      let surf = mats.roadMat;
      if (sc.surface === 'dirt') surf = stdMat({ map: this._tex(TX.roadTexture('dirt', 5)), roughness: 0.95 });
      else if (sc.surface === 'ice') surf = stdMat({ map: this._tex(TX.roadTexture('ice', 6)), roughness: 0.06, emissive: new THREE.Color('#9fd0ff'), emissiveIntensity: 0.12 });
      else if (sc.surface === 'offroad') surf = stdMat({ map: this.groundTex, color: sc.def.deco === 'cotton' ? '#ffc6e4' : '#e8e8e8', roughness: 0.95 });
      else surf = mats.roadMat.clone();
      surf.polygonOffset = true;
      surf.polygonOffsetFactor = -1;
      surf.polygonOffsetUnits = -2;
      const shoulder = stdMat({ map: this.groundTex, color: '#eeeeee', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
      const e0 = Math.max(0, sc.entryEnd - 3), e1 = Math.min(sc.count - 1, sc.exitStart + 2);
      const pred = (i) => i >= e0 && i <= e1 && !sc.isVoid(i * sc.ds) && !sc.isVoid((i + 1) * sc.ds);
      for (const [a, b] of sc.runs(pred)) {
        const m = new THREE.Mesh(sc.strip((i) => -sc.hw[i], (i) => sc.hw[i], { vScale: 1 / 14, lift: 0.02, i0: a, i1: b }), surf);
        m.receiveShadow = shadows;
        this.group.add(m);
        for (const side of [-1, 1]) {
          const f0 = (i) => side * sc.hw[i], f1 = (i) => side * sc.wd[i];
          const geo = side < 0 ? sc.strip(f1, f0, { vScale: 1 / 14, uWorld: 14, lift: 0.02, i0: a, i1: b }) : sc.strip(f0, f1, { vScale: 1 / 14, uWorld: 14, lift: 0.02, i0: a, i1: b });
          const m2 = new THREE.Mesh(geo, shoulder);
          m2.receiveShadow = shadows;
          this.group.add(m2);
        }
      }
      const wpred = (i) => !sc.overlap[i] && !sc.isVoid(i * sc.ds);
      for (const side of [-1, 1]) for (const [a, b] of sc.runs(wpred)) this._walls(sc, side, a, b, mats, sc.wallH, th.floating);
      if (th.floating) for (const [a, b] of sc.runs(wpred)) this._underside(sc, a, b, stdMat({ color: th.wallSide, roughness: 0.9 }));
      this._shortcutDeco(sc);
      // Boost pads on shortcuts
      for (const b of sc.boosts) {
        const geo = sc.patch(b.s, b.s + b.len, -b.w / 2, b.w / 2, { lift: 0.06 });
        this._padMesh(geo);
      }
    }
  }

  _frameGroup(path, s, dy = 0) {
    const fr = path.frame(s, {});
    const g = new THREE.Group();
    g.position.set(fr.x, path.heightAtFrame(fr, 0) + dy, fr.z);
    g.rotation.y = Math.atan2(fr.tx, fr.tz);
    this.group.add(g);
    return { g, fr };
  }

  _shortcutDeco(sc) {
    const deco = sc.def.deco;
    const mid = sc.length * 0.5;
    const shadows = !!this.quality.shadows;
    const vc = pbrMat();
    const W = sc.wd[Math.floor(sc.count / 2)] + 0.8;
    if (deco === 'barn' || deco === 'house' || deco === 'warehouse') {
      const { g } = this._frameGroup(sc, mid);
      const wh = deco === 'warehouse';
      const B = new GeoBuilder(deco === 'barn' ? 'wood' : wh ? [0.4, 0.6, 0] : 'candy');
      const wallC = deco === 'barn' ? '#c8372d' : wh ? '#7c828e' : '#b8743e', trim = deco === 'barn' ? '#ffffff' : wh ? '#ffcf2a' : '#fff4f8';
      const roofC = deco === 'barn' ? '#5b3a29' : wh ? '#4a4e58' : '#ff8fc7';
      const L = 16, H = 7;
      for (const s of [-1, 1]) {
        B.add(new THREE.BoxGeometry(1, H, L), wallC, [s * W, H / 2, 0]);
        B.add(new THREE.BoxGeometry(1.2, 0.5, L + 0.4), trim, [s * W, H, 0]);
        B.add(new THREE.BoxGeometry(1.2, H, 0.5), trim, [s * W, H / 2, L / 2]);
        B.add(new THREE.BoxGeometry(1.2, H, 0.5), trim, [s * W, H / 2, -L / 2]);
        // roof halves
        B.add(new THREE.BoxGeometry(W * 1.25, 0.6, L + 2), roofC, [s * W * 0.52, H + W * 0.36, 0], [0, 0, -s * 0.62]);
      }
      if (deco === 'house') {
        for (let k = 0; k < 8; k++) B.add(new THREE.SphereGeometry(0.45, 12, 8), ['#ff3d6a', '#36a9ff', '#ffd23f', '#19e3b1'][k % 4], [(k % 2 ? 1 : -1) * (W + 0.6), 2 + (k >> 1) * 1.2, -6 + k * 1.7], [0, 0, 0], 1, 'gloss');
        B.add(new THREE.ConeGeometry(0.7, 2.2, 8), '#ffffff', [0, H + W * 0.8, 0], [0, 0, 0], 1, 'frosting');
        // warm windows glowing from inside
        for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.2, 1.6, 2.4), '#ffc46b', [s * (W + 0.52), 3.6, 0], [0, 0, 0], 1, 'glow');
      } else if (wh) {
        for (const z of [-5, 0, 5]) B.add(new THREE.BoxGeometry(W * 1.6, 0.25, 0.6), '#ffe8b0', [0, H - 0.4, z], [0, 0, 0], 1, 'glowHot');
        for (const s2 of [-1, 1]) B.add(new THREE.CylinderGeometry(0.35, 0.35, L, 10), '#c8ccd4', [s2 * (W - 0.8), H - 1.2, 0], [Math.PI / 2, 0, 0], 1, 'metal');
      } else {
        B.add(new THREE.BoxGeometry(0.4, 3, 0.4), trim, [W + 0.7, 1.5, L / 2 + 0.3], [0, 0, 0.6]);
        B.add(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 12), '#e8c65a', [W + 3, 0.7, 4], [0, 0, Math.PI / 2], 1, 'fabric');
        // lanterns inside the barn
        for (const z of [-4, 4]) B.add(new THREE.SphereGeometry(0.35, 10, 8), '#ffd27a', [0, H - 0.6, z], [0, 0, 0], 1, 'glowHot');
      }
      const m = new THREE.Mesh(B.build(), vc);
      m.castShadow = shadows;
      g.add(m);
    } else if (deco === 'cave' || deco === 'iceArch' || deco === 'crypt' || deco === 'ruins' || deco === 'log') {
      const ice = deco === 'iceArch';
      const CAVE = { cave: ['#b8643a', '#8a4527', '#ffd23f'], crypt: ['#3a3448', '#2a2438', '#9dff8a'], ruins: ['#8a8268', '#6a6450', '#ffcf5a'], log: ['#8a5a36', '#6a4424', '#ffb347'], iceArch: ['#bfe6ff', '#e8f7ff', '#9ff6ff'] }[deco];
      const s0 = sc.length * (ice ? 0.3 : 0.18), s1 = sc.length * (ice ? 0.7 : 0.82);
      const segsA = 9;
      const pos = [], col = [];
      const fr = {};
      const c1 = new THREE.Color(CAVE[0]), c2 = new THREE.Color(CAVE[1]);
      const rows = [];
      for (let s = s0; s <= s1 + 0.01; s += 2) {
        sc.frame(s, fr);
        const base = sc.heightAtFrame(fr, 0);
        const row = [];
        for (let k = 0; k <= segsA; k++) {
          const a = (k / segsA) * Math.PI;
          const R = W + 1.2 + Math.sin(k * 1.7 + s * 0.3) * 0.5;
          const d = Math.cos(a) * R, h = Math.sin(a) * (R * 0.85) - 0.5;
          row.push([fr.x + fr.rx * d, base + h, fr.z + fr.rz * d]);
        }
        rows.push(row);
      }
      for (let r = 0; r < rows.length - 1; r++) {
        for (let k = 0; k < segsA; k++) {
          const a = rows[r][k], b = rows[r][k + 1], c = rows[r + 1][k], d = rows[r + 1][k + 1];
          pos.push(...a, ...c, ...b, ...b, ...c, ...d);
          const cc = (r + k) % 3 === 0 ? c2 : c1;
          for (let q = 0; q < 6; q++) col.push(cc.r, cc.g, cc.b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const mat = stdMat({ vertexColors: true, side: THREE.DoubleSide, flatShading: true, roughness: ice ? 0.08 : 0.92 });
      if (ice) { mat.transparent = true; mat.opacity = 0.7; mat.emissive = new THREE.Color('#6fb8ff'); mat.emissiveIntensity = 0.35; }
      const tunnel = new THREE.Mesh(geo, mat);
      this.group.add(tunnel);
      // glowing crystals / lanterns inside
      const B = new GeoBuilder();
      for (let s = s0 + 6; s < s1; s += 14) {
        sc.frame(s, fr);
        const base = sc.heightAtFrame(fr, 0);
        for (const side of [-1, 1]) {
          const d = side * (W - 0.2);
          B.add(new THREE.OctahedronGeometry(0.6, 0), CAVE[2], [fr.x + fr.rx * d, base + 3.2, fr.z + fr.rz * d]);
        }
      }
      if (B.parts.length) this.group.add(new THREE.Mesh(B.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, color: hdr('#ffffff', 3) })));
    } else if (deco === 'neonRings' || deco === 'rainbow') {
      const rainbow = deco === 'rainbow';
      const cols = rainbow ? ['#ff5a5f', '#ffb13d', '#ffe45c', '#5fe08a', '#4fb8ff', '#b07aff'] : ['#39f5ff', '#ff3dc8'];
      if (rainbow) {
        const { g } = this._frameGroup(sc, sc.voids.length ? (sc.voids[0].s0 + sc.voids[0].s1) / 2 : mid, -2);
        cols.forEach((c, i) => {
          const m = new THREE.Mesh(new THREE.TorusGeometry(W + 6 - i * 1.1, 0.55, 8, 48, Math.PI), glowMat(c, 1.8));
          m.rotation.y = Math.PI / 2;
          g.add(m);
        });
      } else {
        for (let s = 10, k = 0; s < sc.length - 6; s += 22, k++) {
          const { g } = this._frameGroup(sc, s, 1.5);
          const m = new THREE.Mesh(new THREE.TorusGeometry(W + 1.5, 0.3, 8, 40), glowMat(cols[k % 2], 3.5));
          g.add(m);
          this.animated.push((dt, t) => { m.rotation.z = t * (k % 2 ? 1 : -1) * 0.8; });
        }
      }
    } else if (deco === 'lavaRocks' || deco === 'cotton' || deco === 'palms' || deco === 'bamboo') {
      const B = new GeoBuilder();
      const fr = {};
      const r = this.r;
      for (let s = 6; s < sc.length - 6; s += deco === 'palms' ? 26 : deco === 'bamboo' ? 8 : 9) {
        if (sc.isVoid(s)) continue;
        sc.frame(s, fr);
        const base = sc.heightAtFrame(fr, 0);
        for (const side of [-1, 1]) {
          const d = side * (W + 1.8 + r() * 2);
          const x = fr.x + fr.rx * d, z = fr.z + fr.rz * d;
          if (deco === 'lavaRocks') B.add(new THREE.ConeGeometry(1.2 + r(), 3 + r() * 5, 5), r() < 0.5 ? '#2b2527' : '#3d3336', [x, base + 1, z], [r() * 0.3, r() * 6, r() * 0.3], 1, 'stone');
          else if (deco === 'cotton') B.add(new THREE.IcosahedronGeometry(1.6 + r(), 2), ['#ffc6e4', '#c8e8ff', '#fff0f8'][Math.floor(r() * 3)], [x, base + 0.6, z], [0, 0, 0], 1, 'fabric');
          else if (deco === 'bamboo') B.addRaw(translate(P.bamboo(), x, base - 0.2, z, 0.8 + r() * 0.4));
          else {
            B.addRaw(P.palmAt(x, base - 0.2, z, 0.9 + r() * 0.3, r() * 6));
          }
        }
      }
      if (B.parts.length) {
        const m = new THREE.Mesh(B.build(), deco === 'lavaRocks' ? pbrMat({ flatShading: true }) : vc);
        m.castShadow = shadows && deco !== 'cotton';
        this.group.add(m);
      }
    }
  }

  _buildStart() {
    const tr = this.track;
    const checker = this._tex(TX.checkerTexture());
    const fr = tr.frame(0, {});
    const line = new THREE.Mesh(tr.patch(-1.5, 1.5, -fr.hw, fr.hw, { lift: 0.03, segs: 2 }), stdMat({ map: checker, roughness: 0.7 }));
    line.receiveShadow = !!this.quality.shadows;
    const uv = line.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i));
    this.group.add(line);
    const yaw = Math.atan2(fr.tx, fr.tz);
    const gantry = new THREE.Group();
    const B = new GeoBuilder('paint');
    const span = fr.wd + 1.2;
    const colA = '#1d1537', colB = '#ffd23f';
    for (const s of [-1, 1]) {
      B.add(new THREE.BoxGeometry(1.4, 9, 1.4), colA, [s * span, 4.5, 0]);
      B.add(new THREE.BoxGeometry(1.8, 0.6, 1.8), colB, [s * span, 0.3, 0]);
      B.add(new THREE.SphereGeometry(0.7, 16, 12), colB, [s * span, 9.4, 0], [0, 0, 0], 1, 'glow');
      // start lights
      for (let k = 0; k < 3; k++) B.add(new THREE.SphereGeometry(0.28, 12, 8), ['#ff3d3d', '#ffd23f', '#3dff8a'][k], [s * span, 7.6 - k * 0.8, -0.72], [0, 0, 0], 1, 'glowHot');
      if (this.theme.floating) B.add(new THREE.BoxGeometry(1.4, 4, 1.4), colA, [s * span, -2, 0]);
    }
    B.add(new THREE.BoxGeometry(span * 2 + 1.4, 0.5, 1.6), colA, [0, 9.0, 0]);
    const frame = new THREE.Mesh(B.build(), pbrMat());
    frame.castShadow = !!this.quality.shadows;
    gantry.add(frame);
    const bt = this._tex(TX.bannerTexture('ZOOMIES!'));
    const bannerW = span * 1.5;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, (bannerW * 96) / 512), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, fog: true }));
    banner.position.set(0, 7.2, 0);
    banner.rotation.y = Math.PI;
    gantry.add(banner);
    gantry.position.set(fr.x, tr.heightAtFrame(fr, 0) - 0.2, fr.z);
    gantry.rotation.y = yaw;
    this.group.add(gantry);
  }

  _padMesh(geo) {
    if (!this.padMat) {
      const padTex = this._tex(TX.boostTexture());
      padTex.repeat.set(1, 2);
      this.padTex = padTex;
      this.padMat = new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, fog: true, color: hdr('#ffffff', 1.8) });
    }
    const m = new THREE.Mesh(geo, this.padMat);
    m.renderOrder = 1;
    this.group.add(m);
  }

  // Road patches: black ice, oil, mud... shaped by a soft alpha puddle.
  _buildPatches() {
    const LOOK = {
      ice: { color: '#d4efff', roughness: 0.03, opacity: 0.8, emissive: '#6fb8ff', ei: 0.12 },
      oil: { color: '#120c18', roughness: 0.04, metalness: 0.35, opacity: 0.92 },
      mud: { color: '#5a3a22', roughness: 0.92, opacity: 0.95 },
      snow: { color: '#ffffff', roughness: 0.55, opacity: 0.95 },
      sand: { color: '#e6c68e', roughness: 0.95, opacity: 0.9 },
    };
    const mats = {};
    for (const p of [this.track, ...this.track.shortcuts]) {
      for (const pt of p.patches || []) {
        const L = LOOK[pt.type] || LOOK.ice;
        if (!mats[pt.type]) {
          const tex = this._tex(TX.patchTexture(pt.type.length * 7));
          mats[pt.type] = stdMat({
            map: tex, color: L.color, roughness: L.roughness, metalness: L.metalness || 0, transparent: true, opacity: L.opacity,
            depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3,
            emissive: new THREE.Color(L.emissive || '#000000'), emissiveIntensity: L.ei || 0,
          });
        }
        const geo = p.patch(pt.s, pt.s + pt.len, pt.d - pt.w / 2, pt.d + pt.w / 2, { lift: 0.035, segs: 10 });
        const m = new THREE.Mesh(geo, mats[pt.type]);
        m.receiveShadow = !!this.quality.shadows;
        m.renderOrder = 1;
        this.group.add(m);
      }
    }
  }

  _buildRampsAndPads() {
    this._buildPatches();
    const paths = [this.track, ...this.track.shortcuts];
    for (const b of this.track.boosts) this._padMesh(this.track.patch(b.s, b.s + b.len, b.d - b.w / 2, b.d + b.w / 2, { lift: 0.05 }));
    const rampTex = this._tex(TX.curbTexture('#ffd23f', '#1d1537'));
    const rampMat = stdMat({ map: rampTex, roughness: 0.45 });
    const glideTex = this._tex(TX.curbTexture('#36a9ff', '#ffffff'));
    const glideMat = stdMat({ map: glideTex, roughness: 0.35, emissiveMap: glideTex, emissive: new THREE.Color('#36a9ff'), emissiveIntensity: 0.9 });
    for (const p of paths) {
      for (const r of p.ramps) {
        const fr0 = p.frame(r.s, {});
        const hw = Math.min(fr0.hw, r.halfW ?? 99);
        const top = p.patch(r.s, r.s + r.len, -hw, hw, { lift: 0.03, segs: 8 });
        const uv = top.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 3);
        const mt = new THREE.Mesh(top, r.glide ? glideMat : rampMat);
        mt.receiveShadow = !!this.quality.shadows;
        this.group.add(mt);
        const fr = p.frame(r.s + r.len, {});
        const pts = [];
        for (const d of [-hw, hw]) {
          const base = fr.baseY + fr.slope * d + Math.abs(fr.slope) * fr.wd;
          pts.push([fr.x + fr.rx * d, base, fr.z + fr.rz * d], [fr.x + fr.rx * d, base + r.h, fr.z + fr.rz * d]);
        }
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute([...pts[0], ...pts[1], ...pts[2], ...pts[1], ...pts[3], ...pts[2]], 3));
        fg.computeVertexNormals();
        this.group.add(new THREE.Mesh(fg, stdMat({ color: '#1d1537', side: THREE.DoubleSide, roughness: 0.6 })));
      }
    }
  }

  // ---------------- Scenery ----------------
  _scatter(count, minD, maxD, spacing = 4) {
    const tr = this.track;
    const r = this.r;
    const out = [];
    const cell = new Map();
    const key = (x, z) => `${Math.floor(x / spacing)},${Math.floor(z / spacing)}`;
    let tries = 0;
    const floating = this.theme.floating;
    const seaR = this.theme.water && !floating ? tr.radius + (this.theme.seaNear ? 130 : 205) : Infinity;
    while (out.length < count && tries < count * 25) {
      tries++;
      const i = Math.floor(r() * tr.count);
      const side = r() < 0.5 ? -1 : 1;
      const d = side * (tr.wd[i] + minD + Math.pow(r(), 1.6) * (maxD - minD));
      const x = tr.px[i] + tr.rx[i] * d + (r() - 0.5) * 6;
      const z = tr.pz[i] + tr.rz[i] * d + (r() - 0.5) * 6;
      if (tr.clearance(x, z) < minD) continue;
      if (Math.hypot(x - tr.center.x, z - tr.center.z) > seaR) continue;
      if (this.inLake(x, z)) continue;
      const k = key(x, z);
      if (cell.has(k)) continue;
      cell.set(k, 1);
      out.push([x, z, floating ? tr.py[i] - 5 - r() * 10 : this.groundAt(x, z)]);
    }
    return out;
  }

  // Instanced props, split into spatial chunks so the camera and the shadow
  // pass can skip the ones out of view.
  _instanced(geo, mat, spots, { scale = [1, 1], tilt = 0, castShadow = true, colors = null, yScale = null } = {}) {
    if (!spots.length) return null;
    groundAO(geo);
    const r = this.r;
    const CH = 110;
    const buckets = new Map();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (const [x, z, y] of spots) {
      const sc = scale[0] + r() * (scale[1] - scale[0]);
      e.set((r() - 0.5) * tilt, r() * Math.PI * 2, (r() - 0.5) * tilt);
      q.setFromEuler(e);
      p.set(x, y ?? -0.25, z);
      const ys = yScale ? sc * (yScale[0] + r() * (yScale[1] - yScale[0])) : sc;
      s.set(sc, ys, sc);
      m.compose(p, q, s);
      const col = colors ? colors[Math.floor(r() * colors.length)] : null;
      const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push([m.clone(), col]);
    }
    const cast = castShadow && !!this.quality.shadows && this.quality.treeShadows;
    let first = null;
    for (const list of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([mm, col], i) => {
        mesh.setMatrixAt(i, mm);
        if (col) mesh.setColorAt(i, c.set(col));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = cast;
      mesh.receiveShadow = !!this.quality.shadows;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      first = first || mesh;
    }
    return first;
  }

  _buildScenery() {
    const theme = this.track.def.theme;
    const vc = pbrMat();
    this.propMat = vc;
    const dens = this.quality.density * this.lenScale;
    const n = (x) => Math.round(x * dens);
    const S = (count, minD, maxD, sp) => this._scatter(n(count), minD, maxD, sp);

    if (theme === 'meadow') {
      this._instanced(P.tree('#3f9b3a', '#57b848'), vc, S(150, 3, 100, 7), { scale: [0.8, 1.5] });
      this._instanced(P.tree('#ff9ecb', '#ffc2de'), vc, S(50, 3, 70, 7), { scale: [0.8, 1.3] });
      this._instanced(P.bush('#4ea83f'), vc, S(110, 1, 30, 4), { scale: [0.7, 1.4] });
      this._instanced(P.rock('#a9a9b8'), vc, S(40, 1, 80, 6), { scale: [0.6, 2.2], tilt: 0.5 });
      this._instanced(P.flowers(), vc, S(140, 0, 50, 3), { scale: [0.8, 1.3], castShadow: false, colors: ['#ffffff', '#fff27a', '#ff9ecb', '#ffb36b', '#c7a0ff'] });
      this._instanced(P.cow(), vc, S(12, 8, 60, 14), { scale: [1, 1.1] });
      this._landmarkWindmill();
      this._balloons(3);
    } else if (theme === 'beach') {
      this._instanced(P.palm(), vc, S(90, 2, 70, 7), { scale: [0.9, 1.35] });
      this._instanced(P.umbrella(), vc, S(40, 1, 30, 8), { scale: [0.9, 1.2], colors: ['#ff5a5f', '#ffd23f', '#19c3c9', '#ff8fc7', '#ffffff'] });
      this._instanced(P.rock('#b9a58a'), vc, S(40, 1, 60, 6), { scale: [0.6, 2.4], tilt: 0.6 });
      this._instanced(P.hut(), vc, S(8, 6, 40, 20), { scale: [1, 1.2] });
      this._instanced(P.starfish(), vc, S(60, 0, 25, 3), { scale: [0.8, 1.3], castShadow: false, colors: ['#ff8a5c', '#ffd23f', '#ff5a8a'] });
      this._lighthouse();
      this._boats();
    } else if (theme === 'desert') {
      this._instanced(P.cactus(), vc, S(90, 2, 90, 6), { scale: [0.8, 1.6] });
      this._instanced(P.rock('#c77a4a'), vc, S(70, 1, 90, 6), { scale: [0.7, 3.2], tilt: 0.6 });
      this._instanced(P.deadBush(), vc, S(70, 0, 50, 4), { scale: [0.8, 1.4], castShadow: false });
      this._instanced(P.palm(), vc, S(18, 4, 60, 9), { scale: [0.9, 1.3] });
      this._instanced(P.mesa(), vc, S(18, 55, 160, 40), { scale: [0.8, 1.6], yScale: [0.7, 1.3], castShadow: false });
      this._landmarkArch('#c8693a', '#e39457');
    } else if (theme === 'frost') {
      this._instanced(P.pine(), vc, S(190, 2, 100, 6), { scale: [0.8, 1.7] });
      this._instanced(P.snowman(), vc, S(10, 1, 25, 12), { scale: [1, 1.2] });
      this._instanced(P.rock('#8e9bb0', true), vc, S(40, 1, 80, 6), { scale: [0.7, 2.4], tilt: 0.5 });
      this._instanced(P.crystal(), vc, S(40, 1, 60, 6), { scale: [0.6, 1.6], tilt: 0.4, castShadow: false });
      this._instanced(P.igloo(), vc, S(6, 5, 50, 20), { scale: [1, 1.3] });
      this._landmarkArch('#bfe3ff', '#ffffff');
    } else if (theme === 'candy') {
      this._instanced(P.lollipop(), vc, S(60, 2, 70, 7), { scale: [0.9, 1.6], colors: ['#ff5a8a', '#36a9ff', '#ffd23f', '#19e3b1', '#b07aff'] });
      this._instanced(P.candyCane(), vc, S(50, 1, 50, 6), { scale: [0.9, 1.5] });
      this._instanced(P.gumdrop(), vc, S(120, 1, 60, 4), { scale: [0.7, 1.6], colors: ['#ff5a8a', '#36a9ff', '#ffd23f', '#19e3b1', '#b07aff', '#ff8a2b'] });
      this._instanced(P.cupcake(), vc, S(24, 3, 60, 10), { scale: [1, 1.6], colors: ['#ffffff', '#ffd6ea', '#d6f0ff', '#fff2b8'] });
      this._instanced(P.donut(), vc, S(20, 3, 60, 10), { scale: [1, 1.5], colors: ['#ff8fc7', '#6b3b24', '#ffd23f', '#c8a8ff'] });
      this._cake();
      this._balloons(4);
    } else if (theme === 'neon') {
      const win = this._tex(TX.windowsTexture(9));
      const bmat = stdMat({ map: win, emissiveMap: win, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 2.4, roughness: 0.25, metalness: 0.3 });
      const bgeo = new THREE.BoxGeometry(1, 1, 1);
      bgeo.translate(0, 0.5, 0);
      const spots = S(100, 6, 150, 14);
      const bm = new THREE.InstancedMesh(bgeo, bmat, spots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      const r = this.r;
      spots.forEach(([x, z], i) => {
        const w = 7 + r() * 9, h = 12 + r() * 50, dp = 7 + r() * 9;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
        m.compose(new THREE.Vector3(x, -0.3, z), q, new THREE.Vector3(w, h, dp));
        bm.setMatrixAt(i, m);
        bm.setColorAt(i, c.set(['#ffffff', '#c9b8ff', '#9ff6ff', '#ffc2f0'][i % 4]));
      });
      bm.instanceMatrix.needsUpdate = true;
      bm.computeBoundingSphere();
      this.group.add(bm);
      this._instanced(P.pylon(), pbrMat(), S(60, 0, 40, 8), { scale: [0.9, 1.3], castShadow: false });
      this._neonRings();
      this._planet('#ff7ad9', '#39f5ff');
    } else if (theme === 'volcano') {
      this._instanced(P.deadTree(), vc, S(70, 2, 80, 7), { scale: [0.8, 1.5] });
      this._instanced(P.rock('#3b3134'), pbrMat({ flatShading: true }), S(90, 1, 90, 6), { scale: [0.8, 3.4], tilt: 0.6 });
      this._instanced(P.crystal('#7a3cff', '#c08aff', 'glow'), vc, S(40, 1, 60, 6), { scale: [0.8, 2], tilt: 0.4, castShadow: false });
      this._instanced(P.vent(), vc, S(30, 1, 40, 8), { scale: [0.8, 1.4], castShadow: false });
    } else if (theme === 'cloud') {
      this._instanced(P.cloudPuff(), stdMat({ vertexColors: true, roughness: 1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.3, envMapIntensity: 0.6 }),
        S(140, 2, 90, 9), { scale: [1.2, 3.2], castShadow: false, colors: ['#ffffff', '#fff0f8', '#eef4ff', '#f6efff'] });
      this._floatingIslands();
      this._ferrisWheel();
      this._balloons(8);
    }
    else if (theme === 'haunted') {
      this._instanced(P.deadTree(), vc, S(90, 2, 90, 7), { scale: [1, 1.8] });
      this._instanced(P.pumpkin(), vc, S(50, 0.5, 30, 6), { scale: [0.8, 1.6], castShadow: false });
      this._instanced(P.grave(), vc, S(70, 1, 40, 4), { scale: [0.8, 1.2], tilt: 0.25 });
      this._instanced(P.lamp('#9dff8a'), vc, S(24, 0.5, 6, 18), { scale: [1, 1.1], castShadow: false });
      this._instanced(P.rock('#4a4458'), vc, S(40, 1, 80, 6), { scale: [0.7, 2.2], tilt: 0.5 });
      this._mansion();
      this._ghosts(7);
    } else if (theme === 'jungle') {
      this._instanced(P.jungleTree(), vc, S(90, 4, 100, 10), { scale: [0.8, 1.4] });
      this._instanced(P.palm(), vc, S(50, 2, 60, 8), { scale: [0.9, 1.4] });
      this._instanced(P.fern(), vc, S(160, 0.5, 40, 3), { scale: [0.8, 1.6], castShadow: false });
      this._instanced(P.flowers(), vc, S(90, 0, 40, 3), { scale: [0.9, 1.4], castShadow: false, colors: ['#ff3d6a', '#ffd23f', '#ff8a2b', '#c77dff'] });
      this._instanced(P.rock('#7d7862', true), vc, S(40, 1, 70, 6), { scale: [0.8, 2.6], tilt: 0.5 });
      this._temple();
    } else if (theme === 'factory') {
      this._instanced(P.tank(), vc, S(26, 8, 70, 18), { scale: [0.8, 1.3] });
      this._instanced(P.crates(), vc, S(60, 1, 30, 6), { scale: [0.8, 1.3] });
      this._instanced(P.gear(), vc, S(30, 3, 50, 10), { scale: [0.8, 1.6], tilt: 0.3 });
      this._instanced(P.lamp('#ffd27a'), vc, S(30, 0.5, 6, 18), { scale: [1, 1.2], castShadow: false });
      this._smokestacks();
      this._skyline(['#8a8e98', '#6e727c', '#9a8a7a', '#7a6a6a'], 0.7);
    } else if (theme === 'moon') {
      this._instanced(P.crater(), vc, S(60, 3, 120, 16), { scale: [1, 3.4], castShadow: false });
      this._instanced(P.rock('#8a8c92'), vc, S(70, 1, 100, 6), { scale: [0.6, 2.6], tilt: 0.6 });
      this._instanced(P.dome(), vc, S(8, 12, 70, 30), { scale: [1, 1.5] });
      this._instanced(P.antenna(), vc, S(10, 6, 50, 20), { scale: [0.9, 1.3] });
      this._instanced(P.lamp('#6fd8ff'), vc, S(24, 0.5, 6, 18), { scale: [1, 1.1], castShadow: false });
    } else if (theme === 'autumn') {
      this._instanced(P.tree('#d9602a', '#f09a3a'), vc, S(110, 3, 100, 7), { scale: [0.9, 1.5] });
      this._instanced(P.tree('#c8402a', '#e8b83a'), vc, S(70, 3, 90, 7), { scale: [0.8, 1.4] });
      this._instanced(P.pine(), vc, S(50, 4, 100, 8), { scale: [0.9, 1.6] });
      this._instanced(P.pumpkin(), vc, S(30, 0.5, 25, 6), { scale: [0.8, 1.4], castShadow: false });
      this._instanced(P.hay(), vc, S(24, 2, 40, 10), { scale: [0.9, 1.2] });
      this._instanced(P.bush('#b8602a'), vc, S(70, 1, 30, 4), { scale: [0.7, 1.4] });
      this._landmarkWindmill();
      this._balloons(3);
    } else if (theme === 'garden') {
      this._instanced(P.tree('#ff9ecb', '#ffc2de'), vc, S(90, 3, 90, 7), { scale: [0.8, 1.4] });
      this._instanced(P.bamboo(), vc, S(80, 1, 50, 5), { scale: [0.8, 1.3] });
      this._instanced(P.lantern(), vc, S(40, 0.5, 20, 8), { scale: [0.9, 1.2], castShadow: false });
      this._instanced(P.bush('#4ea83f'), vc, S(70, 1, 30, 4), { scale: [0.6, 1.2] });
      this._instanced(P.rock('#a8a498'), vc, S(40, 1, 60, 6), { scale: [0.6, 1.8], tilt: 0.4 });
      this._pagoda();
      this._torii(5);
    }
    const gq = this.quality.grass ?? 1;
    if (this.fx.grass && gq > 0) {
      const spots = this._grassSpots(Math.round(3200 * gq * this.lenScale), 26);
      if (spots.length) {
        this.grass = new Grass(this.fx.grass, spots, !!this.quality.shadows);
        this.group.add(this.grass.mesh);
      }
    }
  }

  // Grass tufts hugging the road edges. A coarse occupancy grid of the road
  // keeps this fast even for thousands of tufts.
  _grassSpots(count, maxD) {
    const tr = this.track;
    const cell = 2;
    const pad = 40 + maxD;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < tr.count; i++) {
      x0 = Math.min(x0, tr.px[i]); x1 = Math.max(x1, tr.px[i]);
      z0 = Math.min(z0, tr.pz[i]); z1 = Math.max(z1, tr.pz[i]);
    }
    x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
    const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((z1 - z0) / cell);
    const grid = new Uint8Array(W * H);
    const mark = (p) => {
      for (let i = 0; i < p.count; i++) {
        const R = p.wd[i] + 1.2;
        const cx = (p.px[i] - x0) / cell, cz = (p.pz[i] - z0) / cell, cr = R / cell;
        for (let gz = Math.max(0, Math.floor(cz - cr)); gz <= Math.min(H - 1, Math.ceil(cz + cr)); gz++) {
          for (let gx = Math.max(0, Math.floor(cx - cr)); gx <= Math.min(W - 1, Math.ceil(cx + cr)); gx++) {
            const dx = gx + 0.5 - cx, dz = gz + 0.5 - cz;
            if (dx * dx + dz * dz <= cr * cr) grid[gz * W + gx] = 1;
          }
        }
      }
    };
    mark(tr);
    for (const sc of tr.shortcuts) mark(sc);
    const r = rng(tr.def.id.length * 131 + 7);
    const seaR = this.theme.water ? tr.radius + (this.theme.seaNear ? 125 : 200) : Infinity;
    const out = [];
    for (let t = 0; t < count * 3 && out.length < count; t++) {
      const i = Math.floor(r() * tr.count);
      const side = r() < 0.5 ? -1 : 1;
      const d = side * (tr.wd[i] + 0.8 + Math.pow(r(), 1.7) * maxD);
      const x = tr.px[i] + tr.rx[i] * d + (r() - 0.5) * 3;
      const z = tr.pz[i] + tr.rz[i] * d + (r() - 0.5) * 3;
      const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
      if (gx < 0 || gz < 0 || gx >= W || gz >= H || grid[gz * W + gx]) continue;
      if (Math.hypot(x - tr.center.x, z - tr.center.z) > seaR || this.inLake(x, z, 2)) continue;
      out.push([x, z, this.groundAt(x, z)]);
    }
    return out;
  }

  _landmarkWindmill() {
    const tr = this.track;
    const spots = this._scatter(1, 16, 50, 30);
    if (!spots.length) return;
    const [x, z, gy] = spots[0];
    const B = new GeoBuilder('matte');
    B.add(new THREE.CylinderGeometry(2.2, 3.4, 16, 12), '#fff4e2', [0, 8, 0]);
    B.add(new THREE.ConeGeometry(3.2, 4, 12), '#e8413c', [0, 18, 0], [0, 0, 0], 1, 'paint');
    B.add(new THREE.BoxGeometry(1.6, 2.6, 0.4), '#7a4b2a', [0, 1.3, 3.1], [0, 0, 0], 1, 'wood');
    const tower = new THREE.Mesh(B.build(), this.propMat);
    tower.position.set(x, gy, z);
    tower.castShadow = !!this.quality.shadows;
    this.group.add(tower);
    const BB = new GeoBuilder('fabric');
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      BB.add(new THREE.BoxGeometry(1.4, 9, 0.2), '#fff8ec', [Math.sin(a) * 4.8, Math.cos(a) * 4.8, 0], [0, 0, -a]);
    }
    BB.add(new THREE.SphereGeometry(0.8, 12, 8), '#e8413c', [0, 0, 0], [0, 0, 0], 1, 'paint');
    const blades = new THREE.Mesh(BB.build(), this.propMat);
    blades.position.set(x, gy + 15.75, z);
    const look = Math.atan2(tr.center.x - x, tr.center.z - z);
    blades.rotation.y = look;
    tower.rotation.y = look;
    blades.translateZ(3.2);
    this.group.add(blades);
    this.animated.push((dt) => { blades.rotateZ(dt * 0.9); });
  }

  // Wobbly sheet ghosts floating by the road.
  _ghosts(count) {
    const B = new GeoBuilder([0.6, 0, 0.3]);
    B.add(new THREE.SphereGeometry(1, 16, 12), '#f2f0ff', [0, 1.4, 0]);
    B.add(new THREE.ConeGeometry(1, 2.2, 16, 1, true), '#f2f0ff', [0, 0.2, 0], [Math.PI, 0, 0]);
    for (const x of [-0.35, 0.35]) B.add(new THREE.SphereGeometry(0.16, 8, 6), '#9dff8a', [x, 1.55, 0.88], [0, 0, 0], 1, 'glowHot');
    const geo = B.build();
    const mat = pbrMat({ transparent: true, opacity: 0.72, depthWrite: false });
    const spots = this._scatter(count, 8, 40, 20);
    spots.forEach(([x, z, y], i) => {
      const m = new THREE.Mesh(geo, mat);
      this.group.add(m);
      const ph = i * 1.7;
      this.animated.push((dt, t) => {
        m.position.set(x + Math.sin(t * 0.3 + ph) * 6, y + 4 + Math.sin(t * 1.3 + ph) * 1.2, z + Math.cos(t * 0.3 + ph) * 6);
        m.rotation.y = t * 0.3 + ph + Math.PI / 2;
      });
    });
  }

  _mansion() {
    const spots = this._scatter(1, 30, 80, 40);
    if (!spots.length) return;
    const [x, z, gy] = spots[0];
    const B = new GeoBuilder('matte');
    B.add(new THREE.BoxGeometry(16, 10, 10), '#3a3448', [0, 5, 0]);
    B.add(new THREE.BoxGeometry(6, 16, 6), '#453e56', [-9, 8, 0]);
    B.add(new THREE.ConeGeometry(4.6, 7, 4), '#1f1a28', [-9, 19.5, 0], [0, Math.PI / 4, 0]);
    B.add(new THREE.ConeGeometry(11, 6, 4), '#1f1a28', [2, 13, 0], [0, Math.PI / 4, 0], [1, 1, 0.6]);
    for (let k = 0; k < 6; k++) B.add(new THREE.BoxGeometry(1.4, 2, 0.2), k % 3 ? '#ffcf5a' : '#9dff8a', [-5 + (k % 3) * 5, 3.5 + Math.floor(k / 3) * 4, 5.05], [0, 0, 0], 1, 'glow');
    B.add(new THREE.BoxGeometry(1.4, 1.8, 0.2), '#ffcf5a', [-9, 12, 3.05], [0, 0, 0], 1, 'glow');
    const m = new THREE.Mesh(B.build(), this.propMat);
    m.position.set(x, gy, z);
    m.rotation.y = Math.atan2(this.track.center.x - x, this.track.center.z - z);
    m.castShadow = !!this.quality.shadows;
    this.group.add(m);
  }

  _temple() {
    const spots = this._scatter(1, 30, 90, 40);
    if (!spots.length) return;
    const [x, z, gy] = spots[0];
    const B = new GeoBuilder('stone');
    for (let k = 0; k < 5; k++) B.add(new THREE.BoxGeometry(26 - k * 5, 4, 26 - k * 5), ['#9a9278', '#8a8268', '#a8a086'][k % 3], [0, 2 + k * 4, 0]);
    B.add(new THREE.BoxGeometry(5, 5, 5), '#8a8268', [0, 22.5, 0]);
    B.add(new THREE.BoxGeometry(2, 3, 0.3), '#ffcf5a', [0, 22, 2.55], [0, 0, 0], 1, 'glow');
    B.add(new THREE.BoxGeometry(4, 20, 1.2), '#8a8268', [0, 10, 13.5], [-0.45, 0, 0]);
    blotchMoss(B, 12);
    const m = new THREE.Mesh(B.build(), this.propMat);
    m.position.set(x, gy, z);
    m.rotation.y = Math.atan2(this.track.center.x - x, this.track.center.z - z);
    m.castShadow = !!this.quality.shadows;
    this.group.add(m);
  }

  _smokestacks() {
    const spots = this._scatter(3, 30, 90, 30);
    const smoke = new THREE.IcosahedronGeometry(1, 1);
    const smat = stdMat({ color: '#8a8488', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
    for (const [x, z, gy] of spots) {
      const B = new GeoBuilder('paint');
      for (let k = 0; k < 6; k++) B.add(new THREE.CylinderGeometry(2.4 - k * 0.12, 2.5 - k * 0.12, 6, 14), k % 2 ? '#f2f2f2' : '#c83a2a', [0, 3 + k * 6, 0]);
      B.add(new THREE.CylinderGeometry(1.8, 1.8, 0.6, 14), '#1d1a22', [0, 36.3, 0], [0, 0, 0], 1, 'metal');
      B.add(new THREE.SphereGeometry(0.4, 8, 6), '#ff3d3d', [2.3, 34, 0], [0, 0, 0], 1, 'glowHot');
      const m = new THREE.Mesh(B.build(), this.propMat);
      m.position.set(x, gy, z);
      m.castShadow = !!this.quality.shadows;
      this.group.add(m);
      const puffs = [];
      for (let k = 0; k < 6; k++) {
        const p = new THREE.Mesh(smoke, smat);
        this.group.add(p);
        puffs.push({ p, t: k / 6 });
      }
      this.animated.push((dt) => {
        for (const q of puffs) {
          q.t = (q.t + dt * 0.12) % 1;
          const sc = 2 + q.t * 7;
          q.p.scale.setScalar(sc);
          q.p.position.set(x + q.t * 10, gy + 38 + q.t * 30, z + q.t * 4);
        }
      });
    }
  }

  // A distant skyline of plain buildings with lit windows.
  _skyline(cols, glow = 0.7) {
    const win = this._tex(TX.windowsTexture(13));
    const bmat = stdMat({ map: win, emissiveMap: win, emissive: new THREE.Color('#ffd8a0'), emissiveIntensity: glow, roughness: 0.6 });
    const bgeo = new THREE.BoxGeometry(1, 1, 1);
    bgeo.translate(0, 0.5, 0);
    const spots = this._scatter(Math.round(50 * this.lenScale), 60, 190, 20);
    const bm = new THREE.InstancedMesh(bgeo, bmat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const r = this.r;
    spots.forEach(([x, z, y], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
      m.compose(new THREE.Vector3(x, y - 0.3, z), q, new THREE.Vector3(10 + r() * 14, 10 + r() * 34, 10 + r() * 14));
      bm.setMatrixAt(i, m);
      bm.setColorAt(i, c.set(cols[i % cols.length]));
    });
    bm.instanceMatrix.needsUpdate = true;
    bm.computeBoundingSphere();
    bm.receiveShadow = !!this.quality.shadows;
    this.group.add(bm);
  }

  _pagoda() {
    const spots = this._scatter(1, 25, 70, 40);
    if (!spots.length) return;
    const [x, z, gy] = spots[0];
    const B = new GeoBuilder('wood');
    let y = 0;
    for (let k = 0; k < 5; k++) {
      const w = 12 - k * 1.8;
      B.add(new THREE.BoxGeometry(w * 0.7, 4, w * 0.7), '#c83a2a', [0, y + 2, 0], [0, 0, 0], 1, 'paint');
      B.add(new THREE.ConeGeometry(w * 0.85, 2.2, 4), '#2a2a36', [0, y + 4.8, 0], [0, Math.PI / 4, 0], [1, 1, 1], 'metal');
      B.add(new THREE.BoxGeometry(w * 0.5, 1.2, 0.2), '#ffd27a', [0, y + 2.4, w * 0.35 + 0.05], [0, 0, 0], 1, 'glow');
      y += 5;
    }
    B.add(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), '#ffcf5a', [0, y + 2.5, 0], [0, 0, 0], 1, 'metal');
    const m = new THREE.Mesh(B.build(), this.propMat);
    m.position.set(x, gy, z);
    m.castShadow = !!this.quality.shadows;
    this.group.add(m);
  }

  // Red torii gates spanning the road.
  _torii(count) {
    const tr = this.track;
    for (let k = 0; k < count; k++) {
      const fr = tr.frame(tr.length * (0.08 + k / count), {});
      const W = fr.wd + 1.5, base = tr.heightAtFrame(fr, 0) - 0.2;
      const yaw = Math.atan2(fr.tx, fr.tz);
      const g = new THREE.Group();
      const P2 = new GeoBuilder('paint');
      for (const s2 of [-1, 1]) {
        P2.add(new THREE.CylinderGeometry(0.55, 0.65, 11, 12), '#d8342a', [s2 * W, 5.5, 0]);
        P2.add(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 12), '#2a2a36', [s2 * W, 0.3, 0], [0, 0, 0], 1, 'metal');
      }
      P2.add(new THREE.BoxGeometry(W * 2 + 4, 0.9, 1.2), '#2a2a36', [0, 11.2, 0], [0, 0, 0], 1, 'metal');
      P2.add(new THREE.BoxGeometry(W * 2 + 2.4, 0.8, 0.9), '#d8342a', [0, 10.2, 0]);
      P2.add(new THREE.BoxGeometry(W * 2 + 0.5, 0.6, 0.7), '#d8342a', [0, 8.2, 0]);
      const m = new THREE.Mesh(P2.build(), this.propMat);
      m.castShadow = !!this.quality.shadows;
      g.add(m);
      g.position.set(fr.x, base, fr.z);
      g.rotation.y = yaw;
      this.group.add(g);
    }
  }

  _balloons(count) {
    const tr = this.track;
    const r = this.r;
    const cols = [['#ff5a5f', '#ffd23f'], ['#36a9ff', '#ffffff'], ['#19e3b1', '#ff6b35'], ['#b07aff', '#ffe45c']];
    for (let i = 0; i < count; i++) {
      const cc = cols[i % cols.length];
      const B = new GeoBuilder([0.5, 0, 0]);
      B.add(new THREE.SphereGeometry(4, 24, 16), cc[0], [0, 6, 0], [0, 0, 0], [1, 1.15, 1]);
      B.add(new THREE.CylinderGeometry(4.05, 1.4, 3.2, 24, 1, true), cc[1], [0, 2.4, 0]);
      B.add(new THREE.BoxGeometry(1.6, 1.2, 1.6), '#8a5530', [0, -0.3, 0], [0, 0, 0], 1, 'wood');
      B.add(new THREE.SphereGeometry(0.45, 10, 8), '#ffb347', [0, 0.9, 0], [0, 0, 0], 1, 'glowHot');
      const m = new THREE.Mesh(B.build(), this.propMat);
      const a = r() * Math.PI * 2;
      const rad = tr.radius * (0.4 + r() * 0.8);
      const base = new THREE.Vector3(tr.center.x + Math.cos(a) * rad, 35 + r() * 30, tr.center.z + Math.sin(a) * rad);
      m.position.copy(base);
      this.group.add(m);
      const ph = r() * 10;
      this.animated.push((dt, t) => {
        m.position.y = base.y + Math.sin(t * 0.4 + ph) * 3;
        m.position.x = base.x + Math.sin(t * 0.05 + ph) * 20;
      });
    }
  }

  _landmarkArch(c1, c2) {
    const tr = this.track;
    const at = tr.length * 0.18;
    const fr = tr.frame(at, {});
    const R = fr.wd + 4;
    const B = new GeoBuilder('stone');
    B.add(new THREE.TorusGeometry(R, 3.2, 10, 32, Math.PI), c1, [0, 0, 0]);
    B.add(new THREE.TorusGeometry(R + 2.2, 1.2, 8, 32, Math.PI), c2, [0, 0, 0]);
    B.add(new THREE.CylinderGeometry(4.6, 5.4, 3, 8), c1, [R, 0, 0]);
    B.add(new THREE.CylinderGeometry(4.6, 5.4, 3, 8), c1, [-R, 0, 0]);
    const arch = new THREE.Mesh(B.build(), this.propMat);
    arch.position.set(fr.x, tr.heightAtFrame(fr, 0) - 1, fr.z);
    arch.rotation.y = Math.atan2(fr.tx, fr.tz);
    arch.castShadow = !!this.quality.shadows;
    this.group.add(arch);
  }

  _lighthouse() {
    const spots = this._scatter(1, 20, 60, 30);
    if (!spots.length) return;
    const [x, z, gy] = spots[0];
    const B = new GeoBuilder('paint');
    for (let k = 0; k < 5; k++) B.add(new THREE.CylinderGeometry(2.6 - k * 0.3, 2.9 - k * 0.3, 4, 16), k % 2 ? '#ffffff' : '#e8413c', [0, 2 + k * 4, 0]);
    B.add(new THREE.CylinderGeometry(1.8, 1.8, 2.4, 14), '#fff6c9', [0, 21.2, 0], [0, 0, 0], 1, 'glowHot');
    B.add(new THREE.ConeGeometry(2.2, 2.4, 14), '#1d1537', [0, 23.6, 0], [0, 0, 0], 1, 'metal');
    const m = new THREE.Mesh(B.build(), this.propMat);
    m.position.set(x, gy, z);
    m.castShadow = !!this.quality.shadows;
    this.group.add(m);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: hdr('#fff6c9', 1.5), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(13, 0, 0);
    const pivot = new THREE.Group();
    pivot.position.set(x, gy + 21.45, z);
    pivot.add(beam);
    this.group.add(pivot);
    this.animated.push((dt) => { pivot.rotation.y += dt * 0.8; });
  }

  _boats() {
    const tr = this.track;
    const r = this.r;
    for (let i = 0; i < 4; i++) {
      const B = new GeoBuilder('paint');
      B.add(new THREE.BoxGeometry(3, 1.2, 8), '#ffffff', [0, 0.4, 0]);
      B.add(new THREE.BoxGeometry(2.4, 0.6, 7.6), ['#ff5a5f', '#36a9ff', '#ffd23f', '#19c3c9'][i], [0, 1.1, 0]);
      B.add(new THREE.CylinderGeometry(0.15, 0.15, 7, 5), '#8a5530', [0, 4.5, 0.5]);
      B.add(new THREE.ConeGeometry(2.6, 6, 3), '#ffffff', [0, 4.8, -0.8], [0, Math.PI / 2, 0], [0.15, 1, 1], 'fabric');
      const m = new THREE.Mesh(B.build(), this.propMat);
      const a = r() * Math.PI * 2;
      const d = tr.radius + 190 + r() * 80;
      const bx = tr.center.x + Math.cos(a) * d, bz = tr.center.z + Math.sin(a) * d;
      m.position.set(bx, -1, bz);
      m.rotation.y = r() * 6;
      this.group.add(m);
      const ph = r() * 6;
      this.animated.push((dt, t) => { m.rotation.z = Math.sin(t * 1.2 + ph) * 0.06; m.position.y = -1 + Math.sin(t * 0.9 + ph) * 0.2; });
    }
  }

  _cake() {
    const spots = this._scatter(1, 18, 70, 30);
    if (!spots.length) return;
    const [x, z, gy] = spots[0];
    const B = new GeoBuilder('frosting');
    const tiers = [[14, 6, '#ffd6ea'], [10, 5, '#ffffff'], [6.5, 4.5, '#ff8fc7']];
    let y = 0;
    for (const [rad, h, c] of tiers) {
      B.add(new THREE.CylinderGeometry(rad, rad, h, 36), c, [0, y + h / 2, 0]);
      B.add(new THREE.TorusGeometry(rad, 0.6, 8, 36), '#ffffff', [0, y + h, 0], [Math.PI / 2, 0, 0]);
      y += h;
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      B.add(new THREE.CylinderGeometry(0.35, 0.35, 3, 6), ['#36a9ff', '#ffd23f', '#19e3b1', '#ff5a8a', '#b07aff'][k], [Math.cos(a) * 3.5, y + 1.5, Math.sin(a) * 3.5]);
      B.add(new THREE.SphereGeometry(0.4, 10, 8), '#ffb13d', [Math.cos(a) * 3.5, y + 3.3, Math.sin(a) * 3.5], [0, 0, 0], 1, 'glowHot');
    }
    B.add(new THREE.SphereGeometry(1.6, 20, 14), '#e8413c', [0, y + 1.4, 0], [0, 0, 0], 1, 'gloss');
    const m = new THREE.Mesh(B.build(), this.propMat);
    m.position.set(x, gy, z);
    m.castShadow = !!this.quality.shadows;
    this.group.add(m);
  }

  _floatingIslands() {
    const tr = this.track;
    const r = this.r;
    const B = new GeoBuilder('stone');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r();
      const d = tr.radius * (0.7 + r() * 0.9) + 60;
      const x = tr.center.x + Math.cos(a) * d, z = tr.center.z + Math.sin(a) * d;
      const y = -8 + r() * 30;
      const R = 10 + r() * 14;
      B.add(new THREE.ConeGeometry(R, R * 1.4, 7), '#b58a6a', [x, y - R * 0.7, z], [Math.PI, 0, 0]);
      B.add(new THREE.CylinderGeometry(R, R, 1.6, 7), '#8fe08a', [x, y + 0.8, z], [0, 0, 0], 1, 'leaf');
      for (let k = 0; k < 3; k++) B.addRaw(translate(P.tree('#5fd06a', '#8fe88a'), x + (r() - 0.5) * R, y + 1.4, z + (r() - 0.5) * R, 0.8 + r() * 0.5));
    }
    const m = new THREE.Mesh(B.build(), pbrMat());
    this.group.add(m);
  }

  _ferrisWheel() {
    const spots = this._scatter(1, 30, 80, 30);
    if (!spots.length) return;
    const [x, z] = spots[0];
    const y0 = -6;
    const base = new GeoBuilder('paint');
    base.add(new THREE.CylinderGeometry(9, 12, 6, 10), '#ffffff', [0, 0, 0]);
    for (const s of [-1, 1]) base.add(new THREE.CylinderGeometry(0.6, 0.8, 26, 6), '#ff8fc7', [s * 6, 13, 0], [0, 0, s * 0.22]);
    const bm = new THREE.Mesh(base.build(), this.propMat);
    bm.position.set(x, y0, z);
    this.group.add(bm);
    const W = new GeoBuilder('paint');
    W.add(new THREE.TorusGeometry(18, 0.5, 8, 64), '#ffd23f', [0, 0, 0], [0, 0, 0], 1, 'metal');
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      W.add(new THREE.BoxGeometry(0.3, 18, 0.3), '#ffffff', [Math.cos(a) * 9, Math.sin(a) * 9, 0], [0, 0, a + Math.PI / 2]);
      W.add(new THREE.BoxGeometry(2.4, 2, 2), ['#ff5a5f', '#36a9ff', '#19e3b1', '#b07aff'][k % 4], [Math.cos(a) * 18, Math.sin(a) * 18 - 1.4, 0]);
      W.add(new THREE.SphereGeometry(0.35, 8, 6), ['#fff2a8', '#ff9ecb'][k % 2], [Math.cos(a + 0.26) * 18, Math.sin(a + 0.26) * 18, 0], [0, 0, 0], 1, 'glowHot');
    }
    const wheel = new THREE.Mesh(W.build(), this.propMat);
    wheel.position.set(x, y0 + 26, z);
    wheel.rotation.y = this.r() * 3;
    this.group.add(wheel);
    this.animated.push((dt) => { wheel.rotateZ(dt * 0.15); });
  }

  _neonRings() {
    const tr = this.track;
    const mat = glowMat('#ff3dc8', 3.2);
    const mat2 = glowMat('#39f5ff', 3.2);
    for (let k = 0; k < 6; k++) {
      const s = tr.length * (0.12 + k * 0.14);
      const fr = tr.frame(s, {});
      const m = new THREE.Mesh(new THREE.TorusGeometry(fr.wd + 2, 0.45, 8, 56), k % 2 ? mat : mat2);
      m.position.set(fr.x, tr.heightAtFrame(fr, 0) + 2, fr.z);
      m.rotation.y = Math.atan2(fr.tx, fr.tz);
      this.group.add(m);
      const ph = k;
      this.animated.push((dt, t) => { m.scale.setScalar(1 + Math.sin(t * 2 + ph) * 0.03); });
    }
  }

  // The Earth hanging in the moon's black sky.
  _earth() {
    const tr = this.track;
    const tex = this._tex(TX.earthTexture());
    const earth = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), stdMat({ map: tex, roughness: 0.6, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25, fog: false }));
    earth.position.set(tr.center.x - 380, 230, tr.center.z - 460);
    earth.rotation.z = 0.4;
    this.group.add(earth);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(74, 32, 24), new THREE.MeshBasicMaterial({ color: hdr('#6fb8ff', 0.6), transparent: true, opacity: 0.25, side: THREE.BackSide, fog: false, depthWrite: false }));
    halo.position.copy(earth.position);
    this.group.add(halo);
    this.animated.push((dt) => { earth.rotation.y += dt * 0.01; });
  }

  _planet(c1, c2) {
    const tr = this.track;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), stdMat({ color: c1, roughness: 0.7, emissive: new THREE.Color(c1), emissiveIntensity: 0.35, fog: false }));
    planet.position.set(tr.center.x - 350, 180, tr.center.z - 420);
    this.group.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(80, 110, 96), new THREE.MeshBasicMaterial({ color: hdr(c2, 1.4), side: THREE.DoubleSide, transparent: true, opacity: 0.55, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.set(1.2, 0.3, 0.2);
    this.group.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 24), new THREE.MeshBasicMaterial({ color: hdr('#ffd23f', 2.2), fog: false }));
    moon.position.set(tr.center.x + 380, 240, tr.center.z + 200);
    this.group.add(moon);
  }

  _buildBackdrop() {
    const th = this.theme;
    const tr = this.track;
    const r = this.r;
    if (th.mountains) {
      const B = new GeoBuilder();
      const count = 26;
      const cols = th.mountains.map((c) => new THREE.Color(c));
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + r() * 0.2;
        const dist = tr.radius + (th.seaNear ? 330 : 300) + r() * 160;
        const h = 70 + r() * 130;
        const rad = 60 + r() * 70;
        const geo = th.mesa ? new THREE.CylinderGeometry(rad * 0.7, rad, h * 0.6, 7, 3) : new THREE.ConeGeometry(rad, h, 7, 4);
        const g = geo.toNonIndexed();
        const pos = g.attributes.position;
        const col = new Float32Array(pos.count * 3);
        const hh = th.mesa ? h * 0.6 : h;
        for (let i = 0; i < pos.count; i++) {
          const f = clamp((pos.getY(i) + hh / 2) / hh, 0, 1);
          const idx = Math.min(cols.length - 1, Math.floor(f * cols.length * 0.999));
          const c = th.mesa ? cols[(idx + k) % cols.length] : f > 0.78 ? cols[cols.length - 1] : cols[Math.min(idx, cols.length - 2)];
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.translate(tr.center.x + Math.cos(a) * dist, hh / 2 - 6, tr.center.z + Math.sin(a) * dist);
        B.addRaw(g);
      }
      this.group.add(new THREE.Mesh(B.build(), stdMat({ vertexColors: true, flatShading: true, roughness: 1 })));
    }
    if (th.earth) this._earth();
    if (th.volcano) {
      // The big volcano with a glowing crater.
      const a = 0.8;
      const d = tr.radius + 260;
      const x = tr.center.x + Math.cos(a) * d, z = tr.center.z + Math.sin(a) * d;
      const B = new GeoBuilder();
      B.add(new THREE.CylinderGeometry(40, 170, 170, 9, 4), '#3a2f31', [0, 85, 0]);
      B.add(new THREE.CylinderGeometry(36, 40, 6, 9), '#ff5a1a', [0, 170, 0]);
      const m = new THREE.Mesh(B.build(), stdMat({ vertexColors: true, flatShading: true, roughness: 1 }));
      m.position.set(x, -6, z);
      this.group.add(m);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 0.5, 18), new THREE.MeshBasicMaterial({ color: hdr('#ffb03a', 4), fog: false }));
      glow.position.set(x, 168, z);
      this.group.add(glow);
      const smoke = new GeoBuilder();
      for (let k = 0; k < 7; k++) smoke.add(new THREE.IcosahedronGeometry(18 + k * 5, 1), k < 2 ? '#6b5a5a' : '#4a3f40', [Math.sin(k) * 14, 185 + k * 22, Math.cos(k * 1.3) * 12]);
      const sm = new THREE.Mesh(smoke.build(), stdMat({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 1 }));
      sm.position.set(x, 0, z);
      this.group.add(sm);
      this.animated.push((dt) => { sm.rotation.y += dt * 0.05; });
    }
    if (th.clouds) {
      const B = new GeoBuilder();
      for (let k = 0; k < 5; k++) B.add(new THREE.IcosahedronGeometry(1, 1), '#ffffff', [(k - 2) * 1.5, Math.sin(k) * 0.3, (k % 2) * 0.6], [0, 0, 0], 1 + (k % 3) * 0.3);
      const geo = B.build();
      // Mostly self-lit so they don't pick up the ground colour from below.
      const mat = stdMat({ vertexColors: true, roughness: 1, emissive: new THREE.Color(th.sky[1]).lerp(new THREE.Color('#ffffff'), 0.6), emissiveIntensity: 0.7, envMapIntensity: 0.12 });
      const n = th.clouds;
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = tr.radius * 0.3 + r() * (tr.radius + 280);
        const s = 6 + r() * 8;
        const y = th.floating ? (r() < 0.5 ? -40 + r() * 20 : 60 + r() * 80) : 80 + r() * 70;
        m.compose(new THREE.Vector3(tr.center.x + Math.cos(a) * d, y, tr.center.z + Math.sin(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(s, s * 0.55, s));
        mesh.setMatrixAt(i, m);
      }
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.clouds = mesh;
    }
  }

  setViewH(h) {
    if (this.weather) this.weather.setViewH(h);
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.sky.position.copy(camera.position);
    this.skyMat.uniforms.time.value = this.time;
    if (this.weather) this.weather.update(dt, camera);
    if (this.grass) this.grass.update(dt);
    for (const m of this.waterMats) m.uniforms.time.value = this.time;
    if (this.padTex) this.padTex.offset.y = (this.padTex.offset.y - dt * 1.6) % 1;
    for (const f of this.animated) f(dt, this.time);
    if (this.clouds) this.clouds.rotation.y += dt * 0.002;
    if (focus && this.sun.castShadow) {
      const snap = (2 * this.shadowR) / this.sun.shadow.mapSize.x;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx + this.sunDir.x * 90, focus.y + this.sunDir.y * 90, fz + this.sunDir.z * 90);
    }
  }

  dispose() {
    disposeObject(this.group);
    for (const t of this.textures) t.dispose();
    if (this.envRT) this.envRT.dispose();
  }
}

// Moss patches on stone landmarks.
function blotchMoss(B, n) {
  for (let k = 0; k < n; k++) {
    const a = k * 2.3, r = 6 + (k % 4) * 2.5;
    B.add(new THREE.SphereGeometry(1.2 + (k % 3) * 0.4, 8, 6), '#5a8a3a', [Math.cos(a) * r, 2 + (k % 5) * 3.6, Math.sin(a) * r], [0, 0, 0], [1.4, 0.35, 1.4], 'leaf');
  }
}

// Darken the bottom of a prop a little, as if the ground shaded it; helps
// scenery sit on the terrain instead of floating.
function groundAO(geo) {
  if (geo.userData.ao || !geo.attributes.color) return;
  geo.userData.ao = true;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = Math.max(0.01, (bb.max.y - bb.min.y) * 0.35);
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - bb.min.y) / h));
    const k = 0.62 + 0.38 * t * t * (3 - 2 * t);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
}

function translate(geo, x, y, z, s = 1) {
  geo.scale(s, s, s);
  geo.translate(x, y, z);
  return geo;
}

// ---------------- Prop prototypes (vertex coloured, per-part PBR presets) ----------------
const P = {
  tree(c1, c2) {
    const B = new GeoBuilder('leaf');
    B.add(new THREE.CylinderGeometry(0.35, 0.55, 3.2, 8), '#7a4b2a', [0, 1.6, 0], [0, 0, 0], 1, 'wood');
    B.add(new THREE.IcosahedronGeometry(2.4, 1), c1, [0, 4.4, 0]);
    B.add(new THREE.IcosahedronGeometry(1.8, 1), c2, [1.2, 5.6, 0.4]);
    B.add(new THREE.IcosahedronGeometry(1.6, 1), c2, [-1.1, 5.2, -0.6]);
    B.add(new THREE.IcosahedronGeometry(1.4, 1), c1, [0.1, 6.6, -0.2]);
    return B.build();
  },
  bush(c) {
    const B = new GeoBuilder('leaf');
    B.add(new THREE.IcosahedronGeometry(1.1, 1), c, [0, 0.7, 0]);
    B.add(new THREE.IcosahedronGeometry(0.8, 1), '#63c052', [0.8, 0.6, 0.2]);
    B.add(new THREE.IcosahedronGeometry(0.7, 1), '#3f9b3a', [-0.7, 0.5, -0.3]);
    return B.build();
  },
  rock(c, snow = false) {
    const B = new GeoBuilder('stone');
    B.add(new THREE.DodecahedronGeometry(1, 0), c, [0, 0.5, 0], [0, 0, 0], [1.3, 0.9, 1.1]);
    B.add(new THREE.DodecahedronGeometry(0.6, 0), c, [0.9, 0.3, 0.4]);
    if (snow) B.add(new THREE.DodecahedronGeometry(0.9, 0), '#ffffff', [0, 0.95, 0], [0, 0, 0], [1.2, 0.35, 1], 'snow');
    return B.build();
  },
  flowers() {
    const B = new GeoBuilder('leaf');
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      B.add(new THREE.OctahedronGeometry(0.28, 0), '#ffffff', [Math.cos(a) * 0.7, 0.35, Math.sin(a) * 0.7]);
    }
    return B.build();
  },
  cow() {
    const B = new GeoBuilder('fur');
    B.add(new THREE.BoxGeometry(1.4, 1.2, 2.4), '#ffffff', [0, 1.3, 0]);
    B.add(new THREE.BoxGeometry(1.42, 0.7, 0.9), '#2a2438', [0, 1.5, 0.3]);
    B.add(new THREE.BoxGeometry(0.9, 0.9, 1), '#ffffff', [0, 1.7, 1.5]);
    B.add(new THREE.BoxGeometry(0.95, 0.45, 0.4), '#ffb3c6', [0, 1.45, 2.05], [0, 0, 0], 1, 'skin');
    for (const x of [-0.5, 0.5]) for (const z of [-0.8, 0.8]) B.add(new THREE.BoxGeometry(0.3, 0.8, 0.3), '#2a2438', [x, 0.4, z]);
    return B.build();
  },
  cactus() {
    const B = new GeoBuilder([0.55, 0, 0]);
    const c = '#3f9a55', c2 = '#57b86b';
    B.add(new THREE.CapsuleGeometry(0.55, 4.2, 3, 10), c, [0, 2.6, 0]);
    B.add(new THREE.CapsuleGeometry(0.38, 1.2, 3, 8), c2, [0.95, 2.6, 0], [0, 0, Math.PI / 2]);
    B.add(new THREE.CapsuleGeometry(0.38, 1.4, 3, 8), c2, [1.5, 3.5, 0]);
    B.add(new THREE.CapsuleGeometry(0.34, 1.0, 3, 8), c2, [-0.85, 2.0, 0], [0, 0, Math.PI / 2]);
    B.add(new THREE.CapsuleGeometry(0.34, 1.0, 3, 8), c2, [-1.3, 2.7, 0]);
    B.add(new THREE.SphereGeometry(0.3, 10, 8), '#ff6fa8', [0, 5.3, 0], [0, 0, 0], 1, 'plastic');
    return B.build();
  },
  deadBush() {
    const B = new GeoBuilder('wood');
    for (let k = 0; k < 5; k++) {
      const a = k * 1.25;
      B.add(new THREE.CylinderGeometry(0.05, 0.09, 1.4, 4), '#8a5a36', [Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3], [Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6]);
    }
    return B.build();
  },
  deadTree() {
    const B = new GeoBuilder('wood');
    B.add(new THREE.CylinderGeometry(0.3, 0.5, 5, 6), '#1f1a1b', [0, 2.5, 0]);
    B.add(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 5), '#1f1a1b', [0.8, 4, 0], [0, 0, -0.9]);
    B.add(new THREE.CylinderGeometry(0.12, 0.2, 2, 5), '#1f1a1b', [-0.7, 3.4, 0.2], [0.2, 0, 0.9]);
    B.add(new THREE.SphereGeometry(0.25, 8, 6), '#ff7a1a', [1.5, 4.8, 0], [0, 0, 0], 1, 'glowHot');
    return B.build();
  },
  vent() {
    const B = new GeoBuilder('stone');
    B.add(new THREE.ConeGeometry(1.6, 1.8, 7), '#2b2527', [0, 0.7, 0]);
    B.add(new THREE.CylinderGeometry(0.6, 0.8, 0.4, 10), '#ff7a1a', [0, 1.5, 0], [0, 0, 0], 1, 'glow');
    B.add(new THREE.SphereGeometry(0.45, 10, 8), '#ffd23f', [0, 1.8, 0], [0, 0, 0], 1, 'glowHot');
    return B.build();
  },
  palm() {
    return P.palmAt(0, 0, 0, 1, 0);
  },
  palmAt(x, y, z, s, rot) {
    const B = new GeoBuilder('leaf');
    for (let k = 0; k < 6; k++) B.add(new THREE.CylinderGeometry(0.34, 0.42, 1.4, 8), k % 2 ? '#a0703f' : '#8a5a36', [k * 0.18, 0.7 + k * 1.3, 0], [0, 0, -0.12], 1, 'wood');
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      B.add(new THREE.ConeGeometry(0.7, 4.2, 4), k % 2 ? '#3fae52' : '#2f9444', [1.1 + Math.cos(a) * 1.7, 8.1, Math.sin(a) * 1.7], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], [1, 1, 0.35]);
    }
    B.add(new THREE.SphereGeometry(0.35, 8, 6), '#6b4a2a', [1.0, 7.9, 0.3], [0, 0, 0], 1, 'wood');
    const g = B.build();
    g.rotateY(rot);
    g.scale(s, s, s);
    g.translate(x, y, z);
    return g;
  },
  umbrella() {
    const B = new GeoBuilder('fabric');
    B.add(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), '#ffffff', [0, 2, 0], [0, 0, 0], 1, 'metal');
    B.add(new THREE.ConeGeometry(2.6, 1.1, 12), '#ffffff', [0, 4.1, 0]);
    B.add(new THREE.BoxGeometry(1.2, 0.2, 2.4), '#ffffff', [1.6, 0.3, 0.4]);
    return B.build();
  },
  hut() {
    const B = new GeoBuilder('wood');
    B.add(new THREE.CylinderGeometry(2.6, 2.6, 3, 10), '#e8c68a', [0, 1.5, 0]);
    B.add(new THREE.ConeGeometry(3.6, 2.8, 10), '#c9a25a', [0, 4.4, 0], [0, 0, 0], 1, 'fabric');
    B.add(new THREE.BoxGeometry(1.2, 2, 0.3), '#6b4424', [0, 1, 2.55]);
    return B.build();
  },
  starfish() {
    const B = new GeoBuilder('skin');
    for (let k = 0; k < 5; k++) B.add(new THREE.ConeGeometry(0.22, 0.9, 4), '#ffffff', [Math.cos(k * 1.2566) * 0.35, 0.1, Math.sin(k * 1.2566) * 0.35], [Math.PI / 2, 0, -k * 1.2566 + Math.PI / 2]);
    return B.build();
  },
  mesa() {
    const B = new GeoBuilder('stone');
    const cols = ['#b65a31', '#cf7340', '#e39457', '#c8693a'];
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const h = 5 + k * 1.5;
      const r0 = 18 - k * 1.6;
      B.add(new THREE.CylinderGeometry(r0 - 1.2, r0, h, 9), cols[k], [0, y + h / 2, 0]);
      y += h;
    }
    return B.build();
  },
  pine() {
    const B = new GeoBuilder('leaf');
    B.add(new THREE.CylinderGeometry(0.3, 0.45, 2, 6), '#6b4a2a', [0, 1, 0], [0, 0, 0], 1, 'wood');
    const c = ['#1f6b4a', '#2b7f58', '#338f63'];
    for (let k = 0; k < 3; k++) {
      const y = 2.2 + k * 1.9;
      const r0 = 2.6 - k * 0.7;
      B.add(new THREE.ConeGeometry(r0, 3, 9), c[k], [0, y + 1.2, 0]);
      B.add(new THREE.ConeGeometry(r0 * 0.55, 1.1, 9), '#ffffff', [0, y + 2.3, 0], [0, 0, 0], 1, 'snow');
    }
    return B.build();
  },
  snowman() {
    const B = new GeoBuilder('snow');
    B.add(new THREE.SphereGeometry(1.3, 16, 12), '#ffffff', [0, 1.2, 0]);
    B.add(new THREE.SphereGeometry(0.95, 16, 12), '#ffffff', [0, 2.9, 0]);
    B.add(new THREE.SphereGeometry(0.7, 16, 12), '#ffffff', [0, 4.2, 0]);
    B.add(new THREE.ConeGeometry(0.14, 0.7, 8), '#ff7a1a', [0, 4.2, 0.9], [Math.PI / 2, 0, 0], 1, 'plastic');
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 14), '#1d1537', [0, 5.0, 0], [0, 0, 0], 1, 'fabric');
    B.add(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 14), '#1d1537', [0, 4.7, 0], [0, 0, 0], 1, 'fabric');
    B.add(new THREE.TorusGeometry(0.72, 0.16, 8, 16), '#e8413c', [0, 3.55, 0], [Math.PI / 2, 0, 0], 1, 'fabric');
    return B.build();
  },
  crystal(c1 = '#9fdcff', c2 = '#d7f1ff', mat = 'ice') {
    const B = new GeoBuilder(mat);
    B.add(new THREE.OctahedronGeometry(1, 0), c1, [0, 1.6, 0], [0, 0, 0], [0.6, 1.8, 0.6]);
    B.add(new THREE.OctahedronGeometry(0.7, 0), c2, [0.7, 0.9, 0.2], [0, 0, 0.4], [0.5, 1.4, 0.5]);
    return B.build();
  },
  igloo() {
    const B = new GeoBuilder('snow');
    B.add(new THREE.SphereGeometry(3.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#f4f9ff', [0, 0, 0]);
    B.add(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 12, 1, false, 0, Math.PI), '#e3eefa', [0, 0.6, 3.2], [Math.PI / 2, 0, 0]);
    return B.build();
  },
  pylon() {
    const B = new GeoBuilder('metal');
    B.add(new THREE.CylinderGeometry(0.25, 0.4, 7, 8), '#2a2350', [0, 3.5, 0]);
    B.add(new THREE.OctahedronGeometry(0.9, 0), '#39f5ff', [0, 7.6, 0], [0, 0, 0], 1, 'glowHot');
    B.add(new THREE.TorusGeometry(0.9, 0.12, 6, 16), '#ff3dc8', [0, 5.2, 0], [Math.PI / 2, 0, 0], 1, 'glowHot');
    return B.build();
  },
  lollipop() {
    const B = new GeoBuilder('candy');
    B.add(new THREE.CylinderGeometry(0.2, 0.2, 7, 8), '#ffffff', [0, 3.5, 0], [0, 0, 0], 1, 'matte');
    B.add(new THREE.CylinderGeometry(2.4, 2.4, 0.6, 20), '#ffffff', [0, 8.6, 0], [Math.PI / 2, 0, 0]);
    B.add(new THREE.TorusGeometry(1.5, 0.3, 6, 20), '#ffffff', [0, 8.6, 0.32]);
    B.add(new THREE.TorusGeometry(0.7, 0.25, 6, 14), '#ffffff', [0, 8.6, 0.32]);
    return B.build();
  },
  candyCane() {
    const B = new GeoBuilder('candy');
    for (let k = 0; k < 8; k++) B.add(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 10), k % 2 ? '#ffffff' : '#ff3d6a', [0, 0.4 + k * 0.8, 0]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      B.add(new THREE.SphereGeometry(0.47, 10, 6), k % 2 ? '#ffffff' : '#ff3d6a', [1.2 - Math.cos(a) * 1.2, 6.8 + Math.sin(a) * 1.2, 0]);
    }
    return B.build();
  },
  gumdrop() {
    const B = new GeoBuilder([0.3, 0, 0]);
    B.add(new THREE.SphereGeometry(1.2, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', [0, 0, 0], [0, 0, 0], [1, 1.3, 1]);
    return B.build();
  },
  cupcake() {
    const B = new GeoBuilder('frosting');
    B.add(new THREE.CylinderGeometry(1.8, 1.3, 2, 16), '#ff8fc7', [0, 1, 0], [0, 0, 0], 1, 'fabric');
    B.add(new THREE.SphereGeometry(1.9, 16, 12), '#ffffff', [0, 2.3, 0], [0, 0, 0], [1, 0.7, 1]);
    B.add(new THREE.SphereGeometry(0.45, 12, 8), '#e8413c', [0, 3.6, 0], [0, 0, 0], 1, 'gloss');
    return B.build();
  },
  donut() {
    const B = new GeoBuilder('matte');
    B.add(new THREE.TorusGeometry(2, 0.95, 12, 24), '#e0a860', [0, 1, 0], [Math.PI / 2, 0, 0]);
    B.add(new THREE.TorusGeometry(2, 0.7, 10, 24), '#ffffff', [0, 1.45, 0], [Math.PI / 2, 0, 0], [1, 1, 0.6], 'candy');
    return B.build();
  },
  pumpkin() {
    const B = new GeoBuilder([0.5, 0, 0]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      B.add(new THREE.SphereGeometry(0.62, 12, 10), '#ff7a1a', [Math.cos(a) * 0.36, 0.62, Math.sin(a) * 0.36], [0, 0, 0], [0.7, 0.9, 0.7]);
    }
    B.add(new THREE.CylinderGeometry(0.08, 0.12, 0.35, 6), '#4a6a2a', [0, 1.25, 0], [0.2, 0, 0.1], 1, 'leaf');
    // glowing carved face
    for (const x of [-0.2, 0.2]) B.add(new THREE.ConeGeometry(0.1, 0.16, 3), '#ffd23f', [x, 0.78, 0.86], [Math.PI / 2, 0, 0], 1, 'glowHot');
    B.add(new THREE.BoxGeometry(0.46, 0.08, 0.05), '#ffd23f', [0, 0.52, 0.86], [0, 0, 0], 1, 'glowHot');
    return B.build();
  },
  grave() {
    const B = new GeoBuilder('stone');
    B.add(new THREE.BoxGeometry(0.9, 1.2, 0.25), '#8a8698', [0, 0.6, 0]);
    B.add(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 12, 1, false, 0, Math.PI), '#8a8698', [0, 1.2, 0], [Math.PI / 2, Math.PI / 2, 0]);
    B.add(new THREE.BoxGeometry(1.1, 0.14, 0.5), '#6a6678', [0, 0.07, 0]);
    return B.build();
  },
  lamp(glow = '#ffd27a') {
    const B = new GeoBuilder('metal');
    B.add(new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6), '#2a2632', [0, 2.1, 0]);
    B.add(new THREE.BoxGeometry(0.5, 0.6, 0.5), '#2a2632', [0, 4.4, 0]);
    B.add(new THREE.BoxGeometry(0.36, 0.44, 0.36), glow, [0, 4.4, 0], [0, 0, 0], 1, 'glowHot');
    return B.build();
  },
  jungleTree() {
    const B = new GeoBuilder('leaf');
    B.add(new THREE.CylinderGeometry(0.45, 0.8, 9, 8), '#6a4a2a', [0, 4.5, 0], [0, 0, 0], 1, 'wood');
    B.add(new THREE.CylinderGeometry(0.2, 0.3, 3, 6), '#6a4a2a', [1.2, 7.5, 0], [0, 0, -0.7], 1, 'wood');
    B.add(new THREE.SphereGeometry(3.4, 12, 8), '#2f8a34', [0, 9.5, 0], [0, 0, 0], [1.3, 0.55, 1.3]);
    B.add(new THREE.SphereGeometry(2.4, 10, 8), '#3fa044', [2.2, 8.6, 1], [0, 0, 0], [1.2, 0.6, 1.2]);
    B.add(new THREE.SphereGeometry(2.2, 10, 8), '#27782c', [-2, 8.9, -1.2], [0, 0, 0], [1.2, 0.6, 1.2]);
    return B.build();
  },
  fern() {
    const B = new GeoBuilder('leaf');
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      B.add(new THREE.ConeGeometry(0.35, 2.2, 4), k % 2 ? '#3fa044' : '#5ab84e', [Math.cos(a) * 0.7, 0.6, Math.sin(a) * 0.7], [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1], [1, 1, 0.3]);
    }
    return B.build();
  },
  tank() {
    const B = new GeoBuilder('metal');
    B.add(new THREE.CylinderGeometry(3, 3, 7, 18), '#c8ccd4', [0, 3.5, 0], [0, 0, 0], 1, [0.35, 0.8, 0]);
    B.add(new THREE.SphereGeometry(3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#c8ccd4', [0, 7, 0], [0, 0, 0], 1, [0.35, 0.8, 0]);
    B.add(new THREE.TorusGeometry(3.05, 0.12, 6, 24), '#ffcf2a', [0, 5, 0], [Math.PI / 2, 0, 0], 1, 'paint');
    B.add(new THREE.CylinderGeometry(0.3, 0.3, 8, 8), '#5a5e6a', [3.4, 4, 0], [0, 0, 0], 1, 'metal');
    return B.build();
  },
  crates() {
    const B = new GeoBuilder('wood');
    B.add(new THREE.BoxGeometry(1.8, 1.8, 1.8), '#b8864e', [0, 0.9, 0]);
    B.add(new THREE.BoxGeometry(1.6, 1.6, 1.6), '#a8764a', [1.9, 0.8, 0.3], [0, 0.3, 0]);
    B.add(new THREE.BoxGeometry(1.5, 1.5, 1.5), '#c89a5e', [0.8, 2.55, 0.2], [0, 0.6, 0]);
    B.add(new THREE.BoxGeometry(1.2, 1.3, 1.2), '#3a6ab0', [-1.6, 0.65, 0.4], [0, 0.2, 0], 1, 'paint');
    return B.build();
  },
  gear() {
    const B = new GeoBuilder('metal');
    B.add(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 20), '#8a8e98', [0, 0, 0], [Math.PI / 2, 0, 0], 1, [0.4, 0.9, 0]);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      B.add(new THREE.BoxGeometry(0.7, 0.7, 0.6), '#8a8e98', [Math.cos(a) * 2.4, Math.sin(a) * 2.4, 0], [0, 0, a], 1, [0.4, 0.9, 0]);
    }
    B.add(new THREE.CylinderGeometry(0.6, 0.6, 0.8, 12), '#ffcf2a', [0, 0, 0], [Math.PI / 2, 0, 0], 1, 'paint');
    return B.build();
  },
  dome() {
    const B = new GeoBuilder('metal');
    B.add(new THREE.CylinderGeometry(4.2, 4.4, 1.2, 20), '#d8dce4', [0, 0.6, 0], [0, 0, 0], 1, 'paint');
    B.add(new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#9fdcff', [0, 1.2, 0], [0, 0, 0], 1, [0.05, 0, 0.35]);
    B.add(new THREE.SphereGeometry(0.4, 10, 8), '#ff3d6a', [0, 5.3, 0], [0, 0, 0], 1, 'glowHot');
    return B.build();
  },
  antenna() {
    const B = new GeoBuilder('metal');
    B.add(new THREE.CylinderGeometry(0.15, 0.3, 6, 6), '#c8ccd4', [0, 3, 0]);
    B.add(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#e8ecf4', [0, 6.2, 0.3], [-1.1, 0, 0], 1, 'paint');
    B.add(new THREE.SphereGeometry(0.18, 8, 6), '#6fd8ff', [0, 6.6, 1.3], [0, 0, 0], 1, 'glowHot');
    return B.build();
  },
  crater() {
    const B = new GeoBuilder('stone');
    B.add(new THREE.TorusGeometry(3, 0.8, 6, 18), '#8a8c92', [0, 0.1, 0], [Math.PI / 2, 0, 0], [1, 1, 0.45]);
    B.add(new THREE.CircleGeometry(2.6, 18), '#6a6c72', [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
    return B.build();
  },
  hay() {
    const B = new GeoBuilder('fabric');
    B.add(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 16), '#e8c65a', [0, 1.2, 0], [0, 0, Math.PI / 2]);
    B.add(new THREE.TorusGeometry(1.2, 0.06, 4, 18), '#a8864a', [0.5, 1.2, 0], [0, Math.PI / 2, 0]);
    B.add(new THREE.TorusGeometry(1.2, 0.06, 4, 18), '#a8864a', [-0.5, 1.2, 0], [0, Math.PI / 2, 0]);
    return B.build();
  },
  bamboo() {
    const B = new GeoBuilder([0.45, 0, 0]);
    for (let k = 0; k < 5; k++) {
      const x = Math.cos(k * 2.4) * 0.6, z = Math.sin(k * 2.4) * 0.6, h = 6 + (k % 3) * 1.6;
      B.add(new THREE.CylinderGeometry(0.16, 0.18, h, 6), k % 2 ? '#8ab84a' : '#9ac85a', [x, h / 2, z]);
      for (let j = 1; j < 4; j++) B.add(new THREE.ConeGeometry(0.4, 1.4, 3), '#5a9a3a', [x + 0.4, h * (0.5 + j * 0.15), z], [0, j, -1.2], [1, 1, 0.3], 'leaf');
    }
    return B.build();
  },
  lantern() {
    const B = new GeoBuilder('stone');
    B.add(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 6), '#a8a498', [0, 0.2, 0]);
    B.add(new THREE.CylinderGeometry(0.18, 0.22, 1.4, 6), '#a8a498', [0, 1.1, 0]);
    B.add(new THREE.BoxGeometry(0.9, 0.7, 0.9), '#a8a498', [0, 2.1, 0]);
    B.add(new THREE.BoxGeometry(0.5, 0.4, 0.95), '#ffcf7a', [0, 2.1, 0], [0, 0, 0], 1, 'glowHot');
    B.add(new THREE.ConeGeometry(0.9, 0.6, 4), '#8a8678', [0, 2.75, 0], [0, Math.PI / 4, 0]);
    return B.build();
  },
  cloudPuff() {
    const B = new GeoBuilder();
    B.add(new THREE.IcosahedronGeometry(1.4, 2), '#ffffff', [0, 0, 0]);
    B.add(new THREE.IcosahedronGeometry(1.1, 2), '#ffffff', [1.3, -0.2, 0.3]);
    B.add(new THREE.IcosahedronGeometry(1, 2), '#ffffff', [-1.2, -0.3, -0.2]);
    return B.build();
  },
};
