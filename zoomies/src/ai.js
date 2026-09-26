import { clamp, wrapAngle } from './util.js';
import { AIM_DEFAULT } from './items.js';

// How the computer racers behave at each difficulty.
export const DIFFICULTY = {
  easy: { id: 'easy', name: 'Easy', speed: 0.89, skill: [0.72, 0.84], rubberUp: 0.05, rubberDown: 0.16, drift: 0.3, dodge: 0.3, shortcut: 0, items: 0.35, rocketStart: 0.1 },
  normal: { id: 'normal', name: 'Normal', speed: 0.955, skill: [0.84, 0.95], rubberUp: 0.1, rubberDown: 0.09, drift: 0.65, dodge: 0.6, shortcut: 0.35, items: 0.7, rocketStart: 0.3 },
  hard: { id: 'hard', name: 'Hard', speed: 1.0, skill: [0.95, 1.0], rubberUp: 0.14, rubberDown: 0.035, drift: 0.95, dodge: 0.9, shortcut: 0.8, items: 1, rocketStart: 0.6 },
};

// Computer driver: follows the racing line with its own lane preference,
// drifts through long corners, dodges hazards, takes shortcuts and uses items.
export class AIDriver {
  constructor(kart, race, skill = 1, diff = DIFFICULTY.normal, pilot = false) {
    this.k = kart;
    this.race = race;
    this.skill = skill;
    this.diff = diff;
    this.pilot = pilot; // autopilot for Rocket Ride: no drifting, no items
    this.lane = pilot ? 0 : (Math.random() - 0.5) * 5;
    this.phase = Math.random() * 100;
    this.fr = {};
    this.fr2 = {};
    this.itemDelay = 1 + Math.random() * 3;
    this.driftCool = Math.random() * 2;
    this.driftT = 0;
    this.dodge = 0;
    this.plan = {};
  }

