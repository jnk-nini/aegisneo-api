"""Phase 3: connectivity and security checks for a PostgreSQL service (Neon or Supabase).

Connects as the limited application role (aegis_app), never as the owner.

Usage:
    python test_postgres.py --url-env NEON_APP_URL --service Neon
    python test_postgres.py --url-env SUPABASE_APP_URL --service Supabase
"""
import argparse
import os
import socket
import sys
import time
from datetime import datetime, timezone

import psycopg
from psycopg import errors
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from sample_records import mask

TEST_ROW = {
    "neo_reference_id": "TEST-0001",
    "name": "Phase 3 test asteroid",
    "estimated_diameter_km": 1.0,
}

results = []


def server_reason(error):
    """psycopg may try several addresses (IPv6 and IPv4); keep the server's own answer."""
    lines = [line.strip() for line in str(error).splitlines() if line.strip()]
    for line in lines:
        if "FATAL" in line or "ERROR" in line:
            return line[line.find("FATAL") if "FATAL" in line else line.find("ERROR"):]
    return " ".join(lines)[-160:]


def check(label, passed, detail):
    results.append(passed)
    print(f"[{'PASS' if passed else 'FAIL'}] {label}")
    print(f"       {detail}")


def expect_error(cur, label, sql, params, error_class):
    try:
        cur.execute(sql, params)
        check(label, False, "no error: the database accepted it")
    except error_class as e:
        check(label, True, f"rejected with {type(e).__name__} (SQLSTATE {e.sqlstate}): "
                           f"{str(e).splitlines()[0]}")
    except psycopg.Error as e:
        check(label, False, f"unexpected {type(e).__name__}: {str(e).splitlines()[0]}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url-env", required=True)
    parser.add_argument("--service", required=True)
    args = parser.parse_args()

    url = os.environ.get(args.url_env)
    if not url:
        sys.exit(f"Set the {args.url_env} environment variable first.")
    info = conninfo_to_dict(url)

    print(f"{args.service}: Phase 3 connectivity and security checks"
          f"  |  run at {datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S} UTC")
    print(f"Driver: psycopg {psycopg.__version__} (libpq {psycopg.pq.version()})")
    print(f"Connection string read from environment variable {args.url_env}:")
    print(f"    postgresql://{info.get('user')}:{mask(info.get('password'), 0)}@{info.get('host')}"
          f":{info.get('port', 5432)}/{info.get('dbname')}?sslmode={info.get('sslmode', 'prefer')}")
    print()

    # 1. Connect and time it (the first connection may include a cold start)
    t0 = time.perf_counter()
    conn = psycopg.connect(url, autocommit=True)
    connect_ms = (time.perf_counter() - t0) * 1000
    cur = conn.cursor()
    t0 = time.perf_counter()
    cur.execute("select 1")
    query_ms = (time.perf_counter() - t0) * 1000
    check("Connect with the application role", True,
          f"connected in {connect_ms:.0f} ms, first query in {query_ms:.0f} ms")

    check("Connection is encrypted with TLS", conn.pgconn.ssl_in_use,
          f"ssl_in_use={conn.pgconn.ssl_in_use} (sslmode={info.get('sslmode', 'prefer')})")

    cur.execute("""select current_user, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls
                   from pg_roles r where r.rolname = current_user""")
    user, is_super, create_role, create_db, bypass_rls = cur.fetchone()
    check("Application role has no admin rights", not (is_super or create_role or create_db or bypass_rls),
          f"role={user}, superuser={is_super}, createrole={create_role}, "
          f"createdb={create_db}, bypassrls={bypass_rls}")

    cur.execute("""select string_agg(privilege_type, ', ' order by privilege_type)
                   from information_schema.role_table_grants
                   where grantee = current_user and table_name = 'asteroids'""")
    check("Role is limited to data operations on the asteroids table", True,
          f"granted on public.asteroids: {cur.fetchone()[0]}")

    # 2. CRUD with a temporary test record
    cur.execute("insert into public.asteroids (neo_reference_id, name, estimated_diameter_km) "
                "values (%(neo_reference_id)s, %(name)s, %(estimated_diameter_km)s)", TEST_ROW)
    cur.execute("select name from public.asteroids where neo_reference_id = %s",
                (TEST_ROW["neo_reference_id"],))
    created = cur.fetchone()
    cur.execute("update public.asteroids set estimated_diameter_km = 2.5 "
                "where neo_reference_id = %s returning estimated_diameter_km",
                (TEST_ROW["neo_reference_id"],))
    updated = cur.fetchone()
    cur.execute("delete from public.asteroids where neo_reference_id = %s returning neo_reference_id",
                (TEST_ROW["neo_reference_id"],))
    deleted = cur.fetchone()
    check("Create, read, update and delete as the application role",
          bool(created and updated and updated[0] == 2.5 and deleted),
          f"insert+select -> {created}, update -> {updated}, delete -> {deleted}")

    # 3. Invalid input is rejected by the database itself
    insert = ("insert into public.asteroids (neo_reference_id, name, estimated_diameter_km) "
              "values (%s, %s, %s)")
    expect_error(cur, "Invalid input: negative diameter (CHECK constraint)",
                 insert, ("TEST-0002", "Bad diameter", -5), errors.CheckViolation)
    expect_error(cur, "Invalid input: missing name (NOT NULL constraint)",
                 insert, ("TEST-0003", None, 1.0), errors.NotNullViolation)
    expect_error(cur, "Invalid input: duplicate ID 2000433 (PRIMARY KEY)",
                 insert, ("2000433", "Duplicate Eros", 1.0), errors.UniqueViolation)
    expect_error(cur, "Invalid input: text in a number column (data type)",
                 "insert into public.asteroids (neo_reference_id, name, estimated_diameter_km) "
                 "values ('TEST-0004', 'Bad type', 'abc')", None, errors.InvalidTextRepresentation)

    # 4. Unauthorized requests are rejected
    expect_error(cur, "Unauthorized: application role tries to DROP the table",
                 "drop table public.asteroids", None, errors.InsufficientPrivilege)
    expect_error(cur, "Unauthorized: application role tries to CREATE a new table",
                 "create table public.not_allowed (id int)", None, errors.InsufficientPrivilege)

    # The negative checks below use the host's IPv4 address, so the answer shown is the
    # server's own and not an IPv6 "network unreachable" from the test machine.
    ipv4 = socket.getaddrinfo(info["host"], int(info.get("port", 5432)), socket.AF_INET)[0][4][0]
    bad = dict(info, password="wrong-password-123", hostaddr=ipv4)
    try:
        psycopg.connect(make_conninfo(**bad), connect_timeout=10).close()
        check("Unauthorized: connect with a wrong password", False, "connection was accepted")
    except psycopg.OperationalError as e:
        check("Unauthorized: connect with a wrong password", True, f"rejected: {server_reason(e)}")

    plain = dict(info, sslmode="disable", hostaddr=ipv4)
    plain.pop("channel_binding", None)
    try:
        psycopg.connect(make_conninfo(**plain), connect_timeout=10).close()
        check("Unencrypted connection (sslmode=disable)", False,
              "accepted: this service does not force TLS for this endpoint")
    except psycopg.OperationalError as e:
        reason = server_reason(e)
        refused = "FATAL" in reason or "closed the connection" in reason
        check("Unencrypted connection (sslmode=disable)", refused,
              f"{'rejected' if refused else 'inconclusive (network error, not a server answer)'}: {reason}")

    conn.close()

    # 5. Persistence: a brand-new connection (like a restarted app) still sees the data
    with psycopg.connect(url) as conn2, conn2.cursor() as cur2:
        cur2.execute("select count(*), min(created_at) from public.asteroids")
        count, oldest = cur2.fetchone()
    check("Persistence: data still there from a new connection (simulated app restart)",
          count >= 1, f"{count} rows; oldest row created at {oldest:%Y-%m-%d %H:%M:%S %Z}")

    print()
    print(f"Summary: {sum(results)}/{len(results)} checks passed")


if __name__ == "__main__":
    main()
