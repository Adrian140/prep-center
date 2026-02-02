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
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
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

function normalizeSku(val: string | null | undefined) {
  return (val || "").trim();
}

function parseNumber(input: unknown) {
  if (input == null) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const normalized = String(input).replace(",", ".").trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
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

function normalizeDimensions(input: any) {
  if (input == null) return null;
  const shape = typeof input === "number" ? { length: input, width: input, height: input } : input;
  const unit = String(shape.unit || shape.unitOfMeasurement || "CM").toUpperCase();
  const length = Number(shape.length ?? shape.Length ?? shape.l ?? 0);
  const width = Number(shape.width ?? shape.Width ?? shape.w ?? 0);
  const height = Number(shape.height ?? shape.Height ?? shape.h ?? 0);
  const dims = [length, width, height];
  if (!dims.every((n) => Number.isFinite(n) && n > 0)) return null;
  const toInches = (cm: number) => Number((cm / 2.54).toFixed(2));
  if (unit === "IN") {
    return {
      length: Number(length.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      unitOfMeasurement: "IN"
    };
  }
  return {
    length: toInches(length),
    width: toInches(width),
    height: toInches(height),
    unitOfMeasurement: "IN"
  };
}

function normalizeWeight(input: any) {
  const toFixedFloor = (value: number) => Math.floor(value * 100) / 100;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) return null;
    const toPounds = (kg: number) => toFixedFloor(kg * 2.2046226218);
    return { value: toPounds(input), unit: "LB" };
  }
  if (!input) return null;
  const unit = String(input.unit || "KG").toUpperCase();
  const value = Number(input.value || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === "LB") {
    const lbValue = toFixedFloor(value);
    return { value: lbValue >= 50.71 ? 50.7 : lbValue, unit: "LB" };
  }
  const safeKg = value >= 23 ? value - 0.05 : value;
  const toPounds = (kg: number) => toFixedFloor(kg * 2.2046226218);
  const lbValue = toPounds(safeKg);
  return { value: lbValue >= 50.71 ? 50.7 : lbValue, unit: "LB" };
}

function normalizeItem(input: any) {
  if (!input) return null;
  const msku = input?.msku || input?.MSKU || input?.sellerSku || input?.sku || null;
  const quantity = Number(input?.quantity ?? input?.qty ?? input?.quantityInBox ?? 0);
  if (!msku || !Number.isFinite(quantity) || quantity <= 0) return null;

  // Dacă nu vin prepOwner/labelOwner de la UI/Amazon, derivăm:
  //  - prepOwner: implicit NONE
  //  - labelOwner: SELLER doar dacă există prep/item labeling; altfel NONE (pentru barcode eligibile)
  const prepOwnerRaw = input?.prepOwner ?? input?.prep_owner ?? input?.PrepOwner ?? null;
  const labelOwnerRaw = input?.labelOwner ?? input?.label_owner ?? input?.LabelOwner;

  const prepInstructions = Array.isArray(input?.prepInstructions) ? input.prepInstructions : [];
  const hasNonLabelPrep = prepInstructions.some(
    (p: any) => String(p?.prepType || "").toUpperCase() !== "ITEM_LABELING"
  );
  const prepOwnerFromPrep =
    prepInstructions.find((p: any) => p?.prepOwner)?.prepOwner &&
    String(prepInstructions.find((p: any) => p?.prepOwner)?.prepOwner).toUpperCase();

  let prepOwner = String((prepOwnerRaw || "NONE") as string).toUpperCase();
  if (!prepOwnerRaw && hasNonLabelPrep && prepOwnerFromPrep === "SELLER") {
    prepOwner = "SELLER";
  }

  let derivedLabel: string | null = null;
  const hasItemLabeling = prepInstructions.some((p: any) => String(p?.prepType || "").toUpperCase() === "ITEM_LABELING");

  if (labelOwnerRaw) {
    derivedLabel = String(labelOwnerRaw).toUpperCase();
  } else if (prepOwner === "SELLER" || hasItemLabeling || prepOwnerFromPrep === "SELLER") {
    derivedLabel = "SELLER";
  } else {
    derivedLabel = "NONE";
  }
  const labelOwner = derivedLabel;

  const out: any = { msku: String(msku), quantity, prepOwner, labelOwner };

  const expirationVal =
    input?.expiration ??
    input?.expirationDate ??
    input?.expiry ??
    input?.expiryDate ??
    (Array.isArray(input?.prepInstructions)
      ? input.prepInstructions.find((p: any) => p?.expiration)?.expiration
      : null);
  if (expirationVal) out.expiration = String(expirationVal).slice(0, 10);

  if (input?.manufacturingLotCode) out.manufacturingLotCode = String(input.manufacturingLotCode);
  return out;
}

