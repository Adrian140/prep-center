import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, Upload, CheckCircle2, X } from 'lucide-react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabase } from '../../../config/supabase';
import { useDashboardTranslation } from '../../../translations';

const editableStatuses = ['pending', 'processing'];

export default function ClientReturns() {
  const { t } = useDashboardTranslation();
  const { profile, status } = useSupabaseAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [editing, setEditing] = useState({});
  const [error, setError] = useState('');

  const load = async () => {
    if (!profile?.company_id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('returns')
      .select(`
        id,
        status,
        notes,
        marketplace,
        created_at,
        return_items (id, asin, sku, qty, notes, stock_item_id),
        return_files (id, file_type, url, name)
      `)
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });
    let baseRows = err ? [] : Array.isArray(data) ? data : [];

    // Fetch stock item metadata separately (no FK relation in schema cache)
    const stockIds = Array.from(
      new Set(
        baseRows
          .flatMap((r) => (Array.isArray(r.return_items) ? r.return_items : []))
          .map((it) => it.stock_item_id)
          .filter(Boolean)
      )
    );
    let stockMap = {};
    if (stockIds.length) {
      const { data: stockData } = await supabase
        .from('stock_items')
        .select('id, image_url, name, asin, sku')
        .in('id', stockIds);
      stockMap = Array.isArray(stockData)
        ? stockData.reduce((acc, s) => {
            acc[s.id] = s;
            return acc;
          }, {})
        : {};
    }

    baseRows = baseRows.map((r) => ({
      ...r,
      return_items: Array.isArray(r.return_items)
        ? r.return_items.map((it) => ({ ...it, stock_item: stockMap[it.stock_item_id] || null }))
        : []
    }));

    setRows(baseRows);
    if (err) setError(err.message);
    setLoading(false);
  };

  useEffect(() => {
    if (status !== 'loading') load();
  }, [status, profile?.company_id]);

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
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(upData.path);
        uploaded.push({ name: file.name, url: pub.publicUrl, file_type: type });
      }
      if (uploaded.length) {
        const { data: rowsInserted, error: insErr } = await supabase
          .from('return_files')
          .insert(uploaded.map((f) => ({ ...f, return_id: row.id, mime_type: null })))
          .select();
        if (insErr) throw insErr;
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, return_files: [...(r.return_files || []), ...(rowsInserted || [])] }
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
                    <div key={it.id} className="border rounded px-3 py-2 text-sm bg-slate-50 flex gap-3">
                      {it.stock_item?.image_url && (
                        <img
                          src={it.stock_item.image_url}
                          alt={it.stock_item.name || it.asin || it.sku || 'Product'}
                          className="w-12 h-12 object-contain rounded border bg-white"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold break-all">
                          {it.asin || it.sku || it.stock_item?.asin || it.stock_item?.sku || '—'}
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
                          href={f.url}
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
                          href={f.url}
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
