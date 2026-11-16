-- Keep the exact student-email rule server-side without exposing
-- eligibility numbering details in public signup error messages.
-- This deliberately does not turn registration on: email confirmation
-- must be verified in the Authentication dashboard before activation.
create or replace function public.hook_restrict_student_signup(event jsonb)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  address text := lower(btrim(coalesce(event->'user'->>'email', '')));
  signup_open boolean := false;
  allowed boolean;
begin
  select coalesce(c.enabled,false) and c.email_domain = 'edu.markaryd.se'
    into signup_open
    from public.student_signup_config c where c.id=1;
  signup_open := coalesce(signup_open, false);

  if not signup_open then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'Registreringen är tillfälligt stängd.'));
  end if;

  allowed := address ~ '^e[0-9]{4}@edu[.]markaryd[.]se$'
    and coalesce(event->'user'->>'is_anonymous','false') <> 'true';

  if allowed then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Använd din skolmejl för att skapa konto.'));
end;
$$;
