-- Allow multiple city rows per postal code (many countries share postal prefixes and variants).
-- Improves autocomplete quality for "postal prefix -> city list".

alter table if exists public.ups_postal_codes
  alter column city set default '';

update public.ups_postal_codes
set city = ''
where city is null;

alter table if exists public.ups_postal_codes
  alter column city set not null;

drop index if exists public.ups_postal_codes_country_postal_key;

create unique index if not exists ups_postal_codes_country_postal_city_key
  on public.ups_postal_codes(country_code, postal_code, city);

create index if not exists idx_ups_postal_codes_country_postal_prefix
  on public.ups_postal_codes(country_code, postal_code text_pattern_ops);

create index if not exists idx_ups_postal_codes_country_city_prefix
  on public.ups_postal_codes(country_code, city text_pattern_ops);

create or replace function public.touch_ups_postal_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.country_code = upper(coalesce(new.country_code, ''));
  new.postal_code = trim(coalesce(new.postal_code, ''));
  new.city = trim(coalesce(new.city, ''));
  return new;
end;
$$;

alter function public.touch_ups_postal_codes_updated_at() set search_path = public;
