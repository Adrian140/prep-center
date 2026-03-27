import 'dotenv/config';
import { subDays } from 'date-fns';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';
import { getCompanyNameMap, companyLabel } from './companyHelpers.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const ORDERS_PAGE_SIZE = 100;
const ORDER_WINDOW_DAYS = Number(process.env.SPAPI_FBM_ORDER_WINDOW_DAYS || 30);
const ORDER_INITIAL_LOOKBACK_DAYS = Number(process.env.SPAPI_FBM_INITIAL_LOOKBACK_DAYS || 3);
const FBM_SYNC_LOOP = process.env.SPAPI_FBM_SYNC_LOOP !== 'false';
const FBM_SYNC_INTERVAL_MS = Number(process.env.SPAPI_FBM_SYNC_INTERVAL_MS || 5 * 60 * 1000);
const FBM_SYNC_TIME_BUDGET_MS = Number(
  process.env.SPAPI_FBM_SYNC_TIME_BUDGET_MS || 5.5 * 60 * 60 * 1000
);
const SUPPORTED_MARKETPLACES = [
  'A13V1IB3VIYZZH',
  'A1PA6795UKMFR9',
  'A1RKKUPIHCS9HS',
  'APJ6JRA9NG5V4'
];

const ORDER_STATUSES = [
  'Unshipped'
];

const MARKETPLACE_COUNTRY = {
  A13V1IB3VIYZZH: 'FR',
  A1PA6795UKMFR9: 'DE',
  A1RKKUPIHCS9HS: 'ES',
  APJ6JRA9NG5V4: 'IT',
  A1F83G8C2ARO7P: 'GB',
  AMEN7PMS3EDWL: 'BE',
  A1805IZSGTT6HS: 'NL',
  A2NODRKZP88ZB9: 'SE',
  A1C3SOZRARQ6R3: 'PL'
};

let COMPANY_NAME_MAP = new Map();

function isoDateDaysAgo(days) {
  return subDays(new Date(), days).toISOString();
}

function normalizeIdentifier(value) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function makeComboKey(companyId, sku, asin) {
  const company = String(companyId || '').trim();
  const normSku = normalizeIdentifier(sku);
  const normAsin = normalizeIdentifier(asin);
  if (!company || (!normSku && !normAsin)) return null;
  return `${company}::${normSku || ''}::${normAsin || ''}`;
}

function mapMarketplaceToCountry(marketplaceId) {
  return MARKETPLACE_COUNTRY[marketplaceId] || marketplaceId || null;
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

async function fetchActiveIntegrations(companyIds = []) {
  const single = singleModeIntegration();
  if (single) return single;

  const ids = Array.from(new Set((companyIds || []).filter(Boolean)));
  let query = supabase
    .from('amazon_integrations')
    .select(
      'id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, last_synced_at'
    )
    .eq('status', 'active');
  if (ids.length) {
    query = query.in('company_id', ids);
  }
  const { data, error } = await query;
  if (error) throw error;

  const integrations = data || [];
  COMPANY_NAME_MAP = await getCompanyNameMap(integrations);
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
    (tokens || []).forEach((row) => {
      tokenMap.set(row.seller_id, {
        refresh_token: row.refresh_token,
        marketplace_ids: Array.isArray(row.marketplace_ids) ? row.marketplace_ids.filter(Boolean) : null
      });
    });
  }

  return integrations
    .map((row) => {
      const token = row.selling_partner_id ? tokenMap.get(row.selling_partner_id) : null;
      const marketplaceList = Array.from(
        new Set(
          [
            row.marketplace_id,
            ...(token?.marketplace_ids || []),
            ...SUPPORTED_MARKETPLACES
          ].filter(Boolean)
        )
      );
      return {
        ...row,
        marketplace_ids: marketplaceList.length ? marketplaceList : null,
        refresh_token: token?.refresh_token || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null,
        company_name: companyLabel(row.company_id, COMPANY_NAME_MAP)
      };
    })
    .filter((row) => !!row?.refresh_token);
}

