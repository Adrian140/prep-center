import 'dotenv/config';
import { gunzipSync } from 'zlib';
import { TextDecoder } from 'util';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const TARGET_MARKETS = [
  { id: 'A13V1IB3VIYZZH', code: 'FR' },
  { id: 'A1PA6795UKMFR9', code: 'DE' },
  { id: 'APJ6JRA9NG5V4', code: 'IT' },
  { id: 'A1RKKUPIHCS9HS', code: 'ES' },
  { id: 'AMEN7PMS3EDWL', code: 'BE' },
  { id: 'A1805IZSGTT6HS', code: 'NL' },
  { id: 'A2NODRKZP88ZB9', code: 'SE' },
  { id: 'A1C3SOZRARQ6R3', code: 'PL' },
  { id: 'A1F83G8C2ARO7P', code: 'UK' }
  // Ireland nu are marketplace dedicat; folosim UK pentru acoperire.
];

const LISTING_REPORT_TYPE = 'GET_MERCHANT_LISTINGS_ALL_DATA';
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 10_000);
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 240);
const TIME_BUDGET_MS = Number(process.env.SPAPI_LISTING_PRESENCE_TIME_BUDGET_MS || 16_200_000); // 4.5h
const TIME_BUDGET_BUFFER_MS = Number(process.env.SPAPI_LISTING_PRESENCE_TIME_BUDGET_BUFFER_MS || 180_000); // 3m
const DEBUG_SKUS = new Set(
  (process.env.LISTING_PRESENCE_DEBUG_SKUS || '')
    .split(',')
    .map((v) => normalizeIdentifier(v))
    .filter(Boolean)
);
const DEBUG_COMPANIES = new Set(
  (process.env.LISTING_PRESENCE_DEBUG_COMPANIES || '')
    .split(',')
    .map((v) => String(v).trim())
    .filter(Boolean)
);

function assertBaseEnv() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE',
    'SPAPI_LWA_CLIENT_ID',
    'SPAPI_LWA_CLIENT_SECRET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'SPAPI_ROLE_ARN'
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeIdentifier(value) {
  if (!value && value !== 0) return '';
  return String(value)
    .normalize('NFKC')
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, '') // NBSP & zero-width
    .replace(/[‐‑‒–—―]/g, '-') // unify dash variants to ASCII hyphen
    .trim()
    .toLowerCase();
}

function shouldDebug(companyId, skuKey, asinKey) {
  if (!DEBUG_SKUS.size) return false;
  if (DEBUG_COMPANIES.size && !DEBUG_COMPANIES.has(String(companyId))) return false;
  if (skuKey && DEBUG_SKUS.has(skuKey)) return true;
  if (asinKey && DEBUG_SKUS.has(asinKey)) return true;
  return false;
}

function normalizeHeaderKey(rawHeader) {
  const original = String(rawHeader || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '');
  if (!original) return '';
  if (['sellersku', 'seller-sku', 'sku-seller', 'skuvendeur', 'skuvenditore', 'skuvendedor', 'sku'].includes(original)) {
    return 'sku';
  }
  if (['asin', 'asin1'].includes(original)) return 'asin';
  if (['status', 'item-status', 'etat', 'estado', 'stato'].includes(original)) return 'status';
  return original;
}

function parseListingRows(tsvText) {
  const cleanText = String(tsvText || '').replace(/^\uFEFF/, '');
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ''))
    .filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headerLine = lines.shift();
  const delimiter = headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';
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
  return rawRows
    .map((row) => {
      const sku = String(row.sku || '').trim();
      const asin = String(row.asin || '').trim();
      const status = String(row.status || '').trim();
      if (!sku && !asin) return null;
      return { sku: sku || null, asin: asin || null, status };
    })
    .filter(Boolean);
}

async function createListingReport(spClient, marketplaceId) {
  const response = await spClient.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body: {
      reportType: LISTING_REPORT_TYPE,
      marketplaceIds: [marketplaceId]
    }
  });
  if (!response?.reportId) throw new Error(`Failed to create listing report for marketplace ${marketplaceId}`);
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
    if (report.processingStatus === 'DONE') return report.reportDocumentId;
    if (['FATAL', 'CANCELLED', 'DONE_NO_DATA'].includes(report.processingStatus)) {
      return null;
    }
    await delay(REPORT_POLL_INTERVAL);
  }
  return null;
}

