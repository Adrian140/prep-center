import React, { useEffect, useMemo, useState } from 'react';
import { Link2, ExternalLink, CheckCircle, AlertTriangle, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const AMAZON_REGIONS = [
  { id: 'eu', label: 'Amazon EU', consentUrl: 'https://sellercentral-europe.amazon.com/apps/authorize/consent', marketplaceId: 'A13V1IB3VIYZZH' },
  { id: 'na', label: 'Amazon North America', consentUrl: 'https://sellercentral.amazon.com/apps/authorize/consent', marketplaceId: 'ATVPDKIKX0DER' },
  { id: 'jp', label: 'Amazon Japan', consentUrl: 'https://sellercentral-japan.amazon.com/apps/authorize/consent', marketplaceId: 'A1VC38T7YXB528' }
];

function StatusBadge({ status }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
        <CheckCircle className="w-3 h-3" /> Connected
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
      Pending
    </span>
  );
}

export default function ClientIntegrations() {
  const { user, profile } = useSupabaseAuth();
  const [region, setRegion] = useState('eu');
  const [stateToken] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const clientId = import.meta.env.VITE_SPAPI_CLIENT_ID || '';
  const redirectUri =
    import.meta.env.VITE_SPAPI_REDIRECT_URI || `${window.location.origin}/integrations/amazon/callback`;

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
    if (!clientId || !redirectUri || !statePayload) return '';
    const regionConfig = AMAZON_REGIONS.find((r) => r.id === region);
    if (!regionConfig) return '';
    const params = new URLSearchParams({
      application_id: clientId,
      state: statePayload,
      version: 'beta',
      redirect_uri: redirectUri
    });
    return `${regionConfig.consentUrl}?${params.toString()}`;
  }, [clientId, redirectUri, region, statePayload]);

  const loadIntegrations = async () => {
    if (!user?.id) return;
    setRefreshing(true);
    const { data, error } = await supabase
      .from('amazon_integrations')
      .select('id, marketplace_id, region, status, last_synced_at, created_at, last_error')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      setFlash(error.message);
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

  const removeIntegration = async (id) => {
    if (!window.confirm('Disconnect this Amazon account?')) return;
    setFlash('');
    const { error } = await supabase.from('amazon_integrations').delete().eq('id', id);
    if (error) {
      setFlash(error.message);
    } else {
      setFlash('Integration removed.');
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
          <h1 className="text-2xl font-semibold text-text-primary">Integrations</h1>
          <p className="text-sm text-text-secondary">
            Connect your Amazon Seller Central account to synchronize inventory automatically.
          </p>
        </div>
      </header>

      {!clientId && (
        <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
          Configure <code>VITE_SPAPI_CLIENT_ID</code> și <code>VITE_SPAPI_REDIRECT_URI</code> în `.env` pentru a activa
          butonul de autorizare.
        </div>
      )}

      {flash && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{flash}</div>
      )}

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Marketplace</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              {AMAZON_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => authorizeUrl && window.open(authorizeUrl, '_blank', 'noopener')}
            disabled={!authorizeUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
          >
            <ExternalLink className="w-4 h-4" /> Connect Amazon
          </button>
        </div>
        <p className="text-xs text-text-light">
          După ce autorizezi aplicația în Seller Central vei fi redirecționat înapoi în portal. Token-ul este salvat
          automat. Orice sincronizare usează rolul tău Amazon, nu îl vezi niciodată în clar.
        </p>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Connected accounts</h2>
            <p className="text-sm text-text-secondary">
              Poți revoca oricând accesul. Ultima sincronizare este afișată mai jos.
            </p>
          </div>
          <button
            onClick={loadIntegrations}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-text-secondary">No integrations yet.</div>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => (
              <div key={row.id} className="border rounded-lg p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-text-primary flex items-center gap-2">
                    Marketplace: {row.marketplace_id}
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="text-xs text-text-secondary">
                    Added: {new Date(row.created_at).toLocaleString()}
                    {row.last_synced_at && (
                      <>
                        {' · '}Last sync: {new Date(row.last_synced_at).toLocaleString()}
                      </>
                    )}
                  </div>
                  {row.last_error && (
                    <div className="text-xs text-red-600 mt-1">Last error: {row.last_error}</div>
                  )}
                </div>
                <button
                  onClick={() => removeIntegration(row.id)}
                  className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                >
                  <Unplug className="w-4 h-4" /> Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
