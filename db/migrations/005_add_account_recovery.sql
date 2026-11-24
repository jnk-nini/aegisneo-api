-- Adds password recovery: every account may hold a recovery code (stored only as a bcrypt hash),
-- and the API role may change the two columns the reset flow needs. Run once as the owner role.
-- Safe to run twice.
begin;

alter table public.users add column if not exists recovery_hash text;
alter table public.users drop constraint if exists users_recovery_hash_check;
alter table public.users add constraint users_recovery_hash_check
  check (recovery_hash is null or length(recovery_hash) = 60);

grant insert (username, password_hash, recovery_hash) on public.users to aegis_app;
grant update (password_hash, recovery_hash) on public.users to aegis_app;

commit;
