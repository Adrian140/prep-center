import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const QOGITA_API_URL = Deno.env.get("QOGITA_API_URL") || "https://api.qogita.com";
const QOGITA_ENC_KEY = Deno.env.get("QOGITA_ENC_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type LoginResponse = {
  accessToken?: string;
  access?: string;
  access_token?: string;
  token?: string;
  expires_at?: string | null;
  access_expires_at?: string | null;
  accessExp?: number | null;
};

type OrderSummary = {
  qid?: string;
  fid?: string;
  status?: string;
  placedAt?: string;
  [key: string]: unknown;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function base64UrlToBytes(data: string): Uint8Array {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (data.length % 4)) % 4);
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function deriveKey(secret: string) {
  if (!secret || secret.length < 32) {
    throw new Error("Missing QOGITA_ENC_KEY (expected at least 32 chars).");
  }
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret).slice(0, 32);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decryptToken(encrypted: string) {
  const [ivB64, cipherB64] = encrypted.split(".");
  if (!ivB64 || !cipherB64) throw new Error("Invalid encrypted token format");
  const key = await deriveKey(QOGITA_ENC_KEY);
  const iv = base64UrlToBytes(ivB64);
  const cipherBytes = base64UrlToBytes(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBytes);
  return new TextDecoder().decode(plain);
}

async function encryptToken(token: string) {
  const key = await deriveKey(QOGITA_ENC_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(token);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(cipher)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const ivB64 = btoa(String.fromCharCode(...iv))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${ivB64}.${base64}`;
}

function extractRefreshToken(setCookieHeader: string | null) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/Refresh-Token=([^;]+)/i);
  return match ? match[1] : null;
}

function extractRefreshExpiry(setCookieHeader: string | null) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/Expires=([^;]+)/i);
  if (match && match[1]) {
    const dt = new Date(match[1]);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  return null;
}

async function getTokenForUser(userId: string) {
  const { data, error } = await supabase
    .from("qogita_connections")
    .select("access_token_encrypted, refresh_token_encrypted")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token_encrypted) throw new Error("No Qogita connection found.");
  return {
    access: await decryptToken(data.access_token_encrypted),
    refresh: data.refresh_token_encrypted ? await decryptToken(data.refresh_token_encrypted) : null
  };
}

async function fetchJson(url: string, token: string) {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Qogita request failed ${resp.status}: ${text || resp.statusText}`);
    // @ts-ignore custom status for upstream handling
    (err as any).status = resp.status;
    throw err;
  }
  return resp.json();
}

