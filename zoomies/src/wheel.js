// Your phone as a steering wheel for the game on a Mac (or any computer).
// The computer shows a code and a QR code; the phone opens the same game
// with ?wheel=CODE, connects straight to it over WebRTC (the same PeerJS
// broker as multiplayer, in its own namespace) and streams tilt and button
// presses about 60 times a second. The computer sends back your place, lap
// and item so the phone can show them, and nudges it when you get hit.

import qrcode from '../vendor/qrcode.mjs';
import { PeerTransport, LocalTransport, NetSession, makeCode } from './net.js';
import { ITEMS } from './items.js';
import { ordinal } from './util.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const transport = (cb) => (params.get('net') === 'local' ? new LocalTransport(cb, 'wheel') : new PeerTransport(cb, 'wheel'));
const LIVE_MS = 700;

// ---------------------------------------------------------------- computer
export class WheelHost {
  constructor(app) {
    this.app = app;
    this.code = null;
    this.t = null;
    this.phone = null;
    this.lastT = 0;
    this.state = { steer: 0, drift: false, brake: false, back: false };
    this.itemSeq = 0;
    this.uiSeq = 0;
    this.fbT = 0;
    this.wasLive = false;
    this.from = 'title';
  }

  get live() {
    return !!this.phone && performance.now() - this.lastT < LIVE_MS;
  }

  async open(from = 'title') {
    this.from = from;
    this.back = this.app.ui.returnTo;
    this.app.ui.show('wheel');
    this._status();
    if (!NetSession.supported()) {
      $('wheel-status').textContent = 'Open the game in its own browser tab (not inside another page) to pair a phone.';
      return;
    }
    if (this.t) return;
    this.code = makeCode();
    $('wheel-code').textContent = this.code;
    this._qr();
    $('wheel-status').textContent = 'Getting a code…';
    this.t = transport({
      join: (id) => this._join(id),
      leave: (id) => { if (id === this.phone) { this.phone = null; this._status(); } },
      message: (id, m) => this._msg(id, m),
      error: () => {},
    });
    try {
      await this.t.start('host', this.code);
      this._status();
    } catch (e) {
      this.t = null;
      $('wheel-status').textContent = `Couldn't reach the pairing server. Check the internet connection and try again. (${e.message || e})`;
    }
  }

  close() {
    if (this.from === 'settings') this.app.ui.overlay('settings', this.back || 'title');
    else this.app.ui.title();
  }

