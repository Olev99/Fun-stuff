(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Aksentfarge per bil: [aksent, varmere variant for glød]. Turtallssperren er alltid rød.
  const ACCENTS = { m4csl: ['#29b6ff', '#8fd8ff'], vanqs: ['#2fd18b', '#8ff0bf'], v12vs: ['#ffb020', '#ffd27a'], f12: ['#ff2b2b', '#ff8a7a'],
    gt3: ['#ffd60a', '#fff08a'], lfa: ['#ff5a1f', '#ffa07a'], cgt: ['#c4ccd8', '#ffffff'] };
  const COL = { ink: '#eef2f6', dim: '#98a3b1', amber: '#ffb020', orange: '#ff6a1a', red: '#ff2d2d',
    ui: getComputedStyle(document.documentElement).getPropertyValue('--f-ui').trim() || 'system-ui, sans-serif',
    num: getComputedStyle(document.documentElement).getPropertyValue('--f-num').trim() || 'monospace' };
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const st = { ctx: null, node: null, core: null, started: false, mode: 'test', auto: true, exMode: 1,
    thrPed: 0, thrKey: 0, brake: 0, keyGas: false,
    tele: { rpm: 780, gear: 1, v: 0, load: 0, lim: false, shift: 0, ev: [] }, rpmD: 780, vD: 0,
    evText: '', evT: 0, tunManual: false, tunGps: false, tunMap: false, tunOn: false, wake: null, wakeT: -1e9,
    resT: -1e9, resN: 0, drawT: 0, sys: '' };

  // ---------- bilprofiler og lydanlegg ----------
  const PROFS = EngineCore.profiles(), OUTS = EngineCore.outputs();
  const prof = () => PROFS[st.car];
  // ---------- lagrede innstillinger ----------
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('lydmotor') || localStorage.getItem('m4csl') || '{}') || {}; } catch (e) { return {}; } },
    set(o) { try { localStorage.setItem('lydmotor', JSON.stringify(o)); localStorage.removeItem('m4csl'); } catch (e) {} }
  };
  (function loadCfg() {
    const c = store.get();
    if (c.vol != null) $('#vol').value = c.vol;
    if (c.bur != null) $('#bur').value = c.bur;
    if (c.tunAmt != null) $('#tunAmt').value = c.tunAmt;
    if (c.idle != null) $('#idle').checked = !!c.idle;
    if (c.tunGps != null) $('#tunGps').checked = !!c.tunGps;
    if (c.tunMap != null) $('#tunMap').checked = !!c.tunMap;
    if (c.ex != null) st.exMode = clamp(c.ex | 0, 0, 2);
    st.car = PROFS[c.car] ? c.car : 'm4csl';
    st.outId = OUTS[c.out] ? c.out : 'i4hk';
  })();
  function saveCfg() {
    store.set({ vol: +$('#vol').value, bur: +$('#bur').value, tunAmt: +$('#tunAmt').value, idle: $('#idle').checked,
      tunGps: $('#tunGps').checked, tunMap: $('#tunMap').checked, ex: st.exMode, car: st.car, out: st.outId });
  }

  function send(m) {
    if (st.node) st.node.port.postMessage(m);
    else if (st.core) st.core.msg(m);
  }
  const EVN = { up: (e) => '▲ ' + e.a + ' → ' + e.b, blip: (e) => '▼ ' + e.a + ' → ' + e.b + ' mellomgass', kick: (e) => '▼ ' + e.a + ' → ' + e.b + ' kickdown',
    lim: () => 'turtallssperre', deny: () => 'skift nektet', lift: () => 'overrun' };
  function onTele(t) {
    st.tele = t;
    if (t.ev) for (const e of t.ev) { const f = EVN[e.k]; if (f) { st.evText = f(e); st.evT = performance.now(); } }
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
    const dry = ctx.createGain(), sendG = ctx.createGain(), wet = ctx.createGain();
    sendG.gain.value = 0; wet.gain.value = 0;
    src.connect(dry); dry.connect(shaper); shaper.connect(ctx.destination);
    st.dry = dry; st.sendG = sendG; st.wet = wet;
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
        st.wake = w;
        // iOS slipper låsen av og til (f.eks. etter et anrop); be om den igjen så lenge siden vises
        w.addEventListener('release', () => { st.wake = null; if (!document.hidden) setTimeout(wakeLock, 1000); });
      }).catch(() => {});
    } catch (e) {}
  }
  // Vakt fire ganger i sekundet: lyd avbrutt (anrop, Siri), stille lydspor stoppet, skjermlås borte. Viser status.
  function sysTick() {
    const c = st.ctx, now = performance.now();
    if (!c) return;
    const audioOk = c.state === 'running' && !(st.keep && st.keep.paused);
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
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
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
      const core = new EngineCore(ctx.sampleRate);
      const sp = ctx.createScriptProcessor(256, 0, 2);
      sp.onaudioprocess = (e) => {
        if (core.render(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), e.outputBuffer.length)) onTele(core.tele);
      };
      buildGraph(ctx, sp);
      st.core = core; st.sp = sp; path = 'ScriptProcessor';
    }
    st.path = path;
    send({ k: 'out', o: OUTS[st.outId], now: true }); send({ k: 'profile', p: prof(), now: true });
    pushCfg(); send({ k: 'start' });
    setMode(mode);
    applyTunnel();
    showLatency();
    setTimeout(showLatency, 1500);
    ctx.addEventListener('statechange', () => { if (ctx.state !== 'running' && !document.hidden) setTimeout(resumeAudio, 200); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { resumeAudio(); wakeLock(); } });
    addEventListener('pointerdown', resumeAudio, { passive: true });
    wakeLock();
    setInterval(sysTick, 250);
    if (mode === 'drive') enableSensors(motionP);
  }
  function showLatency() {
    const ctx = st.ctx; if (!ctx) return;
    const ms = ((ctx.baseLatency || 0) + (ctx.outputLatency || 0)) * 1000 + (st.path === 'AudioWorklet' ? 0 : 5);
    $('#stLat').innerHTML = ms > 0.5 ? 'Forsinkelse ca. <b>' + Math.round(ms) + ' ms</b>' : 'Lyd på';
    $('#stLat').title = st.path;
  }
  $('#startDrive').addEventListener('click', () => startAudio('drive'));
  $('#startTest').addEventListener('click', () => startAudio('test'));

  function pushCfg() {
    send({ k: 'cfg', vol: +$('#vol').value, burble: +$('#bur').value, idleOn: $('#idle').checked, auto: st.mode === 'drive' ? true : st.auto, exMode: st.exMode });
    saveCfg();
  }
  $('#vol').addEventListener('input', pushCfg);
  $('#bur').addEventListener('input', pushCfg);
  $('#idle').addEventListener('change', pushCfg);
  $('#tunAmt').addEventListener('input', () => { saveCfg(); applyTunnel(); });
  $('#tunGps').addEventListener('change', () => { saveCfg(); if (!$('#tunGps').checked) { st.tunGps = false; applyTunnel(); } });
  $('#tunMap').addEventListener('change', () => { saveCfg(); if (!$('#tunMap').checked) { st.tunMap = false; applyTunnel(); } });
  function setEx(m) {
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
  }
  for (const k in PROFS) $('#car').add(new Option(PROFS[k].name, k));
  for (const k in OUTS) $('#outp').add(new Option(OUTS[k].name, k));
  $('#car').value = st.car; $('#outp').value = st.outId; showCar();
  $('#car').addEventListener('change', () => { st.car = $('#car').value; showCar(); saveCfg(); if (st.started) send({ k: 'profile', p: prof() }); });
  $('#outp').addEventListener('change', () => { st.outId = $('#outp').value; saveCfg(); if (st.started) send({ k: 'out', o: OUTS[st.outId] }); });

  // ---------- tunnel ----------
  function applyTunnel() {
    const on = st.tunManual || st.tunGps || st.tunMap;
    const why = st.tunManual ? 'Ja, slått på for hånd' : st.tunMap ? 'Ja, fra kartet' : st.tunGps ? 'Antatt: GPS-signalet falt ut' : 'Nei';
    $('#dpTun').textContent = why;
    const b = $('#tun');
    b.setAttribute('aria-pressed', String(st.tunManual));
    b.classList.toggle('auto-on', on && !st.tunManual);
    b.textContent = on && !st.tunManual ? 'TUNNEL · AUTO' : 'TUNNEL';
    st.tunOn = on;
    if (!st.ctx || !st.tunReady) return;
    const t = st.ctx.currentTime, amt = +$('#tunAmt').value, tau = on ? TUN.tauIn : TUN.tauOut;
    st.sendG.gain.setTargetAtTime(on ? TUN.send : 0, t, on ? TUN.tauIn : 0.05);
    st.wet.gain.setTargetAtTime(on ? TUN.wet * amt : 0, t, tau);
    st.dry.gain.setTargetAtTime(on ? 1 + (TUN.dryBoost - 1) * Math.min(1, amt) : 1, t, tau);
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
    st.mode = m; document.body.dataset.mode = m;
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
    dir: 'F', rI: 0, heldT: 0, rv0: null, rvA: null, rvP: null, rvB: 0, rvLast: null };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => Math.hypot(a[0], a[1], a[2]);
  const GPS_LAG = 1000; // ms: GPS-farten beskriver bilen omtrent ett sekund tilbake i tid

  // ---- lagret kalibrering (hvilken vei som er fremover i telefonen) ----
  const CAL_KEY = 'm4cal', CAL_MAX_AGE = 14 * 864e5;
  function calLoad() {
    try {
      const c = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
      if (!c || !(Date.now() - c.t < CAL_MAX_AGE) || !Array.isArray(c.F) || !Array.isArray(c.g)) return;
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
    try { localStorage.setItem(CAL_KEY, JSON.stringify({ t: Date.now(), F: S.F, g: S.gRef, gb: S.gBase, b: S.bias })); } catch (e) {}
  }
  function calReset() {
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

  // Felles fusjon: langsgående akselerasjon -> fart, gass og brems. held: telefonen rykkes/løftes, frys gass og brems.
  function fuse(aLong, dt, h, held) {
    // Rygging: integral av rå akselerasjon langs "fremover" (fortegnet), og når den sist var upålitelig.
    if (held || !h || !S.fwd) S.heldT = performance.now(); else S.rI += aLong * dt;
    const sg = S.dir === 'R' ? -1 : 1; // i revers peker fartsretningen bakover
    S.aF += ((held ? 0 : sg * aLong) - S.aF) * Math.min(1, dt / 0.035);
    let v = S.vEst + S.aF * dt;
    if (st.tunGps || st.tunMap) v += (S.vHold - v) * dt / 25; // uten GPS: ikke la integrasjonen drive av gårde
    // GPS sier stopp: hold farten på null, men ikke når akselerometeret ser at vi kjører av gårde (GPS er et sekund bak)
    if (S.gpsV !== null && S.gpsV < 0.3 && performance.now() - S.lastGood < 2500 && S.aF < 0.4) v = 0;
    S.vEst = v = clamp(v, 0, 90);
    // revers bremset til null (fart eller sensorintegral), eller urimelig lenge: neste start er fremover til det motsatte er vist
    if (sg < 0 && (v < 0.05 || !S.rvA || rvNow(S.rvA) > -0.2 || performance.now() - S.rvA.t > 40000)) S.dir = 'F';
    const aDrag = 0.12 + 0.00026 * v * v;
    const aAvail = Math.min(9.5, 344000 / (1750 * Math.max(v, 4)));
    // Bakke: tyngdekraftens bidrag langs veien. Opp: trengs gass for å holde farten; ned: holde farten er å slippe.
    const aEff = S.aF + (v > 2 ? 9.81 * S.grade * sg : 0);
    let t;
    if (v < 0.5) t = clamp(S.aF / 4, 0, 1);
    else if (aEff < -0.35) t = 0; // elbil: regenerering ved slipp = motorbrems
    // +0.04: jevn fart (gass ~0.04-0.05) skal ligge godt over motorens slipp-terskel 0.05, ellers girjakt 2<->3 med sensorstøy
    else t = Math.pow(clamp(1.3 * (aEff + aDrag) / aAvail + 0.04, 0, 1), 0.8);
    const b = v > 0.5 ? clamp((-S.aF - 2.0) / 5, 0, 1) : 0; // hardere enn vanlig regen regnes som brems
    if (!held) {
      S.thr += (t - S.thr) * Math.min(1, dt / (t > S.thr ? 0.03 : 0.08));
      S.brk += (b - S.brk) * Math.min(1, dt / 0.1);
    }
    histPush(performance.now(), h, !held);
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
    const tP = now - GPS_LAG, p = histAt(tP), prev = S.rvP;
    S.rvP = p ? { t: tP, r: p.r, v: v } : null;
    if (!p) { S.rv0 = null; if (S.dir === 'R') setDir('F'); return; }
    const live = S.motionSeen && now - S.motionT < 600 && !!S.fwd;
    if (v < 0.3) { // stillstand: retningen kan bare skifte her
      if (S.dir === 'R') setDir('F');
      // Anker = siste rolige øyeblikk (fart null) 0,5-1,6 s tilbake: tåler at den ekte GPS-forsinkelsen avviker fra 1 s.
      const r0 = S.rv0, a0 = quietAt(now - 1600, now - 500);
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
    if (good) {
      if (acc < 30) S.accBase += (acc - S.accBase) * 0.1;
      const v = c.speed, tPast = now - GPS_LAG;
      dirFix(v, now);
      const learn = S.dir !== 'R' && !(S.rv0 && v >= 0.3); // ikke lær akse/skjevhet i revers eller før retningen er avgjort
      if (S.gpsV !== null) {
        const dt = t - S.gpsT;
        if (dt > 0.3 && dt < 3) {
          S.aGps = (v - S.gpsV) / dt; S.aGpsT = now;
          // Sammenlign med det sensorene målte i det samme (forsinkede) tidsrommet.
          const w = histWin(S.fixNow - GPS_LAG, tPast);
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
    $('#dpGps').textContent = err.code === 1 ? 'Blokkert. Tillat posisjon for Safari i Innstillinger.' : 'Ingen signal';
  }

  function onMotion(e) {
    const ag = e.accelerationIncludingGravity, a = e.acceleration;
    if (!ag || ag.x == null) return;
    const now = performance.now();
    const dt = S.lastT ? clamp((now - S.lastT) / 1000, 0.001, 0.05) : 0.016; S.lastT = now;
    S.motionSeen = true; S.motionT = now;
    // Telefonen dreies raskt (tas ut av holderen, slag): ikke tolk rykkene som gass eller brems.
    const rr = e.rotationRate;
    if (rr && Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0) > 80) S.rotHold = now + 700;
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
    fuse(aLong, dt, ah, held);
  }

  // Går fire ganger i sekundet: reserve uten bevegelsessensor, GPS-vakt for tunnel, statuslinjer.
  function driveTick() {
    const now = performance.now(), dt = S.tickT ? clamp((now - S.tickT) / 1000, 0.01, 1) : 0.25; S.tickT = now;
    if (st.mode !== 'drive') return;
    const motionLive = S.motionSeen && now - S.motionT < 600;
    if (!motionLive) fuse(now - S.aGpsT < 1300 ? S.aGps : 0, dt, null, false);
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
    if (navigator.geolocation) {
      try { navigator.geolocation.watchPosition(onGps, onGpsErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }); }
      catch (e) { $('#dpGps').textContent = 'Blokkert'; }
    } else $('#dpGps').textContent = 'Ikke støttet';
    setInterval(driveTick, 250);
    wakeLock();
    setTimeout(() => {
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
    // se litt frem: GPS-posisjonen er rundt ett sekund gammel, og klangen skal være på når vi kjører inn
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
    if (ts - st.drawT < 30) return; // tegn med 30 bilder i sekundet, sparer batteri
    st.drawT = ts;
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
  window.__m4 = { st: st, S: S, MAP: MAP, fuse: fuse, onGps: onGps, onMotion: onMotion, calReset: calReset, sysTick: sysTick, driveTick: driveTick, mapMatch: mapMatch, wayRemain: wayRemain, mapUpdate: mapUpdate };
})();
