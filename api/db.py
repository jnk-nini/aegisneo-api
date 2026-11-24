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
from psycopg.types.json import Jsonb

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
    "users_username_key": "username",
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


def is_date_text(text):
    """True for text that can be part of a date: digits and dashes, with a dash
    ("1968-", "05-12") or exactly four digits (a year)."""
    if not (text.isascii() and 1 <= len(text) <= 10):
        return False
    if not all(ch.isdigit() or ch == "-" for ch in text):
        return False
    return "-" in text or (len(text) == 4 and text.isdigit())


def source(item_limit):
    """The rows a caller may see: the whole table, or (when the role has an
    item_limit) at most that many featured asteroids. Returns the FROM item and
    its parameters. The item is named "asteroids" so the queries stay the same."""
    if item_limit is None:
        return "asteroids", []
    return ("(select * from asteroids where is_featured "
            "order by neo_reference_id limit %s) as asteroids"), [item_limit]


def build_filters(search, hazardous, min_diameter, max_diameter, from_date, to_date):
    conditions, params = [], []
    if search:
        pattern = like_pattern(search)
        if is_date_text(search):
            # Date-like text ("1968-", "1968-05", "2024-03-15", or a year) also
            # matches the close approach date, as the first API did.
            conditions.append("(name ilike %s or close_approach_date::text like %s)")
            params += [pattern, pattern]
        elif search.isascii() and search.isdigit():
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


def count_asteroids(item_limit=None):
    src, src_params = source(item_limit)
    with connection() as conn:
        return conn.execute(f"select count(*) as n from {src}", src_params).fetchone()["n"]


def ping():
    with connection() as conn:
        conn.execute("select 1")


def list_asteroids(*, search, hazardous, min_diameter, max_diameter, from_date, to_date,
                   sort, order, limit, offset, item_limit=None):
    """One page of asteroids, the number of matches and the visible catalog size."""
    src, src_params = source(item_limit)
    where, params = build_filters(search, hazardous, min_diameter, max_diameter, from_date, to_date)
    column = SORT_COLUMNS.get(sort, "neo_reference_id")
    direction = "desc" if order == "desc" else "asc"  # never taken from the client as-is
    sql = (
        f"select {ASTEROID_COLUMNS}, count(*) over () as matched from {src}{where} "
        f"order by {column} {direction}, neo_reference_id limit %s offset %s"
    )
    with connection() as conn:
        rows = conn.execute(sql, src_params + params + [limit, offset]).fetchall()
        if rows:
            matched = rows[0]["matched"]
        elif offset:
            # The page is past the end: count the matches separately.
            matched = conn.execute(f"select count(*) as n from {src}{where}", src_params + params).fetchone()["n"]
        else:
            matched = 0
        visible = conn.execute(f"select count(*) as n from {src}", src_params).fetchone()["n"]
    for row in rows:
        del row["matched"]
    return rows, matched, visible


def random_asteroids(*, count, hazardous, min_diameter, max_diameter, item_limit=None):
    src, src_params = source(item_limit)
    where, params = build_filters(None, hazardous, min_diameter, max_diameter, None, None)
    with connection() as conn:
        rows = conn.execute(
            f"select {ASTEROID_COLUMNS} from {src}{where} order by random() limit %s",
            src_params + params + [count],
        ).fetchall()
        matched = conn.execute(f"select count(*) as n from {src}{where}", src_params + params).fetchone()["n"]
    return rows, matched


def get_asteroid(neo_reference_id, item_limit=None):
    """One asteroid, or None if it does not exist or is outside what the caller may see."""
    src, src_params = source(item_limit)
    with connection() as conn:
        return conn.execute(
            f"select {ASTEROID_COLUMNS} from {src} where neo_reference_id = %s",
            src_params + [neo_reference_id],
        ).fetchone()


