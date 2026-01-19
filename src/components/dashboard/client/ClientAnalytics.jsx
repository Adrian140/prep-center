import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Calendar as CalendarIcon, BarChart3, RefreshCcw, TrendingUp, Package, Truck, RotateCcw, AlertCircle } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabaseHelpers } from '@/config/supabase';

const todayIso = () => new Date().toISOString().slice(0, 10);
const formatDisplayDate = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#e11d48'];

const Card = ({ title, icon: Icon, children }) => (
  <div className="bg-white border rounded-xl p-4 shadow-sm">
    <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
      {Icon && <Icon className="w-4 h-4" />}
      <span>{title}</span>
    </div>
    {children}
  </div>
);

const StatusPill = ({ label, value, color }) => (
  <div className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-gray-50 border">
    <span className="flex items-center gap-2 text-text-secondary">
      {color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}
      <span>{label}</span>
    </span>
    <span className="font-semibold text-text-primary">{value}</span>
  </div>
);

export default function ClientAnalytics({
  companyId: companyIdProp = null,
  userId: userIdProp = null,
  title = 'Dashboard cu date live',
  subtitle = 'Filtrează pe interval; implicit ziua curentă.'
} = {}) {
  const { user, profile, status } = useSupabaseAuth();
  const companyId = companyIdProp || profile?.company_id;
  const userId = userIdProp || user?.id;

  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [selectedSeries, setSelectedSeries] = useState('orders');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState(null);

  const load = async () => {
    if (!companyId) {
      setRows(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabaseHelpers.getClientAnalyticsSnapshot({
      companyId,
      userId,
      startDate: dateFrom,
      endDate: dateTo
    });
    if (err) {
      setError(err.message || 'Nu am putut încărca analytics.');
    }
    setRows(data || null);
    setLoading(false);
  };

  useEffect(() => {
    if (status === 'loading') return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateFrom, dateTo, status, userId]);

  const applyPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(end.toISOString().slice(0, 10));
  };

  const chartSeries = useMemo(() => {
    if (!rows?.series) return null;
    const key = rows.series[selectedSeries] ? selectedSeries : Object.keys(rows.series)[0];
    return { key, ...(rows.series[key] || {}) };
  }, [rows, selectedSeries]);

  const chartData = chartSeries?.daily || [];
  const statusKeys = chartSeries?.statusKeys || [];

  const tooltipContent = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-white border rounded-md shadow-sm px-3 py-2 text-xs">
        <div className="font-semibold text-text-primary mb-1">{label}</div>
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: p.color }} />
            <span className="text-text-secondary">{p.dataKey}</span>
            <span className="font-semibold text-text-primary">{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const recentRows = useMemo(() => {
    const base = chartSeries?.recent || [];
    return base.map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at
    }));
  }, [chartSeries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="text-sm uppercase tracking-wide text-text-light">Analytics</div>
          <h2 className="text-2xl font-semibold text-text-primary">{title}</h2>
          <p className="text-text-secondary text-sm">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white">
              <CalendarIcon className="w-4 h-4 text-text-secondary" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm outline-none"
              />
              <span className="text-text-light">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-sm outline-none"
              />
            </div>
            <div className="flex items-center gap-1 bg-white border rounded-lg px-1 py-1">
              <button onClick={() => applyPreset(1)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">Astăzi</button>
              <button onClick={() => applyPreset(7)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">7z</button>
              <button onClick={() => applyPreset(30)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">30z</button>
            </div>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm"
            disabled={loading}
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Reîmprospătează
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm border border-red-100 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border rounded-xl p-6 text-sm text-text-secondary">Se încarcă datele…</div>
      ) : !rows ? (
        <div className="bg-white border rounded-xl p-6 text-sm text-text-secondary">Nicio companie asociată.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card title="Inventory" icon={Package}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-text-secondary">Units</div>
                  <div className="text-xl font-semibold text-text-primary">{rows.inventory.units}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-text-secondary">Active SKUs</div>
                  <div className="text-xl font-semibold text-text-primary">{rows.inventory.activeSkus}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-text-secondary">Volume: {rows.inventory.volumeM3} m³</div>
            </Card>
            <Card title="Finance" icon={TrendingUp}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-text-secondary">Balance</div>
                  <div className="text-xl font-semibold text-text-primary">€{Number(rows.finance.balance || 0).toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-text-secondary">Pending invoices</div>
                  <div className="text-xl font-semibold text-text-primary">{rows.finance.pendingInvoices}</div>
                </div>
              </div>
            </Card>
            <Card title="Returns" icon={RotateCcw}>
              <div className="text-xs text-text-secondary">De confirmat</div>
              <div className="text-xl font-semibold text-text-primary">{rows.returns.pending}</div>
            </Card>
            <Card title="FBA Stock" icon={Truck}>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <StatusPill label="In stock" value={rows.fbaStock.inStock} />
                <StatusPill label="Reserved" value={rows.fbaStock.reserved} />
                <StatusPill label="Inbound" value={rows.fbaStock.inbound} />
                <StatusPill label="Unfulfillable" value={rows.fbaStock.unfulfillable} />
              </div>
            </Card>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-text-primary">
                <BarChart3 className="w-5 h-5" />
                <span className="font-semibold text-sm">Grafic statusuri</span>
              </div>
              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={selectedSeries}
                onChange={(e) => setSelectedSeries(e.target.value)}
              >
                {Object.entries(rows.series || {}).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>

            {chartData.length ? (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDisplayDate(v)} tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip content={tooltipContent} />
                    <Legend />
                    {statusKeys.map((key, idx) => (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stackId="1"
                        stroke={palette[idx % palette.length]}
                        fill={palette[idx % palette.length]}
                        fillOpacity={0.2}
                        strokeWidth={1.5}
                        name={key}
                      />
                    ))}
                    {!statusKeys.length && (
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke={palette[0]}
                        fill={palette[0]}
                        fillOpacity={0.15}
                        strokeWidth={1.5}
                        name="total"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">Nu există date în intervalul selectat.</div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <div className="text-sm font-semibold text-text-primary">Status breakdown</div>
              {chartSeries?.statusKeys?.length ? (
                <div className="grid grid-cols-1 gap-2">
                  {chartSeries.statusKeys.map((key, idx) => (
                    <StatusPill
                      key={key}
                      label={key}
                      value={chartSeries.statusCounts?.[key] || 0}
                      color={palette[idx % palette.length]}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-text-secondary">Nicio schimbare de status în acest interval.</div>
              )}
            </div>

            <div className="bg-white border rounded-xl p-4 space-y-3 lg:col-span-2">
              <div className="text-sm font-semibold text-text-primary">Evenimente recente</div>
              {recentRows.length ? (
                <div className="divide-y">
                  {recentRows.map((row) => (
                    <div key={row.id} className="py-2 flex items-center justify-between text-sm">
                      <div className="text-text-primary font-medium truncate">{row.id}</div>
                      <div className="flex items-center gap-3 text-text-secondary">
                        <span className="px-2 py-1 rounded-full bg-gray-100 border text-xs text-text-primary">
                          {row.status || '—'}
                        </span>
                        <span className="text-xs">{formatDisplayDate(row.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-text-secondary">Nu avem încă evenimente.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
