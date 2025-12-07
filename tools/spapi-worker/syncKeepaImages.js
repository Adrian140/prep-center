import 'dotenv/config';
import fs from 'node:fs';
import { supabase } from './supabaseClient.js';
import { getKeepaMainImage } from './keepaClient.js';

const ITEMS_PER_RUN = Number(
  process.env.KEEPA_ITEMS_PER_RUN || process.env.VITE_KEEPA_ITEMS_PER_RUN || 30
);
const ITEMS_PER_COMPANY = Number(
  process.env.KEEPA_ITEMS_PER_COMPANY ||
    process.env.VITE_KEEPA_ITEMS_PER_COMPANY ||
    0
);
const MAX_KEEPA_RETRIES = Number(
  process.env.KEEPA_MAX_RETRIES || process.env.VITE_KEEPA_MAX_RETRIES || 3
);
const KEEPA_RETRY_DELAY_MS = Number(
  process.env.KEEPA_RETRY_DELAY_MS || process.env.VITE_KEEPA_RETRY_DELAY_MS || 5000
);
const KEEPA_BACKOFF_MS = Number(
  process.env.KEEPA_BACKOFF_MS || process.env.VITE_KEEPA_BACKOFF_MS || 60 * 60 * 1000
);
const MAX_KEEPA_RETRIES = Number(
  process.env.KEEPA_MAX_RETRIES || process.env.VITE_KEEPA_MAX_RETRIES || 3
);
const KEEPA_RETRY_DELAY_MS = Number(
  process.env.KEEPA_RETRY_DELAY_MS || process.env.VITE_KEEPA_RETRY_DELAY_MS || 5000
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
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, asin')
    .eq('company_id', companyId)
    .is('image_url', null)
    .or(`keepa_retry_at.is.null,keepa_retry_at.lte.${nowIso}`)
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).filter((row) => row.asin);
}

