import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type QueueRow = {
  shipment_id: string;
  company_id: string;
  user_id: string;
  market: string | null;
  force_send: boolean;
  last_sent_snapshot: Snapshot | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  notify_reception_updates: boolean | null;
};

type ShipmentRow = {
  id: string;
  tracking_id: string | null;
  tracking_ids: string[] | null;
  warehouse_country: string | null;
  destination_country: string | null;
  status: string | null;
};

type SnapshotItem = {
  id: string;
  asin: string | null;
  sku: string | null;
  title: string | null;
  image_url: string | null;
  planned: number;
  cumulative_received: number;
};

type Snapshot = {
  shipment_id: string;
  market: string | null;
  status: string | null;
  tracking_id: string | null;
  tracking_ids: string[];
  totals: {
    planned: number;
    cumulative_received: number;
    remaining: number;
  };
  items: SnapshotItem[];
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("PREP_FROM_EMAIL") ??
  Deno.env.get("RESEND_FROM") ??
  Deno.env.get("FROM_EMAIL") ??
  "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE") ?? "";
const LOGO_URL = "https://prep-center.eu/branding/fulfillment-prep-logo.png";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` } },
});

const toNum = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function fetchDueQueue(limit = 50): Promise<QueueRow[]> {
  const { data, error } = await supabase
    .from("reception_notification_queue")
    .select("shipment_id,company_id,user_id,market,force_send,last_sent_snapshot")
    .not("due_at", "is", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as QueueRow[];
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,first_name,last_name,company_name,notify_reception_updates")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("profile lookup failed", userId, error);
    return null;
  }
  return (data as ProfileRow | null) || null;
}

async function fetchShipment(shipmentId: string): Promise<ShipmentRow | null> {
  const { data, error } = await supabase
    .from("receiving_shipments")
    .select("id,tracking_id,tracking_ids,warehouse_country,destination_country,status")
    .eq("id", shipmentId)
    .maybeSingle();
  if (error) {
    console.error("shipment lookup failed", shipmentId, error);
    return null;
  }
  return (data as ShipmentRow | null) || null;
}

async function buildSnapshot(row: QueueRow): Promise<Snapshot | null> {
  const shipment = await fetchShipment(row.shipment_id);
  if (!shipment) return null;

  const { data: items, error: itemsError } = await supabase
    .from("receiving_items")
    .select("id,ean_asin,sku,product_name,quantity_received,received_units,stock_item_id")
    .eq("shipment_id", row.shipment_id)
    .order("created_at", { ascending: true });
  if (itemsError) {
    console.error("receiving items lookup failed", row.shipment_id, itemsError);
    return null;
  }

  const itemRows = Array.isArray(items) ? items : [];
  const stockIds = Array.from(new Set(itemRows.map((it: any) => it.stock_item_id).filter(Boolean)));
  const stockById: Record<string, { image_url: string | null; asin: string | null; sku: string | null }> = {};
  if (stockIds.length > 0) {
    const { data: stockItems } = await supabase
      .from("stock_items")
      .select("id,image_url,asin,sku")
      .in("id", stockIds);
    (stockItems || []).forEach((entry: any) => {
      stockById[String(entry.id)] = {
        image_url: entry.image_url ?? null,
        asin: entry.asin ?? null,
        sku: entry.sku ?? null,
      };
    });
  }

  const snapshotItems: SnapshotItem[] = itemRows.map((item: any) => {
    const stock = item.stock_item_id ? stockById[String(item.stock_item_id)] : null;
    const asin = (item.ean_asin || stock?.asin || null) as string | null;
    const sku = (item.sku || stock?.sku || null) as string | null;
    const planned = Math.max(0, toNum(item.quantity_received));
    const cumulative = Math.max(0, toNum(item.received_units));
    return {
      id: String(item.id),
      asin,
      sku,
      title: item.product_name || null,
      image_url: stock?.image_url || null,
      planned,
      cumulative_received: cumulative,
    };
  });

  snapshotItems.sort((a, b) => a.id.localeCompare(b.id));

  const totals = snapshotItems.reduce(
    (acc, item) => {
      acc.planned += item.planned;
      acc.cumulative_received += item.cumulative_received;
      return acc;
    },
    { planned: 0, cumulative_received: 0, remaining: 0 },
  );
  totals.remaining = Math.max(totals.planned - totals.cumulative_received, 0);

  return {
    shipment_id: row.shipment_id,
    market: shipment.warehouse_country || shipment.destination_country || row.market || null,
    status: shipment.status || null,
    tracking_id: shipment.tracking_id || null,
    tracking_ids: Array.isArray(shipment.tracking_ids) ? shipment.tracking_ids.filter(Boolean) : [],
    totals,
    items: snapshotItems,
  };
}

const snapshotHash = (snapshot: Snapshot | null) =>
  snapshot ? JSON.stringify(snapshot) : "";

const previousMap = (snapshot: Snapshot | null) => {
  const map = new Map<string, number>();
  if (!snapshot?.items?.length) return map;
  snapshot.items.forEach((item) => {
    map.set(item.id, Math.max(0, toNum(item.cumulative_received)));
  });
  return map;
};

function buildEmailHtml(profile: ProfileRow, snapshot: Snapshot, prevSnapshot: Snapshot | null) {
  const prev = previousMap(prevSnapshot);
  const clientName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    profile.company_name ||
    "Client";
  const shipmentShort = snapshot.shipment_id.slice(0, 8);
  const isFinal = ["processed", "received"].includes(String(snapshot.status || "").toLowerCase());
  const title = isFinal
    ? `Reception completed - #${shipmentShort}`
    : `Reception update - #${shipmentShort}`;

  const rows = snapshot.items
    .map((item) => {
      const prevReceived = prev.get(item.id) ?? 0;
      const receivedNow = Math.max(item.cumulative_received - prevReceived, 0);
      const remaining = Math.max(item.planned - item.cumulative_received, 0);
      const imageTag = item.image_url
        ? `<img src="${escapeHtml(String(item.image_url))}" alt="" style="max-width:56px;max-height:56px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px;" />`
        : "—";
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center">${imageTag}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee">${escapeHtml(String(item.asin || "-"))}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee">${escapeHtml(String(item.sku || "-"))}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee">${escapeHtml(String(item.title || "-"))}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right">${item.planned}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right">${receivedNow}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right">${item.cumulative_received}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right">${remaining}</td>
        </tr>
      `;
    })
    .join("");

  const totalPrev = prevSnapshot?.totals?.cumulative_received ?? 0;
  const totalNow = Math.max(snapshot.totals.cumulative_received - totalPrev, 0);

  const trackingLine = snapshot.tracking_id
    ? `<div><strong>Main tracking:</strong> ${escapeHtml(snapshot.tracking_id)}</div>`
    : "";
  const trackingList = snapshot.tracking_ids.length
    ? `<div style="margin-top:4px"><strong>Tracking IDs:</strong> ${snapshot.tracking_ids.map((t) => escapeHtml(String(t))).join(", ")}</div>`
    : "";

  const intro = isFinal
    ? "Your reception has been finalized. Please find the latest summary below."
    : "This is your latest reception snapshot after 1 hour without changes.";

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#111;line-height:1.45">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px">
        <tr>
          <td style="padding:0 0 12px 0">
            <img src="${LOGO_URL}" alt="Ecom Prep Hub" style="height:46px;display:block" />
          </td>
        </tr>
      </table>

      <h1 style="font-size:22px;margin:0 0 10px 0">${escapeHtml(title)}</h1>
      <p style="margin:0 0 8px 0">Hello ${escapeHtml(clientName)},</p>
      <p style="margin:0 0 12px 0">${intro}</p>

      <div style="margin:12px 0 14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc">
        <div><strong>Shipment ID:</strong> ${escapeHtml(snapshot.shipment_id)}</div>
        <div><strong>Marketplace:</strong> ${escapeHtml(String(snapshot.market || "-"))}</div>
        <div><strong>Received in this update:</strong> ${totalNow}</div>
        <div><strong>Cumulative received:</strong> ${snapshot.totals.cumulative_received} / ${snapshot.totals.planned}</div>
        <div><strong>Remaining to receive:</strong> ${snapshot.totals.remaining}</div>
        ${trackingLine}
        ${trackingList}
      </div>

      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:14px;font-size:13px">
        <thead>
          <tr style="background:#f8fafc;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">
            <th style="padding:10px 8px;text-align:left">Image</th>
            <th style="padding:10px 8px;text-align:left">ASIN</th>
            <th style="padding:10px 8px;text-align:left">SKU</th>
            <th style="padding:10px 8px;text-align:left">Product</th>
            <th style="padding:10px 8px;text-align:right">Planned</th>
            <th style="padding:10px 8px;text-align:right">Received (this update)</th>
            <th style="padding:10px 8px;text-align:right">Cumulative received</th>
            <th style="padding:10px 8px;text-align:right">Remaining</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `
            <tr>
              <td colspan="8" style="padding:14px 12px;text-align:center;color:#6b7280;border-bottom:1px solid #eee">No lines available</td>
            </tr>`}
        </tbody>
      </table>

      <div style="margin-top:18px;padding-top:10px;border-top:1px solid #eee;font-size:12px;color:#6b7280">
        <div><strong>EN:</strong> If you no longer wish to receive reception notifications, please go to Account Settings and disable reception messages.</div>
        <div style="margin-top:6px"><strong>FR:</strong> Si vous ne souhaitez plus recevoir de notifications de réception, veuillez aller dans les paramètres du compte et désactiver les messages de réception.</div>
      </div>
    </div>
  `;

  return {
    subject: title,
    html,
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Resend failed: ${resp.status} ${errText}`);
  }
}

async function markQueueHandled(shipmentId: string, snapshot: Snapshot | null) {
  const { error } = await supabase
    .from("reception_notification_queue")
    .update({
      due_at: null,
      force_send: false,
      last_sent_at: new Date().toISOString(),
      last_sent_snapshot: snapshot,
      updated_at: new Date().toISOString(),
    })
    .eq("shipment_id", shipmentId);
  if (error) throw error;
}

console.info("send_reception_emails started");

Deno.serve(async () => {
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    return new Response(
      JSON.stringify({ error: "Missing RESEND_API_KEY or PREP_FROM_EMAIL" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const pending = await fetchDueQueue(50);
    const sent: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const row of pending) {
      try {
        const [profile, snapshot] = await Promise.all([
          fetchProfile(row.user_id),
          buildSnapshot(row),
        ]);

        if (!profile || !snapshot) {
          skipped.push(`${row.shipment_id}:missing_profile_or_snapshot`);
          await markQueueHandled(row.shipment_id, snapshot);
          continue;
        }

        const wantsEmails = profile.notify_reception_updates !== false;
        const email = profile.email || null;
        const changed = snapshotHash(snapshot) !== snapshotHash(row.last_sent_snapshot || null);

        if (!wantsEmails || !email) {
          skipped.push(`${row.shipment_id}:notifications_off_or_missing_email`);
          await markQueueHandled(row.shipment_id, snapshot);
          continue;
        }

        if (!changed && !row.force_send) {
          skipped.push(`${row.shipment_id}:no_changes`);
          await markQueueHandled(row.shipment_id, snapshot);
          continue;
        }

        const { subject, html } = buildEmailHtml(profile, snapshot, row.last_sent_snapshot || null);
        await sendEmail(email, subject, html);
        await markQueueHandled(row.shipment_id, snapshot);
        sent.push(row.shipment_id);
      } catch (err) {
        console.error("send_reception_emails row error", row.shipment_id, err);
        errors.push(`${row.shipment_id}: ${err?.message || String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({
        processed: pending.length,
        sent: sent.length,
        skipped: skipped.length,
        errors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send_reception_emails error", err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
