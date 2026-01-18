import 'dotenv/config';
import { subDays } from 'date-fns';
import { gunzipSync } from 'zlib';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const ORDERS_PAGE_SIZE = 100;
const ORDER_WINDOW_DAYS = Number(process.env.SPAPI_ORDER_WINDOW_DAYS || 30);
const RETURNS_REPORT_TYPE = 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA';
const REPORT_POLL_INTERVAL = Number(process.env.SPAPI_REPORT_POLL_MS || 10_000);
const REPORT_POLL_LIMIT = Number(process.env.SPAPI_REPORT_POLL_LIMIT || 120);
const SALES_SYNC_LOOP = process.env.SPAPI_SALES_SYNC_LOOP !== 'false';
const SALES_SYNC_INTERVAL_MS = Number(
  process.env.SPAPI_SALES_SYNC_INTERVAL_MS || 15 * 60 * 1000
);
const SALES_TIME_BUDGET_MS = Number(
  process.env.SPAPI_SALES_TIME_BUDGET_MS || 5.5 * 60 * 60 * 1000
);
const SUPPORTED_MARKETPLACES = [
  'A13V1IB3VIYZZH', // FR
  'A1PA6795UKMFR9', // DE
  'A1RKKUPIHCS9HS', // ES
  'APJ6JRA9NG5V4', // IT
  'A1F83G8C2ARO7P', // UK
  'AMEN7PMS3EDWL', // BE
  'A1805IZSGTT6HS', // NL
  'A2NODRKZP88ZB9', // SE
  'A1C3SOZRARQ6R3' // PL
];

// Lăsăm SP‑API să ne dea toate statusurile relevante și filtrăm noi în cod.
// Totuși, setăm o listă explicită pentru claritate.
const ORDER_STATUSES = [
  'PendingAvailability',
  'Pending',
  'Unshipped',
  'PartiallyShipped',
  'Shipped',
  'InvoiceUnconfirmed',
  'Unfulfillable',
  'Canceled'
];

const MARKETPLACE_COUNTRY = {
  A13V1IB3VIYZZH: 'FR', // France
  ATVPDKIKX0DER: 'US', // United States
  A1PA6795UKMFR9: 'DE', // Germany
  A1RKKUPIHCS9HS: 'ES', // Spain
  A1F83G8C2ARO7P: 'GB', // United Kingdom
  APJ6JRA9NG5V4: 'IT', // Italy
  A21TJRUUN4KGV: 'IN', // India
  A1VC38T7YXB528: 'JP', // Japan
  AMEN7PMS3EDWL: 'BE', // Belgium
  A1805IZSGTT6HS: 'NL', // Netherlands
  A2NODRKZP88ZB9: 'SE', // Sweden
  A1C3SOZRARQ6R3: 'PL' // Poland
};

function isoDateDaysAgo(days) {
  return subDays(new Date(), days).toISOString();
}

// Cheie strictă ASIN+SKU pentru a nu amesteca produsele.
function keyFromItem(item) {
  const asin = (item?.ASIN || '').toUpperCase();
  const sku = (item?.SellerSKU || '').toUpperCase();
  if (!asin && !sku) return null;
  return `${asin}::${sku}`;
}

function mapMarketplaceToCountry(marketplaceId) {
  return MARKETPLACE_COUNTRY[marketplaceId] || marketplaceId || null;
}

function isUnauthorizedError(err) {
  const message = String(err?.message || err || '');
  return err?.code === 'Unauthorized' || message.includes('Access to requested resource is denied');
}

async function createReturnsReport(spClient, marketplaceId) {
  if (!marketplaceId) throw new Error('Missing marketplaceId for returns report');
  const body = {
    reportType: RETURNS_REPORT_TYPE,
    marketplaceIds: [marketplaceId],
    dataStartTime: isoDateDaysAgo(ORDER_WINDOW_DAYS),
    dataEndTime: new Date().toISOString()
  };
  const response = await spClient.callAPI({
    operation: 'createReport',
    endpoint: 'reports',
    body
  });
  if (!response?.reportId) {
    throw new Error('Failed to create returns report');
  }
  return response.reportId;
}

