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

function sanitizePhone(value: unknown) {
  return String(value || "").replace(/[^\d]/g, "").slice(0, 15);
}

function normalizeTime(value: unknown, fallback: string) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (/^\d{4}$/.test(digits)) return digits;
  if (/^\d{3}$/.test(digits)) return `0${digits}`;
  return fallback;
}

function toPickupServiceCode(value: unknown) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "008";
  return digits.padStart(3, "0").slice(-3);
}

function extractUpsErrorMessages(payload: any) {
  const out: string[] = [];
  const pushIf = (value: unknown) => {
    const text = String(value || "").trim();
    if (text && !out.includes(text)) out.push(text);
  };

  const faultErrors = payload?.Fault?.detail?.Errors;
  const faultList = Array.isArray(faultErrors) ? faultErrors : faultErrors ? [faultErrors] : [];
  faultList.forEach((err: any) => {
    pushIf(err?.Code);
    pushIf(err?.Message);
  });

  const alerts = payload?.PickupCreationResponse?.Response?.Alert;
  const alertList = Array.isArray(alerts) ? alerts : alerts ? [alerts] : [];
  alertList.forEach((row: any) => {
    pushIf(row?.Code);
    pushIf(row?.Description);
  });

  const responseErrors = payload?.response?.errors;
  const responseList = Array.isArray(responseErrors) ? responseErrors : responseErrors ? [responseErrors] : [];
  responseList.forEach((err: any) => {
    pushIf(err?.code);
    pushIf(err?.message);
  });

  return out;
}

function pickPickupCharge(payload: any) {
  const rateResult = payload?.PickupCreationResponse?.RateResult || {};
  const amountRaw = rateResult?.GrandTotalOfAllCharge || null;
  const amount = amountRaw != null ? Number(amountRaw) : null;
  const currency = String(rateResult?.CurrencyCode || "").trim() || null;
  return {
    amount: Number.isFinite(amount as number) ? amount : null,
    currency
  };
}

function pickPickupPrn(payload: any) {
  return String(payload?.PickupCreationResponse?.PRN || "").trim() || null;
}

