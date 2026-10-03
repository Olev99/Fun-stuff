import * as THREE from 'three';
import { clamp, wrapAngle, stdMat } from './util.js';
import { AIM_DEFAULT } from './items.js';

// Balloon Battle: everyone starts with three balloons. Any hit pops one,
// ramming someone while boosting steals one, and losing the last balloon
// knocks you out. The last racer left wins, or whoever holds the most
// balloons when the clock runs out.
export const BATTLE_TIME = 150;
export const START_BALLOONS = 3;
export const MAX_BALLOONS = 5;
export const BATTLE_FIELD = 6;
const COLORS = ['#ff5a5f', '#ffd23f', '#36a9ff', '#19e3b1', '#c77dff'];

// What the item orbs hold in a battle: no racing items (warps, rockets,
// gems, place swaps), more things to throw.
const TABLE = { ball: 14, boomerang: 10, honey: 8, oil: 7, bomb: 9, firework: 8, freeze: 8, chili: 9, chili3: 4, bubble: 8, horn: 5, drum: 4, bee: 6, rainbow: 3, twister: 4, pogo: 4, ghost: 3 };

let balloonGeo = null, stringGeo = null;
function geos() {
  if (balloonGeo) return;
  balloonGeo = new THREE.SphereGeometry(0.44, 14, 10);
  balloonGeo.scale(1, 1.18, 1);
  const knot = new THREE.ConeGeometry(0.1, 0.16, 6);
  knot.translate(0, -0.55, 0);
  balloonGeo = mergeTwo(balloonGeo, knot);
  stringGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 4);
  stringGeo.translate(0, 0.5, 0);
}
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  const ai = a.index ? a.toNonIndexed() : a, bi = b.index ? b.toNonIndexed() : b;
  for (const key of ['position', 'normal']) {
    const A = ai.attributes[key].array, Bv = bi.attributes[key].array;
    const m = new Float32Array(A.length + Bv.length);
    m.set(A);
    m.set(Bv, A.length);
    g.setAttribute(key, new THREE.BufferAttribute(m, 3));
  }
  return g;
}

export class Battle {
  constructor(race) {
    this.race = race;
    this.timeLeft = BATTLE_TIME;
    this.outOrder = [];
    this.done = false;
    this.endAt = -1;
    this._tmp = new THREE.Vector3();
    geos();
  }

  // Spread the field round the bowl, facing alternate ways.
  startSlot(i, n) {
    const tr = this.race.track;
    const fr = tr.frame(0, {});
    return { s: ((i + 0.5) / n) * tr.length, d: (i % 2 ? 0.25 : -0.45) * fr.hw, flip: i % 2 === 1 };
  }

  setup() {
    for (const k of this.race.karts) {
      k.balloons = START_BALLOONS;
      k.out = false;
      k.hitsLanded = 0;
      k.balloonGroup = new THREE.Group();
      k.balloonMeshes = [];
      for (let i = 0; i < MAX_BALLOONS; i++) {
        const g = new THREE.Group();
        // Your own balloons are see-through so they never hide the road ahead.
        const own = k.isPlayer;
        const b = new THREE.Mesh(balloonGeo, stdMat({ color: COLORS[(k.index + i) % COLORS.length], roughness: 0.22, emissive: COLORS[(k.index + i) % COLORS.length], emissiveIntensity: 0.12, transparent: own, opacity: own ? 0.42 : 1, depthWrite: !own }));
        if (own) b.scale.setScalar(0.8);
        b.castShadow = !!this.race.quality.shadows;
        const s = new THREE.Mesh(stringGeo, stdMat({ color: '#ffffff', roughness: 0.6 }));
        g.add(b, s);
        g.userData = { b, s, ph: Math.random() * 6 };
        k.balloonGroup.add(g);
        k.balloonMeshes.push(g);
      }
      k.root.add(k.balloonGroup);
      this._layout(k);
    }
  }

  // Balloons on strings behind the driver's seat, fanned out.
  _layout(k) {
    const n = k.balloons;
    k.balloonMeshes.forEach((g, i) => {
      g.visible = i < n;
      const x = (i - (n - 1) / 2) * 0.62;
      g.userData.x = x;
      g.userData.y = 1.9 + Math.abs(x) * -0.1 + (i % 2) * 0.16;
    });
  }

