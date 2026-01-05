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
  const sigHeaders = await signRequest({
    method,
    service,
    region,
    host,
    path,
    query,
    payload,
    accessKey,
    secretKey,
    sessionToken
  });
  const url = `https://${host}${path}${query ? `?${query}` : ""}`;
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
    const requestId = body?.request_id as string | undefined;
    const inboundPlanId = body?.inbound_plan_id as string | undefined;
    const placementOptionId = body?.placement_option_id as string | undefined;
    const amazonIntegrationIdInput = body?.amazon_integration_id as string | undefined;
    const confirmOptionId = body?.transportation_option_id as string | undefined;
    const shipmentTransportConfigs = body?.shipment_transportation_configurations || [];
    const readyToShipStart = body?.ship_date as string | undefined;

    if (!requestId || !inboundPlanId) {
      return new Response(JSON.stringify({ error: "request_id și inbound_plan_id sunt necesare", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    if (!placementOptionId) {
      return new Response(JSON.stringify({ error: "placement_option_id este necesar pentru Step 2", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

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

    const pollOperationStatus = async (operationId: string) => {
      const maxAttempts = 8;
      let attempt = 0;
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
        const state =
          opRes.json?.payload?.state ||
          opRes.json?.state ||
          null;
        const stateUp = String(state || "").toUpperCase();
        if (["SUCCESS", "FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp) || opRes.res.status >= 400) {
          return opRes;
        }
        await delay(250 * attempt);
      }
      return null;
    };

    const ensurePlacement = async () => {
      // dacă avem placementOptionId din client, îl folosim; altfel generăm + confirmăm prima opțiune
      let placementId = placementOptionId || null;
      let placementShipments: any[] = [];
      if (!placementId) {
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
        const opId =
          genPlacement?.json?.payload?.operationId ||
          genPlacement?.json?.operationId ||
          null;
        if (opId) {
          await pollOperationStatus(opId);
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
            path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions/${encodeURIComponent(placementId)}:confirm`,
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

    // Confirmăm placement-ul (cerință SP-API) înainte de transport
    const placementConfirm = await signedFetch({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/placementOptions/${encodeURIComponent(placementOptionId)}/confirmation`,
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

    const pollOperationStatus = async (operationId: string) => {
      const maxAttempts = 24; // ~60-90s cu backoff
      let attempt = 0;
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
        const state = opRes.json?.payload?.state || opRes.json?.state || null;
        const stateUp = String(state || "").toUpperCase();
        if (["SUCCESS", "FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp) || opRes.res.status >= 400) {
          return opRes;
        }
        await delay(500 * attempt);
      }
      return null;
    };

    const placementOpId =
      placementConfirm?.json?.payload?.operationId ||
      placementConfirm?.json?.operationId ||
      null;
    if (!placementConfirm?.res?.ok && !placementOpId) {
      return new Response(JSON.stringify({ error: "Placement confirmation failed", traceId, status: placementConfirm?.res?.status }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    if (placementOpId) {
      const placementStatus = await pollOperationStatus(placementOpId);
      const st = placementStatus?.json?.payload?.state || placementStatus?.json?.state || placementStatus?.res?.status;
      const stateUp = String(st || "").toUpperCase();
      if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
        return new Response(JSON.stringify({ error: "Placement confirmation failed", traceId, state: stateUp }), {
          status: 502,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    // După confirm placement, citim planul pentru a obține shipments + IDs
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

    if (!planRes?.res?.ok) {
      return new Response(JSON.stringify({ error: "Nu pot citi inbound plan după confirmarea placementului", traceId, status: planRes?.res?.status }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const placementShipments =
      planRes?.json?.shipments ||
      planRes?.json?.payload?.shipments ||
      [];

    if (!Array.isArray(placementShipments) || !placementShipments.length) {
      return new Response(JSON.stringify({ error: "Nu există shipments după confirmarea placementului", traceId }), {
        status: 502,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const readyStartIso = (() => {
      if (readyToShipStart) return new Date(readyToShipStart).toISOString();
      const now = new Date();
      return now.toISOString();
    })();

    const shipmentTransportationConfigurations = placementShipments.map((sh: any, idx: number) => ({
      shipmentId: sh.shipmentId || sh.id || `s-${idx + 1}`,
      readyToShipWindow: { start: readyStartIso }
    }));

    // 1) Generate transportation options (idempotent)
    const generatePayload = JSON.stringify({
      placementOptionId,
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

    const opId =
      genRes?.json?.payload?.operationId ||
      genRes?.json?.operationId ||
      null;

    if (opId) {
      const genStatus = await pollOperationStatus(opId);
      const st = genStatus?.json?.payload?.state || genStatus?.json?.state || genStatus?.res?.status;
      const stateUp = String(st || "").toUpperCase();
      if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
        return new Response(JSON.stringify({ error: "Generate transportation options failed", traceId, state: stateUp }), {
          status: 502,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    // 2) List transportation options
    const listRes = await signedFetch({
      method: "GET",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/transportationOptions`,
      query: `placementOptionId=${encodeURIComponent(placementOptionId)}`,
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

    const options =
      listRes?.json?.payload?.transportationOptions ||
      listRes?.json?.transportationOptions ||
      listRes?.json?.TransportationOptions ||
      [];

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

    const normalizedOptions = Array.isArray(options)
      ? options.map((opt: any) => ({
          id: opt.transportationOptionId || opt.id || opt.optionId || null,
          partnered: Boolean(opt.partneredCarrier || opt.isPartnered || opt.partnered),
          mode: opt.mode || opt.shippingMode || opt.method || null,
          carrierName: opt.carrierName || opt.carrier || null,
          charge: extractCharge(opt),
          raw: opt
        }))
      : [];

    // pick a default: partnered if available, otherwise first option
    const partneredOpt = normalizedOptions.find((o) => o.partnered);
    const defaultOpt = partneredOpt || normalizedOptions[0] || null;

    const summary = {
      partneredAllowed: Boolean(partneredOpt),
      partneredRate: partneredOpt?.charge ?? null,
      defaultOptionId: defaultOpt?.id || null,
      defaultCarrier: defaultOpt?.carrierName || null,
      defaultMode: defaultOpt?.mode || null,
      defaultCharge: defaultOpt?.charge ?? null
    };

    // 3) If client asked to confirm an option, call confirmation endpoint
    let confirmRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
    if (confirmOptionId) {
      const selectedOption = normalizedOptions.find((o) => o.id === confirmOptionId) || normalizedOptions[0] || null;
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
      confirmRes = await signedFetch({
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

      const confirmOpId =
        confirmRes?.json?.payload?.operationId ||
        confirmRes?.json?.operationId ||
        null;
      if (confirmOpId) {
        const confirmStatus = await pollOperationStatus(confirmOpId);
        const st = confirmStatus?.json?.payload?.state || confirmStatus?.json?.state || confirmStatus?.res?.status;
        const stateUp = String(st || "").toUpperCase();
        if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
          return new Response(JSON.stringify({ error: "Transportation confirmation failed", traceId, state: stateUp }), {
            status: 502,
            headers: { ...corsHeaders, "content-type": "application/json" }
          });
        }
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
        const contents = payload?.contents || payload?.Contents || {};
        list.push({
          id: shId,
          from: payload?.shipFromAddress || payload?.from || null,
          to: payload?.destinationAddress || payload?.to || null,
          boxes: contents?.boxes || contents?.cartons || null,
          skuCount: contents?.skuCount || null,
          units: contents?.units || null,
          weight: contents?.weight || null
        });
      }
      return list;
    };

    const shipments = await normalizeShipmentsFromPlan();

    return new Response(
      JSON.stringify({
        inboundPlanId,
        placementOptionId: placementOptionId || null,
        options,
        shipments,
        summary,
        status: {
          placementConfirm: placementConfirm?.res?.status ?? null,
          generate: genRes?.res.status ?? null,
          list: listRes?.res.status ?? null,
          confirm: confirmRes?.res.status ?? null
        },
        requestId: confirmRes?.requestId || listRes?.requestId || genRes?.requestId || null,
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
