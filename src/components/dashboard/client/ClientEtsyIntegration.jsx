import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { supabaseHelpers } from '@/config/supabase';
import { useEtsyI18n } from '@/i18n/etsyI18n';

const PKCE_STORAGE_PREFIX = 'etsy_pkce_verifier:';
const ETSY_PROD_REDIRECT_URI = 'https://prep-center.eu/auth/etsy/callback';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const base64UrlEncode = (input) =>
  btoa(input)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomPkceVerifier = (length = 64) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
};

const sha256Base64Url = async (value) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(digest)));
};

const statusTone = (status) => {
  if (status === 'active' || status === 'connected') {
    return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  }
  if (status === 'error') {
    return 'bg-red-50 border-red-200 text-red-700';
  }
  return 'bg-amber-50 border-amber-200 text-amber-800';
};

export default function ClientEtsyIntegration({ user, profile }) {
  const { t, list } = useEtsyI18n();
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');

  const etsyClientId = import.meta.env.VITE_ETSY_CLIENT_ID || '';
  const etsyRedirectUri =
    import.meta.env.VITE_ETSY_REDIRECT_URI ||
    (import.meta.env.PROD ? ETSY_PROD_REDIRECT_URI : `${window.location.origin}/auth/etsy/callback`);
  const etsyOauthBaseUrl = (import.meta.env.VITE_ETSY_OAUTH_BASE_URL || 'https://www.etsy.com').replace(/\/$/, '');
  const etsyScopes = String(import.meta.env.VITE_ETSY_SCOPES || 'shops_r listings_r transactions_r').trim();
  const hasOauthConfig = Boolean(etsyClientId) && Boolean(etsyRedirectUri);

  const companyId = useMemo(
    () => profile?.company_id || profile?.companyId || user?.id || null,
    [profile?.company_id, profile?.companyId, user?.id]
  );

  const isConnected = integration?.status === 'connected' || integration?.status === 'active';

  const setSuccess = (message) => {
    setFlash(message);
    setFlashType('success');
  };

  const setError = (message) => {
    setFlash(message);
    setFlashType('error');
  };

  const loadIntegration = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabaseHelpers.getEtsyIntegrationForUser(user.id);
    if (error) {
      setIntegration(null);
      setError(error.message || t('client.flash.loadError'));
    } else {
      setIntegration(data || null);
      setFlash('');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadIntegration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const refreshAll = async () => {
    setRefreshing(true);
    await loadIntegration();
    setRefreshing(false);
  };

  const handleConnectEtsy = async () => {
    if (!user?.id) return;
    if (!hasOauthConfig) {
      setError(t('client.flash.missingOauth'));
      return;
    }

    setSaving(true);
    setFlash('');

    const payload = {
      id: integration?.id,
      user_id: user.id,
      company_id: companyId,
      status: 'pending',
      metadata: {
        ...(integration?.metadata || {}),
        oauth_configured: true,
        connected_from: 'client-dashboard',
        pending_oauth: true
      },
      last_error: null
    };

    const { data, error } = await supabaseHelpers.upsertEtsyIntegration(payload);
    if (error) {
      setError(error.message || t('client.flash.connectError'));
      setSaving(false);
      return;
    }

    const codeVerifier = randomPkceVerifier();
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(`${PKCE_STORAGE_PREFIX}${nonce}`, codeVerifier);

    const statePayload = {
      userId: user.id,
      companyId,
      integrationId: data?.id || null,
      redirectUri: etsyRedirectUri,
      nonce
    };
    const state = btoa(JSON.stringify(statePayload));
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: etsyClientId,
      redirect_uri: etsyRedirectUri,
      scope: etsyScopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    window.location.href = `${etsyOauthBaseUrl}/oauth/connect?${query.toString()}`;
  };

  const handleDisconnectEtsy = async () => {
    if (!integration?.id) return;
    if (!window.confirm(t('client.confirmDisconnect'))) return;

    const { data, error } = await supabaseHelpers.upsertEtsyIntegration({
      ...integration,
      status: 'disconnected',
      connected_at: null,
      last_error: null,
      metadata: {
        ...(integration?.metadata || {}),
        etsy_oauth: null
      }
    });

    if (error) {
      setError(error.message || t('client.flash.disconnectError'));
      return;
    }

    setIntegration(data || null);
    setSuccess(t('client.flash.disconnected'));
  };

  if (loading) {
    return (
      <section className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('client.loading')}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('client.title')}</h2>
            <p className="text-sm text-text-secondary">{t('client.desc')}</p>
          </div>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {t('client.actions.refresh')}
          </button>
        </div>

        <div className={`rounded-lg border p-3 text-sm ${statusTone(integration?.status)}`}>
          <div className="flex items-center gap-2 font-medium">
            {isConnected ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {isConnected ? t('client.statusConnected') : t('client.statusPending')}
          </div>
          <div className="mt-1 text-xs">
            {t('client.lastSync', { date: formatDateTime(integration?.last_synced_at) })} · {t('client.connectedAt', { date: formatDateTime(integration?.connected_at) })}
          </div>
          {integration?.last_error && <div className="mt-2 text-xs break-all">{integration.last_error}</div>}
        </div>

        {!hasOauthConfig && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            {t('client.flash.missingOauth')}
          </div>
        )}

        <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <div className="mb-2 font-semibold">{t('client.connectTitle')}</div>
          <ol className="list-decimal pl-5 space-y-1">
            {list('client.steps').map((step, index) => (
              <li key={`etsy-step-${index}`}>{step}</li>
            ))}
          </ol>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleConnectEtsy}
            disabled={saving || !hasOauthConfig}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isConnected ? t('client.actions.reconnect') : t('client.actions.connect')}
          </button>

          {isConnected && (
            <button
              onClick={handleDisconnectEtsy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50"
            >
              <Unplug className="w-4 h-4" /> {t('client.actions.disconnect')}
            </button>
          )}
        </div>

        <p className="text-xs text-text-secondary">{t('client.accountHint')}</p>

        {flash && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              flashType === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {flash}
          </div>
        )}
      </section>
    </div>
  );
}

export { PKCE_STORAGE_PREFIX };
