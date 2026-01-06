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
  expiration_date?: string | null;
  expiration_source?: string | null;
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

type OwnerVal = "NONE" | "SELLER" | "AMAZON";
type InboundField = "labelOwner" | "prepOwner";
type InboundFix = Partial<Record<InboundField, OwnerVal>>;

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

function normalizeSku(val: string | null | undefined): string {
  return (val || "").trim();
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

function isManufacturerBarcodeEligible(instr?: string | null) {
  if (!instr) return false;
  const val = instr.toLowerCase();
  return (
    val === "manufacturerbarcode" ||
    val === "canuseoriginalbarcode" ||
    val === "can_use_original_barcode" ||
    val === "can-use-original-barcode" ||
    val === "canuseoriginal"
  );
}

function extractAcceptedValues(msg: string): OwnerVal[] {
  const m = msg.match(/Accepted values:\s*\[([^\]]+)\]/i);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((v) => v === "NONE" || v === "SELLER" || v === "AMAZON") as OwnerVal[];
}

function extractMsku(msg: string): string | null {
  const m = msg.match(/ERROR:\s*([^\s]+)\s+/i);
  return m ? String(m[1] || "").trim() : null;
}

function extractInboundErrors(primary: { json: any; text: string }): {
  msku: string;
  field: InboundField;
  msg: string;
  accepted: OwnerVal[];
}[] {
  const out: { msku: string; field: InboundField; msg: string; accepted: OwnerVal[] }[] = [];

  const tryFrom = (obj: any) => {
    const errs = obj?.errors || obj?.payload?.errors || [];
    if (!Array.isArray(errs)) return;
    for (const e of errs) {
      const msg = String(e?.message || "");
      const msku = extractMsku(msg);
      if (!msku) continue;
      if (msg.includes("labelOwner")) {
        out.push({ msku, field: "labelOwner", msg, accepted: extractAcceptedValues(msg) });
      }
      if (msg.includes("prepOwner")) {
        out.push({ msku, field: "prepOwner", msg, accepted: extractAcceptedValues(msg) });
      }
    }
  };

  if (primary.json) tryFrom(primary.json);

  if (!out.length && primary.text) {
    try {
      const parsed = JSON.parse(primary.text);
      tryFrom(parsed);
    } catch {
      // ignore
    }
  }

  return out;
}

