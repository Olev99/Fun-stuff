import { CHARACTERS, charById } from './characters.js';
import { TRACKS, CUPS, trackById } from './tracks.js';
import { Track } from './track.js';
import { THEMES } from './world.js';
import { fmtTime, ordinal } from './util.js';
import { saveSettings } from './settings.js';
import { cleanNick } from './nametags.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
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
        else if (action === 'mp') app.openMultiplayer();
        else if (action === 'career') app.openCareer();
        else { this.mode = action; this.charSelect(); }
        break;
      case 'char':
        if (this.mode === 'mp') app.mpCharDone();
        else if (action === 'back') app.toTitle();
        else this.trackSelect();
        break;
      case 'lobby':
        app.onLobbyAction(action);
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
        else if (action === 'quit') (app.session ? app.leaveMP() : app.quitRace());
        break;
      case 'results':
        app.onResultsAction(action);
        break;
      case 'career':
        app.careerUI.action(action);
        break;
      case 'garage':
        app.careerUI.garageAction(action);
        break;
      case 'story':
        if (action === 'skip') app.careerUI.endStory();
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
    $('char-mode').textContent = { gp: 'Grand Prix', quick: 'Quick Race', tt: 'Time Trial', mp: 'Multiplayer' }[this.mode];
    document.querySelector('#scr-char [data-go="next"]').textContent = this.mode === 'mp' ? 'Done' : 'Next';
    document.querySelector('#scr-char [data-go="back"]').hidden = this.mode === 'mp';
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
    $('diff-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-diff]');
      if (!b) return;
      this.app.audio.play('select');
      this.app.settings.difficulty = b.dataset.diff;
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
    document.querySelectorAll('#diff-seg [data-diff]').forEach((b) => {
      const on = b.dataset.diff === this.app.settings.difficulty;
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
    $('diff-seg').hidden = this.mode === 'tt';
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
      tx.innerHTML = `<span class="tn">${def.name}</span><span class="tb"><span class="tz ${def.size}">${def.size}</span>${def.laps || 3} laps${rec && rec.tt ? ` · Best ${fmtTime(rec.tt)}` : ''}</span><span class="tb">${def.blurb}</span>`;
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
    $('set-tags').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      app.audio.play('select');
      s().tags = b.dataset.v;
      saveSettings(s());
      this._syncSettings();
    });
    $('nick').addEventListener('input', (e) => {
      s().name = cleanNick(e.target.value);
      saveSettings(s());
    });
    $('set-sens').addEventListener('input', (e) => { s().tiltSens = +e.target.value; saveSettings(s()); });
    $('set-invert').addEventListener('change', (e) => { s().invertTilt = e.target.checked; saveSettings(s()); });
    $('set-music').addEventListener('change', (e) => { s().music = e.target.checked; app.audio.setMusic(s().music); saveSettings(s()); });
    $('set-sfx').addEventListener('change', (e) => { s().sfx = e.target.checked; app.audio.setSfx(s().sfx); saveSettings(s()); });
    $('set-fps').addEventListener('change', (e) => { s().showFps = e.target.checked; $('fps').hidden = !s().showFps; saveSettings(s()); });
    $('set-reset-career').addEventListener('click', () => {
      if (!app.career) { app.hud.toast('No career yet'); return; }
      if (!confirm('Start the career over? Coins, karts, racers and stars will be lost.')) return;
      app.resetCareer();
      app.audio.play('uiBack');
      $('set-reset-career').textContent = 'Done';
    });
  }

  _syncSettings() {
    const s = this.app.settings;
    document.querySelectorAll('#set-steer [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === s.steering));
    document.querySelectorAll('#set-quality [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === s.quality));
    document.querySelectorAll('#set-tags [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.tags || 'all')));
    $('set-sens').value = s.tiltSens;
    $('set-invert').checked = s.invertTilt;
    $('set-music').checked = s.music;
    $('set-sfx').checked = s.sfx;
    $('set-fps').checked = s.showFps;
    $('set-reset-career').textContent = 'Reset';
  }

  tick() {
    if (this.current === 'settings') {
      const inp = this.app.input;
      const v = inp.tilt.listening ? inp.tiltSteer() : 0;
      $('tilt-dot').style.transform = `translateX(${v * 70}px)`;
      if (inp.tiltLive) $('tilt-status').textContent = `Working. Angle ${Math.round(inp.tilt.angle)}°`;
    }
  }

  // ---------------- Multiplayer lobby ----------------
  lobby(view, error = '') {
    $('lobby-start').hidden = view !== 'start';
    $('lobby-room').hidden = view !== 'room';
    $('lobby-error').textContent = error;
    if (view === 'start') {
      $('nick').value = this.app.settings.name || '';
      $('lobby-status').textContent = '';
      $('lobby-buttons').innerHTML = '<button class="btn ghost small" data-go="leave">Back</button>';
    }
    this.show('lobby');
    if (view === 'room') this.renderLobby();
  }

  renderLobby() {
    const app = this.app;
    const ses = app.session;
    if (!ses || this.current !== 'lobby') return;
    $('room-code').textContent = ses.code || '----';
    const meId = ses.isHost ? 'host' : ses.meId;
    const rows = ses.players.map((p, i) => {
      const ch = charById(p.char);
      const who = p.nick ? `<span class="nk">${esc(p.nick)}</span> · ${ch.name}` : ch.name;
      return `<div class="pl${p.id === meId ? ' me' : ''}"><img alt="" src="${app.portraits[ch.id] || ''}"><span>${who}${p.id === meId ? ' (you)' : ''}</span><span class="tag">${i === 0 ? 'HOST' : `P${i + 1}`}</span></div>`;
    });
    for (let i = ses.players.length; i < 4; i++) rows.push(`<div class="pl empty"><span></span><span>Waiting for a friend…</span><span></span></div>`);
    $('lobby-players').innerHTML = rows.join('');
    const cfg = ses.lobby;
    const def = trackById(cfg.track);
    const cls = { chill: 'Chill', zoom: 'Zoom', turbo: 'Turbo' }[cfg.speedClass];
    const dif = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[cfg.difficulty];
    if (ses.isHost) {
      $('lobby-status').textContent = `${ses.players.length} of 4 players`;
      $('lobby-settings').innerHTML = `
        <div class="row"><span class="lbl">Track</span><div class="picker"><button data-lb="track-prev" aria-label="Previous track">◀</button><span>${def.name}${cfg.reverse ? ' ⟲' : ''}</span><button data-lb="track-next" aria-label="Next track">▶</button></div></div>
        <div class="row"><span class="lbl">Speed</span><div class="seg">${['chill', 'zoom', 'turbo'].map((c) => `<button data-lb="cls-${c}" class="${cfg.speedClass === c ? 'on' : ''}">${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div></div>
        <div class="row"><span class="lbl">Computer racers</span><div class="seg">${['off', 'easy', 'normal', 'hard'].map((d) => `<button data-lb="ai-${d}" class="${(d === 'off' ? !cfg.ai : cfg.ai && cfg.difficulty === d) ? 'on' : ''}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div></div>
        <div class="row"><span class="lbl">Reverse</span><label class="toggle"><input type="checkbox" data-lb="reverse" ${cfg.reverse ? 'checked' : ''} aria-label="Reverse"></label></div>`;
      $('lobby-buttons').innerHTML = `<button class="btn ghost small" data-go="leave">Leave</button><button class="btn alt small" data-go="char">Change racer</button><button class="btn hot" data-go="start" ${ses.players.length < 2 ? 'disabled style="opacity:.5"' : ''}>Start race</button>`;
    } else {
      $('lobby-status').textContent = 'Connected';
      $('lobby-settings').innerHTML = `<div class="lobby-summary">Track: <b>${def.name}${cfg.reverse ? ' (reverse)' : ''}</b><br>Speed: <b>${cls}</b><br>Computer racers: <b>${cfg.ai ? dif : 'Off'}</b><br><br>The host picks the track and starts the race.</div>`;
      $('lobby-buttons').innerHTML = `<button class="btn ghost small" data-go="leave">Leave</button><button class="btn alt small" data-go="char">Change racer</button>`;
    }
    if (!this._lobbyBound) {
      this._lobbyBound = true;
      $('lobby-settings').addEventListener('click', (e) => {
        const b = e.target.closest('[data-lb]');
        if (!b || !app.session || !app.session.isHost || b.tagName === 'INPUT') return;
        app.audio.play('select');
        const v = b.dataset.lb;
        const L = app.session.lobby;
        const idx = TRACKS.findIndex((t) => t.id === L.track);
        if (v === 'track-prev') app.session.setLobby({ track: TRACKS[(idx - 1 + TRACKS.length) % TRACKS.length].id });
        else if (v === 'track-next') app.session.setLobby({ track: TRACKS[(idx + 1) % TRACKS.length].id });
        else if (v.startsWith('cls-')) app.session.setLobby({ speedClass: v.slice(4) });
        else if (v === 'ai-off') app.session.setLobby({ ai: false });
        else if (v.startsWith('ai-')) app.session.setLobby({ ai: true, difficulty: v.slice(3) });
        app.previewTrack(app.session.lobby.track, app.session.lobby.reverse);
      });
      $('lobby-settings').addEventListener('change', (e) => {
        if (e.target.dataset.lb === 'reverse' && app.session && app.session.isHost) {
          app.session.setLobby({ reverse: e.target.checked });
          app.previewTrack(app.session.lobby.track, app.session.lobby.reverse);
        }
      });
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
    const name = r.nick ? `<span class="nk">${esc(r.nick)}<small>${r.ch.name}</small></span>` : `<span>${r.ch.name}</span>`;
    return `<div class="res${r.isPlayer ? ' me' : ''}"><span class="p">${r.place}${ordinal(r.place).toLowerCase()}</span><img alt="" src="${img}">${name}${extra}</div>`;
  }
}
