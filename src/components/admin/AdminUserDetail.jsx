import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, User } from 'lucide-react';
import { saveAs } from 'file-saver';
import { supabase, supabaseHelpers } from '../../config/supabase';
import Section from '../common/Section';
import AdminClientInvoices from './AdminClientInvoices';
import AdminClientBillingProfiles from './AdminClientBillingProfiles';
import AdminDeals from './AdminDeals';

import AdminFBA from './AdminFBA';
import AdminFBM from './AdminFBM';
import AdminStockClientView from './AdminStockClientView';
import AdminReturns from './AdminReturns';
import AdminOther from './AdminOther';
import ClientPrepShipments from '../dashboard/client/ClientPrepShipments';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import BillingSelectionPanel from './BillingSelectionPanel';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { buildInvoicePdfBlob } from '@/utils/invoicePdf';
import { DEFAULT_ISSUER_PROFILES, roundMoney } from '@/utils/invoiceTax';

const shouldUpgradeLegacyDeIssuer = (profile) =>
  (() => {
    if (!profile) return false;
    const company = String(profile.company_name || '').trim().toLowerCase();
    const address = String(profile.address_line1 || '').trim().toLowerCase();
    const email = String(profile.email || '').trim().toLowerCase();
    const vat = String(profile.vat_number || '').trim().toUpperCase();
    return (
      company.includes('prep center germany') ||
      address.includes('musterstrasse') ||
      email === 'billing-de@prep-center.eu' ||
      vat === 'DE000000000'
    );
  })();

const normalizeIssuerProfiles = (savedProfiles) => {
  const base = {
    FR: { ...DEFAULT_ISSUER_PROFILES.FR, ...(savedProfiles?.FR || {}) },
    DE: { ...DEFAULT_ISSUER_PROFILES.DE, ...(savedProfiles?.DE || {}) },
    RO: { ...DEFAULT_ISSUER_PROFILES.RO, ...(savedProfiles?.RO || {}) }
  };
  if (shouldUpgradeLegacyDeIssuer(savedProfiles?.DE)) {
    base.DE = { ...DEFAULT_ISSUER_PROFILES.DE };
  }
  return base;
};

const sanitizeFilePart = (value) =>
  String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatInvoiceDateForFilename = (value) => {
  if (!value) return 'unknown-date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sanitizeFilePart(value).replace(/\//g, '-');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const buildLocalInvoiceFilename = ({ invoiceDate, billedCompanyName }) => {
  const datePart = formatInvoiceDateForFilename(invoiceDate);
  const companyPart = sanitizeFilePart(billedCompanyName || 'Client');
  return `${datePart} EcomPrepHub -> ${companyPart}.pdf`;
};

const buildDocumentNumber = ({ issuerCode, counterValue, documentType }) => {
  const isProforma = String(documentType || '').toLowerCase() === 'proforma';
  if (isProforma) {
    return issuerCode === 'DE'
      ? `EcomPrepHub Germany PF${String(counterValue).padStart(3, '0')}`
      : issuerCode === 'RO'
        ? `EcomPrepHub Romania PF${String(counterValue).padStart(3, '0')}`
      : `EcomPrepHub France PF${String(counterValue).padStart(3, '0')}`;
  }
  return issuerCode === 'DE'
    ? `EcomPrepHub Germany ${String(counterValue).padStart(3, '0')}`
    : issuerCode === 'RO'
      ? `EcomPrepHub Romania ${String(counterValue).padStart(3, '0')}`
    : `EcomPrepHub France ${counterValue}`;
};

const normalizeItemKeyPart = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const aggregateInvoiceItems = (items = []) => {
  const map = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== 'object') continue;
    const service = String(raw.service || '').trim();
    const unitPrice = roundMoney(raw.unitPrice || 0);
    const vatRate = Number(raw.vatRate ?? 0);
    const units = Number(raw.units || 0);
    const total = roundMoney(raw.total ?? unitPrice * units);
    if (!service) continue;
    const key = `${normalizeItemKeyPart(service)}|${unitPrice}|${vatRate}`;
    if (!map.has(key)) {
      map.set(key, {
        service,
        units: 0,
        unitPrice,
        total: 0,
        vatRate
      });
    }
    const entry = map.get(key);
    entry.units = roundMoney(Number(entry.units || 0) + units);
    entry.total = roundMoney(Number(entry.total || 0) + total);
  }
  return Array.from(map.values());
};

