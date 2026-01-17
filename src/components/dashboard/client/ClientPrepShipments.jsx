import React, { useEffect, useMemo, useState } from 'react';
import { Package, ChevronDown } from 'lucide-react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';
import { supabase, supabaseHelpers } from '../../../config/supabase';

const toIsoDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value.slice(0, 10);
  }
};

const createClientUid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ClientPrepShipments() {
  const { profile } = useSupabaseAuth();
  const { t } = useDashboardTranslation();
  const supportError = t('common.supportError');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stock, setStock] = useState([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryDraftQty, setInventoryDraftQty] = useState({});

  const [reqOpen, setReqOpen] = useState(false);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqEditable, setReqEditable] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [reqHeader, setReqHeader] = useState(null);
  const [reqLines, setReqLines] = useState([]);
  const [reqErrors, setReqErrors] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addingSel, setAddingSel] = useState('');
  const [addingQty, setAddingQty] = useState('');
  const amazonSnapshot = reqHeader?.amazon_snapshot || null;
  const isAdmin = profile?.is_admin === true || profile?.account_type === 'admin';
  const isLimitedAdmin = profile?.is_limited_admin === true;
  const canAdminDelete = isAdmin && !isLimitedAdmin;

  const formatDateParts = (value) => {
    if (!value) return { date: '—', time: '' };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { date: value, time: '' };
    return {
      date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })
    };
  };

  const formatDisplayDate = (value, withTime = false) => {
    if (!value) return '—';
    try {
      const date = new Date(value);
      const datePart = date.toLocaleDateString('ro-RO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      if (!withTime) return datePart;
      const timePart = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
      return `${datePart} · ${timePart}`;
    } catch {
      return value;
    }
  };

  const formatAddressLines = (address) => {
    if (!address) return ['—'];
    const lines = [
      address.name,
      address.address1,
      address.address2,
      [address.postal_code, address.city].filter(Boolean).join(' ').trim() || null,
      address.country_code,
      address.phone
    ].filter(Boolean);
    return lines.length ? lines : ['—'];
  };

  const filteredInventory = useMemo(() => {
    const term = inventorySearch.trim().toLowerCase();
    if (!term) return stock;
    return stock.filter((item) => {
      const hay = `${item.name || ''} ${item.ean || ''} ${item.asin || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [stock, inventorySearch]);

  const getStockMeta = (line) => {
    const st = line?.stock_item_id ? stock.find((r) => r.id === line.stock_item_id) : null;
    return {
      ean: (line?.ean || st?.ean || '') || '',
      name: st?.name || line?.product_name || '',
      image_url: st?.image_url || null,
      asin: st?.asin || line?.asin || '',
      sku: st?.sku || line?.sku || ''
    };
  };

  const getPrepStatusLabel = (status) => {
    const key = `ClientPrepShipments.prepStatus.${status}`;
    const translated = t(key);
    return translated || status;
  };

  const setAsinOrSku = (key, value) => {
    const raw = String(value || '').trim().toUpperCase();
    const isAsin = /^[A-Z0-9]{10}$/.test(raw) && /[A-Z]/.test(raw);
    updateReqLine(key, isAsin ? { asin: raw, sku: '' } : { sku: value, asin: '' });
  };

  const startAddItem = () => {
    setAdding(true);
    setAddingSel('');
    setAddingQty('');
  };
  const cancelAddItem = () => {
    setAdding(false);
    setAddingSel('');
    setAddingQty('');
    setInventorySearch('');
    setInventoryDraftQty({});
  };
  const confirmAddItem = () => {
    const stockId = String(addingSel || '').trim();
    const qty = Number(addingQty);
    const stockItem = stock.find((r) => String(r.id) === stockId);
    const errs = [];
    if (!stockItem) errs.push(t('ClientPrepShipments.drawer.selectStock'));
    if (!Number.isFinite(qty) || qty < 1) errs.push(t('ClientPrepShipments.drawer.qtyError'));
    if (stockItem && Number(stockItem.qty || 0) < qty) errs.push(t('ClientPrepShipments.drawer.stockError', { qty: stockItem.qty ?? 0 }));
    if (errs.length) {
      setReqErrors(errs);
      return;
    }
    setReqLines((prev) => [
      ...prev,
      {
        id: null,
        client_uid: createClientUid(),
        stock_item_id: stockItem.id,
        asin: stockItem.asin || '',
        sku: stockItem.sku || '',
        ean: stockItem.ean || '',
        units_requested: qty,
        product_name: stockItem.name || '',
        amazon_units_expected: null,
        amazon_units_received: null
      }
    ]);
    setReqErrors([]);
    cancelAddItem();
  };

  const handleDeleteRequest = async (requestId) => {
    if (!requestId) return;
    const ok = window.confirm(t('common.confirmDelete') || 'Delete this request?');
    if (!ok) return;
    setDeletingId(requestId);
    try {
      const { error } = await supabaseHelpers.deletePrepRequest(requestId);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== requestId));
      if (reqHeader?.id === requestId) {
        setReqOpen(false);
        setReqHeader(null);
        setReqLines([]);
      }
    } catch (e) {
      setReqErrors([supportError]);
    } finally {
      setDeletingId(null);
    }
  };

  const updateReqLine = (key, patch) => {
    setReqLines((prev) =>
      prev.map((line) => {
        const matches = (line.id && line.id === key) || (line.client_uid && line.client_uid === key);
        return matches ? { ...line, ...patch } : line;
      })
    );
  };

  const normalizeCode = (value) => String(value || '').trim().toLowerCase();

  const findStockMatch = (line) => {
    const ean = normalizeCode(line.ean || line.ean_asin);
    if (ean) {
      const match = stock.find((item) => normalizeCode(item.ean) === ean);
      if (match) return match;
    }
    const asin = normalizeCode(line.asin);
    if (asin) {
      const match = stock.find((item) => normalizeCode(item.asin) === asin);
      if (match) return match;
    }
    const sku = normalizeCode(line.sku);
    if (sku) {
      const match = stock.find((item) => normalizeCode(item.sku) === sku);
      if (match) return match;
    }
    const name = normalizeCode(line.product_name);
    if (name) {
      const match = stock.find((item) => normalizeCode(item.name) === name);
      if (match) return match;
    }
    return null;
  };

  const ensureStockItemId = async (line) => {
    if (line.stock_item_id) return line.stock_item_id;
    const existing = findStockMatch(line);
    if (existing) return existing.id;
    if (!profile?.company_id) return null;

    const payload = {
      company_id: profile.company_id,
      user_id: profile.id,
      name: line.product_name || line.name || line.asin || line.ean || 'Prep product',
      asin: line.asin || null,
      sku: line.sku || null,
      ean: line.ean || null,
      qty: 0,
      created_by: profile.id
    };

    const { data, error } = await supabase.from('stock_items').insert(payload).select().single();
    if (error) throw error;
    setStock((prev) => [data, ...prev]);
    return data.id;
  };

  const removeReqLine = (key) => {
    setReqLines((prev) =>
      prev.filter((line) => {
        if (line.id && line.id === key) return false;
        if (line.client_uid && line.client_uid === key) return false;
        return true;
      })
    );
  };

  const quickAddFromInventory = (stockId) => {
    const qty = Number(inventoryDraftQty[stockId] || 0);
    const stockItem = stock.find((r) => r.id === stockId);
    if (!stockItem || !Number.isFinite(qty) || qty < 1) {
      setReqErrors([t('ClientPrepShipments.drawer.qtyError')]);
      return;
    }
    if (Number(stockItem.qty || 0) < qty) {
      setReqErrors([t('ClientPrepShipments.drawer.stockError', { qty: stockItem.qty ?? 0 })]);
      return;
    }
    setReqLines((prev) => [
      ...prev,
      {
        id: null,
        client_uid: createClientUid(),
        stock_item_id: stockItem.id,
        asin: stockItem.asin || '',
        sku: stockItem.sku || '',
        ean: stockItem.ean || '',
        units_requested: qty,
        product_name: stockItem.name || '',
        amazon_units_expected: null,
        amazon_units_received: null
      }
    ]);
    setReqErrors([]);
    setInventoryDraftQty((prev) => ({ ...prev, [stockId]: '' }));
  };

  const openReqEditor = async (requestId) => {
    setReqOpen(true);
    setReqLoading(true);
    setReqHeader(null);
    setReqLines([]);
    setReqEditable(false);
    setAdding(false);
    setAddingSel('');
    setAddingQty('');
    setInventoryDraftQty({});
    setReqErrors([]);

    // Mode "create new request"
    if (!requestId) {
      setReqHeader({
        id: null,
        destination_country: profile?.company_country || 'FR',
        status: 'pending',
        created_at: new Date().toISOString(),
        fba_shipment_id: null,
        amazon_status: null,
        amazon_units_expected: null,
        amazon_units_located: null,
        amazon_skus: null,
        amazon_shipment_name: null,
        amazon_reference_id: null,
        amazon_destination_code: null,
        amazon_delivery_window: null,
        amazon_last_updated: null,
        amazon_snapshot: null
      });
      setReqEditable(true);
      setReqLoading(false);
      return;
    }

    try {
      const { data, error } = await supabaseHelpers.getPrepRequest(requestId);
      if (error) throw error;
      setReqHeader({
        id: data.id,
        destination_country: data.destination_country,
        status: data.status,
        created_at: data.created_at,
        fba_shipment_id: data.fba_shipment_id || null,
        amazon_status: data.amazon_status || null,
        amazon_units_expected: data.amazon_units_expected ?? null,
        amazon_units_located: data.amazon_units_located ?? null,
        amazon_skus: data.amazon_skus ?? null,
        amazon_shipment_name: data.amazon_shipment_name || null,
        amazon_reference_id: data.amazon_reference_id || null,
        amazon_destination_code: data.amazon_destination_code || null,
        amazon_delivery_window: data.amazon_delivery_window || null,
        amazon_last_updated: data.amazon_last_updated || null,
        amazon_snapshot: data.amazon_snapshot || null
      });
      const lines = Array.isArray(data.prep_request_items) ? data.prep_request_items : [];
      setReqLines(
        lines.map((line) => ({
          id: line.id,
          client_uid: line.id ? null : createClientUid(),
          stock_item_id: line.stock_item_id ?? null,
          asin: line.asin ?? '',
          sku: line.sku ?? '',
          units_requested: Number(line.units_requested || 0),
          product_name: line.product_name || line.stock_item?.name || '',
          ean: line.ean || line.stock_item?.ean || '',
          amazon_units_expected: line.amazon_units_expected ?? null,
          amazon_units_received: line.amazon_units_received ?? null
        }))
      );
      setReqEditable((data.status || 'pending') === 'pending');
    } catch (e) {
      setReqErrors([supportError]);
      setReqEditable(false);
    } finally {
      setReqLoading(false);
    }
  };

  const saveReqChanges = async () => {
    if (!reqHeader?.id || !reqEditable) return;
    const errs = [];
    reqLines.forEach((line, idx) => {
      if (!line.stock_item_id) errs.push(`${t('ClientPrepShipments.drawer.line')} ${idx + 1}: ${t('ClientPrepShipments.drawer.selectStock')}`);
      if (!Number.isFinite(Number(line.units_requested)) || Number(line.units_requested) < 1) {
        errs.push(`${t('ClientPrepShipments.drawer.line')} ${idx + 1}: ${t('ClientPrepShipments.drawer.qtyError')}`);
      }
      const st = stock.find((r) => r.id === line.stock_item_id);
      if (st && Number(st.qty || 0) < Number(line.units_requested)) {
        errs.push(`${t('ClientPrepShipments.drawer.line')} ${idx + 1}: ${t('ClientPrepShipments.drawer.stockError', { qty: st.qty ?? 0 })}`);
      }
    });
    if (errs.length) {
      setReqErrors(errs);
      return;
    }
    try {
      setReqLoading(true);
      const { data: check } = await supabaseHelpers.getPrepRequest(reqHeader.id);
      if ((check?.status || 'pending') !== 'pending') {
        setReqEditable(false);
        setReqErrors([t('ClientPrepShipments.drawer.locked')]);
        return;
      }
      const orig = Array.isArray(check?.prep_request_items) ? check.prep_request_items : [];
      const origById = {};
      orig.forEach((line) => {
        if (line.id) origById[line.id] = line;
      });
      const currentIds = new Set(reqLines.filter((line) => line.id).map((line) => line.id));
      const toDelete = orig.filter((line) => !currentIds.has(line.id));
      const toInsert = reqLines.filter(
        (line) =>
          !line.id &&
          (
            line.stock_item_id ||
            (line.product_name && line.product_name.trim()) ||
            (line.ean && line.ean.trim()) ||
            (line.asin && line.asin.trim())
          )
      );
      const toUpdate = reqLines.filter((line) => line.id && origById[line.id]);

      for (const del of toDelete) {
        const { error } = await supabaseHelpers.deletePrepItem(del.id);
        if (error) throw error;
      }
      for (const ins of toInsert) {
        const stockMeta = stock.find((r) => r.id === ins.stock_item_id) || {};
        const resolvedStockId = await ensureStockItemId(ins);
        if (resolvedStockId && !ins.stock_item_id) {
          ins.stock_item_id = resolvedStockId;
        }
        const payload = {
          stock_item_id: resolvedStockId || null,
          ean: stockMeta.ean || ins.ean || null,
          product_name: stockMeta.name || ins.product_name || null,
          asin: ins.asin || stockMeta.asin || null,
          sku: ins.sku || stockMeta.sku || null,
          units_requested: Math.max(1, Number(ins.units_requested) || 0)
        };
        const { error } = await supabaseHelpers.createPrepItem(reqHeader.id, payload);
        if (error) throw error;
      }
      for (const upd of toUpdate) {
        const base = origById[upd.id];
        const patch = {};
        if ((upd.asin || '') !== (base.asin || '')) patch.asin = (upd.asin || '').trim() || null;
        if ((upd.sku || '') !== (base.sku || '')) patch.sku = (upd.sku || '').trim() || null;
        if (Number(upd.units_requested) !== Number(base.units_requested)) {
          patch.units_requested = Number(upd.units_requested);
        }
        if (Object.keys(patch).length > 0) {
          const { error } = await supabaseHelpers.updatePrepItem(upd.id, patch);
          if (error) throw error;
        }
      }
      setReqErrors([]);
      setReqOpen(false);
    } catch (e) {
      setReqErrors([supportError]);
    } finally {
      setReqLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.id || !profile?.company_id) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      const [prepRes, stockResCompany, stockResUser] = await Promise.all([
        supabase
          .from('prep_requests')
          .select(`
            id,
            destination_country,
            created_at,
            confirmed_at,
            status,
            prep_status,
            fba_shipment_id,
            amazon_status,
            amazon_units_expected,
            amazon_units_located,
            amazon_skus,
            amazon_shipment_name,
            amazon_reference_id,
            amazon_destination_code,
            amazon_delivery_window,
            amazon_last_updated,
            amazon_snapshot,
            prep_request_tracking(tracking_id),
            prep_request_items(
              units_requested,
              amazon_units_expected,
              amazon_units_received
            )
          `)
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('stock_items')
          .select('*')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase
          .from('stock_items')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(5000)
      ]);

      if (!active) return;
      if (prepRes.error) {
        setError(supportError);
        setRows([]);
      } else {
        setError('');
        setRows(Array.isArray(prepRes.data) ? prepRes.data : []);
      }
      const companyItems = Array.isArray(stockResCompany.data) ? stockResCompany.data : [];
      const userItems = Array.isArray(stockResUser.data) ? stockResUser.data : [];
      const merged = [...companyItems, ...userItems].filter(Boolean);
      const deduped = Array.from(new Map(merged.map((it) => [it.id, it])).values());
      setStock(deduped);
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [profile?.id, profile?.company_id]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-xl">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{t('ClientPrepShipments.title')}</h1>
            <p className="text-sm text-text-secondary">{t('ClientPrepShipments.desc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openReqEditor(null)}
            className="text-sm px-3 py-2 border rounded-md text-slate-700 hover:bg-slate-100"
          >
            {t('ClientPrepShipments.newRequest') || 'New prep request'}
          </button>
        </div>
      </header>

      <div className="border rounded-xl bg-white overflow-hidden">
        <div className="border-b px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {t('ClientPrepShipments.table.title')}
          </h2>
          {loading && <span className="text-xs text-text-light">{t('common.loading')}</span>}
      </div>

      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-gray-50 text-text-secondary uppercase tracking-wide text-[11px]">
              <tr>
                <th className="px-4 py-2 text-left">Shipment name</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Last updated</th>
                <th className="px-4 py-2 text-left">Ship to</th>
                <th className="px-4 py-2 text-left">SKUs</th>
                <th className="px-4 py-2 text-left">Units expected</th>
                <th className="px-4 py-2 text-left">Status Amazon</th>
                <th className="px-4 py-2 text-left">
                  {t('ClientPrepShipments.table.statusPrepCenter') || 'Status PrepCenter'}
                </th>
                <th className="px-4 py-2 text-right">Next steps</th>
              </tr>
            </thead>
            <tbody>
                      {!loading && rows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-text-light">
                            {t('ClientPrepShipments.table.empty')}
                          </td>
                        </tr>
                      )}
              {rows.map((row) => {
                const status = row.status || 'pending';
                const destCode = (row.destination_country || 'FR').toUpperCase();
                const destLabel = t(`ClientStock.countries.${destCode}`) || destCode;
                const createdParts = formatDateParts(row.created_at);
                const lastUpdatedParts = formatDateParts(row.amazon_last_updated || row.confirmed_at || row.created_at);
                const snapshot = row.amazon_snapshot || {};
                const shipmentName =
                  row.amazon_shipment_name ||
                  snapshot.shipment_name ||
                  row.fba_shipment_id ||
                  'FBA shipment';
                const shipmentId = row.fba_shipment_id || snapshot.shipment_id || '—';
                const referenceId = row.amazon_reference_id || snapshot.reference_id || snapshot.shipment_reference_id || '';
                const items = Array.isArray(row.prep_request_items) ? row.prep_request_items : [];
                const skusCountRaw = Number(row.amazon_skus ?? snapshot.skus ?? items.length);
                const skusCount = Number.isFinite(skusCountRaw) ? skusCountRaw : items.length || '—';
                const unitsExpectedRaw = Number(row.amazon_units_expected ?? snapshot.units_expected);
                const unitsExpected = Number.isFinite(unitsExpectedRaw)
                  ? unitsExpectedRaw
                  : items.reduce((acc, it) => acc + Number(it.units_requested || 0), 0);
                const unitsLocatedRaw = Number(
                  row.amazon_units_located ?? snapshot.units_located ?? snapshot.units_received
                );
                const unitsLocated = Number.isFinite(unitsLocatedRaw) ? unitsLocatedRaw : null;
                const shipToText =
                  row.amazon_destination_code ||
                  snapshot.destination_code ||
                  destCode;
                const deliveryWindow =
                  row.amazon_delivery_window ||
                  snapshot.delivery_window ||
                  snapshot.deliveryWindow ||
                  '';
                const amazonStatus = (
                  row.amazon_status ||
                  snapshot.status ||
                  snapshot.shipment_status ||
                  '—'
                ).toString();
                let prepStatusRaw = row.prep_status || status;
                if ((!prepStatusRaw || prepStatusRaw === 'pending') && status === 'confirmed') {
                  prepStatusRaw = 'expediat';
                }
                const prepStatus =
                  prepStatusRaw === 'pending'
                    ? 'pending'
                    : prepStatusRaw === 'cancelled'
                    ? 'anulat'
                    : 'expediat';
                const pending = prepStatus === 'pending';
                const prepStatusClass = prepStatus === 'pending'
                  ? 'bg-amber-50 text-amber-700'
                  : prepStatus === 'anulat'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-emerald-50 text-emerald-700';
                return (
                  <tr key={row.id} className="border-t even:bg-gray-50/60">
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-primary hover:underline cursor-pointer" onClick={() => row.id && openReqEditor(row.id)}>
                        {shipmentName}
                      </div>
                      <div className="text-xs text-text-secondary font-mono">
                        {shipmentId}
                        {referenceId ? `, ${referenceId}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-text-primary">{createdParts.date}</div>
                      <div className="text-xs text-text-secondary">{createdParts.time}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-text-primary">{lastUpdatedParts.date}</div>
                      <div className="text-xs text-text-secondary">{lastUpdatedParts.time}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 uppercase">
                          {shipToText}
                          <span className="normal-case text-[11px] text-rose-700">{destLabel}</span>
                        </span>
                      </div>
                      {deliveryWindow && (
                        <div className="text-xs text-text-secondary mt-1">
                          Delivery window {deliveryWindow}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-primary font-semibold">{skusCount}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-base font-semibold text-text-primary">
                        {Number.isFinite(unitsExpected) ? unitsExpected : '—'}
                      </div>
                      <div
                        className={`text-sm font-semibold ${
                          Number.isFinite(unitsLocated) &&
                          Number.isFinite(unitsExpected) &&
                          Number(unitsLocated) === Number(unitsExpected)
                            ? 'text-emerald-600'
                            : 'text-sky-600'
                        }`}
                      >
                        {Number.isFinite(unitsLocated) ? unitsLocated : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="font-semibold text-text-primary">{amazonStatus}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${prepStatusClass}`}>
                        {getPrepStatusLabel(prepStatus)}
                      </span>
                    </td>
                   <td className="px-4 py-3 align-top text-right">
                     <div className="inline-flex items-center gap-2">
                       <button
                         className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                         disabled={!row.id}
                       onClick={() => row.id && openReqEditor(row.id)}
                      >
                        View request
                        <ChevronDown className="w-4 h-4" />
                      </button>
                        {pending && canAdminDelete && (
                          <button
                            className="text-sm text-red-600 hover:underline disabled:opacity-50"
                            disabled={deletingId === row.id}
                            onClick={() => handleDeleteRequest(row.id)}
                          >
                            {deletingId === row.id ? t('common.deleting') || 'Deleting...' : t('common.delete') || 'Delete'}
                          </button>
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

      {reqOpen && (
        <div className="fixed inset-0 bg-black/30 z-[110]" onClick={() => setReqOpen(false)}>
          <div
            className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-[120] bg-white/95 backdrop-blur border-b px-6 py-3">
              <h3 className="text-lg font-semibold">
                {reqEditable ? t('ClientPrepShipments.drawer.pendingTitle') : t('ClientPrepShipments.drawer.readonlyTitle')}
              </h3>
            </div>

            {reqLoading ? (
              <div className="text-sm text-text-secondary py-8 px-6">{t('common.loading')}</div>
            ) : (
              <>
          {amazonSnapshot ? (
            <div className="mx-6 mb-6 border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white">
              <div className="px-6 py-5 border-b border-gray-200 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-text-secondary">Shipment name</div>
                  <div className="text-xl font-semibold text-primary">
                    {reqHeader?.amazon_shipment_name || amazonSnapshot.shipment_name || reqHeader?.fba_shipment_id}
                  </div>
                  <div className="text-sm text-text-secondary font-mono">
                    {reqHeader?.fba_shipment_id}
                    {reqHeader?.amazon_reference_id || amazonSnapshot?.reference_id
                      ? ` · ${reqHeader?.amazon_reference_id || amazonSnapshot?.reference_id}`
                      : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <div className="text-xs uppercase text-text-secondary">Status</div>
                    <div className="text-base font-semibold">{reqHeader?.amazon_status || amazonSnapshot?.status || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-text-secondary">Last updated</div>
                    <div>{formatDisplayDate(reqHeader?.amazon_last_updated || amazonSnapshot?.last_updated, true)}</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 border-b border-gray-100">
                <div className="p-5 border-r border-gray-100">
                  <div className="text-xs uppercase text-text-secondary mb-2">Shipment</div>
                  <div className="text-sm text-text-secondary">Created: {formatDisplayDate(amazonSnapshot?.created_date || reqHeader?.created_at)}</div>
                  <div className="text-sm text-text-secondary">ID: {reqHeader?.fba_shipment_id || '—'}</div>
                  {amazonSnapshot?.created_using && (
                    <div className="text-sm text-text-secondary">Created using: {amazonSnapshot.created_using}</div>
                  )}
                  {(reqHeader?.amazon_reference_id || amazonSnapshot?.reference_id) && (
                    <div className="text-sm text-text-secondary">
                      Amazon reference ID: {reqHeader?.amazon_reference_id || amazonSnapshot?.reference_id}
                    </div>
                  )}
                </div>
                <div className="p-5 border-r border-gray-100">
                  <div className="text-xs uppercase text-text-secondary mb-2">Ship from</div>
                  {formatAddressLines(amazonSnapshot.ship_from).map((line, idx) => (
                    <div key={`shipfrom-${idx}`} className="text-sm text-text-primary">
                      {line}
                    </div>
                  ))}
                </div>
                <div className="p-5 border-r border-gray-100">
                  <div className="text-xs uppercase text-text-secondary mb-2">Ship to</div>
                  {amazonSnapshot.ship_to ? (
                    formatAddressLines(amazonSnapshot.ship_to).map((line, idx) => (
                      <div key={`shipto-${idx}`} className="text-sm text-text-primary">
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-text-primary">
                      {amazonSnapshot.destination_code || reqHeader?.amazon_destination_code || '—'}
                    </div>
                  )}
                  {amazonSnapshot.delivery_window && (
                    <div className="text-xs text-text-secondary mt-2">
                      Delivery window {amazonSnapshot.delivery_window}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="text-xs uppercase text-text-secondary mb-2">Contents</div>
                  <div className="text-sm text-text-primary">
                    {reqHeader?.amazon_skus ?? amazonSnapshot.skus ?? '—'} MSKUs
                  </div>
                  <div className="text-sm text-text-primary">
                    {reqHeader?.amazon_units_expected ?? amazonSnapshot.units_expected ?? '—'} units expected
                  </div>
                  <div className="text-xs text-text-secondary">
                    Units located: {reqHeader?.amazon_units_located ?? amazonSnapshot.units_located ?? '—'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm px-6 pt-4">
              <div><span className="text-text-secondary">{t('ClientPrepShipments.drawer.date')}:</span> {reqHeader?.created_at?.slice(0,10) || '—'}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-secondary">{t('ClientPrepShipments.drawer.country')}:</span>
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 uppercase">
                  {(reqHeader?.destination_country || 'FR').toUpperCase()}
                </span>
                <span className="text-sm text-text-secondary">
                  {t(`ClientStock.countries.${reqHeader?.destination_country || 'FR'}`)}
                </span>
              </div>
              <div><span className="text-text-secondary">{t('ClientPrepShipments.drawer.status')}:</span> {reqHeader?.status || 'pending'}</div>
              <div><span className="text-text-secondary">{t('ClientPrepShipments.drawer.shipment')}:</span> {reqHeader?.fba_shipment_id || '—'}</div>
            </div>
          )}

                {reqErrors.length > 0 && (
                  <div className="mx-6 mb-4 rounded-md border border-red-200 bg-red-50 text-red-700 p-3 text-sm space-y-1">
                    {reqErrors.map((e, i) => <div key={i}>• {e}</div>)}
                  </div>
                )}

                <div className="px-6 mb-4">
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-text-secondary">
                        <tr>
                          <th className="px-2 py-2 text-left w-16">Photo</th>
                          <th className="px-2 py-2 text-left">{t('ClientPrepShipments.drawer.product')}</th>
                          <th className="px-2 py-2 text-left">ASIN / SKU</th>
                          <th className="px-2 py-2 text-right">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                              Units expected
                            </div>
                            <div className="text-[10px] text-text-secondary">Units located</div>
                          </th>
                          {reqEditable && <th className="px-2 py-2 text-center">{t('ClientPrepShipments.drawer.actions')}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {reqLines.length === 0 && (
                          <tr>
                            <td colSpan={reqEditable ? 4 : 3} className="px-3 py-6 text-center text-text-secondary">
                              {t('ClientPrepShipments.drawer.empty')}
                            </td>
                          </tr>
                        )}
                        {reqLines.map((line) => {
                          const lineKey = line.id ?? line.client_uid;
                          const meta = getStockMeta(line);
                          const asin = String(line.asin || '').trim();
                          const sku = String(line.sku || '').trim();
                          return (
                            <tr key={lineKey || line.stock_item_id} className="border-t">
                              <td className="px-2 py-2">
                                {meta.image_url ? (
                                  <img
                                    src={meta.image_url}
                                    alt={meta.name || ''}
                                    className="w-10 h-10 rounded object-cover border"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
                                    N/A
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-2">{meta.name || '—'}</td>
                              <td className="px-2 py-2">
                                <div className="text-xs">
                                  <div className="font-mono">
                                    {asin || '—'}
                                  </div>
                                  {sku && (
                                    <div className="font-mono text-[11px] text-text-secondary">
                                      SKU: {sku}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right align-top">
                                {reqEditable ? (
                                  <input
                                    type="number"
                                    min={1}
                                    className="border rounded px-2 py-1 w-20 text-right"
                                    value={line.units_requested}
                                    onChange={(e) =>
                                      updateReqLine(lineKey, { units_requested: Number(e.target.value) })
                                    }
                                  />
                                ) : (
                                  <div className="text-right">
                                    <div className="text-base font-semibold text-text-primary leading-5">
                                      {line.amazon_units_expected ?? line.units_requested ?? '—'}
                                    </div>
                                    <div
                                      className={`text-sm font-semibold ${
                                        line.amazon_units_received != null &&
                                        line.amazon_units_expected != null &&
                                        Number(line.amazon_units_received) ===
                                          Number(line.amazon_units_expected)
                                          ? 'text-emerald-600'
                                          : 'text-sky-600'
                                      }`}
                                    >
                                      {line.amazon_units_received ?? '—'}
                                    </div>
                                    {line.amazon_units_expected != null &&
                                      line.amazon_units_received != null && (
                                        <div className="text-[11px] text-text-secondary">
                                          Δ{' '}
                                          {Number(line.amazon_units_expected) -
                                            Number(line.amazon_units_received)}
                                        </div>
                                      )}
                                  </div>
                                )}
                              </td>
                              {reqEditable && (
                                <td className="px-2 py-2 text-center">
                                  <button
                                    className="text-xs border rounded px-2 py-1 text-red-600 hover:bg-red-50"
                                    onClick={() => removeReqLine(lineKey)}
                                  >
                                    {t('ClientPrepShipments.drawer.remove')}
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {reqEditable && (
                  <>
                    <div className="px-6 mb-4">
                      {!adding ? (
                        <button
                          className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
                          onClick={startAddItem}
                        >
                          {t('ClientPrepShipments.drawer.addManual')}
                        </button>
                      ) : (
                        <div className="border rounded-lg p-3 bg-gray-50">
                          <div className="mb-2 text-sm font-semibold">{t('ClientPrepShipments.drawer.selectProduct')}</div>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <select
                              className="border rounded px-2 py-1 w-full text-sm"
                              value={addingSel}
                              onChange={(e) => setAddingSel(e.target.value)}
                            >
                              <option value="">—</option>
                              {stock.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.ean || 'No EAN'} — {r.name || 'Unnamed'} (Stock: {r.qty})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              className="border rounded px-2 py-1 w-full text-right"
                              value={addingQty}
                              onChange={(e) => setAddingQty(e.target.value)}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button className="text-xs border rounded px-3 py-1" onClick={cancelAddItem}>
                              {t('ClientPrepShipments.drawer.cancel')}
                            </button>
                            <button className="text-xs bg-primary text-white rounded px-3 py-1" onClick={confirmAddItem}>
                              {t('ClientPrepShipments.drawer.add')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {adding && (
                    <div className="px-6 mb-6 border rounded-xl p-3 bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold">{t('ClientPrepShipments.drawer.inventoryTitle')}</div>
                        <input
                          type="text"
                          placeholder={t('ClientPrepShipments.drawer.inventorySearch')}
                          className="border rounded px-2 py-1 text-sm"
                          value={inventorySearch}
                          onChange={(e) => setInventorySearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y">
                        {filteredInventory.map((item) => (
                          <div key={item.id} className="py-2 flex items-center justify-between text-sm">
                            <div className="flex items-center gap-3">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name || ''}
                                  className="w-10 h-10 rounded object-cover border"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
                                  N/A
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-text-primary">{item.name || '—'}</div>
                                <div className="text-xs text-text-secondary">
                                  {item.ean || 'EAN —'} · {t('ClientPrepShipments.drawer.inStock', { qty: item.qty ?? 0 })}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                placeholder="Qty"
                                className="border rounded px-2 py-1 w-20 text-right"
                                value={inventoryDraftQty[item.id] || ''}
                                onChange={(e) =>
                                  setInventoryDraftQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                              />
                              <button
                                className="px-2 py-1 bg-primary text-white rounded text-xs"
                                onClick={() => quickAddFromInventory(item.id)}
                              >
                                {t('ClientPrepShipments.drawer.add')}
                              </button>
                            </div>
                          </div>
                        ))}
                        {filteredInventory.length === 0 && (
                          <div className="py-4 text-center text-text-secondary text-sm">
                            {t('ClientPrepShipments.drawer.inventoryEmpty')}
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                  </>
                )}

                <div className="px-6 mb-6 flex justify-end gap-2">
                  <button className="border rounded px-4 py-2" onClick={() => setReqOpen(false)}>
                    {t('ClientPrepShipments.drawer.close')}
                  </button>
                  {reqEditable && (
                    <button className="bg-primary text-white rounded px-4 py-2" onClick={saveReqChanges}>
                      {t('ClientPrepShipments.drawer.save')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
