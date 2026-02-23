import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, PlusCircle, RefreshCw, X } from 'lucide-react';
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

const buildInitialForm = () => ({
  integration_id: '',
  warehouse_country: 'FR',
  use_default_sender: true,
  from_name: PREP_WAREHOUSES.FR.name,
  from_address1: PREP_WAREHOUSES.FR.address1,
  from_city: PREP_WAREHOUSES.FR.city,
  from_postal_code: PREP_WAREHOUSES.FR.postal_code,
  from_country_code: PREP_WAREHOUSES.FR.country_code,
  reference_code: '',
  service_code: '11',
  packaging_type: '02',
  shipment_description: '',
  delivery_confirmation: '',
  saturday_delivery: false,
  declared_value: '',
  declared_currency: 'EUR',
  promo_code: '',
  destination_name: '',
  destination_address1: '',
  destination_city: '',
  destination_postal_code: '',
  destination_country_code: 'FR',
  weight_kg: '',
  length_cm: '',
  width_cm: '',
  height_cm: ''
});

export default function AdminUPS() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [companyNames, setCompanyNames] = useState({});
  const [flash, setFlash] = useState('');
  const [flashType, setFlashType] = useState('error');
  const [openedIntegrationId, setOpenedIntegrationId] = useState('');
  const [isClientWindowOpen, setIsClientWindowOpen] = useState(false);
  const [countryOptions, setCountryOptions] = useState(['FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'AT', 'PL', 'CZ']);
  const [postalSuggestions, setPostalSuggestions] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [form, setForm] = useState(buildInitialForm());

  const setSuccess = (message) => {
    setFlash(message);
    setFlashType('success');
  };

  const setError = (message) => {
    setFlash(message);
    setFlashType('error');
  };

  const byIntegrationId = useMemo(
    () => integrations.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
    [integrations]
  );

  const selectedIntegration = openedIntegrationId ? byIntegrationId[openedIntegrationId] : null;
  const selectedWarehouse = PREP_WAREHOUSES[form.warehouse_country] || PREP_WAREHOUSES.FR;

  const clientOrders = useMemo(() => {
    if (!selectedIntegration) return [];
    return orders.filter((row) => row.integration_id === selectedIntegration.id);
  }, [orders, selectedIntegration]);

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

    const companyIds = Array.from(new Set([...integrationsData, ...ordersData].map((row) => row?.company_id).filter(Boolean)));
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
        const label = String(row?.name || '').trim();
        if (row?.id && label) names[row.id] = label;
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

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const syncCityFromPostal = () => {
    const postal = String(form.destination_postal_code || '').trim();
    if (!postal) return;
    const match = postalSuggestions.find((row) => String(row.postal_code || '').trim() === postal);
    if (match?.city && !form.destination_city) {
      setForm((prev) => ({ ...prev, destination_city: String(match.city).trim() }));
    }
  };

  const syncPostalFromCity = () => {
    const city = String(form.destination_city || '').trim().toLowerCase();
    if (!city) return;
    const match = citySuggestions.find((row) => String(row.city || '').trim().toLowerCase() === city);
    if (match?.postal_code && !form.destination_postal_code) {
      setForm((prev) => ({ ...prev, destination_postal_code: String(match.postal_code).trim() }));
    }
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

  useEffect(() => {
    if (!isClientWindowOpen) return;
    (async () => {
      const { data } = await supabaseHelpers.listUpsPostalCountries();
      if (Array.isArray(data) && data.length) setCountryOptions(data);
    })();
  }, [isClientWindowOpen]);

  useEffect(() => {
    if (!isClientWindowOpen) return;
    const countryCode = String(form.destination_country_code || '').trim().toUpperCase();
    const postalPrefix = String(form.destination_postal_code || '').trim();
    if (!countryCode || postalPrefix.length < 2) {
      setPostalSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabaseHelpers.searchUpsPostalCodes({ countryCode, postalPrefix, limit: 30 });
      setPostalSuggestions(Array.isArray(data) ? data : []);
    }, 180);
    return () => clearTimeout(t);
  }, [isClientWindowOpen, form.destination_country_code, form.destination_postal_code]);

  useEffect(() => {
    if (!isClientWindowOpen) return;
    const countryCode = String(form.destination_country_code || '').trim().toUpperCase();
    const cityPrefix = String(form.destination_city || '').trim();
    if (!countryCode || cityPrefix.length < 2) {
      setCitySuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabaseHelpers.searchUpsPostalCodes({ countryCode, cityPrefix, limit: 30 });
      const unique = [];
      const seen = new Set();
      (data || []).forEach((row) => {
        const city = String(row.city || '').trim();
        if (!city) return;
        const key = `${city.toLowerCase()}|${row.postal_code || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(row);
      });
      setCitySuggestions(unique);
    }, 180);
    return () => clearTimeout(t);
  }, [isClientWindowOpen, form.destination_country_code, form.destination_city]);

  const openIntegrationForCreate = (integrationId) => {
    const integration = byIntegrationId[integrationId];
    if (!integration) return;
    setOpenedIntegrationId(integrationId);
    setForm((prev) => ({ ...buildInitialForm(), integration_id: integrationId, warehouse_country: prev.warehouse_country }));
    setIsClientWindowOpen(true);
  };

  const closeClientWindow = () => {
    setIsClientWindowOpen(false);
    setOpenedIntegrationId('');
  };

  const validateDestinationPostalCode = async () => {
    const countryCode = String(form.destination_country_code || '').trim().toUpperCase();
    const postalCode = String(form.destination_postal_code || '').trim();
    if (!countryCode || !postalCode) return { ok: true };

    const { count, error: countryCountError } = await supabase
      .from('ups_postal_codes')
      .select('id', { count: 'exact', head: true })
      .eq('country_code', countryCode);
    if (countryCountError) return { ok: false, message: 'Nu am putut valida codul poștal UPS (eroare locală).' };

    if ((count || 0) > 0) {
      const postalRes = await supabaseHelpers.listUpsPostalCodes({ countryCode, postalCode });
      if (postalRes.error) return { ok: false, message: 'Nu am putut valida codul poștal UPS.' };
      if (!postalRes.data?.length) {
        return { ok: false, message: `Codul poștal ${postalCode} (${countryCode}) nu există în cache-ul UPS local.` };
      }
    }
    return { ok: true };
  };

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setFlash('');

    if (!selectedIntegration) {
      setError('Deschide mai întâi clientul pentru care creezi eticheta.');
      return;
    }
    if (!selectedIntegration.ups_account_number) {
      setError('Contul UPS al clientului nu are UPS Account Number.');
      return;
    }

    if (!form.destination_name || !form.destination_address1 || !form.destination_city || !form.destination_postal_code) {
      setError('Completează adresa de destinație (nume, adresă, oraș, cod poștal).');
      return;
    }
    const weight = asNumberOrNull(form.weight_kg);
    if (!weight || weight <= 0) {
      setError('Completează greutatea coletului (kg).');
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
        String(form.reference_code || '').trim() ||
        `UPS-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const createRes = await supabaseHelpers.createUpsShippingOrder({
        integration_id: selectedIntegration.id,
        user_id: selectedIntegration.user_id,
        company_id: selectedIntegration.company_id || selectedIntegration.user_id,
        external_order_id: externalOrderId,
        status: 'pending',
        service_code: form.service_code || '11',
        packaging_type: form.packaging_type || '02',
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
          weight_kg: weight,
          length_cm: asNumberOrNull(form.length_cm),
          width_cm: asNumberOrNull(form.width_cm),
          height_cm: asNumberOrNull(form.height_cm),
          promo_code: String(form.promo_code || '').trim() || null,
          reference_code: String(form.reference_code || '').trim() || null,
          shipment_description: String(form.shipment_description || '').trim() || null,
          delivery_confirmation: String(form.delivery_confirmation || '').trim() || null,
          saturday_delivery: Boolean(form.saturday_delivery),
          declared_value: asNumberOrNull(form.declared_value),
          declared_currency: String(form.declared_currency || 'EUR').trim().toUpperCase()
        },
        request_payload: {
          created_from: 'admin-ups-client-window',
          promo_code: String(form.promo_code || '').trim() || null,
          reference_code: String(form.reference_code || '').trim() || null
        }
      });

      if (createRes.error || !createRes.data?.id) {
        throw createRes.error || new Error('Nu am putut crea comanda UPS.');
      }

      const labelRes = await supabaseHelpers.processUpsShippingLabel({
        order_id: createRes.data.id,
        integration_id: selectedIntegration.id
      });

      const labelError = labelRes.error || labelRes.data?.error;
      if (labelError) {
        throw new Error(typeof labelError === 'string' ? labelError : labelError.message || 'UPS label creation failed.');
      }

      setSuccess(`Eticheta UPS a fost creată pentru client. Tracking: ${labelRes.data?.tracking_number || '-'}`);
      setForm((prev) => ({
        ...prev,
        reference_code: '',
        destination_name: '',
        destination_address1: '',
        destination_city: '',
        destination_postal_code: '',
        destination_country_code: 'FR',
        weight_kg: '',
        length_cm: '',
        width_cm: '',
        height_cm: '',
        promo_code: '',
        shipment_description: '',
        delivery_confirmation: '',
        saturday_delivery: false,
        declared_value: '',
        declared_currency: 'EUR'
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
          <p className="text-sm text-text-secondary">Clienți care au conectat UPS.</p>
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

      <section className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-text-primary">Connected accounts</h3>
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

      {isClientWindowOpen && selectedIntegration && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] p-4 md:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-xl border p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-semibold text-text-primary">UPS Client Window</h3>
                <p className="text-sm text-text-secondary mt-1">
                  {companyNames[selectedIntegration.company_id] || selectedIntegration.account_label || selectedIntegration.user_id}
                  {selectedIntegration.ups_account_number ? ` | ${selectedIntegration.ups_account_number}` : ''}
                </p>
              </div>
              <button onClick={closeClientWindow} className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm">
                <X className="w-4 h-4" /> Close
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
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
                        <input
                          list="ups-country-codes"
                          disabled={Boolean(form.use_default_sender)}
                          value={form.from_country_code}
                          maxLength={2}
                          onChange={(e) => setField('from_country_code', e.target.value.toUpperCase())}
                          className="px-3 py-2 border rounded-lg disabled:bg-gray-100 disabled:text-gray-500"
                          placeholder="Country"
                        />
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
                          <input
                            list="ups-city-suggestions"
                            value={form.destination_city}
                            onChange={(e) => setField('destination_city', e.target.value)}
                            onBlur={syncPostalFromCity}
                            className="px-3 py-2 border rounded-lg col-span-2"
                            placeholder="City"
                            required
                          />
                          <input
                            list="ups-country-codes"
                            value={form.destination_country_code}
                            maxLength={2}
                            onChange={(e) => setField('destination_country_code', e.target.value.toUpperCase())}
                            className="px-3 py-2 border rounded-lg"
                            placeholder="CC"
                            required
                          />
                        </div>
                        <input
                          list="ups-postal-suggestions"
                          value={form.destination_postal_code}
                          onChange={(e) => setField('destination_postal_code', e.target.value)}
                          onBlur={syncCityFromPostal}
                          className="px-3 py-2 border rounded-lg"
                          placeholder="Postal code"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h4 className="font-semibold text-text-primary mb-3">Parcel & service</h4>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.weight_kg}
                        onChange={(e) => setField('weight_kg', e.target.value)}
                        className="px-3 py-2 border rounded-lg"
                        placeholder="Weight kg"
                        required
                      />
                      <div className="hidden md:block" />
                      <input type="number" min="0" step="0.1" value={form.length_cm} onChange={(e) => setField('length_cm', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Length cm" />
                      <input type="number" min="0" step="0.1" value={form.width_cm} onChange={(e) => setField('width_cm', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Width cm" />
                      <input type="number" min="0" step="0.1" value={form.height_cm} onChange={(e) => setField('height_cm', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Height cm" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                      <select value={form.service_code} onChange={(e) => setField('service_code', e.target.value)} className="px-3 py-2 border rounded-lg">
                        <option value="11">UPS Standard (11)</option>
                        <option value="07">UPS Worldwide Express (07)</option>
                        <option value="08">UPS Worldwide Expedited (08)</option>
                        <option value="65">UPS Saver (65)</option>
                        <option value="54">UPS Worldwide Express Plus (54)</option>
                      </select>
                      <input value={form.promo_code} onChange={(e) => setField('promo_code', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Promo code" />
                      <input value={form.reference_code} onChange={(e) => setField('reference_code', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Reference code" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select value={form.packaging_type} onChange={(e) => setField('packaging_type', e.target.value)} className="px-3 py-2 border rounded-lg">
                        <option value="02">Packaging: Customer Supplied (02)</option>
                        <option value="01">Packaging: UPS Letter (01)</option>
                        <option value="03">Packaging: Tube (03)</option>
                        <option value="04">Packaging: Pak (04)</option>
                        <option value="21">Packaging: UPS Express Box (21)</option>
                        <option value="24">Packaging: UPS 25KG Box (24)</option>
                        <option value="25">Packaging: UPS 10KG Box (25)</option>
                        <option value="30">Packaging: Pallet (30)</option>
                      </select>
                      <select value={form.delivery_confirmation} onChange={(e) => setField('delivery_confirmation', e.target.value)} className="px-3 py-2 border rounded-lg">
                        <option value="">Delivery confirmation: none</option>
                        <option value="1">Delivery confirmation</option>
                        <option value="2">Signature required</option>
                        <option value="3">Adult signature required</option>
                      </select>
                      <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm">
                        <input type="checkbox" checked={Boolean(form.saturday_delivery)} onChange={(e) => setField('saturday_delivery', e.target.checked)} />
                        Saturday delivery
                      </label>
                      <input value={form.shipment_description} onChange={(e) => setField('shipment_description', e.target.value)} className="px-3 py-2 border rounded-lg md:col-span-2" placeholder="Shipment description (optional)" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" min="0" step="0.01" value={form.declared_value} onChange={(e) => setField('declared_value', e.target.value)} className="px-3 py-2 border rounded-lg" placeholder="Declared value" />
                        <input value={form.declared_currency} maxLength={3} onChange={(e) => setField('declared_currency', e.target.value.toUpperCase())} className="px-3 py-2 border rounded-lg" placeholder="Currency" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 h-fit">
                  <h4 className="font-semibold text-text-primary mb-3">Summary</h4>
                  <div className="text-sm text-text-secondary space-y-2">
                    <div><b>From:</b> {form.from_postal_code} {form.from_city}, {form.from_country_code}</div>
                    <div><b>To:</b> {form.destination_postal_code || '-'} {form.destination_city || '-'}, {form.destination_country_code || '-'}</div>
                    <div><b>Parcel:</b> {form.weight_kg || '0'} kg, {form.length_cm || 0} x {form.width_cm || 0} x {form.height_cm || 0} cm</div>
                    <div><b>Service:</b> {form.service_code || '-'}</div>
                    <div><b>Reference:</b> {form.reference_code || '-'}</div>
                    <div><b>Promo:</b> {form.promo_code || '-'}</div>
                  </div>
                  <button
                    type="submit"
                    disabled={creating}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-60"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                    Save & Buy Label
                  </button>
                </div>
              </div>

              <datalist id="ups-country-codes">
                {countryOptions.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
              <datalist id="ups-postal-suggestions">
                {postalSuggestions.map((row, idx) => (
                  <option
                    key={`${row.country_code}-${row.postal_code}-${idx}`}
                    value={row.postal_code || ''}
                    label={`${row.postal_code || ''}${row.city ? ` - ${row.city}` : ''}`}
                  />
                ))}
              </datalist>
              <datalist id="ups-city-suggestions">
                {citySuggestions.map((row, idx) => (
                  <option
                    key={`${row.country_code}-${row.city}-${row.postal_code}-${idx}`}
                    value={row.city || ''}
                    label={`${row.city || ''}${row.postal_code ? ` (${row.postal_code})` : ''}`}
                  />
                ))}
              </datalist>
            </form>

            <section className="mt-6 bg-white border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h4 className="text-lg font-semibold text-text-primary">Client UPS shipping orders</h4>
              </div>
              {clientOrders.length === 0 ? (
                <div className="px-5 py-6 text-sm text-text-secondary">Nicio comandă UPS pentru acest client.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-text-secondary text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Order</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Tracking</th>
                        <th className="px-4 py-3 text-left">Destination</th>
                        <th className="px-4 py-3 text-left">Charge</th>
                        <th className="px-4 py-3 text-left">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientOrders.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-4 py-3">{row.external_order_id || row.id}</td>
                          <td className="px-4 py-3">{row.status || '-'}</td>
                          <td className="px-4 py-3">{row.tracking_number || '-'}</td>
                          <td className="px-4 py-3">{row.ship_to?.postal_code || '-'} {row.ship_to?.city || ''} {row.ship_to?.country_code || ''}</td>
                          <td className="px-4 py-3">{row.total_charge != null ? `${Number(row.total_charge).toFixed(2)} ${row.currency || 'EUR'}` : '-'}</td>
                          <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
