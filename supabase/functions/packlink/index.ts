import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient, User } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const PACKLINK_API_KEY = Deno.env.get("PACKLINK_API_KEY") ?? "";
const PACKLINK_BASE_URL = (Deno.env.get("PACKLINK_BASE_URL") ?? "https://api.packlink.com/v1/").replace(/\/+$/, "/");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
      ...headers
    }
  });
}

function missingPacklinkKey() {
  return json({ error: "PACKLINK_API_KEY is not configured" }, 500);
}

async function requireUser(req: Request): Promise<{ user?: User; error?: Response }> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader) {
    return { error: json({ error: "Missing Authorization header" }, 401) };
  }
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const {
    data: { user },
    error
  } = await anon.auth.getUser();
  if (error || !user) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }
  return { user };
}

async function callPacklink(path: string, method: "GET" | "POST", body?: unknown) {
  if (!PACKLINK_API_KEY) return { ok: false, status: 500, data: null, message: "Missing PACKLINK_API_KEY" };
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${PACKLINK_BASE_URL}${normalizedPath}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${PACKLINK_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_e) {
    data = text;
  }
  return { ok: res.ok, status: res.status, data, message: res.statusText };
}

function normalizeStatus(value: unknown) {
  if (!value) return "pending";
  return String(value).trim().toLowerCase();
}

function extractPrice(payload: any) {
  if (!payload) return null;
  if (typeof payload === "number") return payload;
  if (payload.price && typeof payload.price === "number") return payload.price;
  if (payload.total_price && typeof payload.total_price === "number") return payload.total_price;
  if (payload.price && typeof payload.price === "object") {
    const priceObj = payload.price;
    const keys = ["total", "final_price", "base_price", "amount"];
    for (const k of keys) {
      if (priceObj[k] != null && !Number.isNaN(Number(priceObj[k]))) return Number(priceObj[k]);
    }
  }
  return null;
}

function extractTracking(payload: any) {
  if (!payload) return null;
  const candidates = [
    payload.tracking_number,
    payload.trackingNumber,
    payload.tracking_code,
    payload.trackingCode,
    Array.isArray(payload.tracking_codes) ? payload.tracking_codes[0] : null,
    Array.isArray(payload.trackingCodes) ? payload.trackingCodes[0] : null
  ];
  return candidates.find((v) => typeof v === "string" && v.trim()) || null;
}

function extractLabelUrl(payload: any) {
  if (!payload) return null;
  const candidates = [
    payload.label_url,
    payload.labelUrl,
    payload.label_pdf,
    payload.labelPdf,
    payload.label,
    payload.label?.url,
    payload.files?.labels?.[0]?.url
  ];
  const val = candidates.find((v) => typeof v === "string" && v.trim());
  return val || null;
}

function extractCarrier(payload: any) {
  if (!payload) return null;
  const candidates = [
    payload.carrier,
    payload.provider,
    payload.service?.carrier,
    payload.service?.provider,
    payload.service?.name
  ];
  return candidates.find((v) => typeof v === "string" && v.trim()) || null;
}

function extractPacklinkId(payload: any) {
  if (!payload) return null;
  const candidates = [payload.id, payload.shipmentId, payload.shipment_id, payload.reference, payload.tracking_id];
  return candidates.find((v) => typeof v === "string" && v.trim()) || null;
}

async function handleServices(req: Request, _url: URL) {
  const { user, error } = await requireUser(req);
  if (error) return error;
  if (!PACKLINK_API_KEY) return missingPacklinkKey();

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Invalid payload" }, 400);
  }

  const packlinkRes = await callPacklink("services", "POST", payload);
  if (!packlinkRes.ok) {
    return json(
      { error: "Packlink services failed", details: packlinkRes.data ?? packlinkRes.message },
      packlinkRes.status || 502
    );
  }

  return json({ services: packlinkRes.data, user_id: user.id });
}

async function handleCreateShipment(req: Request, _url: URL) {
  const { user, error } = await requireUser(req);
  if (error) return error;
  if (!PACKLINK_API_KEY) return missingPacklinkKey();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid payload" }, 400);
  }

  const userId = (body as any).user_id || user.id;
  if (userId !== user.id) {
    return json({ error: "Forbidden for provided user_id" }, 403);
  }

  const packlinkPayload = { ...body };
  delete (packlinkPayload as any).user_id;

  const packlinkRes = await callPacklink("shipments", "POST", packlinkPayload);
  if (!packlinkRes.ok) {
    return json(
      { error: "Packlink create shipment failed", details: packlinkRes.data ?? packlinkRes.message },
      packlinkRes.status || 502
    );
  }

  const pl = packlinkRes.data as any;
  const packlinkId = extractPacklinkId(pl) || crypto.randomUUID();
  const trackingNumber = extractTracking(pl);
  const labelUrl = extractLabelUrl(pl);
  const carrier = extractCarrier(pl);
  const status = normalizeStatus(pl?.status || pl?.state || "pending");
  const price = extractPrice(pl);

  const record = {
    user_id: user.id,
    packlink_id: packlinkId,
    status,
    carrier,
    tracking_number: trackingNumber,
    label_url: labelUrl,
    price: Number.isFinite(price as number) ? Number(price) : null,
    service_id: (body as any).service_id ?? (pl?.service_id || null),
    from_address: (body as any).from ?? (body as any).from_address ?? null,
    to_address: (body as any).to ?? (body as any).to_address ?? null,
    parcel: (body as any).parcel ?? (body as any).parcels ?? null
  };

  const { data, error: dbError } = await serviceClient
    .from("packlink_shipments")
    .upsert(record, { onConflict: "packlink_id" })
    .select()
    .single();

  if (dbError) {
    return json({ error: dbError.message }, 500);
  }

  return json({ shipment: data, packlink: pl });
}

