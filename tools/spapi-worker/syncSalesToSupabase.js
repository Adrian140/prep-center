import 'dotenv/config';
import { subDays } from 'date-fns';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const ORDERS_PAGE_SIZE = 100;
const ORDER_WINDOW_DAYS = Number(process.env.SPAPI_ORDER_WINDOW_DAYS || 30);
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

async function listRefundEvents(spClient, marketplaceId) {
  if (!marketplaceId) {
    return [];
  }
  const postedAfter = isoDateDaysAgo(ORDER_WINDOW_DAYS);
  const events = [];
  let nextToken = null;

  const ids = [marketplaceId];

  do {
    const res = await spClient.callAPI({
      operation: nextToken ? 'listFinancialEventsByNextToken' : 'listFinancialEvents',
      endpoint: 'finances',
      query: nextToken ? { NextToken: nextToken } : { PostedAfter: postedAfter, MarketplaceIds: ids }
    });

    const payload = res?.payload || res || {};
    const refunds = payload?.FinancialEvents?.RefundEventList || [];
    if (Array.isArray(refunds) && refunds.length) {
      events.push(...refunds);
    }

    nextToken =
      payload?.NextToken ||
      payload?.nextToken ||
      null;
  } while (nextToken);

  return events;
}

function aggregateRefundEvents(refundEvents, defaultCountry) {
  const map = new Map();
  for (const ev of refundEvents) {
    const country = mapMarketplaceToCountry(ev.MarketplaceId) || defaultCountry || null;
    const items =
      ev.ShipmentItemAdjustmentList ||
      ev.ShipmentItemList ||
      [];
    for (const it of items) {
      const asin = (it.ASIN || '').toUpperCase();
      const sku = (it.SellerSKU || '').toUpperCase();
      if (!asin && !sku) continue;
      const key = `${asin}::${sku}::${country || ''}`;
      const qty =
        Number(it.QuantityShipped ?? it.Quantity ?? it.QuantityOrdered ?? it.ItemQuantity ?? 0) || 0;
      const current = map.get(key) || {
        asin,
        sku,
        country,
        total_units: 0,
        pending_units: 0,
        shipped_units: 0,
        refund_units: 0,
        payment_units: 0
      };
      current.refund_units += Math.abs(qty);
      map.set(key, current);
    }
  }
  return Array.from(map.values());
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
    .select('id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token')
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

    for (const order of orders || []) {
      const amazonOrderId = order.AmazonOrderId;
      if (!amazonOrderId) continue;

      const resolvedMarketplace = order.MarketplaceId || marketplaceId;
      const country = mapMarketplaceToCountry(resolvedMarketplace);

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

    try {
      const refundEvents = await listRefundEvents(spClient, marketplaceId);
      if (Array.isArray(refundEvents) && refundEvents.length) {
        const refundRows = aggregateRefundEvents(
          refundEvents,
          mapMarketplaceToCountry(marketplaceId)
        );
        accumulateSalesRows(aggregates, refundRows);
      }
    } catch (err) {
      if (isUnauthorizedError(err)) {
        console.warn(
          `[Sales sync] Skipping refunds for ${integration.id} marketplace ${marketplaceId} because SP-API returned unauthorized.`
        );
      } else {
        throw err;
      }
    }
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
  if (!rows.length) return;
  const now = new Date().toISOString();
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
