import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Trash2, Edit3, Save, X, Eye, Star } from 'lucide-react';
import { supabase } from '../../config/supabase';
import Section from '../common/Section';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { tabLocalStorage, readJSON, writeJSON } from '@/utils/tabStorage';
import { getTabId } from '@/utils/tabIdentity';

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const createDefaultForm = () => ({
  service: 'FBM Order',
  service_date: todayStr(),
  unit_price: '',
  orders_units: '',
  obs_admin: '',
});

// local presets pentru FBM
const PRESET_KEY = 'fbm_unit_price_presets';
const loadPresets = () => readJSON(tabLocalStorage, PRESET_KEY, []);
const savePresets = (arr) => writeJSON(tabLocalStorage, PRESET_KEY, arr);
const SCOPED_PRESET_KEY = typeof window !== 'undefined' ? `${getTabId()}:${PRESET_KEY}` : null;
const addPreset = (val) => {
  const v = Number(val);
  if (!isFinite(v)) return;
  const list = Array.from(new Set([ ...loadPresets(), v ])).sort((a,b)=>a-b);
  savePresets(list);
};

export default function AdminFBM({ rows = [], reload, companyId, profile }) {
  const [edit, setEdit] = useState(null);
  const [presets, setPresets] = useState(loadPresets());
  const [serviceOptions, setServiceOptions] = useState([]);

  const formStorageKey = companyId
    ? `admin-fbm-form-${companyId}`
    : `admin-fbm-form-${profile?.id || 'default'}`;
  const defaultForm = useMemo(() => createDefaultForm(), [companyId, profile?.id]);
  const [form, setForm] = useSessionStorage(formStorageKey, defaultForm);

  useEffect(() => {
    const fetchServices = async () => {
      const { data, error } = await supabase
        .from('pricing_services')
        .select('id, service_name, price')
        .eq('category', 'FBM Fulfillment')
        .order('position', { ascending: true });
      if (error) {
        console.error('Failed to load FBM pricing services', error);
        return;
      }
      setServiceOptions(data || []);
    };
    fetchServices();
  }, []);

  useEffect(() => {
    if (!serviceOptions.length) return;
    setForm((prev) => {
      const exists = serviceOptions.some((opt) => opt.service_name === prev.service);
      if (exists) return prev;
      const fallback = serviceOptions[0];
      if (!fallback) return prev;
      const nextUnitPrice = fallback.price ?? prev.unit_price;
      return {
        ...prev,
        service: fallback.service_name,
        unit_price: nextUnitPrice
      };
    });
  }, [serviceOptions, setForm]);

  useEffect(() => {
    const onStorage = (e) => {
      if (!SCOPED_PRESET_KEY) return;
      if (e.key === SCOPED_PRESET_KEY) setPresets(loadPresets());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const markClientObsSeen = async (id) => {
    const { error } = await supabase.from('fbm_lines').update({ obs_client_seen: true }).eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const confirmAndDelete = async (id) => {
    if (!window.confirm('Sigur vrei să ștergi această linie?')) return;
    const { error } = await supabase.from('fbm_lines').delete().eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const handleAdd = async () => {
    if (!companyId) return;

    // normalizez data & prețul (2 zecimale ca să evit 1.5 vs 1.50)
    const service = form.service || 'FBM Order';
    const service_date = form.service_date || todayStr();
    const unit_price = Number(Number(form.unit_price || 0).toFixed(2));
    const unitsToAdd = Number(form.orders_units || 0);

    if (!isFinite(unit_price) || !isFinite(unitsToAdd) || unitsToAdd <= 0) {
      alert('Setează un preț și un număr de unități valide.');
      return;
    }

    // 1) Caută toate liniile existente cu aceeași cheie (company_id + date + price + service)
    const { data: existingRows, error: findErr } = await supabase
      .from('fbm_lines')
      .select('id, orders_units')
      .eq('company_id', companyId)
      .eq('service_date', service_date)
      .eq('service', service)
      .eq('unit_price', unit_price)
      .order('id', { ascending: true });

    if (findErr) {
      alert(findErr.message);
      return;
    }

    if (existingRows && existingRows.length > 0) {
      // 2) Găsit: adunăm unitățile pe prima linie, restul le eliminăm (pentru a evita duplicatele)
      const totalExisting = existingRows.reduce(
        (sum, row) => sum + Number(row.orders_units || 0),
        0
      );
      const newQty = totalExisting + unitsToAdd;
      const keeper = existingRows[0];
      const duplicates = existingRows.slice(1).map((r) => r.id);

      const { error: updErr } = await supabase
        .from('fbm_lines')
        .update({ orders_units: newQty })
        .eq('id', keeper.id);
      if (updErr) {
        alert(updErr.message);
        return;
      }

      if (duplicates.length) {
        const { error: delErr } = await supabase
          .from('fbm_lines')
          .delete()
          .in('id', duplicates);
        if (delErr) {
          alert(delErr.message);
          return;
        }
      }
    } else {
      // 3) Nu există: inserăm linie nouă
      const payload = {
        company_id: companyId,
        service,
        service_date,
        unit_price,
        orders_units: unitsToAdd,
        obs_admin: form.obs_admin || null,
        created_by: profile.id,
      };

      const { error: insErr } = await supabase.from('fbm_lines').insert(payload);
      if (insErr) {
        alert(insErr.message);
        return;
      }
    }

  // reset form & refresh
  setForm(() => createDefaultForm());
  reload?.();
};

  const handleServiceSelect = (value) => {
    const option = serviceOptions.find((item) => item.service_name === value);
    setForm((prev) => ({
      ...prev,
      service: value,
      unit_price: option?.price ?? prev.unit_price
    }));
  };

  const saveEdit = async () => {
    if (!edit) return;
    const payload = pick(edit, ['service_date','service','unit_price','orders_units','obs_admin']);
    if (payload.service_date == null || payload.service_date === '') payload.service_date = todayStr();
    if (payload.unit_price != null) payload.unit_price = Number(payload.unit_price);
    if (payload.orders_units != null) payload.orders_units = Number(payload.orders_units);
    const { error } = await supabase.from('fbm_lines').update(payload).eq('id', edit.id);
    if (error) return alert(error.message);
    setEdit(null); reload?.();
  };

  return (
    <Section
      title="FBM"
      right={
        <div className="flex items-center space-x-2">
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={form.service_date}
            onChange={(e) => setForm((s) => ({ ...s, service_date: e.target.value }))}
          />
          <select
            className="border rounded px-2 py-1"
            value={form.service}
            onChange={(e) => handleServiceSelect(e.target.value)}
          >
            {serviceOptions.length === 0 ? (
              <option value={form.service}>{form.service}</option>
            ) : (
              serviceOptions.map((option) => (
                <option key={option.id || option.service_name} value={option.service_name}>
                  {option.service_name}
                </option>
              ))
            )}
          </select>

          {/* Preț cu datalist și buton Save */}
          <div className="flex items-center gap-2">
            <input
              placeholder="Preț/unit"
              className="border rounded px-2 py-1 w-28"
              value={form.unit_price}
              onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))}
              list="fbm-price-presets"
              inputMode="decimal"
            />
            <datalist id="fbm-price-presets">
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
            placeholder="Comenzi/Unități"
            className="border rounded px-2 py-1 w-36"
            value={form.orders_units}
            onChange={(e) => setForm((s) => ({ ...s, orders_units: e.target.value }))}
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
              <th className="px-3 py-2 text-right">Comenzi/Unități</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Obs client</th>
              <th className="px-3 py-2 text-left">Obs admin</th>
              <th className="px-3 py-2 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-text-secondary">Fără înregistrări.</td></tr>
            ) : rows.map((l) => {
              const isEdit = edit?.id === l.id;
              const total = l.total != null ? Number(l.total) : Number(l.unit_price || 0) * Number(l.orders_units || 0);
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
                      <input className="border rounded px-2 py-1 w-48"
                        value={edit.service || ''} onChange={(e)=>setEdit(s=>({...s,service:e.target.value}))}/>
                    ) : l.service}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEdit ? (
                      <>
                        <input
                          className="border rounded px-2 py-1 w-24 text-right"
                          value={edit.unit_price ?? ''}
                          onChange={(e)=>setEdit(s=>({...s,unit_price:Number(e.target.value||0)}))}
                          list="fbm-price-presets"
                          inputMode="decimal"
                        />
                      </>
                    ) : Number(l.unit_price).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEdit ? (
                      <input className="border rounded px-2 py-1 w-24 text-right"
                        value={edit.orders_units ?? ''} onChange={(e)=>setEdit(s=>({...s,orders_units:Number(e.target.value||0)}))}
                        inputMode="numeric"
                      />
                    ) : l.orders_units}
                  </td>
                  <td className="px-3 py-2 text-right">{isFinite(total) ? total.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2">
                    {l.obs_client ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => alert(l.obs_client)}
                          className="inline-flex items-center gap-1 text-primary underline"
                          title="Vezi observația clientului"
                        >
                          <Eye className="w-4 h-4" /> vezi
                        </button>
                        {l.obs_client_seen === false && (
                          <button
                            onClick={() => markClientObsSeen(l.id)}
                            className="flex items-center gap-1 text-amber-600"
                            title="Observație nouă de la client – marchează ca văzut"
                          >
                            <AlertTriangle className="w-4 h-4" /> nou
                          </button>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {isEdit ? (
                      <input className="border rounded px-2 py-1 w-56"
                        value={edit.obs_admin || ''} onChange={(e)=>setEdit(s=>({...s,obs_admin:e.target.value}))}/>
                    ) : (l.obs_admin || '—')}
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
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
