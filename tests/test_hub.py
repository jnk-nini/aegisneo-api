"""The hub: access rules per role and site, tickets for partner sites, launches,
watchlist, badges, the audit trail and the admin overview."""
import time

import jwt
import psycopg
import pytest

from tests.conftest import ATLAS_KEY, FEATURED_IDS, JWT_SECRET, OTHER_IDS, PARTNER_KEY, launch_headers

ALL = len(FEATURED_IDS) + len(OTHER_IDS)


# ---------- the rules are rows of site_access ----------
def test_the_access_rules_are_stored_per_role_and_site(owner_db):
    rows = owner_db.execute("select role, site, can_write, item_limit from site_access order by role, site").fetchall()
    assert len(rows) == 9
    assert {(r[0], r[1]): (r[2], r[3]) for r in rows} == {
        ("admin", "aegisneo"): (True, None), ("admin", "impactor"): (False, None), ("admin", "neo-atlas"): (False, None),
        ("user", "aegisneo"): (False, None), ("user", "impactor"): (False, None), ("user", "neo-atlas"): (False, None),
        ("guest", "aegisneo"): (False, 10), ("guest", "impactor"): (False, 10), ("guest", "neo-atlas"): (False, 10),
    }


def test_changing_a_rule_changes_what_a_role_sees(client, reader, owner_db):
    owner_db.execute("update site_access set item_limit = 3 where role = 'user' and site = 'aegisneo'")
    body = client.get("/api/v1/asteroids", headers=reader).json()
    assert body["total"] == 3 and body["count"] == 3 and body["access"] == "limited"
    assert client.get(f"/api/v1/asteroids/{OTHER_IDS[0]}", headers=reader).status_code == 401


def test_a_lower_limit_hides_featured_asteroids_beyond_it(client, owner_db):
    owner_db.execute("update site_access set item_limit = 4 where role = 'guest' and site = 'aegisneo'")
    body = client.get("/api/v1/asteroids").json()
    assert body["total"] == 4 and len(body["asteroids"]) == 4
    assert client.get("/api/v1/stats").json()["total"] == 4


def test_a_role_with_no_rule_has_no_access(client, owner_db):
    owner_db.execute("delete from site_access where role = 'guest' and site = 'aegisneo'")
    assert client.get("/api/v1/asteroids").status_code == 403


def test_the_database_refuses_a_rule_for_an_unknown_site_or_role(owner_db):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        owner_db.execute("insert into site_access (role, site) values ('user', 'nowhere')")
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        owner_db.execute("insert into site_access (role, site) values ('boss', 'impactor')")


# ---------- the site list for the hub ----------
def test_sites_for_each_role(client, auth, reader):
    guest = client.get("/api/v1/sites").json()
    assert guest["role"] == "guest"
    assert [s["slug"] for s in guest["sites"]] == ["aegisneo", "impactor", "neo-atlas"]
    assert all(s["access"]["level"] == "limited" and s["access"]["item_limit"] == 10 for s in guest["sites"])
    user = client.get("/api/v1/sites", headers=reader).json()
    assert user["role"] == "user" and all(s["access"]["level"] == "full" and not s["access"]["can_write"] for s in user["sites"])
    admin = client.get("/api/v1/sites", headers=auth).json()
    main = next(s for s in admin["sites"] if s["slug"] == "aegisneo")
    assert main["access"]["can_write"] is True


# ---------- tickets ----------
def test_launching_a_partner_site_gives_an_account_a_ticket(client, reader, owner_db):
    r = client.post("/api/v1/sites/impactor/launch", headers=reader)
    body = r.json()
    assert r.status_code == 200 and body["ticket"] and body["url"].startswith("https://")
    claims = jwt.decode(body["ticket"], JWT_SECRET, algorithms=["HS256"], audience="impactor")
    assert claims["aud"] == "impactor" and claims["role"] == "user" and claims["typ"] == "ticket"
    assert owner_db.execute("select user_id, site, role from launches").fetchall() == [(2, "impactor", "user")]


def test_a_guest_launch_has_no_ticket_and_is_logged_without_a_user(client, owner_db):
    body = client.post("/api/v1/sites/neo-atlas/launch").json()
    assert body["ticket"] is None and body["access"] == {"level": "limited", "item_limit": 10}
    assert owner_db.execute("select user_id, site, role from launches").fetchall() == [(None, "neo-atlas", "guest")]


def test_the_main_site_launch_needs_no_ticket(client, reader):
    body = client.post("/api/v1/sites/aegisneo/launch", headers=reader).json()
    assert body["ticket"] is None and body["url"] == "explorer"


def test_an_unknown_site_is_404(client):
    assert client.post("/api/v1/sites/nowhere/launch").status_code == 404


