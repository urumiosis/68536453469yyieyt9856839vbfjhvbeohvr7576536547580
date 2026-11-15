-- Audit invalid certificate uploads, without enabling a forged-upload denial of service.
-- Only the verified Edge Function's service role may read or write events.
-- Entries are de-duplicated per requesting account, event class and UTC hour.
begin;

create table if not exists public.certificate_security_events (
  account_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'invalid_certificate',
      'untrusted_matching_device_claim',
      'signed_device_mismatch',
      'invalid_device_proof'
    )
  ),
  hour_bucket timestamptz not null,
  last_seen_at timestamptz not null default now(),
  primary key (account_id, event_type, hour_bucket)
);

alter table public.certificate_security_events enable row level security;

revoke all on table public.certificate_security_events from public, anon, authenticated;
grant select, insert, update on table public.certificate_security_events to service_role;

create index if not exists certificate_security_events_recent_idx
  on public.certificate_security_events (last_seen_at desc);

comment on table public.certificate_security_events is
  'Server-only alerts for certificate uploads; never auto-ban accounts or devices based on uploaded claims.';

commit;
