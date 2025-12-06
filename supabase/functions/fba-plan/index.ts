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
const SPAPI_ROLE_ARN = Deno.env.get("SPAPI_ROLE_ARN") || "";

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

async function assumeRole(roleArn: string) {
  // STS is global; sign in us-east-1
  const host = "sts.amazonaws.com";
  const method = "POST";
  const service = "sts";
  const path = "/";
  const query = "";
  const body =
    "Action=AssumeRole&RoleSessionName=spapi-session&Version=2011-06-15&RoleArn=" +
    encodeURIComponent(roleArn);

  const sigHeaders = await signRequest({
    method,
    service,
    region: "us-east-1",
    host,
    path,
    query,
    payload: body,
    accessKey: AWS_ACCESS_KEY_ID,
    secretKey: AWS_SECRET_ACCESS_KEY,
    sessionToken: AWS_SESSION_TOKEN
  });

  const res = await fetch(`https://${host}${path}`, {
    method,
    headers: {
      ...sigHeaders,
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!res.ok) throw new Error(`STS assumeRole failed: ${res.status} ${await res.text()}`);
  const xml = await res.text();
  const get = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    return m ? m[1] : "";
  };
  const accessKeyId = get("AccessKeyId");
  const secretAccessKey = get("SecretAccessKey");
  const sessionToken = get("SessionToken");
  if (!accessKeyId || !secretAccessKey || !sessionToken) {
    throw new Error("STS assumeRole missing credentials in response");
  }
  return { accessKeyId, secretAccessKey, sessionToken };
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
    if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !SPAPI_ROLE_ARN) {
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
    const { data: integRows, error: integErr } = await supabase
      .from("amazon_integrations")
      .select("refresh_token, marketplace_id, region, updated_at")
      .eq("company_id", reqData.company_id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (integErr) throw integErr;
    const integ = integRows?.[0];
    if (!integ?.refresh_token) {
      throw new Error("No active Amazon integration found for this company");
    }

    const refreshToken = integ.refresh_token;
    const marketplaceId = integ.marketplace_id || "A13V1IB3VIYZZH";
    const regionCode = (integ.region || "eu").toLowerCase();
    const awsRegion = regionCode === "na" ? "us-east-1" : regionCode === "fe" ? "us-west-2" : "eu-west-1";
    const host = regionHost(regionCode);

    // Get temp creds via STS AssumeRole
    const tempCreds = await assumeRole(SPAPI_ROLE_ARN);

    const lwaAccessToken = await getLwaAccessToken(refreshToken);

    const items: PrepRequestItem[] = (Array.isArray(reqData.prep_request_items) ? reqData.prep_request_items : []).filter(
      (it) => Number(it.units_sent ?? it.units_requested ?? 0) > 0
    );
    if (!items.length) {
      throw new Error("No items in request with quantity > 0");
    }

    // Ship-from: use destination_country for country; rest fallback defaults
    const shipFromCountry = reqData.destination_country || "FR";
    // Fulfillment Inbound v2024-03-20 createInboundPlan
    const planBody = {
      shipFromAddress: {
        name: "Prep Center",
        addressLine1: "5 Rue des Enclos, Zone B, Cellule 7",
        city: "La Gouesnière",
        stateOrProvinceCode: "",
        postalCode: "35350",
        countryCode: shipFromCountry,
        phoneNumber: "0675116218"
      },
      destinationMarketplaces: [marketplaceId],
      labelPrepPreference: "SELLER_LABEL",
      items: items.map((it) => ({
        msku: it.sku || "",
        quantity: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
        prepOwner: "SELLER",
        labelOwner: "SELLER"
      }))
    };

    const payload = JSON.stringify(planBody);
    const path = "/fba/inbound/2024-03-20/inboundPlans";
    const query = "";

    const sigHeaders = await signRequest({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path,
      query,
      payload,
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken
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
    const plans = amazonJson?.payload?.inboundPlan?.inboundShipmentPlans || amazonJson?.payload?.InboundShipmentPlans || [];

    // Map to UI format
    const packGroups = plans.map((p: any, idx: number) => {
      const itemsList = p.items || p.Items || [];
      const totalUnits = itemsList.reduce((s: number, it: any) => s + (Number(it.quantity || it.Quantity) || 0), 0);
      return {
        id: p.ShipmentId || `plan-${idx + 1}`,
        title: `Pack group ${idx + 1}`,
        skuCount: itemsList.length,
        units: totalUnits,
        boxes: 1,
        packMode: "single",
        warning: null,
        image: null,
        skus: itemsList.map((it: any, j: number) => ({
          id: it.msku || it.SellerSKU || `sku-${j + 1}`,
          qty: Number(it.quantity || it.Quantity) || 0,
          fnsku: it.fulfillmentNetworkSku || it.FulfillmentNetworkSKU || null
        }))
      };
    });

    const shipments = plans.map((p: any, idx: number) => ({
      id: p.ShipmentId || `shipment-${idx + 1}`,
      name: `Shipment ${p.ShipmentId || idx + 1}`,
      destinationFc: p.destinationFulfillmentCenterId || p.DestinationFulfillmentCenterId || null,
      items: (p.items || p.Items || []).map((it: any) => ({
        sellerSKU: it.msku || it.SellerSKU,
        fnsku: it.fulfillmentNetworkSku || it.FulfillmentNetworkSKU,
        quantity: it.quantity || it.Quantity
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
    return new Response(JSON.stringify({ error: e?.message || "Server error", detail: `${e}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
