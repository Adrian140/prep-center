import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCcw, Trash2, Upload, CheckCircle2, Pencil, X } from 'lucide-react';
import Section from '../common/Section';
import { supabase } from '../../config/supabase';
import { useMarket } from '@/contexts/MarketContext';
import { normalizeMarketCode } from '@/utils/market';

const statusOptions = ['pending', 'processing', 'done', 'cancelled'];

export default function AdminReturns() {
  const { currentMarket } = useMarket();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [savingId, setSavingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState({});

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('returns')
      .select(`
        id,
        company_id,
        user_id,
        marketplace,
        status,
        notes,
        created_at,
        updated_at,
        done_at,
        stock_adjusted,
        return_items (
          id,
          asin,
          sku,
          qty,
          notes,
          stock_item_id
        ),
        return_files (id, file_type, url, name)
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) setError(err.message);
    let baseRows = Array.isArray(data) ? data : [];
    const marketCode = normalizeMarketCode(currentMarket);
    if (marketCode) {
      baseRows = baseRows.filter((row) => {
        const rowMarket = normalizeMarketCode(
          row?.marketplace || row?.country || row?.destination_country
        );
        return rowMarket === marketCode;
      });
    }

    const createSignedUrl = async (path) => {
      if (!path) return '';
      if (/^https?:\/\//i.test(path)) return path;
      const { data, error } = await supabase.storage.from('returns').createSignedUrl(path, 60 * 60 * 24 * 7);
      if (error) return path;
      return data?.signedUrl || path;
    };

    // Fetch stock items separat, fără .or() construit din string
    const allItems = baseRows.flatMap((r) => (Array.isArray(r.return_items) ? r.return_items : []));
    const stockIds = Array.from(new Set(allItems.map((it) => it.stock_item_id).filter(Boolean)));
    const asins = Array.from(new Set(allItems.map((it) => it.asin).filter(Boolean)));
    const skus = Array.from(new Set(allItems.map((it) => it.sku).filter(Boolean)));
    const stockMap = {};
    const fetchAndMerge = async (column, values) => {
      if (!values.length) return;
      const { data } = await supabase
        .from('stock_items')
        .select('id, image_url, name, asin, sku')
        .in(column, values);
      if (Array.isArray(data)) {
        data.forEach((s) => {
          stockMap[s.id] = stockMap[s.id] || s;
          if (s.asin) stockMap[`asin:${s.asin}`] = stockMap[`asin:${s.asin}`] || s;
          if (s.sku) stockMap[`sku:${s.sku}`] = stockMap[`sku:${s.sku}`] || s;
        });
      }
    };
    await Promise.all([
      fetchAndMerge('id', stockIds),
      fetchAndMerge('asin', asins),
      fetchAndMerge('sku', skus)
    ]);

    // Presemnează fișierele de retur
    const fileCache = new Map();
    const signFiles = async (files = []) =>
      Promise.all(
        files.map(async (f) => {
          const key = f.url || '';
          if (fileCache.has(key)) return { ...f, signed_url: fileCache.get(key) };
          const href = await createSignedUrl(key);
          fileCache.set(key, href);
          return { ...f, signed_url: href };
        })
      );

    // Fetch profile info separately (no FK relation in schema cache)
    const userIds = Array.from(new Set(baseRows.map((r) => r.user_id).filter(Boolean)));
    let profileMap = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, company_name, store_name, email')
        .in('id', userIds);
      profileMap = Array.isArray(profiles)
        ? profiles.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {})
        : {};
    }
    baseRows = await Promise.all(
      baseRows.map(async (r) => ({
        ...r,
        profile: profileMap[r.user_id] || null,
        return_items: Array.isArray(r.return_items)
          ? r.return_items.map((it) => {
              const byId = it.stock_item_id ? stockMap[it.stock_item_id] : null;
              const byAsin = !byId && it.asin ? stockMap[`asin:${it.asin}`] : null;
              const bySku = !byId && !byAsin && it.sku ? stockMap[`sku:${it.sku}`] : null;
              return { ...it, stock_item: byId || byAsin || bySku || null };
            })
          : [],
        return_files: await signFiles(Array.isArray(r.return_files) ? r.return_files : [])
      }))
    );

    setRows(baseRows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [currentMarket]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const resolveStockItem = async (item, companyId) => {
    if (item.stock_item_id) {
      const { data } = await supabase
        .from('stock_items')
        .select('id, qty')
        .eq('id', item.stock_item_id)
        .maybeSingle();
      return data || null;
    }
    if (item.asin) {
      const { data } = await supabase
        .from('stock_items')
        .select('id, qty')
        .eq('company_id', companyId)
        .eq('asin', item.asin)
        .maybeSingle();
      if (data) return data;
    }
    if (item.sku) {
      const { data } = await supabase
        .from('stock_items')
        .select('id, qty')
        .eq('company_id', companyId)
        .eq('sku', item.sku)
        .maybeSingle();
      return data || null;
    }
    return null;
  };

  const adjustStockForReturn = async (row) => {
    const items = Array.isArray(row.return_items) ? row.return_items : [];
    for (const item of items) {
      const stockRow = await resolveStockItem(item, row.company_id);
      if (!stockRow) continue;
      const currentQty = Number(stockRow.qty || 0);
      const nextQty = Math.max(currentQty - Number(item.qty || 0), 0);
      await supabase.from('stock_items').update({ qty: nextQty }).eq('id', stockRow.id);
    }
  };

  const updateStatus = async (row, status) => {
    setSavingId(row.id);
    const patch = {
      status,
      updated_at: new Date().toISOString(),
      done_at: status === 'done' ? new Date().toISOString() : null
    };
    if (status === 'done' && !row.stock_adjusted) {
      await adjustStockForReturn(row);
      patch.stock_adjusted = true;
    }
    const { error: err } = await supabase.from('returns').update(patch).eq('id', row.id);
    if (err) {
      alert(err.message);
      setSavingId(null);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, ...patch, stock_adjusted: r.stock_adjusted || patch.stock_adjusted } : r
      )
    );
    setSavingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Ștergi acest retur?')) return;
    const { error: err } = await supabase.from('returns').delete().eq('id', id);
    if (err) return alert(err.message);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditNotes(row.notes || '');
    const itemDraft = {};
    (row.return_items || []).forEach((item) => {
      itemDraft[item.id] = { qty: item.qty, notes: item.notes || '' };
    });
    setEditItems(itemDraft);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNotes('');
    setEditItems({});
  };

  const saveEdit = async (row) => {
    setSavingId(row.id);
    const { error: returnErr } = await supabase
      .from('returns')
      .update({ notes: editNotes, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (returnErr) {
      alert(returnErr.message);
      setSavingId(null);
      return;
    }
    const itemUpdates = Object.entries(editItems).map(([id, value]) => ({
      id: Number(id),
      qty: Number(value.qty || 0),
      notes: value.notes || null
    }));
    for (const update of itemUpdates) {
      const { error: itemErr } = await supabase
        .from('return_items')
        .update({ qty: update.qty, notes: update.notes })
        .eq('id', update.id);
      if (itemErr) {
        alert(itemErr.message);
        setSavingId(null);
        return;
      }
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              notes: editNotes,
              return_items: (r.return_items || []).map((item) => ({
                ...item,
                qty: editItems[item.id]?.qty ?? item.qty,
                notes: editItems[item.id]?.notes ?? item.notes
              }))
            }
          : r
      )
    );
    setSavingId(null);
    cancelEdit();
  };

  return (
    <Section
      title="Retururi"
      right={
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Toate</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded"
            onClick={load}
            disabled={loading}
          >
            <RefreshCcw className="w-4 h-4" /> Reîmprospătează
          </button>
        </div>
      }
    >
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-text-secondary bg-white border rounded-lg">Niciun retur.</div>
        )}
        {filtered.map((r) => {
          const items = Array.isArray(r.return_items) ? r.return_items : [];
          const files = Array.isArray(r.return_files) ? r.return_files : [];
          const profile = r.profile || {};
          const companyLabel =
            profile.company_name ||
            profile.store_name ||
            r.company_id ||
            '—';
          const userLabel = profile.email || profile.id || r.user_id || '—';
          return (
            <div key={r.id} className="border rounded-lg bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-text-secondary">ID</div>
                  <div className="font-mono text-sm">{r.id}</div>
                  <div className="h-4 w-px bg-gray-200" />
                  <div>
                    <div className="text-xs text-text-secondary">Company / Store</div>
                    <div className="font-semibold text-text-primary">{companyLabel}</div>
                    <div className="text-xs text-text-secondary">User: {userLabel}</div>
                  </div>
                  <div className="h-4 w-px bg-gray-200" />
                  <div>
                    <div className="text-xs text-text-secondary">Marketplace</div>
                    <div className="font-semibold uppercase">{r.marketplace || '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={r.status}
                    onChange={(e) => updateStatus(r, e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                    disabled={savingId === r.id}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.status === 'done' && r.done_at && (
                    <div className="text-xs text-text-secondary">
                      Done: {new Date(r.done_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 py-3">
                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">Items ({items.length})</div>
                  {items.length === 0 && <div className="text-text-secondary text-sm">—</div>}
                  {items.map((it) => (
                    <div key={it.id} className="border rounded px-3 py-2 text-sm bg-slate-50 flex gap-3 items-center">
                      <div className="w-12 h-12 rounded border bg-white flex items-center justify-center overflow-hidden">
                        {it.stock_item?.image_url ? (
                          <img
                            src={it.stock_item.image_url}
                            alt={it.stock_item.name || it.asin || it.sku || 'Product'}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-[10px] text-text-secondary text-center px-1">No image</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold break-all">
                          {it.asin || it.stock_item?.asin || '—'}
                          {it.sku || it.stock_item?.sku ? (
                            <span className="text-text-secondary text-xs ml-1">({it.sku || it.stock_item?.sku})</span>
                          ) : null}
                        </div>
                        {it.stock_item?.name && (
                          <div className="text-text-secondary text-xs truncate">{it.stock_item.name}</div>
                        )}
                        {editingId === r.id ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-text-secondary">Qty:</span>
                              <input
                                type="number"
                                min="0"
                                value={editItems[it.id]?.qty ?? it.qty}
                                onChange={(e) =>
                                  setEditItems((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      ...(prev[it.id] || {}),
                                      qty: Number(e.target.value || 0)
                                    }
                                  }))
                                }
                                className="w-20 rounded border px-2 py-1 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-text-secondary">Notes:</span>
                              <input
                                type="text"
                                value={editItems[it.id]?.notes ?? it.notes ?? ''}
                                onChange={(e) =>
                                  setEditItems((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      ...(prev[it.id] || {}),
                                      notes: e.target.value
                                    }
                                  }))
                                }
                                className="flex-1 rounded border px-2 py-1 text-xs"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-text-secondary text-xs">Qty: {it.qty}</div>
                            {it.notes && <div className="text-text-secondary text-xs">Notes: {it.notes}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">Files ({files.length})</div>
                  {files.length === 0 && <div className="text-text-secondary text-sm">—</div>}
                  {files.map((f) => (
                    <a
                      key={f.id}
                      href={f.signed_url || f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-primary text-sm underline break-all"
                    >
                      <Upload className="w-3 h-3" />
                      <span className="font-semibold uppercase text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                        {f.file_type}
                      </span>
                      <span>{f.name || f.url}</span>
                    </a>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">Notes</div>
                  {editingId === r.id ? (
                    <textarea
                      className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  ) : (
                    <div className="text-sm text-text-primary whitespace-pre-wrap min-h-[40px] border rounded px-3 py-2 bg-slate-50">
                      {r.notes || '—'}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {editingId === r.id ? (
                      <>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => saveEdit(r)}
                          disabled={savingId === r.id}
                        >
                          <CheckCircle2 className="w-4 h-4" /> Save
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={cancelEdit}
                          disabled={savingId === r.id}
                        >
                          <X className="w-4 h-4" /> Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => startEdit(r)}
                        >
                          <Pencil className="w-4 h-4" /> Edit
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => updateStatus(r, 'processing')}
                          disabled={savingId === r.id}
                        >
                          <ArrowUpRight className="w-4 h-4" /> Proc.
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => updateStatus(r, 'done')}
                          disabled={savingId === r.id}
                        >
                          <ArrowDownRight className="w-4 h-4" /> Done
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                          onClick={() => handleDelete(r.id)}
                          disabled={savingId === r.id}
                        >
                          <Trash2 className="w-4 h-4" /> Șterge
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
