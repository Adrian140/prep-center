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
const DEBUG_LISTING_HEADERS =
  String(process.env.SPAPI_LISTING_DEBUG_HEADERS || '').toLowerCase() === 'true' ||
  String(process.env.SPAPI_LISTING_DEBUG_HEADERS || '').trim() === '1';
const DEBUG_LISTING_RAW_HEADER =
  String(process.env.SPAPI_LISTING_DEBUG_RAW_HEADER || '').toLowerCase() === 'true' ||
  String(process.env.SPAPI_LISTING_DEBUG_RAW_HEADER || '').trim() === '1';
const LISTING_FETCH_IMAGES_FROM_CATALOG =
  String(process.env.SPAPI_LISTING_FETCH_IMAGES_FROM_CATALOG || 'true').toLowerCase() !== 'false';
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
      ean: ean || null,
      name: sanitizeText(row.name) || null,
      imageUrl: imageUrl || null,
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
      .select('id, company_id, user_id, sku, asin, ean, name, image_url', { head: false })
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
    `Syncing LISTINGS for integration ${integration.id} (company ${integration.company_id}, marketplace ${marketplaceId})`
  );

  try {
    const listingRaw = await fetchListingRows(spClient, marketplaceId);
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
    const listingRowsWithImage = listingRows.filter(
      (r) => r.imageUrl && String(r.imageUrl).trim().length > 0
    ).length;

    const emptySku = listingRaw.filter((r) => !String(r.sku || '').trim()).length;
    const emptyAsin = listingRaw.filter((r) => !String(r.asin || '').trim() && !String(r.productId || '').trim()).length;
    console.log(
      `[Listings sync] ${integration.id} raw=${listingRaw.length} normalized=${normalized.length} filtered=${listingRows.length} withImage=${listingRowsWithImage} emptySku=${emptySku} emptyAsin=${emptyAsin}`
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
    let insertsWithImage = 0;
    const updatesWithImage = new Set();
    const catalogImageCandidates = new Set();
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
        const needsNameReplace = isCorruptedName(row.name);
        // Keep existing valid titles, but backfill missing/corrupted ones.
        if ((!hasExistingName || needsNameReplace) && hasIncomingName) {
          patch.name = listing.name;
          shouldPatch = true;
        }
        if (shouldPatch) queueUpdate(patch);
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
          const hasIncomingImage = listing.imageUrl && String(listing.imageUrl).trim().length > 0;
          const hasExistingImage = r.image_url && String(r.image_url).trim().length > 0;
          const existingSkuNormalized = normalizeIdentifier(r.sku);
          const incomingSkuNormalized = normalizeIdentifier(incomingSku);
          const needsNameReplace = isCorruptedName(r.name);
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
          if (listing.asin && !(listing.imageUrl && String(listing.imageUrl).trim().length > 0)) {
            // Fetch catalog image only for newly inserted ASINs in this run.
            catalogImageCandidates.add(String(listing.asin).trim().toUpperCase());
          }
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

    await insertListingRows(inserts);
    await insertAsinEans(asinEanRows);

    const updates = Array.from(updatesById.values());
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

    const catalogImageStats = await fillMissingImagesFromCatalog({
      spClient,
      companyId: integration.company_id,
      marketplaceId,
      asins: Array.from(catalogImageCandidates)
    });

    await supabase
      .from('amazon_integrations')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id);

    console.log(
      `Listings integration ${integration.id} synced (${inserts.length} new rows from ${listingRows.length} listing rows, images: report=${listingRowsWithImage}, inserted=${insertsWithImage}, updated=${updatesWithImage.size}, catalogProcessed=${catalogImageStats.processed}, catalogFound=${catalogImageStats.found}, catalogReused=${catalogImageStats.reused}, catalogNotFound=${catalogImageStats.notFound}, catalogFailed=${catalogImageStats.failed}).`
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
