import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE") || "";
const OAUTH_STATE_SECRET =
  Deno.env.get("OAUTH_STATE_SECRET") ||
  Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ||
  SUPABASE_SERVICE_ROLE_KEY;

const encoder = new TextEncoder();

type Provider = "amazon" | "etsy" | "ups";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function base64UrlEncode(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeText(value: string) {
  return base64UrlEncode(encoder.encode(value));
}

async function importHmacKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signPayload(payloadBase64: string) {
  const key = await importHmacKey(OAUTH_STATE_SECRET);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  return base64UrlEncode(new Uint8Array(signature));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !OAUTH_STATE_SECRET) {
    return jsonResponse({ error: "Missing OAuth state configuration." }, 500);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) {
    return jsonResponse({ error: "Missing auth header." }, 401);
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const {
    data: { user },
    error: authError
  } = await anonClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const provider = String(body?.provider || "").trim().toLowerCase() as Provider;
  const userId = String(body?.userId || "").trim();
  const nonce = String(body?.nonce || "").trim();
  const redirectUri = String(body?.redirectUri || "").trim();
  const companyId = body?.companyId ? String(body.companyId).trim() : null;
  const integrationId = body?.integrationId ? String(body.integrationId).trim() : null;
  const region = body?.region ? String(body.region).trim() : null;
  const marketplaceId = body?.marketplaceId ? String(body.marketplaceId).trim() : null;

  if (!["amazon", "etsy", "ups"].includes(provider)) {
    return jsonResponse({ error: "Invalid provider." }, 400);
  }
  if (!userId || !nonce || nonce.length < 12 || !redirectUri) {
    return jsonResponse({ error: "Missing OAuth state fields." }, 400);
  }

  if (userId !== user.id) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("is_admin, is_limited_admin")
      .eq("id", user.id)
      .maybeSingle();
    const isElevatedAdmin = Boolean(profile?.is_admin) && !Boolean(profile?.is_limited_admin);
    if (!isElevatedAdmin) {
      return jsonResponse({ error: "State user mismatch." }, 403);
    }
  }

  const now = Date.now();
  const payload = {
    v: 1,
    provider,
    userId,
    companyId,
    integrationId,
    region,
    marketplaceId,
    redirectUri,
    nonce,
    iat: now,
    exp: now + 10 * 60 * 1000
  };
  const payloadBase64 = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await signPayload(payloadBase64);

  return jsonResponse({
    ok: true,
    nonce,
    state: `v1.${payloadBase64}.${signature}`
  });
});
