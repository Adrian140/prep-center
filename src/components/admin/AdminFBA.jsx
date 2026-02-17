import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Edit3, Save, X, Star, ChevronDown } from 'lucide-react';
import { supabase } from '../../config/supabase';
import Section from '../common/Section';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { tabLocalStorage, readJSON, writeJSON } from '@/utils/tabStorage';
import { getTabId } from '@/utils/tabIdentity';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const createDefaultForm = () => ({
  service: 'FNSKU Labeling',
  service_date: todayStr(),
  unit_price: '',
  units: '',
  fba_id: '',
  obs_admin: '',
  custom_service: ''
});

// local presets (separate cheie pentru FBA)
const PRESET_KEY = 'fba_unit_price_presets';
const loadPresets = () => readJSON(tabLocalStorage, PRESET_KEY, []);
const savePresets = (arr) => writeJSON(tabLocalStorage, PRESET_KEY, arr);
const SCOPED_PRESET_KEY = typeof window !== 'undefined' ? `${getTabId()}:${PRESET_KEY}` : null;
const addPreset = (val) => {
  const v = Number(val);
  if (!isFinite(v)) return;
  const list = Array.from(new Set([ ...loadPresets(), v ])).sort((a,b)=>a-b);
  savePresets(list);
};

const formatInvoiceTooltip = (invoice) => {
  if (!invoice) return null;
  const formattedDate = invoice.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString('ro-RO')
    : null;
  return `Factură #${invoice.invoice_number}${formattedDate ? ` · ${formattedDate}` : ''}`;
};

