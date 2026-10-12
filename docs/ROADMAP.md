# Zoomies! Roadmap

Goal: the most fun and most "one more race" kart racer you can play in a browser, and one you could sell. Original in every name, item and character.

## What the research says (kart racers that keep players)

1. **Feel first.** Controls, drift and boost have to feel good in the first 30 seconds. We have this; keep protecting it (frame rate, tilt feel).
2. **A tight loop.** Race (2-3 min) -> reward screen -> a visible next goal -> race again. The reward screen is where "one more race" is won or lost: always show something that is almost done (a star, a part, a level, a mission).
3. **Meaningful choices.** Upgrades only hook players when they are scarce and different. If every upgrade can be bought eventually, nothing is a decision. Players should build a kart for a track, talk about their build, and want a second build.
4. **Mastery you can see.** Medals on every track (bronze/silver/gold plus a hard "Zoomie" time), shortcuts found, ghost runs, mastery per racer and kart. Players return to beat their own numbers.
5. **Variety on a schedule.** A daily challenge, daily missions and a weekly cup give a reason to open the game today rather than later.
6. **Story and characters.** A mentor, rivals with personalities, a villain, and reveals that pay off. Players finish a chapter to see what happens next.
7. **Social without servers.** Our game has no backend, so share through links and codes: "Beat my ghost" links, room codes, QR sync. A friend's time to beat is the strongest hook there is.
8. **Fairness.** Catch-up items and rubber-banding keep races close, but skill must always win over luck. Nothing is paywalled or random in a way that blocks progress.
9. **Onboarding.** The first 5 minutes teach drifting, boosting and items without walls of text. A new player must win something in the first race.

## Phases

### Phase 0: bugs and battle length (now)
- Computer drivers use the two shortcuts they miss (Dune Surf, Snowmobile Trail).
- Online ram glitch: a ram must never give the rammer a balloon without the victim losing one.
- Battles: 4 balloons to start, and a knocked-out racer comes back once after a short wait with a fresh balloon, so nobody sits out.

### Phase 1: Career 2.0 (story and a real upgrade path) -- the headliner
See `docs/CAREER2.md`. A villain and a story that builds, a slow start in a bad kart, and a Parts system with limited sockets so every upgrade is a choice. Gramps's Workshop replaces the 4x5 upgrade ladder.

### Phase 2: the come-back loops
- **Medals and mastery:** bronze/silver/gold/Zoomie time targets on every track, shown on the track card; mastery levels for each racer and ride.
- **Daily missions:** three small goals a day ("drift-boost 10 times", "win with a bike") that pay XP and a Part Token; a visible streak.
- **Weekly Cup:** a rotating cup with a twist, and a trophy for finishing it.
- **Beat-my-ghost links:** share a time-trial ghost as a link or QR code; friends race it.
- **Race reward screen 2.0:** XP bar fill, "next up" teaser, one-tap restart.

### Phase 3: feel and onboarding
- A guided first race and a short driving school (drift, boost, items) in the Career prologue.
- Screen shake, haptics on iPhone where allowed, hit-stop on big hits, better item pickup and use feedback.
- Rubber-band and item balance pass using the race-sim.
- Real-device performance pass (needs the owner's phone).

### Phase 4: content
- Endgame league after the Golden Wheel: harder remixed events, new Epic adventure, more arenas.
- More tracks, racers, Parts and hats, each with a reason to exist (a new mechanic, not just a new skin).

## Rules for all phases
- Coins only come from the Career (see CLAUDE.md). Parts, medals and missions pay XP, Part Tokens or parts, never extra coins outside the Career.
- Every change is tested (`run.mjs`, full suite before a big merge) and the README stays accurate.
- Old saves must keep working: migrate, never wipe.
