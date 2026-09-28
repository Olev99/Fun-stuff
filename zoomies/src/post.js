import * as THREE from 'three';

// HDR post-processing: the scene renders into a multisampled half-float
// target, then bloom (dual-filter blur pyramid), tone mapping (Khronos PBR
// Neutral), colour grading, vignette and a boost-speed radial blur are
// applied in a few cheap full-screen passes.

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const PREFILTER = /* glsl */ `
uniform sampler2D tIn; uniform vec2 texel; uniform float threshold; uniform float knee;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 a = texture2D(tIn, vUv + vec2(-texel.x, -texel.y)).rgb;
  vec3 b = texture2D(tIn, vUv + vec2(texel.x, -texel.y)).rgb;
  vec3 c = texture2D(tIn, vUv + vec2(-texel.x, texel.y)).rgb;
  vec3 d = texture2D(tIn, vUv + vec2(texel.x, texel.y)).rgb;
  // Karis average: weights tame single-pixel fireflies that would flicker.
  float wa = 1.0 / (1.0 + lum(a)), wb = 1.0 / (1.0 + lum(b)), wc = 1.0 / (1.0 + lum(c)), wd = 1.0 / (1.0 + lum(d));
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  float br = max(col.r, max(col.g, col.b));
  float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee);
  rq = rq * rq / (4.0 * knee + 1e-4);
  float w = max(rq, br - threshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(col * w, vec3(40.0)), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tIn; uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tIn, vUv).rgb * 4.0;
  s += texture2D(tIn, vUv - texel).rgb;
  s += texture2D(tIn, vUv + texel).rgb;
  s += texture2D(tIn, vUv + vec2(texel.x, -texel.y)).rgb;
  s += texture2D(tIn, vUv - vec2(texel.x, -texel.y)).rgb;
  gl_FragColor = vec4(s * 0.125, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tIn; uniform vec2 texel; uniform float weight;
varying vec2 vUv;
void main() {
  vec2 h = texel * 0.5;
  vec3 s = texture2D(tIn, vUv + vec2(-texel.x, 0.0)).rgb;
  s += texture2D(tIn, vUv + vec2(texel.x, 0.0)).rgb;
  s += texture2D(tIn, vUv + vec2(0.0, -texel.y)).rgb;
  s += texture2D(tIn, vUv + vec2(0.0, texel.y)).rgb;
  s += texture2D(tIn, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  s += texture2D(tIn, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  s += texture2D(tIn, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  s += texture2D(tIn, vUv + vec2(h.x, h.y)).rgb * 2.0;
  gl_FragColor = vec4(s * (weight / 12.0), 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float bloom; uniform float exposure; uniform float saturation; uniform float contrast;
uniform float vignette; uniform float boost; uniform float time; uniform float aspect;
uniform vec3 tint; uniform vec3 lift;
uniform vec2 sunPos; uniform float sunOn; uniform float shafts;
varying vec2 vUv;

// Khronos PBR Neutral: keeps saturated base colours true, rolls off highlights.
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 col;
  vec2 c = vUv - vec2(0.5, 0.56);
  float r = length(c * vec2(aspect, 1.0));
  if (boost > 0.001) {
    // Speed blur towards the vanishing point, stronger at the edges, with a
    // touch of chromatic fringing.
    vec2 st = c * boost * 0.036 * smoothstep(0.2, 0.95, r);
    col = vec3(0.0);
    for (int i = 0; i < 6; i++) col += texture2D(tScene, vUv - st * (float(i) / 5.0)).rgb;
    col /= 6.0;
    col.r = mix(col.r, texture2D(tScene, vUv + st * 0.3).r, 0.4);
    col.b = mix(col.b, texture2D(tScene, vUv - st * 1.1).b, 0.4);
  } else {
    col = texture2D(tScene, vUv).rgb;
  }
  col += texture2D(tBloom, vUv).rgb * bloom;
  if (sunOn > 0.0) {
    // Lens flare: ghosts along the line through the screen centre, faded by
    // how bright the (bloomed) sun is, which drops when something hides it.
    vec3 sb = texture2D(tBloom, sunPos).rgb;
    float vis = clamp(dot(sb, vec3(0.3)) * 0.5, 0.0, 1.0) * sunOn;
    if (vis > 0.01) {
      vec2 axis = vec2(0.5) - sunPos;
      vec3 fl = vec3(0.0);
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        vec2 gp = sunPos + axis * (0.55 + fi * 0.38);
        float d = length((vUv - gp) * vec2(aspect, 1.0));
        float sz = 0.018 + fi * 0.014;
        vec3 gc = mod(fi, 2.0) < 1.0 ? vec3(0.55, 0.8, 1.0) : vec3(1.0, 0.7, 0.45);
        fl += gc * (smoothstep(sz, sz * 0.4, d) * 0.22 + smoothstep(sz * 1.2, sz, d) * smoothstep(sz * 0.8, sz, d) * 0.3);
      }
      float dh = length((vUv - sunPos) * vec2(aspect, 1.0));
      fl += vec3(1.0, 0.9, 0.75) * smoothstep(0.012, 0.0, abs(dh - 0.19)) * 0.1;
      fl += vec3(1.0, 0.95, 0.85) * exp(-dh * 9.0) * 0.35;
      col += fl * vis;
    }
  }
  if (shafts > 0.0) {
    // Light shafts (Max graphics): march from each pixel towards the sun
    // through the bloom buffer, so bright sky between trees and scenery
    // streaks across the frame. The sun may be just off-screen.
    vec2 d = (sunPos - vUv) * (1.0 / 28.0);
    vec2 p = vUv;
    vec3 acc = vec3(0.0);
    float w = 1.0;
    for (int i = 0; i < 28; i++) {
      p += d;
      float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
      acc += texture2D(tBloom, p).rgb * (w * inside);
      w *= 0.955;
    }
    float fall = smoothstep(2.4, 0.0, length((vUv - sunPos) * vec2(aspect, 1.0)));
    col += acc * shafts * 0.011 * fall;
  }
  col *= exposure;
  col = neutral(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, saturation), 0.0) * tint;
  col = toSRGB(col);
  col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
  col = col + lift * (1.0 - col);
  col *= mix(1.0, smoothstep(1.25, 0.45, r), vignette);
  col += (hash(gl_FragCoord.xy + fract(time) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

// Default grade; themes and screens override parts of it.
export const GRADE = {
  exposure: 1.0,
  bloom: 0.9,
  threshold: 1.0,
  knee: 0.5,
  saturation: 1.08,
  contrast: 0.12,
  vignette: 0.35,
  tint: '#ffffff',
  lift: '#000000',
  boost: 0,
};

const LEVELS = 5;

export class PostFX {
  constructor(renderer) {
    this.r = renderer;
    const ext = renderer.extensions;
    this.hdr = renderer.capabilities.isWebGL2 !== false && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.enabled = true;
    this.bloomOn = true;
    this.samples = 4;
    this.w = 0;
    this.h = 0;
    this.time = 0;
    this._tint = new THREE.Color();
    this._lift = new THREE.Color();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mk = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra,
    });
    this.mPre = mk(PREFILTER, { tIn: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.5 } });
    this.mDown = mk(DOWN, { tIn: { value: null }, texel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tIn: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } }, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mComp = mk(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, bloom: { value: 0 }, exposure: { value: 1 }, saturation: { value: 1 },
      contrast: { value: 0 }, vignette: { value: 0 }, boost: { value: 0 }, time: { value: 0 }, aspect: { value: 1 },
      tint: { value: new THREE.Color(1, 1, 1) }, lift: { value: new THREE.Color(0, 0, 0) },
      sunPos: { value: new THREE.Vector2(0.5, 0.5) }, sunOn: { value: 0 }, shafts: { value: 0 },
    });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.rt = null;
    this.levels = [];
    this.type = THREE.HalfFloatType;
    this.verified = false;
  }

  get active() {
    return this.enabled && this.hdr;
  }

  configure({ samples = 4, bloom = true, shafts = 0 } = {}) {
    this.bloomOn = bloom;
    this.shafts = shafts;
    if (samples !== this.samples) {
      this.samples = samples;
      if (this.rt) {
        this.rt.dispose();
        this.rt = null;
        this.verified = false;
        const w = this.w, h = this.h;
        this.w = 0;
        this.setSize(w, h);
      }
    }
  }

  // Size in device pixels (the drawing buffer size).
  setSize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    if (!this.hdr) return;
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(w, h, {
        type: this.type, samples: this.samples, depthBuffer: true, stencilBuffer: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      });
    } else this.rt.setSize(w, h);
    let lw = w, lh = h;
    for (let i = 0; i < LEVELS; i++) {
      lw = Math.max(1, Math.round(lw / 2));
      lh = Math.max(1, Math.round(lh / 2));
      if (!this.levels[i]) {
        this.levels[i] = new THREE.WebGLRenderTarget(lw, lh, {
          type: this.type, depthBuffer: false, stencilBuffer: false,
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
        });
      } else this.levels[i].setSize(lw, lh);
    }
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  // If the driver can't render to a multisampled half-float target, fall back
  // to 8-bit targets (no HDR headroom, but everything else still works).
  _verify() {
    this.verified = true;
    const r = this.r;
    const gl = r.getContext();
    r.setRenderTarget(this.rt);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    r.setRenderTarget(null);
    if (ok || this.type === THREE.UnsignedByteType) return;
    console.warn('PostFX: half-float target incomplete, using 8-bit');
    this.type = THREE.UnsignedByteType;
    this.rt.dispose();
    this.rt = null;
    for (const l of this.levels) l.dispose();
    this.levels = [];
    const w = this.w, h = this.h;
    this.w = 0;
    this.setSize(w, h);
  }

  render(scene, camera, grade = GRADE, dt = 1 / 60) {
    const r = this.r;
    this.time += dt;
    if (!this.verified) this._verify();
    r.setRenderTarget(this.rt);
    r.render(scene, camera);

    const autoClear = r.autoClear;
    r.autoClear = false;
    const g = grade;
    const bloom = this.bloomOn && (g.bloom ?? GRADE.bloom) > 0;
    if (bloom) {
      const L = this.levels;
      this.mPre.uniforms.tIn.value = this.rt.texture;
      this.mPre.uniforms.texel.value.set(1 / this.w, 1 / this.h);
      this.mPre.uniforms.threshold.value = g.threshold ?? GRADE.threshold;
      this.mPre.uniforms.knee.value = g.knee ?? GRADE.knee;
      this._pass(this.mPre, L[0]);
      for (let i = 1; i < LEVELS; i++) {
        this.mDown.uniforms.tIn.value = L[i - 1].texture;
        this.mDown.uniforms.texel.value.set(1 / L[i - 1].width, 1 / L[i - 1].height);
        this._pass(this.mDown, L[i]);
      }
      // Walk back up, adding each blurred level onto the one above it.
      for (let i = LEVELS - 2; i >= 0; i--) {
        this.mUp.uniforms.tIn.value = L[i + 1].texture;
        this.mUp.uniforms.texel.value.set(1 / L[i + 1].width, 1 / L[i + 1].height);
        this._pass(this.mUp, L[i]);
      }
    }
    const u = this.mComp.uniforms;
    u.tScene.value = this.rt.texture;
    u.tBloom.value = bloom ? this.levels[0].texture : this.black;
    u.bloom.value = bloom ? (g.bloom ?? GRADE.bloom) / LEVELS : 0;
    u.exposure.value = g.exposure ?? GRADE.exposure;
    u.saturation.value = g.saturation ?? GRADE.saturation;
    u.contrast.value = g.contrast ?? GRADE.contrast;
    u.vignette.value = g.vignette ?? GRADE.vignette;
    u.boost.value = g.boost || 0;
    u.time.value = this.time;
    u.aspect.value = this.w / this.h;
    u.tint.value.set(g.tint ?? GRADE.tint);
    u.lift.value.set(g.lift ?? GRADE.lift).convertLinearToSRGB();
    u.sunOn.value = bloom && g.sunOn ? g.sunOn * (g.flare ?? 1) : 0;
    if (g.sunOn || g.shaftOn) u.sunPos.value.set(g.sunX, g.sunY);
    u.shafts.value = bloom && g.shaftOn ? (this.shafts || 0) * g.shaftOn * (g.flare ?? 1) : 0;
    this._pass(this.mComp, null);
    r.autoClear = autoClear;
  }

  dispose() {
    if (this.rt) this.rt.dispose();
    for (const l of this.levels) l.dispose();
    for (const m of [this.mPre, this.mDown, this.mUp, this.mComp]) m.dispose();
    this.quad.geometry.dispose();
    this.black.dispose();
  }
}
