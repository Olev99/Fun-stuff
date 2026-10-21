import { saveSettings } from './settings.js';
import { chaptersDone } from './career.js';

// Keeping a player's progress safe and the game playable offline:
// - asks the browser not to evict the saved data (storage.persist),
// - registers the service worker (sw.js: offline play, safe updates),
// - shows one small note at a time on the title screen (update ready, "Add to
//   Home Screen" on iPhone, a backup reminder). Never during a race or a lobby.

const $ = (id) => document.getElementById(id);
const DAY = 864e5;

export const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class Pwa {
  constructor(app, version) {
    this.app = app;
    this.version = version;
    this.persisted = null; // true | false | null (unknown)
    this.reg = null;
    this.waiting = null; // a downloaded update, waiting for the next launch
    this.kind = null; // what the note on the title screen shows
    $('pn-go').addEventListener('click', () => this._go());
    $('pn-no').addEventListener('click', () => this.hide());
    this._protect();
    this._register();
  }

  get persistLabel() {
    return this.persisted === true ? 'yes' : this.persisted === false ? 'no' : 'unknown';
  }

  // ---------------- saved data ----------------
  _protect() {
    const st = navigator.storage;
    if (!st || typeof st.persist !== 'function') return;
    const set = (v) => { this.persisted = typeof v === 'boolean' ? v : null; };
    if (typeof st.persisted === 'function') st.persisted().then(set, () => {});
    // Browsers only grant it after the player has used the page.
    const ask = () => {
      removeEventListener('pointerdown', ask, true);
      removeEventListener('keydown', ask, true);
      Promise.resolve().then(() => (this.persisted ? true : st.persist())).then(set, () => { this.persisted = null; });
    };
    addEventListener('pointerdown', ask, true);
    addEventListener('keydown', ask, true);
  }

  // ---------------- service worker ----------------
  async _register() {
    const q = new URLSearchParams(location.search);
    // Not for file:// or the single-file build (no import map), and only where browsers allow workers.
    if (!document.querySelector('script[type="importmap"]')) return;
    if (q.has('nosw')) { this.repair(true); return; }
    if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) return;
    try { if (sessionStorage.getItem('zoomies.nosw')) return; } catch (e) { /* storage blocked */ }
    // Automated test browsers only use it when asked (?sw=1), so other suites stay as they were.
    if (navigator.webdriver && !q.has('sw')) return;
    try {
      const reg = (this.reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }));
      const check = () => { if (reg.waiting && navigator.serviceWorker.controller) this._waiting(reg.waiting); };
      check();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') check(); });
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch (e) { /* the game runs fine without a worker */ }
  }

  async _waiting(w) {
    const v = await new Promise((ok) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => ok(e.data);
      w.postMessage('ver', [ch.port2]);
      setTimeout(() => ok(null), 1500);
    });
    // The page may already run the new files (the page itself always loads fresh when online).
    if (v === this.version) return;
    this.waiting = w;
    if (this.app.ui.current === 'title') this.onTitle();
  }

  // Remove the worker and every cached file, then reload (the safety valve: ?nosw and Settings > Repair).
  async repair(strip = false) {
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (e) { /* none */ }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* none */ }
    if (strip) {
      try { sessionStorage.setItem('zoomies.nosw', '1'); } catch (e) { /* storage blocked */ }
      const u = new URL(location.href);
      u.searchParams.delete('nosw');
      location.replace(u);
    } else location.reload();
  }

  // ---------------- notes on the title screen ----------------
  onTitle() {
    const a = this.app, s = a.settings, c = a.career, now = Date.now();
    if (this.waiting) {
      this._show('update', 'Update ready', 'A new version of Zoomies is downloaded.', 'Tap to restart', 'Later');
    } else if (isIos() && !isStandalone() && !s.installShown && ((c.stats && c.stats.races) || 0) >= 1) {
      s.installShown = true;
      saveSettings(s);
      this._show('install', 'Keep your progress safe', 'iPhone can wipe a website\'s saved data after a week unused. Add Zoomies to your Home Screen to keep it, and to play full screen and offline.', 'Got it', '', ['Tap the <b>Share</b> button in Safari', 'Tap <b>Add to Home Screen</b>']);
    } else if (!isStandalone() && chaptersDone(c) >= 1 && now - (s.nudgeAt || 0) > 14 * DAY && now - (s.backupAt || 0) > 14 * DAY) {
      s.nudgeAt = now;
      saveSettings(s);
      this._show('backup', 'Back up your progress', 'Your Career lives only on this device. A backup code keeps it safe.', 'Back up now', 'Later');
    } else this.hide();
  }

  // Called by the UI for every screen change: notes belong to the title screen.
  screen(name) {
    if (name !== 'title') this.hide();
  }

  _show(kind, title, text, go, no, steps) {
    this.kind = kind;
    $('pn-title').textContent = title;
    $('pn-text').textContent = text;
    $('pn-steps').innerHTML = (steps || []).map((t) => `<li>${t}</li>`).join('');
    $('pn-go').textContent = go;
    $('pn-no').textContent = no;
    $('pn-no').hidden = !no;
    $('pwa-note').dataset.kind = kind;
    $('pwa-note').hidden = false;
  }

  hide() {
    this.kind = null;
    $('pwa-note').hidden = true;
  }

  _go() {
    const kind = this.kind;
    this.hide();
    if (kind === 'update' && this.waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      this.waiting.postMessage('skip');
    } else if (kind === 'backup') this.app.safeUI.open('backup');
  }
}
