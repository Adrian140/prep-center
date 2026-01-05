-- Remove Packlink integration artifacts

drop table if exists public.packlink_webhooks cascade;
drop table if exists public.packlink_shipments cascade;
drop table if exists public.packlink_credentials cascade;

drop function if exists public.set_packlink_shipments_updated_at();
drop function if exists public.set_packlink_credentials_updated_at();
