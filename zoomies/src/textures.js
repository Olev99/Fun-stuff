import * as THREE from 'three';
import { rng } from './util.js';

let maxAniso = 4;
export function setMaxAniso(a) {
  maxAniso = a;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { repeat = true, aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(aniso, maxAniso);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, w, h, r, colors, count, sizeMin, sizeMax, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = sizeMin + r() * (sizeMax - sizeMin);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function blotches(ctx, w, h, r, colors, count, rMin, rMax, alpha) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = rMin + r() * (rMax - rMin);
    const c = colors[Math.floor(r() * colors.length)];
    // draw wrapped so the texture tiles
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      g.addColorStop(0, c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  ctx.globalAlpha = 1;
}

// ---- Road surfaces --------------------------------------------------------

const ROAD_STYLES = {
  asphalt: { base: '#5d6273', spk: ['#6c7184', '#4f5465', '#7a7f92'], line: '#f4f1ea', groove: 'rgba(30,30,45,0.18)' },
  dirt: { base: '#c98a55', spk: ['#d99b64', '#b8784a', '#e3ad78'], line: '#f7e2c0', groove: 'rgba(110,60,30,0.2)' },
  ice: { base: '#90a8c4', spk: ['#9ab1cc', '#8aa2bf', '#a9bfd8'], line: '#e8f6ff', groove: 'rgba(40,60,100,0.12)' },
  neon: { base: '#1b1637', spk: ['#231d45', '#15112b', '#2a2352'], line: '#39f5ff', groove: 'rgba(0,0,0,0.2)' },
  chocolate: { base: '#6b3b24', spk: ['#7a4630', '#5a301c', '#8a5638'], line: '#ffd1e8', groove: 'rgba(40,15,5,0.2)' },
  basalt: { base: '#2e2829', spk: ['#3b3335', '#221d1e', '#4a4042'], line: '#ff8a2b', groove: 'rgba(0,0,0,0.25)' },
  pastel: { base: '#cbbcf0', spk: ['#c0b0ea', '#d8cbf6', '#b9c8f0'], line: '#ff7ab8', groove: 'rgba(150,120,220,0.12)' },
  boardwalk: { base: '#b9854f', spk: ['#c9955d', '#a8743f', '#d4a46c'], line: '#fff1d6', groove: 'rgba(90,50,20,0.12)' },
};

export function roadTexture(style, seed = 1) {
  const st = ROAD_STYLES[style] || ROAD_STYLES.asphalt;
  const [c, ctx] = makeCanvas(256, 256);
  const r = rng(seed);
  ctx.fillStyle = st.base;
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 256, r, st.spk, 14, 20, 60, 0.35);
  speckle(ctx, 256, 256, r, st.spk, 2600, 1, 2.2, 0.8);
  // subtle racing grooves
  ctx.fillStyle = st.groove;
  ctx.fillRect(256 * 0.26, 0, 256 * 0.1, 256);
  ctx.fillRect(256 * 0.64, 0, 256 * 0.1, 256);
  // edge lines
  ctx.fillStyle = st.line;
  ctx.fillRect(4, 0, 7, 256);
  ctx.fillRect(256 - 11, 0, 7, 256);
  // centre dashes
  ctx.globalAlpha = style === 'neon' ? 0.9 : 0.55;
  ctx.fillRect(126, 0, 4, 110);
  ctx.globalAlpha = 1;
  if (style === 'boardwalk') {
    // planks across the road
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle = 'rgba(80,45,15,0.35)';
      ctx.fillRect(0, y, 256, 2);
      ctx.fillStyle = 'rgba(255,230,190,0.12)';
      ctx.fillRect(0, y + 2, 256, 3);
    }
  }
  if (style === 'basalt') {
    ctx.strokeStyle = 'rgba(255,110,30,0.9)';
    ctx.lineWidth = 2;
    const r2 = rng(seed + 9);
    for (let n = 0; n < 7; n++) {
      let x = 30 + r2() * 196, y = r2() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r2() - 0.5) * 30; y += 8 + r2() * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  if (style === 'pastel') {
    const cols = ['rgba(255,158,203,0.25)', 'rgba(158,220,255,0.25)', 'rgba(255,236,150,0.3)', 'rgba(190,255,200,0.25)'];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(0, i * 64, 256, 64); }
  }
  if (style === 'chocolate') {
    ctx.strokeStyle = 'rgba(255,209,232,0.5)';
    ctx.lineWidth = 3;
    for (let y = 20; y < 256; y += 64) {
      ctx.beginPath();
      for (let x = 20; x <= 236; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.08) * 6);
      ctx.stroke();
    }
  }
  if (style === 'neon') {
    ctx.strokeStyle = 'rgba(255,61,200,0.35)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  }
  return toTex(c, { aniso: 8 });
}

