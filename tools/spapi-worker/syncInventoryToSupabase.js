import 'dotenv/config';
import { createDecipheriv } from 'crypto';
import { gunzipSync } from 'zlib';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const REPORT_TYPE = 'GET_FBA_MYI_ALL_INVENTORY_DATA';
const LISTING_REPORT_TYPE = 'GET_MERCHANT_LISTINGS_ALL_DATA';
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 4000);
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 60);
const ALLOWED_FBA_CHANNELS = new Set(['AMAZON_NA', 'AMAZON_EU', 'AFN']);
const INVENTORY_TIME_BUDGET_MS = Number(
  process.env.SPAPI_INVENTORY_TIME_BUDGET_MS || 5.5 * 60 * 60 * 1000
);
// Implicitly run a single pass unless explicitly asked to loop forever.
const INVENTORY_SYNC_LOOP = process.env.SPAPI_INVENTORY_SYNC_LOOP === 'true';
const INVENTORY_SYNC_INTERVAL_MS = Number(
  process.env.SPAPI_INVENTORY_SYNC_INTERVAL_MS || 60 * 1000
);

const normalizeIdentifier = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text.toUpperCase() : null;
};

export const sanitizeText = (value) => {
  if (!value) return value;
  return String(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveMarketplaceId = (integration) => {
  if (integration?.marketplace_id) {
    return integration.marketplace_id;
  }
  if (Array.isArray(integration?.marketplace_ids) && integration.marketplace_ids.length) {
    return integration.marketplace_ids[0];
  }
  return null;
};

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

  const { data, error } = await supabase
    .from('amazon_integrations')
    .select(
      'id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, status, last_synced_at'
    )
    .eq('status', 'active')
    .order('last_synced_at', { ascending: true, nullsFirst: true });

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

  return integrations
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
      const refresh = token?.refresh_token || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null;
      return refresh
        ? {
            ...row,
            marketplace_ids: marketplaceList.length ? marketplaceList : null,
            refresh_token: refresh
          }
        : null;
    })
    .filter(Boolean);
}

async function createInventoryReport(spClient, marketplaceId) {
  const body = {
    reportType: REPORT_TYPE,
    marketplaceIds: [marketplaceId],
    reportOptions: {
      detailed: 'true'
    }
  };

  const response = await spClient.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body
  });

  if (!response?.reportId) {
    throw new Error('Failed to create inventory report');
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
        throw new Error('Amazon report completed without data');
      default:
        await delay(REPORT_POLL_INTERVAL);
    }
  }
  throw new Error('Timed out waiting for Amazon report to finish');
}

