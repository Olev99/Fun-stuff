import * as THREE from 'three';
import { kartGeometry, wheelGeometry, WHEELS, CHARACTERS } from './characters.js';
import { GeoBuilder, pbrMat } from './util.js';
import { studioEnvironment } from './env.js';

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FRAG = /* glsl */ `
uniform vec3 a; uniform vec3 b; uniform vec3 c;
varying vec2 vUv;
void main() {
  float r = length((vUv - vec2(0.28, 0.45)) * vec2(1.6, 1.0));
  vec3 col = mix(a, b, smoothstep(0.0, 0.9, r));
  col = mix(col, c, smoothstep(0.55, 1.0, vUv.y) * 0.5);
  // diagonal speed stripes
  float st = step(0.5, fract((vUv.x * 1.6 + vUv.y) * 7.0));
  col *= 1.0 - st * 0.05;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// The garage turntable used on the character screen, plus portrait renders.
export class Showroom {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 3.2, 11.8);
    this.camera.lookAt(0, 0.8, 0);
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT, fragmentShader: BG_FRAG, depthWrite: false,
      uniforms: { a: { value: new THREE.Color('#ff7eb0') }, b: { value: new THREE.Color('#2c2352') }, c: { value: new THREE.Color('#1d1537') } },
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -1;
    this.scene.add(bg);
    this.envRT = studioEnvironment(app.renderer);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.9;
    const sun = new THREE.DirectionalLight('#fff4e8', 2.6);
    sun.position.set(3, 6, 5);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#9fe8ff', 2.2);
    rim.position.set(-4, 3, -5);
    this.scene.add(rim);
    // Soft grade with plenty of bloom on the kart lights.
    this.grade = { exposure: 1.05, bloom: 0.8, threshold: 1.1, saturation: 1.1, contrast: 0.1, vignette: 0.55 };

    // Podium
    const B = new GeoBuilder('paint');
    B.add(new THREE.CylinderGeometry(2.7, 2.9, 0.5, 64), '#1d1537', [0, -0.25, 0]);
    B.add(new THREE.CylinderGeometry(2.55, 2.55, 0.06, 64), '#ffd23f', [0, 0.02, 0], [0, 0, 0], 1, 'glow');
    B.add(new THREE.CylinderGeometry(2.3, 2.3, 0.08, 64), '#3d3270', [0, 0.04, 0], [0, 0, 0], 1, [0.18, 0.2, 0]);
    this.podium = new THREE.Mesh(B.build(), pbrMat());
    this.scene.add(this.podium);

    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    this.mat = pbrMat();
    this.chassis = new THREE.Mesh(undefined, this.mat);
    this.driver = new THREE.Mesh(undefined, this.mat);
    this.turn.add(this.chassis, this.driver);
    this.wheelMat = pbrMat();
    this.wheels = WHEELS.map((w) => {
      const m = new THREE.Mesh(wheelGeometry(), this.wheelMat);
      m.position.set(w.x, w.y, w.z);
      m.scale.set(w.w, w.r, w.r);
      if (w.front) m.rotation.y = -0.3;
      this.turn.add(m);
      return m;
    });
    this.bounce = 0;
    this.angle = -0.6;
    this.time = 0;
    this.offsetX = 0.22;
    this.setChar(CHARACTERS[0]);
  }

  setChar(ch) {
    const g = kartGeometry(ch);
    this.chassis.geometry = g.chassis;
    this.driver.geometry = g.driver;
    this.wheelMat.color.set(ch.accent === '#1d1537' ? '#ffd23f' : ch.accent);
    this.bgMat.uniforms.a.value.set(ch.color);
    this.bounce = 1;
    this.ch = ch;
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.camera.aspect = w / h;
    this._view();
  }

  _view() {
    if (!this.w) return;
    const w = this.w, h = this.h;
    // Shift the projection so the kart sits in the left half of the screen.
    this.camera.setViewOffset(w, h, (0.5 - this.offsetX) * w, h * 0.17, w, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    this.angle += dt * 0.5;
    this.turn.rotation.y = this.angle;
    this.podium.rotation.y = this.angle;
    this.bounce = Math.max(0, this.bounce - dt * 2.2);
    const b = Math.sin((1 - this.bounce) * Math.PI) * this.bounce;
    this.turn.position.y = b * 0.6;
    this.driver.rotation.z = Math.sin(this.time * 2.2) * 0.04;
    this.driver.position.y = Math.abs(Math.sin(this.time * 3)) * 0.03;
  }

  // Render a square head-and-shoulders portrait for each character.
  portraits(renderer, size = 128) {
    const S = size * 2;
    const rt = new THREE.WebGLRenderTarget(S, S, { depthBuffer: true });
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const buf = new Uint8Array(S * S * 4);
    const big = document.createElement('canvas');
    big.width = S;
    big.height = S;
    const bctx = big.getContext('2d');
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const octx = out.getContext('2d');
    // linear -> sRGB lookup
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      lut[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
    }
    const saved = { angle: this.angle, ch: this.ch, pos: this.turn.position.y, ry: this.turn.rotation.y };
    const bgWas = this.bgMat.uniforms.a.value.clone();
    const urls = {};
    this.turn.position.y = 0;
    this.turn.rotation.y = 0.5;
    this.podium.visible = false;
    for (const ch of CHARACTERS) {
      this.setChar(ch);
      this.bounce = 0;
      this.driver.position.y = 0;
      this.driver.rotation.z = 0;
      cam.position.set(1.05, 2.05, 2.55);
      cam.lookAt(0.05, 1.45, 0.15);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(this.scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
      renderer.setRenderTarget(null);
      const img = bctx.createImageData(S, S);
      for (let y = 0; y < S; y++) {
        const src = (S - 1 - y) * S * 4;
        const dst = y * S * 4;
        for (let x = 0; x < S * 4; x += 4) {
          img.data[dst + x] = lut[buf[src + x]];
          img.data[dst + x + 1] = lut[buf[src + x + 1]];
          img.data[dst + x + 2] = lut[buf[src + x + 2]];
          img.data[dst + x + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);
      octx.clearRect(0, 0, size, size);
      octx.drawImage(big, 0, 0, size, size);
      urls[ch.id] = out.toDataURL('image/png');
    }
    rt.dispose();
    this.podium.visible = true;
    this.setChar(saved.ch);
    this.bgMat.uniforms.a.value.copy(bgWas);
    this.angle = saved.angle;
    this.turn.position.y = saved.pos;
    this.bounce = 0;
    return urls;
  }
}

