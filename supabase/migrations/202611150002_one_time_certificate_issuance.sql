-- Only the service-role issuance function may consume the INITIAL challenge.
-- Unlike normal certificate verification, this is allowed exactly once per
-- account unless the owner explicitly resets the enrollment in Supabase.
begin;

create or replace function public.finish_license_initial_issuance(
  account_id uuid, requested_device_id text, nonce text
) returns boolean
language sql
security invoker
set search_path = ''
as $$
  with updated as (
    update public.license_devices
       set activated_at = now(),
           challenge = null,
           challenge_expires_at = null
     where user_id = account_id
       and device_id = requested_device_id
       and activated_at is null
       and challenge = nonce
       and challenge_expires_at > now()
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke all on function public.finish_license_initial_issuance(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.finish_license_initial_issuance(uuid,text,text)
  to service_role;

commit;

-- Lost or expired file: a site owner can authorize a fresh issuance,
-- but must verify account ownership first. This reset intentionally also
-- revokes the previous browser key binding.
-- update public.license_devices set activated_at = null, challenge = null,
--   challenge_expires_at = null where user_id = '<verified user UUID>';