async function downloadReportDocument(spClient, reportDocumentId) {
  const document = await spClient.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId }
  });

  if (!document?.url) throw new Error('Report document missing download URL');

  const fetchImpl =
    globalThis.fetch ||
    (await import('node-fetch').then((mod) => mod.default));
  const response = await fetchImpl(document.url);
  if (!response.ok) {
    throw new Error(`Failed to download report document (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  if (document.encryptionDetails) {
    buffer = decryptDocument(buffer, document.encryptionDetails);
  }

  if (document.compressionAlgorithm === 'GZIP') {
    buffer = gunzipSync(buffer);
  }

  // Majoritatea rapoartelor sunt UTF-8, dar unele vin Latin-1 și apar �.
  const utf8 = buffer.toString('utf-8');
  if (utf8.includes('�')) {
    try {
      return buffer.toString('latin1');
    } catch (e) {
      return utf8;
    }
  }
  return utf8;
}

function decryptDocument(buffer, encryptionDetails) {
  const key = Buffer.from(encryptionDetails.key, 'base64');
  const iv = Buffer.from(encryptionDetails.initializationVector, 'base64');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
  return decrypted;
}

const COLUMN_ALIASES = new Map([
  ['seller-sku', 'sku'],
  ['sku', 'sku'],
  ['asin', 'asin'],
  ['product-name', 'name'],
  ['afn-fulfillable-quantity', 'fulfillable'],
  ['afn-inbound-working-quantity', 'inboundWorking'],
  ['afn-inbound-shipped-quantity', 'inboundShipped'],
  ['afn-inbound-receiving-quantity', 'inboundReceiving'],
  ['afn-reserved-quantity', 'reserved'],
  ['afn-unsellable-quantity', 'unsellable']
]);

const LISTING_COLUMN_ALIASES = new Map([
  ['seller-sku', 'sku'],
  ['sku', 'sku'],
  ['asin', 'asin'],
  ['asin1', 'asin'],
  ['item-name', 'name'],
  ['status', 'status'],
  ['item-status', 'status'],
  ['fulfillment-channel', 'fulfillmentChannel']
]);

function parseInventoryRows(tsvText) {
  const lines = tsvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headers = lines
    .shift()
    .split('\t')
    .map((header) => COLUMN_ALIASES.get(header.trim().toLowerCase()) || header.trim().toLowerCase());

  return lines.map((line) => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx];
    });
    return row;
  });
}

function parseListingRows(tsvText) {
  const lines = tsvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headers = lines
    .shift()
    .split('\t')
    .map((header) => LISTING_COLUMN_ALIASES.get(header.trim().toLowerCase()) || header.trim().toLowerCase());

  return lines.map((line) => {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx];
    });
    return row;
  });
}

function normalizeInventory(rawRows = []) {
  const normalized = [];
  for (const row of rawRows) {
    const sku = (row.sku || '').trim();
    const asin = (row.asin || '').trim();
    // cerință: nu importăm în inventar nimic fără ASIN + SKU
    if (!sku || !asin) continue;

    const fulfillable = Number(row.fulfillable ?? 0);
    const inboundTotal =
      Number(row.inboundTotal ?? 0) ||
      (Number(row.inboundWorking ?? 0) +
        Number(row.inboundShipped ?? 0) +
        Number(row.inboundReceiving ?? 0));
    const reserved = Number(row.reserved ?? 0);
    const unfulfillable = Number(row.unsellable ?? 0);

    normalized.push({
      key: (sku || asin).toLowerCase(),
      sku: sku || null,
      asin: asin || null,
      amazon_stock: fulfillable,
      amazon_inbound: inboundTotal,
      amazon_reserved: reserved,
      amazon_unfulfillable: unfulfillable,
      name: sanitizeText(row.name) || null
    });
  }
  return normalized;
}

function normalizeListings(rawRows = []) {
  const normalized = [];
  for (const row of rawRows) {
    const sku = (row.sku || '').trim();
    const asin = (row.asin || '').trim();
    // Pentru coloana de stoc avem nevoie de un ASIN real și un SKU.
    // Dacă lipsește oricare, nu mai adăugăm rândul; evităm SKU-uri fără ASIN în inventar.
    if (!asin || !sku) continue;

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

    // Păstrăm doar listările FBA; FBM sunt cele care vin de obicei fără ASIN
    // și cu titluri „stricate”, nu ne interesează în coloana de stoc.
    const fc = String(row.fulfillmentChannel || '').toUpperCase();
    if (!fc || !ALLOWED_FBA_CHANNELS.has(fc)) return false;

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

async function upsertStockRows(rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).reduce((acc, row) => {
      if (!row.asin || !row.sku) return acc;
      const { key, id, ...rest } = row;
      const payload = { ...rest };
      if (id !== undefined && id !== null) {
        payload.id = id;
      }
      acc.push(payload);
      return acc;
    }, []);
    if (!chunk.length) continue;
    const { error } = await supabase
      .from('stock_items')
      .upsert(chunk, { defaultToNull: false, onConflict: 'company_id,sku,asin' });
    if (error) throw error;
  }
}

async function cleanupInvalidRows(companyId) {
  // Nu mai ștergem automat rânduri; păstrăm stocurile manuale intacte.
  console.log(`[inventory] Skip cleanup for company ${companyId} (no deletes).`);
}

async function fetchAllStockItems(companyId, { filter } = {}) {
  const pageSize = 1000;
  let from = 0;
  let to = pageSize - 1;
  const rows = [];

  while (true) {
    const query = supabase
      .from('stock_items')
      .select(
        'id, company_id, user_id, sku, asin, name, amazon_stock, amazon_inbound, amazon_reserved, amazon_unfulfillable, qty'
      )
      .eq('company_id', companyId)
      .range(from, to);

    const { data, error } = await query;
    if (error) throw error;
    const page = Array.isArray(data) ? (filter ? data.filter(filter) : data) : [];
    rows.push(...page);

    if (!data || data.length < pageSize) break;
    from += pageSize;
    to += pageSize;
  }

  return rows;
}

async function syncToSupabase({ items, companyId, userId }) {
  if (items.length === 0) {
    console.log('Amazon returned no inventory rows. Nothing to sync.');
    return { affected: 0, seenKeys: new Set() };
  }

  const existing = await fetchAllStockItems(companyId);
  const existingByKey = new Map();
  const asinToExistingWithSku = new Map(); // pentru migrare manual -> automat
  const manualAsinOnly = [];
  existing.forEach((row) => {
    const key = keyFromRow(row);
    if (key) existingByKey.set(key, row);
    const asinKey = row?.asin ? String(row.asin).toUpperCase() : null;
    if (row?.sku && asinKey) {
      if (!asinToExistingWithSku.has(asinKey)) {
        asinToExistingWithSku.set(asinKey, row);
      }
    }
    const hasQty = Number(row.qty ?? 0) > 0;
    const hasSku = Boolean(row.sku && String(row.sku).trim());
    const hasAsin = Boolean(row.asin && String(row.asin).trim());
    if (!hasSku && hasAsin && hasQty) {
      manualAsinOnly.push(row);
    }
  });

  const seenKeys = new Set();
  const hasManualPrepStock = (row) => {
    if (!row) return false;
    const qty = Number(row.qty ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) return false;
    const hasIdentifier =
      Boolean(row.sku && String(row.sku).trim()) || Boolean(row.asin && String(row.asin).trim());
    return hasIdentifier;
  };
  const shouldUpdateName = (current, incoming, row) => {
    if (!incoming || !String(incoming).trim()) return false;
    if (!current || !String(current).trim()) return true;
    const cur = String(current).trim();
    const inc = String(incoming).trim();
    if (cur === inc) return false;
    const asin = String(row?.asin || '').trim();
    const sku = String(row?.sku || '').trim();
    // dacă numele actual este doar ASIN/SKU, îl înlocuim cu cel nou
    return cur === asin || cur === sku;
  };
  const insertsOrUpdates = [];
  const asinToPayloadWithSku = new Map(); // asin -> payload target (cu SKU)

  for (const item of items) {
    const key = item.key;
    if (!key) continue;
    seenKeys.add(key);
    const row = existingByKey.get(key);
    const sanitizedSku = normalizeIdentifier(item.sku);
    const sanitizedAsin = normalizeIdentifier(item.asin);

    if (row) {
      seenKeys.add(key);
      // Pentru rânduri existente: actualizăm doar stocurile Amazon. Titlu/poza se gestionează în alte sync-uri.
      const patch = {
        id: row.id,
        amazon_stock: item.amazon_stock,
        amazon_inbound: item.amazon_inbound,
        amazon_reserved: item.amazon_reserved,
        amazon_unfulfillable: item.amazon_unfulfillable
      };
      insertsOrUpdates.push(patch);
      if (row.asin && row.sku) {
        asinToPayloadWithSku.set(normalizeIdentifier(row.asin), {
          id: row.id,
          qty: Number(row.qty ?? 0)
        });
      }
    } else {
      // Nu creăm rânduri noi din inventar; doar marcăm ca văzut pentru zeroing.
      seenKeys.add(key);
      continue;
    }
  }

  // Migrare: mută qty din rândurile manuale fără SKU către rândurile cu SKU (aceeași ASIN).
  for (const manualRow of manualAsinOnly) {
    const asinKey = normalizeIdentifier(manualRow.asin);
    if (!asinKey) continue;
    const manualQty = Number(manualRow.qty ?? 0);
    if (!Number.isFinite(manualQty) || manualQty <= 0) continue;

    // Caut payload deja pregătit cu SKU.
    let targetPayload = asinToPayloadWithSku.get(asinKey);

    // Dacă nu există payload, verific rând existent cu SKU pentru acest ASIN.
    if (!targetPayload) {
      const existingSkuRow = asinToExistingWithSku.get(asinKey);
      if (existingSkuRow) {
        targetPayload = {
          id: existingSkuRow.id,
          company_id: existingSkuRow.company_id || companyId,
          user_id: existingSkuRow.user_id || userId,
          asin: normalizeIdentifier(existingSkuRow.asin),
          sku: normalizeIdentifier(existingSkuRow.sku),
          qty: Number(existingSkuRow.qty ?? 0)
        };
        insertsOrUpdates.push(targetPayload);
        asinToPayloadWithSku.set(asinKey, targetPayload);
      }
    }

    if (!targetPayload) {
      // Nu există încă SKU pentru acest ASIN; păstrăm rândul manual.
      continue;
    }

    const currentQty = Number(targetPayload.qty ?? 0);
    const nextQty = Number.isFinite(currentQty) ? currentQty + manualQty : manualQty;
    targetPayload.qty = nextQty;
  }

  await cleanupInvalidRows(companyId);
  await upsertStockRows(insertsOrUpdates);
  return { affected: insertsOrUpdates.length, seenKeys };
}

async function fetchInventoryRows(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  if (!marketplaceId) {
    throw new Error('Marketplace ID is required for inventory rows');
  }
  const reportId = await createInventoryReport(spClient, marketplaceId);
  const documentId = await waitForReport(spClient, reportId);
  const documentText = await downloadReportDocument(spClient, documentId);
  return parseInventoryRows(documentText);
}

async function fetchInventorySummaries(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  if (!marketplaceId) {
    throw new Error('Marketplace ID is required for inventory summaries');
  }
  const all = [];
  let nextToken = null;
  do {
    const res = await spClient.callAPI({
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query: {
        details: true,
        marketplaceIds: [marketplaceId],
        granularityType: 'Marketplace',
        granularityId: marketplaceId,
        maxResults: 200,
        nextToken
      }
    });

    const summaries =
      res?.payload?.inventorySummaries ||
      res?.inventorySummaries ||
      res?.payload ||
      [];
    if (Array.isArray(summaries)) {
      all.push(
        ...summaries.map((row) => {
          const reserved = Number(row.reservedQuantity ?? row.afnReservedQuantity ?? 0);
          const inboundWorking = Number(row.inboundWorkingQuantity ?? 0);
          const inboundShipped = Number(row.inboundShippedQuantity ?? 0);
          const inboundReceiving = Number(row.inboundReceivingQuantity ?? 0);
          const inboundTotal = inboundWorking + inboundShipped + inboundReceiving;
          // Fallbacks: prefer inStockSupplyQuantity. Dacă nu există, folosim totalSupplyQuantity/totalQuantity
          // dar scădem reserved pentru a nu umfla Available (FBA).
          const rawSupply =
            row.inStockSupplyQuantity ??
            row.totalSupplyQuantity ??
            row.totalQuantity ??
            0;
          const fulfillable = Math.max(0, Number(rawSupply) - reserved);

          return {
            sku: row.sellerSku || row.sku || null,
            asin: row.asin || null,
            fulfillable,
            inboundWorking,
            inboundShipped,
            inboundReceiving,
            inboundTotal,
            reserved,
            unsellable: Number(row.unfulfillableQuantity ?? 0),
            name: sanitizeText(row.productName) || null
          };
        })
      );
    }

    nextToken = res?.payload?.nextToken || res?.nextToken || null;
  } while (nextToken);

  return all;
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

async function fetchListingRows(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  if (!marketplaceId) {
    throw new Error('Marketplace ID is required for listing reports');
  }
  const reportId = await createListingReport(spClient, marketplaceId);
  const documentId = await waitForReport(spClient, reportId);
  const documentText = await downloadReportDocument(spClient, documentId);
  return parseListingRows(documentText);
}

async function syncIntegration(integration) {
  const marketplaceId = resolveMarketplaceId(integration);
  if (!marketplaceId) {
    console.warn(
      `[Inventory sync] Skipping integration ${integration.id} because it has no marketplace_id configured.`
    );
    return { companyId: integration.company_id, seenKeys: new Set() };
  }

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing integration ${integration.id} (company ${integration.company_id}, marketplace ${marketplaceId})`
  );

  try {
    let normalized = [];
    let listingRows = [];
    try {
      const rawRows = await fetchInventoryRows(spClient, marketplaceId);
      normalized = normalizeInventory(rawRows);
    } catch (err) {
      console.error(`Report inventory failed for ${integration.id}:`, err?.message || err);
      // fallback to Inventory Summaries API
      const summaries = await fetchInventorySummaries(spClient, marketplaceId);
      normalized = normalizeInventory(summaries);
    }

    try {
      const listingRaw = await fetchListingRows(spClient, marketplaceId);
      listingRows = filterListings(normalizeListings(listingRaw));
    } catch (err) {
      console.error(`Listing report failed for ${integration.id}:`, err?.message || err);
    }

    if (listingRows.length) {
      const stockByKey = new Map();
      normalized.forEach((item) => {
        if (item.key) stockByKey.set(item.key, item);
      });

      const merged = [];
      const seen = new Set();
      for (const listing of listingRows) {
        if (!listing.key || seen.has(listing.key)) continue;
        seen.add(listing.key);
        const inv = stockByKey.get(listing.key);
        // Păstrăm doar listingurile care apar și în inventarul FBA (raport sau summaries).
        if (!inv) continue;
        merged.push({
          key: listing.key,
          asin: listing.asin || inv?.asin || null,
          sku: listing.sku || inv?.sku || null,
          name: listing.name || inv?.name || null,
          amazon_stock: inv?.amazon_stock ?? 0,
          amazon_inbound: inv?.amazon_inbound ?? 0,
          amazon_reserved: inv?.amazon_reserved ?? 0,
          amazon_unfulfillable: inv?.amazon_unfulfillable ?? 0
        });
      }
      normalized = merged;
    }

    const stats = await syncToSupabase({
      items: normalized,
      companyId: integration.company_id,
      userId: integration.user_id
    });

    await supabase
      .from('amazon_integrations')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id);

    console.log(
      `Integration ${integration.id} synced (${normalized.length} items, ${stats.affected} rows). Listings filter: ${listingRows.length}.`
    );
    return { companyId: integration.company_id, seenKeys: stats.seenKeys };
  } catch (err) {
    console.error(`Sync failed for integration ${integration.id}:`, err?.response?.data || err);
    await supabase
      .from('amazon_integrations')
      .update({ last_error: err?.message || String(err) })
      .eq('id', integration.id);
    return { companyId: integration.company_id, seenKeys: new Set() };
  }
}

