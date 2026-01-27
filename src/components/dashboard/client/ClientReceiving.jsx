import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Send } from 'lucide-react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabaseHelpers } from '../../../config/supabase';
import { supabase } from '../../../config/supabase';
import { encodeRemainingAction } from '@/utils/receivingFba';
import { useDashboardTranslation } from '@/translations';
import { useLanguage } from '@/contexts/LanguageContext';
import { FALLBACK_CARRIERS, normalizeCarriers } from '@/utils/carriers';

const GUIDE_LANGS = ['fr', 'en', 'de', 'it', 'es', 'ro'];
const STATUS_PRIORITY = {
  draft: 1,
  submitted: 1,
  partial: 2,
  received: 3,
  processed: 4,
  cancelled: 5
};

const STATUS_SORT_DATE = {
  partial: 'updated_at',
  received: 'updated_at',
  processed: 'updated_at'
};

const toNull = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

const normalizeValue = (value) => {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
};

const buildDisplayList = (values, fallback) => {
  const base = Array.isArray(values) ? values : [];
  const cleaned = base.map(normalizeValue).filter(Boolean);
  if (cleaned.length) return cleaned;
  const fallbackValue = normalizeValue(fallback);
  return fallbackValue ? [fallbackValue] : [];
};

const truncateLabel = (value, max = 15) => {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const buildEditableList = (values, fallback) => {
  const list = buildDisplayList(values, fallback);
  return list.length ? list : [''];
};

const sanitizeList = (values) =>
  Array.isArray(values) ? values.map(normalizeValue).filter(Boolean) : [];

const cloneItems = (items = []) => items.map((item) => ({ ...item }));

const cleanCode = (value) => (typeof value === 'string' ? value.trim() : '');
const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const EAN_REGEX = /^\d{8,14}$/;
const looksLikeAsin = (value) => {
  const code = cleanCode(value).toUpperCase();
  return ASIN_REGEX.test(code) && /[A-Z]/.test(code);
};
const looksLikeEan = (value) => EAN_REGEX.test(cleanCode(value));

const resolveIdentifiers = (item) => {
  const stock = item?.stock_item || {};
  const rawEanAsin = cleanCode(item?.ean_asin);
  const asin =
    cleanCode(item?.asin) ||
    cleanCode(stock.asin) ||
    (looksLikeAsin(rawEanAsin) ? rawEanAsin : '');
  const sku = cleanCode(item?.sku) || cleanCode(stock.sku);
  return {
    asin: asin || '—',
    sku: sku || '—'
  };
};

const resolveImageUrl = (item) =>
  cleanCode(item?.image_url) || cleanCode(item?.stock_item?.image_url) || '';

const sortItems = (items = []) =>
  [...items].sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));

const validateEAN = (ean) => supabaseHelpers.validateEAN(ean);

const DATE_LOCALE_MAP = {
  fr: 'fr-FR',
  en: 'en-US',
  de: 'de-DE',
  it: 'it-IT',
  es: 'es-ES',
  ro: 'ro-RO',
  pl: 'pl-PL'
};

const DESTINATION_COUNTRIES = ['FR', 'DE', 'IT', 'ES', 'UK'];

const getExpectedQty = (item) => Math.max(0, Number(item?.quantity_received || 0));
const getConfirmedQty = (item) => {
  if (!item) return 0;
  const base =
    item.received_units != null
      ? Number(item.received_units)
      : Number(item.quantity_received || 0);
  return Number.isFinite(base) && base >= 0 ? base : 0;
};

const deriveReceivingStatus = (shipment) => {
  if (!shipment) return 'submitted';
  const base = shipment.status || 'submitted';
  if (['cancelled', 'processed'].includes(base)) return base;
  const lines = shipment.receiving_items || [];
  if (lines.length === 0) return base;
  const allReceived = lines.every((item) => {
    const expected = getExpectedQty(item);
    if (expected <= 0) return true;
    return getConfirmedQty(item) >= expected;
  });
  const anyReceived = lines.some((item) => getConfirmedQty(item) > 0);
  if (allReceived && anyReceived) return 'received';
  if (anyReceived) return 'partial';
  return 'submitted';
};

const decorateShipment = (shipment) =>
  shipment ? { ...shipment, derived_status: deriveReceivingStatus(shipment) } : shipment;

