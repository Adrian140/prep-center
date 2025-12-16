import React, { useEffect, useState } from 'react';
import { Pencil, Trash2, Upload, CheckCircle2 } from 'lucide-react';
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
        return_items (id, asin, sku, qty, notes),
        return_files (id, file_type, url, name)
      `)
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });
    setRows(err ? [] : Array.isArray(data) ? data : []);
    if (err) setError(err.message);
    setLoading(false);
  };

  useEffect(() => {
    if (status !== 'loading') load();
  }, [status, profile?.company_id]);

  const canEdit = (row) => editableStatuses.includes(row.status);

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
                    <div key={it.id} className="border rounded px-3 py-2 text-sm bg-slate-50">
                      <div className="font-semibold break-all">{it.asin || it.sku || '—'}</div>
                      <div className="text-text-secondary text-xs">Qty: {it.qty}</div>
                      {it.notes && <div className="text-text-secondary text-xs">Notes: {it.notes}</div>}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">Files ({files.length})</div>
                  {files.length === 0 && <div className="text-text-secondary text-sm">—</div>}
                  {files.map((f) => (
                    <a
                      key={f.id}
                      href={f.url}
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
