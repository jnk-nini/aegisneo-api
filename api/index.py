import logging
import re
from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm

from api import auth, db, ratelimit
from api.config import API_VERSION
from api.models import AsteroidCreate, AsteroidUpdate, NewRecoveryCode, ResetPassword, SignUp

log = logging.getLogger("aegisneo")

app = FastAPI(
    title="AegisNEO API",
    description=(
        "Tracks Near-Earth Objects using real NASA/Kaggle asteroid data, stored in a Neon "
        "(PostgreSQL) database. What a caller may do depends on its role (guest, user or admin) "
        "and on the site it is using (the main site, Impactor or NEO Atlas): the rules are the "
        "rows of the site_access table. A guest sees only the featured asteroids; log in with "
        "the Authorize button to see all of them. Admins may also create, update and delete."
    ),
    version=API_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "x-api-key"],
)

@app.middleware("http")
async def response_headers(request: Request, call_next):
    """Headers every response should carry. Anything about an account, or
    answered for a signed-in caller, must never be kept by a shared cache."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    path = request.url.path
    if path.startswith(("/api/v1/auth", "/api/v1/me", "/api/v1/admin", "/api/v1/sites")) \
            or request.headers.get("authorization"):
        response.headers["Cache-Control"] = "no-store"
    return response


MAX_RESULTS = 100
MAX_RANDOM = 20
SortField = Literal["name", "diameter", "velocity", "miss_distance", "date", "magnitude"]
NEO_ID_PATTERN = re.compile(r"^[0-9]{1,10}$")


# ============================================================
# ERRORS: clear messages for the client, details only in the log
# ============================================================
@app.exception_handler(db.DatabaseUnavailable)
def database_unavailable(request, exc):
    return JSONResponse({"detail": "The database is temporarily unavailable."}, status_code=503)


@app.exception_handler(db.DatabaseError)
def database_error(request, exc):
    return JSONResponse({"detail": "The database could not complete the request."}, status_code=500)


@app.exception_handler(db.DuplicateError)
def duplicate(request, exc):
    if exc.field == "username":
        return JSONResponse({"detail": "This username is already taken."}, status_code=409)
    return JSONResponse({"detail": f"An asteroid with this {exc.field} already exists."}, status_code=409)


@app.exception_handler(db.FeaturedLimitError)
def featured_limit(request, exc):
    return JSONResponse(
        {"detail": f"At most {db.FEATURED_LIMIT} asteroids can be featured."}, status_code=409
    )


@app.exception_handler(db.WatchlistFullError)
def watchlist_full(request, exc):
    return JSONResponse({"detail": f"A watchlist holds at most {db.WATCHLIST_LIMIT} asteroids."}, status_code=409)


@app.exception_handler(db.UnknownUserError)
def unknown_user(request, exc):
    return JSONResponse({"detail": "This account no longer exists. Log in again."}, status_code=401)


@app.exception_handler(ratelimit.RateLimited)
def rate_limited(request, exc):
    return JSONResponse(
        {"detail": "Too many attempts. Please wait a few minutes and try again."},
        status_code=429, headers={"Retry-After": str(exc.retry_after)},
    )


@app.exception_handler(auth.AuthConfigError)
def auth_not_configured(request, exc):
    return JSONResponse({"detail": "Login is not available right now."}, status_code=503)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if any(error.get("type") == "json_invalid" for error in errors):
        return JSONResponse({"detail": "The request body is not valid JSON."}, status_code=400)
    # Report which field is wrong and why, but never echo the submitted value:
    # it may be a password, and values such as NaN cannot be written as JSON.
    detail = [{"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]} for e in errors]
    return JSONResponse({"detail": detail}, status_code=422)


@app.exception_handler(Exception)
def unexpected_error(request, exc):
    log.exception("unhandled error")
    return JSONResponse({"detail": "Internal server error."}, status_code=500)


# ============================================================
# HELPERS
# ============================================================
def present(row):
    """Database row -> JSON-ready dict (dates and timestamps as ISO strings)."""
    out = dict(row)
    for key, value in out.items():
        if isinstance(value, (date, datetime)):
            out[key] = value.isoformat()
    return out


def check_ranges(min_diameter, max_diameter, from_date=None, to_date=None):
    if min_diameter is not None and max_diameter is not None and min_diameter > max_diameter:
        raise HTTPException(422, "min_diameter cannot be greater than max_diameter.")
    if from_date is not None and to_date is not None and from_date > to_date:
        raise HTTPException(422, "from_date cannot be later than to_date.")


def access_label(access):
    return "guest" if access.role == "guest" else access.label


# ============================================================
# PUBLIC: home, health, login
# ============================================================
@app.get("/")
def home(response: Response):
    # The landing page reads the catalog size from here: a few minutes of
    # caching keeps a busy front page from querying the database every time.
    response.headers["Cache-Control"] = "public, s-maxage=300, stale-while-revalidate=600"
    return {
        "message": "Welcome to the AegisNEO API!",
        "total_tracked": db.count_asteroids(),
        "endpoints": [
            "POST /api/v1/auth/signup",
            "POST /api/v1/auth/login",
            "POST /api/v1/auth/reset-password",
            "POST /api/v1/auth/recovery-code",
            "GET /api/v1/auth/me",
            "GET /api/v1/asteroids",
            "GET /api/v1/asteroids?search=&hazardous=&min_diameter=&max_diameter=&from_date=&to_date=&sort=&order=&limit=&offset=",
            "GET /api/v1/asteroids/random?count=",
            "GET /api/v1/asteroids/{neo_reference_id}",
            "POST /api/v1/asteroids",
            "PATCH /api/v1/asteroids/{neo_reference_id}",
            "DELETE /api/v1/asteroids/{neo_reference_id}",
            "GET /api/v1/stats",
            "GET /api/v1/sites",
            "POST /api/v1/sites/{slug}/launch",
            "GET /api/v1/me/overview",
            "GET|PUT|DELETE /api/v1/me/watchlist[/{neo_reference_id}]",
            "GET /api/v1/admin/overview",
        ],
    }


@app.get("/health")
def health_check():
    db.ping()  # raises DatabaseUnavailable -> 503
    return {
        "status": "ok",
        "database": "ok",
        "service": "AegisNEO API",
        "version": API_VERSION,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
    }


@app.post("/api/v1/auth/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    ratelimit.enforce(request, "login", username=form.username)  # before any password work
    user = db.get_user_by_username(form.username.strip().lower())
    ok = auth.password_matches(form.password, user["password_hash"] if user else None)
    if not user or not ok:
        # Same message whether the username or the password was wrong.
        raise HTTPException(401, "Incorrect username or password.", headers={"WWW-Authenticate": "Bearer"})
    return {
        "access_token": auth.create_token(user["id"], user["username"], user["role"]),
        "token_type": "bearer",
        "role": user["role"],
        "expires_in": auth.config.jwt_expire_minutes() * 60,
    }


@app.post("/api/v1/auth/signup", status_code=201)
def signup(request: Request, data: SignUp):
    """Create an account with the user role (read only) and log it in.
    Admins are made only by the owner, with scripts/set_role.py."""
    ratelimit.enforce(request, "signup")
    auth.check_login_configured()  # 503 before anything is stored if tokens cannot be signed
    recovery_code = auth.new_recovery_code()
    user = db.create_user(data.username, auth.hash_password(data.password), auth.hash_recovery_code(recovery_code))
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        # Shown once: only its hash is stored. It lets the owner choose a new password.
        "recovery_code": recovery_code,
        "access_token": auth.create_token(user["id"], user["username"], user["role"]),
        "token_type": "bearer",
        "expires_in": auth.config.jwt_expire_minutes() * 60,
    }


@app.get("/api/v1/auth/me")
def me(caller: auth.Caller = Depends(auth.require_logged_in)):
    user = db.get_user(caller.user_id)
    if user is None:
        raise db.UnknownUserError()
    return {"id": user["id"], "username": user["username"], "role": user["role"],
            "has_recovery_code": user["has_recovery_code"]}


@app.post("/api/v1/auth/reset-password")
def reset_password(request: Request, data: ResetPassword):
    """Choose a new password with the recovery code. The code is used up: a new one is returned."""
    ratelimit.enforce(request, "reset", username=data.username)
    secrets_row = db.get_user_secrets(data.username)
    ok = auth.recovery_code_matches(data.recovery_code, secrets_row["recovery_hash"] if secrets_row else None)
    if not secrets_row or not ok:
        # The same answer whether the name, the code or the account's missing code was wrong.
        raise HTTPException(401, "The username or recovery code is not correct.")
    new_code = auth.new_recovery_code()
    db.set_credentials(secrets_row["id"], auth.hash_password(data.new_password), auth.hash_recovery_code(new_code))
    return {"message": "Password changed. Sign in with it.", "recovery_code": new_code}


@app.post("/api/v1/auth/recovery-code")
def make_recovery_code(data: NewRecoveryCode, request: Request, caller: auth.Caller = Depends(auth.require_logged_in)):
    """A new recovery code for the signed-in account (replaces the old one). Needs the password."""
    ratelimit.enforce(request, "reset")
    if not auth.password_matches(data.password, db.get_password_hash(caller.user_id)):
        raise HTTPException(403, "That password is not correct.")
    code = auth.new_recovery_code()
    if not db.set_credentials(caller.user_id, recovery_hash=auth.hash_recovery_code(code)):
        raise db.UnknownUserError()
    return {"recovery_code": code}


# ============================================================
# READ: list, random, one, stats
# ============================================================
# "total" is the size of the catalog this caller may see (all 33,511 for a
# logged-in user or partner site, 10 for a guest); "matched" is how many of
# those passed the filters.
@app.get("/api/v1/asteroids")
def get_asteroids(
    access: auth.Access = Depends(auth.get_access),
    search: Optional[str] = Query(default=None, max_length=100, description="Text match on name, on ID (digits only) or on the close approach date (for example 1968- or 1968-05)."),
    hazardous: Optional[bool] = Query(default=None, description="Only hazardous (true) or non-hazardous (false) objects."),
    min_diameter: Optional[float] = Query(default=None, ge=0, description="Minimum estimated diameter in km."),
    max_diameter: Optional[float] = Query(default=None, ge=0, description="Maximum estimated diameter in km."),
    from_date: Optional[date] = Query(default=None, description="Closest approach on or after this date."),
    to_date: Optional[date] = Query(default=None, description="Closest approach on or before this date."),
    sort: Optional[SortField] = Query(default=None, description="Field to sort by (default: neo_reference_id)."),
    order: Literal["asc", "desc"] = Query(default="asc"),
    limit: int = Query(default=MAX_RESULTS, ge=1, le=MAX_RESULTS),
    offset: int = Query(default=0, ge=0),
):
    check_ranges(min_diameter, max_diameter, from_date, to_date)
    rows, matched, visible = db.list_asteroids(
        search=search.strip() if search else None, hazardous=hazardous,
        min_diameter=min_diameter, max_diameter=max_diameter,
        from_date=from_date, to_date=to_date, sort=sort, order=order,
        limit=limit, offset=offset, item_limit=access.item_limit,
    )
    response = {
        "count": len(rows),
        "matched": matched,
        "total": visible,
        "offset": offset,
        "limit": limit,
        "access": access_label(access),
        "asteroids": [present(r) for r in rows],
    }
    if search:
        response["query"] = search
    return response


# Declared before /{neo_reference_id} so "random" is not read as an ID.
@app.get("/api/v1/asteroids/random")
def get_random_asteroids(
    access: auth.Access = Depends(auth.get_access),
    count: int = Query(default=1, ge=1, le=MAX_RANDOM),
    hazardous: Optional[bool] = Query(default=None),
    min_diameter: Optional[float] = Query(default=None, ge=0),
    max_diameter: Optional[float] = Query(default=None, ge=0),
):
    check_ranges(min_diameter, max_diameter)
    rows, matched = db.random_asteroids(
        count=count, hazardous=hazardous, min_diameter=min_diameter,
        max_diameter=max_diameter, item_limit=access.item_limit,
    )
    return {
        "count": len(rows),
        "matched": matched,
        "access": access_label(access),
        "asteroids": [present(r) for r in rows],
    }


@app.get("/api/v1/asteroids/{neo_reference_id}")
def get_asteroid(neo_reference_id: str, access: auth.Access = Depends(auth.get_access)):
    if not NEO_ID_PATTERN.match(neo_reference_id):
        raise HTTPException(404, "Asteroid not found.")
    row = db.get_asteroid(neo_reference_id, access.item_limit)
    if row is None:
        if access.limited and db.asteroid_exists(neo_reference_id):
            # It exists, but this role cannot see it: say how to get access.
            raise HTTPException(401, "Log in to view this asteroid.", headers={"WWW-Authenticate": "Bearer"})
        raise HTTPException(404, "Asteroid not found.")
    return present(row)


@app.get("/api/v1/stats")
def get_stats(access: auth.Access = Depends(auth.get_access)):
    """Summary of the catalog this caller may see (all of it, or the featured ones)."""
    return {**db.catalog_stats(access.item_limit), "access": access_label(access)}


# ============================================================
# WRITE: create, update, delete (accounts with the admin role only)
# ============================================================
@app.post("/api/v1/asteroids", status_code=201)
def create_asteroid(data: AsteroidCreate, caller: auth.Caller = Depends(auth.require_admin)):
    return present(db.create_asteroid(data, caller.user_id))


@app.patch("/api/v1/asteroids/{neo_reference_id}")
def update_asteroid(neo_reference_id: str, data: AsteroidUpdate, caller: auth.Caller = Depends(auth.require_admin)):
    row = db.update_asteroid(neo_reference_id, data, caller.user_id) if NEO_ID_PATTERN.match(neo_reference_id) else None
    if row is None:
        raise HTTPException(404, "Asteroid not found.")
    return present(row)


@app.delete("/api/v1/asteroids/{neo_reference_id}")
def delete_asteroid(neo_reference_id: str, caller: auth.Caller = Depends(auth.require_admin)):
    if not (NEO_ID_PATTERN.match(neo_reference_id) and db.delete_asteroid(neo_reference_id, caller.user_id)):
        raise HTTPException(404, "Asteroid not found.")
    return {"message": "Asteroid deleted.", "neo_reference_id": neo_reference_id}


# ============================================================
# SITES: the hub lists them, and opening one is recorded
# ============================================================
def site_view(row, role):
    if not row["allowed"]:
        access = {"level": "none", "item_limit": None, "can_write": False}
    else:
        access = {"level": "limited" if row["item_limit"] is not None else "full",
                  "item_limit": row["item_limit"], "can_write": row["can_write"]}
    return {"slug": row["slug"], "name": row["name"], "kind": row["kind"],
            "description": row["description"], "url": row["url"], "access": access}


@app.get("/api/v1/sites")
def get_sites(caller: auth.Caller = Depends(auth.get_caller)):
    """The three sites and what the caller's role may do on each."""
    role = caller.effective_role
    return {"role": role, "sites": [site_view(r, role) for r in db.list_sites(role)]}