function buildPackageGroupingsFromPackingGroups(groups: any[]) {
  const out: any[] = [];
  (groups || []).forEach((g: any) => {
    const packingGroupId = g?.packingGroupId || g?.packing_group_id || g?.id || g?.groupId || null;
    if (!packingGroupId) return;
    if (packingGroupId && typeof packingGroupId === "string" && packingGroupId.toLowerCase().startsWith("fallback-")) return;

    const perBoxItemsRaw = Array.isArray(g?.perBoxItems)
      ? g.perBoxItems
      : Array.isArray(g?.per_box_items)
      ? g.per_box_items
      : [];
    const perBoxDetailsRaw = Array.isArray(g?.perBoxDetails)
      ? g.perBoxDetails
      : Array.isArray(g?.per_box_details)
      ? g.per_box_details
      : [];
    let dims = normalizeDimensions(g?.dimensions || g?.boxDimensions);
    let weight = normalizeWeight(g?.weight || g?.boxWeight);
    if (!dims || !weight) return;
    const hasPerBoxDetails = perBoxDetailsRaw.some((d: any) => {
      const l = Number(d?.length || 0);
      const w = Number(d?.width || 0);
      const h = Number(d?.height || 0);
      const wt = Number(d?.weight || 0);
      return l > 0 && w > 0 && h > 0 && wt > 0;
    });
    if ((!dims || !weight) && !hasPerBoxDetails) return;

    const rawSource = String(g?.contentInformationSource || "").toUpperCase();
    const allowedSources = new Set(["BARCODE_2D", "BOX_CONTENT_PROVIDED", "MANUAL_PROCESS"]);
    let contentInformationSource = allowedSources.has(rawSource) ? rawSource : "MANUAL_PROCESS";

    let items: any[] = [];
    const expectedItemsRaw = Array.isArray(g?.expectedItems) ? g.expectedItems : Array.isArray(g?.expected_items) ? g.expected_items : [];
    const expectedBySku = new Map<string, any>();
    expectedItemsRaw.forEach((it: any) => {
      const sku = normalizeItem(it)?.msku || normalizeSku(it?.msku || it?.sku || "");
      if (sku) expectedBySku.set(sku.toUpperCase(), it);
    });

    const rawItems =
      expectedItemsRaw.length
        ? expectedItemsRaw
        : Array.isArray(g?.items) && g.items.length
          ? g.items
          : [];

    items = rawItems.map(normalizeItem).filter(Boolean);
    const hasExpectedItems = expectedItemsRaw.length > 0;
    if (!items.length && hasExpectedItems) {
      items = expectedItemsRaw.map((it: any) => normalizeItem(it)).filter(Boolean);
    }
    const itemMetaBySku = new Map<string, any>();
    rawItems.forEach((it: any) => {
      const sku = normalizeSku(it?.msku || it?.sku || it?.sellerSku || it?.MSKU || "");
      if (!sku) return;
      itemMetaBySku.set(sku.toUpperCase(), it);
    });
    const skipItems =
      (contentInformationSource === "MANUAL_PROCESS" || contentInformationSource === "BARCODE_2D") && !hasExpectedItems;
    if (skipItems) {
      items = [];
    } else if (items.length) {
      // Dacă avem conținut mapat, forțăm BOX_CONTENT_PROVIDED ca Amazon să primească SKUs+qty/prep/label.
      contentInformationSource = "BOX_CONTENT_PROVIDED";
    } else if (contentInformationSource === "BOX_CONTENT_PROVIDED") {
      // Source cerut dar fără items -> fallback la manual.
      contentInformationSource = "MANUAL_PROCESS";
    }

    const boxCount = Math.max(
      1,
      Number(g?.boxCount || g?.boxes || perBoxItemsRaw.length || perBoxDetailsRaw.length || 1) || 1
    );
    if (perBoxItemsRaw.length) {
      contentInformationSource = "BOX_CONTENT_PROVIDED";
    }
    if (contentInformationSource === "BOX_CONTENT_PROVIDED" && perBoxItemsRaw.length) {
      const boxes = perBoxItemsRaw.map((box: any, idx: number) => {
        const boxItemEntries = Array.isArray(box?.items)
          ? box.items
          : box && typeof box === "object"
          ? Object.entries(box).map(([sku, quantity]) => ({ sku, quantity }))
          : [];
        const normalizedBoxItems = boxItemEntries
          .map((entry: any) => {
            const sku = normalizeSku(entry?.msku || entry?.sku || entry?.sellerSku || entry?.MSKU || "");
            if (!sku) return null;
            const meta = itemMetaBySku.get(sku.toUpperCase()) || {};
            return normalizeItem({ ...meta, msku: sku, quantity: entry?.quantity ?? entry?.qty ?? 0 });
          })
          .filter(Boolean);

      const perBoxMeta = perBoxDetailsRaw?.[idx] || {};
      const perDims = normalizeDimensions({
        length: parseNumber(perBoxMeta.length),
        width: parseNumber(perBoxMeta.width),
        height: parseNumber(perBoxMeta.height),
        unit: perBoxMeta.unit || perBoxMeta.unitOfMeasurement || "CM"
      });
      const perWeight = normalizeWeight({
        value: parseNumber(perBoxMeta.weight),
        unit: perBoxMeta.unitWeight || perBoxMeta.unit || "KG"
      });
        const boxDims = perDims || dims;
        const boxWeight = perWeight || weight;
        if (!boxDims || !boxWeight || !normalizedBoxItems.length) return null;

        return {
          quantity: 1,
          contentInformationSource: "BOX_CONTENT_PROVIDED",
          items: normalizedBoxItems.map((it: any) => ({
            msku: it.msku,
            quantity: it.quantity,
            prepOwner: it.prepOwner,
            labelOwner: it.labelOwner,
            ...(it.expiration ? { expiration: it.expiration } : {}),
            ...(it.manufacturingLotCode ? { manufacturingLotCode: it.manufacturingLotCode } : {})
          })),
          dimensions: boxDims,
          weight: boxWeight
        };
      }).filter(Boolean);

      if (boxes.length && boxes.length === perBoxItemsRaw.length) {
        out.push({ boxes, packingGroupId });
        return;
      }
    }
    if (hasPerBoxDetails && !perBoxItemsRaw.length) {
      const shouldAttachItems = items.length && contentInformationSource === "BOX_CONTENT_PROVIDED" && boxCount === 1;
      const resolvedSource = shouldAttachItems ? "BOX_CONTENT_PROVIDED" : contentInformationSource;
      const boxes = perBoxDetailsRaw
        .map((box: any) => {
          const perDims = normalizeDimensions({
            length: parseNumber(box?.length),
            width: parseNumber(box?.width),
            height: parseNumber(box?.height),
            unit: box?.unit || box?.unitOfMeasurement || "CM"
          });
          const perWeight = normalizeWeight({
            value: parseNumber(box?.weight),
            unit: box?.unitWeight || box?.unit || "KG"
          });
          if (!perDims || !perWeight) return null;
          return {
            quantity: 1,
            contentInformationSource: resolvedSource,
            ...(shouldAttachItems
              ? {
                  items: items.map((it) => ({
                    msku: it.msku,
                    quantity: it.quantity,
                    prepOwner: it.prepOwner,
                    labelOwner: it.labelOwner,
                    ...(it.expiration ? { expiration: it.expiration } : {}),
                    ...(it.manufacturingLotCode ? { manufacturingLotCode: it.manufacturingLotCode } : {})
                  }))
                }
              : {}),
            dimensions: perDims,
            weight: perWeight
          };
        })
        .filter(Boolean);
      if (boxes.length) {
        out.push({ boxes, packingGroupId });
        return;
      }
    }
    if (boxCount > 1 && items.length) {
      // Dacă UI a trimis cantitățile totale și un boxCount > 1, Amazon așteaptă cantitatea per box.
      const canSplitEvenly = items.every((it) => Number.isFinite(it.quantity) && it.quantity % boxCount === 0);
      if (canSplitEvenly) {
        items = items.map((it) => ({ ...it, quantity: it.quantity / boxCount }));
      }
    }
    const boxes = [
      {
        quantity: boxCount,
        contentInformationSource,
        ...(contentInformationSource === "BOX_CONTENT_PROVIDED"
          ? {
              items: items.map((it) => ({
                msku: it.msku,
                quantity: it.quantity,
                prepOwner: it.prepOwner,
                labelOwner: it.labelOwner,
                ...(it.expiration ? { expiration: it.expiration } : {}),
                ...(it.manufacturingLotCode ? { manufacturingLotCode: it.manufacturingLotCode } : {})
              }))
            }
          : {}),
        dimensions: dims,
        weight
      }
    ];

    const grouping: any = { boxes, packingGroupId };
    out.push(grouping);
  });
  return out;
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

async function signedFetchWithRetry(opts: Parameters<typeof signedFetch>[0], maxAttempts = 6) {
  let last: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await signedFetch(opts);
    last = res;
    if (res?.res?.status !== 429) return res;
    const base = Math.min(20000, 500 * (2 ** attempt));
    const jitter = Math.floor(Math.random() * 250);
    await delay(base + jitter);
  }
  return last;
}