  // Bob the balloons and lean them back as the kart speeds up.
  animate(dt, time) {
    for (const k of this.race.karts) {
      if (!k.balloonMeshes || k.out) continue;
      const lean = clamp(k.speed / 40, 0, 1) * 0.5;
      for (const g of k.balloonMeshes) {
        if (!g.visible) continue;
        const u = g.userData;
        const bob = Math.sin(time * 2.4 + u.ph) * 0.08;
        const back = -1.5 - lean * 0.6;
        const h = u.y + bob - lean * 0.3;
        u.b.position.set(u.x * 1.1, h, back - 0.2);
        u.b.rotation.z = Math.sin(time * 1.7 + u.ph) * 0.12;
        // The string runs from the back of the seat up to the knot.
        const ax = u.x * 0.25, ay = 0.9, az = -1.1;
        const dx = u.x * 1.1 - ax, dy = h - 0.58 - ay, dz = back - 0.2 - az;
        const len = Math.hypot(dx, dy, dz);
        u.s.position.set(ax, ay, az);
        u.s.scale.set(1, len, 1);
        u.s.quaternion.setFromUnitVectors(_up, this._tmp.set(dx / len, dy / len, dz / len));
      }
    }
  }

  // Which items the orbs give: a little help for whoever is down to one balloon.
  roll(k) {
    const t = k.balloons <= 1 ? { ...TABLE, rainbow: 8, bubble: 12 } : TABLE;
    let sum = 0;
    for (const v of Object.values(t)) sum += v;
    let r = Math.random() * sum;
    for (const [it, w] of Object.entries(t)) if ((r -= w) < 0) return it;
    return 'ball';
  }

  // The Buzz Bee hunts whoever holds the most balloons.
  beeTarget(k) {
    let best = null;
    for (const o of this.race.karts) {
      if (o === k || o.out) continue;
      if (!best || o.balloons > best.balloons || (o.balloons === best.balloons && o.pos.distanceToSquared(k.pos) < best.pos.distanceToSquared(k.pos))) best = o;
    }
    return best;
  }

  // A hit landed on k (called from Kart.hit): pop a balloon.
  onHit(k) {
    if (k.out || this.done) return;
    k.balloons--;
    // A few safe seconds after each pop, so one combo can't wipe you out.
    k.invuln = Math.max(k.invuln, 3.2);
    const g = k.balloonMeshes[k.balloons];
    const race = this.race;
    if (g) {
      g.userData.b.getWorldPosition(this._tmp);
      race.fx.burst(this._tmp.x, this._tmp.y, this._tmp.z, [COLORS[(k.index + k.balloons) % COLORS.length], '#ffffff'], 18, 7, 0.4, 0.5, 4);
    }
    const near = k.isPlayer || (race.player && k.pos.distanceToSquared(race.player.pos) < 900);
    if (near) race.app.audio.play('pop');
    this._layout(k);
    if (k.balloons <= 0) this._knockOut(k);
    else if (k.isPlayer) race.app.hud.toast(k.balloons === 1 ? 'LAST BALLOON!' : 'POP!');
  }

