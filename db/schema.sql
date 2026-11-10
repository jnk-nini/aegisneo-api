-- AegisNEO database schema (PostgreSQL 18 on Neon).
-- Run once as the owner role (neondb_owner), never as aegis_app.

create extension if not exists pg_trgm;

create table public.users (
  id            integer generated always as identity primary key,
  username      text not null unique
                check (username ~ '^[a-z0-9_]{3,30}$'),
  password_hash text not null check (length(password_hash) = 60),
  created_at    timestamptz not null default now()
);

create table public.asteroids (
  neo_reference_id          text primary key
                            check (neo_reference_id ~ '^[0-9]{1,10}$'),
  name                      text not null
                            check (length(btrim(name)) between 1 and 100),
  estimated_diameter_km     double precision not null
                            check (estimated_diameter_km > 0
                                   and estimated_diameter_km <= 1000),
  is_potentially_hazardous  boolean not null default false,
  close_approach_date       date not null
                            check (close_approach_date
                                   between '1900-01-01' and '2200-12-31'),
  relative_velocity_km_h    double precision not null
                            check (relative_velocity_km_h between 0 and 1000000),
  miss_distance_km          double precision not null
                            check (miss_distance_km between 0 and 1000000000),
  absolute_magnitude        double precision not null
                            check (absolute_magnitude between 0 and 40),
  is_featured               boolean not null default false,
  created_by                integer
                            references public.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create unique index asteroids_name_lower_key on public.asteroids (lower(name));
create index asteroids_name_trgm_idx  on public.asteroids using gin (name gin_trgm_ops);
create index asteroids_diameter_idx   on public.asteroids (estimated_diameter_km);
create index asteroids_date_idx       on public.asteroids (close_approach_date);
create index asteroids_featured_idx   on public.asteroids (name) where is_featured;
create index asteroids_created_by_idx on public.asteroids (created_by);

-- The API connects as aegis_app: it can read and write asteroids and read
-- users, and nothing else. The role must exist before this script runs.
grant usage on schema public to aegis_app;
grant select, insert, update, delete on public.asteroids to aegis_app;
grant select on public.users to aegis_app;
