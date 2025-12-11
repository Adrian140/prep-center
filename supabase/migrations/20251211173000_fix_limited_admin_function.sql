begin;

create or replace function public.is_limited_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','extensions'
as $$
  select coalesce((
    select is_limited_admin
    from public.profiles p
    where p.id = uid
  ), false);
$$;

commit;
