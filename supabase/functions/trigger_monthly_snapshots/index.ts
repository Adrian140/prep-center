import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const monthBounds = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
    label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
  };
};

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
    const body = await req.json().catch(() => ({}));
    const singleCompanyId = body?.company_id || body?.companyId || null;
    const regenerateAll = body?.regenerateAll === true;

    const { data: companies, error: compError } = await supabase
      .from("companies")
      .select("id, name")
      .order("created_at");
    if (compError) throw compError;

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const company of companies || []) {
      if (singleCompanyId && company.id !== singleCompanyId) continue;
      try {
        // determină prima lună cu stoc
        const { data: firstStock, error: firstErr } = await supabase
          .from("stock_items")
          .select("created_at")
          .eq("company_id", company.id)
          .order("created_at", { ascending: true })
          .limit(1);
        if (firstErr) throw firstErr;
        if (!firstStock || !firstStock.length) {
          skipped++;
          continue;
        }

        const firstDate = new Date(firstStock[0].created_at);
        const now = new Date();
        // mergem până la luna trecută inclusiv
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const months: { startISO: string; endISO: string; label: string }[] = [];
        let cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
        while (cursor <= lastMonth) {
          months.push(monthBounds(cursor));
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }

        const { data: existing, error: checkErr } = await supabase
          .from("export_files")
          .select("period_end, file_path")
          .eq("company_id", company.id)
          .eq("export_type", "stock_monthly_snapshot")
          .in("period_end", months.map((m) => m.endISO));
        if (checkErr && checkErr.code !== "PGRST116") throw checkErr;
        const existingSet = new Set((existing || []).map((e) => e.period_end));

        // Citește stocul o singură dată (cu warehouse, dacă există)
        const { data: stock, error: stockErr } = await supabase
          .from("stock_items")
          .select("ean, asin, name, qty, purchase_price, created_at, warehouse")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false });
        if (stockErr) throw stockErr;
        if (!stock || stock.length === 0) {
          skipped++;
          continue;
        }

        const XLSX = await import("https://esm.sh/xlsx@0.18.5");

        // grupăm pe warehouse (default dacă lipsește)
        const byWh = new Map<string, typeof stock>();
        for (const row of stock) {
          const whRaw = (row.warehouse ?? "default").trim();
          const wh = whRaw === "" ? "default" : whRaw;
          if (!byWh.has(wh)) byWh.set(wh, []);
          byWh.get(wh)!.push(row);
        }

        const warehouseList = Array.from(byWh.keys());

        for (const wh of warehouseList) {
          const whStock = byWh.get(wh)!;

          const { data: existing, error: checkErr } = await supabase
            .from("export_files")
            .select("period_end, file_path")
            .eq("company_id", company.id)
            .eq("export_type", "stock_monthly_snapshot")
            .eq("warehouse", wh)
            .in("period_end", months.map((m) => m.endISO));
          if (checkErr && checkErr.code !== "PGRST116") throw checkErr;
          const existingSet = new Set((existing || []).map((e) => e.period_end));

          for (const m of months) {
          const already = existingSet.has(m.endISO);
          if (already && !regenerateAll) {
            skipped++;
            continue;
          }

          const totals = whStock.reduce(
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

          const sheetData = [
            ["EAN", "ASIN", "Name", "Qty", "Purchase price", "Value", "Created at", "Updated at"],
            ...whStock.map((r) => [
              r.ean ?? "",
              r.asin ?? "",
              r.name ?? "",
              Number(r.qty ?? 0),
              r.purchase_price ?? "",
              Number(r.qty ?? 0) * Number(r.purchase_price ?? 0),
              (r.created_at ?? "").slice(0, 19).replace("T", " "),
              "", // updated_at not available in schema
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
          const niceMonth = new Date(m.endISO).toLocaleString("ro-RO", {
            month: "long",
            year: "numeric",
          });
          const whClean = cleanCompanyName(wh);
          const fileName = `Stock ${cleanName} ${whClean} ${niceMonth}.xlsx`;
          const path = `exports/${company.id}/stock/monthly/${whClean}/${m.label.slice(0, 4)}/${fileName}`;

          const { error: uploadErr } = await supabase.storage
            .from("exports")
            .upload(path, bytes, {
              upsert: true,
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
          if (uploadErr) throw uploadErr;

          // dacă exista și regenerăm, ștergem vechiul meta (indiferent de warehouse) ca să evităm duplicate
          if (regenerateAll) {
            await supabase
              .from("export_files")
              .delete()
              .eq("company_id", company.id)
              .eq("export_type", "stock_monthly_snapshot")
              .eq("period_end", m.endISO);
          }

          const { error: metaErr } = await supabase.from("export_files").insert({
            company_id: company.id,
            export_type: "stock_monthly_snapshot",
            period_start: m.startISO,
            period_end: m.endISO,
            warehouse: wh,
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
        }
        }
      } catch (e: any) {
        errors.push(`company ${company.id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
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
