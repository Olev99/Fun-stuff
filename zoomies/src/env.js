import * as THREE from 'three';

// Image-based lighting. Small procedural scenes are rendered into a
// prefiltered (PMREM) environment map that lights every PBR material: soft
// sky/ground ambient on rough surfaces, sky and softbox reflections on glossy
// paint.

const ENV_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const ENV_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 glow; uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.7, h), 0.8)) : mix(horizon * 0.6 + ground * 0.4, ground, smoothstep(0.0, -0.25, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += glow * (pow(s, 24.0) * 1.6 + pow(s, 4.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
}`;

let _pmrem = null;
function pmrem(renderer) {
  if (!_pmrem || _pmrem._renderer !== renderer) {
    _pmrem = new THREE.PMREMGenerator(renderer);
    _pmrem._renderer = renderer;
  }
  return _pmrem;
}

// Sky dome environment for a track theme. Returns the PMREM render target.
export function skyEnvironment(renderer, { top, horizon, ground, glow, sunDir }) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    vertexShader: ENV_VERT, fragmentShader: ENV_FRAG, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, ground: { value: new THREE.Color(ground) },
      glow: { value: new THREE.Color(glow) }, sunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    },
  });
  const geo = new THREE.SphereGeometry(10, 32, 16);
  scene.add(new THREE.Mesh(geo, mat));
  const rt = pmrem(renderer).fromScene(scene, 0.02, 0.1, 50);
  geo.dispose();
  mat.dispose();
  return rt;
}

// A photo-studio environment for the character showroom: a dim room with a
// big overhead softbox, a warm key panel and a cool rim strip.
export function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.ShaderMaterial({
    vertexShader: ENV_VERT, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#5a4d8a') }, horizon: { value: new THREE.Color('#2c2352') }, ground: { value: new THREE.Color('#1d1537') },
      glow: { value: new THREE.Color('#000000') }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
    },
    fragmentShader: ENV_FRAG,
  }));
  scene.add(room);
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  panel(8, 8, '#ffffff', 3.2, [0, 8, 0], [0, 0, 0]);
  panel(4, 6, '#fff1dc', 5, [6, 3, 5], [0, 1, 0]);
  panel(1.6, 7, '#9fe8ff', 4, [-6, 2.5, -5], [0, 1, 0]);
  panel(6, 2, '#ff9ecb', 2, [-5, 1, 6], [0, 1, 0]);
  const rt = pmrem(renderer).fromScene(scene, 0.03, 0.1, 50);
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return rt;
}
