// FILE: src/components/admin/AdminAnalytics.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabaseHelpers } from "../../config/supabase";
import { BarChart3, Globe2, Link2 } from "lucide-react";

export default function AdminAnalytics() {
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState({ byDay: [], topPaths: [], topReferrers: [] });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { byDay, topPaths, topReferrers, error } = await supabaseHelpers.getAnalytics({ days: range });
      if (cancelled) return;
      if (error) setError(error);
      else setRows({ byDay: byDay || [], topPaths: topPaths || [], topReferrers: topReferrers || [] });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range]);

  // bucket visits per day
  const dayBuckets = useMemo(() => {
    const map = new Map();
    (rows.byDay || []).forEach((r) => {
      const d = new Date(r.created_at);
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    });
    const arr = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const max = Math.max(1, ...arr.map((x) => x[1]));
    return { arr, max };
  }, [rows.byDay]);

  // top lists helpers
  const countAndSort = (data, key) => {
    const m = new Map();
    (data || []).forEach((r) => {
      const k = r[key] || "(direct)";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  };

  const topPaths = countAndSort(rows.topPaths, "path");
  const topReferrers = countAndSort(rows.topReferrers, "referrer");

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
          {/* Visits per day */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-sm text-text-secondary mb-3">Vizite pe zi</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {dayBuckets.arr.map(([date, count]) => (
                <div key={date} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-text-secondary">{date}</div>
                  <div className="flex-1 h-3 bg-white rounded-md overflow-hidden border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(count / dayBuckets.max) * 100}%` }}
                    />
                  </div>
                  <div className="w-10 text-right text-sm">{count}</div>
                </div>
              ))}
              {dayBuckets.arr.length === 0 && (
                <div className="text-text-secondary">Nicio vizită în interval.</div>
              )}
            </div>
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
