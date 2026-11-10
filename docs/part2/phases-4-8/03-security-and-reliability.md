# Security and reliability assessment (Phase 6)

This explains what the implemented API validates, how it reacts to failures, how callers are identified and
how credentials are kept. Every item names the place in the code and, where there is one, the test that proves it
(test names refer to `evidence/pytest-local-run.txt`).

## 1. Data validation

Validation happens twice, so a mistake in one place cannot store bad data.

| Layer | Where | What it does |
| --- | --- | --- |
| API | `api/models.py` (`AsteroidCreate`, `AsteroidUpdate`) | Types and ranges are checked before any SQL runs. Numbers and booleans must be real JSON numbers and booleans (`"0.5"`, `1` and `"yes"` are rejected). NaN and Infinity are rejected. Unknown fields, including `created_by` and `created_at`, are rejected. `name` is trimmed. |
| Database | `db/schema.sql` (CHECK, NOT NULL, UNIQUE, PRIMARY KEY, FOREIGN KEY) | The same limits as constraints. Even a request that bypassed the API could not store a diameter of 0, a negative speed, a date outside 1900 to 2200, a non-numeric ID or a blank name. |

| Field | Rule |
| --- | --- |
| `neo_reference_id` | 1 to 10 digits, unique, fixed after creation |
| `name` | 1 to 100 characters after trimming, unique ignoring case (`lower(name)` unique index) |
| `estimated_diameter_km` | greater than 0, at most 1000 |
| `is_potentially_hazardous`, `is_featured` | boolean |
| `close_approach_date` | valid date from 1900-01-01 to 2200-12-31 |
| `relative_velocity_km_h` | 0 to 1,000,000 |
| `miss_distance_km` | 0 to 1,000,000,000 |
| `absolute_magnitude` | 0 to 40 |
| Featured | at most 10 asteroids. A CHECK constraint cannot count rows, so the API counts inside the transaction, holding a PostgreSQL advisory lock so two requests cannot both take the last place. |
| Partial update | at least one field; `null` is not accepted for a field; `neo_reference_id` cannot be sent. Only submitted fields appear in the `UPDATE`, so nothing else is overwritten. |
| Search text | LIKE wildcards (`%`, `_`) are escaped, so they are matched literally. |
| Query parameters | limit 1 to 100, offset 0 or more, `sort` from a fixed list, `min_diameter` not above `max_diameter`, `from_date` not after `to_date`. |

Tests: `test_missing_required_field_is_422` (7 cases), `test_invalid_values_are_422` (20 cases),
`test_nan_and_infinity_are_rejected`, `test_unknown_and_server_managed_fields_are_rejected`,
`test_update_rejects_bad_requests`, `test_the_database_constraints_hold_without_the_api`,
`test_search_treats_wildcards_literally`, `test_invalid_query_parameters_are_422`.

## 2. Error handling

| Problem | Status | How it is detected |
| --- | --- | --- |
| Record not found | 404 | `UPDATE`/`DELETE ... RETURNING` or `SELECT` returns no row. IDs that are not 1 to 10 digits are also 404 and never reach the database. |
| Invalid body, missing field, wrong type or range | 422 | Pydantic; the response names each field and the reason, and never repeats the submitted value (it could be a password) |
| Malformed JSON | 400 | Pydantic error type `json_invalid` is turned into one clear message |
| Duplicate ID or name | 409 | PostgreSQL error 23505; the constraint name tells which field |
| More than 10 featured | 409 | Counted by the API under the lock |
| Unauthorized | 401 / 403 | `api/auth.py` (section 3) |
| Database unreachable or connection lost | 503 | `psycopg.OperationalError` and `InterfaceError`; connect timeout is 10 seconds so the function answers quickly instead of hanging; a missing `DATABASE_URL` is the same 503 |
| Other database failure | 500 | any other `psycopg.Error`; generic message |
| Anything unexpected | 500 | catch-all handler; generic message |

Every write is one transaction: it commits when the function succeeds and rolls back on any error, so a failed
request changes nothing (`test_a_failed_write_changes_nothing`). Details of a failure (SQL text, driver message,
host, stack trace) are written only to the server log. Tests that prove nothing leaks:
`test_database_outage_is_503_without_details` (checks the password and host are absent from the response),
`test_unexpected_errors_return_a_generic_500`, `test_database_errors_return_a_generic_500`,
`test_missing_jwt_secret_does_not_leak_or_crash`.

