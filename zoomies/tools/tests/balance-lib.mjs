// Headless AI-only balance harness, shared by tools/balance.mjs (full report)
// and tests/balance-check.mjs (band asserts). Runs 8-kart races with the player
// kart driven by the AI too, collects per-race stats inside the page and
// aggregates them here. Math.random is replaced by a seeded generator, so a
// (track, difficulty, seed) race is repeatable.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

// Always our own server on a free port: whatever is on port 8000 may serve another checkout.
async function serve() {
  const srv = http.createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try {
      const body = await readFile(join(root, path === '/' ? '/index.html' : path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => srv.listen(0, ok));
  return { port: srv.address().port, close: () => srv.close() };
}

export const DEFAULT_TRACKS = ['sprout', 'coral', 'dunes', 'frost', 'candy', 'neon', 'tidal', 'hollow', 'gear', 'cloud'];

// Runs the races and returns one record per race.
export async function runRaces({ tracks = DEFAULT_TRACKS, diffs = ['normal', 'hard'], n = 3, seed = 1, kit = null, events = 'off', log = () => {} } = {}) {
  const srv = await serve();
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true })).newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://localhost:${srv.port}/index.html`);
  await p.waitForFunction(() => window.zoomies && window.zoomies.race, null, { timeout: 30000 });
  const recs = [];
  for (const diff of diffs) for (const tid of tracks) for (let i = 0; i < n; i++) {
    const rs = seed * 1000 + i * 7 + tracks.indexOf(tid) * 131 + (diff === 'hard' ? 17 : 0);
    const t0 = Date.now();
    const r = await p.evaluate(simRace, { tid, diff, seed: rs, kit, events });
    r.track = tid; r.diff = diff; r.seed = rs;
    recs.push(r);
    log(`${diff} ${tid} #${i} winner place-start ${r.winnerStart + 1}, gap ${r.gapLast.toFixed(1)}s, ${r.overtakes} overtakes, ${r.hits} hits (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  // The odds tables by place, straight from the game code.
  recs.odds = await p.evaluate(async () => {
    const { rollTable } = await import('./src/items.js');
    return [1, 2, 3, 4, 5, 6, 7, 8].map((pl) => rollTable(pl, 8));
  });
  await b.close();
  srv.close();
  return recs;
}

// ---- runs inside the page ----
async function simRace({ tid, diff, seed, kit, events }) {
  let st = seed >>> 0;
  Math.random = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const app = window.zoomies;
  const { AIDriver } = await import('./src/ai.js');
  const { CHARACTERS } = await import('./src/characters.js');
  const ids = CHARACTERS.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const grid = ids.slice(0, 8);
  const pi = Math.floor(Math.random() * 8);
  app.paused = true;
  app.settings.trackEvents = events; // track events: off (the baseline), normal or wild
  app.startRace({ mode: 'quick', trackId: tid, reverse: false, player: grid[pi], grid, speedClass: 'zoom', difficulty: diff, playerLoadout: kit ? { body: kit.body, upgrades: { parts: kit.parts } } : undefined }); // kit: the player's ride and Workshop parts
  app.paused = true;
  const race = app.race;
  race.skipIntro = true;
  race.results = []; // truthy: the results screen and podium must not start while the others finish
  // The "human" is driven by the computer too, at the top of the Normal skill range.
  race.player.ai = new AIDriver(race.player, race, 0.95, race.diff);
  const ks = race.karts, N = ks.length, L = race.track.length, LAPS = race.laps;
  const KIND = { chili: 'self', chili3: 'self', rainbow: 'self', rocket: 'self', warp: 'self', ghost: 'self', pogo: 'self', mirror: 'self', magnet: 'self', gems: 'self', bubble: 'self' };
  const isItem = (h) => h.cause !== 'obstacle' && h.cause !== '?'; // not scenery and not kart-on-kart bumps
  const hits = [], gives = [], uses = [], pend = [], gainList = [];
  const blocked = [];
  let lastEv = null, cur = null; // which item is acting right now, for blaming hits
  const wrap = (obj, name, fn) => { const o = obj[name].bind(obj); obj[name] = (...a) => fn(o, ...a); };
  const place = (k) => k.place;
  for (const k of ks) wrap(k, 'hit', (o, kind) => {
    const pl = place(k), ev = { cause: cur || '?', victim: k.index, place: pl, t: race.raceTime, kind, shield: k.shield > 0 };
    const ok = o(kind);
    lastEv = ev;
    if (ok) { hits.push(ev); pend.push({ ev, k, due: race.raceTime + 4, kind: 'loss' }); }
    else blocked.push(ev);
    return ok;
  });
  const it = race.items;
  wrap(it, 'use', (o, kart, f, rs, aim) => {
    const prev = cur, item = f || kart.item;
    cur = item;
    const pl = kart.place;
    const r = o(kart, f, rs, aim);
    cur = prev;
    if (r && !f) {
      uses.push({ item: r, place: pl });
      if (KIND[r]) { const ev = { cause: r, place: pl }; gainList.push(ev); pend.push({ ev, k: kart, due: race.raceTime + 5, kind: 'gain' }); }
    }
    return r;
  });
  wrap(it, '_updSpecial', (o, p, dt, time) => { const prev = cur; cur = p.type === 'lob' ? p.payload : p.type; const r = o(p, dt, time); cur = prev; return r; });
  wrap(race, '_zap', (o, ...a) => { const prev = cur; cur = 'storm'; const r = o(...a); cur = prev; return r; });
  wrap(race, 'frostRay', (o, ...a) => { const prev = cur; cur = 'freeze'; const r = o(...a); cur = prev; return r; });
  // The hit lands just before these callbacks run: name it afterwards.
  const blame = (name) => { if (lastEv && lastEv.t === race.raceTime && lastEv.cause === '?') lastEv.cause = name; };
  wrap(race, 'onProjectileHit', (o, k, p) => { blame(p.type); return o(k, p); });
  wrap(race, 'onHazardHit', (o, k, h) => { blame(h.type); return o(k, h); });
  wrap(race, 'onObstacleHit', (o, k, ob) => { blame('obstacle'); return o(k, ob); });
  wrap(it, 'roll', (o, kart) => { const pl = kart.place; const r = o(kart); gives.push({ item: r, place: pl }); return r; });

  const start = ks.map((k) => k.index);
  const pole = ks.reduce((a, k) => (k.total > a.total ? k : a), ks[0]).index;
  const order0 = [...ks].sort((a, b) => b.total - a.total);
  const state = {}; // pair ordering with hysteresis, for overtakes
  let overtakes = 0, leadSnap = null, lap1Snap = null, steps = 0;
  const finishT = new Array(N).fill(null), firstHitCount = new Array(N).fill(0);
  while (steps < 60 * 600) {
    race.update(1 / 60); steps++;
    if (race.state !== 'race' && race.state !== 'finished') continue;
    const lead = ks.reduce((a, k) => (k.total > a.total ? k : a), ks[0]);
    if (!lap1Snap && lead.total >= L && LAPS >= 2) lap1Snap = { last: [...ks].sort((a, b) => a.place - b.place)[N - 1].index, t: race.raceTime };
    if (!leadSnap && LAPS >= 2 && lead.total >= (LAPS - 1) * L) {
      const sorted = [...ks].sort((a, b) => b.total - a.total);
      leadSnap = { gap: sorted[0].total - sorted[1].total, gapLast: sorted[0].total - sorted[N - 1].total };
    }
    for (let a = 0; a < N; a++) for (let c = a + 1; c < N; c++) {
      if (ks[a].finished || ks[c].finished) continue;
      const d = ks[a].total - ks[c].total, key = a * 8 + c, s = state[key];
      if (Math.abs(d) < 6) continue;
      const sg = d > 0 ? 1 : -1;
      if (s !== undefined && s !== sg) overtakes++;
      state[key] = sg;
    }
    for (let i = pend.length - 1; i >= 0; i--) {
      const q = pend[i];
      if (race.raceTime < q.due) continue;
      pend.splice(i, 1);
      const after = q.k.place;
      q.ev.swing = q.kind === 'loss' ? Math.max(0, after - q.ev.place) : Math.max(0, q.ev.place - after);
    }
    for (const k of ks) if (k.finished && finishT[k.index] === null) finishT[k.index] = k.finishTime;
    if (finishT.every((t) => t !== null)) break;
  }
  const done = finishT.every((t) => t !== null);
  const idxPlace = [...ks].map((k, i) => ({ i: k.index, t: finishT[k.index] ?? 1e9 })).sort((a, b) => a.t - b.t);
  const finalPlace = {}; idxPlace.forEach((r, i) => (finalPlace[r.i] = i + 1));
  const times = idxPlace.map((r) => r.t);
  const winner = idxPlace[0].i;
  const startOrder = order0.map((k) => k.index);
  const lastAtLap1 = lap1Snap ? lap1Snap.last : null;
  const raceTime = times[0];
  return {
    done, steps, laps: LAPS, trackLen: L, raceTime,
    gapLast: times[N - 1] - times[0], gapSecond: times[1] - times[0],
    leadSnap, avgSpeed: (L * LAPS) / times[0],
    winnerStart: startOrder.indexOf(winner), poleWon: winner === pole,
    lastAtLap1Gain: lastAtLap1 === null ? null : N - finalPlace[lastAtLap1],
    lastAtLap1Won: lastAtLap1 === null ? null : finalPlace[lastAtLap1] === 1,
    overtakes, hits: hits.filter(isItem).length, winnerHits: hits.filter((h) => h.victim === winner && isItem(h)).length,
    hitList: hits.filter(isItem).map((h) => ({ cause: h.cause, place: h.place, swing: h.swing ?? 0 })),
    popped: blocked.filter((h) => h.shield && isItem(h)).map((h) => h.cause),
    gives, uses,
    gainList: gainList.map((g) => ({ cause: g.cause === 'chili3' ? 'chili' : g.cause, place: g.place, swing: g.swing ?? 0 })),
    playerPlace: finalPlace[race.player.index], playerTime: finishT[race.player.index], fieldTime: times[Math.floor(N / 2)], playerStart: startOrder.indexOf(race.player.index),
    N,
  };
}

// ---- aggregation ----
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export const ATTACK = ['ball', 'bee', 'boomerang', 'bomb', 'firework', 'freeze', 'storm', 'twister'];
export const DEFENCE = ['honey', 'oil', 'bubble', 'horn', 'drum', 'chili', 'magnet', 'gems', 'pogo', 'ghost'];
export const CATCHUP = ['chili3', 'rainbow', 'rocket', 'warp', 'mirror'];

export function summarize(recs) {
  const ok = recs.filter((r) => r.done);
  const m = {};
  m.races = recs.length; m.finished = ok.length;
  m.gapLastS = mean(ok.map((r) => r.gapLast));
  m.gapLastPct = mean(ok.map((r) => (100 * r.gapLast) / r.raceTime));
  m.gapSecondS = mean(ok.map((r) => r.gapSecond));
  const leads = ok.filter((r) => r.leadSnap);
  m.leadLastLapS = median(leads.map((r) => r.leadSnap.gap / r.avgSpeed));
  m.poleWinPct = (100 * ok.filter((r) => r.poleWon).length) / ok.length;
  const l1 = ok.filter((r) => r.lastAtLap1Gain !== null);
  m.lastGain = mean(l1.map((r) => r.lastAtLap1Gain));
  m.lastWinPct = (100 * l1.filter((r) => r.lastAtLap1Won).length) / l1.length;
  m.overtakes = mean(ok.map((r) => r.overtakes));
  m.hits = mean(ok.map((r) => r.hits));
  m.winnerNoHitPct = (100 * ok.filter((r) => r.winnerHits === 0).length) / ok.length;
  // Hits by place of the victim: leader, middle, back.
  const hl = recs.flatMap((r) => r.hitList.map((h) => ({ ...h, N: r.N })));
  m.hitLeaderPer = hl.filter((h) => h.place === 1).length / recs.length;
  m.hitLastPer = hl.filter((h) => h.place === h.N).length / recs.length;
  const by = (list) => { const o = {}; for (const h of list) o[h.cause] = (o[h.cause] || 0) + 1 / recs.length; return o; };
  m.leaderHitsBy = by(hl.filter((h) => h.place === 1));
  m.lastHitsBy = by(hl.filter((h) => h.place === h.N));
  m.shieldPops = {};
  for (const r of recs) for (const c of r.popped) m.shieldPops[c] = (m.shieldPops[c] || 0) + 1 / recs.length;
  // Swing per item: places lost by victims within 4 s (hits) plus places gained by users within 5 s (self items).
  const swing = {}, cnt = {};
  for (const h of hl) { swing[h.cause] = (swing[h.cause] || 0) + h.swing; cnt[h.cause] = (cnt[h.cause] || 0) + 1; }
  for (const g of recs.flatMap((r) => r.gainList)) { swing[g.cause] = (swing[g.cause] || 0) + g.swing; cnt[g.cause] = (cnt[g.cause] || 0) + 1; }
  m.hitsBy = cnt;
  m.swing = swing;
  // Odds actually rolled, per place.
  const rolled = {};
  for (const r of recs) for (const g of r.gives) { (rolled[g.place] ||= {})[g.item] = (rolled[g.place]?.[g.item] || 0) + 1; }
  m.rolled = rolled;
  m.usedBy = {};
  for (const r of recs) for (const u of r.uses) m.usedBy[u.item] = (m.usedBy[u.item] || 0) + 1;
  m.playerWinPct = (100 * ok.filter((r) => r.playerPlace === 1).length) / ok.length;
  return m;
}

// Self-item swing is added through uses: recorded in hitList only for hits, so
// the gain events are carried by `gains`; report them from the summaries below.
export function share(m) {
  const tot = Object.values(m.swing).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(m.swing).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ item: k, swing: v, pct: (100 * v) / tot, hits: m.hitsBy[k] || 0 }));
}

export function classShare(m) {
  const out = {};
  for (const pl of Object.keys(m.rolled)) {
    const row = m.rolled[pl], tot = Object.values(row).reduce((a, b) => a + b, 0) || 1;
    const sum = (list) => (100 * list.reduce((s, k) => s + (row[k] || 0), 0)) / tot;
    out[pl] = { n: tot, attack: sum(ATTACK), defence: sum(DEFENCE), catchup: sum(CATCHUP) };
  }
  return out;
}

// Percent chance per item for each place, from the odds tables.
export function oddsPct(odds) {
  return odds.map((t) => {
    const tot = Object.values(t).reduce((a, b) => a + b, 0);
    const o = {};
    for (const k in t) o[k] = (100 * t[k]) / tot;
    return o;
  });
}
export function oddsClasses(odds) {
  return oddsPct(odds).map((o) => {
    const sum = (list) => list.reduce((s, k) => s + (o[k] || 0), 0);
    return { attack: sum(ATTACK), defence: sum(DEFENCE), catchup: sum(CATCHUP) };
  });
}
