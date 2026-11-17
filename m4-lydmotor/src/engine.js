// EngineCore: fysisk inspirert lydmodell av BMW S58 (M4 CSL, G82) + drivlinje.
// Klassen er selvstendig (ingen ytre referanser) fordi den sendes til en AudioWorklet via toString().
class EngineCore {
  constructor(sr) {
    this.sr = sr;
    // ---- inndata / innstillinger ----
    this.drive = false; this.thrIn = 0; this.brakeIn = 0; this.vIn = 0;
    this.auto = true; this.vol = 0.8; this.burble = 0.7; this.idleOn = true; this.exMode = 1;
    // ---- tilstand (resten settes i reset()) ----
    this.time = 0; this.v = 0; this.muteG = 1;
    this.evq = []; this.onEv = null;
    this.popCount = 0;
    // ---- lyd: buffere ----
    const N = 4096; this.M = N - 1; this.w = 0;
    this.impA = new Float32Array(N); this.impB = new Float32Array(N);
    this.popA = new Float32Array(N); this.popB = new Float32Array(N);
    this.dlA = new Float32Array(N); this.dlB = new Float32Array(N);
    this.dsA = new Float32Array(N); this.dsB = new Float32Array(N);
    this.fi = 0; this.ph = 0;
    this.seed = 0x1234567;
    // dunk-resonator (drivlinje/karosseri): 62 Hz, ca. 45 ms
    { const r = Math.exp(-1 / (sr * 0.045)); this.tA1 = 2 * r * Math.cos(2 * Math.PI * 62 / sr); this.tA2 = r * r; }
    // per-blokk-parametre
    this.P = { dec: 0.99, kb: 0.1, gRasp: 0, combAmp: 0.1, motorAmp: 0.03, cycVar: 0.1, pLate: 0, lateAmp: 0, r1: 0.5, r2: 0.3, km: 0.05,
      gInt: 0, gMech: 0, tick: 0, mechFloor: 0.3, gWhoosh: 0, gWh: 0, cw: 1, sw: 0, fW: 0.3, gBov: 0 };
    this.teleT = 0;
    this.tele = { rpm: 780, gear: 1, v: 0, load: 0, lim: false, shift: 0, boost: 0, flap: 0, ovr: 0, car: '', ev: [] };
    // bilbytte: tones ut, profil byttes, tones inn (ca. 70 + 70 ms)
    this.xg = 1; this.nextP = null; this.nextO = null;
    this.setOut(EngineCore.outputs().std);
    this.setProfile(EngineCore.profiles().m4csl);
  }

  // ---------- utgangsprofiler (kupé-EQ, nivå, toppnivå, stereobredde) ----------
  // hp: DC-sperre Hz; hp2: ekstra 1.-ordens høypass Hz (0 = av); eq: topp [Hz, dB, Q]; lp: diskantavrulling Hz;
  // pre: nivå før begrenser; lim: begrenserens tak (lineært); side: skalering av stereobredden.
  static outputs() {
    return {
      std: { id: 'std', name: 'Standard (liten høyttaler)', hp: 26, hp2: 0, eq: [105, 4, 0.9], lp: 7500, pre: 1, lim: 0.86, side: 1 },
      // BMW i4 M50 med Harman Kardon (16 høyttalere, 464 W): ekte bass ned mot 25-30 Hz, bilens DSP oppmikser stereo.
      // Ren bunn under 25 Hz (to høypass-ledd), vekt rundt 60 Hz, mer diskantrom, smalere stereo. Taket -5.5 dBFS gir
      // rom for tunnelklangen (ca. +2.5 dB) slik at toppene også i tunnel holder seg under -3 dBFS.
      i4hk: { id: 'i4hk', name: 'BMW i4 M50 Harman Kardon', hp: 18, hp2: 18, eq: [60, 3, 0.8], lp: 12000, pre: 0.6, lim: 0.53, side: 0.6 }
    };
  }

  setOut(o) {
    const sr = this.sr; this.out = o;
    const A = Math.pow(10, o.eq[1] / 40), w0 = 2 * Math.PI * o.eq[0] / sr, al = Math.sin(w0) / (2 * o.eq[2]), c = Math.cos(w0), a0 = 1 + al / A;
    this.cb0 = (1 + al * A) / a0; this.cb1 = -2 * c / a0; this.cb2 = (1 - al * A) / a0; this.ca1 = -2 * c / a0; this.ca2 = (1 - al / A) / a0;
    this.hp = 0; this.hp2 = 0; this.cz1 = 0; this.cz2 = 0; this.tl = 0; this.limEnv = 0;
  }

