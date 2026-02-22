import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { supabaseHelpers } from '@/config/supabase';
import { useDashboardTranslation } from '@/translations';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

export default function ClientUpsIntegration({ user, profile }) {
  const { t } = useDashboardTranslation();
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');

  const upsClientId = import.meta.env.VITE_UPS_CLIENT_ID || '';
  const upsRedirectUri = import.meta.env.VITE_UPS_REDIRECT_URI || `${window.location.origin}/auth/ups/callback`;
  const upsBaseUrl = (import.meta.env.VITE_UPS_BASE_URL || import.meta.env.VITE_UPS_API_BASE_URL || 'https://onlinetools.ups.com').replace(/\/$/, '');
  const hasUpsOauthConfig = Boolean(upsClientId) && Boolean(upsRedirectUri);

  const effectiveCompanyId = useMemo(
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
    const { data, error } = await supabaseHelpers.getUpsIntegrationForUser(user.id);
    if (error) {
      setIntegration(null);
      setError(error.message || t('ClientIntegrations.ups.flash.loadError'));
    } else {
      setIntegration(data || null);
    }
    setLoading(false);
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await loadIntegration();
    setRefreshing(false);
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleConnectUps = async () => {
    if (!user?.id) return;
    if (!hasUpsOauthConfig) {
      setError(t('ClientIntegrations.ups.flash.missingOauth'));
      return;
    }

    setSaving(true);
    setFlash('');

    const payload = {
      id: integration?.id,
      user_id: user.id,
      company_id: effectiveCompanyId,
      status: 'pending',
      metadata: {
        ...(integration?.metadata || {}),
        oauth_configured: true,
        connected_from: 'client-dashboard',
        pending_oauth: true
      },
      last_error: null
    };

    const { data, error } = await supabaseHelpers.upsertUpsIntegration(payload);
    if (error) {
      setError(error.message || t('ClientIntegrations.ups.flash.connectError'));
      setSaving(false);
      return;
    }

    const statePayload = {
      userId: user.id,
      companyId: effectiveCompanyId,
      integrationId: data?.id || null,
      redirectUri: upsRedirectUri,
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`
    };
    const state = btoa(JSON.stringify(statePayload));
    const query = new URLSearchParams({
      client_id: upsClientId,
      redirect_uri: upsRedirectUri,
      response_type: 'code',
      state
    });
    const authorizeUrl = `${upsBaseUrl}/security/v1/oauth/authorize?${query.toString()}`;
    window.location.href = authorizeUrl;
  };

  const handleDisconnectUps = async () => {
    if (!integration?.id) return;
    if (!window.confirm(t('ClientIntegrations.ups.confirmDisconnect'))) return;

    const { data, error } = await supabaseHelpers.upsertUpsIntegration({
      ...integration,
      status: 'disconnected',
      connected_at: null,
      last_error: null,
      metadata: {
        ...(integration?.metadata || {}),
        ups_oauth: null
      }
    });

    if (error) {
      setError(error.message || t('ClientIntegrations.ups.flash.disconnectError'));
      return;
    }

    setIntegration(data || null);
    setSuccess(t('ClientIntegrations.ups.flash.disconnected'));
  };

  if (loading) {
    return (
      <section className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('ClientIntegrations.ups.loading')}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('ClientIntegrations.ups.title')}</h2>
            <p className="text-sm text-text-secondary">
              {t('ClientIntegrations.ups.desc')}
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {t('common.refresh')}
          </button>
        </div>

        {!hasUpsOauthConfig && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            {t('ClientIntegrations.ups.flash.missingOauth')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleConnectUps}
            disabled={saving || !hasUpsOauthConfig}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isConnected ? t('ClientIntegrations.ups.actions.reconnect') : t('ClientIntegrations.ups.actions.connect')}
          </button>

          {isConnected && (
            <button
              onClick={handleDisconnectUps}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50"
            >
              <Unplug className="w-4 h-4" /> {t('ClientIntegrations.ups.actions.disconnect')}
            </button>
          )}
        </div>

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
      </section>

      {isConnected && (
        <section className="bg-white border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-text-primary">UPS</h2>
          <p className="text-sm text-text-secondary mt-1">
            {t('ClientIntegrations.ups.connectedAt')}: {formatDateTime(integration?.connected_at)}
          </p>
          <p className="text-xs text-text-secondary mt-2">
            {t('ClientIntegrations.ups.accountHint')}
          </p>
        </section>
      )}
    </div>
  );
}
