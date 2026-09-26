# Zoomies! Kart Chaos

A tilt-to-steer kart racer that runs in the browser on your iPhone. No App Store and no install are needed, though you can add it to your Home Screen for full screen.

- **8 original racers:** Mochi the cat, Pip the penguin, Bruno the bear, Rexi the dino, Volt the robot, Ember the fox, Zorp the alien and Hopper the frog. Each has its own speed, acceleration, handling and weight.
- **4 tracks, each also playable in reverse:** Sprout Speedway (meadows and a windmill), Dune Dash Canyon (desert mesas), Frostbite Pass (slippery ice) and Neon Nebula (a glowing skyway city).
- **Modes:** Grand Prix (two 4-race cups with points), Quick Race, and Time Trial with saved records.
- **Driving:**
  - Drift mini-turbos with blue, orange and purple sparks.
  - Rocket starts.
  - Ramp tricks.
  - Boost pads and gems that add top speed.
- **7 items:** Chili Boost 🌶️, Honey Pot 🍯, Bumper Ball 🥎, Buzz Bee 🐝, Bubble Shield 🫧, Rainbow Rush 🌈 and Thunder Cloud ⛈️.
- **Controls:** tilt the phone like a steering wheel. Gas is automatic. There are big thumb buttons for DRIFT, ITEM and BRAKE. Touch steering and keyboard controls are also available.

## Playing on iPhone

iOS only allows tilt controls on HTTPS pages opened directly in Safari, not inside frames. The easiest host is GitHub Pages:

1. Merge this branch into `main`.
2. In the repo, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then `main` and `/ (root)`, and save.
   GitHub Pages on a private repo needs a paid GitHub plan. On a free plan, make the repo public or host the `zoomies/` folder on any static host (Netlify, Cloudflare Pages, Vercel).
3. Open `https://<your-username>.github.io/Fun-stuff/zoomies/` in Safari on the iPhone.
4. Tap **Share → Add to Home Screen**. Launching from the icon gives full screen without Safari's bars.
5. Tap a menu button and allow **Motion & Orientation** access when iOS asks. If you tapped "Don't Allow", clear the site's data or close and reopen Safari. The game falls back to touch steering until then.

Hold the phone sideways like a steering wheel and turn it to steer. **Settings** has a live tilt check, a sensitivity slider and an invert option.

## How to play

| Action | Touch | Keyboard |
| --- | --- | --- |
| Steer | Tilt the phone, or drag on the left side | ← → / A D |
| Drift / hop | Hold **DRIFT** while turning, release for a turbo | Space / Shift |
| Use item | **ITEM** | E / X / Enter |
| Brake / reverse | **BRAKE** | ↓ / S |
| Pause | **II** button | Esc / P |

- **Rocket start:** press and hold DRIFT right after the "2" disappears.
- **Trick:** tap DRIFT just after launching off a ramp. You get a boost when you land.
- **Gems:** each one adds a little top speed, up to 10. Getting hit drops 3.

## Tech

- **Rendering:** [three.js](https://threejs.org) (vendored in `vendor/`) with plain ES modules and no build step.
- **Models:** every model is generated in code from primitives with baked vertex colours. Each kart is 3 draw calls, and all wheels share one instanced draw.
- **Physics:** arcade physics runs in "track space" (distance along a spline + lateral offset). That makes collisions, banking, jumps and AI cheap. A full 8-kart simulation step costs about 0.1 ms.
- **Frame rate:** the Auto graphics setting scales render resolution with frame time to hold 60 fps. It also uses a following shadow map, cel shading and fog.
- **Audio:** all sound is synthesised with WebAudio, including the engine, effects and a procedural chiptune per track. There are no audio files.

```
zoomies/
  index.html          UI, HUD and styles
  src/main.js         app shell, menus, Grand Prix, dynamic resolution
  src/race.js         race loop, laps, positions, collisions, camera
  src/kart.js         kart physics (drift, boosts, jumps) and visuals
  src/track.js        spline track, road geometry, track-space queries
  src/tracks.js       track layouts and cups
  src/world.js        sky, terrain, walls, scenery per theme
  src/characters.js   racers and their procedural models
  src/ai.js           computer drivers
  src/items.js        item boxes, gems, projectiles, hazards
  src/input.js        tilt, touch and keyboard input
  src/audio.js        synthesised sound effects and music
  tools/build-single.mjs  bundles everything into one HTML file
```

To run it locally, serve the folder over HTTP, for example with `python3 -m http.server` inside `zoomies/`, then open `http://localhost:8000`.