export function curbTexture(a, b) {
  const [c, ctx] = makeCanvas(32, 64);
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = b;
  ctx.fillRect(0, 32, 32, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, 4, 64);
  return toTex(c, { aniso: 4 });
}

// ---- Ground / shoulder ----------------------------------------------------

const GROUND_STYLES = {
  grass: { base: '#6cbf4a', blot: ['#5fae3f', '#7fd057', '#8bd35e', '#58a23b'], spk: ['#4f9636', '#93dc66', '#a5e37a'] },
  sand: { base: '#e8b878', blot: ['#dca66a', '#f2c78c', '#d69a5d'], spk: ['#c98f55', '#f6d4a0', '#e0ac70'] },
  snow: { base: '#eef5fb', blot: ['#dde9f5', '#ffffff', '#d4e3f2'], spk: ['#c9dbee', '#ffffff', '#e2edf7'] },
  tiles: { base: '#221c44', blot: ['#2a2350', '#1a1536'], spk: ['#342b63', '#16122e'] },
  frosting: { base: '#ffd3ea', blot: ['#ffc0df', '#fff0f7', '#ffe2f0'], spk: ['#ff5a8a', '#36a9ff', '#ffd23f', '#19e3b1', '#ffffff'] },
  ash: { base: '#3d3537', blot: ['#4a4144', '#2e2729', '#574c4f'], spk: ['#ff7a1a', '#231e1f', '#6a5d60'] },
  cloud: { base: '#ffffff', blot: ['#eef3ff', '#fff6fd', '#e6eeff'], spk: ['#ffffff', '#f2f6ff'] },
};

