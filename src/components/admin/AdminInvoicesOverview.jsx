import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Mail, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { supabase, supabaseHelpers } from '@/config/supabase';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';
import { useMarket } from '@/contexts/MarketContext';
import { buildInvoicePdfBlob } from '@/utils/invoicePdf';
import { DEFAULT_ISSUER_PROFILES } from '@/utils/invoiceTax';

const toMonthInput = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const monthBounds = (monthValue) => {
  const [yearRaw, monthRaw] = String(monthValue || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return monthBounds(toMonthInput(now));
  }
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, endExclusive };
};

const getInvoiceCountriesForView = (selectedCountry) => {
  const code = String(selectedCountry || '').toUpperCase();
  // Business rule: Romania-issued invoices are managed together with France in admin list.
  if (code === 'FR') return ['FR', 'RO'];
  return [code || 'FR'];
};

const isPendingStatus = (status) => String(status || '').trim().toLowerCase() === 'pending';

const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('ro-RO');
};

const formatAmount = (value) => {
  const number = Number(value || 0);
  return number.toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const safeFileName = (value) =>
  String(value || 'invoice')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');

const toIsoDate = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const roundMoney = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
};

const UUID_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

const extractBillingInvoiceId = (...values) => {
  for (const value of values) {
    const text = String(value || '');
    if (!text) continue;
    const match = text.match(UUID_REGEX);
    if (match?.[1]) return match[1];
  }
  return null;
};

const mapLineToItem = (line, section) => {
  const units = Number(section === 'fbm' ? line?.orders_units : line?.units || 0);
  const unitPrice = roundMoney(line?.unit_price || 0);
  const total = roundMoney(line?.total ?? unitPrice * units);
  return {
    service: String(line?.service || 'Services').trim() || 'Services',
    units,
    unitPrice,
    total
  };
};

const fetchBillingItems = async ({ billingInvoiceId, companyId }) => {
  if (!billingInvoiceId) return [];
  const withCompany = (query) => (companyId ? query.eq('company_id', companyId) : query);
  const [fbaRes, fbmRes, otherRes] = await Promise.all([
    withCompany(
      supabase
        .from('fba_lines')
        .select('service, unit_price, units, total')
        .eq('billing_invoice_id', billingInvoiceId)
        .order('id', { ascending: true })
    ),
    withCompany(
      supabase
        .from('fbm_lines')
        .select('service, unit_price, orders_units, total')
        .eq('billing_invoice_id', billingInvoiceId)
        .order('id', { ascending: true })
    ),
    withCompany(
      supabase
        .from('other_lines')
        .select('service, unit_price, units, total')
        .eq('billing_invoice_id', billingInvoiceId)
        .order('created_at', { ascending: true })
    )
  ]);

  const missingBillingColumn =
    invoiceColumnMissingInError(fbaRes?.error, 'billing_invoice_id') ||
    invoiceColumnMissingInError(fbmRes?.error, 'billing_invoice_id') ||
    invoiceColumnMissingInError(otherRes?.error, 'billing_invoice_id');
  if (missingBillingColumn) return [];

  const firstError = [fbaRes?.error, fbmRes?.error, otherRes?.error].find(Boolean);
  if (firstError) throw firstError;

  const fbaItems = (fbaRes?.data || []).map((line) => mapLineToItem(line, 'fba'));
  const fbmItems = (fbmRes?.data || []).map((line) => mapLineToItem(line, 'fbm'));
  const otherItems = (otherRes?.data || []).map((line) => mapLineToItem(line, 'other'));
  return [...fbaItems, ...fbmItems, ...otherItems].filter((item) => item.units > 0 || item.total > 0);
};

const parseItemsFromBillingNotes = (notes) => {
  if (!notes) return [];
  try {
    const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items.filter((item) => item && typeof item === 'object');
  } catch {
    return [];
  }
};

const fetchStoredBillingItems = async ({ billingInvoiceId }) => {
  if (!billingInvoiceId) return [];
  const { data, error } = await supabase
    .from('billing_invoices')
    .select('notes')
    .eq('id', billingInvoiceId)
    .maybeSingle();
  if (error) return [];
  return parseItemsFromBillingNotes(data?.notes);
};

