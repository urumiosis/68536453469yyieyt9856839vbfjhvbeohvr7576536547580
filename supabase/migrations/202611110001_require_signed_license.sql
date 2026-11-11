-- The verify-license Edge Function reads these rows using the service role
-- after checking the authenticated account and the owner's signature.
begin;

alter table public.private_app_code enable row level security;

drop policy if exists "Private app is served by the license function" on public.private_app_code;
create policy "Private app is served by the license function"
  on public.private_app_code as restrictive for all to anon, authenticated
  using (false) with check (false);

-- Keep the existing direct catalog/content access used by site administrators.
-- Restrictive policies also apply if other permissive read policies exist.
drop policy if exists "Direct site content reads are for admins" on public.site_content;
create policy "Direct site content reads are for admins"
  on public.site_content as restrictive for select to anon, authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Direct catalog reads are for admins" on public.game_catalog;
create policy "Direct catalog reads are for admins"
  on public.game_catalog as restrictive for select to anon, authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

commit;
