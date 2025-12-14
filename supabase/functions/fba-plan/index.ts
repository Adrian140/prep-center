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
}) {
  const { method, service, region, host, path, query, payload, accessKey, secretKey, sessionToken, lwaToken } = opts;
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
  const res = await fetch(`https://${host}${path}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      ...sigHeaders,
      "x-amz-access-token": lwaToken,
      accept: "application/json"
    },
    body: method === "POST" ? payload : undefined
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore parse errors
  }
  return { res, text, json };
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

const marketplaceByCountry: Record<string, string> = {
  FR: "A13V1IB3VIYZZH",
  DE: "A1PA6795UKMFR9",
  ES: "A1RKKUPIHCS9HS",
  IT: "APJ6JRA9NG5V4"
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
}) {
  const { host, region, path, query, lwaToken, tempCreds } = opts;
  const payload = "";
  const sigHeaders = await signRequest({
    method: "GET",
    service: "execute-api",
    region,
    host,
    path,
    query,
    payload,
    accessKey: tempCreds.accessKeyId,
    secretKey: tempCreds.secretAccessKey,
    sessionToken: tempCreds.sessionToken
  });

  const res = await fetch(`https://${host}${path}${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: {
      ...sigHeaders,
      "x-amz-access-token": lwaToken
    }
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore parse errors; handled by status
  }
  return { res, text, json };
}

