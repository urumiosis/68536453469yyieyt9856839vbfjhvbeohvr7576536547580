-- IMPORTANT: This project already has its student enrollment tables and Auth Hook.
-- This migration adds the service-role-only eligibility RPC used by certificate
-- issuance and verification. It does NOT create duplicate signup tables or hooks.
--
-- Existing objects in the Anti Markaryd Supabase project:
--   public.student_signup_config (id, email_domain, enabled)
--   public.student_approved_emails (email, active, approved_at)
--   public.hook_restrict_student_signup(event jsonb)
--
-- Run only after checking that these three objects exist.
-- Registration remains fail-closed until the domain, roster, and hook are set up.
begin;

do $$
begin
  if to_regclass('public.student_signup_config') is null
    or to_regclass('public.student_approved_emails') is null
    or to_regprocedure('public.hook_restrict_student_signup(jsonb)') is null then
    raise exception 'Missing existing student signup tables or Auth Hook; stop before deployment';
  end if;
end
$$;

create or replace function public.student_email_allowed(p_email text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.student_signup_config c
      join public.student_approved_emails s
        on s.email = lower(p_email) and s.active
     where c.id = 1
       and c.enabled
       and c.email_domain = 'edu.markaryd.se'
       and split_part(lower(p_email), '@', 2) = c.email_domain
       and split_part(lower(p_email), '@', 1) ~ '^e[0-9]{4}$'
  );
$$;

revoke all on function public.student_email_allowed(text) from public, anon, authenticated;
grant execute on function public.student_email_allowed(text) to service_role;

commit;

-- To configure the current school domain *without* permitting enrollment:
-- update public.student_signup_config
-- set email_domain = 'edu.markaryd.se', enabled = false
-- where id = 1;
--
-- Insert authorized actual students into public.student_approved_emails,
-- then enable registration in the database:
-- update public.student_signup_config
-- set email_domain = 'edu.markaryd.se', enabled = true
-- where id = 1;
--
-- ALSO enable the EXISTING public.hook_restrict_student_signup function in
-- Authentication -> Hooks -> Before User Created. Never select a duplicate hook.
