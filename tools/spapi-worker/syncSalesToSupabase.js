import 'dotenv/config';
import { subDays } from 'date-fns';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const ORDERS_PAGE_SIZE = 100;
const ORDER_WINDOW_DAYS = Number(process.env.SPAPI_ORDER_WINDOW_DAYS || 30);
const REFUND_ONLY = process.env.SYNC_REFUNDS_ONLY === 'true';

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

async function fetchActiveIntegrations() {
  const { data, error } = await supabase
    .from('amazon_integrations')
    .select('id, user_id, company_id, marketplace_id, region, refresh_token')
    .eq('status', 'active');
  if (error) throw error;
  return data || [];
}

async function listAllOrders(spClient, marketplaceId) {
  const createdAfter = isoDateDaysAgo(ORDER_WINDOW_DAYS);
  const orders = [];
  let nextToken = null;

  do {
    const baseQuery = nextToken
      ? { NextToken: nextToken }
      : {
          MarketplaceIds: [marketplaceId || DEFAULT_MARKETPLACE],
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

async function aggregateSales(spClient, integration) {
  const orders = await listAllOrders(spClient, integration.marketplace_id || DEFAULT_MARKETPLACE);
  if (!orders.length) return [];

  const aggregates = new Map();
  const country = mapMarketplaceToCountry(integration.marketplace_id || DEFAULT_MARKETPLACE);

  for (const order of orders) {
    const amazonOrderId = order.AmazonOrderId;
    if (!amazonOrderId) continue;

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

    const shouldProcessOrder = REFUND_ONLY || (!isCanceled && !isUnfulfillable);
    if (!shouldProcessOrder) {
      continue;
    }

    const items = await listOrderItems(spClient, amazonOrderId);
    for (const item of items) {
      const key = keyFromItem(item);
      if (!key) continue;
      const qtyOrdered = Number(item.QuantityOrdered ?? 0) || 0;
      const qtyShipped = Number(item.QuantityShipped ?? 0) || 0;
      const qtyCanceled = Number(item.QuantityCanceled ?? 0) || 0;

      if (!aggregates.has(key)) {
        aggregates.set(key, {
          asin: (item.ASIN || null),
          sku: (item.SellerSKU || null),
          country,
          total_units: 0,
          pending_units: 0,
          shipped_units: 0,
          refund_units: 0,
          payment_units: 0
        });
      }

      const agg = aggregates.get(key);
      if (qtyCanceled > 0) {
        agg.refund_units += qtyCanceled;
      }
      if (REFUND_ONLY) {
        continue;
      }
      if (isShippedLike) {
        agg.shipped_units += qtyOrdered || qtyShipped;
      } else if (isPendingLike) {
        agg.pending_units += qtyOrdered;
      }
      // total_units = shipped + pending (pending e vizibil în UI, dar păstrăm și aici).
      agg.total_units = agg.shipped_units + agg.pending_units;
      agg.payment_units = agg.shipped_units;
    }
  }

  return Array.from(aggregates.values());
}

async function mergeRefundRows(companyId) {
  const { data } = await supabase
    .from('amazon_sales_30d')
    .select('id, company_id, user_id, asin, sku, country, total_units, pending_units, shipped_units, payment_units')
    .eq('company_id', companyId);
  const map = new Map();
  (data || []).forEach((row) => {
    const key = `${row.asin || ''}::${row.sku || ''}::${row.country || ''}`;
    map.set(key, row);
  });
  return map;
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
      existing.refund_units += toNumber(row.refund_units);
      existing.payment_units += toNumber(row.payment_units);
    } else {
      map.set(key, {
        asin: row.asin,
        sku: row.sku,
        country: row.country,
        total_units: toNumber(row.total_units),
        pending_units: toNumber(row.pending_units),
        shipped_units: toNumber(row.shipped_units),
        refund_units: toNumber(row.refund_units),
        payment_units: toNumber(row.payment_units)
      });
    }
  }
}

async function upsertSales({ rows, companyId, userId }) {
  await supabase.from('amazon_sales_30d').delete().eq('company_id', companyId);
  if (!rows.length) return;
  const now = new Date().toISOString();
  if (REFUND_ONLY) {
    const existing = await mergeRefundRows(companyId);
    for (const row of rows) {
      const key = `${row.asin || ''}::${row.sku || ''}::${row.country || ''}`;
      const prev = existing.get(key);
      const payload = {
        company_id: companyId,
        user_id: userId,
        asin: row.asin,
        sku: row.sku,
        country: row.country,
        total_units: prev?.total_units ?? 0,
        pending_units: prev?.pending_units ?? 0,
        shipped_units: prev?.shipped_units ?? 0,
        payment_units: prev?.payment_units ?? 0,
        refund_units: row.refund_units,
        refreshed_at: now
      };
      const { error } = await supabase.from('amazon_sales_30d').upsert(payload);
      if (error) throw error;
    }
    return;
  }

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

  // Folosim implementarea bazată pe Orders API,
  // care agregează vânzările pe ultimele ORDER_WINDOW_DAYS.
  const sales = await aggregateSales(spClient, integration);

  await supabase
    .from('amazon_integrations')
    .update({ last_error: null, last_synced_at: new Date().toISOString() })
    .eq('id', integration.id);

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

  const salesByCompany = new Map();

  for (const integration of integrations) {
    let sales = [];
    try {
      sales = await syncIntegration(integration);
    } catch (err) {
      console.error(`Sales sync failed for integration ${integration.id}`, err);
      await supabase
        .from('amazon_integrations')
        .update({ last_error: String(err?.message || err) })
        .eq('id', integration.id);
      continue;
    }

    const companyId = integration.company_id;
    if (!salesByCompany.has(companyId)) {
      salesByCompany.set(companyId, { userId: integration.user_id, rows: new Map() });
    }
    const group = salesByCompany.get(companyId);
    if (!group.userId && integration.user_id) {
      group.userId = integration.user_id;
    }

    accumulateSalesRows(group.rows, sales || []);
  }

  for (const [companyId, group] of salesByCompany.entries()) {
    const aggregatedRows = Array.from(group.rows.values());
    await upsertSales({ rows: aggregatedRows, companyId, userId: group.userId });
  }
}

main().catch((err) => {
  console.error('Fatal error in sales sync', err);
  process.exit(1);
});
