// First steps: the Driving School lessons, one-shot tips, the steering-help
// offer and haptics. It only reads race state and the player's kart events
// (race.js passes them in); it never changes physics, AI or online sync.
import { saveSettings } from './settings.js';
import { AIM_DEFAULT } from './items.js';
import { isTouch } from './platform.js';

const $ = (id) => document.getElementById(id);

// In order. touch / keys: the banner text; btn: the control that pulses;
// done: the style popup when it's learned.
const LESSONS = [
  { id: 'steer', icon: '🕹️', touch: 'Steer around the bend', tilt: 'Tilt the phone to steer around the bend', keys: 'Steer around the bend with ← →', btn: '.steer-hint', done: 'NICE STEERING' },
  { id: 'drift', icon: '💨', touch: 'Hold DRIFT in a bend until sparks fly', keys: 'Hold SPACE in a bend until sparks fly', btn: '#btn-drift', done: 'SPARKS!' },
  { id: 'boost', icon: '🔥', touch: 'Now let go of DRIFT for a boost!', keys: 'Now let go of SPACE for a boost!', btn: '#btn-drift', done: 'BOOSTED!' },
  { id: 'orb', icon: '🔮', touch: 'Drive through a prize orb', keys: 'Drive through a prize orb', btn: null, done: 'GOT ONE!' },
  { id: 'item', icon: '🎁', touch: 'Tap ITEM to use it', keys: 'Press E to use it', btn: '#btn-item', done: 'ITEM USED' },
  { id: 'back', icon: '⤵️', touch: 'This one can fly backwards: tap THROW BACK', keys: '', btn: '#btn-throwback', done: 'THROW BACK', touchOnly: true },
];
const SHOW = 6; // a banner fades after this many seconds...
const REPEAT = 12; // ...and comes back after this many without progress
const TIP_GAP = 20; // at most one tip per this many seconds
const BUZZ = { hit: [40, 30, 60], boost: 25, pickup: 15 };

