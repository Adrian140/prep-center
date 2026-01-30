insert into public.profiles (
  id,
  email,
  account_type,
  is_admin,
  is_super_admin,
  country,
  allowed_markets,
  status
)
values
  (
    'ddb2f664-7e1b-4857-8e0f-9e6eb71d0a53',
    'contact-de@prep-center.eu',
    'admin',
    true,
    false,
    'DE',
    array['DE']::text[],
    'active'
  ),
  (
    '615db4d0-a3ce-4602-8498-7a62570744f6',
    'contact@prep-center.eu',
    'admin',
    true,
    true,
    'FR',
    array['FR','DE']::text[],
    'active'
  )
on conflict (id) do update set
  email = excluded.email,
  account_type = excluded.account_type,
  is_admin = excluded.is_admin,
  is_super_admin = excluded.is_super_admin,
  country = excluded.country,
  allowed_markets = excluded.allowed_markets,
  status = excluded.status;
