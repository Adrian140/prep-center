import React, { useEffect, useMemo, useState } from 'react';
import { Link2, ExternalLink, CheckCircle, AlertTriangle, Loader2, RefreshCw, Unplug, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';

const AMAZON_REGIONS = [
  { id: 'eu', consentUrl: 'https://sellercentral-europe.amazon.com/apps/authorize/consent', marketplaceId: 'A13V1IB3VIYZZH' },
  { id: 'na', consentUrl: 'https://sellercentral.amazon.com/apps/authorize/consent', marketplaceId: 'ATVPDKIKX0DER' },
  { id: 'jp', consentUrl: 'https://sellercentral-japan.amazon.com/apps/authorize/consent', marketplaceId: 'A1VC38T7YXB528' }
];

const PACKLINK_PORTALS = [
  { id: 'fr', label: 'Packlink PRO France', url: 'https://auth.packlink.com/fr-FR/pro/login?tenant_id=PACKLINKPROFR' },
  { id: 'com', label: 'Packlink PRO .com', url: 'https://auth.packlink.com/en-GB/pro/login?tenant_id=PACKLINKPRO' }
];

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
  const navigate = useNavigate();
  const supportError = t('common.supportError');
  const isIndividualAccount =
    (profile?.account_type || profile?.accountType || profile?.type) === 'individual';
  const [region, setRegion] = useState('eu');
  const [packlinkPortal, setPacklinkPortal] = useState('fr');
  const [packlinkKey, setPacklinkKey] = useState('');
  const [packlinkKeySavedAt, setPacklinkKeySavedAt] = useState('');
  const [packlinkSaving, setPacklinkSaving] = useState(false);
  const [packlinkMsg, setPacklinkMsg] = useState('');
  const [stateToken] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const clientId = import.meta.env.VITE_SPAPI_CLIENT_ID || '';
  const applicationId = import.meta.env.VITE_AMZ_APP_ID || clientId || '';
  const redirectUri =
    import.meta.env.VITE_SPAPI_REDIRECT_URI || `${window.location.origin}/auth/amazon/callback`;
  const packlinkPath = '/dashboard?tab=packlink';
  const packlinkPortalUrl =
    PACKLINK_PORTALS.find((p) => p.id === packlinkPortal)?.url || PACKLINK_PORTALS[0].url;

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
      .select('id, marketplace_id, region, status, last_synced_at, created_at, last_error')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      setFlash(supportError);
      setRows([]);
    } else {
      setFlash('');
      setRows(Array.isArray(data) ? data : []);
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    loadIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadPacklinkKey = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('packlink_credentials')
        .select('api_key, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && data?.api_key) {
        setPacklinkKey(data.api_key);
        setPacklinkKeySavedAt(data.updated_at || '');
      }
    };
    loadPacklinkKey();
  }, [user?.id]);

  const savePacklinkKey = async () => {
    if (!user?.id) return;
    if (!packlinkKey.trim()) {
      setPacklinkMsg('Add your Packlink API key first.');
      return;
    }
    setPacklinkSaving(true);
    setPacklinkMsg('');
    const { error, data } = await supabase
      .from('packlink_credentials')
      .upsert({ user_id: user.id, api_key: packlinkKey.trim() })
      .select('updated_at')
      .maybeSingle();
    if (error) {
      setPacklinkMsg('Could not save key. Please retry.');
    } else {
      setPacklinkMsg('Packlink key saved.');
      setPacklinkKeySavedAt(data?.updated_at || new Date().toISOString());
    }
    setPacklinkSaving(false);
  };

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
        </div>
        {isIndividualAccount && (
          <p className="text-sm text-red-600">{t('ClientIntegrations.individualBlocked')}</p>
        )}
        <p className="text-xs text-text-light">{t('ClientIntegrations.instructions')}</p>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-blue-50 text-blue-700">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Packlink PRO</h2>
            <p className="text-sm text-text-secondary">
              Book labels, compare services, and track shipments directly in the Packlink tab.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate(packlinkPath)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white"
          >
            <ExternalLink className="w-4 h-4" /> Open Packlink tab
          </button>
          <div className="flex items-center gap-2">
            <select
              value={packlinkPortal}
              onChange={(e) => setPacklinkPortal(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {PACKLINK_PORTALS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => window.open(packlinkPortalUrl, '_blank', 'noopener')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary"
            >
              <ExternalLink className="w-4 h-4" /> Open Packlink portal
            </button>
          </div>
          <p className="text-xs text-text-light">
            Use your own Packlink API key (Settings → Packlink PRO API key) to book labels from your account.
          </p>
        </div>
        <div className="border rounded-lg p-4 bg-gray-50/70 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-text-primary">Your Packlink API key</div>
              <p className="text-xs text-text-secondary">
                Paste the key from Packlink: Settings → Packlink PRO API key.
              </p>
            </div>
            {packlinkKeySavedAt && (
              <span className="text-[11px] text-text-light">
                Saved: {new Date(packlinkKeySavedAt).toLocaleString()}
              </span>
            )}
          </div>
          <input
            type="text"
            value={packlinkKey}
            onChange={(e) => setPacklinkKey(e.target.value)}
            placeholder="pk_live_..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={savePacklinkKey}
              disabled={packlinkSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
            >
              {packlinkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Save key
            </button>
            {packlinkMsg && <span className="text-xs text-text-secondary">{packlinkMsg}</span>}
          </div>
        </div>
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
                    {t('ClientIntegrations.card.marketplaceAlt', { id: row.marketplace_id })}
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
                  onClick={() => removeIntegration(row.id)}
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
