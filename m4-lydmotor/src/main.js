(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Aksentfarge per bil: [aksent, varmere variant for glød]. Turtallssperren er alltid rød.
  const ACCENTS = { m4csl: ['#29b6ff', '#8fd8ff'], vanqs: ['#2fd18b', '#8ff0bf'], v12vs: ['#ffb020', '#ffd27a'], f12: ['#ff2b2b', '#ff8a7a'],
    gt3: ['#ffd60a', '#fff08a'], lfa: ['#ff5a1f', '#ffa07a'], cgt: ['#c4ccd8', '#ffffff'],
    f812: ['#d8001e', '#ff5a6e'], gt3rs4: ['#9be22a', '#d4ff8a'] }; // ukjent bil: M4-blå
  const BUILD = '/*BUILD*/'; // innholdshash fra build.py, samme som VERSION i sw.js
  const COL = { ink: '#eef2f6', dim: '#98a3b1', amber: '#ffb020', orange: '#ff6a1a', red: '#ff2d2d',
    ui: getComputedStyle(document.documentElement).getPropertyValue('--f-ui').trim() || 'system-ui, sans-serif',
    num: getComputedStyle(document.documentElement).getPropertyValue('--f-num').trim() || 'monospace' };
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const st = { ctx: null, node: null, core: null, started: false, mode: 'test', auto: true, exMode: 1,
    thrPed: 0, thrKey: 0, brake: 0, keyGas: false,
    tele: { rpm: 780, gear: 1, v: 0, load: 0, lim: false, shift: 0, ev: [] }, rpmD: 780, vD: 0,
    evText: '', evT: 0, tunManual: false, tunGps: false, tunMap: false, tunOn: false, wake: null, wakeT: -1e9,
    resT: -1e9, resN: 0, drawT: 0, sys: '', vc: 2, vcDb: 0, vcT: 0, volSent: -1, gainSent: 1, muted: false, frames: 0, moveT: 0, touchT: 0,
    cars: {}, audioSt: '' };

  // ---------- bilprofiler og lydanlegg ----------
  const PROFS = EngineCore.profiles(), OUTS = EngineCore.outputs();
  const prof = () => PROFS[st.car];
  // ---------- lagrede innstillinger ----------
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('lydmotor') || localStorage.getItem('m4csl') || '{}') || {}; } catch (e) { return {}; } },
    set(o) { try { localStorage.setItem('lydmotor', JSON.stringify(o)); localStorage.removeItem('m4csl'); } catch (e) {} }
  };
  // Streng kontroll av lagrede og importerte innstillinger: ukjente nøkler forkastes, tall klemmes, kaster aldri.
  const num = (a, b) => (x) => (typeof x === 'number' && isFinite(x) ? clamp(x, a, b) : undefined);
  const bool = (x) => (typeof x === 'boolean' ? x : undefined);
  const CFG = { vol: num(0, 1), bur: num(0, 1), tunAmt: num(0, 1.5), idle: bool, tunGps: bool, tunMap: bool, ex: (x) => { const v = num(0, 2)(x); return v === undefined ? v : Math.round(v); },
    car: (x) => (PROFS[x] ? x : undefined), out: (x) => (OUTS[x] ? x : undefined), vc: (x) => { const v = num(0, 3)(x); return v === undefined ? v : Math.round(v); },
    rec: bool, recPos: bool };
  const CAR_CFG = { vol: CFG.vol, bur: CFG.bur, ex: CFG.ex };
  function cleanCfg(c) {
    const o = {};
    try {
      if (!c || typeof c !== 'object') return o;
      for (const k in CFG) { const v = CFG[k](c[k]); if (v !== undefined) o[k] = v; }
      if (c.cars && typeof c.cars === 'object') {
        o.cars = {};
        for (const id in c.cars) {
          if (!PROFS[id] || !c.cars[id] || typeof c.cars[id] !== 'object') continue;
          const p = {}; for (const k in CAR_CFG) { const v = CAR_CFG[k](c.cars[id][k]); if (v !== undefined) p[k] = v; }
          o.cars[id] = p;
        }
      }
    } catch (e) {}
    return o;
  }
  function applyCfg(c) {
    if (c.vol != null) $('#vol').value = c.vol;
    if (c.bur != null) $('#bur').value = c.bur;
    if (c.tunAmt != null) $('#tunAmt').value = c.tunAmt;
    if (c.idle != null) $('#idle').checked = c.idle;
    if (c.tunGps != null) $('#tunGps').checked = c.tunGps;
    if (c.tunMap != null) $('#tunMap').checked = c.tunMap;
    if (c.rec != null) $('#rec').checked = c.rec;
    if (c.recPos != null) $('#recPos').checked = c.recPos;
    if (c.ex != null) st.exMode = c.ex;
    if (c.vc != null) st.vc = c.vc;
    if (c.cars) st.cars = c.cars;
    if (c.car) st.car = c.car;
    if (c.out) st.outId = c.out;
  }
  st.car = 'm4csl'; st.outId = 'i4hk';
  applyCfg(cleanCfg(store.get()));
  // Volum, eksosmodus og burble huskes per bil (de globale nøklene vol/bur/ex følger bilen som er valgt).
  const carPreset = () => ({ vol: +$('#vol').value, bur: +$('#bur').value, ex: st.exMode });
  function saveCfg() {
    st.cars[st.car] = carPreset();
    store.set({ vol: +$('#vol').value, bur: +$('#bur').value, tunAmt: +$('#tunAmt').value, idle: $('#idle').checked,
      tunGps: $('#tunGps').checked, tunMap: $('#tunMap').checked, ex: st.exMode, car: st.car, out: st.outId,
      vc: st.vc, rec: $('#rec').checked, recPos: $('#recPos').checked, cars: st.cars });
  }

  // ---------- kjørelogg ----------
  // Kolonner i forhåndsallokerte typed arrays (ingen allokering per prøve), maks 2 timer i minnet; nye rader
  // lagres i IndexedDB hvert 30. sekund og når siden skjules. Formatet er beskrevet i CLAUDE.md («Kjørelogg»).
  const REC_MS = 100, REC_CAP = 2 * 3600 * 10, GPS_CAP = 2 * 3600 * 2, EV_CAP = 20000;
  const SCOLS = ['aRaw', 'aLin', 'rot', 'vEst', 'thr', 'brk', 'dir', 'grade', 'held', 'rpm', 'gear', 'load', 'vEng', 'volDb'];
  const GCOLS = ['spd', 'acc', 'hdg', 'good', 'lat', 'lon'];
  const EPOCH = Date.now() - performance.now();
  const REC = { on: false, ready: false, n: 0, gn: 0, next: 0, last: 0, dur: 0, saved: 0, gsaved: 0, esaved: 0, rewrite: false, busy: false,
    persistT: 0, infoT: 0, ev: [], t: null, c: null, gt: null, gts: null, g: null };
  function recAlloc() {
    if (REC.t) return;
    REC.t = new Float64Array(REC_CAP); REC.c = {}; for (const k of SCOLS) REC.c[k] = new Float32Array(REC_CAP);
    REC.gt = new Float64Array(GPS_CAP); REC.gts = new Float64Array(GPS_CAP); REC.g = {};
    for (const k of GCOLS) REC.g[k] = k === 'lat' || k === 'lon' ? new Float64Array(GPS_CAP) : new Float32Array(GPS_CAP);
  }
  function recTrim() { // fullt: kast den eldste halvdelen (sjelden) og skriv IndexedDB på nytt
    if (REC.n >= REC_CAP) {
      const h = REC_CAP / 2; REC.dur *= (REC.n - h) / REC.n;
      REC.t.copyWithin(0, h, REC.n); for (const k of SCOLS) REC.c[k].copyWithin(0, h, REC.n); REC.n -= h;
    }
    if (REC.gn >= GPS_CAP) {
      const h = GPS_CAP / 2; REC.gt.copyWithin(0, h, REC.gn); REC.gts.copyWithin(0, h, REC.gn);
      for (const k of GCOLS) REC.g[k].copyWithin(0, h, REC.gn); REC.gn -= h;
    }
    if (REC.ev.length >= EV_CAP) REC.ev.splice(0, EV_CAP / 2);
    REC.rewrite = true;
  }
  function recRow(now) { // fra fuse(), 60 Hz: skriver en rad hvert 100. ms
    if (!REC.on || !REC.ready || now < REC.next) return;
    REC.next = now - REC.next < REC_MS ? REC.next + REC_MS : now + REC_MS;
    if (REC.last) REC.dur += Math.min(now - REC.last, 1000);
    REC.last = now;
    if (REC.n >= REC_CAP) recTrim();
    const i = REC.n++, c = REC.c, t = st.tele;
    REC.t[i] = EPOCH + now; c.aRaw[i] = S.aRaw; c.aLin[i] = S.aLin; c.rot[i] = S.rot; c.vEst[i] = S.vEst; c.thr[i] = S.thr; c.brk[i] = S.brk;
    c.dir[i] = S.dir === 'R' ? -1 : 1; c.grade[i] = S.grade; c.held[i] = now < S.rotHold ? 1 : 0;
    c.rpm[i] = t.rpm; c.gear[i] = t.gear; c.load[i] = t.load; c.vEng[i] = t.v; c.volDb[i] = st.vcDb;
  }
  function recGps(c, ts, good, now) {
    if (!REC.on || !REC.ready) return;
    if (REC.gn >= GPS_CAP) recTrim();
    const i = REC.gn++, g = REC.g, pos = $('#recPos').checked, ok = (x) => x != null && !isNaN(x);
    REC.gt[i] = EPOCH + now; REC.gts[i] = ts;
    g.spd[i] = ok(c.speed) ? c.speed : NaN; g.acc[i] = ok(c.accuracy) ? c.accuracy : NaN; g.hdg[i] = ok(c.heading) ? c.heading : NaN;
    g.good[i] = good ? 1 : 0; g.lat[i] = pos ? c.latitude : NaN; g.lon[i] = pos ? c.longitude : NaN;
  }
  function recEv(k, v) {
    if (!REC.on || !REC.ready) return;
    if (REC.ev.length >= EV_CAP) recTrim();
    REC.ev.push([Math.round(EPOCH + performance.now()), k, v]);
  }
  const fmtDur = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const IDB = { p: null };
  function idb() {
    if (!IDB.p) IDB.p = new Promise((res) => {
      try {
        const q = indexedDB.open('lydmotor-logg', 1);
        q.onupgradeneeded = () => { try { q.result.createObjectStore('chunks', { autoIncrement: true }); } catch (e) {} };
        q.onsuccess = () => res(q.result); q.onerror = () => res(null); q.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
    return IDB.p;
  }
  const idbTx = (db, fn) => new Promise((res, rej) => {
    const tx = db.transaction('chunks', 'readwrite'); fn(tx.objectStore('chunks'));
    tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error);
  });
  async function recPersist() {
    if (REC.busy || !REC.ready || !REC.t) return;
    REC.busy = true;
    try {
      const db = await idb(); if (!db) return;
      const all = REC.rewrite, s0 = all ? 0 : REC.saved, g0 = all ? 0 : REC.gsaved, e0 = all ? 0 : REC.esaved;
      const n = REC.n, gn = REC.gn, en = REC.ev.length;
      if (!all && s0 === n && g0 === gn && e0 === en) return;
      REC.rewrite = false;
      const ch = { v: 1, dur: REC.dur, t: REC.t.slice(s0, n), c: {}, gt: REC.gt.slice(g0, gn), gts: REC.gts.slice(g0, gn), g: {}, ev: REC.ev.slice(e0, en) };
      for (const k of SCOLS) ch.c[k] = REC.c[k].slice(s0, n);
      for (const k of GCOLS) ch.g[k] = REC.g[k].slice(g0, gn);
      await idbTx(db, (os) => { if (all) os.clear(); os.add(ch); });
      if (!REC.rewrite) { REC.saved = n; REC.gsaved = gn; REC.esaved = en; }
    } catch (e) { REC.rewrite = true; } finally { REC.busy = false; }
  }
  async function recLoad() { // etter krasj/omlasting: fortsett der loggen slapp
    try {
      const db = await idb(); if (!db) return;
      const chunks = await new Promise((res) => {
        try { const q = db.transaction('chunks').objectStore('chunks').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch (e) { res([]); }
      });
      let trimmed = false;
      for (const ch of chunks) {
        if (!ch || ch.v !== 1 || !ch.t || !ch.c) continue;
        recAlloc();
        for (let i = 0; i < ch.t.length; i++) {
          if (REC.n >= REC_CAP) { recTrim(); trimmed = true; }
          const j = REC.n++; REC.t[j] = ch.t[i]; for (const k of SCOLS) REC.c[k][j] = ch.c[k] ? ch.c[k][i] : NaN;
        }
        for (let i = 0; ch.gt && i < ch.gt.length; i++) {
          if (REC.gn >= GPS_CAP) { recTrim(); trimmed = true; }
          const j = REC.gn++; REC.gt[j] = ch.gt[i]; REC.gts[j] = ch.gts ? ch.gts[i] : NaN; for (const k of GCOLS) REC.g[k][j] = ch.g && ch.g[k] ? ch.g[k][i] : NaN;
        }
        if (Array.isArray(ch.ev)) for (const e of ch.ev) { if (REC.ev.length >= EV_CAP) { recTrim(); trimmed = true; } REC.ev.push(e); }
        if (typeof ch.dur === 'number') REC.dur = ch.dur;
      }
      REC.saved = REC.n; REC.gsaved = REC.gn; REC.esaved = REC.ev.length; REC.rewrite = trimmed;
    } catch (e) {} finally { REC.ready = true; recEv('load', { build: BUILD, car: st.car, out: st.outId, ex: st.exMode, vc: st.vc }); recInfo(); }
  }
  async function recClear() {
    REC.n = 0; REC.gn = 0; REC.ev = []; REC.dur = 0; REC.last = 0; REC.saved = 0; REC.gsaved = 0; REC.esaved = 0; REC.rewrite = false;
    try { const db = await idb(); if (db) await idbTx(db, (os) => os.clear()); } catch (e) {}
    recInfo();
  }
  function recInfo() {
    const mb = (REC.n * SCOLS.length * 7 + REC.gn * 60 + REC.ev.length * 30) / 1e6;
    const s = REC.n || REC.gn ? fmtDur(REC.dur) + ' tatt opp (' + REC.n + ' målinger, ' + REC.gn + ' GPS-punkter, ca. ' + mb.toFixed(1).replace('.', ',') + ' MB).' : 'Ingen logg lagret.';
    if ($('#logInfo').textContent !== s) $('#logInfo').textContent = s;
  }
  function recTick(now) { // fra sysTick
    if (now - REC.persistT > 30000) { REC.persistT = now; recPersist(); }
    if (now - REC.infoT > 1000) { REC.infoT = now; recInfo(); }
  }
  function recSet(on) {
    if (on) recAlloc();
    if (on && !REC.on) { REC.on = true; recEv('rec', { car: st.car, out: st.outId, mode: st.mode, ex: st.exMode, vc: st.vc, build: BUILD }); }
    else if (!on && REC.on) { recEv('rec', 0); REC.on = false; recPersist(); }
    $('#rec').checked = on;
  }
  function logData() {
    const r3 = (x) => (x === x ? Math.round(x * 1000) / 1000 : null), r6 = (x) => (x === x ? Math.round(x * 1e6) / 1e6 : null), ri = (x) => (x === x ? Math.round(x) : null);
    const col = (a, n, f) => { const o = new Array(n); for (let i = 0; i < n; i++) o[i] = f(a[i]); return o; };
    const s = { t: col(REC.t, REC.n, ri) }, g = { t: col(REC.gt, REC.gn, ri), ts: col(REC.gts, REC.gn, ri) };
    for (const k of SCOLS) s[k] = col(REC.c ? REC.c[k] : null, REC.n, r3);
    for (const k of GCOLS) g[k] = col(REC.g ? REC.g[k] : null, REC.gn, k === 'lat' || k === 'lon' ? r6 : r3);
    return { format: 'lydmotor-logg', version: 2, build: BUILD, created: new Date().toISOString(), ua: navigator.userAgent,
      hz: 1000 / REC_MS, gpsLag: Math.round(S.lag), durMs: Math.round(REC.dur), pos: $('#recPos').checked,
      state: { car: st.car, out: st.outId, mode: st.mode, ex: st.exMode, vc: st.vc, cfg: cleanCfg(store.get()), fwd: S.fwd, bias: S.bias, gBase: S.gBase, lag: Math.round(S.lag), lagN: S.lagN, lagOk: S.lagOk },
      s: s, gps: g, ev: REC.ev };
  }
  // Fil til brukeren: delingsark på telefon (Arkiv/Meldinger), ellers vanlig nedlasting.
  async function giveFile(text, name) {
    const blob = new Blob([text], { type: 'application/json' });
    try {
      const f = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
      if (f && navigator.canShare && window.matchMedia && matchMedia('(pointer: coarse)').matches && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: name }); return 'Delt.';
      }
    } catch (e) { if (e && e.name === 'AbortError') return 'Avbrutt.'; }
    try {
      const a = document.createElement('a'), u = URL.createObjectURL(blob);
      a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
      return 'Lastet ned: ' + name;
    } catch (e) { return 'Nettleseren lot oss ikke lagre filen.'; }
  }
  const stamp = () => { const d = new Date(), p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); };
  $('#rec').addEventListener('change', () => { recSet($('#rec').checked); saveCfg(); sysTick(); });
  $('#recPos').addEventListener('change', () => { recEv('pos', $('#recPos').checked ? 1 : 0); saveCfg(); });
  $('#logDl').addEventListener('click', async () => {
    if (!REC.n && !REC.gn) { $('#logInfo').textContent = 'Loggen er tom. Slå på «Ta opp kjøring» og kjør med sensorer.'; return; }
    const r = await giveFile(JSON.stringify(logData()), 'lydmotor-logg-' + stamp() + '.json');
    $('#logInfo').textContent = r;
  });
  $('#logDel').addEventListener('click', () => {
    const b = $('#logDel');
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = 'Trykk igjen for å slette'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'Slett logg'; }, 3000); return; }
    delete b.dataset.arm; b.textContent = 'Slett logg';
    recClear().then(() => { $('#logInfo').textContent = 'Loggen er slettet.'; });
  });
  addEventListener('pagehide', () => recPersist());
  document.addEventListener('visibilitychange', () => { if (document.hidden) recPersist(); });
  REC.on = $('#rec').checked; if (REC.on) recAlloc();
  recLoad();

  // ---------- eksport og import av innstillinger ----------
  const setMsg = (s) => { $('#cfgMsg').textContent = s; };
  $('#cfgExp').addEventListener('click', async () => {
    saveCfg();
    setMsg(await giveFile(JSON.stringify({ format: 'lydmotor-innstillinger', version: 1, build: BUILD, settings: cleanCfg(store.get()) }, null, 1), 'lydmotor-innstillinger.json'));
  });
  $('#cfgImp').addEventListener('click', () => $('#cfgFile').click());
  $('#cfgFile').addEventListener('change', async () => {
    const inp = $('#cfgFile'), f = inp.files && inp.files[0];
    try {
      if (!f || f.size > 256 * 1024) throw new Error('size');
      const j = JSON.parse(await f.text()), c = cleanCfg(j && typeof j === 'object' && j.settings ? j.settings : j), n = Object.keys(c).length;
      if (!n) throw new Error('empty');
      importCfg(c);
      setMsg('Importert (' + n + ' innstillinger).');
    } catch (e) { setMsg('Kunne ikke lese filen. Velg en JSON-fil som er eksportert fra Lydmotor.'); }
    try { inp.value = ''; } catch (e) {}
  });
  function importCfg(c) {
    const car = c.car; delete c.car;
    applyCfg(c);
    if (car && car !== st.car) { st.car = car; showCar(); if (st.started) send({ k: 'profile', p: prof() }); }
    $('#car').value = st.car; $('#outp').value = st.outId;
    if (st.started && c.out) send({ k: 'out', o: OUTS[st.outId] });
    if (c.tunGps === false) st.tunGps = false;
    if (c.tunMap === false) st.tunMap = false;
    recSet($('#rec').checked); setVc(st.vc); setEx(st.exMode); applyTunnel(); // setEx -> pushCfg -> lagrer
  }

  // ---------- Media Session (låseskjerm, CarPlay «Spilles nå») ----------
  // iOS viser «Spilles nå» for det stille lydsporet i sløyfe (st.keep). Pause demper motoren mykt (master-gain),
  // spill av slår lyden på igjen; lydsporet og vakthunden i sysTick fortsetter som før.
  function mediaMeta() {
    try {
      if (!navigator.mediaSession || typeof MediaMetadata !== 'function') return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Lydmotor', artist: prof().name, album: 'Lydmotor',
        artwork: [192, 512].map((s) => ({ src: new URL('icon-' + s + '.png', location.href).href, sizes: s + 'x' + s, type: 'image/png' })) });
    } catch (e) {}
  }
  function mediaInit() {
    const ms = navigator.mediaSession; if (!ms) return;
    mediaMeta();
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
    h('play', () => setMuted(false)); h('pause', () => setMuted(true)); h('stop', () => setMuted(true));
    try { ms.playbackState = st.muted ? 'paused' : 'playing'; } catch (e) {}
  }
  function setMuted(m) {
    st.muted = m; recEv('mute', m ? 1 : 0);
    if (st.master && st.ctx) st.master.gain.setTargetAtTime(m ? 0 : 1, st.ctx.currentTime, 0.08);
    if (!m) resumeAudio();
    try { if (navigator.mediaSession) navigator.mediaSession.playbackState = m ? 'paused' : 'playing'; } catch (e) {}
    st.sys = ''; sysTick();
  }

  // ---------- service worker (frakoblet bruk) ----------
  // Bare på https eller localhost. Ny versjon tas i bruk ved neste oppstart; er siden allerede den nye versjonen
  // (index.html hentes nett-først), byttes arbeideren stille. Ellers vises «Ny versjon klar», som laster på nytt ved trykk.
  const SW = { reg: null, ready: null, upT: 0 };
  function swInit() {
    try {
      if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) return;
      navigator.serviceWorker.register('sw.js', { scope: './' }).then((reg) => {
        SW.reg = reg;
        const watch = (w) => {
          if (!w) return;
          const f = () => { if (w.state === 'installed' && navigator.serviceWorker.controller) swWaiting(w); };
          w.addEventListener('statechange', f); f();
        };
        watch(reg.waiting); watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      }).catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (SW.reload) location.reload(); });
    } catch (e) {}
  }
  function swWaiting(w) {
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => {
        if (e.data && e.data.v === BUILD) w.postMessage({ k: 'skip' }); // siden er alt den nye versjonen
        else { SW.ready = w; st.sys = ''; sysTick(); }
      };
      w.postMessage({ k: 'ver' }, [ch.port2]);
    } catch (e) {}
  }
  function swApply() {
    if (!SW.ready) return;
    SW.reload = true; try { SW.ready.postMessage({ k: 'skip' }); } catch (e) {}
    setTimeout(() => location.reload(), 1500);
  }
  function swCheck() { // se etter ny versjon når appen kommer frem igjen, høyst en gang i timen
    const now = performance.now();
    if (!SW.reg || now - SW.upT < 3600e3) return;
    SW.upT = now; try { SW.reg.update().catch(() => {}); } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) swCheck(); });
  swInit();
  $('#stSys').addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.id === 'chMute') setMuted(false); else if (b.id === 'chNew') swApply();
  });
  // liggende: åpne innstillinger ligger under turtelleren; rull dit (lukket: tilbake til toppen)
  $('details').addEventListener('toggle', () => {
    try { if (matchMedia('(orientation: landscape) and (max-height: 560px)').matches) { if ($('details').open) $('details').scrollIntoView({ block: 'start' }); else scrollTo(0, 0); } } catch (e) {}
  });
  addEventListener('pointerdown', () => { st.touchT = performance.now(); }, { passive: true, capture: true });
  addEventListener('keydown', () => { st.touchT = performance.now(); }, { capture: true });

  function send(m) {
    if (st.node) st.node.port.postMessage(m);
    else if (st.core) st.core.msg(m);
  }
  const EVN = { up: (e) => '▲ ' + e.a + ' → ' + e.b, blip: (e) => '▼ ' + e.a + ' → ' + e.b + ' mellomgass', kick: (e) => '▼ ' + e.a + ' → ' + e.b + ' kickdown',
    lim: () => 'turtallssperre', deny: () => 'skift nektet', lift: () => 'overrun' };
  function onTele(t) {
    st.tele = t;
    if (t.ev) for (const e of t.ev) { const f = EVN[e.k]; if (f) { st.evText = f(e); st.evT = performance.now(); if (REC.on) recEv('eng', e.k + (e.a != null ? ' ' + e.a + (e.b != null ? '>' + e.b : '') : '')); } }
  }

  // ---------- lyd ----------
  function silentWavUrl() {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  const TUN = { send: 0.9, wet: 0.28, dryBoost: 1.12, tauIn: 0.10, tauOut: 0.20, irDur: 3.4 };

  function buildGraph(ctx, src) {
    // Tørr vei: kilde -> gain -> mykklipper -> ut (ingen forsinkelse).
    // Tunnel: kilde -> send -> convolver -> EQ -> wet -> mykklipper. Bare den våte veien går gjennom convolveren.
    const shaper = ctx.createWaveShaper();
    const N = 2049, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1, a = Math.abs(x); curve[i] = a < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); }
    shaper.curve = curve; shaper.oversample = 'none';
    const dry = ctx.createGain(), sendG = ctx.createGain(), wet = ctx.createGain(), master = ctx.createGain();
    sendG.gain.value = 0; wet.gain.value = 0; master.gain.value = st.muted ? 0 : 1;
    // master: bare demping fra Media Session (pause/spill av), etter mykklipperen
    src.connect(dry); dry.connect(shaper); shaper.connect(master); master.connect(ctx.destination);
    st.dry = dry; st.sendG = sendG; st.wet = wet; st.shaper = shaper; st.master = master;
    try {
      const ir = EngineCore.tunnelIR(ctx.sampleRate, TUN.irDur);
      const buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
      buf.getChannelData(0).set(ir[0]); buf.getChannelData(1).set(ir[1]);
      const conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = buf;
      const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 250; lo.gain.value = 4;
      const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 3000; hi.gain.value = -6;
      src.connect(sendG); sendG.connect(conv); conv.connect(lo); lo.connect(hi); hi.connect(wet); wet.connect(shaper);
      st.tunReady = true;
    } catch (e) { st.tunReady = false; }
  }

  function resumeAudio() {
    const c = st.ctx; if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    if (st.keep && st.keep.paused) st.keep.play().catch(() => {});
  }
  function wakeLock() {
    if (st.wake || !navigator.wakeLock || document.hidden) return;
    st.wakeT = performance.now();
    try {
      navigator.wakeLock.request('screen').then((w) => {
        st.wake = w; recEv('wake', 1);
        // iOS slipper låsen av og til (f.eks. etter et anrop); be om den igjen så lenge siden vises
        w.addEventListener('release', () => { st.wake = null; recEv('wake', 0); if (!document.hidden) setTimeout(wakeLock, 1000); });
      }).catch(() => {});
    } catch (e) {}
  }
  // Vakt fire ganger i sekundet: lyd avbrutt (anrop, Siri), stille lydspor stoppet, skjermlås borte. Viser status.
  function sysTick() {
    const c = st.ctx, now = performance.now();
    if (!c) return;
    const audioOk = c.state === 'running' && !(st.keep && st.keep.paused);
    const aSt = c.state + (st.keep && st.keep.paused ? '/keep-pause' : '');
    if (aSt !== st.audioSt) { st.audioSt = aSt; recEv('audio', aSt); }
    vcTick(now);
    recTick(now);
    if (now - (st.latT || 0) > 5000) { st.latT = now; showLatency(); } // utgangen kan skifte (CarPlay, Bluetooth)
    if (!document.hidden) {
      if (audioOk) st.resN = 0;
      else if (now - st.resT > (st.resN > 5 ? 5000 : 1000)) { st.resT = now; st.resN++; resumeAudio(); }
      if (!st.wake && now - st.wakeT > 10000) wakeLock();
    }
    // statusbrikker: grønn = ok, gul = venter/info, rød = feil
    const chip = (k) => (t) => '<span class="chip ' + k + '"><svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4"/></svg>' + t + '</span>';
    const ok = chip('ok'), warn = chip('warn'), bad = chip('bad');
    const parts = [
      !navigator.wakeLock ? bad('Skjermlås støttes ikke') : st.wake ? ok('Skjerm våken') : bad('Skjermen kan slukke'),
      audioOk ? ok('Lyd på') : bad(c.state === 'interrupted' ? 'Lyd avbrutt' : 'Lyd pauset')
    ];
    if (S.on) {
      const age = now - S.lastGood;
      parts.push(S.lastGood && age < 2500 ? ok('GPS OK') : !S.gpsSeen ? warn('GPS venter') : bad('GPS borte'));
      if (S.dir === 'R') parts.push(warn('Rygger'));
    }
    // trykkbare brikker (egen knapp, 44 px trykkflate): dempet fra låseskjerm/CarPlay, ny versjon
    const btn = (id, k, t) => '<button type="button" class="chip tapchip ' + k + '" id="' + id + '"><svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4"/></svg>' + t + '</button>';
    if (st.muted) parts.push(btn('chMute', 'warn', 'Dempet · trykk for lyd'));
    if (REC.on || REC.n) parts.push('<span class="chip rec' + (REC.on ? '' : ' off') + '"><svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4"/></svg>' + (REC.on ? 'REC ' : 'Logg ') + fmtDur(REC.dur) + '</span>');
    if (SW.ready) parts.push(btn('chNew', 'ok', 'Ny versjon klar'));
    const html = parts.join(' ');
    if (html !== st.sys) { st.sys = html; $('#stSys').innerHTML = html; }
  }

  async function startAudio(mode) {
    if (st.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { $('#start p').textContent = 'Nettleseren støtter ikke Web Audio.'; return; }
    // Alt som krever et trykk startes før første await.
    const motionP = mode === 'drive' ? askMotion() : null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    // Stille lydspor i sløyfe holder iOS-lyden på selv med stillebryteren på.
    try { const a = new Audio(silentWavUrl()); a.loop = true; a.setAttribute('playsinline', ''); a.volume = 0.01; a.play().catch(() => {}); st.keep = a; } catch (e) {}
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
      try { ctx = new AC(); } catch (e2) { $('#start p').textContent = 'Lyden kunne ikke starte (' + (e2 && e2.name || 'feil') + '). Lukk andre apper som spiller lyd, og last siden på nytt.'; return; }
    }
    st.ctx = ctx;
    ctx.resume().catch(() => {});
    st.started = true;
    $('#start').classList.add('hide');
    st.sweepT = reduceMotion ? 0 : performance.now(); // kort viserfeiing på turtelleren, bare visuelt
    let path = '';
    try {
      if (!ctx.audioWorklet) throw new Error('ingen worklet');
      const src = EngineCore.toString() + `
class M4Proc extends AudioWorkletProcessor {
  constructor() { super(); this.core = new EngineCore(sampleRate); this.port.onmessage = (e) => this.core.msg(e.data); }
  process(inputs, outputs) {
    const o = outputs[0]; const L = o[0], R = o[1] || o[0];
    if (this.core.render(L, R, L.length)) this.port.postMessage(this.core.tele);
    return true;
  }
}
registerProcessor('m4-engine', M4Proc);`;
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, 'm4-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (e) => onTele(e.data);
      buildGraph(ctx, node);
      st.node = node; path = 'AudioWorklet';
    } catch (err) {
      try {
        const core = new EngineCore(ctx.sampleRate);
        const sp = ctx.createScriptProcessor(256, 0, 2);
        sp.onaudioprocess = (e) => {
          if (core.render(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), e.outputBuffer.length)) onTele(core.tele);
        };
        buildGraph(ctx, sp);
        st.core = core; st.sp = sp; path = 'ScriptProcessor';
      } catch (e2) { path = 'ingen'; $('#stLat').textContent = 'Lydmotoren kunne ikke starte. Last siden på nytt.'; }
    }
    st.path = path;
    recEv('start', mode + ' ' + path);
    mediaInit();
    send({ k: 'out', o: OUTS[st.outId], now: true }); send({ k: 'profile', p: prof(), now: true });
    pushCfg(); send({ k: 'start' });
    setMode(mode);
    applyTunnel();
    showLatency();
    setTimeout(showLatency, 1500);
    ctx.addEventListener('statechange', () => { if (ctx.state !== 'running' && !document.hidden) setTimeout(resumeAudio, 200); });
    document.addEventListener('visibilitychange', () => { recEv('vis', document.hidden ? 0 : 1); if (!document.hidden) { resumeAudio(); wakeLock(); } });
    addEventListener('pointerdown', resumeAudio, { passive: true });
    wakeLock();
    setInterval(sysTick, 250);
    if (mode === 'drive') enableSensors(motionP);
  }
  function showLatency() {
    const ctx = st.ctx; if (!ctx || st.path === 'ingen') return;
    // baseLatency: lydkontekstens egen buffer. outputLatency (Safari fra iOS 18.4): det operativsystemet oppgir for
    // utgangen; om Bluetooth- og CarPlay-bufferen er med, avgjør iOS. Uten outputLatency vises bare kontekstens del.
    const out = typeof ctx.outputLatency === 'number' && ctx.outputLatency > 0;
    const ms = ((ctx.baseLatency || 0) + (out ? ctx.outputLatency : 0)) * 1000 + (st.path === 'AudioWorklet' ? 0 : 5);
    const h = ms > 0.5 ? 'Forsinkelse ca. <b>' + Math.round(ms) + ' ms</b>' + (out ? '' : ' + utgang') : 'Lyd på';
    if ($('#stLat').innerHTML !== h) $('#stLat').innerHTML = h;
    $('#stLat').title = st.path;
  }
  $('#startDrive').addEventListener('click', () => startAudio('drive'));
  $('#startTest').addEventListener('click', () => startAudio('test'));

  function pushCfg() {
    st.volSent = effVol(); st.gainSent = vcGain();
    send({ k: 'cfg', vol: st.volSent, gain: st.gainSent, burble: +$('#bur').value, idleOn: $('#idle').checked, auto: st.mode === 'drive' ? true : st.auto, exMode: st.exMode });
    saveCfg();
    if (st.tunOn) applyTunnel(); // tunneldempingen følger volumet
  }

  // ---------- veistøykompensasjon ----------
  // Løftet øker med farten (lineært 0 dB i ro til VC_DB ved 120 km/t, glattet ~1 s) og sendes som cfg gain: motoren legger det
  // på før begrenseren, så toppene holder seg på taket (vol × lim, i4hk 0,84 = -1,5 dBFS ved vol 1) uansett løft; jevn
  // kjøring blir høyere, bare full gass blir begrenset mer. Bare i kjøremodus med sensorer; testmodus får 0 dB.
  // vol (glidebryteren) virker etter begrenseren. I tunnel dempes tørr vei og klangsending slik at summens verste topp
  // (TUN_PK × tak, målt i sensortest) holder seg under PEAK_MAX (ca. -2 dBFS; mykklipperen starter på 0,8).
  const VC_DB = [0, 2, 3.5, 5], PEAK_MAX = 0.79, TUN_PK = 2.0;
  const vcTarget = (v) => VC_DB[st.vc] * clamp(v * 3.6 / 120, 0, 1);
  const effVol = () => +$('#vol').value;
  const vcGain = () => Math.pow(10, st.vcDb / 20);
  function tunK() {
    const o = OUTS[st.outId], pk = effVol() * ((o && o.lim) || 0.86) * TUN_PK;
    return pk > PEAK_MAX ? PEAK_MAX / pk : 1;
  }
  function vcTick(now) {
    const dt = st.vcT ? clamp((now - st.vcT) / 1000, 0, 1) : 0.25; st.vcT = now;
    const tgt = st.mode === 'drive' && S.on ? vcTarget(S.vEst) : 0;
    st.vcDb += (tgt - st.vcDb) * (1 - Math.exp(-dt / 1.0));
    const g = vcGain();
    if (Math.abs(g - st.gainSent) > 0.002) { st.gainSent = g; send({ k: 'cfg', gain: g }); }
  }
  function setVc(m) {
    st.vc = m;
    document.querySelectorAll('[data-vc]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.vc === m)));
    saveCfg();
  }
  document.querySelectorAll('[data-vc]').forEach((b) => b.addEventListener('click', () => setVc(+b.dataset.vc)));
  setVc(st.vc);
  $('#vol').addEventListener('input', pushCfg);
  $('#bur').addEventListener('input', pushCfg);
  $('#idle').addEventListener('change', pushCfg);
  $('#tunAmt').addEventListener('input', () => { saveCfg(); applyTunnel(); });
  $('#tunGps').addEventListener('change', () => { saveCfg(); if (!$('#tunGps').checked) { st.tunGps = false; applyTunnel(); } });
  $('#tunMap').addEventListener('change', () => { saveCfg(); if (!$('#tunMap').checked) { st.tunMap = false; applyTunnel(); } });
  function setEx(m) {
    if (st.exMode !== m) recEv('ex', m);
    st.exMode = m;
    document.querySelectorAll('[data-ex]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ex === m)));
    pushCfg();
  }
  document.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => setEx(+b.dataset.ex)));
  setEx(st.exMode);
  // velgere for bil og lydanlegg; bytte underveis tones ut og inn i motoren (ca. 150 ms)
  function showCar() {
    const p = prof(); $('#carTag').textContent = p.short.toUpperCase(); $('#startCar').textContent = p.name; $('#startBlurb').textContent = p.blurb;
    const a = ACCENTS[st.car] || ACCENTS.m4csl, rs = document.documentElement.style;
    rs.setProperty('--acc', a[0]); rs.setProperty('--acc2', a[1]); COL.acc = a[0]; COL.acc2 = a[1];
    mediaMeta();
  }
  for (const k in PROFS) $('#car').add(new Option(PROFS[k].name, k));
  for (const k in OUTS) $('#outp').add(new Option(OUTS[k].name, k));
  $('#car').value = st.car; $('#outp').value = st.outId; showCar();
  function setCar(id) {
    if (!PROFS[id]) return;
    saveCfg(); // husk innstillingene for bilen vi forlater
    st.car = id; $('#car').value = id;
    const p = st.cars[id]; // bilens egne innstillinger, ellers arves de som er nå
    if (p) { if (p.vol != null) $('#vol').value = p.vol; if (p.bur != null) $('#bur').value = p.bur; if (p.ex != null) setEx(p.ex); }
    showCar(); pushCfg(); recEv('car', id);
    if (st.started) send({ k: 'profile', p: prof() });
  }
  $('#car').addEventListener('change', () => setCar($('#car').value));
  $('#outp').addEventListener('change', () => { st.outId = $('#outp').value; pushCfg(); recEv('out', st.outId); if (st.started) send({ k: 'out', o: OUTS[st.outId] }); });

  // ---------- tunnel ----------
  function applyTunnel() {
    const on = st.tunManual || st.tunGps || st.tunMap;
    const why = st.tunManual ? 'Ja, slått på for hånd' : st.tunMap ? 'Ja, fra kartet' : st.tunGps ? 'Antatt: GPS-signalet falt ut' : 'Nei';
    $('#dpTun').textContent = why;
    const b = $('#tun');
    b.setAttribute('aria-pressed', String(st.tunManual));
    b.classList.toggle('auto-on', on && !st.tunManual);
    b.textContent = on && !st.tunManual ? 'TUNNEL · AUTO' : 'TUNNEL';
    if (st.tunOn !== on) recEv('tun', on ? why : 0);
    st.tunOn = on;
    if (!st.ctx || !st.tunReady) return;
    const t = st.ctx.currentTime, amt = +$('#tunAmt').value, tau = on ? TUN.tauIn : TUN.tauOut;
    const k = on ? tunK() : 1; // demper tørr vei og klang sammen i tunnel, så summen ikke går inn i mykklipperen
    st.sendG.gain.setTargetAtTime(on ? TUN.send * k : 0, t, on ? TUN.tauIn : 0.05);
    st.wet.gain.setTargetAtTime(on ? TUN.wet * amt : 0, t, tau);
    st.dry.gain.setTargetAtTime(on ? (1 + (TUN.dryBoost - 1) * Math.min(1, amt)) * k : 1, t, tau);
  }
  $('#tun').addEventListener('click', () => { st.tunManual = !st.tunManual; applyTunnel(); });

  // ---------- testmodus ----------
  function pushIn() {
    if (st.mode !== 'test') return;
    const thr = Math.max(st.thrPed, st.thrKey);
    send({ k: 'in', thr: thr, brake: st.brake });
    $('#gasFill').style.height = (thr * 100).toFixed(0) + '%';
    $('#gas').classList.toggle('on', thr > 0);
  }
  function bindPedal(el, onDown, onUp) {
    el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch (x) {} onDown(e, el); e.preventDefault(); });
    el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) onDown(e, el); });
    el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('lostpointercapture', onUp);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindPedal($('#gas'), (e, el) => {
    const r = el.getBoundingClientRect();
    st.thrPed = clamp(1.05 - (e.clientY - r.top) / r.height * 1.1, 0, 1); pushIn();
  }, () => { st.thrPed = 0; pushIn(); });
  const setBrake = (on) => { st.brake = on ? 1 : 0; $('#brake').classList.toggle('on', on); pushIn(); };
  bindPedal($('#brake'), () => setBrake(true), () => setBrake(false));

  // pointerdown (ikke click) gir kortest vei fra finger til lyd
  const tap = (el, fn) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn(); } });
  };
  tap($('#up'), () => send({ k: 'shift', d: 1 }));
  tap($('#dn'), () => send({ k: 'shift', d: -1 }));
  function setAuto(on) { st.auto = on; $('#auto').setAttribute('aria-pressed', String(on)); $('#auto').textContent = on ? 'AUTO' : 'MANUELL'; pushCfg(); }
  $('#auto').addEventListener('click', () => setAuto(!st.auto));

  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  addEventListener('keydown', (e) => {
    if (e.repeat || typing(e) || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') { st.keyGas = true; e.preventDefault(); }
    else if (k === ' ' || k === 'arrowdown' || k === 's') { setBrake(true); e.preventDefault(); }
    else if (k === 'e' || k === 'arrowright') send({ k: 'shift', d: 1 });
    else if (k === 'q' || k === 'arrowleft') send({ k: 'shift', d: -1 });
    else if (k === 'a') setAuto(!st.auto);
    else if (k === 't') { st.tunManual = !st.tunManual; applyTunnel(); }
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') st.keyGas = false;
    else if (k === ' ' || k === 'arrowdown' || k === 's') setBrake(false);
  });
  addEventListener('blur', () => { st.keyGas = false; st.thrPed = 0; setBrake(false); });

  // ---------- modus ----------
  function setMode(m) {
    st.mode = m; document.body.dataset.mode = m; recEv('mode', m);
    $('#mTest').setAttribute('aria-pressed', String(m === 'test')); $('#mDrive').setAttribute('aria-pressed', String(m === 'drive'));
    st.thrPed = 0; st.thrKey = 0; st.keyGas = false; st.brake = 0; $('#brake').classList.remove('on'); $('#gas').classList.remove('on'); $('#gasFill').style.height = '0%';
    if (m === 'test') { st.tunGps = false; st.tunMap = false; applyTunnel(); }
    if (st.started) { send({ k: 'mode', drive: m === 'drive' }); pushCfg(); }
  }
  $('#mTest').addEventListener('click', () => setMode('test'));
  // Bytte til kjøremodus er selv trykket som iOS krever for bevegelsessensoren.
  $('#mDrive').addEventListener('click', () => { const p = st.started && !S.on ? askMotion() : null; setMode('drive'); if (p) enableSensors(p); });

  // =====================================================================
  // Kjøremodus: GPS + bevegelsessensor
  // =====================================================================
  const S = { on: false, vEst: 0, gpsV: null, gpsT: 0, aGps: 0, aGpsT: 0, F: [0, 0, 0], fwd: null, gLP: null, lastT: 0, aF: 0, bias: 0,
    thr: 0, brk: 0, motionT: 0, motionSeen: false, gpsSeen: false, motionDenied: false,
    lat: null, lon: null, hdg: null, acc: null, accBase: 12, lastGood: 0, goodN: 0, everGood: false, vHold: 0, tickT: 0, uiT: 0,
    hist: [], fixNow: 0, rotHold: 0, gRef: null, offT: 0, grade: 0, gBase: 0, saveT: 0,
    dir: 'F', rI: 0, heldT: 0, rv0: null, rvA: null, rvP: null, rvB: 0, rvLast: null, aRaw: NaN, aLin: NaN, rot: 0, lift: false,
    lag: 120, lagN: 0, lagOk: false, lagA: [], lagF: [], cumA: 0, badN: 0, lagAT: 0, lagT: 0, lagPend: null };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => Math.hypot(a[0], a[1], a[2]);
  // GPS-forsinkelse (ms, S.lag): hvor gammel GPS-farten er når den kommer. Målt fortløpende (lagEst), startverdi 120 ms
  // (første ekte kjøretur med iPhone: 0,11 s; tidligere antatt 1,0 s). Lagres med kalibreringen.
  const LAG_MIN = 50, LAG_MAX = 1500;

  // ---- lagret kalibrering (hvilken vei som er fremover i telefonen) ----
  const CAL_KEY = 'm4cal', CAL_MAX_AGE = 14 * 864e5;
  function calLoad() {
    try {
      const c = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
      if (!c || !(Date.now() - c.t < CAL_MAX_AGE)) return;
      if (typeof c.lag === 'number' && isFinite(c.lag)) { S.lag = clamp(c.lag, LAG_MIN, LAG_MAX); S.lagOk = true; }
      if (!Array.isArray(c.F) || !Array.isArray(c.g)) return;
      const fin = (a) => a.length === 3 && a.every((x) => typeof x === 'number' && isFinite(x));
      if (!fin(c.F) || !fin(c.g)) return;
      const F = c.F, g = c.g, m = nrm(F);
      if (!(m > 2 && m < 20.5) || !(Math.abs(nrm(g) - 1) < 0.05) || Math.abs(dot(F, g)) / m > 0.3) return;
      S.F = F; S.fwd = F.map((x) => x / m); S.gRef = g;
      S.gBase = clamp(+c.gb || 0, -0.05, 0.05); S.bias = clamp(+c.b || 0, -0.5, 0.5);
    } catch (e) {}
  }
  function calSave() {
    if (!S.fwd || !S.gRef) return;
    try { localStorage.setItem(CAL_KEY, JSON.stringify({ t: Date.now(), F: S.F, g: S.gRef, gb: S.gBase, b: S.bias, lag: S.lagOk ? Math.round(S.lag) : undefined })); } catch (e) {}
  }
  function calReset() { // GPS-forsinkelsen hører til telefonen, ikke holderen: den beholdes i minnet og lagres med neste kalibrering
    S.F = [0, 0, 0]; S.fwd = null; S.gRef = null; S.offT = 0; S.grade = 0; S.gBase = 0; S.bias = 0; S.rv0 = null; S.dir = 'F';
    try { localStorage.removeItem(CAL_KEY); } catch (e) {}
  }
  calLoad();
  $('#calReset').addEventListener('click', () => {
    calReset();
    $('#calReset').textContent = 'Kalibrering nullstilt';
    setTimeout(() => { $('#calReset').textContent = 'Nullstill kalibrering'; }, 2500);
  });

  // ---- historikk: estimert fart og akselerasjon de siste sekundene, for å sammenligne med forsinket GPS ----
  function histPush(now, h, ok) {
    S.hist.push({ t: now, v: S.vEst, a: S.aF, h: h, ok: ok, r: S.rI });
    while (S.hist.length && S.hist[0].t < now - 3000) S.hist.shift();
  }
  function histAt(t) {
    const H = S.hist;
    if (!H.length || t < H[0].t - 100 || t > H[H.length - 1].t + 100) return null;
    let best = H[0];
    for (const x of H) if (Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
    return best;
  }
  function histWin(t0, t1) { // snitt av akselerasjon og "vannrett" sensorvektor i et tidsvindu
    let n = 0, a = 0, ok = true; const h = [0, 0, 0];
    for (const x of S.hist) {
      if (x.t < t0 || x.t > t1) continue;
      n++; a += x.a; ok = ok && x.ok;
      if (x.h) { h[0] += x.h[0]; h[1] += x.h[1]; h[2] += x.h[2]; } else ok = false;
    }
    return n ? { n: n, a: a / n, h: [h[0] / n, h[1] / n, h[2] / n], ok: ok } : { n: 0 };
  }

  // ---- måling av GPS-forsinkelsen: endringen i GPS-fart mellom to punkter mot integralet av akselerometeret over det
  // samme tidsrommet flyttet 0-2 s tilbake; forsinkelsen er flyttingen med best korrelasjon (Pearson, så en konstant
  // skjevhet i akselerometeret ikke teller). Vindu 45 s, ny måling hvert 10. s, bare med nok fartsendring.
  function lagRec(now, a, dt) { // fra fuse(): a = rå akselerasjon langs fremover, null = upålitelig (rykk, ukalibrert, revers)
    if (a === null) S.badN++; else S.cumA += a * dt;
    if (now - S.lagAT < 50) return;
    S.lagAT = now; S.lagA.push({ t: now, c: S.cumA, b: S.badN });
    while (S.lagA[0].t < now - 65000) S.lagA.shift();
  }
  function lagAt(t) { // integral og antall dårlige prøver ved tid t (lineært), null utenfor
    const A = S.lagA; let lo = 0, hi = A.length - 1;
    if (hi < 1 || t < A[0].t || t > A[hi].t) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m].t <= t) lo = m; else hi = m; }
    const x = A[lo], y = A[hi], k = y.t > x.t ? (t - x.t) / (y.t - x.t) : 0;
    return { c: x.c + (y.c - x.c) * k, b: k > 0 ? y.b : x.b };
  }
  function lagEst(now) {
    S.lagT = now;
    const F = S.lagF, P = [];
    for (let k = 1; k < F.length; k++) { // GPS-fart under 2 m/s er treg og upålitelig på iPhone (målt): ikke med
      const dt = F[k].t - F[k - 1].t;
      if (dt > 500 && dt < 2500 && F[k].v >= 2 && F[k - 1].v >= 2) P.push([F[k - 1].t, F[k].t, F[k].v - F[k - 1].v]);
    }
    if (P.length < 20) return;
    let m = 0, sd = 0; for (const p of P) m += p[2]; m /= P.length; for (const p of P) sd += (p[2] - m) ** 2; sd = Math.sqrt(sd / P.length);
    if (sd < 0.25) return; // jevn fart: for lite å korrelere mot
    let best = null; const R = [];
    for (let lag = 0; lag <= 2000; lag += 25) {
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (const p of P) {
        const a = lagAt(p[0] - lag - 60), b = lagAt(p[1] - lag + 60);
        if (!a || !b || b.b !== a.b) continue; // rykk eller hull i vinduet
        const x = p[2], y = lagAt(p[1] - lag).c - lagAt(p[0] - lag).c;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      }
      const vx = sxx - sx * sx / n, vy = syy - sy * sy / n, r = n >= 15 && vx > 0 && vy > 0 ? (sxy - sx * sy / n) / Math.sqrt(vx * vy) : NaN;
      R.push(r);
      if (r === r && (!best || r > best.r)) best = { i: R.length - 1, r: r, n: n };
    }
    if (!best) return;
    let est = best.i * 25;
    const r0 = R[best.i - 1], r2 = R[best.i + 1]; // parabel gjennom toppen
    if (r0 === r0 && r2 === r2) { const den = r0 - 2 * best.r + r2; if (den < 0) est += 12.5 * (r0 - r2) / den; }
    const ok = best.r >= 0.8 && est < 1975;
    est = clamp(est, LAG_MIN, LAG_MAX);
    // Stort sprang fra dagens verdi: krever to målinger på rad som er enige, ellers kan ett rart vindu flytte den
    let use = ok;
    if (ok && Math.abs(est - S.lag) > 400) { use = S.lagPend !== null && Math.abs(est - S.lagPend) < 250; S.lagPend = est; }
    else if (ok) S.lagPend = null;
    if (use) { S.lag = clamp(S.lag + (est - S.lag) * 0.3, LAG_MIN, LAG_MAX); S.lagN++; S.lagOk = true; }
    recEv('lag', { est: Math.round(est), r: Math.round(best.r * 100) / 100, n: best.n, use: use ? 1 : 0, lag: Math.round(S.lag) });
  }
  function lagFix(now, v) { // fra onGps, hvert gode punkt
    S.lagF.push({ t: now, v: v });
    while (S.lagF[0].t < now - 45000) S.lagF.shift();
    if (now - S.lagT >= 10000) lagEst(now);
  }

  // Felles fusjon: langsgående akselerasjon -> fart, gass og brems. held: telefonen rykkes/løftes, frys gass og brems.
  function fuse(aLong, dt, h, held) {
    // Rygging: integral av rå akselerasjon langs "fremover" (fortegnet), og når den sist var upålitelig.
    if (held || !h || !S.fwd) S.heldT = performance.now(); else S.rI += aLong * dt;
    const sg = S.dir === 'R' ? -1 : 1; // i revers peker fartsretningen bakover
    lagRec(performance.now(), held || !h || !S.fwd || sg < 0 ? null : aLong, dt);
    S.aF += ((held ? 0 : sg * aLong) - S.aF) * Math.min(1, dt / 0.035);
    let v = S.vEst + S.aF * dt;
    if (st.tunGps || st.tunMap) v += (S.vHold - v) * dt / 25; // uten GPS: ikke la integrasjonen drive av gårde
    // GPS sier stopp: hold farten på null, men ikke når akselerometeret ser at vi kjører av gårde (GPS-farten er litt gammel)
    if (S.gpsV !== null && S.gpsV < 0.3 && performance.now() - S.lastGood < 2500 && S.aF < 0.4) v = 0;
    S.vEst = v = clamp(v, 0, 90);
    // revers bremset til null (fart eller sensorintegral), eller urimelig lenge: neste start er fremover til det motsatte er vist
    if (sg < 0 && (v < 0.05 || !S.rvA || rvNow(S.rvA) > -0.2 || performance.now() - S.rvA.t > 40000)) S.dir = 'F';
    const aDrag = 0.12 + 0.00026 * v * v;
    const aAvail = Math.min(9.5, 344000 / (1750 * Math.max(v, 4)));
    // Bakke: tyngdekraftens bidrag langs veien. Opp: trengs gass for å holde farten; ned: holde farten er å slippe.
    const aEff = S.aF + (v > 2 ? 9.81 * S.grade * sg : 0);
    let t;
    // elbil: regenerering ved slipp = motorbrems. Slipp under -0,35 m/s², ut av slipp over -0,2 (hysterese mot støy).
    S.lift = v >= 0.5 && (aEff < -0.35 || (S.lift && aEff < -0.2));
    if (v < 0.5) t = clamp(S.aF / 4, 0, 1);
    else if (S.lift) t = 0;
    // Ellers minst 0,1: gassen skal aldri ligge rundt motorens slipp-terskler (0,05 inn, 0,08 ut). I bykjøring med
    // -0,35..0 m/s² ga den gamle formelen 0,03-0,10 og girjakt (kjøreloggen: 2>3>2 ved 9 m/s); +0.04: jevn fart.
    else t = Math.max(0.1, Math.pow(clamp(1.3 * (aEff + aDrag) / aAvail + 0.04, 0, 1), 0.8));
    const b = v > 0.5 ? clamp((-S.aF - 2.0) / 5, 0, 1) : 0; // hardere enn vanlig regen regnes som brems
    if (!held) {
      S.thr += (t - S.thr) * Math.min(1, dt / (t > S.thr ? 0.03 : 0.08));
      S.brk += (b - S.brk) * Math.min(1, dt / 0.1);
    }
    histPush(performance.now(), h, !held);
    recRow(performance.now());
    // Revers: motoren blir i 1. gir på lavt turtall (fart ×0,8 som R-utvekslingen, maks 3,4 m/s ≈ 1500 o/min), dempet gass.
    if (st.mode === 'drive') send(sg < 0 ? { k: 'drive', v: Math.min(S.vEst * 0.8, 3.4), thr: Math.min(S.thr, 0.5), brake: S.brk }
      : { k: 'drive', v: S.vEst, thr: S.thr, brake: S.brk });
  }

  // ---- revers: GPS-farten har ikke fortegn. Retningen avgjøres bare når bilen kjører fra stillstand, ved å
  // integrere akselerasjonen langs lært "fremover" fra et rolig øyeblikk i stillstand til fixen som viser fart.
  // Fremover gir +fart, revers -fart. Usikkert, ugyldig eller høy fart: fremover (falsk revers er verst).
  const RV_GO = 0.8, RV_MAXV = 4, RV_OUT = 8;
  function setDir(d, v) { if (d === 'R') S.vEst = Math.max(S.vEst, v); S.dir = d; }
  function rvNow(r0) { return S.rI - r0.r - S.rvB * (performance.now() - r0.t) / 1000; } // fortegnet fart nå, fra ankeret
  function quietAt(t0, t1) { // siste historikkpunkt der snittakselerasjonen ±0,25 s er nær null
    const H = S.hist;
    for (let i = H.length - 16; i >= 15; i--) {
      if (H[i].t > t1) continue;
      if (H[i].t < t0) break;
      const a = (H[i + 15].r - H[i - 15].r) / ((H[i + 15].t - H[i - 15].t) / 1000) - S.rvB;
      if (Math.abs(a) < 0.3) return H[i];
    }
    return null;
  }
  function dirFix(v, now) {
    // Før forsinkelsen er målt (eller lest fra lagret kalibrering): den gamle antakelsen 1,0 s, som reverslogikken tåler
    // 0,5-1,6 s rundt. Startverdien 0,12 s gir feil fortegn i korte parkeringsmanøvrer hvis telefonen har 1,5 s.
    const lag = S.lagOk ? S.lag : 1000;
    const tP = now - lag, p = histAt(tP), prev = S.rvP;
    S.rvP = p ? { t: tP, r: p.r, v: v } : null;
    if (!p) { S.rv0 = null; if (S.dir === 'R') setDir('F'); return; }
    const live = S.motionSeen && now - S.motionT < 600 && !!S.fwd;
    if (v < 0.3) { // stillstand: retningen kan bare skifte her
      if (S.dir === 'R') setDir('F');
      // Anker = siste rolige øyeblikk (fart null) fra 1,6 s (eller forsinkelsen + 0,6 s) tilbake til forsinkelsen - 0,5 s:
      // tåler at forsinkelsen avviker noe fra den som brukes.
      const r0 = S.rv0, a0 = quietAt(now - Math.max(1600, lag + 600), now - lag + 500);
      if (!a0) return; // ingen rolig stund i vinduet (GPS-støy i lav fart): behold forrige anker
      if (r0 && live && S.heldT < r0.t && a0.t - r0.t > 500) { // nullpunkt i ro; vinduer med bevegelse forkastes
        const b = (a0.r - r0.r) / ((a0.t - r0.t) / 1000);
        if (Math.abs(b) < 0.25) S.rvB += (b - S.rvB) * 0.3;
      }
      S.rv0 = { t: a0.t, r: a0.r };
      return;
    }
    if (S.dir === 'R') { // ut av revers: for fort, eller sensor og GPS-akselerasjon har samme fortegn (= fremover)
      let out = v > RV_OUT || !live;
      if (!out && prev && S.heldT < prev.t && tP - prev.t > 300) {
        const T = (tP - prev.t) / 1000, ag = (v - prev.v) / T, a = (p.r - prev.r) / T - S.rvB;
        out = Math.abs(ag) > 0.5 && a * ag > 0.3 * ag * ag;
      }
      if (out) setDir('F');
      return;
    }
    if (!S.rv0 || v < RV_GO) return;
    const r0 = S.rv0, T = (tP - r0.t) / 1000;
    if (!live || S.heldT >= r0.t || T > 6 || v > RV_MAXV) { S.rv0 = null; return; }
    const u = p.r - r0.r - S.rvB * T, lim = Math.max(0.4, 0.5 * v); // u: fortegnet fart langs "fremover" da fixen gjaldt
    if (Math.abs(u) < lim) return; // uklart (GPS-tiden kan avvike fra antatt): vent på neste fix, kjør som fremover
    S.rv0 = null; S.rvLast = { u: u, v: v, T: T };
    // revers bare hvis sensorene sier at bilen fortsatt ruller bakover nå (sen avgjørelse etter at den har stoppet: nei)
    if (u < 0 && u > -(2.5 * v + 1) && rvNow(r0) < -0.3) { S.rvA = r0; setDir('R', v); }
  }

  function onGps(pos) {
    const c = pos.coords, now = performance.now(), t = pos.timestamp / 1000;
    S.gpsSeen = true;
    const acc = c.accuracy || 999;
    const hasV = c.speed != null && !isNaN(c.speed) && c.speed >= 0;
    const good = hasV && acc <= Math.max(35, 2.5 * S.accBase);
    S.acc = acc;
    recGps(c, pos.timestamp, good, now);
    if (good) {
      if (acc < 30) S.accBase += (acc - S.accBase) * 0.1;
      const v = c.speed, tPast = now - S.lag;
      dirFix(v, now);
      lagFix(now, v);
      const learn = S.dir !== 'R' && !(S.rv0 && v >= 0.3); // ikke lær akse/skjevhet i revers eller før retningen er avgjort
      if (S.gpsV !== null) {
        const dt = t - S.gpsT;
        if (dt > 0.3 && dt < 3) {
          S.aGps = (v - S.gpsV) / dt; S.aGpsT = now;
          // Sammenlign med det sensorene målte i det samme (forsinkede) tidsrommet.
          const w = histWin(S.fixNow - S.lag, tPast);
          if (w.n > 5 && w.ok && learn) {
            if (S.fwd) S.bias = clamp(S.bias + (w.a - S.aGps) * 0.08, -1, 1);
            // Lær retningen "fremover" i telefonens akser fra GPS-akselerasjonens fortegn, fortløpende.
            if (Math.abs(S.aGps) > 0.7 && S.vEst > 5) { // over 18 km/t: nesten aldri revers
              const sg = Math.sign(S.aGps);
              for (let i = 0; i < 3; i++) S.F[i] += sg * w.h[i] * dt;
              const m = nrm(S.F); if (m > 20) for (let i = 0; i < 3; i++) S.F[i] *= 20 / m;
            }
          }
        }
      }
      // retning: bruk GPS-kurs, ellers regn fra forrige posisjon
      if (c.heading != null && !isNaN(c.heading) && v > 2) S.hdg = c.heading;
      else if (S.lat !== null && v > 2) {
        const dy = (c.latitude - S.lat) * 110540, dx = (c.longitude - S.lon) * 111320 * Math.cos(c.latitude * Math.PI / 180);
        if (dx * dx + dy * dy > 9) S.hdg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      }
      S.gpsV = v; S.gpsT = t; S.fixNow = now; S.lat = c.latitude; S.lon = c.longitude;
      // Rett opp farten mot det estimatet vi hadde da GPS-målingen gjaldt, ikke mot dagens (ellers sagtann ved akselerasjon).
      const past = histAt(tPast), ref = past ? past.v : S.vEst;
      if (v < 0.3 && S.vEst < 2 && S.aF < 0.4) S.vEst = 0;
      else {
        const d = (v - ref) * (S.motionSeen && now - S.motionT < 500 ? 0.4 : 0.8);
        S.vEst = clamp(S.vEst + d, 0, 90);
        for (const x of S.hist) x.v += d;
      }
      S.vHold = S.vEst;
      S.lastGood = now; S.goodN++; S.everGood = true;
      if (st.tunGps && S.goodN >= 2) { st.tunGps = false; applyTunnel(); }
      mapUpdate(now);
    } else {
      S.goodN = 0;
      // iPhone gir ofte fart -1 når bilen står: med god posisjon og lav fart sist regnes det som stillstand for reversvalget
      if (!hasV && acc <= Math.max(35, 2.5 * S.accBase) && S.gpsV !== null && S.gpsV < 0.6 && now - S.lastGood < 3000) dirFix(0, now);
    }
    $('#dpGps').textContent = good ? 'OK, ±' + Math.round(acc) + ' m' : hasV ? 'Svakt, ±' + Math.round(acc) + ' m' : 'Gir ikke fart';
  }
  function onGpsErr(err) {
    S.goodN = 0;
    $('#dpGps').textContent = err.code === 1 ? 'Blokkert. Tillat posisjon for Safari (Innstillinger › Personvern › Stedstjenester) og last siden på nytt.'
      : err.code === 2 ? 'Ingen posisjon tilgjengelig. Sjekk at Stedstjenester er på.' : 'Venter på GPS-signal …';
    recEv('gpsErr', err.code);
  }

  function onMotion(e) {
    const ag = e.accelerationIncludingGravity, a = e.acceleration;
    if (!ag || ag.x == null) return;
    const now = performance.now();
    const dt = S.lastT ? clamp((now - S.lastT) / 1000, 0.001, 0.05) : 0.016; S.lastT = now;
    S.motionSeen = true; S.motionT = now;
    // Telefonen dreies raskt (tas ut av holderen, slag): ikke tolk rykkene som gass eller brems.
    const rr = e.rotationRate;
    S.rot = rr ? Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0) : NaN;
    if (S.rot > 80) S.rotHold = now + 700;
    const held = now < S.rotHold;
    let lin, g; const osLin = !!(a && a.x != null);
    if (osLin) { lin = [a.x, a.y, a.z]; g = [ag.x - a.x, ag.y - a.y, ag.z - a.z]; }
    else {
      const x = [ag.x, ag.y, ag.z];
      if (!S.gLP) S.gLP = x.slice();
      const k = dt / 4; for (let i = 0; i < 3; i++) S.gLP[i] += (x[i] - S.gLP[i]) * k;
      g = S.gLP; lin = [x[0] - g[0], x[1] - g[1], x[2] - g[2]];
    }
    const gn = nrm(g) || 9.81, gh = [g[0] / gn, g[1] / gn, g[2] / gn];
    const dv = dot(lin, gh), ah = [lin[0] - dv * gh[0], lin[1] - dv * gh[1], lin[2] - dv * gh[2]];
    const fm = nrm(S.F);
    if (fm > 2) { S.fwd = [S.F[0] / fm, S.F[1] / fm, S.F[2] / fm]; if (!S.gRef) S.gRef = gh.slice(); }
    if (S.fwd && S.gRef && !held) {
      // Står telefonen tydelig annerledes enn da den ble kalibrert (flyttet i holderen), lær retningen på nytt.
      S.offT = dot(gh, S.gRef) < 0.9 ? S.offT + dt : Math.max(0, S.offT - dt);
      if (S.offT > 3) calReset();
      else {
        S.gRef = S.gRef.map((x, i) => x + (gh[i] - x) * dt / 120);
        const gm = nrm(S.gRef); S.gRef = S.gRef.map((x) => x / gm);
      }
    }
    // Stigning: tyngdens komponent langs "fremover" (null på flat vei fordi retningen læres vinkelrett på tyngden).
    // Bare med operativsystemets egen tyngdeseparasjon; den lavpassede reserven blandes med akselerasjon.
    if (S.fwd && osLin && !held) {
      const sl = dot(gh, S.fwd);
      S.gBase = clamp(S.gBase + (sl - S.gBase) * dt / 600, -0.05, 0.05);
      S.grade += (clamp(sl - S.gBase, -0.1, 0.1) - S.grade) * Math.min(1, dt / 1.5);
    } else if (!S.fwd) S.grade = 0;
    const aLong = S.fwd ? dot(ah, S.fwd) - clamp(S.bias, -0.5, 0.5) : (now - S.aGpsT < 2500 ? S.aGps : 0);
    // for kjøreloggen: rå akselerasjon (med tyngde) og tyngdeseparert, begge langs lært fremover
    S.aRaw = S.fwd ? dot([ag.x, ag.y, ag.z], S.fwd) : NaN; S.aLin = S.fwd ? aLong : NaN;
    fuse(aLong, dt, ah, held);
  }

  // Går fire ganger i sekundet: reserve uten bevegelsessensor, GPS-vakt for tunnel, statuslinjer.
  function driveTick() {
    const now = performance.now(), dt = S.tickT ? clamp((now - S.tickT) / 1000, 0.01, 1) : 0.25; S.tickT = now;
    if (st.mode !== 'drive') return;
    const motionLive = S.motionSeen && now - S.motionT < 600;
    if (!motionLive) { S.aRaw = S.aLin = NaN; fuse(now - S.aGpsT < 1300 ? S.aGps : 0, dt, null, false); }
    if (S.fwd && motionLive && now - S.saveT > 30000) { S.saveT = now; calSave(); }
    // GPS-vakt: i fart, og så blir det stille fra GPS-en
    if ($('#tunGps').checked && S.everGood) {
      const age = now - S.lastGood;
      if (!st.tunGps && age > 2200 && S.vEst > 4) { st.tunGps = true; S.vHold = S.vEst; applyTunnel(); }
      // sikkerhetsnett: står bilen stille lenge uten GPS, er det neppe en tunnel vi kjører i
      if (st.tunGps && S.vEst < 0.5 && age > 20000) { st.tunGps = false; applyTunnel(); }
    }
    mapDeadReckon(dt, now);
    $('#dpMot').textContent = S.motionDenied ? 'Avslått. Bruker bare GPS (tregere).' : !S.motionSeen ? 'Venter …' : !motionLive ? 'Stoppet' : now < S.rotHold ? 'Telefonen beveges, gass holdes' : S.fwd ? 'Kalibrert' : 'Kalibrerer: gi gass rett frem';
    $('#dpV').textContent = Math.round(S.vEst * 3.6) + ' km/t';
    $('#dpT').textContent = Math.round(S.thr * 100) + ' % / ' + Math.round(S.brk * 100) + ' %';
    const lagS = 'ca. ' + (S.lag / 1000).toFixed(2).replace('.', ',') + ' s' + (S.lagOk ? '' : ' (ikke målt ennå)');
    if ($('#dpLag').textContent !== lagS) $('#dpLag').textContent = lagS;
  }

  function askMotion() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        return DeviceMotionEvent.requestPermission().then((r) => r === 'granted', () => false);
      }
    } catch (e) {}
    return Promise.resolve(true);
  }
  async function enableSensors(motionP) {
    if (S.on) return;
    S.on = true;
    $('#sensBtn').hidden = true;
    $('#dpMsg').textContent = 'Ber om tilgang til sensorer …';
    const ok = await (motionP || askMotion());
    S.motionDenied = !ok;
    if (ok) addEventListener('devicemotion', onMotion);
    else { $('#dpMsg').innerHTML = '<span class="warn">Bevegelsessensoren er avslått.</span> Lyden følger bare GPS (tregere). Trykk Prøv igjen og svar Tillat; har du svart Ikke tillat, lukk fanen og åpne siden på nytt.'; $('#sensBtn').hidden = false; $('#sensBtn').textContent = 'Prøv igjen'; S.retry = true; }
    if (navigator.geolocation) {
      try { navigator.geolocation.watchPosition(onGps, onGpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }); }
      catch (e) { $('#dpGps').textContent = 'Blokkert'; }
    } else $('#dpGps').textContent = 'Ikke støttet';
    setInterval(driveTick, 250);
    wakeLock();
    setTimeout(() => {
      if (S.motionDenied && S.gpsSeen) return; // avslag-meldingen over står
      const miss = [!S.gpsSeen ? 'GPS' : '', !S.motionSeen ? 'bevegelsesdata' : ''].filter(Boolean);
      if (miss.length) {
        $('#dpMsg').innerHTML = '<span class="warn">Mangler ' + miss.join(' og ') + '.</span> Sensorer virker bare når siden er åpnet i Safari fra sin egen https-adresse, og du har svart ja på spørsmålene. Bruk testmodus her.';
        $('#sensBtn').hidden = false; $('#sensBtn').textContent = 'Prøv igjen'; S.retry = true;
      } else $('#dpMsg').textContent = 'Sensorer aktive. Første gang du gir gass rett frem, lærer appen hvilken vei som er fremover. La skjermen stå på.';
    }, 4500);
  }
  $('#sensBtn').addEventListener('click', () => {
    if (S.retry) { // nytt forsøk: be om bevegelse på nytt i dette trykket
      askMotion().then((ok) => { S.motionDenied = !ok; if (ok) { removeEventListener('devicemotion', onMotion); addEventListener('devicemotion', onMotion); } });
      $('#dpMsg').textContent = 'Prøver igjen …';
      return;
    }
    enableSensors(askMotion());
  });

  // ---------- kartlag: tunneler fra OpenStreetMap (valgfritt) ----------
  const MAP = { ways: [], qLat: null, qLon: null, qT: 0, busy: false, wait: 20000, failN: 0, inWay: null, remain: 0, lost: 0 };
  const mapAllowed = () => $('#tunMap').checked && location.protocol === 'https:' && navigator.onLine !== false;
  const toXY = (lat, lon, lat0, lon0) => [(lon - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180), (lat - lat0) * 110540];
  function ahead(lat, lon, hdg, m) {
    const r = hdg * Math.PI / 180;
    return [lat + Math.cos(r) * m / 110540, lon + Math.sin(r) * m / (111320 * Math.cos(lat * Math.PI / 180))];
  }
  async function mapFetch(lat, lon, hdg) {
    MAP.busy = true; MAP.qT = performance.now();
    const f = '[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"][tunnel~"^(yes|building_passage|avalanche_protector)$"]';
    let q = '[out:json][timeout:8];(way(around:1200,' + lat.toFixed(5) + ',' + lon.toFixed(5) + ')' + f + ';';
    if (hdg != null) { const p = ahead(lat, lon, hdg, 1500); q += 'way(around:1200,' + p[0].toFixed(5) + ',' + p[1].toFixed(5) + ')' + f + ';'; }
    q += ');out geom;';
    const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let ok = false;
    for (const h of hosts) {
      try {
        const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 9000);
        const r = await fetch(h, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal });
        clearTimeout(tm);
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        const seen = new Set(MAP.ways.map((w) => w.id));
        for (const el of (j.elements || [])) if (el.type === 'way' && el.geometry && el.geometry.length > 1 && !seen.has(el.id)) MAP.ways.push({ id: el.id, g: el.geometry });
        if (MAP.ways.length > 400) MAP.ways.splice(0, MAP.ways.length - 400);
        ok = true; break;
      } catch (e) {}
    }
    MAP.qLat = lat; MAP.qLon = lon;
    if (ok) { MAP.failN = 0; MAP.wait = 20000; } else { MAP.failN++; MAP.wait = Math.min(600000, 20000 * Math.pow(2, MAP.failN)); }
    MAP.busy = false;
  }
  // Finn tunnelsegment nær et punkt. Retningen må stemme, så en vei som krysser over en tunnel ikke slår ut.
  function mapMatch(lat, lon, hdg, tol) {
    let best = null;
    for (const w of MAP.ways) {
      for (let i = 0; i + 1 < w.g.length; i++) {
        const a = toXY(w.g[i].lat, w.g[i].lon, lat, lon), b = toXY(w.g[i + 1].lat, w.g[i + 1].lon, lat, lon);
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = clamp(-(a[0] * dx + a[1] * dy) / L2, 0, 1), px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(px, py);
        if (d > tol || (best && d >= best.d)) continue;
        let fwd = true;
        if (hdg != null) {
          const brg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; let df = Math.abs(brg - hdg) % 360; if (df > 180) df = 360 - df;
          if (df > 40 && df < 140) continue;
          fwd = df <= 40;
        }
        best = { d: d, w: w, i: i, t: t, fwd: fwd };
      }
    }
    return best;
  }
  function wayRemain(m) { // meter igjen av tunnelen i kjøreretningen, medregnet veier som henger sammen
    const segLen = (w, i) => { const a = w.g[i], b = w.g[i + 1], p = toXY(b.lat, b.lon, a.lat, a.lon); return Math.hypot(p[0], p[1]); };
    let w = m.w, len = segLen(w, m.i) * (m.fwd ? 1 - m.t : m.t);
    if (m.fwd) for (let i = m.i + 1; i + 1 < w.g.length; i++) len += segLen(w, i); else for (let i = 0; i < m.i; i++) len += segLen(w, i);
    let end = m.fwd ? w.g[w.g.length - 1] : w.g[0];
    const used = new Set([w.id]);
    for (let hop = 0; hop < 20; hop++) {
      let nx = null;
      for (const c of MAP.ways) {
        if (used.has(c.id)) continue;
        const s = c.g[0], e = c.g[c.g.length - 1];
        const ds = toXY(s.lat, s.lon, end.lat, end.lon), de = toXY(e.lat, e.lon, end.lat, end.lon);
        if (Math.hypot(ds[0], ds[1]) < 4) { nx = { c: c, end: e }; break; }
        if (Math.hypot(de[0], de[1]) < 4) { nx = { c: c, end: s }; break; }
      }
      if (!nx) break;
      used.add(nx.c.id); for (let i = 0; i + 1 < nx.c.g.length; i++) len += segLen(nx.c, i); end = nx.end;
    }
    return len;
  }
  function mapUpdate(now) { // kalles ved hver gode GPS-posisjon
    if (!mapAllowed() || S.lat === null) { if (st.tunMap) { st.tunMap = false; applyTunnel(); } return; }
    let moved = 1e9;
    if (MAP.qLat !== null) { const p = toXY(S.lat, S.lon, MAP.qLat, MAP.qLon); moved = Math.hypot(p[0], p[1]); }
    if (!MAP.busy && now - MAP.qT > MAP.wait && (moved > 600 || now - MAP.qT > 180000) && (S.vEst > 2 || MAP.qLat === null)) mapFetch(S.lat, S.lon, S.vEst > 3 ? S.hdg : null);
    const hdg = S.vEst > 3 ? S.hdg : null, tol = clamp(S.acc || 15, 15, 40);
    // se litt frem: GPS-posisjonen er litt gammel, og klangen skal være på når vi kjører inn
    const p = hdg != null ? ahead(S.lat, S.lon, hdg, S.vEst * 1.5) : [S.lat, S.lon];
    const m = mapMatch(p[0], p[1], hdg, tol) || mapMatch(S.lat, S.lon, hdg, tol);
    if (m) { MAP.remain = wayRemain(m) + S.vEst * 1.5; MAP.lost = 0; if (!st.tunMap) { st.tunMap = true; S.vHold = S.vEst; applyTunnel(); } }
    else if (st.tunMap) { st.tunMap = false; applyTunnel(); }
  }
  function mapDeadReckon(dt, now) { // uten GPS inne i tunnelen: tell ned gjenstående lengde med estimert fart
    if (!st.tunMap) return;
    if (now - S.lastGood < 1800) return;
    MAP.remain -= S.vEst * dt;
    if (MAP.remain < -60) { st.tunMap = false; applyTunnel(); } // GPS-vakten holder klangen til signalet er tilbake
  }

  // ---------- turteller ----------
  // Det stillestående laget tegnes én gang per størrelse/bil/farge i et eget lerret; hvert bilde tegner bare
  // tente segmenter, skiftelys, viser og tall (ingen shadowBlur).
  const cvs = $('#gauge');
  let GL = null;
  function gaugeLayer(w, h, dpr) {
    const p = prof(), key = [w, h, dpr, st.car, COL.acc].join();
    if (GL && GL.key === key) return GL;
    const tc = p.tach, MAX = tc.max, red = tc.red, warn = tc.warn;
    const ledH = clamp(h * 0.045, 9, 15), R = Math.max(30, Math.min((w - 8) / 2, (h - ledH - 16) / 1.9));
    const top = Math.max(2, (h - (ledH + 12 + 1.9 * R)) / 2), cx = w / 2, cy = top + ledH + 12 + R;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = (r) => a0 + (a1 - a0) * r / MAX;
    const segR = R * 0.875, segW = R * 0.12, gapA = Math.max(1.6, R * 0.012) / segR, step = 250, seg = [];
    for (let r = 0; r < MAX; r += step) {
      const col = r >= red ? COL.red : r >= warn ? COL.orange : r >= red * 0.7 ? COL.amber : COL.acc;
      seg.push({ r0: r, a0: ang(r) + gapA / 2, a1: ang(r + step) - gapA / 2, col: col });
    }
    const n = 12, LW = Math.min(w - 8, R * 2.05), lg = Math.max(3, LW * 0.012), lw = (LW - lg * (n - 1)) / n, leds = [];
    for (let i = 0; i < n; i++) leds.push({ x: cx - LW / 2 + i * (lw + lg), y: top, w: lw, h: ledH, k: ledH * 0.22 });
    const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // skive
    const fg = g.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R);
    fg.addColorStop(0, '#171a20'); fg.addColorStop(0.7, '#0d0f13'); fg.addColorStop(1, 'rgba(6,7,9,0.6)');
    g.fillStyle = fg; g.beginPath(); g.arc(cx, cy, R * 0.99, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R * 0.99, a0 - 0.08, a1 + 0.08); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.arc(cx, cy, R * 0.66, 0, Math.PI * 2); g.stroke();
    // spor for segmentene
    g.lineWidth = segW;
    for (const s of seg) { g.strokeStyle = s.r0 >= red ? 'rgba(255,45,45,.26)' : '#1a1e25'; g.beginPath(); g.arc(cx, cy, segR, s.a0, s.a1); g.stroke(); }
    // rødt felt innenfor sporet
    g.strokeStyle = COL.red; g.lineWidth = Math.max(2, R * 0.018); g.beginPath(); g.arc(cx, cy, R * 0.79, ang(red), ang(MAX)); g.stroke();
    // streker og tall
    for (let r = 0; r <= MAX; r += 500) {
      const maj = r % 1000 === 0, a = ang(r), r0 = R * (maj ? 0.715 : 0.75), r1 = R * 0.79, rz = r >= red;
      g.strokeStyle = rz ? COL.red : maj ? 'rgba(235,240,246,.85)' : 'rgba(200,210,222,.45)'; g.lineWidth = maj ? Math.max(2, R * 0.016) : Math.max(1, R * 0.008);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      if (maj) {
        g.fillStyle = rz ? COL.red : '#c9d1db'; g.font = 'italic 800 ' + Math.max(12, Math.round(R * 0.095)) + 'px ' + COL.ui;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(r / 1000), cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6);
      }
    }
    // skiftelys av
    for (const d of leds) {
      g.fillStyle = '#15181d'; g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(d.x + d.k, d.y); g.lineTo(d.x + d.w + d.k, d.y); g.lineTo(d.x + d.w - d.k, d.y + d.h); g.lineTo(d.x - d.k, d.y + d.h); g.closePath(); g.fill(); g.stroke();
    }
    GL = { key, cv: c, cx, cy, R, MAX, red, warn, ang, seg, segR, segW, leds };
    return GL;
  }
  function draw(ts) {
    requestAnimationFrame(draw);
    const target = st.keyGas ? 1 : 0;
    if (st.keyGas || st.thrKey > 0) {
      st.thrKey += (target - st.thrKey) * (target > st.thrKey ? 0.3 : 0.45); if (st.thrKey < 0.01 && !target) st.thrKey = 0;
      if (st.mode === 'test' && st.started) pushIn();
    }
    const t = st.tele;
    st.rpmD += (t.rpm - st.rpmD) * 0.6; st.vD += (t.v - st.vD) * 0.3;
    // 30 bilder i sekundet; 15 når bilen har stått stille på tomgang uten pedal i over 20 s; ingenting når siden er skjult
    const p = prof(), drv = st.mode === 'drive';
    const still = t.v < 0.1 && (!drv || S.vEst < 0.1) && !t.shift && !st.brake && Math.max(st.thrPed, st.thrKey, drv ? S.thr : 0) < 0.02 && t.rpm < p.idle + 250;
    if (!still || st.sweepT) st.moveT = ts;
    const slow = ts - Math.max(st.moveT, st.touchT) > 20000;
    if (document.hidden || ts - st.drawT < (slow ? 63 : 30)) return;
    st.drawT = ts; st.frames++;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), w = cvs.clientWidth, h = cvs.clientHeight;
    if (cvs.width !== Math.round(w * dpr) || cvs.height !== Math.round(h * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); }
    const g = cvs.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cvs.width, cvs.height);
    const L = gaugeLayer(w, h, dpr);
    g.drawImage(L.cv, 0, 0); // stillestående lag: skive, segmentspor, streker og tall
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cx, cy, R, MAX, red, ang, seg, segR, segW } = L;
    // feiing ved start: 0 -> rødt felt -> tomgang (~0,9 s), bare visning
    let rp = clamp(st.rpmD, 0, MAX);
    const sw = st.sweepT ? (performance.now() - st.sweepT) / 900 : 2;
    if (sw < 1) { const e = sw < 0.45 ? 1 - Math.pow(1 - sw / 0.45, 3) : 1 - (sw - 0.45) / 0.55; rp = sw < 0.45 ? e * red : rp + (red - rp) * e * e; }
    else st.sweepT = 0;
    // tente segmenter (fargen blir varmere mot det røde feltet) og en svak glød under
    const na = ang(rp);
    g.lineCap = 'butt';
    if (rp > 0) {
      g.globalAlpha = 0.16; g.lineWidth = segW * 2.2; g.strokeStyle = rp > L.warn ? COL.red : COL.acc;
      g.beginPath(); g.arc(cx, cy, segR, ang(0), na); g.stroke(); g.globalAlpha = 1;
    }
    g.lineWidth = segW;
    for (const s of seg) {
      if (s.r0 >= rp) break;
      g.strokeStyle = s.col; g.beginPath(); g.arc(cx, cy, segR, s.a0, Math.min(s.a1, na)); g.stroke();
    }
    // skiftelys: rad med LED-er over skiven, aksent -> gul -> rød, alle blinker ved sperren
    const n = L.leds.length, s0 = red * 0.6, lit = clamp((rp - s0) / (red * 0.985 - s0), 0, 1) * n;
    const flash = t.lim || rp >= red * 0.985, on = !flash || Math.floor(ts / 70) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const d = L.leds[i], isOn = flash ? on : i < lit;
      if (!isOn) continue;
      const c = flash ? COL.red : i < n * 0.42 ? COL.acc : i < n * 0.75 ? COL.amber : COL.red;
      g.fillStyle = c; g.globalAlpha = 0.28; g.fillRect(d.x - 3, d.y - 3, d.w + 6, d.h + 6);
      g.globalAlpha = 1; g.beginPath(); g.moveTo(d.x + d.k, d.y); g.lineTo(d.x + d.w + d.k, d.y); g.lineTo(d.x + d.w - d.k, d.y + d.h); g.lineTo(d.x - d.k, d.y + d.h); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(d.x + d.k * 0.6, d.y + 1, d.w - 1, Math.max(1, d.h * 0.18));
    }
    // viser: spiss kile med myk glød
    const hot = rp > L.warn, cs = Math.cos(na), sn = Math.sin(na), r0 = R * 0.47, r1 = R * 0.97, wd = Math.max(2.5, R * 0.028);
    const blade = (k) => { g.beginPath(); g.moveTo(cx + cs * (r1 + k), cy + sn * (r1 + k)); g.lineTo(cx + cs * r0 - sn * wd * k, cy + sn * r0 + cs * wd * k); g.lineTo(cx + cs * r0 + sn * wd * k, cy + sn * r0 - cs * wd * k); g.fill(); };
    g.fillStyle = hot ? COL.red : COL.acc; g.globalAlpha = 0.3; blade(2.6); g.globalAlpha = 1;
    g.fillStyle = '#ffffff'; blade(1);
    // midten: gir, fart, turtall
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const gear = st.mode === 'drive' && S.dir === 'R' ? 'R' : String(t.gear);
    g.fillStyle = t.lim ? COL.red : t.shift ? COL.acc2 : COL.ink;
    g.font = 'italic 800 ' + Math.round(R * 0.5) + 'px ' + COL.ui;
    g.fillText(gear, cx - R * 0.02, cy + R * 0.12);
    g.fillStyle = COL.ink; g.font = '700 ' + Math.round(R * 0.16) + 'px ' + COL.num;
    g.fillText(String(Math.round(st.vD * 3.6)), cx, cy + R * 0.38);
    g.fillStyle = COL.dim; g.font = 'italic 800 ' + Math.max(12, Math.round(R * 0.065)) + 'px ' + COL.ui;
    g.fillText('KM/T', cx, cy + R * 0.5);
    g.fillStyle = hot ? COL.red : COL.ink; g.font = '600 ' + Math.max(12, Math.round(R * 0.085)) + 'px ' + COL.num;
    g.fillText(String(Math.round(rp / 10) * 10).padStart(4, ' '), cx - R * 0.02, cy + R * 0.76);
    g.fillStyle = COL.dim; g.font = 'italic 800 ' + Math.max(12, Math.round(R * 0.055)) + 'px ' + COL.ui;
    g.fillText('O/MIN', cx, cy + R * 0.87);
    // over giret: ×1000, eller TUNNEL-merke når klangen er på
    g.font = 'italic 800 ' + Math.max(12, Math.round(R * (st.tunOn ? 0.06 : 0.05))) + 'px ' + COL.ui; g.textBaseline = 'middle';
    if (st.tunOn) {
      const tw = g.measureText('TUNNEL').width + 14, th = Math.max(17, R * 0.1), ty = cy - R * 0.37;
      g.fillStyle = COL.acc; g.fillRect(cx - tw / 2, ty - th / 2, tw, th);
      g.fillStyle = '#05070a'; g.fillText('TUNNEL', cx, ty + 1);
    } else if (R > 110) { g.fillStyle = COL.dim; g.fillText('×1000', cx, cy - R * 0.36); }
    const evEl = $('#stEv'), show = performance.now() - st.evT < 1400 ? st.evText : '';
    if (evEl.textContent !== show) evEl.textContent = show;
  }
  requestAnimationFrame(draw);

  // for automatisk test
  window.__m4 = { st: st, S: S, MAP: MAP, fuse: fuse, onGps: onGps, onMotion: onMotion, calReset: calReset, sysTick: sysTick, driveTick: driveTick, lagEst: lagEst, mapMatch: mapMatch, wayRemain: wayRemain, mapUpdate: mapUpdate,
    BUILD: BUILD, REC: REC, recSet: recSet, logData: logData, recPersist: recPersist, recLoad: recLoad, effVol: effVol, vcGain: vcGain, tunK: tunK, vcTick: vcTick, VC_DB: VC_DB, TUN: TUN, TUN_PK: TUN_PK, PEAK_MAX: PEAK_MAX,
    buildGraph: buildGraph, setMuted: setMuted, SW: SW, cleanCfg: cleanCfg, importCfg: importCfg, setCar: setCar, saveCfg: saveCfg, store: store };
})();
