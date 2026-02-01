import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronUp, Save, RefreshCcw, FileDown, Trash2 } from 'lucide-react';
import { supabaseHelpers } from '@/config/supabase';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';
import { useMarket } from '@/contexts/MarketContext';
import { normalizeMarketCode } from '@/utils/market';
import { exportPricingWorkbook } from '@/utils/pricingWorkbook';

const GROUP_CONFIG = [
  {
    id: 'FBA Prep Services',
    key: 'fba',
    addLabelKey: 'adminPricing.addPrep',
    defaults: [
      { service_name: 'FNSKU Labeling', unit: '€/unit' },
      { service_name: 'Polybagging', unit: '€/unit' },
      { service_name: 'Bubble Wrap', unit: '€/unit' },
      { service_name: 'Quality Check', unit: '€/unit' },
      { service_name: 'Dunnage / Protective Fill', unit: '€/unit' }
    ]
  },
  {
    id: 'FBM Fulfillment',
    key: 'fbm',
    addLabelKey: 'adminPricing.addPlatform',
    defaults: [
      { service_name: 'Amazon FBM', unit: '€/order' },
      { service_name: 'eBay', unit: '€/order' },
      { service_name: 'Shopify / Website', unit: '€/order' },
      { service_name: 'Vinted', unit: '€/order' }
    ]
  },
  {
    id: 'Extra Services',
    key: 'extra',
    addLabelKey: 'adminPricing.addService',
    defaults: [
      { service_name: 'Insert Materials', unit: '€/unit' },
      { service_name: 'Custom Labels', unit: '€/unit' },
      { service_name: 'Translation Fee', unit: '€/project' }
    ]
  },
  {
    id: 'Storage',
    key: 'storage',
    addLabelKey: 'adminPricing.addStorage',
    defaults: [
      { service_name: 'Standard Storage', unit: '€/m³/month' },
      { service_name: 'Oversized', unit: '+€/month' },
      { service_name: 'Fragile', unit: '+€/month' }
    ]
  }
];

const emptyGroupState = () =>
  GROUP_CONFIG.reduce((acc, group) => {
    acc[group.id] = [];
    return acc;
  }, {});

const tempId = () => {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `tmp-${rnd}`;
};

const QUICK_SECTIONS = [
  { category: 'FBA Prep Services', stateKey: 'fba', titlePath: 'adminPricing.groups.fba.title' },
  { category: 'FBM Fulfillment', stateKey: 'fbm', titlePath: 'adminPricing.groups.fbm.title' }
];

const ensureUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4-like generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default function AdminPricing() {
  const { t } = useAdminTranslation();
  const [rows, setRows] = useState(emptyGroupState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [deleteQueue, setDeleteQueue] = useState({});
  const [message, setMessage] = useState(null);
  const [expanded, setExpanded] = useState(() =>
    GROUP_CONFIG.reduce((acc, g) => ({ ...acc, [g.id]: true }), {})
  );
  const [quickSelection, setQuickSelection] = useState({ fba: '', fbm: '' });
  const [quickPrices, setQuickPrices] = useState({ fba: {}, fbm: {} });
  const [quickSaving, setQuickSaving] = useState({ fba: false, fbm: false });

  const { currentMarket } = useMarket();
  const marketCode = normalizeMarketCode(currentMarket) || 'FR';
  const groupedData = useMemo(() => rows, [rows]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseHelpers.getPricingServices(currentMarket);
      if (error) throw error;
      const grouped = emptyGroupState();
      (data || []).forEach((row) => {
        const entry = {
          id: row.id,
          service_name: row.service_name,
          price: row.price,
          unit: row.unit,
          position: row.position ?? 0,
          market: row.market || marketCode
        };
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push(entry);
      });
      GROUP_CONFIG.forEach((group) => {
        if (!grouped[group.id] || grouped[group.id].length === 0) {
          grouped[group.id] = group.defaults.map((item, index) => ({
            id: tempId(),
            service_name: item.service_name,
            price: '',
            unit: item.unit,
            position: index,
            market: marketCode
          }));
        } else {
          grouped[group.id] = grouped[group.id]
            .sort((a, b) => a.position - b.position)
            .map((item, index) => ({ ...item, position: index }));
        }
      });
      setRows(grouped);
      setDeleteQueue({});
      updateQuickDefaults(grouped);
    } catch (err) {
      console.error('Failed to load pricing services', err);
      setMessage({ type: 'error', text: t('adminPricing.loadError') });
    } finally {
      setLoading(false);
    }
  };

  const buildPriceMap = (list = []) =>
    list.reduce((acc, item) => {
      acc[item.id] = item.price ?? '';
      return acc;
    }, {});

  const ensureSelection = (currentId, list = []) => {
    if (!list.length) return '';
    if (currentId && list.some((item) => item.id === currentId)) return currentId;
    return list[0].id;
  };

  const updateQuickDefaults = (grouped) => {
    const nextQuickPrices = {};
    const nextQuickSelection = {};
    QUICK_SECTIONS.forEach(({ category, stateKey }) => {
      const list = grouped[category] || [];
      nextQuickPrices[stateKey] = buildPriceMap(list);
      nextQuickSelection[stateKey] = ensureSelection(quickSelection[stateKey], list);
    });
    setQuickPrices(nextQuickPrices);
    setQuickSelection((prev) => ({
      fba: nextQuickSelection.fba || prev.fba,
      fbm: nextQuickSelection.fbm || prev.fbm
    }));
  };

  const handleQuickSelectionChange = (stateKey, value) => {
    setQuickSelection((prev) => ({ ...prev, [stateKey]: value }));
  };

  const handleQuickPriceInputChange = (stateKey, id, value) => {
    if (!id) return;
    setQuickPrices((prev) => ({
      ...prev,
      [stateKey]: { ...(prev[stateKey] || {}), [id]: value }
    }));
  };

  const handleQuickSave = async (stateKey) => {
    const section = QUICK_SECTIONS.find((entry) => entry.stateKey === stateKey);
    if (!section) return;
    const list = rows[section.category] || [];
    const selectedId = quickSelection[stateKey];
    if (!selectedId) return;
    const row = list.find((item) => item.id === selectedId);
    if (!row) return;
    const priceValue = (quickPrices[stateKey] || {})[selectedId] ?? '';
    if (!priceValue.toString().trim()) {
      setMessage({ type: 'error', text: t('adminPricing.quickEditor.error') });
      return;
    }
    setQuickSaving((prev) => ({ ...prev, [stateKey]: true }));
    try {
      const payload = [{ ...row, price: priceValue }];
      const { error } = await supabaseHelpers.upsertPricingServices(payload, currentMarket);
      if (error) throw error;
      setMessage({ type: 'success', text: t('adminPricing.quickEditor.success') });
      await loadData();
    } catch (err) {
      console.error('Failed to update website price', err);
      setMessage({ type: 'error', text: t('adminPricing.quickEditor.error') });
    } finally {
      setQuickSaving((prev) => ({ ...prev, [stateKey]: false }));
    }
  };

  useEffect(() => {
    loadData();
  }, [currentMarket]);

  const setGroupRows = (category, updater) => {
    setRows((prev) => ({
      ...prev,
      [category]: typeof updater === 'function' ? updater(prev[category] || []) : updater
    }));
  };

  const handleFieldChange = (category, id, field, value) => {
    setGroupRows(category, (list) =>
      list.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleAddRow = (category, defaultUnit = '€/unit') => {
    setGroupRows(category, (list) => [
      ...list,
      {
        id: tempId(),
        service_name: '',
        price: '',
        unit: defaultUnit,
        position: list.length,
        market: marketCode
      }
    ]);
  };

  const handleRemoveRow = (category, id) => {
    setGroupRows(category, (list) => list.filter((item) => item.id !== id));
    if (!id.startsWith('tmp-')) {
      setDeleteQueue((prev) => ({
        ...prev,
        [category]: [...(prev[category] || []), id]
      }));
    }
  };

  const handleSave = async (category) => {
    const list = rows[category] || [];
    const cleanRows = list.map((item, index) => ({
      ...item,
      position: index
    }));
    const errors = [];
    cleanRows.forEach((item, idx) => {
      if (!item.service_name?.trim() || !item.price?.trim() || !item.unit?.trim()) {
        errors.push(t('adminPricing.validation', { index: idx + 1 }));
      }
    });
    if (errors.length) {
      setMessage({ type: 'error', text: errors[0] });
      return;
    }

    setSaving((prev) => ({ ...prev, [category]: true }));
    try {
      const payload = cleanRows.map((item) => {
        const record = {
          category,
          service_name: item.service_name.trim(),
          price: item.price.trim(),
          unit: item.unit.trim(),
          position: item.position,
          market: marketCode
        };
        if (item.id && !item.id.startsWith('tmp-')) {
          record.id = item.id;
        } else if (!item.id || item.id.startsWith('tmp-')) {
          record.id = ensureUuid();
        }
        return record;
      });
      const deleteIds = deleteQueue[category] || [];

      if (payload.length) {
        const { error } = await supabaseHelpers.upsertPricingServices(payload, currentMarket);
        if (error) throw error;
      }
      if (deleteIds.length) {
        const { error } = await supabaseHelpers.deletePricingServices(deleteIds);
        if (error) throw error;
      }
      setMessage({ type: 'success', text: t('adminPricing.saveSuccess') });
      await loadData();
    } catch (err) {
      console.error('Failed to save pricing services', err);
      setMessage({ type: 'error', text: t('adminPricing.saveError') });
    } finally {
      setSaving((prev) => ({ ...prev, [category]: false }));
    }
  };

  const handleExport = async () => {
    try {
      await exportPricingWorkbook(groupedData);
    } catch (err) {
      console.error('Pricing workbook export failed', err);
      setMessage({ type: 'error', text: t('adminPricing.exportError') });
    }
  };

  const toggleAccordion = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderGroup = (group) => {
    const list = rows[group.id] || [];
    const addLabel = t(group.addLabelKey);
    const defaultUnit = group.defaults[0]?.unit || '€/unit';
    return (
      <div key={group.id} className="bg-white border rounded-xl shadow-sm">
        <button
          onClick={() => toggleAccordion(group.id)}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <div>
            <p className="text-sm uppercase tracking-wide text-text-light">
              {group.id}
            </p>
            <p className="text-lg font-semibold text-text-primary">
              {t(`adminPricing.groups.${group.key}.title`)}
            </p>
          </div>
          {expanded[group.id] ? <ChevronUp /> : <ChevronDown />}
        </button>
        {expanded[group.id] && (
          <div className="px-5 pb-5 space-y-4">
            <p className="text-sm text-text-secondary">
              {t(`adminPricing.groups.${group.key}.subtitle`)}
            </p>
            <div className="space-y-3">
              {list.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] items-center border rounded-lg p-3"
                >
                  <input
                    type="text"
                    className="border rounded-lg px-3 py-2"
                    placeholder={t('adminPricing.fields.service')}
                    value={item.service_name}
                    onChange={(e) =>
                      handleFieldChange(group.id, item.id, 'service_name', e.target.value)
                    }
                  />
                  <input
                    type="text"
                    className="border rounded-lg px-3 py-2"
                    placeholder={t('adminPricing.fields.price')}
                    value={item.price}
                    onChange={(e) =>
                      handleFieldChange(group.id, item.id, 'price', e.target.value)
                    }
                  />
                  <input
                    type="text"
                    className="border rounded-lg px-3 py-2"
                    placeholder={t('adminPricing.fields.unit')}
                    value={item.unit}
                    onChange={(e) =>
                      handleFieldChange(group.id, item.id, 'unit', e.target.value)
                    }
                  />
                  <button
                    onClick={() => handleRemoveRow(group.id, item.id)}
                    className="text-red-500 hover:text-red-600 inline-flex items-center justify-center p-2"
                    aria-label="Remove row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleAddRow(group.id, defaultUnit)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
                {addLabel}
              </button>
              <button
                onClick={() => handleSave(group.id)}
                disabled={saving[group.id]}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving[group.id] ? t('adminPricing.saving') : t('adminPricing.save')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderQuickPricingEditor = () => (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {t('adminPricing.quickEditor.title')}
          </h3>
          <p className="text-sm text-text-secondary">
            {t('adminPricing.quickEditor.subtitle')}
          </p>
        </div>
        <p className="text-xs text-text-secondary">{t('adminPricing.quickEditor.note')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {QUICK_SECTIONS.map(({ category, stateKey, titlePath }) => {
          const categoryRows = rows[category] || [];
          const selectedId = quickSelection[stateKey] || categoryRows[0]?.id || '';
          const fallbackRow = categoryRows.find((item) => item.id === selectedId);
          const priceValue =
            (quickPrices[stateKey] || {})[selectedId] ?? fallbackRow?.price ?? '';
          return (
            <div key={category} className="border border-gray-100 rounded-xl p-4 space-y-3 shadow-sm">
              <h4 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                {t(titlePath)}
              </h4>
              <label className="text-xs uppercase tracking-wide text-text-secondary">
                {t('adminPricing.quickEditor.select')}
              </label>
              <select
                value={selectedId}
                onChange={(e) => handleQuickSelectionChange(stateKey, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary"
              >
                <option value="">{t('adminPricing.quickEditor.noService')}</option>
                {categoryRows.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.service_name}
                  </option>
                ))}
              </select>
              <label className="text-xs uppercase tracking-wide text-text-secondary">
                {t('adminPricing.quickEditor.priceLabel')}
              </label>
              <input
                type="text"
                value={priceValue}
                placeholder={t('adminPricing.quickEditor.placeholder')}
                onChange={(e) => handleQuickPriceInputChange(stateKey, selectedId, e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={() => handleQuickSave(stateKey)}
                disabled={
                  quickSaving[stateKey] ||
                  !selectedId ||
                  !priceValue.toString().trim()
                }
                className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-60"
              >
                {quickSaving[stateKey] ? t('adminPricing.saving') : t('adminPricing.quickEditor.save')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between bg-white border rounded-xl px-5 py-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            {t('adminPricing.title')}
          </h2>
          <p className="text-sm text-text-secondary">
            {t('adminPricing.subtitle')}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            {t('adminPricing.marketLabel', { market: marketCode })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCcw className="w-4 h-4" />
            {t('adminPricing.sync')}
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
          >
            <FileDown className="w-4 h-4" />
            {t('adminPricing.export')}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-100'
              : 'bg-green-50 text-green-700 border border-green-100'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="bg-white border rounded-xl px-4 py-10 text-center text-text-secondary">
          {t('adminPricing.loading')}
        </div>
      ) : (
        <div className="space-y-4">
          {GROUP_CONFIG.map((group) => renderGroup(group))}
        </div>
      )}
    </div>
  );
}