async function syncKeepaImages() {
  assertEnv();

  try {
    await runSync();
  } catch (err) {
    const message = String(err?.message || err || '');
    console.error('[Keepa sync] Unhandled error inside run:', message);
    writeOutputs({ processed: 0, limitReached: false });
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchKeepaImageWithRetries(asin) {
  let attempts = 0;
  while (attempts <= MAX_KEEPA_RETRIES) {
    const res = await getKeepaMainImage({ asin });
    if (res?.error) {
      console.warn(`[Keepa sync] Keepa error for asin=${asin}: ${res.error}`);
      if (/keepa api error \(429\)/i.test(res.error)) {
        attempts += 1;
        if (attempts > MAX_KEEPA_RETRIES) {
          return null;
        }
        console.warn(
          `[Keepa sync] Rate limited for asin=${asin}, waiting ${KEEPA_RETRY_DELAY_MS}ms (attempt ${attempts}/${MAX_KEEPA_RETRIES}).`
        );
        await sleep(KEEPA_RETRY_DELAY_MS);
        continue;
      }
    }
    return res?.image || null;
  }
  return null;
}

async function backoffRows(companyId, rowIds) {
  if (!rowIds.length) return;
  const lockUntil = new Date(Date.now() + KEEPA_BACKOFF_MS).toISOString();
  const { error } = await supabase
    .from('stock_items')
    .update({ keepa_retry_at: lockUntil })
    .in('id', rowIds)
    .eq('company_id', companyId)
    .is('image_url', null);
  if (error) {
    console.warn(
      `[Keepa sync] Failed to mark rows for backoff company=${companyId}: ${error.message}`
    );
  }
}

async function runSync() {

  const companyLimitDescriptor =
    ITEMS_PER_COMPANY > 0 ? `${ITEMS_PER_COMPANY}` : 'no explicit limit (run cap applies)';
  console.log(
    `[Keepa sync] Starting run with max ${ITEMS_PER_RUN} items (per company ${companyLimitDescriptor}).`
  );

  const companyIds = await fetchActiveCompanyIds();
  if (!companyIds.length) {
    console.log('[Keepa sync] No active companies with integrations.');
    writeOutputs({ processed: 0, limitReached: false });
    return;
  }

  let processed = 0;

  for (const companyId of companyIds) {
    if (processed >= ITEMS_PER_RUN) break;
    let processedForCompany = 0;

    const companyLimit =
      ITEMS_PER_COMPANY > 0 ? ITEMS_PER_COMPANY : ITEMS_PER_RUN;
    let skipCompany = false;

    while (
      processed < ITEMS_PER_RUN &&
      processedForCompany < companyLimit
    ) {
      const remainingForRun = ITEMS_PER_RUN - processed;
      const remainingForCompany = companyLimit - processedForCompany;
      const batchLimit = Math.min(remainingForRun, remainingForCompany);
      if (batchLimit <= 0) break;

      const rows = await fetchMissingImageRows(companyId, batchLimit);
      if (!rows.length) break;

      console.log(
        `[Keepa sync] Company ${companyId} – processing ${rows.length} items (run ${processed + processedForCompany}/${ITEMS_PER_RUN}, company ${processedForCompany}/${companyLimit}).`
      );

      let fetchedImagesThisBatch = 0;
      const attemptedRowIds = [];

      for (const row of rows) {
        if (processed >= ITEMS_PER_RUN || processedForCompany >= companyLimit) {
          break;
        }
        attemptedRowIds.push(row.id);

        try {
          const { data: cache } = await supabase
            .from('asin_assets')
            .select('image_urls')
            .eq('asin', row.asin)
            .maybeSingle();
          let imageFromCache = null;
          const urls = cache?.image_urls;
          if (Array.isArray(urls) && urls.length) {
            imageFromCache =
              urls.find((u) => typeof u === 'string' && u.trim().length > 0) ||
              null;
          }
          let image = imageFromCache;
          if (!image) {
            console.log(
              `[Keepa sync] Fetching image for company=${companyId}, stock_item=${row.id}, asin=${row.asin}`
            );
            image = await fetchKeepaImageWithRetries(row.asin);
          }
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

          const { error: cacheError } = await supabase
            .from('asin_assets')
            .upsert({
              asin: row.asin,
              image_urls: [image],
              source: 'keepa',
              fetched_at: new Date().toISOString()
            });
          if (cacheError) {
            console.warn(
              `[Keepa sync] Cache upsert failed for asin=${row.asin}: ${cacheError.message}`
            );
          }

          processed += 1;
          processedForCompany += 1;
          fetchedImagesThisBatch += 1;
        } catch (err) {
          const message = String(err?.message || err || '');
          console.error(
            `[Keepa sync] Failed for company=${companyId}, stock_item=${row.id}, asin=${row.asin}: ${message}`
          );
          if (
            /tokens? low/i.test(message) ||
            /keepa api error \(429\)/i.test(message)
          ) {
            console.warn(
              '[Keepa sync] Keepa tokens low or rate limited (429) – stopping sync run early.'
            );
            writeOutputs({ processed, limitReached: processed >= ITEMS_PER_RUN });
            return;
          }
          continue;
        }
        }

      if (fetchedImagesThisBatch === 0 && attemptedRowIds.length) {
        console.log(
          `[Keepa sync] Company ${companyId} returned no images in this batch – skipping to next company.`
        );
        await backoffRows(companyId, attemptedRowIds);
        skipCompany = true;
        break;
      }

      if (processedForCompany >= companyLimit) {
        console.log(
          `[Keepa sync] Company ${companyId} reached per-company limit (${companyLimit}). Moving to next company.`
        );
        break;
      }
    }

    if (skipCompany) {
      continue;
    }
  }

  console.log(
    `[Keepa sync] Completed run. Images updated for ${processed} stock items.`
  );
  writeOutputs({ processed, limitReached: processed >= ITEMS_PER_RUN });
}

syncKeepaImages().catch((err) => {
  console.error('[Keepa sync] Unhandled error:', err);
  writeOutputs({ processed: 0, limitReached: false });
  process.exit(1);
});

function writeOutputs({ processed, limitReached }) {
  if (!process.env.GITHUB_OUTPUT) return;
  try {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `processed=${processed}\nlimit_reached=${limitReached ? 'true' : 'false'}\n`
    );
  } catch (err) {
    console.warn('[Keepa sync] Failed to write step outputs:', err?.message || err);
  }
}
