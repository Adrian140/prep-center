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

const SectionTitle = ({ title }) => (
  <div className="flex items-center justify-between">
    <div className="text-base font-semibold text-text-primary">{title}</div>
    <div className="h-px flex-1 ml-4 bg-gray-100" />
  </div>
);

const MetricCard = ({ title, value, subtitle, badge, compact = false }) => (
  <div className={`bg-white border rounded-xl shadow-sm h-full ${compact ? 'p-3' : 'p-4'}`}>
    <div className="flex items-center justify-between text-sm text-text-secondary mb-2">
      <span>{title}</span>
      {badge != null && <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs">{badge}</span>}
    </div>
    <div className={`${compact ? 'text-xl' : 'text-2xl'} font-semibold text-text-primary`}>{value}</div>
    {subtitle && <div className="text-xs text-text-secondary mt-1">{subtitle}</div>}
  </div>
);

const DualStatCard = ({ title, leftLabel, leftValue, rightLabel, rightValue }) => (
  <div className="bg-white border rounded-xl p-3 shadow-sm h-full">
    <div className="text-sm text-text-secondary mb-3">{title}</div>
    <div className="grid grid-cols-2 gap-6">
      <div>
        <div className="text-xl font-semibold text-text-primary">{leftValue}</div>
        <div className="text-xs text-text-secondary mt-1">{leftLabel}</div>
      </div>
      <div>
        <div className="text-xl font-semibold text-text-primary">{rightValue}</div>
        <div className="text-xs text-text-secondary mt-1">{rightLabel}</div>
      </div>
    </div>
  </div>
);

const ProgressRing = ({ percent = 0, label }) => {
  const size = 72;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#6366f1"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy="0.35em"
          className="fill-indigo-600 text-sm font-semibold"
        >
          {`${Math.round(percent)}%`}
        </text>
      </svg>
      <div className="text-xs text-text-secondary">{label}</div>
    </div>
  );
};

