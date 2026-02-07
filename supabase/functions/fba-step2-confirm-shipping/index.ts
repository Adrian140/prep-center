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

function toBool(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "yes", "1"].includes(s)) return true;
    if (["false", "no", "0"].includes(s)) return false;
  }
  return null;
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
  return pairs.map((p) => `${awsPercentEncode(p.key)}=${awsPercentEncode(p.value)}`).join("&");
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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function cmToIn(cm: any) {
  const num = Number(cm);
  if (!Number.isFinite(num)) return 0;
  return round2(num / 2.54);
}

function kgToLb(kg: any) {
  const num = Number(kg);
  if (!Number.isFinite(num)) return 0;
  return round2(num * 2.2046226218);
}

function lbToKg(lb: any) {
  const num = Number(lb);
  if (!Number.isFinite(num)) return 0;
  return round2(num / 2.2046226218);
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
  lwaToken?: string | null;
}) {
  const { method, service, region, host, path, query, payload, accessKey, secretKey, sessionToken, lwaToken } = opts;
  const t = new Date();
  const amzDate = t.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const hashedPayload = await sha256(payload);
  const headerMap: Record<string, string> = {
    host,
    "x-amz-date": amzDate
  };
  if (lwaToken) headerMap["x-amz-access-token"] = lwaToken;
  if (sessionToken) headerMap["x-amz-security-token"] = sessionToken;
  const sortedHeaderKeys = Object.keys(headerMap).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headerMap[k]}`).join("\n") + "\n";
  const signedHeaders = sortedHeaderKeys.join(";");
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
    "x-amz-date": amzDate
  };
  const hasBody = payload !== "";
  if (hasBody && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
    headers["content-type"] = "application/json";
  }
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
    sessionToken,
    lwaToken
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
    const methodUpper = method.toUpperCase();
    const res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: ["POST", "PUT", "PATCH"].includes(methodUpper) ? payload : undefined
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
    const selectedPartnered = toBool(body?.selected_partnered ?? body?.selectedPartnered);
    const selectedShippingSolution =
      body?.selected_shipping_solution ?? body?.selectedShippingSolution ?? null;
    const selectedCarrierName =
      body?.selected_carrier_name ?? body?.selectedCarrierName ?? null;
    const selectedCarrierCode =
      body?.selected_carrier_code ?? body?.selectedCarrierCode ?? null;
    const selectedModeHint =
      body?.selected_mode ?? body?.selectedMode ?? null;
    const deliveryWindowStartInput = body?.delivery_window_start ?? body?.deliveryWindowStart ?? null;
    const deliveryWindowEndInput = body?.delivery_window_end ?? body?.deliveryWindowEnd ?? null;
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
      hasRequest: Boolean(requestId),
      shouldConfirmRaw: body?.confirm ?? body?.confirmTransportation ?? null,
      skipConfirmRaw: body?.skip_confirm ?? body?.skipConfirm ?? null,
      forcePartneredIfAvailableRaw: body?.force_partnered_if_available ?? body?.forcePartneredIfAvailable ?? null,
      forcePartneredOnlyRaw: body?.force_partnered_only ?? body?.forcePartneredOnly ?? null
    });
    logStep("shippingMode_resolved", {
      traceId,
      shippingModeInput,
      effectiveShippingMode
    });

    if (!requestId || !inboundPlanId) {
      return new Response(JSON.stringify({ error: "request_id și inbound_plan_id sunt necesare", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    const confirmRaw = body?.confirm ?? body?.confirmTransportation;
    const confirmExplicit = confirmRaw !== undefined && confirmRaw !== null;
    const skipConfirm = Boolean(body?.skip_confirm ?? body?.skipConfirm ?? false);
    // Backward-safe behavior:
    // - if confirm is explicit, respect it;
    // - if confirm is missing, infer confirm=true only when a transportation_option_id is sent.
    const shouldConfirm = (confirmExplicit ? Boolean(confirmRaw) : Boolean(confirmOptionId)) && !skipConfirm;
    const autoConfirmPlacement =
      body?.auto_confirm_placement ?? body?.autoConfirmPlacement ?? false;
    const shouldConfirmPlacement =
      !(body?.skip_placement_confirm ?? body?.skipPlacementConfirm ?? false) &&
      (shouldConfirm || autoConfirmPlacement);
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
      .select("id, destination_country, warehouse_country, company_id, user_id, amazon_snapshot, packing_option_id, placement_option_id, inbound_plan_id")
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
    const existingPlanId = (reqData as any)?.inbound_plan_id || null;
    if (existingPlanId && inboundPlanId && existingPlanId !== inboundPlanId) {
      // Request-ul din UI poate rămâne stale după regenerări; încercăm fallback pe request-ul care deține inboundPlanId.
      const alt = await supabase
        .from("prep_requests")
        .select("id, destination_country, warehouse_country, company_id, user_id, amazon_snapshot, packing_option_id, placement_option_id, inbound_plan_id")
        .eq("inbound_plan_id", inboundPlanId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const altData = alt?.data || null;
      const canUseAlt =
        !!altData &&
        (userIsAdmin ||
          altData.user_id === user.id ||
          (!!userCompanyId && !!altData.company_id && altData.company_id === userCompanyId));

      if (canUseAlt) {
        logStep("prepRequestInboundPlanMismatchFallback", {
          traceId,
          fromRequestId: requestId,
          toRequestId: altData.id,
          inboundPlanId
        });
        requestId = altData.id;
        reqData = altData as any;
      } else {
        return new Response(JSON.stringify({
          error: "Inbound plan mismatch for this request",
          code: "INBOUND_PLAN_MISMATCH",
          traceId,
          requestId,
          inboundPlanId,
          existingPlanId
        }), {
          status: 409,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    const snapshot =
      (reqData as any)?.amazon_snapshot?.fba_inbound ||
      (reqData as any)?.amazon_snapshot ||
      {};
    const snapshotPackingGroups =
      snapshot?.packingGroups ||
      snapshot?.packing_groups ||
      [];
    if (!effectivePackingOptionId && snapshot?.packingOptionId) {
      effectivePackingOptionId = snapshot.packingOptionId;
    }
    if (!effectivePlacementOptionId && snapshot?.placementOptionId) {
      effectivePlacementOptionId = snapshot.placementOptionId;
    }

    const destCountry = (reqData.destination_country || "").toUpperCase();
    const normalizeWarehouseCountry = (val: any) => {
      const up = String(val || "").trim().toUpperCase();
      if (up === "DE" || up === "GERMANY" || up === "DEU") return "DE";
      return "FR";
    };
    const warehouseCountry = normalizeWarehouseCountry(
      body?.warehouse_country ??
        body?.warehouseCountry ??
        (reqData as any)?.warehouse_country ??
        destCountry ??
        "FR"
    );
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
    if (amazonIntegrationIdInput) {
      const { data: integRowById } = await supabase
        .from("amazon_integrations")
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("id", amazonIntegrationIdInput)
        .eq("status", "active")
        .maybeSingle();
      if (integRowById) {
        integ = integRowById as any;
      } else {
        return new Response(
          JSON.stringify({ error: "Amazon integration not found or inactive", traceId }),
          { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }
    if (!integ && inferredMarketplace) {
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
    const normalizeOperationProblems = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      const probs = getOperationProblems(res);
      if (!probs) return [];
      if (Array.isArray(probs)) return probs;
      if (typeof probs === "string") return [{ message: probs }];
      return [probs];
    };
    const packingProblemCodes = new Set(["FBA_INB_0313", "FBA_INB_0317", "FBA_INB_0322"]);
    const isPackingInfoMissing = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      const probs = normalizeOperationProblems(res);
      if (!probs.length) return false;
      return probs.some((p: any) => {
        const code = String(p?.code || "").toUpperCase();
        const msg = String(p?.message || p?.details || p || "").toLowerCase();
        return (
          packingProblemCodes.has(code) ||
          msg.includes("packing information") ||
          msg.includes("pack later") ||
          msg.includes("case pack template")
        );
      });
    };
    const summarizeOperationProblems = (res: Awaited<ReturnType<typeof signedFetch>> | null) =>
      normalizeOperationProblems(res).map((p: any) => ({
        code: p?.code || null,
        message: p?.message || null,
        details: p?.details || null
      }));

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
            if (isPackingInfoMissing(opStatus)) {
              return {
                ok: false,
                state: stUp,
                res: opStatus,
                code: "PACKING_REQUIRED",
                problems: summarizeOperationProblems(opStatus)
              };
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

    const listBoxes = async () =>
      signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/boxes`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.listInboundPlanBoxes",
        marketplaceId,
        sellerId
      });

    const fetchBoxesWithRetry = async (attempts = 3) => {
      let last: any = null;
      for (let i = 1; i <= attempts; i++) {
        last = await listBoxes();
        const boxes =
          last?.json?.payload?.boxes ||
          last?.json?.boxes ||
          [];
        const count = Array.isArray(boxes) ? boxes.length : 0;
        if (count > 0) return { last, boxes, count };
        await delay(250 * i);
      }
      const boxes =
        last?.json?.payload?.boxes ||
        last?.json?.boxes ||
        [];
      const count = Array.isArray(boxes) ? boxes.length : 0;
      return { last, boxes, count };
    };

    let boxesPrecheck: { last: any; boxes: any[]; count: number } | null = null;

    if (!effectivePlacementOptionId) {
      boxesPrecheck = await fetchBoxesWithRetry(2);
      if (boxesPrecheck.count === 0) {
        return new Response(
          JSON.stringify({
            error: "Trebuie să setezi packingInformation (boxe) înainte de generatePlacementOptions.",
            code: "PACKING_REQUIRED",
            traceId,
            action: "apelează fba-set-packing-information cu packageGroupings înainte de step2-confirm-shipping",
            retryAfterMs: 4000
          }),
          { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      const genPlacement = await generatePlacementOptionsWithRetry();
      if (!genPlacement.ok) {
        if (genPlacement.code === "PACKING_REQUIRED") {
          return new Response(
            JSON.stringify({
              error: "Packing information lipsește. Reia setPackingInformation înainte de generatePlacementOptions.",
              code: "PACKING_REQUIRED",
              traceId,
              problems: genPlacement.problems || null,
              action: "apelează fba-set-packing-information cu packageGroupings înainte de step2-confirm-shipping"
            }),
            { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
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

    const placementList = await listPlacementWithRetry();
    const placementPid = placementList.pid;
    let placementOptions = placementList.placements;
    let confirmedPlacement = placementOptions.find((p: any) =>
      ["ACCEPTED", "CONFIRMED"].includes(normalizePlacementStatus(p))
    );
    let placementConfirm: Awaited<ReturnType<typeof signedFetch>> | null = null;
    const { last: boxesRes, boxes, count: boxesCount } = boxesPrecheck?.count
      ? boxesPrecheck
      : await fetchBoxesWithRetry();
    logStep("listInboundPlanBoxes", {
      traceId,
      boxesCount: boxesCount,
      requestId: boxesRes?.requestId || null
    });
    logStep("shipping_precheck", {
      traceId,
      boxesCount,
      placementStatus: confirmedPlacement ? normalizePlacementStatus(confirmedPlacement) : null
    });

    if (boxesCount === 0) {
      return new Response(
        JSON.stringify({
          error: "Trebuie să setezi packingInformation (boxe) înainte de generateTransportationOptions.",
          code: "PACKING_REQUIRED",
          traceId,
          action: "apelează fba-set-packing-information cu packageGroupings înainte de step2-confirm-shipping",
          retryAfterMs: 4000
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

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

    if (!confirmedPlacement && !shouldConfirmPlacement && shouldConfirm) {
      return new Response(
        JSON.stringify({
          error: "Placement nu este confirmat. Confirmă placementOption înainte de a aștepta shipments.",
          code: "PLACEMENT_NOT_CONFIRMED",
          traceId
        }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    if (shouldConfirmPlacement && !confirmedPlacement) {
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
        const placementStatusRes = await pollOperationStatus(placementOpId);
        const stateUp = getOperationState(placementStatusRes) || String(placementStatusRes?.res?.status || "").toUpperCase();
        if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
          return new Response(JSON.stringify({ error: "Placement confirmation failed", traceId, state: stateUp }), {
            status: 502,
            headers: { ...corsHeaders, "content-type": "application/json" }
          });
        }
      }

      const refreshedPlacement = await listPlacementWithRetry();
      placementOptions = refreshedPlacement.placements;
      confirmedPlacement = placementOptions.find((p: any) =>
        ["ACCEPTED", "CONFIRMED"].includes(normalizePlacementStatus(p))
      );
      if (confirmedPlacement) {
        effectivePlacementOptionId = normalizePlacementId(confirmedPlacement) || effectivePlacementOptionId;
      }
    }

    // Citim planul pentru a obține shipments + IDs; retry ușor pe 429 și până apar shipments
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

    const { res: planRes, shipments: placementShipmentsInitial } = await pollPlanForShipments();
    let placementShipments = placementShipmentsInitial;
    logStep("getInboundPlan snapshot", {
      traceId,
      status: planRes?.res?.status,
      requestId: planRes?.requestId || null
    });

    const planSourceAddress =
      planRes?.json?.sourceAddress ||
      planRes?.json?.payload?.sourceAddress ||
      null;
    const contactInformationFromBody = (() => {
      const raw = body?.contact_information ?? body?.contactInformation ?? null;
      if (!raw) return null;
      const name =
        raw?.name ||
        raw?.contactName ||
        raw?.person ||
        null;
      const phoneNumber =
        raw?.phoneNumber ||
        raw?.phone_number ||
        raw?.phone ||
        null;
      const email =
        raw?.email ||
        raw?.emailAddress ||
        raw?.email_address ||
        null;
      if (!name && !phoneNumber && !email) return null;
      return {
        name: name ? String(name).trim() : null,
        phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
        email: email ? String(email).trim() : null
      };
    })();
    const isCompleteContact = (info: any) =>
      Boolean(
        info?.name && String(info.name).trim() &&
        info?.phoneNumber && String(info.phoneNumber).trim() &&
        info?.email && String(info.email).trim()
      );
    const contactFromAddress = (addr: any) => {
      if (!addr) return null;
      const name = addr.name || addr.companyName || null;
      const phoneNumber = addr.phoneNumber || null;
      const email = addr.email || null;
      if (!name && !phoneNumber && !email) return null;
      return { name, phoneNumber, email };
    };
    const placementOptionShipmentIds = Array.isArray(placementOptions)
      ? placementOptions.flatMap((p: any) => p?.shipmentIds || []).filter(Boolean)
      : [];
    const fallbackShipmentIdForContact =
      placementOptionShipmentIds[0] ||
      placementShipments?.[0]?.shipmentId ||
      placementShipments?.[0]?.id ||
      null;
    let contactInformation = contactInformationFromBody || contactFromAddress(planSourceAddress);
    if (!isCompleteContact(contactInformation) && fallbackShipmentIdForContact) {
      const shDetail = await signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/shipments/${encodeURIComponent(
          String(fallbackShipmentIdForContact)
        )}`,
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
      const sourceAddress = payload?.source?.address || payload?.shipFromAddress || payload?.from || null;
      const contactFromShipment = contactFromAddress(sourceAddress);
      if (contactFromShipment) {
        contactInformation = {
          name: contactInformation?.name || contactFromShipment.name || null,
          phoneNumber: contactInformation?.phoneNumber || contactFromShipment.phoneNumber || null,
          email: contactInformation?.email || contactFromShipment.email || null
        };
      }
    }

    const planPlacementOptions =
      planRes?.json?.placementOptions ||
      planRes?.json?.payload?.placementOptions ||
      [];
    const planPlacementId = planPlacementOptions?.[0]?.placementOptionId || null;
    if (!effectivePlacementOptionId && planPlacementId) {
      effectivePlacementOptionId = planPlacementId;
    }

    const packingGroupsForTransport = Array.isArray(snapshotPackingGroups)
      ? snapshotPackingGroups
          .map((g: any, idx: number) => {
            const pgId = g?.packingGroupId || g?.id || `pg-${idx + 1}`;
            const pkg = normalizePkgFromGroup(g);
            return {
              packingGroupId: pgId,
              boxes: Number(g?.boxes || g?.boxCount || 1) || 1,
              packageFromGroup: pkg,
              shipFromAddress: planSourceAddress || null
            };
          })
          .filter((g: any) => g.packingGroupId && g.packageFromGroup)
      : [];
    const listPlacementShipmentIds = async () => {
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
      const list =
        listRes?.json?.payload?.placementOptions ||
        listRes?.json?.placementOptions ||
        [];
      const ids = Array.isArray(list)
        ? list.flatMap((p: any) => p?.shipmentIds || []).filter(Boolean)
        : [];
      logStep("placementOptions_shipments_debug", {
        traceId,
        requestId: listRes?.requestId || null,
        count: ids.length,
        ids
      });
      return ids;
    };
    const planShipmentIds =
      Array.isArray(planPlacementOptions) && planPlacementOptions.length
        ? planPlacementOptions
            .flatMap((p: any) => p?.shipmentIds || [])
            .filter(Boolean)
        : [];

    if (!Array.isArray(placementShipments) || !placementShipments.length) {
      const enrichedPlanShipmentIds = planShipmentIds.length ? planShipmentIds : await listPlacementShipmentIds();
      const hasPlanShipmentIds = Array.isArray(enrichedPlanShipmentIds) && enrichedPlanShipmentIds.length > 0;
      if (!hasPlanShipmentIds && packingGroupsForTransport.length === 0) {
        return new Response(JSON.stringify({
          error: "Placement încă nu are shipments și nu avem packingGroups cache. Reîncearcă după câteva secunde sau regenerează placement.",
          code: "SHIPMENTS_PENDING",
          retryAfterMs: 5000,
          traceId,
          placementOptionId: effectivePlacementOptionId
        }), {
          status: 202,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
      // Folosește shipmentId-urile din placementOptions dacă există, altfel packingGroupId pentru quote.
      if (hasPlanShipmentIds) {
        placementShipments = enrichedPlanShipmentIds.map((sid: any, idx: number) => ({
          id: sid,
          shipmentId: sid,
          packingGroupId: packingGroupsForTransport?.[idx]?.packingGroupId || null,
          packageFromGroup: packingGroupsForTransport?.[idx]?.packageFromGroup || null,
          shipFromAddress: packingGroupsForTransport?.[idx]?.shipFromAddress || planSourceAddress || null,
          boxes: packingGroupsForTransport?.[idx]?.boxes || null,
          isPackingGroup: false
        }));
      } else {
        placementShipments = packingGroupsForTransport.map((g: any) => ({
          id: g.packingGroupId,
          shipmentId: g.packingGroupId,
          packingGroupId: g.packingGroupId,
          packageFromGroup: g.packageFromGroup,
          shipFromAddress: g.shipFromAddress,
          boxes: g.boxes,
          isPackingGroup: true
        }));
      }
    }

    const normalizePlacementShipments = (list: any[]) =>
      (Array.isArray(list) ? list : []).map((sh: any, idx: number) => {
        const id = sh?.shipmentId || sh?.id || `s-${idx + 1}`;
        const shipFromAddress = sh?.source?.address || planSourceAddress || null;
        const shipToAddress = sh?.destination?.address || sh?.destination || null;
        return { ...sh, id, shipmentId: id, shipFromAddress, shipToAddress };
      });

    const shipmentNamePrefix = warehouseCountry === "DE" ? "EcomPrepHub.de" : "EcomPrepHub.fr";
    const shipmentNamePrefixLower = shipmentNamePrefix.toLowerCase();
    const formatShipmentName = (name: string) => {
      const base = `${shipmentNamePrefix} - ${name}`.trim();
      return base.length > 100 ? base.slice(0, 100) : base;
    };
    let shipmentNameForRequest: string | null = null;
    const buildShipmentNameUpdate = () =>
      shipmentNameForRequest ? { amazon_shipment_name: shipmentNameForRequest } : {};
    const updateShipmentName = async (shipmentId: string, name: string) =>
      signedFetch({
        method: "PUT",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${basePath}/inboundPlans/${encodeURIComponent(inboundPlanId)}/shipments/${encodeURIComponent(shipmentId)}/name`,
        query: "",
        payload: JSON.stringify({ name }),
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.updateShipmentName",
        marketplaceId,
        sellerId
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

    const ensureShipmentNamesPrefixed = async (shipmentIds: string[]) => {
      for (const shipmentId of shipmentIds) {
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
        const currentName = String(payload?.name || payload?.shipmentName || "").trim();
        if (!currentName) continue;
        const hasPrefix = currentName.toLowerCase().startsWith(shipmentNamePrefixLower);
        const desiredName = hasPrefix ? currentName : formatShipmentName(currentName);
        if (!shipmentNameForRequest) shipmentNameForRequest = desiredName;
        if (hasPrefix) continue;
        const updRes = await updateShipmentName(shipmentId, desiredName);
        logStep("shipment_name_updated", {
          traceId,
          shipmentId,
          status: updRes?.res?.status || null,
          requestId: updRes?.requestId || null,
          name: desiredName
        });
      }
    };

    const hasRealShipments = placementShipments.some((sh: any) => !sh?.isPackingGroup && (sh?.shipmentId || sh?.id));
    const firstShipmentId = hasRealShipments
      ? placementShipments.find((sh: any) => !sh?.isPackingGroup && (sh?.shipmentId || sh?.id))?.shipmentId ||
        placementShipments.find((sh: any) => !sh?.isPackingGroup && (sh?.shipmentId || sh?.id))?.id ||
        null
      : null;
    if (hasRealShipments) {
      const shipmentIdsForRename = Array.from(
        new Set(
          placementShipments
            .map((sh: any) => sh?.shipmentId || sh?.id)
            .filter((id: any) => typeof id === "string" && id.length >= 10)
        )
      );
      await ensureShipmentNamesPrefixed(shipmentIdsForRename);
    }
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
        const summaryWithSelection = {
          ...summary,
          selectedOptionId: selectedTransportationOptionId,
          selectedCarrier: "Amazon confirmed carrier",
          selectedMode: effectiveShippingMode || null,
          selectedCharge: null,
          selectedPartnered: null,
          selectedSolution: null
        };
        const { error: updErr } = await supabase
          .from("prep_requests")
          .update({
            placement_option_id: effectivePlacementOptionId,
            transportation_option_id: selectedTransportationOptionId,
            step2_confirmed_at: new Date().toISOString(),
            step2_summary: summaryWithSelection,
            step2_shipments: normalizedShipments,
            ...buildShipmentNameUpdate()
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
            summary: summaryWithSelection,
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

    const shipDateFromClient = body?.ship_date ?? body?.shipDate ?? null;
    const shipDateParsed = parseShipDate(shipDateFromClient);

    const preferredDeliveryWindow = (() => {
      const start = parseShipDate(deliveryWindowStartInput);
      const end = parseShipDate(deliveryWindowEndInput);
      if (start && end && start.getTime() <= end.getTime()) return { start, end };
      if (start && !end) {
        const fallbackEnd = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
        return { start, end: fallbackEnd };
      }
      if (shipDateParsed) {
        const arrivalStart = new Date(shipDateParsed.getTime() + 24 * 60 * 60 * 1000);
        const fallbackEnd = new Date(arrivalStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        return { start: arrivalStart, end: fallbackEnd };
      }
      return null;
    })();

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
          const dimUnit = (dims?.unitOfMeasurement || dims?.unit || dims?.uom || "CM").toString().toUpperCase();
          const weightUnit = (w?.unit || w?.uom || "KG").toString().toUpperCase();
          if (!Number.isFinite(length) || length <= 0) return null;
          if (!Number.isFinite(width) || width <= 0) return null;
          if (!Number.isFinite(height) || height <= 0) return null;
          if (!Number.isFinite(weightValue) || weightValue <= 0) return null;
          const normalizedDims = {
            length: dimUnit === "IN" ? round2(length) : cmToIn(length),
            width: dimUnit === "IN" ? round2(width) : cmToIn(width),
            height: dimUnit === "IN" ? round2(height) : cmToIn(height),
            unitOfMeasurement: "IN"
          };
          const normalizedWeight = {
            value: weightUnit === "LB" ? round2(weightValue) : kgToLb(weightValue),
            unitOfMeasurement: "LB"
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
            length: dimUnit === "IN" ? round2(length) : cmToIn(length),
            width: dimUnit === "IN" ? round2(width) : cmToIn(width),
            height: dimUnit === "IN" ? round2(height) : cmToIn(height),
            unitOfMeasurement: "IN"
          };
          const normalizedWeight = {
            value: weightUnit === "LB" ? round2(weightValue) : kgToLb(weightValue),
            unitOfMeasurement: "LB"
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
    function normalizePkgFromGroup(g: any) {
      if (!g) return null;
      const dimsRaw = g?.dimensions || g?.boxDimensions || g?.dim || null;
      const weightRaw = g?.weight || g?.boxWeight || null;
      const boxes = Number(g?.boxes || g?.boxCount || 1) || 1;
      if (!dimsRaw || !weightRaw) return null;
      const dimUnit = (dimsRaw?.unit || dimsRaw?.unitOfMeasurement || dimsRaw?.uom || "CM").toString().toUpperCase();
      const weightUnit = (weightRaw?.unit || weightRaw?.uom || "KG").toString().toUpperCase();
      const normDims = {
        length: dimUnit === "IN" ? round2(Number(dimsRaw?.length)) : cmToIn(dimsRaw?.length),
        width: dimUnit === "IN" ? round2(Number(dimsRaw?.width)) : cmToIn(dimsRaw?.width),
        height: dimUnit === "IN" ? round2(Number(dimsRaw?.height)) : cmToIn(dimsRaw?.height),
        unitOfMeasurement: "IN"
      };
      const normWeight = {
        value: weightUnit === "LB" ? round2(Number(weightRaw?.value)) : kgToLb(weightRaw?.value),
        unitOfMeasurement: "LB"
      };
      return {
        quantity: boxes,
        dimensions: normDims,
        weight: normWeight
      };
    }

    const readyStartIso: string | null = shipDateParsed ? shipDateParsed.toISOString() : null;

    function clampReadyWindow(startIso: string, endIso?: string) {
      const start = new Date(startIso);
      if (!Number.isFinite(start.getTime())) {
        throw new Error("READY_TO_SHIP_WINDOW_INVALID");
      }
      // Require start to be at least 6h in the future to avoid SPAPI "DateTime ... cannot be in the past"
      const minStart = new Date(Date.now() + 6 * 60 * 60 * 1000);
      if (start < minStart) {
        start.setTime(minStart.getTime());
      }
      const end = endIso ? new Date(endIso) : null;
      if (endIso && (!Number.isFinite(end.getTime()) || end <= start)) {
        throw new Error("READY_TO_SHIP_WINDOW_INVALID");
      }
      return { start: start.toISOString(), end: end ? end.toISOString() : undefined };
    }

    const includePackages = String(effectiveShippingMode || "").toUpperCase() === "GROUND_SMALL_PARCEL";
    const hasContactName = Boolean(contactInformation?.name && String(contactInformation.name).trim());
    const hasContactPhone = Boolean(contactInformation?.phoneNumber && String(contactInformation.phoneNumber).trim());
    const hasContactEmail = Boolean(contactInformation?.email && String(contactInformation.email).trim());
    if (!hasContactName || !hasContactPhone || !hasContactEmail) {
      return new Response(
        JSON.stringify({
          error:
            "contactInformation complet (name, phoneNumber, email) este obligatoriu pentru generateTransportationOptions.",
          code: "CONTACT_INFORMATION_REQUIRED",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    const mergedIncomingConfigs = (() => {
      const map = new Map<string, any>();
      (shipmentTransportConfigs || []).forEach((cfg: any, idx: number) => {
        const fallbackId =
          placementShipments?.[idx]?.shipmentId ||
          placementShipments?.[idx]?.id ||
          `s-${idx + 1}`;
        const shIdRaw = cfg?.shipmentId || cfg?.shipment_id || fallbackId;
        const shId = String(shIdRaw || fallbackId);
        const existing = map.get(shId) || { packages: [], pallets: [], freightInformation: null, readyToShipWindow: null, contactInformation: cfg?.contactInformation || cfg?.contact_information || null };
        if (Array.isArray(cfg?.packages)) existing.packages.push(...cfg.packages);
        if (Array.isArray(cfg?.pallets)) existing.pallets.push(...cfg.pallets);
        if (!existing.freightInformation && (cfg?.freightInformation || cfg?.freight_information)) {
          existing.freightInformation = cfg?.freightInformation || cfg?.freight_information;
        }
        if (!existing.readyToShipWindow && (cfg?.readyToShipWindow || cfg?.ready_to_ship_window)) {
          existing.readyToShipWindow = cfg?.readyToShipWindow || cfg?.ready_to_ship_window;
        }
        map.set(shId, existing);
      });
      return map;
    })();

    const globalReadyWindow =
      body?.readyToShipWindow ||
      body?.ready_to_ship_window ||
      (preferredDeliveryWindow
        ? {
            start: preferredDeliveryWindow.start.toISOString(),
            end: preferredDeliveryWindow.end?.toISOString()
          }
        : readyStartIso
        ? { start: readyStartIso }
        : null);
    let shipmentTransportationConfigurations: any[] = [];
    try {
      shipmentTransportationConfigurations = placementShipments.map((sh: any, idx: number) => {
        const shId = sh.shipmentId || sh.id || `s-${idx + 1}`;
        const cfg =
          mergedIncomingConfigs.get(String(shId)) ||
          (shipmentTransportConfigs || []).find((c: any) => c?.shipmentId === shId || c?.shipment_id === shId) ||
          (shipmentTransportConfigs || [])[idx] ||
          {};
        const rawStart =
          cfg.readyToShipWindow?.start ||
          cfg.ready_to_ship_window?.start ||
          globalReadyWindow?.start ||
          null;
        if (!rawStart) {
          throw new Error("READY_TO_SHIP_WINDOW_MISSING");
        }
        const rawEnd =
          cfg.readyToShipWindow?.end ||
          cfg.ready_to_ship_window?.end ||
          null;
        const { start } = clampReadyWindow(rawStart);
        const baseCfg: Record<string, any> = {
          readyToShipWindow: { start },
          shipmentId: shId
        };
        if (rawEnd) baseCfg.readyToShipWindow.end = rawEnd;
        if (contactInformation) baseCfg.contactInformation = contactInformation;
        const pkgsFromCfg = normalizePackages(cfg?.packages);
        if (pkgsFromCfg) baseCfg.packages = pkgsFromCfg;
        const pallets = normalizePallets(cfg?.pallets);
        if (pallets) baseCfg.pallets = pallets;
        const freightInformation = normalizeFreightInformation(cfg?.freightInformation || cfg?.freight_information);
        if (freightInformation) baseCfg.freightInformation = freightInformation;
        return baseCfg;
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (msg.includes("READY_TO_SHIP_WINDOW")) {
        const missingShipments = placementShipments.map((s: any) => s?.shipmentId || s?.id).filter(Boolean);
        return new Response(
          JSON.stringify({
            error: "readyToShipWindow (start) este obligatoriu pentru fiecare shipment. Introdu datele manual în UI.",
            code: "READY_TO_SHIP_WINDOW_MISSING",
            traceId,
            blocking: true,
            needReadyToShipWindow: true,
            shipments: missingShipments
          }),
          { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      throw err;
    }

    console.log(JSON.stringify({
      tag: "transportation_payload_preview",
      traceId,
      inboundPlanId,
      placementOptionId: effectivePlacementOptionId,
      shippingMode: effectiveShippingMode || null,
      shipmentCount: shipmentTransportationConfigurations.length,
      shipments: shipmentTransportationConfigurations.map((cfg: any) => ({
        shipmentId: cfg?.shipmentId || null,
        packages: Array.isArray(cfg?.packages) ? cfg.packages.length : 0,
        pallets: Array.isArray(cfg?.pallets) ? cfg.pallets.length : 0,
        readyStart: cfg?.readyToShipWindow?.start || null,
        hasContact: Boolean(cfg?.contactInformation),
        samplePackage: Array.isArray(cfg?.packages) && cfg.packages.length ? cfg.packages[0] : null
      }))
    }));

    const configsByShipment = new Map<string, any>(
      shipmentTransportationConfigurations.map((c: any) => [String(c.shipmentId || c.packingGroupId), c])
    );

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
          sh?.destination?.address ||
          sh?.shipToAddress ||
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
          sh?.destination?.warehouseId ||
          null;
        const cfg = configsByShipment.get(String(shId)) || {};
        const pkgList = Array.isArray(cfg?.packages) ? cfg.packages : [];
        const palletList = Array.isArray(cfg?.pallets) ? cfg.pallets : [];
        let weightFromPackages = 0;
        let weightFromPackagesUnit: string | null = null;
        pkgList.forEach((p: any) => {
          const w = Number(p?.weight?.value || 0);
          if (!Number.isFinite(w) || w <= 0) return;
          const unit = (p?.weight?.unit || p?.weight?.uom || "LB").toString().toUpperCase();
          weightFromPackages += w;
          if (!weightFromPackagesUnit) weightFromPackagesUnit = unit;
        });
        let weightFromPallets = 0;
        let weightFromPalletsUnit: string | null = null;
        palletList.forEach((p: any) => {
          const w = Number(p?.weight?.value || 0);
          if (!Number.isFinite(w) || w <= 0) return;
          const unit = (p?.weight?.unit || p?.weight?.uom || "LB").toString().toUpperCase();
          weightFromPallets += w;
          if (!weightFromPalletsUnit) weightFromPalletsUnit = unit;
        });
        const weightFromCfg = weightFromPackages || weightFromPallets || 0;
        const weightFromCfgUnit = weightFromPackagesUnit || weightFromPalletsUnit || null;
        const weightFromCfgKg =
          weightFromCfgUnit === "LB" ? lbToKg(weightFromCfg) : weightFromCfg || 0;
        const contentsWeightRaw = contents?.weight ?? contents?.Weight ?? null;
        const contentsWeightUnitRaw =
          contents?.weight_unit ||
          contents?.weightUnit ||
          contents?.weightUnitOfMeasurement ||
          contents?.weightUom ||
          null;
        const contentsWeight = Number(contentsWeightRaw);
        const hasContentsWeight = Number.isFinite(contentsWeight) && contentsWeight > 0;
        let resolvedWeight: number | null = null;
        let resolvedWeightUnit: string | null = null;
        if (hasContentsWeight) {
          resolvedWeight = contentsWeight;
          if (contentsWeightUnitRaw) {
            resolvedWeightUnit = String(contentsWeightUnitRaw).toUpperCase();
          } else if (weightFromCfg > 0) {
            const diffLb = Math.abs(contentsWeight - weightFromCfg);
            const diffKg = Math.abs(contentsWeight - weightFromCfgKg);
            resolvedWeightUnit = diffKg < diffLb ? "KG" : weightFromCfgUnit || "LB";
          } else {
            resolvedWeightUnit = weightFromCfgUnit || "LB";
          }
        } else if (weightFromCfg > 0) {
          resolvedWeight = weightFromCfg;
          resolvedWeightUnit = weightFromCfgUnit || "LB";
        }
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
          weight: resolvedWeight ?? null,
          weight_unit: resolvedWeight ? resolvedWeightUnit || "LB" : null
        });
      }
      return list;
    };
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
            "Lipsesc paletii (pallets) și/sau freightInformation pentru LTL/FTL. Pentru SPD nu se trimit paleti. Completează dimensiuni, greutate, stackability și freight class.",
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
    if (!requiresPallets && missingPkgs) {
      return new Response(
        JSON.stringify({
          error:
            "Lipsesc coletele (packages: dimensiuni + greutate). Pentru SPD paletii nu sunt necesari, dar box details sunt obligatorii pentru PCP.",
          code: "MISSING_PACKAGES",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // SPD partnered limits/eligibility checks (EU vs NA)
    const spdWarnings: string[] = [];
    if (includePackages) {
      const spdErrors: string[] = [];
      let maxWeightLb = 0;
      let maxSideIn = 0;
      let maxLengthIn = 0;
      let maxLengthGirthIn = 0;
      let packagesCount = 0;

      shipmentTransportationConfigurations.forEach((cfg, cfgIdx) => {
        const pkgs = Array.isArray(cfg?.packages) ? cfg.packages : [];
        packagesCount += pkgs.length;
        pkgs.forEach((pkg, pkgIdx) => {
          const weightLb = Number(pkg?.weight?.value || 0);
          const dims = pkg?.dimensions || {};
          const sides = [dims?.length, dims?.width, dims?.height].map((n) => Number(n || 0));
          const sorted = [...sides].sort((a, b) => b - a);
          const lengthIn = Number(sorted?.[0] || 0);
          const girthIn = 2 * ((Number(sorted?.[1] || 0)) + (Number(sorted?.[2] || 0)));
          const lengthGirthIn = lengthIn + girthIn;
          const maxSide = Math.max(...sides);

          if (weightLb > maxWeightLb) maxWeightLb = weightLb;
          if (maxSide > maxSideIn) maxSideIn = maxSide;
          if (lengthIn > maxLengthIn) maxLengthIn = lengthIn;
          if (lengthGirthIn > maxLengthGirthIn) maxLengthGirthIn = lengthGirthIn;

          if (isEuMarketplace) {
            const SPD_MAX_SIDE_IN = 25; // 63.5 cm
            const SPD_HARD_MAX_WEIGHT_LB = kgToLb(23); // 23 kg limit
            const SPD_WARN_WEIGHT_LB = kgToLb(15); // 15 kg: cere eticheta "Heavy package"

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
          } else {
            const SPD_MAX_WEIGHT_LB = 150;
            const SPD_MAX_LENGTH_IN = 108;
            const SPD_MAX_LENGTH_GIRTH_IN = 165;

            if (weightLb > SPD_MAX_WEIGHT_LB) {
              spdWarnings.push(
                `Shipment ${cfg?.shipmentId || cfgIdx + 1} pkg ${pkgIdx + 1}: ${weightLb.toFixed(
                  2
                )} lb depășește 150 lb - SPD PCP poate să nu fie disponibil.`
              );
            }
            if (lengthIn > SPD_MAX_LENGTH_IN || lengthGirthIn > SPD_MAX_LENGTH_GIRTH_IN) {
              spdWarnings.push(
                `Shipment ${cfg?.shipmentId || cfgIdx + 1} pkg ${pkgIdx + 1}: length ${lengthIn.toFixed(
                  2
                )} in, length+girth ${lengthGirthIn.toFixed(
                  2
                )} in depășește limitele SPD (108 in / 165 in).`
              );
            }
          }
        });
      });

      const effectiveBoxesCount = boxesCount > 0 ? boxesCount : packagesCount;
      if (effectiveBoxesCount > 200) {
        spdWarnings.push(
          `Număr cutii ${effectiveBoxesCount} > 200. SPD PCP poate fi indisponibil (limită 200 boxes/shipment).`
        );
      }

      const usCaMarketplaces = new Set(["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2"]);
      if (usCaMarketplaces.has(String(marketplaceId || "").trim())) {
        const stateCode = String(planSourceAddress?.stateOrProvinceCode || "").trim();
        if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) {
          spdWarnings.push(
            `stateOrProvinceCode invalid (${stateCode}). Pentru US/CA folosește cod ISO (ex: MI, CA).`
          );
        }
      }

      logStep("spd_eligibility", {
        traceId,
        marketplaceId,
        isEuMarketplace,
        boxesCount: effectiveBoxesCount,
        packagesCount,
        maxWeightLb: maxWeightLb ? Number(maxWeightLb.toFixed(2)) : 0,
        maxSideIn: maxSideIn ? Number(maxSideIn.toFixed(2)) : 0,
        maxLengthIn: maxLengthIn ? Number(maxLengthIn.toFixed(2)) : 0,
        maxLengthGirthIn: maxLengthGirthIn ? Number(maxLengthGirthIn.toFixed(2)) : 0,
        warningsCount: spdWarnings.length,
        errorsCount: spdErrors.length
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

    if (placementShipments.some((s: any) => s?.isPackingGroup)) {
      return new Response(
        JSON.stringify({
          error: "Amazon nu a emis încă shipmentId-urile. Reîncearcă în câteva secunde.",
          code: "SHIPMENTS_PENDING_FOR_GENERATE_TRANSPORT",
          traceId,
          retryAfterMs: 4000
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // 1) Generate transportation options (idempotent)
    logStep("transportationOptions_payload", {
      traceId,
      inboundPlanId,
      placementOptionId: effectivePlacementOptionId,
      packingOptionId: effectivePackingOptionId || null,
      shippingMode: effectiveShippingMode,
      shipDate: shipDateFromClient || null,
      deliveryWindowStart: deliveryWindowStartInput || null,
      deliveryWindowEnd: deliveryWindowEndInput || null,
      shipmentConfigCount: shipmentTransportationConfigurations.length,
      hasPallets,
      shipments: shipmentTransportationConfigurations.map((c: any) => ({
        shipmentId: c?.shipmentId || null,
        readyStart: c?.readyToShipWindow?.start || null,
        pallets: Array.isArray(c?.pallets) ? c.pallets.length : 0,
        hasContact: Boolean(c?.contactInformation)
      }))
    });
    const payloadTransportConfigs = shipmentTransportationConfigurations.map((cfg: any) => {
      const base: Record<string, any> = {
        shipmentId: cfg?.shipmentId,
        readyToShipWindow: { start: cfg?.readyToShipWindow?.start }
      };
      if (cfg?.contactInformation) base.contactInformation = cfg.contactInformation;
      if (Array.isArray(cfg?.packages) && cfg.packages.length) base.packages = cfg.packages;
      if (Array.isArray(cfg?.pallets) && cfg.pallets.length) base.pallets = cfg.pallets;
      if (cfg?.freightInformation) base.freightInformation = cfg.freightInformation;
      return base;
    });
    const generatePayload = JSON.stringify({
      placementOptionId: effectivePlacementOptionId,
      shipmentTransportationConfigurations: payloadTransportConfigs
    });

    console.log(JSON.stringify({
      tag: "transportation_generate_payload",
      traceId,
      placementOptionId: effectivePlacementOptionId,
      shipmentConfigs: payloadTransportConfigs.map((cfg: any) => ({
        shipmentId: cfg?.shipmentId || null,
        readyStart: cfg?.readyToShipWindow?.start || null,
        packages: Array.isArray(cfg?.packages) ? cfg.packages.length : 0,
        pallets: Array.isArray(cfg?.pallets) ? cfg.pallets.length : 0,
        hasContact: Boolean(cfg?.contactInformation)
      }))
    }));
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
    logStep("generateTransportationOptions_raw", {
      traceId,
      status: genRes?.res?.status || null,
      requestId: genRes?.requestId || null,
      bodyPreview: (genRes?.text || "").slice(0, 600) || null
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
    const shipmentIdForListing =
      firstShipmentId ||
      shipmentTransportationConfigurations.find((c: any) => c?.shipmentId)?.shipmentId ||
      placementShipments.find((s: any) => !s?.isPackingGroup && (s?.shipmentId || s?.id))?.shipmentId ||
      placementShipments.find((s: any) => !s?.isPackingGroup && (s?.shipmentId || s?.id))?.id ||
      null;
    logStep("transportationOptions_query_context", {
      traceId,
      inboundPlanId,
      placementOptionId: effectivePlacementOptionId,
      shippingMode: effectiveShippingMode,
      shipmentIdForListing,
      isEuMarketplace,
      hasPallets,
      missingPkgs,
      missingPallets,
      missingFreightInfo,
      shipDate: shipDateFromClient || null,
      deliveryWindowStart: deliveryWindowStartInput || null,
      deliveryWindowEnd: deliveryWindowEndInput || null
    });

    const transportCache = new Map<string, any[]>();
    const hasPartneredSolution = (opts: any[]) =>
      Array.isArray(opts)
        ? opts.some((opt) => {
            const solution = String(
              opt?.shippingSolution || opt?.shippingSolutionId || opt?.shipping_solution || ""
            ).toUpperCase();
            return solution.includes("AMAZON_PARTNERED") || solution.includes("PARTNERED_CARRIER");
          })
        : false;
    const dedupeTransportationOptions = (opts: any[]) => {
      const byId = new Map<string, any>();
      const byComposite = new Map<string, any>();
      const buildComposite = (opt: any) => {
        const carrier = opt?.carrier?.alphaCode || opt?.carrier?.name || opt?.carrier || "";
        const mode = opt?.shippingMode || opt?.mode || "";
        const solution = opt?.shippingSolution || opt?.shippingSolutionId || "";
        return `${String(carrier)}|${String(mode)}|${String(solution)}`;
      };
      (opts || []).forEach((opt: any) => {
        const id = String(opt?.transportationOptionId || opt?.id || opt?.optionId || "");
        if (id) {
          if (!byId.has(id)) byId.set(id, opt);
          return;
        }
        const key = buildComposite(opt);
        if (!byComposite.has(key)) byComposite.set(key, opt);
      });
      return [...byId.values(), ...byComposite.values()];
    };
    const listTransportationOptionsOnce = async (
      placementOptionIdParam: string,
      shipmentIdParam?: string | null,
      opts?: {
        probePartnered?: boolean;
        maxPages?: number;
        hardMaxPages?: number;
        requiredOptionId?: string | null;
        forceRefresh?: boolean;
      }
    ) => {
      const cacheKey = `${placementOptionIdParam}|${shipmentIdParam || ""}`;
      const requiredOptionId = String(opts?.requiredOptionId || "").trim() || null;
      if (!opts?.forceRefresh && transportCache.has(cacheKey)) {
        const cached = transportCache.get(cacheKey) || [];
        if (!requiredOptionId) {
          return { firstRes: null, collected: cached };
        }
        const hasRequiredInCache = cached.some((opt: any) => {
          const id = String(opt?.transportationOptionId || opt?.id || opt?.optionId || "");
          return id === requiredOptionId;
        });
        if (hasRequiredInCache) {
          return { firstRes: null, collected: cached };
        }
      }
      const probePartnered = Boolean(opts?.probePartnered);
      const maxPages = Math.max(1, Math.min(Number(opts?.maxPages ?? 6), 12));
      const hardMaxPages = Math.max(
        maxPages,
        Math.min(Number(opts?.hardMaxPages ?? (requiredOptionId ? 40 : maxPages)), 60)
      );
      let firstRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
      const collected: any[] = [];
      let nextToken: string | null = null;
      let pagesFetched = 0;
      let firstPartneredPage: number | null = null;
      let firstRequiredOptionPage: number | null = null;
      do {
        pagesFetched += 1;
        const queryParts = [
          `placementOptionId=${encodeURIComponent(placementOptionIdParam)}`,
          "pageSize=20"
        ];
        if (shipmentIdParam) queryParts.push(`shipmentId=${encodeURIComponent(shipmentIdParam)}`);
        if (nextToken) queryParts.push(`paginationToken=${encodeURIComponent(nextToken)}`);
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
        const pageRaw =
          res?.json?.payload?.transportationOptions ||
          res?.json?.transportationOptions ||
          res?.json?.TransportationOptions ||
          [];
        const pageChunk = Array.isArray(pageRaw) ? pageRaw : [];
        if (pageChunk.length) collected.push(...pageChunk);
        if (probePartnered && firstPartneredPage === null && hasPartneredSolution(pageChunk)) {
          firstPartneredPage = pagesFetched;
        }
        if (requiredOptionId && firstRequiredOptionPage === null) {
          const foundOnPage = pageChunk.some((opt: any) => {
            const id = String(opt?.transportationOptionId || opt?.id || opt?.optionId || "");
            return id === requiredOptionId;
          });
          if (foundOnPage) firstRequiredOptionPage = pagesFetched;
        }
        nextToken =
          res?.json?.payload?.pagination?.nextToken ||
          res?.json?.pagination?.nextToken ||
          res?.json?.nextToken ||
          null;
        const reachedSoftLimit = pagesFetched >= maxPages;
        const reachedHardLimit = pagesFetched >= hardMaxPages;
        const needMoreForRequired = Boolean(requiredOptionId) && firstRequiredOptionPage === null;
        if (!nextToken) break;
        if (reachedHardLimit) break;
        if (reachedSoftLimit && !needMoreForRequired) break;
      } while (true);
      if (probePartnered) {
        logStep("listTransportationOptions_partnered_probe", {
          traceId,
          placementOptionId: placementOptionIdParam,
          shipmentId: shipmentIdParam || null,
          pagesFetched,
          maxPages,
          hardMaxPages,
          requiredOptionId,
          firstRequiredOptionPage,
          partneredFound: hasPartneredSolution(collected),
          firstPartneredPage,
          count: collected.length
        });
      }
      if (nextToken) {
        logStep("listTransportationOptions_truncated", {
          traceId,
          placementOptionId: placementOptionIdParam,
          shipmentId: shipmentIdParam || null,
          pageSize: 20,
          pagesFetched,
          maxPages,
          hardMaxPages,
          requiredOptionId,
          firstRequiredOptionPage,
          hasMore: true,
          collected: collected.length
        });
      }
      const deduped = dedupeTransportationOptions(collected);
      transportCache.set(cacheKey, deduped);
      return { firstRes, collected: deduped };
    };

    let listRes: Awaited<ReturnType<typeof signedFetch>> | null = null;
    let optionsRawInitial: any[] = [];
    const partneredByShipment: Record<string, boolean> = {};
    const optionsCountByShipment: Record<string, number> = {};
    const partneredChargeByShipment: Record<string, number> = {};
    const nonPartneredChargeByShipment: Record<string, number> = {};
    const isPartneredRaw = (opt: any) => hasPartneredSolution([opt]);
    const extractChargeAmount = (opt: any) => {
      const fromPath = [
        opt?.quote?.cost?.amount,
        opt?.charge?.totalCharge?.amount,
        opt?.totalCharge?.amount,
        opt?.chargeAmount?.amount,
        opt?.estimatedCharge?.amount,
        opt?.price?.amount
      ].find((v) => v !== undefined && v !== null);
      const value = Number(fromPath);
      return Number.isFinite(value) ? value : null;
    };
    const minChargeFor = (opts: any[], predicate: (o: any) => boolean) => {
      const charges = (opts || [])
        .filter((o) => predicate(o))
        .map((o) => extractChargeAmount(o))
        .filter((c) => Number.isFinite(c));
      if (!charges.length) return null;
      return Math.min(...charges);
    };
    if (listingShipmentIds.length) {
      const primaryShipmentId = listingShipmentIds[0] || shipmentIdForListing;
      if (primaryShipmentId) {
        const primaryRes = await listTransportationOptionsOnce(
          effectivePlacementOptionId,
          primaryShipmentId,
          { probePartnered: true, maxPages: 6 }
        );
        listRes = primaryRes.firstRes;
        optionsRawInitial = primaryRes.collected;
        partneredByShipment[primaryShipmentId] = hasPartneredSolution(primaryRes.collected);
        optionsCountByShipment[primaryShipmentId] = primaryRes.collected.length;
        const primaryPartneredMin = minChargeFor(primaryRes.collected, isPartneredRaw);
        if (Number.isFinite(primaryPartneredMin)) {
          partneredChargeByShipment[primaryShipmentId] = primaryPartneredMin;
        }
        const primaryNonPartneredMin = minChargeFor(primaryRes.collected, (o) => !isPartneredRaw(o));
        if (Number.isFinite(primaryNonPartneredMin)) {
          nonPartneredChargeByShipment[primaryShipmentId] = primaryNonPartneredMin;
        }
        for (const sid of listingShipmentIds) {
          if (sid === primaryShipmentId) continue;
          const res = await listTransportationOptionsOnce(
            effectivePlacementOptionId,
            sid,
            { probePartnered: true, maxPages: 6 }
          );
          partneredByShipment[sid] = hasPartneredSolution(res.collected);
          optionsCountByShipment[sid] = res.collected.length;
          const partneredMin = minChargeFor(res.collected, isPartneredRaw);
          if (Number.isFinite(partneredMin)) {
            partneredChargeByShipment[sid] = partneredMin;
          }
          const nonPartneredMin = minChargeFor(res.collected, (o) => !isPartneredRaw(o));
          if (Number.isFinite(nonPartneredMin)) {
            nonPartneredChargeByShipment[sid] = nonPartneredMin;
          }
        }
      }
    } else {
      const fallbackRes = await listTransportationOptionsOnce(
        effectivePlacementOptionId,
        shipmentIdForListing,
        { probePartnered: true, maxPages: 6 }
      );
      listRes = fallbackRes.firstRes;
      optionsRawInitial = fallbackRes.collected;
    }
    let optionsRawForSelection = optionsRawInitial;
    let optionsRawForDisplay = optionsRawInitial;
    // For hazmat/non-partnered shipments, Amazon can legitimately return only USE_YOUR_OWN_CARRIER.
    // Fallback listing without shipmentId should be used only when shipment-scoped listing is empty.
    if (!optionsRawInitial.length && shipmentIdForListing) {
      const { firstRes: listResFallback, collected: optionsRawFallback } =
        await listTransportationOptionsOnce(effectivePlacementOptionId, null, {
          probePartnered: true,
          maxPages: 6
        });
      const byId = new Map<string, any>();
      const add = (opt: any) => {
        const id = String(opt?.transportationOptionId || opt?.id || opt?.optionId || "");
        if (!id) return;
        if (!byId.has(id)) byId.set(id, opt);
      };
      optionsRawInitial.forEach(add);
      optionsRawFallback.forEach(add);
      optionsRawForDisplay = Array.from(byId.values());
      logStep("listTransportationOptions_fallback", {
        traceId,
        placementOptionId: effectivePlacementOptionId,
        shipmentIdForListing,
        initialCount: optionsRawInitial.length,
        fallbackCount: optionsRawFallback.length,
        mergedCount: optionsRawForDisplay.length,
        requestId: listResFallback?.requestId || null
      });
    }
    if (!optionsRawForSelection.length) {
      optionsRawForSelection = optionsRawForDisplay;
    }
    const partneredAvailableForAll = listingShipmentIds.length
      ? listingShipmentIds.every((sid) => partneredByShipment[sid])
      : hasPartneredSolution(optionsRawForSelection);
    const partneredAvailableForAny = listingShipmentIds.length
      ? listingShipmentIds.some((sid) => partneredByShipment[sid])
      : hasPartneredSolution(optionsRawForSelection);
    const partneredMissingShipments = listingShipmentIds.filter((sid) => !partneredByShipment[sid]);
    const sumChargesFor = (ids: string[], map: Record<string, number>) => {
      if (!ids.length) return null;
      let sum = 0;
      for (const sid of ids) {
        const value = map[sid];
        if (!Number.isFinite(value)) return null;
        sum += value;
      }
      return sum;
    };
    const partneredChargeTotal = listingShipmentIds.length
      ? sumChargesFor(listingShipmentIds, partneredChargeByShipment)
      : null;
    const nonPartneredChargeTotal = listingShipmentIds.length
      ? sumChargesFor(listingShipmentIds, nonPartneredChargeByShipment)
      : null;
    if (listingShipmentIds.length > 1 && !partneredAvailableForAll) {
      optionsRawForDisplay = optionsRawForDisplay.filter((opt) => !isPartneredRaw(opt));
      optionsRawForSelection = optionsRawForSelection.filter((opt) => !isPartneredRaw(opt));
    }
    const compactOptionsForLog = (opts: any[]) =>
      (opts || []).map((opt) => ({
        id: opt?.transportationOptionId || opt?.id || opt?.optionId || null,
        shipmentId: opt?.shipmentId || opt?.shipment_id || null,
        shippingSolution: opt?.shippingSolution || opt?.shippingSolutionId || null,
        shippingMode: opt?.shippingMode || opt?.mode || null,
        carrier: opt?.carrier?.alphaCode || opt?.carrier?.name || opt?.carrier || null,
        preconditions: opt?.preconditions || null
      }));
    logStep("transportationOptions_raw_response", {
      traceId,
      placementOptionId: effectivePlacementOptionId,
      shippingMode: effectiveShippingMode,
      shipmentIdForListing,
      hasPallets,
      hasPackages: !missingPkgs,
      hasFreightInformation: !missingFreightInfo,
      requestId: listRes?.requestId || null,
      counts: {
        initial: optionsRawInitial.length,
        display: optionsRawForDisplay.length
      },
      options: compactOptionsForLog(optionsRawForDisplay)
    });
    logStep("listTransportationOptions", {
      traceId,
      status: listRes?.res?.status,
      requestId: listRes?.requestId || null,
      count: optionsRawForDisplay.length
    });
    if (listingShipmentIds.length > 1) {
      logStep("listTransportationOptions_multi_shipment", {
        traceId,
        placementOptionId: effectivePlacementOptionId,
        shipmentIds: listingShipmentIds,
        partneredByShipment,
        optionsCountByShipment,
        partneredAvailableForAll,
        partneredAvailableForAny,
        partneredMissingShipments,
        partneredChargeByShipment,
        partneredChargeTotal,
        nonPartneredChargeByShipment,
        nonPartneredChargeTotal
      });
    }
    logStep("shipmentTransportationConfigurations", {
      traceId,
      count: shipmentTransportationConfigurations.length,
      shippingMode: effectiveShippingMode
    });

    // Nu listam in bucla toate placement-urile in Step 2.
    // Conform fluxului UI, lucram strict pe placement-ul deja selectat/confirmat.

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

    const pickDeliveryWindowOptionId = (opts: any[], preferred?: { start?: Date | null; end?: Date | null }) => {
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

      if (withDates.length && preferred?.start) {
        const prefStart = preferred.start.getTime();
        const prefEnd = preferred?.end ? preferred.end.getTime() : Number.MAX_SAFE_INTEGER;
        const inRange = withDates.filter((o: any) => {
          const startTs = o.ts;
          const endTs = o.end ? Date.parse(String(o.end)) : startTs;
          return Number.isFinite(startTs) && startTs >= prefStart && startTs <= prefEnd && Number.isFinite(endTs);
        });
        if (inRange.length) {
          const picked = inRange.sort((a: any, b: any) => a.ts - b.ts)[0].opt;
          return picked?.deliveryWindowOptionId || picked?.id || null;
        }
      }

      const picked = withDates.length
        ? withDates.sort((a: any, b: any) => a.ts - b.ts)[0].opt
        : opts[0];
      return picked?.deliveryWindowOptionId || picked?.id || null;
    };

    let options = optionsRawForDisplay;
    let optionsForSelectionRaw = optionsRawForSelection;

    const allRequireDeliveryWindow =
      Array.isArray(options) &&
      options.length > 0 &&
      options.every((opt: any) => hasDeliveryWindowPrecondition(opt));

    const confirmDeliveryWindowOnList =
      body?.confirm_delivery_window_on_list ?? body?.confirmDeliveryWindowOnList ?? true;
    // Do not mutate delivery windows during "list options" calls (confirm=false),
    // otherwise Amazon can rotate transportation options between view and confirm.
    const allowDeliveryWindowConfirmation = shouldConfirm && confirmDeliveryWindowOnList;

    let deliveryWindowHandledInThisRun = false;
    if (allRequireDeliveryWindow && allowDeliveryWindowConfirmation && confirmedPlacement) {
      const shipmentIds = Array.from(
        new Set<string>(
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
        const dwOptionId = pickDeliveryWindowOptionId(optionsList, preferredDeliveryWindow || undefined);
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
      // Conform fluxului din documentație: după confirmDeliveryWindowOption relistăm opțiunile.
      // Evităm regenerate implicit, deoarece poate roti transportationOptionId și poate invalida selecția din UI.
      const relistShipmentId = shipmentIdForListing || null;
      let relist = await listTransportationOptionsOnce(String(effectivePlacementOptionId), relistShipmentId, {
        requiredOptionId: confirmOptionId || null,
        forceRefresh: true,
        probePartnered: Boolean(body?.force_partnered_only ?? body?.forcePartneredOnly ?? false)
      });
      options = relist.collected || [];
      optionsForSelectionRaw = options;
      logStep("listTransportationOptions_after_deliveryWindow", {
        traceId,
        source: "relist_only",
        status: relist.firstRes?.res?.status,
        requestId: relist.firstRes?.requestId || null,
        count: options.length
      });

      // Fallback defensiv: dacă după confirmarea ferestrei nu există opțiuni, regenerăm și relistăm.
      if (!Array.isArray(options) || options.length === 0) {
        const regenRes = await signedFetch({
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
          operationName: "inbound.v20240320.generateTransportationOptions_after_deliveryWindow",
          marketplaceId,
          sellerId
        });
        const regenOpId =
          regenRes?.json?.payload?.operationId ||
          regenRes?.json?.operationId ||
          null;
        if (regenOpId) {
          const regenStatus = await pollOperationStatus(regenOpId);
          logStep("generateTransportationOptions_after_deliveryWindow_status", {
            traceId,
            operationId: regenOpId,
            state: getOperationState(regenStatus) || null,
            status: regenStatus?.res?.status || null,
            requestId: regenStatus?.requestId || null,
            problems: getOperationProblems(regenStatus) || null
          });
        } else {
          logStep("generateTransportationOptions_after_deliveryWindow_raw", {
            traceId,
            status: regenRes?.res?.status || null,
            requestId: regenRes?.requestId || null,
            bodyPreview: (regenRes?.text || "").slice(0, 600) || null
          });
        }
        relist = await listTransportationOptionsOnce(String(effectivePlacementOptionId), relistShipmentId, {
          requiredOptionId: confirmOptionId || null,
          forceRefresh: true,
          probePartnered: Boolean(body?.force_partnered_only ?? body?.forcePartneredOnly ?? false)
        });
        options = relist.collected || [];
        optionsForSelectionRaw = options;
        logStep("listTransportationOptions_after_deliveryWindow", {
          traceId,
          source: "relist_after_regenerate",
          status: relist.firstRes?.res?.status,
          requestId: relist.firstRes?.requestId || null,
          count: options.length
        });
      }
      deliveryWindowHandledInThisRun = true;
    } else if (allRequireDeliveryWindow && allowDeliveryWindowConfirmation && !confirmedPlacement) {
      logStep("deliveryWindow_deferred", {
        traceId,
        reason: "placement_not_confirmed",
        placementOptionId: effectivePlacementOptionId || null
      });
    }

    if (!Array.isArray(options) || options.length === 0) {
      logStep("transportationOptions_empty", {
        traceId,
        placementOptionId: effectivePlacementOptionId,
        shippingMode: effectiveShippingMode,
        generateStatus: genRes?.res?.status || null,
        generateBodyPreview: (genRes?.text || "").slice(0, 600) || null,
        hasPlanShipmentIds: Array.isArray(planShipmentIds) && planShipmentIds.length > 0,
        hasPackedGroups: packingGroupsForTransport.length > 0
      });
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
        opt?.quote?.cost?.amount,
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
      const shippingSolution = String(
        opt?.shippingSolution || opt?.shippingSolutionId || opt?.shipping_solution || ""
      ).toUpperCase();
      if (shippingSolution.includes("AMAZON_PARTNERED")) return true;
      if (shippingSolution.includes("USE_YOUR_OWN_CARRIER")) return false;
      const flags = [
        opt?.partneredCarrier,
        opt?.isPartnered,
        opt?.partnered,
        opt?.isAmazonPartnered,
        opt?.amazonPartnered,
        opt?.isAmazonPartneredCarrier
      ].filter((v) => v !== undefined);
      if (flags.length) return Boolean(flags.find(Boolean));
      return false;
    };

    const shipmentIdsForTotals = Array.from(
      new Set(
        placementShipments
          .filter((sh: any) => !sh?.isPackingGroup && (sh?.shipmentId || sh?.id))
          .map((sh: any) => String(sh?.shipmentId || sh?.id))
          .filter((id: any) => isValidShipmentId(String(id)))
      )
    );
    let partneredChargeByShipment: Record<string, number> = {};
    let nonPartneredChargeByShipment: Record<string, number> = {};
    let partneredChargeTotal: number | null = null;
    let nonPartneredChargeTotal: number | null = null;
    if (shipmentIdsForTotals.length > 1) {
      const minChargeFor = (opts: any[], partnered: boolean) => {
        const charges = (opts || [])
          .filter((opt: any) => detectPartnered(opt) === partnered)
          .map((opt: any) => extractCharge(opt))
          .filter((c: any) => Number.isFinite(c));
        if (!charges.length) return null;
        return Math.min(...charges);
      };
      for (const shipmentId of shipmentIdsForTotals) {
        const { collected } = await listTransportationOptionsOnce(
          String(effectivePlacementOptionId),
          shipmentId,
          { probePartnered: true, maxPages: 6 }
        );
        const list = Array.isArray(collected) ? collected : [];
        const partneredMin = minChargeFor(list, true);
        const nonPartneredMin = minChargeFor(list, false);
        if (Number.isFinite(partneredMin)) partneredChargeByShipment[shipmentId] = partneredMin as number;
        if (Number.isFinite(nonPartneredMin)) nonPartneredChargeByShipment[shipmentId] = nonPartneredMin as number;
      }
      const allPartnered = shipmentIdsForTotals.every((id) => Number.isFinite(partneredChargeByShipment[id]));
      const allNonPartnered = shipmentIdsForTotals.every((id) => Number.isFinite(nonPartneredChargeByShipment[id]));
      partneredChargeTotal = allPartnered
        ? round2(
            shipmentIdsForTotals.reduce((sum, id) => sum + (partneredChargeByShipment[id] || 0), 0)
          )
        : null;
      nonPartneredChargeTotal = allNonPartnered
        ? round2(
            shipmentIdsForTotals.reduce((sum, id) => sum + (nonPartneredChargeByShipment[id] || 0), 0)
          )
        : null;
      logStep("listTransportationOptions_multi_shipment", {
        traceId,
        placementOptionId: effectivePlacementOptionId,
        shipmentIds: shipmentIdsForTotals,
        partneredByShipment: Object.fromEntries(
          shipmentIdsForTotals.map((id) => [id, Number.isFinite(partneredChargeByShipment[id])])
        ),
        optionsCountByShipment: Object.fromEntries(
          shipmentIdsForTotals.map((id) => [id, Array.isArray(transportCache.get(`${effectivePlacementOptionId}|${id}`)) ? transportCache.get(`${effectivePlacementOptionId}|${id}`)!.length : 0])
        ),
        partneredAvailableForAll: allPartnered,
        partneredAvailableForAny: shipmentIdsForTotals.some((id) => Number.isFinite(partneredChargeByShipment[id])),
        partneredMissingShipments: shipmentIdsForTotals.filter((id) => !Number.isFinite(partneredChargeByShipment[id])),
        partneredChargeTotal,
        nonPartneredChargeTotal
      });
    }

    const normalizeOptions = (opts: any[]) =>
      Array.isArray(opts)
        ? opts.map((opt: any) => ({
            id: opt.transportationOptionId || opt.id || opt.optionId || null,
            isPartnered: detectPartnered(opt),
            partnered: detectPartnered(opt),
            mode: opt.mode || opt.shippingMode || opt.method || null,
            carrierName: opt.carrierName || opt.carrier?.name || opt.carrier?.alphaCode || opt.carrier || null,
            charge: extractCharge(opt),
            shipmentId:
              opt.shipmentId ||
              opt.ShipmentId ||
              opt.shipment_id ||
              (Array.isArray(opt.shipments) ? opt.shipments[0]?.shipmentId : null) ||
              null,
            shippingSolution:
              opt.shippingSolution ||
              opt.shippingSolutionId ||
              opt.shipping_solution ||
              opt.shipping_solution_id ||
              null,
            raw: opt
          }))
        : [];

    const normalizedOptions = normalizeOptions(options);
    const normalizedOptionsSelection = normalizeOptions(optionsForSelectionRaw);
    const optionsPayload = normalizedOptions;

    const normalizeOptionMode = (mode: any) => {
      const up = String(mode || "").toUpperCase();
      if (!up) return "";
      if (
        ["SPD", "SMALL_PARCEL_DELIVERY", "SMALL_PARCEL", "GROUND_SMALL_PARCEL", "PARCEL"].includes(up)
      ) {
        return "GROUND_SMALL_PARCEL";
      }
      if (["LTL", "FREIGHT_LTL"].includes(up)) return "FREIGHT_LTL";
      if (["FTL", "FREIGHT_FTL"].includes(up)) return "FREIGHT_FTL";
      return up;
    };
    const normalizeSolution = (val: any) => String(val || "").trim().toUpperCase();
    const normalizeCarrier = (val: any) => String(val || "").trim().toUpperCase();
    const normalizedSelectedMode = selectedModeHint ? normalizeOptionMode(selectedModeHint) : "";
    let selectedSignature = {
      partnered: selectedPartnered,
      shippingSolution: normalizeSolution(selectedShippingSolution),
      carrierName: normalizeCarrier(selectedCarrierName),
      carrierCode: normalizeCarrier(selectedCarrierCode),
      mode: normalizedSelectedMode || ""
    };
    let hasSignature = Boolean(
      selectedSignature.partnered !== null ||
        selectedSignature.shippingSolution ||
        selectedSignature.carrierName ||
        selectedSignature.carrierCode ||
        selectedSignature.mode
    );
    const deriveSignatureFromOption = (opt: any) => {
      if (!opt) return null;
      const raw = opt.raw || opt || {};
      const mode = normalizeOptionMode(opt.mode || raw.shippingMode || raw.mode || "");
      const shippingSolution = normalizeSolution(
        opt.shippingSolution || raw.shippingSolution || raw.shippingSolutionId || raw.shipping_solution || ""
      );
      const carrierCode = normalizeCarrier(raw?.carrier?.alphaCode || raw?.carrierCode || "");
      const carrierName = normalizeCarrier(
        opt.carrierName || raw?.carrier?.name || raw?.carrier?.alphaCode || raw?.carrier || ""
      );
      const partnered =
        typeof opt.partnered === "boolean" ? opt.partnered : detectPartnered(raw);
      return {
        partnered: typeof partnered === "boolean" ? partnered : null,
        shippingSolution,
        carrierName,
        carrierCode,
        mode
      };
    };
    const ensureSignatureFromOption = (opt: any) => {
      if (hasSignature || !opt) return;
      const sig = deriveSignatureFromOption(opt);
      if (
        sig &&
        (sig.partnered !== null ||
          sig.shippingSolution ||
          sig.carrierName ||
          sig.carrierCode ||
          sig.mode)
      ) {
        selectedSignature = sig;
        hasSignature = true;
      }
    };
    const matchBySignature = (pool: any[]) => {
      if (!hasSignature || !Array.isArray(pool) || !pool.length) return null;
      return (
        pool.find((o) => {
          if (selectedSignature.partnered !== null && Boolean(o.partnered) !== selectedSignature.partnered) {
            return false;
          }
          if (selectedSignature.shippingSolution) {
            const sol = normalizeSolution(o.shippingSolution || o.raw?.shippingSolution || "");
            if (sol !== selectedSignature.shippingSolution) return false;
          }
          if (selectedSignature.mode) {
            const mode = normalizeOptionMode(o.mode || o.raw?.shippingMode || "");
            if (mode !== selectedSignature.mode) return false;
          }
          if (selectedSignature.carrierCode) {
            const code = normalizeCarrier(o.raw?.carrier?.alphaCode || "");
            if (code !== selectedSignature.carrierCode) return false;
          } else if (selectedSignature.carrierName) {
            const name = normalizeCarrier(o.carrierName || o.raw?.carrier?.name || "");
            if (name !== selectedSignature.carrierName) return false;
          }
          return true;
        }) || null
      );
    };

    let optionsForSelection = normalizedOptionsSelection;
    const returnedModes = Array.from(
      new Set(normalizedOptionsSelection.map((o) => normalizeOptionMode(o.mode)))
    ).filter(Boolean);
    const returnedSolutions = Array.from(
      new Set(
        normalizedOptionsSelection
          .map((o) => String(o.shippingSolution || o.raw?.shippingSolution || "").toUpperCase())
      )
    ).filter(Boolean);
    const effectiveOptionsForSelection = optionsForSelection;
    const normalizedRequestedMode = normalizeOptionMode(effectiveShippingMode);
    const modeMismatch = Boolean(
      normalizedRequestedMode && returnedModes.length && !returnedModes.includes(normalizedRequestedMode)
    );

    // Nu alegem implicit; doar expunem optiunile disponibile.
    const partneredOpt = effectiveOptionsForSelection.find((o) => o.partnered) || null;

    const isMultiShipment = listingShipmentIds.length > 1;
    let selectedOption: any = null;
    if (confirmOptionId) {
      selectedOption =
        effectiveOptionsForSelection.find((o) => o.id === confirmOptionId) || null;
    }

    const partneredChargeForSummary =
      isMultiShipment && Number.isFinite(partneredChargeTotal)
        ? partneredChargeTotal
        : partneredOpt?.charge ?? null;
    const nonPartneredChargeForSummary =
      isMultiShipment && Number.isFinite(nonPartneredChargeTotal)
        ? nonPartneredChargeTotal
        : null;
    const selectedChargeForSummary =
      selectedOption
        ? (
          isMultiShipment && selectedOption?.partnered
            ? partneredChargeTotal
            : isMultiShipment && selectedOption && !selectedOption.partnered
              ? nonPartneredChargeTotal
              : null
        ) ?? selectedOption?.charge ?? null
        : null;
    const summary = {
      partneredAllowed: Boolean(partneredOpt),
      partneredAvailableForAll,
      partneredAvailableForAny,
      partneredMissingShipments,
      partneredRate: partneredChargeForSummary,
      defaultOptionId: partneredOpt?.id || null,
      defaultCarrier: partneredOpt?.carrierName || null,
      defaultMode: partneredOpt?.mode || null,
      defaultCharge: partneredChargeForSummary,
      requestedMode: normalizedRequestedMode || null,
      returnedModes,
      returnedSolutions,
      modeMismatch,
      shipmentCount:
        shipmentIdsForTotals.length ||
        listingShipmentIds.length ||
        (shipmentIdForListing ? 1 : 0),
      partneredChargeByShipment: Object.keys(partneredChargeByShipment).length ? partneredChargeByShipment : null,
      partneredChargeTotal,
      nonPartneredChargeByShipment: Object.keys(nonPartneredChargeByShipment).length ? nonPartneredChargeByShipment : null,
      nonPartneredChargeTotal
    };
    const summaryWithSelection = {
      ...summary,
      selectedOptionId: selectedOption?.id || null,
      selectedCarrier: selectedOption?.carrierName || null,
      selectedMode: selectedOption?.mode || null,
      selectedCharge: selectedChargeForSummary,
      selectedPartnered: Boolean(selectedOption?.partnered),
      selectedSolution:
        selectedOption?.shippingSolution || selectedOption?.raw?.shippingSolution || null
    };
    if (spdWarnings.length) {
      summary["warnings"] = spdWarnings;
    }
    if (!partneredOpt) {
      summary["partneredMissingReason"] =
        "Amazon nu a returnat AMAZON_PARTNERED_CARRIER pentru acest placement/transportation request.";
      logStep("partnered_missing", {
        traceId,
        placementOptionId: effectivePlacementOptionId,
        shippingMode: effectiveShippingMode,
        returnedSolutions,
        returnedModes,
        modeMismatch,
        hasPackages: !missingPkgs,
        hasPallets,
        hasFreightInformation: !missingFreightInfo,
        contactInformationPresent: Boolean(contactInformation),
        spdWarningsCount: spdWarnings.length
      });
    }

    if (!shouldConfirm) {
      const normalizedShipments = await normalizeShipmentsFromPlan();
      return new Response(
        JSON.stringify({
          inboundPlanId,
          placementOptionId: effectivePlacementOptionId || null,
          options: optionsPayload,
          shipments: normalizedShipments,
          summary: summaryWithSelection,
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

    if (modeMismatch) {
      return new Response(
        JSON.stringify({
          error: "Shipping mode nu corespunde opțiunilor returnate de Amazon.",
          code: "SHIPPING_MODE_MISMATCH",
          requestedMode: normalizedRequestedMode || null,
          returnedModes,
          traceId
        }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    if (placementShipments.some((s: any) => s?.isPackingGroup)) {
      return new Response(
        JSON.stringify({
          error: "Placement confirmat, dar Amazon nu a emis încă shipmentId-urile. Reîncearcă confirmarea peste câteva secunde.",
          code: "SHIPMENTS_PENDING_FOR_CONFIRM",
          traceId,
          retryAfterMs: 4000
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
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

    const forcePartneredOnly =
      body?.force_partnered_only ??
      body?.forcePartneredOnly ??
      false;

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
    // Pentru fluxul PCP păstrăm auto-select; pentru non-PCP nu auto-selectăm fallback ca să evităm opțiuni greșite
    const autoSelectTransportationOptionRaw =
      body?.auto_select_transportation_option ??
      body?.autoSelectTransportationOption ??
      false;
    const autoSelectTransportationOption = Boolean(autoSelectTransportationOptionRaw) && !confirmOptionId;
    selectedOption =
      selectedOption ||
      (confirmOptionId
        ? effectiveOptionsForSelection.find((o) => o.id === confirmOptionId) || null
        : null) ||
      null;
    if (!selectedOption) {
      const refresh = await listTransportationOptionsOnce(
        String(effectivePlacementOptionId),
        shipmentIdForListing,
        {
          requiredOptionId: confirmOptionId || null
        }
      );
      const refreshedNormalized = normalizeOptions(refresh.collected || []);
      const refreshedForSelection = normalizedRequestedMode
        ? refreshedNormalized.filter((o) => normalizeOptionMode(o.mode) === normalizedRequestedMode)
        : refreshedNormalized;
      const selectionPoolRaw = refreshedForSelection.length ? refreshedForSelection : refreshedNormalized;
      const selectionPool = (() => {
        if (!shipmentIdForListing) return selectionPoolRaw;
        const withShipment = selectionPoolRaw.filter((o) => {
          const sid = o.shipmentId || o.raw?.shipmentId || null;
          const list = Array.isArray(o.raw?.shipments) ? o.raw.shipments : [];
          const hasInList = list.some((s: any) => String(s?.shipmentId || s?.id || "").trim() === shipmentIdForListing);
          return sid === shipmentIdForListing || hasInList;
        });
        return withShipment.length ? withShipment : selectionPoolRaw;
      })();
      const requestedOption = confirmOptionId
        ? selectionPool.find((o) => o.id === confirmOptionId) || null
        : null;
      if (confirmOptionId && !requestedOption) {
        const signatureMatch = matchBySignature(selectionPool);
        if (signatureMatch) {
          selectedOption = signatureMatch;
          logStep("transportationOption_signature_match", {
            traceId,
            reason: "confirm_id_not_found",
            missingOptionId: confirmOptionId,
            matchedOptionId: signatureMatch?.id || null
          });
        }
      }
      if (confirmOptionId && !requestedOption && !selectedOption) {
        // Amazon poate roti transportationOptionId între listare și confirmare pentru OYC.
        // Facem auto-recovery strict pentru confirm flow non-partnered.
        const canAutoRecoverMissingRequested =
          shouldConfirm &&
          selectionPool.length > 0 &&
          !forcePartneredOnly &&
          !partneredOpt;
        const canAutoRecoverPartnered =
          shouldConfirm &&
          selectionPool.length > 0 &&
          forcePartneredOnly &&
          partneredOpt;
        const allowAuto =
          (autoSelectTransportationOptionRaw && partneredOpt) ||
          canAutoRecoverMissingRequested ||
          canAutoRecoverPartnered;
        if (allowAuto) {
          const fallbackAuto = partneredOpt
            ? selectionPool
                .filter((o) => o.partnered)
                .sort((a, b) => (Number(a.charge || 0) - Number(b.charge || 0)))[0] ||
              selectionPool[0] ||
              null
            : selectionPool.find((o) => !o.partnered) || selectionPool[0] || null;
          selectedOption = fallbackAuto;
          logStep("transportationOption_autoswitch_missing", {
            traceId,
            reason: "confirm_id_not_found",
            missingOptionId: confirmOptionId,
            fallbackOptionId: fallbackAuto?.id || null,
            autoRecovered: canAutoRecoverMissingRequested || canAutoRecoverPartnered
          });
        } else {
          return new Response(
            JSON.stringify({
              error:
                "Opțiunea de transport selectată nu mai este disponibilă pentru acest shipment. Reîncarcă lista și alege din nou.",
              code: "TRANSPORTATION_OPTION_NOT_FOUND",
              traceId,
              availableOptions: selectionPool.map((o) => ({
                id: o.id,
                carrierName: o.carrierName || null,
                mode: o.mode || null,
                shippingSolution: o.shippingSolution || null,
                charge: o.charge ?? null
              }))
            }),
            { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
      }
      if (requestedOption) {
        selectedOption = requestedOption;
      }
      if (!selectedOption && (autoSelectTransportationOption && partneredOpt)) {
        selectedOption = selectionPool.find((o) => o.partnered) || selectionPool[0] || null;
        logStep("transportationOption_auto_selected", {
          traceId,
          reason: confirmOptionId ? "not_found" : "missing",
          selectedOptionId: selectedOption?.id || null,
          shippingSolution: selectedOption?.shippingSolution || null,
          carrierName: selectedOption?.carrierName || null
        });
      }
      if (!selectedOption && !autoSelectTransportationOption) {
        return new Response(
          JSON.stringify({
            error: confirmOptionId
              ? "Opțiunea de transport selectată nu a fost găsită în lista Amazon."
              : "Selectează explicit o opțiune de transport înainte de confirmare.",
            code: confirmOptionId ? "TRANSPORTATION_OPTION_NOT_FOUND" : "TRANSPORTATION_OPTION_REQUIRED",
            traceId,
            availableOptions: selectionPool.map((o) => ({
              id: o.id,
              carrierName: o.carrierName || null,
              mode: o.mode || null,
              shippingSolution: o.shippingSolution || null,
              charge: o.charge ?? null
            }))
          }),
          { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      // dacă opțiunea găsită nu are shipment-ul curent, încearcă să alegi una care îl conține
      if (shipmentIdForListing && selectedOption) {
        const shipmentsFromOption = Array.isArray(selectedOption.raw?.shipments)
          ? selectedOption.raw.shipments.map((s: any) => String(s?.shipmentId || s?.id || "")).filter(Boolean)
          : [];
        const optionHasShipment =
          shipmentsFromOption.length === 0 ||
          shipmentsFromOption.some((sid: string) => sid === shipmentIdForListing);
        if (!optionHasShipment) {
          const match = selectionPool.find((o) => {
            const list = Array.isArray(o.raw?.shipments)
              ? o.raw.shipments.map((s: any) => String(s?.shipmentId || s?.id || "")).filter(Boolean)
              : [];
            return list.some((sid) => sid === shipmentIdForListing);
          });
          if (match) {
            selectedOption = match;
            logStep("transportationOption_autoswitch_wrong_shipment", {
              traceId,
              shipmentId: shipmentIdForListing,
              newOptionId: selectedOption?.id || null
            });
          } else {
            return new Response(
              JSON.stringify({
                error:
                  "Amazon a returnat o listă de transport care nu se potrivește cu shipment-ul curent. Reîncarcă opțiunile și selectează din listă.",
                code: "TRANSPORTATION_OPTION_SHIPMENT_MISMATCH",
                traceId,
                shipmentId: shipmentIdForListing,
                availableOptions: selectionPool.map((o) => ({
                  id: o.id,
                  carrierName: o.carrierName || null,
                  mode: o.mode || null,
                  shippingSolution: o.shippingSolution || null,
                  charge: o.charge ?? null,
                  shipments: Array.isArray(o.raw?.shipments)
                    ? o.raw.shipments.map((s: any) => s?.shipmentId || s?.id || null)
                    : []
            }))
          }),
          { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    // Re-validate selected option against latest list for this shipment (must be AVAILABLE and belong to shipment)
    const validateSelectedOption = async (optId: string, shId: string | null) => {
      const { collected } = await listTransportationOptionsOnce(
        String(effectivePlacementOptionId),
        shId || undefined,
        {
          requiredOptionId: optId
        }
      );
      const match = (collected || []).find((opt: any) => {
        const id = opt?.transportationOptionId || opt?.id || opt?.optionId || null;
        const shipmentIds =
          Array.isArray(opt?.shipments)
            ? opt.shipments.map((s: any) => s?.shipmentId || s?.id).filter(Boolean)
            : opt?.shipmentId
              ? [opt.shipmentId]
              : [];
        const statusUp = String(opt?.status || "AVAILABLE").toUpperCase();
        const belongs = !shId || shipmentIds.length === 0 || shipmentIds.includes(String(shId));
        return id === optId && statusUp === "AVAILABLE" && belongs;
      });
      return match || null;
    };

    const primaryShipmentId =
      firstShipmentId ||
      placementShipments.find((s: any) => !s?.isPackingGroup && (s?.shipmentId || s?.id))?.shipmentId ||
      placementShipments.find((s: any) => !s?.isPackingGroup && (s?.shipmentId || s?.id))?.id ||
      null;

    if (selectedOption?.id) {
      const validated = await validateSelectedOption(selectedOption.id, primaryShipmentId);
      if (!validated) {
        let fallbackAfterValidation: any = null;
        if (shouldConfirm && !forcePartneredOnly) {
          const reloaded = await listTransportationOptionsOnce(
            String(effectivePlacementOptionId),
            primaryShipmentId || undefined,
            { requiredOptionId: null }
          );
          const reloadedNormalized = normalizeOptions(reloaded.collected || []);
          const reloadedForMode = normalizedRequestedMode
            ? reloadedNormalized.filter((o) => normalizeOptionMode(o.mode) === normalizedRequestedMode)
            : reloadedNormalized;
          const reloadedPool = reloadedForMode.length ? reloadedForMode : reloadedNormalized;
          fallbackAfterValidation =
            reloadedPool.find((o) => !o.partnered) ||
            reloadedPool[0] ||
            null;
        }
        if (!fallbackAfterValidation?.id && shouldConfirm && forcePartneredOnly) {
          const reloaded = await listTransportationOptionsOnce(
            String(effectivePlacementOptionId),
            primaryShipmentId || undefined,
            { requiredOptionId: null }
          );
          const reloadedNormalized = normalizeOptions(reloaded.collected || []);
          const reloadedForMode = normalizedRequestedMode
            ? reloadedNormalized.filter((o) => normalizeOptionMode(o.mode) === normalizedRequestedMode)
            : reloadedNormalized;
          const reloadedPool = reloadedForMode.length ? reloadedForMode : reloadedNormalized;
          fallbackAfterValidation =
            reloadedPool
              .filter((o) => o.partnered)
              .sort((a, b) => (Number(a.charge || 0) - Number(b.charge || 0)))[0] ||
            null;
        }
        if (!fallbackAfterValidation?.id) {
          const signatureMatch = matchBySignature(
            Array.isArray(optionsForSelection) && optionsForSelection.length
              ? optionsForSelection
              : normalizedOptionsSelection
          );
          if (signatureMatch?.id) {
            fallbackAfterValidation = signatureMatch;
          }
        }
        if (fallbackAfterValidation?.id) {
          selectedOption = fallbackAfterValidation;
          logStep("transportationOption_autorecover_unavailable", {
            traceId,
            previousOptionId: confirmOptionId || null,
            recoveredOptionId: selectedOption?.id || null,
            shipmentId: primaryShipmentId || null
          });
        } else {
          return new Response(
            JSON.stringify({
              error:
                "Opțiunea de curier selectată nu mai este disponibilă pentru acest shipment. Selectează din lista reîncărcată.",
              code: "TRANSPORTATION_OPTION_NOT_AVAILABLE",
              traceId
            }),
            { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
          );
        }
      }
    }
      }
    }
    if (forcePartneredOnly && !selectedOption.partnered) {
      return new Response(
        JSON.stringify({
          error: "Trebuie selectată o opțiune Amazon partnered carrier.",
          code: "PARTNERED_REQUIRED",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    if (!selectedOption?.id) {
      return new Response(
        JSON.stringify({
          error: "Nu există transportationOption de confirmat (Amazon). Reîncearcă după re-generare.",
          traceId
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    function isValidShipmentId(val: any): boolean {
      return typeof val === "string" && val.length >= 10 && !val.startsWith("s-");
    }

    const isNonPartneredSelection = !selectedOption?.partnered;
    const requiresDeliveryWindow =
      isNonPartneredSelection &&
      (hasDeliveryWindowPrecondition(selectedOption?.raw || selectedOption) || isNonPartneredSelection);
    if (requiresDeliveryWindow && !deliveryWindowHandledInThisRun) {
      const shipmentIds = Array.from(
        new Set<string>(
          (Array.isArray(selectedOption?.raw?.shipments)
            ? selectedOption.raw.shipments.map((sh: any) => sh?.shipmentId || sh?.id)
            : placementShipments.map((s: any) => s?.shipmentId || s?.id)
          )
            .filter(Boolean)
            .map((id: any) => String(id))
            .filter(isValidShipmentId)
        )
      );
      if (!shipmentIds.length) {
        return new Response(
          JSON.stringify({
            error: "ShipmentId-urile nu sunt încă disponibile. Reîncearcă în câteva secunde.",
            code: "SHIPMENTS_PENDING_FOR_CONFIRM",
            traceId
          }),
          { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
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
        const dwOptionId = pickDeliveryWindowOptionId(optionsList, preferredDeliveryWindow || undefined);
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
      // IMPORTANT: re-generate transportation options after delivery window confirmation
      const regenRes = await signedFetch({
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
        operationName: "inbound.v20240320.generateTransportationOptions_after_deliveryWindow",
        marketplaceId,
        sellerId
      });
      const regenOpId =
        regenRes?.json?.payload?.operationId ||
        regenRes?.json?.operationId ||
        null;
      if (regenOpId) {
        const regenStatus = await pollOperationStatus(regenOpId);
        logStep("generateTransportationOptions_after_deliveryWindow_status", {
          traceId,
          operationId: regenOpId,
          state: getOperationState(regenStatus) || null,
          status: regenStatus?.res?.status || null,
          requestId: regenStatus?.requestId || null,
          problems: getOperationProblems(regenStatus) || null
        });
      } else {
        logStep("generateTransportationOptions_after_deliveryWindow_raw", {
          traceId,
          status: regenRes?.res?.status || null,
          requestId: regenRes?.requestId || null,
          bodyPreview: (regenRes?.text || "").slice(0, 600) || null
        });
      }

      // Re-list transportation options to avoid stale option IDs after delivery window confirmation
      const refreshed = await listTransportationOptionsOnce(
        String(effectivePlacementOptionId),
        shipmentIdForListing,
        {
          requiredOptionId: confirmOptionId || null
        }
      );
      const refreshedNormalized = normalizeOptions(refreshed.collected || refreshed.options || []);
      const refreshedForSelection = normalizedRequestedMode
        ? refreshedNormalized.filter((o) => normalizeOptionMode(o.mode) === normalizedRequestedMode)
        : refreshedNormalized;
      optionsForSelectionRaw = refreshedForSelection;
      optionsForSelection = refreshedForSelection;
      if (confirmOptionId) {
        selectedOption = refreshedNormalized.find((o) => o.id === confirmOptionId) || selectedOption;
      }
      if (!selectedOption && refreshedNormalized.length) {
        selectedOption = refreshedNormalized.find((o) => o.partnered) || refreshedNormalized[0] || null;
      }
      if (!selectedOption?.id) {
        return new Response(
          JSON.stringify({
            error: "Nu există transportationOption de confirmat (Amazon) după confirmarea ferestrei de livrare.",
            code: "TRANSPORTATION_OPTION_NOT_FOUND",
            traceId
          }),
          { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    ensureSignatureFromOption(selectedOption);

    // Re-list transportation options right before confirmation to avoid stale IDs
    const refreshTransportOptions = async () => {
      const refreshed = await listTransportationOptionsOnce(
        String(effectivePlacementOptionId),
        shipmentIdForListing,
        {
          requiredOptionId: confirmOptionId || selectedOption?.id || null
        }
      );
      const refreshedNormalized = normalizeOptions(refreshed.collected || refreshed.options || refreshed || []);
      const refreshedForSelection = normalizedRequestedMode
        ? refreshedNormalized.filter((o) => normalizeOptionMode(o.mode) === normalizedRequestedMode)
        : refreshedNormalized;
      optionsForSelectionRaw = refreshedForSelection;
      optionsForSelection = refreshedForSelection;
      const shipmentMatch = (opt: any) => {
        const sid = opt?.shipmentId || opt?.raw?.shipmentId || null;
        if (sid && shipmentIdForListing && sid === shipmentIdForListing) return true;
        if (Array.isArray(opt?.raw?.shipments)) {
          return opt.raw.shipments.some(
            (sh: any) => String(sh?.shipmentId || sh?.id || "") === shipmentIdForListing
          );
        }
        return !shipmentIdForListing;
      };
      if (confirmOptionId) {
        selectedOption = refreshedNormalized.find((o) => o.id === confirmOptionId) || selectedOption;
      }
      if (!selectedOption && refreshedNormalized.length) {
        const withShipment = refreshedNormalized.filter(shipmentMatch);
        selectedOption =
          withShipment.find((o) => o.partnered) ||
          withShipment[0] ||
          refreshedNormalized.find((o) => o.partnered) ||
          refreshedNormalized[0] ||
          null;
      }
      return Boolean(selectedOption?.id);
    };

    const refreshedOk = await refreshTransportOptions();
    if (!refreshedOk) {
      return new Response(
        JSON.stringify({
          error: "Nu există transportationOption de confirmat (Amazon). Re-generare necesară.",
          code: "TRANSPORTATION_OPTION_NOT_FOUND",
          traceId
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const contactForConfirm =
      contactInformation && isCompleteContact(contactInformation)
        ? {
            name: contactInformation.name,
            phoneNumber: contactInformation.phoneNumber,
            email: contactInformation.email
          }
        : null;
    const shipmentIdsForConfirm = shipmentIdsForTotals.length
      ? shipmentIdsForTotals
      : (() => {
          if (Array.isArray(selectedOption?.raw?.shipments) && selectedOption.raw.shipments.length) {
            return selectedOption.raw.shipments
              .map((sh: any) => sh?.shipmentId || sh?.id)
              .filter((id: any) => isValidShipmentId(String(id)));
          }
          if (selectedOption?.shipmentId && isValidShipmentId(String(selectedOption.shipmentId))) {
            return [String(selectedOption.shipmentId)];
          }
          const first = placementShipments.find((s: any) => !s?.isPackingGroup && (s?.shipmentId || s?.id));
          return first ? [String(first.shipmentId || first.id)] : [];
        })();

    const resolveOptionForShipment = async (shipmentId: string) => {
      const { collected } = await listTransportationOptionsOnce(
        String(effectivePlacementOptionId),
        shipmentId,
        {
          requiredOptionId: confirmOptionId || selectedOption?.id || null
        }
      );
      const normalized = normalizeOptions(collected || []);
      const pool = normalizedRequestedMode
        ? normalized.filter((o) => normalizeOptionMode(o.mode) === normalizedRequestedMode)
        : normalized;
      const byId = (optId: string | null) =>
        optId
          ? pool.find((o) => o.id === optId) || normalized.find((o) => o.id === optId) || null
          : null;
      let candidate = byId(confirmOptionId || null);
      if (!candidate) candidate = byId(selectedOption?.id || null);
      if (!candidate) candidate = matchBySignature(pool) || matchBySignature(normalized);
      if (!candidate) return null;
      const statusUp = String(candidate?.raw?.status || "AVAILABLE").toUpperCase();
      if (statusUp !== "AVAILABLE") return null;
      return candidate;
    };

    const selections: Array<{ shipmentId: string; transportationOptionId: string; contactInformation?: any }> = [];
    const missingShipments: string[] = [];
    for (const shipmentId of shipmentIdsForConfirm) {
      const match = await resolveOptionForShipment(shipmentId);
      if (!match?.id) {
        missingShipments.push(shipmentId);
        continue;
      }
      selections.push({
        shipmentId,
        transportationOptionId: match.id,
        ...(contactForConfirm ? { contactInformation: contactForConfirm } : {})
      });
    }

    if (missingShipments.length) {
      return new Response(
        JSON.stringify({
          error:
            "Opțiunea selectată nu este disponibilă pentru toate shipment-urile. Reîncearcă sau alege altă opțiune.",
          code: "TRANSPORTATION_OPTION_NOT_AVAILABLE",
          traceId,
          missingShipments
        }),
        { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    if (!selections.length) {
      return new Response(
        JSON.stringify({
          error: "ShipmentId-urile nu sunt încă disponibile. Reîncearcă în câteva secunde.",
          code: "SHIPMENTS_PENDING_FOR_CONFIRM",
          traceId
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

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
          const summaryWithSelection = {
            ...summary,
            selectedOptionId: selectedTransportationOptionId,
            selectedCarrier: "Amazon confirmed carrier",
            selectedMode: effectiveShippingMode || null,
            selectedCharge: null,
            selectedPartnered: null,
            selectedSolution: null
          };
          const { error: updErr } = await supabase
            .from("prep_requests")
            .update({
              placement_option_id: effectivePlacementOptionId,
              transportation_option_id: selectedTransportationOptionId,
              step2_confirmed_at: new Date().toISOString(),
              step2_summary: summaryWithSelection,
              step2_shipments: normalizedShipments,
              ...buildShipmentNameUpdate()
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
              summary: summaryWithSelection,
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
    if (!confirmRes?.res?.ok && !confirmOpId) {
      const bodyPreview = (confirmRes?.text || "").slice(0, 400) || null;
      return new Response(
        JSON.stringify({
          error: "Transportation confirmation failed",
          traceId,
          status: confirmRes?.res?.status || null,
          bodyPreview
        }),
        { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
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

    const shipments = await normalizeShipmentsFromPlan();

    // Trimite email de confirmare către client (non-blocant)
    const sendPrepConfirmEmail = async () => {
      try {
        if (!SUPABASE_SERVICE_ROLE_KEY) {
          logStep("sendPrepConfirmEmail_skipped", { traceId, reason: "missing_service_role_key" });
          return;
        }
        const { data: prepRow, error: prepErr } = await supabase
          .from("prep_requests")
          .select(
            "id, user_id, company_id, fba_shipment_id, obs_admin, destination_country, warehouse_country, prep_request_items(id, asin, sku, product_name, units_requested, units_sent, units_removed, obs_admin)"
          )
          .eq("id", requestId)
          .maybeSingle();
        if (prepErr || !prepRow) {
          logStep("sendPrepConfirmEmail_skip", { traceId, reason: "prep_request_missing", error: prepErr?.message || null });
          return;
        }
        const { data: profileRow, error: profileErr } = await supabase
          .from("profiles")
          .select("email, first_name, last_name, company_name")
          .eq("id", prepRow.user_id)
          .maybeSingle();
        if (profileErr || !profileRow?.email) {
          logStep("sendPrepConfirmEmail_skip", {
            traceId,
            reason: "profile_missing_email",
            error: profileErr?.message || null
          });
          return;
        }
        const items = (prepRow.prep_request_items || []).map((it: any) => {
          const requested = Number(it.units_requested ?? 0) || 0;
          const sent = Number(it.units_sent ?? requested) || 0;
          const removed = Number.isFinite(it.units_removed) ? Number(it.units_removed) : Math.max(requested - sent, 0);
          return {
            asin: it.asin || null,
            sku: it.sku || null,
            image_url: null,
            requested,
            sent,
            removed,
            note: it.obs_admin || null
          };
        });
        const clientName = `${(profileRow.first_name || "").trim()} ${(profileRow.last_name || "").trim()}`.trim() || null;
        const payload = {
          request_id: requestId,
          email: profileRow.email,
          client_name: clientName,
          company_name: profileRow.company_name || null,
          note: prepRow.obs_admin || null,
          items,
          fba_shipment_id: shipments?.[0]?.shipmentId || prepRow.fba_shipment_id || null,
          marketplace: marketplaceId || null,
          country: prepRow.destination_country || prepRow.warehouse_country || null
        };
        const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send_prep_confirm_email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        if (!emailRes.ok) {
          const bodyPreview = (await emailRes.text().catch(() => ""))?.slice(0, 400) || null;
          logStep("sendPrepConfirmEmail_failed", { traceId, status: emailRes.status, bodyPreview });
        } else {
          logStep("sendPrepConfirmEmail", { traceId, status: emailRes.status });
        }
      } catch (err) {
        logStep("sendPrepConfirmEmail_error", { traceId, error: `${err}` });
      }
    };

    sendPrepConfirmEmail();

    const { error: updErr } = await supabase
      .from("prep_requests")
      .update({
        placement_option_id: effectivePlacementOptionId,
        transportation_option_id: selectedOption?.id || null,
        step2_confirmed_at: new Date().toISOString(),
        step2_summary: summaryWithSelection,
        step2_shipments: shipments,
        ...buildShipmentNameUpdate()
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
          summary: summaryWithSelection,
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
