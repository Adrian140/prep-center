import 'dotenv/config';
import { supabase } from './supabaseClient.js';
import { getKeepaMainImage } from './keepaClient.js';

const ITEMS_PER_RUN = Number(
  process.env.KEEPA_ITEMS_PER_RUN || process.env.VITE_KEEPA_ITEMS_PER_RUN || 30
);
const ITEMS_PER_COMPANY = Number(
  process.env.KEEPA_ITEMS_PER_COMPANY ||
    process.env.VITE_KEEPA_ITEMS_PER_COMPANY ||
    10
);

function assertEnv() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE)
    missing.push('SUPABASE_SERVICE_ROLE');
  if (
    !process.env.KEEPA_API_KEY &&
    !process.env.VITE_KEEPA_API_KEY
  ) {
    missing.push('KEEPA_API_KEY');
  }
  if (missing.length) {
    throw new Error(
      `Missing required env vars for Keepa sync: ${missing.join(', ')}`
    );
  }
}

async function fetchActiveCompanyIds() {
  const { data, error } = await supabase
    .from('stock_items')
    .select('company_id')
    .not('company_id', 'is', null)
    .is('image_url', null)
    .limit(10000);
  if (error) throw error;

  const ids = new Set();
  (data || []).forEach((row) => {
    if (row.company_id) ids.add(row.company_id);
  });
  return Array.from(ids);
}

async function fetchMissingImageRows(companyId, limit) {
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, asin')
    .eq('company_id', companyId)
    .is('image_url', null)
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).filter((row) => row.asin);
}

async function syncKeepaImages() {
  assertEnv();

  console.log(
    `[Keepa sync] Starting run with max ${ITEMS_PER_RUN} items (per company ${ITEMS_PER_COMPANY}).`
  );

  const companyIds = await fetchActiveCompanyIds();
  if (!companyIds.length) {
    console.log('[Keepa sync] No active companies with integrations.');
    return;
  }

  let processed = 0;

  for (const companyId of companyIds) {
    if (processed >= ITEMS_PER_RUN) break;

    const remainingBudget = ITEMS_PER_RUN - processed;
    const perCompanyLimit = Math.min(ITEMS_PER_COMPANY, remainingBudget);
    if (perCompanyLimit <= 0) break;

    const rows = await fetchMissingImageRows(companyId, perCompanyLimit);
    if (!rows.length) continue;

    console.log(
      `[Keepa sync] Company ${companyId} – processing up to ${rows.length} items.`
    );

    for (const row of rows) {
      if (processed >= ITEMS_PER_RUN) break;

      try {
        console.log(
          `[Keepa sync] Fetching image for company=${companyId}, stock_item=${row.id}, asin=${row.asin}`
        );
        const { image } = await getKeepaMainImage({ asin: row.asin });
        if (!image) {
          console.log(
            `[Keepa sync] No image returned for asin=${row.asin}, skipping.`
          );
          continue;
        }

        const { error: updateError } = await supabase
          .from('stock_items')
          .update({ image_url: image })
          .eq('id', row.id);
        if (updateError) throw updateError;

        processed += 1;
      } catch (err) {
        const message = String(err?.message || err || '');
        console.error(
          `[Keepa sync] Failed for company=${companyId}, stock_item=${row.id}, asin=${row.asin}: ${message}`
        );
        if (/tokens? low/i.test(message) || /keepa api error \(429\)/i.test(message)) {
          console.warn(
            '[Keepa sync] Keepa tokens low or rate limited (429) – stopping sync run early.'
          );
          return;
        }
      }
    }
  }

  console.log(
    `[Keepa sync] Completed run. Images updated for ${processed} stock items.`
  );
}

syncKeepaImages().catch((err) => {
  console.error('[Keepa sync] Unhandled error:', err);
  process.exit(1);
});
