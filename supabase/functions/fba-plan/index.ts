// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

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
const WAREHOUSE_DE_NAME = Deno.env.get("WAREHOUSE_DE_NAME") || "";
const WAREHOUSE_DE_COMPANY = Deno.env.get("WAREHOUSE_DE_COMPANY") || "";
const WAREHOUSE_DE_ADDRESS_LINE1 = Deno.env.get("WAREHOUSE_DE_ADDRESS_LINE1") || "";
const WAREHOUSE_DE_ADDRESS_LINE2 = Deno.env.get("WAREHOUSE_DE_ADDRESS_LINE2") || "";
const WAREHOUSE_DE_CITY = Deno.env.get("WAREHOUSE_DE_CITY") || "";
const WAREHOUSE_DE_STATE = Deno.env.get("WAREHOUSE_DE_STATE") || "";
const WAREHOUSE_DE_POSTAL = Deno.env.get("WAREHOUSE_DE_POSTAL") || "";
const WAREHOUSE_DE_PHONE = Deno.env.get("WAREHOUSE_DE_PHONE") || "";
const WAREHOUSE_DE_EMAIL = Deno.env.get("WAREHOUSE_DE_EMAIL") || "";

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

function logStep(tag: string, payload: Record<string, unknown>) {
  try {
    console.log(JSON.stringify({ tag, ...payload, ts: new Date().toISOString() }));
  } catch {
    console.log(tag, payload);
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

function normalizeWarehouseCountry(input: any) {
  const raw = String(input || "").trim().toUpperCase();
  if (raw === "DE" || raw === "GERMANY" || raw === "DEU") return "DE";
  return "FR";
}

function buildWarehouseAddress(country: string, input?: any) {
  if (input && typeof input === "object") {
    return {
      name: input.name || input.contactName || input.person || "Prep Center",
      addressLine1: input.addressLine1 || input.address_line1 || input.line1 || "",
      addressLine2: input.addressLine2 || input.address_line2 || input.line2 || "",
      city: input.city || input.locality || "",
      stateOrProvinceCode: input.stateOrProvinceCode || input.state || input.region || "",
      postalCode: input.postalCode || input.zip || input.postcode || "",
      countryCode: (input.countryCode || input.country || country || "FR").toUpperCase(),
      phoneNumber: input.phoneNumber || input.phone || "",
      email: input.email || "",
      companyName: input.companyName || input.company || ""
    };
  }
  if (country === "DE") {
    const missing = [
      WAREHOUSE_DE_NAME,
      WAREHOUSE_DE_ADDRESS_LINE1,
      WAREHOUSE_DE_CITY,
      WAREHOUSE_DE_POSTAL,
      WAREHOUSE_DE_PHONE,
      WAREHOUSE_DE_EMAIL
    ].some((v) => !String(v || "").trim());
    if (missing) {
      // Fallback hardcoded, similar to FR behavior, to avoid blocking plan creation.
      return {
        name: "Radu Cenusa",
        addressLine1: "Zienestrasse 12",
        addressLine2: "",
        city: "Wolfach",
        stateOrProvinceCode: "BW",
        postalCode: "77709",
        countryCode: "DE",
        phoneNumber: "+49 176 24963618",
        email: "logistics.de@prep-center.eu",
        companyName: "EcomPrepHub"
      };
    }
    return {
      name: WAREHOUSE_DE_NAME,
      addressLine1: WAREHOUSE_DE_ADDRESS_LINE1,
      addressLine2: WAREHOUSE_DE_ADDRESS_LINE2 || "",
      city: WAREHOUSE_DE_CITY,
      stateOrProvinceCode: WAREHOUSE_DE_STATE || "",
      postalCode: WAREHOUSE_DE_POSTAL,
      countryCode: "DE",
      phoneNumber: WAREHOUSE_DE_PHONE,
      email: WAREHOUSE_DE_EMAIL,
      companyName: WAREHOUSE_DE_COMPANY || ""
    };
  }
  return {
    name: "Bucur Adrian",
    addressLine1: "5 Rue des Enclos",
    addressLine2: "Cellule 7",
    city: "La Gouesniere",
    stateOrProvinceCode: "35",
    postalCode: "35350",
    countryCode: "FR",
    phoneNumber: "+33675116218",
    email: "contact@prep-center.eu",
    companyName: "EcomPrep Hub"
  };
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

function deriveLabelOwner(prepInfo: any): OwnerVal {
  const barcodeInstruction = String(prepInfo?.barcodeInstruction || "").toUpperCase();
  const prepList: string[] = Array.isArray(prepInfo?.prepInstructions) ? prepInfo.prepInstructions : [];
  const hasItemLabeling = prepList.some((p) => String(p || "").toUpperCase().includes("LABEL"));
  if (barcodeInstruction.includes("CANUSEORIGINALBARCODE")) return "NONE";
  if (barcodeInstruction.includes("REQUIRESFNSKU") || hasItemLabeling) return "SELLER";
  if (prepInfo?.prepRequired) return "SELLER";
  if (isManufacturerBarcodeEligible(barcodeInstruction)) return "NONE";
  return "SELLER";
}

const KNOWN_PREP_TYPES = new Set([
  "ITEM_BLACK_SHRINKWRAP",
  "ITEM_BLANKSTK",
  "ITEM_BOXING",
  "ITEM_BUBBLEWRAP",
  "ITEM_CAP_SEALING",
  "ITEM_DEBUNDLE",
  "ITEM_HANG_GARMENT",
  "ITEM_LABELING",
  "ITEM_NO_PREP",
  "ITEM_POLYBAGGING",
  "ITEM_RMOVHANG",
  "ITEM_SETCREAT",
  "ITEM_SETSTK",
  "ITEM_SIOC",
  "ITEM_SUFFOSTK",
  "ITEM_TAPING"
]);

const KNOWN_PREP_CATEGORIES = new Set([
  "ADULT",
  "BABY",
  "FC_PROVIDED",
  "FRAGILE",
  "GRANULAR",
  "HANGER",
  "LIQUID",
  "PERFORATED",
  "SET",
  "SHARP",
  "SMALL",
  "TEXTILE",
  "UNKNOWN",
  "NONE"
]);

function normalizeToken(v: string | null | undefined) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function toInboundPrepType(value: string | null | undefined): string | null {
  const raw = String(value || "").trim().toUpperCase();
  if (KNOWN_PREP_TYPES.has(raw)) return raw;
  const token = normalizeToken(value);
  if (!token) return null;
  const aliases: Record<string, string> = {
    LABELING: "ITEM_LABELING",
    ITEMLABELING: "ITEM_LABELING",
    NOPREP: "ITEM_NO_PREP",
    ITEMNOPREP: "ITEM_NO_PREP",
    NOADDITIONALPREPREQUIRED: "ITEM_NO_PREP",
    POLYBAGGING: "ITEM_POLYBAGGING",
    ITEMPOLYBAGGING: "ITEM_POLYBAGGING",
    BUBBLEWRAP: "ITEM_BUBBLEWRAP",
    ITEMBUBBLEWRAP: "ITEM_BUBBLEWRAP",
    TAPING: "ITEM_TAPING",
    ITEMTAPING: "ITEM_TAPING",
    HANGGARMENT: "ITEM_HANG_GARMENT",
    ITEMHANGGARMENT: "ITEM_HANG_GARMENT",
    RMOVHANG: "ITEM_RMOVHANG",
    ITEMRMOVHANG: "ITEM_RMOVHANG",
    BOXING: "ITEM_BOXING",
    ITEMBOXING: "ITEM_BOXING",
    CAPSEALING: "ITEM_CAP_SEALING",
    ITEMCAPSEALING: "ITEM_CAP_SEALING",
    DEBUNDLE: "ITEM_DEBUNDLE",
    ITEMDEBUNDLE: "ITEM_DEBUNDLE",
    BLACKSHRINKWRAP: "ITEM_BLACK_SHRINKWRAP",
    ITEMBLACKSHRINKWRAP: "ITEM_BLACK_SHRINKWRAP",
    SUFFOSTK: "ITEM_SUFFOSTK",
    ITEMSUFFOSTK: "ITEM_SUFFOSTK",
    SETCREAT: "ITEM_SETCREAT",
    ITEMSETCREAT: "ITEM_SETCREAT",
    SETSTK: "ITEM_SETSTK",
    ITEMSETSTK: "ITEM_SETSTK",
    SIOC: "ITEM_SIOC",
    ITEMSIOC: "ITEM_SIOC"
  };
  return aliases[token] || null;
}

function extractPrepClassificationSkus(operationProblems: any[]): string[] {
  const out = new Set<string>();
  for (const p of Array.isArray(operationProblems) ? operationProblems : []) {
    const code = String(p?.code || "").toUpperCase();
    const msg = String(p?.message || "");
    const details = String(p?.details || "");
    const combined = `${msg} ${details}`;
    if (code !== "FBA_INB_0182" && !combined.toUpperCase().includes("PREP CLASSIFICATION")) continue;
    const resourceMatch = combined.match(/resource\s+'([^']+)'/i);
    if (resourceMatch?.[1]) {
      out.add(normalizeSku(resourceMatch[1]));
      continue;
    }
    const skuMatch = combined.match(/SKU\s*[:=]\s*([A-Za-z0-9._\- ]+)/i);
    if (skuMatch?.[1]) {
      out.add(normalizeSku(skuMatch[1]));
    }
  }
  return Array.from(out).filter(Boolean);
}

function isUnresolvedPrepCategory(value: string | null | undefined): boolean {
  const cat = String(value || "").toUpperCase().trim();
  if (!cat) return true;
  if (!KNOWN_PREP_CATEGORIES.has(cat)) return true;
  return cat === "UNKNOWN" || cat === "FC_PROVIDED";
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
  // Amazon errors can include SKUs with spaces (e.g. "Fakhar noir 5ml").
  // Capture everything between "ERROR:" and the known phrase that follows the SKU.
  const m =
    msg.match(/ERROR:\s*(.+?)\s+(?:does not require|requires)\s+/i) ||
    msg.match(/ERROR:\s*(.+?)\s+not found/i) ||
    msg.match(/ERROR:\s*(.+?)\s+is not available/i);
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

function isLockId(val: string | null | undefined): boolean {
  return typeof val === "string" && val.startsWith("LOCK-");
}

// Normalize inboundPlanId: drop LOCK placeholders and overly long ids that SP-API respinge (max 38 chars).
function sanitizeInboundPlanId(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = String(val);
  if (isLockId(s)) return null;
  if (s.length > 38) return null;
  return s;
}

async function resetInvalidInboundPlanId(params: {
  inboundPlanId: string | null;
  requestId: string;
}) {
  const { inboundPlanId, requestId } = params;
  if (!inboundPlanId) return;
  await supabase
    .from("prep_requests")
    .update({ inbound_plan_id: null })
    .eq("id", requestId)
    .eq("inbound_plan_id", inboundPlanId);
}

function extractInboundUnavailableSkus(primary: { json: any; text: string }): string[] {
  const collect = (obj: any) => {
    const errs = obj?.errors || obj?.payload?.errors || [];
    if (!Array.isArray(errs)) return [];
    const skus: string[] = [];
    for (const e of errs) {
      const msg = String(e?.message || "");
      if (!msg.toLowerCase().includes("not available for inbound")) continue;
      const match = msg.match(/MSKUs:\s*\[([^\]]+)\]/i);
      if (match && match[1]) {
        match[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((sku) => skus.push(normalizeSku(sku)));
      }
    }
    return skus;
  };

  const fromJson = collect(primary.json);
  if (fromJson.length) return fromJson;

  if (primary.text) {
    try {
      const parsed = JSON.parse(primary.text);
      return collect(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function extractSkuErrorReasons(primary: { json: any; text: string }): Record<string, string> {
  const collect = (obj: any) => {
    const errs = obj?.errors || obj?.payload?.errors || [];
    if (!Array.isArray(errs)) return {};
    const out: Record<string, string> = {};
    for (const e of errs) {
      const msg = String(e?.message || e?.Message || "");
      if (!msg) continue;
      // Example: "ERROR: The following MSKUs are not valid: [SKU1, SKU2]."
      const match = msg.match(/MSKUs?[^\[]*\[([^\]]+)\]/i);
      if (!match || !match[1]) continue;
      match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((sku) => {
          out[normalizeSku(sku)] = msg;
        });
    }
    return out;
  };

  const fromJson = collect(primary.json);
  if (Object.keys(fromJson).length) return fromJson;

  if (primary.text) {
    try {
      const parsed = JSON.parse(primary.text);
      return collect(parsed);
    } catch {
      return {};
    }
  }
  return {};
}

function extractSkuErrorReasonsFromOperationProblems(operationProblems: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of Array.isArray(operationProblems) ? operationProblems : []) {
    const msg = String(p?.message || p?.Message || "").trim();
    const details = String(p?.details || p?.Details || "").trim();
    const combined = `${msg} ${details}`.trim();
    if (!combined) continue;

    const resourceMatch = combined.match(/resource\s+'([^']+)'/i);
    if (resourceMatch?.[1]) {
      const sku = normalizeSku(resourceMatch[1]);
      if (sku) out[sku] = msg || details || "Amazon reported an issue for this SKU.";
      continue;
    }

    const skuMatch = combined.match(/\bSKU\s*[:=]\s*([A-Za-z0-9._\- ]+)/i);
    if (skuMatch?.[1]) {
      const sku = normalizeSku(skuMatch[1]);
      if (sku) out[sku] = msg || details || "Amazon reported an issue for this SKU.";
    }
  }
  return out;
}

function parseRequiredProductAttrsBySku(operationProblems: any[]): Record<string, { needsDimensions: boolean; needsWeight: boolean }> {
  const out: Record<string, { needsDimensions: boolean; needsWeight: boolean }> = {};
  for (const p of Array.isArray(operationProblems) ? operationProblems : []) {
    const code = String(p?.code || "").toUpperCase();
    const msg = String(p?.message || "").toLowerCase();
    const details = String(p?.details || "").toLowerCase();
    const combined = `${msg} ${details}`;
    const resourceMatch = String(p?.details || "").match(/resource\s+'([^']+)'/i);
    const sku = normalizeSku(resourceMatch?.[1] || "");
    if (!sku) continue;
    const needsDimensions = code === "FBA_INB_0004" || combined.includes("dimensions need to be provided");
    const needsWeight = code === "FBA_INB_0005" || combined.includes("weight need to be provided");
    if (!needsDimensions && !needsWeight) continue;
    const cur = out[sku] || { needsDimensions: false, needsWeight: false };
    cur.needsDimensions = cur.needsDimensions || needsDimensions;
    cur.needsWeight = cur.needsWeight || needsWeight;
    out[sku] = cur;
  }
  return out;
}

function parsePrepTypeListBlock(raw: string): string[][] {
  const out: string[][] = [];
  const block = String(raw || "");
  const matches = block.matchAll(/\[([A-Z0-9_,\s-]+)\]/g);
  for (const m of matches) {
    const content = String(m?.[1] || "").trim();
    if (!content) continue;
    const list = content
      .split(",")
      .map((token) => toInboundPrepType(token.trim()))
      .filter((token): token is string => !!token);
    if (list.length) out.push(Array.from(new Set(list)));
  }
  return out;
}

function extractExpectedPrepTypesBySku(primary: { json: any; text: string }): Record<string, string[]> {
  const collect = (obj: any) => {
    const errs = obj?.errors || obj?.payload?.errors || [];
    if (!Array.isArray(errs)) return {};
    const out: Record<string, string[]> = {};
    for (const e of errs) {
      const msg = String(e?.message || e?.Message || "");
      if (!msg || !/Expected one of the following prep type lists:/i.test(msg)) continue;
      const skuMatch = msg.match(/msku\s*=\s*([^,\)]+)/i);
      const sku = normalizeSku(skuMatch?.[1] || "");
      if (!sku) continue;
      const listsMatch = msg.match(/Expected one of the following prep type lists:\s*(.+?)\s*for input/i);
      const parsedLists = parsePrepTypeListBlock(listsMatch?.[1] || "");
      if (!parsedLists.length) continue;
      out[sku] = parsedLists[0];
    }
    return out;
  };

  const fromJson = collect(primary.json);
  if (Object.keys(fromJson).length) return fromJson;

  if (primary.text) {
    try {
      const parsed = JSON.parse(primary.text);
      return collect(parsed);
    } catch {
      return {};
    }
  }
  return {};
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

function ownerFromConstraint(value: string | null | undefined): OwnerVal | null {
  const token = String(value || "").toUpperCase().trim();
  if (token === "NONE_ONLY") return "NONE";
  if (token === "SELLER_ONLY") return "SELLER";
  if (token === "AMAZON_ONLY") return "AMAZON";
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
const marketplaceNameById: Record<string, string> = {
  A13V1IB3VIYZZH: "France",
  A1PA6795UKMFR9: "Germany",
  A1RKKUPIHCS9HS: "Spain",
  APJ6JRA9NG5V4: "Italy",
  A1805IZSGTT6HS: "Netherlands",
  A2NODRKZP88ZB9: "Sweden",
  A1C3SOZRARQ6R3: "Poland",
  A1F83G8C2ARO7P: "United Kingdom",
  A2Q3Y263D00KWC: "Belgium"
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
  const cleanSku = normalizeSku(sku);
  if (!cleanSku) {
    return { state: "unknown", reason: "SKU lipsă sau nevalid după normalizare", canonicalSku: cleanSku };
  }
  const fallbackReason = "Nu am putut verifica statusul în Amazon";

  const skuCandidates = Array.from(
    new Set([cleanSku, cleanSku.toLowerCase(), cleanSku.toUpperCase()].map((v) => normalizeSku(v)).filter(Boolean))
  );
  const toStatusList = (val: any): string[] => {
    if (Array.isArray(val)) return val.map((v) => String(v || "").trim()).filter(Boolean);
    if (typeof val === "string") return val.split(",").map((v) => v.trim()).filter(Boolean);
    if (val != null) return [String(val).trim()].filter(Boolean);
    return [];
  };
  let canonicalSku = cleanSku;
  let canonicalFnsku: string | null = null;
  let sawNotFound = false;
  let non404ListingError: { status: number; text: string } | null = null;

  try {
    for (const candidateSku of skuCandidates) {
      const listingsPath = `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(candidateSku)}`;
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
        sawNotFound = true;
        continue;
      }
      if (!res.ok) {
        non404ListingError = { status: res.status, text };
        break;
      }

      canonicalSku = candidateSku;
      const summaries = json?.payload?.summaries || json?.summaries || [];
      let status = "";
      if (Array.isArray(summaries)) {
        const s = summaries.find((x: any) => String(x?.marketplaceId || x?.marketplace_id || "") === String(marketplaceId));
        status = String(s?.status || s?.Status || "");
        canonicalFnsku = String(s?.fnSku || s?.fnsku || s?.FNSKU || "").trim() || null;
      }

      const statusList = toStatusList(status).map((v) => v.toUpperCase());
      const hasBuyable = statusList.includes("BUYABLE") || statusList.includes("ACTIVE");
      const hasDiscoverable = statusList.includes("DISCOVERABLE");

      if (!Array.isArray(summaries) || summaries.length === 0) {
        return { state: "missing", reason: "Listing lipsă pe marketplace (summaries gol).", canonicalSku, fnsku: canonicalFnsku };
      }
      if (!statusList.length) {
        return { state: "missing", reason: "Listing lipsă pe marketplace (status absent).", canonicalSku, fnsku: canonicalFnsku };
      }
      if (hasBuyable) {
        return { state: "ok", reason: `Listing găsit cu status ${statusList.join(",")}`, canonicalSku, fnsku: canonicalFnsku };
      }
      if (hasDiscoverable) {
        return { state: "ok", reason: `Listing găsit cu status ${statusList.join(",")} (considerat eligibil)`, canonicalSku, fnsku: canonicalFnsku };
      }
      return { state: "inactive", reason: `Listing găsit cu status ${statusList.join(",")}`, canonicalSku, fnsku: canonicalFnsku };
    }

    if (sawNotFound && !non404ListingError) {
      return { state: "missing", reason: "Listing inexistent pe marketplace-ul destinație", canonicalSku: cleanSku, fnsku: null };
    }

    if (non404ListingError) {
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
        return {
          state: "ok",
          reason: `Catalog găsit; Listings API ${non404ListingError.status}`,
          canonicalSku: canonicalSku || cleanSku,
          fnsku: canonicalFnsku
        };
      }
      return {
        state: "unknown",
        reason: `Eroare Listings API (${non404ListingError.status}): ${non404ListingError.text}`,
        canonicalSku: canonicalSku || cleanSku,
        fnsku: canonicalFnsku
      };
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
      return { state: "ok", reason: `Catalog găsit; ${fallbackReason}`, canonicalSku: canonicalSku || cleanSku };
    }
    return {
      state: "unknown",
      reason: `${fallbackReason}: ${e instanceof Error ? e.message : e}`,
      canonicalSku: canonicalSku || cleanSku,
      fnsku: canonicalFnsku
    };
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
          return { state: "restricted", reason, canonicalSku: canonicalSku || cleanSku, fnsku: canonicalFnsku };
        }
      } else if (res.status !== 404) {
        // 404 can happen if endpoint unsupported; treat as best-effort
        return {
          state: "unknown",
          reason: `Eroare Restrictions API (${res.status}): ${text}`,
          canonicalSku: canonicalSku || cleanSku,
          fnsku: canonicalFnsku
        };
      }
    } catch (e) {
      // best-effort; non-blocking
      return {
        state: "unknown",
        reason: `${fallbackReason}: ${e instanceof Error ? e.message : e}`,
        canonicalSku: canonicalSku || cleanSku,
        fnsku: canonicalFnsku
      };
    }
  }

  return { state: "ok", reason: "", canonicalSku: canonicalSku || cleanSku, fnsku: canonicalFnsku };
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
  const skus = items.map((it) => normalizeSku(it.sku)).filter(Boolean) as string[];
  const asins = items.map((it) => normalizeSku(it.asin)).filter(Boolean) as string[];
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
    prep.json?.payload?.SKUPrepInstructionsList ||
    prep.json?.SKUPrepInstructionsList ||
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
    const guidanceToken = normalizeToken(guidance);
    const prepTokens = prepInstructions.map((p) => normalizeToken(p));
    const hasNonTrivialPrep = prepTokens.some((p) => {
      const t = toInboundPrepType(p);
      return t && t !== "ITEM_LABELING" && t !== "ITEM_NO_PREP";
    });
    const prepRequired =
      guidanceToken === "NOADDITIONALPREPREQUIRED"
        ? false
        : guidanceToken === "SEEPREPGUIDANCE"
        ? true
        : hasNonTrivialPrep;

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
    const requestId = typeof body?.request_id === "string" ? body.request_id.trim() : "";
    const expirationsInput = (body?.expirations as Record<string, string | undefined | null>) || {};
    const quantitiesByItemIdRaw = (body?.quantitiesByItemId as Record<string, unknown>) || {};
    const quantitiesByItemId: Record<string, number> = {};
    Object.entries(quantitiesByItemIdRaw).forEach(([k, v]) => {
      const key = String(k || "").trim();
      const num = Number(v);
      if (!key) return;
      if (!Number.isFinite(num) || num < 0) return;
      const qty = Math.floor(num);
      quantitiesByItemId[key] = qty;
    });
    const listingAttributesBySkuRaw = (body?.listingAttributesBySku as Record<string, any>) || {};
    const listingAttributesBySku: Record<
      string,
      { length_cm?: number | null; width_cm?: number | null; height_cm?: number | null; weight_kg?: number | null }
    > = {};
    Object.entries(listingAttributesBySkuRaw).forEach(([skuRaw, attrsRaw]) => {
      const sku = normalizeSku(skuRaw);
      if (!sku || !attrsRaw || typeof attrsRaw !== "object") return;
      const toPositive = (v: unknown) => {
        const num = Number(v);
        return Number.isFinite(num) && num > 0 ? num : null;
      };
      const next = {
        length_cm: toPositive(attrsRaw?.length_cm),
        width_cm: toPositive(attrsRaw?.width_cm),
        height_cm: toPositive(attrsRaw?.height_cm),
        weight_kg: toPositive(attrsRaw?.weight_kg)
      };
      if (next.length_cm || next.width_cm || next.height_cm || next.weight_kg) {
        listingAttributesBySku[sku] = next;
      }
    });
    const isUuid = /^[0-9a-fA-F-]{36}$/.test(requestId);
    if (!requestId || !isUuid) {
      return new Response(JSON.stringify({ error: "request_id is required and must be a UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }

    // Fetch prep request + items
    const { data: reqDataRaw, error: reqErr } = await supabase
      .from("prep_requests")
      .select(
        "id, destination_country, warehouse_country, company_id, user_id, inbound_plan_id, placement_option_id, packing_option_id, fba_shipment_id, amazon_snapshot, step1_box_plan, prep_request_items(id, asin, sku, product_name, units_requested, units_sent, stock_item_id, expiration_date, expiration_source)"
      )
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!reqDataRaw) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" }
      });
    }
    let reqData = reqDataRaw as typeof reqDataRaw & { prep_request_items: any[] };
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

    // Persist quantity overrides from UI (units_sent) before any signature checks
    let appliedQuantityOverrides = false;
    if (Object.keys(quantitiesByItemId).length) {
      const itemsById = new Map<string, any>();
      (reqData.prep_request_items || []).forEach((it: any) => {
        itemsById.set(String(it.id), it);
      });
      const overrideUpdates: { id: string; units_sent: number }[] = [];
      for (const [id, qty] of Object.entries(quantitiesByItemId)) {
        const existing = itemsById.get(id);
        if (!existing) continue;
        const currentQty = Number(existing.units_sent ?? existing.units_requested ?? 0) || 0;
        if (currentQty !== qty) {
          overrideUpdates.push({ id, units_sent: qty });
        }
      }
      if (overrideUpdates.length) {
        appliedQuantityOverrides = true;
        for (const row of overrideUpdates) {
          const { error: updErr } = await supabase
            .from("prep_request_items")
            .update({ units_sent: row.units_sent })
            .eq("id", row.id);
          if (updErr) {
            console.error("fba-plan quantity override save failed", { traceId, error: updErr });
            return new Response(
              JSON.stringify({ error: "Nu am putut salva cantitățile ajustate", traceId }),
              { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
            );
          }
        }
        // Re-fetch request with updated quantities
        const { data: refetchReq, error: refetchErr } = await supabase
          .from("prep_requests")
          .select(
            "id, destination_country, company_id, user_id, inbound_plan_id, placement_option_id, packing_option_id, fba_shipment_id, amazon_snapshot, step1_box_plan, prep_request_items(id, asin, sku, product_name, units_requested, units_sent, stock_item_id, expiration_date, expiration_source)"
          )
          .eq("id", requestId)
          .maybeSingle();
        if (refetchErr) throw refetchErr;
        if (refetchReq) reqData = refetchReq as any;
      }
    }

    const step1BoxPlan = (reqData as any)?.step1_box_plan || {};
    let snapshotBase = (reqData as any)?.amazon_snapshot || {};
    // Folosește snapshot-ul Amazon ca fallback dacă request-ul are deja context salvat.
    const snapshotFbaInbound = snapshotBase?.fba_inbound || {};
    const snapshotInboundPlanId = snapshotFbaInbound?.inboundPlanId || null;
    let inboundPlanIdRaw: string | null = reqData.inbound_plan_id || snapshotInboundPlanId || null;
    let inboundPlanId: string | null = sanitizeInboundPlanId(inboundPlanIdRaw);
    if (!inboundPlanId && inboundPlanIdRaw) {
      await resetInvalidInboundPlanId({ inboundPlanId: inboundPlanIdRaw, requestId });
    }
    let inboundPlanStatus: string | null = null;
    let packingOptionId: string | null =
      (reqData as any)?.packing_option_id || snapshotFbaInbound?.packingOptionId || null;
    let _lastPackingOptions: any[] = [];
    let _lastPlacementOptions: any[] = [];
    // IMPORTANT: packing groups din snapshot pot fi stale; pornim de la gol și doar eventual fallback.
    let packingGroupsFromAmazon: any[] = [];
    const snapshotPackingGroupsFallback =
      Array.isArray(snapshotFbaInbound?.packingGroups) ? snapshotFbaInbound.packingGroups : [];
    const effectiveUnits = (it: { units_sent?: number | null; units_requested?: number | null }) => {
      const sent = it?.units_sent;
      const requested = it?.units_requested;
      // units_sent este sursa de adevăr după orice edit în Step 1 (inclusiv 0 = SKU exclus).
      // Facem fallback la units_requested doar când units_sent nu este setat deloc.
      if (sent === null || sent === undefined) return Number(requested || 0) || 0;
      return Number(sent || 0) || 0;
    };
    const buildItemsSignature = (list: typeof reqData.prep_request_items) => {
      const entries = (list || []).map((it: any) => ({
        id: String(it.id || ""),
        units: effectiveUnits(it)
      }));
      entries.sort((a, b) => a.id.localeCompare(b.id));
      return JSON.stringify(entries);
    };
    const currentItemsSignature = buildItemsSignature(reqData.prep_request_items || []);
    const previousItemsSignature = snapshotBase?.fba_inbound?.planItemsSignature || null;

    // Dacă planul existent are semnătură de iteme diferită (qty/sku schimbate), resetăm inbound/packing/placement.
    const signatureChanged = !!previousItemsSignature && previousItemsSignature !== currentItemsSignature;
    const hasAnyPlanId = !!reqData.inbound_plan_id || !!snapshotInboundPlanId;
    const forceResetFromOverrides =
      appliedQuantityOverrides && (!previousItemsSignature || signatureChanged);
    if (hasAnyPlanId && (signatureChanged || forceResetFromOverrides)) {
      try {
        const clearedSnapshot = {
          ...(snapshotBase || {}),
          fba_inbound: {
            planItemsSignature: null,
            inboundPlanId: null,
            packingOptionId: null,
            placementOptionId: null,
            packingGroups: []
          }
        };
        await supabase
          .from("prep_requests")
          .update({
            inbound_plan_id: null,
            placement_option_id: null,
            packing_option_id: null,
            amazon_snapshot: clearedSnapshot
          })
          .eq("id", requestId);
        snapshotBase = clearedSnapshot;
        inboundPlanId = null;
        packingOptionId = null;
        inboundPlanStatus = null;
        _lastPackingOptions = [];
        _lastPlacementOptions = [];
      } catch (resetErr) {
        console.error("reset inbound plan after item change failed", { traceId, error: resetErr });
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
      (it) => effectiveUnits(it) > 0
    );
    const missingSkuItems = items.filter((it) => !normalizeSku(it.sku || ""));
    const ignoredItems = missingSkuItems.map((it) => ({
      id: it.id,
      asin: it.asin || null,
      product_name: it.product_name || null,
      units: effectiveUnits(it),
      reason: "Missing SKU"
    }));
    const ignoredItemsWarning = ignoredItems.length
      ? `Au fost ignorate ${ignoredItems.length} linii fără SKU; completează SKU dacă vrei să le incluzi în plan.`
      : "";
    const validItems = items.filter((it) => !!normalizeSku(it.sku || ""));
    // Collapse duplicate SKUs: Amazon folosește MSKU ca cheie și comasează cantitățile, deci agregăm local.
    type CollapsedItem = {
      sku: string;
      asin: string | null;
      product_name: string | null;
      units: number;
      itemIds: string[];
    };
    const collapsedItems: CollapsedItem[] = (() => {
      const map = new Map<string, CollapsedItem>();
      for (const it of validItems) {
        const skuKey = normalizeSku(it.sku || "");
        if (!skuKey) continue;
        const qty = effectiveUnits(it);
        const existing = map.get(skuKey);
        if (existing) {
          existing.units += qty;
          existing.itemIds.push(String(it.id));
          if (!existing.asin && it.asin) existing.asin = it.asin;
          if (!existing.product_name && it.product_name) existing.product_name = it.product_name;
        } else {
          map.set(skuKey, {
            sku: skuKey,
            asin: it.asin || null,
            product_name: it.product_name || null,
            units: qty,
            itemIds: [String(it.id)]
          });
        }
      }
      return Array.from(map.values()).filter((x) => x.units > 0);
    })();
    if (!validItems.length) {
      return new Response(
        JSON.stringify({
          error: "Nu există linii valide cu SKU. Completează SKU pentru a continua.",
          blocking: true,
          missing: ignoredItems,
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    const stockItemIds = Array.from(
      new Set(
        validItems
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
    if (!validItems.length) {
      return new Response(
        JSON.stringify({
          error: "Nu există unități de trimis. Setează o cantitate > 0 înainte de a continua.",
          code: "NO_ITEMS",
          traceId
        }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }
    if (!marketplaceId) {
      throw new Error("Missing destination marketplaceId");
    }

    const fetchListingImages = async () => {
      const images: Record<string, string> = {};
      const missing = validItems.filter((it) => {
        const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
        const hasLocalImage = Boolean(stock?.image_url);
        return it.sku && !hasLocalImage;
      });
      const limited = missing.slice(0, 6); // evităm rate limiting
      for (const it of limited) {
        const skuKey = normalizeSku(it.sku || "");
        if (!skuKey) continue;
        try {
          const res = await signedFetch({
            method: "GET",
            service: "execute-api",
            region: awsRegion,
            host,
            path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(it.sku)}`,
            query: `marketplaceIds=${encodeURIComponent(marketplaceId)}&includedData=attributes,summaries`,
            payload: "",
            accessKey: tempCreds.accessKeyId,
            secretKey: tempCreds.secretAccessKey,
            sessionToken: tempCreds.sessionToken,
            lwaToken: lwaAccessToken,
            traceId,
            operationName: "listings.getItem",
            marketplaceId,
            sellerId
          });
          const mainImage =
            res.json?.summaries?.[0]?.mainImage?.link ||
            res.json?.attributes?.main_product_image_locator?.[0]?.media_location ||
            res.json?.summaries?.[0]?.images?.[0]?.link ||
            null;
          if (mainImage) {
            images[skuKey] = mainImage;
          }
        } catch (e) {
          console.warn("listings.getItem image fallback failed", { traceId, sku: it.sku, error: `${e}` });
        }
      }
      return images;
    };

    const listingImages = await fetchListingImages();
    const stockImageBySku: Record<string, string> = {};
    validItems.forEach((it) => {
      const skuKey = normalizeSku(it.sku || "");
      if (!skuKey) return;
      if (stockImageBySku[skuKey]) return;
      const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
      if (stock?.image_url) stockImageBySku[skuKey] = stock.image_url;
    });

    const warehouseCountryInput =
      body?.warehouse_country ??
      body?.warehouseCountry ??
      reqData.warehouse_country ??
      reqData.destination_country ??
      "FR";
    const warehouseCountry = normalizeWarehouseCountry(warehouseCountryInput);
    const sourceAddressInput = body?.source_address ?? body?.sourceAddress ?? null;
    const shipFromAddress = buildWarehouseAddress(warehouseCountry, sourceAddressInput);
    const shipFromCountry = String(shipFromAddress.countryCode || warehouseCountry || "FR").toUpperCase();
    if (!reqData.warehouse_country || reqData.warehouse_country !== warehouseCountry) {
      const { error: warehouseErr } = await supabase
        .from("prep_requests")
        .update({ warehouse_country: warehouseCountry })
        .eq("id", requestId);
      if (warehouseErr) {
        console.warn("fba-plan warehouse_country update failed", { traceId, error: warehouseErr.message });
      }
    }

    const scopesLower = lwaScopes.map((s) => s.toLowerCase());
    const scopesDecoded = scopesLower.length > 0;
    const hasInboundScope = scopesLower.includes("sellingpartnerapi::fba_inbound");
    // Dacă nu am putut decoda scopes (token opac), încercăm oricum prep guidance și lăsăm Amazon să răspundă.
    const shouldAttemptPrepGuidance = hasInboundScope || !scopesDecoded;
    let prepGuidanceWarning: string | null = null;
    let prepGuidanceMap: Record<string, PrepGuidance> = {};
    if (shouldAttemptPrepGuidance) {
      const prepGuidanceResult = await fetchPrepGuidance({
        items: collapsedItems.map((c) => ({
          id: c.sku,
          asin: c.asin,
          sku: c.sku,
          product_name: c.product_name,
          units_requested: c.units,
          units_sent: c.units
        })) as any,
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
    const skuItems = collapsedItems.map((c) => ({ sku: c.sku, asin: c.asin || null }));
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
    validItems.forEach((it) => {
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
    validItems.forEach((it) => {
      const key = normalizeSku(it.sku || it.asin || "");
      const skuOnly = normalizeSku(it.sku || "");
      const requiresExpiry =
        (prepGuidanceMap[key]?.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
        expiryRequiredBySku[skuOnly] === true;
      if (requiresExpiry && !expirations[key]) {
        const auto = addMonths(today, 16).toISOString().split("T")[0];
        expirations[key] = auto;
        expirySourceBySku[key] = "auto_16m";
      }
    });

    // Safety net: if Amazon later complains about missing expiration, ensure every SKU has one.
    validItems.forEach((it) => {
      const key = normalizeSku(it.sku || it.asin || "");
      if (!expirations[key]) {
        const auto = addMonths(today, 16).toISOString().split("T")[0];
        expirations[key] = auto;
        expirySourceBySku[key] = "auto_16m_forced";
      }
    });

    // Persist expirations that were auto/manual filled but missing in DB
    const expiryUpdates: { id: string; expiration_date: string; expiration_source: string | null }[] = [];
    validItems.forEach((it) => {
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
      for (const row of expiryUpdates) {
        const { error: expirySaveErr } = await supabase
          .from("prep_request_items")
          .update({ expiration_date: row.expiration_date, expiration_source: row.expiration_source })
          .eq("id", row.id);
        if (expirySaveErr) {
          console.warn("fba-plan expiration save failed", {
            traceId,
            error: expirySaveErr,
            id: row.id
          });
        }
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
    const skuStatuses: { sku: string; asin: string | null; state: string; reason: string; inputSku?: string; fnsku?: string | null }[] = [];
    for (const c of collapsedItems) {
      const inputSku = c.sku;
      const status = await checkSkuStatus({
        sku: c.sku,
        asin: c.asin,
        marketplaceId,
        host,
        region: awsRegion,
        lwaToken: lwaAccessToken,
        tempCreds,
        sellerId,
        traceId
      });
      const canonicalSku = normalizeSku((status as any)?.canonicalSku || c.sku);
      if (canonicalSku && canonicalSku !== c.sku) {
        console.log("sku_case_normalized", {
          traceId,
          inputSku: c.sku,
          canonicalSku
        });
        c.sku = canonicalSku;
      }
      skuStatuses.push({
        sku: c.sku,
        asin: c.asin || null,
        state: status.state,
        reason: status.reason,
        inputSku,
        fnsku: (status as any)?.fnsku || null
      });
    }

    const blocking = skuStatuses.filter((s) => ["inactive", "restricted", "inbound_unavailable"].includes(String(s.state)));
    if (skuStatuses.length) {
      const warningParts: string[] = [];
      const marketplaceLabel = marketplaceNameById[String(marketplaceId || "").toUpperCase()] || String(marketplaceId || "");
      if (blocking.length) {
        warningParts.push(`Unele produse nu sunt eligibile pe marketplace-ul destinație (${marketplaceLabel}).`);
      }
      const missing = skuStatuses.filter((s) => s.state === "missing");
      if (missing.length) {
        warningParts.push(
          `SKU fără listing pe marketplace ${marketplaceLabel} (${missing.map((m) => m.sku).join(", ")}). Verifică dacă există ca FBA.`
        );
      }
      if (ignoredItemsWarning) warningParts.push(ignoredItemsWarning);
      if (prepGuidanceWarning) warningParts.push(prepGuidanceWarning);
      const warning = warningParts.filter(Boolean).join(" ");
      if (blocking.length || missing.length) {
      const skus = collapsedItems.map((c, idx) => {
        const key = normalizeSku(c.sku || c.asin || "");
        const prepInfo = prepGuidanceMap[key] || {};
        const requiresExpiryFromGuidance = (prepInfo.prepInstructions || []).some((p: string) =>
          String(p || "").toLowerCase().includes("expir")
        );
        const expiryKey = normalizeSku(c.sku || "");
        const requiresExpiry = requiresExpiryFromGuidance || expiryRequiredBySku[expiryKey] === true;
        const expiryVal = expirations[expiryKey] || "";
        return {
          id: c.itemIds?.[0] || `sku-${idx + 1}`,
          title: c.product_name || c.sku || `SKU ${idx + 1}`,
          sku: c.sku || "",
          asin: c.asin || "",
          storageType: "Standard-size",
          packing: "individual",
          units: Number(c.units) || 0,
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
          step1BoxPlan,
          shipments: [],
          raw: null,
          skuStatuses,
          ignoredItems,
          warning,
          blocking: blocking.length > 0
        };
        return new Response(JSON.stringify({ plan, traceId, scopes: lwaScopes }), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    const prepOwnerConstraintBySku: Record<string, OwnerVal | null> = {};
    const labelOwnerConstraintBySku: Record<string, OwnerVal | null> = {};
    const prepCategoryBySku: Record<string, string | null> = {};

    const buildPlanBody = (overrides: Record<string, InboundFix> = {}) => {
      // Amazon limitează câmpul name la 40 caractere; folosim un id scurt ca să evităm 400 InvalidInput.
      const shortRequestId = (requestId || crypto.randomUUID()).toString().slice(0, 8);
      const planName = `Prep-${shortRequestId}`.slice(0, 40);
      return {
        name: planName,
        // Amazon requires `sourceAddress` for createInboundPlan payload
        sourceAddress: shipFromAddress,
        destinationMarketplaces: [marketplaceId],
        items: collapsedItems.map((c) => {
          const key = normalizeSku(c.sku);
          const prepInfo = prepGuidanceMap[key] || {};
          const prepRequired = !!prepInfo.prepRequired;
          const manufacturerBarcodeEligible =
            prepInfo.barcodeInstruction ? isManufacturerBarcodeEligible(prepInfo.barcodeInstruction) : false;
          const prepTypesFromGuidance = (Array.isArray(prepInfo.prepInstructions) ? prepInfo.prepInstructions : [])
            .map((raw: string) => toInboundPrepType(String(raw || "")))
            .filter((v: string | null): v is string => !!v);
          const guidanceToken = normalizeToken(prepInfo.guidance);
          const labelingOrNoPrepOnly =
            prepTypesFromGuidance.length > 0 &&
            prepTypesFromGuidance.every((t) => t === "ITEM_LABELING" || t === "ITEM_NO_PREP");
          const prefersNonePrepOwner =
            guidanceToken === "NOADDITIONALPREPREQUIRED" || labelingOrNoPrepOnly;
          // Respectăm guidance-ul Amazon: dacă e barcode-eligibil -> NONE, altfel SELLER doar când e cerut.
          let labelOwner: OwnerVal = deriveLabelOwner({ ...prepInfo, prepRequired, manufacturerBarcodeEligible });
          // Dacă nu există prep real, Amazon cere de regulă prepOwner=NONE (labeling rămâne separat via labelOwner).
          let prepOwner: OwnerVal =
            prepRequired
              ? labelOwner === "AMAZON"
                ? "AMAZON"
                : "SELLER"
              : "NONE";
          if (prefersNonePrepOwner) prepOwner = "NONE";

          const labelOwnerFromConstraint = labelOwnerConstraintBySku[key];
          const prepOwnerFromConstraint = prepOwnerConstraintBySku[key];
          const prepCategory = String(prepCategoryBySku[key] || "").toUpperCase();
          if (labelOwnerFromConstraint) labelOwner = labelOwnerFromConstraint;
          if (prepOwnerFromConstraint) prepOwner = prepOwnerFromConstraint;
          if (!prepOwnerFromConstraint && prepCategory === "NONE") prepOwner = "NONE";

          const expiryVal = expirations[key] || null;

          const o = overrides[key];
          if (o?.labelOwner) labelOwner = o.labelOwner;
          if (o?.prepOwner) prepOwner = o.prepOwner;
          // În createInboundPlan trimitem strict câmpurile documentate pentru item.
          return {
            msku: key,
            quantity: Number(c.units) || 0,
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

    const applyListingAttributesUpdates = async () => {
      const entries = Object.entries(listingAttributesBySku || {});
      if (!entries.length) return;
      for (const [skuKeyRaw, attrs] of entries) {
        const skuKey = normalizeSku(skuKeyRaw);
        if (!skuKey) continue;
        const length = Number(attrs?.length_cm || 0);
        const width = Number(attrs?.width_cm || 0);
        const height = Number(attrs?.height_cm || 0);
        const weight = Number(attrs?.weight_kg || 0);
        const hasDims = length > 0 && width > 0 && height > 0;
        const hasWeight = weight > 0;
        if (!hasDims && !hasWeight) continue;

        const listingsPath = `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(skuKey)}`;
        const getQuery = `marketplaceIds=${encodeURIComponent(marketplaceId)}&includedData=summaries`;
        const getRes = await spapiGet({
          host,
          region: awsRegion,
          path: listingsPath,
          query: getQuery,
          lwaToken: lwaAccessToken,
          tempCreds,
          traceId,
          operationName: "listings.getItem.productType",
          marketplaceId,
          sellerId
        });
        if (!getRes.res.ok) {
          planWarnings.push(
            `Nu am putut citi productType pentru SKU ${skuKey} (status ${getRes.res.status}).`
          );
          continue;
        }
        const summaries = getRes.json?.summaries || getRes.json?.payload?.summaries || [];
        const summary =
          (Array.isArray(summaries) ? summaries : []).find(
            (s: any) => String(s?.marketplaceId || s?.marketplace_id || "") === String(marketplaceId)
          ) || (Array.isArray(summaries) ? summaries[0] : null);
        const productType = String(summary?.productType || summary?.product_type || "").trim();
        if (!productType) {
          planWarnings.push(`SKU ${skuKey} nu are productType în listing; nu pot trimite atributele.`);
          continue;
        }

        const patches: any[] = [];
        if (hasDims) {
          patches.push({
            op: "replace",
            path: "/attributes/item_package_dimensions",
            value: [
              {
                length: { value: length, unit: "centimeters" },
                width: { value: width, unit: "centimeters" },
                height: { value: height, unit: "centimeters" }
              }
            ]
          });
        }
        if (hasWeight) {
          patches.push({
            op: "replace",
            path: "/attributes/item_package_weight",
            value: [{ value: weight, unit: "kilograms" }]
          });
        }
        if (!patches.length) continue;

        const patchBody = JSON.stringify({ productType, patches });
        const previewQuery = `marketplaceIds=${encodeURIComponent(marketplaceId)}&mode=VALIDATION_PREVIEW`;
        const preview = await signedFetch({
          method: "PATCH",
          service: "execute-api",
          region: awsRegion,
          host,
          path: listingsPath,
          query: previewQuery,
          payload: patchBody,
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "listings.patchItem.validationPreview",
          marketplaceId,
          sellerId
        });
        const previewIssues = Array.isArray(preview.json?.issues) ? preview.json.issues : [];
        const previewBlocking = previewIssues.some((i: any) => String(i?.severity || "").toUpperCase() === "ERROR");
        if (!preview.res.ok || previewBlocking) {
          const issueText = previewIssues
            .slice(0, 2)
            .map((i: any) => i?.message || i?.code || "")
            .filter(Boolean)
            .join(" | ");
          planWarnings.push(
            `Validarea atributelor pentru SKU ${skuKey} a eșuat.${issueText ? ` ${issueText}` : ""}`
          );
          continue;
        }

        const patchQuery = `marketplaceIds=${encodeURIComponent(marketplaceId)}`;
        const patchRes = await signedFetch({
          method: "PATCH",
          service: "execute-api",
          region: awsRegion,
          host,
          path: listingsPath,
          query: patchQuery,
          payload: patchBody,
          accessKey: tempCreds.accessKeyId,
          secretKey: tempCreds.secretAccessKey,
          sessionToken: tempCreds.sessionToken,
          lwaToken: lwaAccessToken,
          traceId,
          operationName: "listings.patchItem",
          marketplaceId,
          sellerId
        });
        if (!patchRes.res.ok) {
          planWarnings.push(
            `Nu am putut salva atributele de produs pentru SKU ${skuKey} (status ${patchRes.res.status}).`
          );
          continue;
        }
        planWarnings.push(`Atributele produsului au fost trimise la Amazon pentru SKU ${skuKey}.`);
      }
    };

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
      // limităm polling-ul ca să nu lovim inutil SP-API când planul e deja ACTIV
      const maxAttempts = 3;
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
        await delay(300 * attempt);
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

    const encodeMskuForPrepQuery = (sku: string) => {
      // Conform doc: %, + și , trebuie dublu-encodate.
      return encodeURIComponent(sku)
        .replace(/%25/g, "%2525")
        .replace(/%2B/g, "%252B")
        .replace(/%2C/g, "%252C");
    };

    const listPrepDetails = async (mskus: string[]) => {
      const cleaned = Array.from(new Set(mskus.map((s) => normalizeSku(s)).filter(Boolean)));
      if (!cleaned.length) return null;
      const queryParts = [`marketplaceId=${encodeURIComponent(marketplaceId)}`];
      for (const msku of cleaned) {
        queryParts.push(`mskus=${encodeMskuForPrepQuery(msku)}`);
      }
      return signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: "/inbound/fba/2024-03-20/items/prepDetails",
        query: queryParts.join("&"),
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.listPrepDetails",
        marketplaceId,
        sellerId
      });
    };

    const extractPrepDetailsEntries = (json: any): any[] => {
      const entries = json?.mskuPrepDetails || json?.payload?.mskuPrepDetails || [];
      return Array.isArray(entries) ? entries : [];
    };

    const syncPrepConstraintsFromEntries = (entries: any[]) => {
      for (const e of entries) {
        const msku = normalizeSku(e?.msku);
        if (!msku) continue;
        prepOwnerConstraintBySku[msku] = ownerFromConstraint(e?.prepOwnerConstraint);
        labelOwnerConstraintBySku[msku] = ownerFromConstraint(e?.labelOwnerConstraint);
        const rawCategory = String(e?.prepCategory || "").toUpperCase().trim();
        prepCategoryBySku[msku] = rawCategory || null;
      }
    };

    const setPrepDetails = async (mskuPrepDetails: Array<{ msku: string; prepCategory: string; prepTypes: string[] }>) => {
      if (!mskuPrepDetails.length) return null;
      return signedFetch({
        method: "POST",
        service: "execute-api",
        region: awsRegion,
        host,
        path: "/inbound/fba/2024-03-20/items/prepDetails",
        query: "",
        payload: JSON.stringify({
          marketplaceId,
          mskuPrepDetails
        }),
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.setPrepDetails",
        marketplaceId,
        sellerId
      });
    };

    const buildPrepTypesFromHints = (sku: string, listPrepTypes: any[] = []) => {
      const set = new Set<string>();
      for (const t of Array.isArray(listPrepTypes) ? listPrepTypes : []) {
        const mapped = toInboundPrepType(String(t || ""));
        if (mapped) set.add(mapped);
      }
      const prepInfo = prepGuidanceMap[normalizeSku(sku)] || {};
      for (const raw of Array.isArray(prepInfo.prepInstructions) ? prepInfo.prepInstructions : []) {
        const mapped = toInboundPrepType(String(raw || ""));
        if (mapped) set.add(mapped);
      }
      const guidanceToken = normalizeToken(prepInfo.guidance);
      if (guidanceToken === "NOADDITIONALPREPREQUIRED") {
        set.add("ITEM_NO_PREP");
      }
      if (!set.size) set.add("ITEM_NO_PREP");
      return Array.from(set);
    };

    const choosePrepCategoryForSku = (sku: string, listEntry: any, prepTypes: string[]) => {
      const listedCategory = String(listEntry?.prepCategory || "").toUpperCase();
      if (!isUnresolvedPrepCategory(listedCategory)) {
        return listedCategory;
      }
      const prepOwnerConstraint = String(listEntry?.prepOwnerConstraint || "").toUpperCase();
      if (prepOwnerConstraint === "NONE_ONLY") {
        return "NONE";
      }
      const prepInfo = prepGuidanceMap[normalizeSku(sku)] || {};
      const guidanceToken = normalizeToken(prepInfo.guidance);
      const simpleTypesOnly = prepTypes.every((t) => t === "ITEM_LABELING" || t === "ITEM_NO_PREP");
      if (guidanceToken === "NOADDITIONALPREPREQUIRED" || simpleTypesOnly) {
        return "NONE";
      }
      return null;
    };

    const applyMissingPrepClassification = async (mskus: string[]) => {
      const warnings: string[] = [];
      const targetSkus = Array.from(new Set(mskus.map((s) => normalizeSku(s)).filter(Boolean)));
      if (!targetSkus.length) return { applied: false, warnings };

      const listRes = await listPrepDetails(targetSkus);
      let listEntries: any[] = [];
      if (!listRes || !listRes.res.ok) {
        warnings.push(
          `Amazon listPrepDetails a eșuat (${listRes?.res?.status ?? "n/a"}); încerc fallback de setPrepDetails din guidance.`
        );
      } else {
        listEntries = extractPrepDetailsEntries(listRes.json);
        syncPrepConstraintsFromEntries(listEntries);
      }
      const bySku: Record<string, any> = {};
      for (const e of Array.isArray(listEntries) ? listEntries : []) {
        const msku = normalizeSku(e?.msku);
        if (msku) bySku[msku] = e;
      }

      const payload: Array<{ msku: string; prepCategory: string; prepTypes: string[] }> = [];
      for (const sku of targetSkus) {
        const entry = bySku[sku] || null;
        let prepTypes = buildPrepTypesFromHints(sku, entry?.prepTypes || []);
        const prepCategory = choosePrepCategoryForSku(sku, entry, prepTypes);
        if (!prepCategory) {
          warnings.push(`Nu pot deduce prepCategory pentru SKU ${sku}; las cazul pentru setare manuală în Amazon.`);
          continue;
        }
        // Amazon expects a strict prepTypes set for prepCategory=NONE.
        // Example error: "Expected one of ... [[ITEM_NO_PREP]]" when ITEM_LABELING is sent.
        if (prepCategory === "NONE") {
          prepTypes = ["ITEM_NO_PREP"];
        } else {
          // For non-NONE categories, keep actionable prep types and avoid sending ITEM_NO_PREP as sole signal.
          const filtered = prepTypes.filter((t) => t !== "ITEM_NO_PREP");
          if (filtered.length) prepTypes = filtered;
        }
        payload.push({ msku: sku, prepCategory, prepTypes });
      }

      if (!payload.length) {
        warnings.push("Nu am putut construi payload pentru setPrepDetails.");
        return { applied: false, warnings };
      }

      console.log("prep-classification remediation payload", {
        traceId,
        skuCount: payload.length,
        skus: payload.map((p) => p.msku)
      });

      const setRes = await setPrepDetails(payload);
      if (!setRes || !setRes.res.ok) {
        const expectedBySku = extractExpectedPrepTypesBySku({
          json: setRes?.json,
          text: setRes?.text || ""
        });
        const payloadRetry = payload.map((row) => {
          const expected = expectedBySku[normalizeSku(row.msku)] || null;
          if (!expected || !expected.length) return row;
          return { ...row, prepTypes: expected };
        });
        const hasAdaptiveRetry = payloadRetry.some((row, idx) => {
          const prev = payload[idx]?.prepTypes || [];
          const next = row?.prepTypes || [];
          if (prev.length !== next.length) return true;
          return prev.some((v, i) => v !== next[i]);
        });

        if (hasAdaptiveRetry) {
          console.log("prep-classification adaptive retry from Amazon expected prepTypes", {
            traceId,
            skuCount: Object.keys(expectedBySku).length,
            skus: Object.keys(expectedBySku)
          });
          const retryRes = await setPrepDetails(payloadRetry);
          if (!retryRes || !retryRes.res.ok) {
            warnings.push(`Amazon setPrepDetails a eșuat (${retryRes?.res?.status ?? setRes?.res?.status ?? "n/a"}).`);
            return { applied: false, warnings };
          }
          const retryOpId = extractOperationId(retryRes.json);
          if (!retryOpId) {
            warnings.push("setPrepDetails (retry) nu a întors operationId; nu pot confirma aplicarea.");
            return { applied: false, warnings };
          }
          const retryOp = await pollOperationStatus(retryOpId);
          const retryState = String(retryOp?.state || "").toUpperCase();
          if (retryState !== "SUCCESS") {
            warnings.push(`setPrepDetails retry operation ${retryOpId} a returnat status ${retryState || "UNKNOWN"}.`);
            return { applied: false, warnings };
          }
          const refreshResAfterRetry = await listPrepDetails(targetSkus);
          if (refreshResAfterRetry?.res?.ok) {
            syncPrepConstraintsFromEntries(extractPrepDetailsEntries(refreshResAfterRetry.json));
          }
          return { applied: true, warnings };
        }

        warnings.push(`Amazon setPrepDetails a eșuat (${setRes?.res?.status ?? "n/a"}).`);
        return { applied: false, warnings };
      }

      const opId = extractOperationId(setRes.json);
      if (!opId) {
        warnings.push("setPrepDetails nu a întors operationId; nu pot confirma aplicarea.");
        return { applied: false, warnings };
      }
      const op = await pollOperationStatus(opId);
      const state = String(op?.state || "").toUpperCase();
      if (state !== "SUCCESS") {
        warnings.push(`setPrepDetails operation ${opId} a returnat status ${state || "UNKNOWN"}.`);
        return { applied: false, warnings };
      }

      // Refresh constraints after successful setPrepDetails so buildPlanBody uses latest accepted owners.
      const refreshRes = await listPrepDetails(targetSkus);
      if (refreshRes?.res?.ok) {
        syncPrepConstraintsFromEntries(extractPrepDetailsEntries(refreshRes.json));
      }
      return { applied: true, warnings };
    };

    const preflightPrepDetailsForStep1 = async () => {
      const warnings: string[] = [];
      const targetSkus = Array.from(new Set(collapsedItems.map((c) => normalizeSku(c.sku)).filter(Boolean)));
      if (!targetSkus.length) return { warnings };

      const listRes = await listPrepDetails(targetSkus);
      if (!listRes || !listRes.res.ok) {
        warnings.push(`listPrepDetails a eșuat în preflight (${listRes?.res?.status ?? "n/a"}). încerc fallback setPrepDetails.`);
        const remediation = await applyMissingPrepClassification(targetSkus);
        if (remediation.warnings.length) warnings.push(...remediation.warnings);
        if (!remediation.applied) {
          warnings.push(
            `Nu am putut completa automat prep classification pentru SKU-uri: ${targetSkus.join(", ")}.`
          );
        }
        return { warnings };
      }

      const entries = extractPrepDetailsEntries(listRes.json);
      syncPrepConstraintsFromEntries(entries);
      const bySku = new Map<string, any>();
      for (const e of entries) {
        const msku = normalizeSku(e?.msku);
        if (msku) bySku.set(msku, e);
      }

      const unknownSkus = targetSkus.filter((sku) => {
        const entry = bySku.get(sku);
        return isUnresolvedPrepCategory(entry?.prepCategory);
      });

      if (!unknownSkus.length) return { warnings };

      const remediation = await applyMissingPrepClassification(unknownSkus);
      if (remediation.warnings.length) warnings.push(...remediation.warnings);
      if (!remediation.applied) {
        warnings.push(
          `Nu am putut completa automat prep classification pentru SKU-uri: ${unknownSkus.join(", ")}.`
        );
      }
      return { warnings };
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
        path: `${path}/${encodeURIComponent(inboundPlanId)}/packingOptions`,
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
        path: `${path}/${encodeURIComponent(inboundPlanId)}/placementOptions`,
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

    const extractPackingOptionsFromResponse = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
      if (!res) return [];
      return res.json?.payload?.packingOptions || res.json?.packingOptions || res.json?.PackingOptions || [];
    };

    const pickPackingOption = (options: any[]) => {
      if (!Array.isArray(options) || !options.length) return null;
      const normalizeStatus = (val: any) => String(val || "").toUpperCase();
      const available = options.filter((o: any) =>
        ["OFFERED", "AVAILABLE", "READY", "ACCEPTED"].includes(normalizeStatus(o?.status))
      );
      const candidates = available.length ? available : options;
      const score = (o: any) => {
        const groups = Array.isArray(o?.packingGroups || o?.PackingGroups) ? o.packingGroups || o.PackingGroups : [];
        const groupCount = groups.length || 0;
        const hasDiscount = Array.isArray(o?.discounts || o?.Discounts) && (o.discounts || o.Discounts).length > 0;
        return {
          hasDiscount,
          groupCount
        };
      };
      const sorted = [...candidates].sort((a, b) => {
        const sa = score(a);
        const sb = score(b);
        // prefer fără discount
        if (sa.hasDiscount !== sb.hasDiscount) return sa.hasDiscount ? 1 : -1;
        // apoi cu cât mai puține grupuri
        if (sa.groupCount !== sb.groupCount) return sa.groupCount - sb.groupCount;
        return 0;
      });
      return sorted[0] || candidates[0];
    };

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

    const confirmPackingOption = async (inboundPlanId: string, packingOptionId: string) =>
      signedFetch({
        method: "POST",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${path}/${encodeURIComponent(inboundPlanId)}/packingOptions/${encodeURIComponent(packingOptionId)}/confirmation`,
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
      });

    const fetchPackingGroupItems = async (inboundPlanId: string, groupId: string) => {
      const res = await signedFetch({
        method: "GET",
        service: "execute-api",
        region: awsRegion,
        host,
        path: `${path}/${encodeURIComponent(inboundPlanId)}/packingGroups/${encodeURIComponent(groupId)}/items`,
        query: "",
        payload: "",
        accessKey: tempCreds.accessKeyId,
        secretKey: tempCreds.secretAccessKey,
        sessionToken: tempCreds.sessionToken,
        lwaToken: lwaAccessToken,
        traceId,
        operationName: "inbound.v20240320.getPackingGroupItems",
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
        quantity: Number(it.quantity || it.Quantity || 0) || 0,
        labelOwner: (it.labelOwner || it.label_owner || it.LabelOwner || null) as OwnerVal | null,
        fnsku: it.fnsku || it.FNSKU || it.fulfillmentNetworkSku || null
      }));
      return { packingGroupId: groupId, items: normalizedItems, status: res.res.status, requestId: res.requestId || null };
    };

    const fetchPackingGroups = async (inboundPlanId: string) => {
      if (!inboundPlanId || isLockId(inboundPlanId)) {
        return {
          packingOptionId: null,
          packingGroups: [],
          warnings: []
        };
      }

      const warnings: string[] = [];
      let listRes = await listPackingOptions(inboundPlanId);
      let options = extractPackingOptionsFromResponse(listRes);
      const isBenignGenerateError = (res: Awaited<ReturnType<typeof signedFetch>> | null) => {
        if (!res || res.res.status !== 400) return false;
        const msg =
          res.json?.errors?.[0]?.message ||
          res.json?.payload?.errors?.[0]?.message ||
          res.json?.message ||
          res.text ||
          "";
        return String(msg).toLowerCase().includes("does not support packing options");
      };
      const hasPackingGroups = (opts: any[]) =>
        (opts || []).some((opt) => {
          const groups = Array.isArray(opt?.packingGroups || opt?.PackingGroups) ? opt.packingGroups || opt.PackingGroups : [];
          const ids = opt?.packingGroupIds || opt?.PackingGroupIds || [];
          return (Array.isArray(groups) && groups.length) || (Array.isArray(ids) && ids.length);
        });

      if (listRes.res.ok && (!options.length || !hasPackingGroups(options))) {
        const genRes = await generatePackingOptions(inboundPlanId);
        const opId =
          genRes?.json?.payload?.operationId ||
          genRes?.json?.operationId ||
          null;
        const benignGenerate = isBenignGenerateError(genRes);
        if (opId) await pollOperationStatus(opId);
        if (!genRes.res.ok && !benignGenerate) {
          warnings.push(`generatePackingOptions a eșuat (${genRes.res.status}).`);
        }

        // Poll listPackingOptions câteva secunde; Amazon uneori întoarce packingGroups fără generate.
        const maxListPolls = 10;
        options = [];
        for (let attempt = 0; attempt < maxListPolls; attempt++) {
          const retryRes = await listPackingOptions(inboundPlanId);
          listRes = retryRes;
          if (retryRes?.res?.ok) {
            options = extractPackingOptionsFromResponse(retryRes);
            if (options.length && hasPackingGroups(options)) break;
          }
          await delay(300 + attempt * 200);
        }
      }

      if (!listRes.res.ok) {
        // Retry câteva ori înainte de a declara eșec.
        const maxRetries = 3;
        let recovered = false;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          await delay(200 * attempt);
          const retryRes = await listPackingOptions(inboundPlanId);
          if (retryRes.res.ok) {
            listRes = retryRes;
            options = extractPackingOptionsFromResponse(listRes);
            recovered = true;
            break;
          }
        }
        // Fallback: folosește packingOptions returnate de getInboundPlan (cache) dacă există.
        if (!recovered && _lastPackingOptions.length) {
          options = _lastPackingOptions;
          recovered = true;
        }
        if (!recovered) {
          warnings.push(`listPackingOptions a eșuat (${listRes.res.status}).`);
        }
      }

      const chosen = pickPackingOption(options);
      const packingOptionId =
        chosen?.packingOptionId ||
        chosen?.PackingOptionId ||
        chosen?.id ||
        null;
      let packingGroupIds = extractPackingGroupIds(chosen || {});

      if (!packingGroupIds.length && listRes.res.ok) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await delay(200 * attempt);
          const retryRes = await listPackingOptions(inboundPlanId);
          if (retryRes?.res?.ok) {
            const retryOptions = extractPackingOptionsFromResponse(retryRes);
            const retryChosen = pickPackingOption(retryOptions);
            const retryIds = extractPackingGroupIds(retryChosen || {});
            if (retryIds.length) {
              packingGroupIds = retryIds;
              break;
            }
          }
        }
      }

      if (packingOptionId) {
        const confirmRes = await confirmPackingOption(inboundPlanId, packingOptionId);
        if (confirmRes && !confirmRes.res.ok && confirmRes.res.status !== 409) {
          warnings.push(`ConfirmPackingOption a eșuat (${confirmRes.res.status}).`);
        }
      }

      if (!packingOptionId || !packingGroupIds.length) {
        return { packingOptionId: packingOptionId || null, packingGroups: [], warnings };
      }

      const packingGroups: any[] = [];
      for (const gid of packingGroupIds) {
        const grp = await fetchPackingGroupItems(inboundPlanId, gid);
        if (!grp.packingGroupId && gid) {
          (grp as any).packingGroupId = gid;
        }
        packingGroups.push(grp);
        await delay(50);
      }

      return { packingOptionId, packingGroups, warnings };
    };

    // Step 1 preflight: sincronizăm constrângerile de owner și completăm prep classification
    // înainte de createInboundPlan, ca să evităm 400/ERRORED evitabile.
    if (!sanitizeInboundPlanId(inboundPlanId)) {
      const preflight = await preflightPrepDetailsForStep1();
      if (preflight.warnings.length) planWarnings.push(...preflight.warnings);
    }

    const lockId = `LOCK-${traceId}`;
    let hasPlanLock = false;
    let attempt = 0;
    const maxAttempts = 3;
    let amazonJson: any = null;
    let lastResponseText: string | null = null;
    let primaryRequestId: string | null = null;
    let plans: any[] = [];
    let operationId: string | null = null;
    let operationStatus: string | null = null;
    let operationProblems: any[] = [];
    let operationRaw: any = null;
    let createHttpStatus: number | null = null;
    let prepClassificationRetried = false;

    const inboundPlanErrored = (status: string | null) =>
      String(status || "").toUpperCase() === "ERRORED";

    const sanitizedBeforeFetch = sanitizeInboundPlanId(inboundPlanId);
    if (!sanitizedBeforeFetch && inboundPlanId) {
      await resetInvalidInboundPlanId({ inboundPlanId, requestId });
    }
    inboundPlanId = sanitizedBeforeFetch;

    if (inboundPlanId) {
      const fetched = await fetchInboundPlanById(inboundPlanId);
      plans = fetched.fetchedPlans || [];
      inboundPlanStatus = fetched.fetchedStatus || null;
      _lastPackingOptions = fetched.fetchedPackingOptions || [];
      _lastPlacementOptions = fetched.fetchedPlacementOptions || [];
      appliedPlanBody = appliedPlanBody || buildPlanBody(appliedOverrides);

    if (inboundPlanErrored(inboundPlanStatus)) {
      logStep("inboundPlanErrored", {
        traceId,
          inboundPlanId,
          inboundPlanStatus,
          requestId,
          marketplaceId,
          region: awsRegion,
          sellerId
        });
        await supabase
          .from("prep_requests")
          .update({ inbound_plan_id: null })
          .eq("id", requestId);
        inboundPlanId = null;
        inboundPlanStatus = null;
        plans = [];
        _lastPackingOptions = [];
      _lastPlacementOptions = [];
    }
    }

    // Dacă inbound_plan_id a rămas un placeholder LOCK de la o execuție anterioară, eliberează-l și recreează planul.
    if (inboundPlanId && isLockId(inboundPlanId)) {
      await supabase
        .from("prep_requests")
        .update({ inbound_plan_id: null })
        .eq("id", requestId)
        .eq("inbound_plan_id", inboundPlanId);
      inboundPlanId = null;
    }

    // Acquire a lightweight lock to avoid creating multiple inbound plans in parallel for același request.
    if (!inboundPlanId) {
      const { data: claimedRow, error: claimErr } = await supabase
        .from("prep_requests")
        .update({ inbound_plan_id: lockId })
        .eq("id", requestId)
        .is("inbound_plan_id", null)
        .select("inbound_plan_id")
        .maybeSingle();
      if (claimErr) {
        console.warn("fba-plan lock claim failed", { traceId, error: claimErr?.message || null });
      }
      if (claimedRow?.inbound_plan_id === lockId) {
        hasPlanLock = true;
        inboundPlanId = null; // keep null to trigger create with the lock held
      } else if (claimedRow?.inbound_plan_id) {
        // Alt proces a setat deja planul, îl reutilizăm.
        inboundPlanId = claimedRow.inbound_plan_id;
        hasPlanLock = false;
      } else if (!claimedRow) {
        // Nimeni nu a fost actualizat; poate un alt proces a setat deja planul între timp.
        const { data: refetchRow, error: refetchErr } = await supabase
          .from("prep_requests")
          .select("inbound_plan_id")
          .eq("id", requestId)
          .maybeSingle();
        if (!refetchErr && refetchRow?.inbound_plan_id) {
          inboundPlanId = refetchRow.inbound_plan_id;
        }
      }
    }
    // Dacă altă execuție deține lock-ul, nu continuăm cu createInboundPlan în paralel.
    if (!hasPlanLock && inboundPlanId && isLockId(inboundPlanId)) {
      return new Response(
        JSON.stringify({
          error: "Plan creation already in progress for this request",
          traceId,
          requestId,
          inboundPlanId,
          status: "LOCKED"
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "content-type": "application/json" }
        }
      );
    }
    const sanitizedAfterClaim = sanitizeInboundPlanId(inboundPlanId);
    if (!sanitizedAfterClaim && inboundPlanId && !isLockId(inboundPlanId)) {
      await resetInvalidInboundPlanId({ inboundPlanId, requestId });
    }
    inboundPlanId = sanitizedAfterClaim;

    const runCreateInboundPlanAttempts = async (operationBase = "inbound.v20240320.createInboundPlan") => {
      attempt = 0;
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
          operationName: attempt === 1 ? operationBase : `${operationBase}.retry${attempt}`,
          marketplaceId,
          sellerId
        });

        createHttpStatus = res.res.status;
        if (!primaryRequestId) primaryRequestId = res.requestId || null;
        amazonJson = res.json;
        lastResponseText = res.text || null;
        operationId = operationId || extractOperationId(res.json);
        const data = extractInboundPlanData(res.json);
        const rawInbound = inboundPlanId || data.inboundPlanId;
        inboundPlanId = sanitizeInboundPlanId(rawInbound);
        if (!inboundPlanId && rawInbound) {
          await resetInvalidInboundPlanId({ inboundPlanId: rawInbound, requestId });
        }
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
    };

    if (Object.keys(listingAttributesBySku).length) {
      await applyListingAttributesUpdates();
    }

    if (!inboundPlanId) {
      await runCreateInboundPlanAttempts();
    }

    if (inboundPlanId && operationId) {
      const opRes = await pollOperationStatus(operationId);
      const stateUp = String(opRes?.state || "").toUpperCase();
      operationStatus = operationStatus || (opRes?.state ? String(opRes.state) : null);
      operationProblems = operationProblems.length ? operationProblems : (opRes?.problems || []);
      operationRaw = operationRaw || opRes?.raw || null;
      if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
        inboundPlanStatus = "ERRORED";
      }
    }

    if (inboundPlanId && (!inboundPlanStatus || inboundPlanErrored(inboundPlanStatus))) {
      const fetched = await fetchInboundPlanById(inboundPlanId);
      if (fetched.fetchedStatus) inboundPlanStatus = fetched.fetchedStatus;
      if (!plans.length && fetched.fetchedPlans?.length) plans = fetched.fetchedPlans;
      _lastPackingOptions = _lastPackingOptions.length ? _lastPackingOptions : fetched.fetchedPackingOptions || [];
      _lastPlacementOptions = _lastPlacementOptions.length ? _lastPlacementOptions : fetched.fetchedPlacementOptions || [];
    }

    if (inboundPlanId && inboundPlanErrored(inboundPlanStatus) && !prepClassificationRetried) {
      const allRequestSkus = Array.from(
        new Set(collapsedItems.map((c) => normalizeSku(c.sku)).filter(Boolean))
      );
      let prepClassificationSkus = extractPrepClassificationSkus(operationProblems);
      if (prepClassificationSkus.length && allRequestSkus.length) {
        const requestSet = new Set(allRequestSkus);
        const matched = prepClassificationSkus.filter((sku) => requestSet.has(normalizeSku(sku)));
        const unmatched = prepClassificationSkus.filter((sku) => !requestSet.has(normalizeSku(sku)));
        if (unmatched.length) {
          planWarnings.push(
            `Amazon a returnat resource-uri fără mapare directă la SKU (${unmatched.join(", ")}); folosesc SKU-urile din request pentru auto-remediere.`
          );
        }
        prepClassificationSkus = matched.length ? matched : allRequestSkus;
      }
      if (!prepClassificationSkus.length && operationId) {
        const opLatest = await fetchOperationStatus(operationId);
        const latestProblems = Array.isArray(opLatest?.problems) ? opLatest.problems : [];
        if (latestProblems.length) {
          operationProblems = latestProblems;
          operationRaw = opLatest?.raw || operationRaw;
          prepClassificationSkus = extractPrepClassificationSkus(operationProblems);
          if (prepClassificationSkus.length && allRequestSkus.length) {
            const requestSet = new Set(allRequestSkus);
            const matched = prepClassificationSkus.filter((sku) => requestSet.has(normalizeSku(sku)));
            prepClassificationSkus = matched.length ? matched : allRequestSkus;
          }
        }
      }
      if (!prepClassificationSkus.length) {
        prepClassificationSkus = allRequestSkus;
        if (prepClassificationSkus.length) {
          planWarnings.push(
            `Plan ERRORED fara SKU explicit in operationProblems; incerc auto-remediere prep pe toate SKU-urile (${prepClassificationSkus.join(", ")}).`
          );
        }
      }
      if (prepClassificationSkus.length) {
        const remediation = await applyMissingPrepClassification(prepClassificationSkus);
        if (remediation.warnings.length) {
          planWarnings.push(...remediation.warnings);
        }
        if (remediation.applied) {
          prepClassificationRetried = true;
          try {
            await supabase
              .from("prep_requests")
              .update({ inbound_plan_id: null })
              .eq("id", requestId)
              .eq("inbound_plan_id", inboundPlanId);
          } catch (resetErr) {
            console.warn("reset inbound_plan_id before createInboundPlan retry failed", { traceId, error: resetErr });
          }
          inboundPlanId = null;
          inboundPlanStatus = null;
          plans = [];
          _lastPackingOptions = [];
          _lastPlacementOptions = [];
          operationId = null;
          operationStatus = null;
          operationProblems = [];
          operationRaw = null;
          createHttpStatus = null;
          amazonJson = null;
          lastResponseText = null;
          primaryRequestId = null;

          await runCreateInboundPlanAttempts("inbound.v20240320.createInboundPlan.afterSetPrepDetails");
          if (inboundPlanId && operationId) {
            const opRes = await pollOperationStatus(operationId);
            const stateUp = String(opRes?.state || "").toUpperCase();
            operationStatus = operationStatus || (opRes?.state ? String(opRes.state) : null);
            operationProblems = operationProblems.length ? operationProblems : (opRes?.problems || []);
            operationRaw = operationRaw || opRes?.raw || null;
            if (["FAILED", "CANCELED", "ERRORED", "ERROR"].includes(stateUp)) {
              inboundPlanStatus = "ERRORED";
            }
          }
          if (inboundPlanId && (!inboundPlanStatus || inboundPlanErrored(inboundPlanStatus))) {
            const fetched = await fetchInboundPlanById(inboundPlanId);
            if (fetched.fetchedStatus) inboundPlanStatus = fetched.fetchedStatus;
            if (!plans.length && fetched.fetchedPlans?.length) plans = fetched.fetchedPlans;
            _lastPackingOptions = _lastPackingOptions.length ? _lastPackingOptions : fetched.fetchedPackingOptions || [];
            _lastPlacementOptions = _lastPlacementOptions.length ? _lastPlacementOptions : fetched.fetchedPlacementOptions || [];
          }
        }
      }
    }

    if (inboundPlanId && inboundPlanErrored(inboundPlanStatus)) {
      try {
        await supabase
          .from("prep_requests")
          .update({ inbound_plan_id: null })
          .eq("id", requestId)
          .eq("inbound_plan_id", inboundPlanId);
        planWarnings.push("Planul Amazon a intrat în status ERRORED. Am resetat planul; încearcă din nou.");
      } catch (resetErr) {
        console.warn("reset inbound_plan_id after ERRORED status failed", { traceId, error: resetErr });
      }
      inboundPlanId = null;
      inboundPlanStatus = null;
      plans = [];
      _lastPackingOptions = [];
      _lastPlacementOptions = [];
    }

    const missingExpiry = collapsedItems
      .map((c) => {
        const key = normalizeSku(c.sku || c.asin || "");
        const requiresExpiry =
          (prepGuidanceMap[key]?.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
          expiryRequiredBySku[normalizeSku(c.sku || "")] === true;
        const hasExpiry = !!expirations[key];
        return requiresExpiry && !hasExpiry ? key : null;
      })
      .filter(Boolean) as string[];

    if (missingExpiry.length) {
      const warn = `Unele SKU-uri necesită dată de expirare: ${missingExpiry.join(", ")}. Completează expirarea și reîncearcă.`;
      const skus = collapsedItems.map((c, idx) => {
        const key = normalizeSku(c.sku || c.asin || "");
        const prepInfo = prepGuidanceMap[key] || {};
        const requiresExpiry =
          (prepInfo.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
          expiryRequiredBySku[normalizeSku(c.sku || "")] === true;
        return {
          id: c.itemIds?.[0] || `sku-${idx + 1}`,
          title: c.product_name || c.sku || `SKU ${idx + 1}`,
          sku: c.sku || "",
          asin: c.asin || "",
          storageType: "Standard-size",
          packing: "individual",
          units: Number(c.units) || 0,
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
        step1BoxPlan,
        shipments: [],
        raw: null,
        skuStatuses,
        ignoredItems,
        warning: [warn, ignoredItemsWarning].filter(Boolean).join(" "),
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
        planWarnings.push(
          "Informare Amazon: planul a fost creat cu succes, dar lista `shipments` este încă goală în acest răspuns. Fluxul continuă normal din Step 1b pe baza packing options / packing groups."
        );
        // Nu mai blocăm Step 1: lăsăm UI să continue cu planul activ, packing se face în 1b.
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
        const fallbackSkus = validItems.map((it, idx) => {
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
        const inboundUnavailableSkus = extractInboundUnavailableSkus({
          json: amazonJson,
          text: lastResponseText || ""
        });
        const skuErrorReasons = extractSkuErrorReasons({
          json: amazonJson,
          text: lastResponseText || ""
        });
        const requiredProductAttrsBySku = parseRequiredProductAttrsBySku(operationProblems);
        const requiredAttrSkus = Object.keys(requiredProductAttrsBySku);
        if (requiredAttrSkus.length && !Object.keys(listingAttributesBySku).length) {
          planWarnings.push(
            `Amazon cere atribute de produs pentru SKU-uri (${requiredAttrSkus.join(", ")}). Completează dimensiuni/greutate produs și retrimite Step 1.`
          );
        }
        const skuErrorReasonsFromOperation = extractSkuErrorReasonsFromOperationProblems(operationProblems);
        const mergedSkuErrorReasons = { ...skuErrorReasons, ...skuErrorReasonsFromOperation };
        if (inboundUnavailableSkus.length) {
          for (const sku of inboundUnavailableSkus) {
            const existing = skuStatuses.find((s) => normalizeSku(s.sku) === sku);
            const reason = "SKU indisponibil pentru inbound (Amazon SP-API).";
            if (existing) {
              existing.state = "inbound_unavailable";
              existing.reason = reason;
            } else {
              skuStatuses.push({ sku, asin: null, state: "inbound_unavailable", reason });
            }
          }
        }
        const errorSkus = Object.keys(mergedSkuErrorReasons);
        if (errorSkus.length) {
          for (const sku of errorSkus) {
            const existing = skuStatuses.find((s) => normalizeSku(s.sku) === sku);
            const reason = mergedSkuErrorReasons[sku] || "Eroare Amazon pentru acest SKU.";
            if (existing) {
              existing.state = "missing";
              existing.reason = reason;
            } else {
              skuStatuses.push({ sku, asin: null, state: "missing", reason });
            }
          }
        }
        const userSafeWarnings = planWarnings.filter((w) => {
          const lower = String(w || "").toLowerCase();
          return !(
            lower.includes("operationproblems") ||
            lower.includes("auto-remediere") ||
            lower.includes("sku explicit") ||
            lower.includes("fără mapare directă") ||
            lower.includes("inboundplanid") ||
            lower.includes("packing options") ||
            lower.includes("placement options")
          );
        });
        const extraWarnings = userSafeWarnings.length ? ` ${userSafeWarnings.join(" ")}` : "";
        const firstProblemRaw = operationProblems
          ?.map((p: any) => p?.message || p?.code || "")
          .find((m: string) => String(m || "").trim().length > 0) || "";
        const firstProblem = String(firstProblemRaw)
          .replace(/^ERROR:\s*/i, "")
          .replace(/\[fnskuList:[^\]]+\]/i, "")
          .replace(/\s+/g, " ")
          .trim();
        const isDangerousGoodsIssue = /dangerous goods|hazmat|marf[ăa] periculoas/i.test(String(firstProblemRaw));
        const problemsInfo = firstProblem
          ? isDangerousGoodsIssue
            ? " Amazon spune că unul sau mai multe produse sunt considerate marfă periculoasă și momentan nu pot fi trimise în acest plan."
            : ` Motiv raportat de Amazon: ${firstProblem}.`
          : "";
        const inboundUnavailableInfo = inboundUnavailableSkus.length
          ? ` SKU-uri indisponibile pentru inbound: ${inboundUnavailableSkus.join(", ")}.`
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
          step1BoxPlan,
          shipments: [],
          raw: null,
          skuStatuses,
          ignoredItems,
          warning: `Amazon nu a putut crea planul de trimitere pentru acest request.${problemsInfo} Verifică produsele marcate cu roșu și încearcă din nou.${inboundUnavailableInfo}${extraWarnings}${ignoredItemsWarning ? ` ${ignoredItemsWarning}` : ""}`,
          blocking: true,
          requestId: primaryRequestId || null,
          listingAttributesRequiredBySku: requiredProductAttrsBySku
        };
        return new Response(JSON.stringify({ plan: fallbackPlan, traceId, status: createHttpStatus, requestId: primaryRequestId || null, inboundPlanId, inboundPlanStatus, operationId, operationStatus, operationProblems, operationRaw, scopes: lwaScopes }), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" }
        });
      }
    }

    // Dacă inboundPlanId este un lock, dar snapshot-ul are deja plan-ul real, folosește-l ca fallback.
    if (isLockId(inboundPlanId) && snapshotInboundPlanId && !isLockId(snapshotInboundPlanId)) {
      inboundPlanId = snapshotInboundPlanId;
    }

    // Packing options and groups sunt tratate aici pentru Step 1b, dar dacă nu avem shipments încercăm totuși să scoatem packing groups.
    if (inboundPlanId && !packingGroupsFromAmazon.length) {
      const pgRes = await fetchPackingGroups(inboundPlanId);
      if (pgRes.warnings?.length) {
        planWarnings.push(...pgRes.warnings);
      }
      if (pgRes.packingOptionId && !packingOptionId) {
        packingOptionId = pgRes.packingOptionId;
      }
      if (pgRes.packingGroups?.length) {
        packingGroupsFromAmazon = pgRes.packingGroups;
      } else if (!pgRes.packingGroups?.length && snapshotPackingGroupsFallback.length) {
        packingGroupsFromAmazon = snapshotPackingGroupsFallback;
        planWarnings.push("Folosim packingGroups din snapshot (fallback posibil depășit).");
      }
    }

    // Packing options and groups are handled in Step 1b to match the documented flow.

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

    const skuMeta = new Map<string, { title: string | null; image: string | null }>();
    validItems.forEach((it) => {
      const stock = it.stock_item_id ? stockMap[it.stock_item_id] : null;
      const key = normalizeSku(it.sku || stock?.sku || it.asin || "");
      if (!key) return;
      const listingImage = listingImages[key] || it.amazon_image || it.image || null;
      skuMeta.set(key, {
        title: it.product_name || stock?.name || key,
        image: stock?.image_url || listingImage || null
      });
    });

    const normalizePackingGroups = (groups: any[]) =>
      (Array.isArray(groups) ? groups : []).map((g: any, idx: number) => {
        const pgId = g?.packingGroupId || g?.id || `group-${idx + 1}`;
        const items = (Array.isArray(g?.items) ? g.items : []).map((it: any) => {
          const skuKey = normalizeSku(it?.msku || it?.sku || it?.SellerSKU || it?.sellerSku || "");
          const meta = skuMeta.get(skuKey);
          return {
            ...it,
            sku: it?.sku || it?.msku || it?.SellerSKU || it?.sellerSku || "",
            title: it?.title || meta?.title || null,
            image: it?.image || meta?.image || null,
            quantity: Number(it?.quantity || it?.Quantity || 0) || 0
          };
        });
        const units = items.reduce((sum: number, it: any) => sum + (Number(it?.quantity || 0) || 0), 0);
        const boxes = Number(g?.boxes || g?.boxCount || 1) || 1;
        const rawDims = g?.dimensions || g?.boxDimensions || null;
        const rawWeight = g?.weight || g?.boxWeight || null;
        const packMode = g?.packMode || g?.pack_mode || (boxes > 1 ? "multiple" : "single");
        return {
          ...g,
          id: pgId,
          packingGroupId: pgId,
          items,
          skuCount: items.length || 0,
          units,
          boxes,
          packMode,
          title: g?.title || `Pack group ${idx + 1}`,
          boxDimensions: rawDims || null,
          boxWeight: rawWeight ?? null,
          perBoxDetails: g?.perBoxDetails || g?.per_box_details || null,
          perBoxItems: g?.perBoxItems || g?.per_box_items || null,
          contentInformationSource: g?.contentInformationSource || g?.content_information_source || null
        };
      });

    // Dacă planul a intrat în status ERRORED în Amazon, resetăm inbound_plan_id ca următorul apel să creeze un plan nou.
    if (inboundPlanStatus && String(inboundPlanStatus).toUpperCase() === "ERRORED" && inboundPlanId) {
      try {
        await supabase
          .from("prep_requests")
          .update({ inbound_plan_id: null })
          .eq("id", requestId)
          .eq("inbound_plan_id", inboundPlanId);
        planWarnings.push("Planul Amazon a intrat în status ERRORED. Am resetat planul; încearcă din nou.");
      } catch (resetErr) {
        console.warn("reset inbound_plan_id after ERRORED status failed", { traceId, error: resetErr });
      }
      inboundPlanId = null;
      inboundPlanStatus = null;
    }

    const safeInboundPlanId = sanitizeInboundPlanId(inboundPlanId);
    if (!safeInboundPlanId && inboundPlanId) {
      await resetInvalidInboundPlanId({ inboundPlanId, requestId });
    }
    const packGroups = packingGroupsFromAmazon.length
      ? normalizePackingGroups(packingGroupsFromAmazon)
      : Array.from(packGroupsMap.values()).map((g, idx) => ({
          ...g,
          title: g.destLabel ? `Pack group ${idx + 1} · ${g.destLabel}` : `Pack group ${idx + 1}`
        }));

    // Dacă avem deja inboundPlanId și cel puțin un packing group, nu mai afișăm warning-uri de creare/încărcare.
    if (safeInboundPlanId && packGroups.length) {
      planWarnings.length = 0;
    }

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

    const labelOwnerFromPacking = new Map<string, OwnerVal>();
    (packingGroupsFromAmazon || []).forEach((g) => {
      (g.items || []).forEach((it: any) => {
        const key = normalizeSku(it?.msku || it?.sku || it?.SellerSKU || it?.sellerSku || "");
        if (!key) return;
        const raw = (it?.labelOwner || it?.label_owner || it?.LabelOwner || "").toString().toUpperCase();
        if (raw === "NONE" || raw === "SELLER" || raw === "AMAZON") {
          labelOwnerFromPacking.set(key, raw as OwnerVal);
        }
      });
    });

    const skus = collapsedItems.map((c, idx) => {
      const skuKey = normalizeSku(c.sku);
      const prepInfo = prepGuidanceMap[skuKey] || {};
      const prepRequired = !!prepInfo.prepRequired;
      const manufacturerBarcodeEligible = prepInfo.barcodeInstruction
        ? isManufacturerBarcodeEligible(prepInfo.barcodeInstruction)
        : false;
      let labelOwner = deriveLabelOwner({ ...prepInfo, prepRequired, manufacturerBarcodeEligible });
      let labelOwnerSource: "prep-guidance" | "packing-group" | string = "prep-guidance";
      if (labelOwnerFromPacking.has(skuKey)) {
        labelOwner = labelOwnerFromPacking.get(skuKey) as OwnerVal;
        labelOwnerSource = "packing-group";
      }
      const requiresExpiry =
        (prepInfo.prepInstructions || []).some((p: string) => String(p || "").toLowerCase().includes("expir")) ||
        expiryRequiredBySku[skuKey] === true;
      const image = stockImageBySku[skuKey] || listingImages[skuKey] || null;
      const expiryVal = expirations[skuKey] || "";
      return {
        // Folosim id-ul real din prep_request_items pentru a evita erorile de tip UUID în UI/DB.
        id: c.itemIds?.[0] || `sku-${idx + 1}`,
        itemIds: c.itemIds || [],
        title: c.product_name || c.sku || `SKU ${idx + 1}`,
        sku: c.sku,
        asin: c.asin || "",
        storageType: "Standard-size",
        fnsku: fnskuBySku[c.sku] || null,
        packing: "individual",
        units: Number(c.units) || 0,
        expiry: expiryVal,
        expirySource: expirySourceBySku[skuKey] || null,
        expiryRequired: requiresExpiry,
        prepRequired,
        prepNotes: (prepInfo.prepInstructions || []).join(", "),
        manufacturerBarcodeEligible,
        labelOwner,
        labelOwnerSource,
        readyToPack: true,
        image
      };
    });

    const combinedWarning = planWarnings.length ? planWarnings.join(" ") : null;
    const operationLooksSuccessful =
      String(operationStatus || "").toUpperCase() === "SUCCESS" ||
      String(inboundPlanStatus || "").toUpperCase() === "ACTIVE";
    const uiOperationProblems = operationLooksSuccessful
      ? []
      : Array.isArray(operationProblems)
      ? operationProblems
      : [];
    // Nu bloca UI pe lipsa shipments; pentru step1 este suficient să existe inboundPlanId.
    const shipmentsPending = !safeInboundPlanId;
    // Persist inboundPlanId when newly created so viitoarele apeluri nu mai generează plan nou
    const dbPlanId = reqData.inbound_plan_id;
    if (inboundPlanId && !isLockId(inboundPlanId) && (inboundPlanId !== dbPlanId || isLockId(dbPlanId))) {
      // Persist always, even dacă există un inbound_plan_id vechi – altfel UI/step1b rămâne blocat pe planul anterior.
      const { data: updRow, error: updErr } = await supabase
        .from("prep_requests")
        .update({ inbound_plan_id: inboundPlanId })
        .eq("id", requestId)
        .select("inbound_plan_id")
        .maybeSingle();
      if (updErr) {
        console.warn("fba-plan persist inbound_plan_id failed", { traceId, error: updErr?.message || null });
      } else if (updRow?.inbound_plan_id) {
        inboundPlanId = updRow.inbound_plan_id;
      } else {
        // If another process beat us, reuse its plan id
        const { data: refetchRow } = await supabase
          .from("prep_requests")
          .select("inbound_plan_id")
          .eq("id", requestId)
          .maybeSingle();
        if (refetchRow?.inbound_plan_id && !isLockId(refetchRow.inbound_plan_id)) {
          inboundPlanId = refetchRow.inbound_plan_id;
        }
      }
    }

    // Persist packingOptionId so Step 1b UI can continue without re-picking the option on every call.
    if (packingOptionId && packingOptionId !== reqData.packing_option_id) {
      const { error: packErr } = await supabase
        .from("prep_requests")
        .update({ packing_option_id: packingOptionId })
        .eq("id", requestId);
      if (packErr) {
        console.warn("fba-plan persist packing_option_id failed", {
          traceId,
          error: packErr?.message || null
        });
      }
    }

    // Resolve lock placeholders to real plan id, dacă există
    if (isLockId(inboundPlanId)) {
      const { data: refetchRow, error: refetchErr } = await supabase
        .from("prep_requests")
        .select("inbound_plan_id")
        .eq("id", requestId)
        .maybeSingle();
      if (refetchErr) {
        console.warn("fba-plan refetch after lock failed", { traceId, error: refetchErr?.message || null });
      }
      if (refetchRow?.inbound_plan_id && !isLockId(refetchRow.inbound_plan_id)) {
        inboundPlanId = refetchRow.inbound_plan_id;
      } else {
        inboundPlanId = null;
      }
    }

    // Release lock if we held it and failed to create a plan
    if (!inboundPlanId && hasPlanLock) {
      await supabase
        .from("prep_requests")
        .update({ inbound_plan_id: null })
        .eq("id", requestId)
        .eq("inbound_plan_id", lockId);
    }

    // Persist semnătura itemelor pentru a detecta schimbări viitoare și a evita planuri desincronizate.
    try {
      const nextSnapshot = {
        ...(snapshotBase || {}),
        fba_inbound: {
          ...(snapshotBase?.fba_inbound || {}),
          planItemsSignature: currentItemsSignature,
          inboundPlanId: safeInboundPlanId,
          packingOptionId: packingOptionId || null,
          placementOptionId: reqData.placement_option_id || null
        }
      };
      await supabase.from("prep_requests").update({ amazon_snapshot: nextSnapshot }).eq("id", requestId);
    } catch (persistSnapErr) {
      console.error("persist plan items signature failed", { traceId, error: persistSnapErr });
    }

    const plan = {
      source: "amazon",
      amazonIntegrationId,
      marketplace: marketplaceId,
      companyId: reqData.company_id || null,
      id: primaryRequestId || reqData.request_id || reqData.requestId || null,
      requestId: primaryRequestId || reqData.request_id || reqData.requestId || null,
      inboundPlanId: safeInboundPlanId,
      inboundPlanStatus: safeInboundPlanId ? inboundPlanStatus || null : null,
      operationId: operationId || null,
      operationStatus: operationStatus || null,
      packingOptionId: packingOptionId || null,
      shipmentsPending,
      shipFrom: {
        name: shipFromAddress.name,
        address: formatAddress(shipFromAddress)
      },
      skus,
      packGroups,
      step1BoxPlan,
      shipments,
      raw: amazonJson,
      operationProblems: uiOperationProblems,
      listingAttributesRequiredBySku: parseRequiredProductAttrsBySku(uiOperationProblems),
      skuStatuses,
      ignoredItems,
      warning: [combinedWarning, ignoredItemsWarning].filter(Boolean).join(" "),
      blocking: false
    };

    const serverQuantities = validItems.map((it) => ({
      itemId: it.id,
      sku: normalizeSku(it.sku || ""),
      units: effectiveUnits(it)
    }));

    return new Response(
      JSON.stringify({
        plan,
        traceId,
        requestId: primaryRequestId || reqData.request_id || reqData.requestId || null,
        inboundPlanId: safeInboundPlanId,
        inboundPlanStatus: safeInboundPlanId ? inboundPlanStatus || null : null,
        operationId,
        operationStatus,
        operationProblems: uiOperationProblems,
        packingOptionId,
        blocking: false,
        shipmentsPending,
        scopes: lwaScopes,
        serverQuantities
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
