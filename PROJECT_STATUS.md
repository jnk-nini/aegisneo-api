# AegisNEO — project status and hand-off notes

Last updated: 2026-11-10

## Live sites

| Site | URL | Vercel project | Source folder |
| --- | --- | --- | --- |
| AegisNEO API + main site | https://aegisneo-api.vercel.app (docs: `/docs`, site: `/frontend/`) | `aegisneo-api` | `api/index.py`, `frontend/` |
| Impactor (impact simulator) | https://aegisneo-impactor.vercel.app | `aegisneo-impactor` | repo `jnk-nini/aegisneo-impactor` |
| NEO Atlas (constellation site) | https://neo-atlas-pearl.vercel.app | `neo-atlas` | repo `jnk-nini/neo-atlas` |

Each site has its own GitHub repository and Vercel project, deployed from its `master` branch:
`jnk-nini/aegisneo-api` (this one), `jnk-nini/aegisneo-impactor` and `jnk-nini/neo-atlas`.

## Professor's requirements for the companion sites

- Each companion site must be a **separate website** that uses the AegisNEO API.
- Frameworks and libraries are allowed.
- Everything must **work fully on mobile**.
- Another database isn't confirmed as allowed, so the sites use the API plus browser storage and share links.

## Environment variables

- `aegisneo-api` project:
  - `DATABASE_URL`: pooled Neon connection string of the limited role `aegis_app`.
  - `JWT_SECRET`: random 64-character hex string that signs login tokens (`JWT_EXPIRE_MINUTES` is optional, default 60).
  - `AEGISNEO_API_KEYS` = `impactor:<key>,neo-atlas:<key>`, one read-only key per partner site.
  - The old demo key `student-api-key-123` and the website key are retired and no longer accepted. The website
    has no key now: visitors log in or continue as guests (10 featured asteroids).
- The owner connection string (`DATABASE_OWNER_URL`) is only used by the setup scripts on the main laptop and is never set on Vercel.
- `aegisneo-impactor` project: `AEGISNEO_API_KEY` (its own `impactor` key) and `AEGISNEO_API_URL`.
- `neo-atlas` project: `AEGISNEO_API_KEY` (its own `neo-atlas` key) and `AEGISNEO_API_URL`.
- Locally the API reads a `.env` file (see `.env.example`). Companion sites in development need a partner key.
- A private copy of all the keys is kept in `.env` at the repo root on the main laptop. It is ignored by
  git. When run locally, the API and the setup scripts read it (real environment variables win).

## Setting up on a new computer

1. Install Git, Python 3.12+ and Node.js 20+ (built with Node 24).
2. Clone the repository and start the API:
   ```bash
   git clone https://github.com/jnk-nini/aegisneo-api.git
   cd aegisneo-api
   pip install -r requirements.txt
   python -m uvicorn api.index:app --port 8000
   ```
3. Impactor and NEO Atlas each have their own repository. Clone it, copy `.env.example` to
   `.env.local` (it already uses the live API and the demo key), then `npm install` and `npm run dev`.

## Status

### Part II: cloud database (Neon)
- Design done (database, architecture and access rules; see the Part II Phases 1-3 report).
- Code written: `db/schema.sql`, `api/` split into modules, import and account scripts, login screen on the website,
  automated tests (`tests/`, run against a local PostgreSQL).
- Still to do on the real services: run `db/schema.sql` and the scripts on Neon, set the Vercel variables,
  delete the `aegisneo-web` entry from `AEGISNEO_API_KEYS` (that key and the demo key are in git history; the
  Impactor and NEO Atlas keys never were), deploy, verify persistence after a redeploy, then the final test
  report and the demo. The steps are in `docs/part2/phases-4-8/01-steps.md`.
- The API's default list order is now by `neo_reference_id` (it used to be the JSON file order).

### Done
- API v1.1: filters, sorting, paging, `/asteroids/random`, `/stats`, per-client keys. Old clients still work.
- Impactor built, tested and deployed. Details in the Impactor repository's README.
- Impactor review (`IMPACTOR_REVIEW.pdf`, 4 Oct 2026): all 8 bugs and the design points fixed. Textures
  are painted in a Web Worker, three.js loads only with the 3D view, unused code is removed, the
  city search is a keyboard combobox, and the store, API client and proxy have tests (53 in total).
- Impactor round 3 (`fa7a24b`): real NASA globe imagery (Blue Marble, Black Marble night lights,
  sharper relief when zoomed in), free globe navigation on mouse and touch, seabed craters for ocean
  impacts, debris that lands mostly near the crater, and a cleaner phone layout.
- Impactor and NEO Atlas moved to their own repositories (with their history). Each runs its own
  GitHub Actions check (tests, lint and build) on every push. Vercel still deploys on its own; turn on Vercel's "wait for checks" if you want
  failing checks to block a deploy.
- Old `impact-simulator/` and `constellation-explorer/` folders removed from the main site.
- NEO Atlas deployed. Its review (18 points plus polish) is fixed except the dates (below): phone and
  landscape layouts, safe saving across tabs, shared links that load partly, a crash screen, the Back
  button closing the detail sheet, constellation or drawing instead of leaving the site, faster loading,
  screen-reader announcements, readable chart text on phones, smoother zooming, and a link preview image.
- NEO Atlas birthday postcards: a first-visit birthday welcome, a constellation drawn automatically from the
  sky's biggest asteroids (with Shuffle), and postcards made in the browser in three looks, shared as a
  picture plus a link that opens the same postcard. Still no database. Details in the NEO Atlas repository's README.
- NEO Atlas phone-first round (after real-phone testing): a calm first screen with only the birthday
  question, a reveal animation, a card-first postcard maker (swipe for six looks, ready-made messages,
  one Send button, every postcard starts blank but remembers the name), stamp, postmark and fun facts on
  the card, the asteroid sign, Star Match (the receiver adds their birthday and the two constellations are
  joined), sealed birthday postcards with a countdown, and the NEO Atlas `docs/` folder (user guide, architecture,
  data and limits, testing).

### Next steps
- Test Impactor on real phones (iPhone Safari and Android Chrome). A Lighthouse mobile audit of the
  production build is done (see the Impactor README).
- NEO Atlas: test the new flow on real phones: the reveal, Send (share sheet), sealed links and Star Match
  between two phones (iPhone Safari and Android Chrome).
- Idea on hold: a "What if it hit?" button in NEO Atlas that opens Impactor with that asteroid loaded.
- NEO Atlas: add a Vercel Firewall rate-limit rule for `/api/neo` (see the NEO Atlas README).
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
