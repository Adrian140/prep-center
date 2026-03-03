create table if not exists public.return_service_lines (
  id bigint generated always as identity primary key,
  return_id bigint not null references public.returns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  country text not null default 'FR',
  service_date date not null default current_date,
  service text not null,
  unit_price numeric(12, 4) not null default 0,
  units numeric(12, 4) not null default 1,
  total numeric(12, 4),
  transport_tracking_id text,
  obs_admin text,
  billing_invoice_id uuid references public.billing_invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_service_lines_units_non_negative check (units >= 0)
);

create index if not exists idx_return_service_lines_company_date
  on public.return_service_lines (company_id, service_date desc);
create index if not exists idx_return_service_lines_return_id
  on public.return_service_lines (return_id);
create index if not exists idx_return_service_lines_billing_invoice_id
  on public.return_service_lines (billing_invoice_id);

alter table public.return_service_lines enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'admins manage return service lines'
      and polrelid = 'public.return_service_lines'::regclass
  ) then
    create policy "admins manage return service lines"
      on public.return_service_lines
      for all
      to public
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policy
    where polname = 'company members view return service lines'
      and polrelid = 'public.return_service_lines'::regclass
  ) then
    create policy "company members view return service lines"
      on public.return_service_lines
      for select
      to public
      using (
        company_id in (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
        or public.is_admin()
      );
  end if;
end;
$$;
