import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const ETSY_CLIENT_ID = Deno.env.get("ETSY_CLIENT_ID") || "";
const ETSY_REDIRECT_URI = Deno.env.get("ETSY_REDIRECT_URI") || "";
const ETSY_ENC_KEY = Deno.env.get("ETSY_ENC_KEY") || "";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function decodeState(stateRaw: string) {
  try {
    return JSON.parse(atob(stateRaw));
  } catch {
    return null;
  }
}

function base64UrlFromArrayBuffer(data: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function deriveKey(secret: string) {
  if (!secret || secret.length < 32) return null;
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret).slice(0, 32);
  return await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptMaybe(secret: string, value: string | null | undefined) {
  if (!value) return { value: null, encrypted: false };
  const key = await deriveKey(secret);
  if (!key) return { value, encrypted: false };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    value: `${base64UrlFromArrayBuffer(iv.buffer)}.${base64UrlFromArrayBuffer(cipher)}`,
    encrypted: true
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return jsonResponse({ error: "Missing Supabase environment variables." }, 500);
  }
  if (!ETSY_CLIENT_ID) {
    return jsonResponse({ error: "Missing ETSY_CLIENT_ID." }, 500);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader) return jsonResponse({ error: "Missing auth header." }, 401);

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const {
    data: { user },
    error: authError
  } = await anonClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "Not authenticated." }, 401);

  const payload = await req.json().catch(() => ({}));
  const code = String(payload?.code || "").trim();
  const stateRaw = String(payload?.state || "").trim();
  const codeVerifier = String(payload?.code_verifier || payload?.codeVerifier || "").trim();
  if (!code || !stateRaw || !codeVerifier) return jsonResponse({ error: "Missing code/state/code_verifier." }, 400);

  const state = decodeState(stateRaw);
  if (!state?.userId) return jsonResponse({ error: "Invalid state payload." }, 400);

  if (state.userId !== user.id) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("is_admin, is_limited_admin")
      .eq("id", user.id)
      .maybeSingle();
    const isElevatedAdmin = Boolean(profile?.is_admin) && !Boolean(profile?.is_limited_admin);
    if (!isElevatedAdmin) return jsonResponse({ error: "State mismatch." }, 400);
  }

  const targetUserId = String(state.userId);
  const redirectUri = String(state.redirectUri || ETSY_REDIRECT_URI || "").trim();
  if (!redirectUri) return jsonResponse({ error: "Missing redirect URI configuration." }, 400);

  const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ETSY_CLIENT_ID,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier
    })
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return jsonResponse({ error: `Etsy token exchange failed: ${txt || tokenRes.statusText}` }, 502);
  }

  const tokenJson = await tokenRes.json();
  const accessToken = String(tokenJson?.access_token || "").trim();
  const refreshToken = String(tokenJson?.refresh_token || "").trim();
  const tokenType = String(tokenJson?.token_type || "Bearer").trim();
  const expiresIn = Number(tokenJson?.expires_in || 0) || null;
  const scope = String(tokenJson?.scope || "").trim();
  const accessScopes = scope ? scope.split(/\s+/).filter(Boolean) : [];

  if (!accessToken || !refreshToken) {
    return jsonResponse({ error: "Etsy did not return access_token / refresh_token." }, 502);
  }

  const etsyUserId = accessToken.includes(".") ? accessToken.split(".")[0] : null;
  const accessExp = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  const encAccess = await encryptMaybe(ETSY_ENC_KEY, accessToken);
  const encRefresh = await encryptMaybe(ETSY_ENC_KEY, refreshToken);

  let companyId = state.companyId || null;
  if (!companyId) {
    const { data: ownerProfile } = await serviceClient
      .from("profiles")
      .select("company_id")
      .eq("id", targetUserId)
      .maybeSingle();
    companyId = ownerProfile?.company_id || targetUserId;
  }

  const { data: existing } = await serviceClient
    .from("etsy_integrations")
    .select("id, metadata, shop_id, shop_name, shop_url")
    .eq("user_id", targetUserId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadata = {
    ...(existing?.metadata || {}),
    etsy_oauth: {
      token_type: tokenType,
      access_token: encAccess.value,
      refresh_token: encRefresh.value,
      scope: scope || null,
      encrypted: Boolean(encAccess.encrypted || encRefresh.encrypted),
      expires_at: accessExp,
      updated_at: new Date().toISOString()
    }
  };

  const { data: upserted, error: upsertError } = await serviceClient
    .from("etsy_integrations")
    .upsert(
      {
        id: state.integrationId || existing?.id || undefined,
        user_id: targetUserId,
        company_id: companyId,
        status: "active",
        shop_id: existing?.shop_id || null,
        shop_name: existing?.shop_name || null,
        shop_url: existing?.shop_url || null,
        etsy_user_id: etsyUserId,
        access_scopes: accessScopes,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        last_error: null,
        metadata,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("id, user_id, company_id, status, connected_at")
    .maybeSingle();

  if (upsertError) {
    return jsonResponse({ error: upsertError.message || "Failed to save Etsy integration." }, 500);
  }

  return jsonResponse({ ok: true, integration: upserted });
});
