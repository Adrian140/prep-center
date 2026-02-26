// FILE: src/components/dashboard/client/ClientStock.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  X,
  Image as ImageIcon,
  Check,
  Info,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabaseHelpers } from '@/config/supabaseHelpers';
import { useDashboardTranslation } from '../../../translations';
import ProductPhotosModal from '../../common/ProductPhotosModal';
import { supabase } from '../../../config/supabase';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import ProductQuickAdd from '@/components/common/ProductQuickAdd';
import { FALLBACK_CARRIERS, normalizeCarriers } from '@/utils/carriers';
import ClientStockSelectionBar from './ClientStockSelectionBar';
import { getKeepaMainImage } from '@/utils/keepaClient';
import UserGuidePlayer from '@/components/common/UserGuidePlayer';
import { useMarket } from '@/contexts/MarketContext';
import { buildPrepQtyPatch, mapStockRowsForMarket } from '@/utils/marketStock';

const isBadImageUrl = (url) => {
  if (!url) return true;
  const value = String(url).toLowerCase();
  return value.includes('[object') || value.includes('object%20object') || value.endsWith('._slundefined_.jpg');
};
const SALES_COUNTRIES = [
  { value: 'ALL', label: 'All' },
  { value: 'BE', label: 'Belgium' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'IE', label: 'Ireland' },
  { value: 'IT', label: 'Italy' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'PL', label: 'Poland' },
  { value: 'ES', label: 'Spain' },
  { value: 'SE', label: 'Sweden' },
  { value: 'GB', label: 'United Kingdom' }
];

const COUNTRY_LABEL_LOOKUP = SALES_COUNTRIES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});
const PREP_COUNTRY_PRIORITY = ['FR', 'DE', 'IT', 'ES', 'RO', 'UK', 'GB'];

const normalizePrepCountryCode = (code) => {
  const upper = String(code || '').trim().toUpperCase();
  if (!upper) return '';
  if (upper === 'GB') return 'UK';
  return upper;
};

