"""Make a fresh database for the browser tests: the real schema, the whole catalog and two accounts.

Needs TEST_DATABASE_URL (a PostgreSQL server on localhost with CREATE DATABASE rights).
alice is an admin and bob is a regular user; both use the password below.
"""
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import bcrypt
import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo

ROOT = Path(__file__).resolve().parent.parent
DB, APP_ROLE, APP_PASSWORD, PASSWORD = "aegisneo_e2e", "aegis_app", "e2e-app-password", "correct horse battery"

admin = os.environ["TEST_DATABASE_URL"]
if (urlparse(admin).hostname or "") not in ("localhost", "127.0.0.1", "::1"):
    sys.exit("TEST_DATABASE_URL must point at localhost: this script drops and recreates a database.")


def url_for(dbname, user=None, password=None):
    parts = conninfo_to_dict(admin)
    parts["dbname"] = dbname
    if user:
        parts["user"], parts["password"] = user, password
    return make_conninfo(**parts)


with psycopg.connect(admin, autocommit=True) as conn:
    conn.execute(f'drop database if exists "{DB}" with (force)')
    conn.execute(f'create database "{DB}"')
    if conn.execute("select 1 from pg_roles where rolname = %s", [APP_ROLE]).fetchone():
        conn.execute(f"alter role {APP_ROLE} with password '{APP_PASSWORD}'")
    else:
        conn.execute(f"create role {APP_ROLE} login password '{APP_PASSWORD}' nosuperuser nocreatedb nocreaterole")

owner = url_for(DB)
with psycopg.connect(owner, autocommit=True) as conn:
    conn.execute((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))

subprocess.run([sys.executable, str(ROOT / "scripts" / "import_asteroids.py")], check=True,
               env={**os.environ, "DATABASE_OWNER_URL": owner}, stdout=subprocess.DEVNULL)

hashed = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()
with psycopg.connect(owner, autocommit=True) as conn:
    conn.execute("insert into users (username, password_hash, role) values ('alice', %s, 'admin'), ('bob', %s, 'user')",
                 [hashed, hashed])
print(f"e2e database ready: {DB}")
