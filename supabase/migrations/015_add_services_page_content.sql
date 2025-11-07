++ b/supabase/migrations/015_add_services_page_content.sql
++ b/supabase/migrations/015_add_services_page_content.sql
/*
  # Add Services Page Content Columns
  1. Purpose: Add new columns to the 'content' table to make the Services & Pricing page fully dynamic.
  2. Schema: content (add new text columns for page content)
  3. Security: Policies are already in place.
*/

DO $$
BEGIN
  -- Page Header
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='services_title') THEN
    ALTER TABLE public.content ADD COLUMN services_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='services_subtitle') THEN
    ALTER TABLE public.content ADD COLUMN services_subtitle TEXT;
  END IF;

  -- Bonus Banner
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='bonus_title') THEN
    ALTER TABLE public.content ADD COLUMN bonus_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='bonus_subtitle1') THEN
    ALTER TABLE public.content ADD COLUMN bonus_subtitle1 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='bonus_subtitle2') THEN
    ALTER TABLE public.content ADD COLUMN bonus_subtitle2 TEXT;
  END IF;

  -- FBA Services Section
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fba_reception') THEN
    ALTER TABLE public.content ADD COLUMN fba_reception TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fba_polybagging') THEN
    ALTER TABLE public.content ADD COLUMN fba_polybagging TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fba_labeling') THEN
    ALTER TABLE public.content ADD COLUMN fba_labeling TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fba_dunnage') THEN
    ALTER TABLE public.content ADD COLUMN fba_dunnage TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fba_rate_label') THEN
    ALTER TABLE public.content ADD COLUMN fba_rate_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fba_unit_label') THEN
    ALTER TABLE public.content ADD COLUMN fba_unit_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fba_new_customer_label') THEN
    ALTER TABLE public.content ADD COLUMN fba_new_customer_label TEXT;
  END IF;

  -- Private Label Section
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='pl_partnership_title') THEN
    ALTER TABLE public.content ADD COLUMN pl_partnership_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='pl_packaging_label') THEN
    ALTER TABLE public.content ADD COLUMN pl_packaging_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='pl_packaging_value') THEN
    ALTER TABLE public.content ADD COLUMN pl_packaging_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='pl_sourcing_label') THEN
    ALTER TABLE public.content ADD COLUMN pl_sourcing_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='pl_sourcing_value') THEN
    ALTER TABLE public.content ADD COLUMN pl_sourcing_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='pl_compliance_label') THEN
    ALTER TABLE public.content ADD COLUMN pl_compliance_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='pl_compliance_value') THEN
    ALTER TABLE public.content ADD COLUMN pl_compliance_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_title') THEN
    ALTER TABLE public.content ADD COLUMN fbm_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_amazon_label') THEN
    ALTER TABLE public.content ADD COLUMN fbm_amazon_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_amazon_value') THEN
    ALTER TABLE public.content ADD COLUMN fbm_amazon_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_ebay_label') THEN
    ALTER TABLE public.content ADD COLUMN fbm_ebay_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_ebay_value') THEN
    ALTER TABLE public.content ADD COLUMN fbm_ebay_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_shopify_label') THEN
    ALTER TABLE public.content ADD COLUMN fbm_shopify_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_shopify_value') THEN
    ALTER TABLE public.content ADD COLUMN fbm_shopify_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_packlink_label') THEN
    ALTER TABLE public.content ADD COLUMN fbm_packlink_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_packlink_value') THEN
    ALTER TABLE public.content ADD COLUMN fbm_packlink_value TEXT;
  END IF;

  -- FBM Shipping Rates
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_shipping_title') THEN
    ALTER TABLE public.content ADD COLUMN fbm_shipping_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_shipping_subtitle') THEN
    ALTER TABLE public.content ADD COLUMN fbm_shipping_subtitle TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_starter_tier') THEN
    ALTER TABLE public.content ADD COLUMN fbm_starter_tier TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_growth_tier') THEN
    ALTER TABLE public.content ADD COLUMN fbm_growth_tier TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_enterprise_tier') THEN
    ALTER TABLE public.content ADD COLUMN fbm_enterprise_tier TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_order_unit') THEN
    ALTER TABLE public.content ADD COLUMN fbm_order_unit TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_charges_title') THEN
    ALTER TABLE public.content ADD COLUMN fbm_charges_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_charge1') THEN
    ALTER TABLE public.content ADD COLUMN fbm_charge1 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='fbm_charge2') THEN
    ALTER TABLE public.content ADD COLUMN fbm_charge2 TEXT;
  END IF;

  -- Transport Pricing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_title') THEN
    ALTER TABLE public.content ADD COLUMN transport_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_subtitle') THEN
    ALTER TABLE public.content ADD COLUMN transport_subtitle TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_fr_label') THEN
    ALTER TABLE public.content ADD COLUMN transport_fr_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_fr_value') THEN
    ALTER TABLE public.content ADD COLUMN transport_fr_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_fr_via') THEN
    ALTER TABLE public.content ADD COLUMN transport_fr_via TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_int_label') THEN
    ALTER TABLE public.content ADD COLUMN transport_int_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_int_value') THEN
    ALTER TABLE public.content ADD COLUMN transport_int_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_indicative') THEN
    ALTER TABLE public.content ADD COLUMN transport_indicative TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_special_title') THEN
    ALTER TABLE public.content ADD COLUMN transport_special_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_special_label') THEN
    ALTER TABLE public.content ADD COLUMN transport_special_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_special_value') THEN
    ALTER TABLE public.content ADD COLUMN transport_special_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='transport_special_via') THEN
    ALTER TABLE public.content ADD COLUMN transport_special_via TEXT;
  END IF;

  -- Storage Section
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_warehouse_title') THEN
    ALTER TABLE public.content ADD COLUMN storage_warehouse_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_pallet_label') THEN
    ALTER TABLE public.content ADD COLUMN storage_pallet_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_pickpack_label') THEN
    ALTER TABLE public.content ADD COLUMN storage_pickpack_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_pickpack_value') THEN
    ALTER TABLE public.content ADD COLUMN storage_pickpack_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_special_title') THEN
    ALTER TABLE public.content ADD COLUMN storage_special_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_climate_label') THEN
    ALTER TABLE public.content ADD COLUMN storage_climate_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_hazardous_label') THEN
    ALTER TABLE public.content ADD COLUMN storage_hazardous_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_hazardous_value') THEN
    ALTER TABLE public.content ADD COLUMN storage_hazardous_value TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_highvalue_label') THEN
    ALTER TABLE public.content ADD COLUMN storage_highvalue_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='storage_highvalue_value') THEN
    ALTER TABLE public.content ADD COLUMN storage_highvalue_value TEXT;
  END IF;

  -- Calculator Section
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_title') THEN
    ALTER TABLE public.content ADD COLUMN calculator_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_subtitle') THEN
    ALTER TABLE public.content ADD COLUMN calculator_subtitle TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_units_label') THEN
    ALTER TABLE public.content ADD COLUMN calculator_units_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_fbm_label') THEN
    ALTER TABLE public.content ADD COLUMN calculator_fbm_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_pallets_label') THEN
    ALTER TABLE public.content ADD COLUMN calculator_pallets_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_select_label') THEN
    ALTER TABLE public.content ADD COLUMN calculator_select_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_service1') THEN
    ALTER TABLE public.content ADD COLUMN calculator_service1 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_service2') THEN
    ALTER TABLE public.content ADD COLUMN calculator_service2 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_service3') THEN
    ALTER TABLE public.content ADD COLUMN calculator_service3 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_total_label') THEN
    ALTER TABLE public.content ADD COLUMN calculator_total_label TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='calculator_button_text') THEN
    ALTER TABLE public.content ADD COLUMN calculator_button_text TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='content' AND column_name='shipping_cartons_label') THEN
    ALTER TABLE public.content ADD COLUMN shipping_cartons_label TEXT;
  END IF;
