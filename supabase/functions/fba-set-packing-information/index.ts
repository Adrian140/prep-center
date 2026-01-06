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
const SUPABASE_SELLER_ID = Deno.env.get("SPAPI_SELLER_ID") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type AmazonIntegration = {
  user_id: string | null;
  company_id: string | null;
  marketplace_id: string;
  region: string;
  refresh_token: string;
  selling_partner_id?: string | null;
};

type TempCreds = { accessKeyId: string; secretAccessKey: string; sessionToken: string | null };

const marketplaceByCountry: Record<string, string> = {
  FR: "A13V1IB3VIYZZH",
  DE: "A1PA6795UKMFR9",
  ES: "A1RKKUPIHCS9HS",
  IT: "APJ6JRA9NG5V4",
  NL: "A1805IZSGTT6HS",
  BE: "A2Q3Y263D00KWC",
  PL: "A1C3SOZRARQ6R3",
  SE: "A2NODRKZP88ZB9",
  UK: "A1F83G8C2ARO7P",
  IE: "A1F83G8C2ARO7P",
  AT: "A1PA6795UKMFR9",
  DK: "A1PA6795UKMFR9",
  FI: "A1F83G8C2ARO7P",
  NO: "A1F83G8C2ARO7P",
  LU: "A1PA6795UKMFR9",
  CH: "A1F83G8C2ARO7P",
  PT: "A1RKKUPIHCS9HS",
  GR: "A1RKKUPIHCS9HS"
};

function maskValue(val: string) {
  if (!val) return "";
  if (val.length <= 8) return "***";
  return `${val.slice(0, 4)}***${val.slice(-4)}`;
}

function maskHeaders(headers: Headers | Record<string, string>) {
  const entries: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      entries[k.toLowerCase()] = v;
    });
  } else {
    for (const [k, v] of Object.entries(headers)) {
      entries[k.toLowerCase()] = v;
    }
  }
  const sensitive = ["authorization", "x-amz-access-token", "x-amz-security-token", "client_secret"];
  for (const key of sensitive) {
    if (entries[key]) entries[key] = maskValue(entries[key]);
  }
  return entries;
}

