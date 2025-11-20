import React, { useState, useEffect, useMemo } from 'react';
import { supabaseHelpers } from '../../config/supabase';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { supabase } from '../../config/supabase';
import {
  Search, Filter, Package, Truck, CheckCircle,
  ArrowLeft, Trash2, ChevronLeft, ChevronRight, Clock, User, Building, X
} from 'lucide-react';
import DestinationBadge from '@/components/common/DestinationBadge';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { tabSessionStorage, readJSON, writeJSON } from '@/utils/tabStorage';
import { encodeRemainingAction, resolveFbaIntent } from '@/utils/receivingFba';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_REGEX.test(value);

const STATUS_PRIORITY = {
  draft: 1,
  submitted: 1,
  partial: 1,
  received: 2,
  processed: 2,
  cancelled: 3
};

const StatusPill = ({ status }) => {
  const statusMap = {
    draft: { color: 'bg-gray-100 text-gray-800', text: 'Draft' },
    submitted: { color: 'bg-yellow-100 text-yellow-800', text: 'Submitted' },
    partial: { color: 'bg-amber-100 text-amber-800', text: 'Partial processed' },
    received: { color: 'bg-blue-100 text-blue-800', text: 'Received' },
    processed: { color: 'bg-green-100 text-green-800', text: 'Processed' },
    cancelled: { color: 'bg-red-100 text-red-800', text: 'Cancelled' }
  };
  const badge = statusMap[status] || statusMap.draft;
  return <span className={`px-2 py-1 text-xs rounded-full ${badge.color}`}>{badge.text}</span>;
};

const FBA_MODE_META = {
  none: {
    label: 'No direct Amazon shipment',
    detail: 'Client wants everything stored in the prep center.',
    badge: 'bg-gray-100 text-gray-700'
  },
  full: {
    label: 'Send everything to Amazon',
    detail: 'Client asked for the full reception to go straight to Amazon.',
    badge: 'bg-sky-100 text-sky-800'
  },
  partial: {
    label: 'Partial Amazon shipment',
    detail: 'Client wants only part of the reception sent to Amazon. Double-check the per-line quantities below.',
    badge: 'bg-indigo-100 text-indigo-800'
  }
};

const getFbaModeMeta = (mode = 'none') => FBA_MODE_META[mode] || FBA_MODE_META.none;

