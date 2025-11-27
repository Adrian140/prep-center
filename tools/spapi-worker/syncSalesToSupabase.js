import 'dotenv/config';
import { subDays } from 'date-fns';
import { createDecipheriv } from 'crypto';
import { gunzipSync } from 'zlib';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const ORDER_WINDOW_DAYS = Number(process.env.SPAPI_ORDER_WINDOW_DAYS || 30);
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 4000);
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 60);

const MARKETPLACE_COUNTRY = {
  A13V1IB3VIYZZH: 'FR',
  ATVPDKIKX0DER: 'US',
  A1PA6795UKMFR9: 'DE',
  A1RKKUPIHCS9HS: 'ES',
  A1F83G8C2ARO7P: 'GB',
  APJ6JRA9NG5V4: 'IT',
  A21TJRUUN4KGV: 'IN',
  A1VC38T7YXB528: 'JP'
};

function isoDateDaysAgo(days) {
  return subDays(new Date(), days).toISOString();
}

function mapMarketplaceToCountry(marketplaceId) {
  return MARKETPLACE_COUNTRY[marketplaceId] || marketplaceId || null;
}

async function fetchActiveIntegrations() {
  const { data, error } = await supabase
    .from('amazon_integrations')
    .select('id, user_id, company_id, marketplace_id, region, refresh_token')
    .eq('status', 'active');
  if (error) throw error;
  return data || [];
}

// === Helpers pentru rapoarte (Sales & Traffic) ===

async function waitForReport(spClient, reportId) {
  for (let attempt = 0; attempt < REPORT_POLL_LIMIT; attempt += 1) {
    const report = await spClient.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId }
    });

    if (!report) throw new Error('Empty response when polling sales report status');

    switch (report.processingStatus) {
      case 'DONE':
        return report.reportDocumentId;
      case 'FATAL':
      case 'CANCELLED':
        throw new Error(`Sales report failed with status ${report.processingStatus}`);
      case 'DONE_NO_DATA':
        // raport valid dar fără date – îl tratăm ca "niciun rând"
        return null;
      default:
        await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_INTERVAL));
    }
  }
  throw new Error('Timed out waiting for sales report to finish');
}

function decryptDocument(buffer, encryptionDetails) {
  const key = Buffer.from(encryptionDetails.key, 'base64');
  const iv = Buffer.from(encryptionDetails.initializationVector, 'base64');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
  return decrypted;
}

async function downloadReportDocument(spClient, reportDocumentId) {
  if (!reportDocumentId) return '';

  const document = await spClient.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId }
  });

  if (!document?.url) throw new Error('Sales report document missing download URL');

  const fetchImpl =
    globalThis.fetch ||
    (await import('node-fetch').then((mod) => mod.default));
  const response = await fetchImpl(document.url);
  if (!response.ok) {
    throw new Error(`Failed to download sales report document (${response.status})`);
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

function parseSalesRows(jsonText) {
  if (!jsonText) return [];
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    console.error('Failed to parse sales report JSON', e);
    return [];
  }

  const byAsin = Array.isArray(data?.salesAndTrafficByAsin)
    ? data.salesAndTrafficByAsin
    : [];

  const rows = [];
  for (const entry of byAsin) {
    const asin = entry.childAsin || entry.parentAsin || null;
    const sku = entry.sku || null;
    if (!asin && !sku) continue;
    const units =
      Number(entry?.salesByAsin?.unitsOrdered?.value ?? 0) ||
      Number(entry?.salesByAsin?.unitsShipped?.value ?? 0) ||
      0;
    if (!Number.isFinite(units) || units <= 0) continue;
    rows.push({ asin, sku, units });
  }

  return rows;
}

async function fetchSalesRows(spClient, marketplaceId) {
  const end = new Date();
  const start = subDays(end, ORDER_WINDOW_DAYS);

  const body = {
    reportType: 'GET_SALES_AND_TRAFFIC_REPORT',
    marketplaceIds: [marketplaceId || DEFAULT_MARKETPLACE],
    dataStartTime: start.toISOString(),
    dataEndTime: end.toISOString(),
    reportOptions: {
      dateGranularity: 'DAY',
      asinGranularity: 'CHILD'
    }
  };

  const response = await spClient.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body
  });

  if (!response?.reportId) {
    throw new Error('Failed to create sales report');
  }

  const documentId = await waitForReport(
    spClient,
    response.reportId
  );
  if (!documentId) {
    // DONE_NO_DATA
    return [];
  }
  const jsonText = await downloadReportDocument(spClient, documentId);
  return parseSalesRows(jsonText);
}

function aggregateSalesFromReport(rows = [], integration) {
  if (!rows.length) return [];
  const country = mapMarketplaceToCountry(
    integration.marketplace_id || DEFAULT_MARKETPLACE
  );

  const map = new Map();
  for (const row of rows) {
    const asin = (row.asin || '').toUpperCase();
    const sku = (row.sku || '').toUpperCase();
    if (!asin && !sku) continue;
    const key = `${asin}::${sku}`;
    const units = Number(row.units || 0) || 0;
    if (units <= 0) continue;

    if (!map.has(key)) {
      map.set(key, {
        asin: row.asin || null,
        sku: row.sku || null,
        country,
        total_units: 0,
        pending_units: 0,
        shipped_units: 0,
        refund_units: 0,
        payment_units: 0
      });
    }

    const agg = map.get(key);
    agg.total_units += units;
    // Considerăm totul ca "shipped" (Business Reports nu separă pending)
    agg.shipped_units += units;
  }

  return Array.from(map.values());
}

async function upsertSales({ rows, companyId, userId }) {
  if (!rows.length) return;
  // Curățăm valorile vechi pentru companie înainte de a scrie din nou
  await supabase.from('amazon_sales_30d').delete().eq('company_id', companyId);

  const chunkSize = 500;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((row) => ({
      company_id: companyId,
      user_id: userId,
      asin: row.asin,
      sku: row.sku,
      country: row.country,
      total_units: row.total_units,
      pending_units: row.pending_units,
      shipped_units: row.shipped_units,
      refund_units: row.refund_units,
      payment_units: row.shipped_units, // proxie: shipped ~ paid
      refreshed_at: now
    }));

    const { error } = await supabase.from('amazon_sales_30d').upsert(chunk);
    if (error) throw error;
  }
}

async function syncIntegration(integration) {
  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing 30d sales for integration ${integration.id} (company ${integration.company_id}, marketplace ${integration.marketplace_id})`
  );

  const rawRows = await fetchSalesRows(
    spClient,
    integration.marketplace_id || DEFAULT_MARKETPLACE
  );
  const sales = aggregateSalesFromReport(rawRows, integration);
  await upsertSales({ rows: sales, companyId: integration.company_id, userId: integration.user_id });

  await supabase
    .from('amazon_integrations')
    .update({ last_error: null, last_synced_at: new Date().toISOString() })
    .eq('id', integration.id);

  console.log(
    `Done sales sync for integration ${integration.id}: ${sales.length} ASIN/SKU rows upserted.`
  );
}

async function main() {
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('No active integrations found. Exiting.');
    return;
  }

  for (const integration of integrations) {
    try {
      await syncIntegration(integration);
    } catch (err) {
      console.error(`Sales sync failed for integration ${integration.id}`, err);
      await supabase
        .from('amazon_integrations')
        .update({ last_error: String(err?.message || err) })
        .eq('id', integration.id);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error in sales sync', err);
  process.exit(1);
});
