# Track Events: things that happen DURING the race (design spec)

Goal: races that tell stories and that you remember. A blizzard rolls in, lava rains on the road, the tide floods the boardwalk. Every event is telegraphed, dodgeable, skill-rewarding and original. This is the feature that makes Zoomies stand out.

## What exists today (so we do not duplicate it)
- Ambient weather particles per track (`weather.js`): cosmetic only.
- Static hazards per track (boulders, crabs, laser gates...).
- Daily/Weekly "twists" (`DAILY_MODS` in `profile.js`, applied through `race.mods`): global modifiers for the whole race (grip, gravity, item sets).
- Nothing changes mid-race. Track Events are new.

## Design rules
1. **Telegraphed.** Every event has a warning of 3-5 seconds: a HUD icon with a short line from Mic the Announcer (for example "BLIZZARD INCOMING!"), a sound cue, and a marker in the world (a glowing target circle where a meteor will land, a rumble and dust where a slide will cross). A good player sees it coming and reacts.
2. **Dodgeable and rewarding.** You can avoid or even use it: surf a wind gust for a boost, drift through a snow slide gap, ride a wave. Pulling off the clever move pays style points ('STORM SURFER', 'DODGED!', 'EYE OF THE STORM').
3. **Fair and readable.** Never an unavoidable hit; never visibility so low that the road disappears (keep the road edge readable); no event during the countdown or the final 5 seconds before the finish line; max one big event at a time.
4. **Cheap.** Particles, a few meshes, reuse existing hazard types and modifiers. Keep draw calls flat on iPhone.
5. **Deterministic and online-safe.** The schedule is derived from a race seed and the race clock, identical on every phone (the host sends the seed once with the race setup; no per-frame traffic). Each phone applies the event to its own kart (the existing design: each phone simulates its own kart). Hazards the event spawns must appear at the same place and time for everyone. Replays and ghosts: Time Trial and medals run with events OFF so records stay comparable.
6. **Optional and tunable.** Settings: Track events Off / Normal / Wild (default Normal). Career events carry their own assignment so the story is always the same.

## The framework (engine work)
- `src/events.js`: an event definition has `id`, `track`, `warn` seconds, `dur` seconds, `weight`, `telegraph(race)`, `begin(race)`, `update(race, dt)`, `end(race)` and its effects expressed through a small set of shared modifiers:
  - **wind** (a lateral push vector with strength and gusts),
  - **grip** and **gravity** scalars, and **traction** (reuse what `race.mods` already does, but timed),
  - **visibility** (fog density and sky tint, never hiding the road edge),
  - **spawned hazards** (reuse boulder, oil, lava patch, ice patch, puddle hazard types; a lifetime and a warning marker),
  - **surface patches** (a section of road turning icy, wet, sticky or flooded for a while, using the existing surface types: ice, mud, sand, oil),
  - **boost lanes** (a short-lived boost strip, the reward for good play),
  - screen effects (shake, flash, tint) through the existing camera/HUD feel helpers.
- A scheduler picks events from the track's event list by seed with spacing rules (first event no earlier than 25 s, at least 20 s between events, none in the last 8% of the race); in a Time Trial or when the setting is Off nothing is scheduled.
- Online: the host includes `evSeed` and `evMode` in the race setup message (validate it like other setup fields); no per-event messages. Phones compute identical schedules. Anything that needs authority (an item or balloon effect) stays on the host's existing paths.
- HUD: an event banner and icon with a countdown while warning, a small active-event indicator while it lasts; sound via the audio synth (rumble, wind, thunder, siren).
- Never change kart physics code paths beyond reading the new modifiers; if a modifier needs a physics hook, add it as a small, clamped, additive term and measure with race-sim.

