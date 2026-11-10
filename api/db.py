"""Data access: every SQL statement of the API lives in this module.

Values are always passed as query parameters, never formatted into the SQL
text. Each function opens its own connection and one transaction: it commits
when the function returns and rolls back on any error.
"""
import logging
from contextlib import contextmanager

import psycopg
from psycopg import errors as pgerr
from psycopg.rows import dict_row

from api import config

log = logging.getLogger("aegisneo.db")

FEATURED_LIMIT = 10
# Arbitrary key for the advisory lock that serialises changes to is_featured.
FEATURED_LOCK_KEY = 8_410_001

SORT_COLUMNS = {
    "name": "name",
    "diameter": "estimated_diameter_km",
    "velocity": "relative_velocity_km_h",
    "miss_distance": "miss_distance_km",
    "date": "close_approach_date",
    "magnitude": "absolute_magnitude",
}

ASTEROID_COLUMNS = (
    "neo_reference_id, name, estimated_diameter_km, is_potentially_hazardous, "
    "close_approach_date, relative_velocity_km_h, miss_distance_km, "
    "absolute_magnitude, is_featured, created_by, created_at, updated_at"
)

DUPLICATE_FIELDS = {
    "asteroids_pkey": "neo_reference_id",
    "asteroids_name_lower_key": "name",
}


class DatabaseUnavailable(Exception):
    """The database cannot be reached."""


class DatabaseError(Exception):
    """The database refused or failed an operation."""


class DuplicateError(Exception):
    def __init__(self, field):
        self.field = field


class FeaturedLimitError(Exception):
    pass


class UnknownUserError(Exception):
    """The user in a token no longer exists."""


@contextmanager
def connection():
    url = config.database_url()
    if not url:
        log.error("DATABASE_URL is not set")
        raise DatabaseUnavailable()
    try:
        # prepare_threshold=None: the Neon pooler may hand consecutive
        # statements to different sessions, so no server-side prepared
        # statements. connect_timeout makes an outage fail fast with a 503.
        conn = psycopg.connect(url, connect_timeout=10, prepare_threshold=None, row_factory=dict_row)
    except psycopg.Error:
        log.exception("could not connect to the database")
        raise DatabaseUnavailable()
    try:
        with conn:  # commit on success, roll back on error
            yield conn
    except (psycopg.OperationalError, psycopg.InterfaceError):
        log.exception("database connection lost")
        raise DatabaseUnavailable()
    except pgerr.UniqueViolation as exc:
        raise DuplicateError(DUPLICATE_FIELDS.get(exc.diag.constraint_name, "record")) from None
    except pgerr.ForeignKeyViolation:
        raise UnknownUserError() from None
    except psycopg.Error:
        log.exception("database operation failed")
        raise DatabaseError()
    finally:
        conn.close()


