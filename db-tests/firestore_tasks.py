"""Phase 2 tasks 1-6 on Cloud Firestore using the Firebase Admin SDK (firebase-admin).

Usage:
    python firestore_tasks.py --tasks 1-6
"""
import argparse
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from fs_common import COLLECTION, connect, keywords
from sample_records import (DELETE_ID, FIND_NAME, RECORDS, UPDATE_DIAMETER_KM,
                            UPDATE_ID, print_table)

SHOW = ["neo_reference_id", "name", "estimated_diameter_km", "is_potentially_hazardous",
        "close_approach_date", "relative_velocity_km_h", "miss_distance_km", "absolute_magnitude"]


def heading(text):
    print()
    print("=" * 78)
    print(text)
    print("=" * 78)


def show_code(code):
    print("Python (Firebase Admin SDK):")
    for line in code.strip("\n").splitlines():
        print("    " + line)
    print()


def rows(snapshots, fields):
    return [[snap.id] + [snap.get(f) for f in fields] for snap in snapshots]


def parse_tasks(text):
    if "-" in text:
        start, end = text.split("-")
        return list(range(int(start), int(end) + 1))
    return [int(t) for t in text.split(",")]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tasks", default="1-6")
    parser.add_argument("--reset", action="store_true",
                        help="delete leftover documents from an earlier run first")
    args = parser.parse_args()
    tasks = parse_tasks(args.tasks)

    db, email, _ = connect()
    col = db.collection(COLLECTION)
    print(f"Firestore: Phase 2 tasks {tasks}  |  firebase-admin {firebase_admin.__version__}"
          f"  |  run at {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC")
    print(f"Project: {db.project}  |  service account: {email}")

    if args.reset:
        leftovers = list(col.stream())
        for snap in leftovers:
            snap.reference.delete()
        if leftovers:
            print(f"Reset: removed {len(leftovers)} leftover documents from an earlier run.")

    if 1 in tasks:
        heading("1. Create the database structure or collection.")
        print("Firestore has no CREATE TABLE: a collection exists as soon as its first document\n"
              "is written. Structure used (one document per asteroid):\n")
        print("    asteroids (collection)")
        print("      {neo_reference_id} (document ID, e.g. 2099942)")
        print("        neo_reference_id:          string")
        print("        name:                      string")
        print("        name_keywords:             array<string>   (for name search)")
        print("        estimated_diameter_km:     number")
        print("        is_potentially_hazardous:  boolean")
        print("        close_approach_date:       string (YYYY-MM-DD)")
        print("        relative_velocity_km_h:    number")
        print("        miss_distance_km:          number")
        print("        absolute_magnitude:        number")
        print("        created_at:                timestamp (server time)\n")
        show_code('col = db.collection("asteroids")\nlen(list(col.limit(1).stream()))')
        existing = len(list(col.limit(1).stream()))
        print(f"Result: collection reference created; documents currently in it: {existing}")

    if 2 in tasks:
        heading("2. Insert the three sample car records. (Here: the 5 sample asteroid records)")
        show_code("""
batch = db.batch()
for record in RECORDS:
    doc = dict(record, name_keywords=keywords(record["name"]),
               created_at=firestore.SERVER_TIMESTAMP)
    batch.create(col.document(record["neo_reference_id"]), doc)   # create() refuses duplicates
batch.commit()""")
        batch = db.batch()
        for record in RECORDS:
            doc = dict(record, name_keywords=keywords(record["name"]),
                       created_at=firestore.SERVER_TIMESTAMP)
            batch.create(col.document(record["neo_reference_id"]), doc)
        results = batch.commit()
        print(f"Result: {len(results)} documents written in one atomic batch.")

    if 3 in tasks:
        heading("3. Retrieve all three records. (Here: all 5 records)")
        show_code('col.order_by("name").stream()')
        snaps = list(col.order_by("name").stream())
        print_table(rows(snaps, SHOW[1:]), ["document ID"] + SHOW[1:])

    if 4 in tasks:
        heading("4. Retrieve the Honda Civic using an appropriate query. (Here: 99942 Apophis)")
        show_code(f'col.where(filter=FieldFilter("name_keywords", "array_contains", "{FIND_NAME.lower()}")).stream()')
        snaps = list(col.where(filter=FieldFilter("name_keywords", "array_contains",
                                                   FIND_NAME.lower())).stream())
        print_table(rows(snaps, SHOW[1:5]), ["document ID"] + SHOW[1:5])

    if 5 in tasks:
        heading("5. Update one record, such as changing the horsepower of the Ford Mustang.\n"
                "   (Here: Bennu's estimated_diameter_km 0.3904 -> 0.49)")
        show_code(f'col.document("{UPDATE_ID}").update({{"estimated_diameter_km": {UPDATE_DIAMETER_KM}}})\n'
                  f'col.document("{UPDATE_ID}").get()')
        col.document(UPDATE_ID).update({"estimated_diameter_km": UPDATE_DIAMETER_KM})
        snap = col.document(UPDATE_ID).get()
        print_table(rows([snap], ["name", "estimated_diameter_km"]),
                    ["document ID", "name", "estimated_diameter_km"])

    if 6 in tasks:
        heading("6. Delete one test record and verify the result. (Here: 1566 Icarus)")
        show_code(f'col.document("{DELETE_ID}").delete()\n'
                  f'col.document("{DELETE_ID}").get().exists\n'
                  'col.order_by("name").stream()')
        col.document(DELETE_ID).delete()
        print(f"Result: deleted. Document {DELETE_ID} still exists? "
              f"{col.document(DELETE_ID).get().exists}\n")
        print("Verify:")
        snaps = list(col.order_by("name").stream())
        print_table(rows(snaps, ["name"]), ["document ID", "name"])


if __name__ == "__main__":
    main()
