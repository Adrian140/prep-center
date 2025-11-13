// Returnează XLSX ca octet-stream (nu salvează în bucket)
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// === CORS ===
const ALLOWED_ORIGINS = new Set([
  "https://webcv-prod-439478.biela.dev", // prod
  "http://localhost:5173",               // local dev
  "https://prep-center.eu",
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { ...headers, "Allow": "POST, OPTIONS" } });
    }

    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers });
    }

    // Creează clientul cu ANON_KEY, dar pasează tokenul user-ului în header global
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(`Unauthorized`, { status: 401, headers });
    }

    const body = await req.json().catch(() => ({}));
    const endISO = String(body?.endDate ?? "").slice(0, 10);
    if (!endISO) {
      return new Response("Missing endDate", { status: 400, headers });
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (profErr) return new Response(`Profile error: ${profErr.message}`, { status: 400, headers });
    if (!prof?.company_id) return new Response("No company", { status: 400, headers });

    // Fără reconstrucție istorică: exportăm starea curentă
    const { data: rows, error } = await supabase
      .from("stock_items")
      .select("ean, asin, name, qty, purchase_price, created_at, updated_at")
      .eq("company_id", prof.company_id)
      .order("created_at", { ascending: false });
    if (error) return new Response(`Query error: ${error.message}`, { status: 400, headers });

    const safeRows = Array.isArray(rows) ? rows : [];
    const totals = safeRows.reduce(
      (acc, row: any) => {
        const qty = Number(row?.qty ?? 0);
        const price = Number(row?.purchase_price ?? 0);
        if (Number.isFinite(qty)) acc.qty += qty;
        const value = qty * price;
        if (Number.isFinite(value)) acc.value += value;
        return acc;
      },
      { qty: 0, value: 0 }
    );

    const aoa = [
      ["EAN","ASIN","Name","Qty","Purchase price","Value","Created at","Updated at","Export to"],
      ...safeRows.map((r: any) => [
        r.ean ?? "",
        r.asin ?? "",
        r.name ?? "",
        Number(r.qty ?? 0),
        r.purchase_price ?? "",
        Number(r.qty ?? 0) * Number(r.purchase_price ?? 0),
        (r.created_at ?? "").slice(0,19).replace("T"," "),
        (r.updated_at ?? "").slice(0,19).replace("T"," "),
        endISO
      ]),
    ];
    aoa.push([
      "",
      "",
      "TOTAL",
      totals.qty,
      "",
      Number.isFinite(totals.value) ? Number(totals.value.toFixed(2)) : 0,
      "",
      "",
      endISO
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Stock");
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;

    return new Response(bytes, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock_to_${endISO}.xlsx"`,
         "Cache-Control": "no-store, max-age=0"
      },
    });
  } catch (e: any) {
    return new Response(String(e?.message || e), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "text/plain" },
    });
  }
});
