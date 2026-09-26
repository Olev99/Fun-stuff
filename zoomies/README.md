# Zoomies! Kart Chaos

A tilt-to-steer kart racer that runs in the browser on your iPhone. No App Store and no install are needed, though you can add it to your Home Screen for full screen. You can race the computer or up to 3 friends on their own phones.

## What's in it

- **8 original racers:** Mochi the cat, Pip the penguin, Bruno the bear, Rexi the dino, Volt the robot, Ember the fox, Zorp the alien and Hopper the frog. Each has its own speed, acceleration, handling and weight.
- **8 tracks in 3 sizes,** each also playable in reverse. Every track hides at least one secret shortcut.

  | Track | Size | Theme | Secret shortcut |
  | --- | --- | --- | --- |
  | Sprout Speedway | Short | Meadows, windmill, hill jump | **Barn Lane:** smash the crates and drive through the barn |
  | Coral Cove | Short | Beach boardwalk, lighthouse, lagoon | **Sandbar:** slow sand across the lagoon; bring a boost |
  | Dune Dash Canyon | Medium | Desert mesas, narrow canyon | **Mesa Cave:** a tunnel through the rock |
  | Frostbite Pass | Medium | Snow, pines, icy grip | **Ice Shelf:** a slippery short cut over the ice |
  | Sweet Tooth Valley | Medium | Candy land, chocolate road | **Gingerbread Lane:** through a gingerbread house |
  | Neon Nebula | Long | Night city, figure-eight flyover | **Hyperlane Leap:** a ramp jump over a gap |
  | Magma Mountain | Long | Volcano climb, lava | **Crater Leap:** jump the lava pit |
  | Cloud Carnival | Long | Floating fairground, glide ramps | **Rainbow Leap** (glide over a gap) and **Cotton Candy Cut** |

- **Track hazards:** hay bales, crabs, tumbleweeds, snowballs, penguins, gumballs, laser gates, fireballs, boulders and balloons. There are also boost pads, jump ramps, glide ramps with a pop-out glider, and gems.
- **Modes:**
  - Grand Prix: 4 cups of 4 races with points.
  - Quick Race.
  - Time Trial, with saved records.
  - Multiplayer.
- **AI difficulty:** Easy, Normal or Hard. This is separate from the speed class (Chill, Zoom or Turbo). Hard racers take shortcuts, drift more and use items smarter.
- **Driving:** drift mini-turbos with blue, orange and purple sparks, rocket starts, ramp tricks, and falling off gaps (a quick respawn puts you back).
- **11 items:** Chili Boost 🌶️, Honey Pot 🍯, Bumper Ball 🥎, Buzz Bee 🐝, Bubble Shield 🫧, Rainbow Rush 🌈, Thunder Cloud ⛈️, Boomerang 🪃, Gem Magnet 🧲, Warp Swirl 🌀 and Rocket Ride 🚀. The racers at the back get the catch-up items.
- **Controls:** tilt the phone like a steering wheel. Gas is automatic. There are big thumb buttons for DRIFT, ITEM and BRAKE. Touch steering and keyboard controls are also available.

## Playing on iPhone

iOS only allows tilt controls on HTTPS pages opened directly in Safari, not inside frames. Multiplayer also needs the full page, because WebRTC is blocked inside frames. The easiest host is GitHub Pages:

1. Merge this branch into `main`.
2. In the repo, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then `main` and `/ (root)`, and save.
   GitHub Pages on a private repo needs a paid GitHub plan. On a free plan, make the repo public or host the `zoomies/` folder on any static host (Netlify, Cloudflare Pages, Vercel).
3. Open `https://<your-username>.github.io/Fun-stuff/zoomies/` in Safari on the iPhone.
4. Tap **Share → Add to Home Screen**. Launching from the icon gives full screen without Safari's bars.
5. Tap a menu button and allow **Motion & Orientation** access when iOS asks.