export class Coach {
  constructor(app) {
    this.app = app;
    this.race = null;
    this.clock = 0;
    this.lastTip = -99;
    this.queue = [];
    this.el = $('coach');
    this.ask = $('coach-ask');
    $('coach-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.skip(); });
    this.ask.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) { e.preventDefault(); this._answer(b.dataset.v === 'yes'); }
    });
  }

  get s() { return this.app.settings; }

  // A new race. cfg.school: the Driving School replay (all lessons, every time).
  start(race, cfg = {}) {
    const s = this.s;
    this.race = race;
    this.queue = [];
    this.walls = 0;
    this.falls = 0;
    this.tipT = 0;
    this.askT = 0;
    this.doneT = 0;
    this.ask.hidden = true;
    this.online = race.mode === 'mp';
    this.school = !!cfg.school;
    // Career races keep teaching until every lesson is learned or skipped.
    const career = !s.lessonsDone && race.careerEv && race.mode === 'quick';
    this.lessons = this.school || career ? { i: this.school ? 0 : s.lesson || 0, prog: 0, shownAt: -99 } : null;
    if (this.lessons) this._skipUnusable();
    if (!this.online) s.racesRun = (s.racesRun || 0) + 1;
    saveSettings(s);
    if (race.battle) this.tip('battle', '🎈 Every hit pops a balloon. Lose them all and you get one comeback!');
    this._banner(null);
  }

  get teaching() { return !!this.lessons; }

  // Player kart events from race.js (plus 'orb' for a prize orb and 'used'
  // with the item that was used).
  event(type, data, k) {
    if (!this.race || this.race !== this.app.race) return;
    if (type === 'wall' && data > 3) { this.walls++; this._offerAssist(); }
    if (type === 'fall') { this.falls++; this._offerAssist(); }
    const L = this.lessons;
    if (L) {
      const id = LESSONS[L.i].id;
      if ((id === 'drift' && type === 'driftLevel' && data >= 1) || (id === 'boost' && type === 'driftBoost') || (id === 'orb' && type === 'orb')
        || (id === 'item' && type === 'used') || (id === 'back' && type === 'used' && k && k.ctl.aim < 0)) this._pass();
    } else if (type === 'orb') this.tip('item', isTouch ? '🎁 Got an item! Tap ITEM to use it' : '🎁 Got an item! Press E to use it');
    if (type === 'shortcut') this.tip('shortcut', '🗺️ A secret shortcut! Found ones show on your minimap');
  }

  // One-shot tip, shown when there's room (never twice).
  tip(key, text) {
    const seen = this.s.tips || (this.s.tips = {});
    if (this.online || seen[key] || this.queue.some((q) => q.key === key)) return;
    this.queue.push({ key, text });
  }

  // The lobby's one-line tip, the first time it opens.
  lobbyTip() {
    const seen = this.s.tips || (this.s.tips = {});
    if (seen.lobby) return '';
    seen.lobby = 1;
    saveSettings(this.s);
    return 'Tip: one phone hosts and shows a 4-letter code; friends type it in to join.';
  }

  skip() {
    if (!this.lessons) return;
    this.lessons = null;
    if (!this.school) { this.s.lessonsDone = true; saveSettings(this.s); }
    this.app.audio.play('uiBack');
    this._banner(null);
  }

  // Juice that isn't camera work: hit-stop (single player) and phone buzzes.
  feel(kind) {
    if (this.s.shake === 'off') return;
    if (kind === 'hit') this.app.hitStop();
    // iOS Safari has no vibrate API, so iPhones simply stay still.
    if (typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(BUZZ[kind]); } catch (e) { /* not allowed here */ }
    }
  }

  tick(dt) {
    this.clock += dt;
    const r = this.app.race;
    if (!r || r !== this.race) { if (this.race) { this.race = null; this._banner(null); this.ask.hidden = true; } return; }
    if (this.askT > 0 && (this.askT -= dt) <= 0) this.ask.hidden = true;
    if (this.doneT > 0) {
      if ((this.doneT -= dt) > 0) return; // the tick on a learned lesson plays out
      if (this.mode === 'done') this._banner(null);
    }
    const p = r.player;
    if (!p || r.state !== 'race' || p.finished) { this._banner(null); return; }
    if (this.lessons) this._lessonTick(dt, r, p);
    this._tipTick(dt, p);
  }

  _lessonTick(dt, r, p) {
    const L = this.lessons, def = LESSONS[L.i];
    if (def.id === 'steer') {
      const inp = r.lastInput;
      if (inp && Math.abs(inp.steer) > 0.3) L.prog += dt;
      if (L.prog > 1.2) { this._pass(); return; }
    }
    if (def.id === 'orb' && p.item) { this._pass(); return; } // already holding one
    // The item lessons wait until there's something in your hands.
    const ready = def.id === 'item' ? !!p.item : def.id === 'back' ? !!(p.item && AIM_DEFAULT[p.item]) : true;
    if (!ready) { if (this.mode === 'lesson') this._banner(null); L.shownAt = -99; return; }
    const since = this.clock - L.shownAt;
    if (since >= REPEAT) {
      L.shownAt = this.clock;
      const keys = !isTouch;
      const text = keys ? def.keys : def.id === 'steer' && this.s.steering === 'tilt' && this.app.input.tilt.listening ? def.tilt : def.touch;
      this._banner(text, def.icon, 'lesson', keys || !def.btn ? null : def.btn);
    } else if (since > SHOW && this.mode === 'lesson') this._banner(null);
  }

  _pass() {
    const L = this.lessons, def = LESSONS[L.i];
    this.app.audio.play('lesson');
    if (this.race) this.race.style(def.done, 10, 'gold');
    if (def.id === 'item') (this.s.tips || (this.s.tips = {})).item = 1;
    L.i++;
    L.prog = 0;
    L.shownAt = this.clock - REPEAT + 1.2; // the next lesson follows the tick
    this._skipUnusable();
    const all = L.i >= LESSONS.length;
    if (all) this.lessons = null;
    if (!this.school) {
      this.s.lesson = L.i;
      if (all) this.s.lessonsDone = true;
    }
    saveSettings(this.s);
    this._banner(all ? 'Lessons done. You\'re ready!' : def.done, '✅', 'done');
    this.doneT = all ? 2.5 : 1.2;
  }

  // THROW BACK only exists on touch screens.
  _skipUnusable() {
    const L = this.lessons;
    while (L.i < LESSONS.length && LESSONS[L.i].touchOnly && !isTouch) L.i++;
    if (L.i >= LESSONS.length) {
      this.lessons = null;
      if (!this.school) this.s.lessonsDone = true;
    }
  }

  _tipTick(dt, p) {
    if (this.tipT > 0) {
      if ((this.tipT -= dt) <= 0) this._banner(null);
      return;
    }
    if (this.online) return;
    if (isTouch && !this.lessons && p.item && AIM_DEFAULT[p.item]) this.tip('throwback', '⤵️ This one can fly backwards: tap THROW BACK');
    if (!this.queue.length || this.mode === 'lesson' || this.clock - this.lastTip < TIP_GAP) return;
    const q = this.queue.shift();
    this.s.tips[q.key] = 1;
    saveSettings(this.s);
    this._banner(q.text.slice(q.text.indexOf(' ') + 1), q.text.split(' ')[0], 'tip');
    this.tipT = 5;
    this.lastTip = this.clock;
  }

  // Shown once, to a new player who keeps hitting walls or falling off.
  _offerAssist() {
    const s = this.s;
    if (s.assistOffered || s.assist === 'strong' || this.online || (s.racesRun || 0) > 3) return;
    if (this.walls < 6 && this.falls < 2) return;
    s.assistOffered = true;
    saveSettings(s);
    this.ask.hidden = false;
    this.askT = 9;
  }

  _answer(yes) {
    this.ask.hidden = true;
    this.askT = 0;
    if (!yes) return;
    this.s.assist = 'strong';
    saveSettings(this.s);
    this.app.audio.play('select');
    this.app.hud.toast('Strong steering help on');
  }

  // text null hides the banner. mode: lesson | tip | done.
  _banner(text, icon = '', mode = '', btn = null) {
    const el = this.el;
    if (this._lit) { this._lit.classList.remove('teach'); this._lit = null; }
    this.mode = text ? mode : '';
    if (!text) { el.classList.remove('show'); return; }
    this.app.hud.hint(''); // the banner takes the hint's place
    $('coach-ic').textContent = icon;
    $('coach-tx').textContent = text;
    el.className = `show ${mode}`;
    if (btn) {
      this._lit = document.querySelector(btn);
      if (this._lit) this._lit.classList.add('teach');
    }
  }
}
