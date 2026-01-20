import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const KEEPA_API_KEY = Deno.env.get("KEEPA_API_KEY") || Deno.env.get("VITE_KEEPA_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

const countryToDomain: Record<string, number> = {
  FR: 4,
  DE: 3,
  IT: 8,
  ES: 9,
  UK: 2,
  GB: 2
};

const buildImageUrl = (imageId: string | null, size = 500) => {
  if (!imageId) return null;
  const id = imageId.trim();
  if (!id) return null;
  const hasExt = id.toLowerCase().endsWith(".jpg");
  const base = hasExt ? id.slice(0, -4) : id;
  return `https://images-na.ssl-images-amazon.com/images/I/${base}._SL${size}_.jpg`;
};

async function keepaLookup(ean: string, domain: number) {
  const url = `https://api.keepa.com/query?key=${KEEPA_API_KEY}&domain=${domain}&type=product&code=${encodeURIComponent(
    ean
  )}&history=0`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Keepa query failed ${resp.status}: ${text || resp.statusText}`);
  }
  const payload = await resp.json();
  const product = payload?.products?.[0];
  if (!product) return null;
  const asin = product.asin || product.asinList?.[0] || null;
  const title = product.title || null;
  let image: string | null = null;
  if (typeof product.imagesCSV === "string" && product.imagesCSV.length) {
    const first = product.imagesCSV.split(",")[0];
    image = buildImageUrl(first);
  } else if (Array.isArray(product.images) && product.images.length) {
    const first = product.images[0];
    const imgId = typeof first === "string" ? first : first?.l || first?.m || null;
    image = buildImageUrl(imgId);
  }
  return { asin, title, image };
}

async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!KEEPA_API_KEY) return jsonResponse({ error: "Missing KEEPA_API_KEY" }, 500);

  let body: { user_id?: string; company_id?: string; ean?: string; country?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const userId = body.user_id;
  const companyId = body.company_id || userId || null;
  const eanRaw = body.ean || "";
  const ean = eanRaw.trim();
  const country = (body.country || "FR").toUpperCase();
  const domain = countryToDomain[country] || 4;

  if (!userId || !ean) return jsonResponse({ error: "Missing user_id or ean" }, 400);

  try {
    const result = await keepaLookup(ean, domain);
    if (!result?.asin) {
      return jsonResponse({ error: "NotFound", message: "Keepa nu a găsit produs pentru acest EAN." }, 404);
    }

    const { asin, title, image } = result;

    await supabase.from("asin_eans").upsert(
      {
        user_id: userId,
        company_id: companyId,
        asin,
        ean
      },
      { onConflict: "user_id,asin,ean" }
    );

    // actualizează stock_items pentru user dacă există match pe ean sau asin
    await supabase
      .from("stock_items")
      .update({
        asin,
        image_url: image || undefined
      })
      .eq("user_id", userId)
      .or(`ean.eq.${ean},asin.eq.${asin}`);

    return jsonResponse({ asin, title, image });
  } catch (err) {
    return jsonResponse({ error: "Keepa failed", details: `${err}` }, 400);
  }
}

serve(handler);