  // ---------- bilprofiler (rene data, JSON-kopierbare) ----------
  // Turtall i 'shift' er brøker av rødsonen (avrundes til hele o/min). fire.deg: tenningsvinkler over 720 grader.
  static profiles() {
    // girkart for M4 (brøker av 7200), gjenbrukes av de andre bilene
    const shiftM4 = { wot: 0.9833, over: 0.9722, kick: 0.875, kick2: 0.8333, kickBelow: 0.5972, tipMax: 0.7639, tip0: 0.2083, tipK: 0.1806,
      dnMax: 0.8333, dnC: 0.1597, dnS: 0.1875, dnK: 0.1806, brk0: 0.5, brkC: 0.375, brkS: 0.7222, brkT: 0.7917,
      upC0: 0.2361, upCK: 0.625, upS0: 0.3194, upSK: 0.6667, liftC: 0.3194, liftS: 0.5, guard: 0.0347, manDn: 0.1319, hardDn: 0.3194, hardUp: 0.4444,
      liftDnC: 0.0208, liftDnS: 0.0764 };
    const m4 = {
      id: 'm4csl', name: 'BMW M4 CSL', short: 'M4 CSL',
      blurb: 'Rekkesekser med to turboer, åttetrinns girkasse, mellomgass og burble.',
      tach: { max: 8000, red: 7200, warn: 6600 },
      // S58: 1-5-3-6-2-4, jevnt hver 120. grad; bank A = 1-3, bank B = 4-6 (to grener inn i hver sin turbo)
      cyl: 6, fire: { order: [1, 5, 3, 6, 2, 4], deg: [0, 120, 240, 360, 480, 600] }, bank: [0, 0, 0, 1, 1, 1],
      gain: [1.0, 0.93, 1.06, 0.96, 1.05, 0.91], runner: [0.00042, 0.00021, 0.00033, 0.00030, 0.00016, 0.00047],
      idle: 780, redline: 7200,
      lim: { max: 7215, on: 7180, off: 7120, deny: 7150, period: 0.085, cut: 0.046, dip: 130 },
      shift: shiftM4,
      // ZF 8HP76 (M Steptronic), bakaksel 3.154, 285/30 R20
      gears: [0, 5.0, 3.2, 2.143, 1.72, 1.313, 1.0, 0.823, 0.64], fd: 3.154, wheel: 0.335, mass: 1750, grip: 10.2, vmax: 86,
      torque: [[1000, 300], [2750, 650], [5950, 650]], tMin: 150, acc100: 3.6,
      box: { hardT: [0.145, 0.145, 0.105], softT: [0.24, 0.34], manual: 0.06, shuf: 1, slip: [2500, 2100, 900], stopV: 1.5 },
      turbo: true,
      fuelCut: 1250, idleLd: [1450, 500],
      ovr: { k0: 2400, kR: 2200, o0: 1900, oR: 1300, mode: [0.1, 0.8, 1.0], decay: [1.0, 1.0, 1.5], rate: 13 }, popK: 1,
      flap: { s: [0.45, 0.2, 4200, 600, 3, 0.2, 0.8], c: [0.3, 2.2, 2200, 1800, 0.08, 0.72] },
      // rørlengder [m, lydfart m/s]: turbin -> endepotte, endestykke, nedløp bank A/B
      pipe: { DA: [4.2, 540], DB: [0.50, 470], SA: [0.55, 620], SB: [0.66, 620] },
      snd: { modeG: [0.85, 1.0, 1.1], motor: 0.045, cyc: [0.05, 0.13], dec: [46, 34], fc: [240, 2300, 0.07],
        rasp: [0.35, 0.65, 0.6, 1.0, 1.25, 0.2, 0.95, 2300], refl: [0.46, 0.14, 0.26, 0.24], muff: [260, 240],
        intake: [0.10, 0.012, 185, 430, 0.6], mech: [0.012, 0.05, 0.25, 0.5], ex: 0.52, side: 0.07, dc: 22 }
    };
    // snd: modeG = nivå per eksosmodus; motor = mekanisk grunnpuls; cyc = syklusvariasjon [fast, ved lav last];
    // dec = pulsens forfall i veivgrader [min, + ved lav last]; fc = pulsens lysstyrke [Hz, + Hz ved full last, Hz per o/min];
    // rasp = [klaff lukket, + åpen, Komfort, Sport, Bane, gulv, + ved last, resonans Hz]; refl = rørrefleksjoner [r1, +klaff, r2, +klaff];
    // muff = dempertopp [Hz, + Hz ved åpen klaff]; intake = [nivå, gulv, resonator 1 Hz, resonator 2 Hz, andel 1];
    // mech = [ventiltikk-nivå, + ved høyt turtall, støygulv, + ved høyt turtall]; ex = eksosnivå; side = stereobredde.
    // De tre V12-ene: sugemotor (ingen turbo), lavt støygulv på tomgang, 12 tenninger per 720 grader.
    const v12gain = [1.0, 0.99, 1.01, 0.995, 1.005, 0.985, 1.005, 0.995, 1.01, 0.99, 1.0, 0.985];
    const v12run = [0.00030, 0.00024, 0.00027, 0.00033, 0.00026, 0.00029, 0.00031, 0.00025, 0.00028, 0.00032, 0.00027, 0.00030];
    // Aston/BMW-nummerering: bank A = 1-6, bank B = 7-12; 1-7-5-11-3-9-6-12-2-8-4-10, veksler bank hver tenning
    const amOrder = [1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10], bankV = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const even12 = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660];
    const vanq = {
      id: 'vanqs', name: 'Aston Martin Vanquish S', short: 'Vanquish S',
      blurb: 'V12 på 5,9 liter uten turbo, åttetrinns automat, lang og rund eksos. Kultivert grand tourer.',
      tach: { max: 8000, red: 7000, warn: 6500 },
      cyl: 12, fire: { order: amOrder, deg: even12 }, bank: bankV, gain: v12gain, runner: v12run,
      idle: 700, redline: 7000,
      lim: { max: 7015, on: 6985, off: 6920, deny: 6950, period: 0.07, cut: 0.032, dip: 90 },
      shift: shiftM4,
      // ZF 8HP70 (Touchtronic III); utvekslinger og bakaksel er anslått, ikke bekreftet
      gears: [0, 4.714, 3.143, 2.106, 1.667, 1.285, 1.0, 0.839, 0.667], fd: 2.73, wheel: 0.345, mass: 1830, grip: 9.4, vmax: 90,
      torque: [[1000, 380], [3000, 540], [5500, 630], [7000, 605]], tMin: 200, acc100: 3.5,
      box: { hardT: [0.16, 0.16, 0.125], softT: [0.26, 0.36], manual: 0.06, shuf: 0.8, slip: [2300, 1900, 850], stopV: 1.5 },
      turbo: false,
      fuelCut: 1150, idleLd: [1350, 500],
      ovr: { k0: 2600, kR: 2200, o0: 2000, oR: 1300, mode: [0.05, 0.5, 0.8], decay: [0.8, 0.8, 1.2], rate: 9 }, popK: 0.75,
      flap: { s: [0.5, 0.2, 4500, 700, 2, 0.15, 0.85], c: [0.35, 2.0, 2800, 1800, 0.06, 0.6] },
      pipe: { DA: [4.8, 560], DB: [0.55, 470], SA: [0.42, 640], SB: [0.45, 640] },
      snd: { modeG: [0.85, 1.0, 1.08], motor: 0.035, cyc: [0.02, 0.05], dec: [50, 30], fc: [300, 2600, 0.085],
        rasp: [0.3, 0.5, 0.4, 0.75, 0.95, 0.06, 0.7, 2800], refl: [0.46, 0.14, 0.26, 0.24], muff: [220, 260],
        intake: [0.20, 0.004, 165, 520, 0.7], mech: [0.004, 0.035, 0.06, 0.3], ex: 0.40, side: 0.10, dc: 35 }
    };
    const vant = {
      id: 'v12vs', name: 'Aston Martin V12 Vantage S', short: 'V12 Vantage S',
      blurb: 'Samme V12-familie i en kortere, rå bil: kort eksos, aggressive klaffer, robotisert sjutrinns og mye knitring.',
      tach: { max: 8000, red: 7000, warn: 6500 },
      cyl: 12, fire: { order: amOrder, deg: even12 }, bank: bankV,
      gain: [1.0, 0.96, 1.04, 0.98, 1.03, 0.95, 1.02, 0.97, 1.04, 0.96, 1.01, 0.95], runner: v12run,
      idle: 720, redline: 7000,
      lim: { max: 7015, on: 6985, off: 6900, deny: 6950, period: 0.08, cut: 0.042, dip: 120 },
      shift: shiftM4,
      // Sportshift III (Graziano, én clutch): utvekslinger og bakaksel er anslått
      gears: [0, 3.08, 2.13, 1.62, 1.30, 1.08, 0.91, 0.78], fd: 3.46, wheel: 0.33, mass: 1700, grip: 8.3, vmax: 91.7,
      torque: [[1000, 360], [3000, 500], [5750, 620], [6750, 596]], tMin: 200, acc100: 3.9,
      box: { hardT: [0.13, 0.13, 0.095], softT: [0.34, 0.44], manual: 0.08, shuf: 1.5, slip: [2600, 2200, 1000], stopV: 1.5 },
      turbo: false,
      fuelCut: 1150, idleLd: [1400, 500],
      ovr: { k0: 2300, kR: 2000, o0: 1800, oR: 1200, mode: [0.2, 1.0, 1.25], decay: [1.0, 1.2, 1.7], rate: 16 }, popK: 1.25,
      flap: { s: [0.3, 0.2, 3000, 600, 4, 0.3, 0.7], c: [0.3, 2.2, 2400, 1600, 0.12, 0.7] },
      pipe: { DA: [3.3, 560], DB: [0.40, 470], SA: [0.40, 640], SB: [0.47, 640] },
      snd: { modeG: [0.9, 1.05, 1.15], motor: 0.04, cyc: [0.03, 0.07], dec: [44, 32], fc: [320, 2900, 0.09],
        rasp: [0.35, 0.65, 0.4, 0.95, 1.35, 0.07, 0.9, 2600], refl: [0.5, 0.14, 0.3, 0.24], muff: [300, 300],
        intake: [0.24, 0.004, 200, 560, 0.6], mech: [0.005, 0.04, 0.06, 0.3], ex: 0.32, side: 0.10, dc: 35 }
    };
    const f12 = {
      id: 'f12', name: 'Ferrari F12berlinetta', short: 'F12berlinetta',
      blurb: 'V12 på 6,3 liter uten turbo som drar til 8 700 o/min, sjutrinns dobbeltclutch med lynraske skift.',
      tach: { max: 10000, red: 8700, warn: 8200 },
      // 65 graders V: med felles veivtapper blir tenningen 65/55 grader (antatt, ikke bekreftet for F140)
      cyl: 12, fire: { order: amOrder, deg: [0, 65, 120, 185, 240, 305, 360, 425, 480, 545, 600, 665] }, bank: bankV,
      gain: v12gain, runner: v12run,
      idle: 950, redline: 8700,
      lim: { max: 8715, on: 8685, off: 8600, deny: 8650, period: 0.06, cut: 0.03, dip: 110 },
      shift: shiftM4,
      // Getrag 7DCL750: utvekslinger og bakaksel er anslått
      gears: [0, 3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], fd: 4.44, wheel: 0.36, mass: 1730, grip: 9.6, vmax: 94.4,
      torque: [[1000, 380], [3000, 560], [6000, 690], [8250, 630]], tMin: 200, acc100: 3.1,
      box: { hardT: [0.07, 0.07, 0.05], softT: [0.14, 0.2], manual: 0.03, shuf: 0.6, slip: [3000, 2400, 1000], stopV: 1.5 },
      turbo: false,
      fuelCut: 1350, idleLd: [1600, 500],
      ovr: { k0: 2800, kR: 2600, o0: 2200, oR: 1500, mode: [0.1, 0.7, 0.95], decay: [0.9, 0.9, 1.3], rate: 11 }, popK: 0.9,
      flap: { s: [0.4, 0.2, 3500, 800, 3, 0.2, 0.8], c: [0.35, 2.0, 3000, 2000, 0.08, 0.7] },
      pipe: { DA: [3.8, 580], DB: [0.45, 480], SA: [0.38, 660], SB: [0.40, 660] },
      snd: { modeG: [0.85, 1.0, 1.12], motor: 0.04, cyc: [0.02, 0.05], dec: [52, 30], fc: [380, 3200, 0.1],
        rasp: [0.3, 0.6, 0.45, 0.85, 1.05, 0.05, 0.75, 3300], refl: [0.44, 0.14, 0.26, 0.24], muff: [280, 300],
        intake: [0.28, 0.004, 230, 640, 0.6], mech: [0.005, 0.04, 0.06, 0.3], ex: 0.38, side: 0.10, dc: 35 }
    };
    // Porsche 991.2 GT3: boksersekser uten turbo, 1-6-2-4-3-5 hver 120. grad; bank A = 1-3, bank B = 4-6 (veksler bank hver tenning,
    // hver bank får jevne 240 grader i sitt eget eksosløp). Motoren sitter bak, så rørene er korte og innsuget ligger nær kupeen.
    const gt3 = {
      id: 'gt3', name: 'Porsche 911 GT3 (991.2)', short: 'GT3',
      blurb: 'Boksersekser på 4,0 liter uten turbo som skriker til 9 000 o/min, sjutrinns PDK med lynraske skift, hardt innsug og mekanisk knurr.',
      tach: { max: 10000, red: 9000, warn: 8500 },
      cyl: 6, fire: { order: [1, 6, 2, 4, 3, 5], deg: [0, 120, 240, 360, 480, 600] }, bank: [0, 0, 0, 1, 1, 1],
      gain: [1.0, 0.985, 1.015, 0.99, 1.01, 0.985], runner: [0.00028, 0.00025, 0.00030, 0.00027, 0.00029, 0.00026],
      idle: 750, redline: 9000,
      lim: { max: 9015, on: 8985, off: 8900, deny: 8950, period: 0.055, cut: 0.028, dip: 110 },
      shift: shiftM4,
      // PDK (7 trinn): utvekslinger og bakaksel fra Porsches pressedata for 991.1 GT3 (antatt like for 991.2), 305/30 ZR 20 bak
      gears: [0, 3.75, 2.38, 1.72, 1.34, 1.11, 0.96, 0.84], fd: 3.97, wheel: 0.338, mass: 1430, grip: 9.0, vmax: 88.3,
      torque: [[1000, 250], [3000, 390], [6000, 460], [8250, 426]], tMin: 150, acc100: 3.4,
      box: { hardT: [0.08, 0.065, 0.045], softT: [0.15, 0.22], manual: 0.03, shuf: 0.5, slip: [3200, 2400, 1000], stopV: 1.5 },
      turbo: false,
      fuelCut: 1300, idleLd: [1450, 500],
      ovr: { k0: 3000, kR: 2800, o0: 2400, oR: 1600, mode: [0.05, 0.55, 0.8], decay: [0.7, 0.75, 1.0], rate: 10 }, popK: 0.6,
      flap: { s: [0.5, 0.2, 5000, 900, 3, 0.2, 0.8], c: [0.4, 2.0, 3500, 2000, 0.06, 0.6] },
      pipe: { DA: [1.6, 560], DB: [0.35, 480], SA: [0.30, 660], SB: [0.30, 660] },
      snd: { modeG: [0.85, 1.0, 1.12], motor: 0.045, cyc: [0.02, 0.05], dec: [48, 30], fc: [400, 3400, 0.11],
        rasp: [0.35, 0.65, 0.45, 1.0, 1.2, 0.05, 1.1, 3600], refl: [0.42, 0.14, 0.24, 0.24], muff: [300, 340],
        intake: [0.36, 0.004, 260, 720, 0.55], mech: [0.007, 0.04, 0.01, 0.3], ex: 0.42, side: 0.10, dc: 30 }
    };
    return { m4csl: m4, vanqs: vanq, v12vs: vant, f12: f12, gt3: gt3 };
  }

  setProfile(p) {
    const sr = this.sr; this.pr = p;
    this.ratios = p.gears; this.nG = p.gears.length - 1; this.finalDrive = p.fd; this.wheelR = p.wheel; this.mass = p.mass;
    this.idle = p.idle; this.redline = p.redline; this.lim = p.lim;
    const K = {}; for (const k in p.shift) K[k] = Math.round(p.shift[k] * p.redline); this.K = K;
    // tenning: rekkefølge, bank og intervall foran hver tenning (i enheter av jevnt intervall 720/syl)
    const n = p.fire.order.length, even = 720 / p.cyl;
    this.order = p.fire.order.map(function (c) { return c - 1; });
    this.gap = p.fire.deg.map(function (d, i) { const prev = p.fire.deg[(i + n - 1) % n]; return ((d - prev + 720) % 720 || 720) / even; });
    this.nF = n; this.fdiv = 120 / p.cyl;
    this.bank = p.bank; this.cylGain = p.gain;
    this.runner = p.runner.map(function (s) { return s * sr; });
    const q = p.pipe, D = function (a) { return Math.round(sr * 2 * a[0] / a[1]); };
    this.DA = D(q.DA); this.DB = D(q.DB); this.SA = D(q.SA); this.SB = D(q.SB);
    this.reset();
  }

  // motortilstand tilbake til tomgang; farten beholdes og giret velges etter den
  reset() {
    this.rpm = this.idle; this.rpmS = this.idle; this.rpmSPrev = this.idle;
    this.thrS = 0; this.thrSlow = 0; this.load = 0.1; this.recent = 0; this.locked = false;
    this.sh = { active: false, from: 1, to: 1, dir: 0, t: 0, T: 0, Tb: 0, rpm0: 0, hard: false, coast: false, banged: false, thr0: 0 };
    this.qShift = 0; this.holdUp = 0; this.holdDn = 0; this.liftT = 9; this.kickT = 9; this.surgeT = 9;
    this.shufA = 0; this.shufT = 9;
    this.ovr = 0; this.boost = 0; this.spool = 0; this.bov = 0; this.flut = 0; this.flutPh = 0;
    this.limOn = false; this.limT = 0; this.limCut = false; this.blipK = 0; this.lifted = false;
    this.flap = 0.5; this.startT = 9; this.idleW = 0;
    this.pend = new Float64Array(16); this.pendA = new Float64Array(16);
    this.fi = 0; this.ph = 0;
    const wr = this.v / (6.283185307179586 * this.wheelR) * 60 * this.finalDrive;
    this.gear = 1; while (this.gear < this.nG && wr * this.ratios[this.gear] > this.redline * 0.45) this.gear++;
    if (this.impA) for (const b of [this.impA, this.impB, this.popA, this.popB, this.dlA, this.dlB, this.dsA, this.dsB]) b.fill(0);
    this.eA = 0; this.eB = 0; this.bA = 0; this.bB = 0; this.dcA = 0; this.dcB = 0;
    this.rlA = 0; this.rbA = 0; this.rlB = 0; this.rbB = 0;
    this.pA = 0; this.pB = 0; this.plA = 0; this.plB = 0; this.psA = 0; this.psB = 0;
    this.m1 = 0; this.m2 = 0; this.o1 = 0; this.sdLP = 0;
    this.i1l = 0; this.i1b = 0; this.i2l = 0; this.i2b = 0;
    this.mcl = 0; this.mcb = 0; this.mechEnv = 0;
    this.wl = 0; this.wb = 0; this.bl = 0; this.bb = 0;
    this.wc = 1; this.ws = 0;
    this.th1 = 0; this.th2 = 0; this.thImp = 0;
    this.hp = 0; this.hp2 = 0; this.cz1 = 0; this.cz2 = 0; this.tl = 0;
    this.limEnv = 0;
    this.tele.car = this.pr.id;
  }

  // dreiemoment (Nm) fra tabell: lineært mellom punktene, under første punkt forlenget, over siste konstant effekt
  torqueAt(rpm) {
    const t = this.pr.torque; let i = 0;
    while (i < t.length - 1 && rpm >= t[i + 1][0]) i++;
    if (i === t.length - 1) return t[i][1] * t[i][0] / rpm;
    return t[i][1] + (t[i + 1][1] - t[i][1]) * (rpm - t[i][0]) / (t[i + 1][0] - t[i][0]);
  }

  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0; return (this.seed >>> 0) / 4294967296; }

  ev(k, a, b) {
    const e = { t: Math.round(this.time * 1000) / 1000, k: k, a: a, b: b };
    if (this.onEv) this.onEv(e);
    if (this.evq.length < 48) this.evq.push(e);
  }

  msg(m) {
    switch (m.k) {
      case 'in': this.thrIn = m.thr; this.brakeIn = m.brake; break;
      case 'drive': this.drive = true; this.vIn = m.v; this.thrIn = m.thr; this.brakeIn = m.brake || 0; break;
      case 'mode': this.drive = !!m.drive; if (!this.drive) { this.v = 0; } this.thrIn = 0; this.brakeIn = 0; this.vIn = 0; break;
      case 'shift': this.manualShift(m.d); break;
      case 'start': this.startT = 0; this.rpm = 250; break;
      case 'profile': if (m.now) { this.nextP = null; this.setProfile(m.p); } else this.nextP = m.p; break;
      case 'out': if (m.now) { this.nextO = null; this.setOut(m.o); } else this.nextO = m.o; break;
      case 'cfg':
        if (m.vol !== undefined) this.vol = m.vol;
        if (m.burble !== undefined) this.burble = m.burble;
        if (m.idleOn !== undefined) this.idleOn = !!m.idleOn;
        if (m.auto !== undefined) this.auto = !!m.auto;
        if (m.exMode !== undefined) this.exMode = m.exMode | 0;
        break;
    }
  }

  // ---------- smell i eksosen ----------
  addPop(amp, delay) {
    if (delay > 0) {
      for (let i = 0; i < 16; i++) if (this.pend[i] <= 0) { this.pend[i] = delay; this.pendA[i] = amp; return; }
      return;
    }
    const pos = (this.w + 2 + ((this.rnd() * 100) | 0)) & this.M;
    const b = this.rnd() < 0.5;
    const a = amp * this.pr.popK * (0.8 + 0.4 * this.rnd());
    (b ? this.popA : this.popB)[pos] += a;
    (b ? this.popB : this.popA)[(pos + 9) & this.M] += a * 0.35;
    if (amp > 0.55) this.thImp += (amp - 0.4) * 0.5;
    this.popCount++;
    this.ev('pop', Math.round(amp * 100) / 100);
  }

  // ---------- girskift ----------
  manualShift(d) {
    if (this.sh.active) { this.qShift = d; return; }
    const to = this.gear + d;
    if (to < 1 || to > this.nG) { this.ev('deny', this.gear, to); return; }
    const wr = this.v / (6.283185307179586 * this.wheelR) * 60 * this.finalDrive;
    if (d < 0 && wr * this.ratios[to] > this.lim.deny) { this.ev('deny', this.gear, to); return; }
    this.startShift(to, wr, true);
  }

  startShift(to, wr, manual) {
    const s = this.sh, from = this.gear;
    if (to === from) return;
    const m = this.exMode, thr = this.thrS, bx = this.pr.box;
    const gN = wr * this.ratios[to];
    s.active = true; s.from = from; s.to = to; s.dir = to > from ? 1 : -1; s.t = 0; s.rpm0 = this.rpm; s.banged = false; s.thr0 = thr;
    if (s.dir > 0) {
      s.hard = thr > 0.5 && this.rpm > this.K.hardUp && m > 0;
      s.coast = false;
      if (s.hard) s.T = bx.hardT[m];
      else s.T = (thr > 0.5 ? bx.softT[0] : bx.softT[1]) - (manual ? bx.manual : 0);
      if (s.hard) {
        // tenningskutt: uforbrent blanding knitrer i eksosen, turboen slipper trykk
        if (this.burble > 0.05) { this.addPop(0.22 + 0.2 * this.burble, 0.012); if (m === 2) this.addPop(0.2 + 0.2 * this.burble, 0.045); }
        this.bov = Math.max(this.bov, 0.55 * this.boost);
      }
      this.ev('up', from, to);
    } else {
      s.coast = Math.max(thr, this.thrIn) < 0.3;
      s.hard = gN > this.K.hardDn;
      if (s.coast) {
        let tb = 0.065 + (gN - this.rpm) * 0.00003; if (tb < 0.075) tb = 0.075; if (tb > 0.125) tb = 0.125;
        s.Tb = tb; s.T = tb + 0.08;
        this.ev('blip', from, to);
      } else {
        s.Tb = 0; s.T = 0.2 + 0.035 * (from - to); if (s.T > 0.36) s.T = 0.36;
        this.ev('kick', from, to);
      }
    }
    this.gear = to;
    this.holdUp = s.dir > 0 ? 0.9 : 1.3; this.holdDn = 0.3;
  }

  finishShift() {
    const s = this.sh; s.active = false;
    if (s.dir > 0) {
      if (s.hard) { this.shufA = (55 + 60 * s.thr0) * this.pr.box.shuf; this.shufT = 0; this.surgeT = 0; this.thImp += 0.5 + 0.35 * (this.exMode - 1); }
      else if (s.thr0 > 0.3) { this.shufA = 18; this.shufT = 0; }
    } else if (s.coast) {
      if (s.hard) { this.shufA = -35; this.shufT = 0; this.thImp += 0.28; }
    } else { this.surgeT = 0; this.shufA = 30; this.shufT = 0; }
    this.ev('done', s.from, s.to);
    if (this.qShift) { const d = this.qShift; this.qShift = 0; this.manualShift(d); }
  }

  autoShift(thr, brake, wr) {
    const g = this.gear, r = this.ratios, m = this.exMode, rp = wr * r[g], sport = m > 0, K = this.K;
    if (!this.auto) {
      if (g > 1 && rp < K.manDn) this.startShift(g - 1, wr, false);
      return;
    }
    // Stillstand/krypefart: alltid 1. gir (fartsfallet kan være for brått til at vanlig nedgiring rekker det)
    if (g > 1 && this.v < this.pr.box.stopV) { this.gear = 1; this.holdDn = 0; this.holdUp = 0.5; return; }
    // Slipp (gass 0): hold turtallet oppe, som en Sport-gearkasse som gir ned under rulling
    const dnR = (sport ? K.dnS : K.dnC) + thr * K.dnK + (thr < 0.05 ? (sport ? K.liftDnS : K.liftDnC) : 0);
    const tipR = K.tip0 + K.tipK * thr;
    if (this.holdDn <= 0 && this.v > 1.5 && g > 1) {
      let tgt = g;
      if (thr > 0.8 && (this.kickT < 0.3 || rp < K.kickBelow)) {
        const lim = this.kickT < 0.3 ? K.kick : K.kick2;
        while (tgt > 1 && wr * r[tgt - 1] < lim && (tgt > 2 || this.v < 8)) tgt--;
      } else if (thr > 0.45 && rp < tipR && wr * r[g - 1] < K.tipMax) tgt = g - 1;
      else if (brake > 0.12) {
        const hi = m === 2 ? K.brkT : m === 1 ? K.brkS : K.brkC;
        const bR = sport ? K.brk0 + (hi - K.brk0) * Math.min(1, brake * 1.6) : hi;
        if (wr * r[g - 1] < bR && (g > 2 || this.v < 4.5)) tgt = g - 1;
      } else if (rp < dnR && wr * r[g - 1] < K.dnMax && (g > 2 || this.v < 5)) tgt = g - 1;
      if (tgt < g) { this.startShift(tgt, wr, false); return; }
    }
    if (g < this.nG && (this.holdUp <= 0 || rp > K.over) && brake < 0.1 && this.v > 1.5) {
      let upR = m === 0 ? K.upC0 + K.upCK * Math.pow(thr, 1.5) : K.upS0 + K.upSK * Math.pow(thr, 1.25);
      if (thr > 0.9 || upR > K.wot) upR = K.wot;
      if (thr < 0.05) upR = this.liftT < (sport ? 3 : 1.2) ? 1e9 : (sport ? K.liftS : K.liftC);
      const guard = Math.max(dnR, thr > 0.45 ? tipR : 0) + K.guard;
      if (rp > upR && wr * r[g + 1] > guard) this.startShift(g + 1, wr, false);
    }
  }

  // ---------- styring, én gang per blokk ----------
  control(dt) {
    if ((this.nextP || this.nextO) && this.xg <= 0) {
      if (this.nextO) { const o = this.nextO; this.nextO = null; this.setOut(o); }
      if (this.nextP) { const p = this.nextP; this.nextP = null; this.setProfile(p); }
    }
    const TWO_PI = 6.283185307179586, r = this.ratios, m = this.exMode, s = this.sh, pr = this.pr, lim = this.lim;
    let thr = this.thrIn; if (!(thr > 0)) thr = 0; if (thr > 1) thr = 1;
    let brake = this.brakeIn; if (!(brake > 0)) brake = 0; if (brake > 1) brake = 1;
    this.time += dt;

    // gass: rask utjevning + flankedeteksjon
    this.thrS += (thr - this.thrS) * (1 - Math.exp(-dt / (thr > this.thrS ? 0.022 : 0.04)));
    this.thrSlow += (thr - this.thrSlow) * (1 - Math.exp(-dt / 0.25));
    if (thr > 0.85 && this.thrSlow < 0.55) this.kickT = 0; else this.kickT += dt;
    if (thr < 0.05) this.liftT += dt; else this.liftT = 0;
    if (this.holdUp > 0) this.holdUp -= dt;
    if (this.holdDn > 0) this.holdDn -= dt;
    this.surgeT += dt; this.shufT += dt; this.startT += dt;

    // ---- kjøretøy ----
    if (!this.drive) {
      const v = this.v, rpm = this.rpm;
      let T = this.torqueAt(rpm);
      if (T < pr.tMin) T = pr.tMin;
      const Lq = pr.turbo ? this.load * (0.55 + 0.45 * this.boost) : this.load;
      let F = T * Lq * r[this.gear] * this.finalDrive * 0.9 / this.wheelR;
      const Fmax = this.mass * pr.grip; if (F > Fmax) F = Fmax;
      let a = F / this.mass - (0.12 + 0.00026 * v * v) - brake * 11;
      if (this.load < 0.03 && v > 0.5) a -= (40 + 0.014 * rpm) * r[this.gear] * this.finalDrive / this.wheelR / this.mass;
      if (v < 0.5 && thr < 0.03) a -= 1.5;
      let nv = v + a * dt; if (nv < 0) nv = 0; if (nv > pr.vmax) nv = pr.vmax;
      const vLim = lim.max / (r[this.gear] * this.finalDrive) * TWO_PI * this.wheelR / 60;
      if (nv > vLim && !s.active) nv = Math.max(vLim, v - 2 * dt);
      this.v = nv;
    } else {
      this.v += (this.vIn - this.v) * (1 - Math.exp(-dt / 0.05));
      if (this.vIn < 0.2 && this.v < 0.3) this.v = 0;
    }
    const wr = this.v / (TWO_PI * this.wheelR) * 60 * this.finalDrive;

    // ---- girkasse ----
    if (!s.active) this.autoShift(thr, brake, wr);

    // ---- turtall ----
    const idleT = this.idle + this.idleW + (this.startT < 3 ? 650 * Math.exp(-this.startT / 0.7) : 0);
    this.idleW += (this.rnd() - 0.5) * 40 * dt - this.idleW * dt * 1.2;
    let loadMul = 1, loadOv = -1;
    const geared = wr * r[this.gear];
    if (s.active) {
      s.t += dt;
      this.locked = true;
      if (s.dir > 0) {
        const Ts = s.T * 0.85; let p = s.t / Ts; if (p > 1) p = 1; const q = p * p * (3 - 2 * p);
        this.rpm = s.rpm0 + (Math.max(geared, this.idle) - s.rpm0) * q;
        if (s.hard) {
          loadOv = 0;
          if (!s.banged && s.t >= s.T - 0.012) { s.banged = true; if (this.burble > 0.05) this.addPop(0.45 + 0.45 * this.burble * (m === 2 ? 1 : 0.8), 0); }
        } else loadMul = 1 - (s.thr0 > 0.5 ? 0.75 : 0.55) * Math.sin(Math.PI * Math.min(1, s.t / s.T));
      } else if (s.coast) {
        if (s.t < s.Tb) {
          const p = s.t / s.Tb, q = p * p * (3 - 2 * p);
          this.rpm = s.rpm0 + (geared * 1.028 - s.rpm0) * q;
          loadOv = s.hard ? (0.8 + 0.1 * m) * Math.min(1, p * 4) : 0.15;
          this.blipK = s.hard ? 1 : 0;
        } else {
          let p = (s.t - s.Tb) / 0.08; if (p > 1) p = 1; const q = p * p * (3 - 2 * p);
          this.rpm = geared * (1 + 0.028 * (1 - q));
          loadOv = s.hard ? (0.8 + 0.1 * m) * (1 - p) * (1 - p) : 0;
          if (!s.banged) {
            s.banged = true;
            if (s.hard && m > 0 && this.burble > 0.05) {
              const k = Math.min(1, (geared - 2300) / 2000);
              this.ovr = Math.max(this.ovr, 0.75 * k);
              this.addPop((0.3 + 0.35 * this.burble) * (0.5 + 0.5 * k), 0.01 + 0.03 * this.rnd());
              if (this.rnd() < 0.7 * this.burble) this.addPop(0.2 + 0.3 * this.rnd(), 0.07 + 0.08 * this.rnd());
            }
          }
        }
      } else {
        let p = s.t / s.T; if (p > 1) p = 1; const q = p * p * (3 - 2 * p);
        this.rpm = s.rpm0 + (geared - s.rpm0) * q;
        loadMul = 0.7;
      }
      if (s.t >= s.T) this.finishShift();
    } else {
      const lc = brake > 0.5 && this.v < 0.5;
      const slipT = this.idle + Math.pow(thr, 0.8) * (lc ? pr.box.slip[0] : this.gear === 1 ? pr.box.slip[1] : pr.box.slip[2]);
      const tgt = Math.max(idleT, slipT);
      if (geared >= tgt) {
        this.locked = true;
        this.rpm += (geared - this.rpm) * (1 - Math.exp(-dt / 0.02));
      } else {
        this.locked = false;
        const up = (2500 + 7500 * thr) * dt, dn = 2600 * dt;
        let d = tgt - this.rpm;
        if (d > up) d = up; else if (d < -dn) d = -dn;
        this.rpm += d * 0.9;
        if (this.rpm < geared) this.rpm = geared;
      }
    }
    if (this.rpm > lim.max) this.rpm = lim.max;
    if (this.rpm < 200) this.rpm = 200;

    // ---- turtallssperre ----
    const wantLim = this.rpm >= lim.on && thr > 0.3 && !s.active;
    if (wantLim && !this.limOn) { this.limOn = true; this.limT = 0; this.ev('lim', 1); }
    if (this.limOn) {
      const ph = this.limT % lim.period;
      const cut = ph < lim.cut;
      if (cut && !this.limCut && this.burble > 0.05 && m > 0) this.addPop(0.25 + 0.35 * this.burble * this.rnd(), 0.02);
      this.limCut = cut;
      this.limT += dt;
      if (!wantLim && this.rpm < lim.off) { this.limOn = false; this.limCut = false; }
      if (thr < 0.3) { this.limOn = false; this.limCut = false; }
    }
    const limDip = this.limOn ? lim.dip * ((this.limT % lim.period) / lim.period) : 0;

    // ---- last ----
    const fuelCut = this.thrS < 0.03 && this.rpm > pr.fuelCut && this.locked && !s.active;
    let idleLoad = (pr.idleLd[0] - this.rpm) / pr.idleLd[1]; if (idleLoad > 1) idleLoad = 1; if (idleLoad < 0) idleLoad = 0;
    idleLoad = 0.10 * idleLoad + (this.startT < 1.2 ? 0.25 * (1 - this.startT / 1.2) : 0);
    let L = fuelCut ? 0 : Math.max(this.thrS, idleLoad);
    if (loadOv >= 0) L = loadOv; else L *= loadMul;
    if (this.surgeT < 0.12) L *= 1.12;
    if (this.limCut) L = 0;
    this.load += (L - this.load) * (1 - Math.exp(-dt / 0.009));
    // nylig last (for overrun-styrke)
    this.recent += (this.load - this.recent) * (1 - Math.exp(-dt / (this.load > this.recent ? 0.12 : 0.6)));

    // ---- overrun: slipp av gassen ----
    const ov = pr.ovr, bMode = ov.mode[m];
    if (L < 0.04 && this.recent > 0.25 && !s.active && this.liftT < 0.4 && this.liftT > 0) {
      if (!this.lifted) {
        this.lifted = true;
        const k = Math.min(1, Math.max(0, (this.rpm - ov.k0) / ov.kR));
        this.ovr = Math.max(this.ovr, Math.min(1, this.recent * 1.25) * k);
        if (this.boost > 0.3) { this.bov = Math.max(this.bov, this.boost); this.flut = this.boost > 0.6 && m > 0 ? 1 : 0; this.flutPh = 0; }
        if (this.ovr * this.burble * bMode > 0.15) { this.addPop(0.3 + 0.5 * this.ovr * this.burble, 0.03 + 0.04 * this.rnd()); }
        this.ev('lift', Math.round(this.rpm), Math.round(this.ovr * 100) / 100);
      }
    } else if (thr > 0.06) this.lifted = false;
    if (this.thrS > 0.08 && !s.active) this.ovr *= Math.exp(-dt / 0.03);
    this.ovr *= Math.exp(-dt / ov.decay[m]);
    let ovK = (this.rpm - ov.o0) / ov.oR; if (ovK < 0) ovK = 0; if (ovK > 1) ovK = 1;
    const ovEff = this.ovr * ovK * this.burble * bMode;
    if (ovEff > 0.02 && this.load < 0.1) {
      if (this.rnd() < ovEff * ov.rate * dt) { const q = this.rnd(); this.addPop((0.16 + 0.6 * q * q) * (0.5 + 0.5 * this.ovr), 0); }
    }
    for (let i = 0; i < 16; i++) if (this.pend[i] > 0) { this.pend[i] -= dt; if (this.pend[i] <= 0) this.addPop(this.pendA[i], 0); }

    // ---- turbo (sugemotor: alltid 0, ingen sus, avblåsning eller flagring) ----
    let bt = pr.turbo ? this.load * (this.rpm - 1500) / 2300 : 0; if (bt < 0) bt = 0; if (bt > 1) bt = 1;
    this.boost += (bt - this.boost) * (1 - Math.exp(-dt / (bt > this.boost ? 0.32 : 0.1)));
    this.spool += (bt - this.spool) * (1 - Math.exp(-dt / (bt > this.spool ? 0.45 : 0.9)));
    this.bov *= Math.exp(-dt / 0.16);
    this.flutPh += dt * (16 + 26 * this.bov);

    // ---- klaff ----
    // Bane: alltid åpen. Sport: åpen i lave gir (i fart), ved høy last eller høyt turtall, ellers nesten lukket.
    // Komfort: lukket ved lavt turtall/lett last, åpner ved høy last. Åpner raskt, lukker sakte.
    // per bil: s = [last fra, lastspenn, turtall fra, turtallsspenn, åpen t.o.m. gir, lukket, åpen-andel],
    // c = [last fra, lastfaktor, turtall fra, turtallsspenn, lukket, åpen-andel]
    let fl = 1;
    if (m === 1) {
      const f = pr.flap.s;
      let a = (this.load - f[0]) / f[1]; if (a < 0) a = 0; if (a > 1) a = 1;
      let b = (this.rpm - f[2]) / f[3]; if (b < 0) b = 0; if (b > 1) b = 1;
      const c = this.gear <= f[4] && this.v > 1 ? 1 : 0;
      fl = f[5] + f[6] * Math.max(a, b, c);
    } else if (m === 0) {
      const f = pr.flap.c;
      let a = (this.load - f[0]) * f[1]; if (a < 0) a = 0; if (a > 1) a = 1;
      let b = (this.rpm - f[2]) / f[3]; if (b < 0) b = 0; if (b > 1) b = 1;
      fl = f[4] + f[5] * a * b;
    }
    this.flap += (fl - this.flap) * (1 - Math.exp(-dt / (fl > this.flap ? 0.03 : 0.4)));

    // ---- demping (tomgang av når bilen står) ----
    const mute = (!this.idleOn && this.v < 0.6 && thr < 0.03) ? 0 : 1;
    this.muteG += (mute - this.muteG) * (1 - Math.exp(-dt / 0.2));

    // ---- lydturtall (med drivlinjerykk og sperre-dipp) ----
    this.rpmSPrev = this.rpmS;
    let rs = this.rpm - limDip;
    if (this.shufT < 0.5) rs += this.shufA * Math.exp(-this.shufT / 0.1) * Math.sin(TWO_PI * 7.5 * this.shufT);
    this.rpmS = rs;

    // ---- lydparametre ----
    const P = this.P, sr = this.sr, rn = rs / this.redline, Ld = this.load, X = pr.snd;
    this.blipK *= Math.exp(-dt / 0.05);
    const Lb = pr.turbo ? Ld * (0.62 + 0.38 * Math.max(this.boost, this.blipK)) : Ld;
    const modeG = X.modeG[m];
    P.combAmp = Ld > 0.002 ? (0.10 + 0.90 * Math.pow(Lb, 0.8)) * (0.5 + 0.5 * Math.pow(rn, 0.7)) * modeG : 0;
    P.motorAmp = X.motor * (0.4 + 0.6 * rn);
    let cv = 1.5 - rn * 2.2; if (cv < 0.2) cv = 0.2; if (cv > 1) cv = 1;
    P.cycVar = X.cyc[0] + X.cyc[1] * (1 - Lb) * (1 - Lb) * cv;
    P.pLate = Ld < 0.1 ? Math.min(0.6, ovEff * 0.7) : 0;
    P.lateAmp = 0.22 * (0.5 + 0.5 * rn);
    const thD = X.dec[0] + X.dec[1] * (1 - Lb);
    P.dec = Math.exp(-(rs * 6 / sr) / thD);
    const fc = X.fc[0] + X.fc[1] * Math.pow(Lb, 1.3) + X.fc[2] * rs;
    P.kb = 1 - Math.exp(-TWO_PI * fc / sr);
    const R = X.rasp;
    P.gRasp = (R[0] + R[1] * this.flap) * R[2 + m] * (R[5] + R[6] * Math.pow(Lb, 1.4) * Math.pow(rn, 1.1));
    P.r1 = X.refl[0] + X.refl[1] * this.flap; P.r2 = X.refl[2] + X.refl[3] * this.flap;
    P.km = 1 - Math.exp(-TWO_PI * (X.muff[0] + X.muff[1] * this.flap) / sr);
    P.gInt = X.intake[0] * Math.pow(Ld, 1.3) * (0.3 + 0.7 * rn) + X.intake[1];
    P.gMech = (X.mech[0] + X.mech[1] * Math.pow(rn, 1.7)) * (0.4 + 0.6 * Ld);
    P.tick = 0.9;
    P.mechFloor = X.mech[2] + X.mech[3] * rn;
    P.gWhoosh = 0.02 * this.boost * (0.4 + 0.6 * rn);
    let fl2 = 1; if (this.flut > 0) { const z = this.flutPh - Math.floor(this.flutPh); fl2 = z < 0.45 ? 1 : 0.15; }
    P.gBov = 0.3 * this.bov * fl2 * (m === 0 ? 0.5 : 1);
    P.gWh = 0.010 * this.spool * this.spool;
    const wInc = TWO_PI * (2600 + 6200 * this.spool) / sr; P.cw = Math.cos(wInc); P.sw = Math.sin(wInc);
    P.fW = 2 * Math.sin(Math.PI * (1500 + 2600 * this.boost) / sr);
  }

  // én tenning: skriv trykkpuls inn i riktig bank
  fire(c, frac, w) {
    const P = this.P;
    let comb = P.combAmp;
    if (comb > 0) comb *= 1 + P.cycVar * (this.rnd() + this.rnd() - 1) * 1.7;
    if (P.pLate > 0 && this.rnd() < P.pLate) comb += P.lateAmp * (0.3 + 0.7 * this.rnd());
    const a = (comb + P.motorAmp) * this.cylGain[c];
    const pos = w + 1 + this.runner[c] + (1 - frac);
    const ip = pos | 0, f = pos - ip, buf = this.bank[c] ? this.impB : this.impA;
    buf[ip & this.M] += a * (1 - f); buf[(ip + 1) & this.M] += a * f;
    this.mechEnv += P.tick * (0.5 + this.rnd());
  }

  render(Lo, Ro, n) {
    const sr = this.sr, dt = n / sr;
    this.control(dt);
    const P = this.P, M = this.M;
    const impA = this.impA, impB = this.impB, popA = this.popA, popB = this.popB;
    const dlA = this.dlA, dlB = this.dlB, dsA = this.dsA, dsB = this.dsB;
    const DA = this.DA, DB = this.DB, SA = this.SA, SB = this.SB;
    const dec = P.dec, kb = P.kb, gRasp = P.gRasp, r1 = P.r1, r2 = P.r2, km = P.km, rB = 0.22;
    const X = this.pr.snd;
    const kdc = 1 - Math.exp(-6.283185307179586 * X.dc / sr);
    const fR = 2 * Math.sin(Math.PI * X.rasp[7] / sr), qR = 1.1;
    const pdec = Math.exp(-1 / (sr * 0.0045));
    const kl = 1 - Math.exp(-6.283185307179586 * 1500 / sr), ks = 1 - Math.exp(-6.283185307179586 * 3800 / sr);
    const ko = 1 - Math.exp(-6.283185307179586 * 4200 / sr);
    const fI1 = 2 * Math.sin(Math.PI * X.intake[2] / sr), fI2 = 2 * Math.sin(Math.PI * X.intake[3] / sr), qI = 0.5, mI = X.intake[4];
    const fM = 2 * Math.sin(Math.PI * 2900 / sr), qM = 0.9, mdec = Math.exp(-1 / (sr * 0.0012));
    const fW = P.fW, qW = 0.8, fB = 2 * Math.sin(Math.PI * 1700 / sr), qB = 1.2;
    const flap = this.flap, gInt = P.gInt, gMech = P.gMech, mFloor = P.mechFloor, gWhoosh = P.gWhoosh, gBov = P.gBov, gWh = P.gWh;
    const cw = P.cw, sw = P.sw, tA1 = this.tA1, tA2 = this.tA2, gTh = 0.3 * Math.sin(6.283185307179586 * 62 / sr);
    const O = this.out, khp = 1 - Math.exp(-6.283185307179586 * O.hp / sr), ktl = 1 - Math.exp(-6.283185307179586 * O.lp / sr);
    const khp2 = O.hp2 > 0 ? 1 - Math.exp(-6.283185307179586 * O.hp2 / sr) : 0, pre = O.pre;
    const cb0 = this.cb0, cb1 = this.cb1, cb2 = this.cb2, ca1 = this.ca1, ca2 = this.ca2;
    const gEx = X.ex, gSide = X.side * (0.4 + 0.6 * flap) * O.side, gPop = 1.1;
    const lrel = Math.exp(-1 / (sr * 0.07)), LIM = O.lim;
    const outG = this.vol * this.muteG;
    const stereo = Ro && Ro !== Lo;

    let w = this.w, seed = this.seed, ph = this.ph, gap = this.gap[this.fi];
    const fdiv = this.fdiv, nF = this.nF;
    let dph = this.rpmSPrev / fdiv / sr; const ddph = (this.rpmS / fdiv / sr - dph) / n;
    // bilbytte: lineær ut- og inntoning per sample
    let xg = this.xg; const xT = this.nextP || this.nextO ? 0 : 1, xd = 1 / (0.07 * sr);
    let eA = this.eA, eB = this.eB, bA = this.bA, bB = this.bB, dcA = this.dcA, dcB = this.dcB;
    let rlA = this.rlA, rbA = this.rbA, rlB = this.rlB, rbB = this.rbB;
    let pA = this.pA, pB = this.pB, plA = this.plA, plB = this.plB, psA = this.psA, psB = this.psB;
    let m1 = this.m1, m2 = this.m2, o1 = this.o1, sdLP = this.sdLP;
    let i1l = this.i1l, i1b = this.i1b, i2l = this.i2l, i2b = this.i2b;
    let mcl = this.mcl, mcb = this.mcb, mechEnv = this.mechEnv;
    let wl = this.wl, wb = this.wb, bl = this.bl, bb = this.bb, wc = this.wc, ws = this.ws;
    let th1 = this.th1, th2 = this.th2;
    let hp = this.hp, hp2 = this.hp2, cz1 = this.cz1, cz2 = this.cz2, tl = this.tl, limEnv = this.limEnv;
    let thImp = this.thImp; this.thImp = 0;

    for (let i = 0; i < n; i++) {
      dph += ddph; ph += dph;
      if (ph >= gap) {
        ph -= gap;
        this.seed = seed; this.mechEnv = mechEnv;
        this.fire(this.order[this.fi], ph / dph, w);
        this.fi = this.fi === nF - 1 ? 0 : this.fi + 1; gap = this.gap[this.fi];
        seed = this.seed; mechEnv = this.mechEnv;
      }
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const n1 = seed * 4.656612873077393e-10;
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const n2 = seed * 4.656612873077393e-10;

      // ---- bank A ----
      let imp = impA[w]; impA[w] = 0;
      eA = eA * dec + imp;
      bA += kb * (eA - bA); dcA += kdc * (bA - dcA);
      let x = bA - dcA;
      rlA += fR * rbA; let h = n1 * bA - rlA - qR * rbA; rbA += fR * h;
      x += gRasp * rbA;
      imp = popA[w]; popA[w] = 0; pA = pA * pdec + imp;
      x += pA * gPop * (0.5 + 0.9 * n2);
      let d = dsA[(w - SA) & M]; psA += ks * (d - psA);
      const yA = x + rB * psA; dsA[w] = yA;

      // ---- bank B ----
      imp = impB[w]; impB[w] = 0;
      eB = eB * dec + imp;
      bB += kb * (eB - bB); dcB += kdc * (bB - dcB);
      x = bB - dcB;
      rlB += fR * rbB; h = n2 * bB - rlB - qR * rbB; rbB += fR * h;
      x += gRasp * rbB;
      imp = popB[w]; popB[w] = 0; pB = pB * pdec + imp;
      x += pB * gPop * (0.5 + 0.9 * n1);
      d = dsB[(w - SB) & M]; psB += ks * (d - psB);
      const yB = x + rB * psB; dsB[w] = yB;

      // ---- felles rør (turbin -> endepotte, kvartbølge) og endestykke ----
      d = dlA[(w - DA) & M]; plA += kl * (d - plA);
      let mid = yA + yB - r1 * plA; dlA[w] = mid;
      d = dlB[(w - DB) & M]; plB += ks * (d - plB);
      mid += r2 * plB; dlB[w] = mid;

      // ---- endepotte / klaff ----
      m1 += km * (mid - m1); m2 += km * (m1 - m2);
      o1 += ko * (mid - o1);
      let sig = (flap * o1 + (1 - flap) * 1.25 * m2) * gEx;

      // ---- innsug ----
      const iv = bA + bB;
      i1l += fI1 * i1b; h = iv - i1l - qI * i1b; i1b += fI1 * h;
      i2l += fI2 * i2b; h = iv - i2l - qI * i2b; i2b += fI2 * h;
      sig += (i1b * mI + i2b) * gInt;

      // ---- mekanisk støy / ventiltikk ----
      mechEnv *= mdec;
      mcl += fM * mcb; h = n1 * (mFloor + mechEnv) - mcl - qM * mcb; mcb += fM * h;
      sig += mcb * gMech;

      // ---- turbo ----
      wl += fW * wb; h = n2 * gWhoosh - wl - qW * wb; wb += fW * h;
      bl += fB * bb; h = n2 * gBov - bl - qB * bb; bb += fB * h;
      const c2 = wc * cw - ws * sw; ws = ws * cw + wc * sw; wc = c2;
      sig += wb + bb + ws * gWh;

      // ---- dunk ----
      const th = tA1 * th1 - tA2 * th2 + thImp; thImp = 0; th2 = th1; th1 = th;
      sig += th * gTh;

      // ---- kupé: DC-sperre, 105 Hz-topp, diskantavrulling ----
      sig *= pre;
      hp += khp * (sig - hp); sig -= hp;
      if (khp2 > 0) { hp2 += khp2 * (sig - hp2); sig -= hp2; }
      const cy = cb0 * sig + cz1; cz1 = cb1 * sig - ca1 * cy + cz2; cz2 = cb2 * sig - ca2 * cy;
      tl += ktl * (cy - tl);

      // ---- stereo + begrenser ----
      sdLP += ko * ((yA - yB) - sdLP);
      const sd = sdLP * gSide * pre;
      let l = tl + sd, r = tl - sd;
      let pk = l < 0 ? -l : l; const pr = r < 0 ? -r : r; if (pr > pk) pk = pr;
      limEnv = pk > limEnv ? pk : limEnv * lrel;
      if (limEnv > LIM) { const g = LIM / limEnv; l *= g; r *= g; }
      if (xg !== xT) { xg += xg < xT ? xd : -xd; if (xg > 1) xg = 1; else if (xg < 0) xg = 0; }
      const og = outG * xg;
      l *= og; r *= og;
      if (!(l === l)) { l = 0; r = 0; }
      Lo[i] = l; if (stereo) Ro[i] = r;
      w = (w + 1) & M;
    }
    // renormaliser fasor, lagre tilstand
    { const mg = Math.sqrt(wc * wc + ws * ws) || 1; wc /= mg; ws /= mg; }
    this.w = w; this.seed = seed; this.ph = ph; this.xg = xg;
    this.eA = eA; this.eB = eB; this.bA = bA; this.bB = bB; this.dcA = dcA; this.dcB = dcB;
    this.rlA = rlA; this.rbA = rbA; this.rlB = rlB; this.rbB = rbB;
    this.pA = pA; this.pB = pB; this.plA = plA; this.plB = plB; this.psA = psA; this.psB = psB;
    this.m1 = m1; this.m2 = m2; this.o1 = o1; this.sdLP = sdLP;
    this.i1l = i1l; this.i1b = i1b; this.i2l = i2l; this.i2b = i2b;
    this.mcl = mcl; this.mcb = mcb; this.mechEnv = mechEnv;
    this.wl = wl; this.wb = wb; this.bl = bl; this.bb = bb; this.wc = wc; this.ws = ws;
    this.th1 = th1; this.th2 = th2;
    this.hp = hp; this.hp2 = hp2; this.cz1 = cz1; this.cz2 = cz2; this.tl = tl; this.limEnv = limEnv;

    this.teleT += dt;
    if (this.teleT >= 0.03) {
      this.teleT = 0;
      const t = this.tele, s = this.sh;
      t.rpm = this.rpmS; t.gear = this.gear; t.v = this.v; t.load = this.load; t.lim = this.limOn;
      t.shift = s.active ? s.dir : 0; t.boost = this.boost; t.flap = this.flap; t.ovr = this.ovr;
      t.ev = this.evq; this.evq = [];
      return true;
    }
    return false;
  }

  // Prosedyrisk impulsrespons for tunnel (betongrør): tidlige flutter-ekko mellom veggene
  // + diffus hale der bassen varer lengst. Returnerer [venstre, høyre].
  static tunnelIR(sr, dur) {
    const n = Math.round(sr * dur), out = [new Float32Array(n), new Float32Array(n)];
    let seed = 0x2468ace;
    const rnd = function () { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return seed * 4.656612873077393e-10; };
    for (let ch = 0; ch < 2; ch++) {
      const o = out[ch];
      let lp1 = 0, lp2 = 0, lpH = 0;
      const kLo = 1 - Math.exp(-2 * Math.PI * 260 / sr), kMid = 1 - Math.exp(-2 * Math.PI * 1900 / sr), kTop = 1 - Math.exp(-2 * Math.PI * 6000 / sr);
      const pre = Math.round(sr * 0.012);
      // RT60: bass ca. 3.8 s, mellomtone 2.6 s, diskant 1.1 s
      const dLo = Math.exp(-6.908 / (sr * 3.8)), dMid = Math.exp(-6.908 / (sr * 2.6)), dHi = Math.exp(-6.908 / (sr * 1.1));
      let eLo = 1, eMid = 1, eHi = 1;
      for (let i = pre; i < n; i++) {
        const x = rnd();
        lp1 += kLo * (x - lp1); lp2 += kMid * (x - lp2); lpH += kTop * (x - lpH);
        const lo = lp1, mid = lp2 - lp1, hi = lpH - lp2;
        const build = 1 - Math.exp(-(i - pre) / (sr * 0.03));
        o[i] = build * (lo * 2.6 * eLo + mid * 1.0 * eMid + hi * 0.55 * eHi);
        eLo *= dLo; eMid *= dMid; eHi *= dHi;
      }
      // tidlige refleksjoner: sidevegger (ca. 9.5 m) og tak (ca. 5 m), litt ulikt per kanal
      const tw = (ch ? 0.0283 : 0.0271), th = (ch ? 0.0149 : 0.0157);
      for (let k = 1; k <= 14; k++) {
        const a = 0.55 * Math.pow(0.78, k) * (k & 1 ? 1 : -0.9);
        let p = Math.round(sr * tw * k); if (p < n - 2) { o[p] += a; o[p + 1] += a * 0.5; }
        p = Math.round(sr * th * k); if (p < n - 2) { o[p] += a * 0.7; o[p + 1] += a * 0.35; }
      }
      // normaliser energi og ton ut slutten
      let e = 0; for (let i = 0; i < n; i++) e += o[i] * o[i];
      const g = 1 / Math.sqrt(e || 1), fade = Math.round(sr * 0.25);
      for (let i = 0; i < n; i++) { let f = 1; if (i > n - fade) f = (n - i) / fade; o[i] *= g * f; }
    }
    return out;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = EngineCore;
