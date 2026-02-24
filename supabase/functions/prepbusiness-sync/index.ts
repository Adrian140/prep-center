import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PREP_BASE_URL = Deno.env.get("PREPBUSINESS_API_BASE_URL") || "";
const PREP_TOKEN = Deno.env.get("PREPBUSINESS_API_TOKEN") || "";
const PREP_INBOUNDS_PATH = Deno.env.get("PREPBUSINESS_INBOUNDS_PATH") || "/shipments/inbound";
const SYNC_MODE = (Deno.env.get("PREPBUSINESS_SYNC_MODE") || "manual").toLowerCase();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DIRECT_ACTION = "direct_to_amazon";
const HOLD_ACTION = "hold_for_prep";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : value ?? null;
}

function normalizeEmail(value: unknown) {
  const text = normalizeText(value);
  return typeof text === "string" ? text.toLowerCase() : text ?? null;
}

function encodeRemainingAction(sendToFba: boolean) {
  return sendToFba ? DIRECT_ACTION : HOLD_ACTION;
}

function isMissingColumnError(error: any, column: string) {
  if (!error) return false;
  const needle = column.toLowerCase();
  const message = String(error.message || "").toLowerCase();
  const details = String(error.details || "").toLowerCase();
  const hint = String(error.hint || "").toLowerCase();
  return message.includes(needle) || details.includes(needle) || hint.includes(needle);
}

