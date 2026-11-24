-- Adds the attempt counters used to throttle sign-in and sign-up (api/ratelimit.py).
-- Run once as the owner role (neondb_owner) on a database made with an older
-- schema.sql. Until it is run, the API simply does not throttle.
begin;

create table if not exists public.rate_limits (
  bucket       text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);
grant select, insert, update, delete on public.rate_limits to aegis_app;

commit;
