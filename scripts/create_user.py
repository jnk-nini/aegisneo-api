"""Create a login account. Run on your own machine as the owner role:

    DATABASE_OWNER_URL=... python scripts/create_user.py <username> [admin|user]

The role is "user" (read only) unless "admin" is given. An admin may also
create, update and delete asteroids.

The password is asked for on the terminal (or read from NEW_USER_PASSWORD), so
it never appears in the command line or the shell history. Only the bcrypt
hash is stored.
"""
import getpass
import os
import re
import sys
from pathlib import Path

import bcrypt
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config import load_dotenv  # noqa: E402

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,30}$")
ROLES = ("admin", "user")
MIN_PASSWORD = 8
MAX_PASSWORD_BYTES = 72  # bcrypt ignores everything after 72 bytes


def main():
    load_dotenv()
    if len(sys.argv) not in (2, 3):
        sys.exit("Usage: python scripts/create_user.py <username> [admin|user]")
    username = sys.argv[1]
    role = sys.argv[2] if len(sys.argv) == 3 else "user"
    if role not in ROLES:
        sys.exit("The role must be admin or user.")
    if not USERNAME_RE.match(username):
        sys.exit("The username must be 3 to 30 characters: lowercase letters, digits and underscore.")

    url = os.environ.get("DATABASE_OWNER_URL")
    if not url:
        sys.exit("Set DATABASE_OWNER_URL (the owner connection string) first.")

    password = os.environ.get("NEW_USER_PASSWORD") or getpass.getpass("Password: ")
    if len(password) < MIN_PASSWORD:
        sys.exit(f"The password must be at least {MIN_PASSWORD} characters.")
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        sys.exit(f"The password must be at most {MAX_PASSWORD_BYTES} bytes.")

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    try:
        with psycopg.connect(url, connect_timeout=15) as conn:
            conn.execute(
                "insert into public.users (username, password_hash, role) values (%s, %s, %s)",
                [username, hashed, role],
            )
    except psycopg.errors.UniqueViolation:
        sys.exit(f"The username '{username}' already exists.")
    print(f"Account '{username}' created with the {role} role.")


if __name__ == "__main__":
    main()
