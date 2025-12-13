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

  const sellerMarketplaceMap = new Map();
  integrations.forEach((row) => {
    if (!row?.selling_partner_id) return;
    if (!sellerMarketplaceMap.has(row.selling_partner_id)) {
      sellerMarketplaceMap.set(row.selling_partner_id, new Set());
    }
    if (row.marketplace_id) {
      sellerMarketplaceMap.get(row.selling_partner_id).add(row.marketplace_id);
    }
  });

  const withTokens = integrations
    .map((row) => {
      const token = row.selling_partner_id ? tokenMap.get(row.selling_partner_id) : null;
      const sellerMarkets = row.selling_partner_id ? sellerMarketplaceMap.get(row.selling_partner_id) : null;
      const mergedSet = new Set(
        (token?.marketplace_ids || []).filter((id) => typeof id === 'string' && id.length > 0)
      );
      if (row.marketplace_id) {
        mergedSet.add(row.marketplace_id);
      }
      sellerMarkets?.forEach((id) => mergedSet.add(id));
      const marketplaceList =
        row.marketplace_id && typeof row.marketplace_id === 'string'
          ? [row.marketplace_id]
          : Array.from(mergedSet);
      const refresh =
        token?.refresh_token || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null;
      return refresh
        ? {
            ...row,
            marketplace_ids: marketplaceList.length ? marketplaceList : null,
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

function resolveMarketplaceId(integration) {
  if (integration?.marketplace_id) {
    return integration.marketplace_id;
  }
  if (Array.isArray(integration?.marketplace_ids) && integration.marketplace_ids.length) {
    return integration.marketplace_ids[0];
  }
  return null;
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
  ['sku-seller', 'sku'],
  ['sku-vendeur', 'sku'],
  ['sku-vend***r', 'sku'],
  ['sku-venditore', 'sku'],
  ['sku-vendedor', 'sku'],
  ['sku vendedor', 'sku'],
  ['sku', 'sku'],
  ['asin', 'asin'],
  ['asin1', 'asin'],
  ['item-name', 'name'],
  ['nom-produit', 'name'],
  ['nome-prodotto', 'name'],
  ['nombre-del-producto', 'name'],
  ['status', 'status'],
  ['item-status', 'status'],
  ['état', 'status'],
  ['etat', 'status'],
  ['estado', 'status'],
  ['estado-producto', 'status'],
  ['estado-del-producto', 'status'],
  ['stato', 'status'],
  ['stato-prodotto', 'status'],
  ['fulfillment-channel', 'fulfillmentChannel'],
  ['canal-traitement', 'fulfillmentChannel'],
  ['canal-de-gestion', 'fulfillmentChannel'],
  ['canal gestion', 'fulfillmentChannel'],
  ['canale-di-evasione', 'fulfillmentChannel'],
  ['product-id', 'productId'],
  ['id-produit', 'productId'],
  ['id-prodotto', 'productId'],
  ['product-id-type', 'productIdType'],
  ['type-id-produit', 'productIdType'],
  ['tipo-id-prodotto', 'productIdType']
]);

const stripDiacritics = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function normalizeHeaderKey(rawHeader) {
  const original = (rawHeader || '').trim().toLowerCase();
  if (!original) return '';
  const repaired = original.replace(/\uFFFD/g, 'e');
  const withoutDiacritics = stripDiacritics(repaired);
  const sanitized = withoutDiacritics.replace(/[^a-z0-9_-]+/g, '');
  return (
    LISTING_COLUMN_ALIASES.get(original) ||
    LISTING_COLUMN_ALIASES.get(repaired) ||
    LISTING_COLUMN_ALIASES.get(withoutDiacritics) ||
    LISTING_COLUMN_ALIASES.get(sanitized) ||
    original
  );
}

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

  const headers = splitColumns(headerLine).map((header) => normalizeHeaderKey(header));

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

    const key = normalizeIdentifier(sku || asin);
    normalized.push({
      key,
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

const normalizeIdentifier = (value) =>
  value && String(value).trim().length
    ? String(value).trim().toLowerCase()
    : '';

const makeCombinationKey = (companyId, sku, asin) => {
  const skuKey = normalizeIdentifier(sku);
  const asinKey = normalizeIdentifier(asin);
  if (!companyId) return null;
  if (!skuKey && !asinKey) return null;
  return `${companyId}::${skuKey}::${asinKey}`;
};

function keyFromRow(row) {
  const sku = normalizeIdentifier(row?.sku);
  const asin = normalizeIdentifier(row?.asin);
  return sku || asin || null;
}

const isCorruptedName = (name) => {
  if (!name) return false;
  return String(name).includes('\uFFFD');
};

async function fetchListingRows(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  if (!marketplaceId) {
    throw new Error('Marketplace ID is required for listing reports');
  }
  const reportId = await createListingReport(spClient, marketplaceId);
  const documentId = await waitForReport(spClient, reportId);
  const documentText = await downloadReportDocument(spClient, documentId);
  return parseListingRows(documentText);
}

async function fetchCompanyStockItems(companyId, chunkSize = 1000) {
  if (!companyId) return [];
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + chunkSize - 1;
    const { data, error } = await supabase
      .from('stock_items')
      .select('id, company_id, user_id, sku, asin, name', { head: false })
      .eq('company_id', companyId)
      .range(from, to);
    if (error) throw error;
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }
  return rows;
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
      .insert(chunk, { ignoreDuplicates: true, onConflict: 'company_id,sku,asin' });
    if (error) {
      if (error.code === '23505') {
        console.warn(
          `[Listings sync] Duplicate insert skipped for company ${chunk[0]?.company_id || 'unknown'}:`,
          error.details || error.message
        );
        continue;
      }
      throw error;
    }
  }
}

async function syncListingsIntegration(integration) {
  const marketplaceId = resolveMarketplaceId(integration);
  if (!marketplaceId) {
    console.warn(
      `[Listings sync] Skipping integration ${integration.id} because it has no marketplace_id configured.`
    );
    return;
  }

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing LISTINGS for integration ${integration.id} (company ${integration.company_id}, marketplace ${marketplaceId})`
  );

  try {
    const listingRaw = await fetchListingRows(spClient, marketplaceId);
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

    const existing = await fetchCompanyStockItems(integration.company_id);

    const existingByKey = new Map();
    const existingByAsin = new Map(); // pentru completare titlu pe toate SKU-urile cu același ASIN
    const existingCombinationKeys = new Set();
    (existing || []).forEach((row) => {
      const key = keyFromRow(row);
      if (key) existingByKey.set(key, row);
      const asinKey =
        row?.asin && String(row.asin).trim().length
          ? String(row.asin).trim().toUpperCase()
          : '';
      if (asinKey) {
        if (!existingByAsin.has(asinKey)) existingByAsin.set(asinKey, []);
        existingByAsin.get(asinKey).push(row);
      }
      const comboKey = makeCombinationKey(row?.company_id, row?.sku, row?.asin);
      if (comboKey) {
        existingCombinationKeys.add(comboKey);
      }
    });

    const seen = new Set();
    const inserts = [];
    const updates = [];
    // Regula: nu rescriem rândurile existente, dar completăm titlul dacă lipsește.

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
        const hasExistingSku = row.sku && String(row.sku).trim().length > 0;
        if (!hasExistingSku && (!hasExistingName || needsNameReplace) && hasIncomingName) {
          patch.name = listing.name;
          shouldPatch = true;
        }
        if (shouldPatch) updates.push(patch);
        continue;
      }
      // Dacă nu găsim pereche ASIN+SKU, dar există rânduri cu același ASIN și nume lipsă, completăm titlul lor.
      const asinKey = listing.asin ? listing.asin.trim().toUpperCase() : '';
      if (asinKey && existingByAsin.has(asinKey)) {
        const rowsForAsin = existingByAsin.get(asinKey) || [];
        for (const r of rowsForAsin) {
          const incomingSku = listing.sku && String(listing.sku).trim();
          const hasExistingName = r.name && String(r.name).trim().length > 0;
          const hasIncomingName = listing.name && String(listing.name).trim().length > 0;
          const existingSkuNormalized = normalizeIdentifier(r.sku);
          const incomingSkuNormalized = normalizeIdentifier(incomingSku);
          const needsNameReplace = isCorruptedName(r.name);
          const patch = {
            id: r.id,
            company_id: r.company_id,
            sku: r.sku,
            asin: r.asin
          };
          let shouldPatch = false;
          // Dacă rândul din stoc nu are SKU, dar raportul Amazon îl are, îl completăm.
          if (
            incomingSku &&
            (!existingSkuNormalized || existingSkuNormalized !== incomingSkuNormalized)
          ) {
            const comboKey = makeCombinationKey(r.company_id, incomingSku, r.asin);
            if (comboKey && existingCombinationKeys.has(comboKey)) {
              console.warn(
                `[Listings sync] Duplicate combination detected for company ${r.company_id} asin ${r.asin} sku ${incomingSku}, skipping SKU backfill.`
              );
            } else {
              patch.sku = incomingSku;
              if (comboKey) {
                existingCombinationKeys.add(comboKey);
              }
              r.sku = incomingSku;
              const normalizedKey = normalizeIdentifier(incomingSku);
              if (normalizedKey) {
                existingByKey.set(normalizedKey, { ...r });
              }
              shouldPatch = true;
            }
          }
          const shouldUpdateName =
            hasIncomingName &&
            (!hasExistingName || needsNameReplace || !existingSkuNormalized);
          if (shouldUpdateName) {
            patch.name = listing.name;
            r.name = listing.name;
            shouldPatch = true;
          }
          if (shouldPatch) updates.push(patch);
        }
      } else {
        // Inserăm doar dacă avem și ASIN, și SKU
        if (listing.asin && listing.sku) {
          const comboKey = makeCombinationKey(
            integration.company_id,
            listing.sku,
            listing.asin
          );
          if (comboKey && existingCombinationKeys.has(comboKey)) {
            continue;
          }
          if (comboKey) {
            existingCombinationKeys.add(comboKey);
          }
          inserts.push({
            company_id: integration.company_id,
            user_id: integration.user_id,
            asin: listing.asin || null,
            sku: listing.sku || null,
            name: listing.name || listing.asin || listing.sku,
            qty: 0
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
          .upsert(chunk, { defaultToNull: false, onConflict: 'id' });
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
