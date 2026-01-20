import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const KEEPA_API_KEY = Deno.env.get("KEEPA_API_KEY") || Deno.env.get("VITE_KEEPA_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

async function keepaLookupByEan(ean: string, domain = 4) {
  const url = `https://api.keepa.com/query?key=${KEEPA_API_KEY}&domain=${domain}&type=product&code=${encodeURIComponent(
    ean
  )}&history=0`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Keepa query failed ${resp.status}: ${txt || resp.statusText}`);
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

async function processUser(userId: string, country?: string) {
  const { data: items, error } = await supabase
    .from("stock_items")
    .select("id, company_id, ean, asin, image_url")
    .eq("user_id", userId)
    .is("asin", null)
    .not("ean", "is", null)
    .limit(20);
  if (error) throw error;
  if (!items?.length) return 0;

  let updated = 0;
  for (const row of items) {
    const ean = row.ean as string;
    const domain = country ? countryToDomain[country.toUpperCase()] || 4 : 4;
    try {
      const res = await keepaLookupByEan(ean, domain);
      if (!res?.asin) continue;
      await supabase.from("asin_eans").upsert(
        {
          user_id: userId,
          company_id: row.company_id,
          asin: res.asin,
          ean
        },
        { onConflict: "user_id,asin,ean" }
      );
      await supabase
        .from("stock_items")
        .update({
          asin: res.asin,
          image_url: row.image_url || res.image || null
        })
        .eq("id", row.id);
      updated += 1;
    } catch (err) {
      console.error(`Keepa lookup failed for user ${userId} ean ${ean}:`, err);
    }
  }
  return updated;
}

serve(async () => {
  if (!KEEPA_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing KEEPA_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // utilizatori care au conexiune Qogita
  const { data: conns, error } = await supabase.from("qogita_connections").select("user_id").eq("status", "active");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  const users = Array.from(new Set((conns || []).map((c) => c.user_id).filter(Boolean)));
  let totalUpdated = 0;
  for (const uid of users) {
    const updated = await processUser(uid);
    totalUpdated += updated;
  }

  return new Response(JSON.stringify({ ok: true, users: users.length, updated: totalUpdated }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});
