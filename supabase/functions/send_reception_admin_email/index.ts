import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAIL = Deno.env.get("PREP_ADMIN_EMAIL") ?? "contact@prep-center.eu";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE") ?? "";
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
        global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` } },
      })
    : null;
const FROM_EMAIL =
  Deno.env.get("PREP_FROM_EMAIL") && Deno.env.get("PREP_FROM_EMAIL")!.trim() !== ""
    ? Deno.env.get("PREP_FROM_EMAIL")!
    : "onboarding@resend.dev";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

interface ItemPayload {
  asin?: string | null;
  sku?: string | null;
  product_name?: string | null;
  quantity?: number | null;
}

interface Payload {
  shipment_id?: string | null;
  client_email?: string | null;
  client_name?: string | null;
  company_name?: string | null;
  store_name?: string | null;
  tracking_ids?: string[] | null;
  carrier?: string | null;
  notes?: string | null;
  fba_mode?: string | null;
  items?: ItemPayload[] | null;
  country?: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatText = (value?: string | null, fallback = "-") => {
  if (!value) return fallback;
  return escapeHtml(String(value));
};

const normalizeQuantity = (qty?: number | null) => {
  if (qty == null) return "-";
  const num = Number(qty);
  return Number.isFinite(num) ? String(num) : "-";
};

const renderItems = (items: ItemPayload[] = []) => {
  if (!items.length) {
    return `<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280;border-bottom:1px solid #eee">No product lines provided</td></tr>`;
  }

  return items
    .map((item) => {
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:Inter,Arial">${formatText(item.asin)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:Inter,Arial">${formatText(item.product_name)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-family:Inter,Arial">${normalizeQuantity(item.quantity)}</td>
        </tr>
      `;
    })
    .join("");
};

const subjectFromPayload = (payload: Payload) => {
  const shortId = payload.shipment_id ? String(payload.shipment_id).slice(0, 8) : null;
  const suffix = shortId ? `#${shortId}` : "(unspecified)";
  const company = payload.company_name || payload.store_name || payload.client_name || "client";
  return `New receiving ${suffix} announced by ${company}`;
};

const renderHtml = (payload: Payload) => {
  const trackingList = Array.isArray(payload.tracking_ids) ? payload.tracking_ids.filter(Boolean) : [];
  const trackingBlock = trackingList.length
    ? `
      <div style="margin-top:8px">
        <strong>Tracking IDs:</strong>
        <ul style="margin:4px 0 0 18px;padding:0">
          ${trackingList.map((t) => `<li>${formatText(t)}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  const metaRows = [
    { label: "Receiving ID", value: payload.shipment_id ? `#${formatText(payload.shipment_id)}` : "-" },
    { label: "Company", value: formatText(payload.company_name || payload.store_name || payload.client_name) },
    { label: "Client", value: formatText(payload.client_name) },
    { label: "Client email", value: formatText(payload.client_email) },
    { label: "Carrier", value: formatText(payload.carrier) },
    { label: "Send to Amazon", value: formatText(payload.fba_mode) },
  ]
    .map(
      (row) => `
        <div style="margin-bottom:4px">
          <strong>${row.label}:</strong> ${row.value}
        </div>
      `,
    )
    .join("");

  const notesBlock = payload.notes
    ? `<div style="margin-top:8px;padding:10px;border-left:3px solid #2563eb;background:#eef2ff"><strong>Notes:</strong> ${formatText(payload.notes)}</div>`
    : "";

  return `
  <div style="font-family:Inter,Arial,sans-serif;color:#111;line-height:1.45">
    <h1 style="font-size:22px;margin:0 0 12px 0">New receiving announced</h1>
    ${metaRows}
    ${trackingBlock}
    ${notesBlock}

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:16px">
      <thead>
        <tr style="background:#f3f4f6;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
          <th style="padding:10px 12px;text-align:left;font-family:Inter,Arial">ASIN</th>
          <th style="padding:10px 12px;text-align:left;font-family:Inter,Arial">Product</th>
          <th style="padding:10px 12px;text-align:right;font-family:Inter,Arial">Qty</th>
        </tr>
      </thead>
      <tbody>
        ${renderItems(payload.items ?? [])}
      </tbody>
    </table>

    <p style="margin-top:16px;color:#4b5563;font-size:13px">This notification was generated automatically when the client announced incoming goods.</p>
  </div>
  `;
};

const normalizeCountry = (value?: string | null) => {
  const upper = (value || "").trim().toUpperCase();
  if (!upper) return "FR";
  if (upper === "DE" || upper === "GERMANY" || upper === "DEU") return "DE";
  if (upper === "FR" || upper === "FRANCE" || upper === "FRA") return "FR";
  return upper;
};

async function resolveAdminEmail(payload: Payload): Promise<{ to: string | null; enabled: boolean }> {
  const country = normalizeCountry(payload.country);
  // default fallback
  let fallback = ADMIN_EMAIL;

  if (!supabase) return { to: fallback, enabled: true };

  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "notifications_admin")
      .maybeSingle();
    if (error || !data?.value) return { to: fallback, enabled: true };

    const settings = data.value as any;
    const perCountry = settings?.receptions?.[country] || settings?.receptions?.[country?.toLowerCase?.() || country];
    if (perCountry) {
      return {
        to: perCountry.enabled === false ? null : perCountry.email || fallback,
        enabled: perCountry.enabled !== false,
      };
    }
  } catch (err) {
    console.error("resolveAdminEmail error", err);
  }
  return { to: fallback, enabled: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  if (!RESEND_KEY) {
    return new Response("Missing RESEND_API_KEY", { status: 500, headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as Payload;
    const target = await resolveAdminEmail(payload);
    if (!target.enabled || !target.to) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
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
        to: [target.to],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(text || "Failed to send email", { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
