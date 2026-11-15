-- Accept every e0000..e9999@edu.markaryd.se address, after confirmation.
-- Existing student_signup_config remains the on/off switch.
-- Existing approved-email table is preserved but NOT consulted for registration.
-- This replaces the already-installed hook: do not create a duplicate hook.
begin;

do $$
begin
  if to_regclass('public.student_signup_config') is null
     or to_regprocedure('public.hook_restrict_student_signup(jsonb)') is null then
    raise exception 'Missing existing student signup config or hook';
  end if;
end $$;

create or replace function public.hook_restrict_student_signup(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  address text := lower(btrim(coalesce(event->'user'->>'email', '')));
  allowed boolean;
begin
  select exists(
    select 1 from public.student_signup_config c
    where c.id = 1
      and c.enabled
      and c.email_domain = 'edu.markaryd.se'
      and address ~ '^e[0-9]{4}@edu[.]markaryd[.]se$'
  ) into allowed;

  if allowed and coalesce(event->'user'->>'is_anonymous', 'false') <> 'true' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error',
    jsonb_build_object('http_code', 403, 'message',
      'Registration requires a confirmed school email in the e0000–e9999 range.'));
end;
$$;
revoke all on function public.hook_restrict_student_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_restrict_student_signup(jsonb) to supabase_auth_admin;

-- Server-side certificate functions also use this rule. They separately
-- require authenticated accounts with confirmed school email addresses.
create or replace function public.student_email_allowed(p_email text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists(
    select 1 from public.student_signup_config c
    where c.id = 1
      and c.enabled
      and c.email_domain = 'edu.markaryd.se'
      and lower(btrim(p_email)) ~ '^e[0-9]{4}@edu[.]markaryd[.]se$'
  );
$$;
revoke all on function public.student_email_allowed(text) from public, anon, authenticated;
grant execute on function public.student_email_allowed(text) to service_role;

commit;

-- Do not turn on sign-up until email confirmation, certificate functions,
-- and protected-content policies have been configured and tested.
-- To open sign-up later:
-- update public.student_signup_config
-- set email_domain = 'edu.markaryd.se', enabled = true
-- where id = 1;
