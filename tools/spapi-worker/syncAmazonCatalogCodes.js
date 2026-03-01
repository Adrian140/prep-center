import 'dotenv/config';
import { createDecipheriv } from 'crypto';
import { gunzipSync } from 'zlib';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const REPORT_TYPE = 'GET_FBA_MYI_ALL_INVENTORY_DATA';
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 4000);
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 120);
const MAX_INTEGRATIONS_PER_RUN_RAW = Number(
  process.env.SPAPI_CATALOG_CODES_MAX_INTEGRATIONS_PER_RUN ||
    process.env.SPAPI_MAX_INTEGRATIONS_PER_RUN ||
    20
);
const MAX_ASINS_PER_RUN_RAW = Number(process.env.SPAPI_CATALOG_CODES_ASINS_PER_RUN || 500);
const EAN_FETCH_CONCURRENCY_RAW = Number(process.env.SPAPI_CATALOG_CODES_EAN_CONCURRENCY || 8);
const RUN_TIME_BUDGET_SECONDS_RAW = Number(process.env.SPAPI_CATALOG_CODES_MAX_RUNTIME_SECONDS || 15480); // 4.3h
const MARKETPLACE_FILTER = process.env.SPAPI_CATALOG_CODES_MARKETPLACE_ID || null;
const ALLOWED_MARKETPLACE_IDS = String(
  process.env.SPAPI_CATALOG_CODES_MARKETPLACE_IDS ||
    'A1PA6795UKMFR9,A13V1IB3VIYZZH,APJ6JRA9NG5V4,A1RKKUPIHCS9HS'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const ALLOWED_MARKETPLACE_SET = new Set(ALLOWED_MARKETPLACE_IDS);

const MAX_INTEGRATIONS_PER_RUN =
  Number.isFinite(MAX_INTEGRATIONS_PER_RUN_RAW) && MAX_INTEGRATIONS_PER_RUN_RAW > 0
    ? MAX_INTEGRATIONS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const MAX_ASINS_PER_RUN =
  Number.isFinite(MAX_ASINS_PER_RUN_RAW) && MAX_ASINS_PER_RUN_RAW > 0
    ? MAX_ASINS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const EAN_FETCH_CONCURRENCY =
  Number.isFinite(EAN_FETCH_CONCURRENCY_RAW) && EAN_FETCH_CONCURRENCY_RAW > 0
    ? Math.min(20, Math.max(1, Math.floor(EAN_FETCH_CONCURRENCY_RAW)))
    : 8;
const RUN_TIME_BUDGET_MS =
  Number.isFinite(RUN_TIME_BUDGET_SECONDS_RAW) && RUN_TIME_BUDGET_SECONDS_RAW > 0
    ? RUN_TIME_BUDGET_SECONDS_RAW * 1000
    : Number.POSITIVE_INFINITY;
const LOG_PROGRESS_EVERY_RAW = Number(process.env.SPAPI_CATALOG_CODES_LOG_PROGRESS_EVERY || 25);
const LOG_PROGRESS_EVERY =
  Number.isFinite(LOG_PROGRESS_EVERY_RAW) && LOG_PROGRESS_EVERY_RAW > 0
    ? Math.max(1, Math.floor(LOG_PROGRESS_EVERY_RAW))
    : 25;

function isRuntimeBudgetReached(runState) {
  if (!runState) return false;
  if (runState.stoppedByBudget) return true;
  if (Date.now() - runState.startedAt >= runState.budgetMs) {
    runState.stoppedByBudget = true;
    return true;
  }
  return false;
}

function fmtMs(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value < 1000) return `${Math.max(0, Math.round(value))}ms`;
  return `${(value / 1000).toFixed(1)}s`;
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

function normalizeMarketplaceId(value) {
  return String(value || '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .toUpperCase();
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

function isAccessDeniedError(err) {
  const text = extractErrorText(err).toLowerCase();
  const status = Number(err?.status || err?.response?.status || 0);
  return (
    status === 401 ||
    status === 403 ||
    text.includes('access to requested resource is denied') ||
    text.includes('access denied') ||
    text.includes('unauthorized')
  );
}

function shouldTryNextMarketplaceError(err) {
  const text = extractErrorText(err).toLowerCase();
  return (
    text.includes('report failed with status fatal') ||
    text.includes('amazon report failed with status fatal') ||
    text.includes('done_no_data') ||
    text.includes('completed without data') ||
    text.includes('invalidinput') ||
    text.includes('invalid input')
  );
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
        marketplace_id: process.env.SPAPI_MARKETPLACE_ID || null,
        marketplace_ids: process.env.SPAPI_MARKETPLACE_ID
          ? [process.env.SPAPI_MARKETPLACE_ID]
          : [],
        region: process.env.SPAPI_REGION || 'eu',
        refresh_token: process.env.SPAPI_REFRESH_TOKEN,
        status: 'active'
      }
    ];
  }
  return null;
}

