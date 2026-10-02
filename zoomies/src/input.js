import { clamp } from './util.js';

const DEG = 180 / Math.PI;

// Tilt (device orientation), on-screen touch controls and keyboard.
export class Input {
  constructor(settings) {
    this.settings = settings;
    this.keys = new Set();
    this.btn = { drift: false, item: false, brake: false, back: false };
    this.itemPulse = null; // set when the ITEM button fires: +1 ahead, -1 behind, 0 default
    this.touchSteer = 0;
    this.lookBack = false; // held on the minimap
    this.keySteer = 0; // keyboard steering, eased in and out
    this.wheel = null; // a phone paired as a steering wheel (see wheel.js)
    this.pad = { steer: 0, drift: false, item: false, brake: false, back: false, a: false, b: false, start: false, aim: 0 };
    this.padEdges = { a: false, b: false, start: false };
    this.tilt = { listening: false, angle: 0, smooth: 0, events: 0, lastT: 0, flip: 1, gsy: -1 };
    this.enabled = false;
    this._onOrient = this._onOrient.bind(this);
    this._bindKeys();
  }

  get hasTiltAPI() {
    return typeof window.DeviceOrientationEvent !== 'undefined';
  }

  get tiltLive() {
    return this.tilt.listening && this.tilt.events > 3 && performance.now() - this.tilt.lastT < 1500;
  }

  // Must be called from inside a tap handler (iOS permission rules).
  requestTilt() {
    if (!this.hasTiltAPI) return Promise.resolve(false);
    const DOE = window.DeviceOrientationEvent;
    if (typeof DOE.requestPermission === 'function') {
      let p;
      try {
        p = DOE.requestPermission();
      } catch (e) {
        return Promise.resolve(false);
      }
      return p.then((r) => {
        if (r === 'granted') { this._listen(); return true; }
        return false;
      }).catch(() => false);
    }
    this._listen();
    return Promise.resolve(true);
  }

  _listen() {
    if (this.tilt.listening) return;
    this.tilt.listening = true;
    window.addEventListener('deviceorientation', this._onOrient);
  }

  _screenAngle() {
    if (typeof window.orientation === 'number') return window.orientation;
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return 0;
  }

