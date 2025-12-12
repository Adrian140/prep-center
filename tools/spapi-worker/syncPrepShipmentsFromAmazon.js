import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const STATUS_LIST = [
  'WORKING',
  'SHIPPED',
  'RECEIVING',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
  'DELETED'
];

const MAX_ROWS = Number(process.env.PREP_SHIP_SYNC_LIMIT || 50);

async function fetchSellerTokens(sellerIds) {
  if (!sellerIds.length) return new Map();
  const { data, error } = await supabase
    .from('seller_tokens')
    .select('seller_id, refresh_token')
    .in('seller_id', sellerIds);
  if (error) throw error;
  const map = new Map();
  (data || []).forEach((row) => {
    if (row.seller_id && row.refresh_token) {
      map.set(row.seller_id, row.refresh_token);
    }
  });
  return map;
}

const normalizeKey = (value) => (value ? value.trim().toUpperCase() : '');

async function updateItemAmazonQuantities(prepItems, amazonItems) {
  const itemsArray = Array.isArray(prepItems) ? prepItems : [];
  if (!itemsArray.length || !amazonItems?.length) return;
  const bySku = new Map();
  const byAsin = new Map();
  itemsArray.forEach((item) => {
    const skuKey = normalizeKey(item?.sku);
    const asinKey = normalizeKey(item?.asin);
    if (skuKey) bySku.set(skuKey, item);
    if (asinKey) byAsin.set(asinKey, item);
  });
  const updatesMap = new Map();
  amazonItems.forEach((amazonItem) => {
    const skuKey = normalizeKey(amazonItem?.SellerSKU);
    const asinKey = normalizeKey(amazonItem?.ASIN);
    const matched =
      (skuKey && bySku.get(skuKey)) ||
      (asinKey && byAsin.get(asinKey));
    if (!matched?.id) return;
    const expected = Number(amazonItem?.QuantityShipped ?? 0);
    const received = Number(amazonItem?.QuantityReceived ?? 0);
    if (
      matched.amazon_units_expected === expected &&
      matched.amazon_units_received === received
    ) {
      return;
    }
    updatesMap.set(matched.id, {
      id: matched.id,
      amazon_units_expected: expected,
      amazon_units_received: received
    });
  });
  const updates = Array.from(updatesMap.values());
  for (const patch of updates) {
    const { error } = await supabase
      .from('prep_request_items')
      .update({
        amazon_units_expected: patch.amazon_units_expected,
        amazon_units_received: patch.amazon_units_received
      })
      .eq('id', patch.id);
    if (error) throw error;
  }
}

function assertEnv() {
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
        marketplace_id: process.env.SPAPI_MARKETPLACE_ID,
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
      'id, user_id, company_id, marketplace_id, region, refresh_token, status, selling_partner_id'
    )
    .eq('status', 'active');
  if (error) throw error;
  const integrations = data || [];
  const sellerIds = integrations
    .map((r) => r.selling_partner_id)
    .filter((id) => typeof id === 'string' && id.length);
  const tokenMap = await fetchSellerTokens(sellerIds);

  return integrations
    .map((row) => {
      const token = row.selling_partner_id ? tokenMap.get(row.selling_partner_id) : null;
      const allowedMarketplaces =
        token?.marketplace_ids && token.marketplace_ids.length ? token.marketplace_ids : null;
      if (allowedMarketplaces && !allowedMarketplaces.includes(row.marketplace_id)) {
        return null;
      }
      const refresh =
        row.refresh_token ||
        token?.refresh_token ||
        process.env.SPAPI_REFRESH_TOKEN ||
        null;
      return refresh
        ? {
            ...row,
            marketplace_ids: allowedMarketplaces,
            refresh_token: refresh
          }
        : null;
    })
    .filter(Boolean);
}

async function fetchPrepRequests() {
  const { data, error } = await supabase
    .from('prep_requests')
    .select(
      `
      id,
      user_id,
      company_id,
      fba_shipment_id,
      status,
      prep_status,
      amazon_status,
      amazon_skus,
      amazon_units_expected,
      amazon_units_located,
      amazon_last_synced_at,
      prep_request_items (
        id,
        asin,
        sku,
        product_name,
        units_requested,
        amazon_units_expected,
        amazon_units_received
      )
    `
    )
    .not('fba_shipment_id', 'is', null)
    .order('amazon_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(MAX_ROWS);
  if (error) throw error;
  return data || [];
}

const normalizeShipmentIds = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(/[\/,]/)
    .map((s) => s.trim().toUpperCase())
    .flatMap((chunk) => chunk.split(/\s+/))
    .map((s) => s.replace(/%20/g, ''))
    .map((s) => s.replace(/\s+/g, ''))
    .filter((s) => s.length > 0);
};

