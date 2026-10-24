# Zoomies! Kart Chaos: rules for working on this repo

The goal is one awesome, original kart racer for iPhone Safari and the Mac. Everything (names, characters, items, tracks) must be our own, never copied from another kart game.

## Where we are (handover for new sessions)

- **Read the history first.** A new session has no memory of earlier chats. Read this file, `zoomies/README.md` (the full player-facing feature list), `git log` (detailed commit messages, newest first) and the description of PR #1.
- **Read the plans too:** `docs/ROADMAP.md` (phases and why), `docs/CAREER2.md` (story and Parts spec) and `docs/VISUAL_POLISH.md` (the world audit and fixes). The roadmap's phases 0-4 are built; what is left is real-device testing and tuning from the owner's play-test.
- **What exists:** the whole game is playable and feature-complete.
  - 20 racers and 20 tracks (2 Epic boat and plane adventures), 10 karts and bikes, 5 Balloon Battle arenas.
  - Career: a story with Baron Von Boost, a prologue and 7 chapters, then the Legends League (3 seasons, 18 events, Legend Rank 1-10) with the Gramps duel. Gramps's Workshop replaces upgrades: limited sockets, stat parts Tier I-III, 11 special parts, Chassis Mods, drops, loadout presets.
  - Retention loops: medals (Bronze to Zoomie) on every track, daily missions, Daily Challenge, Weekly Cup, mastery levels and titles, trophies, the prize machine, beat-my-ghost links.
  - Track Events (`docs/TRACK_EVENTS.md`, `src/events.js`): telegraphed mid-race events on every track and Balloon Battle arena (blizzard, avalanche, lava rain, eruption, sandstorm, rising tide, ghost parade, power surge, meteor shower and more). Deterministic from a race seed so online phones agree, off in Time Trial, medals and Driving School, Off/Normal/Wild in Settings, assigned by the story in the Career and League, and a Storm Week / Calm Skies Weekly twist. Add an event by data (an entry in `EVENTS` plus the track's `events` list).
  - Onboarding: first-run intro, Driving School lessons, first-time tips, assist offer. Feel: shake, FOV kick, hit-stop (single-player only), haptics where the browser allows (not iOS).
  - Modes: Career, Quick Race, Grand Prix, Time Trial with ghosts, Daily, Weekly, Balloon Battle (4 balloons, one comeback), online for up to 4 phones, Mac with phone-as-wheel, progress sync.
  - Release safety: backup codes, storage protection, an iOS install card, offline play with a service worker and a safe update path, an About screen.
- **Where it's published:**
  - GitHub Pages serves `main` at https://olev99.github.io/Fun-stuff/. Every pull request is merged into `main` once its tests pass (see Project conventions).
  - A playable single-file copy is published as a private artifact for the owner. Rebuild it with `build-single.mjs` and republish to the same artifact link when asked.

**Decisions and preferences from the owner (keep to these):**
- **Originality:** the game must be original and sellable, with nothing that copies another kart game's names, items, item-box look or characters. Racers vary a lot in look and size.
- **Phone first:** design for the iPhone in landscape, played with tilt or touch, and keep the Mac version working too.
- **Economy:**
  - Coins come only from the Career, plus one-off trophy rewards. Quick play, cups, battles and online pay XP only.
  - Whatever the Career unlocks (karts, bikes, racers) is usable in every mode. Five rides and the 8 starter racers are free.
  - Levelling should feel earned: the XP curve is steep and style points count for half. Each level-up shows what it unlocks.
- **Prize machine:** a turn costs 600 coins. It mostly gives cosmetics, with rare jackpots (8%) that give real prizes.
- **Shortcuts:** narrow and half-hidden. Scenery must never sit on the road, and you must never seem to drive on thin air.
- **Throwing behind:** items that can be thrown ahead or behind get a THROW BACK button on touch screens.
- **No idle work:** no scheduled check-ins or PR watching; only act when the owner writes. Keep token use low (see the routing below).

**Known open points:**
- **Real devices:** nothing has been tested on real phones or Macs yet (frame rate, tilt calibration, shake and hit-stop feel, online between two phones, ghost links from a messaging app, offline mode and the install card on iOS). The owner will do heavy testing next and report; fix what they find first. PeerJS's public broker can't be reached from the cloud sandbox.
- **Balance is measured on computer racers only:** the front starter wins about 18-19% of equal-skill races, a fully tuned Starbolt wins most Normal races, and the Zoomie medal and Legends League difficulty are only checked against computer noise. Retune from human feedback with `tools/balance.mjs`, `tools/economy.mjs` and `tools/league-sim.mjs`.
- **Shortcuts:** reversed Dune Surf is only break-even without a boost (the cut would need to be longer). `shortcuts moon` reports Crater Hop forward as not enterable and Rover Tracks as stopped partway by the scripted driver (same on older commits); check by hand whether it is the driver or the game.
- **Track events are untuned on real hardware:** gust strength, lava circle density, whiteout thickness and the cost of the effects on an iPhone are only checked in software rendering. Career and League difficulty with events on was never measured (only the suites that the events work and are fair). The `events` suite is slow (about 22 minutes) and `run.mjs full` now takes about an hour and a half.
- **Known small gaps:** selling the same part on two devices that each held two or more copies counts as one sale after a sync; a mastery capsule can be doubled once by a sync; mastery titles are not shown on name tags online; League hats other than the laurel were checked structurally, not visually.

## Model and effort routing (follow this every session)

The expensive model plans, decides and reviews; cheaper models implement and test. The quality bar never drops: every change is tested and reviewed before it is committed.

| Work | Who | Effort |
|---|---|---|
| Turning feedback into a plan, game design and balance decisions, writing briefs, reviewing diffs, committing | Main session | - |
| Engine and netcode: kart physics (`kart.js`), track geometry (`track.js`, road, walls and shortcut code in `world.js`), online sync (`race.js` net code, `net.js`, `battle.js` online parts), save merging (`sync.js`); bugs whose cause is unknown | Opus: `kart-engineer` (or the main session if it runs on Opus) | high |
| Features and content from a clear spec: tracks, arenas, racers, items, hats, menus, HUD, CSS, help text and README, tuning numbers the plan gives | Sonnet: `kart-builder` | medium |
| Running tests, taking and checking screenshots, regression runs | Sonnet: `kart-tester` | low |
| Lookups ("where is X", "what calls Y"), PR and CI status | Haiku: `kart-scout` | low |

How to apply it:
1. **Main session = planner and reviewer.** Read only what you need to decide. Send implementation to `kart-builder` and engine or netcode work to `kart-engineer` with a brief, then review the diff (`git diff --stat`, then the risky hunks) and commit.
2. **Briefs stand alone.** Subagents start cold. Give the goal, the files and functions involved, constraints, acceptance criteria, which test suites to run and which screenshots to check.
3. **Batch.** Put related small requests into one builder run; every cold start re-reads code.
4. **Escalate, don't guess.** If a builder hits physics, geometry or sync trouble, or fails twice, hand the problem to Opus.
5. **Verify before every commit.** Run `node zoomies/tools/tests/run.mjs` (quick suite) after any change, the relevant suite for the area touched, and `run.mjs full` before a big push. Look at the screenshots for anything visual.
6. **No idle spending.** No scheduled check-ins, polling or PR activity subscriptions unless the user asks.
7. **Say so if the session model is overkill.** If the main session runs on Opus for routine work, tell the user Sonnet is enough (they switch with `/model`).
8. **Agents load when a session starts.** The `kart-*` agents in `.claude/agents/` load only when a session starts. If they aren't listed, use the general-purpose agent with the `model` parameter (sonnet, opus or haiku) and paste that agent's instructions into the brief.

## Project conventions

- **Code:** all the code is in `zoomies/`: plain ES modules plus vendored three.js, with no build step. Serve `zoomies/` statically (the test runner does this on port 8000).
- **Before every commit:** run `node zoomies/tools/stamp.mjs`. It stamps file hashes so phones never mix old and new files.
- **Branch:** `main` holds the released game. Do new work on a branch, push it and open a pull request into `main`. Once the checks pass (`run.mjs` quick suite, plus the suite for the area touched), merge the pull request yourself without asking; the owner approved automatic merging. Then the game on GitHub Pages updates. Still no PR watching or check-ins.
- **Model names:** keep model names out of repo files, commit messages and PR text.
- **Stamping and the service worker:** `node zoomies/tools/stamp.mjs` also writes `zoomies/precache.json` and the `VERSION` line in `zoomies/sw.js`. Always stamp before committing, and check both read the same version, or the offline worker's install fails and old phones are not updated.
- **Testing on this 4-core cloud machine:** run suites one at a time and never two agents' test runs at once (`run.mjs` reuses whatever server is already on port 8000, which may serve a different checkout). The two-phone suites (`online`, `battle-online`) load two pages; the tests freeze the first page's demo race before loading the second. If a UI suite times out, rerun it alone before concluding anything; `run.mjs` now prints the `FAIL` lines before the log tail, but a suite's own log is long, so if a failure is not visible run the suite's script directly against a static server and keep the whole log. `run.mjs full` takes about an hour and a half. Opt-in suites (not in quick or full): `visual-audit` (free-camera shots of every track, before/after sheets) and `balance`.
- **Merging branches:** merge with a command that stops on conflicts (check `git status` for `UU` before committing), resolve by keeping both sides of independent additions, re-stamp, then run `full`.
- **README:** `zoomies/README.md` is the player-facing feature list. Keep it accurate when features change.
- **Playable single-file build:** `node zoomies/tools/build-single.mjs <out.html> --fragment`.
- **Screen sizes:** design mobile first, at 852×393 landscape with touch. Desktop is checked at 1470×860.

## Architecture map

- **App and screens:**
  - `main.js` runs the app flow (menus, starting races, results, career, online).
  - `ui.js` holds the screens and `hud.js` the in-race HUD.
- **Race loop:** `race.js` runs the race loop, collisions, camera, podium and online glue.
- **Karts:**
  - `kart.js`: kart physics, hits and visuals.
  - `karts.js`: vehicle bodies, stats and models.
  - `characters.js`: racers, models and sizes.
- **Tracks:**
  - `track.js`: tracks are spline corridors. Karts live in path space (`s` along the road, `d` sideways), and shortcuts are side branches through gaps in the wall.
  - `tracks.js`: track layouts and cups.
  - `world.js`: everything visual (road, walls, scenery, sky).
- **Items and AI:**
  - `items.js`: items, prize orbs, gems, obstacles and crates.
  - `ai.js`: the racing AI.
- **Balloon Battle:**
  - `battle.js`: battle rules and the battle AI.
  - `arenas.js`: arenas, each a ring road as wide as its radius around an island.
- **Progression:**
  - `career.js` / `careerui.js`: the Career.
  - `profile.js`: XP, levels and trophies.
  - `cosmetics.js`, `prizes.js` and `gumballui.js`: the prize machine.
- **Online and sync:**
  - `net.js`: PeerJS sessions. Online is host-authoritative: the host simulates the AI and items, and each phone simulates its own kart; kart state arrays sync between them.
  - `sync.js`: save merging between phone and Mac.
- **Audio:** `audio.js` / `music.js` synthesise all sound.

## Tests (`zoomies/tools/tests/`)

Run `npm install` there once (it installs playwright-core). Chromium comes from `$CHROME` or `/opt/pw-browsers`.

- **Quick check:** `node run.mjs` runs `tracks` (every track and arena builds), `battle-sim`, `items` and `picker`.
- **Everything:** `node run.mjs full` adds `race-sim`, `career`, `cup`, `racers`, `battle-online`, `online` and `shortcuts`.
- **One suite:** `node run.mjs <suite> [args]`, for example `node run.mjs battle-sim crater` or `node run.mjs race-sim sprout,odyssey`.
- **Output:** screenshots land in `zoomies/test-out/` (ignored by git).
