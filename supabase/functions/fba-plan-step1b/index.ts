// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

const baseCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
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

function normalizeSku(val: string | null | undefined) {
  return (val || "").trim();
}

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

async function getLwaAccessToken(refreshToken: string, traceId?: string) {
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
  const scope: string = json.scope || json.scp || "";
  // Debug scopes to validate permissions without exposing full token
  console.log("fba-plan-step1b lwa-scope", {
    traceId: traceId || null,
    scope
  });
  return { accessToken: json.access_token as string, scope };
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

function backoffMs(attempt: number) {
  const base = 400 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 120);
  return base + jitter;
}

async function runWith429Retry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let last: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fn();
    const status = Number((last as any)?.res?.status || 0);
    if (status !== 429) break;
    if (attempt < maxAttempts) {
      await delay(backoffMs(attempt));
    }
  }
  return last;
}

serve(async (req) => {
  const traceId = crypto.randomUUID();
  const origin = req.headers.get("origin") || "*";
  const corsHeaders = {
    ...baseCorsHeaders,
    "Access-Control-Allow-Origin": origin,
    ...(origin !== "*" ? { Vary: "Origin" } : {})
  };

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

    // Basic request debug
    console.log("fba-plan-step1b req", {
      traceId,
      method: req.method,
      origin,
      url: req.url
    });

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
    console.log("fba-plan-step1b body", {
      traceId,
      keys: Object.keys(body || {}),
      requestId: body?.request_id || body?.requestId,
      inboundPlanId: body?.inbound_plan_id || body?.inboundPlanId,
      includePlacement: body?.include_placement ?? body?.includePlacement ?? false,
      packingOptionId: body?.packing_option_id || body?.packingOptionId || null
    });
    const requestId = body?.request_id as string | undefined;
    let inboundPlanId = body?.inbound_plan_id as string | undefined;
    const includePlacement =
      (body?.include_placement as boolean | undefined) ??
      (body?.includePlacement as boolean | undefined) ??
      false;
    const requestedPackingOptionIdRaw =
      (body?.packing_option_id as string | undefined) ??
      (body?.packingOptionId as string | undefined) ??
      null;
    const requestedPackingOptionId =
      requestedPackingOptionIdRaw && typeof requestedPackingOptionIdRaw === "string"
        ? requestedPackingOptionIdRaw.trim()
        : null;
    const resetSnapshot =
      (body?.reset_snapshot as boolean | undefined) ??
      (body?.resetSnapshot as boolean | undefined) ??
      false;

    // Varianta 1: map pe packingGroupId
    const packingGroupUpdatesRaw =
      (body?.packing_group_updates as Record<string, any> | undefined) ??
      (body?.packingGroupUpdates as Record<string, any> | undefined) ??
      null;

    // Varianta 2: array de groups (dacă preferi din UI)
    const packingGroupsArray =
      (body?.packing_groups as any[] | undefined) ??
      (body?.packingGroups as any[] | undefined) ??
      null;

    const packingGroupUpdates: Record<string, any> = {};
    if (packingGroupUpdatesRaw && typeof packingGroupUpdatesRaw === "object") {
      for (const [k, v] of Object.entries(packingGroupUpdatesRaw)) {
        if (!k) continue;
        packingGroupUpdates[String(k)] = v;
      }
    }
    if (Array.isArray(packingGroupsArray)) {
      for (const g of packingGroupsArray) {
        const id = g?.packingGroupId || g?.id;
        if (!id) continue;
        packingGroupUpdates[String(id)] = {
          dimensions: g?.dimensions ?? g?.boxDimensions ?? null,
          weight: g?.weight ?? g?.boxWeight ?? null,
          boxes: g?.boxes ?? g?.boxCount ?? null
        };
      }
    }

    console.log("fba-plan-step1b ui-updates", {
      traceId,
      resetSnapshot,
      updatesCount: Object.keys(packingGroupUpdates).length
    });
    const confirmPackingOptionFlag =
      (body?.confirmPackingOption as boolean | undefined) ??
      (body?.confirm_packing_option as boolean | undefined) ??
      false;
    if (!requestId || !inboundPlanId) {
      return new Response(JSON.stringify({ error: "request_id și inbound_plan_id sunt necesare" }), {
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
      .select("id, destination_country, company_id, user_id, amazon_snapshot, inbound_plan_id")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!reqData) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Dacă există deja un inbound_plan_id stocat pe request și diferă de cel trimis, folosește-l (idempotent)
    if (reqData?.inbound_plan_id && reqData.inbound_plan_id !== inboundPlanId) {
      inboundPlanId = reqData.inbound_plan_id;
    }
    // dacă avem inboundPlanId din payload și nu e salvat încă, persistă-l imediat (idempotent)
    if (!reqData?.inbound_plan_id && inboundPlanId) {
      await supabase
        .from("prep_requests")
        .update({ inbound_plan_id: inboundPlanId })
        .eq("id", requestId);
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

    // Fetch amazon integration
    const amazonIntegrationIdInput = body?.amazon_integration_id as string | undefined;
    let integ: AmazonIntegration | null = null;
    let integId: string | null = null;
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
      integId = (integ as any)?.id || null;
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
        integId = (integRowById as any)?.id || null;
      } else {
        return new Response(
          JSON.stringify({ error: "Amazon integration not found or inactive", traceId }),
          { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
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
      integId = (integ as any)?.id || integId || null;
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
    const { accessToken: lwaAccessToken, scope: lwaScope } = await getLwaAccessToken(refreshToken, traceId);

    // Debug auth context
    console.log("fba-plan-step1b auth-context", {
      traceId,
      inboundPlanId,
      companyId: reqData.company_id,
      amazonIntegrationId: integId || null,
      marketplaceId,
      region: awsRegion,
      host,
      sellerId,
      refreshToken: maskValue(refreshToken || ""),
      roleArn: SPAPI_ROLE_ARN ? `...${SPAPI_ROLE_ARN.slice(-6)}` : "",
      accessKey: AWS_ACCESS_KEY_ID ? `...${AWS_ACCESS_KEY_ID.slice(-4)}` : "",
      lwaScope: lwaScope || null
    });

    // Step 1b: generate + list packing options for inboundPlanId
    const basePath = "/inbound/fba/2024-03-20";
    const warnings: string[] = [];
    let packingConfirmDenied = false;

    const pollOperationStatus = async (operationId: string, maxAttempts = 12) => {
      let attempt = 0;
      let last: any = null;
      let delayMs = 350;
      while (attempt < maxAttempts) {
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
        const state =
          opRes.json?.payload?.state ||
          opRes.json?.payload?.operationStatus ||
          opRes.json?.state ||
          opRes.json?.operationStatus ||
          opRes.json?.status ||
          null;
        const stateUp = String(state || "").toUpperCase();
        if (["SUCCESS", "FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp) || opRes.res.status >= 400) {
          break;
        }
        await delay(delayMs);
        delayMs = Math.min(Math.floor(delayMs * 1.6), 3200);
      }
      return last;
    };

    const extractErrorDetail = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      const err = (res?.json?.errors && res.json.errors[0]) || null;
      if (err) {
        return `${err.code || ""} ${err.message || ""} ${err.details || ""}`.trim();
      }
      return res?.text?.slice(0, 300) || "";
    };

    const extractPackingOptionsFromResponse = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      if (!res) return [];
      return (
        res.json?.payload?.packingOptions ||
        res.json?.packingOptions ||
        res.json?.PackingOptions ||
        []
      );
    };

    const confirmPackingOption = async (packingOptionIdToConfirm: string) =>
      runWith429Retry(() =>
        signedFetch({
          method: "POST",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/packingOptions/${encodeURIComponent(packingOptionIdToConfirm)}/confirmation`,
          query: "",
          payload: "{}",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.confirmPackingOption",
          marketplaceId,
          sellerId
        })
      );

    const listPackingOptions = async () =>
      runWith429Retry(() =>
        signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/packingOptions`,
          query: "",
          payload: "",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.listPackingOptions",
          marketplaceId,
          sellerId
        })
      );

    // Quick verification: confirm plan is accessible with this token/seller
    const planCheck = await runWith429Retry(() =>
      signedFetch({
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
        operationName: "inbound.v20240320.getInboundPlan.check",
        marketplaceId,
        sellerId
      })
    );

    const debugStatuses: Record<string, { status: number | null; requestId: string | null }> = {};
    const rawSamples: Record<string, string | null> = {};
    const sampleBody = (res: Awaited<ReturnType<typeof signedFetch>> | null) => res?.text?.slice(0, 1200) || null;
    const recordSample = (label: string, res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      debugStatuses[label] = { status: res?.res?.status ?? null, requestId: res?.requestId || null };
      rawSamples[label] = sampleBody(res);
    };

    let listRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
    let genRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
    let genOpId: string | null = null;

    recordSample("planCheck", planCheck);
    if (planCheck?.res?.status === 429) {
      const retryAfterMs = backoffMs(3);
      return new Response(
        JSON.stringify({
          code: "SPAPI_THROTTLED",
          message: "Amazon a răspuns 429 la getInboundPlan (throttled)",
          inboundPlanId,
          traceId,
          retryAfterMs,
          amazonIntegrationId: integId || null,
          debug: { statuses: debugStatuses, rawSamples }
        }),
        { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const planPackingOptionFromPlan =
      planCheck?.json?.payload?.packingOptions?.[0] ||
      planCheck?.json?.packingOptions?.[0] ||
      null;
    const planPlacementStatus =
      planCheck?.json?.payload?.placementOptions?.[0]?.status ||
      planCheck?.json?.placementOptions?.[0]?.status ||
      null;
    const placementLocked =
      typeof planPlacementStatus === "string" &&
      ["ACCEPTED", "CONFIRMED"].includes(String(planPlacementStatus).toUpperCase());

    // Nu mai ieșim prematur dacă placement-ul este ACCEPTED; încercăm totuși să listăm packingOptions

    if (!planCheck.res.ok) {
      warnings.push(
        `Nu am acces la inboundPlanId cu integrarea selectată (${planCheck.res.status}). Verifică seller/token.`
      );
    } else {
      listRes = await listPackingOptions();
      recordSample("listPackingOptions", listRes);
      if (listRes?.res?.status === 429) {
        const retryAfterMs = backoffMs(3);
        return new Response(
          JSON.stringify({
            code: "SPAPI_THROTTLED",
            message: "Amazon a răspuns 429 la listPackingOptions (throttled)",
            inboundPlanId,
            traceId,
            retryAfterMs,
            amazonIntegrationId: integId || null,
            debug: { statuses: debugStatuses, rawSamples }
          }),
          { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      if (!listRes.res.ok) {
        if (listRes.res.status !== 409) {
          const upstreamStatus = listRes.res.status;
          const statusToSend = upstreamStatus >= 500 ? 503 : 502;
          return new Response(
            JSON.stringify({
              code: "SPAPI_LIST_PACKING_FAILED",
              message: `listPackingOptions a eșuat (${upstreamStatus}).`,
              detail: listRes.text?.slice(0, 200) || "",
              inboundPlanId,
              traceId,
              amazonIntegrationId: integId || null,
              debug: { statuses: debugStatuses, rawSamples }
            }),
            { status: statusToSend, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        warnings.push(
          `Packing options list failed (${listRes.res.status}). ${listRes.text?.slice(0, 200) || ""}`
        );
      }

      const packingOptionsSnapshot = extractPackingOptionsFromResponse(listRes);
      const hasPackingGroups = (opts: any[]) => {
        return (opts || []).some((opt) => {
          const pg = Array.isArray(opt?.packingGroups || opt?.PackingGroups) ? opt.packingGroups || opt.PackingGroups : [];
          const pgIds = opt?.packingGroupIds || opt?.PackingGroupIds || [];
          return (Array.isArray(pg) && pg.length > 0) || (Array.isArray(pgIds) && pgIds.length > 0);
        });
      };
      const shouldGenerate =
        listRes.res.ok &&
        (!packingOptionsSnapshot.length || !hasPackingGroups(packingOptionsSnapshot)) &&
        !placementLocked;

      if (placementLocked && (!packingOptionsSnapshot.length || !hasPackingGroups(packingOptionsSnapshot))) {
        warnings.push(
          "PlacementOption este deja ACCEPTED/CONFIRMED și packingOptions nu conțin packingGroupIds. Amazon poate să nu mai permită GeneratePackingOptions; încercăm să listăm ce există."
        );
      }
      if (shouldGenerate) {
        genRes = await signedFetch({
          method: "POST",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/packingOptions`,
          query: "",
          payload: "{}",
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.generatePackingOptions",
          marketplaceId,
          sellerId
        });
        debugStatuses.generatePackingOptions = { status: genRes?.res?.status ?? null, requestId: genRes?.requestId || null };
        rawSamples.generatePackingOptions = sampleBody(genRes);

        if (genRes && !genRes.res.ok && genRes.res.status !== 409) {
          const errMsg = extractErrorDetail(genRes);
          const notSupported =
            String(genRes?.text || "")
              .toLowerCase()
              .includes("does not support packing options") ||
            String(errMsg || "").toLowerCase().includes("does not support packing options");
          if (genRes.res.status === 400 && notSupported) {
            return new Response(
              JSON.stringify({
                code: "PACKING_OPTIONS_NOT_SUPPORTED",
                message:
                  "Amazon a răspuns că acest inbound plan nu suportă packing options. Creează un plan nou sau continuă fără packing options.",
                inboundPlanId,
                traceId,
                amazonIntegrationId: integId || null,
                debug: { statuses: debugStatuses, rawSamples }
              }),
              { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
            );
          }
          warnings.push(
            `Amazon a refuzat generatePackingOptions (${genRes.res.status}). Verifică permisiunile Inbound/packing pe cont. ${errMsg ? `Detaliu: ${errMsg}` : ""}`
          );
        }

        genOpId =
          genRes?.json?.payload?.operationId ||
          genRes?.json?.payload?.OperationId ||
          genRes?.json?.operationId ||
          genRes?.json?.OperationId ||
          null;
        if (genOpId && genRes?.res.ok) {
          const pollRes = await pollOperationStatus(genOpId);
          debugStatuses.generatePackingOptionsPoll = { status: pollRes?.res?.status ?? null, requestId: pollRes?.requestId || null };
          rawSamples.generatePackingOptionsPoll = sampleBody(pollRes);
        }

        listRes = await listPackingOptions();
        recordSample("listPackingOptionsAfterGenerate", listRes);
        if (listRes?.res?.status === 429) {
          const retryAfterMs = backoffMs(3);
          return new Response(
            JSON.stringify({
              code: "SPAPI_THROTTLED",
              message: "Amazon a răspuns 429 la listPackingOptions (după generate).",
              inboundPlanId,
              traceId,
              retryAfterMs,
              amazonIntegrationId: integId || null,
              debug: { statuses: debugStatuses, rawSamples }
            }),
            { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
        // Dacă după generate packing options încă nu conțin packingGroupIds, mai listăm cu backoff scurt (Amazon poate întârzia popularea).
        const hasGroups = (res: Awaited<ReturnType<typeof listPackingOptions>> | null) => {
          if (!res) return false;
          const opts = extractPackingOptionsFromResponse(res) || [];
          return hasPackingGroups(opts);
        };
        if (!hasGroups(listRes)) {
          const maxListRetries = 12;
          for (let i = 1; i <= maxListRetries; i += 1) {
            await delay(600 * i);
            const retryRes = await listPackingOptions();
            recordSample(`listPackingOptionsAfterGenerateRetry${i}`, retryRes);
            if (retryRes?.res?.status === 429) break;
            if (hasGroups(retryRes)) {
              listRes = retryRes;
              break;
            }
          }
        }
        if (listRes?.res?.ok && Array.isArray(listRes?.json?.packingOptions) && listRes.json.packingOptions.length === 0) {
          warnings.push("Amazon nu a returnat packingOptions (posibil lipsă permisiuni GeneratePackingOptions).");
        }
        if (!listRes.res.ok) {
          if (listRes.res.status !== 409) {
            const upstreamStatus = listRes.res.status;
            const statusToSend = upstreamStatus >= 500 ? 503 : 502;
            return new Response(
              JSON.stringify({
                code: "SPAPI_LIST_PACKING_FAILED",
                message: `listPackingOptions a eșuat (${upstreamStatus}).`,
                detail: listRes.text?.slice(0, 200) || "",
                inboundPlanId,
                traceId,
                amazonIntegrationId: integId || null,
                debug: { statuses: debugStatuses, rawSamples }
              }),
              { status: statusToSend, headers: { ...corsHeaders, "content-type": "application/json" } }
            );
          }
          warnings.push(
            `Packing options list failed (${listRes.res.status}). ${listRes.text?.slice(0, 200) || ""}`
          );
        }
      }
    }

    const packingOptions = extractPackingOptionsFromResponse(listRes);
    const mergedPackingOptions = packingOptions.length ? packingOptions : planPackingOptionFromPlan ? [planPackingOptionFromPlan] : [];

    const extractPackingGroupIds = (option: any) => {
      const ids = new Set<string>();
      const direct = option?.packingGroups || option?.PackingGroups || [];
      (Array.isArray(direct) ? direct : []).forEach((g: any) => {
        if (typeof g === "string") {
          ids.add(g);
          return;
        }
        const id = g?.packingGroupId || g?.PackingGroupId || g?.id || g?.groupId || g?.group_id;
        if (id) ids.add(String(id));
      });
      const rawIds =
        option?.packingGroupIds ||
        option?.PackingGroupIds ||
        option?.packing_group_ids ||
        option?.packing_group_id_list ||
        [];
      (Array.isArray(rawIds) ? rawIds : [rawIds]).forEach((id: any) => {
        if (id) ids.add(String(id));
      });
      return Array.from(ids.values());
    };

    const getOptionId = (o: any) => String(o?.packingOptionId || o?.PackingOptionId || o?.id || "");
    const getStatus = (o: any) => String(o?.status || o?.Status || "").toUpperCase();
    const discountsArr = (o: any) => (o?.discounts || o?.Discounts || []);
    const hasDiscount = (o: any) => Array.isArray(discountsArr(o)) && discountsArr(o).length > 0;
    const pickPackingOption = (options: any[], preferredId: string | null = null) => {
      if (!Array.isArray(options) || !options.length) return null;

      // 1) respectă preferința din UI
      if (preferredId) {
        const m = options.find((o) => getOptionId(o) === preferredId);
        if (m) return m;
      }

      // 2) candidate OFFERED/AVAILABLE/READY
      const offered = options.filter((o) => ["OFFERED", "AVAILABLE", "READY"].includes(getStatus(o)));
      const pool = offered.length ? offered : options;

      // 3) preferă Standard (fără discount/split)
      const standard = pool.find((o) => !hasDiscount(o));
      if (standard) return standard;

      // 4) fallback
      return pool[0];
    };

    let chosen = pickPackingOption(mergedPackingOptions, requestedPackingOptionId);
    const packingOptionId =
      chosen?.packingOptionId ||
      chosen?.PackingOptionId ||
      chosen?.id ||
      null;

    let packingGroupIds = extractPackingGroupIds(chosen || {});

    // If Amazon has not yet populated packingGroupIds, poll listPackingOptions a few times
    if (!packingGroupIds.length) {
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        await delay(200 * attempt);
        const retryRes = await listPackingOptions();
        recordSample(`listPackingOptionsRetry${attempt}`, retryRes);
        if (retryRes?.res?.ok) {
          const retryOptions = extractPackingOptionsFromResponse(retryRes);
          const retryChosen = pickPackingOption(retryOptions.length ? retryOptions : mergedPackingOptions);
          const retryIds = extractPackingGroupIds(retryChosen || {});
          if (retryIds.length) {
            packingGroupIds = retryIds;
            chosen = retryChosen || chosen;
            listRes = retryRes;
            break;
          }
        }
      }
    }

    const packingOptionsCount = mergedPackingOptions?.length ?? 0;

    // Confirmăm packingOption-ul doar dacă placement NU este deja confirmat;
    // când placement este ACCEPTED/CONFIRMED, ConfirmPackingOption întoarce 400.
    if (packingOptionId && !placementLocked && confirmPackingOptionFlag) {
      const confirmRes = await confirmPackingOption(packingOptionId);
      debugStatuses.confirmPackingOption = { status: confirmRes?.res?.status ?? null, requestId: confirmRes?.requestId || null };
      rawSamples.confirmPackingOption = sampleBody(confirmRes);
      if (confirmRes && !confirmRes.res.ok && confirmRes.res.status !== 409) {
        const detail = extractErrorDetail(confirmRes);
        if (confirmRes.res.status === 403) {
          packingConfirmDenied = true;
          warnings.push(
            `ConfirmPackingOption a fost refuzat (403). Verifică autorizarea seller/app pentru fba_inbound v2024-03-20.${detail ? " " + detail : ""}`
          );
        } else {
          warnings.push(
            `ConfirmPackingOption a eșuat (${confirmRes.res.status}). ${detail}`
          );
        }
      }
    }

    let placementOptionId: string | null = null;
    let placementOptionsList: any[] = [];
    let planShipments: any[] = [];

    const debugSnapshot = (failed = false, extra: Record<string, unknown> = {}) => ({
      packingGroupIds,
      failedGroupFetch: failed,
      packingOptionsCount,
      genOperationId: genOpId,
      placementLocked,
      statuses: debugStatuses,
      rawSamples,
      ...extra
    });

    const resolveUpstreamStatus = (resObj: Awaited<ReturnType<typeof signedFetch>> | null) => resObj?.res?.status ?? null;
    const listStatus = resolveUpstreamStatus(listRes);
    const planStatus = resolveUpstreamStatus(planCheck);
    const generationInFlight =
      !!genRes ||
      !!genOpId ||
      listStatus === 202 ||
      planStatus === 202 ||
      listStatus === 409; // 409 from Amazon can mean generate already in progress

    // Explicit throttling handling
    if (listStatus === 429 || planStatus === 429) {
      return new Response(
        JSON.stringify({
          code: "SPAPI_THROTTLED",
          message: "SP-API a răspuns cu 429 (throttling) pentru planCheck/listPackingOptions.",
          traceId,
          inboundPlanId,
          packingOptionId: null,
          placementOptionId,
          amazonIntegrationId: integId || null,
          debug: debugSnapshot()
        }),
        { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const processingLikely = (!packingGroupIds.length || !packingOptionId) && generationInFlight;
    if (processingLikely) {
      const retryAfterMs = backoffMs(2);
      return new Response(
        JSON.stringify({
          code: "PACKING_OPTIONS_PROCESSING",
          message: "PackingOptions sunt în curs de generare la Amazon. Reîncearcă în câteva secunde.",
          traceId,
          inboundPlanId,
          packingOptionId: packingOptionId || null,
          placementOptionId: null,
          amazonIntegrationId: integId || null,
          retryAfterMs,
          debug: debugSnapshot(false, { generationInFlight: true })
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Upstream failure (auth/perm/5xx) before we even have packingGroupIds
    if (planCheck && !planCheck.res.ok) {
      const status = planStatus && planStatus >= 500 ? 503 : 502;
      return new Response(
        JSON.stringify({
          code: "SPAPI_PLAN_CHECK_FAILED",
          message: `SP-API getInboundPlan a eșuat cu status ${planStatus ?? "n/a"}.`,
          traceId,
          inboundPlanId,
          packingOptionId: null,
          placementOptionId,
          amazonIntegrationId: integId || null,
          debug: debugSnapshot()
        }),
        { status, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    if (listRes && !listRes.res.ok) {
      const status = listStatus && listStatus >= 500 ? 503 : 502;
      return new Response(
        JSON.stringify({
          code: "SPAPI_LIST_PACKING_FAILED",
          message: `SP-API listPackingOptions a eșuat cu status ${listStatus ?? "n/a"}.`,
          traceId,
          inboundPlanId,
          packingOptionId: null,
          placementOptionId,
          amazonIntegrationId: integId || null,
          debug: debugSnapshot()
        }),
        { status, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Dacă după generate/poll Amazon continuă să returneze 200 cu packingOptions goale și nu există operație în curs,
    // considerăm planul ca fiind nesuportat pentru packing options și trimitem răspuns explicit.
    if (!packingGroupIds.length && packingOptionsCount === 0 && listRes?.res?.ok && !generationInFlight) {
      return new Response(
        JSON.stringify({
          code: "PACKING_OPTIONS_NOT_AVAILABLE",
          message:
            "Amazon nu a returnat packingOptions pentru acest inbound plan (posibil plan nesuportat pentru packing options). Creează un plan nou sau continuă fluxul fără pack groups.",
          traceId,
          inboundPlanId,
          packingOptionId: null,
          placementOptionId: null,
          amazonIntegrationId: integId || null,
          debug: debugSnapshot()
        }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    if (includePlacement) {
      // Placement options (necesare pentru Step 2 - shipping)
      const extractPlacementOptions = (res: Awaited<ReturnType<typeof signedFetch>> | null) =>
        (res?.json?.payload?.placementOptions ||
          res?.json?.placementOptions ||
          res?.json?.PlacementOptions ||
          []) as any[];

      const listPlacementOptions = async () =>
        signedFetch({
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

      const generatePlacementOptions = async () =>
        signedFetch({
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

      let placementListRes: Awaited<ReturnType<typeof signedFetch>> | null = await listPlacementOptions();
      if (!placementListRes || (placementListRes.res.ok && !extractPlacementOptions(placementListRes).length)) {
        const genPlacement = await generatePlacementOptions();
        const opId =
          genPlacement?.json?.payload?.operationId ||
          genPlacement?.json?.operationId ||
          null;
        if (opId) await pollOperationStatus(opId);
        placementListRes = await listPlacementOptions();
      }
      placementOptionsList = extractPlacementOptions(placementListRes);
      placementOptionId =
        placementOptionsList?.[0]?.placementOptionId ||
        placementOptionsList?.[0]?.id ||
        null;
      if (!placementOptionId) {
        warnings.push("Nu am putut obține placementOptionId (generate/list).");
      }
      planShipments = planCheck?.json?.payload?.shipments || planCheck?.json?.shipments || [];
    }

    const fetchGroupItems = async (groupId: string) => {
      const res = await signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/packingGroups/${encodeURIComponent(groupId)}/items`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.listPackingGroupItems",
        marketplaceId,
        sellerId
      });
      if (!res.res.ok) {
        return { packingGroupId: groupId, items: [], status: res.res.status, error: res.text };
      }
      const items =
        res.json?.payload?.items ||
        res.json?.items ||
        res.json?.Items ||
        [];
      const normalizedItems = (Array.isArray(items) ? items : []).map((it: any) => ({
        msku: it.msku || it.SellerSKU || it.sellerSku || it.sku || "",
        asin: it.asin || it.ASIN || it.Asin || "",
        fnsku: it.fnsku || it.fulfillmentNetworkSku || it.FulfillmentNetworkSku || "",
        quantity: Number(it.quantity || it.Quantity || 0) || 0,
        labelOwner: it.labelOwner || it.LabelOwner || null,
        prepOwner: it.prepOwner || it.PrepOwner || null
      }));
      return {
        packingGroupId: groupId,
        items: normalizedItems,
        status: res.res.status,
        requestId: res.requestId || null,
        pagination: res.json?.pagination || res.json?.Pagination || null
      };
    };

    const fetchGroupItemsWithRetry = async (groupId: string) => {
      const transientStatuses = new Set([0, 202, 404, 429, 500, 502, 503, 504]);
      let last: any = null;
      const maxAttempts = 5;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        last = await fetchGroupItems(groupId);
        if (!transientStatuses.has(Number(last?.status || 0)) && Number(last?.status || 0) < 400) {
          break;
        }
        if (attempt < maxAttempts) {
          await delay(300 * attempt); // 300ms, 600ms, 900ms, 1200ms, 1500ms
        }
      }
      return last;
    };

    const packingGroups = [];
    for (const gid of packingGroupIds) {
      // sequential to respect throttling limits
      const grp = await fetchGroupItemsWithRetry(gid);
      // ensure packingGroupId is present even if SP-API omits it in the payload
      if (!grp.packingGroupId && gid) {
        (grp as any).packingGroupId = gid;
      }
      packingGroups.push(grp);
      await delay(50);
    }

    const transientStatuses = new Set([202, 404, 429, 500, 502, 503, 504]);
    const transientGroupProblem = packingGroups.some((g: any) => transientStatuses.has(Number(g?.status || 0)));
    const hardGroupProblem = packingGroups.some((g: any) => {
      const s = Number(g?.status || 0);
      return s >= 400 && !transientStatuses.has(s);
    });
    if (!packingGroupIds.length || !packingGroups.length || transientGroupProblem) {
      const retryAfterMs = 2500;
      return new Response(
        JSON.stringify({
          code: "PACKING_GROUPS_PROCESSING",
          message: "Packing groups sunt încă în procesare la Amazon. Reîncearcă.",
          traceId,
          inboundPlanId,
          packingOptionId,
          placementOptionId,
          amazonIntegrationId: integId || null,
          retryAfterMs,
          debug: debugSnapshot(transientGroupProblem)
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    if (hardGroupProblem) {
      return new Response(
        JSON.stringify({
          code: "PACKING_GROUPS_NOT_READY",
          message: "Amazon a returnat eroare non-transient pentru packing groups.",
          traceId,
          inboundPlanId,
          packingOptionId,
          placementOptionId,
          amazonIntegrationId: integId || null,
          debug: debugSnapshot(true)
        }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Fetch metadata for SKUs + confirmed quantities from DB
    const fetchSkuMeta = async () => {
      const { data: prepItems } = await supabase
        .from("prep_request_items")
        .select("sku, product_name, units_sent, units_requested, stock_item_id")
        .eq("prep_request_id", requestId);

      const stockIds = Array.from(
        new Set(
          (prepItems || [])
            .map((it: any) => it.stock_item_id)
            .filter((id: any) => typeof id === "number" && Number.isFinite(id))
        )
      );
      const skuList = Array.from(
        new Set(
          (prepItems || [])
            .map((it: any) => normalizeSku(it.sku))
            .filter((s: string) => s)
        )
      );

      let stockById: Record<number, { image_url?: string | null; sku?: string | null }> = {};
      let stockBySku: Record<string, { image_url?: string | null; sku?: string | null }> = {};

      if (stockIds.length) {
        const { data: stockRows } = await supabase
          .from("stock_items")
          .select("id, sku, image_url")
          .in("id", stockIds);
        if (Array.isArray(stockRows)) {
          stockById = stockRows.reduce((acc: any, row: any) => {
            acc[row.id] = row;
            return acc;
          }, {});
        }
      }

      if (skuList.length) {
        const { data: stockRowsBySku } = await supabase
          .from("stock_items")
          .select("id, sku, image_url")
          .in("sku", skuList);
        if (Array.isArray(stockRowsBySku)) {
          stockBySku = stockRowsBySku.reduce((acc: any, row: any) => {
            const key = normalizeSku(row.sku);
            if (key) acc[key] = row;
            return acc;
          }, {});
        }
      }

      const skuMeta = new Map<string, { title: string | null; image: string | null; defaultQty: number }>();
      const confirmedQuantities: Record<string, number> = {};

      (prepItems || []).forEach((it: any) => {
        const skuKey = normalizeSku(it.sku);
        if (!skuKey) return;

        const confirmedQty = Number(it.units_sent ?? it.units_requested ?? 0) || 0;
        confirmedQuantities[skuKey] = confirmedQty;

        const fromId = it.stock_item_id ? stockById[it.stock_item_id] : null;
        const fromSku = stockBySku[skuKey] || null;
        const image = fromId?.image_url || fromSku?.image_url || null;

        skuMeta.set(skuKey, {
          title: it.product_name || skuKey,
          image,
          defaultQty: confirmedQty
        });
      });

      return { skuMeta, confirmedQuantities };
    };

    const { skuMeta, confirmedQuantities } = await fetchSkuMeta();

    // Normalize packing groups for UI (ensure id/boxes/packMode fields exist) and decorate items
    const normalizeItems = (items: any[] = []) =>
      (Array.isArray(items) ? items : []).map((it: any, idx: number) => {
        const skuKey = normalizeSku(it.msku || it.sku || it.SellerSKU || `item-${idx + 1}`);
        const meta = skuMeta.get(skuKey);
        return {
          ...it,
          sku: skuKey,
          title: meta?.title || skuKey,
          image: meta?.image || null,
          quantity: Number(it.quantity || it.Quantity || meta?.defaultQty || 0) || 0
        };
      });

    const normalizedPackingGroups = packingGroups.map((g, idx) => {
      const pgId = (g as any)?.packingGroupId || (g as any)?.id || `group-${idx + 1}`;
      const boxes = Number((g as any)?.boxes || (g as any)?.boxCount || 1) || 1;
      const items = normalizeItems((g as any)?.items);
      const dims =
        (g as any)?.dimensions ||
        (g as any)?.boxDimensions ||
        null;
      const weight =
        (g as any)?.weight ||
        (g as any)?.boxWeight ||
        null;
      const packModeRaw = (g as any)?.packMode || null;
      return {
        ...g,
        id: pgId,
        packingGroupId: pgId,
        boxes,
        packMode: packModeRaw || (boxes > 1 ? "multiple" : "single"),
        title: (g as any)?.title || null,
        items,
        dimensions: dims || null,
        weight: weight || null
      };
    });

    // Dacă packing groups vin fără dimensiuni/greutate, încearcă să rehidratezi din snapshot-ul salvat pe request.
    const snapshotGroups = resetSnapshot
      ? []
      : (reqData as any)?.amazon_snapshot?.fba_inbound?.packingGroups ||
        (reqData as any)?.amazon_snapshot?.packingGroups ||
        [];
    if (Array.isArray(snapshotGroups) && snapshotGroups.length) {
      const byId = new Map<string, any>();
      snapshotGroups.forEach((sg: any) => {
        const id = sg?.packingGroupId || sg?.id;
        if (id) byId.set(String(id), sg);
      });
      normalizedPackingGroups.forEach((g) => {
        const gid = String(g.packingGroupId);
        const ui = packingGroupUpdates[gid] || null;

        // 1) valorile din UI au prioritate
        if (ui) {
          if (ui?.dimensions !== undefined) g.dimensions = ui.dimensions;
          if (ui?.weight !== undefined) g.weight = ui.weight;
          if (ui?.boxes !== undefined && ui.boxes !== null) g.boxes = Number(ui.boxes) || g.boxes;
          return;
        }

        // 2) fallback la snapshot
        const cached = byId.get(gid);
        if (!cached) return;
        if (!g.dimensions) g.dimensions = cached.boxDimensions || cached.dimensions || null;
        if (!g.weight) g.weight = cached.boxWeight || cached.weight || null;
      });
    }
    const hasPackingGroups = packingGroupIds.length > 0 && normalizedPackingGroups.length > 0;

    if (!hasPackingGroups) {
      const message = packingGroupIds.length === 0
        ? "packingGroupIds lipsesc după list/generate (plan posibil blocat după confirmarea placement-ului)."
        : "packingGroups nu sunt gata după list/generate.";
      return new Response(
        JSON.stringify({
          code: "PACKING_GROUPS_NOT_READY",
          message,
          traceId,
          inboundPlanId,
          packingOptionId,
          placementOptionId,
          amazonIntegrationId: integId || null,
          debug: debugSnapshot(failedGroupFetch)
        }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const effectivePackingGroups = normalizedPackingGroups;

    // Compare confirmed quantities (DB) vs quantities in packing groups (Amazon)
    const summedFromAmazon: Record<string, number> = {};
    (effectivePackingGroups || []).forEach((g: any) => {
      (g?.items || []).forEach((it: any) => {
        const sku = normalizeSku(it?.sku || it?.msku || "");
        const q = Number(it?.quantity || 0) || 0;
        if (!sku) return;
        summedFromAmazon[sku] = (summedFromAmazon[sku] || 0) + q;
      });
    });

    const quantityMismatches = Object.keys(confirmedQuantities || {})
      .map((sku) => {
        const confirmed = Number(confirmedQuantities[sku] || 0) || 0;
        const amazon = Number(summedFromAmazon[sku] || 0) || 0;
        return { sku, confirmed, amazon, delta: amazon - confirmed };
      })
      .filter((r) => r.delta !== 0);

    try {
      console.log(
        JSON.stringify(
          {
            tag: "packingGroups_debug",
            traceId,
            inboundPlanId,
            packingOptionId,
            placementOptionId,
            count: effectivePackingGroups.length,
            groups: effectivePackingGroups.map((g: any) => ({
              id: g.packingGroupId,
              boxes: g.boxes,
              hasDimensions: Boolean(g.dimensions),
              hasWeight: Boolean(g.weight),
              items: Array.isArray(g.items) ? g.items.length : 0
            }))
          },
          null,
          2
        )
      );
    } catch (_e) {
      // ignore logging errors
    }

    const warning = warnings.length ? warnings.join(" ") : null;

    // Persist inbound/placement IDs + packing snapshot to avoid losing context between steps.
    // Nu suprascrie dimensiunile/greutatea dacă SP-API nu le furnizează.
    try {
      const snapshotBase = (reqData as any)?.amazon_snapshot || {};
      const prevGroups =
        Array.isArray(snapshotBase?.fba_inbound?.packingGroups) && snapshotBase.fba_inbound.packingGroups.length
          ? snapshotBase.fba_inbound.packingGroups
          : [];
      const prevById = new Map<string, any>();
      prevGroups.forEach((pg: any) => {
        const id = pg?.packingGroupId || pg?.id;
        if (id) prevById.set(String(id), pg);
      });
      const mergedGroups = (effectivePackingGroups || []).map((g: any) => {
        const gid = String(g.packingGroupId || g.id);
        const ui = packingGroupUpdates[gid] || null;

        const prev = resetSnapshot ? null : (prevById.get(gid) || null);
        const prevDims =
          prev?.boxDimensions ||
          prev?.dimensions ||
          (prev?.length && prev?.width && prev?.height
            ? {
                length: prev.length,
                width: prev.width,
                height: prev.height,
                unitOfMeasurement: prev.unit || prev.unitOfMeasurement || "IN"
              }
            : null);
        const prevWeight = prev?.boxWeight || prev?.weight || prev?.weightLb || null;

        const nextDims =
          ui?.dimensions !== undefined ? ui.dimensions : (g.dimensions ?? prevDims ?? null);
        const nextWeight =
          ui?.weight !== undefined ? ui.weight : (g.weight ?? prevWeight ?? null);
        const nextBoxes =
          ui?.boxes !== undefined && ui.boxes !== null ? (Number(ui.boxes) || g.boxes) : g.boxes;

        return {
          ...g,
          boxes: nextBoxes,
          dimensions: nextDims,
          weight: nextWeight
        };
      });

      const nextSnapshot = {
        ...(snapshotBase || {}),
        fba_inbound: {
          ...(snapshotBase?.fba_inbound || {}),
          inboundPlanId,
          packingOptionId,
          placementOptionId,
          shipments: planShipments,
          packingGroups: mergedGroups,
          savedAt: new Date().toISOString()
        }
      };
      await supabase
        .from("prep_requests")
        .update({
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptionId || null,
          packing_option_id: packingOptionId || null,
          amazon_snapshot: nextSnapshot
        })
        .eq("id", requestId);
    } catch (persistErr) {
      console.error("prep_requests persist inbound/placement failed", { traceId, error: persistErr });
    }

    const filteredPackingOptions = (mergedPackingOptions || []).filter((o: any) => !hasDiscount(o));
    const packingOptionsToReturn = filteredPackingOptions.length ? filteredPackingOptions : mergedPackingOptions || [];

    return new Response(
      JSON.stringify({
        inboundPlanId,
        packingOptionId,
        placementOptionId,
        packingOptions: packingOptionsToReturn,
        shipments: planShipments,
        packingGroups: effectivePackingGroups,
        traceId,
        status: {
          planCheck: planCheck.res.status,
          generate: genRes?.res.status ?? null,
          list: listRes?.res.status ?? null
        },
        requestId: listRes?.requestId || genRes?.requestId || planCheck.requestId || null,
        warning,
        packingConfirmDenied,
        amazonIntegrationId: integId || null,
        confirmedQuantities,
        quantityMismatches
      }),
      { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("fba-plan-step1b error", { traceId, error: e });
    return new Response(JSON.stringify({ error: e?.message || "Server error", detail: `${e}`, traceId }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
