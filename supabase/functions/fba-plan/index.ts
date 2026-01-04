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

type PrepRequestItem = {
  id: string;
  asin: string | null;
  sku: string | null;
  product_name: string | null;
  units_requested: number | null;
  units_sent: number | null;
  stock_item_id?: number | null;
  stock_item?: {
    image_url?: string | null;
    sku?: string | null;
    asin?: string | null;
    name?: string | null;
  } | null;
};

type PrepGuidance = {
  sku?: string | null;
  asin?: string | null;
  prepRequired: boolean;
  prepInstructions: string[];
  barcodeInstruction?: string | null;
  guidance?: string | null;
};

type AmazonIntegration = {
  user_id: string | null;
  company_id: string | null;
  marketplace_id: string;
  region: string;
  refresh_token: string;
};

function maskSecret(value: string, visible: number = 4) {
  if (!value) return "";
  if (value.length <= visible * 2) return value.replace(/./g, "*");
  return `${value.slice(0, visible)}${"*".repeat(Math.max(1, value.length - visible * 2))}${value.slice(-visible)}`;
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

function normalizeAttrArray(v: any): any[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function extractBoolAttr(attrs: any, key: string): boolean | null {
  const raw = attrs?.[key];
  const direct = toBool(raw);
  if (direct !== null) return direct;

  for (const entry of normalizeAttrArray(raw)) {
    const val = toBool(entry?.value);
    if (val !== null) return val;
    const val2 = toBool(entry?.boolean_value);
    if (val2 !== null) return val2;
  }
  return null;
}

function hasAnyAttrValue(attrs: any, key: string): boolean {
  const raw = attrs?.[key];
  if (raw == null) return false;
  if (typeof raw === "string") return raw.trim().length > 0;
  if (typeof raw === "number") return Number.isFinite(raw);
  if (typeof raw === "boolean") return true;
  if (Array.isArray(raw)) return raw.some((x) => x?.value != null && String(x.value).trim() !== "");
  if (typeof raw === "object") return Object.keys(raw).length > 0;
  return false;
}

function extractExpiryFlags(attrs: any) {
  const iedp = extractBoolAttr(attrs, "is_expiration_dated_product");
  const hasShelfLife =
    hasAnyAttrValue(attrs, "fc_shelf_life") ||
    hasAnyAttrValue(attrs, "fc_shelf_life_unit_of_measure") ||
    hasAnyAttrValue(attrs, "product_expiration_type");
  return { iedp, hasShelfLife };
}

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

function canonicalQueryString(query: string) {
  if (!query) return "";
  const params = new URLSearchParams(query);
  const entries = Array.from(params.entries())
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    });
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const canonicalQuery = canonicalQueryString(query);
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

type TempCreds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
};

async function resolveSellerId(companyId?: string | null, existing?: string | null) {
  if (existing) return existing;
  if (!companyId) return SUPABASE_SELLER_ID || "";
  // Try seller_links
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

async function spapiGet(opts: {
  host: string;
  region: string;
  path: string;
  query: string;
  lwaToken: string;
  tempCreds: TempCreds;
  traceId?: string;
  operationName?: string;
  marketplaceId?: string;
  sellerId?: string;
}) {
  const { host, region, path, query, lwaToken, tempCreds, traceId, operationName, marketplaceId, sellerId } = opts;
  const out = await signedFetch({
    method: "GET",
    service: "execute-api",
    region,
    host,
    path,
    query,
    payload: "",
    accessKey: tempCreds.accessKeyId,
    secretKey: tempCreds.secretAccessKey,
    sessionToken: tempCreds.sessionToken,
    lwaToken,
    traceId,
    operationName,
    marketplaceId,
    sellerId
  });
  return { res: out.res, text: out.text, json: out.json };
}

type CatalogApiResult = {
  res: ReturnType<typeof spapiGet>["res"];
  json: any;
  text: string;
  rateLimited: boolean;
};

type CatalogAttributesResult = {
  attributes: any;
  status: number;
  ok: boolean;
  rateLimited: boolean;
  errorText: string;
};

type CatalogCheckResult = {
  found: boolean;
  reason: string;
  rateLimited: boolean;
};

async function catalogSpapiCall(opts: Parameters<typeof spapiGet>[0] & { maxAttempts?: number }) {
  const { maxAttempts = 3 } = opts;
  let attempt = 0;
  let lastRes: ReturnType<typeof spapiGet>["res"] | null = null;
  let lastJson: any = null;
  let lastText = "";
  while (attempt < maxAttempts) {
    attempt += 1;
    const { res, json, text } = await spapiGet(opts);
    lastRes = res;
    lastJson = json;
    lastText = text || "";
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retryable || res.ok || attempt >= maxAttempts) {
      return {
        res,
        json,
        text: lastText,
        rateLimited: res.status === 429
      };
    }
    await delay(150 * attempt);
  }
  return {
    res: lastRes as ReturnType<typeof spapiGet>["res"],
    json: lastJson,
    text: lastText,
    rateLimited: lastRes?.status === 429
  };
}

