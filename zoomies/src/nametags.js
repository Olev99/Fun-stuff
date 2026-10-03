import * as THREE from 'three';

const _v = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Floating tags over the other karts with their current place and name, so
// you can tell who you just passed. Friends (other people in an online race)
// get big tags in their kart colour that show from far away; computer racers
// get small ones that only appear up close. mode: 'all' | 'friends' | 'off'.
export class NameTags {
  constructor(race, mode) {
    this.race = race;
    this.el = document.getElementById('hud-tags');
    this.el.innerHTML = '';
    this.tags = [];
    if (mode === 'off' || race.mode === 'demo' || race.mode === 'tt') return;
    for (const k of race.karts) {
      if (k.isPlayer) continue;
      const friend = !!k.human;
      if (!friend && mode !== 'all') continue;
      const d = document.createElement('div');
      d.className = friend ? 'tag friend' : 'tag';
      d.style.setProperty('--c', k.ch.color);
      const place = document.createElement('b');
      const name = document.createElement('span');
      name.textContent = k.nick || k.ch.name;
      d.append(place, name);
      this.el.appendChild(d);
      this.tags.push({ k, d, place, n: 0, a: -1, friend, max: friend ? 170 : 45 });
    }
  }

  update(camera, w, h) {
    if (!this.tags.length) return;
    const race = this.race;
    const show = race.state === 'countdown' || race.state === 'race' || race.state === 'finished';
    const cam = camera.position;
    for (const t of this.tags) {
      const k = t.k;
      let a = 0;
      const dist = cam.distanceTo(k.pos);
      let edge = false;
      if (show && dist < t.max && !k.out) {
        _v.set(k.pos.x, k.pos.y + 2.3, k.pos.z).project(camera);
        if (_v.z < 1 && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15) {
          // Fade out towards the edge of the range.
          a = clamp((t.max - dist) / (t.max * 0.3), 0, 1);
          const x = (_v.x * 0.5 + 0.5) * w, y = (0.5 - _v.y * 0.5) * h;
          const s = t.friend ? clamp(22 / dist, 0.72, 1.12) : clamp(16 / dist, 0.62, 1);
          t.d.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%) scale(${s.toFixed(3)})`;
        } else if (t.friend && race.state === 'race' && race.player) {
          // A friend right behind you: a marker at the bottom of the screen.
          const p = race.player;
          const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
          const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
          const back = -(dx * fx + dz * fz), gap = Math.hypot(dx, dz);
          if (back > 0 && gap < 70) {
            edge = true;
            a = clamp((70 - gap) / 25, 0, 1);
            const lat = dx * fz - dz * fx;
            const x = w / 2 - clamp(lat / 18, -1, 1) * w * 0.22, y = h - 60;
            t.d.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%) scale(0.9)`;
          }
        }
      }
      if (edge !== t.edge) {
        t.edge = edge;
        t.d.classList.toggle('edge', edge);
      }
      if (Math.abs(a - t.a) > 0.02 || (a === 0) !== (t.a === 0)) {
        t.a = a;
        t.d.style.opacity = a.toFixed(2);
      }
      // In a battle the tag shows balloons left instead of the place.
      const lbl = race.battle ? `🎈${k.balloons}` : k.place;
      if (lbl !== t.n) {
        t.n = lbl;
        t.place.textContent = lbl;
      }
    }
  }

  dispose() {
    this.el.innerHTML = '';
    this.tags = [];
  }
}

// Player names typed on the phone: short, one line, no markup.
export function cleanNick(n) {
  return String(n || '').replace(/[\u0000-\u001f<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}
