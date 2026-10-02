import { CHARACTERS, charById } from './characters.js';
import { BODY_LIST, UPGRADES, MAX_UPGRADE, bodyById, kartStats } from './karts.js';
import {
  CHAPTERS, TYPE_ICON, SPEAKERS, PAINTS, RACER_PRICE, paintById, eventStars, chapterStars, totalStars, MAX_STARS, chapterUnlocked,
  eventUnlocked, currentChapter, rivalFor, goalLabel, starHints, trackLabel, upgradesFor, upgradeCost, racerAvailable, saveCareer, BOSS_NEEDS,
} from './career.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const CLASS_NAME = { chill: 'Chill', zoom: 'Zoom', turbo: 'Turbo' };
const DIFF_NAME = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const STATS = [['speed', 'Speed'], ['accel', 'Accel'], ['handling', 'Handling'], ['weight', 'Weight']];
const coins = (n) => `🪙 ${n.toLocaleString('en-US')}`;
const starRow = (n, prev = 3) => [1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}${i > prev && i <= n ? ' new' : ''}">★</i>`).join('');

// Career screens: the chapter hub, the garage, story dialogue and results.
export class CareerUI {
  constructor(app, ui) {
    this.app = app;
    this.ui = ui;
    this.ci = null;
    this.sel = null;
    this.tab = 'karts';
    this.pick = {};
    this.story = null;
    $('ev-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ev]');
      if (!b) return;
      this.app.audio.play('select');
      this.select(b.dataset.ev);
    });
    $('garage-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.app.audio.play('select');
      this.tab = b.dataset.tab;
      this.renderGarage();
    });
    $('garage-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      this.app.audio.play('select');
      if (this.tab === 'upgrades') this.buyUpgrade(b.dataset.pick);
      else {
        this.pick[this.tab] = b.dataset.pick;
        this.renderGarage();
      }
    });
    $('scr-story').addEventListener('click', (e) => {
      if (e.target.closest('[data-go]')) return;
      this.nextLine();
    });
  }

  get c() { return this.app.career; }

  // ---------------- hub ----------------
  open() {
    const c = this.c;
    if (this.ci === null || !chapterUnlocked(c, this.ci)) this.ci = currentChapter(c);
    const stories = [];
    if (this.app.pendingStory) {
      stories.push(this.app.pendingStory);
      this.app.pendingStory = null;
      this.ci = currentChapter(c);
      this.sel = null;
    }
    const ch = CHAPTERS[currentChapter(c)];
    if (!c.seen[`${ch.id}-intro`]) {
      stories.push({ key: `${ch.id}-intro`, lines: ch.intro, title: ch.name });
      this.ci = currentChapter(c);
    }
    this.render();
    this.ui.show('career');
    if (stories.length) this.playStories(stories, () => this.ui.show('career'));
  }

  render() {
    const c = this.c;
    const ch = CHAPTERS[this.ci];
    const unlocked = chapterUnlocked(c, this.ci);
    $('car-coins').textContent = c.coins.toLocaleString('en-US');
    $('car-stars').textContent = `${totalStars(c)}/${MAX_STARS}`;
    $('chap-num').textContent = `Chapter ${this.ci + 1} of ${CHAPTERS.length}`;
    $('chap-name').textContent = ch.name;
    $('chap-blurb').textContent = unlocked ? ch.blurb : `Beat the rival in chapter ${this.ci} to unlock.`;
    const rival = rivalFor(c, ch);
    $('chap-rival-img').src = this.app.portraits[rival] || '';
    $('chap-rival').innerHTML = `Rival <b>${charById(rival).name}</b>`;
    const cleared = ch.events.filter((e) => c.done[e.id]).length;
    $('chap-meta').innerHTML = `${CLASS_NAME[ch.cls]} class · ${DIFF_NAME[ch.diff]} racers<br>${cleared}/${ch.events.length} cleared · ★ ${chapterStars(c, ch)}/${ch.events.length * 3}`;
    $('chap-prev').disabled = this.ci === 0;
    $('chap-next').disabled = this.ci >= CHAPTERS.length - 1;
    $('scr-career').classList.toggle('locked', !unlocked);
    if (c.champion) $('chap-meta').innerHTML += '<br><b class="champ">🏆 Golden Wheel champion</b>';

    if (!this.sel || !ch.events.some((e) => e.id === this.sel)) {
      const firstOpen = ch.events.findIndex((e, i) => eventUnlocked(c, this.ci, i) && !c.done[e.id]);
      this.sel = ch.events[firstOpen >= 0 ? firstOpen : 0].id;
    }
    $('ev-list').innerHTML = ch.events.map((ev, i) => {
      const open = eventUnlocked(c, this.ci, i);
      const st = eventStars(c, ev.id);
      const where = ev.type === 'cup' ? ev.tracks.map((t) => trackLabel(t)).join(' · ') : trackLabel(ev.track, ev.rev);
      const right = !open
        ? `<span class="lock">🔒 ${unlocked ? `Clear ${BOSS_NEEDS}` : 'Locked'}</span>`
        : c.done[ev.id] ? `<span class="stars">${starRow(st)}</span>` : `<span class="rew">${coins(ev.reward)}</span>`;
      const sel = ev.id === this.sel;
      let more = '';
      if (sel && open) {
        more = `<span class="hints">${starHints(ev).map((h, k) => `<span class="${k < st ? 'got' : ''}">${'★'.repeat(k + 1)} ${h}</span>`).join('')}</span>`;
        if (ev.type === 'time' && c.best[ev.id]) more += `<span class="best">Best ${fmtTime(c.best[ev.id])}</span>`;
      }
      return `<button class="ev${sel ? ' sel' : ''}${open ? '' : ' off'}${ev.boss ? ' boss' : ''}" data-ev="${ev.id}">
        <span class="ic">${TYPE_ICON[ev.type]}</span>
        <span class="mid"><span class="nm">${ev.title}</span><span class="sub">${goalLabel(ev, c)} · ${where}</span>${more}</span>
        ${right}</button>`;
    }).join('');
    const selIdx = ch.events.findIndex((e) => e.id === this.sel);
    const canGo = unlocked && eventUnlocked(c, this.ci, selIdx);
    $('car-go').disabled = !canGo;
    $('car-go').classList.toggle('dim', !canGo);
    this._previewSel();
  }

  _previewSel() {
    const ev = CHAPTERS[this.ci].events.find((e) => e.id === this.sel);
    if (!ev) return;
    this.app.previewTrack(ev.type === 'cup' ? ev.tracks[0] : ev.track, !!ev.rev);
  }

  select(id) {
    this.sel = id;
    this.render();
    const el = document.querySelector(`#ev-list [data-ev="${id}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  action(a) {
    const c = this.c;
    if (a === 'back') this.app.toTitle();
    else if (a === 'garage') this.openGarage();
    else if (a === 'gumball') this.app.gumballUI.open('career');
    else if (a === 'prev' && this.ci > 0) { this.ci--; this.sel = null; this.render(); }
    else if (a === 'next' && this.ci < CHAPTERS.length - 1) { this.ci++; this.sel = null; this.render(); }
    else if (a === 'race') {
      const ch = CHAPTERS[this.ci];
      const idx = ch.events.findIndex((e) => e.id === this.sel);
      if (idx < 0 || !eventUnlocked(c, this.ci, idx)) return;
      const ev = ch.events[idx];
      const key = `${ch.id}-boss`;
      if (ev.boss && !c.seen[key]) this.playStories([{ key, lines: ch.bossIntro, title: ev.title }], () => this.app.startCareerEvent(ev.id));
      else this.app.startCareerEvent(ev.id);
    }
  }

  // ---------------- story ----------------
  playStories(list, done) {
    const lines = [];
    for (const s of list) {
      s.lines.forEach((l, i) => lines.push({ who: l[0], text: l[1], key: i === s.lines.length - 1 ? s.key : null, title: s.title }));
    }
    if (!lines.length) { done(); return; }
    this.story = { lines, i: -1, done };
    this.ui.show('story');
    this.nextLine();
  }

  nextLine() {
    const st = this.story;
    if (!st) return;
    if (st.i >= 0 && st.lines[st.i].key) this._markSeen(st.lines[st.i].key);
    st.i++;
    if (st.i >= st.lines.length) { this.endStory(); return; }
    if (st.i > 0) this.app.audio.play('select');
    const l = st.lines[st.i];
    const sp = SPEAKERS[l.who];
    const av = $('story-av');
    if (sp) {
      av.innerHTML = `<span>${sp.icon}</span>`;
      av.style.background = sp.color;
    } else {
      const ch = charById(l.who);
      av.innerHTML = `<img alt="" src="${this.app.portraits[ch.id] || ''}">`;
      av.style.background = ch.color;
    }
    $('story-name').textContent = sp ? sp.name : charById(l.who).name;
    $('story-title').textContent = l.title || '';
    const t = $('story-text');
    t.textContent = l.text;
    t.classList.remove('in');
    void t.offsetWidth;
    t.classList.add('in');
  }

  endStory() {
    const st = this.story;
    if (!st) return;
    for (const l of st.lines) if (l.key) this._markSeen(l.key);
    this.story = null;
    st.done();
  }

  _markSeen(key) {
    this.c.seen[key] = true;
    saveCareer(this.c);
  }

  // ---------------- garage ----------------
  openGarage() {
    const c = this.c;
    this.app.showShowroom();
    this.pick = { karts: c.body, racers: c.racer, paint: c.paint };
    this.renderGarage();
    this.ui.show('garage');
  }

  closeGarage() {
    this.app.careerUI.open();
  }

  renderGarage() {
    const c = this.c;
    const app = this.app;
    document.querySelectorAll('#garage-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    $('gar-coins').textContent = c.coins.toLocaleString('en-US');
    let racer = c.racer, body = c.body, paint = c.paint;
    let name = '', blurb = '', kind = '';
    let act = null; // [label, enabled, class]
    const list = $('garage-list');
    list.className = `garage-list ${this.tab}`;
    if (this.tab === 'karts') {
      body = this.pick.karts;
      const b = bodyById(body);
      name = b.name; blurb = b.blurb; kind = 'Kart';
      list.innerHTML = BODY_LIST.map((k) => {
        const own = c.bodies.includes(k.id);
        const tag = k.id === c.body ? 'Driving' : own ? 'Owned' : coins(k.price);
        return `<button class="gcard${k.id === body ? ' sel' : ''}${own ? ' own' : ''}" data-pick="${k.id}"><span class="gn">${k.name}</span><span class="gt">${tag}</span>${this._upPips(c.upgrades[k.id])}</button>`;
      }).join('');
      if (!c.bodies.includes(body)) act = [`Buy ${coins(b.price)}`, c.coins >= b.price, 'buy-body'];
      else if (body !== c.body) act = ['Drive this kart', true, 'equip-body'];
      else act = ['Driving', false, ''];
    } else if (this.tab === 'upgrades') {
      const b = bodyById(c.body);
      name = b.name; blurb = 'Upgrades belong to this kart. Every level makes a real difference.'; kind = 'Upgrades';
      const up = upgradesFor(c);
      list.innerHTML = Object.values(UPGRADES).map((u) => {
        const lv = up[u.id] || 0;
        const cost = upgradeCost(u.id, lv);
        const pips = [...Array(MAX_UPGRADE)].map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        const btn = cost === null ? '<span class="gt max">MAX</span>' : `<span class="gt${c.coins >= cost ? '' : ' poor'}">${coins(cost)}</span>`;
        return `<button class="urow${cost === null ? ' maxed' : ''}" data-pick="${u.id}"><span class="uic">${u.icon}</span><span class="umid"><span class="gn">${u.name}<span class="pips">${pips}</span></span><span class="ub">${u.blurb}</span></span>${btn}</button>`;
      }).join('');
    } else if (this.tab === 'racers') {
      racer = this.pick.racers;
      const ch = charById(racer);
      name = ch.name; blurb = ch.tagline; kind = ch.species;
      list.innerHTML = CHARACTERS.map((r) => {
        const own = c.racers.includes(r.id);
        const avail = racerAvailable(c, r.id);
        const tag = r.id === c.racer ? 'Driving' : own ? 'On team' : avail ? coins(RACER_PRICE[r.id]) : '🔒';
        return `<button class="card rcard${r.id === racer ? ' sel' : ''}${avail || own ? '' : ' off'}" data-pick="${r.id}" style="background:${r.color}"><img alt="" src="${app.portraits[r.id] || ''}"><span class="nm">${r.name}</span><span class="rt">${tag}</span></button>`;
      }).join('');
      if (!c.racers.includes(racer)) {
        if (racerAvailable(c, racer)) act = [`Hire ${coins(RACER_PRICE[racer])}`, c.coins >= RACER_PRICE[racer], 'buy-racer'];
        else {
          const chap = CHAPTERS.findIndex((x) => x.rival === racer);
          act = [chap >= 0 ? `Beat in chapter ${chap + 1}` : charById(racer).lvl ? `Reach level ${charById(racer).lvl}` : 'Locked', false, ''];
        }
      } else if (racer !== c.racer) act = [`Drive as ${ch.name}`, true, 'equip-racer'];
      else act = ['Driving', false, ''];
    } else if (this.tab === 'paint') {
      paint = this.pick.paint;
      const p = paintById(paint);
      name = p.name; blurb = 'A fresh coat for your kart. Paint stays when you switch karts.'; kind = 'Paint';
      list.innerHTML = PAINTS.map((pt) => {
        const own = c.paints.includes(pt.id);
        const tag = pt.id === c.paint ? 'On' : own ? 'Owned' : coins(pt.price);
        const sw = pt.color || charById(c.racer).color;
        return `<button class="gcard pcard${pt.id === paint ? ' sel' : ''}" data-pick="${pt.id}"><span class="sw" style="background:${sw}"></span><span class="gn">${pt.name}</span><span class="gt">${tag}</span></button>`;
      }).join('');
      if (!c.paints.includes(paint)) act = [`Buy ${coins(p.price)}`, c.coins >= p.price, 'buy-paint'];
      else if (paint !== c.paint) act = ['Apply', true, 'equip-paint'];
      else act = ['Applied', false, ''];
    }
    $('gar-kind').textContent = kind;
    $('gar-name').textContent = name;
    $('gar-blurb').textContent = blurb;
    const st = kartStats(charById(racer), body, upgradesFor(c, body));
    const cur = kartStats(charById(c.racer), c.body, upgradesFor(c));
    $('gar-stats').innerHTML = STATS.map(([k, n]) => {
      const v = st[k], w = Math.max(4, Math.min(100, (v / 8) * 100));
      const d = v - cur[k];
      const delta = Math.abs(d) > 0.01 ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d.toFixed(1)}</em>` : '';
      return `<span>${n}</span><div class="sbar"><i style="width:${w}%"></i></div><b>${v.toFixed(1)}${delta}</b>`;
    }).join('');
    const ab = $('gar-act');
    ab.hidden = !act;
    if (act) {
      ab.textContent = act[0];
      ab.disabled = !act[1];
      ab.classList.toggle('dim', !act[1]);
      ab.dataset.op = act[2];
    }
    app.showroom.setChar(charById(racer), { body, paint: paintById(paint).color });
  }

  _upPips(up) {
    if (!up) return '';
    const n = Object.values(up).reduce((a, b) => a + b, 0);
    return n ? `<span class="gu">+${n}</span>` : '';
  }

  garageAction(a) {
    const c = this.c;
    if (a === 'back') { this.closeGarage(); return; }
    if (a !== 'act') return;
    const op = $('gar-act').dataset.op;
    const spend = (n) => {
      if (c.coins < n) return false;
      c.coins -= n;
      return true;
    };
    let ok = true;
    if (op === 'buy-body') {
      const b = bodyById(this.pick.karts);
      if ((ok = spend(b.price))) { c.bodies.push(b.id); c.body = b.id; upgradesFor(c, b.id); }
    } else if (op === 'equip-body') c.body = this.pick.karts;
    else if (op === 'buy-racer') {
      const id = this.pick.racers;
      if ((ok = spend(RACER_PRICE[id]))) { c.racers.push(id); c.racer = id; }
    } else if (op === 'equip-racer') c.racer = this.pick.racers;
    else if (op === 'buy-paint') {
      const p = paintById(this.pick.paint);
      if ((ok = spend(p.price))) { c.paints.push(p.id); c.paint = p.id; }
    } else if (op === 'equip-paint') c.paint = this.pick.paint;
    else return;
    this.app.audio.play(ok ? (op.startsWith('buy') ? 'coin' : 'select') : 'uiBack');
    saveCareer(c);
    this.renderGarage();
  }

  buyUpgrade(key) {
    const c = this.c;
    const up = upgradesFor(c);
    const cost = upgradeCost(key, up[key] || 0);
    if (cost === null || c.coins < cost) {
      this.app.audio.play('uiBack');
      if (cost !== null) this.app.hud.toast('Not enough coins');
      return;
    }
    c.coins -= cost;
    up[key] = (up[key] || 0) + 1;
    saveCareer(c);
    this.app.audio.play('coin');
    this.renderGarage();
  }

  // ---------------- results ----------------
  results(out, rowsHtml, extraHtml = '') {
    const ev = out.ev;
    const title = out.pass ? (ev.boss ? (ev.type === 'cup' ? 'Champion!' : 'Rival beaten!') : 'Event cleared!') : 'Not quite!';
    const lines = out.lines.map(([l, v]) => `<div><span>${l}</span><b>+${v}</b></div>`).join('');
    const tip = out.pass ? '' : `<p class="car-tip">${this._tip(out)}</p>`;
    const unlock = out.unlocked ? `<p class="car-unlock"><img alt="" src="${this.app.portraits[out.unlocked] || ''}"><span><b>${charById(out.unlocked).name}</b> can now join your team. Hire them in the garage.</span></p>` : '';
    this.ui.results({
      title,
      sub: `${out.chapter.name} · ${ev.title}`,
      html: `<div class="car-res"><div class="car-stars">${starRow(out.stars, out.prevStars)}</div>
        <div class="car-goal">${goalLabel(ev, this.c)}</div>${extraHtml}
        <div class="car-coins">${lines}<div class="tot"><span>Total</span><b>${coins(out.coins)}</b></div></div></div>${unlock}${tip}${rowsHtml}`,
      buttons: out.pass
        ? [['garage', 'Garage', 'ghost small'], ['retry', 'Retry', 'alt small'], ['career', 'Continue', 'hot']]
        : [['career', 'Career', 'ghost small'], ['garage', 'Garage', 'alt small'], ['retry', 'Retry', 'hot']],
    });
  }

  _tip(out) {
    const c = this.c;
    const up = upgradesFor(c);
    const total = Object.values(up).reduce((a, b) => a + b, 0);
    if (out.ev.type === 'gems') return 'Gems sit in rows on the racing line and in shortcuts. The Gem Magnet item pulls in everything nearby.';
    if (c.coins >= 300 && total < 12) return 'You have coins to spend: engine and turbo upgrades in the garage make a big difference.';
    if (out.ev.type === 'time') return 'Drift through long corners and let go on hot pink sparks for a nova boost, the biggest there is. Shortcuts help too.';
    return 'Hold DRIFT through corners for drift boosts, and look for the shortcut on this track.';
  }
}