  _onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta / DEG, g = e.gamma / DEG;
    // Gravity direction in device coordinates (W3C Z-X'-Y'' convention).
    const gx = Math.sin(g) * Math.cos(b);
    const gy = -Math.sin(b);
    const th = this._screenAngle() / DEG;
    let sx = gx * Math.cos(th) - gy * Math.sin(th);
    let sy = gx * Math.sin(th) + gy * Math.cos(th);
    const t = this.tilt;
    // Self-correct if the platform reports the landscape angle the other way
    // round: when the phone is held up, gravity must point to the screen bottom.
    t.gsy += (sy * t.flip - t.gsy) * 0.05;
    if (t.gsy > 0.45) { t.flip = -t.flip; t.gsy = -t.gsy; }
    sx *= t.flip;
    sy *= t.flip;
    const ang = Math.atan2(sx, Math.max(-sy, 0.4)) * DEG;
    t.angle = ang;
    t.events++;
    t.lastT = performance.now();
  }

  _bindKeys() {
    const down = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    };
    const up = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => this.keys.clear());
  }

  // Wire the on-screen controls (buttons + steering pad).
  bindTouch(root) {
    const btns = root.querySelectorAll('[data-btn]');
    btns.forEach((el) => {
      const name = el.dataset.btn;
      if (name === 'item') {
        this._bindItem(el);
        return;
      }
      const set = (v) => {
        this.btn[name] = v;
        el.classList.toggle('on', v);
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        set(true);
      });
      const off = (e) => { e.preventDefault(); set(false); };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', () => set(false));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const pad = root.querySelector('#steer-pad');
    const knob = root.querySelector('#steer-knob');
    const base = root.querySelector('#steer-base');
    let id = null, x0 = 0;
    pad.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId;
      x0 = e.clientX;
      try { pad.setPointerCapture(id); } catch (_) { /* ignore */ }
      const r = pad.getBoundingClientRect();
      base.style.transform = `translate(${e.clientX - r.left - 60}px, ${e.clientY - r.top - 60}px)`;
      base.classList.add('on');
      knob.style.transform = 'translateX(0px)';
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = clamp(e.clientX - x0, -56, 56);
      this.touchSteer = clamp((e.clientX - x0) / 52, -1, 1);
      knob.style.transform = `translateX(${dx}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.touchSteer = 0;
      base.classList.remove('on');
      knob.style.transform = 'translateX(0px)';
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  // ITEM: swipe up to throw ahead, down to throw behind, tap for the item's
  // usual direction. Fires the moment the swipe is clear, or on release.
  _bindItem(el) {
    let pid = null, y0 = 0, armed = false;
    const clear = () => { pid = null; armed = false; el.classList.remove('on', 'fwd', 'back'); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      pid = e.pointerId;
      y0 = e.clientY;
      armed = true;
      el.classList.add('on');
    });
    el.addEventListener('pointermove', (e) => {
      if (!armed || e.pointerId !== pid) return;
      const dy = e.clientY - y0;
      if (Math.abs(dy) > 24) {
        armed = false;
        this.itemPulse = dy < 0 ? 1 : -1;
        el.classList.add(dy < 0 ? 'fwd' : 'back');
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pid) return;
      if (armed) this.itemPulse = 0;
      setTimeout(clear, 120);
      pid = null;
    });
    el.addEventListener('pointercancel', clear);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resetButtons() {
    this.itemPulse = null;
    for (const k in this.btn) this.btn[k] = false;
    this.touchSteer = 0;
    document.querySelectorAll('[data-btn].on').forEach((el) => el.classList.remove('on'));
  }

  tiltSteer() {
    const s = this.settings;
    const t = this.tilt;
    const maxDeg = 40 - s.tiltSens * 26; // 40deg (low) .. 14deg (high)
    let a = t.angle * (s.invertTilt ? -1 : 1);
    const dead = 1.5;
    const mag = Math.max(0, Math.abs(a) - dead) / (maxDeg - dead);
    return Math.sign(a) * Math.pow(clamp(mag, 0, 1), 1.12);
  }

  // Game controllers (PlayStation, Xbox, Switch Pro) in the standard layout:
  // stick or d-pad steers, R/RT/A drift, L/LT/X item, B brake, Y looks back.
  pollPad() {
    const P = this.pad;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of pads) if (g && g.connected && g.mapping === 'standard') { gp = g; break; }
    if (!gp) for (const g of pads) if (g && g.connected) { gp = g; break; }
    const was = { a: P.a, b: P.b, start: P.start };
    if (!gp) {
      P.steer = 0; P.drift = P.item = P.brake = P.back = P.a = P.b = P.start = false; P.aim = 0;
    } else {
      const btn = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
      const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      const dz = 0.14;
      let s = Math.abs(x) < dz ? 0 : Math.sign(x) * ((Math.abs(x) - dz) / (1 - dz)) ** 1.3;
      if (btn(14)) s = -1;
      if (btn(15)) s = 1;
      P.steer = s;
      P.drift = btn(5) || btn(7) || btn(0);
      P.item = btn(4) || btn(6) || btn(2);
      P.brake = btn(1);
      P.back = btn(3);
      P.aim = y < -0.5 || btn(12) ? 1 : y > 0.5 || btn(13) ? -1 : 0;
      P.a = btn(0); P.b = btn(1); P.start = btn(9);
      this.padActive = true;
    }
    this.padEdges.a = P.a && !was.a;
    this.padEdges.b = P.b && !was.b;
    this.padEdges.start = P.start && !was.start;
  }

  read(dt) {
    const k = this.keys;
    const P = this.pad;
    const W = this.wheel && this.wheel.live ? this.wheel.state : null;
    // Arrow keys ease in, so a tap is a nudge and holding is full lock.
    let kx = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) kx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) kx += 1;
    const rate = kx === 0 ? 9 : Math.sign(kx) !== Math.sign(this.keySteer) && this.keySteer !== 0 ? 14 : 5.5;
    const dk = kx - this.keySteer;
    this.keySteer = Math.abs(dk) <= rate * dt ? kx : this.keySteer + Math.sign(dk) * rate * dt;
    let steer;
    const useTilt = this.settings.steering === 'tilt' && this.tilt.listening;
    if (kx !== 0 || this.keySteer !== 0) steer = this.keySteer;
    else if (P.steer !== 0) steer = P.steer;
    else if (W) steer = W.steer;
    else if (useTilt) {
      const target = this.tiltSteer();
      this.tilt.smooth += (target - this.tilt.smooth) * Math.min(1, dt * 22);
      steer = this.tilt.smooth;
    } else {
      steer = this.touchSteer;
    }
    const brake = this.btn.brake || k.has('ArrowDown') || k.has('KeyS') || P.brake || !!(W && W.brake);
    let item = this.btn.item || k.has('KeyE') || k.has('KeyX') || k.has('Enter') || k.has('KeyF') || P.item || !!(W && W.item);
    let aim = 0;
    if (this.itemPulse !== null) {
      item = true;
      aim = this.itemPulse;
      this.itemPulse = null;
    }
    // Holding brake (or down) throws behind, holding up throws ahead.
    if (item && !aim) aim = W && W.item && W.aim ? W.aim : P.item && P.aim ? P.aim : brake ? -1 : k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
    return {
      lookBack: this.lookBack || !!this.btn.back || k.has('KeyQ') || k.has('KeyC') || P.back || !!(W && W.back),
      steer: clamp(steer, -1, 1),
      throttle: 1,
      brake,
      drift: this.btn.drift || k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || P.drift || !!(W && W.drift),
      item,
      aim,
    };
  }
}
