import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';
import { sanitizeText } from './syncInventoryToSupabase.js';
import { gunzipSync } from 'zlib';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const LISTING_REPORT_TYPE = 'GET_MERCHANT_LISTINGS_ALL_DATA';
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 4000);
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 60);

const MAX_INTEGRATIONS_PER_RUN = Number(
  process.env.SPAPI_LISTING_MAX_INTEGRATIONS_PER_RUN ||
    process.env.SPAPI_MAX_INTEGRATIONS_PER_RUN ||
    20
);

function assertBaseEnv() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE) missing.push('SUPABASE_SERVICE_ROLE');
  if (!process.env.SPAPI_LWA_CLIENT_ID) missing.push('SPAPI_LWA_CLIENT_ID');
  if (!process.env.SPAPI_LWA_CLIENT_SECRET) missing.push('SPAPI_LWA_CLIENT_SECRET');
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.SPAPI_ROLE_ARN) missing.push('SPAPI_ROLE_ARN');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function singleModeIntegration() {
  if (
    process.env.SUPABASE_STOCK_COMPANY_ID &&
    process.env.SUPABASE_STOCK_USER_ID &&
    process.env.SPAPI_REFRESH_TOKEN
  ) {
    return [
      {
        id: 'single-mode',
        company_id: process.env.SUPABASE_STOCK_COMPANY_ID,
        user_id: process.env.SUPABASE_STOCK_USER_ID,
        marketplace_id: process.env.SPAPI_MARKETPLACE_ID || DEFAULT_MARKETPLACE,
        region: process.env.SPAPI_REGION || 'eu',
        refresh_token: process.env.SPAPI_REFRESH_TOKEN,
        status: 'active'
      }
    ];
  }
  return null;
}

async function fetchActiveIntegrations() {
  const single = singleModeIntegration();
  if (single) return single;

  const filterMarketplace = process.env.SPAPI_LISTING_MARKETPLACE_ID || null;

  let query = supabase
    .from('amazon_integrations')
    .select(
      'id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, status, last_synced_at'
    )
    .eq('status', 'active');

  if (filterMarketplace) {
    query = query.eq('marketplace_id', filterMarketplace);
  }

  const { data, error } = await query.order('last_synced_at', {
    ascending: true
  });

  if (error) throw error;

  const integrations = data || [];
  const sellerIds = integrations
    .map((row) => row.selling_partner_id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  const tokenMap = new Map();
  if (sellerIds.length) {
    const { data: tokens, error: tokensError } = await supabase
      .from('seller_tokens')
      .select('seller_id, refresh_token')
      .in('seller_id', sellerIds);
    if (tokensError) throw tokensError;
    (tokens || []).forEach((t) => {
      if (t.seller_id && t.refresh_token) {
        tokenMap.set(t.seller_id, t.refresh_token);
      }
    });
  }

  const withTokens = integrations
    .map((row) => ({
      ...row,
      refresh_token:
        tokenMap.get(row.selling_partner_id) ||
        row.refresh_token ||
        process.env.SPAPI_REFRESH_TOKEN ||
        null
    }))
    .filter((row) => !!row.refresh_token);

  if (withTokens.length <= MAX_INTEGRATIONS_PER_RUN) {
    return withTokens;
  }
  return withTokens.slice(0, MAX_INTEGRATIONS_PER_RUN);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createListingReport(spClient, marketplaceId) {
  const body = {
    reportType: LISTING_REPORT_TYPE,
    marketplaceIds: [marketplaceId]
  };

  const response = await spClient.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body
  });

  if (!response?.reportId) {
    throw new Error('Failed to create listing report');
  }

  return response.reportId;
}

async function waitForReport(spClient, reportId) {
  for (let attempt = 0; attempt < REPORT_POLL_LIMIT; attempt += 1) {
    const report = await spClient.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId }
    });

    if (!report) throw new Error('Empty response when polling report status');

    switch (report.processingStatus) {
      case 'DONE':
        return report.reportDocumentId;
      case 'FATAL':
      case 'CANCELLED':
        throw new Error(`Amazon report failed with status ${report.processingStatus}`);
      case 'DONE_NO_DATA':
        throw new Error('Amazon listing report completed without data');
      default:
        await delay(REPORT_POLL_INTERVAL);
    }
  }
  throw new Error('Timed out waiting for Amazon listing report to finish');
}

