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

type TempCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
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

function canonicalizeQuery(query: string) {
  if (!query) return "";
  const pairs = query
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const [k, v = ""] = part.split("=");
      const safeDecode = (val: string) => {
        try {
          return decodeURIComponent(val.replace(/\+/g, "%20"));
        } catch {
          return val;
        }
      };
      const key = safeDecode(k);
      const value = safeDecode(v);
      return { key, value };
    });
  pairs.sort((a, b) => (a.key === b.key ? a.value.localeCompare(b.value) : a.key.localeCompare(b.key)));
  return pairs
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join("&");
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

function cmToIn(cm: any) {
  const num = Number(cm);
  if (!Number.isFinite(num)) return 0;
  return num / 2.54;
}

function kgToLb(kg: any) {
  const num = Number(kg);
  if (!Number.isFinite(num)) return 0;
  return num * 2.2046226218;
}

function lbToKg(lb: any) {
  const num = Number(lb);
  if (!Number.isFinite(num)) return 0;
  return num / 2.2046226218;
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
  if (sessionToken) {
    headers["x-amz-security-token"] = sessionToken;
  }

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
  const canonicalQuery = canonicalizeQuery(query);
  const sigHeaders = await signRequest({
    method,
    service,
    region,
    host,
    path,
    query: canonicalQuery,
    payload,
    accessKey,
    secretKey,
    sessionToken
  });
  const url = `https://${host}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const requestHeaders = {
    ...sigHeaders,
    "x-amz-access-token": lwaToken,
    accept: "application/json"
  };

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
    headers: {
      ...sigHeaders,
      "content-type": "application/x-www-form-urlencoded"
    },
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
  if (error) {
    console.error("resolveSellerId seller_links error", error);
  }
  return data?.seller_id || SUPABASE_SELLER_ID || "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatAddress(addr: any) {
  if (!addr) return null;
  const parts = [
    addr.name,
    addr.addressLine1 || addr.address_line1 || addr.line1,
    addr.addressLine2 || addr.address_line2 || addr.line2,
    addr.addressLine3 || addr.address_line3 || addr.line3,
    addr.city || addr.locality,
    addr.stateOrProvinceCode || addr.state || addr.region || addr.county,
    addr.postalCode || addr.zip || addr.postcode,
    addr.countryCode || addr.country
  ]
    .map((p) => (p || "").toString().trim())
    .filter(Boolean);
  return parts.join(", ") || null;
}

function logStep(tag: string, payload: Record<string, unknown>) {
  try {
    console.log(JSON.stringify({ tag, ...payload, ts: new Date().toISOString() }));
  } catch {
    console.log(tag, payload);
  }
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
    let requestId = body?.request_id ?? body?.requestId;
    const inboundPlanId = body?.inbound_plan_id ?? body?.inboundPlanId;
    const placementOptionIdInput = body?.placement_option_id ?? body?.placementOptionId ?? null;
    let effectivePlacementOptionId = placementOptionIdInput;
    const packingOptionId = body?.packing_option_id ?? body?.packingOptionId ?? null;
    const amazonIntegrationIdInput = body?.amazon_integration_id ?? body?.amazonIntegrationId;
    const confirmOptionId = body?.transportation_option_id ?? body?.transportationOptionId;
    const shipmentTransportConfigs = body?.shipment_transportation_configurations ?? body?.shipmentTransportationConfigurations ?? [];
    const shippingModeInput = body?.shipping_mode ?? body?.shippingMode ?? null;
    const normalizeShippingMode = (mode: string | null) => {
      const up = String(mode || "").toUpperCase();
      if (!up) return null;
      if (up === "SPD") return "GROUND_SMALL_PARCEL";
      if (up === "LTL") return "FREIGHT_LTL";
      if (up === "FTL") return "FREIGHT_FTL";
      return up;
    };
    const effectiveShippingMode = normalizeShippingMode(shippingModeInput);
    if (shippingModeInput && String(shippingModeInput).toUpperCase() !== effectiveShippingMode) {
      logStep("shippingModeOverride", {
        traceId,
        incoming: shippingModeInput,
        forced: effectiveShippingMode
      });
    }

    logStep("fba-step2-confirm-shipping called", {
      traceId,
      keys: Object.keys(body || {}),
      hasPlacement: Boolean(effectivePlacementOptionId),
      hasInbound: Boolean(inboundPlanId),
      hasRequest: Boolean(requestId)
    });

    if (!requestId || !inboundPlanId) {
      return new Response(JSON.stringify({ error: "request_id și inbound_plan_id sunt necesare", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    // dacă lipsește placement_option_id, îl vom alege după generate/list

    // dacă lipsește packing_option_id în body, încearcă să-l citești din prep_requests
    let effectivePackingOptionId = packingOptionId;
    if (!effectivePackingOptionId) {
      const { data: reqRow, error: reqErr } = await supabase
        .from("prep_requests")
        .select("packing_option_id")
        .eq("id", requestId)
        .maybeSingle();
      if (reqErr) {
        console.warn("fba-step2-confirm-shipping packingOptionId fetch failed", { traceId, error: reqErr });
      }
      effectivePackingOptionId = reqRow?.packing_option_id || null;
    }

    let { data: reqData, error: reqErr } = await supabase
      .from("prep_requests")
      .select("id, destination_country, company_id, user_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!reqData && inboundPlanId) {
      const alt = await supabase
        .from("prep_requests")
        .select("id, destination_country, company_id, user_id")
        .eq("user_id", user.id)
        .eq("inbound_plan_id", inboundPlanId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alt?.data) {
        requestId = alt.data.id;
        reqData = alt.data;
        logStep("prepRequestLookupFallback", { traceId, inboundPlanId, requestId });
      }
    }
    logStep("prepRequestLookup", {
      traceId,
      requestId,
      companyId: reqData?.company_id || null,
      userId: reqData?.user_id || null,
      found: Boolean(reqData),
      err: reqErr?.message || null
    });
    if (reqErr) throw reqErr;
    if (!reqData) {
      return new Response(JSON.stringify({ error: "Request not found", traceId, requestId, inboundPlanId }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const destCountry = (reqData.destination_country || "").toUpperCase();
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
    const inferredMarketplace = marketplaceByCountry[destCountry] || null;

    // Fetch Amazon integration similar cu step1b
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
      if (integRowById) {
        integ = integRowById as any;
      }
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

    const getOperationState = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      const state =
        res?.json?.payload?.state ||
        res?.json?.payload?.operationStatus ||
        res?.json?.payload?.status ||
        res?.json?.state ||
        res?.json?.operationStatus ||
        res?.json?.status ||
        null;
      return String(state || "").toUpperCase();
    };
    const isTerminalOperationState = (stateUp: string) =>
      ["SUCCESS", "FAILED", "CANCELED", "ERRORED", "ERROR"].includes(String(stateUp || "").toUpperCase());
    const isInProgressOperationState = (stateUp: string) =>
      ["IN_PROGRESS", "INPROGRESS", "PENDING"].includes(String(stateUp || "").toUpperCase());

    const getOperationProblems = (res: Awaited<ReturnType<typeof signedFetch>> | null) =>
      res?.json?.payload?.operationProblems || res?.json?.operationProblems || res?.json?.errors || null;

    const isRetryableOperationFailure = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      const probs = getOperationProblems(res);
      if (!probs) return false;
      const asText = Array.isArray(probs)
        ? probs.map((p: any) => `${p?.code || ""} ${p?.message || ""}`).join(" ")
        : typeof probs === "string"
          ? probs
          : safeJson(probs);
      return asText.toLowerCase().includes("internalservererror");
    };

    const generatePlacementOptionsWithRetry = async (maxAttempts = 2) => {
      let attempt = 0;
      let lastGen: Awaited<ReturnType<typeof signedFetch>> | null = null;
      let lastOp: Awaited<ReturnType<typeof signedFetch>> | null = null;
      while (attempt < maxAttempts) {
        attempt += 1;
        const genPlacement = await signedFetch({
          method: "POST",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions`,
          query: "",
          payload: "{}",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.generatePlacementOptions",
          marketplaceId,
          sellerId
        });
        lastGen = genPlacement;
        const opId =
          genPlacement?.json?.payload?.operationId ||
          genPlacement?.json?.operationId ||
          null;
        if (opId) {
          const opStatus = await pollOperationStatus(opId);
          lastOp = opStatus;
          const stUp = getOperationState(opStatus);
          if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stUp)) {
            if (isRetryableOperationFailure(opStatus) && attempt < maxAttempts) {
              await delay(600 * attempt);
              continue;
            }
            return { ok: false, state: stUp, res: opStatus };
          }
        }
        if (genPlacement?.res?.status && genPlacement.res.status >= 500) {
          if (attempt < maxAttempts) {
            await delay(600 * attempt);
            continue;
          }
          return { ok: false, state: String(genPlacement.res.status), res: genPlacement };
        }
        return { ok: true, res: genPlacement, op: lastOp };
      }
      return { ok: false, state: "UNKNOWN", res: lastOp || lastGen };
    };

    const pollOperationStatus = async (operationId: string) => {
      // Amazon poate întoarce operații asincrone; menținem polling-ul scurt pentru a nu depăși timeout-ul Edge.
      const maxAttempts = 10;
      const timeoutMs = 25000;
      const start = Date.now();
      let attempt = 0;
      let last: Awaited<ReturnType<typeof signedFetch>> | null = null;
      while (attempt < maxAttempts && Date.now() - start < timeoutMs) {
        attempt += 1;
        const opRes = await signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/operations/${encodeURIComponent(operationId)}`,
          query: "",
          payload: "",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.getOperationStatus",
          marketplaceId,
          sellerId
        });
        last = opRes;
        const stateUp = getOperationState(opRes);
        if (["SUCCESS", "FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp) || opRes.res.status >= 400) {
          return opRes;
        }
        await delay(Math.min(500 * attempt, 2500));
      }
      console.warn("pollOperationStatus timeout", {
        traceId,
        operationId,
        attempts: attempt,
        elapsedMs: Date.now() - start,
        lastStatus: last?.res?.status || null
      });
      return last;
    };

    const ensurePlacement = async () => {
      // dacă avem placementOptionId din client, îl folosim; altfel generăm + confirmăm prima opțiune
      let placementId = effectivePlacementOptionId || null;
      let placementShipments: any[] = [];
      if (!placementId) {
        const genPlacement = await generatePlacementOptionsWithRetry();
        if (!genPlacement.ok) {
          return new Response(
            JSON.stringify({
              error: "generatePlacementOptions failed",
              state: genPlacement.state || null,
              traceId,
              details: getOperationProblems(genPlacement.res as any)
            }),
            { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        const listPlacement = await signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions`,
          query: "",
          payload: "",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.listPlacementOptions",
          marketplaceId,
          sellerId
        });
        const placements =
          listPlacement?.json?.payload?.placementOptions ||
          listPlacement?.json?.placementOptions ||
          listPlacement?.json?.PlacementOptions ||
          [];
        placementId = placements?.[0]?.placementOptionId || placements?.[0]?.id || placements?.[0]?.PlacementOptionId || null;
        if (placementId) {
          await signedFetch({
            method: "POST",
            service: "execute-api",
            region: awsRegion,
            host,
            path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions/${encodeURIComponent(placementId)}/confirmation`,
            query: "",
            payload: "{}",
            accessKey: tempCreds.accessKeyId,
            secretKey: tempCreds.secretAccessKey,
            sessionToken: tempCreds.sessionToken,
            lwaToken: lwaAccessToken,
            traceId,
            operationName: "inbound.v20240320.confirmPlacementOption",
            marketplaceId,
            sellerId
          });
        }
      }
      // după confirm placement, citim planul pentru a obține shipments populate
      const planRes = await signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.getInboundPlan",
        marketplaceId,
        sellerId
      });
      placementShipments =
        planRes?.json?.shipments ||
        planRes?.json?.payload?.shipments ||
        [];
      return { placementId, placementShipments };
    };

    const isGeneratePlacementRequired = (pc: any) => {
      const msg =
        pc?.json?.errors?.[0]?.message ||
        pc?.json?.payload?.errors?.[0]?.message ||
        pc?.text ||
        "";
      return String(msg).toLowerCase().includes("generateplacementoptions");
    };

    const listPlacementWithRetry = async () => {
      for (let i = 1; i <= 10; i++) {
        const listRes = await signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions`,
          query: "",
          payload: "",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.listPlacementOptions",
          marketplaceId,
          sellerId
        });

        const placements =
          listRes?.json?.payload?.placementOptions ||
          listRes?.json?.placementOptions ||
          [];

        const picked =
          placements.find((p: any) => (p?.status || "").toUpperCase() === "OFFERED") ||
          placements[0] ||
          null;

        const pid = picked?.placementOptionId || picked?.id || null;
        if (pid) return { pid, placements };

        await delay(Math.min(1000 * i, 5000));
      }
      return { pid: null, placements: [] as any[] };
    };

    if (!effectivePlacementOptionId) {
      const genPlacement = await generatePlacementOptionsWithRetry();
      if (!genPlacement.ok) {
        return new Response(
          JSON.stringify({
            error: "generatePlacementOptions failed",
            traceId,
            state: genPlacement.state || null
          }),
          { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      const { pid: listedPid } = await listPlacementWithRetry();
      effectivePlacementOptionId = listedPid;
      if (!effectivePlacementOptionId) {
        return new Response(JSON.stringify({
          error: "Nu pot determina placementOptionId (listPlacementOptions gol). Reîncearcă în câteva secunde.",
          traceId
        }), { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
    }

    const normalizePlacementId = (opt: any) =>
      opt?.placementOptionId || opt?.id || opt?.PlacementOptionId || null;
    const normalizePlacementStatus = (opt: any) => String(opt?.status || "").toUpperCase();

    const { pid: placementPid, placements: placementOptions } = await listPlacementWithRetry();
    const confirmedPlacement = placementOptions.find((p: any) =>
      ["ACCEPTED", "CONFIRMED"].includes(normalizePlacementStatus(p))
    );
    if (confirmedPlacement) {
      effectivePlacementOptionId = normalizePlacementId(confirmedPlacement) || effectivePlacementOptionId;
      logStep("placementConfirmSkipped", {
        traceId,
        placementOptionId: effectivePlacementOptionId,
        status: normalizePlacementStatus(confirmedPlacement)
      });
    } else {
      const hasRequestedPlacement = placementOptions.some(
        (p: any) => normalizePlacementId(p) === effectivePlacementOptionId
      );
      if (!hasRequestedPlacement && placementPid) {
        logStep("placementOptionOverride", {
          traceId,
          previous: effectivePlacementOptionId,
          next: placementPid
        });
        effectivePlacementOptionId = placementPid;
      }
    }

    // 2) Confirm placement (idempotent; accept 400/409) only when not already confirmed
    let placementConfirm: Awaited<ReturnType<typeof signedFetch>> | null = null;
    if (!confirmedPlacement) {
      placementConfirm = await signedFetch({
        method: "POST",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions/${encodeURIComponent(effectivePlacementOptionId)}/confirmation`,
        query: "",
        payload: "{}",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.confirmPlacementOption",
        marketplaceId,
        sellerId
      });
      logStep("placementConfirm", {
        traceId,
        status: placementConfirm?.res?.status,
        requestId: placementConfirm?.requestId || null
      });
      if (!placementConfirm?.res?.ok && isGeneratePlacementRequired(placementConfirm)) {
        const regenPlacement = await generatePlacementOptionsWithRetry();
        if (regenPlacement.ok) {
          const { pid: listedPid } = await listPlacementWithRetry();
          if (listedPid) {
            effectivePlacementOptionId = listedPid;
            placementConfirm = await signedFetch({
              method: "POST",
              service: "execute-api",
              region: awsRegion,
              host,
              path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions/${encodeURIComponent(effectivePlacementOptionId)}/confirmation`,
              query: "",
              payload: "{}",
              accessKey: tempCreds.accessKeyId,
              secretKey: tempCreds.secretAccessKey,
              sessionToken: tempCreds.sessionToken,
              lwaToken: lwaAccessToken,
              traceId,
              operationName: "inbound.v20240320.confirmPlacementOption",
              marketplaceId,
              sellerId
            });
          }
        }
      }

      const placementOpId =
        placementConfirm?.json?.payload?.operationId ||
        placementConfirm?.json?.operationId ||
        null;
      const placementStatus = placementConfirm?.res?.status || 0;
      const placementBody = placementConfirm?.text || "";
      const placementAlreadyConfirmed =
        /already been confirmed|has been confirmed|already confirmed|already accepted|placement option is already confirmed/i.test(
          placementBody
        );
      if (!placementConfirm?.res?.ok && [400, 409].includes(placementStatus) && !placementOpId && !placementAlreadyConfirmed) {
        return new Response(
          JSON.stringify({
            error: "Placement confirmation failed",
            traceId,
            status: placementStatus,
            body: placementBody.slice(0, 400) || null
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "content-type": "application/json" }
          }
        );
      }
      if (!placementConfirm?.res?.ok && ![400, 409].includes(placementStatus) && !placementOpId) {
        return new Response(
          JSON.stringify({ error: "Placement confirmation failed", traceId, status: placementConfirm?.res?.status }),
          {
            status: 502,
            headers: { ...corsHeaders, "content-type": "application/json" }
          }
        );
      }
      if (placementOpId) {
        const placementStatus = await pollOperationStatus(placementOpId);
        const stateUp = getOperationState(placementStatus) || String(placementStatus?.res?.status || "").toUpperCase();
        if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
          return new Response(JSON.stringify({ error: "Placement confirmation failed", traceId, state: stateUp }), {
            status: 502,
            headers: { ...corsHeaders, "content-type": "application/json" }
          });
        }
      }
    }

    // După confirm placement, citim planul pentru a obține shipments + IDs; retry ușor pe 429 și până apar shipments
    const fetchPlanWithRetry = async () => {
      const maxAttempts = 5;
      let attempt = 0;
      let last: Awaited<ReturnType<typeof signedFetch>> | null = null;
      while (attempt < maxAttempts) {
        attempt += 1;
        last = await signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}`,
          query: "",
          payload: "",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.getInboundPlan",
          marketplaceId,
          sellerId
        });
        const status = last?.res?.status || 0;
        if (last?.res?.ok) return last;
        if ([429, 425, 503].includes(status)) {
          await delay(400 * attempt);
          continue;
        }
        break;
      }
      return last;
    };

    const pollPlanForShipments = async () => {
      for (let i = 1; i <= 12; i++) {
        const res = await fetchPlanWithRetry();
        if (!res?.res?.ok) return { res, shipments: [] as any[] };
        const shipments =
          res?.json?.shipments ||
          res?.json?.payload?.shipments ||
          [];
        if (Array.isArray(shipments) && shipments.length) return { res, shipments };
        await delay(500 * i);
      }
      return { res: null, shipments: [] as any[] };
    };

    const { res: planRes, shipments: placementShipments } = await pollPlanForShipments();
    logStep("getInboundPlan after placement", {
      traceId,
      status: planRes?.res?.status,
      requestId: planRes?.requestId || null
    });

    const planSourceAddress =
      planRes?.json?.sourceAddress ||
      planRes?.json?.payload?.sourceAddress ||
      null;
    const contactInformation = (() => {
      if (!planSourceAddress) return null;
      const name = planSourceAddress.name || planSourceAddress.companyName || null;
      const phoneNumber = planSourceAddress.phoneNumber || null;
      const email = planSourceAddress.email || null;
      if (!name && !phoneNumber && !email) return null;
      return { name, phoneNumber, email };
    })();

    const planPlacementId =
      planRes?.json?.placementOptions?.[0]?.placementOptionId ||
      planRes?.json?.payload?.placementOptions?.[0]?.placementOptionId ||
      null;
    if (planPlacementId) {
      effectivePlacementOptionId = planPlacementId;
    }

    if (!Array.isArray(placementShipments) || !placementShipments.length) {
      return new Response(JSON.stringify({
        error: "Placement confirmat, dar Amazon încă nu a generat shipments. Reîncearcă în câteva secunde.",
        code: "SHIPMENTS_PENDING",
        retryAfterMs: 5000,
        traceId,
        placementOptionId: effectivePlacementOptionId
      }), {
        status: 202,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const normalizePlacementShipments = (list: any[]) =>
      (Array.isArray(list) ? list : []).map((sh: any, idx: number) => {
        const id = sh?.shipmentId || sh?.id || `s-${idx + 1}`;
        return { ...sh, id, shipmentId: id };
      });

    const getSelectedTransportationOptionId = async (shipmentId: string) => {
      const shDetail = await signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/shipments/${encodeURIComponent(shipmentId)}`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.getShipment",
        marketplaceId,
        sellerId
      });
      const payload = shDetail?.json?.payload || shDetail?.json || {};
      const selectedTransportationOptionId =
        payload?.selectedTransportationOptionId || payload?.selectedTransportationOptionID || null;
      return { selectedTransportationOptionId, requestId: shDetail?.requestId || null };
    };

    const firstShipmentId = placementShipments?.[0]?.shipmentId || placementShipments?.[0]?.id || null;
    if (firstShipmentId) {
      const { selectedTransportationOptionId } = await getSelectedTransportationOptionId(String(firstShipmentId));
      if (selectedTransportationOptionId) {
        const normalizedShipments = normalizePlacementShipments(placementShipments);
        const summary = {
          alreadyConfirmed: true,
          selectedTransportationOptionId,
          partneredAllowed: null,
          partneredRate: null,
          defaultOptionId: selectedTransportationOptionId,
          defaultCarrier: "Amazon confirmed carrier",
          defaultMode: effectiveShippingMode || null,
          defaultCharge: null
        };
        const { error: updErr } = await supabase
          .from("prep_requests")
          .update({
            placement_option_id: effectivePlacementOptionId,
            transportation_option_id: selectedTransportationOptionId,
            step2_confirmed_at: new Date().toISOString(),
            step2_summary: {
              alreadyConfirmed: true,
              selectedTransportationOptionId
            },
            step2_shipments: normalizedShipments
          })
          .eq("id", requestId);
        if (updErr) {
          logStep("prepRequestUpdateFailed", { traceId, requestId, error: updErr.message });
        }
        return new Response(
          JSON.stringify({
            inboundPlanId,
            placementOptionId: effectivePlacementOptionId || null,
            shipments: normalizedShipments,
            summary,
            alreadyConfirmed: true,
            selectedTransportationOptionId,
            prepRequestId: requestId || null,
            traceId
          }),
          { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    function parseShipDate(input: any): Date | null {
      if (!input) return null;
      const s = String(input).trim();
      const iso = Date.parse(s);
      if (!Number.isNaN(iso)) return new Date(iso);
      const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (m) {
        const dd = Number(m[1]);
        const mm = Number(m[2]);
        const yy = Number(m[3]);
        return new Date(Date.UTC(yy, mm - 1, dd, 9, 0, 0));
      }
      const mSlash = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (mSlash) {
        const dd = Number(mSlash[1]);
        const mm = Number(mSlash[2]);
        const yy = Number(mSlash[3]);
        return new Date(Date.UTC(yy, mm - 1, dd, 9, 0, 0));
      }
      const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m2) {
        const yy = Number(m2[1]);
        const mm = Number(m2[2]);
        const dd = Number(m2[3]);
        return new Date(Date.UTC(yy, mm - 1, dd, 9, 0, 0));
      }
      return null;
    }

    function normalizePackages(packages: any) {
      if (!Array.isArray(packages)) return null;
      const cleaned = packages
        .map((p: any) => {
          const dims = p?.dimensions || p?.dimension || null;
          const w = p?.weight || null;
          const quantity = Number(p?.quantity ?? 1);
          const length = Number(dims?.length);
          const width = Number(dims?.width);
          const height = Number(dims?.height);
          const weightValue = Number(w?.value);
          const dimUnit = (dims?.unit || dims?.uom || "CM").toString().toUpperCase();
          const weightUnit = (w?.unit || w?.uom || "KG").toString().toUpperCase();
          if (!Number.isFinite(length) || length <= 0) return null;
          if (!Number.isFinite(width) || width <= 0) return null;
          if (!Number.isFinite(height) || height <= 0) return null;
          if (!Number.isFinite(weightValue) || weightValue <= 0) return null;
          const normalizedDims = {
            length: dimUnit === "IN" ? length : cmToIn(length),
            width: dimUnit === "IN" ? width : cmToIn(width),
            height: dimUnit === "IN" ? height : cmToIn(height),
            unit: "IN"
          };
          const normalizedWeight = {
            value: weightUnit === "LB" ? weightValue : kgToLb(weightValue),
            unit: "LB"
          };
          return {
            dimensions: normalizedDims,
            weight: normalizedWeight,
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
          };
        })
        .filter(Boolean);
      return cleaned.length ? cleaned : null;
    }
    function normalizePallets(pallets: any) {
      if (!Array.isArray(pallets)) return null;
      const cleaned = pallets
        .map((p: any) => {
          const dims = p?.dimensions || p?.dimension || null;
          const w = p?.weight || null;
          const quantity = Number(p?.quantity ?? 1);
          const length = Number(dims?.length);
          const width = Number(dims?.width);
          const height = Number(dims?.height);
          const weightValue = Number(w?.value);
          const dimUnit = (dims?.unit || dims?.unitOfMeasurement || dims?.uom || "CM").toString().toUpperCase();
          const weightUnit = (w?.unit || w?.uom || "KG").toString().toUpperCase();
          if (!Number.isFinite(length) || length <= 0) return null;
          if (!Number.isFinite(width) || width <= 0) return null;
          if (!Number.isFinite(height) || height <= 0) return null;
          if (!Number.isFinite(weightValue) || weightValue <= 0) return null;
          const normalizedDims = {
            length: dimUnit === "IN" ? length : cmToIn(length),
            width: dimUnit === "IN" ? width : cmToIn(width),
            height: dimUnit === "IN" ? height : cmToIn(height),
            unitOfMeasurement: "IN"
          };
          const normalizedWeight = {
            value: weightUnit === "LB" ? weightValue : kgToLb(weightValue),
            unit: "LB"
          };
          const stackability = (p?.stackability || "STACKABLE").toString().toUpperCase();
          return {
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            dimensions: normalizedDims,
            weight: normalizedWeight,
            stackability
          };
        })
        .filter(Boolean);
      return cleaned.length ? cleaned : null;
    }
    function normalizeFreightInformation(info: any) {
      if (!info) return null;
      const declared = info?.declaredValue || info?.declared_value || null;
      const amount = Number(declared?.amount ?? declared?.value ?? null);
      const code = (declared?.code || declared?.currency || "USD").toString().toUpperCase();
      const freightClass = info?.freightClass || info?.freight_class || null;
      if (!Number.isFinite(amount) || !freightClass) return null;
      return {
        declaredValue: { amount, code },
        freightClass: String(freightClass)
      };
    }

    const shipDateFromClient = body?.ship_date ?? body?.shipDate ?? null;
    const shipDateParsed = parseShipDate(shipDateFromClient);

    const readyStartIso = (() => {
      if (shipDateParsed) return shipDateParsed.toISOString();
      const now = new Date();
      const plus48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      return plus48Hours.toISOString();
    })();

    function clampReadyWindow(startIso: string, endIso?: string) {
      const now = new Date();
      const minStart = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      let start = new Date(startIso);
      if (!Number.isFinite(start.getTime()) || start < minStart) {
        start = minStart;
      }

      let end = endIso ? new Date(endIso) : new Date(start.getTime() + 48 * 60 * 60 * 1000);
      if (!Number.isFinite(end.getTime()) || end <= start) {
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      }

      return { start: start.toISOString(), end: end.toISOString() };
    }

    const includePackages = String(effectiveShippingMode || "").toUpperCase() === "GROUND_SMALL_PARCEL";
    const shipmentTransportationConfigurations = placementShipments.map((sh: any, idx: number) => {
      const shId = sh.shipmentId || sh.id || `s-${idx + 1}`;
      const cfg = (shipmentTransportConfigs || []).find(
        (c: any) => c?.shipmentId === shId || c?.shipment_id === shId
      ) || (shipmentTransportConfigs || [])[idx] || {};
      const rawStart = cfg.readyToShipWindow?.start || cfg.ready_to_ship_window?.start || readyStartIso;
      const rawEnd = cfg.readyToShipWindow?.end || cfg.ready_to_ship_window?.end || undefined;
      const { start: readyStart, end: readyEnd } = clampReadyWindow(rawStart, rawEnd);
      const baseCfg: Record<string, any> = {
        shipmentId: shId,
        readyToShipWindow: { start: readyStart, end: readyEnd }
      };
      if (contactInformation) baseCfg.contactInformation = contactInformation;
      if (includePackages) {
        const pkgs = normalizePackages(cfg?.packages);
        if (pkgs) baseCfg.packages = pkgs;
      }
      const pallets = normalizePallets(cfg?.pallets);
      if (pallets) baseCfg.pallets = pallets;
      const freightInformation = normalizeFreightInformation(cfg?.freightInformation || cfg?.freight_information);
      if (freightInformation) baseCfg.freightInformation = freightInformation;
      return baseCfg;
    });

    const configsByShipment = new Map<string, any>(
      shipmentTransportationConfigurations.map((c: any) => [String(c.shipmentId), c])
    );
    const EU_MARKETPLACES = new Set([
      "A13V1IB3VIYZZH", // FR
      "A1RKKUPIHCS9HS", // ES
      "APJ6JRA9NG5V4", // IT
      "A1PA6795UKMFR9", // DE
      "A1F83G8C2ARO7P", // UK
      "A1805IZSGTT6HS", // NL
      "A1C3SOZRARQ6R3", // PL
      "A2Q3Y263D00KWC", // BE
      "A2NODRKZP88ZB9" // SE
    ]);
    const isEuMarketplace = EU_MARKETPLACES.has(String(marketplaceId || "").trim());
    const hasPallets = shipmentTransportationConfigurations.some(
      (c: any) => Array.isArray(c?.pallets) && c.pallets.length > 0
    );
    const missingPkgs = shipmentTransportationConfigurations.some(
      (c: any) => !Array.isArray(c?.packages) || c.packages.length === 0
    );
    const missingPallets = shipmentTransportationConfigurations.some(
      (c: any) => !Array.isArray(c?.pallets) || c.pallets.length === 0
    );
    const missingFreightInfo = shipmentTransportationConfigurations.some(
      (c: any) => !c?.freightInformation
    );
    const requiresPallets = ["FREIGHT_LTL", "FREIGHT_FTL"].includes(String(effectiveShippingMode || "").toUpperCase());
    if (requiresPallets && missingPallets) {
      return new Response(
        JSON.stringify({
          error:
            "Lipsesc paletii (pallets) și/sau freightInformation pentru LTL/FTL. Completează dimensiuni, greutate, stackability și freight class.",
          code: "MISSING_PALLETS",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    if (requiresPallets && missingFreightInfo) {
      return new Response(
        JSON.stringify({
          error:
            "Lipsește freightInformation (declared value + freight class) pentru LTL/FTL.",
          code: "MISSING_FREIGHT_INFO",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    if (includePackages && !hasPallets && missingPkgs) {
      return new Response(
        JSON.stringify({
          error:
            "Lipsesc coletele (packages: dimensiuni + greutate). Fără ele, Amazon poate returna doar USE_YOUR_OWN_CARRIER (non-partnered).",
          code: "MISSING_PACKAGES",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // EU SPD partnered hard limits (23 kg și max 63.5 cm pe latură) + avertizare non-blocantă la 15 kg
    const spdWarnings: string[] = [];
    if (includePackages && isEuMarketplace) {
      const SPD_MAX_SIDE_IN = 25; // 63.5 cm
      const SPD_HARD_MAX_WEIGHT_LB = kgToLb(23); // 23 kg limit
      const SPD_WARN_WEIGHT_LB = kgToLb(15); // 15 kg: cere eticheta "Heavy package"
      const spdErrors: string[] = [];

      shipmentTransportationConfigurations.forEach((cfg, cfgIdx) => {
        const pkgs = Array.isArray(cfg?.packages) ? cfg.packages : [];
        pkgs.forEach((pkg, pkgIdx) => {
          const weightLb = Number(pkg?.weight?.value || 0);
          const dims = pkg?.dimensions || {};
          const sides = [dims?.length, dims?.width, dims?.height].map((n) => Number(n || 0));
          const maxSide = Math.max(...sides);

          if (weightLb > SPD_HARD_MAX_WEIGHT_LB) {
            spdErrors.push(
              `Shipment ${cfg?.shipmentId || cfgIdx + 1} pkg ${pkgIdx + 1}: ${weightLb.toFixed(
                2
              )} lb (${lbToKg(weightLb).toFixed(2)} kg) depășește 23 kg - împarte cutia sau folosește LTL.`
            );
          } else if (weightLb >= SPD_WARN_WEIGHT_LB) {
            spdWarnings.push(
              `Shipment ${cfg?.shipmentId || cfgIdx + 1} pkg ${pkgIdx + 1}: ${weightLb.toFixed(
                2
              )} lb (${lbToKg(weightLb).toFixed(
                2
              )} kg) ≥ 15 kg - adaugă eticheta "Heavy package"; SPD PCP poate să nu fie disponibil.`
            );
          }

          if (Number.isFinite(maxSide) && maxSide > SPD_MAX_SIDE_IN) {
            spdErrors.push(
              `Shipment ${cfg?.shipmentId || cfgIdx + 1} pkg ${pkgIdx + 1}: latura maximă ${maxSide.toFixed(
                2
              )} in (${(maxSide * 2.54).toFixed(
                2
              )} cm) depășește 63.5 cm. SPD PCP nu este disponibil; ajustează cutia sau folosește LTL.`
            );
          }
        });
      });

      if (spdErrors.length) {
        return new Response(
          JSON.stringify({
            error:
              "Coletele nu respectă regulile SPD (EU): max 23 kg și max 63.5 cm pe latură.",
            code: "SPD_PACKAGE_NOT_ELIGIBLE",
            details: spdErrors,
            traceId
          }),
          { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    if (!effectivePackingOptionId) {
      return new Response(
        JSON.stringify({
          error: "Lipsește packing_option_id. Reia Step1b ca să confirmi packingOptions.",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const shouldConfirm =
      (body?.confirm ?? body?.confirmTransportation ?? true) &&
      !(body?.skip_confirm ?? body?.skipConfirm ?? false);

    // 1) Generate transportation options (idempotent)
    logStep("transportationOptions_payload", {
      traceId,
      inboundPlanId,
      placementOptionId: effectivePlacementOptionId,
      packingOptionId: effectivePackingOptionId || null,
      shippingMode: effectiveShippingMode,
      shipDate: shipDateFromClient || null,
      shipmentConfigCount: shipmentTransportationConfigurations.length,
      hasPallets,
      shipments: shipmentTransportationConfigurations.map((c: any) => ({
        shipmentId: c?.shipmentId || null,
        readyStart: c?.readyToShipWindow?.start || null,
        readyEnd: c?.readyToShipWindow?.end || null,
        packages: Array.isArray(c?.packages) ? c.packages.length : 0,
        pallets: Array.isArray(c?.pallets) ? c.pallets.length : 0,
        hasContact: Boolean(c?.contactInformation)
      }))
    });
    const generatePayload = JSON.stringify({
      placementOptionId: effectivePlacementOptionId,
      shipmentTransportationConfigurations
    });
    const genRes = await signedFetch({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/transportationOptions`,
      query: "",
      payload: generatePayload,
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken: lwaAccessToken,
      traceId,
      operationName: "inbound.v20240320.generateTransportationOptions",
      marketplaceId,
      sellerId
    });
    logStep("generateTransportationOptions", {
      traceId,
      status: genRes?.res?.status,
      requestId: genRes?.requestId || null,
      bodyPreview: (genRes?.text || "").slice(0, 400) || null
    });

    let generateFailed = false;
    let generateProblems: any = null;
    const opId =
      genRes?.json?.payload?.operationId ||
      genRes?.json?.operationId ||
      null;

    if (opId) {
      const genStatus = await pollOperationStatus(opId);
      const stateUp = getOperationState(genStatus) || String(genStatus?.res?.status || "").toUpperCase();
      logStep("generateTransportationOptions_status", {
        traceId,
        operationId: opId,
        state: stateUp,
        status: genStatus?.res?.status || null,
        requestId: genStatus?.requestId || null,
        problems: getOperationProblems(genStatus) || null
      });
      if (isInProgressOperationState(stateUp)) {
        return new Response(
          JSON.stringify({
            error: "Transportation options are still generating. Retry shortly.",
            code: "TRANSPORTATION_OPTIONS_PENDING",
            traceId,
            operationId: opId,
            retryAfterMs: 4000
          }),
          { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      if (!isTerminalOperationState(stateUp)) {
        return new Response(
          JSON.stringify({
            error: "Unknown operation state for generateTransportationOptions. Retry shortly.",
            code: "TRANSPORTATION_OPTIONS_UNKNOWN_STATE",
            traceId,
            operationId: opId,
            state: stateUp || null,
            retryAfterMs: 4000
          }),
          { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
        generateFailed = true;
        generateProblems = getOperationProblems(genStatus);
      }
    } else if (!genRes?.res?.ok) {
      generateFailed = true;
      generateProblems = genRes?.text || null;
    }

    // 2) List transportation options (paginat, ca să nu ratăm SPD/partnered)
    const listAllTransportationOptions = async () => {
      let nextToken: string | null = null;
      const collected: any[] = [];
      let firstRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
      let attempt = 0;
      do {
        attempt += 1;
        const queryParts = [`placementOptionId=${encodeURIComponent(effectivePlacementOptionId)}`];
        if (nextToken) queryParts.push(`nextToken=${encodeURIComponent(nextToken)}`);
        const res = await signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/transportationOptions`,
          query: queryParts.join("&"),
          payload: "",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.listTransportationOptions",
          marketplaceId,
          sellerId
        });
        if (!firstRes) firstRes = res;
        const chunk =
          res?.json?.payload?.transportationOptions ||
          res?.json?.transportationOptions ||
          res?.json?.TransportationOptions ||
          [];
        if (Array.isArray(chunk)) collected.push(...chunk);
        nextToken =
          res?.json?.payload?.pagination?.nextToken ||
          res?.json?.pagination?.nextToken ||
          res?.json?.nextToken ||
          null;
        if (nextToken) await delay(150 * attempt);
      } while (nextToken && attempt < 10);
      return { firstRes, collected };
    };

    const { firstRes: listRes, collected: optionsRaw } = await listAllTransportationOptions();
    logStep("listTransportationOptions", {
      traceId,
      status: listRes?.res?.status,
      requestId: listRes?.requestId || null,
      count: optionsRaw.length
    });
    logStep("shipmentTransportationConfigurations", {
      traceId,
      count: shipmentTransportationConfigurations.length,
      shippingMode: effectiveShippingMode
    });

    const hasDeliveryWindowPrecondition = (opt: any) => {
      const pre = opt?.preconditions || opt?.Preconditions || [];
      if (!Array.isArray(pre)) return false;
      return pre.map((p) => String(p || "").toUpperCase()).includes("CONFIRMED_DELIVERY_WINDOW");
    };
    const isDeliveryWindowGracePeriodError = (res?: Awaited<ReturnType<typeof signedFetch>> | null) => {
      const body = res?.text || "";
      return /outside of the grace period/i.test(body);
    };

    const generateDeliveryWindowOptions = async (shipmentId: string) =>
      signedFetch({
        method: "POST",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/shipments/${encodeURIComponent(shipmentId)}/deliveryWindowOptions`,
        query: "",
        payload: "{}",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.generateDeliveryWindowOptions",
        marketplaceId,
        sellerId
      });

    const listDeliveryWindowOptions = async (shipmentId: string) =>
      signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/shipments/${encodeURIComponent(shipmentId)}/deliveryWindowOptions`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.listDeliveryWindowOptions",
        marketplaceId,
        sellerId
      });

    const confirmDeliveryWindowOption = async (shipmentId: string, deliveryWindowOptionId: string) =>
      signedFetch({
        method: "POST",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/shipments/${encodeURIComponent(shipmentId)}/deliveryWindowOptions/${encodeURIComponent(deliveryWindowOptionId)}/confirmation`,
        query: "",
        payload: "{}",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.confirmDeliveryWindowOption",
        marketplaceId,
        sellerId
      });

    const extractDeliveryWindowOptions = (res: Awaited<ReturnType<typeof signedFetch>> | null) =>
      res?.json?.payload?.deliveryWindowOptions ||
      res?.json?.deliveryWindowOptions ||
      res?.json?.DeliveryWindowOptions ||
      [];

    const pickDeliveryWindowOptionId = (opts: any[]) => {
      if (!Array.isArray(opts) || !opts.length) return null;
      const withDates = opts
        .map((o: any) => {
          const window = o?.deliveryWindow || o?.window || null;
          const start = window?.startDate || window?.start || o?.startDate || o?.start || null;
          const end = window?.endDate || window?.end || o?.endDate || o?.end || null;
          const ts = start ? Date.parse(String(start)) : NaN;
          return { opt: o, ts, start, end };
        })
        .filter((o: any) => Number.isFinite(o.ts));
      const picked = withDates.length
        ? withDates.sort((a: any, b: any) => a.ts - b.ts)[0].opt
        : opts[0];
      return picked?.deliveryWindowOptionId || picked?.id || null;
    };

    let options = optionsRaw;

    const allRequireDeliveryWindow =
      Array.isArray(options) &&
      options.length > 0 &&
      options.every((opt: any) => hasDeliveryWindowPrecondition(opt));

    if (allRequireDeliveryWindow && shouldConfirm) {
      const shipmentIds = Array.from(
        new Set(
          placementShipments
            .map((s: any) => s?.shipmentId || s?.id)
            .filter(Boolean)
            .map((id: any) => String(id))
        )
      );
      for (const shipmentId of shipmentIds) {
        const genRes = await generateDeliveryWindowOptions(shipmentId);
        const genOpId =
          genRes?.json?.payload?.operationId ||
          genRes?.json?.operationId ||
          null;
        if (genOpId) {
          const genStatus = await pollOperationStatus(genOpId);
          const stUp = getOperationState(genStatus);
          if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stUp)) {
            logStep("deliveryWindow_generate_failed", { traceId, shipmentId, state: stUp });
            continue;
          }
        }
        let listRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
        let optionsList: any[] = [];
        for (let i = 1; i <= 6; i++) {
          listRes = await listDeliveryWindowOptions(shipmentId);
          optionsList = extractDeliveryWindowOptions(listRes);
          if (Array.isArray(optionsList) && optionsList.length) break;
          await delay(Math.min(800 * i, 4000));
        }
        const dwOptionId = pickDeliveryWindowOptionId(optionsList);
        if (!dwOptionId) {
          logStep("deliveryWindow_missing_options", { traceId, shipmentId });
          continue;
        }
        const confirmRes = await confirmDeliveryWindowOption(shipmentId, dwOptionId);
        if (!confirmRes?.res?.ok && isDeliveryWindowGracePeriodError(confirmRes)) {
          logStep("deliveryWindow_confirm_skipped", { traceId, shipmentId, reason: "grace_period" });
          continue;
        }
        const confirmOpId =
          confirmRes?.json?.payload?.operationId ||
          confirmRes?.json?.operationId ||
          null;
        if (confirmOpId) {
          const confirmStatus = await pollOperationStatus(confirmOpId);
          const stUp = getOperationState(confirmStatus);
          if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stUp)) {
            logStep("deliveryWindow_confirm_failed", { traceId, shipmentId, state: stUp });
          }
        }
      }
      const relist = await listAllTransportationOptions();
      options = relist.collected || [];
      logStep("listTransportationOptions_after_deliveryWindow", {
        traceId,
        status: relist.firstRes?.res?.status,
        requestId: relist.firstRes?.requestId || null,
        count: options.length
      });
    }

    if (!Array.isArray(options) || options.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Amazon nu a returnat transportation options încă. Reîncearcă în câteva secunde.",
          code: "TRANSPORTATION_OPTIONS_EMPTY",
          traceId,
          generateFailed,
          generateProblems,
          retryAfterMs: 4000
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }


    const extractCharge = (opt: any) => {
      const fromPath = [
        opt?.charge?.totalCharge?.amount,
        opt?.totalCharge?.amount,
        opt?.chargeAmount?.amount,
        opt?.estimatedCharge?.amount,
        opt?.price?.amount
      ].find((v) => v !== undefined && v !== null);
      const value = Number(fromPath);
      return Number.isFinite(value) ? value : null;
    };

    const detectPartnered = (opt: any) => {
      const carrierName = (opt?.carrierName || opt?.carrier?.name || opt?.carrier || "").toString();
      const shippingSolution = (opt?.shippingSolution || opt?.shippingSolutionId || opt?.shipping_solution || "")
        .toString()
        .toUpperCase();
      const typeHints = [
        opt?.transportationOptionType,
        opt?.transportationOptionType?.type,
        opt?.transportationOptionType?.transportationOptionType,
        opt?.transportationOptionType?.transportationOptionType?.type,
        opt?.carrierType,
        opt?.carrier?.carrierType,
        opt?.carrier?.type,
        opt?.program,
        opt?.carrierProgram,
        opt?.partneredProgram,
        opt?.shippingSolution,
        opt?.shippingSolutionId,
        opt?.shipping_solution,
        opt?.shipping_solution_id
      ]
        .filter((v) => v !== undefined && v !== null)
        .map((v) => String(v).toUpperCase());
      const flags = [
        opt?.partneredCarrier,
        opt?.isPartnered,
        opt?.partnered,
        opt?.isAmazonPartnered,
        opt?.amazonPartnered,
        opt?.isAmazonPartneredCarrier
      ];
      const solutionHints =
        shippingSolution.includes("AMAZON_PARTNERED") ||
        shippingSolution.includes("PARTNERED_CARRIER");
      const typeMatch = typeHints.some(
        (v) => v.includes("AMAZON_PARTNERED") || v.includes("PARTNERED_CARRIER")
      );
      const nameHints =
        /partner/i.test(carrierName) ||
        /partner/i.test(String(opt?.partneredCarrierName || ""));
      return Boolean(flags.find(Boolean) || solutionHints || typeMatch || nameHints);
    };

    const normalizedOptions = Array.isArray(options)
      ? options.map((opt: any) => ({
          id: opt.transportationOptionId || opt.id || opt.optionId || null,
          isPartnered: detectPartnered(opt),
          partnered: detectPartnered(opt),
          mode: opt.mode || opt.shippingMode || opt.method || null,
          carrierName: opt.carrierName || opt.carrier?.name || opt.carrier?.alphaCode || opt.carrier || null,
          charge: extractCharge(opt),
          raw: opt
        }))
      : [];
    const optionsPayload = normalizedOptions;

    const optionsForSelection = (() => {
      if (!effectiveShippingMode) return normalizedOptions;
      const mode = String(effectiveShippingMode).toUpperCase();
      return normalizedOptions.filter((o) => String(o.mode || "").toUpperCase() === mode);
    })();
    const returnedModes = Array.from(
      new Set(normalizedOptions.map((o) => String(o.mode || "").toUpperCase()))
    ).filter(Boolean);
    let effectiveOptionsForSelection = optionsForSelection;
    let modeMismatch = false;
    if (effectiveShippingMode && optionsForSelection.length === 0 && normalizedOptions.length) {
      modeMismatch = true;
      effectiveOptionsForSelection = normalizedOptions;
    }

    // pick a default: partnered if available, otherwise first option
    const partneredOpt = effectiveOptionsForSelection.find((o) => o.partnered);
    const defaultOpt = partneredOpt || effectiveOptionsForSelection[0] || null;

    const summary = {
      partneredAllowed: Boolean(partneredOpt),
      partneredRate: partneredOpt?.charge ?? null,
      defaultOptionId: defaultOpt?.id || null,
      defaultCarrier: defaultOpt?.carrierName || null,
      defaultMode: defaultOpt?.mode || null,
      defaultCharge: defaultOpt?.charge ?? null,
      returnedModes,
      modeMismatch
    };

    if (!shouldConfirm) {
      const normalizedShipments = normalizePlacementShipments(placementShipments);
      return new Response(
        JSON.stringify({
          inboundPlanId,
          placementOptionId: effectivePlacementOptionId || null,
          options: optionsPayload,
          shipments: normalizedShipments,
          summary,
          status: {
            placementConfirm: placementConfirm?.res?.status ?? null,
            generate: genRes?.res.status ?? null,
            generateFailed,
            generateProblems,
            list: listRes?.res.status ?? null,
            confirm: null
          },
          amazonRequestId: listRes?.requestId || genRes?.requestId || null,
          prepRequestId: requestId || null,
          traceId
        }),
        { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // 3) Confirm transportation option (Amazon cere confirmTransportationOptions)
    if (!effectiveOptionsForSelection.length) {
      return new Response(
        JSON.stringify({
          error: "Nu există transportation options disponibile pentru confirmare.",
          traceId
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const forcePartneredIfAvailable =
      body?.force_partnered_if_available ?? body?.forcePartneredIfAvailable ?? true;
    const forcePartneredOnly =
      body?.force_partnered_only ?? body?.forcePartneredOnly ?? false;
    const wantPartnered = Boolean(forcePartneredOnly || forcePartneredIfAvailable);

    if (spdWarnings.length) {
      summary["warnings"] = spdWarnings;
    }

    if (forcePartneredOnly && !partneredOpt) {
      return new Response(
        JSON.stringify({
          error: "Amazon partnered carrier nu este disponibil pentru acest shipment.",
          code: "PARTNERED_NOT_AVAILABLE",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    if (shouldConfirm && forcePartneredOnly && !partneredOpt) {
      return new Response(
        JSON.stringify({
          error:
            "Amazon Partnered Carrier was not returned by SP-API for this inbound plan/options. Not confirming non-partnered.",
          code: "PARTNERED_NOT_RETURNED",
          traceId,
          returnedSolutions: Array.from(
            new Set(
              normalizedOptions.map((o) => String(o.raw?.shippingSolution || "").toUpperCase())
            )
          ).filter(Boolean),
          returnedModes: Array.from(
            new Set(normalizedOptions.map((o) => String(o.mode || "").toUpperCase()))
          ).filter(Boolean)
        }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    let selectedOptionId = confirmOptionId || defaultOpt?.id || effectiveOptionsForSelection[0]?.id || null;

    if (forcePartneredIfAvailable) {
      const partneredOptPick = effectiveOptionsForSelection.find((o) => o.partnered);
      const requested = effectiveOptionsForSelection.find((o) => o.id === confirmOptionId) || null;
      if (partneredOptPick && requested && !requested.partnered) {
        selectedOptionId = partneredOptPick.id;
      }
      if (partneredOptPick && !confirmOptionId) {
        selectedOptionId = partneredOptPick.id;
      }
    }
    if (forcePartneredOnly && partneredOpt?.id) {
      selectedOptionId = partneredOpt.id;
    }
    const selectedOption =
      effectiveOptionsForSelection.find((o) => o.id === selectedOptionId) || effectiveOptionsForSelection[0] || null;

    if (!selectedOption?.id) {
      return new Response(
        JSON.stringify({
          error: "Nu există transportationOption de confirmat (Amazon). Reîncearcă după re-generare.",
          traceId
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const requiresDeliveryWindow = hasDeliveryWindowPrecondition(selectedOption?.raw || selectedOption);
    if (requiresDeliveryWindow) {
      const shipmentIds = Array.from(
        new Set(
          (Array.isArray(selectedOption?.raw?.shipments)
            ? selectedOption.raw.shipments.map((sh: any) => sh?.shipmentId || sh?.id)
            : placementShipments.map((s: any) => s?.shipmentId || s?.id)
          )
            .filter(Boolean)
            .map((id: any) => String(id))
        )
      );
      for (const shipmentId of shipmentIds) {
        const genRes = await generateDeliveryWindowOptions(shipmentId);
        const genOpId =
          genRes?.json?.payload?.operationId ||
          genRes?.json?.operationId ||
          null;
        if (genOpId) {
          const genStatus = await pollOperationStatus(genOpId);
          const stUp = getOperationState(genStatus);
          if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stUp)) {
            logStep("deliveryWindow_generate_failed", { traceId, shipmentId, state: stUp });
            continue;
          }
        }
        let listRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
        let optionsList: any[] = [];
        for (let i = 1; i <= 6; i++) {
          listRes = await listDeliveryWindowOptions(shipmentId);
          optionsList = extractDeliveryWindowOptions(listRes);
          if (Array.isArray(optionsList) && optionsList.length) break;
          await delay(Math.min(800 * i, 4000));
        }
        const dwOptionId = pickDeliveryWindowOptionId(optionsList);
        if (!dwOptionId) {
          logStep("deliveryWindow_missing_options", { traceId, shipmentId });
          return new Response(
            JSON.stringify({
              error: "Nu am putut obține deliveryWindowOptionId pentru confirmare.",
              traceId
            }),
            { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        const confirmRes = await confirmDeliveryWindowOption(shipmentId, dwOptionId);
        if (!confirmRes?.res?.ok && isDeliveryWindowGracePeriodError(confirmRes)) {
          logStep("deliveryWindow_confirm_skipped", { traceId, shipmentId, reason: "grace_period" });
          continue;
        }
        const confirmOpId =
          confirmRes?.json?.payload?.operationId ||
          confirmRes?.json?.operationId ||
          null;
        if (confirmOpId) {
          const confirmStatus = await pollOperationStatus(confirmOpId);
          const stUp = getOperationState(confirmStatus);
          if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stUp)) {
            logStep("deliveryWindow_confirm_failed", { traceId, shipmentId, state: stUp });
          }
        }
      }
    }

    const selections = Array.isArray(selectedOption?.raw?.shipments)
      ? selectedOption.raw.shipments.map((sh: any) => ({
          shipmentId: sh.shipmentId || sh.id,
          transportationOptionId: selectedOption?.id
        }))
      : placementShipments.map((sh: any, idx: number) => ({
          shipmentId: sh.shipmentId || sh.id || `s-${idx + 1}`,
          transportationOptionId: selectedOption?.id
        }));

    const confirmPayload = JSON.stringify({
      transportationSelections: selections
    });
    const confirmRes = await signedFetch({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/transportationOptions/confirmation`,
      query: "",
      payload: confirmPayload,
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken: lwaAccessToken,
      traceId,
      operationName: "inbound.v20240320.confirmTransportationOptions",
      marketplaceId,
      sellerId
    });
    logStep("confirmTransportationOptions", {
      traceId,
      status: confirmRes?.res?.status,
      requestId: confirmRes?.requestId || null,
      optionId: selectedOption?.id || null
    });

    const confirmOpId =
      confirmRes?.json?.payload?.operationId ||
      confirmRes?.json?.operationId ||
      null;
    if (!confirmRes?.res?.ok && (confirmRes?.res?.status === 400)) {
      const bodyPreview = (confirmRes?.text || "").slice(0, 400);
      const needsWindow = bodyPreview.toLowerCase().includes("delivery window");
      if (needsWindow) {
        return new Response(
          JSON.stringify({
            error:
              "Transportation option solicită fereastră de livrare confirmată (CONFIRMED_DELIVERY_WINDOW). Selectează altă opțiune sau setează delivery window în Amazon.",
            traceId,
            status: confirmRes?.res?.status || null
          }),
          { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      const alreadyConfirmed =
        /already been confirmed|has been confirmed|already confirmed/i.test(bodyPreview);
      if (alreadyConfirmed && firstShipmentId) {
        const { selectedTransportationOptionId } = await getSelectedTransportationOptionId(String(firstShipmentId));
        if (selectedTransportationOptionId) {
          const normalizedShipments = normalizePlacementShipments(placementShipments);
          const summary = {
            alreadyConfirmed: true,
            selectedTransportationOptionId,
            partneredAllowed: null,
            partneredRate: null,
            defaultOptionId: selectedTransportationOptionId,
            defaultCarrier: "Amazon confirmed carrier",
            defaultMode: effectiveShippingMode || null,
            defaultCharge: null
          };
          const { error: updErr } = await supabase
            .from("prep_requests")
            .update({
              placement_option_id: effectivePlacementOptionId,
              transportation_option_id: selectedTransportationOptionId,
              step2_confirmed_at: new Date().toISOString(),
              step2_summary: {
                alreadyConfirmed: true,
                selectedTransportationOptionId
              },
              step2_shipments: normalizedShipments
            })
            .eq("id", requestId);
          if (updErr) {
            logStep("prepRequestUpdateFailed", { traceId, requestId, error: updErr.message });
          }
          return new Response(
            JSON.stringify({
              inboundPlanId,
              placementOptionId: effectivePlacementOptionId || null,
              shipments: normalizedShipments,
              summary,
              alreadyConfirmed: true,
              selectedTransportationOptionId,
              prepRequestId: requestId || null,
              traceId
            }),
            { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
      }
    }
    if (confirmOpId) {
      const confirmStatus = await pollOperationStatus(confirmOpId);
      const stateUp = getOperationState(confirmStatus) || String(confirmStatus?.res?.status || "").toUpperCase();
      if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
        return new Response(JSON.stringify({ error: "Transportation confirmation failed", traceId, state: stateUp }), {
          status: 502,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    const normalizeShipmentsFromPlan = async () => {
      const list: any[] = [];
      for (const sh of placementShipments) {
        const shId = sh.shipmentId || sh.id;
        if (!shId) continue;
        const shDetail = await signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/shipments/${encodeURIComponent(shId)}`,
          query: "",
          payload: "",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.getShipment",
          marketplaceId,
          sellerId
        });
        const shJson = shDetail?.json || {};
        const payload = shJson?.payload || shJson;
        const destinationAddress =
          payload?.destinationAddress ||
          payload?.to ||
          payload?.destination?.address ||
          payload?.DestinationAddress ||
          null;
        const sourceAddress =
          payload?.shipFromAddress ||
          payload?.from ||
          payload?.source?.address ||
          payload?.SourceAddress ||
          null;
        const contents = payload?.contents || payload?.Contents || {};
        const destinationFc =
          payload?.destination?.warehouseId ||
          payload?.destination?.warehouseCode ||
          payload?.destinationWarehouseId ||
          sh?.destinationWarehouseId ||
          sh?.destinationFc ||
          null;
        const cfg = configsByShipment.get(String(shId)) || {};
        const pkgList = Array.isArray(cfg?.packages) ? cfg.packages : [];
        const palletList = Array.isArray(cfg?.pallets) ? cfg.pallets : [];
        const weightFromPackages = pkgList.reduce((sum: number, p: any) => {
          const w = Number(p?.weight?.value || 0);
          return sum + (Number.isFinite(w) ? w : 0);
        }, 0);
        const weightFromPallets = palletList.reduce((sum: number, p: any) => {
          const w = Number(p?.weight?.value || 0);
          return sum + (Number.isFinite(w) ? w : 0);
        }, 0);
        const weightFromCfg = weightFromPackages || weightFromPallets || 0;
        const boxesFromCfg = pkgList.length
          ? pkgList.length
          : palletList.length
            ? palletList.reduce((sum: number, p: any) => sum + Number(p?.quantity || 0), 0)
            : null;
        list.push({
          id: shId,
          from: formatAddress(sourceAddress) || formatAddress(sh?.shipFromAddress || sh?.from) || null,
          to: (() => {
            const addr = formatAddress(destinationAddress) || formatAddress(sh?.destinationAddress || sh?.to) || null;
            if (addr && destinationFc) return `${destinationFc} - ${addr}`;
            if (addr) return addr;
            return destinationFc || null;
          })(),
          destinationWarehouseId: destinationFc || null,
          boxes: contents?.boxes || contents?.cartons || boxesFromCfg || null,
          skuCount: contents?.skuCount || null,
          units: contents?.units || null,
          weight: contents?.weight || weightFromCfg || null
        });
      }
      return list;
    };

    const shipments = await normalizeShipmentsFromPlan();

    const { error: updErr } = await supabase
      .from("prep_requests")
      .update({
        placement_option_id: effectivePlacementOptionId,
        transportation_option_id: selectedOption?.id || null,
        step2_confirmed_at: new Date().toISOString(),
        step2_summary: summary,
        step2_shipments: shipments
      })
      .eq("id", requestId);
    if (updErr) {
      logStep("prepRequestUpdateFailed", { traceId, requestId, error: updErr.message });
    }

    return new Response(
      JSON.stringify({
        inboundPlanId,
        placementOptionId: effectivePlacementOptionId || null,
        options: optionsPayload,
        shipments,
        summary,
        status: {
          placementConfirm: placementConfirm?.res?.status ?? null,
          generate: genRes?.res.status ?? null,
          generateFailed,
          generateProblems,
          list: listRes?.res.status ?? null,
          confirm: confirmRes?.res.status ?? null
        },
        amazonRequestId: confirmRes?.requestId || listRes?.requestId || genRes?.requestId || null,
        prepRequestId: requestId || null,
        traceId
      }),
      { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("fba-step2-confirm-shipping error", { traceId, error: e });
    return new Response(JSON.stringify({ error: e?.message || "Server error", detail: `${e}`, traceId }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
