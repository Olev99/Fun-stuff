import { ITEMS, ITEM_ICONS, AIM_DEFAULT } from './items.js';
import { fmtTime, ordinal } from './util.js';
import { hudGoal } from './career.js';
import { isDesktop } from './platform.js';

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
    this.styleEl = $('hud-style');
    this.rearEl = $('hud-rear');
    // Hold the minimap to look behind you.
    const look = (on) => (e) => { e.preventDefault(); this.app.input.lookBack = on; };
    this.map.addEventListener('pointerdown', look(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.map.addEventListener(ev, look(false));
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
    this.goalEl.hidden = !(race.careerEv && race.careerEv.type !== 'cup') && !race.dailyEv;
    this.styleEl.innerHTML = '';
    this.app.input.lookBack = false;
    const sp = document.getElementById('hud-split');
    if (sp) sp.className = '';
    const tt = race.mode === 'tt';
    this.pos.style.visibility = tt ? 'hidden' : 'visible';
    $('hud-gems').style.visibility = tt || race.battle ? 'hidden' : 'visible';
    this.lap.classList.toggle('balloons', !!race.battle);
    this.timeEl.classList.remove('low');
    this.showTrackName(race);
    if (race.battle) this.hint('Pop everyone else\'s balloons! Ram a rival with a 🌶️ Chili Boost to steal one.', 6);
    else if (race.mode !== 'demo') this.hint(this.controlsHint(), 5.5);
    if (race.ghost) this.hint(`👻 Race your ghost: best ${fmtTime(race.ghost.g.time)}`, 5);
  }

  // The podium banner. top: up to 3 result rows, or null to hide it.
  podium(top, me = null) {
    const el = $('podium-ui');
    if (!top) { el.hidden = true; return; }
    const name = (r) => (r.isPlayer ? 'You' : r.nick || r.ch.name);
    const medals = ['🥇', '🥈', '🥉'];
    $('pod-title').textContent = top[0].isPlayer ? '🏆 You win!' : `🏆 ${name(top[0])} wins!`;
    $('pod-names').innerHTML = top.map((r, i) => `<span class="${r.isPlayer ? 'me' : ''}">${medals[i]} ${name(r).replace(/[<>&]/g, '')}</span>`).join('');
    $('pod-me').textContent = me && me.place > 3 ? `You finished ${me.place}${ordinal(me.place).toLowerCase()}` : '';
    el.hidden = false;
  }

  // How to drive, for whatever you're driving with.
  controlsHint() {
    const inp = this.app.input;
    if (inp.wheel && inp.wheel.live) return 'Tilt your phone to steer. Hold DRIFT after the 2 for a rocket start!';
    if (isDesktop) {
      if (inp.padActive) return 'Stick steers · R drift · L item · B brake. Hold R after the 2 for a rocket start!';
      return '← → steer · SPACE drift · E item · ↓ brake. Hold SPACE after the 2 for a rocket start!';
    }
    return this.app.settings.steering === 'tilt' && inp.tilt.listening
      ? 'Tilt to steer. Hold DRIFT after the 2 for a rocket start!'
      : 'Drag on the left to steer. Hold DRIFT after the 2 for a rocket start!';
  }

  showTrackName(race) {
    if (!race) {
      this.trackName.hidden = true;
      return;
    }
    const ev = race.careerEv;
    const dv = race.dailyEv;
    const cls = dv ? `Daily challenge · ${dv.mod.icon} ${dv.mod.name}` : ev ? ev.title : race.mode === 'tt' ? 'Time Trial' : race.battle ? '🎈 Balloon Battle' : `${race.speedClass.name} class`;
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
    // Shortcuts the player has found before, as dotted side paths.
    const found = ((this.app.records.found || {})[race.trackDef.id]) || [];
    const scs = race.mode === 'demo' ? [] : tr.shortcuts.filter((sc) => found.includes(sc.name));
    for (const sc of scs) {
      c.beginPath();
      for (let i = 0; i < sc.count; i += 2) {
        const [x, y] = this.mapT(sc.px[i], sc.pz[i]);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.strokeStyle = 'rgba(29,21,55,0.85)';
      c.lineWidth = 10;
      c.setLineDash([]);
      c.stroke();
      c.strokeStyle = '#19e3b1';
      c.lineWidth = 4;
      c.setLineDash([6, 5]);
      c.stroke();
      c.setLineDash([]);
    }
    // Arenas are drawn as the whole floor of the bowl.
    const arenaW = tr.def.arena ? tr.hw[0] * 2 * s : 0;
    path();
    c.strokeStyle = 'rgba(29,21,55,0.85)';
    c.lineWidth = arenaW ? arenaW + 8 : 16;
    c.stroke();
    path();
    c.strokeStyle = arenaW ? 'rgba(255,247,232,0.75)' : '#fff7e8';
    c.lineWidth = arenaW || 8;
    c.stroke();
    // Rivers in blue, sky lanes as dashed sky-blue.
    for (const [kind, col, dash] of [[1, '#3fb8f0', []], [2, '#8fd0ff', [7, 5]]]) {
      for (const [a, b] of tr.runs((i) => tr.zoneT[i] === kind)) {
        c.beginPath();
        for (let r = a; r <= b; r++) {
          const k = tr.I(r);
          const [x, y] = this.mapT(tr.px[k], tr.pz[k]);
          if (r === a) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.strokeStyle = col;
        c.lineWidth = 8;
        c.setLineDash(dash);
        c.stroke();
        c.setLineDash([]);
      }
    }
    if (!tr.def.arena) {
      const [sx0, sy0] = this.mapT(tr.px[0], tr.pz[0]);
      c.fillStyle = '#ffd23f';
      c.beginPath();
      c.arc(sx0, sy0, 5, 0, Math.PI * 2);
      c.fill();
    }
    this.mapBg = bg;
  }

  refreshMap(race) {
    this._buildMap(race);
  }

  _drawMap(race) {
    const c = this.mapCtx;
    c.clearRect(0, 0, this.map.width, this.map.height);
    c.drawImage(this.mapBg, 0, 0);
    const order = race.order || race.karts;
    for (let i = order.length - 1; i >= 0; i--) {
      const k = order[i];
      if (k.isPlayer || k.out) continue;
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
    const legs = race.track.legs;
    if (race.battle) {
      // Balloons left instead of laps, and the battle clock counting down.
      this._set('lap', `b${p.out ? -1 : p.balloons}`, () => {
        this.lap.innerHTML = p.out ? 'OUT' : '<i>🎈</i>'.repeat(p.balloons);
      });
      const tl = Math.ceil(race.battle.timeLeft);
      this._set('time', `b${tl}`, () => {
        this.timeEl.textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
        this.timeEl.classList.toggle('low', tl <= 30);
      });
    } else if (legs.length && laps === 1) {
      // One-lap adventures count legs instead of laps.
      const leg = Math.min(legs.length, (p.leg || 0) + 1);
      this._set('lap', `g${leg}`, () => { this.lap.innerHTML = `LEG <b>${leg}</b>/${legs.length}`; });
    } else {
      const lap = Math.max(1, Math.min(laps, p.laps + 1));
      this._set('lap', lap, (v) => { this.lap.innerHTML = `LAP <b>${v}</b>/${laps}`; });
    }
    this._set('pos', p.place, (v) => {
      this.pos.innerHTML = `${v}<sup>${ordinal(v)}</sup>`;
      this.pos.className = (v === 1 ? 'p1' : v === 2 ? 'p2' : v === 3 ? 'p3' : 'pn') + ' bump';
    });
    this._set('gems', p.gems, (v) => { this.gems.textContent = v; });
    if (race.careerEv) this._set('goal', hudGoal(race.careerEv, race), (v) => { this.goalEl.textContent = v; });
    else if (race.dailyEv) {
      const d = race.dailyEv;
      const txt = (d.goal === 1 ? 'Goal: win' : 'Goal: top 3') + (d.gems ? ` · 💎 ${p.gemsGot || 0}/${d.gems}` : '');
      this._set('goal', txt, (v) => { this.goalEl.textContent = v; });
    }
    if (!race.battle) {
      const t = race.state === 'finished' ? p.finishTime : race.raceTime;
      this._set('time', Math.floor(t * 20), () => { this.timeEl.textContent = fmtTime(t); });
    }

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
        const tb = this._tb || (this._tb = document.getElementById('btn-throwback'));
        if (tb) tb.classList.toggle('show', !!AIM_DEFAULT[p.item]);
        this.itemCount.hidden = !(p.itemCount > 1);
        this.itemCount.textContent = `×${p.itemCount}`;
      });
    }

    this._set('boost', p.boostTime > 0 || p.starTime > 0, (v) => this.speed.classList.toggle('on', v));
    this._set('draft', (p.draftT || 0) > 0.3 && p.boostTime <= 0, (v) => this.speed.classList.toggle('draft', v));
    this._set('rear', !!race.lookBack, (v) => { this.rearEl.hidden = !v; });
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

  // Skill popups ("BLAZE BOOST +12") stacking on the left.
  style(label, pts, cls) {
    const el = document.createElement('div');
    el.className = `sp ${cls}`;
    el.innerHTML = `${label}<b>+${pts}</b>`;
    this.styleEl.appendChild(el);
    while (this.styleEl.children.length > 3) this.styleEl.firstChild.remove();
    el.addEventListener('animationend', () => el.remove());
  }

  // Time trial split against the ghost: green when ahead, red when behind.
  split(d) {
    const el = this.splitEl || (this.splitEl = document.getElementById('hud-split'));
    el.textContent = `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
    el.className = '';
    void el.offsetWidth;
    el.className = `show ${d <= 0 ? 'ahead' : 'behind'}`;
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
