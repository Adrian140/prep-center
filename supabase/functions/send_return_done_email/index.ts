import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReturnItem {
  asin?: string | null;
  sku?: string | null;
  qty?: number | null;
  stock_item?: {
    name?: string | null;
    image_url?: string | null;
    asin?: string | null;
    sku?: string | null;
  } | null;
}

interface Payload {
  return_id: string | number;
  email: string | null;
  client_name: string | null;
  company_name: string | null;
  marketplace?: string | null;
  note?: string | null;
  tracking_ids?: string[] | null;
  items?: ReturnItem[] | null;
}

const FROM_EMAIL = Deno.env.get("PREP_FROM_EMAIL") ?? "no-reply@prep-center.eu";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "contact@prep-center.eu";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE") ??
  "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const INTERNAL_SERVICE_ROLE_KEY = Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ?? "";

const adminClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
        global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` } },
      })
    : null;

const authClient =
  SUPABASE_URL && (SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE)
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE)
    : null;

const LOGO_URL = "https://prep-center.eu/branding/fulfillment-prep-logo.png";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeTrackingIds(ids: string[] | null | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function subjectFromPayload(payload: Payload) {
  const returnId = String(payload.return_id || "").trim() || "unknown";
  return `Return #${returnId} prepared`;
}

async function isAuthorizedAdmin(req: Request) {
  const internalKey = req.headers.get("x-internal-service-key") || "";
  const apiKey = req.headers.get("apikey") || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

  const allowedKeys = new Set(
    [INTERNAL_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE].filter(Boolean),
  );
  if (allowedKeys.size > 0) {
    if (allowedKeys.has(internalKey) || allowedKeys.has(apiKey) || allowedKeys.has(bearer)) {
      return true;
    }
  }

  if (!bearer || !authClient || !adminClient) return false;
  const { data: userData, error: userError } = await authClient.auth.getUser(bearer);
  if (userError || !userData?.user?.id) return false;

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("account_type, is_limited_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile) return false;

  return String(profile.account_type || "").toLowerCase() === "admin";
}

function renderItems(items: ReturnItem[]) {
  return items
    .map((item) => {
      const asin = String(item.asin || item.stock_item?.asin || "-");
      const sku = String(item.sku || item.stock_item?.sku || "-");
      const qty = Number(item.qty || 0);
      const imageUrl = item.stock_item?.image_url || null;
      const productName = String(item.stock_item?.name || "").trim() || "Product";
      const imageTag = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="" style="max-width:60px;max-height:60px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;" />`
        : "—";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">${imageTag}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee">${escapeHtml(asin)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee">${escapeHtml(sku)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee">${escapeHtml(productName)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${qty}</td>
        </tr>
      `;
    })
    .join("");
}

function renderHtml(payload: Payload) {
  const returnId = String(payload.return_id || "").trim() || "unknown";
  const trackingIds = normalizeTrackingIds(payload.tracking_ids);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemsRows = renderItems(items);
  const trackingBlock = trackingIds.length
    ? `
      <div style="margin-top:6px">
        <strong>Return tracking ID${trackingIds.length > 1 ? "s" : ""}:</strong>
        <ul style="margin:6px 0 0 18px;padding:0">
          ${trackingIds.map((id) => `<li style="margin:2px 0">${escapeHtml(id)}</li>`).join("")}
        </ul>
      </div>
    `
    : `
      <div style="margin-top:6px"><strong>Return tracking ID:</strong> pending assignment</div>
    `;

  const noteBlock = String(payload.note || "").trim()
    ? `<p style="margin:12px 0 0 0"><strong>Note:</strong> ${escapeHtml(String(payload.note || "").trim())}</p>`
    : "";

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#111;line-height:1.45">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px">
        <tr>
          <td style="padding:0 0 12px 0">
            <img src="${LOGO_URL}" alt="Prep Center" style="height:46px;display:block" />
          </td>
        </tr>
      </table>

      <h1 style="font-size:24px;margin:0 0 10px 0">Your return is prepared</h1>
      <p style="margin:0 0 12px 0">
        Hello${payload.client_name ? ` ${escapeHtml(payload.client_name)}` : ""}${payload.company_name ? `, ${escapeHtml(`(${payload.company_name})`)}` : ""},
      </p>
      <p style="margin:0 0 12px 0">
        Your return preparation has been completed and it is now waiting to be handed over to a courier or to a collection point.
      </p>

      <div style="margin:12px 0 14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc">
        <div style="font-weight:600;margin-bottom:6px">English</div>
        <div>Your return has been prepared successfully.</div>
        <div>It is now waiting to be handed over to a courier or to a collection point.</div>
        <div style="height:10px"></div>
        <div style="font-weight:600;margin-bottom:6px">Français</div>
        <div>Votre retour a été préparé avec succès.</div>
        <div>Il attend maintenant d'être remis à un transporteur ou à un point de collecte.</div>
      </div>

      <div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa">
        <div style="margin-bottom:4px"><strong>Return ID:</strong> ${escapeHtml(returnId)}</div>
        ${payload.marketplace ? `<div style="margin-bottom:4px"><strong>Marketplace:</strong> ${escapeHtml(String(payload.marketplace))}</div>` : ""}
        ${trackingBlock}
      </div>

      ${noteBlock}

      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:14px">
        <thead>
          <tr style="background:#f8fafc;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
            <th style="padding:10px 12px;text-align:left">Image</th>
            <th style="padding:10px 12px;text-align:left">ASIN</th>
            <th style="padding:10px 12px;text-align:left">SKU</th>
            <th style="padding:10px 12px;text-align:left">Product</th>
            <th style="padding:10px 12px;text-align:right">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows || `
            <tr>
              <td colspan="5" style="padding:14px 12px;text-align:center;color:#6b7280;border-bottom:1px solid #eee">No items</td>
            </tr>`}
        </tbody>
      </table>

      <p style="margin:16px 0 0 0">Thank you!</p>

      <div style="margin-top:22px;border-top:1px solid #eee;padding-top:12px;font-size:12px;color:#6b7280">
        Prep Center · contact@prep-center.eu
      </div>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    if (!RESEND_KEY) {
      return new Response("Missing RESEND_API_KEY", { status: 500, headers: corsHeaders });
    }

    const authorized = await isAuthorizedAdmin(req);
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    const recipient = String(payload.email || "").trim();
    if (!recipient) {
      return new Response(JSON.stringify({ error: "Missing client email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = subjectFromPayload(payload);
    const html = renderHtml(payload);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Prep Center <${FROM_EMAIL}>`,
        to: [recipient],
        bcc: ADMIN_EMAIL ? [ADMIN_EMAIL] : undefined,
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(`Resend error: ${txt}`, { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`Edge error: ${e?.message || e}`, { status: 500, headers: corsHeaders });
  }
});
