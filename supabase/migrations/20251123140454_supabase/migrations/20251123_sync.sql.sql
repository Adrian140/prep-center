create type "public"."return_type_enum" as enum ('Sealed', 'Unsealed', 'Destroyed', 'Reintroduced');

create sequence "public"."analytics_visits_id_seq";

create sequence "public"."company_code_seq";

create sequence "public"."fba_lines_id_seq";

create sequence "public"."fbm_lines_id_seq";

create sequence "public"."returns_id_seq";

create sequence "public"."stock_items_id_seq";

create sequence "public"."visit_events_id_seq";


  create table "public"."admins" (
    "user_id" uuid not null
      );


alter table "public"."admins" enable row level security;


  create table "public"."affiliate_codes" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "code" text not null,
    "label" text not null,
    "description" text,
    "discount_percent" numeric(5,2),
    "active" boolean not null default true,
    "owner_profile_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "payout_type" text not null default 'percentage'::text,
    "percent_below_threshold" numeric(5,2),
    "percent_above_threshold" numeric(5,2),
    "threshold_amount" numeric(10,2),
    "fixed_amount" numeric(10,2),
    "payout_tiers" jsonb not null default '[]'::jsonb
      );


alter table "public"."affiliate_codes" enable row level security;


  create table "public"."affiliate_requests" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "profile_id" uuid not null,
    "preferred_code" text,
    "notes" text,
    "status" text not null default 'pending'::text,
    "admin_note" text,
    "affiliate_code_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."affiliate_requests" enable row level security;


  create table "public"."amazon_integrations" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "company_id" uuid,
    "marketplace_id" text not null,
    "refresh_token" text not null,
    "region" text not null default 'eu'::text,
    "status" text not null default 'active'::text,
    "created_at" timestamp with time zone default now(),
    "last_synced_at" timestamp with time zone default now(),
    "last_error" text
      );


alter table "public"."amazon_integrations" enable row level security;


  create table "public"."amazon_sales_30d" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid,
    "user_id" uuid,
    "asin" text,
    "sku" text,
    "country" text,
    "total_units" integer default 0,
    "pending_units" integer default 0,
    "shipped_units" integer default 0,
    "payment_units" integer default 0,
    "refund_units" integer default 0,
    "refreshed_at" timestamp with time zone default now()
      );


alter table "public"."amazon_sales_30d" enable row level security;


  create table "public"."amazon_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "access_token" text not null,
    "expires_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."amazon_tokens" enable row level security;


  create table "public"."analytics_visits" (
    "id" bigint not null default nextval('public.analytics_visits_id_seq'::regclass),
    "user_id" uuid,
    "company_id" uuid,
    "path" text not null,
    "referrer" text,
    "user_agent" text,
    "ip" inet,
    "country" text,
    "created_at" timestamp with time zone not null default now(),
    "visitor_id" text,
    "locale" text
      );


alter table "public"."analytics_visits" enable row level security;


  create table "public"."app_settings" (
    "key" text not null,
    "value" jsonb,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."app_settings" enable row level security;


  create table "public"."billing_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "type" text not null default 'individual'::text,
    "first_name" text,
    "last_name" text,
    "company_name" text,
    "cui" text,
    "vat_number" text,
    "country" text not null,
    "address" text not null,
    "city" text not null,
    "postal_code" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "is_default" boolean not null default false,
    "phone" text,
    "siren_siret" text
      );


alter table "public"."billing_profiles" enable row level security;


  create table "public"."carriers" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "code" text not null,
    "active" boolean default true,
    "sort_order" integer default 0
      );


alter table "public"."carriers" enable row level security;


  create table "public"."companies" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "code" text not null default ('CMP-'::text || lpad((nextval('public.company_code_seq'::regclass))::text, 6, '0'::text)),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."companies" enable row level security;


  create table "public"."company_deals" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "company_id" uuid not null,
    "title" text not null,
    "amount" numeric(12,2) not null default 0,
    "currency" text not null default 'EUR'::text,
    "active" boolean not null default true,
    "created_at" timestamp with time zone default now(),
    "user_id" uuid
      );


alter table "public"."company_deals" enable row level security;


  create table "public"."content" (
    "id" uuid not null default gen_random_uuid(),
    "hero_title" text,
    "hero_subtitle" text,
    "standard_fba_title" text,
    "standard_fba_subtitle" text,
    "fnsku_labeling_title" text,
    "private_label_title" text,
    "private_label_subtitle" text,
    "storage_title" text,
    "storage_subtitle" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "services_title" text,
    "services_subtitle" text,
    "bonus_title" text,
    "bonus_subtitle1" text,
    "bonus_subtitle2" text,
    "fba_reception" text,
    "fba_polybagging" text,
    "fba_labeling" text,
    "fba_dunnage" text,
    "fba_rate_label" text,
    "fba_unit_label" text,
    "fba_new_customer_label" text,
    "pl_partnership_title" text,
    "pl_packaging_label" text,
    "pl_packaging_value" text,
    "pl_sourcing_label" text,
    "pl_sourcing_value" text,
    "pl_compliance_label" text,
    "pl_compliance_value" text,
    "fbm_title" text,
    "fbm_amazon_label" text,
    "fbm_amazon_value" text,
    "fbm_ebay_label" text,
    "fbm_ebay_value" text,
    "fbm_shopify_label" text,
    "fbm_shopify_value" text,
    "fbm_shipping_title" text,
    "fbm_shipping_subtitle" text,
    "fbm_starter_tier" text,
    "fbm_growth_tier" text,
    "fbm_enterprise_tier" text,
    "fbm_order_unit" text,
    "fbm_charges_title" text,
    "fbm_charge1" text,
    "fbm_charge2" text,
    "transport_title" text,
    "transport_subtitle" text,
    "transport_fr_label" text,
    "transport_fr_value" text,
    "transport_fr_via" text,
    "transport_int_label" text,
    "transport_int_value" text,
    "transport_indicative" text,
    "transport_special_title" text,
    "transport_special_label" text,
    "transport_special_value" text,
    "transport_special_via" text,
    "storage_warehouse_title" text,
    "storage_pallet_label" text,
    "storage_pickpack_label" text,
    "storage_pickpack_value" text,
    "storage_special_title" text,
    "storage_climate_label" text,
    "storage_hazardous_label" text,
    "storage_hazardous_value" text,
    "storage_highvalue_label" text,
    "storage_highvalue_value" text,
    "calculator_title" text,
    "calculator_subtitle" text,
    "calculator_units_label" text,
    "calculator_fbm_label" text,
    "calculator_pallets_label" text,
    "calculator_select_label" text,
    "calculator_service1" text,
    "calculator_service2" text,
    "calculator_service3" text,
    "calculator_total_label" text,
    "calculator_button_text" text,
    "company_info_name" text,
    "company_info_siret" text,
    "company_info_vat" text,
    "warehouse_name" text,
    "warehouse_address" text,
    "warehouse_phone" text,
    "warehouse_email" text,
    "contact_email" text,
    "contact_phone" text,
    "contact_address" text
      );


alter table "public"."content" enable row level security;


  create table "public"."export_files" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "export_type" text not null,
    "period_start" date,
    "period_end" date,
    "file_path" text,
    "rows_count" integer,
    "totals_json" jsonb,
    "status" text not null default 'ready'::text,
    "created_at" timestamp with time zone not null default now(),
    "user_id" uuid
      );


alter table "public"."export_files" enable row level security;


  create table "public"."fba_lines" (
    "id" bigint not null default nextval('public.fba_lines_id_seq'::regclass),
    "company_id" uuid not null,
    "service" text not null,
    "service_date" date not null,
    "unit_price" numeric(10,2) not null,
    "units" integer not null,
    "total" numeric(12,2) generated always as ((unit_price * (units)::numeric)) stored,
    "obs_client" text,
    "obs_admin" text,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "obs_client_seen" boolean not null default true,
    "is_paid" boolean not null default false,
    "paid_at" timestamp without time zone,
    "user_id" uuid
      );


alter table "public"."fba_lines" enable row level security;


  create table "public"."fbm_lines" (
    "id" bigint not null default nextval('public.fbm_lines_id_seq'::regclass),
    "company_id" uuid not null,
    "service" text not null,
    "service_date" date not null,
    "unit_price" numeric(10,2) not null,
    "orders_units" integer not null,
    "total" numeric(12,2) generated always as ((unit_price * (orders_units)::numeric)) stored,
    "obs_client" text,
    "obs_admin" text,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "obs_client_seen" boolean not null default true,
    "user_id" uuid
      );


alter table "public"."fbm_lines" enable row level security;


  create table "public"."fbm_shipping_rates" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "category" text not null,
    "region" text not null,
    "provider" text not null,
    "rates" jsonb not null default '{}'::jsonb,
    "info" text,
    "color" text,
    "position" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."fbm_shipping_rates" enable row level security;


  create table "public"."invitations" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "email" text not null,
    "token" text not null,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."invitations" enable row level security;


  create table "public"."invoices" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "company_id" uuid,
    "invoice_number" text not null,
    "amount" numeric(12,2) not null,
    "vat_amount" numeric(12,2),
    "description" text,
    "issue_date" date not null,
    "due_date" date,
    "status" text not null default 'pending'::text,
    "file_path" text not null,
    "file_url" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."invoices" enable row level security;


  create table "public"."other_lines" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "service" text not null,
    "service_date" date not null default CURRENT_DATE,
    "unit_price" numeric(10,2) not null default 0,
    "units" numeric(12,2) not null default 0,
    "total" numeric(12,2),
    "obs_admin" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."other_lines" enable row level security;


  create table "public"."payment_requests" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "amount" numeric(12,2) not null,
    "paid_at" date not null default (now())::date,
    "note" text,
    "status" text not null default 'pending'::text,
    "receipt_path" text,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."payment_requests" enable row level security;


  create table "public"."prep_request_audit" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "admin_id" uuid,
    "action" text not null,
    "payload" jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."prep_request_audit" enable row level security;


  create table "public"."prep_request_boxes" (
    "id" uuid not null default gen_random_uuid(),
    "prep_request_item_id" uuid,
    "box_number" integer not null,
    "units" integer not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "weight_kg" numeric(8,2),
    "length_cm" numeric(8,2),
    "width_cm" numeric(8,2),
    "height_cm" numeric(8,2)
      );


alter table "public"."prep_request_boxes" enable row level security;


  create table "public"."prep_request_items" (
    "id" uuid not null default gen_random_uuid(),
    "prep_request_id" uuid not null,
    "stock_item_id" bigint,
    "asin" text,
    "sku" text,
    "units_requested" integer not null,
    "units_sent" integer,
    "units_removed" integer,
    "obs_admin" text,
    "ean" text,
    "product_name" text
      );


alter table "public"."prep_request_items" enable row level security;


  create table "public"."prep_request_tracking" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "tracking_id" text not null,
    "added_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."prep_request_tracking" enable row level security;


  create table "public"."prep_requests" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "company_id" uuid,
    "destination_country" text not null,
    "status" text not null default 'pending'::text,
    "fba_shipment_id" text,
    "created_at" timestamp with time zone not null default now(),
    "confirmed_at" timestamp with time zone,
    "confirmed_by" uuid,
    "obs_admin" text
      );


alter table "public"."prep_requests" enable row level security;


  create table "public"."pricing" (
    "id" uuid not null default gen_random_uuid(),
    "standard_rate" text,
    "new_customer_rate" text,
    "starter_price" text,
    "growth_price" text,
    "enterprise_price" text,
    "pallet_storage_price" text,
    "climate_controlled_price" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "pl_fnsku_labeling" text,
    "pl_polybagging" text,
    "pl_multipack" text,
    "fbm_amazon" text,
    "fbm_ebay" text,
    "fbm_shopify" text,
    "labels_client" text,
    "labels_translation" text
      );


alter table "public"."pricing" enable row level security;


  create table "public"."pricing_services" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "category" text not null,
    "service_name" text not null,
    "price" text not null,
    "unit" text not null,
    "position" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."pricing_services" enable row level security;


  create table "public"."product_images" (
    "id" uuid not null default gen_random_uuid(),
    "stock_item_id" bigint not null,
    "storage_path" text not null,
    "uploaded_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."product_images" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "updated_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "first_name" text,
    "last_name" text,
    "account_type" text not null default 'individual'::text,
    "company_name" text,
    "cui" text,
    "vat_number" text,
    "company_address" text,
    "company_city" text,
    "company_postal_code" text,
    "phone" text,
    "country" text,
    "language" text,
    "company_id" uuid,
    "status" text not null default 'active'::text,
    "email" text,
    "is_admin" boolean default false,
    "current_balance" numeric not null default 0,
    "store_name" text,
    "affiliate_code_input" text,
    "affiliate_code_id" uuid,
    "affiliate_notes" text
      );


alter table "public"."profiles" enable row level security;


  create table "public"."profiles_backup_20251031" (
    "id" uuid,
    "updated_at" timestamp with time zone,
    "created_at" timestamp with time zone,
    "first_name" text,
    "last_name" text,
    "account_type" text,
    "company_name" text,
    "cui" text,
    "vat_number" text,
    "company_address" text,
    "company_city" text,
    "company_postal_code" text,
    "phone" text,
    "country" text,
    "language" text,
    "company_id" uuid,
    "status" text,
    "email" text,
    "is_admin" boolean,
    "current_balance" numeric,
    "store_name" text
      );


alter table "public"."profiles_backup_20251031" enable row level security;


  create table "public"."receiving_items" (
    "id" uuid not null default gen_random_uuid(),
    "shipment_id" uuid,
    "ean_asin" text not null,
    "product_name" text not null,
    "quantity_received" integer not null,
    "sku" text,
    "purchase_price" numeric(10,2),
    "quantity_to_stock" integer default 0,
    "remaining_quantity" integer generated always as ((quantity_received - quantity_to_stock)) stored,
    "remaining_action" text,
    "line_number" integer not null,
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "send_to_fba" boolean not null default false,
    "fba_qty" integer,
    "is_received" boolean not null default false,
    "received_at" timestamp with time zone,
    "received_by" uuid,
    "stock_item_id" bigint,
    "received_units" integer not null default 0
      );


alter table "public"."receiving_items" enable row level security;


  create table "public"."receiving_shipment_items" (
    "id" uuid not null default gen_random_uuid(),
    "shipment_id" uuid,
    "stock_item_id" bigint,
    "ean" text,
    "product_name" text,
    "asin" text,
    "sku" text,
    "units_requested" integer,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."receiving_shipment_items" enable row level security;


  create table "public"."receiving_shipments" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid,
    "user_id" uuid,
    "carrier" text,
    "carrier_other" text,
    "tracking_id" text,
    "notes" text,
    "status" text not null default 'draft'::text,
    "file_path" text,
    "created_at" timestamp with time zone default now(),
    "submitted_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "created_by" uuid,
    "received_by" uuid,
    "processed_by" uuid,
    "items" jsonb,
    "client_store_name" text,
    "fba_mode" text not null default 'none'::text,
    "tracking_ids" text[],
    "fba_shipment_ids" text[],
    "destination_country" text default 'FR'::text
      );


alter table "public"."receiving_shipments" enable row level security;


  create table "public"."receiving_to_stock_log" (
    "id" uuid not null default gen_random_uuid(),
    "receiving_item_id" uuid,
    "stock_item_id" bigint,
    "quantity_moved" integer not null,
    "moved_at" timestamp with time zone default now(),
    "moved_by" uuid,
    "notes" text
      );


alter table "public"."receiving_to_stock_log" enable row level security;


  create table "public"."returns" (
    "id" bigint not null default nextval('public.returns_id_seq'::regclass),
    "company_id" uuid not null,
    "return_date" date not null,
    "qty" integer not null,
    "return_type" text,
    "status" text not null default 'Sigilat'::text,
    "notes" text,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "obs_admin" text,
    "obs_client" text,
    "obs_client_seen" boolean not null default true,
    "status_note" text,
    "asin" text not null,
    "user_id" uuid
      );


alter table "public"."returns" enable row level security;


  create table "public"."reviews" (
    "id" uuid not null default gen_random_uuid(),
    "reviewer_name" text not null,
    "rating" integer not null,
    "review_text" text not null,
    "review_link" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."reviews" enable row level security;


  create table "public"."seller_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "seller_id" text not null,
    "refresh_token" text not null,
    "access_token" text,
    "access_token_expires_at" timestamp with time zone,
    "marketplace_ids" text[] default '{}'::text[],
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."seller_tokens" enable row level security;


  create table "public"."services" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "description" text,
    "features" text[],
    "price" text,
    "unit" text,
    "category" text,
    "active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."services" enable row level security;


  create table "public"."site_visits" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone default now(),
    "user_id" text,
    "path" text not null,
    "referrer" text,
    "locale" text,
    "country" text,
    "city" text
      );


alter table "public"."site_visits" enable row level security;


  create table "public"."stock_items" (
    "id" bigint not null default nextval('public.stock_items_id_seq'::regclass),
    "company_id" uuid not null,
    "asin" text,
    "qty" integer not null default 0,
    "ean" text,
    "purchase_price" numeric(10,2),
    "created_at" timestamp with time zone not null default now(),
    "name" text,
    "user_id" uuid,
    "sku" text,
    "amazon_stock" integer default 0,
    "amazon_inbound" integer not null default 0,
    "amazon_unfulfillable" integer not null default 0,
    "amazon_reserved" integer not null default 0
      );


