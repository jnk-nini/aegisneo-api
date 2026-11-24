# AegisNEO API

A REST API (built with FastAPI) that tracks Near-Earth Objects (NEOs), using real asteroid data from
NASA via Kaggle. The records live in a Neon (PostgreSQL) database. It is deployed on Vercel, and a plain
HTML/CSS/JS website loads its data with `fetch()`.

- **Live API:** https://aegisneo-api.vercel.app (returns a welcome message)
- **Interactive docs:** https://aegisneo-api.vercel.app/docs
- **Website (hub):** https://aegisneo-hub.vercel.app (its own Vercel project, root directory `frontend`). Locally, serve the `frontend` folder with any static server that supports clean URLs, for example `npx serve frontend`.

## Project structure

```
api/index.py        routes and error handling
api/auth.py         login, tokens, launch tickets, partner keys and the access rules (read from site_access)
api/db.py           every SQL query (psycopg 3)
api/models.py       request validation models
api/config.py       settings from environment variables
db/schema.sql       the ten tables, constraints, indexes and privileges
db/migrations/      changes for a database made with an older schema.sql (001 roles, 002 sites and activity, 003 rate limits)
scripts/            dev_server.py (API + website together), import_asteroids.py, create_user.py, set_role.py, check_connection.py, verify_deployment.py (run on your own computer)
docs/part2/phases-4-8/  step-by-step guide, API guide, security assessment and test report
tests/              automated tests (pytest, run against a local PostgreSQL)
requirements.txt    Python packages for Vercel
vercel.json         sends everything to the API (old /frontend/... links redirect to the hub)
frontend/vercel.json  settings of the hub project: clean URLs, security headers, caching
data/asteroids.json the catalog, only used once by scripts/import_asteroids.py
frontend/           the website: landing (index.html), auth.html, hub.html, explorer.html, shared.js, assets/
```

## The website: landing, sign-in, hub

https://aegisneo-hub.vercel.app is the official AegisNEO website. A visitor goes through it in this order:

1. `index.html` (`/`): a landing page with a 3D globe hero, that explains the three sites and what each role gets.
2. `auth.html`: a full sign-in / create-account screen (or "continue as a guest").
3. `hub.html`: the hub. It lists the three sites with what the visitor's role may do on each, opens them, shows
   badges and recent launches, and (for admins) "Mission control": usage per site and the audit trail.
4. `explorer.html` (with `explorer.css`): the main catalog app, in the same style as the hub. Admins also get create, edit and delete here.

Impactor and NEO Atlas are separate websites. The hub opens them with a read-only **ticket** (a short-lived token
for that one site, in the URL fragment). The partner forwards it to this API with its own key, so the API serves the
visitor by their role on every site. Opening a partner site directly, without a ticket, is a guest visit.

## Who can do what

The rules are rows of the `site_access` table (one per role and site), not code:

| Role | AegisNEO Explorer | Impactor | NEO Atlas |
| --- | --- | --- | --- |
| Guest (no account) | 10 featured asteroids | 10 featured asteroids | 10 featured asteroids |
| User (account) | whole catalog, read only | whole catalog | whole catalog |
| Admin (account) | whole catalog, create / update / delete | whole catalog | whole catalog |

| Caller | How it identifies itself |
| --- | --- |
| Guest | nothing |
| Account (admin or user) | `Authorization: Bearer <token>` from `POST /api/v1/auth/login` or `/signup` |
| Partner site, no visitor | `x-api-key` header: served as a guest of that site |
| Partner site, with a visitor | `x-api-key` plus the visitor's ticket as `Authorization: Bearer <ticket>` |

An invalid or expired token, a ticket used with another site's key, or a wrong partner key is a 401 (never a
silent guest). A ticket is read only: it cannot change data or open account pages.

Changing a limit or a rule is an SQL `update` of `site_access`, with no deployment. The roles are stored in the
database: `roles` lists `admin`, `user` and `guest`, and every `users` row has a `role` (foreign key, never `guest`).
The API reads the role from the database before every create, update and delete, so a role change takes effect at once.

Anyone can create an account on the website or with `POST /api/v1/auth/signup`. Sign-up accounts are always `user`:
the request cannot name a role, and the API's database role may fill in only `username` and `password_hash`.
Admins are made only by you, with `scripts/create_user.py <name> admin` or `scripts/set_role.py <name> admin`.

## Data model

Ten tables (diagram: `docs/part2/diagrams/erd.png`): `roles`, `users`, `sites`, `site_access` (role x site rules),
`asteroids`, `launches` (every time a site is opened), `watchlist` (users x asteroids), `badges`, `user_badges`
and `asteroid_audit` (an append-only trail of admin changes). `db/schema.sql` has them all.

