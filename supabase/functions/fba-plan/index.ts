// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const LWA_CLIENT_ID = Deno.env.get("SPAPI_LWA_CLIENT_ID") || "";
const LWA_CLIENT_SECRET = Deno.env.get("SPAPI_LWA_CLIENT_SECRET") || "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
const AWS_SESSION_TOKEN = Deno.env.get("AWS_SESSION_TOKEN") || null;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type PrepRequestItem = {
  id: string;
  asin: string | null;
  sku: string | null;
  product_name: string | null;
  units_requested: number | null;
  units_sent: number | null;
};

type AmazonIntegration = {
  user_id: string | null;
  company_id: string | null;
  marketplace_id: string;
  region: string;
  refresh_token: string;
};

// Helpers for SigV4
function toHex(buffer: ArrayBuffer): string {
  return Array.prototype.map
    .call(new Uint8Array(buffer), (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder().encode(data);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, enc);
}

async function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + secret), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

async function signRequest(opts: {
  method: string;
  service: string;
  region: string;
  host: string;
  path: string;
  query: string;
  payload: string;
  accessKey: string;
  secretKey: string;
  sessionToken?: string | null;
}) {
  const { method, service, region, host, path, query, payload, accessKey, secretKey, sessionToken } = opts;
  const t = new Date();
  const amzDate = t.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const hashedPayload = await sha256(payload);
  const canonicalHeaders =
    "host:" + host + "\n" + "x-amz-date:" + amzDate + "\n" + (sessionToken ? "x-amz-security-token:" + sessionToken + "\n" : "");
  const signedHeaders = sessionToken ? "host;x-amz-date;x-amz-security-token" : "host;x-amz-date";
  const canonicalRequest =
    method +
    "\n" +
    path +
    "\n" +
    query +
    "\n" +
    canonicalHeaders +
    "\n" +
    signedHeaders +
    "\n" +
    hashedPayload;

  const credentialScope = dateStamp + "/" + region + "/" + service + "/aws4_request";
  const stringToSign =
    "AWS4-HMAC-SHA256\n" + amzDate + "\n" + credentialScope + "\n" + (await sha256(canonicalRequest));

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorizationHeader =
    "AWS4-HMAC-SHA256 " +
    "Credential=" +
    accessKey +
    "/" +
    credentialScope +
    ", SignedHeaders=" +
    signedHeaders +
    ", Signature=" +
    signature;

  const headers: Record<string, string> = {
    Authorization: authorizationHeader,
    "x-amz-date": amzDate,
    "content-type": "application/json"
  };
  if (sessionToken) {
    headers["x-amz-security-token"] = sessionToken;
  }

  return headers;
}

async function getLwaAccessToken(refreshToken: string) {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: LWA_CLIENT_ID,
      client_secret: LWA_CLIENT_SECRET
    })
  });
  if (!res.ok) throw new Error(`LWA token failed: ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error("Missing access_token");
  return json.access_token as string;
}

function regionHost(region: string) {
  switch ((region || "eu").toLowerCase()) {
    case "na":
      return "sellingpartnerapi-na.amazon.com";
    case "fe":
      return "sellingpartnerapi-fe.amazon.com";
    default:
      return "sellingpartnerapi-eu.amazon.com";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }
    if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error("Missing SP-API environment variables");
    }

    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id as string | undefined;
    if (!requestId) {
      return new Response(JSON.stringify({ error: "request_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Fetch prep request + items
    const { data: reqData, error: reqErr } = await supabase
      .from("prep_requests")
      .select(
        "id, destination_country, company_id, user_id, prep_request_items(id, asin, sku, product_name, units_requested, units_sent)"
      )
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!reqData) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Fetch amazon integration for this user/company
    const { data: integ, error: integErr } = await supabase
      .from("amazon_integrations")
      .select("refresh_token, marketplace_id, region")
      .eq("company_id", reqData.company_id)
      .eq("status", "active")
      .maybeSingle();
    if (integErr) throw integErr;
    if (!integ?.refresh_token) {
      throw new Error("No active Amazon integration found for this company");
    }

    const refreshToken = integ.refresh_token;
    const marketplaceId = integ.marketplace_id || "A13V1IB3VIYZZH";
    const region = integ.region || "eu";
    const host = regionHost(region);

    const lwaAccessToken = await getLwaAccessToken(refreshToken);

    const items: PrepRequestItem[] = Array.isArray(reqData.prep_request_items)
      ? reqData.prep_request_items
      : [];
    if (!items.length) {
      throw new Error("No items in request");
    }

    const planBody = {
      ShipFromAddress: {
        Name: "Prep Center",
        AddressLine1: "Address",
        City: "City",
        CountryCode: reqData.destination_country || "FR"
      },
      InboundShipmentPlanRequestItems: items.map((it) => ({
        SellerSKU: it.sku || "",
        Quantity: Number(it.units_sent ?? it.units_requested ?? 0) || 0
      })),
      LabelPrepPreference: "SELLER_LABEL"
    };

    const payload = JSON.stringify(planBody);
    const path = "/fba/inbound/v0/plans";
    const query = marketplaceId ? `MarketplaceId=${encodeURIComponent(marketplaceId)}` : "";

    const sigHeaders = await signRequest({
      method: "POST",
      service: "execute-api",
      region,
      host,
      path,
      query,
      payload,
      accessKey: AWS_ACCESS_KEY_ID,
      secretKey: AWS_SECRET_ACCESS_KEY,
      sessionToken: AWS_SESSION_TOKEN
    });

    const res = await fetch(`https://${host}${path}${query ? `?${query}` : ""}`, {
      method: "POST",
      headers: {
        ...sigHeaders,
        "x-amz-access-token": lwaAccessToken
      },
      body: payload
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Amazon plan error ${res.status}: ${text}`);
    }
    const amazonJson = text ? JSON.parse(text) : {};
    const plans = amazonJson?.payload?.InboundShipmentPlans || [];

    // Map to UI format
    const packGroups = plans.map((p: any, idx: number) => {
      const totalUnits = (p.Items || []).reduce((s: number, it: any) => s + (Number(it.Quantity) || 0), 0);
      return {
        id: p.ShipmentId || `plan-${idx + 1}`,
        title: `Pack group ${idx + 1}`,
        skuCount: (p.Items || []).length,
        units: totalUnits,
        boxes: 1,
        packMode: "single",
        warning: null,
        image: null,
        skus: (p.Items || []).map((it: any, j: number) => ({
          id: it.SellerSKU || `sku-${j + 1}`,
          qty: Number(it.Quantity) || 0,
          fnsku: it.FulfillmentNetworkSKU || null
        }))
      };
    });

    const shipments = plans.map((p: any, idx: number) => ({
      id: p.ShipmentId || `shipment-${idx + 1}`,
      name: `Shipment ${p.ShipmentId || idx + 1}`,
      destinationFc: p.DestinationFulfillmentCenterId || null,
      items: (p.Items || []).map((it: any) => ({
        sellerSKU: it.SellerSKU,
        fnsku: it.FulfillmentNetworkSKU,
        quantity: it.Quantity
      }))
    }));

    const plan = {
      source: "amazon",
      marketplace: marketplaceId,
      shipFrom: {
        name: "Prep Center",
        address: reqData.destination_country || "FR"
      },
      packGroups,
      shipments,
      raw: amazonJson
    };

    return new Response(JSON.stringify({ plan }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  } catch (e) {
    console.error("fba-plan error", e);
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
