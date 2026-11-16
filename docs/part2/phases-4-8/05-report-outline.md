# Outline for the Implementation and Technical Evaluation Report

For each section of the assignment (III. Final Output), this lists where the material is and gives facts you can
build on. Sections marked **YOU** need your own experience on Neon and Vercel, or your own opinion, so they are
not drafted. Part I must not be repeated: this report is about what was designed, built, tested and learned.

| # | Section | Source material | Status |
| --- | --- | --- | --- |
| 1 | Executive summary | write last, from the facts below | **YOU** (after deployment) |
| 2 | Existing API assessment | Phases 1 to 3 report, sections 2.1 to 2.4 (Tables 1 to 4) | Reuse from your report |
| 3 | Database design | Phases 1 to 3 report, section 3 (Tables 6 to 9, Figure 12, schema) and `db/schema.sql` | Reuse; the schema in the report equals `db/schema.sql` |
| 4 | Architecture and integration | Phases 1 to 3 report, section 4 (Figures 13 to 15, Tables 11 to 15) | Reuse; update the module list (below) |
| 5 | Implementation details | below, plus code excerpts | Facts drafted below |
| 6 | API documentation and usage guide | `02-api-guide.md` | Ready |
| 7 | Testing methodology and results | `04-test-report.md` | Local results ready; section 5 of it is **YOU** |
| 8 | Deployment and environment | `01-steps.md` (steps 15 to 21), screenshots | **YOU** (after deployment) |
| 9 | Challenges and solutions | below: two real defects are documented; add the real Neon and Vercel problems you meet | **YOU** |
| 10 | Technical evaluation and limitations | facts below | **YOU** (opinion) |
| 11 | Conclusion and reflection | six questions in the assignment | **YOU** |
| 12 | References | Part II Phases 1 to 3 list, plus the items below | Extend |
| 13 | Appendices | screenshots, `evidence/pytest-local-run.txt`, code excerpts | Collect |

## Facts for section 4 (update to what was built)

- Modules: `api/index.py` (routes, error handlers), `api/auth.py` (callers, tokens, partner keys),
  `api/db.py` (all SQL), `api/models.py` (request validation), `api/config.py` (environment variables, local `.env`).
- Scripts (run on your computer, not on Vercel): `scripts/import_asteroids.py`, `scripts/create_user.py`,
  `scripts/check_connection.py`, `scripts/verify_deployment.py`.
- One change from the design: the API version is now 2.0, and responses include `is_featured`, `created_by`,
  `created_at`, `updated_at` besides the original fields, plus `access` on lists.

## Facts for section 5

**5.1 Database configuration.** Neon project AegisNEO, branch `production`, database `neondb`. The schema was run as
`neondb_owner` (creates the `pg_trgm` extension, two tables, constraints, five indexes besides the keys, and grants).
The API connects as `aegis_app` through the pooled connection string with TLS required. `scripts/check_connection.py`
prints role, TLS state, row counts and the refused operations.

**5.2 Dependencies** (`requirements.txt`, versions pinned):

| Package | Purpose |
| --- | --- |
| fastapi 0.141.1, uvicorn 0.47.0, pydantic 2.13.4 | web framework, local server, validation (unchanged from before) |
| psycopg[binary] 3.3.8 | PostgreSQL driver with the C library included |
| PyJWT 2.15.1 | sign and verify login tokens |
| bcrypt 5.0.0 | hash and check passwords |
| python-multipart 0.0.33 | read the login form (required by FastAPI for form data) |
| pytest 9.2.0, httpx 0.28.1 (`requirements-dev.txt`) | tests only |

**5.3 Database integration (what replaced what).**
- The JSON file read at start-up, the in-memory list and dictionary, the Python loops and `statistics.median` were
  replaced by SQL in `api/db.py`: `WHERE` for filters, `ORDER BY ... LIMIT/OFFSET` for sorting and paging,
  `count(*) over ()` for the number of matches in the same query, `order by random()` for random picks,
  `percentile_cont(0.5)` for medians, `pg_trgm` for text search.
- Each request opens one connection and one transaction; values are always query parameters;
  `prepare_threshold=None` because the Neon pooler can send consecutive statements to different sessions;
  `connect_timeout=10` so an outage answers 503 quickly.
- `data/asteroids.json` is no longer read by the API; it is only used once by the import script.
- Excerpts worth showing: `build_filters` (parameters, no string pasting), `update_asteroid` (only submitted
  columns), `_check_featured_room` (advisory lock), `connection()` (error mapping), `get_caller` (guest, user, partner).

**5.4 Endpoint implementation table:** `02-api-guide.md`, table "Endpoints", with the database operation column:
list = SELECT with filters; random = SELECT ... ORDER BY random(); one = SELECT by primary key; create = INSERT ...
RETURNING; update = UPDATE of the submitted columns ... RETURNING; delete = DELETE ... RETURNING; stats = aggregate
SELECT; login = SELECT from `users`.

**5.5 Validation and error handling:** `03-security-and-reliability.md` sections 1 and 2, and the valid and invalid
examples in `02-api-guide.md`.

**5.6 Security and credentials:** `03-security-and-reliability.md` sections 3 to 5.

## Facts for section 9 (documented defects, both real)

1. NaN returned 500 instead of 422 (cause: the validation error repeated the rejected value, and NaN cannot be
   written as JSON; diagnosis: the test `test_nan_and_infinity_are_rejected` failed with 500; fix: error bodies
   never repeat submitted values; result: the test passes, and a login test confirms passwords are never echoed).
2. Search more than 100 times slower than needed (cause: `name ILIKE ... OR neo_reference_id ILIKE ...` cannot use the trigram
   index; diagnosis: `EXPLAIN ANALYZE` showed a sequential scan, 26 ms against 0.2 ms; fix: add the ID condition only
   when the search text is all digits; result: the plan uses `asteroids_name_trgm_idx` and the whole request takes
   a median of 9 ms).

Add anything that actually goes wrong on Neon or Vercel (do not invent problems; the assignment says to describe
the verification steps instead if there were none).

## Facts for section 10

- Supports the API well: relational data with fixed fields, constraints enforced in the database, indexes for each
  filter, SQL aggregates for the statistics.
- Free plan (limits from your Part I, re-check them on the day you write): 1 GB storage, 100 CU-hours per month,
  compute suspends after 5 minutes idle. Measure the real size of the database in the Neon console (33,511 rows).
- Behavior of idle compute: first request after more than 5 minutes is slower (step 21).
- Limits of the implementation: token cannot be revoked, no login rate limit in code, featured limit checked by the
  API, CORS open, no pagination cursor (offset paging), default sort by ID, dates in the data are generated.
- If there were more users or records: a rate limit, token revocation or refresh tokens, keyset paging for large
  offsets, read replicas or caching of `/stats`, a migration tool instead of a single schema file, backups beyond
  Neon's 6-hour restore window.

## Extra references to cite

- Neon documentation: connection pooling, roles and database access (already in your list).
- Psycopg 3 documentation: passing parameters; connection and transaction behavior.
- PostgreSQL 18 documentation: `pg_trgm`, advisory locks, `percentile_cont`, error codes (23505).
- FastAPI documentation: OAuth2 with password and Bearer tokens (JWT); handling errors.
- PyJWT and bcrypt documentation; OWASP Password Storage and Authentication cheat sheets (already in your list).
- Vercel documentation: environment variables, function regions, Firewall rate limiting.
