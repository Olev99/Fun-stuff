# Zoomies! Kart Chaos

A tilt-to-steer kart racer that runs in the browser on your iPhone. No App Store and no install are needed, though you can add it to your Home Screen for full screen. You can race the computer or up to 3 friends on their own phones.

## What's in it

- **8 original racers:** Mochi the cat, Pip the penguin, Bruno the bear, Rexi the dino, Volt the robot, Ember the fox, Zorp the alien and Hopper the frog. Each has its own speed, acceleration, handling and weight.
- **18 tracks in 3 sizes and 14 themes,** each also playable in reverse. Every track hides at least one secret shortcut.

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
  | Windmill Downs | Medium | Farmland esses, windmill, pond | **Cart Track:** a dirt lane past the barn |
  | Tidal Twist | Short | Seaside figure-eight with a bridge | **Lagoon Boardwalk:** across the lagoon |
  | Glacier Gorge | Long | Sheer ice, black-ice sheets, frozen lake | **Crevasse** (ice) and **Snowdrift Cut** |
  | Obsidian Rush | Long | Black-glass highway, lava lakes | **Magma Chute** and **Glass Bridge** (jump the gap) |
  | Spooky Hollow | Medium | Haunted manor, ghosts, mud | **Crypt Passage:** through the crypt |
  | Jungle Ruins | Medium | Vines, temple, rolling boulders | **Temple Tunnel:** through the ruins |
  | Gearworks | Medium | Factory figure-eight, oil slicks, barrels | **Loading Bay** and **Scrap Alley** |
  | Moonbase Loop | Long | Low gravity, craters, Earth overhead | **Crater Hop:** a floaty jump over a crater |
  | Maple Ridge | Medium | Autumn ridge climb and descent | **Lumber Run:** down through the logging trail |
  | Blossom Gardens | Short | Cherry trees, koi pond, torii gates | **Bamboo Grove:** through the bamboo |

- **Track hazards:** hay bales, crabs, tumbleweeds, snowballs, penguins, gumballs, laser gates, fireballs, boulders, balloons, ghosts, rolling barrels and moon rovers. There are also boost pads, jump ramps, glide ramps with a pop-out glider, gems, and road patches of black ice, oil, mud and sand. Snow and ice tracks have much less grip, and the moon has low gravity.
- **Career:** a story mode where you start in the scrapyard with the Rust Bucket and one racer.
  - 7 chapters, 35 events. Event types are races, gem hunts, time trials, one-on-one rival duels and a final 4-race cup for the Golden Wheel.
  - Each chapter has a rival with a short story before and after. Beating them opens the next chapter and lets that racer join your team.
  - Events pay coins by finishing place and gems, plus a first-clear bonus. Each event also has 3 stars to earn.
  - Spend coins in the **Garage** on 6 kart bodies (from the Rust Bucket to the Starbolt), 4 upgrades per kart with 5 levels each, paint jobs and new racers.
  - Progress is saved on the phone. Settings has a reset.
- **Modes:**
  - Career.
  - Grand Prix: 9 cups of 4 races with points.
  - Quick Race.
  - Time Trial, with saved records.
  - Multiplayer.
- **AI difficulty:** Easy, Normal or Hard. This is separate from the speed class (Chill, Zoom or Turbo). Hard racers take shortcuts, drift more and use items smarter.
- **Driving:** drift mini-turbos with blue, orange and purple sparks, rocket starts, ramp tricks, and falling off gaps (a quick respawn puts you back).
- **17 items:** Chili Boost 🌶️, Honey Pot 🍯, Bumper Ball 🥎, Buzz Bee 🐝, Bubble Shield 🫧, Rainbow Rush 🌈, Thunder Cloud ⛈️, Boomerang 🪃, Gem Magnet 🧲, Warp Swirl 🌀, Rocket Ride 🚀, Gum Bomb 💣, Oil Slick 🛢️, Honk Blast 📯, Firework 🎆, Twister 🌪️ and Boo Mask 👻. The racers at the back get the catch-up items. Throwable items can be aimed: swipe ITEM up to throw ahead or down to throw behind, or hold BRAKE while tapping it.
- **Controls:** tilt the phone like a steering wheel. Gas is automatic. There are big thumb buttons for DRIFT, ITEM and BRAKE. Touch steering and keyboard controls are also available.

## Playing on iPhone

iOS only allows tilt controls on HTTPS pages opened directly in Safari, not inside frames. Multiplayer also needs the full page, because WebRTC is blocked inside frames. The repo is public, so GitHub Pages hosts it for free:

1. In the repo, go to **Settings → Pages → Build and deployment**. Set **Source** to **Deploy from a branch**, pick the branch and `/ (root)`, and save.
   - Pick `main` once this work is merged.
   - To try it before merging, pick `claude/iphone-racing-game-0wytrs`. Every push to that branch updates the site.
