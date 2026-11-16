# Steps to finish Part II (Phases 4 to 8)

The code is written and tested on a local PostgreSQL. What is left is to set up the real Neon database, deploy,
and collect the evidence for the report. Do the steps in order. Each step says what you should see and which
screenshot to take (save them under `docs/part2/screenshots/`, next to your Phase 1 shots).

## A. Prepare your computer (10 minutes)

1. Get the branch and install the packages (Python 3.12 or newer):
   ```bash
   git fetch origin
   git checkout part2-neon
   pip install -r requirements.txt
   ```
2. Copy `.env.example` to `.env` (the file is git-ignored) and fill it in:

   | Variable | Where to get it |
   | --- | --- |
   | `DATABASE_OWNER_URL` | Neon Console > project AegisNEO > **Connect** > role `neondb_owner`. Turn **Connection pooling off** (direct string). Used only by the setup scripts. |
   | `DATABASE_URL` | Same dialog, role `aegis_app`, **Connection pooling on** (host contains `-pooler`). If you do not remember its password: Roles > `aegis_app` > Reset password, and copy the new string. |
   | `JWT_SECRET` | Run `python -c "import secrets; print(secrets.token_hex(32))"` and paste the result. |
   | `AEGISNEO_API_KEYS` | For local runs: `impactor:test1,neo-atlas:test2` (the real keys stay in Vercel). |

## B. Phase 4: set up the Neon database

3. **Drop the Part I test table.** Neon Console > **SQL Editor** (branch `production`, database `neondb`, you are
   the owner). Run:
   ```sql
   drop table if exists public.asteroids;
   ```
4. **Create the structure.** Open `db/schema.sql`, paste the whole file into the SQL Editor and run it.
   You should see success with no errors. Then open **Tables** in the console.
   > Screenshot `phase4/neon-tables.png`: the Tables page showing `asteroids` and `users`.
   > Screenshot `phase4/neon-asteroids-columns.png`: the `asteroids` table with its columns and indexes.
5. **Import the 33,511 records.**
   ```bash
   python scripts/import_asteroids.py
   ```
   Expected last line: `Done. The table now holds 33511 asteroids, 10 featured.`
   > Screenshot `phase4/import.png`: the terminal.
6. **Create login accounts** (you will be asked for a password; at least 8 characters). Make one for yourself and
   one for the demo or your instructor:
   ```bash
   python scripts/create_user.py yourname
   python scripts/create_user.py demo
   ```
   Expected: `Account 'yourname' created.`
   > Screenshot `phase4/create-user.png` (do not show the password).
7. **Prove the API connection.**
   ```bash
   python scripts/check_connection.py
   ```
   Expected: `Connected : yes (PostgreSQL 18...)`, `Role : aegis_app`, `TLS : encrypted`,
   `asteroids : 33511 rows (10 featured)`, and `4 of 4 forbidden operations refused.`
   > Screenshot `phase4/check-connection.png`: this is the Phase 4 evidence (connection, role, first query,
   > data retrieval). It never prints the password.
8. **Check the query plans** (Phase 2 promised this). In the SQL Editor run each line separately and screenshot
   the results of at least the first three:
   ```sql
   explain select neo_reference_id from asteroids where neo_reference_id = '2099942';
   explain select neo_reference_id from asteroids where name ilike '%apophis%';
   explain select neo_reference_id from asteroids where estimated_diameter_km >= 1 order by estimated_diameter_km desc limit 3;
   explain select neo_reference_id from asteroids where close_approach_date between '2000-01-01' and '2000-12-31';
   explain select neo_reference_id from asteroids where is_featured order by name limit 10;
   ```
   Expected: each plan mentions an index (`asteroids_pkey`, `asteroids_name_trgm_idx`, `asteroids_diameter_idx`,
   `asteroids_date_idx`, `asteroids_featured_idx`) instead of a plain `Seq Scan`.
   > Screenshot `phase4/explain.png`.
9. **Run the API on your computer against Neon.**
   ```bash
   python -m uvicorn api.index:app --port 8000
   ```
   Open http://127.0.0.1:8000/docs, click **Authorize**, log in with your account, and try
   `GET /api/v1/asteroids`. Also open http://127.0.0.1:8000/health (it should say `"database": "ok"`).
   > Screenshots `phase5/swagger-authorized.png` and `phase5/health-local.png`.

## C. Phase 5 and 6: show the operations working (manual, for the demo and the report)

In Swagger (`/docs`, logged in), do each of these and take a screenshot of the request and response, and of the
Neon **Tables** view showing the change:

10. `POST /api/v1/asteroids` with the sample body from `02-api-guide.md` (id `9000001`). Expect **201**. In Neon > Tables > `asteroids`, search for `9000001`: the row is there with your user number in `created_by`.
11. `PATCH /api/v1/asteroids/9000001` with `{"estimated_diameter_km": 0.31}`. Expect **200**. Refresh Neon: only that value and `updated_at` changed.
12. `GET /api/v1/asteroids?search=Demo Rock` shows it (search and filter).
13. `DELETE /api/v1/asteroids/9000001`. Expect **200**; refresh Neon: the row is gone; `GET` returns **404**.
14. Error cases: log out in Swagger and try `POST` (**401**); send the body `{oops` (**400**); send `"estimated_diameter_km": "big"` (**422**); post `9000001` twice (**409**).
    > Screenshots `phase5/` and `phase6/`, one per case. Responses to compare with are in `02-api-guide.md`.