def asteroid_exists(neo_reference_id):
    with connection() as conn:
        return conn.execute(
            "select 1 from asteroids where neo_reference_id = %s", [neo_reference_id]
        ).fetchone() is not None


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
        row = conn.execute(
            "insert into asteroids (neo_reference_id, name, estimated_diameter_km, "
            "is_potentially_hazardous, close_approach_date, relative_velocity_km_h, "
            "miss_distance_km, absolute_magnitude, is_featured, created_by) "
            "values (%(neo_reference_id)s, %(name)s, %(estimated_diameter_km)s, "
            "%(is_potentially_hazardous)s, %(close_approach_date)s, %(relative_velocity_km_h)s, "
            "%(miss_distance_km)s, %(absolute_magnitude)s, %(is_featured)s, %(created_by)s) "
            f"returning {ASTEROID_COLUMNS}",
            {**values, "created_by": user_id},
        ).fetchone()
        _audit(conn, row["neo_reference_id"], row["name"], user_id, "create",
               {k: _plain(v) for k, v in values.items() if k not in ("neo_reference_id", "name")})
        return row


UPDATABLE_COLUMNS = (
    "name", "estimated_diameter_km", "is_potentially_hazardous", "close_approach_date",
    "relative_velocity_km_h", "miss_distance_km", "absolute_magnitude", "is_featured",
)


def update_asteroid(neo_reference_id, data, user_id=None):
    """Change only the submitted fields. Returns None if the asteroid does not exist."""
    changes = data.model_dump(exclude_unset=True)
    # Column names come from this fixed list, never from the request.
    assignments = [f"{col} = %({col})s" for col in UPDATABLE_COLUMNS if col in changes]
    with connection() as conn:
        before = conn.execute(
            f"select {ASTEROID_COLUMNS} from asteroids where neo_reference_id = %s for update",
            [neo_reference_id],
        ).fetchone()
        if before is None:
            return None
        if changes.get("is_featured"):
            _check_featured_room(conn, neo_reference_id)
        row = conn.execute(
            f"update asteroids set {', '.join(assignments)}, updated_at = now() "
            f"where neo_reference_id = %(neo_reference_id)s returning {ASTEROID_COLUMNS}",
            {**changes, "neo_reference_id": neo_reference_id},
        ).fetchone()
        diff = {col: {"from": _plain(before[col]), "to": _plain(row[col])}
                for col in changes if before[col] != row[col]}
        _audit(conn, neo_reference_id, row["name"], user_id, "update", diff)
        return row


def delete_asteroid(neo_reference_id, user_id=None):
    with connection() as conn:
        row = conn.execute(
            "delete from asteroids where neo_reference_id = %s returning neo_reference_id, name",
            [neo_reference_id],
        ).fetchone()
        if row is None:
            return False
        _audit(conn, row["neo_reference_id"], row["name"], user_id, "delete", {})
        return True


def _plain(value):
    """Dates become text so a change can be stored as JSON."""
    return value.isoformat() if hasattr(value, "isoformat") else value


def _audit(conn, neo_reference_id, name, user_id, action, changes):
    conn.execute(
        "insert into asteroid_audit (neo_reference_id, asteroid_name, user_id, action, changes) "
        "values (%s, %s, %s, %s, %s)",
        [neo_reference_id, name, user_id, action, Jsonb(changes)],
    )


def catalog_stats(item_limit=None):
    src, src_params = source(item_limit)
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
            f"from {src}", src_params
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
            "select id, username, password_hash, role from users where username = %s", [username]
        ).fetchone()


def create_user(username, password_hash, recovery_hash=None):
    """Add an account. The role is not sent: the database gives it 'user'."""
    with connection() as conn:
        user = conn.execute(
            "insert into users (username, password_hash, recovery_hash) values (%s, %s, %s) "
            "returning id, username, role",
            [username, password_hash, recovery_hash],
        ).fetchone()
        _award_badges(conn, user["id"])  # First Contact
        return user


def get_user(user_id):
    with connection() as conn:
        return conn.execute(
            "select id, username, role, recovery_hash is not null as has_recovery_code "
            "from users where id = %s", [user_id]
        ).fetchone()


def get_user_secrets(username):
    """id, password hash and recovery hash of an account, for the reset flow only."""
    with connection() as conn:
        return conn.execute(
            "select id, password_hash, recovery_hash from users where username = %s", [username]
        ).fetchone()


def get_password_hash(user_id):
    with connection() as conn:
        row = conn.execute("select password_hash from users where id = %s", [user_id]).fetchone()
    return row["password_hash"] if row else None


