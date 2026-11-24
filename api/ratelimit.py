"""Throttling for the endpoints that spend CPU or create rows without a login.

Counters live in the rate_limits table (not in memory), because a serverless
deployment starts many short-lived instances that share nothing. A bucket is a
fixed time window per caller: the first attempts in a window are counted, and
once the limit is passed every further attempt gets a 429 until the window ends.

Callers are identified by a hash of their address (and, for sign-in, of the
username), so the table never holds a raw IP address.

If the counters cannot be read or written (for example the migration has not
been applied yet) the request is let through and the problem is logged: a
broken limiter must not lock everyone out of the site.
"""
import hashlib
import logging
import os
import random

from fastapi import Request

from api import db

log = logging.getLogger("aegisneo.ratelimit")

# action -> (attempts allowed, window in seconds), per caller address.
IP_LIMITS = {
    "login": (30, 15 * 60),
    "signup": (10, 60 * 60),
    "reset": (10, 60 * 60),
}
# Failed guesses against one account are throttled whatever the address.
USERNAME_LIMIT = (10, 15 * 60)


class RateLimited(Exception):
    def __init__(self, retry_after):
        self.retry_after = max(1, int(retry_after))


def enabled():
    return os.environ.get("RATE_LIMIT_DISABLED", "").lower() not in ("1", "true", "yes")


def client_address(request: Request):
    """The caller's address. On Vercel the platform sets x-vercel-forwarded-for
    (a client cannot forge it); the other headers are the fallback elsewhere."""
    headers = request.headers
    for name in ("x-vercel-forwarded-for", "x-real-ip"):
        value = headers.get(name, "").strip()
        if value:
            return value.split(",")[0].strip()
    forwarded = headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _bucket(*parts):
    digest = hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]
    return f"{parts[0]}:{digest}"


def _count(bucket, window):
    """Count one attempt; returns (attempts so far in this window, seconds left)."""
    try:
        return db.hit_rate_limit(bucket, window)
    except (db.DatabaseError, db.DatabaseUnavailable):
        log.warning("rate limiter unavailable; letting the request through")
        return 0, 0


def enforce(request: Request, action, username=None):
    """Raise RateLimited when this caller has made too many attempts."""
    if not enabled():
        return
    limit, window = IP_LIMITS[action]
    address = client_address(request)
    used, left = _count(_bucket(action, "ip", address), window)
    if used > limit:
        raise RateLimited(left)
    if username is not None:
        limit, window = USERNAME_LIMIT
        used, left = _count(_bucket(action, "user", username.strip().lower()), window)
        if used > limit:
            raise RateLimited(left)
    # Old windows are only noise: sweep them now and then.
    if random.random() < 0.02:
        try:
            db.purge_rate_limits()
        except (db.DatabaseError, db.DatabaseUnavailable):
            pass
