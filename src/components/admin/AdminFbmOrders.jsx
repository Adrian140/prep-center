import React, { useEffect, useState } from 'react';
import { RefreshCcw, Truck, MapPin, Package, Trash2 } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useMarket } from '@/contexts/MarketContext';
import { normalizeMarketCode } from '@/utils/market';

const bucketName = 'fbm-order-files';

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

const statusOptions = ['pending', 'processing', 'ready', 'shipped', 'cancelled'];
const isProcessedStatus = (status) => ['processing', 'ready', 'shipped'].includes(String(status || '').trim().toLowerCase());

export default function AdminFbmOrders() {
  const { currentMarket } = useMarket();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
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
    setLoading(true);
    setError('');
    let query = supabase
      .from('fbm_orders')
      .select(`
        id,
        company_id,
        user_id,
        amazon_order_id,
        seller_order_id,
        amazon_order_status,
        local_status,
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
        tracking_number,
        carrier_name,
        carrier_code,
        shipping_method,
        fbm_order_items (
          id,
          stock_item_id,
          asin,
          sku,
          title,
          quantity_ordered,
          item_price_amount,
          item_price_currency
        ),
        fbm_order_files (
          id,
          order_item_id,
          file_type,
          file_name,
          storage_path
        )
      `)
      .order('purchase_date', { ascending: false })
      .limit(200);

    const marketCode = normalizeMarketCode(currentMarket);
    if (marketCode) {
      query = query.eq('marketplace_country', marketCode);
    }

    const { data, error: loadError } = await query;
    if (loadError) {
      setError(loadError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const userIds = Array.from(new Set((data || []).map((row) => row.user_id).filter(Boolean)));
    const profileMap = new Map();
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, company_name, store_name, email')
        .in('id', userIds);
      (profiles || []).forEach((profile) => profileMap.set(profile.id, profile));
    }

    const signedRows = await Promise.all(
      (data || []).map(async (row) => ({
        ...row,
        profile: row.user_id ? profileMap.get(row.user_id) || null : null,
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

  useEffect(() => {
    load();
  }, [currentMarket]);

  const activeRows = rows.filter((row) => String(row.amazon_order_status || '').trim().toLowerCase() === 'unshipped');
  const historyRows = rows.filter((row) => isProcessedStatus(row.local_status));
  const visibleRows = statusFilter === 'shipped' ? historyRows : activeRows;

  const updateStatus = async (row, localStatus) => {
    setSavingId(row.id);
    setError('');
    const { error: updateError } = await supabase
      .from('fbm_orders')
      .update({ local_status: localStatus, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      setRows((prev) =>
        prev.map((entry) => (entry.id === row.id ? { ...entry, local_status: localStatus } : entry))
      );
    }
    setSavingId(null);
  };

  const deleteOrder = async (row) => {
    const isUnshipped = String(row.amazon_order_status || '').trim().toLowerCase() === 'unshipped';
    if (!isUnshipped) {
      setError('Only unshipped FBM orders can be deleted.');
      return;
    }
    if (!window.confirm(`Delete FBM order ${row.amazon_order_id}? The sync can import it again later.`)) {
      return;
    }
    setSavingId(row.id);
    setError('');
    try {
      const storagePaths = (row.fbm_order_files || [])
        .map((file) => file.storage_path)
        .filter(Boolean);
      if (storagePaths.length) {
        const { error: storageError } = await supabase.storage.from(bucketName).remove(storagePaths);
        if (storageError) throw storageError;
      }

      const { error: deleteError } = await supabase
        .from('fbm_orders')
        .delete()
        .eq('id', row.id)
        .eq('amazon_order_status', 'Unshipped');
      if (deleteError) throw deleteError;

      setRows((prev) => prev.filter((entry) => entry.id !== row.id));
    } catch (err) {
      setError(err?.message || 'Could not delete FBM order.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">FBM Orders</h2>
          <p className="text-sm text-text-secondary">
            Commandes seller-fulfilled din Amazon, cu adrese, produse și etichetele încărcate de client.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border bg-white p-1">
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

      {loading ? (
        <div className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-text-secondary">
          Loading FBM orders...
        </div>
      ) : null}

      {!loading && !visibleRows.length ? (
        <div className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-text-secondary">
          {statusFilter === 'shipped' ? 'No shipped FBM orders yet.' : 'No unshipped FBM orders.'}
        </div>
      ) : null}

      {!loading && visibleRows.length ? (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">
            {statusFilter === 'shipped' ? 'Shipped orders' : 'Unshipped orders'}
          </div>
          {visibleRows.map((row) => {
          const customerName =
            row.profile?.store_name ||
            row.profile?.company_name ||
            [row.profile?.first_name, row.profile?.last_name].filter(Boolean).join(' ') ||
            row.profile?.email ||
            'Unknown client';
          return (
            <div key={row.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_0.8fr]">
                <div className="space-y-2">
                  <div className="text-base font-semibold text-slate-900">{customerName}</div>
                  <div className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin className="mt-0.5 h-4 w-4 text-amber-600" />
                    <div>
                      <div className="font-medium text-slate-900">{row.recipient_name || 'Recipient unavailable'}</div>
                      {[row.address_line_1, row.address_line_2, row.address_line_3].filter(Boolean).map((line) => (
                        <div key={`${row.id}-${line}`}>{line}</div>
                      ))}
                      <div>{[row.postal_code, row.city].filter(Boolean).join(' ')}</div>
                      <div>{[row.state_or_region, row.country_code].filter(Boolean).join(' ')}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">Amazon order: {row.amazon_order_id}</div>
                  {row.buyer_name || row.buyer_phone || row.buyer_email || row.address_phone ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <div>
                        Buyer: <span className="font-semibold text-slate-800">{row.buyer_name || '—'}</span>
                      </div>
                      <div>
                        Phone:{' '}
                        <span className="font-semibold text-slate-800">
                          {row.buyer_phone || row.address_phone || '—'}
                        </span>
                      </div>
                      <div>
                        Email: <span className="font-semibold text-slate-800">{row.buyer_email || '—'}</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-semibold text-slate-800">
                    <Truck className="h-4 w-4 text-emerald-600" />
                    Shipping
                  </div>
                  <div>Service: {row.shipment_service_level_category || '—'}</div>
                  <div>Purchase: {formatDateTime(row.purchase_date)}</div>
                  <div>Ship by: {formatDateTime(row.latest_ship_date)}</div>
                  <div>Total: {formatMoney(row.order_total_amount, row.order_total_currency)}</div>
                  <div>Tracking: {row.tracking_number || 'Not sent yet'}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-800">Prep status</div>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={row.local_status || 'pending'}
                    disabled={savingId === row.id}
                    onChange={(e) => updateStatus(row, e.target.value)}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-500">Amazon: {row.amazon_order_status || '—'}</div>
                  {String(row.amazon_order_status || '').trim().toLowerCase() === 'unshipped' ? (
                    <button
                      type="button"
                      onClick={() => deleteOrder(row)}
                      disabled={savingId === row.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {savingId === row.id ? 'Deleting...' : 'Delete order'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-2 py-2">Contents</th>
                      <th className="px-2 py-2">Qty</th>
                      <th className="px-2 py-2">Price</th>
                      <th className="px-2 py-2">Stock link</th>
                      <th className="px-2 py-2">Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(row.fbm_order_items || []).map((item) => {
                      const files = (row.fbm_order_files || []).filter((file) => file.order_item_id === item.id);
                      return (
                        <tr key={item.id} className="border-b align-top last:border-b-0">
                          <td className="px-2 py-3">
                            <div className="font-medium text-slate-900">{item.title || 'Untitled item'}</div>
                            <div className="text-xs text-slate-500">ASIN {item.asin || '—'}</div>
                            <div className="text-xs text-slate-500">SKU {item.sku || '—'}</div>
                          </td>
                          <td className="px-2 py-3">{item.quantity_ordered || 0}</td>
                          <td className="px-2 py-3">{formatMoney(item.item_price_amount, item.item_price_currency)}</td>
                          <td className="px-2 py-3 text-xs text-slate-600">
                            {item.stock_item_id ? `Linked #${item.stock_item_id}` : 'Not linked yet'}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex flex-col gap-1">
                              {files.length ? (
                                files.map((file) => (
                                  <a
                                    key={file.id}
                                    href={file.signed_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary hover:underline"
                                  >
                                    {file.file_name || file.file_type || 'File'}
                                  </a>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400">No files</span>
                              )}
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
          })}
        </div>
      ) : null}
    </div>
  );
}