Hold the phone sideways like a steering wheel and turn it to steer. **Settings** has a live tilt check, a sensitivity slider and an invert option.

## Racing with friends

1. Everyone opens the game (same link) and taps **Multiplayer**.
2. One player taps **Host a race** and gets a 4-letter room code.
3. Friends type the code and tap **Join**. Up to 4 phones can play, and each player picks a racer.
4. The host picks the track, speed and computer racers (Off, Easy, Normal or Hard), then taps **Start race**.
5. After the race, the host can take everyone back to the lobby for the next one.

How it works:

- Phones connect directly to each other over WebRTC. PeerJS's free public matchmaking server is used only to exchange the room code, so there is no game server to run.
- The host's phone runs the computer racers, item boxes and standings.
- Each phone drives its own kart, so steering never lags. Positions are shared about 20–30 times a second.
- It works best when phones are on the same Wi-Fi. It usually works across different networks and mobile data too. A few carrier networks block direct connections; if joining times out, try Wi-Fi.
- If a friend leaves mid-race, their kart becomes a computer racer. If the host leaves, everyone returns to the lobby screen.

## How to play

| Action | Touch | Keyboard |
| --- | --- | --- |
| Steer | Tilt the phone, or drag on the left side | ← → / A D |
| Drift / hop / trick | Hold **DRIFT** while turning, release for a turbo; tap it in the air off a ramp | Space / Shift |
| Use item | **ITEM** | E / X / Enter |
| Brake / reverse | **BRAKE** | ↓ / S |
| Pause | **II** button | Esc / P |

- **Rocket start:** press and hold DRIFT right after the "2" disappears.
- **Shortcuts:** look for gaps in the wall, stacked crates and odd side paths. The sandy or candy-floss ones are slow unless you hit them with a boost.
- **Gems:** each one adds a little top speed, up to 10. Getting hit drops 3.

## Tech

- **Rendering:** [three.js](https://threejs.org) (vendored in `vendor/`) with plain ES modules and no build step.
- **Models:** every model is generated in code from primitives with baked vertex colours. Each kart is 3 draw calls, all wheels share one instanced draw, and scenery is instanced.
- **Tracks:** each track is a spline, and shortcuts are extra spline branches. Karts are simulated in "path space" (distance along the path + lateral offset) and switch between the main road and shortcuts through gaps in the walls. That keeps walls, banking, jumps, bridges and AI cheap. A full 8-kart physics step costs about 0.1–0.2 ms.
- **Frame rate:** the Auto graphics setting scales render resolution with frame time to hold 60 fps.
- **Audio:** all sound is synthesised with WebAudio, including the engine, effects and a procedural chiptune per track. There are no audio files.
- **Networking:** [PeerJS](https://peerjs.com) (vendored). To test locally without the internet, add `?net=local` to the URL and open two tabs.

```
zoomies/
  index.html          UI, HUD and styles
  src/main.js         app shell, menus, Grand Prix, multiplayer flow, dynamic resolution
  src/race.js         race loop, laps, positions, collisions, camera, network sync
  src/net.js          multiplayer sessions (PeerJS / BroadcastChannel transports)
  src/kart.js         kart physics (drift, boosts, jumps, glide, respawn) and visuals
  src/track.js        spline paths, shortcuts, bridges, path-space queries
  src/tracks.js       track layouts, shortcuts and cups
  src/world.js        sky, terrain, lakes, walls, scenery and landmarks per theme
  src/characters.js   racers and their procedural models
  src/ai.js           computer drivers and difficulty levels
  src/items.js        items, item boxes, gems, obstacles, crates
  src/input.js        tilt, touch and keyboard input
  src/audio.js        synthesised sound effects and music
  tools/build-single.mjs  bundles everything into one HTML file
```

To run it locally, serve the folder over HTTP, for example with `python3 -m http.server` inside `zoomies/`, then open `http://localhost:8000`.