def test_a_ticket_only_works_with_the_key_of_its_site(client, reader):
    ticket = client.post("/api/v1/sites/impactor/launch", headers=reader).json()["ticket"]
    bearer = {"Authorization": f"Bearer {ticket}"}
    ok = client.get("/api/v1/asteroids", headers={**bearer, "x-api-key": PARTNER_KEY})
    assert ok.status_code == 200 and ok.json()["total"] == ALL
    assert client.get("/api/v1/asteroids", headers={**bearer, "x-api-key": ATLAS_KEY}).status_code == 401
    assert client.get("/api/v1/asteroids", headers=bearer).status_code == 401  # no key at all


def test_a_ticket_is_read_only_even_for_an_admin(client, admin_via_impactor, new_asteroid, owner_db):
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=admin_via_impactor).status_code == 403
    assert client.delete("/api/v1/asteroids/2099942", headers=admin_via_impactor).status_code == 403
    assert client.get("/api/v1/admin/overview", headers=admin_via_impactor).status_code == 403
    assert owner_db.execute("select count(*) from asteroids").fetchone()[0] == ALL


def test_a_ticket_cannot_open_account_pages_or_launch_other_sites(client, user_via_impactor):
    assert client.get("/api/v1/me/overview", headers=user_via_impactor).status_code == 401
    assert client.get("/api/v1/auth/me", headers=user_via_impactor).status_code == 401
    assert client.post("/api/v1/sites/neo-atlas/launch", headers=user_via_impactor).status_code == 403


def test_an_expired_ticket_is_401(client):
    old = jwt.encode({"sub": "2", "role": "user", "aud": "impactor", "exp": int(time.time()) - 5},
                     JWT_SECRET, algorithm="HS256")
    r = client.get("/api/v1/asteroids", headers={"x-api-key": PARTNER_KEY, "Authorization": f"Bearer {old}"})
    assert r.status_code == 401


def test_a_ticket_for_a_deleted_account_cannot_be_traded_for_more(client, owner_db, reader):
    # The ticket carries the role it was issued with; the launch itself checks the account.
    owner_db.execute("delete from users where username = 'bob'")
    assert client.post("/api/v1/sites/impactor/launch", headers=reader).status_code == 401


def test_the_role_at_launch_time_is_used_not_the_one_in_the_token(client, reader, owner_db):
    owner_db.execute("update users set role = 'admin' where username = 'bob'")
    ticket = client.post("/api/v1/sites/impactor/launch", headers=reader).json()["ticket"]
    assert jwt.decode(ticket, JWT_SECRET, algorithms=["HS256"], audience="impactor")["role"] == "admin"


# ---------- watchlist ----------
def test_watchlist_add_list_remove(client, reader, owner_db):
    assert client.put("/api/v1/me/watchlist/2099942", headers=reader).json()["watching"] is True
    client.put("/api/v1/me/watchlist/2099942", headers=reader)  # twice changes nothing
    body = client.get("/api/v1/me/watchlist", headers=reader).json()
    assert body["count"] == 1 and body["asteroids"][0]["neo_reference_id"] == "2099942"
    assert client.delete("/api/v1/me/watchlist/2099942", headers=reader).json()["watching"] is False
    assert client.get("/api/v1/me/watchlist", headers=reader).json()["count"] == 0


def test_watchlists_are_private_and_need_login(client, auth, reader):
    client.put("/api/v1/me/watchlist/2099942", headers=reader)
    assert client.get("/api/v1/me/watchlist", headers=auth).json()["count"] == 0
    assert client.get("/api/v1/me/watchlist").status_code == 401
    assert client.put("/api/v1/me/watchlist/2099942").status_code == 401


def test_watching_an_unknown_asteroid_is_404(client, reader):
    assert client.put("/api/v1/me/watchlist/123", headers=reader).status_code == 404
    assert client.put("/api/v1/me/watchlist/abc", headers=reader).status_code == 404


def test_deleting_an_asteroid_removes_it_from_watchlists(client, auth, reader, owner_db):
    client.put("/api/v1/me/watchlist/2099942", headers=reader)
    client.delete("/api/v1/asteroids/2099942", headers=auth)
    assert owner_db.execute("select count(*) from watchlist").fetchone()[0] == 0


def test_the_watchlist_has_a_size_limit(client, reader, owner_db, monkeypatch):
    from api import db
    monkeypatch.setattr(db, "WATCHLIST_LIMIT", 2)
    assert client.put("/api/v1/me/watchlist/2099942", headers=reader).status_code == 200
    assert client.put("/api/v1/me/watchlist/2101955", headers=reader).status_code == 200
    assert client.put("/api/v1/me/watchlist/2000433", headers=reader).status_code == 409
    assert owner_db.execute("select count(*) from watchlist").fetchone()[0] == 2


# ---------- badges ----------
def badges(client, headers):
    return {b["code"] for b in client.get("/api/v1/me/overview", headers=headers).json()["badges"] if b["earned_at"]}


