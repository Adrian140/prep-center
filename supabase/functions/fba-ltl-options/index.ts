// Edge Function: fba-ltl-options
// Scope: pallet-only LTL/FTL transportation options (generate + list + confirm)
// Does not touch SPD flow. Uses SP-API v2024-03-20.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE") ||
  "";
const INTERNAL_SERVICE_ROLE_KEY = Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") || "";
const LWA_CLIENT_ID = Deno.env.get("SPAPI_LWA_CLIENT_ID") || "";
const LWA_CLIENT_SECRET = Deno.env.get("SPAPI_LWA_CLIENT_SECRET") || "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
const AWS_SESSION_TOKEN = Deno.env.get("AWS_SESSION_TOKEN") || null;
const SPAPI_ROLE_ARN = Deno.env.get("SPAPI_ROLE_ARN") || "";
const SUPABASE_SELLER_ID = Deno.env.get("SPAPI_SELLER_ID") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type AmazonIntegration = {
  id?: string;
  user_id: string | null;
  company_id: string | null;
  marketplace_id: string;
  region: string;
  refresh_token: string;
  selling_partner_id?: string | null;
};

type TempCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
};

const BASE_PATH = "/inbound/fba/2024-03-20";

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

function awsPercentEncode(str: string) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function canonicalizeQuery(query: string) {
  if (!query) return "";
  const pairs = query
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const [k, v = ""] = part.split("=");
      return { key: decodeURIComponent(k), value: decodeURIComponent(v) };
    });
  pairs.sort((a, b) => (a.key === b.key ? a.value.localeCompare(b.value) : a.key.localeCompare(b.key)));
  return pairs.map((p) => `${awsPercentEncode(p.key)}=${awsPercentEncode(p.value)}`).join("&");
}

async function assumeRole(roleArn: string): Promise<TempCreds> {
  const res = await fetch("https://sts.amazonaws.com/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body:
      `Action=AssumeRole&RoleSessionName=ltl_options_session&Version=2011-06-15&RoleArn=${encodeURIComponent(roleArn)}` +
      (AWS_SESSION_TOKEN ? `&Token=${encodeURIComponent(AWS_SESSION_TOKEN)}` : "")
  });
  if (!res.ok) throw new Error(`STS assumeRole failed ${res.status}`);
  const text = await res.text();
  const accessKeyId = text.match(/<AccessKeyId>([^<]+)<\/AccessKeyId>/)?.[1] || "";
  const secretAccessKey = text.match(/<SecretAccessKey>([^<]+)<\/SecretAccessKey>/)?.[1] || "";
  const sessionToken = text.match(/<SessionToken>([^<]+)<\/SessionToken>/)?.[1] || null;
  if (!accessKeyId || !secretAccessKey) throw new Error("STS assumeRole missing creds");
  return { accessKeyId, secretAccessKey, sessionToken };
}

async function getLwaAccessToken(refreshToken: string) {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}&client_id=${encodeURIComponent(
      LWA_CLIENT_ID
    )}&client_secret=${encodeURIComponent(LWA_CLIENT_SECRET)}`
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`LWA token error: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

