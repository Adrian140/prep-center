import React, { useEffect, useMemo, useState } from 'react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabase } from '../../../config/supabase';
import { saveAs } from 'file-saver';
import {
  AlertCircle,
  ArrowRight,
  Download,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  Truck
} from 'lucide-react';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const STATUS_FILTERS = [
  { id: 'all', label: 'All Shipments', status: null },
  { id: 'pending', label: 'Pending', status: 'pending' },
  { id: 'ready_for_shipping', label: 'Ready for Shipping', status: 'ready_for_shipping' },
  { id: 'transit', label: 'In Transit', status: 'transit' },
  { id: 'delivered', label: 'Delivered', status: 'delivered' },
  { id: 'incident', label: 'Incident', status: 'incident' },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled' }
];

const statusChip = (status) => {
  const map = {
    pending: 'bg-amber-100 text-amber-700 border border-amber-200',
    ready_for_shipping: 'bg-blue-100 text-blue-700 border border-blue-200',
    transit: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
    delivered: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    incident: 'bg-rose-100 text-rose-700 border border-rose-200',
    cancelled: 'bg-gray-100 text-gray-600 border border-gray-200'
  };
  return map[status] || 'bg-slate-100 text-slate-700 border border-slate-200';
};

const emptyAddress = {
  name: '',
  company: '',
  address: '',
  city: '',
  postal_code: '',
  country: '',
  phone: '',
  email: ''
};

const emptyParcel = { weight: 1, length: 10, width: 10, height: 10 };

async function buildAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  const headers = {};
  if (supabaseAnonKey) headers.apikey = supabaseAnonKey;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

