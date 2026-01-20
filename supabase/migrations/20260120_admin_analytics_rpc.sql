-- Admin-only analytics aggregation (site traffic)
begin;

create or replace function public.get_analytics_admin(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, coalesce(p_days, 30));
  v_start timestamptz := (now() - (v_days - 1) * interval '1 day')::date;
  v_totals jsonb;
  v_by_day jsonb;
  v_top_paths jsonb;
  v_top_referrers jsonb;
begin
  -- allow only full admins (exclude limited_admin)
  if not public.e_admin() or public.is_limited_admin(auth.uid()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  with base as (
    select
      id,
      coalesce(visitor_id, user_id::text, client_id, visitor, visitorid, concat('unknown-', id)) as vid,
      coalesce(path, '/') as path,
      coalesce(nullif(trim(referrer), ''), '(direct)') as referrer,
      created_at::date as d
    from public.analytics_visits
    where created_at >= v_start
  ),
  visit_counts as (
    select vid, count(*) as c from base group by vid
  ),
  day_stats as (
    select
      d as date,
      count(*)::int as visits,
      count(distinct vid)::int as unique_visitors,
      count(distinct case when vc.c > 1 then vid end)::int as returning_visitors
    from base b
    left join visit_counts vc on vc.vid = b.vid
    group by d
  ),
  span as (
    select generate_series(v_start::date, now()::date, interval '1 day')::date as d
  )
  select jsonb_build_object(
    'totals',
      jsonb_build_object(
        'visits', (select count(*) from base),
        'uniqueVisitors', (select count(*) from visit_counts),
        'returningVisitors', (select count(*) from visit_counts where c > 1)
      ),
    'byDay',
      (select jsonb_agg(
          jsonb_build_object(
            'date', s.d,
            'visits', coalesce(ds.visits, 0),
            'uniqueVisitors', coalesce(ds.unique_visitors, 0),
            'returningVisitors', coalesce(ds.returning_visitors, 0)
          )
          order by s.d
        )
        from span s
        left join day_stats ds on ds.date = s.d
      ),
    'topPaths',
      (select jsonb_agg(jsonb_build_array(path, cnt))
         from (
           select path, count(*) as cnt
           from base
           group by path
           order by cnt desc
           limit 10
         ) t),
    'topReferrers',
      (select jsonb_agg(jsonb_build_array(referrer, cnt))
         from (
           select referrer, count(*) as cnt
           from base
           group by referrer
           order by cnt desc
           limit 10
         ) t)
  )
  into strict v_totals;

  return v_totals;
end;
$$;

revoke all on function public.get_analytics_admin(integer) from public;
grant execute on function public.get_analytics_admin(integer) to authenticated;

commit;