function resolveMarketplaceId(integration) {
  if (integration?.marketplace_id) {
    return normalizeMarketplaceId(integration.marketplace_id);
  }
  if (Array.isArray(integration?.marketplace_ids) && integration.marketplace_ids.length) {
    return normalizeMarketplaceId(integration.marketplace_ids[0]);
  }
  if (process.env.SPAPI_MARKETPLACE_ID) {
    return normalizeMarketplaceId(process.env.SPAPI_MARKETPLACE_ID);
  }
  return null;
}

function resolveMarketplaceIds(integration) {
  const keepAllowed = (list) =>
    list.map((id) => normalizeMarketplaceId(id)).filter((id) => ALLOWED_MARKETPLACE_SET.has(id));
  if (Array.isArray(integration?.marketplace_ids) && integration.marketplace_ids.length) {
    const list = keepAllowed(integration.marketplace_ids);
    const preferred = normalizeMarketplaceId(integration?.marketplace_id || '');
    if (preferred && list.includes(preferred)) {
      return [preferred, ...list.filter((id) => id !== preferred)];
    }
    return list;
  }
  if (integration?.marketplace_id) return keepAllowed([integration.marketplace_id]);
  if (process.env.SPAPI_MARKETPLACE_ID) return keepAllowed([process.env.SPAPI_MARKETPLACE_ID]);
  return [];
}

