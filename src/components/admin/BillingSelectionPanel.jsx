import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ISSUER_PROFILES, getSimpleVatRule, roundMoney } from '@/utils/invoiceTax';

const todayIso = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value) => roundMoney(value).toFixed(2);
const formatUnits = (value) => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const plusDays = (isoDate, days = 14) => {
  const source = isoDate ? new Date(isoDate) : new Date();
  if (Number.isNaN(source.getTime())) return todayIso();
  source.setDate(source.getDate() + days);
  return source.toISOString().slice(0, 10);
};

export default function BillingSelectionPanel({
  selections = {},
  billingProfiles = [],
  clientEmail = '',
  clientPhone = '',
  currentMarket = 'FR',
  issuerProfiles = DEFAULT_ISSUER_PROFILES,
  onSaveIssuerProfile,
  onSave,
  onClear,
  isSaving = false,
  error: externalError
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(plusDays(todayIso(), 14));
  const [status, setStatus] = useState('pending');
  const [issuerCountry, setIssuerCountry] = useState(currentMarket || 'FR');
  const [issuerDraft, setIssuerDraft] = useState(issuerProfiles?.[currentMarket || 'FR'] || DEFAULT_ISSUER_PROFILES.FR);
  const [billingProfileId, setBillingProfileId] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setIssuerDraft(issuerProfiles?.[issuerCountry] || DEFAULT_ISSUER_PROFILES[issuerCountry] || DEFAULT_ISSUER_PROFILES.FR);
  }, [issuerCountry, issuerProfiles]);

  const aggregated = useMemo(() => {
    const groups = {};
    const lineRefs = [];
    let total = 0;
    Object.values(selections).forEach(({ section, row }) => {
      if (!row?.id) return;
      const units = Number(row.units ?? row.orders_units ?? 0);
      const unitPrice = Number(row.unit_price ?? 0);
      const candidateTotal = row.total != null ? Number(row.total) : Number.isFinite(unitPrice * units) ? unitPrice * units : 0;
      const lineTotal = Number.isFinite(candidateTotal) ? candidateTotal : 0;
      total += lineTotal;
      const key = `${section}:${String(row.service || '—')}:${unitPrice}`;
      if (!groups[key]) {
        groups[key] = {
          section,
          service: row.service || 'Serviciu necunoscut',
          unitPrice,
          units: 0,
          total: 0
        };
      }
      groups[key].units += units;
      groups[key].total += lineTotal;
      lineRefs.push({ section, id: row.id });
    });
    const items = Object.values(groups).sort((a, b) => a.service.localeCompare(b.service));
    return {
      items,
      total: roundMoney(total),
      count: lineRefs.length,
      lineRefs
    };
  }, [selections]);

  const selectedBillingProfile = useMemo(
    () => billingProfiles.find((profile) => profile.id === billingProfileId) || null,
    [billingProfiles, billingProfileId]
  );

  const defaultBillingProfile = useMemo(() => {
    if (!billingProfiles.length) return null;
    const byMarket = billingProfiles.find(
      (profile) => String(profile.country || '').toUpperCase() === String(currentMarket || '').toUpperCase()
    );
    return byMarket || billingProfiles.find((profile) => profile.is_default) || billingProfiles[0];
  }, [billingProfiles, currentMarket]);

  const activeBillingProfile = selectedBillingProfile || defaultBillingProfile;

  const issuerProfile = issuerDraft || issuerProfiles?.[issuerCountry] || DEFAULT_ISSUER_PROFILES[issuerCountry] || DEFAULT_ISSUER_PROFILES.FR;
  const customerCountry = String(activeBillingProfile?.country || '').toUpperCase();
  const taxRule = getSimpleVatRule({ issuerCountry, customerCountry });
  const vatAmount = roundMoney(aggregated.total * taxRule.vatRate);
  const grossTotal = roundMoney(aggregated.total + vatAmount);

  const handleClear = () => {
    onClear?.();
    setFeedback('');
  };

  const handleSaveIssuer = async () => {
    if (!onSaveIssuerProfile) return;
    const result = await onSaveIssuerProfile(issuerCountry, issuerProfile);
    if (result?.error) {
      setFeedback(result.error.message || 'Nu am putut salva emitentul.');
      return;
    }
    setFeedback('Datele emitentului au fost salvate.');
  };

  const handleSave = async () => {
    if (!aggregated.count) {
      setFeedback('Selectează cel puțin o linie.');
      return;
    }
    if (!invoiceNumber.trim()) {
      setFeedback('Completează numărul facturii.');
      return;
    }
    if (!activeBillingProfile?.id) {
      setFeedback('Clientul nu are un profil de facturare salvat.');
      return;
    }

    const payload = {
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: invoiceDate || todayIso(),
      dueDate: dueDate || plusDays(invoiceDate || todayIso(), 14),
      status,
      issuerCountry,
      issuerProfile,
      billingProfileId: activeBillingProfile.id,
      billingProfile: activeBillingProfile,
      customerEmail: clientEmail,
      customerPhone: clientPhone,
      lines: aggregated.lineRefs,
      items: aggregated.items,
      totals: {
        net: aggregated.total,
        vat: vatAmount,
        gross: grossTotal,
        vatRate: taxRule.vatRate,
        vatLabel: taxRule.vatLabel,
        legalNote: taxRule.legalNote
      }
    };
    setFeedback('');
    const result = onSave ? await onSave(payload) : { error: null };
    if (result?.error) {
      setFeedback(result.error.message || 'Nu am putut salva factura.');
      return;
    }
    setFeedback('Factura a fost salvată și urcată în contul clientului.');
    setInvoiceNumber('');
    setInvoiceDate(todayIso());
    setDueDate(plusDays(todayIso(), 14));
    setStatus('pending');
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-text-secondary">Panou facturare</p>
        <p className="flex items-baseline justify-between text-lg font-semibold text-text-primary">
          <span>Coș: {aggregated.count} {aggregated.count === 1 ? 'linie' : 'linii'}</span>
          <span className="text-sm text-text-secondary">Net: {formatMoney(aggregated.total)} €</span>
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-gray-200 p-3 text-sm">
        {aggregated.items.length === 0 ? (
          <p className="text-xs text-text-secondary">Selectează linii din FBA/FBM/Other pentru a începe.</p>
        ) : (
          <ul className="space-y-2">
            {aggregated.items.map((item) => (
              <li key={`${item.section}-${item.service}-${item.unitPrice}`} className="flex justify-between">
                <div>
                  <p className="font-medium text-text-primary">{item.service}</p>
                  <p className="text-xs text-text-secondary">
                    {item.section.toUpperCase()} · {formatUnits(item.units)} unități
                    {Number.isFinite(item.unitPrice) && <> · @{formatMoney(item.unitPrice)} €</>}
                  </p>
                </div>
                <div className="text-sm font-semibold text-text-primary">{formatMoney(item.total)} €</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm">
        <label className="block text-[13px] font-medium text-text-secondary">Număr factură</label>
        <input
          type="text"
          className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
          placeholder="Ex: FR-2026-001"
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary">Data facturii</label>
            <input type="date" className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-text-secondary">Scadență</label>
            <input type="date" className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary">Companie emitentă</label>
            <select className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={issuerCountry} onChange={(event) => setIssuerCountry(event.target.value)}>
              <option value="FR">France</option>
              <option value="DE">Germany</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-text-secondary">Status</label>
            <select className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-text-secondary">Adresă facturare client</label>
          <select className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={billingProfileId || defaultBillingProfile?.id || ''} onChange={(event) => setBillingProfileId(event.target.value)}>
            {!billingProfiles.length && <option value="">Nu există profil de facturare</option>}
            {billingProfiles.map((item) => {
              const label = item.type === 'company' ? item.company_name || 'Company' : `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Individual';
              return (
                <option key={item.id} value={item.id}>
                  {label} · {String(item.country || '').toUpperCase()}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase">Date emitent ({issuerCountry})</p>
        <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Company name" value={issuerProfile?.company_name || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), company_name: e.target.value, country: issuerCountry }))} />
        <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="VAT number" value={issuerProfile?.vat_number || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), vat_number: e.target.value, country: issuerCountry }))} />
        <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Address" value={issuerProfile?.address_line1 || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), address_line1: e.target.value, country: issuerCountry }))} />
        <div className="grid grid-cols-2 gap-2">
          <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Postal code" value={issuerProfile?.postal_code || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), postal_code: e.target.value, country: issuerCountry }))} />
          <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="City" value={issuerProfile?.city || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), city: e.target.value, country: issuerCountry }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Email" value={issuerProfile?.email || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), email: e.target.value, country: issuerCountry }))} />
          <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Phone" value={issuerProfile?.phone || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), phone: e.target.value, country: issuerCountry }))} />
        </div>
        <button type="button" onClick={handleSaveIssuer} className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-gray-50">Save issuer profile</button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-text-secondary space-y-1">
        <p><strong>Emitent:</strong> {issuerProfile?.company_name} ({issuerCountry})</p>
        <p><strong>Client:</strong> {activeBillingProfile?.company_name || [activeBillingProfile?.first_name, activeBillingProfile?.last_name].filter(Boolean).join(' ') || '-'}</p>
        <p><strong>Email:</strong> {clientEmail || '-'}</p>
        <p><strong>Telefon:</strong> {clientPhone || '-'}</p>
        <p><strong>Regulă TVA:</strong> {taxRule.vatLabel}</p>
        <p><strong>Total net:</strong> {formatMoney(aggregated.total)} €</p>
        <p><strong>TVA:</strong> {formatMoney(vatAmount)} €</p>
        <p className="font-semibold text-text-primary"><strong>Total final:</strong> {formatMoney(grossTotal)} €</p>
      </div>

      {(feedback || externalError) && <p className="text-sm text-red-600">{feedback || externalError}</p>}

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={handleSave} disabled={isSaving || aggregated.count === 0} className="flex-1 rounded bg-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {isSaving ? 'Salvez...' : 'Create invoice'}
        </button>
        <button type="button" onClick={handleClear} className="rounded border border-gray-200 px-3 py-2 text-sm font-semibold text-text-primary">
          Golește selecția
        </button>
      </div>
    </div>
  );
}
