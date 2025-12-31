import React, { useEffect, useMemo, useState } from 'react';
import { Link2, ExternalLink, CheckCircle, AlertTriangle, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';

const AMAZON_REGIONS = [
  { id: 'eu', consentUrl: 'https://sellercentral-europe.amazon.com/apps/authorize/consent', marketplaceId: 'A13V1IB3VIYZZH' },
  { id: 'na', consentUrl: 'https://sellercentral.amazon.com/apps/authorize/consent', marketplaceId: 'ATVPDKIKX0DER' },
  { id: 'jp', consentUrl: 'https://sellercentral-japan.amazon.com/apps/authorize/consent', marketplaceId: 'A1VC38T7YXB528' }
];

const MARKETPLACE_LABELS = {
  A13V1IB3VIYZZH: 'FR',
  A1PA6795UKMFR9: 'DE',
  A1RKKUPIHCS9HS: 'ES',
  APJ6JRA9NG5V4: 'IT',
  A1F83G8C2ARO7P: 'UK',
  AMEN7PMS3EDWL: 'BE',
  A1805IZSGTT6HS: 'NL',
  A2NODRKZP88ZB9: 'SE',
  A1C3SOZRARQ6R3: 'PL'
};

const STATUS_PRIORITY = {
  error: 3,
  active: 2,
  pending: 1
};

function formatMarketplaceLabel(ids = []) {
  const entries = ids
    .filter(Boolean)
    .map((id) => MARKETPLACE_LABELS[id] || id);
  if (!entries.length) return '—';
  if (entries.length === 1) return entries[0];
  return `EU (${entries.join(', ')})`;
}

function aggregateIntegrations(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.selling_partner_id || `integration-${row.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        groupId: key,
        status: row.status || 'pending',
        last_error: row.last_error || null,
        marketplace_ids: [],
        created_at: row.created_at,
        last_synced_at: row.last_synced_at,
        integration_id: row.id,
        sortTimestamp: new Date(row.updated_at || row.last_synced_at || row.created_at || 0).getTime()
      });
    }
    const group = groups.get(key);
    if (row.marketplace_id) {
      group.marketplace_ids.push(row.marketplace_id);
    }
    const createdTime = new Date(row.created_at || 0).getTime();
    if (!group.created_at || createdTime < new Date(group.created_at || 0).getTime()) {
      group.created_at = row.created_at;
    }
    const syncedTime = new Date(row.last_synced_at || 0).getTime();
    if (syncedTime > new Date(group.last_synced_at || 0).getTime()) {
      group.last_synced_at = row.last_synced_at;
    }
    const rowPriority = STATUS_PRIORITY[row.status] || 0;
    const groupPriority = STATUS_PRIORITY[group.status] || 0;
    if (rowPriority > groupPriority) {
      group.status = row.status;
    }
    if (row.last_error) {
      group.last_error = row.last_error;
    }
    const timestamp = new Date(row.updated_at || row.last_synced_at || row.created_at || 0).getTime();
    if (timestamp >= (group.sortTimestamp || 0)) {
      group.integration_id = row.id;
      group.sortTimestamp = timestamp;
    }
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    id: group.groupId,
    marketplace_ids: Array.from(new Set(group.marketplace_ids))
  }));
}

function StatusBadge({ status, t }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
        <CheckCircle className="w-3 h-3" /> {t('ClientIntegrations.status.active')}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">
        <AlertTriangle className="w-3 h-3" /> {t('ClientIntegrations.status.error')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
      {t('ClientIntegrations.status.pending')}
    </span>
  );
}

export default function ClientIntegrations() {
  const { user, profile } = useSupabaseAuth();
  const { t, tp } = useDashboardTranslation();
  const supportError = t('common.supportError');
  const isIndividualAccount =
    (profile?.account_type || profile?.accountType || profile?.type) === 'individual';
  const [region, setRegion] = useState('eu');
  const [stateToken] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const clientId = import.meta.env.VITE_SPAPI_CLIENT_ID || '';
  const applicationId = import.meta.env.VITE_AMZ_APP_ID || clientId || '';
  const redirectUri =
    import.meta.env.VITE_SPAPI_REDIRECT_URI || `${window.location.origin}/auth/amazon/callback`;

  const statePayload = useMemo(() => {
    if (!user?.id) return '';
    const marketplace = AMAZON_REGIONS.find((r) => r.id === region)?.marketplaceId || 'A13V1IB3VIYZZH';
    const payload = {
      userId: user.id,
      companyId: profile?.company_id || user.id,
      region,
      marketplaceId: marketplace,
      redirectUri,
      nonce: stateToken
    };
    return btoa(JSON.stringify(payload));
  }, [user?.id, profile?.company_id, region, stateToken, redirectUri]);

  const authorizeUrl = useMemo(() => {
    if (!applicationId || !redirectUri || !statePayload) return '';
    const regionConfig = AMAZON_REGIONS.find((r) => r.id === region);
    if (!regionConfig) return '';
    const params = new URLSearchParams({
      application_id: applicationId,
      state: statePayload,
      version: 'beta',
      redirect_uri: redirectUri
    });
    return `${regionConfig.consentUrl}?${params.toString()}`;
  }, [applicationId, redirectUri, region, statePayload]);

  const handleAmazonConnect = () => {
    if (isIndividualAccount) {
      setFlash(t('ClientIntegrations.individualBlocked'));
      return;
    }
    if (authorizeUrl) {
      window.open(authorizeUrl, '_blank', 'noopener');
    }
  };

  const loadIntegrations = async () => {
    if (!user?.id) return;
    setRefreshing(true);
    const { data, error } = await supabase
      .from('amazon_integrations')
      .select('id, marketplace_id, region, status, last_synced_at, created_at, updated_at, last_error, selling_partner_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      setFlash(supportError);
      setRows([]);
    } else {
      setFlash('');
      const deduped = (data || []).reduce((acc, row) => {
        const key = `${row.marketplace_id || ''}::${row.region || ''}`;
        const existing = acc.get(key);
        const existingTime = existing ? new Date(existing.updated_at || existing.created_at || 0).getTime() : -Infinity;
        const currentTime = new Date(row.updated_at || row.created_at || 0).getTime();
        if (!existing || currentTime >= existingTime) {
          acc.set(key, row);
        }
        return acc;
      }, new Map());
      const aggregated = aggregateIntegrations(Array.from(deduped.values())).sort((a, b) => {
        const aTime = a.sortTimestamp ?? new Date(a.updated_at || a.created_at || 0).getTime();
        const bTime = b.sortTimestamp ?? new Date(b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      });
      setRows(aggregated);
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    loadIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const removeIntegration = async (id) => {
    if (!window.confirm(t('ClientIntegrations.confirmDisconnect'))) return;
    setFlash('');
    const { error } = await supabase.from('amazon_integrations').delete().eq('id', id);
    if (error) {
      setFlash(supportError);
    } else {
      setFlash(t('ClientIntegrations.flashRemoved'));
      loadIntegrations();
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/10 text-primary">
          <Link2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{t('ClientIntegrations.title')}</h1>
          <p className="text-sm text-text-secondary">{t('ClientIntegrations.desc')}</p>
        </div>
      </header>

      {(!clientId || !applicationId) && (
        <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
          {tp('ClientIntegrations.notice', {
            clientId: 'VITE_SPAPI_CLIENT_ID / VITE_AMZ_APP_ID',
            redirect: 'VITE_SPAPI_REDIRECT_URI'
          })}
        </div>
      )}

      {flash && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{flash}</div>
      )}

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">{t('ClientIntegrations.marketplaceLabel')}</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              {AMAZON_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {t(`ClientIntegrations.regions.${r.id}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAmazonConnect}
            disabled={!authorizeUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
          >
            <ExternalLink className="w-4 h-4" /> {t('ClientIntegrations.connectButton')}
          </button>
          <button
            onClick={removeAllIntegrations}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50"
          >
            <Unplug className="w-4 h-4" /> {t('ClientIntegrations.actions.disconnectAll', 'Disconnect all')}
          </button>
        </div>
        {isIndividualAccount && (
          <p className="text-sm text-red-600">{t('ClientIntegrations.individualBlocked')}</p>
        )}
        <p className="text-xs text-text-light">{t('ClientIntegrations.instructions')}</p>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('ClientIntegrations.listTitle')}</h2>
            <p className="text-sm text-text-secondary">{t('ClientIntegrations.listDesc')}</p>
          </div>
          <button
            onClick={loadIntegrations}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {t('ClientIntegrations.refresh')}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-text-secondary">{t('ClientIntegrations.empty')}</div>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => (
              <div key={row.id} className="border rounded-lg p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-text-primary flex items-center gap-2">
                    {tp('ClientIntegrations.card.marketplaceAlt', {
                      id: formatMarketplaceLabel(
                        (row.marketplace_ids && row.marketplace_ids.length
                          ? row.marketplace_ids
                          : row.marketplace_id
                          ? [row.marketplace_id]
                          : [])
                      )
                    })}
                    <StatusBadge status={row.status} t={t} />
                  </div>
                  <div className="text-xs text-text-secondary">
                    {tp('ClientIntegrations.fields.added', { date: new Date(row.created_at).toLocaleString() })}
                    {row.last_synced_at && (
                      <>
                        {' · '}
                        {tp('ClientIntegrations.fields.lastSync', {
                          date: new Date(row.last_synced_at).toLocaleString()
                        })}
                      </>
                    )}
                  </div>
                  {row.last_error && (
                    <div className="text-xs text-red-600 mt-1">
                      {t('ClientIntegrations.fields.lastError')} {supportError}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeIntegration(row.integration_id || row.id)}
                  className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                >
                  <Unplug className="w-4 h-4" /> {t('ClientIntegrations.actions.disconnect')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