export function groundTexture(style, seed = 7) {
  const st = GROUND_STYLES[style] || GROUND_STYLES.grass;
  const [c, ctx] = makeCanvas(256, 256);
  const r = rng(seed);
  ctx.fillStyle = st.base;
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 256, r, st.blot, 26, 16, 70, 0.55);
  if (style === 'grass') {
    // little grass blades
    for (let i = 0; i < 1400; i++) {
      ctx.strokeStyle = st.spk[Math.floor(r() * st.spk.length)];
      ctx.globalAlpha = 0.7;
      const x = r() * 256, y = r() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (style === 'tiles') {
    ctx.strokeStyle = 'rgba(120,90,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }
  } else if (style === 'frosting') {
    // sprinkles
    for (let i = 0; i < 500; i++) {
      ctx.save();
      ctx.translate(r() * 256, r() * 256);
      ctx.rotate(r() * Math.PI);
      ctx.fillStyle = st.spk[Math.floor(r() * st.spk.length)];
      ctx.fillRect(-3, -1, 6, 2.2);
      ctx.restore();
    }
  } else if (style === 'ash') {
    speckle(ctx, 256, 256, r, ['#231e1f', '#6a5d60'], 1600, 1, 2.5, 0.6);
    speckle(ctx, 256, 256, r, ['#ff7a1a', '#ffb04a'], 60, 1, 2, 0.9);
  } else {
    speckle(ctx, 256, 256, r, st.spk, 1800, 1, 2.5, 0.6);
  }
  return toTex(c, { aniso: 4 });
}

// ---- Walls ---------------------------------------------------------------

export function wallTexture(style) {
  const [c, ctx] = makeCanvas(64, 128);
  if (style === 'redwhite') {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#e8413c';
      ctx.fillRect(0, i * 32, 64, 32);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, 64, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, 54, 64, 4);
  } else if (style === 'sandstone') {
    const r = rng(3);
    const bands = ['#c8693a', '#d98046', '#b85a31', '#e39457', '#cf7340'];
    let y = 0;
    let bi = 0;
    // u runs up the wall (0 bottom, 1 top) so bands are vertical in canvas x
    while (y < 64) {
      const h = 6 + r() * 10;
      ctx.fillStyle = bands[bi++ % bands.length];
      ctx.fillRect(y, 0, h, 128);
      y += h;
    }
    speckle(ctx, 64, 128, r, ['#a44f2a', '#eaa36a'], 300, 1, 3, 0.5);
  } else if (style === 'snowbank') {
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, '#b9d0e8');
    g.addColorStop(0.6, '#eef6ff');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(80,140,220,0.18)' : 'rgba(255,255,255,0)';
      ctx.fillRect(0, i * 32, 64, 32);
    }
  } else if (style === 'wood') {
    ctx.fillStyle = '#b07a44';
    ctx.fillRect(0, 0, 64, 128);
    for (let x = 0; x < 64; x += 13) { ctx.fillStyle = 'rgba(70,40,15,0.45)'; ctx.fillRect(x, 0, 2, 128); }
    for (let y = 0; y < 128; y += 32) { ctx.fillStyle = '#6b4424'; ctx.fillRect(0, y, 64, 5); }
    ctx.fillStyle = '#f3e3c0';
    ctx.fillRect(50, 0, 6, 128);
  } else if (style === 'candycane') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#ff3d6a';
    for (let k = -4; k < 8; k++) {
      ctx.beginPath();
      ctx.moveTo(0, k * 32);
      ctx.lineTo(64, k * 32 + 40);
      ctx.lineTo(64, k * 32 + 56);
      ctx.lineTo(0, k * 32 + 16);
      ctx.closePath();
      ctx.fill();
    }
  } else if (style === 'basalt') {
    ctx.fillStyle = '#2b2527';
    ctx.fillRect(0, 0, 64, 128);
    speckle(ctx, 64, 128, rng(4), ['#3d3436', '#1c1718'], 400, 1, 4, 0.7);
    const g = ctx.createLinearGradient(40, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,90,20,0)');
    g.addColorStop(1, 'rgba(255,140,40,1)');
    ctx.fillStyle = g;
    ctx.fillRect(40, 0, 24, 128);
  } else if (style === 'cloudrail') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 128);
    const cols = ['#ff9ecb', '#ffd98a', '#9ee7ff', '#c8a8ff'];
    cols.forEach((c2, i) => { ctx.fillStyle = c2; ctx.fillRect(34 + i * 7, 0, 6, 128); });
  } else if (style === 'neon') {
    ctx.fillStyle = '#140f2c';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#ff3dc8';
    ctx.fillRect(40, 0, 8, 128);
    ctx.fillStyle = '#39f5ff';
    ctx.fillRect(56, 0, 8, 128);
    for (let i = 0; i < 128; i += 32) {
      ctx.fillStyle = 'rgba(57,245,255,0.5)';
      ctx.fillRect(0, i, 36, 3);
    }
  }
  return toTex(c, { aniso: 4 });
}

// ---- Misc ----------------------------------------------------------------

export function checkerTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
    ctx.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = toTex(c, { aniso: 4 });
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function boostTexture() {
  const [c, ctx] = makeCanvas(64, 128);
  ctx.fillStyle = 'rgba(255,120,20,0.55)';
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 2; i++) {
    const y = i * 64;
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.moveTo(6, y + 18);
    ctx.lineTo(32, y + 44);
    ctx.lineTo(58, y + 18);
    ctx.lineTo(58, y + 34);
    ctx.lineTo(32, y + 60);
    ctx.lineTo(6, y + 34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#fff6c9';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, -2, 60, 132);
  const t = toTex(c, { aniso: 4 });
  return t;
}

export function itemBoxTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px "Bungee", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 70);
  const t = toTex(c, { repeat: false, aniso: 2 });
  return t;
}

