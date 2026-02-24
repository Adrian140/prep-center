import React, { useEffect, useMemo, useState } from 'react';
import { Link2, ExternalLink, CheckCircle, AlertTriangle, Loader2, RefreshCw, Unplug, Lock, ChevronDown } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';
import ClientUpsIntegration from './ClientUpsIntegration';

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

function IntegrationPanel({
  id,
  title,
  subtitle,
  logo,
  fallbackLogo,
  openId,
  onToggle,
  children
}) {
  const open = openId === id;
  const [imgSrc, setImgSrc] = useState(logo);

  useEffect(() => {
    setImgSrc(logo);
  }, [logo]);

  return (
    <section className="bg-white border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
      >
        <img
          src={imgSrc}
          alt={title}
          onError={() => {
            if (fallbackLogo && imgSrc !== fallbackLogo) setImgSrc(fallbackLogo);
          }}
          className="w-20 h-14 rounded-lg object-contain border bg-white p-1"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="text-sm text-text-secondary truncate">{subtitle}</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
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
  const [flashType, setFlashType] = useState('error');
  const [refreshing, setRefreshing] = useState(false);
  const [qogitaFlash, setQogitaFlash] = useState('');
  const [showQogitaModal, setShowQogitaModal] = useState(false);
  const [qogitaEmail, setQogitaEmail] = useState('');
  const [qogitaPassword, setQogitaPassword] = useState('');
  const [qogitaLoading, setQogitaLoading] = useState(false);
  const [qogitaConnections, setQogitaConnections] = useState([]);
  const [qogitaListLoading, setQogitaListLoading] = useState(true);
  const [qogitaRefreshing, setQogitaRefreshing] = useState(false);
  const [pbEmail, setPbEmail] = useState('');
  const [pbStatus, setPbStatus] = useState('pending');
  const [pbLastError, setPbLastError] = useState('');
  const [pbLoading, setPbLoading] = useState(true);
  const [pbSaving, setPbSaving] = useState(false);
  const [pbIntegration, setPbIntegration] = useState(null);
  const [ppToken, setPpToken] = useState('');
  const [ppStatus, setPpStatus] = useState('pending');
  const [ppLastError, setPpLastError] = useState('');
  const [ppLoading, setPpLoading] = useState(true);
  const [ppSaving, setPpSaving] = useState(false);
  const [openIntegration, setOpenIntegration] = useState('ups');

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
      setFlashType('error');
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
      setFlashType('error');
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

  const loadQogitaConnections = async () => {
    if (!user?.id) return;
    setQogitaListLoading(true);
    const { data, error } = await supabase
      .from('qogita_connections')
      .select('id, user_id, qogita_email, status, expires_at, last_sync_at, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) {
      setQogitaFlash(t('ClientIntegrations.qogita.error'));
      setQogitaConnections([]);
    } else {
      setQogitaFlash('');
      setQogitaConnections(data || []);
    }
    setQogitaListLoading(false);
  };

  useEffect(() => {
    loadQogitaConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  useEffect(() => {
    const loadPrepBusiness = async () => {
      if (!user?.id) {
        setPbLoading(false);
        setPpLoading(false);
        return;
      }
      setPbLoading(true);
      setPbLastError('');
      const defaultEmail =
        profile?.email ||
        profile?.contact_email ||
        profile?.company_email ||
        '';
      const { data, error } = await supabase
        .from('prep_business_integrations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        setPbIntegration(null);
        setPbEmail(defaultEmail);
        setPbStatus('pending');
        setPbLastError(error.message || supportError);
        setPpToken('');
        setPpStatus('pending');
        setPpLastError(error.message || supportError);
      } else if (data) {
        setPbIntegration(data);
        setPbEmail(data.email_prep_business || data.email_arbitrage_one || defaultEmail);
        setPbStatus(data.status || 'pending');
        setPbLastError(data.last_error || '');
        setPpToken(data.profit_path_token_id || '');
        setPpStatus(data.status || 'pending');
        setPpLastError(data.last_error || '');
      } else {
        setPbIntegration(null);
        setPbEmail(defaultEmail);
        setPbStatus('pending');
        setPbLastError('');
        setPpToken('');
        setPpStatus('pending');
        setPpLastError('');
      }
      setPbLoading(false);
      setPpLoading(false);
    };
    loadPrepBusiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.email, profile?.contact_email, profile?.company_email]);

  const removeIntegration = async (id) => {
    if (!window.confirm(t('ClientIntegrations.confirmDisconnect'))) return;
    setFlash('');
    const { error } = await supabase.from('amazon_integrations').delete().eq('id', id);
    if (error) {
      setFlash(supportError);
      setFlashType('error');
    } else {
      setFlash(t('ClientIntegrations.flashRemoved'));
      setFlashType('success');
      loadIntegrations();
    }
  };

  const removeAllIntegrations = async () => {
    const companyId = profile?.company_id || user?.id || null;
    if (!companyId) {
      setFlash('Nu am putut identifica company_id pentru a șterge conexiunile.');
      setFlashType('error');
      return;
    }
    const message = [
      'Deconectezi TOATE marketplace-urile Amazon pentru acest cont.',
      'Se vor șterge toate înregistrările amazon_integrations pentru companie.',
      'Continui?'
    ].join('\n');
    if (!window.confirm(message)) return;
    setFlash('');
    const { error } = await supabase.from('amazon_integrations').delete().eq('company_id', companyId);
    if (error) {
      setFlash(supportError);
      setFlashType('error');
    } else {
      setFlash('Toate conexiunile Amazon au fost deconectate. Reconectează pentru token nou.');
      setFlashType('success');
      loadIntegrations();
    }
  };

  const handleQogitaConnect = () => {
    setQogitaFlash('');
    setShowQogitaModal(true);
  };

  const submitQogitaConnect = async () => {
    if (!qogitaEmail || !qogitaPassword) {
      setQogitaFlash(t('ClientIntegrations.qogita.error'));
      return;
    }
    setQogitaLoading(true);
    setQogitaFlash('');
    const { error, data } = await supabase.functions.invoke('qogita-connect', {
      body: { email: qogitaEmail, password: qogitaPassword, user_id: user?.id }
    });
    if (error) {
      setQogitaFlash(`${t('ClientIntegrations.qogita.error')} ${error.message || ''}`.trim());
    } else {
      setQogitaFlash(t('ClientIntegrations.qogita.success'));
      setShowQogitaModal(false);
      setQogitaEmail('');
      setQogitaPassword('');
      console.debug('Qogita connect response', data);
      loadQogitaConnections();
    }
    setQogitaLoading(false);
  };

  const removeQogitaConnection = async (id) => {
    if (!window.confirm(t('ClientIntegrations.confirmDisconnect'))) return;
    setQogitaRefreshing(true);
    const { error } = await supabase.from('qogita_connections').delete().eq('id', id);
    if (error) {
      setQogitaFlash(t('ClientIntegrations.qogita.error'));
    } else {
      setQogitaFlash(t('ClientIntegrations.flashRemoved'));
      loadQogitaConnections();
    }
    setQogitaRefreshing(false);
  };

  const handleSavePrepBusiness = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    setPbSaving(true);
    setPbLastError('');
    const pb = (pbEmail || profile?.email || '').trim().toLowerCase();
    if (!pb) {
      setPbLastError('PrepBusiness email is required.');
      setPbSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('prep_business_integrations')
      .upsert(
        {
          id: pbIntegration?.id,
          user_id: user.id,
          company_id: profile?.company_id || null,
          email_arbitrage_one: pb,
          email_prep_business: pb,
          profit_path_token_id: (ppToken || '').trim() || pbIntegration?.profit_path_token_id || null,
          status: pbIntegration?.status || 'pending',
          last_error: null,
          updated_at: new Date().toISOString(),
          created_at: pbIntegration?.created_at || new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      setPbLastError(error.message || supportError);
    } else {
      setPbIntegration(data);
      setPbStatus(data?.status || 'pending');
      setPbLastError('');
      setFlash('PrepBusiness integration saved. We will map and sync receptions automatically.');
      setFlashType('success');
    }
    setPbSaving(false);
  };

  const handleSaveProfitPath = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    setPpSaving(true);
    setPpLastError('');
    const token = (ppToken || '').trim();
    if (!token) {
      setPpLastError('Profit Path token ID is required.');
      setPpSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('prep_business_integrations')
      .upsert(
        {
          id: pbIntegration?.id,
          user_id: user.id,
          company_id: profile?.company_id || null,
          email_arbitrage_one:
            pbIntegration?.email_arbitrage_one ||
            ((pbEmail || profile?.email || '').trim().toLowerCase() || null),
          email_prep_business:
            pbIntegration?.email_prep_business ||
            ((pbEmail || profile?.email || '').trim().toLowerCase() || null),
          profit_path_token_id: token,
          status: pbIntegration?.status || 'pending',
          last_error: null,
          updated_at: new Date().toISOString(),
          created_at: pbIntegration?.created_at || new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      setPpLastError(error.message || supportError);
    } else {
      setPbIntegration(data);
      setPbStatus(data?.status || 'pending');
      setPpStatus(data?.status || 'pending');
      setPpLastError('');
      setFlash('Profit Path integration saved. We will use this token for sync.');
      setFlashType('success');
    }
    setPpSaving(false);
  };

  return (
    <div className="space-y-6 relative">
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
        <div
          className={`p-3 rounded-lg text-sm ${
            flashType === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {flash}
        </div>
      )}

      <IntegrationPanel
        id="amazon"
        title={t('ClientIntegrations.amazonTitle', 'Amazon Seller Central')}
        subtitle={t('ClientIntegrations.instructions')}
        logo="https://logo.clearbit.com/amazon.com"
        fallbackLogo="/branding/integrations/amazon.svg"
        openId={openIntegration}
        onToggle={(id) => setOpenIntegration((prev) => (prev === id ? '' : id))}
      >
      <section className="border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {t('ClientIntegrations.amazonTitle', 'Amazon Seller Central')}
            </h2>
            <p className="text-sm text-text-secondary">{t('ClientIntegrations.instructions')}</p>
          </div>
          <button
            onClick={loadIntegrations}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {t('ClientIntegrations.refresh')}
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-3">
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
          </div>
          <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-text-secondary bg-gray-50">
            <div className="font-semibold text-text-primary mb-1">{t('ClientIntegrations.listTitle')}</div>
            <p>{t('ClientIntegrations.listDesc')}</p>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
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
        </div>
      </section>
      </IntegrationPanel>

      <IntegrationPanel
        id="arbitrage-one"
        title={t('ClientIntegrations.prepbusiness.title')}
        subtitle={t('ClientIntegrations.prepbusiness.desc')}
        logo="https://logo.clearbit.com/arbitrageone.de"
        fallbackLogo="/branding/integrations/arbitrage-one.svg"
        openId={openIntegration}
        onToggle={(id) => setOpenIntegration((prev) => (prev === id ? '' : id))}
      >
      <section className="border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {t('ClientIntegrations.prepbusiness.title')}
            </h2>
            <p className="text-sm text-text-secondary">
              {t('ClientIntegrations.prepbusiness.desc')}
            </p>
          </div>
          <div className="text-sm">
            {pbStatus === 'active' || pbStatus === 'mapped' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle className="w-4 h-4" /> Active
              </span>
            ) : pbStatus === 'error' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700">
                <AlertTriangle className="w-4 h-4" /> Error
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                <Loader2 className="w-4 h-4" /> Pending
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSavePrepBusiness} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              {t('ClientIntegrations.prepbusiness.emailLabel')}
            </label>
            <input
              type="email"
              value={pbEmail}
              onChange={(e) => setPbEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
              placeholder={t('ClientIntegrations.prepbusiness.emailPlaceholder')}
              required
            />
          </div>
          <div className="md:col-span-2 text-sm text-text-secondary space-y-1">
            <p>{t('ClientIntegrations.prepbusiness.clientStep')}</p>
            <p>{t('ClientIntegrations.prepbusiness.teamStep')}</p>
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-3 items-center">
            <button
              type="submit"
              disabled={pbSaving || pbLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
            >
              {pbSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {t('ClientIntegrations.prepbusiness.save')}
            </button>
            <p className="text-xs text-text-secondary">
              {t('ClientIntegrations.prepbusiness.helper')}
            </p>
          </div>
        </form>

        {pbLastError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{pbLastError}</div>
        )}

      </section>
      </IntegrationPanel>

      <IntegrationPanel
        id="ups"
        title="UPS"
        subtitle="Conectare, etichete și facturi UPS"
        logo="https://logo.clearbit.com/ups.com"
        fallbackLogo="/branding/integrations/ups.svg"
        openId={openIntegration}
        onToggle={(id) => setOpenIntegration((prev) => (prev === id ? '' : id))}
      >
        <ClientUpsIntegration user={user} profile={profile} />
      </IntegrationPanel>

      <IntegrationPanel
        id="profit-path"
        title="Profit Path"
        subtitle="Conectează token-ul de client pentru sincronizare."
        logo="/branding/integrations/profit-path.svg"
        fallbackLogo="/branding/integrations/profit-path.svg"
        openId={openIntegration}
        onToggle={(id) => setOpenIntegration((prev) => (prev === id ? '' : id))}
      >
      <section className="border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Profit Path</h2>
            <p className="text-sm text-text-secondary">
              Introdu token ID-ul primit din Profit Path pentru a activa sincronizarea.
            </p>
          </div>
          <div className="text-sm">
            {ppStatus === 'active' || ppStatus === 'mapped' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle className="w-4 h-4" /> Active
              </span>
            ) : ppStatus === 'error' ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700">
                <AlertTriangle className="w-4 h-4" /> Error
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                <Loader2 className="w-4 h-4" /> Pending
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveProfitPath} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Profit Path token ID</label>
            <input
              type="text"
              value={ppToken}
              onChange={(e) => setPpToken(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
              placeholder="Ex: pp_live_..."
              required
            />
          </div>
          <div className="md:col-span-2 text-sm text-text-secondary space-y-1">
            <p>Token-ul este folosit de sistem pentru maparea și sincronizarea comenzilor tale.</p>
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-3 items-center">
            <button
              type="submit"
              disabled={ppSaving || ppLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
            >
              {ppSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save token
            </button>
          </div>
        </form>

        {ppLastError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{ppLastError}</div>
        )}

      </section>
      </IntegrationPanel>

      <IntegrationPanel
        id="qogita"
        title={t('ClientIntegrations.qogita.title')}
        subtitle={t('ClientIntegrations.qogita.desc')}
        logo="https://logo.clearbit.com/qogita.com"
        fallbackLogo="/branding/integrations/qogita.svg"
        openId={openIntegration}
        onToggle={(id) => setOpenIntegration((prev) => (prev === id ? '' : id))}
      >
      <section className="border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('ClientIntegrations.qogita.title')}</h2>
            <p className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.desc')}</p>
          </div>
          <button onClick={handleQogitaConnect} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white">
            <ExternalLink className="w-4 h-4" /> {t('ClientIntegrations.qogita.connect')}
          </button>
        </div>
        {qogitaFlash && (
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">{qogitaFlash}</div>
        )}
        <p className="text-xs text-text-light">{t('ClientIntegrations.qogita.instructions')}</p>

        <div className="border-t pt-4 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('ClientIntegrations.qogita.listTitle')}</h3>
            <p className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.listDesc')}</p>
          </div>
          {qogitaListLoading ? (
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
            </div>
          ) : qogitaConnections.length === 0 ? (
            <div className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.empty')}</div>
          ) : (
            <div className="grid gap-3">
              {qogitaConnections.map((row) => (
                <div key={row.id} className="border rounded-lg p-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-text-primary">{row.qogita_email}</div>
                      <StatusBadge status={row.status || 'active'} t={t} />
                    </div>
                    <div className="text-xs text-text-secondary">
                      {tp('ClientIntegrations.fields.added', {
                        date: new Date(row.created_at).toLocaleString()
                      })}
                      {row.last_sync_at && (
                        <>
                          {' · '}
                          {tp('ClientIntegrations.fields.lastSync', {
                            date: new Date(row.last_sync_at).toLocaleString()
                          })}
                        </>
                      )}
                      {row.expires_at && (
                        <>
                          {' · '}
                          {t('ClientIntegrations.qogita.expires', 'Expires')}: {new Date(row.expires_at).toLocaleString()}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeQogitaConnection(row.id)}
                    disabled={qogitaRefreshing}
                    className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700 mt-2 sm:mt-0"
                  >
                    <Unplug className="w-4 h-4" /> {t('ClientIntegrations.actions.disconnect')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      </IntegrationPanel>

      {showQogitaModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{t('ClientIntegrations.qogita.modalTitle')}</h3>
                <p className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.modalDesc')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.emailLabel')}</span>
                <input
                  type="email"
                  value={qogitaEmail}
                  onChange={(e) => setQogitaEmail(e.target.value)}
                  className="border rounded-lg px-3 py-2"
                  placeholder="you@example.com"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.passwordLabel')}</span>
                <input
                  type="password"
                  value={qogitaPassword}
                  onChange={(e) => setQogitaPassword(e.target.value)}
                  className="border rounded-lg px-3 py-2"
                  placeholder="••••••••"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowQogitaModal(false);
                  setQogitaEmail('');
                  setQogitaPassword('');
                }}
                className="px-4 py-2 rounded-lg border text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitQogitaConnect}
                disabled={qogitaLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
              >
                {qogitaLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {qogitaLoading ? t('ClientIntegrations.qogita.submitting') : t('ClientIntegrations.qogita.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