alter table "public"."stock_items" enable row level security;


  create table "public"."sync_status" (
    "id" uuid not null default gen_random_uuid(),
    "domain" text not null,
    "last_ok" timestamp with time zone,
    "last_error" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."sync_status" enable row level security;


  create table "public"."user_guides" (
    "section" text not null,
    "video_url" text,
    "video_path" text,
    "source_type" text not null default 'youtube'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."user_guides" enable row level security;


  create table "public"."visit_events" (
    "id" bigint not null default nextval('public.visit_events_id_seq'::regclass),
    "ts" timestamp with time zone not null default now(),
    "path" text,
    "referrer" text,
    "user_agent" text,
    "country" text,
    "ip_hash" text,
    "session_id" uuid,
    "user_id" uuid
      );


alter table "public"."visit_events" enable row level security;

alter sequence "public"."analytics_visits_id_seq" owned by "public"."analytics_visits"."id";

alter sequence "public"."fba_lines_id_seq" owned by "public"."fba_lines"."id";

alter sequence "public"."fbm_lines_id_seq" owned by "public"."fbm_lines"."id";

alter sequence "public"."returns_id_seq" owned by "public"."returns"."id";

alter sequence "public"."stock_items_id_seq" owned by "public"."stock_items"."id";

alter sequence "public"."visit_events_id_seq" owned by "public"."visit_events"."id";

CREATE UNIQUE INDEX admins_pkey ON public.admins USING btree (user_id);

CREATE UNIQUE INDEX affiliate_codes_code_key ON public.affiliate_codes USING btree (code);

CREATE UNIQUE INDEX affiliate_codes_pkey ON public.affiliate_codes USING btree (id);

CREATE UNIQUE INDEX affiliate_requests_pkey ON public.affiliate_requests USING btree (id);

CREATE UNIQUE INDEX amazon_integrations_pkey ON public.amazon_integrations USING btree (id);

CREATE UNIQUE INDEX amazon_sales_30d_pkey ON public.amazon_sales_30d USING btree (id);

CREATE UNIQUE INDEX amazon_tokens_pkey ON public.amazon_tokens USING btree (id);

CREATE UNIQUE INDEX analytics_visits_pkey ON public.analytics_visits USING btree (id);

CREATE INDEX analytics_visits_visitor_id_idx ON public.analytics_visits USING btree (visitor_id);

CREATE UNIQUE INDEX app_settings_pkey ON public.app_settings USING btree (key);

CREATE UNIQUE INDEX billing_profiles_one_default_per_user ON public.billing_profiles USING btree (user_id) WHERE is_default;

CREATE UNIQUE INDEX billing_profiles_pkey ON public.billing_profiles USING btree (id);

CREATE UNIQUE INDEX carriers_code_key ON public.carriers USING btree (code);

CREATE UNIQUE INDEX carriers_name_key ON public.carriers USING btree (name);

CREATE UNIQUE INDEX carriers_pkey ON public.carriers USING btree (id);

CREATE UNIQUE INDEX companies_code_key ON public.companies USING btree (code);

CREATE UNIQUE INDEX companies_pkey ON public.companies USING btree (id);

CREATE INDEX company_deals_company_id_idx ON public.company_deals USING btree (company_id);

CREATE UNIQUE INDEX company_deals_pkey ON public.company_deals USING btree (id);

CREATE UNIQUE INDEX content_pkey ON public.content USING btree (id);

CREATE INDEX export_files_company_type_end_idx ON public.export_files USING btree (company_id, export_type, period_end DESC);

CREATE UNIQUE INDEX export_files_pkey ON public.export_files USING btree (id);

CREATE UNIQUE INDEX fba_lines_pkey ON public.fba_lines USING btree (id);

CREATE UNIQUE INDEX fbm_lines_pkey ON public.fbm_lines USING btree (id);

CREATE UNIQUE INDEX fbm_shipping_rates_pkey ON public.fbm_shipping_rates USING btree (id);

CREATE UNIQUE INDEX fbm_shipping_rates_unique_provider ON public.fbm_shipping_rates USING btree (category, region, provider);

CREATE INDEX idx_amazon_tokens_expires_at ON public.amazon_tokens USING btree (expires_at DESC);

CREATE INDEX idx_analytics_visits_created_at ON public.analytics_visits USING btree (created_at);

CREATE INDEX idx_analytics_visits_path ON public.analytics_visits USING btree (path);

CREATE INDEX idx_analytics_visits_referrer ON public.analytics_visits USING btree (referrer);

CREATE INDEX idx_companies_created_at ON public.companies USING btree (created_at);

CREATE INDEX idx_export_files_company_id ON public.export_files USING btree (company_id);

CREATE INDEX idx_export_files_status ON public.export_files USING btree (status);

CREATE INDEX idx_export_files_type_period ON public.export_files USING btree (export_type, period_end);

CREATE INDEX idx_fba_company_date ON public.fba_lines USING btree (company_id, service_date);

CREATE INDEX idx_fbm_company_date ON public.fbm_lines USING btree (company_id, service_date);

CREATE INDEX idx_payment_requests_status ON public.payment_requests USING btree (status);

CREATE INDEX idx_payment_requests_user ON public.payment_requests USING btree (user_id);

CREATE INDEX idx_prep_items_request ON public.prep_request_items USING btree (prep_request_id);

CREATE INDEX idx_prep_requests_company ON public.prep_requests USING btree (company_id);

CREATE INDEX idx_prep_requests_created ON public.prep_requests USING btree (created_at DESC);

CREATE INDEX idx_prep_requests_status ON public.prep_requests USING btree (status);

CREATE INDEX idx_prep_requests_user ON public.prep_requests USING btree (user_id);

CREATE INDEX idx_prep_tracking_request ON public.prep_request_tracking USING btree (request_id);

CREATE INDEX idx_profiles_company ON public.profiles USING btree (company_id);

CREATE INDEX idx_receiving_items_ean_asin ON public.receiving_items USING btree (ean_asin);

CREATE INDEX idx_receiving_items_is_received ON public.receiving_items USING btree (shipment_id, is_received);

CREATE INDEX idx_receiving_items_shipment_id ON public.receiving_items USING btree (shipment_id);

CREATE INDEX idx_receiving_items_stock_item_id ON public.receiving_items USING btree (stock_item_id);

CREATE INDEX idx_receiving_shipments_company_id ON public.receiving_shipments USING btree (company_id);

CREATE INDEX idx_receiving_shipments_created_at ON public.receiving_shipments USING btree (created_at);

CREATE INDEX idx_receiving_shipments_status ON public.receiving_shipments USING btree (status);

CREATE INDEX idx_receiving_to_stock_log_receiving_item_id ON public.receiving_to_stock_log USING btree (receiving_item_id);

CREATE INDEX idx_returns_company_date ON public.returns USING btree (company_id, return_date);

CREATE INDEX idx_site_visits_created_at ON public.site_visits USING btree (created_at DESC);

CREATE INDEX idx_site_visits_path ON public.site_visits USING btree (path);

CREATE INDEX idx_site_visits_referrer ON public.site_visits USING btree (referrer);

CREATE INDEX idx_stock_company_asin ON public.stock_items USING btree (company_id, asin);

CREATE INDEX invitations_email_idx ON public.invitations USING btree (lower(email));

CREATE UNIQUE INDEX invitations_pkey ON public.invitations USING btree (id);

CREATE UNIQUE INDEX invitations_token_key ON public.invitations USING btree (token);

CREATE INDEX invoices_issue_date_idx ON public.invoices USING btree (issue_date);

CREATE UNIQUE INDEX invoices_pkey ON public.invoices USING btree (id);

CREATE UNIQUE INDEX invoices_unique_per_user ON public.invoices USING btree (user_id, invoice_number);

CREATE INDEX invoices_user_id_idx ON public.invoices USING btree (user_id);

CREATE INDEX other_lines_company_idx ON public.other_lines USING btree (company_id, service_date DESC);

CREATE UNIQUE INDEX other_lines_pkey ON public.other_lines USING btree (id);

CREATE UNIQUE INDEX payment_requests_pkey ON public.payment_requests USING btree (id);

CREATE UNIQUE INDEX prep_request_audit_pkey ON public.prep_request_audit USING btree (id);

CREATE UNIQUE INDEX prep_request_boxes_item_box_idx ON public.prep_request_boxes USING btree (prep_request_item_id, box_number);

CREATE UNIQUE INDEX prep_request_boxes_pkey ON public.prep_request_boxes USING btree (id);

CREATE UNIQUE INDEX prep_request_items_pkey ON public.prep_request_items USING btree (id);

CREATE UNIQUE INDEX prep_request_tracking_pkey ON public.prep_request_tracking USING btree (id);

CREATE UNIQUE INDEX prep_requests_pkey ON public.prep_requests USING btree (id);

CREATE UNIQUE INDEX pricing_pkey ON public.pricing USING btree (id);

CREATE INDEX pricing_services_category_idx ON public.pricing_services USING btree (category, "position");

CREATE UNIQUE INDEX pricing_services_pkey ON public.pricing_services USING btree (id);

CREATE UNIQUE INDEX product_images_pkey ON public.product_images USING btree (id);

CREATE INDEX product_images_stock_idx ON public.product_images USING btree (stock_item_id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX receiving_items_pkey ON public.receiving_items USING btree (id);

CREATE UNIQUE INDEX receiving_shipment_items_pkey ON public.receiving_shipment_items USING btree (id);

CREATE INDEX receiving_shipment_items_shipment_id_idx ON public.receiving_shipment_items USING btree (shipment_id);

CREATE UNIQUE INDEX receiving_shipments_pkey ON public.receiving_shipments USING btree (id);

CREATE UNIQUE INDEX receiving_to_stock_log_pkey ON public.receiving_to_stock_log USING btree (id);

CREATE UNIQUE INDEX returns_pkey ON public.returns USING btree (id);

CREATE UNIQUE INDEX reviews_pkey ON public.reviews USING btree (id);

CREATE UNIQUE INDEX seller_tokens_pkey ON public.seller_tokens USING btree (id);

CREATE UNIQUE INDEX seller_tokens_seller_id_key ON public.seller_tokens USING btree (seller_id);

CREATE UNIQUE INDEX services_pkey ON public.services USING btree (id);

CREATE UNIQUE INDEX site_visits_pkey ON public.site_visits USING btree (id);

CREATE UNIQUE INDEX stock_items_pkey ON public.stock_items USING btree (id);

CREATE UNIQUE INDEX sync_status_pkey ON public.sync_status USING btree (id);

CREATE UNIQUE INDEX user_guides_pkey ON public.user_guides USING btree (section);

CREATE INDEX visit_events_country_idx ON public.visit_events USING btree (country);

CREATE INDEX visit_events_path_idx ON public.visit_events USING btree (path);

CREATE UNIQUE INDEX visit_events_pkey ON public.visit_events USING btree (id);

CREATE INDEX visit_events_ts_idx ON public.visit_events USING btree (ts DESC);

alter table "public"."admins" add constraint "admins_pkey" PRIMARY KEY using index "admins_pkey";

alter table "public"."affiliate_codes" add constraint "affiliate_codes_pkey" PRIMARY KEY using index "affiliate_codes_pkey";

alter table "public"."affiliate_requests" add constraint "affiliate_requests_pkey" PRIMARY KEY using index "affiliate_requests_pkey";

alter table "public"."amazon_integrations" add constraint "amazon_integrations_pkey" PRIMARY KEY using index "amazon_integrations_pkey";

alter table "public"."amazon_sales_30d" add constraint "amazon_sales_30d_pkey" PRIMARY KEY using index "amazon_sales_30d_pkey";

alter table "public"."amazon_tokens" add constraint "amazon_tokens_pkey" PRIMARY KEY using index "amazon_tokens_pkey";

alter table "public"."analytics_visits" add constraint "analytics_visits_pkey" PRIMARY KEY using index "analytics_visits_pkey";

alter table "public"."app_settings" add constraint "app_settings_pkey" PRIMARY KEY using index "app_settings_pkey";

alter table "public"."billing_profiles" add constraint "billing_profiles_pkey" PRIMARY KEY using index "billing_profiles_pkey";

alter table "public"."carriers" add constraint "carriers_pkey" PRIMARY KEY using index "carriers_pkey";

alter table "public"."companies" add constraint "companies_pkey" PRIMARY KEY using index "companies_pkey";

alter table "public"."company_deals" add constraint "company_deals_pkey" PRIMARY KEY using index "company_deals_pkey";

alter table "public"."content" add constraint "content_pkey" PRIMARY KEY using index "content_pkey";

alter table "public"."export_files" add constraint "export_files_pkey" PRIMARY KEY using index "export_files_pkey";

alter table "public"."fba_lines" add constraint "fba_lines_pkey" PRIMARY KEY using index "fba_lines_pkey";

alter table "public"."fbm_lines" add constraint "fbm_lines_pkey" PRIMARY KEY using index "fbm_lines_pkey";

alter table "public"."fbm_shipping_rates" add constraint "fbm_shipping_rates_pkey" PRIMARY KEY using index "fbm_shipping_rates_pkey";

alter table "public"."invitations" add constraint "invitations_pkey" PRIMARY KEY using index "invitations_pkey";

alter table "public"."invoices" add constraint "invoices_pkey" PRIMARY KEY using index "invoices_pkey";

alter table "public"."other_lines" add constraint "other_lines_pkey" PRIMARY KEY using index "other_lines_pkey";

alter table "public"."payment_requests" add constraint "payment_requests_pkey" PRIMARY KEY using index "payment_requests_pkey";

alter table "public"."prep_request_audit" add constraint "prep_request_audit_pkey" PRIMARY KEY using index "prep_request_audit_pkey";

alter table "public"."prep_request_boxes" add constraint "prep_request_boxes_pkey" PRIMARY KEY using index "prep_request_boxes_pkey";

alter table "public"."prep_request_items" add constraint "prep_request_items_pkey" PRIMARY KEY using index "prep_request_items_pkey";

alter table "public"."prep_request_tracking" add constraint "prep_request_tracking_pkey" PRIMARY KEY using index "prep_request_tracking_pkey";

alter table "public"."prep_requests" add constraint "prep_requests_pkey" PRIMARY KEY using index "prep_requests_pkey";

alter table "public"."pricing" add constraint "pricing_pkey" PRIMARY KEY using index "pricing_pkey";

alter table "public"."pricing_services" add constraint "pricing_services_pkey" PRIMARY KEY using index "pricing_services_pkey";

alter table "public"."product_images" add constraint "product_images_pkey" PRIMARY KEY using index "product_images_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."receiving_items" add constraint "receiving_items_pkey" PRIMARY KEY using index "receiving_items_pkey";

alter table "public"."receiving_shipment_items" add constraint "receiving_shipment_items_pkey" PRIMARY KEY using index "receiving_shipment_items_pkey";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_pkey" PRIMARY KEY using index "receiving_shipments_pkey";

alter table "public"."receiving_to_stock_log" add constraint "receiving_to_stock_log_pkey" PRIMARY KEY using index "receiving_to_stock_log_pkey";

alter table "public"."returns" add constraint "returns_pkey" PRIMARY KEY using index "returns_pkey";

alter table "public"."reviews" add constraint "reviews_pkey" PRIMARY KEY using index "reviews_pkey";

alter table "public"."seller_tokens" add constraint "seller_tokens_pkey" PRIMARY KEY using index "seller_tokens_pkey";

alter table "public"."services" add constraint "services_pkey" PRIMARY KEY using index "services_pkey";

alter table "public"."site_visits" add constraint "site_visits_pkey" PRIMARY KEY using index "site_visits_pkey";

alter table "public"."stock_items" add constraint "stock_items_pkey" PRIMARY KEY using index "stock_items_pkey";

alter table "public"."sync_status" add constraint "sync_status_pkey" PRIMARY KEY using index "sync_status_pkey";

alter table "public"."user_guides" add constraint "user_guides_pkey" PRIMARY KEY using index "user_guides_pkey";

alter table "public"."visit_events" add constraint "visit_events_pkey" PRIMARY KEY using index "visit_events_pkey";

alter table "public"."admins" add constraint "admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."admins" validate constraint "admins_user_id_fkey";

alter table "public"."affiliate_codes" add constraint "affiliate_codes_code_key" UNIQUE using index "affiliate_codes_code_key";

alter table "public"."affiliate_codes" add constraint "affiliate_codes_owner_profile_id_fkey" FOREIGN KEY (owner_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."affiliate_codes" validate constraint "affiliate_codes_owner_profile_id_fkey";

alter table "public"."affiliate_requests" add constraint "affiliate_requests_affiliate_code_id_fkey" FOREIGN KEY (affiliate_code_id) REFERENCES public.affiliate_codes(id) ON DELETE SET NULL not valid;

alter table "public"."affiliate_requests" validate constraint "affiliate_requests_affiliate_code_id_fkey";

alter table "public"."affiliate_requests" add constraint "affiliate_requests_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."affiliate_requests" validate constraint "affiliate_requests_profile_id_fkey";

alter table "public"."amazon_integrations" add constraint "amazon_integrations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."amazon_integrations" validate constraint "amazon_integrations_company_id_fkey";

alter table "public"."amazon_integrations" add constraint "amazon_integrations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."amazon_integrations" validate constraint "amazon_integrations_user_id_fkey";

alter table "public"."amazon_sales_30d" add constraint "amazon_sales_30d_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."amazon_sales_30d" validate constraint "amazon_sales_30d_company_id_fkey";

alter table "public"."amazon_sales_30d" add constraint "amazon_sales_30d_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."amazon_sales_30d" validate constraint "amazon_sales_30d_user_id_fkey";

alter table "public"."billing_profiles" add constraint "billing_profiles_type_check" CHECK ((type = ANY (ARRAY['individual'::text, 'company'::text]))) not valid;

alter table "public"."billing_profiles" validate constraint "billing_profiles_type_check";

alter table "public"."billing_profiles" add constraint "billing_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."billing_profiles" validate constraint "billing_profiles_user_id_fkey";

alter table "public"."carriers" add constraint "carriers_code_key" UNIQUE using index "carriers_code_key";

alter table "public"."carriers" add constraint "carriers_name_key" UNIQUE using index "carriers_name_key";

alter table "public"."companies" add constraint "companies_code_key" UNIQUE using index "companies_code_key";

alter table "public"."company_deals" add constraint "company_deals_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."company_deals" validate constraint "company_deals_company_id_fkey";

alter table "public"."company_deals" add constraint "company_deals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."company_deals" validate constraint "company_deals_user_id_fkey";

alter table "public"."export_files" add constraint "export_files_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."export_files" validate constraint "export_files_company_id_fkey";

alter table "public"."export_files" add constraint "export_files_export_type_check" CHECK ((export_type = ANY (ARRAY['stock_monthly_snapshot'::text, 'stock_ad_hoc'::text]))) not valid;

alter table "public"."export_files" validate constraint "export_files_export_type_check";

alter table "public"."export_files" add constraint "export_files_status_check" CHECK ((status = ANY (ARRAY['ready'::text, 'failed'::text, 'deleted'::text]))) not valid;

alter table "public"."export_files" validate constraint "export_files_status_check";

alter table "public"."export_files" add constraint "export_files_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."export_files" validate constraint "export_files_user_id_fkey";

alter table "public"."fba_lines" add constraint "fba_lines_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."fba_lines" validate constraint "fba_lines_company_id_fkey";

alter table "public"."fba_lines" add constraint "fba_lines_units_check" CHECK ((units >= 0)) not valid;

alter table "public"."fba_lines" validate constraint "fba_lines_units_check";

alter table "public"."fba_lines" add constraint "fba_lines_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."fba_lines" validate constraint "fba_lines_user_id_fkey";

alter table "public"."fbm_lines" add constraint "fbm_lines_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."fbm_lines" validate constraint "fbm_lines_company_id_fkey";

alter table "public"."fbm_lines" add constraint "fbm_lines_orders_units_check" CHECK ((orders_units >= 0)) not valid;

alter table "public"."fbm_lines" validate constraint "fbm_lines_orders_units_check";

alter table "public"."fbm_lines" add constraint "fbm_lines_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."fbm_lines" validate constraint "fbm_lines_user_id_fkey";

alter table "public"."fbm_shipping_rates" add constraint "fbm_shipping_rates_category_check" CHECK ((category = ANY (ARRAY['domestic'::text, 'international'::text]))) not valid;

alter table "public"."fbm_shipping_rates" validate constraint "fbm_shipping_rates_category_check";

alter table "public"."invitations" add constraint "invitations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."invitations" validate constraint "invitations_company_id_fkey";

alter table "public"."invitations" add constraint "invitations_token_key" UNIQUE using index "invitations_token_key";

alter table "public"."invoices" add constraint "invoices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."invoices" validate constraint "invoices_user_id_fkey";

alter table "public"."other_lines" add constraint "other_lines_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."other_lines" validate constraint "other_lines_company_id_fkey";

alter table "public"."other_lines" add constraint "other_lines_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."other_lines" validate constraint "other_lines_created_by_fkey";

alter table "public"."payment_requests" add constraint "payment_requests_amount_check" CHECK ((amount > (0)::numeric)) not valid;

alter table "public"."payment_requests" validate constraint "payment_requests_amount_check";

alter table "public"."payment_requests" add constraint "payment_requests_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) not valid;

alter table "public"."payment_requests" validate constraint "payment_requests_approved_by_fkey";

alter table "public"."payment_requests" add constraint "payment_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) not valid;

alter table "public"."payment_requests" validate constraint "payment_requests_status_check";

alter table "public"."payment_requests" add constraint "payment_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."payment_requests" validate constraint "payment_requests_user_id_fkey";

alter table "public"."prep_request_boxes" add constraint "prep_request_boxes_box_number_check" CHECK ((box_number >= 1)) not valid;

alter table "public"."prep_request_boxes" validate constraint "prep_request_boxes_box_number_check";

alter table "public"."prep_request_boxes" add constraint "prep_request_boxes_prep_request_item_id_fkey" FOREIGN KEY (prep_request_item_id) REFERENCES public.prep_request_items(id) ON DELETE CASCADE not valid;

alter table "public"."prep_request_boxes" validate constraint "prep_request_boxes_prep_request_item_id_fkey";

alter table "public"."prep_request_boxes" add constraint "prep_request_boxes_units_check" CHECK ((units >= 0)) not valid;

alter table "public"."prep_request_boxes" validate constraint "prep_request_boxes_units_check";

alter table "public"."prep_request_items" add constraint "prep_request_items_asin_or_sku_chk" CHECK ((((asin IS NOT NULL) AND (length(TRIM(BOTH FROM asin)) > 0)) OR ((sku IS NOT NULL) AND (length(TRIM(BOTH FROM sku)) > 0)))) not valid;

alter table "public"."prep_request_items" validate constraint "prep_request_items_asin_or_sku_chk";

alter table "public"."prep_request_items" add constraint "prep_request_items_request_id_fkey" FOREIGN KEY (prep_request_id) REFERENCES public.prep_requests(id) ON DELETE CASCADE not valid;

alter table "public"."prep_request_items" validate constraint "prep_request_items_request_id_fkey";

alter table "public"."prep_request_items" add constraint "prep_request_items_stock_item_id_fkey" FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE SET NULL not valid;

alter table "public"."prep_request_items" validate constraint "prep_request_items_stock_item_id_fkey";

alter table "public"."prep_request_items" add constraint "prep_request_items_units_requested_check" CHECK ((units_requested > 0)) not valid;

alter table "public"."prep_request_items" validate constraint "prep_request_items_units_requested_check";

alter table "public"."prep_request_tracking" add constraint "prep_request_tracking_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.prep_requests(id) ON DELETE CASCADE not valid;

alter table "public"."prep_request_tracking" validate constraint "prep_request_tracking_request_id_fkey";

alter table "public"."prep_requests" add constraint "prep_requests_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL not valid;

alter table "public"."prep_requests" validate constraint "prep_requests_company_id_fkey";

alter table "public"."prep_requests" add constraint "prep_requests_destination_country_check" CHECK ((destination_country = ANY (ARRAY['FR'::text, 'DE'::text, 'IT'::text, 'ES'::text]))) not valid;

alter table "public"."prep_requests" validate constraint "prep_requests_destination_country_check";

alter table "public"."prep_requests" add constraint "prep_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text]))) not valid;

alter table "public"."prep_requests" validate constraint "prep_requests_status_check";

alter table "public"."prep_requests" add constraint "prep_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."prep_requests" validate constraint "prep_requests_user_id_fkey";

alter table "public"."product_images" add constraint "product_images_stock_item_id_fkey" FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE not valid;

alter table "public"."product_images" validate constraint "product_images_stock_item_id_fkey";

alter table "public"."product_images" add constraint "product_images_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."product_images" validate constraint "product_images_uploaded_by_fkey";

alter table "public"."profiles" add constraint "profiles_affiliate_code_id_fkey" FOREIGN KEY (affiliate_code_id) REFERENCES public.affiliate_codes(id) ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_affiliate_code_id_fkey";

alter table "public"."receiving_items" add constraint "receiving_items_fba_qty_check" CHECK (((send_to_fba = false) OR ((fba_qty IS NOT NULL) AND (fba_qty >= 1) AND (fba_qty <= quantity_received)))) not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_fba_qty_check";

alter table "public"."receiving_items" add constraint "receiving_items_fba_qty_null_when_unchecked" CHECK (((send_to_fba = true) OR (fba_qty IS NULL))) not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_fba_qty_null_when_unchecked";

alter table "public"."receiving_items" add constraint "receiving_items_quantity_received_check" CHECK ((quantity_received >= 1)) not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_quantity_received_check";

alter table "public"."receiving_items" add constraint "receiving_items_quantity_to_stock_check" CHECK ((quantity_to_stock >= 0)) not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_quantity_to_stock_check";

alter table "public"."receiving_items" add constraint "receiving_items_received_by_fkey" FOREIGN KEY (received_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_received_by_fkey";

alter table "public"."receiving_items" add constraint "receiving_items_remaining_action_check" CHECK ((remaining_action = ANY (ARRAY['direct_to_amazon'::text, 'hold_for_prep'::text, 'client_pickup'::text, 'damage_loss'::text]))) not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_remaining_action_check";

alter table "public"."receiving_items" add constraint "receiving_items_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES public.receiving_shipments(id) ON DELETE CASCADE not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_shipment_id_fkey";

alter table "public"."receiving_items" add constraint "receiving_items_stock_item_id_fkey" FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE SET NULL not valid;

alter table "public"."receiving_items" validate constraint "receiving_items_stock_item_id_fkey";

alter table "public"."receiving_shipment_items" add constraint "receiving_shipment_items_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES public.receiving_shipments(id) ON DELETE CASCADE not valid;

alter table "public"."receiving_shipment_items" validate constraint "receiving_shipment_items_shipment_id_fkey";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."receiving_shipments" validate constraint "receiving_shipments_company_id_fkey";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."receiving_shipments" validate constraint "receiving_shipments_created_by_fkey";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_fba_mode_check" CHECK ((fba_mode = ANY (ARRAY['none'::text, 'full'::text, 'partial'::text]))) not valid;

alter table "public"."receiving_shipments" validate constraint "receiving_shipments_fba_mode_check";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_processed_by_fkey" FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."receiving_shipments" validate constraint "receiving_shipments_processed_by_fkey";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_received_by_fkey" FOREIGN KEY (received_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."receiving_shipments" validate constraint "receiving_shipments_received_by_fkey";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'partial'::text, 'received'::text, 'processed'::text, 'cancelled'::text]))) not valid;

alter table "public"."receiving_shipments" validate constraint "receiving_shipments_status_check";

alter table "public"."receiving_shipments" add constraint "receiving_shipments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."receiving_shipments" validate constraint "receiving_shipments_user_id_fkey";

alter table "public"."receiving_to_stock_log" add constraint "receiving_to_stock_log_moved_by_fkey" FOREIGN KEY (moved_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."receiving_to_stock_log" validate constraint "receiving_to_stock_log_moved_by_fkey";

alter table "public"."receiving_to_stock_log" add constraint "receiving_to_stock_log_quantity_moved_check" CHECK ((quantity_moved > 0)) not valid;

alter table "public"."receiving_to_stock_log" validate constraint "receiving_to_stock_log_quantity_moved_check";

alter table "public"."receiving_to_stock_log" add constraint "receiving_to_stock_log_receiving_item_id_fkey" FOREIGN KEY (receiving_item_id) REFERENCES public.receiving_items(id) ON DELETE CASCADE not valid;

alter table "public"."receiving_to_stock_log" validate constraint "receiving_to_stock_log_receiving_item_id_fkey";

alter table "public"."receiving_to_stock_log" add constraint "receiving_to_stock_log_stock_item_id_fkey" FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE not valid;

alter table "public"."receiving_to_stock_log" validate constraint "receiving_to_stock_log_stock_item_id_fkey";

alter table "public"."returns" add constraint "returns_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."returns" validate constraint "returns_company_id_fkey";

alter table "public"."returns" add constraint "returns_qty_check" CHECK ((qty >= 0)) not valid;

alter table "public"."returns" validate constraint "returns_qty_check";

alter table "public"."returns" add constraint "returns_status_check" CHECK ((status = ANY (ARRAY['Desigilat'::text, 'Distrus'::text, 'Sigilat'::text, 'Other'::text]))) not valid;

alter table "public"."returns" validate constraint "returns_status_check";

alter table "public"."returns" add constraint "returns_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."returns" validate constraint "returns_user_id_fkey";

alter table "public"."reviews" add constraint "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."reviews" validate constraint "reviews_rating_check";

alter table "public"."seller_tokens" add constraint "seller_tokens_seller_id_key" UNIQUE using index "seller_tokens_seller_id_key";

alter table "public"."stock_items" add constraint "stock_items_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE not valid;

alter table "public"."stock_items" validate constraint "stock_items_company_id_fkey";

alter table "public"."stock_items" add constraint "stock_items_qty_check" CHECK ((qty >= 0)) not valid;

alter table "public"."stock_items" validate constraint "stock_items_qty_check";

alter table "public"."stock_items" add constraint "stock_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."stock_items" validate constraint "stock_items_user_id_fkey";

alter table "public"."user_guides" add constraint "user_guides_source_type_check" CHECK ((source_type = ANY (ARRAY['youtube'::text, 'upload'::text]))) not valid;

alter table "public"."user_guides" validate constraint "user_guides_source_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.accept_invite(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_invite record;
begin
  select * into v_invite
  from public.invitations
  where token = p_token
    and consumed_at is null;

  if not found then
    raise exception 'Invite invalid or consumed';
  end if;

  -- setează company_id doar dacă încă e null
  update public.profiles
  set company_id = v_invite.company_id
  where id = auth.uid()
    and company_id is null;

  if not found then
    -- ori avea deja companie, ori user neautentificat
    return;
  end if;

  update public.invitations
  set consumed_at = now()
  where id = v_invite.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_prep_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.api_update_stock_item_client(p_id integer, p_name text, p_asin text, p_product_link text, p_purchase_price numeric)
 RETURNS SETOF public.stock_items
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update stock_items s
  set
    name = coalesce(p_name, s.name),
    asin = coalesce(p_asin, s.asin),
    product_link = coalesce(p_product_link, s.product_link),
    purchase_price = p_purchase_price
  where s.id = p_id
    and s.company_id in (
      select company_id from profiles where id = auth.uid()
    )
  returning s.*;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_unique_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_company_id uuid;
BEGIN
  IF NEW.company_id IS NULL THEN
    new_company_id := gen_random_uuid();
    NEW.company_id := new_company_id;

    -- creăm și în tabelul companies
    INSERT INTO companies (id, name, created_at)
    VALUES (new_company_id, 'Auto-' || new_company_id, NOW());
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_create_company_for_profile()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_company_id uuid;
BEGIN
  IF NEW.company_id IS NULL THEN
    new_company_id := gen_random_uuid();
    INSERT INTO public.companies (id, name, created_at)
    VALUES (new_company_id, concat('Company-', NEW.id::text), now());
    NEW.company_id := new_company_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bprof_keep_single_default()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_default IS TRUE THEN
    UPDATE public.billing_profiles
    SET is_default = FALSE
    WHERE user_id = NEW.user_id
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calc_period_balances(p_user_id uuid, p_company_id uuid, p_start date, p_end date)
 RETURNS TABLE(sold_curent numeric, sold_restant numeric, sold_la_zi numeric)
 LANGUAGE sql
 STABLE
AS $function$
with b as (
  select
    p_start::date as s,
    p_end::date   as e,
    (p_start::date - interval '1 day')::date as prev_end
),
-- servicii până la finalul lunii anterioare
fba_prev as (
  select coalesce(sum(fl.total),0) as v
  from fba_lines fl cross join b
  where fl.company_id = p_company_id
    and fl.service_date <= b.prev_end
),
fbm_prev as (
  select coalesce(sum(fm.total),0) as v
  from fbm_lines fm cross join b
  where fm.company_id = p_company_id
    and fm.service_date <= b.prev_end
),
-- plăți (facturi paid) până la finalul lunii anterioare
paid_prev as (
  select coalesce(sum(inv.amount + coalesce(inv.vat_amount,0)),0) as v
  from invoices inv cross join b
  where inv.user_id = p_user_id
    and inv.status ilike 'paid'
    and inv.issue_date <= b.prev_end
),
-- servicii din luna curentă
fba_cur as (
  select coalesce(sum(fl.total),0) as v
  from fba_lines fl cross join b
  where fl.company_id = p_company_id
    and fl.service_date between b.s and b.e
),
fbm_cur as (
  select coalesce(sum(fm.total),0) as v
  from fbm_lines fm cross join b
  where fm.company_id = p_company_id
    and fm.service_date between b.s and b.e
),
-- plăți din luna curentă
paid_cur as (
  select coalesce(sum(inv.amount + coalesce(inv.vat_amount,0)),0) as v
  from invoices inv cross join b
  where inv.user_id = p_user_id
    and inv.status ilike 'paid'
    and inv.issue_date between b.s and b.e
)
select
  (fba_cur.v + fbm_cur.v)                                       as sold_curent,
  ((fba_prev.v + fbm_prev.v) - paid_prev.v)                     as sold_restant,
  ((fba_prev.v + fbm_prev.v) - paid_prev.v)
    + (fba_cur.v + fbm_cur.v) - paid_cur.v                      as sold_la_zi
from fba_prev, fbm_prev, paid_prev, fba_cur, fbm_cur, paid_cur;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_profile_after_auth_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from public.billing_profiles where user_id = old.id;
  delete from public.profiles where id = old.id;
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_set_fba_note(p_id integer, p_note text)
 RETURNS public.fba_lines
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.fba_lines
     set obs_client = p_note
   where id = p_id
     and company_id = public.current_company_id()
  returning *;
$function$
;

CREATE OR REPLACE FUNCTION public.client_set_fbm_note(p_id integer, p_note text)
 RETURNS public.fbm_lines
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.fbm_lines
     set obs_client = p_note
   where id = p_id
     and company_id = public.current_company_id()
  returning *;
$function$
;

create or replace view "public"."client_stock_items" as  SELECT;


CREATE OR REPLACE FUNCTION public.confirm_prep_request(p_request_id uuid, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req prep_requests%rowtype;
begin
  -- lock pe cerere
  select * into v_req
  from prep_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'INVALID_STATUS: only pending can be confirmed';
  end if;

  -- scade stocul pentru item-ele cu stock_item_id setat
  update stock_items s
  set qty = s.qty - i.units_requested
  from prep_request_items i
  where i.request_id = v_req.id
    and i.stock_item_id is not null
    and s.id = i.stock_item_id;

  -- protecție: fără stoc negativ
  if exists (
    select 1
    from stock_items s
    join prep_request_items i on i.stock_item_id = s.id
    where i.request_id = v_req.id
      and s.qty < 0
  ) then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  -- marchează cererea confirmată
  update prep_requests
  set status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = p_admin_id
  where id = v_req.id;

  return json_build_object(
    'id', v_req.id,
    'status', 'confirmed',
    'confirmed_at', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_prep_request_v2(p_request_id uuid, p_admin_id uuid)
 RETURNS TABLE(request_id uuid, email text, client_name text, company_name text, items jsonb, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_email     text;
  v_first     text;
  v_last      text;
  v_company   text;
  v_note      text;
BEGIN
  -- 1) Lock pe header (fără join-uri)
  UPDATE public.prep_requests pr
  SET id = pr.id
  WHERE pr.id = p_request_id
    AND pr.status = 'pending'
  RETURNING pr.user_id, COALESCE(pr.obs_admin, '') INTO v_user_id, v_note;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not pending' USING ERRCODE = 'P0001';
  END IF;

  -- 2) Normalizează valorile pe items
  UPDATE public.prep_request_items i
  SET units_sent    = COALESCE(i.units_sent, i.units_requested),
      units_removed = GREATEST(0, i.units_requested - COALESCE(i.units_sent, i.units_requested))
  WHERE i.prep_request_id = p_request_id;

  -- 3) Lock pe rândurile de stock
  PERFORM 1
  FROM public.stock_items s
  WHERE s.id IN (
    SELECT i.stock_item_id
    FROM public.prep_request_items i
    WHERE i.prep_request_id = p_request_id
      AND i.stock_item_id IS NOT NULL
  )
  FOR UPDATE;

  -- 4) Decrement stoc cu units_sent
  UPDATE public.stock_items s
  SET qty = CASE
              WHEN s.qty IS NULL THEN NULL
              ELSE GREATEST(0, s.qty - i.units_sent)
            END
  FROM public.prep_request_items i
  WHERE i.prep_request_id = p_request_id
    AND i.stock_item_id IS NOT NULL
    AND s.id = i.stock_item_id;

  -- 5) Marchează cererea confirmată
  UPDATE public.prep_requests
  SET status       = 'confirmed',
      confirmed_by = p_admin_id,
      confirmed_at = NOW()
  WHERE id = p_request_id;

  -- 6) Payload pentru email
  SELECT p.email, p.first_name, p.last_name, p.company_name
    INTO v_email, v_first, v_last, v_company
  FROM public.profiles p
  WHERE p.id = v_user_id;

  RETURN QUERY
  SELECT p_request_id,
         v_email,
         CONCAT_WS(' ', v_first, v_last),
         v_company,
         (
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'asin',      i.asin,
                      'sku',       i.sku,
                      'requested', i.units_requested,
                      'sent',      COALESCE(i.units_sent, i.units_requested),
                      'removed',   COALESCE(i.units_removed, 0),
                      'note',      i.obs_admin
                    )
                  )
           FROM public.prep_request_items i
           WHERE i.prep_request_id = p_request_id
         ),
         v_note;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_prep_request_v3(p_request_id uuid, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(request_id text, email text, client_name text, company_name text, note text, items jsonb, fba_shipment_id text, tracking_ids text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req record;
  v_email        text;
  v_client_name  text;
  v_company_name text;
  v_note         text;
  v_items        jsonb;
  v_tracking_ids text[];
begin
  -- 1) Citește header-ul cererii (și îl blochează pe durata tranzacției)
  select r.id, r.user_id, r.company_id, r.obs_admin, r.fba_shipment_id
    into v_req
  from prep_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Request % not found', p_request_id;
  end if;

  -- 2) Profilul clientului (email, nume, firmă)
  select
    p.email,
    nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
    p.company_name
  into v_email, v_client_name, v_company_name
  from profiles p
  where p.id = v_req.user_id;

  v_note := v_req.obs_admin;

  -- 3) Liniile (JSONB)
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'asin',     i.asin,
               'sku',      i.sku,
               'requested',i.units_requested,
               'sent',     i.units_sent,
               'removed',  coalesce(i.units_removed,
                                    greatest(coalesce(i.units_requested,0) - coalesce(i.units_sent,0), 0)),
               'note',     i.obs_admin
             )
             order by i.id
           ),
           '[]'::jsonb
         )
    into v_items
  from prep_request_items i
  where i.request_id = v_req.id;

  -- 4) Tracking IDs (array de text, ordonate cronologic)
  select coalesce(array_agg(t.tracking_id order by t.created_at), array[]::text[])
    into v_tracking_ids
  from prep_request_tracking t
  where t.request_id = v_req.id;

  -- 5) RETURN
  request_id      := v_req.id::text;
  email           := v_email;
  client_name     := v_client_name;
  company_name    := v_company_name;
  note            := v_note;
  items           := v_items;
  fba_shipment_id := v_req.fba_shipment_id;
  tracking_ids    := v_tracking_ids;

  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.e_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE( (SELECT is_admin FROM profiles WHERE id = auth.uid()), false );
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_fba_price_policy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- dacă userul NU e admin și introduce un preț negativ → eroare
  IF NOT e_admin() AND NEW.unit_price < 0 THEN
    RAISE EXCEPTION 'Only admins can insert/update negative prices';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fba_enforce_client_update_only_obs()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  is_admin boolean := coalesce(public.e_admin(), false);
  col text;
  changed_cols text[] := '{}';
  allowed_cols constant text[] := array['obs_client','obs_client_seen']; -- doar ce avem în tabel
  jnew jsonb := to_jsonb(NEW);
  jold jsonb := to_jsonb(OLD);
