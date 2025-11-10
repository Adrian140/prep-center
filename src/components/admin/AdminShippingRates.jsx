import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Save, RefreshCcw } from 'lucide-react';
import { supabaseHelpers } from '@/config/supabase';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';

const DOMESTIC_REGION = 'France';
const DOMESTIC_COLUMNS = [
  { key: '0.25', label: '0.25 kg' },
  { key: '0.5', label: '0.5 kg' },
  { key: '1', label: '1 kg' },
  { key: '20', label: '20 kg (60×40×40)' }
];

const INTERNATIONAL_REGIONS = {
  'Germany/Austria': ['0.5', '1', '10', '20'],
  Spain: ['0.5', '1', '10', '20'],
  Italy: ['0.5', '1', '10', '20'],
  Belgium: ['0.5', '1', '10', '20'],
  'United Kingdom': ['0.5', '1', '2', '5']
};

const toRatesWithColumns = (columns, rates = {}) => {
  const snapshot = {};
  columns.forEach((key) => {
    snapshot[key] = rates[key] ?? '';
  });
  return snapshot;
};

const emptyRow = (columns) => ({
  id: `tmp-${Math.random().toString(36).slice(2, 8)}`,
  provider: '',
  info: '',
  color: '',
  rates: toRatesWithColumns(columns)
});