def set_credentials(user_id, password_hash=None, recovery_hash=None):
    """Change the password hash and/or the recovery hash. Returns False if the account is gone."""
    sets, params = [], []
    if password_hash is not None:
        sets.append("password_hash = %s"); params.append(password_hash)
    if recovery_hash is not None:
        sets.append("recovery_hash = %s"); params.append(recovery_hash)
    with connection() as conn:
        row = conn.execute(f"update users set {', '.join(sets)} where id = %s returning id", params + [user_id]).fetchone()
    return row is not None


def get_user_role(user_id):
    """The account's current role, or None if the account no longer exists."""
    user = get_user(user_id)
    return user["role"] if user else None


# ============================================================
# SITES, ACCESS RULES AND LAUNCHES
# ============================================================
def get_site_access(role, site):
    """The site_access row for (role, site), or None."""
    with connection() as conn:
        return conn.execute(
            "select can_write, item_limit from site_access where role = %s and site = %s",
            [role, site],
        ).fetchone()


def list_sites(role):
    """Every site with what the given role may do there (None = no access)."""
    with connection() as conn:
        return conn.execute(
            "select s.slug, s.name, s.kind, s.description, s.url, "
            "a.role is not null as allowed, a.can_write, a.item_limit "
            "from sites s left join site_access a on a.site = s.slug and a.role = %s "
            "order by s.sort_order, s.slug",
            [role],
        ).fetchall()


def get_user_access(user_id, site):
    """The account's CURRENT role and what that role may do on a site, in one
    query. None if the account no longer exists. can_write is None if the
    role has no rule for this site."""
    with connection() as conn:
        return conn.execute(
            "select u.role, a.can_write, a.item_limit from users u "
            "left join site_access a on a.role = u.role and a.site = %s where u.id = %s",
            [site, user_id],
        ).fetchone()


def get_site(slug):
    with connection() as conn:
        return conn.execute(
            "select slug, name, kind, description, url from sites where slug = %s", [slug]
        ).fetchone()


def record_launch(user_id, site, role):
    """Log that someone opened a site; for an account, also award the badges
    this earns. Returns the badges that are new."""
    with connection() as conn:
        conn.execute(
            "insert into launches (user_id, site, role) values (%s, %s, %s)", [user_id, site, role]
        )
        return _award_badges(conn, user_id) if user_id else []


# ============================================================
# RATE LIMITING (see api/ratelimit.py)
# ============================================================
def hit_rate_limit(bucket, window_seconds):
    """Count one attempt in the current window of a bucket.
    Returns (attempts so far in this window, seconds until the window ends)."""
    with connection() as conn:
        row = conn.execute(
            "with w as (select to_timestamp(floor(extract(epoch from now()) / %(w)s) * %(w)s) as start) "
            "insert into rate_limits (bucket, window_start, hits) select %(b)s, w.start, 1 from w "
            "on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1 "
            "returning hits, greatest(1, ceil(extract(epoch from window_start + make_interval(secs => %(w)s) - now())))::int as left_s",
            {"b": bucket, "w": window_seconds},
        ).fetchone()
    return row["hits"], row["left_s"]


def purge_rate_limits():
    with connection() as conn:
        conn.execute("delete from rate_limits where window_start < now() - interval '1 day'")


# ============================================================
# WATCHLIST AND BADGES
# ============================================================
WATCHLIST_LIMIT = 200


class WatchlistFullError(Exception):
    pass


def list_watchlist(user_id):
    with connection() as conn:
        return conn.execute(
            f"select {ASTEROID_COLUMNS}, w.added_at as watched_since "
            "from watchlist w join asteroids a using (neo_reference_id) "
            "where w.user_id = %s order by w.added_at desc",
            [user_id],
        ).fetchall()


def watchlist_ids(user_id):
    with connection() as conn:
        rows = conn.execute("select neo_reference_id from watchlist where user_id = %s", [user_id]).fetchall()
    return [r["neo_reference_id"] for r in rows]


def add_to_watchlist(user_id, neo_reference_id):
    """Add an asteroid (adding it twice changes nothing). Returns the new badges."""
    with connection() as conn:
        conn.execute("select pg_advisory_xact_lock(%s)", [user_id])
        have = conn.execute("select count(*) as n from watchlist where user_id = %s", [user_id]).fetchone()["n"]
        inserted = conn.execute(
            "insert into watchlist (user_id, neo_reference_id) values (%s, %s) "
            "on conflict do nothing returning 1", [user_id, neo_reference_id]
        ).fetchone()
        if inserted and have >= WATCHLIST_LIMIT:
            raise WatchlistFullError()
        return _award_badges(conn, user_id)


