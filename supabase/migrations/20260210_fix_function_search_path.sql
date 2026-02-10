-- Fix mutable search_path warnings by setting explicit search_path for functions
alter function public.touch_prep_business_integrations_updated_at() set search_path = public;
alter function public.touch_prep_merchants_updated_at() set search_path = public;
alter function public.qogita_set_updated_at() set search_path = public;
alter function public.qogita_shipment_lines_set_updated_at() set search_path = public;
alter function public.update_prep_qty_by_country_from_receiving_log() set search_path = public;
alter function public.sync_stock_item_images() set search_path = public;
