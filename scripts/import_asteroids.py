"""One-time import of data/asteroids.json into the asteroids table.

Run on your own machine as the owner role, after db/schema.sql:

    DATABASE_OWNER_URL=... python scripts/import_asteroids.py

Rows that already exist are left alone, so running it twice is safe. The ten
featured asteroids (the only ones guests can see) are marked at the end.
"""
import json
import os
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.config import load_dotenv  # noqa: E402
from api.models import AsteroidCreate  # noqa: E402

FEATURED_IDS = [
    "2099942",  # 99942 Apophis
    "2101955",  # 101955 Bennu
    "2000433",  # 433 Eros
    "2001036",  # 1036 Ganymed
    "2001566",  # 1566 Icarus
    "2004179",  # 4179 Toutatis
    "2065803",  # 65803 Didymos
    "2003200",  # 3200 Phaethon
    "2025143",  # 25143 Itokawa
    "2162173",  # 162173 Ryugu
]

INSERT = (
    "insert into public.asteroids (neo_reference_id, name, estimated_diameter_km, "
    "is_potentially_hazardous, close_approach_date, relative_velocity_km_h, "
    "miss_distance_km, absolute_magnitude) "
    "values (%(neo_reference_id)s, %(name)s, %(estimated_diameter_km)s, "
    "%(is_potentially_hazardous)s, %(close_approach_date)s, %(relative_velocity_km_h)s, "
    "%(miss_distance_km)s, %(absolute_magnitude)s) "
    "on conflict do nothing"
)


def main():
    load_dotenv()
    url = os.environ.get("DATABASE_OWNER_URL")
    if not url:
        sys.exit("Set DATABASE_OWNER_URL (the owner connection string) first.")

    records = json.loads((ROOT / "data" / "asteroids.json").read_text(encoding="utf-8"))
    # Validate every record with the same rules the API uses for new records.
    rows = []
    for index, record in enumerate(records):
        try:
            rows.append(AsteroidCreate(**record).model_dump(exclude={"is_featured"}))
        except ValueError as exc:
            sys.exit(f"Record {index} ({record.get('neo_reference_id')}) is invalid: {exc}")
    print(f"{len(rows)} records read and validated.")

    with psycopg.connect(url, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            for start in range(0, len(rows), 1000):
                cur.executemany(INSERT, rows[start:start + 1000])
            cur.execute("update public.asteroids set is_featured = (neo_reference_id = any(%s))", [FEATURED_IDS])
            cur.execute("select count(*), count(*) filter (where is_featured) from public.asteroids")
            total, featured = cur.fetchone()
    print(f"Done. The table now holds {total} asteroids, {featured} featured.")


if __name__ == "__main__":
    main()
