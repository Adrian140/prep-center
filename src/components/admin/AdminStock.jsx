// FILE: src/components/admin/AdminStock.jsx
import React, { useState } from 'react';
import { Trash2, Edit3, Save, X } from 'lucide-react';
import { supabase } from '../../config/supabase';
import Section from '../common/Section';

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

export default function AdminStock({ rows = [], reload, companyId, profile }) {
  const [edit, setEdit] = useState(null);

  // INPUT-URI LOCALE pentru +/- pe fiecare rând
  const [qtyInputs, setQtyInputs] = useState({}); // { [id]: { dec: '', inc: '' } }

  // Form de adăugare (fără product_link)
  const [form, setForm] = useState({
    ean: '',
    qty: '',
    name: '',
    asin: '',
    purchase_price: '',
    obs_admin: '',
  });

  const confirmAndDelete = async (id) => {
    if (!window.confirm('Sigur vrei să ștergi această linie?')) return;
    const { error } = await supabase.from('stock_items').delete().eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const handleAdd = async () => {
    if (!companyId) return;
    const payload = {
      company_id: companyId,
      ean: form.ean || null,
      qty: form.qty === '' ? 0 : Number(form.qty),
      name: form.name || null,
      asin: form.asin || null,
      purchase_price:
        form.purchase_price === '' || form.purchase_price == null
          ? null
          : Number(form.purchase_price),
      obs_admin: form.obs_admin || null,
      created_by: profile.id,
    };
    const { error } = await supabase.from('stock_items').insert(payload);
    if (error) return alert(error.message);
    setForm({ ean: '', qty: '', name: '', asin: '', purchase_price: '', obs_admin: '' });
    reload?.();
  };

  const saveEdit = async () => {
    if (!edit) return;
    const payload = pick(edit, ['ean','qty','name','asin','purchase_price','obs_admin']);
    if (payload.qty != null) payload.qty = Number(payload.qty);
    if (payload.purchase_price !== '' && payload.purchase_price != null) {
      payload.purchase_price = Number(payload.purchase_price);
    }
    const { error } = await supabase.from('stock_items').update(payload).eq('id', edit.id);
    if (error) return alert(error.message);
    setEdit(null);
    reload?.();
  };

  // === helpers pentru inputurile +/- pe fiecare rând ===
  const setInput = (id, which, val) => {
    setQtyInputs((s) => ({
      ...s,
      [id]: { dec: s[id]?.dec ?? '', inc: s[id]?.inc ?? '', [which]: val },
    }));
  };

  const commitAdjustFromInput = async (e, row, which) => {
    const raw = (e.currentTarget.value || '').trim();
    if (!raw) return;

    const delta = Number(raw.replace(',', '.'));
    if (!isFinite(delta) || delta <= 0) {
      setInput(row.id, which, '');
      return;
    }

    const current = Number(row.qty || 0);
    const next = which === 'dec' ? Math.max(0, current - delta) : current + delta;

    const { error } = await supabase
      .from('stock_items')
      .update({ qty: next })
      .eq('id', row.id);

    if (error) {
      alert(error.message);
      return;
    }

    // curăț doar căsuța folosită și reîncarc
    setQtyInputs((s) => ({
      ...s,
      [row.id]: {
        dec: which === 'dec' ? '' : (s[row.id]?.dec ?? ''),
        inc: which === 'inc' ? '' : (s[row.id]?.inc ?? ''),
      },
    }));
    reload?.();
  };

  // === celula de cantitate (stânga = scade, dreapta = adaugă) ===
  const QtyCell = ({ row }) => {
    const inputs = qtyInputs[row.id] || { dec: '', inc: '' };

    return (
      <div className="flex items-center justify-end gap-2">
        {/* STÂNGA — SCĂDE */}
        <input
          type="text"
          inputMode="numeric"
          pattern="\\d*"
          className="border rounded text-right px-1 py-0.5
                     w-[28px] h-[32px] text-[13px]
                     [appearance:textfield]
                     [&::-webkit-outer-spin-button]:appearance-none
                     [&::-webkit-inner-spin-button]:appearance-none"
          value={inputs.dec}
          onChange={(e) => setInput(row.id, 'dec', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); e.stopPropagation();
              commitAdjustFromInput(e, row, 'dec');
            }
          }}
          onBlur={(e) => commitAdjustFromInput(e, row, 'dec')}
        />

        {/* VALOAREA CURENTĂ */}
        <div className="min-w-[3.5rem] text-center font-semibold">
          {Number(row.qty ?? 0)}
        </div>

        {/* DREAPTA — ADAUGĂ */}
        <input
          type="text"
          inputMode="numeric"
          pattern="\\d*"
          className="border rounded text-right px-1 py-0.5
                     w-[28px] h-[32px] text-[13px]
                     [appearance:textfield]
                     [&::-webkit-outer-spin-button]:appearance-none
                     [&::-webkit-inner-spin-button]:appearance-none"
          value={inputs.inc}
          onChange={(e) => setInput(row.id, 'inc', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); e.stopPropagation();
              commitAdjustFromInput(e, row, 'inc');
            }
          }}
          onBlur={(e) => commitAdjustFromInput(e, row, 'inc')}
        />
      </div>
    );
  };
