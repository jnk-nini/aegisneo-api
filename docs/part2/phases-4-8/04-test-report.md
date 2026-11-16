# Test report (Phase 8)

## 1. How the application was tested

| Item | Detail |
| --- | --- |
| Tools | `pytest` 9.2 with FastAPI's `TestClient` (real HTTP handling, real database); `curl`; a browser (Playwright) for the website; `scripts/verify_deployment.py` for the deployed API |
| Database in the automated tests | PostgreSQL 16.15 on the developer machine. The tests create a fresh database from `db/schema.sql` and connect as the limited role `aegis_app`, like the deployed API. A second, owner connection reads the tables directly, so the tests check what is **stored**, not only what the API answers. |
| Safety | The test setup refuses to run unless `TEST_DATABASE_URL` points at localhost, so the tests can never touch Neon. |
| Test data | 14 real records from the catalog (the 10 featured asteroids plus 4 others) and two accounts; the data is reset before every test. |
| Result | **97 tests, 97 passed** (`evidence/pytest-local-run.txt`): read 17, write 11, validation 35, security 25, reliability 9. |
| Also run | A full run with the real 33,511 records on the local database (section 3), and the website in a real browser (section 4). |
| Deployed environment | Neon (PostgreSQL 18) and Vercel: section 5, to be completed after deployment. |

The tests were also checked for being able to fail: with the guest restriction, the partner read-only rule or token
expiry deliberately broken, 3, 3 and 2 tests failed; with the code restored all 97 passed again.

## 2. Results matrix (automated tests, local PostgreSQL)

Evidence names are test functions in `tests/` (see `evidence/pytest-local-run.txt` for each result).

### Functional

| ID | Description | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| F-01 | Create an asteroid as a logged-in user | 201; the body is the stored record; `created_by` is the user; the row is in the table | As expected | Pass | `test_create_returns_201_and_the_stored_record` |
| F-02 | Retrieve all records as a user | 200; `access` is `full`; all 14 rows | As expected | Pass | `test_user_list_shows_everything` |
| F-03 | Retrieve one record | 200 with the record; fields keep the original names and number types | As expected | Pass | `test_get_one_asteroid`, `test_response_keeps_the_original_fields` |
| F-04 | Update one field | 200; only that field and `updated_at` change; the database row has the new value | As expected | Pass | `test_update_changes_only_submitted_fields` |
| F-05 | Delete a record | 200; later `GET` returns 404; the row is gone from the table | As expected | Pass | `test_delete_then_it_is_gone` |
| F-06 | Search by name, case-insensitive | `search=apophis` returns exactly Apophis | As expected | Pass | `test_search_by_name_is_case_insensitive` |
| F-07 | Search by ID | `search=2162117` returns that asteroid | As expected | Pass | `test_search_by_id` |
| F-08 | Filter by hazard and diameter, sorted | Every row matches both filters and the order is descending | As expected | Pass | `test_hazard_and_diameter_filters_with_sorting` |
| F-09 | Filter by date range | Every row is inside the range | As expected | Pass | `test_date_range_filter` |
| F-10 | Paging | Pages do not overlap; `matched` stays the same; a page past the end is empty | As expected | Pass | `test_paging` |
| F-11 | Random asteroids | A guest only gets featured ones; a user can get any | As expected | Pass | `test_random_respects_access_and_count` |
| F-12 | Statistics | Total, hazard count, maximum diameter and first date equal the values computed from the data | As expected | Pass | `test_stats_come_from_sql_aggregates` |
| F-13 | Featured limit | The 11th featured asteroid (create or update) returns 409; after freeing a place the same request succeeds | As expected | Pass | `test_featured_limit_is_ten`, `test_featuring_an_eleventh_by_update_is_409` |

### Validation

| ID | Description | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| V-01 | Each required field missing (7 cases) | 422 naming the field; nothing stored | As expected | Pass | `test_missing_required_field_is_422` |
| V-02 | Wrong types, text as number, number as text, `"yes"` or `1` as boolean | 422; nothing stored | As expected | Pass | `test_invalid_values_are_422` (20 cases) |
| V-03 | Values out of range (diameter 0 or 1000.5, speed -1, magnitude 41, dates before 1900 or after 2200) | 422 | As expected | Pass | same |
| V-04 | Bad ID (letters, 11 digits) and bad name (empty, blanks, 101 characters, null) | 422 | As expected | Pass | same |
| V-05 | NaN and Infinity | 422 | As expected (found a defect during testing, section 6) | Pass | `test_nan_and_infinity_are_rejected` |
| V-06 | Fields the server controls (`created_by`, `created_at`) or unknown fields | 422 | As expected | Pass | `test_unknown_and_server_managed_fields_are_rejected` |
| V-07 | Empty body, no body | 422 | As expected | Pass | `test_empty_body_is_422` |
| V-08 | Malformed JSON | 400 with a clear message | As expected | Pass | `test_malformed_json_is_400` |
| V-09 | Duplicate ID | 409 naming `neo_reference_id` | As expected | Pass | `test_duplicate_id_is_409` |
| V-10 | Duplicate name, ignoring case; update to an existing name | 409 | As expected | Pass | `test_duplicate_name_ignores_case_and_is_409`, `test_update_to_a_duplicate_name_is_409` |
| V-11 | Bad updates: empty, `null`, changing the ID, wrong type | 422 | As expected | Pass | `test_update_rejects_bad_requests` |
| V-12 | Bad query parameters (min above max, text as number, `limit=1000`, unknown sort, reversed dates) | 422 | As expected | Pass | `test_invalid_query_parameters_are_422` |
| V-13 | Record that does not exist (get, update, delete, malformed ID) | 404 | As expected | Pass | `test_missing_asteroid_is_404`, `test_update_missing_asteroid_is_404`, `test_delete_missing_asteroid_is_404` |