export default function AdminUserDetail({ profile, onBack }) {
  const { profile: currentAdmin } = useSupabaseAuth();
  const { currentMarket, availableMarkets } = useMarket();
  const isLimitedAdmin = Boolean(currentAdmin?.is_limited_admin);
  const canManageInvoices = !isLimitedAdmin;
  const [companyId, setCompanyId] = useState(profile?.company_id || null);
  const [company, setCompany] = useState(null);

  const [fbaRows, setFbaRows] = useState([]);
  const [fbmRows, setFbmRows] = useState([]);
  const [otherRows, setOtherRows] = useState([]);
  const [returnRows, setReturnRows] = useState([]);
  const [billingSelections, setBillingSelections] = useState({});
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingProfiles, setBillingProfiles] = useState([]);
  const [issuerProfiles, setIssuerProfiles] = useState(DEFAULT_ISSUER_PROFILES);
  const [invoiceTemplates, setInvoiceTemplates] = useState({});
  const [invoiceCounters, setInvoiceCounters] = useState({ FR: 189, DE: 1, RO: 1 });
  const [proformaCounters, setProformaCounters] = useState({ FR: 1, DE: 1, RO: 1 });
  const hasBillingSelection = canManageInvoices && Object.keys(billingSelections).length > 0;
  const serviceSections = ['fba', 'fbm', 'other', 'stock', 'returns', 'requests'];
  const allowedSections = isLimitedAdmin ? ['stock'] : serviceSections;
  const allowedIssuerCountries = (
    Array.isArray(availableMarkets)
      ? availableMarkets
          .map((code) => String(code || '').toUpperCase())
          .filter((code) => code === 'FR' || code === 'DE' || code === 'RO')
      : []
  );
  if (!allowedIssuerCountries.includes('RO')) {
    allowedIssuerCountries.push('RO');
  }
  if (!allowedIssuerCountries.length) {
    const fallbackMarket = String(currentMarket || 'FR').toUpperCase();
    if (fallbackMarket === 'DE') {
      allowedIssuerCountries.push('DE');
    } else if (fallbackMarket === 'RO') {
      allowedIssuerCountries.push('RO');
    } else {
      allowedIssuerCountries.push('FR');
    }
  }

  // panouri “secundare” (billing / invoices)
  const [activePanel, setActivePanel] = useState(null);

  // nou: tab-urile principale din dreapta clientului (persistate per client)
  const sectionStorageKey = profile?.id
    ? `admin-user-section-${profile.id}`
    : 'admin-user-section';
  const defaultSection = allowedSections[0] || 'stock';
  const [activeSectionRaw, setActiveSection] = useSessionStorage(sectionStorageKey, defaultSection);
  const activeSection = allowedSections.includes(activeSectionRaw) ? activeSectionRaw : defaultSection;

  useEffect(() => {
    if (!allowedSections.includes(activeSectionRaw) && defaultSection) {
      setActiveSection(defaultSection);
    }
  }, [allowedSections, activeSectionRaw, defaultSection, setActiveSection]);

  // Creează companie dacă lipsește și atașează profilul la ea