async function catalogCheck(params: {
  asin?: string | null;
  marketplaceId: string;
  host: string;
  region: string;
  lwaToken: string;
  tempCreds: TempCreds;
  traceId: string;
  sellerId: string;
}): Promise<CatalogCheckResult> {
  const { asin, marketplaceId, host, region, lwaToken, tempCreds, traceId, sellerId } = params;
  if (!asin) return { found: false, reason: "Lipsă ASIN pentru verificare catalog", rateLimited: false };
  const path = `/catalog/2022-04-01/items/${encodeURIComponent(asin)}`;
  const query = new URLSearchParams({
    marketplaceIds: marketplaceId,
    includedData: "attributes"
  }).toString();
  const { res, json, text, rateLimited } = await catalogSpapiCall({
    host,
    region,
    path,
    query,
    lwaToken,
    tempCreds,
    traceId,
    operationName: "catalog.getItem",
    marketplaceId,
    sellerId
  });
  if (res.ok) {
    const payload = json?.payload || json || {};
    const identifiers = payload?.identifiers || payload?.Identifiers || [];
    const summaries = payload?.summaries || payload?.Summaries || [];
    const marketplaceMatches = (entry: any) => {
      const mids = entry?.marketplaceId || entry?.MarketplaceId;
      if (Array.isArray(mids)) return mids.includes(marketplaceId);
      return mids === marketplaceId;
    };
    const hasIdentifiers = Array.isArray(identifiers) && identifiers.some((id: any) => marketplaceMatches(id));
    const hasSummaries = Array.isArray(summaries) && summaries.some((s: any) => marketplaceMatches(s));
    const hasMarketplace = hasIdentifiers || hasSummaries;
    if (hasMarketplace) return { found: true, reason: "Găsit în Catalog Items" };
  }
  return { found: false, reason: `Catalog check ${res.status}: ${text}`, rateLimited };
}

async function fetchCatalogItemAttributes(params: {
  asin: string;
  host: string;
  region: string;
  tempCreds: TempCreds;
  lwaToken: string;
  traceId: string;
  marketplaceId: string;
  sellerId: string;
}) {
  const { asin, host, region, tempCreds, lwaToken, traceId, marketplaceId, sellerId } = params;
  const path = `/catalog/2022-04-01/items/${encodeURIComponent(asin)}`;
  const query = new URLSearchParams({
    marketplaceIds: marketplaceId,
    includedData: "attributes"
  }).toString();
  try {
    const { res, json, text, rateLimited } = await catalogSpapiCall({
      host,
      region,
      path,
      query,
      lwaToken,
      tempCreds,
      traceId,
      operationName: "catalog.getItem.attributes",
      marketplaceId,
      sellerId
    });
    const payload = json?.payload || json || {};
    const firstItem = Array.isArray(payload?.items) ? payload.items[0] : null;
    const attributes =
      payload?.attributes ||
      payload?.Attributes ||
      json?.attributes ||
      json?.Attributes ||
      firstItem?.attributes ||
      firstItem?.Attributes ||
      (firstItem?.attributeSets && firstItem.attributeSets[0]) ||
      {};
    return { attributes: attributes || {}, status: res.status, ok: res.ok, rateLimited, errorText: text };
  } catch (error) {
    console.warn("catalog attributes fetch failed", {
      traceId,
      asin,
      error: error instanceof Error ? error.message : String(error)
    });
    return { attributes: {}, status: 0, ok: false, rateLimited: false, errorText: String(error) };
  }
}

