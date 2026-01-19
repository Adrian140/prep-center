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

const formatInvoiceTooltip = (invoice) => {
  if (!invoice) return null;
  const formattedDate = invoice.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString('ro-RO')
    : null;
  return `Factură #${invoice.invoice_number}${formattedDate ? ` · ${formattedDate}` : ''}`;
};

export default function AdminOther({
  rows = [],
  reload,
  companyId,
  profile,
  billingSelectedLines = {},
  onToggleBillingSelection,
  canSelectForBilling = true
}) {
  const { t } = useAdminTranslation();
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

  useEffect(() => {
    const today = todayStr();
    setForm((prev) => {
      if (prev?.service_date === today) return prev;
      return { ...prev, service_date: today };
    });
  }, [companyId, setForm]);

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
    const payload = {
      service: edit.service?.trim() || '',
      service_date: edit.service_date || todayStr(),
      unit_price: Number(edit.unit_price || 0),
      units: Number(edit.units || 0),
      total: Number(edit.total ?? (Number(edit.unit_price || 0) * Number(edit.units || 0))),
      obs_admin: edit.obs_admin || null
    };
    const { error } = await supabaseHelpers.updateOtherLine(edit.id, payload);
    if (error) {
      alert(error.message);
      return;
    }
    setEdit(null);
    reload?.();
  };

  const confirmAndDelete = async (id) => {
    if (!window.confirm('Ștergi această înregistrare?')) return;
    const { error } = await supabaseHelpers.deleteOtherLine(id);
    if (error) {
      alert(error.message);
      return;
    }
    reload?.();
  };

  const serviceLabels = useMemo(
    () => ({
      manual: t('serviceNames.manualPhoto') || 'Manual photo capture',
      subscription: t('serviceNames.photoSubscription') || 'Photo storage subscription'
    }),
    [t]
  );

  const renderServiceName = (value) => {
    if (!value) return '—';
    const normalized = value.trim();
    if (/^manual photo capture/i.test(normalized)) return serviceLabels.manual;
    if (/^photo storage subscription$/i.test(normalized)) return serviceLabels.subscription;
    return normalized.replace(/ \(6 images\)/i, '');
  };

  const totalSum = useMemo(() => {
    return (rows || []).reduce((acc, row) => {
      const v = row.total != null
        ? Number(row.total)
        : Number(row.unit_price || 0) * Number(row.units || 0);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [rows]);

  return (
    <Section
      title="Other services"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <input
            placeholder="Denumire serviciu"
            className="border rounded px-2 py-1 w-48"
            value={form.service}
            onChange={(e) => setForm((s) => ({ ...s, service: e.target.value }))}
          />
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-text-secondary">
                  Nicio înregistrare.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isEdit = edit?.id === row.id;
                const total =
                  row.total != null
                    ? Number(row.total)
                    : Number(row.unit_price || 0) * Number(row.units || 0);
              return (
                <tr
                  key={row.id}
                  className={`border-t ${
                    row.billing_invoice_id ? 'bg-blue-50 hover:bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  title={formatInvoiceTooltip(row.billing_invoice)}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(billingSelectedLines[`other:${row.id}`])}
                      disabled={Boolean(row.billing_invoice_id) || !canSelectForBilling}
                      onChange={() => canSelectForBilling && onToggleBillingSelection?.('other', row)}
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
                      ) : renderServiceName(row.service)}
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
                      ) : row.obs_admin || '—'}
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
                            onClick={() => confirmAndDelete(row.id)}
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
