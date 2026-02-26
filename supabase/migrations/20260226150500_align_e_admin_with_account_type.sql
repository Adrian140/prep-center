create or replace function public.e_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (
        coalesce(p.is_admin, false)
        or lower(coalesce(p.account_type, '')) = 'admin'
      )
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;
