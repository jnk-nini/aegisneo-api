"""Roles stored in the database: admin (may change data), user (read only) and guest (no account)."""
import psycopg
import pytest

from tests.conftest import FEATURED_IDS, OTHER_IDS

ALL = len(FEATURED_IDS) + len(OTHER_IDS)


def test_the_roles_table_holds_admin_user_and_guest(owner_db):
    rows = owner_db.execute("select name from roles order by name").fetchall()
    assert [r[0] for r in rows] == ["admin", "guest", "user"]
    accounts = owner_db.execute("select username, role from users order by id").fetchall()
    assert accounts == [("alice", "admin"), ("bob", "user")]


def test_a_new_account_is_a_user_unless_told_otherwise(owner_db):
    owner_db.execute("insert into users (username, password_hash) values ('carol', repeat('x', 60))")
    assert owner_db.execute("select role from users where username = 'carol'").fetchone()[0] == "user"


def test_the_database_refuses_an_unknown_role(owner_db):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        owner_db.execute("insert into users (username, password_hash, role) values ('dave', repeat('x', 60), 'boss')")
    with pytest.raises(psycopg.errors.NotNullViolation):
        owner_db.execute("update users set role = null where username = 'bob'")


def test_no_account_can_hold_the_guest_role(owner_db):
    with pytest.raises(psycopg.errors.CheckViolation):
        owner_db.execute("insert into users (username, password_hash, role) values ('eve', repeat('x', 60), 'guest')")


def test_login_and_me_report_the_role(client, auth, reader):
    login = client.post("/api/v1/auth/login", data={"username": "bob", "password": "correct horse battery"})
    assert login.json()["role"] == "user"
    assert client.get("/api/v1/auth/me", headers=auth).json() == {"id": 1, "username": "alice", "role": "admin"}
    assert client.get("/api/v1/auth/me", headers=reader).json() == {"id": 2, "username": "bob", "role": "user"}


def test_a_user_can_read_everything(client, reader):
    body = client.get("/api/v1/asteroids", headers=reader).json()
    assert body["access"] == "full" and body["total"] == ALL
    assert client.get(f"/api/v1/asteroids/{OTHER_IDS[0]}", headers=reader).status_code == 200
    assert client.get("/api/v1/stats", headers=reader).status_code == 200


def test_a_user_cannot_change_data(client, reader, new_asteroid, owner_db):
    responses = [
        client.post("/api/v1/asteroids", json=new_asteroid, headers=reader),
        client.patch(f"/api/v1/asteroids/{OTHER_IDS[0]}", json={"estimated_diameter_km": 9.9}, headers=reader),
        client.delete(f"/api/v1/asteroids/{OTHER_IDS[0]}", headers=reader),
    ]
    assert [r.status_code for r in responses] == [403, 403, 403]
    assert "admin" in responses[0].json()["detail"]
    assert owner_db.execute("select count(*) from asteroids").fetchone()[0] == ALL
    assert owner_db.execute("select estimated_diameter_km from asteroids where neo_reference_id = %s",
                            [OTHER_IDS[0]]).fetchone()[0] != 9.9


def test_an_admin_can_change_data(client, auth, new_asteroid):
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=auth).status_code == 201
    assert client.delete(f"/api/v1/asteroids/{new_asteroid['neo_reference_id']}", headers=auth).status_code == 200


def test_a_role_change_applies_at_once(client, auth, reader, new_asteroid, owner_db):
    # The tokens were issued before the change; the role is read from the database.
    owner_db.execute("update users set role = 'user' where username = 'alice'")
    owner_db.execute("update users set role = 'admin' where username = 'bob'")
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=auth).status_code == 403
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=reader).status_code == 201
    assert client.get("/api/v1/auth/me", headers=reader).json()["role"] == "admin"