begin
  if is_admin then
    return NEW;
  end if;

  for col in
    select a.attname
    from pg_attribute a
    where a.attrelid = TG_RELID
      and a.attnum > 0
      and not a.attisdropped
  loop
    if jnew -> col is distinct from jold -> col then
      changed_cols := array_append(changed_cols, col);
    end if;
  end loop;

  if array_length(changed_cols, 1) is not null then
    if not (changed_cols <@ allowed_cols) then
      RAISE NOTICE 'fba_enforce: changed_cols=% allowed_cols=%', changed_cols, allowed_cols;
      RAISE EXCEPTION 'clients may update only obs_client';
    end if;
  end if;

  return NEW;
end;
$function$
;

create or replace view "public"."fba_lines_editable" as  SELECT id,
    company_id,
    service,
    service_date,
    unit_price,
    units,
    total,
    obs_client,
    obs_admin,
    created_by,
    created_at,
    obs_client_seen,
    is_paid,
    paid_at,
    user_id
   FROM public.fba_lines;


CREATE OR REPLACE FUNCTION public.fba_obs_client_flags()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.obs_client,'') is distinct from coalesce(old.obs_client,'') then
    new.obs_client_seen := false;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fbm_enforce_client_update_only_obs()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  is_admin boolean := coalesce(public.e_admin(), false);
  col text;
  changed_cols text[] := '{}';
  allowed_cols constant text[] := array['obs_client','obs_client_seen','obs_client_flags','updated_at'];
  jnew jsonb := to_jsonb(NEW);
  jold jsonb := to_jsonb(OLD);
