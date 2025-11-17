import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseHelpers } from '../../config/supabase';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import AdminPrepRequestDetail from './AdminPrepRequestDetail';
import { tabSessionStorage, readJSON, writeJSON } from '@/utils/tabStorage';
import DestinationBadge from '@/components/common/DestinationBadge';

const STORAGE_KEY = 'admin-prep-requests-state';

const StatusPill = ({ s }) => {
  const map = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  return <span className={`px-2 py-1 rounded text-xs ${map[s] || 'bg-gray-100 text-gray-700'}`}>{s}</span>;
};

export default function AdminPrepRequests() {
  const persistedRef = useRef(null);
  if (persistedRef.current === null) {
    persistedRef.current = readJSON(tabSessionStorage, STORAGE_KEY, {});
  }
  const initialState = persistedRef.current || {};
  const initialPage = Number(initialState.page) > 0 ? Number(initialState.page) : 1;

  const [status, setStatus] = useState(initialState.status || 'all'); // all | pending | confirmed | cancelled
  const [q, setQ] = useState(initialState.q || '');             // căutare simplă
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(initialPage);
  const pageSize = 10;
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(initialState.selectedId || null); // request id pt. detail
  const [flash, setFlash] = useState('');
  const firstLoadRef = useRef(true);
  const initialPageRef = useRef(initialPage);

 const handleDelete = async (row) => {
  const shortId = row.id?.slice(0, 8) || row.id;
  const clientLabel =
    [row.client_company_name, row.client_name, row.company_name].filter(Boolean).join(' / ') ||
    row.user_email ||
    'client';
  const basePrompt = `Sigur dorești să ștergi recepția clientului ${clientLabel}?`;
  const firstPrompt =
    row.status === 'confirmed'
      ? `${basePrompt}\nRequest ${shortId} este CONFIRMED.\nȘtergerea va elimina DEFINITIV și liniile + tracking.`
      : `${basePrompt}\nRequest ${shortId} va fi șters definitiv.`;

  if (!confirm(firstPrompt)) return;

  if (row.status === 'confirmed') {
    const secondPrompt = `Confirmare suplimentară:\nRequest ${shortId} este CONFIRMED și va dispărea definitiv din istoric.\nApasă OK doar dacă ești 100% sigur.`;
    if (!confirm(secondPrompt)) return;
  }

  setFlash('');
  try {
    const { error } = await supabaseHelpers.deletePrepRequest(row.id);
    if (error) throw error;
    await load(1); // sau load(page) dacă preferi să rămâi pe pagină
    setFlash('Request deleted.');
  } catch (e) {
    setFlash(e?.message || 'Delete failed.');
  }
};

 const load = async (p = page) => {
  setLoading(true);
  setFlash('');
  try {
    const { data, error, count: c } = await supabaseHelpers.listPrepRequests({
      status: status === 'all' ? undefined : status,
      page: p,
      pageSize,
    });
    if (error) throw error;

    setRows(Array.isArray(data) ? data : []);
    setCount(c || 0);
    setPage(p);
  } catch (e) {
    console.error('listPrepRequests failed:', e?.message || e);
    setRows([]);
    setCount(0);
    setFlash(e?.message || 'Eroare la încărcare.');
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    load(initialPageRef.current);
    firstLoadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstLoadRef.current) return;
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    writeJSON(tabSessionStorage, STORAGE_KEY, { status, q, page, selectedId });
  }, [status, q, page, selectedId]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => {
      const items = r.prep_request_items || [];
      const hitItem = items.some(
        (it) =>
          (it.asin || '').toLowerCase().includes(s) ||
          (it.sku || '').toLowerCase().includes(s)
      );
      const email = (r.user_email || '').toLowerCase();
      const comp = (r.company_name || '').toLowerCase();
      const cname = (r.client_name || '').toLowerCase();
      const clientCompany = (r.client_company_name || '').toLowerCase();
      return hitItem || email.includes(s) || comp.includes(s) || cname.includes(s) || clientCompany.includes(s);
    });
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil((status === 'all' ? count : filtered.length) / pageSize));

  if (selectedId) {
    return (
      <AdminPrepRequestDetail
        requestId={selectedId}
        onBack={() => setSelectedId(null)}
        onChanged={() => load(page)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Prep Requests</h2>
        <button onClick={() => load(page)} className="inline-flex items-center gap-2 px-3 py-2 border rounded">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută în ASIN / SKU / nume / email / companie…"
            className="pl-9 pr-3 py-2 w-80 border rounded-lg"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-secondary" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded px-2 py-2"
          >
            <option value="all">Toate</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {flash && (
        <div className="px-4 py-3 rounded bg-red-50 border border-red-200 text-red-700">{flash}</div>
      )}

      <div className="border rounded-xl overflow-hidden overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">Creat la</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Store</th>
              <th className="px-4 py-3 text-left">Țara</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Produse</th>
              <th className="px-4 py-3 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-secondary">
                  Se încarcă…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-secondary">
                  Nimic de afișat.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-3">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {r.client_company_name || r.company_name || r.client_name || '—'}
                    </div>
                    {r.client_name && r.client_name !== r.client_company_name && (
                      <div className="text-xs text-text-secondary">{r.client_name}</div>
                    )}
                    <div className="text-xs text-text-secondary">{r.user_email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">{r.company_name || r.store_name || '—'}</td>
                  <td className="px-4 py-3">
                    <DestinationBadge code={r.destination_country || 'FR'} variant="subtle" />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill s={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      {(r.prep_request_items || []).slice(0, 3).map((it) => {
                        const thumb = it.stock_item?.image_url || it.image_url || '';
                        const code = it.asin || it.sku || '—';
                        return (
                          <div key={it.id} className="flex items-center gap-2 min-w-[140px]">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={it.product_name || it.stock_item?.name || code}
                                className="w-12 h-12 rounded border object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded border bg-gray-50 text-[10px] text-text-secondary flex items-center justify-center">
                                No Img
                              </div>
                            )}
                            <div className="text-xs leading-tight">
                              <div className="font-semibold font-mono">{code}</div>
                              <div className="text-text-secondary">
                                {it.units_requested} u · SKU: {it.sku || '—'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(r.prep_request_items || []).length > 3 && (
                      <div className="text-xs text-text-secondary mt-1">
                        +{(r.prep_request_items || []).length - 3} produse…
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className="px-3 py-1 bg-primary text-white rounded"
                    >
                      Deschide
                    </button>
                     <button
                      onClick={() => handleDelete(r)}
                      className="ml-2 px-3 py-1 bg-red-600 text-white rounded inline-flex items-center gap-1"
                      title={`Delete request (${r.status})`}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <button
          className="px-2 py-1 border rounded disabled:opacity-50"
          onClick={() => load(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="Pagina anterioară"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-text-secondary">
          Pagina {page} / {totalPages}
        </span>
        <button
          className="px-2 py-1 border rounded disabled:opacity-50"
          onClick={() => load(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title="Pagina următoare"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