  // Ramming with a Chili Boost (or a Rainbow Rush) steals a balloon.
  ram(a, b, closing) {
    if (this.done || a.out || b.out || closing < 5) return false;
    // Only an item boost counts (Chili Boost or Rainbow Rush), not drift turbos or pads.
    const fast = (k) => k.ramT > 0 || k.starTime > 0 || k.rocketTime > 0;
    let att = null, vic = null;
    if (fast(a) && !fast(b)) { att = a; vic = b; }
    else if (fast(b) && !fast(a)) { att = b; vic = a; }
    if (!att) return false;
    // Only a head-on-ish shunt from the boosting kart counts.
    const fx = Math.sin(att.yaw), fz = Math.cos(att.yaw);
    const dx = vic.pos.x - att.pos.x, dz = vic.pos.z - att.pos.z;
    if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < 0.35) return false;
    if (!vic.hit('spin')) return true;
    att.hitsLanded++;
    if (att.balloons < MAX_BALLOONS) {
      att.balloons++;
      this._layout(att);
      const hud = this.race.app.hud;
      if (att.isPlayer) { hud.toast('STOLEN! +1 🎈'); this.race.style('BALLOON STEAL', 30, 'gold'); this.race.app.audio.play('gem'); }
      else if (vic.isPlayer) hud.toast(`${att.nick || att.ch.name} stole a balloon!`);
    }
    return true;
  }

  // Credit for a hit landed with an item.
  credit(victim, owner) {
    if (owner && owner !== victim && !owner.out) owner.hitsLanded++;
  }

  _knockOut(k) {
    const race = this.race;
    k.out = true;
    k.outAt = race.raceTime;
    this.outOrder.push(k);
    race.fx.burst(k.pos.x, k.pos.y + 1.5, k.pos.z, ['#ffffff', '#cfd8e6', '#1d1537'], 30, 9, 1, 0.9, 3, false);
    const alive = race.karts.filter((o) => !o.out).length;
    if (k.isPlayer) {
      race.app.hud.banner('OUT!<small>No balloons left</small>', 'final');
      race.app.audio.play('lose');
      race.flash = 0.5;
      // Watch for a moment, then the battle is over for you.
      this.endAt = race.raceTime + 2.6;
    } else if (race.player && !race.player.out) {
      race.app.hud.toast(`${k.nick || k.ch.name} is out! ${alive} left`);
    }
    this._park(k);
    if (alive <= 1 && this.endAt < 0) this.endAt = race.raceTime + 1.6;
  }

  // Knocked-out karts leave the arena.
  _park(k) {
    k.ai = null;
    k.ctl.throttle = 0;
    k.ctl.item = false;
    k.item = null;
    k.rolling = 0;
    k.vel.set(0, 0, 0);
    k.pos.y = -400;
    k.root.visible = false;
    k.shadow.visible = false;
  }

  update(dt) {
    const race = this.race;
    if (this.done || race.state !== 'race') return;
    this.timeLeft = Math.max(0, BATTLE_TIME - race.raceTime);
    const hud = race.app.hud;
    const tl = Math.ceil(this.timeLeft);
    if (tl !== this._lastTl) {
      this._lastTl = tl;
      if (tl === 30) hud.banner('30 SECONDS LEFT!', 'lap');
      if (tl <= 10 && tl > 0) race.app.audio.play('count');
    }
    for (const k of race.karts) {
      if (k.ramT > 0) k.ramT -= dt;
      if (k.out && k.pos.y > -300) this._park(k);
    }
    if (this.timeLeft <= 0 || (this.endAt >= 0 && race.raceTime >= this.endAt)) this._end();
  }

  // Standings: survivors by balloons then hits landed; knocked-out karts by
  // how long they lasted.
  standings() {
    return [...this.race.karts].sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1;
      if (a.out) return b.outAt - a.outAt;
      return b.balloons - a.balloons || b.hitsLanded - a.hitsLanded || a.index - b.index;
    });
  }

  _end() {
    if (this.done) return;
    this.done = true;
    const race = this.race;
    const order = this.standings();
    order.forEach((k, i) => (k.place = i + 1));
    race.order = order;
    const p = race.player;
    const won = p && p.place === 1;
    const timeUp = this.timeLeft <= 0;
    race.setState('finished');
    if (p && !p.out) {
      race.app.hud.banner(won ? `YOU WIN!<small>${timeUp ? 'Most balloons when time ran out' : 'Last one standing'}</small>` : `TIME!<small>${p.place}${['st', 'nd', 'rd'][p.place - 1] || 'th'} place</small>`, 'finish');
      race.app.audio.play(won ? 'finish' : 'lose');
      if (won) race.fx.burst(p.pos.x, p.pos.y + 2, p.pos.z, ['#ff5a5f', '#ffd23f', '#19e3b1', '#36a9ff', '#c77dff'], 60, 14, 0.6, 1.4, 12);
      p.ai = new BattleAI(p, race, 0.9);
    }
    race.app.input.resetButtons();
    race.app.applyControls();
    this.rows = order.map((k) => ({
      ch: k.ch, nick: k.nick, isPlayer: k.isPlayer, slot: k.index, place: k.place, time: 0, finished: true,
      balloons: k.out ? 0 : k.balloons, hits: k.hitsLanded, out: k.out, lapTimes: [],
    }));
    setTimeout(() => {
      if (race.app.race === race && !race.results) {
        race.results = this.rows;
        race.app.onRaceComplete(race, this.rows);
      }
    }, 3200);
  }

  dispose() {
    for (const k of this.race.karts) {
      for (const g of k.balloonMeshes || []) g.userData.b.material.dispose();
    }
  }
}

