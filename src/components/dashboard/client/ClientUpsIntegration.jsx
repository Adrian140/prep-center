import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { supabaseHelpers } from '@/config/supabase';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

export default function ClientUpsIntegration({ user, profile }) {
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
      setError(error.message || 'Nu am putut încărca integrarea UPS.');
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
      setError('Configurare OAuth UPS incompletă: setează VITE_UPS_CLIENT_ID și VITE_UPS_REDIRECT_URI.');
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
      setError(error.message || 'Conectarea UPS a eșuat.');
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
    if (!window.confirm('Confirmi deconectarea UPS pentru acest cont?')) return;

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
      setError(error.message || 'Nu am putut deconecta integrarea UPS.');
      return;
    }

    setIntegration(data || null);
    setSuccess('UPS a fost deconectat.');
  };

  if (loading) {
    return (
      <section className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă integrarea UPS...
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">UPS Connect</h2>
            <p className="text-sm text-text-secondary">
              Conectează contul UPS. Crearea etichetelor din client este dezactivată momentan.
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {!hasUpsOauthConfig && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            Configurare OAuth UPS incompletă: setează `VITE_UPS_CLIENT_ID` și `VITE_UPS_REDIRECT_URI`.
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
            {isConnected ? 'Reconnect UPS' : 'Connect UPS'}
          </button>

          {isConnected && (
            <button
              onClick={handleDisconnectUps}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50"
            >
              <Unplug className="w-4 h-4" /> Disconnect UPS
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
            Conectat la: {formatDateTime(integration?.connected_at)}
          </p>
          <p className="text-xs text-text-secondary mt-2">
            `Account Number` nu mai este obligatoriu pentru butonul de conectare. Îl putem adăuga ulterior doar unde e necesar la billing/label.
          </p>
        </section>
      )}
    </div>
  );
}
