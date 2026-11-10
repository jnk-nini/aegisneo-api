import logging
import re
from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm

from api import auth, db
from api.config import API_VERSION
from api.models import AsteroidCreate, AsteroidUpdate

log = logging.getLogger("aegisneo")

app = FastAPI(
    title="AegisNEO API",
    description=(
        "Tracks Near-Earth Objects using real NASA/Kaggle asteroid data, stored in a Neon "
        "(PostgreSQL) database. Without credentials only 10 featured asteroids are visible. "
        "Log in with the Authorize button to see all of them and to create, update and delete."
    ),
    version=API_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "x-api-key"],
)

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
    return JSONResponse({"detail": f"An asteroid with this {exc.field} already exists."}, status_code=409)


@app.exception_handler(db.FeaturedLimitError)
def featured_limit(request, exc):
    return JSONResponse(
        {"detail": f"At most {db.FEATURED_LIMIT} asteroids can be featured."}, status_code=409
    )


@app.exception_handler(db.UnknownUserError)
def unknown_user(request, exc):
    return JSONResponse({"detail": "This account no longer exists. Log in again."}, status_code=401)


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


def access_label(caller):
    return "full" if caller.full_access else "guest"


# ============================================================
# PUBLIC: home, health, login
# ============================================================
@app.get("/")
def home():
    return {
        "message": "Welcome to the AegisNEO API!",
        "total_tracked": db.count_asteroids(),
        "endpoints": [
            "POST /api/v1/auth/login",
            "GET /api/v1/auth/me",
            "GET /api/v1/asteroids",
            "GET /api/v1/asteroids?search=&hazardous=&min_diameter=&max_diameter=&from_date=&to_date=&sort=&order=&limit=&offset=",
            "GET /api/v1/asteroids/random?count=",
            "GET /api/v1/asteroids/{neo_reference_id}",
            "POST /api/v1/asteroids",
            "PATCH /api/v1/asteroids/{neo_reference_id}",
            "DELETE /api/v1/asteroids/{neo_reference_id}",
            "GET /api/v1/stats",
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
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = db.get_user_by_username(form.username.strip().lower())
    ok = auth.password_matches(form.password, user["password_hash"] if user else None)
    if not user or not ok:
        # Same message whether the username or the password was wrong.
        raise HTTPException(401, "Incorrect username or password.", headers={"WWW-Authenticate": "Bearer"})
    return {
        "access_token": auth.create_token(user["id"], user["username"]),
        "token_type": "bearer",
        "expires_in": auth.config.jwt_expire_minutes() * 60,
    }


@app.get("/api/v1/auth/me")
def me(caller: auth.Caller = Depends(auth.require_logged_in)):
    return {"id": caller.user_id, "username": caller.username}


# ============================================================
# READ: list, random, one, stats
# ============================================================
# "total" is the size of the catalog this caller may see (all 33,511 for a
# logged-in user or partner site, 10 for a guest); "matched" is how many of
# those passed the filters.
@app.get("/api/v1/asteroids")
def get_asteroids(
    caller: auth.Caller = Depends(auth.get_caller),
    search: Optional[str] = Query(default=None, max_length=100, description="Text match on name or ID."),
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
        limit=limit, offset=offset, featured_only=not caller.full_access,
    )
    response = {
        "count": len(rows),
        "matched": matched,
        "total": visible,
        "offset": offset,
        "limit": limit,
        "access": access_label(caller),
        "asteroids": [present(r) for r in rows],
    }
    if search:
        response["query"] = search
    return response


# Declared before /{neo_reference_id} so "random" is not read as an ID.
@app.get("/api/v1/asteroids/random")
def get_random_asteroids(
    caller: auth.Caller = Depends(auth.get_caller),
    count: int = Query(default=1, ge=1, le=MAX_RANDOM),
    hazardous: Optional[bool] = Query(default=None),
    min_diameter: Optional[float] = Query(default=None, ge=0),
    max_diameter: Optional[float] = Query(default=None, ge=0),
):
    check_ranges(min_diameter, max_diameter)
    rows, matched = db.random_asteroids(
        count=count, hazardous=hazardous, min_diameter=min_diameter,
        max_diameter=max_diameter, featured_only=not caller.full_access,
    )
    return {
        "count": len(rows),
        "matched": matched,
        "access": access_label(caller),
        "asteroids": [present(r) for r in rows],
    }


@app.get("/api/v1/asteroids/{neo_reference_id}")
def get_asteroid(neo_reference_id: str, caller: auth.Caller = Depends(auth.get_caller)):
    row = db.get_asteroid(neo_reference_id) if NEO_ID_PATTERN.match(neo_reference_id) else None
    if row is None:
        raise HTTPException(404, "Asteroid not found.")
    if not caller.full_access and not row["is_featured"]:
        raise HTTPException(401, "Log in to view this asteroid.", headers={"WWW-Authenticate": "Bearer"})
    return present(row)


@app.get("/api/v1/stats")
def get_stats(caller: auth.Caller = Depends(auth.require_full_access)):
    return db.catalog_stats()


# ============================================================
# WRITE: create, update, delete (logged-in users only)
# ============================================================
@app.post("/api/v1/asteroids", status_code=201)
def create_asteroid(data: AsteroidCreate, caller: auth.Caller = Depends(auth.require_user)):
    return present(db.create_asteroid(data, caller.user_id))


@app.patch("/api/v1/asteroids/{neo_reference_id}")
def update_asteroid(neo_reference_id: str, data: AsteroidUpdate, caller: auth.Caller = Depends(auth.require_user)):
    row = db.update_asteroid(neo_reference_id, data) if NEO_ID_PATTERN.match(neo_reference_id) else None
    if row is None:
        raise HTTPException(404, "Asteroid not found.")
    return present(row)


@app.delete("/api/v1/asteroids/{neo_reference_id}")
def delete_asteroid(neo_reference_id: str, caller: auth.Caller = Depends(auth.require_user)):
    if not (NEO_ID_PATTERN.match(neo_reference_id) and db.delete_asteroid(neo_reference_id)):
        raise HTTPException(404, "Asteroid not found.")
    return {"message": "Asteroid deleted.", "neo_reference_id": neo_reference_id}
