// FILE: src/components/dashboard/client/ClientReturns.jsx
import React, { useEffect, useState } from 'react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabase } from '../../../config/supabase';
import { useDashboardTranslation } from '../../../translations';

export default function ClientReturns() {
  const { t } = useDashboardTranslation();
  const { profile, status } = useSupabaseAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!profile?.company_id) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('returns')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('return_date', { ascending: false });
      if (!alive) return;
      setRows(error ? [] : Array.isArray(data) ? data : []);
      setLoading(false);
    }
    if (status !== 'loading') load();
    return () => { alive = false; };
  }, [status, profile?.company_id]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-text-primary">{t('ClientReturns.title')}</h2>
        <p className="text-sm text-text-secondary">{t('ClientReturns.readonly')}</p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">{t('ClientReturns.thead.date')}</th>
              <th className="px-4 py-3 text-left">ASIN</th>
              <th className="px-4 py-3 text-right">{t('ClientReturns.thead.qty')}</th>
              <th className="px-4 py-3 text-left">{t('ClientReturns.thead.type')}</th>
              <th className="px-4 py-3 text-left">{t('ClientReturns.thead.status')}</th>
              <th className="px-4 py-3 text-left">{t('ClientReturns.thead.adminNotes')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-t">
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">{t('common.loading')}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="border-t">
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">{t('ClientReturns.noRecords')}</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">{r.return_date}</td>
                  <td className="px-4 py-3">{r.asin}</td>
                  <td className="px-4 py-3 text-right">{r.qty}</td>
                  <td className="px-4 py-3">{r.return_type || '—'}</td>
                  <td className="px-4 py-3">
                    {r.status || '—'}
                    {r.status === 'Other' && r.status_note ? (
                      <span className="text-text-secondary"> · {r.status_note}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{r.obs_admin || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
