# AegisNEO — project status and hand-off notes

Last updated: 2026-10-05

## Live sites

| Site | URL | Vercel project | Source folder |
| --- | --- | --- | --- |
| AegisNEO main site + API | https://aegisneo-api.vercel.app (docs: `/docs`) | `aegisneo-api` | repo root (`index.py`, `index.html`) |
| Impactor (impact simulator) | https://aegisneo-impactor.vercel.app | `aegisneo-impactor` (Root Directory: `impactor`) | `impactor/` |
| NEO Atlas (constellation site) | https://neo-atlas-pearl.vercel.app | `neo-atlas` (Root Directory: `neo-atlas`) | `neo-atlas/` |

All three Vercel projects are connected to `github.com/jnk-nini/aegisneo-api`, branch `master`.
Pushing to `master` redeploys them.

## Professor's requirements for the companion sites

- Each companion site must be a **separate website** that uses the AegisNEO API.
- Frameworks and libraries are allowed.
- Everything must **work fully on mobile**.
- Another database isn't confirmed as allowed, so the sites use the API plus browser storage and share links.

## Environment variables

- `aegisneo-api` project: `AEGISNEO_API_KEYS` = `aegisneo-web:<key>,impactor:<key>,neo-atlas:<key>`,
  one key per site. The demo key `student-api-key-123` is always accepted as well (client "demo"), so
  /docs and the report's examples keep working; the sites themselves don't use it.
- The main site's key (`aegisneo-web`) is written in `app.js`. A plain-JS page can't hide a key, so it
  only identifies the site; the companion sites keep theirs secret behind their `/api/neo` proxies.
- `aegisneo-impactor` project: `AEGISNEO_API_KEY` (its own `impactor` key) and `AEGISNEO_API_URL`.
- `neo-atlas` project: `AEGISNEO_API_KEY` (its own `neo-atlas` key) and `AEGISNEO_API_URL`.
- Locally nothing needs setting: the local API accepts the demo key, and `.env.local` can use it.
- A private copy of all the keys is kept in `.env` at the repo root on the main laptop. It is ignored by
  git and nothing loads it; it is only there to look the keys up.

## Setting up on a new computer

1. Install Git, Python 3.12+ and Node.js 20+ (built with Node 24).
2. Clone the repository and start the API:
   ```bash
   git clone https://github.com/jnk-nini/aegisneo-api.git
   cd aegisneo-api
   pip install -r requirements.txt
   python -m uvicorn index:app --port 8000
   ```
3. Impactor:
   ```bash
   cd impactor
   cp .env.example .env.local   # then set AEGISNEO_API_KEY=student-api-key-123
   npm install
   npm run dev                  # http://localhost:5173
   npm test                     # 53 unit tests
   ```
4. NEO Atlas works the same way inside `neo-atlas/` (see its README).

## Status

### Done
- API v1.1: filters, sorting, paging, `/asteroids/random`, `/stats`, per-client keys. Old clients still work.
- Impactor built, tested and deployed. Details in `impactor/README.md`.
- Impactor review (`IMPACTOR_REVIEW.pdf`, 4 Oct 2026): all 8 bugs and the design points fixed. Textures
  are painted in a Web Worker, three.js loads only with the 3D view, unused code is removed, the
  city search is a keyboard combobox, and the store, API client and proxy have tests (53 in total).
- Impactor round 3 (`fa7a24b`): real NASA globe imagery (Blue Marble, Black Marble night lights,
  sharper relief when zoomed in), free globe navigation on mouse and touch, seabed craters for ocean
  impacts, debris that lands mostly near the crater, and a cleaner phone layout.
- GitHub Actions (`.github/workflows/ci.yml`) runs tests, lint and build for Impactor and NEO Atlas
  on every push. Vercel still deploys on its own; turn on Vercel's "wait for checks" if you want
  failing checks to block a deploy.
- Old `impact-simulator/` and `constellation-explorer/` folders removed from the main site.
- NEO Atlas deployed. Its review (18 points plus polish) is fixed except the dates (below): phone and
  landscape layouts, safe saving across tabs, shared links that load partly, a crash screen, the Back
  button closing the detail sheet, constellation or drawing instead of leaving the site, faster loading,
  screen-reader announcements, readable chart text on phones, smoother zooming, and a link preview image.
- NEO Atlas birthday postcards: a first-visit birthday welcome, a constellation drawn automatically from the
  sky's biggest asteroids (with Shuffle), and postcards made in the browser in three looks, shared as a
  picture plus a link that opens the same postcard. Still no database. Details in `neo-atlas/README.md`.

### Next steps
- Test Impactor on real phones (iPhone Safari and Android Chrome). A Lighthouse mobile audit of the
  production build is done (see `impactor/README.md`).
- NEO Atlas: test on real phones, including the postcard Share button (iPhone Safari and Android Chrome).
- Idea on hold: a "What if it hit?" button in NEO Atlas that opens Impactor with that asteroid loaded.
- NEO Atlas: add a Vercel Firewall rate-limit rule for `/api/neo` (see `neo-atlas/README.md`).
- NEO Atlas dates are simulated: the Kaggle data has no dates, so `scripts/build_dataset.py` makes them
  up, and the site says so. Real dates would mean rebuilding the dataset from NASA JPL's close-approach
  API, which changes the main API's data too. Decided on 5 Oct 2026 to leave it for now.
- Optional: link to the companion sites from the main AegisNEO page.

## Notes
- The original `impact-simulator/assets/world.svg` was not an equirectangular map, so it placed impact
  points incorrectly. Impactor uses Natural Earth outlines instead.
- The console shows one `THREE.Clock` deprecation warning. It comes from React Three Fiber itself;
  the latest stable release (9.8.1) still uses it, and only the unstable 10.x alpha fixes it.
- Windows "Show animations = off" makes browsers report reduced motion. Impactor then skips the
  animation unless you tick "Animate the impact".