const sortShipmentsByStatus = (list = []) =>
  [...list].sort((a, b) => {
    const statusA = a.derived_status || a.status;
    const statusB = b.derived_status || b.status;
    const priorityA = STATUS_PRIORITY[statusA] ?? 999;
    const priorityB = STATUS_PRIORITY[statusB] ?? 999;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const dateKey = STATUS_SORT_DATE[statusA] || 'created_at';
    const timeA = new Date(a[dateKey] || a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b[dateKey] || b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

function ClientReceiving() {
  const { t: baseT, tp } = useDashboardTranslation();
  const { currentLanguage } = useLanguage();
  const { profile } = useSupabaseAuth();

  const t = (key, params) =>
    params ? tp(`ClientReceiving.${key}`, params) : baseT(`ClientReceiving.${key}`);
  const supportError = baseT('common.supportError');

  const DATE_LOCALE = DATE_LOCALE_MAP[currentLanguage] || 'en-US';

  const [shipments, setShipments] = useState([]);
  const [carriers, setCarriers] = useState(FALLBACK_CARRIERS);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editHeader, setEditHeader] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [savingEdits, setSavingEdits] = useState(false);
  const [deletingShipment, setDeletingShipment] = useState(false);
  const [stock, setStock] = useState([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryDraftQty, setInventoryDraftQty] = useState({});
  const [shipmentsSearch, setShipmentsSearch] = useState('');
  const copyToClipboard = async (label, value) => {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied.`);
      setMessageType('info');
    } catch (err) {
      setMessage('Copy failed.');
      setMessageType('error');
    }
  };
  const filteredInventory = useMemo(() => {
    const term = inventorySearch.trim().toLowerCase();
    if (!term) return stock;
    return stock.filter((item) => {
      const hay = `${item.name || ''} ${item.ean || ''} ${item.sku || ''} ${item.asin || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [stock, inventorySearch]);

  const filteredShipments = useMemo(() => {
    const rawTerm = shipmentsSearch.trim().toLowerCase();
    const cleanTerm = rawTerm.replace(/\s+/g, '');
    if (!cleanTerm) return shipments;
    return shipments.filter((shipment) => {
      const haystackBase = [
        shipment.carrier,
        shipment.tracking_id,
        ...(Array.isArray(shipment.tracking_ids) ? shipment.tracking_ids : []),
        shipment.status,
        shipment.notes,
        shipment.client_store_name,
        shipment.store_name
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const haystackClean = haystackBase.replace(/\s+/g, '');

      if (haystackBase.includes(rawTerm) || haystackClean.includes(cleanTerm)) return true;

      const items = Array.isArray(shipment.receiving_items) ? shipment.receiving_items : [];
      return items.some((it) => {
        const parts = [it.asin, it.sku, it.product_name, it.ean_asin, it.ean]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const partsClean = parts.replace(/\s+/g, '');
        return parts.includes(rawTerm) || partsClean.includes(cleanTerm);
      });
    });
  }, [shipments, shipmentsSearch]);

  const resolveText = (keys, fallback) => {
    for (const key of keys) {
      const value = t(key);
      if (!value) continue;
      const text = String(value);
      if (text.includes('ClientReceiving.')) continue;
      return text;
    }
    return fallback;
  };
  const storeLabel = resolveText(
    ['ClientReceiving.store_name', 'store_name'],
    'Store or order reference'
  );
  const storePlaceholder = resolveText(
    ['ClientReceiving.store_name_ph', 'store_name_ph'],
    'Store or order reference'
  );

const buildHeaderState = (shipment) => ({
  carrier: shipment?.carrier || '',
  carrier_other: shipment?.carrier_other || '',
  tracking_ids: buildEditableList(shipment?.tracking_ids, shipment?.tracking_id),
  fba_shipment_ids: buildEditableList(shipment?.fba_shipment_ids),
  store_name: shipment?.client_store_name || shipment?.store_name || '',
  notes: shipment?.notes || '',
  fba_mode: shipment?.fba_mode || 'none',
  destination_country: shipment?.destination_country || 'FR'
});

  const handleSelectShipment = (shipment) => {
    const decorated = decorateShipment(shipment);
    setSelectedShipment(decorated);
    setEditMode(false);
    setMessage('');
    setMessageType(null);
    setEditHeader(buildHeaderState(decorated));
    setEditItems(cloneItems(sortItems(decorated?.receiving_items)));
    setInventoryOpen(false);
    setInventorySearch('');
    setInventoryDraftQty({});
  };

  const loadData = async () => {
    if (!profile?.company_id) {
      setShipments([]);
      setCarriers([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const [shipmentsRes, carriersRes, stockResCompany, stockResUser] = await Promise.all([
        supabaseHelpers.getClientReceivingShipments(profile.company_id),
        supabaseHelpers.getCarriers(),
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

      if (shipmentsRes.error) throw shipmentsRes.error;
      if (carriersRes.error) throw carriersRes.error;
      if (stockResCompany?.error) {
        console.error('Failed to load inventory (company)', stockResCompany.error);
      }
      if (stockResUser?.error) {
        console.error('Failed to load inventory (user)', stockResUser.error);
      }

      const nextShipments = Array.isArray(shipmentsRes.data)
        ? shipmentsRes.data.map((row) => decorateShipment(row))
        : [];
      const sortedShipments = sortShipmentsByStatus(nextShipments);
      const companyItems = Array.isArray(stockResCompany?.data) ? stockResCompany.data : [];
      const userItems = Array.isArray(stockResUser?.data) ? stockResUser.data : [];
      const merged = [...companyItems, ...userItems].filter(Boolean);
      const deduped = Array.from(new Map(merged.map((it) => [it.id, it])).values());

      setShipments(sortedShipments);
      setCarriers(normalizeCarriers(carriersRes.data || []));
      setStock(deduped);
      return sortedShipments;
    } catch (error) {
      setShipments([]);
      setMessage(supportError);
      setMessageType('error');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedShipment(null);
    setEditMode(false);
    setEditHeader(null);
    setEditItems([]);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  useEffect(() => {
    if (!editMode) {
      setInventoryOpen(false);
      setInventorySearch('');
      setInventoryDraftQty({});
    }
  }, [editMode]);

  const getStatusBadge = (status) => {
    const map = {
      draft: { color: 'bg-gray-100 text-gray-800', text: t('status_draft') },
      submitted: { color: 'bg-yellow-100 text-yellow-800', text: t('status_submitted') },
      partial: { color: 'bg-amber-100 text-amber-800', text: t('status_partial') },
      received: { color: 'bg-blue-100 text-blue-800', text: t('status_received') },
      processed: { color: 'bg-green-100 text-green-800', text: t('status_processed') },
      cancelled: { color: 'bg-red-100 text-red-800', text: t('status_cancelled') }
    };
    const badge = map[status] || map.draft;
    return <span className={`px-2 py-1 text-xs rounded-full ${badge.color}`}>{badge.text}</span>;
  };

  const handleSaveEdits = async (shipmentId) => {
    if (!editHeader) return;

    try {
      setSavingEdits(true);

      const trackingValues = sanitizeList(editHeader.tracking_ids);
      const fbaValues = sanitizeList(editHeader.fba_shipment_ids);
      const primaryTracking =
        trackingValues.length > 0
          ? trackingValues[0]
          : toNull(selectedShipment?.tracking_id) || null;

      const payloadHeader = {
        carrier: toNull(editHeader.carrier),
        carrier_other:
          editHeader.carrier === 'OTHER' ? toNull(editHeader.carrier_other) : null,
        tracking_id: primaryTracking,
        tracking_ids: trackingValues.length ? trackingValues : null,
        fba_shipment_ids: fbaValues.length ? fbaValues : null,
        client_store_name: toNull(editHeader.store_name),
        notes: toNull(editHeader.notes),
        fba_mode: editHeader.fba_mode || 'none',
        destination_country: editHeader.destination_country || 'FR'
      };

      await supabaseHelpers.updateReceivingShipment(shipmentId, payloadHeader);

      const existingItems = sortItems(selectedShipment?.receiving_items || []);
      const existingById = {};
      existingItems.forEach((it) => {
        if (it.id) existingById[it.id] = it;
      });

      const current = editItems || [];
      const currentIds = new Set(current.filter((it) => it.id).map((it) => it.id));

      const toDeleteIds = Object.keys(existingById).filter((id) => !currentIds.has(id));
      const toUpdate = current.filter((item) => item.id && existingById[item.id]);
      const toInsert = current.filter((item) => !item.id);

      const buildItemPayload = (item, fallbackLineNumber) => {
        const baseLine =
          Number(item.line_number) ||
          Number(existingById[item.id || '']?.line_number) ||
          fallbackLineNumber ||
          1;
        return {
          stock_item_id: item.stock_item_id || null,
          ean_asin: item.ean_asin,
          product_name: item.product_name,
          quantity_received: Number(item.quantity_received) || 0,
          sku: item.sku || null,
          purchase_price: item.purchase_price ?? null,
          send_to_fba: !!item.send_to_fba,
          fba_qty: item.send_to_fba ? Math.max(0, Number(item.fba_qty) || 0) : 0,
          line_number: baseLine
        };
      };

      for (const id of toDeleteIds) {
        await supabaseHelpers.deleteReceivingItem(id);
      }

      for (const item of toUpdate) {
        const payload = buildItemPayload(item);
        await supabaseHelpers.updateReceivingItem(item.id, payload);
      }

      if (toInsert.length) {
        let lineCounter =
          existingItems.reduce(
            (max, it) => Math.max(max, Number(it.line_number) || 0),
            0
          ) || 0;
        const insertPayload = toInsert.map((item) => {
          lineCounter += 1;
          return {
            shipment_id: shipmentId,
            ...buildItemPayload(item, lineCounter)
          };
        });
        await supabaseHelpers.createReceivingItems(insertPayload);
      }

      // Ensure FBA intent is always persisted, even if a previous helper
      // stripped optional columns in degraded mode.
      const fbaUpdates = (editItems || []).filter((item) => item.id);
      for (const item of fbaUpdates) {
        const send = !!item.send_to_fba && Number(item.fba_qty || 0) > 0;
        const qty = send ? Math.max(0, Number(item.fba_qty) || 0) : null;
        await supabaseHelpers.updateReceivingItem(item.id, {
          send_to_fba: send,
          fba_qty: qty,
          remaining_action: encodeRemainingAction(send)
        });
      }

      const refreshed = await loadData();
      const updated = refreshed.find((row) => row.id === shipmentId);
      if (updated) {
        setSelectedShipment(updated);
        setEditHeader(buildHeaderState(updated));
        setEditItems(cloneItems(sortItems(updated.receiving_items)));
      } else {
        setSelectedShipment(null);
      }

      setEditMode(false);
      setMessage(t('changes_saved'));
      setMessageType('success');
    } catch (e) {
      setMessage(supportError);
      setMessageType('error');
    } finally {
      setSavingEdits(false);
    }
  };

  const handleDeleteShipment = async (shipmentId) => {
    if (!shipmentId) return;
    const ok = window.confirm(t('confirm_delete') || 'Delete this reception?');
    if (!ok) return;
    setDeletingShipment(true);
    try {
      const { error } = await supabaseHelpers.deleteReceivingShipment(shipmentId);
      if (error) throw error;
      const refreshed = await loadData();
      setSelectedShipment(null);
      if (!refreshed.some((r) => r.id === shipmentId)) {
        setMessage(t('delete_success') || 'Reception deleted.');
        setMessageType('success');
      }
    } catch (error) {
      setMessage(error?.message || supportError);
      setMessageType('error');
    } finally {
      setDeletingShipment(false);
    }
  };

  const handleStatusSubmit = async (shipment) => {
    try {
      const confirmSend = confirm(t('confirm_send'));
      if (!confirmSend) return;

      const { error } = await supabase
        .from('receiving_shipments')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString()
        })
        .eq('id', shipment.id);
      if (error) throw error;

      setSelectedShipment((prev) =>
        prev ? decorateShipment({ ...prev, status: 'submitted' }) : prev
      );
      setShipments((prev) =>
        sortShipmentsByStatus(
          prev.map((row) =>
            row.id === shipment.id ? decorateShipment({ ...row, status: 'submitted' }) : row
          )
        )
      );
      setMessage(t('reception_sent'));
      setMessageType('success');
    } catch (err) {
      setMessage(supportError);
      setMessageType('error');
    }
  };

  const applyFbaModeToEditItems = (mode) => {
    setEditItems((prev) =>
      prev.map((item) => {
        const qty = Math.max(0, Number(item.quantity_received || 0));
        if (mode === 'full') {
          return {
            ...item,
            send_to_fba: qty > 0,
            fba_qty: qty,
          };
        }
        if (mode === 'none') {
          return {
            ...item,
            send_to_fba: false,
            fba_qty: 0,
          };
        }
        return item;
      })
    );
  };

  const handleFbaModeChange = (mode) => {
    if (!editMode) return;
    setEditHeader((prev) => ({ ...prev, fba_mode: mode }));
    if (mode === 'full' || mode === 'none') {
      applyFbaModeToEditItems(mode);
    }
  };

  const handleInventoryAdd = (stockId) => {
    const stockItem = stock.find((item) => item.id === stockId);
    const qtyValue = Number(inventoryDraftQty[stockId] || 0);
    if (!stockItem) {
      return;
    }
    if (!Number.isFinite(qtyValue) || qtyValue < 1) {
      setMessage(t('inventory_qty_error'));
      setMessageType('error');
      return;
    }
    setEditItems((prev) => [
      ...prev,
      {
        id: undefined,
        stock_item_id: stockItem.id,
        ean_asin: stockItem.ean || stockItem.asin || '',
        product_name: stockItem.name || '',
        quantity_received: qtyValue,
        sku: stockItem.sku || null,
        purchase_price: stockItem.purchase_price ?? null,
        send_to_fba: false,
        fba_qty: null,
        image_url: stockItem.image_url ?? null,
        stock_item: stockItem
      }
    ]);
    setInventoryDraftQty((prev) => ({ ...prev, [stockId]: '' }));
    setMessage('');
    setMessageType(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (selectedShipment) {
    const currentStatus = selectedShipment.derived_status || deriveReceivingStatus(selectedShipment);
    const canEdit = ['draft', 'submitted', 'partial'].includes(selectedShipment.status);
    const viewItems = editMode
      ? editItems
      : sortItems(selectedShipment.receiving_items || []);
    const trackingValues = buildDisplayList(
      selectedShipment.tracking_ids,
      selectedShipment.tracking_id
    );
    const fbaValues = buildDisplayList(selectedShipment.fba_shipment_ids);
    const headerState = editHeader || buildHeaderState(selectedShipment);
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setSelectedShipment(null);
                setEditMode(false);
              }}
              className="text-primary hover:text-primary-dark"
            >
              {t('back_to_list')}
            </button>
            {canEdit && !editMode && (
              <button
                onClick={() => {
                  setEditHeader(buildHeaderState(selectedShipment));
                  setEditItems(cloneItems(sortItems(selectedShipment.receiving_items)));
                  setEditMode(true);
                }}
                className="inline-flex items-center px-3 py-2 border rounded-lg text-primary border-primary hover:bg-primary hover:text-white"
              >
                <Edit className="w-4 h-4 mr-2" /> {t('edit')}
              </button>
            )}
            {canEdit && !editMode && (
              <button
                onClick={() => handleDeleteShipment(selectedShipment.id)}
                disabled={deletingShipment}
                className="inline-flex items-center px-3 py-2 border border-red-500 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                {deletingShipment ? (t('deleting') || 'Deleting...') : (t('delete') || 'Delete')}
              </button>
            )}
            {selectedShipment.status === 'draft' && (
              <button
                onClick={() => handleStatusSubmit(selectedShipment)}
                className="inline-flex items-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
              >
                <Send className="w-4 h-4 mr-2" /> {t('send')}
              </button>
            )}
            {canEdit && editMode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSaveEdits(selectedShipment.id)}
                  disabled={savingEdits}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
                >
                  {savingEdits ? t('saving') : t('save')}
                </button>
                <button
                  onClick={() => {
                    setEditMode(false);
                    setEditHeader(buildHeaderState(selectedShipment));
                    setEditItems(cloneItems(sortItems(selectedShipment.receiving_items)));
                  }}
                  className="px-4 py-2 border rounded-lg"
                >
                  {t('cancel')}
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 text-text-secondary">
              {getStatusBadge(currentStatus)}
              <span>{new Date(selectedShipment.created_at).toLocaleDateString(DATE_LOCALE)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xs text-text-secondary">{t('receptionForm.destination') || 'Destination'}</span>
              {editMode ? (
                <select
                  value={headerState.destination_country || 'FR'}
                  onChange={(e) =>
                    setEditHeader((prev) => ({ ...prev, destination_country: e.target.value }))
                  }
                  className="border rounded-md px-2 py-1 text-sm"
                >
                  {DESTINATION_COUNTRIES.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              ) : (
                <span className="inline-flex px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                  {selectedShipment.destination_country || 'FR'}
                </span>
              )}
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`px-4 py-3 rounded-lg ${
              messageType === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : messageType === 'info'
                ? 'bg-blue-50 border border-blue-200 text-blue-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {message}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h3 className="text-lg font-semibold text-text-primary">{t('shipment_details')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">
                {t('carrier')}
              </label>
              {editMode ? (
                <div className="flex gap-2">
                  <select
                    value={headerState.carrier}
                    onChange={(e) =>
                      setEditHeader((prev) => ({ ...prev, carrier: e.target.value }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">{t('select_carrier')}</option>
                    {carriers.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code === 'OTHER' ? t('other') : c.label}
                      </option>
                    ))}
                  </select>
                  {headerState.carrier === 'OTHER' && (
                    <input
                      value={headerState.carrier_other || ''}
                      onChange={(e) =>
                        setEditHeader((prev) => ({ ...prev, carrier_other: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder={t('other_carrier_ph')}
                    />
                  )}
                </div>
              ) : (
                <p className="text-text-primary">
                  {selectedShipment.carrier}
                  {selectedShipment.carrier_other && ` (${selectedShipment.carrier_other})`}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary">
                {t('tracking_id')}
              </label>
              {editMode ? (
                <>
                  {(headerState.tracking_ids || ['']).map((num, index) => (
                    <div key={index} className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={num}
                        onChange={(e) => {
                          const updated = [...(headerState.tracking_ids || [])];
                          updated[index] = e.target.value;
                          setEditHeader((prev) => ({ ...prev, tracking_ids: updated }));
                        }}
                        className="flex-1 px-3 py-2 border rounded-lg font-mono"
                        placeholder="Ex: 1Z999AA1234567890"
                      />
                      {(headerState.tracking_ids?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = headerState.tracking_ids.filter((_, i) => i !== index);
                            setEditHeader((prev) => ({ ...prev, tracking_ids: updated }));
                          }}
                          className="text-red-500 font-bold text-lg"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setEditHeader((prev) => ({
                        ...prev,
                        tracking_ids: [...(prev?.tracking_ids || []), '']
                      }))
                    }
                    className="text-primary hover:underline text-sm"
                  >
                    {t('add_tracking_number')}
                  </button>
                </>
              ) : (
                <>
                  {trackingValues.length === 0 && <p className="text-text-secondary">—</p>}
                  {trackingValues.map((num, idx) => (
                    <p key={idx} className="text-text-primary font-mono">
                      {num}
                    </p>
                  ))}
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary">
                {storeLabel}
              </label>
              {editMode ? (
                <input
                  type="text"
                  value={headerState.store_name || ''}
                  onChange={(e) =>
                    setEditHeader((prev) => ({ ...prev, store_name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder={storePlaceholder}
                />
              ) : (
                <p className="text-text-primary">
                  {selectedShipment.client_store_name || selectedShipment.store_name || '—'}
                </p>
              )}
            </div>

            {/* FBA Shipment IDs hidden on Receiving page; kept only on Prep-center shipments */}
          </div>

          <div className="border rounded-lg p-4 md:col-span-2">
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-text-secondary">
                {t('fba_mode_title')}
              </h4>
              <div className="flex flex-wrap gap-4 text-sm text-text-primary">
                {['none', 'full', 'partial'].map((mode) => (
                  <label key={mode} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="client-receiving-fba-mode"
                      value={mode}
                      checked={(headerState.fba_mode || 'none') === mode}
                      disabled={!editMode}
                      onChange={() => handleFbaModeChange(mode)}
                    />
                      {mode === 'none'
                        ? t('fba_mode_none')
                        : mode === 'full'
                        ? t('fba_mode_full')
                        : t('fba_mode_partial')}
                  </label>
                ))}
              </div>
              {headerState.fba_mode === 'partial' && (
                <div className="mt-2 border rounded-md bg-white max-h-64 overflow-y-auto divide-y">
                  {(editMode ? editItems : viewItems).length === 0 ? (
                    <p className="text-text-secondary text-sm px-4 py-3">
                      {t('fba_mode_hint')}
                    </p>
                  ) : (
                    <>
                      <div className="px-4 py-2 grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.55fr)_minmax(0,0.55fr)] text-[11px] font-semibold uppercase tracking-wide border-b bg-red-50/60">
                        <span className="text-text-secondary">{t('th_name') || 'Product name'}</span>
                        <span className="text-red-600 text-right">
                          {t('fba_units_announced') || 'Units announced'}
                        </span>
                        <span className="text-red-600 text-right">
                          {t('fba_units_to_amazon') || 'Units to send to Amazon'}
                        </span>
                      </div>
                      {(editMode ? editItems : viewItems).map((item, idx) => {
                        const qty = Math.max(0, Number(item.quantity_received || 0));
                        const locked = editMode ? Boolean(item.is_received) : false;
                        const value = editMode
                          ? item.fba_qty ?? ''
                          : Math.max(0, Number(item.fba_qty || 0));
                        const imgUrl = resolveImageUrl(item);
                        return (
                          <div
                            key={item.id || idx}
                            className="py-3 px-4 grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.55fr)_minmax(0,0.55fr)] items-center gap-4 border-t first:border-t-0"
                          >
                            <div className="min-w-0 flex items-center gap-3">
                              <div className="w-10 h-10 rounded border bg-gray-50 flex items-center justify-center overflow-hidden text-[9px] text-text-secondary flex-shrink-0">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={item.product_name || 'Product photo'}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  'No img'
                                )}
                              </div>
                              <p className="font-medium text-text-primary truncate">
                                {item.product_name}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={`text-lg font-semibold ${
                                  locked ? 'text-text-secondary' : 'text-red-600'
                                }`}
                              >
                                {qty}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {editMode ? (
                                <input
                                  type="number"
                                  min="0"
                                  className={`w-24 text-right border rounded px-2 py-1 text-lg font-semibold ${
                                    locked
                                      ? 'bg-gray-50 text-text-secondary cursor-not-allowed'
                                      : 'text-red-600'
                                  }`}
                                  disabled={locked}
                                  value={value}
                                  onChange={(e) =>
                                    setEditItems((arr) => {
                                      const next = [...arr];
                                      const desired = Math.min(
                                        qty,
                                        Math.max(0, Number(e.target.value) || 0)
                                      );
                                      next[idx] = {
                                        ...next[idx],
                                        send_to_fba: desired > 0,
                                        fba_qty: desired
                                      };
                                      return next;
                                    })
                                  }
                                />
                              ) : (
                                <span className="text-lg font-semibold text-red-600">
                                  {value}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
              {!editMode && headerState.fba_mode !== 'none' && (
                <p className="text-xs text-text-secondary">
                  {headerState.fba_mode === 'full'
                    ? t('fba_mode_summary_full')
                    : t('fba_mode_summary_partial')}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary">{t('notes')}</label>
            {editMode ? (
              <textarea
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                value={headerState.notes || ''}
                onChange={(e) =>
                  setEditHeader((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder={t('notes_ph')}
              />
            ) : (
              <p className="text-text-primary whitespace-pre-line">
                {selectedShipment.notes || '—'}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">{t('th_ean_asin')}</th>
                  <th className="px-4 py-3 text-left">{t('th_name')}</th>
                  <th className="px-4 py-3 text-right">{t('th_expected_qty')}</th>
                  <th className="px-4 py-3 text-right">{t('th_received_qty')}</th>
                  {!editMode && (
                    <th className="px-4 py-3 text-left">{t('th_line_status')}</th>
                  )}
                  {editMode && (
                    <th className="px-4 py-3 text-center">{t('actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {viewItems.map((item, idx) => {
                  const sendDirect = item.send_to_fba && Number(item.fba_qty || 0) > 0;
                  const receivedAt = item.received_at ? new Date(item.received_at) : null;
                  const expectedQty = Math.max(0, Number(item.quantity_received || 0));
                  const confirmedQty = Math.max(0, Number(item.received_units || 0));
                  const diff = Math.max(0, expectedQty - confirmedQty);
                  const fullyReceived = expectedQty > 0 && diff === 0 && confirmedQty > 0;
                  const partiallyReceived = confirmedQty > 0 && diff > 0;
                  const progressLabel = t('line_status_progress', {
                    received: confirmedQty,
                    total: expectedQty || confirmedQty
                  });
                  const rowClasses = ['border-t', 'transition-colors'];
                  if (fullyReceived) rowClasses.push('bg-emerald-50');
                  else if (partiallyReceived) rowClasses.push('bg-rose-50/70');
                  else if (sendDirect) rowClasses.push('bg-blue-50/60');
                  const lineStatus = fullyReceived
                    ? {
                        label: t('line_status_received'),
                        detail:
                          receivedAt
                            ? t('line_status_received_on', {
                                date: receivedAt.toLocaleDateString(DATE_LOCALE)
                              })
                            : progressLabel,
                        color: 'bg-green-100 text-green-800'
                      }
                    : partiallyReceived
                    ? {
                        label: t('status_partial'),
                        detail: t('qty_discrepancy', { count: diff }),
                        color: 'bg-rose-100 text-rose-800'
                      }
                    : {
                        label: t('line_status_pending'),
                        detail: progressLabel,
                        color: 'bg-gray-100 text-gray-700'
                      };
                  const lineEditable = editMode && !fullyReceived;
                  const imageUrl = resolveImageUrl(item);
                  const identifiers = resolveIdentifiers(item);
                  return (
                    <tr key={item.id || idx} className={rowClasses.join(' ')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded border bg-gray-50 flex items-center justify-center overflow-hidden text-[9px] text-text-secondary flex-shrink-0">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={item.product_name || 'Product photo'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              'No img'
                            )}
                          </div>
                          <div className="text-[10px] text-text-secondary space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] uppercase tracking-wide text-text-tertiary">
                                ASIN
                              </span>
                              <span className="font-mono text-[10px] text-text-primary">
                                {identifiers.asin}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] uppercase tracking-wide text-text-tertiary">
                                SKU
                              </span>
                              <span className="font-mono text-[10px] text-text-primary">
                                {identifiers.sku}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.product_name}
                      </td>
                    <td className="px-4 py-3 text-right">
                      {lineEditable ? (
                        <input
                          type="number"
                          min="1"
                          value={item.quantity_received || 1}
                            onChange={(e) =>
                              setEditItems((arr) => {
                                const copy = [...arr];
                                const qty = Math.max(1, parseInt(e.target.value || '1', 10));
                                const current = { ...copy[idx], quantity_received: qty };
                                if (current.send_to_fba && current.fba_qty != null) {
                                  current.fba_qty = Math.min(
                                    qty,
                                    Math.max(1, Number(current.fba_qty) || 1)
                                  );
                                }
                                copy[idx] = current;
                                return copy;
                              })
                            }
                            className="w-24 text-right px-2 py-1 border rounded"
                          />
                        ) : (
                          expectedQty
                        )}
                    </td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-text-primary font-semibold">
                          {confirmedQty}
                        </div>
                        {diff > 0 && (
                          <div className="text-xs text-red-600 font-semibold">
                            {t('qty_discrepancy', { count: diff })}
                          </div>
                        )}
                        {!lineEditable && diff === 0 && (
                          <div className="text-xs text-text-secondary">{t('no_discrepancy')}</div>
                        )}
                      </td>
                      {!editMode && (
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${lineStatus.color}`}
                            >
                              {lineStatus.label}
                            </span>
                            <span className="text-xs text-text-secondary mt-1">
                              {lineStatus.detail}
                            </span>
                          </div>
                        </td>
                      )}
                      {editMode && (
                        <td className="px-4 py-3 text-center">
                          {lineEditable ? (
                            <button
                              onClick={() =>
                                setEditItems((arr) => arr.filter((_, index) => index !== idx))
                              }
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-text-secondary">
                              {t('line_status_received')}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editMode && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() =>
                      setInventoryOpen((prev) => {
                        const next = !prev;
                        if (!next) {
                          setInventorySearch('');
                          setInventoryDraftQty({});
                        }
                        return next;
                      })
                    }
                    className="flex items-center px-3 py-2 text-primary border border-dashed rounded-lg hover:bg-primary hover:text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    {inventoryOpen ? t('inventory_close') : t('inventory_open')}
                  </button>
                </div>
                {inventoryOpen && (
                  <div className="border rounded-lg p-4 bg-white shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold">{t('inventory_title')}</p>
                      </div>
                      <input
                        type="text"
                        placeholder={t('inventory_search')}
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm w-full sm:w-72"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y">
                      {filteredInventory.map((item) => (
                        <div
                          key={item.id}
                          className="py-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded border bg-gray-50 flex items-center justify-center overflow-hidden text-[9px] text-text-secondary flex-shrink-0">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name || 'Product photo'}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                'No img'
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-text-primary">
                                {item.name || '—'}
                              </p>
                              <p className="text-xs text-text-secondary">
                                {(item.ean || item.asin || '—')}{' '}
                                · {t('inventory_in_stock', { qty: item.qty ?? 0 })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              className="w-20 text-right px-2 py-1 border rounded"
                              value={inventoryDraftQty[item.id] || ''}
                              onChange={(e) =>
                                setInventoryDraftQty((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value
                                }))
                              }
                            />
                            <button
                              onClick={() => handleInventoryAdd(item.id)}
                              className="px-3 py-1 bg-primary text-white rounded text-xs"
                            >
                              {t('inventory_add')}
                            </button>
                          </div>
                        </div>
                      ))}
                      {filteredInventory.length === 0 && (
                        <div className="py-4 text-center text-sm text-text-secondary">
                          {t('inventory_empty')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-text-primary">{t('page_title')}</h2>
          <p className="text-text-secondary">{t('page_subtitle')}</p>
          <p className="text-xs text-text-light">{t('report_hint')}</p>
        </div>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg ${
            messageType === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : messageType === 'info'
              ? 'bg-blue-50 border border-blue-200 text-blue-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 pt-4">
          <div className="text-sm text-text-secondary">
            Search receptions by client/tracking or product (SKU, ASIN, title).
          </div>
          <input
            type="text"
            value={shipmentsSearch}
            onChange={(e) => setShipmentsSearch(e.target.value)}
            placeholder="Search receptions..."
            className="w-full sm:w-80 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary"
          />
        </div>
        <table className="w-full min-w-[900px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('list_carrier')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('list_tracking')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                {storeLabel}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('list_status')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('list_products')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('list_date')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredShipments.length === 0 ? (
              <tr className="border-t">
                <td colSpan={7} className="px-6 py-8 text-center text-text-secondary">
                  <div className="font-medium">{t('empty_list_title')}</div>
                  <div className="text-sm text-text-light">{t('empty_list_desc')}</div>
                </td>
              </tr>
            ) : (
              filteredShipments.map((shipment) => {
                const trackingList = buildDisplayList(
                  shipment.tracking_ids,
                  shipment.tracking_id
                );
                const status = shipment.derived_status || shipment.status;
                const canDelete = !['processed', 'cancelled', 'received'].includes(status);

                return (
                  <tr key={shipment.id} className="border-t">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-text-primary font-medium">
                        {shipment.carrier || '—'}
                      </div>
                      {shipment.carrier_other && (
                        <div className="text-xs text-text-secondary">
                          {shipment.carrier_other}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {trackingList.length === 0 && <span className="text-text-secondary">—</span>}
                      {trackingList.map((tid) => (
                        <button
                          key={tid}
                          type="button"
                          title={tid}
                          onDoubleClick={() => copyToClipboard('Tracking ID', tid)}
                          className="block font-mono text-xs text-left text-text-primary hover:text-primary"
                        >
                          {truncateLabel(tid)}
                        </button>
                      ))}
                </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        type="button"
                        title={shipment.client_store_name || shipment.store_name || '—'}
                        onDoubleClick={() =>
                          copyToClipboard(
                            'Store reference',
                            shipment.client_store_name || shipment.store_name || ''
                          )
                        }
                        className="block text-text-primary text-left hover:text-primary"
                      >
                        {truncateLabel(shipment.client_store_name || shipment.store_name || '—')}
                      </button>
                      {shipment.notes && (
                        <div className="text-xs text-text-secondary line-clamp-2">
                          {shipment.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(shipment.derived_status || shipment.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-text-primary">
                        {(shipment.receiving_items?.length || 0)} {t('units_label')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-text-secondary">
                      {new Date(shipment.created_at).toLocaleDateString(DATE_LOCALE)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-3">
                      <button
                        onClick={() => handleSelectShipment(shipment)}
                        className="text-primary hover:text-primary-dark"
                      >
                        {t('view_details')}
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteShipment(shipment.id)}
                          disabled={deletingShipment}
                          className="text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {deletingShipment ? (t('deleting') || 'Deleting...') : (t('delete') || 'Delete')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ClientReceiving;
