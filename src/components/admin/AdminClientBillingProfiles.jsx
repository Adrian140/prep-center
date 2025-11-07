// FILE: src/components/admin/AdminClientBillingProfiles.jsx
import React, { useEffect, useState } from 'react';
import { supabaseHelpers } from '../../config/supabase';
import { Pencil, Trash2, Save, X } from 'lucide-react';

export default function AdminClientBillingProfiles({ profile, hideTitles = false }) {
  const userId = profile?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    if (!userId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabaseHelpers.getBillingProfiles(userId);
    if (error) setFlash(error.message);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      type: row.type,
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      company_name: row.company_name || '',
      cui: row.cui || '',
      vat_number: row.vat_number || '',
      country: row.country || '',
      address: row.address || '',
      city: row.city || '',
      postal_code: row.postal_code || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setForm({}); };

  const saveEdit = async () => {
    setFlash('');
    const { error } = await supabaseHelpers.updateBillingProfile(editingId, form);
    if (error) { setFlash(error.message); return; }
    setFlash('Saved successfully.');
    setEditingId(null);
    setForm({});
    load();
  };

  const onDelete = async (id) => {
    if (!confirm('Delete this billing profile?')) return;
    const { error } = await supabaseHelpers.deleteBillingProfile(id);
    if (error) { setFlash(error.message); return; }
    setFlash('Deleted.');
    load();
  };

  return (
    <div className="space-y-4">
      {!hideTitles && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Billing details</h3>
        </div>
      )}

      {flash && (
        <div
          className={`px-4 py-3 rounded-lg ${
            flash.toLowerCase().includes('success') ||
            flash === 'Saved successfully.' ||
            flash === 'Deleted.'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {flash}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No billing profiles saved by this user.</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="border rounded-xl p-5 bg-white">
            {editingId === r.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1">Type</label>
                    <select
                      className="w-full border rounded px-2 py-2"
                      value={form.type}
                      onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                    >
                      <option value="individual">individual</option>
                      <option value="company">company</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">First name</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.first_name}
                      onChange={(e) => setForm((s) => ({ ...s, first_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Last name</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.last_name}
                      onChange={(e) => setForm((s) => ({ ...s, last_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Company name</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.company_name}
                      onChange={(e) => setForm((s) => ({ ...s, company_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">CUI</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.cui}
                      onChange={(e) => setForm((s) => ({ ...s, cui: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">VAT number</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.vat_number}
                      onChange={(e) => setForm((s) => ({ ...s, vat_number: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Country</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.country}
                      onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs mb-1">Address</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.address}
                      onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">City</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.city}
                      onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Postal code</label>
                    <input
                      className="w-full border rounded px-2 py-2"
                      value={form.postal_code}
                      onChange={(e) => setForm((s) => ({ ...s, postal_code: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={saveEdit}
                    className="px-4 py-2 bg-green-600 text-white rounded flex items-center"
                  >
                    <Save className="w-4 h-4 mr-1" /> Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 bg-gray-200 rounded flex items-center"
                  >
                    <X className="w-4 h-4 mr-1" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="text-sm">
                  <div className="font-medium mb-1">
                    {r.type === 'company'
                      ? (r.company_name || '—')
                      : `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—'}
                  </div>
                  <div className="text-gray-600 space-y-1">
                    {r.type === 'company' && (
                      <div>CUI/CIF: {r.cui || '—'} · VAT: {r.vat_number || '—'}</div>
                    )}
                    <div>
                      {r.address}, {r.city}, {r.postal_code}, {r.country}
                    </div>
                    <div className="text-xs text-gray-400">
                      Updated: {new Date(r.updated_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(r)}
                    className="px-3 py-2 border rounded flex items-center"
                  >
                    <Pencil className="w-4 h-4 mr-1" /> Edit
                  </button>
                  <button
                    onClick={() => onDelete(r.id)}
                    className="px-3 py-2 border rounded text-red-600 flex items-center"
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