async function fetchPackingGroupItems(opts: {
  inboundPlanId: string;
  packingGroupId: string;
  awsRegion: string;
  host: string;
  accessKey: string;
  secretKey: string;
  sessionToken?: string | null;
  lwaToken: string;
  traceId: string;
  marketplaceId: string;
  sellerId: string;
}) {
  const basePath = "/inbound/fba/2024-03-20";
  const res = await signedFetchWithRetry({
    method: "GET",
    service: "execute-api",
    region: opts.awsRegion,
    host: opts.host,
    path: `${basePath}/inboundPlans/${encodeURIComponent(opts.inboundPlanId)}/packingGroups/${encodeURIComponent(
      opts.packingGroupId
    )}/items`,
    query: "",
    payload: "",
    accessKey: opts.accessKey,
    secretKey: opts.secretKey,
    sessionToken: opts.sessionToken,
    lwaToken: opts.lwaToken,
    traceId: opts.traceId,
    operationName: "inbound.v20240320.listPackingGroupItems",
    marketplaceId: opts.marketplaceId,
    sellerId: opts.sellerId
  });

  if (!res?.res?.ok) {
    // Gracefully handle deleted/missing packing groups (400) by returning empty.
    const msg = res?.text || "";
    const status = res?.res?.status || "unknown";
    if (status === 400 && msg.includes("packing group does not exist")) {
      return [];
    }
    throw new Error(`listPackingGroupItems failed (${status}): ${msg}`);
  }
  const items = (res?.json?.items || res?.json?.payload?.items || []) as any[];
  return Array.isArray(items) ? items : [];
}

async function attachExpectedItemsToPackingGroups(opts: {
  inboundPlanId: string;
  packingGroups: any[];
  awsRegion: string;
  host: string;
  accessKey: string;
  secretKey: string;
  sessionToken?: string | null;
  lwaToken: string;
  traceId: string;
  marketplaceId: string;
  sellerId: string;
}) {
  const groups = Array.isArray(opts.packingGroups) ? opts.packingGroups : [];
  const ids = Array.from(
    new Set(
      groups
        .map((g: any) => g?.packingGroupId || g?.packing_group_id || g?.id || g?.groupId || null)
        .filter((id: string | null) => id && !String(id).toLowerCase().startsWith("fallback-"))
        .map((id: string) => String(id))
    )
  );

  const expectedByGroup = new Map<string, any[]>();
  await Promise.all(
    ids.map(async (packingGroupId) => {
      const items = await fetchPackingGroupItems({
        inboundPlanId: opts.inboundPlanId,
        packingGroupId,
        awsRegion: opts.awsRegion,
        host: opts.host,
        accessKey: opts.accessKey,
        secretKey: opts.secretKey,
        sessionToken: opts.sessionToken,
        lwaToken: opts.lwaToken,
        traceId: opts.traceId,
        marketplaceId: opts.marketplaceId,
        sellerId: opts.sellerId
      });
      expectedByGroup.set(packingGroupId, items);
    })
  );

  return groups.map((g: any) => {
    const id = g?.packingGroupId || g?.packing_group_id || g?.id || g?.groupId || null;
    if (!id) return g;
    return { ...g, expectedItems: expectedByGroup.get(String(id)) || [] };
  });
}