const sortedRows = [...rows].sort((a, b) => {
            const qtyA = Number(a.qty) || 0;
            const qtyB = Number(b.qty) || 0;
            if (qtyA > 0 && qtyB > 0) return 0;     // ambele active → păstrează ordinea
            if (qtyA === 0 && qtyB > 0) return 1;   // 0 merge după
            if (qtyA > 0 && qtyB === 0) return -1;  // activ merge înainte
            return 0;                               // ambele 0 → ordinea originală
          });
  return (
    <Section
      title="Stoc"
      right={
        <div className="w-full">
          {/* -1 coloană: fără Link */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <input
              placeholder="EAN (admin)"
              className="border rounded px-2 py-1 w-full"
              value={form.ean}
              onChange={(e) => setForm((s) => ({ ...s, ean: e.target.value }))}
            />
            <input
              placeholder="Cantitate"
              className="border rounded px-2 py-1 w-full"
              value={form.qty}
              onChange={(e) => setForm((s) => ({ ...s, qty: e.target.value }))}
            />
            <input
              placeholder="Product name"
              className="border rounded px-2 py-1 w-full"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
            <input
              placeholder="ASIN / SKU (client)"
              className="border rounded px-2 py-1 w-full"
              value={form.asin}
              onChange={(e) => setForm((s) => ({ ...s, asin: e.target.value }))}
            />
            <input
              placeholder="Preț ach. (client)"
              className="border rounded px-2 py-1 w-full"
              value={form.purchase_price}
              onChange={(e) => setForm((s) => ({ ...s, purchase_price: e.target.value }))}
            />
            <input
              placeholder="Obs admin"
              className="border rounded px-2 py-1 w-full"
              value={form.obs_admin}
              onChange={(e) => setForm((s) => ({ ...s, obs_admin: e.target.value }))}
            />

            <div className="col-span-2 sm:col-span-1">
              <button
                onClick={handleAdd}
                className="bg-primary text-white px-3 py-2 rounded w-full lg:w-auto"
              >
                Adaugă
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">EAN (admin)</th>
              <th className="px-3 py-2 text-right">Cantitate</th>
              <th className="px-3 py-2 text-left">Product name</th>
              <th className="px-3 py-2 text-left">ASIN / SKU (client)</th>
              <th className="px-3 py-2 text-right">Preț ach. (client)</th>
              <th className="px-3 py-2 text-right">Valoare (auto)</th>
              <th className="px-3 py-2 text-left">Obs admin</th>
              <th className="px-3 py-2 text-right">Acțiuni</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-text-secondary">
                  Fără înregistrări.
                </td>
              </tr>
            ) : (
              sortedRows.map((l) => {
                const isEdit = edit?.id === l.id;
                return (
                  <tr key={l.id} className="border-t">
                    {/* EAN */}
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-40"
                          value={edit.ean || ''}
                          onChange={(e) => setEdit((s) => ({ ...s, ean: e.target.value }))}
                        />
                      ) : (l.ean || '—')}
                    </td>

                    {/* Cantitate: minus / valoare / plus (mereu activ, fără Edit) */}
                    <td className="px-3 py-2 text-right">
                      <QtyCell row={l} />
                    </td>

                    {/* Product name */}
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-56"
                          value={edit.name || ''}
                          onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                        />
                      ) : (l.name || '—')}
                    </td>

                    {/* ASIN / SKU */}
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-44"
                          value={edit.asin || ''}
                          onChange={(e)=>setEdit(s=>({...s,asin:e.target.value}))}
                        />
                      ) : (l.asin || '—')}
                    </td>

                    {/* Preț achiziție */}
                    <td className="px-3 py-2 text-right">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-24 text-right"
                          value={edit.purchase_price ?? ''}
                          onChange={(e)=>setEdit(s=>({...s,purchase_price:Number(e.target.value||0)}))}
                        />
                      ) : (l.purchase_price != null ? Number(l.purchase_price).toFixed(2) : '—')}
                    </td>

                    {/* Valoare stoc */}
                    <td className="px-3 py-2 text-right">
                      {l.stock_value != null ? Number(l.stock_value).toFixed(2) : '—'}
                    </td>

                    {/* Obs admin */}
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-56"
                          value={edit.obs_admin || ''}
                          onChange={(e)=>setEdit(s=>({...s,obs_admin:e.target.value}))}
                        />
                      ) : (l.obs_admin || '—')}
                    </td>

                    {/* Acțiuni */}
                    <td className="px-3 py-2 text-right">
                      {isEdit ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={saveEdit} className="px-2 py-1 bg-primary text-white rounded inline-flex items-center gap-1">
                            <Save className="w-4 h-4" /> Salvează
                          </button>
                          <button onClick={()=>setEdit(null)} className="px-2 py-1 border rounded inline-flex items-center gap-1">
                            <X className="w-4 h-4" /> Anulează
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button onClick={()=>setEdit({...l})} className="px-2 py-1 border rounded inline-flex items-center gap-1">
                            <Edit3 className="w-4 h-4" /> Edit
                          </button>
                          <button
                            onClick={()=>confirmAndDelete(l.id)}
                            className="px-2 py-1 border rounded text-red-600 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={8} className="px-3 py-2"></td>
            </tr>
          </tfoot>
          <tfoot className="border-t font-semibold bg-gray-50">
            <tr>
              <td className="px-3 py-2 text-right" colSpan={1}>Total</td>
              <td className="px-3 py-2 text-right">
                {rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)}
              </td>
              <td colSpan={3}></td>
              <td className="px-3 py-2 text-right">
                {rows.reduce((sum, r) => sum + (Number(r.stock_value) || 0), 0).toFixed(2)}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}