### Security

| ID | Description | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| S-01 | Create, update and delete without credentials (3 requests) | 401; table unchanged | As expected | Pass | `test_writes_without_credentials_are_401` |
| S-02 | Create, update and delete with a partner key (3 requests) | 403; table unchanged | As expected | Pass | `test_writes_with_a_partner_key_are_403` |
| S-03 | Wrong password and unknown user | Both 401 with identical bodies | As expected | Pass | `test_wrong_password_and_unknown_user_look_the_same` |
| S-04 | Wrong partner key; the two retired keys | 401 | As expected | Pass | `test_wrong_partner_key_is_401`, `test_retired_keys_are_no_longer_accepted` |
| S-05 | Garbage token, token signed with another secret, expired token, token with no expiry | 401 each (not treated as guest) | As expected | Pass | `test_invalid_token_is_401_not_guest` and 3 more |
| S-06 | Guest reads the list and one non-featured asteroid | List shows only the 10 featured; the other asteroid returns 401 | As expected | Pass | `test_guest_list_shows_only_featured`, `test_a_guest_cannot_read_a_non_featured_asteroid` |
| S-07 | Statistics without credentials | 401 | As expected | Pass | `test_stats_need_login_or_a_partner_key` |
| S-08 | SQL injection in search, in the ID path and in the username | Normal answers; data unchanged | As expected | Pass | `test_sql_injection_attempts_are_harmless`, `test_login_is_not_injectable` |
| S-09 | Password hashes and passwords in responses | Never present, including in validation errors | As expected | Pass | `test_password_hashes_are_never_returned`, `test_validation_errors_never_echo_the_password` |
| S-10 | Database role limits | `aegis_app` cannot drop, create or alter tables, insert or change users | 6 of 6 refused | Pass | `test_the_api_role_cannot_change_the_structure_or_accounts` |
| S-11 | Token of a deleted user tries to create | 401 | As expected | Pass | `test_token_of_a_deleted_user_cannot_create` |

### Persistence and integration

| ID | Description | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| P-01 | Created record stays in the table and comes back identical from another endpoint | Same JSON from `POST` and `GET`; row present in a direct query | As expected | Pass | `test_create_returns_201_and_the_stored_record` |
| P-02 | Updated record keeps its changes; other fields untouched | Direct query shows the new value | As expected | Pass | `test_update_changes_only_submitted_fields` |
| P-03 | Deleted record stays deleted | `GET` 404, direct query finds nothing, total back to 14 | As expected | Pass | `test_delete_then_it_is_gone` |
| I-01 | New record is found by search | `search=Test Rock` matches 1 | As expected | Pass | `test_a_new_asteroid_can_be_found_by_search` |
| I-02 | Statistics follow changes made while the API runs (the old version computed them once at start-up) | Total goes 14 to 15 after a create | As expected | Pass | `test_stats_reflect_changes_made_while_running` |
| I-03 | Changing which asteroid is featured changes what guests see | The newly featured asteroid appears for a guest; the removed one disappears | As expected | Pass | `test_new_featured_asteroid_becomes_visible_to_guests` |
| I-04 | A failed write changes nothing | Duplicate create leaves 14 rows | As expected | Pass | `test_a_failed_write_changes_nothing` |

### Reliability

| ID | Description | Expected | Actual | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| R-01 | Database unreachable (nothing listens on the port) on `/health`, `/` and the list | 503 with a fixed message; no password or host in the body | As expected | Pass | `test_database_outage_is_503_without_details` |
| R-02 | Login while the database is down; `DATABASE_URL` not set | 503 | As expected | Pass | `test_login_during_an_outage_is_503`, `test_missing_database_url_is_503` |
| R-03 | `JWT_SECRET` missing or short | 503; the value is not echoed | As expected | Pass | `test_missing_jwt_secret_does_not_leak_or_crash` |
| R-04 | Unexpected exception; database privilege error | 500 with a generic message | As expected | Pass | `test_unexpected_errors_return_a_generic_500`, `test_database_errors_return_a_generic_500` |
| R-05 | The database refuses bad rows on its own (6 bad inserts straight into the table) | Every one rejected by a constraint | As expected | Pass | `test_the_database_constraints_hold_without_the_api` |