begin
  if is_admin then
    return NEW;
  end if;

  for col in
    select a.attname
    from pg_attribute a
    where a.attrelid = TG_RELID
      and a.attnum > 0
      and not a.attisdropped
  loop
    if jnew -> col is distinct from jold -> col then
      changed_cols := array_append(changed_cols, col);
    end if;
  end loop;

  if array_length(changed_cols, 1) is not null then
    if not (changed_cols <@ allowed_cols) then
      raise exception 'clients may update only obs_client';
    end if;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fbm_obs_client_flags()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.obs_client,'') is distinct from coalesce(old.obs_client,'') then
    new.obs_client_seen := false;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_after_signup_bootstrap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.companies (id, name, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'company_name',
             NEW.raw_user_meta_data->>'name',
             'Auto-'||NEW.id),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, first_name, last_name, company_id, created_at, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.id,
    now(),
    'client'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        company_id = NEW.id;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.fn_stock_limited_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- doar adminii pot modifica EAN sau QTY
  IF ( (NEW.ean IS DISTINCT FROM OLD.ean OR NEW.qty IS DISTINCT FROM OLD.qty) AND NOT e_admin() ) THEN
    RAISE EXCEPTION 'You are not allowed to modify EAN or quantity';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_period_balances(p_company_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(sold_curent numeric, sold_restant numeric, sold_la_zi numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH
fba_cur AS (
  SELECT COALESCE(SUM(total), SUM(unit_price * units)) AS sum_fba
  FROM public.fba_lines
  WHERE company_id = p_company_id
    AND service_date BETWEEN p_start_date AND p_end_date
),
fbm_cur AS (
  SELECT COALESCE(SUM(total), SUM(unit_price * orders_units)) AS sum_fbm
  FROM public.fbm_lines
  WHERE company_id = p_company_id
    AND service_date BETWEEN p_start_date AND p_end_date
),
fba_prev AS (
  SELECT COALESCE(SUM(total), SUM(unit_price * units)) AS sum_fba
  FROM public.fba_lines
  WHERE company_id = p_company_id
    AND service_date <= (p_start_date - interval '1 day')
),
fbm_prev AS (
  SELECT COALESCE(SUM(total), SUM(unit_price * orders_units)) AS sum_fbm
  FROM public.fbm_lines
  WHERE company_id = p_company_id
    AND service_date <= (p_start_date - interval '1 day')
),
inv_prev AS (
  SELECT COALESCE(SUM(amount),0) AS sum_paid
  FROM public.invoices
  WHERE company_id = p_company_id
    AND issue_date <= (p_start_date - interval '1 day')
    AND LOWER(status) = 'paid'
),
inv_cur AS (
  SELECT COALESCE(SUM(amount),0) AS sum_paid
  FROM public.invoices
  WHERE company_id = p_company_id
    AND issue_date BETWEEN p_start_date AND p_end_date
    AND LOWER(status) = 'paid'
)
SELECT
  (COALESCE(fba_cur.sum_fba,0) + COALESCE(fbm_cur.sum_fbm,0)) AS sold_curent,
  ((COALESCE(fba_prev.sum_fba,0) + COALESCE(fbm_prev.sum_fbm,0)) - COALESCE(inv_prev.sum_paid,0)) * -1 AS sold_restant,
  (((COALESCE(fba_prev.sum_fba,0) + COALESCE(fbm_prev.sum_fbm,0)) - COALESCE(inv_prev.sum_paid,0))
   + (COALESCE(fba_cur.sum_fba,0) + COALESCE(fbm_cur.sum_fbm,0))
   - COALESCE(inv_cur.sum_paid,0)) * -1 AS sold_la_zi
FROM fba_cur, fbm_cur, fba_prev, fbm_prev, inv_prev, inv_cur;
$function$
;

CREATE OR REPLACE FUNCTION public.get_period_balances(p_user_id uuid, p_company_id uuid, p_start date, p_end date)
 RETURNS TABLE(sold_curent numeric, sold_restant numeric, sold_la_zi numeric)
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select
    -- sold curent = total servicii din perioada selectată
    coalesce(sum(case when service_date between p_start and p_end then amount end), 0) as sold_curent,

    -- sold restant = tot ce este înainte de perioada curentă
    coalesce(sum(case when service_date < p_start then amount end), 0) as sold_restant,

    -- sold la zi = toate sumele până azi
    coalesce(sum(amount), 0) as sold_la_zi
  from (
    select company_id, service_date, amount from public.fba_lines
    union all
    select company_id, service_date, amount from public.fbm_lines
    union all
    select company_id, invoice_date as service_date, total as amount from public.invoices
    union all
    select company_id, return_date as service_date, cost as amount from public.returns
  ) t
  where t.company_id = p_company_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_companies_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_company_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_content_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_export_files_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  meta JSONB := NEW.raw_user_meta_data;
  account_type TEXT := COALESCE(NULLIF(meta->>'account_type', ''), 'individual');
  company_uuid UUID;
  company_title TEXT;
  fn TEXT := NULLIF(meta->>'first_name', '');
  ln TEXT := NULLIF(meta->>'last_name', '');
  company_name TEXT := NULLIF(meta->>'company_name', '');
  vat_no TEXT := NULLIF(meta->>'vat_number', '');
  cui_val TEXT := NULLIF(meta->>'cui', '');
  billing_country TEXT := COALESCE(NULLIF(meta->>'country', ''), 'FR');
  billing_address TEXT := NULLIF(meta->>'company_address', '');
  billing_city TEXT := NULLIF(meta->>'company_city', '');
  billing_postal TEXT := NULLIF(meta->>'company_postal_code', '');
  billing_phone TEXT := NULLIF(meta->>'phone', '');
  affiliate_input TEXT := NULLIF(meta->>'affiliate_code', '');
  affiliate_code_uuid UUID;
  affiliate_value TEXT;
BEGIN
  affiliate_value := UPPER(COALESCE(NULLIF(meta->>'affiliate_code_input', ''), affiliate_input));
  IF affiliate_value IS NOT NULL THEN
    BEGIN
      SELECT id
        INTO affiliate_code_uuid
        FROM public.affiliate_codes
        WHERE code = affiliate_value
          AND active = true
        LIMIT 1;
    EXCEPTION WHEN others THEN
      affiliate_code_uuid := NULL;
    END;
  END IF;

  company_uuid := COALESCE(
    NULLIF(meta->>'company_id', '')::UUID,
    NEW.id
  );

  company_title := COALESCE(
    company_name,
    NULLIF(meta->>'store_name', ''),
    NULLIF(TRIM(BOTH ' ' FROM CONCAT_WS(' ', fn, ln)), ''),
    NEW.email
  );

  INSERT INTO public.companies (id, name, created_at, updated_at)
  VALUES (company_uuid, company_title, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = NOW();

  INSERT INTO public.profiles (
    id,
    company_id,
    first_name,
    last_name,
    account_type,
    company_name,
    cui,
    vat_number,
    company_address,
    company_city,
    company_postal_code,
    phone,
    country,
    language,
    store_name,
    affiliate_code_input,
    affiliate_code_id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    company_uuid,
    fn,
    ln,
    account_type,
    company_name,
    cui_val,
    vat_no,
    meta->>'company_address',
    meta->>'company_city',
    meta->>'company_postal_code',
    billing_phone,
    billing_country,
    meta->>'language',
    meta->>'store_name',
    affiliate_value,
    affiliate_code_uuid,
    NOW(),
    NOW()
  );

  IF account_type = 'company' AND company_name IS NOT NULL THEN
    INSERT INTO public.billing_profiles (
      user_id,
      type,
      company_name,
      vat_number,
      cui,
      country,
      address,
      city,
      postal_code,
      phone,
      is_default,
      first_name,
      last_name
    )
    VALUES (
      NEW.id,
      'company',
      company_name,
      vat_no,
      cui_val,
      billing_country,
      billing_address,
      billing_city,
      billing_postal,
      billing_phone,
      true,
      fn,
      ln
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF fn IS NOT NULL OR ln IS NOT NULL THEN
    INSERT INTO public.billing_profiles (
      user_id,
      type,
      first_name,
      last_name,
      country,
      address,
      city,
      postal_code,
      phone,
      is_default
    )
    VALUES (
      NEW.id,
      'individual',
      fn,
      ln,
      billing_country,
      billing_address,
      billing_city,
      billing_postal,
      billing_phone,
      CASE WHEN account_type = 'company' THEN false ELSE true END
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (
    id,
    email,
    company_id,
    status,
    created_at
  )
  values (
    new.id,
    new.email,
    new.id,       -- user = company
    'active',
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_pricing_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_profile_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_receiving_shipment_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'submitted' AND COALESCE(OLD.status,'') <> 'submitted' THEN
    NEW.submitted_at := NOW();
  END IF;
  IF NEW.status = 'received' AND COALESCE(OLD.status,'') <> 'received' THEN
    NEW.received_at := NOW();
  END IF;
  IF NEW.status = 'processed' AND COALESCE(OLD.status,'') <> 'processed' THEN
    NEW.processed_at := NOW();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_services_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and lower(coalesce(p.account_type, '')) = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_norec(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (select 1 from public.admins where user_id = uid);
$function$
;

CREATE OR REPLACE FUNCTION public.limit_update_obs_client()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  col text;
  changed_cols text[] := '{}';
  -- permite DOAR aceste coloane pentru userii non-admin
  allowed_cols constant text[] := array['obs_client', 'obs_client_seen'];
begin
  -- adminii trec direct
  if public.e_admin() then
    return new;
  end if;

  -- detectează ce coloane s-au schimbat
  for col in
    select a.attname
    from pg_attribute a
    where a.attrelid = TG_RELID
      and a.attnum > 0
      and not a.attisdropped
  loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      changed_cols := array_append(changed_cols, col);
    end if;
  end loop;

  -- dacă s-a schimbat ceva în afara listei albe -> blocăm
  if array_length(changed_cols, 1) is not null then
    if not (changed_cols <@ allowed_cols) then
      raise exception 'clients may update only obs_client';
    end if;
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.limit_update_stock_client_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  -- Coloane permise pentru client (non-admin)
  allowed_cols text[] := ARRAY[
    'qty',
    'obs_client',
    -- ✅ adăugate ca să se poată salva din UI-ul user:
    'product_link',
    'purchase_price'
  ];
  col text;
BEGIN
  -- Adminii nu sunt limitați
  IF e_admin() THEN
    RETURN NEW;
  END IF;

  -- Pentru clienți: lăsăm doar allowed_cols; restul revin la OLD
  FOR col IN
    SELECT attname
    FROM pg_attribute a
    WHERE a.attrelid = TG_RELID
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    IF NOT (col = ANY(allowed_cols)) THEN
      EXECUTE format('SELECT ($1).%I := ($2).%I', col, col)
      USING NEW, OLD;
    END IF;
  END LOOP;

  RETURN NEW;
END
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_empty_submit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.status in ('submitted','partial')
     and not exists (select 1 from receiving_items where shipment_id = new.id) then
    raise exception 'Cannot set status to % without items', new.status;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.prevent_stock_name_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_admin boolean;
  v_my_company uuid;
begin
  -- dacă nu se schimbă name, ieșim
  if TG_OP = 'UPDATE' and (NEW.name is distinct from OLD.name) then
    -- admin?
    select (account_type = 'admin') into v_is_admin
    from profiles
    where id = auth.uid();

    if v_is_admin is true then
      return NEW;
    end if;

    -- compania userului
    select company_id into v_my_company
    from profiles
    where id = auth.uid();

    -- permite dacă rândul aparține aceleiași companii
    if NEW.company_id = v_my_company then
      return NEW;
    end if;

    -- altfel, blocăm
    raise exception 'Not allowed to change name';
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.public_submit_prep_request(p_company_id uuid, p_country text, p_items jsonb, p_note text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_req_id  uuid;
  v_user_id uuid;
begin
  -- validare țară (conform CHECK din tabel)
  if p_country not in ('FR','DE','IT','ES') then
    raise exception 'INVALID_COUNTRY';
  end if;

  -- alege user_id:
  -- 1) p_user_id (dacă e dat)
  -- 2) auth.uid() (dacă apelantul e logat)
  -- 3) orice profil al companiei (ex. primul creat) – ca fallback
  v_user_id := coalesce(
    p_user_id,
    auth.uid(),
    (select p.id
       from profiles p
      where p.company_id = p_company_id
      order by p.created_at
      limit 1)
  );

  if v_user_id is null then
    raise exception 'NO_USER_FOR_COMPANY: nu am găsit niciun user pentru companie și nu s-a transmis p_user_id';
  end if;

  -- INSERARE HEADER (fără obs_client)
  insert into prep_requests (company_id, user_id, destination_country, status)
  values (p_company_id, v_user_id, p_country, 'pending')
  returning id into v_req_id;

  -- INSERARE ITEMS (qty -> units_requested, name -> product_name)
  insert into prep_request_items (request_id, asin, sku, product_name, units_requested)
  select
    v_req_id,
    nullif(trim((x->>'asin')), ''),
    nullif(trim((x->>'sku')), ''),
    nullif(trim((x->>'name')), ''),
    greatest(1, coalesce( (x->>'qty')::int, 0))
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x;

  return v_req_id;
end;
$function$
;

create or replace view "public"."receiving_shipments_admin" as  SELECT;


CREATE OR REPLACE FUNCTION public.resolve_company_id_for_email(p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_company uuid;
begin
  -- a) invitație directă
  select company_id into v_company
  from public.invitations
  where lower(email) = lower(p_email)
    and consumed_at is null
  order by created_at desc
  limit 1;

  if v_company is not null then
    return v_company;
  end if;

  -- b) (opțional) fallback dintr-o tabelă de “domain routing”
  -- select company_id into v_company
  -- from public.company_domains
  -- where lower(p_email) like '%' || lower(domain);

  if v_company is not null then
    return v_company;
  end if;

  -- c) default global (setează-ți tu ID-ul companiei tale)
  return '23dd11c2-9ee8-4ee6-9d0f-150c4ae09fc0'::uuid;  -- <— schimbă dacă vrei alt default
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_company_id_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_invoice_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.set_other_lines_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_items_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- păstrăm doar câmpurile existente în tabel
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.name := NEW.name;
  END IF;

  IF NEW.asin IS DISTINCT FROM OLD.asin THEN
    NEW.asin := NEW.asin;
  END IF;

  IF NEW.sku IS DISTINCT FROM OLD.sku THEN
    NEW.sku := NEW.sku;
  END IF;

  IF NEW.ean IS DISTINCT FROM OLD.ean THEN
    NEW.ean := NEW.ean;
  END IF;

  IF NEW.purchase_price IS DISTINCT FROM OLD.purchase_price THEN
    NEW.purchase_price := NEW.purchase_price;
  END IF;

  IF NEW.qty IS DISTINCT FROM OLD.qty THEN
    NEW.qty := NEW.qty;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.touch_affiliate_code_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_seller_tokens_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."admins" to "anon";

grant insert on table "public"."admins" to "anon";

grant references on table "public"."admins" to "anon";

grant select on table "public"."admins" to "anon";

grant trigger on table "public"."admins" to "anon";

grant truncate on table "public"."admins" to "anon";

grant update on table "public"."admins" to "anon";

grant delete on table "public"."admins" to "authenticated";

grant insert on table "public"."admins" to "authenticated";

grant references on table "public"."admins" to "authenticated";

grant select on table "public"."admins" to "authenticated";

grant trigger on table "public"."admins" to "authenticated";

grant truncate on table "public"."admins" to "authenticated";

grant update on table "public"."admins" to "authenticated";

grant delete on table "public"."admins" to "service_role";

grant insert on table "public"."admins" to "service_role";

grant references on table "public"."admins" to "service_role";

grant select on table "public"."admins" to "service_role";

grant trigger on table "public"."admins" to "service_role";

grant truncate on table "public"."admins" to "service_role";

grant update on table "public"."admins" to "service_role";

grant delete on table "public"."affiliate_codes" to "anon";

grant insert on table "public"."affiliate_codes" to "anon";

grant references on table "public"."affiliate_codes" to "anon";

grant select on table "public"."affiliate_codes" to "anon";

grant trigger on table "public"."affiliate_codes" to "anon";

grant truncate on table "public"."affiliate_codes" to "anon";

grant update on table "public"."affiliate_codes" to "anon";

grant delete on table "public"."affiliate_codes" to "authenticated";

grant insert on table "public"."affiliate_codes" to "authenticated";

grant references on table "public"."affiliate_codes" to "authenticated";

grant select on table "public"."affiliate_codes" to "authenticated";

grant trigger on table "public"."affiliate_codes" to "authenticated";

grant truncate on table "public"."affiliate_codes" to "authenticated";

grant update on table "public"."affiliate_codes" to "authenticated";

grant delete on table "public"."affiliate_codes" to "service_role";

grant insert on table "public"."affiliate_codes" to "service_role";

grant references on table "public"."affiliate_codes" to "service_role";

grant select on table "public"."affiliate_codes" to "service_role";

grant trigger on table "public"."affiliate_codes" to "service_role";

grant truncate on table "public"."affiliate_codes" to "service_role";

grant update on table "public"."affiliate_codes" to "service_role";

grant delete on table "public"."affiliate_requests" to "anon";

grant insert on table "public"."affiliate_requests" to "anon";

grant references on table "public"."affiliate_requests" to "anon";

grant select on table "public"."affiliate_requests" to "anon";

grant trigger on table "public"."affiliate_requests" to "anon";

grant truncate on table "public"."affiliate_requests" to "anon";

grant update on table "public"."affiliate_requests" to "anon";

grant delete on table "public"."affiliate_requests" to "authenticated";

grant insert on table "public"."affiliate_requests" to "authenticated";

grant references on table "public"."affiliate_requests" to "authenticated";

grant select on table "public"."affiliate_requests" to "authenticated";

grant trigger on table "public"."affiliate_requests" to "authenticated";

grant truncate on table "public"."affiliate_requests" to "authenticated";

grant update on table "public"."affiliate_requests" to "authenticated";

grant delete on table "public"."affiliate_requests" to "service_role";

grant insert on table "public"."affiliate_requests" to "service_role";

grant references on table "public"."affiliate_requests" to "service_role";

grant select on table "public"."affiliate_requests" to "service_role";

grant trigger on table "public"."affiliate_requests" to "service_role";

grant truncate on table "public"."affiliate_requests" to "service_role";

grant update on table "public"."affiliate_requests" to "service_role";

grant delete on table "public"."amazon_integrations" to "anon";

grant insert on table "public"."amazon_integrations" to "anon";

grant references on table "public"."amazon_integrations" to "anon";

grant select on table "public"."amazon_integrations" to "anon";

grant trigger on table "public"."amazon_integrations" to "anon";

grant truncate on table "public"."amazon_integrations" to "anon";

grant update on table "public"."amazon_integrations" to "anon";

grant delete on table "public"."amazon_integrations" to "authenticated";

grant insert on table "public"."amazon_integrations" to "authenticated";

grant references on table "public"."amazon_integrations" to "authenticated";

grant select on table "public"."amazon_integrations" to "authenticated";

grant trigger on table "public"."amazon_integrations" to "authenticated";

grant truncate on table "public"."amazon_integrations" to "authenticated";

grant update on table "public"."amazon_integrations" to "authenticated";

grant delete on table "public"."amazon_integrations" to "service_role";

grant insert on table "public"."amazon_integrations" to "service_role";

grant references on table "public"."amazon_integrations" to "service_role";

grant select on table "public"."amazon_integrations" to "service_role";

grant trigger on table "public"."amazon_integrations" to "service_role";

grant truncate on table "public"."amazon_integrations" to "service_role";

grant update on table "public"."amazon_integrations" to "service_role";

grant delete on table "public"."amazon_sales_30d" to "anon";

grant insert on table "public"."amazon_sales_30d" to "anon";

grant references on table "public"."amazon_sales_30d" to "anon";

grant select on table "public"."amazon_sales_30d" to "anon";

grant trigger on table "public"."amazon_sales_30d" to "anon";

grant truncate on table "public"."amazon_sales_30d" to "anon";

grant update on table "public"."amazon_sales_30d" to "anon";

grant delete on table "public"."amazon_sales_30d" to "authenticated";

grant insert on table "public"."amazon_sales_30d" to "authenticated";

grant references on table "public"."amazon_sales_30d" to "authenticated";

grant select on table "public"."amazon_sales_30d" to "authenticated";

grant trigger on table "public"."amazon_sales_30d" to "authenticated";

grant truncate on table "public"."amazon_sales_30d" to "authenticated";

grant update on table "public"."amazon_sales_30d" to "authenticated";

grant delete on table "public"."amazon_sales_30d" to "service_role";

grant insert on table "public"."amazon_sales_30d" to "service_role";

grant references on table "public"."amazon_sales_30d" to "service_role";

grant select on table "public"."amazon_sales_30d" to "service_role";

grant trigger on table "public"."amazon_sales_30d" to "service_role";

grant truncate on table "public"."amazon_sales_30d" to "service_role";

grant update on table "public"."amazon_sales_30d" to "service_role";

grant delete on table "public"."amazon_tokens" to "anon";

grant insert on table "public"."amazon_tokens" to "anon";

grant references on table "public"."amazon_tokens" to "anon";

grant select on table "public"."amazon_tokens" to "anon";

grant trigger on table "public"."amazon_tokens" to "anon";

grant truncate on table "public"."amazon_tokens" to "anon";

grant update on table "public"."amazon_tokens" to "anon";

grant delete on table "public"."amazon_tokens" to "authenticated";

grant insert on table "public"."amazon_tokens" to "authenticated";

grant references on table "public"."amazon_tokens" to "authenticated";

grant select on table "public"."amazon_tokens" to "authenticated";

grant trigger on table "public"."amazon_tokens" to "authenticated";

grant truncate on table "public"."amazon_tokens" to "authenticated";

grant update on table "public"."amazon_tokens" to "authenticated";

grant delete on table "public"."amazon_tokens" to "service_role";

grant insert on table "public"."amazon_tokens" to "service_role";

grant references on table "public"."amazon_tokens" to "service_role";

grant select on table "public"."amazon_tokens" to "service_role";

grant trigger on table "public"."amazon_tokens" to "service_role";

grant truncate on table "public"."amazon_tokens" to "service_role";

grant update on table "public"."amazon_tokens" to "service_role";

grant delete on table "public"."analytics_visits" to "anon";

grant insert on table "public"."analytics_visits" to "anon";

grant references on table "public"."analytics_visits" to "anon";

grant select on table "public"."analytics_visits" to "anon";

grant trigger on table "public"."analytics_visits" to "anon";

grant truncate on table "public"."analytics_visits" to "anon";

grant update on table "public"."analytics_visits" to "anon";

grant delete on table "public"."analytics_visits" to "authenticated";

grant insert on table "public"."analytics_visits" to "authenticated";

grant references on table "public"."analytics_visits" to "authenticated";

grant select on table "public"."analytics_visits" to "authenticated";

grant trigger on table "public"."analytics_visits" to "authenticated";

grant truncate on table "public"."analytics_visits" to "authenticated";

grant update on table "public"."analytics_visits" to "authenticated";

grant delete on table "public"."analytics_visits" to "service_role";

grant insert on table "public"."analytics_visits" to "service_role";

grant references on table "public"."analytics_visits" to "service_role";

grant select on table "public"."analytics_visits" to "service_role";

grant trigger on table "public"."analytics_visits" to "service_role";

grant truncate on table "public"."analytics_visits" to "service_role";

grant update on table "public"."analytics_visits" to "service_role";

grant delete on table "public"."app_settings" to "anon";

grant insert on table "public"."app_settings" to "anon";

grant references on table "public"."app_settings" to "anon";

grant select on table "public"."app_settings" to "anon";

grant trigger on table "public"."app_settings" to "anon";

grant truncate on table "public"."app_settings" to "anon";

grant update on table "public"."app_settings" to "anon";

grant delete on table "public"."app_settings" to "authenticated";

grant insert on table "public"."app_settings" to "authenticated";

grant references on table "public"."app_settings" to "authenticated";

grant select on table "public"."app_settings" to "authenticated";

grant trigger on table "public"."app_settings" to "authenticated";

grant truncate on table "public"."app_settings" to "authenticated";

grant update on table "public"."app_settings" to "authenticated";

grant delete on table "public"."app_settings" to "service_role";

grant insert on table "public"."app_settings" to "service_role";

grant references on table "public"."app_settings" to "service_role";

grant select on table "public"."app_settings" to "service_role";

grant trigger on table "public"."app_settings" to "service_role";

grant truncate on table "public"."app_settings" to "service_role";

grant update on table "public"."app_settings" to "service_role";

grant delete on table "public"."billing_profiles" to "anon";

grant insert on table "public"."billing_profiles" to "anon";

grant references on table "public"."billing_profiles" to "anon";

grant select on table "public"."billing_profiles" to "anon";

grant trigger on table "public"."billing_profiles" to "anon";

grant truncate on table "public"."billing_profiles" to "anon";

grant update on table "public"."billing_profiles" to "anon";

grant delete on table "public"."billing_profiles" to "authenticated";

grant insert on table "public"."billing_profiles" to "authenticated";

grant references on table "public"."billing_profiles" to "authenticated";

grant select on table "public"."billing_profiles" to "authenticated";

grant trigger on table "public"."billing_profiles" to "authenticated";

grant truncate on table "public"."billing_profiles" to "authenticated";

grant update on table "public"."billing_profiles" to "authenticated";

grant delete on table "public"."billing_profiles" to "service_role";

grant insert on table "public"."billing_profiles" to "service_role";

grant references on table "public"."billing_profiles" to "service_role";

grant select on table "public"."billing_profiles" to "service_role";

grant trigger on table "public"."billing_profiles" to "service_role";

grant truncate on table "public"."billing_profiles" to "service_role";

grant update on table "public"."billing_profiles" to "service_role";

grant delete on table "public"."billing_profiles" to "supabase_admin";

grant insert on table "public"."billing_profiles" to "supabase_admin";

grant select on table "public"."billing_profiles" to "supabase_admin";

grant update on table "public"."billing_profiles" to "supabase_admin";

grant delete on table "public"."billing_profiles" to "supabase_auth_admin";

grant insert on table "public"."billing_profiles" to "supabase_auth_admin";

grant select on table "public"."billing_profiles" to "supabase_auth_admin";

grant update on table "public"."billing_profiles" to "supabase_auth_admin";

grant delete on table "public"."carriers" to "anon";

grant insert on table "public"."carriers" to "anon";

grant references on table "public"."carriers" to "anon";

grant select on table "public"."carriers" to "anon";

grant trigger on table "public"."carriers" to "anon";

grant truncate on table "public"."carriers" to "anon";

grant update on table "public"."carriers" to "anon";

grant delete on table "public"."carriers" to "authenticated";

grant insert on table "public"."carriers" to "authenticated";

grant references on table "public"."carriers" to "authenticated";

grant select on table "public"."carriers" to "authenticated";

grant trigger on table "public"."carriers" to "authenticated";

grant truncate on table "public"."carriers" to "authenticated";

grant update on table "public"."carriers" to "authenticated";

grant delete on table "public"."carriers" to "service_role";

grant insert on table "public"."carriers" to "service_role";

grant references on table "public"."carriers" to "service_role";

grant select on table "public"."carriers" to "service_role";

grant trigger on table "public"."carriers" to "service_role";

grant truncate on table "public"."carriers" to "service_role";

grant update on table "public"."carriers" to "service_role";

grant delete on table "public"."companies" to "anon";

grant insert on table "public"."companies" to "anon";

grant references on table "public"."companies" to "anon";

grant select on table "public"."companies" to "anon";

grant trigger on table "public"."companies" to "anon";

grant truncate on table "public"."companies" to "anon";

grant update on table "public"."companies" to "anon";

grant delete on table "public"."companies" to "authenticated";

grant insert on table "public"."companies" to "authenticated";

grant references on table "public"."companies" to "authenticated";

grant select on table "public"."companies" to "authenticated";

grant trigger on table "public"."companies" to "authenticated";

grant truncate on table "public"."companies" to "authenticated";

grant update on table "public"."companies" to "authenticated";

grant delete on table "public"."companies" to "service_role";

grant insert on table "public"."companies" to "service_role";

grant references on table "public"."companies" to "service_role";

grant select on table "public"."companies" to "service_role";

grant trigger on table "public"."companies" to "service_role";

grant truncate on table "public"."companies" to "service_role";

grant update on table "public"."companies" to "service_role";

grant delete on table "public"."companies" to "supabase_admin";

grant insert on table "public"."companies" to "supabase_admin";

grant references on table "public"."companies" to "supabase_admin";

grant select on table "public"."companies" to "supabase_admin";

grant trigger on table "public"."companies" to "supabase_admin";

grant truncate on table "public"."companies" to "supabase_admin";

grant update on table "public"."companies" to "supabase_admin";

grant delete on table "public"."companies" to "supabase_auth_admin";

grant insert on table "public"."companies" to "supabase_auth_admin";

grant select on table "public"."companies" to "supabase_auth_admin";

grant update on table "public"."companies" to "supabase_auth_admin";

grant delete on table "public"."company_deals" to "anon";

grant insert on table "public"."company_deals" to "anon";

grant references on table "public"."company_deals" to "anon";

grant select on table "public"."company_deals" to "anon";

grant trigger on table "public"."company_deals" to "anon";

grant truncate on table "public"."company_deals" to "anon";

grant update on table "public"."company_deals" to "anon";

grant delete on table "public"."company_deals" to "authenticated";

grant insert on table "public"."company_deals" to "authenticated";

grant references on table "public"."company_deals" to "authenticated";

grant select on table "public"."company_deals" to "authenticated";

grant trigger on table "public"."company_deals" to "authenticated";

grant truncate on table "public"."company_deals" to "authenticated";

grant update on table "public"."company_deals" to "authenticated";

grant delete on table "public"."company_deals" to "service_role";

grant insert on table "public"."company_deals" to "service_role";

grant references on table "public"."company_deals" to "service_role";

grant select on table "public"."company_deals" to "service_role";

grant trigger on table "public"."company_deals" to "service_role";

grant truncate on table "public"."company_deals" to "service_role";

grant update on table "public"."company_deals" to "service_role";

grant delete on table "public"."content" to "anon";

grant insert on table "public"."content" to "anon";

grant references on table "public"."content" to "anon";

grant select on table "public"."content" to "anon";

grant trigger on table "public"."content" to "anon";

grant truncate on table "public"."content" to "anon";

grant update on table "public"."content" to "anon";

grant delete on table "public"."content" to "authenticated";

grant insert on table "public"."content" to "authenticated";

grant references on table "public"."content" to "authenticated";

grant select on table "public"."content" to "authenticated";

grant trigger on table "public"."content" to "authenticated";

grant truncate on table "public"."content" to "authenticated";

grant update on table "public"."content" to "authenticated";

grant delete on table "public"."content" to "service_role";

grant insert on table "public"."content" to "service_role";

grant references on table "public"."content" to "service_role";

grant select on table "public"."content" to "service_role";

grant trigger on table "public"."content" to "service_role";

grant truncate on table "public"."content" to "service_role";

grant update on table "public"."content" to "service_role";

grant delete on table "public"."export_files" to "anon";

grant insert on table "public"."export_files" to "anon";

grant references on table "public"."export_files" to "anon";

grant select on table "public"."export_files" to "anon";

grant trigger on table "public"."export_files" to "anon";

grant truncate on table "public"."export_files" to "anon";

grant update on table "public"."export_files" to "anon";

grant delete on table "public"."export_files" to "authenticated";

grant insert on table "public"."export_files" to "authenticated";

grant references on table "public"."export_files" to "authenticated";

grant select on table "public"."export_files" to "authenticated";

grant trigger on table "public"."export_files" to "authenticated";

grant truncate on table "public"."export_files" to "authenticated";

grant update on table "public"."export_files" to "authenticated";

grant delete on table "public"."export_files" to "service_role";

grant insert on table "public"."export_files" to "service_role";

grant references on table "public"."export_files" to "service_role";

grant select on table "public"."export_files" to "service_role";

grant trigger on table "public"."export_files" to "service_role";

grant truncate on table "public"."export_files" to "service_role";

grant update on table "public"."export_files" to "service_role";

grant delete on table "public"."fba_lines" to "anon";

grant insert on table "public"."fba_lines" to "anon";

grant references on table "public"."fba_lines" to "anon";

grant select on table "public"."fba_lines" to "anon";

grant trigger on table "public"."fba_lines" to "anon";

grant truncate on table "public"."fba_lines" to "anon";

grant update on table "public"."fba_lines" to "anon";

grant delete on table "public"."fba_lines" to "authenticated";

grant insert on table "public"."fba_lines" to "authenticated";

grant references on table "public"."fba_lines" to "authenticated";

grant select on table "public"."fba_lines" to "authenticated";

grant trigger on table "public"."fba_lines" to "authenticated";

grant truncate on table "public"."fba_lines" to "authenticated";

grant update on table "public"."fba_lines" to "authenticated";

grant delete on table "public"."fba_lines" to "service_role";

grant insert on table "public"."fba_lines" to "service_role";

grant references on table "public"."fba_lines" to "service_role";

grant select on table "public"."fba_lines" to "service_role";

grant trigger on table "public"."fba_lines" to "service_role";

grant truncate on table "public"."fba_lines" to "service_role";

grant update on table "public"."fba_lines" to "service_role";

grant delete on table "public"."fbm_lines" to "anon";

grant insert on table "public"."fbm_lines" to "anon";

grant references on table "public"."fbm_lines" to "anon";

grant select on table "public"."fbm_lines" to "anon";

grant trigger on table "public"."fbm_lines" to "anon";

grant truncate on table "public"."fbm_lines" to "anon";

grant update on table "public"."fbm_lines" to "anon";

grant delete on table "public"."fbm_lines" to "authenticated";

grant insert on table "public"."fbm_lines" to "authenticated";

grant references on table "public"."fbm_lines" to "authenticated";

grant select on table "public"."fbm_lines" to "authenticated";

grant trigger on table "public"."fbm_lines" to "authenticated";

grant truncate on table "public"."fbm_lines" to "authenticated";

grant update on table "public"."fbm_lines" to "authenticated";

grant delete on table "public"."fbm_lines" to "service_role";

grant insert on table "public"."fbm_lines" to "service_role";

grant references on table "public"."fbm_lines" to "service_role";

grant select on table "public"."fbm_lines" to "service_role";

grant trigger on table "public"."fbm_lines" to "service_role";

grant truncate on table "public"."fbm_lines" to "service_role";

grant update on table "public"."fbm_lines" to "service_role";

grant delete on table "public"."fbm_shipping_rates" to "anon";

grant insert on table "public"."fbm_shipping_rates" to "anon";

grant references on table "public"."fbm_shipping_rates" to "anon";

grant select on table "public"."fbm_shipping_rates" to "anon";

grant trigger on table "public"."fbm_shipping_rates" to "anon";

grant truncate on table "public"."fbm_shipping_rates" to "anon";

grant update on table "public"."fbm_shipping_rates" to "anon";

grant delete on table "public"."fbm_shipping_rates" to "authenticated";

grant insert on table "public"."fbm_shipping_rates" to "authenticated";

grant references on table "public"."fbm_shipping_rates" to "authenticated";

grant select on table "public"."fbm_shipping_rates" to "authenticated";

grant trigger on table "public"."fbm_shipping_rates" to "authenticated";

grant truncate on table "public"."fbm_shipping_rates" to "authenticated";

grant update on table "public"."fbm_shipping_rates" to "authenticated";

grant delete on table "public"."fbm_shipping_rates" to "service_role";

grant insert on table "public"."fbm_shipping_rates" to "service_role";

grant references on table "public"."fbm_shipping_rates" to "service_role";

grant select on table "public"."fbm_shipping_rates" to "service_role";

grant trigger on table "public"."fbm_shipping_rates" to "service_role";

grant truncate on table "public"."fbm_shipping_rates" to "service_role";

grant update on table "public"."fbm_shipping_rates" to "service_role";

grant delete on table "public"."invitations" to "anon";

grant insert on table "public"."invitations" to "anon";

grant references on table "public"."invitations" to "anon";

grant select on table "public"."invitations" to "anon";

grant trigger on table "public"."invitations" to "anon";

grant truncate on table "public"."invitations" to "anon";

grant update on table "public"."invitations" to "anon";

grant delete on table "public"."invitations" to "authenticated";

grant insert on table "public"."invitations" to "authenticated";

grant references on table "public"."invitations" to "authenticated";

grant select on table "public"."invitations" to "authenticated";

grant trigger on table "public"."invitations" to "authenticated";

grant truncate on table "public"."invitations" to "authenticated";

grant update on table "public"."invitations" to "authenticated";

grant delete on table "public"."invitations" to "service_role";

grant insert on table "public"."invitations" to "service_role";

grant references on table "public"."invitations" to "service_role";

grant select on table "public"."invitations" to "service_role";

grant trigger on table "public"."invitations" to "service_role";

grant truncate on table "public"."invitations" to "service_role";

grant update on table "public"."invitations" to "service_role";

grant delete on table "public"."invoices" to "anon";

grant insert on table "public"."invoices" to "anon";

grant references on table "public"."invoices" to "anon";

grant select on table "public"."invoices" to "anon";

grant trigger on table "public"."invoices" to "anon";

grant truncate on table "public"."invoices" to "anon";

grant update on table "public"."invoices" to "anon";

grant delete on table "public"."invoices" to "authenticated";

grant insert on table "public"."invoices" to "authenticated";

grant references on table "public"."invoices" to "authenticated";

grant select on table "public"."invoices" to "authenticated";

grant trigger on table "public"."invoices" to "authenticated";

grant truncate on table "public"."invoices" to "authenticated";

grant update on table "public"."invoices" to "authenticated";

grant delete on table "public"."invoices" to "service_role";

grant insert on table "public"."invoices" to "service_role";

grant references on table "public"."invoices" to "service_role";

grant select on table "public"."invoices" to "service_role";

grant trigger on table "public"."invoices" to "service_role";

grant truncate on table "public"."invoices" to "service_role";

grant update on table "public"."invoices" to "service_role";

grant delete on table "public"."other_lines" to "anon";

grant insert on table "public"."other_lines" to "anon";

grant references on table "public"."other_lines" to "anon";

grant select on table "public"."other_lines" to "anon";

grant trigger on table "public"."other_lines" to "anon";

grant truncate on table "public"."other_lines" to "anon";

grant update on table "public"."other_lines" to "anon";

grant delete on table "public"."other_lines" to "authenticated";

grant insert on table "public"."other_lines" to "authenticated";

grant references on table "public"."other_lines" to "authenticated";

grant select on table "public"."other_lines" to "authenticated";

grant trigger on table "public"."other_lines" to "authenticated";

grant truncate on table "public"."other_lines" to "authenticated";

grant update on table "public"."other_lines" to "authenticated";

grant delete on table "public"."other_lines" to "service_role";

grant insert on table "public"."other_lines" to "service_role";

grant references on table "public"."other_lines" to "service_role";

grant select on table "public"."other_lines" to "service_role";

grant trigger on table "public"."other_lines" to "service_role";

grant truncate on table "public"."other_lines" to "service_role";

grant update on table "public"."other_lines" to "service_role";

grant delete on table "public"."payment_requests" to "anon";

grant insert on table "public"."payment_requests" to "anon";

grant references on table "public"."payment_requests" to "anon";

grant select on table "public"."payment_requests" to "anon";

grant trigger on table "public"."payment_requests" to "anon";

grant truncate on table "public"."payment_requests" to "anon";

grant update on table "public"."payment_requests" to "anon";

grant delete on table "public"."payment_requests" to "authenticated";

grant insert on table "public"."payment_requests" to "authenticated";

grant references on table "public"."payment_requests" to "authenticated";

grant select on table "public"."payment_requests" to "authenticated";

grant trigger on table "public"."payment_requests" to "authenticated";

grant truncate on table "public"."payment_requests" to "authenticated";

grant update on table "public"."payment_requests" to "authenticated";

grant delete on table "public"."payment_requests" to "service_role";

grant insert on table "public"."payment_requests" to "service_role";

grant references on table "public"."payment_requests" to "service_role";

grant select on table "public"."payment_requests" to "service_role";

grant trigger on table "public"."payment_requests" to "service_role";

grant truncate on table "public"."payment_requests" to "service_role";

grant update on table "public"."payment_requests" to "service_role";

grant delete on table "public"."prep_request_audit" to "anon";

grant insert on table "public"."prep_request_audit" to "anon";

grant references on table "public"."prep_request_audit" to "anon";

grant select on table "public"."prep_request_audit" to "anon";

grant trigger on table "public"."prep_request_audit" to "anon";

grant truncate on table "public"."prep_request_audit" to "anon";

grant update on table "public"."prep_request_audit" to "anon";

grant delete on table "public"."prep_request_audit" to "authenticated";

grant insert on table "public"."prep_request_audit" to "authenticated";

grant references on table "public"."prep_request_audit" to "authenticated";

grant select on table "public"."prep_request_audit" to "authenticated";

grant trigger on table "public"."prep_request_audit" to "authenticated";

grant truncate on table "public"."prep_request_audit" to "authenticated";

grant update on table "public"."prep_request_audit" to "authenticated";

grant delete on table "public"."prep_request_audit" to "service_role";

grant insert on table "public"."prep_request_audit" to "service_role";

grant references on table "public"."prep_request_audit" to "service_role";

grant select on table "public"."prep_request_audit" to "service_role";

grant trigger on table "public"."prep_request_audit" to "service_role";

grant truncate on table "public"."prep_request_audit" to "service_role";

grant update on table "public"."prep_request_audit" to "service_role";

grant delete on table "public"."prep_request_boxes" to "anon";

grant insert on table "public"."prep_request_boxes" to "anon";

grant references on table "public"."prep_request_boxes" to "anon";

grant select on table "public"."prep_request_boxes" to "anon";

grant trigger on table "public"."prep_request_boxes" to "anon";

grant truncate on table "public"."prep_request_boxes" to "anon";

grant update on table "public"."prep_request_boxes" to "anon";

grant delete on table "public"."prep_request_boxes" to "authenticated";

grant insert on table "public"."prep_request_boxes" to "authenticated";

grant references on table "public"."prep_request_boxes" to "authenticated";

grant select on table "public"."prep_request_boxes" to "authenticated";

grant trigger on table "public"."prep_request_boxes" to "authenticated";

grant truncate on table "public"."prep_request_boxes" to "authenticated";

grant update on table "public"."prep_request_boxes" to "authenticated";

grant delete on table "public"."prep_request_boxes" to "service_role";

grant insert on table "public"."prep_request_boxes" to "service_role";

grant references on table "public"."prep_request_boxes" to "service_role";

grant select on table "public"."prep_request_boxes" to "service_role";

grant trigger on table "public"."prep_request_boxes" to "service_role";

grant truncate on table "public"."prep_request_boxes" to "service_role";

grant update on table "public"."prep_request_boxes" to "service_role";

grant delete on table "public"."prep_request_boxes" to "supabase_admin";

grant insert on table "public"."prep_request_boxes" to "supabase_admin";

grant select on table "public"."prep_request_boxes" to "supabase_admin";

grant update on table "public"."prep_request_boxes" to "supabase_admin";

grant delete on table "public"."prep_request_boxes" to "supabase_auth_admin";

grant insert on table "public"."prep_request_boxes" to "supabase_auth_admin";

grant select on table "public"."prep_request_boxes" to "supabase_auth_admin";

grant update on table "public"."prep_request_boxes" to "supabase_auth_admin";

grant delete on table "public"."prep_request_items" to "anon";

grant insert on table "public"."prep_request_items" to "anon";

grant references on table "public"."prep_request_items" to "anon";

grant select on table "public"."prep_request_items" to "anon";

grant trigger on table "public"."prep_request_items" to "anon";

grant truncate on table "public"."prep_request_items" to "anon";

grant update on table "public"."prep_request_items" to "anon";

grant delete on table "public"."prep_request_items" to "authenticated";

grant insert on table "public"."prep_request_items" to "authenticated";

grant references on table "public"."prep_request_items" to "authenticated";

grant select on table "public"."prep_request_items" to "authenticated";

grant trigger on table "public"."prep_request_items" to "authenticated";

grant truncate on table "public"."prep_request_items" to "authenticated";

grant update on table "public"."prep_request_items" to "authenticated";

grant delete on table "public"."prep_request_items" to "service_role";

grant insert on table "public"."prep_request_items" to "service_role";

grant references on table "public"."prep_request_items" to "service_role";

grant select on table "public"."prep_request_items" to "service_role";

grant trigger on table "public"."prep_request_items" to "service_role";

grant truncate on table "public"."prep_request_items" to "service_role";

grant update on table "public"."prep_request_items" to "service_role";

grant delete on table "public"."prep_request_tracking" to "anon";

grant insert on table "public"."prep_request_tracking" to "anon";

grant references on table "public"."prep_request_tracking" to "anon";

grant select on table "public"."prep_request_tracking" to "anon";

grant trigger on table "public"."prep_request_tracking" to "anon";

grant truncate on table "public"."prep_request_tracking" to "anon";

grant update on table "public"."prep_request_tracking" to "anon";

grant delete on table "public"."prep_request_tracking" to "authenticated";

grant insert on table "public"."prep_request_tracking" to "authenticated";

grant references on table "public"."prep_request_tracking" to "authenticated";

grant select on table "public"."prep_request_tracking" to "authenticated";

grant trigger on table "public"."prep_request_tracking" to "authenticated";

grant truncate on table "public"."prep_request_tracking" to "authenticated";

grant update on table "public"."prep_request_tracking" to "authenticated";

grant delete on table "public"."prep_request_tracking" to "service_role";

grant insert on table "public"."prep_request_tracking" to "service_role";

grant references on table "public"."prep_request_tracking" to "service_role";

grant select on table "public"."prep_request_tracking" to "service_role";

grant trigger on table "public"."prep_request_tracking" to "service_role";

grant truncate on table "public"."prep_request_tracking" to "service_role";

grant update on table "public"."prep_request_tracking" to "service_role";

grant delete on table "public"."prep_requests" to "anon";

grant insert on table "public"."prep_requests" to "anon";

grant references on table "public"."prep_requests" to "anon";

grant select on table "public"."prep_requests" to "anon";

grant trigger on table "public"."prep_requests" to "anon";

grant truncate on table "public"."prep_requests" to "anon";

grant update on table "public"."prep_requests" to "anon";

grant delete on table "public"."prep_requests" to "authenticated";

grant insert on table "public"."prep_requests" to "authenticated";

grant references on table "public"."prep_requests" to "authenticated";

grant select on table "public"."prep_requests" to "authenticated";

grant trigger on table "public"."prep_requests" to "authenticated";

grant truncate on table "public"."prep_requests" to "authenticated";

grant update on table "public"."prep_requests" to "authenticated";

grant delete on table "public"."prep_requests" to "service_role";

grant insert on table "public"."prep_requests" to "service_role";

grant references on table "public"."prep_requests" to "service_role";

grant select on table "public"."prep_requests" to "service_role";

grant trigger on table "public"."prep_requests" to "service_role";

grant truncate on table "public"."prep_requests" to "service_role";

grant update on table "public"."prep_requests" to "service_role";

grant delete on table "public"."pricing" to "anon";

grant insert on table "public"."pricing" to "anon";

grant references on table "public"."pricing" to "anon";

grant select on table "public"."pricing" to "anon";

grant trigger on table "public"."pricing" to "anon";

grant truncate on table "public"."pricing" to "anon";

grant update on table "public"."pricing" to "anon";

grant delete on table "public"."pricing" to "authenticated";

grant insert on table "public"."pricing" to "authenticated";

grant references on table "public"."pricing" to "authenticated";

grant select on table "public"."pricing" to "authenticated";

grant trigger on table "public"."pricing" to "authenticated";

grant truncate on table "public"."pricing" to "authenticated";

grant update on table "public"."pricing" to "authenticated";

grant delete on table "public"."pricing" to "service_role";

grant insert on table "public"."pricing" to "service_role";

grant references on table "public"."pricing" to "service_role";

grant select on table "public"."pricing" to "service_role";

grant trigger on table "public"."pricing" to "service_role";

grant truncate on table "public"."pricing" to "service_role";

grant update on table "public"."pricing" to "service_role";

grant delete on table "public"."pricing_services" to "anon";

grant insert on table "public"."pricing_services" to "anon";

grant references on table "public"."pricing_services" to "anon";

grant select on table "public"."pricing_services" to "anon";

grant trigger on table "public"."pricing_services" to "anon";

grant truncate on table "public"."pricing_services" to "anon";

grant update on table "public"."pricing_services" to "anon";

grant delete on table "public"."pricing_services" to "authenticated";

grant insert on table "public"."pricing_services" to "authenticated";

grant references on table "public"."pricing_services" to "authenticated";

grant select on table "public"."pricing_services" to "authenticated";

grant trigger on table "public"."pricing_services" to "authenticated";

grant truncate on table "public"."pricing_services" to "authenticated";

grant update on table "public"."pricing_services" to "authenticated";

grant delete on table "public"."pricing_services" to "service_role";

grant insert on table "public"."pricing_services" to "service_role";

grant references on table "public"."pricing_services" to "service_role";

grant select on table "public"."pricing_services" to "service_role";

grant trigger on table "public"."pricing_services" to "service_role";

grant truncate on table "public"."pricing_services" to "service_role";

grant update on table "public"."pricing_services" to "service_role";

grant delete on table "public"."product_images" to "anon";

grant insert on table "public"."product_images" to "anon";

grant references on table "public"."product_images" to "anon";

grant select on table "public"."product_images" to "anon";

grant trigger on table "public"."product_images" to "anon";

grant truncate on table "public"."product_images" to "anon";

grant update on table "public"."product_images" to "anon";

grant delete on table "public"."product_images" to "authenticated";

grant insert on table "public"."product_images" to "authenticated";

grant references on table "public"."product_images" to "authenticated";

grant select on table "public"."product_images" to "authenticated";

grant trigger on table "public"."product_images" to "authenticated";

grant truncate on table "public"."product_images" to "authenticated";

grant update on table "public"."product_images" to "authenticated";

grant delete on table "public"."product_images" to "service_role";

grant insert on table "public"."product_images" to "service_role";

grant references on table "public"."product_images" to "service_role";

grant select on table "public"."product_images" to "service_role";

grant trigger on table "public"."product_images" to "service_role";

grant truncate on table "public"."product_images" to "service_role";

grant update on table "public"."product_images" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."profiles" to "supabase_admin";

grant insert on table "public"."profiles" to "supabase_admin";

grant select on table "public"."profiles" to "supabase_admin";

grant update on table "public"."profiles" to "supabase_admin";

grant delete on table "public"."profiles" to "supabase_auth_admin";

grant insert on table "public"."profiles" to "supabase_auth_admin";

grant select on table "public"."profiles" to "supabase_auth_admin";

grant update on table "public"."profiles" to "supabase_auth_admin";

grant delete on table "public"."profiles_backup_20251031" to "anon";

grant insert on table "public"."profiles_backup_20251031" to "anon";

grant references on table "public"."profiles_backup_20251031" to "anon";

grant select on table "public"."profiles_backup_20251031" to "anon";

grant trigger on table "public"."profiles_backup_20251031" to "anon";

grant truncate on table "public"."profiles_backup_20251031" to "anon";

grant update on table "public"."profiles_backup_20251031" to "anon";

grant delete on table "public"."profiles_backup_20251031" to "authenticated";

grant insert on table "public"."profiles_backup_20251031" to "authenticated";

grant references on table "public"."profiles_backup_20251031" to "authenticated";

grant select on table "public"."profiles_backup_20251031" to "authenticated";

grant trigger on table "public"."profiles_backup_20251031" to "authenticated";

grant truncate on table "public"."profiles_backup_20251031" to "authenticated";

grant update on table "public"."profiles_backup_20251031" to "authenticated";

grant delete on table "public"."profiles_backup_20251031" to "service_role";

grant insert on table "public"."profiles_backup_20251031" to "service_role";

grant references on table "public"."profiles_backup_20251031" to "service_role";

grant select on table "public"."profiles_backup_20251031" to "service_role";

grant trigger on table "public"."profiles_backup_20251031" to "service_role";

grant truncate on table "public"."profiles_backup_20251031" to "service_role";

grant update on table "public"."profiles_backup_20251031" to "service_role";

grant delete on table "public"."receiving_items" to "anon";

grant insert on table "public"."receiving_items" to "anon";

grant references on table "public"."receiving_items" to "anon";

grant select on table "public"."receiving_items" to "anon";

grant trigger on table "public"."receiving_items" to "anon";

grant truncate on table "public"."receiving_items" to "anon";

grant update on table "public"."receiving_items" to "anon";

grant delete on table "public"."receiving_items" to "authenticated";

grant insert on table "public"."receiving_items" to "authenticated";

grant references on table "public"."receiving_items" to "authenticated";

grant select on table "public"."receiving_items" to "authenticated";

grant trigger on table "public"."receiving_items" to "authenticated";

grant truncate on table "public"."receiving_items" to "authenticated";

grant update on table "public"."receiving_items" to "authenticated";

grant delete on table "public"."receiving_items" to "service_role";

grant insert on table "public"."receiving_items" to "service_role";

grant references on table "public"."receiving_items" to "service_role";

grant select on table "public"."receiving_items" to "service_role";

grant trigger on table "public"."receiving_items" to "service_role";

grant truncate on table "public"."receiving_items" to "service_role";

grant update on table "public"."receiving_items" to "service_role";

grant delete on table "public"."receiving_shipment_items" to "anon";

grant insert on table "public"."receiving_shipment_items" to "anon";

grant references on table "public"."receiving_shipment_items" to "anon";

grant select on table "public"."receiving_shipment_items" to "anon";

grant trigger on table "public"."receiving_shipment_items" to "anon";

grant truncate on table "public"."receiving_shipment_items" to "anon";

grant update on table "public"."receiving_shipment_items" to "anon";

grant delete on table "public"."receiving_shipment_items" to "authenticated";

grant insert on table "public"."receiving_shipment_items" to "authenticated";

grant references on table "public"."receiving_shipment_items" to "authenticated";

grant select on table "public"."receiving_shipment_items" to "authenticated";

grant trigger on table "public"."receiving_shipment_items" to "authenticated";

grant truncate on table "public"."receiving_shipment_items" to "authenticated";

grant update on table "public"."receiving_shipment_items" to "authenticated";

grant delete on table "public"."receiving_shipment_items" to "service_role";

grant insert on table "public"."receiving_shipment_items" to "service_role";

grant references on table "public"."receiving_shipment_items" to "service_role";

grant select on table "public"."receiving_shipment_items" to "service_role";

grant trigger on table "public"."receiving_shipment_items" to "service_role";

grant truncate on table "public"."receiving_shipment_items" to "service_role";

grant update on table "public"."receiving_shipment_items" to "service_role";

grant delete on table "public"."receiving_shipments" to "anon";

grant insert on table "public"."receiving_shipments" to "anon";

grant references on table "public"."receiving_shipments" to "anon";

grant select on table "public"."receiving_shipments" to "anon";

grant trigger on table "public"."receiving_shipments" to "anon";

grant truncate on table "public"."receiving_shipments" to "anon";

grant update on table "public"."receiving_shipments" to "anon";

grant delete on table "public"."receiving_shipments" to "authenticated";

grant insert on table "public"."receiving_shipments" to "authenticated";

grant references on table "public"."receiving_shipments" to "authenticated";

grant select on table "public"."receiving_shipments" to "authenticated";

grant trigger on table "public"."receiving_shipments" to "authenticated";

grant truncate on table "public"."receiving_shipments" to "authenticated";

grant update on table "public"."receiving_shipments" to "authenticated";

grant delete on table "public"."receiving_shipments" to "service_role";

grant insert on table "public"."receiving_shipments" to "service_role";

grant references on table "public"."receiving_shipments" to "service_role";

grant select on table "public"."receiving_shipments" to "service_role";

grant trigger on table "public"."receiving_shipments" to "service_role";

grant truncate on table "public"."receiving_shipments" to "service_role";

grant update on table "public"."receiving_shipments" to "service_role";

grant delete on table "public"."receiving_to_stock_log" to "anon";

grant insert on table "public"."receiving_to_stock_log" to "anon";

grant references on table "public"."receiving_to_stock_log" to "anon";

grant select on table "public"."receiving_to_stock_log" to "anon";

grant trigger on table "public"."receiving_to_stock_log" to "anon";

grant truncate on table "public"."receiving_to_stock_log" to "anon";

grant update on table "public"."receiving_to_stock_log" to "anon";

grant delete on table "public"."receiving_to_stock_log" to "authenticated";

grant insert on table "public"."receiving_to_stock_log" to "authenticated";

grant references on table "public"."receiving_to_stock_log" to "authenticated";

grant select on table "public"."receiving_to_stock_log" to "authenticated";

grant trigger on table "public"."receiving_to_stock_log" to "authenticated";

grant truncate on table "public"."receiving_to_stock_log" to "authenticated";

grant update on table "public"."receiving_to_stock_log" to "authenticated";

grant delete on table "public"."receiving_to_stock_log" to "service_role";

grant insert on table "public"."receiving_to_stock_log" to "service_role";

grant references on table "public"."receiving_to_stock_log" to "service_role";

grant select on table "public"."receiving_to_stock_log" to "service_role";

grant trigger on table "public"."receiving_to_stock_log" to "service_role";

grant truncate on table "public"."receiving_to_stock_log" to "service_role";

grant update on table "public"."receiving_to_stock_log" to "service_role";

grant delete on table "public"."returns" to "anon";

grant insert on table "public"."returns" to "anon";

grant references on table "public"."returns" to "anon";

grant select on table "public"."returns" to "anon";

grant trigger on table "public"."returns" to "anon";

grant truncate on table "public"."returns" to "anon";

grant update on table "public"."returns" to "anon";

grant delete on table "public"."returns" to "authenticated";

grant insert on table "public"."returns" to "authenticated";

grant references on table "public"."returns" to "authenticated";

grant select on table "public"."returns" to "authenticated";

grant trigger on table "public"."returns" to "authenticated";

grant truncate on table "public"."returns" to "authenticated";

grant update on table "public"."returns" to "authenticated";

grant delete on table "public"."returns" to "service_role";

grant insert on table "public"."returns" to "service_role";

grant references on table "public"."returns" to "service_role";

grant select on table "public"."returns" to "service_role";

grant trigger on table "public"."returns" to "service_role";

grant truncate on table "public"."returns" to "service_role";

grant update on table "public"."returns" to "service_role";

grant delete on table "public"."reviews" to "anon";

grant insert on table "public"."reviews" to "anon";

grant references on table "public"."reviews" to "anon";

grant select on table "public"."reviews" to "anon";

grant trigger on table "public"."reviews" to "anon";

grant truncate on table "public"."reviews" to "anon";

grant update on table "public"."reviews" to "anon";

grant delete on table "public"."reviews" to "authenticated";

grant insert on table "public"."reviews" to "authenticated";

grant references on table "public"."reviews" to "authenticated";

grant select on table "public"."reviews" to "authenticated";

grant trigger on table "public"."reviews" to "authenticated";

grant truncate on table "public"."reviews" to "authenticated";

grant update on table "public"."reviews" to "authenticated";

grant delete on table "public"."reviews" to "service_role";

grant insert on table "public"."reviews" to "service_role";

grant references on table "public"."reviews" to "service_role";

grant select on table "public"."reviews" to "service_role";

grant trigger on table "public"."reviews" to "service_role";

grant truncate on table "public"."reviews" to "service_role";

grant update on table "public"."reviews" to "service_role";

grant delete on table "public"."seller_tokens" to "anon";

grant insert on table "public"."seller_tokens" to "anon";

grant references on table "public"."seller_tokens" to "anon";

grant select on table "public"."seller_tokens" to "anon";

grant trigger on table "public"."seller_tokens" to "anon";

grant truncate on table "public"."seller_tokens" to "anon";

grant update on table "public"."seller_tokens" to "anon";

grant delete on table "public"."seller_tokens" to "authenticated";

grant insert on table "public"."seller_tokens" to "authenticated";

grant references on table "public"."seller_tokens" to "authenticated";

grant select on table "public"."seller_tokens" to "authenticated";

grant trigger on table "public"."seller_tokens" to "authenticated";

grant truncate on table "public"."seller_tokens" to "authenticated";

grant update on table "public"."seller_tokens" to "authenticated";

grant delete on table "public"."seller_tokens" to "service_role";

grant insert on table "public"."seller_tokens" to "service_role";

grant references on table "public"."seller_tokens" to "service_role";

grant select on table "public"."seller_tokens" to "service_role";

grant trigger on table "public"."seller_tokens" to "service_role";

grant truncate on table "public"."seller_tokens" to "service_role";

grant update on table "public"."seller_tokens" to "service_role";

grant delete on table "public"."seller_tokens" to "supabase_admin";

grant insert on table "public"."seller_tokens" to "supabase_admin";

grant select on table "public"."seller_tokens" to "supabase_admin";

grant update on table "public"."seller_tokens" to "supabase_admin";

grant delete on table "public"."seller_tokens" to "supabase_auth_admin";

grant insert on table "public"."seller_tokens" to "supabase_auth_admin";

grant select on table "public"."seller_tokens" to "supabase_auth_admin";

grant update on table "public"."seller_tokens" to "supabase_auth_admin";

grant delete on table "public"."services" to "anon";

grant insert on table "public"."services" to "anon";

grant references on table "public"."services" to "anon";

grant select on table "public"."services" to "anon";

grant trigger on table "public"."services" to "anon";

grant truncate on table "public"."services" to "anon";

grant update on table "public"."services" to "anon";

grant delete on table "public"."services" to "authenticated";

grant insert on table "public"."services" to "authenticated";

grant references on table "public"."services" to "authenticated";

grant select on table "public"."services" to "authenticated";

grant trigger on table "public"."services" to "authenticated";

grant truncate on table "public"."services" to "authenticated";

grant update on table "public"."services" to "authenticated";

grant delete on table "public"."services" to "service_role";

grant insert on table "public"."services" to "service_role";

grant references on table "public"."services" to "service_role";

grant select on table "public"."services" to "service_role";

grant trigger on table "public"."services" to "service_role";

grant truncate on table "public"."services" to "service_role";

grant update on table "public"."services" to "service_role";

grant delete on table "public"."site_visits" to "anon";

grant insert on table "public"."site_visits" to "anon";

grant references on table "public"."site_visits" to "anon";

grant select on table "public"."site_visits" to "anon";

grant trigger on table "public"."site_visits" to "anon";

grant truncate on table "public"."site_visits" to "anon";

grant update on table "public"."site_visits" to "anon";

grant delete on table "public"."site_visits" to "authenticated";

grant insert on table "public"."site_visits" to "authenticated";

grant references on table "public"."site_visits" to "authenticated";

grant select on table "public"."site_visits" to "authenticated";

grant trigger on table "public"."site_visits" to "authenticated";

grant truncate on table "public"."site_visits" to "authenticated";

grant update on table "public"."site_visits" to "authenticated";

grant delete on table "public"."site_visits" to "service_role";

grant insert on table "public"."site_visits" to "service_role";

grant references on table "public"."site_visits" to "service_role";

grant select on table "public"."site_visits" to "service_role";

grant trigger on table "public"."site_visits" to "service_role";

grant truncate on table "public"."site_visits" to "service_role";

grant update on table "public"."site_visits" to "service_role";

grant delete on table "public"."stock_items" to "anon";

grant insert on table "public"."stock_items" to "anon";

grant references on table "public"."stock_items" to "anon";

grant select on table "public"."stock_items" to "anon";

grant trigger on table "public"."stock_items" to "anon";

grant truncate on table "public"."stock_items" to "anon";

grant delete on table "public"."stock_items" to "authenticated";

grant insert on table "public"."stock_items" to "authenticated";

grant references on table "public"."stock_items" to "authenticated";

grant select on table "public"."stock_items" to "authenticated";

grant trigger on table "public"."stock_items" to "authenticated";

grant truncate on table "public"."stock_items" to "authenticated";

grant update on table "public"."stock_items" to "authenticated";

grant delete on table "public"."stock_items" to "service_role";

grant insert on table "public"."stock_items" to "service_role";

grant references on table "public"."stock_items" to "service_role";

grant select on table "public"."stock_items" to "service_role";

grant trigger on table "public"."stock_items" to "service_role";

grant truncate on table "public"."stock_items" to "service_role";

grant update on table "public"."stock_items" to "service_role";

grant delete on table "public"."sync_status" to "anon";

grant insert on table "public"."sync_status" to "anon";

grant references on table "public"."sync_status" to "anon";

grant select on table "public"."sync_status" to "anon";

grant trigger on table "public"."sync_status" to "anon";

grant truncate on table "public"."sync_status" to "anon";

grant update on table "public"."sync_status" to "anon";

grant delete on table "public"."sync_status" to "authenticated";

grant insert on table "public"."sync_status" to "authenticated";

grant references on table "public"."sync_status" to "authenticated";

grant select on table "public"."sync_status" to "authenticated";

grant trigger on table "public"."sync_status" to "authenticated";

grant truncate on table "public"."sync_status" to "authenticated";

grant update on table "public"."sync_status" to "authenticated";

grant delete on table "public"."sync_status" to "service_role";

grant insert on table "public"."sync_status" to "service_role";

grant references on table "public"."sync_status" to "service_role";

grant select on table "public"."sync_status" to "service_role";

grant trigger on table "public"."sync_status" to "service_role";

grant truncate on table "public"."sync_status" to "service_role";

grant update on table "public"."sync_status" to "service_role";

grant delete on table "public"."user_guides" to "anon";

grant insert on table "public"."user_guides" to "anon";

grant references on table "public"."user_guides" to "anon";

grant select on table "public"."user_guides" to "anon";

grant trigger on table "public"."user_guides" to "anon";

grant truncate on table "public"."user_guides" to "anon";

grant update on table "public"."user_guides" to "anon";

grant delete on table "public"."user_guides" to "authenticated";

grant insert on table "public"."user_guides" to "authenticated";

grant references on table "public"."user_guides" to "authenticated";

grant select on table "public"."user_guides" to "authenticated";

grant trigger on table "public"."user_guides" to "authenticated";

grant truncate on table "public"."user_guides" to "authenticated";

grant update on table "public"."user_guides" to "authenticated";

grant delete on table "public"."user_guides" to "service_role";

grant insert on table "public"."user_guides" to "service_role";

grant references on table "public"."user_guides" to "service_role";

grant select on table "public"."user_guides" to "service_role";

grant trigger on table "public"."user_guides" to "service_role";

grant truncate on table "public"."user_guides" to "service_role";

grant update on table "public"."user_guides" to "service_role";

grant delete on table "public"."visit_events" to "anon";

grant insert on table "public"."visit_events" to "anon";

grant references on table "public"."visit_events" to "anon";

grant select on table "public"."visit_events" to "anon";

grant trigger on table "public"."visit_events" to "anon";

grant truncate on table "public"."visit_events" to "anon";

grant update on table "public"."visit_events" to "anon";

grant delete on table "public"."visit_events" to "authenticated";

grant insert on table "public"."visit_events" to "authenticated";

grant references on table "public"."visit_events" to "authenticated";

grant select on table "public"."visit_events" to "authenticated";

grant trigger on table "public"."visit_events" to "authenticated";

grant truncate on table "public"."visit_events" to "authenticated";

grant update on table "public"."visit_events" to "authenticated";

grant delete on table "public"."visit_events" to "service_role";

grant insert on table "public"."visit_events" to "service_role";

grant references on table "public"."visit_events" to "service_role";

grant select on table "public"."visit_events" to "service_role";

grant trigger on table "public"."visit_events" to "service_role";

grant truncate on table "public"."visit_events" to "service_role";

grant update on table "public"."visit_events" to "service_role";


  create policy "temp_allow_all_select"
  on "public"."admins"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."admins"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Admins manage affiliate codes"
  on "public"."affiliate_codes"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Public select affiliate codes"
  on "public"."affiliate_codes"
  as permissive
  for select
  to public
using ((active = true));



  create policy "Admins manage affiliate requests"
  on "public"."affiliate_requests"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Own affiliate requests"
  on "public"."affiliate_requests"
  as permissive
  for all
  to public
using ((auth.uid() = profile_id))
with check ((auth.uid() = profile_id));



  create policy "Admins can manage amazon sales"
  on "public"."amazon_sales_30d"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Users can view amazon sales"
  on "public"."amazon_sales_30d"
  as permissive
  for select
  to public
using (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (user_id = auth.uid()) OR public.is_admin()));



  create policy "analytics_insert_all"
  on "public"."analytics_visits"
  as permissive
  for insert
  to public
with check (true);



  create policy "analytics_select_auth"
  on "public"."analytics_visits"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "System roles manage billing profiles"
  on "public"."billing_profiles"
  as permissive
  for all
  to supabase_admin, supabase_auth_admin, service_role
using (true)
with check (true);



  create policy "billing admin delete all"
  on "public"."billing_profiles"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "billing admin select all"
  on "public"."billing_profiles"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "billing admin update all"
  on "public"."billing_profiles"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))))
