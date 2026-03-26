begin;

create table if not exists public.amazon_listing_channels (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_item_id bigint not null references public.stock_items(id) on delete cascade,
  seller_id text not null,
  marketplace_id text not null,
  fulfillment_channel text not null,
  raw_status text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, stock_item_id, seller_id, marketplace_id, fulfillment_channel)
);

create index if not exists amazon_listing_channels_company_idx
  on public.amazon_listing_channels (company_id);

create index if not exists amazon_listing_channels_stock_idx
  on public.amazon_listing_channels (stock_item_id);

create index if not exists amazon_listing_channels_market_idx
  on public.amazon_listing_channels (marketplace_id);

create index if not exists amazon_listing_channels_channel_idx
  on public.amazon_listing_channels (fulfillment_channel);

alter table public.amazon_listing_channels enable row level security;

drop policy if exists "amazon_listing_channels_select_scoped" on public.amazon_listing_channels;
create policy "amazon_listing_channels_select_scoped"
  on public.amazon_listing_channels
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    or public.e_admin()
  );

commit;
