"""Create the limited application role aegis_app on a PostgreSQL database (used for Neon).

Roles created in the Neon Console belong to neon_superuser, so the API's role is
created with SQL instead and given only the data rights it needs.

Usage:
    python create_app_role.py --url-env NEON_DATABASE_URL --password-env APP_PASSWORD
"""
import argparse
import os
import sys

import psycopg
from psycopg import sql

from sample_records import print_table

STATEMENTS = [
    "create role aegis_app with login password {password} "
    "nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 5",
    "grant usage on schema public to aegis_app",
    "grant select, insert, update, delete on public.asteroids to aegis_app",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url-env", required=True)
    parser.add_argument("--password-env", required=True)
    args = parser.parse_args()
    url, password = os.environ.get(args.url_env), os.environ.get(args.password_env)
    if not url or not password:
        sys.exit(f"Set {args.url_env} and {args.password_env} first.")

    with psycopg.connect(url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("select current_user")
        print(f"Connected as the owner role '{cur.fetchone()[0]}'. Running:\n")
        for statement in STATEMENTS:
            print("    " + statement.format(password="'********'") + ";")
            cur.execute(sql.SQL(statement).format(password=sql.Literal(password)))
        print("\nResult: role created. Its rights:")
        cur.execute("""select r.rolname, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls,
                              r.rolconnlimit,
                              (select string_agg(privilege_type, ', ' order by privilege_type)
                               from information_schema.role_table_grants g
                               where g.grantee = r.rolname and g.table_name = 'asteroids') as table_rights
                       from pg_roles r where r.rolname = 'aegis_app'""")
        print_table(cur.fetchall(), [d.name for d in cur.description])


if __name__ == "__main__":
    main()