with check (true);



  create policy "billing user can insert own"
  on "public"."billing_profiles"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "billing user can select own"
  on "public"."billing_profiles"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "billing user can update own"
  on "public"."billing_profiles"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "billing_service_role_all"
  on "public"."billing_profiles"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "billing_service_role_cud"
  on "public"."billing_profiles"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "billing_service_role_cud_del"
  on "public"."billing_profiles"
  as permissive
  for delete
  to service_role
using (true);



  create policy "billing_service_role_cud_upd"
  on "public"."billing_profiles"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "billing_service_role_select"
  on "public"."billing_profiles"
  as permissive
  for select
  to service_role
using (true);



  create policy "bp_cud_own"
  on "public"."billing_profiles"
  as permissive
  for all
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "bp_select_own"
  on "public"."billing_profiles"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "bp_sr_delete"
  on "public"."billing_profiles"
  as permissive
  for delete
  to service_role
using (true);



  create policy "bp_sr_insert"
  on "public"."billing_profiles"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "bp_sr_select"
  on "public"."billing_profiles"
  as permissive
  for select
  to service_role
using (true);



  create policy "bp_sr_update"
  on "public"."billing_profiles"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "bprof_admin_all"
  on "public"."billing_profiles"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "bprof_user_delete"
  on "public"."billing_profiles"
  as permissive
  for delete
  to authenticated
