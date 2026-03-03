alter table if exists public.amazon_integrations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'admins manage amazon integrations'
      and polrelid = 'public.amazon_integrations'::regclass
  ) then
    create policy "admins manage amazon integrations"
      on public.amazon_integrations
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;
