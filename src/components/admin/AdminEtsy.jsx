import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Package, RefreshCw, Store } from 'lucide-react';
import { supabaseHelpers } from '@/config/supabase';
import { supabase } from '@/config/supabase';

const fmt = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const money = (amount, currency = 'EUR') => {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
};

function StatusBadge({ status }) {
  if (status === 'active' || status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
        <CheckCircle className="h-3 w-3" /> Active
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
        <AlertTriangle className="h-3 w-3" /> Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
      Pending
    </span>
  );
}

export default function AdminEtsy() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const [integrations, setIntegrations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [trackingEvents, setTrackingEvents] = useState([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('');

  const selectedIntegration = useMemo(
    () => integrations.find((row) => row.id === selectedIntegrationId) || integrations[0] || null,
    [integrations, selectedIntegrationId]
  );

  const visibleOrders = useMemo(() => {
    if (!selectedIntegration?.id) return orders;
    return orders.filter((row) => row.integration_id === selectedIntegration.id);
  }, [orders, selectedIntegration?.id]);

  const visibleTracking = useMemo(() => {
    const orderIds = new Set(visibleOrders.map((row) => row.id));
    return trackingEvents.filter((row) => orderIds.has(row.order_id));
  }, [trackingEvents, visibleOrders]);

  const load = async () => {
    setRefreshing(true);
    setFlash('');
    const [integrationsRes, ordersRes, trackingRes] = await Promise.all([
      supabaseHelpers.listEtsyIntegrations(),
      supabaseHelpers.listEtsyOrders({ limit: 300 }),
      supabaseHelpers.listEtsyTrackingEvents({ limit: 500 })
    ]);
    const err = integrationsRes.error || ordersRes.error || trackingRes.error;
    if (err) {
      setFlash(err.message || 'Nu am putut încărca Etsy.');
      setIntegrations([]);
      setOrders([]);
      setTrackingEvents([]);
    } else {
      setIntegrations(integrationsRes.data || []);
      setOrders(ordersRes.data || []);
      setTrackingEvents(trackingRes.data || []);
      if (!selectedIntegrationId && integrationsRes.data?.[0]?.id) {
        setSelectedIntegrationId(integrationsRes.data[0].id);
      }
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('admin-etsy-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etsy_integrations' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etsy_orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etsy_tracking_events' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Etsy</h2>
          <p className="text-sm text-text-secondary">
            Overview separat pentru shop-uri Etsy, comenzi, receipt ID, track ID și tracking status.
          </p>
        </div>
      </header>

      {flash && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{flash}</div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-text-secondary">Integrations</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{integrations.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-text-secondary">Orders</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{orders.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-text-secondary">Tracking Events</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{trackingEvents.length}</div>
        </div>
      </section>

      <section className="rounded-xl border bg-white">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Shop-uri Etsy conectate</h3>
            <p className="text-sm text-text-secondary">Selectezi shop-ul și vezi tot ce ține de comenzile lui.</p>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-text-secondary">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Se încarcă Etsy Admin...
          </div>
        ) : integrations.length === 0 ? (
          <div className="p-6 text-sm text-text-secondary">Nicio integrare Etsy încă.</div>
        ) : (
          <div className="divide-y">
            {integrations.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedIntegrationId(row.id)}
                className={`flex w-full flex-wrap items-center justify-between gap-4 px-5 py-4 text-left ${
                  selectedIntegration?.id === row.id ? 'bg-sky-50' : 'hover:bg-gray-50'
                }`}
              >
                <div>
                  <div className="font-medium text-text-primary">
                    {row.shop_name || row.shop_id || 'Shop Etsy'} · {row.shop_url || 'URL lipsă'}
                  </div>
                  <div className="text-xs text-text-secondary">
                    User: {row.user_id || '—'} · Last sync: {fmt(row.last_synced_at)}
                  </div>
                  {row.last_error && <div className="mt-1 text-xs text-red-600 break-all">{row.last_error}</div>}
                </div>
                <StatusBadge status={row.status} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr,0.9fr]">
        <div className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <h3 className="text-lg font-semibold text-text-primary">Comenzi Etsy</h3>
            <p className="text-sm text-text-secondary">
              Receipt ID, total, shop, tracking code și status live din tabelele Etsy.
            </p>
          </div>
          {visibleOrders.length === 0 ? (
            <div className="p-6 text-sm text-text-secondary">Nicio comandă Etsy pentru shop-ul selectat.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left">Receipt ID</th>
                    <th className="px-4 py-3 text-left">Shop</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Track ID</th>
                    <th className="px-4 py-3 text-left">Tracking status</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="px-4 py-3 font-mono text-xs">{row.receipt_id}</td>
                      <td className="px-4 py-3">{row.shop_name || row.shop_id || '—'}</td>
                      <td className="px-4 py-3">
                        <div>{row.status_label || row.status || '—'}</div>
                        <div className="text-xs text-text-secondary">{row.buyer_name || row.recipient_name || '—'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.tracking_code || '—'}</td>
                      <td className="px-4 py-3">{row.tracking_status_label || row.tracking_status || '—'}</td>
                      <td className="px-4 py-3">
                        <div>{fmt(row.order_created_at)}</div>
                        <div className="text-xs text-text-secondary">Shipped: {fmt(row.shipped_at)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{money(row.grandtotal_amount, row.currency_code || 'EUR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <h3 className="text-lg font-semibold text-text-primary">Tracking timeline</h3>
            <p className="text-sm text-text-secondary">Ultimele evenimente pentru track ID-urile Etsy.</p>
          </div>
          {visibleTracking.length === 0 ? (
            <div className="p-6 text-sm text-text-secondary">Nu există încă evenimente de tracking.</div>
          ) : (
            <div className="divide-y">
              {visibleTracking.map((row) => (
                <div key={row.id} className="flex items-start gap-3 px-5 py-4">
                  <div className="mt-1 rounded-full bg-sky-100 p-2 text-sky-700">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-text-primary">{row.status_label || row.status || 'Tracking update'}</div>
                      <div className="font-mono text-xs text-text-secondary">{row.tracking_code || '—'}</div>
                    </div>
                    <div className="mt-1 text-sm text-text-secondary">
                      {row.status_detail || 'Fără detalii suplimentare'}
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      {fmt(row.event_time)} · {row.location || 'Location necunoscut'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