async function refreshAccessToken(refreshToken: string | null) {
  if (!refreshToken) throw new Error("Missing refresh token");
  const resp = await fetch(`${QOGITA_API_URL}/auth/refresh/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: `Refresh-Token=${refreshToken}`
    }
  });
  if (!resp.ok) {
    const txt = await resp.text();
    const err = new Error(`Qogita refresh failed ${resp.status}: ${txt || resp.statusText}`);
    // @ts-ignore
    (err as any).status = resp.status;
    throw err;
  }
  const data = (await resp.json()) as LoginResponse;
  const token =
    data.accessToken ||
    data.access ||
    data.access_token ||
    data.token ||
    null;
  if (!token) {
    const err = new Error("Qogita refresh did not return access token");
    // @ts-ignore
    (err as any).status = 401;
    throw err;
  }
  const expiresAt =
    (typeof data.accessExp === "number" ? new Date(data.accessExp).toISOString() : null) ||
    data.expires_at ||
    data.access_expires_at ||
    null;
  const refreshCookie = extractRefreshToken(resp.headers.get("set-cookie"));
  const refreshExpires = extractRefreshExpiry(resp.headers.get("set-cookie"));
  return { token, expiresAt, refreshToken: refreshCookie, refreshExpires };
}

async function handleShipments(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { user_id?: string; page_size?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const userId = body.user_id;
  const pageSize = body.page_size || 20;
  if (!userId) return jsonResponse({ error: "Missing user_id" }, 400);

  try {
    const { access, refresh } = await getTokenForUser(userId);
    let token = access;

    const fetchOrders = async (tok: string) =>
      (await fetchJson(`${QOGITA_API_URL}/orders/?size=${pageSize}`, tok)) as { results?: OrderSummary[] };

    let ordersData;
    try {
      ordersData = await fetchOrders(token);
    } catch (err) {
      if ((err as any)?.status === 401 && refresh) {
        const refreshed = await refreshAccessToken(refresh);
        token = refreshed.token;
        await supabase
          .from("qogita_connections")
          .update({
            access_token_encrypted: await encryptToken(token),
            refresh_token_encrypted: refreshed.refreshToken ? await encryptToken(refreshed.refreshToken) : undefined,
            expires_at: refreshed.expiresAt,
            refresh_expires_at: refreshed.refreshExpires || null
          })
          .eq("user_id", userId);
        ordersData = await fetchOrders(token);
      } else {
        throw err;
      }
    }

    const orders = (ordersData as { results?: OrderSummary[] })?.results || [];

    const shipments: Record<string, unknown>[] = [];

    const fetchSales = async (orderQid: string) => {
      try {
        const salesData = (await fetchJson(
          `${QOGITA_API_URL}/orders/${orderQid}/sales/?size=50`,
          token
        )) as { results?: any[] };
        return salesData?.results || [];
      } catch (err) {
        if ((err as any)?.status === 401 && refresh) {
          const refreshed = await refreshAccessToken(refresh);
          token = refreshed.token;
          await supabase
            .from("qogita_connections")
            .update({
              access_token_encrypted: await encryptToken(token),
              refresh_token_encrypted: refreshed.refreshToken ? await encryptToken(refreshed.refreshToken) : undefined,
              expires_at: refreshed.expiresAt,
              refresh_expires_at: refreshed.refreshExpires || null
            })
            .eq("user_id", userId);
          const salesData = (await fetchJson(
            `${QOGITA_API_URL}/orders/${orderQid}/sales/?size=50`,
            token
          )) as { results?: any[] };
          return salesData?.results || [];
        }
        throw err;
      }
    };

    for (const order of orders) {
      const orderQid = (order as Record<string, unknown>).qid as string | undefined;
      if (!orderQid) continue;
      let sales: any[] = [];
      sales = await fetchSales(orderQid);

      for (const sale of sales) {
        const saleLines = (sale.salelines || []).map((line: any) => ({
          gtin: line?.variant?.gtin || line?.variant?.ean || line?.gtin || null,
          name: line?.variant?.name || line?.name || null,
          shipped_qty: line?.quantity ?? line?.qty ?? null,
          requested_qty: line?.requestedQuantity ?? line?.requested_qty ?? null,
          price: line?.price ?? null,
          subtotal: line?.subtotal ?? null,
          currency: line?.priceCurrency || line?.subtotalCurrency || null,
          image_url: line?.variant?.image || line?.variant?.image_url || null
        }));

        const saleShipments = sale?.shipments || [];
        saleShipments.forEach((shipment: any) => {
          shipments.push({
            order_qid: orderQid,
            fid: (order as any)?.fid || null,
            status: (order as any)?.status || null,
            shipment_code: shipment?.code || sale?.code || null,
            seller: sale?.seller || shipment?.seller || null,
            country: shipment?.country || sale?.country || (order as any)?.country || null,
            tracking_links: shipment?.url ? [shipment.url] : shipment?.tracking_links || [],
            sale_lines: saleLines
          });
        });
      }
    }

    return jsonResponse({ shipments });
  } catch (err) {
    const status = (err as any)?.status || 400;
    if (status === 401) {
      return jsonResponse(
        { error: "auth_failed", message: "Qogita token invalid/expired. Reconnect from Integrations.", details: `${err}` },
        401
      );
    }
    return jsonResponse({ error: "Failed to fetch shipments", details: `${err}` }, 400);
  }
}

serve(handleShipments);
