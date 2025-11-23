-- 028_create_pricing_services.sql
create table if not exists public.pricing_services (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  service_name text not null,
  price text not null,
  unit text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pricing_services_category_idx on public.pricing_services(category, position);

create trigger pricing_services_updated_at
before update on public.pricing_services
for each row
execute procedure public.set_current_timestamp_updated_at();
