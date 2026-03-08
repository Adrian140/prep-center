-- Re-enable RLS on amazon_listing_presence_sync_state with strict service_role-only access
alter table public.amazon_listing_presence_sync_state enable row level security;

drop policy if exists "sync_state_service_only" on public.amazon_listing_presence_sync_state;
create policy "sync_state_service_only"
  on public.amazon_listing_presence_sync_state
  for all
  to service_role
  using (true)
  with check (true);
