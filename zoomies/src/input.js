import { clamp } from './util.js';

const DEG = 180 / Math.PI;

// Tilt (device orientation), on-screen touch controls and keyboard.
export class Input {
  constructor(settings) {
    this.settings = settings;
    this.keys = new Set();
    this.btn = { drift: false, item: false, brake: false };
    this.itemPulse = null; // set when the ITEM button fires: +1 ahead, -1 behind, 0 default
    this.touchSteer = 0;
    this.lookBack = false; // held on the minimap
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

  read(dt) {
    const k = this.keys;
    let steer = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) steer -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
    const useTilt = this.settings.steering === 'tilt' && this.tilt.listening;
    if (steer === 0) {
      if (useTilt) {
        const target = this.tiltSteer();
        this.tilt.smooth += (target - this.tilt.smooth) * Math.min(1, dt * 22);
        steer = this.tilt.smooth;
      } else {
        steer = this.touchSteer;
      }
    }
    const brake = this.btn.brake || k.has('ArrowDown') || k.has('KeyS');
    let item = this.btn.item || k.has('KeyE') || k.has('KeyX') || k.has('Enter') || k.has('KeyF');
    let aim = 0;
    if (this.itemPulse !== null) {
      item = true;
      aim = this.itemPulse;
      this.itemPulse = null;
    }
    // Holding brake (or down) throws behind, holding up throws ahead.
    if (item && !aim) aim = brake ? -1 : k.has('ArrowUp') || k.has('KeyW') ? 1 : 0;
    return {
      lookBack: this.lookBack || k.has('KeyQ') || k.has('KeyC'),
      steer,
      throttle: 1,
      brake,
      drift: this.btn.drift || k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight'),
      item,
      aim,
    };
  }
}
