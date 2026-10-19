"""Phase 3: what the PUBLIC Supabase key can do through the Data API (REST over HTTPS).

The publishable key is meant to be safe in a browser, so Row Level Security (RLS)
must stop it. The asteroids table has RLS on and no policy for the anon role, so
every request with this key should get nothing.

Usage:
    SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... python test_supabase_api.py
"""
import os
import sys
from datetime import datetime, timezone

from supabase import __version__ as supabase_version
from supabase import create_client

from sample_records import mask

results = []


def check(label, passed, detail):
    results.append(passed)
    print(f"[{'PASS' if passed else 'FAIL'}] {label}")
    print(f"       {detail}")


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.")

    print("Supabase: Data API checks with the PUBLIC (publishable) key"
          f"  |  run at {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC")
    print(f"Package: supabase {supabase_version}")
    print(f"SUPABASE_URL={url}")
    print(f"SUPABASE_PUBLISHABLE_KEY={mask(key, 15)}")
    print()

    client = create_client(url, key)
    table = client.table("asteroids")

    rows = table.select("*").execute().data
    check("Public key: read all asteroids", rows == [],
          f"returned {len(rows)} rows (RLS hides every row from the anon role)")

    try:
        table.insert({"neo_reference_id": "TEST-ANON", "name": "Anon insert",
                      "estimated_diameter_km": 1.0}).execute()
        check("Public key: insert a record", False, "insert was accepted")
    except Exception as e:
        code = getattr(e, "code", None)
        message = getattr(e, "message", str(e))
        check("Public key: insert a record", True, f"rejected: code {code}: {message}")

    updated = table.update({"estimated_diameter_km": 999}).eq("neo_reference_id", "2000433").execute().data
    check("Public key: update 433 Eros", updated == [],
          f"{len(updated)} rows changed (RLS: the row is invisible, so nothing is updated)")

    deleted = table.delete().eq("neo_reference_id", "2000433").execute().data
    check("Public key: delete 433 Eros", deleted == [],
          f"{len(deleted)} rows deleted")

    bad = create_client(url, "sb_publishable_not_a_real_key_000000")
    try:
        bad.table("asteroids").select("*").execute()
        check("Invalid API key", False, "request was accepted")
    except Exception as e:
        code = getattr(e, "code", None)
        message = getattr(e, "message", None) or str(e)
        details = getattr(e, "details", None) or ""
        check("Invalid API key", True, f"rejected: code {code}: {message} {details}"[:200])

    print()
    print(f"Summary: {sum(results)}/{len(results)} checks passed")


if __name__ == "__main__":
    main()
