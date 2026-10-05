import json
import os
import random
import statistics
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Header, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ============================================================
# CONFIGURATION
# ============================================================
API_VERSION = "1.1"

# Each client website gets its own key so usage can be told apart (and one
# key revoked without breaking the others). Keys are read from the
# AEGISNEO_API_KEYS environment variable as "client:key" pairs separated by
# commas, e.g. "aegisneo-web:abc123,impactor:def456". The public demo key is
# always accepted too, as its own "demo" client, so anyone can try the API
# from /docs; the websites themselves use their own keys.
LEGACY_DEMO_KEY = "student-api-key-123"


def load_api_keys() -> dict:
    keys = {}
    for pair in os.environ.get("AEGISNEO_API_KEYS", "").split(","):
        if ":" not in pair:
            continue
        client, key = pair.split(":", 1)
        if client.strip() and key.strip():
            keys[key.strip()] = client.strip()
    keys.setdefault(LEGACY_DEMO_KEY, "demo")
    return keys


API_KEYS = load_api_keys()

app = FastAPI(
    title="AegisNEO API",
    description="Tracks Near-Earth Objects using real NASA/Kaggle asteroid data.",
    version=API_VERSION
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# DATA MODEL
# ============================================================
class Asteroid(BaseModel):
    neo_reference_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    estimated_diameter_km: float = Field(gt=0)
    is_potentially_hazardous: bool
    close_approach_date: date
    relative_velocity_km_h: float = Field(ge=0)
    miss_distance_km: float = Field(ge=0)
    absolute_magnitude: float

# ASTEROID DATA — loaded once at cold start, not per-request
DATA_PATH = Path(__file__).parent / "data" / "asteroids.json"
with open(DATA_PATH, encoding="utf-8") as f:
    asteroids = json.load(f)

# Validate the full dataset against the schema when the application launches:
asteroids = [Asteroid(**a).model_dump(mode="json") for a in asteroids]

asteroids_by_id = {a["neo_reference_id"]: a for a in asteroids}

MAX_RESULTS = 100
MAX_RANDOM = 20

SORT_FIELDS = {
    "name": "name",
    "diameter": "estimated_diameter_km",
    "velocity": "relative_velocity_km_h",
    "miss_distance": "miss_distance_km",
    "date": "close_approach_date",
    "magnitude": "absolute_magnitude",
}
SortField = Literal["name", "diameter", "velocity", "miss_distance", "date", "magnitude"]


def summarize(values):
    return {
        "min": min(values),
        "max": max(values),
        "median": statistics.median(values),
    }


# Catalog summary — computed once, served by GET /api/v1/stats
CATALOG_STATS = {
    "total": len(asteroids),
    "potentially_hazardous": sum(a["is_potentially_hazardous"] for a in asteroids),
    "estimated_diameter_km": summarize([a["estimated_diameter_km"] for a in asteroids]),
    "relative_velocity_km_h": summarize([a["relative_velocity_km_h"] for a in asteroids]),
    "miss_distance_km": summarize([a["miss_distance_km"] for a in asteroids]),
    "close_approach_date": {
        "min": min(a["close_approach_date"] for a in asteroids),
        "max": max(a["close_approach_date"] for a in asteroids),
    },
}

# ============================================================
# API KEY AUTHENTICATION
# ============================================================
def verify_api_key(x_api_key: Optional[str] = Header(default=None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key."
        )
    return True


# ============================================================
# FILTERING
# ============================================================
def matches_search(asteroid, q):
    hazard_text = "hazardous" if asteroid["is_potentially_hazardous"] else "nominal safe"
    searchable_text = (
        f"{asteroid['name']} "
        f"{asteroid['neo_reference_id']} "
        f"{asteroid['close_approach_date']} "
        f"{hazard_text}"
    ).lower()
    return q in searchable_text


def filter_asteroids(search=None, hazardous=None, min_diameter=None, max_diameter=None):
    if min_diameter is not None and max_diameter is not None and min_diameter > max_diameter:
        raise HTTPException(
            status_code=422,
            detail="min_diameter cannot be greater than max_diameter."
        )

    q = search.lower() if search else None
    results = []
    for asteroid in asteroids:
        if hazardous is not None and asteroid["is_potentially_hazardous"] != hazardous:
            continue
        if min_diameter is not None and asteroid["estimated_diameter_km"] < min_diameter:
            continue
        if max_diameter is not None and asteroid["estimated_diameter_km"] > max_diameter:
            continue
        if q and not matches_search(asteroid, q):
            continue
        results.append(asteroid)
    return results


# HOME
@app.get("/")
def home():

    return {
        "message": "Welcome to the AegisNEO API!",
        "total_tracked": len(asteroids),
        "endpoints": [
            "/api/v1/asteroids",
            "/api/v1/asteroids?search=&hazardous=&min_diameter=&max_diameter=&sort=&order=&limit=&offset=",
            "/api/v1/asteroids/random?count=",
            "/api/v1/asteroids/{neo_reference_id}",
            "/api/v1/stats"
        ]
    }


# ============================================================
# HEALTH CHECK (Public)
# ============================================================
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "AegisNEO API",
        "version": API_VERSION,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    }


# GET / SEARCH / FILTER ASTEROIDS (Protected)
# "total" is always the full catalog size (existing clients rely on that);
# "matched" is how many objects passed the filters.
@app.get("/api/v1/asteroids", dependencies=[Depends(verify_api_key)])
def get_asteroids(
    search: Optional[str] = Query(default=None, description="Text match on name, ID, date or hazard status."),
    hazardous: Optional[bool] = Query(default=None, description="Only hazardous (true) or non-hazardous (false) objects."),
    min_diameter: Optional[float] = Query(default=None, ge=0, description="Minimum estimated diameter in km."),
    max_diameter: Optional[float] = Query(default=None, ge=0, description="Maximum estimated diameter in km."),
    sort: Optional[SortField] = Query(default=None, description="Field to sort by."),
    order: Literal["asc", "desc"] = Query(default="asc"),
    limit: int = Query(default=MAX_RESULTS, ge=1, le=MAX_RESULTS),
    offset: int = Query(default=0, ge=0),
):
    results = filter_asteroids(search, hazardous, min_diameter, max_diameter)

    if sort:
        results = sorted(results, key=lambda a: a[SORT_FIELDS[sort]], reverse=(order == "desc"))

    page = results[offset:offset + limit]
    response = {
        "count": len(page),
        "matched": len(results),
        "total": len(asteroids),
        "offset": offset,
        "limit": limit,
        "asteroids": page
    }
    if search:
        response["query"] = search
    return response


# GET RANDOM ASTEROIDS (Protected) — declared before /{neo_reference_id} so
# "random" is not treated as an ID.
@app.get("/api/v1/asteroids/random", dependencies=[Depends(verify_api_key)])
def get_random_asteroids(
    count: int = Query(default=1, ge=1, le=MAX_RANDOM),
    hazardous: Optional[bool] = Query(default=None),
    min_diameter: Optional[float] = Query(default=None, ge=0),
    max_diameter: Optional[float] = Query(default=None, ge=0),
):
    pool = filter_asteroids(None, hazardous, min_diameter, max_diameter)
    picks = random.sample(pool, min(count, len(pool)))
    return {
        "count": len(picks),
        "matched": len(pool),
        "asteroids": picks
    }


# GET ONE ASTEROID (Protected)
@app.get("/api/v1/asteroids/{neo_reference_id}", dependencies=[Depends(verify_api_key)])
def get_asteroid(neo_reference_id: str):

    asteroid = asteroids_by_id.get(neo_reference_id)
    if asteroid:
        return asteroid

    raise HTTPException(
        status_code=404,
        detail="Asteroid not found."
    )


# CATALOG STATS (Protected)
@app.get("/api/v1/stats", dependencies=[Depends(verify_api_key)])
def get_stats():
    return CATALOG_STATS
