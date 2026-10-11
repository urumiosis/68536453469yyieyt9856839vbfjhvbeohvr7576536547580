-- Persist the one-time AnyProxy onboarding acknowledgement per authenticated user.
-- Users can read/write only their own acknowledgement; this stores no proxy session ID.
create table if not exists public.user_onboarding (
  user_id uuid not null references auth.users(id) on delete cascade,
  instruction_key text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, instruction_key)
);

alter table public.user_onboarding enable row level security;

drop policy if exists "Users can read their own onboarding" on public.user_onboarding;
create policy "Users can read their own onboarding"
  on public.user_onboarding for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can record their own onboarding" on public.user_onboarding;
create policy "Users can record their own onboarding"
  on public.user_onboarding for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own onboarding" on public.user_onboarding;
create policy "Users can update their own onboarding"
  on public.user_onboarding for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_onboarding to authenticated;
