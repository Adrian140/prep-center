import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Save, Trash2, X } from 'lucide-react';
import Section from '../common/Section';
import { supabaseHelpers } from '@/config/supabase';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';
import { useSessionStorage } from '@/hooks/useSessionStorage';

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const fmt = (value) => Number.isFinite(value) ? value.toFixed(2) : '0.00';
const splitObs = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { id: '', note: '' };
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  const id = parts[0] || '';
  const note = parts.slice(1).join(' | ') || '';
  return { id, note };
};

const formatInvoiceTooltip = (invoice) => {
  if (!invoice) return null;
  const formattedDate = invoice.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString('ro-RO')
    : null;
  return `Factură #${invoice.invoice_number}${formattedDate ? ` · ${formattedDate}` : ''}`;
};
const normalizeServiceLabel = (value) => String(value || '').trim().replace(/\s+/g, ' ');

export default function AdminOther({
  rows = [],
  extraRows = [],
  reload,
  companyId,
  profile,
  currentMarket,
  billingSelectedLines = {},
  onToggleBillingSelection,
  canSelectForBilling = true,
  onSelectAllUninvoiced
}) {
  const { t, tp } = useAdminTranslation();
  const [edit, setEdit] = useState(null);
  const formStorageKey = companyId
    ? `admin-other-form-${companyId}`
    : `admin-other-form-${profile?.id || 'default'}`;
  const [form, setForm] = useSessionStorage(formStorageKey, {
    service: '',
    service_date: todayStr(),
    unit_price: '',
    units: '',
    obs_admin: ''
  });
  const [serviceOptions, setServiceOptions] = useState([]);
  const [servicePriceMap, setServicePriceMap] = useState({});

  useEffect(() => {
    const today = todayStr();
    setForm((prev) => {
      if (prev?.service_date === today) return prev;
      return { ...prev, service_date: today };
    });
  }, [companyId, setForm]);

  useEffect(() => {
    let cancelled = false;
    const fetchServiceOptions = async () => {
      const { data, error } = await supabaseHelpers.getPricingServices(currentMarket);
      if (error) {
        console.error('Failed to load Other pricing services', error);
        return;
      }
      const seen = new Set();
      const options = [];
      const prices = {};
      (data || []).forEach((row) => {
        const name = normalizeServiceLabel(row?.service_name);
        const category = String(row?.category || '').toLowerCase();
        if (!name) return;
        if (!category.includes('extra') && !category.includes('storage')) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        options.push(name);
        prices[name] = row?.price ?? '';
      });
      if (!cancelled) {
        setServiceOptions(options);
        setServicePriceMap(prices);
      }
    };
    fetchServiceOptions();
    return () => {
      cancelled = true;
    };
  }, [currentMarket]);

  useEffect(() => {
    if (!serviceOptions.length) return;
    setForm((prev) => {
      if ((prev?.service || '').trim()) return prev;
      const firstService = serviceOptions[0];
      return {
        ...prev,
        service: firstService,
        unit_price: servicePriceMap[firstService] ?? prev.unit_price
      };
    });
  }, [serviceOptions, servicePriceMap, setForm]);

  const handleAdd = async () => {
    if (!companyId) return;
    if (!form.service.trim()) {
      alert('Completează denumirea serviciului.');
      return;
    }
    const unitPrice = Number(form.unit_price || 0);
    const units = Number(form.units || 1) || 1;
    const payload = {
      company_id: companyId,
      service: form.service.trim(),
      service_date: form.service_date || todayStr(),
      country: String(currentMarket || profile?.country || 'FR').toUpperCase(),
      unit_price: unitPrice,
      units,
      total: Number.isFinite(unitPrice * units) ? unitPrice * units : null,
      obs_admin: form.obs_admin || null,
      created_by: profile?.id || null
    };
    const { error } = await supabaseHelpers.createOtherLine(payload);
    if (error) {
      alert(error.message);
      return;
    }
    setForm({
      service: '',
      service_date: todayStr(),
      unit_price: '',
      units: '',
      obs_admin: ''
    });
    reload?.();
  };

  const saveEdit = async () => {
    if (!edit) return;
    const isReturnLine = edit.__billingSection === 'returns';
    const unitPrice = Number(edit.unit_price || 0);
    const units = Number(edit.units || 0);
    const total = Number.isFinite(unitPrice * units) ? unitPrice * units : null;
    const payload = {
      service: edit.service?.trim() || '',
      service_date: edit.service_date || todayStr(),
      unit_price: unitPrice,
      units,
      total,
      obs_admin: edit.obs_admin || null
    };
    const { error } = isReturnLine
      ? await supabaseHelpers.updateReturnServiceLine(edit.id, payload)
      : await supabaseHelpers.updateOtherLine(edit.id, payload);
    if (error) {
      alert(error.message);
      return;
    }
    setEdit(null);
    reload?.();
  };

  const confirmAndDelete = async (row) => {
    const isReturnLine = row?.__billingSection === 'returns';
    const id = row?.id;
    if (!id) return;
    if (!window.confirm('Ștergi această înregistrare?')) return;
    const { error } = isReturnLine
      ? await supabaseHelpers.deleteReturnServiceLine(id)
      : await supabaseHelpers.deleteOtherLine(id);
    if (error) {
      alert(error.message);
      return;
    }
    reload?.();
  };

  const serviceLabels = useMemo(
    () => ({
      manual: t('serviceNames.manualPhoto') || 'Manual photo capture',
      subscription: t('serviceNames.photoSubscription') || 'Photo storage subscription',
      returnFee: t('adminOther.serviceNames.returnFee') || 'Return fee',
      transport: t('adminOther.serviceNames.transport') || 'Transport',
      kmDropoff: t('adminOther.serviceNames.kmDropoff') || 'Km până la punctul de predare'
    }),
    [t]
  );

  const localizeReturnPrefix = (value) => {
    if (!value) return value;
    const prefix = t('adminOther.returnGroup.prefix') || 'Retur';
    return String(value).replace(/^retur\b/i, prefix);
  };

  const renderServiceName = (value) => {
    if (!value) return '—';
    const normalized = value.trim();
    const lowered = normalized.toLowerCase();
    if (/^manual photo capture/i.test(normalized)) return serviceLabels.manual;
    if (/^photo storage subscription$/i.test(normalized)) return serviceLabels.subscription;
    if (lowered === 'return fee' || lowered === 'retur fee') return serviceLabels.returnFee;
    if (lowered === 'transport') return serviceLabels.transport;
    if (lowered === 'km până la punctul de predare') return serviceLabels.kmDropoff;
    return normalized.replace(/ \(6 images\)/i, '');
  };

  const totalSum = useMemo(() => {
    return ([...(rows || []), ...(extraRows || [])]).reduce((acc, row) => {
      const v = row.total != null
        ? Number(row.total)
        : Number(row.unit_price || 0) * Number(row.units || 0);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [rows, extraRows]);

  const mergedRows = useMemo(() => {
    const baseRows = (rows || []).map((row) => ({ ...row, __billingSection: 'other' }));
    const returnRows = (extraRows || []).map((row) => {
      const { id: groupId, note } = splitObs(row?.obs_admin);
      return {
        ...row,
        __billingSection: 'returns',
        __groupId: groupId || 'Retur',
        __groupNote: note
      };
    });
    return [...baseRows, ...returnRows].sort((a, b) => {
      const da = new Date(a?.service_date || a?.created_at || 0).getTime();
      const db = new Date(b?.service_date || b?.created_at || 0).getTime();
      return db - da;
    });
  }, [rows, extraRows]);

  const groupedDisplayRows = useMemo(() => {
    const result = [];
    const groupedReturnRows = mergedRows.filter((row) => row.__billingSection === 'returns');
    const nonReturnRows = mergedRows.filter((row) => row.__billingSection !== 'returns');
    const groupedMap = new Map();
    groupedReturnRows.forEach((row) => {
      const key = String(row.__groupId || 'Retur');
      if (!groupedMap.has(key)) groupedMap.set(key, []);
      groupedMap.get(key).push(row);
    });

    const groupedEntries = [];
    const singleReturnRows = [];
    groupedMap.forEach((rowsInGroup, key) => {
      if (rowsInGroup.length > 1) {
        groupedEntries.push({ key, rows: rowsInGroup });
      } else {
        singleReturnRows.push(...rowsInGroup);
      }
    });

    groupedEntries.forEach((entry) => {
      result.push({
        __rowType: 'header',
        __key: `header-${entry.key}`,
        label: entry.key,
        count: entry.rows.length
      });
      entry.rows.forEach((row) =>
        result.push({ ...row, __rowType: 'data', __isSingleLine: false })
      );
    });

    const singleRows = [...singleReturnRows, ...nonReturnRows].sort((a, b) => {
      const da = new Date(a?.service_date || a?.created_at || 0).getTime();
      const db = new Date(b?.service_date || b?.created_at || 0).getTime();
      return db - da;
    });
    if (singleRows.length) {
      result.push({
        __rowType: 'single-section',
        __key: 'single-section',
        count: singleRows.length
      });
      singleRows.forEach((row) =>
        result.push({ ...row, __rowType: 'data', __isSingleLine: true })
      );
    }

    return result;
  }, [mergedRows]);

  return (
    <Section
      title="Other services"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-2 py-1 w-48"
              value={form.service}
              onChange={(e) => {
                const nextService = e.target.value;
                setForm((s) => ({
                  ...s,
                  service: nextService,
                  unit_price: nextService ? (servicePriceMap[nextService] ?? s.unit_price) : s.unit_price
                }));
              }}
            >
              <option value="">Select service…</option>
              {serviceOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              {form.service && !serviceOptions.includes(form.service) && (
                <option value={form.service}>{form.service}</option>
              )}
            </select>
            <input
              placeholder="Add custom service"
              className="border rounded px-2 py-1 w-48"
              value={form.service}
              onChange={(e) => setForm((s) => ({ ...s, service: e.target.value }))}
              onBlur={(e) => {
                const value = (e.target.value || '').trim();
                if (!value) return;
                const autoPrice = servicePriceMap[value];
                if (autoPrice == null || autoPrice === '') return;
                setForm((s) => ({ ...s, service: value, unit_price: autoPrice }));
              }}
            />
          </div>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={form.service_date}
            onChange={(e) => setForm((s) => ({ ...s, service_date: e.target.value }))}
          />
          <input
            placeholder="Preț/unit"
            className="border rounded px-2 py-1 w-24 text-right"
            value={form.unit_price}
            onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))}
            inputMode="decimal"
          />
          <input
            placeholder="Unități"
            className="border rounded px-2 py-1 w-20 text-right"
            value={form.units}
            onChange={(e) => setForm((s) => ({ ...s, units: e.target.value }))}
            inputMode="decimal"
          />
          <input
            placeholder="Obs admin"
            className="border rounded px-2 py-1 w-60"
            value={form.obs_admin}
            onChange={(e) => setForm((s) => ({ ...s, obs_admin: e.target.value }))}
          />
          <button
            onClick={handleAdd}
            className="bg-primary text-white px-3 py-1 rounded"
          >
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
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Serviciu</th>
              <th className="px-3 py-2 text-right">Preț</th>
              <th className="px-3 py-2 text-right">Unități</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">Obs admin</th>
              <th className="px-3 py-2 text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {groupedDisplayRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-text-secondary">
                  Nicio înregistrare.
                </td>
              </tr>
            ) : (
              groupedDisplayRows.map((row) => {
                if (row.__rowType === 'header') {
                  return (
                    <tr key={row.__key} className="bg-slate-50/80 border-t border-slate-200">
                      <td colSpan={8} className="px-3 py-2 text-sm text-text-primary font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-semibold uppercase">
                            {localizeReturnPrefix(row.label)}
                          </span>
                          <span className="text-text-secondary text-xs">
                            {tp('adminOther.returnGroup.lines', { count: row.count })}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                }
                if (row.__rowType === 'single-section') {
                  const singleLabelRaw = t('adminOther.returnGroup.singleLines');
                  const singleLabel =
                    singleLabelRaw &&
                    !String(singleLabelRaw).includes('adminOther.returnGroup.singleLines')
                      ? singleLabelRaw
                      : 'Lignes individuelles';
                  return (
                    <tr key={row.__key} className="bg-slate-50/40 border-t border-slate-200">
                      <td colSpan={8} className="px-3 py-2 text-sm text-text-secondary font-semibold">
                        {singleLabel}
                      </td>
                    </tr>
                  );
                }
                const isEdit = edit?.id === row.id;
                const isReturnRow = row.__billingSection === 'returns';
                const isSingleLine = Boolean(row.__isSingleLine);
                const total =
                  row.total != null
                    ? Number(row.total)
                    : Number(row.unit_price || 0) * Number(row.units || 0);
              return (
                <tr
                  key={row.id}
                  className={`border-t ${
                    row.billing_invoice_id
                      ? 'bg-blue-50 hover:bg-blue-50'
                      : isSingleLine
                        ? 'bg-slate-50/20 hover:bg-gray-50'
                        : 'hover:bg-gray-50'
                  }`}
                  title={formatInvoiceTooltip(row.billing_invoice)}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(billingSelectedLines[`${row.__billingSection || 'other'}:${row.id}`])}
                      disabled={Boolean(row.billing_invoice_id) || !canSelectForBilling}
                      onChange={() =>
                        canSelectForBilling &&
                        onToggleBillingSelection?.(row.__billingSection || 'other', row)
                      }
                      className="rounded border-gray-300 focus:ring-2 focus:ring-primary"
                    />
                  </td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          type="date"
                          className="border rounded px-2 py-1"
                          value={edit.service_date || todayStr()}
                          onChange={(e) => setEdit((s) => ({ ...s, service_date: e.target.value }))}
                        />
                      ) : row.service_date}
                    </td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-56"
                          value={edit.service || ''}
                          onChange={(e) => setEdit((s) => ({ ...s, service: e.target.value }))}
                        />
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span>{renderServiceName(row.service)}</span>
                          {isSingleLine && (
                            <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold uppercase tracking-wide">
                              {t('adminOther.returnGroup.singleTag') || 'Single'}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-24 text-right"
                          value={edit.unit_price ?? ''}
                          onChange={(e) =>
                            setEdit((s) => ({ ...s, unit_price: e.target.value }))
                          }
                          inputMode="decimal"
                        />
                      ) : fmt(Number(row.unit_price || 0))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-20 text-right"
                          value={edit.units ?? ''}
                          onChange={(e) => setEdit((s) => ({ ...s, units: e.target.value }))}
                          inputMode="decimal"
                        />
                      ) : Number(row.units || 0)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(total)}</td>
                    <td className="px-3 py-2">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={edit.obs_admin || ''}
                          onChange={(e) => setEdit((s) => ({ ...s, obs_admin: e.target.value }))}
                        />
                      ) : (isReturnRow ? localizeReturnPrefix(row.obs_admin || '—') : row.obs_admin || '—')}
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
                            onClick={() => setEdit(null)}
                            className="px-2 py-1 border rounded inline-flex items-center gap-1"
                          >
                            <X className="w-4 h-4" /> Anulează
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEdit({ ...row })}
                            className="px-2 py-1 border rounded inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-4 h-4" /> Edit
                          </button>
                          <button
                            onClick={() => confirmAndDelete(row)}
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
              <td className="px-3 py-2 text-right" colSpan={4}>Total</td>
              <td className="px-3 py-2 text-right">{fmt(totalSum)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}
