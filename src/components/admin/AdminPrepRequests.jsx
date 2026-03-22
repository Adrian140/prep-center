import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseHelpers } from '../../config/supabase';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Trash2, X } from 'lucide-react';
import AdminPrepRequestDetail from './AdminPrepRequestDetail';
import { tabSessionStorage, readJSON, writeJSON } from '@/utils/tabStorage';
import DestinationBadge from '@/components/common/DestinationBadge';
import { useMarket } from '@/contexts/MarketContext';
import { useAdminPrepRequestsTranslation } from '@/i18n/useAdminPrepRequestsTranslation';

const STORAGE_KEY = 'admin-prep-requests-state';
const ASIN_QUERY_RE = /^[A-Z0-9]{10}$/;

const parseRequestedUnits = (item) => {
  const value = Number(
    item?.units_requested ??
      item?.units ??
      item?.qty ??
      item?.quantity ??
      0
  );
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const getPendingItemsSummary = (row) => {
  const items = Array.isArray(row?.prep_request_items) ? row.prep_request_items : [];
  const uniqueSkus = new Set();
  let unitsTotal = 0;

  items.forEach((item) => {
    const sku = String(item?.sku || '').trim();
    const asin = String(item?.asin || '').trim();
    const uniqueKey = sku || asin || '';
    if (uniqueKey) uniqueSkus.add(uniqueKey.toUpperCase());
    unitsTotal += parseRequestedUnits(item);
  });

  return { skuCount: uniqueSkus.size, unitsTotal };
};

const StatusPill = ({ s, label }) => {
  const map = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  return <span className={`px-2 py-1 rounded text-xs ${map[s] || 'bg-gray-100 text-gray-700'}`}>{label || s}</span>;
};

export default function AdminPrepRequests() {
  const { currentMarket } = useMarket();
  const { t, tp, locale } = useAdminPrepRequestsTranslation();
  const persistedRef = useRef(null);
  if (persistedRef.current === null) {
    persistedRef.current = readJSON(tabSessionStorage, STORAGE_KEY, {});
  }
  const initialState = persistedRef.current || {};
  const initialPage = Number(initialState.page) > 0 ? Number(initialState.page) : 1;

  const [status, setStatus] = useState(initialState.status || 'all'); // all | pending | confirmed | cancelled
  const [q, setQ] = useState(initialState.q || '');             // căutare simplă
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(initialPage);
  const pageSize = 10;
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(initialState.selectedId || null); // request id pt. detail
  const [selectedView, setSelectedView] = useState(initialState.selectedView || 'detail');
  const [flash, setFlash] = useState('');
  const firstLoadRef = useRef(true);
  const initialPageRef = useRef(initialPage);
  const trimmedQuery = q.trim();
  const isAsinSearch = useMemo(() => ASIN_QUERY_RE.test(String(trimmedQuery || '').toUpperCase()), [trimmedQuery]);

 const handleDelete = async (row) => {
  const shortId = row.id?.slice(0, 8) || row.id;
  const clientLabel =
    [row.client_company_name, row.client_name, row.company_name].filter(Boolean).join(' / ') ||
    row.user_email ||
    'client';
  const basePrompt = tp('list.deleteConfirm.base', { clientLabel });
  const firstPrompt =
    row.status === 'confirmed'
      ? tp('list.deleteConfirm.confirmed', { base: basePrompt, shortId })
      : tp('list.deleteConfirm.normal', { base: basePrompt, shortId });

  if (!confirm(firstPrompt)) return;

  if (row.status === 'confirmed') {
    const secondPrompt = tp('list.deleteConfirm.confirmedSecond', { shortId });
    if (!confirm(secondPrompt)) return;
  }

  setFlash('');
  try {
    const { error } = await supabaseHelpers.deletePrepRequest(row.id);
    if (error) throw error;
    await load(1); // sau load(page) dacă preferi să rămâi pe pagină
    setFlash(t('list.flash.requestDeleted'));
  } catch (e) {
    setFlash(e?.message || t('list.flash.deleteFailed'));
  }
};

 const load = async (p = 1) => {
  setLoading(true);
  setFlash('');
  try {
    const { data, error } = await supabaseHelpers.listPrepRequests({
      status: status === 'all' ? undefined : status,
      warehouseCountry: isAsinSearch ? undefined : currentMarket
    });
    if (error) throw error;

    const list = Array.isArray(data) ? data : [];
    setRows(list);
    setPage(p);
  } catch (e) {
    console.error('listPrepRequests failed:', e?.message || e);
    setRows([]);
    setFlash(e?.message || t('list.flash.loadError'));
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    load(initialPageRef.current);
    firstLoadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstLoadRef.current) return;
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentMarket, isAsinSearch]);

  useEffect(() => {
    if (firstLoadRef.current) return;
    setPage(1);
  }, [trimmedQuery]);

  useEffect(() => {
    writeJSON(tabSessionStorage, STORAGE_KEY, { status, q, page, selectedId, selectedView });
  }, [status, q, page, selectedId, selectedView]);

  const STATUS_PRIORITY = { pending: 0, confirmed: 1, cancelled: 2 };

  const filtered = useMemo(() => {
    const tokens = trimmedQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const matchesSearch = (row) => {
      if (!tokens.length) return true;
      const snapshot = row?.amazon_snapshot || {};
      const requestItems = Array.isArray(row?.prep_request_items) ? row.prep_request_items : [];
      const step2Shipments = Array.isArray(row?.step2_shipments) ? row.step2_shipments : [];
      const step2Text = step2Shipments
        .map((shipment) => {
          if (!shipment) return '';
          return [
            shipment.shipmentId,
            shipment.shipment_id,
            shipment.amazonShipmentId,
            shipment.amazon_shipment_id,
            shipment.shipmentConfirmationId,
            shipment.packingGroupId,
            shipment.name,
          ]
            .filter(Boolean)
            .join(' ');
        })
        .filter(Boolean)
        .join(' ');
      const trackingText = (Array.isArray(row?.prep_request_tracking) ? row.prep_request_tracking : [])
        .map((entry) => entry?.tracking_id)
        .filter(Boolean)
        .join(' ');
      const itemsText = requestItems
        .map((item) => [item?.asin, item?.sku, item?.product_name].filter(Boolean).join(' '))
        .filter(Boolean)
        .join(' ');
      const fields = [
        row.id,
        row.user_email,
        row.company_name,
        row.store_name,
        row.client_company_name,
        row.client_name,
        row.destination_country,
        row.status,
        row.fba_shipment_id,
        row.amazon_reference_id,
        row.amazon_shipment_name,
        row.amazon_destination_code,
        row.amazon_status,
        snapshot.shipment_id,
        snapshot.reference_id,
        snapshot.shipment_reference_id,
        snapshot.shipment_name,
        snapshot.destination_code,
        snapshot.status,
        step2Text,
        trackingText,
        itemsText,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

      return tokens.every((t) => fields.some((f) => f.includes(t)));
    };

    const base = rows.filter((row) => matchesSearch(row));

    const shippingSortTs = (row) =>
      new Date(
        row.step4_confirmed_at ||
          row.step2_confirmed_at ||
          row.completed_at ||
          row.confirmed_at ||
          row.created_at ||
          0
      ).getTime();

    return base
      .slice()
      .sort((a, b) => {
        if (isAsinSearch) {
          return shippingSortTs(b) - shippingSortTs(a);
        }
        const pa = STATUS_PRIORITY[a.status] ?? 99;
        const pb = STATUS_PRIORITY[b.status] ?? 99;
        if (pa !== pb) return pa - pb;
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        return tb - ta;
      })
      .map((row) => row);
  }, [rows, trimmedQuery, isAsinSearch]);

  const totalBase = filtered.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(1, totalBase) / pageSize));
  const displayRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const handlePageChange = (next) => {
    setPage(next);
  };

  if (selectedId) {
    return (
        <AdminPrepRequestDetail
        requestId={selectedId}
        onBack={() => setSelectedId(null)}
        onChanged={() => load(page)}
        openWizard={selectedView === 'shipping'}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('list.title')}</h2>
        <button onClick={() => load(page)} className="inline-flex items-center gap-2 px-3 py-2 border rounded">
          <RefreshCw className="w-4 h-4" /> {t('list.refresh')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="pl-9 pr-9 py-2 w-80 border rounded-lg"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              aria-label={t('list.clearSearch')}
              title={t('list.clearSearch')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-secondary" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded px-2 py-2"
          >
            <option value="all">{t('list.filters.all')}</option>
            <option value="pending">{t('status.pending')}</option>
            <option value="confirmed">{t('status.confirmed')}</option>
            <option value="cancelled">{t('status.cancelled')}</option>
          </select>
        </div>
      </div>

      {flash && (
        <div className="px-4 py-3 rounded bg-red-50 border border-red-200 text-red-700">{flash}</div>
      )}

      <div className="border rounded-xl overflow-hidden overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">{t('list.columns.createdAt')}</th>
              <th className="px-4 py-3 text-left">{t('list.columns.completedAt')}</th>
              <th className="px-4 py-3 text-left">{t('list.columns.client')}</th>
              <th className="px-4 py-3 text-left">{t('list.columns.store')}</th>
              <th className="px-4 py-3 text-left">{t('list.columns.country')}</th>
              <th className="px-4 py-3 text-left">{t('list.columns.status')}</th>
              <th className="px-4 py-3 text-right">{t('list.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-secondary">
                  {t('list.loading')}
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-secondary">
                  {t('list.empty')}
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-3">{new Date(r.created_at).toLocaleString(locale)}</td>
                  <td className="px-4 py-3">
                    {r.completed_at || r.step4_confirmed_at || r.confirmed_at
                      ? new Date(r.completed_at || r.step4_confirmed_at || r.confirmed_at).toLocaleString(locale)
                      : t('common.none')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {r.client_company_name || r.company_name || r.client_name || t('common.none')}
                    </div>
                    {r.client_name && r.client_name !== r.client_company_name && (
                      <div className="text-xs text-text-secondary">{r.client_name}</div>
                    )}
                    <div className="text-xs text-text-secondary">{r.user_email || t('common.none')}</div>
                  </td>
                  <td className="px-4 py-3">{r.company_name || r.store_name || t('common.none')}</td>
                  <td className="px-4 py-3">
                    <DestinationBadge code={r.destination_country || 'FR'} variant="subtle" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <StatusPill s={r.status} label={t(`status.${String(r.status || '').toLowerCase()}`)} />
                      {String(r.status || '').toLowerCase() === 'pending' && (() => {
                        const pendingSummary = getPendingItemsSummary(r);
                        if (!pendingSummary.skuCount && !pendingSummary.unitsTotal) return null;
                        return (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-yellow-50 text-yellow-700 w-fit">
                            {tp('list.pendingSummary', pendingSummary)}
                          </span>
                        );
                      })()}
                      {r.step2_confirmed_at && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 w-fit">
                          {t('list.shippingConfirmed')}
                        </span>
                      )}
                      {r.step4_confirmed_at && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 w-fit">
                          {t('list.trackingConfirmed')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setSelectedId(r.id);
                        setSelectedView('shipping');
                      }}
                      className="px-3 py-1 bg-primary text-white rounded"
                    >
                      {t('list.open')}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedId(r.id);
                        setSelectedView('shipping');
                      }}
                      className="ml-2 px-3 py-1 bg-slate-700 text-white rounded"
                    >
                      {t('list.viewShipping')}
                    </button>
                     <button
                      onClick={() => handleDelete(r)}
                      className="ml-2 px-3 py-1 bg-red-600 text-white rounded inline-flex items-center gap-1"
                      title={tp('list.deleteTitle', { status: t(`status.${String(r.status || '').toLowerCase()}`) })}
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <button
          className="px-2 py-1 border rounded disabled:opacity-50"
          onClick={() => handlePageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          title={t('list.previousPage')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-text-secondary">
          {tp('list.page', { page, totalPages })}
        </span>
        <button
          className="px-2 py-1 border rounded disabled:opacity-50"
          onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title={t('list.nextPage')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
