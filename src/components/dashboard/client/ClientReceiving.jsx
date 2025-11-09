import React, { useEffect, useMemo, useState } from 'react';
import { Languages, FileDown, Plus, Edit, Trash2, Send } from 'lucide-react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabaseHelpers } from '../../../config/supabase';
import { supabase } from '../../../config/supabase';
import { useDashboardTranslation } from '@/translations';
import { useLanguage } from '@/contexts/LanguageContext';

const GUIDE_LANGS = ['fr', 'en', 'de', 'it', 'es', 'ro'];

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

const buildEditableList = (values, fallback) => {
  const list = buildDisplayList(values, fallback);
  return list.length ? list : [''];
};

const sanitizeList = (values) =>
  Array.isArray(values) ? values.map(normalizeValue).filter(Boolean) : [];

const cloneItems = (items = []) => items.map((item) => ({ ...item }));

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

function ClientReceiving() {
  const { t: baseT, tp } = useDashboardTranslation();
  const { currentLanguage } = useLanguage();
  const { profile } = useSupabaseAuth();

  const t = (key, params) =>
    params ? tp(`ClientReceiving.${key}`, params) : baseT(`ClientReceiving.${key}`);

  const DATE_LOCALE = DATE_LOCALE_MAP[currentLanguage] || 'en-US';

  const [shipments, setShipments] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editHeader, setEditHeader] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [savingEdits, setSavingEdits] = useState(false);
  const [stock, setStock] = useState([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryDraftQty, setInventoryDraftQty] = useState({});
  const filteredInventory = useMemo(() => {
    const term = inventorySearch.trim().toLowerCase();
    if (!term) return stock;
    return stock.filter((item) => {
      const hay = `${item.name || ''} ${item.ean || ''} ${item.sku || ''} ${item.asin || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [stock, inventorySearch]);

  const buildHeaderState = (shipment) => ({
    carrier: shipment?.carrier || '',
    carrier_other: shipment?.carrier_other || '',
    tracking_ids: buildEditableList(shipment?.tracking_ids, shipment?.tracking_id),
    fba_shipment_ids: buildEditableList(shipment?.fba_shipment_ids),
    notes: shipment?.notes || ''
  });

  const handleSelectShipment = (shipment) => {
    setSelectedShipment(shipment);
    setEditMode(false);
    setMessage('');
    setMessageType(null);
    setEditHeader(buildHeaderState(shipment));
    setEditItems(cloneItems(sortItems(shipment?.receiving_items)));
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
      const [shipmentsRes, carriersRes, stockRes] = await Promise.all([
        supabaseHelpers.getClientReceivingShipments(profile.company_id),
        supabaseHelpers.getCarriers(),
        supabase
          .from('stock_items')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
      ]);

      if (shipmentsRes.error) throw shipmentsRes.error;
      if (carriersRes.error) throw carriersRes.error;
      if (stockRes?.error) {
        console.error('Failed to load inventory', stockRes.error);
      }

      const nextShipments = Array.isArray(shipmentsRes.data) ? shipmentsRes.data : [];
      setShipments(nextShipments);
      setCarriers(carriersRes.data || []);
      setStock(Array.isArray(stockRes?.data) ? stockRes.data : []);
      return nextShipments;
    } catch (error) {
      setShipments([]);
      setMessage(`${t('load_error_prefix')}: ${error.message}`);
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

  const downloadImportGuide = async (lang) => {
    try {
      const path = `receiving/${lang}.pdf`;
      const { data, error } = await supabase.storage
        .from('user_guides')
        .createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setMessage(`${t('guide_download_error_prefix')} (${lang.toUpperCase()}): ${e.message}`);
      setMessageType('error');
    }
  };

  const HelpMenuButton = () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
        >
          <FileDown className="w-4 h-4 mr-2" />
          {t('import_instructions_pdf')}
          <Languages className="w-4 h-4 ml-2 opacity-80" />
        </button>

        {open && (
          <div className="absolute z-10 right-0 mt-2 w-44 bg-white border rounded-lg shadow-lg">
            {GUIDE_LANGS.map((lg) => (
              <button
                key={lg}
                onClick={async () => {
                  await downloadImportGuide(lg);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
              >
                {lg.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const getStatusBadge = (status) => {
    const map = {
      draft: { color: 'bg-gray-100 text-gray-800', text: t('status_draft') },
      submitted: { color: 'bg-yellow-100 text-yellow-800', text: t('status_submitted') },
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

      const payloadHeader = {
        carrier: toNull(editHeader.carrier),
        carrier_other:
          editHeader.carrier === 'OTHER' ? toNull(editHeader.carrier_other) : null,
        tracking_ids: trackingValues.length ? trackingValues : null,
        fba_shipment_ids: fbaValues.length ? fbaValues : null,
        notes: toNull(editHeader.notes)
      };

      const { error: headerError } = await supabaseHelpers.updateReceivingShipment(
        shipmentId,
        payloadHeader
      );
      if (headerError) throw headerError;

      if (typeof supabaseHelpers.deleteReceivingItemsByShipment === 'function') {
        const { error: delErr } = await supabaseHelpers.deleteReceivingItemsByShipment(
          shipmentId
        );
        if (delErr) throw delErr;
      }

      const itemsPayload = (editItems || []).map((item) => ({
        shipment_id: shipmentId,
        ean_asin: item.ean_asin,
        product_name: item.product_name,
        quantity_received: Number(item.quantity_received) || 0,
        sku: item.sku || null,
        purchase_price: item.purchase_price ?? null,
        send_to_fba: !!item.send_to_fba,
        fba_qty: item.send_to_fba ? item.fba_qty ?? null : null
      }));

      if (itemsPayload.length) {
        const { error: itemsError } = await supabaseHelpers.createReceivingItems(itemsPayload);
        if (itemsError) throw itemsError;
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
      setMessage(`${t('generic_error_prefix')}: ${e.message}`);
      setMessageType('error');
    } finally {
      setSavingEdits(false);
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
        prev
          ? {
              ...prev,
              status: 'submitted'
            }
          : prev
      );
      setMessage(t('reception_sent'));
      setMessageType('success');
    } catch (err) {
      setMessage(`${t('generic_error_prefix')}: ${err.message}`);
      setMessageType('error');
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
        ean_asin: stockItem.ean || stockItem.asin || '',
        product_name: stockItem.name || '',
        quantity_received: qtyValue,
        sku: stockItem.sku || null,
        purchase_price: stockItem.purchase_price ?? null,
        send_to_fba: false,
        fba_qty: null
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
    const canEdit = ['draft', 'submitted'].includes(selectedShipment.status);
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
          <HelpMenuButton />
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
            <div className="flex items-center space-x-4">
              {getStatusBadge(selectedShipment.status)}
              <span className="text-text-secondary">
                {new Date(selectedShipment.created_at).toLocaleDateString(DATE_LOCALE)}
              </span>
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
                      <option key={c.id} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                    <option value="OTHER">{t('other')}</option>
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
                FBA Shipment ID(s)
              </label>
              {editMode ? (
                <>
                  {(headerState.fba_shipment_ids || ['']).map((id, index) => (
                    <div key={index} className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={id}
                        onChange={(e) => {
                          const updated = [...(headerState.fba_shipment_ids || [])];
                          updated[index] = e.target.value;
                          setEditHeader((prev) => ({ ...prev, fba_shipment_ids: updated }));
                        }}
                        className="flex-1 px-3 py-2 border rounded-lg font-mono"
                        placeholder="Ex: FBA15L104JZW"
                      />
                      {(headerState.fba_shipment_ids?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = headerState.fba_shipment_ids.filter(
                              (_, i) => i !== index
                            );
                            setEditHeader((prev) => ({ ...prev, fba_shipment_ids: updated }));
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
                        fba_shipment_ids: [...(prev?.fba_shipment_ids || []), '']
                      }))
                    }
                    className="text-primary hover:underline text-sm"
                  >
                    {t('add_fba_id') || 'Add FBA Shipment ID'}
                  </button>
                </>
              ) : (
                <>
                  {fbaValues.length === 0 && <p className="text-text-secondary">—</p>}
                  {fbaValues.map((id, idx) => (
                    <p key={idx} className="text-blue-600 font-mono">
                      {id}
                    </p>
                  ))}
                </>
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
                  <th className="px-4 py-3 text-right">{t('th_qty')}</th>
                  <th className="px-4 py-3 text-left">{t('th_sku')}</th>
                  <th className="px-4 py-3 text-right">{t('th_price')}</th>
                  <th className="px-4 py-3 text-center">{t('th_send_to_fba')}</th>
                  <th className="px-4 py-3 text-center">{t('th_validation')}</th>
                  {editMode && (
                    <th className="px-4 py-3 text-center">{t('actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {viewItems.map((item, idx) => (
                  <tr key={item.id || idx} className="border-t">
                    <td className="px-4 py-3 font-mono">
                      {editMode ? (
                        <input
                          value={item.ean_asin || ''}
                          onChange={(e) =>
                            setEditItems((arr) => {
                              const copy = [...arr];
                              copy[idx] = { ...copy[idx], ean_asin: e.target.value };
                              return copy;
                            })
                          }
                          className="w-full px-2 py-1 border rounded"
                        />
                      ) : (
                        item.ean_asin
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editMode ? (
                        <input
                          value={item.product_name || ''}
                          onChange={(e) =>
                            setEditItems((arr) => {
                              const copy = [...arr];
                              copy[idx] = { ...copy[idx], product_name: e.target.value };
                              return copy;
                            })
                          }
                          className="w-full px-2 py-1 border rounded"
                        />
                      ) : (
                        item.product_name
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editMode ? (
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
                        item.quantity_received
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {editMode ? (
                        <input
                          value={item.sku || ''}
                          onChange={(e) =>
                            setEditItems((arr) => {
                              const copy = [...arr];
                              copy[idx] = { ...copy[idx], sku: e.target.value || null };
                              return copy;
                            })
                          }
                          className="w-full px-2 py-1 border rounded"
                        />
                      ) : (
                        item.sku || '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editMode ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.purchase_price ?? ''}
                          onChange={(e) =>
                            setEditItems((arr) => {
                              const copy = [...arr];
                              const value =
                                e.target.value === '' ? null : parseFloat(e.target.value);
                              copy[idx] = { ...copy[idx], purchase_price: value };
                              return copy;
                            })
                          }
                          className="w-24 text-right px-2 py-1 border rounded"
                        />
                      ) : item.purchase_price != null ? (
                        new Intl.NumberFormat(DATE_LOCALE, {
                          style: 'currency',
                          currency: 'EUR'
                        }).format(item.purchase_price)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editMode ? (
                        <div className="flex flex-col items-center gap-1">
                          <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
                            <input
                              type="checkbox"
                              checked={!!item.send_to_fba}
                              onChange={(e) =>
                                setEditItems((arr) => {
                                  const copy = [...arr];
                                  const v = e.target.checked;
                                  const current = { ...copy[idx], send_to_fba: v };
                                  if (v && (current.fba_qty == null || current.fba_qty < 1)) {
                                    const qty =
                                      Math.max(1, Number(current.quantity_received) || 1);
                                    current.fba_qty = qty;
                                  }
                                  if (!v) current.fba_qty = null;
                                  copy[idx] = current;
                                  return copy;
                                })
                              }
                            />
                            {t('fba_direct')}
                          </label>
                          {item.send_to_fba && (
                            <input
                              type="number"
                              min="1"
                              value={item.fba_qty ?? ''}
                              onChange={(e) =>
                                setEditItems((arr) => {
                                  const copy = [...arr];
                                  const qty =
                                    Math.max(1, Number(copy[idx].quantity_received) || 1);
                                  const val = Number(e.target.value);
                                  copy[idx] = {
                                    ...copy[idx],
                                    fba_qty: Number.isFinite(val)
                                      ? Math.min(qty, Math.max(1, val))
                                      : null
                                  };
                                  return copy;
                                })
                              }
                              className="w-16 text-right px-2 py-0.5 border border-yellow-300 rounded bg-white"
                              placeholder={t('fba_qty_ph')}
                            />
                          )}
                        </div>
                      ) : item.send_to_fba || item.fba_qty ? (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                          {item.fba_qty
                            ? t('direct_with_qty', { qty: item.fba_qty })
                            : t('fba_direct')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {validateEAN(item.ean_asin).valid ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-red-600">✗</span>
                      )}
                    </td>
                    {editMode && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() =>
                            setEditItems((arr) => arr.filter((_, index) => index !== idx))
                          }
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {editMode && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() =>
                      setEditItems((arr) => [
                        ...arr,
                        {
                          id: undefined,
                          ean_asin: '',
                          product_name: '',
                          quantity_received: 1,
                          sku: null,
                          purchase_price: null,
                          send_to_fba: false,
                          fba_qty: null
                        }
                      ])
                    }
                    className="flex items-center px-3 py-2 text-primary border border-primary rounded-lg hover:bg-primary hover:text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> {t('add_row')}
                  </button>
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
                          <div>
                            <p className="font-semibold text-text-primary">
                              {item.name || '—'}
                            </p>
                            <p className="text-xs text-text-secondary">
                              {(item.ean || item.asin || '—')}{' '}
                              · {t('inventory_in_stock', { qty: item.qty ?? 0 })}
                            </p>
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
        <HelpMenuButton />
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
                FBA Shipment ID(s)
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
            {shipments.length === 0 ? (
              <tr className="border-t">
                <td colSpan={7} className="px-6 py-8 text-center text-text-secondary">
                  <div className="font-medium">{t('empty_list_title')}</div>
                  <div className="text-sm text-text-light">{t('empty_list_desc')}</div>
                </td>
              </tr>
            ) : (
              shipments.map((shipment) => {
                const trackingList = buildDisplayList(
                  shipment.tracking_ids,
                  shipment.tracking_id
                );
                const fbaList = buildDisplayList(shipment.fba_shipment_ids);

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
                        <p key={tid} className="font-mono text-xs">
                          {tid}
                        </p>
                      ))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {fbaList.length === 0 && <span className="text-text-secondary">—</span>}
                      {fbaList.map((id) => (
                        <p key={id} className="font-mono text-blue-600 text-xs">
                          {id}
                        </p>
                      ))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(shipment.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-text-primary">
                        {(shipment.receiving_items?.length || 0)} {t('units_label')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-text-secondary">
                      {new Date(shipment.created_at).toLocaleDateString(DATE_LOCALE)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleSelectShipment(shipment)}
                        className="text-primary hover:text-primary-dark"
                      >
                        {t('view_details')}
                      </button>
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
