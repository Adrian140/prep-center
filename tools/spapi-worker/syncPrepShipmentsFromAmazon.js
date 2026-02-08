import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const STATUS_LIST = [
  'WORKING',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVING',
  'CHECKED_IN',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
  'DELETED'
];

const PAGE_SIZE = Number(process.env.PREP_SHIP_SYNC_PAGE_SIZE || 10000);
const MAX_RUNTIME_MS = Number(process.env.PREP_SHIP_SYNC_MAX_RUNTIME_MS || 4 * 60 * 60 * 1000 + 50 * 60 * 1000);
const INCLUDE_CLOSED = process.env.PREP_SHIP_SYNC_INCLUDE_CLOSED === 'true';

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
const isFbaShipmentId = (value) => typeof value === 'string' && /^FBA[A-Z0-9]+$/i.test(value.trim());
const normalizeShipmentName = (value) =>
  String(value || '')
    .replace(/\(\d+\/\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

async function resolveShipmentsByName(spClient, name, marketplaceId, windowDays = 10) {
  const normalized = normalizeShipmentName(name);
  if (!normalized) return [];
  const now = new Date();
  const after = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const res = await spClient.callAPI({
    operation: 'getShipments',
    endpoint: 'fulfillmentInbound',
    query: {
      ShipmentStatusList: STATUS_LIST,
      LastUpdatedAfter: after,
      ...(marketplaceId ? { MarketplaceId: marketplaceId } : {})
    },
    options: { version: 'v0' }
  });
  const payload = res?.payload || res;
  const list = Array.isArray(payload?.ShipmentData) ? payload.ShipmentData : [];
  return list.filter((sh) => normalizeShipmentName(sh?.ShipmentName) === normalized);
}

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
      const refresh =
        row.refresh_token ||
        token?.refresh_token ||
        process.env.SPAPI_REFRESH_TOKEN ||
        null;
      return refresh
        ? {
            ...row,
            marketplace_ids: marketplaceList.length ? marketplaceList : null,
            refresh_token: refresh
          }
        : null;
    })
    .filter(Boolean);
}

