-- Allow public read of maintenance mode and authenticated admins to write
-- This fixes 403 errors when saving mentenanța from the admin UI.

-- Select: everyone (needed for public MaintenanceGate)
create policy "Public read app settings"
on public.app_settings
for select
using (true);

-- Insert: only admins
create policy "Admins insert app settings"
on public.app_settings
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
);

-- Update: only admins
create policy "Admins update app settings"
on public.app_settings
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false) = true
  )
);
