"""Reliability tests: database outages, constraints and what the API never leaks."""
import psycopg
import pytest

from api import db


def test_health_reports_the_database(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["database"] == "ok"


@pytest.fixture
def database_down(monkeypatch):
    """Point the API at a port where nothing listens."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://aegis_app:s3cret-pw@127.0.0.1:1/neondb")


def test_database_outage_is_503_without_details(client, auth, database_down):
    for path in ("/health", "/", "/api/v1/asteroids"):
        r = client.get(path)
        assert r.status_code == 503, path
        assert r.json() == {"detail": "The database is temporarily unavailable."}
        assert "s3cret-pw" not in r.text and "127.0.0.1" not in r.text


def test_login_during_an_outage_is_503(client, database_down):
    assert client.post("/api/v1/auth/login", data={"username": "alice", "password": "x" * 12}).status_code == 503


def test_missing_database_url_is_503(client, monkeypatch):
    monkeypatch.delenv("DATABASE_URL")
    assert client.get("/health").status_code == 503


def test_missing_jwt_secret_does_not_leak_or_crash(client, monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "short")
    r = client.post("/api/v1/auth/login", data={"username": "alice", "password": "correct horse battery"})
    assert r.status_code == 503
    assert "short" not in r.text


def test_unexpected_errors_return_a_generic_500(client, monkeypatch):
    def explode():
        raise RuntimeError("secret internal detail: postgresql://user:pw@host/db")
    monkeypatch.setattr(db, "ping", explode)
    r = client.get("/health")
    assert r.status_code == 500
    assert r.json() == {"detail": "Internal server error."}


def test_database_errors_return_a_generic_500(client, monkeypatch):
    def refuse(*args, **kwargs):
        raise psycopg.errors.InsufficientPrivilege("permission denied for table asteroids")
    monkeypatch.setattr(psycopg.Connection, "execute", refuse)
    r = client.get("/api/v1/asteroids")
    assert r.status_code == 500
    assert "permission" not in r.text and "asteroids" not in r.json()["detail"]


def test_the_database_constraints_hold_without_the_api(owner_db):
    """Even a bug in the API could not store these: the table refuses them."""
    bad_rows = [
        ("1", "n", 0, "2020-01-01", 1, 1, 1),            # diameter must be > 0
        ("2", "n", "NaN", "2020-01-01", 1, 1, 1),        # NaN is rejected by the range check
        ("3", "n", 1, "2020-01-01", -1, 1, 1),           # negative speed
        ("4", "n", 1, "2300-01-01", 1, 1, 1),            # date out of range
        ("abc", "n", 1, "2020-01-01", 1, 1, 1),          # ID is digits only
        ("5", "  ", 1, "2020-01-01", 1, 1, 1),           # blank name
    ]
    for neo_id, name, diameter, day, velocity, miss, magnitude in bad_rows:
        with pytest.raises(psycopg.errors.Error):
            owner_db.execute(
                "insert into asteroids (neo_reference_id, name, estimated_diameter_km, "
                "close_approach_date, relative_velocity_km_h, miss_distance_km, absolute_magnitude) "
                "values (%s, %s, %s, %s, %s, %s, %s)",
                [neo_id, name, diameter, day, velocity, miss, magnitude],
            )


def test_a_failed_write_changes_nothing(client, auth, owner_db, new_asteroid):
    new_asteroid["name"] = "99942 Apophis (2004 MN4)"  # duplicate -> rolled back
    client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert owner_db.execute("select count(*) from asteroids").fetchone()[0] == 14
    assert owner_db.execute("select 1 from asteroids where neo_reference_id = '9000001'").fetchone() is None