async function fetchEnabledMarketplaceMap(companyIds = []) {
  const ids = Array.from(new Set((companyIds || []).filter(Boolean)));
  let query = supabase
    .from('fbm_order_sync_settings')
    .select('company_id, marketplace_id, enabled, consent_granted_at')
    .eq('enabled', true);
  if (ids.length) {
    query = query.in('company_id', ids);
  }
  const { data, error } = await query;
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.company_id)) {
      map.set(row.company_id, new Map());
    }
    map.get(row.company_id).set(row.marketplace_id, row.consent_granted_at || null);
  }
  return map;
}

function resolveMarketplaceIds(integration) {
  if (Array.isArray(integration.marketplace_ids) && integration.marketplace_ids.length) {
    return integration.marketplace_ids.filter((id) => SUPPORTED_MARKETPLACES.includes(id));
  }
  const fromEnv = parseMarketplaceEnvList();
  if (fromEnv?.length) return fromEnv.filter((id) => SUPPORTED_MARKETPLACES.includes(id));
  if (integration.marketplace_id && SUPPORTED_MARKETPLACES.includes(integration.marketplace_id)) {
    return [integration.marketplace_id];
  }
  return [DEFAULT_MARKETPLACE];
}

async function listAllOrders(spClient, marketplaceId, createdAfterIso = null) {
  const orders = [];
  let nextToken = null;
  do {
    const baseQuery = nextToken
      ? { NextToken: nextToken }
      : {
          MarketplaceIds: [marketplaceId],
          CreatedAfter: createdAfterIso || isoDateDaysAgo(ORDER_WINDOW_DAYS),
          OrderStatuses: ORDER_STATUSES,
          MaxResultsPerPage: ORDERS_PAGE_SIZE
        };
    const res = await spClient.callAPI({
      operation: 'getOrders',
      endpoint: 'orders',
      query: baseQuery
    });
    const pageOrders = res?.Orders || res?.payload?.Orders || [];
    if (Array.isArray(pageOrders)) orders.push(...pageOrders);
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
    const pageItems = res?.OrderItems || res?.payload?.OrderItems || [];
    if (Array.isArray(pageItems)) items.push(...pageItems);
    nextToken =
      res?.payload?.NextToken ||
      res?.payload?.nextToken ||
      res?.NextToken ||
      res?.nextToken ||
      null;
  } while (nextToken);
  return items;
}

async function createOrderRestrictedDataToken(spClient, amazonOrderId) {
  try {
    const res = await spClient.callAPI({
      operation: 'createRestrictedDataToken',
      endpoint: 'tokens',
      body: {
        restrictedResources: [
          {
            method: 'GET',
            path: `/orders/v0/orders/${amazonOrderId}`,
            dataElements: ['shippingAddress', 'buyerInfo']
          },
          {
            method: 'GET',
            path: `/orders/v0/orders/${amazonOrderId}/address`,
            dataElements: ['shippingAddress']
          },
          {
            method: 'GET',
            path: `/orders/v0/orders/${amazonOrderId}/buyerInfo`,
            dataElements: ['buyerInfo']
          }
        ]
      }
    });
    return res?.restrictedDataToken || res?.payload?.restrictedDataToken || null;
  } catch (err) {
    console.warn(
      `[FBM sync] createRestrictedDataToken failed for ${amazonOrderId}: ${err?.message || err}`
    );
    return null;
  }
}

async function getOrderAddressSafe(spClient, amazonOrderId, restrictedDataToken = null) {
  if (!restrictedDataToken) return null;
  try {
    const res = await spClient.callAPI({
      operation: 'getOrderAddress',
      endpoint: 'orders',
      path: { orderId: amazonOrderId },
      restricted_data_token: restrictedDataToken
    });
    return res?.ShippingAddress || res?.payload?.ShippingAddress || null;
  } catch (err) {
    console.warn(`[FBM sync] getOrderAddress failed for ${amazonOrderId}: ${err?.message || err}`);
    return null;
  }
}