const ensureCompany = async () => {
  const cid = profile?.company_id || profile?.id || null;
  setCompanyId(cid);
  return cid;
};

  const loadAll = async () => {
    const cid = await ensureCompany();
    if (!cid) return;

    const invoiceSelect = canManageInvoices
      ? '*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)'
      : '*';

    const fetchPromises = [];
    if (!isLimitedAdmin) {
      fetchPromises.push(
        supabase
          .from('fba_lines')
          .select(invoiceSelect)
          .eq('company_id', cid)
          .eq('country', currentMarket)
          .order('service_date', { ascending: false })
      );
      fetchPromises.push(
        supabase
          .from('fbm_lines')
          .select(invoiceSelect)
          .eq('company_id', cid)
          .eq('country', currentMarket)
          .order('service_date', { ascending: false })
      );
      fetchPromises.push(
        supabase
          .from('other_lines')
          .select(invoiceSelect)
          .eq('company_id', cid)
          .eq('country', currentMarket)
          .order('service_date', { ascending: false })
      );
    }
    const loadReturns = async () => {
      let query = supabase
        .from('returns')
        .select('*')
        .eq('company_id', cid)
        .order('return_date', { ascending: false });
      if (currentMarket) {
        query = query.eq('warehouse_country', currentMarket);
      }
      let res = await query;
      if (
        currentMarket &&
        res?.error &&
        String(res.error.message || '').toLowerCase().includes('warehouse_country')
      ) {
        res = await supabase
          .from('returns')
          .select('*')
          .eq('company_id', cid)
          .order('return_date', { ascending: false });
      }
      return res;
    };
    fetchPromises.push(loadReturns());

    const results = await Promise.all(fetchPromises);
    const [fbaRes, fbmRes, otherRes, returnsRes] = isLimitedAdmin
      ? [null, null, null, results[0]]
      : results;
    let billingProfilesRes = await supabaseHelpers.getBillingProfiles(profile?.id);
    const [issuerSettingsRes, countersSettingsRes, proformaCountersRes, templateSettingsRes] = await Promise.all([
      supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'invoice_issuer_profiles')
      .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'invoice_number_counters')
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'proforma_number_counters')
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'invoice_pdf_templates')
        .maybeSingle()
    ]);
    if (!billingProfilesRes?.error && (!billingProfilesRes?.data || billingProfilesRes.data.length === 0)) {
      await supabaseHelpers.seedBillingProfilesFromSignup(profile?.id);
      billingProfilesRes = await supabaseHelpers.getBillingProfiles(profile?.id);
    }