function safeJson(input: unknown) {
  try {
    return JSON.stringify(input);
  } catch (_e) {
    return String(input);
  }
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

function toHex(buffer: ArrayBuffer): string {
  return Array.prototype.map
    .call(new Uint8Array(buffer), (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

function toInches(cm: number) {
  const num = Number(cm);
  if (!Number.isFinite(num)) return 0;
  return num / 2.54;
}

function toPounds(kg: number) {
  const num = Number(kg);
  if (!Number.isFinite(num)) return 0;
  return num * 2.2046226218;
}

function normalizeDimensions(input: any) {
  if (typeof input === "number") return null;
  if (!input) return null;
  const unit = String(input.unit || "CM").toUpperCase();
  const length = Number(input.length || 0);
  const width = Number(input.width || 0);
  const height = Number(input.height || 0);
  if (![length, width, height].every((n) => Number.isFinite(n))) return null;
  if (unit === "IN") {
    return { length, width, height, unit: "IN" };
  }
  return { length: toInches(length), width: toInches(width), height: toInches(height), unit: "IN" };
}

function normalizeWeight(input: any) {
  if (typeof input === "number") {
    const pounds = toPounds(input);
    return { value: pounds, unit: "LB" };
  }
  if (!input) return null;
  const unit = String(input.unit || "KG").toUpperCase();
  const value = Number(input.value || 0);
  if (!Number.isFinite(value)) return null;
  if (unit === "LB") {
    return { value, unit: "LB" };
  }
  return { value: toPounds(value), unit: "LB" };
}

function normalizePackage(input: any) {
  return {
    packingGroupId: input?.packingGroupId || input?.packing_group_id || input?.groupId || input?.group_id || null,
    dimensions: normalizeDimensions(input?.dimensions),
    weight: normalizeWeight(input?.weight)
  };
}

function buildPackagesFromGroups(groups: any[]) {
  const packages: any[] = [];
  (groups || []).forEach((g: any) => {
    const packingGroupId = g?.packingGroupId || g?.packing_group_id || g?.id || g?.groupId || null;
    const dims = normalizeDimensions(g?.dimensions || g?.boxDimensions);
    const weight = normalizeWeight(g?.weight || g?.boxWeight);
    const boxCount = Math.max(1, Number(g?.boxes || 1) || 1);
    if (!packingGroupId || !dims || !weight) return;
    for (let i = 0; i < boxCount; i++) {
      packages.push({
        packingGroupId,
        dimensions: dims,
        weight
      });
    }
  });
  return packages;
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
  const canonicalQuery = query;
  const canonicalRequest =
    method +
    "\n" +
    path +
    "\n" +
    canonicalQuery +
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
  if (sessionToken) headers["x-amz-security-token"] = sessionToken;
  return headers;
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
  sessionToken?: string | null;
  lwaToken: string;
  traceId?: string;
  operationName?: string;
  marketplaceId?: string;
  sellerId?: string;
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
  const sigHeaders = await signRequest({ method, service, region, host, path, query, payload, accessKey, secretKey, sessionToken });
  const url = `https://${host}${path}${query ? `?${query}` : ""}`;
  const requestHeaders = { ...sigHeaders, "x-amz-access-token": lwaToken, accept: "application/json" };

  console.log(
    JSON.stringify(
      {
        tag: "SPAPI_REQUEST",
        traceId: traceId || null,
        timestamp: new Date().toISOString(),
        operation: operationName || path,
        method,
        url,
        marketplaceId: marketplaceId || null,
        sellerId: sellerId || null,
        region,
        requestHeaders: maskHeaders(requestHeaders),
        requestBody: payload
      },
      null,
      2
    )
  );

  try {
    const res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: ["POST", "PUT", "PATCH"].includes(method) ? payload : undefined
    });
    const requestId = res.headers.get("x-amzn-RequestId") || res.headers.get("x-amzn-requestid") || null;
    const resHeaders = maskHeaders(res.headers);
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore parse errors
    }

    console.log(
      JSON.stringify(
        {
          tag: "SPAPI_RESPONSE",
          traceId: traceId || null,
          timestamp: new Date().toISOString(),
          operation: operationName || path,
          status: res.status,
          requestId,
          responseHeaders: resHeaders,
          responseBody: text
        },
        null,
        2
      )
    );

    return { res, text, json, requestId };
  } catch (error: any) {
    console.error(
      JSON.stringify(
        {
          tag: "SPAPI_ERROR",
          traceId: traceId || null,
          timestamp: new Date().toISOString(),
          operation: operationName || path,
          errorName: error?.name || "Error",
          errorMessage: error?.message || String(error),
          errorStack: error?.stack || "",
          raw: safeJson(error)
        },
        null,
        2
      )
    );
    throw error;
  }
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

async function assumeRole(roleArn: string) {
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
    headers: { ...sigHeaders, "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`STS assumeRole failed: ${res.status} ${xml}`);
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

async function resolveSellerId(companyId?: string | null, existing?: string | null) {
  if (existing) return existing;
  if (!companyId) return SUPABASE_SELLER_ID || "";
  const { data, error } = await supabase
    .from("seller_links")
    .select("seller_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) console.error("resolveSellerId seller_links error", error);
  return data?.seller_id || SUPABASE_SELLER_ID || "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  const traceId = crypto.randomUUID();

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
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    const authSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: authData, error: authErr } = await authSupabase.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id ?? body?.requestId;
    const inboundPlanId = body?.inbound_plan_id ?? body?.inboundPlanId;
    const packingOptionId = body?.packing_option_id ?? body?.packingOptionId;
    const rawPackages = Array.isArray(body?.packages) ? body.packages : [];
    const packingGroupsInput =
      (Array.isArray(body?.packing_groups) && body.packing_groups) ||
      (Array.isArray(body?.packingGroups) && body.packingGroups) ||
      [];
    const packages = rawPackages.length ? rawPackages : buildPackagesFromGroups(packingGroupsInput);
    const normalizedPackages = (packages || [])
      .map((p: any) => normalizePackage(p))
      .filter((p) => p.packingGroupId);
    if (!requestId || !inboundPlanId || !packingOptionId) {
      return new Response(JSON.stringify({ error: "request_id, inbound_plan_id și packing_option_id sunt necesare", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    if (!normalizedPackages.length) {
      return new Response(JSON.stringify({ error: "Lipsesc pachetele (packages) cu dimensiuni/greutate", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Basic validation for single pack (length/width/height/weight)
    const invalidPkg = normalizedPackages.find((p: any) => {
      const dims = p?.dimensions || {};
      const w = p?.weight || {};
      return !(
        p?.packingGroupId &&
        Number(dims.length) > 0 &&
        Number(dims.width) > 0 &&
        Number(dims.height) > 0 &&
        Number(w.value) > 0 &&
        typeof dims.unit === "string" &&
        typeof w.unit === "string"
      );
    });
    if (invalidPkg) {
      return new Response(JSON.stringify({ error: "Dimensiuni/greutate invalide pentru packages", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("company_id, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      return new Response(JSON.stringify({ error: "Unable to verify user profile", traceId }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    const userCompanyId = profileRow?.company_id || null;
    const userIsAdmin = Boolean(profileRow?.is_admin);

    const { data: reqData, error: reqErr } = await supabase
      .from("prep_requests")
      .select("id, destination_country, company_id, user_id")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!reqData) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    if (!userIsAdmin) {
      const isOwner = !!reqData.user_id && reqData.user_id === user.id;
      const isCompanyMember = !!reqData.company_id && !!userCompanyId && reqData.company_id === userCompanyId;
      if (!isOwner && !isCompanyMember) {
        return new Response(JSON.stringify({ error: "Forbidden", traceId }), {
          status: 403,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    const destCountry = (reqData.destination_country || "").toUpperCase();
    const inferredMarketplace = marketplaceByCountry[destCountry] || null;

    // Fetch Amazon integration
    const amazonIntegrationIdInput = body?.amazon_integration_id ?? body?.amazonIntegrationId;
    let integ: AmazonIntegration | null = null;
    if (inferredMarketplace) {
      const { data: integRows } = await supabase
        .from("amazon_integrations")
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("status", "active")
        .eq("marketplace_id", inferredMarketplace)
        .order("updated_at", { ascending: false })
        .limit(1);
      integ = (integRows?.[0] as any) || null;
    }
    if (!integ && amazonIntegrationIdInput) {
      const { data: integRowById } = await supabase
        .from("amazon_integrations")
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("id", amazonIntegrationIdInput)
        .eq("status", "active")
        .maybeSingle();
      if (integRowById) integ = integRowById as any;
    }
    if (!integ) {
      const { data: integRows } = await supabase
        .from("amazon_integrations")
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1);
      integ = (integRows?.[0] as any) || null;
    }
    if (!integ?.refresh_token) {
      throw new Error("No active Amazon integration found for this company");
    }

    const refreshToken = integ.refresh_token;
    const marketplaceId = inferredMarketplace || integ.marketplace_id || "A13V1IB3VIYZZH";
    const regionCode = (integ.region || "eu").toLowerCase();
    const awsRegion = regionCode === "na" ? "us-east-1" : regionCode === "fe" ? "us-west-2" : "eu-west-1";
    const host = regionHost(regionCode);
    const sellerId = await resolveSellerId(reqData.company_id, (integ as any).selling_partner_id);
    if (!sellerId) {
      return new Response(JSON.stringify({ error: "Missing seller id. Set selling_partner_id in amazon_integrations or SPAPI_SELLER_ID env.", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const tempCreds = await assumeRole(SPAPI_ROLE_ARN);
    const lwaAccessToken = await getLwaAccessToken(refreshToken);

    const basePath = "/inbound/fba/2024-03-20";
    const payload = JSON.stringify({
      packingOptionId,
      packages: normalizedPackages
    });

    const res = await signedFetch({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/packingInformation`,
      query: "",
      payload,
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken: lwaAccessToken,
      traceId,
      operationName: "inbound.v20240320.setPackingInformation",
      marketplaceId,
      sellerId
    });

    if (!res?.res?.ok) {
      return new Response(
        JSON.stringify({
          error: "SetPackingInformation failed",
          status: res?.res?.status || null,
          body: res?.text || null,
          traceId
        }),
        { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // persist inbound/packing IDs (idempotent)
    try {
      await supabase
        .from("prep_requests")
        .update({
          inbound_plan_id: inboundPlanId,
          packing_option_id: packingOptionId
        })
        .eq("id", requestId);
    } catch (persistErr) {
      console.error("persist packing_option_id failed", { traceId, error: persistErr });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        requestId: res?.requestId || null,
        traceId
      }),
      { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("fba-set-packing-information error", { traceId, error: e });
    return new Response(JSON.stringify({ error: e?.message || "Server error", detail: `${e}`, traceId }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
