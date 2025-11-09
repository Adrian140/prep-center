// FILE: src/components/dashboard/client/SupabaseClientActivity.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";
import { supabaseHelpers } from "../../../config/supabase";
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
import { useDashboardTranslation } from "../../../translations";

function Box({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
      <h3 className="text-base font-semibold text-text-primary mb-3">{title}</h3>
      {children}
    </div>
  );
}

const fmt2 = (n) => (typeof n === "number" && isFinite(n) ? Number(n).toFixed(2) : "—");
// ✅ necesar pentru filtrarea datelor din grafic
const toDate = (d) => new Date(d + "T00:00:00");

const fmtMoney = (n, currency = 'EUR', locale = 'fr-FR') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(n || 0));
const fmtMoneyHT = (n, currency = 'EUR') => `${fmtMoney(n, currency)} HT`;

const currentMonthStr = () => {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
};

const deriveMonth = (serviceDate) => {
  if (typeof serviceDate === 'string' && serviceDate.length >= 7) {
    return serviceDate.slice(0, 7);
  }
  return currentMonthStr();
};

const filterRowsByMonth = (rows, month) => {
  if (!month) return rows;
  const prefix = `${month}-`;
  return rows.filter((r) => (r?.service_date || '').startsWith(prefix));
};

const calcReportTotals = (rows, qtyField) =>
  rows.reduce(
    (acc, row) => {
      const rawQty = Number(row?.[qtyField] || 0);
      const qty = Number.isFinite(rawQty) ? rawQty : 0;
      acc.qty += qty;
      const total =
        row?.total != null
          ? Number(row.total)
          : Number(row.unit_price || 0) * qty;
      if (Number.isFinite(total)) acc.total += total;
      return acc;
    },
    { qty: 0, total: 0 }
  );

const formatOtherServiceName = (service, t) => {
  if (!service) return '—';
  const value = service.trim();
  const manualLabel = t('ClientOtherReport.serviceNames.manualPhoto');
  const subscriptionLabel = t('ClientOtherReport.serviceNames.photoSubscription');
  if (/^manual photo capture/i.test(value)) return manualLabel;
  if (/^photo storage subscription$/i.test(value)) return subscriptionLabel;
  return value.replace(/ \(6 images\)/i, '');
};

