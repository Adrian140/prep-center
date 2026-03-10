// FILE: src/components/dashboard/client/SupabaseClientActivity.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";
import { supabase } from "../../../config/supabase";
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
import { useMarket } from '@/contexts/MarketContext';

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

const splitObs = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { id: '', note: '' };
  const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
  const id = parts[0] || '';
  const note = parts.slice(1).join(' | ') || '';
  return { id, note };
};

const formatInvoiceTooltip = (invoice) => {
  if (!invoice) return null;
  const formattedDate = invoice.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString('ro-RO')
    : null;
  return `Factură #${invoice.invoice_number}${formattedDate ? ` · ${formattedDate}` : ''}`;
};

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

const sortByServiceDateDesc = (rows = []) => {
  const toDate = (val) => {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return [...rows].sort((a, b) => {
    const da = toDate(a?.service_date) || toDate(a?.created_at) || new Date(0);
    const db = toDate(b?.service_date) || toDate(b?.created_at) || new Date(0);
    return db - da || 0;
  });
};

const filterRowsByMonth = (rows, month) => {
  if (!month) return rows;
  const prefix = `${month}-`;
  return sortByServiceDateDesc(rows.filter((r) => (r?.service_date || '').startsWith(prefix)));
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
  const returnFeeLabel = t('ClientOtherReport.serviceNames.returnFee') || 'Return fee';
  const transportLabel = t('ClientOtherReport.serviceNames.transport') || 'Transport';
  const kmDropoffLabel = t('ClientOtherReport.serviceNames.kmDropoff') || 'Km până la punctul de predare';
  if (/^manual photo capture/i.test(value)) return manualLabel;
  if (/^photo storage subscription$/i.test(value)) return subscriptionLabel;
  if (/^return fee$/i.test(value) || /^retur fee$/i.test(value)) return returnFeeLabel;
  if (/^transport$/i.test(value)) return transportLabel;
  if (/^km până la punctul de predare$/i.test(value)) return kmDropoffLabel;
  return value.replace(/ \(6 images\)/i, '');
};

const localizeReturnPrefix = (value, t) => {
  if (!value) return value;
  const prefix = t('SupabaseClientActivity.group.returnPrefix') || 'Retur';
  return String(value).replace(/^retur\b/i, prefix);
};

const normalizeShipmentToken = (value) => String(value || '').trim().toUpperCase();
const isFbaShipmentId = (value) => /^FBA[0-9A-Z]+$/i.test(normalizeShipmentToken(value));
const pickFbaShipmentId = (...values) => {
  for (const value of values) {
    const normalized = normalizeShipmentToken(value);
    if (normalized && isFbaShipmentId(normalized)) return normalized;
  }
  return null;
};
const extractPrimaryObsId = (obsAdmin) => splitObs(obsAdmin).id || '';
const extractFbaFromStep2Shipments = (step2Shipments) => {
  if (!Array.isArray(step2Shipments)) return null;
  for (const shipment of step2Shipments) {
    const picked = pickFbaShipmentId(
      shipment?.amazonShipmentId,
      shipment?.amazon_shipment_id,
      shipment?.shipmentId,
      shipment?.shipment_id
    );
    if (picked) return picked;
  }
  return null;
};

const normalizeServiceName = (service) => String(service || '').trim().toLowerCase();

const isHeavyParcelServiceRow = (row) => {
  const serviceNorm = normalizeServiceName(row?.service);
  if (
    serviceNorm === 'heavy parcel' ||
    serviceNorm === 'heavy parcel pack of 5' ||
    serviceNorm === 'heavy package' ||
    serviceNorm === 'heavy package label' ||
    serviceNorm === 'heavy package labels'
  ) {
    return true;
  }
  const isLegacyExtraLabels = serviceNorm === 'extra labels';
  if (!isLegacyExtraLabels) return false;
  const unitPrice = Number(row?.unit_price);
  return Number.isFinite(unitPrice) && Math.abs(unitPrice - 0.2) < 0.0001;
};

const formatFbaServiceName = (row, t) => {
  if (isHeavyParcelServiceRow(row)) {
    return t('SupabaseClientActivity.heavyParcelService');
  }
  return formatOtherServiceName(row?.service, t);
};

export default function SupabaseClientActivity({ onOpenFbaShipmentDetails } = {}) {
  const { t, tp } = useDashboardTranslation();
  const { profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const companyId = profile?.company_id;

  const [fba, setFba] = useState([]);
  const [fbm, setFbm] = useState([]);
  const [other, setOther] = useState([]);
  const [returnsLines, setReturnsLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("3m");
  const [activeReport, setActiveReport] = useState('fba');
  const [fbaMonth, setFbaMonth] = useState('');
  const [fbmMonth, setFbmMonth] = useState('');
  const [otherMonth, setOtherMonth] = useState('');
  const todayMonth = useMemo(() => currentMonthStr(), []);
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
    const [
      { data: fbaData },
      { data: fbmData },
      { data: otherData },
      { data: returnsData },
      { data: returnsStatusData }
    ] = await Promise.all([
      supabaseHelpers.listFbaLinesByCompany(companyId, currentMarket),
      supabaseHelpers.listFbmLinesByCompany(companyId, currentMarket),
      supabaseHelpers.listOtherLinesByCompany(companyId, currentMarket),
      supabaseHelpers.listReturnServiceLinesByCompany(companyId, currentMarket),
      supabase
        .from('returns')
        .select('id, status')
        .eq('company_id', companyId)
    ]);
    const safeFba = sortByServiceDateDesc(fbaData || []);
    const safeFbm = sortByServiceDateDesc(fbmData || []);
    const safeOther = sortByServiceDateDesc(otherData || []);
    const prepRequestIdsForFba = Array.from(new Set((safeFba || []).map((row) => row?.prep_request_id).filter(Boolean)));
    const legacyObsShipmentIds = Array.from(
      new Set(
        (safeFba || [])
          .map((row) => normalizeShipmentToken(extractPrimaryObsId(row?.obs_admin)))
          .filter(Boolean)
      )
    );
    const prepRequestFbaIdById = new Map();
    const prepRequestFbaIdByLegacyId = new Map();
    const toEffectiveFbaId = (prepRow) => {
      const fromDirect = pickFbaShipmentId(prepRow?.fba_shipment_id);
      const fromStep2 = extractFbaFromStep2Shipments(prepRow?.step2_shipments);
      const fromSnapshot = pickFbaShipmentId(prepRow?.amazon_snapshot?.shipment_id);
      return fromDirect || fromStep2 || fromSnapshot || null;
    };
    if (prepRequestIdsForFba.length) {
      const { data: prepRequestRows } = await supabase
        .from('prep_requests')
        .select('id, fba_shipment_id, step2_shipments, amazon_snapshot')
        .in('id', prepRequestIdsForFba);
      (Array.isArray(prepRequestRows) ? prepRequestRows : []).forEach((row) => {
        const effectiveFbaId = toEffectiveFbaId(row);
        if (effectiveFbaId) {
          prepRequestFbaIdById.set(row.id, effectiveFbaId);
        }
      });
    }
    if (legacyObsShipmentIds.length) {
      const { data: legacyPrepRows } = await supabase
        .from('prep_requests')
        .select('id, fba_shipment_id, step2_shipments, amazon_snapshot')
        .in('fba_shipment_id', legacyObsShipmentIds);
      (Array.isArray(legacyPrepRows) ? legacyPrepRows : []).forEach((row) => {
        const legacyId = normalizeShipmentToken(row?.fba_shipment_id);
        const effectiveFbaId = toEffectiveFbaId(row);
        if (legacyId && effectiveFbaId) {
          prepRequestFbaIdByLegacyId.set(legacyId, effectiveFbaId);
        }
      });
    }
    const safeFbaResolved = safeFba.map((row) => ({
      ...row,
      _resolved_fba_shipment_id:
        prepRequestFbaIdById.get(row?.prep_request_id) ||
        prepRequestFbaIdByLegacyId.get(normalizeShipmentToken(extractPrimaryObsId(row?.obs_admin))) ||
        null
    }));
    const doneReturnIds = new Set(
      (Array.isArray(returnsStatusData) ? returnsStatusData : [])
        .filter((ret) => String(ret?.status || '').toLowerCase() === 'done')
        .map((ret) => Number(ret.id))
    );
    const safeReturns = sortByServiceDateDesc(
      (returnsData || []).filter((line) => doneReturnIds.has(Number(line.return_id)))
    );
    setFba(safeFbaResolved);
    setFbm(safeFbm);
    setOther(safeOther);
    setReturnsLines(safeReturns);

    const nextBase = {
      fba: deriveMonth(safeFba[0]?.service_date),
      fbm: deriveMonth(safeFbm[0]?.service_date),
      other: deriveMonth(safeOther[0]?.service_date)
    };
    setBaseMonths(nextBase);

    if (!monthsInitialized) {
      const latestAvailable =
        nextBase.fba || nextBase.fbm || nextBase.other || todayMonth;
      setFbaMonth(latestAvailable);
      setFbmMonth(latestAvailable);
      setOtherMonth(latestAvailable);
      setMonthsInitialized(true);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [companyId, currentMarket]);

  useEffect(() => {
    setMonthsInitialized(false);
  }, [companyId, currentMarket]);

  const effectiveFbaMonth = fbaMonth || baseMonths.fba;
  const effectiveFbmMonth = fbmMonth || baseMonths.fbm;
  const effectiveOtherMonth = otherMonth || baseMonths.other;

  const changeMonth = (setter, delta) => {
    setter((prev) => {
      const base = prev || todayMonth;
      const d = new Date(`${base}-01T00:00:00`);
      if (Number.isNaN(d.getTime())) return todayMonth;
      d.setMonth(d.getMonth() + delta);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  const fbaMonthRows = useMemo(
    () => filterRowsByMonth(fba, effectiveFbaMonth),
    [fba, effectiveFbaMonth]
  );
  const fbaDecoratedRows = useMemo(
    () =>
      fbaMonthRows.map((row, idx) => {
        const { id: parsedId, note } = splitObs(row?.obs_admin);
        const idFromObs = isFbaShipmentId(parsedId) ? String(parsedId).trim().toUpperCase() : '';
        const idFromPrep = isFbaShipmentId(row?._resolved_fba_shipment_id)
          ? String(row._resolved_fba_shipment_id).trim().toUpperCase()
          : '';
        const groupKey = idFromPrep || idFromObs || '';
        return { ...row, _order: idx, _groupKey: groupKey, _note: note };
      }),
    [fbaMonthRows]
  );
  const fbmMonthRows = useMemo(
    () => filterRowsByMonth(fbm, effectiveFbmMonth),
    [fbm, effectiveFbmMonth]
  );
  const otherWithReturnsRows = useMemo(
    () => sortByServiceDateDesc([...(other || []), ...(returnsLines || [])]),
    [other, returnsLines]
  );
  const otherWithReturnsMonthRows = useMemo(
    () => filterRowsByMonth(otherWithReturnsRows, effectiveOtherMonth),
    [otherWithReturnsRows, effectiveOtherMonth]
  );
  const otherDecoratedRows = useMemo(
    () =>
      otherWithReturnsMonthRows.map((row, idx) => {
        const isReturnRow = row?.return_id != null;
        if (!isReturnRow) {
          return {
            ...row,
            _order: idx,
            _groupKey: '',
            _note: row?.obs_admin || '',
            _isReturn: false
          };
        }
        const { id: parsedId, note } = splitObs(row?.obs_admin);
        return {
          ...row,
          _order: idx,
          _groupKey: parsedId || '',
          _note: note,
          _isReturn: true
        };
      }),
    [otherWithReturnsMonthRows]
  );

  const fbaMonthTotals = useMemo(
    () => calcReportTotals(fbaDecoratedRows, 'units'),
    [fbaDecoratedRows]
  );
  const fbmMonthTotals = useMemo(
    () => calcReportTotals(fbmMonthRows, 'orders_units'),
    [fbmMonthRows]
  );
  const otherMonthTotals = useMemo(
    () => calcReportTotals(otherWithReturnsMonthRows, 'units'),
    [otherWithReturnsMonthRows]
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
    for (const r of otherWithReturnsRows) {
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
  }, [fba, fbm, otherWithReturnsRows]);

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
  const activeRows = isFbaView
    ? fbaDecoratedRows
    : isFbmView
      ? fbmMonthRows
      : otherDecoratedRows;
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

  const formatAdminNote = (note) => {
    if (!note) return '—';
    const raw = String(note).trim();
    if (raw.toLowerCase().startsWith('affiliate_credit:')) {
      return t('ClientOtherReport.notes.affiliateCredit') || 'Affiliate credit applied';
    }
    return raw;
  };

  const resetActiveMonth = () => {
    setActiveMonth(todayMonth);
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
            <div className="flex items-center gap-1">
              <button
                className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                onClick={() => changeMonth(setActiveMonth, -1)}
              >
                ‹
              </button>
              <input
                type="month"
                value={
                  activeMonth ||
                  (isFbaView
                    ? baseMonths.fba
                    : isFbmView
                      ? baseMonths.fbm
                      : baseMonths.other)
                }
                onChange={(e) => setActiveMonth(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
              <button
                className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
                onClick={() => changeMonth(setActiveMonth, 1)}
              >
                ›
              </button>
            </div>
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
          {reportSubtitle ? <p className="text-sm text-text-secondary">{reportSubtitle}</p> : null}
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
              ) : isFbmView ? (
                activeRows.map((r) => {
                  const qty = Number(
                    isFbaView ? r.units || 0 : isFbmView ? r.orders_units || 0 : r.units || 0
                  );
                  const lineTotal =
                    r.total != null
                      ? Number(r.total)
                      : Number(r.unit_price || 0) * (Number.isFinite(qty) ? qty : 0);
                  return (
                    <tr
                      key={r.id}
                      className={`border-t ${r.billing_invoice_id ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
                      title={formatInvoiceTooltip(r.billing_invoice)}
                    >
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
                      <td className="px-3 py-2">{formatAdminNote(r.obs_admin)}</td>
                    </tr>
                  );
                })
              ) : isFbaView ? (
                (() => {
                  const groups = [];
                  const seen = new Set();
                  activeRows.forEach((row, idx) => {
                    const key = (row._groupKey || '').trim() || '—';
                    if (!seen.has(key)) {
                      groups.push({ key, order: idx, items: [] });
                      seen.add(key);
                    }
                    const grp = groups.find((g) => g.key === key);
                    grp.items.push(row);
                  });
                  return groups.map((group) => {
                    const groupedItems = Array.isArray(group.items) ? group.items : [];
                    const groupRequestIds = Array.from(
                      new Set(groupedItems.map((item) => item?.prep_request_id).filter(Boolean))
                    );
                    const primaryRequestId = groupRequestIds[0] || null;
                    const canOpenDetails = Boolean(group.key && group.key !== '—');
                    return (
                    <React.Fragment key={group.key || group.order}>
                      <tr className="bg-slate-50/70 border-t border-slate-200">
                        <td colSpan={6} className="px-3 py-2 text-sm text-text-primary font-semibold">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              {group.key && group.key !== '—' ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-semibold uppercase">
                                    {group.key}
                                  </span>
                                  <span className="text-text-secondary text-xs inline-flex items-center gap-1">
                                    <ChevronDown className="w-4 h-4" />
                                    {tp('SupabaseClientActivity.group.lines', {
                                      count: groupedItems.length
                                    })}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-text-secondary">
                                  {t('SupabaseClientActivity.group.noId')}
                                </span>
                              )}
                            </div>
                            {canOpenDetails && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenFbaShipmentDetails?.({
                                    requestId: primaryRequestId,
                                    shipmentId: group.key
                                  })
                                }
                                className="px-2.5 py-1 text-xs rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                              >
                                See more
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {groupedItems.map((r, idx, arr) => {
                        const isFirst = idx === 0;
                        const isLast = idx === arr.length - 1;
                        const qty = Number(r.units || 0);
                        const lineTotal =
                          r.total != null
                            ? Number(r.total)
                            : Number(r.unit_price || 0) * (Number.isFinite(qty) ? qty : 0);
                        return (
                          <tr
                            key={r.id}
                            className={`${isFirst ? 'border-t' : 'border-t-0'} ${isLast ? 'border-b' : ''} ${
                              r.billing_invoice_id ? 'bg-blue-50 hover:bg-blue-50' : ''
                            }`}
                            title={formatInvoiceTooltip(r.billing_invoice)}
                          >
                            <td className="px-3 py-2">{r.service_date}</td>
                            <td className="px-3 py-2">
                              {formatFbaServiceName(r, t)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {r.unit_price != null ? fmt2(Number(r.unit_price)) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number.isFinite(qty) ? qty : '—'}
                            </td>
                        <td className="px-3 py-2 text-right">
                          {Number.isFinite(lineTotal) ? fmt2(lineTotal) : '—'}
                        </td>
                        <td className="px-3 py-2">{formatAdminNote(r._note)}</td>
                      </tr>
                    );
                  })}
                    </React.Fragment>
                  )});
                })()
              ) : (
                (() => {
                  const returnCounts = new Map();
                  activeRows.forEach((row) => {
                    if (!row?._isReturn) return;
                    const rawKey = String(row._groupKey || '').trim();
                    const key = rawKey || `return-${row.return_id || row.id}`;
                    returnCounts.set(key, (returnCounts.get(key) || 0) + 1);
                  });

                  const emittedHeaders = new Set();
                  const renderedRows = [];
                  let singlesSectionOpen = false;
                  const singleSectionLabelRaw = t('SupabaseClientActivity.group.singleLines');
                  const singleSectionLabel =
                    singleSectionLabelRaw &&
                    !String(singleSectionLabelRaw).includes('SupabaseClientActivity.group.singleLines')
                      ? singleSectionLabelRaw
                      : 'Lignes individuelles';

                  activeRows.forEach((r, idx) => {
                    const qty = Number(r.units || 0);
                    const lineTotal =
                      r.total != null
                        ? Number(r.total)
                        : Number(r.unit_price || 0) * (Number.isFinite(qty) ? qty : 0);
                    const rawKey = String(r._groupKey || '').trim();
                    const groupKey = rawKey || `return-${r.return_id || r.id}`;
                    const returnLinesCount = r?._isReturn ? (returnCounts.get(groupKey) || 0) : 0;
                    const isGroupedReturn = Boolean(r?._isReturn && returnLinesCount > 1);

                    if (isGroupedReturn) {
                      singlesSectionOpen = false;
                      if (!emittedHeaders.has(groupKey)) {
                        emittedHeaders.add(groupKey);
                        renderedRows.push(
                          <tr key={`ret-header-${groupKey}-${idx}`} className="bg-slate-50/70 border-t border-slate-200">
                            <td colSpan={6} className="px-3 py-2 text-sm text-text-primary font-semibold">
                              {rawKey ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-semibold uppercase">
                                    {localizeReturnPrefix(rawKey, t)}
                                  </span>
                                  <span className="text-text-secondary text-xs inline-flex items-center gap-1">
                                    <ChevronDown className="w-4 h-4" />
                                    {tp('SupabaseClientActivity.group.returnLines', { count: returnLinesCount })}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-text-secondary">{t('SupabaseClientActivity.group.noId')}</span>
                              )}
                            </td>
                          </tr>
                        );
                      }
                    } else if (!singlesSectionOpen) {
                      singlesSectionOpen = true;
                      renderedRows.push(
                        <tr key={`single-header-${idx}`} className="bg-slate-50/40 border-t border-slate-200">
                          <td colSpan={6} className="px-3 py-2 text-sm text-text-secondary font-semibold">
                            {singleSectionLabel}
                          </td>
                        </tr>
                      );
                    }

                    renderedRows.push(
                      <tr
                        key={`row-${r._isReturn ? 'ret' : 'oth'}-${r.id}`}
                        className={`border-t ${
                          r.billing_invoice_id
                            ? 'bg-blue-50 hover:bg-blue-50'
                            : isGroupedReturn
                              ? ''
                              : 'bg-slate-50/20'
                        }`}
                        title={formatInvoiceTooltip(r.billing_invoice)}
                      >
                        <td className="px-3 py-2">{r.service_date}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span>{formatOtherServiceName(r.service, t)}</span>
                            {!isGroupedReturn && (
                              <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold uppercase tracking-wide">
                                Single
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.unit_price != null ? fmt2(Number(r.unit_price)) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {Number.isFinite(qty) ? qty : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {Number.isFinite(lineTotal) ? fmt2(lineTotal) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r._isReturn ? (r._note || '—') : formatAdminNote(r.obs_admin)}
                        </td>
                      </tr>
                    );
                  });

                  return renderedRows;
                })()
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/80 font-semibold text-text-primary">
                <td className="px-3 py-2" colSpan={3}>
                  {t('SupabaseClientActivity.totals')}
                </td>
                <td className="px-3 py-2 text-right">{activeTotals.qty}</td>
                <td className="px-3 py-2 text-right">{fmtMoneyHT(activeTotals.total)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 text-sm text-text-secondary">
          Monthly totals — {qtyHeading}: <strong>{activeTotals.qty}</strong> · Total:{' '}
          <strong>{fmtMoneyHT(activeTotals.total)}</strong>
        </div>
      </div>

    </div>
  );
}