async function signedFetch(opts: {
  method: string;
  service: string;
  region: string;
  host: string;
  path: string;
  query: string;
  payload: string;
  accessKey: string;
  secretKey: string;
  sessionToken: string | null;
  lwaToken: string;
  traceId?: string;
  operationName?: string;
  marketplaceId?: string;
  sellerId?: string | null;
}) {
  const {
    method,
    service,
    region,
    host,
    path,
    query,
    payload,
    accessKey,
    secretKey,
    sessionToken,
    lwaToken,
    traceId,
    operationName,
    marketplaceId,
    sellerId
  } = opts;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = path;
  const canonicalQuery = canonicalizeQuery(query);
  const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload || ""));
  const payloadHex = Array.from(new Uint8Array(payloadHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n` +
    (sessionToken ? `x-amz-security-token:${sessionToken}\n` : "") +
    (traceId ? `x-amz-request-id:${traceId}\n` : "");
  const signedHeaders =
    "content-type;host;x-amz-date" + (sessionToken ? ";x-amz-security-token" : "") + (traceId ? ";x-amz-request-id" : "");
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHex}`;
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);
  const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
    Authorization: authorizationHeader,
    "x-amz-access-token": lwaToken
  };
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;
  if (traceId) headers["x-amz-request-id"] = traceId;
  if (marketplaceId) headers["x-amz-marketplace-id"] = marketplaceId;
  if (sellerId) headers["x-amz-seller-id"] = sellerId;

  const url = `https://${host}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const res = await fetch(url, { method, headers, body: payload && payload !== "{}" ? payload : undefined });
  let json: any = null;
  try {
    json = await res.json();
  } catch (_e) {
    // ignore
  }
  return { res, json, url, headers };
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(key: ArrayBuffer, data: string) {
  const enc = new TextEncoder().encode(data);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

async function hmac(key: string | ArrayBuffer, data: string) {
  const enc = new TextEncoder().encode(typeof key === "string" ? key : new Uint8Array(key));
  const cryptoKey = await crypto.subtle.importKey("raw", enc, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return sig;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const jsonResponse = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json"
    }
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const traceId = crypto.randomUUID();
  const path = url.pathname;

  try {
    const body = req.method === "POST" ? await req.json() : {};
    const {
      company_id,
      inboundPlanId,
      placementOptionId,
      shipmentId,
      readyToShipDate,
      pallets,
      freightClass,
      declaredValue,
      stackability,
      amazonIntegrationId
    } = body || {};

    if (!company_id || !inboundPlanId || !placementOptionId || !shipmentId || !readyToShipDate) {
      return jsonResponse({ error: "Missing required fields", traceId }, 400);
    }

    // Fetch integration
    const { data: integRows } = await supabase
      .from("amazon_integrations")
      .select("id, refresh_token, marketplace_id, region, selling_partner_id, status, company_id")
      .eq("company_id", company_id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1);
    const integ = (integRows?.[0] as AmazonIntegration) || null;
    if (!integ?.refresh_token) {
      return jsonResponse({ error: "No active Amazon integration found", traceId }, 404);
    }

    const marketplaceId = integ.marketplace_id || "A13V1IB3VIYZZH";
    const regionCode = (integ.region || "eu").toLowerCase();
    const awsRegion = regionCode === "na" ? "us-east-1" : regionCode === "fe" ? "us-west-2" : "eu-west-1";
    const host = regionHost(regionCode);
    const sellerId = integ.selling_partner_id || SUPABASE_SELLER_ID || null;
    if (!sellerId) {
      return jsonResponse({ error: "Missing seller id", traceId }, 400);
    }

    const tempCreds = await assumeRole(SPAPI_ROLE_ARN);
    const lwaToken = await getLwaAccessToken(integ.refresh_token);

    const palletPayload = Array.isArray(pallets) && pallets.length
      ? pallets
      : [
          {
            quantity: 1,
            dimensions: { length: 47.24, width: 31.5, height: 47.24, unit: "IN" }, // default 120x80x120 cm
            weight: { value: 55.12, unit: "LB" }, // ~25kg
            stackability: stackability || "STACKABLE"
          }
        ];

    const freightInfo = {
      declaredValue: {
        amount: Number(declaredValue || 1),
        code: "EUR"
      },
      freightClass: freightClass || "FC_XX"
    };

    // Step 1: generateTransportationOptions
    const genRes = await signedFetch({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `${BASE_PATH}/inboundPlans/${encodeURIComponent(inboundPlanId)}/transportationOptions`,
      query: "",
      payload: JSON.stringify({
        placementOptionId,
        shipmentId,
        readyToShipWindow: { start: readyToShipDate },
        pallets: palletPayload,
        freightInformation: freightInfo
      }),
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken,
      traceId,
      operationName: "inbound.v20240320.generateTransportationOptions",
      marketplaceId,
      sellerId
    });

    // Step 2: listTransportationOptions
    const listRes = await signedFetch({
      method: "GET",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `${BASE_PATH}/inboundPlans/${encodeURIComponent(inboundPlanId)}/transportationOptions`,
      query: `placementOptionId=${encodeURIComponent(placementOptionId)}`,
      payload: "",
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken,
      traceId,
      operationName: "inbound.v20240320.listTransportationOptions",
      marketplaceId,
      sellerId
    });

    const options = listRes?.json?.payload?.options || listRes?.json?.options || [];
    const summary = listRes?.json?.payload?.summary || listRes?.json?.summary || null;

    return jsonResponse(
      {
        traceId,
        generate: { status: genRes.res.status, payload: genRes.json },
        list: { status: listRes.res.status, options, summary }
      },
      200
    );
  } catch (e) {
    console.error("fba-ltl-options error", e);
    return jsonResponse({ error: (e as Error).message, traceId: crypto.randomUUID() }, 500);
  }
});
