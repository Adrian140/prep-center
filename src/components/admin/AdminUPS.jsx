import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Loader2, PlusCircle, RefreshCw } from 'lucide-react';
import { supabase, supabaseHelpers } from '@/config/supabase';

const PREP_WAREHOUSES = {
  FR: {
    name: 'Prep Center France',
    address1: '5 Rue des Enclos, Cellule 7',
    city: 'La Gouesniere',
    postal_code: '35350',
    country_code: 'FR'
  },
  DE: {
    name: 'Prep Center Germany',
    address1: 'Zienestrasse 12',
    city: 'Wolfach',
    postal_code: '77709',
    country_code: 'DE'
  }
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const asNumberOrNull = (value) => {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export default function AdminUPS() {
  const createOrderRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [companyNames, setCompanyNames] = useState({});
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');
  const [openedIntegrationId, setOpenedIntegrationId] = useState('');

  const [form, setForm] = useState({
    integration_id: '',
    warehouse_country: 'FR',
    use_default_sender: true,
    from_name: PREP_WAREHOUSES.FR.name,
    from_address1: PREP_WAREHOUSES.FR.address1,
    from_city: PREP_WAREHOUSES.FR.city,
    from_postal_code: PREP_WAREHOUSES.FR.postal_code,
    from_country_code: PREP_WAREHOUSES.FR.country_code,
    external_order_id: '',
    service_code: '11',
    destination_name: '',
    destination_address1: '',
    destination_city: '',
    destination_postal_code: '',
    destination_country_code: 'FR',
    weight_kg: '1',
    length_cm: '',
    width_cm: '',
    height_cm: '',
    promo_code: ''
  });

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

  const activeIntegrations = useMemo(
    () =>
      integrations.filter((row) => {
        const status = String(row.status || '').toLowerCase();
        return status === 'active' || status === 'connected';
      }),
    [integrations]
  );

  const summary = useMemo(() => {
    const connected = activeIntegrations.length;
    const pendingOrders = orders.filter((row) => String(row.status || '').toLowerCase() === 'pending').length;
    const errors = orders.filter((row) => String(row.status || '').toLowerCase() === 'error').length;
    return {
      integrations: integrations.length,
      connected,
      orders: orders.length,
      pendingOrders,
      errors
    };
  }, [integrations.length, activeIntegrations.length, orders]);

  const selectedIntegration = (openedIntegrationId || form.integration_id) ? byIntegrationId[openedIntegrationId || form.integration_id] : null;
  const selectedWarehouse = PREP_WAREHOUSES[form.warehouse_country] || PREP_WAREHOUSES.FR;

  const loadAll = async () => {
    const [intRes, ordRes] = await Promise.all([
      supabaseHelpers.listUpsIntegrations(),
      supabaseHelpers.listUpsShippingOrders({ limit: 500 })
    ]);

    if (intRes.error) throw intRes.error;
    if (ordRes.error) throw ordRes.error;

    const integrationsData = intRes.data || [];
    const ordersData = ordRes.data || [];

    setIntegrations(integrationsData);
    setOrders(ordersData);

    const companyIds = Array.from(
      new Set([...integrationsData, ...ordersData].map((row) => row?.company_id).filter(Boolean))
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

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!form.use_default_sender) return;
    const wh = PREP_WAREHOUSES[form.warehouse_country] || PREP_WAREHOUSES.FR;
    setForm((prev) => ({
      ...prev,
      from_name: wh.name,
      from_address1: wh.address1,
      from_city: wh.city,
      from_postal_code: wh.postal_code,
      from_country_code: wh.country_code
    }));
  }, [form.warehouse_country, form.use_default_sender]);

  const openIntegrationForCreate = (integrationId) => {
    setOpenedIntegrationId(integrationId);
    setForm((prev) => ({ ...prev, integration_id: integrationId }));
    setTimeout(() => {
      createOrderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const validateDestinationPostalCode = async () => {
    const countryCode = String(form.destination_country_code || '').trim().toUpperCase();
    const postalCode = String(form.destination_postal_code || '').trim();
    if (!countryCode || !postalCode) return { ok: true };

    const { count, error: countryCountError } = await supabase
      .from('ups_postal_codes')
      .select('id', { count: 'exact', head: true })
      .eq('country_code', countryCode);

    if (countryCountError) {
      return { ok: false, message: 'Nu am putut valida codul poștal UPS (eroare locală).' };
    }

    // If local cache exists for this country, enforce exact postal code check.
    if ((count || 0) > 0) {
      const postalRes = await supabaseHelpers.listUpsPostalCodes({ countryCode, postalCode });
      if (postalRes.error) {
        return { ok: false, message: 'Nu am putut valida codul poștal UPS.' };
      }
      if (!postalRes.data?.length) {
        return { ok: false, message: `Codul poștal ${postalCode} (${countryCode}) nu există în cache-ul UPS local.` };
      }
    }

    return { ok: true };
  };

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setFlash('');

    const integration = byIntegrationId[openedIntegrationId || form.integration_id];
    if (!integration) {
      setError('Selectează un cont UPS conectat.');
      return;
    }
    if (!integration.ups_account_number) {
      setError('Contul UPS selectat nu are UPS Account Number setat.');
      return;
    }
    if (!form.destination_name || !form.destination_address1 || !form.destination_city || !form.destination_postal_code) {
      setError('Completează adresa de destinație (nume, adresă, oraș, cod poștal).');
      return;
    }

    const postalCheck = await validateDestinationPostalCode();
    if (!postalCheck.ok) {
      setError(postalCheck.message);
      return;
    }

    setCreating(true);
    try {
      const externalOrderId =
        String(form.external_order_id || '').trim() ||
        `UPS-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const createRes = await supabaseHelpers.createUpsShippingOrder({
        integration_id: integration.id,
        user_id: integration.user_id,
        company_id: integration.company_id || integration.user_id,
        external_order_id: externalOrderId,
        status: 'pending',
        service_code: form.service_code || '11',
        packaging_type: '02',
        payment_type: 'BillShipper',
        currency: 'EUR',
        ship_from: {
          name: String(form.from_name || '').trim(),
          address1: String(form.from_address1 || '').trim(),
          city: String(form.from_city || '').trim(),
          postal_code: String(form.from_postal_code || '').trim(),
          country_code: String(form.from_country_code || 'FR').trim().toUpperCase()
        },
        ship_to: {
          name: String(form.destination_name || '').trim(),
          address1: String(form.destination_address1 || '').trim(),
          city: String(form.destination_city || '').trim(),
          postal_code: String(form.destination_postal_code || '').trim(),
          country_code: String(form.destination_country_code || 'FR').trim().toUpperCase()
        },
        package_data: {
          weight_kg: asNumberOrNull(form.weight_kg) || 1,
          length_cm: asNumberOrNull(form.length_cm),
          width_cm: asNumberOrNull(form.width_cm),
          height_cm: asNumberOrNull(form.height_cm),
          promo_code: String(form.promo_code || '').trim() || null
        },
        request_payload: {
          created_from: 'admin-ups-order-form',
          promo_code: String(form.promo_code || '').trim() || null
        }
      });

      if (createRes.error || !createRes.data?.id) {
        throw createRes.error || new Error('Nu am putut crea comanda UPS.');
      }

      const labelRes = await supabaseHelpers.processUpsShippingLabel({
        order_id: createRes.data.id,
        integration_id: integration.id
      });

      const labelError = labelRes.error || labelRes.data?.error;
      if (labelError) {
        throw new Error(typeof labelError === 'string' ? labelError : labelError.message || 'UPS label creation failed.');
      }

      setSuccess(`Comanda UPS a fost creată. Tracking: ${labelRes.data?.tracking_number || '-'}`);
      setForm((prev) => ({
        ...prev,
        use_default_sender: true,
        from_name: selectedWarehouse.name,
        from_address1: selectedWarehouse.address1,
        from_city: selectedWarehouse.city,
        from_postal_code: selectedWarehouse.postal_code,
        from_country_code: selectedWarehouse.country_code,
        external_order_id: '',
        destination_name: '',
        destination_address1: '',
        destination_city: '',
        destination_postal_code: '',
        destination_country_code: 'FR',
        weight_kg: '1',
        length_cm: '',
        width_cm: '',
        height_cm: '',
        promo_code: ''
      }));
      await refresh();
    } catch (error) {
      setError(error.message || 'Nu am putut crea comanda UPS.');
    } finally {
      setCreating(false);
    }
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
            Management integrare UPS și generare etichete direct din admin.
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

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
      </div>

      <section ref={createOrderRef} className="bg-white border rounded-xl p-5">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Create UPS order</h3>
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            {selectedIntegration
              ? `Opened client: ${companyNames[selectedIntegration.company_id] || selectedIntegration.account_label || selectedIntegration.user_id || '-'}${selectedIntegration.ups_account_number ? ` | ${selectedIntegration.ups_account_number}` : ''}`
              : 'Select Open from Connected accounts first'}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-text-primary">From (Warehouse)</h4>
                    <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={Boolean(form.use_default_sender)}
                        onChange={(event) => setField('use_default_sender', event.target.checked)}
                      />
                      Use default
                    </label>
                  </div>
                  <label className="space-y-1 block">
                    <span className="text-xs text-text-secondary">Warehouse preset</span>
                    <select
                      value={form.warehouse_country}
                      onChange={(event) => setField('warehouse_country', event.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="FR">Prep Center France</option>
                      <option value="DE">Prep Center Germany</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input disabled={Boolean(form.use_default_sender)} value={form.from_name} onChange={(e) => setField('from_name', e.target.value)} className="px-3 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500" placeholder="From name" />
                    <input disabled={Boolean(form.use_default_sender)} value={form.from_country_code} maxLength={2} onChange={(e) => setField('from_country_code', e.target.value.toUpperCase())} className="px-3 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500" placeholder="Country" />
                    <input disabled={Boolean(form.use_default_sender)} value={form.from_address1} onChange={(e) => setField('from_address1', e.target.value)} className="px-3 py-2 border rounded-lg md:col-span-2 disabled:bg-gray-100 disabled:text-gray-500" placeholder="Address" />
                    <input disabled={Boolean(form.use_default_sender)} value={form.from_city} onChange={(e) => setField('from_city', e.target.value)} className="px-3 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500" placeholder="City" />
                    <input disabled={Boolean(form.use_default_sender)} value={form.from_postal_code} onChange={(e) => setField('from_postal_code', e.target.value)} className="px-3 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500" placeholder="Postal code" />
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-semibold text-text-primary">To (Destination)</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <input value={form.destination_name} onChange={(e) => setField('destination_name', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Destination name" required />
                    <input value={form.destination_address1} onChange={(e) => setField('destination_address1', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Destination address" required />
                    <div className="grid grid-cols-3 gap-2">
                      <input value={form.destination_city} onChange={(e) => setField('destination_city', e.target.value)} className="px-3 py-2 border rounded-lg col-span-2" placeholder="City" required />
                      <input value={form.destination_country_code} maxLength={2} onChange={(e) => setField('destination_country_code', e.target.value.toUpperCase())} className="px-3 py-2 border rounded-lg" placeholder="CC" required />
                    </div>
                    <input value={form.destination_postal_code} onChange={(e) => setField('destination_postal_code', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Postal code" required />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <h4 className="font-semibold text-text-primary mb-3">Parcel & service</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
                  <input value={form.external_order_id} onChange={(e) => setField('external_order_id', e.target.value)} className="px-3 py-2 border rounded-lg lg:col-span-2" placeholder="Order reference (optional)" />
                  <select value={form.service_code} onChange={(e) => setField('service_code', e.target.value)} className="px-3 py-2 border rounded-lg">
                    <option value="11">UPS Standard (11)</option>
                    <option value="07">UPS Worldwide Express (07)</option>
                    <option value="08">UPS Worldwide Expedited (08)</option>
                  </select>
                  <input value={form.promo_code} onChange={(e) => setField('promo_code', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Promo code" />
                  <input type="number" min="0.01" step="0.01" value={form.weight_kg} onChange={(e) => setField('weight_kg', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Weight kg" required />
                  <input type="number" min="0" step="0.1" value={form.length_cm} onChange={(e) => setField('length_cm', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Length cm" />
                  <input type="number" min="0" step="0.1" value={form.width_cm} onChange={(e) => setField('width_cm', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Width cm" />
                  <input type="number" min="0" step="0.1" value={form.height_cm} onChange={(e) => setField('height_cm', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Height cm" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 h-fit">
              <h4 className="font-semibold text-text-primary mb-3">Summary</h4>
              <div className="text-sm text-text-secondary space-y-2">
                <div><b>From:</b> {form.from_postal_code} {form.from_city}, {form.from_country_code}</div>
                <div><b>To:</b> {form.destination_postal_code || '-'} {form.destination_city || '-'}, {form.destination_country_code || '-'}</div>
                <div><b>Parcel:</b> {form.weight_kg || '0'} kg, {form.length_cm || 0} x {form.width_cm || 0} x {form.height_cm || 0} cm</div>
                <div><b>Promo:</b> {form.promo_code || '-'}</div>
              </div>
              <button
                type="submit"
                disabled={creating || !activeIntegrations.length || !selectedIntegration}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                Save & Buy Label
              </button>
              {!selectedIntegration && <p className="mt-2 text-xs text-red-600">Apasă Open pe clientul dorit.</p>}
            </div>
          </div>
        </form>
      </section>

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
                  <th className="px-4 py-3 text-left">Open</th>
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openIntegrationForCreate(row.id)}
                        className="px-2.5 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
                      >
                        Open
                      </button>
                    </td>
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
                  <th className="px-4 py-3 text-left">Destination</th>
                  <th className="px-4 py-3 text-left">Promo</th>
                  <th className="px-4 py-3 text-left">Charge</th>
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
                      {row.ship_to?.postal_code || '-'} {row.ship_to?.city || ''} {row.ship_to?.country_code || ''}
                    </td>
                    <td className="px-4 py-3">{row.package_data?.promo_code || '-'}</td>
                    <td className="px-4 py-3">
                      {row.total_charge != null ? `${Number(row.total_charge).toFixed(2)} ${row.currency || 'EUR'}` : '-'}
                    </td>
                    <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
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