def like_pattern(text):
    """Escape LIKE wildcards so a search for "100%" matches literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def build_filters(search, hazardous, min_diameter, max_diameter, from_date, to_date, featured_only):
    conditions, params = [], []
    if featured_only:
        conditions.append("is_featured")
    if search:
        pattern = like_pattern(search)
        if search.isascii() and search.isdigit():
            # Only digits can match an ID. Adding the ID condition to every search
            # would stop PostgreSQL from using the trigram index on name.
            conditions.append("(name ilike %s or neo_reference_id like %s)")
            params += [pattern, pattern]
        else:
            conditions.append("name ilike %s")
            params.append(pattern)
    if hazardous is not None:
        conditions.append("is_potentially_hazardous = %s")
        params.append(hazardous)
    if min_diameter is not None:
        conditions.append("estimated_diameter_km >= %s")
        params.append(min_diameter)
    if max_diameter is not None:
        conditions.append("estimated_diameter_km <= %s")
        params.append(max_diameter)
    if from_date is not None:
        conditions.append("close_approach_date >= %s")
        params.append(from_date)
    if to_date is not None:
        conditions.append("close_approach_date <= %s")
        params.append(to_date)
    where = (" where " + " and ".join(conditions)) if conditions else ""
    return where, params


def count_asteroids(featured_only=False):
    with connection() as conn:
        sql = "select count(*) as n from asteroids" + (" where is_featured" if featured_only else "")
        return conn.execute(sql).fetchone()["n"]


def ping():
    with connection() as conn:
        conn.execute("select 1")


def list_asteroids(*, search, hazardous, min_diameter, max_diameter, from_date, to_date,
                   sort, order, limit, offset, featured_only):
    """One page of asteroids, the number of matches and the visible catalog size."""
    where, params = build_filters(search, hazardous, min_diameter, max_diameter,
                                  from_date, to_date, featured_only)
    column = SORT_COLUMNS.get(sort, "neo_reference_id")
    direction = "desc" if order == "desc" else "asc"  # never taken from the client as-is
    sql = (
        f"select {ASTEROID_COLUMNS}, count(*) over () as matched from asteroids{where} "
        f"order by {column} {direction}, neo_reference_id limit %s offset %s"
    )
    with connection() as conn:
        rows = conn.execute(sql, params + [limit, offset]).fetchall()
        if rows:
            matched = rows[0]["matched"]
        elif offset:
            # The page is past the end: count the matches separately.
            matched = conn.execute(f"select count(*) as n from asteroids{where}", params).fetchone()["n"]
        else:
            matched = 0
        visible = conn.execute(
            "select count(*) as n from asteroids" + (" where is_featured" if featured_only else "")
        ).fetchone()["n"]
    for row in rows:
        del row["matched"]
    return rows, matched, visible


def random_asteroids(*, count, hazardous, min_diameter, max_diameter, featured_only):
    where, params = build_filters(None, hazardous, min_diameter, max_diameter, None, None, featured_only)
    with connection() as conn:
        rows = conn.execute(
            f"select {ASTEROID_COLUMNS} from asteroids{where} order by random() limit %s",
            params + [count],
        ).fetchall()
        matched = conn.execute(f"select count(*) as n from asteroids{where}", params).fetchone()["n"]
    return rows, matched


def get_asteroid(neo_reference_id):
    with connection() as conn:
        return conn.execute(
            f"select {ASTEROID_COLUMNS} from asteroids where neo_reference_id = %s",
            [neo_reference_id],
        ).fetchone()


def _check_featured_room(conn, neo_reference_id):
    """Raise unless one more asteroid may be featured. Call inside a transaction."""
    conn.execute("select pg_advisory_xact_lock(%s)", [FEATURED_LOCK_KEY])
    taken = conn.execute(
        "select count(*) as n from asteroids where is_featured and neo_reference_id <> %s",
        [neo_reference_id],
    ).fetchone()["n"]
    if taken >= FEATURED_LIMIT:
        raise FeaturedLimitError()


def create_asteroid(data, user_id):
    values = data.model_dump()
    with connection() as conn:
        if values["is_featured"]:
            _check_featured_room(conn, values["neo_reference_id"])
        return conn.execute(
            "insert into asteroids (neo_reference_id, name, estimated_diameter_km, "
            "is_potentially_hazardous, close_approach_date, relative_velocity_km_h, "
            "miss_distance_km, absolute_magnitude, is_featured, created_by) "
            "values (%(neo_reference_id)s, %(name)s, %(estimated_diameter_km)s, "
            "%(is_potentially_hazardous)s, %(close_approach_date)s, %(relative_velocity_km_h)s, "
            "%(miss_distance_km)s, %(absolute_magnitude)s, %(is_featured)s, %(created_by)s) "
            f"returning {ASTEROID_COLUMNS}",
            {**values, "created_by": user_id},
        ).fetchone()


UPDATABLE_COLUMNS = (
    "name", "estimated_diameter_km", "is_potentially_hazardous", "close_approach_date",
    "relative_velocity_km_h", "miss_distance_km", "absolute_magnitude", "is_featured",
)


def update_asteroid(neo_reference_id, data):
    """Change only the submitted fields. Returns None if the asteroid does not exist."""
    changes = data.model_dump(exclude_unset=True)
    # Column names come from this fixed list, never from the request.
    assignments = [f"{col} = %({col})s" for col in UPDATABLE_COLUMNS if col in changes]
    with connection() as conn:
        if changes.get("is_featured"):
            _check_featured_room(conn, neo_reference_id)
        return conn.execute(
            f"update asteroids set {', '.join(assignments)}, updated_at = now() "
            f"where neo_reference_id = %(neo_reference_id)s returning {ASTEROID_COLUMNS}",
            {**changes, "neo_reference_id": neo_reference_id},
        ).fetchone()


def delete_asteroid(neo_reference_id):
    with connection() as conn:
        return conn.execute(
            "delete from asteroids where neo_reference_id = %s returning neo_reference_id",
            [neo_reference_id],
        ).fetchone() is not None


def catalog_stats():
    with connection() as conn:
        row = conn.execute(
            "select count(*) as total, "
            "count(*) filter (where is_potentially_hazardous) as hazardous, "
            "min(estimated_diameter_km) as d_min, max(estimated_diameter_km) as d_max, "
            "percentile_cont(0.5) within group (order by estimated_diameter_km) as d_med, "
            "min(relative_velocity_km_h) as v_min, max(relative_velocity_km_h) as v_max, "
            "percentile_cont(0.5) within group (order by relative_velocity_km_h) as v_med, "
            "min(miss_distance_km) as m_min, max(miss_distance_km) as m_max, "
            "percentile_cont(0.5) within group (order by miss_distance_km) as m_med, "
            "min(close_approach_date) as date_min, max(close_approach_date) as date_max "
            "from asteroids"
        ).fetchone()
    if row["total"] == 0:
        return {"total": 0, "potentially_hazardous": 0}
    return {
        "total": row["total"],
        "potentially_hazardous": row["hazardous"],
        "estimated_diameter_km": {"min": row["d_min"], "max": row["d_max"], "median": row["d_med"]},
        "relative_velocity_km_h": {"min": row["v_min"], "max": row["v_max"], "median": row["v_med"]},
        "miss_distance_km": {"min": row["m_min"], "max": row["m_max"], "median": row["m_med"]},
        "close_approach_date": {"min": row["date_min"].isoformat(), "max": row["date_max"].isoformat()},
    }


def get_user_by_username(username):
    with connection() as conn:
        return conn.execute(
            "select id, username, password_hash from users where username = %s", [username]
        ).fetchone()