async function downloadReportDocument(spClient, reportDocumentId) {
  const document = await spClient.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId }
  });

  if (!document?.url) throw new Error('Listing report document missing download URL');

  const fetchImpl =
    globalThis.fetch || (await import('node-fetch').then((mod) => mod.default));
  const response = await fetchImpl(document.url);
  if (!response.ok) {
    throw new Error(`Failed to download listing report document (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Amazon poate furniza documentul GZIP; decomprimăm dacă este cazul.
  if (document.compressionAlgorithm === 'GZIP') {
    return gunzipSync(buffer).toString('utf-8');
  }

  return buffer.toString('utf-8');
}

const LISTING_COLUMN_ALIASES = new Map([
  ['seller-sku', 'sku'],
  ['sku', 'sku'],
  ['asin', 'asin'],
  ['asin1', 'asin'],
  ['item-name', 'name'],
  ['status', 'status'],
  ['item-status', 'status'],
  ['fulfillment-channel', 'fulfillmentChannel'],
  ['product-id', 'productId'],
  ['product-id-type', 'productIdType']
]);

function parseListingRows(tsvText) {
  const lines = tsvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headers = lines
    .shift()
    .split('\t')
    .map(
      (header) =>
        LISTING_COLUMN_ALIASES.get(header.trim().toLowerCase()) ||
        header.trim().toLowerCase()
    );

  return lines.map((line) => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx];
    });
    return row;
  });
}

function normalizeListings(rawRows = []) {
  const normalized = [];
  for (const row of rawRows) {
    const sku = (row.sku || '').trim();
    let asin = (row.asin || '').trim();
    // fallback: dacă ASIN lipsește, încearcă product-id când tipul este ASIN
    if (!asin && row.productId) {
      const type = String(row.productIdType || '').trim();
      if (!type || type.toUpperCase() === 'ASIN' || type === '1') {
        asin = String(row.productId).trim();
      }
    }
    // cerință: trebuie să existe ASIN; SKU poate lipsi (folosim ASIN pentru completare titlu)
    if (!asin) continue;

    normalized.push({
      key: (sku || asin).toLowerCase(),
      sku: sku || null,
      asin: asin || null,
      name: sanitizeText(row.name) || null,
      status: (row.status || '').trim(),
      fulfillmentChannel: (row.fulfillmentChannel || '').trim()
    });
  }
  return normalized;
}

function filterListings(listings = []) {
  return listings.filter((row) => {
    const status = (row.status || '').toLowerCase();
    const denyList = ['blocked', 'suppressed', 'closed', 'deleted', 'stranded'];
    if (denyList.some((token) => status.includes(token))) return false;
    const wantedStatus =
      status.startsWith('active') ||
      status.includes('out of stock') ||
      status.includes('inactive');
    return wantedStatus;
  });
}

function keyFromRow(row) {
  const sku = row?.sku ? String(row.sku).toLowerCase() : '';
  const asin = row?.asin ? String(row.asin).toLowerCase() : '';
  return sku || asin || null;
}

async function fetchListingRows(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  const reportId = await createListingReport(spClient, marketplaceId);
  const documentId = await waitForReport(spClient, reportId);
  const documentText = await downloadReportDocument(spClient, documentId);
  return parseListingRows(documentText);
}

async function insertListingRows(rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => {
      const payload = { ...row };
      return payload;
    });
    if (!chunk.length) continue;
    const { error } = await supabase
      .from('stock_items')
      .insert(chunk, { defaultToNull: false });
    if (error) throw error;
  }
}

async function syncListingsIntegration(integration) {
  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing LISTINGS for integration ${integration.id} (company ${integration.company_id}, marketplace ${integration.marketplace_id})`
  );

  try {
    const listingRaw = await fetchListingRows(
      spClient,
      integration.marketplace_id || DEFAULT_MARKETPLACE
    );
    const normalized = normalizeListings(listingRaw);
    const listingRows = filterListings(normalized);

    const emptySku = listingRaw.filter((r) => !String(r.sku || '').trim()).length;
    const emptyAsin = listingRaw.filter((r) => !String(r.asin || '').trim() && !String(r.productId || '').trim()).length;
    console.log(
      `[Listings sync] ${integration.id} raw=${listingRaw.length} normalized=${normalized.length} filtered=${listingRows.length} emptySku=${emptySku} emptyAsin=${emptyAsin}`
    );

    if (!listingRows.length) {
      console.log(
        `No listing rows returned for integration ${integration.id}. Nothing to do.`
      );
      await supabase
        .from('amazon_integrations')
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq('id', integration.id);
      return;
    }

    const { data: existing, error } = await supabase
      .from('stock_items')
      .select('id, company_id, user_id, sku, asin, name, image_url')
      .eq('company_id', integration.company_id);
    if (error) throw error;

    const existingByKey = new Map();
    const existingByAsin = new Map(); // pentru completare titlu/poza pe toate SKU-urile cu același ASIN
    (existing || []).forEach((row) => {
      const key = keyFromRow(row);
      if (key) existingByKey.set(key, row);
      const asinKey = row?.asin ? String(row.asin).toUpperCase() : '';
      if (asinKey) {
        if (!existingByAsin.has(asinKey)) existingByAsin.set(asinKey, []);
        existingByAsin.get(asinKey).push(row);
      }
    });

    // Cache imagini din asin_assets pentru atașare instant la insert
    const asinSet = new Set();
    listingRows.forEach((row) => {
      const asin = row.asin ? row.asin.trim() : '';
      if (asin) asinSet.add(asin.toUpperCase());
    });
    const asinImageCache = new Map();
    if (asinSet.size) {
      const { data: cached, error: cacheError } = await supabase
        .from('asin_assets')
        .select('asin, image_urls')
        .in('asin', Array.from(asinSet));
      if (cacheError) {
        console.warn(`[Listings sync] asin_assets cache failed: ${cacheError.message}`);
      } else {
        (cached || []).forEach((row) => {
          const urls = Array.isArray(row.image_urls) ? row.image_urls : [];
          const first = urls.find((u) => typeof u === 'string' && u.trim().length > 0);
          if (first) asinImageCache.set((row.asin || '').toUpperCase(), first);
        });
      }
    }

    const seen = new Set();
    const inserts = [];
    const updates = [];
    // Regula: nu rescriem rândurile existente, dar completăm titlul/poza dacă lipsesc.

    for (const listing of listingRows) {
      if (!listing.key || seen.has(listing.key)) continue;
      seen.add(listing.key);

      const row = existingByKey.get(listing.key);
      if (row) {
        const patch = {
          id: row.id,
          company_id: row.company_id,
          sku: row.sku,
          asin: row.asin
        };
        let shouldPatch = false;
        const hasIncomingName = listing.name && String(listing.name).trim().length > 0;
        const hasExistingName = row.name && String(row.name).trim().length > 0;
        if (!hasExistingName && hasIncomingName) {
          patch.name = listing.name;
          shouldPatch = true;
        }
        const cachedImage = listing.asin
          ? asinImageCache.get(listing.asin.trim().toUpperCase()) || null
          : null;
        const hasExistingImage = row.image_url && String(row.image_url).trim().length > 0;
        if (!hasExistingImage && cachedImage) {
          patch.image_url = cachedImage;
          shouldPatch = true;
        }
        if (shouldPatch) updates.push(patch);
        continue;
      }
      // Dacă nu găsim pereche ASIN+SKU, dar există rânduri cu același ASIN și nume lipsă, completăm titlul lor.
      const asinKey = listing.asin ? listing.asin.trim().toUpperCase() : '';
      if (asinKey && existingByAsin.has(asinKey)) {
        const rowsForAsin = existingByAsin.get(asinKey) || [];
        rowsForAsin.forEach((r) => {
          const hasExistingName = r.name && String(r.name).trim().length > 0;
          const hasIncomingName = listing.name && String(listing.name).trim().length > 0;
          const hasExistingImage = r.image_url && String(r.image_url).trim().length > 0;
          const cachedImage = asinImageCache.get(asinKey) || null;
          const patch = {
            id: r.id,
            company_id: r.company_id,
            sku: r.sku,
            asin: r.asin
          };
          let shouldPatch = false;
          if (!hasExistingName && hasIncomingName) {
            patch.name = listing.name;
            shouldPatch = true;
          }
          if (!hasExistingImage && cachedImage) {
            patch.image_url = cachedImage;
            shouldPatch = true;
          }
          if (shouldPatch) updates.push(patch);
        });
      } else {
        // Inserăm doar dacă avem și ASIN, și SKU
        if (listing.asin && listing.sku) {
          inserts.push({
            company_id: integration.company_id,
            user_id: integration.user_id,
            asin: listing.asin || null,
            sku: listing.sku || null,
            name: listing.name || listing.asin || listing.sku,
            qty: 0,
            image_url: listing.asin
              ? asinImageCache.get(listing.asin.trim().toUpperCase()) || null
              : null
          });
        }
      }
    }

    await insertListingRows(inserts);

    if (updates.length) {
      const chunkSize = 500;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const { error: updateError } = await supabase
          .from('stock_items')
          .upsert(chunk, { defaultToNull: false, onConflict: 'company_id,sku,asin' });
        if (updateError) throw updateError;
      }
    }

    await supabase
      .from('amazon_integrations')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id);

    console.log(
      `Listings integration ${integration.id} synced (${inserts.length} new rows from ${listingRows.length} listing rows).`
    );
  } catch (err) {
    console.error(
      `Listings sync failed for integration ${integration.id}:`,
      err?.response?.data || err
    );
    await supabase
      .from('amazon_integrations')
      .update({ last_error: err?.message || String(err) })
      .eq('id', integration.id);
  }
}

async function main() {
  assertBaseEnv();
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('No active amazon_integrations found for listings. Nothing to do.');
    return;
  }

  for (const integration of integrations) {
    await syncListingsIntegration(integration);
  }

  console.log('All listing integrations processed ✅');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Listings sync failed:', err?.response?.data || err);
    process.exit(1);
  });
}
