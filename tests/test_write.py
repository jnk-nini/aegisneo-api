"""Functional and integration tests: create, update and delete, checked in the database."""


def stored(owner_db, neo_id):
    return owner_db.execute("select * from asteroids where neo_reference_id = %s", [neo_id]).fetchone()


def test_create_returns_201_and_the_stored_record(client, auth, owner_db, new_asteroid):
    r = client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert r.status_code == 201
    body = r.json()
    assert body["neo_reference_id"] == "9000001"
    assert body["is_featured"] is False
    assert body["created_by"] == 1  # alice
    # The same record is in the table...
    row = stored(owner_db, "9000001")
    assert row is not None and row[1] == "Test Rock (2026 AB)"
    # ...and comes back identical from another endpoint.
    assert client.get("/api/v1/asteroids/9000001", headers=auth).json() == body


def test_create_trims_the_name(client, auth, new_asteroid):
    new_asteroid["name"] = "   Padded Rock   "
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=auth).json()["name"] == "Padded Rock"


def test_update_changes_only_submitted_fields(client, auth, owner_db):
    before = client.get("/api/v1/asteroids/2101955", headers=auth).json()
    r = client.patch("/api/v1/asteroids/2101955", json={"estimated_diameter_km": 0.49}, headers=auth)
    assert r.status_code == 200
    after = r.json()
    assert after["estimated_diameter_km"] == 0.49
    for field in ("name", "close_approach_date", "relative_velocity_km_h", "miss_distance_km",
                  "absolute_magnitude", "is_potentially_hazardous", "is_featured", "created_at"):
        assert after[field] == before[field]
    assert after["updated_at"] > before["updated_at"]
    assert stored(owner_db, "2101955")[2] == 0.49


def test_update_missing_asteroid_is_404(client, auth):
    assert client.patch("/api/v1/asteroids/0000000", json={"name": "x"}, headers=auth).status_code == 404


def test_delete_then_it_is_gone(client, auth, owner_db, new_asteroid):
    client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    r = client.delete("/api/v1/asteroids/9000001", headers=auth)
    assert r.status_code == 200 and r.json()["neo_reference_id"] == "9000001"
    assert client.get("/api/v1/asteroids/9000001", headers=auth).status_code == 404
    assert stored(owner_db, "9000001") is None
    assert client.get("/api/v1/asteroids", headers=auth).json()["total"] == 14


def test_delete_missing_asteroid_is_404(client, auth):
    assert client.delete("/api/v1/asteroids/0000000", headers=auth).status_code == 404
    # deleting twice: the second time the record no longer exists
    assert client.delete("/api/v1/asteroids/2162117", headers=auth).status_code == 200
    assert client.delete("/api/v1/asteroids/2162117", headers=auth).status_code == 404


def test_a_new_asteroid_can_be_found_by_search(client, auth, new_asteroid):
    client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    body = client.get("/api/v1/asteroids?search=Test Rock", headers=auth).json()
    assert body["matched"] == 1


def test_stats_reflect_changes_made_while_running(client, auth, new_asteroid):
    assert client.get("/api/v1/stats", headers=auth).json()["total"] == 14
    client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert client.get("/api/v1/stats", headers=auth).json()["total"] == 15


def test_featured_limit_is_ten(client, auth, new_asteroid):
    new_asteroid["is_featured"] = True
    r = client.post("/api/v1/asteroids", json=new_asteroid, headers=auth)
    assert r.status_code == 409 and "10" in r.json()["detail"]
    # Free a place, and the same request succeeds.
    client.patch("/api/v1/asteroids/2162173", json={"is_featured": False}, headers=auth)
    assert client.post("/api/v1/asteroids", json=new_asteroid, headers=auth).status_code == 201


def test_featuring_an_eleventh_by_update_is_409(client, auth):
    r = client.patch("/api/v1/asteroids/2162117", json={"is_featured": True}, headers=auth)
    assert r.status_code == 409
    # an already featured asteroid can be re-saved as featured
    assert client.patch("/api/v1/asteroids/2099942", json={"is_featured": True}, headers=auth).status_code == 200


def test_new_featured_asteroid_becomes_visible_to_guests(client, auth):
    client.patch("/api/v1/asteroids/2162173", json={"is_featured": False}, headers=auth)
    client.patch("/api/v1/asteroids/2162117", json={"is_featured": True}, headers=auth)
    ids = {a["neo_reference_id"] for a in client.get("/api/v1/asteroids").json()["asteroids"]}
    assert "2162117" in ids and "2162173" not in ids
