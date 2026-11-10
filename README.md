# AegisNEO API

A REST API (built with FastAPI) that tracks Near-Earth Objects (NEOs), using real asteroid data from
NASA via Kaggle. The records live in a Neon (PostgreSQL) database. It is deployed on Vercel, and a plain
HTML/CSS/JS website loads its data with `fetch()`.

- **Live API:** https://aegisneo-api.vercel.app (returns a welcome message)
- **Interactive docs:** https://aegisneo-api.vercel.app/docs
- **Website:** open `frontend/index.html` on your computer, or online at https://aegisneo-api.vercel.app/frontend/

## Project structure

```
api/index.py        routes and error handling
api/auth.py         login, tokens, partner keys and the access rules
api/db.py           every SQL query (psycopg 3)
api/models.py       request validation models
api/config.py       settings from environment variables
db/schema.sql       tables, constraints, indexes and privileges
scripts/            import_asteroids.py, create_user.py (run once, on your own computer)
tests/              automated tests (pytest, run against a local PostgreSQL)
requirements.txt    Python packages for Vercel
vercel.json         sends /frontend/... to the website and everything else to the API
data/asteroids.json the catalog, only used once by scripts/import_asteroids.py
frontend/           the website: index.html, app.js, style.css, assets/
```

## Who can do what

| Caller | How it identifies itself | Allowed |
| --- | --- | --- |
| Guest | nothing | read the 10 featured asteroids |
| User | `Authorization: Bearer <token>` from `POST /api/v1/auth/login` | read everything, create, update, delete, statistics |
| Partner site | `x-api-key` header | read everything and statistics, change nothing (403) |

An invalid or expired token, or a wrong partner key, is a 401 (it is never treated as a guest).

## Endpoints

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| GET | `/` | Welcome message and the number of asteroids | public |
| GET | `/health` | Status check; 503 if the database cannot be reached | public |
| POST | `/api/v1/auth/login` | Username and password (form fields) -> access token | public |
| GET | `/api/v1/auth/me` | The logged-in user | user |
| GET | `/api/v1/asteroids` | List with `search`, `hazardous`, `min_diameter`, `max_diameter`, `from_date`, `to_date`, `sort`, `order`, `limit`, `offset` | guest: featured only |
| GET | `/api/v1/asteroids/random?count=` | Random asteroids | guest: featured only |
| GET | `/api/v1/asteroids/{neo_reference_id}` | One asteroid | guest: featured only |
| POST | `/api/v1/asteroids` | Create (201) | user |
| PATCH | `/api/v1/asteroids/{neo_reference_id}` | Change only the fields sent | user |
| DELETE | `/api/v1/asteroids/{neo_reference_id}` | Delete | user |
| GET | `/api/v1/stats` | Catalog summary | user or partner |

Status codes: 200, 201, 400 (body is not JSON), 401 (login needed or invalid credentials), 403 (read-only
key), 404, 409 (duplicate ID or name, or more than 10 featured), 422 (invalid data), 503 (database
unavailable), 500 (generic message; details only in the server log).

## Environment variables

See `.env.example`. On Vercel set `DATABASE_URL`, `JWT_SECRET` and `AEGISNEO_API_KEYS` (Production and
Preview). `DATABASE_OWNER_URL` is only for the setup scripts on your own computer and is never set on Vercel.
The real `.env` file is ignored by git.

## Set up the database (once)

1. Run `db/schema.sql` as the owner role (Neon SQL Editor). The role `aegis_app` must already exist.
2. Put the owner connection string in `.env` as `DATABASE_OWNER_URL`, then:

```bash
pip install -r requirements.txt
python scripts/import_asteroids.py
python scripts/create_user.py <username>
```

The import can be run again safely. `create_user.py` asks for the password on the terminal.

## Run it on your computer

```bash
pip install -r requirements.txt
python -m uvicorn api.index:app --reload --port 8000
```

Then open http://127.0.0.1:8000/docs and use the **Authorize** button to log in.

## Tests

The tests need a local PostgreSQL server (they create their own database, `aegisneo_test`, and refuse to
run against anything that is not localhost):

```bash
pip install -r requirements-dev.txt
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres python -m pytest
```

## Sites that use this API

- [Impactor](https://aegisneo-impactor.vercel.app): 3D asteroid impact simulator
- [NEO Atlas](https://neo-atlas-pearl.vercel.app): asteroid star atlas and birthday postcards

Both read the full catalog through their own server-side proxies with a partner key.