serve(async (req) => {
  const traceId = crypto.randomUUID();
  const origin = req.headers.get("origin") || "*";
  const corsHeaders = {
    ...baseCorsHeaders,
    "Access-Control-Allow-Origin": origin,
    ...(origin !== "*" ? { Vary: "Origin" } : {})
  };

  // Log immediately so OPTIONS / early failures still show up in Supabase logs
  console.log(
    JSON.stringify(
      {
        tag: "fba-set-packing-information:incoming",
        traceId,
        method: req.method,
        url: req.url,
        origin,
        contentType: req.headers.get("content-type") || null,
        hasAuth: !!req.headers.get("authorization"),
        timestamp: new Date().toISOString()
      },
      null,
      2
    )
  );

  if (req.method === "OPTIONS") {
    console.log(JSON.stringify({ tag: "fba-set-packing-information:options", traceId }, null, 2));
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    console.log(JSON.stringify({ tag: "fba-set-packing-information:method_not_allowed", traceId, method: req.method }, null, 2));
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
      console.log(
        JSON.stringify(
          { tag: "fba-set-packing-information:unauthorized", traceId, reason: "missing_bearer", headers: maskHeaders(req.headers) },
          null,
          2
        )
      );
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    const incomingToken = authHeader.slice("bearer ".length).trim();
    const isServiceRoleToken = !!incomingToken && incomingToken === SUPABASE_SERVICE_ROLE_KEY;
    const bypassAuth = isServiceRoleToken; // nu mai permitem bypass cu ANON KEY

    let user: any = null;
    let userCompanyId: string | null = null;
    let userIsAdmin = false;

    if (bypassAuth) {
      user = { id: "service-role" };
      userIsAdmin = true;
      console.log(
        JSON.stringify(
          {
            tag: "fba-set-packing-information:auth-bypass",
            traceId,
            reason: "service_role_token"
          },
          null,
          2
        )
      );
    } else {
      const authSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: authData, error: authErr } = await authSupabase.auth.getUser();
      user = authData?.user ?? null;
      if (authErr || !user) {
        console.log(
          JSON.stringify(
            {
              tag: "fba-set-packing-information:unauthorized",
              traceId,
              reason: authErr ? "auth_error" : "no_user",
              error: authErr || null
            },
            null,
            2
          )
        );
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
      userCompanyId = profileRow?.company_id || null;
      userIsAdmin = Boolean(profileRow?.is_admin);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch (err) {
      console.log(
        JSON.stringify(
          { tag: "fba-set-packing-information:body-parse-error", traceId, error: String(err) },
          null,
          2
        )
      );
    }
    console.log(
      JSON.stringify(
        {
          tag: "fba-set-packing-information:body",
          traceId,
          keys: Object.keys(body || {}),
          inbound_plan_id: body?.inbound_plan_id ?? body?.inboundPlanId ?? null,
          packing_option_id: body?.packing_option_id ?? body?.packingOptionId ?? null,
          packing_groups_count: Array.isArray(body?.packing_groups)
            ? body.packing_groups.length
            : Array.isArray(body?.packingGroups)
            ? body.packingGroups.length
            : 0,
          timestamp: new Date().toISOString()
        },
        null,
        2
      )
    );
    const requestId = body?.request_id ?? body?.requestId;
    const inboundPlanId = body?.inbound_plan_id ?? body?.inboundPlanId;
    let packingOptionId = body?.packing_option_id ?? body?.packingOptionId ?? null;
    const generatePlacementOptions =
      body?.generate_placement_options ?? body?.generatePlacementOptions ?? true;
    const packingGroupsInput =
      (Array.isArray(body?.packing_groups) && body.packing_groups) ||
      (Array.isArray(body?.packingGroups) && body.packingGroups) ||
      [];
    const packingGroupsSummary = Array.isArray(packingGroupsInput)
      ? packingGroupsInput.map((g: any) => ({
          packingGroupId: g?.packingGroupId || g?.id || g?.groupId || null,
          boxes: g?.boxes ?? g?.boxCount ?? null,
          packMode: g?.packMode || g?.pack_mode || null,
          contentInformationSource: g?.contentInformationSource || g?.content_information_source || null,
          hasDimensions: !!(g?.dimensions || g?.boxDimensions),
          hasWeight: !!(g?.weight || g?.boxWeight),
          perBoxDetailsCount: Array.isArray(g?.perBoxDetails || g?.per_box_details)
            ? (g?.perBoxDetails || g?.per_box_details).length
            : 0,
          perBoxItemsCount: Array.isArray(g?.perBoxItems || g?.per_box_items)
            ? (g?.perBoxItems || g?.per_box_items).length
            : 0
        }))
      : [];
    let directGroupings = Array.isArray(body?.packageGroupings) ? body.packageGroupings : [];
    let packageGroupings: any[] = [];
    if (!requestId || !inboundPlanId) {
      return new Response(JSON.stringify({ error: "request_id și inbound_plan_id sunt necesare", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    if (!packingOptionId) {
      return new Response(JSON.stringify({ error: "packing_option_id este necesar (confirmă packing option înainte de setPackingInformation)", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }


    const { data: reqData, error: reqErr } = await supabase
      .from("prep_requests")
      .select("id, destination_country, company_id, user_id, amazon_snapshot")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!reqData) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    const snapshotPackingGroups =
      (reqData as any)?.amazon_snapshot?.fba_inbound?.packingGroups ||
      (reqData as any)?.amazon_snapshot?.packingGroups ||
      [];
    const mergePackingGroups = (primary: any[], fallback: any[]) => {
      const seen = new Set(
        (primary || [])
          .map((g: any) => g?.packingGroupId || g?.id || g?.groupId || null)
          .filter(Boolean)
      );
      const merged = [...(primary || [])];
      (fallback || []).forEach((g: any) => {
        const id = g?.packingGroupId || g?.id || g?.groupId || null;
        if (!id || seen.has(id)) return;
        seen.add(id);
        merged.push(g);
      });
      return merged;
    };
    let mergedPackingGroupsInput = mergePackingGroups(packingGroupsInput, snapshotPackingGroups);
    const mergedPackingGroupsSummary = Array.isArray(mergedPackingGroupsInput)
      ? mergedPackingGroupsInput.map((g: any) => ({
          packingGroupId: g?.packingGroupId || g?.id || g?.groupId || null,
          boxes: g?.boxes ?? g?.boxCount ?? null,
          packMode: g?.packMode || g?.pack_mode || null,
          contentInformationSource: g?.contentInformationSource || g?.content_information_source || null,
          hasDimensions: !!(g?.dimensions || g?.boxDimensions),
          hasWeight: !!(g?.weight || g?.boxWeight),
          perBoxDetailsCount: Array.isArray(g?.perBoxDetails || g?.per_box_details)
            ? (g?.perBoxDetails || g?.per_box_details).length
            : 0,
          perBoxItemsCount: Array.isArray(g?.perBoxItems || g?.per_box_items)
            ? (g?.perBoxItems || g?.per_box_items).length
            : 0
        }))
      : [];

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

    // Fetch Amazon integration
    const amazonIntegrationIdInput = body?.amazon_integration_id ?? body?.amazonIntegrationId;
    const marketplaceOverride = body?.marketplace_id ?? body?.marketplaceId ?? null;
    const destCountry = (reqData.destination_country || "").toUpperCase();
    const inferredMarketplace = marketplaceByCountry[destCountry] || null;
    let integ: AmazonIntegration | null = null;
    if (amazonIntegrationIdInput) {
      const { data: integRowById } = await supabase
        .from("amazon_integrations")
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("id", amazonIntegrationIdInput)
        .eq("status", "active")
        .maybeSingle();
      if (integRowById) integ = integRowById as any;
    }
    if (!integ && (marketplaceOverride || inferredMarketplace)) {
      const { data: integRows } = await supabase
        .from("amazon_integrations")
        .select("id, refresh_token, marketplace_id, region, updated_at, selling_partner_id, status")
        .eq("company_id", reqData.company_id)
        .eq("status", "active")
        .eq("marketplace_id", marketplaceOverride || inferredMarketplace)
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
    const marketplaceId = marketplaceOverride || inferredMarketplace || integ.marketplace_id || "A13V1IB3VIYZZH";
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

    // Persist user-entered packing groups (dims/weight) so we can rehydrate later
    try {
      const currentSnap = (reqData as any)?.amazon_snapshot || {};
      const packedGroupsForSnapshot = (mergedPackingGroupsInput || []).map((g: any) => ({
        packingGroupId: g?.packingGroupId || g?.id || g?.groupId || null,
        boxDimensions: g?.dimensions || g?.boxDimensions || null,
        boxWeight: g?.weight || g?.boxWeight || null,
        boxes: g?.boxes ?? g?.boxCount ?? 1,
        packMode: g?.packMode || null,
        items: Array.isArray(g?.items) ? g.items : [],
        perBoxDetails: Array.isArray(g?.perBoxDetails)
          ? g.perBoxDetails
          : Array.isArray(g?.per_box_details)
          ? g.per_box_details
          : [],
        perBoxItems: Array.isArray(g?.perBoxItems)
          ? g.perBoxItems
          : Array.isArray(g?.per_box_items)
          ? g.per_box_items
          : [],
        contentInformationSource: g?.contentInformationSource || g?.content_information_source || null
      }));
      const nextSnapshot = {
        ...(currentSnap || {}),
        fba_inbound: {
          ...(currentSnap?.fba_inbound || {}),
          inboundPlanId,
          packingOptionId,
          placementOptionId: body?.placement_option_id ?? body?.placementOptionId ?? null,
          packingGroups: packedGroupsForSnapshot,
          savedAt: new Date().toISOString()
        }
      };
      await supabase.from("prep_requests").update({ amazon_snapshot: nextSnapshot }).eq("id", requestId);
    } catch (persistSnapErr) {
      console.error("persist packing groups snapshot failed", { traceId, error: persistSnapErr });
    }

    const tempCreds = await assumeRole(SPAPI_ROLE_ARN);
    const lwaAccessToken = await getLwaAccessToken(refreshToken);
    const basePath = "/inbound/fba/2024-03-20";
    const listPackingOptionsWithRetry = async (attempts = 3) => {
      let last: Awaited<ReturnType<typeof signedFetch>> | null = null;
      for (let i = 1; i <= attempts; i++) {
        last = await signedFetch({
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
        });
        const options =
          last?.json?.payload?.packingOptions ||
          last?.json?.packingOptions ||
          [];
        if (Array.isArray(options) && options.length) return { last, options };
        await delay(200 * i);
      }
      return { last, options: [] as any[] };
    };
    const normalizePackingOptionId = (opt: any) => opt?.packingOptionId || opt?.id || null;
    const normalizeStatus = (opt: any) => String(opt?.status || opt?.Status || "").toUpperCase();
    let autoSwitchedPackingOption = false;
    let acceptedPackingGroups: any[] = [];
    try {
      const { options } = await listPackingOptionsWithRetry();
      const accepted = (options || []).find((opt: any) => normalizeStatus(opt) === "ACCEPTED");
      if (accepted && normalizePackingOptionId(accepted) && normalizePackingOptionId(accepted) !== packingOptionId) {
        // Auto-switch to the accepted packing option from Amazon to avoid blocking.
        packingOptionId = normalizePackingOptionId(accepted);
        acceptedPackingGroups = Array.isArray(accepted?.packingGroups) ? accepted.packingGroups.filter(Boolean) : [];
        autoSwitchedPackingOption = true;
      }
      const chosen = (options || []).find((opt: any) => normalizePackingOptionId(opt) === packingOptionId);
      const groups = Array.isArray(chosen?.packingGroups) ? chosen.packingGroups.filter(Boolean) : [];
      const expectedGroups = groups;
      if (groups.length) {
        const providedSource = directGroupings.length ? directGroupings : mergedPackingGroupsInput;
        const providedIds = (providedSource || [])
          .map((g: any) => g?.packingGroupId || g?.packing_group_id || g?.id || g?.groupId || null)
          .filter(Boolean);
        const missingIds = groups.filter((id: any) => !providedIds.includes(id));
        const extraIds = providedIds.filter((id: any) => !groups.includes(id));
        if (missingIds.length || extraIds.length) {
          // Dacă avem acceptedPackingGroups (auto-switch), injectăm grupurile lipsă cu doar ID.
          if (autoSwitchedPackingOption && missingIds.length) {
            missingIds.forEach((id: any) => {
              mergedPackingGroupsInput.push({ packingGroupId: id });
            });
          } else if (expectedGroups.length) {
            // Rescriem IDs după ordinea Amazon pentru a evita 400.
            mergedPackingGroupsInput.forEach((g: any, idx: number) => {
              if (!g) return;
              const expectedId = expectedGroups[idx] || expectedGroups[0];
              if (expectedId) g.packingGroupId = expectedId;
            });
            if (!mergedPackingGroupsInput.length) {
              mergedPackingGroupsInput.push({ packingGroupId: expectedGroups[0] });
            }
          } else {
            return new Response(
              JSON.stringify({
                error:
                  "Packing groups incomplete. Amazon requires packageGroupings for all packingGroupId values in the selected packingOption.",
                code: "PACKING_GROUPS_INCOMPLETE",
                traceId,
                expectedPackingGroupIds: groups,
                missingPackingGroupIds: missingIds,
                extraPackingGroupIds: extraIds
              }),
              { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
            );
          }
        }

        // Aliniază explicit grupurile locale la lista Amazon (ordine + eliminare extra) ca să evităm 400 BadRequest.
        const normalizePgId = (g: any) => g?.packingGroupId || g?.packing_group_id || g?.id || g?.groupId || null;
        const alignToExpectedIds = (list: any[]) => {
          const normalized = (Array.isArray(list) ? list : []).map((g: any) => ({
            ...g,
            packingGroupId: normalizePgId(g)
          }));
          const byId = new Map<string, any>();
          normalized.forEach((g: any) => {
            if (g?.packingGroupId) byId.set(String(g.packingGroupId), g);
          });
          const fallbackList = normalized.filter(Boolean);
          return expectedGroups.map((expectedId: any, idx: number) => {
            const id = String(expectedId);
            const byIdMatch = byId.get(id);
            if (byIdMatch) return { ...byIdMatch, packingGroupId: id };
            const fallback = fallbackList[idx] || fallbackList[0] || {};
            return { ...fallback, packingGroupId: id };
          });
        };

        mergedPackingGroupsInput = alignToExpectedIds(mergedPackingGroupsInput);
        if (directGroupings.length) {
          directGroupings = alignToExpectedIds(directGroupings);
        }
      }
    } catch (err) {
      console.warn("packing options validation skipped", { traceId, error: err });
    }

    if (directGroupings.length) {
      packageGroupings = directGroupings;
    } else {
      try {
        const hydratedGroups = await attachExpectedItemsToPackingGroups({
          inboundPlanId,
          packingGroups: mergedPackingGroupsInput,
          awsRegion,
          host,
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          marketplaceId,
          sellerId
        });
        packageGroupings = buildPackageGroupingsFromPackingGroups(hydratedGroups);
      } catch (err) {
        console.error("fetch packing group items failed", { traceId, error: err });
        return new Response(
          JSON.stringify({
            error: "Nu am putut citi packing group items din Amazon. Reincearca in cateva secunde.",
            traceId
          }),
          { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }
    if (!packageGroupings.length && mergedPackingGroupsInput.length) {
      // Fallback: construim packageGroupings minimale din packingGroups (dims/weight) chiar dacă items lipsesc,
      // ca să nu blocăm pe eroarea generică 400.
      packageGroupings = mergedPackingGroupsInput
        .map((g: any) => {
          const packingGroupId = g?.packingGroupId || g?.id || g?.groupId || null;
          if (!packingGroupId) return null;
          const dims = normalizeDimensions(g?.dimensions || g?.boxDimensions);
          const weight = normalizeWeight(g?.weight || g?.boxWeight);
          if (!dims || !weight) return null;
          const items = Array.isArray(g?.items) ? g.items.map(normalizeItem).filter(Boolean) : [];
          const quantity = Math.max(1, Number(g?.boxes || g?.boxCount || 1) || 1);
          const contentInformationSource = items.length ? "BOX_CONTENT_PROVIDED" : "MANUAL_PROCESS";
          return {
            packingGroupId,
            boxes: [
              {
                quantity,
                contentInformationSource,
                ...(items.length ? { items } : {}),
                dimensions: dims,
                weight
              }
            ]
          };
        })
        .filter(Boolean);
    }

    if (!packageGroupings.length) {
      return new Response(
        JSON.stringify({
          error:
            "Nu am putut construi packageGroupings valide. Trimite packingGroups (cu dims/weight) din Step1b sau trimite direct packageGroupings în format SP-API.",
          traceId,
          debug: {
            packingGroupsSummary: mergedPackingGroupsSummary
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" }
        }
      );
    }

    // Validare minimă pe schema reală: packageGroupings[].boxes[].dimensions.unitOfMeasurement + weight.unit/value
    const invalidGrouping = packageGroupings.find((g: any) => {
      if (!g?.packingGroupId) return true;
      if (!Array.isArray(g?.boxes) || !g.boxes.length) return true;
      return g.boxes.some((b: any) => {
        const d = b?.dimensions || {};
        const w = b?.weight || {};
        const uom = d?.unitOfMeasurement;
        if (!(Number(d.length) > 0 && Number(d.width) > 0 && Number(d.height) > 0)) return true;
        if (!(typeof uom === "string" && uom.length)) return true;
        if (!(Number(w.value) > 0 && typeof w.unit === "string" && w.unit.length)) return true;
        if (!(Number(b?.quantity) > 0)) return true;
        if (b?.contentInformationSource === "BOX_CONTENT_PROVIDED") {
          if (!Array.isArray(b?.items) || !b.items.length) return true;
          const badContent = b.items.some((c: any) => !(c?.msku && Number(c?.quantity) > 0));
          if (badContent) return true;
        } else {
          if (Array.isArray(b?.items) && b.items.length) return true;
        }
        return false;
      });
    });
    if (invalidGrouping) {
      return new Response(JSON.stringify({ error: "packageGroupings are invalid (missing boxes dimensions/weight/items)", traceId }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Server-side guard: payload quantities must match confirmed quantities from DB
    const { data: dbItems, error: dbItemsErr } = await supabase
      .from("prep_request_items")
      .select("sku, units_sent, units_requested")
      .eq("prep_request_id", requestId);

    if (dbItemsErr) {
      return new Response(JSON.stringify({ error: "Unable to load confirmed quantities", traceId }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    const confirmed: Record<string, number> = {};
    (dbItems || []).forEach((it: any) => {
      const sku = String(it?.sku || "").trim();
      if (!sku) return;
      confirmed[sku] = Number(it.units_sent ?? it.units_requested ?? 0) || 0;
    });

    const summed: Record<string, number> = {};
    (packageGroupings || []).forEach((g: any) => {
      (g?.boxes || []).forEach((b: any) => {
        if (b?.contentInformationSource !== "BOX_CONTENT_PROVIDED") return;
        (b?.items || []).forEach((it: any) => {
          const sku = String(it?.msku || "").trim();
          const q = Number(it?.quantity || 0) || 0;
          if (!sku || q <= 0) return;
          const boxQty = Number(b?.quantity || 1) || 1;
          summed[sku] = (summed[sku] || 0) + q * boxQty;
        });
      });
    });

    const computeMismatches = () =>
      Object.keys(confirmed)
        .map((sku) => {
          const c = Number(confirmed[sku] || 0) || 0;
          const p = Number(summed[sku] || 0) || 0;
          return { sku, confirmed: c, payload: p, delta: p - c };
        })
        .filter((r) => r.delta !== 0);

    let mismatches = computeMismatches();
    const extraSkus = Object.keys(summed).filter((sku) => !(sku in confirmed));

    // Auto-fix simple duplication cases (all payloads share the same integer multiplier vs confirmed).
    if (mismatches.length && !extraSkus.length) {
      const deltas = mismatches.filter((m) => m.confirmed > 0 && m.payload > 0 && m.payload % m.confirmed === 0);
      if (deltas.length === mismatches.length) {
        const factors = new Set(deltas.map((m) => m.payload / m.confirmed));
        if (factors.size === 1) {
          const factor = [...factors][0];
          if (factor > 1) {
            // Apply scaling only if every item quantity is divisible by factor (to avoid frac quantities).
            const quantities = (packageGroupings || [])
              .flatMap((g: any) => (g?.boxes || []).flatMap((b: any) => (b?.items || []).map((it: any) => Number(it?.quantity || 0))));
            const allDivisible = quantities.every((q) => Number.isFinite(q) && (q * 1000) % (factor * 1000) === 0);
            if (allDivisible) {
              packageGroupings = packageGroupings.map((g: any) => {
                const boxes = (g?.boxes || []).map((b: any) => {
                  const items = Array.isArray(b?.items)
                    ? b.items.map((it: any) => ({
                        ...it,
                        quantity: Number(it?.quantity || 0) / factor
                      }))
                    : b?.items;
                  return { ...b, items };
                });
                return { ...g, boxes };
              });

              // recompute summed after scaling
              const newSummed: Record<string, number> = {};
              (packageGroupings || []).forEach((g: any) => {
                (g?.boxes || []).forEach((b: any) => {
                  if (b?.contentInformationSource !== "BOX_CONTENT_PROVIDED") return;
                  (b?.items || []).forEach((it: any) => {
                    const sku = String(it?.msku || "").trim();
                    const q = Number(it?.quantity || 0) || 0;
                    if (!sku || q <= 0) return;
                    const boxQty = Number(b?.quantity || 1) || 1;
                    newSummed[sku] = (newSummed[sku] || 0) + q * boxQty;
                  });
                });
              });
              Object.assign(summed, newSummed);
              mismatches = computeMismatches();
            }
          }
        }
      }
    }

    if (mismatches.length || extraSkus.length) {
      return new Response(
        JSON.stringify({
          error: "Packing quantities mismatch between confirmed inventory (Step 1) and packing payload (Step 1b).",
          code: "PACKING_QTY_MISMATCH",
          traceId,
          mismatches,
          extraSkus
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    console.log("set-packing payload-meta", {
      traceId,
      packageGroupingsCount: packageGroupings.length
    });
    const payload = JSON.stringify({ packageGroupings });

    const res = await signedFetchWithRetry({
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
      const status = res?.res?.status || null;
      const bodyText = res?.text || "";
      const placementAlreadyConfirmed =
        status === 400 &&
        bodyText.toLowerCase().includes("placement option is already confirmed");

      // dacă placement-ul este deja confirmat, Amazon nu mai permite setPackingInformation;
      if (placementAlreadyConfirmed) {
        console.log(
          JSON.stringify(
            {
              tag: "setPackingInformation_placement_already_confirmed",
              traceId,
              inboundPlanId,
              packingOptionId,
              status,
              bodyPreview: bodyText.slice(0, 300)
            },
            null,
            2
          )
        );
        return new Response(
          JSON.stringify({
            error: "Placement-ul este deja confirmat; Amazon nu permite setPackingInformation după confirmare.",
            code: "PLACEMENT_ALREADY_CONFIRMED",
            traceId,
            hint: "trimite packingInformation înainte de confirmarea placement-ului"
          }),
          { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          error: "SetPackingInformation failed",
          status,
          body: bodyText || null,
          traceId
        }),
        { status: 502, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // Așteptăm operația să se finalizeze și verificăm că boxele au fost atașate pe plan
    const opId =
      res?.json?.payload?.operationId ||
      res?.json?.operationId ||
      null;

    const pollOperationStatus = async (operationId: string) => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const statusRes = await signedFetchWithRetry({
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
          statusRes?.json?.payload?.state ||
          statusRes?.json?.payload?.operationStatus ||
          statusRes?.json?.state ||
          statusRes?.json?.operationStatus ||
          null;
        const stateUp = String(state || "").toUpperCase();
        if (["SUCCESS", "FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp) || statusRes?.res?.status >= 400) {
          return statusRes;
        }
        await delay(Math.min(600 * attempt, 3000));
      }
      return null;
    };

    if (opId) {
      const opStatus = await pollOperationStatus(opId);
      const opState =
        opStatus?.json?.payload?.state ||
        opStatus?.json?.payload?.operationStatus ||
        opStatus?.json?.state ||
        opStatus?.json?.operationStatus ||
        null;
      const opStateUp = String(opState || "").toUpperCase();
      if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(opStateUp) || opStatus?.res?.status >= 400) {
        const problems =
          opStatus?.json?.payload?.operationProblems ||
          opStatus?.json?.operationProblems ||
          [];
        return new Response(
          JSON.stringify({
            error: "SetPackingInformation failed at Amazon.",
            code: "PACKING_INFORMATION_FAILED",
            traceId,
            problems
          }),
          { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
    }

    const listBoxes = async () =>
      signedFetchWithRetry({
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

    const boxesRes = await listBoxes();
    const boxes =
      boxesRes?.json?.payload?.boxes ||
      boxesRes?.json?.boxes ||
      [];
    const boxesCount = Array.isArray(boxes) ? boxes.length : 0;
    console.log(
      JSON.stringify(
        {
          tag: "setPackingInformation_boxes",
          traceId,
          inboundPlanId,
          boxesCount,
          requestId: boxesRes?.requestId || null
        },
        null,
        2
      )
    );

    if (boxesCount === 0) {
      return new Response(
        JSON.stringify({
          code: "BOXES_NOT_READY",
          message: "Amazon nu a atașat încă boxele după setPackingInformation. Reîncearcă în câteva secunde.",
          traceId,
          retryAfterMs: 3000
        }),
        { status: 202, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    let placementOptionId: string | null = null;
    let placementOptions: any[] = [];

    if (generatePlacementOptions) {
      const genPlacement = await signedFetchWithRetry({
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
      if (opId) await pollOperationStatus(opId);

      const listPlacement = await signedFetchWithRetry({
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
      placementOptions =
        listPlacement?.json?.payload?.placementOptions ||
        listPlacement?.json?.placementOptions ||
        [];
      placementOptionId =
        placementOptions?.[0]?.placementOptionId ||
        placementOptions?.[0]?.id ||
        null;
    }

    // persist inbound/packing IDs (idempotent)
    try {
      await supabase
        .from("prep_requests")
        .update({
          inbound_plan_id: inboundPlanId,
          packing_option_id: packingOptionId,
          ...(placementOptionId ? { placement_option_id: placementOptionId } : {})
        })
        .eq("id", requestId);
    } catch (persistErr) {
      console.error("persist packing_option_id failed", { traceId, error: persistErr });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        placementOptionId,
        placementOptions,
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