async function catalogCheck(params: {
  asin?: string | null;
  marketplaceId: string;
  host: string;
  region: string;
  lwaToken: string;
  tempCreds: TempCreds;
}) {
  const { asin, marketplaceId, host, region, lwaToken, tempCreds } = params;
  if (!asin) return { found: false, reason: "Lipsă ASIN pentru verificare catalog" };
  const path = `/catalog/2022-04-01/items/${encodeURIComponent(asin)}`;
  const query = `marketplaceIds=${encodeURIComponent(marketplaceId)}`;
  const { res, json, text } = await spapiGet({ host, region, path, query, lwaToken, tempCreds });
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
  return { found: false, reason: `Catalog check ${res.status}: ${text}` };
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
      tempCreds
    });

    if (res.status === 404) {
      return { state: "missing", reason: "Listing inexistent pe marketplace-ul destinație" };
    }
    if (!res.ok) {
      // Try catalog fallback for visibility; if found, mark ok with note
      const cat = await catalogCheck({ asin, marketplaceId, host, region, lwaToken, tempCreds });
      if (cat.found) {
        return { state: "ok", reason: `Catalog găsit; Listings API ${res.status}` };
      }
      return { state: "unknown", reason: `Eroare Listings API (${res.status}): ${text}` };
    }

    // If API returned 200, treat as ok regardless of status field (some accounts return blank or legacy fields)
    const status = json?.payload?.status || json?.payload?.Status || "";

    // Catalog confirmă că ASIN/SKU există pe marketplace; altfel blocăm ca missing
    const cat = await catalogCheck({ asin, marketplaceId, host, region, lwaToken, tempCreds });
    debug = {
      listingStatusCode: res.status,
      listingStatusField: status || null,
      catalogFound: cat.found,
      catalogReason: cat.reason
    };
    if (traceId) {
      console.log("sku-status", { traceId, sku, asin, marketplaceId, ...debug });
    }
    if (!cat.found) {
      return { state: "missing", reason: "Produsul nu există pe marketplace-ul destinație (Catalog Items)" };
    }

    if (!status) {
      return { state: "ok", reason: "Listing găsit; status lipsă/legacy (considerat eligibil)" };
    }
    if (String(status).toUpperCase() !== "ACTIVE") {
      return { state: "inactive", reason: `Listing găsit cu status ${status}` };
    }
  } catch (e) {
    const cat = await catalogCheck({ asin, marketplaceId, host, region, lwaToken, tempCreds });
    if (traceId) {
      console.log("sku-status-error", {
        traceId,
        sku,
        asin,
        marketplaceId,
        error: e instanceof Error ? e.message : `${e}`,
        catalogFound: cat.found,
        catalogReason: cat.reason
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
        tempCreds
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
}) {
  const { items, shipFromCountry, shipToCountry, host, region, tempCreds, lwaToken } = params;
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
    lwaToken
  });

  if (!prep.res.ok) {
    console.warn("prepInstructions error", { status: prep.res.status, body: prep.text?.slice(0, 500) });
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

    const destCountry = (reqData.destination_country || "").toUpperCase();
    const inferredMarketplace = marketplaceByCountry[destCountry] || null;

    // Fetch amazon integration for this user/company
    let integ: AmazonIntegration | null = null;
    if (inferredMarketplace) {
      const { data: integRows, error } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id")
        .eq("company_id", reqData.company_id)
        .eq("status", "active")
        .eq("marketplace_id", inferredMarketplace)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (!error && Array.isArray(integRows) && integRows[0]) {
        integ = integRows[0] as any;
      } else if (error) {
        console.warn("amazon_integrations query (by marketplace) failed", error);
      }
    }
    if (!integ) {
      const { data: integRows, error: integErr } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id")
        .eq("company_id", reqData.company_id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (integErr) throw integErr;
      integ = (integRows?.[0] as any) || null;
    }
    if (!integ?.refresh_token) {
      throw new Error("No active Amazon integration found for this company");
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

    const prepGuidanceMap = await fetchPrepGuidance({
      items,
      shipFromCountry,
      shipToCountry: destCountry || shipFromCountry,
      host,
      region: awsRegion,
      tempCreds,
      lwaToken: lwaAccessToken
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
      accessKey: AWS_ACCESS_KEY_ID ? `...${AWS_ACCESS_KEY_ID.slice(-4)}` : ""
    });

    // Ship-from: fixed prep center address (real location in FR, nu schimbăm după destinație)
    const shipFromCountry = "FR";
    const shipFromAddress = {
      name: "Bucur Adrian",
      addressLine1: "5 Rue des Enclos",
      addressLine2: "Zone B, Cellule 7",
      city: "Gouesniere",
      stateOrProvinceCode: "Ille-et-Vilaine",
      postalCode: "35350",
      countryCode: shipFromCountry,
      phoneNumber: "0675116218",
      email: "ioan.adrian.bucur@gmail.com",
      companyName: "EcomPrep Hub"
    };

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
      const skus = items.map((it, idx) => ({
        id: it.id || `sku-${idx + 1}`,
        title: it.product_name || it.sku || `SKU ${idx + 1}`,
        sku: it.sku || "",
        asin: it.asin || "",
        storageType: "Standard-size",
        packing: "individual",
        units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
        expiry: "",
        prepRequired: prepGuidanceMap[it.sku || it.asin || ""]?.prepRequired || false,
        prepNotes: (prepGuidanceMap[it.sku || it.asin || ""]?.prepInstructions || []).join(", "),
        manufacturerBarcodeEligible:
          (prepGuidanceMap[it.sku || it.asin || ""]?.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode",
        readyToPack: true
      }));
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
      return new Response(JSON.stringify({ plan }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const planBody = {
      shipFromAddress,
      destinationMarketplaces: [marketplaceId],
      labelPrepPreference: "SELLER_LABEL",
      program: "EFN",
      shipmentType: "SP",
      requireDeliveryWindows: false,
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
      lwaToken: lwaAccessToken
    });

    // Keep raw Amazon response for debugging / UI
    const amazonJson = primary.json;

    let plans =
      primary.json?.payload?.inboundPlan?.inboundShipmentPlans ||
      primary.json?.payload?.InboundShipmentPlans ||
      primary.json?.InboundShipmentPlans ||
      [];

    if (!primary.res.ok) {
      console.error("createInboundPlan primary error", {
        traceId,
        status: primary.res.status,
        marketplaceId,
        region: awsRegion,
        sellerId,
        body: primary.text?.slice(0, 2000)
      });
      // Fallback la v0 createInboundShipmentPlan dacă 401/403
      if (primary.res.status === 401 || primary.res.status === 403) {
        const v0Payload = JSON.stringify({
          ShipFromAddress: {
            Name: shipFromAddress.name,
            AddressLine1: shipFromAddress.addressLine1,
            AddressLine2: shipFromAddress.addressLine2,
            City: shipFromAddress.city,
            StateOrProvinceCode: shipFromAddress.stateOrProvinceCode,
            PostalCode: shipFromAddress.postalCode,
            CountryCode: shipFromAddress.countryCode
          },
          LabelPrepPreference: "SELLER_LABEL",
          InboundShipmentPlanRequestItems: items.map((it) => ({
            SellerSKU: it.sku || "",
            ASIN: it.asin || undefined,
            Quantity: Number(it.units_sent ?? it.units_requested ?? 0) || 0
          }))
        });
        const v0 = await signedFetch({
          method: "POST",
          service: "execute-api",
          region: awsRegion,
          host,
          path: "/fba/inbound/v0/plans",
          query: "",
          payload: v0Payload,
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken
        });
        if (v0.res.ok) {
          plans = v0.json?.payload?.InboundShipmentPlans || v0.json?.InboundShipmentPlans || [];
        } else {
          console.error("createInboundPlan v0 fallback error", {
            traceId,
            status: primary.res.status,
            v0Status: v0.res.status,
            marketplaceId,
            region: awsRegion,
            sellerId,
            body: primary.text?.slice(0, 2000),
            v0Body: v0.text?.slice(0, 2000)
          });
          const authWarning = `Amazon a refuzat crearea planului (HTTP ${primary.res.status}). Încearcă din nou sau verifică permisiunile Inbound pe marketplace.`;
          console.error("fba-plan createInboundPlan error", {
            traceId,
            status: primary.res.status,
            host,
            marketplaceId,
            region: awsRegion,
            sellerId,
            body: primary.text?.slice(0, 2000),
            v0Status: v0.res.status,
            v0Body: v0.text?.slice(0, 2000)
          });
          const fallbackSkus = items.map((it, idx) => {
            const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
            const prepInfo = prepGuidanceMap[it.sku || it.asin || ""] || {};
            return {
              id: it.id || `sku-${idx + 1}`,
              title: it.product_name || stock?.name || it.sku || stock?.sku || `SKU ${idx + 1}`,
              sku: it.sku || stock?.sku || "",
              asin: it.asin || stock?.asin || "",
              storageType: "Standard-size",
              packing: "individual",
              units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
              expiry: "",
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
            warning: authWarning,
            blocking: true
          };
          return new Response(JSON.stringify({ plan: fallbackPlan, traceId, status: primary.res.status }), {
            status: 200,
            headers: { ...corsHeaders, "content-type": "application/json" }
          });
        }
      } else {
        console.error("fba-plan createInboundPlan error", {
          traceId,
          status: primary.res.status,
          host,
          marketplaceId,
          region: awsRegion,
          sellerId,
          body: primary.text?.slice(0, 2000) // avoid huge logs
        });
        const fallbackSkus = items.map((it, idx) => {
          const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
          const prepInfo = prepGuidanceMap[it.sku || it.asin || ""] || {};
          return {
            id: it.id || `sku-${idx + 1}`,
            title: it.product_name || stock?.name || it.sku || stock?.sku || `SKU ${idx + 1}`,
            sku: it.sku || stock?.sku || "",
            asin: it.asin || stock?.asin || "",
            storageType: "Standard-size",
            packing: "individual",
            units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
            expiry: "",
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
          blocking: true
        };
        return new Response(JSON.stringify({ plan: fallbackPlan, traceId, status: primary.res.status }), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    const normalizeItems = (p: any) => p?.items || p?.Items || [];

    // Map to UI format
    const packGroups = plans.map((p: any, idx: number) => {
      const itemsList = normalizeItems(p);
      const totalUnits = itemsList.reduce((s: number, it: any) => s + (Number(it.quantity || it.Quantity) || 0), 0);
      const warning = Array.isArray(p.warnings || p.Warnings) && (p.warnings || p.Warnings)[0]?.message
        ? (p.warnings || p.Warnings)[0]?.message
        : null;
      const estimatedBoxes = Number(p.estimatedBoxCount || p.EstimatedBoxCount || 1) || 1;
      return {
        id: p.ShipmentId || `plan-${idx + 1}`,
        title: `Pack group ${idx + 1}`,
        skuCount: itemsList.length,
        units: totalUnits,
        boxes: estimatedBoxes,
        packMode: estimatedBoxes > 1 ? "multiple" : "single",
        warning,
        image: null,
        skus: itemsList.map((it: any, j: number) => ({
          id: it.msku || it.SellerSKU || `sku-${j + 1}`,
          qty: Number(it.quantity || it.Quantity) || 0,
          fnsku: it.fulfillmentNetworkSku || it.FulfillmentNetworkSKU || null
        }))
      };
    });

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

    const skus = items.map((it, idx) => {
      const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
      const prepInfo = prepGuidanceMap[it.sku || it.asin || ""] || {};
      return {
        id: it.id || `sku-${idx + 1}`,
        title: it.product_name || stock?.name || it.sku || stock?.sku || `SKU ${idx + 1}`,
        sku: it.sku || stock?.sku || "",
        asin: it.asin || stock?.asin || "",
        storageType: "Standard-size",
        packing: "individual",
        units: Number(it.units_sent ?? it.units_requested ?? 0) || 0,
        expiry: "",
        prepRequired: prepInfo.prepRequired || false,
        prepNotes: (prepInfo.prepInstructions || []).join(", "),
        manufacturerBarcodeEligible: (prepInfo.barcodeInstruction || "").toLowerCase() === "manufacturerbarcode",
        readyToPack: true,
        image: stock?.image_url || null
      };
    });

    const plan = {
      source: "amazon",
      marketplace: marketplaceId,
      shipFrom: {
        name: shipFromAddress.name,
        address: formatAddress(shipFromAddress)
      },
      skus,
      packGroups,
      shipments,
      raw: amazonJson,
      skuStatuses
    };

    return new Response(JSON.stringify({ plan, traceId }), {
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
