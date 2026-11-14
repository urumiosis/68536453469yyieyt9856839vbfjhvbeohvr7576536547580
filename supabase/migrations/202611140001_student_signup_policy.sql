-- Restrict new accounts to verified-format student addresses at an exact school domain.
-- Set the actual school domain after applying this migration, before enabling signups.
-- This migration does not install or enable the Auth Hook; select the function in the Dashboard.
begin;

create table if not exists public.student_registration_config (
  id integer primary key default 1 check (id = 1),
  email_domain text not null default '',
  require_allowlist boolean not null default false,
  constraint school_domain_is_lowercase check (
    email_domain = '' or
    (email_domain = lower(email_domain)
      and email_domain ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
      and position('.' in email_domain) > 0)
  )
);
insert into public.student_registration_config (id, email_domain, require_allowlist)
values (1, '', false) on conflict (id) do nothing;

create table if not exists public.student_signup_allowlist (
  email text primary key check (email = lower(email))
);

alter table public.student_registration_config enable row level security;
alter table public.student_signup_allowlist enable row level security;
revoke all on public.student_registration_config from public, anon, authenticated;
revoke all on public.student_signup_allowlist from public, anon, authenticated;

-- Deliberately security-definer; service_role can check eligibility without
-- exposing the private configuration or optional list to site users.
create or replace function public.student_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_registration_config c
    where c.id = 1
      and c.email_domain <> ''
      and p_email is not null
      and lower(p_email) ~ '^e[0-9]{4}@[^@]+$'
      and split_part(lower(p_email), '@', 2) = c.email_domain
      and (
        not c.require_allowlist
        or exists (
          select 1 from public.student_signup_allowlist a
          where a.email = lower(p_email)
        )
      )
  );
$$;
revoke all on function public.student_email_allowed(text) from public, anon, authenticated;
grant execute on function public.student_email_allowed(text) to service_role;

-- Supabase Auth -> Hooks -> Before User Created -> Postgres function.
create or replace function public.hook_only_student_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text := event->'user'->>'email';
begin
  if coalesce(event->'user'->>'is_anonymous', 'false') = 'true'
     or not public.student_email_allowed(candidate) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Registration is restricted to eligible school email accounts.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.hook_only_student_signup(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_only_student_signup(jsonb) to supabase_auth_admin;

commit;

-- REQUIRED MANUAL SETUP (replace the example with YOUR real school domain):
-- update public.student_registration_config
--    set email_domain = 'students.example.edu', require_allowlist = false
--  where id = 1;
--
-- Optional stricter authorization: insert verified student roster addresses:
-- insert into public.student_signup_allowlist(email)
-- values ('e1234@students.example.edu'), ('e5678@students.example.edu')
-- on conflict do nothing;
-- update public.student_registration_config set require_allowlist = true where id = 1;
