# Career 2.0: story and upgrade path (design spec)

Design goals: you start slow in a bad kart; as you progress you must **choose** what to upgrade; the story makes you want the next chapter. Everything original.

## 1. Story

Existing: Gramps Gearbox (mentor), Mic the Announcer, a rival per chapter (Hopper, Zorp, Pip, Ember, ...), 7 chapters, the Golden Wheel final.

Add a through-line and a villain:
- **Baron Von Boost** (new character, a smooth, polished racer in a gold kart) owns **Boost Corp**, the company that sponsors the Zoomies Circuit. Years ago Gramps (then "Gearbox Gus", the champion) designed the **Starbolt** with the Baron; the Baron took the design, pushed Gramps out and now sells identical "approved" karts to every team.
- The player is a nobody from the scrapyard with a heap and a gut feeling. Each chapter drops a clue (a rival's sponsor contract, a rigged boost pad, a locked garage). Rivals are not all villains: some are Boost Corp's puppets (Ember), some quietly resent it (Pip), some join the player.
- Mid-story twist (chapter 4 or 5): a rival defects or the Baron makes the player an offer. End: the Baron races the Golden Wheel final himself. After it, the Baron's workshop yields Gramps's original Starbolt blueprint (unlocks the best Part tier).
- Add a **prologue** (a short scrapyard scene plus a tiny first race that is easy to win, teaching drift and boost) and an **epilogue** that opens a post-game league (Phase 4, leave a "coming soon" hook).
- Short scenes only (2-5 lines each), funny and warm, same voice as the existing ones. Each chapter intro/outro should add something to the plot; rivals should react to the player's progress.

Names must be original; do not copy any existing kart game's characters or lore.

## 2. Slow start

- The Rust Bucket starts clearly weak (check current stats; make it so the first chapter is winnable with good driving but you feel the lack of speed). Computer racers in early chapters run old buggies.
- Early on you have 2 Part sockets and a few cheap Tier I parts. Power comes from earning parts and sockets, not from just buying levels.

## 3. The Parts system (replaces the 4x5 upgrade ladder)

**Sockets.** Every vehicle has a limited number of sockets. You can only fit that many parts at once. Swapping is free at any time in the Workshop, so you can tune per track.

| Vehicle | Sockets |
|---|---|
| Rust Bucket | 2 (can add 1 more with a Chassis Mod) |
| Zoom Classic, Splish Splash, Zoom Bike, Zip Scooter | 3 |
| Comet, Stomper, Hog Wild, Vortex | 4 |
| Starbolt | 5 |

A **Chassis Mod** (coins, once per vehicle, up to +1 socket on any vehicle) is a coin sink and a meaningful purchase.

**Part families (stat parts).** Each has Tier I, II, III. Higher tiers are stronger, and Tier III is "race-spec": a big bonus with a real drawback. No part is strictly best.

| Family | Effect | Tier III drawback |
|---|---|---|
| Engine | top speed | worse acceleration |
| Turbo coil | acceleration and drift-boost power | slightly lower top speed |
| Tyres | steering and grip (esp. ice) | slower on sand/mud |
| Armour | heavier bumps, shorter spin-outs | lower acceleration |

**Special parts (perks).** Each is a unique ability, one per socket, and each suits some tracks. Original names, effects to implement (tune by feel with `race-sim`):
- **Drift Spring**: drift charges faster.
- **Slip Sail**: slipstream starts sooner and lasts longer.
- **Scout Lamp**: shortcut orbs give more; shortcut gaps glow and are easier to spot; extra boost-power in sand/candy shortcuts.
- **Gem Vac**: gems collect from further away, and a hit drops 1 gem instead of 3.
- **Mud Boots**: mud, sand and oil barely slow you.
- **Ice Studs**: black ice and snow grip like tarmac, small speed cost on tarmac.
- **Rocket Pill**: stronger rocket start and a free small boost at the start.
- **Wing Kit**: glide further, bigger landing boost.
- **Bumper Plate**: your bumps shove rivals harder.
- **Item Pouch**: hold a second item.
- **Comeback Spring**: when last, extra boost on every hit you take (rubber band for the player, small).

All special parts must work in single-player and online (the host/guests already simulate their own kart; perks affect the local kart only, so there is no new network traffic beyond what `cleanState` allows).

**Acquiring parts.**
- Some parts are bought in **Gramps's Workshop** (coins). Stock grows with your chapter.
- Others are **earned**: 3-starring an event drops a part, bosses drop a Blueprint (a special part or a Tier III). Show the drop on the career result screen.
- A **Part Token** currency (from Phase 2 missions) is not needed yet.
- Prices: stat parts roughly Tier I 120-200, II 350-600, III 900-1400; specials 500-1100; Chassis Mod 800-2500. Tune so by the end of chapter 4 a player can afford only about a third of what they want. The goal is a real choice every time.

**Selling.** Parts sell back for 100% of the price paid in the first versions (so experimenting is safe). Do not let this open a coin exploit; earned parts sell for a small fixed amount.

**Loadouts.** 3 saved presets per vehicle ("Grip", "Speed", "Allround") that you can name or just use, to swap fast.

**Event hints.** Each career event card shows the track traits (ice, sand, jumps, narrow, shortcuts) and a "Gramps says" tip about which parts suit it. This is what makes the choices readable.

## 4. Stats

`kartStats()` in `karts.js` must be fed by the vehicle body plus the sockets' parts instead of the 4 upgrade levels. Keep result ranges close to what they are now so tracks, AI difficulty and balance stay valid. Computer racers use `ai: { bodies, up }` in `CHAPTERS`; map `up` to an equivalent fixed stat boost or a few parts so they scale per chapter.

## 5. Save data and migration

- New career fields: `parts` (owned counts by part id), `loadouts` (per vehicle, array of sockets, plus up to 3 presets), `sockets` (extra sockets bought), `drops` already earned.
- **Migration:** an old save with `upgrades: { engine: L ... }` must still load. Convert: each level L>0 of a family gives the matching Tier part(s) (levels 1-2 -> Tier I, 3-4 -> Tier II, 5 -> Tier III; also keep 1 of that part in inventory), auto-sockets them on that vehicle (best first, up to the vehicle's sockets), and the rest go to inventory. No one loses value. Keep reading the old field for back-compat but write the new format.
- `cleanCareer` (`career.js`) and `mergeCareer` (`sync.js`) must validate the new fields (bounded counts, known ids, array lengths) and merge them: owned parts take the higher count per id, loadouts take the side with more total progress.
- The gumball machine jackpot "free upgrade level" becomes "a free random Tier I/II part".

## 6. UI

- **Workshop screen** (replace the Garage upgrade panel): a vehicle view with its sockets; tap a socket to see owned parts; a stat panel shows current stats and a preview of the change ("Top speed 3.2 -> 3.6, Accel 3.0 -> 2.7"). Shop tab with buy buttons and prices; Blueprints/drops shown.
- Keep it landscape-first at 852x393 with touch; also check 1470x860.
- Career hub shows the chapter map, story progress and what is new (a "NEW PART" badge).

## 7. Tests and checks

- `run.mjs career` must cover: the old-save migration, buying/equipping/swapping a part, socket limits, a Chassis Mod, a part drop on a 3-star clear, and that stats change in the expected direction.
- Add a sync test case with the new fields (merge two saves).
- Check a screenshot of the Workshop at 852x393 and 1470x860.
- Update `zoomies/README.md` (Career section, Garage section) so it matches.
