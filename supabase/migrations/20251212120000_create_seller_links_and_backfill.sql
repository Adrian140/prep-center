create table if not exists public.seller_links (
  seller_id text primary key,
  user_id uuid not null,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.seller_links
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.seller_links
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_seller_links_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists seller_links_updated_at on public.seller_links;
create trigger seller_links_updated_at
  before update on public.seller_links
  for each row execute procedure public.touch_seller_links_updated_at();

insert into public.seller_links (seller_id, user_id, company_id)
select distinct
  coalesce(ai.selling_partner_id, ai.company_id::text, ai.user_id::text) as seller_id,
  ai.user_id,
  ai.company_id
from public.amazon_integrations ai
where coalesce(ai.selling_partner_id, ai.company_id::text, ai.user_id::text) is not null
on conflict (seller_id) do update set
  user_id = excluded.user_id,
  company_id = excluded.company_id,
  updated_at = now();

update public.seller_tokens st
set marketplace_ids = sub.marketplace_ids,
    updated_at = now()
from (
  select
    coalesce(ai.selling_partner_id, ai.company_id::text, ai.user_id::text) as seller_id,
    array_remove(array_agg(distinct ai.marketplace_id), null) as marketplace_ids
  from public.amazon_integrations ai
  group by 1
) sub
where st.seller_id = sub.seller_id
  and coalesce(sub.marketplace_ids, '{}'::text[]) <> coalesce(st.marketplace_ids, '{}'::text[]);
