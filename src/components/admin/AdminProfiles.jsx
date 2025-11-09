// FILE: src/components/admin/AdminProfiles.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { supabase, supabaseHelpers } from "@/config/supabase";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  Search,
  Info as InfoIcon,
} from "lucide-react";
import { useAdminTranslation } from "@/i18n/useAdminTranslation";

const PER_PAGE = 20;
const fmt2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

// --- date helpers (LOCAL, fără UTC drift)
function firstDayOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d, n) { const nd = new Date(d); nd.setMonth(nd.getMonth() + n); return nd; }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
const sumLineRows = (rows = [], qtyField = "units") =>
  (rows || []).reduce((acc, row) => {
    const total =
      row?.total != null
        ? Number(row.total)
        : Number(row?.unit_price || 0) * Number(row?.[qtyField] || 0);
    return acc + (Number.isFinite(total) ? total : 0);
  }, 0);

const sumOtherLineRows = (rows = []) => sumLineRows(rows, "units");

const sumPaidInvoices = (rows = []) =>
  (rows || []).reduce((acc, row) => {
    const status = String(row?.status || '').trim().toLowerCase();
    const amount = Number(row?.amount);
    if (status === 'paid' && Number.isFinite(amount)) {
      return acc + amount;
    }
    return acc;
  }, 0);

async function fetchLiveBalance(companyId) {
  if (!companyId) return 0;
  const [{ data: fba }, { data: fbm }, { data: other }, { data: invoices }] =
    await Promise.all([
      supabase
        .from('fba_lines')
        .select('unit_price, units, total')
        .eq('company_id', companyId),
      supabase
        .from('fbm_lines')
        .select('unit_price, orders_units, total')
        .eq('company_id', companyId),
      supabase
        .from('other_lines')
        .select('unit_price, units, total')
        .eq('company_id', companyId),
      supabase
        .from('invoices')
        .select('amount, status')
        .eq('company_id', companyId)
    ]);

  const services =
    sumLineRows(fba, 'units') +
    sumLineRows(fbm, 'orders_units') +
    sumLineRows(other, 'units');
  const paid = sumPaidInvoices(invoices);
  return services - paid;
}

async function fetchOtherLineSums(companyId, startDate, endDate) {
  if (!companyId) {
    return { monthTotal: 0, carryTotal: 0 };
  }
  const [{ data: monthRows, error: monthErr }, { data: prevRows, error: prevErr }] = await Promise.all([
    supabase
      .from("other_lines")
      .select("total, unit_price, units, service_date")
      .eq("company_id", companyId)
      .gte("service_date", startDate)
      .lte("service_date", endDate),
    supabase
      .from("other_lines")
      .select("total, unit_price, units, service_date")
      .eq("company_id", companyId)
      .lt("service_date", startDate)
  ]);
  if (monthErr || prevErr) {
    return { monthTotal: 0, carryTotal: 0 };
  }
  return {
    monthTotal: sumOtherLineRows(monthRows),
    carryTotal: sumOtherLineRows(prevRows)
  };
}

// --- UI
function MoneyPill({ value }) {
  const isZero = !Number.isFinite(value) || Math.abs(value) < 1e-9;
  const cls = isZero ? "bg-gray-100 text-gray-700"
    : value < 0 ? "bg-red-100 text-red-800"
    : "bg-green-100 text-green-800";
  return <span className={`px-2 py-1 rounded-md text-sm font-medium ${cls}`}>{fmt2(value)}</span>;
}