def test_signup_earns_first_contact(client):
    r = client.post("/api/v1/auth/signup", json={"username": "newbie", "password": "longenough1"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert badges(client, headers) == {"first_contact"}


def test_launching_sites_earns_badges_and_the_grand_tour(client, reader):
    r = client.post("/api/v1/sites/aegisneo/launch", headers=reader)
    # bob was made by a script, not the sign-up page, so he gets First Contact now.
    assert {b["code"] for b in r.json()["new_badges"]} == {"first_contact", "explorer"}
    client.post("/api/v1/sites/impactor/launch", headers=reader)
    r = client.post("/api/v1/sites/neo-atlas/launch", headers=reader)
    assert {b["code"] for b in r.json()["new_badges"]} == {"stargazer", "grand_tour"}
    assert client.post("/api/v1/sites/neo-atlas/launch", headers=reader).json()["new_badges"] == []


def test_watchlist_badges(client, reader, owner_db):
    hazardous = [r[0] for r in owner_db.execute(
        "select neo_reference_id from asteroids where is_potentially_hazardous order by 1 limit 5").fetchall()]
    assert len(hazardous) == 5
    for i, neo_id in enumerate(hazardous):
        new = client.put(f"/api/v1/me/watchlist/{neo_id}", headers=reader).json()["new_badges"]
        codes = {b["code"] for b in new}
        assert ("hazard_hunter" in codes) == (i == 2)
        assert ("watcher" in codes) == (i == 4)


def test_badges_are_not_taken_away(client, reader, owner_db):
    client.post("/api/v1/sites/aegisneo/launch", headers=reader)
    owner_db.execute("delete from launches")
    assert "explorer" in badges(client, reader)


def test_the_overview_lists_every_badge_and_recent_launches(client, reader):
    client.post("/api/v1/sites/impactor/launch", headers=reader)
    body = client.get("/api/v1/me/overview", headers=reader).json()
    assert len(body["badges"]) == 7
    assert body["recent_launches"][0]["site"] == "impactor"
    assert body["user"]["username"] == "bob" and body["watchlist_count"] == 0


# ---------- audit trail and admin overview ----------
def test_admin_changes_are_recorded(client, auth, new_asteroid, owner_db):
    client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    client.patch("/api/v1/asteroids/9000001", json={"estimated_diameter_km": 0.5, "name": new_asteroid["name"]}, headers=auth)
    client.delete("/api/v1/asteroids/9000001", headers=auth)
    rows = owner_db.execute("select action, user_id, changes from asteroid_audit order by id").fetchall()
    assert [r[0] for r in rows] == ["create", "update", "delete"] and all(r[1] == 1 for r in rows)
    assert rows[1][2] == {"estimated_diameter_km": {"from": 0.25, "to": 0.5}}  # only what really changed
    assert rows[0][2]["close_approach_date"] == "2026-05-17"


def test_a_failed_change_leaves_no_audit_row(client, auth, new_asteroid, owner_db):
    client.post("/api/v1/asteroids", json={**new_asteroid, "estimated_diameter_km": -1}, headers=auth)
    client.patch("/api/v1/asteroids/1", json={"name": "x"}, headers=auth)
    assert owner_db.execute("select count(*) from asteroid_audit").fetchone()[0] == 0


def test_the_audit_trail_survives_the_asteroid_and_the_app_cannot_edit_it(client, auth, urls, owner_db):
    client.delete("/api/v1/asteroids/2099942", headers=auth)
    assert owner_db.execute("select asteroid_name from asteroid_audit").fetchone()[0].startswith("99942")
    with psycopg.connect(urls["app"], autocommit=True) as app:
        for sql in ("update asteroid_audit set action = 'create'", "delete from asteroid_audit",
                    "update users set role = 'admin'", "delete from site_access", "update site_access set item_limit = null"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                app.execute(sql)


def test_admin_overview(client, auth, reader, new_asteroid):
    client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    client.post("/api/v1/sites/impactor/launch", headers=reader)
    client.post("/api/v1/sites/impactor/launch")
    client.put("/api/v1/me/watchlist/2099942", headers=reader)
    body = client.get("/api/v1/admin/overview", headers=auth).json()
    assert {u["role"]: u["n"] for u in body["users_by_role"]} == {"admin": 1, "user": 1}
    impactor = next(s for s in body["launches_by_site"] if s["site"] == "impactor")
    assert impactor["total"] == 2 and impactor["guests"] == 1
    assert body["recent_changes"][0]["action"] == "create" and body["recent_changes"][0]["changed_by"] == "alice"
    assert body["most_watched"][0]["neo_reference_id"] == "2099942"


def test_admin_overview_is_for_admins_only(client, reader, partner):
    assert client.get("/api/v1/admin/overview").status_code == 401
    assert client.get("/api/v1/admin/overview", headers=reader).status_code == 403
    assert client.get("/api/v1/admin/overview", headers=partner).status_code == 403


def test_partner_sites_cannot_launch(client, partner):
    assert client.post("/api/v1/sites/impactor/launch", headers=partner).status_code == 403
