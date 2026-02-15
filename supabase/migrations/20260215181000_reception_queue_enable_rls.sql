alter table public.reception_notification_queue
  enable row level security;

drop policy if exists "reception_queue_service_role_all" on public.reception_notification_queue;
create policy "reception_queue_service_role_all"
  on public.reception_notification_queue
  for all
  to service_role
  using (true)
  with check (true);