async function getOrderBuyerInfoSafe(spClient, amazonOrderId, restrictedDataToken = null) {
  if (!restrictedDataToken) return null;
  try {
    const res = await spClient.callAPI({
      operation: 'getOrderBuyerInfo',
      endpoint: 'orders',
      path: { orderId: amazonOrderId },
      restricted_data_token: restrictedDataToken
    });
    return res?.BuyerInfo || res?.payload?.BuyerInfo || null;
  } catch (err) {
    console.warn(`[FBM sync] getOrderBuyerInfo failed for ${amazonOrderId}: ${err?.message || err}`);
    return null;
  }
}

async function getOrderWithPiiSafe(spClient, amazonOrderId, restrictedDataToken = null) {
  if (!restrictedDataToken) return null;
  try {
    const res = await spClient.callAPI({
      operation: 'getOrder',
      endpoint: 'orders',
      path: { orderId: amazonOrderId },
      restricted_data_token: restrictedDataToken
    });
    return res?.payload || res || null;
  } catch (err) {
    console.warn(`[FBM sync] getOrder failed for ${amazonOrderId}: ${err?.message || err}`);
    return null;
  }
}

function mapLocalStatus(orderStatus) {
  const normalized = String(orderStatus || '').trim().toLowerCase();
  if (!normalized) return 'pending';
  if (normalized === 'canceled') return 'cancelled';
  if (normalized === 'shipped') return 'shipped';
  if (normalized === 'partiallyshipped' || normalized === 'invoiceunconfirmed') return 'processing';
  return 'pending';
}

async function buildStockIndexes(companyId) {
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, asin, sku')
    .eq('company_id', companyId);
  if (error) throw error;
  const byCombo = new Map();
  const bySku = new Map();
  const byAsin = new Map();
  for (const row of data || []) {
    const comboKey = makeComboKey(companyId, row.sku, row.asin);
    const skuKey = normalizeIdentifier(row.sku);
    const asinKey = normalizeIdentifier(row.asin);
    if (comboKey && !byCombo.has(comboKey)) byCombo.set(comboKey, row);
    if (skuKey && !bySku.has(skuKey)) bySku.set(skuKey, row);
    if (asinKey && !byAsin.has(asinKey)) byAsin.set(asinKey, row);
  }
  return { byCombo, bySku, byAsin };
}

function resolveStockItem(companyId, item, indexes) {
  const comboKey = makeComboKey(companyId, item?.SellerSKU, item?.ASIN);
  const skuKey = normalizeIdentifier(item?.SellerSKU);
  const asinKey = normalizeIdentifier(item?.ASIN);
  if (comboKey && indexes.byCombo.has(comboKey)) return indexes.byCombo.get(comboKey);
  if (skuKey && indexes.bySku.has(skuKey)) return indexes.bySku.get(skuKey);
  if (!skuKey && asinKey && indexes.byAsin.has(asinKey)) return indexes.byAsin.get(asinKey);
  return null;
}

function parseAmount(node) {
  return node?.Amount != null ? Number(node.Amount) : null;
}

