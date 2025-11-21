import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const SHOULD_FETCH_TITLES =
  process.env.SPAPI_FETCH_TITLES === 'true' || process.env.SPAPI_FETCH_TITLES === '1';
const TITLE_LOOKUP_LIMIT = Number(process.env.SPAPI_TITLE_LOOKUPS || 20);
const TITLE_LOOKUP_DELAY = Number(process.env.SPAPI_TITLE_DELAY_MS || 350);
const DEFAULT_MARKETPLACE = process.env.SPAPI_MARKETPLACE_ID || 'A13V1IB3VIYZZH';

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

async function fetchInventorySummaries(spClient, marketplaceId) {
  const chunks = [];
  let nextToken = null;
  const market = marketplaceId || DEFAULT_MARKETPLACE;

  do {
    const query = nextToken
      ? { nextToken }
      : {
          marketplaceId: market,
          granularityType: 'Marketplace',
          granularityId: market,
          details: true
        };

    const res = await spClient.callAPI({
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query
    });

    if (!res) {
      throw new Error('Empty response from getInventorySummaries');
    }

    chunks.push(...(res.inventorySummaries || []));
    nextToken = res.nextToken ?? null;
  } while (nextToken);

  return chunks;
}

function normalizeInventory(raw = []) {
  const map = new Map();

  for (const summary of raw) {
    const sku = (summary.sellerSku || summary.sku || '').trim();
    const asin = (summary.asin || '').trim();
    const key = (sku || asin).toLowerCase();
    if (!key) continue;

    const details = summary.inventoryDetails || {};
    const fulfillable = Number(details.fulfillableQuantity ?? 0);
    const inboundTotal =
      Number(details.inboundWorkingQuantity ?? 0) +
      Number(details.inboundShippedQuantity ?? 0) +
      Number(details.inboundReceivedQuantity ?? 0);
    const reserved = (() => {
      if (details.reservedQuantity == null) return 0;
      if (typeof details.reservedQuantity === 'number') return Number(details.reservedQuantity);
      if (typeof details.reservedQuantity === 'object') {
        return Number(
          details.reservedQuantity.totalReservedQuantity ??
            details.reservedQuantity.reservedQuantity ??
            details.reservedQuantity.total ??
            0
        );
      }
      return 0;
    })();
    const unfulfillable = Number(details.unfulfillableQuantity ?? details.totalUnfulfillableQuantity ?? 0);

    const baseline = map.get(key) || {
      key,
      asin: asin || null,
      sku: sku || null,
      fnsku: summary.fnSku || null,
      amazon_stock: 0,
      amazon_inbound: 0,
      amazon_reserved: 0,
      amazon_unfulfillable: 0,
      name: summary.productName || null
    };

    baseline.amazon_stock += fulfillable;
    baseline.amazon_inbound += inboundTotal;
    baseline.amazon_reserved += reserved;
    baseline.amazon_unfulfillable += unfulfillable;
    if (!baseline.asin && asin) baseline.asin = asin;
    if (!baseline.sku && sku) baseline.sku = sku;
    if (!baseline.fnsku && summary.fnSku) baseline.fnsku = summary.fnSku;

    map.set(key, baseline);
  }

  return Array.from(map.values());
}

async function fetchCatalogTitles(spClient, marketplaceId, asins) {
  if (!SHOULD_FETCH_TITLES) return new Map();
  const unique = [...new Set(asins.filter(Boolean).map((a) => a.toLowerCase()))];
  const limited = unique.slice(0, Math.max(0, TITLE_LOOKUP_LIMIT));

  const titles = new Map();
  for (const asin of limited) {
    try {
      const res = await spClient.callAPI({
        operation: 'getCatalogItem',
        endpoint: 'catalogItemsV20220401',
        path: { asin },
        query: { marketplaceIds: [marketplaceId || DEFAULT_MARKETPLACE] }
      });

      const title = extractCatalogTitle(res);
      if (title) titles.set(asin, title);
    } catch (err) {
      console.warn(`Catalog lookup failed for ${asin}:`, err?.message || err);
    }
    if (limited.length > 1) {
      await delay(TITLE_LOOKUP_DELAY);
    }
  }
  return titles;
}

function extractCatalogTitle(payload) {
  const attributes = payload?.attributes;
  if (attributes?.item_name?.length) {
    const first = attributes.item_name[0];
    if (first?.value) return first.value;
  }

  const summary = payload?.summaries?.[0];
  if (summary?.itemName) return summary.itemName;
  if (summary?.displayName) return summary.displayName;

  return null;
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
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('stock_items').upsert(chunk);
    if (error) throw error;
  }
}

async function syncToSupabase({ items, companyId, userId, spClient, marketplaceId }) {
  if (items.length === 0) {
    console.log('Amazon returned no inventory summaries. Nothing to sync.');
    return { affected: 0, zeroed: 0 };
  }

  const { data: existing, error } = await supabase
    .from('stock_items')
    .select('id, sku, asin, name, amazon_stock')
    .eq('company_id', companyId);
  if (error) throw error;

  const existingByKey = new Map();
  (existing || []).forEach((row) => {
    const key = keyFromRow(row);
    if (key) existingByKey.set(key, row);
  });

  const seenKeys = new Set();
  const insertsOrUpdates = [];
  const catalogTargets = [];

  for (const item of items) {
    const key = item.key;
    if (!key) continue;
    seenKeys.add(key);
    const row = existingByKey.get(key);

    if (row) {
      const patch = {
        id: row.id,
        amazon_stock: item.amazon_stock,
        amazon_inbound: item.amazon_inbound,
        amazon_reserved: item.amazon_reserved,
        amazon_unfulfillable: item.amazon_unfulfillable
      };
      if (!row.asin && item.asin) patch.asin = item.asin;
      if (!row.sku && item.sku) patch.sku = item.sku;
      if ((!row.name || !row.name.trim()) && item.name) patch.name = item.name;
      insertsOrUpdates.push(patch);
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
      catalogTargets.push(item.asin);
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

  if (catalogTargets.length) {
    const titleMap = await fetchCatalogTitles(spClient, marketplaceId, catalogTargets);
    if (titleMap.size) {
      insertsOrUpdates.forEach((record) => {
        if (record.id) return;
        if (record.name && record.name !== record.asin && record.name !== record.sku) return;
        const asin = record.asin ? record.asin.toLowerCase() : null;
        if (asin && titleMap.has(asin)) {
          record.name = titleMap.get(asin);
        }
      });
    }
  }

  await upsertStockRows(insertsOrUpdates);
  return { affected: insertsOrUpdates.length, zeroed: missing.length };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function syncIntegration(integration) {
  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `Syncing integration ${integration.id} (company ${integration.company_id}, marketplace ${integration.marketplace_id})`
  );

  try {
    const raw = await fetchInventorySummaries(spClient, integration.marketplace_id);
    const normalized = normalizeInventory(raw);
    const stats = await syncToSupabase({
      items: normalized,
      companyId: integration.company_id,
      userId: integration.user_id,
      spClient,
      marketplaceId: integration.marketplace_id
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