const getPrepCountryEntries = (row) => {
  const map =
    row?.prep_qty_by_country && typeof row.prep_qty_by_country === 'object' && !Array.isArray(row.prep_qty_by_country)
      ? row.prep_qty_by_country
      : {};
  const normalized = Object.entries(map).reduce((acc, [country, rawQty]) => {
    const code = normalizePrepCountryCode(country);
    if (!code) return acc;
    const qty = Number(rawQty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return acc;
    acc[code] = (acc[code] || 0) + qty;
    return acc;
  }, {});

  return Object.entries(normalized).sort((a, b) => {
    const aIdx = PREP_COUNTRY_PRIORITY.indexOf(a[0]);
    const bIdx = PREP_COUNTRY_PRIORITY.indexOf(b[0]);
    if (aIdx !== -1 || bIdx !== -1) {
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    }
    return a[0].localeCompare(b[0]);
  });
};

const getPrepTotal = (row) =>
  getPrepCountryEntries(row).reduce((sum, [, qty]) => sum + Number(qty || 0), 0);

const formatSalesTimestamp = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const DEFAULT_PER_PAGE = 50;
const COUNTRIES = [{ code: 'FR' }, { code: 'DE' }, { code: 'IT' }, { code: 'ES' }, { code: 'RO' }];
const DESTINATION_COUNTRIES = ['FR', 'DE', 'IT', 'ES', 'UK'];

// Stock guides are now handled via the generic UserGuidePlayer component.

const toNum = (v) => {
  if (v === '' || v == null) return 0;
  if (typeof v === 'string') v = v.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const InventoryBreakdown = ({ row, t }) => {
  const available = Number(row.amazon_stock ?? 0);
  const inbound = Number(row.amazon_inbound ?? 0);
  const reserved = Number(row.amazon_reserved ?? 0);
  const unfulfillable = Number(row.amazon_unfulfillable ?? 0);

  const value = (n) => (
    <span className="text-[#008296] font-semibold">{Number.isFinite(n) ? n : 0}</span>
  );

  return (
    <div className="border rounded-xl p-1.5 text-[11px] leading-5 text-gray-600 bg-white shadow-inner min-w-[130px]">
      <div className="mt-1 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-900">{t('ClientStock.inventory.available')}</span>
          {value(available)}
        </div>
        <div className="flex items-center justify-between">
          <span>{t('ClientStock.inventory.inbound')}</span>
          {value(inbound)}
        </div>
        <div className="flex items-center justify-between">
          <span>{t('ClientStock.inventory.unfulfillable')}</span>
          {value(unfulfillable)}
        </div>
        <div className="flex items-center justify-between">
          <span>{t('ClientStock.inventory.reserved')}</span>
          {value(reserved)}
        </div>
      </div>
    </div>
  );
};

const SalesBreakdown = ({ totalUnits, refreshedAt, countryLabel, t }) => {
  const computedTotal = totalUnits ?? 0;

  return (
    <div className="border rounded-xl p-1.5 text-[11px] leading-5 text-gray-600 bg-white shadow-inner min-w-[130px] max-w-[160px]">
      <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-gray-500">
        <span>{t('ClientStock.sales.last30')}</span>
        <span className="text-gray-700 normal-case">{countryLabel}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-semibold text-gray-900">{t('ClientStock.sales.total')}</span>
        <span className="text-[#008296] font-semibold">
          {Number.isFinite(computedTotal) ? computedTotal : 0}
        </span>
      </div>
      <div className="mt-1 space-y-0.5">{/* Refund logic removed from UI */}</div>
    </div>
  );
};

const BASE_PRODUCT_FORM = {
  name: '',
  asin: '',
  sku: '',
  ean: '',
  qty: '0',
  purchase_price: '',
  product_link: ''
};

const ADVANCED_PRODUCT_FORM = {
  supplierName: '',
  supplierNumber: '',
  supplierUrl: '',
  supplierPrice: '',
  manufacturer: '',
  manufacturerNumber: '',
  productExtId: '',
  approxPriceEbay: '',
  approxPriceFbm: '',
  weightValue: '',
  weightUnit: 'kg',
  packageWidth: '',
  packageHeight: '',
  packageLength: '',
  packageUnit: 'cm',
  unitsMeasure: 'pcs',
  unitsCount: '',
  condition: 'New',
  shipTemplate: '',
  notes: ''
};

const createReceptionFormState = () => ({
  destinationCountry: 'FR',
  carrier: '',
  carrierOther: '',
  storeName: '',
  trackingIds: [],
  notes: '',
  fbaMode: 'none'
});

const sanitizeTrackingValues = (source) => {
  if (!Array.isArray(source)) return [];
  return source
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
};

const normalizeCountryCode = (country) => {
  if (!country) return 'ALL';
  const upper = country.toUpperCase();
  if (COUNTRY_LABEL_LOOKUP[upper]) return upper;
  const found = SALES_COUNTRIES.find((item) => item.label.toLowerCase() === country.toLowerCase());
  return found ? found.value : 'ALL';
};

const makeSalesKey = (asin, sku) =>
  `${(asin || '').toUpperCase()}::${(sku || '').toUpperCase()}`;

const buildSalesSummary = (rows = []) => {
  const map = {};
  rows.forEach((entry) => {
    const key = makeSalesKey(entry.asin, entry.sku);
    if (!key) return;
    const country = normalizeCountryCode(entry.country);
    if (!map[key]) {
      map[key] = { refreshed_at: entry.refreshed_at || null, countries: {} };
    } else if (entry.refreshed_at) {
      const existingDate = map[key].refreshed_at ? new Date(map[key].refreshed_at).getTime() : 0;
      if (new Date(entry.refreshed_at).getTime() > existingDate) {
        map[key].refreshed_at = entry.refreshed_at;
      }
    }

    const prev = map[key].countries[country] || {
      total: 0,
      payment: 0,
      shipped: 0,
      pending: 0
    };

    map[key].countries[country] = {
      total: prev.total + (Number(entry.total_units) || 0),
      payment: prev.payment + (Number(entry.payment_units) || 0),
      shipped: prev.shipped + (Number(entry.shipped_units) || 0),
      pending: prev.pending + (Number(entry.pending_units) || 0)
    };
  });

  Object.keys(map).forEach((key) => {
    const summary = map[key];
    if (!summary.countries.ALL) {
      const totals = { total: 0, payment: 0, shipped: 0, pending: 0 };
      Object.entries(summary.countries).forEach(([country, stats]) => {
        if (country === 'ALL') return;
        totals.total += stats.total;
        totals.payment += stats.payment;
        totals.shipped += stats.shipped;
        totals.pending += stats.pending;
      });
      summary.countries.ALL = totals;
    }
  });

  return map;
};

function CreateProductModal({ open, onClose, profile, t, onCreated }) {
  const [tab, setTab] = useState('simple');
  const [baseForm, setBaseForm] = useState(BASE_PRODUCT_FORM);
  const [advancedForm, setAdvancedForm] = useState(ADVANCED_PRODUCT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setTab('simple');
        setBaseForm(BASE_PRODUCT_FORM);
        setAdvancedForm(ADVANCED_PRODUCT_FORM);
        setSaving(false);
        setError('');
      }, 200);
    }
  }, [open]);

  if (!open) return null;

  const handleChange = (formUpdater) => (field, value) => {
    formUpdater((prev) => ({ ...prev, [field]: value }));
  };

  const updateBase = handleChange(setBaseForm);

  const normalizeBaseCodeValue = (value) => {
    const validator = supabaseHelpers?.validateEAN;
    const raw = String(value || '').trim();
    if (!raw || typeof validator !== 'function') return null;
    const result = validator(raw);
    if (!result?.valid) return null;
    if (result.type === 'ASIN') {
      return { target: 'asin', value: result.formatted };
    }
    return { target: 'ean', value: result.formatted };
  };

  const handleBaseCodeBlur = (field) => {
    setBaseForm((prev) => {
      const raw = prev[field];
      if (!raw) return prev;
      const normalized = normalizeBaseCodeValue(raw);
      if (!normalized) return prev;
      const next = { ...prev };
      next[normalized.target] = normalized.value;
      if (normalized.target !== field) {
        next[field] = '';
      }
      return next;
    });
  };
  const updateAdvanced = handleChange(setAdvancedForm);

  const parseNumber = (value, allowNull = true) => {
    if (value === '' || value == null) return allowNull ? null : 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const handleSubmit = async () => {
    if (!profile?.company_id) {
      setError('Missing company profile.');
      return;
    }
    if (!baseForm.name.trim()) {
      setError('Product name is required.');
      return;
    }
    const qty = parseNumber(baseForm.qty, false);
    if (qty == null || qty < 0) {
      setError('Quantity must be a positive number.');
      return;
    }

    const purchasePrice = parseNumber(baseForm.purchase_price);
    if (baseForm.purchase_price && purchasePrice == null) {
      setError('Invalid purchase price.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const prepPatch = buildPrepQtyPatch({}, currentMarket, qty);
      const payload = {
        name: baseForm.name.trim(),
        asin: baseForm.asin.trim() || null,
        sku: baseForm.sku.trim() || null,
        ean: baseForm.ean.trim() || null,
        qty: prepPatch.qty,
        prep_qty_by_country: prepPatch.prep_qty_by_country,
        purchase_price: purchasePrice,
        product_link: baseForm.product_link.trim() || null
      };
      const created = await supabaseHelpers.createStockItem(profile, payload);

      if (tab === 'advanced') {
        try {
          await supabaseHelpers.createProductBlueprint(profile, created.id, {
            ...advancedForm,
            approxPriceEbay: parseNumber(advancedForm.approxPriceEbay),
            approxPriceFbm: parseNumber(advancedForm.approxPriceFbm),
            supplierPrice: parseNumber(advancedForm.supplierPrice),
            weightValue: parseNumber(advancedForm.weightValue),
            packageWidth: parseNumber(advancedForm.packageWidth),
            packageHeight: parseNumber(advancedForm.packageHeight),
            packageLength: parseNumber(advancedForm.packageLength),
            unitsCount: parseNumber(advancedForm.unitsCount)
          });
        } catch (blueprintErr) {
          console.error(blueprintErr);
          setError(supportError);
        }
      }

      onCreated(created);
      onClose();
    } catch (err) {
      setError(supportError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{t('ClientStock.createProduct.title')}</h3>
            <p className="text-sm text-gray-500">{t('ClientStock.createProduct.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-3 border-b">
            {['simple', 'advanced'].map((mode) => (
              <button
                key={mode}
                onClick={() => setTab(mode)}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${
                  tab === mode ? 'border-primary text-primary' : 'border-transparent text-gray-500'
                }`}
              >
                {mode === 'simple'
                  ? t('ClientStock.createProduct.simpleTab')
                  : t('ClientStock.createProduct.advancedTab')}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Base fields */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">{t('ClientStock.createProduct.fields.name')}</label>
              <input
                type="text"
                value={baseForm.name}
                onChange={(e) => updateBase('name', e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Product title"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('ClientStock.createProduct.fields.asin')}</label>
              <input
                type="text"
                value={baseForm.asin}
                onChange={(e) => updateBase('asin', e.target.value)}
                onBlur={() => handleBaseCodeBlur('asin')}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="B0..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('ClientStock.createProduct.fields.sku')}</label>
              <input
                type="text"
                value={baseForm.sku}
                onChange={(e) => updateBase('sku', e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="SKU-123"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('ClientStock.createProduct.fields.ean')}</label>
              <input
                type="text"
                value={baseForm.ean}
                onChange={(e) => updateBase('ean', e.target.value)}
                onBlur={() => handleBaseCodeBlur('ean')}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="EAN / UPC"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('ClientStock.createProduct.fields.qty')}</label>
              <input
                type="number"
                min={0}
                value={baseForm.qty}
                onChange={(e) => updateBase('qty', e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('ClientStock.createProduct.fields.price')}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={baseForm.purchase_price}
                onChange={(e) => updateBase('purchase_price', e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700">
                {t('ClientStock.createProduct.fields.link')}
              </label>
              <input
                type="url"
                value={baseForm.product_link}
                onChange={(e) => updateBase('product_link', e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="https://"
              />
            </div>
          </div>

          {tab === 'advanced' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-700">{t('ClientStock.createProduct.advancedSections.supplier')}</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.supplierName')}
                  value={advancedForm.supplierName}
                  onChange={(e) => updateAdvanced('supplierName', e.target.value)}
                />
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.supplierNumber')}
                  value={advancedForm.supplierNumber}
                  onChange={(e) => updateAdvanced('supplierNumber', e.target.value)}
                />
                <input
                  type="url"
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.supplierUrl')}
                  value={advancedForm.supplierUrl}
                  onChange={(e) => updateAdvanced('supplierUrl', e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.supplierPrice')}
                  value={advancedForm.supplierPrice}
                  onChange={(e) => updateAdvanced('supplierPrice', e.target.value)}
                />
              </div>

              <h4 className="text-sm font-semibold text-gray-700">{t('ClientStock.createProduct.advancedSections.product')}</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.manufacturer')}
                  value={advancedForm.manufacturer}
                  onChange={(e) => updateAdvanced('manufacturer', e.target.value)}
                />
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.manufacturerNumber')}
                  value={advancedForm.manufacturerNumber}
                  onChange={(e) => updateAdvanced('manufacturerNumber', e.target.value)}
                />
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.productExtId')}
                  value={advancedForm.productExtId}
                  onChange={(e) => updateAdvanced('productExtId', e.target.value)}
                />
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.shipTemplate')}
                  value={advancedForm.shipTemplate}
                  onChange={(e) => updateAdvanced('shipTemplate', e.target.value)}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.approxPriceEbay')}
                  value={advancedForm.approxPriceEbay}
                  onChange={(e) => updateAdvanced('approxPriceEbay', e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="border rounded-lg px-3 py-2"
                  placeholder={t('ClientStock.createProduct.fields.approxPriceFbm')}
                  value={advancedForm.approxPriceFbm}
                  onChange={(e) => updateAdvanced('approxPriceFbm', e.target.value)}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="border rounded-lg px-3 py-2 flex-1"
                    placeholder={t('ClientStock.createProduct.fields.weightValue')}
                    value={advancedForm.weightValue}
                    onChange={(e) => updateAdvanced('weightValue', e.target.value)}
                  />
                  <select
                    className="border rounded-lg px-3 py-2"
                    value={advancedForm.weightUnit}
                    onChange={(e) => updateAdvanced('weightUnit', e.target.value)}
                  >
                    {['kg', 'g', 'lb'].map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="border rounded-lg px-3 py-2 flex-1"
                    placeholder={t('ClientStock.createProduct.fields.unitsCount')}
                    value={advancedForm.unitsCount}
                    onChange={(e) => updateAdvanced('unitsCount', e.target.value)}
                  />
                  <select
                    className="border rounded-lg px-3 py-2"
                    value={advancedForm.unitsMeasure}
                    onChange={(e) => updateAdvanced('unitsMeasure', e.target.value)}
                  >
                    {['pcs', 'm', 'l', 'kg', '100 ml', '100 gr'].map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {['packageWidth', 'packageHeight', 'packageLength'].map((field) => (
                  <input
                    key={field}
                    type="number"
                    step="0.01"
                    min={0}
                    className="border rounded-lg px-3 py-2"
                    placeholder={t(`ClientStock.createProduct.fields.${field}`)}
                    value={advancedForm[field]}
                    onChange={(e) => updateAdvanced(field, e.target.value)}
                  />
                ))}
                <select
                  className="border rounded-lg px-3 py-2"
                  value={advancedForm.packageUnit}
                  onChange={(e) => updateAdvanced('packageUnit', e.target.value)}
                >
                  {['mm', 'cm', 'm', 'inch', 'ft'].map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <select
                  className="border rounded-lg px-3 py-2"
                  value={advancedForm.condition}
                  onChange={(e) => updateAdvanced('condition', e.target.value)}
                >
                  {['New', 'UsedLikeNew', 'UsedVeryGood', 'UsedGood', 'UsedAcceptable', 'Defect'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <textarea
                  className="border rounded-lg px-3 py-2"
                  rows={2}
                  placeholder={t('ClientStock.createProduct.fields.notes')}
                  value={advancedForm.notes}
                  onChange={(e) => updateAdvanced('notes', e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50"
            disabled={saving}
          >
            {t('ClientStock.createProduct.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? t('ClientStock.createProduct.saving') : t('ClientStock.createProduct.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackingBadges({ list = [], max = 1, t }) {
  const [open, setOpen] = React.useState(false);
  if (!Array.isArray(list) || list.length === 0) return <span>—</span>;

  const shown = open ? list : list.slice(0, max);
  const rest = Math.max(0, list.length - max);

  return (
    <div className={open ? "flex flex-col gap-1" : "flex items-center gap-2 flex-wrap"}>
      {shown.map((tItem) => (
        <span
          key={tItem.id ?? tItem.tracking_id}
          className="px-2 py-0.5 text-xs rounded border font-mono"
          title={tItem.created_at ? `added: ${String(tItem.created_at).slice(0,10)}` : ''}
        >
          {tItem.tracking_id}
        </span>
      ))}
      {!open && rest > 0 && (
        <button className="text-xs underline" onClick={() => setOpen(true)}>
          {t('ClientStock.drawer.handle.showMore').replace('{n}', String(rest))}
        </button>
      )}
      {open && list.length > max && (
        <button className="text-xs underline" onClick={() => setOpen(false)}>
          {t('ClientStock.drawer.handle.showLess')}
        </button>
      )}
    </div>
  );
}

export default function ClientStock({
  profileOverride = null,
  statusOverride = null,
  hideGuides = false,
  storagePrefixOverride = null,
  enableIdentifierEdit = false,
  enableQtyAdjust = false
} = {}) {
  const { t, tp } = useDashboardTranslation();
  const supportError = t('common.supportError');
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const priceColumnNote = t('ClientStock.priceColumn.note');
  const authCtx = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const profile = profileOverride ?? authCtx.profile;
  const status = statusOverride ?? authCtx.status;
  const [toast, setToast] = useState(null);
  const [copyToast, setCopyToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const tmr = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(tmr);
  }, [toast]);
  const quickAddLabels = useMemo(
    () => ({
      title: t('ClientStock.quickAdd.title'),
      subtitle: t('ClientStock.quickAdd.subtitle'),
      manualTitle: t('ClientStock.quickAdd.manualTitle'),
      eanLabel: t('ClientStock.quickAdd.eanLabel'),
      nameLabel: t('ClientStock.quickAdd.nameLabel'),
      priceLabel: t('ClientStock.quickAdd.priceLabel'),
      addLine: t('ClientStock.quickAdd.addLine'),
      uploadTitle: t('ClientStock.quickAdd.uploadTitle'),
      uploadHint: t('ClientStock.quickAdd.uploadHint'),
      template: t('ClientStock.quickAdd.template'),
      previewTitle: t('ClientStock.quickAdd.previewTitle'),
      empty: t('ClientStock.quickAdd.empty'),
      remove: t('ClientStock.quickAdd.remove'),
      addInventory: t('ClientStock.quickAdd.addInventory'),
      errors: {
        missingFields: t('ClientStock.quickAdd.errors.missingFields'),
        invalidCode: t('ClientStock.quickAdd.errors.invalidCode'),
        invalidPrice: t('ClientStock.quickAdd.errors.invalidPrice'),
        qty: t('ClientStock.quickAdd.errors.qty'),
        fileType: t('ClientStock.quickAdd.errors.fileType'),
        fileHeaders: t('ClientStock.quickAdd.errors.fileHeaders'),
        fileRows: t('ClientStock.quickAdd.errors.fileRows'),
        save: t('ClientStock.quickAdd.errors.save')
      },
      success: t('ClientStock.quickAdd.success')
    }),
    [t]
  );

  const storagePrefix = useMemo(() => {
    if (storagePrefixOverride) return storagePrefixOverride;
    if (profile?.company_id) return `client-stock-${profile.company_id}`;
    if (profile?.id) return `client-stock-user-${profile.id}`;
    return 'client-stock';
  }, [profile?.company_id, profile?.id, storagePrefixOverride]);

const [rows, setRows] = useState([]);
const [loading, setLoading] = useState(true);
const [carrierOptions, setCarrierOptions] = useState(FALLBACK_CARRIERS);

useEffect(() => {
  let cancelled = false;
  (async () => {
    const { data, error } = await supabaseHelpers.getCarriers();
    if (cancelled) return;
    if (!error && Array.isArray(data) && data.length) {
      setCarrierOptions(normalizeCarriers(data));
    } else {
      setCarrierOptions(FALLBACK_CARRIERS);
    }
  })();
  return () => {
    cancelled = true;
  };
}, []);

const [rowEdits, setRowEdits] = useState({});
const [qtyInputs, setQtyInputs] = useState({});
const [salesSummary, setSalesSummary] = useState({});
const [salesCountry, setSalesCountry] = useSessionStorage(
  `${storagePrefix}-salesCountry`,
  'ALL'
);
const [sortSpec, setSortSpec] = useSessionStorage(
  `${storagePrefix}-sortSpec`,
  { key: 'prep', direction: 'desc' }
);
const showSalesColumn = true;
const [showPriceColumn, setShowPriceColumn] = useSessionStorage(
  `${storagePrefix}-showPriceColumn`,
  false
);

  const [searchField, setSearchField] = useSessionStorage(
    `${storagePrefix}-searchField`,
    'EAN'
  );
  const [searchQuery, setSearchQuery] = useSessionStorage(
    `${storagePrefix}-searchQuery`,
    ''
  );
  const [stockFilter, setStockFilter] = useSessionStorage(
    `${storagePrefix}-stockFilter`,
    'all'
  );
  const [productSearch, setProductSearch] = useSessionStorage(
    `${storagePrefix}-productSearch`,
    ''
  );
  const [selectedIdList, setSelectedIdList] = useSessionStorage(
    `${storagePrefix}-selectedIds`,
    []
  );
  const selectedIds = useMemo(
    () => new Set(Array.isArray(selectedIdList) ? selectedIdList : []),
    [selectedIdList]
  );
  const mutateSelectedIds = useCallback(
    (mutator) => {
      setSelectedIdList((prev) => {
        const base = new Set(Array.isArray(prev) ? prev : []);
        mutator(base);
        return Array.from(base);
      });
    },
    [setSelectedIdList]
  );

  const [page, setPage] = useSessionStorage(`${storagePrefix}-page`, 1);
  const [perPage, setPerPage] = useSessionStorage(
    `${storagePrefix}-perPage`,
    DEFAULT_PER_PAGE
  );

  const keepaQueueRef = useRef(new Set());
  const keepaBusyRef = useRef(false);
  const keepaDisabledRef = useRef(false);
  const keepaWarnedRef = useRef(false);
  const rowsRef = useRef([]);
  const unmountedRef = useRef(false);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const [linkEditor, setLinkEditor] = useState({ open: false, id: null, value: '' });
  const [submitType, setSubmitType] = useSessionStorage(
    `${storagePrefix}-submitType`,
    'reception'
  );
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnItems, setReturnItems] = useState([]);
  const [returnInsideFiles, setReturnInsideFiles] = useState([]);
  const [returnLabelFiles, setReturnLabelFiles] = useState([]);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnError, setReturnError] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const handleCodeCopy = useCallback(
    async (event, rowId, field, value) => {
      if (!value) return;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const temp = document.createElement('textarea');
          temp.value = value;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);
        }
        const key = Date.now();
        setCopyToast({ rowId, field, key });
        setTimeout(() => {
          setCopyToast((current) => (current?.key === key ? null : current));
        }, 1500);
      } catch {
        setToast({ type: 'error', text: t('ClientStock.copyError') });
      }
    },
    [t]
  );

  const processKeepaQueue = useCallback(async () => {
    if (keepaBusyRef.current || keepaDisabledRef.current || unmountedRef.current) return;
    keepaBusyRef.current = true;
    while (keepaQueueRef.current.size && !keepaDisabledRef.current) {
      const iterator = keepaQueueRef.current.values().next();
      if (iterator.done) break;
      const nextId = iterator.value;
      keepaQueueRef.current.delete(nextId);

      if (unmountedRef.current) break;
      const row = rowsRef.current.find((item) => item.id === nextId);
      if (!row || row.image_url || !row.asin) {
        continue;
      }

      try {
        const { image } = await getKeepaMainImage({ asin: row.asin });
        if (!image) continue;

        if (unmountedRef.current) break;
        setRows((prev) => prev.map((r) => (r.id === nextId ? { ...r, image_url: image } : r)));
        const { error } = await supabaseHelpers.updateStockItem(nextId, { image_url: image });
        if (error) throw error;
      } catch (err) {
        if (!import.meta.env.PROD) {
          // Doar log în dev; nu mai afișăm toast global.
          console.warn('[Keepa image]', err);
        }
        const msg = String(err?.message || err || '');
        if (/tokens? low/i.test(msg) || /missing keepa api key/i.test(msg)) {
          keepaDisabledRef.current = true;
          break;
        }
      }
    }
    keepaBusyRef.current = false;
  }, [setRows, setToast]);

  // ===== Request Editor (history item) =====
const [reqOpen, setReqOpen] = useState(false);
const [reqLoading, setReqLoading] = useState(false);
const [reqEditable, setReqEditable] = useState(false);
const [reqHeader, setReqHeader] = useState(null);    // {id, destination_country, status, created_at, ...}
const [reqLines, setReqLines] = useState([]);        // [{id, stock_item_id, asin, sku, units_requested, ean?}]
const [reqErrors, setReqErrors] = useState([]);
const [adding, setAdding] = useState(false);         // UI add new line
const [addingSel, setAddingSel] = useState('');      // stock item id (string)
const [addingQty, setAddingQty] = useState('');      // number

const [receptionForm, setReceptionForm] = useSessionStorage(
  `${storagePrefix}-receptionForm`,
  createReceptionFormState()
);
const [photoItem, setPhotoItem] = useState(null);
const [photoCounts, setPhotoCounts] = useState({});
const [trackingDraft, setTrackingDraft] = useState('');
const [trackingPanelOpen, setTrackingPanelOpen] = useState(false);
  const handleQuickAddComplete = useCallback(
  ({ inserted = [], updated = [], count = 0 }) => {
    const mappedInserted = mapStockRowsForMarket(inserted, currentMarket);
    const mappedUpdated = mapStockRowsForMarket(updated, currentMarket);
    setRows((prev) => {
      const updateMap = new Map(mappedUpdated.map((row) => [row.id, row]));
      let next = prev.map((row) => (updateMap.has(row.id) ? { ...row, ...updateMap.get(row.id) } : row));
      if (mappedInserted.length) {
        next = [...mappedInserted, ...next];
      }
      return next;
    });
    if (mappedInserted.length) {
      setRowEdits((prev) => {
        const next = { ...prev };
        mappedInserted.forEach((row) => {
          next[row.id] = {
            name: row.name || '',
            asin: row.asin || '',
            product_link: row.product_link || '',
            purchase_price: row.purchase_price != null ? String(row.purchase_price) : '',
            sku: row.sku || '',
            units_to_send: 0,
            fba_units: 0
          };
        });
        return next;
      });
    }
    const msg = (quickAddLabels.success || '').replace('{count}', String(count));
    setToast({ type: 'success', text: msg });
  },
  [quickAddLabels.success, setRowEdits, currentMarket]
);
const handleQuickAddError = useCallback(
  (msg) => setToast({ type: 'error', text: msg }),
  []
);

const refreshStockData = useCallback(async () => {
  if (!profile?.id) {
    setRows([]);
    setLoading(false);
    setRowEdits({});
    setQtyInputs({});
    setPhotoCounts({});
    setSalesSummary({});
    return;
  }

  setLoading(true);

  const pageSize = 1000;
  let from = 0;
  let to = pageSize - 1;
  let all = [];

  while (true) {
    let query = supabase.from('stock_items').select('*');
    if (profile?.company_id) query = query.eq('company_id', profile.company_id);
    else query = query.eq('user_id', profile.id);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    const page = error ? [] : Array.isArray(data) ? data : [];
    all = all.concat(page);

    if (!data || data.length < pageSize) break;
    from += pageSize;
    to += pageSize;
  }

  if (unmountedRef.current) {
    setLoading(false);
    return;
  }

  const moveNoAsinRowsToEnd = (items) => {
    const withAsin = [];
    const withoutAsin = [];
    (items || []).forEach((item) => {
      const hasAsin = Boolean((item?.asin || '').toString().trim());
      if (hasAsin) {
        withAsin.push(item);
      } else {
        withoutAsin.push(item);
      }
    });
    return [...withAsin, ...withoutAsin];
  };
  const mappedAll = mapStockRowsForMarket(all, currentMarket);
  setRows(moveNoAsinRowsToEnd(mappedAll));
  setLoading(false);

  const seed = {};
  for (const r of mappedAll) {
    seed[r.id] = {
      name: r.name || '',
      asin: r.asin || '',
      ean: r.ean || '',
      product_link: r.product_link || '',
      purchase_price: r.purchase_price != null ? String(r.purchase_price) : '',
      sku: r.sku || '',
      units_to_send: 0,
      fba_units: 0
    };
  }
  setRowEdits(seed);
  setQtyInputs({});

  if (all.length > 0) {
    try {
      const ids = all.map((r) => r.id);
      const { data: imgRows, error: imgErr } = await supabase
        .from('product_images')
        .select('stock_item_id')
        .in('stock_item_id', ids);
      if (imgErr) throw imgErr;
      const counts = {};
      (imgRows || []).forEach((img) => {
        counts[img.stock_item_id] = (counts[img.stock_item_id] || 0) + 1;
      });
      setPhotoCounts(counts);
    } catch {
      setPhotoCounts({});
    }
  } else {
    setPhotoCounts({});
  }

  try {
    let salesQuery = supabase
      .from('amazon_sales_30d')
      .select('asin, sku, country, total_units, pending_units, shipped_units, payment_units, refreshed_at');
    if (profile?.company_id) salesQuery = salesQuery.eq('company_id', profile.company_id);
    else salesQuery = salesQuery.eq('user_id', profile?.id || null);
    const { data: salesRows, error: salesErr } = await salesQuery;
    if (salesErr) throw salesErr;
    setSalesSummary(buildSalesSummary(salesRows || []));
  } catch {
    setSalesSummary({});
  }
}, [
  profile?.company_id,
  profile?.id,
  setRowEdits,
  setQtyInputs,
  setPhotoCounts,
  setSalesSummary,
  setRows,
  setLoading,
  currentMarket
]);

useEffect(() => {
  if (status === 'loading') return;
  refreshStockData();
}, [status, refreshStockData]);

  useEffect(() => {
    if (keepaDisabledRef.current) return;
    let added = false;
    const queue = keepaQueueRef.current;
    rows.forEach((row) => {
      if (!row?.id || !row.asin) return;
      const hasGoodImage = row.image_url && !isBadImageUrl(row.image_url);
      if (hasGoodImage) return;
      if (!queue.has(row.id)) {
        queue.add(row.id);
        added = true;
      }
    });
    if (added && !keepaBusyRef.current) {
      processKeepaQueue();
    }
  }, [rows, processKeepaQueue]);

  useEffect(() => {
    const allowed = new Set(rows.map((r) => r.id));
    setSelectedIdList((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const filtered = arr.filter((id) => allowed.has(id));
      return filtered.length === arr.length ? prev : filtered;
    });
  }, [rows, setSelectedIdList]);

  const normalize = useCallback((value) => String(value || '').toLowerCase(), []);

  const matchScore = useCallback((value, term) => {
    if (!value || !term) return 0;
    const idx = value.indexOf(term);
    if (idx === -1) return 0;
    const prefixBonus = value.startsWith(term) ? 40 : 0;
    const closeness = Math.max(0, 60 - idx * 5);
    const lengthBonus = Math.max(0, 20 - Math.abs(value.length - term.length));
    return prefixBonus + closeness + lengthBonus;
  }, []);

  const searched = useMemo(() => {
    const q = normalize(searchQuery).trim();
    if (!q) return rows;

    const tokens = q.split(/\s+/).filter(Boolean);

    const computeNameScore = (rowValue) => {
      const hay = normalize(rowValue);
      if (!hay) return 0;
      const useTokens = tokens.length ? tokens : [q];
      let total = 0;
      for (const token of useTokens) {
        const tokenScore = matchScore(hay, token);
        if (tokenScore === 0) {
          total = 0;
          break;
        }
        total += tokenScore;
      }
      return total;
    };

    const scored = rows
      .map((row) => {
        let score = 0;
        if (searchField === 'EAN') {
          score = matchScore(normalize(row.ean), q);
          if (score === 0) {
            score = computeNameScore(row.name);
          }
        } else if (searchField === 'ASIN_SKU') {
          score = Math.max(matchScore(normalize(row.asin), q), matchScore(normalize(row.sku), q));
          if (score === 0) {
            score = computeNameScore(row.name);
          }
        } else {
          score = computeNameScore(row.name);
        }
        return { row, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ row }) => row);

    return scored;
  }, [rows, searchField, searchQuery, matchScore, normalize]);


  const stockFiltered = useMemo(() => {
    let base = searched;
    if (stockFilter === 'in') base = base.filter((r) => Number(r.qty || 0) > 0);
    if (stockFilter === 'out') base = base.filter((r) => Number(r.qty || 0) === 0);
    return base;
  }, [searched, stockFilter, photoCounts]);

  const quickFiltered = useMemo(() => {
    const term = normalize(productSearch).trim();
    const getSalesTotal = (row) => {
      const key = makeSalesKey(row.asin, row.sku);
      if (!key) return 0;
      const summary = salesSummary[key];
      if (!summary) return 0;
      let stats = null;
      if (summary.countries) {
        if (salesCountry === 'ALL') {
          stats = summary.countries.ALL || null;
        } else {
          stats = summary.countries[salesCountry] || null;
        }
      }
      if (!stats) return 0;
      const shipped = Number(stats.shipped ?? 0);
      const pending = Number(stats.pending ?? 0);
      const computedTotal = shipped + pending;
      return Number.isFinite(computedTotal) ? computedTotal : 0;
    };

    if (term) {
      const tokens = term.split(/\s+/).filter(Boolean);
      const scored = stockFiltered
        .map((row) => {
          const fields = [
            normalize(row.name),
            normalize(row.asin),
            normalize(row.sku),
            normalize(row.ean)
          ];
          const useTokens = tokens.length ? tokens : [term];
          let total = 0;
          for (const token of useTokens) {
            const tokenScore = Math.max(
              matchScore(fields[0], token),
              matchScore(fields[1], token) * 2,
              matchScore(fields[2], token) * 2,
              matchScore(fields[3], token) * 2
            );
            if (tokenScore === 0) {
              total = 0;
              break;
            }
            total += tokenScore;
          }
          return { row, score: total };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

      let result = scored.map(({ row }) => row);

      if (sortSpec?.direction && sortSpec.direction !== 'none') {
        result = [...result].sort((a, b) => {
          const getSortValue = (row) => {
            if (sortSpec.key === 'sales') return getSalesTotal(row);
            if (sortSpec.key === 'inventory') return Number(row.amazon_stock || 0);
            if (sortSpec.key === 'prep') return Number(row.qty_total ?? getPrepTotal(row) ?? 0);
            if (sortSpec.key === 'photo') {
              return Number(Number(photoCounts[row.id] || 0) > 0);
            }
            if (sortSpec.key === 'units') {
              const edit = rowEdits[row.id] || {};
              return Number(edit.units_to_send ?? row.units_to_send ?? 0);
            }
            return 0;
          };
          const ta = getSortValue(a);
          const tb = getSortValue(b);
          return sortSpec.direction === 'asc' ? ta - tb : tb - ta;
        });
      }

      return result;
    }

    let ordered = [...stockFiltered];

    if (sortSpec?.direction && sortSpec.direction !== 'none') {
      ordered.sort((a, b) => {
        const getSortValue = (row) => {
          if (sortSpec.key === 'sales') return getSalesTotal(row);
          if (sortSpec.key === 'inventory') return Number(row.amazon_stock || 0);
          if (sortSpec.key === 'prep') return Number(row.qty_total ?? getPrepTotal(row) ?? 0);
          if (sortSpec.key === 'photo') {
            return Number(Number(photoCounts[row.id] || 0) > 0);
          }
          if (sortSpec.key === 'units') {
            const edit = rowEdits[row.id] || {};
            return Number(edit.units_to_send ?? row.units_to_send ?? 0);
          }
          return 0;
        };
        const ta = getSortValue(a);
        const tb = getSortValue(b);
        return sortSpec.direction === 'asc' ? ta - tb : tb - ta;
      });
    }
    if (stockFilter !== 'all') return ordered;

    // Dacă sortăm după vânzări pe 30 de zile, nu mai
    // regrupăm după stoc în prep‑center; vrem ordonare pură după vânzări.
    if (sortSpec?.direction && sortSpec.direction !== 'none') {
      return ordered;
    }

    const withStock = ordered.filter((row) => Number(row.qty || 0) > 0);
    const withoutStock = ordered.filter((row) => Number(row.qty || 0) <= 0);
    return [...withStock, ...withoutStock];
  }, [
    stockFiltered,
    productSearch,
    sortSpec,
    stockFilter,
    matchScore,
    normalize,
    salesSummary,
    salesCountry,
    rowEdits
  ]);

  const totalPages = Math.max(1, Math.ceil(quickFiltered.length / perPage));
  const pageClamped = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (pageClamped - 1) * perPage;
    return quickFiltered.slice(start, start + perPage);
  }, [quickFiltered, pageClamped, perPage]);

  const hasAnyPhoto = useMemo(
    () => stockFiltered.some((row) => Number(photoCounts[row.id] || 0) > 0),
    [stockFiltered, photoCounts]
  );

  const isAllOnPageSelected =
    pageSlice.length > 0 && pageSlice.every((r) => selectedIds.has(r.id));
  const toggleSelectAllOnPage = () => {
    mutateSelectedIds((set) => {
      if (isAllOnPageSelected) {
        pageSlice.forEach((r) => set.delete(r.id));
      } else {
        pageSlice.forEach((r) => set.add(r.id));
      }
    });
  };

  const toggleSort = useCallback((key) => {
    if (key === 'photo' && !hasAnyPhoto) return;
    setSortSpec((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: key === 'photo' ? 'desc' : 'asc' };
      }
      if (key === 'photo') {
        if (prev.direction === 'desc') return { key: 'prep', direction: 'desc' };
        return { key, direction: 'desc' };
      }
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key: 'none', direction: 'none' };
      return { key, direction: 'asc' };
    });
    setPage(1);
  }, [setSortSpec, setPage, hasAnyPhoto]);
  const renderSortIcon = useCallback(
    (key) => {
      const direction = sortSpec?.key === key ? sortSpec.direction : 'none';
      if (direction === 'asc') return <ChevronUp className="w-3 h-3" />;
      if (direction === 'desc') return <ChevronDown className="w-3 h-3" />;
      return (
        <>
          <ChevronUp className="w-3 h-2 opacity-40" />
          <ChevronDown className="w-3 h-2 -mt-1 opacity-40" />
        </>
      );
    },
    [sortSpec]
  );
  const toggleSelectOne = (id) => {
    mutateSelectedIds((set) => {
      if (set.has(id)) set.delete(id);
      else set.add(id);
    });
  };
  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds]
  );

  const buildReturnItemsFromSelection = () => {
    if (!selectedRows.length) return [];
    return selectedRows.map((row) => {
      const edit = rowEdits[row.id] || {};
      const qty = Math.max(1, Number(edit.units_to_send || row.qty || 1));
      return {
        id: row.id,
        asin: row.asin,
        sku: row.sku,
        name: row.name,
        image_url: row.image_url,
        qty
      };
    });
  };

  const openReturnModal = () => {
    const prepared = buildReturnItemsFromSelection();
    if (!prepared.length) {
      setToast({ type: 'error', text: t('ClientStock.actions.needSelection') });
      return;
    }
    setReturnItems(prepared);
    setReturnInsideFiles([]);
    setReturnLabelFiles([]);
    setReturnNotes('');
    setReturnError('');
  };

  const isUuid = (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const uploadReturnFiles = async (type, fileList) => {
    if (!fileList || fileList.length === 0) return;
    if (!profile?.company_id) {
      setReturnError('Lipsește company_id.');
      return;
    }
    const bucket = 'returns';
    const arr = Array.from(fileList);
    const uploaded = [];
    for (const file of arr) {
      const path = `${profile.company_id}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined
      });
      if (error) {
        setReturnError(error.message);
        return;
      }
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
      uploaded.push({ name: file.name, url: path, signed_url: signed?.signedUrl || path, file_type: type });
    }
    if (type === 'inside') {
      setReturnInsideFiles((prev) => [...prev, ...uploaded]);
    } else {
      setReturnLabelFiles((prev) => [...prev, ...uploaded]);
    }
  };

  const removeReturnFile = (type, idx) => {
    if (type === 'inside') {
      setReturnInsideFiles((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setReturnLabelFiles((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const handleSubmitReturn = async () => {
    setReturnError('');
    if (!profile?.company_id) {
      setReturnError('Lipsește company_id.');
      return;
    }
    const itemsList = returnItems.length ? returnItems : buildReturnItemsFromSelection();
    if (!itemsList.length) {
      setReturnError(t('ClientStock.return.noItems') || 'Adaugă cel puțin un produs.');
      return;
    }
    const invalid = itemsList.find((it) => !Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0);
    if (invalid) {
      setReturnError(
        t('ClientStock.return.qtyError', { asin: invalid.asin || invalid.sku || '' }) ||
          `Cantitatea la ${invalid.asin || invalid.sku || 'produs'} nu poate fi 0`
      );
      return;
    }
    setSavingReturn(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      let { data: retRow, error: retErr } = await supabase
        .from('returns')
        .insert({
          company_id: profile.company_id,
          user_id: profile.id,
          marketplace: receptionForm.destinationCountry || 'FR',
          warehouse_country: currentMarket,
          return_date: today,
          status: 'pending',
          notes: returnNotes || null
        })
        .select('id')
        .single();
      if (retErr && String(retErr.message || '').toLowerCase().includes('warehouse_country')) {
        const retry = await supabase
          .from('returns')
          .insert({
            company_id: profile.company_id,
            user_id: profile.id,
            marketplace: receptionForm.destinationCountry || 'FR',
            return_date: today,
            status: 'pending',
            notes: returnNotes || null
          })
          .select('id')
          .single();
        retRow = retry.data;
        retErr = retry.error;
      }
      if (retErr) throw retErr;
      const itemsPayload = itemsList.map((it) => ({
        return_id: retRow.id,
        stock_item_id: isUuid(it.id) ? it.id : null,
        asin: it.asin || null,
        sku: it.sku || null,
        qty: Number(it.qty) || 0,
        notes: null
      }));
      const { error: itemsErr } = await supabase.from('return_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;
      const filesPayload = [
        ...returnInsideFiles.map((f) => ({ return_id: retRow.id, file_type: 'inside', url: f.url, name: f.name, mime_type: null })),
        ...returnLabelFiles.map((f) => ({ return_id: retRow.id, file_type: 'label', url: f.url, name: f.name, mime_type: null }))
      ];
      if (filesPayload.length) {
        const { error: filesErr } = await supabase.from('return_files').insert(filesPayload);
        if (filesErr) throw filesErr;
      }
      setReturnItems([]);
      setReturnInsideFiles([]);
      setReturnLabelFiles([]);
      setReturnNotes('');
      setReturnError('');
      setToast({ type: 'success', text: t('ClientStock.return.success') || 'Return creat' });
    } catch (e) {
      setReturnError(e?.message || 'Nu am putut salva returul.');
    } finally {
      setSavingReturn(false);
    }
  };
  const openDeleteListings = useCallback(async () => {
    if (selectedRows.length === 0) {
      setToast({ type: 'error', text: t('ClientStock.actions.needSelection') });
      return;
    }

    const normalizeKey = (value = '') => String(value || '').trim();
    const normalizeName = (value = '') => String(value || '').trim().toLowerCase();
    const matchSets = {
      asins: new Set(),
      skus: new Set(),
      eans: new Set(),
      names: new Set()
    };
    selectedRows.forEach((row) => {
      if (row.asin) matchSets.asins.add(normalizeKey(row.asin).toUpperCase());
      if (row.sku) matchSets.skus.add(normalizeKey(row.sku).toUpperCase());
      if (row.ean) matchSets.eans.add(normalizeKey(row.ean).toUpperCase());
      if (row.name) matchSets.names.add(normalizeName(row.name));
    });

    const idsToDeleteSet = new Set(selectedRows.map((row) => row.id));
    rows.forEach((row) => {
      if (row.asin) return;
      if (
        (row.sku && matchSets.skus.has(normalizeKey(row.sku).toUpperCase())) ||
        (row.ean && matchSets.eans.has(normalizeKey(row.ean).toUpperCase())) ||
        (row.name && matchSets.names.has(normalizeName(row.name)))
      ) {
        idsToDeleteSet.add(row.id);
      }
    });

    const hasPrepCenterStock = rows.some(
      (row) => idsToDeleteSet.has(row.id) && Number(row.qty || 0) > 0
    );
    if (hasPrepCenterStock) {
      setToast({ type: 'error', text: t('ClientStock.cta.deleteListingHasPrepStock') });
      return;
    }

    if (!window.confirm(t('ClientStock.cta.deleteListingConfirm'))) {
      return;
    }

    setDeleteInProgress(true);
    try {
      const idsToDelete = Array.from(idsToDeleteSet);
      await supabaseHelpers.deleteStockItems(idsToDelete);
      setToast({ type: 'success', text: t('ClientStock.cta.deleteListingSuccess') });
      setSelectedIdList([]);
      await refreshStockData();
    } catch (err) {
      console.error('Delete listings error', err);
      setToast({ type: 'error', text: supportError });
    } finally {
      setDeleteInProgress(false);
    }
  }, [rows, selectedRows, refreshStockData, setSelectedIdList, t, supportError]);
  useEffect(() => {
    if (!enableQtyAdjust) return;
    setQtyInputs({});
  }, [enableQtyAdjust, rows]);

const updateEdit = (id, patch) => {
    setRowEdits((prev) => {
      const current = prev[id] || {};
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'units_to_send')) {
        const units = Math.max(0, Number(patch.units_to_send) || 0);
        next.units_to_send = units;
        if (receptionForm.fbaMode === 'full') {
          next.fba_units = units;
        } else if (receptionForm.fbaMode === 'partial') {
          const prevUnits = Math.max(0, Number(current.units_to_send || 0));
          const hasFba = Object.prototype.hasOwnProperty.call(current, 'fba_units');
          const currentFba = Math.max(0, Number(current.fba_units || 0));
          const shouldSync = !hasFba || currentFba === prevUnits;
          if (shouldSync) {
            next.fba_units = units;
          } else if (currentFba > units) {
            next.fba_units = units;
          }
        } else {
          next.fba_units = 0;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'fba_units')) {
        const units = Math.max(0, Number(next.units_to_send || 0));
        let desired = Math.max(0, Number(patch.fba_units) || 0);
        if (desired > units) desired = units;
        next.fba_units = desired;
      }
      return { ...prev, [id]: next };
    });
  };
const resetSelectionsAndUnits = useCallback(() => {
  setSelectedIdList([]);
  setRowEdits((prev) => {
    const next = { ...prev };
    rows.forEach((r) => {
      next[r.id] = { ...(next[r.id] || {}), units_to_send: 0, fba_units: 0 };
    });
    return next;
  });
}, [rows, setSelectedIdList]);

const [savingId, setSavingId] = useState(null);
const handleReceptionFormChange = (field, value) => {
  setReceptionForm((prev) => ({ ...prev, [field]: value }));
};
useEffect(() => {
  if (!currentMarket) return;
  setReceptionForm((prev) => {
    if (prev?.destinationCountry === currentMarket) return prev;
    return { ...prev, destinationCountry: currentMarket };
  });
}, [currentMarket, setReceptionForm]);
const handleReceptionFbaModeChange = (mode) => {
  setReceptionForm((prev) => ({ ...prev, fbaMode: mode }));
  if (mode === 'full' || mode === 'none') {
    setRowEdits((prev) => {
      const next = { ...prev };
      selectedRows.forEach((row) => {
        const current = next[row.id] || {};
        const units = Math.max(0, Number(current.units_to_send || 0));
        next[row.id] = {
          ...current,
          fba_units: mode === 'full' ? units : 0,
        };
      });
      return next;
    });
  } else if (mode === 'partial') {
    setRowEdits((prev) => {
      const next = { ...prev };
      selectedRows.forEach((row) => {
        const current = next[row.id] || {};
        const units = Math.max(0, Number(current.units_to_send || 0));
        next[row.id] = {
          ...current,
          fba_units:
            Object.prototype.hasOwnProperty.call(current, 'fba_units') &&
            Number(current.fba_units || 0) !== 0
              ? Math.min(Number(current.fba_units || 0), units)
              : units,
        };
      });
      return next;
    });
  }
};
const trackingList = useMemo(
  () => sanitizeTrackingValues(receptionForm.trackingIds || []),
  [receptionForm.trackingIds]
);

const handleTrackingDraftChange = (value) => setTrackingDraft(value);

const handleTrackingAdd = () => {
  const value = trackingDraft.trim();
  if (!value) return;
  setReceptionForm((prev) => {
    const base = sanitizeTrackingValues(prev.trackingIds || []);
    if (base.includes(value)) return prev;
    return { ...prev, trackingIds: [...base, value] };
  });
  setTrackingDraft('');
  setTrackingPanelOpen(true);
};

const handleTrackingRemove = (index) => {
  setReceptionForm((prev) => {
    const base = sanitizeTrackingValues(prev.trackingIds || []);
    const filtered = base.filter((_, idx) => idx !== index);
    return { ...prev, trackingIds: filtered };
  });
};

useEffect(() => {
  if (trackingList.length === 0) {
    setTrackingPanelOpen(false);
  }
}, [trackingList.length]);

const resetReceptionForm = () => {
  setReceptionForm(() => createReceptionFormState());
  setTrackingPanelOpen(false);
  setTrackingDraft('');
};

  const notifyPrepCenterAboutReception = async (header, basePayload) => {
    const trackIds = Array.isArray(basePayload.tracking_ids)
      ? basePayload.tracking_ids
      : [];
    const altTracking = basePayload.tracking_id ? [basePayload.tracking_id] : [];
    const allTracking = trackIds.length ? trackIds : altTracking;
    const clientName =
      profile?.full_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      profile?.store_name ||
      null;
    const clientEmail = authCtx?.user?.email || profile?.email || null;
    const items = (basePayload.items || []).map((item) => ({
      asin: item.asin || null,
      ean: item.ean || null,
      sku: item.sku || null,
      product_name: item.product_name || null,
      quantity: item.units_requested || null,
    }));

    const { error } = await supabase.functions.invoke('send_reception_admin_email', {
      body: {
        shipment_id: header?.id || null,
        client_email: clientEmail,
      client_name: clientName,
      company_name: profile?.company_name || profile?.store_name || null,
      store_name: profile?.store_name || null,
      tracking_ids: allTracking,
      carrier: basePayload.carrier || null,
      notes: basePayload.notes || null,
      fba_mode: basePayload.fba_mode || null,
      destination_country: basePayload.destination_country || 'FR',
      country: basePayload.warehouse_country || basePayload.destination_country || 'FR',
      items,
    },
  });

    if (error) {
      throw error;
    }
  };
  const setQtyInputValue = (rowId, field, value) => {
    setQtyInputs((prev) => {
      const current = prev[rowId] || { dec: '', inc: '' };
      return { ...prev, [rowId]: { ...current, [field]: value } };
    });
  };
  const commitQtyAdjust = async (row, field) => {
    const inputs = qtyInputs[row.id] || {};
    const raw = String(inputs[field] || '').trim();
    if (!raw) return;
    const delta = Number(raw.replace(',', '.'));
    if (!Number.isFinite(delta) || delta <= 0) {
      setQtyInputValue(row.id, field, '');
      return;
    }
    const current = Number(row.qty || 0);
    const next = field === 'dec' ? Math.max(0, current - delta) : current + delta;
    try {
      const patch = buildPrepQtyPatch(row, currentMarket, next);
      const { error } = await supabase.from('stock_items').update(patch).eq('id', row.id);
      if (error) throw error;
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, ...patch, qty: next } : item
        )
      );
      setQtyInputValue(row.id, field, '');
      setToast({ type: 'success', text: 'Stock updated.' });
    } catch (err) {
      console.error('Adjust qty error', err);
      setToast({ type: 'error', text: supportError });
    }
  };
  const renderQtyCell = (row) => {
    const prepByCountry = getPrepCountryEntries(row);
    const prepTotal = Number(row.qty_total ?? getPrepTotal(row) ?? 0);
    if (prepTotal <= 0) {
      return null;
    }
    if (!enableQtyAdjust) {
      return (
        <div className="text-right">
          <div className="mt-1 text-[11px] leading-4 space-y-0.5">
            {prepByCountry.map(([code, qty]) => (
              <div key={`${row.id}-${code}`} className="font-semibold text-red-600">
                {code}-{qty}
              </div>
            ))}
          </div>
        </div>
      );
    }
    const inputs = qtyInputs[row.id] || { dec: '', inc: '' };
    const buildInput = (field, placeholder) => (
      <input
        type="text"
        inputMode="numeric"
        pattern="\\d*"
        className="border rounded text-right px-1.5 py-1 w-14 h-[32px] text-[13px]
          [appearance:textfield]
          [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none"
        value={inputs[field] || ''}
        placeholder={placeholder}
        onChange={(e) => setQtyInputValue(row.id, field, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitQtyAdjust(row, field);
          }
        }}
        onBlur={() => commitQtyAdjust(row, field)}
      />
    );
    return (
      <div className="grid grid-cols-[3.5rem_3.5rem_3.5rem] justify-end gap-x-2 gap-y-1">
        <div className="col-start-1">{buildInput('dec', '-')}</div>
        <div className="col-start-2 min-w-[3.5rem] text-center font-semibold self-center">
          {Number(row.qty ?? 0)}
        </div>
        <div className="col-start-3">{buildInput('inc', '+')}</div>
        {prepByCountry.length > 0 && (
          <div className="col-start-1 text-[11px] leading-4 space-y-0.5 text-left">
            {prepByCountry.map(([code, qty]) => (
              <div key={`${row.id}-${code}`} className="font-semibold text-red-600">
                {code}-{qty}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleProductCreated = (item) => {
    const [mapped] = mapStockRowsForMarket([item], currentMarket);
    setRows((prev) => [mapped, ...prev]);
    setToast({ type: 'success', text: t('ClientStock.createProduct.success') });
  };

  const saveRow = async (row) => {
    setSavingId(row.id);
    try {
      const edit = rowEdits[row.id] || {};
      const parsedPrice =
        edit.purchase_price === '' || edit.purchase_price == null
          ? null
          : Number(String(edit.purchase_price).replace(',', '.'));

      const patch = {};
      if ((edit.name || '') !== (row.name || '')) {
        patch.name = edit.name || null;
      }
      if ((edit.asin || '') !== (row.asin || '')) patch.asin = edit.asin || null;
      if ((edit.ean || '') !== (row.ean || '')) patch.ean = edit.ean || null;
      if ((edit.product_link || '') !== (row.product_link || '')) patch.product_link = edit.product_link || null;
      if ((edit.sku || '') !== (row.sku || '')) patch.sku = edit.sku || null;

      const currentPrice = row.purchase_price == null ? null : Number(row.purchase_price);
      if ((parsedPrice ?? null) !== (currentPrice ?? null)) patch.purchase_price = parsedPrice;

      if (Object.keys(patch).length === 0) {
        setToast({ type: 'success', text: t('ClientStock.table.nothingToSave') });
        return;
      }

      let { error } = await supabaseHelpers.updateStockItem(row.id, patch);

      if (error && /not allowed to change name/i.test(String(error.message))) {
        const { name, ...rest } = patch;
        if (Object.keys(rest).length) {
          const r2 = await supabaseHelpers.updateStockItem(row.id, rest);
          if (!r2.error) {
            setRows(prev =>
              prev.map(r => (r.id === row.id ? { ...r, ...rest } : r))
            );
            setToast({ type: 'success', text: t('ClientStock.table.savedNameAdminOnly') });
            return;
          }
          error = r2.error;
        }
      }

      if (error) throw error;

      setRows(prev =>
        prev.map(r => (r.id === row.id ? { ...r, ...patch } : r))
      );
      if (enableIdentifierEdit) {
        setRowEdits((prev) => {
          const current = prev[row.id] || {};
          const next = { ...current };
          ['asin', 'ean', 'sku', 'product_link', 'name', 'purchase_price'].forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(patch, field)) {
              next[field] =
                patch[field] == null
                  ? ''
                  : typeof patch[field] === 'number'
                  ? String(patch[field])
                  : patch[field];
            }
          });
          return { ...prev, [row.id]: next };
        });
      }
      setToast({ type: 'success', text: t('ClientStock.table.saved') });
    } catch (e) {
      console.error('[SAVE ERROR]', e);
      setToast({ type: 'error', text: supportError });
    } finally {
      setSavingId(null);
    }
  };

  const findStockRow = (id) => rows.find((r) => r.id === id);

  const openLinkEditor = (rowId) => {
    const server = (findStockRow(rowId)?.product_link) || '';
    const edited = (rowEdits[rowId]?.product_link) || '';
    const val = edited || server;
    setLinkEditor({ open: true, id: rowId, value: val });
  };
  const closeLinkEditor = () => setLinkEditor({ open: false, id: null, value: '' });
  const applyLinkEditor = () => {
    if (!linkEditor.id) return;
    updateEdit(linkEditor.id, { product_link: linkEditor.value.trim() });
    closeLinkEditor();
  };

const getReceptionFbaForRow = (rowId, units) => {
  if (receptionForm.fbaMode === 'full') {
    const send = units > 0;
    return { send_to_fba: send, fba_qty: send ? units : null };
  }
  if (receptionForm.fbaMode === 'partial') {
    const edits = rowEdits[rowId] || {};
    const requested = Math.max(0, Number(units) || 0);
    const hasCustomFba = Object.prototype.hasOwnProperty.call(edits, 'fba_units');
    let partial = hasCustomFba
      ? Math.max(0, Number(edits.fba_units) || 0)
      : requested;
    if (partial > requested) partial = requested;
    const send = partial > 0;
    return { send_to_fba: send, fba_qty: send ? partial : null };
  }
  return { send_to_fba: false, fba_qty: null };
};

const openReception = async () => {
  if (selectedRows.length === 0) {
    setToast({ type: 'error', text: 'Select products to announce reception.' });
    return;
  }

  const carrierCode = receptionForm.carrier || null;
  const trackingValues = trackingList.filter(
    (val, idx, arr) => val && arr.indexOf(val) === idx
  );
  const primaryTracking = trackingValues[0] || null;
  // Preluăm unitățile introduse în coloana “Units to Send / Receive”
  const payload = {
    company_id: profile.company_id,
    user_id: profile.id,
    warehouse_country: currentMarket,
    destination_country: (receptionForm.destinationCountry || 'FR').toUpperCase(),
    carrier: carrierCode,
    carrier_other:
      carrierCode === 'OTHER'
        ? (receptionForm.carrierOther || '').trim() || null
        : null,
    store_name: (receptionForm.storeName || '').trim() || null,
    tracking_id: primaryTracking,
    tracking_ids: trackingValues.length ? trackingValues : null,
    notes: (receptionForm.notes || '').trim() || null,
    fba_mode: receptionForm.fbaMode || 'none',
    items: selectedRows.map(r => {
      const units = Number(rowEdits[r.id]?.units_to_send || 0);
      const fbaInfo = getReceptionFbaForRow(r.id, units);
      return {
      stock_item_id: r.id,
      ean: r.ean || null,
      product_name: r.name || null,
      asin: r.asin || null,
      sku: r.sku || null,
      units_requested: units,
      send_to_fba: fbaInfo.send_to_fba,
      fba_qty: fbaInfo.fba_qty,
    };
    }),
    status: 'submitted',
  };

  // Validare rapidă — să nu trimită 0 unități
  const invalid = payload.items.some(i => !i.units_requested || i.units_requested < 1);
  if (invalid) {
    setToast({ type: 'error', text: 'Enter valid quantities before announcing reception.' });
    return;
  }

  try {
    const header = await supabaseHelpers.createReceptionRequest(payload);
    if (!header?.id) {
      throw new Error('Missing receiving reference');
    }

    setToast({ type: 'success', text: 'Reception announced successfully.' });
    resetSelectionsAndUnits();
    setSelectedIdList([]);
    resetReceptionForm();

    notifyPrepCenterAboutReception(header, payload).catch((err) => {
      console.error('notifyPrepCenterAboutReception failed', err);
    });
  } catch (err) {
    console.error('Reception error:', err);
    setToast({ type: 'error', text: supportError });
  }
};

const openPrep = async () => {
  const selectedRows = rows.filter(r => selectedIds.has(r.id));

  if (selectedRows.length === 0) {
    setToast({ type: 'error', text: t('ClientStock.actions.needSelection') });
    return;
  }

  // verificare dacă au stoc în Prep Center (>0)
  const noPrepStock = selectedRows.filter(r => Number(r.qty || 0) <= 0);
  if (noPrepStock.length > 0) {
    setToast({
      type: 'error',
      text: tp('ClientStock.errors.noPrepStock', {
        products: noPrepStock
          .map(r => r.name || r.asin || r.sku || r.ean || 'Unknown')
          .join(', ')
      }),
    });
    return;
  }

  const payload = {
    company_id: profile.company_id,
    user_id: profile.id,
    warehouse_country: currentMarket,
    destination_country: (receptionForm.destinationCountry || 'FR').toUpperCase(),
    items: selectedRows.map(r => ({
      stock_item_id: r.id,
      ean: r.ean || null,
      product_name: r.name || null,
      asin: r.asin || null,
      sku: r.sku || null,
      units_requested: Number(rowEdits[r.id]?.units_to_send || 0),
    })),
    status: 'pending',
  };

  const invalid = payload.items.some(i => !i.units_requested || i.units_requested < 1);
  if (invalid) {
    setToast({ type: 'error', text: 'Enter valid quantities before sending to prep.' });
    return;
  }

  try {
    const { error } = await supabaseHelpers.createPrepRequest(payload);
    if (error) throw error;
    setToast({ type: 'success', text: 'Preparation request sent successfully.' });
    resetSelectionsAndUnits();
    setSelectedIdList([]);
  } catch (err) {
    console.error('Prep error:', err);
    setToast({ type: 'error', text: supportError });
  }
};

// ===== Request Editor logic =====
const openReqEditor = async (requestId) => {
  setReqOpen(true);
  setReqLoading(true);
  setReqErrors([]);
  try {
    const { data, error } = await supabaseHelpers.getPrepRequest(requestId);
    if (error) throw error;

    setReqHeader({
      id: data.id,
      destination_country: data.destination_country,
      status: data.status,
      created_at: data.created_at,
      fba_shipment_id: data.fba_shipment_id || null,
      tracking: Array.isArray(data.prep_request_tracking) ? data.prep_request_tracking : [],
    });

    const lines = Array.isArray(data.prep_request_items) ? data.prep_request_items : [];
    setReqLines(lines.map(it => ({
      id: it.id,
      stock_item_id: it.stock_item_id ?? null,
      asin: it.asin ?? '',
      sku: it.sku ?? '',
      units_requested: Number(it.units_requested || 0),
    })));

    setReqEditable((data.status || 'pending') === 'pending');
  } catch (e) {
    setReqErrors([supportError]);
  } finally {
    setReqLoading(false);
  }
};

const updateReqLine = (id, patch) => {
  setReqLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
};

const removeReqLine = (id) => {
  setReqLines(prev => prev.filter(l => l.id !== id));
};
// ——— meta (EAN + nume) din stock pe baza stock_item_id
const getStockMeta = (line) => {
  const st = line?.stock_item_id ? rows.find(r => r.id === line.stock_item_id) : null;
  return {
    ean: (line?.ean || st?.ean || '') || '',
    name: st?.name || '',
  };
};

// ——— un singur câmp pentru ASIN / SKU: dacă arată ca ASIN (10 alfanumerice, cu litere) -> asin, altfel -> sku
const setAsinOrSku = (id, value) => {
  const raw = String(value || '').trim().toUpperCase();
  const isAsin = /^[A-Z0-9]{10}$/.test(raw) && /[A-Z]/.test(raw);
  if (isAsin) updateReqLine(id, { asin: raw, sku: '' });
  else updateReqLine(id, { sku: value, asin: '' });
};

const startAddItem = () => {
  setAdding(true);
  setAddingSel('');
  setAddingQty('');
};
const cancelAddItem = () => {
  setAdding(false);
  setAddingSel('');
  setAddingQty('');
};

// adaugă o linie nouă locală (se inserează în DB la Save)
const confirmAddItem = () => {
  const stockId = String(addingSel || '').trim();
  const qty = Number(addingQty);
  const stock = rows.find(r => String(r.id) === stockId);
  const errs = [];

  if (!stock) errs.push('Select a product from stock.');
  if (!Number.isFinite(qty) || qty < 1) errs.push('Quantity must be at least 1.');
  if (stock && Number(stock.qty || 0) < qty) errs.push(`Quantity exceeds available stock (${stock.qty}).`);

  if (errs.length) { setReqErrors(errs); return; }

  setReqLines(prev => ([
    ...prev,
    {
      id: null, // important: null -> va fi INSERT la Save
      stock_item_id: stock.id,
      asin: stock.asin || '',
      sku: '',
      units_requested: qty,
    }
  ]));
  cancelAddItem();
};

const saveReqChanges = async () => {
  if (!reqHeader?.id || !reqEditable) return;

  const errs = [];
  reqLines.forEach((l, i) => {
    const n = i + 1;
    const hasCode = Boolean(String(l.asin || '').trim() || String(l.sku || '').trim());
    if (!hasCode) errs.push(`Line ${n}: ASIN or SKU is required.`);
    if (!Number.isFinite(Number(l.units_requested)) || Number(l.units_requested) < 1) {
      errs.push(`Line ${n}: quantity must be >= 1.`);
    }
    if (l.stock_item_id) {
      const st = rows.find(r => r.id === l.stock_item_id);
      if (st && Number(st.qty || 0) < Number(l.units_requested)) {
        errs.push(`Line ${n}: quantity exceeds available stock (${st.qty}).`);
      }
    }
  });
  if (errs.length) { setReqErrors(errs); return; }

  try {
    setReqLoading(true);
    setReqErrors([]);

    // re-check status (poate s-a confirmat între timp)
    const { data: check } = await supabaseHelpers.getPrepRequest(reqHeader.id);
    if ((check?.status || 'pending') !== 'pending') {
      setReqEditable(false);
      setReqErrors(['Request is no longer editable (status changed).']);
      return;
    }

    const orig = Array.isArray(check?.prep_request_items) ? check.prep_request_items : [];
    const origById = {};
    orig.forEach(o => { if (o.id) origById[o.id] = o; });

    const currentIds = new Set(reqLines.filter(l => l.id).map(l => l.id));
    const toDelete = orig.filter(o => !currentIds.has(o.id));
    const toInsert = reqLines.filter(
      (l) =>
        !l.id &&
        (
          l.stock_item_id ||
          (l.product_name && l.product_name.trim && l.product_name.trim()) ||
          (l.ean && l.ean.trim()) ||
          (l.asin && l.asin.trim())
        )
    );
    const toUpdate = reqLines.filter(l => l.id && origById[l.id]);

    for (const d of toDelete) {
      const { error } = await supabaseHelpers.deletePrepItem(d.id);
      if (error) throw error;
    }

    for (const ins of toInsert) {
      const st = rows.find(r => r.id === ins.stock_item_id) || {};
      const resolvedStockId = await ensureStockItemId(ins, rows, setRows, profile, currentMarket);
      if (resolvedStockId && !ins.stock_item_id) {
        ins.stock_item_id = resolvedStockId;
      }
      const payload = {
        stock_item_id: resolvedStockId || null,
        ean: st.ean ?? ins.ean ?? null,
        product_name: st.name ?? ins.product_name ?? null,
        asin: ins.asin || st.asin || null,
        sku: ins.sku || st.sku || null,
        units_requested: Math.max(1, Number(ins.units_requested) || 0)
      };
      const { error } = await supabaseHelpers.createPrepItem(reqHeader.id, payload);
      if (error) throw error;
    }

    for (const u of toUpdate) {
      const base = origById[u.id];
      const patch = {};
      if ((u.asin || '') !== (base.asin || '')) patch.asin = (u.asin || '').trim() || null;
      if ((u.sku || '') !== (base.sku || '')) patch.sku = (u.sku || '').trim() || null;
      if (Number(u.units_requested) !== Number(base.units_requested)) {
        patch.units_requested = Number(u.units_requested);
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabaseHelpers.updatePrepItem(u.id, patch);
        if (error) throw error;
      }
    }

    // reîncarc vizualizarea și istoria
    await openReqEditor(reqHeader.id);

    setToast({ type: 'success', text: 'Saved changes.' });
  } catch (e) {
    setReqErrors([supportError]);
  } finally {
    setReqLoading(false);
  }
};

  return (
    <div>
      {toast && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.text}
        </div>
      )}
      {/* HEADER */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center">
            <h2 className="text-xl font-semibold text-text-primary whitespace-nowrap">
              {t('ClientStock.title')}
            </h2>
          </div>

          <p className="text-sm text-text-secondary">{t('ClientStock.desc')}</p>
        </div>

        <div className="flex flex-col gap-1 items-stretch sm:items-end text-left sm:text-right">
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              onClick={() => setQuickAddOpen((open) => !open)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold shadow transition-colors ${
                quickAddOpen
                  ? 'bg-primary text-white'
                  : 'bg-[#ffb703] text-[#4f2a00] hover:bg-[#ff9f00]'
              }`}
            >
              <Plus className="w-4 h-4" />
              {t('ClientStock.createProduct.button')}
            </button>
            {!hideGuides && (
              <UserGuidePlayer
                section="stock"
                title={t('ClientStock.guides.button')}
                unavailableText={t('ClientStock.guides.unavailable', { section: 'stock' })}
              />
            )}
            <button
              type="button"
              aria-pressed={showPriceColumn}
              onClick={() => setShowPriceColumn((prev) => !prev)}
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                showPriceColumn
                  ? 'bg-primary text-white border-primary'
                  : 'text-primary border-primary hover:bg-primary/5'
              }`}
            >
              {showPriceColumn
                ? t('ClientStock.priceColumn.hide')
                : t('ClientStock.priceColumn.show')}
            </button>
          </div>
        </div>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      </div>

      {quickAddOpen && (
        <div className="mb-6">
          <ProductQuickAdd
            companyId={profile?.company_id || null}
            userId={profile?.id || null}
            createdBy={profile?.id || null}
            existingRows={rows}
            labels={quickAddLabels}
            onComplete={handleQuickAddComplete}
            onError={handleQuickAddError}
          />
        </div>
      )}

      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAllOnPageSelected}
              onChange={toggleSelectAllOnPage}
            />
            {t('ClientStock.actions.selectAllOnPage')}
          </label>
          <span className="text-xs text-text-secondary">Total: {rows.length}</span>
        </div>
      </div>

      <ClientStockSelectionBar
        t={t}
        tp={tp}
        selectedIds={selectedIds}
        submitType={submitType}
        setSubmitType={setSubmitType}
        receptionForm={receptionForm}
        onReceptionFormChange={handleReceptionFormChange}
        destinationCountries={DESTINATION_COUNTRIES}
        carrierOptions={carrierOptions}
        trackingDraft={trackingDraft}
        onTrackingDraftChange={handleTrackingDraftChange}
        onTrackingAdd={handleTrackingAdd}
        trackingList={trackingList}
        trackingPanelOpen={trackingPanelOpen}
        onToggleTrackingPanel={() => setTrackingPanelOpen((prev) => !prev)}
        onTrackingRemove={handleTrackingRemove}
        onReceptionFbaModeChange={handleReceptionFbaModeChange}
        selectedRows={selectedRows}
        rowEdits={rowEdits}
        updateEdit={updateEdit}
        openPrep={openPrep}
        openReception={openReception}
        openReturn={openReturnModal}
        onDelete={openDeleteListings}
        deleteInProgress={deleteInProgress}
        clearSelection={() => setSelectedIdList([])}
        returnError={returnError}
        returnNotes={returnNotes}
        onReturnNotesChange={setReturnNotes}
        returnInsideFiles={returnInsideFiles}
        returnLabelFiles={returnLabelFiles}
        onReturnFilesUpload={uploadReturnFiles}
        onReturnFileRemove={removeReturnFile}
        onReturnSubmit={handleSubmitReturn}
        savingReturn={savingReturn}
      />

      <div className="border rounded-lg overflow-hidden mt-2">
        <div className="w-full overflow-x-auto">
         <table className="w-full min-w-[900px] text-sm table-auto [&_th]:px-1 [&_td]:px-1 [&_th]:py-1 [&_td]:py-1">
  <thead className="bg-gray-50 text-gray-700">
    <tr>
      <th className="px-2 py-2 w-6"></th>
      <th className="px-2 py-2 text-left w-16">
        <button
          type="button"
          onClick={() => toggleSort('photo')}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-primary"
        >
          <span>Photo</span>
          <span className="inline-flex flex-col leading-none">
            {renderSortIcon('photo')}
          </span>
        </button>
      </th>
      <th className="px-2 py-2 text-left">
        <div className="flex flex-col gap-1">
          <span>{t('ClientStock.thead.name')}</span>
          <div className="relative">
            <input
              type="text"
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('ClientStock.productSearchPlaceholder')}
              className="border rounded px-2 py-1 pr-7 text-xs w-full"
            />
            {productSearch && (
              <button
                type="button"
                onClick={() => {
                  setProductSearch('');
                  setPage(1);
                }}
                className="absolute inset-y-0 right-1 flex items-center justify-center text-gray-400 hover:text-gray-600"
                aria-label={t('common.cancel')}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </th>
      {showPriceColumn && (
        <th className="px-2 py-2 text-right w-20">
          <div className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 relative group">
            <span>{t('ClientStock.priceColumn.label')}</span>
            <Info className="w-3.5 h-3.5 text-amber-500" />
            {priceColumnNote && (
              <div className="pointer-events-none absolute right-0 top-full mt-2 hidden w-48 rounded-md border border-gray-900 bg-gray-900/95 p-2 text-[11px] text-white shadow-xl group-hover:block z-20">
                {priceColumnNote}
              </div>
            )}
          </div>
        </th>
      )}
      {showSalesColumn && (
      <th className="px-2 py-2 text-left w-40 align-top">
        <div className="flex flex-col gap-1 items-center text-center">
          <button
            type="button"
            onClick={() => toggleSort('sales')}
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-primary"
          >
            <span>{t('ClientStock.sales.heading')}</span>
            <span className="inline-flex flex-col leading-none">
              {renderSortIcon('sales')}
            </span>
          </button>
          <select
            className="border rounded px-2 py-1 text-xs text-center"
            value={salesCountry}
            onChange={(e) => setSalesCountry(e.target.value)}
          >
            {SALES_COUNTRIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.value === 'ALL' ? t('ClientStock.sales.all') : opt.label}
              </option>
            ))}
          </select>
        </div>
      </th>
      )}
      <th className="px-2 py-2 text-left w-40">
        <button
          type="button"
          onClick={() => toggleSort('inventory')}
          className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-primary whitespace-pre-line"
        >
          <span>{t('ClientStock.inventory.subtitle')}</span>
          <span className="inline-flex flex-col leading-none">
            {renderSortIcon('inventory')}
          </span>
        </button>
      </th>
      <th className="px-2 py-2 text-right w-24">
        <button
          type="button"
          onClick={() => toggleSort('prep')}
          className="w-full inline-flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-primary"
        >
          <span>PrepCenter stock</span>
          <span className="inline-flex flex-col leading-none">
            {renderSortIcon('prep')}
          </span>
        </button>
      </th>
      <th className="px-2 py-2 text-right w-32">
        <button
          type="button"
          onClick={() => toggleSort('units')}
          className="w-full inline-flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-primary"
        >
          <span>Units to Send / Receive</span>
          <span className="inline-flex flex-col leading-none">
            {renderSortIcon('units')}
          </span>
        </button>
      </th>
    </tr>
  </thead>
    <tbody>
    {pageSlice.map((r) => {
      const checked = selectedIds.has(r.id);
      const edit = rowEdits[r.id] || {};
      const photoCount = Number(photoCounts[r.id] || 0);
      const hasPhotos = photoCount > 0;
      const originalAsin = r.asin ?? '';
      const originalEan = r.ean ?? '';
      const originalSku = r.sku ?? '';
      const asinValue = edit.asin ?? originalAsin;
      const eanValue = edit.ean ?? originalEan;
      const skuValue = edit.sku ?? originalSku;
      const identifierDirty =
        enableIdentifierEdit &&
        ((asinValue || '') !== (r.asin || '') ||
          (eanValue || '') !== (r.ean || '') ||
          (skuValue || '') !== (r.sku || ''));
      const serverPrice = r.purchase_price == null ? '' : String(r.purchase_price);
      const priceDraft = edit.purchase_price ?? serverPrice;
      const priceInputValue = priceDraft == null ? '' : String(priceDraft);
      const priceDirty = priceInputValue !== serverPrice;
      const renderIdentifierField = (label, value, key, placeholder, copyKey) => {
        if (enableIdentifierEdit) {
          const currentValue = (edit[key] ?? value ?? '').toString();
          return (
            <div className="flex items-center text-xs gap-2">
              <span className="font-semibold text-gray-500 select-none">{label}</span>
              <input
                type="text"
                className="border rounded px-2 py-1 text-xs w-28"
                value={currentValue}
                placeholder={placeholder}
                onChange={(e) => updateEdit(r.id, { [key]: e.target.value })}
              />
              {key === 'sku' && (
                <button
                  className="ml-auto px-2 py-1 text-[11px] rounded border border-primary text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                  disabled={!identifierDirty || savingId === r.id}
                  onClick={() => saveRow(r)}
                >
                  {savingId === r.id ? t('ClientStock.table.saving') : 'Save'}
                </button>
              )}
            </div>
          );
        }
        return (
          <div className="flex items-center text-xs">
            <span className="font-semibold text-gray-500 mr-1 select-none">{label}</span>
            <span
              className="font-mono text-gray-800 cursor-pointer select-text"
              onDoubleClick={(e) => handleCodeCopy(e, r.id, copyKey, value)}
              title={`Double-click to copy ${label}`}
            >
              {value || '—'}
            </span>
            {copyToast?.rowId === r.id && copyToast?.field === copyKey && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-green-600">
                <Check className="w-3 h-3" /> {t('ClientStock.copyInline')}
              </span>
            )}
          </div>
        );
      };
      return (
        <tr key={r.id} className="border-t align-middle">
          {/* 1) Checkbox */}
          <td className="px-2 py-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleSelectOne(r.id)}
            />
          </td>

          {/* 2) Photo */}
          <td className="px-2 py-2 align-top">
            <div className="flex flex-col items-center gap-1">
              {r.image_url ? (
                <img
                  src={r.image_url}
                  alt={r.name || 'Product image'}
                  className="w-16 h-16 object-contain rounded border"
                />
              ) : (
                <div className="w-16 h-16 bg-gray-100 border rounded flex items-center justify-center text-gray-400 text-xs">
                  No Img
                </div>
              )}
              <button
                type="button"
                onClick={() => setPhotoItem(r)}
                className="inline-flex items-center text-[11px] text-primary hover:underline"
              >
                <ImageIcon className="w-3 h-3 mr-1" /> {t('ClientStock.photos.button')}
              </button>
              <div className="text-[11px] text-gray-500 text-center leading-tight">
                {hasPhotos
                  ? tp('ClientStock.photos.statusAvailable', { count: photoCount })
                  : t('ClientStock.photos.statusUnavailable')}
              </div>
            </div>
          </td>
{/* 3) Product */}
<td className="px-2 py-2 align-top max-w-[360px]">
  <div
    className="text-[#007185] font-medium leading-snug break-words whitespace-normal"
    style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
  >
    {r.name
      ? r.name.length > 150
        ? r.name.slice(0, 150)
        : r.name
      : '—'}
  </div>
    <div className="mt-2 text-xs text-gray-600 flex flex-col gap-1">
      {renderIdentifierField('ASIN', r.asin, 'asin', 'B0...', 'ASIN')}
      {renderIdentifierField('SKU', r.sku, 'sku', 'SKU...', 'SKU')}
      {renderIdentifierField('EAN', r.ean, 'ean', 'EAN...', 'EAN')}
    </div>
</td>
{showPriceColumn && (
  <td className="px-2 py-2 align-top text-right w-20">
    <div className="flex flex-col items-end gap-1 text-xs">
      <input
        type="number"
        step="0.01"
        min={0}
        inputMode="decimal"
        className="w-20 border rounded px-2 py-1 text-right"
        value={priceInputValue}
        placeholder={t('ClientStock.priceColumn.placeholder')}
        onChange={(e) => updateEdit(r.id, { purchase_price: e.target.value })}
      />
      <button
        type="button"
        className="px-2 py-1 text-[11px] rounded border border-primary text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
        disabled={!priceDirty || savingId === r.id}
        onClick={() => saveRow(r)}
      >
        {savingId === r.id ? t('ClientStock.table.saving') : t('ClientStock.priceColumn.save')}
      </button>
    </div>
  </td>
)}

          {/* 4) 30-day sales breakdown */}
          {showSalesColumn && (
          <td className="px-2 py-2 align-top">
            {(() => {
              const key = makeSalesKey(r.asin, r.sku);
              const summary = key ? salesSummary[key] : null;
              let stats = null;
              if (summary?.countries) {
                if (salesCountry === 'ALL') {
                  stats = summary.countries.ALL || null;
                } else {
                  stats = summary.countries[salesCountry] || null;
                }
              }
              const countryLabel =
                salesCountry === 'ALL'
                  ? t('ClientStock.sales.all')
                  : COUNTRY_LABEL_LOOKUP[salesCountry] || salesCountry;
              return (
                <SalesBreakdown
                  totalUnits={stats?.total ?? 0}
                  refreshedAt={summary?.refreshed_at}
                  countryLabel={countryLabel}
                  t={t}
                />
              );
            })()}
          </td>
          )}

          {/* 5) Inventory breakdown */}
          <td className="px-2 py-2 align-top">
            <InventoryBreakdown row={r} t={t} />
          </td>

    {/* 6) PrepCenter stock — afișare / ajustare */}
    <td className="px-2 py-2 text-right text-gray-700">
      {renderQtyCell(r)}
    </td>


          {/* 7) Units to Send / Receive — input */}
          <td className="px-2 py-2 text-right">
           <input
            type="number"
            min={0}
            className="border rounded px-2 py-1 w-24 text-right"
            value={edit.units_to_send ?? 0}
            onChange={(e) => {
              const v = e.target.value;
              updateEdit(r.id, { units_to_send: v });
              mutateSelectedIds((set) => {
                if (Number(v) > 0) set.add(r.id);
                else set.delete(r.id);
              });
            }}
          />
          </td>
        </tr>
      );
    })}
  </tbody>
</table>

        </div>

        <div className="px-3 py-2 border-t bg-white flex items-center justify-end gap-2 text-sm">
          <span className="text-text-secondary">{t('ClientStock.pager.rows')}</span>
          <select
            className="border rounded px-2 py-1"
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>

          <button
            className="border rounded px-2 py-1 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pageClamped <= 1}
            aria-label="Previous page"
          >
            {t('ClientStock.pager.prev')}
          </button>
          <span>
            {tp('ClientStock.pager.pageXofY', { x: pageClamped, y: totalPages })}
          </span>
          <button
            className="border rounded px-2 py-1 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={pageClamped >= totalPages}
            aria-label="Next page"
          >
            {t('ClientStock.pager.next')}
          </button>
        </div>
      </div>


      {/* ===== Request View/Edit Drawer ===== */}
      {reqOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[110]"
          onClick={() => setReqOpen(false)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header: titlu simplu, fără Back/Save */}
      <div className="sticky top-0 z-[120] bg-white/95 backdrop-blur border-b px-6 py-3">
        <h3 className="text-lg font-semibold">
          {reqEditable ? 'Preparation request (Pending – editable)' : 'Preparation request (Read-only)'}
        </h3>
      </div>

      {reqLoading ? (
        <div className="text-sm text-text-secondary py-8 px-6">Loading…</div>
      ) : (
        <>
          {/* Header read-only */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm px-6 pt-4">
            <div><span className="text-text-secondary">Date:</span> {reqHeader?.created_at?.slice(0,10) || '—'}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-text-secondary">Country:</span>
              <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 uppercase">
                {(reqHeader?.destination_country || 'FR').toUpperCase()}
              </span>
              <span className="text-sm text-text-secondary">
                {t(`ClientStock.countries.${reqHeader?.destination_country || 'FR'}`)}
              </span>
            </div>
            <div><span className="text-text-secondary">Status:</span> {reqHeader?.status || 'pending'}</div>
            <div><span className="text-text-secondary">FBA Shipment ID:</span> {reqHeader?.fba_shipment_id || '—'}</div>
          </div>

          {/* Tracking badges */}
          <div className="px-6 mb-4">
            <div className="text-sm text-text-secondary mb-1">Tracking:</div>
            <TrackingBadges list={reqHeader?.tracking || []} max={3} t={t} />
          </div>

          {/* Error display */}
          {reqErrors.length > 0 && (
            <div className="mx-6 mb-4 rounded-md border border-red-200 bg-red-50 text-red-700 p-3 text-sm space-y-1">
              {reqErrors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}

          {/* Lines table */}
          <div className="px-6 mb-4">
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-text-secondary">
                  <tr>
                    <th className="px-2 py-2 text-left">EAN</th>
                    <th className="px-2 py-2 text-left">Product name</th>
                    <th className="px-2 py-2 text-left">ASIN / SKU</th>
                    <th className="px-2 py-2 text-right">Units</th>
                    {reqEditable && <th className="px-2 py-2 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {reqLines.length === 0 ? (
                    <tr className="border-t">
                      <td colSpan={reqEditable ? 5 : 4} className="px-2 py-6 text-center text-gray-400">
                        No items in this request
                      </td>
                    </tr>
                  ) : (
                    reqLines.map((line) => {
                      const meta = getStockMeta(line);
                      const code = String(line.asin || '').trim() || String(line.sku || '').trim() || '—';
                      return (
                        <tr key={line.id || line.stock_item_id} className="border-t">
                          <td className="px-2 py-2 font-mono text-xs">{meta.ean || '—'}</td>
                          <td className="px-2 py-2">{meta.name || '—'}</td>
                          <td className="px-2 py-2">
                            {reqEditable ? (
                              <input
                                className="border rounded px-2 py-1 w-full"
                                value={code}
                                onChange={(e) => setAsinOrSku(line.id, e.target.value)}
                              />
                            ) : (
                              code
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {reqEditable ? (
                              <input
                                type="number"
                                min={1}
                                className="border rounded px-2 py-1 w-20 text-right"
                                value={line.units_requested}
                                onChange={(e) => updateReqLine(line.id, { units_requested: Number(e.target.value) })}
                              />
                            ) : (
                              line.units_requested
                            )}
                          </td>
                          {reqEditable && (
                            <td className="px-2 py-2 text-center">
                              <button
                                className="text-xs border rounded px-2 py-1 text-red-600 hover:bg-red-50"
                                onClick={() => removeReqLine(line.id)}
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add new item UI (only if editable) */}
          {reqEditable && !adding && (
            <div className="px-6 mb-4">
              <button
                className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
                onClick={startAddItem}
              >
                + Add Item
              </button>
            </div>
          )}
          {reqEditable && adding && (
            <div className="px-6 mb-4 border rounded-lg p-3 bg-gray-50">
              <div className="mb-2 text-sm font-semibold">Add New Item</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Select Product</label>
                  <select
                    className="border rounded px-2 py-1 w-full text-sm"
                    value={addingSel}
                    onChange={(e) => setAddingSel(e.target.value)}
                  >
                    <option value="">—</option>
                    {rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.ean || 'No EAN'} — {r.name || 'Unnamed'} (Stock: {r.qty})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    className="border rounded px-2 py-1 w-full text-right"
                    value={addingQty}
                    onChange={(e) => setAddingQty(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="text-xs border rounded px-3 py-1"
                  onClick={cancelAddItem}
                >
                  Cancel
                </button>
                <button
                  className="text-xs bg-primary text-white rounded px-3 py-1"
                  onClick={confirmAddItem}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Save + Close buttons (only if editable) */}
          {reqEditable && (
            <div className="px-6 mb-6 flex justify-end gap-2">
              <button
                className="border rounded px-4 py-2"
                onClick={() => setReqOpen(false)}
              >
                Close
              </button>
              <button
                className="bg-primary text-white rounded px-4 py-2"
                onClick={saveReqChanges}
              >
                Save Changes
              </button>
            </div>
          )}
          {!reqEditable && (
            <div className="px-6 mb-6 flex justify-end">
              <button
                className="border rounded px-4 py-2"
                onClick={() => setReqOpen(false)}
              >
                Close
              </button>
            </div>
          )}
        </>
      )}
    </div>
  </div>
)}
      <ProductPhotosModal
        open={!!photoItem}
        onClose={() => setPhotoItem(null)}
        stockItem={photoItem}
        companyId={profile?.company_id}
        canEdit
        onPhotoCountChange={(count) => {
          if (!photoItem?.id) return;
          setPhotoCounts((prev) => {
            if (prev[photoItem.id] === count) return prev;
            return { ...prev, [photoItem.id]: count };
          });
        }}
      />
    </div>
  );
}
const normalizeCode = (value) => String(value || '').trim().toLowerCase();

const findStockMatch = (line, rows) => {
  const ean = normalizeCode(line.ean || line.ean_asin);
  if (ean) {
    const match = rows.find((item) => normalizeCode(item.ean) === ean);
    if (match) return match;
  }
  const asin = normalizeCode(line.asin);
  if (asin) {
    const match = rows.find((item) => normalizeCode(item.asin) === asin);
    if (match) return match;
  }
  const sku = normalizeCode(line.sku);
  if (sku) {
    const match = rows.find((item) => normalizeCode(item.sku) === sku);
    if (match) return match;
  }
  const name = normalizeCode(line.name || line.product_name);
  if (name) {
    const match = rows.find((item) => normalizeCode(item.name) === name);
    if (match) return match;
  }
  return null;
};

const ensureStockItemId = async (line, rows, setRows, profile, market) => {
  if (line.stock_item_id) return line.stock_item_id;
  const existing = findStockMatch(line, rows);
  if (existing) return existing.id;
  if (!profile?.company_id) return null;
  const prepPatch = buildPrepQtyPatch({}, market, 0);

  const payload = {
    company_id: profile.company_id,
    user_id: profile.id,
    name: line.name || line.product_name || line.asin || line.ean || 'Prep product',
    asin: line.asin || null,
    sku: line.sku || null,
    ean: line.ean || null,
    qty: prepPatch.qty,
    prep_qty_by_country: prepPatch.prep_qty_by_country,
    created_by: profile.id,
    purchase_price: line.purchase_price ?? null
  };

  const { data, error } = await supabase
    .from('stock_items')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  const [mapped] = mapStockRowsForMarket([data], market);
  setRows((prev) => [mapped, ...prev]);
  return data.id;
};
