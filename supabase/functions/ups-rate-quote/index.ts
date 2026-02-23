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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function toBase64(text: string) {
  return btoa(text);
}

function b64UrlDecodeToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function deriveKey(secret: string) {
  if (!secret || secret.length < 32) return null;
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret).slice(0, 32);
  return await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt", "encrypt"]);
}

async function decryptMaybe(secret: string, value: string | null | undefined, encrypted = true) {
  if (!value) return null;
  if (!encrypted) return value;
  const key = await deriveKey(secret);
  if (!key) return value;
  const [ivPart, cipherPart] = String(value).split(".");
  if (!ivPart || !cipherPart) return value;
  const iv = b64UrlDecodeToBytes(ivPart);
  const cipher = b64UrlDecodeToBytes(cipherPart);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

async function encryptMaybe(secret: string, value: string | null | undefined) {
  if (!value) return { value: null, encrypted: false };
  const key = await deriveKey(secret);
  if (!key) return { value, encrypted: false };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipher))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { value: `${ivB64}.${cipherB64}`, encrypted: true };
}

function asNumberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractRateQuote(payload: any, preferredServiceCode?: string | null) {
  const rated = payload?.RateResponse?.RatedShipment;
  const rows = Array.isArray(rated) ? rated : rated ? [rated] : [];
  if (!rows.length) return null;
  const preferred = rows.find((row) => String(row?.Service?.Code || "") === String(preferredServiceCode || ""));
  const row = preferred || rows[0];
  const total = row?.TotalCharges || row?.NegotiatedRateCharges?.TotalCharge || null;
  const amountRaw = total?.MonetaryValue;
  const amount = amountRaw != null ? Number(amountRaw) : null;
  const currency = String(total?.CurrencyCode || "").trim() || null;
  return {
    service_code: String(row?.Service?.Code || preferredServiceCode || "").trim() || null,
    amount: Number.isFinite(amount as number) ? amount : null,
    currency
  };
}