async function downloadReportDocument(spClient, reportDocumentId) {
  const document = await spClient.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId }
  });
  if (!document?.url) return '';

  const fetchImpl = globalThis.fetch || (await import('node-fetch').then((mod) => mod.default));
  const response = await fetchImpl(document.url);
  if (!response.ok) throw new Error(`Failed to download listing report document (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);
  if (document.compressionAlgorithm === 'GZIP') {
    buffer = gunzipSync(buffer);
  }

  const utf8 = buffer.toString('utf-8');
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 10) {
    return new TextDecoder('latin1').decode(buffer);
  }
  return utf8;
}

async function fetchActiveIntegrations() {
  const { data, error } = await supabase
    .from('amazon_integrations')
    .select('id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, status, last_synced_at')
    .eq('status', 'active')
    .order('id', { ascending: true });
  if (error) throw error;

  const integrations = Array.isArray(data) ? data : [];
  const sellerIds = integrations
    .map((row) => row.selling_partner_id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  const tokenMap = new Map();
  if (sellerIds.length) {
    const { data: tokens, error: tokenErr } = await supabase
      .from('seller_tokens')
      .select('seller_id, refresh_token')
      .in('seller_id', sellerIds);
    if (tokenErr) throw tokenErr;
    (tokens || []).forEach((t) => {
      if (t?.seller_id) tokenMap.set(t.seller_id, t.refresh_token || null);
    });
  }

  const dedup = new Map();
  for (const row of integrations) {
    const sellerId = row.selling_partner_id || `integration-${row.id}`;
    const refreshToken = tokenMap.get(row.selling_partner_id) || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null;
    if (!refreshToken) continue;
    const key = `${row.company_id}::${sellerId}`;
    if (!dedup.has(key)) {
      dedup.set(key, {
        ...row,
        seller_id: sellerId,
        refresh_token: refreshToken
      });
    }
  }

  return Array.from(dedup.values()).sort((a, b) => {
    if (a.company_id === b.company_id) return String(a.seller_id).localeCompare(String(b.seller_id));
    return String(a.company_id).localeCompare(String(b.company_id));
  });
}

function isAccessDenied(err) {
  const text = String(err?.message || err?.details || '').toLowerCase();
  const status = Number(err?.status || err?.code || err?.response?.status || 0);
  return status === 401 || status === 403 || text.includes('access to requested resource is denied');
}

async function getSyncState() {
  const { data, error } = await supabase
    .from('amazon_listing_presence_sync_state')
    .select('*')
    .eq('key', 'default')
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: inserted, error: insertErr } = await supabase
    .from('amazon_listing_presence_sync_state')
    .insert({ key: 'default', next_integration_index: 0 })
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  return inserted;
}

async function saveSyncState(patch) {
  const payload = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('amazon_listing_presence_sync_state')
    .update(payload)
    .eq('key', 'default');
  if (error) throw error;
}

async function fetchCompanyStockItems(companyId) {
  let from = 0;
  const pageSize = 1000;
  const all = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('stock_items')
      .select('id, company_id, asin, sku')
      .eq('company_id', companyId)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return all.filter((row) => normalizeIdentifier(row?.asin) || normalizeIdentifier(row?.sku));
}

function buildListingIndex(listings = []) {
  const bySku = new Map();
  const byAsin = new Map();
  for (const row of listings) {
    const skuKey = normalizeIdentifier(row?.sku);
    const asinKey = normalizeIdentifier(row?.asin);
    if (skuKey && !bySku.has(skuKey)) bySku.set(skuKey, row);
    if (asinKey && !byAsin.has(asinKey)) byAsin.set(asinKey, row);
  }
  return { bySku, byAsin };
}

async function syncIntegrationMarket(params) {
  const { companyId, sellerId, spClient, marketId, startedAt } = params;
  const stockItems = await fetchCompanyStockItems(companyId);
  if (!stockItems.length) return { marketId, total: 0, matched: 0 };

  const reportId = await createListingReport(spClient, marketId);
  const reportDocumentId = await waitForReport(spClient, reportId);
  if (!reportDocumentId) {
    console.warn(`[listing-presence] report unavailable for company ${companyId}, market ${marketId}; skip overwrite.`);
    return { marketId, total: stockItems.length, matched: 0, skipped: true };
  }

  const rawDoc = await downloadReportDocument(spClient, reportDocumentId);
  const rawRows = parseListingRows(rawDoc);
  const listings = normalizeListings(rawRows);
  const { bySku, byAsin } = buildListingIndex(listings);

  const rows = stockItems.map((item) => {
    const skuKey = normalizeIdentifier(item.sku);
    const asinKey = normalizeIdentifier(item.asin);
    const hitBySku = skuKey ? bySku.get(skuKey) : null;
    const hitByAsin = !hitBySku && asinKey ? byAsin.get(asinKey) : null;
    const hit = hitBySku || hitByAsin || null;
    if (shouldDebug(companyId, skuKey, asinKey)) {
      console.log(
        `[listing-presence][debug] company=${companyId} market=${marketId} sku=${item.sku} asin=${item.asin} ` +
          `status=${hit?.status || 'NOT_FOUND'} reportSku=${hit?.sku || ''} source=${
            hitBySku ? 'sku_report_match' : hitByAsin ? 'asin_report_match' : 'report_not_found'
          }`
      );
    }
    return {
      company_id: item.company_id,
      stock_item_id: item.id,
      seller_id: sellerId,
      marketplace_id: marketId,
      exists_on_marketplace: Boolean(hit),
      resolved_sku: hit?.sku || null,
      source: hitBySku ? 'sku_report_match' : hitByAsin ? 'asin_report_match' : 'report_not_found',
      raw_status: hit?.status || (hit ? 'LISTED' : 'NOT_FOUND'),
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  const chunk = 1000;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const { error } = await supabase
      .from('amazon_listing_presence')
      .upsert(part, { onConflict: 'company_id,stock_item_id,seller_id,marketplace_id' });
    if (error) throw error;

    if (Date.now() - startedAt >= TIME_BUDGET_MS - TIME_BUDGET_BUFFER_MS) {
      break;
    }
  }

  return {
    marketId,
    total: rows.length,
    matched: rows.filter((r) => r.exists_on_marketplace).length
  };
}

async function syncIntegration(integration, startedAt) {
  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  // Validare rapidă: dacă token-ul nu are permisiuni SP-API, sărim tot seller-ul.
  try {
    await spClient.callAPI({
      operation: 'getMarketplaceParticipations',
      endpoint: 'sellers'
    });
  } catch (err) {
    if (isAccessDenied(err)) {
      console.warn(
        `[listing-presence] skipping seller ${integration.seller_id || integration.selling_partner_id
        } (company ${integration.company_id}) — SP-API access denied`
      );
      return [];
    }
    throw err;
  }

  console.log(`[listing-presence] syncing company ${integration.company_id}, seller ${integration.seller_id}`);

  const marketResults = [];
  for (const market of TARGET_MARKETS) {
    if (Date.now() - startedAt >= TIME_BUDGET_MS - TIME_BUDGET_BUFFER_MS) break;
    try {
      const result = await syncIntegrationMarket({
        companyId: integration.company_id,
        sellerId: integration.seller_id,
        spClient,
        marketId: market.id,
        startedAt
      });
      marketResults.push(result);
      console.log(
        `[listing-presence] company ${integration.company_id} ${market.code}: ${result.matched || 0}/${result.total || 0}`
      );
    } catch (error) {
      console.error(
        `[listing-presence] company ${integration.company_id} ${market.code} failed:`,
        error?.message || error
      );
    }
  }
  return marketResults;
}

async function main() {
  assertBaseEnv();
  const startedAt = Date.now();

  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('[listing-presence] No active integrations.');
    return;
  }

  const state = await getSyncState();
  let nextIndex = Number(state?.next_integration_index || 0);
  if (!Number.isFinite(nextIndex) || nextIndex < 0) nextIndex = 0;
  if (nextIndex >= integrations.length) nextIndex = 0;

  if (!state?.cycle_started_at || nextIndex === 0) {
    await saveSyncState({ cycle_started_at: new Date().toISOString(), cycle_completed_at: null });
  }

  for (let i = nextIndex; i < integrations.length; i += 1) {
    const elapsed = Date.now() - startedAt;
    const remaining = TIME_BUDGET_MS - elapsed;
    if (elapsed >= TIME_BUDGET_MS || remaining <= TIME_BUDGET_BUFFER_MS) {
      console.log('[listing-presence] Time budget reached; stopping gracefully.');
      await saveSyncState({ next_integration_index: i });
      return;
    }

    const integration = integrations[i];
    await syncIntegration(integration, startedAt);
    await saveSyncState({ next_integration_index: i + 1 });
  }

  await saveSyncState({
    next_integration_index: 0,
    cycle_completed_at: new Date().toISOString()
  });
  console.log('[listing-presence] Cycle complete.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[listing-presence] Fatal error:', err?.message || err);
    process.exit(1);
  });
}
