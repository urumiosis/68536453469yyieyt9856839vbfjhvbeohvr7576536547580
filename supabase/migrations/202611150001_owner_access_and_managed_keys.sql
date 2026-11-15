-- Server-generated P-256 signing key: only the Edge Function service role can read it.
-- No signing key is ever stored in GitHub, page JavaScript, or readable client tables.
begin;
create table if not exists public.license_signing_keys (
  id integer primary key check (id = 1),
  private_key text not null,
  public_key text not null,
  created_at timestamptz not null default now()
);
alter table public.license_signing_keys enable row level security;
revoke all on public.license_signing_keys from public, anon, authenticated;
grant select, insert on public.license_signing_keys to service_role;

-- The existing verified owner/admin account is permitted independently from
-- the E#### student-signup switch; ordinary users still need an exact school email.
create or replace function public.license_account_allowed(p_user_id uuid, p_email text)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.role = 'admin'
  ) or public.student_email_allowed(p_email);
$$;
revoke all on function public.license_account_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.license_account_allowed(uuid, text) to service_role;

-- Preserve the existing private source before integrating the certificate gate.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
create table if not exists app_private.private_app_code_backup_20261115 (
  id integer primary key,
  code text not null,
  original_updated_at timestamptz,
  backed_up_at timestamptz not null default now()
);
insert into app_private.private_app_code_backup_20261115
  (id, code, original_updated_at)
select id, code, updated_at
from public.private_app_code
on conflict (id) do nothing;
commit;