"""Validation tests: bad input is rejected before anything is stored."""
import pytest


def count(owner_db):
    return owner_db.execute("select count(*) from asteroids").fetchone()[0]


@pytest.mark.parametrize("field", [
    "neo_reference_id", "name", "estimated_diameter_km", "close_approach_date",
    "relative_velocity_km_h", "miss_distance_km", "absolute_magnitude",
])
def test_missing_required_field_is_422(client, auth, owner_db, new_asteroid, field):
    del new_asteroid[field]
    r = client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert r.status_code == 422
    assert field in r.text
    assert count(owner_db) == 14


@pytest.mark.parametrize("field,value", [
    ("estimated_diameter_km", "big"),            # text instead of a number
    ("estimated_diameter_km", "0.5"),            # number sent as text
    ("estimated_diameter_km", 0),                # must be greater than 0
    ("estimated_diameter_km", 1000.5),           # above the limit
    ("relative_velocity_km_h", -1),
    ("miss_distance_km", 2_000_000_000),
    ("absolute_magnitude", 41),
    ("is_potentially_hazardous", "yes"),         # text instead of a boolean
    ("is_potentially_hazardous", 1),
    ("close_approach_date", "17/05/2026"),       # wrong format
    ("close_approach_date", "1850-01-01"),       # before 1900
    ("close_approach_date", "2300-01-01"),       # after 2200
    ("close_approach_date", 20260517),           # number instead of text
    ("neo_reference_id", "12AB"),                # digits only
    ("neo_reference_id", "12345678901"),         # more than 10 digits
    ("neo_reference_id", 9000001),               # number instead of text
    ("name", ""),
    ("name", "   "),
    ("name", "x" * 101),
    ("name", None),
])
def test_invalid_values_are_422(client, auth, owner_db, new_asteroid, field, value):
    new_asteroid[field] = value
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=auth).status_code == 422
    assert count(owner_db) == 14


def test_nan_and_infinity_are_rejected(client, auth, new_asteroid):
    for bad in ("NaN", "Infinity"):
        body = '{"neo_reference_id":"9000001","name":"x","estimated_diameter_km":%s,' \
               '"close_approach_date":"2026-01-01","relative_velocity_km_h":1,' \
               '"miss_distance_km":1,"absolute_magnitude":1}' % bad
        r = client.post("/api/v1/asteroids", content=body,
                        headers={**auth, "content-type": "application/json"})
        assert r.status_code == 422


def test_unknown_and_server_managed_fields_are_rejected(client, auth, new_asteroid):
    for extra in ({"created_by": 2}, {"created_at": "2020-01-01T00:00:00Z"}, {"colour": "red"}):
        assert client.post("/api/v1/asteroids", json={**new_asteroid, **extra}, headers=auth).status_code == 422


def test_empty_body_is_422(client, auth):
    assert client.post("/api/v1/asteroids", json={}, headers=auth).status_code == 422
    assert client.post("/api/v1/asteroids", headers=auth).status_code == 422


def test_malformed_json_is_400(client, auth):
    r = client.post("/api/v1/asteroids", content="{not json",
                    headers={**auth, "content-type": "application/json"})
    assert r.status_code == 400
    assert "JSON" in r.json()["detail"]


def test_duplicate_id_is_409(client, auth, new_asteroid):
    new_asteroid["neo_reference_id"] = "2099942"
    r = client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert r.status_code == 409 and "neo_reference_id" in r.json()["detail"]


def test_duplicate_name_ignores_case_and_is_409(client, auth, new_asteroid):
    new_asteroid["name"] = "99942 APOPHIS (2004 mn4)"
    r = client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert r.status_code == 409 and "name" in r.json()["detail"]


def test_update_to_a_duplicate_name_is_409(client, auth):
    r = client.patch("/api/v1/asteroids/2162117", json={"name": "99942 Apophis (2004 MN4)"}, headers=auth)
    assert r.status_code == 409


def test_update_rejects_bad_requests(client, auth):
    url = "/api/v1/asteroids/2162117"
    assert client.patch(url, json={}, headers=auth).status_code == 422                    # nothing to change
    assert client.patch(url, json={"name": None}, headers=auth).status_code == 422        # null is not "unchanged"
    assert client.patch(url, json={"neo_reference_id": "1"}, headers=auth).status_code == 422  # ID is fixed
    assert client.patch(url, json={"estimated_diameter_km": -5}, headers=auth).status_code == 422
    assert client.patch(url, json={"is_potentially_hazardous": "no"}, headers=auth).status_code == 422