async function waitForReturnsReport(spClient, reportId) {
  for (let attempt = 0; attempt < REPORT_POLL_LIMIT; attempt += 1) {
    const report = await spClient.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId }
    });
    if (!report) throw new Error('Missing returns report status response');
    switch (report.processingStatus) {
      case 'DONE':
        return report.reportDocumentId;
      case 'FATAL':
      case 'CANCELLED':
        throw new Error(`Returns report failed with status ${report.processingStatus}`);
      case 'DONE_NO_DATA':
        return null;
      default:
        await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_INTERVAL));
    }
  }
  throw new Error('Timed out waiting for returns report to complete');
}

async function downloadReturnsReportDocument(spClient, reportDocumentId) {
  if (!reportDocumentId) return '';
  const document = await spClient.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId }
  });
  if (!document?.url) throw new Error('Returns report document missing download URL');
  const fetchImpl =
    typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : (await import('node-fetch').then((mod) => mod.default));
  const response = await fetchImpl(document.url);
  if (!response.ok) {
    throw new Error(`Failed to download returns report document (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);
  if (document.compressionAlgorithm === 'GZIP') {
    buffer = gunzipSync(buffer);
  }
  return buffer.toString('utf-8');
}

const RETURN_HEADER_ALIASES = new Map([
  ['seller-sku', 'sku'],
  ['sku', 'sku'],
  ['sku-seller', 'sku'],
  ['merchant-sku', 'sku'],
  ['asin', 'asin'],
  ['asin1', 'asin'],
  ['item-name', 'name'],
  ['product-name', 'name'],
  ['quantity', 'quantity'],
  ['quantity-shipped', 'quantity'],
  ['shipped-quantity', 'quantity'],
  ['quantityreturned', 'quantity'],
  ['return-quantity', 'quantity'],
  ['marketplace-name', 'marketplace'],
  ['marketplaceid', 'marketplace'],
  ['marketplace', 'marketplace'],
  ['country', 'country'],
  ['country-code', 'country']
]);

function normalizeReturnHeader(header) {
  const raw = (header || '').trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9_-]+/g, '-');
  return RETURN_HEADER_ALIASES.get(raw) || RETURN_HEADER_ALIASES.get(normalized) || raw;
}

function parseReturnsReport(tsvText) {
  const cleanText = (tsvText || '').replace(/^\uFEFF/, '');
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.replace(/\uFEFF/g, ''))
    .filter((line) => line.trim() !== '');
  if (!lines.length) return [];
  const headerLine = lines.shift();
  const delimiter = headerLine.includes('\t')
    ? '\t'
    : headerLine.includes(';')
    ? ';'
    : ',';
  const splitColumns = (line) => line.split(delimiter).map((part) => part.replace(/^"|"$/g, '').trim());
  const headers = splitColumns(headerLine).map((header) => normalizeReturnHeader(header));
  return lines.map((line) => {
    const cols = splitColumns(line);
    const row = {};
    headers.forEach((header, idx) => {
      if (header) row[header] = cols[idx];
    });
    return row;
  });
}

function aggregateReturnReportRows(rows, defaultCountry) {
  // Refund logic dezactivat.
  return [];
}

async function fetchRefundsViaReturnsReport(spClient, marketplaceId) {
  // Refund logic dezactivat.
  return [];
}

async function listRefundEvents(spClient, marketplaceId) {
  // Refund logic dezactivat.
  return [];
}

function aggregateRefundEvents(refundEvents, defaultCountry) {
  // Refund logic dezactivat.
  return [];
}

function parseMarketplaceEnvList() {
  const raw = process.env.SPAPI_MARKETPLACE_IDS;
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

function singleModeIntegration() {
  if (
    process.env.SUPABASE_STOCK_COMPANY_ID &&
    process.env.SUPABASE_STOCK_USER_ID &&
    process.env.SPAPI_REFRESH_TOKEN
  ) {
    const fallbackMarketplaces =
      parseMarketplaceEnvList() || [process.env.SPAPI_MARKETPLACE_ID || DEFAULT_MARKETPLACE];
    return [
      {
        id: 'single-mode',
        company_id: process.env.SUPABASE_STOCK_COMPANY_ID,
        user_id: process.env.SUPABASE_STOCK_USER_ID,
        marketplace_id: fallbackMarketplaces[0],
        marketplace_ids: fallbackMarketplaces,
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
      'id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, last_synced_at'
    )
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
      SUPPORTED_MARKETPLACES.forEach((id) => mergedSet.add(id));
      const marketplaceList =
        row.marketplace_id && typeof row.marketplace_id === 'string'
          ? [row.marketplace_id]
          : Array.from(mergedSet);
      return {
        ...row,
        marketplace_ids: marketplaceList.length ? marketplaceList : null,
        refresh_token:
          token?.refresh_token || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null
      };
    })
    .filter((row) => !!row?.refresh_token && (!!row.marketplace_id || (row.marketplace_ids || []).length));
}

function resolveMarketplaceIds(integration) {
  if (Array.isArray(integration.marketplace_ids) && integration.marketplace_ids.length) {
    return integration.marketplace_ids.filter(Boolean);
  }
  const fromEnv = parseMarketplaceEnvList();
  if (fromEnv?.length) {
    return fromEnv;
  }
  if (integration.marketplace_id) {
    return [integration.marketplace_id];
  }
  if (process.env.SPAPI_MARKETPLACE_ID || DEFAULT_MARKETPLACE) {
    return [process.env.SPAPI_MARKETPLACE_ID || DEFAULT_MARKETPLACE];
  }
  return [];
}

async function listAllOrders(spClient, marketplaceId) {
  if (!marketplaceId) {
    return [];
  }
  const createdAfter = isoDateDaysAgo(ORDER_WINDOW_DAYS);
  const orders = [];
  let nextToken = null;

  const ids = [marketplaceId];

  do {
    const baseQuery = nextToken
      ? { NextToken: nextToken }
      : {
          MarketplaceIds: ids,
          CreatedAfter: createdAfter,
          OrderStatuses: ORDER_STATUSES,
          MaxResultsPerPage: ORDERS_PAGE_SIZE
        };

    const res = await spClient.callAPI({
      operation: 'getOrders',
      endpoint: 'orders',
      query: baseQuery
    });

    const pageOrders =
      (res && (res.Orders || res.payload?.Orders)) || [];
    if (Array.isArray(pageOrders)) {
      orders.push(...pageOrders);
    }

    nextToken =
      res?.payload?.NextToken ||
      res?.payload?.nextToken ||
      res?.NextToken ||
      res?.nextToken ||
      null;
  } while (nextToken);

  return orders;
}

async function listOrderItems(spClient, amazonOrderId) {
  const items = [];
  let nextToken = null;
  do {
    const res = await spClient.callAPI({
      operation: 'getOrderItems',
      endpoint: 'orders',
      path: { orderId: amazonOrderId },
      query: nextToken ? { NextToken: nextToken } : undefined
    });
    const pageItems =
      (res && (res.OrderItems || res.payload?.OrderItems)) || [];
    if (Array.isArray(pageItems)) {
      items.push(...pageItems);
    }
    nextToken =
      res?.payload?.NextToken ||
      res?.payload?.nextToken ||
      res?.NextToken ||
      res?.nextToken ||
      null;
  } while (nextToken);
  return items;
}

async function aggregateSales(spClient, integration, marketplaceIds) {
  const aggregates = new Map();

  for (const marketplaceId of marketplaceIds) {
    if (!marketplaceId) continue;

    let orders = [];
    try {
      orders = await listAllOrders(spClient, marketplaceId);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        console.warn(
          `[Sales sync] Skipping orders for ${integration.id} marketplace ${marketplaceId} because SP-API returned unauthorized.`
        );
        continue;
      }
      throw err;
    }

    console.log(
      `[Sales sync] ${integration.id} marketplace ${marketplaceId}: fetched ${orders.length} orders via Orders API.`
    );
    if (!orders.length) {
      console.log(
        `[Sales sync] ${integration.id} marketplace ${marketplaceId}: no orders returned for last ${ORDER_WINDOW_DAYS} days.`
      );
    }

    let sampleLogged = 0;
    for (const order of orders || []) {
      const amazonOrderId = order.AmazonOrderId;
      if (!amazonOrderId) continue;

      const resolvedMarketplace = order.MarketplaceId || marketplaceId;
      const country = mapMarketplaceToCountry(resolvedMarketplace) || mapMarketplaceToCountry(marketplaceId);
      if (sampleLogged < 3) {
        console.log(
          `[Sales sync] sample order for integration ${integration.id}: integration marketplace=${marketplaceId}, order.MarketplaceId=${order.MarketplaceId}, SalesChannel=${order.SalesChannel}, resolvedCountry=${country}`
        );
        sampleLogged += 1;
      }

      const status = String(order.OrderStatus || '').replace(/\s+/g, '').toLowerCase();
      const isCanceled = status === 'canceled';
      const isUnfulfillable = status === 'unfulfillable';
      const isPendingLike =
        status === 'pending' ||
        status === 'pendingavailability' ||
        status === 'unshipped';
      const isShippedLike =
        status === 'shipped' ||
        status === 'partiallyshipped' ||
        status === 'invoiceunconfirmed';

      if (isCanceled || isUnfulfillable) {
        continue;
      }

      const items = await listOrderItems(spClient, amazonOrderId);
      for (const item of items) {
        const asinSkuKey = keyFromItem(item);
        if (!asinSkuKey) continue;
        const key = `${asinSkuKey}::${country}`;
        const qtyOrdered = Number(item.QuantityOrdered ?? 0) || 0;
        const qtyShipped = Number(item.QuantityShipped ?? 0) || 0;

        if (!aggregates.has(key)) {
          aggregates.set(key, {
            asin: item.ASIN || null,
            sku: item.SellerSKU || null,
            country,
            total_units: 0,
            pending_units: 0,
            shipped_units: 0,
            refund_units: 0,
            payment_units: 0
          });
        }

        const agg = aggregates.get(key);
        if (isShippedLike) {
          agg.shipped_units += qtyOrdered || qtyShipped;
        } else if (isPendingLike) {
          agg.pending_units += qtyOrdered;
        }
        agg.total_units = agg.shipped_units + agg.pending_units;
        agg.payment_units = agg.shipped_units;
      }
    }

    let refundRows = [];
    // Cerință: nu mai includem retururile/refundările în calculul Ventes sur 30 jours.
    // Lăsăm refundRows gol și nu scădem unități.
  }

  return Array.from(aggregates.values());
}

function accumulateSalesRows(map, rows) {
  const toNumber = (value) => Number(value ?? 0) || 0;
  for (const row of rows) {
    const key = `${row.asin || ''}::${row.sku || ''}::${row.country || ''}`;
    const existing = map.get(key);
    if (existing) {
      existing.total_units += toNumber(row.total_units);
      existing.pending_units += toNumber(row.pending_units);
      existing.shipped_units += toNumber(row.shipped_units);
      existing.refund_units += 0;
      existing.payment_units += toNumber(row.payment_units);
    } else {
      map.set(key, {
        asin: row.asin,
        sku: row.sku,
        country: row.country,
        total_units: toNumber(row.total_units),
        pending_units: toNumber(row.pending_units),
        shipped_units: toNumber(row.shipped_units),
        refund_units: 0,
        payment_units: toNumber(row.payment_units)
      });
    }
  }
}

async function upsertSales({ rows, companyId, userId }) {
  if (!rows.length) return;
  const now = new Date().toISOString();
  console.log(`[Sales sync] Writing ${rows.length} aggregated rows for company ${companyId}.`);
  // Curățăm valorile vechi pentru companie înainte de a scrie din nou
  await supabase.from('amazon_sales_30d').delete().eq('company_id', companyId);
  const chunkSize = 500;
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
    if (error) {
      if (/duplicate key value/.test(error.message)) {
        console.warn(
          `[Sales sync] Duplicate key on amazon_sales_30d for company ${companyId} — skipping corrupt chunk.`
        );
        continue;
      }
      throw error;
    }
  }
}

async function syncIntegration(integration) {
  const marketplaceIds = resolveMarketplaceIds(integration);
  if (!marketplaceIds.length) {
    console.warn(
      `[Sales sync] Skipping integration ${integration.id} because it has no marketplace_id or marketplace_ids configured.`
    );
    return [];
  }

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing 30d sales for integration ${integration.id} (company ${integration.company_id}, marketplace ${integration.marketplace_id})`
  );

  // Folosim implementarea bazată pe Orders API,
  // care agregează vânzările pe ultimele ORDER_WINDOW_DAYS.
  let sales = [];
  try {
    sales = await aggregateSales(spClient, integration, marketplaceIds);
  } catch (err) {
    throw err;
  }

  console.log(
    `Done sales sync for integration ${integration.id}: ${sales.length} ASIN/SKU rows returned.`
  );

  return sales;
}

