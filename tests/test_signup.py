"""Sign-up: anyone may create an account, and it always gets the user role."""
import psycopg
import pytest

from tests.conftest import OTHER_IDS

NEW = {"username": "carol", "password": "a long enough password"}


def test_signup_creates_a_user_and_logs_in(client, owner_db):
    r = client.post("/api/v1/auth/signup", json=NEW)
    assert r.status_code == 201
    body = r.json()
    assert body["username"] == "carol" and body["role"] == "user" and body["access_token"]
    assert "password" not in r.text and "hash" not in r.text
    row = owner_db.execute("select role, password_hash from users where username = 'carol'").fetchone()
    assert row[0] == "user" and row[1].startswith("$2b$12$") and NEW["password"] not in row[1]
    # The token works, and the same password logs in.
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json() == {"id": body["id"], "username": "carol", "role": "user"}
    assert client.post("/api/v1/auth/login", data=NEW).status_code == 200


def test_a_new_account_can_read_but_not_change(client, new_asteroid):
    token = client.post("/api/v1/auth/signup", json=NEW).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/asteroids", headers=headers).json()["access"] == "full"
    assert client.get(f"/api/v1/asteroids/{OTHER_IDS[0]}", headers=headers).status_code == 200
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=headers).status_code == 403
    assert client.delete(f"/api/v1/asteroids/{OTHER_IDS[0]}", headers=headers).status_code == 403


def test_signup_cannot_ask_for_the_admin_role(client, owner_db):
    r = client.post("/api/v1/auth/signup", json={**NEW, "role": "admin"})
    assert r.status_code == 422
    assert owner_db.execute("select count(*) from users").fetchone()[0] == 2


def test_username_is_trimmed_and_lowercased(client):
    r = client.post("/api/v1/auth/signup", json={**NEW, "username": "  Carol_2 "})
    assert r.status_code == 201 and r.json()["username"] == "carol_2"


def test_taken_username_is_409(client):
    r = client.post("/api/v1/auth/signup", json={**NEW, "username": "Alice"})
    assert r.status_code == 409 and r.json()["detail"] == "This username is already taken."


@pytest.mark.parametrize("body", [
    {"username": "ab", "password": "long enough pw"},             # too short
    {"username": "a" * 31, "password": "long enough pw"},         # too long
    {"username": "bad name!", "password": "long enough pw"},      # not allowed characters
    {"username": "carol", "password": "zq7x"},                    # password under 8
    {"username": "carol", "password": "é" * 37},                  # 74 bytes, over bcrypt's 72
    {"username": "carol"},                                        # no password
    {"password": "long enough pw"},                               # no username
    {"username": 123, "password": "long enough pw"},              # wrong type
])
def test_invalid_signups_are_422_and_store_nothing(client, owner_db, body):
    r = client.post("/api/v1/auth/signup", json=body)
    assert r.status_code == 422
    assert "long enough pw" not in r.text and "zq7x" not in r.text  # never echoes the password
    assert owner_db.execute("select count(*) from users").fetchone()[0] == 2


def test_the_api_role_can_add_an_account_only_with_the_user_role(urls):
    with psycopg.connect(urls["app"], autocommit=True) as conn:
        role = conn.execute("insert into users (username, password_hash) values ('dan', repeat('x', 60)) "
                            "returning role").fetchone()[0]
        assert role == "user"
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("insert into users (username, password_hash, role) values ('eve', repeat('x', 60), 'admin')")


def test_signup_without_jwt_secret_is_503_and_stores_nothing(client, owner_db, monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "")
    assert client.post("/api/v1/auth/signup", json=NEW).status_code == 503
    assert owner_db.execute("select count(*) from users").fetchone()[0] == 2
