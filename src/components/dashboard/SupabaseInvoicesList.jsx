import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Calendar, FileText, Search, FileArchive, FileSpreadsheet } from 'lucide-react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { supabaseHelpers } from '../../config/supabase';
import { useDashboardTranslation } from '../../translations';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

const normalizeCountry = (value) => {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return '';
  if (code === 'RO') return 'FR';
  return code;
};

const toMonthKey = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const currentMonthKey = () => toMonthKey(new Date().toISOString());

const formatMonthLabel = (monthKey) => {
  if (!monthKey) return '-';
  const [year, month] = String(monthKey).split('-');
  const date = new Date(`${year}-${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
};

const sanitizeFilePart = (value) =>
  String(value || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

function SupabaseInvoicesList() {
  const { t, tp } = useDashboardTranslation();
  const [invoices, setInvoices] = useState([]);
  const [upsInvoices, setUpsInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useSupabaseAuth();
  const isLimitedAdmin = Boolean(profile?.is_limited_admin);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [upsMonth, setUpsMonth] = useState(currentMonthKey());
  const [selectedUpsIds, setSelectedUpsIds] = useState({});

  const [message, setMessage] = useState('');
  const [exportingZip, setExportingZip] = useState(false);
  const [exportingXls, setExportingXls] = useState(false);

  const tt = (key, fallback) => {
    const value = t(key);
    return value === key ? fallback : value;
  };

  const companyId = useMemo(
    () => profile?.company_id || profile?.companyId || user?.id || null,
    [profile?.company_id, profile?.companyId, user?.id]
  );

  useEffect(() => {
    if (isLimitedAdmin) {
      setInvoices([]);
      setUpsInvoices([]);
      setLoading(false);
      return;
    }
    if (user) fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLimitedAdmin, companyId]);

  const fetchInvoices = async () => {
    if (!user || isLimitedAdmin) return;
    try {
      const [prepRes, upsRes] = await Promise.all([
        supabaseHelpers.getInvoices(user.id),
        supabaseHelpers.listUpsInvoiceFiles({ userId: user.id, companyId, limit: 500 })
      ]);

      if (prepRes.error) throw prepRes.error;
      if (upsRes.error) throw upsRes.error;

      setInvoices(prepRes.data || []);
      setUpsInvoices(upsRes.data || []);
      setSelectedUpsIds({});
      setUpsMonth(currentMonthKey());
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setMessage(t('invoices.flashError'));
    } finally {
      setLoading(false);
    }
  };

  const downloadInvoice = async (invoice) => {
    try {
      const { data, error } = await supabaseHelpers.downloadInvoice(invoice.file_path);
      if (error) throw error;

      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `invoice-${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading invoice:', error);
      setMessage(t('invoices.errors.download'));
    }
  };

  const viewInvoice = async (invoice) => {
    const { data, error } = await supabaseHelpers.getInvoiceSignedUrl(invoice.file_path, 300);
    if (error || !data?.signedUrl) {
      setMessage(t('invoices.errors.view'));
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const downloadUpsInvoice = async (invoice) => {
    try {
      const { data, error } = await supabaseHelpers.downloadUpsDocument(invoice.file_path);
      if (error || !data) throw error || new Error('Missing UPS document data');
      saveAs(data, sanitizeFilePart(invoice.file_name || `${invoice.invoice_number || invoice.id}.pdf`));
    } catch (error) {
      console.error('Error downloading UPS invoice:', error);
      setMessage(tt('invoices.errors.upsDownload', 'Could not download UPS invoice.'));
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'paid':
        return tt('invoices.filters.paid', 'Paid');
      case 'pending':
        return tt('invoices.filters.pending', 'Pending');
      case 'overdue':
        return tt('invoices.filters.overdue', 'Overdue');
      case 'cancelled':
        return tt('invoices.filters.cancelled', 'Cancelled');
      default:
        return status;
    }
  };

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        const matchesSearch =
          invoice.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          invoice.description?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;

        let matchesDate = true;
        if (dateFilter !== 'all') {
          const invoiceDate = new Date(invoice.issue_date);
          const now = new Date();
          switch (dateFilter) {
            case 'last30':
              matchesDate = now - invoiceDate <= 30 * 24 * 60 * 60 * 1000;
              break;
            case 'last90':
              matchesDate = now - invoiceDate <= 90 * 24 * 60 * 60 * 1000;
              break;
            case 'thisYear':
              matchesDate = invoiceDate.getFullYear() === now.getFullYear();
              break;
            default:
              matchesDate = true;
          }
        }

        return matchesSearch && matchesStatus && matchesDate;
      }),
    [invoices, searchTerm, statusFilter, dateFilter]
  );

  const prepFranceInvoices = useMemo(
    () => filteredInvoices.filter((invoice) => normalizeCountry(invoice.country || 'FR') === 'FR'),
    [filteredInvoices]
  );

  const prepGermanyInvoices = useMemo(
    () => filteredInvoices.filter((invoice) => normalizeCountry(invoice.country) === 'DE'),
    [filteredInvoices]
  );

  const upsMonthOptions = useMemo(() => {
    const keys = new Set([currentMonthKey()]);
    upsInvoices.forEach((row) => {
      keys.add(toMonthKey(row.invoice_date || row.created_at));
    });
    return Array.from(keys)
      .filter(Boolean)
      .sort((a, b) => (a < b ? 1 : -1));
  }, [upsInvoices]);

  const upsFilteredInvoices = useMemo(
    () =>
      upsInvoices.filter((row) => {
        const monthMatch = toMonthKey(row.invoice_date || row.created_at) === upsMonth;
        if (!monthMatch) return false;
        if (!searchTerm.trim()) return true;
        const needle = searchTerm.toLowerCase();
        return (
          String(row.invoice_number || '').toLowerCase().includes(needle) ||
          String(row.order_id || '').toLowerCase().includes(needle) ||
          String(row.file_name || '').toLowerCase().includes(needle)
        );
      }),
    [upsInvoices, upsMonth, searchTerm]
  );

  const selectedUpsRows = useMemo(
    () => upsFilteredInvoices.filter((row) => selectedUpsIds[row.id]),
    [upsFilteredInvoices, selectedUpsIds]
  );

  const toggleUpsSelection = (id) => {
    setSelectedUpsIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllUpsVisible = () => {
    const next = {};
    upsFilteredInvoices.forEach((row) => {
      next[row.id] = true;
    });
    setSelectedUpsIds(next);
  };

  const clearUpsSelection = () => setSelectedUpsIds({});

  const exportUpsSelectedZip = async () => {
    if (!selectedUpsRows.length) {
      setMessage(tt('invoices.errors.upsSelect', 'Select at least one UPS invoice.'));
      return;
    }
    setExportingZip(true);
    try {
      if (selectedUpsRows.length === 1) {
        await downloadUpsInvoice(selectedUpsRows[0]);
        return;
      }
      const zip = new JSZip();
      for (const row of selectedUpsRows) {
        if (!row.file_path) continue;
        const { data, error } = await supabaseHelpers.downloadUpsDocument(row.file_path);
        if (error || !data) continue;
        const fileName = `${sanitizeFilePart(row.invoice_number || row.id)}-${sanitizeFilePart(
          row.file_name || 'invoice.pdf'
        )}`;
        zip.file(fileName, data);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `ups-invoices-${upsMonth || currentMonthKey()}.zip`);
    } catch (error) {
      console.error('UPS ZIP export failed:', error);
      setMessage(tt('invoices.errors.upsZip', 'Could not generate UPS ZIP export.'));
    } finally {
      setExportingZip(false);
    }
  };

  const exportUpsSelectedXls = async () => {
    if (!selectedUpsRows.length) {
      setMessage(tt('invoices.errors.upsSelect', 'Select at least one UPS invoice.'));
      return;
    }
    setExportingXls(true);
    try {
      const XLSX = await import('xlsx');
      const rows = [[
        'Invoice',
        'Date',
        'Order',
        'Amount',
        'Currency',
        'Status',
        'Source',
        'File Name'
      ]];
      selectedUpsRows.forEach((row) => {
        rows.push([
          row.invoice_number || row.id,
          row.invoice_date || '',
          row.order_id || '',
          row.amount_total != null ? Number(row.amount_total).toFixed(2) : '',
          row.currency || '',
          row.status || '',
          row.source || '',
          row.file_name || ''
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'UPS Invoices');
      XLSX.writeFile(wb, `ups-invoices-${upsMonth || currentMonthKey()}.xlsx`);
    } catch (error) {
      console.error('UPS XLS export failed:', error);
      setMessage(tt('invoices.errors.upsXls', 'Could not generate UPS XLS export.'));
    } finally {
      setExportingXls(false);
    }
  };

  const renderPrepSection = (title, rows) => (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-base font-bold text-text-primary">{title}</h3>
        <div className="text-xs text-text-secondary">{rows.length}</div>
      </div>

      <div className="space-y-2.5">
        {rows.map((invoice) => (
          <div key={invoice.id} className="border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-text-secondary shrink-0" />
                  <h3 className="text-sm font-semibold text-text-primary truncate">
                    {tp('invoices.card.invoice', { no: invoice.invoice_number })}
                  </h3>
                  <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${getStatusColor(invoice.status)}`}>
                    {getStatusText(invoice.status)}
                  </span>
                </div>
                <div className="text-text-secondary space-y-0.5 text-xs">
                  <div className="flex items-center">
                    <Calendar className="w-3 h-3 mr-1.5 shrink-0" />
                    <span>
                      {t('invoices.card.date')}: {new Date(invoice.issue_date).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                  {invoice.due_date && (
                    <div className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1.5 shrink-0" />
                      <span>
                        {t('invoices.card.due')}: {new Date(invoice.due_date).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  )}
                  {invoice.description && <p className="text-[11px] text-text-light truncate">{invoice.description}</p>}
                </div>
              </div>

              <div className="flex flex-col md:items-end gap-1.5">
                <div className="text-left md:text-right">
                  <p className="text-lg md:text-xl leading-none font-extrabold text-text-primary tracking-tight">
                    {tp('invoices.card.amount', { amount: parseFloat(invoice.amount || 0).toFixed(2) })}
                  </p>
                  {invoice.vat_amount && (
                    <p className="text-[10px] text-text-secondary mt-0.5">
                      {tp('invoices.card.vat', { vat: parseFloat(invoice.vat_amount).toFixed(2) })}
                    </p>
                  )}
                </div>

                {invoice.file_path ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => viewInvoice(invoice)}
                      className="inline-flex items-center px-2 py-1 text-[11px] text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      {t('invoices.card.view')}
                    </button>
                    <button
                      onClick={() => downloadInvoice(invoice)}
                      className="inline-flex items-center px-2 py-1 text-[11px] bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      {t('invoices.card.download')}
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                    {t('invoices.card.noFile')}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="text-center py-8">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-text-light">{t('invoices.empty.noneFound')}</p>
        </div>
      )}
    </section>
  );

  if (isLimitedAdmin) {
    return (
      <div className="bg-white border rounded-xl p-6 text-sm text-text-secondary">
        Access to invoices is disabled for this account.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-text-primary">{t('invoices.title')}</h2>
        <div className="text-xs text-text-secondary">
          {tp('invoices.total', { n: filteredInvoices.length + upsFilteredInvoices.length })}
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            message.toLowerCase().includes('success')
              ? 'bg-green-50 border border-green-200 text-green-600'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}
        >
          {message}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="search" className="block text-xs font-medium text-text-primary mb-1.5">
              {t('invoices.filters.search')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light w-3.5 h-3.5" />
              <input
                type="text"
                id="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('invoices.filters.searchPh')}
                className="pl-10 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="block text-xs font-medium text-text-primary mb-1.5">
              {t('invoices.filters.status')}
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">{t('invoices.filters.all')}</option>
              <option value="paid">{t('invoices.filters.paid')}</option>
              <option value="pending">{t('invoices.filters.pending')}</option>
              <option value="overdue">{t('invoices.filters.overdue')}</option>
              <option value="cancelled">{t('invoices.filters.cancelled')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="date" className="block text-xs font-medium text-text-primary mb-1.5">
              {t('invoices.filters.period')}
            </label>
            <select
              id="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">{t('invoices.filters.all')}</option>
              <option value="last30">{t('invoices.filters.last30')}</option>
              <option value="last90">{t('invoices.filters.last90')}</option>
              <option value="thisYear">{t('invoices.filters.thisYear')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4 max-w-6xl">
        {renderPrepSection(tt('invoices.sections.prepFr', 'Invoice PrepCenter France'), prepFranceInvoices)}
        {renderPrepSection(tt('invoices.sections.prepDe', 'Invoice PrepCenter Germany'), prepGermanyInvoices)}

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-base font-bold text-text-primary">{tt('invoices.sections.ups', 'Invoice UPS')}</h3>
              <p className="text-xs text-text-secondary">{tt('invoices.ups.help', 'Current month is preselected.')}</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="ups-month" className="text-xs text-text-secondary">
                {tt('invoices.ups.month', 'Month')}
              </label>
              <select
                id="ups-month"
                value={upsMonth}
                onChange={(e) => {
                  setUpsMonth(e.target.value);
                  setSelectedUpsIds({});
                }}
                className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
              >
                {upsMonthOptions.map((key) => (
                  <option key={key} value={key}>
                    {formatMonthLabel(key)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button onClick={selectAllUpsVisible} className="px-2.5 py-1.5 text-xs border rounded-lg">
              {tt('invoices.ups.selectAll', 'Select all')}
            </button>
            <button onClick={clearUpsSelection} className="px-2.5 py-1.5 text-xs border rounded-lg">
              {tt('invoices.ups.clear', 'Clear')}
            </button>
            <div className="text-xs text-text-secondary">
              {tt('invoices.ups.selected', 'Selected')}: {selectedUpsRows.length}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={exportUpsSelectedZip}
                disabled={exportingZip || selectedUpsRows.length === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm disabled:opacity-60"
              >
                <FileArchive className="w-4 h-4" />
                {selectedUpsRows.length > 1
                  ? tt('invoices.ups.downloadZip', 'Download ZIP')
                  : tt('invoices.ups.downloadOne', 'Download')}
              </button>
              <button
                onClick={exportUpsSelectedXls}
                disabled={exportingXls || selectedUpsRows.length === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm disabled:opacity-60"
              >
                <FileSpreadsheet className="w-4 h-4" /> {tt('invoices.ups.exportXls', 'Export XLS')}
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {upsFilteredInvoices.map((invoice) => {
              const checked = Boolean(selectedUpsIds[invoice.id]);
              return (
                <div key={invoice.id} className="border border-gray-200 rounded-xl px-3 py-2.5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUpsSelection(invoice.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-4 h-4 text-text-secondary shrink-0" />
                          <h4 className="text-sm font-semibold text-text-primary truncate">
                            {invoice.invoice_number || invoice.file_name || invoice.id}
                          </h4>
                        </div>
                        <div className="text-xs text-text-secondary space-y-0.5">
                          <div>
                            {t('invoices.card.date')}: {new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('en-GB')}
                          </div>
                          <div>Order: {invoice.order_id || '-'}</div>
                          <div>
                            Amount:{' '}
                            {invoice.amount_total != null
                              ? `${Number(invoice.amount_total).toFixed(2)} ${invoice.currency || 'EUR'}`
                              : '-'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {invoice.file_path ? (
                        <button
                          onClick={() => downloadUpsInvoice(invoice)}
                          className="inline-flex items-center px-2 py-1 text-[11px] bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          {t('invoices.card.download')}
                        </button>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                          {t('invoices.card.noFile')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {upsFilteredInvoices.length === 0 && (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-text-light">{tt('invoices.ups.emptyMonth', 'No UPS invoices for this month.')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default SupabaseInvoicesList;
