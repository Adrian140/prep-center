// FILE: supabase/functions/send_prep_confirm_email/index.ts
// Supabase Edge Function (Deno) + Resend

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
}

// ===== ENV =====
const FROM_EMAIL = Deno.env.get("PREP_FROM_EMAIL") ?? "no-reply@prep-center.eu";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")  ?? "";

// ===== Brand assets =====
const LOGO_URL =
  "https://raw.githubusercontent.com/Adrian140/prep-center/main/public/branding/fba-prep-logo.svg";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function subjectFromPayload(p: Payload) {
  const subjectId =
    (p.subject_id?.toString().trim()) ||
    (p.fba_shipment_id?.toString().trim()) ||
    (p.request_id ? p.request_id.slice(0, 8) : "request");
  return { subjectId, subject: `Prep request ${subjectId} confirmed` };
}
function renderHtml(p: Payload, subjectId: string) {
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
    ? `<p style="margin:8px 0 0 0"><strong>Admin note:</strong> ${escapeHtml(p.note)}</p>`
    : "";

  const hasTracking = Array.isArray(p.tracking_ids) && p.tracking_ids.length > 0;
  const infoLines = [
    `<div style="margin-bottom:4px"><strong>Prep request ID:</strong> ${escapeHtml(subjectId)}</div>`,
    p.subject_id
      ? `<div style="margin-bottom:4px"><strong>Amazon order ID:</strong> ${escapeHtml(String(p.subject_id))}</div>`
      : "",
    p.fba_shipment_id
      ? `<div style="margin-bottom:4px"><strong>Shipment ID:</strong> ${escapeHtml(p.fba_shipment_id)}</div>`
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

   <h1 style="font-size:24px;margin:0 0 10px 0">Prep request ${escapeHtml(subjectId)} confirmed</h1>

    <p style="margin:0 0 12px 0">
      Hello${p.client_name ? ` ${escapeHtml(p.client_name)}` : ""}${p.company_name ? `, ${escapeHtml(`(${p.company_name})`)}` : ""},
    </p>
    <p style="margin:0 0 12px 0">
      Your prep request has been confirmed. Below you can find the shipped / removed units.
    </p>

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
    if (!RESEND_KEY) {
      return new Response("Missing RESEND_API_KEY", { status: 500, headers: corsHeaders });
    }

    const payload = (await req.json()) as Payload;
    if (!payload?.email) {
      return new Response("Missing recipient email", { status: 400, headers: corsHeaders });
    }

     const { subjectId, subject } = subjectFromPayload(payload);
    const html = renderHtml(payload, subjectId);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Prep Center <${FROM_EMAIL}>`,
        to: [payload.email],
        bcc: ["contact@prep-center.eu"],
        // punctul 5: răspunsurile merg la adresa clientului
        reply_to: payload.email ? [payload.email] : undefined,
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
