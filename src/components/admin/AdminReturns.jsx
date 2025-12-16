import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCcw, Trash2, Upload, CheckCircle2 } from 'lucide-react';
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

    // Fetch stock items separately (no FK in schema cache)
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
    baseRows = baseRows.map((r) => ({
      ...r,
      profile: profileMap[r.user_id] || null,
      return_items: Array.isArray(r.return_items)
        ? r.return_items.map((it) => ({ ...it, stock_item: stockMap[it.stock_item_id] || null }))
        : []
    }));

    setRows(baseRows);
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
                    onChange={(e) => updateStatus(r.id, e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
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
                        <div className="text-text-secondary text-xs">Qty: {it.qty}</div>
                        {it.notes && <div className="text-text-secondary text-xs">Notes: {it.notes}</div>}
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
                  <div className="text-xs uppercase text-text-secondary">Notes</div>
                  <div className="text-sm text-text-primary whitespace-pre-wrap min-h-[40px] border rounded px-3 py-2 bg-slate-50">
                    {r.notes || '—'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                      onClick={() => updateStatus(r.id, 'processing')}
                    >
                      <ArrowUpRight className="w-4 h-4" /> Proc.
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                      onClick={() => updateStatus(r.id, 'done')}
                    >
                      <ArrowDownRight className="w-4 h-4" /> Done
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                      onClick={() => handleDelete(r.id)}
                    >
                      <Trash2 className="w-4 h-4" /> Șterge
                    </button>
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
