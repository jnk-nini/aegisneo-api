# AegisNEO — project status and hand-off notes

Last updated: 2026-10-04

## Live sites

| Site | URL | Vercel project | Source folder |
| --- | --- | --- | --- |
| AegisNEO main site + API | https://aegisneo-api.vercel.app (docs: `/docs`) | `aegisneo-api` | repo root (`index.py`, `index.html`) |
| Impactor (impact simulator) | https://aegisneo-impactor.vercel.app | `aegisneo-impactor` (Root Directory: `impactor`) | `impactor/` |
| NEO Atlas (constellation site) | in progress | `neo-atlas` (Root Directory: `neo-atlas`) | `neo-atlas/` |

All three Vercel projects are connected to `github.com/jnk-nini/aegisneo-api`, branch `master`.
Pushing to `master` redeploys them.

## Professor's requirements for the companion sites

- Each companion site must be a **separate website** that uses the AegisNEO API.
- Frameworks and libraries are allowed.
- Everything must **work fully on mobile**.
- Another database isn't confirmed as allowed, so the sites use the API plus browser storage and share links.

## Environment variables

- `aegisneo-api` project: optional `AEGISNEO_API_KEYS` = `client:key,client:key`. If unset, only the
  demo key `student-api-key-123` is accepted. If you set it, include a key for every site, and update
  each companion project's `AEGISNEO_API_KEY` to match.
- `aegisneo-impactor` project: `AEGISNEO_API_KEY` (currently the demo key) and `AEGISNEO_API_URL`.

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
   npm test                     # 25 unit tests
   ```
4. NEO Atlas works the same way inside `neo-atlas/` (see its README).

## Status

### Done
- API v1.1: filters, sorting, paging, `/asteroids/random`, `/stats`, per-client keys. Old clients still work.
- Impactor built, tested and deployed. Details in `impactor/README.md`.
- Old `impact-simulator/` folder removed from the main site.

### Next steps
- Test Impactor on real phones (iPhone Safari and Android Chrome) and run a Lighthouse mobile audit.
- Finish NEO Atlas, deploy it, then remove the old `constellation-explorer/` folder and its line in `vercel.json`.
- Optional: give each site its own API key (see Environment variables).
- Optional: link to the companion sites from the main AegisNEO page.

## Notes
- The original `impact-simulator/assets/world.svg` was not an equirectangular map, so it placed impact
  points incorrectly. Impactor uses Natural Earth outlines instead.
- Windows "Show animations = off" makes browsers report reduced motion. Impactor then skips the
  animation unless you tick "Animate the impact".
