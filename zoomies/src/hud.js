import { ITEMS, ITEM_ICONS, AIM_DEFAULT } from './items.js';
import { fmtTime, ordinal } from './util.js';
import { hudGoal } from './career.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(app) {
    this.app = app;
    this.el = $('hud');
    this.itemSlot = $('hud-item');
    this.itemIcon = $('hud-item-icon');
    this.itemCount = $('hud-item-count');
    this.btnItem = $('btn-item');
    this.btnItemIc = $('btn-item-ic');
    this.gems = $('hud-gems').querySelector('b');
    this.lap = $('hud-lap');
    this.timeEl = $('hud-time');
    this.pos = $('hud-pos');
    this.map = $('hud-map');
    this.mapCtx = this.map.getContext('2d');
    this.center = $('hud-center');
    this.bannerEl = $('hud-banner');
    this.trackName = $('hud-trackname');
    this.toastEl = $('hud-toast');
    this.hintEl = $('hud-hint');
    this.wrong = $('hud-wrong');
    this.speed = $('speedlines');
    this.flash = $('flash');
    this.fpsEl = $('fps');
    this.goalEl = $('hud-goal');
    this.cache = {};
    this.mapFrame = 0;
    this.rollTimer = 0;
  }

  show(on) {
    this.el.hidden = !on;
  }

  reset(race) {
    this.cache = {};
    this.center.className = '';
    this.bannerEl.className = '';
    this.bannerEl.textContent = '';
    this.toastEl.className = '';
    this.hintEl.className = '';
    this.wrong.hidden = true;
    this.speed.classList.remove('on');
    this.flash.style.opacity = 0;
    this._buildMap(race);
    this.goalEl.hidden = !race.careerEv || race.careerEv.type === 'cup';
    const tt = race.mode === 'tt';
    this.pos.style.visibility = tt ? 'hidden' : 'visible';
    $('hud-gems').style.visibility = tt ? 'hidden' : 'visible';
    this.showTrackName(race);
    if (race.mode !== 'demo') {
      this.hint(this.app.settings.steering === 'tilt' && this.app.input.tilt.listening
        ? 'Tilt to steer. Hold DRIFT after the 2 for a rocket start!'
        : 'Drag on the left to steer. Hold DRIFT after the 2 for a rocket start!', 5.5);
    }
  }

  showTrackName(race) {
    if (!race) {
      this.trackName.hidden = true;
      return;
    }
    const ev = race.careerEv;
    const cls = ev ? ev.title : race.mode === 'tt' ? 'Time Trial' : `${race.speedClass.name} class`;
    const extra = this.app.gp ? ` · Race ${this.app.gp.index + 1} of ${this.app.gp.tracks.length}` : '';
    this.trackName.innerHTML = `<small>${cls}${extra}</small>${race.trackDef.name}${race.track.reverse ? ' ⟲' : ''}`;
    this.trackName.hidden = false;
  }

  _buildMap(race) {
    const tr = race.track;
    const W = this.map.width, H = this.map.height;
    const b = tr.bounds;
    const pad = 16;
    const sx = (W - pad * 2) / (b.maxX - b.minX), sz = (H - pad * 2) / (b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (H - (b.maxZ - b.minZ) * s) / 2;
    // Screen x = -worldX so the map matches the driver's left/right when heading "up".
    this.mapT = (x, z) => [W - (ox + (x - b.minX) * s), H - (oz + (z - b.minZ) * s)];
    const bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    const c = bg.getContext('2d');
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const path = () => {
      c.beginPath();
      for (let i = 0; i <= tr.N; i += 2) {
        const k = i % tr.N;
        const [x, y] = this.mapT(tr.px[k], tr.pz[k]);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
    };
    path();
    c.strokeStyle = 'rgba(29,21,55,0.85)';
    c.lineWidth = 16;
    c.stroke();
    path();
    c.strokeStyle = '#fff7e8';
    c.lineWidth = 8;
    c.stroke();
    const [sx0, sy0] = this.mapT(tr.px[0], tr.pz[0]);
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.arc(sx0, sy0, 5, 0, Math.PI * 2);
    c.fill();
    this.mapBg = bg;
  }

  _drawMap(race) {
    const c = this.mapCtx;
    c.clearRect(0, 0, this.map.width, this.map.height);
    c.drawImage(this.mapBg, 0, 0);
    const order = race.order || race.karts;
    for (let i = order.length - 1; i >= 0; i--) {
      const k = order[i];
      if (k.isPlayer) continue;
      const [x, y] = this.mapT(k.pos.x, k.pos.z);
      c.fillStyle = k.ch.color;
      c.strokeStyle = '#1d1537';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 7, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    const p = race.player;
    if (p) {
      const [x, y] = this.mapT(p.pos.x, p.pos.z);
      c.fillStyle = '#ffd23f';
      c.strokeStyle = '#1d1537';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(x, y, 10, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  _set(key, val, fn) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    fn(val);
  }

  update(race, dt) {
    const p = race.player;
    if (!p) return;
    const laps = race.laps;
    const lap = Math.max(1, Math.min(laps, p.laps + 1));
    this._set('lap', lap, (v) => { this.lap.innerHTML = `LAP <b>${v}</b>/${laps}`; });
    this._set('pos', p.place, (v) => {
      this.pos.innerHTML = `${v}<sup>${ordinal(v)}</sup>`;
      this.pos.className = (v === 1 ? 'p1' : v === 2 ? 'p2' : v === 3 ? 'p3' : 'pn') + ' bump';
    });
    this._set('gems', p.gems, (v) => { this.gems.textContent = v; });
    if (race.careerEv) this._set('goal', hudGoal(race.careerEv, race), (v) => { this.goalEl.textContent = v; });
    const t = race.state === 'finished' ? p.finishTime : race.raceTime;
    this._set('time', Math.floor(t * 20), () => { this.timeEl.textContent = fmtTime(t); });

    // Item slot
    if (p.rolling > 0) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) {
        this.rollTimer = 0.07;
        const ic = ITEM_ICONS[Math.floor(Math.random() * ITEM_ICONS.length)];
        this.itemIcon.textContent = ic;
        this.btnItemIc.textContent = ic;
      }
      this._set('slot', 'rolling', () => {
        this.itemSlot.className = 'item-slot rolling';
        this.itemCount.hidden = true;
      });
    } else {
      const key = p.item ? `${p.item}:${p.itemCount}` : '';
      this._set('slot', key, () => {
        const ic = p.item ? ITEMS[p.item].icon : '';
        this.itemIcon.textContent = ic;
        this.btnItemIc.textContent = ic;
        this.itemSlot.className = p.item ? 'item-slot pop' : 'item-slot';
        this.btnItem.classList.toggle('has', !!p.item);
        this.btnItem.classList.toggle('aim', !!AIM_DEFAULT[p.item]);
        this.itemCount.hidden = !(p.itemCount > 1);
        this.itemCount.textContent = `×${p.itemCount}`;
      });
    }

    this._set('boost', p.boostTime > 0 || p.starTime > 0, (v) => this.speed.classList.toggle('on', v));
    this._set('wrong', p.wrongWay > 1.2 && race.state === 'race', (v) => { this.wrong.hidden = !v; });
    this._set('flash', Math.round(race.flash * 20), (v) => { this.flash.style.opacity = (v / 20) * 0.85; });

    this.mapFrame++;
    if (this.mapFrame % 2 === 0) this._drawMap(race);

    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.remove('show');
    }
  }

  countdown(n) {
    const el = this.center;
    el.textContent = n;
    el.className = '';
    void el.offsetWidth;
    el.className = n === 'GO!' ? 'show go' : 'show';
    if (n === 'GO!') this.hint('', 0);
  }

  banner(text, cls = '') {
    const el = this.bannerEl;
    el.innerHTML = text;
    el.className = '';
    void el.offsetWidth;
    el.className = `show ${cls}`;
  }

  finish(place) {
    const el = this.bannerEl;
    el.innerHTML = place ? `FINISH!<small>${place}${ordinal(place)} place</small>` : 'FINISH!';
    el.className = '';
    void el.offsetWidth;
    el.className = 'stay finish';
    this.speed.classList.remove('on');
  }

  toast(text) {
    const el = this.toastEl;
    el.textContent = text;
    el.className = '';
    void el.offsetWidth;
    el.className = 'show';
  }

  hint(text, secs) {
    if (!text) {
      this.hintEl.classList.remove('show');
      this.hintT = 0;
      return;
    }
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintT = secs;
  }

  fps(v) {
    this.fpsEl.textContent = v;
  }
}
