import React, { useEffect, useMemo, useState } from 'react';
import { Link2, ExternalLink, CheckCircle, AlertTriangle, RefreshCw, Unplug } from 'lucide-react';
import { supabase } from '@/config/supabase';

const AMAZON_REGIONS = [
  { id: 'eu', consentUrl: 'https://sellercentral-europe.amazon.com/apps/authorize/consent', marketplaceId: 'A13V1IB3VIYZZH' },
  { id: 'na', consentUrl: 'https://sellercentral.amazon.com/apps/authorize/consent', marketplaceId: 'ATVPDKIKX0DER' },
  { id: 'jp', consentUrl: 'https://sellercentral-japan.amazon.com/apps/authorize/consent', marketplaceId: 'A1VC38T7YXB528' }
];

const StatusBadge = ({ status }) => {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
        <CheckCircle className="w-3 h-3" /> Activ
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">
        <AlertTriangle className="w-3 h-3" /> Eroare
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
      Pending
    </span>
  );
};

const dateLabel = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function AdminClientIntegrations({ profile }) {
  const [region, setRegion] = useState('eu');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const [stateToken] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));

  const clientId = import.meta.env.VITE_SPAPI_CLIENT_ID || '';
  const applicationId = import.meta.env.VITE_AMZ_APP_ID || clientId || '';
  const redirectUri =
    import.meta.env.VITE_SPAPI_REDIRECT_URI || `${window.location.origin}/auth/amazon/callback`;

  const statePayload = useMemo(() => {
    if (!profile?.id) return '';
    const marketplace = AMAZON_REGIONS.find((r) => r.id === region)?.marketplaceId || 'A13V1IB3VIYZZH';
    const payload = {
      userId: profile.id,
      companyId: profile?.company_id || profile.id,
      region,
      marketplaceId: marketplace,
      redirectUri,
      nonce: stateToken
    };
    return btoa(JSON.stringify(payload));
  }, [profile?.id, profile?.company_id, region, stateToken, redirectUri]);

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

  const loadIntegrations = async () => {
    if (!profile?.id) return;
    setRefreshing(true);
    const { data, error } = await supabase
      .from('amazon_integrations')
      .select('id, marketplace_id, region, status, last_synced_at, created_at, last_error')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) {
      setFlash('Nu am putut încărca integrările. Încearcă din nou.');
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
  }, [profile?.id]);

  const handleAmazonConnect = () => {
    if (!authorizeUrl) return;
    window.open(authorizeUrl, '_blank', 'noopener');
  };

  const removeIntegration = async (id) => {
    if (!window.confirm('Confirmi deconectarea acestui marketplace?')) return;
    const { error } = await supabase.from('amazon_integrations').delete().eq('id', id);
    if (error) {
      setFlash('Nu am putut șterge integrarea. Încercă din nou.');
    } else {
      setFlash('Integrarea a fost eliminată.');
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
          <h2 className="text-xl font-semibold text-text-primary">Integrări Amazon</h2>
          <p className="text-sm text-text-secondary">
            Gestionezi autorizarea SP-API pentru clientul {profile?.email || profile?.store_name || ''}.
          </p>
        </div>
      </header>

      {flash && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">{flash}</div>
      )}

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Marketplace implicit</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              {AMAZON_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAmazonConnect}
            disabled={!authorizeUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
          >
            <ExternalLink className="w-4 h-4" /> Deschide autorizarea Amazon
          </button>
        </div>
        <p className="text-xs text-text-light">
          Se va deschide Seller Central într-o fereastră nouă. Autentifică-te cu datele clientului și finalizează
          autorizarea, apoi revino aici și apasă Refresh.
        </p>
      </section>

      <section className="bg-white border rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Marketplace-uri autorizate</h3>
            <p className="text-sm text-text-secondary">Status, ultimul sync și eventuale erori raportate.</p>
          </div>
          <button
            onClick={loadIntegrations}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-primary border border-primary rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-text-secondary">Se încarcă…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-text-secondary">Nicio integrare încă.</div>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="font-medium text-text-primary">
                    {row.marketplace_id || '—'} · Regiune: {row.region?.toUpperCase() || '—'}
                  </div>
                  <div className="text-xs text-text-secondary">
                    Ultimul sync: {dateLabel(row.last_synced_at)} · Creat: {dateLabel(row.created_at)}
                  </div>
                  {row.last_error && (
                    <div className="text-xs text-red-600 mt-1 break-all">
                      <AlertTriangle className="inline w-3 h-3 mr-1" />
                      {row.last_error}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={row.status} />
                  <button
                    onClick={() => removeIntegration(row.id)}
                    className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                  >
                    <Unplug className="w-4 h-4" /> Deconectează
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
