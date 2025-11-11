// FILE: src/components/admin/AdminStock.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Edit3, Save, X, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../config/supabase';
import Section from '../common/Section';
import ProductPhotosModal from '../common/ProductPhotosModal';
import ProductQuickAdd from '../common/ProductQuickAdd';

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

export default function AdminStock({ rows = [], reload, companyId, profile }) {
  const [edit, setEdit] = useState(null);
  const [localRows, setLocalRows] = useState(rows);
  const [photoItem, setPhotoItem] = useState(null);
  const handleQuickAddComplete = ({ inserted = [], updated = [] }) => {
    setLocalRows((prev) => {
      const updateMap = new Map(updated.map((row) => [row.id, row]));
      let next = prev.map((row) => (updateMap.has(row.id) ? { ...row, ...updateMap.get(row.id) } : row));
      if (inserted.length) {
        next = [...inserted, ...next];
      }
      return next;
    });
    reload?.();
  };
  const handleQuickAddError = (msg) => {
    if (msg) alert(msg);
  };

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  // INPUT-URI LOCALE pentru +/- pe fiecare rând
  const [qtyInputs, setQtyInputs] = useState({}); // { [id]: { dec: '', inc: '' } }

  const confirmAndDelete = async (id) => {
    if (!window.confirm('Sigur vrei să ștergi această linie?')) return;
    const { error } = await supabase.from('stock_items').delete().eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const saveEdit = async () => {
    if (!edit) return;
    const payload = pick(edit, ['ean','qty','name','asin','sku','obs_admin']);
    if (payload.qty != null) payload.qty = Number(payload.qty);
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
    setLocalRows((prev) =>
      prev.map((item) => (item.id === row.id ? { ...item, qty: next } : item))
    );
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
          className="border rounded text-right px-1.5 py-1
                     w-14 h-[34px] text-[13px]
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
          className="border rounded text-right px-1.5 py-1
                     w-14 h-[34px] text-[13px]
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
  const sortedRows = useMemo(() => {
    const list = [...localRows];
    return list.sort((a, b) => {
      const qtyA = Number(a.qty) || 0;
      const qtyB = Number(b.qty) || 0;
      if (qtyA > 0 && qtyB > 0) return 0;
      if (qtyA === 0 && qtyB > 0) return 1;
      if (qtyA > 0 && qtyB === 0) return -1;
      return 0;
    });
  }, [localRows]);
  return (
    <Section title="Stoc" right={null}>
      <div className="mb-6">
        <ProductQuickAdd
          companyId={companyId || null}
          userId={null}
          createdBy={profile?.id || null}
          existingRows={localRows}
          onComplete={handleQuickAddComplete}
          onError={handleQuickAddError}
        />
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left w-24">Foto</th>
              <th className="px-3 py-2 text-left">Produs / Amazon</th>
              <th className="px-3 py-2 text-right">Stoc Prep Center</th>
              <th className="px-3 py-2 text-left">Obs admin</th>
              <th className="px-3 py-2 text-left">Poze</th>
              <th className="px-3 py-2 text-right">Acțiuni</th>
            </tr>
          </thead>

          <tbody>
            {localRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-text-secondary">
                  Fără înregistrări.
                </td>
              </tr>
            ) : (
              sortedRows.map((l) => {
                const isEdit = edit?.id === l.id;
                const thumb = l.image_url;
                const amazonBlocks = [
                  { label: 'Disponibil', value: l.amazon_stock },
                  { label: 'Inbound', value: l.amazon_inbound },
                  { label: 'Reserved', value: l.amazon_reserved },
                  { label: 'Unfulfillable', value: l.amazon_unfulfillable },
                ];
                const hasAmazonData = amazonBlocks.some(block => Number(block.value || 0) > 0);
                return (
                  <tr key={l.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={l.name || l.asin || 'Produs'}
                          className="w-16 h-16 rounded border object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded border bg-gray-50 text-[11px] text-text-secondary flex items-center justify-center">
                          No Img
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEdit ? (
                        <>
                          <input
                            className="border rounded px-2 py-1 w-full mb-2"
                            value={edit.name || ''}
                            onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            <input
                              className="border rounded px-2 py-1"
                              placeholder="ASIN"
                              value={edit.asin || ''}
                              onChange={(e) => setEdit((s) => ({ ...s, asin: e.target.value }))}
                            />
                            <input
                              className="border rounded px-2 py-1"
                              placeholder="SKU"
                              value={edit.sku || ''}
                              onChange={(e) => setEdit((s) => ({ ...s, sku: e.target.value }))}
                            />
                          </div>
                          <input
                            className="border rounded px-2 py-1 w-full"
                            placeholder="EAN"
                            value={edit.ean || ''}
                            onChange={(e) => setEdit((s) => ({ ...s, ean: e.target.value }))}
                          />
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-text-primary">{l.name || '—'}</div>
                          <div className="text-xs text-text-secondary mt-1 space-y-0.5 font-mono">
                            <div>EAN: {l.ean || '—'}</div>
                            <div>ASIN: {l.asin || '—'}</div>
                            <div>SKU: {l.sku || '—'}</div>
                          </div>
                          {hasAmazonData && (
                            <div className="mt-2">
                              <div className="text-[10px] uppercase tracking-wide text-gray-500">Amazon inventory</div>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {amazonBlocks.map((block) => (
                                  <div key={block.label} className="px-2 py-1 bg-gray-100 rounded text-center">
                                    <div className="text-[10px] text-gray-500">{block.label}</div>
                                    <div className="text-sm font-semibold text-text-primary">
                                      {Number(block.value || 0)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <QtyCell row={l} />
                    </td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={edit.obs_admin || ''}
                          onChange={(e)=>setEdit(s=>({...s,obs_admin:e.target.value}))}
                        />
                      ) : (l.obs_admin || '—')}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setPhotoItem(l)}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <ImageIcon className="w-4 h-4" /> Fotografiile produsului
                      </button>
                    </td>
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
          <tfoot className="border-t font-semibold bg-gray-50">
            <tr>
              <td className="px-3 py-2 text-right" colSpan={2}>Total</td>
              <td className="px-3 py-2 text-right">
                {localRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ProductPhotosModal
        open={!!photoItem}
        onClose={() => setPhotoItem(null)}
        stockItem={photoItem}
        companyId={companyId}
        canEdit
      />
    </Section>
  );
}
