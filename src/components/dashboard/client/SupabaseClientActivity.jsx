// FILE: src/components/dashboard/client/SupabaseClientActivity.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";
import { supabaseHelpers } from "../../../config/supabase";
import ClientBalanceBar from "./ClientBalanceBar";


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
    <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
      <h3 className="text-lg font-semibold text-text-primary mb-4">{title}</h3>
      {children}
    </div>
  );
}

const SHOW_DEALS_KEY = 'client_showDeals_v2';

const fmt2 = (n) => (typeof n === "number" && isFinite(n) ? Number(n).toFixed(2) : "—");
// ✅ necesar pentru filtrarea datelor din grafic
const toDate = (d) => new Date(d + "T00:00:00");

const fmtMoney = (n, currency = 'EUR', locale = 'fr-FR') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(n || 0));
const fmtMoneyHT = (n, currency = 'EUR') => `${fmtMoney(n, currency)} HT`;

export default function SupabaseClientActivity() {
  const { t } = useDashboardTranslation();
  const { profile } = useSupabaseAuth();
  const companyId = profile?.company_id;

  const [fba, setFba] = useState([]);
  const [fbm, setFbm] = useState([]);
  const [deals, setDeals] = useState([]);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [showDeals, setShowDeals] = useState(false); // ascuns by default
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("3m");

  // Persistă preferința pe device: afișează deal-urile doar dacă user-ul apasă "Afficher"
  useEffect(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem(SHOW_DEALS_KEY) : null;
    if (v === '1') setShowDeals(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SHOW_DEALS_KEY, showDeals ? '1' : '0');
  }, [showDeals]);

  const load = async () => {
    if (!companyId) {
      setFba([]);
      setFbm([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [
   { data: fbaData },
   { data: fbmData },
   { data: dealsData }
 ] = await Promise.all([
   supabaseHelpers.listFbaLinesByCompany(companyId),
   supabaseHelpers.listFbmLinesByCompany(companyId),
   supabaseHelpers.listCompanyDeals(companyId),
 ]);
    setFba(fbaData || []);
    setFbm(fbmData || []);
    setDeals(dealsData || []);  
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [companyId]);

  const fbaTotals = useMemo(() => {
    const units = fba.reduce((s, r) => s + Number(r.units || 0), 0);
    const total = fba.reduce(
      (s, r) =>
        s +
        (r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.units || 0)),
      0
    );
    return { units, total };
  }, [fba]);

  const fbmTotals = useMemo(() => {
    const ordersUnits = fbm.reduce((s, r) => s + Number(r.orders_units || 0), 0);
    const total = fbm.reduce(
      (s, r) =>
        s +
        (r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.orders_units || 0)),
      0
    );
    return { ordersUnits, total };
  }, [fbm]);

  const chartData = useMemo(() => {
    const map = {};
    for (const r of fba) {
      const d = r.service_date;
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.units || 0);
      if (!map[d]) map[d] = { date: d, fba: 0, fbm: 0, fbaUnits: 0, fbmUnits: 0 };
      map[d].fba += isFinite(total) ? total : 0;
      map[d].fbaUnits += Number(r.units || 0);
    }
    for (const r of fbm) {
      const d = r.service_date;
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.orders_units || 0);
      if (!map[d]) map[d] = { date: d, fba: 0, fbm: 0, fbaUnits: 0, fbmUnits: 0 };
      map[d].fbm += isFinite(total) ? total : 0;
      map[d].fbmUnits += Number(r.orders_units || 0);
    }
    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [fba, fbm]);

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
        <div className="font-medium mb-1">{t('activity.tooltip.date')}: {label}</div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#ec4899" }} />
            <span>FBA:</span>
            <strong>{fmtMoneyHT(point.fba)}</strong>
            <span className="text-gray-500">({point.fbaUnits || 0} {t('activity.thead.units').toLowerCase()})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} />
            <span>FBM:</span>
            <strong>{fmtMoneyHT(point.fbm)}</strong>
            <span className="text-gray-500">({point.fbmUnits || 0} {t('activity.thead.units').toLowerCase()})</span>
          </div>
        </div>
      </div>
    );
  };

  if (!companyId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4">
        {t('activity.companyMissing')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
  <div className="space-y-8">
    {/* HEADER ZONE: split 1/2 - 1/2 */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

     {/* LEFT: Deals list (fully collapsible) */}
    <div className="bg-white rounded-xl shadow-sm p-6">
      {!showDeals ? (
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => setShowDeals(true)}
        >
          Afficher les offres négociées
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-text-primary">
              Offres négociées
            </h3>
            {deals?.length > 0 && (
              <span className="text-xs rounded-full px-2 py-0.5 bg-slate-100 text-text-secondary">
                {deals.length}
              </span>
            )}
          </div>

          {(!deals || deals.length === 0) ? (
            <div className="text-text-secondary">Aucune offre active.</div>
          ) : (
            <>
              <ul className="divide-y divide-gray-100">
                {(showAllDeals ? deals : deals.slice(0, 4)).map(d => (
                  <li key={d.id} className="py-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium truncate">{d.title}</span>
                      <span className="text-sm text-text-secondary whitespace-nowrap">
                        {fmtMoneyHT(d.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-4 mt-3">
                {deals.length > 4 && (
                  <button
                    className="text-sm text-primary hover:underline"
                    onClick={() => setShowAllDeals(s => !s)}
                  >
                    {showAllDeals ? 'Masquer' : 'Voir tout'}
                  </button>
                )}
                <button
                  className="text-sm text-text-secondary hover:underline"
                  onClick={() => { setShowDeals(false); setShowAllDeals(false); }}
                >
                  Fermer
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>

        {/* RIGHT: Solde */}
          <div>
            <ClientBalanceBar companyId={companyId} />
          </div>
        </div>

      {/* FBA */}
      <Box title={t('activity.fbaTitle')}>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">{t('activity.thead.date')}</th>
                <th className="px-3 py-2 text-left">{t('activity.thead.service')}</th>
                <th className="px-3 py-2 text-right">{t('activity.thead.unitPrice')} (HT)</th>
                <th className="px-3 py-2 text-right">{t('activity.thead.units')}</th>
                 <th className="px-3 py-2 text-right">{t('activity.thead.total')} (HT)</th>
                <th className="px-3 py-2 text-left">{t('activity.thead.adminNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {fba.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-text-secondary">
                    {t('activity.noRecords')}
                  </td>
                </tr>
              ) : (
                <>
                  {fba.map((r) => {
                    const lineTotal =
                      r.total != null
                        ? Number(r.total)
                        : Number(r.unit_price || 0) * Number(r.units || 0);
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{r.service_date}</td>
                        <td className="px-3 py-2">{r.service}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtMoneyHT(r.unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right">{Number(r.units || 0)}</td>
                        <td className="px-3 py-2 text-right">{fmtMoneyHT(lineTotal)}</td>
                        <td className="px-3 py-2">{r.obs_admin || "—"}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-slate-50/80 font-semibold text-text-primary">
                    <td className="px-3 py-2" colSpan={3}>
                      {t('activity.totals')}
                    </td>
                    <td className="px-3 py-2 text-right">{fbaTotals.units}</td>
                    <td className="px-3 py-2 text-right">{fmtMoneyHT(fbaTotals.total)}</td>
                    <td className="px-3 py-2" colSpan={1}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </Box>

      {/* FBM */}
      <Box title={t('activity.fbmTitle')}>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">{t('activity.thead.date')}</th>
                <th className="px-3 py-2 text-left">{t('activity.thead.service')}</th>
                 <th className="px-3 py-2 text-right">{t('activity.thead.unitPrice')} (HT)</th>
                <th className="px-3 py-2 text-right">{t('activity.thead.ordersUnits')}</th>
                 <th className="px-3 py-2 text-right">{t('activity.thead.total')} (HT)</th>
                <th className="px-3 py-2 text-left">{t('activity.thead.adminNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {fbm.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-text-secondary">
                    {t('activity.noRecords')}
                  </td>
                </tr>
              ) : (
                <>
                  {fbm.map((r) => {
                    const lineTotal =
                      r.total != null
                        ? Number(r.total)
                        : Number(r.unit_price || 0) * Number(r.orders_units || 0);
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{r.service_date}</td>
                        <td className="px-3 py-2">{r.service}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtMoneyHT(r.unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {Number(r.orders_units || 0)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtMoneyHT(lineTotal)}</td>
                        <td className="px-3 py-2">{r.obs_admin || "—"}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-slate-50/80 font-semibold text-text-primary">
                    <td className="px-3 py-2" colSpan={3}>
                      {t('activity.totals')}
                    </td>
                    <td className="px-3 py-2 text-right">{fbmTotals.ordersUnits}</td>
                    <td className="px-3 py-2 text-right">{fmtMoneyHT(fbmTotals.total)}</td>
                    <td className="px-3 py-2" colSpan={1}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Controls + Chart */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-md font-semibold text-text-primary">
              {t('activity.chartTitle')}
            </h4>
            <div className="flex gap-2">
              {[
                { k: "1m", label: t('activity.range.m1') },
                { k: "3m", label: t('activity.range.m3') },
                { k: "all", label: t('activity.range.all') },
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
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={filteredChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="fba"
                stroke="#ec4899"
                strokeWidth={2}
                dot={false}
                name="FBA"
              />
              <Line
                type="monotone"
                dataKey="fbm"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="FBM"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Box>
    </div>
  );
}
