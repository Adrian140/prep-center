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
  traceId?: string;
  operationName?: string;
}) {
  const { method, service, region, host, path, query, payload, accessKey, secretKey, sessionToken, lwaToken, traceId, operationName } =
    opts;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();

  try {
    const body = await req.json();
    const requestId = body.request_id || body.requestId || null;
    let companyId = body.company_id || body.companyId || null;
    let marketplaceId = body.marketplace_id || body.marketplaceId || "A13V1IB3VIYZZH";
    let items = Array.isArray(body.items) ? body.items : [];

    console.log(
      JSON.stringify(
        {
          tag: "FBA_LABELS_INPUT",
          traceId,
          requestId,
          companyId,
          marketplaceId,
          itemsCount: items.length
        },
        null,
        2
      )
    );

    // Dacă nu primim companyId, încearcă să îl derivezi din prep_requests
    if (!companyId && requestId) {
      const { data: reqRow, error: reqErr } = await supabase
        .from("prep_requests")
        .select("id, company_id, destination_country, prep_request_items(id, sku, asin, units_requested, units_sent)")
        .eq("id", requestId)
        .maybeSingle();
      if (!reqErr && reqRow) {
        companyId = reqRow.company_id || companyId;
        if (Array.isArray(reqRow.prep_request_items) && !items.length) {
          items = reqRow.prep_request_items.map((it) => ({
            sku: it.sku || null,
            asin: it.asin || null,
            quantity: Number(it.units_sent ?? it.units_requested ?? 0) || 1
          }));
        }
        const country = (reqRow.destination_country || "").toUpperCase();
        const map: Record<string, string> = {
          FR: "A13V1IB3VIYZZH",
          DE: "A1PA6795UKMFR9",
          ES: "A1RKKUPIHCS9HS",
          IT: "APJ6JRA9NG5V4"
        };
        marketplaceId = body.marketplace_id || body.marketplaceId || map[country] || marketplaceId;
      }
    }

    if (!companyId) {
      const msg = "Missing company_id (sau request_id) în apelul fba-labels";
      console.error(msg, { traceId });
      return new Response(JSON.stringify({ error: msg, traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    if (!items.length) {
      const msg = "No items provided";
      console.error(msg, { traceId });
      return new Response(JSON.stringify({ error: msg, traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Găsește integrarea Amazon (alăturat cu fba-plan): încearcă întâi marketplace, apoi orice activ, apoi pending
    let integ: any = null;
    let integStatus: string | null = null;
    if (marketplaceId) {
      const { data: integRows, error } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .eq("marketplace_id", marketplaceId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (!error && Array.isArray(integRows) && integRows[0]) {
        integ = integRows[0];
        integStatus = (integ as any).status || null;
      } else if (error) {
        console.warn("amazon_integrations query (by marketplace) failed", error);
      }
    }
    if (!integ) {
      const { data: integRows, error: integErr } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (!integErr && Array.isArray(integRows) && integRows[0]) {
        integ = integRows[0];
        integStatus = (integ as any).status || null;
      } else if (integErr) {
        console.warn("amazon_integrations query (fallback) failed", integErr);
      }
    }
    if (!integ) {
      const { data: pendingRows, error: pendingErr } = await supabase
        .from("amazon_integrations")
        .select("refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", companyId)
        .in("status", ["pending"])
        .order("updated_at", { ascending: false })
        .limit(1);
      if (!pendingErr && Array.isArray(pendingRows) && pendingRows[0]) {
        integ = pendingRows[0];
        integStatus = (integ as any).status || "pending";
      } else if (pendingErr) {
        console.warn("amazon_integrations pending query failed", pendingErr);
      }
    }
    if (!integ?.refresh_token) {
      return new Response(JSON.stringify({ error: "Missing Amazon integration for company", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    if (integStatus === "pending") {
      const msg =
        "Integrarea Amazon nu este completă (lipsește Selling Partner ID). Deconectează și reconectează pentru a finaliza autorizarea.";
      return new Response(JSON.stringify({ error: msg, traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const regionCode = (integ.region || "eu").toLowerCase();
    const awsRegion = regionCode === "na" ? "us-east-1" : regionCode === "fe" ? "us-west-2" : "eu-west-1";
    const host = regionHost(regionCode);
    const sellerId = await resolveSellerId(companyId, integ.selling_partner_id || null);
    if (!sellerId) {
      return new Response(JSON.stringify({ error: "Missing seller id", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const tempCreds = await assumeRole(SPAPI_ROLE_ARN);
    const lwaAccessToken = await getLwaAccessToken(integ.refresh_token);

    const labelItems = items
      .map((it: any) => {
        const qty = Math.max(1, Number(it.quantity || it.qty || it.units || 0) || 1);
        const identifierVal = it.fnsku || it.sku || it.asin || "";
        if (!identifierVal) return null;
        const idType = it.fnsku ? "FNSKU" : it.sku ? "SELLER_SKU" : "ASIN";
        return {
          itemReference: it.sku || it.fnsku || it.asin,
          identifier: {
            type: idType,
            value: identifierVal
          },
          quantity: qty
        };
      })
      .filter(Boolean);

    if (!labelItems.length) {
      return new Response(JSON.stringify({ error: "No valid items with identifiers", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // SP-API createMarketplaceItemLabels (2024-03-20) așteaptă marketplaceId + labelType + mskuQuantities (+ width/height pentru thermal)
    const chosenMarketplace = marketplaceId || integ.marketplace_id || "A13V1IB3VIYZZH";
    const labelType = String(body.label_type || body.labelType || "THERMAL_PRINTING").toUpperCase();
    const rawWidth = Number(body.label_width || body.labelWidth || body.width || 50);
    const rawHeight = Number(body.label_height || body.labelHeight || body.height || 25);
    const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min);
    const width = clamp(rawWidth, 25, 100);
    const height = clamp(rawHeight, 25, 100);

    const payloadJson: any = {
      marketplaceId: chosenMarketplace,
      labelType,
      localeCode: body.locale || body.localeCode || "en_GB", // EU default
      mskuQuantities: labelItems.map((it: any) => ({
        msku: it.itemReference || it.identifier?.value || it.sku || it.fnsku || it.asin || "",
        quantity: it.quantity || 1
      }))
    };

    if (labelType === "THERMAL_PRINTING") {
      payloadJson.width = width;
      payloadJson.height = height;
    } else {
      // fallback pentru A4 (se poate seta din body.pageType)
      payloadJson.pageType = body.page_type || body.pageType || "A4_24";
      // opțional trimitem și dimensiunile dacă vin din UI
      payloadJson.width = width;
      payloadJson.height = height;
    }

    const payload = JSON.stringify(payloadJson);

    const createRes = await signedFetch({
      method: "POST",
      service: "execute-api",
      region: awsRegion,
      host,
      path: "/inbound/fba/2024-03-20/items/labels",
      query: "",
      payload,
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken: lwaAccessToken,
      traceId,
      operationName: "inbound.v20240320.createMarketplaceItemLabels"
    });

    if (!createRes.res.ok) {
      return new Response(
        JSON.stringify({
          error: "Amazon createMarketplaceItemLabels failed",
          traceId,
          status: createRes.res.status,
          body: createRes.text?.slice(0, 2000)
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const directDownload =
      createRes.json?.documentDownloads?.[0]?.uri ||
      createRes.json?.payload?.documentDownloads?.[0]?.uri ||
      null;

    if (directDownload) {
      return new Response(JSON.stringify({ downloadUrl: directDownload, traceId }), {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const operationId =
      createRes.json?.payload?.operationId ||
      createRes.json?.operationId ||
      createRes.json?.payload?.OperationId ||
      null;

    if (!operationId) {
      return new Response(JSON.stringify({ error: "Missing operationId in Amazon response", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Try one immediate fetch; caller can poll if still processing
    const statusRes = await signedFetch({
      method: "GET",
      service: "execute-api",
      region: awsRegion,
      host,
      path: `/inbound/fba/2024-03-20/operations/${operationId}`,
      query: "",
      payload: "",
      accessKey: tempCreds.accessKeyId,
      secretKey: tempCreds.secretAccessKey,
      sessionToken: tempCreds.sessionToken,
      lwaToken: lwaAccessToken,
      traceId,
      operationName: "inbound.v20240320.getInboundOperationStatus"
    });

    const downloadUrl =
      statusRes.json?.payload?.output?.downloadUrl ||
      statusRes.json?.payload?.downloadUrl ||
      statusRes.json?.downloadUrl ||
      null;

    return new Response(JSON.stringify({ operationId, downloadUrl, traceId }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  } catch (e: any) {
    console.error("fba-labels error", { traceId, error: e?.message || e });
    return new Response(JSON.stringify({ error: e?.message || "Server error", traceId }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  }
});
