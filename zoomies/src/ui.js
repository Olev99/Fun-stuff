import { CHARACTERS, charById } from './characters.js';
import { TRACKS, CUPS, trackById } from './tracks.js';
import { Track } from './track.js';
import { THEMES } from './world.js';
import { fmtTime, ordinal } from './util.js';
import { saveSettings } from './settings.js';

const $ = (id) => document.getElementById(id);
const STAT_NAMES = [['speed', 'Speed'], ['accel', 'Accel'], ['handling', 'Handling'], ['weight', 'Weight']];

export class UI {
  constructor(app) {
    this.app = app;
    this.current = null;
    this.returnTo = null;
    this.mode = 'gp';
    this.trackCache = new Map();
    document.querySelectorAll('.screen').forEach((sc) => {
      sc.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]');
        if (b) this._go(sc.id.replace('scr-', ''), b.dataset.go);
      });
    });
    $('btn-pause').addEventListener('click', () => this.app.pause());
    this._bindSettings();
    this._bindTrackOptions();
    const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    $('install-tip').hidden = !(ios && !standalone);
  }

  show(name) {
    document.querySelectorAll('.screen').forEach((sc) => { sc.hidden = sc.id !== `scr-${name}`; });
    this.current = name;
  }

  hideAll() {
    this.show('__none__');
  }

  _go(screen, action) {
    const app = this.app;
    const snd = action === 'back' || action === 'close' || action === 'quit' ? 'uiBack' : 'ui';
    app.firstGesture(action);
    app.audio.play(snd);
    switch (screen) {
      case 'title':
        if (action === 'settings' || action === 'help') this.overlay(action, 'title');
        else { this.mode = action; this.charSelect(); }
        break;
      case 'char':
        if (action === 'back') app.toTitle();
        else this.trackSelect();
        break;
      case 'track':
        if (action === 'back') this.charSelect();
        else app.startFromMenu(this.mode);
        break;
      case 'settings':
      case 'help':
        this.closeOverlay();
        break;
      case 'pause':
        if (action === 'resume') app.resume();
        else if (action === 'restart') app.restart();
        else if (action === 'settings') this.overlay('settings', 'pause');
        else if (action === 'quit') app.toTitle();
        break;
      case 'results':
        app.onResultsAction(action);
        break;
    }
  }

  overlay(name, from) {
    this.returnTo = from;
    if (name === 'settings') this._syncSettings();
    this.show(name);
  }

  closeOverlay() {
    const to = this.returnTo || 'title';
    this.returnTo = null;
    this.show(to);
  }

  // ---------------- Title ----------------
  title() {
    this.show('title');
  }

  // ---------------- Characters ----------------
  charSelect() {
    const app = this.app;
    $('char-mode').textContent = { gp: 'Grand Prix', quick: 'Quick Race', tt: 'Time Trial' }[this.mode];
    const grid = $('char-grid');
    if (!grid.children.length) {
      for (const ch of CHARACTERS) {
        const b = document.createElement('button');
        b.className = 'card';
        b.dataset.id = ch.id;
        b.style.background = ch.color;
        b.setAttribute('aria-label', `${ch.name} the ${ch.species}`);
        b.innerHTML = `<img alt="" src="${app.portraits[ch.id] || ''}"><span class="nm">${ch.name}</span>`;
        b.addEventListener('click', () => {
          app.firstGesture('char');
          app.audio.play('select');
          this.pickChar(ch.id);
        });
        grid.appendChild(b);
      }
    }
    app.showShowroom();
    this.pickChar(app.settings.char);
    this.show('char');
  }

  pickChar(id) {
    const ch = charById(id);
    this.app.settings.char = ch.id;
    saveSettings(this.app.settings);
    document.querySelectorAll('#char-grid .card').forEach((c) => c.classList.toggle('sel', c.dataset.id === ch.id));
    $('ci-name').textContent = ch.name;
    $('ci-species').textContent = ch.species;
    $('ci-tag').textContent = ch.tagline;
    $('ci-stats').innerHTML = STAT_NAMES.map(([k, n]) =>
      `<span>${n}</span><div class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= ch.stats[k] ? 'on' : ''}"></i>`).join('')}</div>`).join('');
    if (this.app.showroom) this.app.showroom.setChar(ch);
  }

  // ---------------- Tracks ----------------
  _bindTrackOptions() {
    $('class-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cls]');
      if (!b) return;
      this.app.audio.play('select');
      this.app.settings.speedClass = b.dataset.cls;
      saveSettings(this.app.settings);
      this._syncClass();
    });
    $('reverse').addEventListener('change', (e) => {
      this.app.settings.reverse = e.target.checked;
      saveSettings(this.app.settings);
      this._renderTrackCards();
      this.app.previewTrack(this.app.settings.track, this.app.settings.reverse);
    });
  }

  _syncClass() {
    document.querySelectorAll('#class-seg [data-cls]').forEach((b) => {
      const on = b.dataset.cls === this.app.settings.speedClass;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  _track(def, rev) {
    const key = def.id + (rev ? '-r' : '');
    if (!this.trackCache.has(key)) this.trackCache.set(key, new Track(def, rev));
    return this.trackCache.get(key);
  }

  _thumb(canvas, defs, rev) {
    const W = (canvas.width = 240), H = (canvas.height = 180);
    const c = canvas.getContext('2d');
    const th = THEMES[defs[0].theme];
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(1, th.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const cells = defs.length === 1 ? [[0, 0, W, H]] : [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
    defs.forEach((def, n) => {
      const [x0, y0, cw, chh] = cells[n];
      if (defs.length > 1) {
        const t2 = THEMES[def.theme];
        c.fillStyle = t2.sky[0];
        c.globalAlpha = 0.6;
        c.fillRect(x0 + 2, y0 + 2, cw - 4, chh - 4);
        c.globalAlpha = 1;
      }
      const tr = this._track(def, rev);
      const b = tr.bounds;
      const pad = defs.length === 1 ? 20 : 12;
      const s = Math.min((cw - pad * 2) / (b.maxX - b.minX), (chh - pad * 2) / (b.maxZ - b.minZ));
      const ox = x0 + (cw - (b.maxX - b.minX) * s) / 2, oy = y0 + (chh - (b.maxZ - b.minZ) * s) / 2;
      const T = (x, z) => [x0 + cw - (ox - x0 + (x - b.minX) * s), y0 + chh - (oy - y0 + (z - b.minZ) * s)];
      const path = () => {
        c.beginPath();
        for (let i = 0; i <= tr.N; i += 3) {
          const k = i % tr.N;
          const [x, y] = T(tr.px[k], tr.pz[k]);
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.closePath();
      };
      c.lineJoin = 'round';
      path(); c.strokeStyle = '#1d1537'; c.lineWidth = defs.length === 1 ? 14 : 8; c.stroke();
      path(); c.strokeStyle = '#fff7e8'; c.lineWidth = defs.length === 1 ? 7 : 4; c.stroke();
      const [sx, sy] = T(tr.px[0], tr.pz[0]);
      c.fillStyle = '#ffd23f';
      c.beginPath(); c.arc(sx, sy, defs.length === 1 ? 6 : 4, 0, Math.PI * 2); c.fill();
      // direction arrow
      const k2 = Math.floor(tr.N * 0.03);
      const [ax, ay] = T(tr.px[k2], tr.pz[k2]);
      c.strokeStyle = '#ff6b35'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ax, ay); c.stroke();
    });
  }

  trackSelect() {
    const gp = this.mode === 'gp';
    $('track-title').textContent = gp ? 'Pick a cup' : 'Pick a track';
    $('reverse-wrap').hidden = gp;
    $('class-seg').hidden = this.mode === 'tt';
    $('reverse').checked = !!this.app.settings.reverse;
    this._syncClass();
    this._renderTrackCards();
    this.show('track');
    if (gp) {
      const cup = CUPS.find((c) => c.id === this.app.settings.cup) || CUPS[0];
      this.app.previewTrack(cup.tracks[0], cup.reverse);
    } else {
      this.app.previewTrack(this.app.settings.track, this.app.settings.reverse);
    }
  }

  _renderTrackCards() {
    const row = $('track-row');
    row.innerHTML = '';
    const app = this.app;
    if (this.mode === 'gp') {
      if (!app.settings.cup) app.settings.cup = CUPS[0].id;
      for (const cup of CUPS) {
        const b = document.createElement('button');
        b.className = 'tcard' + (app.settings.cup === cup.id ? ' sel' : '');
        const cv = document.createElement('canvas');
        this._thumb(cv, cup.tracks.map(trackById), cup.reverse);
        const best = app.records[`cup:${cup.id}`];
        b.appendChild(cv);
        const tx = document.createElement('div');
        tx.className = 'tx';
        tx.innerHTML = `<span class="tn">${cup.name}</span><span class="tb">${cup.reverse ? 'All 4 tracks, reversed' : 'All 4 tracks'}${best ? ` · Best: ${best}` : ''}</span>`;
        b.appendChild(tx);
        b.addEventListener('click', () => {
          app.audio.play('select');
          app.settings.cup = cup.id;
          saveSettings(app.settings);
          row.querySelectorAll('.tcard').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          app.previewTrack(cup.tracks[0], cup.reverse);
        });
        row.appendChild(b);
      }
      return;
    }
    const rev = !!app.settings.reverse;
    for (const def of TRACKS) {
      const b = document.createElement('button');
      b.className = 'tcard' + (app.settings.track === def.id ? ' sel' : '');
      const cv = document.createElement('canvas');
      this._thumb(cv, [def], rev);
      b.appendChild(cv);
      const rec = app.records[def.id + (rev ? '-r' : '')];
      const tx = document.createElement('div');
      tx.className = 'tx';
      tx.innerHTML = `<span class="tn">${def.name}</span><span class="tb">${rec && rec.tt ? `Best: ${fmtTime(rec.tt)}` : def.blurb}</span>`;
      b.appendChild(tx);
      b.addEventListener('click', () => {
        app.audio.play('select');
        app.settings.track = def.id;
        saveSettings(app.settings);
        row.querySelectorAll('.tcard').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        app.previewTrack(def.id, rev);
      });
      row.appendChild(b);
    }
  }

  // ---------------- Settings ----------------
  _bindSettings() {
    const app = this.app;
    const s = () => app.settings;
    $('set-steer').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      app.audio.play('select');
      if (b.dataset.v === 'tilt') {
        app.input.requestTilt().then((ok) => {
          if (!ok) {
            app.hud.toast('Tilt is not available here');
            $('tilt-status').textContent = 'Tilt permission was not granted, so touch steering stays on.';
            s().steering = 'touch';
          } else s().steering = 'tilt';
          saveSettings(s());
          this._syncSettings();
          app.applyControls();
        });
      } else {
        s().steering = 'touch';
        saveSettings(s());
        this._syncSettings();
        app.applyControls();
      }
    });
    $('set-quality').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      app.audio.play('select');
      s().quality = b.dataset.v;
      saveSettings(s());
      app.applyQuality();
      this._syncSettings();
    });
    $('set-sens').addEventListener('input', (e) => { s().tiltSens = +e.target.value; saveSettings(s()); });
    $('set-invert').addEventListener('change', (e) => { s().invertTilt = e.target.checked; saveSettings(s()); });
    $('set-music').addEventListener('change', (e) => { s().music = e.target.checked; app.audio.setMusic(s().music); saveSettings(s()); });
    $('set-sfx').addEventListener('change', (e) => { s().sfx = e.target.checked; app.audio.setSfx(s().sfx); saveSettings(s()); });
    $('set-fps').addEventListener('change', (e) => { s().showFps = e.target.checked; $('fps').hidden = !s().showFps; saveSettings(s()); });
  }

  _syncSettings() {
    const s = this.app.settings;
    document.querySelectorAll('#set-steer [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === s.steering));
    document.querySelectorAll('#set-quality [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === s.quality));
    $('set-sens').value = s.tiltSens;
    $('set-invert').checked = s.invertTilt;
    $('set-music').checked = s.music;
    $('set-sfx').checked = s.sfx;
    $('set-fps').checked = s.showFps;
  }

  tick() {
    if (this.current === 'settings') {
      const inp = this.app.input;
      const v = inp.tilt.listening ? inp.tiltSteer() : 0;
      $('tilt-dot').style.transform = `translateX(${v * 70}px)`;
      if (inp.tiltLive) $('tilt-status').textContent = `Working. Angle ${Math.round(inp.tilt.angle)}°`;
    }
  }

  // ---------------- Results ----------------
  results({ title, sub, html, buttons }) {
    $('res-title').textContent = title;
    $('res-sub').textContent = sub || '';
    $('res-body').innerHTML = html;
    $('res-buttons').innerHTML = buttons.map(([go, label, cls]) => `<button class="btn ${cls || ''}" data-go="${go}">${label}</button>`).join('');
    this.show('results');
  }

  row(r, extra = '') {
    const img = this.app.portraits[r.ch.id] || '';
    return `<div class="res${r.isPlayer ? ' me' : ''}"><span class="p">${r.place}${ordinal(r.place).toLowerCase()}</span><img alt="" src="${img}"><span>${r.ch.name}</span>${extra}</div>`;
  }
}
