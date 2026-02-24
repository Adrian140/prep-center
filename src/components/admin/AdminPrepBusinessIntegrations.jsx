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
  if (status === 'inactive' || status === 'unassociated') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
        Inactive
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

const rowKey = (row) => row.id || `user:${row.user_id || 'unknown'}`;

export default function AdminPrepBusinessIntegrations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [merchantDrafts, setMerchantDrafts] = useState({});
  const [tokenDrafts, setTokenDrafts] = useState({});
  const [savingMerchant, setSavingMerchant] = useState(null);
  const [savingToken, setSavingToken] = useState(null);

  const load = async () => {
    setRefreshing(true);
    setMessage('');

    const [{ data: integrations, error: integrationError }, { data: profiles, error: profilesError }] = await Promise.all([
      supabase.from('prep_business_integrations').select('*').order('updated_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, first_name, last_name, company_name, store_name, email, company_id, account_type, is_admin')
        .order('created_at', { ascending: false })
    ]);

    if (integrationError || profilesError) {
      setMessage(integrationError?.message || profilesError?.message || 'Could not load integrations.');
      setRows([]);
      setRefreshing(false);
      setLoading(false);
      return;
    }

    const clientProfiles = (profiles || []).filter(
      (p) => p?.is_admin !== true && String(p?.account_type || '').toLowerCase() !== 'admin'
    );

    const byUserId = new Map();
    (integrations || []).forEach((row) => {
      if (row?.user_id && !byUserId.has(row.user_id)) byUserId.set(row.user_id, row);
    });

    const mergedRows = clientProfiles.map((profile) => {
      const integration = byUserId.get(profile.id);
      if (integration) {
        return {
          ...integration,
          profile,
          _rowKey: rowKey(integration)
        };
      }
      return {
        id: null,
        user_id: profile.id,
        company_id: profile.company_id || null,
        email_arbitrage_one: null,
        email_prep_business: null,
        merchant_id: null,
        profit_path_token_id: null,
        status: 'inactive',
        last_error: null,
        last_synced_at: null,
        created_at: null,
        updated_at: null,
        profile,
        _rowKey: `user:${profile.id}`
      };
    });

    const unknownIntegrations = (integrations || [])
      .filter((row) => row?.user_id && !clientProfiles.some((p) => p.id === row.user_id))
      .map((row) => ({ ...row, profile: null, _rowKey: rowKey(row) }));

    const enriched = [...mergedRows, ...unknownIntegrations];

    const merchantMap = {};
    const tokenMap = {};
    enriched.forEach((row) => {
      merchantMap[row._rowKey] = row.merchant_id ? String(row.merchant_id) : '';
      tokenMap[row._rowKey] = row.profit_path_token_id ? String(row.profit_path_token_id) : '';
    });
    setMerchantDrafts(merchantMap);
    setTokenDrafts(tokenMap);

    const sorted = enriched.sort((a, b) => {
      const aInactive = ['inactive', 'unassociated'].includes(a.status || '') ? 1 : 0;
      const bInactive = ['inactive', 'unassociated'].includes(b.status || '') ? 1 : 0;
      if (aInactive !== bInactive) return aInactive - bInactive;
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });

    setRows(sorted);
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upsertIntegration = async (row, patch) => {
    const payload = {
      id: row?.id || undefined,
      user_id: row?.user_id,
      company_id: row?.company_id || row?.profile?.company_id || null,
      email_arbitrage_one: row?.email_arbitrage_one || row?.email_prep_business || row?.profile?.email || null,
      email_prep_business: row?.email_prep_business || row?.email_arbitrage_one || row?.profile?.email || null,
      status: row?.status && !['inactive', 'unassociated'].includes(row.status) ? row.status : 'pending',
      merchant_id: row?.merchant_id || null,
      profit_path_token_id: row?.profit_path_token_id || null,
      last_error: row?.last_error || null,
      updated_at: new Date().toISOString(),
      created_at: row?.created_at || new Date().toISOString(),
      ...patch
    };

    const { error } = await supabase
      .from('prep_business_integrations')
      .upsert(payload, { onConflict: 'user_id' });
    return { error };
  };

  const handleConfirm = async (row) => {
    if (!row?.user_id) return;
    const key = row._rowKey;
    setConfirming(key);
    try {
      const { error } = await upsertIntegration(row, { status: 'mapped', last_error: null });
      if (error) throw error;
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not confirm integration.');
    } finally {
      setConfirming(null);
    }
  };

  const handleMerchantSave = async (row) => {
    if (!row?.user_id) return;
    const key = row._rowKey;
    const value = (merchantDrafts[key] || '').trim();
    setSavingMerchant(key);
    try {
      const tokenValue = (tokenDrafts[key] || '').trim();
      const { error } = await upsertIntegration(row, {
        merchant_id: value || null,
        profit_path_token_id: tokenValue || value || row?.profit_path_token_id || null
      });
      if (error) throw error;
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not save merchant id.');
    } finally {
      setSavingMerchant(null);
    }
  };

  const handleTokenSave = async (row) => {
    if (!row?.user_id) return;
    const key = row._rowKey;
    const value = (tokenDrafts[key] || '').trim();
    setSavingToken(key);
    try {
      const merchantValue = (merchantDrafts[key] || '').trim();
      const { error } = await upsertIntegration(row, {
        profit_path_token_id: value || null,
        merchant_id: merchantValue || value || row?.merchant_id || null
      });
      if (error) throw error;
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not save Profit Path token.');
    } finally {
      setSavingToken(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">PrepBusiness Client Mapping (A1 + Profit Path)</h3>
          <p className="text-sm text-text-secondary">
            Clients without setup are shown as inactive until they create their PrepBusiness account.
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
        <div className="text-sm text-text-secondary">No clients found.</div>
      ) : (
        <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
          {rows.map((row) => {
            const key = row._rowKey;
            return (
              <div key={key} className="px-4 py-3 bg-white flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {row.email_prep_business || row.email_arbitrage_one || row.profit_path_token_id || row.profile?.email || 'Unknown mapping'}
                    </span>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="text-xs text-text-secondary">
                    AO: {row.email_arbitrage_one || '—'} · PB: {row.email_prep_business || '—'}
                  </div>
                  <div className="text-xs text-text-secondary">
                    Profit Path token: {row.profit_path_token_id || '—'}
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
                <div className="flex items-center gap-3 text-xs text-text-light flex-wrap">
                  <span>User: {row.user_id || '—'} · Company: {row.company_id || row.profile?.company_id || '—'}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-36 px-2 py-1 border rounded text-xs"
                      placeholder="Merchant ID"
                      value={merchantDrafts[key] ?? ''}
                      onChange={(e) =>
                        setMerchantDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                    <button
                      onClick={() => handleMerchantSave(row)}
                      disabled={savingMerchant === key}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
                    >
                      {savingMerchant === key ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Save ID
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="w-44 px-2 py-1 border rounded text-xs"
                      placeholder="Profit Path token"
                      value={tokenDrafts[key] ?? ''}
                      onChange={(e) =>
                        setTokenDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                    <button
                      onClick={() => handleTokenSave(row)}
                      disabled={savingToken === key}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
                    >
                      {savingToken === key ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Save token
                    </button>
                  </div>
                  {(row.status || 'pending') === 'pending' && (
                    <button
                      onClick={() => handleConfirm(row)}
                      disabled={confirming === key}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {confirming === key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3 h-3" />
                      )}
                      Confirm account created
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