## Endpoints

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| GET | `/` | Welcome message and the number of asteroids | public |
| GET | `/health` | Status check; 503 if the database cannot be reached | public |
| POST | `/api/v1/auth/signup` | Create an account (JSON `username`, `password`); it always gets the user role (201) | public |
| POST | `/api/v1/auth/login` | Username and password (form fields) -> access token | public |
| POST | `/api/v1/auth/reset-password` | JSON `username`, `recovery_code`, `new_password`: choose a new password; the code is used up and a new one is returned | public (throttled) |
| POST | `/api/v1/auth/recovery-code` | JSON `password`: make a new recovery code for the signed-in account | admin or user |
| GET | `/api/v1/auth/me` | The logged-in account, its role and whether it has a recovery code | admin or user |
| GET | `/api/v1/asteroids` | List with `search`, `hazardous`, `min_diameter`, `max_diameter`, `from_date`, `to_date`, `sort`, `order`, `limit`, `offset` | limited roles: featured only |
| GET | `/api/v1/asteroids/random?count=` | Random asteroids | limited roles: featured only |
| GET | `/api/v1/asteroids/{neo_reference_id}` | One asteroid | limited roles: featured only |
| POST | `/api/v1/asteroids` | Create (201) | admin |
| PATCH | `/api/v1/asteroids/{neo_reference_id}` | Change only the fields sent | admin |
| DELETE | `/api/v1/asteroids/{neo_reference_id}` | Delete | admin |
| GET | `/api/v1/stats` | Summary of the catalog the caller may see | everyone (guests: the featured ones) |
| GET | `/api/v1/sites` | The three sites and what the caller's role may do on each | public |
| POST | `/api/v1/sites/{slug}/launch` | Open a site: records it, awards badges, returns a ticket for partner sites | guest or account |
| GET | `/api/v1/me/overview` | Account, badges, recent launches, watchlist size | admin or user |
| GET | `/api/v1/me/watchlist` | The account's watchlist | admin or user |
| PUT / DELETE | `/api/v1/me/watchlist/{neo_reference_id}` | Add or remove an asteroid | admin or user |
| GET | `/api/v1/admin/overview` | Users per role, launches per site, most watched, recent changes | admin |

Status codes: 200, 201, 400 (body is not JSON), 401 (login needed or invalid credentials), 429 (too many sign-in or sign-up attempts; see `Retry-After`), 403 (read-only
key, or an account with the user role trying to change data), 404, 409 (duplicate ID or name, or more than 10 featured), 422 (invalid data), 503 (database
unavailable), 500 (generic message; details only in the server log).

## Security notes

- **Throttling.** Sign-in is limited to 30 attempts per address and 10 per username every 15 minutes, and sign-up to
  10 per address per hour (`api/ratelimit.py`). The counters are in the `rate_limits` table and hold hashes, never raw
  addresses. If the table is missing the API lets requests through and logs a warning, so run
  `db/migrations/003_add_rate_limits.sql` on an existing database. `RATE_LIMIT_DISABLED=1` switches it off.
- **Password recovery without email.** An account gets a recovery code at sign-up (16 characters, shown once, stored
  only as a bcrypt hash). With the username and the code, `POST /auth/reset-password` sets a new password, uses the code
  up and returns a fresh one. Accounts made earlier create a code on the hub (Account security) with their password.
  No email address is collected. The API's database role may change only the `password_hash` and `recovery_hash`
  columns of `users`, never a role or a name. Run `db/migrations/005_add_account_recovery.sql` on an existing database.
  A reset does not end sessions that are already open; their tokens expire within `JWT_EXPIRE_MINUTES`.
- **Roles are read live.** An account's role is looked up in the database on every request, so a deleted or demoted
  account loses access at once, not when its token expires.
- **Headers.** The website is served with a Content-Security-Policy and the usual hardening headers (`vercel.json`);
  fonts are served from this site, not from Google. Responses about an account are `Cache-Control: no-store`.
- Sessions live in `sessionStorage`, so each browser tab signs in separately and closing the tab signs out.

## Environment variables

See `.env.example`. On Vercel set `DATABASE_URL`, `JWT_SECRET` and `AEGISNEO_API_KEYS` (Production and
Preview). `LAUNCH_TICKET_MINUTES` (default 240) is how long a partner-site ticket lasts. `DATABASE_OWNER_URL` is only for the setup scripts on your own computer and is never set on Vercel.
The real `.env` file is ignored by git.

## Set up the database (once)

1. Run `db/schema.sql` as the owner role (Neon SQL Editor). The role `aegis_app` must already exist.
2. Put the owner connection string in `.env` as `DATABASE_OWNER_URL`, then:

```bash
pip install -r requirements.txt
python scripts/import_asteroids.py
python scripts/create_user.py <username> admin   # may change data
python scripts/create_user.py <username>         # role user: read only
```

The import can be run again safely. `create_user.py` asks for the password on the terminal.
To change a role later: `python scripts/set_role.py <username> admin` (or `user`); `--list` shows every account.

If your database was created before roles existed, run `db/migrations/001_add_roles.sql` once in the Neon SQL
Editor. It adds the `roles` table and the `role` column, and makes the existing accounts admins. To add the hub
(sites, access rules, launches, watchlist, badges, audit trail and the guest role), then run
`db/migrations/002_add_sites_and_activity.sql` the same way. Both can be run again safely.

## Run it on your computer

```bash
pip install -r requirements.txt
python -m uvicorn api.index:app --reload --port 8000
```

Then open http://127.0.0.1:8000/docs and use the **Authorize** button to log in.

## Tests

There are two kinds. `pytest` tests the API against a real PostgreSQL (below). The browser tests in `e2e/` drive the
website in Chromium against the real API and a freshly seeded database: sign-in and recovery, the hub and its ticket
handoff to the partner sites, the Explorer (paging, filters, share links, Open in Impactor, the admin editor), automatic
accessibility checks (axe) and phone-sized screens. They run in CI on every pull request.

```bash
cd e2e && npm install && npx playwright install chromium
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres npm test
```

`python scripts/dev_server.py` runs the API and the website together on one address (http://127.0.0.1:8000/frontend/)
for local work.

### API tests

The tests need a local PostgreSQL server (they create their own database, `aegisneo_test`, and refuse to
run against anything that is not localhost):

```bash
pip install -r requirements-dev.txt
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres python -m pytest
```

## Sites that use this API

- [Impactor](https://aegisneo-impactor.vercel.app): 3D asteroid impact simulator
- [NEO Atlas](https://neo-atlas-pearl.vercel.app): asteroid star atlas and birthday postcards

Both reach the API through their own server-side proxies with a partner key, and pass on the visitor's ticket from
the hub, so a signed-in visitor sees the whole catalog and a guest sees 10 featured asteroids.
