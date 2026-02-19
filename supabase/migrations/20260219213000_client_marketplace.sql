-- Anonymous client-to-client marketplace (Butic)

create table if not exists public.client_market_listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  owner_company_id uuid not null,
  country text not null default 'FR',
  asin text,
  ean text,
  product_name text not null,
  price_eur numeric(12,2) not null check (price_eur >= 0),
  quantity integer not null default 1 check (quantity >= 1),
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_market_listings_country_idx
  on public.client_market_listings (country, is_active, created_at desc);

create index if not exists client_market_listings_owner_idx
  on public.client_market_listings (owner_user_id, created_at desc);

create table if not exists public.client_market_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.client_market_listings(id) on delete cascade,
  country text not null default 'FR',
  seller_user_id uuid not null,
  buyer_user_id uuid not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint client_market_conversations_no_self check (seller_user_id <> buyer_user_id)
);

create unique index if not exists client_market_conversations_unique_idx
  on public.client_market_conversations (listing_id, seller_user_id, buyer_user_id);

create index if not exists client_market_conversations_user_idx
  on public.client_market_conversations (seller_user_id, buyer_user_id, last_message_at desc);

create table if not exists public.client_market_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.client_market_conversations(id) on delete cascade,
  sender_user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_market_messages_conv_idx
  on public.client_market_messages (conversation_id, created_at desc);

create or replace function public.client_market_touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.client_market_conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists client_market_messages_after_insert on public.client_market_messages;
create trigger client_market_messages_after_insert
after insert on public.client_market_messages
for each row execute function public.client_market_touch_conversation();

create or replace function public.client_market_get_or_create_conversation(
  p_listing_id uuid
)
returns public.client_market_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.client_market_listings;
  v_conv public.client_market_conversations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_listing
  from public.client_market_listings
  where id = p_listing_id
    and is_active = true;

  if v_listing.id is null then
    raise exception 'Listing not found';
  end if;

  if v_listing.owner_user_id = v_uid then
    raise exception 'Cannot start conversation with your own listing';
  end if;

  insert into public.client_market_conversations (
    listing_id,
    country,
    seller_user_id,
    buyer_user_id
  )
  values (
    v_listing.id,
    coalesce(v_listing.country, 'FR'),
    v_listing.owner_user_id,
    v_uid
  )
  on conflict (listing_id, seller_user_id, buyer_user_id) do update
    set country = excluded.country
  returning * into v_conv;

  return v_conv;
end;
$$;

revoke all on function public.client_market_get_or_create_conversation(uuid) from public;
grant execute on function public.client_market_get_or_create_conversation(uuid) to authenticated;
grant execute on function public.client_market_get_or_create_conversation(uuid) to service_role;

alter table public.client_market_listings enable row level security;
alter table public.client_market_conversations enable row level security;
alter table public.client_market_messages enable row level security;

drop policy if exists "client market listings select" on public.client_market_listings;
create policy "client market listings select"
  on public.client_market_listings
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "client market listings insert" on public.client_market_listings;
create policy "client market listings insert"
  on public.client_market_listings
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

drop policy if exists "client market listings update own" on public.client_market_listings;
create policy "client market listings update own"
  on public.client_market_listings
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "client market listings delete own" on public.client_market_listings;
create policy "client market listings delete own"
  on public.client_market_listings
  for delete
  to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists "client market conversations participants select" on public.client_market_conversations;
create policy "client market conversations participants select"
  on public.client_market_conversations
  for select
  to authenticated
  using (seller_user_id = auth.uid() or buyer_user_id = auth.uid());

drop policy if exists "client market conversations participants insert" on public.client_market_conversations;
create policy "client market conversations participants insert"
  on public.client_market_conversations
  for insert
  to authenticated
  with check (
    buyer_user_id = auth.uid()
    or seller_user_id = auth.uid()
  );

drop policy if exists "client market conversations participants update" on public.client_market_conversations;
create policy "client market conversations participants update"
  on public.client_market_conversations
  for update
  to authenticated
  using (seller_user_id = auth.uid() or buyer_user_id = auth.uid())
  with check (seller_user_id = auth.uid() or buyer_user_id = auth.uid());

drop policy if exists "client market messages participants select" on public.client_market_messages;
create policy "client market messages participants select"
  on public.client_market_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.client_market_conversations c
      where c.id = conversation_id
        and (c.seller_user_id = auth.uid() or c.buyer_user_id = auth.uid())
    )
  );

drop policy if exists "client market messages participants insert" on public.client_market_messages;
create policy "client market messages participants insert"
  on public.client_market_messages
  for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and exists (
      select 1
      from public.client_market_conversations c
      where c.id = conversation_id
        and (c.seller_user_id = auth.uid() or c.buyer_user_id = auth.uid())
    )
  );