using ((user_id = auth.uid()));



  create policy "bprof_user_insert"
  on "public"."billing_profiles"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "bprof_user_select"
  on "public"."billing_profiles"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "bprof_user_update"
  on "public"."billing_profiles"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Admins can manage carriers"
  on "public"."carriers"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Anyone can view carriers"
  on "public"."carriers"
  as permissive
  for select
  to public
using ((active = true));



  create policy "Admins can manage all companies"
  on "public"."companies"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "System roles can manage companies"
  on "public"."companies"
  as permissive
  for all
  to supabase_auth_admin, service_role, supabase_admin
using (true)
with check (true);



  create policy "System roles manage companies"
  on "public"."companies"
  as permissive
  for all
  to supabase_admin, supabase_auth_admin, service_role
using (true)
with check (true);



  create policy "Users can view their company"
  on "public"."companies"
  as permissive
  for select
  to public
using ((id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "temp_allow_all_select"
  on "public"."companies"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."companies"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "admin manage deals"
  on "public"."company_deals"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true)))));



  create policy "client read own deals"
  on "public"."company_deals"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = company_deals.company_id)))));



  create policy "Admins can manage content"
  on "public"."content"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "Anyone can view content"
  on "public"."content"
  as permissive
  for select
  to public
using (true);



  create policy "Admins can manage all exports"
  on "public"."export_files"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "Users can view their exports"
  on "public"."export_files"
  as permissive
  for select
  to public
using ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "clients can read their own exports"
  on "public"."export_files"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = export_files.company_id)))));



  create policy "service role can write"
  on "public"."export_files"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "admin_can_select_all_fba"
  on "public"."fba_lines"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "client_can_select_own_company_fba"
  on "public"."fba_lines"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = fba_lines.company_id) AND (COALESCE(p.status, 'active'::text) = 'active'::text)))));



  create policy "client_select_fba_lines"
  on "public"."fba_lines"
  as permissive
  for select
  to authenticated
using ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "fba_delete_admin"
  on "public"."fba_lines"
  as permissive
  for delete
  to authenticated
using (public.e_admin());



  create policy "fba_insert_admin"
  on "public"."fba_lines"
  as permissive
  for insert
  to authenticated
with check (public.e_admin());



  create policy "fba_select"
  on "public"."fba_lines"
  as permissive
  for select
  to public
using ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "fba_update"
  on "public"."fba_lines"
  as permissive
  for update
  to authenticated
using ((public.e_admin() OR (company_id = public.current_company_id())))
with check ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "fba_update_admin"
  on "public"."fba_lines"
  as permissive
  for update
  to authenticated
using (public.e_admin())
with check (public.e_admin());



  create policy "fba_update_client"
  on "public"."fba_lines"
  as permissive
  for update
  to authenticated
using ((company_id = public.current_company_id()))
with check ((company_id = public.current_company_id()));



  create policy "temp_allow_all_select"
  on "public"."fba_lines"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."fba_lines"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "admin_can_select_all_fbm"
  on "public"."fbm_lines"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "client_can_select_own_company_fbm"
  on "public"."fbm_lines"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = fbm_lines.company_id) AND (COALESCE(p.status, 'active'::text) = 'active'::text)))));



  create policy "client_select_fbm_lines"
  on "public"."fbm_lines"
  as permissive
  for select
  to authenticated
using ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "fbm_delete_admin"
  on "public"."fbm_lines"
  as permissive
  for delete
  to authenticated
using (public.e_admin());



  create policy "fbm_insert_admin"
  on "public"."fbm_lines"
  as permissive
  for insert
  to authenticated
with check (public.e_admin());



  create policy "fbm_select"
  on "public"."fbm_lines"
  as permissive
  for select
  to public
using ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "fbm_update"
  on "public"."fbm_lines"
  as permissive
  for update
  to authenticated
using ((public.e_admin() OR (company_id = public.current_company_id())))
with check ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "fbm_update_admin"
  on "public"."fbm_lines"
  as permissive
  for update
  to authenticated
using (public.e_admin())
with check (public.e_admin());



  create policy "fbm_update_client"
  on "public"."fbm_lines"
  as permissive
  for update
  to authenticated
using ((company_id = public.current_company_id()))
with check ((company_id = public.current_company_id()));



  create policy "temp_allow_all_select"
  on "public"."fbm_lines"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."fbm_lines"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Admins manage FBM shipping rates"
  on "public"."fbm_shipping_rates"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Public can read FBM shipping rates"
  on "public"."fbm_shipping_rates"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "temp_allow_all_select"
  on "public"."invitations"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."invitations"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Affiliate owners can view member invoices"
  on "public"."invoices"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.profiles members
     JOIN public.affiliate_codes ac ON ((ac.id = members.affiliate_code_id)))
  WHERE ((members.company_id = invoices.company_id) AND (ac.owner_profile_id = auth.uid())))));



  create policy "admins can delete invoices"
  on "public"."invoices"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "admins can insert invoices"
  on "public"."invoices"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "admins can update invoices"
  on "public"."invoices"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "select invoices (self or admin)"
  on "public"."invoices"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text))))));



  create policy "Clients can delete photo subscription"
  on "public"."other_lines"
  as permissive
  for delete
  to public