async function resolveMerchantContext(payload: Record<string, unknown>) {
  const merchantId =
    normalizeText(payload.merchant_id) ||
    normalizeText(payload.merchantId) ||
    normalizeText((payload.merchant as Record<string, unknown> | null)?.id) ||
    null;
  const email =
    normalizeEmail(payload.email) ||
    normalizeEmail(payload.arbitrage_email) ||
    normalizeEmail(payload.arbitrageOneEmail) ||
    normalizeEmail(payload.prep_email) ||
    normalizeEmail(payload.prepBusinessEmail) ||
    null;

  if (merchantId) {
    const { data } = await supabase
      .from("prep_merchants")
      .select("*")
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (data) {
      return { merchantId, companyId: data.company_id, userId: data.user_id, mapping: data };
    }

    const { data: integrationByMerchant } = await supabase
      .from("prep_business_integrations")
      .select("*")
      .ilike("merchant_id", String(merchantId))
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (integrationByMerchant) {
      return {
        merchantId: integrationByMerchant.merchant_id || merchantId,
        companyId: integrationByMerchant.company_id,
        userId: integrationByMerchant.user_id,
        integration: integrationByMerchant
      };
    }
  }

  if (email) {
    const { data } = await supabase
      .from("prep_business_integrations")
      .select("*")
      .or(`email_arbitrage_one.ilike.${email},email_prep_business.ilike.${email}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        merchantId: data.merchant_id || merchantId,
        companyId: data.company_id,
        userId: data.user_id,
        integration: data
      };
    }
  }

  return { merchantId, companyId: null, userId: null };
}

async function ensureStockItem(companyId: string, userId: string | null, item: Record<string, unknown>) {
  const asin = normalizeText(item.asin);
  const sku = normalizeText(item.sku);
  const ean = normalizeText(item.ean);
  const orFilters: string[] = [];
  if (asin) orFilters.push(`asin.eq.${asin}`);
  if (sku) orFilters.push(`sku.eq.${sku}`);
  if (ean) orFilters.push(`ean.eq.${ean}`);

  if (orFilters.length) {
    const { data: existing } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", companyId)
      .or(orFilters.join(","))
      .maybeSingle();
    if (existing) return existing;
  }

  const payload = {
    company_id: companyId,
    user_id: userId || null,
    asin,
    sku,
    ean,
    name: normalizeText(item.product_name) || normalizeText(item.title) || sku || asin || "Unknown product",
    qty: 0,
    created_at: new Date().toISOString()
  };

  const { data: created, error } = await supabase
    .from("stock_items")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return created;
}

async function insertReceivingShipment(payload: Record<string, unknown>) {
  let attempt = { ...payload };
  const removable = [
    "warehouse_country",
    "tracking_ids",
    "fba_shipment_ids",
    "import_source",
    "import_source_ref",
    "import_tags",
    "fba_mode",
    "client_store_name",
    "boxes_count"
  ];
  for (let i = 0; i <= removable.length; i += 1) {
    const { data, error } = await supabase
      .from("receiving_shipments")
      .insert([attempt])
      .select()
      .single();
    if (!error) return data;
    const missing = removable.find((col) => isMissingColumnError(error, col));
    if (!missing) throw error;
    const { [missing]: _removed, ...rest } = attempt as Record<string, unknown>;
    attempt = rest;
  }
  throw new Error("Could not insert receiving shipment.");
}

async function insertReceivingItems(items: Array<Record<string, unknown>>) {
  if (!items.length) return;
  let attempt = items;
  const removable = ["send_to_fba", "fba_qty", "stock_item_id", "remaining_action"];
  for (let i = 0; i <= removable.length; i += 1) {
    const { error } = await supabase.from("receiving_items").insert(attempt);
    if (!error) return;
    const missing = removable.find((col) => isMissingColumnError(error, col));
    if (!missing) throw error;
    attempt = attempt.map((row) => {
      const next = { ...row };
      delete (next as Record<string, unknown>)[missing];
      return next;
    });
  }
  throw new Error("Could not insert receiving items.");
}

async function importInbound(payload: Record<string, unknown>) {
  const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.lines) ? payload.lines : [];
  if (!items.length) {
    return { error: "Missing items to import." };
  }

  const sourceId =
    normalizeText(payload.inbound_id) ||
    normalizeText(payload.inboundId) ||
    normalizeText(payload.source_id) ||
    normalizeText(payload.sourceId) ||
    normalizeText(payload.id) ||
    null;
  if (sourceId) {
    const { data: existing } = await supabase
      .from("prep_business_imports")
      .select("id")
      .eq("source_id", sourceId)
      .maybeSingle();
    if (existing) {
      return { ok: true, idempotent: true, source_id: sourceId };
    }
  }

  const { merchantId, companyId, userId, mapping, integration } = await resolveMerchantContext(payload);
  if (!companyId) {
    if (integration?.id) {
      await supabase
        .from("prep_business_integrations")
        .update({ status: "error", last_error: "Missing merchant/company mapping." })
        .eq("id", integration.id);
    }
    return { error: "Missing merchant mapping. Configure prep_merchants for this merchant." };
  }

  const resolvedItems = [];
  for (const item of items) {
    const stock = await ensureStockItem(companyId, userId, item as Record<string, unknown>);
    resolvedItems.push({
      ...item,
      stock_item_id: stock?.id || null,
      product_name: normalizeText((item as Record<string, unknown>).product_name) || normalizeText((item as Record<string, unknown>).title) || stock?.name || (item as Record<string, unknown>).sku || (item as Record<string, unknown>).asin,
      asin: normalizeText((item as Record<string, unknown>).asin),
      sku: normalizeText((item as Record<string, unknown>).sku)
    });
  }

  const destinationCountry =
    normalizeText(payload.destination_country) ||
    normalizeText(payload.destinationCountry) ||
    mapping?.destination_country ||
    "FR";
  const warehouseCountry =
    normalizeText(payload.warehouse_country) ||
    normalizeText(payload.warehouseCountry) ||
    mapping?.warehouse_country ||
    destinationCountry ||
    "FR";
  const trackingIds = Array.isArray(payload.tracking_ids) ? payload.tracking_ids : null;
  const fbaShipmentIds = Array.isArray(payload.fba_shipment_ids) ? payload.fba_shipment_ids : null;

  const header = await insertReceivingShipment({
    user_id: userId,
    company_id: companyId,
    status: normalizeText(payload.status) || "submitted",
    created_at: new Date().toISOString(),
    destination_country: String(destinationCountry).toUpperCase(),
    warehouse_country: String(warehouseCountry).toUpperCase(),
    carrier: normalizeText(payload.carrier) || null,
    carrier_other: normalizeText(payload.carrier_other) || null,
    tracking_id: normalizeText(payload.tracking_id) || (trackingIds?.[0] ?? null),
    tracking_ids: trackingIds,
    fba_shipment_ids: fbaShipmentIds,
    client_store_name:
      normalizeText(payload.client_store_name) ||
      normalizeText(payload.store_name) ||
      normalizeText(payload.name) ||
      normalizeText(payload.reference_id) ||
      null,
    boxes_count:
      Number(
        normalizeText(payload.boxes_count) ||
          normalizeText(payload.box_count) ||
          normalizeText(payload.cartons) ||
          normalizeText(payload.cartons_count) ||
          0
      ) || null,
    notes: normalizeText(payload.notes) || null,
    import_source: "prepbusiness",
    import_source_ref: sourceId,
    import_tags: mapping?.import_tags || null
  });

  const itemsPayload = resolvedItems.map((item: Record<string, unknown>, idx: number) => {
    const qtyRaw =
      Number(item.quantity ?? item.qty ?? item.units_requested ?? item.units ?? 0) || 0;
    const unitsRequested = Math.max(1, qtyRaw);
    const fbaQtyRaw = Number(item.fba_qty ?? unitsRequested) || 0;
    const sendToFba = Boolean(item.send_to_fba) && fbaQtyRaw > 0;
    const priceRaw = item.purchase_price;
    const purchasePrice = priceRaw === null || priceRaw === undefined || priceRaw === ""
      ? null
      : Number(String(priceRaw).replace(",", "."));
    return {
      shipment_id: header.id,
      line_number: idx + 1,
      ean_asin: normalizeText(item.ean) || normalizeText(item.asin) || normalizeText(item.sku) || "UNKNOWN",
      product_name: normalizeText(item.product_name) || normalizeText(item.title) || normalizeText(item.sku) || normalizeText(item.asin) || "Unknown product",
      sku: normalizeText(item.sku),
      purchase_price: Number.isFinite(purchasePrice) ? Number(purchasePrice.toFixed(2)) : null,
      quantity_received: unitsRequested,
      remaining_action: encodeRemainingAction(sendToFba),
      stock_item_id: item.stock_item_id || null,
      send_to_fba: sendToFba,
      fba_qty: sendToFba ? Math.max(0, fbaQtyRaw) : null
    };
  });

  await insertReceivingItems(itemsPayload);

  if (sourceId) {
    await supabase.from("prep_business_imports").insert({
      source_id: sourceId,
      merchant_id: merchantId,
      user_id: userId,
      company_id: companyId,
      receiving_shipment_id: header?.id || null,
      status: "imported",
      payload
    });
  }

  if (integration?.id) {
    await supabase
      .from("prep_business_integrations")
      .update({ status: "active", last_error: null, merchant_id: merchantId || integration.merchant_id, last_synced_at: new Date().toISOString() })
      .eq("id", integration.id);
  }

  return { ok: true, shipment_id: header?.id || null, source_id: sourceId };
}

function extractIdentifier(identifiers: Array<Record<string, unknown>> | undefined, type: string) {
  if (!identifiers || !Array.isArray(identifiers)) return null;
  const hit = identifiers.find((row) => String(row?.identifier_type || "").toUpperCase() === type);
  return normalizeText(hit?.identifier || null);
}

function mapInboundItems(items: Array<Record<string, unknown>>) {
  return items.map((row) => {
    const item = (row?.item as Record<string, unknown>) || {};
    const identifiers = Array.isArray(item?.identifiers) ? item.identifiers : [];
    const asin = normalizeText(row?.asin) || extractIdentifier(identifiers, "ASIN") || null;
    const ean = normalizeText(row?.ean) || extractIdentifier(identifiers, "EAN") || null;
    const sku = normalizeText(row?.sku) || normalizeText(item?.merchant_sku) || null;
    const title = normalizeText(row?.title) || normalizeText(item?.title) || null;
    const expected = (row?.expected as Record<string, unknown>) || {};
    const qty = Number(row?.quantity ?? expected?.quantity ?? row?.qty ?? 0) || 0;
    return {
      asin,
      ean,
      sku,
      title,
      quantity: qty
    };
  });
}

async function fetchInboundItems(merchantId: string, shipmentId: string | number) {
  const base = PREP_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/shipments/inbound/${shipmentId}/items`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PREP_TOKEN}`,
      "X-Api-Key": PREP_TOKEN,
      "X-Selected-Client-Id": String(merchantId),
      Accept: "application/json"
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PrepBusiness API error ${resp.status}: ${text || resp.statusText}`);
  }
  const data = await resp.json();
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function fetchInboundDetails(merchantId: string, shipmentId: string | number) {
  const base = PREP_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/shipments/inbound/${shipmentId}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PREP_TOKEN}`,
      "X-Api-Key": PREP_TOKEN,
      "X-Selected-Client-Id": String(merchantId),
      Accept: "application/json"
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PrepBusiness API error ${resp.status}: ${text || resp.statusText}`);
  }
  const data = await resp.json();
  return data?.shipment || data;
}

