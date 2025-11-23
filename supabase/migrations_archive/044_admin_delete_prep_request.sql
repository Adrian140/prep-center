-- 044_admin_delete_prep_request.sql
-- Helper function to delete prep requests (including items, boxes, tracking) with admin privileges.

create or replace function public.admin_delete_prep_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Access denied';
  end if;

  delete from prep_request_boxes
  where prep_request_item_id in (
    select id from prep_request_items where prep_request_id = p_request_id
  );

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'prep_request_tracking'
      and column_name = 'request_id'
  ) then
    delete from prep_request_tracking
    where request_id = p_request_id;
  else
    delete from prep_request_tracking
    where prep_request_id = p_request_id;
  end if;

  delete from prep_request_items
  where prep_request_id = p_request_id;

  delete from prep_requests
  where id = p_request_id;
end;
$$;

revoke all on function public.admin_delete_prep_request(uuid) from public;
grant execute on function public.admin_delete_prep_request(uuid) to authenticated;
