create table if not exists public.seller_links (
  seller_id text primary key,
  user_id uuid not null,
  company_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