async function fetchUpsToken({
  refreshToken
}: {
  refreshToken?: string | null;
}) {
  const endpoint = `${UPS_BASE_URL}/security/v1/oauth/token`;
  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    authorization: `Basic ${toBase64(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`)}`
  };

  if (refreshToken) {
    const refreshRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
    });
    if (refreshRes.ok) {
      const json = await refreshRes.json();
      const accessToken = String(json?.access_token || "").trim();
      if (accessToken) return { token: accessToken, source: "refresh", payload: json };
    }
  }

  const clientRes = await fetch(endpoint, {
    method: "POST",
    headers,
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });
  if (!clientRes.ok) {
    const txt = await clientRes.text();
    throw new Error(`UPS token request failed: ${txt || clientRes.statusText}`);
  }
  const json = await clientRes.json();
  const accessToken = String(json?.access_token || "").trim();
  if (!accessToken) throw new Error("UPS token response missing access_token.");
  return { token: accessToken, source: "client_credentials", payload: json };
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

  const body = await req.json().catch(() => ({}));
  const integrationId = String(body?.integration_id || "").trim();
  if (!integrationId) return jsonResponse({ error: "Missing integration_id." }, 400);

  const shipFrom = body?.ship_from || {};
  const shipTo = body?.ship_to || {};
  const packageData = body?.package_data || {};
  const serviceCode = String(body?.service_code || "11").trim();

  const required = [
    shipFrom?.postal_code,
    shipFrom?.country_code,
    shipTo?.postal_code,
    shipTo?.country_code,
    packageData?.weight_kg
  ];
  if (required.some((x) => String(x || "").trim() === "")) {
    return jsonResponse({ error: "Missing required fields for rate quote (from/to postal+country, weight)." }, 400);
  }

  const { data: integration, error: integrationError } = await serviceClient
    .from("ups_integrations")
    .select("*")
    .eq("id", integrationId)
    .maybeSingle();

  if (integrationError || !integration) {
    return jsonResponse({ error: integrationError?.message || "UPS integration not found." }, 404);
  }

  const { data: requesterProfile } = await serviceClient
    .from("profiles")
    .select("is_admin, is_limited_admin, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = Boolean(requesterProfile?.is_admin && !requesterProfile?.is_limited_admin);
  const sameOwner = user.id === integration.user_id;
  const sameCompany = Boolean(requesterProfile?.company_id && requesterProfile.company_id === integration.company_id);
  if (!isAdmin && !sameOwner && !sameCompany) {
    return jsonResponse({ error: "Not authorized for this UPS integration." }, 403);
  }

  const oauthMeta = integration?.metadata?.ups_oauth || {};
  const tokenEncrypted = Boolean(oauthMeta?.encrypted);
  let accessToken = await decryptMaybe(UPS_ENC_KEY, oauthMeta?.access_token || null, tokenEncrypted);
  const refreshToken = await decryptMaybe(UPS_ENC_KEY, oauthMeta?.refresh_token || null, tokenEncrypted);

  const tokenExpiresAt = oauthMeta?.expires_at ? new Date(oauthMeta.expires_at).getTime() : 0;
  const tokenValid = accessToken && tokenExpiresAt && tokenExpiresAt > Date.now() + 60_000;
  let tokenSource = "cached";
  let tokenPayload: any = null;

  if (!tokenValid) {
    const fetched = await fetchUpsToken({ refreshToken });
    accessToken = fetched.token;
    tokenSource = fetched.source;
    tokenPayload = fetched.payload;

    const expiresIn = Number(tokenPayload?.expires_in || tokenPayload?.expiresIn || 0) || null;
    const refreshExpiresIn = Number(tokenPayload?.refresh_expires_in || tokenPayload?.refreshExpiresIn || 0) || null;
    const nextAccessExp = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const nextRefreshExp = refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : oauthMeta?.refresh_expires_at || null;
    const nextRefresh = String(tokenPayload?.refresh_token || tokenPayload?.refreshToken || "").trim() || refreshToken;

    const encAccess = await encryptMaybe(UPS_ENC_KEY, accessToken);
    const encRefresh = await encryptMaybe(UPS_ENC_KEY, nextRefresh || null);

    const metadata = {
      ...(integration?.metadata || {}),
      ups_oauth: {
        ...(oauthMeta || {}),
        access_token: encAccess.value,
        refresh_token: encRefresh.value,
        encrypted: Boolean(encAccess.encrypted || encRefresh.encrypted),
        token_type: tokenPayload?.token_type || oauthMeta?.token_type || "Bearer",
        scope: tokenPayload?.scope || oauthMeta?.scope || null,
        expires_at: nextAccessExp,
        refresh_expires_at: nextRefreshExp,
        updated_at: new Date().toISOString()
      }
    };

    await serviceClient
      .from("ups_integrations")
      .update({
        metadata,
        status: "active",
        oauth_scope: tokenPayload?.scope || integration?.oauth_scope || null,
        last_error: null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", integration.id);
  }

  if (!accessToken) return jsonResponse({ error: "Failed to obtain UPS access token." }, 502);

  const weight = Math.max(0.01, Number(packageData?.weight_kg || 0.01));
  const length = asNumberOrNull(packageData?.length_cm);
  const width = asNumberOrNull(packageData?.width_cm);
  const height = asNumberOrNull(packageData?.height_cm);

  const requestPayload = {
    RateRequest: {
      Request: {
        RequestOption: "Rate",
        TransactionReference: {
          CustomerContext: String(body?.reference_code || "prep-center-rate-quote")
        }
      },
      Shipment: {
        Shipper: {
          ShipperNumber: integration.ups_account_number || "",
          Address: {
            PostalCode: String(shipFrom?.postal_code || "").trim(),
            CountryCode: String(shipFrom?.country_code || "FR").trim().toUpperCase()
          }
        },
        ShipFrom: {
          Address: {
            PostalCode: String(shipFrom?.postal_code || "").trim(),
            CountryCode: String(shipFrom?.country_code || "FR").trim().toUpperCase()
          }
        },
        ShipTo: {
          Address: {
            PostalCode: String(shipTo?.postal_code || "").trim(),
            CountryCode: String(shipTo?.country_code || "FR").trim().toUpperCase()
          }
        },
        Service: {
          Code: serviceCode || "11"
        },
        ShipmentRatingOptions: {
          NegotiatedRatesIndicator: ""
        },
        Package: [
          {
            PackagingType: { Code: String(body?.packaging_type || packageData?.packaging_type || "02") },
            PackageWeight: {
              UnitOfMeasurement: { Code: "KGS" },
              Weight: String(weight)
            },
            ...(length && width && height
              ? {
                  Dimensions: {
                    UnitOfMeasurement: { Code: "CM" },
                    Length: String(length),
                    Width: String(width),
                    Height: String(height)
                  }
                }
              : {})
          }
        ]
      }
    }
  };

  const response = await fetch(`${UPS_BASE_URL}/api/rating/v2409/Rate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      transId: crypto.randomUUID(),
      transactionSrc: "prep-center"
    },
    body: JSON.stringify(requestPayload)
  });

  const responseText = await response.text();
  let responseJson: any = null;
  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = { raw: responseText };
  }

  if (!response.ok) {
    return jsonResponse(
      {
        error: responseText || `UPS Rating API error (${response.status})`,
        status: response.status,
        token_source: tokenSource,
        promo_supported: false
      },
      502
    );
  }

  const quote = extractRateQuote(responseJson, serviceCode);
  return jsonResponse({
    ok: true,
    quote,
    token_source: tokenSource,
    promo_supported: false,
    promo_note:
      "UPS Rating/Shipping API does not expose a dedicated promo-code validation field. Final charge is based on account rates/negotiated rates."
  });
});

