"""Security tests: who may do what, and what the database role can do."""
import time

import jwt
import psycopg
import pytest

from tests.conftest import JWT_SECRET, USER_PASSWORD


# ---------- login ----------
def test_login_returns_a_bearer_token(client):
    r = client.post("/api/v1/auth/login", data={"username": "alice", "password": USER_PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["expires_in"] == 3600
    claims = jwt.decode(body["access_token"], JWT_SECRET, algorithms=["HS256"])
    assert claims["username"] == "alice" and claims["sub"] == "1"


def test_wrong_password_and_unknown_user_look_the_same(client):
    wrong_password = client.post("/api/v1/auth/login", data={"username": "alice", "password": "nope-nope-nope"})
    unknown_user = client.post("/api/v1/auth/login", data={"username": "nobody", "password": "nope-nope-nope"})
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


def test_login_requires_both_fields(client):
    assert client.post("/api/v1/auth/login", data={"username": "alice"}).status_code == 422
    assert client.post("/api/v1/auth/login").status_code == 422


def test_validation_errors_never_echo_the_password(client):
    r = client.post("/api/v1/auth/login", data={"password": "my-secret-password"})
    assert r.status_code == 422
    assert "my-secret-password" not in r.text


def test_me_returns_the_logged_in_user_without_secrets(client, auth):
    r = client.get("/api/v1/auth/me", headers=auth)
    assert r.json() == {"id": 1, "username": "alice"}


def test_me_needs_a_user_token(client, partner):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/auth/me", headers=partner).status_code == 401


# ---------- protected operations ----------
WRITES = [
    ("post", "/api/v1/asteroids", {"json": {}}),
    ("patch", "/api/v1/asteroids/2099942", {"json": {"name": "x"}}),
    ("delete", "/api/v1/asteroids/2099942", {}),
]


@pytest.mark.parametrize("method,url,kwargs", WRITES)
def test_writes_without_credentials_are_401(client, owner_db, method, url, kwargs):
    assert getattr(client, method)(url, **kwargs).status_code == 401
    assert owner_db.execute("select count(*) from asteroids").fetchone()[0] == 14


@pytest.mark.parametrize("method,url,kwargs", WRITES)
def test_writes_with_a_partner_key_are_403(client, owner_db, partner, method, url, kwargs):
    assert getattr(client, method)(url, headers=partner, **kwargs).status_code == 403
    assert owner_db.execute("select count(*) from asteroids").fetchone()[0] == 14


def test_a_guest_cannot_read_a_non_featured_asteroid(client):
    assert client.get("/api/v1/asteroids/2162117").status_code == 401


def test_stats_need_login_or_a_partner_key(client, auth, partner):
    assert client.get("/api/v1/stats").status_code == 401
    assert client.get("/api/v1/stats", headers=auth).status_code == 200
    assert client.get("/api/v1/stats", headers=partner).status_code == 200


# ---------- bad credentials ----------
def test_wrong_partner_key_is_401(client):
    assert client.get("/api/v1/asteroids", headers={"x-api-key": "wrong"}).status_code == 401


def test_retired_keys_are_no_longer_accepted(client):
    for key in ("student-api-key-123", "aegisneo-web-key"):
        assert client.get("/api/v1/asteroids", headers={"x-api-key": key}).status_code == 401


def test_invalid_token_is_401_not_guest(client):
    r = client.get("/api/v1/asteroids", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


def test_token_signed_with_another_secret_is_401(client):
    forged = jwt.encode({"sub": "1", "exp": int(time.time()) + 600}, "x" * 40, algorithm="HS256")
    assert client.get("/api/v1/stats", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_expired_token_is_401(client):
    old = jwt.encode({"sub": "1", "username": "alice", "exp": int(time.time()) - 5}, JWT_SECRET, algorithm="HS256")
    assert client.get("/api/v1/stats", headers={"Authorization": f"Bearer {old}"}).status_code == 401


def test_token_without_expiry_is_401(client):
    no_exp = jwt.encode({"sub": "1"}, JWT_SECRET, algorithm="HS256")
    assert client.get("/api/v1/stats", headers={"Authorization": f"Bearer {no_exp}"}).status_code == 401


def test_token_of_a_deleted_user_cannot_create(client, auth, owner_db, new_asteroid):
    owner_db.execute("delete from users where username = 'alice'")
    r = client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert r.status_code == 401


def test_sql_injection_attempts_are_harmless(client, auth, owner_db):
    for attack in ("'; drop table asteroids; --", "x' or '1'='1", "%' or true --"):
        r = client.get("/api/v1/asteroids", params={"search": attack}, headers=auth)
        assert r.status_code == 200 and r.json()["matched"] == 0
    assert client.get("/api/v1/asteroids/1' or '1'='1", headers=auth).status_code == 404
    assert owner_db.execute("select count(*) from asteroids").fetchone()[0] == 14


def test_login_is_not_injectable(client):
    r = client.post("/api/v1/auth/login", data={"username": "alice' or '1'='1", "password": "x" * 12})
    assert r.status_code == 401


def test_password_hashes_are_never_returned(client, auth, new_asteroid):
    texts = [
        client.get("/api/v1/auth/me", headers=auth).text,
        client.post("/api/v1/asteroids", json=new_asteroid, headers=auth).text,
        client.get("/api/v1/asteroids", headers=auth).text,
    ]
    assert not any("password" in t or "$2b$" in t for t in texts)


# ---------- the database role ----------
def test_the_api_role_cannot_change_the_structure_or_accounts(urls):
    with psycopg.connect(urls["app"], autocommit=True) as conn:
        for statement in ("drop table asteroids", "create table x (a int)",
                          "insert into users (username, password_hash) values ('eve', repeat('x', 60))",
                          "update users set username = 'eve'", "delete from users",
                          "alter table asteroids add column y int"):
            with pytest.raises(psycopg.errors.Error):
                conn.execute(statement)
        # what it is allowed to do
        assert conn.execute("select count(*) from users").fetchone()[0] == 2
