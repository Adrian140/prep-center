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
  const [confirming, setConfirming] = useState(null);
  const [merchantDrafts, setMerchantDrafts] = useState({});
  const [savingMerchant, setSavingMerchant] = useState(null);

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
      const baseRows = data || [];
      const userIds = Array.from(new Set(baseRows.map((r) => r.user_id).filter(Boolean)));
      let profileMap = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, company_name, store_name, email')
          .in('id', userIds);
        profileMap = Array.isArray(profiles)
          ? profiles.reduce((acc, p) => {
              acc[p.id] = p;
              return acc;
            }, {})
          : {};
      }
      const enriched = baseRows.map((row) => ({
        ...row,
        profile: profileMap[row.user_id] || null
      }));
      const draftMap = {};
      enriched.forEach((row) => {
        draftMap[row.id] = row.merchant_id ? String(row.merchant_id) : '';
      });
      setMerchantDrafts(draftMap);
      const sorted = enriched.sort((a, b) => {
        const aPending = (a.status || 'pending') === 'pending' ? 1 : 0;
        const bPending = (b.status || 'pending') === 'pending' ? 1 : 0;
        if (aPending !== bPending) return bPending - aPending;
        const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
      setRows(sorted);
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async (row) => {
    if (!row?.id) return;
    setConfirming(row.id);
    try {
      const { error } = await supabase
        .from('prep_business_integrations')
        .update({ status: 'mapped', last_error: null, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not confirm integration.');
    } finally {
      setConfirming(null);
    }
  };

  const handleMerchantSave = async (row) => {
    if (!row?.id) return;
    const value = (merchantDrafts[row.id] || '').trim();
    setSavingMerchant(row.id);
    try {
      const { error } = await supabase
        .from('prep_business_integrations')
        .update({
          merchant_id: value ? value : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id);
      if (error) throw error;
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not save merchant id.');
    } finally {
      setSavingMerchant(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Arbitrage One Integrations</h3>
          <p className="text-sm text-text-secondary">
            Email confirmări pentru importul din Arbitrage One (via PrepBusiness).
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
        <div className="text-sm text-text-secondary">No Arbitrage One integrations yet.</div>
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
                {row.profile && (
                  <div className="text-xs text-text-secondary">
                    Client: {row.profile.company_name || row.profile.store_name || '—'} · {row.profile.email || '—'}
                  </div>
                )}
                {row.last_error && (
                  <div className="text-xs text-red-600 mt-1 break-all">
                    <AlertTriangle className="inline w-3 h-3 mr-1" />
                    {row.last_error}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-text-light">
                <span>User: {row.user_id || '—'} · Company: {row.company_id || '—'}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-36 px-2 py-1 border rounded text-xs"
                    placeholder="Merchant ID"
                    value={merchantDrafts[row.id] ?? ''}
                    onChange={(e) =>
                      setMerchantDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                    }
                  />
                  <button
                    onClick={() => handleMerchantSave(row)}
                    disabled={savingMerchant === row.id}
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
                  >
                    {savingMerchant === row.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : null}
                    Save ID
                  </button>
                </div>
                {(row.status || 'pending') === 'pending' && (
                  <button
                    onClick={() => handleConfirm(row)}
                    disabled={confirming === row.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {confirming === row.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    Confirm account created
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
