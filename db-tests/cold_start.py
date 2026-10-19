"""Measure connection + first-query time after the database has been idle
(Neon suspends its compute after 5 minutes without activity on the Free plan).

Usage:
    python cold_start.py --url-env NEON_APP_URL --service Neon --idle-seconds 360
"""
import argparse
import os
import sys
import time
from datetime import datetime, timezone

import psycopg


def timed_query(url):
    t0 = time.perf_counter()
    with psycopg.connect(url) as conn:
        connected = time.perf_counter()
        conn.execute("select count(*) from public.asteroids").fetchone()
        done = time.perf_counter()
    return (connected - t0) * 1000, (done - connected) * 1000


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url-env", required=True)
    parser.add_argument("--service", required=True)
    parser.add_argument("--idle-seconds", type=int, default=360)
    args = parser.parse_args()
    url = os.environ.get(args.url_env)
    if not url:
        sys.exit(f"Set the {args.url_env} environment variable first.")

    def stamp():
        return f"{datetime.now(timezone.utc):%H:%M:%S} UTC"

    print(f"{args.service}: cold start measurement  |  {datetime.now(timezone.utc):%Y-%m-%d} ")
    c, q = timed_query(url)
    print(f"{stamp()}  warm-up request:            connect {c:6.0f} ms, query {q:5.0f} ms")
    print(f"{stamp()}  waiting {args.idle_seconds} s with no activity...")
    time.sleep(args.idle_seconds)
    c, q = timed_query(url)
    print(f"{stamp()}  first request after idle:   connect {c:6.0f} ms, query {q:5.0f} ms   <- cold start")
    for i in range(3):
        c, q = timed_query(url)
        print(f"{stamp()}  next request {i + 1}:             connect {c:6.0f} ms, query {q:5.0f} ms")


if __name__ == "__main__":
    main()
