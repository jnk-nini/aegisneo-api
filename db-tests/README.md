# Cloud Database Investigation: test scripts

Scripts used for Part I of the Cloud Database Investigation (Neon, Supabase and
Firebase Cloud Firestore). They use the same 5 asteroid records from the live API
(`sample_records.py`).

| Script | Phase | What it does |
|---|---|---|
| `pg_tasks.py` | 2 | Tasks 1–6 on a PostgreSQL database (Neon, Supabase) with `psycopg` |
| `test_postgres.py` | 3 | Connects as the limited role `aegis_app` and checks TLS, role rights, CRUD, invalid input, unauthorized requests and persistence |
| `test_supabase_api.py` | 3 | What the public (publishable) Supabase key can do through the Data API (Row Level Security) |
| `firestore_tasks.py` | 2 | Tasks 1–6 on Cloud Firestore with the Firebase Admin SDK |
| `test_firestore.py` | 3 | Same checks for Firestore (service account, Security Rules, invalid input, persistence) |
| `firebase_setup.sh` | 2, 3 | Run in Google Cloud Shell: creates Firestore (Singapore), production-mode rules, the `aegis-api` service account, then runs both Firestore scripts |

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # then fill in the values; .env is ignored by git
```

## Running

```bash
# Neon (owner connection for the tasks, limited role for Phase 3)
python pg_tasks.py --url-env NEON_DATABASE_URL --service Neon --tasks 1-6
python test_postgres.py --url-env NEON_APP_URL --service Neon

# Supabase
python test_postgres.py --url-env SUPABASE_APP_URL --service Supabase
python test_supabase_api.py

# Firestore (Google Cloud Shell)
bash firebase_setup.sh YOUR_FIREBASE_PROJECT_ID
```

## Security

- Connection strings, passwords and keys are only read from environment variables.
  Printed output masks them.
- Never commit `.env` or a service-account key file.
- The application connects with limited identities: the `aegis_app` role (Neon,
  Supabase) and the `aegis-api` service account with only "Cloud Datastore User"
  (Firestore). Owner/admin credentials are only used to set up the databases.
