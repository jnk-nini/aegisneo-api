# The 5 sample records taken from the live AegisNEO API
# (GET /api/v1/asteroids/{neo_reference_id}), used in every test.

RECORDS = [
    {
        "neo_reference_id": "2000433",
        "name": "433 Eros (A898 PA)",
        "estimated_diameter_km": 35.6076,
        "is_potentially_hazardous": False,
        "close_approach_date": "1960-12-30",
        "relative_velocity_km_h": 17340.422,
        "miss_distance_km": 74687814.6,
        "absolute_magnitude": 10.41,
    },
    {
        "neo_reference_id": "2099942",
        "name": "99942 Apophis (2004 MN4)",
        "estimated_diameter_km": 0.6539,
        "is_potentially_hazardous": True,
        "close_approach_date": "1930-08-09",
        "relative_velocity_km_h": 14822.02,
        "miss_distance_km": 24400576.109,
        "absolute_magnitude": 19.09,
    },
    {
        "neo_reference_id": "2101955",
        "name": "101955 Bennu (1999 RQ36)",
        "estimated_diameter_km": 0.3904,
        "is_potentially_hazardous": True,
        "close_approach_date": "2005-04-30",
        "relative_velocity_km_h": 22859.602,
        "miss_distance_km": 2120992.632,
        "absolute_magnitude": 20.21,
    },
    {
        "neo_reference_id": "2001036",
        "name": "1036 Ganymed (A924 UB)",
        "estimated_diameter_km": 60.7495,
        "is_potentially_hazardous": False,
        "close_approach_date": "1973-01-15",
        "relative_velocity_km_h": 61537.326,
        "miss_distance_km": 57051078.734,
        "absolute_magnitude": 9.25,
    },
    {
        "neo_reference_id": "2001566",
        "name": "1566 Icarus (1949 MA)",
        "estimated_diameter_km": 2.0871,
        "is_potentially_hazardous": True,
        "close_approach_date": "2014-09-06",
        "relative_velocity_km_h": 77305.505,
        "miss_distance_km": 50292697.81,
        "absolute_magnitude": 16.57,
    },
]

FIND_NAME = "Apophis"          # the instructions' "Honda Civic"
UPDATE_ID = "2101955"          # Bennu, the instructions' "Ford Mustang"
UPDATE_DIAMETER_KM = 0.49      # 0.3904 -> 0.49 km (OSIRIS-REx measurement)
DELETE_ID = "2001566"          # Icarus


def print_table(rows, columns=None):
    """Print a list of dicts (or tuples with column names) as a plain text table."""
    if not rows:
        print("(0 rows)")
        return
    if columns is None:
        columns = list(rows[0].keys())
        rows = [[r.get(c) for c in columns] for r in rows]
    cells = [[("" if v is None else str(v)) for v in row] for row in rows]
    widths = [max(len(c), *(len(row[i]) for row in cells)) for i, c in enumerate(columns)]
    line = "+" + "+".join("-" * (w + 2) for w in widths) + "+"
    print(line)
    print("| " + " | ".join(c.ljust(w) for c, w in zip(columns, widths)) + " |")
    print(line)
    for row in cells:
        print("| " + " | ".join(v.ljust(w) for v, w in zip(row, widths)) + " |")
    print(line)
    print(f"({len(rows)} row{'s' if len(rows) != 1 else ''})")


def mask(text, keep=4):
    """Hide a secret, keeping only its first characters, for printed output."""
    if not text:
        return text
    return text[:keep] + "*" * 8
