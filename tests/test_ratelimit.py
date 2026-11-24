"""Throttling of sign-in and sign-up, live role checks on reads, and response headers."""
import pytest

from api import ratelimit
from tests.conftest import USER_PASSWORD


def login(client, username="bob", password="wrong password", **headers):
    return client.post("/api/v1/auth/login", data={"username": username, "password": password}, headers=headers)


def test_repeated_guesses_against_one_account_are_throttled(client):
    limit = ratelimit.USERNAME_LIMIT[0]
    for _ in range(limit):
        assert login(client).status_code == 401
    blocked = login(client)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1
    assert "Too many attempts" in blocked.json()["detail"]
    # Even the right password is refused while the window lasts: the check comes first.
    assert login(client, password=USER_PASSWORD).status_code == 429


def test_other_accounts_are_not_affected_by_one_accounts_throttle(client):
    for _ in range(ratelimit.USERNAME_LIMIT[0] + 1):
        login(client, "bob")
    assert login(client, "alice", USER_PASSWORD).status_code == 200


def test_one_address_trying_many_usernames_is_throttled(client, monkeypatch):
    monkeypatch.setitem(ratelimit.IP_LIMITS, "login", (5, 900))
    for i in range(5):
        assert login(client, f"nobody{i}").status_code == 401
    assert login(client, "nobody99").status_code == 429


def test_different_addresses_are_counted_separately(client, monkeypatch):
    monkeypatch.setitem(ratelimit.IP_LIMITS, "login", (2, 900))
    for _ in range(2):
        assert login(client, "x1", **{"x-vercel-forwarded-for": "198.51.100.1"}).status_code == 401
    assert login(client, "x2", **{"x-vercel-forwarded-for": "198.51.100.1"}).status_code == 429
    assert login(client, "x3", **{"x-vercel-forwarded-for": "198.51.100.2"}).status_code == 401


def test_signup_is_throttled_per_address(client, monkeypatch):
    monkeypatch.setitem(ratelimit.IP_LIMITS, "signup", (3, 3600))
    for i in range(3):
        r = client.post("/api/v1/auth/signup", json={"username": f"newuser{i}", "password": "long enough pw"})
        assert r.status_code == 201
    r = client.post("/api/v1/auth/signup", json={"username": "newuser9", "password": "long enough pw"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_no_raw_address_or_username_is_stored(client, owner_db):
    login(client, "bob", **{"x-vercel-forwarded-for": "203.0.113.77"})
    buckets = [r[0] for r in owner_db.execute("select bucket from rate_limits").fetchall()]
    assert buckets
    assert not any("203.0.113.77" in b or "bob" in b for b in buckets)


def test_a_missing_counter_table_does_not_lock_everyone_out(client, owner_db):
    owner_db.execute("drop table rate_limits")
    try:
        assert login(client, "alice", USER_PASSWORD).status_code == 200
    finally:  # put it back for the tests after this one
        owner_db.execute(
            "create table rate_limits (bucket text not null, window_start timestamptz not null, "
            "hits integer not null default 0, primary key (bucket, window_start))")
        owner_db.execute("grant select, insert, update, delete on rate_limits to aegis_app")


def test_throttling_can_be_switched_off(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_DISABLED", "1")
    for _ in range(ratelimit.USERNAME_LIMIT[0] + 3):
        assert login(client).status_code == 401


# --- a token is only as good as the account behind it ---------------------------------

def test_a_deleted_account_loses_read_access_at_once(client, reader, owner_db):
    assert client.get("/api/v1/asteroids", headers=reader).json()["access"] == "full"
    owner_db.execute("delete from users where username = 'bob'")
    r = client.get("/api/v1/asteroids", headers=reader)
    assert r.status_code == 401
    assert "no longer exists" in r.json()["detail"]


def test_a_ticket_of_a_deleted_account_is_refused_by_a_partner_site(client, user_via_impactor, owner_db):
    assert client.get("/api/v1/asteroids", headers=user_via_impactor).status_code == 200
    owner_db.execute("delete from users where username = 'bob'")
    assert client.get("/api/v1/asteroids", headers=user_via_impactor).status_code == 401


# --- response headers ---------------------------------------------------------------

@pytest.mark.parametrize("path", ["/", "/health", "/api/v1/sites", "/api/v1/asteroids"])
def test_every_response_says_nosniff(client, path):
    assert client.get(path).headers["X-Content-Type-Options"] == "nosniff"


def test_account_responses_are_never_cached(client, auth):
    assert client.get("/api/v1/auth/me", headers=auth).headers["Cache-Control"] == "no-store"
    assert client.get("/api/v1/asteroids", headers=auth).headers["Cache-Control"] == "no-store"
    assert login(client, "alice", USER_PASSWORD).headers["Cache-Control"] == "no-store"


def test_the_home_count_may_be_cached_briefly_but_health_may_not(client):
    assert "s-maxage=300" in client.get("/").headers["Cache-Control"]
    assert "Cache-Control" not in client.get("/health").headers
