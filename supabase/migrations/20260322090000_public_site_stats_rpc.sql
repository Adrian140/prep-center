create or replace function public.get_public_site_stats()
returns table (
  happy_clients_total integer
)
language sql
security definer
set search_path = public
as $$
  with normalized_profiles as (
    select
      lower(trim(coalesce(account_type, ''))) as account_type_norm,
      upper(trim(coalesce(country, ''))) as country_norm,
      coalesce(
        array(
          select upper(trim(value))
          from unnest(coalesce(allowed_markets, '{}'::text[])) as value
          where trim(coalesce(value, '')) <> ''
        ),
        '{}'::text[]
      ) as allowed_markets_norm
    from public.profiles
  )
  select coalesce(sum(
    case
      when account_type_norm = 'admin' then 0
      when cardinality(allowed_markets_norm) > 0 then
        (case when 'FR' = any(allowed_markets_norm) then 1 else 0 end) +
        (case when 'DE' = any(allowed_markets_norm) then 1 else 0 end)
      else
        case
          when country_norm in ('FR', 'DE') then 1
          else 0
        end
    end
  ), 0)::integer as happy_clients_total
  from normalized_profiles;
$$;

grant execute on function public.get_public_site_stats() to anon, authenticated;