2. Wait a minute for the first deploy (the **Actions** tab shows it), then open `https://olev99.github.io/Fun-stuff/` in Safari on the iPhone. It redirects to the game.
3. Tap **Share → Add to Home Screen**. Launching from the icon gives full screen without Safari's bars.
4. Tap a menu button and allow **Motion & Orientation** access when iOS asks.

Hold the phone sideways like a steering wheel and turn it to steer. **Settings** has a live tilt check, a sensitivity slider and an invert option.

## Racing with friends

1. Everyone opens the game (same link), taps **Multiplayer** and types a name. The name floats over your kart on your friends' screens.
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
| Drift / trick | Hold **DRIFT** while turning to slide (no jump), release for a turbo; tap it in the air off a ramp | Space / Shift |
| Use item | **ITEM** | E / X / Enter |
| Brake / reverse | **BRAKE** | ↓ / S |
| Pause | **II** button | Esc / P |

- **Rocket start:** press and hold DRIFT right after the "2" disappears.
- **Name tags:** the other karts show their name and current place above them, so you can see when you pass someone. In online races, friends get big tags in their kart colour that show from far away; computer racers get small tags up close. Settings switches tags between Everyone, Friends and Off.
- **Shortcuts:** look for gaps in the wall, stacked crates and odd side paths. The sandy or candy-floss ones are slow unless you hit them with a boost.
- **Gems:** each one adds a little top speed, up to 10. Getting hit drops 3.

## Tech

- **Rendering:** [three.js](https://threejs.org) (vendored in `vendor/`) with plain ES modules and no build step. Graphics are tuned for iPhone 15 Pro and newer:
  - HDR rendering into a 4× multisampled half-float target, then bloom, Khronos PBR Neutral tone mapping, a colour grade per track, vignette and a radial speed blur while boosting.
  - Physically based materials lit by an environment map made from each track's sky, soft 2048 px sun shadows and a camera fill light.
  - Sky with drifting procedural clouds (star field and nebula at night), water with Fresnel sky reflections, sun glints and shore foam, glowing lava, wind-blown grass, weather particles per track (snow, petals, embers and more) and tyre skid marks.
- **Models:** every model is generated in code from primitives with baked vertex colours and a per-vertex surface preset (paint, chrome, rubber, glass, glowing lights and more), so one draw call can mix materials. Each kart is 3 draw calls, all wheels share one instanced draw, and scenery is instanced in spatial chunks so off-screen props are skipped.
- **Tracks:** each track is a spline, and shortcuts are extra spline branches. Karts are simulated in "path space" (distance along the path + lateral offset) and switch between the main road and shortcuts through gaps in the walls. That keeps walls, banking, jumps, bridges and AI cheap. A full 8-kart physics step costs about 0.1–0.2 ms.
- **Frame rate:** every graphics setting scales render resolution with frame time to hold 60 fps. Auto renders at 1.35–2.4× (starting at 2×), Ultra at 1.8–3× and Battery at 1.2–1.6× without bloom. If Low Power Mode caps Safari at 30 fps, the game notices and doesn't lower the resolution for nothing.
- **Audio:** all sound is synthesised with WebAudio, including the engine, effects and a procedural chiptune per track. There are no audio files.
- **Networking:** [PeerJS](https://peerjs.com) (vendored). To test locally without the internet, add `?net=local` to the URL and open two tabs.

```
zoomies/
  index.html          UI, HUD and styles
  src/main.js         app shell, menus, Grand Prix, career and multiplayer flow, dynamic resolution
  src/career.js       career chapters, events, story, prices, scoring and save data
  src/careerui.js     career hub, garage, story dialogue and career results
  src/race.js         race loop, laps, positions, collisions, camera, network sync
  src/net.js          multiplayer sessions (PeerJS / BroadcastChannel transports)
  src/post.js         HDR post-processing: bloom, tone mapping, grading, speed blur
  src/env.js          image-based lighting (sky and studio environment maps)
  src/weather.js      GPU weather particles and wind-blown grass
  src/skids.js        tyre skid marks
  src/kart.js         kart physics (drift, boosts, jumps, glide, respawn) and visuals
  src/track.js        spline paths, shortcuts, bridges, path-space queries
  src/tracks.js       track layouts, shortcuts and cups
  src/world.js        sky, terrain, lakes, walls, scenery and landmarks per theme
  src/characters.js   racers and their procedural models
  src/karts.js        kart bodies, upgrades and kart stats
  src/nametags.js     name and place tags floating over the karts
  src/ai.js           computer drivers and difficulty levels
  src/items.js        items, item boxes, gems, obstacles, crates
  src/input.js        tilt, touch and keyboard input
  src/audio.js        synthesised sound effects and music
  tools/build-single.mjs  bundles everything into one HTML file
```

To run it locally, serve the folder over HTTP, for example with `python3 -m http.server` inside `zoomies/`, then open `http://localhost:8000`.
