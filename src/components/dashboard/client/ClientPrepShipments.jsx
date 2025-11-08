import React, { useEffect, useState } from 'react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';
import { supabase } from '../../../config/supabase';
import { Package } from 'lucide-react';

export default function ClientPrepShipments() {
  const { profile } = useSupabaseAuth();
  const { t } = useDashboardTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('prep_requests')
        .select('id, destination_country, created_at, status, fba_shipment_id, prep_request_tracking(tracking_id)')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!active) return;
      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setError('');
        setRows(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [profile?.id]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{t('ClientPrepShipments.title')}</h1>
            <p className="text-sm text-text-secondary">{t('ClientPrepShipments.desc')}</p>
          </div>
        </div>
      </header>

      <div className="border rounded-xl bg-white overflow-hidden">
        <div className="border-b px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {t('ClientPrepShipments.table.title')}
          </h2>
          {loading && <span className="text-xs text-text-light">{t('common.loading')}</span>}
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.date')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.country')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.fbaShipmentId')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.trackIds')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.status')}</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-light">
                    {t('ClientPrepShipments.table.empty')}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-2">{row.destination_country || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.fba_shipment_id || '—'}</td>
                  <td className="px-4 py-2">
                    {Array.isArray(row.prep_request_tracking) && row.prep_request_tracking.length > 0
                      ? row.prep_request_tracking.map((trk) => trk.tracking_id).join(', ')
                      : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                      {row.status || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