def remove_from_watchlist(user_id, neo_reference_id):
    with connection() as conn:
        conn.execute(
            "delete from watchlist where user_id = %s and neo_reference_id = %s",
            [user_id, neo_reference_id],
        )


# Each badge is a rule over what the account has done. They are all checked
# after every launch or watchlist change; a badge already held is left alone.
_BADGE_RULES = {
    "first_contact": "true",
    "explorer": "exists (select 1 from launches where user_id = u.id and site = 'aegisneo')",
    "defender": "exists (select 1 from launches where user_id = u.id and site = 'impactor')",
    "stargazer": "exists (select 1 from launches where user_id = u.id and site = 'neo-atlas')",
    "grand_tour": "(select count(distinct l.site) from launches l join sites s on s.slug = l.site "
                  "where l.user_id = u.id and s.kind in ('main', 'partner')) >= (select count(*) from sites)",
    "watcher": "(select count(*) from watchlist where user_id = u.id) >= 5",
    "hazard_hunter": "(select count(*) from watchlist w join asteroids a using (neo_reference_id) "
                     "where w.user_id = u.id and a.is_potentially_hazardous) >= 3",
}


def _award_badges(conn, user_id):
    """Award every badge whose rule is now true; return the new ones."""
    earned = []
    for code, rule in _BADGE_RULES.items():
        row = conn.execute(
            f"insert into user_badges (user_id, badge) "
            f"select u.id, %s from users u where u.id = %s and {rule} "
            f"on conflict do nothing returning badge",
            [code, user_id],
        ).fetchone()
        if row:
            earned.append(code)
    if not earned:
        return []
    return conn.execute(
        "select code, name, description, icon from badges where code = any(%s) order by sort_order",
        [earned],
    ).fetchall()


def award_badges(user_id):
    with connection() as conn:
        return _award_badges(conn, user_id)


def user_overview(user_id):
    """Everything the hub shows about an account."""
    with connection() as conn:
        user = conn.execute(
            "select id, username, role, created_at from users where id = %s", [user_id]
        ).fetchone()
        if user is None:
            return None
        badges = conn.execute(
            "select b.code, b.name, b.description, b.icon, ub.earned_at "
            "from badges b left join user_badges ub on ub.badge = b.code and ub.user_id = %s "
            "order by b.sort_order",
            [user_id],
        ).fetchall()
        launches = conn.execute(
            "select l.site, s.name as site_name, l.launched_at from launches l "
            "join sites s on s.slug = l.site where l.user_id = %s "
            "order by l.launched_at desc limit 8",
            [user_id],
        ).fetchall()
        watching = conn.execute(
            "select count(*) as n from watchlist where user_id = %s", [user_id]
        ).fetchone()["n"]
    return {"user": user, "badges": badges, "recent_launches": launches, "watchlist_count": watching}


# ============================================================
# ADMIN OVERVIEW
# ============================================================
def admin_overview(recent=15):
    with connection() as conn:
        users = conn.execute(
            "select role, count(*) as n from users group by role order by role"
        ).fetchall()
        launches = conn.execute(
            "select s.slug as site, s.name, "
            "count(l.id) as total, count(l.id) filter (where l.user_id is null) as guests "
            "from sites s left join launches l on l.site = s.slug "
            "group by s.slug, s.name, s.sort_order order by s.sort_order"
        ).fetchall()
        changes = conn.execute(
            "select a.id, a.neo_reference_id, a.asteroid_name, a.action, a.changes, a.changed_at, "
            "u.username as changed_by from asteroid_audit a "
            "left join users u on u.id = a.user_id order by a.changed_at desc, a.id desc limit %s",
            [recent],
        ).fetchall()
        top_watched = conn.execute(
            "select a.neo_reference_id, a.name, count(*) as watchers from watchlist w "
            "join asteroids a using (neo_reference_id) group by a.neo_reference_id, a.name "
            "order by watchers desc, a.name limit 5"
        ).fetchall()
    return {"users_by_role": users, "launches_by_site": launches,
            "recent_changes": changes, "most_watched": top_watched}