const resolveBillingInvoiceId = async ({
  explicitBillingInvoiceId,
  description,
  companyId,
  userId,
  invoiceNumber
}) => {
  const fromText = extractBillingInvoiceId(explicitBillingInvoiceId, description);
  if (fromText) return fromText;
  if (!invoiceNumber) return null;

  let query = supabase
    .from('billing_invoices')
    .select('id')
    .eq('invoice_number', String(invoiceNumber).trim())
    .limit(1);
  if (companyId) query = query.eq('company_id', companyId);
  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query.maybeSingle();
  if (error && !invoiceColumnMissingInError(error, 'billing_invoices')) {
    throw error;
  }
  return data?.id || null;
};

const isProforma = (row) => {
  const byType = String(row?.document_type || '').toLowerCase() === 'proforma';
  if (byType) return true;
  const number = String(row?.invoice_number || '').toUpperCase();
  return /\bPF\d+\b/.test(number);
};

const invoiceColumnMissingInError = (error, column) => {
  if (!error) return false;
  const needle = String(column || '').toLowerCase();
  const parts = [
    String(error.message || ''),
    String(error.details || ''),
    String(error.hint || '')
  ].map((part) => part.toLowerCase());
  return parts.some((part) => part.includes(needle));
};

const buildDocumentNumber = ({ issuerCode, counterValue, documentType }) => {
  const normalizedType = String(documentType || 'invoice').toLowerCase();
  if (normalizedType === 'proforma') {
    return issuerCode === 'DE'
      ? `EcomPrepHub Germany PF${String(counterValue).padStart(3, '0')}`
      : `EcomPrepHub France PF${String(counterValue).padStart(3, '0')}`;
  }
  return issuerCode === 'DE'
    ? `EcomPrepHub Germany ${String(counterValue).padStart(3, '0')}`
    : `EcomPrepHub France ${counterValue}`;
};