async function zeroAmazonStockForCompany(companyId, seenKeys = new Set()) {
  if (!companyId) return 0;
  const data = await fetchAllStockItems(companyId, { filter: (row) => Number(row.amazon_stock ?? 0) !== 0 });

  const rowsToZero = data.filter((row) => {
    const key = keyFromRow(row);
    return key && !seenKeys.has(key);
  });
  if (!rowsToZero.length) return 0;

  await upsertStockRows(rowsToZero.map((row) => ({ id: row.id, amazon_stock: 0 })));
  return rowsToZero.length;
}

const ZERO_MISSING_STOCK = process.env.ZERO_MISSING_STOCK === 'true';

async function main() {
  assertBaseEnv();
  const startedAt = Date.now();
  const hasTimeBudget = Number.isFinite(INVENTORY_TIME_BUDGET_MS) && INVENTORY_TIME_BUDGET_MS > 0;
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('No active amazon_integrations found. Nothing to do.');
    return;
  }

  const companySeenKeys = new Map();
  for (const integration of integrations) {
    if (hasTimeBudget && Date.now() - startedAt >= INVENTORY_TIME_BUDGET_MS) {
      console.warn(
        `[inventory] Time budget reached (~${Math.round(INVENTORY_TIME_BUDGET_MS / 60000)}m); stopping early to avoid runner timeout.`
      );
      break;
    }

    const result = await syncIntegration(integration);
    if (!result || !result.companyId) continue;
    const aggregated = companySeenKeys.get(result.companyId) || new Set();
    result.seenKeys.forEach((key) => aggregated.add(key));
    companySeenKeys.set(result.companyId, aggregated);
  }

  if (hasTimeBudget && Date.now() - startedAt >= INVENTORY_TIME_BUDGET_MS) {
    console.log(
      '[inventory] Skipping zeroing pass because time budget was reached; next workflow run will continue.'
    );
    return;
  }

  for (const [companyId, seenKeys] of companySeenKeys.entries()) {
    if (!ZERO_MISSING_STOCK) {
      console.log(`Company ${companyId}: zeroing missing Amazon rows is disabled (ZERO_MISSING_STOCK!=true).`);
      continue;
    }
    if (!seenKeys.size) {
      console.log(`Company ${companyId} had no Amazon inventory rows this run; skipping zeroing.`);
      continue;
    }
    const zeroed = await zeroAmazonStockForCompany(companyId, seenKeys);
    if (zeroed > 0) {
      console.log(`Company ${companyId} zeroed ${zeroed} Amazon rows missing from all integrations.`);
    }
  }

  console.log('All integrations processed ✅');
}

async function runForever() {
  do {
    try {
      await main();
    } catch (err) {
      console.error('Inventory sync failed:', err?.response?.data || err);
      if (!INVENTORY_SYNC_LOOP) {
        throw err;
      }
    }

    if (!INVENTORY_SYNC_LOOP) {
      break;
    }

    const sleepMs = Number.isFinite(INVENTORY_SYNC_INTERVAL_MS)
      ? Math.max(0, INVENTORY_SYNC_INTERVAL_MS)
      : 0;
    if (sleepMs > 0) {
      console.log(`[inventory] Sleeping ${Math.round(sleepMs / 1000)}s before next run.`);
      await delay(sleepMs);
    }
  } while (true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runForever().catch((err) => {
    console.error('Inventory sync failed:', err?.response?.data || err);
    process.exit(1);
  });
}
