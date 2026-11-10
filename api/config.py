"""Settings read from environment variables.

For local development a .env file in the repository root is read once, but
only for names that are not already set, so real environment variables
(Vercel) always win. .env is ignored by git.
"""
import hmac
import os
from pathlib import Path

API_VERSION = "2.0"


def load_dotenv(path=None):
    path = Path(path) if path else Path(__file__).resolve().parent.parent / ".env"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


load_dotenv()


def database_url():
    return os.environ.get("DATABASE_URL", "")


def jwt_secret():
    return os.environ.get("JWT_SECRET", "")


def jwt_expire_minutes():
    try:
        return max(1, int(os.environ.get("JWT_EXPIRE_MINUTES", "60")))
    except ValueError:
        return 60


def partner_keys():
    """Partner site keys from AEGISNEO_API_KEYS ("client:key,client:key")."""
    keys = {}
    for pair in os.environ.get("AEGISNEO_API_KEYS", "").split(","):
        if ":" not in pair:
            continue
        client, key = pair.split(":", 1)
        if client.strip() and key.strip():
            keys[client.strip()] = key.strip()
    return keys


def match_partner_key(candidate):
    """Return the client name for a valid partner key, else None.

    Every configured key is compared in constant time.
    """
    found = None
    for client, key in partner_keys().items():
        if hmac.compare_digest(candidate.encode(), key.encode()):
            found = client
    return found