function summarizeFulfillmentChannels(orders = []) {
  const counts = new Map();
  for (const order of orders) {
    const raw = String(order?.FulfillmentChannel || 'UNKNOWN').trim() || 'UNKNOWN';
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join(', ');
}

async function syncIntegration(integration) {
  console.log(
    `[FBM sync] start integration=${integration.id} company=${integration.company_id} seller=${integration.selling_partner_id || 'n/a'}`
  );
  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });
  const stockIndexes = await buildStockIndexes(integration.company_id);
  const marketplaceIds = resolveMarketplaceIds(integration);

  let totalOrders = 0;
  let totalItems = 0;

  for (const marketplaceId of marketplaceIds) {
    console.log(`[FBM sync] integration=${integration.id} stage=list-orders marketplace=${marketplaceId}`);
    const defaultWindowStart = isoDateDaysAgo(ORDER_WINDOW_DAYS);
    const onboardingWindowStart = isoDateDaysAgo(Math.max(0, ORDER_INITIAL_LOOKBACK_DAYS));
    const createdAfterIso = onboardingWindowStart > defaultWindowStart
      ? onboardingWindowStart
      : defaultWindowStart;
    const orders = await listAllOrders(spClient, marketplaceId, createdAfterIso);
    const sellerFulfilledOrders = orders.filter((order) => {
      const channel = String(order?.FulfillmentChannel || '').trim().toLowerCase();
      return channel === 'mfn' || channel === 'sellerfulfilled' || channel === 'default';
    });

    console.log(
      `[FBM sync] ${integration.id} marketplace ${marketplaceId}: rawOrders=${orders.length}, sellerFulfilled=${sellerFulfilledOrders.length}, rawFulfillment=${summarizeFulfillmentChannels(orders)}`
    );

    for (const order of sellerFulfilledOrders) {
      const amazonOrderId = order?.AmazonOrderId;
      if (!amazonOrderId) continue;

      const { data: existingOrder } = await supabase
        .from('fbm_orders')
        .select('id, local_status')
        .eq('company_id', integration.company_id)
        .eq('amazon_order_id', amazonOrderId)
        .maybeSingle();

      const restrictedDataToken = await createOrderRestrictedDataToken(spClient, amazonOrderId);
      if (!restrictedDataToken) {
        console.warn(
          `[FBM sync] ${amazonOrderId}: restricted buyer/address data unavailable. Check Amazon PII approval or Tokens API permissions.`
        );
      }

      const [address, buyerInfo, orderDetails, orderItems] = await Promise.all([
        getOrderAddressSafe(spClient, amazonOrderId, restrictedDataToken),
        getOrderBuyerInfoSafe(spClient, amazonOrderId, restrictedDataToken),
        getOrderWithPiiSafe(spClient, amazonOrderId, restrictedDataToken),
        listOrderItems(spClient, amazonOrderId)
      ]);

      const orderShippingAddress = order?.ShippingAddress || null;
      const effectiveAddress =
        address ||
        orderDetails?.ShippingAddress ||
        orderShippingAddress ||
        null;
      const effectiveBuyerInfo = buyerInfo || orderDetails?.BuyerInfo || null;

      if (!effectiveAddress?.Name && !effectiveAddress?.Phone && !effectiveBuyerInfo?.BuyerName && !effectiveBuyerInfo?.BuyerEmail) {
        console.warn(
          `[FBM sync] ${amazonOrderId}: Amazon returned no buyer/address PII after RDT. This usually means missing restricted roles approval or no PII available for this order.`
        );
      }

      const country = mapMarketplaceToCountry(order?.MarketplaceId || marketplaceId);
      const orderPatch = {
        company_id: integration.company_id,
        user_id: integration.user_id,
        integration_id: integration.id === 'single-mode' ? null : integration.id,
        marketplace_id: order?.MarketplaceId || marketplaceId,
        marketplace_country: country,
        amazon_order_id: amazonOrderId,
        seller_order_id: order?.SellerOrderId || null,
        amazon_order_status: order?.OrderStatus || null,
        local_status:
          existingOrder?.local_status && existingOrder.local_status !== 'pending'
            ? existingOrder.local_status
            : mapLocalStatus(order?.OrderStatus),
        fulfillment_channel: order?.FulfillmentChannel || null,
        sales_channel: order?.SalesChannel || null,
        shipment_service_level_category: order?.ShipmentServiceLevelCategory || null,
        order_total_amount: parseAmount(order?.OrderTotal),
        order_total_currency: order?.OrderTotal?.CurrencyCode || null,
        number_of_items_shipped: Number(order?.NumberOfItemsShipped || 0) || 0,
        number_of_items_unshipped: Number(order?.NumberOfItemsUnshipped || 0) || 0,
        purchase_date: order?.PurchaseDate || null,
        latest_ship_date: order?.LatestShipDate || null,
        latest_delivery_start_date: order?.LatestDeliveryDate || null,
        latest_delivery_end_date: order?.LatestDeliveryDate || null,
        buyer_email: effectiveBuyerInfo?.BuyerEmail || null,
        buyer_name: effectiveBuyerInfo?.BuyerName || order?.BuyerInfo?.BuyerName || null,
        buyer_phone: effectiveAddress?.Phone || null,
        recipient_name: effectiveAddress?.Name || effectiveBuyerInfo?.BuyerName || order?.BuyerInfo?.BuyerName || null,
        company_name: effectiveAddress?.CompanyName || null,
        address_line_1: effectiveAddress?.AddressLine1 || null,
        address_line_2: effectiveAddress?.AddressLine2 || null,
        address_line_3: effectiveAddress?.AddressLine3 || null,
        city: effectiveAddress?.City || orderShippingAddress?.City || null,
        state_or_region: effectiveAddress?.StateOrRegion || orderShippingAddress?.StateOrRegion || null,
        postal_code: effectiveAddress?.PostalCode || orderShippingAddress?.PostalCode || null,
        country_code: effectiveAddress?.CountryCode || orderShippingAddress?.CountryCode || null,
        address_phone: effectiveAddress?.Phone || null,
        raw_order: order,
        raw_address: effectiveAddress || {},
        raw_buyer: effectiveBuyerInfo || {},
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: upsertedOrders, error: orderError } = await supabase
        .from('fbm_orders')
        .upsert(orderPatch, { onConflict: 'company_id,amazon_order_id' })
        .select('id');
      if (orderError) throw orderError;

      const orderId = upsertedOrders?.[0]?.id;
      if (!orderId) continue;

      const itemRows = (orderItems || []).map((item) => {
        const stockItem = resolveStockItem(integration.company_id, item, stockIndexes);
        return {
          order_id: orderId,
          company_id: integration.company_id,
          stock_item_id: stockItem?.id || null,
          amazon_order_item_id: item?.OrderItemId || item?.AmazonOrderItemId || `${amazonOrderId}:${item?.SellerSKU || item?.ASIN || Math.random()}`,
          asin: item?.ASIN || null,
          sku: item?.SellerSKU || null,
          title: item?.Title || null,
          quantity_ordered: Number(item?.QuantityOrdered || 0) || 0,
          quantity_shipped: Number(item?.QuantityShipped || 0) || 0,
          item_price_amount: parseAmount(item?.ItemPrice),
          item_price_currency: item?.ItemPrice?.CurrencyCode || null,
          item_tax_amount: parseAmount(item?.ItemTax),
          promotion_discount_amount: parseAmount(item?.PromotionDiscount),
          shipping_price_amount: parseAmount(item?.ShippingPrice),
          shipping_tax_amount: parseAmount(item?.ShippingTax),
          gift_wrap_price_amount: parseAmount(item?.GiftWrapPrice),
          gift_wrap_tax_amount: parseAmount(item?.GiftWrapTax),
          item_condition: item?.ConditionId || null,
          item_condition_subtype: item?.ConditionSubtypeId || null,
          raw_item: item,
          updated_at: new Date().toISOString()
        };
      });

      if (itemRows.length) {
        const { error: itemsError } = await supabase
          .from('fbm_order_items')
          .upsert(itemRows, { onConflict: 'order_id,amazon_order_item_id' });
        if (itemsError) throw itemsError;
      }

      totalOrders += 1;
      totalItems += itemRows.length;
    }
  }

  const syncedAt = new Date().toISOString();
  const integrationIds = Array.isArray(integration.integration_ids) && integration.integration_ids.length
    ? integration.integration_ids
    : [integration.id];
  await supabase
    .from('amazon_integrations')
    .update({ last_error: null, last_synced_at: syncedAt })
    .in('id', integrationIds);

  console.log(
    `[FBM sync] integration ${integration.id} finished: orders=${totalOrders}, items=${totalItems}.`
  );
}

