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

function sanitizeFilePart(value: unknown) {
  return String(value || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function pickTracking(payload: any): string | null {
  const first = payload?.ShipmentResponse?.ShipmentResults?.PackageResults;
  const fromObj = Array.isArray(first) ? first[0] : first;
  return (
    fromObj?.TrackingNumber ||
    payload?.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber ||
    null
  );
}

function pickLabelBase64(payload: any): string | null {
  const first = payload?.ShipmentResponse?.ShipmentResults?.PackageResults;
  const fromObj = Array.isArray(first) ? first[0] : first;
  return (
    fromObj?.ShippingLabel?.GraphicImage ||
    fromObj?.ShippingLabel?.HTMLImage ||
    payload?.ShipmentResponse?.ShipmentResults?.LabelImage?.GraphicImage ||
    null
  );
}

function pickCharge(payload: any): { amount: number | null; currency: string | null } {
  const charges = payload?.ShipmentResponse?.ShipmentResults?.ShipmentCharges?.TotalCharges;
  const amountRaw = charges?.MonetaryValue;
  const amount = amountRaw != null ? Number(amountRaw) : null;
  const currency = charges?.CurrencyCode || null;
  return { amount: Number.isFinite(amount as number) ? amount : null, currency };
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
  const orderId = String(payload?.order_id || "").trim();
  if (!orderId) return jsonResponse({ error: "Missing order_id." }, 400);

  const { data: order, error: orderError } = await serviceClient
    .from("ups_shipping_orders")
    .select("*, integration:ups_integrations(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) return jsonResponse({ error: orderError?.message || "Order not found." }, 404);

  let isAdmin = false;
  const { data: requesterProfile } = await serviceClient
    .from("profiles")
    .select("is_admin, is_limited_admin, company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (requesterProfile?.is_admin && !requesterProfile?.is_limited_admin) isAdmin = true;

  const sameOwner = user.id === order.user_id;
  const sameCompany = Boolean(requesterProfile?.company_id && requesterProfile.company_id === order.company_id);
  if (!isAdmin && !sameOwner && !sameCompany) {
    return jsonResponse({ error: "Not authorized for this order." }, 403);
  }

  const integration = order.integration;
  if (!integration) return jsonResponse({ error: "Missing UPS integration for order." }, 400);

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

  if (!accessToken) {
    return jsonResponse({ error: "Failed to obtain UPS access token." }, 502);
  }

  const shipFrom = order?.ship_from || {};
  const shipTo = order?.ship_to || {};
  const pkg = order?.package_data || {};

  const shipmentPayload = {
    ShipmentRequest: {
      Request: {
        RequestOption: "nonvalidate",
        TransactionReference: {
          CustomerContext: order.external_order_id || order.id
        }
      },
      Shipment: {
        Description: "PrepCenter shipment",
        Shipper: {
          Name: shipFrom.name || "PrepCenter",
          ShipperNumber: integration.ups_account_number || "",
          Address: {
            AddressLine: [shipFrom.address1 || ""],
            City: shipFrom.city || "",
            PostalCode: shipFrom.postal_code || "",
            CountryCode: (shipFrom.country_code || "FR").toUpperCase()
          }
        },
        ShipTo: {
          Name: shipTo.name || "Recipient",
          Address: {
            AddressLine: [shipTo.address1 || ""],
            City: shipTo.city || "",
            PostalCode: shipTo.postal_code || "",
            CountryCode: (shipTo.country_code || "FR").toUpperCase()
          }
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: "01",
            BillShipper: {
              AccountNumber: integration.ups_account_number || ""
            }
          }
        },
        Service: {
          Code: String(order.service_code || "11")
        },
        Package: {
          PackagingType: { Code: String(order.packaging_type || "02") },
          PackageWeight: {
            UnitOfMeasurement: { Code: "KGS" },
            Weight: String(Math.max(0.01, Number(pkg.weight_kg || 1)))
          },
          Dimensions:
            Number(pkg.length_cm) > 0 && Number(pkg.width_cm) > 0 && Number(pkg.height_cm) > 0
              ? {
                  UnitOfMeasurement: { Code: "CM" },
                  Length: String(Number(pkg.length_cm)),
                  Width: String(Number(pkg.width_cm)),
                  Height: String(Number(pkg.height_cm))
                }
              : undefined
        }
      },
      LabelSpecification: {
        LabelImageFormat: {
          Code: "GIF"
        },
        HTTPUserAgent: "PrepCenterApp"
      }
    }
  };

  const response = await fetch(`${UPS_BASE_URL}/api/shipments/v2403/ship`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      transId: crypto.randomUUID(),
      transactionSrc: "prep-center"
    },
    body: JSON.stringify(shipmentPayload)
  });

  const responseText = await response.text();
  let responseJson: any = null;
  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = { raw: responseText };
  }

  if (!response.ok) {
    await serviceClient
      .from("ups_shipping_orders")
      .update({
        status: "error",
        last_error: responseText || `UPS API error (${response.status})`,
        response_payload: responseJson,
        updated_at: new Date().toISOString()
      })
      .eq("id", order.id);

    return jsonResponse(
      {
        error: responseText || `UPS API error (${response.status})`,
        status: response.status,
        token_source: tokenSource
      },
      502
    );
  }

  const tracking = pickTracking(responseJson);
  const labelBase64 = pickLabelBase64(responseJson);
  const charge = pickCharge(responseJson);

  let labelFilePath: string | null = null;
  if (labelBase64) {
    const bytes = Uint8Array.from(atob(String(labelBase64)), (c) => c.charCodeAt(0));
    const fileName = `${sanitizeFilePart(order.external_order_id || order.id)}-${Date.now()}.gif`;
    const filePath = `${order.company_id || order.user_id}/labels/${fileName}`;
    const upload = await serviceClient.storage
      .from("ups-documents")
      .upload(filePath, bytes, {
        upsert: true,
        contentType: "image/gif",
        cacheControl: "3600"
      });
    if (!upload.error) {
      labelFilePath = filePath;
    }
  }

  const { error: updateError } = await serviceClient
    .from("ups_shipping_orders")
    .update({
      status: labelFilePath ? "label_created" : "completed",
      tracking_number: tracking || null,
      total_charge: charge.amount,
      currency: charge.currency,
      label_file_path: labelFilePath,
      label_format: labelFilePath ? "gif" : null,
      response_payload: responseJson,
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", order.id);

  if (updateError) {
    return jsonResponse({ error: updateError.message || "Failed to update order after UPS response." }, 500);
  }

  // Keep client UPS invoices populated automatically after label creation.
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const fallbackSuffix = String(order.external_order_id || order.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  const invoiceNumber = `UPS-${invoiceDate}-${tracking || fallbackSuffix || crypto.randomUUID().slice(0, 8)}`;
  const invoicePayload = {
    ...(order.response_payload || {}),
    ups_label_created_at: new Date().toISOString(),
    tracking_number: tracking || null,
    external_order_id: order.external_order_id || null,
    sync_source: "ups-create-label"
  };

  const { data: existingInvoice } = await serviceClient
    .from("ups_invoice_files")
    .select("id")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingInvoice?.id) {
    await serviceClient
      .from("ups_invoice_files")
      .update({
        integration_id: order.integration_id,
        user_id: order.user_id,
        company_id: order.company_id || null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        currency: charge.currency || order.currency || "EUR",
        amount_total: charge.amount ?? order.total_charge ?? null,
        source: "ups-auto",
        status: "received",
        payload: invoicePayload,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingInvoice.id);
  } else {
    await serviceClient
      .from("ups_invoice_files")
      .insert({
        integration_id: order.integration_id,
        order_id: order.id,
        user_id: order.user_id,
        company_id: order.company_id || null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        currency: charge.currency || order.currency || "EUR",
        amount_total: charge.amount ?? order.total_charge ?? null,
        file_path: null,
        file_name: null,
        source: "ups-auto",
        status: "received",
        payload: invoicePayload
      });
  }

  return jsonResponse({
    ok: true,
    order_id: order.id,
    tracking_number: tracking || null,
    label_file_path: labelFilePath,
    total_charge: charge.amount,
    currency: charge.currency,
    token_source: tokenSource
  });
});