using (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (service = 'Photo storage subscription'::text)));



  create policy "Clients can insert photo subscription"
  on "public"."other_lines"
  as permissive
  for insert
  to public
with check (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) AND (service = 'Photo storage subscription'::text)));



  create policy "Company members can manage other_lines"
  on "public"."other_lines"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Company members can view other_lines"
  on "public"."other_lines"
  as permissive
  for select
  to public
using (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR public.is_admin()));



  create policy "payment_requests: admin full select"
  on "public"."payment_requests"
  as permissive
  for select
  to authenticated
using ((COALESCE((auth.jwt() ->> 'account_type'::text), ''::text) = 'admin'::text));



  create policy "payment_requests: admin update"
  on "public"."payment_requests"
  as permissive
  for update
  to authenticated
using ((COALESCE((auth.jwt() ->> 'account_type'::text), ''::text) = 'admin'::text))
with check ((COALESCE((auth.jwt() ->> 'account_type'::text), ''::text) = 'admin'::text));



  create policy "payment_requests: user can insert own"
  on "public"."payment_requests"
  as permissive
  for insert
  to authenticated
with check (((auth.uid() = user_id) AND (status = 'pending'::text)));



  create policy "payment_requests: user can select own"
  on "public"."payment_requests"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "temp_allow_all_select"
  on "public"."prep_request_audit"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."prep_request_audit"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Admins can manage prep request boxes"
  on "public"."prep_request_boxes"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Users can manage prep request items"
  on "public"."prep_request_items"
  as permissive
  for all
  to public
using ((prep_request_id IN ( SELECT prep_requests.id
   FROM public.prep_requests
  WHERE (prep_requests.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "Users can view prep request items"
  on "public"."prep_request_items"
  as permissive
  for select
  to public
using ((prep_request_id IN ( SELECT prep_requests.id
   FROM public.prep_requests
  WHERE (prep_requests.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "pri_delete"
  on "public"."prep_request_items"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.prep_requests pr
  WHERE ((pr.id = prep_request_items.prep_request_id) AND ((pr.user_id = auth.uid()) OR public.is_admin(auth.uid())) AND (pr.status = 'pending'::text)))));



  create policy "pri_insert"
  on "public"."prep_request_items"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.prep_requests pr
  WHERE ((pr.id = prep_request_items.prep_request_id) AND ((pr.user_id = auth.uid()) OR public.is_admin(auth.uid()))))));



  create policy "pri_select"
  on "public"."prep_request_items"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.prep_requests pr
  WHERE ((pr.id = prep_request_items.prep_request_id) AND ((pr.user_id = auth.uid()) OR public.is_admin(auth.uid()))))));



  create policy "pri_update"
  on "public"."prep_request_items"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.prep_requests pr
  WHERE ((pr.id = prep_request_items.prep_request_id) AND ((pr.user_id = auth.uid()) OR public.is_admin(auth.uid())) AND (pr.status = 'pending'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.prep_requests pr
  WHERE ((pr.id = prep_request_items.prep_request_id) AND ((pr.user_id = auth.uid()) OR public.is_admin(auth.uid())) AND (pr.status = 'pending'::text)))));



  create policy "sel_items_admin_all"
  on "public"."prep_request_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.account_type, ''::text) = 'admin'::text)))));



  create policy "sel_items_own_requests"
  on "public"."prep_request_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.prep_requests pr
  WHERE ((pr.id = prep_request_items.prep_request_id) AND (pr.user_id = auth.uid())))));



  create policy "sel_tracking_admin_all"
  on "public"."prep_request_tracking"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.account_type, ''::text) = 'admin'::text)))));



  create policy "sel_tracking_own_requests"
  on "public"."prep_request_tracking"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.prep_requests pr
  WHERE ((pr.id = prep_request_tracking.request_id) AND (pr.user_id = auth.uid())))));



  create policy "temp_allow_all_select"
  on "public"."prep_request_tracking"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."prep_request_tracking"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Users can manage their prep requests"
  on "public"."prep_requests"
  as permissive
  for all
  to public
using ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Users can view their prep requests"
  on "public"."prep_requests"
  as permissive
  for select
  to public
using ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "pr_delete"
  on "public"."prep_requests"
  as permissive
  for delete
  to public
using ((((user_id = auth.uid()) OR public.is_admin(auth.uid())) AND (status = 'pending'::text)));



  create policy "pr_insert"
  on "public"."prep_requests"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) OR public.is_admin(auth.uid())));



  create policy "pr_select"
  on "public"."prep_requests"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR public.is_admin(auth.uid())));



  create policy "pr_update"
  on "public"."prep_requests"
  as permissive
  for update
  to public
using ((((user_id = auth.uid()) OR public.is_admin(auth.uid())) AND (status = 'pending'::text)))
with check ((((user_id = auth.uid()) OR public.is_admin(auth.uid())) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text]))));



  create policy "sel_admin_all_prep_requests"
  on "public"."prep_requests"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.account_type, ''::text) = 'admin'::text)))));



  create policy "sel_own_prep_requests"
  on "public"."prep_requests"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "Admins can manage pricing"
  on "public"."pricing"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "Anyone can view pricing"
  on "public"."pricing"
  as permissive
  for select
  to public
using (true);



  create policy "Admins can manage pricing services"
  on "public"."pricing_services"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Anyone can view pricing services"
  on "public"."pricing_services"
  as permissive
  for select
  to public
using (true);



  create policy "Public can read pricing services"
  on "public"."pricing_services"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Admins manage product images"
  on "public"."product_images"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Admins view product images"
  on "public"."product_images"
  as permissive
  for select
  to public
using (public.is_admin());



  create policy "Users can manage their product images"
  on "public"."product_images"
  as permissive
  for all
  to public
using (((stock_item_id IN ( SELECT si.id
   FROM public.stock_items si
  WHERE ((si.user_id = auth.uid()) OR (si.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR public.is_admin()))
with check (((stock_item_id IN ( SELECT si.id
   FROM public.stock_items si
  WHERE ((si.user_id = auth.uid()) OR (si.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR public.is_admin()));



  create policy "Users can view their product images"
  on "public"."product_images"
  as permissive
  for select
  to public
using (((stock_item_id IN ( SELECT si.id
   FROM public.stock_items si
  WHERE ((si.user_id = auth.uid()) OR (si.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) OR public.is_admin()));



  create policy "Admins can manage all profiles"
  on "public"."profiles"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Admins can read all profiles"
  on "public"."profiles"
  as permissive
  for select
  to public
using (public.is_admin());



  create policy "Affiliate owners can view affiliate members"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.affiliate_codes ac
  WHERE ((ac.owner_profile_id = auth.uid()) AND (ac.id = profiles.affiliate_code_id)))));



  create policy "System roles can manage profiles"
  on "public"."profiles"
  as permissive
  for all
  to supabase_auth_admin, service_role, supabase_admin
using (true)
with check (true);



  create policy "Users can insert their own profile"
  on "public"."profiles"
  as permissive
  for insert
  to authenticated
with check ((id = auth.uid()));



  create policy "Users can update their own profile"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((id = auth.uid()))
with check ((id = auth.uid()));



  create policy "Users can view their own profile"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using ((id = auth.uid()));



  create policy "Admins can manage all items"
  on "public"."receiving_items"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Users can delete their company items"
  on "public"."receiving_items"
  as permissive
  for delete
  to public
using ((shipment_id IN ( SELECT receiving_shipments.id
   FROM public.receiving_shipments
  WHERE (receiving_shipments.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "Users can insert their company items"
  on "public"."receiving_items"
  as permissive
  for insert
  to public
with check ((shipment_id IN ( SELECT receiving_shipments.id
   FROM public.receiving_shipments
  WHERE (receiving_shipments.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "Users can manage their company items"
  on "public"."receiving_items"
  as permissive
  for update
  to public
using ((shipment_id IN ( SELECT receiving_shipments.id
   FROM public.receiving_shipments
  WHERE (receiving_shipments.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "Users can update their company items"
  on "public"."receiving_items"
  as permissive
  for update
  to public
using ((shipment_id IN ( SELECT receiving_shipments.id
   FROM public.receiving_shipments
  WHERE (receiving_shipments.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "Users can view their company items"
  on "public"."receiving_items"
  as permissive
  for select
  to public
using ((shipment_id IN ( SELECT receiving_shipments.id
   FROM public.receiving_shipments
  WHERE (receiving_shipments.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "Admins can manage legacy receiving items"
  on "public"."receiving_shipment_items"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Users can manage legacy receiving items"
  on "public"."receiving_shipment_items"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.receiving_shipments rs
  WHERE ((rs.id = receiving_shipment_items.shipment_id) AND (rs.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))))
with check ((EXISTS ( SELECT 1
   FROM public.receiving_shipments rs
  WHERE ((rs.id = receiving_shipment_items.shipment_id) AND (rs.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))));



  create policy "Users can view legacy receiving items"
  on "public"."receiving_shipment_items"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.receiving_shipments rs
  WHERE ((rs.id = receiving_shipment_items.shipment_id) AND (rs.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))));



  create policy "Admins can manage all shipments"
  on "public"."receiving_shipments"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Users can delete their company shipments"
  on "public"."receiving_shipments"
  as permissive
  for delete
  to public
using ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Users can insert their company shipments"
  on "public"."receiving_shipments"
  as permissive
  for insert
  to public
with check ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Users can manage their company shipments"
  on "public"."receiving_shipments"
  as permissive
  for update
  to public
using ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Users can view their company shipments"
  on "public"."receiving_shipments"
  as permissive
  for select
  to public
using ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Admins can manage all stock log"
  on "public"."receiving_to_stock_log"
  as permissive
  for all
  to public
using (public.is_admin())
with check (public.is_admin());



  create policy "Users can view their company stock log"
  on "public"."receiving_to_stock_log"
  as permissive
  for select
  to public
using ((receiving_item_id IN ( SELECT ri.id
   FROM (public.receiving_items ri
     JOIN public.receiving_shipments rs ON ((ri.shipment_id = rs.id)))
  WHERE (rs.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));



  create policy "admin_can_select_all_returns"
  on "public"."returns"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.account_type = 'admin'::text)))));



  create policy "client_can_select_own_company_returns"
  on "public"."returns"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = returns.company_id) AND (COALESCE(p.status, 'active'::text) = 'active'::text)))));



  create policy "returns_delete_admin"
  on "public"."returns"
  as permissive
  for delete
  to authenticated
using (public.e_admin());



  create policy "returns_insert"
  on "public"."returns"
  as permissive
  for insert
  to public
with check ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "returns_insert_admin"
  on "public"."returns"
  as permissive
  for insert
  to authenticated
with check (public.e_admin());



  create policy "returns_select"
  on "public"."returns"
  as permissive
  for select
  to public
using ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "returns_update"
  on "public"."returns"
  as permissive
  for update
  to public
using ((public.e_admin() OR (company_id = public.current_company_id())))
with check ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "returns_update_admin_only"
  on "public"."returns"
  as permissive
  for update
  to authenticated
using (public.e_admin())
with check (public.e_admin());



  create policy "temp_allow_all_select"
  on "public"."returns"
  as permissive
  for select
  to authenticated
using (true);



  create policy "temp_allow_all_write"
  on "public"."returns"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Admins can insert reviews"
  on "public"."reviews"
  as permissive
  for insert
  to public
with check ((auth.role() = 'authenticated'::text));



  create policy "Admins can manage reviews"
  on "public"."reviews"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "Anyone can view reviews"
  on "public"."reviews"
  as permissive
  for select
  to public
using (true);



  create policy "Public can read reviews"
  on "public"."reviews"
  as permissive
  for select
  to public
using (true);



  create policy "Service role manages seller tokens"
  on "public"."seller_tokens"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "Admins can manage services"
  on "public"."services"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "Anyone can view services"
  on "public"."services"
  as permissive
  for select
  to public
using (true);



  create policy "allow insert from anon"
  on "public"."site_visits"
  as permissive
  for insert
  to anon
with check (true);



  create policy "allow insert visits (all)"
  on "public"."site_visits"
  as permissive
  for insert
  to public
with check (true);



  create policy "allow select for authenticated"
  on "public"."site_visits"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admins can update stock"
  on "public"."stock_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "client-can-select-own-company-stock"
  on "public"."stock_items"
  as permissive
  for select
  to authenticated
using ((company_id IN ( SELECT p.company_id
   FROM public.profiles p
  WHERE (p.id = auth.uid()))));



  create policy "client-can-update-own-company-stock"
  on "public"."stock_items"
  as permissive
  for update
  to authenticated
using ((company_id IN ( SELECT p.company_id
   FROM public.profiles p
  WHERE (p.id = auth.uid()))))
with check ((company_id IN ( SELECT p.company_id
   FROM public.profiles p
  WHERE (p.id = auth.uid()))));



  create policy "client_can_select_own_company_stock"
  on "public"."stock_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = stock_items.company_id)))));



  create policy "client_can_select_own_stock"
  on "public"."stock_items"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = stock_items.company_id)))));



  create policy "clients can read company stock"
  on "public"."stock_items"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = stock_items.company_id)))));



  create policy "clients can update company stock"
  on "public"."stock_items"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = stock_items.company_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = stock_items.company_id)))));



  create policy "stock_delete_admin"
  on "public"."stock_items"
  as permissive
  for delete
  to authenticated
using (public.e_admin());



  create policy "stock_insert_admin"
  on "public"."stock_items"
  as permissive
  for insert
  to authenticated
with check (public.e_admin());



  create policy "stock_sel"
  on "public"."stock_items"
  as permissive
  for select
  to authenticated
using ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "stock_select_client"
  on "public"."stock_items"
  as permissive
  for select
  to authenticated
using ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "stock_upd"
  on "public"."stock_items"
  as permissive
  for update
  to public
using ((public.e_admin() OR (company_id = public.current_company_id())))
with check ((public.e_admin() OR (company_id = public.current_company_id())));



  create policy "user_can_delete_own_stock"
  on "public"."stock_items"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "user_can_insert_own_stock"
  on "public"."stock_items"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "user_can_update_own_stock"
  on "public"."stock_items"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "user_can_view_own_stock"
  on "public"."stock_items"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "user_guides_delete"
  on "public"."user_guides"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true)))));



  create policy "user_guides_read"
  on "public"."user_guides"
  as permissive
  for select
  to authenticated
using (true);



  create policy "user_guides_update"
  on "public"."user_guides"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true)))));



  create policy "user_guides_write"
  on "public"."user_guides"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true)))));



  create policy "visit_events_insert"
  on "public"."visit_events"
  as permissive
  for insert
  to anon, authenticated
with check (true);


CREATE TRIGGER trg_affiliate_codes_updated BEFORE UPDATE ON public.affiliate_codes FOR EACH ROW EXECUTE FUNCTION public.touch_affiliate_code_updated_at();

CREATE TRIGGER bprof_single_default_trg BEFORE INSERT OR UPDATE ON public.billing_profiles FOR EACH ROW EXECUTE FUNCTION public.bprof_keep_single_default();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_billing_profiles_updated BEFORE UPDATE ON public.billing_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.handle_companies_updated_at();

CREATE TRIGGER company_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.handle_company_updated_at();

CREATE TRIGGER content_updated_at BEFORE UPDATE ON public.content FOR EACH ROW EXECUTE FUNCTION public.handle_content_updated_at();

CREATE TRIGGER export_files_updated_at BEFORE UPDATE ON public.export_files FOR EACH ROW EXECUTE FUNCTION public.handle_export_files_updated_at();

CREATE TRIGGER trg_fba_client_update_guard BEFORE UPDATE ON public.fba_lines FOR EACH ROW WHEN ((NOT public.e_admin())) EXECUTE FUNCTION public.fba_enforce_client_update_only_obs();

CREATE TRIGGER trg_fba_limited_update BEFORE UPDATE ON public.fba_lines FOR EACH ROW EXECUTE FUNCTION public.limit_update_obs_client();

CREATE TRIGGER trg_fba_obs_client_flags BEFORE UPDATE ON public.fba_lines FOR EACH ROW EXECUTE FUNCTION public.fba_obs_client_flags();

CREATE TRIGGER trg_fba_price_policy BEFORE INSERT OR UPDATE ON public.fba_lines FOR EACH ROW EXECUTE FUNCTION public.enforce_fba_price_policy();

CREATE TRIGGER trg_set_company_id_fba BEFORE INSERT ON public.fba_lines FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_auth();

CREATE TRIGGER trg_fbm_client_update_guard BEFORE UPDATE ON public.fbm_lines FOR EACH ROW WHEN ((NOT public.e_admin())) EXECUTE FUNCTION public.fbm_enforce_client_update_only_obs();

CREATE TRIGGER trg_fbm_limited_update BEFORE UPDATE ON public.fbm_lines FOR EACH ROW EXECUTE FUNCTION public.limit_update_obs_client();

CREATE TRIGGER trg_fbm_obs_client_flags BEFORE UPDATE ON public.fbm_lines FOR EACH ROW EXECUTE FUNCTION public.fbm_obs_client_flags();

CREATE TRIGGER trg_set_company_id_fbm BEFORE INSERT ON public.fbm_lines FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_auth();

CREATE TRIGGER fbm_shipping_rates_updated_at BEFORE UPDATE ON public.fbm_shipping_rates FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trg_invoices_set_company BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_invoice_company_id();

CREATE TRIGGER trg_set_invoice_company_id BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_invoice_company_id();

CREATE TRIGGER trg_other_lines_updated_at BEFORE UPDATE ON public.other_lines FOR EACH ROW EXECUTE FUNCTION public.set_other_lines_updated_at();

CREATE TRIGGER prep_request_boxes_touch BEFORE UPDATE ON public.prep_request_boxes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_set_company_id_prep BEFORE INSERT ON public.prep_requests FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_auth();

CREATE TRIGGER pricing_updated_at BEFORE UPDATE ON public.pricing FOR EACH ROW EXECUTE FUNCTION public.handle_pricing_updated_at();

CREATE TRIGGER pricing_services_updated_at BEFORE UPDATE ON public.pricing_services FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER profile_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_profile_updated_at();

CREATE TRIGGER trg_assign_unique_company_id BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.assign_unique_company_id();

CREATE TRIGGER trg_auto_company_profile BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.auto_create_company_for_profile();

CREATE TRIGGER receiving_shipment_status_timestamps BEFORE UPDATE ON public.receiving_shipments FOR EACH ROW EXECUTE FUNCTION public.handle_receiving_shipment_updated_at();

CREATE TRIGGER trg_prevent_empty_submit BEFORE UPDATE ON public.receiving_shipments FOR EACH ROW EXECUTE FUNCTION public.prevent_empty_submit();

CREATE TRIGGER trg_seller_tokens_updated BEFORE UPDATE ON public.seller_tokens FOR EACH ROW EXECUTE FUNCTION public.touch_seller_tokens_updated_at();

CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.handle_services_updated_at();

CREATE TRIGGER trg_set_company_id_stock BEFORE INSERT ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_auth();

CREATE TRIGGER trg_stock_items_before_update BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.stock_items_before_update();

CREATE TRIGGER trg_stock_limited_update BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.fn_stock_limited_update();

CREATE TRIGGER trg_user_guides_updated_at BEFORE UPDATE ON public.user_guides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


