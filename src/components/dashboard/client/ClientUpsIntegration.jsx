import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ExternalLink, FileArchive, FileSpreadsheet, Loader2, PackagePlus, RefreshCw, Truck, Unplug, AlertTriangle } from 'lucide-react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { supabase, supabaseHelpers } from '@/config/supabase';

const INITIAL_LABEL_FORM = {
  externalOrderId: '',
  serviceCode: '11',
  paymentType: 'BillShipper',
  packageWeightKg: '1',
  packageLengthCm: '',
  packageWidthCm: '',
  packageHeightCm: '',
  fromName: '',
  fromAddress1: '',
  fromCity: '',
  fromPostalCode: '',
  fromCountry: 'FR',
  toName: '',
  toAddress1: '',
  toCity: '',
  toPostalCode: '',
  toCountry: 'FR'
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const sanitizeFilePart = (value) =>
  String(value || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

export default function ClientUpsIntegration({ user, profile }) {
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [connectAccountNumber, setConnectAccountNumber] = useState('');
  const [connectAccountLabel, setConnectAccountLabel] = useState('');
  const [labelForm, setLabelForm] = useState(INITIAL_LABEL_FORM);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [postalWarning, setPostalWarning] = useState('');
  const [downloadingZip, setDownloadingZip] = useState(false);

  const hasUpsOauthConfig = Boolean(import.meta.env.VITE_UPS_CLIENT_ID) && Boolean(import.meta.env.VITE_UPS_REDIRECT_URI);

  const effectiveCompanyId = useMemo(
    () => profile?.company_id || profile?.companyId || user?.id || null,
    [profile?.company_id, profile?.companyId, user?.id]
  );

  const isConnected = integration?.status === 'connected' || integration?.status === 'active';

  const setSuccess = (message) => {
    setFlash(message);
    setFlashType('success');
  };

  const setError = (message) => {
    setFlash(message);
    setFlashType('error');
  };

  const loadIntegration = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabaseHelpers.getUpsIntegrationForUser(user.id);
    if (error) {
      setIntegration(null);
      setError(error.message || 'Nu am putut încărca integrarea UPS.');
    } else {
      setIntegration(data || null);
      if (data?.ups_account_number) {
        setConnectAccountNumber(data.ups_account_number);
      }
      if (data?.account_label) {
        setConnectAccountLabel(data.account_label);
      }
    }
    setLoading(false);
  };

  const loadOrders = async () => {
    if (!user?.id) return;
    setOrdersLoading(true);
    const { data, error } = await supabaseHelpers.listUpsShippingOrders({ userId: user.id, limit: 100 });
    if (!error) {
      setOrders(data || []);
    }
    setOrdersLoading(false);
  };

  const loadInvoices = async () => {
    if (!user?.id) return;
    setInvoicesLoading(true);
    const { data, error } = await supabaseHelpers.listUpsInvoiceFiles({ userId: user.id, limit: 300 });
    if (!error) {
      setInvoices(data || []);
    }
    setInvoicesLoading(false);
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadIntegration(), loadOrders(), loadInvoices()]);
    setRefreshing(false);
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleConnectUps = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    const account = connectAccountNumber.trim();
    if (!account) {
      setError('UPS account number este obligatoriu.');
      return;
    }

    setSaving(true);
    setFlash('');

    const payload = {
      id: integration?.id,
      user_id: user.id,
      company_id: effectiveCompanyId,
      status: 'connected',
      ups_account_number: account,
      account_label: connectAccountLabel.trim() || null,
      connected_at: integration?.connected_at || new Date().toISOString(),
      metadata: {
        oauth_configured: hasUpsOauthConfig,
        connected_from: 'client-dashboard'
      },
      last_error: null
    };

    const { data, error } = await supabaseHelpers.upsertUpsIntegration(payload);
    if (error) {
      setError(error.message || 'Conectarea UPS a eșuat.');
    } else {
      setIntegration(data);
      setSuccess('Integrarea UPS a fost salvată. Poți crea etichete din platformă.');
    }
    setSaving(false);
  };

  const handleDisconnectUps = async () => {
    if (!integration?.id) return;
    if (!window.confirm('Confirmi deconectarea UPS pentru acest cont?')) return;
    const { data, error } = await supabaseHelpers.upsertUpsIntegration({
      ...integration,
      status: 'disconnected',
      last_error: null
    });
    if (error) {
      setError(error.message || 'Nu am putut deconecta integrarea UPS.');
      return;
    }
    setIntegration(data || null);
    setSuccess('UPS a fost deconectat. Cardul UPS este ascuns până la reconectare.');
  };

  const validatePostalCodes = async () => {
    const checks = [
      {
        country: String(labelForm.fromCountry || '').toUpperCase(),
        postal: String(labelForm.fromPostalCode || '').trim(),
        kind: 'expediere'
      },
      {
        country: String(labelForm.toCountry || '').toUpperCase(),
        postal: String(labelForm.toPostalCode || '').trim(),
        kind: 'livrare'
      }
    ].filter((entry) => entry.country && entry.postal);

    if (!checks.length) {
      setPostalWarning('');
      return true;
    }

    const countries = [...new Set(checks.map((entry) => entry.country))];
    const postals = [...new Set(checks.map((entry) => entry.postal))];
    const { data, error } = await supabase
      .from('ups_postal_codes')
      .select('country_code, postal_code, is_serviceable')
      .in('country_code', countries)
      .in('postal_code', postals);

    if (error) {
      setPostalWarning('Nu am putut valida codurile poștale UPS. Continui cu procesarea.');
      return true;
    }

    const set = new Set(
      (data || [])
        .filter((row) => row.is_serviceable !== false)
        .map((row) => `${String(row.country_code || '').toUpperCase()}::${String(row.postal_code || '').trim()}`)
    );

    const missing = checks.filter((entry) => !set.has(`${entry.country}::${entry.postal}`));
    if (missing.length) {
      const message = `Atenție: codurile UPS nu sunt încă în cache pentru ${missing
        .map((entry) => `${entry.kind} ${entry.country}-${entry.postal}`)
        .join(', ')}.`;
      setPostalWarning(message);
    } else {
      setPostalWarning('');
    }
    return true;
  };

  const submitShippingLabel = async (event) => {
    event.preventDefault();
    if (!integration?.id || !user?.id) return;

    setCreatingLabel(true);
    setFlash('');
    await validatePostalCodes();

    const orderPayload = {
      integration_id: integration.id,
      user_id: user.id,
      company_id: effectiveCompanyId,
      external_order_id: labelForm.externalOrderId.trim() || null,
      status: 'pending',
      service_code: labelForm.serviceCode.trim() || null,
      payment_type: labelForm.paymentType,
      ship_from: {
        name: labelForm.fromName,
        address1: labelForm.fromAddress1,
        city: labelForm.fromCity,
        postal_code: labelForm.fromPostalCode,
        country_code: String(labelForm.fromCountry || '').toUpperCase()
      },
      ship_to: {
        name: labelForm.toName,
        address1: labelForm.toAddress1,
        city: labelForm.toCity,
        postal_code: labelForm.toPostalCode,
        country_code: String(labelForm.toCountry || '').toUpperCase()
      },
      package_data: {
        weight_kg: Number(labelForm.packageWeightKg || 0),
        length_cm: Number(labelForm.packageLengthCm || 0),
        width_cm: Number(labelForm.packageWidthCm || 0),
        height_cm: Number(labelForm.packageHeightCm || 0)
      },
      request_payload: {
        source: 'dashboard',
        created_at: new Date().toISOString()
      }
    };

    const created = await supabaseHelpers.createUpsShippingOrder(orderPayload);
    if (created.error || !created.data) {
      setError(created.error?.message || 'Nu am putut salva comanda UPS.');
      setCreatingLabel(false);
      return;
    }

    const processResult = await supabaseHelpers.processUpsShippingLabel({
      order_id: created.data.id,
      integration_id: integration.id
    });

    if (processResult.error) {
      await supabaseHelpers.updateUpsShippingOrder(created.data.id, {
        status: 'error',
        last_error: processResult.error.message || 'UPS label processing failed.'
      });
      setError(
        `Comanda UPS a fost salvată, dar generarea etichetei a eșuat. Activează funcția Supabase \"ups-create-label\".`
      );
    } else {
      setSuccess('Cererea UPS a fost trimisă. Eticheta va apărea după procesare.');
      setLabelForm(INITIAL_LABEL_FORM);
    }

    setCreatingLabel(false);
    await Promise.all([loadOrders(), loadInvoices(), loadIntegration()]);
  };

  const downloadLabel = async (row) => {
    if (!row?.label_file_path) return;
    const { data, error } = await supabaseHelpers.downloadUpsDocument(row.label_file_path);
    if (error || !data) {
      setError(error?.message || 'Nu am putut descărca eticheta UPS.');
      return;
    }
    saveAs(data, `${sanitizeFilePart(row.external_order_id || row.id)}-ups-label.pdf`);
  };

  const exportInvoicesXlsx = async () => {
    const XLSX = await import('xlsx');
    const rows = [
      ['Invoice', 'Date', 'Order', 'Currency', 'Amount', 'Status', 'File']
    ];
    invoices.forEach((inv) => {
      rows.push([
        inv.invoice_number || '',
        inv.invoice_date || '',
        inv.order_id || '',
        inv.currency || '',
        inv.amount_total != null ? Number(inv.amount_total).toFixed(2) : '',
        inv.status || '',
        inv.file_name || inv.file_path || ''
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'UPS Invoices');
    XLSX.writeFile(wb, `ups-invoices-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportInvoicesCsv = () => {
    const lines = [
      ['invoice_number', 'invoice_date', 'order_id', 'currency', 'amount_total', 'status', 'file_name']
    ];
    invoices.forEach((inv) => {
      lines.push([
        inv.invoice_number || '',
        inv.invoice_date || '',
        inv.order_id || '',
        inv.currency || '',
        inv.amount_total ?? '',
        inv.status || '',
        inv.file_name || inv.file_path || ''
      ]);
    });
    const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `ups-invoices-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportInvoicesZip = async () => {
    const files = invoices.filter((inv) => inv.file_path);
    if (!files.length) {
      setError('Nu există facturi UPS cu fișiere atașate.');
      return;
    }
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      for (const inv of files) {
        const { data, error } = await supabaseHelpers.downloadUpsDocument(inv.file_path);
        if (error || !data) continue;
        const fileName = `${sanitizeFilePart(inv.invoice_number || inv.id)}-${sanitizeFilePart(inv.file_name || 'invoice.pdf')}`;
        zip.file(fileName, data);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `ups-invoices-${new Date().toISOString().slice(0, 10)}.zip`);
    } finally {
      setDownloadingZip(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă integrarea UPS...
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">UPS Connect</h2>
            <p className="text-sm text-text-secondary">
              Conectează contul UPS pentru generare etichete și management facturi în platformă.
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {!hasUpsOauthConfig && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            Configurare OAuth UPS incompletă: setează `VITE_UPS_CLIENT_ID` și `VITE_UPS_REDIRECT_URI`.
          </div>
        )}

        <form onSubmit={handleConnectUps} className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">UPS Account Number</span>
            <input
              value={connectAccountNumber}
              onChange={(event) => setConnectAccountNumber(event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="ex: 1AB234"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-text-secondary">Account Label (opțional)</span>
            <input
              value={connectAccountLabel}
              onChange={(event) => setConnectAccountLabel(event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Main UPS account"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} {isConnected ? 'Update UPS' : 'Connect UPS'}
            </button>
            {!!import.meta.env.VITE_UPS_REDIRECT_URI && (
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border"
                onClick={() => window.open(import.meta.env.VITE_UPS_REDIRECT_URI, '_blank', 'noopener')}
              >
                <ExternalLink className="w-4 h-4" /> OAuth URL
              </button>
            )}
          </div>
        </form>

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
      </section>

      {isConnected && (
        <section className="bg-white border rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">UPS</h2>
              <p className="text-sm text-text-secondary">
                Cont conectat: <span className="font-medium">{integration?.ups_account_number || '-'}</span>
              </p>
              <p className="text-xs text-text-secondary">Conectat la: {formatDateTime(integration?.connected_at)}</p>
            </div>
            <button
              onClick={handleDisconnectUps}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500 text-red-600 hover:bg-red-50"
            >
              <Unplug className="w-4 h-4" /> Disconnect UPS
            </button>
          </div>

          <div className="border rounded-xl p-4 space-y-4">
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <PackagePlus className="w-4 h-4" /> Create Shipping Label
            </h3>
            <form onSubmit={submitShippingLabel} className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">Order Ref</span>
                <input
                  value={labelForm.externalOrderId}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, externalOrderId: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="ORDER-1001"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">Service Code</span>
                <input
                  value={labelForm.serviceCode}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, serviceCode: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="11"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">Payment Type</span>
                <select
                  value={labelForm.paymentType}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, paymentType: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="BillShipper">BillShipper</option>
                  <option value="BillReceiver">BillReceiver</option>
                  <option value="BillThirdParty">BillThirdParty</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-text-secondary">From Name</span>
                <input
                  value={labelForm.fromName}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, fromName: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-text-secondary">From Address</span>
                <input
                  value={labelForm.fromAddress1}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, fromAddress1: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">From City</span>
                <input
                  value={labelForm.fromCity}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, fromCity: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">From Postal</span>
                <input
                  value={labelForm.fromPostalCode}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, fromPostalCode: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">From Country</span>
                <input
                  value={labelForm.fromCountry}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, fromCountry: event.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-text-secondary">To Name</span>
                <input
                  value={labelForm.toName}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, toName: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-text-secondary">To Address</span>
                <input
                  value={labelForm.toAddress1}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, toAddress1: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">To City</span>
                <input
                  value={labelForm.toCity}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, toCity: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">To Postal</span>
                <input
                  value={labelForm.toPostalCode}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, toPostalCode: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">To Country</span>
                <input
                  value={labelForm.toCountry}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, toCountry: event.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-text-secondary">Weight (kg)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={labelForm.packageWeightKg}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, packageWeightKg: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">Length (cm)</span>
                <input
                  type="number"
                  min="0"
                  value={labelForm.packageLengthCm}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, packageLengthCm: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">Width (cm)</span>
                <input
                  type="number"
                  min="0"
                  value={labelForm.packageWidthCm}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, packageWidthCm: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-secondary">Height (cm)</span>
                <input
                  type="number"
                  min="0"
                  value={labelForm.packageHeightCm}
                  onChange={(event) => setLabelForm((prev) => ({ ...prev, packageHeightCm: event.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </label>

              <div className="md:col-span-3 flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creatingLabel}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
                >
                  {creatingLabel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />} Process UPS label
                </button>
                {postalWarning && (
                  <span className="text-xs text-amber-700 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {postalWarning}
                  </span>
                )}
              </div>
            </form>
          </div>

          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-text-primary">UPS Orders / Labels</h3>
              <button onClick={loadOrders} className="text-sm inline-flex items-center gap-1 border rounded-lg px-2 py-1">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
            {ordersLoading ? (
              <div className="text-sm text-text-secondary flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă comenzile UPS...
              </div>
            ) : orders.length === 0 ? (
              <div className="text-sm text-text-secondary">Nu există comenzi UPS încă.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-text-secondary text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Order</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Tracking</th>
                      <th className="px-3 py-2 text-left">Charge</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2 text-left">Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">{row.external_order_id || row.id}</td>
                        <td className="px-3 py-2">{row.status || '-'}</td>
                        <td className="px-3 py-2">{row.tracking_number || '-'}</td>
                        <td className="px-3 py-2">
                          {row.total_charge != null ? `${Number(row.total_charge).toFixed(2)} ${row.currency || 'EUR'}` : '-'}
                        </td>
                        <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
                        <td className="px-3 py-2">
                          {row.label_file_path ? (
                            <button
                              onClick={() => downloadLabel(row)}
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
          </div>

          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-text-primary">UPS Invoices</h3>
              <div className="flex items-center gap-2">
                <button onClick={loadInvoices} className="text-sm inline-flex items-center gap-1 border rounded-lg px-2 py-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
                <button onClick={exportInvoicesCsv} className="text-sm inline-flex items-center gap-1 border rounded-lg px-2 py-1">
                  CSV
                </button>
                <button onClick={exportInvoicesXlsx} className="text-sm inline-flex items-center gap-1 border rounded-lg px-2 py-1">
                  <FileSpreadsheet className="w-3 h-3" /> XLS
                </button>
                <button
                  onClick={exportInvoicesZip}
                  disabled={downloadingZip}
                  className="text-sm inline-flex items-center gap-1 border rounded-lg px-2 py-1 disabled:opacity-60"
                >
                  {downloadingZip ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileArchive className="w-3 h-3" />} ZIP
                </button>
              </div>
            </div>
            {invoicesLoading ? (
              <div className="text-sm text-text-secondary flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Se încarcă facturile UPS...
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-sm text-text-secondary">Nu există facturi UPS atașate.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-text-secondary text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Invoice</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Order</th>
                      <th className="px-3 py-2 text-left">Amount</th>
                      <th className="px-3 py-2 text-left">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-t">
                        <td className="px-3 py-2">{inv.invoice_number || inv.id}</td>
                        <td className="px-3 py-2">{inv.invoice_date || '-'}</td>
                        <td className="px-3 py-2">{inv.order_id || '-'}</td>
                        <td className="px-3 py-2">
                          {inv.amount_total != null ? `${Number(inv.amount_total).toFixed(2)} ${inv.currency || 'EUR'}` : '-'}
                        </td>
                        <td className="px-3 py-2">
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
          </div>
        </section>
      )}
    </div>
  );
}
