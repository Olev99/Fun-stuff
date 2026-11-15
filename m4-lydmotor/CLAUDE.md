# M4 Lydmotor: rules for working in this folder

This folder is a separate app from Zoomies. The Zoomies rules in the root `CLAUDE.md` (stamping, `run.mjs`, the `kart-*` agents, model routing) do not apply here. Nothing in `m4-lydmotor/` may touch `zoomies/`, and nothing in `zoomies/` may depend on this folder. The root rules on branches and pull requests, and on keeping model names out of repo files, commit messages and PR text, still apply.

## What it is

A single-page web app that makes an electric car (the owner's BMW i4 M50) sound like a BMW M4 CSL (2023, G82, S58 3.0 L twin-turbo inline-6, 8-speed automatic, 7,200 rpm limiter). It runs in iPhone Safari, plays through the car speakers over CarPlay or Bluetooth, and is driven by real driving: GPS speed plus the phone's accelerometer. It is a hobby project and not a product.

Published page: https://olev99.github.io/Fun-stuff/m4-lydmotor/ (GitHub Pages serves `main`, so a push to `main` updates it).
A private artifact with the same page exists for quick sound tests (test mode and the manual tunnel button only, because the artifact sandbox blocks GPS and motion): https://claude.ai/artifact/EcoBDqRzkNApNsuaDQu55K

## Owner's priorities (keep to these)

- **Realism of an M4 CSL, as good as it can be made.** The owner has said the first versions did not sound realistic enough. Judge changes by ear-relevant facts (pitch tied to rpm, firing frequency rpm/20 Hz, rasp, load behaviour) and by the numeric checks in `src/test.js`. Nobody can listen in the cloud sandbox, so say clearly what was verified numerically and what only the owner's ear can judge.
- **Gear shifts matter most.** Upshifts under load (ignition cut, crackle, bang), lift-off and overrun (fuel cut, burble, pops), and rev-matched downshifts (the blip) must be clearly audible. When the owner reports something wrong, start there.
- **Tunnel acoustics:** a convolution reverb on a wet send, switched by a manual button and by GPS loss; an optional map lookup is off by default because it sends the position to OpenStreetMap.
- **Minimum latency.** The DSP runs in an AudioWorklet with 128-sample quanta, driven by `latencyHint: 'interactive'`. Do not add main-thread work to the audio path. Bluetooth and CarPlay buffering is outside our control.
- **Norwegian (bokmål) UI text.** Phone first, large controls, nothing to touch while driving: the start screen starts audio and sensors in one tap.
- **Sound must be our own.** No recorded or ripped engine samples from games, videos or other copyrighted sources. Synthesis, or recordings the owner makes himself.

## Layout

- `index.html`: the built single file that GitHub Pages serves. Do not edit it by hand.
- `src/template.html`: markup and styles. `src/main.js`: page script (UI, sensors, GPS and motion fusion, tunnel detection, settings). `src/engine.js`: class `EngineCore`, the whole sound and drivetrain model.
- `src/build.py`: `python3 m4-lydmotor/src/build.py` inlines `engine.js` and `main.js` into `template.html` and writes `m4-lydmotor/index.html`. Rebuild and commit `index.html` with every source change.
- `src/test.js`: offline Node checks. `node m4-lydmotor/src/test.js` runs them (about 40 checks: spectrum, firing frequency, shift trajectories, pops, limiter, tunnel tail, clipping, CPU cost); `node m4-lydmotor/src/test.js demo` renders a demo drive to WAV.

## Constraints that bite

- `EngineCore` is sent to the AudioWorklet as text with `EngineCore.toString()`, so the class must be fully self-contained (no outside references). The same class runs on the main thread as a ScriptProcessor fallback.
- The worklet loads from a blob URL; that fails on `file://`, so test over `http://localhost`.
- iOS Safari: audio and sensors stop if the page is backgrounded or the screen locks (wake lock is used and re-acquired); the silent switch mutes Web Audio unless the audio session is set to playback and a silent looping audio element runs (both are in place); motion permission needs a user gesture.
- GPS and motion only work on an https origin, not inside the artifact sandbox.
- GPS speed arrives about once per second and about a second late. The accelerometer is the only fast signal, so throttle and braking are inferred from it. In the i4, lifting off the pedal brakes by regeneration, which the model treats as engine braking.
- BMW CarData is not usable for this (event-driven, low request limits, no speed or pedal data).

## Known open points

- Nothing has been tested on a real iPhone or in the car: latency, wake lock, silent switch, sensor permissions, real tunnel behaviour, CPU on the phone.
- The waveform is peaky (crest factor about 14 dB at full throttle) and may sound harsher than a cabin recording; check by ear.
- An early version let the half order dominate (a three-cylinder-like beat). It is fixed in the model, but confirm by ear that the six sounds smooth.
- Gear ratios and final drive (5.000/3.200/2.143/1.720/1.313/1.000/0.823/0.640, 3.154) come from one spec site; a second site listed a different set that was not checked against a BMW source.
- Throttle inferred from acceleration is wrong on slopes and with noisy readings, which can cause occasional wrong shifts or kick-downs.
- The live OpenStreetMap request (optional tunnel lookup) was never exercised; only the matching code was tested with a synthetic tunnel.

## Workflow

Work on a branch and follow the root convention for pull requests, unless the owner says to push straight to `main`. Run `node m4-lydmotor/src/test.js` after any change to `engine.js` and load the built page in headless Chrome over `http://localhost` after changes to `main.js` or the template. Keep `README.md` in the repo root accurate.
