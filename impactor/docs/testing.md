# Testing Impactor

## Running the checks

From `impactor/`:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

`npm run test:watch` re-runs the tests on every change.

**Continuous integration**: GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `npm test`,
`npm run lint` and `npm run build` for Impactor and NEO Atlas on every push to `master` and on every
pull request. Vercel redeploys on each push, so this catches problems before they go live.

Current result: **9 test files, 83 tests, all passing.**

---

## What the unit tests cover

| File                           | Tests | What it checks                                                                                                                                                                                                                                                                                |
| ------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/physics/impact.test.js`   |    18 | The impact model: entry speed, the pancake integral against the paper's closed form, air blast against the paper's Table 4, Chelyabinsk, Tunguska, Meteor Crater and Chicxulub, airbursts vs craters, ocean slowing, energy scaling, recurrence, Mercalli mapping, zone order, "global" zones |
| `src/scene/visuals.test.js`    |    20 | Impact visuals follow the model: severity scale, ejecta thinning law, ballistic and wave speeds, ground damage radii, crater shape and type, depth exaggeration, excavation growth, aftermath clock, debris ranges, seabed craters                                                            |
| `src/lib/lib.test.js`          |    14 | Lat/lon ⇄ globe vectors, great-circle distance (Manila–Tokyo ≈ 3,000 km), the sub-solar point at the solstice, share links (round trip, hostile values clamped, catalog extremes kept), cities in range, weak-GPU detection                                                                   |
| `tests/proxy.test.js`          |     7 | The serverless proxy: forwards allowed paths and parameters with the key, never caches random picks, rejects unknown and path-traversal paths, rejects non-GET, fails clearly without a key, passes upstream errors through uncached, 504 on timeout and 502 when unreachable                 |
| `src/store.test.js`            |     7 | App rules: real values on selecting an asteroid, when a scenario is hypothetical, no launch without a target, reduced-motion and 2D launches jump to results, target changes vs a running impact, zone rings preference, Start over                                                           |
| `src/lib/api.test.js`          |     6 | API client: URL building, caching (never for random picks), one retry after a server error, no retry on client errors, plain-language messages, cancellation                                                                                                                                  |
| `src/scene/plumeModel.test.js` |     4 | Fireball and mushroom cloud: rises, spreads and cools; fades in and out; base surge stays behind the blast front; fire colours                                                                                                                                                                |
| `src/scene/camera.test.js`     |     4 | Camera flights: no passing through the globe's centre, flying over the top to the far side, short hops unchanged, zone framing above ground                                                                                                                                                   |
| `src/scene/framing.test.js`    |     3 | Framing: airbursts framed at altitude, fireball never too small to see (and labelled when enlarged), debris range grows with size                                                                                                                                                             |

The physics tests compare against published values, so a change that breaks the science fails the build.

---

## Manual test checklist

The 3D scene and touch gestures can't be unit-tested in Node, so they are checked by hand on the live
site before a release.

| #   | Steps                                                                     | Expected                                                                 |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Open the site                                                             | Globe loads with NASA imagery, day and night match the current time      |
| 2   | Click _Apophis_                                                           | Asteroid card shows 654 m, 4.12 km/s flyby speed, potentially hazardous  |
| 3   | Search `Bennu`, then `1998`                                               | Matching asteroids are listed, with a count                              |
| 4   | Search a city (e.g. `São Paulo`) and press Enter                          | Target set, "land impact", camera can _Zoom to target_                   |
| 5   | Press _Launch impact_                                                     | Approach, impact, aftermath play; HUD clock counts real time             |
| 6   | During playback try pause, 0.25× and 4×, then _Skip_                      | Playback follows; Skip jumps to the end                                  |
| 7   | Read the results                                                          | ~7,460 Mt, 8.3 km complex crater, M 7.2, damage zones with arrival times |
| 8   | Move the size slider                                                      | _Hypothetical_ badge appears; _Reset to real values_ removes it          |
| 9   | Click an ocean point and launch                                           | Water cavity, ring on the ocean, seabed crater labelled                  |
| 10  | _Copy link_, open it in a new tab                                         | Same scenario loads and replays                                          |
| 11  | _Save_, reload the page                                                   | Scenario listed under _Saved scenarios_; clicking it restores it         |
| 12  | _Real flyby_                                                              | Earth, Moon orbit and the pass at the real miss distance                 |
| 13  | _2D map_, pick a target, launch                                           | Results appear straight away                                             |
| 14  | Turn on the OS "reduce motion" setting and reload                         | Launch jumps to results; _Animate the impact_ checkbox appears           |
| 15  | Phone: drag the sheet, pinch, two-finger tilt, menu, round camera buttons | All work; _Whole globe_ always returns to the start                      |
| 16  | _Start over_                                                              | Asteroid, target and results cleared, address bar clean                  |