  _url() {
    const u = new URL(location.href);
    u.hash = '';
    const keep = new URLSearchParams();
    for (const k of ['net', 'peerhost', 'peerport', 'peerpath']) if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k));
    keep.set('wheel', this.code);
    u.search = keep.toString();
    return u.toString();
  }

  _qr() {
    const url = this._url();
    $('wheel-url').textContent = url.replace(/^https?:\/\//, '');
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const cv = $('wheel-qr');
    const cell = Math.max(3, Math.floor(220 / (n + 8)));
    const size = cell * (n + 8);
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1d1537';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
  }

  _join(id) {
    this.firstIn = undefined;
    // One wheel at a time: a new phone replaces the old one.
    if (this.phone && this.phone !== id) this.t.drop(this.phone);
    this.phone = id;
    this.lastT = performance.now();
    this.app.settings.steering = 'wheel';
    this.app.audio.play('secret');
    this._status();
    this._feedback(true);
  }

  _msg(id, m) {
    if (id !== this.phone || !m) return;
    if (m.t === 'in') {
      this.lastT = performance.now();
      const s = this.state;
      s.steer = Math.max(-1, Math.min(1, +m.s || 0));
      s.drift = !!m.d;
      s.brake = !!m.b;
      s.back = !!m.lb;
      // Item presses and menu buttons arrive as counters, so a lost or
      // repeated message can't double-fire them.
      if (typeof m.is === 'number' && m.is !== this.itemSeq) {
        const first = this.itemSeq === 0 && this.firstIn === undefined;
        this.itemSeq = m.is;
        if (!first) this.app.input.itemPulse = Number.isFinite(m.ia) ? Math.max(-1, Math.min(1, m.ia)) : 0;
      }
      if (typeof m.us === 'number' && m.us !== this.uiSeq) {
        const first = this.firstIn === undefined;
        this.uiSeq = m.us;
        if (!first && m.ua) this._ui(m.ua);
      }
      this.firstIn = true;
      if (!this.wasLive) { this.wasLive = true; this._status(); }
    }
  }

  // Menu buttons on the phone work the game on the computer.
  _ui(a) {
    const key = (code) => this.app.onKey({ code, target: document.body, preventDefault() {} });
    if (a === 'ok') key('Enter');
    else if (a === 'back') key('Escape');
    else if (a === 'pause') {
      const r = this.app.race;
      if (r && r.mode !== 'demo' && !document.querySelector('#ui > .screen:not([hidden])')) this.app.pause();
      else if (this.app.paused) this.app.resume();
    }
  }

  _status() {
    const el = $('wheel-status');
    const live = this.live;
    $('scr-wheel').classList.toggle('paired', live);
    if (el && this.t) el.innerHTML = live ? '✅ <b>Phone connected!</b> Hold it sideways and tilt to steer.' : 'Waiting for your phone…';
    const m = $('menu-wheel');
    if (m) m.textContent = live ? '· connected' : '';
  }

  // Called every frame by the app.
  tick(dt) {
    if (!this.t) return;
    const live = this.live;
    if (live !== this.wasLive) {
      this.wasLive = live;
      this._status();
      // Lost the wheel mid-race: pause so nobody crashes.
      const r = this.app.race;
      if (!live && r && r.mode !== 'demo' && r.state === 'race' && !this.app.paused && r.mode !== 'mp') {
        this.app.pause();
        this.app.hud.toast('Phone wheel disconnected');
      }
    }
    this.fbT -= dt;
    if (this.phone && this.fbT <= 0) this._feedback();
  }

  _feedback(force = false) {
    this.fbT = 0.1;
    const app = this.app;
    const r = app.race;
    const k = r && r.mode !== 'demo' ? r.player : null;
    const scr = document.querySelector('#ui > .screen:not([hidden])');
    const hot = scr && scr.querySelector('.btn.hot:not([hidden])');
    const fb = { t: 'fb', ok: hot ? hot.textContent.trim().slice(0, 18) : '', scr: scr ? scr.id.replace('scr-', '') : '' };
    if (k) {
      fb.place = r.mode === 'tt' ? 0 : k.place;
      fb.lap = Math.max(1, Math.min(k.laps + 1, r.laps));
      fb.laps = r.laps;
      fb.item = k.rolling > 0 ? '❔' : k.item ? (ITEMS[k.item] || {}).icon || '' : '';
      fb.st = r.state;
      fb.drift = k.drifting ? k.driftLevel : -1;
    }
    const key = JSON.stringify(fb);
    if (!force && key === this._lastFb && performance.now() - (this._fbAt || 0) < 1000) return;
    this._lastFb = key;
    this._fbAt = performance.now();
    this.t.send(this.phone, fb);
  }

  // A jolt on the phone when something happens to your kart.
  event(kind) {
    if (this.phone && this.t) this.t.send(this.phone, { t: 'ev', k: kind });
  }
}

// ------------------------------------------------------------------- phone
export class WheelPad {
  constructor(app) {
    this.app = app;
    this.t = null;
    this.code = params.get('wheel') ? params.get('wheel').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : '';
    this.btn = { drift: false, brake: false, back: false };
    this.itemSeq = 0;
    this.itemAim = 0;
    this.uiSeq = 0;
    this.uiA = '';
    this.fbAt = 0;
    this.steer = 0;
    this.on = false;
    this._bind();
  }

  get wanted() {
    return !!this.code;
  }

  // Show the connect screen (from a ?wheel= link or Settings).
  open() {
    this.app.disposeRace();
    this.app.view = null;
    this.app.ui.show('wheelpad');
    $('wp-connect').hidden = false;
    $('wp-pad').hidden = true;
    $('wp-code').value = this.code;
    $('wp-msg').textContent = this.code ? 'Tap Connect, then allow motion access so tilt steering works.' : 'Type the code shown on the computer.';
  }