export default function AdminShippingRates() {
  const { t } = useAdminTranslation();
  const [shippingData, setShippingData] = useState({ domestic: [], international: {} });
  const [selectedRegion, setSelectedRegion] = useState('Germany/Austria');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [deleteQueue, setDeleteQueue] = useState([]);

  const loadRates = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabaseHelpers.getFbmShippingRates();
      if (error) throw error;
      const domesticRows = [];
      const internationalRows = {};

      (data || []).forEach((row) => {
        const entry = {
          id: row.id,
          provider: row.provider,
          info: row.info || '',
          color: row.color || '',
          rates: toRatesWithColumns(
            row.category === 'domestic'
              ? DOMESTIC_COLUMNS.map((c) => c.key)
              : INTERNATIONAL_REGIONS[row.region] || [],
            row.rates || {}
          )
        };
        if (row.category === 'domestic' && row.region === DOMESTIC_REGION) {
          domesticRows.push(entry);
        }
        if (row.category === 'international') {
          if (!internationalRows[row.region]) internationalRows[row.region] = [];
          internationalRows[row.region].push(entry);
        }
      });

      if (domesticRows.length === 0) {
        domesticRows.push(emptyRow(DOMESTIC_COLUMNS.map((c) => c.key)));
      }
      Object.keys(INTERNATIONAL_REGIONS).forEach((region) => {
        if (!internationalRows[region] || internationalRows[region].length === 0) {
          internationalRows[region] = [emptyRow(INTERNATIONAL_REGIONS[region])];
        }
      });

      setShippingData({
        domestic: domesticRows,
        international: internationalRows
      });
      setDeleteQueue([]);
    } catch (err) {
      console.error('Failed to load shipping rates', err);
      setMessage({ type: 'error', text: t('adminShipping.loadError') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRates();
  }, []);

  const updateRow = (category, region, rowId, updater) => {
    setShippingData((prev) => {
      const next = { ...prev };
      if (category === 'domestic') {
        next.domestic = prev.domestic.map((row) => (row.id === rowId ? updater(row) : row));
      } else {
        next.international = {
          ...prev.international,
          [region]: prev.international[region].map((row) =>
            row.id === rowId ? updater(row) : row
          )
        };
      }
      return next;
    });
  };

  const addProvider = (category, region) => {
    const columns =
      category === 'domestic'
        ? DOMESTIC_COLUMNS.map((c) => c.key)
        : INTERNATIONAL_REGIONS[region] || [];
    setShippingData((prev) => {
      if (category === 'domestic') {
        return { ...prev, domestic: [...prev.domestic, emptyRow(columns)] };
      }
      const existing = prev.international[region] || [];
      return {
        ...prev,
        international: {
          ...prev.international,
          [region]: [...existing, emptyRow(columns)]
        }
      };
    });
  };

  const removeProvider = (category, region, row) => {
    setShippingData((prev) => {
      if (category === 'domestic') {
        return { ...prev, domestic: prev.domestic.filter((item) => item.id !== row.id) };
      }
      return {
        ...prev,
        international: {
          ...prev.international,
          [region]: prev.international[region].filter((item) => item.id !== row.id)
        }
      };
    });
    if (!row.id.startsWith('tmp-')) {
      setDeleteQueue((prev) => [...prev, row.id]);
    }
  };

  const handleSave = async (category, region) => {
    setSaving(true);
    setMessage(null);
    try {
      const rows =
        category === 'domestic' ? shippingData.domestic : shippingData.international[region] || [];

      const payload = rows.map((row, index) => ({
        id: row.id.startsWith('tmp-') ? undefined : row.id,
        category,
        region,
        provider: row.provider.trim(),
        info: row.info.trim() || null,
        color: row.color.trim() || null,
        position: index,
        rates: row.rates
      }));

      const invalidRow = payload.find((row) => !row.provider);
      if (invalidRow) {
        setMessage({ type: 'error', text: t('adminShipping.validation') });
        setSaving(false);
        return;
      }

      if (payload.length) {
        const { error } = await supabaseHelpers.upsertFbmShippingRates(payload);
        if (error) throw error;
      }

      const idsToDelete = deleteQueue;
      if (idsToDelete.length) {
        const { error } = await supabaseHelpers.deleteFbmShippingRates(idsToDelete);
        if (error) throw error;
        setDeleteQueue([]);
      }

      setMessage({ type: 'success', text: t('adminShipping.saveSuccess') });
      await loadRates();
    } catch (err) {
      console.error('Failed to save shipping rates', err);
      setMessage({ type: 'error', text: t('adminShipping.saveError') });
      setSaving(false);
    }
  };

  const renderTable = (category, region, columns, rows) => (
    <div className="overflow-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-text-secondary">
          <tr>
            <th className="px-4 py-3 text-left w-56">{t('adminShipping.provider')}</th>
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 text-left">
                {col.includes('kg') ? col : `${col} kg`}
              </th>
            ))}
            <th className="px-4 py-3 text-left">{t('adminShipping.info')}</th>
            <th className="px-4 py-3 text-left">{t('adminShipping.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t align-top">
              <td className="px-4 py-3 space-y-2">
                <input
                  type="text"
                  value={row.provider}
                  onChange={(e) =>
                    updateRow(category, region, row.id, (prev) => ({
                      ...prev,
                      provider: e.target.value
                    }))
                  }
                  placeholder={t('adminShipping.providerPlaceholder')}
                  className="w-full border rounded px-3 py-2"
                />
                <input
                  type="text"
                  value={row.color}
                  onChange={(e) =>
                    updateRow(category, region, row.id, (prev) => ({
                      ...prev,
                      color: e.target.value
                    }))
                  }
                  placeholder={t('adminShipping.colorPlaceholder')}
                  className="w-full border rounded px-3 py-2"
                />
              </td>
              {columns.map((col) => (
                <td key={col} className="px-4 py-3">
                  <input
                    type="text"
                    value={row.rates[col] ?? ''}
                    onChange={(e) =>
                      updateRow(category, region, row.id, (prev) => ({
                        ...prev,
                        rates: { ...prev.rates, [col]: e.target.value }
                      }))
                    }
                    placeholder="€0.00"
                    className="w-full border rounded px-3 py-2"
                  />
                </td>
              ))}
              <td className="px-4 py-3">
                <input
                  type="text"
                  value={row.info}
                  onChange={(e) =>
                    updateRow(category, region, row.id, (prev) => ({
                      ...prev,
                      info: e.target.value
                    }))
                  }
                  placeholder={t('adminShipping.infoPlaceholder')}
                  className="w-full border rounded px-3 py-2"
                />
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => removeProvider(category, region, row)}
                  className="text-red-500 hover:text-red-600 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('adminShipping.remove')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const domesticSection = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-text-light tracking-wide">
            {t('adminShipping.domesticBadge')}
          </p>
          <h3 className="text-xl font-semibold text-text-primary">
            {t('adminShipping.domesticTitle')}
          </h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => addProvider('domestic', DOMESTIC_REGION)}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Plus className="w-4 h-4" />
            {t('adminShipping.addProvider')}
          </button>
          <button
            onClick={() => handleSave('domestic', DOMESTIC_REGION)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {t('adminShipping.save')}
          </button>
        </div>
      </div>
      {renderTable(
        'domestic',
        DOMESTIC_REGION,
        DOMESTIC_COLUMNS.map((c) => c.key),
        shippingData.domestic
      )}
    </div>
  );

  const internationalSection = (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-text-light tracking-wide">
            {t('adminShipping.internationalBadge')}
          </p>
          <h3 className="text-xl font-semibold text-text-primary">
            {t('adminShipping.internationalTitle')}
          </h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="border rounded-lg px-3 py-2"
          >
            {Object.keys(INTERNATIONAL_REGIONS).map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <button
            onClick={() => addProvider('international', selectedRegion)}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Plus className="w-4 h-4" />
            {t('adminShipping.addProvider')}
          </button>
          <button
            onClick={() => handleSave('international', selectedRegion)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {t('adminShipping.save')}
          </button>
        </div>
      </div>
      {renderTable(
        'international',
        selectedRegion,
        INTERNATIONAL_REGIONS[selectedRegion] || [],
        shippingData.international[selectedRegion] || []
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            {t('adminShipping.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('adminShipping.subtitle')}</p>
        </div>
        <button
          onClick={loadRates}
          className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          <RefreshCcw className="w-4 h-4" />
          {t('adminShipping.refresh')}
        </button>
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
          {t('adminShipping.loading')}
        </div>
      ) : (
        <div className="space-y-10">
          {domesticSection}
          {internationalSection}
        </div>
      )}
    </div>
  );
}
