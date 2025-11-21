import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LWA_CLIENT_ID = Deno.env.get("SPAPI_LWA_CLIENT_ID") ?? Deno.env.get("LWA_CLIENT_ID") ?? "";
const LWA_CLIENT_SECRET = Deno.env.get("SPAPI_LWA_CLIENT_SECRET") ?? Deno.env.get("LWA_CLIENT_SECRET") ?? "";
const DEFAULT_REDIRECT = Deno.env.get("SPAPI_REDIRECT_URI") ?? Deno.env.get("LWA_REDIRECT_URI") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase environment variables.");
}

if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET) {
  console.error("Missing Amazon LWA credentials.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader) {
      return new Response("Missing auth header", { status: 401, headers: corsHeaders });
    }

    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user },
      error: userError
    } = await anonClient.auth.getUser();

    if (userError || !user) {
      return new Response("Not authenticated", { status: 401, headers: corsHeaders });
    }

    const payload =
      req.method === "POST"
        ? await req.json().catch(() => ({}))
        : Object.fromEntries(new URL(req.url).searchParams.entries());

    const code = payload.code || payload.spapi_oauth_code;
    const stateRaw = payload.state || "";
    const sellingPartnerId = payload.sellingPartnerId || payload.selling_partner_id || null;
    const marketplaceParam = payload.marketplaceId || payload.marketplace_id || null;

    if (!code || !stateRaw) {
      return new Response("Missing code/state", { status: 400, headers: corsHeaders });
    }

    let parsedState: {
      userId?: string;
      companyId?: string;
      region?: string;
      marketplaceId?: string;
      redirectUri?: string;
    } | null = null;

    try {
      parsedState = JSON.parse(atob(stateRaw));
    } catch (_e) {
      return new Response("Invalid state payload", { status: 400, headers: corsHeaders });
    }

    if (!parsedState?.userId || parsedState.userId !== user.id) {
      return new Response("State mismatch", { status: 400, headers: corsHeaders });
    }

    const marketplaceId = parsedState.marketplaceId || marketplaceParam || "A13V1IB3VIYZZH";
    const region = parsedState.region || "eu";
    const redirectUri = parsedState.redirectUri || DEFAULT_REDIRECT;

    if (!redirectUri) {
      return new Response("Missing redirect URI configuration", { status: 400, headers: corsHeaders });
    }

    const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: LWA_CLIENT_ID,
        client_secret: LWA_CLIENT_SECRET
      })
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      return new Response(`Amazon token exchange failed: ${txt}`, {
        status: 502,
        headers: corsHeaders
      });
    }

    const tokenJson = await tokenRes.json();
    const refreshToken = tokenJson.refresh_token as string | undefined;
    if (!refreshToken) {
      return new Response("Missing refresh_token in response", { status: 502, headers: corsHeaders });
    }
    const accessToken = tokenJson.access_token as string | undefined;
    const accessExpiresIn = typeof tokenJson.expires_in === "number" ? Number(tokenJson.expires_in) : null;
    const accessTokenExpiresAt =
      accessExpiresIn != null ? new Date(Date.now() + accessExpiresIn * 1000).toISOString() : null;

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let companyId = parsedState.companyId || null;
    if (!companyId) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      companyId = profile?.company_id || user.id;
    }

    const record = {
      user_id: user.id,
      company_id: companyId,
      marketplace_id: marketplaceId,
      region,
      refresh_token: refreshToken,
      selling_partner_id: sellingPartnerId,
      status: "active",
      last_error: null,
      updated_at: new Date().toISOString()
    };

    const { error: upsertError } = await serviceClient
      .from("amazon_integrations")
      .upsert(record, { onConflict: "user_id,marketplace_id" });

    if (upsertError) {
      return new Response(upsertError.message, { status: 500, headers: corsHeaders });
    }

    const sellerId = sellingPartnerId || companyId || user.id;
    const { data: existingSellerToken } = await serviceClient
      .from("seller_tokens")
      .select("marketplace_ids")
      .eq("seller_id", sellerId)
      .maybeSingle();
    const mergedMarketplaces = Array.from(
      new Set([...(existingSellerToken?.marketplace_ids || []), marketplaceId].filter(Boolean))
    );
    const sellerTokenRecord = {
      seller_id: sellerId,
      refresh_token: refreshToken,
      access_token: accessToken || null,
      access_token_expires_at: accessTokenExpiresAt,
      marketplace_ids: mergedMarketplaces,
      updated_at: new Date().toISOString()
    };
    const { error: sellerTokenError } = await serviceClient
      .from("seller_tokens")
      .upsert(sellerTokenRecord, { onConflict: "seller_id" });
    if (sellerTokenError) {
      return new Response(sellerTokenError.message, { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err?.message || err), { status: 500, headers: corsHeaders });
  }
});
