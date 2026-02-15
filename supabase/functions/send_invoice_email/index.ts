import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_EMAIL = Deno.env.get("PREP_FROM_EMAIL") ?? "no-reply@prep-center.eu";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const LOGO_URL = "https://prep-center.eu/branding/fulfillment-prep-logo.png";

type DocumentType = "invoice" | "proforma";

interface InvoiceEmailPayload {
  email: string | null;
  client_name?: string | null;
  company_name?: string | null;
  document_type?: DocumentType | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  net_amount?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  attachment_filename?: string | null;
  attachment_base64?: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value?: number | null) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0.00 EUR";
  return `${amount.toFixed(2)} EUR`;
};

const normalizeDocumentType = (value?: string | null): DocumentType =>
  String(value || "").toLowerCase() === "proforma" ? "proforma" : "invoice";

const buildSubject = (documentType: DocumentType, invoiceNumber: string) =>
  documentType === "proforma"
    ? `Proforma ${invoiceNumber} attached`
    : `Final invoice ${invoiceNumber} attached`;

const renderHtml = (payload: InvoiceEmailPayload) => {
  const documentType = normalizeDocumentType(payload.document_type);
  const invoiceNumber = String(payload.invoice_number || "-");
  const dueDate = payload.due_date ? escapeHtml(String(payload.due_date)) : "-";
  const clientName = payload.client_name ? ` ${escapeHtml(String(payload.client_name))}` : "";
  const companySuffix = payload.company_name
    ? ` (${escapeHtml(String(payload.company_name))})`
    : "";

  const title = documentType === "proforma"
    ? `Proforma ${escapeHtml(invoiceNumber)}`
    : `Final Invoice ${escapeHtml(invoiceNumber)}`;

  const documentLabel = documentType === "proforma" ? "Proforma" : "Final Invoice";
  const mainLine = documentType === "proforma"
    ? "Please find attached your Proforma issued for your company."
    : "Please find attached your Final Invoice issued for your company.";
  const note = documentType === "proforma"
    ? "Note: This is a proforma document and not the final fiscal invoice."
    : "This final invoice was issued after conversion from proforma.";

  return `
  <div style="font-family:Inter,Arial,sans-serif;color:#111;line-height:1.45">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px">
      <tr>
        <td style="padding:0 0 12px 0">
          <img src="${LOGO_URL}" alt="Ecom Prep Hub" style="height:46px;display:block" />
        </td>
      </tr>
    </table>

    <h1 style="font-size:24px;margin:0 0 10px 0">${title}</h1>

    <p style="margin:0 0 12px 0">Hello${clientName}${companySuffix},</p>
    <p style="margin:0 0 12px 0">${mainLine}</p>

    <div style="margin:12px 0 14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc">
      <div><strong>Document type:</strong> ${documentLabel}</div>
      <div><strong>Number:</strong> ${escapeHtml(invoiceNumber)}</div>
      <div><strong>Issue date:</strong> ${escapeHtml(String(payload.issue_date || "-"))}</div>
      <div><strong>Due date:</strong> ${dueDate}</div>
      <div><strong>Net amount:</strong> ${formatMoney(payload.net_amount)}</div>
      <div><strong>VAT:</strong> ${formatMoney(payload.vat_amount)}</div>
      <div><strong>Total:</strong> ${formatMoney(payload.total_amount)}</div>
    </div>

    <p style="margin:0 0 12px 0;color:#374151">${note}</p>

    <p style="margin:16px 0 0 0">Thank you,</p>
    <p style="margin:4px 0 0 0">EcomPrepHub</p>
  </div>`;
};

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
    const payload = (await req.json()) as InvoiceEmailPayload;
    const recipient = String(payload.email || "").trim();
    if (!recipient) {
      return new Response(JSON.stringify({ ok: false, error: "Missing recipient email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const invoiceNumber = String(payload.invoice_number || "-");
    const documentType = normalizeDocumentType(payload.document_type);
    const subject = buildSubject(documentType, invoiceNumber);
    const html = renderHtml(payload);

    const attachmentContent = String(payload.attachment_base64 || "").trim();
    const attachmentName = String(payload.attachment_filename || `${invoiceNumber}.pdf`).trim();

    const body: Record<string, unknown> = {
      from: `Prep Center <${FROM_EMAIL}>`,
      to: [recipient],
      subject,
      html,
      reply_to: [recipient],
    };

    if (attachmentContent) {
      body.attachments = [
        {
          filename: attachmentName || "invoice.pdf",
          content: attachmentContent,
        },
      ];
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
