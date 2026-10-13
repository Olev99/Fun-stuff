# Visual polish: the world outside the road (spec)

Source: a visual audit of all 20 tracks and 5 arenas (about 450 screenshots at 852x393, free camera at the road edge, high over the horizon, at walls and above the edge). The audit script and screenshots live in the session scratchpad; the technique is below so it can be rebuilt as a repo tool (`zoomies/tools/tests/visual-audit.mjs`).

Owner feedback: clipping issues, and the map outside the track looks poorly made, with gaps you can see through.

## Findings, ranked, with the pattern behind each

1. **Outer ground is a flat pale plane** (near-white, radial banding) on jungle, maple, blossom, candy, dunes, gear, odyssey. Black on dark themes, sea on water themes. One big plane shows its edge and material from low angles and nothing blends scenery into it. FIX: replace with themed terrain: low rolling hills/dunes/snow drifts etc. with vertex-colour variation and noise, darker toward the horizon, matching the track's palette, fading to the fog colour at the far edge so there is no visible edge. No glossy/specular on ground.
2. **Beach islands on sea tracks are thin jagged wedges floating on the water** (coral, tidal, hopper, sandcastle). Far islands are generated as strips. FIX: proper island meshes: a rounded heightfield blob with a sand ring, grass top and a shallow shore gradient where it meets the water (foam line), no hard cut edges.
3. **Hopper** has a hard-edged sand wedge and a green dome with a polygonal boundary.
4. **Scenery floats**: trees, windmills, towers and tanks stand in open sea or on a void with no ground or contact shadow (sprout, downs, barnyard, coral, neon, pinball, gear). FIX: every prop placed outside the ground must have ground under it, or be removed; add a soft blob shadow under props; do not place props past the ground edge.
5. **Epic plane legs**: a lone mossy cube floats in the corridor and flat quads stand in water (odyssey, hopper).
6. **Neon and pinball: black void under the city.** FIX: ground/skyline/fog so the void reads as night depth (distant lit towers, haze, a ground grid or water).
7. **Shortcut mouths** show white untextured wedges and stray diagonal planks (gear, dunes, tidal, hopper). Junction patches leave stray fragments.
8. **Sprout Pond Hop**: a blue water ribbon cuts across the asphalt at the shortcut mouth.
9. **Cloud**: hard-edged lilac slabs on the cloud floor and a huge flat purple slab.
10. **Mountains are cones at a fixed radius** and meet the water with no shore. FIX: varied ridgelines (noise-displaced profiles, several layers with atmospheric fade), foothills and a shore or mist line.
11. **Dunes and candy**: dark seam where the ground ends.
12. **Tidal**: boardwalk planks poke into view.
13. **Gear**: a tunnel ceiling slab edge is visible at an angle.
14. **Moon**: crater rim rings float over the black ground.
15. **Camera below the road** for 4-19 frames at neon s~1110, cloud s~952, tidal s~611, gear s~772 (probably passing under an overpass; check: it should not show road underside clipping through the view, and the camera must not go under the ground).

Clipping: in a full AI race on every track the camera was never behind a wall and no kart was ever beyond a wall. Scenery has no collision, so kart-through-scenery was not tested. Check scenery near the road (trees, signs, props within ~3 m of the road edge) and either move it back, give it a collision push, or make sure the walls keep karts away from it.

## Approach

1. Make the audit a repo tool first (see technique), run it for a baseline, and run it again after each fix to compare. Keep the screenshots out of git (`zoomies/test-out/`).
2. Fix by pattern, not track by track: ground terrain generator (item 1, 11, 6), island generator (2, 3), mountain/ridgeline generator (10), prop placement rule (4, 5, 14), shortcut-mouth cleanup (7, 8, 12, 13), cloud slabs (9), camera-under-road check (15).
3. Never put scenery on the road, and never make it look like you drive on thin air (CLAUDE.md rules). Keep frame rate: reuse instancing and chunking, measure with the existing FPS tooling; Safari on iPhone is the target. New terrain should be cheap (one merged mesh per track with vertex colours).
4. Keep every track's identity and palette; this is about finishing the edges, not redesigning tracks.

## Reusing the free camera (from the audit)

1. Start the race, set `a.paused = true`, `r.skipIntro = true`, then run `r.update(1/60)` 60 times. For arenas: `a.settings.arena = id; a.startFromMenu('battle')`.
2. Hide `#ui,#hud` with a style tag.
3. Set `r.camera.position` and call `lookAt`. Positions come from `r.track.frame(s, {})` and `heightAtFrame`; shortcuts use `r.track.shortcuts[n].frame`.
4. Render by hand with `a.post.render(r.scene, r.camera, r.grade || a.view.grade, 0)` (or `a.renderer.render`), then `page.screenshot`.
5. For chase shots, drive with `AIDriver` and call `r._chase(1, true, r.player)`.
6. Software rendering (SwiftShader) adds some colour banding of its own; do not chase that.

## Acceptance

- No free-camera shot from the audit set shows a see-through gap, an unfinished edge, an obviously floating prop, or a flat white or black plane.
- `node run.mjs` quick suite and `full` pass; frame time (race-sim) does not get worse by more than a few percent.
- A side-by-side before/after contact sheet for each of the 20 tracks and 5 arenas is produced and looked at.
