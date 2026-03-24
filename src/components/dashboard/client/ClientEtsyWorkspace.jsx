import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, Package, RefreshCw, Store, Truck } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabaseHelpers } from '@/config/supabase';
import { useEtsyI18n } from '@/i18n/etsyI18n';

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
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

export default function ClientEtsyWorkspace() {
  const { user, profile } = useSupabaseAuth();
  const { t } = useEtsyI18n();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const [integration, setIntegration] = useState(null);
  const [orders, setOrders] = useState([]);
  const [listings, setListings] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const companyId = profile?.company_id || profile?.id || null;

  const load = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    setFlash('');
    const [integrationRes, ordersRes, listingsRes, trackingRes] = await Promise.all([
      supabaseHelpers.getEtsyIntegrationForUser(user.id),
      supabaseHelpers.listEtsyOrders({ userId: user.id, companyId, limit: 100 }),
      supabaseHelpers.listEtsyShopListings({ userId: user.id, companyId, limit: 100 }),
      supabaseHelpers.listEtsyTrackingEvents({ userId: user.id, companyId, limit: 100 })
    ]);
    const err = integrationRes.error || ordersRes.error || listingsRes.error || trackingRes.error;
    if (err) {
      setFlash(err.message || t('client.flash.loadError'));
      setIntegration(null);
      setOrders([]);
      setListings([]);
      setTracking([]);
    } else {
      setIntegration(integrationRes.data || null);
      setOrders(ordersRes.data || []);
      setListings(listingsRes.data || []);
      setTracking(trackingRes.data || []);
      setSelectedOrderId((prev) => prev || ordersRes.data?.[0]?.id || null);
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, companyId]);

  const metrics = useMemo(() => {
    const totalRevenue = orders.reduce((sum, row) => sum + (Number(row?.grandtotal_amount) || 0), 0);
    return {
      orders: orders.length,
      listings: listings.length,
      tracking: tracking.length,
      revenue: totalRevenue
    };
  }, [orders, listings, tracking]);

  useEffect(() => {
    if (!orders.length) {
      setSelectedOrderId(null);
      return;
    }
    const exists = orders.some((row) => row.id === selectedOrderId);
    if (!exists) setSelectedOrderId(orders[0].id);
  }, [orders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => orders.find((row) => row.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId]
  );

  const visibleTracking = useMemo(() => {
    if (!selectedOrder?.id) return tracking.slice(0, 8);
    return tracking.filter((row) => row.order_id === selectedOrder.id);
  }, [tracking, selectedOrder]);

  if (loading) {
    return (
      <section className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('client.loading')}
        </div>
      </section>
    );
  }

  if (!integration) {
    return (
      <section className="bg-white border rounded-xl p-5 text-sm text-text-secondary">
        {t('client.statusPending')}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {flash && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{flash}</div>
      )}

      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">{t('client.title')}</h2>
            <p className="text-sm text-text-secondary">{t('client.panelSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('client.actions.refresh')}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="h-4 w-4" />
            {t('client.statusConnected')}
          </div>
          <div className="mt-1 text-sm">
            {t('client.lastSync', { date: formatDateTime(integration?.last_synced_at) })} · {t('client.connectedAt', { date: formatDateTime(integration?.connected_at) })}
          </div>
          <div className="mt-1 text-xs text-emerald-800">
            {integration?.shop_name || integration?.shop_id || 'Etsy'} {integration?.shop_url ? `· ${integration.shop_url}` : ''}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-text-secondary">Orders</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{metrics.orders}</div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-text-secondary">Listings</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{metrics.listings}</div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-text-secondary">Tracking events</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{metrics.tracking}</div>
        </div>
        <div className="rounded-xl border bg-white p-5">
          <div className="text-xs uppercase tracking-wide text-text-secondary">Revenue</div>
          <div className="mt-2 text-3xl font-semibold text-text-primary">{money(metrics.revenue, orders[0]?.currency_code || 'EUR')}</div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr,1fr]">
        <div className="rounded-xl border bg-white">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <Package className="h-4 w-4 text-orange-500" />
            <h3 className="text-lg font-semibold text-text-primary">Recent Etsy Orders</h3>
          </div>
          {orders.length === 0 ? (
            <div className="p-5 text-sm text-text-secondary">No Etsy orders synced yet.</div>
          ) : (
            <div className="divide-y">
              {orders.slice(0, 12).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedOrderId(row.id)}
                  className={`block w-full px-5 py-4 text-left transition-colors ${
                    selectedOrder?.id === row.id ? 'bg-orange-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-text-primary">
                        Receipt #{row.receipt_id || '—'} · {row.shop_name || row.shop_id || 'Etsy'}
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">
                        {row.status_label || row.status || 'N/A'} · {formatDateTime(row.order_created_at)}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        Track ID: {row.tracking_code || '—'} · Shipped: {formatDateTime(row.shipped_at)}
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium text-text-primary">
                      {money(row.grandtotal_amount, row.currency_code || 'EUR')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border bg-white">
            <div className="flex items-center gap-2 border-b px-5 py-4">
              <Store className="h-4 w-4 text-sky-600" />
              <h3 className="text-lg font-semibold text-text-primary">Etsy Listings</h3>
            </div>
            {listings.length === 0 ? (
              <div className="p-5 text-sm text-text-secondary">No Etsy listings synced yet.</div>
            ) : (
              <div className="divide-y">
                {listings.slice(0, 8).map((row) => (
                  <div key={row.id} className="flex gap-3 px-5 py-4">
                    {row.image_url ? (
                      <img
                        src={row.image_url}
                        alt={row.title || `Listing ${row.listing_id}`}
                        className="h-16 w-16 rounded-lg border object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-slate-50 text-xs text-slate-400">
                        No image
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary">{row.title || `Listing #${row.listing_id}`}</div>
                      <div className="mt-1 text-sm text-text-secondary">
                        SKU: {row.sku || '—'} · Qty: {row.quantity ?? 0} · {money(row.price_amount, row.currency_code || 'EUR')}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        Listing ID: {row.listing_id} {row.url ? `· ${row.url}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-white">
            <div className="flex items-center gap-2 border-b px-5 py-4">
              <Truck className="h-4 w-4 text-emerald-600" />
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Tracking Timeline</h3>
                {selectedOrder ? (
                  <p className="text-xs text-text-secondary">
                    Selected receipt #{selectedOrder.receipt_id || '—'} · Track ID {selectedOrder.tracking_code || '—'}
                  </p>
                ) : null}
              </div>
            </div>
            {visibleTracking.length === 0 ? (
              <div className="p-5 text-sm text-text-secondary">No tracking events synced yet.</div>
            ) : (
              <div className="divide-y">
                {visibleTracking.slice(0, 8).map((row) => (
                  <div key={row.id} className="px-5 py-4">
                    <div className="font-medium text-text-primary">{row.status_label || row.status || 'Tracking update'}</div>
                    <div className="mt-1 text-sm text-text-secondary">
                      Track ID: {row.tracking_code || '—'} · {formatDateTime(row.event_time)}
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      {row.location || 'Unknown location'}{row.status_detail ? ` · ${row.status_detail}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