const resolveMarketplaceId = (integration) => {
  if (integration?.marketplace_id) {
    return integration.marketplace_id;
  }
  if (Array.isArray(integration?.marketplace_ids) && integration.marketplace_ids.length) {
    return integration.marketplace_ids[0];
  }
  return null;
};

async function fetchShipmentSnapshot(spClient, rawShipmentId, marketplaceId) {
  const candidates = normalizeShipmentIds(rawShipmentId);
  const shipmentId = candidates[0] || rawShipmentId;

  const tryFetchShipments = async (mpId) => {
    const query = {
      ShipmentStatusList: STATUS_LIST,
      ShipmentIdList: candidates.length ? candidates : [shipmentId]
    };
    if (mpId) {
      query.MarketplaceId = mpId;
    }
    return spClient.callAPI({
      operation: 'getShipments',
      endpoint: 'fulfillmentInbound',
      query,
      options: {
        version: 'v0'
      }
    });
  };

  const mpCandidates = marketplaceId ? [marketplaceId] : [null];

  let shipmentRes = null;
  let pickedMarketplace = null;

  for (const mp of mpCandidates) {
    try {
      shipmentRes = await tryFetchShipments(mp);
      pickedMarketplace = mp;
      if (shipmentRes?.payload?.ShipmentData?.length) break;
    } catch (err) {
      // încercăm fără MarketplaceId dacă e invalid
      try {
        shipmentRes = await tryFetchShipments(null);
        pickedMarketplace = null;
      } catch {
        continue;
      }
    }
    if (shipmentRes?.payload?.ShipmentData?.length) break;
  }

  const shipmentPayload = shipmentRes?.payload || shipmentRes;
  const shipmentList = Array.isArray(shipmentPayload?.ShipmentData) ? shipmentPayload.ShipmentData : [];
  const shipment =
    shipmentList.find((s) => candidates.includes(s.ShipmentId)) ||
    shipmentList.find((s) => s.ShipmentId === shipmentId) ||
    shipmentList[0] ||
    null;

  if (!shipment) {
    throw new Error(`Shipment not found for ${shipmentId}`);
  }

  // Fetch items; încercăm cu marketplace-ul ales, apoi fallback fără
  let itemsRes;
  try {
    itemsRes = await spClient.callAPI({
      operation: 'getShipmentItemsByShipmentId',
      endpoint: 'fulfillmentInbound',
      path: { shipmentId },
      query: pickedMarketplace || marketplaceId ? { MarketplaceId: pickedMarketplace || marketplaceId } : {},
      options: { version: 'v0' }
    });
  } catch (err) {
    // fallback fără MarketplaceId
    itemsRes = await spClient.callAPI({
      operation: 'getShipmentItemsByShipmentId',
      endpoint: 'fulfillmentInbound',
      path: { shipmentId },
      query: {},
      options: { version: 'v0' }
    });
  }

  const itemPayload = itemsRes?.payload || itemsRes;
  const items = Array.isArray(itemPayload?.ItemData) ? itemPayload.ItemData : [];
  const skuSet = new Set();
  const unitsExpected = items.reduce((acc, item) => acc + Number(item?.QuantityShipped || 0), 0);
  const unitsReceived = items.reduce((acc, item) => acc + Number(item?.QuantityReceived || 0), 0);
  const shipFrom = shipment?.ShipFromAddress || {};
  const shipTo = shipment?.ShipToAddress || null;
  items.forEach((it) => {
    if (it?.SellerSKU) skuSet.add(it.SellerSKU);
    if (it?.FNSKU) skuSet.add(it.FNSKU);
  });

  const snapshot = {
    shipment_id: shipmentId,
    shipment_name: shipment?.ShipmentName || null,
    reference_id: shipment?.ShipmentReferenceId || null,
    destination_code: shipment?.DestinationFulfillmentCenterId || null,
    delivery_window: shipment?.EstimatedArrivalDate || null,
    status: shipment?.ShipmentStatus || null,
    skus: skuSet.size || null,
    units_expected: Number.isFinite(unitsExpected) ? unitsExpected : null,
    units_located: Number.isFinite(unitsReceived) ? unitsReceived : null,
    last_updated: shipment?.LastUpdatedDate || shipment?.LastUpdatedTimestamp || null,
    created_date: shipment?.CreatedDate || shipment?.CreationDate || null,
    created_using: shipment?.CreatedUsing || null,
    ship_from: {
      name: shipFrom?.Name || null,
      address1: shipFrom?.AddressLine1 || null,
      address2: shipFrom?.AddressLine2 || null,
      city: shipFrom?.City || null,
      state: shipFrom?.StateOrRegion || null,
      postal_code: shipFrom?.PostalCode || null,
      country_code: shipFrom?.CountryCode || null,
      phone: shipFrom?.Phone || null
    },
    ship_to: shipTo
      ? {
          name: shipTo?.Name || null,
          address1: shipTo?.AddressLine1 || null,
          address2: shipTo?.AddressLine2 || null,
          city: shipTo?.City || null,
          state: shipTo?.StateOrRegion || null,
          postal_code: shipTo?.PostalCode || null,
          country_code: shipTo?.CountryCode || null,
          phone: shipTo?.Phone || null
        }
      : null
  };

  return { snapshot, items };
}

