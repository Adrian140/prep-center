import React, { useEffect, useMemo, useState } from 'react';
import { supabaseHelpers } from '../../config/supabase';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import AdminPrepRequestDetail from './AdminPrepRequestDetail';

const StatusPill = ({ s }) => {
  const map = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  return <span className={`px-2 py-1 rounded text-xs ${map[s] || 'bg-gray-100 text-gray-700'}`}>{s}</span>;
};

export default function AdminPrepRequests() {
  const [status, setStatus] = useState('all'); // all | pending | confirmed | cancelled
  const [q, setQ] = useState('');             // căutare simplă
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // request row pt. detail
  const [flash, setFlash] = useState('');

 const handleDelete = async (row) => {
  const shortId = row.id?.slice(0, 8) || row.id;
  const msg =
    row.status === 'confirmed'
      ? `Request ${shortId} este CONFIRMED.\nȘtergerea va elimina DEFINITIV și liniile + tracking.\nEști SIGUR că vrei să continui?`
      : `Ștergi request ${shortId}? Această acțiune nu poate fi anulată.`;

  if (!confirm(msg)) return;

  setFlash('');
  try {
    const { error } = await supabaseHelpers.deletePrepRequest(row.id);
    if (error) throw error;
    setFlash('Request deleted.');
    await load(1); // sau load(page) dacă preferi să rămâi pe pagină
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
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
      return hitItem || email.includes(s) || comp.includes(s) || cname.includes(s);
    });
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil((status === 'all' ? count : filtered.length) / pageSize));

  if (selected) {
    return (
      <AdminPrepRequestDetail
        requestId={selected.id}
        onBack={() => setSelected(null)}
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

      <div className="border rounded-xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">Creat la</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Companie</th>
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
                    {r.client_name ? <b>{r.client_name}</b> : '—'}
                    <div className="text-xs text-text-secondary">{r.user_email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">{r.company_name || '—'}</td>
                  <td className="px-4 py-3">{r.destination_country}</td>
                  <td className="px-4 py-3">
                    <StatusPill s={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    {(r.prep_request_items || []).slice(0, 3).map((it) => (
                      <div key={it.id}>
                        ASIN: <b>{it.asin}</b> · SKU: {it.sku} · {it.units_requested} u.
                      </div>
                    ))}
                    {(r.prep_request_items || []).length > 3 && (
                      <div className="text-xs text-text-secondary">
                        +{(r.prep_request_items || []).length - 3} produse…
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(r)}
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
