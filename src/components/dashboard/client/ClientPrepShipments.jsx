import React, { useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stock, setStock] = useState([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryDraftQty, setInventoryDraftQty] = useState({});

  const [reqOpen, setReqOpen] = useState(false);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqEditable, setReqEditable] = useState(false);
  const [reqHeader, setReqHeader] = useState(null);
  const [reqLines, setReqLines] = useState([]);
  const [reqErrors, setReqErrors] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addingSel, setAddingSel] = useState('');
  const [addingQty, setAddingQty] = useState('');

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
    };
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
        sku: '',
        ean: stockItem.ean || '',
        units_requested: qty,
        product_name: stockItem.name || ''
      }
    ]);
    setReqErrors([]);
    cancelAddItem();
  };

  const updateReqLine = (key, patch) => {
    setReqLines((prev) =>
      prev.map((line) => {
        const matches = (line.id && line.id === key) || (line.client_uid && line.client_uid === key);
        return matches ? { ...line, ...patch } : line;
      })
    );
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
        sku: '',
        ean: stockItem.ean || '',
        units_requested: qty,
        product_name: stockItem.name || ''
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
    try {
      const { data, error } = await supabaseHelpers.getPrepRequest(requestId);
      if (error) throw error;
      setReqHeader({
        id: data.id,
        destination_country: data.destination_country,
        status: data.status,
        created_at: data.created_at,
        fba_shipment_id: data.fba_shipment_id || null
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
          ean: line.ean || line.stock_item?.ean || ''
        }))
      );
      setReqEditable((data.status || 'pending') === 'pending');
    } catch (e) {
      setReqErrors([e?.message || 'Failed to load request.']);
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
      const toInsert = reqLines.filter((line) => !line.id && line.stock_item_id);
      const toUpdate = reqLines.filter((line) => line.id && origById[line.id]);

      for (const del of toDelete) {
        const { error } = await supabaseHelpers.deletePrepItem(del.id);
        if (error) throw error;
      }
      for (const ins of toInsert) {
        const { error } = await supabaseHelpers.createPrepItem(reqHeader.id, {
          stock_item_id: ins.stock_item_id,
          ean: ins.ean || null,
          product_name: ins.product_name || null,
          asin: ins.asin,
          sku: ins.sku,
          units_requested: Number(ins.units_requested)
        });
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
      await openReqEditor(reqHeader.id);
      setReqErrors([]);
    } catch (e) {
      setReqErrors([e?.message || 'Failed to save changes.']);
    } finally {
      setReqLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      const [prepRes, stockRes] = await Promise.all([
        supabase
          .from('prep_requests')
          .select('id, destination_country, created_at, status, fba_shipment_id, prep_request_tracking(tracking_id)')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('stock_items')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
      ]);

      if (!active) return;
      if (prepRes.error) {
        setError(prepRes.error.message);
        setRows([]);
      } else {
        setError('');
        setRows(Array.isArray(prepRes.data) ? prepRes.data : []);
      }
      setStock(Array.isArray(stockRes.data) ? stockRes.data : []);
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [profile?.id]);

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
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-text-secondary">
              <tr>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.date')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.country')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.fbaShipmentId')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.trackIds')}</th>
                <th className="px-4 py-2 text-left">{t('ClientStock.recent.thead.status')}</th>
                <th className="px-4 py-2 text-right">{t('ClientPrepShipments.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
                      {!loading && rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-text-light">
                            {t('ClientPrepShipments.table.empty')}
                          </td>
                        </tr>
                      )}
              {rows.map((row) => {
                const status = row.status || 'pending';
                const tracks = Array.isArray(row.prep_request_tracking) && row.prep_request_tracking.length
                  ? row.prep_request_tracking.map((trk) => trk.tracking_id).join(', ')
                  : '—';
                const pending = status === 'pending';
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2">{toIsoDate(row.created_at)}</td>
                    <td className="px-4 py-2">{row.destination_country || '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{row.fba_shipment_id || '—'}</td>
                    <td className="px-4 py-2">{tracks}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                        pending ? 'bg-yellow-50 text-yellow-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="text-primary text-sm hover:underline disabled:opacity-50"
                        disabled={!row.id}
                        onClick={() => row.id && openReqEditor(row.id)}
                      >
                        {pending ? t('ClientPrepShipments.table.edit') : t('ClientPrepShipments.table.view')}
                      </button>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm px-6 pt-4">
                  <div><span className="text-text-secondary">{t('ClientPrepShipments.drawer.date')}:</span> {reqHeader?.created_at?.slice(0,10) || '—'}</div>
                  <div><span className="text-text-secondary">{t('ClientPrepShipments.drawer.country')}:</span> {t(`ClientStock.countries.${reqHeader?.destination_country || 'FR'}`)}</div>
                  <div><span className="text-text-secondary">{t('ClientPrepShipments.drawer.status')}:</span> {reqHeader?.status || 'pending'}</div>
                  <div><span className="text-text-secondary">{t('ClientPrepShipments.drawer.shipment')}:</span> {reqHeader?.fba_shipment_id || '—'}</div>
                </div>

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
                          <th className="px-2 py-2 text-left">EAN</th>
                          <th className="px-2 py-2 text-left">{t('ClientPrepShipments.drawer.product')}</th>
                          <th className="px-2 py-2 text-left">ASIN / SKU</th>
                          <th className="px-2 py-2 text-right">{t('ClientPrepShipments.drawer.units')}</th>
                          {reqEditable && <th className="px-2 py-2 text-center">{t('ClientPrepShipments.drawer.actions')}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {reqLines.length === 0 && (
                          <tr>
                            <td colSpan={reqEditable ? 5 : 4} className="px-3 py-6 text-center text-text-secondary">
                              {t('ClientPrepShipments.drawer.empty')}
                            </td>
                          </tr>
                        )}
                        {reqLines.map((line) => {
                          const lineKey = line.id ?? line.client_uid;
                          const meta = getStockMeta(line);
                          const code = String(line.asin || '').trim() || String(line.sku || '').trim() || '—';
                          return (
                            <tr key={lineKey || line.stock_item_id} className="border-t">
                              <td className="px-2 py-2 font-mono text-xs">{meta.ean || line.ean || '—'}</td>
                              <td className="px-2 py-2">{meta.name || '—'}</td>
                              <td className="px-2 py-2">
                                {reqEditable ? (
                                  <input
                                    className="border rounded px-2 py-1 w-full"
                                    value={code}
                                    onChange={(e) => setAsinOrSku(lineKey, e.target.value)}
                                  />
                                ) : (
                                  code
                                )}
                              </td>
                              <td className="px-2 py-2 text-right">
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
                                  line.units_requested
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
                            <div>
                              <div className="font-semibold text-text-primary">{item.name || '—'}</div>
                              <div className="text-xs text-text-secondary">
                                {item.ean || 'EAN —'} · {t('ClientPrepShipments.drawer.inStock', { qty: item.qty ?? 0 })}
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
