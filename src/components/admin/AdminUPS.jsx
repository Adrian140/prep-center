import React, { useEffect, useMemo, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [companyNames, setCompanyNames] = useState({});
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');

  const [form, setForm] = useState({
    integration_id: '',
    warehouse_country: 'FR',
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

  const selectedIntegration = form.integration_id ? byIntegrationId[form.integration_id] : null;
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

  useEffect(() => {
    if (!form.integration_id && activeIntegrations[0]?.id) {
      setForm((prev) => ({ ...prev, integration_id: activeIntegrations[0].id }));
    }
  }, [activeIntegrations, form.integration_id]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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

    const integration = byIntegrationId[form.integration_id];
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
          name: selectedWarehouse.name,
          address1: selectedWarehouse.address1,
          city: selectedWarehouse.city,
          postal_code: selectedWarehouse.postal_code,
          country_code: selectedWarehouse.country_code
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

      <section className="bg-white border rounded-xl p-5">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Create UPS order</h3>
        <form onSubmit={handleCreateOrder} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1 lg:col-span-2">
            <span className="text-xs text-text-secondary">Client UPS integration</span>
            <select
              value={form.integration_id}
              onChange={(event) => setField('integration_id', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">Select integration...</option>
              {activeIntegrations.map((row) => (
                <option key={row.id} value={row.id}>
                  {(companyNames[row.company_id] || row.account_label || row.ups_account_number || row.user_id) || row.id}
                  {row.ups_account_number ? ` | ${row.ups_account_number}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Shipping from</span>
            <select
              value={form.warehouse_country}
              onChange={(event) => setField('warehouse_country', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="FR">Prep Center France</option>
              <option value="DE">Prep Center Germany</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Service code</span>
            <select
              value={form.service_code}
              onChange={(event) => setField('service_code', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="11">UPS Standard (11)</option>
              <option value="07">UPS Worldwide Express (07)</option>
              <option value="08">UPS Worldwide Expedited (08)</option>
            </select>
          </label>

          <div className="lg:col-span-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-text-secondary">
            Expeditor presetat: <b>{selectedWarehouse.name}</b>, {selectedWarehouse.address1}, {selectedWarehouse.postal_code} {selectedWarehouse.city}, {selectedWarehouse.country_code}
          </div>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Order reference (optional)</span>
            <input
              value={form.external_order_id}
              onChange={(event) => setField('external_order_id', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="PC-UPS-2026-001"
            />
          </label>

          <label className="space-y-1 lg:col-span-2">
            <span className="text-xs text-text-secondary">Destination name</span>
            <input
              value={form.destination_name}
              onChange={(event) => setField('destination_name', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </label>

          <label className="space-y-1 lg:col-span-1">
            <span className="text-xs text-text-secondary">Promo code (optional)</span>
            <input
              value={form.promo_code}
              onChange={(event) => setField('promo_code', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="UPS-PROMO"
            />
          </label>

          <label className="space-y-1 lg:col-span-2">
            <span className="text-xs text-text-secondary">Destination address</span>
            <input
              value={form.destination_address1}
              onChange={(event) => setField('destination_address1', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">City</span>
            <input
              value={form.destination_city}
              onChange={(event) => setField('destination_city', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Postal code</span>
            <input
              value={form.destination_postal_code}
              onChange={(event) => setField('destination_postal_code', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Country code</span>
            <input
              value={form.destination_country_code}
              onChange={(event) => setField('destination_country_code', event.target.value.toUpperCase())}
              maxLength={2}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Weight (kg)</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.weight_kg}
              onChange={(event) => setField('weight_kg', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Length (cm)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.length_cm}
              onChange={(event) => setField('length_cm', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Width (cm)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.width_cm}
              onChange={(event) => setField('width_cm', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-text-secondary">Height (cm)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.height_cm}
              onChange={(event) => setField('height_cm', event.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </label>

          <div className="lg:col-span-4">
            <button
              type="submit"
              disabled={creating || !activeIntegrations.length}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
              Create order & buy UPS label
            </button>
            {!activeIntegrations.length && (
              <p className="mt-2 text-xs text-red-600">Nu există integrări UPS active pentru creare comandă.</p>
            )}
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
