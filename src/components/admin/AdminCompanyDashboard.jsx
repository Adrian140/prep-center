import React, { useEffect, useMemo, useState } from 'react';
import {
  Package,
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
import { useAdminTranslation } from '@/i18n/useAdminTranslation';
import { useMarket } from '@/contexts/MarketContext';

const todayIso = () => new Date().toISOString().slice(0, 10);
const shiftDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
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
  const { t, tp } = useAdminTranslation();
  const { currentMarket } = useMarket();
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companiesError, setCompaniesError] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [search, setSearch] = useState('');

  const [dateFrom, setDateFrom] = useState(() => todayIso());
  const [dateTo, setDateTo] = useState(() => todayIso());

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [chartRange, setChartRange] = useState(30);
  const [chartSnapshot, setChartSnapshot] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState('');
  const [monthFinance, setMonthFinance] = useState(null);
  const [staleness, setStaleness] = useState([]);
  const [stalenessLoading, setStalenessLoading] = useState(false);
  const [stalenessError, setStalenessError] = useState('');
  const [globalStockUnits, setGlobalStockUnits] = useState(null);
  const [storageApplyId, setStorageApplyId] = useState(null);
  const [storeByCompany, setStoreByCompany] = useState({});

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
        setCompaniesError(error.message || t('adminDashboard.errors.loadCompanies'));
        setCompanies([]);
      } else {
        const list = data || [];
        const allEntry = { id: 'ALL', name: t('adminDashboard.allCompaniesOption') };
        setCompanies([allEntry, ...list]);
        setSelectedCompany(allEntry);
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
      companyId: selectedCompany.id === 'ALL' ? null : selectedCompany.id,
      userId: null,
      country: currentMarket,
      startDate: dateFrom,
      endDate: dateTo
    });
    if (error) {
      setDataError(error.message || t('adminDashboard.errors.loadData'));
      setSnapshot(null);
    } else {
      setSnapshot(data || null);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, dateFrom, dateTo, currentMarket]);

  useEffect(() => {
    let cancelled = false;
    const loadStaleness = async () => {
      setStalenessLoading(true);
      setStalenessError('');
      const [staleRes, profilesRes] = await Promise.all([
        supabaseHelpers.getInventoryStaleness(currentMarket),
        supabase.from('profiles').select('company_id, store_name').limit(5000)
      ]);
      const { data, error } = staleRes;
      if (cancelled) return;
      if (error || profilesRes.error) {
        setStaleness([]);
        setStoreByCompany({});
        setStalenessError(error?.message || profilesRes.error?.message || 'Could not load inventory staleness.');
      } else {
        setStaleness(Array.isArray(data) ? data : []);
        const map = {};
        (profilesRes.data || []).forEach((p) => {
          if (!p?.company_id) return;
          const name = (p.store_name || '').trim();
          if (!name) return;
          if (!map[p.company_id]) map[p.company_id] = name;
        });
        setStoreByCompany(map);
      }
      setStalenessLoading(false);
    };
    loadStaleness();
    return () => { cancelled = true; };
  }, [currentMarket]);

  useEffect(() => {
    let cancelled = false;
    const loadGlobalStock = async () => {
      const { data, error } = await supabaseHelpers.getInventoryStaleness(null);
      if (cancelled) return;
      if (error) {
        setGlobalStockUnits(null);
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      const total = rows.reduce((sum, row) => sum + Number(row?.units_in_stock || 0), 0);
      setGlobalStockUnits(total);
    };
    loadGlobalStock();
    return () => { cancelled = true; };
  }, []);

  const handleApplyStorage = async (row) => {
    if (!row?.company_id) return;
    setStorageApplyId(row.company_id);
    try {
      const payload = {
        company_id: row.company_id,
        service: 'Storage fee (no inbound >10 days)',
        service_date: todayIso(),
        unit_price: 15,
        units: 1,
        total: 15,
        country: currentMarket,
        obs_admin: `Auto-storage applied: ${row.days_since_last_receiving ?? 'n/a'} days since last inbound` +
          (row.last_receiving_date ? ` (last receiving: ${row.last_receiving_date})` : '')
      };
      const { error } = await supabaseHelpers.createOtherLine(payload);
      if (error) throw error;
      alert('Storage fee added to Other services for this client.');
    } catch (e) {
      alert(e?.message || 'Failed to apply storage fee.');
    } finally {
      setStorageApplyId(null);
    }
  };

  const loadChart = async () => {
    if (!selectedCompany?.id) return;
    setLoadingChart(true);
    setChartError('');
    const end = todayIso();
    const start = shiftDays(chartRange - 1);
    const { data, error } = await supabaseHelpers.getClientAnalyticsSnapshot({
      companyId: selectedCompany.id === 'ALL' ? null : selectedCompany.id,
      userId: null,
      country: currentMarket,
      startDate: start,
      endDate: end
    });
    if (error) {
      setChartError(error.message || t('adminDashboard.errors.loadChart'));
      setChartSnapshot(null);
    } else {
      setChartSnapshot(data || null);
    }
    setLoadingChart(false);
  };

  useEffect(() => {
    loadChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, chartRange, currentMarket]);

  const loadMonthFinance = async () => {
    if (!selectedCompany?.id) return;
    const today = todayIso();
    const monthStart = `${today.slice(0, 8)}01`;
    const { data, error } = await supabaseHelpers.getClientAnalyticsSnapshot({
      companyId: selectedCompany.id === 'ALL' ? null : selectedCompany.id,
      userId: null,
      country: currentMarket,
      startDate: monthStart,
      endDate: today
    });
    if (error) {
      setMonthFinance(null);
      return;
    }
    const total =
      Number(data?.finance?.prepAmounts?.fba || 0) +
      Number(data?.finance?.prepAmounts?.fbm || 0) +
      Number(data?.finance?.prepAmounts?.other || 0);
    setMonthFinance({ total });
  };

  useEffect(() => {
    loadMonthFinance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id, currentMarket]);

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

  const todayOrders = snapshot?.prepared?.unitsToday ?? 0;
  const todayReceiving = snapshot?.receiving?.unitsToday ?? 0;

  const sumTotalPrepared = snapshot?.prepared?.unitsTotal ?? 0;
  const sumTotalReceiving = snapshot?.receiving?.unitsTotal ?? 0;

  const preparedDaily = chartSnapshot?.prepared?.dailyUnits || snapshot?.prepared?.dailyUnits || [];
  const receivingDaily = chartSnapshot?.receiving?.dailyUnits || snapshot?.receiving?.dailyUnits || [];
  const balanceDaily = chartSnapshot?.finance?.dailyAmounts || snapshot?.finance?.dailyAmounts || [];
  const inventoryUnits = snapshot?.inventory?.units ?? 0;
  const stalenessTotal = staleness.reduce((sum, row) => sum + Number(row?.units_in_stock || 0), 0);
  const inventoryUnitsAll = Number.isFinite(globalStockUnits)
    ? globalStockUnits
    : staleness.length
      ? stalenessTotal
      : (snapshot?.inventory?.unitsAll ?? snapshot?.inventory?.units ?? 0);
  const lastReceivingDate = snapshot?.receiving?.lastReceivingDate || null;

  const chartData = useMemo(() => {
    const map = new Map();
    preparedDaily.forEach((row) => {
      map.set(row.date, { date: row.date, orders: row.units || 0, receiving: 0, balance: 0 });
    });
    receivingDaily.forEach((row) => {
      const prev = map.get(row.date) || { date: row.date, orders: 0, receiving: 0, balance: 0 };
      prev.receiving = row.units || 0;
      map.set(row.date, prev);
    });
    balanceDaily.forEach((row) => {
      const prev = map.get(row.date) || { date: row.date, orders: 0, receiving: 0, balance: 0 };
      prev.balance = row.amount || 0;
      map.set(row.date, prev);
    });
    return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [preparedDaily, receivingDaily, balanceDaily]);

  const moneySelectedInterval =
    Number(snapshot?.finance?.prepAmounts?.fba || 0) +
    Number(snapshot?.finance?.prepAmounts?.fbm || 0) +
    Number(snapshot?.finance?.prepAmounts?.other || 0);
  const moneyMonthRunning = monthFinance?.total ?? 0;
  const isSingleDay = dateFrom === dateTo;
  const chartDays = chartRange;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-text-primary">
          <Package className="w-5 h-5" />
          <div>
            <div className="text-xs uppercase tracking-wide text-text-light">{t('adminDashboard.title')}</div>
            <h2 className="text-xl font-semibold">{t('adminDashboard.subtitle')}</h2>
            <div className="text-xs text-text-secondary">
              {selectedCompany?.id === 'ALL'
                ? t('adminDashboard.aggregateLabel')
                : tp('adminDashboard.companyLabel', { name: selectedCompany?.name || selectedCompany?.id || 'n/a' })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 border rounded-lg px-2 py-1 bg-white">
            <Search className="w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder={t('adminDashboard.searchPlaceholder')}
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
                  {c.name || t('adminDashboard.unknownCompany')}{c.id !== 'ALL' ? ` · ${c.id.slice(0, 6)}` : ''}
                </option>
              ))}
              {!filteredCompanies.length && <option value="">{t('adminDashboard.noCompaniesOption')}</option>}
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
            <button onClick={() => applyPreset(1)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">{t('adminDashboard.quick.today')}</button>
            <button onClick={() => applyPreset(7)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">{t('adminDashboard.quick.last7')}</button>
            <button onClick={() => applyPreset(30)} className="text-xs px-2 py-1 rounded hover:bg-gray-50">{t('adminDashboard.quick.last30')}</button>
          </div>
          <button
            onClick={loadSnapshot}
            disabled={loadingData}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm"
          >
            <RefreshCcw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
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
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">{t('adminDashboard.loadingCompanies')}</div>
      ) : !selectedCompany ? (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">{t('adminDashboard.noCompanies')}</div>
      ) : loadingData ? (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">{t('adminDashboard.loadingData')}</div>
      ) : !snapshot ? (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">{t('adminDashboard.noData')}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-4">
            <Card
              title={t('adminDashboard.balanceTitle')}
              value={`€${Number(moneySelectedInterval || 0).toFixed(2)}`}
              subtitle={tp('adminDashboard.balanceSubtitleInterval', { total: Number(moneyMonthRunning || 0).toFixed(2) })}
              accentClass="text-orange-700"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              title={t('adminDashboard.preparedTitle')}
              value={isSingleDay ? todayOrders : sumTotalPrepared}
              subtitle={
                isSingleDay
                  ? tp('adminDashboard.preparedSubtitleSingle', { total: sumTotalPrepared })
                  : tp('adminDashboard.preparedSubtitleInterval', { total: sumTotalPrepared })
              }
              accentClass="text-blue-700"
            />
            <Card
              title={t('adminDashboard.receptionsTitle')}
              value={isSingleDay ? todayReceiving : sumTotalReceiving}
              subtitle={
                isSingleDay
                  ? tp('adminDashboard.receptionsSubtitleSingle', { total: sumTotalReceiving })
                  : tp('adminDashboard.receptionsSubtitleInterval', { total: sumTotalReceiving })
              }
              accentClass="text-blue-700"
            />
            <Card
              title={t('adminDashboard.stockTitle')}
              value={inventoryUnitsAll}
              subtitle={t('adminDashboard.stockSubtitleAll')}
              accentClass="text-blue-700"
            />
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-text-primary">{t('adminDashboard.chartTitle')}</div>
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span>{tp('adminDashboard.chartRangeLabel', { days: chartDays })}</span>
                <select
                  className="border rounded px-2 py-1 text-xs"
                  value={chartRange}
                  onChange={(e) => setChartRange(Number(e.target.value))}
                >
                  <option value={1}>1</option>
                  <option value={7}>7</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={90}>90</option>
                </select>
              </div>
            </div>
            {chartError && <div className="text-sm text-red-600 mb-2">{chartError}</div>}
            {loadingChart ? (
              <div className="text-sm text-text-secondary">{t('adminDashboard.loadingChart')}</div>
            ) : chartData.length ? (
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
                                <span className="text-text-secondary">{p.name || p.dataKey}</span>
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
                      name={t('adminDashboard.chartPrepared')}
                    />
                    <Area
                      type="monotone"
                      dataKey="receiving"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                      name={t('adminDashboard.chartReceiving')}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                      name={t('adminDashboard.chartBalance')}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">{t('adminDashboard.noChartData')}</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-text-primary mb-2">{t('adminDashboard.statusOrdersTitle')}</div>
              <div className="divide-y">
                {Object.entries(snapshot.series.orders.statusCounts || {}).map(([status, value]) => (
                  <div key={status} className="flex items-center justify-between py-2 text-sm">
                    <span className="capitalize text-text-secondary">{status}</span>
                    <span className="font-semibold text-text-primary">{value}</span>
                  </div>
                ))}
                {!Object.keys(snapshot.series.orders.statusCounts || {}).length && (
                  <div className="text-sm text-text-secondary py-2">{t('adminDashboard.noOrdersStatus')}</div>
                )}
              </div>
            </div>
            <div className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-text-primary mb-2">{t('adminDashboard.statusShipmentsTitle')}</div>
              <div className="divide-y">
                {Object.entries(snapshot.series.shipments.statusCounts || {}).map(([status, value]) => (
                  <div key={status} className="flex items-center justify-between py-2 text-sm">
                    <span className="capitalize text-text-secondary">{status}</span>
                    <span className="font-semibold text-text-primary">{value}</span>
                  </div>
                ))}
                {!Object.keys(snapshot.series.shipments.statusCounts || {}).length && (
                  <div className="text-sm text-text-secondary py-2">{t('adminDashboard.noShipmentsStatus')}</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-text-primary">Storage auto-billing (all clients)</div>
              {stalenessLoading && <div className="text-xs text-text-secondary">Loading…</div>}
            </div>
            {stalenessError && <div className="text-sm text-red-600 mb-2">{stalenessError}</div>}
            {!stalenessLoading && !staleness.length && !stalenessError && (
              <div className="text-sm text-text-secondary">No clients with stock found.</div>
            )}
            {staleness.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-text-secondary border-b">
                      <th className="text-left py-2 pr-4">Store / Company</th>
                      <th className="text-left py-2 pr-4">Units in stock</th>
                      <th className="text-left py-2 pr-4">Last receiving</th>
                      <th className="text-left py-2 pr-4">Days since</th>
                      <th className="text-left py-2 pr-4">Charge (€)</th>
                      <th className="text-left py-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staleness
                      .slice()
                      .sort((a, b) => (b.days_since_last_receiving || 0) - (a.days_since_last_receiving || 0))
                      .map((row, idx) => {
                        const days = row.days_since_last_receiving ?? null;
                        const highlight = typeof days === 'number' && days >= 10;
                        return (
                          <tr key={`${row.company_id || idx}`} className={`border-b last:border-b-0 ${highlight ? 'bg-red-50' : ''}`}>
                            <td className="py-2 pr-4 text-text-primary">
                              <div className="font-semibold">
                                {storeByCompany[row.company_id] || row.company_name || row.company_id || 'Client'}
                              </div>
                              <div className="text-xs text-text-secondary">{row.company_id || ''}</div>
                            </td>
                            <td className="py-2 pr-4 font-semibold text-text-primary">{row.units_in_stock ?? 0}</td>
                            <td className="py-2 pr-4 text-text-secondary">
                              {row.last_receiving_date ? formatDisplayDate(row.last_receiving_date) : '—'}
                            </td>
                            <td className={`py-2 pr-4 font-semibold ${highlight ? 'text-red-700' : 'text-text-primary'}`}>
                              {days != null ? days : '—'}
                            </td>
                            <td className="py-2 pr-4 font-semibold text-orange-700">€15.00</td>
                            <td className="py-2 pr-4">
                              <button
                                className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                                disabled={storageApplyId === row.company_id}
                                onClick={() => handleApplyStorage(row)}
                              >
                                {storageApplyId === row.company_id ? 'Applying…' : 'Apply storage'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <div className="text-xs text-text-secondary mt-2">
                  Rule: highlight in red if no inbound for 10+ days and stock &gt; 1 unit. Use the button to apply the €15 storage fee manually.
                </div>
              </div>
            )}
          </div>

        </>
      )}
    </div>
  );
}