export default function AdminCompanyDashboard() {
  const { t, tp } = useAdminTranslation();
  const { currentMarket } = useMarket();
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companiesError, setCompaniesError] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [search, setSearch] = useState('');

  const [dateFrom, setDateFrom] = useState(() => shiftDays(29));
  const [dateTo, setDateTo] = useState(() => todayIso());

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [chartRange, setChartRange] = useState(30);
  const [chartSnapshot, setChartSnapshot] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState('');
  const [monthFinance, setMonthFinance] = useState(null);
  const [monthReceivingTotal, setMonthReceivingTotal] = useState(null);
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
      const { data, error } = await supabaseHelpers.getInventoryStaleness(currentMarket);
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
  }, [currentMarket]);

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

  useEffect(() => {
    let cancelled = false;
    const loadMonthReceiving = async () => {
      if (!selectedCompany?.id) return;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStart = start.toISOString().slice(0, 10);
      const today = todayIso();
      const { data, error } = await supabaseHelpers.getClientAnalyticsSnapshot({
        companyId: selectedCompany.id === 'ALL' ? null : selectedCompany.id,
        userId: null,
        country: currentMarket,
        startDate: monthStart,
        endDate: today
      });
      if (cancelled) return;
      if (error) {
        setMonthReceivingTotal(null);
      } else {
        setMonthReceivingTotal(Number(data?.receiving?.unitsTotal || 0));
      }
    };
    loadMonthReceiving();
    return () => { cancelled = true; };
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

  const todayOrders = snapshot?.shipped?.unitsToday ?? 0;
  const todayReceiving = snapshot?.receiving?.unitsToday ?? 0;
  const todayReceivingShipments =
    snapshot?.receiving?.shipmentsToday ??
    snapshot?.receiving?.countToday ??
    snapshot?.receiving?.ordersToday ??
    0;

  const sumTotalPrepared = snapshot?.shipped?.unitsTotal ?? 0;
  const sumTotalReceiving = snapshot?.receiving?.unitsTotal ?? 0;

  const preparedDaily = chartSnapshot?.shipped?.dailyUnits || snapshot?.shipped?.dailyUnits || [];
  const receivingDaily = chartSnapshot?.receiving?.dailyUnits || snapshot?.receiving?.dailyUnits || [];
  const receivingShipmentsDaily =
    chartSnapshot?.series?.shipments?.daily ||
    snapshot?.series?.shipments?.daily ||
    [];
  const balanceDaily = chartSnapshot?.finance?.dailyAmounts || snapshot?.finance?.dailyAmounts || [];
  const inventoryUnits = snapshot?.inventory?.units ?? 0;
  const isAllCompanies = selectedCompany?.id === 'ALL';
  const inventoryUnitsAll = isAllCompanies
    ? (snapshot?.inventory?.unitsAll ?? snapshot?.inventory?.units ?? 0)
    : inventoryUnits;
  const inventoryAvailable = snapshot?.fbaStock?.inStock ?? 0;
  const inventoryInbound = snapshot?.fbaStock?.inbound ?? 0;
  const inventoryAllocated = snapshot?.fbaStock?.reserved ?? 0;
  const inventoryUnavailable = snapshot?.fbaStock?.unfulfillable ?? 0;
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

  const inRange = (date) => {
    if (!dateFrom || !dateTo) return true;
    return date >= dateFrom && date <= dateTo;
  };

  const inboundRange = receivingDaily
    .filter((row) => inRange(row.date))
    .map((row) => ({ date: row.date, value: row.units || 0 }));
  const inboundShipmentsRange = receivingShipmentsDaily
    .filter((row) => inRange(row.date))
    .reduce((sum, row) => sum + Number(row.total || 0), 0);
  const inboundShipmentsToday = receivingShipmentsDaily
    .filter((row) => row.date === dateFrom)
    .reduce((sum, row) => sum + Number(row.total || 0), 0);
  const shippedRange = preparedDaily
    .filter((row) => inRange(row.date))
    .map((row) => ({ date: row.date, value: row.units || 0 }));

  const inboundTotalRange = inboundRange.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const shippedTotalRange = shippedRange.reduce((sum, row) => sum + Number(row.value || 0), 0);

  const inboundTodayUnits = todayReceiving;
  const inboundTodayShipments = inboundShipmentsToday || todayReceivingShipments;
  const inboundPercentUnits = inboundTotalRange
    ? (isSingleDay ? 100 : (inboundTodayUnits / inboundTotalRange) * 100)
    : 0;
  const inboundPercentShipments = inboundTotalRange
    ? (isSingleDay ? 100 : (inboundTodayShipments / inboundTotalRange) * 100)
    : 0;
  const rangeDays = (() => {
    try {
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
      return Math.max(1, diff + 1);
    } catch {
      return 1;
    }
  })();

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
            <div className="text-xs uppercase tracking-wide text-text-light">Dashboard</div>
            <h2 className="text-xl font-semibold">Inbound</h2>
            <div className="text-xs text-text-secondary">
              {selectedCompany?.id === 'ALL'
                ? t('adminDashboard.aggregateLabel')
                : tp('adminDashboard.companyLabel', { name: selectedCompany?.name || selectedCompany?.id || 'n/a' })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 border rounded-lg px-2 py-1 bg-white">
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
            <Search className="w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder={t('adminDashboard.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm outline-none w-48"
            />
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
          <SectionTitle title="Billing" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
            <MetricCard
              title="Uninvoiced Charges"
              value={`€${Number(moneySelectedInterval || 0).toFixed(2)}`}
            />
            <MetricCard
              title="Unpaid, Invoiced Charges"
              value={`€${Number(moneyMonthRunning || 0).toFixed(2)}`}
            />
            <MetricCard
              title="Balance"
              value={`€${Number(moneySelectedInterval || 0).toFixed(2)}`}
            />
          </div>

          <SectionTitle title="Inbound" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <DualStatCard
              title={isSingleDay ? 'Arriving Today' : `Arriving Last ${rangeDays} Days`}
              leftLabel="Shipments"
              leftValue={isSingleDay ? inboundTodayShipments : inboundShipmentsRange}
              rightLabel="Units"
              rightValue={isSingleDay ? inboundTodayUnits : inboundTotalRange}
            />
            <div className="bg-white border rounded-xl p-3 shadow-sm">
              <div className="text-sm text-text-secondary mb-3">
                {isSingleDay ? 'Received Today' : `Received Last ${rangeDays} Days`}
              </div>
              <div className="flex items-center gap-6">
                <ProgressRing percent={inboundPercentUnits} label="Units" />
                <ProgressRing percent={inboundPercentShipments} label="Shipments" />
              </div>
            </div>
            <div className="bg-white border rounded-xl p-3 shadow-sm">
              <div className="flex items-center justify-between text-sm text-text-secondary mb-2">
                <span>Units Received (Selected Range)</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs">{inboundTotalRange}</span>
              </div>
              <div className="w-full h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={inboundRange} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDisplayDate(v)} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <SectionTitle title="Amazon" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <MetricCard
              title={isSingleDay ? 'Shipped Today' : `Shipped Last ${rangeDays} Days`}
              value={isSingleDay ? todayOrders : shippedTotalRange}
              compact
            />
            <MetricCard
              title="In Progress"
              value={snapshot?.series?.orders?.statusCounts?.in_progress ?? 0}
              compact
            />
            <div className="bg-white border rounded-xl p-3 shadow-sm">
              <div className="flex items-center justify-between text-sm text-text-secondary mb-2">
                <span>Units Shipped (Selected Range)</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs">{shippedTotalRange}</span>
              </div>
              <div className="w-full h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={shippedRange} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDisplayDate(v)} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <SectionTitle title="Inventory" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-stretch">
            <MetricCard title="Quantity In Stock" value={inventoryUnitsAll} compact />
            <MetricCard title="Available Quantity" value={inventoryAvailable} compact />
            <MetricCard title="Inbound Quantity" value={inventoryInbound} compact />
            <MetricCard title="Allocated Quantity" value={inventoryAllocated} compact />
            <MetricCard title="Unavailable Quantity" value={inventoryUnavailable} compact />
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
