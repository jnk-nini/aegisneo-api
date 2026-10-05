# NEO Atlas

A star atlas of real near-Earth asteroids. Pick a year (1910–2024) or a date such as your birthday, and the
asteroids whose close approach falls then are drawn as a planisphere:

- **Earth** sits at the center.
- **Angle** around the dial is the day of the year of the close approach (January at the top, clockwise).
- **Distance from the center** is the real miss distance.
- **Star size** is the estimated diameter; potentially hazardous objects are marked in red with a distinct shape.

Visitors can connect stars into their own constellations, save them, and share them as links.

NEO Atlas is a separate website from the main AegisNEO site. It gets all of its asteroid data from the
[AegisNEO API](https://aegisneo-api.vercel.app/docs), to show the API can be used by other sites.

## How it uses the AegisNEO API

| Feature | API call |
| --- | --- |
| Catalog summary | `GET /api/v1/stats` |
| A year's sky (e.g. 1987) | `GET /api/v1/asteroids?search=1987-&limit=100&offset=…` |
| A date in every year (e.g. 12 May) | `GET /api/v1/asteroids?search=-05-12&limit=100&offset=…` |
| Ready-made constellations | `GET /api/v1/asteroids?sort=diameter&order=desc&limit=…` (and similar) |
| One asteroid | `GET /api/v1/asteroids/{neo_reference_id}` |

The browser never sees the API key. It calls `/api/neo/*` on this site, and a small server function
([`api/neo.js`](api/neo.js)) adds the key from an environment variable and forwards only these read-only
endpoints and their parameters; anything else is refused, so made-up parameters can't skip the edge cache.
In development, the Vite dev server runs the same function ([`vite.config.js`](vite.config.js)).

## No database

Nothing is stored on a server:

- **Share links** hold the whole constellation (asteroid IDs and name) in the URL.
- **My constellations** are kept in the browser's `localStorage` on the visitor's device.
- **Export / import** saves constellations to a JSON file and loads them back.

## Running locally

1. Start the AegisNEO API from the repository root:
   ```bash
   python -m uvicorn index:app --port 8000
   ```
2. In this folder, copy `.env.example` to `.env.local` and set `AEGISNEO_API_KEY` to a key the API accepts.
3. Install and run:
   ```bash
   npm install
   npm run dev
   ```

Other scripts: `npm test` (unit tests), `npm run lint`, `npm run build`.

## Deploying

NEO Atlas is deployed as its own Vercel project, separate from the API and the main site:

1. Create a new Vercel project from this repository and set **Root Directory** to `neo-atlas`.
2. Add environment variables:
   - `AEGISNEO_API_KEY`: the key issued to NEO Atlas.
   - `AEGISNEO_API_URL`: `https://aegisneo-api.vercel.app` (optional; this is the default).
3. On the API project, add the same key to `AEGISNEO_API_KEYS` as `neo-atlas:<key>`.
4. Recommended: in the Vercel dashboard, add a Firewall rate-limit rule for `/api/neo` (for example
   100 requests per minute per IP), since anyone can call the proxy.

The link preview image is `public/og.png`. `index.html` points to it at the production address, so
update that address if the site moves.

## Data

Asteroid records come from NASA's NeoWs feed (via the Kaggle "Nearest Earth Objects 1910–2024" dataset) and
are served by the AegisNEO API: 33,511 objects, one record each.

**The close-approach dates are simulated.** The Kaggle dataset has each object's size, speed, miss distance
and hazard class, but no date column, so the API gives every object a fixed date between 1910 and 2024,
derived from its ID (see `scripts/build_dataset.py`). A star's distance from Earth, its size and its hazard
marking are real; its position around the dial is illustrative. The site says so in the chart summary, the
"How to read" guide, the detail sheet and the footer.
