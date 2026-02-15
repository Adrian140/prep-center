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
  allowedIssuerCountries = ['FR', 'DE'],
  invoiceCounters = { FR: 189, DE: 1 },
  issuerProfiles = DEFAULT_ISSUER_PROFILES,
  invoiceTemplates = {},
  onSaveIssuerProfile,
  onSaveInvoiceTemplate,
  onSaveBillingProfile,
  onSave,
  onClear,
  isSaving = false,
  error: externalError
}) {
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [issuerCountry, setIssuerCountry] = useState(currentMarket || 'FR');
  const [issuerDraft, setIssuerDraft] = useState(issuerProfiles?.[currentMarket || 'FR'] || DEFAULT_ISSUER_PROFILES.FR);
  const [clientDraft, setClientDraft] = useState(null);
  const [editingClient, setEditingClient] = useState(false);
  const [editingIssuer, setEditingIssuer] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setIssuerDraft(issuerProfiles?.[issuerCountry] || DEFAULT_ISSUER_PROFILES[issuerCountry] || DEFAULT_ISSUER_PROFILES.FR);
  }, [issuerCountry, issuerProfiles]);
  const issuerOptions = useMemo(() => {
    const list = (allowedIssuerCountries || [])
      .map((code) => String(code || '').toUpperCase())
      .filter((code) => code === 'FR' || code === 'DE');
    if (!list.length) return [String(currentMarket || 'FR').toUpperCase()];
    return Array.from(new Set(list));
  }, [allowedIssuerCountries, currentMarket]);
  useEffect(() => {
    if (!issuerOptions.includes(issuerCountry)) {
      setIssuerCountry(issuerOptions[0]);
    }
  }, [issuerOptions, issuerCountry]);
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

  const defaultBillingProfile = useMemo(() => {
    if (!billingProfiles.length) return null;
    const byDefaultFlag = billingProfiles.find((profile) => profile.is_default);
    const byMarket = billingProfiles.find(
      (profile) => String(profile.country || '').toUpperCase() === String(currentMarket || '').toUpperCase()
    );
    return byDefaultFlag || byMarket || billingProfiles[0];
  }, [billingProfiles, currentMarket]);

  const activeBillingProfile = defaultBillingProfile;
  useEffect(() => {
    if (!activeBillingProfile) {
      setClientDraft(null);
      return;
    }
    setClientDraft({
      type: activeBillingProfile.type || 'company',
      company_name: activeBillingProfile.company_name || '',
      first_name: activeBillingProfile.first_name || '',
      last_name: activeBillingProfile.last_name || '',
      address: activeBillingProfile.address || '',
      postal_code: activeBillingProfile.postal_code || '',
      city: activeBillingProfile.city || '',
      country: activeBillingProfile.country || '',
      vat_number: activeBillingProfile.vat_number || '',
      phone: activeBillingProfile.phone || clientPhone || ''
    });
  }, [activeBillingProfile, clientPhone]);

  const issuerProfile = issuerDraft || issuerProfiles?.[issuerCountry] || DEFAULT_ISSUER_PROFILES[issuerCountry] || DEFAULT_ISSUER_PROFILES.FR;
  const activeTemplate = invoiceTemplates?.[issuerCountry] || null;
  const customerCountry = String(activeBillingProfile?.country || '').toUpperCase();
  const taxRule = getSimpleVatRule({ issuerCountry, customerCountry });
  const vatAmount = roundMoney(aggregated.total * taxRule.vatRate);
  const grossTotal = roundMoney(aggregated.total + vatAmount);
  const previewCounter = Number(invoiceCounters?.[issuerCountry]) || (issuerCountry === 'FR' ? 189 : 1);
  const previewInvoiceNumber = issuerCountry === 'DE'
    ? `EcomPrepHub Germany ${String(previewCounter).padStart(3, '0')}`
    : `EcomPrepHub France ${previewCounter}`;

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
    setEditingIssuer(false);
  };
  const handleSaveClient = async () => {
    if (!onSaveBillingProfile || !activeBillingProfile?.id || !clientDraft) return;
    const result = await onSaveBillingProfile(activeBillingProfile.id, {
      type: clientDraft.type || activeBillingProfile.type,
      company_name: clientDraft.company_name || null,
      first_name: clientDraft.first_name || null,
      last_name: clientDraft.last_name || null,
      address: clientDraft.address || null,
      postal_code: clientDraft.postal_code || null,
      city: clientDraft.city || null,
      country: clientDraft.country || null,
      vat_number: clientDraft.vat_number || null,
      phone: clientDraft.phone || null
    });
    if (result?.error) {
      setFeedback(result.error.message || 'Nu am putut salva datele clientului.');
      return;
    }
    setFeedback('Datele clientului au fost salvate.');
    setEditingClient(false);
  };

  const handleSave = async () => {
    if (!aggregated.count) {
      setFeedback('Selectează cel puțin o linie.');
      return;
    }
    if (!activeBillingProfile?.id) {
      setFeedback('Clientul nu are un profil de facturare salvat.');
      return;
    }

    const payload = {
      invoiceNumber: previewInvoiceNumber,
      invoiceCounterValue: previewCounter,
      invoiceDate: invoiceDate || todayIso(),
      dueDate: dueDate || null,
      status,
      issuerCountry,
      issuerProfile,
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
      },
      templateImage: activeTemplate || null
    };
    setFeedback('');
    const result = onSave ? await onSave(payload) : { error: null };
    if (result?.error) {
      setFeedback(result.error.message || 'Nu am putut salva factura.');
      return;
    }
    setFeedback('Factura a fost salvată și urcată în contul clientului.');
    setInvoiceDate(todayIso());
    setDueDate('');
    setStatus('pending');
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Nu am putut citi fișierul.'));
      reader.readAsDataURL(file);
    });

  const normalizeTemplateToA4 = (dataUrl) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const width = 1240;
        const height = 1754;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Nu am putut pregăti template-ul.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => reject(new Error('Imagine template invalidă.'));
      img.src = dataUrl;
    });

  const handleTemplateUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setFeedback('Template-ul trebuie să fie imagine (PNG/JPG).');
      return;
    }
    if (!onSaveInvoiceTemplate) return;
    try {
      setTemplateSaving(true);
      const dataUrl = await fileToDataUrl(file);
      const normalized = await normalizeTemplateToA4(dataUrl);
      const result = await onSaveInvoiceTemplate(issuerCountry, normalized);
      if (result?.error) {
        setFeedback(result.error.message || 'Nu am putut salva template-ul.');
      } else {
        setFeedback(`Template salvat pentru ${issuerCountry}.`);
      }
    } catch (err) {
      setFeedback(err?.message || 'Nu am putut încărca template-ul.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleTemplateRemove = async () => {
    if (!onSaveInvoiceTemplate) return;
    setTemplateSaving(true);
    const result = await onSaveInvoiceTemplate(issuerCountry, null);
    if (result?.error) {
      setFeedback(result.error.message || 'Nu am putut șterge template-ul.');
    } else {
      setFeedback(`Template șters pentru ${issuerCountry}.`);
    }
    setTemplateSaving(false);
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
        <label className="block text-[13px] font-medium text-text-secondary">Număr factură (auto)</label>
        <input
          type="text"
          className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-text-secondary"
          value={previewInvoiceNumber}
          disabled
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary">Data facturii</label>
            <input type="date" className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-text-secondary">Scadență</label>
            <input type="date" className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            <p className="mt-1 text-[11px] text-text-secondary">Lasă gol dacă nu dorești scadență.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary">Companie emitentă</label>
            <select
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50 disabled:text-text-secondary"
              value={issuerCountry}
              onChange={(event) => setIssuerCountry(event.target.value)}
              disabled={issuerOptions.length <= 1}
            >
              {issuerOptions.includes('FR') ? <option value="FR">France</option> : null}
              {issuerOptions.includes('DE') ? <option value="DE">Germany</option> : null}
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

        <div className="relative rounded border border-gray-200 bg-gray-50 p-3 pb-10">
          <p className="text-[13px] font-medium text-text-secondary">Adresă facturare client (din profil salvat)</p>
          {activeBillingProfile ? (
            editingClient ? (
              <div className="mt-2 space-y-2">
                <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Company name" value={clientDraft?.company_name || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), company_name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="First name" value={clientDraft?.first_name || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), first_name: e.target.value }))} />
                  <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Last name" value={clientDraft?.last_name || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), last_name: e.target.value }))} />
                </div>
                <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Address" value={clientDraft?.address || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), address: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Postal code" value={clientDraft?.postal_code || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), postal_code: e.target.value }))} />
                  <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="City" value={clientDraft?.city || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), city: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Country" value={clientDraft?.country || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), country: e.target.value.toUpperCase() }))} />
                  <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="VAT number" value={clientDraft?.vat_number || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), vat_number: e.target.value }))} />
                </div>
                <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Phone" value={clientDraft?.phone || ''} onChange={(e) => setClientDraft((prev) => ({ ...(prev || {}), phone: e.target.value }))} />
                <div className="text-xs text-text-secondary">{clientEmail ? `Email (din sistem): ${clientEmail}` : 'Email (din sistem): -'}</div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setEditingClient(false)} className="rounded border border-gray-300 px-2 py-1 text-xs">Cancel</button>
                  <button type="button" onClick={handleSaveClient} className="rounded border border-primary px-2 py-1 text-xs text-primary">Save</button>
                </div>
              </div>
            ) : (
              <div className="mt-1 text-xs text-text-secondary space-y-0.5">
                <p className="font-semibold text-text-primary">
                  {activeBillingProfile.company_name || [activeBillingProfile.first_name, activeBillingProfile.last_name].filter(Boolean).join(' ') || '-'}
                </p>
                <p>{activeBillingProfile.address || '-'}</p>
                <p>{`${activeBillingProfile.postal_code || ''} ${activeBillingProfile.city || ''}`.trim() || '-'}</p>
                <p>{String(activeBillingProfile.country || '').toUpperCase() || '-'}</p>
                <p>VAT: {activeBillingProfile.vat_number || '-'}</p>
                {clientEmail ? <p>Email: {clientEmail}</p> : null}
                {(activeBillingProfile.phone || clientPhone) ? (
                  <p>Telefon: {activeBillingProfile.phone || clientPhone}</p>
                ) : null}
              </div>
            )
          ) : (
            <p className="mt-1 text-xs text-red-600">Clientul nu are adresă de facturare salvată.</p>
          )}
          {activeBillingProfile && !editingClient && (
            <button
              type="button"
              onClick={() => setEditingClient(true)}
              className="absolute bottom-2 right-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="relative rounded-lg border border-gray-200 p-3 pb-10 space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase">Date emitent ({issuerCountry})</p>
        {false && (
          <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-text-secondary">
            <p className="font-medium text-text-primary">Invoice template ({issuerCountry})</p>
            <p>{activeTemplate ? 'Template activ' : 'Niciun template încărcat (fallback default).'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50">
                {templateSaving ? 'Uploading...' : 'Upload template'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleTemplateUpload}
                  disabled={templateSaving}
                />
              </label>
              {activeTemplate ? (
                <>
                  <a href={activeTemplate} target="_blank" rel="noreferrer" className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50">
                    Preview
                  </a>
                  <button
                    type="button"
                    onClick={handleTemplateRemove}
                    className="rounded border border-red-200 bg-white px-2 py-1 text-red-600 hover:bg-red-50"
                    disabled={templateSaving}
                  >
                    Remove
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
        {editingIssuer ? (
          <>
            <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Company name" value={issuerProfile?.company_name || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), company_name: e.target.value, country: issuerCountry }))} />
            <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="VAT number" value={issuerProfile?.vat_number || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), vat_number: e.target.value, country: issuerCountry }))} />
            <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Address" value={issuerProfile?.address_line1 || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), address_line1: e.target.value, country: issuerCountry }))} />
            <div className="grid grid-cols-2 gap-2">
              <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Postal code" value={issuerProfile?.postal_code || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), postal_code: e.target.value, country: issuerCountry }))} />
              <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="City" value={issuerProfile?.city || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), city: e.target.value, country: issuerCountry }))} />
            </div>
            <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Website" value={issuerProfile?.website || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), website: e.target.value, country: issuerCountry }))} />
            <div className="grid grid-cols-2 gap-2">
              <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Email" value={issuerProfile?.email || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), email: e.target.value, country: issuerCountry }))} />
              <input className="w-full rounded border border-gray-200 px-3 py-2 text-sm" placeholder="Phone" value={issuerProfile?.phone || ''} onChange={(e) => setIssuerDraft((prev) => ({ ...(prev || {}), phone: e.target.value, country: issuerCountry }))} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setEditingIssuer(false)} className="rounded border border-gray-300 px-2 py-1 text-xs">Cancel</button>
              <button type="button" onClick={handleSaveIssuer} className="rounded border border-primary px-2 py-1 text-xs text-primary">Save</button>
            </div>
          </>
        ) : (
          <div className="mt-1 text-xs text-text-secondary space-y-0.5">
            <p className="font-semibold text-text-primary">{issuerProfile?.company_name || '-'}</p>
            <p>{issuerProfile?.address_line1 || '-'}</p>
            <p>{`${issuerProfile?.postal_code || ''} ${issuerProfile?.city || ''}`.trim() || '-'}</p>
            <p>{String(issuerProfile?.country || issuerCountry).toUpperCase()}</p>
            <p>VAT: {issuerProfile?.vat_number || '-'}</p>
            {issuerProfile?.website ? <p>Website: {issuerProfile.website}</p> : null}
            {issuerProfile?.email ? <p>Email: {issuerProfile.email}</p> : null}
            {issuerProfile?.phone ? <p>Telefon: {issuerProfile.phone}</p> : null}
          </div>
        )}
        {!editingIssuer && (
          <button
            type="button"
            onClick={() => setEditingIssuer(true)}
            className="absolute bottom-2 right-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
          >
            Edit
          </button>
        )}
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
