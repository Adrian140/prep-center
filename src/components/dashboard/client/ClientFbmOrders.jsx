import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Package, MapPin, Truck, RefreshCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { extractTrackingFromLabelFile } from '@/utils/fbmTrackingExtraction';

const bucketName = 'fbm-order-files';
const FBM_MARKETS = [
  { id: 'A13V1IB3VIYZZH', label: 'France (FR)' },
  { id: 'A1PA6795UKMFR9', label: 'Germany (DE)' },
  { id: 'A1RKKUPIHCS9HS', label: 'Spain (ES)' },
  { id: 'APJ6JRA9NG5V4', label: 'Italy (IT)' }
];

const sanitizeFilename = (name = '') =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

const formatMoney = (amount, currency = 'EUR') => {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'EUR'
  }).format(num);
};

const isProcessedStatus = (status) => ['processing', 'ready', 'shipped'].includes(String(status || '').trim().toLowerCase());

export default function ClientFbmOrders() {
  const { profile } = useSupabaseAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settings, setSettings] = useState([]);
  const [selectedMarkets, setSelectedMarkets] = useState([]);
  const [acceptedConsent, setAcceptedConsent] = useState(false);
  const [statusFilter, setStatusFilter] = useState('unshipped');

  const createSignedUrl = async (path) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const { data, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signedError) return path;
    return data?.signedUrl || path;
  };

  const load = async () => {
    if (!profile?.company_id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    let query = supabase
      .from('fbm_orders')
      .select(`
        id,
        company_id,
        amazon_order_id,
        seller_order_id,
        amazon_order_status,
        local_status,
        sales_channel,
        shipment_service_level_category,
        order_total_amount,
        order_total_currency,
        purchase_date,
        latest_ship_date,
        recipient_name,
        buyer_name,
        buyer_email,
        buyer_phone,
        address_line_1,
        address_line_2,
        address_line_3,
        city,
        state_or_region,
        postal_code,
        country_code,
        address_phone,
        marketplace_country,
        tracking_number,
        carrier_name,
        carrier_code,
        shipping_method,
        fbm_order_items (
          id,
          stock_item_id,
          amazon_order_item_id,
          asin,
          sku,
          title,
          quantity_ordered,
          quantity_shipped,
          item_price_amount,
          item_price_currency
        ),
        fbm_order_files (
          id,
          order_item_id,
          file_type,
          file_name,
          storage_path,
          mime_type,
          created_at
        )
      `)
      .eq('company_id', profile.company_id)
      .order('purchase_date', { ascending: false })
      .limit(200);

    const { data, error: loadError } = await query;
    if (loadError) {
      setError(loadError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const allItems = (data || []).flatMap((row) => row.fbm_order_items || []);
    const stockIds = Array.from(new Set(allItems.map((item) => item.stock_item_id).filter(Boolean)));
    const asins = Array.from(new Set(allItems.map((item) => item.asin).filter(Boolean)));
    const stockMap = new Map();
    const stockByAsin = new Map();
    if (stockIds.length) {
      const { data: stockRows } = await supabase
        .from('stock_items')
        .select('id, asin, name, image_url')
        .in('id', stockIds);
      (stockRows || []).forEach((row) => {
        stockMap.set(row.id, row);
        if (row.asin && !stockByAsin.has(row.asin)) stockByAsin.set(row.asin, row);
      });
    }
    if (asins.length) {
      const { data: asinRows } = await supabase
        .from('stock_items')
        .select('id, asin, name, image_url')
        .in('asin', asins);
      (asinRows || []).forEach((row) => {
        if (row.id && !stockMap.has(row.id)) stockMap.set(row.id, row);
        if (row.asin && !stockByAsin.has(row.asin)) stockByAsin.set(row.asin, row);
      });
    }

    const signedRows = await Promise.all(
      (data || []).map(async (row) => ({
        ...row,
        fbm_order_items: (row.fbm_order_items || []).map((item) => ({
          ...item,
          stock_item:
            (item.stock_item_id ? stockMap.get(item.stock_item_id) || null : null) ||
            (item.asin ? stockByAsin.get(item.asin) || null : null)
        })),
        fbm_order_files: await Promise.all(
          (row.fbm_order_files || []).map(async (file) => ({
            ...file,
            signed_url: await createSignedUrl(file.storage_path)
          }))
        )
      }))
    );

    setRows(signedRows);
    setLoading(false);
  };

  const loadSettings = async () => {
    if (!profile?.company_id) {
      setSettings([]);
      setSelectedMarkets([]);
      setSettingsLoading(false);
      return;
    }
    setSettingsLoading(true);
    const { data, error: settingsError } = await supabase
      .from('fbm_order_sync_settings')
      .select('id, marketplace_id, enabled, consent_granted_at, consent_revoked_at')
      .eq('company_id', profile.company_id);
    if (settingsError) {
      setError(settingsError.message);
      setSettings([]);
      setSelectedMarkets([]);
    } else {
      const rows = Array.isArray(data) ? data : [];
      setSettings(rows);
      setSelectedMarkets(rows.filter((row) => row.enabled).map((row) => row.marketplace_id));
    }
    setSettingsLoading(false);
  };

  useEffect(() => {
    load();
    loadSettings();
  }, [profile?.company_id]);

  const enabledMarketplaces = useMemo(
    () => settings.filter((row) => row.enabled).map((row) => row.marketplace_id),
    [settings]
  );

  const hasConsent = enabledMarketplaces.length > 0;

  const saveSettings = async (enabled) => {
    if (!profile?.company_id) return;
    setSettingsSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const payload = FBM_MARKETS.map((market) => {
        const isEnabled = enabled.includes(market.id);
        return {
          company_id: profile.company_id,
          user_id: profile.id,
          marketplace_id: market.id,
          enabled: isEnabled,
          consent_granted_at: isEnabled ? now : null,
          consent_revoked_at: isEnabled ? null : now,
          consent_text_version: 'v1',
          updated_at: now
        };
      });
      const { error: upsertError } = await supabase
        .from('fbm_order_sync_settings')
        .upsert(payload, { onConflict: 'company_id,marketplace_id' });
      if (upsertError) throw upsertError;
      setAcceptedConsent(false);
      await loadSettings();
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save FBM access settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const activateSelected = async () => {
    if (!acceptedConsent || !selectedMarkets.length) {
      setError('Select at least one marketplace and confirm consent first.');
      return;
    }
    await saveSettings(selectedMarkets);
  };

  const revokeSelected = async () => {
    const remaining = enabledMarketplaces.filter((id) => !selectedMarkets.includes(id));
    await saveSettings(remaining);
  };

  const revokeAll = async () => {
    setSelectedMarkets([]);
    await saveSettings([]);
  };

  const uploadLabel = async (order, item, file) => {
    if (!file || !profile?.company_id) return;
    setSavingId(item.id);
    setError('');
    try {
      const safeName = sanitizeFilename(file.name);
      const path = `${profile.company_id}/${order.id}/${item.id}/${Date.now()}-${safeName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined
        });
      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await supabase
        .from('fbm_order_files')
        .insert({
          order_id: order.id,
          order_item_id: item.id,
          company_id: profile.company_id,
          file_type: 'shipping_label',
          file_name: file.name,
          storage_path: uploadData.path,
          mime_type: file.type || null,
          size_bytes: file.size || null,
          created_by: profile.id
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const signedUrl = await createSignedUrl(uploadData.path);
      const extractedTracking = await extractTrackingFromLabelFile(file);
      if (extractedTracking?.trackingNumber) {
        const { error: trackingError } = await supabase
          .from('fbm_orders')
          .update({
            tracking_number: extractedTracking.trackingNumber,
            carrier_code: extractedTracking.carrierCode || order.carrier_code || null,
            carrier_name: extractedTracking.carrierName || order.carrier_name || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id)
          .eq('company_id', profile.company_id);
        if (trackingError) throw trackingError;
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id !== order.id
            ? row
            : {
                ...row,
                tracking_number: extractedTracking?.trackingNumber || row.tracking_number || null,
                carrier_code: extractedTracking?.carrierCode || row.carrier_code || null,
                carrier_name: extractedTracking?.carrierName || row.carrier_name || null,
                fbm_order_files: [...(row.fbm_order_files || []), { ...inserted, signed_url: signedUrl }]
              }
        )
      );
    } catch (err) {
      setError(err?.message || 'Could not upload label.');
    } finally {
      setSavingId(null);
    }
  };

  const deleteOrder = async (order) => {
    const isUnshipped = String(order.amazon_order_status || '').trim().toLowerCase() === 'unshipped';
    if (!isUnshipped) {
      setError('Only unshipped FBM orders can be deleted.');
      return;
    }
    if (!window.confirm(`Delete FBM order ${order.amazon_order_id}? The sync can import it again later.`)) {
      return;
    }
    setSavingId(order.id);
    setError('');
    try {
      const storagePaths = (order.fbm_order_files || [])
        .map((file) => file.storage_path)
        .filter(Boolean);
      if (storagePaths.length) {
        const { error: storageError } = await supabase.storage.from(bucketName).remove(storagePaths);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase
        .from('fbm_orders')
        .delete()
        .eq('id', order.id)
        .eq('company_id', profile.company_id)
        .eq('amazon_order_status', 'Unshipped');
      if (deleteError) throw deleteError;

      setRows((prev) => prev.filter((row) => row.id !== order.id));
    } catch (err) {
      setError(err?.message || 'Could not delete FBM order.');
    } finally {
      setSavingId(null);
    }
  };

  const deleteLabel = async (order, file) => {
    if (!file?.id) return;
    if (!window.confirm(`Delete label ${file.file_name || 'file'}?`)) {
      return;
    }
    setSavingId(file.id);
    setError('');
    try {
      if (file.storage_path) {
        const { error: storageError } = await supabase.storage.from(bucketName).remove([file.storage_path]);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase
        .from('fbm_order_files')
        .delete()
        .eq('id', file.id)
        .eq('company_id', profile.company_id);
      if (deleteError) throw deleteError;

      setRows((prev) =>
        prev.map((row) =>
          row.id !== order.id
            ? row
            : {
                ...row,
                fbm_order_files: (row.fbm_order_files || []).filter((entry) => entry.id !== file.id)
              }
        )
      );
    } catch (err) {
      setError(err?.message || 'Could not delete label.');
    } finally {
      setSavingId(null);
    }
  };

  const orderCards = useMemo(() => rows || [], [rows]);
  const activeOrders = useMemo(
    () => orderCards.filter((order) => String(order.amazon_order_status || '').trim().toLowerCase() === 'unshipped'),
    [orderCards]
  );
  const historyOrders = useMemo(
    () => orderCards.filter((order) => isProcessedStatus(order.local_status)),
    [orderCards]
  );
  const visibleOrders = statusFilter === 'shipped' ? historyOrders : activeOrders;

  const renderOrderCard = (order) => (
    <div key={order.id} className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Package className="h-5 w-5 text-sky-600" />
            {order.recipient_name || 'Recipient unavailable'}
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {[
              order.address_line_1,
              order.address_line_2,
              order.address_line_3,
              [order.postal_code, order.city].filter(Boolean).join(' '),
              order.state_or_region,
              order.country_code
            ]
              .filter(Boolean)
              .map((line) => (
                <div key={`${order.id}-${line}`}>{line}</div>
              ))}
          </div>
          <div className="text-xs text-slate-500">
            Amazon order: <span className="font-semibold">{order.amazon_order_id}</span>
          </div>
          <div className="text-xs text-slate-500">
            Sales channel: <span className="font-semibold">{order.sales_channel || order.marketplace_country || '—'}</span>
          </div>
          {order.seller_order_id ? (
            <div className="text-xs text-slate-500">
              Seller order: <span className="font-semibold">{order.seller_order_id}</span>
            </div>
          ) : null}
          {order.buyer_name || order.buyer_phone || order.buyer_email || order.address_phone ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div>
                Buyer: <span className="font-semibold text-slate-800">{order.buyer_name || '—'}</span>
              </div>
              <div>
                Phone:{' '}
                <span className="font-semibold text-slate-800">
                  {order.buyer_phone || order.address_phone || '—'}
                </span>
              </div>
              <div>
                Email: <span className="font-semibold text-slate-800">{order.buyer_email || '—'}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Truck className="h-4 w-4 text-emerald-600" />
            Service
          </div>
          <div className="text-sm text-slate-600">
            {order.shipment_service_level_category || '—'}
          </div>
          <div className="text-xs text-slate-500">Purchase: {formatDateTime(order.purchase_date)}</div>
          <div className="text-xs text-slate-500">Ship by: {formatDateTime(order.latest_ship_date)}</div>
          <div className="text-xs text-slate-500">
            Total: {formatMoney(order.order_total_amount, order.order_total_currency)}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPin className="h-4 w-4 text-amber-600" />
            Status
          </div>
          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {order.local_status || order.amazon_order_status || 'pending'}
          </div>
          <div className="text-xs text-slate-500">Amazon: {order.amazon_order_status || '—'}</div>
          <div className="text-xs text-slate-500">
            Tracking: {order.tracking_number || 'Not sent yet'}
          </div>
          {String(order.amazon_order_status || '').trim().toLowerCase() === 'unshipped' ? (
            <button
              type="button"
              onClick={() => deleteOrder(order)}
              disabled={savingId === order.id}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {savingId === order.id ? 'Deleting...' : 'Delete order'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="px-2 py-2">Contents</th>
              <th className="px-2 py-2 text-red-600">Qty</th>
              <th className="px-2 py-2">Price</th>
              <th className="px-2 py-2">Stock link</th>
              <th className="px-2 py-2">Shipping label</th>
            </tr>
          </thead>
          <tbody>
            {(order.fbm_order_items || []).map((item) => {
              const files = (order.fbm_order_files || []).filter(
                (file) => file.order_item_id === item.id && file.file_type === 'shipping_label'
              );
              return (
                <tr key={item.id} className="border-b align-top last:border-b-0">
                  <td className="px-2 py-3">
                    <div className="flex items-start gap-3">
                      {item.stock_item?.image_url ? (
                        <img
                          src={item.stock_item.image_url}
                          alt={item.stock_item?.name || item.title || 'Product image'}
                          className="h-12 w-12 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg border bg-slate-100" />
                      )}
                      <div>
                        <div className="font-medium text-slate-900">
                          {item.stock_item?.name || item.title || 'Untitled item'}
                        </div>
                        <div className="text-xs text-slate-500">ASIN {item.asin || '—'}</div>
                        <div className="text-xs text-slate-500">SKU {item.sku || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-base font-bold text-red-600">{item.quantity_ordered || 0}</td>
                  <td className="px-2 py-3">
                    {formatMoney(item.item_price_amount, item.item_price_currency)}
                  </td>
                  <td className="px-2 py-3 text-xs text-slate-600">
                    {item.stock_item_id ? `Linked #${item.stock_item_id}` : 'Not linked yet'}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" />
                        {savingId === item.id ? 'Uploading...' : 'Upload label'}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          disabled={savingId === item.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              uploadLabel(order, item, file);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {files.map((file) => (
                        <div key={file.id} className="flex items-center gap-2">
                          <a
                            href={file.signed_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {file.file_name || 'Shipping label'}
                          </a>
                          <button
                            type="button"
                            onClick={() => deleteLabel(order, file)}
                            disabled={savingId === file.id}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            aria-label={`Delete ${file.file_name || 'shipping label'}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">FBM Orders</h2>
          <p className="text-sm text-text-secondary">
            Commandes Amazon seller-fulfilled cu adresă, conținut și etichete per item.
          </p>
          {hasConsent ? (
            <div className="mt-3 inline-flex rounded-xl border bg-white p-1 shadow-sm">
              {[
                { id: 'unshipped', label: 'Unshipped' },
                { id: 'shipped', label: 'Shipped' }
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    statusFilter === option.id
                      ? 'bg-primary text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasConsent ? (
            <button
              type="button"
              onClick={revokeAll}
              disabled={settingsSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Revoke access
            </button>
          ) : null}
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!hasConsent ? (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">FBM order access</h3>
            <p className="text-sm text-slate-600">
              Enable the Amazon marketplaces from which you want us to import seller-fulfilled orders
              into PrepCenter. We will store order details, shipping addresses and uploaded labels so
              your team can prepare and process these orders inside our system.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {FBM_MARKETS.map((market) => (
              <label
                key={market.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selectedMarkets.includes(market.id)}
                  disabled={settingsLoading || settingsSaving}
                  onChange={(e) => {
                    setSelectedMarkets((prev) =>
                      e.target.checked
                        ? Array.from(new Set([...prev, market.id]))
                        : prev.filter((id) => id !== market.id)
                    );
                  }}
                />
                <span>{market.label}</span>
              </label>
            ))}
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={acceptedConsent}
              disabled={settingsSaving}
              onChange={(e) => setAcceptedConsent(e.target.checked)}
            />
            <span>
              I confirm that I authorize PrepCenter to import my Amazon FBM orders for the selected
              marketplaces and use the order data only for fulfillment operations. I understand that I
              can revoke this access at any time.
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={activateSelected}
              disabled={settingsLoading || settingsSaving || !selectedMarkets.length}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {settingsSaving ? 'Saving...' : 'Enable FBM Orders'}
            </button>
            <button
              type="button"
              onClick={revokeSelected}
              disabled={settingsLoading || settingsSaving || !selectedMarkets.length}
              className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Disable selected
            </button>
            <button
              type="button"
              onClick={revokeAll}
              disabled={settingsLoading || settingsSaving || !hasConsent}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            >
              Revoke all access
            </button>
          </div>

          <div className="text-xs text-slate-500">
            Active marketplaces:{' '}
            {enabledMarketplaces.length
              ? FBM_MARKETS.filter((market) => enabledMarketplaces.includes(market.id))
                  .map((market) => market.label)
                  .join(', ')
              : 'none'}
          </div>
        </div>
      </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-text-secondary">
          Loading FBM orders...
        </div>
      ) : null}

      {!loading && hasConsent && !visibleOrders.length ? (
        <div className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-text-secondary">
          {statusFilter === 'shipped' ? 'No shipped FBM orders yet.' : 'No unshipped FBM orders.'}
        </div>
      ) : null}

      {!loading && !hasConsent ? (
        <div className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-text-secondary">
          Enable at least one marketplace above to allow FBM order import.
        </div>
      ) : null}

      {!loading && hasConsent && visibleOrders.length ? (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">
            {statusFilter === 'shipped' ? 'Shipped orders' : 'Unshipped orders'}
          </div>
          {visibleOrders.map(renderOrderCard)}
        </div>
      ) : null}
    </div>
  );
}
