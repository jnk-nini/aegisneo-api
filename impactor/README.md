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
- **Cinematic impact**: approach path, entry glow, airburst or ground impact,
  fireball, expanding air blast, crater and ejecta, with play/pause and 0.25×–4× speed.
- **Sandbox controls**: change size, speed, entry angle, direction and composition.
  Changes are labelled *Hypothetical*.
- **Results**: energy, crater, earthquake magnitude, damage zones drawn to scale,
  blast arrival times, major cities in range, and how often such an impact happens.
- **Real flyby mode**: the asteroid's actual miss distance, drawn to scale with the Moon's orbit.
- **Share, save, export**: share links hold the whole scenario, scenarios save in the
  browser, and the 3D view can be downloaded as an image.
- **Works on phones**: bottom-sheet controls, adaptive graphics quality, and an
  automatic 2D map when 3D isn't available.

## How it uses the AegisNEO API

| Feature | Endpoint |
| --- | --- |
| Search | `GET /api/v1/asteroids?search=…&limit=30` |
| Largest / closest flybys | `GET /api/v1/asteroids?sort=diameter&order=desc` · `sort=miss_distance` |
| Random / random hazardous | `GET /api/v1/asteroids/random?hazardous=true` |
| Famous asteroids, share links | `GET /api/v1/asteroids/{neo_reference_id}` |

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
*Earth Impact Effects Program*, Meteoritics & Planetary Science 40(6), 817–840.
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

## Mobile strategy

- Layout: bottom sheet with tabs below 1100 px; side panels on desktop.
- Graphics: device pixel ratio capped (1.75 on phones), quality lowered automatically
  if the frame rate drops, 2048 px textures on phones.
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
src/scene/            React Three Fiber scene: globe, impact effects, camera, flyby
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
- Country outlines: Natural Earth (public domain), via `world-atlas`
- 3D: three.js, React Three Fiber, drei
- Impact model: Collins, Melosh & Marcus (2005)
