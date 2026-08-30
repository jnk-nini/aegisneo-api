import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AegisNEO API",
    description="Tracks Near-Earth Objects using real NASA/Kaggle asteroid data.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ASTEROID DATA — loaded once at cold start, not per-request
DATA_PATH = Path(__file__).parent / "data" / "asteroids.json"
with open(DATA_PATH, encoding="utf-8") as f:
    asteroids = json.load(f)

asteroids_by_id = {a["neo_reference_id"]: a for a in asteroids}

MAX_RESULTS = 100

# HOME
@app.get("/")
def home():

    return {
        "message": "Welcome to the AegisNEO API!",
        "total_tracked": len(asteroids),
        "endpoints": [
            "/asteroids",
            "/asteroids?search=",
            "/asteroids/{neo_reference_id}"
        ]
    }


# GET / SEARCH ASTEROIDS
@app.get("/asteroids")
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
        if q in asteroid["name"].lower() or q in asteroid["neo_reference_id"].lower():
            results.append(asteroid)
            if len(results) >= MAX_RESULTS:
                break

    return {
        "count": len(results),
        "query": search,
        "asteroids": results
    }


# GET ONE ASTEROID
@app.get("/asteroids/{neo_reference_id}")
def get_asteroid(neo_reference_id: str):

    asteroid = asteroids_by_id.get(neo_reference_id)
    if asteroid:
        return asteroid

    raise HTTPException(
        status_code=404,
        detail="Asteroid not found."
    )
