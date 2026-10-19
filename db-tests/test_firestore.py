"""Phase 3: connectivity and security checks for Cloud Firestore.

Usage:
    python test_firestore.py
"""
import os
import time
from datetime import datetime, timezone

import firebase_admin
import requests
from google.api_core import exceptions as gexc
from google.auth.transport.requests import AuthorizedSession

from fs_common import COLLECTION, connect

results = []


def check(label, status, detail):
    """status: True = PASS, False = FAIL, None = FINDING (behaviour to note, not a test failure)."""
    if status is not None:
        results.append(status)
    tag = {True: "PASS", False: "FAIL", None: "NOTE"}[status]
    print(f"[{tag}] {label}")
    print(f"       {detail}")


def main():
    project = os.environ["FIREBASE_PROJECT_ID"]
    print("Firestore: Phase 3 connectivity and security checks"
          f"  |  run at {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC")
    print(f"Package: firebase-admin {firebase_admin.__version__}")
    if os.environ.get("AEGIS_IMPERSONATE"):
        print("Credentials: short-lived impersonated token (AEGIS_IMPERSONATE)")
    else:
        print("Credentials: service-account key file from GOOGLE_APPLICATION_CREDENTIALS "
              "(path only, contents never printed)")
    print(f"FIREBASE_PROJECT_ID={project}")
    print()

    t0 = time.perf_counter()
    db, email, google_cred = connect()
    col = db.collection(COLLECTION)
    count = len(list(col.stream()))
    ms = (time.perf_counter() - t0) * 1000
    check("Connect with the Admin SDK as the limited service account", True,
          f"{email}: read {count} documents in {ms:.0f} ms (includes connection setup)")

    # CRUD with a temporary test document
    ref = col.document("TEST-0001")
    ref.create({"neo_reference_id": "TEST-0001", "name": "Phase 3 test asteroid",
                "estimated_diameter_km": 1.0})
    created = ref.get().to_dict()["name"]
    ref.update({"estimated_diameter_km": 2.5})
    updated = ref.get().to_dict()["estimated_diameter_km"]
    ref.delete()
    gone = not ref.get().exists
    check("Create, read, update and delete with the service account",
          created == "Phase 3 test asteroid" and updated == 2.5 and gone,
          f"create+get -> '{created}', update -> {updated}, deleted -> {gone}")

    # Invalid input: Firestore has no schema, so the database itself accepts bad data
    bad = col.document("TEST-0002")
    bad.set({"neo_reference_id": "TEST-0002", "name": "Bad diameter", "estimated_diameter_km": -5})
    check("Invalid input: negative diameter", None,
          f"ACCEPTED (stored value {bad.get().get('estimated_diameter_km')}): Firestore has no "
          "schema or CHECK constraints, so validation must be done in the API code")
    bad.set({"neo_reference_id": "TEST-0002", "estimated_diameter_km": "abc"})
    check("Invalid input: text in a number field, missing name", None,
          f"ACCEPTED (stored {bad.get().to_dict()}): no types or required fields enforced")
    bad.delete()

    try:
        col.document("2000433").create({"name": "Duplicate Eros", "estimated_diameter_km": 1.0})
        check("Duplicate ID 2000433 with create()", False, "duplicate was accepted")
    except gexc.AlreadyExists as e:
        check("Duplicate ID 2000433 with create()", True,
              f"rejected with AlreadyExists (HTTP 409): {e.message[:100]}")
    check("Duplicate ID with set()", None,
          "set() would silently OVERWRITE the existing document (not run, to keep the data); "
          "the API must use create() for inserts")

    # Unauthorized requests
    rest = (f"https://firestore.googleapis.com/v1/projects/{project}"
            f"/databases/(default)/documents/{COLLECTION}")
    r = requests.get(rest, timeout=20)
    check("Unauthorized: REST read with no credentials (Security Rules: deny all)",
          r.status_code in (401, 403),
          f"HTTP {r.status_code} {r.json().get('error', {}).get('status')}: "
          f"{r.json().get('error', {}).get('message', '')[:90]}")

    r = requests.get(rest, headers={"Authorization": "Bearer not-a-real-token"}, timeout=20)
    check("Unauthorized: REST read with an invalid token",
          r.status_code == 401,
          f"HTTP {r.status_code} {r.json().get('error', {}).get('status')}")

    label = "Unauthorized: service account tries an admin action (read project IAM policy)"
    try:
        session = AuthorizedSession(google_cred)
        r = session.post(f"https://cloudresourcemanager.googleapis.com/v1/projects/{project}:getIamPolicy",
                         json={}, timeout=20)
        check(label, r.status_code == 403,
              f"HTTP {r.status_code} {r.json().get('error', {}).get('status')}: the role "
              "'Cloud Datastore User' only allows reading and writing data")
    except Exception as e:
        check(label, False, f"could not run the check: {type(e).__name__}: {str(e)[:120]}")

    # Persistence: a brand-new client (like a restarted app) still sees the data
    firebase_admin.delete_app(firebase_admin.get_app())
    db2, _, _ = connect()
    snaps = list(db2.collection(COLLECTION).order_by("name").stream())
    oldest = min((s.get("created_at") for s in snaps if s.to_dict().get("created_at")), default=None)
    check("Persistence: data still there from a new client (simulated app restart)",
          len(snaps) >= 1,
          f"{len(snaps)} documents; oldest created at "
          f"{oldest:%Y-%m-%d %H:%M:%S %Z}" if oldest else f"{len(snaps)} documents")

    print()
    print(f"Summary: {sum(results)}/{len(results)} checks passed "
          f"(plus 3 NOTE findings about Firestore's schemaless design)")


if __name__ == "__main__":
    main()
