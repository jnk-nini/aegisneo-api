-- Adds the roles table and a role for every account, on a database that was
-- created with the earlier schema.sql. Run once as the owner (neondb_owner)
-- in the Neon SQL Editor. Running it again changes nothing.

begin;

create table if not exists public.roles (
  name        text primary key check (name ~ '^[a-z]{3,20}$'),
  description text not null
);

insert into public.roles (name, description) values
  ('admin', 'Read the whole catalog; create, update and delete asteroids'),
  ('user',  'Read the whole catalog; cannot change data')
on conflict (name) do nothing;

alter table public.users
  add column if not exists role text not null default 'user'
  references public.roles (name) on update cascade;

-- Accounts made before roles existed could already change data, so on the
-- first run they all become admins. (Once an admin exists, this does nothing.)
-- Change any of them afterwards with scripts/set_role.py.
update public.users set role = 'admin'
where not exists (select 1 from public.users where role = 'admin');

grant select on public.roles to aegis_app;

commit;

-- Check: every account and its role.
select id, username, role from public.users order by id;