function AdminReceivingDetail({ shipment, onBack, onUpdate }) {
  const { profile } = useSupabaseAuth();
  const carriers = [
    { id: 1, code: 'UPS',         name: 'UPS' },
    { id: 2, code: 'COLISSIMO',   name: 'Colissimo' },
    { id: 3, code: 'CHRONOPOST',  name: 'Chronopost' },
    { id: 4, code: 'DPD',         name: 'DPD' },
    { id: 5, code: 'GLS',         name: 'GLS' },
    { id: 6, code: 'DHL',         name: 'DHL' },
    { id: 7, code: 'COLISPRIVE',  name: 'ColisPrive' },
    { id: 8, code: 'AMAZON',      name: 'Amazon' },
    { id: 9, code: 'ELOGISTICS',  name: 'eLogistics' },
    { id: 999, code: 'OTHER',     name: 'Other' }
  ];
  const storageKey = useMemo(() => `admin-receiving-detail-${shipment.id}`, [shipment.id]);
  const [items, setItems] = useState(shipment.receiving_items || []);
  const [stockMatches, setStockMatches] = useState({});
  const [message, setMessage] = useState('');
  const [savingRow, setSavingRow] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const buildHeaderState = (sh) => ({
    carrier: sh.carrier || '',
    carrier_other: sh.carrier_other || '',
    tracking_ids: sh.tracking_ids?.length
      ? sh.tracking_ids
      : sh.tracking_id
      ? [sh.tracking_id]
      : [''],
    fba_shipment_ids: sh.fba_shipment_ids?.length
      ? sh.fba_shipment_ids
      : [''],
    notes: sh.notes || '',
    fba_mode: sh.fba_mode || 'none'
  });
  const [editHeader, setEditHeader] = useState(buildHeaderState(shipment));
  const [selectedPrepIds, setSelectedPrepIds] = useState(new Set());
  const [creatingPrep, setCreatingPrep] = useState(false);
  const [receivedDrafts, setReceivedDrafts] = useState({});

  useEffect(() => {
    setSelectedPrepIds(new Set());
    setReceivedDrafts({});
  }, [shipment.id]);

  useEffect(() => {
    setItems(shipment.receiving_items || []);
    setEditHeader(buildHeaderState(shipment));
  }, [shipment]);

  const getExpectedQty = (item) =>
    Math.max(0, Number(item?.quantity_received || 0));
  const getConfirmedQty = (item) => {
    if (!item) return 0;
    const base =
      item.received_units != null
        ? Number(item.received_units)
        : Number(item.quantity_received || 0);
    return Number.isFinite(base) && base >= 0 ? base : 0;
  };

  const isPrepEligible = (item) => {
    if (!item?.id || !isUuid(String(item.id))) return false;
    const fbaQty = Math.max(0, Number(item.fba_qty || 0));
    if (fbaQty === 0) return false;
    const receivedUnits = getConfirmedQty(item);
    return receivedUnits >= fbaQty;
  };

  const prepSelectableItems = useMemo(
    () => items.filter((item) => isPrepEligible(item) && !item.prep_request_created),
    [items]
  );
  const allPrepSelected =
    prepSelectableItems.length > 0 &&
    prepSelectableItems.every((item) => selectedPrepIds.has(item.id));

  useEffect(() => {
    setSelectedPrepIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(
        items
          .filter((item) => isPrepEligible(item) && !item.prep_request_created)
          .map((item) => item.id)
      );
      const next = new Set();
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id);
      });
      return next;
    });
  }, [items]);

  useEffect(() => {
    try {
      const parsed = readJSON(tabSessionStorage, storageKey, null);
      if (!parsed) return;
      if (parsed.snapshot && parsed.snapshot !== (shipment.updated_at || shipment.id)) {
        tabSessionStorage.removeItem(storageKey);
        return;
      }
      if (parsed.items) setItems(parsed.items);
      if (parsed.editHeader) {
        setEditHeader((prev) => ({ ...prev, ...parsed.editHeader }));
      }
      if (parsed.receivedDrafts) {
        setReceivedDrafts(parsed.receivedDrafts);
      }
    } catch {
      // ignore corrupted drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, shipment.updated_at, shipment.id]);

  useEffect(() => {
    writeJSON(tabSessionStorage, storageKey, {
      items,
      editHeader,
      receivedDrafts,
      snapshot: shipment.updated_at || shipment.id
    });
  }, [storageKey, shipment.updated_at, shipment.id, items, editHeader, receivedDrafts]);

  const getDraftReceivedValue = (item) => {
    if (!item?.id) return String(getConfirmedQty(item));
    if (Object.prototype.hasOwnProperty.call(receivedDrafts, item.id)) {
      return receivedDrafts[item.id];
    }
    return String(getConfirmedQty(item));
  };
  const handleReceivedDraftChange = (itemId, value) => {
    if (!itemId) return;
    setReceivedDrafts((prev) => ({ ...prev, [itemId]: value }));
  };
  const persistReceivedUnits = async (item) => {
    if (!item?.id) return;
    const draft = Object.prototype.hasOwnProperty.call(receivedDrafts, item.id)
      ? receivedDrafts[item.id]
      : item.received_units ?? item.quantity_received;
    const parsed = Math.max(0, Math.floor(Number(draft) || 0));
    const current = getConfirmedQty(item);
    if (parsed === current) {
      setReceivedDrafts((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, item.id)) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    const delta = parsed - current;

    setSavingRow(item.id);
    try {
      if (!profile?.id) throw new Error('Profile unavailable');
      const payload = { received_units: parsed };
      const expected = getExpectedQty(item);
      payload.is_received = parsed >= expected;
      const fbaReserve = Math.max(
        0,
        Math.min(parsed, Number(item.fba_qty || 0))
      );
      const qtyToStock = Math.max(0, parsed - fbaReserve);
      payload.quantity_to_stock = qtyToStock;
      const intent = resolveFbaIntent(item);
      payload.remaining_action = encodeRemainingAction(
        fbaReserve > 0,
        fbaReserve || intent.qtyHint || parsed
      );

      await supabaseHelpers.updateReceivingItem(item.id, payload);
      if (delta !== 0) {
        const { error: stockError, stock_item_id } =
          await supabaseHelpers.adjustInventoryForReceiving(
            {
              ...item,
              company_id: shipment.company_id,
              stock_item: item.stock_item
            },
            delta,
            profile.id
          );
        if (stockError) throw stockError;
        if (stock_item_id && !item.stock_item_id) {
          item.stock_item_id = stock_item_id;
        }
      }
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                received_units: parsed,
                is_received: payload.is_received,
                quantity_to_stock: payload.quantity_to_stock,
                stock_item_id: item.stock_item_id || row.stock_item_id
              }
            : row
        )
      );
      setReceivedDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setMessage('Received units updated successfully.');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSavingRow(null);
    }
  };

  const derivedStatus = useMemo(() => {
    if (['cancelled', 'processed'].includes(shipment.status)) return shipment.status;
    if (!items || items.length === 0) return shipment.status || 'submitted';
    const allReceived = items.every((item) => {
      const expected = getExpectedQty(item);
      if (expected <= 0) return true;
      return getConfirmedQty(item) >= expected;
    });
    const anyReceived = items.some((item) => getConfirmedQty(item) > 0);
    if (allReceived && anyReceived) return 'processed';
    if (anyReceived) return 'partial';
    return 'submitted';
  }, [items, shipment.status]);

  const clearDraft = () => {
    try {
      tabSessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  const handleBack = () => {
    clearDraft();
    onBack();
  };

  const togglePrepSelection = (itemId) => {
    if (!itemId || !isUuid(String(itemId))) return;
    setSelectedPrepIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAllPrep = (checked) => {
    if (!checked) {
      setSelectedPrepIds(new Set());
      return;
    }
    const next = new Set(
      items
        .filter((item) => isPrepEligible(item) && !item.prep_request_created)
        .map((item) => item.id)
    );
    setSelectedPrepIds(next);
  };

  const handleCreatePrepRequest = async () => {
    if (selectedPrepIds.size === 0) return;
    if (!profile?.id) {
      setMessage('Profile unavailable. Please try again.');
      return;
    }
    const prepIds = Array.from(selectedPrepIds);
    const lines = items.filter((item) => item.id && prepIds.includes(item.id));
    const invalid = lines.filter((item) => !isPrepEligible(item));
    if (invalid.length > 0) {
      setMessage('Select only lines where received units cover the FBA quantity.');
      return;
    }

    const itemsToProcess = lines.map((item) => {
      const confirmedQty = getConfirmedQty(item);
      const fbaValue = Math.max(0, Math.min(confirmedQty, Number(item.fba_qty || 0)));
      const toStock = Math.max(0, confirmedQty - fbaValue);
      const asinValue = item.asin || item.stock_item?.asin || null;
      const skuValue = item.sku || item.stock_item?.sku || null;
      const sendDirect = fbaValue > 0;
      return {
        ...item,
        asin: asinValue,
        sku: skuValue,
        company_id: shipment.company_id,
        quantity_to_stock: toStock,
        remaining_action: encodeRemainingAction(sendDirect, fbaValue || confirmedQty),
        send_to_fba: sendDirect,
        fba_qty: fbaValue
      };
    });

    try {
      setCreatingPrep(true);
      const { error, fbaLines } = await supabaseHelpers.processReceivingToStock(
        shipment.id,
        profile.id,
        itemsToProcess,
        { skipShipmentUpdate: true, createPrepRequest: false }
      );
      if (error) throw error;
      if (!fbaLines || fbaLines.length === 0) {
        throw new Error('No units ready to send to prep.');
      }
      await supabaseHelpers.createPrepRequest({
        company_id: shipment.company_id,
        user_id: shipment.user_id || shipment.created_by || profile.id,
        destination_country: shipment.destination_country || 'FR',
        status: 'pending',
        items: fbaLines
      });
      await supabase
        .from('receiving_items')
        .update({ fba_qty: 0 })
        .in('id', prepIds);
      const updated = new Set(prepIds);
      setItems((prev) =>
        prev.map((item) => {
          if (!updated.has(item.id)) return item;
          const confirmedQty = getConfirmedQty(item);
          const fbaValue = Math.max(0, Math.min(confirmedQty, Number(item.fba_qty || 0)));
          return {
            ...item,
            fba_qty: 0,
            quantity_to_stock: Math.max(0, confirmedQty - fbaValue),
            send_to_fba: false,
            prep_request_created: true
          };
        })
      );
      setSelectedPrepIds(new Set());
      setMessage('Send to prep successful.');
    } catch (error) {
      console.error('create prep request failed', error);
      setMessage(error?.message || 'Failed to create prep request.');
    } finally {
      setCreatingPrep(false);
    }
  };

  const updateFba = async (itemId, patch) => {
    setSavingRow(itemId);
    try {
      const idx = items.findIndex(i => i.id === itemId);
      if (idx === -1) return;

      const base = items[idx];
      const confirmed = getConfirmedQty(base);
      const next = {
        send_to_fba: patch.send_to_fba ?? base.send_to_fba,
        fba_qty: patch.hasOwnProperty('fba_qty') 
          ? (patch.fba_qty === '' ? null : Number(patch.fba_qty)) 
          : base.fba_qty
      };

      if (!next.send_to_fba) next.fba_qty = null;
      if (next.send_to_fba && (next.fba_qty == null || next.fba_qty < 1)) next.fba_qty = 1;
      if (next.send_to_fba && next.fba_qty > confirmed) next.fba_qty = confirmed;

      await supabaseHelpers.updateReceivingItem(itemId, {
        send_to_fba: next.send_to_fba,
        fba_qty: next.fba_qty
      });

      const clone = [...items];
      clone[idx] = { ...base, ...next };
      setItems(clone);
    } finally {
      setSavingRow(null);
    }
  };

useEffect(() => {
  checkStockMatches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [shipment.company_id, items]);

// în AdminReceivingDetail, păstrează useEffect-ul și înlocuiește funcția
const checkStockMatches = async () => {
  if (!shipment.company_id || items.length === 0) return;
  const eans = Array.from(
    new Set(
      items
        .map((i) => i.ean || i.ean_asin || i.stock_item?.ean || null)
        .filter(Boolean)
    )
  );
  if (eans.length === 0) {
    setStockMatches({});
    return;
  }
  const { data: matches, error } = await supabaseHelpers.findStockMatches(
    shipment.company_id,
    eans
  );
  if (error) {
    setStockMatches({});
    return;
  }
  const map = {};
  (matches || []).forEach(m => { map[m.ean] = m; });
  setStockMatches(map);
};

  const deleteThisShipment = async () => {
    if (!confirm('Delete this reception? This action cannot be undone.')) return;
    try {
      let { error } = await supabaseHelpers.deleteReceivingShipment(shipment.id);
      if (error && /foreign key|constraint/i.test(error.message)) {
        const { error: e1 } = await supabase
          .from('receiving_items')
          .delete()
          .eq('shipment_id', shipment.id);
        if (e1) throw e1;

        const { error: e2 } = await supabaseHelpers.deleteReceivingShipment(shipment.id);
        if (e2) throw e2;

        error = null;
      }
      if (error) throw error;

      setMessage('Reception deleted successfully.');
      onUpdate();
      handleBack();
    } catch (err) {
      setMessage(`Delete error: ${err.message}`);
    }
  };

  const fbaModeValue = editHeader.fba_mode || shipment.fba_mode || 'none';
  const fbaMeta = getFbaModeMeta(fbaModeValue);
  const hasFbaLines = items.some((item) => {
    const intent = resolveFbaIntent(item);
    return intent.hasIntent || intent.directFromAction;
  });
  const showFbaInfo = fbaModeValue !== 'none' || hasFbaLines;
  const messageSuccess = typeof message === 'string' && message.toLowerCase().includes('success');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={handleBack} className="flex items-center text-text-secondary hover:text-primary">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to list
        </button>
        {(
          ['draft', 'submitted', 'received', 'processed', 'cancelled'].includes(shipment.status)
        ) && (
          <button
            onClick={() => setEditMode(true)}
            className="px-3 py-1 border border-blue-500 text-blue-600 rounded hover:bg-blue-50"
          >
            Edit
          </button>
        )}
        <div className="flex items-center space-x-4">
          <DestinationBadge code={shipment.destination_country || 'FR'} variant="hero" />
          <StatusPill status={derivedStatus} />
          <span className="text-text-secondary">
            {new Date(shipment.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg ${
          messageSuccess
            ? 'bg-green-50 border border-green-200 text-green-600'
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {message}
        </div>
      )}

      {showFbaInfo && (
        <div className="px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-sm">
          <p className="font-semibold">{fbaMeta.label}</p>
          <p className="text-xs mt-1">{fbaMeta.detail}</p>
        </div>
      )}

      {/* Shipment Header (card) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Reception #{shipment.id.slice(0, 8)}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-text-secondary">Client</label>
            <p className="text-text-primary">
              {shipment.store_name || shipment.client_name || '—'}
              <br />
              <span className="text-sm text-text-secondary">{shipment.client_email || shipment.user_email || '—'}</span>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary">Destination</label>
            <DestinationBadge code={shipment.destination_country || 'FR'} variant="loud" />
          </div>
           <div>
          <label className="block text-sm font-medium text-text-secondary">Carrier</label>
          {editMode ? (
            <>
      <select
        value={editHeader.carrier}
        onChange={e => setEditHeader(h => ({ ...h, carrier: e.target.value }))}
        className="border rounded px-2 py-1 w-full mb-2"
      >
        <option value="">Select carrier</option>
        {carriers.map(c => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
        <option value="OTHER">Other</option>
      </select>

      {editHeader.carrier === 'OTHER' && (
        <input
          type="text"
          placeholder="Carrier name"
          value={editHeader.carrier_other}
          onChange={e => setEditHeader(h => ({ ...h, carrier_other: e.target.value }))}
          className="border rounded px-2 py-1 w-full mb-2"
        />
      )}

      <label className="block text-sm font-medium text-text-secondary mt-3">Tracking numbers</label>
      {(editHeader.tracking_ids || ['']).map((num, index) => (
        <div key={index} className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={num}
            onChange={(e) => {
              const updated = [...(editHeader.tracking_ids || [])];
              updated[index] = e.target.value;
              setEditHeader({ ...editHeader, tracking_ids: updated });
            }}
            className="flex-1 px-3 py-2 border rounded font-mono"
            placeholder="e.g. 1Z999AA1234567890"
          />
          {(editHeader.tracking_ids?.length ?? 0) > 1 && (
            <button
              type="button"
              onClick={() => {
                const updated = editHeader.tracking_ids.filter((_, i) => i !== index);
                setEditHeader({ ...editHeader, tracking_ids: updated });
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
          setEditHeader({
            ...editHeader,
            tracking_ids: [...(editHeader.tracking_ids || []), ''],
          })
        }
        className="text-blue-600 hover:underline text-sm"
      >
        Add tracking number
      </button>
      {/* === Bloc FBA Shipment IDs === */}
        <label className="block text-sm font-medium text-text-secondary mt-3">FBA Shipment ID(s)</label>
        {(editHeader.fba_shipment_ids || ['']).map((id, index) => (
          <div key={index} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={id}
              onChange={(e) => {
                const updated = [...(editHeader.fba_shipment_ids || [])];
                updated[index] = e.target.value;
                setEditHeader({ ...editHeader, fba_shipment_ids: updated });
              }}
              className="flex-1 px-3 py-2 border rounded font-mono"
              placeholder="e.g. FBA15KZV38J"
            />
            {(editHeader.fba_shipment_ids?.length ?? 0) > 1 && (
              <button
                type="button"
                onClick={() => {
                  const updated = editHeader.fba_shipment_ids.filter((_, i) => i !== index);
                  setEditHeader({ ...editHeader, fba_shipment_ids: updated });
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
            setEditHeader({
              ...editHeader,
              fba_shipment_ids: [...(editHeader.fba_shipment_ids || []), ''],
            })
          }
          className="text-blue-600 hover:underline text-sm"
        >
          Add FBA Shipment ID
        </button>
    </>
  ) : (
 <>
    {/* în AdminReceivingDetail, în zona "else" (când nu e editMode) la Transporteur */}
    <p className="text-text-primary">
      {shipment.carrier || '—'}
      {shipment.carrier_other && ` (${shipment.carrier_other})`}
    </p>

    {(Array.isArray(shipment.tracking_ids) ? shipment.tracking_ids : [shipment.tracking_id])
      .filter(Boolean)
      .map((id, i) => (
        <p key={i} className="font-mono text-text-secondary">{id}</p>
      ))}

    {(shipment.fba_shipment_ids || []).filter(Boolean).length > 0 && (
      <div className="mt-3">
        <label className="block text-sm font-medium text-text-secondary">
          FBA Shipment ID(s)
        </label>
        {shipment.fba_shipment_ids.map((id, i) => (
          <p key={i} className="font-mono text-blue-600">{id}</p>
        ))}
      </div>
    )}
  </>
  )}
</div>

          <div>
            <label className="block text-sm font-medium text-text-secondary">Notes</label>
            {editMode ? (
               <textarea
                value={editHeader.notes}
                onChange={e => setEditHeader(h => ({ ...h, notes: e.target.value }))}
                className="border rounded px-2 py-1 w-full"
                rows={2}
              />
            ) : (
              <p className="text-text-primary">{shipment.notes || '—'}</p>
            )}
            
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary">Direct Amazon shipment</label>
            {editMode ? (
              <select
                value={editHeader.fba_mode || 'none'}
                onChange={(e) =>
                  setEditHeader((prev) => ({ ...prev, fba_mode: e.target.value }))
                }
                className="border rounded px-2 py-1 w-full"
              >
                <option value="none">Store everything</option>
                <option value="full">Send everything to Amazon</option>
                <option value="partial">Partial shipment</option>
              </select>
            ) : (
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${fbaMeta.badge}`}>
                {fbaMeta.label}
              </span>
            )}
          </div>
            <div>
            <label className="block text-sm font-medium text-text-secondary">Statut</label>
            {editMode ? (
              <select
                value={editHeader.status || shipment.status || 'draft'}
                onChange={(e) => setEditHeader(h => ({ ...h, status: e.target.value }))}
                className="border rounded px-2 py-1 w-full"
              >
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="partial">Partial</option>
                <option value="received">Received</option>
                <option value="processed">Processed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            ) : (
              <StatusPill status={shipment.status} />
            )}
          </div>
        </div>

        {editMode && (
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={async () => {
                const cleanTracking = (editHeader.tracking_ids || [])
                  .map(v => v.trim())
                  .filter(v => v !== '');

              const cleanFBA = (editHeader.fba_shipment_ids || [])
                .map(v => v.trim())
                .filter(v => v !== '');

           await supabaseHelpers.updateReceivingShipment(shipment.id, {
              carrier: editHeader.carrier || null,
              carrier_other: editHeader.carrier_other || null,
              tracking_ids: cleanTracking.length > 0 ? cleanTracking : [],
              fba_shipment_ids: cleanFBA.length > 0 ? cleanFBA : [],
              notes: editHeader.notes?.trim() || null,
              status: editHeader.status || shipment.status,
              fba_mode: editHeader.fba_mode || shipment.fba_mode || 'none'
            });
                setEditMode(false);
               onUpdate();
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save changes
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
        {/* Actions (în interiorul cardului) */}
        <div className="flex justify-end space-x-3">
          {shipment.status === 'submitted' && (
            <button
              onClick={deleteThisShipment}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </button>
          )}
        </div>
      {/* Items Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-semibold text-text-primary mb-4">
          Products ({items.length})
        </h4>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-sm text-text-secondary">
            {prepSelectableItems.length === 0
              ? 'No lines are ready for Amazon yet.'
              : selectedPrepIds.size > 0
              ? `${selectedPrepIds.size} line${selectedPrepIds.size === 1 ? '' : 's'} ready to send to Amazon`
              : 'Select received lines to create a prep request.'}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={prepSelectableItems.length > 0 && allPrepSelected}
                onChange={(e) => toggleSelectAllPrep(e.target.checked)}
                disabled={prepSelectableItems.length === 0}
              />
              Select all ready
            </label>
            <button
              onClick={handleCreatePrepRequest}
              disabled={selectedPrepIds.size === 0 || creatingPrep}
              className="inline-flex items-center px-3 py-2 rounded border border-blue-500 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {creatingPrep ? 'Sending…' : 'Send to prep'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">Photo</th>
                <th className="px-4 py-3 text-left">EAN / ASIN</th>
                <th className="px-4 py-3 text-left">Product name</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-center">FBA</th>
                <th className="px-4 py-3 text-center">Prep</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const asin = item.asin || item.stock_item?.asin || '—';
                const eanValue = item.ean || item.ean_asin || item.stock_item?.ean || '—';
                const productName = item.product_name || item.stock_item?.name || '—';
                const imageUrl = item.stock_item?.image_url || item.image_url || '';
                const skuValue = item.sku || item.stock_item?.sku || '—';
                const intent = resolveFbaIntent(item);
                const confirmedQty = getConfirmedQty(item);
                const expectedQty = getExpectedQty(item);
                let plannedFbaQty = intent.qty > 0 ? intent.qty : 0;
                if (plannedFbaQty === 0 && intent.directFromAction) {
                  plannedFbaQty = expectedQty;
                }
                plannedFbaQty = Math.min(plannedFbaQty, expectedQty);
                const sentToAmazon = confirmedQty > 0
                  ? Math.min(plannedFbaQty || confirmedQty, confirmedQty)
                  : 0;
                const pendingFba = Math.max(0, plannedFbaQty - sentToAmazon);
                const hasDirectIntent = intent.hasIntent || intent.directFromAction;
                const receivedAt = item.received_at ? new Date(item.received_at) : null;
                let lineStatus;
                if (expectedQty <= 0 && confirmedQty <= 0) {
                  lineStatus = {
                    label: 'Pending',
                    detail: '0 received',
                    color: 'bg-gray-100 text-gray-700'
                  };
                } else if (confirmedQty <= 0) {
                  lineStatus = {
                    label: 'Pending',
                    detail: `0/${expectedQty} received`,
                    color: 'bg-gray-100 text-gray-700'
                  };
                } else if (confirmedQty >= expectedQty) {
                  lineStatus = {
                    label: 'Received',
                    detail: `${confirmedQty}/${expectedQty} received`,
                    color: 'bg-green-100 text-green-800'
                  };
                } else {
                  const diff = Math.max(0, expectedQty - confirmedQty);
                  lineStatus = {
                    label: 'Partial',
                    detail: `${confirmedQty}/${expectedQty} received, ${diff} pending`,
                    color: 'bg-amber-100 text-amber-800'
                  };
                }
                const rowClasses = ['border-t', 'transition-colors'];
                if (hasDirectIntent) rowClasses.push('bg-sky-50/70');
                if (lineStatus.label === 'Received') rowClasses.push('bg-emerald-50');
                else if (lineStatus.label === 'Partial') rowClasses.push('bg-amber-50/30');
                return (
                  <tr key={item.id || idx} className={rowClasses.join(' ')}>
                    <td className="px-4 py-3">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={productName}
                          className="w-14 h-14 object-cover rounded border"
                        />
                      ) : (
                        <div className="w-14 h-14 border rounded bg-gray-50 text-[10px] text-text-secondary flex items-center justify-center">
                          No Img
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      <div className="font-mono text-sm text-text-primary">{eanValue}</div>
                      <div className="font-mono">{asin}</div>
                    </td>
                    <td className="px-4 py-3">{productName}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-semibold text-text-primary">
                        {`${expectedQty} expected`}
                      </div>
                      <div className="mt-2 text-left">
                        <label className="text-xs text-text-secondary block mb-1">
                          Received units
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={getDraftReceivedValue(item)}
                            onChange={(e) => handleReceivedDraftChange(item.id, e.target.value)}
                            onBlur={() => persistReceivedUnits(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                persistReceivedUnits(item);
                              }
                            }}
                            disabled={savingRow === item.id}
                            className="w-24 text-right border rounded px-2 py-1"
                          />
                          {savingRow === item.id && (
                            <span className="text-xs text-text-secondary">Saving…</span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary mt-1">
                          {`${confirmedQty} / ${expectedQty} received`}
                        </p>
                      </div>
                      <div className="text-xs space-y-0.5 mt-2 text-left">
                        {hasDirectIntent ? (
                          <>
                            <div className="text-blue-700 font-semibold">
                              {`Client request: ${plannedFbaQty} → Amazon`}
                            </div>
                            <div className="text-text-secondary">
                              {sentToAmazon > 0
                                ? pendingFba > 0
                                  ? `${sentToAmazon} sent, ${pendingFba} pending`
                                  : `${sentToAmazon} sent to Amazon`
                                : 'Pending reception'}
                            </div>
                          </>
                        ) : (
                          <div className="text-text-secondary">Stored in prep center</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono">{skuValue}</td>
                    <td className="px-4 py-3 text-center">
                      {hasDirectIntent ? (
                        <div className="inline-flex flex-col px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold">
                          <span>{plannedFbaQty}</span>
                          <span className="text-[10px] text-blue-500">planned</span>
                        </div>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isPrepEligible(item) && !item.prep_request_created ? (
                        <input
                          type="checkbox"
                          checked={item.id ? selectedPrepIds.has(item.id) : false}
                          onChange={() => item.id && togglePrepSelection(item.id)}
                        />
                      ) : item.prep_request_created ? (
                        <span className="text-xs text-green-700 font-semibold">Queued</span>
                      ) : (
                        <span className="text-text-secondary text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${lineStatus.color}`}>
                          {lineStatus.label}
                        </span>
                        <span className="text-xs text-text-secondary mt-1">
                          {lineStatus.label === 'Received' && receivedAt
                            ? `Received ${receivedAt.toLocaleDateString()}`
                            : lineStatus.detail}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}

function AdminReceiving() {
  const { profile } = useSupabaseAuth();
  const listDefaults = {
    statusFilter: 'all',
    searchQuery: '',
    page: 1,
    selectedShipmentId: null
  };
  const [listState, setListState] = useSessionStorage('admin-receiving-list', listDefaults);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [message, setMessage] = useState('');

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState(listState.statusFilter ?? 'all');
  const [searchQuery, setSearchQuery] = useState(listState.searchQuery ?? '');
  const [page, setPage] = useState(listState.page ?? 1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    setListState({
      statusFilter,
      searchQuery,
      page,
      selectedShipmentId: selectedShipment?.id || null
    });
  }, [statusFilter, searchQuery, page, selectedShipment, setListState]);

  const pageSize = 20;

  useEffect(() => {
    loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  useEffect(() => {
    const storedId = listState?.selectedShipmentId;
    if (!storedId) return;
    if (selectedShipment && selectedShipment.id === storedId) return;
    const match = shipments.find((s) => s.id === storedId);
    if (match) {
      setSelectedShipment(match);
    }
  }, [shipments, listState?.selectedShipmentId]); 

const loadShipments = async () => {
  setLoading(true);
  try {
    const options = {
      status: statusFilter === 'all' ? undefined : statusFilter,
      page,
      pageSize
    };

    const { data, error, count } = await supabaseHelpers.getAllReceivingShipments(options);
    if (error) throw error;

    setShipments(data || []);
    setTotalCount(count || 0);
    setTotalPages(Math.ceil((count || 0) / pageSize));
  } catch (error) {
    setMessage(`Erreur de chargement: ${error.message}`);
    setShipments([]);
  } finally {
    setLoading(false);
  }
};

const [totalCount, setTotalCount] = useState(0);
// în AdminReceiving, înlocuiește const filteredShipments = ...
const filteredShipments = shipments
  .filter((shipment) => {
    if (!searchQuery) return true;
    const q = String(searchQuery).toLowerCase();

    const hasTracking = Array.isArray(shipment.tracking_ids)
      ? shipment.tracking_ids.some((id) => String(id || '').toLowerCase().includes(q))
      : String(shipment.tracking_id || '').toLowerCase().includes(q);

    return (
      hasTracking ||
      String(shipment.client_name || '').toLowerCase().includes(q) ||
      String(shipment.user_email || '').toLowerCase().includes(q) ||
      String(shipment.company_name || '').toLowerCase().includes(q)
    );
  })
  .sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  const handleBulkReceived = async () => {
    if (selectedIds.size === 0) {
      setMessage('Please select at least one reception.');
      return;
    }
    if (!confirm(`Mark ${selectedIds.size} reception(s) as received?`)) return;

    try {
      const shipmentIds = Array.from(selectedIds);
      const { error } = await supabaseHelpers.markMultipleAsReceived(shipmentIds, profile.id);
      if (error) throw error;

      setMessage(`${selectedIds.size} reception(s) marked as received.`);
      setSelectedIds(new Set());
      loadShipments();
    } catch (error) {
      setMessage(`Erreur: ${error.message}`);
    }
  };

  const deleteShipment = async (shipmentId) => {
    if (!confirm('Ștergi această recepție? Operațiunea este definitivă.')) return;
    setLoading(true);
    setMessage('');
    try {
      let { error } = await supabaseHelpers.deleteReceivingShipment(shipmentId);
      if (error && /foreign key|constraint/i.test(error.message)) {
        const { error: e1 } = await supabase
          .from('receiving_items')
          .delete()
          .eq('shipment_id', shipmentId);
        if (e1) throw e1;

        const { error: e2 } = await supabaseHelpers.deleteReceivingShipment(shipmentId);
        if (e2) throw e2;

        error = null;
      }
      if (error) throw error;

      setMessage('Recepția a fost ștearsă cu succes');
      await loadShipments();
    } catch (err) {
      setMessage(`Eroare la ștergere: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (shipmentId) => {
    const next = new Set(selectedIds);
    if (next.has(shipmentId)) next.delete(shipmentId);
    else next.add(shipmentId);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredShipments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredShipments.map(s => s.id)));
    }
  };

  if (selectedShipment) {
    return (
      <AdminReceivingDetail
        shipment={selectedShipment}
        onBack={() => setSelectedShipment(null)}
        onUpdate={() => {
          loadShipments();
          setSelectedShipment(null);
        }}
      />
    );
  }

  const listMessageSuccess = typeof message === 'string' && message.toLowerCase().includes('success');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Reception Management</h2>
          <p className="text-text-secondary">Review and process client receiving announcements</p>
        </div>
        <div className="flex items-center space-x-3">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkReceived}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark selected as received ({selectedIds.size})
            </button>
          )}
          <button
            onClick={loadShipments}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Package className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg ${
          listMessageSuccess
            ? 'bg-green-50 border border-green-200 text-green-600'
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-text-secondary" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="all">All statuses</option>
             <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="partial">Partial</option>
            <option value="received">Received</option>
            <option value="processed">Processed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-text-secondary" />
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by tracking number, client, or email..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Shipments Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="min-w-full text-sm">

          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredShipments.length && filteredShipments.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Carrier</th>
              <th className="px-4 py-3 text-left">Tracking</th>
              <th className="px-4 py-3 text-left">Destination</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-center">Lines</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                </td>
              </tr>
            ) : filteredShipments.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center">
                  <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-text-secondary">No receptions found</p>
                </td>
              </tr>
            ) : (
              filteredShipments.map((shipment) => {
                const emailRaw = String(shipment.client_email || shipment.user_email || '').trim();
                const showEmail = emailRaw.includes('@');
                const hasFbaIntent =
                  (shipment.fba_mode && shipment.fba_mode !== 'none') ||
                  (shipment.receiving_items || []).some((item) => {
                    const intent = resolveFbaIntent(item);
                    return intent.hasIntent || intent.directFromAction;
                  });
                const totals = (shipment.receiving_items || []).reduce(
                  (acc, item) => {
                    const announced = Math.max(
                      0,
                      Number(
                        item.quantity_received ??
                          item.units_requested ??
                          item.qty ??
                          item.quantity ??
                          item.requested ??
                          0
                      ) || 0
                    );
                    acc.announced += announced;
                    return acc;
                  },
                  { announced: 0 }
                );
                const rowClass = hasFbaIntent
                  ? 'border-t bg-sky-50 hover:bg-sky-100/60'
                  : 'border-t hover:bg-gray-50';
                return (
                <tr key={shipment.id} className={rowClass}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(shipment.id)}
                      onChange={() => toggleSelection(shipment.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <User className="w-4 h-4 text-text-secondary mr-2" />
                      <div>
                        <p className="font-medium text-text-primary">
                          {shipment.store_name || shipment.client_name || '—'}
                        </p>
                        {showEmail && (
                          <p className="text-xs text-text-secondary">{emailRaw}</p>
                        )}
                        {shipment.company_name && (
                          <p className="text-xs text-text-secondary flex items-center">
                            <Building className="w-3 h-3 mr-1" />
                            {shipment.company_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-primary">
                      {shipment.carrier}
                      {shipment.carrier_other && (
                        <span className="text-text-secondary"> ({shipment.carrier_other})</span>
                      )}
                    </span>
                  </td>
                    <td className="px-4 py-3">
                      {(shipment.tracking_ids || [shipment.tracking_id]).filter(Boolean).map((id, i) => (
                        <p key={i} className="font-mono">{id}</p>
                      ))}
                    </td>
                  <td className="px-4 py-3">
                    <DestinationBadge code={shipment.destination_country || 'FR'} variant="subtle" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusPill status={shipment.status} />
                      {hasFbaIntent && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                          FBA
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-text-primary font-semibold">
                      {shipment.receiving_items?.length || 0}
                    </span>
                    <p className="text-[11px] uppercase tracking-wide text-text-secondary">Lines</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center text-text-secondary">
                      <Clock className="w-4 h-4 mr-1" />
                      <span>{new Date(shipment.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </td>
           <td className="px-4 py-3 text-right">
            <div className="flex justify-end items-center gap-3">
              <button
                onClick={() => setSelectedShipment(shipment)}
                className="text-primary hover:text-primary-dark font-medium"
                title="View reception details"
              >
                View details
              </button>

              <button
                onClick={() => deleteShipment(shipment.id)}
                className="flex items-center text-red-600 hover:text-red-700 font-medium"
                title="Delete reception"
              >
                <Trash2 className="inline w-4 h-4 mr-1" />
                Delete
              </button>
            </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
          <div className="text-sm text-text-secondary">
            Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
            {selectedIds.size > 0 && (
              <span className="ml-2 font-medium">
                ({selectedIds.size} selected)
              </span>
            )}
          </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminReceiving;
