import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, RefreshCcw } from 'lucide-react';
import { supabase } from '@/config/supabase';

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function AdminBoxes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('boxes')
      .select('id, name, length_cm, width_cm, height_cm, max_kg, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setMessage(error.message || 'Failed to load boxes.');
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const addRow = () => {
    setRows((prev) => [
      { id: `tmp-${Date.now()}`, name: 'New box', length_cm: null, width_cm: null, height_cm: null, max_kg: null, isNew: true },
      ...prev,
    ]);
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row) => {
    const payload = {
      name: row.name || 'Box',
      length_cm: toNum(row.length_cm),
      width_cm: toNum(row.width_cm),
      height_cm: toNum(row.height_cm),
      max_kg: toNum(row.max_kg),
    };
    setSavingId(row.id);
    setMessage('');
    try {
      if (row.isNew || String(row.id).startsWith('tmp-')) {
        const { data, error } = await supabase.from('boxes').insert(payload).select().single();
        if (error) throw error;
        setRows((prev) => prev.map((r) => (r.id === row.id ? data : r)));
      } else {
        const { data, error } = await supabase.from('boxes').update(payload).eq('id', row.id).select().single();
        if (error) throw error;
        setRows((prev) => prev.map((r) => (r.id === row.id ? data : r)));
      }
      setMessage('Saved.');
    } catch (err) {
      setMessage(err.message || 'Failed to save.');
    } finally {
      setSavingId(null);
    }
  };

  const deleteRow = async (row) => {
    if (row.isNew || String(row.id).startsWith('tmp-')) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    if (!confirm('Delete this box?')) return;
    setSavingId(row.id);
    setMessage('');
    const { error } = await supabase.from('boxes').delete().eq('id', row.id);
    if (error) {
      setMessage(error.message || 'Failed to delete.');
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    }
    setSavingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Box profiles</h2>
          <p className="text-text-secondary">Set standard box dimensions and max weight for estimări.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1 px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
          >
            <RefreshCcw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1 px-3 py-1.5 border rounded text-sm bg-primary text-white hover:bg-primary-dark"
          >
            <Plus className="w-4 h-4" /> Add box
          </button>
        </div>
      </div>

      {message && <div className="text-sm text-primary">{message}</div>}

      <div className="overflow-x-auto bg-white border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-text-secondary uppercase text-xs tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-right">L (cm)</th>
              <th className="px-3 py-2 text-right">W (cm)</th>
              <th className="px-3 py-2 text-right">H (cm)</th>
              <th className="px-3 py-2 text-right">Max kg</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-text-secondary">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-text-secondary">No boxes yet.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={row.name || ''}
                      onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-20 border rounded px-2 py-1 text-right text-sm"
                      value={row.length_cm ?? ''}
                      onChange={(e) => updateRow(row.id, { length_cm: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-20 border rounded px-2 py-1 text-right text-sm"
                      value={row.width_cm ?? ''}
                      onChange={(e) => updateRow(row.id, { width_cm: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-20 border rounded px-2 py-1 text-right text-sm"
                      value={row.height_cm ?? ''}
                      onChange={(e) => updateRow(row.id, { height_cm: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-20 border rounded px-2 py-1 text-right text-sm"
                      value={row.max_kg ?? ''}
                      onChange={(e) => updateRow(row.id, { max_kg: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={savingId === row.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border rounded text-primary border-primary hover:bg-primary hover:text-white disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button
                      onClick={() => deleteRow(row)}
                      disabled={savingId === row.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