async function fetchUpsToken({ refreshToken }: { refreshToken?: string | null }) {
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

  try {
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
    const pickupRequestId = String(body?.pickup_request_id || "").trim();
    if (!pickupRequestId) return jsonResponse({ error: "Missing pickup_request_id." }, 400);

    const { data: pickupRequest, error: pickupError } = await serviceClient
      .from("ups_pickup_requests")
      .select("*, integration:ups_integrations(*)")
      .eq("id", pickupRequestId)
      .maybeSingle();

    if (pickupError || !pickupRequest) {
      return jsonResponse({ error: pickupError?.message || "Pickup request not found." }, 404);
    }

    const { data: requesterProfile } = await serviceClient
      .from("profiles")
      .select("is_admin, is_limited_admin, company_id")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = Boolean(requesterProfile?.is_admin && !requesterProfile?.is_limited_admin);
    const sameOwner = user.id === pickupRequest.user_id;
    const sameCompany = Boolean(requesterProfile?.company_id && requesterProfile.company_id === pickupRequest.company_id);
    if (!isAdmin && !sameOwner && !sameCompany) {
      return jsonResponse({ error: "Not authorized for this pickup request." }, 403);
    }

    const integration = pickupRequest.integration;
    if (!integration) return jsonResponse({ error: "Missing UPS integration for pickup request." }, 400);

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

    const pickupAddress = pickupRequest?.pickup_address || {};
    const packageCount = Math.max(1, Number(pickupRequest.package_count || 1));
    const totalWeight = Math.max(0.001, Number(pickupRequest.total_weight || 0.001));
    const weightUnit = String(pickupRequest.weight_unit || "KGS").trim().toUpperCase() || "KGS";
    const serviceCode = toPickupServiceCode(pickupRequest.service_code || "008");
    const destinationCountryCode =
      String(pickupRequest.destination_country_code || pickupRequest.warehouse_country || pickupAddress.country_code || "FR")
        .trim()
        .toUpperCase() || "FR";
    const containerCode = String(pickupRequest.container_code || "01").trim() || "01";
    const pickupDate =
      String(pickupRequest.pickup_date || "").trim() || new Date(Date.now() + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    const readyTime = normalizeTime(pickupRequest.ready_time, "0900");
    const closeTime = normalizeTime(pickupRequest.close_time, "1700");
    const contactName = String(
      pickupAddress.contact_name ||
        [pickupAddress.contact_first_name, pickupAddress.contact_last_name].filter(Boolean).join(" ")
    ).trim();
    const phoneNumber = sanitizePhone(pickupAddress.phone || pickupAddress.phone_number);

    const requestPayload = {
      PickupCreationRequest: {
        RatePickupIndicator: "N",
        Shipper: {
          Account: {
            AccountNumber: integration.ups_account_number || "",
            AccountCountryCode: String(pickupAddress.country_code || pickupRequest.warehouse_country || "FR").trim().toUpperCase()
          }
        },
        PickupDateInfo: {
          CloseTime: closeTime,
          ReadyTime: readyTime,
          PickupDate: pickupDate.replace(/[^\d]/g, "")
        },
        PickupAddress: {
          CompanyName: String(pickupAddress.company_name || "Prep Center").trim(),
          ContactName: contactName,
          AddressLine: String(pickupAddress.address1 || "").trim(),
          City: String(pickupAddress.city || "").trim(),
          PostalCode: String(pickupAddress.postal_code || "").trim(),
          CountryCode: String(pickupAddress.country_code || pickupRequest.warehouse_country || "FR").trim().toUpperCase(),
          ...(phoneNumber ? { Phone: { Number: phoneNumber } } : {})
        },
        AlternateAddressIndicator: "Y",
        PickupPiece: [
          {
            ServiceCode: serviceCode,
            Quantity: String(packageCount),
            DestinationCountryCode: destinationCountryCode,
            ContainerCode: containerCode
          }
        ],
        TotalWeight: {
          Weight: String(totalWeight),
          UnitOfMeasurement: weightUnit
        },
        OverweightIndicator: totalWeight > 32 ? "Y" : "N",
        PaymentMethod: "01",
        ReferenceNumber: String(pickupRequest.reference_number || pickupRequest.id).trim()
      }
    };

    const transId = crypto.randomUUID();
    const response = await fetch(`${UPS_BASE_URL}/api/pickupcreation/v2409/pickup`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        transId,
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

    const upsMessages = extractUpsErrorMessages(responseJson);
    if (!response.ok) {
      await serviceClient
        .from("ups_pickup_requests")
        .update({
          status: "error",
          request_payload: requestPayload,
          response_payload: responseJson,
          last_error: responseText || `UPS Pickup API error (${response.status})`,
          updated_at: new Date().toISOString()
        })
        .eq("id", pickupRequest.id);

      return jsonResponse(
        {
          error: responseText || `UPS Pickup API error (${response.status})`,
          status: response.status,
          token_source: tokenSource,
          trans_id: transId,
          ups_messages: upsMessages
        },
        502
      );
    }

    const prn = pickPickupPrn(responseJson);
    const charge = pickPickupCharge(responseJson);

    await serviceClient
      .from("ups_pickup_requests")
      .update({
        status: prn ? "confirmed" : "submitted",
        prn,
        total_charge: charge.amount,
        currency: charge.currency,
        request_payload: requestPayload,
        response_payload: responseJson,
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", pickupRequest.id);

    return jsonResponse({
      ok: true,
      pickup_request_id: pickupRequest.id,
      prn,
      total_charge: charge.amount,
      currency: charge.currency,
      token_source: tokenSource,
      trans_id: transId,
      ups_messages: upsMessages
    });
  } catch (error) {
    console.error("ups-create-pickup unhandled error", {
      error: error instanceof Error ? error.message : String(error)
    });
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unexpected error while creating UPS pickup."
      },
      500
    );
  }
});
