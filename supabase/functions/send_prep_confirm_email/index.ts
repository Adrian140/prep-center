// FILE: supabase/functions/send_prep_confirm_email/index.ts
// Supabase Edge Function (Deno) + Resend

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ===== Payload types =====
interface Item {
  asin: string | null;
  sku: string | null;
  image_url?: string | null;
  requested: number | null; // total cerut
  sent: number | null;      // trimis
  removed: number | null;   // scăzut (= requested - sent)
  note: string | null;      // notă pe item
}

interface Payload {
  request_id: string;
  email: string | null;         // destinatar (client)
  client_name: string | null;   // ex: "Bucur Adrian"
  company_name: string | null;  // ex: "FISH VALLEY S.R.L."
  note: string | null;          // obs_admin de pe header (opțional)
  items: Item[] | null;         // liniile
  subject_id?: string | null;
  // Opționale:
  fba_shipment_id?: string | null;
  tracking_ids?: string[] | null;
  marketplace?: string | null;
  country?: string | null;
  destination_country?: string | null;
  warehouse_country?: string | null;
}

// ===== ENV =====
const FROM_EMAIL = Deno.env.get("PREP_FROM_EMAIL") ?? "no-reply@prep-center.eu";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "contact@prep-center.eu";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")  ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE") ?? "";
const INTERNAL_SERVICE_ROLE_KEY = Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ?? "";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
        global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` } }
      })
    : null;

// ===== Brand assets =====
const LOGO_URL =
  "https://prep-center.eu/branding/fulfillment-prep-logo.png";

const normalizeCountry = (value?: string | null) => {
  const upper = (value || "").trim().toUpperCase();
  if (!upper && value === null) return null;
  if (!upper) return "FR";
  if (upper === "DE" || upper === "GERMANY" || upper === "DEU") return "DE";
  if (upper === "FR" || upper === "FRANCE" || upper === "FRA") return "FR";
  return upper;
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function subjectFromPayload(p: Payload) {
  const prepId = p.request_id ? `Request #${p.request_id.slice(0, 8)}` : "Prep request";
  return { prepId, subject: `Prep request ${prepId} confirmed` };
}

async function enrichItemsFromSupabase(items: Item[]): Promise<Item[]> {
  if (!supabase) return items;
  const asins = Array.from(new Set(items.map((it) => it.asin).filter(Boolean))) as string[];
  if (!asins.length) return items;
  const { data, error } = await supabase
    .from("stock_items")
    .select("asin, image_url")
    .in("asin", asins);
  if (error) {
    console.error("enrichItemsFromSupabase error", error);
    return items;
  }
  const byAsin = (data || []).reduce<Record<string, { image_url?: string | null }>>((acc, row) => {
    acc[String(row.asin)] = { image_url: row.image_url ?? null };
    return acc;
  }, {});
  return items.map((it) => {
    const extra = it.asin ? byAsin[it.asin] : null;
    return {
      ...it,
      image_url: it.image_url ?? extra?.image_url ?? null
    };
  });
}

