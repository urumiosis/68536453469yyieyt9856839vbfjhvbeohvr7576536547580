-- Stage this migration before enabling Auth -> Hooks -> Before User Created.
-- No school domain or student email is pre-approved. Fail closed until configured.
begin;
create table if not exists public.student_signup_config (
  id integer primary key check (id = 1),
  email_domain text,
  enabled boolean not null default false,
  constraint valid_student_domain check (email_domain is null or email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);
insert into public.student_signup_config (id, email_domain, enabled) values (1, null, false)
on conflict (id) do nothing;

create table if not exists public.student_approved_emails (
  email text primary key check (email = lower(email)),
  active boolean not null default true,
  approved_at timestamptz not null default now(),
  check (email ~ '^e[0-9]{4}@[a-z0-9.-]+$')
);
alter table public.student_signup_config enable row level security;
alter table public.student_approved_emails enable row level security;
revoke all on public.student_signup_config, public.student_approved_emails from public, anon, authenticated;
grant select on public.student_signup_config, public.student_approved_emails to supabase_auth_admin;

drop policy if exists "Auth hook can read signup configuration" on public.student_signup_config;
create policy "Auth hook can read signup configuration"
  on public.student_signup_config for select to supabase_auth_admin using (true);
drop policy if exists "Auth hook can read approved emails" on public.student_approved_emails;
create policy "Auth hook can read approved emails"
  on public.student_approved_emails for select to supabase_auth_admin using (true);

create or replace function public.hook_restrict_student_signup(event jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  address text := lower(coalesce(event->'user'->>'email', ''));
  requested_domain text := split_part(address, '@', 2);
  allowed boolean;
begin
  select exists (
    select 1 from public.student_signup_config c
    join public.student_approved_emails s on s.email = address and s.active
    where c.id = 1 and c.enabled and c.email_domain = requested_domain
      and split_part(address, '@', 1) ~ '^e[0-9]{4}$'
  ) into allowed;
  if allowed then return '{}'::jsonb; end if;
  return jsonb_build_object('error',
    jsonb_build_object('http_code', 403, 'message', 'Registration is not available for this account.'));
end;
$$;
revoke all on function public.hook_restrict_student_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_restrict_student_signup(jsonb) to supabase_auth_admin;

-- Fix user-editable metadata privilege escalation in the existing profile trigger.
-- Existing server-assigned administrator roles remain unchanged.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', null),
          'member')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
commit;
