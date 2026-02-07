import React, { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import { AlertTriangle, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';

const StatusBadge = ({ status }) => {
  if (status === 'active' || status === 'mapped') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
        <CheckCircle className="w-3 h-3" /> Active
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">
        <AlertTriangle className="w-3 h-3" /> Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">
      Pending
    </span>
  );
};

const fmt = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function AdminPrepBusinessIntegrations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setRefreshing(true);
    setMessage('');
    const { data, error } = await supabase
      .from('prep_business_integrations')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      setMessage(error.message || 'Could not load PrepBusiness integrations.');
      setRows([]);
    } else {
      setRows(data || []);
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">PrepBusiness Integrations</h3>
          <p className="text-sm text-text-secondary">
            Statusuri, mapări email și erori pentru clienții conectați.
          </p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-primary text-primary rounded-lg disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading integrations…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-text-secondary">No PrepBusiness integrations yet.</div>
      ) : (
        <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
          {rows.map((row) => (
            <div key={row.id} className="px-4 py-3 bg-white flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {row.email_prep_business || row.email_arbitrage_one || 'Unknown email'}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                <div className="text-xs text-text-secondary">
                  AO: {row.email_arbitrage_one || '—'} · PB: {row.email_prep_business || '—'}
                </div>
                <div className="text-xs text-text-secondary">
                  Merchant: {row.merchant_id || '—'} · Last sync: {fmt(row.last_synced_at)} · Updated: {fmt(row.updated_at)}
                </div>
                {row.last_error && (
                  <div className="text-xs text-red-600 mt-1 break-all">
                    <AlertTriangle className="inline w-3 h-3 mr-1" />
                    {row.last_error}
                  </div>
                )}
              </div>
              <div className="text-xs text-text-light">
                User: {row.user_id || '—'} · Company: {row.company_id || '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