async function updatePrepRequest(id, patch) {
  const { error } = await supabase.from('prep_requests').update(patch).eq('id', id);
  if (error) throw error;
}

async function main() {
  assertEnv();
  const integrations = await fetchActiveIntegrations();
  const byUser = new Map();
  const byCompany = new Map();
  integrations.forEach((row) => {
    if (row.user_id) byUser.set(row.user_id, row);
    if (row.company_id) byCompany.set(row.company_id, row);
  });

  const prepRequests = await fetchPrepRequests();
  if (!prepRequests.length) {
    console.log('No prep_requests with FBA Shipment ID to sync.');
    return;
  }

  const spClientCache = new Map();
  const nowIso = new Date().toISOString();

  for (const row of prepRequests) {
    const integration = byUser.get(row.user_id) || byCompany.get(row.company_id);
    if (!integration) {
      console.warn(
        `No active Amazon integration for user ${row.user_id} / company ${row.company_id}, skipping ${row.fba_shipment_id}`
      );
      await updatePrepRequest(row.id, {
        amazon_sync_error: 'No active Amazon integration',
        amazon_last_synced_at: nowIso
      }).catch((err) => console.error('Failed to mark missing integration', err.message));
      continue;
    }

    const marketplaceId = resolveMarketplaceId(integration);
    if (!marketplaceId) {
      console.warn(
        `[Prep shipments sync] Skipping shipment ${row.fba_shipment_id} because integration ${integration.id} has no marketplace_id configured.`
      );
      await updatePrepRequest(row.id, {
        amazon_sync_error: 'No marketplace configured',
        amazon_last_synced_at: nowIso
      }).catch((err) => console.error('Failed to mark missing marketplace', err.message));
      continue;
    }

    const key = integration.refresh_token;
    if (!key) {
      console.warn(`Integration without refresh token for user ${row.user_id}, skipping.`);
      continue;
    }

    if (!spClientCache.has(key)) {
      spClientCache.set(
        key,
        createSpClient({
          refreshToken: integration.refresh_token,
          region: integration.region || process.env.SPAPI_REGION || 'eu'
        })
      );
    }

    const client = spClientCache.get(key);
    try {
      const { snapshot: snap, items: amazonItems } = await fetchShipmentSnapshot(
        client,
        row.fba_shipment_id,
        marketplaceId
      );
      await updateItemAmazonQuantities(row.prep_request_items, amazonItems);
      let prepStatusResolved = row.prep_status;
      if (!prepStatusResolved) {
        if (row.status === 'confirmed') prepStatusResolved = 'expediat';
        else if (row.status === 'cancelled') prepStatusResolved = 'anulat';
        else prepStatusResolved = 'pending';
      }
      const resolvedLastUpdated = snap.last_updated || new Date().toISOString();
      await updatePrepRequest(row.id, {
        amazon_status: snap.status || 'UNKNOWN',
        amazon_units_expected: snap.units_expected,
        amazon_units_located: snap.units_located,
        amazon_skus: snap.skus,
        amazon_shipment_name: snap.shipment_name,
        amazon_reference_id: snap.reference_id,
        amazon_destination_code: snap.destination_code,
        amazon_delivery_window: snap.delivery_window,
        amazon_last_updated: resolvedLastUpdated,
        amazon_snapshot: snap,
        amazon_last_synced_at: nowIso,
        amazon_sync_error: null,
        prep_status: prepStatusResolved
      });
      console.log(`Updated shipment ${row.fba_shipment_id} (prep_request ${row.id}) with status ${snap.status || 'n/a'}`);
    } catch (err) {
      console.error(
        `Failed to sync shipment ${row.fba_shipment_id} (user ${row.user_id}, company ${row.company_id}, seller ${integration.selling_partner_id || 'n/a'}, marketplace ${marketplaceId || 'n/a'}):`,
        err.message
      );
      await updatePrepRequest(row.id, {
        amazon_status: row.amazon_status || null,
        amazon_sync_error: err.message || 'Sync error',
        amazon_last_synced_at: nowIso
      }).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('Fatal error in syncPrepShipmentsFromAmazon', err);
  process.exit(1);
});
