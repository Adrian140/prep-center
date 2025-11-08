// FILE: src/components/dashboard/client/ClientFBMReport.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabaseHelpers } from '../../../config/supabase';
import { useDashboardTranslation } from '../../../translations';

export default function ClientFBMReport() {
  const { t } = useDashboardTranslation();
  const { profile, status } = useSupabaseAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const [monthStr, setMonthStr] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!profile?.company_id) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabaseHelpers.listFbmLinesByCompany(profile.company_id);
      if (!mounted) return;
      setRows(error ? [] : Array.isArray(data) ? data : []);
      setLoading(false);
    }
    if (status !== 'loading') load();
    return () => { mounted = false; };
  }, [status, profile?.company_id]);

  const monthFiltered = useMemo(() => {
    const prefix = `${monthStr}-`;
    return rows.filter((r) => (r.service_date || '').startsWith(prefix));
  }, [rows, monthStr]);

  const { ordersSum, totalSum } = useMemo(() => {
    let o = 0;
    let tSum = 0;
    for (const r of monthFiltered) {
      const total =
        r.total != null
          ? Number(r.total)
          : Number(r.unit_price || 0) * Number(r.orders_units || 0);
      const ord = Number(r.orders_units || 0);
      if (isFinite(ord)) o += ord;
      if (isFinite(total)) tSum += total;
    }
    return { ordersSum: o, totalSum: tSum };
  }, [monthFiltered]);

  const fmt2 = (n) => (typeof n === 'number' && isFinite(n) ? n.toFixed(2) : '—');

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{t('ClientFBMReport.title')}</h2>
          <p className="text-sm text-text-secondary">{t('ClientFBMReport.readonly')}</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">{t('ClientFBMReport.monthLabel')}</label>
          <input
            type="month"
            value={monthStr}
            onChange={(e) => setMonthStr(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <button
            className="text-sm border rounded px-2 py-1"
            onClick={() => {
              const d = new Date();
              setMonthStr(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
            }}
          >
            {t('ClientFBMReport.currentMonth')}
          </button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">{t('activity.thead.date')}</th>
              <th className="px-4 py-3 text-left">{t('activity.thead.service')}</th>
              <th className="px-4 py-3 text-right">{t('activity.thead.unitPrice')}</th>
              <th className="px-4 py-3 text-right">{t('activity.thead.ordersUnits')}</th>
              <th className="px-4 py-3 text-right">{t('activity.thead.total')}</th>
              <th className="px-4 py-3 text-left">{t('activity.thead.adminNotes')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t">
                <td className="px-4 py-6 text-center text-gray-400" colSpan={6}>
                  {t('common.loading')}
                </td>
              </tr>
            ) : monthFiltered.length === 0 ? (
              <tr className="border-t">
                <td className="px-4 py-6 text-center text-gray-400" colSpan={6}>
                  {t('ClientFBMReport.noDataMonth')}
                </td>
              </tr>
            ) : (
              monthFiltered.map((r) => {
                const total =
                  r.total != null
                    ? Number(r.total)
                    : Number(r.unit_price || 0) * Number(r.orders_units || 0);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">{r.service_date}</td>
                    <td className="px-4 py-3">{r.service}</td>
                    <td className="px-4 py-3 text-right">
                      {r.unit_price != null ? Number(r.unit_price).toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">{r.orders_units ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {isFinite(total) ? total.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3">{r.obs_admin || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>

          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-3" colSpan={3}></td>
              <td className="px-4 py-3 text-right">{ordersSum}</td>
              <td className="px-4 py-3 text-right">
                {isFinite(totalSum) ? totalSum.toFixed(2) : '—'}
              </td>
              <td className="px-4 py-3" colSpan={1}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 text-sm text-text-secondary">
        Monthly totals — Orders/Units: <strong>{ordersSum}</strong> · Total:{' '}
        <strong>{fmt2(totalSum)} €</strong>
      </div>
    </div>
  );
}
