import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-prepbusiness-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("PREPBUSINESS_WEBHOOK_SECRET") || "";

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

function normalizeReceivingStatus(value: unknown) {
  const raw = String(normalizeText(value) || "").toLowerCase();
  if (!raw) return "submitted";
  const allowed = new Set(["draft", "submitted", "partial", "received", "processed", "cancelled"]);
  if (allowed.has(raw)) return raw;
  if (["cancel", "canceled", "void", "rejected"].includes(raw)) return "cancelled";
  if (["done", "completed", "complete"].includes(raw)) return "processed";
  if (["received_all", "delivered"].includes(raw)) return "received";
  if (["new", "created", "open", "pending"].includes(raw)) return "draft";
  if (["in_progress", "processing", "shipped", "in_transit"].includes(raw)) return "submitted";
  return "submitted";
}

function normalizeIdentifierType(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function extractIdentifier(
  identifiers: Array<Record<string, unknown>> | undefined,
  types: string[]
) {
  if (!identifiers || !Array.isArray(identifiers)) return null;
  const allowed = new Set((types || []).map((t) => normalizeIdentifierType(t)));
  const hit = identifiers.find((row) => {
    const type = normalizeIdentifierType(row?.identifier_type);
    return allowed.has(type);
  });
  return normalizeText(hit?.identifier || null);
}

function normalizeInboundItem(raw: Record<string, unknown>) {
  const nested = (raw?.item as Record<string, unknown>) || {};
  const identifiers = Array.isArray(nested?.identifiers)
    ? (nested.identifiers as Array<Record<string, unknown>>)
    : Array.isArray(raw?.identifiers)
    ? (raw.identifiers as Array<Record<string, unknown>>)
    : [];
  const asin =
    normalizeText(raw?.asin) ||
    normalizeText(nested?.asin) ||
    extractIdentifier(identifiers, ["ASIN"]) ||
    null;
  const ean =
    normalizeText(raw?.ean) ||
    normalizeText(nested?.ean) ||
    extractIdentifier(identifiers, ["EAN", "GTIN", "UPC"]) ||
    null;
  const sku =
    normalizeText(raw?.sku) ||
    normalizeText(raw?.merchant_sku) ||
    normalizeText(nested?.merchant_sku) ||
    normalizeText(nested?.sku) ||
    null;
  const title = normalizeText(raw?.title) || normalizeText(nested?.title) || null;
  const productName = normalizeText(raw?.product_name) || title || sku || asin || null;
  return {
    ...raw,
    asin,
    ean,
    sku,
    title,
    product_name: productName
  };
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
  const desiredName =
    normalizeText(item.product_name) ||
    normalizeText(item.title) ||
    sku ||
    asin ||
    "Unknown product";

  const maybeUpdateName = async (row: Record<string, unknown> | null) => {
    if (!row?.id || !desiredName) return row;
    const currentName = normalizeText((row as any).name) || "";
    const isPlaceholder =
      !currentName ||
      currentName === (asin || "") ||
      currentName === (sku || "");
    if (!isPlaceholder || currentName === desiredName) return row;
    const { data: updated, error } = await supabase
      .from("stock_items")
      .update({ name: desiredName })
      .eq("id", String((row as any).id))
      .select("*")
      .single();
    if (error) return row;
    return (updated as Record<string, unknown>) || row;
  };

  if (asin && sku) {
    const { data: exactPair } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("asin", asin)
      .eq("sku", sku)
      .maybeSingle();
    if (exactPair) return await maybeUpdateName(exactPair as Record<string, unknown>);
  }

  if (sku) {
    const { data: bySku } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("sku", sku)
      .maybeSingle();
    if (bySku) return await maybeUpdateName(bySku as Record<string, unknown>);
  }

  if (asin) {
    const { data: byAsin } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("asin", asin)
      .maybeSingle();
    if (byAsin) return await maybeUpdateName(byAsin as Record<string, unknown>);
  }

  if (ean) {
    const { data: byEan } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("ean", ean)
      .maybeSingle();
    if (byEan) return await maybeUpdateName(byEan as Record<string, unknown>);
  }

  const payload = {
    company_id: companyId,
    user_id: userId || null,
    asin,
    sku,
    ean,
    name: desiredName,
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
    const normalizedItem = normalizeInboundItem(item as Record<string, unknown>);
    const stock = await ensureStockItem(companyId, userId, normalizedItem);
    resolvedItems.push({
      ...normalizedItem,
      stock_item_id: stock?.id || null,
      product_name:
        normalizeText(normalizedItem.product_name) ||
        stock?.name ||
        normalizeText(normalizedItem.sku) ||
        normalizeText(normalizedItem.asin),
      asin: normalizeText(normalizedItem.asin),
      sku: normalizeText(normalizedItem.sku),
      ean: normalizeText(normalizedItem.ean)
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
    status: normalizeReceivingStatus(payload.status),
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

async function handleWebhook(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-prepbusiness-secret") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
    if (!provided || provided !== WEBHOOK_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch (_e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  try {
    const result = await importInbound(payload);
    if ("error" in result) {
      return jsonResponse({ error: result.error }, 400);
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: "Unexpected error", details: String(err) }, 500);
  }
}

serve(handleWebhook);
