import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error('Setează SUPABASE_URL și SUPABASE_SERVICE_ROLE în mediul tău.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const companyId = process.argv[2];
if (!companyId) {
  throw new Error('Furnizează company_id ca argument: node showMissingListingDetails.js <company_id>');
}

const RESULT_LIMIT = 200;

const formatRow = (row) =>
  `id=${row.id} sku=${(row.sku || '—').padEnd(20)} asin=${row.asin || 'null'} name="${(row.name || '—').slice(
    0,
    40
  )}" ...`;

const run = async () => {
  const { data: integrations } = await supabase
    .from('amazon_integrations')
    .select('id, marketplace_id, region, selling_partner_id')
    .eq('company_id', companyId)
    .order('marketplace_id');

  console.log(`Integrations for ${companyId}:`);
  (integrations || []).forEach((integration) => {
    console.log(
      `  ${integration.id} -> ${integration.marketplace_id} (${integration.region || '—'}) seller=${integration.selling_partner_id || '—'}`
    );
  });

  const { data: rows } = await supabase
    .from('stock_items')
    .select('id, sku, asin, name, amazon_stock, amazon_inbound, amazon_reserved, amazon_unfulfillable, updated_at')
    .eq('company_id', companyId)
    .or('asin.is.null,name.is.null,name.eq.\'\'')
    .order('updated_at', { ascending: false })
    .limit(RESULT_LIMIT);

  if (!rows || rows.length === 0) {
    console.log('Nu am găsit rânduri fără ASIN sau titlu.');
    return;
  }

  console.log(`\nPrimele ${rows.length} rânduri fără ASIN/titlu (sorted by updated_at desc):`);
  rows.forEach((row) => {
    console.log(formatRow(row));
  });
};

run()
  .catch((err) => {
    console.error('Execuția a eșuat:', err?.message || err);
    process.exit(1);
  })
  .finally(() => {
    process.exit();
  });
