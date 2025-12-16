import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCcw, Trash2, Upload } from 'lucide-react';
import Section from '../common/Section';
import { supabase } from '../../config/supabase';

const statusOptions = ['pending', 'processing', 'done', 'cancelled'];

export default function AdminReturns() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');

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
        return_items (id, asin, sku, qty, notes),
        return_files (id, file_type, url, name)
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) setError(err.message);
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const updateStatus = async (id, status) => {
    const { error: err } = await supabase.from('returns').update({ status }).eq('id', id);
    if (err) {
      alert(err.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Ștergi acest retur?')) return;
    const { error: err } = await supabase.from('returns').delete().eq('id', id);
    if (err) return alert(err.message);
    setRows((prev) => prev.filter((r) => r.id !== id));
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
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm border-collapse">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Marketplace</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Notes</th>
              <th className="px-3 py-2 text-left">Items</th>
              <th className="px-3 py-2 text-left">Files</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-text-secondary">
                  Niciun retur.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2">
                  <div className="text-xs text-text-secondary">Company</div>
                  <div className="font-semibold text-text-primary break-all">{r.company_id || '—'}</div>
                  <div className="text-xs text-text-secondary break-all">User: {r.user_id || '—'}</div>
                </td>
                <td className="px-3 py-2 uppercase">{r.marketplace || '—'}</td>
                <td className="px-3 py-2">
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-xs font-semibold">
                    {r.status}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {statusOptions.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateStatus(r.id, s)}
                        className={`text-[11px] px-2 py-1 rounded border ${
                          r.status === s ? 'bg-primary text-white border-primary' : 'border-gray-200'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-sm whitespace-pre-wrap max-w-[240px]">
                  {r.notes || '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs text-text-secondary mb-1">
                    {Array.isArray(r.return_items) ? r.return_items.length : 0} linii
                  </div>
                  <div className="space-y-1 text-xs">
                    {Array.isArray(r.return_items) &&
                      r.return_items.map((it) => (
                        <div key={it.id} className="border rounded px-2 py-1">
                          <div className="font-semibold break-all">{it.asin || it.sku || '—'}</div>
                          <div className="text-text-secondary">Qty: {it.qty}</div>
                          {it.notes && <div className="text-text-secondary">Notes: {it.notes}</div>}
                        </div>
                      ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="space-y-1 text-xs">
                    {Array.isArray(r.return_files) && r.return_files.length === 0 && (
                      <div className="text-text-secondary">—</div>
                    )}
                    {Array.isArray(r.return_files) &&
                      r.return_files.map((f) => (
                        <a
                          key={f.id}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline break-all"
                        >
                          <Upload className="w-3 h-3" />
                          {f.file_type}: {f.name || f.url}
                        </a>
                      ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-text-secondary">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded"
                      onClick={() => updateStatus(r.id, 'processing')}
                    >
                      <ArrowUpRight className="w-4 h-4" /> Proc.
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded"
                      onClick={() => updateStatus(r.id, 'done')}
                    >
                      <ArrowDownRight className="w-4 h-4" /> Done
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                      onClick={() => handleDelete(r.id)}
                    >
                      <Trash2 className="w-4 h-4" /> Șterge
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
