import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, Save, Store } from 'lucide-react';
import { supabaseHelpers } from '@/config/supabase';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
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
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');
  const [form, setForm] = useState({
    shop_name: '',
    shop_url: '',
    shop_id: ''
  });

  const companyId = useMemo(
    () => profile?.company_id || profile?.companyId || user?.id || null,
    [profile?.company_id, profile?.companyId, user?.id]
  );

  const isConnected = integration?.status === 'active' || integration?.status === 'connected';

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
      setError(error.message || 'Nu am putut încărca integrarea Etsy.');
    } else {
      setIntegration(data || null);
      setForm({
        shop_name: data?.shop_name || '',
        shop_url: data?.shop_url || '',
        shop_id: data?.shop_id || ''
      });
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

  const handleSave = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    setFlash('');

    const shopName = String(form.shop_name || '').trim();
    const shopUrl = String(form.shop_url || '').trim();
    const shopId = String(form.shop_id || '').trim();

    if (!shopName && !shopUrl && !shopId) {
      setError('Completează cel puțin Shop name, Shop URL sau Shop ID.');
      setSaving(false);
      return;
    }

    const { data, error } = await supabaseHelpers.upsertEtsyIntegration({
      id: integration?.id,
      user_id: user.id,
      company_id: companyId,
      status: isConnected ? integration?.status : 'pending',
      shop_name: shopName || null,
      shop_url: shopUrl || null,
      shop_id: shopId || null,
      etsy_user_id: integration?.etsy_user_id || null,
      access_scopes: Array.isArray(integration?.access_scopes) ? integration.access_scopes : [],
      connected_at: integration?.connected_at || null,
      last_synced_at: integration?.last_synced_at || null,
      last_error: null,
      metadata: {
        ...(integration?.metadata || {}),
        key_status: 'pending_personal_approval',
        requested_from: 'client-dashboard',
        requested_at: new Date().toISOString()
      }
    });

    if (error) {
      setError(error.message || 'Nu am putut salva Etsy.');
    } else {
      setIntegration(data || null);
      setSuccess(
        data?.status === 'active'
          ? 'Integrarea Etsy a fost actualizată.'
          : 'Cererea Etsy a fost salvată. După activarea cheii API, autorizăm shop-ul și pornim sync-ul.'
      );
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <section className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă Etsy...
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Etsy</h2>
            <p className="text-sm text-text-secondary">
              Integrare separată pentru shop Etsy, comenzi, track ID și statusuri de livrare.
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className={`rounded-lg border p-3 text-sm ${statusTone(integration?.status)}`}>
          <div className="flex items-center gap-2 font-medium">
            {isConnected ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {isConnected ? 'Etsy connected' : 'Etsy pending setup'}
          </div>
          <div className="mt-1 text-xs">
            Ultimul sync: {formatDateTime(integration?.last_synced_at)} · Conectat: {formatDateTime(integration?.connected_at)}
          </div>
          {integration?.last_error && <div className="mt-2 text-xs break-all">{integration.last_error}</div>}
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <div className="font-semibold mb-2">Pașii clientului</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Completează datele shop-ului Etsy mai jos.</li>
            <li>Păstrează shop-ul activ și verifică numele exact al shop-ului din Etsy Shop Manager.</li>
            <li>După aprobarea cheii API Etsy, autorizăm shop-ul și pornim sync pentru orders, listings și tracking.</li>
            <li>După primul sync, în `Products` apare secțiunea `Etsy` cu order history, quantities, receipt ID și track ID.</li>
          </ol>
        </div>

        <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Shop name</span>
            <input
              type="text"
              value={form.shop_name}
              onChange={(e) => setForm((prev) => ({ ...prev, shop_name: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="ecomprephub"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Shop URL</span>
            <input
              type="url"
              value={form.shop_url}
              onChange={(e) => setForm((prev) => ({ ...prev, shop_url: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="https://www.etsy.com/shop/..."
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">Shop ID</span>
            <input
              type="text"
              value={form.shop_id}
              onChange={(e) => setForm((prev) => ({ ...prev, shop_id: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="numeric sau slug"
            />
          </label>
          <div className="md:col-span-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvează Etsy
            </button>
            <div className="text-xs text-text-secondary">
              Salvăm cererea separat de UPS. Shop-ul Etsy devine activ după aprobarea cheii și autorizarea OAuth.
            </div>
          </div>
        </form>

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

      <section className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-text-primary font-semibold">
          <Store className="w-4 h-4" /> Ce se vede după activare
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-text-secondary">
          <div className="rounded-lg border p-3">
            În Products / Etsy apar listing-urile Etsy legate de produs, comenzile recente, cantitățile vândute și shop-ul sursă.
          </div>
          <div className="rounded-lg border p-3">
            În admin apare tab separat `Etsy`, unde vezi toate comenzile, receipt ID, tracking code, tracking status și timeline-ul de livrare.
          </div>
        </div>
      </section>
    </div>
  );
}
