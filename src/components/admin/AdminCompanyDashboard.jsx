import React, { useEffect, useMemo, useState } from 'react';
import {
  Package,
  TrendingUp,
  RotateCcw,
  RefreshCcw,
  Calendar as CalendarIcon,
  Building2,
  Search
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { supabaseHelpers } from '@/config/supabase';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';

const todayIso = () => new Date().toISOString().slice(0, 10);
const formatDisplayDate = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

const Card = ({ title, value, subtitle, color = 'bg-white', accentClass = 'text-text-primary' }) => (
  <div className={`${color} border rounded-xl p-4 shadow-sm`}>
    <div className="text-xs uppercase tracking-wide text-text-secondary mb-1">{title}</div>
    <div className={`text-2xl font-semibold ${accentClass}`}>{value}</div>
    {subtitle && <div className="text-xs text-text-secondary mt-1">{subtitle}</div>}
  </div>
);

export default function AdminCompanyDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companiesError, setCompaniesError] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [search, setSearch] = useState('');

  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadCompanies = async () => {
      setLoadingCompanies(true);
      setCompaniesError('');
      const { data, error } = await supabase
        .from('companies')
        .select('id,name')
        .order('name', { ascending: true })
        .limit(500);
      if (cancelled) return;
      if (error) {
        setCompaniesError(error.message || 'Nu am putut încărca companiile.');
        setCompanies([]);
      } else {
        setCompanies(data || []);
        setSelectedCompany((data || [])[0] || null);
      }
      setLoadingCompanies(false);
    };
    loadCompanies();
    return () => { cancelled = true; };
  }, []);

  const loadSnapshot = async () => {
    if (!selectedCompany?.id) return;
    setLoadingData(true);
    setDataError('');
    const { data, error } = await supabaseHelpers.getClientAnalyticsSnapshot({
      companyId: selectedCompany.id,
      userId: null,
      startDate: dateFrom,
      endDate: dateTo
    });
    if (error) {
      setDataError(error.message || 'Nu am putut încărca datele pentru companie.');
      setSnapshot(null);
    } else {
      setSnapshot(data || null);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, dateFrom, dateTo]);

  const applyPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(end.toISOString().slice(0, 10));
  };

  const filteredCompanies = companies.filter((c) =>
    !search
      ? true
      : (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.id || '').toLowerCase().includes(search.toLowerCase())
  );

  const todayOrders = useMemo(() => {
    if (!snapshot?.series?.orders?.daily) return 0;
    const row = snapshot.series.orders.daily.find((d) => d.date === dateFrom);
    return row?.total || 0;
  }, [snapshot?.series?.orders?.daily, dateFrom]);

  const todayReceiving = useMemo(() => {
    if (!snapshot?.series?.shipments?.daily) return 0;
    const row = snapshot.series.shipments.daily.find((d) => d.date === dateFrom);
    return row?.total || 0;
  }, [snapshot?.series?.shipments?.daily, dateFrom]);

  const sumTotal = (series) =>
    (series?.daily || []).reduce((acc, row) => acc + (row.total || 0), 0);

  const chartData = useMemo(() => {
    const map = new Map();
    (snapshot?.series?.orders?.daily || []).forEach((row) => {
      map.set(row.date, { date: row.date, orders: row.total || 0, receiving: 0 });
    });
    (snapshot?.series?.shipments?.daily || []).forEach((row) => {
      const prev = map.get(row.date) || { date: row.date, orders: 0, receiving: 0 };
      prev.receiving = row.total || 0;
      map.set(row.date, prev);
    });
    return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [snapshot?.series]);

  const moneyToday = 'N/A';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-text-primary">
          <Package className="w-5 h-5" />
          <div>
            <div className="text-xs uppercase tracking-wide text-text-light">Dashboard</div>
            <h2 className="text-xl font-semibold">Monitorizare operațională</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 border rounded-lg px-2 py-1 bg-white">
            <Search className="w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Caută companie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm outline-none w-40"
            />
            <Building2 className="w-4 h-4 text-text-secondary" />
            <select
              className="text-sm outline-none"
              value={selectedCompany?.id || ''}
              onChange={(e) => {
                const next = companies.find((c) => c.id === e.target.value) || null;
                setSelectedCompany(next);
              }}
            >
              {filteredCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Fără nume'} · {c.id.slice(0, 6)}
                </option>
              ))}
              {!filteredCompanies.length && <option value="">Nicio companie găsită</option>}
            </select>
          </div>
          <div className="flex items-center gap-2 border rounded-lg px-2 py-1 bg-white">
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
            <button onClick={() => applyPreset(1)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">Azi</button>
            <button onClick={() => applyPreset(7)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">7z</button>
            <button onClick={() => applyPreset(30)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">30z</button>
          </div>
          <button
            onClick={loadSnapshot}
            disabled={loadingData}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm"
          >
            <RefreshCcw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            Reîmprospătează
          </button>
        </div>
      </div>

      {companiesError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {companiesError}
        </div>
      )}
      {dataError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {dataError}
        </div>
      )}

      {loadingCompanies ? (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">Se încarcă lista de companii…</div>
      ) : !selectedCompany ? (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">Nu există companii de afișat.</div>
      ) : loadingData ? (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">Se încarcă datele…</div>
      ) : !snapshot ? (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">Nu există date pentru intervalul selectat.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              title="Inventory"
              value={`${snapshot.inventory.volumeM3} m³`}
              subtitle={`Units: ${snapshot.inventory.units} • Active SKUs: ${snapshot.inventory.activeSkus}`}
              accentClass="text-emerald-700"
            />
            <Card
              title="Finance"
              value={`€${Number(snapshot.finance.balance || 0).toFixed(2)}`}
              subtitle={`Facturi neîncasate: ${snapshot.finance.pendingInvoices}`}
              accentClass="text-orange-600"
            />
            <Card
              title="Returns"
              value={snapshot.returns.pending}
              subtitle="De confirmat"
              accentClass="text-emerald-700"
            />
            <Card
              title="Bani astăzi"
              value={moneyToday}
              subtitle="Sursă încă neimplementată"
              accentClass="text-text-secondary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              title="Pregătit astăzi"
              value={todayOrders}
              subtitle={`Total în interval: ${sumTotal(snapshot.series.orders)}`}
              accentClass="text-blue-700"
            />
            <Card
              title="Recepționat astăzi"
              value={todayReceiving}
              subtitle={`Total în interval: ${sumTotal(snapshot.series.shipments)}`}
              accentClass="text-blue-700"
            />
            <Card
              title="Unități în depozit"
              value={snapshot.inventory.units}
              subtitle="Stoc curent"
              accentClass="text-blue-700"
            />
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-text-primary">Statistici zilnice</div>
              <div className="text-xs text-text-secondary">
                Interval: {formatDisplayDate(snapshot.dateFrom)} — {formatDisplayDate(snapshot.dateTo)}
              </div>
            </div>
            {chartData.length ? (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDisplayDate(v)} tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        return (
                          <div className="bg-white border rounded-md px-3 py-2 text-xs shadow-sm">
                            <div className="font-semibold text-text-primary mb-1">{formatDisplayDate(label)}</div>
                            {payload.map((p) => (
                              <div key={p.dataKey} className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 rounded-full" style={{ background: p.color }} />
                                <span className="text-text-secondary">{p.dataKey}</span>
                                <span className="font-semibold text-text-primary">{p.value}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="orders"
                      stroke="#2563eb"
                      fill="#2563eb"
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                      name="Pregătit"
                    />
                    <Area
                      type="monotone"
                      dataKey="receiving"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                      name="Recepționat"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">Nu există date în intervalul selectat.</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-text-primary mb-2">Status comenzi (interval)</div>
              <div className="divide-y">
                {Object.entries(snapshot.series.orders.statusCounts || {}).map(([status, value]) => (
                  <div key={status} className="flex items-center justify-between py-2 text-sm">
                    <span className="capitalize text-text-secondary">{status}</span>
                    <span className="font-semibold text-text-primary">{value}</span>
                  </div>
                ))}
                {!Object.keys(snapshot.series.orders.statusCounts || {}).length && (
                  <div className="text-sm text-text-secondary py-2">Nicio comandă în interval.</div>
                )}
              </div>
            </div>
            <div className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-text-primary mb-2">Status recepții (interval)</div>
              <div className="divide-y">
                {Object.entries(snapshot.series.shipments.statusCounts || {}).map(([status, value]) => (
                  <div key={status} className="flex items-center justify-between py-2 text-sm">
                    <span className="capitalize text-text-secondary">{status}</span>
                    <span className="font-semibold text-text-primary">{value}</span>
                  </div>
                ))}
                {!Object.keys(snapshot.series.shipments.statusCounts || {}).length && (
                  <div className="text-sm text-text-secondary py-2">Nicio recepție în interval.</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="text-sm font-semibold text-text-primary mb-3">FBA Stock</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">In stock</div>
                <div className="font-semibold text-text-primary">{snapshot.fbaStock.inStock}</div>
              </div>
              <div className="border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">Reserved</div>
                <div className="font-semibold text-text-primary">{snapshot.fbaStock.reserved}</div>
              </div>
              <div className="border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">Inbound</div>
                <div className="font-semibold text-text-primary">{snapshot.fbaStock.inbound}</div>
              </div>
              <div className="border rounded-lg px-3 py-2">
                <div className="text-text-secondary text-xs">Unfulfillable</div>
                <div className="font-semibold text-text-primary">{snapshot.fbaStock.unfulfillable}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
