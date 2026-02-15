import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { supabase, supabaseHelpers } from '@/config/supabase';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';
import { useMarket } from '@/contexts/MarketContext';

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

export default function AdminInvoicesOverview() {
  const { t } = useAdminTranslation();
  const { currentMarket, availableMarkets, markets } = useMarket();
  const [country, setCountry] = useState(String(currentMarket || 'FR').toUpperCase());
  const [month, setMonth] = useState(toMonthInput());
  const [viewMode, setViewMode] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [companyNames, setCompanyNames] = useState({});
  const [clientNames, setClientNames] = useState({});
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

      let query = supabase
        .from('invoices')
        .select('id, user_id, company_id, invoice_number, amount, vat_amount, issue_date, due_date, status, country, created_at, file_path')
        .eq('country', country);
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

      const missingCountryColumn =
        invoicesError &&
        /country/i.test(String(invoicesError.message || '')) &&
        /does not exist/i.test(String(invoicesError.message || ''));

      if (missingCountryColumn) {
        let fallbackQuery = supabase
          .from('invoices')
          .select('id, user_id, company_id, invoice_number, amount, vat_amount, issue_date, due_date, status, created_at, file_path');
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
        data = fallback.data;
        invoicesError = fallback.error;
      }

      if (invoicesError) {
        throw invoicesError;
      }

      const list = Array.isArray(data) ? data : [];

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
      } else {
        const { data: users, error: usersError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
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
      }
    } catch (err) {
      setError(err?.message || t('adminInvoices.loadError'));
      setRows([]);
      setCompanyNames({});
      setClientNames({});
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
    const withFiles = rows.filter((row) => row.file_path);
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
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: next })
      .eq('id', invoiceId);
    if (updateError) {
      setError(updateError.message || t('adminInvoices.loadError'));
      return;
    }
    setRows((prev) => {
      const updated = prev.map((row) => (row.id === invoiceId ? { ...row, status: next } : row));
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
                  <th className="px-4 py-3 text-right">{t('adminInvoices.table.net')}</th>
                  <th className="px-4 py-3 text-right">{t('adminInvoices.table.vat')}</th>
                  <th className="px-4 py-3 text-right">{t('adminInvoices.table.total')}</th>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.status')}</th>
                  <th className="px-4 py-3 text-left">{t('adminInvoices.table.download')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const net = Number(row.amount || 0);
                  const vat = Number(row.vat_amount || 0);
                  const gross = net + vat;
                  const pending = isPendingStatus(row.status);
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.issue_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-text-primary">
                        #{row.invoice_number || '-'}
                      </td>
                      <td className="px-4 py-3">{companyNames[row.company_id] || '-'}</td>
                      <td className="px-4 py-3">{clientNames[row.user_id] || '-'}</td>
                      <td className="px-4 py-3 text-right">{formatAmount(net)} €</td>
                      <td className="px-4 py-3 text-right">{formatAmount(vat)} €</td>
                      <td className="px-4 py-3 text-right font-semibold text-text-primary">
                        {formatAmount(gross)} €
                      </td>
                      <td className="px-4 py-3">
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
