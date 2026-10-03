# Zoomies! Kart Chaos: rules for working on this repo

The goal is one awesome, original kart racer for iPhone Safari and the Mac. Everything (names, characters, items, tracks) must be our own, never copied from another kart game.

## Where we are (handover for new sessions)

- **Read the history first.** A new session has no memory of earlier chats. Read this file, `zoomies/README.md` (the full player-facing feature list), `git log` (detailed commit messages, newest first) and the description of PR #1.
- **What exists:** the whole game is playable.
  - 20 racers and 20 tracks, including 2 Epic boat and plane adventures, and 10 karts and bikes.
  - A Career with a Garage, Grand Prix cups, Quick Race, Time Trial with ghosts, and a Daily Challenge.
  - Balloon Battle in 5 arenas, against computer racers and online.
  - Online multiplayer for up to 4 phones, the Mac version with phone-as-wheel, and progress sync between devices.
  - XP, levels, trophies and the prize machine.
- **Where it's published:**
  - GitHub Pages serves the branch `claude/iphone-racing-game-0wytrs` at https://olev99.github.io/Fun-stuff/.
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
- **Real devices:** nothing has been tested on real phones or Macs yet (frame rate, tilt feel), and PeerJS's public broker can't be reached from the cloud sandbox.
- **Computer drivers and shortcuts:** they miss two shortcuts from one direction (Dune Surf and Snowmobile Trail).
- **Battle length:** battles often end within 1–2 minutes once you're knocked out. The owner may want them longer (4 balloons, or coming back after being knocked out).
- **Online ram glitch:** in an online battle, lag can very rarely give the rammer a balloon without the victim losing one.

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
- **Branch:** work on `claude/iphone-racing-game-0wytrs` and push with `git push -u origin claude/iphone-racing-game-0wytrs`. Draft PR #1 is open, and GitHub Pages deploys this branch.
- **Model names:** keep model names out of repo files, commit messages and PR text.
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
