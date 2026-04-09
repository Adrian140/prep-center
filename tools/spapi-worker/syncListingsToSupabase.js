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

const configuredMaxIntegrationsPerRun =
  process.env.SPAPI_LISTING_MAX_INTEGRATIONS_PER_RUN ||
  process.env.SPAPI_MAX_INTEGRATIONS_PER_RUN ||
  '';
const MAX_INTEGRATIONS_PER_RUN = Number(configuredMaxIntegrationsPerRun);
const MAX_INTEGRATIONS_PER_RUN_LIMIT =
  configuredMaxIntegrationsPerRun && Number.isFinite(MAX_INTEGRATIONS_PER_RUN) && MAX_INTEGRATIONS_PER_RUN > 0
    ? MAX_INTEGRATIONS_PER_RUN
    : Number.POSITIVE_INFINITY;
const LISTING_SYNC_STATE_KEY =
  process.env.SPAPI_LISTING_SYNC_STATE_KEY ||
  process.env.SPAPI_LISTING_MARKETPLACE_ID ||
  DEFAULT_MARKETPLACE;
const LISTING_SYNC_STATE_APP_SETTINGS_KEY = `listing_sync_state:${LISTING_SYNC_STATE_KEY}`;
const DEBUG_LISTING_HEADERS =
  String(process.env.SPAPI_LISTING_DEBUG_HEADERS || '').toLowerCase() === 'true' ||
  String(process.env.SPAPI_LISTING_DEBUG_HEADERS || '').trim() === '1';
const DEBUG_LISTING_RAW_HEADER =
  String(process.env.SPAPI_LISTING_DEBUG_RAW_HEADER || '').toLowerCase() === 'true' ||
  String(process.env.SPAPI_LISTING_DEBUG_RAW_HEADER || '').trim() === '1';
const LISTING_FETCH_IMAGES_FROM_CATALOG =
  String(process.env.SPAPI_LISTING_FETCH_IMAGES_FROM_CATALOG || 'true').toLowerCase() !== 'false';
const LISTING_FETCH_EAN_FROM_CATALOG =
  String(process.env.SPAPI_LISTING_FETCH_EAN_FROM_CATALOG || 'true').toLowerCase() !== 'false';
const LISTING_CATALOG_DETAILS_CONCURRENCY = Math.max(
  1,
  Number(process.env.SPAPI_LISTING_CATALOG_DETAILS_CONCURRENCY || 6)
);
const LISTING_CATALOG_MARKETPLACE_IDS = String(
  process.env.SPAPI_LISTING_CATALOG_MARKETPLACE_IDS ||
    'A13V1IB3VIYZZH,A1PA6795UKMFR9,APJ6JRA9NG5V4,A1RKKUPIHCS9HS'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const TRANSIENT_RETRY_MAX_ATTEMPTS = Number(
  process.env.SPAPI_TRANSIENT_RETRY_MAX_ATTEMPTS || 5
);
const TRANSIENT_RETRY_BASE_MS = Number(process.env.SPAPI_TRANSIENT_RETRY_BASE_MS || 2000);

function logStamp() {
  return new Date().toISOString();
}

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

function defaultSyncState() {
  return {
    key: LISTING_SYNC_STATE_KEY,
    next_integration_index: 0,
    cycle_started_at: null,
    cycle_completed_at: null,
    last_batch_size: 0,
    updated_at: new Date().toISOString()
  };
}

async function getSyncState() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', LISTING_SYNC_STATE_APP_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;

  if (data?.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
    return {
      ...defaultSyncState(),
      ...data.value,
      key: LISTING_SYNC_STATE_KEY
    };
  }

  const seed = defaultSyncState();
  const { error: upsertError } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: LISTING_SYNC_STATE_APP_SETTINGS_KEY,
        value: seed,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    );
  if (upsertError) throw upsertError;
  return seed;
}

async function saveSyncState(patch) {
  const current = await getSyncState();
  const merged = {
    ...current,
    ...patch,
    key: LISTING_SYNC_STATE_KEY,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: LISTING_SYNC_STATE_APP_SETTINGS_KEY,
        value: merged,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    );
  if (error) throw error;
}

function selectIntegrationBatch(integrations, syncState) {
  if (!Array.isArray(integrations) || integrations.length === 0) {
    return {
      batch: [],
      startIndex: 0,
      nextIndex: 0,
      cycleCompleted: false,
      total: 0
    };
  }

  const total = integrations.length;
  const batchSize = Number.isFinite(MAX_INTEGRATIONS_PER_RUN_LIMIT)
    ? Math.min(MAX_INTEGRATIONS_PER_RUN_LIMIT, total)
    : total;
  const requestedStart = Math.max(0, Number(syncState?.next_integration_index || 0));
  const startIndex = requestedStart >= total ? 0 : requestedStart;
  const endExclusive = Math.min(startIndex + batchSize, total);
  const batch = integrations.slice(startIndex, endExclusive);
  const cycleCompleted = endExclusive >= total;
  const nextIndex = cycleCompleted ? 0 : endExclusive;

  return {
    batch,
    startIndex,
    nextIndex,
    cycleCompleted,
    total
  };
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

  const { data, error } = await query.order('id', { ascending: true });

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

  return withTokens;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorText(err) {
  if (!err) return '';
  const responseData = err?.response?.data;
  if (typeof responseData === 'string') return responseData;
  if (typeof responseData?.message === 'string') return responseData.message;
  if (typeof err?.message === 'string') return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isTransientError(err) {
  const status = Number(err?.status || err?.code || err?.response?.status || 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  const text = extractErrorText(err).toLowerCase();
  return (
    text.includes('502 bad gateway') ||
    text.includes('503 service unavailable') ||
    text.includes('504 gateway') ||
    text.includes('cloudflare') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('fetch failed') ||
    text.includes('ecconnreset') ||
    text.includes('econnreset') ||
    text.includes('etimedout')
  );
}

function isCatalogNotFoundError(err) {
  const text = extractErrorText(err).toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  const details = String(err?.details || '').toLowerCase();
  return (
    code.includes('notfound') ||
    text.includes('not found in marketplace') ||
    text.includes('requested item') ||
    details.includes('not found in marketplace')
  );
}

async function runWithTransientRetry(fn, label) {
  let attempt = 0;
  while (attempt < TRANSIENT_RETRY_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      const retryable = isTransientError(err);
      if (!retryable || attempt >= TRANSIENT_RETRY_MAX_ATTEMPTS) {
        throw err;
      }
      const waitMs = TRANSIENT_RETRY_BASE_MS * attempt;
      console.warn(
        `[Listings sync] transient error in ${label}, retry ${attempt}/${TRANSIENT_RETRY_MAX_ATTEMPTS} in ${waitMs}ms: ${extractErrorText(
          err
        ).slice(0, 300)}`
      );
      await delay(waitMs);
    }
  }
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

function resolveCatalogMarketplaceIds(preferredMarketplaceId) {
  const merged = new Set(LISTING_CATALOG_MARKETPLACE_IDS);
  if (preferredMarketplaceId) {
    merged.add(preferredMarketplaceId);
  }
  const list = Array.from(merged).filter(Boolean);
  if (preferredMarketplaceId && list.includes(preferredMarketplaceId)) {
    return [preferredMarketplaceId, ...list.filter((id) => id !== preferredMarketplaceId)];
  }
  return list;
}

async function createListingReport(spClient, marketplaceId) {
  console.log(`[${logStamp()}] [Listings sync] createReport marketplace=${marketplaceId} started`);
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

  console.log(
    `[${logStamp()}] [Listings sync] createReport marketplace=${marketplaceId} reportId=${response.reportId}`
  );

  return response.reportId;
}

async function waitForReport(spClient, reportId) {
  for (let attempt = 0; attempt < REPORT_POLL_LIMIT; attempt += 1) {
    console.log(
      `[${logStamp()}] [Listings sync] waitForReport reportId=${reportId} attempt=${attempt + 1}/${REPORT_POLL_LIMIT}`
    );
    const report = await spClient.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId }
    });

    if (!report) throw new Error('Empty response when polling report status');

    switch (report.processingStatus) {
      case 'DONE':
        console.log(
          `[${logStamp()}] [Listings sync] waitForReport reportId=${reportId} status=DONE documentId=${report.reportDocumentId}`
        );
        return report.reportDocumentId;
      case 'FATAL':
      case 'CANCELLED':
        throw new Error(`Amazon report failed with status ${report.processingStatus}`);
      case 'DONE_NO_DATA':
        throw new Error('Amazon listing report completed without data');
      default:
        console.log(
          `[${logStamp()}] [Listings sync] waitForReport reportId=${reportId} status=${report.processingStatus}`
        );
        await delay(REPORT_POLL_INTERVAL);
    }
  }
  throw new Error(
    `Timed out waiting for Amazon listing report ${reportId} after ${REPORT_POLL_LIMIT * REPORT_POLL_INTERVAL / 1000}s`
  );
}

