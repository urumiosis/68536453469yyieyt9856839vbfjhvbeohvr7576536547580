-- Run in the Supabase SQL Editor before deploying this branch.
-- Website copy and the game catalogue live in Supabase; clients only receive rows
-- after signing in. Writes are restricted to users whose profiles.role = 'admin'.

create table if not exists public.site_content (
  id integer primary key check (id = 1),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.game_catalog (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null default '',
  emoji text not null default '🎮',
  launch_url text,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint game_launch_url_https check (launch_url is null or launch_url ~ '^https://')
);

alter table public.site_content enable row level security;
alter table public.game_catalog enable row level security;

drop policy if exists "Authenticated users can read site content" on public.site_content;
create policy "Authenticated users can read site content"
  on public.site_content for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "Admins can insert site content" on public.site_content;
create policy "Admins can insert site content"
  on public.site_content for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can update site content" on public.site_content;
create policy "Admins can update site content"
  on public.site_content for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Authenticated users can read enabled games" on public.game_catalog;
create policy "Authenticated users can read enabled games"
  on public.game_catalog for select to authenticated
  using (enabled or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can insert games" on public.game_catalog;
create policy "Admins can insert games"
  on public.game_catalog for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can update games" on public.game_catalog;
create policy "Admins can update games"
  on public.game_catalog for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can delete games" on public.game_catalog;
create policy "Admins can delete games"
  on public.game_catalog for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into public.site_content (id, content)
values (1, '{
  "site_intro": "",
  "games_heading": "Spelarkivet",
  "certificate_eyebrow": "SÄKERHETSKONTROLL",
  "certificate_heading": "CERTIFIKATVERIFIERING KRÄVS",
  "certificate_hint": "VARNING: Identiteten måste verifieras innan du får åtkomst. Ladda upp ditt certifikat för att fortsätta.",
  "admin_note": "🔒 Inget konto? Tala med administratörerna.",
  "admin_note_small": "Endast invigda har tillträde.",
  "warning_title": "⚠ VARNING FRÅN ADMINISTRATIONEN",
  "warning_body": "Denna portal är strikt konfidentiell. Använd endast via skolans nätverk om du vågar. Vi tar inget ansvar om du åker dit. Spela smart. Logga ut när du är klar."
}'::jsonb)
on conflict (id) do nothing;

insert into public.game_catalog (id, title, description, emoji, launch_url, sort_order, enabled) values
  ('snake', 'Ormen', 'Klassisk snake. Ät, väx, överlev.', '🐍', null, 10, true),
  ('tetris', 'Tetris', 'Stapla blocken. Rensa raderna.', '🧱', null, 20, true),
  ('2048', '2048', 'Kombinera till 2048. Eller högre.', '🔢', null, 30, true),
  ('flappy', 'Flappy Bird', 'Flyg mellan rören. Missa inte.', '🐦', null, 40, true),
  ('pong', 'Pong', 'Den ursprungliga. Enkel. Oändlig.', '🏓', null, 50, true),
  ('minesweeper', 'Minesweeper', 'Hitta minorna. Tänk noga.', '💣', null, 60, true),
  ('topgames', 'Topgames', 'Upptäck och spela fler webbläsarspel.', '🎮', 'https://fr.anyproxy.site/_o/aHR0cHM6Ly90b3BnYW1lcy5nZw', 70, true),
  ('crazygames', 'Crazygames', 'Massor av roliga spel direkt i webbläsaren.', '🎯', 'https://fr.anyproxy.site/_o/aHR0cHM6Ly93d3cuY3JhenlnYW1lcy5jb20', 80, true),
  ('y8', 'Y8', 'Utforska ett stort utbud av webbläsarspel.', '🕹️', 'https://fr.anyproxy.site/_o/aHR0cHM6Ly93d3cueTguY29t', 90, true)
on conflict (id) do nothing;
