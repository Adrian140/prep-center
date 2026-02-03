-- Secure affiliate assignments table with RLS and admin-only access

do $$
begin
  -- Enable RLS if not already enabled
  if not exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'affiliate_assignments'
      and rowsecurity = true
  ) then
    alter table public.affiliate_assignments enable row level security;
  end if;
end;
$$;

-- Admin read
do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'affiliate assignments admin select'
      and polrelid = 'public.affiliate_assignments'::regclass
  ) then
    create policy "affiliate assignments admin select"
      on public.affiliate_assignments
      as permissive
      for select
      to authenticated
    using (public.e_admin());
  end if;
end;
$$;

-- Admin write
do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'affiliate assignments admin write'
      and polrelid = 'public.affiliate_assignments'::regclass
  ) then
    create policy "affiliate assignments admin write"
      on public.affiliate_assignments
      as permissive
      for all
      to authenticated
    using (public.e_admin())
    with check (public.e_admin());
  end if;
end;
$$;

-- Service role full access
do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'affiliate assignments service role full access'
      and polrelid = 'public.affiliate_assignments'::regclass
  ) then
    create policy "affiliate assignments service role full access"
      on public.affiliate_assignments
      as permissive
      for all
      to service_role
    using (true)
    with check (true);
  end if;
end;
$$;

-- Supabase admin full access (dashboard/system tasks)
do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'affiliate assignments supabase admin full access'
      and polrelid = 'public.affiliate_assignments'::regclass
  ) then
    create policy "affiliate assignments supabase admin full access"
      on public.affiliate_assignments
      as permissive
      for all
      to supabase_admin
    using (true)
    with check (true);
  end if;
end;
$$;

-- Supabase auth admin (optional system role) full access
do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'affiliate assignments supabase auth admin full access'
      and polrelid = 'public.affiliate_assignments'::regclass
  ) then
    create policy "affiliate assignments supabase auth admin full access"
      on public.affiliate_assignments
      as permissive
      for all
      to supabase_auth_admin
    using (true)
    with check (true);
  end if;
end;
$$;
