import 'dotenv/config';
import { supabase } from './supabaseClient.js';

const PAGE_SIZE = Number(process.env.PREP_BACKFILL_PAGE_SIZE || 500);
const MAX_PAGES = Number(process.env.PREP_BACKFILL_MAX_PAGES || 200);

const buildPackingGroupSummary = (snapshot) => {
  const source =
    snapshot?.fba_inbound?.packingGroups ||
    snapshot?.packingGroups ||
    snapshot?.packing_groups ||
    [];
  const map = new Map();
  const list = [];
  if (!Array.isArray(source)) return { map, list };
  source.forEach((g, idx) => {
    const pgId = g?.packingGroupId || g?.id || `pg-${idx + 1}`;
    const items = (Array.isArray(g?.items) ? g.items : [])
      .map((it) => {
        const sku = it?.sku || it?.msku || it?.SellerSKU || it?.sellerSku || null;
        const asin = it?.asin || it?.ASIN || null;
        const quantity = Number(it?.quantity || it?.Quantity || 0) || 0;
        return { sku, asin, quantity };
      })
      .filter((it) => (it.sku || it.asin) && it.quantity > 0);
    const units = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    const meta = { packingGroupId: String(pgId), items, skuCount: items.length, units };
    map.set(String(pgId), meta);
    list.push(meta);
  });
  return { map, list };
};

const needsUpdate = (shipment) => {
  if (!shipment) return false;
  const hasItems = Array.isArray(shipment.items) && shipment.items.length > 0;
  const hasSkuCount = Number.isFinite(Number(shipment.skuCount));
  const hasUnits = Number.isFinite(Number(shipment.units));
  return !(hasItems && hasSkuCount && hasUnits);
};

const normalizeShipmentId = (sh) => sh?.shipmentId || sh?.shipment_id || sh?.id || null;

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  }

  let offset = 0;
  let page = 0;
  let scanned = 0;
  let updated = 0;

  while (page < MAX_PAGES) {
    const { data, error } = await supabase
      .from('prep_requests')
      .select('id, step2_shipments, amazon_snapshot')
      .not('step2_shipments', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      scanned += 1;
      const shipments = Array.isArray(row.step2_shipments) ? row.step2_shipments : [];
      if (!shipments.length) continue;
      const pgSummary = buildPackingGroupSummary(row.amazon_snapshot || {});
      if (!pgSummary.map.size) continue;
      const canAssignByIndex =
        shipments.length === pgSummary.list.length &&
        shipments.every((sh) => !(sh?.packingGroupId || sh?.packing_group_id));

      let changed = false;
      const next = shipments.map((sh, idx) => {
        const pgId = sh?.packingGroupId || sh?.packing_group_id || null;
        const assigned = !pgId && canAssignByIndex ? pgSummary.list[idx]?.packingGroupId || null : pgId;
        if (!assigned) return sh;
        if (!needsUpdate(sh)) return { ...sh, packingGroupId: assigned };
        const meta = pgSummary.map.get(String(assigned));
        if (!meta) return sh;
        changed = true;
        return {
          ...sh,
          packingGroupId: assigned,
          items: meta.items || sh.items || null,
          skuCount: meta.skuCount ?? sh.skuCount ?? null,
          units: meta.units ?? sh.units ?? null
        };
      });

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
