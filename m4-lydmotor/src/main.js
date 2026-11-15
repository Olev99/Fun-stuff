(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const css = getComputedStyle(document.documentElement);
  const cv = (n) => css.getPropertyValue(n).trim();
  const COL = { line: cv('--line'), ink: cv('--ink'), dim: cv('--dim'), accent: cv('--accent'), hot: cv('--hot'), disp: cv('--f-display') };

  const st = { ctx: null, node: null, core: null, started: false, mode: 'test', auto: true, exMode: 1,
    thrPed: 0, thrKey: 0, brake: 0, keyGas: false,
    tele: { rpm: 780, gear: 1, v: 0, load: 0, lim: false, shift: 0, ev: [] }, rpmD: 780, vD: 0,
    evText: '', evT: 0, tunManual: false, tunGps: false, tunMap: false, tunOn: false, wake: null };

  // ---------- lagrede innstillinger ----------
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('m4csl') || '{}') || {}; } catch (e) { return {}; } },
    set(o) { try { localStorage.setItem('m4csl', JSON.stringify(o)); } catch (e) {} }
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
  })();
  function saveCfg() {
    store.set({ vol: +$('#vol').value, bur: +$('#bur').value, tunAmt: +$('#tunAmt').value, idle: $('#idle').checked,
      tunGps: $('#tunGps').checked, tunMap: $('#tunMap').checked, ex: st.exMode });
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
    try {
      if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').then((w) => { st.wake = w; }).catch(() => {});
    } catch (e) {}
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
    pushCfg(); send({ k: 'start' });
    setMode(mode);
    applyTunnel();
    showLatency();
    setTimeout(showLatency, 1500);
    ctx.addEventListener('statechange', () => { if (ctx.state !== 'running' && !document.hidden) setTimeout(resumeAudio, 200); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { resumeAudio(); wakeLock(); } });
    addEventListener('pointerdown', resumeAudio, { passive: true });
    wakeLock();
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
    st.thrPed = 0; st.thrKey = 0; st.keyGas = false; st.brake = 0; $('#brake').classList.remove('on'); $('#gasFill').style.height = '0%';
    if (m === 'test') { st.tunGps = false; st.tunMap = false; applyTunnel(); }
    if (st.started) { send({ k: 'mode', drive: m === 'drive' }); pushCfg(); }
  }
  $('#mTest').addEventListener('click', () => setMode('test'));
  $('#mDrive').addEventListener('click', () => setMode('drive'));

  // =====================================================================
  // Kjøremodus: GPS + bevegelsessensor
  // =====================================================================
  const S = { on: false, vEst: 0, gpsV: null, gpsT: 0, aGps: 0, aGpsT: 0, F: [0, 0, 0], fwd: null, gLP: null, lastT: 0, aF: 0, bias: 0,
    thr: 0, brk: 0, motionT: 0, motionSeen: false, gpsSeen: false, motionDenied: false,
    lat: null, lon: null, hdg: null, acc: null, accBase: 12, lastGood: 0, goodN: 0, everGood: false, vHold: 0, tickT: 0, uiT: 0 };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => Math.hypot(a[0], a[1], a[2]);

  // Felles fusjon: langsgående akselerasjon -> fart, gass og brems.
  function fuse(aLong, dt) {
    S.aF += (aLong - S.aF) * Math.min(1, dt / 0.045);
    let v = S.vEst + S.aF * dt;
    if (st.tunGps || st.tunMap) v += (S.vHold - v) * dt / 25; // uten GPS: ikke la integrasjonen drive av gårde
    if (S.gpsV !== null && S.gpsV < 0.3 && performance.now() - S.lastGood < 2500) v = 0;
    S.vEst = v = clamp(v, 0, 90);
    const aDrag = 0.12 + 0.00026 * v * v;
    const aAvail = Math.min(9.5, 344000 / (1750 * Math.max(v, 4)));
    let t;
    if (v < 0.5) t = clamp(S.aF / 4, 0, 1);
    else if (S.aF < -0.35) t = 0; // elbil: regenerering ved slipp = motorbrems
    else t = Math.pow(clamp(1.3 * (S.aF + aDrag) / aAvail, 0, 1), 0.8);
    const b = v > 0.5 ? clamp((-S.aF - 2.0) / 5, 0, 1) : 0; // hardere enn vanlig regen regnes som brems
    S.thr += (t - S.thr) * Math.min(1, dt / (t > S.thr ? 0.06 : 0.12));
    S.brk += (b - S.brk) * Math.min(1, dt / 0.1);
    if (st.mode === 'drive') send({ k: 'drive', v: S.vEst, thr: S.thr, brake: S.brk });
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
      const v = c.speed;
      if (S.gpsV !== null) {
        const dt = t - S.gpsT;
        if (dt > 0.3 && dt < 3) { S.aGps = (v - S.gpsV) / dt; S.aGpsT = now; S.bias += ((S.aF - S.aGps) - S.bias) * 0.08; }
      }
      // retning: bruk GPS-kurs, ellers regn fra forrige posisjon
      if (c.heading != null && !isNaN(c.heading) && v > 2) S.hdg = c.heading;
      else if (S.lat !== null && v > 2) {
        const dy = (c.latitude - S.lat) * 110540, dx = (c.longitude - S.lon) * 111320 * Math.cos(c.latitude * Math.PI / 180);
        if (dx * dx + dy * dy > 9) S.hdg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      }
      S.gpsV = v; S.gpsT = t; S.lat = c.latitude; S.lon = c.longitude;
      if (v < 0.3) S.vEst = 0; else S.vEst += (v - S.vEst) * (S.motionSeen && now - S.motionT < 500 ? 0.4 : 0.8);
      S.vHold = S.vEst;
      S.lastGood = now; S.goodN++; S.everGood = true;
      if (st.tunGps && S.goodN >= 2) { st.tunGps = false; applyTunnel(); }
      mapUpdate(now);
    } else S.goodN = 0;
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
    let lin, g;
    if (a && a.x != null) { lin = [a.x, a.y, a.z]; g = [ag.x - a.x, ag.y - a.y, ag.z - a.z]; }
    else {
      const x = [ag.x, ag.y, ag.z];
      if (!S.gLP) S.gLP = x.slice();
      const k = dt / 4; for (let i = 0; i < 3; i++) S.gLP[i] += (x[i] - S.gLP[i]) * k;
      g = S.gLP; lin = [x[0] - g[0], x[1] - g[1], x[2] - g[2]];
    }
    const gn = nrm(g) || 9.81, gh = [g[0] / gn, g[1] / gn, g[2] / gn];
    const dv = dot(lin, gh), ah = [lin[0] - dv * gh[0], lin[1] - dv * gh[1], lin[2] - dv * gh[2]];
    // Lær retningen "fremover" i telefonens akser fra GPS-akselerasjon (fortegn og retning), fortløpende.
    if (Math.abs(S.aGps) > 0.7 && S.vEst > 3 && now - S.aGpsT < 1500) {
      const sg = Math.sign(S.aGps);
      for (let i = 0; i < 3; i++) S.F[i] += sg * ah[i] * dt;
      const m = nrm(S.F); if (m > 20) for (let i = 0; i < 3; i++) S.F[i] *= 20 / m;
    }
    const fm = nrm(S.F);
    if (fm > 2) S.fwd = [S.F[0] / fm, S.F[1] / fm, S.F[2] / fm];
    const aLong = S.fwd ? dot(ah, S.fwd) - clamp(S.bias, -0.5, 0.5) : (now - S.aGpsT < 2500 ? S.aGps : 0);
    fuse(aLong, dt);
  }

  // Går fire ganger i sekundet: reserve uten bevegelsessensor, GPS-vakt for tunnel, statuslinjer.
  function driveTick() {
    const now = performance.now(), dt = S.tickT ? clamp((now - S.tickT) / 1000, 0.01, 1) : 0.25; S.tickT = now;
    if (st.mode !== 'drive') return;
    const motionLive = S.motionSeen && now - S.motionT < 600;
    if (!motionLive) fuse(now - S.aGpsT < 1300 ? S.aGps : 0, dt);
    // GPS-vakt: i fart, og så blir det stille fra GPS-en
    if ($('#tunGps').checked && S.everGood) {
      const age = now - S.lastGood;
      if (!st.tunGps && age > 2200 && S.vEst > 4) { st.tunGps = true; S.vHold = S.vEst; applyTunnel(); }
      // sikkerhetsnett: står bilen stille lenge uten GPS, er det neppe en tunnel vi kjører i
      if (st.tunGps && S.vEst < 0.5 && age > 20000) { st.tunGps = false; applyTunnel(); }
    }
    mapDeadReckon(dt, now);
    $('#dpMot').textContent = S.motionDenied ? 'Avslått. Bruker bare GPS (tregere).' : !S.motionSeen ? 'Venter …' : !motionLive ? 'Stoppet' : S.fwd ? 'Kalibrert' : 'Kalibrerer: gi gass rett frem';
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
  const cvs = $('#gauge');
  function draw() {
    const target = st.keyGas ? 1 : 0;
    if (st.keyGas || st.thrKey > 0) {
      st.thrKey += (target - st.thrKey) * (target > st.thrKey ? 0.3 : 0.45); if (st.thrKey < 0.01 && !target) st.thrKey = 0;
      if (st.mode === 'test' && st.started) pushIn();
    }
    const t = st.tele;
    st.rpmD += (t.rpm - st.rpmD) * 0.6; st.vD += (t.v - st.vD) * 0.3;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), w = cvs.clientWidth, h = cvs.clientHeight;
    if (cvs.width !== Math.round(w * dpr) || cvs.height !== Math.round(h * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); }
    const g = cvs.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + 2, R = Math.max(20, Math.min(w, h) / 2 - 14);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, MAX = 8000, ang = (r) => a0 + (a1 - a0) * r / MAX;
    g.lineWidth = R * 0.085; g.lineCap = 'butt';
    const arc = (r0, r1, col) => { g.beginPath(); g.arc(cx, cy, R, ang(r0), ang(r1)); g.strokeStyle = col; g.stroke(); };
    arc(0, 7200, COL.line); arc(7200, 8000, 'rgba(255,77,61,.35)');
    const rp = clamp(st.rpmD, 0, MAX);
    arc(0, Math.min(rp, 6600), COL.accent);
    if (rp > 6600) arc(6600, rp, COL.hot);
    g.fillStyle = COL.dim; g.font = '600 ' + Math.max(12, R * 0.09) + 'px ' + COL.disp; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i <= 8; i++) { const aa = ang(i * 1000), rr = R - R * 0.17; g.fillText(String(i), cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr); }
    const na = ang(rp);
    g.strokeStyle = rp > 6600 ? COL.hot : COL.ink; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + Math.cos(na) * R * 0.52, cy + Math.sin(na) * R * 0.52); g.lineTo(cx + Math.cos(na) * R * 0.72, cy + Math.sin(na) * R * 0.72); g.stroke();
    g.fillStyle = t.shift ? COL.accent : t.lim ? COL.hot : COL.ink; g.font = '700 ' + R * 0.42 + 'px ' + COL.disp;
    g.fillText(String(t.gear), cx, cy - R * 0.02);
    g.fillStyle = COL.dim; g.font = '600 ' + R * 0.12 + 'px ' + COL.disp;
    g.fillText(Math.round(st.vD * 3.6) + ' km/t', cx, cy + R * 0.34);
    g.font = '600 ' + R * 0.085 + 'px ' + COL.disp;
    g.fillText(Math.round(rp / 10) * 10 + ' o/min', cx, cy + R * 0.5);
    if (st.tunOn) { g.fillStyle = COL.accent; g.fillText('TUNNEL', cx, cy - R * 0.36); }
    const evEl = $('#stEv'), show = performance.now() - st.evT < 1400 ? st.evText : '';
    if (evEl.textContent !== show) evEl.textContent = show;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // for automatisk test
  window.__m4 = { st: st, S: S, MAP: MAP, fuse: fuse, onGps: onGps, driveTick: driveTick, mapMatch: mapMatch, wayRemain: wayRemain, mapUpdate: mapUpdate };
})();
