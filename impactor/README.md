# Impactor

A 3D asteroid impact simulator built on the **AegisNEO API**. Pick a real near-Earth
asteroid, choose a target on a 3D globe, and watch the approach, impact and blast
wave play out. The impact effects follow a published scientific model.

Impactor is a **separate website** from the main AegisNEO site. It only talks to
AegisNEO through its public REST API, to show that the API can power other apps.

## Features

- **Real asteroids from the API**: search, random picks, largest objects, closest
  flybys and famous asteroids (Apophis, Bennu, Didymos…).
- **3D globe** with real day/night for the current time, city lights, clouds and
  atmosphere. Tap anywhere to aim, or search a city or enter coordinates.
- **Cinematic impact**: approach path, entry glow, airburst or ground impact, then a
  3D crater dug out and collapsing into its final shape, an ejecta curtain, a rising
  plume and the air blast sweeping outward, leaving scorched ground, fires, flattened
  forest and darkened cities. The largest impacts darken the whole planet. Play/pause
  and 0.25×–4× speed.
- **Sandbox controls**: change size, speed, entry angle, direction and composition.
  Changes are labelled _Hypothetical_.
- **Results**: energy, crater, earthquake magnitude, damage zones (outlines can be
  shown on the globe),
  blast arrival times, major cities in range, and how often such an impact happens.
- **Real flyby mode**: the asteroid's actual miss distance, drawn to scale with the Moon's orbit.
- **Share, save, export**: share links hold the whole scenario, scenarios save in the
  browser, and the 3D view can be downloaded as an image.
- **Works on phones**: bottom-sheet controls, adaptive graphics quality, and an
  automatic 2D map when 3D isn't available.

## How it uses the AegisNEO API

| Feature                       | Endpoint                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| Search                        | `GET /api/v1/asteroids?search=…&limit=30`                               |
| Largest / closest flybys      | `GET /api/v1/asteroids?sort=diameter&order=desc` · `sort=miss_distance` |
| Random / random hazardous     | `GET /api/v1/asteroids/random?hazardous=true`                           |
| Famous asteroids, share links | `GET /api/v1/asteroids/{neo_reference_id}`                              |

The browser never calls the API directly with a key. It calls `/api/neo/*` on this
site, and a small server function (`api/neo.js`) forwards the request with the key
from an environment variable. The function only allows the endpoints above, drops
unknown parameters, and caches responses at the edge (random picks are never cached).

## No database needed

- Asteroid data comes from the AegisNEO API.
- Saved scenarios live in the browser's `localStorage` (`src/lib/storage.js`).
- Share links encode the full scenario in the URL (`src/lib/share.js`).

All saving goes through `storage.js`, so a shared database could replace it later
without changing the UI.

## The science

`src/physics/impact.js` implements Collins, Melosh & Marcus (2005),
_Earth Impact Effects Program_, Meteoritics & Planetary Science 40(6), 817–840.
Equation numbers are noted in the code.

- Atmospheric entry: breakup altitude, pancake spreading, airburst altitude (Eqs. 8–20)
- Crater size, simple vs complex (Eqs. 21–28)
- Fireball and thermal radiation (Eqs. 32–39)
- Seismic magnitude (Eq. 40)
- Air blast overpressure and wind, ground and airbursts (Eqs. 54–59)
- Ocean impacts, water slowing the impactor (Eq. 65)
- Recurrence interval (Eq. 3)

Assumptions and limitations:

- Entry speed = √(flyby speed² + 11.2²) km/s, because Earth's gravity accelerates an
  incoming body. The catalog's speed alone would underestimate every impact.
- The catalog has no density, so the user picks a composition (stony by default).
- Ocean impacts assume the mean ocean depth (3.7 km). Tsunamis aren't modelled,
  following the source paper.
- For very high airbursts the ground blast uses whichever is larger: the paper's fit
  or its surface-burst curve at slant range. Without that, the fit gives ~0.15 kPa
  for Chelyabinsk against a measured few kPa.

The tests (`src/physics/impact.test.js`) check the model against Chelyabinsk,
Tunguska, Meteor Crater and Chicxulub.

## How the impact is drawn

Everything on screen is sized from the model's results, so the picture matches the
numbers in the results panel:

- **Crater**: a detailed patch of ground at the impact site (`src/scene/CraterPatch.jsx`),
  carved to the model's diameter and depth: a bowl with a raised rim for simple craters;
  a flat floor, terraced walls and a central peak (a peak ring above 100 km) for complex
  ones. It is dug out over ≈ 0.8·√(D/g) seconds and then collapses into its final
  shape. The globe's own mesh (~125 km per cell) is too coarse for this, so the globe
  leaves a hole and the patch fills it with the same textures and lighting.
- **Depth**: real large craters are very flat (900 km wide, 3 km deep), so depth is
  scaled up to about 1:10 of the width when needed. The playback bar shows the factor.
- **Ejecta**: launched on 45° ballistic arcs from the growing crater (an inverted cone),
  landing as a blanket that thins as r⁻³ (McGetchin et al. 1973).
- **Ground damage**: charred land inside the clothing-ignition range, fires in the
  third-degree-burn range, flattened forest in the 90%-trees-down range, city lights
  out where wood-frame houses collapse. Each appears when the blast or heat reaches it.
