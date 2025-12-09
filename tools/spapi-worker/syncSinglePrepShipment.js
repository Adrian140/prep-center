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

  const shipment =
    shipmentRes?.payload?.ShipmentData?.find((s) => candidates.includes(s.ShipmentId)) ||
    shipmentRes?.payload?.ShipmentData?.find((s) => s.ShipmentId === shipmentId) ||
    shipmentRes?.payload?.ShipmentData?.[0] ||
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

  const items = Array.isArray(itemsRes?.payload?.ItemData) ? itemsRes.payload.ItemData : [];
  const skuSet = new Set();
  const unitsExpected = items.reduce((acc, item) => acc + Number(item?.QuantityShipped || 0), 0);
  const unitsReceived = items.reduce((acc, item) => acc + Number(item?.QuantityReceived || 0), 0);
  items.forEach((it) => {
    if (it?.SellerSKU) skuSet.add(it.SellerSKU);
    if (it?.FNSKU) skuSet.add(it.FNSKU);
  });

  return {
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
    .select('id, user_id, company_id, status, prep_status, fba_shipment_id')
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

  const client = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION || 'eu'
  });

  const snap = await fetchShipmentSnapshot(
    client,
    prep.fba_shipment_id,
    integration.marketplace_id || process.env.SPAPI_MARKETPLACE_ID
  );

  const prepStatus =
    prep.prep_status ||
    (prep.status === 'confirmed' ? 'expediat' : prep.status === 'cancelled' ? 'anulat' : 'pending');

  const update = {
    amazon_status: snap.status || 'UNKNOWN',
    amazon_units_expected: snap.units_expected,
    amazon_units_located: snap.units_located,
    amazon_skus: snap.skus,
    amazon_shipment_name: snap.shipment_name,
    amazon_reference_id: snap.reference_id,
    amazon_destination_code: snap.destination_code,
    amazon_delivery_window: snap.delivery_window,
    amazon_last_updated: snap.last_updated,
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
