import { CHARACTERS, charById, charLocked } from './characters.js';
import { ARENAS, arenaById } from './arenas.js';
import { BATTLE_FIELD } from './battle.js';
import { TRACKS, CUPS, trackById } from './tracks.js';
import { Track } from './track.js';
import { THEMES } from './world.js';
import { fmtTime, ordinal, clamp } from './util.js';
import { saveSettings } from './settings.js';
import { cleanNick } from './nametags.js';
import { BODY_LIST, FREE_BODIES, bodyById, bodyLocked, bodyIcon } from './karts.js';
import { missionView, missionStreak, MISSION_XP } from './missions.js';
import { nextUp } from './nextup.js';
import { evDefs, evChip } from './evint.js';
import { medalTimes, medalTier, medalCount, medalMax, MEDALS } from './medals.js';
import { isTouch } from './platform.js';
import { weeklyFor, weeklyBest, weeklyStreak, weekNum, timeLeftText, WEEKLY_XP, WEEKLY_XP_BASE } from './weekly.js';
import { profileTitle, rankInfo, MAX_RANK, LEAGUE_MAX_STARS } from './league.js';
import { masteryOf, titleFor, STAR_COLORS, RACER_IDS, BODY_IDS } from './mastery.js';
import { levelOf, ACHIEVEMENTS, dailyFor, dailyGoalText, dailyDoneToday, dailyStreak, dailyReward, dailyTrackName } from './profile.js';

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
  }

  show(name) {
    document.querySelectorAll('.screen').forEach((sc) => { sc.hidden = sc.id !== `scr-${name}`; });
    this.current = name;
    if (this.app.pwa) this.app.pwa.screen(name);
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
        else if (action === 'daily') this.dailyScreen();
        else if (action === 'weekly') this.weeklyScreen();
        else if (action === 'profile') this.profileScreen();
        else if (action === 'gumball') app.gumballUI.open('title');
        else if (action === 'wheel') app.wheelHost.open('title');
        else if (action === 'about') app.safeUI.open('about');
        else if (action === 'story') app.startIntro();
        else { this.mode = action; this.charSelect(); }
        break;
      case 'char':
        if (action !== 'back' && this._charLock()) {
          // A locked racer is only a preview.
          app.audio.play('wall', 5);
          const l = document.querySelector('#scr-char .lockline');
          if (l) { l.classList.remove('shake'); void l.offsetWidth; l.classList.add('shake'); }
          break;
        }
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
        if (action === 'wheelpad') app.wheelPad.open();
        else if (action === 'sync') app.sync.open('settings');
        else if (action === 'school') app.startSchool('title');
        else if (['backup', 'restore', 'about', 'repair'].includes(action)) app.safeUI.open(action);
        else if (action === 'intro') {
          const from = this.returnTo;
          this.intro(() => this.overlay('settings', from));
        } else this.closeOverlay();
        break;
      case 'intro':
        this._introAction(action);
        break;
      case 'sync':
        app.sync.close();
        break;
      case 'backup':
      case 'about':
        app.safeUI.action(screen, action);
        break;
      case 'help':
        this.closeOverlay();
        break;
      case 'wheel':
        app.wheelHost.close();
        break;
      case 'pause':
        if (action === 'resume') app.resume();
        else if (action === 'rescue') app.rescuePlayer();
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
      case 'workshop':
        app.careerUI.workshopAction(action);
        break;
      case 'story':
        if (action === 'skip') app.careerUI.endStory();
        break;
      case 'daily':
        if (action === 'race') app.startDaily();
        else app.toTitle();
        break;
      case 'weekly':
        if (action === 'race') app.startWeekly();
        else app.toTitle();
        break;
      case 'challenge':
        if (action === 'race') app.startChallenge();
        else app.toTitle();
        break;
      case 'profile':
        if (action === 'sync') app.sync.open('title');
        else this.title();
        break;
      case 'gumball':
        app.gumballUI.action(action);
        break;
    }
  }

  overlay(name, from) {
    this.returnTo = from;
    if (name === 'settings') this._syncSettings();
    // Driving School and the intro replay start from menus, not mid-race.
    document.querySelectorAll('#scr-settings .no-pause').forEach((el) => { el.hidden = from === 'pause'; });
    this.show(name);
  }

  closeOverlay() {
    const to = this.returnTo || 'title';
    this.returnTo = null;
    this.show(to);
  }

  // ---------------- Title ----------------
  title() {
    $('scr-title').classList.toggle('first-run', !this.app.settings.introDone);
    this.refreshChip();
    this.show('title');
    if (this.app.pwa) this.app.pwa.onTitle();
  }

  // Level, coins and streak in the corner of the title screen.
  refreshChip() {
    const c = this.app.career;
    const lv = levelOf(c.xp || 0);
    const streak = dailyStreak(c);
    const ttl = profileTitle(c);
    $('pchip').innerHTML = `<b>Lv ${lv.level}</b>${ttl ? `<em class="ptitle">${ttl}</em>` : ''}<i class="pbar"><i style="width:${Math.round((lv.into / lv.need) * 100)}%"></i></i><span>🪙 ${c.coins.toLocaleString('en-US')}</span>${streak ? `<span>🔥 ${streak}</span>` : ''}`;
    const d = dailyFor();
    const done = dailyDoneToday(c);
    $('menu-daily').textContent = done ? `Done today ✓ · ${streak}-day streak` : `${d.mod.icon} ${d.mod.name} · +${150 + Math.round(dailyReward(streak + 1) / 2)} XP · 🍬`;
    document.querySelector('[data-go="daily"]').classList.toggle('done', done);
    const wk = weeklyFor(), wb = weeklyBest(c);
    $('menu-weekly').innerHTML = `${wk.mod.icon} ${wk.mod.name}<br>${timeLeftText()} · ${wb ? `best ${wb}${ordinal(wb).toLowerCase()}` : 'not raced'}`;
    document.querySelector('[data-go="weekly"]').classList.toggle('done', !!wb && wb <= 3);
    const nAch = Object.keys(c.ach || {}).length;
    this.missionsPanel();
    $('menu-trophies').textContent = `🏆 ${nAch}/${ACHIEVEMENTS.length}`;
    // A badge on the gumball button when a free turn is waiting.
    const free = c.freeCaps || 0;
    $('menu-gum').hidden = !free;
    $('menu-gum').textContent = free;
  }

  // Three daily missions with progress bars and the all-done streak flame.
  missionsPanel() {
    const c = this.app.career;
    const list = missionView(c);
    const left = list.filter((g) => !g.done).length;
    const streak = missionStreak(c);
    $('missions').innerHTML = `<div class="mis-head"><span>Daily missions${left ? '' : ' ✓'}</span><span title="Days in a row with all 3 done">${streak ? `<span class="fl">🔥</span> ${streak}` : ''}</span></div>`
      + list.map((g) => `<div class="mis${g.done ? ' done' : ''}"><span>${g.icon}</span><span class="mt">${g.text}</span><span class="mbar"><i style="width:${Math.round((g.prog / g.target) * 100)}%"></i></span><em>${g.done ? '+100' : `${g.prog}/${g.target}`}</em></div>`).join('')
      + `<div class="mis-head" style="font-size:11px;color:var(--muted)"><span>${left ? `${left} to go: +100 XP each, all 3 = free capsule 🍬` : 'All done! Free capsule earned. Back tomorrow.'}</span></div>`;
  }

  // The card a "beat my ghost" link opens with.
  challengeCard(c, text) {
    this._thumb($('chal-thumb'), [trackById(c.trackId)], c.reverse);
    $('chal-text').textContent = text;
    $('chal-sub').textContent = `${{ chill: 'Chill', zoom: 'Zoom', turbo: 'Turbo' }[c.speedClass]} speed. A see-through ghost drives their lap; cross the line first.`;
    this.app.previewTrack(c.trackId, c.reverse);
    this.show('challenge');
  }

  // ---------------- Daily challenge ----------------
  dailyScreen() {
    const c = this.app.career;
    const d = dailyFor();
    const def = trackById(d.track);
    this._thumb($('daily-thumb'), [def], d.rev);
    const streak = dailyStreak(c);
    const done = dailyDoneToday(c);
    $('daily-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    $('daily-icon').textContent = d.mod.icon;
    $('daily-mod').textContent = d.mod.name;
    $('daily-desc').textContent = d.mod.desc;
    const cls = { chill: 'Chill', zoom: 'Zoom', turbo: 'Turbo' }[d.cls];
    $('daily-facts').innerHTML = `<div><small>Track</small>${dailyTrackName(d)}</div><div><small>Goal</small>${dailyGoalText(d)}</div><div><small>Speed</small>${cls} · ${d.diff === 'hard' ? 'Hard' : 'Normal'} racers</div>`;
    const flames = Array.from({ length: 7 }, (_, i) => `<i class="${i < streak ? 'on' : ''}">🔥</i>`).join('');
    $('daily-streak').innerHTML = `<div class="flames">${flames}</div><span>${streak ? `${streak}-day streak` : 'Start a streak today'}${done ? ' · done today ✓' : ''}</span>`;
    $('daily-reward').innerHTML = done ? 'Completed! A new challenge arrives tomorrow. You can still race it for fun. Stock stats: Workshop parts are off here.' : `Reward: <b>+${150 + Math.round(dailyReward(streak + 1) / 2)} XP</b> and a <b>free prize capsule</b>. Longer streaks pay more XP. Stock stats: Workshop parts are off here.`;
    this.app.previewTrack(d.track, d.rev);
    this.show('daily');
  }

  // ---------------- Weekly Cup ----------------
  weeklyScreen() {
    const c = this.app.career;
    const w = weeklyFor();
    this._thumb($('weekly-thumb'), w.tracks.map(trackById), false);
    const best = weeklyBest(c), streak = weeklyStreak(c);
    const pl = (n) => `${n}${ordinal(n).toLowerCase()}`;
    $('weekly-date').textContent = `Week ${weekNum(w.week)} · ${timeLeftText()}`;
    $('weekly-icon').textContent = w.mod.icon;
    $('weekly-mod').textContent = w.mod.name;
    $('weekly-desc').textContent = w.mod.desc;
    const cls = { chill: 'Chill', zoom: 'Zoom', turbo: 'Turbo' }[w.cls];
    $('weekly-facts').innerHTML = `<div class="wide"><small>Tracks</small>${w.tracks.map((t) => trackById(t).name).join(' · ')}</div><div><small>Speed</small>${cls} · ${w.diff === 'hard' ? 'Hard' : 'Normal'}</div><div><small>Best this week</small>${best ? pl(best) : 'Not raced'}</div>`;
    const wt = (c.weekly && c.weekly.trophies.length) || 0;
    $('weekly-streak').innerHTML = `<span>${streak ? `🔥 ${streak} podium week${streak === 1 ? '' : 's'} in a row` : 'Finish on the podium to start a streak'}${wt ? ` · 🏅 ${wt} Weekly trophies` : ''}</span>`;
    $('weekly-reward').innerHTML = `Cup points like the Grand Prix. Retry all week: your <b>best</b> counts. XP: <b>${WEEKLY_XP.join(' / ')}</b> for 1st / 2nd / 3rd, ${WEEKLY_XP_BASE} for finishing (only for beating your best). First podium: a <b>Week ${weekNum(w.week)} trophy</b> and a free capsule 🍬. Stock stats: Workshop parts are off here.`;
    this.app.previewTrack(w.tracks[0], false);
    this.show('weekly');
  }

  // ---------------- Trophies ----------------
  profileScreen() {
    const app = this.app;
    const c = app.career;
    const lv = levelOf(c.xp || 0);
    const st = c.stats || {};
    const n = (k) => (Array.isArray(st[k]) ? st[k].length : st[k] || 0);
    const nAch = Object.keys(c.ach || {}).length;
    $('prof-count').textContent = `${nAch} of ${ACHIEVEMENTS.length} trophies`;
    $('prof-top').innerHTML = `<div class="lvbadge"><small>Level</small>${lv.level}</div>
      <div class="lvinfo">${profileTitle(c) ? `<div class="ptitle big">🏛️ ${profileTitle(c)}</div>` : ''}<div class="xpbar"><i style="width:${Math.round((lv.into / lv.need) * 100)}%"></i></div><small>${lv.into} / ${lv.need} XP to level ${lv.level + 1}</small>
      <div class="pstats"><span>🪙 ${c.coins.toLocaleString('en-US')}</span><span>🏁 ${n('races')} races</span><span>🥇 ${n('wins')} wins</span><span>🔥 best streak ${(c.daily && c.daily.best) || 0}</span><span>🎖️ ${medalCount(app.records)}/${medalMax()} medals</span></div></div>`;
    $('prof-extra').innerHTML = this.profileExtra(c);
    $('ach-grid').innerHTML = ACHIEVEMENTS.map((a) => {
      const got = !!(c.ach && c.ach[a.id]);
      const [cur, max] = a.prog(c, app.records);
      const pct = Math.round((Math.min(cur, max) / max) * 100);
      return `<div class="ach${got ? ' got' : ''}"><span class="ai">${a.icon}</span><span class="am"><b>${a.name}</b><small>${a.desc}</small>
        ${got ? '<em>Unlocked</em>' : `<span class="abar"><i style="width:${pct}%"></i></span><em>${cur.toLocaleString('en-US')} / ${max.toLocaleString('en-US')} · 🪙 ${a.reward}</em>`}</span></div>`;
    }).join('');
    this.show('profile');
  }

  // Weekly Cup badges and the mastery list (racers and rides with progress bars).
  profileExtra(c) {
    const w = c.weekly || { trophies: [] };
    const badges = w.trophies.slice(-12).reverse().map((k) => `<span class="wbadge">🏅 Week ${weekNum(k)}</span>`).join('');
    const weekly = `<div class="prof-sec"><b>Weekly Cup</b><span>${w.trophies.length} trophies · 🔥 ${weeklyStreak(c)} week streak</span></div><div class="wbadges">${badges || '<small>Finish a Weekly Cup on the podium to earn a Week badge.</small>'}</div>`;
    const rows = (kind, ids, name) => ids.map((id) => ({ id, ...masteryOf(c, kind, id), xp: ((c.mastery || {})[kind] || {})[id] || 0 })).filter((r) => r.xp > 0)
      .sort((a, b) => b.xp - a.xp).map((r) => {
        const title = kind === 'r' ? titleFor(r.id, r.level) : '';
        const nextT = r.level < 3 ? 3 : r.level < 6 ? 6 : 10;
        return `<div class="mrow"><span class="mst" style="--sc:${STAR_COLORS[r.level - 1] || 'transparent'}">★<b>${r.level}</b></span><span class="mm"><b>${name(r.id)}</b><small>${title || (kind === 'r' ? `Next title at level ${nextT}` : 'Ride mastery')}</small><i class="mbar2"><i style="width:${r.need ? Math.round((r.into / r.need) * 100) : 100}%"></i></i></span></div>`;
      }).join('');
    const rr = rows('r', RACER_IDS, (id) => charById(id).name), rb = rows('b', BODY_IDS, (id) => bodyById(id).name);
    const m = c.mastery || { capLevels: 0 };
    const mastery = `<div class="prof-sec"><b>Mastery</b><span>Free capsule every 5 levels · ${Math.floor(m.capLevels / 5)} earned</span></div>`
      + (rr || rb ? `<div class="mast-grid">${rr}${rb}</div>` : '<div class="wbadges"><small>Race with a racer or ride to start its mastery. Mastery never changes your stats.</small></div>');
    const ri = rankInfo(c);
    const league = c.champion ? `<div class="prof-sec"><b>Legends League</b><span>Legend Rank ${ri.rank} of ${MAX_RANK} · ★ ${ri.stars}/${LEAGUE_MAX_STARS}${ri.rank >= MAX_RANK ? ' · 🏆 Legend trophy' : ''}</span></div>` : '';
    return league + weekly + mastery;
  }

  // Mastery gained in a race: the racer and ride, level-ups with new titles, a capsule.
  masteryHtml(ms) {
    const name = (p) => (p.kind === 'r' ? charById(p.id).name : bodyById(p.id).name);
    let h = `<div class="rw-line rw-mast">★ Mastery +${ms.gain}: ${ms.parts.map((p) => `${esc(name(p))}${p.up ? ` ★${p.level}` : ''}`).join(' · ')}</div>`;
    for (const p of ms.parts) if (p.up) {
      const t = p.kind === 'r' && titleFor(p.id, p.level) !== titleFor(p.id, p.from) ? ` · new title <b>${titleFor(p.id, p.level)}</b>` : '';
      h += `<div class="rw-ach rw-mast">★ <b>${esc(name(p))}</b> reached mastery level ${p.level}${t}</div>`;
    }
    if (ms.caps) h += '<div class="rw-line rw-mis done">🍬 Free prize capsule for 5 mastery levels!</div>';
    return h;
  }

  // Coins, XP bar, level-ups and new trophies for a results screen.
  rewardsHtml(c, sum, achs = [], lines = []) {
    const lv = levelOf(c.xp || 0);
    const pct = Math.round((lv.into / lv.need) * 100);
    const coins = sum ? sum.coins : 0;
    // The bar and level start at the pre-race values; animateRewards() fills them in (or a tap skips to the end).
    const fr = (sum && sum.from) || { level: lv.level, pct };
    const top = sum ? `<div class="rw-top">${coins ? `<span class="rw-c">+${coins} 🪙</span>` : ''}<span class="rw-x">+${sum.xp} XP</span><span class="rw-l" data-lv="${lv.level}" data-lv0="${fr.level}">Lv ${lv.level}</span><span class="xpbar"><i data-from="${fr.pct}" data-to="${pct}" data-ups="${sum.ups.length}" style="width:${pct}%"></i></span></div>` : '';
    // Missions this race moved, and the closest goal to chase next.
    const mis = sum && sum.mis ? sum.mis.gained.map((g) => (g.justDone
      ? `<div class="rw-line rw-mis done">✓ ${g.icon} ${g.text} <span>+${MISSION_XP} XP</span></div>`
      : `<div class="rw-line rw-mis">${g.icon} ${g.text} <i class="mbar"><i style="width:${Math.round((g.prog / g.target) * 100)}%"></i></i> ${g.prog}/${g.target}</div>`)).join('')
      + (sum.mis.capsule ? `<div class="rw-line rw-mis done">🍬 All 3 missions done! Free prize capsule · 🔥 ${missionStreak(c)}-day streak</div>` : '') : '';
    const nu = sum ? nextUp(c, this.app.records) : null;
    const next = nu ? `<div class="rw-next"><small>NEXT UP</small>${nu.icon} ${nu.text}</div>` : '';
    const extra = lines.map((l) => `<div class="rw-line">${l}</div>`).join('');
    // What each new level brings: racers you can now hire and free capsules.
    const ups = sum && sum.ups.length ? sum.ups.map((L) => {
      const gets = CHARACTERS.filter((ch) => ch.lvl === L).map((ch) => `${ch.name} can be hired`);
      if ((sum.caps || []).includes(L)) gets.push('free gumball 🍬');
      return `<div class="rw-up">⭐ LEVEL ${L}!${gets.length ? ` · ${gets.join(' · ')}` : ''}</div>`;
    }).join('') : '';
    const md = sum && sum.medal ? `<div class="rw-ach rw-medal">${sum.medal.medal.icon} <b>${sum.medal.medal.name} medal!</b> · a new time target beaten <span>+${sum.medal.xp} XP</span></div>` : '';
    const ms = sum && sum.mastery ? this.masteryHtml(sum.mastery) : '';
    const ach = achs.map((a) => `<div class="rw-ach">🏆 ${a.icon} <b>${a.name}</b> · ${a.desc} <span>+${a.reward} 🪙</span></div>`).join('');
    return `<div class="rewards">${top}${extra}${md}${mis}${ms}${ups}${ach}${next}</div>`;
  }

  // A coloured mastery star with the level (nothing at level 1).
  _star(el, level) {
    el.textContent = level > 1 ? `★${level}` : '';
    el.style.setProperty('--sc', STAR_COLORS[level - 1] || 'transparent');
  }

  // ---------------- Characters ----------------
  charSelect() {
    const app = this.app;
    $('char-mode').textContent = { gp: 'Grand Prix', quick: 'Quick Race', tt: 'Time Trial', mp: 'Multiplayer', battle: 'Balloon Battle' }[this.mode];
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
        b.innerHTML = `<img alt="" src="${app.portraits[ch.id] || ''}"><span class="nm">${ch.name}</span><span class="lk"></span><span class="ms"></span>`;
        b.addEventListener('click', () => {
          app.firstGesture('char');
          app.audio.play('select');
          this.pickChar(ch.id);
        });
        grid.appendChild(b);
      }
    }
    app.showShowroom();
    $('veh-pop').hidden = true;
    // Lock badges for racers that need a higher level (or hiring in the career).
    const lvl = levelOf((app.career && app.career.xp) || 0).level;
    grid.querySelectorAll('.card').forEach((c) => {
      const ch = charById(c.dataset.id);
      const lock = charLocked(ch.id, lvl, app.career);
      c.classList.toggle('locked', !!lock);
      c.querySelector('.lk').textContent = lock ? '🔒 Career' : ch.lvl ? 'NEW' : '';
      this._star(c.querySelector('.ms'), masteryOf(app.career, 'r', ch.id).level);
    });
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
    const mr = masteryOf(this.app.career, 'r', ch.id), ti = titleFor(ch.id, mr.level);
    $('ci-mast').innerHTML = `<span class="mst" style="--sc:${STAR_COLORS[mr.level - 1] || 'rgba(255,255,255,.35)'}">★</span> Mastery ${mr.level}${ti ? ` · <b>${ti}</b>` : mr.level < 3 ? ' · title at level 3' : ''}`;
    const lock = this._charLock();
    $('ci-tag').innerHTML = lock ? `${ch.tagline}<br><b class="lockline">🔒 ${lock}</b>` : ch.tagline;
    document.querySelector('#scr-char [data-go="next"]').classList.toggle('dim', !!lock);
    $('ci-stats').innerHTML = STAT_NAMES.map(([k, n]) =>
      `<span>${n}</span><div class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= ch.stats[k] ? 'on' : ''}"></i>`).join('')}</div>`).join('');
    this._syncVehicle();
  }

  _charLock() {
    const app = this.app;
    return charLocked(app.settings.char, levelOf((app.career && app.career.xp) || 0).level, app.career);
  }

  // The ride for quick races, cups, time trials and online (see app.menuLoadout).
  _syncVehicle(preview = null) {
    const id = this.app.menuLoadout().body;
    const b = bodyById(id);
    $('veh-ic').textContent = bodyIcon(b);
    const bl = masteryOf(this.app.career, 'b', id).level;
    $('veh-nm').textContent = bl > 1 ? `${b.name} ★${bl}` : b.name;
    document.querySelectorAll('#vp-grid .vcard').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
    if (this.app.showroom) this.app.showroom.setChar(charById(this.app.settings.char), { body: preview || id });
  }

  _vehiclePicker(open) {
    const app = this.app;
    const pop = $('veh-pop');
    pop.hidden = !open;
    if (!open) { this._syncVehicle(); return; }
    const lvl = levelOf((app.career && app.career.xp) || 0).level;
    const grid = $('vp-grid');
    grid.innerHTML = '';
    const note = $('vp-note');
    note.className = '';
    note.textContent = 'Five rides are free. Buy the rest in the Career Garage, then use them everywhere.';
    const bar = (v) => `<i><b style="width:${Math.round(clamp((3 + v * 1.4) / 5, 0.1, 1) * 100)}%"></b></i>`;
    for (const b of BODY_LIST) {
      const lock = bodyLocked(b.id, app.career, lvl);
      const el = document.createElement('button');
      el.className = 'vcard' + (lock ? ' locked' : '');
      el.dataset.id = b.id;
      el.innerHTML = `${FREE_BODIES.includes(b.id) ? '<span class="vf">FREE</span>' : ''}<span class="vi">${bodyIcon(b)}</span>${b.name}<span class="ms"></span><span class="vs">${bar(b.stats.speed)}${bar(b.stats.accel)}${bar(b.stats.handling)}</span>`;
      el.addEventListener('click', () => {
        if (lock) {
          app.audio.play('wall', 5);
          note.className = 'warn';
          note.textContent = `${b.name} is locked: ${lock}.`;
          this._syncVehicle(b.id);
          return;
        }
        app.audio.play('select');
        app.settings.vehicle = b.id;
        saveSettings(app.settings);
        this._vehiclePicker(false);
      });
      if (!lock) this._star(el.querySelector('.ms'), masteryOf(app.career, 'b', b.id).level);
      grid.appendChild(el);
    }
    this._syncVehicle();
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
      if (def.arena) {
        // An arena: the whole bowl floor round its island.
        const hw = tr.hw[0];
        const sa = Math.min((cw - 24) / (b.maxX - b.minX + hw * 2), (chh - 24) / (b.maxZ - b.minZ + hw * 2));
        const cx = x0 + cw / 2, cy = y0 + chh / 2;
        c.beginPath();
        for (let i = 0; i <= tr.N; i += 3) {
          const k = i % tr.N;
          const x = cx - (tr.px[k] - tr.center.x) * sa, y = cy - (tr.pz[k] - tr.center.z) * sa;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.closePath();
        c.strokeStyle = '#1d1537'; c.lineWidth = hw * 2 * sa + 8; c.stroke();
        c.strokeStyle = '#fff7e8'; c.lineWidth = hw * 2 * sa; c.stroke();
        c.font = '26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('🎈', cx, cy);
        return;
      }
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
    const battle = this.mode === 'battle';
    $('track-title').textContent = gp ? 'Pick a cup' : battle ? 'Pick an arena' : 'Pick a track';
    $('reverse-wrap').hidden = gp || battle;
    $('class-seg').hidden = this.mode === 'tt';
    $('diff-seg').hidden = this.mode === 'tt';
    $('reverse').checked = !!this.app.settings.reverse;
    $('ws-line').textContent = this.mode === 'tt' ? 'Stock stats and no track events in this mode, so records stay fair' : this.app.workshopOn() ? 'Workshop parts: on' : 'Workshop parts: off (Settings)';
    this._syncClass();
    this._renderTrackCards();
    this.show('track');
    if (gp) {
      const cup = CUPS.find((c) => c.id === this.app.settings.cup) || CUPS[0];
      this.app.previewTrack(cup.tracks[0], cup.reverse);
    } else if (battle) {
      this.app.previewTrack(arenaById(this.app.settings.arena) ? this.app.settings.arena : ARENAS[0].id, false);
    } else {
      this.app.previewTrack(this.app.settings.track, this.app.settings.reverse);
    }
  }

  // The event chip of a card ('⛈ Events: Normal · ...'); Time Trial and its medals always run without events.
  _evLine(ids) {
    const defs = evDefs(ids);
    if (!defs.length) return '';
    if (this.mode === 'tt') return '<span class="tb evc">⛈ No events in Time Trial: records stay fair</span>';
    return `<span class="tb evc${this.app.settings.trackEvents === 'wild' ? ' wild' : ''}">${esc(evChip(ids, this.app.settings.trackEvents || 'normal'))}</span>`;
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
        tx.innerHTML = `<span class="tn">${cup.name}</span><span class="tb">${cup.reverse ? 'All 4 tracks, reversed' : 'All 4 tracks'}${best ? ` · Best: ${best}` : ''}</span>${this._evLine(cup.tracks)}`;
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
    if (this.mode === 'battle') {
      if (!arenaById(app.settings.arena)) app.settings.arena = ARENAS[0].id;
      for (const def of ARENAS) {
        const b = document.createElement('button');
        b.className = 'tcard' + (app.settings.arena === def.id ? ' sel' : '');
        const cv = document.createElement('canvas');
        this._thumb(cv, [def], false);
        b.appendChild(cv);
        const wins = ((app.records.battle || {})[def.id]) || 0;
        const tx = document.createElement('div');
        tx.className = 'tx';
        tx.innerHTML = `<span class="tn">${def.name}</span><span class="tb"><span class="tz Arena">Arena</span>🎈 ${BATTLE_FIELD} racers${wins ? ` · 🏆 ${wins} win${wins > 1 ? 's' : ''}` : ''}</span>${this._evLine(def.id)}<span class="tb">${def.blurb}</span>`;
        b.appendChild(tx);
        b.addEventListener('click', () => {
          app.audio.play('select');
          app.settings.arena = def.id;
          saveSettings(app.settings);
          row.querySelectorAll('.tcard').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          app.previewTrack(def.id, false);
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
      const tier = !rev && rec ? medalTier(def.id, rec.tt) : 0, mt = rev ? null : medalTimes(def.id);
      const nSc = (def.shortcuts || []).length;
      const nFound = ((app.records.found || {})[def.id] || []).length;
      const tx = document.createElement('div');
      tx.className = 'tx';
      tx.innerHTML = `<span class="tn">${def.name}</span><span class="tb"><span class="tz ${def.size}">${def.size}</span>${def.legs ? `1 lap · ${def.legs.length} legs · 🚗⛵✈️` : `${def.laps || 3} laps`}${rec && rec.tt ? ` · Best ${fmtTime(rec.tt)}${tier ? ` ${MEDALS[tier - 1].icon}` : ''}` : ''}</span>${this.mode === 'tt' && mt ? `<span class="tb medals">${mt.map((t, i) => `<span class="${tier > i ? 'got' : ''}">${MEDALS[i].icon}${fmtTime(t).replace(/^0:/, '')}</span>`).join('')}</span>` : ''}<span class="tb sc${nFound >= nSc ? ' all' : ''}">🔍 Shortcuts ${nFound}/${nSc}</span>${this._evLine(def.id)}<span class="tb">${def.blurb}</span>`;
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
    $('veh-btn').addEventListener('click', () => {
      app.audio.play('select');
      this._vehiclePicker($('veh-pop').hidden);
    });
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
    $('set-steer-desk').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      app.audio.play('select');
      if (b.dataset.v === 'wheel') app.wheelHost.open('settings');
      else {
        s().steering = 'keys';
        saveSettings(s());
        this._syncSettings();
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
    $('set-assist').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      app.audio.play('select');
      s().assist = b.dataset.v;
      saveSettings(s());
      this._syncSettings();
    });
    $('set-shake').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      app.audio.play('select');
      s().shake = b.dataset.v;
      saveSettings(s());
      this._syncSettings();
    });
    for (const [id, key] of [['set-events', 'trackEvents'], ['set-evwarn', 'evWarn']]) {
      $(id).addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        app.audio.play('select');
        s()[key] = b.dataset.v;
        saveSettings(s());
        this._syncSettings();
      });
    }
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
    $('set-musicvol').addEventListener('input', (e) => { s().musicVol = +e.target.value; app.audio.setMusicVolume(s().musicVol); saveSettings(s()); });
    $('set-sfx').addEventListener('change', (e) => { s().sfx = e.target.checked; app.audio.setSfx(s().sfx); saveSettings(s()); });
    $('set-sfxvol').addEventListener('input', (e) => { s().sfxVol = +e.target.value; app.audio.setSfxVolume(s().sfxVol); saveSettings(s()); });
    $('set-ws').addEventListener('change', (e) => { s().workshopParts = e.target.checked; saveSettings(s()); });
    $('set-fps').addEventListener('change', (e) => { s().showFps = e.target.checked; $('fps').hidden = !s().showFps; saveSettings(s()); });
    $('set-reset-career').addEventListener('click', () => {
      if (!confirm('Start over? Your level, coins, trophies, karts, racers and career progress will be lost.')) return;
      app.resetCareer();
      app.audio.play('uiBack');
      $('set-reset-career').textContent = 'Done';
    });
  }

  _syncSettings() {
    const s = this.app.settings;
    document.querySelectorAll('#set-steer [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === s.steering));
    const wheelOn = this.app.wheelHost && this.app.wheelHost.live;
    document.querySelectorAll('#set-steer-desk [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (wheelOn ? 'wheel' : 'keys')));
    document.querySelectorAll('#set-quality [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === s.quality));
    document.querySelectorAll('#set-tags [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.tags || 'all')));
    document.querySelectorAll('#set-assist [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.assist || 'off')));
    document.querySelectorAll('#set-shake [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.shake || 'normal')));
    document.querySelectorAll('#set-events [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.trackEvents || 'normal')));
    document.querySelectorAll('#set-evwarn [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.evWarn || 'full')));
    $('set-sens').value = s.tiltSens;
    $('set-invert').checked = s.invertTilt;
    $('set-music').checked = s.music;
    $('set-musicvol').value = s.musicVol ?? 0.7;
    $('set-sfx').checked = s.sfx;
    $('set-sfxvol').value = s.sfxVol ?? 1;
    $('set-persist').textContent = this.app.pwa ? this.app.pwa.persistLabel : 'unknown';
    $('set-fps').checked = s.showFps;
    $('set-ws').checked = s.workshopParts !== false;
    $('set-reset-career').textContent = 'Reset';
    $('set-about').textContent = this.app.versionInfo;
  }

  // ---------------- First-run intro ----------------
  // One screen: on a phone a live tilt check with "Set level" and a touch
  // fallback (picked for you if motion access is refused or silent for 2 s);
  // on a computer the keyboard controls. done() runs on "Let's go!".
  intro(done) {
    const app = this.app;
    this._intro = { done, t0: performance.now() };
    $('scr-intro').querySelector('.intro').classList.remove('touchsteer');
    $('intro-title').textContent = 'Hold your phone like a steering wheel';
    $('intro-status').textContent = 'Turn it left and right: the dot follows. Hold it straight and tap Set level.';
    if (isTouch) {
      app.settings.steering = 'tilt';
      // Asked from inside the tap that opened this screen (iOS permission rules).
      app.input.requestTilt().then((ok) => { if (!ok) this._introTouch('Motion access is off, so touch steering is on.'); });
    }
    this.show('intro');
  }

  _introTouch(msg) {
    const app = this.app;
    app.settings.steering = 'touch';
    saveSettings(app.settings);
    app.applyControls();
    $('scr-intro').querySelector('.intro').classList.add('touchsteer');
    $('intro-title').textContent = 'Steer with your thumb';
    $('intro-status').textContent = `${msg} Drag on the left side of the screen to steer.`;
  }

  _introAction(action) {
    const app = this.app, inp = app.input;
    if (action === 'level') {
      app.settings.tiltZero = inp.tilt.angle;
      saveSettings(app.settings);
      $('intro-status').textContent = 'Level set ✓ Now turn it like a wheel.';
    } else if (action === 'touch') this._introTouch('Touch steering is on.');
    else if (action === 'go') {
      app.settings.introDone = true;
      saveSettings(app.settings);
      const done = this._intro && this._intro.done;
      this._intro = null;
      if (done) done();
    }
  }

  tick() {
    if (this.current === 'intro' && this._intro && isTouch && this.app.settings.steering === 'tilt') {
      const inp = this.app.input;
      const v = inp.tilt.listening ? inp.tiltSteer() : 0;
      $('intro-dot').style.transform = `translateX(${v * 100}px)`;
      $('intro-wheel').style.transform = `rotate(${90 + v * 40}deg)`;
      // No motion events within 2 seconds (real time): fall back to touch steering.
      if (!inp.tiltLive && performance.now() - this._intro.t0 > 2000) this._introTouch('No motion sensor found, so touch steering is on.');
    }
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
    const tip = !error && view === 'start' ? this.app.coach.lobbyTip() : '';
    $('lobby-error').textContent = error || tip;
    $('lobby-error').classList.toggle('tip', !!tip);
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
    $('lobby-ws').textContent = app.workshopOn() ? 'Workshop parts: on (your kart only)' : 'Workshop parts: off (Settings)';
    const cfg = ses.lobby;
    const def = trackById(cfg.track);
    // The host's picker runs through the tracks, then the battle arenas.
    const label = def.arena ? `🎈 ${def.name}` : `${def.name}${cfg.reverse ? ' ⟲' : ''}`;
    const cls = { chill: 'Chill', zoom: 'Zoom', turbo: 'Turbo' }[cfg.speedClass];
    const dif = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[cfg.difficulty];
    if (ses.isHost) {
      $('lobby-status').textContent = `${ses.players.length} of 4 players`;
      $('lobby-settings').innerHTML = `
        <div class="row"><span class="lbl">${def.arena ? 'Battle' : 'Track'}</span><div class="picker"><button data-lb="track-prev" aria-label="Previous track">◀</button><span>${label}</span><button data-lb="track-next" aria-label="Next track">▶</button></div></div>
        <div class="row"><span class="lbl">Speed</span><div class="seg">${['chill', 'zoom', 'turbo'].map((c) => `<button data-lb="cls-${c}" class="${cfg.speedClass === c ? 'on' : ''}">${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div></div>
        <div class="row"><span class="lbl">Computer racers</span><div class="seg">${['off', 'easy', 'normal', 'hard'].map((d) => `<button data-lb="ai-${d}" class="${(d === 'off' ? !cfg.ai : cfg.ai && cfg.difficulty === d) ? 'on' : ''}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div></div>
        ${def.arena ? '' : `<div class="row"><span class="lbl">Reverse</span><label class="toggle"><input type="checkbox" data-lb="reverse" ${cfg.reverse ? 'checked' : ''} aria-label="Reverse"></label></div>`}`;
      $('lobby-buttons').innerHTML = `<button class="btn ghost small" data-go="leave">Leave</button><button class="btn alt small" data-go="char">Change racer</button><button class="btn hot" data-go="start" ${ses.players.length < 2 ? 'disabled style="opacity:.5"' : ''}>${def.arena ? 'Start battle' : 'Start race'}</button>`;
    } else {
      $('lobby-status').textContent = 'Connected';
      $('lobby-settings').innerHTML = `<div class="lobby-summary">${def.arena ? `Balloon Battle: <b>${def.name}</b>` : `Track: <b>${def.name}${cfg.reverse ? ' (reverse)' : ''}</b>`}<br>Speed: <b>${cls}</b><br>Computer racers: <b>${cfg.ai ? dif : 'Off'}</b><br><br>The host picks the track and starts the race.</div>`;
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
        const all = [...TRACKS, ...ARENAS];
        const idx = all.findIndex((t) => t.id === L.track);
        if (v === 'track-prev') app.session.setLobby({ track: all[(idx - 1 + all.length) % all.length].id });
        else if (v === 'track-next') app.session.setLobby({ track: all[(idx + 1) % all.length].id });
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
    this.animateRewards();
  }

  // The XP bar fills from where it was (through a level-up if there is one) in about a second.
  // Never blocks anything: the buttons work throughout and a tap on the rewards jumps to the end.
  animateRewards() {
    (this._rwT || []).forEach(clearTimeout);
    this._rwT = [];
    this._rwSkip = null;
    const bar = document.querySelector('#res-body .xpbar i[data-to]');
    const lbl = document.querySelector('#res-body .rw-l[data-lv]');
    if (!bar || !lbl) return;
    const to = +bar.dataset.to, from = +bar.dataset.from, ups = +bar.dataset.ups;
    if (!ups && from === to) return;
    const set = (w, ms) => { bar.style.transition = ms ? `width ${ms}ms ease-out` : 'none'; bar.style.width = `${w}%`; };
    const fin = () => {
      (this._rwT || []).forEach(clearTimeout);
      set(to, 0);
      lbl.textContent = `Lv ${lbl.dataset.lv}`;
      lbl.classList.remove('pop');
      this._rwSkip = null;
    };
    this._rwSkip = fin;
    $('res-body').onclick = () => this._rwSkip && this._rwSkip();
    set(from, 0);
    lbl.textContent = `Lv ${lbl.dataset.lv0}`;
    const T = (f, ms) => this._rwT.push(setTimeout(f, ms));
    T(() => set(ups ? 100 : to, ups ? 700 : 900), 60);
    if (ups) {
      T(() => { lbl.textContent = `Lv ${lbl.dataset.lv}`; lbl.classList.add('pop'); set(0, 0); }, 800);
      T(() => set(to, 700), 900);
      T(() => lbl.classList.remove('pop'), 1700);
    }
  }

  // Balloon Battle result cells: balloons left, OUT, or DOWN for a racer still waiting for
  // the one comeback when time ran out (alive with no balloons; no extra network field needed).
  battleCell(r) {
    const left = r.out ? 'OUT' : r.balloons > 0 ? '🎈'.repeat(r.balloons) : 'DOWN';
    return `<span class="plus${left === 'DOWN' ? ' down' : ''}">${left}</span><span class="pts">💥 ${r.hits || 0}</span>`;
  }

  row(r, extra = '') {
    const img = this.app.portraits[r.ch.id] || '';
    const name = r.nick ? `<span class="nk">${esc(r.nick)}<small>${r.ch.name}</small></span>` : `<span>${r.ch.name}</span>`;
    return `<div class="res${r.isPlayer ? ' me' : ''}"><span class="p">${r.place}${ordinal(r.place).toLowerCase()}</span><img alt="" src="${img}">${name}${extra}</div>`;
  }
}