async function checkSkuStatus(params: {
  sku: string;
  asin?: string | null;
  marketplaceId: string;
  host: string;
  region: string;
  lwaToken: string;
  tempCreds: TempCreds;
  sellerId: string;
  traceId?: string;
}) {
  const { sku, asin, marketplaceId, host, region, lwaToken, tempCreds, sellerId, traceId } = params;
  const fallbackReason = "Nu am putut verifica statusul în Amazon";

  // Listings Items check
  let debug: Record<string, unknown> = {};
  try {
    const listingsPath = `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`;
    const listingsQuery = `marketplaceIds=${encodeURIComponent(marketplaceId)}`;
    const { res, json, text } = await spapiGet({
      host,
      region,
      path: listingsPath,
      query: listingsQuery,
      lwaToken,
      tempCreds,
      traceId,
      operationName: "listings.getItem",
      marketplaceId,
      sellerId
    });

    if (res.status === 404) {
      return { state: "missing", reason: "Listing inexistent pe marketplace-ul destinație" };
    }
    if (!res.ok) {
      const cat = await catalogCheck({
        asin,
        marketplaceId,
        host,
        region,
        lwaToken,
        tempCreds,
        traceId: traceId || crypto.randomUUID(),
        sellerId
      });
      if (cat.found) {
        return { state: "ok", reason: `Catalog găsit; Listings API ${res.status}` };
      }
      return { state: "unknown", reason: `Eroare Listings API (${res.status}): ${text}` };
    }

    // If API returned 200, treat as ok regardless of status field (some accounts return blank or legacy fields)
    const status = json?.payload?.status || json?.payload?.Status || "";

    // Catalog confirmă că ASIN/SKU există pe marketplace; altfel blocăm ca missing
    const cat = await catalogCheck({
      asin,
      marketplaceId,
      host,
      region,
      lwaToken,
      tempCreds,
      traceId: traceId || crypto.randomUUID(),
      sellerId
    });
    debug = {
      listingStatusCode: res.status,
      listingStatusField: status || null,
      catalogFound: cat.found,
      catalogReason: cat.reason,
      catalogRateLimited: cat.rateLimited
    };
    if (traceId) {
      console.log("sku-status", { traceId, sku, asin, marketplaceId, ...debug });
    }
    if (!cat.found) {
      if (cat.rateLimited) {
        return { state: "unknown", reason: `Catalog neluat în calcul (throttled): ${cat.reason}` };
      }
      return { state: "missing", reason: "Produsul nu există pe marketplace-ul destinație (Catalog Items)" };
    }

    if (!status) {
      return { state: "ok", reason: "Listing găsit; status lipsă/legacy (considerat eligibil)" };
    }
    if (String(status).toUpperCase() !== "ACTIVE") {
      return { state: "inactive", reason: `Listing găsit cu status ${status}` };
    }
  } catch (e) {
    const cat = await catalogCheck({
      asin,
      marketplaceId,
      host,
      region,
      lwaToken,
      tempCreds,
      traceId: traceId || crypto.randomUUID(),
      sellerId
    });
    if (traceId) {
      console.log("sku-status-error", {
        traceId,
        sku,
        asin,
        marketplaceId,
        error: e instanceof Error ? e.message : `${e}`,
        catalogFound: cat.found,
        catalogReason: cat.reason,
        catalogRateLimited: cat.rateLimited
      });
    }
    if (cat.found) {
      return { state: "ok", reason: `Catalog găsit; ${fallbackReason}` };
    }
    return { state: "unknown", reason: `${fallbackReason}: ${e instanceof Error ? e.message : e}` };
  }

  // Restrictions / eligibility check (best-effort)
  if (asin) {
    try {
      const restrictionsPath = "/listings/2021-08-01/restrictions";
      const restrictionsQuery = `marketplaceIds=${encodeURIComponent(marketplaceId)}&asin=${encodeURIComponent(asin)}`;
      const { res, json, text } = await spapiGet({
        host,
        region,
        path: restrictionsPath,
        query: restrictionsQuery,
        lwaToken,
        tempCreds,
        traceId,
        operationName: "listings.getRestrictions",
        marketplaceId,
        sellerId
      });
      if (res.ok) {
        const restrictions = json?.restrictions || json?.payload || [];
        const blocking = (Array.isArray(restrictions) ? restrictions : []).find(
          (r: any) => ["NOT_ELIGIBLE", "UNAVAILABLE", "RESTRICTED"].includes(String(r?.reasonCode || "").toUpperCase())
        );
        if (blocking) {
          const reason = blocking?.message || blocking?.ReasonMessage || "Produs restricționat pe acest marketplace";
          return { state: "restricted", reason };
        }
      } else if (res.status !== 404) {
        // 404 can happen if endpoint unsupported; treat as best-effort
        return { state: "unknown", reason: `Eroare Restrictions API (${res.status}): ${text}` };
      }
    } catch (e) {
      // best-effort; non-blocking
      return { state: "unknown", reason: `${fallbackReason}: ${e instanceof Error ? e.message : e}` };
    }
  }

  return { state: "ok", reason: "" };
}

async function fetchPrepGuidance(params: {
  items: PrepRequestItem[];
  shipFromCountry: string;
  shipToCountry: string;
  host: string;
  region: string;
  tempCreds: TempCreds;
  lwaToken: string;
  traceId: string;
  marketplaceId: string;
  sellerId: string;
}) {
  const { items, shipFromCountry, shipToCountry, host, region, tempCreds, lwaToken, traceId, marketplaceId, sellerId } = params;
  const skus = items.map((it) => it.sku).filter(Boolean) as string[];
  const asins = items.map((it) => it.asin).filter(Boolean) as string[];
  if (!skus.length && !asins.length) return {};

  const payload = JSON.stringify({
    ShipFromCountryCode: shipFromCountry,
    ShipToCountryCode: shipToCountry,
    SellerSKUList: skus,
    ASINList: asins
  });

  const prep = await signedFetch({
    method: "POST",
    service: "execute-api",
    region,
    host,
    path: "/fba/inbound/v0/prepInstructions",
    query: "",
    payload,
    accessKey: tempCreds.accessKeyId,
    secretKey: tempCreds.secretAccessKey,
    sessionToken: tempCreds.sessionToken,
    lwaToken,
    traceId,
    operationName: "inbound.v0.prepInstructions",
    marketplaceId,
    sellerId
  });

  if (!prep.res.ok) {
    console.warn("prepInstructions error (best-effort, ignored for plan)", {
      status: prep.res.status,
      body: prep.text?.slice(0, 500),
      traceId
    });
    return {};
  }

  const list =
    prep.json?.payload?.PrepInstructionsList ||
    prep.json?.PrepInstructionsList ||
    [];

  const map: Record<string, PrepGuidance> = {};
  for (const entry of Array.isArray(list) ? list : []) {
    const sku = entry.SellerSKU || entry.sellerSKU || null;
    const asin = entry.ASIN || entry.asin || null;
    const prepInstructions = Array.isArray(entry.PrepInstructionList || entry.prepInstructionList)
      ? (entry.PrepInstructionList || entry.prepInstructionList).map((p: string) => String(p))
      : [];
    const guidance = entry.PrepGuidance || entry.prepGuidance || null;
    const barcodeInstruction = entry.BarcodeInstruction || entry.barcodeInstruction || null;
    const prepRequired = prepInstructions.length > 0 && !prepInstructions.includes("NoPrep");

    const key = sku || asin;
    if (!key) continue;
    map[key] = {
      sku,
      asin,
      prepRequired,
      prepInstructions,
      guidance,
      barcodeInstruction
    };
  }
  return map;
}

