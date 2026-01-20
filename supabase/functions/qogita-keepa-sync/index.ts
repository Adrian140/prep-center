import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const KEEPA_API_KEY = Deno.env.get("KEEPA_API_KEY") || Deno.env.get("VITE_KEEPA_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const QOGITA_API_URL = Deno.env.get("QOGITA_API_URL") || "https://api.qogita.com";
const QOGITA_ENC_KEY = Deno.env.get("QOGITA_ENC_KEY") || "";

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

async function deriveKey(secret: string) {
  if (!secret || secret.length < 32) throw new Error("Missing QOGITA_ENC_KEY");
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret).slice(0, 32);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
}

function base64UrlToBytes(data: string): Uint8Array {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (data.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function decryptToken(encrypted: string) {
  const [ivB64, cipherB64] = encrypted.split(".");
  const key = await deriveKey(QOGITA_ENC_KEY);
  const iv = base64UrlToBytes(ivB64);
  const cipherBytes = base64UrlToBytes(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  return new TextDecoder().decode(plain);
}

async function getQogitaToken(userId: string) {
  const { data, error } = await supabase
    .from("qogita_connections")
    .select("access_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.access_token_encrypted) return null;
  try {
    return await decryptToken(data.access_token_encrypted);
  } catch {
    return null;
  }
}

async function fetchJson(url: string, token: string) {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  if (!resp.ok) return null;
  return await resp.json();
}

async function fetchQogitaGtins(userId: string, token: string) {
  const results = new Set<string>();
  const orders = await fetchJson(`${QOGITA_API_URL}/orders/?size=20`, token);
  const list = orders?.results || [];
  for (const order of list) {
    const qid = order?.qid;
    if (!qid) continue;
    const sales = await fetchJson(`${QOGITA_API_URL}/orders/${qid}/sales/?size=50`, token);
    const saleList = sales?.results || [];
    for (const sale of saleList) {
      const lines = sale?.salelines || [];
      for (const line of lines) {
        const gtin = line?.variant?.gtin || line?.variant?.ean || line?.gtin || null;
        if (gtin) results.add(gtin);
      }
    }
  }
  return Array.from(results).slice(0, 30); // limit pentru costuri
}

async function processUser(userId: string, country?: string) {
  const token = await getQogitaToken(userId);
  if (!token) return 0;
  const gtins = await fetchQogitaGtins(userId, token);
  if (!gtins.length) return 0;

  let updated = 0;
  for (const ean of gtins) {
    const domain = country ? countryToDomain[country.toUpperCase()] || 4 : 4;
    try {
      const res = await keepaLookupByEan(ean, domain);
      if (!res?.asin) continue;
      await supabase.from("asin_eans").upsert(
        {
          user_id: userId,
          company_id: null,
          asin: res.asin,
          ean
        },
        { onConflict: "user_id,asin,ean" }
      );
      await supabase
        .from("stock_items")
        .update({
          asin: res.asin,
          image_url: res.image || null
        })
        .eq("user_id", userId)
        .eq("ean", ean);
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