async function fetchActiveIntegrations() {
  const single = singleModeIntegration();
  if (single) return single;

  let query = supabase
    .from('amazon_integrations')
    .select(
      'id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, status, last_synced_at'
    )
    .eq('status', 'active');

  if (MARKETPLACE_FILTER) {
    query = query.eq('marketplace_id', MARKETPLACE_FILTER);
  }

  const { data, error } = await query.order('last_synced_at', { ascending: true, nullsFirst: true });
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
      if (!t?.seller_id) return;
      tokenMap.set(t.seller_id, {
        refresh_token: t.refresh_token,
        marketplace_ids: Array.isArray(t.marketplace_ids) ? t.marketplace_ids.filter(Boolean) : []
      });
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
      const sellerMarkets = row.selling_partner_id
        ? sellerMarketplaceMap.get(row.selling_partner_id)
        : null;
      const mergedSet = new Set((token?.marketplace_ids || []).filter(Boolean));
      if (row.marketplace_id) mergedSet.add(row.marketplace_id);
      if (sellerMarkets?.size) {
        for (const m of sellerMarkets.values()) mergedSet.add(m);
      }
      const refreshToken = row.refresh_token || token?.refresh_token || null;
      if (!refreshToken) return null;
      return {
        ...row,
        refresh_token: refreshToken,
        marketplace_ids: Array.from(mergedSet).filter(Boolean)
      };
    })
    .filter(Boolean)
    .filter((row) => resolveMarketplaceIds(row).length > 0);

  if (withTokens.length <= MAX_INTEGRATIONS_PER_RUN) return withTokens;
  return withTokens.slice(0, MAX_INTEGRATIONS_PER_RUN);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function waitForReport(spClient, reportId, { integrationId = '', marketplaceId = '' } = {}) {
  const startedAt = Date.now();
  for (let attempt = 0; attempt < REPORT_POLL_LIMIT; attempt += 1) {
    const report = await spClient.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId }
    });

    if (!report) throw new Error('Empty response when polling report status');

    const status = report.processingStatus;
    if (attempt === 0 || (attempt + 1) % 10 === 0) {
      console.log(
        `[Catalog code sync] Integration ${integrationId} marketplace=${marketplaceId} report=${reportId} poll=${attempt + 1}/${REPORT_POLL_LIMIT} status=${status} elapsed=${fmtMs(Date.now() - startedAt)}`
      );
    }

    switch (status) {
      case 'DONE':
        console.log(
          `[Catalog code sync] Integration ${integrationId} marketplace=${marketplaceId} report=${reportId} done in ${fmtMs(Date.now() - startedAt)}`
        );
        return report.reportDocumentId;
      case 'FATAL':
      case 'CANCELLED':
        throw new Error(`Amazon report failed with status ${status}`);
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

  const fetchImpl = globalThis.fetch || (await import('node-fetch').then((mod) => mod.default));
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

  const utf8 = buffer.toString('utf-8');
  if (utf8.includes('�')) {
    try {
      return buffer.toString('latin1');
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function decryptDocument(buffer, encryptionDetails) {
  const key = Buffer.from(encryptionDetails.key, 'base64');
  const iv = Buffer.from(encryptionDetails.initializationVector, 'base64');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}

const COLUMN_ALIASES = new Map([
  ['seller-sku', 'sku'],
  ['sku', 'sku'],
  ['asin', 'asin'],
  ['fnsku', 'fnsku'],
  ['f-nsku', 'fnsku'],
  ['afn-fnsku', 'fnsku']
]);

function normalizeHeader(header) {
  const base = String(header || '').trim().toLowerCase();
  if (!base) return '';
  const sanitized = base.replace(/[^a-z0-9_-]+/g, '');
  return COLUMN_ALIASES.get(base) || COLUMN_ALIASES.get(sanitized) || base;
}

function parseInventoryRows(tsvText) {
  const cleanText = (tsvText || '').replace(/^\uFEFF/, '');
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ''))
    .filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headerLine = lines.shift();
  const delimiter = headerLine.includes('\t') ? '\t' : ',';
  const split = (line) =>
    line
      .split(delimiter === '\t' ? /\t(?=(?:(?:[^"]*"){2})*[^"]*$)/ : /,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map((part) => part.replace(/^"|"$/g, '').trim());

  const headers = split(headerLine).map((h) => normalizeHeader(h));

  return lines.map((line) => {
    const cols = split(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx];
    });
    return row;
  });
}

function normalizeAsin(value) {
  const v = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(v) ? v : null;
}

function normalizeSku(value) {
  const v = String(value || '').trim();
  return v || null;
}

function normalizeFnsku(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return null;
  return /^[A-Z0-9._-]{6,30}$/.test(v) ? v : null;
}

function normalizeEan(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

function normalizeIdentifier(value) {
  return value && String(value).trim().length ? String(value).trim().toLowerCase() : '';
}

function makeComboKey(companyId, sku, asin) {
  const skuKey = normalizeIdentifier(sku);
  const asinKey = normalizeIdentifier(asin);
  if (!companyId || !skuKey || !asinKey) return null;
  return `${companyId}::${skuKey}::${asinKey}`;
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

async function fetchCompanyStockRows(companyId) {
  const rows = [];
  const chunkSize = 1000;
  let from = 0;
  let hasFnskuColumn = true;

  while (true) {
    const to = from + chunkSize - 1;
    const selectedColumns = hasFnskuColumn
      ? 'id, company_id, user_id, sku, asin, ean, fnsku'
      : 'id, company_id, user_id, sku, asin, ean';

    let { data, error } = await supabase
      .from('stock_items')
      .select(selectedColumns)
      .eq('company_id', companyId)
      .range(from, to);

    if (error && hasFnskuColumn && String(error?.message || '').includes('stock_items.fnsku')) {
      hasFnskuColumn = false;
      ({ data, error } = await supabase
        .from('stock_items')
        .select('id, company_id, user_id, sku, asin, ean')
        .eq('company_id', companyId)
        .range(from, to));
    }

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data.map((row) => ({ ...row, fnsku: row?.fnsku || null })));
    if (data.length < chunkSize) break;
    from += chunkSize;
  }

  return { rows, hasFnskuColumn };
}

async function fetchKnownEansByAsin(companyId, asins) {
  const map = new Map();
  const uniqueAsins = Array.from(
    new Set((asins || []).map((v) => String(v || '').trim().toUpperCase()).filter(Boolean))
  );
  if (!uniqueAsins.length) return map;

  const chunkSize = 500;
  for (let i = 0; i < uniqueAsins.length; i += chunkSize) {
    const chunk = uniqueAsins.slice(i, i + chunkSize);

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

    const missing = chunk.filter((asin) => !map.has(asin));
    if (missing.length > 0) {
      // Reuse already resolved ASIN->EAN from any company to speed up sync significantly.
      const { data: globalAsinEans, error: globalAsinEansError } = await supabase
        .from('asin_eans')
        .select('asin, ean')
        .in('asin', missing);
      if (globalAsinEansError) throw globalAsinEansError;
      for (const row of globalAsinEans || []) {
        const asin = String(row?.asin || '').trim().toUpperCase();
        const ean = normalizeEan(row?.ean);
        if (asin && ean && !map.has(asin)) map.set(asin, ean);
      }
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

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function insertAsinEans(rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  const stripFields = (list, fieldsToRemove) =>
    list.map((row) => {
      const next = { ...row };
      fieldsToRemove.forEach((field) => {
        delete next[field];
      });
      return next;
    });

  const isMissingColumnError = (error, columnName) =>
    String(error?.message || '')
      .toLowerCase()
      .includes(`could not find the '${String(columnName || '').toLowerCase()}' column`);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const attempts = [
      { data: chunk, label: 'full' },
      { data: stripFields(chunk, ['confidence']), label: 'no_confidence' },
      { data: stripFields(chunk, ['source']), label: 'no_source' },
      { data: stripFields(chunk, ['source', 'confidence']), label: 'no_source_confidence' }
    ];

    let lastError = null;
    let done = false;
    for (const attempt of attempts) {
      const { error } = await supabase
        .from('asin_eans')
        .upsert(attempt.data, { onConflict: 'user_id,asin,ean', ignoreDuplicates: true });
      if (!error) {
        done = true;
        break;
      }
      lastError = error;
      const missingConfidence = isMissingColumnError(error, 'confidence');
      const missingSource = isMissingColumnError(error, 'source');
      if (!missingConfidence && !missingSource) {
        break;
      }
    }
    if (!done && lastError) throw lastError;
  }
}

async function applyStockPatches(patches, hasFnskuColumn, companyId) {
  if (!patches.length) return;
  const validPatches = patches.filter((patch) => patch && patch.id);
  if (!validPatches.length) return;

  const chunkSize = 100;
  for (let i = 0; i < validPatches.length; i += chunkSize) {
    const chunk = validPatches.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (patch) => {
        const payload = { ...patch };
        delete payload.id;
        if (!hasFnskuColumn) delete payload.fnsku;
        if (Object.keys(payload).length === 0) return;

        let query = supabase.from('stock_items').update(payload).eq('id', patch.id);
        if (companyId) {
          query = query.eq('company_id', companyId);
        }
        const { error } = await query;
        if (error) throw error;
      })
    );
  }
}

async function syncIntegration(integration, runState) {
  const integrationStartedAt = Date.now();
  if (isRuntimeBudgetReached(runState)) {
    return { fnskuUpdated: 0, eanUpdated: 0, asinsResolved: 0, stoppedByBudget: true };
  }
  const reportMarketplaceCandidates = resolveMarketplaceIds(integration);
  if (!reportMarketplaceCandidates.length) {
    console.log(
      `[Catalog code sync] Skip integration ${integration.id}: no FR/DE/IT/ES marketplace configured.`
    );
    return { fnskuUpdated: 0, eanUpdated: 0, asinsResolved: 0 };
  }

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `[Catalog code sync] Integration ${integration.id} company=${integration.company_id} marketplaces=${reportMarketplaceCandidates.join(',')}`
  );

  let rows = [];
  let reportMarketplaceId = null;
  try {
    let lastNonAccessError = null;
    for (const marketId of reportMarketplaceCandidates) {
      if (isRuntimeBudgetReached(runState)) {
        return { fnskuUpdated: 0, eanUpdated: 0, asinsResolved: 0, stoppedByBudget: true };
      }
      try {
        const reportStart = Date.now();
        console.log(
          `[Catalog code sync] Integration ${integration.id} trying marketplace=${marketId}: create report`
        );
        const reportId = await createInventoryReport(spClient, marketId);
        console.log(
          `[Catalog code sync] Integration ${integration.id} marketplace=${marketId} reportId=${reportId} created in ${fmtMs(Date.now() - reportStart)}`
        );
        const waitStart = Date.now();
        const documentId = await waitForReport(spClient, reportId, {
          integrationId: integration.id,
          marketplaceId: marketId
        });
        console.log(
          `[Catalog code sync] Integration ${integration.id} marketplace=${marketId} reportId=${reportId} documentId=${documentId} wait=${fmtMs(Date.now() - waitStart)}`
        );
        const downloadStart = Date.now();
        const rawText = await downloadReportDocument(spClient, documentId);
        console.log(
          `[Catalog code sync] Integration ${integration.id} marketplace=${marketId} report document downloaded in ${fmtMs(Date.now() - downloadStart)}`
        );
        const parseStart = Date.now();
        rows = parseInventoryRows(rawText);
        console.log(
          `[Catalog code sync] Integration ${integration.id} marketplace=${marketId} parsed rows=${rows.length} in ${fmtMs(Date.now() - parseStart)}`
        );
        reportMarketplaceId = marketId;
        break;
      } catch (error) {
        if (isAccessDeniedError(error)) {
          console.log(
            `[Catalog code sync] Integration ${integration.id}: marketplace ${marketId} access denied, trying next.`
          );
          continue;
        }
        if (shouldTryNextMarketplaceError(error)) {
          console.log(
            `[Catalog code sync] Integration ${integration.id}: marketplace ${marketId} report unusable (${extractErrorText(
              error
            )}), trying next.`
          );
          continue;
        }
        lastNonAccessError = error;
        break;
      }
    }
    if (!reportMarketplaceId) {
      if (lastNonAccessError) throw lastNonAccessError;
      console.log(
        `[Catalog code sync] Skip integration ${integration.id}: no authorized marketplace found in FR/DE/IT/ES.`
      );
      await supabase
        .from('amazon_integrations')
        .update({
          last_synced_at: new Date().toISOString(),
          last_error: null
        })
        .eq('id', integration.id);
      return { fnskuUpdated: 0, eanUpdated: 0, asinsResolved: 0 };
    }
    console.log(
      `[Catalog code sync] Integration ${integration.id} using marketplace=${reportMarketplaceId}`
    );
  } catch (error) {
    if (isAccessDeniedError(error)) {
      console.log(
        `[Catalog code sync] Skip integration ${integration.id}: Amazon integration is not authorized for reports in FR/DE/IT/ES.`
      );
      await supabase
        .from('amazon_integrations')
        .update({
          last_synced_at: new Date().toISOString(),
          last_error: null
        })
        .eq('id', integration.id);
      return { fnskuUpdated: 0, eanUpdated: 0, asinsResolved: 0 };
    }
    throw error;
  }

  const reportItems = rows
    .map((row) => ({
      sku: normalizeSku(row.sku),
      asin: normalizeAsin(row.asin),
      fnsku: normalizeFnsku(row.fnsku)
    }))
    .filter((row) => row.sku || row.asin);
  console.log(
    `[Catalog code sync] Integration ${integration.id} reportItems=${reportItems.length} reportMarketplace=${reportMarketplaceId}`
  );

  const stockLoadStart = Date.now();
  const { rows: stockRows, hasFnskuColumn } = await fetchCompanyStockRows(integration.company_id);
  console.log(
    `[Catalog code sync] Integration ${integration.id} stockRows=${stockRows.length} hasFnskuColumn=${hasFnskuColumn ? 1 : 0} load=${fmtMs(Date.now() - stockLoadStart)}`
  );
  const byCombo = new Map();
  const bySku = new Map();
  const byAsin = new Map();

  for (const row of stockRows) {
    const comboKey = makeComboKey(row.company_id, row.sku, row.asin);
    if (comboKey) byCombo.set(comboKey, row);

    const skuKey = normalizeIdentifier(row.sku);
    if (skuKey) {
      const list = bySku.get(skuKey) || [];
      list.push(row);
      bySku.set(skuKey, list);
    }

    const asinKey = String(row.asin || '').trim().toUpperCase();
    if (asinKey) {
      const list = byAsin.get(asinKey) || [];
      list.push(row);
      byAsin.set(asinKey, list);
    }
  }

  const patchesById = new Map();
  const asinSet = new Set();

  for (const item of reportItems) {
    if (item.asin) asinSet.add(item.asin);
    if (!item.fnsku) continue;

    const comboKey = makeComboKey(integration.company_id, item.sku, item.asin);
    let target = comboKey ? byCombo.get(comboKey) : null;

    if (!target && item.sku) {
      const candidates = bySku.get(normalizeIdentifier(item.sku)) || [];
      if (candidates.length === 1) {
        target = candidates[0];
      }
    }

    if (!target) continue;

    if (normalizeFnsku(target.fnsku) !== item.fnsku) {
      const prev = patchesById.get(target.id) || { id: target.id };
      patchesById.set(target.id, { ...prev, fnsku: item.fnsku });
      target.fnsku = item.fnsku;
    }
  }

  let asins = Array.from(asinSet);
  const totalAsinsDetected = asins.length;
  if (asins.length > MAX_ASINS_PER_RUN) {
    asins = asins.slice(0, MAX_ASINS_PER_RUN);
  }
  console.log(
    `[Catalog code sync] Integration ${integration.id} asinsDetected=${totalAsinsDetected} asinsToProcess=${asins.length} maxAsinsPerRun=${Number.isFinite(MAX_ASINS_PER_RUN) ? MAX_ASINS_PER_RUN : 'inf'}`
  );

  const knownLoadStart = Date.now();
  const knownEans = await fetchKnownEansByAsin(integration.company_id, asins);
  console.log(
    `[Catalog code sync] Integration ${integration.id} knownEans=${knownEans.size} load=${fmtMs(Date.now() - knownLoadStart)}`
  );
  const marketplaceIds = resolveMarketplaceIds({
    ...integration,
    marketplace_id: reportMarketplaceId || integration.marketplace_id
  });
  const resolvedAsinEans = new Map();
  const asinEansToInsert = [];

  const missingAsins = asins.filter((asin) => !knownEans.get(asin));
  console.log(
    `[Catalog code sync] Integration ${integration.id} missingAsins=${missingAsins.length} eanFetchConcurrency=${EAN_FETCH_CONCURRENCY}`
  );
  const fetchedEans = new Map();
  if (missingAsins.length > 0 && marketplaceIds.length > 0) {
    const fetchStartedAt = Date.now();
    let completed = 0;
    let found = 0;
    const fetchResults = await mapWithConcurrency(
      missingAsins,
      EAN_FETCH_CONCURRENCY,
      async (asin) => {
        if (isRuntimeBudgetReached(runState)) return { asin, ean: null, stoppedByBudget: true };
        for (const marketId of marketplaceIds) {
          try {
            const candidate = await fetchCatalogEan(spClient, asin, marketId);
            const ean = normalizeEan(candidate);
            if (ean) {
              found += 1;
              return { asin, ean };
            }
          } catch (error) {
            if (isAccessDeniedError(error)) continue;
          }
        }
        return { asin, ean: null };
      }
    );
    console.log(
      `[Catalog code sync] Integration ${integration.id} fetchCatalogEan finished in ${fmtMs(Date.now() - fetchStartedAt)}`
    );
    for (const entry of fetchResults) {
      if (!entry || entry.error) continue;
      if (entry.stoppedByBudget) {
        if (runState) runState.stoppedByBudget = true;
        continue;
      }
      completed += 1;
      if (completed % LOG_PROGRESS_EVERY === 0 || completed === missingAsins.length) {
        console.log(
          `[Catalog code sync] Integration ${integration.id} EAN progress ${completed}/${missingAsins.length} found=${fetchedEans.size}`
        );
      }
      if (entry.ean) fetchedEans.set(entry.asin, entry.ean);
    }
  }

  for (const asin of asins) {
    if (isRuntimeBudgetReached(runState)) break;
    let ean = knownEans.get(asin) || fetchedEans.get(asin) || null;
    if (ean) {
      if (!knownEans.get(asin)) {
        asinEansToInsert.push({
          user_id: integration.user_id,
          company_id: integration.company_id,
          asin,
          ean,
          source: 'catalog_codes_sync',
          confidence: 1
        });
      }
      resolvedAsinEans.set(asin, ean);
      const rowsForAsin = byAsin.get(asin) || [];
      for (const stockRow of rowsForAsin) {
        if (normalizeEan(stockRow.ean)) continue;
        const prev = patchesById.get(stockRow.id) || { id: stockRow.id };
        patchesById.set(stockRow.id, { ...prev, ean });
        stockRow.ean = ean;
      }
    }
  }

  const patches = Array.from(patchesById.values());
  const applyStart = Date.now();
  await applyStockPatches(patches, hasFnskuColumn, integration.company_id);
  console.log(
    `[Catalog code sync] Integration ${integration.id} stock patches applied=${patches.length} in ${fmtMs(Date.now() - applyStart)}`
  );
  const insertStart = Date.now();
  await insertAsinEans(asinEansToInsert);
  console.log(
    `[Catalog code sync] Integration ${integration.id} asin_eans inserted=${asinEansToInsert.length} in ${fmtMs(Date.now() - insertStart)}`
  );

  await supabase
    .from('amazon_integrations')
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null
    })
    .eq('id', integration.id);

  const stats = {
    fnskuUpdated: hasFnskuColumn
      ? Array.from(patchesById.values()).filter((p) => typeof p.fnsku === 'string').length
      : 0,
    eanUpdated: Array.from(patchesById.values()).filter((p) => typeof p.ean === 'string').length,
    asinsResolved: resolvedAsinEans.size
  };

  console.log(
    `[Catalog code sync] Integration ${integration.id} done: fnskuUpdated=${stats.fnskuUpdated} eanUpdated=${stats.eanUpdated} asinsResolved=${stats.asinsResolved} elapsed=${fmtMs(Date.now() - integrationStartedAt)}`
  );

  return { ...stats, stoppedByBudget: Boolean(runState?.stoppedByBudget) };
}

async function main() {
  assertBaseEnv();
  const runState = {
    startedAt: Date.now(),
    budgetMs: RUN_TIME_BUDGET_MS,
    stoppedByBudget: false
  };

  const integrations = await fetchActiveIntegrations();
  console.log(
    `[Catalog code sync] Start: integrations=${integrations.length} maxIntegrationsPerRun=${Number.isFinite(MAX_INTEGRATIONS_PER_RUN) ? MAX_INTEGRATIONS_PER_RUN : 'inf'} maxAsinsPerRun=${Number.isFinite(MAX_ASINS_PER_RUN) ? MAX_ASINS_PER_RUN : 'inf'} eanConcurrency=${EAN_FETCH_CONCURRENCY} runtimeBudgetSec=${Math.round(RUN_TIME_BUDGET_MS / 1000)}`
  );
  if (!integrations.length) {
    console.log('[Catalog code sync] No active integrations found.');
    return;
  }

  let totalFnskuUpdated = 0;
  let totalEanUpdated = 0;
  let totalAsinsResolved = 0;
  let skippedUnauthorized = 0;
  let processedIntegrations = 0;
  let stoppedByBudget = false;

  for (const integration of integrations) {
    if (isRuntimeBudgetReached(runState)) {
      stoppedByBudget = true;
      console.log(
        `[Catalog code sync] Runtime budget reached after ${processedIntegrations}/${integrations.length} integrations. Stopping gracefully; next run will continue.`
      );
      break;
    }
    try {
      const stats = await syncIntegration(integration, runState);
      processedIntegrations += 1;
      totalFnskuUpdated += stats.fnskuUpdated;
      totalEanUpdated += stats.eanUpdated;
      totalAsinsResolved += stats.asinsResolved;
      if (stats.stoppedByBudget || runState.stoppedByBudget) {
        stoppedByBudget = true;
        console.log(
          `[Catalog code sync] Runtime budget reached during integration ${integration.id}. Stopping gracefully; next run will continue.`
        );
        break;
      }
    } catch (error) {
      processedIntegrations += 1;
      const message = error?.message || String(error);
      if (isAccessDeniedError(error)) {
        skippedUnauthorized += 1;
        console.warn(
          `[Catalog code sync] Skip integration ${integration.id}: Amazon integration is not authorized (${message}).`
        );
        await supabase
          .from('amazon_integrations')
          .update({
            last_error: null,
            last_synced_at: new Date().toISOString()
          })
          .eq('id', integration.id);
        continue;
      }
      console.error(`[Catalog code sync] Integration ${integration.id} failed: ${message}`);
      await supabase
        .from('amazon_integrations')
        .update({
          last_error: message,
          last_synced_at: new Date().toISOString()
        })
        .eq('id', integration.id);
    }
  }

  const elapsedSec = Math.round((Date.now() - runState.startedAt) / 1000);
  console.log(
    `[Catalog code sync] Finished. processedIntegrations=${processedIntegrations}/${integrations.length} fnskuUpdated=${totalFnskuUpdated} eanUpdated=${totalEanUpdated} asinsResolved=${totalAsinsResolved} skippedUnauthorized=${skippedUnauthorized} elapsedSec=${elapsedSec} stoppedByBudget=${stoppedByBudget ? 1 : 0}`
  );
  if (stoppedByBudget) {
    console.log('CATALOG_CODES_CONTINUE=1');
  }
}

main().catch((error) => {
  console.error('[Catalog code sync] Fatal:', error?.message || error);
  process.exitCode = 1;
});
