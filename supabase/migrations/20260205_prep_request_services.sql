create table if not exists public.prep_request_services (
  id uuid not null default gen_random_uuid(),
  request_id uuid not null references public.prep_requests(id) on delete cascade,
  prep_request_item_id uuid references public.prep_request_items(id) on delete set null,
  service_id uuid,
  service_name text not null,
  unit_price numeric(10,2) not null,
  units integer not null,
  item_type text not null default 'sku',
  created_at timestamp with time zone not null default now()
);

alter table public.prep_request_services enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prep_request_services_units_check'
      and conrelid = 'public.prep_request_services'::regclass
  ) then
    alter table public.prep_request_services
      add constraint prep_request_services_units_check check (units >= 0);
  end if;
end;
$$;

create index if not exists idx_prep_request_services_request_id
  on public.prep_request_services (request_id);

create index if not exists idx_prep_request_services_service_name
  on public.prep_request_services (service_name);

do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'Admins can manage all prep request services'
      and polrelid = 'public.prep_request_services'::regclass
  ) then
    create policy "Admins can manage all prep request services"
      on public.prep_request_services
      as permissive
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'Users can manage company prep request services'
      and polrelid = 'public.prep_request_services'::regclass
  ) then
    create policy "Users can manage company prep request services"
      on public.prep_request_services
      as permissive
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.prep_requests pr
          join public.profiles p on p.id = auth.uid()
          where pr.id = prep_request_services.request_id
            and pr.company_id = p.company_id
        )
      )
      with check (
        exists (
          select 1
          from public.prep_requests pr
          join public.profiles p on p.id = auth.uid()
          where pr.id = prep_request_services.request_id
            and pr.company_id = p.company_id
        )
      );
  end if;
end;
$$;