async function fetchInbounds(merchantId: string, since: string | null) {
  const base = PREP_BASE_URL.replace(/\/+$/, "");
  const path = PREP_INBOUNDS_PATH.startsWith("/") ? PREP_INBOUNDS_PATH : `/${PREP_INBOUNDS_PATH}`;
  const params = new URLSearchParams();
  params.set("merchant_id", merchantId);
  if (since) params.set("updated_since", since);
  const url = `${base}${path}?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PREP_TOKEN}`,
      "X-Api-Key": PREP_TOKEN,
      "X-Selected-Client-Id": String(merchantId),
      Accept: "application/json"
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PrepBusiness API error ${resp.status}: ${text || resp.statusText}`);
  }
  const data = await resp.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.inbounds)) return data.inbounds;
  return [];
}

async function handleSync(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch (_e) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
  }

  if (req.method === "POST" && normalizeText(body.action) === "receive") {
    if (!PREP_BASE_URL || !PREP_TOKEN) {
      return jsonResponse({ error: "Missing PREPBUSINESS_API_BASE_URL or PREPBUSINESS_API_TOKEN." }, 400);
    }

    const receivingShipmentId = normalizeText(body.receiving_shipment_id) || normalizeText(body.receivingShipmentId);
    let sourceId = normalizeText(body.source_id) || normalizeText(body.sourceId);
    let merchantId = normalizeText(body.merchant_id) || normalizeText(body.merchantId);

    if (!sourceId || !merchantId) {
      if (!receivingShipmentId) {
        return jsonResponse({ error: "Missing receiving_shipment_id or source_id." }, 400);
      }
      const { data, error } = await supabase
        .from("prep_business_imports")
        .select("source_id, merchant_id, status")
        .eq("receiving_shipment_id", receivingShipmentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return jsonResponse({ error: "No PrepBusiness import found for receiving_shipment_id." }, 404);
      }
      sourceId = sourceId || normalizeText(data.source_id);
      merchantId = merchantId || normalizeText(data.merchant_id);
    }

    if (!sourceId || !merchantId) {
      return jsonResponse({ error: "Missing source_id or merchant_id for PrepBusiness receive." }, 400);
    }

    const base = PREP_BASE_URL.replace(/\/+$/, "");
    const url = `${base}/shipments/inbound/${sourceId}/receive`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PREP_TOKEN}`,
        "X-Api-Key": PREP_TOKEN,
        "X-Selected-Client-Id": String(merchantId),
        Accept: "application/json"
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return jsonResponse({ error: `PrepBusiness API error ${resp.status}: ${text || resp.statusText}` }, 502);
    }

    if (receivingShipmentId) {
      await supabase
        .from("prep_business_imports")
        .update({ status: "received" })
        .eq("receiving_shipment_id", receivingShipmentId);
    }

    return jsonResponse({ ok: true, source_id: sourceId, merchant_id: merchantId });
  }

  const inbounds = Array.isArray(body.inbounds) ? body.inbounds : [];
  if (inbounds.length) {
    const results = [];
    for (const inbound of inbounds) {
      const result = await importInbound(inbound as Record<string, unknown>);
      results.push(result);
    }
    return jsonResponse({ ok: true, mode: "manual", imported: results.length, results });
  }

  if (SYNC_MODE !== "api") {
    return jsonResponse({
      error: "SYNC_MODE is not api. Provide inbounds[] in request body or set PREPBUSINESS_SYNC_MODE=api."
    }, 400);
  }

  if (!PREP_BASE_URL || !PREP_TOKEN) {
    return jsonResponse({ error: "Missing PREPBUSINESS_API_BASE_URL or PREPBUSINESS_API_TOKEN." }, 400);
  }

  const { data: merchants, error } = await supabase
    .from("prep_merchants")
    .select("*")
    .eq("sync_enabled", true);
  if (error) {
    return jsonResponse({ error: error.message || "Could not load prep_merchants." }, 500);
  }

  const { data: integrationMerchants, error: integrationMerchantsError } = await supabase
    .from("prep_business_integrations")
    .select("id, merchant_id, company_id, user_id, last_synced_at, status")
    .not("merchant_id", "is", null)
    .in("status", ["active", "mapped", "pending"]);
  if (integrationMerchantsError) {
    return jsonResponse(
      { error: integrationMerchantsError.message || "Could not load prep_business_integrations." },
      500
    );
  }

  const merchantMap = new Map<string, Record<string, unknown>>();
  for (const row of merchants || []) {
    const key = normalizeText((row as Record<string, unknown>).merchant_id);
    if (!key) continue;
    merchantMap.set(String(key), { ...(row as Record<string, unknown>) });
  }
  for (const row of integrationMerchants || []) {
    const merchantId = normalizeText((row as Record<string, unknown>).merchant_id);
    if (!merchantId) continue;
    if (!merchantMap.has(String(merchantId))) {
      merchantMap.set(String(merchantId), {
        merchant_id: merchantId,
        company_id: (row as Record<string, unknown>).company_id || null,
        user_id: (row as Record<string, unknown>).user_id || null,
        last_sync_at: (row as Record<string, unknown>).last_synced_at || null,
        integration_id: (row as Record<string, unknown>).id || null
      });
      continue;
    }
    const current = merchantMap.get(String(merchantId)) || {};
    merchantMap.set(String(merchantId), {
      ...current,
      integration_id: current.integration_id || (row as Record<string, unknown>).id || null,
      company_id: current.company_id || (row as Record<string, unknown>).company_id || null,
      user_id: current.user_id || (row as Record<string, unknown>).user_id || null,
      last_sync_at: current.last_sync_at || (row as Record<string, unknown>).last_synced_at || null
    });
  }

  const syncMerchants = Array.from(merchantMap.values());

  const results = [];
  for (const merchant of syncMerchants) {
    const since = merchant.last_sync_at ? String(merchant.last_sync_at) : null;
    if (!merchant.merchant_id) continue;

    let inboundList: Array<Record<string, unknown>> = [];
    try {
      inboundList = await fetchInbounds(String(merchant.merchant_id), since);
    } catch (error) {
      console.error("PrepBusiness inbounds fetch failed", merchant.merchant_id, error?.message || error);
      results.push({
        error: `Fetch inbounds failed: ${String(error?.message || error)}`,
        merchant_id: merchant.merchant_id
      });
      continue;
    }

    for (const inbound of inboundList) {
      const shipmentId = normalizeText((inbound as Record<string, unknown>)?.id || null);
      let items: Array<Record<string, unknown>> = [];
      let details: Record<string, unknown> | null = null;
      if (shipmentId) {
        try {
          const rawItems = await fetchInboundItems(String(merchant.merchant_id), shipmentId);
          items = mapInboundItems(rawItems as Array<Record<string, unknown>>);
        } catch (error) {
          console.warn("PrepBusiness items fetch failed", shipmentId, error?.message || error);
        }
        try {
          details = await fetchInboundDetails(String(merchant.merchant_id), shipmentId) as Record<string, unknown>;
        } catch (error) {
          console.warn("PrepBusiness shipment fetch failed", shipmentId, error?.message || error);
        }
      }

      const trackingNumbers = Array.isArray((details as any)?.tracking_numbers)
        ? (details as any).tracking_numbers
        : [];
      const trackingIds = trackingNumbers
        .map((row: any) => normalizeText(row?.number))
        .filter(Boolean);
      const carrier = trackingNumbers.find((row: any) => normalizeText(row?.carrier))?.carrier || null;

      const payload = {
        ...(details || inbound),
        ...inbound,
        merchant_id: merchant.merchant_id,
        items,
        tracking_ids: trackingIds.length ? trackingIds : undefined,
        tracking_id: trackingIds.length ? trackingIds[0] : undefined,
        carrier: normalizeText((details as any)?.carrier) || normalizeText(carrier) || undefined
      };
      try {
        const result = await importInbound(payload as Record<string, unknown>);
        results.push(result);
      } catch (error) {
        console.error("PrepBusiness import failed", merchant.merchant_id, shipmentId, error?.message || error);
        results.push({
          error: `Import failed: ${String(error?.message || error)}`,
          merchant_id: merchant.merchant_id,
          source_id: shipmentId
        });
      }
    }

    if (merchant.id) {
      await supabase
        .from("prep_merchants")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", merchant.id);
    }
    if (merchant.integration_id) {
      await supabase
        .from("prep_business_integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", merchant.integration_id);
    }
  }

  return jsonResponse({ ok: true, mode: "api", imported: results.length, results });
}

serve(handleSync);
