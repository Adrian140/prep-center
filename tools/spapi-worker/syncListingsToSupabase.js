import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';
import { sanitizeText } from './syncInventoryToSupabase.js';
import { gunzipSync } from 'zlib';
import { TextDecoder } from 'util';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const LISTING_REPORT_TYPE = 'GET_MERCHANT_LISTINGS_ALL_DATA';
// Amazon reports pot dura mai mult; permitem timeout configurabil.
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 10_000); // ms
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 300); // 300 * 10s ≈ 50 min

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
      .select('seller_id, refresh_token, marketplace_ids')
      .in('seller_id', sellerIds);
    if (tokensError) throw tokensError;
    (tokens || []).forEach((t) => {
      if (t.seller_id) {
        tokenMap.set(t.seller_id, {
          refresh_token: t.refresh_token,
          marketplace_ids: Array.isArray(t.marketplace_ids) ? t.marketplace_ids.filter(Boolean) : null
        });
      }
    });
  }

  const withTokens = integrations
    .map((row) => {
      const token = row.selling_partner_id ? tokenMap.get(row.selling_partner_id) : null;
      const allowedMarketplaces =
        token?.marketplace_ids && token.marketplace_ids.length ? token.marketplace_ids : null;
      if (allowedMarketplaces && !allowedMarketplaces.includes(row.marketplace_id)) {
        return null;
      }
      const refresh =
        token?.refresh_token || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null;
      return refresh
        ? {
            ...row,
            marketplace_ids: allowedMarketplaces,
            refresh_token: refresh
          }
        : null;
    })
    .filter(Boolean);

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
  throw new Error(
    `Timed out waiting for Amazon listing report ${reportId} after ${REPORT_POLL_LIMIT * REPORT_POLL_INTERVAL / 1000}s`
  );
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
  let buffer = Buffer.from(arrayBuffer);

  // Amazon poate furniza documentul GZIP; decomprimăm dacă este cazul.
  if (document.compressionAlgorithm === 'GZIP') {
    buffer = gunzipSync(buffer);
  }

  // Decodare: încercăm UTF-8, iar dacă apar multe caractere de înlocuire, facem fallback la latin1.
  const utf8 = buffer.toString('utf-8');
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 10) {
    // Fallback la latin1 în caz de raport livrat ISO-8859-1.
    const latin1Decoder = new TextDecoder('latin1');
    return latin1Decoder.decode(buffer);
  }
  return utf8;
}

const LISTING_COLUMN_ALIASES = new Map([
  ['seller-sku', 'sku'],
  ['sku-vendeur', 'sku'],
  ['sku-vend***r', 'sku'],
  ['sku', 'sku'],
  ['asin', 'asin'],
  ['asin1', 'asin'],
  ['item-name', 'name'],
  ['nom-produit', 'name'],
  ['image-url', 'imageUrl'],
  ['image', 'imageUrl'],
  ['primary-image-url', 'imageUrl'],
  ['status', 'status'],
  ['item-status', 'status'],
  ['état', 'status'],
  ['etat', 'status'],
  ['fulfillment-channel', 'fulfillmentChannel'],
  ['canal-traitement', 'fulfillmentChannel'],
  ['product-id', 'productId'],
  ['id-produit', 'productId'],
  ['product-id-type', 'productIdType'],
  ['type-id-produit', 'productIdType']
]);