const formatAddress = (addr) => {
  if (!addr) return '—';
  const bits = [addr.name || addr.company, addr.address, `${addr.city || ''} ${addr.postal_code || ''}`.trim(), addr.country]
    .filter(Boolean)
    .join(', ');
  return bits || '—';
};

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)} €`;
};

export default function ClientPacklink() {
  const { user } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shipments, setShipments] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [form, setForm] = useState({
    from: { ...emptyAddress },
    to: { ...emptyAddress },
    parcel: { ...emptyParcel },
    reference: '',
    content: '',
    value: 0,
    insured: false,
    second_hand: false
  });

  const counts = useMemo(() => {
    const acc = { all: shipments.length };
    shipments.forEach((s) => {
      const st = (s.status || 'pending').toLowerCase();
      acc[st] = (acc[st] || 0) + 1;
    });
    return acc;
  }, [shipments]);

  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      const status = (s.status || '').toLowerCase();
      const matchesStatus = activeFilter === 'all' || status === activeFilter;
      const term = search.trim().toLowerCase();
      const matchesSearch =
        !term ||
        (s.tracking_number || '').toLowerCase().includes(term) ||
        (s.packlink_id || '').toLowerCase().includes(term) ||
        (s.carrier || '').toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [shipments, activeFilter, search]);

  useEffect(() => {
    if (!user) return;
    const fetchShipments = async () => {
      setLoading(true);
      setError('');
      try {
        const headers = await buildAuthHeaders();
        const res = await fetch(
          `${supabase.supabaseUrl}/functions/v1/packlink/shipments?user_id=${user.id}`,
          { headers }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load shipments');
        setShipments(Array.isArray(data.shipments) ? data.shipments : []);
      } catch (err) {
        setError(err.message || 'Eroare la încărcarea transporturilor');
      } finally {
        setLoading(false);
      }
    };
    fetchShipments();
  }, [user]);

  const handleGetQuotes = async () => {
    if (!form.content.trim()) {
      setError('Please add contents of the shipment.');
      return;
    }
    setQuoteLoading(true);
    setError('');
    try {
      const headers = await buildAuthHeaders();
      const res = await fetch(`${supabase.supabaseUrl}/functions/v1/packlink/services`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          from: form.from,
          to: form.to,
          parcel: form.parcel,
          parcels: [form.parcel],
          content: form.content || undefined,
          value: Number(form.value) || 0,
          insured: !!form.insured,
          second_hand: !!form.second_hand,
          reference: form.reference || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Nu am putut obține ofertele');
      const list = Array.isArray(data.services) ? data.services : data.services?.items || [];
      setServices(list || []);
      if (list?.length) {
        setSelectedService(list[0]);
      }
    } catch (err) {
      setError(err.message || 'Nu am putut obține ofertele');
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleCreateShipment = async () => {
    const errs = [];
    if (!form.content.trim()) errs.push('Completează câmpul Content.');
    if (!form.from.phone || !form.from.email) errs.push('Adaugă telefon + email la expeditor.');
    if (!form.to.phone || !form.to.email) errs.push('Adaugă telefon + email la destinatar.');
    if (!selectedService) errs.push('Selectează un curier înainte de a crea expedierea.');
    if (errs.length) {
      setError(errs.join(' '));
      return;
    }
    setCreateLoading(true);
    setError('');
    try {
      const headers = await buildAuthHeaders();
      const res = await fetch(`${supabase.supabaseUrl}/functions/v1/packlink/shipments`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          service_id: selectedService.id || selectedService.service_id,
          from: form.from,
          to: form.to,
          parcel: form.parcel,
          parcels: [form.parcel],
          content: form.content || undefined,
          value: Number(form.value) || 0,
          insured: !!form.insured,
          second_hand: !!form.second_hand,
          reference: form.reference || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Nu am putut crea expedierea');

      if (data.shipment) {
        setShipments((prev) => {
          const withoutDup = prev.filter((s) => s.packlink_id !== data.shipment.packlink_id);
          return [data.shipment, ...withoutDup];
        });
      }
      setDrawerOpen(false);
      setServices([]);
      setSelectedService(null);
    } catch (err) {
      setError(err.message || 'Nu am putut crea expedierea');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setReportsLoading(true);
    setError('');
    try {
      const headers = await buildAuthHeaders();
      const res = await fetch(
        `${supabase.supabaseUrl}/functions/v1/packlink/reports?user_id=${user.id}&format=csv`,
        { headers }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Nu am putut genera raportul');
      }
      const blob = await res.blob();
      saveAs(blob, 'packlink-shipments.csv');
    } catch (err) {
      setError(err.message || 'Nu am putut genera raportul');
    } finally {
      setReportsLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ from: { ...emptyAddress }, to: { ...emptyAddress }, parcel: { ...emptyParcel }, content: '', reference: '' });
    setServices([]);
    setSelectedService(null);
  };

  const heroBanner = (
    <div className="rounded-xl bg-gradient-to-r from-[#0a61e1] to-[#0c7cff] text-white p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Truck className="w-10 h-10" />
        <div>
          <p className="uppercase text-xs tracking-[0.2em] opacity-90">Packlink PRO</p>
          <h2 className="text-2xl font-semibold">Ship smarter with your Prep Center</h2>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm opacity-90">
        <span>Compare rates</span>
        <ArrowRight className="w-4 h-4" />
        <span>Book labels</span>
        <ArrowRight className="w-4 h-4" />
        <span>Track deliveries</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 relative">
      {/* Coming soon badge */}
      <div className="pointer-events-none fixed inset-0 z-20 flex items-start justify-center">
        <div className="mt-8 sm:mt-10 bg-orange-500/70 text-white font-semibold text-2xl sm:text-3xl px-6 py-3 rounded-full shadow-lg">
          Coming soon
        </div>
      </div>

      {heroBanner}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        {/* Sidebar */}
        <div className="bg-white border rounded-xl shadow-sm">
          <div className="p-4 flex items-center justify-between border-b">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-gray-800">Shipments</span>
            </div>
            <button
              onClick={() => {
                resetForm();
                setDrawerOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-blue-600 text-white text-xs px-3 py-2 rounded-lg shadow hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" />
              New shipment
            </button>
          </div>
          <div className="divide-y">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.status ? f.status : 'all')}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-blue-50 transition ${
                  activeFilter === (f.status || 'all') ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                <span>{f.label}</span>
                <span className="text-xs font-semibold text-gray-500">
                  {f.status ? counts[f.status] || 0 : counts.all || 0}
                </span>
              </button>
            ))}
          </div>
          <div className="p-4">
            <button
              onClick={handleExportCsv}
              disabled={reportsLoading}
              className="w-full inline-flex items-center justify-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {reportsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export CSV
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-3 border-b flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Truck className="w-4 h-4" />
              <span>Manage your Packlink shipments</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tracking or carrier"
                  className="pl-9 pr-3 py-2 text-sm border rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => {
                  setDrawerOpen(true);
                  resetForm();
                }}
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm px-3 py-2 rounded-lg shadow hover:bg-blue-700 transition"
              >
                <Plus className="w-4 h-4" />
                New shipment
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center text-gray-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading shipments...
            </div>
          ) : filteredShipments.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-6">
              <div className="bg-blue-50 border border-blue-100 rounded-full w-16 h-16 flex items-center justify-center text-blue-600 mb-4">
                <Truck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No shipments yet</h3>
              <p className="text-gray-600 mb-4">
                Start by creating a shipment. We will fetch labels, tracking and status updates from Packlink PRO.
              </p>
              <button
                onClick={() => {
                  setDrawerOpen(true);
                  resetForm();
                }}
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition"
              >
                <Plus className="w-4 h-4" />
                New shipment
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Recipient</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tracking</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredShipments.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{row.to_address?.name || 'Recipient'}</div>
                        <div className="text-xs text-gray-500">{formatAddress(row.to_address)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{row.carrier || '—'}</div>
                        <div className="text-xs text-gray-500">Service ID: {row.service_id || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{row.tracking_number || '—'}</div>
                        <div className="text-xs text-gray-500">Packlink ID: {row.packlink_id || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatMoney(row.price)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusChip(row.status)}`}>
                          {row.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {row.label_url && (
                            <a
                              href={row.label_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                            >
                              <Download className="w-4 h-4" />
                              Label
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={() => setDrawerOpen(false)}>
          <div
            className="w-full max-w-5xl bg-white h-full overflow-y-auto p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Packlink</span>
                <h3 className="text-base font-semibold text-gray-900">Create shipment</h3>
              </div>
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  resetForm();
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1.2fr] gap-3">
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { key: 'from', label: 'From', icon: <MapPin className="w-4 h-4 text-blue-600" /> },
                    { key: 'to', label: 'To', icon: <MapPin className="w-4 h-4 text-blue-600" /> }
                  ].map(({ key, label, icon }) => (
                    <div key={key} className="border rounded-lg p-3 shadow-sm bg-white/70">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-1">
                        {icon}
                        {label}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          ['name', 'Name'],
                          ['company', 'Company'],
                          ['address', 'Address'],
                          ['city', 'City'],
                          ['postal_code', 'Postcode'],
                          ['country', 'Country'],
                          ['phone', 'Phone'],
                          ['email', 'Email']
                        ].map(([field, ph]) => (
                          <div key={`${key}-${field}`} className="space-y-1">
                            <label className="text-[11px] uppercase text-gray-500">{ph}</label>
                            <input
                              type="text"
                              value={form[key][field] || ''}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, [key]: { ...prev[key], [field]: e.target.value } }))
                              }
                              placeholder={ph}
                              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/70"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {['weight', 'length', 'width', 'height'].map((field) => (
                    <div key={`parcel-${field}`} className="space-y-1">
                      <label className="text-[11px] uppercase text-gray-500">{field}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={form.parcel[field] || ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            parcel: { ...prev.parcel, [field]: Number(e.target.value) }
                          }))
                        }
                        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/70"
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase text-gray-500">Content *</label>
                    <input
                      type="text"
                      value={form.content}
                      onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/70"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase text-gray-500">Reference</label>
                    <input
                      type="text"
                      value={form.reference}
                      onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/70"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase text-gray-500">Declared value (€)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.value}
                      onChange={(e) => setForm((prev) => ({ ...prev, value: Number(e.target.value) }))}
                      className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/70"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase text-gray-500">Insurance</label>
                    <div className="flex items-center gap-3 text-sm text-gray-700">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.insured}
                          onChange={(e) => setForm((prev) => ({ ...prev, insured: e.target.checked }))}
                        />
                        Protect shipment
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.second_hand}
                          onChange={(e) => setForm((prev) => ({ ...prev, second_hand: e.target.checked }))}
                        />
                        Second-hand
                      </label>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Phone + email are required by carriers. Insurance uses declared value.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleGetQuotes}
                    disabled={quoteLoading}
                    className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {quoteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Get prices
                  </button>
                  <button
                    onClick={handleCreateShipment}
                    disabled={createLoading}
                    className="inline-flex items-center gap-2 border border-blue-600 text-blue-700 px-3 py-2 rounded-md text-sm hover:bg-blue-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create shipment
                  </button>
                  <span className="text-xs text-gray-500">Powered by Packlink PRO API</span>
                </div>

                {services.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">Available services</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {services.map((svc) => {
                        const id = svc.id || svc.service_id || svc.name;
                        const isSelected =
                          selectedService && (selectedService.id === svc.id || selectedService.service_id === svc.service_id);
                        return (
                          <button
                            key={id}
                            onClick={() => setSelectedService(svc)}
                            className={`text-left border rounded-lg p-3 hover:border-blue-500 transition ${
                              isSelected ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-sm font-semibold text-gray-900">
                                {svc.carrier || svc.provider || svc.name || 'Service'}
                              </div>
                              <div className="text-sm font-bold text-blue-700">
                                {formatMoney(svc.total_price || svc.final_price || svc.price || svc.amount)}
                              </div>
                            </div>
                            <div className="text-xs text-gray-600">
                              ETA: {svc.delivery_time || svc.eta || '—'} | ID: {svc.id || svc.service_id || '—'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="border rounded-lg p-3 bg-gray-50/80 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">Summary</h4>
                  <div className="text-sm text-gray-700 space-y-2">
                    <div>
                      <div className="text-[11px] uppercase text-gray-500">From</div>
                      <div>{formatAddress(form.from)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-gray-500">To</div>
                      <div>{formatAddress(form.to)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-[11px] uppercase text-gray-500">Parcel</div>
                      <div className="text-sm">
                        {Number(form.parcel.weight || 0)} kg · {form.parcel.length || 0} x {form.parcel.width || 0} x{' '}
                        {form.parcel.height || 0} cm
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-gray-500">Content</div>
                      <div>{form.content || '—'}</div>
                      <div className="text-[11px] text-gray-500">
                        Value: €{Number(form.value || 0).toFixed(2)} • {form.insured ? 'Protected' : 'No protection'}
                      </div>
                    </div>
                    {selectedService && (
                      <div className="pt-2 border-t">
                        <div className="text-[11px] uppercase text-gray-500">Service</div>
                        <div className="flex items-center justify-between">
                          <span>{selectedService.carrier || selectedService.name}</span>
                          <span className="font-semibold text-blue-700">
                            {formatMoney(selectedService.total_price || selectedService.final_price || selectedService.price)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-white shadow-sm space-y-2">
                  <div className="text-sm font-semibold text-gray-800">Actions</div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleGetQuotes}
                      disabled={quoteLoading}
                      className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {quoteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Get prices
                    </button>
                    <button
                      onClick={handleCreateShipment}
                      disabled={createLoading}
                      className="inline-flex items-center justify-center gap-2 border border-blue-600 text-blue-700 px-3 py-2 rounded-md text-sm hover:bg-blue-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Create shipment
                    </button>
                    <button
                      onClick={() => {
                        resetForm();
                        setDrawerOpen(false);
                      }}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
