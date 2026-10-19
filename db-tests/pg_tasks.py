"""Phase 2 tasks 1-6 on a PostgreSQL database (Neon or Supabase) using psycopg.

Usage:
    python pg_tasks.py --url-env NEON_DATABASE_URL --service Neon --tasks 1-6
    python pg_tasks.py --url-env SUPABASE_DB_URL --service Supabase --tasks 6

The connection string is read from the environment variable named by --url-env,
never from the command line, so it does not end up in shell history or screenshots.
"""
import argparse
import os
import sys
from datetime import datetime, timezone

import psycopg

from sample_records import (DELETE_ID, FIND_NAME, RECORDS, UPDATE_DIAMETER_KM,
                            UPDATE_ID, print_table)

CREATE_SQL = """\
create table public.asteroids (
  neo_reference_id          text primary key,
  name                      text not null,
  estimated_diameter_km     double precision not null check (estimated_diameter_km > 0),
  is_potentially_hazardous  boolean not null default false,
  close_approach_date       date,
  relative_velocity_km_h    double precision check (relative_velocity_km_h >= 0),
  miss_distance_km          double precision check (miss_distance_km >= 0),
  absolute_magnitude        double precision,
  created_at                timestamptz not null default now()
);"""

INSERT_SQL = """\
insert into public.asteroids
  (neo_reference_id, name, estimated_diameter_km, is_potentially_hazardous,
   close_approach_date, relative_velocity_km_h, miss_distance_km, absolute_magnitude)
values
  (%(neo_reference_id)s, %(name)s, %(estimated_diameter_km)s, %(is_potentially_hazardous)s,
   %(close_approach_date)s, %(relative_velocity_km_h)s, %(miss_distance_km)s, %(absolute_magnitude)s);"""

SELECT_ALL_SQL = """\
select neo_reference_id, name, estimated_diameter_km, is_potentially_hazardous,
       close_approach_date, relative_velocity_km_h, miss_distance_km, absolute_magnitude
from public.asteroids
order by name;"""

FIND_SQL = """\
select neo_reference_id, name, estimated_diameter_km, is_potentially_hazardous, close_approach_date
from public.asteroids
where name ilike %s;"""

UPDATE_SQL = """\
update public.asteroids
set estimated_diameter_km = %s
where neo_reference_id = %s
returning neo_reference_id, name, estimated_diameter_km;"""

DELETE_SQL = """\
delete from public.asteroids
where neo_reference_id = %s
returning neo_reference_id, name;"""

VERIFY_SQL = "select neo_reference_id, name from public.asteroids order by name;"


def heading(text):
    print()
    print("=" * 78)
    print(text)
    print("=" * 78)


def show_sql(sql, params=None):
    print("SQL:")
    for line in sql.splitlines():
        print("    " + line)
    if params is not None:
        print(f"    -- parameters: {params}")
    print()


def run_select(cur, sql, params=None):
    cur.execute(sql, params)
    columns = [d.name for d in cur.description]
    print_table(cur.fetchall(), columns)


def parse_tasks(text):
    if "-" in text:
        start, end = text.split("-")
        return list(range(int(start), int(end) + 1))
    return [int(t) for t in text.split(",")]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url-env", required=True)
    parser.add_argument("--service", required=True)
    parser.add_argument("--tasks", default="1-6")
    args = parser.parse_args()

    url = os.environ.get(args.url_env)
    if not url:
        sys.exit(f"Set the {args.url_env} environment variable first.")

    tasks = parse_tasks(args.tasks)
    print(f"{args.service}: Phase 2 tasks {tasks}  |  driver: psycopg {psycopg.__version__}"
          f"  |  run at {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC")

    with psycopg.connect(url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("select current_user, version()")
        user, version = cur.fetchone()
        print(f"Connected as role '{user}' to {version.split(',')[0]}")

        if 1 in tasks:
            heading("1. Create the database structure or collection.")
            show_sql(CREATE_SQL)
            cur.execute(CREATE_SQL)
            print("Result: CREATE TABLE succeeded. Columns:")
            run_select(cur, """select column_name, data_type, is_nullable
                               from information_schema.columns
                               where table_schema = 'public' and table_name = 'asteroids'
                               order by ordinal_position""")

        if 2 in tasks:
            heading("2. Insert the three sample car records. (Here: the 5 sample asteroid records)")
            show_sql(INSERT_SQL, "one row per record, 5 records")
            cur.executemany(INSERT_SQL, RECORDS)
            print(f"Result: {len(RECORDS)} rows inserted.")

        if 3 in tasks:
            heading("3. Retrieve all three records. (Here: all 5 records)")
            show_sql(SELECT_ALL_SQL)
            run_select(cur, SELECT_ALL_SQL)

        if 4 in tasks:
            heading("4. Retrieve the Honda Civic using an appropriate query. (Here: 99942 Apophis)")
            show_sql(FIND_SQL, f"'%{FIND_NAME}%'")
            run_select(cur, FIND_SQL, (f"%{FIND_NAME}%",))

        if 5 in tasks:
            heading("5. Update one record, such as changing the horsepower of the Ford Mustang.\n"
                    "   (Here: Bennu's estimated_diameter_km 0.3904 -> 0.49)")
            show_sql(UPDATE_SQL, (UPDATE_DIAMETER_KM, UPDATE_ID))
            run_select(cur, UPDATE_SQL, (UPDATE_DIAMETER_KM, UPDATE_ID))

        if 6 in tasks:
            heading("6. Delete one test record and verify the result. (Here: 1566 Icarus)")
            show_sql(DELETE_SQL, (DELETE_ID,))
            run_select(cur, DELETE_SQL, (DELETE_ID,))
            print("\nVerify:")
            show_sql(VERIFY_SQL)
            run_select(cur, VERIFY_SQL)


if __name__ == "__main__":
    main()
