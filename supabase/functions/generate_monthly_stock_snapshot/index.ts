// FILE: supabase/functions/generate_monthly_stock_snapshot/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.48.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "exports";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function listActiveCompanies(): Promise<string[]> {
  // ajustează dacă nu ai câmpul "active"
  const { data, error } = await supabase.from("companies").select("id").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => r.id);
}

function lastMonthPeriod() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0..11
  const end = new Date(Date.UTC(y, m, 0)); // last day of previous month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const yyyy = start.getUTCFullYear();
  const mm = String(start.getUTCMonth() + 1).padStart(2, "0");
  const label = `${yyyy}-${mm}`;
  return { start, end, label };
}

async function companyHasSnapshot(companyId: string, periodEndISO: string) {
  const { data } = await supabase
    .from("export_files")
    .select("id")
    .eq("company_id", companyId)
    .eq("export_type", "stock_monthly_snapshot")
    .eq("period_end", periodEndISO)
    .maybeSingle();
  return Boolean(data);
}

async function loadStock(companyId: string) {
  const { data, error } = await supabase
    .from("stock_items")
    .select("ean, asin, name, qty, purchase_price, created_at, updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

function buildWorkbook(rows: any[]) {
  const sheetData = [
    ["EAN","ASIN","Name","Qty","Purchase price","Value","Created at","Updated at"],
    ...rows.map(r => [
      r.ean ?? "", r.asin ?? "", r.name ?? "",
      Number(r.qty ?? 0),
      r.purchase_price ?? "",
      Number(r.qty ?? 0) * Number(r.purchase_price ?? 0),
      (r.created_at ?? "").slice(0,19).replace("T"," "),
      (r.updated_at ?? "").slice(0,19).replace("T"," "),
    ])
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), "Stock");
  return wb;
}

async function uploadFile(path: string, bytes: Uint8Array) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      upsert: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  if (error) throw error;
}

async function insertMeta(companyId: string, path: string, periodStart: string, periodEnd: string, rows: any[]) {
  const totals = rows.reduce((acc: any, r: any) => {
    const q = Number(r.qty ?? 0);
    const p = Number(r.purchase_price ?? 0);
    acc.qty += q; acc.value += q * p;
    return acc;
  }, { qty: 0, value: 0 });

  const { error } = await supabase.from("export_files").insert({
    company_id: companyId,
    export_type: "stock_monthly_snapshot",
    period_start: periodStart,
    period_end: periodEnd,
    file_path: path,
    rows_count: rows.length,
    totals_json: totals,
    status: "ready"
  });
  if (error) throw error;
}

async function enforceRetention(companyId: string) {
  const { data, error } = await supabase
    .from("export_files")
    .select("id,file_path,period_end")
    .eq("company_id", companyId)
    .eq("export_type", "stock_monthly_snapshot")
    .eq("status", "ready")
    .order("period_end", { ascending: false });
  if (error) throw error;
  const keep = (data ?? []).slice(0, 6);
  const drop = (data ?? []).slice(6);
  for (const f of drop) {
    if (f.file_path) {
      await supabase.storage.from(BUCKET).remove([f.file_path]);
    }
    await supabase.from("export_files")
      .update({ status: "deleted", file_path: null })
      .eq("id", f.id);
  }
  return { kept: keep.length, deleted: drop.length };
}

serve(async () => {
  try {
    const { start, end, label } = lastMonthPeriod();
    const periodStartISO = start.toISOString().slice(0,10);
    const periodEndISO = end.toISOString().slice(0,10);

    const companies = await listActiveCompanies();
    for (const companyId of companies) {
      // idempotent
      if (await companyHasSnapshot(companyId, periodEndISO)) continue;

      const rows = await loadStock(companyId);
      const wb = buildWorkbook(rows);
      const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
      const path = `exports/${companyId}/stock/monthly/${label.slice(0,4)}/${label}_stock_snapshot.xlsx`;
      await uploadFile(path, bytes);
      await insertMeta(companyId, path, periodStartISO, periodEndISO, rows);
      await enforceRetention(companyId);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
});
