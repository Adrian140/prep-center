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

const EU_MARKETPLACES = [
  'A13V1IB3VIYZZH', // FR
  'A1PA6795UKMFR9', // DE
  'A1RKKUPIHCS9HS', // ES
  'APJ6JRA9NG5V4',  // IT
  'A1F83G8C2ARO7P'  // UK
];

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

async function findIntegration(userId, companyId) {
  const { data, error } = await supabase
    .from('amazon_integrations')
    .select(
      'id, user_id, company_id, marketplace_id, region, refresh_token, status, selling_partner_id'
    )
    .eq('status', 'active')
    .or(`user_id.eq.${userId},company_id.eq.${companyId}`)
    .limit(10);
  if (error) throw error;
  const integrations = Array.isArray(data) ? data : [];
  if (!integrations.length) return null;
  const sellerTokens = await fetchSellerTokens(
    integrations
      .map((row) => row.selling_partner_id)
      .filter((id) => typeof id === 'string' && id.length)
  );
  return integrations
    .map((row) => ({
      ...row,
      refresh_token:
        row.refresh_token ||
        sellerTokens.get(row.selling_partner_id) ||
        process.env.SPAPI_REFRESH_TOKEN ||
        null
    }))
    .find((row) => row.refresh_token);
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
  const updates = [];
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
    updates.push({
      id: matched.id,
      amazon_units_expected: expected,
      amazon_units_received: received
    });
  });
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

async function fetchShipmentSnapshot(spClient, rawShipmentId, marketplaceId) {
  const candidates = normalizeShipmentIds(rawShipmentId);
  const shipmentId = candidates[0] || rawShipmentId;

  const tryFetch = async (mpId) => {
    const query = {
      ShipmentStatusList: STATUS_LIST,
      ShipmentIdList: candidates.length ? candidates : [shipmentId]
    };
    if (mpId) query.MarketplaceId = mpId;
    return spClient.callAPI({
      operation: 'getShipments',
      endpoint: 'fulfillmentInbound',
      query,
      options: { version: 'v0' }
    });
  };

  const mpCandidates = [
    marketplaceId || process.env.SPAPI_MARKETPLACE_ID || null,
    ...EU_MARKETPLACES
  ].filter(Boolean);

  let shipmentRes = null;
  for (const mp of mpCandidates) {
    try {
      shipmentRes = await tryFetch(mp);
    } catch (err) {
      shipmentRes = await tryFetch(null);
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

  if (!shipment) throw new Error(`Shipment not found for ${shipmentId}`);

  let itemsRes;
  try {
    itemsRes = await spClient.callAPI({
      operation: 'getShipmentItemsByShipmentId',
      endpoint: 'fulfillmentInbound',
      path: { shipmentId },
      query: { MarketplaceId: marketplaceId },
      options: { version: 'v0' }
    });
  } catch (err) {
    itemsRes = await spClient.callAPI({
      operation: 'getShipmentItemsByShipmentId',
      endpoint: 'fulfillmentInbound',
      path: { shipmentId },
      query: {},
      options: { version: 'v0' }
    });
  }

  const itemsPayload = itemsRes?.payload || itemsRes;
  const items = Array.isArray(itemsPayload?.ItemData) ? itemsPayload.ItemData : [];
  const skuSet = new Set();
  const unitsExpected = items.reduce((acc, item) => acc + Number(item?.QuantityShipped || 0), 0);
  const unitsReceived = items.reduce((acc, item) => acc + Number(item?.QuantityReceived || 0), 0);
  const shipFrom = shipment?.ShipFromAddress || {};
  const shipTo = shipment?.ShipToAddress || null;
  items.forEach((it) => {
    if (it?.SellerSKU) skuSet.add(it.SellerSKU);
    if (it?.FNSKU) skuSet.add(it.FNSKU);
  });

  return {
    snapshot: {
    shipment_id: shipmentId,
    shipment_name: shipment?.ShipmentName || null,
    reference_id: shipment?.ShipmentReferenceId || null,
    destination_code: shipment?.DestinationFulfillmentCenterId || null,
    delivery_window: shipment?.EstimatedArrivalDate || null,
    status: shipment?.ShipmentStatus || null,
    skus: skuSet.size || null,
    units_expected: Number.isFinite(unitsExpected) ? unitsExpected : null,
    units_located: Number.isFinite(unitsReceived) ? unitsReceived : null,
    last_updated: shipment?.LastUpdatedDate || shipment?.LastUpdatedTimestamp || null
      ,
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
    },
    items
  };
}

async function main() {
  const fbaId = process.argv[2];
  if (!fbaId) {
    console.error('Usage: node syncSinglePrepShipment.js <FBA_SHIPMENT_ID>');
    process.exit(1);
  }

  const { data: prepRows, error } = await supabase
    .from('prep_requests')
    .select(`
      id,
      user_id,
      company_id,
      status,
      prep_status,
      fba_shipment_id,
      prep_request_items (
        id,
        asin,
        sku,
        units_requested,
        amazon_units_expected,
        amazon_units_received
      )
    `)
    .ilike('fba_shipment_id', fbaId)
    .limit(1);
  if (error) throw error;
  const prep = prepRows?.[0];
  if (!prep) {
    console.error('No prep_request found for FBA ID', fbaId);
    process.exit(1);
  }

  const integration = await findIntegration(prep.user_id, prep.company_id);
  if (!integration) {
    console.error('No active Amazon integration found for this prep request.');
    process.exit(1);
  }

  const refreshTokenOverride = process.env.SPAPI_REFRESH_TOKEN || null;
  const client = createSpClient({
    refreshToken: refreshTokenOverride || integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION || 'eu'
  });

  const { snapshot: snap, items: amazonItems } = await fetchShipmentSnapshot(
    client,
    prep.fba_shipment_id,
    integration.marketplace_id || process.env.SPAPI_MARKETPLACE_ID
  );
  await updateItemAmazonQuantities(prep.prep_request_items, amazonItems);

  const prepStatus =
    prep.prep_status ||
    (prep.status === 'confirmed' ? 'expediat' : prep.status === 'cancelled' ? 'anulat' : 'pending');

  const resolvedLastUpdated = snap.last_updated || new Date().toISOString();
  const update = {
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
    amazon_last_synced_at: new Date().toISOString(),
    amazon_sync_error: null,
    prep_status: prepStatus
  };

  const { error: updateError } = await supabase
    .from('prep_requests')
    .update(update)
    .eq('id', prep.id);
  if (updateError) throw updateError;

  console.log(`Updated prep_request ${prep.id} with Amazon data for ${prep.fba_shipment_id}`);
}

main().catch((err) => {
  console.error('Fatal error in syncSinglePrepShipment', err);
  process.exit(1);
});