// Fetch Listings Item attributes pentru a determina dacă SKU cere expirare (IEDP sau shelf-life)
async function fetchListingsExpiryRequired(params: {
  items: { sku: string; asin?: string | null }[];
  host: string;
  region: string;
  tempCreds: TempCreds;
  lwaToken: string;
  traceId: string;
  marketplaceId: string;
  sellerId: string;
}) {
  const { items, host, region, tempCreds, lwaToken, traceId, marketplaceId, sellerId } = params;
  const map: Record<string, boolean> = {};
  const uniqueBySku: Record<string, string | null> = {};
  for (const entry of items) {
    const sku = (entry.sku || "").trim();
    if (!sku) continue;
    if (!Object.prototype.hasOwnProperty.call(uniqueBySku, sku)) {
      uniqueBySku[sku] = entry.asin ?? null;
    }
  }

  for (const [sku, asin] of Object.entries(uniqueBySku)) {
    let expiryRequired = false;
    let listingAttrs: any = {};
    let listingIedp: boolean | null = null;
    let listingShelfLife = false;
    let listingSuccess = false;
    let listingStatusCode: number | null = null;
    try {
      const path = `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`;
      const query = `marketplaceIds=${encodeURIComponent(marketplaceId)}&includedData=attributes`;
      const { res, json } = await spapiGet({
        host,
        region,
        path,
        query,
        lwaToken,
        tempCreds,
        traceId,
        operationName: "listings.getItem",
        marketplaceId,
        sellerId
      });
      listingStatusCode = res.status;
      listingAttrs = json?.payload?.attributes || json?.attributes || {};
      if (res.ok) {
        listingSuccess = true;
        const flags = extractExpiryFlags(listingAttrs);
        listingIedp = flags.iedp;
        listingShelfLife = flags.hasShelfLife;
        expiryRequired = flags.iedp === true || flags.hasShelfLife;
      }
    } catch (error) {
      console.warn("listings expiry fetch failed", {
        traceId,
        sku,
        marketplaceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    let catalogResult: { attributes: any; status: number; ok: boolean } | null = null;
    const needsCatalog = !!asin && (!listingSuccess || (listingSuccess && listingIedp === null && !listingShelfLife));
    if (needsCatalog && asin) {
      catalogResult = await fetchCatalogItemAttributes({
        asin,
        host,
        region,
        tempCreds,
        lwaToken,
        traceId,
        marketplaceId,
        sellerId
      });
      const catalogFlags = extractExpiryFlags(catalogResult.attributes);
      if (catalogResult.ok) {
        expiryRequired = catalogFlags.iedp === true || catalogFlags.hasShelfLife;
      }
    }

    if (catalogResult) {
      console.log("expiry-debug", {
        traceId,
        sku,
        asin,
        source: "catalog",
        catalogStatus: catalogResult.status,
        catalogRateLimited: catalogResult.rateLimited,
        catalogAttributes: catalogResult.attributes
      });
    }

    if (listingSuccess && expiryRequired === false) {
      console.log("expiry-debug", {
        traceId,
        sku,
        listingStatusCode,
        iedp: listingIedp,
        hasShelfLife: listingShelfLife,
        rawIedp: listingAttrs?.is_expiration_dated_product ?? null,
        rawShelfLife: listingAttrs?.fc_shelf_life ?? null,
        rawExpType: listingAttrs?.product_expiration_type ?? null
      });
    }

    map[sku] = expiryRequired;
  }

  return map;
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
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    const authSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: authData, error: authErr } = await authSupabase.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) {
      console.warn("fba-plan auth failed", { traceId, error: authErr?.message || null });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("company_id, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("fba-plan profile lookup failed", { traceId, error: profileErr });
      return new Response(
        JSON.stringify({ error: "Unable to verify user profile", traceId }),
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    const userCompanyId = profileRow?.company_id || null;
    const userIsAdmin = Boolean(profileRow?.is_admin);
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
        "id, destination_country, company_id, user_id, prep_request_items(id, asin, sku, product_name, units_requested, units_sent, stock_item_id)"
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
    if (!userIsAdmin) {
      const isOwner = !!reqData.user_id && reqData.user_id === user.id;
      const isCompanyMember =
        !!reqData.company_id && !!userCompanyId && reqData.company_id === userCompanyId;
      if (!isOwner && !isCompanyMember) {
        return new Response(
          JSON.stringify({ error: "Forbidden", traceId }),
          { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    const destCountry = (reqData.destination_country || "").toUpperCase();
    const inferredMarketplace = marketplaceByCountry[destCountry] || null;

    // Fetch amazon integration for this user/company
    let integ: AmazonIntegration | null = null;
    let integStatus: string | null = null;
    if (inferredMarketplace) {
      const { data: integRows, error } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("status", "active")
        .eq("marketplace_id", inferredMarketplace)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (!error && Array.isArray(integRows) && integRows[0]) {
        integ = integRows[0] as any;
        integStatus = (integ as any).status || null;
      } else if (error) {
        console.warn("amazon_integrations query (by marketplace) failed", error);
      }
    }
    if (!integ) {
      const { data: integRows, error: integErr } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (integErr) throw integErr;
      integ = (integRows?.[0] as any) || null;
      integStatus = integ ? (integ as any).status || null : null;
    }
    // fallback: accept pending to show a clear message instead of hard error
    if (!integ) {
      const { data: pendingRows, error: pendingErr } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .in("status", ["pending"])
        .order("updated_at", { ascending: false })
        .limit(1);
      if (pendingErr) {
        console.warn("amazon_integrations pending query failed", pendingErr);
      } else if (pendingRows?.[0]) {
        integ = pendingRows[0] as any;
        integStatus = (integ as any).status || "pending";
      }
    }
    if (!integ?.refresh_token) {
      throw new Error("No active Amazon integration found for this company");
    }
    if (integStatus === "pending") {
      const warning = "Integrarea Amazon nu este completă (lipsește Selling Partner ID). Deconectează și reconectează pentru a finaliza autorizarea.";
      return new Response(JSON.stringify({ plan: null, warning, blocking: true, traceId }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const refreshToken = integ.refresh_token;
    const sellerId = await resolveSellerId(reqData.company_id, integ.selling_partner_id);
    if (!sellerId) {
      return new Response(JSON.stringify({ error: "Missing seller id. Set selling_partner_id in amazon_integrations or SPAPI_SELLER_ID env.", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    // Prefer marketplace inferred from destination country, otherwise fall back to integration default
    const marketplaceId = inferredMarketplace || integ.marketplace_id || "A13V1IB3VIYZZH";
    const regionCode = (integ.region || "eu").toLowerCase();
    const awsRegion = regionCode === "na" ? "us-east-1" : regionCode === "fe" ? "us-west-2" : "eu-west-1";
    const host = regionHost(regionCode);

    // Get temp creds via STS AssumeRole
    const tempCreds = await assumeRole(SPAPI_ROLE_ARN);

    const lwaAccessToken = await getLwaAccessToken(refreshToken);
    let lwaScopes: string[] = [];
    try {
      const parts = lwaAccessToken.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        const scopeStr = payload.scope || payload.scp || "";
        lwaScopes = String(scopeStr || "")
          .split(" ")
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
    } catch (_e) {
      // ignore decode errors
    }

    const items: PrepRequestItem[] = (Array.isArray(reqData.prep_request_items) ? reqData.prep_request_items : []).filter(
      (it) => Number(it.units_sent ?? it.units_requested ?? 0) > 0
    );
    const stockItemIds = Array.from(
      new Set(
        items
          .map((it) => it.stock_item_id)
          .filter((id): id is number => typeof id === "number" && Number.isFinite(id))
      )
    );
    let stockMap: Record<number, { image_url?: string | null; sku?: string | null; asin?: string | null; name?: string | null }> = {};
    if (stockItemIds.length) {
      const { data: stockRows, error: stockErr } = await supabase
        .from("stock_items")
        .select("id, image_url, sku, asin, name")
        .in("id", stockItemIds);
      if (!stockErr && Array.isArray(stockRows)) {
        stockMap = stockRows.reduce((acc, row) => {
          acc[row.id] = row;
          return acc;
        }, {} as Record<number, { image_url?: string | null; sku?: string | null; asin?: string | null; name?: string | null }>);
      }
    }
    if (!items.length) {
      throw new Error("No items in request with quantity > 0");
    }

    // Ship-from: fixed prep center address (real location in FR, nu schimbăm după destinație)
    const shipFromCountry = "FR";
    const shipFromAddress = {
      name: "Bucur Adrian",
      addressLine1: "5 Rue des Enclos",
      addressLine2: "Zone B, Cellule 7",
      city: "La Gouesniere",
      stateOrProvinceCode: "35", // FR department code for Ille-et-Vilaine
      postalCode: "35350",
      countryCode: shipFromCountry,
      phoneNumber: "+33675116218",
      email: "contact@prep-center.eu",
      companyName: "EcomPrep Hub"
    };

    const prepGuidanceMap = await fetchPrepGuidance({
      items,
      shipFromCountry,
      shipToCountry: destCountry || shipFromCountry,
      host,
      region: awsRegion,
      tempCreds,
      lwaToken: lwaAccessToken,
      traceId,
      marketplaceId,
      sellerId
    });
    const skuItems = items
      .map((it) => ({ sku: it.sku || "", asin: it.asin || null }))
      .filter((entry) => entry.sku);
    const expiryRequiredBySku = await fetchListingsExpiryRequired({
      items: skuItems,
      host,
      region: awsRegion,
      tempCreds,
      lwaToken: lwaAccessToken,
      traceId,
      marketplaceId,
      sellerId
    });
    // Debug info for auth context (mascat)
    console.log("fba-plan auth-context", {
      traceId,
      sellerId,
      marketplaceId,
      region: awsRegion,
      host,
      lwaClientId: maskSecret(LWA_CLIENT_ID || ""),
      refreshToken: maskSecret(refreshToken || "", 3),
      roleArn: SPAPI_ROLE_ARN ? `...${SPAPI_ROLE_ARN.slice(-6)}` : "",
      accessKey: AWS_ACCESS_KEY_ID ? `...${AWS_ACCESS_KEY_ID.slice(-4)}` : "",
      scopes: lwaScopes.length ? lwaScopes : "opaque_token_not_decoded"
    });

    // Pre-eligibility check per SKU for destination marketplace
    const skuStatuses: { sku: string; asin: string | null; state: string; reason: string }[] = [];
    for (const it of items) {
      const sku = it.sku || "";
      if (!sku) {
        skuStatuses.push({ sku: "", asin: it.asin || null, state: "unknown", reason: "SKU lipsă în prep request" });
        continue;
      }
      const status = await checkSkuStatus({
        sku,
        asin: it.asin,
        marketplaceId,
        host,
        region: awsRegion,
        lwaToken: lwaAccessToken,
        tempCreds,
        sellerId,
        traceId
      });
      skuStatuses.push({ sku, asin: it.asin || null, state: status.state, reason: status.reason });
    }

    const blocking = skuStatuses.filter((s) => ["missing", "inactive", "restricted"].includes(String(s.state)));
    if (blocking.length) {
      const warning = `Unele produse nu sunt eligibile pe marketplace-ul destinație (${marketplaceId}).`;
      const skus = items.map((it, idx) => {
        const prepInfo = prepGuidanceMap[it.sku || it.asin || ""] || {};
        const requiresExpiryFromGuidance = (prepInfo.prepInstructions || []).some((p: string) =>
          String(p || "").toLowerCase().includes("expir")
        );
        const requiresExpiry = requiresExpiryFromGuidance || expiryRequiredBySku[it.sku || ""] === true;
        return {
          id: it.id || `sku-${idx + 1}`,
          title: it.product_name || it.sku || `SKU ${idx + 1}`,
          sku: it.sku || "",
          asin: it.asin || "",
          storageType: "Standard-size",
          packing: "individual",
          units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
          expiry: "",
          expiryRequired: requiresExpiry,
          prepRequired: prepInfo?.prepRequired || false,
          prepNotes: (prepInfo?.prepInstructions || []).join(", "),
          manufacturerBarcodeEligible:
            (prepInfo?.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode",
          readyToPack: true
        };
      });
      const plan = {
        source: "amazon",
        marketplace: marketplaceId,
        shipFrom: {
          name: shipFromAddress.name,
          address: `${shipFromAddress.addressLine1}, ${shipFromAddress.postalCode}, ${shipFromAddress.countryCode}`
        },
        skus,
        packGroups: [],
        shipments: [],
        raw: null,
        skuStatuses,
        warning,
        blocking: true
      };
      return new Response(JSON.stringify({ plan, traceId, scopes: lwaScopes }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const buildPlanBody = (overrides: Record<string, "NONE" | "SELLER"> = {}) => {
      return {
        // Amazon requires `sourceAddress` for createInboundPlan payload
        sourceAddress: shipFromAddress,
        destinationMarketplaces: [marketplaceId],
        labelPrepPreference: "SELLER_LABEL",
        shipmentType: "SP",
        requireDeliveryWindows: false,
        items: items.map((it) => {
          const key = it.sku || it.asin || "";
          const prepInfo = prepGuidanceMap[key] || {};
          const prepRequired = !!prepInfo.prepRequired;
          const manufacturerBarcodeEligible =
            prepInfo.barcodeInstruction
              ? (prepInfo.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode"
              : false; // fără guidance forțăm eticheta seller ca fallback
          let labelOwner = prepRequired ? "SELLER" : manufacturerBarcodeEligible ? "NONE" : "SELLER";
          if (overrides[it.sku || ""]) {
            labelOwner = overrides[it.sku || ""]!;
          }
          return {
            msku: it.sku || "",
            quantity: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
            prepOwner: prepRequired ? "SELLER" : "NONE",
            labelOwner
          };
        })
      };
    };

    let planBody = buildPlanBody();
    let appliedPlanBody = planBody;
    let planWarning: string | null = null;
    let appliedOverrides: Record<string, "SELLER" | "NONE"> = {};

    const payload = JSON.stringify(planBody);
    // SP-API expects the resource under /inbound/fba (not /fba/inbound)
    const path = "/inbound/fba/2024-03-20/inboundPlans";
    const query = "";

    const formatAddress = (addr?: Record<string, string | undefined | null>) => {
      if (!addr) return "—";
      const parts = [addr.addressLine1, addr.addressLine2, addr.city, addr.stateOrProvinceCode, addr.postalCode, addr.countryCode]
        .map((part) => (part || "").trim())
        .filter((part) => part.length);
      return parts.join(", ") || "—";
    };

    const primary = await signedFetch({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path,
      query,
      payload,
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken: lwaAccessToken,
      traceId,
      operationName: "inbound.v20240320.createInboundPlan",
      marketplaceId,
      sellerId
    });

    // Keep raw Amazon response for debugging / UI
    let amazonJson = primary.json;
    const primaryRequestId = primary.requestId || null;

    let plans =
      primary.json?.payload?.inboundPlan?.inboundShipmentPlans ||
      primary.json?.payload?.InboundShipmentPlans ||
      primary.json?.InboundShipmentPlans ||
      [];

    if (!primary.res.ok) {
      // Încearcă o singură retrimitere dacă mesajele indică labelOwner greșit (SELLER vs NONE)
      const errors = primary.json?.errors || primary.json?.payload?.errors || [];
      const overrides: Record<string, "SELLER" | "NONE"> = {};
      for (const err of Array.isArray(errors) ? errors : []) {
        const msg = err?.message || "";
        const mskuMatch = msg.match(/ERROR:\s*([^ \n]+)\s/);
        const msku = mskuMatch ? mskuMatch[1] : null;
        if (!msku) continue;
        if (msg.includes("does not require labelOwner") && msg.includes("SELLER was assigned")) {
          overrides[msku] = "NONE";
        } else if (msg.includes("requires labelOwner") && msg.includes("NONE was assigned")) {
          overrides[msku] = "SELLER";
        }
      }

      if (Object.keys(overrides).length) {
        const retryBody = buildPlanBody(overrides);
        const retryPayload = JSON.stringify(retryBody);
        const retryRes = await signedFetch({
          method: "POST",
          service: "execute-api",
          region: awsRegion,
          host,
          path,
          query,
          payload: retryPayload,
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "inbound.v20240320.createInboundPlan.retry",
          marketplaceId,
          sellerId
        });

        if (retryRes.res.ok) {
          plans =
            retryRes.json?.payload?.inboundPlan?.inboundShipmentPlans ||
            retryRes.json?.payload?.InboundShipmentPlans ||
            retryRes.json?.InboundShipmentPlans ||
            [];
          amazonJson = retryRes.json;
          appliedPlanBody = retryBody;
          appliedOverrides = overrides;
          const flipped = Object.entries(overrides)
            .map(([msku, owner]) => `${msku}→${owner}`)
            .join(", ");
          planWarning = `Amazon a cerut ajustarea labelOwner pentru: ${flipped}.`;
        } else {
          console.error("createInboundPlan retry error", {
            traceId,
            status: retryRes.res.status,
            marketplaceId,
            region: awsRegion,
            sellerId,
            requestId: retryRes.requestId || null,
            body: retryRes.text?.slice(0, 2000)
          });
          // dacă retry a eșuat, continuăm cu fallback
        }
      }

      if (!plans || !plans.length) {
        console.error("createInboundPlan primary error", {
          traceId,
          status: primary.res.status,
          marketplaceId,
          region: awsRegion,
          sellerId,
          requestId: primaryRequestId,
          body: primary.text?.slice(0, 2000)
        });
        console.error("fba-plan createInboundPlan error", {
          traceId,
          status: primary.res.status,
          host,
          marketplaceId,
          region: awsRegion,
          sellerId,
          requestId: primaryRequestId,
          body: primary.text?.slice(0, 2000) // avoid huge logs
        });
        const fallbackSkus = items.map((it, idx) => {
          const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
          const prepInfo = prepGuidanceMap[it.sku || it.asin || ""] || {};
          const requiresExpiry =
            (prepInfo.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
            expiryRequiredBySku[it.sku || ""] === true;
          return {
            id: it.id || `sku-${idx + 1}`,
            title: it.product_name || stock?.name || it.sku || stock?.sku || `SKU ${idx + 1}`,
            sku: it.sku || stock?.sku || "",
            asin: it.asin || stock?.asin || "",
            storageType: "Standard-size",
            packing: "individual",
            units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
            expiry: "",
            expiryRequired: requiresExpiry,
            prepRequired: prepInfo.prepRequired || false,
            prepNotes: (prepInfo.prepInstructions || []).join(", "),
            manufacturerBarcodeEligible:
              (prepInfo.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode",
            readyToPack: true,
            image: stock?.image_url || null
          };
        });
        const fallbackPlan = {
          source: "amazon",
          marketplace: marketplaceId,
          shipFrom: {
            name: shipFromAddress.name,
            address: formatAddress(shipFromAddress)
          },
          skus: fallbackSkus,
          packGroups: [],
          shipments: [],
          raw: null,
          skuStatuses,
          warning: `Amazon a refuzat crearea planului (HTTP ${primary.res.status}). Încearcă din nou sau verifică permisiunile Inbound pe marketplace.`,
          blocking: true,
          requestId: primaryRequestId || null
        };
        return new Response(JSON.stringify({ plan: fallbackPlan, traceId, status: primary.res.status, requestId: primaryRequestId || null, scopes: lwaScopes }), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    const normalizeItems = (p: any) => p?.items || p?.Items || [];

    // Map FNSKU returned by Amazon to seller SKU so UI can render the exact label code
    const fnskuBySku: Record<string, string> = {};
    plans.forEach((p: any) => {
      const itemsList = normalizeItems(p);
      itemsList.forEach((it: any) => {
        const sellerSku = it.msku || it.SellerSKU || it.sellerSku || "";
        const fnsku = it.fulfillmentNetworkSku || it.FulfillmentNetworkSKU || it.fnsku || "";
        if (sellerSku && fnsku) {
          fnskuBySku[sellerSku] = fnsku;
        }
      });
    });

    // Grupăm planurile după destinație (FC sau adresă) ca să reflectăm gruparea Amazon per adresă
    const packGroupsMap = new Map<
      string,
      {
        id: string;
        destLabel: string;
        skuCount: number;
        units: number;
        boxes: number;
        packMode: "single" | "multiple";
        warning: string | null;
        image: string | null;
        skus: { id: string; qty: number; fnsku: string | null }[];
      }
    >();

    plans.forEach((p: any, idx: number) => {
      const itemsList = normalizeItems(p);
      const totalUnits = itemsList.reduce((s: number, it: any) => s + (Number(it.quantity || it.Quantity) || 0), 0);
      const warning = Array.isArray(p.warnings || p.Warnings) && (p.warnings || p.Warnings)[0]?.message
        ? (p.warnings || p.Warnings)[0]?.message
        : null;
      const estimatedBoxes = Number(p.estimatedBoxCount || p.EstimatedBoxCount || 1) || 1;
      const destinationFc = p.destinationFulfillmentCenterId || p.DestinationFulfillmentCenterId || "";
      const destAddress = p.destinationAddress || p.DestinationAddress || null;
      const destAddressLabel = destAddress ? formatAddress(destAddress) : "";
      const destLabel = destinationFc || destAddressLabel || "Unknown destination";
      const destKey = destinationFc || destAddressLabel || `plan-${idx + 1}`;

      const existing = packGroupsMap.get(destKey);
      const skus = itemsList.map((it: any, j: number) => ({
        id: it.msku || it.SellerSKU || `sku-${j + 1}`,
        qty: Number(it.quantity || it.Quantity) || 0,
        fnsku: it.fulfillmentNetworkSku || it.FulfillmentNetworkSKU || null
      }));

      if (existing) {
        existing.skuCount += itemsList.length;
        existing.units += totalUnits;
        existing.boxes += estimatedBoxes;
        existing.skus = existing.skus.concat(skus);
        // păstrăm warning-ul mai sever dacă apare (nu suprascriem cu null)
        existing.warning = existing.warning || warning;
        packGroupsMap.set(destKey, existing);
      } else {
        packGroupsMap.set(destKey, {
          id: p.ShipmentId || `plan-${idx + 1}`,
          destLabel,
          skuCount: itemsList.length,
          units: totalUnits,
          boxes: estimatedBoxes,
          packMode: estimatedBoxes > 1 ? "multiple" : "single",
          warning,
          image: null,
          skus
        });
      }
    });

    const packGroups = Array.from(packGroupsMap.values()).map((g, idx) => ({
      ...g,
      title: g.destLabel ? `Pack group ${idx + 1} · ${g.destLabel}` : `Pack group ${idx + 1}`
    }));

    const shipments = plans.map((p: any, idx: number) => {
      const itemsList = normalizeItems(p);
      const totalUnits = itemsList.reduce((s: number, it: any) => s + (Number(it.quantity || it.Quantity) || 0), 0);
      const destAddress = p.destinationAddress || p.DestinationAddress;
      const destinationFc = p.destinationFulfillmentCenterId || p.DestinationFulfillmentCenterId || null;
      const boxes = Number(p.estimatedBoxCount || p.EstimatedBoxCount || itemsList.length || 1) || 1;
      return {
        id: p.ShipmentId || `shipment-${idx + 1}`,
        name: `Shipment ${p.ShipmentId || idx + 1}`,
        from: formatAddress(shipFromAddress),
        to: destAddress ? formatAddress(destAddress) : destinationFc || "—",
        boxes,
        skuCount: itemsList.length,
        units: totalUnits,
        raw: {
          destinationFc,
          destinationAddress: destAddress,
          shipment: p
        }
      };
    });

    const labelOwnerBySku: Record<string, "SELLER" | "NONE"> = {};
    const labelOwnerSourceBySku: Record<string, "prep-guidance" | "amazon-override" | "assumed"> = {};
    (appliedPlanBody?.items || []).forEach((it: any) => {
      if (it?.msku) {
        labelOwnerBySku[it.msku] = (it.labelOwner as "SELLER" | "NONE") || "SELLER";
        if (appliedOverrides[it.msku]) {
          labelOwnerSourceBySku[it.msku] = "amazon-override";
        } else {
          labelOwnerSourceBySku[it.msku] = "prep-guidance";
        }
      }
    });
    // Dacă retry a aplicat inversări, completăm map-ul cu override-urile folosite
    if (plans?.length && appliedPlanBody?.items) {
      appliedPlanBody.items.forEach((it: any) => {
        if (it?.msku && it.labelOwner && !labelOwnerBySku[it.msku]) {
          labelOwnerBySku[it.msku] = it.labelOwner as "SELLER" | "NONE";
          labelOwnerSourceBySku[it.msku] = appliedOverrides[it.msku] ? "amazon-override" : "prep-guidance";
        }
      });
    }

    const skus = items.map((it, idx) => {
      const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
      const prepInfo = prepGuidanceMap[it.sku || it.asin || ""] || {};
      const prepRequired = !!prepInfo.prepRequired;
      const manufacturerBarcodeEligible = prepInfo.barcodeInstruction
        ? (prepInfo.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode"
        : false;
      const labelOwner =
        labelOwnerBySku[it.sku || ""] ||
        (prepRequired ? "SELLER" : manufacturerBarcodeEligible ? "NONE" : "SELLER");
      const labelOwnerSource =
        labelOwnerSourceBySku[it.sku || ""] ||
        (prepInfo.barcodeInstruction ? "prep-guidance" : "assumed");
      const requiresExpiry =
        (prepInfo.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
        expiryRequiredBySku[it.sku || ""] === true;
      return {
        id: it.id || `sku-${idx + 1}`,
        title: it.product_name || stock?.name || it.sku || stock?.sku || `SKU ${idx + 1}`,
        sku: it.sku || stock?.sku || "",
        asin: it.asin || stock?.asin || "",
        storageType: "Standard-size",
        fnsku: fnskuBySku[it.sku || ""] || null,
        packing: "individual",
        units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
        expiry: "",
        expiryRequired: requiresExpiry,
        prepRequired,
        prepNotes: (prepInfo.prepInstructions || []).join(", "),
        manufacturerBarcodeEligible,
        labelOwner,
        labelOwnerSource,
        readyToPack: true,
        image: stock?.image_url || null
      };
    });

    const plan = {
      source: "amazon",
      marketplace: marketplaceId,
      companyId: reqData.company_id || null,
      shipFrom: {
        name: shipFromAddress.name,
        address: formatAddress(shipFromAddress)
      },
      skus,
      packGroups,
      shipments,
      raw: amazonJson,
      skuStatuses,
      warning: planWarning
    };

    return new Response(JSON.stringify({ plan, traceId, requestId: primaryRequestId || null, scopes: lwaScopes }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  } catch (e) {
    console.error("fba-plan error", { traceId, error: e });
    return new Response(JSON.stringify({ error: e?.message || "Server error", detail: `${e}`, traceId }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
