import React, { useMemo, useState, useEffect } from "react";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";
import { supabase } from "../../../config/supabase";
import { useDashboardTranslation } from "../../../translations";

// Tipurile + headere + formate numerice + mapări rânduri
const KIND_META = (t) => ({
  FBA: {
    table: "fba_lines",
    dateCol: "service_date",
    headers: [
      t("activity.thead.date"),        // 0
      t("activity.thead.service"),     // 1
      t("activity.thead.unitPrice"),   // 2
      t("activity.thead.units"),       // 3
      t("activity.thead.total"),       // 4
      "Client notes",                  // 5
    ],
    numFmt: { 2: "0.00", 3: "0", 4: "0.00" },
    mapRow: (r) => {
      const unitPrice = r.unit_price != null ? Number(r.unit_price) : "";
      const units = r.units != null ? Number(r.units) : "";
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.units || 0);
      return [
        r.service_date || "",
        r.service || "",
        unitPrice,
        units,
        Number.isFinite(total) ? total : "",
        r.obs_client || "",
      ];
    },
    totals: (rows) => {
      const unitPriceSum = rows.reduce((s, r) => s + Number(r.unit_price || 0), 0);
      const unitsSum = rows.reduce((s, r) => s + Number(r.units || 0), 0);
      const totalSum = rows.reduce(
        (s, r) =>
          s +
          (r.total != null
            ? Number(r.total)
            : Number(r.unit_price || 0) * Number(r.units || 0)),
        0
      );
      return [t("activity.totals"), "", unitPriceSum, unitsSum, totalSum, ""];
    },
  },

  FBM: {
    table: "fbm_lines",
    dateCol: "service_date",
    headers: [
      t("activity.thead.date"),        // 0
      t("activity.thead.service"),     // 1
      t("activity.thead.unitPrice"),   // 2
      t("activity.thead.ordersUnits"), // 3
      t("activity.thead.total"),       // 4
      "Client notes",                  // 5
    ],
    numFmt: { 2: "0.00", 3: "0", 4: "0.00" },
    mapRow: (r) => {
      const unitPrice = r.unit_price != null ? Number(r.unit_price) : "";
      const ou = r.orders_units != null ? Number(r.orders_units) : "";
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.orders_units || 0);
      return [
        r.service_date || "",
        r.service || "",
        unitPrice,
        ou,
        Number.isFinite(total) ? total : "",
        r.obs_client || "",
      ];
    },
    totals: (rows) => {
      const unitPriceSum = rows.reduce((s, r) => s + Number(r.unit_price || 0), 0);
      const ouSum = rows.reduce((s, r) => s + Number(r.orders_units || 0), 0);
      const totalSum = rows.reduce(
        (s, r) =>
          s +
          (r.total != null
            ? Number(r.total)
            : Number(r.unit_price || 0) * Number(r.orders_units || 0)),
        0
      );
      return [t("activity.totals"), "", unitPriceSum, ouSum, totalSum, ""];
    },
  },

  Stock: {
    table: "stock_items",
    dateCol: "created_at",
    headers: [
      "EAN",                  // 0
      "Stock",                // 1
      "ASIN",                 // 2
      "Product name",         // 3
      "Purchase price (€)",   // 4
      "Total value",          // 5
    ],
    numFmt: { 1: "0", 4: "0.00", 5: "0.00" },
    mapRow: (r) => {
      const qty = r.qty != null ? Number(r.qty) : "";
      const price = r.purchase_price != null ? Number(r.purchase_price) : "";
      const value =
        r.stock_value != null
          ? Number(r.stock_value)
          : Number(r.qty || 0) * Number(r.purchase_price || 0);
      return [
        r.ean || "-",
        qty,
        r.asin || r.sku || "-",
        r.name || "",
        price,
        Number.isFinite(value) ? value : "",
      ];
    },
    totals: (rows) => {
      const qtySum = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
      const priceSum = rows.reduce((s, r) => s + Number(r.purchase_price || 0), 0);
      const valueSum = rows.reduce((s, r) => {
        const q = Number(r.qty || 0);
        const p = Number(r.purchase_price || 0);
        const v = r.stock_value != null ? Number(r.stock_value) : q * p;
        return s + v;
      }, 0);
      return [t("activity.totals"), qtySum, "", "", priceSum, valueSum];
    },
  },

  Returns: {
    table: "returns",
    dateCol: "return_date",
    headers: [
      t("returns.thead.date"), // 0
      "SKU/ASIN",              // 1
      t("returns.thead.qty"),  // 2
      t("returns.thead.type"), // 3
      t("returns.thead.status"), // 4
      "Reason (Other)",        // 5
      "Client notes",          // 6
    ],
    numFmt: { 2: "0" },
    mapRow: (r) => [
      r.return_date || "",
      r.sku_asin || r.asin || "",
      r.qty != null ? Number(r.qty) : "",
      r.return_type || "",
      r.status || "",
      r.status === "Other" ? r.status_note || "" : "",
      r.obs_client || "",
    ],
    totals: (rows) => {
      const qtySum = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
      return [t("activity.totals"), "", qtySum, "", "", "", ""];
    },
  },

  // opțional, dacă ai tabel/view de mișcări
  StockMovements: {
    table: "stock_movements",
    dateCol: "movement_date",
    headers: [
      t("activity.thead.date"), // 0
      t("stock.thead.ean"),     // 1
      t("stock.thead.name"),    // 2
      t("stock.thead.asinSku"), // 3
      "Δ Qty",                  // 4
      "Reason",                 // 5
      "Reference",              // 6
    ],
    numFmt: { 4: "0" },
    mapRow: (r) => [
      r.movement_date || "",
      r.ean || "",
      r.name || "",
      r.asin || r.sku || "",
      r.delta != null ? Number(r.delta) : "",
      r.reason || "",
      r.reference || "",
    ],
    totals: (rows) => {
      const deltaSum = rows.reduce((s, r) => s + Number(r.delta || 0), 0);
      return [t("activity.totals"), "", "", "", deltaSum, "", ""];
    },
  },
});

