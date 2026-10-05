# Impactor

A 3D asteroid impact simulator built on the **AegisNEO API**. Pick a real near-Earth
asteroid, choose a target on a 3D globe, and watch the approach, impact and blast
wave play out. The impact effects follow a published scientific model
(Collins, Melosh & Marcus, 2005).

**Live site:** https://aegisneo-impactor.vercel.app

![Results after an Apophis-sized impact on São Paulo](docs/images/04-results.jpg)

Impactor is a **separate website** from the main AegisNEO site. It only talks to
AegisNEO through its public REST API, to show that the API can power other apps.

## Documentation

| Document                             | Contents                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| [User guide](docs/user-guide.md)     | How to use the site step by step, controls, results, phones, troubleshooting   |
| [Architecture](docs/architecture.md) | Components, data flow, state, API proxy, rendering, performance, accessibility |
| [Science](docs/science.md)           | The impact model, assumptions, how the picture is drawn, known limitations     |
| [Testing](docs/testing.md)           | Running the tests, what the 83 unit tests cover, manual test checklist         |

## Features

- **Real asteroids from the API**: search, random picks, largest objects, closest
  flybys and famous asteroids (Apophis, Bennu, Didymos…).
- **3D globe** with NASA satellite imagery, real day and night for the current time,
  city lights, clouds and atmosphere. Tap anywhere to aim, or search a city or enter coordinates.
- **Cinematic impact**: approach, entry glow, airburst or ground impact, a 3D crater
  dug out and collapsing, ejecta, a fireball and mushroom cloud, the air blast sweeping
  outward, then scorched ground, fires, flattened forest and darkened cities.
  Play/pause, 0.25×–4× speed, skip and replay.
- **Sandbox controls**: change size, speed, entry angle, direction and composition.
  Changes are labelled _Hypothetical_.
- **Results**: energy, crater, earthquake magnitude, damage zones with blast arrival
  times, major cities in range, and how often such an impact happens.
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

The browser never calls the API with a key. It calls `/api/neo/*` on this site, and a
small server function (`api/neo.js`) forwards the request with the key from an
environment variable. The function only allows the endpoints above, drops unknown
parameters, and caches responses at the edge (random picks are never cached).
Details in [Architecture § 5](docs/architecture.md#5-talking-to-the-aegisneo-api).

## No database needed

- Asteroid data comes from the AegisNEO API.
- Saved scenarios live in the browser's `localStorage` (`src/lib/storage.js`).
- Share links encode the full scenario in the URL (`src/lib/share.js`).

## Project structure

```
api/neo.js            Vercel serverless proxy to the AegisNEO API
tests/                Proxy tests (kept out of api/, where every file becomes a function)
docs/                 User guide, architecture, science, testing
src/physics/          Impact model, tests, damage-zone styling, reference events
src/scene/            React Three Fiber scene: globe, crater, ejecta, plume, ground damage, camera, flyby
src/ui/               Panels, results, HUD, 2D fallback map, dialogs
src/lib/              API client, geography, NASA imagery, share links, storage, world map data
src/data/             City list, famous asteroid IDs
```

The full file map is in [Architecture § 2](docs/architecture.md#2-folder-structure).

## Running locally

Requires Node.js 24 (as in CI) and Python for the API.

1. Start the API from the repository root:
   ```bash
   python -m uvicorn index:app --port 8000
   ```
2. In `impactor/`, copy `.env.example` to `.env.local` and set `AEGISNEO_API_KEY`.
   The API's public demo key is enough for local development.
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

To use the deployed API instead of a local one, set `AEGISNEO_API_URL=https://aegisneo-api.vercel.app`
in `.env.local`.

| Script            | Does                          |
| ----------------- | ----------------------------- |
| `npm run dev`     | Dev server with the API proxy |
| `npm test`        | Unit tests (Vitest)           |
| `npm run lint`    | ESLint                        |
| `npm run build`   | Production build into `dist/` |
| `npm run preview` | Serve the production build    |
| `npm run format`  | Prettier                      |

GitHub Actions runs the tests, lint and build for Impactor and NEO Atlas on every push
(`.github/workflows/ci.yml`). See [Testing](docs/testing.md).

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
the others.

The proxy keeps the key out of the browser, but it is not access control: anyone
can call this site's `/api/neo/*` endpoints, and there is no rate limit. The key
identifies which site is asking; it doesn't keep anyone out.

## Limitations

The numbers are estimates for learning, not predictions of real hazards. Tsunami
height isn't modelled, ocean depth is a global average, the catalog has no density
(composition is a choice), and some visuals are enlarged so they can be seen (always
labelled on screen). The full list is in
[Science § 4](docs/science.md#4-known-limitations).

## Credits

- Asteroid data: AegisNEO API (NASA near-Earth object data via Kaggle, 1910–2024)
- Satellite imagery: NASA Blue Marble (shaded relief and bathymetry), Black Marble city
  lights and ASTER GDEM shaded relief, from NASA GIBS (public domain)
- Country outlines: Natural Earth (public domain), via `world-atlas`
- 3D: three.js, React Three Fiber, drei
- Impact model: Collins, Melosh & Marcus (2005), _Earth Impact Effects Program_,
  Meteoritics & Planetary Science 40(6), 817–840
- Ejecta thickness: McGetchin, Settle & Head (1973)
