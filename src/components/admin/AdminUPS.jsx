import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, FileArchive, FileSpreadsheet, Loader2, RefreshCw, Upload, Truck } from 'lucide-react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { supabase, supabaseHelpers } from '@/config/supabase';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const sanitizeFilePart = (value) =>
  String(value || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

export default function AdminUPS() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [companyNames, setCompanyNames] = useState({});
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');
  const [uploading, setUploading] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [uploadInvoiceNumber, setUploadInvoiceNumber] = useState('');
  const [uploadInvoiceDate, setUploadInvoiceDate] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');
  const [uploadCurrency, setUploadCurrency] = useState('EUR');
  const [uploadFile, setUploadFile] = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const setSuccess = (message) => {
    setFlash(message);
    setFlashType('success');
  };

  const setError = (message) => {
    setFlash(message);
    setFlashType('error');
  };

  const byIntegrationId = useMemo(
    () =>
      integrations.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {}),
    [integrations]
  );

  const byOrderId = useMemo(
    () =>
      orders.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {}),
    [orders]
  );

  const summary = useMemo(() => {
    const connected = integrations.filter((row) => row.status === 'connected' || row.status === 'active').length;
    const pendingOrders = orders.filter((row) => String(row.status || '').toLowerCase() === 'pending').length;
    const errors = orders.filter((row) => String(row.status || '').toLowerCase() === 'error').length;
    return {
      integrations: integrations.length,
      connected,
      orders: orders.length,
      pendingOrders,
      errors,
      invoices: invoices.length
    };
  }, [integrations, orders, invoices]);

  const loadAll = async () => {
    const [intRes, ordRes, invRes] = await Promise.all([
      supabaseHelpers.listUpsIntegrations(),
      supabaseHelpers.listUpsShippingOrders({ limit: 500 }),
      supabaseHelpers.listUpsInvoiceFiles({ limit: 600 })
    ]);

    if (intRes.error) throw intRes.error;
    if (ordRes.error) throw ordRes.error;
    if (invRes.error) throw invRes.error;

    setIntegrations(intRes.data || []);
    setOrders(ordRes.data || []);
    setInvoices(invRes.data || []);

    const integrationsData = intRes.data || [];
    const ordersData = ordRes.data || [];
    const invoicesData = invRes.data || [];
    const companyIds = Array.from(
      new Set(
        [...integrationsData, ...ordersData, ...invoicesData]
          .map((row) => row?.company_id)
          .filter(Boolean)
      )
    );

    if (!companyIds.length) {
      setCompanyNames({});
      return;
    }

    const names = {};
    const [companiesRes, profilesRes] = await Promise.all([
      supabase.from('companies').select('id,name').in('id', companyIds),
      supabase.from('profiles').select('id,company_name,store_name,first_name,last_name,email').in('id', companyIds)
    ]);

    if (!companiesRes.error) {
      (companiesRes.data || []).forEach((row) => {
        if (!row?.id) return;
        const label = String(row.name || '').trim();
        if (label) names[row.id] = label;
      });
    }

    if (!profilesRes.error) {
      (profilesRes.data || []).forEach((row) => {
        if (!row?.id || names[row.id]) return;
        const label =
          String(row.company_name || '').trim() ||
          String(row.store_name || '').trim() ||
          String([row.first_name, row.last_name].filter(Boolean).join(' ')).trim() ||
          String(row.email || '').trim();
        if (label) names[row.id] = label;
      });
    }

    setCompanyNames(names);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } catch (error) {
      setError(error.message || 'Nu am putut încărca datele UPS.');
    }
    setRefreshing(false);
  };

  useEffect(() => {
    (async () => {
      try {
        await loadAll();
      } catch (error) {
        setError(error.message || 'Nu am putut încărca datele UPS.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exportInvoicesXlsx = async () => {
    const XLSX = await import('xlsx');
    const rows = [['Invoice', 'Date', 'Order', 'Amount', 'Currency', 'Status', 'Company', 'User']];
    invoices.forEach((inv) => {
      rows.push([
        inv.invoice_number || inv.id,
        inv.invoice_date || '',
        inv.order_id || '',
        inv.amount_total != null ? Number(inv.amount_total).toFixed(2) : '',
        inv.currency || '',
        inv.status || '',
        inv.company_id || '',
        inv.user_id || ''
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'UPS Invoices');
    XLSX.writeFile(wb, `admin-ups-invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportInvoicesZip = async () => {
    const withFiles = invoices.filter((inv) => inv.file_path);
    if (!withFiles.length) {
      setError('Nu există facturi UPS cu fișiere de descărcat.');
      return;
    }

    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      for (const inv of withFiles) {
        const { data, error } = await supabaseHelpers.downloadUpsDocument(inv.file_path);
        if (error || !data) continue;
        const fileName = `${sanitizeFilePart(inv.invoice_number || inv.id)}-${sanitizeFilePart(inv.file_name || 'invoice.pdf')}`;
        zip.file(fileName, data);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `admin-ups-invoices-${new Date().toISOString().slice(0, 10)}.zip`);
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleUploadInvoice = async (event) => {
    event.preventDefault();
    if (!selectedOrderId) {
      setError('Selectează o comandă UPS.');
      return;
    }
    if (!uploadFile) {
      setError('Încarcă un fișier PDF pentru factură.');
      return;
    }

    const order = byOrderId[selectedOrderId];
    if (!order) {
      setError('Comanda UPS selectată nu mai există.');
      return;
    }

    setUploading(true);
    setFlash('');

    const uploadRes = await supabaseHelpers.uploadUpsInvoiceFile({
      file: uploadFile,
      integration_id: order.integration_id,
      order_id: order.id,
      user_id: order.user_id,
      company_id: order.company_id,
      invoice_number: uploadInvoiceNumber.trim() || null,
      invoice_date: uploadInvoiceDate || null,
      currency: uploadCurrency || 'EUR',
      amount_total: uploadAmount !== '' ? Number(uploadAmount) : null,
      source: 'admin-manual',
      status: 'received',
      payload: {
        external_order_id: order.external_order_id || null,
        uploaded_from: 'admin-ups'
      }
    });

    if (uploadRes.error) {
      setError(uploadRes.error.message || 'Upload factură UPS eșuat.');
      setUploading(false);
      return;
    }

    setSuccess('Factura UPS a fost atașată comenzii.');
    setUploadFile(null);
    setUploadInvoiceNumber('');
    setUploadInvoiceDate('');
    setUploadAmount('');
    await refresh();
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă UPS Admin...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">UPS</h2>
          <p className="text-sm text-text-secondary">
            Management integrare UPS, etichete shipping și facturi per comandă.
          </p>
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {flash && (
        <div
          className={`p-3 rounded-lg text-sm ${
            flashType === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {flash}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-text-secondary">UPS integrations</div>
          <div className="text-2xl font-semibold text-text-primary">{summary.integrations}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-text-secondary">Connected</div>
          <div className="text-2xl font-semibold text-emerald-700">{summary.connected}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-text-secondary">Orders</div>
          <div className="text-2xl font-semibold text-text-primary">{summary.orders}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-text-secondary">Pending labels</div>
          <div className="text-2xl font-semibold text-amber-700">{summary.pendingOrders}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-text-secondary">Label errors</div>
          <div className="text-2xl font-semibold text-red-700">{summary.errors}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-text-secondary">UPS invoices</div>
          <div className="text-2xl font-semibold text-text-primary">{summary.invoices}</div>
        </div>
      </div>

      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Connected accounts</h3>
            <p className="text-sm text-text-secondary">Clienți care au conectat UPS.</p>
          </div>
        </div>
        {integrations.length === 0 ? (
          <div className="px-5 py-6 text-sm text-text-secondary">Nicio integrare UPS încă.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">UPS Account</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left">Connected</th>
                  <th className="px-4 py-3 text-left">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3">
                      {row.status === 'connected' || row.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle className="w-4 h-4" /> {row.status}
                        </span>
                      ) : (
                        row.status || '-'
                      )}
                    </td>
                    <td className="px-4 py-3">{row.ups_account_number || '-'}</td>
                    <td className="px-4 py-3">{row.user_id || '-'}</td>
                    <td className="px-4 py-3">{companyNames[row.company_id] || row.company_id || '-'}</td>
                    <td className="px-4 py-3">{formatDateTime(row.connected_at)}</td>
                    <td className="px-4 py-3">{row.last_error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="text-lg font-semibold text-text-primary">UPS shipping orders</h3>
        </div>
        {orders.length === 0 ? (
          <div className="px-5 py-6 text-sm text-text-secondary">Nicio comandă UPS încă.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Tracking</th>
                  <th className="px-4 py-3 text-left">Charge</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3">{row.external_order_id || row.id}</td>
                    <td className="px-4 py-3">{row.status || '-'}</td>
                    <td className="px-4 py-3">{row.tracking_number || '-'}</td>
                    <td className="px-4 py-3">
                      {row.total_charge != null ? `${Number(row.total_charge).toFixed(2)} ${row.currency || 'EUR'}` : '-'}
                    </td>
                    <td className="px-4 py-3">{row.user_id || '-'}</td>
                    <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Upload className="w-4 h-4" /> Attach UPS invoice to order
        </h3>

        <form onSubmit={handleUploadInvoice} className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-text-secondary">UPS Order</span>
            <select
              value={selectedOrderId}
              onChange={(event) => setSelectedOrderId(event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">Select order...</option>
              {orders.map((order) => {
                const integration = byIntegrationId[order.integration_id];
                const label = order.external_order_id || order.id;
                return (
                  <option key={order.id} value={order.id}>
                    {label} | {order.status || '-'} | {integration?.ups_account_number || '-'}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Invoice Number</span>
            <input
              value={uploadInvoiceNumber}
              onChange={(event) => setUploadInvoiceNumber(event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="UPS-INV-001"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Invoice Date</span>
            <input
              type="date"
              value={uploadInvoiceDate}
              onChange={(event) => setUploadInvoiceDate(event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Amount</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={uploadAmount}
              onChange={(event) => setUploadAmount(event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Currency</span>
            <input
              value={uploadCurrency}
              onChange={(event) => setUploadCurrency(event.target.value.toUpperCase())}
              className="w-full px-3 py-2 border rounded-lg"
              maxLength={3}
            />
          </label>

          <label className="space-y-1 md:col-span-3">
            <span className="text-xs text-text-secondary">PDF Invoice</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} Upload & Attach Invoice
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-text-primary">UPS invoices</h3>
          <div className="flex items-center gap-2">
            <button onClick={exportInvoicesXlsx} className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm">
              <FileSpreadsheet className="w-4 h-4" /> XLS
            </button>
            <button
              onClick={exportInvoicesZip}
              disabled={downloadingZip}
              className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm disabled:opacity-60"
            >
              {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />} ZIP
            </button>
          </div>
        </div>
        {invoices.length === 0 ? (
          <div className="px-5 py-6 text-sm text-text-secondary">Nicio factură UPS încă.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-text-secondary text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Invoice</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Download</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-4 py-3">{inv.invoice_number || inv.id}</td>
                    <td className="px-4 py-3">{inv.invoice_date || '-'}</td>
                    <td className="px-4 py-3">{inv.order_id || '-'}</td>
                    <td className="px-4 py-3">
                      {inv.amount_total != null ? `${Number(inv.amount_total).toFixed(2)} ${inv.currency || 'EUR'}` : '-'}
                    </td>
                    <td className="px-4 py-3">{inv.source || '-'}</td>
                    <td className="px-4 py-3">
                      {inv.file_path ? (
                        <button
                          onClick={async () => {
                            const { data, error } = await supabaseHelpers.downloadUpsDocument(inv.file_path);
                            if (error || !data) {
                              setError(error?.message || 'Nu am putut descărca factura UPS.');
                              return;
                            }
                            saveAs(data, sanitizeFilePart(inv.file_name || `${inv.invoice_number || inv.id}.pdf`));
                          }}
                          className="text-primary hover:underline"
                        >
                          Download
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