export function bannerTexture(text, bg = '#1d1537', fg = '#ffd23f') {
  const [c, ctx] = makeCanvas(512, 96);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  // checker trim
  for (let x = 0; x < 64; x++) {
    ctx.fillStyle = x % 2 ? '#fafafa' : '#111';
    ctx.fillRect(x * 8, 0, 8, 8);
    ctx.fillStyle = x % 2 ? '#111' : '#fafafa';
    ctx.fillRect(x * 8, 88, 8, 8);
  }
  ctx.fillStyle = fg;
  ctx.font = '54px "Bungee", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  return toTex(c, { repeat: false, aniso: 4 });
}

export function windowsTexture(seed = 5) {
  const [c, ctx] = makeCanvas(64, 128);
  const r = rng(seed);
  ctx.fillStyle = '#0d0a1f';
  ctx.fillRect(0, 0, 64, 128);
  const cols = ['#39f5ff', '#ff3dc8', '#ffd23f', '#9d7bff'];
  for (let y = 4; y < 128; y += 10) for (let x = 4; x < 64; x += 10) {
    if (r() < 0.45) {
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.globalAlpha = 0.5 + r() * 0.5;
      ctx.fillRect(x, y, 6, 6);
    }
  }
  ctx.globalAlpha = 1;
  return toTex(c, { aniso: 2 });
}

export function blobShadowTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false, aniso: 1, srgb: false });
}

export function glowTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false, aniso: 1 });
}

// Soft-edged puddle shape for road patches (ice, oil, mud...). RGB carries a
// little variation, alpha the irregular outline.
export function patchTexture(seed = 3) {
  const W = 128, H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const x = W * (0.25 + r() * 0.5), y = H * (0.12 + r() * 0.76), rad = 22 + r() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = Math.min(1, d[i] / 255 * 1.6);
    const edge = a > 0.55 ? 1 : a / 0.55;
    const v = 200 + Math.floor(r() * 55);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = Math.floor(edge * edge * 255);
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { repeat: false });
}

// Normal and roughness maps derived from a colour texture's brightness, so
// roads, ground and walls catch the light with a little relief and their
// shine varies across the surface. Both are linear data textures.
export function surfaceMaps(tex, { bump = 2.2, rough = [0.55, 0.95], invert = false } = {}) {
  const src = tex.image;
  const W = src.width, H = src.height;
  const sctx = src.getContext('2d');
  const d = sctx.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  let lo = 1, hi = 0;
  for (let i = 0; i < W * H; i++) {
    const v = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
    L[i] = v;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = Math.max(1e-3, hi - lo);
  const at = (x, y) => L[((y + H) % H) * W + ((x + W) % W)];
  const [nc, nctx] = makeCanvas(W, H);
  const [rc, rctx] = makeCanvas(W, H);
  const nImg = nctx.createImageData(W, H), rImg = rctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * bump, ny = -dy * bump;
      const l = Math.hypot(nx, ny, 1);
      const o = (y * W + x) * 4;
      nImg.data[o] = ((nx / l) * 0.5 + 0.5) * 255;
      nImg.data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      nImg.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nImg.data[o + 3] = 255;
      let t = (L[y * W + x] - lo) / span;
      if (invert) t = 1 - t;
      const rv = (rough[0] + (rough[1] - rough[0]) * t) * 255;
      rImg.data[o] = rImg.data[o + 1] = rImg.data[o + 2] = rv;
      rImg.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  const mk = (c) => {
    const t = toTex(c, { srgb: false });
    t.wrapS = tex.wrapS;
    t.wrapT = tex.wrapT;
    t.repeat.copy(tex.repeat);
    return t;
  };
  return { normal: mk(nc), rough: mk(rc) };
}