@app.post("/api/v1/sites/{slug}/launch")
def launch_site(slug: str, caller: auth.Caller = Depends(auth.get_caller)):
    """Open a site from the hub. Records the launch (and awards badges to an
    account). For a partner site, an account also gets a ticket, which the
    partner forwards to this API so the visitor is served by their role."""
    if caller.kind == "partner" or caller.ticket:
        raise HTTPException(403, "Sites are opened from the AegisNEO hub.")
    site = db.get_site(slug)
    if site is None:
        raise HTTPException(404, "Unknown site.")
    role = caller.effective_role
    rule = db.get_site_access(role, slug)
    if rule is None:
        raise HTTPException(403, "Your role has no access to this site.")
    ticket = None
    if caller.kind == "user" and site["kind"] == "partner":
        user = db.get_user(caller.user_id)
        if user is None:
            raise db.UnknownUserError()
        role = user["role"]  # the current role, not the one in the token
        ticket = auth.create_ticket(user["id"], user["username"], role, slug)
    new_badges = db.record_launch(caller.user_id if caller.kind == "user" else None, slug, role)
    return {
        "site": slug,
        "name": site["name"],
        "url": site["url"],
        "ticket": ticket,
        "ticket_expires_in": config_ticket_seconds() if ticket else None,
        "access": {"level": "limited" if rule["item_limit"] is not None else "full",
                   "item_limit": rule["item_limit"]},
        "new_badges": new_badges,
    }


