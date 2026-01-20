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

const normalizeEan = (ean: string) => {
  const digits = ean.replace(/\D+/g, "");
  if (!digits) return ean.trim();
  if (digits.length >= 8 && digits.length < 13) {
    return digits.padStart(13, "0");
  }
  return ean.trim();
};

type KeepaProduct = { asin?: string | null; title?: string | null; imagesCSV?: string | null; images?: any[] | null };

async function keepaLookupByEan(ean: string, domains: number[]) {
  const results: any[] = [];
  for (const domain of domains) {
    const url = `https://api.keepa.com/product?key=${KEEPA_API_KEY}&domain=${domain}&code=${encodeURIComponent(
      ean
    )}&history=0&stats=0`;
    const resp = await fetch(url);
    results.push({ domain, status: resp.status });
    if (resp.status === 429) {
      // rate limit, notăm și încercăm alte domenii (poate unul e liber)
      continue;
    }
    if (!resp.ok) {
      continue;
    }
    const payload = await resp.json();
    const products: KeepaProduct[] = payload?.products || [];
    if (!products.length) continue;
    const asins: string[] = [];
    const asinImages: Record<string, string | null> = {};
    products.forEach((product) => {
      const candidates = new Set<string>();
      if (product.asin) candidates.add(product.asin);
      if (Array.isArray(product.asinList)) {
        product.asinList.forEach((a: string) => {
          if (a) candidates.add(a);
        });
      }
      Array.from(candidates).forEach((asin) => {
        if (!asins.includes(asin)) asins.push(asin);
      });
      let image: string | null = null;
      if (typeof product.imagesCSV === "string" && product.imagesCSV.length) {
        const first = product.imagesCSV.split(",")[0];
        image = buildImageUrl(first);
      } else if (Array.isArray(product.images) && product.images.length) {
        const first = product.images[0];
        const imgId = typeof first === "string" ? first : first?.l || first?.m || null;
        image = buildImageUrl(imgId);
      }
      if (image) {
        Array.from(candidates).forEach((asin) => {
          asinImages[asin] = image;
        });
      }
    });
    if (asins.length) return { asins, asinImages, domain, trace: results, rateLimited: false };
  }
  // dacă toate au returnat 429, marcăm rateLimited
  const only429 = results.length && results.every((r) => r.status === 429);
  return { asins: [], asinImages: {}, domain: null, trace: results, rateLimited: only429 };
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
    .select("access_token_encrypted, refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.access_token_encrypted) return null;
  try {
    return {
      access: await decryptToken(data.access_token_encrypted),
      refresh: data.refresh_token_encrypted ? await decryptToken(data.refresh_token_encrypted) : null
    };
  } catch {
    return null;
  }
}

async function refreshQogitaToken(refresh: string) {
  const resp = await fetch(`${QOGITA_API_URL}/auth/refresh/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: `Refresh-Token=${refresh}`
    }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const token = data.accessToken || data.access || data.access_token || data.token || null;
  return token;
}

async function fetchJson(url: string, token: string) {
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });
    return { ok: resp.ok, status: resp.status, body: resp.ok ? await resp.json() : null };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: `${err}` };
  }
}

async function fetchQogitaGtins(userId: string, token: string) {
  const results = new Set<string>();
  const ordersResp = await fetchJson(`${QOGITA_API_URL}/orders/?size=50`, token);
  if (!ordersResp.ok) return { gtins: [], status: ordersResp.status, error: ordersResp.error || null };
  const list = ordersResp.body?.results || [];
  for (const order of list) {
    const qid = order?.qid;
    if (!qid) continue;
    const salesResp = await fetchJson(`${QOGITA_API_URL}/orders/${qid}/sales/?size=100`, token);
    if (!salesResp.ok) continue;
    const saleList = salesResp.body?.results || [];
    for (const sale of saleList) {
      const lines = sale?.salelines || [];
      for (const line of lines) {
        const gtin = line?.variant?.gtin || line?.variant?.ean || line?.gtin || null;
        if (gtin) results.add(gtin);
      }
    }
  }
  return { gtins: Array.from(results).slice(0, 50), status: 200 }; // limit pentru costuri
}

async function gatherStockGtins(userId: string) {
  const { data, error } = await supabase
    .from("stock_items")
    .select("ean")
    .eq("user_id", userId)
    .is("asin", null)
    .not("ean", "is", null)
    .limit(200);
  if (error) return [];
  return (data || []).map((row) => row.ean as string).filter(Boolean);
}

async function gatherLocalShipmentGtins(userId: string) {
  const { data, error } = await supabase
    .from("qogita_shipment_lines")
    .select("gtin")
    .eq("user_id", userId)
    .not("gtin", "is", null);
  if (error) return [];
  return (data || []).map((row) => row.gtin as string).filter(Boolean);
}

async function processUser(userId: string, country?: string) {
  const tokens = await getQogitaToken(userId);
  if (!tokens?.access) return { updated: 0, scanned: 0, details: [{ error: "no_token" }] };
  let token = tokens.access;
  let gtinResp = await fetchQogitaGtins(userId, token);
  // dacă 401, încearcă refresh
  if (gtinResp.status === 401 && tokens.refresh) {
    const newToken = await refreshQogitaToken(tokens.refresh);
    if (newToken) {
      token = newToken;
      await supabase
        .from("qogita_connections")
        .update({ access_token_encrypted: await encryptToken(token) })
        .eq("user_id", userId);
      const retry = await fetchQogitaGtins(userId, token);
      gtinResp = retry;
    }
  }
  const gtinsQogita = gtinResp.gtins || [];
  const gtinsStock = await gatherStockGtins(userId);
  const gtinsLocal = await gatherLocalShipmentGtins(userId);
  const allGtins = Array.from(new Set([...gtinsQogita, ...gtinsStock, ...gtinsLocal])).slice(0, 300);
  if (!allGtins.length) return { updated: 0, scanned: 0, details: [{ notice: "no_gtin_found", status: gtinResp.status, error: gtinResp.error || null, stock_gtin_count: gtinsStock.length, local_gtin_count: gtinsLocal.length }] };

  const domainBase = country ? countryToDomain[country.toUpperCase()] || 4 : 4;
  const domainFallbacks = [domainBase, 4, 3, 8, 9, 2].filter((v, i, arr) => v && arr.indexOf(v) === i);

  let updated = 0;
  const details: any[] = [];
  for (const rawEan of allGtins) {
    const ean = normalizeEan(rawEan);
    try {
      const res = await keepaLookupByEan(ean, domainFallbacks);
      details.push({ ean, asins: res.asins, domain: res.domain, trace: res.trace });
      if (res.rateLimited) {
        // rate limit: sărim peste acest EAN, încercăm următoarele
        continue;
      }
      if (!res?.asins?.length) continue;

      // insert all ASINs mapped to EAN
      const rows = res.asins.map((asin) => ({
        user_id: userId,
        company_id: null,
        asin,
        ean
      }));
      await supabase.from("asin_eans").upsert(rows, { onConflict: "user_id,asin,ean" });

      // prefer asin deja existent in stock, altfel primul
      let preferred = res.asins[0];
      const { data: stockAsin } = await supabase
        .from("stock_items")
        .select("asin, image_url")
        .in("asin", res.asins)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (stockAsin?.asin) preferred = stockAsin.asin;

      const preferredImage =
        stockAsin?.image_url || res.asinImages?.[preferred] || res.asinImages?.[res.asins[0]] || null;

      await supabase
        .from("stock_items")
        .update({
          asin: preferred,
          image_url: preferredImage || null
        })
        .eq("user_id", userId)
        .eq("ean", rawEan);
      updated += 1;
    } catch (err) {
      details.push({ ean, error: `${err}` });
    }
  }
  return { updated, scanned: allGtins.length, details };
}

serve(async () => {
  try {
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
    let totalScanned = 0;
    const details: any[] = [];
    for (const uid of users) {
      const { updated, scanned, details: d } = (await processUser(uid)) as any;
      totalUpdated += updated || 0;
      totalScanned += scanned || 0;
      details.push({ user_id: uid, updated, scanned, details: (d || []).slice(0, 50) });
    }

    return new Response(JSON.stringify({ ok: true, users: users.length, updated: totalUpdated, scanned: totalScanned, details }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal", details: `${err}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
