"""Who is calling, and what they may do (see Table 12 of the design).

Callers:
  guest    no credentials
  user     "Authorization: Bearer <token>" from POST /api/v1/auth/login.
           Each account has a role, stored in the users table (admin or user).
  partner  "x-api-key" of a partner site, with no user: treated as a guest
           of that site
  ticket   a partner site forwards the "ticket" the main site gave the visitor
           (POST /api/v1/sites/<slug>/launch) together with its own key. The
           ticket is only valid for that one site and is read only.

What a caller may do is not decided here but by the site_access table: one
row per (role, site) says whether the role can write and how many asteroids
it may see. The site is the main site, or the partner whose key was sent.
"""
import logging
import time
from dataclasses import dataclass
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer

from api import config, db

log = logging.getLogger("aegisneo.auth")

ALGORITHM = "HS256"
MIN_SECRET_LENGTH = 32

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
api_key_scheme = APIKeyHeader(name="x-api-key", auto_error=False)

# Checked when the username does not exist, so that a login attempt takes
# about the same time whether or not the account is real.
_DUMMY_HASH = bcrypt.hashpw(b"unused", bcrypt.gensalt())


MAIN_SITE = "aegisneo"


@dataclass
class Caller:
    kind: str  # "guest", "user" or "partner"
    user_id: Optional[int] = None
    username: Optional[str] = None
    role: Optional[str] = None  # "admin" or "user" for an account, from the token
    client: Optional[str] = None
    site: str = MAIN_SITE  # the site the request is made for
    ticket: bool = False  # the token is a read-only ticket for a partner site

    @property
    def effective_role(self):
        """The role the access rules are looked up with."""
        return self.role if self.kind == "user" and self.role else "guest"


@dataclass
class Access:
    role: str
    site: str
    can_write: bool
    item_limit: Optional[int]  # None = the whole catalog

    @property
    def limited(self):
        return self.item_limit is not None

    @property
    def label(self):
        return "limited" if self.limited else "full"


class AuthConfigError(Exception):
    """JWT_SECRET is missing or too short."""


def _secret():
    secret = config.jwt_secret()
    if len(secret) < MIN_SECRET_LENGTH:
        log.error("JWT_SECRET is missing or shorter than %d characters", MIN_SECRET_LENGTH)
        raise AuthConfigError()
    return secret


def check_login_configured():
    """Raise AuthConfigError (503) if tokens cannot be signed."""
    _secret()


def password_matches(password, password_hash):
    hashed = password_hash.encode() if password_hash else _DUMMY_HASH
    ok = bcrypt.checkpw(password.encode()[:72], hashed)  # bcrypt reads at most 72 bytes
    return ok and password_hash is not None


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def create_token(user_id, username, role):
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + config.jwt_expire_minutes() * 60,
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def create_ticket(user_id, username, role, site):
    """A read-only token for one partner site (aud = the site's slug)."""
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "aud": site,
        "typ": "ticket",
        "iat": now,
        "exp": now + config.launch_ticket_minutes() * 60,
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def get_caller(
    token: Optional[str] = Depends(oauth2_scheme),
    x_api_key: Optional[str] = Depends(api_key_scheme),
):
    client = None
    if x_api_key:
        client = config.match_partner_key(x_api_key)
        if client is None:
            raise HTTPException(401, "Invalid API key.")
    if token:
        try:
            # The audience is checked below, by hand, so that a ticket for one
            # site is refused with a clear message on any other.
            payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM],
                                 options={"require": ["exp", "sub"], "verify_aud": False})
            user_id = int(payload["sub"])
        except (jwt.PyJWTError, ValueError):
            # An invalid or expired token is a 401, not a silent downgrade to
            # guest, so the website knows the user has to log in again.
            raise HTTPException(401, "Invalid or expired token.", headers={"WWW-Authenticate": "Bearer"})
        audience = payload.get("aud")
        if audience is not None:
            if client != audience:
                raise HTTPException(401, "This ticket belongs to a different site.", headers={"WWW-Authenticate": "Bearer"})
            return Caller("user", user_id=user_id, username=payload.get("username"),
                          role=payload.get("role"), client=client, site=client, ticket=True)
        return Caller("user", user_id=user_id, username=payload.get("username"),
                      role=payload.get("role"), client=client, site=client or MAIN_SITE)
    if client:
        return Caller("partner", client=client, site=client)
    return Caller("guest")


def get_access(caller: Caller = Depends(get_caller)):
    """The rule for this caller's role on this site, from the site_access table.

    For an account the role is read from the database on every request, not
    taken from the token: a deleted account, or one that was demoted, loses
    access at once instead of when its token expires."""
    if caller.kind == "user":
        row = db.get_user_access(caller.user_id, caller.site)
        if row is None:
            raise db.UnknownUserError()
        if row["can_write"] is None:
            raise HTTPException(403, "This role has no access to this site.")
        return Access(row["role"], caller.site, row["can_write"], row["item_limit"])
    row = db.get_site_access(caller.effective_role, caller.site)
    if row is None:
        raise HTTPException(403, "This role has no access to this site.")
    return Access(caller.effective_role, caller.site, row["can_write"], row["item_limit"])


def require_admin(caller: Caller = Depends(get_caller)):
    """Create, update and delete: an account whose role may write on the main site.

    The role is read from the database on every change, not taken from the
    token, so an account that is changed to "user" (or deleted) loses write
    access at once instead of when its token expires. A partner site's ticket
    or key never writes.
    """
    if caller.kind == "guest":
        raise HTTPException(401, "Log in to change data.", headers={"WWW-Authenticate": "Bearer"})
    if caller.kind == "partner":
        raise HTTPException(403, "This API key is read-only.")
    if caller.ticket or caller.site != MAIN_SITE:
        raise HTTPException(403, "Data can only be changed on the AegisNEO main site.")
    role = db.get_user_role(caller.user_id)
    if role is None:
        raise db.UnknownUserError()
    access = db.get_site_access(role, MAIN_SITE)
    if not (access and access["can_write"]):
        raise HTTPException(403, f"Only an admin can change data. Your account has the {role} role.")
    caller.role = role
    return caller


def require_logged_in(caller: Caller = Depends(get_caller)):
    """/auth/me and the pages of an account: a real user on the main site."""
    if caller.kind != "user" or caller.ticket:
        raise HTTPException(401, "Log in to view your account.", headers={"WWW-Authenticate": "Bearer"})
    return caller
