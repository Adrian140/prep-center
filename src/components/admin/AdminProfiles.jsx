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

// --- UI
function MoneyPill({ value }) {
  const isZero = !Number.isFinite(value) || Math.abs(value) < 1e-9;
  const cls = isZero ? "bg-gray-100 text-gray-700"
    : value < 0 ? "bg-red-100 text-red-800"
    : "bg-green-100 text-green-800";
  return <span className={`px-2 py-1 rounded-md text-sm font-medium ${cls}`}>{fmt2(value)}</span>;
}

export default function AdminProfiles({ onSelect }) {
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

          const { data, error } = await supabaseHelpers.getPeriodBalances(
            p.id, p.company_id, start, end
          );
          if (error || !data) return [p.id, { currentSold: 0, carry: 0, diff: 0 }];

          // Cheile exacte din RPC (observă sold_curent cu un singur „r”)
          const current = Number((data.sold_current ?? data.sold_curent) ?? 0);
          const carry   = Number(data.sold_restant ?? 0);
          const diff    = Number(data.sold_la_zi   ?? 0);

          return [p.id, { currentSold: current, carry, diff }];
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
      "Nume","Companie","Email","Creat la",
      "Sold_luna_curenta","Sold_restant_avans","Sold_la_zi",
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
    const footer = ["","","","Total pagina curentă",
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
          <label className="text-xs text-text-secondary mb-1">Luna</label>
          <div className="flex items-center gap-2">
            <button className="border rounded p-2" onClick={() => gotoMonth(-1)} title="Luna anterioară"><ChevronLeft className="w-4 h-4" /></button>
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
            <button className="border rounded p-2" onClick={() => gotoMonth(1)} title="Luna următoare"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">{from} → {to}</div>
        </div>

        {/* Balance filter */}
        <div className="flex flex-col">
          <label className="text-xs text-text-secondary mb-1">Filtru sold restant / avans</label>
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
            <select value={restFilter} onChange={(e)=>setRestFilter(e.target.value)} className="pl-9 pr-3 py-2 border rounded w-48">
              <option value="all">Toate</option>
              <option value="with">Cu restanță</option>
              <option value="advance">Cu avans</option>
              <option value="without">Fără restanță</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[280px]">
          <label className="text-xs text-text-secondary mb-1">Căutare</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Nume / companie / email…"
              className="pl-9 pr-3 py-2 w-full border rounded"
            />
          </div>
        </div>

        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-3 py-2 border rounded shadow-sm"
          title="Export CSV"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
        <button
          onClick={() => setShowEmail(!showEmail)}
          className="inline-flex items-center gap-2 px-3 py-2 border rounded shadow-sm"
          title="Afișează/ascunde coloana Email"
        >
          {showEmail ? "Ascunde Email" : "Afișează Email"}
        </button>
      </div>

      {/* Info bar: Parametrii trimiși la RPC (vizibil pe pagină) */}
<div className="text-xs text-gray-600 flex items-center gap-2">
  <InfoIcon className="w-4 h-4" />
  <span>
    Perioadă RPC: <strong>{rpcStart}</strong> (inclusiv) → <strong>{rpcEnd}</strong> (inclusiv)
  </span>
</div>

      {/* TABLE */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
            <th className="px-4 py-3 text-left">Store</th>
              <th className="px-4 py-3 text-left">Nume</th>
              <th className="px-4 py-3 text-left">Companie</th>
              {showEmail && <th className="px-4 py-3 text-left">Email</th>}
              <th className="px-4 py-3 text-left">Creat la</th>
              <th className="px-4 py-3 text-left">Sold<div className="text-[11px] text-gray-400">(FBA+FBM luna curentă)</div></th>
              <th className="px-4 py-3 text-left">Sold Restant/Avans</th>
              <th className="px-4 py-3 text-left">Sold la zi</th>
              <th className="px-4 py-3 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Se încarcă…</td></tr>
            ) : error ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-red-600">{error}</td></tr>
            ) : slice.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Niciun client găsit.</td></tr>
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
                      <button className="text-sm bg-primary text-white rounded px-3 py-1" onClick={() => onSelect?.(p)}>Deschide</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {!loading && slice.length > 0 && (
            <tfoot>
              <tr className="border-t bg-slate-50/80 font-semibold text-text-primary">
                <td className="px-4 py-3" colSpan={showEmail ? 9 : 8}>Total (pagina curentă)</td>
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
        <button className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageClamped <= 1} title="Pagina anterioară"><ChevronLeft className="w-4 h-4" /></button>
        <span>Pagina {pageClamped} / {totalPages}</span>
        <button className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageClamped >= totalPages} title="Pagina următoare"><ChevronRight className="w-4 h-4" /></button>
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
