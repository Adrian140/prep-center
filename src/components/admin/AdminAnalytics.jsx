// FILE: src/components/admin/AdminAnalytics.jsx
import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Users, Activity } from "lucide-react";

export default function AdminAnalytics() {
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [daily, setDaily] = useState([]);
  const [topPages, setTopPages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchGa = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/functions/v1/ga-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: range }),
        });
        if (!res.ok) throw new Error(`GA fetch failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setDaily(data.daily || []);
        setTopPages(data.topPages || []);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchGa();
    return () => { cancelled = true; };
  }, [range]);

  // normalize daily rows into chart data
  const dailyChart = useMemo(() => {
    const arr = (daily || []).map((row) => {
      const date = row.dimensionValues?.[0]?.value || "";
      const metrics = row.metricValues || [];
      return {
        date,
        users: Number(metrics[0]?.value || 0),
        sessions: Number(metrics[1]?.value || 0),
        events: Number(metrics[2]?.value || 0),
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    const maxSessions = Math.max(1, ...arr.map((x) => x.sessions));
    return { arr, maxSessions };
  }, [daily]);

  const totals = useMemo(() => {
    return dailyChart.arr.reduce(
      (acc, cur) => {
        acc.users += cur.users;
        acc.sessions += cur.sessions;
        acc.events += cur.events;
        return acc;
      },
      { users: 0, sessions: 0, events: 0 }
    );
  }, [dailyChart]);

  const topPagesList = useMemo(() => {
    return (topPages || []).map((row) => {
      const path = row.dimensionValues?.[0]?.value || "(unknown)";
      const sessions = Number(row.metricValues?.[0]?.value || 0);
      return { path, sessions };
    }).slice(0, 10);
  }, [topPages]);

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
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-text-secondary">Users</div>
                <div className="text-xl font-semibold">{totals.users}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-text-secondary">Sessions</div>
                <div className="text-xl font-semibold">{totals.sessions}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm text-text-secondary">Events</div>
                <div className="text-xl font-semibold">{totals.events}</div>
              </div>
            </div>
          </div>

          {/* Visits per day */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-sm text-text-secondary mb-3">Trafic pe zi (GA4)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {dailyChart.arr.map((row) => (
                <div key={row.date} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-text-secondary">{row.date}</div>
                  <div className="flex-1 h-3 bg-white rounded-md overflow-hidden border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(row.sessions / dailyChart.maxSessions) * 100}%` }}
                    />
                  </div>
                  <div className="w-14 text-right text-sm">{row.sessions} sess</div>
                </div>
              ))}
              {dailyChart.arr.length === 0 && (
                <div className="text-text-secondary">Nicio vizită în interval.</div>
              )}
            </div>
          </div>

          {/* Top lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3 text-sm text-text-secondary">Pagini top (GA4)</div>
              <ul className="space-y-2">
                {topPagesList.map((row) => (
                  <li key={row.path} className="flex justify-between gap-3">
                    <span className="truncate">{row.path}</span>
                    <span className="font-semibold">{row.sessions}</span>
                  </li>
                ))}
                {topPagesList.length === 0 && <li className="text-text-secondary">—</li>}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
