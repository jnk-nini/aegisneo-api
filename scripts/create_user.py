"""Create a login account. Run on your own machine as the owner role:

    DATABASE_OWNER_URL=... python scripts/create_user.py <username>

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
MIN_PASSWORD = 8
MAX_PASSWORD_BYTES = 72  # bcrypt ignores everything after 72 bytes


def main():
    load_dotenv()
    if len(sys.argv) != 2:
        sys.exit("Usage: python scripts/create_user.py <username>")
    username = sys.argv[1]
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
                "insert into public.users (username, password_hash) values (%s, %s)", [username, hashed]
            )
    except psycopg.errors.UniqueViolation:
        sys.exit(f"The username '{username}' already exists.")
    print(f"Account '{username}' created.")


if __name__ == "__main__":
    main()
