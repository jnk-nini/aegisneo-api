"""Test setup.

The tests run against a real PostgreSQL server, never against Neon. Set
TEST_DATABASE_URL to a connection string with CREATE DATABASE rights on a
local server, for example:

    TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres

A fresh database "aegisneo_test" is created from db/schema.sql. The API under
test connects as the limited role aegis_app, as it does in production.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

import bcrypt
import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.conninfo import conninfo_to_dict, make_conninfo

ROOT = Path(__file__).resolve().parent.parent
TEST_DB = "aegisneo_test"
APP_ROLE = "aegis_app"
APP_PASSWORD = "test-app-password"
JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
PARTNER_KEY = "partner-test-key-abc123"
USER_PASSWORD = "correct horse battery"

# Ten featured asteroids, then four others, all real records from the catalog.
FEATURED_IDS = ["2099942", "2101955", "2000433", "2001036", "2001566",
                "2004179", "2065803", "2003200", "2025143", "2162173"]
OTHER_IDS = ["2162117", "2349507", "3599866", "3661270"]


def _admin_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.exit("Set TEST_DATABASE_URL to a local PostgreSQL server (see tests/conftest.py).", returncode=2)
    host = urlparse(url).hostname or ""
    if host not in ("localhost", "127.0.0.1", "::1"):
        pytest.exit("TEST_DATABASE_URL must point at localhost: the tests drop and recreate tables.", returncode=2)
    return url


def _url_for(admin_url, dbname, user=None, password=None):
    parts = conninfo_to_dict(admin_url)
    parts["dbname"] = dbname
    if user:
        parts["user"] = user
        parts["password"] = password
    return make_conninfo(**parts)


@pytest.fixture(scope="session")
def urls():
    admin = _admin_url()
    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f'drop database if exists "{TEST_DB}" with (force)')
        conn.execute(f'create database "{TEST_DB}"')
        exists = conn.execute("select 1 from pg_roles where rolname = %s", [APP_ROLE]).fetchone()
        if not exists:
            conn.execute(
                f"create role {APP_ROLE} login password '{APP_PASSWORD}' "
                "nosuperuser nocreatedb nocreaterole"
            )
        else:
            conn.execute(f"alter role {APP_ROLE} with password '{APP_PASSWORD}'")
    owner_url = _url_for(admin, TEST_DB)
    with psycopg.connect(owner_url, autocommit=True) as conn:
        conn.execute((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))
    return {"owner": owner_url, "app": _url_for(admin, TEST_DB, APP_ROLE, APP_PASSWORD)}


@pytest.fixture(scope="session")
def catalog():
    records = json.loads((ROOT / "data" / "asteroids.json").read_text(encoding="utf-8"))
    return {r["neo_reference_id"]: r for r in records}


@pytest.fixture(autouse=True)
def database(urls, catalog, monkeypatch):
    """Empty tables with a known set of rows before every test."""
    hashed = bcrypt.hashpw(USER_PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()
    with psycopg.connect(urls["owner"]) as conn:
        conn.execute("truncate asteroids, users restart identity cascade")
        conn.execute("insert into users (username, password_hash) values ('alice', %s), ('bob', %s)",
                     [hashed, hashed])
        for neo_id in FEATURED_IDS + OTHER_IDS:
            a = catalog[neo_id]
            conn.execute(
                "insert into asteroids (neo_reference_id, name, estimated_diameter_km, "
                "is_potentially_hazardous, close_approach_date, relative_velocity_km_h, "
                "miss_distance_km, absolute_magnitude, is_featured) "
                "values (%(neo_reference_id)s, %(name)s, %(estimated_diameter_km)s, "
                "%(is_potentially_hazardous)s, %(close_approach_date)s, %(relative_velocity_km_h)s, "
                "%(miss_distance_km)s, %(absolute_magnitude)s, %(featured)s)",
                {**a, "featured": neo_id in FEATURED_IDS},
            )
    monkeypatch.setenv("DATABASE_URL", urls["app"])
    monkeypatch.setenv("JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("AEGISNEO_API_KEYS", f"impactor:{PARTNER_KEY}")


@pytest.fixture
def client():
    from api.index import app
    # Unhandled errors become 500 responses instead of being raised in the test.
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def owner_db(urls):
    """Direct connection as the owner, to check what is really stored."""
    with psycopg.connect(urls["owner"], autocommit=True) as conn:
        yield conn


def _login(client, username="alice", password=USER_PASSWORD):
    return client.post("/api/v1/auth/login", data={"username": username, "password": password})


@pytest.fixture
def token(client):
    return _login(client).json()["access_token"]


@pytest.fixture
def auth(token):
    """Headers of a logged-in user (alice, id 1)."""
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def partner():
    return {"x-api-key": PARTNER_KEY}


NEW_ASTEROID = {
    "neo_reference_id": "9000001",
    "name": "Test Rock (2026 AB)",
    "estimated_diameter_km": 0.25,
    "is_potentially_hazardous": True,
    "close_approach_date": "2026-05-17",
    "relative_velocity_km_h": 54000.5,
    "miss_distance_km": 4200000.0,
    "absolute_magnitude": 21.3,
}


@pytest.fixture
def new_asteroid():
    return dict(NEW_ASTEROID)
