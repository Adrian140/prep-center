// FILE: src/components/admin/AdminAnalytics.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { supabaseHelpers } from "../../config/supabase";
import { BarChart3, Globe2, Link2 } from "lucide-react";

export default function AdminAnalytics() {
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState({
    byDay: [],
    topPaths: [],
    topReferrers: [],
    totals: { visits: 0, uniqueVisitors: 0, returningVisitors: 0 },
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { byDay, topPaths, topReferrers, totals, error } = await supabaseHelpers.getAnalytics({ days: range });
      if (cancelled) return;
      if (error) setError(error);
      else {
        setRows({
          byDay: byDay || [],
          topPaths: topPaths || [],
          topReferrers: topReferrers || [],
          totals: totals || { visits: 0, uniqueVisitors: 0, returningVisitors: 0 },
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range]);

  const dailyStats = rows.byDay || [];
  const chartData = useMemo(
    () =>
      dailyStats.map((d) => ({
        date: d.date,
        total: d.visits,
        returning: d.returningVisitors,
        uniques: d.uniqueVisitors,
      })),
    [dailyStats]
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload.reduce(
      (acc, cur) => ({ ...acc, [cur.dataKey]: cur.value }),
      {}
    );
    return (
      <div className="bg-white border shadow-sm rounded-md px-3 py-2 text-xs text-text-secondary">
        <div className="font-semibold text-text-primary mb-1">{label}</div>
        <div>Total: {point.total ?? 0}</div>
        <div>Unici: {point.uniques ?? 0}</div>
        <div>Reveniți: {point.returning ?? 0}</div>
      </div>
    );
  };

  const topPaths = rows.topPaths || [];
  const topReferrers = rows.topReferrers || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Analytics
        </h2>
        <select
          className="border rounded-lg px-3 py-2"
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
        >
          <option value={7}>Ultimele 7 zile</option>
          <option value={30}>Ultimele 30 zile</option>
          <option value={90}>Ultimele 90 zile</option>
        </select>
      </div>

      {loading && <div className="py-8 text-text-secondary">Loading…</div>}
      {error && (
        <div className="py-8 text-red-600">
          Eroare: {error.message || String(error)}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm text-text-secondary mb-1">Vizite totale</div>
              <div className="text-2xl font-bold text-text-primary">{rows.totals.visits || 0}</div>
              <div className="text-xs text-text-secondary">Evenimente de vizită în intervalul selectat.</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm text-text-secondary mb-1">Vizitatori unici</div>
              <div className="text-2xl font-bold text-text-primary">{rows.totals.uniqueVisitors || 0}</div>
              <div className="text-xs text-text-secondary">Utilizatori unici care au intrat cel puțin o dată.</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm text-text-secondary mb-1">Au revenit</div>
              <div className="text-2xl font-bold text-text-primary">{rows.totals.returningVisitors || 0}</div>
              <div className="text-xs text-text-secondary">Vizitatori cu minim 2 vizite în interval.</div>
            </div>
          </div>

          {/* Visits per day */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 text-sm text-text-secondary">
              <span>Trend vizite (total vs reveniți) — stil linie</span>
              <div className="flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-1 rounded-full bg-primary inline-block" />
                  Total
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-4 h-1 rounded-full bg-emerald-500 inline-block" />
                  Reveniți
                </span>
              </div>
            </div>
            {chartData.length >= 2 ? (
              <div className="w-full h-72 bg-white border rounded-lg overflow-hidden px-2 py-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => value.slice(5)}
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="Total"
                    />
                    <Line
                      type="monotone"
                      dataKey="returning"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="Reveniți"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-text-secondary text-sm">Ai nevoie de cel puțin 2 zile de date pentru grafic.</div>
            )}
          </div>

          {/* Top lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3 text-sm text-text-secondary">
                <Link2 className="w-4 h-4" /> Pagini top
              </div>
              <ul className="space-y-2">
                {topPaths.map(([p, c]) => (
                  <li key={p} className="flex justify-between gap-3">
                    <span className="truncate">{p}</span>
                    <span className="font-semibold">{c}</span>
                  </li>
                ))}
                {topPaths.length === 0 && <li className="text-text-secondary">—</li>}
              </ul>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3 text-sm text-text-secondary">
                <Globe2 className="w-4 h-4" /> Referrers
              </div>
              <ul className="space-y-2">
                {topReferrers.map(([r, c]) => (
                  <li key={r} className="flex justify-between gap-3">
                    <span className="truncate">{r}</span>
                    <span className="font-semibold">{c}</span>
                  </li>
                ))}
                {topReferrers.length === 0 && <li className="text-text-secondary">—</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