async function main() {
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('No active integrations found. Exiting.');
    return;
  }

  const startedAt = Date.now();
  const hasTimeBudget = Number.isFinite(SALES_TIME_BUDGET_MS) && SALES_TIME_BUDGET_MS > 0;

  const companies = new Map();
  for (const integration of integrations) {
    if (!companies.has(integration.company_id)) {
      companies.set(integration.company_id, []);
    }
    companies.get(integration.company_id).push(integration);
  }

  const companyEntries = Array.from(companies.entries())
    .map(([companyId, rows]) => {
      const times = rows
        .map((row) => (row.last_synced_at ? new Date(row.last_synced_at).getTime() : null))
        .filter((ts) => Number.isFinite(ts));
      const oldest = times.length ? Math.min(...times) : Number.NEGATIVE_INFINITY;
      return { companyId, integrations: rows, sortKey: oldest };
    })
    .sort((a, b) => a.sortKey - b.sortKey);

  let timeBudgetReached = false;
  for (const entry of companyEntries) {
    if (hasTimeBudget && Date.now() - startedAt >= SALES_TIME_BUDGET_MS) {
      timeBudgetReached = true;
      break;
    }

    const sortedIntegrations = entry.integrations
      .slice()
      .sort((a, b) => {
        const aTime = a.last_synced_at ? new Date(a.last_synced_at).getTime() : Number.NEGATIVE_INFINITY;
        const bTime = b.last_synced_at ? new Date(b.last_synced_at).getTime() : Number.NEGATIVE_INFINITY;
        return aTime - bTime;
      });

    const companyRows = new Map();
    const completedIntegrationIds = [];
    let companyFailed = false;

    for (const integration of sortedIntegrations) {
      if (hasTimeBudget && Date.now() - startedAt >= SALES_TIME_BUDGET_MS) {
        companyFailed = true;
        timeBudgetReached = true;
        break;
      }

      try {
        const sales = await syncIntegration(integration);
        accumulateSalesRows(companyRows, sales || []);
        completedIntegrationIds.push(integration.id);
      } catch (err) {
        companyFailed = true;
        console.error(`Sales sync failed for integration ${integration.id}`, err);
        await supabase
          .from('amazon_integrations')
          .update({ last_error: String(err?.message || err) })
          .eq('id', integration.id);
        break;
      }
    }

    if (companyFailed || completedIntegrationIds.length !== sortedIntegrations.length) {
      if (timeBudgetReached) {
        break;
      }
      continue;
    }

    const aggregatedRows = Array.from(companyRows.values());
    await upsertSales({ rows: aggregatedRows, companyId: entry.companyId, userId: sortedIntegrations[0]?.user_id });

    const syncedAt = new Date().toISOString();
    await supabase
      .from('amazon_integrations')
      .update({ last_error: null, last_synced_at: syncedAt })
      .in('id', completedIntegrationIds);
  }

  if (timeBudgetReached) {
    console.warn(
      `[Sales sync] Time budget reached (~${Math.round(SALES_TIME_BUDGET_MS / 60000)}m); stopping early to avoid runner timeout.`
    );
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runForever() {
  do {
    try {
      await main();
    } catch (err) {
      console.error('Fatal error in sales sync', err);
      if (!SALES_SYNC_LOOP) {
        throw err;
      }
    }

    if (!SALES_SYNC_LOOP) {
      break;
    }

    const sleepMs = Number.isFinite(SALES_SYNC_INTERVAL_MS)
      ? Math.max(0, SALES_SYNC_INTERVAL_MS)
      : 0;
    if (sleepMs > 0) {
      console.log(`[Sales sync] Sleeping ${Math.round(sleepMs / 1000)}s before next run.`);
      await delay(sleepMs);
    }
  } while (true);
}

runForever().catch((err) => {
  console.error('Fatal error in sales sync', err);
  process.exit(1);
});
