-- Only the Edge Function may create or consume device challenges.
begin;

create table if not exists public.license_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{43}$'),
  activated_at timestamptz,
  challenge text,
  challenge_expires_at timestamptz
);

alter table public.license_devices enable row level security;
revoke all on public.license_devices from public, anon, authenticated;

create or replace function public.start_license_device_challenge(
  account_id uuid, requested_device_id text, nonce text
) returns boolean
language sql
set search_path = ''
as $$
  with updated as (
    insert into public.license_devices as device (user_id, device_id, challenge, challenge_expires_at)
    values (account_id, requested_device_id, nonce, now() + interval '2 minutes')
    on conflict (user_id) do update
      set device_id = excluded.device_id,
          challenge = excluded.challenge,
          challenge_expires_at = excluded.challenge_expires_at
      where device.activated_at is null or device.device_id = excluded.device_id
    returning 1
  )
  select exists (select 1 from updated);
$$;

create or replace function public.finish_license_device_challenge(
  account_id uuid, requested_device_id text, nonce text
) returns boolean
language sql
set search_path = ''
as $$
  with updated as (
    update public.license_devices
       set activated_at = coalesce(activated_at, now()),
           challenge = null,
           challenge_expires_at = null
     where user_id = account_id
       and device_id = requested_device_id
       and challenge = nonce
       and challenge_expires_at > now()
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke all on function public.start_license_device_challenge(uuid, text, text) from public, anon, authenticated;
revoke all on function public.finish_license_device_challenge(uuid, text, text) from public, anon, authenticated;
grant select, insert, update on public.license_devices to service_role;
grant execute on function public.start_license_device_challenge(uuid, text, text) to service_role;
grant execute on function public.finish_license_device_challenge(uuid, text, text) to service_role;

commit;
