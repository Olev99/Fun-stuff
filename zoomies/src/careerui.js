import { CHARACTERS, charById } from './characters.js';
import { BODY_LIST, bodyById, kartStats } from './karts.js';
import {
  CHAPTERS, LEAGUE, modOf, TYPE_ICON, SPEAKERS, PAINTS, RACER_PRICE, paintById, eventStars, chapterStars, totalStars, MAX_STARS, chapterUnlocked,
  eventUnlocked, currentChapter, rivalFor, goalLabel, starHints, trackLabel, racerAvailable, saveCareer, BOSS_NEEDS,
  trackTraits, grampsTip, chaptersDone, storyClues, evPlan, eventIds,
} from './career.js';
import { PART_LIST, partById, TIER_NAME } from './parts.js';
import { rankInfo, leagueStars, LEAGUE_MAX_STARS, RANK_REWARDS, REWARD_RANKS, MAX_RANK, RANK_STARS } from './league.js';
import { cosmeticById } from './cosmetics.js';
import { evDefs, evNames } from './evint.js';
import {
  loadout, socketsOf, owned, freeCopies, fittedCount, equip, unequip, savePreset, loadPreset, buy, sell, sellValue, inStock,
  chassisCost, buyChassis, PRESET_NAMES,
} from './workshop.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const CLASS_NAME = { chill: 'Chill', zoom: 'Zoom', turbo: 'Turbo' };
const DIFF_NAME = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const STATS = [['speed', 'Speed'], ['accel', 'Accel'], ['handling', 'Handling'], ['weight', 'Weight']];
const FX_LABEL = { speed: 'top speed', accel: 'acceleration', handling: 'handling', weight: 'weight' };
const coins = (n) => `🪙 ${n.toLocaleString('en-US')}`;
const starRow = (n, prev = 3) => [1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}${i > prev && i <= n ? ' new' : ''}">★</i>`).join('');
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// What a stat part does, as short coloured lines: [text, isGood].
function fxLines(p) {
  const out = [];
  for (const [k, v] of Object.entries(p.fx || {})) {
    if (k in FX_LABEL) out.push([`${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(2).replace(/0$/, '')} ${FX_LABEL[k]}`, v > 0]);
    else if (k === 'grip') out.push([`+${Math.round(v * 100)}% grip`, true]);
    else if (k === 'turbo') out.push([`+${Math.round(v * 100)}% drift boost`, true]);
    else if (k === 'armor') out.push([`${Math.round(-v * 100)}% shorter spin-outs`, true]);
    else if (k === 'soft') out.push([`${Math.round((v - 1) * 100)}% on sand and mud`, false]);
  }
  return out;
}