  _bind() {
    $('wp-go').addEventListener('click', () => this.connect());
    $('wp-cancel').addEventListener('click', () => this.leave());
    const hold = (el, key) => {
      const on = (e) => { e.preventDefault(); this.btn[key] = true; el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.btn[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    hold($('wp-drift'), 'drift');
    hold($('wp-brake'), 'brake');
    hold($('wp-look'), 'back');
    // ITEM: tap to use, swipe up to throw ahead, down to throw behind.
    const it = $('wp-item');
    let y0 = 0;
    it.addEventListener('pointerdown', (e) => { e.preventDefault(); y0 = e.clientY; it.classList.add('on'); });
    const up = (e) => {
      if (!it.classList.contains('on')) return;
      e.preventDefault();
      it.classList.remove('on');
      const dy = e.clientY - y0;
      this.itemAim = dy < -28 ? 1 : dy > 28 ? -1 : 0;
      this.itemSeq++;
    };
    it.addEventListener('pointerup', up);
    it.addEventListener('pointercancel', up);
    for (const [id, a] of [['wp-ok', 'ok'], ['wp-back', 'back'], ['wp-pause', 'pause']]) {
      $(id).addEventListener('click', (e) => {
        e.preventDefault();
        this.uiA = a;
        this.uiSeq++;
      });
    }
  }

  async connect() {
    const code = $('wp-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length !== 4) { $('wp-msg').textContent = 'The code has 4 letters.'; return; }
    this.code = code;
    this.app.audio.unlock();
    // iOS asks for motion access here, inside the tap.
    const tilt = this.app.input.requestTilt();
    $('wp-msg').textContent = 'Connecting…';
    if (this.t) this.t.close();
    this.t = transport({
      join: () => {},
      leave: () => this._lost('The computer closed the connection.'),
      message: (id, m) => this._msg(m),
      error: () => {},
    });
    try {
      await this.t.start('guest', code);
    } catch (e) {
      this.t = null;
      $('wp-msg').textContent = e.message || 'Could not connect. Check the code and try again.';
      return;
    }
    const ok = await tilt;
    this.on = true;
    this.fbAt = performance.now();
    $('wp-connect').hidden = true;
    $('wp-pad').hidden = false;
    $('wp-tilt').hidden = ok;
    document.documentElement.classList.add('wheelpad');
    this.app.audio.play('go');
  }

  leave() {
    this.on = false;
    if (this.t) this.t.close();
    this.t = null;
    this.code = '';
    document.documentElement.classList.remove('wheelpad');
    history.replaceState(null, '', location.pathname);
    this.app.toTitle();
  }

  _lost(msg) {
    if (!this.on) return;
    this.on = false;
    $('wp-connect').hidden = false;
    $('wp-pad').hidden = true;
    $('wp-msg').textContent = `${msg} Tap Connect to try again.`;
  }

  _msg(m) {
    if (!m) return;
    if (m.t === 'fb') {
      this.fbAt = performance.now();
      $('wp-state').classList.remove('lost');
      const place = Number.isInteger(m.place) && m.place > 0 && m.place < 100 ? m.place : 0; // goes into innerHTML
      $('wp-place').innerHTML = place ? `${place}<sup>${ordinal(place)}</sup>` : '';
      $('wp-lap').textContent = m.lap ? `LAP ${m.lap}/${m.laps}` : m.scr ? 'MENU' : '';
      $('wp-item').querySelector('i').textContent = m.item || '';
      $('wp-ok').textContent = m.ok || 'OK';
      $('wp-ok').classList.toggle('dim', !m.ok);
      $('wp-wheel').dataset.drift = m.drift ?? -1;
    } else if (m.t === 'ev') {
      const f = $('wp-flash');
      f.className = '';
      void f.offsetWidth;
      f.className = m.k;
      if (navigator.vibrate) navigator.vibrate(m.k === 'hit' ? [60, 40, 60] : 30);
    }
  }

  // Called every frame by the app while this phone is a wheel.
  tick(dt) {
    if (!this.on) return;
    const inp = this.app.input;
    const target = inp.tilt.listening ? inp.tiltSteer() : 0;
    this.steer += (target - this.steer) * Math.min(1, dt * 24);
    $('wp-wheel').style.transform = `rotate(${(this.steer * 100).toFixed(1)}deg)`;
    if (this.t) {
      this.t.send('host', {
        t: 'in', s: +this.steer.toFixed(3), d: this.btn.drift ? 1 : 0, b: this.btn.brake ? 1 : 0, lb: this.btn.back ? 1 : 0,
        is: this.itemSeq, ia: this.itemAim, us: this.uiSeq, ua: this.uiA,
      });
    }
    if (performance.now() - this.fbAt > 2500) $('wp-state').classList.add('lost');
  }
}
