-- Clear previously auto-populated store names from receiving_shipments.
begin;

do $$
declare
  has_client_store boolean;
  has_store boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'receiving_shipments'
      and column_name = 'client_store_name'
  ) into has_client_store;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'receiving_shipments'
      and column_name = 'store_name'
  ) into has_store;

  if has_client_store then
    execute 'update public.receiving_shipments set client_store_name = null where client_store_name is not null';
  end if;

  if has_store then
    execute '' ||
      'update public.receiving_shipments ' ||
      'set store_name = null ' ||
      'where store_name is not null';
  end if;
end
$$;

commit;
