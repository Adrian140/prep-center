create table if not exists public.prep_request_wizard_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid null references public.prep_requests(id) on delete set null,
  request_ref_id uuid not null,
  step_key text not null,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'client',
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_prep_request_wizard_history_request_created
  on public.prep_request_wizard_history (request_id, created_at desc);

create index if not exists idx_prep_request_wizard_history_request_ref_created
  on public.prep_request_wizard_history (request_ref_id, created_at desc);

create index if not exists idx_prep_request_wizard_history_step
  on public.prep_request_wizard_history (step_key);

alter table public.prep_request_wizard_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'Admins can read prep request wizard history'
      and polrelid = 'public.prep_request_wizard_history'::regclass
  ) then
    create policy "Admins can read prep request wizard history"
      on public.prep_request_wizard_history
      as permissive
      for select
      to authenticated
      using (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'Admins can insert prep request wizard history'
      and polrelid = 'public.prep_request_wizard_history'::regclass
  ) then
    create policy "Admins can insert prep request wizard history"
      on public.prep_request_wizard_history
      as permissive
      for insert
      to authenticated
      with check (public.is_admin());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'Users can read company prep request wizard history'
      and polrelid = 'public.prep_request_wizard_history'::regclass
  ) then
    create policy "Users can read company prep request wizard history"
      on public.prep_request_wizard_history
      as permissive
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.prep_requests pr
          join public.profiles p on p.id = auth.uid()
          where pr.id = prep_request_wizard_history.request_ref_id
            and pr.company_id = p.company_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policy
    where polname = 'Users can insert company prep request wizard history'
      and polrelid = 'public.prep_request_wizard_history'::regclass
  ) then
    create policy "Users can insert company prep request wizard history"
      on public.prep_request_wizard_history
      as permissive
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.prep_requests pr
          join public.profiles p on p.id = auth.uid()
          where pr.id = prep_request_wizard_history.request_ref_id
            and pr.company_id = p.company_id
        )
      );
  end if;
end;
$$;