async function downloadReportDocument(spClient, reportDocumentId) {
  console.log(
    `[${logStamp()}] [Listings sync] downloadReportDocument documentId=${reportDocumentId} started`
  );
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
    console.log(
      `[${logStamp()}] [Listings sync] downloadReportDocument documentId=${reportDocumentId} completed encoding=latin1`
    );
    return latin1Decoder.decode(buffer);
  }
  console.log(
    `[${logStamp()}] [Listings sync] downloadReportDocument documentId=${reportDocumentId} completed encoding=utf-8`
  );
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
  ['fulfillment channel', 'fulfillmentChannel'],
  ['canal-traitement', 'fulfillmentChannel'],
  ['canal-de-gestion', 'fulfillmentChannel'],
  ['canal gestion', 'fulfillmentChannel'],
  ['canale-di-evasione', 'fulfillmentChannel'],
  ['versandkanal', 'fulfillmentChannel'],
  ['versand-kanal', 'fulfillmentChannel'],
  ['fulfillmentkanal', 'fulfillmentChannel'],
  ['fulfillment-kanal', 'fulfillmentChannel'],
  ['versand durch', 'fulfillmentChannel'],
  ['image-url', 'imageUrl'],
  ['imageurl', 'imageUrl'],
  ['url-image', 'imageUrl'],
  ['url image', 'imageUrl'],
  ['url-immagine', 'imageUrl'],
  ['url-imagen', 'imageUrl'],
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

const looksLikeEan = (value) => {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
};

function extractEan(productId, productIdType) {
  const idType = String(productIdType || '').trim().toUpperCase();
  const raw = productId || '';
  if (!raw) return null;
  // If type is explicitly EAN/UPC/GTIN or not ASIN, keep digits.
  if (idType && idType !== 'ASIN' && idType !== '1') {
    return looksLikeEan(raw);
  }
  // If no type, try to infer by length (non-ASIN).
  return looksLikeEan(raw);
}

function normalizeListings(rawRows = []) {
  const normalized = [];
  for (const row of rawRows) {
    const sku = (row.sku || '').trim();
    let asin = (row.asin || '').trim();
    const productId = row.productId || row['product-id'] || row['id-produit'] || row['id-prodotto'];
    const productIdType =
      row.productIdType ||
      row['product-id-type'] ||
      row['type-id-produit'] ||
      row['tipo-id-prodotto'];
    const ean = extractEan(productId, productIdType);
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
    const imageUrl = sanitizeText(
      row.imageUrl ||
        row['image-url'] ||
        row['image_url'] ||
        row['url-image'] ||
        row['url-immagine'] ||
        row['url-imagen']
    );
    normalized.push({
      key,
      sku: sku || null,
      asin: asin || null,
      ean: normalizeEan(ean) || null,
      name: sanitizeText(row.name) || null,
      imageUrl: imageUrl || null,
      status: (row.status || '').trim(),
      fulfillmentChannel: (row.fulfillmentChannel || '').trim()
    });
  }
  return normalized;
}

function normalizeFulfillmentChannel(value) {
  const normalized = stripDiacritics(
    String(value || '')
      .trim()
      .toUpperCase()
  );
  if (!normalized) return null;
  if (normalized.includes('AMAZON') || normalized === 'AFN') return 'FBA';
  if (
    normalized.includes('MERCHANT') ||
    normalized.includes('SELLER') ||
    normalized.includes('VENDEUR') ||
    normalized.includes('VENDEDOR') ||
    normalized.includes('VENDITORE') ||
    normalized.includes('VERKAUFER') ||
    normalized.includes('VERKAEUFER') ||
    normalized === 'MFN' ||
    normalized === 'DEFAULT'
  ) {
    return 'FBM';
  }
  return normalized;
}