## Signature events per track (first set to build; originals)
Each track gets 1-2 signature events that fit its theme. Names and lines are original.
- **Sprout Speedway:** *Harvest Gust*: a crosswind that sweeps petals and hay across the road; drift into it for a boost.
- **Coral Cove / Tidal Twist:** *Rising Tide*: waves wash over parts of the boardwalk and sand (slowing patches) with a clear wave line to read; ride the crest for a boost.
- **Blossom Gardens:** *Lantern Festival*: floating lantern boost lanes appear along the best line for a few seconds.
- **Dune Dash Canyon:** *Sandstorm*: a dust wall sweeps across, wind pushes you toward the canyon wall, visibility drops but the road edge glows.
- **Frostbite Pass:** *Blizzard* (wind, whiteout tint, ice patches) and *Avalanche* (rumble, a snow slide crosses the road at a marked spot, dodge or get buried for a second).
- **Sweet Tooth Valley:** *Syrup Shower*: sticky patches rain onto the road (slow) with sprinkle marker circles; hit a candy spark to clear.
- **Windmill Downs:** *Twister Crossing*: a twister wanders across the field and through the road on a telegraphed path (reuse the Twister item visuals).
- **Spooky Hollow:** *Ghost Parade*: a line of friendly-looking ghosts crosses the road in a pattern; fog rolls in, lanterns mark the road.
- **Jungle Ruins:** *Temple Tremor*: the ground shakes, boulders drop on marked circles, a temple gate swings open for a shortcut for a few seconds.
- **Gearworks:** *Factory Alarm*: sirens, conveyor strips reverse direction, press stamps hit on a beat you can learn.
- **Maple Ridge:** *Leaf Storm*: a swirling gust of leaves pushes sideways and hides the racing line, a boost lane forms in the eye.
- **Neon Nebula:** *Power Surge*: the city blacks out for a few seconds except neon lane lights and boost arrows; a big light show follows.
- **Magma Mountain:** *Lava Rain*: glowing target circles appear on the road, meteors land after 2 s leaving lava puddles for 8 s; *Eruption*: shake, ash, a lava river shifts.
- **Cloud Carnival:** *Fireworks Finale*: a fireworks show drops boost sparkles in the sky lane; rainbow gusts push you along.
- **Glacier Gorge:** *Ice Quake*: cracks run across the road in warned lines; a section turns black ice.
- **Obsidian Rush:** *Glass Crack*: bridge sections flash and crack on a warned beat, drive the safe side.
- **Moonbase Loop:** *Meteor Shower*: marked impacts leave craters (small bumps) and a brief gravity flicker (gravity pulses lower), solar flare tints the sky.
- **Epic adventures:** one event per leg (river surge, volcano ash cloud, jet-stream gust) tied to the vehicle (boat, plane).
- **Balloon Battle arenas:** one arena event each (Barnyard stampede, Snowglobe whiteout, Neon Pinball overload, Sandcastle tide, Moon Crater meteors).

## Career, League, Weekly, Quick Race
- **Career and League:** events have an `events: [...]` assignment (or 'signature') so the story controls them; early chapters have none or one mild event, later chapters and League seasons get stronger and combined events. Mic and the rivals comment on them in scenes, and event cards show an icon and a hint ('Gramps says: Lift before the avalanche').
- **Weekly Cup and Daily:** new twists 'Storm Week' (Wild events on every track) and 'Calm Skies' (no events).
- **Quick Race, Cups, Battle:** a Settings option 'Track events: Off / Normal / Wild' and a setting 'Event warnings: Full / Short'. Time Trial, medals and Driving School: events always off.
- **Trophies and style:** 'Storm Surfer' (boost from a gust), 'Eye of the Storm' (finish a blizzard lap without a wall hit), 'Dodge Master' (dodge 10 meteors in one race), 'Weather Report' (see every track's signature event), plus style popups.

## Tests and acceptance
- Determinism: the same seed gives the same schedule and hazard positions on two pages (online suites pass; add an `events` suite that checks two simulated pages agree).
- Fairness: no event starts in the countdown, the last 8% of the race or within 20 s of another; the road edge stays visible at maximum visibility loss (pixel/readability check on screenshots).
- Warning: every event shows its banner at least 3 s before any effect.
- Time Trial and medals unaffected (events off), Weekly and Daily difficulty unaffected unless the twist says so.
- Performance: draw calls and triangles per track stay within a few percent (visual-audit and renderer info).
- Balance: run `tools/balance.mjs` with events Normal and Wild; the front starter's win rate and the gap must stay in the bands recorded in `tools/balance-baseline.txt`.
- Screenshots at 852x393 of each event's warning, peak and end on its track; look at them.