// Career screens: the chapter hub, the garage, Gramps's Workshop, story
// dialogue and results.
export class CareerUI {
  constructor(app, ui) {
    this.app = app;
    this.ui = ui;
    this.ci = null;
    this.league = false; // the hub shows the Legends League map instead of the story chapters
    this.sel = null;
    this.tab = 'karts';
    this.pick = {};
    this.story = null;
    // Workshop: tab (fit / shop), selected socket and part, "save preset" mode.
    this.ws = { tab: 'fit', slot: 0, sel: null, save: false };
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
      if (b.dataset.tab === 'workshop') { this.openWorkshop(); return; }
      this.tab = b.dataset.tab;
      this.renderGarage();
    });
    $('garage-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      this.app.audio.play('select');
      this.pick[this.tab] = b.dataset.pick;
      this.renderGarage();
    });
    $('scr-story').addEventListener('click', (e) => {
      if (e.target.closest('[data-go]')) return;
      this.nextLine();
    });
    $('ws-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.app.audio.play('select');
      this.ws.tab = b.dataset.tab;
      this.ws.sel = null;
      this.renderWorkshop();
    });
    $('ws-sockets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      this.app.audio.play('select');
      const i = +b.dataset.slot;
      this.ws.slot = i;
      const id = loadout(this.c, this.c.body).cur[i];
      if (id) { this.ws.tab = 'fit'; this.ws.sel = id; } else if (this.ws.sel && owned(this.c, this.ws.sel) < 1 && this.ws.tab === 'fit') this.ws.sel = null;
      this.renderWorkshop();
    });
    $('ws-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pid]');
      if (!b) return;
      this.app.audio.play('select');
      this.ws.sel = this.ws.sel === b.dataset.pid ? null : b.dataset.pid;
      this.renderWorkshop();
    });
    $('ws-presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pre]');
      if (!b) return;
      this.workshopPreset(b.dataset.pre);
    });
    $('ws-detail').addEventListener('click', (e) => {
      if (e.target.closest('[data-sell]')) this.workshopSell();
    });
  }

  get c() { return this.app.career; }
  get list() { return this.league ? LEAGUE : CHAPTERS; }

  // ---------------- hub ----------------
  open() {
    const c = this.c;
    if (this.league && !c.champion) this.league = false;
    const list = this.list;
    if (this.ci === null || this.ci >= list.length || !chapterUnlocked(c, this.ci, list)) this.ci = currentChapter(c, list);
    const stories = [];
    const pending = this.app.pendingStories.splice(0);
    if (pending.length) {
      stories.push(...pending);
      this.ci = currentChapter(c, list);
      this.sel = null;
    }
    const ch = list[currentChapter(c, list)];
    // The very first visit starts with the scrapyard scene (not for saves that are already under way).
    if (ch.prologue && !c.seen[`${ch.id}-prologue`] && !c.seen[`${ch.id}-intro`] && !totalStars(c)) stories.push({ key: `${ch.id}-prologue`, lines: ch.prologue, title: 'Prologue' });
    if (!c.seen[`${ch.id}-intro`]) {
      stories.push({ key: `${ch.id}-intro`, lines: ch.intro, title: ch.name });
      this.ci = currentChapter(c, list);
    }
    this.render();
    this.ui.show('career');
    if (stories.length) this.playStories(stories, () => this.ui.show('career'));
  }

  render() {
    const c = this.c;
    const list = this.list, lg = this.league;
    const ch = list[this.ci];
    const unlocked = chapterUnlocked(c, this.ci, list);
    $('car-coins').textContent = c.coins.toLocaleString('en-US');
    $('car-stars').textContent = lg ? `${leagueStars(c)}/${LEAGUE_MAX_STARS}` : `${totalStars(c)}/${MAX_STARS}`;
    $('chap-num').textContent = lg ? `League · Season ${this.ci + 1} of ${list.length}` : `Chapter ${this.ci + 1} of ${list.length}`;
    $('chap-name').textContent = ch.name;
    $('chap-blurb').textContent = unlocked ? ch.blurb : `Beat the rival in ${lg ? 'season' : 'chapter'} ${this.ci} to unlock.`;
    $('scr-career').classList.toggle('league', lg);
    const rival = rivalFor(c, ch);
    $('chap-rival-img').src = this.app.portraits[rival] || '';
    $('chap-rival').innerHTML = `Rival <b>${charById(rival).name}</b>`;
    const cleared = ch.events.filter((e) => c.done[e.id]).length;
    $('chap-meta').innerHTML = `${CLASS_NAME[ch.cls]} class · ${DIFF_NAME[ch.diff]} racers<br>${cleared}/${ch.events.length} cleared · ★ ${chapterStars(c, ch)}/${ch.events.length * 3}`;
    if (c.champion && !lg) $('chap-meta').innerHTML += '<br><b class="champ">🏆 Golden Wheel champion</b>';
    // Story progress: one pip per finished chapter and the latest clue (the League shows its Legend Rank instead).
    const done = chaptersDone(c, list);
    const clues = storyClues(c, list);
    $('chap-story').innerHTML = lg ? this._rankStrip()
      : `<span class="pips">${list.map((_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span><span class="clue">${clues.length ? `<b>Clue:</b> ${esc(clues[clues.length - 1])}` : 'Win races to uncover the story.'}</span>`;
    this._leagueCard();
    $('chap-prev').disabled = this.ci === 0;
    $('chap-next').disabled = this.ci >= list.length - 1;
    $('scr-career').classList.toggle('locked', !unlocked);
    $('car-ws-badge').hidden = !c.pnew;

    if (!this.sel || !ch.events.some((e) => e.id === this.sel)) {
      const firstOpen = ch.events.findIndex((e, i) => eventUnlocked(c, this.ci, i, list) && !c.done[e.id]);
      this.sel = ch.events[firstOpen >= 0 ? firstOpen : 0].id;
    }
    $('ev-list').innerHTML = ch.events.map((ev, i) => {
      const open = eventUnlocked(c, this.ci, i, list);
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
        more += this._eventHints(ev);
      }
      return `<button class="ev${sel ? ' sel' : ''}${open ? '' : ' off'}${ev.boss ? ' boss' : ''}" data-ev="${ev.id}">
        <span class="ic">${TYPE_ICON[ev.type]}</span>
        <span class="mid"><span class="nm">${ev.title}</span><span class="sub">${goalLabel(ev, c)} · ${where}</span>${more}</span>
        ${right}</button>`;
    }).join('');
    const selIdx = ch.events.findIndex((e) => e.id === this.sel);
    const canGo = unlocked && eventUnlocked(c, this.ci, selIdx, list);
    $('car-go').disabled = !canGo;
    $('car-go').classList.toggle('dim', !canGo);
    this._previewSel();
  }

  // The League card under the chapter panel: locked until the Golden Wheel, then a way into the League map (and back).
  _leagueCard() {
    const c = this.c, b = $('chap-league');
    b.classList.toggle('locked', !c.champion);
    b.classList.toggle('back', this.league);
    if (this.league) { b.innerHTML = '<b>◀ Story map</b><small>Back to the chapters</small>'; return; }
    const ri = rankInfo(c);
    const sub = !c.champion ? '🔒 Win the Golden Wheel to enter' : c.seen['L1-intro'] ? `Legend Rank ${ri.rank} · ★ ${ri.stars}/${LEAGUE_MAX_STARS}` : 'NEW: the post-game is open!';
    b.innerHTML = `<b>🏛️ Legends League</b><small>${sub}</small>`;
  }

  // The Legend Rank strip on the League map: ten pips, the reward ranks marked, and the next reward.
  _rankStrip() {
    const ri = rankInfo(this.c);
    const pips = [...Array(MAX_RANK)].map((_, i) => `<i class="${i < ri.rank ? 'on' : ''}${RANK_REWARDS[i + 1] ? ' rw' : ''}"></i>`).join('');
    const nextR = REWARD_RANKS.find((r) => r > ri.rank);
    const names = (r) => [...RANK_REWARDS[r].cos.map((id) => (cosmeticById(id) || {}).icon || ''), ...RANK_REWARDS[r].paints.map(() => '🎨')].join('');
    const nx = nextR ? `Rank ${nextR} (★ ${RANK_STARS[nextR - 1]}) gives ${names(nextR)}${RANK_REWARDS[nextR].title ? ' and the Legend title' : ''}` : 'Every rank reward earned!';
    return `<span class="pips rank">${pips}</span><span class="clue"><b>Legend Rank ${ri.rank}</b> · ★ ${ri.stars}/${LEAGUE_MAX_STARS}${ri.next ? ` · next rank at ★ ${ri.next}` : ''}<br>${nx}</span>`;
  }

  // Track traits, what the event drops and a tip from Gramps about which parts suit it.
  _eventHints(ev) {
    const c = this.c;
    const traits = trackTraits(ev.type === 'cup' ? ev.tracks[0] : ev.track);
    // Track events this story event has (career.js evPlan): an icon chip with their names.
    const evs = evDefs(ev.type === 'cup' ? ev.tracks : ev.track, evPlan(ev, this.list[this.ci]).only).filter((d) => eventIds(ev).includes(d.id));
    const evWild = evs.length && evPlan(ev, this.list[this.ci]).mode === 'wild';
    const chips = traits.map((t) => `<i>${t.icon} ${t.label}</i>`);
    if (evs.length) chips.push(`<i class="evc${evWild ? ' wild' : ''}">${esc(evNames(evs))}${evWild ? ' · Wild' : ''}</i>`);
    let h = chips.length ? `<span class="traits">${chips.join('')}</span>` : '';
    const mod = modOf(ev);
    if (mod) h += `<span class="twist"><b>${mod.icon} Twist: ${mod.name}.</b> ${esc(mod.desc)}</span>`;
    const p = ev.drop && partById(ev.drop);
    if (p) {
      const got = !!c.drops[ev.id];
      h += `<span class="dropl${got ? ' got' : ''}">${got ? 'Earned' : ev.bp ? 'Blueprint' : ev.dropAny ? 'First clear drops' : '3 stars drop'}: ${p.icon} ${p.name}</span>`;
    }
    h += `<span class="gtip"><b>Gramps says:</b> ${esc(grampsTip(ev))}</span>`;
    return h;
  }

  _previewSel() {
    const ev = this.list[this.ci].events.find((e) => e.id === this.sel);
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
    else if (a === 'workshop') this.openWorkshop();
    else if (a === 'gumball') this.app.gumballUI.open('career');
    else if (a === 'school') this.app.startSchool('career');
    else if (a === 'prev' && this.ci > 0) { this.ci--; this.sel = null; this.render(); }
    else if (a === 'next' && this.ci < this.list.length - 1) { this.ci++; this.sel = null; this.render(); }
    else if (a === 'league') {
      if (!c.champion) { this.app.audio.play('uiBack'); this.app.hud.toast('Win the Golden Wheel to enter'); return; }
      this.league = !this.league;
      this.ci = null;
      this.sel = null;
      this.open();
    } else if (a === 'race') {
      const ch = this.list[this.ci];
      const idx = ch.events.findIndex((e) => e.id === this.sel);
      if (idx < 0 || !eventUnlocked(c, this.ci, idx, this.list)) return;
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
    if (this.tab === 'workshop') this.tab = 'karts';
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
        return `<button class="gcard${k.id === body ? ' sel' : ''}${own ? ' own' : ''}" data-pick="${k.id}"><span class="gn">${k.name}</span><span class="gt">${tag}</span>${this._partPips(k.id)}</button>`;
      }).join('');
      if (!c.bodies.includes(body)) act = [`Buy ${coins(b.price)}`, c.coins >= b.price, 'buy-body'];
      else if (body !== c.body) act = ['Drive this kart', true, 'equip-body'];
      else act = ['Driving', false, ''];
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
          const chap = CHAPTERS.findIndex((x) => x.rival === racer || (x.joins || []).includes(racer));
          act = [chap >= 0 ? `Beat in chapter ${chap + 1}` : charById(racer).lvl ? `Reach level ${charById(racer).lvl}` : 'Locked', false, ''];
        }
      } else if (racer !== c.racer) act = [`Drive as ${ch.name}`, true, 'equip-racer'];
      else act = ['Driving', false, ''];
    } else if (this.tab === 'paint') {
      paint = this.pick.paint;
      const p = paintById(paint);
      name = p.name; blurb = p.league ? `Reach Legend Rank ${p.league} in the Legends League to win this paint.` : 'A fresh coat for your kart. Paint stays when you switch karts.'; kind = 'Paint';
      list.innerHTML = PAINTS.map((pt) => {
        const own = c.paints.includes(pt.id);
        const tag = pt.id === c.paint ? 'On' : own ? 'Owned' : pt.league ? `Rank ${pt.league}` : coins(pt.price);
        const sw = pt.color || charById(c.racer).color;
        return `<button class="gcard pcard${pt.id === paint ? ' sel' : ''}" data-pick="${pt.id}"><span class="sw" style="background:${sw}"></span><span class="gn">${pt.name}</span><span class="gt">${tag}</span></button>`;
      }).join('');
      if (!c.paints.includes(paint)) act = p.league ? [`Legend Rank ${p.league}`, false, ''] : [`Buy ${coins(p.price)}`, c.coins >= p.price, 'buy-paint'];
      else if (paint !== c.paint) act = ['Apply', true, 'equip-paint'];
      else act = ['Applied', false, ''];
    }
    $('gar-kind').textContent = kind;
    $('gar-name').textContent = name;
    $('gar-blurb').textContent = blurb;
    const st = kartStats(charById(racer), body, { parts: loadout(c, body).cur });
    const cur = kartStats(charById(c.racer), c.body, { parts: loadout(c, c.body).cur });
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

  // "3/4": parts fitted over sockets, on a vehicle's garage card.
  _partPips(body) {
    const n = loadout(this.c, body).cur.length;
    return n ? `<span class="gu">🔩${n}</span>` : '';
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
      if ((ok = spend(b.price))) { c.bodies.push(b.id); c.body = b.id; loadout(c, b.id); }
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

  // ---------------- Gramps's Workshop ----------------
  openWorkshop() {
    const c = this.c;
    this.app.showShowroom();
    this.ws = { tab: 'fit', slot: 0, sel: null, save: false };
    const l = loadout(c, c.body);
    this.ws.slot = Math.min(l.cur.length, socketsOf(c, c.body) - 1);
    this.renderWorkshop();
    this.ui.show('workshop');
    // Looking at the Workshop clears the NEW PART badge.
    if (c.pnew) { c.pnew = false; saveCareer(c); }
  }

  // The part ids the stat panel previews: the current ones, or what they would be after the selected action.
  _previewFit() {
    const c = this.c, body = c.body, ws = this.ws;
    const cur = loadout(c, body).cur.slice();
    const id = ws.sel;
    if (!id || !partById(id)) return cur;
    if (cur[ws.slot] === id) return cur.filter((_, i) => i !== ws.slot); // would be removed
    const t = { parts: { ...c.parts }, bought: {}, loadouts: JSON.parse(JSON.stringify(c.loadouts)), sockets: { ...c.sockets }, body };
    if (owned(t, id) < 1) t.parts[id] = 1;
    const r = equip(t, body, ws.slot, id);
    return r.ok ? loadout(t, body).cur : cur;
  }

  renderWorkshop() {
    const c = this.c, ws = this.ws, body = c.body, b = bodyById(body);
    const l = loadout(c, body), cap = socketsOf(c, body);
    ws.slot = Math.max(0, Math.min(ws.slot, cap - 1));
    $('ws-coins').textContent = c.coins.toLocaleString('en-US');
    $('ws-name').textContent = b.name;
    $('ws-kind').textContent = `${cap} socket${cap > 1 ? 's' : ''}${c.sockets[body] ? ' · modded' : ''}`;
    document.querySelectorAll('#ws-tabs [data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === ws.tab));
    // sockets
    $('ws-sockets').innerHTML = [...Array(cap)].map((_, i) => {
      const p = partById(l.cur[i]);
      const sel = i === ws.slot ? ' sel' : '';
      return p
        ? `<button class="sock${sel}" data-slot="${i}"><span class="si">${p.icon}</span><span class="sn">${p.name}</span></button>`
        : `<button class="sock empty${sel}" data-slot="${i}"><span class="si">+</span><span class="sn">Empty</span></button>`;
    }).join('');
    // stats with a preview of the change
    const racer = charById(c.racer);
    const now = kartStats(racer, body, { parts: l.cur });
    const after = kartStats(racer, body, { parts: this._previewFit() });
    $('ws-stats').innerHTML = STATS.map(([k, n]) => {
      const v = now[k], w = after[k], d = w - v;
      const shown = Math.abs(d) > 0.005
        ? `${v.toFixed(1)} <u>→</u> <em class="${d > 0 ? 'up' : 'down'}">${w.toFixed(1)}</em>`
        : v.toFixed(1);
      const pct = Math.max(4, Math.min(100, (w / 8) * 100));
      return `<span>${n}</span><div class="sbar"><i style="width:${pct}%"></i></div><b>${shown}</b>`;
    }).join('');
    // presets
    $('ws-presets').innerHTML = PRESET_NAMES.map((n, i) => {
        const ids = l.pre[i] || [];
        return `<button class="pre${ws.save ? ' saving' : ''}" data-pre="${i}"><b>${n}</b><span>${ids.length ? ids.map((id) => partById(id).icon).join('') : '–'}</span></button>`;
    }).join('')
      + `<button class="pre savebtn${ws.save ? ' on' : ''}" data-pre="save">${ws.save ? 'Pick one' : 'Save'}</button>`;
    // chassis mod
    const cc = chassisCost(c, body);
    const cb = $('ws-chassis');
    cb.textContent = cc === null ? 'Chassis modded' : `Chassis Mod ${coins(cc)}`;
    cb.disabled = cc === null;
    cb.classList.toggle('dim', cc === null || c.coins < cc);
    // the list on the right
    const list = $('ws-list');
    const chap = currentChapter(c);
    if (ws.tab === 'fit') {
      const mine = PART_LIST.filter((p) => owned(c, p.id) > 0);
      list.innerHTML = mine.length ? mine.map((p) => this._partCard(p, { chap, shop: false })).join('') : '<p class="ws-empty">No parts yet. Win 3-star clears for drops, or check the Shop.</p>';
    } else {
      list.innerHTML = PART_LIST.map((p) => this._partCard(p, { chap, shop: true })).join('');
    }
    this._renderDetail(chap);
    this.app.showroom.setChar(racer, { body, paint: paintById(c.paint).color });
  }

  _partCard(p, { chap, shop }) {
    const c = this.c, ws = this.ws;
    const n = owned(c, p.id), fit = fittedCount(c, p.id);
    const stock = inStock(c, p.id, chap);
    let tag;
    if (!shop) tag = fit ? `<span class="pt on">${fit === 1 ? 'Fitted' : `Fitted ×${fit}`}${n > fit ? ` +${n - fit}` : ''}</span>` : `<span class="pt">×${n}</span>`;
    else if (!stock) tag = `<span class="pt lock">${p.kind === 'stat' && p.tier === 3 ? 'After the Wheel' : `Chapter ${p.from + 1}`}</span>`;
    else tag = `<span class="pt${c.coins < p.price ? ' poor' : ''}">${coins(p.price)}</span>`;
    const mark = shop && n ? `<span class="ow">×${n}</span>` : '';
    return `<button class="wpart${p.id === ws.sel ? ' sel' : ''}${shop && !stock ? ' off' : ''}${p.kind === 'special' ? ' sp' : ''}" data-pid="${p.id}"><span class="pi">${p.icon}</span><span class="pn">${p.name}</span>${tag}${mark}</button>`;
  }

  _renderDetail(chap) {
    const c = this.c, ws = this.ws, p = partById(ws.sel);
    const det = $('ws-detail'), act = $('ws-act');
    const l = loadout(c, c.body);
    let label = '', enabled = false, op = '';
    if (!p) {
      det.innerHTML = ws.tab === 'fit'
        ? '<span class="wd-hint">Tap a socket, then pick a part to fit. Swapping is free, so tune it for every track.</span>'
        : '<span class="wd-hint">Tap a part to see what it does. Stock grows as you win chapters.</span>';
      act.hidden = true;
      return;
    }
    const n = owned(c, p.id);
    const lines = p.kind === 'stat' ? fxLines(p).map(([t, good]) => `<em class="${good ? 'up' : 'down'}">${t}</em>`).join('') : `<em class="sp">${esc(p.blurb)}</em>`;
    const drawback = p.drawback ? `<em class="down">Race-spec drawback: ${p.drawback.toLowerCase()}</em>` : '';
    const suits = p.suits ? `<span class="suits">Suits: ${p.suits}</span>` : '';
    const where = [];
    for (const [bd, lo] of Object.entries(c.loadouts)) if (lo.cur && lo.cur.includes(p.id)) where.push(bodyById(bd).name);
    const have = n ? `Owned ×${n}${where.length ? ` · fitted on ${where.join(', ')}` : ''}` : 'Not owned';
    let sellBtn = '';
    if (ws.tab === 'fit' && n > 0 && freeCopies(c, p.id) > 0) sellBtn = `<button class="btn ghost tiny" data-sell="1">Sell +${coins(sellValue(c, p.id))}</button>`;
    det.innerHTML = `<span class="wd-head"><b>${p.icon} ${p.name}</b><small>${p.kind === 'stat' ? `Tier ${TIER_NAME[p.tier]}` : 'Special'} · ${have}</small></span><span class="wd-fx">${lines}${drawback}</span>${suits}${sellBtn}`;
    act.hidden = false;
    if (ws.tab === 'fit') {
      if (n < 1) { label = 'Not owned'; }
      else if (l.cur[ws.slot] === p.id) { label = 'Take off'; enabled = true; op = 'off'; }
      else { label = `Fit in socket ${ws.slot + 1}`; enabled = true; op = 'fit'; }
    } else if (!inStock(c, p.id, chap)) label = p.kind === 'stat' && p.tier === 3 ? 'After the Golden Wheel' : `Chapter ${p.from + 1}`;
    else { label = `Buy ${coins(p.price)}`; enabled = c.coins >= p.price; op = 'buy'; }
    act.textContent = label;
    act.disabled = !enabled;
    act.classList.toggle('dim', !enabled);
    act.dataset.op = op;
  }

  workshopPreset(which) {
    const c = this.c, ws = this.ws, body = c.body;
    if (which === 'save') { ws.save = !ws.save; this.app.audio.play('select'); this.renderWorkshop(); return; }
    const i = +which;
    if (ws.save) {
      savePreset(c, body, i);
      ws.save = false;
      this.app.audio.play('coin');
      this.app.hud.toast(`Saved to ${PRESET_NAMES[i]}`);
    } else {
      loadPreset(c, body, i);
      this.app.audio.play('select');
    }
    saveCareer(c);
    this.renderWorkshop();
  }

  workshopSell() {
    const c = this.c, ws = this.ws;
    const r = sell(c, ws.sel);
    this.app.audio.play(r.ok ? 'coin' : 'uiBack');
    if (!r.ok) this.app.hud.toast(r.why);
    else if (owned(c, ws.sel) < 1) ws.sel = null;
    saveCareer(c);
    this.renderWorkshop();
  }

  workshopAction(a) {
    const c = this.c, ws = this.ws;
    if (a === 'back') { this.app.careerUI.open(); return; }
    if (a === 'garage') { this.openGarage(); return; }
    let ok = true, snd = 'select';
    if (a === 'chassis') {
      const r = buyChassis(c, c.body);
      ok = r.ok;
      snd = r.ok ? 'coin' : 'uiBack';
      if (!r.ok) this.app.hud.toast(r.why);
    } else if (a === 'act') {
      const op = $('ws-act').dataset.op;
      if (op === 'fit') {
        const r = equip(c, c.body, ws.slot, ws.sel);
        ok = r.ok;
        if (r.moved) this.app.hud.toast(`Moved from ${bodyById(r.moved).name}`);
        ws.slot = Math.min(socketsOf(c, c.body) - 1, loadout(c, c.body).cur.length);
      } else if (op === 'off') unequip(c, c.body, ws.slot);
      else if (op === 'buy') {
        const r = buy(c, ws.sel, currentChapter(c));
        ok = r.ok;
        snd = r.ok ? 'coin' : 'uiBack';
        if (!r.ok) this.app.hud.toast(r.why);
        else {
          // Bought parts go straight on the kart when there is room.
          ws.tab = 'fit';
          const at = loadout(c, c.body).cur.indexOf(ws.sel);
          if (at >= 0) ws.slot = at;
        }
      } else return;
    } else return;
    this.app.audio.play(ok ? snd : 'uiBack');
    saveCareer(c);
    this.renderWorkshop();
  }

  // ---------------- results ----------------
  results(out, rowsHtml, extraHtml = '') {
    const ev = out.ev;
    const title = out.pass ? (ev.boss ? (ev.type === 'cup' ? 'Champion!' : 'Rival beaten!') : 'Event cleared!') : 'Not quite!';
    const lines = out.lines.map(([l, v]) => `<div><span>${l}</span><b>+${v}</b></div>`).join('');
    const tip = out.pass ? '' : `<p class="car-tip">${this._tip(out)}</p>`;
    const unlock = out.unlocked ? `<p class="car-unlock"><img alt="" src="${this.app.portraits[out.unlocked] || ''}"><span><b>${charById(out.unlocked).name}</b> can now join your team. Hire them in the garage.</span></p>` : '';
    let drop = '';
    if (out.drop) {
      const p = out.drop.part;
      drop = `<p class="car-drop"><span class="di">${p.icon}</span><span><b>${out.drop.blueprint ? 'Blueprint' : 'New part'}: ${p.name}</b><small>${esc(p.blurb)} It is waiting in the Workshop.</small></span></p>`;
    } else if (ev.drop && out.pass && !this.c.drops[ev.id]) {
      const p = partById(ev.drop);
      drop = `<p class="car-drop dim"><span class="di">${p.icon}</span><span><b>3 stars drops ${p.name}</b><small>Win bigger to earn it.</small></span></p>`;
    }
    const rank = out.rank ? this._rankResult(out.rank) : '';
    if (out.blueprint) drop += '<p class="car-drop gold"><span class="di">📜</span><span><b>Starbolt Blueprint recovered!</b><small>Gramps now sells race-spec Tier III parts in the Workshop.</small></span></p>';
    this.ui.results({
      title,
      sub: `${out.chapter.name} · ${ev.title}`,
      html: `<div class="car-res"><div class="car-stars">${starRow(out.stars, out.prevStars)}</div>
        <div class="car-goal">${goalLabel(ev, this.c)}</div>${extraHtml}
        <div class="car-coins">${lines}<div class="tot"><span>Total</span><b>${coins(out.coins)}</b></div></div></div>${out.rank && out.rank.up ? rank + drop : drop + rank}${unlock}${tip}${rowsHtml}`,
      buttons: out.pass
        ? [[out.drop ? 'workshop' : 'garage', out.drop ? 'Workshop' : 'Garage', 'ghost small'], ['retry', 'Retry', 'alt small'], ['career', 'Continue', 'hot']]
        : [['career', 'Career', 'ghost small'], ['garage', 'Garage', 'alt small'], ['retry', 'Retry', 'hot']],
    });
  }

  // Legend Rank progress under a League result, and any rank-up rewards.
  _rankResult(r) {
    const ri = rankInfo(this.c);
    const bar = `<span class="rbar"><i style="width:${ri.next ? Math.round((ri.into / ri.need) * 100) : 100}%"></i></span>`;
    const head = `<b>${r.up ? `RANK UP! Legend Rank ${r.to}` : `Legend Rank ${ri.rank}`}</b><small>★ ${ri.stars}/${LEAGUE_MAX_STARS}${ri.next ? ` · ${ri.next - ri.stars} more to rank ${ri.rank + 1}` : ' · top rank!'}</small>`;
    const chips = [
      ...r.cos.map((id) => cosmeticById(id)).filter(Boolean).map((it) => `<i>${it.icon} ${esc(it.name)}</i>`),
      ...r.paints.map((id) => paintById(id)).map((p) => `<i><u style="background:${p.color}"></u> ${esc(p.name)}</i>`),
    ];
    if (r.to >= MAX_RANK && r.up) chips.push('<i>🏛️ Title: Legend</i>');
    const gifts = chips.length ? `<span class="rgifts">${chips.join('')}<small>Wear them in the Gumball machine (hats, trails, horns) and Garage (paint).</small></span>` : '';
    return `<p class="car-rank${r.up ? ' up' : ''}"><span class="rt">${head}</span>${bar}${gifts}</p>`;
  }

  _tip(out) {
    const c = this.c;
    const fitted = loadout(c, c.body).cur.length;
    if (out.ev.type === 'gems') return 'Gems sit in rows on the racing line and in shortcuts. The Gem Magnet item pulls in everything nearby, and a Gem Vac part pulls them in from further away.';
    if (c.coins >= 150 && fitted < socketsOf(c, c.body)) return 'You have coins and a free socket: Gramps\'s Workshop sells parts that make a real difference.';
    if (out.ev.type === 'time') return 'Drift through long corners and let go on hot pink sparks for a nova boost, the biggest there is. Shortcuts help too.';
    return 'Hold DRIFT through corners for drift boosts, and look for the shortcut on this track.';
  }
}
