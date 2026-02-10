-- Sync missing stock item images from asin_assets every 6 hours

create extension if not exists pg_cron;

create or replace function public.sync_stock_item_images()
returns void
language sql
as $$
  update public.stock_items si
  set image_url = aa.image_urls->>0
  from public.asin_assets aa
  where si.asin = aa.asin
    and (si.image_url is null or btrim(si.image_url) = '')
    and jsonb_typeof(aa.image_urls) = 'array'
    and jsonb_array_length(aa.image_urls) > 0;
$$;

do $$
declare
  v_jobid int;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'sync_stock_item_images';

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'sync_stock_item_images',
    '0 */6 * * *',
    $$select public.sync_stock_item_images();$$
  );
end $$;
