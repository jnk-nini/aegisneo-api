"""Who is calling, and what they may do (see Table 12 of the design).

Three kinds of caller:
  guest    no credentials; may see only the featured asteroids
  user     "Authorization: Bearer <token>" from POST /api/v1/auth/login
  partner  "x-api-key" of a partner site; may read everything, change nothing
"""
import logging
import time
from dataclasses import dataclass
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer

from api import config

log = logging.getLogger("aegisneo.auth")

ALGORITHM = "HS256"
MIN_SECRET_LENGTH = 32

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
api_key_scheme = APIKeyHeader(name="x-api-key", auto_error=False)

# Checked when the username does not exist, so that a login attempt takes
# about the same time whether or not the account is real.
_DUMMY_HASH = bcrypt.hashpw(b"unused", bcrypt.gensalt())


@dataclass
class Caller:
    kind: str  # "guest", "user" or "partner"
    user_id: Optional[int] = None
    username: Optional[str] = None
    client: Optional[str] = None

    @property
    def full_access(self):
        return self.kind in ("user", "partner")


class AuthConfigError(Exception):
    """JWT_SECRET is missing or too short."""


def _secret():
    secret = config.jwt_secret()
    if len(secret) < MIN_SECRET_LENGTH:
        log.error("JWT_SECRET is missing or shorter than %d characters", MIN_SECRET_LENGTH)
        raise AuthConfigError()
    return secret


def password_matches(password, password_hash):
    hashed = password_hash.encode() if password_hash else _DUMMY_HASH
    ok = bcrypt.checkpw(password.encode()[:72], hashed)  # bcrypt reads at most 72 bytes
    return ok and password_hash is not None


def create_token(user_id, username):
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "username": username,
        "iat": now,
        "exp": now + config.jwt_expire_minutes() * 60,
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def get_caller(
    token: Optional[str] = Depends(oauth2_scheme),
    x_api_key: Optional[str] = Depends(api_key_scheme),
):
    if token:
        try:
            payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
            return Caller("user", user_id=int(payload["sub"]), username=payload.get("username"))
        except (jwt.PyJWTError, ValueError):
            # An invalid or expired token is a 401, not a silent downgrade to
            # guest, so the website knows the user has to log in again.
            raise HTTPException(401, "Invalid or expired token.", headers={"WWW-Authenticate": "Bearer"})
    if x_api_key:
        client = config.match_partner_key(x_api_key)
        if client is None:
            raise HTTPException(401, "Invalid API key.")
        return Caller("partner", client=client)
    return Caller("guest")


def require_user(caller: Caller = Depends(get_caller)):
    """Create, update and delete: a logged-in user only."""
    if caller.kind == "guest":
        raise HTTPException(401, "Log in to change data.", headers={"WWW-Authenticate": "Bearer"})
    if caller.kind == "partner":
        raise HTTPException(403, "This API key is read-only.")
    return caller


def require_full_access(caller: Caller = Depends(get_caller)):
    """Statistics: a logged-in user or a partner site."""
    if caller.kind == "guest":
        raise HTTPException(401, "Log in to view this.", headers={"WWW-Authenticate": "Bearer"})
    return caller


def require_logged_in(caller: Caller = Depends(get_caller)):
    """/auth/me: only a real user has an account to describe."""
    if caller.kind != "user":
        raise HTTPException(401, "Log in to view your account.", headers={"WWW-Authenticate": "Bearer"})
    return caller