- **Ocean impacts**: the water cavity opens and fills back in, and a ring crosses the
  ocean at deep-water wave speed √(g·h) ≈ 190 m/s. The model has no tsunami height, so
  the ring is illustrative. Once the water settles, the crater the model gives for the
  seabed shows through it, with stirred-up sediment and floating debris; the sea is
  drawn shallow and clear so it can be seen (labelled).
- **Debris**: hot debris flies out on ballistic arcs in rays, more of it downrange
  after a slanting hit. Ranges follow a steep power law, so almost all of it lands
  near the crater and only the largest impacts send a thin tail far round the planet.
- **Plume**: the fireball follows Eq. 32; for impacts big enough to affect the whole
  planet, the vapour plume that leaves the atmosphere is drawn larger (labelled
  "Fireball ×N").
- **Largest impacts** (about a million megatons and up, a ~2.5 km rock): ejecta falling back worldwide, spreading
  fires and a dust veil that browns the planet. Illustrative, scaled by impact energy.
- **Time**: excavation takes seconds to minutes; the blast takes up to hours to reach
  its outer zones. When needed, the aftermath clock speeds up as it plays so both fit;
  the time shown is always real.
- **Zone outlines** are off during and after the impact by default; _Damage zones_
  (over the 3D view) or _Outline on globe_ (results panel) turns them on.
- **Globe**: NASA imagery from GIBS. The whole planet loads at about 10 km per pixel;
  zooming in streams sharper tiles (down to about 500 m colour and 31 m shaded relief)
  for the area in view (`src/scene/DetailImagery.jsx`). Offline, the painted globe stays.
- **Navigation** (`src/scene/GlobeControls.jsx`): drag moves the ground under the
  finger at any zoom, the wheel or a pinch zooms towards the pointer, and two fingers
  (or the right mouse button) tilt and turn. _Whole globe_ always flies back out.

## Mobile strategy

- Layout: bottom sheet with tabs below 1100 px; side panels on desktop. Phones get
  one menu button in the top bar and a column of round camera buttons, and the sheet
  stays low after an impact so the crater is in view.
- Graphics: device pixel ratio capped (1.75 on phones), quality lowered automatically
  if the frame rate drops, 2048 px textures on phones. Phones get a lighter impact:
  a quarter of the crater mesh, fewer ejecta particles and smoke puffs, and cheaper
  noise in the shaders. Particles are animated on the GPU, not in JavaScript.
- Loading: the globe's textures are painted in a Web Worker (`src/lib/earth.worker.js`)
  so the page never freezes, falling back to the page on browsers without
  OffscreenCanvas. three.js only downloads with the 3D view, so the 2D map stays light.
  Lighthouse (mobile preset) on the production build: total blocking time fell from
  about 10.5 s to under 1.5 s, accessibility 100.
- Robustness: if WebGL is missing, crashes, or the GPU context isn't restored after
  4 seconds, the app switches to a 2D map that still runs full simulations.
- Touch: 16 px inputs (no iOS zoom on focus), ≥40 px touch targets, `dvh` units and
  safe-area insets for notches, no hover-only controls.
- Motion: respects the system "reduce motion" setting, with an opt-in to play the animation.

## Project structure

```
api/neo.js            Vercel serverless proxy to the AegisNEO API
tests/                Proxy tests (kept out of api/, where every file becomes a function)
src/physics/          Impact model, tests, damage-zone styling, reference events
src/scene/            React Three Fiber scene: globe, crater, ejecta, plume, ground damage, camera, flyby
src/ui/               Panels, results, HUD, 2D fallback map, dialogs
src/lib/              API client, geography, share links, storage, world map data
src/data/             City list, famous asteroid IDs
```

## Running locally

1. Start the API from the repository root:
   ```bash
   python -m uvicorn index:app --port 8000
   ```
2. In `impactor/`, copy `.env.example` to `.env.local` and set `AEGISNEO_API_KEY`.
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

Other scripts: `npm test` (unit tests), `npm run lint`, `npm run build`. GitHub Actions
runs all three for Impactor and NEO Atlas on every push (`.github/workflows/ci.yml`).

## Deploying (Vercel)

Impactor deploys as its **own Vercel project**, separate from the AegisNEO API project:

1. Vercel → Add New Project → import this repository.
2. Set **Root Directory** to `impactor`. The framework is detected as Vite.
3. Add environment variables:
   - `AEGISNEO_API_KEY`: a key the API accepts
   - `AEGISNEO_API_URL`: `https://aegisneo-api.vercel.app` (the default if unset)
4. Deploy.

Each website has its own key, listed in `AEGISNEO_API_KEYS` on the **API** project,
e.g. `aegisneo-web:<key1>,impactor:<key2>`, so one can be revoked without breaking
the others. The API also always accepts the public demo key, which is enough for
local development.

The proxy keeps the key out of the browser, but it is not access control: anyone
can call this site's `/api/neo/*` endpoints, and there is no rate limit. The key
identifies which site is asking; it doesn't keep anyone out.

## Credits

- Asteroid data: AegisNEO API (NASA near-Earth object data via Kaggle, 1910–2024)
- Satellite imagery: NASA Blue Marble (shaded relief and bathymetry), Black Marble city
  lights and ASTER GDEM shaded relief, from NASA GIBS (public domain)
- Country outlines: Natural Earth (public domain), via `world-atlas`
- 3D: three.js, React Three Fiber, drei
- Impact model: Collins, Melosh & Marcus (2005)