function summarizeFulfillmentChannels(listings = []) {
  const normalizedCounts = new Map();
  const rawCounts = new Map();

  for (const row of listings || []) {
    const raw = String(row?.fulfillmentChannel || '').trim() || '(empty)';
    rawCounts.set(raw, (rawCounts.get(raw) || 0) + 1);

    const normalized = normalizeFulfillmentChannel(row?.fulfillmentChannel) || 'UNKNOWN';
    normalizedCounts.set(normalized, (normalizedCounts.get(normalized) || 0) + 1);
  }

  const normalizedSummary = Array.from(normalizedCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');

  const rawSummary = Array.from(rawCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');

  return {
    normalizedSummary,
    rawSummary,
    fba: normalizedCounts.get('FBA') || 0,
    fbm: normalizedCounts.get('FBM') || 0,
    unknown: normalizedCounts.get('UNKNOWN') || 0
  };
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

function normalizeEan(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

function pickCatalogEan(payload, preferredMarketplaceId) {
  const root = payload?.payload || payload || {};
  const identifiersByMarketplace = Array.isArray(root.identifiers) ? root.identifiers : [];

  let best = null;
  let bestScore = 0;

  const consider = (raw, type, marketplaceId) => {
    const ean = normalizeEan(raw);
    if (!ean) return;
    const typeNorm = String(type || '').trim().toUpperCase();
    let score = ean.length === 13 ? 3 : ean.length === 14 ? 2 : 1;
    if (typeNorm === 'EAN') score += 20;
    else if (typeNorm === 'GTIN') score += 10;
    else if (typeNorm === 'UPC') score += 1;
    if (preferredMarketplaceId && marketplaceId === preferredMarketplaceId) score += 5;
    if (score > bestScore) {
      best = ean;
      bestScore = score;
    }
  };

  for (const marketNode of identifiersByMarketplace) {
    const marketplaceId = String(marketNode?.marketplaceId || '').trim();
    const identifiers = Array.isArray(marketNode?.identifiers) ? marketNode.identifiers : [];
    for (const node of identifiers) {
      consider(node?.identifier, node?.identifierType, marketplaceId);
    }
  }

  return best;
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

const isPlaceholderName = (name, asin) => {
  const n = String(name || '').trim();
  const a = String(asin || '').trim();
  if (!n) return true;
  if (n === '-') return true;
  return a && n.toUpperCase() === a.toUpperCase();
};

function pickCatalogMainImage(payload) {
  const root = payload?.payload || payload || {};
  const imageSets = Array.isArray(root.images) ? root.images : [];
  for (const set of imageSets) {
    const images = Array.isArray(set?.images) ? set.images : [];
    if (!images.length) continue;
    const main = images.find((img) => String(img?.variant || '').toUpperCase() === 'MAIN');
    const first = main || images[0];
    const link = first?.link || first?.url || first?.URL || null;
    if (typeof link === 'string' && link.trim().length) {
      return link.trim();
    }
  }
  return null;
}

async function fetchCatalogMainImage(spClient, asin, marketplaceId) {
  const res = await spClient.callAPI({
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    path: { asin },
    query: {
      marketplaceIds: [marketplaceId],
      includedData: ['images']
    },
    options: {
      version: '2022-04-01'
    }
  });
  return pickCatalogMainImage(res);
}

async function fetchCatalogListingDetails(spClient, asin, marketplaceId) {
  const res = await spClient.callAPI({
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    path: { asin },
    query: {
      marketplaceIds: [marketplaceId],
      includedData: ['identifiers', 'images']
    },
    options: {
      version: '2022-04-01'
    }
  });
  return {
    ean: pickCatalogEan(res, marketplaceId),
    image: pickCatalogMainImage(res)
  };
}

async function fetchCatalogEan(spClient, asin, marketplaceId) {
  const res = await spClient.callAPI({
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    path: { asin },
    query: {
      marketplaceIds: [marketplaceId],
      includedData: ['identifiers']
    },
    options: {
      version: '2022-04-01'
    }
  });
  return pickCatalogEan(res, marketplaceId);
}

async function fetchCachedCatalogDetailsByAsin({ companyId, asins }) {
  const map = new Map();
  const uniqueAsins = Array.from(
    new Set((asins || []).map((v) => String(v || '').trim().toUpperCase()).filter(Boolean))
  );
  if (!uniqueAsins.length) return map;

  const chunkSize = 300;
  for (let i = 0; i < uniqueAsins.length; i += chunkSize) {
    const chunk = uniqueAsins.slice(i, i + chunkSize);
    if (!chunk.length) continue;

    const [{ data: asinEans, error: asinEansError }, { data: stockRows, error: stockError }, { data: assetRows, error: assetError }] =
      await Promise.all([
        supabase.from('asin_eans').select('asin, ean').eq('company_id', companyId).in('asin', chunk),
        supabase.from('stock_items').select('asin, ean, image_url').eq('company_id', companyId).in('asin', chunk),
        supabase.from('asin_assets').select('asin, image_urls').in('asin', chunk)
      ]);

    if (asinEansError) throw asinEansError;
    if (stockError) throw stockError;
    if (assetError) throw assetError;

    for (const row of asinEans || []) {
      const asin = String(row?.asin || '').trim().toUpperCase();
      if (!asin) continue;
      const prev = map.get(asin) || { ean: null, image: null };
      const ean = normalizeEan(row?.ean);
      if (ean && !prev.ean) prev.ean = ean;
      map.set(asin, prev);
    }

    for (const row of stockRows || []) {
      const asin = String(row?.asin || '').trim().toUpperCase();
      if (!asin) continue;
      const prev = map.get(asin) || { ean: null, image: null };
      const ean = normalizeEan(row?.ean);
      const image = typeof row?.image_url === 'string' && row.image_url.trim() ? row.image_url.trim() : null;
      if (ean && !prev.ean) prev.ean = ean;
      if (image && !prev.image) prev.image = image;
      map.set(asin, prev);
    }

    for (const row of assetRows || []) {
      const asin = String(row?.asin || '').trim().toUpperCase();
      if (!asin) continue;
      const prev = map.get(asin) || { ean: null, image: null };
      const image = Array.isArray(row?.image_urls)
        ? row.image_urls.find((value) => typeof value === 'string' && value.trim())
        : null;
      if (image && !prev.image) prev.image = String(image).trim();
      map.set(asin, prev);
    }
  }

  return map;
}

async function fetchKnownEansByAsin({ companyId, asins }) {
  const map = new Map();
  const uniqueAsins = Array.from(
    new Set((asins || []).map((v) => String(v || '').trim().toUpperCase()).filter(Boolean))
  );
  if (!uniqueAsins.length) return map;

  const chunkSize = 500;
  for (let i = 0; i < uniqueAsins.length; i += chunkSize) {
    const chunk = uniqueAsins.slice(i, i + chunkSize);
    if (!chunk.length) continue;

    const { data: asinEans, error: asinEansError } = await supabase
      .from('asin_eans')
      .select('asin, ean')
      .eq('company_id', companyId)
      .in('asin', chunk);
    if (asinEansError) throw asinEansError;
    for (const row of asinEans || []) {
      const asin = String(row?.asin || '').trim().toUpperCase();
      const ean = normalizeEan(row?.ean);
      if (asin && ean && !map.has(asin)) map.set(asin, ean);
    }

    const { data: stockRows, error: stockError } = await supabase
      .from('stock_items')
      .select('asin, ean')
      .eq('company_id', companyId)
      .in('asin', chunk);
    if (stockError) throw stockError;
    for (const row of stockRows || []) {
      const asin = String(row?.asin || '').trim().toUpperCase();
      const ean = normalizeEan(row?.ean);
      if (asin && ean && !map.has(asin)) map.set(asin, ean);
    }
  }

  return map;
}

async function enrichListingsEanFromKnownAndCatalog({
  spClient,
  marketplaceId,
  companyId,
  listings
}) {
  const withoutEan = (listings || []).filter((l) => !normalizeEan(l?.ean) && l?.asin);
  if (!withoutEan.length) {
    return { knownFilled: 0, catalogFilled: 0, catalogNotFound: 0, catalogFailed: 0 };
  }

  const missingAsins = Array.from(
    new Set(withoutEan.map((l) => String(l.asin || '').trim().toUpperCase()).filter(Boolean))
  );

  const knownMap = await fetchKnownEansByAsin({ companyId, asins: missingAsins });
  let knownFilled = 0;
  for (const listing of withoutEan) {
    const asin = String(listing.asin || '').trim().toUpperCase();
    const known = knownMap.get(asin) || null;
    if (known) {
      listing.ean = known;
      knownFilled += 1;
    }
  }

  const stillMissingAsins = Array.from(
    new Set(
      withoutEan
        .filter((l) => !normalizeEan(l?.ean))
        .map((l) => String(l.asin || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (!stillMissingAsins.length) {
    return { knownFilled, catalogFilled: 0, catalogNotFound: 0, catalogFailed: 0 };
  }

  if (!LISTING_FETCH_EAN_FROM_CATALOG) {
    console.log(
      `[Listings sync] company=${companyId} skip catalog EAN fallback for ${stillMissingAsins.length} ASINs (SPAPI_LISTING_FETCH_EAN_FROM_CATALOG=false)`
    );
    return {
      knownFilled,
      catalogFilled: 0,
      catalogNotFound: stillMissingAsins.length,
      catalogFailed: 0
    };
  }

  const catalogMarketplaceIds = resolveCatalogMarketplaceIds(marketplaceId);
  let catalogFilled = 0;
  let catalogNotFound = 0;
  let catalogFailed = 0;
  const foundByAsin = new Map();

  for (const asin of stillMissingAsins) {
    let ean = null;
    let hadError = false;
    for (const marketId of catalogMarketplaceIds) {
      try {
        const candidate = await runWithTransientRetry(
          () => fetchCatalogEan(spClient, asin, marketId),
          `catalog-ean asin=${asin} marketplace=${marketId}`
        );
        ean = normalizeEan(candidate);
        if (ean) break;
      } catch (err) {
        if (isCatalogNotFoundError(err)) continue;
        hadError = true;
        console.warn(
          `[Listings sync] Catalog EAN lookup warning company=${companyId} asin=${asin} marketplace=${marketId}: ${extractErrorText(
            err
          ).slice(0, 300)}`
        );
      }
    }

    if (ean) {
      foundByAsin.set(asin, ean);
      catalogFilled += 1;
    } else if (hadError) {
      catalogFailed += 1;
    } else {
      catalogNotFound += 1;
    }
  }

  if (foundByAsin.size) {
    for (const listing of listings || []) {
      const asin = String(listing?.asin || '').trim().toUpperCase();
      if (!asin || normalizeEan(listing?.ean)) continue;
      const resolved = foundByAsin.get(asin) || null;
      if (resolved) listing.ean = resolved;
    }
  }

  return { knownFilled, catalogFilled, catalogNotFound, catalogFailed };
}

async function enrichListingsCatalogDetails({
  spClient,
  marketplaceId,
  companyId,
  userId,
  listings
}) {
  const candidates = (listings || []).filter((row) => {
    if (!row?.asin) return false;
    const needsEan = LISTING_FETCH_EAN_FROM_CATALOG && !normalizeEan(row?.ean);
    const needsImage = LISTING_FETCH_IMAGES_FROM_CATALOG && !(typeof row?.imageUrl === 'string' && row.imageUrl.trim());
    return needsEan || needsImage;
  });

  if (!candidates.length) {
    return {
      cachedEanFilled: 0,
      cachedImageFilled: 0,
      catalogEanFilled: 0,
      catalogImageFilled: 0,
      catalogNotFound: 0,
      catalogFailed: 0,
      requestedAsins: 0
    };
  }

  const candidateAsins = Array.from(
    new Set(candidates.map((row) => String(row.asin || '').trim().toUpperCase()).filter(Boolean))
  );
  const cachedMap = await fetchCachedCatalogDetailsByAsin({ companyId, asins: candidateAsins });

  let cachedEanFilled = 0;
  let cachedImageFilled = 0;
  for (const row of candidates) {
    const asin = String(row.asin || '').trim().toUpperCase();
    const cached = cachedMap.get(asin) || null;
    if (!cached) continue;
    if (!normalizeEan(row?.ean) && normalizeEan(cached.ean)) {
      row.ean = normalizeEan(cached.ean);
      cachedEanFilled += 1;
    }
    if (!(typeof row?.imageUrl === 'string' && row.imageUrl.trim()) && cached.image) {
      row.imageUrl = String(cached.image).trim();
      cachedImageFilled += 1;
    }
  }

  const remainingAsins = Array.from(
    new Set(
      candidates
        .filter((row) => {
          const needsEan = LISTING_FETCH_EAN_FROM_CATALOG && !normalizeEan(row?.ean);
          const needsImage = LISTING_FETCH_IMAGES_FROM_CATALOG && !(typeof row?.imageUrl === 'string' && row.imageUrl.trim());
          return needsEan || needsImage;
        })
        .map((row) => String(row.asin || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (!remainingAsins.length) {
    return {
      cachedEanFilled,
      cachedImageFilled,
      catalogEanFilled: 0,
      catalogImageFilled: 0,
      catalogNotFound: 0,
      catalogFailed: 0,
      requestedAsins: 0
    };
  }

  const catalogMarketplaceIds = resolveCatalogMarketplaceIds(marketplaceId);
  const foundMap = new Map();
  let catalogNotFound = 0;
  let catalogFailed = 0;

  let index = 0;
  const worker = async () => {
    while (index < remainingAsins.length) {
      const current = remainingAsins[index];
      index += 1;
      let found = null;
      let hadError = false;
      for (const marketId of catalogMarketplaceIds) {
        try {
          const details = await runWithTransientRetry(
            () => fetchCatalogListingDetails(spClient, current, marketId),
            `catalog-details asin=${current} marketplace=${marketId}`
          );
          const ean = normalizeEan(details?.ean);
          const image =
            typeof details?.image === 'string' && details.image.trim() ? details.image.trim() : null;
          if (ean || image) {
            found = { ean, image };
            break;
          }
        } catch (err) {
          if (isCatalogNotFoundError(err)) continue;
          hadError = true;
          console.warn(
            `[Listings sync] Catalog details lookup warning company=${companyId} asin=${current} marketplace=${marketId}: ${extractErrorText(
              err
            ).slice(0, 300)}`
          );
        }
      }

      if (found) {
        foundMap.set(current, found);
      } else if (hadError) {
        catalogFailed += 1;
      } else {
        catalogNotFound += 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(LISTING_CATALOG_DETAILS_CONCURRENCY, remainingAsins.length) }, () =>
      worker()
    )
  );

  let catalogEanFilled = 0;
  let catalogImageFilled = 0;
  const asinEanRows = [];
  const asinAssetRows = [];
  for (const row of listings || []) {
    const asin = String(row?.asin || '').trim().toUpperCase();
    if (!asin) continue;
    const found = foundMap.get(asin) || null;
    if (!found) continue;
    if (!normalizeEan(row?.ean) && found.ean) {
      row.ean = found.ean;
      catalogEanFilled += 1;
    }
    if (!(typeof row?.imageUrl === 'string' && row.imageUrl.trim()) && found.image) {
      row.imageUrl = found.image;
      catalogImageFilled += 1;
    }
  }

  for (const [asin, found] of foundMap.entries()) {
    if (found.ean) {
      asinEanRows.push({ user_id: userId, company_id: companyId, asin, ean: found.ean });
    }
    if (found.image) {
      asinAssetRows.push({
        asin,
        image_urls: [found.image],
        source: 'amazon_catalog',
        fetched_at: new Date().toISOString()
      });
    }
  }

  if (asinEanRows.length) {
    for (let i = 0; i < asinEanRows.length; i += 500) {
      const chunk = asinEanRows.slice(i, i + 500);
      const { error } = await supabase
        .from('asin_eans')
        .insert(chunk, { ignoreDuplicates: true, onConflict: 'user_id,asin,ean' });
      if (error) throw error;
    }
  }

  if (asinAssetRows.length) {
    for (let i = 0; i < asinAssetRows.length; i += 500) {
      const chunk = asinAssetRows.slice(i, i + 500);
      const { error } = await supabase
        .from('asin_assets')
        .upsert(chunk, { onConflict: 'asin' });
      if (error) throw error;
    }
  }

  const imageAsins = asinAssetRows.map((row) => row.asin).filter(Boolean);
  if (imageAsins.length) {
    for (let i = 0; i < imageAsins.length; i += 300) {
      const chunk = imageAsins.slice(i, i + 300);
      const updates = chunk.map((asin) => {
        const found = foundMap.get(asin);
        return found?.image ? { asin, image: found.image } : null;
      }).filter(Boolean);
      for (const entry of updates) {
        const { error } = await supabase
          .from('stock_items')
          .update({ image_url: entry.image })
          .eq('company_id', companyId)
          .eq('asin', entry.asin)
          .is('image_url', null);
        if (error) throw error;
      }
    }
  }

  return {
    cachedEanFilled,
    cachedImageFilled,
    catalogEanFilled,
    catalogImageFilled,
    catalogNotFound,
    catalogFailed,
    requestedAsins: remainingAsins.length
  };
}

async function fillMissingImagesFromCatalog({
  spClient,
  companyId,
  marketplaceId,
  asins
}) {
  if (!LISTING_FETCH_IMAGES_FROM_CATALOG) {
    return { processed: 0, found: 0, notFound: 0, failed: 0 };
  }
  const uniqueAsins = Array.from(
    new Set(
      (asins || [])
        .map((a) => (typeof a === 'string' ? a.trim().toUpperCase() : ''))
        .filter(Boolean)
    )
  );
  if (!uniqueAsins.length) {
    return { processed: 0, found: 0, reused: 0, notFound: 0, failed: 0 };
  }

  let found = 0;
  let reused = 0;
  let notFound = 0;
  let failed = 0;
  const catalogMarketplaceIds = resolveCatalogMarketplaceIds(marketplaceId);

  const CACHE_READ_CHUNK_SIZE = Number(process.env.SPAPI_ASIN_ASSETS_READ_CHUNK || 300);
  let cachedRows = [];
  try {
    for (let i = 0; i < uniqueAsins.length; i += CACHE_READ_CHUNK_SIZE) {
      const chunk = uniqueAsins.slice(i, i + CACHE_READ_CHUNK_SIZE);
      if (!chunk.length) continue;
      const cacheRes = await runWithTransientRetry(
        async () => {
          const res = await supabase
            .from('asin_assets')
            .select('asin, image_urls')
            .in('asin', chunk);
          if (res?.error) throw res.error;
          return res;
        },
        `catalog-cache-read company=${companyId} chunk=${Math.floor(i / CACHE_READ_CHUNK_SIZE) + 1}`
      );
      cachedRows.push(...(cacheRes?.data || []));
    }
  } catch (cacheErr) {
    // Non-fatal: dacă nu putem citi cache-ul, continuăm direct cu API calls.
    console.warn(
      `[Listings sync] catalog cache read failed for company=${companyId}; continuing without cache: ${extractErrorText(
        cacheErr
      ).slice(0, 300)}`
    );
    cachedRows = [];
  }

  const cacheMap = new Map();
  for (const row of cachedRows || []) {
    const image = Array.isArray(row?.image_urls)
      ? row.image_urls.find((u) => typeof u === 'string' && u.trim().length)
      : null;
    if (image && row?.asin) {
      cacheMap.set(String(row.asin).trim().toUpperCase(), String(image).trim());
    }
  }

  for (const asin of uniqueAsins) {
    try {
      const cachedImage = cacheMap.get(asin);
      if (cachedImage) {
        const { error: updateCachedErr } = await supabase
          .from('stock_items')
          .update({ image_url: cachedImage })
          .eq('company_id', companyId)
          .eq('asin', asin)
          .is('image_url', null);
        if (updateCachedErr) throw updateCachedErr;
        reused += 1;
        continue;
      }

      let image = null;
      for (const marketId of catalogMarketplaceIds) {
        try {
          image = await fetchCatalogMainImage(spClient, asin, marketId);
          if (image) break;
        } catch (err) {
          if (isCatalogNotFoundError(err)) {
            continue;
          }
          throw err;
        }
      }
      if (!image) {
        notFound += 1;
        continue;
      }

      const { error: cacheErr } = await supabase.from('asin_assets').upsert({
        asin,
        image_urls: [image],
        source: 'amazon_catalog',
        fetched_at: new Date().toISOString()
      });
      if (cacheErr) throw cacheErr;

      const { error: updateErr } = await supabase
        .from('stock_items')
        .update({ image_url: image })
        .eq('company_id', companyId)
        .eq('asin', asin)
        .is('image_url', null);
      if (updateErr) throw updateErr;

      found += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[Listings sync] Catalog image lookup failed company=${companyId} asin=${asin}: ${err?.message || err}`
      );
    }
  }

  return { processed: uniqueAsins.length, found, reused, notFound, failed };
}

async function fetchListingRows(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  if (!marketplaceId) {
    throw new Error('Marketplace ID is required for listing reports');
  }
  const reportId = await createListingReport(spClient, marketplaceId);
  const documentId = await waitForReport(spClient, reportId);
  const documentText = await downloadReportDocument(spClient, documentId);
  if (DEBUG_LISTING_RAW_HEADER) {
    const lines = String(documentText || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '');
    const headerLine = lines[0] || '';
    const delimiter = headerLine.includes('\t')
      ? '\\t'
      : headerLine.includes(';')
      ? ';'
      : ',';
    const headerNormalized = headerLine.toLowerCase();
    const hasImageHeader =
      headerNormalized.includes('image-url') ||
      headerNormalized.includes('image_url') ||
      headerNormalized.includes('imageurl') ||
      headerNormalized.includes('url-image') ||
      headerNormalized.includes('url image');
    console.log(
      `[Listings sync] raw-header marketplace=${marketplaceId} delimiter=${delimiter} hasImageHeader=${hasImageHeader} header="${headerLine.slice(
        0,
        1000
      )}"`
    );
  }
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
      .select(
        'id, company_id, user_id, sku, asin, ean, name, image_url, amazon_fulfillment_mode, amazon_fulfillment_channels',
        { head: false }
      )
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

function buildStockItemIndexes(stockItems = []) {
  const byCombo = new Map();
  const bySku = new Map();
  const byAsin = new Map();
  const byEan = new Map();

  for (const row of stockItems) {
    const comboKey = makeCombinationKey(row?.company_id, row?.sku, row?.asin);
    const skuKey = normalizeIdentifier(row?.sku);
    const asinKey = normalizeIdentifier(row?.asin);
    const eanKey = normalizeEan(row?.ean);
    if (comboKey && !byCombo.has(comboKey)) byCombo.set(comboKey, row);
    if (skuKey && !bySku.has(skuKey)) bySku.set(skuKey, row);
    if (asinKey && !byAsin.has(asinKey)) byAsin.set(asinKey, row);
    if (eanKey && !byEan.has(eanKey)) byEan.set(eanKey, row);
  }

  return { byCombo, bySku, byAsin, byEan };
}

function findStockItemForListing(listing, companyId, stockIndexes) {
  const comboKey = makeCombinationKey(companyId, listing?.sku, listing?.asin);
  const skuKey = normalizeIdentifier(listing?.sku);
  const asinKey = normalizeIdentifier(listing?.asin);
  const eanKey = normalizeEan(listing?.ean);

  return (
    (comboKey ? stockIndexes.byCombo.get(comboKey) : null) ||
    (skuKey ? stockIndexes.bySku.get(skuKey) : null) ||
    (asinKey ? stockIndexes.byAsin.get(asinKey) : null) ||
    (eanKey ? stockIndexes.byEan.get(eanKey) : null) ||
    null
  );
}

function findStockItemForFulfillment(listing, companyId, stockIndexes) {
  const comboKey = makeCombinationKey(companyId, listing?.sku, listing?.asin);
  const skuKey = normalizeIdentifier(listing?.sku);
  const asinKey = normalizeIdentifier(listing?.asin);
  const eanKey = normalizeEan(listing?.ean);

  if (comboKey && stockIndexes.byCombo.has(comboKey)) {
    return stockIndexes.byCombo.get(comboKey);
  }

  if (skuKey && stockIndexes.bySku.has(skuKey)) {
    return stockIndexes.bySku.get(skuKey);
  }

  // Fallback pe ASIN/EAN doar când listingul nu are SKU. Altfel riscăm
  // să amestecăm două listinguri diferite ale aceluiași ASIN (ex: FBA + FBM).
  if (!skuKey) {
    if (asinKey && stockIndexes.byAsin.has(asinKey)) {
      return stockIndexes.byAsin.get(asinKey);
    }
    if (eanKey && stockIndexes.byEan.has(eanKey)) {
      return stockIndexes.byEan.get(eanKey);
    }
  }

  return null;
}

async function syncListingChannels({
  companyId,
  sellerId,
  marketplaceId,
  listings,
  stockItems
}) {
  if (!companyId || !sellerId || !marketplaceId) {
    return { upserted: 0, removed: 0, matched: 0 };
  }

  const stockIndexes = buildStockItemIndexes(stockItems);
  const rowsByKey = new Map();
  const matchedStockIds = new Set();

  for (const listing of listings || []) {
    const stockItem = findStockItemForFulfillment(listing, companyId, stockIndexes);
    if (!stockItem?.id) continue;

    const channel = normalizeFulfillmentChannel(listing?.fulfillmentChannel);
    if (!channel) continue;

    matchedStockIds.add(stockItem.id);
    const rowKey = `${companyId}::${stockItem.id}::${sellerId}::${marketplaceId}::${channel}`;
    rowsByKey.set(rowKey, {
      company_id: companyId,
      stock_item_id: stockItem.id,
      seller_id: sellerId,
      marketplace_id: marketplaceId,
      fulfillment_channel: channel,
      raw_status: listing?.status || null,
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  const rows = Array.from(rowsByKey.values());
  if (rows.length) {
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('amazon_listing_channels')
        .upsert(chunk, {
          onConflict: 'company_id,stock_item_id,seller_id,marketplace_id,fulfillment_channel'
        });
      if (error) throw error;
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('amazon_listing_channels')
    .select('id, stock_item_id, fulfillment_channel')
    .eq('company_id', companyId)
    .eq('seller_id', sellerId)
    .eq('marketplace_id', marketplaceId);
  if (existingError) throw existingError;

  const keepKeys = new Set(rowsByKey.keys());
  const staleIds = (existingRows || [])
    .filter((row) => {
      const keepKey = `${companyId}::${row.stock_item_id}::${sellerId}::${marketplaceId}::${row.fulfillment_channel}`;
      return !keepKeys.has(keepKey);
    })
    .map((row) => row.id)
    .filter(Boolean);

  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from('amazon_listing_channels')
      .delete()
      .in('id', staleIds);
    if (deleteError) throw deleteError;
  }

  return {
    upserted: rows.length,
    removed: staleIds.length,
    matched: matchedStockIds.size
  };
}

function buildFulfillmentMode(channels = []) {
  const normalized = Array.from(
    new Set((channels || []).map((value) => normalizeFulfillmentChannel(value)).filter(Boolean))
  );
  if (normalized.includes('FBA')) return 'FBA';
  if (normalized.includes('FBM')) return 'FBM';
  return null;
}

async function syncStockItemFulfillmentSummary({ companyId, listings, stockItems }) {
  if (!companyId || !Array.isArray(listings) || !listings.length || !Array.isArray(stockItems) || !stockItems.length) {
    return { updated: 0 };
  }

  const stockIndexes = buildStockItemIndexes(stockItems);
  const patchesById = new Map();

  for (const listing of listings) {
    const stockItem = findStockItemForFulfillment(listing, companyId, stockIndexes);
    if (!stockItem?.id) continue;

    const channel = normalizeFulfillmentChannel(listing?.fulfillmentChannel);
    if (!channel) continue;

    const existingChannels = Array.isArray(stockItem.amazon_fulfillment_channels)
      ? stockItem.amazon_fulfillment_channels
      : [];
    const nextChannels = Array.from(
      new Set([...existingChannels, channel].map((value) => normalizeFulfillmentChannel(value)).filter(Boolean))
    );
    const nextMode = buildFulfillmentMode(nextChannels);

    patchesById.set(stockItem.id, {
      id: stockItem.id,
      amazon_fulfillment_mode: nextMode,
      amazon_fulfillment_channels: nextChannels
    });
  }

  const patches = Array.from(patchesById.values());
  for (const patch of patches) {
    const { id, ...payload } = patch;
    const { error } = await supabase.from('stock_items').update(payload).eq('id', id);
    if (error) throw error;
  }

  return { updated: patches.length };
}

async function insertListingRows(rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({ ...row }));
    if (!chunk.length) continue;
    const insertOptions = { ignoreDuplicates: true, onConflict: 'company_id,sku,asin' };
    const { error } = await supabase
      .from('stock_items')
      // ignorăm complet liniile care există deja (nu vrem să atingem stoc/poze)
      .insert(chunk, insertOptions);
    if (!error) continue;
    const isBatchConflict =
      error.code === '21000' ||
      (typeof error.message === 'string' &&
        error.message.includes('ON CONFLICT DO UPDATE command cannot affect row a second time'));
    const isDuplicate = error.code === '23505';
    if (!isBatchConflict && !isDuplicate) throw error;
    console.warn(
      `[Listings sync] Batch insert warning for company ${chunk[0]?.company_id || 'unknown'}:`,
      error.details || error.message
    );
    for (const row of chunk) {
      const { error: rowError } = await supabase.from('stock_items').insert(row, insertOptions);
      if (rowError) {
        if (
          rowError.code === '23505' ||
          (typeof rowError.message === 'string' &&
            rowError.message.includes('ON CONFLICT DO UPDATE command cannot affect row a second time'))
        ) {
          continue;
        }
        throw rowError;
      }
    }
  }
}

async function insertAsinEans(rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('asin_eans')
      .insert(chunk, { ignoreDuplicates: true, onConflict: 'user_id,asin,ean' });
    if (error) {
      // ignore duplicate conflicts
      if (error.code === '23505') continue;
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
    `[${logStamp()}] Syncing LISTINGS for integration ${integration.id} (company ${integration.company_id}, marketplace ${marketplaceId})`
  );

  try {
    const listingRaw = await fetchListingRows(spClient, marketplaceId);
    console.log(`[Listings sync] ${integration.id} stage=parse-listings rawRows=${listingRaw.length}`);
    if (DEBUG_LISTING_HEADERS && listingRaw.length) {
      const headers = Object.keys(listingRaw[0] || {});
      console.log(
        `[Listings sync] ${integration.id} headers=${headers.join(',')} image-column=${
          headers.includes('imageUrl') || headers.includes('image-url') ? 'yes' : 'no'
        }`
      );
    }
    const normalized = normalizeListings(listingRaw);
    const listingRows = filterListings(normalized);
    const fulfillmentSummary = summarizeFulfillmentChannels(listingRows);
    console.log(
      `[Listings sync] ${integration.id} stage=catalog-details-enrichment filteredRows=${listingRows.length}`
    );
    const catalogDetailStats = await enrichListingsCatalogDetails({
      spClient,
      marketplaceId,
      companyId: integration.company_id,
      userId: integration.user_id,
      listings: listingRows
    });
    const listingRowsWithImage = listingRows.filter(
      (r) => r.imageUrl && String(r.imageUrl).trim().length > 0
    ).length;

    const emptySku = listingRaw.filter((r) => !String(r.sku || '').trim()).length;
    const emptyAsin = listingRaw.filter((r) => !String(r.asin || '').trim() && !String(r.productId || '').trim()).length;
    console.log(
      `[Listings sync] ${integration.id} raw=${listingRaw.length} normalized=${normalized.length} filtered=${listingRows.length} withImage=${listingRowsWithImage} emptySku=${emptySku} emptyAsin=${emptyAsin} eanCached=${catalogDetailStats.cachedEanFilled} imageCached=${catalogDetailStats.cachedImageFilled} eanCatalog=${catalogDetailStats.catalogEanFilled} imageCatalog=${catalogDetailStats.catalogImageFilled} catalogRequested=${catalogDetailStats.requestedAsins} catalogNotFound=${catalogDetailStats.catalogNotFound} catalogFailed=${catalogDetailStats.catalogFailed} fulfillment=${fulfillmentSummary.normalizedSummary || 'none'} rawFulfillment=${fulfillmentSummary.rawSummary || 'none'}`
    );
    if (fulfillmentSummary.fbm === 0) {
      console.warn(
        `[Listings sync] ${integration.id} marketplace=${marketplaceId} returned no FBM rows. Raw fulfillment values seen: ${fulfillmentSummary.rawSummary || 'none'}`
      );
    }

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

    console.log(`[Listings sync] ${integration.id} stage=fetch-existing-stock start`);
    const existing = await fetchCompanyStockItems(integration.company_id);
    console.log(
      `[Listings sync] ${integration.id} stage=fetch-existing-stock done existingRows=${existing.length}`
    );

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
    let insertsWithImage = 0;
    const updatesWithImage = new Set();
    const updatesById = new Map();
    const asinEanRows = [];
    const queueUpdate = (patch) => {
      if (!patch?.id) return;
      const prev = updatesById.get(patch.id) || { id: patch.id };
      updatesById.set(patch.id, { ...prev, ...patch });
    };
    // Regula: nu rescriem rândurile existente, dar completăm titlul dacă lipsește.

    for (const listing of listingRows) {
      if (!listing.key || seen.has(listing.key)) continue;
      seen.add(listing.key);
      const row = existingByKey.get(listing.key);
      if (row) {
        const patch = { id: row.id };
        let shouldPatch = false;
        const incomingSku = listing.sku && String(listing.sku).trim();
        const existingSku = row.sku && String(row.sku).trim();
        const normalizedIncomingSku = normalizeIdentifier(incomingSku);
        const normalizedExistingSku = normalizeIdentifier(existingSku);
        const hasIncomingName = listing.name && String(listing.name).trim().length > 0;
        const hasExistingName = row.name && String(row.name).trim().length > 0;
        const hasIncomingImage = listing.imageUrl && String(listing.imageUrl).trim().length > 0;
        const hasExistingImage = row.image_url && String(row.image_url).trim().length > 0;
        const needsEan = listing.ean && (!row.ean || !String(row.ean).trim().length);
        if (needsEan) {
          patch.ean = listing.ean;
          shouldPatch = true;
        }
        if (hasIncomingImage && !hasExistingImage) {
          patch.image_url = listing.imageUrl;
          shouldPatch = true;
          updatesWithImage.add(row.id);
        }
        const needsNameReplace = isCorruptedName(row.name) || isPlaceholderName(row.name, row.asin || listing.asin);
        // Keep existing valid titles, but backfill missing/corrupted ones.
        if ((!hasExistingName || needsNameReplace) && hasIncomingName) {
          patch.name = listing.name;
          shouldPatch = true;
        }
        // Keep SKU exactly as Amazon reports it (including letter casing).
        // We only patch when normalized value is the same, to avoid changing identity.
        if (
          incomingSku &&
          existingSku &&
          normalizedIncomingSku &&
          normalizedIncomingSku === normalizedExistingSku &&
          incomingSku !== existingSku
        ) {
          patch.sku = incomingSku;
          shouldPatch = true;
        }
        if (shouldPatch) queueUpdate(patch);
        continue;
      }
      // Dacă nu găsim pereche ASIN+SKU, dar există rânduri cu același ASIN și nume lipsă, completăm titlul lor.
      const asinKey = listing.asin ? listing.asin.trim().toUpperCase() : '';
      if (asinKey && existingByAsin.has(asinKey)) {
        const rowsForAsin = existingByAsin.get(asinKey) || [];
        let insertedForAsinMismatch = false;
        for (const r of rowsForAsin) {
          const incomingSku = listing.sku && String(listing.sku).trim();
          const hasExistingName = r.name && String(r.name).trim().length > 0;
          const hasIncomingName = listing.name && String(listing.name).trim().length > 0;
          const hasIncomingImage = listing.imageUrl && String(listing.imageUrl).trim().length > 0;
          const hasExistingImage = r.image_url && String(r.image_url).trim().length > 0;
          const existingSkuNormalized = normalizeIdentifier(r.sku);
          const incomingSkuNormalized = normalizeIdentifier(incomingSku);
          const needsNameReplace = isCorruptedName(r.name) || isPlaceholderName(r.name, r.asin || listing.asin);
          const patch = { id: r.id };
          let shouldPatch = false;
          const needsEan = listing.ean && (!r.ean || !String(r.ean).trim().length);
          if (needsEan) {
            patch.ean = listing.ean;
            r.ean = listing.ean;
            shouldPatch = true;
          }
          if (hasIncomingImage && !hasExistingImage) {
            patch.image_url = listing.imageUrl;
            r.image_url = listing.imageUrl;
            shouldPatch = true;
            updatesWithImage.add(r.id);
          }
          // Complete SKU only when missing in DB.
          // Do NOT overwrite an existing SKU based on ASIN-only matching:
          // one ASIN can have multiple seller SKUs (FBA/FBM variants), and this can
          // corrupt identifiers if the report row is ambiguous or inconsistent.
          if (incomingSku && !existingSkuNormalized) {
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
          } else if (
            incomingSku &&
            existingSkuNormalized &&
            existingSkuNormalized !== incomingSkuNormalized
          ) {
            if (!insertedForAsinMismatch && listing.asin) {
              const comboKey = makeCombinationKey(
                integration.company_id,
                incomingSku,
                listing.asin
              );
              if (comboKey && existingCombinationKeys.has(comboKey)) {
                console.warn(
                  `[Listings sync] SKU mismatch for company ${r.company_id} asin ${r.asin}: existing "${r.sku}", incoming "${incomingSku}" already exists as separate row.`
                );
              } else {
                inserts.push({
                  company_id: integration.company_id,
                  user_id: integration.user_id,
                  asin: listing.asin || null,
                  sku: incomingSku || null,
                  ean: listing.ean || null,
                  name: listing.name || listing.asin || incomingSku,
                  image_url: listing.imageUrl || null,
                  qty: 0
                });
                if (comboKey) {
                  existingCombinationKeys.add(comboKey);
                }
                if (listing.imageUrl && String(listing.imageUrl).trim().length > 0) {
                  insertsWithImage += 1;
                }
                console.warn(
                  `[Listings sync] SKU mismatch for company ${r.company_id} asin ${r.asin}: created separate row for incoming SKU "${incomingSku}" (kept existing "${r.sku}").`
                );
              }
              insertedForAsinMismatch = true;
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
          if (shouldPatch) queueUpdate(patch);
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
            ean: listing.ean || null,
            name: listing.name || listing.asin || listing.sku,
            image_url: listing.imageUrl || null,
            qty: 0
          });
          if (listing.imageUrl && String(listing.imageUrl).trim().length > 0) {
            insertsWithImage += 1;
          }
        }
      }

      if (listing.asin && listing.ean) {
        asinEanRows.push({
          user_id: integration.user_id,
          company_id: integration.company_id,
          asin: listing.asin,
          ean: listing.ean
        });
      }
    }

    console.log(
      `[Listings sync] ${integration.id} stage=prepare-writes inserts=${inserts.length} updates=${updatesById.size} asinEans=${asinEanRows.length}`
    );
    await insertListingRows(inserts);
    await insertAsinEans(asinEanRows);

    const updates = Array.from(updatesById.values());
    console.log(
      `[Listings sync] ${integration.id} stage=apply-updates updateRows=${updates.length}`
    );
    if (updates.length) {
      for (const patch of updates) {
        if (!patch?.id) continue;
        const { id, ...payload } = patch;
        if (!Object.keys(payload).length) continue;
        const { error: updateError } = await supabase
          .from('stock_items')
          .update(payload)
          .eq('id', id);
        if (updateError) {
          if (updateError.code === '23505') {
            console.warn(
              `[Listings sync] Duplicate combination while updating stock_item ${patch.id}, skipping.`,
              updateError.details || updateError.message
            );
            continue;
          }
          throw updateError;
        }
      }
    }

    console.log(`[Listings sync] ${integration.id} stage=refresh-stock-after-writes start`);
    const latestStockItems = await fetchCompanyStockItems(integration.company_id);
    console.log(
      `[Listings sync] ${integration.id} stage=refresh-stock-after-writes done stockRows=${latestStockItems.length}`
    );
    console.log(`[Listings sync] ${integration.id} stage=sync-fulfillment-summary start`);
    const fulfillmentSummaryStats = await syncStockItemFulfillmentSummary({
      companyId: integration.company_id,
      listings: listingRows,
      stockItems: latestStockItems
    });
    console.log(
      `[Listings sync] ${integration.id} stage=sync-fulfillment-summary done updated=${fulfillmentSummaryStats.updated}`
    );
    console.log(`[Listings sync] ${integration.id} stage=sync-listing-channels start`);
    const channelStats = await syncListingChannels({
      companyId: integration.company_id,
      sellerId: integration.selling_partner_id || integration.id,
      marketplaceId,
      listings: listingRows,
      stockItems: latestStockItems
    });
    console.log(
      `[Listings sync] ${integration.id} stage=sync-listing-channels done upserted=${channelStats.upserted} matched=${channelStats.matched} removed=${channelStats.removed}`
    );

    await supabase
      .from('amazon_integrations')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id);

    console.log(
      `Listings integration ${integration.id} synced (${inserts.length} new rows from ${listingRows.length} listing rows, images: report=${listingRowsWithImage}, inserted=${insertsWithImage}, updated=${updatesWithImage.size}, channels=${channelStats.upserted}, channelMatched=${channelStats.matched}, channelRemoved=${channelStats.removed}, fulfillmentSummary=${fulfillmentSummaryStats.updated}, catalogRequested=${catalogDetailStats.requestedAsins}, eanCatalog=${catalogDetailStats.catalogEanFilled}, imageCatalog=${catalogDetailStats.catalogImageFilled}, catalogNotFound=${catalogDetailStats.catalogNotFound}, catalogFailed=${catalogDetailStats.catalogFailed}).`
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
  const integrations = await runWithTransientRetry(
    () => fetchActiveIntegrations(),
    'fetchActiveIntegrations'
  );
  if (!integrations.length) {
    console.log('No active amazon_integrations found for listings. Nothing to do.');
    return;
  }

  const syncState = await getSyncState();
  const batchPlan = selectIntegrationBatch(integrations, syncState);
  const cycleStartedAt =
    batchPlan.startIndex === 0 || !syncState.cycle_started_at
      ? new Date().toISOString()
      : syncState.cycle_started_at;

  console.log(
    `[Listings sync] batch start marketplace=${process.env.SPAPI_LISTING_MARKETPLACE_ID || DEFAULT_MARKETPLACE} total=${batchPlan.total} startIndex=${batchPlan.startIndex} batchSize=${batchPlan.batch.length} nextIndex=${batchPlan.nextIndex} cycleCompleted=${batchPlan.cycleCompleted}`
  );

  for (const integration of batchPlan.batch) {
    await syncListingsIntegration(integration);
  }

  await saveSyncState({
    next_integration_index: batchPlan.nextIndex,
    cycle_started_at: cycleStartedAt,
    cycle_completed_at: batchPlan.cycleCompleted ? new Date().toISOString() : null,
    last_batch_size: batchPlan.batch.length
  });

  console.log(
    `[Listings sync] batch done processed=${batchPlan.batch.length}/${batchPlan.total} nextIndex=${batchPlan.nextIndex} cycleCompleted=${batchPlan.cycleCompleted}`
  );
  console.log('Listing integrations batch processed ✅');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Listings sync failed:', err?.response?.data || err);
    process.exit(1);
  });
}
