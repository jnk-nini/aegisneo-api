-- Adds the sites, access rules, launches, watchlist, badges and audit tables, and
-- the guest role, to a database made with the earlier schema.sql. Run once as the
-- owner (neondb_owner) in the Neon SQL Editor, after 001_add_roles.sql. Running it
-- again changes nothing.

begin;

insert into public.roles (name, description) values
  ('guest', 'No account: only the featured asteroids, on every site')
on conflict (name) do nothing;

update public.roles set description = 'Whole catalog on every site; create, update and delete asteroids' where name = 'admin';
update public.roles set description = 'Whole catalog on every site; cannot change data' where name = 'user';

-- No account may hold the guest role.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_not_guest') then
    alter table public.users add constraint users_role_not_guest check (role <> 'guest');
  end if;
end $$;

-- The three websites of AegisNEO. 'aegisneo' is the main site (the hub and
-- the explorer); the other two are partner sites that read the API with their
-- own key. The slug is the client name in AEGISNEO_API_KEYS.
create table if not exists public.sites (
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
   'explorer', 1),
  ('impactor',  'Impactor', 'partner',
   'A 3D simulator: pick a real asteroid, aim it at Earth and watch the impact.',
   'https://aegisneo-impactor.vercel.app', 2),
  ('neo-atlas', 'NEO Atlas', 'partner',
   'Your birthday sky: the asteroids that passed on your day, drawn as a constellation and sent as a postcard.',
   'https://neo-atlas-pearl.vercel.app', 3)
on conflict do nothing;

-- What each role may do on each site: one row per (role, site). item_limit is
-- the most asteroids the role can see there (empty = the whole catalog). A
-- limited role sees the featured asteroids only. can_write is used by the
-- main site; partner sites are always read only.
create table if not exists public.site_access (
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
  ('guest', 'neo-atlas', false, 10)
on conflict do nothing;

-- One row each time someone opens a site from the hub. user_id is empty for a
-- guest; role is the role held at that moment (accounts can be promoted later).
create table if not exists public.launches (
  id          bigint generated always as identity primary key,
  user_id     integer references public.users (id) on delete set null,
  site        text not null references public.sites (slug) on update cascade,
  role        text not null references public.roles (name) on update cascade,
  launched_at timestamptz not null default now()
);

create index if not exists launches_user_idx on public.launches (user_id, launched_at desc);
create index if not exists launches_site_idx on public.launches (site, launched_at desc);

-- Asteroids an account is keeping an eye on (many users, many asteroids).
create table if not exists public.watchlist (
  user_id          integer not null references public.users (id) on delete cascade,
  neo_reference_id text not null references public.asteroids (neo_reference_id) on delete cascade,
  added_at         timestamptz not null default now(),
  primary key (user_id, neo_reference_id)
);

create index if not exists watchlist_asteroid_idx on public.watchlist (neo_reference_id);

-- Achievements. The API awards them from what an account has done.
create table if not exists public.badges (
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
  ('hazard_hunter', 'Hazard Hunter',  'Put 3 potentially hazardous asteroids on your watchlist.', '⚠️', 7)
on conflict do nothing;

create table if not exists public.user_badges (
  user_id   integer not null references public.users (id) on delete cascade,
  badge     text not null references public.badges (code) on update cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);

-- Who changed the catalog, and how. Rows are only ever added: the API role
-- cannot update or delete them. neo_reference_id has no foreign key on
-- purpose, so the history of a deleted asteroid is kept.
create table if not exists public.asteroid_audit (
  id               bigint generated always as identity primary key,
  neo_reference_id text not null,
  asteroid_name    text not null,
  user_id          integer references public.users (id) on delete set null,
  action           text not null check (action in ('create', 'update', 'delete')),
  changes          jsonb not null default '{}'::jsonb,
  changed_at       timestamptz not null default now()
);

create index if not exists asteroid_audit_time_idx  on public.asteroid_audit (changed_at desc);
create index if not exists asteroid_audit_asteroid_idx on public.asteroid_audit (neo_reference_id);


grant select on public.sites, public.site_access, public.badges to aegis_app;
grant select, insert on public.launches, public.user_badges, public.asteroid_audit to aegis_app;
grant select, insert, delete on public.watchlist to aegis_app;

commit;

-- Check: the access rules.
select role, site, can_write, item_limit from public.site_access order by site, role;