const _up = new THREE.Vector3(0, 1, 0);

// Computer driver for battles: hunts rivals, grabs item orbs, steers round
// the island and the walls, rams with boosts and aims its throws.
export class BattleAI {
  constructor(kart, race, skill = 0.9, diff = null) {
    this.k = kart;
    this.race = race;
    this.skill = skill;
    this.diff = diff || { drift: 0.6, dodge: 0.6, items: 0.7 };
    this.target = null;
    this.goal = null;
    this.retarget = 0;
    this.itemDelay = 1 + Math.random() * 2;
    this.fr = {};
    this.tp = {};
    this.driftT = 0;
    this.stuck = 0;
    this.wander = Math.random();
  }

  _pickGoal() {
    const k = this.k, race = this.race;
    const rivals = race.karts.filter((o) => o !== k && !o.out);
    const wantItem = !k.item && k.rolling <= 0;
    let best = null, bestScore = Infinity;
    if (wantItem) {
      for (const b of race.items.boxes) {
        if (!b.active) continue;
        const d = b.pos.distanceTo(k.pos);
        const ahead = Math.cos(wrapAngle(Math.atan2(b.pos.x - k.pos.x, b.pos.z - k.pos.z) - k.yaw));
        const score = d * (1.25 - ahead * 0.4);
        if (score < bestScore) { bestScore = score; best = { box: b }; }
      }
    }
    if (!best || (k.item && rivals.length)) {
      for (const o of rivals) {
        const d = o.pos.distanceTo(k.pos);
        // Everyone likes chasing the leader; nobody goes for a kart that can't be hit yet.
        const score = d - o.balloons * 6 + (o.invuln > 0 ? 40 : 0) + Math.random() * 20;
        if (!best || best.box || score < bestScore) { bestScore = score; best = { kart: o }; }
      }
    }
    this.goal = best;
    this.retarget = 1.2 + Math.random() * 1.6;
  }

  update(dt, time) {
    const k = this.k, race = this.race, tr = race.track, c = k.ctl;
    if (k.out) return;
    this.retarget -= dt;
    const g = this.goal;
    if (this.retarget <= 0 || !g || (g.box && !g.box.active) || (g.kart && g.kart.out) || (g.box && k.item)) this._pickGoal();
    let gx, gz;
    const goal = this.goal;
    if (goal && goal.kart) {
      // Lead a moving target a little.
      const o = goal.kart;
      const dist = o.pos.distanceTo(k.pos);
      const t = Math.min(0.8, dist / 45) * this.skill;
      gx = o.pos.x + o.vel.x * t;
      gz = o.pos.z + o.vel.z * t;
    } else if (goal && goal.box) {
      gx = goal.box.pos.x;
      gz = goal.box.pos.z;
    } else {
      tr.pointAt((this.wander * tr.length + time * 8) % tr.length, 0, this._tmpV || (this._tmpV = new THREE.Vector3()));
      gx = this._tmpV.x;
      gz = this._tmpV.z;
    }
    // Plan in path space: go round the island the short way, and keep the
    // aim point on the floor, clear of the walls.
    const me = k.trk;
    const tp = tr.project(gx, gz, -1, this.tp);
    let ds = tp.s - me.s;
    const L = tr.length;
    if (ds > L / 2) ds -= L;
    if (ds < -L / 2) ds += L;
    let s = tp.s, d = tp.d;
    if (Math.abs(ds) > L * 0.27) {
      s = me.s + Math.sign(ds) * L * 0.2;
      d = clamp(d, -tp.hw * 0.4, tp.hw * 0.2);
    }
    // Dodge hazards and obstacles in front.
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    let avoid = 0;
    if (Math.random() < 0.4 + this.diff.dodge * 0.6) {
      const check = (px, pz, r) => {
        const dx = px - k.pos.x, dz = pz - k.pos.z;
        const fwd = dx * fx + dz * fz;
        if (fwd < 2 || fwd > 22) return;
        const lat = dx * -fz + dz * fx;
        if (Math.abs(lat) < r + 1.6) avoid = lat > 0 ? -1 : 1;
      };
      for (const h of race.items.hazards) check(h.pos.x, h.pos.z, h.r || 1.6);
      for (const o of race.items.obstacles) check(o.pos.x, o.pos.z, o.def.r);
    }
    tr.frame(s, this.fr);
    const lim = this.fr.hw - 2.5;
    d = clamp(d, -lim, lim);
    let tx = this.fr.x + this.fr.rx * d, tz = this.fr.z + this.fr.rz * d;
    if (avoid) { tx += -fz * avoid * 6; tz += fx * avoid * 6; }
    const desired = Math.atan2(tx - k.pos.x, tz - k.pos.z);
    const diff = wrapAngle(desired - k.yaw);
    const spd = Math.max(0, k.fwdSpeed);
    c.steer = clamp(-diff * 2.6, -1, 1);
    c.throttle = 1;
    c.brake = Math.abs(diff) > 1.5 && spd > 12;

    // Stuck on a wall: back off and turn.
    if (spd < 2.5 && race.raceTime > 3) {
      this.stuck += dt;
      if (this.stuck > 0.9) { c.brake = true; c.throttle = 0; c.steer = -Math.sign(diff || 1); }
      if (this.stuck > 2) this.stuck = 0;
    } else this.stuck = Math.max(0, this.stuck - dt);

    // Drift through sharp turns for a boost.
    if (c.drift) {
      this.driftT += dt;
      if (Math.abs(diff) < 0.15 || this.driftT > 1.6 || (this.driftT > 0.4 && !k.drifting)) c.drift = false;
    } else if (!k.drifting && spd > 18 && Math.abs(diff) > 0.55 && Math.abs(diff) < 1.4 && Math.random() < this.diff.drift * dt * 3) {
      c.drift = true;
      this.driftT = 0;
    }

    this._items(dt);
  }

