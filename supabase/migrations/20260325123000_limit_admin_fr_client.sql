do $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = 'bc3ce361-b5c8-435f-a1b6-7ee9d33b3e67'
  ) then
    raise exception 'Profile bc3ce361-b5c8-435f-a1b6-7ee9d33b3e67 not found in public.profiles';
  end if;

  update public.profiles
  set
    account_type = 'admin',
    is_admin = true,
    is_limited_admin = true,
    is_super_admin = false,
    country = 'FR',
    allowed_markets = array['FR']::text[],
    status = 'active'
  where id = 'bc3ce361-b5c8-435f-a1b6-7ee9d33b3e67';
end
$$;
