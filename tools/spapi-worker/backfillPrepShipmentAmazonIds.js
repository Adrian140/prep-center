import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const PAGE_SIZE = Number(process.env.PREP_BACKFILL_PAGE_SIZE || 200);
const MAX_PAGES = Number(process.env.PREP_BACKFILL_MAX_PAGES || 200);

const isFbaId = (val) => typeof val === 'string' && /^FBA[A-Z0-9]+$/i.test(val.trim());

async function fetchSellerTokens(sellerIds) {
  if (!sellerIds.length) return new Map();
  const { data, error } = await supabase
    .from('seller_tokens')
    .select('seller_id, refresh_token, marketplace_ids')
    .in('seller_id', sellerIds);
  if (error) throw error;
  const map = new Map();
  (data || []).forEach((row) => {
    if (row.seller_id && row.refresh_token) {
      map.set(row.seller_id, row);
    }
  });
  return map;
}

async function fetchActiveIntegrations() {
  const { data, error } = await supabase
    .from('amazon_integrations')
    .select('id, user_id, company_id, marketplace_id, region, refresh_token, status, selling_partner_id')
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

const resolveMarketplaceId = (integration) => {
  if (integration?.marketplace_id) return integration.marketplace_id;
  if (Array.isArray(integration?.marketplace_ids) && integration.marketplace_ids.length) {
    return integration.marketplace_ids[0];
  }
  return null;
};

async function fetchShipmentById(spClient, shipmentId, marketplaceId) {
  const res = await spClient.callAPI({
    operation: 'getShipments',
    endpoint: 'fulfillmentInbound',
    query: {
      ShipmentIdList: [shipmentId],
      ShipmentStatusList: [
        'WORKING',
        'SHIPPED',
        'IN_TRANSIT',
        'RECEIVING',
        'CHECKED_IN',
        'DELIVERED',
        'CLOSED',
        'CANCELLED',
        'DELETED'
      ],
      ...(marketplaceId ? { MarketplaceId: marketplaceId } : {})
    },
    options: { version: 'v0' }
  });
  const payload = res?.payload || res;
  const list = Array.isArray(payload?.ShipmentData) ? payload.ShipmentData : [];
  return list[0] || null;
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  }
  if (!process.env.SPAPI_LWA_CLIENT_ID || !process.env.SPAPI_LWA_CLIENT_SECRET || !process.env.SPAPI_ROLE_ARN) {
    throw new Error('Missing SPAPI credentials');
  }

  const integrations = await fetchActiveIntegrations();
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

  let offset = 0;
  let page = 0;
  let scanned = 0;
  let updated = 0;

  while (page < MAX_PAGES) {
    const { data, error } = await supabase
      .from('prep_requests')
      .select('id, user_id, company_id, step2_shipments')
      .not('step2_shipments', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      scanned += 1;
      const shipments = Array.isArray(row.step2_shipments) ? row.step2_shipments : [];
      const needsAny = shipments.some((sh) => !sh?.amazonShipmentId);
      if (!needsAny) continue;

      const integrationListRaw = [
        ...(byUser.get(row.user_id) || []),
        ...(byCompany.get(row.company_id) || [])
      ];
      const integrationList = Array.from(
        new Map(integrationListRaw.map((integration) => [integration.id, integration])).values()
      );
      if (!integrationList.length) continue;

      let client = null;
      let marketplaceId = null;
      for (const integration of integrationList) {
        const mp = resolveMarketplaceId(integration);
        if (!mp || !integration.refresh_token) continue;
        marketplaceId = mp;
        client = createSpClient({
          refreshToken: integration.refresh_token,
          region: integration.region || process.env.SPAPI_REGION || 'eu'
        });
        break;
      }
      if (!client || !marketplaceId) continue;

      let changed = false;
      const next = [];
      for (const sh of shipments) {
        if (sh?.amazonShipmentId) {
          next.push(sh);
          continue;
        }
        const candidate = sh?.shipmentId || sh?.shipment_id || sh?.id || null;
        if (!candidate) {
          next.push(sh);
          continue;
        }
        try {
          const res = await fetchShipmentById(client, candidate, marketplaceId);
          const fba =
            (isFbaId(res?.ShipmentId) && res.ShipmentId) ||
            (isFbaId(res?.ShipmentReferenceId) && res.ShipmentReferenceId) ||
            null;
          if (fba) {
            changed = true;
            next.push({ ...sh, amazonShipmentId: fba, legacyShipmentId: res?.ShipmentReferenceId || null });
          } else {
            next.push(sh);
          }
        } catch (err) {
          next.push(sh);
        }
      }

      if (!changed) continue;
      const { error: updErr } = await supabase
        .from('prep_requests')
        .update({ step2_shipments: next })
        .eq('id', row.id);
      if (updErr) {
        console.error('Update failed for', row.id, updErr.message || updErr);
        continue;
      }
      updated += 1;
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    page += 1;
  }

  console.log(`Backfill done. Scanned=${scanned}, Updated=${updated}`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