  // Items: aim at whoever is in front, drop traps on whoever is behind.
  _items(dt) {
    const k = this.k, race = this.race, c = k.ctl;
    this.itemDelay -= dt;
    if (c.item && this.itemDelay > 0.4) return;
    c.item = false;
    if (!k.item || k.rolling > 0 || this.itemDelay > 0) return;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    let front = null, frontD = Infinity, back = null, backD = Infinity, near = Infinity;
    const acc = 0.08 + 0.25 * this.diff.items;
    for (const o of race.karts) {
      if (o === k || o.out) continue;
      const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      near = Math.min(near, dist);
      const cos = (dx * fx + dz * fz) / dist;
      if (cos > Math.cos(acc) && dist < frontD) { front = o; frontD = dist; }
      if (cos < -0.85 && dist < backD) { back = o; backD = dist; }
    }
    const incoming = race.items.projectiles.some((p) => p.owner !== k && (p.pos.x - k.pos.x) ** 2 + (p.pos.z - k.pos.z) ** 2 < 300);
    let use = false, aim = 0;
    // A moment to line up a shot (shorter on Hard) before letting fly.
    const lined = (on) => {
      this.aimT = on ? (this.aimT || 0) + dt : 0;
      return this.aimT > 0.25 + (1 - this.diff.items) * 1.1;
    };
    switch (k.item) {
      case 'ball': case 'boomerang': case 'firework': case 'freeze': case 'bomb':
        if (lined(front && frontD < (k.item === 'bomb' ? 26 : 42))) { use = true; aim = 1; }
        else if (back && backD < 16 && Math.random() < dt * 2) { use = true; aim = -1; }
        break;
      case 'honey': case 'oil':
        if (back && backD < 24) { use = true; aim = -1; }
        else if (front && frontD < 18) { use = true; aim = 1; }
        break;
      case 'chili':
        use = !!(front && frontD < 22) || Math.random() < dt * 0.05;
        break;
      case 'horn':
        use = near < 8.5 || incoming;
        break;
      case 'drum':
        use = near < 12 || incoming;
        break;
      case 'twister':
        use = near < 20;
        break;
      case 'bubble': case 'ghost': case 'pogo':
        use = incoming || Math.random() < dt * 0.04;
        break;
      case 'rainbow':
        use = near < 30;
        break;
      default:
        use = true;
    }
    if (!use) return;
    c.item = true;
    c.aim = AIM_DEFAULT[k.item] ? aim || AIM_DEFAULT[k.item] : 0;
    this.itemDelay = 0.6 + Math.random() * 1.6 / Math.max(0.3, this.diff.items);
  }
}