async function main(resumeCompanyId = null) {
  console.log('[FBM sync] stage=load-enabled-marketplaces start');
  const enabledMarketplaceMap = await fetchEnabledMarketplaceMap();
  console.log(`[FBM sync] stage=load-enabled-marketplaces done companies=${enabledMarketplaceMap.size}`);
  const enabledCompanyIds = Array.from(enabledMarketplaceMap.keys());
  if (!enabledCompanyIds.length) {
    console.log('[FBM sync] No companies have enabled FBM marketplace access.');
    return { resumeNextCompanyId: null };
  }

  console.log('[FBM sync] stage=load-integrations start');
  const integrations = await fetchActiveIntegrations(enabledCompanyIds);
  console.log(`[FBM sync] stage=load-integrations done integrations=${integrations.length}`);
  if (!integrations.length) {
    console.log('[FBM sync] No active Amazon integrations found for companies with FBM access enabled.');
    return { resumeNextCompanyId: null };
  }

  const startedAt = Date.now();
  const companies = new Map();
  for (const integration of integrations) {
    if (!companies.has(integration.company_id)) companies.set(integration.company_id, []);
    companies.get(integration.company_id).push(integration);
  }

  let companyEntries = Array.from(companies.entries()).map(([companyId, rows]) => ({
    companyId,
    integrations: rows
  }));
  console.log(`[FBM sync] stage=group-by-company done companies=${companyEntries.length}`);

  if (resumeCompanyId) {
    const idx = companyEntries.findIndex((entry) => entry.companyId === resumeCompanyId);
    if (idx > 0) {
      companyEntries = [...companyEntries.slice(idx), ...companyEntries.slice(0, idx)];
    }
  }

  companyEntries = companyEntries
    .map((entry) => {
      const companyMarketMap = enabledMarketplaceMap.get(entry.companyId) || new Map();
      const enabledMarkets = Array.from(companyMarketMap.keys()).filter((id) =>
        SUPPORTED_MARKETPLACES.includes(id)
      );
      const marketplaceConsent = Object.fromEntries(
        enabledMarkets.map((id) => [id, companyMarketMap.get(id) || null])
      );
      return {
        ...entry,
        enabledMarkets,
        integrations: enabledMarkets.length
          ? Array.from(
              entry.integrations.reduce((acc, integration) => {
                const groupKey =
                  integration.selling_partner_id ||
                  integration.refresh_token ||
                  integration.id;
                if (!acc.has(groupKey)) {
                  acc.set(groupKey, {
                    ...integration,
                    integration_ids: [integration.id],
                    marketplace_ids: enabledMarkets,
                    marketplace_consent: marketplaceConsent
                  });
                } else {
                  acc.get(groupKey).integration_ids.push(integration.id);
                }
                return acc;
              }, new Map()).values()
            )
          : []
      };
    })
    .filter((entry) => entry.enabledMarkets.length > 0);
  console.log(`[FBM sync] stage=prepare-sync done companies=${companyEntries.length}`);

  if (!companyEntries.length) {
    console.log('[FBM sync] No companies have enabled FBM marketplace access.');
    return { resumeNextCompanyId: null };
  }

  let resumeNextCompanyId = null;
  for (const entry of companyEntries) {
    if (Date.now() - startedAt >= FBM_SYNC_TIME_BUDGET_MS) {
      resumeNextCompanyId = entry.companyId;
      break;
    }
    for (const integration of entry.integrations) {
      try {
        await syncIntegration(integration);
      } catch (err) {
        console.error(`[FBM sync] Failed for integration ${integration.id}`, err);
        await supabase
          .from('amazon_integrations')
          .update({ last_error: String(err?.message || err) })
          .eq('id', integration.id);
      }
    }
  }

  return { resumeNextCompanyId };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runForever() {
  let resumeCompanyId = null;
  do {
    const result = await main(resumeCompanyId);
    resumeCompanyId = result?.resumeNextCompanyId || null;
    if (!FBM_SYNC_LOOP) break;
    if (resumeCompanyId) {
      console.log('[FBM sync] Resuming immediately with remaining companies.');
      continue;
    }
    console.log(`[FBM sync] Sleeping ${Math.round(FBM_SYNC_INTERVAL_MS / 1000)}s before next run.`);
    await delay(Math.max(0, FBM_SYNC_INTERVAL_MS));
  } while (true);
}

runForever().catch((err) => {
  console.error('[FBM sync] Fatal error', err);
  process.exit(1);
});
