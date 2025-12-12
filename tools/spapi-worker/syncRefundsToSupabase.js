import 'dotenv/config';
import { subDays } from 'date-fns';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';

const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';
const ORDER_WINDOW_DAYS = Number(process.env.SPAPI_ORDER_WINDOW_DAYS || 30);

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

function normalizeKeyPart(value) {
  return (value || '').trim().toUpperCase();
}

function makeRowKey(asin, sku, country) {
  const countryKey = country ? country.toUpperCase() : '';
  const asinKey = normalizeKeyPart(asin);
  const skuKey = normalizeKeyPart(sku);
  if (!asinKey && !skuKey) return null;
  return `${asinKey}::${skuKey}::${countryKey}`;
}

function mapMarketplaceToCountry(marketplaceId) {
  return MARKETPLACE_COUNTRY[marketplaceId] || marketplaceId || null;
}

async function listRefundEvents(spClient, marketplaceIds) {
  const postedAfter = isoDateDaysAgo(ORDER_WINDOW_DAYS);
  const events = [];
  let nextToken = null;

  const ids = Array.isArray(marketplaceIds) && marketplaceIds.length
    ? marketplaceIds
    : [DEFAULT_MARKETPLACE];

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
  for (const ev of refundEvents || []) {
    const country = mapMarketplaceToCountry(ev.MarketplaceId) || defaultCountry || null;
    const items =
      ev.ShipmentItemAdjustmentList ||
      ev.ShipmentItemList ||
      [];
    for (const it of items) {
      const asinValue = (it.ASIN || '').trim();
      const skuValue = (it.SellerSKU || '').trim();
      const asinKey = normalizeKeyPart(asinValue);
      const skuKey = normalizeKeyPart(skuValue);
      if (!asinKey && !skuKey) continue;
      const key = `${asinKey}::${skuKey}::${country || ''}`;
      const qty =
        Number(it.QuantityShipped ?? it.Quantity ?? it.QuantityOrdered ?? it.ItemQuantity ?? 0) || 0;
      const current = map.get(key) || {
        asin: asinValue || null,
        sku: skuValue || null,
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
        marketplace_ids: parseMarketplaceEnvList() || [process.env.SPAPI_MARKETPLACE_ID || DEFAULT_MARKETPLACE],
        region: process.env.SPAPI_REGION || 'eu',
        refresh_token: process.env.SPAPI_REFRESH_TOKEN,
        status: 'active'
      }
    ];
  }
  return null;
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

  return integrations
    .map((row) => {
      const token = row.selling_partner_id ? tokenMap.get(row.selling_partner_id) : null;
      const allowedMarketplaces =
        token?.marketplace_ids && token.marketplace_ids.length ? token.marketplace_ids : null;
      if (allowedMarketplaces && !allowedMarketplaces.includes(row.marketplace_id)) {
        return null;
      }
      return {
        ...row,
        marketplace_ids: allowedMarketplaces,
        refresh_token:
          token?.refresh_token || row.refresh_token || process.env.SPAPI_REFRESH_TOKEN || null
      };
    })
    .filter((row) => !!row?.refresh_token);
}

function resolveMarketplaceIds(integration) {
  if (Array.isArray(integration.marketplace_ids) && integration.marketplace_ids.length) {
    return integration.marketplace_ids;
  }
  const fromEnv = parseMarketplaceEnvList();
  if (fromEnv) return fromEnv;
  if (integration.marketplace_id) {
    return [integration.marketplace_id];
  }
  return [];
}

function accumulateRefundRows(map, rows) {
  const toNumber = (value) => Number(value ?? 0) || 0;
  for (const row of rows || []) {
    const key = makeRowKey(row.asin, row.sku, row.country);
    if (!key) continue;
    const existing = map.get(key) || {
      asin: row.asin || null,
      sku: row.sku || null,
      country: row.country || null,
      total_units: 0,
      pending_units: 0,
      shipped_units: 0,
      refund_units: 0,
      payment_units: 0
    };
    existing.refund_units += toNumber(row.refund_units);
    map.set(key, existing);
  }
}

function buildGlobalRefundRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const asinKey = normalizeKeyPart(row.asin);
    const skuKey = normalizeKeyPart(row.sku);
    if (!asinKey && !skuKey) continue;
    const key = `${asinKey}::${skuKey}`;
    const current = map.get(key) || {
      asin: row.asin || null,
      sku: row.sku || null,
      country: null,
      total_units: 0,
      pending_units: 0,
      shipped_units: 0,
      refund_units: 0,
      payment_units: 0
    };
    current.refund_units += Number(row.refund_units ?? 0) || 0;
    map.set(key, current);
  }
  return Array.from(map.values());
}