function chooseFixValue(field: InboundField, msg: string, accepted: OwnerVal[]): OwnerVal | null {
  const up = msg.toUpperCase();
  if (up.includes("DOES NOT REQUIRE") && accepted.includes("NONE")) return "NONE";
  if (up.includes("REQUIRES") && up.includes("NONE WAS ASSIGNED")) {
    if (accepted.includes("SELLER")) return "SELLER";
    if (accepted.includes("AMAZON")) return "AMAZON";
  }
  if (accepted.includes("SELLER")) return "SELLER";
  if (accepted.includes("NONE")) return "NONE";
  if (accepted.includes("AMAZON")) return "AMAZON";
  return null;
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
    const asinOk = String(payload?.asin || payload?.ASIN || "") === asin;
    const hasItems = Array.isArray(payload?.items) && payload.items.length > 0;
    const hasAttrs = payload?.attributes && typeof payload.attributes === "object" && Object.keys(payload.attributes).length > 0;
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
    if (asinOk || hasItems || hasAttrs || hasMarketplace) {
      return { found: true, reason: "Găsit în Catalog Items", rateLimited };
    }
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
    const listingsQuery = `marketplaceIds=${encodeURIComponent(marketplaceId)}&includedData=attributes,summaries`;
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

    // Listings Items 200 => listing există pe marketplace; nu mai blocăm pe Catalog.
    const summaries = json?.payload?.summaries || json?.summaries || [];
    const toStatusList = (val: any): string[] => {
      if (Array.isArray(val)) return val.map((v) => String(v || "").trim()).filter(Boolean);
      if (typeof val === "string") return val.split(",").map((v) => v.trim()).filter(Boolean);
      if (val != null) return [String(val).trim()].filter(Boolean);
      return [];
    };

    let status = "";
    if (Array.isArray(summaries)) {
      const s = summaries.find((x: any) => String(x?.marketplaceId || x?.marketplace_id || "") === String(marketplaceId));
      status = String(s?.status || s?.Status || "");
    }

    const statusList = toStatusList(status).map((v) => v.toUpperCase());
    const hasBuyable = statusList.includes("BUYABLE") || statusList.includes("ACTIVE");
    const hasDiscoverable = statusList.includes("DISCOVERABLE");

    if (!statusList.length) {
      return { state: "ok", reason: "Listing găsit (Listings API 200). Status lipsă/omitted." };
    }
    if (hasBuyable) {
      return { state: "ok", reason: `Listing găsit cu status ${statusList.join(",")}` };
    }
    if (hasDiscoverable) {
      return { state: "ok", reason: `Listing găsit cu status ${statusList.join(",")} (considerat eligibil)` };
    }
    return { state: "inactive", reason: `Listing găsit cu status ${statusList.join(",")}` };
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
}): Promise<{ map: Record<string, PrepGuidance>; warning: string | null }> {
  const { items, shipFromCountry, shipToCountry, host, region, tempCreds, lwaToken, traceId, marketplaceId, sellerId } = params;
  const skus = items.map((it) => it.sku).filter(Boolean) as string[];
  const asins = items.map((it) => it.asin).filter(Boolean) as string[];
  if (!skus.length && !asins.length) return { map: {}, warning: null };

  const searchParams = new URLSearchParams();
  searchParams.set("ShipToCountryCode", shipToCountry || shipFromCountry);
  for (const sku of skus) searchParams.append("SellerSKUList", sku);
  for (const asin of asins) searchParams.append("ASINList", asin);

  const prep = await signedFetch({
    method: "GET",
    service: "execute-api",
    region,
    host,
    path: "/fba/inbound/v0/prepInstructions",
    query: searchParams.toString(),
    payload: "",
    accessKey: tempCreds.accessKeyId,
    secretKey: tempCreds.secretAccessKey,
    sessionToken: tempCreds.sessionToken,
    lwaToken,
    traceId,
    operationName: "inbound.v0.getPrepInstructions",
    marketplaceId,
    sellerId
  });

  if (!prep.res.ok) {
    console.warn("prepInstructions error (best-effort, ignored for plan)", {
      status: prep.res.status,
      body: prep.text?.slice(0, 500),
      traceId
    });
    const shortBody = (prep.text || "").slice(0, 120);
    const warning =
      prep.res.status === 403
        ? "Amazon a refuzat prepInstructions (403) – continuăm fără ghidaj de prep."
        : `Amazon a refuzat prepInstructions (${prep.res.status}${shortBody ? `: ${shortBody}` : ""}) – continuăm fără ghidaj de prep.`;
    return { map: {}, warning };
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

    const key = normalizeSku(sku || asin);
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
  return { map, warning: null };
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
    const expirationsInput = (body?.expirations as Record<string, string | undefined | null>) || {};
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
        "id, destination_country, company_id, user_id, inbound_plan_id, placement_option_id, fba_shipment_id, prep_request_items(id, asin, sku, product_name, units_requested, units_sent, stock_item_id, expiration_date, expiration_source)"
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
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
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
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
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
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
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
    const amazonIntegrationId = (integ as any)?.id || null;
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

    const scopesLower = lwaScopes.map((s) => s.toLowerCase());
    const scopesDecoded = scopesLower.length > 0;
    const hasInboundScope = scopesLower.includes("sellingpartnerapi::fba_inbound");
    // Dacă nu am putut decoda scopes (token opac), încercăm oricum prep guidance și lăsăm Amazon să răspundă.
    const shouldAttemptPrepGuidance = hasInboundScope || !scopesDecoded;
    let prepGuidanceWarning: string | null = null;
    let prepGuidanceMap: Record<string, PrepGuidance> = {};
    if (shouldAttemptPrepGuidance) {
      const prepGuidanceResult = await fetchPrepGuidance({
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
      prepGuidanceMap = prepGuidanceResult.map;
      prepGuidanceWarning = prepGuidanceResult.warning;
    } else {
      prepGuidanceWarning = "Token LWA fără scope fba_inbound; instrucțiunile de pregătire au fost omise.";
    }
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
    const normalizeExpiryInput = (v: string | undefined | null) => {
      if (!v) return null;
      const trimmed = String(v).trim();
      if (!trimmed) return null;
      // Accept YYYY-MM-DD; fallback: Date parse
      const iso = trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split("T")[0];
    };
    const expirations: Record<string, string> = {};
    const expirySourceBySku: Record<string, "manual" | "auto_16m" | "existing"> = {};
    const dbExpiryByItemId: Record<string, { date: string | null; source: string | null }> = {};

    // Pre-fill with existing DB values (persisted previously)
    items.forEach((it) => {
      const key = normalizeSku(it.sku || it.asin || "");
      const dbVal = normalizeExpiryInput(it.expiration_date);
      dbExpiryByItemId[it.id] = { date: dbVal, source: it.expiration_source || null };
      if (key && dbVal && !expirations[key]) {
        expirations[key] = dbVal;
        expirySourceBySku[key] = (it.expiration_source as any) || "existing";
      }
    });

    // Manual input from request payload overrides DB
    Object.entries(expirationsInput).forEach(([k, v]) => {
      const val = normalizeExpiryInput(v);
      const normKey = normalizeSku(k);
      if (val && normKey) {
        expirations[normKey] = val;
        expirySourceBySku[normKey] = "manual";
      }
    });

    const addMonths = (d: Date, months: number) => {
      const dt = new Date(d.getTime());
      dt.setMonth(dt.getMonth() + months);
      return dt;
    };
    // Autofill expiry with +16 months from today when required and missing (before attempting plan)
    const today = new Date();
    items.forEach((it) => {
      const key = normalizeSku(it.sku || it.asin || "");
      const requiresExpiry =
        (prepGuidanceMap[key]?.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
        expiryRequiredBySku[normalizeSku(it.sku || "")] === true;
      if (requiresExpiry && !expirations[key]) {
        const auto = addMonths(today, 16).toISOString().split("T")[0];
        expirations[key] = auto;
        expirySourceBySku[key] = "auto_16m";
      }
    });

    // Persist expirations that were auto/manual filled but missing in DB
    const expiryUpdates: { id: string; expiration_date: string; expiration_source: string | null }[] = [];
    items.forEach((it) => {
      const key = normalizeSku(it.sku || it.asin || "");
      const newDate = key ? expirations[key] || null : null;
      const newSource = key ? expirySourceBySku[key] || (newDate ? "existing" : null) : null;
      const dbEntry = dbExpiryByItemId[it.id] || { date: null, source: null };
      if (newDate && (newDate !== dbEntry.date || newSource !== dbEntry.source)) {
        expiryUpdates.push({
          id: it.id,
          expiration_date: newDate,
          expiration_source: newSource
        });
      }
    });

    if (expiryUpdates.length) {
      // Use update to avoid accidental inserts that would violate non-null prep_request_id
      const { error: expirySaveErr } = await supabase
        .from("prep_request_items")
        .update(
          expiryUpdates.map((row) => ({
            id: row.id,
            expiration_date: row.expiration_date,
            expiration_source: row.expiration_source
          }))
        )
        .in(
          "id",
          expiryUpdates.map((row) => row.id)
        );
      if (expirySaveErr) {
        console.warn("fba-plan expiration save failed", { traceId, error: expirySaveErr, updates: expiryUpdates.length });
      }
    }

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
      const warningParts: string[] = [`Unele produse nu sunt eligibile pe marketplace-ul destinație (${marketplaceId}).`];
      if (prepGuidanceWarning) warningParts.push(prepGuidanceWarning);
      const warning = warningParts.filter(Boolean).join(" ");
      const skus = items.map((it, idx) => {
        const key = normalizeSku(it.sku || it.asin || "");
        const prepInfo = prepGuidanceMap[key] || {};
        const requiresExpiryFromGuidance = (prepInfo.prepInstructions || []).some((p: string) =>
          String(p || "").toLowerCase().includes("expir")
        );
        const expiryKey = normalizeSku(it.sku || "");
        const requiresExpiry = requiresExpiryFromGuidance || expiryRequiredBySku[expiryKey] === true;
        const expiryVal = expirations[expiryKey] || "";
        return {
          id: it.id || `sku-${idx + 1}`,
          title: it.product_name || it.sku || `SKU ${idx + 1}`,
          sku: it.sku || "",
          asin: it.asin || "",
          storageType: "Standard-size",
          packing: "individual",
          units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
          expiry: expiryVal,
          expirySource: expirySourceBySku[expiryKey] || null,
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
        amazonIntegrationId,
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

    const buildPlanBody = (overrides: Record<string, InboundFix> = {}) => {
      return {
        // Amazon requires `sourceAddress` for createInboundPlan payload
        sourceAddress: shipFromAddress,
        destinationMarketplaces: [marketplaceId],
        labelPrepPreference: "SELLER_LABEL",
        shipmentType: "SP",
        requireDeliveryWindows: false,
        items: items.map((it) => {
          const key = normalizeSku(it.sku || it.asin || "");
          const prepInfo = prepGuidanceMap[key] || {};
          const prepRequired = !!prepInfo.prepRequired;
          const manufacturerBarcodeEligible =
            prepInfo.barcodeInstruction ? isManufacturerBarcodeEligible(prepInfo.barcodeInstruction) : false;
          // Default: SELLER; dacă e barcode producător, NONE; restul se corectează din overrides după erori
          let labelOwner: OwnerVal = manufacturerBarcodeEligible ? "NONE" : "SELLER";
          let prepOwner: OwnerVal = prepRequired ? "SELLER" : "NONE";
          const expiryVal = expirations[key] || null;

          const o = overrides[key];
          if (o?.labelOwner) labelOwner = o.labelOwner;
          if (o?.prepOwner) prepOwner = o.prepOwner;
          return {
            msku: it.sku || "",
            quantity: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
            expiration: expiryVal || undefined,
            prepOwner,
            labelOwner
          };
        })
      };
    };

    let appliedPlanBody: any = null;
    const planWarnings: string[] = [];
    let planWarning: string | null = null;
    let appliedOverrides: Record<string, InboundFix> = {};

    // SP-API expects the resource under /inbound/fba (not /fba/inbound)
    const path = "/inbound/fba/2024-03-20/inboundPlans";
    const query = "";

    const extractInboundPlanData = (json: any) => {
      const inboundPlan =
        json?.payload?.inboundPlan ||
        json?.payload?.InboundPlan ||
        json?.inboundPlan ||
        json?.InboundPlan ||
        null;
      const shipments = Array.isArray(inboundPlan?.shipments || inboundPlan?.Shipments)
        ? inboundPlan?.shipments || inboundPlan?.Shipments || []
        : [];
      const inboundShipmentPlans = Array.isArray(inboundPlan?.inboundShipmentPlans || inboundPlan?.InboundShipmentPlans)
        ? inboundPlan?.inboundShipmentPlans || inboundPlan?.InboundShipmentPlans || []
        : [];
      const packingOptions = Array.isArray(inboundPlan?.packingOptions || inboundPlan?.PackingOptions)
        ? inboundPlan?.packingOptions || inboundPlan?.PackingOptions || []
        : [];
      const placementOptions = Array.isArray(inboundPlan?.placementOptions || inboundPlan?.PlacementOptions)
        ? inboundPlan?.placementOptions || inboundPlan?.PlacementOptions || []
        : [];
      const inboundPlanId =
        inboundPlan?.inboundPlanId ||
        inboundPlan?.InboundPlanId ||
        json?.payload?.inboundPlanId ||
        json?.payload?.InboundPlanId ||
        json?.inboundPlanId ||
        json?.InboundPlanId ||
        null;
      const inboundStatus =
        inboundPlan?.status ||
        inboundPlan?.Status ||
        json?.payload?.status ||
        json?.status ||
        null;
      return { inboundPlan, inboundPlanId, shipments, inboundShipmentPlans, packingOptions, placementOptions, inboundStatus };
    };

    const extractOperationId = (json: any) =>
      json?.payload?.operationId || json?.payload?.OperationId || json?.operationId || json?.OperationId || null;

    const fetchInboundPlanById = async (inboundPlanId: string) => {
      const maxAttempts = 8;
      let attempt = 0;
      let fetchedJson: any = null;
      let fetchedPlans: any[] = [];
      let fetchedStatus: string | null = null;
      let fetchedPackingOptions: any[] = [];
      let fetchedPlacementOptions: any[] = [];
      while (attempt < maxAttempts && !fetchedPlans.length) {
        attempt += 1;
        const res = await signedFetch({
          method: "GET",
          service: "execute-api",
          region: awsRegion,
          host,
          path: `${path}/${encodeURIComponent(inboundPlanId)}`,
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
        fetchedJson = res.json;
        const data = extractInboundPlanData(res.json);
        fetchedStatus = data.inboundStatus;
        fetchedPlans = data.shipments.length ? data.shipments : data.inboundShipmentPlans;
        fetchedPackingOptions = data.packingOptions;
        fetchedPlacementOptions = data.placementOptions;
        if (fetchedPlans.length || !res.res.ok) break;
        await delay(500 * attempt);
      }
      return { fetchedJson, fetchedPlans, fetchedStatus, fetchedPackingOptions, fetchedPlacementOptions };
    };

    const fetchOperationStatus = async (operationId: string) => {
      const res = await signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `/inbound/fba/2024-03-20/operations/${encodeURIComponent(operationId)}`,
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
        res.json?.payload?.state ||
        res.json?.payload?.operationStatus ||
        res.json?.state ||
        res.json?.operationStatus ||
        res.json?.status ||
        null;
      const problemsSource =
        res.json?.payload?.problems ||
        res.json?.payload?.operationProblems ||
        res.json?.problems ||
        res.json?.operationProblems ||
        [];
      const problems = Array.isArray(problemsSource) ? problemsSource : [];
      return { state, problems, raw: res.json, httpStatus: res.res.status };
    };

    const pollOperationStatus = async (operationId: string) => {
      const maxAttempts = 8;
      let attempt = 0;
      let last: Awaited<ReturnType<typeof fetchOperationStatus>> | null = null;
      while (attempt < maxAttempts) {
        attempt += 1;
        last = await fetchOperationStatus(operationId);
        const stateUpper = (last.state || "").toUpperCase();
        if (["SUCCESS", "FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUpper) || last.httpStatus >= 400) break;
        await delay(400 * attempt);
      }
      return last;
    };

    const formatAddress = (addr?: Record<string, string | undefined | null>) => {
      if (!addr) return "—";
      const parts = [addr.addressLine1, addr.addressLine2, addr.city, addr.stateOrProvinceCode, addr.postalCode, addr.countryCode]
        .map((part) => (part || "").trim())
        .filter((part) => part.length);
      return parts.join(", ") || "—";
    };

    const generatePackingOptions = async (inboundPlanId: string) => {
      return signedFetch({
        method: "POST",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${path}/${encodeURIComponent(inboundPlanId)}/packingOptions:generate`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.generatePackingOptions",
        marketplaceId,
        sellerId
      });
    };

    const listPackingOptions = async (inboundPlanId: string) => {
      return signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${path}/${encodeURIComponent(inboundPlanId)}/packingOptions`,
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
      });
    };

    const generatePlacementOptions = async (inboundPlanId: string) => {
      return signedFetch({
        method: "POST",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${path}/${encodeURIComponent(inboundPlanId)}/placementOptions:generate`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.generatePlacementOptions",
        marketplaceId,
        sellerId
      });
    };

    const listPlacementOptions = async (inboundPlanId: string) => {
      return signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${path}/${encodeURIComponent(inboundPlanId)}/placementOptions`,
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
    };

    let attempt = 0;
    const maxAttempts = 3;
    let amazonJson: any = null;
    let primaryRequestId: string | null = null;
    let plans: any[] = [];
    let inboundPlanId: string | null = reqData.inbound_plan_id || null;
    let inboundPlanStatus: string | null = null;
    let operationId: string | null = null;
    let operationStatus: string | null = null;
    let operationProblems: any[] = [];
    let operationRaw: any = null;
    let createHttpStatus: number | null = null;
    let _lastPackingOptions: any[] = [];
    let _lastPlacementOptions: any[] = [];

    if (inboundPlanId) {
      const fetched = await fetchInboundPlanById(inboundPlanId);
      plans = fetched.fetchedPlans || [];
      inboundPlanStatus = fetched.fetchedStatus || null;
      _lastPackingOptions = fetched.fetchedPackingOptions || [];
      _lastPlacementOptions = fetched.fetchedPlacementOptions || [];
      appliedPlanBody = appliedPlanBody || buildPlanBody(appliedOverrides);
    } else {
      while (attempt < maxAttempts) {
        attempt += 1;
        const planBody = buildPlanBody(appliedOverrides);
        const payload = JSON.stringify(planBody);

        const res = await signedFetch({
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
          operationName:
            attempt === 1 ? "inbound.v20240320.createInboundPlan" : `inbound.v20240320.createInboundPlan.retry${attempt}`,
          marketplaceId,
          sellerId
        });

        createHttpStatus = res.res.status;
        if (!primaryRequestId) primaryRequestId = res.requestId || null;
        amazonJson = res.json;
        operationId = operationId || extractOperationId(res.json);
        const data = extractInboundPlanData(res.json);
        inboundPlanId = inboundPlanId || data.inboundPlanId;
        inboundPlanStatus = inboundPlanStatus || data.inboundStatus;
        plans = data.shipments.length ? data.shipments : data.inboundShipmentPlans;
        _lastPackingOptions = data.packingOptions;
        _lastPlacementOptions = data.placementOptions;

        if (res.res.ok && plans?.length) {
          appliedPlanBody = planBody;
          break;
        }

        const inboundErrors = extractInboundErrors({ json: res.json, text: res.text || "" });
        if (!inboundErrors.length) {
          break;
        }

        let changed = false;
        for (const err of inboundErrors) {
          const fixVal = chooseFixValue(err.field, err.msg, err.accepted);
          if (!fixVal) continue;
          const skuKey = normalizeSku(err.msku);
          appliedOverrides[skuKey] = appliedOverrides[skuKey] || {};
          if (appliedOverrides[skuKey][err.field] !== fixVal) {
            appliedOverrides[skuKey][err.field] = fixVal;
            changed = true;
          }
        }

        if (!changed) {
          break;
        }
      }
    }

    const missingExpiry = items
      .map((it) => {
        const key = normalizeSku(it.sku || it.asin || "");
        const requiresExpiry =
          (prepGuidanceMap[key]?.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
          expiryRequiredBySku[normalizeSku(it.sku || "")] === true;
        const hasExpiry = !!expirations[key];
        return requiresExpiry && !hasExpiry ? key : null;
      })
      .filter(Boolean) as string[];

    if (missingExpiry.length) {
      const warn = `Unele SKU-uri necesită dată de expirare: ${missingExpiry.join(", ")}. Completează expirarea și reîncearcă.`;
      const skus = items.map((it, idx) => {
        const key = normalizeSku(it.sku || it.asin || "");
        const prepInfo = prepGuidanceMap[key] || {};
        const requiresExpiry =
          (prepInfo.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
          expiryRequiredBySku[normalizeSku(it.sku || "")] === true;
        return {
          id: it.id || `sku-${idx + 1}`,
          title: it.product_name || it.sku || `SKU ${idx + 1}`,
          sku: it.sku || "",
          asin: it.asin || "",
          storageType: "Standard-size",
          packing: "individual",
          units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
          expiry: expirations[key] || "",
          expirySource: expirySourceBySku[key] || null,
          expiryRequired: requiresExpiry,
          prepRequired: prepInfo?.prepRequired || false,
          prepNotes: (prepInfo?.prepInstructions || []).join(", "),
          manufacturerBarcodeEligible:
            (prepInfo?.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode",
          readyToPack: false
        };
      });
      const plan = {
        source: "amazon",
        amazonIntegrationId,
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
        warning: warn,
        blocking: true
      };
      return new Response(JSON.stringify({ plan, traceId, scopes: lwaScopes }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Step 1 nu mai face polling după createInboundPlan; evităm seriile de GET inboundPlan/operation
    // care adăugau ~1 minut. Confirmarea packing/placement (Step 2) va genera shipments ulterior.

    // No shipments yet is expected until carrier/placement is confirmed; we stop here in Step 1.

    if (!appliedPlanBody) {
      appliedPlanBody = buildPlanBody(appliedOverrides);
    }

    if (!plans || !plans.length) {
      if (inboundPlanId && !inboundPlanStatus) inboundPlanStatus = "ACTIVE";
      if (operationId && !operationStatus && createHttpStatus && createHttpStatus < 300) {
        operationStatus = "SUCCESS";
      }
      const planActive =
        (operationStatus || "").toUpperCase() === "SUCCESS" || (inboundPlanStatus || "").toUpperCase() === "ACTIVE";

      if (planActive) {
        console.warn("createInboundPlan missing shipments but operation/plan success", {
          traceId,
          status: createHttpStatus,
          inboundPlanId,
          inboundPlanStatus,
          operationId,
          operationStatus,
          marketplaceId,
          region: awsRegion,
          sellerId,
          requestId: primaryRequestId
        });
        // Step 1 se oprește aici; nu mai afișăm warning-ul repetitiv din UI.
      } else {
        console.error("createInboundPlan primary error", {
          traceId,
          status: createHttpStatus,
          inboundPlanId,
          inboundPlanStatus,
          operationId,
          operationStatus,
          marketplaceId,
          region: awsRegion,
          sellerId,
          requestId: primaryRequestId,
          body: amazonJson || null,
          operationProblems: operationProblems?.slice?.(0, 5) || null,
          operationRaw: operationRaw || null
        });
        const fallbackSkus = items.map((it, idx) => {
          const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
          const prepInfo = prepGuidanceMap[it.sku || it.asin || ""] || {};
          const requiresExpiry =
            (prepInfo.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
            expiryRequiredBySku[it.sku || ""] === true;
          const key = normalizeSku(it.sku || it.asin || "");
          return {
            id: it.id || `sku-${idx + 1}`,
            title: it.product_name || stock?.name || it.sku || stock?.sku || `SKU ${idx + 1}`,
            sku: it.sku || stock?.sku || "",
            asin: it.asin || stock?.asin || "",
            storageType: "Standard-size",
            packing: "individual",
            units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
            expiry: expirations[key] || "",
            expirySource: expirySourceBySku[key] || null,
            expiryRequired: requiresExpiry,
            prepRequired: prepInfo.prepRequired || false,
            prepNotes: (prepInfo.prepInstructions || []).join(", "),
            manufacturerBarcodeEligible:
              (prepInfo.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode",
            readyToPack: true,
            image: stock?.image_url || null
          };
        });
        const extraWarnings = planWarnings.length ? ` ${planWarnings.join(" ")}` : "";
        const statusInfo = inboundPlanStatus
          ? ` Status plan: ${inboundPlanStatus}${inboundPlanId ? ` (${inboundPlanId})` : ""}.`
          : inboundPlanId
          ? ` InboundPlanId: ${inboundPlanId}.`
          : "";
        const optionsInfo =
          _lastPackingOptions.length || _lastPlacementOptions.length
            ? ` Packing options: ${_lastPackingOptions.length}, placement options: ${_lastPlacementOptions.length}.`
            : "";
        const operationInfo = operationId
          ? ` Operation: ${operationStatus || "necunoscut"} (${operationId}).`
          : "";
        const problemsInfo = operationProblems?.length
          ? ` Probleme raportate: ${operationProblems
              .slice(0, 3)
              .map((p: any) => p?.message || p?.code || safeJson(p))
              .join(" | ")}`
          : "";
        const fallbackPlan = {
          source: "amazon",
          amazonIntegrationId,
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
          warning: `Amazon a refuzat crearea planului. Încearcă din nou sau verifică permisiunile Inbound pe marketplace.${statusInfo}${operationInfo}${optionsInfo}${problemsInfo ? ` ${problemsInfo}` : ""}${extraWarnings}`,
          blocking: true,
          requestId: primaryRequestId || null
        };
        return new Response(JSON.stringify({ plan: fallbackPlan, traceId, status: createHttpStatus, requestId: primaryRequestId || null, inboundPlanId, inboundPlanStatus, operationId, operationStatus, operationProblems, operationRaw, scopes: lwaScopes }), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    const normalizeItems = (p: any) => p?.items || p?.Items || p?.shipmentItems || p?.ShipmentItems || [];

    if (prepGuidanceWarning) {
      planWarnings.push(prepGuidanceWarning);
    }
    if (planWarning) {
      planWarnings.push(planWarning);
    }
    if (operationStatus && operationStatus.toUpperCase() !== "SUCCESS") {
      planWarnings.push(`Operation ${operationId || ""} status: ${operationStatus}.`);
    }
    if (operationProblems?.length) {
      planWarnings.push(
        `Probleme raportate: ${operationProblems
          .slice(0, 3)
          .map((p: any) => p?.message || p?.code || safeJson(p))
          .join(" | ")}`
      );
    }

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
      const estimatedBoxes = Number(p.estimatedBoxCount || p.EstimatedBoxCount || p.estimatedBoxes || 1) || 1;
      const destinationFc =
        p.destinationFulfillmentCenterId ||
        p.destinationFulfillmentCenterID ||
        p.destinationFC ||
        p.destination_fulfillment_center_id ||
        p.DestinationFulfillmentCenterId ||
        "";
      const destAddress = p.destinationAddress || p.destination_address || p.DestinationAddress || p.destination || null;
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
          id: p.ShipmentId || p.shipmentId || p.id || `plan-${idx + 1}`,
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
      const destAddress = p.destinationAddress || p.destination_address || p.DestinationAddress || p.destination;
      const destinationFc =
        p.destinationFulfillmentCenterId ||
        p.destinationFulfillmentCenterID ||
        p.destinationFC ||
        p.destination_fulfillment_center_id ||
        p.DestinationFulfillmentCenterId ||
        null;
      const boxes = Number(p.estimatedBoxCount || p.EstimatedBoxCount || p.estimatedBoxes || itemsList.length || 1) || 1;
      return {
        id: p.ShipmentId || p.shipmentId || p.id || `shipment-${idx + 1}`,
        name: `Shipment ${p.ShipmentId || p.shipmentId || idx + 1}`,
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
        const key = normalizeSku(it.msku);
        labelOwnerBySku[key] = (it.labelOwner as "SELLER" | "NONE") || "SELLER";
        if (appliedOverrides[key]) {
          labelOwnerSourceBySku[key] = "amazon-override";
        } else {
          labelOwnerSourceBySku[key] = "prep-guidance";
        }
      }
    });
    // Dacă retry a aplicat inversări, completăm map-ul cu override-urile folosite
    if (plans?.length && appliedPlanBody?.items) {
      appliedPlanBody.items.forEach((it: any) => {
        if (it?.msku && it.labelOwner && !labelOwnerBySku[it.msku]) {
          const key = normalizeSku(it.msku);
          labelOwnerBySku[key] = it.labelOwner as "SELLER" | "NONE";
          labelOwnerSourceBySku[key] = appliedOverrides[key] ? "amazon-override" : "prep-guidance";
        }
      });
    }

    const skus = items.map((it, idx) => {
      const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
      const skuKey = normalizeSku(it.sku || stock?.sku || it.asin || "");
      const prepInfo = prepGuidanceMap[skuKey] || {};
      const prepRequired = !!prepInfo.prepRequired;
      const manufacturerBarcodeEligible = prepInfo.barcodeInstruction
        ? isManufacturerBarcodeEligible(prepInfo.barcodeInstruction)
        : false;
      const labelOwner =
        labelOwnerBySku[skuKey] ||
        (prepRequired ? "SELLER" : manufacturerBarcodeEligible ? "NONE" : "SELLER");
      const labelOwnerSource =
        labelOwnerSourceBySku[skuKey] ||
        (prepInfo.barcodeInstruction ? "prep-guidance" : "assumed");
      const requiresExpiry =
        (prepInfo.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
        expiryRequiredBySku[skuKey] === true;
      const expiryVal = expirations[skuKey] || "";
      return {
        id: it.id || `sku-${idx + 1}`,
        title: it.product_name || stock?.name || it.sku || stock?.sku || `SKU ${idx + 1}`,
        sku: it.sku || stock?.sku || "",
        asin: it.asin || stock?.asin || "",
        storageType: "Standard-size",
        fnsku: fnskuBySku[it.sku || ""] || null,
        packing: "individual",
        units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
        expiry: expiryVal,
        expirySource: expirySourceBySku[skuKey] || null,
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

    const combinedWarning = planWarnings.length ? planWarnings.join(" ") : null;
    const shipmentsPending = !plans?.length;
    // Persist inboundPlanId when newly created so viitoarele apeluri nu mai generează plan nou
    if (inboundPlanId && inboundPlanId !== reqData.inbound_plan_id) {
      await supabase
        .from("prep_requests")
        .update({ inbound_plan_id: inboundPlanId })
        .eq("id", requestId);
    }

    const plan = {
      source: "amazon",
      amazonIntegrationId,
      marketplace: marketplaceId,
      companyId: reqData.company_id || null,
      inboundPlanId: inboundPlanId || null,
      inboundPlanStatus: inboundPlanStatus || null,
      operationId: operationId || null,
      operationStatus: operationStatus || null,
      shipmentsPending,
      shipFrom: {
        name: shipFromAddress.name,
        address: formatAddress(shipFromAddress)
      },
      skus,
      packGroups,
      shipments,
      raw: amazonJson,
      skuStatuses,
      warning: combinedWarning
    };

    return new Response(
      JSON.stringify({
        plan,
        traceId,
        requestId: primaryRequestId || null,
        inboundPlanId,
        inboundPlanStatus,
        operationId,
        operationStatus,
        shipmentsPending,
        scopes: lwaScopes
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" }
      }
    );
  } catch (e) {
    console.error("fba-plan error", { traceId, error: e });
    return new Response(JSON.stringify({ error: e?.message || "Server error", detail: `${e}`, traceId }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
