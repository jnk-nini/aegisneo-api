import json
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ============================================================
# CONFIGURATION
# ============================================================
API_KEY = "student-api-key-123"
API_VERSION = "1.0"

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

# ============================================================
# API KEY AUTHENTICATION
# ============================================================
def verify_api_key(x_api_key: Optional[str] = Header(default=None)):
    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key."
        )
    return True

# HOME
@app.get("/")
def home():

    return {
        "message": "Welcome to the AegisNEO API!",
        "total_tracked": len(asteroids),
        "endpoints": [
            "/api/v1/asteroids",
            "/api/v1/asteroids?search=",
            "/api/v1/asteroids/{neo_reference_id}"
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
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


# GET / SEARCH ASTEROIDS (Protected)
@app.get("/api/v1/asteroids", dependencies=[Depends(verify_api_key)])
def get_asteroids(search: str = Query(default=None)):

    if not search:
        results = asteroids[:MAX_RESULTS]
        return {
            "count": len(results),
            "total": len(asteroids),
            "asteroids": results
        }

    q = search.lower()
    results = []
    for asteroid in asteroids:
        hazard_text = "hazardous" if asteroid["is_potentially_hazardous"] else "nominal safe"
        searchable_text = (
            f"{asteroid['name']} "
            f"{asteroid['neo_reference_id']} "
            f"{asteroid['close_approach_date']} "
            f"{hazard_text}"
        ).lower()

        if q in searchable_text:
            results.append(asteroid)
            if len(results) >= MAX_RESULTS:
                break

    return {
        "count": len(results),
        "query": search,
        "asteroids": results
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
