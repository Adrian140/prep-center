import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getTargetMonth() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const yyyy = lastMonth.getFullYear();
  const mm = String(lastMonth.getMonth() + 1).padStart(2, "0");
  const label = `${yyyy}-${mm}`;
  return {
    label,
    startISO: lastMonth.toISOString().slice(0, 10),
    endISO: endOfLastMonth.toISOString().slice(0, 10),
  };
}

function cleanCompanyName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { data: companies, error: compError } = await supabase
      .from("companies")
      .select("id, name")
      .order("created_at");
    if (compError) throw compError;

    const { label, startISO, endISO } = getTargetMonth();
    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const company of companies || []) {
      try {
        const { data: existing, error: checkErr } = await supabase
          .from("export_files")
          .select("id")
          .eq("company_id", company.id)
          .eq("export_type", "stock_monthly_snapshot")
          .eq("period_end", endISO)
          .maybeSingle();
        if (checkErr && checkErr.code !== "PGRST116") throw checkErr;
        if (existing) {
          skipped++;
          continue;
        }

        const { data: stock, error: stockErr } = await supabase
          .from("stock_items")
          .select("ean, asin, name, qty, purchase_price, created_at, updated_at")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false });
        if (stockErr) throw stockErr;
        if (!stock || stock.length === 0) {
          skipped++;
          continue;
        }

        const totals = stock.reduce(
          (acc, r) => {
            const q = Number(r.qty ?? 0);
            const p = Number(r.purchase_price ?? 0);
            acc.qty += q;
            acc.purchase_price_sum += p;
            acc.value += q * p;
            return acc;
          },
          { qty: 0, purchase_price_sum: 0, value: 0 },
        );

        const XLSX = await import("https://esm.sh/xlsx@0.18.5");

        const sheetData = [
          ["EAN", "ASIN", "Name", "Qty", "Purchase price", "Value", "Created at", "Updated at"],
          ...stock.map((r) => [
            r.ean ?? "",
            r.asin ?? "",
            r.name ?? "",
            Number(r.qty ?? 0),
            r.purchase_price ?? "",
            Number(r.qty ?? 0) * Number(r.purchase_price ?? 0),
            (r.created_at ?? "").slice(0, 19).replace("T", " "),
            (r.updated_at ?? "").slice(0, 19).replace("T", " "),
          ]),
          [],
          [
            "TOTAL",
            "",
            "",
            totals.qty,
            totals.purchase_price_sum,
            totals.value,
            "",
            "",
          ],
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(wb, ws, "Stock");
        const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;

        const cleanName = cleanCompanyName(company.name || "Company");
        const niceMonth = new Date(endISO).toLocaleString("ro-RO", {
          month: "long",
          year: "numeric",
        });
        const fileName = `Stock ${cleanName} ${niceMonth}.xlsx`;
        const path = `exports/${company.id}/stock/monthly/${label.slice(0, 4)}/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("exports")
          .upload(path, bytes, {
            upsert: true,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
        if (uploadErr) throw uploadErr;

        const { error: metaErr } = await supabase.from("export_files").insert({
          company_id: company.id,
          export_type: "stock_monthly_snapshot",
          period_start: startISO,
          period_end: endISO,
          file_path: path,
          rows_count: stock.length,
          totals_json: {
            qty: totals.qty,
            purchase_price_sum: totals.purchase_price_sum,
            value: totals.value,
          },
          status: "ready",
        });
        if (metaErr) throw metaErr;

        generated++;
      } catch (e: any) {
        errors.push(`company ${company.id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        period: label,
        generated,
        skipped,
        errors: errors.length ? errors : undefined,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: e.message || String(e),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
