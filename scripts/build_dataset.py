"""
Builds data/asteroids.json for AegisNEO from the real Kaggle NEO dataset.

Source: CONTEXT FILES/nearest-earth-objects(1910-2024).csv
  columns: neo_id, name, absolute_magnitude, estimated_diameter_min,
           estimated_diameter_max, orbiting_body, relative_velocity,
           miss_distance, is_hazardous

The source has 338k rows but only ~33.5k distinct neo_id values (repeated
close-approach rows per object) and no date column at all. Per the approved
build plan: dedupe to one row per object, and synthesize close_approach_date
(seeded by neo_id so it's stable across reruns) since the source has none.
Every other field is real data, only remapped/renamed to the PRD schema.
"""

import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

SOURCE = Path(__file__).parent.parent / "CONTEXT FILES" / "nearest-earth-objects(1910-2024).csv"
OUTPUT = Path(__file__).parent.parent / "data" / "asteroids.json"

DATE_START = date(1910, 1, 1)
DATE_END = date(2024, 12, 31)
DATE_SPAN_DAYS = (DATE_END - DATE_START).days


def synthetic_date(neo_id: str) -> str:
    rng = random.Random(neo_id)
    offset = rng.randint(0, DATE_SPAN_DAYS)
    return (DATE_START + timedelta(days=offset)).isoformat()


REQUIRED_FIELDS = (
    "neo_id", "name", "estimated_diameter_min", "estimated_diameter_max",
    "relative_velocity", "miss_distance", "is_hazardous", "absolute_magnitude",
)


def build() -> None:
    seen = set()
    asteroids = []
    skipped = 0

    with SOURCE.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            neo_id = row["neo_id"]
            if neo_id in seen:
                continue
            if any(not row.get(field) for field in REQUIRED_FIELDS):
                skipped += 1
                continue
            seen.add(neo_id)

            diameter_min = float(row["estimated_diameter_min"])
            diameter_max = float(row["estimated_diameter_max"])

            asteroids.append({
                "neo_reference_id": neo_id,
                "name": row["name"],
                "estimated_diameter_km": round((diameter_min + diameter_max) / 2, 4),
                "is_potentially_hazardous": row["is_hazardous"] == "True",
                "close_approach_date": synthetic_date(neo_id),
                "relative_velocity_km_h": round(float(row["relative_velocity"]), 3),
                "miss_distance_km": round(float(row["miss_distance"]), 3),
                "absolute_magnitude": float(row["absolute_magnitude"]),
            })

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(asteroids, f, separators=(",", ":"))

    hazardous = sum(1 for a in asteroids if a["is_potentially_hazardous"])
    print(f"Wrote {len(asteroids):,} unique asteroids to {OUTPUT}")
    print(f"  hazardous: {hazardous:,} ({hazardous / len(asteroids) * 100:.1f}%)")
    print(f"  skipped (incomplete rows): {skipped:,}")
    print(f"  file size: {OUTPUT.stat().st_size / 1_000_000:.1f} MB")


if __name__ == "__main__":
    build()