export default function AdminProfiles({ onSelect }) {
  const { t, tp } = useAdminTranslation();
  // month selector
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [showEmail, setShowEmail] = useState(false);
  const [from, setFrom] = useState(isoLocal(firstDayOfMonth(new Date())));
  const [to, setTo] = useState(isoLocal(lastDayOfMonth(new Date())));
  const gotoMonth = (delta) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const nd = addMonths(new Date(y, m - 1, 1), delta);
    setSelectedMonth(monthKey(nd));
    setFrom(isoLocal(firstDayOfMonth(nd)));
    setTo(isoLocal(lastDayOfMonth(nd)));
  };

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  // per-row computed (valori direct din RPC)
  const [calc, setCalc] = useState({});
  const [restFilter, setRestFilter] = useState("all");

  // chart state (lăsate pentru viitorul grafic)
  const [bucket, setBucket] = useState("month");
  const [unitKind, setUnitKind] = useState("combined");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const chartSvgRef = useRef(null);

  // Perioada RPC calculată (vizibilă pe pagină)
 const [rpcStart, setRpcStart] = useState(isoLocal(firstDayOfMonth(new Date())));
 const [rpcEnd, setRpcEnd]     = useState(isoLocal(lastDayOfMonth(new Date())));

  // load profiles (non-admin)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id,email,first_name,last_name,company_name,created_at,account_type,company_id,store_name")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const nonAdmins = (data || []).filter(r => (r.account_type||"").toLowerCase() !== "admin");
        if (mounted) setRows(nonAdmins);
      } catch (e) {
        if (mounted) { setRows([]); setError(e?.message || "Failed to load clients"); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // search + filter
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? rows.filter(r =>
      (r.first_name||"").toLowerCase().includes(t) ||
      (r.last_name||"").toLowerCase().includes(t) ||
      (r.company_name||"").toLowerCase().includes(t) ||
      (r.email||"").toLowerCase().includes(t)
    ) : rows;

    if (restFilter === "all") return base;
    return base.filter(r => {
      const c = calc[r.id];
      if (!c) return true;
      const hasRest = c.diff < 0;
      const hasAdvance = c.diff > 0;
      if (restFilter === "with") return hasRest;
      if (restFilter === "advance") return hasAdvance;
      return !hasRest;
    });
  }, [rows, q, calc, restFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const slice = useMemo(() => {
    const start = (pageClamped - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, pageClamped]);

  // totals (footer)
  const tableTotals = useMemo(() => {
    const totCurrent = slice.reduce((s,p)=>s+Number(calc[p.id]?.currentSold ?? 0),0);
    const totCarry   = slice.reduce((s,p)=>s+Number(calc[p.id]?.carry ?? 0),0);
    const totDiff    = slice.reduce((s,p)=>s+Number(calc[p.id]?.diff ?? 0),0);
    return { totCurrent, totCarry, totDiff };
  }, [slice, calc]);

  // compute balances per row (STRICT din RPC; fără calcule în React)
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (slice.length === 0) { if (mounted) setCalc({}); return; }

      const [y, m] = selectedMonth.split("-").map(Number);
      const start = isoLocal(new Date(y, m - 1, 1));        // inclusiv
       const end   = isoLocal(new Date(y, m, 0));            // inclusiv (ultima zi a lunii)

      // păstrăm pe state ca să le afișăm explicit în UI
     setRpcStart(start);
     setRpcEnd(end);

      const entries = await Promise.all(
        slice.map(async (p) => {
          if (!p.company_id) return [p.id, { currentSold: 0, carry: 0, diff: 0 }];

          const [{ data, error }, liveBalance] = await Promise.all([
            supabaseHelpers.getPeriodBalances(p.id, p.company_id, start, end),
            fetchLiveBalance(p.company_id)
          ]);
          if (error || !data) return [p.id, { currentSold: 0, carry: 0, diff: liveBalance || 0 }];

          let current = Number((data.sold_current ?? data.sold_curent) ?? 0);
          let carry = Number(data.sold_restant ?? 0);
          const otherSums = await fetchOtherLineSums(p.company_id, start, end);
          current += otherSums.monthTotal;
          carry += otherSums.carryTotal;

          return [p.id, { currentSold: current, carry, diff: liveBalance }];
        })
      );

      if (mounted) setCalc(Object.fromEntries(entries));
    })();

    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice, selectedMonth]);

  // chart export (placeholder – funcțiile rămân pentru când adaugi graficul)
  const exportChart = async (as = "svg") => {
    const svg = chartSvgRef.current?.querySelector("svg");
    if (!svg) return;
    if (as === "svg") {
      const serializer = new XMLSerializer();
      const blob = new Blob([serializer.serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "overview.svg"; a.click(); URL.revokeObjectURL(url);
      return;
    }
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    await new Promise((res) => { img.onload = res; img.src = url; });
    const bbox = svg.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(800, Math.floor(bbox.width));
    canvas.height = Math.max(300, Math.floor(bbox.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => { const dl = document.createElement("a"); dl.href = URL.createObjectURL(blob); dl.download = "overview.png"; dl.click(); });
  };

  // >>> CSV export
  function exportCsv() {
    const headers = [
      t("clients.csv.name"),
      t("clients.csv.company"),
      t("clients.csv.email"),
      t("clients.csv.createdAt"),
      t("clients.csv.current"),
      t("clients.csv.carry"),
      t("clients.csv.live"),
    ];
    const rowsCsv = slice.map((p) => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
      const c = calc[p.id] || { currentSold: 0, carry: 0, diff: 0 };
      return [
        name,
        p.company_name || "—",
        p.email || "—",
        (p.created_at || "").slice(0,10),
        fmt2(Number(c.currentSold || 0)),
        fmt2(Number(c.carry || 0)),
        fmt2(Number(c.diff || 0)),
      ].join(",");
    });
    const footer = ["","","",t("clients.csv.footer"),
      fmt2(tableTotals.totCurrent),
      fmt2(tableTotals.totCarry),
      fmt2(tableTotals.totDiff),
    ].join(",");
    const csv = [headers.join(","), ...rowsCsv, footer].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `clients-${selectedMonth}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const toggleClient = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
const handleStoreChange = async (profileId, value) => {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ store_name: value })
      .eq("id", profileId);

    if (error) throw error;
    setRows((prev) =>
      prev.map((r) => (r.id === profileId ? { ...r, store_name: value } : r))
    );
  } catch (err) {
    console.error("Eroare la actualizarea store_name:", err.message);
  }
};

  // --- RENDER
  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Month selector */}
        <div className="flex flex-col">
          <label className="text-xs text-text-secondary mb-1">{t("clients.filters.month")}</label>
          <div className="flex items-center gap-2">
            <button className="border rounded p-2" onClick={() => gotoMonth(-1)} title={t("clients.filters.prevMonth")}><ChevronLeft className="w-4 h-4" /></button>
            <div className="relative">
              <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  const mk = e.target.value; setSelectedMonth(mk);
                  const [yy, mm] = mk.split("-").map(Number);
                  const d = new Date(yy, mm - 1, 1);
                  setFrom(isoLocal(firstDayOfMonth(d)));
                  setTo(isoLocal(lastDayOfMonth(d)));
                  setPage(1);
                }}
                className="pl-9 pr-3 py-2 border rounded w-44"
              />
            </div>
            <button className="border rounded p-2" onClick={() => gotoMonth(1)} title={t("clients.filters.nextMonth")}><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">{from} → {to}</div>
        </div>

        {/* Balance filter */}
        <div className="flex flex-col">
          <label className="text-xs text-text-secondary mb-1">{t("clients.filters.balance")}</label>
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
            <select value={restFilter} onChange={(e)=>setRestFilter(e.target.value)} className="pl-9 pr-3 py-2 border rounded w-48">
              <option value="all">{t("clients.balanceFilters.all")}</option>
              <option value="with">{t("clients.balanceFilters.with")}</option>
              <option value="advance">{t("clients.balanceFilters.advance")}</option>
              <option value="without">{t("clients.balanceFilters.without")}</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[280px]">
          <label className="text-xs text-text-secondary mb-1">{t("clients.filters.search")}</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={t("clients.filters.searchPlaceholder")}
              className="pl-9 pr-3 py-2 w-full border rounded"
            />
          </div>
        </div>

        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-3 py-2 border rounded shadow-sm"
          title={t("clients.buttons.exportCsv")}
        >
          <Download className="w-4 h-4" /> {t("clients.buttons.exportCsv")}
        </button>
        <button
          onClick={() => setShowEmail(!showEmail)}
          className="inline-flex items-center gap-2 px-3 py-2 border rounded shadow-sm"
          title={t("clients.buttons.toggleEmail")}
        >
          {showEmail ? t("clients.buttons.hideEmail") : t("clients.buttons.showEmail")}
        </button>
      </div>

      {/* Info bar: Parametrii trimiși la RPC (vizibil pe pagină) */}
<div className="text-xs text-gray-600 flex items-center gap-2">
  <InfoIcon className="w-4 h-4" />
  <span>
    {tp("clients.rpcRange", { start: rpcStart, end: rpcEnd })}
  </span>
</div>

      {/* TABLE */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
            <th className="px-4 py-3 text-left">{t("clients.table.store")}</th>
              <th className="px-4 py-3 text-left">{t("clients.table.name")}</th>
              <th className="px-4 py-3 text-left">{t("clients.table.company")}</th>
              {showEmail && <th className="px-4 py-3 text-left">{t("clients.table.email")}</th>}
              <th className="px-4 py-3 text-left">{t("clients.table.createdAt")}</th>
              <th className="px-4 py-3 text-left whitespace-pre-line">{t("clients.table.currentBalance")}</th>
              <th className="px-4 py-3 text-left">{t("clients.table.carryBalance")}</th>
              <th className="px-4 py-3 text-left">{t("clients.table.liveBalance")}</th>
              <th className="px-4 py-3 text-right">{t("clients.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">{t("common.loading")}</td></tr>
            ) : error ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-red-600">{error}</td></tr>
            ) : slice.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">{t("clients.empty")}</td></tr>
            ) : (
              slice.map((p) => {
                const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
                const c = calc[p.id] || { currentSold: 0, carry: 0, diff: 0 };
                return (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                        <input
                          type="text"
                          value={p.store_name || ""}
                          onChange={(e) => handleStoreChange(p.id, e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 w-36 text-sm"
                          placeholder="Store..."
                        />
                      </td>
                    <td className="px-4 py-3">{name}</td>
                    <td className="px-4 py-3" title={p.company_id || ""}>{p.company_name || "—"}</td>
                    {showEmail && <td className="px-4 py-3">{p.email || "—"}</td>}
                    <td className="px-4 py-3">{p.created_at?.slice(0,10) || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-900">
                        {fmt2(Number(c.currentSold || 0))}
                      </span>
                    </td>
                    <td className="px-4 py-3"><MoneyPill value={c.carry} /></td>
                    <td className="px-4 py-3"><MoneyPill value={c.diff} /></td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-sm bg-primary text-white rounded px-3 py-1" onClick={() => onSelect?.(p)}>{t("clients.table.open")}</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {!loading && slice.length > 0 && (
            <tfoot>
              <tr className="border-t bg-slate-50/80 font-semibold text-text-primary">
                <td className="px-4 py-3" colSpan={showEmail ? 9 : 8}>{t("clients.csv.footer")}</td>
                <td className="px-4 py-3">{fmt2(tableTotals.totCurrent)}</td>
                <td className="px-4 py-3">{fmt2(tableTotals.totCarry)}</td>
                <td className="px-4 py-3">{fmt2(tableTotals.totDiff)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 justify-end text-sm">
        <button className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageClamped <= 1} title={t("clients.paginationPrev")}><ChevronLeft className="w-4 h-4" /></button>
        <span>{tp("clients.pagination", { page: pageClamped, total: totalPages })}</span>
        <button className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageClamped >= totalPages} title={t("clients.paginationNext")}><ChevronRight className="w-4 h-4" /></button>
      </div>

      {/* OVERVIEW (chart placeholder) */}
      <div className="bg-white rounded-xl shadow-sm p-6" ref={chartSvgRef}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-text-primary">Overview (volum unități)</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => exportChart("svg")} className="px-3 py-1 border rounded">Export SVG</button>
            <button onClick={() => exportChart("png")} className="px-3 py-1 border rounded">Export PNG</button>
          </div>
        </div>
        {/* Aici poți adăuga ulterior <ResponsiveContainer><LineChart>…</LineChart></ResponsiveContainer> */}
      </div>
    </div>
  );
}
