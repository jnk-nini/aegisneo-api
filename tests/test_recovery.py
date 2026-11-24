"""Password recovery: a recovery code from sign-up (or made later) lets the owner choose a new password."""
import re

import pytest

from api import auth
from tests.conftest import USER_PASSWORD

NEW = {"username": "carol", "password": "a long enough password"}
CODE_SHAPE = re.compile(r"^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$")


def signup(client, **extra):
    r = client.post("/api/v1/auth/signup", json={**NEW, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def reset(client, username, code, password="a brand new password"):
    return client.post("/api/v1/auth/reset-password",
                       json={"username": username, "recovery_code": code, "new_password": password})


def test_signup_returns_a_recovery_code_once(client, owner_db):
    body = signup(client)
    assert CODE_SHAPE.match(body["recovery_code"])
    stored = owner_db.execute("select recovery_hash from users where username = 'carol'").fetchone()[0]
    assert stored.startswith("$2b$12$") and body["recovery_code"].replace("-", "") not in stored
    # Never offered again: sign-in and /me do not show it.
    login = client.post("/api/v1/auth/login", data={"username": "carol", "password": NEW["password"]})
    assert "recovery_code" not in login.text
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["has_recovery_code"] is True


def test_the_code_resets_the_password_and_is_used_up(client):
    code = signup(client)["recovery_code"]
    r = reset(client, "carol", code)
    assert r.status_code == 200
    new_code = r.json()["recovery_code"]
    assert CODE_SHAPE.match(new_code) and new_code != code
    assert client.post("/api/v1/auth/login", data={"username": "carol", "password": "a brand new password"}).status_code == 200
    assert client.post("/api/v1/auth/login", data={"username": "carol", "password": NEW["password"]}).status_code == 401
    assert reset(client, "carol", code).status_code == 401           # the old code is dead
    assert reset(client, "carol", new_code, "yet another password").status_code == 200


def test_the_code_may_be_typed_loosely(client):
    code = signup(client)["recovery_code"]
    assert reset(client, " Carol ", code.lower().replace("-", " ")).status_code == 200


@pytest.mark.parametrize("who,code", [("carol", "AAAA-BBBB-CCCC-DDDD"), ("nobody", "AAAA-BBBB-CCCC-DDDD"), ("alice", "AAAA-BBBB-CCCC-DDDD")])
def test_a_wrong_code_name_or_account_without_a_code_all_look_the_same(client, who, code):
    signup(client)  # alice (made by the test setup) has no code
    r = reset(client, who, code)
    assert r.status_code == 401
    assert r.json()["detail"] == "The username or recovery code is not correct."


def test_a_reset_cannot_change_the_role_or_name(client, owner_db):
    code = signup(client)["recovery_code"]
    r = client.post("/api/v1/auth/reset-password", json={"username": "carol", "recovery_code": code,
                                                         "new_password": "a brand new password", "role": "admin"})
    assert r.status_code == 422
    assert owner_db.execute("select role from users where username = 'carol'").fetchone()[0] == "user"


def test_a_short_new_password_is_refused_and_the_code_survives(client):
    code = signup(client)["recovery_code"]
    assert reset(client, "carol", code, "short").status_code == 422
    assert reset(client, "carol", code).status_code == 200


def test_guessing_codes_is_throttled(client):
    signup(client)
    codes = ["AAAA-BBBB-CCCC-%04d" % i for i in range(11)]
    statuses = [reset(client, "carol", c).status_code for c in codes]
    assert statuses[:10] == [401] * 10 and statuses[10] == 429


def test_an_existing_account_can_make_a_code_with_its_password(client, reader, owner_db):
    assert client.get("/api/v1/auth/me", headers=reader).json()["has_recovery_code"] is False
    wrong = client.post("/api/v1/auth/recovery-code", json={"password": "not the password"}, headers=reader)
    assert wrong.status_code == 403
    r = client.post("/api/v1/auth/recovery-code", json={"password": USER_PASSWORD}, headers=reader)
    assert r.status_code == 200 and CODE_SHAPE.match(r.json()["recovery_code"])
    assert client.get("/api/v1/auth/me", headers=reader).json()["has_recovery_code"] is True
    assert reset(client, "bob", r.json()["recovery_code"]).status_code == 200


def test_a_new_code_replaces_the_old_one(client, reader):
    first = client.post("/api/v1/auth/recovery-code", json={"password": USER_PASSWORD}, headers=reader).json()["recovery_code"]
    second = client.post("/api/v1/auth/recovery-code", json={"password": USER_PASSWORD}, headers=reader).json()["recovery_code"]
    assert reset(client, "bob", first).status_code == 401
    assert reset(client, "bob", second).status_code == 200


def test_making_a_code_needs_a_signed_in_account(client, partner):
    assert client.post("/api/v1/auth/recovery-code", json={"password": "x"}).status_code == 401
    assert client.post("/api/v1/auth/recovery-code", json={"password": "x"}, headers=partner).status_code == 401


def test_codes_are_random_and_well_formed():
    codes = {auth.new_recovery_code() for _ in range(200)}
    assert len(codes) == 200 and all(CODE_SHAPE.match(c) for c in codes)
