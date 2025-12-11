// FILE: src/components/dashboard/SupabaseInvoicesList.jsx
import React, { useState, useEffect } from 'react';
import { Download, Eye, Calendar, FileText, Search } from 'lucide-react';
import { supabaseHelpers } from '../../config/supabase';
import { useDashboardTranslation } from '../../translations';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
function SupabaseInvoicesList() {
  const { t, tp } = useDashboardTranslation();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useSupabaseAuth();
  const isLimitedAdmin = Boolean(profile?.is_limited_admin);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isLimitedAdmin) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    if (user) fetchInvoices();
  }, [user, isLimitedAdmin]);

  const fetchInvoices = async () => {
    if (!user || isLimitedAdmin) return;
    try {
      const { data, error } = await supabaseHelpers.getInvoices(user.id);
      if (error) throw error;
      setInvoices(data || []);
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
        return 'Paid';
      case 'pending':
        return 'Pending';
      case 'overdue':
        return 'Overdue';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const filteredInvoices = invoices.filter((invoice) => {
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
  });

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
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-text-primary">{t('invoices.title')}</h2>
        <div className="text-sm text-text-secondary">
          {tp('invoices.total', { n: filteredInvoices.length })}
        </div>
      </div>

      {/* Flash message */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg ${
            message.toLowerCase().includes('success')
              ? 'bg-green-50 border border-green-200 text-green-600'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}
        >
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-text-primary mb-2">
              {t('invoices.filters.search')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light w-4 h-4" />
              <input
                type="text"
                id="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                 placeholder={t('invoices.filters.searchPh')}
                className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-text-primary mb-2">
              {t('invoices.filters.status')}
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">{t('invoices.filters.all')}</option>
              <option value="paid">{t('invoices.filters.paid')}</option>
              <option value="pending">{t('invoices.filters.pending')}</option>
              <option value="overdue">{t('invoices.filters.overdue')}</option>
              <option value="cancelled">{t('invoices.filters.cancelled')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-text-primary mb-2">
              {t('invoices.filters.period')}
            </label>
            <select
              id="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
               <option value="all">{t('invoices.filters.all')}</option>
              <option value="last30">{t('invoices.filters.last30')}</option>
              <option value="last90">{t('invoices.filters.last90')}</option>
              <option value="thisYear">{t('invoices.filters.thisYear')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices list */}
      <div className="space-y-4">
        {filteredInvoices.map((invoice) => (
          <div key={invoice.id} className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between">
              <div className="flex-1 mb-4 md:mb-0">
                <div className="flex items-center mb-2">
                  <FileText className="w-5 h-5 text-text-secondary mr-2" />
                  <h3 className="text-lg font-semibold text-text-primary">
                    {tp('invoices.card.invoice', { no: invoice.invoice_number })}
                  </h3>
                  <span className={`ml-3 px-2 py-1 text-xs rounded-full ${getStatusColor(invoice.status)}`}>
                    {getStatusText(invoice.status)}
                  </span>
                </div>
                <div className="text-text-secondary space-y-1">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>{t('invoices.card.date')}: {new Date(invoice.issue_date).toLocaleDateString('en-GB')}</span>
                  </div>
                  {invoice.due_date && (
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>{t('invoices.card.due')}: {new Date(invoice.due_date).toLocaleDateString('en-GB')}</span>
                    </div>
                  )}
                  {invoice.description && <p className="text-sm">{invoice.description}</p>}
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center space-y-2 md:space-y-0 md:space-x-4">
  <div className="text-right">
    <p className="text-2xl font-bold text-text-primary">
      {tp('invoices.card.amount', { amount: parseFloat(invoice.amount || 0).toFixed(2) })}
    </p>
    {invoice.vat_amount && (
      <p className="text-sm text-text-secondary">
        {tp('invoices.card.vat', { vat: parseFloat(invoice.vat_amount).toFixed(2) })}
      </p>
    )}
  </div>

  {invoice.file_path ? (
    <div className="flex space-x-2">
      <button
        onClick={() => viewInvoice(invoice)}
        className="flex items-center px-3 py-2 text-primary border border-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
      >
        <Eye className="w-4 h-4 mr-1" />
        {t('invoices.card.view')}
      </button>
      <button
        onClick={() => downloadInvoice(invoice)}
        className="flex items-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
      >
        <Download className="w-4 h-4 mr-1" />
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

      {filteredInvoices.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-secondary mb-2">
            {searchTerm || statusFilter !== 'all' || dateFilter !== 'all'
             ? t('invoices.empty.noneFound')
              : t('invoices.empty.noneYet')}
          </h3>
          <p className="text-text-light mb-6">
            {searchTerm || statusFilter !== 'all' || dateFilter !== 'all'
              ? t('invoices.empty.tipFound')
              : t('invoices.empty.tipYet')}
          </p>
        </div>
      )}
    </div>
  );
}

export default SupabaseInvoicesList;
