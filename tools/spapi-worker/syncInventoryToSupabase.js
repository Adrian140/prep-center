import 'dotenv/config';
import { createDecipheriv } from 'crypto';
import { gunzipSync } from 'zlib';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const REPORT_TYPE = 'GET_FBA_MYI_ALL_INVENTORY_DATA';
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 4000);
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 60);

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
    .select('id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, status')
    .eq('status', 'active');

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

  return integrations
    .map((row) => ({
      ...row,
      refresh_token:
        tokenMap.get(row.selling_partner_id) || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null
    }))
    .filter((row) => !!row.refresh_token);
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

  return buffer.toString('utf-8');
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

function normalizeInventory(rawRows = []) {
  const normalized = [];
  for (const row of rawRows) {
    const sku = (row.sku || '').trim();
    const asin = (row.asin || '').trim();
    if (!sku && !asin) continue;

    const fulfillable = Number(row.fulfillable ?? 0);
    const inboundTotal =
      Number(row.inboundWorking ?? 0) +
      Number(row.inboundShipped ?? 0) +
      Number(row.inboundReceiving ?? 0);
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

function keyFromRow(row) {
  const sku = row?.sku ? String(row.sku).toLowerCase() : '';
  const asin = row?.asin ? String(row.asin).toLowerCase() : '';
  return sku || asin || null;
}

async function upsertStockRows(rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => {
      const { key, id, ...rest } = row;
      const payload = { ...rest };
      if (id !== undefined && id !== null) {
        payload.id = id;
      }
      return payload;
    });
    const { error } = await supabase.from('stock_items').upsert(chunk, { defaultToNull: false });
    if (error) throw error;
  }
}

async function syncToSupabase({ items, companyId, userId }) {
  if (items.length === 0) {
    console.log('Amazon returned no inventory rows. Nothing to sync.');
    return { affected: 0, zeroed: 0 };
  }

  const { data: existing, error } = await supabase
    .from('stock_items')
    .select('id, company_id, user_id, sku, asin, name, amazon_stock')
    .eq('company_id', companyId);
  if (error) throw error;

  const existingByKey = new Map();
  (existing || []).forEach((row) => {
    const key = keyFromRow(row);
    if (key) existingByKey.set(key, row);
  });

  const seenKeys = new Set();
  const insertsOrUpdates = [];

  for (const item of items) {
    const key = item.key;
    if (!key) continue;
    seenKeys.add(key);
    const row = existingByKey.get(key);

    if (row) {
      insertsOrUpdates.push({
        id: row.id,
        company_id: row.company_id || companyId,
        user_id: row.user_id || userId,
        amazon_stock: item.amazon_stock,
        amazon_inbound: item.amazon_inbound,
        amazon_reserved: item.amazon_reserved,
        amazon_unfulfillable: item.amazon_unfulfillable,
        name: row.name && row.name.trim() ? row.name : item.name || row.name
      });
    } else {
      insertsOrUpdates.push({
        company_id: companyId,
        user_id: userId,
        asin: item.asin,
        sku: item.sku,
        name: item.name || item.asin || item.sku,
        amazon_stock: item.amazon_stock,
        amazon_inbound: item.amazon_inbound,
        amazon_reserved: item.amazon_reserved,
        amazon_unfulfillable: item.amazon_unfulfillable,
        qty: 0
      });
    }
  }

  const missing = (existing || []).filter((row) => {
    if (row.amazon_stock == null) return false;
    const key = keyFromRow(row);
    return key && !seenKeys.has(key) && Number(row.amazon_stock) !== 0;
  });
  missing.forEach((row) => {
    insertsOrUpdates.push({ id: row.id, amazon_stock: 0 });
  });

  await upsertStockRows(insertsOrUpdates);
  return { affected: insertsOrUpdates.length, zeroed: missing.length };
}

async function fetchInventoryRows(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  const reportId = await createInventoryReport(spClient, marketplaceId);
  const documentId = await waitForReport(spClient, reportId);
  const documentText = await downloadReportDocument(spClient, documentId);
  return parseInventoryRows(documentText);
}

async function fetchInventorySummaries(spClient, marketplaceId = DEFAULT_MARKETPLACE) {
  const res = await spClient.callAPI({
    operation: 'getInventorySummaries',
    endpoint: 'fbaInventory',
    query: {
      details: true,
      marketplaceIds: [marketplaceId],
      granularityType: 'Marketplace',
      granularityId: marketplaceId
    }
  });
  const summaries =
    res?.payload?.inventorySummaries ||
    res?.inventorySummaries ||
    res?.payload ||
    [];
  if (!Array.isArray(summaries)) return [];
  return summaries.map((row) => ({
    sku: row.sellerSku || row.sku || null,
    asin: row.asin || null,
    fulfillable: Number(row.inStockSupplyQuantity ?? 0),
    inboundWorking: Number(row.inboundWorkingQuantity ?? 0),
    inboundShipped: Number(row.inboundShippedQuantity ?? 0),
    inboundReceiving: Number(row.inboundReceivingQuantity ?? 0),
    reserved: Number(row.reservedQuantity ?? 0),
    unsellable: Number(row.unfulfillableQuantity ?? 0),
    name: sanitizeText(row.productName) || null
  }));
}

async function syncIntegration(integration) {
  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing integration ${integration.id} (company ${integration.company_id}, marketplace ${integration.marketplace_id})`
  );

  try {
    let normalized = [];
    try {
      const rawRows = await fetchInventoryRows(spClient, integration.marketplace_id || DEFAULT_MARKETPLACE);
      normalized = normalizeInventory(rawRows);
    } catch (err) {
      console.error(`Report inventory failed for ${integration.id}:`, err?.message || err);
      // fallback to Inventory Summaries API
      const summaries = await fetchInventorySummaries(spClient, integration.marketplace_id || DEFAULT_MARKETPLACE);
      normalized = normalizeInventory(summaries);
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
      `Integration ${integration.id} synced (${normalized.length} items, ${stats.affected} rows, ${stats.zeroed} zeroed).`
    );
  } catch (err) {
    console.error(`Sync failed for integration ${integration.id}:`, err?.response?.data || err);
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
    console.log('No active amazon_integrations found. Nothing to do.');
    return;
  }

  for (const integration of integrations) {
    await syncIntegration(integration);
  }

  console.log('All integrations processed ✅');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Inventory sync failed:', err?.response?.data || err);
    process.exit(1);
  });
}