async function upsertRefundsForCompany({ companyId, userId, rows }) {
  const now = new Date().toISOString();
  const { data: existingRows, error } = await supabase
    .from('amazon_sales_30d')
    .select('id, user_id, asin, sku, country, total_units, pending_units, shipped_units, payment_units')
    .eq('company_id', companyId);
  if (error) throw error;

  const map = new Map();
  for (const existing of existingRows || []) {
    const key = makeRowKey(existing.asin, existing.sku, existing.country);
    if (!key) continue;
    map.set(key, {
      id: existing.id,
      company_id: companyId,
      user_id: existing.user_id || userId || null,
      asin: existing.asin,
      sku: existing.sku,
      country: existing.country,
      total_units: Number(existing.total_units ?? 0) || 0,
      pending_units: Number(existing.pending_units ?? 0) || 0,
      shipped_units: Number(existing.shipped_units ?? 0) || 0,
      payment_units: Number(existing.payment_units ?? 0) || 0,
      refund_units: 0,
      refreshed_at: now
    });
  }

  for (const row of rows || []) {
    const key = makeRowKey(row.asin, row.sku, row.country);
    if (!key) continue;
    const payload = map.get(key);
    if (payload) {
      payload.refund_units = Number(row.refund_units ?? 0) || 0;
    } else {
      map.set(key, {
        company_id: companyId,
        user_id: userId || null,
        asin: row.asin || null,
        sku: row.sku || null,
        country: row.country || null,
        total_units: 0,
        pending_units: 0,
        shipped_units: 0,
        payment_units: 0,
        refund_units: Number(row.refund_units ?? 0) || 0,
        refreshed_at: now
      });
    }
  }

  if (map.size === 0) {
    return;
  }

  const chunkSize = 500;
  const payload = Array.from(map.values());
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error: upsertError } = await supabase.from('amazon_sales_30d').upsert(chunk);
    if (upsertError) throw upsertError;
  }
}

async function syncRefundsForIntegration(integration) {
  const marketplaceIds = resolveMarketplaceIds(integration);
  if (!marketplaceIds.length) {
    console.warn(
      `[Refund sync] Skipping integration ${integration.id} because it has no marketplace_id or marketplace_ids configured.`
    );
    return null;
  }

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing refunds for integration ${integration.id} (company ${integration.company_id}, marketplace ${integration.marketplace_id})`
  );

  let refundEvents = [];
  try {
    refundEvents = await listRefundEvents(spClient, marketplaceIds);
  } catch (err) {
    const message = String(err?.message || err || '');
    if (err?.code === 'Unauthorized' || message.includes('Access to requested resource is denied')) {
      console.warn(
        `[Refund sync] Skipping integration ${integration.id} (${integration.marketplace_id}) because SP-API returned unauthorized.`
      );
      await supabase
        .from('amazon_integrations')
        .update({
          status: 'error',
          last_error: message,
          last_synced_at: new Date().toISOString()
        })
        .eq('id', integration.id);
      return null;
    }
    throw err;
  }

  const countryFallback = mapMarketplaceToCountry(integration.marketplace_id);
  const refundRows = aggregateRefundEvents(refundEvents, countryFallback);

  await supabase
    .from('amazon_integrations')
    .update({ last_error: null, last_synced_at: new Date().toISOString() })
    .eq('id', integration.id);

  console.log(
    `Done refund sync for integration ${integration.id}: ${refundRows.length} ASIN/SKU rows returned.`
  );

  return refundRows;
}

async function main() {
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('No active integrations found. Exiting.');
    return;
  }

  const refundsByCompany = new Map();

  for (const integration of integrations) {
    let rows = [];
    try {
      rows = await syncRefundsForIntegration(integration);
    } catch (err) {
      console.error(`[Refund sync] Failed for integration ${integration.id}`, err);
      await supabase
        .from('amazon_integrations')
        .update({ last_error: String(err?.message || err) })
        .eq('id', integration.id);
      continue;
    }

    if (rows === null) {
      continue;
    }

    if (!refundsByCompany.has(integration.company_id)) {
      refundsByCompany.set(integration.company_id, {
        userId: integration.user_id || null,
        rows: new Map()
      });
    }

    const companyBucket = refundsByCompany.get(integration.company_id);
    if (!companyBucket.userId && integration.user_id) {
      companyBucket.userId = integration.user_id;
    }
    if (rows.length) {
      accumulateRefundRows(companyBucket.rows, rows);
    }
  }

  for (const [companyId, companyData] of refundsByCompany.entries()) {
    const perCountryRows = Array.from(companyData.rows.values());
    const allRows = [...perCountryRows, ...buildGlobalRefundRows(perCountryRows)];
    await upsertRefundsForCompany({
      companyId,
      userId: companyData.userId,
      rows: allRows
    });
  }
}

main().catch((err) => {
  console.error('Fatal error in refund sync', err);
  process.exit(1);
});