export default function ClientExports() {
  const { t, tp } = useDashboardTranslation();
  const supportError = t('common.supportError');
  const { profile } = useSupabaseAuth();

  const [kind, setKind] = useState("FBA");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return first.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  
  // Monthly archive state
  const [stockArchive, setStockArchive] = useState([]);
  const [archLoading, setArchLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState('');

  const meta = useMemo(() => KIND_META(t)[kind], [t, kind]);

  // Load stock archive from export_files table
  useEffect(() => {
    const loadArchive = async () => {
      if (!profile?.company_id) { 
        setStockArchive([]); 
        return; 
      }
      
      setArchLoading(true);
      try {
        const { data, error } = await supabase
          .from('export_files')
          .select('id, period_end, file_path, rows_count, totals_json, created_at')
          .eq('company_id', profile.company_id)
          .eq('export_type', 'stock_monthly_snapshot')
          .eq('status', 'ready')
          .order('period_end', { ascending: false });

        if (error) throw error;

        setStockArchive((data || []).map(f => ({
          id: f.id,
          name: `${f.period_end.slice(0, 7)}.xlsx`, // "2024-01.xlsx"
          path: f.file_path,
          period_end: f.period_end,
          rows_count: f.rows_count,
          totals: f.totals_json,
          created_at: f.created_at
        })));
      } catch (e) {
        console.error('Failed to load archive:', e);
        setStockArchive([]);
      } finally {
        setArchLoading(false);
      }
    };
    
    loadArchive();
  }, [profile?.company_id]);

  // Trigger monthly generation for missing months
  const triggerMonthlyGeneration = async () => {
    setTriggerLoading(true);
    setTriggerMessage('');
    
    try {
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/trigger_monthly_snapshots`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabase.supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      
      if (result.success) {
        setTriggerMessage(`✅ Generated ${result.generated} snapshots, skipped ${result.skipped} existing ones for period ${result.period}`);
        
        // Reload archive after generation
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setTriggerMessage(`❌ ${supportError}`);
      }
    } catch (error) {
      setTriggerMessage(`❌ ${supportError}`);
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleExport = async () => {
    if (!profile?.company_id) {
      alert(t('ClientExports.alerts.noCompany'));
      return;
    }
    setBusy(true);
    try {
      // 1) Citește datele
      let query = supabase
        .from(meta.table)
        .select("*")
        .eq("company_id", profile.company_id)
        .order(meta.dateCol, { ascending: true });

      // "Stock" = snapshot (fără interval)
      if (kind !== "Stock") {
        if (from) query = query.gte(meta.dateCol, from);
        if (to) query = query.lte(meta.dateCol, to);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rowsRaw = Array.isArray(data) ? data : [];
      const rows =
        kind === 'Stock'
          ? rowsRaw.filter((r) => Number(r.qty || 0) > 0)
          : rowsRaw;

      // 2) Construim sheet-ul ca AOA
      const aoa = [];
      aoa.push(meta.headers);
      for (const r of rows) aoa.push(meta.mapRow(r));

      const hasTotals = typeof meta.totals === "function";
      if (hasTotals) {
        aoa.push(new Array(meta.headers.length).fill(""));
        aoa.push(meta.totals(rows));
      }

      const filename =
        kind === 'Stock'
          ? `Stock PrepCenter France ${new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}.xlsx`
          : `report-${kind}_${from || "start"}_${to || "end"}.xlsx`;
      const XLSX = await import("xlsx");

      // 3) Sheet + autofilter, lățimi, formate numerice
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // intervalul de date (ex: A1:F{n})
      const range = XLSX.utils.decode_range(ws['!ref']);
      const lastColIdx = meta.headers.length - 1;
      const lastRowIdx = range.e.r;

      // a) AutoFilter pe antet
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s:{ r:0, c:0 }, e:{ r:lastRowIdx, c:lastColIdx } }) };

      // b) Lățimi de coloană (simplu)
      ws['!cols'] = meta.headers.map(h => ({ wch: Math.max(12, String(h).length + 4) }));

      // c) Formate numerice pentru toate celulele din coloanele specificate
      if (meta.numFmt) {
        Object.entries(meta.numFmt).forEach(([colIdxStr, fmt]) => {
          const c = Number(colIdxStr);              // 0-based
          for (let r = 1; r <= lastRowIdx; r++) {   // începem de la 1: rândul 0 = antet
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (!cell) continue;
            if (typeof cell.v === "number") {
              cell.t = 'n';
              cell.z = fmt; // ex: "0", "0.00", "#,##0.00"
            }
          }
        });
      }

      // 4) Workbook & sheet name
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");

      // 5) Scriere fișier
      XLSX.writeFile(wb, filename);
    } catch (e) {
      console.error(e);
      alert(t('ClientExports.alerts.failed'));
    } finally {
      setBusy(false);
    }
  };

  const downloadArchived = async (archiveItem) => {
    try {
      const { data, error } = await supabase.storage
        .from('exports')
        .createSignedUrl(archiveItem.path, 120);
      
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert(t('ClientExports.alerts.failed'));
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-4">
        {t("ClientExports.title")}
      </h2>
      <p className="text-sm text-text-secondary mb-4">{t("ClientExports.desc")}</p>
      
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-6">
        <div className="flex flex-col">
          <label className="text-xs text-text-secondary mb-1">
            {t("ClientExports.reportType")}
          </label>
          <select
            className="border rounded px-3 py-2 w-56"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option>FBA</option>
            <option>FBM</option>
            <option>Stock</option>
            <option>Returns</option>
          </select>
        </div>

        {kind !== "Stock" && (
          <div className="flex flex-col">
            <label className="text-xs text-text-secondary mb-1">
              {t("ClientExports.from")}
            </label>
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
        )}

        <div className="flex flex-col">
          <label className="text-xs text-text-secondary mb-1">
            {t("ClientExports.to")}
          </label>
          <input
            type="date"
            className="border rounded px-3 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={kind === "Stock"} // opțional: pentru claritate
          />
        </div>

        <button
          onClick={handleExport}
          disabled={busy}
          className="bg-primary text-white py-2 px-4 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-60"
        >
          {busy
            ? t("ClientExports.generating")
            : t("ClientExports.btn").replace(
                "{kind}",
                t(`ClientExports.kinds.${kind}`)
              )}
        </button>
      </div>

      <div className="text-xs text-text-secondary mb-6">{t("ClientExports.footnote")}</div>

      {/* Stock Archive Section - Fixed to use export_files */}
      <div className="mt-8 bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">
            {t("ClientExports.archive.title")}
          </h3>
        </div>

        {triggerMessage && (
          <div className={`mb-4 p-3 rounded text-sm ${
            triggerMessage.includes('✅') 
              ? 'bg-green-50 text-green-700' 
              : 'bg-red-50 text-red-700'
          }`}>
            {triggerMessage}
          </div>
        )}

        {archLoading ? (
          <div className="text-sm text-text-secondary">
            {t("ClientExports.archive.loading")}
          </div>
        ) : stockArchive.length === 0 ? (
          <div className="text-sm text-text-secondary">
            {t("ClientExports.archive.empty")}
          </div>
        ) : (
          <ul className="divide-y">
            {stockArchive.map((f) => {
              // f.name: "YYYY-MM.xlsx" -> "Stock {LUNA} {AN}"
              const m = /^(\d{4})-(\d{2})\.xlsx$/i.exec(f.name);
              let label = f.name;
              if (m) {
                const y = Number(m[1]); 
                const mo = Number(m[2]);
                const d = new Date(y, mo - 1, 1);
                const monthName = d.toLocaleString(undefined, { month: 'long' });
                label = tp("ClientExports.archive.label", { month: monthName, year: y });
              }
              const metaText = tp("ClientExports.archive.meta", {
                items: f.rows_count ?? 0,
                total: Number(f.totals?.value || 0).toFixed(2),
                date: new Date(f.created_at).toLocaleDateString()
              });

              return (
                <li key={f.id} className="py-2 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{label}</div>
                    <div className="text-sm text-gray-500">{metaText}</div>
                  </div>
                  <button
                    className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
                    onClick={() => downloadArchived(f)}
                  >
                    {t("ClientExports.archive.download")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
