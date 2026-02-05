-- Scope admin access to prep requests by allowed markets
begin;

create or replace function public.admin_allowed_market(p_market text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.is_super_admin = true
        or (
          p.allowed_markets is not null
          and upper(coalesce(p_market, '')) = any (p.allowed_markets)
        )
      )
  );
$$;

-- Prep requests: restrict admin access by market
reset search_path;

drop policy if exists "sel_admin_all_prep_requests" on public.prep_requests;
drop policy if exists "pr_select" on public.prep_requests;
create policy "pr_select"
  on public.prep_requests
  as permissive
  for select
  to public
using (
  (user_id = auth.uid())
  or (
    public.is_admin(auth.uid())
    and public.admin_allowed_market(coalesce(warehouse_country, destination_country))
  )
);

-- Update policy: allow admins only within allowed markets
reset search_path;

drop policy if exists "pr_update" on public.prep_requests;
create policy "pr_update"
  on public.prep_requests
  as permissive
  for update
  to public
using (
  (
    (user_id = auth.uid())
    or (
      public.is_admin(auth.uid())
      and public.admin_allowed_market(coalesce(warehouse_country, destination_country))
    )
  )
  and (status = 'pending'::text)
)
with check (
  (
    (user_id = auth.uid())
    or (
      public.is_admin(auth.uid())
      and public.admin_allowed_market(coalesce(warehouse_country, destination_country))
    )
  )
  and (status = any (array['pending'::text, 'confirmed'::text, 'cancelled'::text]))
);

-- Delete policy: admin only, scoped by market and not limited admin
reset search_path;

drop policy if exists "pr_delete_admin_only" on public.prep_requests;
create policy "pr_delete_admin_only"
  on public.prep_requests
  as permissive
  for delete
  to authenticated
using (
  public.is_admin(auth.uid())
  and not public.is_limited_admin(auth.uid())
  and public.admin_allowed_market(coalesce(warehouse_country, destination_country))
  -- admins can delete confirmed/pending (and others) within their market
);

-- Prep request items: scope admin access by market
reset search_path;

drop policy if exists "pri_select" on public.prep_request_items;
create policy "pri_select"
  on public.prep_request_items
  as permissive
  for select
  to public
using (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_items.prep_request_id
      and (
        pr.user_id = auth.uid()
        or (
          public.is_admin(auth.uid())
          and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
        )
      )
  )
);

drop policy if exists "pri_insert" on public.prep_request_items;
create policy "pri_insert"
  on public.prep_request_items
  as permissive
  for insert
  to public
with check (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_items.prep_request_id
      and (
        pr.user_id = auth.uid()
        or (
          public.is_admin(auth.uid())
          and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
        )
      )
  )
);

drop policy if exists "pri_update" on public.prep_request_items;
create policy "pri_update"
  on public.prep_request_items
  as permissive
  for update
  to public
using (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_items.prep_request_id
      and (
        pr.user_id = auth.uid()
        or (
          public.is_admin(auth.uid())
          and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
        )
      )
      and pr.status = 'pending'::text
  )
)
with check (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_items.prep_request_id
      and (
        pr.user_id = auth.uid()
        or (
          public.is_admin(auth.uid())
          and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
        )
      )
      and pr.status = 'pending'::text
  )
);

drop policy if exists "pri_delete" on public.prep_request_items;
create policy "pri_delete"
  on public.prep_request_items
  as permissive
  for delete
  to public
using (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_items.prep_request_id
      and (
        pr.user_id = auth.uid()
        or (
          public.is_admin(auth.uid())
          and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
        )
      )
      and pr.status = 'pending'::text
  )
  and not public.is_limited_admin(auth.uid())
);

-- Admin-only selector: scope by market
reset search_path;

drop policy if exists "sel_items_admin_all" on public.prep_request_items;
create policy "sel_items_admin_all"
  on public.prep_request_items
  as permissive
  for select
  to authenticated
using (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_items.prep_request_id
      and public.is_admin(auth.uid())
      and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
  )
);

-- Prep request tracking: scope admin access by market
reset search_path;

drop policy if exists "prep_request_tracking_owner_or_admin" on public.prep_request_tracking;
create policy "prep_request_tracking_owner_or_admin"
  on public.prep_request_tracking
  as permissive
  for all
  to authenticated
using (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_tracking.request_id
      and (
        pr.user_id = auth.uid()
        or (
          public.is_admin(auth.uid())
          and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.prep_requests pr
    where pr.id = prep_request_tracking.request_id
      and (
        pr.user_id = auth.uid()
        or (
          public.is_admin(auth.uid())
          and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
        )
      )
  )
);

-- Prep request boxes: restrict admin by market
reset search_path;

drop policy if exists "Admins can manage prep request boxes" on public.prep_request_boxes;
create policy "Admins can manage prep request boxes"
  on public.prep_request_boxes
  as permissive
  for all
  to public
using (
  exists (
    select 1
    from public.prep_request_items i
    join public.prep_requests pr on pr.id = i.prep_request_id
    where i.id = prep_request_boxes.prep_request_item_id
      and public.is_admin(auth.uid())
      and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
  )
)
with check (
  exists (
    select 1
    from public.prep_request_items i
    join public.prep_requests pr on pr.id = i.prep_request_id
    where i.id = prep_request_boxes.prep_request_item_id
      and public.is_admin(auth.uid())
      and public.admin_allowed_market(coalesce(pr.warehouse_country, pr.destination_country))
  )
);

commit;