export default function AdminInvoicesOverview() {
  const { t } = useAdminTranslation();
  const { currentMarket, availableMarkets, markets } = useMarket();
  const [country, setCountry] = useState(String(currentMarket || 'FR').toUpperCase());
  const [month, setMonth] = useState(toMonthInput());
  const [viewMode, setViewMode] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [emailingId, setEmailingId] = useState(null);
  const [rows, setRows] = useState([]);
  const [companyNames, setCompanyNames] = useState({});
  const [clientNames, setClientNames] = useState({});
  const [clientProfiles, setClientProfiles] = useState({});
  const countryOptions = useMemo(
    () =>
      (availableMarkets || [])
        .map((code) => String(code || '').toUpperCase())
        .filter(Boolean)
        .map((code) => ({ code, label: markets?.[code]?.name || code })),
    [availableMarkets, markets]
  );

  useEffect(() => {
    const market = String(currentMarket || '').toUpperCase();
    if (market && market !== country) {
      setCountry(market);
      return;
    }
    if (countryOptions.length > 0 && !countryOptions.some((item) => item.code === country)) {
      setCountry(countryOptions[0].code);
    }
  }, [currentMarket, countryOptions, country]);

  const loadInvoices = async () => {
    setLoading(true);
    setError('');

    try {
      const { start, endExclusive } = monthBounds(month);
      const visibleCountries = getInvoiceCountriesForView(country);

      let query = supabase
        .from('invoices')
        .select('id, user_id, company_id, invoice_number, amount, vat_amount, issue_date, due_date, status, country, created_at, file_path, description, document_type, converted_to_invoice_id, converted_from_proforma_id, document_payload, billing_invoice_id')
        .in('country', visibleCountries);
      if (viewMode === 'outstanding') {
        query = query.eq('status', 'pending');
      } else {
        query = query
          .gte('issue_date', start)
          .lt('issue_date', endExclusive);
      }
      query = query
        .order('issue_date', { ascending: false })
        .order('created_at', { ascending: false });

      let { data, error: invoicesError } = await query;

      const missingColumns =
        invoicesError &&
        ['document_type', 'converted_to_invoice_id', 'converted_from_proforma_id', 'document_payload', 'billing_invoice_id']
          .some((column) => invoiceColumnMissingInError(invoicesError, column));

      if (missingColumns) {
        let fallbackQuery = supabase
          .from('invoices')
          .select('id, user_id, company_id, invoice_number, amount, vat_amount, issue_date, due_date, status, country, created_at, file_path, description')
          .in('country', visibleCountries);
        if (viewMode === 'outstanding') {
          fallbackQuery = fallbackQuery.eq('status', 'pending');
        } else {
          fallbackQuery = fallbackQuery
            .gte('issue_date', start)
            .lt('issue_date', endExclusive);
        }
        const fallback = await fallbackQuery
          .order('issue_date', { ascending: false })
          .order('created_at', { ascending: false });
        data = (fallback.data || []).map((row) => ({
          ...row,
          document_type: 'invoice',
          converted_to_invoice_id: null,
          converted_from_proforma_id: null,
          document_payload: null,
          billing_invoice_id: null
        }));
        invoicesError = fallback.error;
      }

      if (invoicesError) {
        throw invoicesError;
      }

      const list = (Array.isArray(data) ? data : [])
        .filter((row) => !(isProforma(row) && row.converted_to_invoice_id));

      const ordered = [...list].sort((a, b) => {
        const pendingA = isPendingStatus(a.status) ? 0 : 1;
        const pendingB = isPendingStatus(b.status) ? 0 : 1;
        if (pendingA !== pendingB) return pendingA - pendingB;

        const dateA = new Date(a.issue_date || a.created_at || 0).getTime();
        const dateB = new Date(b.issue_date || b.created_at || 0).getTime();
        if (viewMode === 'outstanding') {
          return dateA - dateB;
        }
        return dateB - dateA;
      });

      setRows(ordered);

      const companyIds = Array.from(
        new Set(ordered.map((row) => row.company_id).filter(Boolean))
      );
      const userIds = Array.from(
        new Set(ordered.map((row) => row.user_id).filter(Boolean))
      );

      if (!companyIds.length) {
        setCompanyNames({});
      } else {
        const { data: companies, error: companiesError } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);

        if (companiesError) throw companiesError;

        const lookup = (companies || []).reduce((acc, company) => {
          acc[company.id] = company.name || company.id;
          return acc;
        }, {});
        setCompanyNames(lookup);
      }

      if (!userIds.length) {
        setClientNames({});
        setClientProfiles({});
      } else {
        const { data: users, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, company_name')
          .in('id', userIds);
        if (usersError) throw usersError;

        const userLookup = (users || []).reduce((acc, entry) => {
          const fullName = [entry.first_name, entry.last_name]
            .filter(Boolean)
            .join(' ')
            .trim();
          acc[entry.id] = fullName || entry.email || entry.id;
          return acc;
        }, {});
        setClientNames(userLookup);
        const profileLookup = (users || []).reduce((acc, entry) => {
          acc[entry.id] = entry;
          return acc;
        }, {});
        setClientProfiles(profileLookup);
      }
    } catch (err) {
      setError(err?.message || t('adminInvoices.loadError'));
      setRows([]);
      setCompanyNames({});
      setClientNames({});
      setClientProfiles({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, month, viewMode]);

  const summary = useMemo(() => {
    let net = 0;
    let vat = 0;
    let pending = 0;

    for (const row of rows) {
      const rowNet = Number(row.amount || 0);
      const rowVat = Number(row.vat_amount || 0);
      net += Number.isFinite(rowNet) ? rowNet : 0;
      vat += Number.isFinite(rowVat) ? rowVat : 0;
      if (isPendingStatus(row.status)) pending += 1;
    }

    return {
      count: rows.length,
      pending,
      net,
      vat,
      gross: net + vat
    };
  }, [rows]);

  const exportMonthlyCsv = () => {
    const csvRows = [
      ['Invoice', 'Date', 'Company', 'Client name', 'Country', 'Net', 'VAT', 'Total', 'Status']
    ];
    rows.forEach((row) => {
      const net = Number(row.amount || 0);
      const vat = Number(row.vat_amount || 0);
      csvRows.push([
        row.invoice_number || '',
        row.issue_date || '',
        companyNames[row.company_id] || '',
        clientNames[row.user_id] || '',
        row.country || country,
        net.toFixed(2),
        vat.toFixed(2),
        (net + vat).toFixed(2),
        row.status || ''
      ]);
    });
    const csv = csvRows
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `invoices-${country}-${month}.csv`);
  };

  const exportMonthlyZip = async () => {
    const withFiles = rows.filter((row) => row.file_path && !isProforma(row));
    if (!withFiles.length) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      for (const row of withFiles) {
        const { data, error: downloadError } = await supabaseHelpers.downloadInvoice(row.file_path);
        if (downloadError || !data) continue;
        const filename = `${country}-${month}-${row.invoice_number || row.id}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_');
        zip.file(filename, data);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `invoices-${country}-${month}.zip`);
    } finally {
      setExporting(false);
    }
  };

  const downloadInvoice = async (row) => {
    if (!row?.file_path) return;
    const { data, error: downloadError } = await supabaseHelpers.downloadInvoice(row.file_path);
    if (downloadError || !data) {
      setError(downloadError?.message || t('adminInvoices.loadError'));
      return;
    }
    const name = safeFileName(row.invoice_number || row.id);
    saveAs(data, `${name}.pdf`);
  };

  const updateStatus = async (invoiceId, value) => {
    const next = String(value || '').toLowerCase();
    if (!['pending', 'paid'].includes(next)) return;
    const targetRow = rows.find((row) => row.id === invoiceId) || null;
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: next })
      .eq('id', invoiceId);
    if (updateError) {
      setError(updateError.message || t('adminInvoices.loadError'));
      return;
    }

    let effectiveCompanyId = targetRow?.company_id || null;
    // If invoice is linked to a fallback/auto company but user has a real company_id,
    // align the invoice to that company so balance RPC includes it for the right client.
    if (targetRow?.user_id) {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', targetRow.user_id)
        .maybeSingle();
      const ownerCompanyId = ownerProfile?.company_id || null;
      if (ownerCompanyId && ownerCompanyId !== targetRow?.company_id) {
        const { error: alignError } = await supabase
          .from('invoices')
          .update({ company_id: ownerCompanyId })
          .eq('id', invoiceId);
        if (!alignError) {
          effectiveCompanyId = ownerCompanyId;
        }
      }
    }

    // Keep client live balance in sync when status changes from admin invoices list.
    if (effectiveCompanyId) {
      const marketForBalance = String(targetRow.country || country || '').toUpperCase() || null;
      const { data: liveBalance, error: balanceError } = await supabaseHelpers.getCompanyLiveBalance(
        effectiveCompanyId,
        marketForBalance
      );
      if (!balanceError && Number.isFinite(Number(liveBalance))) {
        await supabase
          .from('profiles')
          .update({ current_balance: Number(liveBalance) })
          .eq('company_id', effectiveCompanyId);
      }
    }

    setRows((prev) => {
      const updated = prev.map((row) =>
        row.id === invoiceId
          ? { ...row, status: next, company_id: effectiveCompanyId || row.company_id }
          : row
      );
      return [...updated].sort((a, b) => {
        const pendingA = isPendingStatus(a.status) ? 0 : 1;
        const pendingB = isPendingStatus(b.status) ? 0 : 1;
        if (pendingA !== pendingB) return pendingA - pendingB;
        const dateA = new Date(a.issue_date || a.created_at || 0).getTime();
        const dateB = new Date(b.issue_date || b.created_at || 0).getTime();
        return dateB - dateA;
      });
    });
  };

  const deleteInvoice = async (row) => {
    if (!row?.id) return;
    const label = row.invoice_number ? `#${row.invoice_number}` : 'this invoice';
    const confirmed = window.confirm(`Delete ${label}? This action cannot be undone.`);
    if (!confirmed) return;

    setError('');
    setDeletingId(row.id);
    try {
      const { error: deleteError } = await supabaseHelpers.deleteInvoice(row);
      if (deleteError) throw deleteError;
      setRows((prev) => prev.filter((entry) => entry.id !== row.id));
    } catch (err) {
      setError(err?.message || t('adminInvoices.loadError'));
    } finally {
      setDeletingId(null);
    }
  };

  const convertProforma = async (row) => {
    if (!row?.id || !isProforma(row) || row.converted_to_invoice_id) return;
    const ok = window.confirm(`Convert proforma #${row.invoice_number || row.id} to final invoice?`);
    if (!ok) return;
    setConvertingId(row.id);
    setError('');
    try {
      let { data: sourceRow, error: sourceRowError } = await supabase
        .from('invoices')
        .select('id, document_payload, description, amount, vat_amount, user_id, company_id, country, billing_invoice_id')
        .eq('id', row.id)
        .maybeSingle();
      const missingSourceColumns =
        sourceRowError &&
        ['document_payload', 'billing_invoice_id'].some((column) =>
          invoiceColumnMissingInError(sourceRowError, column)
        );
      if (missingSourceColumns) {
        const fallbackSource = await supabase
          .from('invoices')
          .select('id, description, amount, vat_amount, user_id, company_id, country')
          .eq('id', row.id)
          .maybeSingle();
        sourceRow = fallbackSource.data
          ? { ...fallbackSource.data, document_payload: null, billing_invoice_id: null }
          : fallbackSource.data;
        sourceRowError = fallbackSource.error;
      }
      if (sourceRowError) throw sourceRowError;

      const sourcePayload =
        sourceRow?.document_payload && typeof sourceRow.document_payload === 'object'
          ? sourceRow.document_payload
          : (row.document_payload && typeof row.document_payload === 'object' ? row.document_payload : {});

      const issuerCode = String(
        sourceRow?.country || row.country || sourcePayload?.issuerProfile?.country || ''
      ).toUpperCase() || 'FR';

      const [issuerSettingsRes, billingProfilesRes, profileRes] = await Promise.all([
        supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'invoice_issuer_profiles')
          .maybeSingle(),
        row.user_id ? supabaseHelpers.getBillingProfiles(row.user_id) : Promise.resolve({ data: [], error: null }),
        row.user_id
          ? supabase
              .from('profiles')
              .select('id, first_name, last_name, email, phone, company_name, country')
              .eq('id', row.user_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ]);

      const issuerProfiles = issuerSettingsRes?.data?.value || {};
      const issuerProfileFallback =
        issuerProfiles?.[issuerCode] ||
        DEFAULT_ISSUER_PROFILES?.[issuerCode] ||
        DEFAULT_ISSUER_PROFILES.FR;

      const profile = profileRes?.data || {};
      const billingCandidates = Array.isArray(billingProfilesRes?.data) ? billingProfilesRes.data : [];
      const billingProfileFallback =
        billingCandidates.find((entry) => entry?.is_default) ||
        billingCandidates[0] ||
        {
          type: 'company',
          company_name: profile?.company_name || companyNames[row.company_id] || clientNames[row.user_id] || '-',
          first_name: profile?.first_name || '',
          last_name: profile?.last_name || '',
          address: '',
          postal_code: '',
          city: '',
          country: profile?.country || issuerCode,
          vat_number: ''
        };

      // Conversie strictă: păstrăm document_payload exact din proforma.
      // Singurele schimbări sunt tipul documentului și numărul nou de factură.
      const payload =
        sourcePayload && Object.keys(sourcePayload).length
          ? JSON.parse(JSON.stringify(sourcePayload))
          : {
              issuerProfile: issuerProfileFallback,
              billingProfile: billingProfileFallback,
              customerEmail: profile?.email || '',
              customerPhone: billingProfileFallback?.phone || profile?.phone || '',
              items: [],
              totals: {
                net: roundMoney(sourceRow?.amount ?? row.amount ?? 0),
                vat: roundMoney(sourceRow?.vat_amount ?? row.vat_amount ?? 0),
                gross: roundMoney((sourceRow?.amount ?? row.amount ?? 0) + (sourceRow?.vat_amount ?? row.vat_amount ?? 0)),
                vatRate: 0,
                vatLabel: 'VAT',
                legalNote: ''
              }
            };

      const payloadItems = Array.isArray(payload?.items) ? payload.items.filter(Boolean) : [];
      if (payloadItems.length === 0) {
        const billingInvoiceId = await resolveBillingInvoiceId({
          explicitBillingInvoiceId:
            sourceRow?.billing_invoice_id || row?.billing_invoice_id || sourcePayload?.billingInvoiceId || null,
          description: sourceRow?.description || row?.description || '',
          companyId: sourceRow?.company_id || row?.company_id || null,
          userId: sourceRow?.user_id || row?.user_id || null,
          invoiceNumber: row?.invoice_number || null
        });
        const storedItems = await fetchStoredBillingItems({ billingInvoiceId });
        if (storedItems.length > 0) {
          payload.items = storedItems;
        }
        const recoveredItems = await fetchBillingItems({
          billingInvoiceId,
          companyId: sourceRow?.company_id || row?.company_id || null
        });
        if ((!Array.isArray(payload?.items) || payload.items.length === 0) && recoveredItems.length > 0) {
          payload.items = recoveredItems;
        }
      }
      if (!Array.isArray(payload?.items) || payload.items.length === 0) {
        throw new Error('Proforma has no invoice lines. Conversion stopped.');
      }

      const { data: counterRow, error: counterError } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'invoice_number_counters')
        .maybeSingle();
      if (counterError) throw counterError;
      const counters = counterRow?.value || {};
      const fallback = issuerCode === 'FR' ? 189 : 1;
      const nextCounter = Number(counters?.[issuerCode]) || fallback;
      const finalInvoiceNumber = buildDocumentNumber({
        issuerCode,
        counterValue: nextCounter,
        documentType: 'invoice'
      });

      const invoiceDate = toIsoDate(new Date());
      const totals = payload?.totals || {};
      const pdfBlob = await buildInvoicePdfBlob({
        documentType: 'invoice',
        invoiceNumber: finalInvoiceNumber,
        invoiceDate,
        dueDate: payload?.dueDate || null,
        issuer: payload?.issuerProfile,
        customer: payload?.billingProfile,
        customerEmail: payload?.customerEmail || '',
        customerPhone: payload?.customerPhone || '',
        items: payload?.items || [],
        totals: {
          net: roundMoney(totals?.net ?? row.amount ?? 0),
          vat: roundMoney(totals?.vat ?? row.vat_amount ?? 0),
          gross: roundMoney(totals?.gross ?? (Number(row.amount || 0) + Number(row.vat_amount || 0))),
          vatLabel: totals?.vatLabel || 'VAT',
          vatRate: Number(totals?.vatRate ?? 0)
        },
        legalNote: totals?.legalNote || '',
        templateImage: null
      });

      const file = new File([pdfBlob], `${safeFileName(finalInvoiceNumber)}.pdf`, {
        type: 'application/pdf'
      });

      const description = String(sourceRow?.description ?? row.description ?? '');
      const uploadRes = await supabaseHelpers.uploadInvoice(file, row.user_id, {
        invoice_number: finalInvoiceNumber,
        document_type: 'invoice',
        converted_from_proforma_id: row.id,
        converted_to_invoice_id: null,
        billing_invoice_id: await resolveBillingInvoiceId({
          explicitBillingInvoiceId: sourceRow?.billing_invoice_id || row?.billing_invoice_id || null,
          description: sourceRow?.description || row?.description || '',
          companyId: sourceRow?.company_id || row?.company_id || null,
          userId: sourceRow?.user_id || row?.user_id || null,
          invoiceNumber: row?.invoice_number || null
        }),
        document_payload: payload,
        amount: roundMoney(sourceRow?.amount ?? row.amount ?? totals?.net ?? 0),
        vat_amount: roundMoney(sourceRow?.vat_amount ?? row.vat_amount ?? totals?.vat ?? 0),
        description,
        issue_date: invoiceDate,
        due_date: payload?.dueDate || null,
        status: 'pending',
        company_id: row.company_id,
        user_id: row.user_id,
        country: issuerCode
      });
      if (uploadRes?.error) throw uploadRes.error;

      const finalRow = uploadRes?.data;
      if (!finalRow?.id) {
        throw new Error('Invoice conversion failed (missing final invoice row).');
      }

      let { error: markError } = await supabase
        .from('invoices')
        .update({ status: 'converted', converted_to_invoice_id: finalRow.id })
        .eq('id', row.id);

      if (markError && invoiceColumnMissingInError(markError, 'converted_to_invoice_id')) {
        const fallbackMark = await supabase
          .from('invoices')
          .update({ status: 'converted' })
          .eq('id', row.id);
        markError = fallbackMark.error;
      }
      if (markError) throw markError;

      const nextCounters = {
        ...counters,
        [issuerCode]: nextCounter + 1
      };
      const { error: saveCounterError } = await supabase
        .from('app_settings')
        .upsert({
          key: 'invoice_number_counters',
          value: nextCounters,
          updated_at: new Date().toISOString()
        });
      if (saveCounterError) throw saveCounterError;

      // After a successful conversion, remove the source proforma row.
      const { error: deleteProformaError } = await supabaseHelpers.deleteInvoice(row);
      if (deleteProformaError) {
        const hardDelete = await supabase
          .from('invoices')
          .delete()
          .eq('id', row.id);
        if (hardDelete.error) {
          setError(
            `Invoice converted, but failed to remove proforma: ${hardDelete.error.message || deleteProformaError.message || 'Unknown error'}`
          );
        }
      }

      await loadInvoices();
    } catch (err) {
      setError(err?.message || t('adminInvoices.loadError'));
    } finally {
      setConvertingId(null);
    }
  };

  const sendInvoiceEmail = async (row) => {
    if (!row?.id || !row?.file_path) {
      setError('Missing invoice PDF file. Cannot send email.');
      return;
    }
    setError('');
    setNotice('');
    setEmailingId(row.id);
    try {
      const contact = clientProfiles[row.user_id] || {};
      const payload = row?.document_payload || {};
      const billingProfile = payload?.billingProfile || {};
      const recipientEmail = String(payload?.customerEmail || contact?.email || '').trim();
      if (!recipientEmail) {
        throw new Error('Client email is missing.');
      }

      const { data: pdfBlob, error: downloadError } = await supabaseHelpers.downloadInvoice(row.file_path);
      if (downloadError || !pdfBlob) {
        throw downloadError || new Error('Could not download invoice PDF.');
      }

      const net = roundMoney(payload?.totals?.net ?? row.amount ?? 0);
      const vat = roundMoney(payload?.totals?.vat ?? row.vat_amount ?? 0);
      const total = roundMoney(payload?.totals?.gross ?? (Number(net) + Number(vat)));
      const documentType = isProforma(row) ? 'proforma' : 'invoice';
      const clientName = [billingProfile?.first_name, billingProfile?.last_name].filter(Boolean).join(' ').trim();

      const emailRes = await supabaseHelpers.sendInvoiceEmail(
        {
          email: recipientEmail,
          client_name: clientName || [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() || null,
          company_name: billingProfile?.company_name || contact?.company_name || null,
          document_type: documentType,
          invoice_number: row.invoice_number || row.id,
          issue_date: row.issue_date || null,
          due_date: row.due_date || payload?.dueDate || null,
          net_amount: net,
          vat_amount: vat,
          total_amount: total,
          attachment_filename: `${safeFileName(row.invoice_number || row.id)}.pdf`
        },
        pdfBlob
      );
      if (emailRes?.error) throw emailRes.error;
      setNotice(`Email sent: ${row.invoice_number || row.id}`);
    } catch (err) {
      setError(err?.message || 'Could not send invoice email.');
    } finally {
      setEmailingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">{t('adminInvoices.title')}</h2>
          <p className="text-sm text-text-secondary">{t('adminInvoices.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              viewMode === 'monthly'
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50'
            }`}
          >
            {t('adminInvoices.tabs.monthly')}
          </button>
          <button
            onClick={() => setViewMode('outstanding')}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              viewMode === 'outstanding'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50'
            }`}
          >
            {t('adminInvoices.tabs.outstanding')}
          </button>
          {countryOptions.map((entry) => (
            <button
              key={entry.code}
              onClick={() => setCountry(entry.code)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                country === entry.code
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50'
              }`}
            >
              {entry.label}
            </button>
          ))}
          {viewMode === 'monthly' && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              aria-label={t('adminInvoices.monthLabel')}
            />
          )}
          <button onClick={loadInvoices} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> {t('common.refresh')}
          </button>
          <button onClick={exportMonthlyCsv} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            CSV
          </button>
          <button onClick={exportMonthlyZip} disabled={exporting} className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60">
            {exporting ? 'ZIP...' : 'ZIP PDF'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-text-secondary">{t('adminInvoices.cards.totalInvoices')}</div>
          <div className="text-2xl font-semibold text-text-primary">{summary.count}</div>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <div className="text-xs text-amber-700">{t('adminInvoices.cards.pendingInvoices')}</div>
          <div className="text-2xl font-semibold text-amber-800">{summary.pending}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-text-secondary">{t('adminInvoices.cards.netTotal')}</div>
          <div className="text-2xl font-semibold text-text-primary">{formatAmount(summary.net)} €</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-text-secondary">{t('adminInvoices.cards.grossTotal')}</div>
          <div className="text-2xl font-semibold text-text-primary">{formatAmount(summary.gross)} €</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {notice ? (
          <div className="m-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            {notice}
          </div>
        ) : null}
        {loading ? (
          <div className="py-16 flex items-center justify-center text-text-secondary">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="m-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-text-secondary">{t('adminInvoices.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.date')}</th>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.invoice')}</th>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.company')}</th>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.clientName')}</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">{t('adminInvoices.table.total')}</th>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.status')}</th>
                  <th className="px-4 py-3 text-left">Convert</th>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.download')}</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Delete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const net = Number(row.amount || 0);
                  const vat = Number(row.vat_amount || 0);
                  const gross = net + vat;
                  const pending = isPendingStatus(row.status);
                  const rowHighlightClass = isProforma(row) ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50';
                  return (
                    <tr key={row.id} className={`border-t border-gray-100 ${rowHighlightClass}`}>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.issue_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-text-primary">
                        {isProforma(row) ? `#Proforma ${row.invoice_number || '-'}` : `#${row.invoice_number || '-'}`}
                      </td>
                      <td className="px-4 py-3">{companyNames[row.company_id] || '-'}</td>
                      <td className="px-4 py-3">{clientNames[row.user_id] || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end leading-tight">
                          <span className="text-[11px] text-text-secondary">Amount</span>
                          <span className="font-medium text-text-primary">{formatAmount(net)} €</span>
                          <span className="mt-1 text-[11px] text-text-secondary">VAT</span>
                          <span>{formatAmount(vat)} €</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-text-primary">
                        {formatAmount(gross)} €
                      </td>
                      <td className="px-4 py-3">
                        {isProforma(row) ? (
                          <span className="inline-flex items-center rounded border border-yellow-300 bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                            proforma
                          </span>
                        ) : (
                          <select
                            value={String(row.status || 'pending').toLowerCase()}
                            onChange={(event) => updateStatus(row.id, event.target.value)}
                            className={`px-2 py-1 rounded text-xs font-medium border ${
                              pending
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-green-100 text-green-700 border-green-200'
                            }`}
                          >
                            <option value="pending">pending</option>
                            <option value="paid">paid</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isProforma(row) ? (
                          <button
                            type="button"
                            onClick={() => convertProforma(row)}
                            disabled={convertingId === row.id}
                            className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {convertingId === row.id ? 'Converting...' : 'Convert'}
                          </button>
                        ) : (
                          <span className="text-xs text-text-secondary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => downloadInvoice(row)}
                          disabled={!row.file_path}
                          className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-text-primary hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title={row.file_path ? t('adminInvoices.table.download') : t('adminInvoices.table.noFile')}
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t('adminInvoices.table.download')}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => sendInvoiceEmail(row)}
                          disabled={!row.file_path || emailingId === row.id}
                          className="inline-flex items-center gap-1 rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title={row.file_path ? 'Send email to client' : 'Invoice file missing'}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {emailingId === row.id ? 'Sending...' : 'Send email'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => deleteInvoice(row)}
                          disabled={deletingId === row.id}
                          className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Delete invoice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingId === row.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
