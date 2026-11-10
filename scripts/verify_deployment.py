"""Run the Phase 7 checklist against a running API (local or deployed).

    python scripts/verify_deployment.py https://aegisneo-api.vercel.app <username>

The password is asked for on the terminal (or read from VERIFY_PASSWORD).
It creates one test asteroid, changes it, deletes it and checks the database
state after every step. Use --after-redeploy after redeploying the API to
confirm that the data is still there (the test asteroid must stay deleted).
Only the standard library is used, so it runs anywhere Python runs.
"""
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

TEST_ID = "9999901"
TEST_RECORD = {
    "neo_reference_id": TEST_ID,
    "name": "Deployment Check Rock (2026 ZZ)",
    "estimated_diameter_km": 0.25,
    "is_potentially_hazardous": False,
    "close_approach_date": "2026-05-17",
    "relative_velocity_km_h": 54000.5,
    "miss_distance_km": 4200000.0,
    "absolute_magnitude": 21.3,
}
results = []


def call(base, method, path, token=None, body=None, form=None):
    headers = {}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read() or b"null")
        except ValueError:
            return err.code, None


def check(label, condition, detail=""):
    results.append(condition)
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}" + (f"   {detail}" if detail else ""))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    after_redeploy = "--after-redeploy" in sys.argv
    if len(args) != 2:
        sys.exit(__doc__)
    base, username = args[0].rstrip("/"), args[1]
    password = os.environ.get("VERIFY_PASSWORD") or getpass.getpass("Password: ")

    print(f"\nTarget: {base}\n")
    status, body = call(base, "GET", "/health")
    check("1. API is reachable and connected to the database", status == 200 and body.get("database") == "ok",
          f"GET /health -> {status} {body}")

    status, guest = call(base, "GET", "/api/v1/asteroids")
    check("   guest sees only the featured asteroids", status == 200 and guest["total"] == 10 and guest["access"] == "guest",
          f"total={guest and guest.get('total')}")

    status, login = call(base, "POST", "/api/v1/auth/login", form={"username": username, "password": password})
    check("   login works", status == 200 and "access_token" in (login or {}), f"POST /auth/login -> {status}")
    if status != 200:
        sys.exit("Cannot continue without a token.")
    token = login["access_token"]

    status, listing = call(base, "GET", "/api/v1/asteroids?limit=3", token)
    total = listing["total"]
    check("3. existing records are retrieved from the database", status == 200 and total >= 10,
          f"total={total}, first={listing['asteroids'][0]['name']!r}")

    if after_redeploy:
        print("\nAfter a redeploy:")
        status, _ = call(base, "GET", f"/api/v1/asteroids/{TEST_ID}", token)
        check("10. the records are still there and the deleted test record is still deleted",
              total >= 10 and status == 404, f"total={total}, test record -> {status}")
    else:
        status, created = call(base, "POST", "/api/v1/asteroids", token, TEST_RECORD)
        check("4. create a record through the API", status == 201 and created["neo_reference_id"] == TEST_ID,
              f"POST -> {status}")
        status, fetched = call(base, "GET", f"/api/v1/asteroids/{TEST_ID}", token)
        check("5. the new record is in the database", status == 200 and fetched == created, f"GET -> {status}")
        status, after = call(base, "GET", "/api/v1/asteroids?limit=1", token)
        check("   the catalog grew by one", after["total"] == total + 1, f"total {total} -> {after['total']}")

        status, updated = call(base, "PATCH", f"/api/v1/asteroids/{TEST_ID}", token, {"estimated_diameter_km": 0.5})
        check("6. update the record through the API", status == 200 and updated["estimated_diameter_km"] == 0.5,
              f"PATCH -> {status}")
        status, fetched = call(base, "GET", f"/api/v1/asteroids/{TEST_ID}", token)
        check("7. the change is in the database, other fields untouched",
              fetched["estimated_diameter_km"] == 0.5 and fetched["name"] == TEST_RECORD["name"])

        status, _ = call(base, "DELETE", f"/api/v1/asteroids/{TEST_ID}", token)
        check("8. delete the record through the API", status == 200, f"DELETE -> {status}")
        status, _ = call(base, "GET", f"/api/v1/asteroids/{TEST_ID}", token)
        check("9. the record is gone", status == 404, f"GET -> {status}")
        status, final = call(base, "GET", "/api/v1/asteroids?limit=1", token)
        check("   the catalog is back to its original size", final["total"] == total, f"total={final['total']}")
        print("\nStep 10: redeploy the API, then run this script again with --after-redeploy.")

    print(f"\n{sum(results)} of {len(results)} checks passed.")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