export default function SupabaseClientActivity() {
  const { t } = useDashboardTranslation();
  const { profile } = useSupabaseAuth();
  const companyId = profile?.company_id;

  const [fba, setFba] = useState([]);
  const [fbm, setFbm] = useState([]);
  const [other, setOther] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("3m");
  const [activeReport, setActiveReport] = useState('fba');
  const [fbaMonth, setFbaMonth] = useState('');
  const [fbmMonth, setFbmMonth] = useState('');
  const [otherMonth, setOtherMonth] = useState('');
  const [baseMonths, setBaseMonths] = useState({
    fba: currentMonthStr(),
    fbm: currentMonthStr(),
    other: currentMonthStr()
  });
  const [monthsInitialized, setMonthsInitialized] = useState(false);

  const load = async () => {
    if (!companyId) {
      setFba([]);
      setFbm([]);
      setOther([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: fbaData }, { data: fbmData }, { data: otherData }] = await Promise.all([
      supabaseHelpers.listFbaLinesByCompany(companyId),
      supabaseHelpers.listFbmLinesByCompany(companyId),
      supabaseHelpers.listOtherLinesByCompany(companyId)
    ]);
    const safeFba = fbaData || [];
    const safeFbm = fbmData || [];
    const safeOther = otherData || [];
    setFba(safeFba);
    setFbm(safeFbm);
    setOther(safeOther);

    const nextBase = {
      fba: deriveMonth(safeFba[0]?.service_date),
      fbm: deriveMonth(safeFbm[0]?.service_date),
      other: deriveMonth(safeOther[0]?.service_date)
    };
    setBaseMonths(nextBase);

    if (!monthsInitialized) {
      setFbaMonth(nextBase.fba);
      setFbmMonth(nextBase.fbm);
      setOtherMonth(nextBase.other);
      setMonthsInitialized(true);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [companyId]);

  useEffect(() => {
    setMonthsInitialized(false);
  }, [companyId]);

  const effectiveFbaMonth = fbaMonth || baseMonths.fba;
  const effectiveFbmMonth = fbmMonth || baseMonths.fbm;
  const effectiveOtherMonth = otherMonth || baseMonths.other;

  const fbaMonthRows = useMemo(
    () => filterRowsByMonth(fba, effectiveFbaMonth),
    [fba, effectiveFbaMonth]
  );
  const fbmMonthRows = useMemo(
    () => filterRowsByMonth(fbm, effectiveFbmMonth),
    [fbm, effectiveFbmMonth]
  );
  const otherMonthRows = useMemo(
    () => filterRowsByMonth(other, effectiveOtherMonth),
    [other, effectiveOtherMonth]
  );

  const fbaMonthTotals = useMemo(() => calcReportTotals(fbaMonthRows, 'units'), [fbaMonthRows]);
  const fbmMonthTotals = useMemo(
    () => calcReportTotals(fbmMonthRows, 'orders_units'),
    [fbmMonthRows]
  );
  const otherMonthTotals = useMemo(
    () => calcReportTotals(otherMonthRows, 'units'),
    [otherMonthRows]
  );

  const chartData = useMemo(() => {
    const map = {};
    for (const r of fba) {
      const d = r.service_date;
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.units || 0);
      if (!map[d]) map[d] = { date: d, fba: 0, fbm: 0, other: 0, fbaUnits: 0, fbmUnits: 0, otherUnits: 0 };
      map[d].fba += isFinite(total) ? total : 0;
      map[d].fbaUnits += Number(r.units || 0);
    }
    for (const r of fbm) {
      const d = r.service_date;
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.orders_units || 0);
      if (!map[d]) map[d] = { date: d, fba: 0, fbm: 0, other: 0, fbaUnits: 0, fbmUnits: 0, otherUnits: 0 };
      map[d].fbm += isFinite(total) ? total : 0;
      map[d].fbmUnits += Number(r.orders_units || 0);
    }
    for (const r of other) {
      const d = r.service_date;
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.units || 0);
      if (!map[d]) map[d] = { date: d, fba: 0, fbm: 0, other: 0, fbaUnits: 0, fbmUnits: 0, otherUnits: 0 };
      map[d].other += isFinite(total) ? total : 0;
      map[d].otherUnits += Number(r.units || 0);
    }
    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [fba, fbm, other]);

  useEffect(() => {
    if (!chartData.length) return;
    const first = toDate(chartData[0].date);
    const last = toDate(chartData[chartData.length - 1].date);
    const diffDays = Math.max(1, Math.round((last - first) / (1000 * 60 * 60 * 24)));
    setRange(diffDays >= 90 ? "3m" : "all");
  }, [chartData.length]);

  const filteredChartData = useMemo(() => {
    if (!chartData.length) return chartData;
    if (range === "all") return chartData;

    const last = toDate(chartData[chartData.length - 1].date);
    const days = range === "1m" ? 30 : 90;
    const from = new Date(last);
    from.setDate(from.getDate() - (days - 1));

    return chartData.filter((d) => toDate(d.date) >= from);
  }, [chartData, range]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload || {};
    return (
      <div className="bg-white/95 border border-gray-200 rounded-md px-3 py-2 text-sm shadow">
        <div className="font-medium mb-1">{t('SupabaseClientActivity.tooltip.date')}: {label}</div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#ec4899" }} />
            <span>FBA:</span>
            <strong>{fmtMoneyHT(point.fba)}</strong>
            <span className="text-gray-500">({point.fbaUnits || 0} {t('SupabaseClientActivity.thead.units').toLowerCase()})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} />
            <span>FBM:</span>
            <strong>{fmtMoneyHT(point.fbm)}</strong>
            <span className="text-gray-500">({point.fbmUnits || 0} {t('SupabaseClientActivity.thead.units').toLowerCase()})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
            <span>{t('SupabaseClientActivity.otherTitle')}:</span>
            <strong>{fmtMoneyHT(point.other)}</strong>
            <span className="text-gray-500">({point.otherUnits || 0} {t('SupabaseClientActivity.thead.units').toLowerCase()})</span>
          </div>
        </div>
      </div>
    );
  };

  if (!companyId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4">
        {t('SupabaseClientActivity.companyMissing')}
      </div>
    );
  }

  const reportTabs = useMemo(() => ([
    { id: 'fba', label: t('SupabaseClientActivity.fbaTitle') || 'FBA' },
    { id: 'fbm', label: t('SupabaseClientActivity.fbmTitle') || 'FBM' },
    { id: 'other', label: t('SupabaseClientActivity.otherTitle') || 'Other' }
  ]), [t]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isFbaView = activeReport === 'fba';
  const isFbmView = activeReport === 'fbm';
  const activeRows = isFbaView ? fbaMonthRows : isFbmView ? fbmMonthRows : otherMonthRows;
  const activeTotals = isFbaView
    ? fbaMonthTotals
    : isFbmView
      ? fbmMonthTotals
      : otherMonthTotals;
  const activeMonth = isFbaView ? fbaMonth : isFbmView ? fbmMonth : otherMonth;
  const setActiveMonth = isFbaView ? setFbaMonth : isFbmView ? setFbmMonth : setOtherMonth;
  const reportTitle = isFbaView
    ? t('ClientFBAReport.title')
    : isFbmView
      ? t('ClientFBMReport.title')
      : t('ClientOtherReport.title');
  const reportSubtitle = isFbaView
    ? t('ClientFBAReport.readonly')
    : isFbmView
      ? t('ClientFBMReport.readonly')
      : t('ClientOtherReport.readonly');
  const monthLabel = isFbaView
    ? t('ClientFBAReport.monthLabel')
    : isFbmView
      ? t('ClientFBMReport.monthLabel')
      : t('ClientOtherReport.monthLabel');
  const currentMonthLabel = isFbaView
    ? t('ClientFBAReport.currentMonth')
    : isFbmView
      ? t('ClientFBMReport.currentMonth')
      : t('ClientOtherReport.currentMonth');
  const qtyHeading = isFbmView
    ? t('SupabaseClientActivity.thead.ordersUnits')
    : t('SupabaseClientActivity.thead.units');
  const emptyState = isFbaView
    ? t('ClientFBAReport.noDataMonth')
    : isFbmView
      ? t('ClientFBMReport.noDataMonth')
      : t('ClientOtherReport.noDataMonth');

  const resetActiveMonth = () => {
    setActiveMonth(isFbaView ? baseMonths.fba : isFbmView ? baseMonths.fbm : baseMonths.other);
  };

  return (
  <div className="space-y-6">
      <Box title={t('SupabaseClientActivity.chartTitle')}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[
            { k: "1m", label: t('SupabaseClientActivity.range.m1') },
            { k: "3m", label: t('SupabaseClientActivity.range.m3') },
            { k: "all", label: t('SupabaseClientActivity.range.all') },
          ].map((opt) => (
            <button
              key={opt.k}
              onClick={() => setRange(opt.k)}
              className={`px-3 py-1 rounded-lg border text-sm ${
                range === opt.k
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-text-primary border-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={filteredChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const d = new Date(value);
                if (Number.isNaN(d.getTime())) return value;
                return d.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric'
                });
              }}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="fba"
              stroke="#ec4899"
              strokeWidth={2}
              dot={false}
              name={t('SupabaseClientActivity.fbaTitle')}
            />
            <Line
              type="monotone"
              dataKey="fbm"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name={t('SupabaseClientActivity.fbmTitle')}
            />
            <Line
              type="monotone"
              dataKey="other"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              name={t('SupabaseClientActivity.otherTitle')}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3 mb-4">
          <div className="flex items-center gap-2">
            {reportTabs.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setActiveReport(opt.id)}
                className={`px-4 py-1.5 rounded-lg text-sm border transition-colors ${
                  activeReport === opt.id
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <label>{monthLabel}</label>
            <input
              type="month"
              value={activeMonth || (isFbaView ? baseMonths.fba : isFbmView ? baseMonths.fbm : baseMonths.other)}
              onChange={(e) => setActiveMonth(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
            <button
              className="text-sm border rounded px-2 py-1"
              onClick={resetActiveMonth}
            >
              {currentMonthLabel}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-semibold text-text-primary">{reportTitle}</h2>
          <p className="text-sm text-text-secondary">{reportSubtitle}</p>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">{t('SupabaseClientActivity.thead.date')}</th>
                <th className="px-3 py-2 text-left">{t('SupabaseClientActivity.thead.service')}</th>
                <th className="px-3 py-2 text-right">{t('SupabaseClientActivity.thead.unitPrice')} (HT)</th>
                <th className="px-3 py-2 text-right">{qtyHeading}</th>
                <th className="px-3 py-2 text-right">{t('SupabaseClientActivity.thead.total')} (HT)</th>
                <th className="px-3 py-2 text-left">{t('SupabaseClientActivity.thead.adminNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-text-secondary">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : activeRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-text-secondary">
                    {emptyState}
                  </td>
                </tr>
              ) : (
                activeRows.map((r) => {
                  const qty = Number(
                    isFbaView ? r.units || 0 : isFbmView ? r.orders_units || 0 : r.units || 0
                  );
                  const lineTotal =
                    r.total != null
                      ? Number(r.total)
                      : Number(r.unit_price || 0) * (Number.isFinite(qty) ? qty : 0);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.service_date}</td>
                      <td className="px-3 py-2">{formatOtherServiceName(r.service, t)}</td>
                      <td className="px-3 py-2 text-right">
                        {r.unit_price != null ? fmt2(Number(r.unit_price)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number.isFinite(qty) ? qty : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {Number.isFinite(lineTotal) ? fmt2(lineTotal) : '—'}
                      </td>
                      <td className="px-3 py-2">{r.obs_admin || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/80 font-semibold text-text-primary">
                <td className="px-3 py-2" colSpan={3}>
                  {t('SupabaseClientActivity.totals')}
                </td>
                <td className="px-3 py-2 text-right">{activeTotals.qty}</td>
                <td className="px-3 py-2 text-right">{fmt2(activeTotals.total)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 text-sm text-text-secondary">
          Monthly totals — {qtyHeading}: <strong>{activeTotals.qty}</strong> · Total:{' '}
          <strong>{fmt2(activeTotals.total)} €</strong>
        </div>
      </div>

    </div>
  );
}