## D. Deploy (Phase 7)

15. **Vercel environment variables.** Vercel > project `aegisneo-api` > Settings > Environment Variables. Add
    for **Production and Preview** (mark them Sensitive):
    - `DATABASE_URL` = the pooled `aegis_app` string
    - `JWT_SECRET` = a new random value (same command as step 2; do not reuse your local one)

    Then edit `AEGISNEO_API_KEYS`: **delete the `aegisneo-web:...` entry** and keep `impactor:...,neo-atlas:...`.
    The website key was public in the old code and in git history, so it must not stay valid (it would now give
    read access to everything). The Impactor and NEO Atlas keys were never in git; leave them as they are, so
    those sites keep working without any change.
    > Screenshot `phase7/vercel-env.png` with the values hidden (names only).
16. **Push already done: test on a preview first.** Vercel builds a preview for the `part2-neon` branch (see the
    Deployments tab). Open its `/health`. If Vercel shows a login page instead, Deployment Protection is on for
    previews: either turn it off for this project for now, or skip to step 17.
    ```bash
    python scripts/verify_deployment.py https://<preview-url> yourname
    ```
17. **Merge to master** (GitHub: open a pull request from `part2-neon` into `master` and merge it). Vercel deploys
    production. Wait until the deployment is Ready.
    > Screenshot `phase7/vercel-deployment.png`.
18. **Run the full checklist on production.**
    ```bash
    python scripts/verify_deployment.py https://aegisneo-api.vercel.app yourname
    ```
    Expect `12 of 12 checks passed.` (steps 1 and 3 to 9 of the Phase 7 list).
    > Screenshot `phase7/verify-deployed.png`.
19. **Redeploy and prove persistence (Phase 7, check 10).** Vercel > Deployments > the latest one > ... >
    **Redeploy**. When it is Ready:
    ```bash
    python scripts/verify_deployment.py https://aegisneo-api.vercel.app yourname --after-redeploy
    ```
    Expect `5 of 5 checks passed.` and the 33,511 records still there.
    > Screenshot `phase7/verify-after-redeploy.png`.
20. **Check the other sites.** Open https://aegisneo-api.vercel.app/frontend/ (log in, then log out and try
    Continue as guest: 10 cards), then Impactor and NEO Atlas: both should still load asteroids.
    > Screenshots `phase7/website-login.png`, `phase7/website-guest.png`, `phase7/website-loggedin.png`.
    If a companion site shows an error, its key is probably missing from `AEGISNEO_API_KEYS`; compare it with
    that site's `AEGISNEO_API_KEY`.
21. **Cold start (optional evidence).** Leave the database untouched for more than 5 minutes (Neon suspends
    compute), then time the first request: `curl -s -o /dev/null -w "%{time_total}\n" https://aegisneo-api.vercel.app/health`.
    Part I measured about 1 second; run it again straight after and note the difference.

## E. Phase 6 follow-up: login rate limit (evaluate)

22. Vercel > project > **Firewall** > Add rule: path equals `/api/v1/auth/login`, method POST, action **Rate limit**
    (for example 10 requests per minute per IP). Write down what you chose, or why you decided against it. The
    design already says this is evaluated in Phase 6.

## F. Phase 8 and the report

23. The local test run is already recorded (`evidence/pytest-local-run.txt`, 97 passed). Fill in the "deployed"
    columns in `04-test-report.md` with what you saw in steps 10 to 19.
24. Write the report from `05-report-outline.md`. The sections marked **YOU** (challenges you met on Neon and
    Vercel, and the reflection) have to come from your own experience, so they are left empty on purpose.
25. Demo checklist (the instructor will ask for all of these): create, read, update, delete, search, a rejected
    invalid request, an unauthorized request, and data still there after a redeploy. Run
    `python scripts/verify_deployment.py ...` once beforehand so Neon is awake, and keep Swagger open and logged in.

## If something goes wrong

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `/health` returns 503 on Vercel | `DATABASE_URL` missing or wrong in that environment (Production vs Preview) | Re-check the variable's environments, then redeploy |
| Login returns 503 | `JWT_SECRET` missing or shorter than 32 characters | Set it, redeploy |
| `permission denied` in the import | You used the `aegis_app` string instead of the owner string | Use `DATABASE_OWNER_URL` |
| `password authentication failed` | Old password after the Neon reset | Copy a fresh string from the Connect dialog |
| Impactor or NEO Atlas shows 401 | Their key is not in `AEGISNEO_API_KEYS`, or the format is not `client:key,client:key` | Fix the variable and redeploy the API |
| First request is slow (about 1 s) | Neon compute was suspended | Normal on the Free plan |
