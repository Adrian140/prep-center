import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, Upload, CheckCircle2, X } from 'lucide-react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabase } from '../../../config/supabase';
import { useDashboardTranslation } from '../../../translations';
import { useMarket } from '@/contexts/MarketContext';
import { normalizeMarketCode } from '@/utils/market';

const editableStatuses = ['pending', 'processing'];

export default function ClientReturns() {
  const { t } = useDashboardTranslation();
  const { profile, status } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [editing, setEditing] = useState({});
  const [error, setError] = useState('');

  const createSignedUrl = async (path) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const { data, error } = await supabase.storage.from('returns').createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) return path;
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
      .from('returns')
      .select(`
        id,
        status,
        done_at,
        notes,
        marketplace,
        created_at,
        return_items (id, asin, sku, qty, notes, stock_item_id),
        return_files (id, file_type, url, name)
      `)
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });
    const marketCode = normalizeMarketCode(currentMarket);
    if (marketCode) {
      query = query.eq('warehouse_country', marketCode);
    }
    let { data, error: err } = await query;
    if (err && marketCode && String(err.message || '').toLowerCase().includes('warehouse_country')) {
      const retry = await supabase
        .from('returns')
        .select(`
          id,
          status,
          done_at,
          notes,
          marketplace,
          created_at,
          return_items (id, asin, sku, qty, notes, stock_item_id),
          return_files (id, file_type, url, name)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      data = retry.data;
      err = retry.error;
    }
    let baseRows = err ? [] : Array.isArray(data) ? data : [];

    // Fetch stock item metadata separat, fără .or() construit din string
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

    // Presemnează link-urile la fișiere
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

    baseRows = await Promise.all(
      baseRows.map(async (r) => ({
        ...r,
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
    if (err) setError(err.message);
    setLoading(false);
  };

  useEffect(() => {
    if (status !== 'loading') load();
  }, [status, profile?.company_id, currentMarket]);

  const canEdit = (row) => editableStatuses.includes(row.status);

  const uploadFiles = async (row, type, fileList) => {
    if (!fileList || !fileList.length) return;
    if (!profile?.company_id) {
      setError('Missing company_id');
      return;
    }
    setSavingId(row.id);
    try {
      const bucket = 'returns';
      const arr = Array.from(fileList);
      const uploaded = [];
      for (const file of arr) {
        const path = `${profile.company_id}/${Date.now()}-${file.name}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from(bucket)
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(upData.path, 60 * 60 * 24 * 7);
        uploaded.push({ name: file.name, url: upData.path, signed_url: signed?.signedUrl || upData.path, file_type: type });
      }
      if (uploaded.length) {
        const insertPayload = uploaded.map((f) => ({ ...f, return_id: row.id, mime_type: null }));
        const { data: rowsInserted, error: insErr } = await supabase
          .from('return_files')
          .insert(insertPayload)
          .select();
        if (insErr) throw insErr;
        const signedRows =
          rowsInserted && rowsInserted.length
            ? await Promise.all(
                rowsInserted.map(async (f) => ({
                  ...f,
                  signed_url: f.signed_url || (await createSignedUrl(f.url))
                }))
              )
            : [];
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, return_files: [...(r.return_files || []), ...signedRows] }
              : r
          )
        );
      }
    } catch (e) {
      setError(e?.message || 'Could not upload files.');
    } finally {
      setSavingId(null);
    }
  };

  const removeFile = async (row, fileId) => {
    setSavingId(row.id);
    try {
      const { error: delErr } = await supabase.from('return_files').delete().eq('id', fileId);
      if (delErr) throw delErr;
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, return_files: (r.return_files || []).filter((f) => f.id !== fileId) }
            : r
        )
      );
    } catch (e) {
      setError(e?.message || 'Could not delete file.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveNotes = async (row) => {
    const newNotes = editing[row.id]?.notes ?? row.notes ?? '';
    setSavingId(row.id);
    const { error: err } = await supabase.from('returns').update({ notes: newNotes }).eq('id', row.id);
    if (err) {
      setError(err.message);
    } else {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, notes: newNotes } : r)));
      setEditing((prev) => ({ ...prev, [row.id]: undefined }));
    }
    setSavingId(null);
  };

  const handleDelete = async (row) => {
    if (!window.confirm(t('common.confirmDelete') || 'Delete this return?')) return;
    const { error: err } = await supabase.from('returns').delete().eq('id', row.id);
    if (err) {
      setError(err.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">{t('ClientReturns.title')}</h2>
        <p className="text-sm text-text-secondary">{t('ClientReturns.readonly')}</p>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {loading && (
        <div className="border rounded-lg px-4 py-6 text-center text-text-secondary bg-white">{t('common.loading')}</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="border rounded-lg px-4 py-6 text-center text-text-secondary bg-white">{t('ClientReturns.noRecords')}</div>
      )}

      {!loading &&
        rows.map((row) => {
          const items = Array.isArray(row.return_items) ? row.return_items : [];
          const files = Array.isArray(row.return_files) ? row.return_files : [];
          const insideFiles = files.filter((f) => f.file_type === 'inside');
          const labelFiles = files.filter((f) => f.file_type === 'label');
          const isEditable = canEdit(row);
          const draftNotes = editing[row.id]?.notes ?? row.notes ?? '';
          return (
            <div key={row.id} className="border rounded-lg bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="font-mono text-xs text-text-secondary">#{row.id}</div>
                  <div className="h-4 w-px bg-gray-200" />
                  <div>
                    <div className="text-xs text-text-secondary">{t('ClientPrepShipments.drawer.country') || 'Destination'}</div>
                    <div className="font-semibold uppercase">{row.marketplace || '—'}</div>
                  </div>
                  <div className="h-4 w-px bg-gray-200" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">{t('ClientReturns.thead.status')}</span>
                    <span className="px-2 py-1 text-xs rounded bg-slate-100 font-semibold">{row.status}</span>
                  </div>
                  <div className="h-4 w-px bg-gray-200" />
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    {new Date(row.created_at).toLocaleString()}
                  </div>
                  {row.status === 'done' && row.done_at && (
                    <>
                      <div className="h-4 w-px bg-gray-200" />
                      <div className="flex items-center gap-1 text-xs text-text-secondary">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        {t('ClientReturns.doneAt') || 'Done on'} {new Date(row.done_at).toLocaleString()}
                      </div>
                    </>
                  )}
                </div>
                {isEditable && (
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                      onClick={() => handleSaveNotes(row)}
                      disabled={savingId === row.id}
                    >
                      <Pencil className="w-4 h-4" /> {savingId === row.id ? t('common.saving') || 'Saving…' : t('common.save') || 'Save'}
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                      onClick={() => handleDelete(row)}
                    >
                      <Trash2 className="w-4 h-4" /> {t('common.delete')}
                    </button>
                  </div>
                )}
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
                        <div className="text-text-secondary text-xs">Qty: {it.qty}</div>
                        {it.notes && <div className="text-text-secondary text-xs">Notes: {it.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs uppercase text-text-secondary">
                      {t('ClientPrepShipments.return.insideDocs') || 'Docs to put inside the box'} ({insideFiles.length})
                    </div>
                    {isEditable && (
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded cursor-pointer hover:bg-primary-dark">
                        <Upload className="w-4 h-4" />
                        {t('common.add') || 'Add'}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                          onChange={(e) => uploadFiles(row, 'inside', e.target.files)}
                        />
                      </label>
                    )}
                    {insideFiles.length === 0 && <div className="text-text-secondary text-sm">—</div>}
                    {insideFiles.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-sm break-all">
                        <a
                          href={f.signed_url || f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-primary underline"
                        >
                          <Upload className="w-3 h-3" />
                          <span>{f.name || f.url}</span>
                        </a>
                        {isEditable && (
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => removeFile(row, f.id)}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase text-text-secondary">
                      {t('ClientPrepShipments.return.labelDocs') || 'Return labels'} ({labelFiles.length})
                    </div>
                    {isEditable && (
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded cursor-pointer hover:bg-primary-dark">
                        <Upload className="w-4 h-4" />
                        {t('common.add') || 'Add'}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                          onChange={(e) => uploadFiles(row, 'label', e.target.files)}
                        />
                      </label>
                    )}
                    {labelFiles.length === 0 && <div className="text-text-secondary text-sm">—</div>}
                    {labelFiles.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 text-sm break-all">
                        <a
                          href={f.signed_url || f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-primary underline"
                        >
                          <Upload className="w-3 h-3" />
                          <span>{f.name || f.url}</span>
                        </a>
                        {isEditable && (
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => removeFile(row, f.id)}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">{t('ClientPrepShipments.return.notes') || 'Notes'}</div>
                  {isEditable ? (
                    <textarea
                      className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
                      value={draftNotes}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [row.id]: { ...(prev[row.id] || {}), notes: e.target.value }
                        }))
                      }
                    />
                  ) : (
                    <div className="text-sm text-text-primary whitespace-pre-wrap min-h-[40px] border rounded px-3 py-2 bg-slate-50">
                      {row.notes || '—'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
