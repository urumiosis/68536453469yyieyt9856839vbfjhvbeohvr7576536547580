-- Private HTML/CSS are stored in Supabase alongside the already private JS.
-- This content is served only by the verified certificate Edge Function.
begin;
create table if not exists public.private_app_assets (
  id integer primary key check (id = 1),
  html text not null,
  css text not null,
  updated_at timestamptz not null default now(),
  constraint private_app_assets_html_nonempty check (length(html) > 0),
  constraint private_app_assets_css_nonempty check (length(css) > 0)
);
alter table public.private_app_assets enable row level security;
revoke all on table public.private_app_assets from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.private_app_assets to service_role;

-- A legacy policy previously permitted EVERY authenticated account to read
-- private JS before certificate verification. Revoke that path entirely.
drop policy if exists "Authenticated users can read private app code"
  on public.private_app_code;
revoke all on table public.private_app_code from PUBLIC, anon, authenticated;
grant select on table public.private_app_code to service_role;

comment on table public.private_app_assets is
  'Private HTML and CSS, available only to service-role verify-license after certificate and browser-key proof.';
commit;
