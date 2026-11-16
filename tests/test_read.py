"""Functional tests: reading, searching and filtering."""
from tests.conftest import FEATURED_IDS, OTHER_IDS


def test_home_counts_rows_from_the_database(client):
    body = client.get("/").json()
    assert body["total_tracked"] == 14


def test_guest_list_shows_only_featured(client):
    r = client.get("/api/v1/asteroids")
    assert r.status_code == 200
    body = r.json()
    assert body["access"] == "guest"
    assert body["count"] == body["matched"] == body["total"] == 10
    assert {a["neo_reference_id"] for a in body["asteroids"]} == set(FEATURED_IDS)


def test_user_list_shows_everything(client, auth):
    body = client.get("/api/v1/asteroids", headers=auth).json()
    assert body["access"] == "full"
    assert body["total"] == body["matched"] == 14


def test_partner_list_shows_everything(client, partner):
    assert client.get("/api/v1/asteroids", headers=partner).json()["total"] == 14


def test_response_keeps_the_original_fields(client, auth):
    row = client.get("/api/v1/asteroids/2099942", headers=auth).json()
    assert row["name"] == "99942 Apophis (2004 MN4)"
    assert row["estimated_diameter_km"] == 0.6539
    assert row["close_approach_date"] == "1930-08-09"
    assert row["is_potentially_hazardous"] is True
    for field in ("relative_velocity_km_h", "miss_distance_km", "absolute_magnitude"):
        assert isinstance(row[field], float)


def test_search_by_name_is_case_insensitive(client):
    body = client.get("/api/v1/asteroids?search=apophis").json()
    assert body["matched"] == 1 and body["query"] == "apophis"
    assert body["asteroids"][0]["neo_reference_id"] == "2099942"


def test_search_by_id(client, auth):
    body = client.get("/api/v1/asteroids?search=2162117", headers=auth).json()
    assert [a["neo_reference_id"] for a in body["asteroids"]] == ["2162117"]


def test_text_search_does_not_look_at_ids(client, auth):
    # "Test" is not digits, so only names are searched; an ID fragment is.
    assert client.get("/api/v1/asteroids?search=2099942", headers=auth).json()["matched"] == 1
    assert client.get("/api/v1/asteroids?search=99942", headers=auth).json()["matched"] == 1


def test_search_treats_wildcards_literally(client, auth):
    assert client.get("/api/v1/asteroids?search=%25", headers=auth).json()["matched"] == 0
    assert client.get("/api/v1/asteroids?search=_", headers=auth).json()["matched"] == 0


def test_hazard_and_diameter_filters_with_sorting(client, auth):
    body = client.get(
        "/api/v1/asteroids?hazardous=true&min_diameter=1&sort=diameter&order=desc&limit=3", headers=auth
    ).json()
    sizes = [a["estimated_diameter_km"] for a in body["asteroids"]]
    assert body["count"] == len(sizes) <= 3
    assert sizes == sorted(sizes, reverse=True)
    assert all(a["is_potentially_hazardous"] and a["estimated_diameter_km"] >= 1 for a in body["asteroids"])


def test_date_range_filter(client, auth):
    body = client.get("/api/v1/asteroids?from_date=2000-01-01&to_date=2010-12-31", headers=auth).json()
    assert body["matched"] > 0
    assert all("2000-01-01" <= a["close_approach_date"] <= "2010-12-31" for a in body["asteroids"])


def test_paging(client, auth):
    first = client.get("/api/v1/asteroids?limit=5", headers=auth).json()
    second = client.get("/api/v1/asteroids?limit=5&offset=5", headers=auth).json()
    assert first["count"] == second["count"] == 5
    assert first["matched"] == 14
    assert not {a["neo_reference_id"] for a in first["asteroids"]} & \
        {a["neo_reference_id"] for a in second["asteroids"]}
    past_end = client.get("/api/v1/asteroids?offset=100", headers=auth).json()
    assert past_end["count"] == 0 and past_end["matched"] == 14


def test_random_respects_access_and_count(client, auth):
    guest = client.get("/api/v1/asteroids/random?count=5").json()
    assert guest["count"] == 5 and guest["matched"] == 10
    assert all(a["neo_reference_id"] in FEATURED_IDS for a in guest["asteroids"])
    full = client.get("/api/v1/asteroids/random?count=20", headers=auth).json()
    assert full["count"] == 14 and full["matched"] == 14


def test_get_one_asteroid(client):
    r = client.get("/api/v1/asteroids/2099942")
    assert r.status_code == 200 and r.json()["neo_reference_id"] == "2099942"


def test_missing_asteroid_is_404(client, auth):
    assert client.get("/api/v1/asteroids/0000000", headers=auth).status_code == 404
    assert client.get("/api/v1/asteroids/not-an-id", headers=auth).status_code == 404


def test_stats_come_from_sql_aggregates(client, auth, catalog):
    body = client.get("/api/v1/stats", headers=auth).json()
    rows = [catalog[i] for i in FEATURED_IDS + OTHER_IDS]
    assert body["total"] == 14
    assert body["potentially_hazardous"] == sum(r["is_potentially_hazardous"] for r in rows)
    assert body["estimated_diameter_km"]["max"] == max(r["estimated_diameter_km"] for r in rows)
    assert body["close_approach_date"]["min"] == min(r["close_approach_date"] for r in rows)


def test_invalid_query_parameters_are_422(client, auth):
    assert client.get("/api/v1/asteroids?min_diameter=5&max_diameter=1", headers=auth).status_code == 422
    assert client.get("/api/v1/asteroids?min_diameter=abc", headers=auth).status_code == 422
    assert client.get("/api/v1/asteroids?from_date=2020-01-01&to_date=2010-01-01", headers=auth).status_code == 422
    assert client.get("/api/v1/asteroids?limit=1000", headers=auth).status_code == 422
    assert client.get("/api/v1/asteroids?sort=password", headers=auth).status_code == 422
