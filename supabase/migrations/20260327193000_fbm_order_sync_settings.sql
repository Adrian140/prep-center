create table if not exists public.fbm_order_sync_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete set null,
  marketplace_id text not null,
  enabled boolean not null default false,
  consent_granted_at timestamptz null,
  consent_revoked_at timestamptz null,
  consent_text_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fbm_order_sync_settings_company_market_unique unique (company_id, marketplace_id)
);

create index if not exists idx_fbm_order_sync_settings_company_enabled
  on public.fbm_order_sync_settings (company_id, enabled);

alter table public.fbm_order_sync_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'fbm_order_sync_settings' and policyname = 'fbm_order_sync_settings_company_select') then
    create policy "fbm_order_sync_settings_company_select"
      on public.fbm_order_sync_settings
      for select
      to authenticated
      using (
        company_id in (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
        or public.is_admin(auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'fbm_order_sync_settings' and policyname = 'fbm_order_sync_settings_company_write') then
    create policy "fbm_order_sync_settings_company_write"
      on public.fbm_order_sync_settings
      for all
      to authenticated
      using (
        company_id in (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
        or public.is_admin(auth.uid())
      )
      with check (
        company_id in (
          select p.company_id
          from public.profiles p
          where p.id = auth.uid()
        )
        or public.is_admin(auth.uid())
      );
  end if;
end $$;
