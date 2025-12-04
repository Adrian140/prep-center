// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type PrepRequestItem = {
  id: string;
  asin: string | null;
  sku: string | null;
  product_name: string | null;
  units_requested: number | null;
  units_sent: number | null;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id as string | undefined;

    if (!requestId) {
      return new Response(JSON.stringify({ error: "request_id is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Fetch prep request + items
    const { data: reqData, error: reqErr } = await supabase
      .from("prep_requests")
      .select(
        "id, destination_country, company_id, user_id, prep_request_items(id, asin, sku, product_name, units_requested, units_sent)"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (reqErr) throw reqErr;
    if (!reqData) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const items: PrepRequestItem[] = Array.isArray(reqData.prep_request_items)
      ? reqData.prep_request_items
      : [];

    // Build a simple aggregated plan: all items in one pack group (until we switch to SP-API grouping)
    const skus = items.map((it, idx) => ({
      id: it.id || `sku-${idx}`,
      title: it.product_name || `SKU ${idx + 1}`,
      sku: it.sku || "",
      asin: it.asin || "",
      storageType: "Standard-size",
      packing: "individual",
      units: Number(it.units_sent ?? it.units_requested ?? 0),
      prepRequired: false,
      readyToPack: true,
      expiry: ""
    }));

    const totalUnits = skus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);

    const packGroups = skus.length
      ? [
          {
            id: "pack-1",
            title: "Pack group 1",
            skuCount: skus.length,
            units: totalUnits,
            boxes: 1,
            packMode: "single",
            warning: null,
            image: null,
            skus: skus.map((s) => ({ id: s.id, qty: s.units }))
          }
        ]
      : [];

    const shipments = [
      {
        id: reqData.id?.slice(0, 6) || "1",
        name: `Shipment #${reqData.id?.slice(0, 6) || 1}`,
        from: reqData.destination_country || "FR",
        to: reqData.destination_country || "FR",
        boxes: 1,
        skuCount: skus.length || 1,
        units: totalUnits,
      },
    ];

    const plan = {
      source: "local", // TODO: replace with SP-API response once connected
      shipFrom: {
        name: "Prep Center",
        address: reqData.destination_country || "FR",
      },
      marketplace: reqData.destination_country || "FR",
      skus,
      packGroups,
      shipments,
    };

    return new Response(JSON.stringify({ plan }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("fba-plan error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
