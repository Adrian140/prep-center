/*
  # Allow admin to read all profiles

  Ensures the admin dashboard can join client store names without RLS errors.
*/

drop policy if exists "Admins can read all profiles" on public.profiles;

create policy "Admins can read all profiles"
  on public.profiles for select
  using (is_admin());