async function shouldNotifyClient(payload: Payload): Promise<boolean> {
  if (!supabase || !payload?.request_id) return true;
  const { data: requestRow, error: requestError } = await supabase
    .from("prep_requests")
    .select("user_id")
    .eq("id", payload.request_id)
    .maybeSingle();
  if (requestError || !requestRow?.user_id) {
    if (requestError) {
      console.error("prep_requests lookup error", requestError);
    }
    return true;
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("notify_prep_shipments")
    .eq("id", requestRow.user_id)
    .maybeSingle();
  if (profileError) {
    console.error("profiles lookup error", profileError);
    return true;
  }
  return profileRow?.notify_prep_shipments !== false;
}

async function resolveAdminEmail(payload: Payload): Promise<{ to: string | null; enabled: boolean }> {
  const country = normalizeCountry(
    payload.country || payload.marketplace || payload.destination_country || payload.warehouse_country
  );
  if (!supabase) return { to: ADMIN_EMAIL, enabled: true };
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "notifications_admin")
      .maybeSingle();
    if (error || !data?.value) return { to: ADMIN_EMAIL, enabled: true };
    const settings = data.value as any;
    const perCountry = settings?.prep_requests?.[country || "FR"] || settings?.prep_requests?.[String(country || "FR").toLowerCase()];
    if (perCountry) {
      return {
        to: perCountry.enabled === false ? null : perCountry.email || ADMIN_EMAIL,
        enabled: perCountry.enabled !== false,
      };
    }
  } catch (err) {
    console.error("resolveAdminEmail prep", err);
  }
  return { to: ADMIN_EMAIL, enabled: true };
}
function renderHtml(p: Payload, prepId: string) {
  const rows = (p.items ?? []).map((it) => {
    const asin = it.asin ?? "-";
    const sku = it.sku ?? "-";
    const imageTag = it.image_url
      ? `<img src="${escapeHtml(String(it.image_url))}" alt="" style="max-width:60px;max-height:60px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;" />`
      : "—";
    const req = Number(it.requested ?? 0);
    const snd = Number(it.sent ?? 0);
    const rmd = Number.isFinite(it.removed) ? Number(it.removed) : Math.max(req - snd, 0);
    const note = (it.note ?? "").trim() || "—";

    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:Inter,Arial;text-align:center">${imageTag}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:Inter,Arial">${escapeHtml(String(asin))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:Inter,Arial">${escapeHtml(String(sku))}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${req}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${snd}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">${rmd}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:Inter,Arial">${escapeHtml(note)}</td>
      </tr>
    `;
  }).join("");

  const headerNote = (p.note && p.note.trim())
    ? `<p style="margin:8px 0 0 0"><strong>Note:</strong> ${escapeHtml(p.note)}</p>`
    : "";

  const hasTracking = Array.isArray(p.tracking_ids) && p.tracking_ids.length > 0;
  const infoLines = [
    `<div style="margin-bottom:4px"><strong>Prep request ID:</strong> ${escapeHtml(prepId)}</div>`,
    p.fba_shipment_id
      ? `<div style="margin-bottom:4px"><strong>Shipment ID:</strong> ${escapeHtml(p.fba_shipment_id)}</div>`
      : "",
    p.marketplace
      ? `<div style="margin-bottom:4px"><strong>Marketplace:</strong> ${escapeHtml(p.marketplace)}</div>`
      : ""
  ].filter(Boolean).join("");

  const trackingBlock = hasTracking
    ? `
      <div style="margin-top:6px">
        <strong>Tracking IDs:</strong>
        <ul style="margin:6px 0 0 18px;padding:0">
          ${p.tracking_ids!.map(t => `<li style="margin:2px 0">${escapeHtml(String(t))}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  const shipmentBlock =
    infoLines || trackingBlock
      ? `
    <div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa">
      ${infoLines}
      ${trackingBlock}
    </div>
  `
      : "";

  return `
  <div style="font-family:Inter,Arial,sans-serif;color:#111;line-height:1.45">
    <!-- Header -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px">
      <tr>
        <td style="padding:0 0 12px 0">
          <img src="${LOGO_URL}" alt="FBA Prep Logistics" style="height:46px;display:block" />
        </td>
      </tr>
    </table>

   <h1 style="font-size:24px;margin:0 0 10px 0">Prep request ${escapeHtml(prepId)} confirmed</h1>

    <p style="margin:0 0 12px 0">
      Hello${p.client_name ? ` ${escapeHtml(p.client_name)}` : ""}${p.company_name ? `, ${escapeHtml(`(${p.company_name})`)}` : ""},
    </p>
    <p style="margin:0 0 12px 0">
      Your prep request has been confirmed. Below you can find the shipped / removed units.
    </p>
    <div style="margin:12px 0 14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc">
      <div style="font-weight:600;margin-bottom:6px">English</div>
      <div>The receipt of your goods has been confirmed.</div>
      <div>The items have been prepared and are ready for shipment.</div>
      <div style="height:10px"></div>
      <div style="font-weight:600;margin-bottom:6px">Français</div>
      <div>La réception de vos marchandises a été confirmée.</div>
      <div>Les produits ont été préparés et sont prêts à être expédiés.</div>
    </div>

    ${headerNote}
    ${shipmentBlock}

    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:14px">
      <thead>
        <tr style="background:#f8fafc;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
          <th style="padding:10px 12px;text-align:left;font-family:Inter,Arial">Image</th>
          <th style="padding:10px 12px;text-align:left;font-family:Inter,Arial">ASIN</th>
          <th style="padding:10px 12px;text-align:left;font-family:Inter,Arial">SKU</th>
          <th style="padding:10px 12px;text-align:right;font-family:Inter,Arial">Requested</th>
          <th style="padding:10px 12px;text-align:right;font-family:Inter,Arial">Sent</th>
          <th style="padding:10px 12px;text-align:right;font-family:Inter,Arial">Removed</th>
          <th style="padding:10px 12px;text-align:left;font-family:Inter,Arial">Note</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `
          <tr>
            <td colspan="6" style="padding:14px 12px;text-align:center;color:#6b7280;border-bottom:1px solid #eee">No items</td>
          </tr>`}
      </tbody>
    </table>

    <p style="margin:16px 0 0 0">Thank you!</p>

    <!-- Footer -->
    <div style="margin-top:22px;border-top:1px solid #eee;padding-top:12px;font-size:12px;color:#6b7280">
      Prep Center · contact@prep-center.eu
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    const internalKey = req.headers.get("x-internal-service-key") || "";
    const apiKey = req.headers.get("apikey") || "";
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    const allowedKeys = new Set(
      [INTERNAL_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE].filter(Boolean)
    );
    if (allowedKeys.size > 0) {
      const authorized =
        allowedKeys.has(internalKey) ||
        allowedKeys.has(apiKey) ||
        allowedKeys.has(bearer);
      if (!authorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (!RESEND_KEY) {
      return new Response("Missing RESEND_API_KEY", { status: 500, headers: corsHeaders });
    }

    const payload = (await req.json()) as Payload;
    const notifyClient = await shouldNotifyClient(payload);
    const hasClientEmail = !!payload?.email;
    const sendToClient = notifyClient && hasClientEmail;
    const adminTarget = await resolveAdminEmail(payload);
    const recipients = sendToClient ? [payload.email as string] : [adminTarget.to || ADMIN_EMAIL];
    const bccRecipients =
      sendToClient && adminTarget.enabled && adminTarget.to ? [adminTarget.to] : [];

    // Enrich items cu EAN / imagine din stock_items dacă lipsesc
    const items = payload.items ? await enrichItemsFromSupabase(payload.items) : [];

    const { prepId, subject } = subjectFromPayload(payload);
    const html = renderHtml({ ...payload, items }, prepId);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Prep Center <${FROM_EMAIL}>`,
        to: recipients,
        bcc: bccRecipients,
        // punctul 5: răspunsurile merg la adresa clientului
        reply_to: sendToClient && payload.email ? [payload.email] : undefined,
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