function parseListingRows(tsvText) {
  const cleanText = (tsvText || '').replace(/^\uFEFF/, '');
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ''))
    .filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headerLine = lines.shift();
  const guessDelimiter = (line) => {
    if (line.includes('\t')) return '\t';
    if (line.includes(';')) return ';';
    return ','; // fallback CSV
  };
  const delimiter = guessDelimiter(headerLine);
  const splitColumns = (line) => {
    const regex =
      delimiter === '\t'
        ? /\t(?=(?:(?:[^"]*"){2})*[^"]*$)/
        : delimiter === ';'
        ? /;(?=(?:(?:[^"]*"){2})*[^"]*$)/
        : /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    return line.split(regex).map((part) => part.replace(/^"|"$/g, '').trim());
  };

  const headers = splitColumns(headerLine).map(
    (header) =>
      LISTING_COLUMN_ALIASES.get(header.trim().toLowerCase()) ||
      header.trim().toLowerCase()
  );

  return lines.map((line) => {
    const cols = splitColumns(line);
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
    // cerință: trebuie să existe cel puțin un identificator (SKU sau ASIN)
    if (!sku && !asin) continue;

    normalized.push({
      key: (sku || asin).toLowerCase(),
      sku: sku || null,
      asin: asin || null,
      name: sanitizeText(row.name) || null,
      imageUrl: (row.imageUrl || '').trim() || null,
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

const isCorruptedName = (name) => {
  if (!name) return false;
  return String(name).includes('\uFFFD');
};

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
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({ ...row }));
    if (!chunk.length) continue;
    const { error } = await supabase
      .from('stock_items')
      // ignorăm complet liniile care există deja (nu vrem să atingem stoc/poze)
      .insert(chunk, { ignoreDuplicates: true });
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
      if (listingRaw.length) {
        const sample = listingRaw.slice(0, 3);
        console.log('[Listings sync] sample headers', Object.keys(listingRaw[0] || {}));
        console.log('[Listings sync] sample rows', sample);
      }
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
    const asinAssetsToInsert = new Map();
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
        const needsNameReplace = isCorruptedName(row.name);
        if ((!hasExistingName || needsNameReplace) && hasIncomingName) {
          patch.name = listing.name;
          shouldPatch = true;
        }
        const cachedImage = listing.asin
          ? asinImageCache.get(listing.asin.trim().toUpperCase()) || null
          : null;
        const hasExistingImage = row.image_url && String(row.image_url).trim().length > 0;
        const incomingImage = listing.imageUrl || cachedImage;
        if (!hasExistingImage && incomingImage) {
          patch.image_url = incomingImage;
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
          const incomingSku = listing.sku && String(listing.sku).trim();
          const hasExistingName = r.name && String(r.name).trim().length > 0;
          const hasIncomingName = listing.name && String(listing.name).trim().length > 0;
          const hasExistingImage = r.image_url && String(r.image_url).trim().length > 0;
          const cachedImage = listing.imageUrl || asinImageCache.get(asinKey) || null;
          const patch = {
            id: r.id,
            company_id: r.company_id,
            sku: r.sku,
            asin: r.asin
          };
          let shouldPatch = false;
          // Dacă rândul din stoc nu are SKU, dar raportul Amazon îl are, îl completăm.
          if ((!r.sku || !String(r.sku).trim()) && incomingSku) {
            patch.sku = incomingSku;
            shouldPatch = true;
          }
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
            image_url: listing.imageUrl
              || (listing.asin
                ? asinImageCache.get(listing.asin.trim().toUpperCase()) || null
                : null)
          });
        }
      }
      // colectăm poze din listings pentru cache asin_assets dacă nu avem deja
      if (listing.asin && listing.imageUrl) {
        const asinKey = listing.asin.trim().toUpperCase();
        if (!asinImageCache.has(asinKey) && !asinAssetsToInsert.has(asinKey)) {
          asinAssetsToInsert.set(asinKey, listing.imageUrl);
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

    if (asinAssetsToInsert.size) {
      const now = new Date().toISOString();
      const payload = Array.from(asinAssetsToInsert.entries()).map(([asin, url]) => ({
        asin,
        image_urls: [url],
        source: 'listing_report',
        fetched_at: now,
        updated_at: now
      }));
      const { error: asinInsertError } = await supabase
        .from('asin_assets')
        .insert(payload, { ignoreDuplicates: true });
      if (asinInsertError) {
        console.warn(`[Listings sync] failed to cache listing images in asin_assets: ${asinInsertError.message}`);
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
