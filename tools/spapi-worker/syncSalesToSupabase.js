import 'dotenv/config';
import { subDays } from 'date-fns';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const ORDERS_PAGE_SIZE = 100;
const ORDER_WINDOW_DAYS = Number(process.env.SPAPI_ORDER_WINDOW_DAYS || 30);
const ORDER_STATUSES = [
  'PendingAvailability',
  'Pending',
  'Unshipped',
  'PartiallyShipped',
  'Shipped',
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

function keyFromItem(item) {
  const sku = (item?.SellerSKU || '').toLowerCase();
  const asin = (item?.ASIN || '').toLowerCase();
  return sku || asin || null;
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
    const query = {
      MarketplaceIds: [marketplaceId || DEFAULT_MARKETPLACE],
      CreatedAfter: createdAfter,
      OrderStatuses: ORDER_STATUSES,
      MaxResultsPerPage: ORDERS_PAGE_SIZE
    };
    if (nextToken) query.NextToken = nextToken;

    const res = await spClient.callAPI({
      operation: 'getOrders',
      endpoint: 'orders',
      query
    });

    const pageOrders =
      (res && (res.Orders || res.payload?.Orders)) || [];
    if (Array.isArray(pageOrders)) {
      orders.push(...pageOrders);
    }

    nextToken = res?.NextToken || res?.payload?.NextToken || null;
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
    nextToken = res?.NextToken || res?.payload?.NextToken || null;
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

    const status = String(order.OrderStatus || '').toLowerCase();
    const isCanceled = status === 'canceled';
    const isPendingLike =
      status === 'pending' ||
      status === 'pendingavailability' ||
      status === 'unshipped' ||
      status === 'partiallyshipped';
    const isShippedLike = status === 'shipped';

    if (isCanceled) {
      // nu le includem în volum; le vom trata separat ca refunduri reale când
      // vom integra Finances API.
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
      if (isShippedLike) {
        agg.shipped_units += qtyOrdered || qtyShipped;
      } else if (isPendingLike) {
        agg.pending_units += qtyOrdered;
      }

      // total_units rămâne doar shipped; UI va adăuga pending separat.
      agg.total_units = agg.shipped_units;
      agg.refund_units += qtyCanceled > 0 ? qtyCanceled : 0;
    }
  }

  return Array.from(aggregates.values());
}

async function upsertSales({ rows, companyId, userId }) {
  if (!rows.length) return;
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

  const sales = await aggregateSales(spClient, integration);
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