setCompany({ id: cid, name: profile.company_name || profile.first_name || profile.email });
if (!isLimitedAdmin) {
  if (!fbaRes?.error) setFbaRows(fbaRes?.data || []);
  if (!fbmRes?.error) setFbmRows(fbmRes?.data || []);
  if (!otherRes?.error) setOtherRows(otherRes?.data || []);
} else {
  setFbaRows([]);
  setFbmRows([]);
  setOtherRows([]);
}
if (!returnsRes?.error) setReturnRows(returnsRes?.data || []);
if (!billingProfilesRes?.error) setBillingProfiles(billingProfilesRes?.data || []);
if (!issuerSettingsRes?.error && issuerSettingsRes?.data?.value) {
  const normalizedIssuerProfiles = normalizeIssuerProfiles(issuerSettingsRes.data.value);
  setIssuerProfiles(normalizedIssuerProfiles);
  if (JSON.stringify(normalizedIssuerProfiles) !== JSON.stringify(issuerSettingsRes.data.value || {})) {
    await supabase
      .from('app_settings')
      .upsert({
        key: 'invoice_issuer_profiles',
        value: normalizedIssuerProfiles,
        updated_at: new Date().toISOString()
      });
  }
} else {
  setIssuerProfiles(normalizeIssuerProfiles(null));
}
if (!countersSettingsRes?.error && countersSettingsRes?.data?.value) {
  setInvoiceCounters({
    FR: Number(countersSettingsRes.data.value.FR) || 189,
    DE: Number(countersSettingsRes.data.value.DE) || 1,
    RO: Number(countersSettingsRes.data.value.RO) || 1
  });
} else {
  setInvoiceCounters({ FR: 189, DE: 1, RO: 1 });
}
if (!proformaCountersRes?.error && proformaCountersRes?.data?.value) {
  setProformaCounters({
    FR: Number(proformaCountersRes.data.value.FR) || 1,
    DE: Number(proformaCountersRes.data.value.DE) || 1,
    RO: Number(proformaCountersRes.data.value.RO) || 1
  });
} else {
  setProformaCounters({ FR: 1, DE: 1, RO: 1 });
}
if (!templateSettingsRes?.error && templateSettingsRes?.data?.value) {
  setInvoiceTemplates(templateSettingsRes.data.value || {});
} else {
  setInvoiceTemplates({});
}

  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, currentMarket]);

  const toggleBillingSelection = useCallback((section, row) => {
    if (!canManageInvoices) return;
    setBillingSelections((prev) => {
      const key = `${section}:${row.id}`;
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        return next;
      }
      next[key] = { section, row };
      return next;
    });
  }, [canManageInvoices]);

  const selectAllUninvoicedForSection = useCallback((section) => {
    if (!canManageInvoices) return;
    const source =
      section === 'fba'
        ? fbaRows
        : section === 'fbm'
          ? fbmRows
          : section === 'other'
            ? otherRows
            : [];
    if (!Array.isArray(source) || !source.length) return;
    setBillingSelections((prev) => {
      const next = { ...prev };
      source.forEach((row) => {
        if (!row?.id || row?.billing_invoice_id) return;
        const key = `${section}:${row.id}`;
        if (!next[key]) {
          next[key] = { section, row };
        }
      });
      return next;
    });
  }, [canManageInvoices, fbaRows, fbmRows, otherRows]);

  const handleBillingSave = useCallback(
    async ({
      documentType,
      invoiceDate,
      dueDate,
      status,
      issuerCountry,
      issuerProfile,
      billingProfile,
      customerEmail,
      customerPhone,
      invoiceCounterValue,
      templateImage,
      lines,
      items,
      totals
    }) => {
    if (!company?.id) {
      const error = new Error('Nicio companie selectată.');
      setBillingError(error.message);
      return { error };
    }
      setBillingSaving(true);
      setBillingError('');
      const issuerCode = String(issuerCountry || currentMarket || 'FR').toUpperCase();
      const normalizedDocType = String(documentType || 'invoice').toLowerCase() === 'proforma' ? 'proforma' : 'invoice';
      if (!allowedIssuerCountries.includes(issuerCode)) {
        const error = new Error(`Emitent nepermis pentru acest admin: ${issuerCode}`);
        setBillingError(error.message);
        setBillingSaving(false);
        return { error };
      }
      const counterSource = normalizedDocType === 'proforma'
        ? proformaCounters
        : invoiceCounters;
      const counterFallback = normalizedDocType === 'proforma'
        ? 1
        : (issuerCode === 'FR' ? 189 : 1);
      const counterValue = Number(invoiceCounterValue) || Number(counterSource?.[issuerCode]) || counterFallback;
      const generatedInvoiceNumber = buildDocumentNumber({
        issuerCode,
        counterValue,
        documentType: normalizedDocType
      });
      const { data: billingInvoice, error } = await supabaseHelpers.createBillingInvoice({
        company_id: company.id,
        user_id: profile?.id,
        invoice_number: generatedInvoiceNumber,
        invoice_date: invoiceDate,
        total_amount: totals?.gross ?? 0,
        lines,
        items: aggregateInvoiceItems(items || [])
      });
      if (error) {
        setBillingError(error.message || 'Nu am putut salva factura.');
        setBillingSaving(false);
        return { error };
      }

      const aggregatedItems = aggregateInvoiceItems(items || []);

      const pdfBlob = await buildInvoicePdfBlob({
        documentType: normalizedDocType,
        invoiceNumber: generatedInvoiceNumber,
        invoiceDate,
        dueDate,
        issuer: issuerProfile,
        customer: billingProfile,
        customerEmail,
        customerPhone,
        items: aggregatedItems,
        totals: {
          net: roundMoney(totals?.net ?? 0),
          vat: roundMoney(totals?.vat ?? 0),
          gross: roundMoney(totals?.gross ?? 0),
          vatLabel: totals?.vatLabel || 'TVA'
        },
        legalNote: totals?.legalNote || '',
        templateImage: templateImage || invoiceTemplates?.[issuerCode] || null
      });

      const pdfFile = new File(
        [pdfBlob],
        `invoice-${String(generatedInvoiceNumber).replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`,
        { type: 'application/pdf' }
      );
      const billedCompanyName =
        billingProfile?.company_name ||
        [billingProfile?.first_name, billingProfile?.last_name].filter(Boolean).join(' ') ||
        'Client';
      const localDownloadName = buildLocalInvoiceFilename({
        invoiceDate,
        billedCompanyName
      });

      const description = [
        `Issuer: ${issuerProfile?.company_name || issuerCountry}`,
        `Billing profile: ${billingProfile?.company_name || [billingProfile?.first_name, billingProfile?.last_name].filter(Boolean).join(' ') || '-'}`,
        totals?.legalNote ? `Note: ${totals.legalNote}` : null
      ].filter(Boolean).join(' | ');

      const uploadRes = await supabaseHelpers.uploadInvoice(pdfFile, profile?.id, {
        invoice_number: generatedInvoiceNumber,
        document_type: normalizedDocType,
        converted_to_invoice_id: null,
        converted_from_proforma_id: null,
        billing_invoice_id: billingInvoice?.id || null,
        document_payload: {
          issuerProfile,
          billingProfile,
          customerEmail,
          customerPhone,
          items: aggregatedItems,
          totals: {
            net: roundMoney(totals?.net ?? 0),
            vat: roundMoney(totals?.vat ?? 0),
            gross: roundMoney(totals?.gross ?? 0),
            vatLabel: totals?.vatLabel || 'TVA',
            vatRate: Number(totals?.vatRate ?? 0),
            legalNote: totals?.legalNote || ''
          },
          dueDate: dueDate || null
        },
        amount: roundMoney(totals?.net ?? 0),
        vat_amount: roundMoney(totals?.vat ?? 0),
        description,
        issue_date: invoiceDate,
        due_date: dueDate || null,
        status: status || 'pending',
        company_id: company.id,
        user_id: profile?.id,
        country: issuerCountry || currentMarket || 'FR'
      });
      if (uploadRes?.error) {
        setBillingError(uploadRes.error.message || 'Factura PDF nu a putut fi urcată.');
        setBillingSaving(false);
        return { error: uploadRes.error };
      }

      saveAs(pdfBlob, localDownloadName);

      if (billingInvoice?.id && uploadRes?.data?.id) {
        await supabase
          .from('invoices')
          .update({ description: `${description} | Billing invoice ID: ${billingInvoice.id}` })
          .eq('id', uploadRes.data.id);
      }

      if (normalizedDocType === 'proforma') {
        const nextProformaCounters = {
          ...proformaCounters,
          [issuerCode]: counterValue + 1
        };
        const proformaCounterSave = await supabase
          .from('app_settings')
          .upsert({
            key: 'proforma_number_counters',
            value: nextProformaCounters,
            updated_at: new Date().toISOString()
          });
        if (!proformaCounterSave.error) {
          setProformaCounters(nextProformaCounters);
        }
      } else {
        const nextCounters = {
          ...invoiceCounters,
          [issuerCode]: counterValue + 1
        };
        const countersSave = await supabase
          .from('app_settings')
          .upsert({
            key: 'invoice_number_counters',
            value: nextCounters,
            updated_at: new Date().toISOString()
          });
        if (!countersSave.error) {
          setInvoiceCounters(nextCounters);
        }
      }

      setBillingSaving(false);
      setBillingSelections({});
      await loadAll();
      return { error: null };
    },
    [company?.id, profile?.id, currentMarket, invoiceCounters, proformaCounters, invoiceTemplates, allowedIssuerCountries, loadAll]
  );

  const handleBillingPreview = useCallback(
    async ({
      documentType,
      invoiceDate,
      dueDate,
      issuerCountry,
      issuerProfile,
      billingProfile,
      customerEmail,
      customerPhone,
      invoiceCounterValue,
      templateImage,
      items,
      totals
    }) => {
      const issuerCode = String(issuerCountry || currentMarket || 'FR').toUpperCase();
      if (!allowedIssuerCountries.includes(issuerCode)) {
        return { error: new Error(`Emitent nepermis pentru acest admin: ${issuerCode}`) };
      }
      const normalizedDocType = String(documentType || 'invoice').toLowerCase() === 'proforma' ? 'proforma' : 'invoice';
      const counterSource = normalizedDocType === 'proforma'
        ? proformaCounters
        : invoiceCounters;
      const counterFallback = normalizedDocType === 'proforma'
        ? 1
        : (issuerCode === 'FR' ? 189 : 1);
      const counterValue = Number(invoiceCounterValue) || Number(counterSource?.[issuerCode]) || counterFallback;
      const generatedInvoiceNumber = buildDocumentNumber({
        issuerCode,
        counterValue,
        documentType: normalizedDocType
      });
      const pdfBlob = await buildInvoicePdfBlob({
        documentType: normalizedDocType,
        invoiceNumber: generatedInvoiceNumber,
        invoiceDate,
        dueDate,
        issuer: issuerProfile,
        customer: billingProfile,
        customerEmail,
        customerPhone,
        items: aggregateInvoiceItems(items || []),
        totals: {
          net: roundMoney(totals?.net ?? 0),
          vat: roundMoney(totals?.vat ?? 0),
          gross: roundMoney(totals?.gross ?? 0),
          vatLabel: totals?.vatLabel || 'TVA',
          vatRate: Number(totals?.vatRate ?? 0)
        },
        legalNote: totals?.legalNote || '',
        templateImage: templateImage || invoiceTemplates?.[issuerCode] || null
      });
      const url = URL.createObjectURL(pdfBlob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { error: null };
    },
    [currentMarket, allowedIssuerCountries, invoiceCounters, proformaCounters, invoiceTemplates]
  );

  const handleSaveIssuerProfile = useCallback(async (countryCode, nextProfile) => {
    const code = String(countryCode || '').toUpperCase();
    if (!code) return { error: new Error('Țara emitentă lipsește.') };
    const merged = normalizeIssuerProfiles({
      ...issuerProfiles,
      [code]: {
        ...(issuerProfiles?.[code] || {}),
        ...nextProfile,
        country: code
      }
    });
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'invoice_issuer_profiles',
        value: merged,
        updated_at: new Date().toISOString()
      });
    if (error) {
      return { error };
    }
    setIssuerProfiles(merged);
    return { error: null };
  }, [issuerProfiles]);

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Utilizator';

  // helper pentru stilul butoanelor de tab
  const tabBtn = (on, off) =>
    `px-4 py-2 rounded-lg text-sm font-medium ${on ? 'bg-blue-50 text-primary border border-blue-200' : 'text-text-secondary hover:bg-gray-50'}`;

  useEffect(() => {
    if (!canManageInvoices && activePanel === 'invoices') {
      setActivePanel(null);
    }
  }, [canManageInvoices, activePanel]);

  useEffect(() => {
    if (!canManageInvoices) {
      setBillingSelections({});
      setBillingError('');
    }
  }, [canManageInvoices]);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center text-sm text-text-secondary hover:text-primary"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Înapoi la listă
      </button>

      {/* Header utilizator */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          {/* stânga: info client */}
          <div>
            <h2 className="text-xl font-semibold text-text-primary flex items-center">
              <User className="w-5 h-5 mr-2" />
              {displayName}
            </h2>
            <p className="text-sm text-text-secondary">
              {profile?.email} · Companie: <strong>{company?.name || '—'}</strong>
            </p>
          </div>

          {/* dreapta: 2 rânduri de acțiuni (sus: Billing/Invoices; jos: FBA/FBM/Stock/Retururi) */}
          <div className="flex flex-col items-end gap-2">
            {/* Billing / Invoices */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePanel((p) => (p === 'deals' ? null : 'deals'))}
                className={tabBtn(activePanel === 'deals')}
              >
                Deals negociate
              </button>
              <button
                onClick={() => setActivePanel((p) => (p === 'billing' ? null : 'billing'))}
                className={tabBtn(activePanel === 'billing')}
              >
                Billing details
              </button>
              {canManageInvoices && (
                <button
                  onClick={() => setActivePanel((p) => (p === 'invoices' ? null : 'invoices'))}
                  className={tabBtn(activePanel === 'invoices')}
                >
                  Invoices
                </button>
              )}
            </div>
    
            {/* Tabs principale */}
            <div className="flex items-center gap-2 flex-wrap">
              {allowedSections.includes('fba') && (
                <button
                  onClick={() => setActiveSection('fba')}
                  className={tabBtn(activeSection === 'fba')}
                  title="FBA"
                >
                  FBA
                </button>
              )}
              {allowedSections.includes('fbm') && (
                <button
                  onClick={() => setActiveSection('fbm')}
                  className={tabBtn(activeSection === 'fbm')}
                  title="FBM"
                >
                  FBM
                </button>
              )}
              {allowedSections.includes('other') && (
                <button
                  onClick={() => setActiveSection('other')}
                  className={tabBtn(activeSection === 'other')}
                  title="Other"
                >
                  Other
                </button>
              )}
              {allowedSections.includes('stock') && (
                <button
                  onClick={() => setActiveSection('stock')}
                  className={tabBtn(activeSection === 'stock')}
                  title="Stoc"
                >
                  Stock
                </button>
              )}
              {allowedSections.includes('returns') && (
                <button
                  onClick={() => setActiveSection('returns')}
                  className={tabBtn(activeSection === 'returns')}
                  title="Retururi"
                >
                  Retururi
                </button>
              )}
              {allowedSections.includes('requests') && (
                <button
                  onClick={() => setActiveSection('requests')}
                  className={tabBtn(activeSection === 'requests')}
                  title="Requests"
                >
                  Requests
                </button>
              )}
            </div>
          </div>
        </div>

        {/* panouri secundare (sub header) */}
        {activePanel === 'billing' && (
          <Section title="" right={null}>
            <AdminClientBillingProfiles profile={profile} hideTitles />
          </Section>
        )}
        {canManageInvoices && activePanel === 'invoices' && (
          <Section title="" right={null}>
            <AdminClientInvoices profile={profile} hideTitles />
          </Section>
        )}
      </div>
      {activePanel === 'deals' && (
        <Section title="" right={null}>
          <AdminDeals companyId={companyId} />
        </Section>
      )}
      {/* Conținut principal – afișăm DOAR tab-ul selectat */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
            {activeSection === 'fba' && (
              <AdminFBA
                rows={fbaRows}
              reload={loadAll}
              companyId={companyId}
              profile={profile}
              currentMarket={currentMarket}
              billingSelectedLines={billingSelections}
              onToggleBillingSelection={toggleBillingSelection}
              canSelectForBilling={canManageInvoices}
              onSelectAllUninvoiced={() => selectAllUninvoicedForSection('fba')}
            />
          )}
            {activeSection === 'fbm' && (
              <AdminFBM
              rows={fbmRows}
              reload={loadAll}
              companyId={companyId}
              profile={profile}
              billingSelectedLines={billingSelections}
              onToggleBillingSelection={toggleBillingSelection}
              canSelectForBilling={canManageInvoices}
              onSelectAllUninvoiced={() => selectAllUninvoicedForSection('fbm')}
            />
          )}
            {activeSection === 'other' && (
              <AdminOther
              rows={otherRows}
              reload={loadAll}
              companyId={companyId}
              profile={profile}
              currentMarket={currentMarket}
              billingSelectedLines={billingSelections}
              onToggleBillingSelection={toggleBillingSelection}
              canSelectForBilling={canManageInvoices}
              onSelectAllUninvoiced={() => selectAllUninvoicedForSection('other')}
            />
          )}
          {activeSection === 'stock' && (
            <AdminStockClientView profile={profile} />
          )}
          {activeSection === 'returns' && (
            <AdminReturns rows={returnRows} reload={loadAll} companyId={companyId} profile={profile} />
          )}
          {activeSection === 'requests' && (
            <ClientPrepShipments profileOverride={profile} />
          )}
        </div>
        {canManageInvoices && hasBillingSelection && (
          <div className="lg:w-[360px] lg:flex-shrink-0">
            <BillingSelectionPanel
              selections={billingSelections}
              billingProfiles={billingProfiles}
              clientEmail={profile?.email || ''}
              clientPhone={profile?.phone || ''}
              clientSignupCountry={profile?.country || ''}
              currentMarket={currentMarket || 'FR'}
              invoiceCounters={invoiceCounters}
              proformaCounters={proformaCounters}
              issuerProfiles={issuerProfiles}
              allowedIssuerCountries={allowedIssuerCountries}
              onSaveIssuerProfile={handleSaveIssuerProfile}
              onSaveBillingProfile={async (billingProfileId, updates) => {
                const { error } = await supabaseHelpers.updateBillingProfile(billingProfileId, updates);
                if (!error) await loadAll();
                return { error };
              }}
              onSave={handleBillingSave}
              onPreview={handleBillingPreview}
              isSaving={billingSaving}
              error={billingError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
