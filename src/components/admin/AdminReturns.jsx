import React, { useMemo, useState } from 'react';
import { AlertTriangle, Trash2, Edit3, Save, X, Eye } from 'lucide-react';
import { supabase } from '../../config/supabase';
import Section from '../common/Section';
import { useSessionStorage } from '@/hooks/useSessionStorage';

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

const defaultFormState = () => ({
  return_date: '',
  asin: '',
  qty: '',
  return_type: '',
  status: 'Sigilat',
  status_note: '',
  obs_admin: '',
});

export default function AdminReturns({ rows = [], reload, companyId, profile }) {
  const [edit, setEdit] = useState(null);
  const formStorageKey = companyId
    ? `admin-returns-form-${companyId}`
    : `admin-returns-form-${profile?.id || 'default'}`;
  const defaultForm = useMemo(() => defaultFormState(), [companyId, profile?.id]);
  const [form, setForm] = useSessionStorage(formStorageKey, defaultForm);

  const markClientObsSeen = async (id) => {
    const { error } = await supabase.from('returns').update({ obs_client_seen: true }).eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const confirmAndDelete = async (id) => {
    if (!window.confirm('Sigur vrei să ștergi această linie?')) return;
    const { error } = await supabase.from('returns').delete().eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const handleAdd = async () => {
    if (!companyId) return;
    const payload = {
      company_id: companyId,
      return_date: form.return_date,
      asin: form.asin,
      qty: Number(form.qty || 0),
      return_type: form.return_type || null,
      status: form.status || null,
      status_note: form.status === 'Other' ? (form.status_note || null) : null,
      obs_admin: form.obs_admin || null,
      created_by: profile.id,
    };
    const { error } = await supabase.from('returns').insert(payload);
    if (error) return alert(error.message);
    setForm(() => defaultFormState());
    reload?.();
  };

  const saveEdit = async () => {
    if (!edit) return;
    const payload = pick(edit, ['return_date','asin','qty','return_type','status','status_note','obs_admin']);
    if (payload.status !== 'Other') payload.status_note = null;
    if (payload.qty != null) payload.qty = Number(payload.qty);
    const { error } = await supabase.from('returns').update(payload).eq('id', edit.id);
    if (error) return alert(error.message);
    setEdit(null); reload?.();
  };

  return (
    <Section
      title="Retururi"
      right={
        <div className="flex items-center space-x-2">
          <input type="date" className="border rounded px-2 py-1"
            value={form.return_date}
            onChange={(e) => setForm((s) => ({ ...s, return_date: e.target.value }))} />
          <input placeholder="ASIN" className="border rounded px-2 py-1 w-40"
            value={form.asin}
            onChange={(e) => setForm((s) => ({ ...s, asin: e.target.value }))} />
          <input placeholder="Cantitate" className="border rounded px-2 py-1 w-28"
            value={form.qty}
            onChange={(e) => setForm((s) => ({ ...s, qty: e.target.value }))} />
          <input placeholder="Tip retur" className="border rounded px-2 py-1 w-40"
            value={form.return_type}
            onChange={(e) => setForm((s) => ({ ...s, return_type: e.target.value }))} />
          <select
            className="border rounded px-2 py-1 w-36"
            value={form.status}
            onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
          >
            <option>Sigilat</option>
            <option>Desigilat</option>
            <option>Distrus</option>
            <option>Other</option>
          </select>
          {form.status === 'Other' && (
            <input
              placeholder="Motiv (Other)"
              className="border rounded px-2 py-1 w-56"
              value={form.status_note}
              onChange={(e) => setForm((s) => ({ ...s, status_note: e.target.value }))}
            />
          )}
          <input placeholder="Obs admin" className="border rounded px-2 py-1 w-56"
            value={form.obs_admin}
            onChange={(e) => setForm((s) => ({ ...s, obs_admin: e.target.value }))} />
          <button onClick={handleAdd} className="bg-primary text-white px-3 py-1 rounded">
            Adaugă
          </button>
        </div>
      }
    >
     <div className="relative mt-4 overflow-x-auto">
  {/* lățime minimă ca să avem scrollbar când e nevoie */}
  <table className="min-w-[1200px] w-full text-sm table-auto border-collapse">
    <thead className="bg-gray-50 text-text-secondary">
      <tr>
        <th className="px-4 py-3 text-left whitespace-nowrap w-[160px]">Data</th>
        <th className="px-4 py-3 text-left whitespace-nowrap w-[210px]">ASIN</th>
        <th className="px-4 py-3 text-right whitespace-nowrap w-[100px]">Cant.</th>
        <th className="px-4 py-3 text-left whitespace-nowrap w-[220px]">Tip retur</th>
        <th className="px-4 py-3 text-left whitespace-nowrap w-[220px]">Status</th>
        <th className="px-4 py-3 text-left whitespace-nowrap w-[280px]">Obs admin</th>
        {/* sticky pe dreapta ca să vezi mereu butoanele */}
        <th className="px-4 py-3 text-right whitespace-nowrap sticky right-0 bg-gray-50 z-10 w-[160px]">
          Acțiuni
        </th>
      </tr>
    </thead>

    <tbody>
      {(!rows || rows.length === 0) ? (
        <tr className="border-t">
          <td colSpan={7} className="px-4 py-6 text-center text-gray-400">Niciun retur încă.</td>
        </tr>
      ) : (
        rows.map((r) => {
          const editing = edit?.id === r.id;
          return (
            <tr key={r.id} className="border-t align-top">
              {/* date */}
              <td className="px-4 py-3 whitespace-nowrap">
                {editing ? (
                  <input
                    type="date"
                    className="border rounded px-2 py-1 w-[160px]"
                    value={edit.return_date || ''}
                    onChange={(e) => setEdit(s => ({ ...s, return_date: e.target.value }))}
                  />
                ) : (r.return_date || '—')}
              </td>

              {/* ASIN */}
              <td className="px-4 py-3">
                {editing ? (
                  <input
                    className="border rounded px-2 py-1 w-[210px]"
                    value={edit.asin || ''}
                    onChange={(e) => setEdit(s => ({ ...s, asin: e.target.value }))}
                  />
                ) : (r.asin || '—')}
              </td>

              {/* qty */}
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {editing ? (
                  <input
                    className="border rounded px-2 py-1 w-[100px] text-right"
                    value={edit.qty ?? ''}
                    onChange={(e) => setEdit(s => ({ ...s, qty: e.target.value }))}
                  />
                ) : r.qty}
              </td>

              {/* return_type */}
              <td className="px-4 py-3">
                {editing ? (
                  <input
                    className="border rounded px-2 py-1 w-[220px]"
                    value={edit.return_type ?? ''}
                    onChange={(e) => setEdit(s => ({ ...s, return_type: e.target.value }))}
                  />
                ) : (r.return_type || '—')}
              </td>

              {/* status + status_note */}
              <td className="px-4 py-3">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1 w-[140px]"
                      value={edit.status ?? 'Sigilat'}
                      onChange={(e) => setEdit(s => ({ ...s, status: e.target.value }))}
                    >
                      <option>Sigilat</option>
                      <option>Desigilat</option>
                      <option>Distrus</option>
                      <option>Other</option>
                    </select>
                    {edit.status === 'Other' && (
                      <input
                        className="border rounded px-2 py-1 w-[220px]"
                        placeholder="Motiv (Other)"
                        value={edit.status_note ?? ''}
                        onChange={(e) => setEdit(s => ({ ...s, status_note: e.target.value }))}
                      />
                    )}
                  </div>
                ) : (
                  <>
                    {r.status || '—'}
                    {r.status === 'Other' && r.status_note ? (
                      <span className="text-text-secondary"> · {r.status_note}</span>
                    ) : null}
                  </>
                )}
              </td>

              {/* obs_admin */}
              <td className="px-4 py-3">
                {editing ? (
                  <input
                    className="border rounded px-2 py-1 w-[280px]"
                    value={edit.obs_admin ?? ''}
                    onChange={(e) => setEdit(s => ({ ...s, obs_admin: e.target.value }))}
                  />
                ) : (r.obs_admin || '—')}
              </td>

              {/* Actions – sticky right */}
              <td className="px-4 py-3 text-right sticky right-0 bg-white z-10">
                {editing ? (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={saveEdit}
                      className="inline-flex items-center px-2 py-1 rounded bg-green-600 text-white"
                      title="Salvează"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEdit(null)}
                      className="inline-flex items-center px-2 py-1 rounded bg-gray-500 text-white"
                      title="Renunță"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    {!!r.obs_client && !r.obs_client_seen && (
                      <button
                        onClick={() => markClientObsSeen(r.id)}
                        className="inline-flex items-center px-2 py-1 rounded border"
                        title="Marchează observația client ca văzută"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setEdit({ ...r })}
                      className="inline-flex items-center px-2 py-1 rounded border"
                      title="Editează"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => confirmAndDelete(r.id)}
                      className="inline-flex items-center px-2 py-1 rounded bg-red-600 text-white"
                      title="Șterge"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          );
        })
      )}
    </tbody>
  </table>
</div>


    </Section>
  );
}