async function handleListShipments(req: Request, url: URL) {
  const { user, error } = await requireUser(req);
  if (error) return error;

  const userId = url.searchParams.get("user_id") || user.id;
  if (userId !== user.id) {
    return json({ error: "Forbidden for provided user_id" }, 403);
  }

  const status = url.searchParams.get("status");
  let query = serviceClient
    .from("packlink_shipments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error: dbError } = await query;
  if (dbError) {
    return json({ error: dbError.message }, 500);
  }
  return json({ shipments: data || [] });
}

async function handleGetShipment(req: Request, url: URL, id: string) {
  const { user, error } = await requireUser(req);
  if (error) return error;
  if (!id) return json({ error: "Missing id" }, 400);

  const { data, error: dbError } = await serviceClient
    .from("packlink_shipments")
    .select("*")
    .or(`id.eq.${id},packlink_id.eq.${id}`)
    .maybeSingle();

  if (dbError) return json({ error: dbError.message }, 500);
  if (!data || data.user_id !== user.id) return json({ error: "Not found" }, 404);

  return json({ shipment: data });
}

async function handleWebhook(req: Request) {
  if (!PACKLINK_API_KEY) return missingPacklinkKey();

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ error: "Invalid payload" }, 400);
  }

  const packlinkId = extractPacklinkId(payload);
  const trackingNumber = extractTracking(payload);
  const status = normalizeStatus((payload as any)?.status || (payload as any)?.state || (payload as any)?.event);
  const labelUrl = extractLabelUrl(payload);
  const carrier = extractCarrier(payload);

  let shipmentId: string | null = null;
  if (packlinkId || trackingNumber) {
    const filters = [];
    if (packlinkId) filters.push(`packlink_id.eq.${packlinkId}`);
    if (trackingNumber) filters.push(`tracking_number.eq.${trackingNumber}`);
    const { data } = await serviceClient
      .from("packlink_shipments")
      .select("id, status")
      .or(filters.join(","))
      .maybeSingle();
    if (data?.id) {
      shipmentId = data.id;
      const patch: Record<string, unknown> = { status };
      if (trackingNumber) patch.tracking_number = trackingNumber;
      if (labelUrl) patch.label_url = labelUrl;
      if (carrier) patch.carrier = carrier;
      await serviceClient.from("packlink_shipments").update(patch).eq("id", data.id);
    }
  }

  await serviceClient.from("packlink_webhooks").insert({
    shipment_id: shipmentId,
    event: status,
    payload
  });

  return json({ ok: true });
}

function toCsvValue(val: unknown) {
  if (val == null) return "";
  const s = typeof val === "object" ? JSON.stringify(val) : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function handleReports(req: Request, url: URL) {
  const { user, error } = await requireUser(req);
  if (error) return error;

  const userId = url.searchParams.get("user_id") || user.id;
  if (userId !== user.id) return json({ error: "Forbidden for provided user_id" }, 403);

  const { data, error: dbError } = await serviceClient
    .from("packlink_shipments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (dbError) return json({ error: dbError.message }, 500);

  const format = url.searchParams.get("format") || "json";
  if (format === "csv") {
    const headers = [
      "packlink_id",
      "status",
      "carrier",
      "tracking_number",
      "price",
      "created_at",
      "label_url",
      "from_address",
      "to_address"
    ];
    const rows = (data || []).map((row) =>
      headers
        .map((h) => {
          switch (h) {
            case "from_address":
              return toCsvValue(row.from_address);
            case "to_address":
              return toCsvValue(row.to_address);
            default:
              return toCsvValue((row as any)[h]);
          }
        })
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="packlink_shipments.csv"`
      }
    });
  }

  return json({ shipments: data || [] });
}

function parsePath(url: URL) {
  // Robust prefix stripping: works for /functions/v1/packlink/... or any path containing /packlink
  const marker = "/packlink";
  const raw = url.pathname;
  const idx = raw.indexOf(marker);
  let pathname = idx >= 0 ? raw.slice(idx + marker.length) : raw;
  if (!pathname.startsWith("/")) pathname = "/" + pathname;
  if (pathname !== "/" && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  if (pathname.startsWith("/api/packlink")) {
    pathname = pathname.replace("/api/packlink", "") || "/";
  }
  return pathname || "/";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = parsePath(url);

  try {
    if (req.method === "POST" && path === "/services") {
      return await handleServices(req, url);
    }
    if (req.method === "POST" && path === "/shipments") {
      return await handleCreateShipment(req, url);
    }
    if (req.method === "GET" && path === "/shipments") {
      return await handleListShipments(req, url);
    }
    if (req.method === "GET" && path.startsWith("/shipments/")) {
      const id = path.replace("/shipments/", "").replace(/\/$/, "");
      return await handleGetShipment(req, url, id);
    }
    if (req.method === "POST" && path === "/webhook") {
      return await handleWebhook(req);
    }
    if (req.method === "GET" && path === "/reports") {
      return await handleReports(req, url);
    }

    return json({ error: "Not found", path }, 404);
  } catch (err) {
    console.error("Packlink function error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
