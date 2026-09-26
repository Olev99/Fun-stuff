import { clamp, wrapAngle } from './util.js';

// Computer driver: follows the racing line with its own lane preference,
// drifts through long corners, dodges hazards and uses items sensibly.
export class AIDriver {
  constructor(kart, race, skill = 1) {
    this.k = kart;
    this.race = race;
    this.skill = skill;
    this.lane = (Math.random() - 0.5) * 5;
    this.phase = Math.random() * 100;
    this.fr = {};
    this.fr2 = {};
    this.itemDelay = 1 + Math.random() * 3;
    this.driftCool = Math.random() * 2;
    this.dodge = 0;
    this.releaseAt = 0;
  }

  update(dt, time) {
    const k = this.k;
    const tr = k.track;
    const c = k.ctl;
    const spd = Math.max(0, k.fwdSpeed);
    const look = 7 + spd * 0.42;
    tr.frame(k.trk.s + look, this.fr);
    const i = this.fr.i;
    const lim = tr.halfRoad - 1.4;

    // Hazard avoidance
    let avoid = 0;
    if (this.skill > 0.85 || Math.random() < 0.5) {
      for (const h of this.race.items.hazards) {
        let ds = h.s - k.trk.s;
        if (ds < -tr.length / 2) ds += tr.length;
        if (ds > 0 && ds < 26 && Math.abs(h.d - (k.trk.d)) < 3) {
          avoid = h.d > k.trk.d ? -4 : 4;
        }
      }
    }
    this.dodge += (avoid - this.dodge) * Math.min(1, dt * 3);

    const wobble = Math.sin(time * 0.35 + this.phase) * 1.8;
    const lane = clamp(tr.racingLine[i] * this.skill + this.lane + wobble + this.dodge, -lim, lim);
    const tx = this.fr.x + this.fr.rx * lane;
    const tz = this.fr.z + this.fr.rz * lane;
    const desired = Math.atan2(tx - k.pos.x, tz - k.pos.z);
    const diff = wrapAngle(desired - k.yaw);
    c.steer = clamp(-diff * 2.8, -1, 1);
    c.throttle = 1;
    c.brake = false;
    if (Math.abs(diff) > 1.3 && spd > 12) c.brake = true;

    // Stuck recovery: reverse briefly if not moving.
    if (spd < 2 && this.race.raceTime > 4) {
      this.stuck = (this.stuck || 0) + dt;
      if (this.stuck > 1.2) { c.brake = true; c.steer = -c.steer; }
      if (this.stuck > 2.2) this.stuck = 0;
    } else this.stuck = 0;

    // Drifting through long corners
    this.driftCool -= dt;
    tr.frame(k.trk.s + 10 + spd * 0.5, this.fr2);
    const curvAhead = tr.curvWide[this.fr2.i];
    const curvNow = tr.curvWide[k.trk.idx ?? i];
    if (!k.drifting && !c.drift && this.driftCool <= 0 && spd > 19 && Math.abs(curvAhead) > 0.021 && Math.random() < 0.6 * this.skill) {
      c.drift = true;
      this.releaseAt = 0;
    }
    if (c.drift) {
      const turnDir = -Math.sign(curvNow || curvAhead);
      // Hold while the corner continues and the drift goes the right way.
      const wrongWay = k.drifting && k.driftDir !== turnDir && Math.abs(curvNow) > 0.01;
      const straight = Math.abs(curvNow) < 0.009 && Math.abs(curvAhead) < 0.012;
      const maxed = k.driftLevel >= (this.skill > 0.95 ? 3 : 2) && Math.abs(curvAhead) < 0.018;
      const failed = !k.drifting && k.grounded && !k.driftPending;
      if (wrongWay || straight || maxed || failed || Math.abs(diff) > 0.9) {
        c.drift = false;
        this.driftCool = 0.6 + Math.random() * 1.2;
      } else if (k.driftPending && k.grounded) {
        c.steer = turnDir * Math.max(0.5, Math.abs(c.steer));
      }
    }

    // Items
    this.itemDelay -= dt;
    c.item = false;
    if (k.item && k.rolling <= 0 && this.itemDelay <= 0) {
      if (this._shouldUse(k.item)) {
        c.item = true;
        this.itemDelay = 0.4 + Math.random() * 1.5;
      }
    }
  }

  _shouldUse(item) {
    const k = this.k;
    const race = this.race;
    switch (item) {
      case 'chili':
        return Math.abs(k.track.curvWide[k.trk.idx ?? 0]) < 0.015 || Math.random() < 0.02;
      case 'honey': {
        const behind = race.karts.some((o) => o !== k && k.total - o.total > 3 && k.total - o.total < 20);
        return behind || Math.random() < 0.01;
      }
      case 'ball': {
        const ahead = race.karts.some((o) => o !== k && o.total - k.total > 4 && o.total - k.total < 40 && Math.abs(o.trk.d - k.trk.d) < 3);
        return ahead || Math.random() < 0.006;
      }
      case 'bee':
      case 'storm':
        return k.place > 1 || Math.random() < 0.01;
      default:
        return true;
    }
  }
}