END $$;

-- Update the existing row with default values for the new columns
UPDATE public.content
SET
  services_title = 'Complete Amazon FBA Prep Services & Pricing',
  services_subtitle = 'Professional Amazon FBA prep services in France with competitive pricing. Professional reception, quality control inspection, FNSKU labeling, polybagging & fast shipping to European Amazon fulfillment centers.',
  bonus_title = 'New Customer Bonus',
  bonus_subtitle1 = 'First 2 months: {new_customer_rate}/product (instead of {standard_rate}) + Free setup consultation',
  bonus_subtitle2 = 'Plus: 100 FREE FNSKU labels when you exceed 1000 units in any calendar month',
  fba_reception = 'Reception & visual inspection',
  fba_polybagging = 'Professional polybagging',
  fba_labeling = 'FNSKU labeling',
  fba_dunnage = 'Dunnage protection',
  fba_rate_label = 'Standard Rate',
  fba_unit_label = 'per product',
  fba_new_customer_label = 'New customers: {new_customer_rate}',
  pl_partnership_title = 'Private Label Partnership',
  pl_packaging_label = 'Custom Packaging Design',
  pl_packaging_value = 'Custom Quote',
  pl_sourcing_label = 'Product Sourcing Consultation',
  pl_sourcing_value = 'Free',
  pl_compliance_label = 'Brand Compliance Check',
  pl_compliance_value = '€0.20 / unit',
  fbm_title = 'Multi-Platform FBM',
  fbm_amazon_label = 'Amazon FBM Orders',
  fbm_amazon_value = '€1.30 / order (cartons included)',
  fbm_ebay_label = 'eBay Integration',
  fbm_ebay_value = '€1.30 / order (cartons included)',
  fbm_shopify_label = 'Shopify/Website Orders',
  fbm_shopify_value = '€1.30 / order (cartons included)',
  fbm_packlink_label = 'Shipping via PackLink',
  fbm_packlink_value = 'automatic data integration for labels & courier pickup',
  fbm_shipping_title = 'FBM Shipping Rates',
  fbm_shipping_subtitle = 'Competitive rates based on your monthly volume',
  fbm_starter_tier = '0-999 units/month',
  fbm_growth_tier = '1000-1999 units/month',
  fbm_enterprise_tier = '2000+ units/month',
  fbm_order_unit = 'per order',
  fbm_charges_title = 'Additional FBM Charges:',
  fbm_charge1 = 'Multi-product parcels >2kg: +€0.10/extra product',
  fbm_charge2 = 'Single products >3kg: Custom pricing',
  transport_title = 'FBM Transport Pricing',
  transport_subtitle = 'FBM Package Shipping Rates',
  transport_fr_label = 'Delivery in France (<2kg)',
  transport_fr_value = '€5.25',
  transport_fr_via = 'Via Colissimo',
  transport_int_label = 'International delivery (<3kg)',
  transport_int_value = '€10.60',
  transport_indicative = 'These prices are indicative',
  transport_special_title = 'Specialized Transport:',
  transport_special_label = 'Dangerous goods (max 60x40x40cm, 20kg)',
  transport_special_value = '€12.40',
  transport_special_via = 'Via UPS - 24h delivery',
  storage_warehouse_title = 'Warehouse Storage',
  storage_pallet_label = 'Pallet Storage',
  storage_pickpack_label = 'Pick & Pack',
  storage_pickpack_value = '€1.00 / order',
  storage_special_title = 'Specialized Storage',
  storage_climate_label = 'Climate Controlled',
  storage_hazardous_label = 'Hazardous Materials',
  storage_hazardous_value = 'Custom Pricing',
  storage_highvalue_label = 'High-Value Items',
  storage_highvalue_value = 'Custom Pricing',
  calculator_title = 'Get a Custom Quote',
  calculator_subtitle = 'Calculate your estimated costs based on your needs',
  calculator_units_label = 'Number of Units (for FNSKU Labeling)',
  calculator_fbm_label = 'Number of FBM Orders per Month',
  calculator_pallets_label = 'Number of Pallets for Storage',
  calculator_select_label = 'Select Services:',
  calculator_service1 = 'FNSKU Labeling',
  calculator_service2 = 'FBM Shipping',
  calculator_service3 = 'Storage',
  calculator_total_label = 'Estimated Total Cost:',
  calculator_button_text = 'Request a Quote'
  shipping_cartons_label = 'Shipping Cartons (60×40×40 cm, double wall, heavy-duty)'
WHERE id = '00000000-0000-0000-0000-000000000001';
