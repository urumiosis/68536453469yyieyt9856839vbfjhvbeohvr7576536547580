-- Enforce certificate incidents after server-side authentication and
-- cryptographic proof. These are SITE access bans; Supabase Auth users remain
-- available to administrators for investigation and possible appeal.
--
-- IMPORTANT: browser public-key fingerprints are not physical Chromebook IDs.
-- Only the verifying service role may read and write these records.
begin;

create table if not exists public.certificate_account_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (reason = 'signed_device_mismatch'),
  banned_at timestamptz not null default now()
);

create table if not exists public.certificate_device_bans (
  device_id text primary key check (device_id ~ '^[A-Za-z0-9_-]{43}$'),
  account_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason = 'bad_signature_on_proven_registered_device'),
  banned_at timestamptz not null default now()
);

alter table public.certificate_account_bans enable row level security;
alter table public.certificate_device_bans enable row level security;

revoke all on table public.certificate_account_bans
  from public, anon, authenticated;
revoke all on table public.certificate_device_bans
  from public, anon, authenticated;
grant select, insert on table public.certificate_account_bans to service_role;
grant select, insert on table public.certificate_device_bans to service_role;

create index if not exists certificate_device_bans_account_idx
  on public.certificate_device_bans (account_id);

comment on table public.certificate_account_bans is
  'Permanent site access denial after an authentic current-user certificate is presented from a different browser profile.';
comment on table public.certificate_device_bans is
  'Permanent registered browser-key ban after an invalid issuer signature AND verified possession of the registered profile private key.';

-- The existing audit table is preserved; automatic enforcement uses
-- independent server-only tables above, never untrusted uploaded claims alone.
comment on table public.certificate_security_events is
  'Server-only audit of certificate uploads and rejections; low-trust signals must not directly ban a user.';

commit;
