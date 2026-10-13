# AegisNEO API

A REST API (built with FastAPI) that tracks Near-Earth Objects (NEOs), using real asteroid data from
NASA via Kaggle. It is deployed on Vercel, and a plain HTML/CSS/JS website loads its data with `fetch()`.

- **Live API:** https://aegisneo-api.vercel.app (returns a welcome message)
- **Interactive docs:** https://aegisneo-api.vercel.app/docs
- **Website:** open `frontend/index.html` on your computer, or online at https://aegisneo-api.vercel.app/frontend/

## Project structure

```
api/index.py        the FastAPI app (all endpoints and the API key check)
requirements.txt    Python packages for Vercel (fastapi, uvicorn, pydantic)
vercel.json         sends /frontend/... to the website and everything else to the API
data/asteroids.json the asteroid catalog the API serves
data/raw/           the original Kaggle CSV (only used by scripts/build_dataset.py)
frontend/           the website: index.html, app.js, style.css, assets/
```

## Endpoints

| Method | Path | What it returns |
| --- | --- | --- |
| GET | `/` | Welcome message and a list of endpoints |
| GET | `/health` | Status check (no key needed) |
| GET | `/api/v1/asteroids` | Asteroids, with optional `search`, `hazardous`, `min_diameter`, `max_diameter`, `sort`, `order`, `limit`, `offset` |
| GET | `/api/v1/asteroids/random?count=` | Random asteroids |
| GET | `/api/v1/asteroids/{neo_reference_id}` | One asteroid |
| GET | `/api/v1/stats` | Catalog summary |

## API key

Every `/api/v1/...` request needs an `x-api-key` header, otherwise the API answers 401.

- Demo key, always accepted: `student-api-key-123` (use it in `/docs` with the **Authorize** button).
- Each website has its own key, stored in the Vercel environment variable `AEGISNEO_API_KEYS`
  (never in GitHub). The check is `verify_api_key` in `api/index.py`.

## Run it on your computer

```bash
pip install -r requirements.txt
python -m uvicorn api.index:app --reload --port 8000
```

Then open http://127.0.0.1:8000/docs. The website (`frontend/index.html`) always uses the live API,
so it works with a double-click and doesn't need the local server.

## Sites that use this API

- [Impactor](https://aegisneo-impactor.vercel.app): 3D asteroid impact simulator
- [NEO Atlas](https://neo-atlas-pearl.vercel.app): asteroid star atlas and birthday postcards