## 3. Run with the real data (local database, live server)

The API was started against a local database holding all 33,511 records (imported with
`scripts/import_asteroids.py`), and queried with `curl`:

| Check | Result |
| --- | --- |
| Import | 33,511 records validated and imported, 10 featured; running it again changes nothing |
| Statistics | `total` 33,511, `potentially_hazardous` 2,493, diameter 0.0008 / 60.7495 / median 0.0783, speed median 47,145.341, miss distance median 35,229,281.508, dates 1910-01-01 to 2024-12-29: identical to the Phase 1 results of the old API |
| Filter `hazardous=true&min_diameter=1&sort=diameter&order=desc&limit=3` | 219 matches, Florence 6.5094 km and Cuno 6.3029 km first: identical to Phase 1 |
| Guest, user, partner | 10, 33,511 and 33,511 asteroids |
| Create, update, delete | 201, 200, 200; a restart of the server (with a new `JWT_SECRET`) kept the data; the old token was rejected with 401 |
| Query plans (`EXPLAIN`) | Primary-key, trigram, diameter, date and featured indexes were used for the five main queries |
| Request time (local, warm) | median 9 ms for a search, 6 ms for one asteroid, 31 to 36 ms for the full list and the statistics (30 requests each) |

## 4. Website (real browser, 31 checks, all passed)

First visit shows the login box and sends no API request; a wrong password shows an error; a correct login loads
100 cards and shows 33,511; the detail panel opens; no `x-api-key` header is sent by the website; all asteroid
requests carry `Authorization: Bearer`; the token is in `sessionStorage` only; reload keeps the session; log out
removes the token and the catalog from the page; "Continue as guest" shows exactly 10 cards and sends no
credentials; an expired token shows the login box with a message; the phone layout (390 px wide) fits without
horizontal scroll and uses 16 px inputs; the console showed no errors.

## 5. Deployed environment (Neon and Vercel): fill in after deployment

Run `python scripts/verify_deployment.py https://aegisneo-api.vercel.app <user>` and the steps in `01-steps.md`.

| ID | Description | Expected | Actual | Status | Evidence (screenshot) |
| --- | --- | --- | --- | --- | --- |
| D-01 | `/health` on the deployed API | 200, `"database": "ok"` | | | |
| D-02 | Connection check as `aegis_app` | TLS encrypted; 33,511 rows; 4 of 4 forbidden operations refused | | | `phase4/check-connection.png` |
| D-03 | Retrieve existing records | 33,511 for a user, 10 for a guest | | | |
| D-04 | Create through the deployed API, then see the row in the Neon console | 201; row visible in Neon | | | |
| D-05 | Update, then see the change in Neon | 200; value changed in Neon | | | |
| D-06 | Delete, then confirm in Neon | 200; row gone; `GET` 404 | | | |
| D-07 | `verify_deployment.py` full run | 12 of 12 checks passed | | | `phase7/verify-deployed.png` |
| D-08 | Redeploy, then `--after-redeploy` | 5 of 5 passed; 33,511 records still present; the test record still deleted | | | `phase7/verify-after-redeploy.png` |
| D-09 | Unauthorized request to the deployed API (no token on `POST`; partner key on `DELETE`) | 401; 403 | | | |
| D-10 | Invalid input to the deployed API | 422 / 400 / 409 | | | |
| D-11 | Website: login, guest, logout on the deployed site | as in section 4 | | | `phase7/website-*.png` |
| D-12 | Impactor and NEO Atlas still load data after the change | Both work with their partner key | | | |
| D-13 | First request after more than 5 idle minutes | Slower (about 1 s in Part I); the next one fast | | | |

## 6. Defects found by the tests (and fixed)

1. **NaN in a request body returned 500 instead of 422.** The validation error echoed the rejected value, and
   NaN cannot be written as JSON. Fix: the 422 response lists the field and the reason but not the submitted value
   (this also stops a mistyped login request from echoing a password). Checked by `test_nan_and_infinity_are_rejected`
   and `test_validation_errors_never_echo_the_password`.
2. **Searching was more than 100 times slower than it should be** (26 ms against 0.2 ms in the database on the real data). Searching
   "name or ID" in one condition stopped PostgreSQL from using the trigram index on `name`. Fix: the ID is only
   searched when the text is all digits. Found with `EXPLAIN ANALYZE`; checked by `test_text_search_does_not_look_at_ids`
   and by timing the live server again (median 9 ms for the whole request).