def config_ticket_seconds():
    return auth.config.launch_ticket_minutes() * 60


# ============================================================
# MY ACCOUNT: overview, watchlist
# ============================================================
@app.get("/api/v1/me/overview")
def my_overview(caller: auth.Caller = Depends(auth.require_logged_in)):
    data = db.user_overview(caller.user_id)
    if data is None:
        raise db.UnknownUserError()
    return {"user": present(data["user"]),
            "badges": [present(b) for b in data["badges"]],
            "recent_launches": [present(l) for l in data["recent_launches"]],
            "watchlist_count": data["watchlist_count"]}


@app.get("/api/v1/me/watchlist")
def my_watchlist(caller: auth.Caller = Depends(auth.require_logged_in)):
    rows = db.list_watchlist(caller.user_id)
    return {"count": len(rows), "limit": db.WATCHLIST_LIMIT, "asteroids": [present(r) for r in rows]}


@app.put("/api/v1/me/watchlist/{neo_reference_id}")
def watch_asteroid(neo_reference_id: str, caller: auth.Caller = Depends(auth.require_logged_in)):
    if not (NEO_ID_PATTERN.match(neo_reference_id) and db.asteroid_exists(neo_reference_id)):
        raise HTTPException(404, "Asteroid not found.")
    new_badges = db.add_to_watchlist(caller.user_id, neo_reference_id)
    return {"neo_reference_id": neo_reference_id, "watching": True, "new_badges": new_badges}


@app.delete("/api/v1/me/watchlist/{neo_reference_id}")
def unwatch_asteroid(neo_reference_id: str, caller: auth.Caller = Depends(auth.require_logged_in)):
    if not NEO_ID_PATTERN.match(neo_reference_id):
        raise HTTPException(404, "Asteroid not found.")
    db.remove_from_watchlist(caller.user_id, neo_reference_id)
    return {"neo_reference_id": neo_reference_id, "watching": False}


# ============================================================
# ADMIN: who uses the sites, and who changed the catalog
# ============================================================
@app.get("/api/v1/admin/overview")
def admin_overview(caller: auth.Caller = Depends(auth.require_admin)):
    data = db.admin_overview()
    return {
        "users_by_role": data["users_by_role"],
        "launches_by_site": data["launches_by_site"],
        "most_watched": data["most_watched"],
        "recent_changes": [present(c) for c in data["recent_changes"]],
    }
