"""Check that the API can reach the database (Phase 4 evidence).

Uses DATABASE_URL, the same limited connection the API uses. It prints what
the connection is allowed to see and do, and never prints the password or
the full connection string.

    python scripts/check_connection.py
"""
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config import load_dotenv  # noqa: E402


def masked_host(url):
    host = urlparse(url).hostname or "?"
    first, _, rest = host.partition(".")
    return f"{first[:6]}…{first[-8:]}.{rest}" if len(first) > 14 else host


def main():
    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (put it in .env).")

    print(f"Host      : {masked_host(url)}")
    print(f"Pooled    : {'yes' if '-pooler' in (urlparse(url).hostname or '') else 'no'}")
    with psycopg.connect(url, connect_timeout=10, prepare_threshold=None) as conn:
        version = conn.execute("show server_version").fetchone()[0]
        user, db = conn.execute("select current_user, current_database()").fetchone()
        ssl = conn.execute("select ssl from pg_stat_ssl where pid = pg_backend_pid()").fetchone()
        print(f"Connected : yes (PostgreSQL {version})")
        print(f"Role      : {user}   Database: {db}")
        print(f"TLS       : {'encrypted' if ssl and ssl[0] else 'NOT encrypted'}")

        total, featured = conn.execute(
            "select count(*), count(*) filter (where is_featured) from asteroids"
        ).fetchone()
        users = conn.execute("select count(*) from users").fetchone()[0]
        print(f"asteroids : {total} rows ({featured} featured)   users: {users} rows")
        print("\nFirst 3 asteroids:")
        for row in conn.execute(
            "select neo_reference_id, name, estimated_diameter_km, is_potentially_hazardous "
            "from asteroids order by neo_reference_id limit 3"
        ):
            print("  ", row)

        print("\nWhat this role may NOT do (each must be refused):")
        refused = 0
        for label, sql in [
            ("create a table", "create table should_not_exist (a int)"),
            ("drop the asteroids table", "drop table asteroids"),
            ("create a user account", "insert into users (username, password_hash) values ('x', repeat('x', 60))"),
            ("change a password hash", "update users set password_hash = repeat('y', 60)"),
        ]:
            try:
                conn.execute(sql)
                print(f"   {label}: ALLOWED  <-- unexpected")
            except psycopg.errors.InsufficientPrivilege:
                refused += 1
                print(f"   {label}: refused (permission denied)")
            finally:
                conn.rollback()
        print(f"\n{refused} of 4 forbidden operations refused.")


if __name__ == "__main__":
    main()