  // Signed distance along the loop from a to b, in (-L/2, L/2].
  _ahead(a, b) {
    const L = this.race.track.length;
    let d = b - a;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  update(dt, time) {
    const k = this.k;
    const main = this.race.track;
    const c = k.ctl;
    const spd = Math.max(0, k.fwdSpeed);
    const look = 7 + spd * 0.42;
    let tx, tz, lane = 0;

    // World-space hazard/obstacle avoidance.
    let avoid = 0;
    if (!this.pilot && Math.random() < 0.3 + this.diff.dodge * 0.7) {
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
      const check = (px, pz, r) => {
        const dx = px - k.pos.x, dz = pz - k.pos.z;
        const fwd = dx * fx + dz * fz;
        if (fwd < 2 || fwd > 30) return;
        const lat = dx * -fz + dz * fx; // + = to our right
        if (Math.abs(lat) < r + 1.6) avoid = lat > 0 ? -4 : 4;
      };
      for (const h of this.race.items.hazards) check(h.pos.x, h.pos.z, h.r || 1.6);
      for (const o of this.race.items.obstacles) check(o.pos.x, o.pos.z, o.def.r);
    }
    this.dodge += (avoid - this.dodge) * Math.min(1, dt * 3);

    const wobble = this.pilot ? 0 : Math.sin(time * 0.35 + this.phase) * 1.8;
    let approach = false;
    if (k.path !== main) {
      // Following a shortcut branch.
      const p = k.path;
      const s = k.trk.s + look;
      approach = k.trk.s < 40;
      if (s < p.length) {
        p.frame(s, this.fr);
        lane = clamp(this.dodge * 0.6, -(this.fr.hw - 1.2), this.fr.hw - 1.2);
      } else {
        main.frame(p.toS + (s - p.length), this.fr);
        lane = clamp(main.racingLine[this.fr.i] * 0.5, -(this.fr.hw - 1.5), this.fr.hw - 1.5);
      }
    } else {
      main.frame(k.trk.s + look, this.fr);
      const lim = this.fr.hw - 1.4;
      lane = clamp(main.racingLine[this.fr.i] * this.skill + this.lane + wobble + this.dodge, -lim, lim);
      // Shortcut planning
      if (!this.pilot) for (const sc of main.shortcuts) {
        const dist = this._ahead(k.trk.s, sc.fromS);
        if (dist > 150 || dist < -60) { this.plan[sc.id] = undefined; continue; }
        if (this.plan[sc.id] === undefined) {
          if (dist <= 0) continue;
          const boost = ['chili', 'rainbow', 'rocket'].includes(k.item);
          let p = this.diff.shortcut * (sc.offroadAll ? (boost ? 1 : 0.1) : 1) * (sc.voids.length ? 0.85 : 1);
          if (k.shrinkTime > 0) p *= 0.3;
          this.plan[sc.id] = Math.random() < p;
          this.boostAt = sc.offroadAll && boost ? sc.id : -1;
        }
        // Missed the turn-in: give up instead of grinding along the wall.
        if (this.plan[sc.id] && dist < -4 && main.gap[sc.side > 0 ? 1 : 0][k.trk.idx] !== sc.id + 1) {
          this.plan[sc.id] = false;
          continue;
        }
        // Commit early and keep aiming into the branch until we are on it.
        if (this.plan[sc.id] && dist < look + 45 && dist > -45) {
          approach = dist < look + 15;
          sc.frame(clamp(look - dist + 10, 8, sc.length), this.fr);
          lane = 0;
          if (this.boostAt === sc.id && dist < 10 && k.item && k.rolling <= 0) {
            c.item = true;
            this.itemDelay = 0.6;
            this.boostAt = -1;
          }
          break;
        }
      }
    }
    tx = this.fr.x + this.fr.rx * lane;
    tz = this.fr.z + this.fr.rz * lane;
    const desired = Math.atan2(tx - k.pos.x, tz - k.pos.z);
    const diff = wrapAngle(desired - k.yaw);
    c.steer = clamp(-diff * 2.8, -1, 1);
    c.throttle = 1;
    c.brake = false;
    if (Math.abs(diff) > 1.3 && spd > 12 && !this.pilot) c.brake = true;
    // Cutting into a branch on the inside of a bend: scrub speed to make the turn.
    if (approach && spd > 16 && Math.abs(diff) > 0.3) {
      c.throttle = 0.2;
      if (Math.abs(diff) > 0.45) c.brake = true;
    }

    if (spd < 2 && this.race.raceTime > 4 && !this.pilot) {
      this.stuck = (this.stuck || 0) + dt;
      if (this.stuck > 1.2) { c.brake = true; c.steer = -c.steer; }
      if (this.stuck > 2.2) this.stuck = 0;
    } else this.stuck = 0;

    if (this.pilot) {
      c.drift = false;
      c.item = false;
      return;
    }

    // Drifting through long corners
    this.driftCool -= dt;
    const path = k.path;
    path.frame(k.trk.s + 10 + spd * 0.5, this.fr2);
    const curvAhead = path.curvWide[this.fr2.i];
    const curvNow = path.curvWide[k.trk.idx ?? 0];
    // On snow, ice and oil: lift off before corners instead of sliding wide.
    const slick = (k.grip / 9) * path.gripMul * (k.patch ? k.patch.grip : 1);
    if (slick < 0.85) {
      const bend = Math.max(Math.abs(curvAhead), Math.abs(curvNow));
      const safe = k.baseTop * (0.66 + 0.34 * slick) * (bend > 0.02 ? 0.88 : 1);
      if (bend > 0.012 && spd > safe) c.throttle = spd > safe * 1.15 ? 0.2 : 0.6;
    }
    if (!k.drifting && !c.drift && this.driftCool <= 0 && spd > 19 && Math.abs(curvAhead) > 0.014 && Math.random() < this.diff.drift * this.skill * (slick < 0.7 ? 0.35 : 1)) {
      c.drift = true;
      this.driftT = 0;
    }
    if (c.drift) {
      this.driftT += dt;
      const turnDir = -Math.sign(curvNow || curvAhead);
      const wrongWay = k.drifting && k.driftDir !== turnDir && Math.abs(curvNow) > 0.006;
      const straight = Math.abs(curvNow) < 0.006 && Math.abs(curvAhead) < 0.009;
      const maxed = k.driftLevel >= (this.diff.drift > 0.9 ? 3 : 2) && Math.abs(curvAhead) < 0.012;
      // The hop takes a moment: only call it a failed drift once it had time to start.
      const failed = this.driftT > 0.35 && !k.drifting && k.grounded && (!k.driftPending || this.driftT > 1.2);
      if (wrongWay || straight || maxed || failed || Math.abs(diff) > 0.9) {
        c.drift = false;
        this.driftCool = 0.6 + Math.random() * 1.2;
      } else if (k.driftPending && k.grounded) {
        c.steer = turnDir * Math.max(0.5, Math.abs(c.steer));
      }
    }

    // Items
    this.itemDelay -= dt;
    if (c.item && this.itemDelay > 0.5) return;
    c.item = false;
    if (k.item && k.rolling <= 0 && this.itemDelay <= 0) {
      if (Math.random() < this.diff.items * 0.5 + 0.5 && this._shouldUse(k.item)) {
        c.item = true;
        c.aim = this._aim(k.item);
        this.itemDelay = 0.4 + Math.random() * 1.5 / this.diff.items;
      }
    }
  }

  // Throw backwards at someone close behind when nobody is in range ahead.
  _aim(item) {
    if (!AIM_DEFAULT[item]) return 0;
    const k = this.k;
    const ks = this.race.karts;
    const ahead = ks.some((o) => o !== k && o.total - k.total > 3 && o.total - k.total < 40);
    const behind = ks.some((o) => o !== k && k.total - o.total > 2 && k.total - o.total < 18);
    if (item === 'honey' || item === 'oil') return ahead && !behind && Math.random() < 0.4 ? 1 : -1;
    return !ahead && behind && this.diff.items > 0.5 ? -1 : 1;
  }

  _shouldUse(item) {
    const k = this.k;
    const race = this.race;
    const smart = this.diff.items;
    const behindClose = () => race.karts.some((o) => o !== k && k.total - o.total > 2 && k.total - o.total < 16);
    const incoming = () => race.items.projectiles.some((p) => p.owner !== k && (p.pos.x - k.pos.x) ** 2 + (p.pos.z - k.pos.z) ** 2 < 400);
    switch (item) {
      case 'oil': {
        const behind = race.karts.some((o) => o !== k && k.total - o.total > 3 && k.total - o.total < 22);
        return behind || Math.random() < 0.01;
      }
      case 'bomb':
      case 'firework': {
        const ahead = race.karts.some((o) => o !== k && o.total - k.total > 4 && o.total - k.total < 32 && Math.abs(o.trk.d - k.trk.d) < 5);
        return ahead || (smart > 0.5 && behindClose()) || Math.random() < 0.006;
      }
      case 'horn': {
        const crowd = race.karts.some((o) => o !== k && (o.pos.x - k.pos.x) ** 2 + (o.pos.z - k.pos.z) ** 2 < 70);
        return crowd || incoming() || Math.random() < 0.004;
      }
      case 'twister':
        return k.place > 1 || Math.random() < 0.01;
      case 'ghost':
        return incoming() || Math.random() < 0.012;
      case 'chili':
        if (this.boostAt >= 0) return false;
        return Math.abs(k.path.curvWide[k.trk.idx ?? 0]) < 0.015 || Math.random() < 0.02;
      case 'honey': {
        const behind = race.karts.some((o) => o !== k && k.total - o.total > 3 && k.total - o.total < 20);
        return behind || Math.random() < 0.01;
      }
      case 'ball':
      case 'boomerang': {
        const ahead = race.karts.some((o) => o !== k && o.total - k.total > 4 && o.total - k.total < 40 && Math.abs(o.trk.d - k.trk.d) < 3 && o.path === k.path);
        return ahead || (smart > 0.5 && behindClose()) || Math.random() < 0.006 * (2 - smart);
      }
      case 'rocket':
      case 'warp':
        return k.path === race.track && Math.abs(k.trk.d) < 5;
      case 'bee':
      case 'storm':
        return k.place > 1 || Math.random() < 0.01;
      default:
        return true;
    }
  }
}
