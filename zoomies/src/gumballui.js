import { charById } from './characters.js';
import { paintById, saveCareer } from './career.js';
import { checkAchievements } from './profile.js';
import { KINDS, RARITY, CAPSULE_PRICE, spinGumball, owns, ownedCount, COSMETIC_TOTAL, hatById, trailById, hornById, cosmeticById } from './cosmetics.js';
import { rollJackpot, JACKPOT_CHANCE } from './prizes.js';

const $ = (id) => document.getElementById(id);
const BALLS = ['#ff5a8a', '#ffd23f', '#36a9ff', '#19e3b1', '#c77dff', '#ff8a3a', '#ffffff', '#7dff9a'];

// The gumball machine: spend coins (or free capsules from levelling up) on
// random hats, boost trails and horns, then pick what to wear. A rare
// jackpot gives a real prize instead: a racer, a ride, paint, an upgrade
// or a pile of coins.
export class GumballUI {
  constructor(app) {
    this.app = app;
    this.tab = 'machine';
    this.from = 'title';
    this.busy = false;
    this.last = null;
    $('gum-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b || this.busy) return;
      this.app.audio.play('select');
      this.tab = b.dataset.tab;
      this.render();
    });
    $('gum-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cos]');
      if (!b || this.busy) return;
      this.pick(b.dataset.cos);
    });
  }

  get c() { return this.app.career; }

  open(from = 'title') {
    this.from = from;
    this.tab = 'machine';
    this.last = null;
    this.busy = false;
    this.app.showShowroom();
    this._showKart();
    this.render();
    this.app.ui.show('gumball');
  }

  _showKart() {
    const c = this.c;
    this.app.showroom.setChar(charById(c.racer), { body: c.body, paint: paintById(c.paint).color, hat: c.hat });
  }

  // Show off a jackpot in the showroom (without changing your selection).
  _showJackpot(it) {
    const c = this.c;
    const o = { body: c.body, paint: paintById(c.paint).color, hat: c.hat };
    let ch = charById(c.racer);
    if (it.prize === 'racer') ch = charById(it.ref);
    else if (it.prize === 'body') o.body = it.ref;
    else if (it.prize === 'paint') o.paint = paintById(it.ref).color;
    this.app.showroom.setChar(ch, o);
  }

  action(a) {
    if (a === 'back') {
      if (this.busy) return;
      if (this.from === 'career') this.app.openCareer();
      else this.app.toTitle();
    } else if (a === 'act') this.spin();
    else if (a === 'wear' && this.last) this.pick(this.last.item.id, true);
  }

  render() {
    const c = this.c;
    document.querySelectorAll('#gum-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    $('gum-coins').textContent = c.coins.toLocaleString('en-US');
    $('gum-count').textContent = `${ownedCount(c)} / ${COSMETIC_TOTAL} collected`;
    const h = hatById(c.hat), t = trailById(c.trail), n = hornById(c.horn);
    $('gum-wearing').innerHTML = `<span>${h.icon} ${h.name}</span><span>${t.icon} ${t.name}</span><span>${n.icon} ${n.name}</span>`;
    const free = c.freeCaps || 0;
    const act = $('gum-act');
    act.textContent = free ? `Free turn! (${free})` : `Turn 🪙 ${CAPSULE_PRICE}`;
    act.classList.toggle('dim', !free && c.coins < CAPSULE_PRICE);
    const body = $('gum-body');
    if (this.tab === 'machine') {
      if (!body.querySelector('.gmachine')) body.innerHTML = this._machineHtml();
      this._reveal();
      return;
    }
    const kind = KINDS.find((k) => k.id === this.tab);
    body.innerHTML = `<div class="cos-grid">${kind.list.map((it) => {
      const own = owns(c, it.id);
      const on = c[kind.slot] === it.id;
      const r = RARITY[it.rarity];
      const sw = kind.id === 'trail' && own ? `<span class="tsw">${it.cols.map((col) => `<i style="background:${col}"></i>`).join('')}</span>` : '';
      return `<button class="cos${own ? '' : ' locked'}${on ? ' on' : ''}" data-cos="${it.id}" style="--r:${r.color}">
        <span class="ci">${own ? it.icon : '❔'}</span><span class="cn">${own ? it.name : r.name}</span>${sw}${on ? '<em>On</em>' : ''}</button>`;
    }).join('')}</div>`;
  }

  _machineHtml() {
    let balls = '';
    for (let i = 0; i < 22; i++) {
      const a = (i * 137.5 * Math.PI) / 180, rr = 8 + ((i * 29) % 34);
      const x = 50 + Math.cos(a) * rr * 0.95, y = 58 + Math.sin(a) * rr * 0.8;
      balls += `<i style="left:${x.toFixed(1)}%;top:${Math.min(80, y).toFixed(1)}%;background:${BALLS[i % BALLS.length]}"></i>`;
    }
    // Cosmetic odds share what the jackpot leaves.
    const tiers = Object.values(RARITY).filter((r) => r.weight > 0), total = tiers.reduce((a, r) => a + r.weight, 0);
    const pct = (v) => `${Math.max(1, Math.round(v * 100))}%`;
    const odds = tiers.map((r) => `<span style="color:${r.color}">${r.name} ${pct((r.weight / total) * (1 - JACKPOT_CHANCE))}</span>`).join('')
      + `<span style="color:${RARITY.jackpot.color}">Jackpot ${pct(JACKPOT_CHANCE)}</span>`;
    return `<div class="gwrap"><div class="gmachine" id="gmachine">
        <div class="globe"><div class="balls">${balls}</div><div class="shine"></div></div>
        <div class="gneck"></div>
        <div class="gbase"><div class="coin-slot"></div><div class="crank"><b></b></div><div class="chute"></div></div>
        <div class="capsule" id="gcap"><i></i></div>
      </div>
      <div class="greveal" id="greveal"></div></div>
      <div class="godds">${odds}</div>`;
  }

  _reveal() {
    const el = $('greveal');
    if (!el) return;
    const L = this.last;
    if (!L) {
      el.className = 'greveal idle';
      el.innerHTML = `<b>Win hats, boost trails and horns!</b><small>Rare jackpots hold real prizes: racers, karts, bikes, paint, upgrades and coins. Every 5th level and the daily reward give a free turn.</small>`;
      return;
    }
    const it = L.item, r = RARITY[it.rarity];
    if (L.jackpot) {
      el.className = 'greveal show jackpot legendary';
      el.style.setProperty('--r', r.color);
      el.innerHTML = `<span class="ri">${it.icon}</span><span class="rm"><small style="color:${r.color}">🎰 JACKPOT!</small><b>${it.name}</b>
        <em class="new">${it.note}</em></span>`;
      return;
    }
    const kindName = { hat: 'Hat', trail: 'Boost trail', horn: 'Horn' }[it.kind];
    const worn = this.c[KINDS.find((k) => k.id === it.kind).slot] === it.id;
    el.className = `greveal show ${it.rarity}`;
    el.style.setProperty('--r', r.color);
    el.innerHTML = `<span class="ri">${it.icon}</span><span class="rm"><small style="color:${r.color}">${r.name} ${kindName}</small><b>${it.name}</b>
      ${L.dup ? `<em>Already had it · +${L.refund} 🪙</em>` : '<em class="new">NEW!</em>'}</span>
      ${worn ? '<span class="rw">Wearing</span>' : `<button class="btn small mint" data-go="wear">${it.kind === 'horn' ? 'Use' : 'Wear'}</button>`}`;
  }

  _note(text) {
    const el = $('gum-note');
    el.textContent = text;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  pick(id, fromReveal = false) {
    const c = this.c;
    const it = cosmeticById(id);
    if (!it) return;
    if (!owns(c, id)) {
      this.app.audio.play('uiBack');
      this._note(`Win it from the gumball machine (${RARITY[it.rarity].name})`);
      return;
    }
    const kind = KINDS.find((k) => k.id === it.kind);
    c[kind.slot] = id;
    saveCareer(c);
    if (it.kind === 'horn') this.app.audio.horn(id);
    else this.app.audio.play('select');
    if (it.kind === 'hat') this._showKart();
    if (it.kind === 'trail') this.app.showroom.bounce = 1;
    this.render();
    if (fromReveal) this._reveal();
  }

  spin() {
    if (this.busy) return;
    const c = this.c;
    if (this.tab !== 'machine') {
      this.tab = 'machine';
      this.render();
    }
    if (!(c.freeCaps > 0) && c.coins < CAPSULE_PRICE) {
      this.app.audio.play('uiBack');
      this._note('Not enough coins. Earn more in the Career!');
      return;
    }
    const res = spinGumball(c, Math.random, rollJackpot);
    if (!res) return;
    const achs = checkAchievements(c, this.app.records);
    saveCareer(c);
    this.busy = true;
    this.last = null;
    this._reveal();
    const m = $('gmachine'), cap = $('gcap');
    const r = RARITY[res.item.rarity];
    cap.style.setProperty('--r', r.color);
    m.classList.remove('spin', 'drop', 'pop');
    void m.offsetWidth;
    m.classList.add('spin');
    this.app.audio.play('crank');
    $('gum-act').classList.add('dim');
    setTimeout(() => {
      m.classList.add('drop');
      this.app.audio.play('capsule');
    }, 800);
    setTimeout(() => {
      m.classList.add('pop');
      this.app.audio.play('reveal', res.jackpot ? 'legendary' : res.item.rarity);
      this.last = res;
      this.busy = false;
      this.render();
      // A new hat goes straight on so you can see it.
      if (res.jackpot) this._showJackpot(res.item);
      if (!res.dup && res.item.kind === 'hat') this.pick(res.item.id, true);
      if (!res.dup && res.item.kind === 'horn') this.app.audio.horn(res.item.id, 0.5);
      if (res.item.rarity === 'legendary' || res.item.rarity === 'epic' || res.jackpot) this.app.showroom.bounce = 1;
      if (achs.length) this._note(achs.map((a) => `🏆 ${a.name} +${a.reward} 🪙`).join(' · '));
      if (achs.length) this.render();
    }, 1700);
  }
}