## 3. Authentication and authorization

- **Users** log in with `POST /api/v1/auth/login`. The password is checked against a bcrypt hash (cost 12) in the
  `users` table; the password itself is never stored. On success the API signs a JSON Web Token (HS256) with
  `JWT_SECRET`, containing the user id, username, issue time and an expiry 60 minutes later. The secret must be at
  least 32 characters or login answers 503.
- **A failed login always returns the same message** (`"Incorrect username or password."`), and an unknown
  username runs a dummy bcrypt check, so neither the message nor the response time reveals whether an account exists
  (`test_wrong_password_and_unknown_user_look_the_same`). Passwords are limited to 72 bytes, the bcrypt limit.
- **Partner sites** (Impactor, NEO Atlas) send `x-api-key`. The key is compared with every configured key in
  constant time (`hmac.compare_digest`). These keys can read everything but never change data (403).
- **Guests** send nothing and see only the 10 featured asteroids.
- **Invalid credentials are never downgraded to guest:** a bad or expired token, a token without an expiry, a token
  signed with another secret, and a wrong partner key all return 401 (tests in `test_security.py`).

| Operation | Guest | User | Partner |
| --- | --- | --- | --- |
| Home, health, login | yes | yes | yes |
| `auth/me` | 401 | yes | 401 |
| List, random, one asteroid | featured only | all | all |
| Statistics | 401 | yes | yes |
| Create, update, delete | 401 | yes | 403 |

The database credentials are never used as a substitute for user login: users authenticate to the API, and only the
API holds the database connection.

## 4. Database access

- The API connects as `aegis_app`, which can `SELECT/INSERT/UPDATE/DELETE` on `asteroids` and only `SELECT` on
  `users`. It cannot create, alter or drop tables, create accounts or change a password hash
  (`test_the_api_role_cannot_change_the_structure_or_accounts`; `scripts/check_connection.py` shows the same
  against Neon).
- The owner role `neondb_owner` is used only by the setup scripts on the developer's computer and is never stored on Vercel.
- Connections use TLS (`sslmode=require`, `channel_binding=require`) through the Neon pooler. Neon's optional Data
  API is not enabled, so there is no second, public way into the database.
- All values reach the database as query parameters. The few pieces of SQL that vary (column to sort by, the columns
  of an update) come from fixed lists in the code, never from the request. Injection attempts return normal
  results or errors and leave the data unchanged (`test_sql_injection_attempts_are_harmless`).

## 5. Credential and configuration management

| Check | Result |
| --- | --- |
| No secrets in the code | Settings come from environment variables (`api/config.py`). The hardcoded demo key and the website key were removed from the code. `test_retired_keys_are_no_longer_accepted` checks the demo key is refused. |
| Variables on the host | `DATABASE_URL`, `JWT_SECRET`, `AEGISNEO_API_KEYS` are set in Vercel (Production and Preview). |
| Local secrets out of git | `.env` and `.env.*` are in `.gitignore`; `.env.example` holds names and placeholders only. |
| Error messages | contain no connection string, host or password (tests above). |
| Old public keys | The demo key and the website key stay visible in the git history, so removing them from the code is not enough. The `aegisneo-web` entry has to be deleted from `AEGISNEO_API_KEYS` on Vercel so the key stops working (step 15 in `01-steps.md`). |

## 6. Known limitations

- A token cannot be cancelled before it expires; logging out only removes it from the browser. The 60-minute expiry
  limits the risk.
- The API itself does not limit login attempts. A Vercel Firewall rate-limit rule on `/api/v1/auth/login` is the
  planned control (step 22 in `01-steps.md`).
- The website keeps its token in `sessionStorage`, which any script running on the same page could read. The page
  loads no third-party scripts (only Google Fonts as a stylesheet), and the token disappears when the tab closes.
- CORS allows any origin (`*`) because the public website and tools call the API from the browser. This is safe
  here because no cookies are used and every protected request needs a token or key in a header.
- A guest who requests an ID that exists but is not featured gets 401, while an ID that does not exist gets 404, so
  a guest can tell whether an ID exists. The catalog is public NASA data, so this is accepted.
- The limit of 10 featured asteroids is enforced by the API, not by a database constraint.