async function fetchPrepRequests() {
  const rows = [];
  let offset = 0;
  while (true) {
    let query = supabase
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
        amazon_shipment_name,
        amazon_reference_id,
        amazon_destination_code,
        inbound_plan_id,
        step2_shipments,
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
      .range(offset, offset + PAGE_SIZE - 1);

    if (!INCLUDE_CLOSED) {
      // Include confirmed requests even if Amazon marked them CLOSED.
      query = query.or('amazon_status.neq.CLOSED,status.eq.confirmed');
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

const normalizeShipmentIds = (raw) => {
  if (!raw) return [];
  const ids = String(raw)
    .split(/[\/,]/)
    .map((s) => s.trim().toUpperCase())
    .flatMap((chunk) => chunk.split(/\s+/))
    .map((s) => s.replace(/%20/g, ''))
    .map((s) => s.replace(/\s+/g, ''))
    .filter((s) => s.length > 0);
  const unique = Array.from(new Set(ids));
  const isLikelyFba = (id) => /^FBA[A-Z0-9]+$/.test(id);
  const fbaIds = unique.filter(isLikelyFba);
  const sanitized = unique.filter((id) => /^[A-Z0-9_-]+$/.test(id));
  if (fbaIds.length) {
    return [...fbaIds, ...sanitized.filter((id) => !fbaIds.includes(id))];
  }
  return sanitized;
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

const normalizeTransportStatus = (status) => {
  if (!status) return null;
  return String(status).trim().toUpperCase();
};

const deriveAmazonStatus = ({ shipmentStatus, unitsExpected, unitsReceived }) => {
  const base = normalizeTransportStatus(shipmentStatus) || 'UNKNOWN';
  const expected = Number(unitsExpected || 0);
  const received = Number(unitsReceived || 0);

  if (base === 'CANCELLED') return 'CANCELLED';
  if (base === 'CLOSED') return 'CLOSED';

  if (expected > 0 && received >= expected) return 'RECEIVED';
  if (expected > 0 && received > 0 && received < expected) return 'RECEIVING_PARTIAL';
  if (base === 'RECEIVING') return 'RECEIVING';
  if (base === 'SHIPPED') return 'IN_TRANSIT';
  if (base === 'WORKING') return 'WORKING';

  return base || 'UNKNOWN';
};

const logUnknownAmazonStatus = (shipmentId, status, rawShipment) => {
  if (!status) return;
  const normalized = String(status).trim().toUpperCase();
  if (STATUS_LIST.includes(normalized)) return;
  console.warn(
    `[Prep shipments sync] Unknown Amazon status "${status}" for shipment ${shipmentId}. Raw keys: ${Object.keys(
      rawShipment || {}
    ).join(',')}`
  );
};

async function fetchShipmentSnapshot(spClient, rawShipmentId, marketplaceId) {
  const candidates = normalizeShipmentIds(rawShipmentId);
  const shipmentId = candidates[0] || rawShipmentId;
  const primaryIdList = candidates.length ? candidates : [shipmentId];

  const tryFetchShipments = async (shipmentIds, mpId, withStatusList = true) => {
    const query = {
      ShipmentIdList: shipmentIds
    };
    if (withStatusList) {
      query.ShipmentStatusList = STATUS_LIST;
    }
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
  let lastShipmentError = null;

  for (const mp of mpCandidates) {
    try {
      shipmentRes = await tryFetchShipments(primaryIdList, mp, true);
      pickedMarketplace = mp;
      if (shipmentRes?.payload?.ShipmentData?.length) break;
    } catch (err) {
      lastShipmentError = err;
      // încercăm fără MarketplaceId dacă e invalid
      try {
        shipmentRes = await tryFetchShipments(primaryIdList, null, true);
        pickedMarketplace = null;
      } catch {
        continue;
      }
    }
    if (shipmentRes?.payload?.ShipmentData?.length) break;
  }

  // fallback: reîncearcă fără filtru de status dacă nu am găsit nimic
  if (!shipmentRes?.payload?.ShipmentData?.length) {
    for (const mp of mpCandidates) {
      try {
        shipmentRes = await tryFetchShipments(primaryIdList, mp, false);
        pickedMarketplace = mp;
        if (shipmentRes?.payload?.ShipmentData?.length) break;
      } catch (err) {
        lastShipmentError = err;
        try {
          shipmentRes = await tryFetchShipments(primaryIdList, null, false);
          pickedMarketplace = null;
        } catch {
          continue;
        }
      }
      if (shipmentRes?.payload?.ShipmentData?.length) break;
    }
  }

  // fallback suplimentar: dacă lista cu mai multe ID-uri e invalidă, încearcă fiecare ID individual
  if (!shipmentRes?.payload?.ShipmentData?.length && primaryIdList.length > 1) {
    for (const candidate of primaryIdList) {
      for (const mp of mpCandidates) {
        try {
          shipmentRes = await tryFetchShipments([candidate], mp, false);
          pickedMarketplace = mp;
          if (shipmentRes?.payload?.ShipmentData?.length) break;
        } catch (err) {
          lastShipmentError = err;
          try {
            shipmentRes = await tryFetchShipments([candidate], null, false);
            pickedMarketplace = null;
          } catch (innerErr) {
            lastShipmentError = innerErr;
            continue;
          }
        }
        if (shipmentRes?.payload?.ShipmentData?.length) break;
      }
      if (shipmentRes?.payload?.ShipmentData?.length) break;
    }
  }

  const shipmentPayload = shipmentRes?.payload || shipmentRes;
  const shipmentList = Array.isArray(shipmentPayload?.ShipmentData) ? shipmentPayload.ShipmentData : [];
  const shipment =
    shipmentList.find((s) => candidates.includes(s.ShipmentId)) ||
    shipmentList.find((s) => s.ShipmentId === shipmentId) ||
    shipmentList[0] ||
    null;

  if (!shipment) {
    console.warn(
      `[Prep shipments sync] Shipment not found in Amazon response for ${shipmentId}; candidates: ${candidates.join(
        ','
      )}. Payload len: ${shipmentList.length}${lastShipmentError ? `; last error: ${lastShipmentError.message || lastShipmentError}` : ''}`
    );
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

  logUnknownAmazonStatus(shipmentId, snapshot.status, shipment);

  return { snapshot, items };
}

const collectTrackingIds = (value, bucket = new Set()) => {
  if (!value) return bucket;
  if (Array.isArray(value)) {
    value.forEach((item) => collectTrackingIds(item, bucket));
    return bucket;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) bucket.add(trimmed);
    return bucket;
  }
  if (typeof value !== 'object') return bucket;

  const directKeys = ['TrackingId', 'trackingId', 'TrackingID', 'tracking_id'];
  directKeys.forEach((key) => {
    if (value[key]) collectTrackingIds(value[key], bucket);
  });

  if (value.TrackingIds || value.trackingIds) {
    collectTrackingIds(value.TrackingIds || value.trackingIds, bucket);
  }

  Object.keys(value).forEach((key) => {
    if (key.toLowerCase().includes('tracking')) {
      collectTrackingIds(value[key], bucket);
    }
  });

  Object.values(value).forEach((val) => {
    if (val && typeof val === 'object') collectTrackingIds(val, bucket);
  });

  return bucket;
};

async function fetchShipmentDetailsV2024(spClient, inboundPlanId, shipmentId) {
  if (!inboundPlanId || !shipmentId) return { shipTo: null, trackingIds: [] };
  try {
    const res = await spClient.callAPI({
      operation: 'getShipment',
      endpoint: 'fulfillmentInbound',
      path: { inboundPlanId, shipmentId },
      options: { version: '2024-03-20' }
    });
    const payload = res?.payload || res;
    const shipTo = payload?.destinationAddress || payload?.shipToAddress || payload?.shipTo || null;
    const trackingSet = collectTrackingIds(payload);
    return {
      shipTo,
      trackingIds: Array.from(trackingSet.values()).filter(Boolean)
    };
  } catch (err) {
    const message = err?.message || String(err);
    console.warn(`[Prep shipments sync] Unable to fetch shipment details for ${shipmentId}:`, message);
    return { shipTo: null, trackingIds: [] };
  }
}

async function updatePrepRequest(id, patch) {
  const { error } = await supabase.from('prep_requests').update(patch).eq('id', id);
  if (error) throw error;
}

async function main() {
  assertEnv();
  const startedAt = Date.now();
  const integrations = await fetchActiveIntegrations();
  if (!INCLUDE_CLOSED) {
    const { count, error } = await supabase
      .from('prep_requests')
      .select('id', { count: 'exact', head: true })
      .not('fba_shipment_id', 'is', null)
      .eq('amazon_status', 'CLOSED');
    if (error) throw error;
    if (count) {
      console.log(`Skipping ${count} CLOSED shipments (already closed).`);
    }
  }
  const byUser = new Map();
  const byCompany = new Map();
  integrations.forEach((row) => {
    if (row.user_id) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id).push(row);
    }
    if (row.company_id) {
      if (!byCompany.has(row.company_id)) byCompany.set(row.company_id, []);
      byCompany.get(row.company_id).push(row);
    }
  });

  const prepRequests = await fetchPrepRequests();
  if (!prepRequests.length) {
    console.log('No prep_requests with FBA Shipment ID to sync.');
    return;
  }

  const spClientCache = new Map();
  const nowIso = new Date().toISOString();

  for (const row of prepRequests) {
    if (Date.now() - startedAt > MAX_RUNTIME_MS) {
      console.warn('Sync time limit reached, stopping early.');
      break;
    }
    const integrationListRaw = [
      ...(byUser.get(row.user_id) || []),
      ...(byCompany.get(row.company_id) || [])
    ];
    const integrationList = Array.from(
      new Map(integrationListRaw.map((integration) => [integration.id, integration])).values()
    );
    if (!integrationList.length) {
      console.warn(
        `No active Amazon integration for user ${row.user_id} / company ${row.company_id}, skipping ${row.fba_shipment_id}`
      );
      await updatePrepRequest(row.id, {
        amazon_sync_error: 'No active Amazon integration',
        amazon_last_synced_at: nowIso
      }).catch((err) => console.error('Failed to mark missing integration', err.message));
      continue;
    }

    let lastError = null;
    let synced = false;
    let missingMarketplace = true;
    let missingToken = true;

    for (const integration of integrationList) {
      const marketplaceId = resolveMarketplaceId(integration);
      if (!marketplaceId) continue;
      missingMarketplace = false;

      const key = integration.refresh_token;
      if (!key) continue;
      missingToken = false;

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
        let shipmentIdForSync = row.fba_shipment_id;
        if (!isFbaShipmentId(shipmentIdForSync)) {
          const baseName =
            row.amazon_shipment_name ||
            row.amazon_reference_id ||
            row.amazon_destination_code ||
            null;
          if (baseName) {
            const matches = await resolveShipmentsByName(client, baseName, marketplaceId);
            if (matches.length) {
              const preferred =
                matches.find((m) => m?.DestinationFulfillmentCenterId === row.amazon_destination_code) ||
                matches[0];
              if (preferred?.ShipmentId) {
                shipmentIdForSync = preferred.ShipmentId;
                await updatePrepRequest(row.id, {
                  fba_shipment_id: preferred.ShipmentId
                });
                // Update step2_shipments with amazonShipmentId if we have destination matches.
                if (Array.isArray(row.step2_shipments)) {
                  const next = row.step2_shipments.map((sh) => {
                    if (sh?.amazonShipmentId) return sh;
                    const dest = sh?.destinationWarehouseId || sh?.destination_code || null;
                    const match =
                      matches.find((m) => dest && m?.DestinationFulfillmentCenterId === dest) ||
                      preferred;
                    return match?.ShipmentId
                      ? { ...sh, amazonShipmentId: match.ShipmentId }
                      : sh;
                  });
                  await updatePrepRequest(row.id, { step2_shipments: next });
                }
              }
            }
          }
        }
        const { snapshot: snap, items: amazonItems } = await fetchShipmentSnapshot(
          client,
          shipmentIdForSync,
          marketplaceId
        );
        const trackableStatuses = new Set(['SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'CLOSED', 'RECEIVING', 'RECEIVED']);
        const normalizedSnapStatus = normalizeTransportStatus(snap.status);
        const inboundPlanId =
          row?.inbound_plan_id ||
          row?.amazon_snapshot?.fba_inbound?.inboundPlanId ||
          row?.amazon_snapshot?.inboundPlanId ||
          null;
        const details = trackableStatuses.has(normalizedSnapStatus)
          ? await fetchShipmentDetailsV2024(client, inboundPlanId, shipmentIdForSync)
          : { shipTo: null, trackingIds: [] };
        const transportTrackingIds = details.trackingIds || [];

        if (!snap.ship_to && details.shipTo) {
          const shipTo = details.shipTo;
          snap.ship_to = {
            name: shipTo?.name || shipTo?.Name || null,
            address1: shipTo?.address1 || shipTo?.AddressLine1 || null,
            address2: shipTo?.address2 || shipTo?.AddressLine2 || null,
            city: shipTo?.city || shipTo?.City || null,
            state: shipTo?.state || shipTo?.StateOrRegion || null,
            postal_code: shipTo?.postalCode || shipTo?.postal_code || shipTo?.PostalCode || null,
            country_code: shipTo?.countryCode || shipTo?.country_code || shipTo?.CountryCode || null,
            phone: shipTo?.phone || shipTo?.Phone || null
          };
        }
        await updateItemAmazonQuantities(row.prep_request_items, amazonItems);
        let prepStatusResolved = row.prep_status;
        if (!prepStatusResolved) {
          if (row.status === 'confirmed') prepStatusResolved = 'expediat';
          else if (row.status === 'cancelled') prepStatusResolved = 'anulat';
          else prepStatusResolved = 'pending';
        }
        const resolvedLastUpdated = snap.last_updated || new Date().toISOString();
        const nextStatus = deriveAmazonStatus({
          shipmentStatus: snap.status,
          unitsExpected: snap.units_expected,
          unitsReceived: snap.units_located
        });

        let step2Updated = false;
        let nextStep2Shipments = row.step2_shipments;
        if (Array.isArray(row.step2_shipments)) {
          nextStep2Shipments = row.step2_shipments.map((sh) => {
            const matchesShipment =
              sh?.amazonShipmentId === snap.shipment_id ||
              sh?.shipmentId === snap.shipment_id ||
              sh?.shipment_id === snap.shipment_id ||
              sh?.id === snap.shipment_id;
            if (!matchesShipment) return sh;
            const hasShipTo =
              sh?.shipToAddress ||
              sh?.ship_to_address ||
              sh?.to ||
              sh?.destination;
            if (hasShipTo) return sh;
            step2Updated = true;
            const shipToAddress = snap.ship_to || null;
            const toText = shipToAddress
              ? [
                  shipToAddress.name,
                  shipToAddress.address1,
                  shipToAddress.address2,
                  [shipToAddress.postal_code, shipToAddress.city].filter(Boolean).join(' ').trim(),
                  shipToAddress.country_code
                ]
                  .filter(Boolean)
                  .join(', ')
              : null;
            return {
              ...sh,
              shipToAddress,
              to: toText || sh?.to || null
            };
          });
        }

        if (transportTrackingIds.length > 0) {
          const { data: existingTracking } = await supabase
            .from('prep_request_tracking')
            .select('tracking_id')
            .eq('request_id', row.id);
          const existingSet = new Set((existingTracking || []).map((t) => t.tracking_id).filter(Boolean));
          const toInsert = transportTrackingIds
            .map((id) => String(id).trim())
            .filter((id) => id && !existingSet.has(id))
            .map((tracking_id) => ({ request_id: row.id, tracking_id }));
          if (toInsert.length) {
            const { error: trackingError } = await supabase
              .from('prep_request_tracking')
              .insert(toInsert);
            if (trackingError) {
              console.warn(`Failed to insert tracking ids for prep_request ${row.id}:`, trackingError.message);
            }
          }
        }

        const shouldSkipClosedUpdate =
          row.amazon_status === 'CLOSED' && nextStatus === 'CLOSED';
        if (!shouldSkipClosedUpdate) {
          const existingSnapshot = row.amazon_snapshot || {};
          const mergedSnapshot = {
            ...existingSnapshot,
            ...snap,
            fba_inbound: existingSnapshot?.fba_inbound || snap?.fba_inbound || null,
            inboundPlanId: existingSnapshot?.inboundPlanId || snap?.inboundPlanId || null
          };
          await updatePrepRequest(row.id, {
            amazon_status: nextStatus,
            amazon_units_expected: snap.units_expected,
            amazon_units_located: snap.units_located,
            amazon_skus: snap.skus,
            amazon_shipment_name: snap.shipment_name,
            amazon_reference_id: snap.reference_id,
            amazon_destination_code: snap.destination_code,
            amazon_delivery_window: snap.delivery_window,
            amazon_last_updated: resolvedLastUpdated,
            amazon_snapshot: mergedSnapshot,
            amazon_last_synced_at: nowIso,
            amazon_sync_error: null,
            prep_status: prepStatusResolved,
            ...(step2Updated ? { step2_shipments: nextStep2Shipments } : {})
          });
        } else {
          console.log(
            `Skipped re-writing CLOSED shipment ${row.fba_shipment_id} (prep_request ${row.id}); refreshed sync timestamp only.`
          );
          await updatePrepRequest(row.id, {
            amazon_last_synced_at: nowIso,
            amazon_sync_error: null,
            ...(step2Updated ? { step2_shipments: nextStep2Shipments } : {})
          });
        }
        console.log(
          `Updated shipment ${row.fba_shipment_id} (prep_request ${row.id}) with status ${snap.status || 'n/a'}`
        );
        synced = true;
        break;
      } catch (err) {
        lastError = err;
        if (String(err?.message || '').includes('Shipment not found')) {
          continue;
        }
        console.error(
          `Failed to sync shipment ${row.fba_shipment_id} (user ${row.user_id}, company ${row.company_id}, seller ${integration.selling_partner_id || 'n/a'}, marketplace ${marketplaceId || 'n/a'}):`,
          err.message
        );
        break;
      }
    }

    if (synced) continue;

    if (missingMarketplace) {
      console.warn(
        `[Prep shipments sync] Skipping shipment ${row.fba_shipment_id} because no marketplace_id configured for user ${row.user_id} / company ${row.company_id}.`
      );
      await updatePrepRequest(row.id, {
        amazon_sync_error: 'No marketplace configured',
        amazon_last_synced_at: nowIso
      }).catch((err) => console.error('Failed to mark missing marketplace', err.message));
      continue;
    }

    if (missingToken) {
      console.warn(`Integration without refresh token for user ${row.user_id} / company ${row.company_id}, skipping.`);
      await updatePrepRequest(row.id, {
        amazon_sync_error: 'No refresh token',
        amazon_last_synced_at: nowIso
      }).catch((err) => console.error('Failed to mark missing token', err.message));
      continue;
    }

    const errMessage = lastError?.message || 'Sync error';
    console.error(
      `Failed to sync shipment ${row.fba_shipment_id} (user ${row.user_id}, company ${row.company_id}):`,
      errMessage
    );
    await updatePrepRequest(row.id, {
      amazon_status: row.amazon_status || null,
      amazon_sync_error: errMessage,
      amazon_last_synced_at: nowIso
    }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('Fatal error in syncPrepShipmentsFromAmazon', err);
  process.exit(1);
});
