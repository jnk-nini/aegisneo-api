-- AegisNEO database schema (PostgreSQL 18 on Neon).
-- Run once as the owner role (neondb_owner), never as aegis_app.

create extension if not exists pg_trgm;

-- Three roles. admin and user are kinds of account; guest is the role of a
-- visitor with no account, so the access rules (site_access below) can describe
-- all three the same way. No account may hold the guest role.
create table public.roles (
  name        text primary key check (name ~ '^[a-z]{3,20}$'),
  description text not null
);

insert into public.roles (name, description) values
  ('admin', 'Whole catalog on every site; create, update and delete asteroids'),
  ('user',  'Whole catalog on every site; cannot change data'),
  ('guest', 'No account: only the featured asteroids, on every site');

create table public.users (
  id            integer generated always as identity primary key,
  username      text not null unique
                check (username ~ '^[a-z0-9_]{3,30}$'),
  password_hash text not null check (length(password_hash) = 60),
  role          text not null default 'user'
                references public.roles (name) on update cascade
                check (role <> 'guest'),
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

-- The three websites of AegisNEO. 'aegisneo' is the main site (the hub and
-- the explorer); the other two are partner sites that read the API with their
-- own key. The slug is the client name in AEGISNEO_API_KEYS.
create table public.sites (
  slug        text primary key check (slug ~ '^[a-z][a-z0-9-]{2,30}$'),
  name        text not null check (length(btrim(name)) between 1 and 60),
  kind        text not null check (kind in ('main', 'partner')),
  description text not null,
  url         text not null,
  sort_order  smallint not null default 0
);

insert into public.sites (slug, name, kind, description, url, sort_order) values
  ('aegisneo',  'AegisNEO Explorer', 'main',
   'Search and sort the asteroid catalog, keep a watchlist, and play Cosmic Guesser.',
   '/frontend/explorer.html', 1),
  ('impactor',  'Impactor', 'partner',
   'A 3D simulator: pick a real asteroid, aim it at Earth and watch the impact.',
   'https://aegisneo-impactor.vercel.app', 2),
  ('neo-atlas', 'NEO Atlas', 'partner',
   'Your birthday sky: the asteroids that passed on your day, drawn as a constellation and sent as a postcard.',
   'https://neo-atlas-pearl.vercel.app', 3);

-- What each role may do on each site: one row per (role, site). item_limit is
-- the most asteroids the role can see there (empty = the whole catalog). A
-- limited role sees the featured asteroids only. can_write is used by the
-- main site; partner sites are always read only.
create table public.site_access (
  role       text not null references public.roles (name) on update cascade,
  site       text not null references public.sites (slug) on update cascade,
  can_write  boolean not null default false,
  item_limit integer check (item_limit is null or item_limit between 1 and 1000),
  primary key (role, site)
);

insert into public.site_access (role, site, can_write, item_limit) values
  ('admin', 'aegisneo',  true,  null),
  ('admin', 'impactor',  false, null),
  ('admin', 'neo-atlas', false, null),
  ('user',  'aegisneo',  false, null),
  ('user',  'impactor',  false, null),
  ('user',  'neo-atlas', false, null),
  ('guest', 'aegisneo',  false, 10),
  ('guest', 'impactor',  false, 10),
  ('guest', 'neo-atlas', false, 10);

-- One row each time someone opens a site from the hub. user_id is empty for a
-- guest; role is the role held at that moment (accounts can be promoted later).
create table public.launches (
  id          bigint generated always as identity primary key,
  user_id     integer references public.users (id) on delete set null,
  site        text not null references public.sites (slug) on update cascade,
  role        text not null references public.roles (name) on update cascade,
  launched_at timestamptz not null default now()
);

create index launches_user_idx on public.launches (user_id, launched_at desc);
create index launches_site_idx on public.launches (site, launched_at desc);

-- Asteroids an account is keeping an eye on (many users, many asteroids).
create table public.watchlist (
  user_id          integer not null references public.users (id) on delete cascade,
  neo_reference_id text not null references public.asteroids (neo_reference_id) on delete cascade,
  added_at         timestamptz not null default now(),
  primary key (user_id, neo_reference_id)
);

create index watchlist_asteroid_idx on public.watchlist (neo_reference_id);

-- Achievements. The API awards them from what an account has done.
create table public.badges (
  code        text primary key check (code ~ '^[a-z_]{3,30}$'),
  name        text not null,
  description text not null,
  icon        text not null,
  sort_order  smallint not null default 0
);

insert into public.badges (code, name, description, icon, sort_order) values
  ('first_contact', 'First Contact',  'Created an AegisNEO account.',                         '👋', 1),
  ('explorer',      'Explorer',       'Opened the AegisNEO Explorer.',                        '🔭', 2),
  ('defender',      'Planet Defender','Launched an impact in Impactor.',                      '☄️', 3),
  ('stargazer',     'Stargazer',      'Found your birthday sky in NEO Atlas.',                '✨', 4),
  ('grand_tour',    'Grand Tour',     'Visited all three AegisNEO sites.',                    '🛰️', 5),
  ('watcher',       'Watcher',        'Put 5 asteroids on your watchlist.',                   '👁️', 6),
  ('hazard_hunter', 'Hazard Hunter',  'Put 3 potentially hazardous asteroids on your watchlist.', '⚠️', 7);

create table public.user_badges (
  user_id   integer not null references public.users (id) on delete cascade,
  badge     text not null references public.badges (code) on update cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);

-- Who changed the catalog, and how. Rows are only ever added: the API role
-- cannot update or delete them. neo_reference_id has no foreign key on
-- purpose, so the history of a deleted asteroid is kept.
create table public.asteroid_audit (
  id               bigint generated always as identity primary key,
  neo_reference_id text not null,
  asteroid_name    text not null,
  user_id          integer references public.users (id) on delete set null,
  action           text not null check (action in ('create', 'update', 'delete')),
  changes          jsonb not null default '{}'::jsonb,
  changed_at       timestamptz not null default now()
);

create index asteroid_audit_time_idx  on public.asteroid_audit (changed_at desc);
create index asteroid_audit_asteroid_idx on public.asteroid_audit (neo_reference_id);

-- The API connects as aegis_app: it can read and write asteroids, read
-- the access rules, and add an account for the sign-up page, and the rows that
-- record what visitors do (launches, watchlist, badges, audit), and nothing else.
-- It may fill in only username and password_hash, so every account it adds
-- gets the default role 'user'. It cannot make an admin, change a role or a
-- password, or delete an account. The role must exist before this script runs.
grant usage on schema public to aegis_app;
grant select, insert, update, delete on public.asteroids to aegis_app;
grant select on public.roles, public.users to aegis_app;
grant insert (username, password_hash) on public.users to aegis_app;
grant select on public.sites, public.site_access, public.badges to aegis_app;
grant select, insert on public.launches, public.user_badges, public.asteroid_audit to aegis_app;
grant select, insert, delete on public.watchlist to aegis_app;
