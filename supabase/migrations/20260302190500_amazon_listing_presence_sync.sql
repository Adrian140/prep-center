begin;

create table if not exists public.amazon_listing_presence (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_item_id bigint not null references public.stock_items(id) on delete cascade,
  seller_id text not null,
  marketplace_id text not null,
  exists_on_marketplace boolean not null default false,
  resolved_sku text,
  fnsku text,
  source text,
  raw_status text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, stock_item_id, seller_id, marketplace_id)
);

create index if not exists amazon_listing_presence_company_idx
  on public.amazon_listing_presence (company_id);

create index if not exists amazon_listing_presence_stock_idx
  on public.amazon_listing_presence (stock_item_id);

create index if not exists amazon_listing_presence_market_idx
  on public.amazon_listing_presence (marketplace_id);

alter table public.amazon_listing_presence enable row level security;

drop policy if exists "amazon_listing_presence_select_scoped" on public.amazon_listing_presence;
create policy "amazon_listing_presence_select_scoped"
  on public.amazon_listing_presence
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    or public.e_admin()
  );

create table if not exists public.amazon_listing_presence_sync_state (
  key text primary key,
  next_integration_index integer not null default 0,
  cycle_started_at timestamptz,
  cycle_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.amazon_listing_presence_sync_state (key, next_integration_index)
values ('default', 0)
on conflict (key) do nothing;

-- Internal worker state; keep it private.
alter table public.amazon_listing_presence_sync_state enable row level security;

commit;
