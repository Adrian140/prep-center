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

const UPS_CLIENT_ID = Deno.env.get("UPS_CLIENT_ID") || "";
const UPS_CLIENT_SECRET = Deno.env.get("UPS_CLIENT_SECRET") || "";
const UPS_BASE_URL = (Deno.env.get("UPS_BASE_URL") || "https://onlinetools.ups.com").replace(/\/$/, "");
const UPS_ENC_KEY = Deno.env.get("UPS_ENC_KEY") || "";
const UPS_REDIRECT_URI = Deno.env.get("UPS_REDIRECT_URI") || "";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function base64Encode(input: string) {
  return btoa(input);
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
  if (!UPS_CLIENT_ID || !UPS_CLIENT_SECRET) {
    return jsonResponse({ error: "Missing UPS_CLIENT_ID / UPS_CLIENT_SECRET." }, 500);
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
  if (!code || !stateRaw) return jsonResponse({ error: "Missing code/state." }, 400);

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
  const redirectUri = String(state.redirectUri || UPS_REDIRECT_URI || "").trim();
  if (!redirectUri) return jsonResponse({ error: "Missing redirect URI configuration." }, 400);

  const tokenRes = await fetch(`${UPS_BASE_URL}/security/v1/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${base64Encode(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`)}`
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return jsonResponse({ error: `UPS token exchange failed: ${txt || tokenRes.statusText}` }, 502);
  }

  const tokenJson = await tokenRes.json();
  const accessToken = String(tokenJson?.access_token || tokenJson?.accessToken || "").trim();
  const refreshToken = String(tokenJson?.refresh_token || tokenJson?.refreshToken || "").trim() || null;
  const scope = String(tokenJson?.scope || "").trim() || null;
  const expiresIn = Number(tokenJson?.expires_in || tokenJson?.expiresIn || 0) || null;
  const refreshExpiresIn = Number(tokenJson?.refresh_expires_in || tokenJson?.refreshExpiresIn || 0) || null;

  if (!accessToken) return jsonResponse({ error: "UPS did not return access_token." }, 502);

  const accessExp = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const refreshExp = refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : null;

  const encAccess = await encryptMaybe(UPS_ENC_KEY, accessToken);
  const encRefresh = await encryptMaybe(UPS_ENC_KEY, refreshToken);

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
    .from("ups_integrations")
    .select("id, metadata, ups_account_number, account_label")
    .eq("user_id", targetUserId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadata = {
    ...(existing?.metadata || {}),
    ups_oauth: {
      token_type: tokenJson?.token_type || "Bearer",
      scope,
      access_token: encAccess.value,
      refresh_token: encRefresh.value,
      encrypted: Boolean(encAccess.encrypted || encRefresh.encrypted),
      expires_at: accessExp,
      refresh_expires_at: refreshExp,
      updated_at: new Date().toISOString()
    }
  };

  const { data: upserted, error: upsertError } = await serviceClient
    .from("ups_integrations")
    .upsert(
      {
        id: state.integrationId || existing?.id || undefined,
        user_id: targetUserId,
        company_id: companyId,
        status: "active",
        ups_account_number: existing?.ups_account_number || null,
        account_label: existing?.account_label || null,
        oauth_scope: scope,
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
    return jsonResponse({ error: upsertError.message || "Failed to save UPS integration." }, 500);
  }

  return jsonResponse({ ok: true, integration: upserted });
});
