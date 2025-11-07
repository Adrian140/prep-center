import React, { useEffect, useState } from 'react';
import { Trash2, Edit3, Save, X, Star } from 'lucide-react';
import { supabase } from '../../config/supabase';
import Section from '../common/Section';

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

// local presets (separate cheie pentru FBA)
const PRESET_KEY = 'fba_unit_price_presets';
const loadPresets = () => {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch { return []; }
};
const savePresets = (arr) => localStorage.setItem(PRESET_KEY, JSON.stringify(arr));
const addPreset = (val) => {
  const v = Number(val);
  if (!isFinite(v)) return;
  const list = Array.from(new Set([ ...loadPresets(), v ])).sort((a,b)=>a-b);
  savePresets(list);
};

export default function AdminFBA({ rows = [], reload, companyId, profile }) {
  const [edit, setEdit] = useState(null);
  const [presets, setPresets] = useState(loadPresets());

  const [form, setForm] = useState({
    service: 'FNSKU Labeling',
    service_date: todayStr(),
    unit_price: '',
    units: '',
    obs_admin: '',
  });

  useEffect(() => {
    // reîncarcă preseturile dacă s-au schimbat în alt tab
    const onStorage = (e) => { if (e.key === PRESET_KEY) setPresets(loadPresets()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const confirmAndDelete = async (id) => {
    if (!window.confirm('Sigur vrei să ștergi această linie?')) return;
    const { error } = await supabase.from('fba_lines').delete().eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const handleAdd = async () => {
    if (!companyId) return;
    const payload = {
      company_id: companyId,
      service: form.service,
      service_date: form.service_date || todayStr(),
      unit_price: Number(form.unit_price || 0),
      units: Number(form.units || 0),
      obs_admin: form.obs_admin || null,
      created_by: profile.id,
    };
    const { error } = await supabase.from('fba_lines').insert(payload);
    if (error) return alert(error.message);
    // reset form (data rămâne azi)
    setForm({
      service: 'FNSKU Labeling',
      service_date: todayStr(),
      unit_price: '',
      units: '',
      obs_admin: '',
    });
    reload?.();
  };

  const saveEdit = async () => {
    if (!edit) return;
    const payload = pick(edit, ['service_date','service','unit_price','units','obs_admin']);
    if (payload.service_date == null || payload.service_date === '') payload.service_date = todayStr();
    if (payload.unit_price != null) payload.unit_price = Number(payload.unit_price);
    if (payload.units != null) payload.units = Number(payload.units);
    const { error } = await supabase.from('fba_lines').update(payload).eq('id', edit.id);
    if (error) return alert(error.message);
    setEdit(null); reload?.();
  };

  return (
    <Section
      title="FBA"
      right={
        <div className="flex items-center space-x-2">
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={form.service_date}
            onChange={(e) => setForm((s) => ({ ...s, service_date: e.target.value }))}
          />

          {/* Preț cu datalist (presets) */}
          <div className="flex items-center gap-2">
            <input
              placeholder="Preț/unit"
              className="border rounded px-2 py-1 w-28"
              value={form.unit_price}
              onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))}
              list="fba-price-presets"
              inputMode="decimal"
            />
            <datalist id="fba-price-presets">
              {presets.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <button
              type="button"
              title="Salvează prețul în preseturi"
              className="px-2 py-1 border rounded inline-flex items-center gap-1"
              onClick={() => { addPreset(form.unit_price); setPresets(loadPresets()); }}
            >
              <Star className="w-4 h-4" /> Save
            </button>
          </div>

          <input
            placeholder="Unități"
            className="border rounded px-2 py-1 w-24"
            value={form.units}
            onChange={(e) => setForm((s) => ({ ...s, units: e.target.value }))}
            inputMode="numeric"
          />
          <input
            placeholder="Obs admin"
            className="border rounded px-2 py-1 w-56"
            value={form.obs_admin}
            onChange={(e) => setForm((s) => ({ ...s, obs_admin: e.target.value }))}
          />
          <button onClick={handleAdd} className="bg-primary text-white px-3 py-1 rounded">
            Adaugă
          </button>
        </div>
      }
    >
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Dată</th>
              <th className="px-3 py-2 text-left">Serviciu</th>
              <th className="px-3 py-2 text-right">Preț</th>
              <th className="px-3 py-2 text-right">Unități</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Obs admin</th>
              <th className="px-3 py-2 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-text-secondary">
                  Fără înregistrări.
                </td>
              </tr>
            ) : rows.map((l) => {
              const isEdit = edit?.id === l.id;
              const total = l.total != null
                ? Number(l.total)
                : Number(l.unit_price || 0) * Number(l.units || 0);
              return (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2">
                    {isEdit ? (
                      <input
                        type="date"
                        className="border rounded px-2 py-1"
                        value={edit.service_date || todayStr()}
                        onChange={(e)=>setEdit(s=>({...s,service_date:e.target.value}))}
                      />
                    ) : l.service_date}
                  </td>
                  <td className="px-3 py-2">
                    {isEdit ? (
                      <input
                        className="border rounded px-2 py-1 w-48"
                        value={edit.service || ''}
                        onChange={(e)=>setEdit(s=>({...s,service:e.target.value}))}
                      />
                    ) : l.service}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEdit ? (
                      <>
                        <input
                          className="border rounded px-2 py-1 w-24 text-right"
                          value={edit.unit_price ?? ''}
                          onChange={(e)=>setEdit(s=>({...s,unit_price:Number(e.target.value||0)}))}
                          list="fba-price-presets"
                          inputMode="decimal"
                        />
                      </>
                    ) : Number(l.unit_price).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEdit ? (
                      <input
                        className="border rounded px-2 py-1 w-20 text-right"
                        value={edit.units ?? ''}
                        onChange={(e)=>setEdit(s=>({...s,units:Number(e.target.value||0)}))}
                        inputMode="numeric"
                      />
                    ) : l.units}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isFinite(total) ? total.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {isEdit ? (
                      <input
                        className="border rounded px-2 py-1 w-56"
                        value={edit.obs_admin || ''}
                        onChange={(e)=>setEdit(s=>({...s,obs_admin:e.target.value}))}
                      />
                    ) : (l.obs_admin || '—')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEdit ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={saveEdit}
                          className="px-2 py-1 bg-primary text-white rounded inline-flex items-center gap-1"
                        >
                          <Save className="w-4 h-4" /> Salvează
                        </button>
                        <button
                          onClick={()=>setEdit(null)}
                          className="px-2 py-1 border rounded inline-flex items-center gap-1"
                        >
                          <X className="w-4 h-4" /> Anulează
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={()=>setEdit({...l})}
                          className="px-2 py-1 border rounded inline-flex items-center gap-1"
                        >
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
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
