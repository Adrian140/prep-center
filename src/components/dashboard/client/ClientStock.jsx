// FILE: src/components/dashboard/client/ClientStock.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Languages, Plus, X } from 'lucide-react';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';
import { supabaseHelpers } from '@/config/supabaseHelpers';
import { useDashboardTranslation } from '../../../translations';
import { supabase } from '../../../config/supabase';

function HelpMenuButtonStock({ section = 'stock', t, tp }) {
  const GUIDE_LANGS = ['fr', 'en', 'de', 'it', 'es', 'ro'];
  const [open, setOpen] = useState(false);

  const downloadGuide = async (lang) => {
    try {
      const path = `${section}/${lang}.pdf`;
      const { data, error } = await supabase.storage.from('user_guides').createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      setOpen(false);
    } catch (e) {
      alert(tp('ClientStock.guides.error', { lang: lang.toUpperCase(), msg: e.message }));
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white transition-colors"
      >
        <FileDown className="w-4 h-4 mr-2" />
        {t('ClientStock.guides.button')}
        <Languages className="w-4 h-4 ml-2 opacity-80" />
      </button>

      {open && (
        <div className="absolute z-10 right-0 mt-2 w-44 bg-white border rounded-lg shadow-lg">
          {GUIDE_LANGS.map((lg) => (
            <button
              key={lg}
              onClick={async () => {
                await downloadGuide(lg);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
            >
              {lg.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {createModalOpen && (
        <CreateProductModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          profile={profile}
          t={t}
          onCreated={handleProductCreated}
        />
      )}
    </div>
  );
}


const DEFAULT_PER_PAGE = 50;
const HISTORY_PER_PAGE = 5;

const COUNTRIES = [{ code: 'FR' }, { code: 'DE' }, { code: 'IT' }, { code: 'ES' }, { code: 'RO' }];

const CARRIERS = [
  { code: 'UPS', label: 'UPS' },
  { code: 'DHL', label: 'DHL' },
  { code: 'GLS', label: 'GLS' },
  { code: 'CHRONOPOST', label: 'Chronopost' },
  { code: 'COLISSIMO', label: 'Colissimo' },
  { code: 'DPD', label: 'DPD' },
  { code: 'OTHER', label: 'Other' }
];

function StockGuideGrid({ t, tp }) {
  return (
    <div className="mt-3">
      <HelpMenuButtonStock t={t} tp={tp} />
    </div>
  );
}

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
    <div className="border rounded-xl p-2 text-[11px] leading-5 text-gray-600 bg-white shadow-inner min-w-[130px]">
      <div className="text-[12px] font-semibold text-gray-900">{t('ClientStock.inventory.title')}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{t('ClientStock.inventory.subtitle')}</div>
      <div className="mt-2 space-y-1">
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
      const payload = {
        name: baseForm.name.trim(),
        asin: baseForm.asin.trim() || null,
        sku: baseForm.sku.trim() || null,
        ean: baseForm.ean.trim() || null,
        qty,
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
          setError(
            blueprintErr?.message ||
              'Product saved, but advanced details could not be stored (run latest migration?).'
          );
        }
      }

      onCreated(created);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create product.');
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

export default function ClientStock() {
  const { t, tp } = useDashboardTranslation();
  const { profile, status } = useSupabaseAuth();
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const tmr = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(tmr);
  }, [toast]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [rowEdits, setRowEdits] = useState({});

  const [searchField, setSearchField] = useState('EAN');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('in');

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const [linkEditor, setLinkEditor] = useState({ open: false, id: null, value: '' });
const [submitType, setSubmitType] = useState('reception');
  const [createModalOpen, setCreateModalOpen] = useState(false);

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

const [history, setHistory] = useState([]);
const [historyPage, setHistoryPage] = useState(1);
const [receptionForm, setReceptionForm] = useState({
  carrier: 'UPS',
  carrierOther: '',
  trackingId: '',
  notes: '',
});

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!profile?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_items')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

      if (!mounted) return;

      const list = error ? [] : Array.isArray(data) ? data : [];
      setRows(list);
      setLoading(false);

      const seed = {};
      for (const r of list) {
        seed[r.id] = {
          name: r.name || '',
          asin: r.asin || '',
          product_link: r.product_link || '',
          purchase_price: r.purchase_price != null ? String(r.purchase_price) : '',
          sku: r.sku || '',
        };
      }
      setRowEdits(seed);

     try {
      const { data: hData, error: hErr } = await supabase
        .from('prep_requests')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      if (hErr) throw hErr;
      setHistory(Array.isArray(hData) ? hData : []);
    } catch {
      setHistory([]);
    }
    }
    if (status !== 'loading') load();
    return () => { mounted = false; };
  }, [status, profile?.company_id]);

  const searched = useMemo(() => {
  const q = (searchQuery || '').trim().toLowerCase();
  if (!q) return rows;

  if (searchField === 'EAN') {
    return rows.filter((r) => String(r.ean || '').toLowerCase().startsWith(q));
  }
  if (searchField === 'ASIN_SKU') {
    const getSku = (r) => String(r.sku || r.asin || '').toLowerCase();
    return rows.filter((r) => getSku(r).includes(q));
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    const hay = String(r.name || '').toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}, [rows, searchField, searchQuery]);


  const stockFiltered = useMemo(() => {
    if (stockFilter === 'all') return searched;
    if (stockFilter === 'in') return searched.filter((r) => Number(r.qty || 0) > 0);
    return searched.filter((r) => Number(r.qty || 0) === 0);
  }, [searched, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(stockFiltered.length / perPage));
  const pageClamped = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (pageClamped - 1) * perPage;
    return stockFiltered.slice(start, start + perPage);
  }, [stockFiltered, pageClamped, perPage]);

  const isAllOnPageSelected = pageSlice.length > 0 && pageSlice.every(r => selectedIds.has(r.id));
  const toggleSelectAllOnPage = () => {
    const next = new Set(selectedIds);
    if (isAllOnPageSelected) {
      pageSlice.forEach(r => next.delete(r.id));
    } else {
      pageSlice.forEach(r => next.add(r.id));
    }
    setSelectedIds(next);
  };
  const toggleSelectOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const updateEdit = (id, patch) => {
    setRowEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  };
const resetSelectionsAndUnits = React.useCallback(() => {
  setSelectedIds(new Set());
  setRowEdits((prev) => {
    const next = { ...prev };
    rows.forEach((r) => {
      next[r.id] = { ...(next[r.id] || {}), units_to_send: 0 };
    });
    return next;
  });
}, [rows]);

const [savingId, setSavingId] = useState(null);
const handleReceptionFormChange = (field, value) => {
  setReceptionForm((prev) => ({ ...prev, [field]: value }));
};
const resetReceptionForm = () => {
  setReceptionForm({
    carrier: 'UPS',
    carrierOther: '',
    trackingId: '',
    notes: '',
  });
};

  const handleProductCreated = (item) => {
    setRows((prev) => [item, ...prev]);
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
      setToast({ type: 'success', text: t('ClientStock.table.saved') });
    } catch (e) {
      console.error('[SAVE ERROR]', e);
      setToast({ type: 'error', text: e?.message || 'Failed to save row' });
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

const openReception = async () => {
  const selectedRows = rows.filter(r => selectedIds.has(r.id));

  if (selectedRows.length === 0) {
    setToast({ type: 'error', text: 'Select products to announce reception.' });
    return;
  }

  const carrierCode = receptionForm.carrier || 'OTHER';
  const trackingId = (receptionForm.trackingId || '').trim();
  // Preluăm unitățile introduse în coloana “Units to Send / Receive”
  const payload = {
    company_id: profile.company_id,
    user_id: profile.id,
    carrier: carrierCode,
    carrier_other: carrierCode === 'OTHER' ? (receptionForm.carrierOther || '').trim() || null : null,
    tracking_id: trackingId || null,
    tracking_ids: trackingId ? [trackingId] : null,
    notes: (receptionForm.notes || '').trim() || null,
    items: selectedRows.map(r => ({
      stock_item_id: r.id,
      ean: r.ean || null,
      product_name: r.name || null,
      asin: r.asin || null,
      sku: r.sku || null,
      units_requested: Number(rowEdits[r.id]?.units_to_send || 0),
    })),
    status: 'submitted',
  };

  // Validare rapidă — să nu trimită 0 unități
  const invalid = payload.items.some(i => !i.units_requested || i.units_requested < 1);
  if (invalid) {
    setToast({ type: 'error', text: 'Enter valid quantities before announcing reception.' });
    return;
  }

  try {
    const { error } = await supabaseHelpers.createReceptionRequest(payload);
    if (error) throw error;

    setToast({ type: 'success', text: 'Reception announced successfully.' });
    resetSelectionsAndUnits();
    setSelectedIds(new Set());
    resetReceptionForm();
  } catch (err) {
    console.error('Reception error:', err);
    setToast({ type: 'error', text: err.message || 'Failed to announce reception.' });
  }
};

const openPrep = async () => {
  const selectedRows = rows.filter(r => selectedIds.has(r.id));

  if (selectedRows.length === 0) {
    setToast({ type: 'error', text: 'Select products to send to prep.' });
    return;
  }

  // verificare dacă au amazon_stock > 0
  const noAmazonStock = selectedRows.filter(r => Number(r.amazon_stock || 0) <= 0);
  if (noAmazonStock.length > 0) {
    setToast({
      type: 'error',
      text: `Some selected products have no Amazon stock available: ${noAmazonStock
        .map(r => r.name || r.asin)
        .join(', ')}`,
    });
    return;
  }

  const payload = {
    company_id: profile.company_id,
    user_id: profile.id,
    destination_country: 'FR',
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
    setSelectedIds(new Set());
  } catch (err) {
    console.error('Prep error:', err);
    setToast({ type: 'error', text: err.message || 'Failed to send to prep.' });
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
    setReqErrors([e?.message || 'Failed to load request']);
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
    const toInsert = reqLines.filter(l => !l.id && l.stock_item_id);
    const toUpdate = reqLines.filter(l => l.id && origById[l.id]);

    for (const d of toDelete) {
      const { error } = await supabaseHelpers.deletePrepItem(d.id);
      if (error) throw error;
    }

    for (const ins of toInsert) {
   const st = rows.find(r => r.id === ins.stock_item_id) || {};   // 👈 ADD
const { error } = await supabaseHelpers.createPrepItem(reqHeader.id, {
  stock_item_id: ins.stock_item_id,
  ean: st.ean ?? ins.ean ?? null,                 // 👈 sigur avem ean
  product_name: st.name ?? ins.product_name ?? null, // 👈 snapshot nume
  asin: ins.asin,
  sku: ins.sku,
  units_requested: Number(ins.units_requested),
});
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
    if (supabaseHelpers?.listClientPrepRequests && profile?.company_id) {
      try {
       const { data: hData } = await supabase
        .from('prep_requests')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

        setHistory(Array.isArray(hData) ? hData : []);
      } catch {}
    }

    setToast({ type: 'success', text: 'Saved changes.' });
  } catch (e) {
    setReqErrors([e?.message || 'Failed to save changes.']);
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      {/* Stânga: titlu + ghid PDF pe limbi */}
      <div className="min-w-0">
        <div className="flex items-center">
          <h2 className="text-xl font-semibold text-text-primary whitespace-nowrap">
            {t('ClientStock.title')}
          </h2>
        </div>

        <p
          className="text-sm text-text-secondary"
          dangerouslySetInnerHTML={{ __html: t('ClientStock.desc') }}
        />
        <StockGuideGrid t={t} tp={tp} />
      </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-white shadow hover:bg-primary-dark"
          >
            <Plus className="w-4 h-4" />
            {t('ClientStock.createProduct.button')}
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAllOnPageSelected}
              onChange={() => {
                const next = new Set(selectedIds);
                if (isAllOnPageSelected) {
                  pageSlice.forEach(r => next.delete(r.id));
                } else {
                  pageSlice.forEach(r => next.add(r.id));
                }
                setSelectedIds(next);
              }}
            />
            {t('ClientStock.actions.selectAllOnPage')}
          </label>
        </div>
      </div>

        {/* AICI — bara flotantă corectă */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-white shadow-md border border-gray-200 rounded-full px-6 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 backdrop-blur-md bg-white/90">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={submitType}
                onChange={(e) => setSubmitType(e.target.value)}
                className="border rounded-md px-3 py-1 text-sm"
              >
                <option value="prep">Send to Prep (Amazon)</option>
                <option value="reception">Announce Reception</option>
              </select>
              {submitType === 'reception' && (
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <select
                    value={receptionForm.carrier}
                    onChange={(e) => handleReceptionFormChange('carrier', e.target.value)}
                    className="border rounded-md px-2 py-1"
                  >
                    {CARRIERS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {receptionForm.carrier === 'OTHER' && (
                    <input
                      type="text"
                      value={receptionForm.carrierOther}
                      onChange={(e) => handleReceptionFormChange('carrierOther', e.target.value)}
                      placeholder="Carrier name"
                      className="border rounded-md px-2 py-1 w-32 sm:w-40"
                    />
                  )}
                  <input
                    type="text"
                    value={receptionForm.trackingId}
                    onChange={(e) => handleReceptionFormChange('trackingId', e.target.value)}
                    placeholder="Tracking ID"
                    className="border rounded-md px-2 py-1 w-32 sm:w-44"
                  />
                  <input
                    type="text"
                    value={receptionForm.notes}
                    onChange={(e) => handleReceptionFormChange('notes', e.target.value)}
                    placeholder="Notes"
                    className="border rounded-md px-2 py-1 w-40 sm:w-56"
                  />
                </div>
              )}
              <button
                onClick={() => {
                  if (submitType === 'prep') openPrep();
                  else openReception();
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-1 rounded-md"
              >
                {submitType === 'prep' ? 'Send to Prep' : 'Announce Reception'}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      <div className="border rounded-lg overflow-hidden">
        <div className="w-full overflow-x-auto">
         <table className="min-w-[960px] text-sm table-auto [&_th]:px-1 [&_td]:px-1 [&_th]:py-1 [&_td]:py-1">
  <thead className="bg-gray-50 text-gray-700">
    <tr>
      <th className="px-2 py-2 w-6"></th>
      <th className="px-2 py-2 text-left w-16">Photo</th>
      <th className="px-2 py-2 text-left">Product</th>
      <th className="px-2 py-2 text-left w-40">Inventory</th>
      <th className="px-2 py-2 text-right w-24">PrepCenter stock</th>
      <th className="px-2 py-2 text-right w-32">Units to Send / Receive</th>
    </tr>
  </thead>
    <tbody>
    {pageSlice.map((r) => {
      const checked = selectedIds.has(r.id);
      const edit = rowEdits[r.id] || {};
      return (
        <tr key={r.id} className="border-t align-middle">
          {/* 1) Checkbox */}
          <td className="px-2 py-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const next = new Set(selectedIds);
                next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                setSelectedIds(next);
              }}
            />
          </td>

          {/* 2) Photo */}
          <td className="px-2 py-2">
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
    <div>
      <span className="font-semibold text-gray-500 mr-1">ASIN</span>
      <span className="font-mono text-gray-800">{r.asin || '—'}</span>
    </div>
    <div>
      <span className="font-semibold text-gray-500 mr-1">SKU</span>
      <span className="font-mono text-gray-800">{r.sku || '—'}</span>
    </div>
  </div>
</td>

          {/* 4) Inventory breakdown */}
          <td className="px-2 py-2 align-top">
            <InventoryBreakdown row={r} t={t} />
          </td>

    {/* 5) PrepCenter stock — afișare (folosim direct qty din DB) */}
    <td className="px-2 py-2 text-right text-gray-700">
      {r.qty != null ? r.qty : '—'}
    </td>


          {/* 6) Units to Send / Receive — input */}
          <td className="px-2 py-2 text-right">
           <input
            type="number"
            min={0}
            className="border rounded px-2 py-1 w-24 text-right"
            value={edit.units_to_send ?? 0}
            onChange={(e) => {
              const v = e.target.value;
              updateEdit(r.id, { units_to_send: v });
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (Number(v) > 0) next.add(r.id);
                else next.delete(r.id);
                return next;
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
            <div><span className="text-text-secondary">Country:</span> {t(`ClientStock.countries.${reqHeader?.destination_country || 'RO'}`)}</div>
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
    </div>
  );
}