export default function AdminFBA({
  rows = [],
  reload,
  companyId,
  profile,
  currentMarket,
  billingSelectedLines = {},
  onToggleBillingSelection,
  canSelectForBilling = true,
  onSelectAllUninvoiced
}) {
  const { t, tp, lang } = useAdminTranslation();
  const [edit, setEdit] = useState(null);
  const [presets, setPresets] = useState(loadPresets());
  const [serviceOptions, setServiceOptions] = useState([]);
  const [lastObsAdmin, setLastObsAdmin] = useState('');
  const [shippingCompletedByFbaId, setShippingCompletedByFbaId] = useState({});

  const formStorageKey = companyId
    ? `admin-fba-form-${companyId}`
    : `admin-fba-form-${profile?.id || 'default'}`;
const defaultForm = useMemo(() => createDefaultForm(), [companyId, profile?.id]);
const [form, setForm] = useSessionStorage(formStorageKey, defaultForm);

  const splitObs = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return { id: '', note: '' };
    const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
    const id = parts[0] || '';
    const note = parts.slice(1).join(' | ') || '';
    return { id, note };
  };

  const fallbackGroupLabels = useMemo(
    () => ({
      en: {
        noId: 'No ID (—)',
        lines: (count) => `${count} lines for this shipment`
      },
      ro: {
        noId: 'Fără ID (—)',
        lines: (count) => `${count} linii pentru această expediere`
      },
      fr: {
        noId: 'Sans ID (—)',
        lines: (count) => `${count} lignes pour cette expédition`
      }
    }),
    []
  );

  const resolveGroupLinesLabel = (count) => {
    const fb = fallbackGroupLabels[lang] || fallbackGroupLabels.en;
    const raw = tp('adminFBA.group.lines', { count });
    return raw && !raw.includes('adminFBA.group.lines') ? raw : fb.lines(count);
  };

  const resolveNoIdLabel = () => {
    const fb = fallbackGroupLabels[lang] || fallbackGroupLabels.en;
    const raw = t('adminFBA.group.noId');
    return raw && raw !== 'adminFBA.group.noId' ? raw : fb.noId;
  };

  useEffect(() => {
    const today = todayStr();
    setForm((prev) => {
      if (prev?.service_date === today) return prev;
      return { ...prev, service_date: today };
    });
  }, [companyId, setForm]);

  useEffect(() => {
  const fetchServices = async () => {
      const { data, error } = await supabase
        .from('pricing_services')
        .select('id, service_name, price, category')
        .in('category', ['FBA Prep Services', 'Extra Services'])
        .order('position', { ascending: true });
      if (error) {
        console.error('Failed to load FBA pricing services', error);
        return;
      }
      setServiceOptions(data || []);
    };
    fetchServices();
  }, []);

  useEffect(() => {
    let active = true;
    const normalizeFbaId = (value) => String(value || '').trim().toUpperCase();
    const extractShipmentIds = (row) => {
      const ids = new Set();
      const add = (value) => {
        const normalized = normalizeFbaId(value);
        if (normalized) ids.add(normalized);
      };
      add(row?.fba_shipment_id);
      add(row?.amazon_snapshot?.shipment_id);
      const step2 = Array.isArray(row?.step2_shipments) ? row.step2_shipments : [];
      step2.forEach((shipment) => {
        add(shipment?.shipmentId);
        add(shipment?.shipment_id);
        add(shipment?.amazonShipmentId);
        add(shipment?.amazon_shipment_id);
        add(shipment?.shipmentConfirmationId);
      });
      return Array.from(ids);
    };

    const loadShippingCompleted = async () => {
      if (!companyId) {
        setShippingCompletedByFbaId({});
        return;
      }
      let query = supabase
        .from('prep_requests')
        .select('fba_shipment_id, step2_confirmed_at, step2_shipments, amazon_snapshot')
        .eq('company_id', companyId)
        .not('step2_confirmed_at', 'is', null);
      if (currentMarket) {
        query = query.eq('warehouse_country', String(currentMarket).toUpperCase());
      }
      let { data, error } = await query;
      if (
        error &&
        currentMarket &&
        String(error.message || '').toLowerCase().includes('warehouse_country')
      ) {
        const retry = await supabase
          .from('prep_requests')
          .select('fba_shipment_id, step2_confirmed_at, step2_shipments, amazon_snapshot')
          .eq('company_id', companyId)
          .not('step2_confirmed_at', 'is', null);
        data = retry.data;
      }
      if (!active) return;
      const next = {};
      (Array.isArray(data) ? data : []).forEach((row) => {
        const timestamp = row?.step2_confirmed_at;
        if (!timestamp) return;
        const dateMs = Date.parse(timestamp);
        if (!Number.isFinite(dateMs)) return;
        extractShipmentIds(row).forEach((id) => {
          const currentMs = next[id] ? Date.parse(next[id]) : Number.NEGATIVE_INFINITY;
          if (!Number.isFinite(currentMs) || dateMs > currentMs) {
            next[id] = timestamp;
          }
        });
      });
      setShippingCompletedByFbaId(next);
    };

    loadShippingCompleted();
    return () => {
      active = false;
    };
  }, [companyId, currentMarket]);

  useEffect(() => {
    if (!serviceOptions.length) return;
    setForm((prev) => {
      const exists = serviceOptions.some((opt) => opt.service_name === prev.service);
      if (exists) {
        return {
          ...prev,
          custom_service: prev.service === 'Other' ? prev.custom_service : ''
        };
      }
      const fallback = serviceOptions[0];
      if (!fallback) return prev;
      const nextUnitPrice = fallback.price ?? prev.unit_price;
      return {
        ...prev,
        service: fallback.service_name,
        unit_price: nextUnitPrice,
        custom_service: ''
      };
    });
  }, [serviceOptions, setForm]);

  useEffect(() => {
    const onStorage = (e) => {
      if (!SCOPED_PRESET_KEY) return;
      if (e.key === SCOPED_PRESET_KEY) {
        setPresets(loadPresets());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const orderedRows = useMemo(() => {
    const parseDateVal = (rawVal) => {
      if (!rawVal) return Number.NEGATIVE_INFINITY;
      const val = String(rawVal).trim();
      if (!val) return Number.NEGATIVE_INFINITY;
      // ISO yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        const t = Date.parse(val);
        return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
      }
      // dd.MM.yyyy or dd/MM/yyyy
      const m = val.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
      if (m) {
        const [_, dd, mm, yyyy] = m;
        const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        const t = Date.parse(iso);
        return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
      }
      const t = Date.parse(val);
      return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
    };

    return [...(rows || [])].sort((a, b) => {
      const da = parseDateVal(a?.service_date);
      const db = parseDateVal(b?.service_date);
      if (db !== da) return db - da; // desc by service_date
      const ca = parseDateVal(a?.created_at);
      const cb = parseDateVal(b?.created_at);
      return cb - ca; // desc fallback by created_at
    });
  }, [rows]);

  useEffect(() => {
    const latestWithId = (orderedRows || []).find((r) => (r?.obs_admin || '').trim() !== '');
    const latestId = latestWithId ? splitObs(latestWithId.obs_admin || '').id : '';
    setLastObsAdmin(latestId);
  }, [orderedRows]);

  useEffect(() => {
    if (!lastObsAdmin) return;
    setForm((prev) => {
      if ((prev?.obs_admin || '').trim()) return prev;
      return { ...prev, fba_id: lastObsAdmin };
    });
  }, [lastObsAdmin, setForm]);

  const confirmAndDelete = async (id) => {
    if (!window.confirm('Sigur vrei să ștergi această linie?')) return;
    const { error } = await supabase.from('fba_lines').delete().eq('id', id);
    if (error) alert(error.message); else reload?.();
  };

  const handleAdd = async () => {
    if (!companyId) return;
    const selectedService =
      form.service === 'Other'
        ? (form.custom_service && form.custom_service.trim()) || 'Other'
        : form.service;
    const fbaId = (form.fba_id || '').trim();
    const note = (form.obs_admin || '').trim();
    const obsPayload = [fbaId, note].filter(Boolean).join(note ? ' | ' : '');

    const payload = {
      company_id: companyId,
      service: selectedService,
      service_date: form.service_date || todayStr(),
      unit_price: Number(form.unit_price || 0),
      units: Number(form.units || 0),
      obs_admin: obsPayload || null,
      created_by: profile.id,
      country: (currentMarket || profile?.country || 'FR').toUpperCase(),
    };
    const { error } = await supabase.from('fba_lines').insert(payload);
    if (error) return alert(error.message);
  // reset form (data rămâne azi) și păstrează obs_admin curent
  setForm((prev) => ({
    ...createDefaultForm(),
    fba_id: (prev?.fba_id || '').trim() || lastObsAdmin,
    obs_admin: ''
  }));
  reload?.();
};

  const handleServiceSelect = (value) => {
    const option = serviceOptions.find((item) => item.service_name === value);
    setForm((prev) => ({
      ...prev,
      service: value,
      unit_price: option?.price ?? prev.unit_price,
      custom_service: value === 'Other' ? prev.custom_service : ''
    }));
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

  const totalSum = useMemo(() => {
    return (orderedRows || []).reduce((acc, row) => {
      const total =
        row.total != null
          ? Number(row.total)
          : Number(row.unit_price || 0) * Number(row.units || 0);
      return acc + (Number.isFinite(total) ? total : 0);
    }, 0);
  }, [orderedRows]);

  const formatShippingCompletedAt = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('ro-RO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Section
      title="FBA"
      right={
        <div className="flex flex-wrap items-center gap-2 justify-end w-full md:w-auto">
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={form.service_date}
            onChange={(e) => setForm((s) => ({ ...s, service_date: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-2 py-1"
              value={form.service}
              onChange={(e) => handleServiceSelect(e.target.value)}
            >
              {serviceOptions.length > 0 ? (
                <>
                  {['FBA Prep Services', 'Extra Services'].map((category) => {
                    const optionsForCategory = serviceOptions.filter(
                      (option) => option.category === category
                    );
                    if (!optionsForCategory.length) return null;
                    return (
                      <optgroup
                        key={category}
                        label={
                          category === 'FBA Prep Services' ? 'FBA Prep' : 'Extra Services'
                        }
                      >
                        {optionsForCategory.map((option) => (
                          <option
                            key={option.id || option.service_name}
                            value={option.service_name}
                          >
                            {option.service_name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </>
              ) : (
                <option value={form.service}>{form.service}</option>
              )}
              <option value="Other">Other</option>
            </select>
            {form.service === 'Other' && (
              <input
                placeholder="Alt serviciu"
                className="border rounded px-2 py-1 w-40"
                value={form.custom_service}
                onChange={(e) => setForm((s) => ({ ...s, custom_service: e.target.value }))}
              />
            )}
          </div>

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
              onClick={() => {
                addPreset(form.unit_price);
                setPresets(loadPresets());
              }}
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
            placeholder="FBA ID"
            className="border rounded px-2 py-1 w-56"
            value={form.fba_id}
            onChange={(e) => setForm((s) => ({ ...s, fba_id: e.target.value }))}
            title="ID folosit pentru grupare (ex: FBA15LCP6YNC)"
          />
          <input
            placeholder="Obs admin (note)"
            className="border rounded px-2 py-1 w-56"
            value={form.obs_admin}
            onChange={(e) => setForm((s) => ({ ...s, obs_admin: e.target.value }))}
            title="Note adiționale"
          />
          <button onClick={handleAdd} className="bg-primary text-white px-3 py-1 rounded">
            Adaugă
          </button>
          {canSelectForBilling && (
            <button
              type="button"
              onClick={onSelectAllUninvoiced}
              className="border rounded px-3 py-1 text-sm"
            >
              Select all uninvoiced
            </button>
          )}
        </div>
      }
    >
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-center w-8"></th>
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
            {orderedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-text-secondary">
                  Fără înregistrări.
                </td>
              </tr>
            ) : (
              (() => {
                const normalizeId = (val) => (val || '').trim();
                const groupsMap = new Map();
                const groupsArr = [];

                (orderedRows || []).forEach((row, idx) => {
                  const { id: parsedId, note } = splitObs(row.obs_admin);
                  const normalized = normalizeId(parsedId);
                  const key = normalized ? normalized : `__noid__:${row.id}`;
                  if (!groupsMap.has(key)) {
                    const g = { key, order: idx, items: [] };
                    groupsMap.set(key, g);
                    groupsArr.push(g);
                  }
                  groupsMap.get(key).items.push({ ...row, _note: note, _parsedId: parsedId });
                });

                return groupsArr.map((group) => (
                  <React.Fragment key={group.key || group.order}>
                    {!group.key.startsWith('__noid__') && (
                      <tr className="bg-slate-50/70 border-t border-slate-200">
                        <td colSpan={8} className="px-3 py-2 text-sm text-text-primary font-semibold">
                          <span className="inline-flex items-center gap-2">
                            <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-semibold uppercase">
                              {group.key}
                            </span>
                            <span className="text-text-secondary text-xs inline-flex items-center gap-1">
                              <ChevronDown className="w-4 h-4" />
                              {resolveGroupLinesLabel(group.items.length)}
                            </span>
                            {formatShippingCompletedAt(shippingCompletedByFbaId[String(group.key || '').trim().toUpperCase()]) && (
                              <span className="text-emerald-700 text-xs font-medium">
                                Shipping încheiat: {formatShippingCompletedAt(shippingCompletedByFbaId[String(group.key || '').trim().toUpperCase()])}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    )}
                    {group.items.map((l, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === group.items.length - 1;
                      const isEdit = edit?.id === l.id;
                      const total = l.total != null
                        ? Number(l.total)
                        : Number(l.unit_price || 0) * Number(l.units || 0);
                      return (
                        <tr
                          key={l.id}
                          className={`${
                            isFirst ? 'border-t' : 'border-t-0'
                          } ${isLast ? 'border-b' : ''} ${
                            l.billing_invoice_id ? 'bg-blue-50 hover:bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                          title={formatInvoiceTooltip(l.billing_invoice)}
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(billingSelectedLines[`fba:${l.id}`])}
                              disabled={Boolean(l.billing_invoice_id) || !canSelectForBilling}
                              onChange={() => canSelectForBilling && onToggleBillingSelection?.('fba', l)}
                              className="rounded border-gray-300 focus:ring-2 focus:ring-primary"
                            />
                          </td>
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
                            ) : (l._note || '—')}
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
                  </React.Fragment>
                ));
              })()
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-semibold">
            <tr>
              <td className="px-3 py-2 text-right" colSpan={5}>
                Total
              </td>
              <td className="px-3 py-2 text-right">
                {Number.isFinite(totalSum) ? totalSum.toFixed(2) : '0.00'}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}
