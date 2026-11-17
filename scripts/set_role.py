"""Change the role of an existing account. Run on your own machine as the owner:

    DATABASE_OWNER_URL=... python scripts/set_role.py <username> <admin|user>
    DATABASE_OWNER_URL=... python scripts/set_role.py --list

The change applies at once: the API reads the role from the database before
every create, update and delete.
"""
import os
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config import load_dotenv  # noqa: E402

ROLES = ("admin", "user")


def main():
    load_dotenv()
    url = os.environ.get("DATABASE_OWNER_URL")
    if not url:
        sys.exit("Set DATABASE_OWNER_URL (the owner connection string) first.")

    if sys.argv[1:] == ["--list"]:
        with psycopg.connect(url, connect_timeout=15) as conn:
            rows = conn.execute("select username, role from public.users order by id").fetchall()
        for username, role in rows:
            print(f"{username:<30} {role}")
        return

    if len(sys.argv) != 3 or sys.argv[2] not in ROLES:
        sys.exit("Usage: python scripts/set_role.py <username> <admin|user>   (or --list)")
    username, role = sys.argv[1], sys.argv[2]
    with psycopg.connect(url, connect_timeout=15) as conn:
        row = conn.execute(
            "update public.users set role = %s where username = %s returning username", [role, username]
        ).fetchone()
    if row is None:
        sys.exit(f"There is no account '{username}'.")
    print(f"Account '{username}' now has the {role} role.")


if __name__ == "__main__":
    main()
