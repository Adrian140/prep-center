import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  ArrowRight,
  Tag,
  Package,
  Boxes,
  Truck,
  Archive,
  Shield,
  Layers,
  Search
} from 'lucide-react';
import { supabaseHelpers } from '../config/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useServicesTranslation } from '../translations/services';
import { useTranslation } from '../translations';
import { exportPricingPdf } from '../utils/pricingPdf';

const CATEGORY_ORDER = [
  { id: 'FBA Prep Services', key: 'fba' },
  { id: 'FBM Fulfillment', key: 'fbm' },
  { id: 'Extra Services', key: 'extra' },
  { id: 'Storage', key: 'storage' }
];

const DOMESTIC_COLUMNS = ['0.25', '0.5', '1', '20'];
const INTERNATIONAL_COLUMNS = {
  'Germany/Austria': ['0.5', '1', '10', '20'],
  Spain: ['0.5', '1', '10', '20'],
  Italy: ['0.5', '1', '10', '20'],
  Belgium: ['0.5', '1', '10', '20'],
  'United Kingdom': ['0.5', '1', '2', '5']
};

const PERIOD_OPTIONS = [
  { id: '1m', labelKey: 'oneMonth', multiplier: 1 },
  { id: '3m', labelKey: 'threeMonths', multiplier: 3 },
  { id: '6m', labelKey: 'sixMonths', multiplier: 6 },
  { id: '12m', labelKey: 'twelveMonths', multiplier: 12 }
];

const PROVIDER_BADGES = {
  Colissimo: { bg: '#FEF3C7', text: '#92400E' },
  'Colis Privé': { bg: '#E0F2FE', text: '#075985' },
  UPS: { bg: '#EDE9FE', text: '#5B21B6' },
  'Mondial Relay': { bg: '#FDE68A', text: '#92400E' },
  Chronopost: { bg: '#DBEAFE', text: '#1D4ED8' },
  FedEx: { bg: '#F3E8FF', text: '#6B21A8' }
};

const SECTION_STYLES = {
  fba: {
    wrapper: 'bg-blue-50 border-blue-100',
    pill: 'bg-blue-100 text-blue-900',
    icon: 'text-blue-900'
  },
  fbm: {
    wrapper: 'bg-slate-50 border-slate-200',
    pill: 'bg-slate-200 text-slate-900',
    icon: 'text-slate-900'
  },
  extra: {
    wrapper: 'bg-green-50 border-green-100',
    pill: 'bg-green-100 text-green-900',
    icon: 'text-green-900'
  },
  storage: {
    wrapper: 'bg-gray-50 border-gray-100',
    pill: 'bg-gray-200 text-gray-900',
    icon: 'text-gray-900'
  },
  custom: {
    wrapper: 'bg-white border-gray-100',
    pill: 'bg-gray-100 text-gray-900',
    icon: 'text-gray-900'
  }
};

const localeMap = {
  fr: 'fr-FR',
  en: 'en-US',
  de: 'de-DE',
  it: 'it-IT',
  es: 'es-ES',
  ro: 'ro-RO'
};

const parsePriceToNumber = (rawPrice) => {
  if (rawPrice == null) return null;
  const cleaned = String(rawPrice)
    .replace(/[^0-9,.\-]/g, '')
    .replace(',', '.')
    .trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

const groupPricing = (rows = []) => {
  const grouped = {};
  rows.forEach((row) => {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({
      id: row.id,
      service_name: row.service_name,
      price: row.price,
      unit: row.unit,
      position: row.position ?? 0
    });
  });
  Object.keys(grouped).forEach((category) => {
    grouped[category].sort((a, b) => a.position - b.position);
  });
  return grouped;
};

export default function ServicesPricing() {
  const { currentLanguage } = useLanguage();
  const { t } = useServicesTranslation(currentLanguage);
  const { t: tCommon } = useTranslation();
  const [content, setContent] = useState({});
  const [pricingGroups, setPricingGroups] = useState({});
  const [shippingRates, setShippingRates] = useState({ domestic: [], international: {} });
  const [shippingRegion, setShippingRegion] = useState('Germany/Austria');
  const [shippingError, setShippingError] = useState('');
  const [shippingLoading, setShippingLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceSelection, setServiceSelection] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[0].id);
  const [estimateItems, setEstimateItems] = useState([]);

  const pricingErrorMessage = t('pricingSection.error');
  const shippingFallbackMessage = t('shippingSection.domesticDisclaimer');

  const formatPriceHt = (value) => {
    const trimmed = (value || '').toString().trim();
    if (!trimmed) return t('pricingSection.contact');
    return trimmed.toUpperCase().includes('HT') ? trimmed : `${trimmed} HT`;
  };

  const getLocalizedContent = useCallback(
    (key, translationKey) => {
      const localizedKey = `${key}_${currentLanguage}`;
      const englishKey = `${key}_en`;

      const localizedValue = content?.[localizedKey]?.trim();
      if (localizedValue) return localizedValue;

      const dictionaryValue = translationKey ? t(translationKey) : '';
      if (dictionaryValue && dictionaryValue !== translationKey) return dictionaryValue;

      const englishValue = content?.[englishKey]?.trim();
      if (englishValue) return englishValue;

      const fallbackValue = content?.[key]?.trim();
      if (fallbackValue) return fallbackValue;

      return dictionaryValue || '';
    },
    [content, currentLanguage, t]
  );

  const heroTitle = getLocalizedContent('services_title', 'pageTitle');
  const heroSubtitle = getLocalizedContent('services_subtitle', 'pageSubtitle');

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true);
    setPricingError('');
    try {
      const { data, error } = await supabaseHelpers.getPricingServices();
      if (error) throw error;
      setPricingGroups(groupPricing(data || []));
    } catch (err) {
      console.error('Pricing fetch failed', err);
      setPricingError(pricingErrorMessage);
    } finally {
      setPricingLoading(false);
    }
  }, [pricingErrorMessage]);

  const fetchContent = useCallback(async () => {
    const { data, error } = await supabaseHelpers.getContent();
    if (error) {
      console.error('Content fetch failed', error);
      return;
    }
    setContent(data || {});
  }, []);

  const fetchShipping = useCallback(async () => {
    setShippingLoading(true);
    setShippingError('');
    try {
      const { data, error } = await supabaseHelpers.getFbmShippingRates();
      if (error) throw error;
      const domestic = [];
      const international = {};
      (data || []).forEach((row) => {
        const entry = {
          id: row.id,
          provider: row.provider,
          info: row.info || '',
          color: row.color || '',
          rates: row.rates || {}
        };
        if (row.category === 'domestic') {
          domestic.push(entry);
        } else {
          if (!international[row.region]) international[row.region] = [];
          international[row.region].push(entry);
        }
      });
      setShippingRates({ domestic, international });
    } catch (err) {
      console.error('Shipping fetch failed', err);
      setShippingError(shippingFallbackMessage);
    } finally {
      setShippingLoading(false);
    }
  }, [shippingFallbackMessage]);

  useEffect(() => {
    fetchPricing();
    fetchContent();
    fetchShipping();
  }, [fetchPricing, fetchContent, fetchShipping]);

  const sections = useMemo(() => {
    const manualCategories = CATEGORY_ORDER.filter((entry) => pricingGroups[entry.id]?.length);
    const otherCategories = Object.keys(pricingGroups).filter(
      (category) => !CATEGORY_ORDER.some((entry) => entry.id === category)
    );
    const combined = [
      ...manualCategories,
      ...otherCategories.map((category) => ({ id: category, key: 'custom' }))
    ];
    return combined.map((entry) => ({
      ...entry,
      items: pricingGroups[entry.id] || []
    }));
  }, [pricingGroups]);

  const calculatorSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          normalizedName: (item.service_name || '').toLowerCase(),
          numericPrice: parsePriceToNumber(item.price),
          sectionId: section.id
        }))
      })),
    [sections]
  );

  const serviceLookup = useMemo(() => {
    const lookup = {};
    calculatorSections.forEach((section) => {
      section.items.forEach((item) => {
        lookup[item.id] = item;
      });
    });
    return lookup;
  }, [calculatorSections]);

  const visibleServiceGroups = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase();
    const groups = calculatorSections.map((section) => {
      const items = query
        ? section.items.filter((item) => item.normalizedName.includes(query))
        : section.items;
      return { ...section, items };
    });
    if (query) {
      return groups.filter((section) => section.items.length > 0);
    }
    return groups;
  }, [calculatorSections, serviceSearch]);

  const hasServiceResults = visibleServiceGroups.some((section) => section.items.length > 0);

  useEffect(() => {
    if (!hasServiceResults) {
      setServiceSelection('');
      return;
    }
    setServiceSelection((prev) => {
      const exists = visibleServiceGroups.some((section) =>
        section.items.some((item) => item.id === prev)
      );
      return exists ? prev : '';
    });
  }, [visibleServiceGroups, hasServiceResults]);

  const periodMap = useMemo(
    () =>
      PERIOD_OPTIONS.reduce((acc, option) => {
        acc[option.id] = option;
        return acc;
      }, {}),
    []
  );

  const addServiceToEstimate = useCallback((serviceId, periodId) => {
    if (!serviceId || !periodId) return;
    setEstimateItems((prev) => {
      const next = [...prev];
      const existingIndex = next.findIndex(
        (entry) => entry.serviceId === serviceId && entry.periodId === periodId
      );
      if (existingIndex >= 0) {
        next[existingIndex] = {
          ...next[existingIndex],
          qty: (next[existingIndex].qty || 1) + 1
        };
      } else {
        next.push({ serviceId, periodId, qty: 1 });
      }
      return next;
    });
  }, []);

  const handleServiceSelection = (serviceId) => {
    if (!serviceId) return;
    addServiceToEstimate(serviceId, selectedPeriod);
    setServiceSelection('');
  };

  const estimateSummary = useMemo(
    () =>
      estimateItems
        .map((item) => {
          const service = serviceLookup[item.serviceId];
          if (!service) return null;
          const period = periodMap[item.periodId] || PERIOD_OPTIONS[0];
          const qty = Math.max(1, Number(item.qty) || 1);
          const lineTotal =
            service.numericPrice == null
              ? null
              : service.numericPrice * qty * (period?.multiplier || 1);
          return { ...item, qty, service, period, lineTotal };
        })
        .filter(Boolean),
    [estimateItems, serviceLookup, periodMap]
  );

  const calculatorTotal = useMemo(
    () =>
      estimateSummary.reduce((sum, item) => {
        if (item.lineTotal == null) return sum;
        return sum + item.lineTotal;
      }, 0),
    [estimateSummary]
  );

  const handleEstimateQtyChange = (serviceId, periodId, value) => {
    const numeric = Math.max(1, Number(value) || 1);
    setEstimateItems((prev) =>
      prev.map((entry) =>
        entry.serviceId === serviceId && entry.periodId === periodId ? { ...entry, qty: numeric } : entry
      )
    );
  };

  const handleRemoveEstimateLine = (serviceId, periodId) => {
    setEstimateItems((prev) =>
      prev.filter((entry) => !(entry.serviceId === serviceId && entry.periodId === periodId))
    );
  };

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeMap[currentLanguage] || 'en-US', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2
      }),
    [currentLanguage]
  );

  const handleClearCalculator = () => {
    setEstimateItems([]);
  };

  const handleExport = async () => {
    if (!Object.keys(pricingGroups).length) {
      setPricingError(t('pricingSection.error'));
      return;
    }
    try {
      await exportPricingPdf(pricingGroups);
    } catch (err) {
      console.error('PDF export failed', err);
      setPricingError(t('pricingSection.error'));
    }
  };

  const getServiceIcon = (name = '') => {
    const label = name.toLowerCase();
    if (label.includes('label')) return Tag;
    if (label.includes('polybag') || label.includes('pack')) return Package;
    if (label.includes('storage') || label.includes('pallet')) return Archive;
    if (label.includes('ship') || label.includes('fbm') || label.includes('order')) return Truck;
    if (label.includes('insert') || label.includes('custom')) return Boxes;
    if (label.includes('quality') || label.includes('check')) return Shield;
    return Layers;
  };

  const renderShippingRow = (row, columns) => {
    const palette = PROVIDER_BADGES[row.provider] || { bg: row.color || 'transparent', text: '#111827' };
    return (
      <tr key={row.id} className="border-t" style={{ backgroundColor: palette.bg }}>
        <td className="px-4 py-3 font-semibold" style={{ color: palette.text }}>
          {row.provider}
        </td>
        {columns.map((col) => (
          <td key={col} className="px-4 py-3 text-center">
            {row.rates?.[col] || '—'}
          </td>
        ))}
        <td className="px-4 py-3 text-sm text-text-secondary">{row.info || '—'}</td>
      </tr>
    );
  };

  const renderShippingCards = (rows, columns) => (
    <div className="md:hidden space-y-4">
      {rows.map((row) => {
        const palette = PROVIDER_BADGES[row.provider] || { bg: row.color || '#F8FAFC', text: '#111827' };
        return (
          <article
            key={row.id}
            className="rounded-2xl border shadow-sm p-4"
            style={{ backgroundColor: palette.bg }}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold" style={{ color: palette.text }}>
                {row.provider}
              </p>
              <span className="text-xs uppercase text-text-light">
                {t('shippingSection.table.transporter')}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {columns.map((col) => (
                <div key={col}>
                  <p className="text-xs text-text-light">{col.includes('kg') ? col : `${col} kg`}</p>
                  <p className="text-base font-semibold text-text-primary">
                    {row.rates?.[col] || '—'}
                  </p>
                </div>
              ))}
            </div>
            {row.info && <p className="mt-3 text-sm text-text-secondary">{row.info}</p>}
          </article>
        );
      })}
    </div>
  );

  const sectionCtas = useMemo(
    () => ({
      fba: { label: t('pricingSection.ctaFba'), href: '/contact' },
      fbm: { label: t('pricingSection.ctaFbm'), href: '/contact' },
      storage: { label: t('pricingSection.ctaStorage'), href: '/contact' },
      extra: { label: t('pricingSection.ctaExtra'), href: '/contact' }
    }),
    [t]
  );

  const translatedDescription = t('pricingSection.description');
  const sectionDescription =
    translatedDescription && translatedDescription !== 'pricingSection.description'
      ? translatedDescription
      : '';

  return (
    <div className="min-h-screen py-20 bg-gradient-to-b from-white via-gray-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <header className="text-center space-y-5 mx-auto max-w-lg">
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary leading-tight">
            {heroTitle}
          </h1>
          <p className="text-sm md:text-base text-text-secondary">
            {heroSubtitle}
          </p>
        </header>

        <section className="bg-white border rounded-3xl shadow-sm p-6 space-y-6 -mt-4">
          {pricingError && (
            <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
              {pricingError}
            </div>
          )}

          {pricingLoading ? (
            <div className="px-4 py-10 text-center text-text-secondary">
              {t('pricingSection.loading')}
            </div>
          ) : sections.length === 0 ? (
            <div className="px-4 py-10 text-center text-text-secondary">
              {t('pricingSection.empty')}
            </div>
          ) : (
            <div className="space-y-8">
              {sections.map((section) => {
                const style = SECTION_STYLES[section.key] || SECTION_STYLES.custom;
                const cta = sectionCtas[section.key];
                return (
                  <article
                    key={section.id}
                    className={`rounded-3xl border shadow-sm p-6 space-y-6 ${style.wrapper}`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${style.pill}`}>
                          {t(`pricingSection.groups.${section.key}.title`) || section.id}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-text-primary">{section.id}</h2>
                        <p className="text-sm text-text-secondary">
                          {t(`pricingSection.groups.${section.key}.subtitle`) || section.id}
                        </p>
                      </div>
                      {section.key !== 'extra' && sectionDescription && (
                        <div className="text-sm text-text-secondary max-w-lg">
                          {sectionDescription}
                        </div>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {section.items.map((item) => {
                        const Icon = getServiceIcon(item.service_name);
                        return (
                          <div
                            key={item.id}
                            className="flex gap-4 rounded-2xl bg-white/80 border border-white shadow-sm p-4"
                          >
                            <div className="shrink-0 rounded-xl bg-white p-3 shadow">
                              <Icon className={`w-5 h-5 ${style.icon}`} />
                            </div>
                            <div>
                              <p className="text-base font-semibold text-text-primary">
                                {item.service_name}
                              </p>
                              <p className="text-sm text-text-secondary">
                                {formatPriceHt(item.price)}
                                <span className="text-xs text-text-light"> / {item.unit}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {cta && (
                      <a
                        href={cta.href}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark self-start"
                      >
                        {cta.label}
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-[#0B1221] text-white rounded-3xl p-8 space-y-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">{t('pricingSection.finalTitle')}</h2>
            <p className="text-white/80 text-sm md:text-base">{t('pricingSection.finalNote')}</p>
          </div>
          <div>
            <button
              onClick={handleExport}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-gray-900 font-semibold hover:bg-gray-100"
            >
              <FileDown className="w-4 h-4" />
              {t('pricingSection.export')}
            </button>
          </div>
        </section>

        <section className="space-y-12">
          <div className="bg-white border rounded-3xl shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-text-primary">
                {t('shippingSection.domesticTitle')}
              </h2>
              <p className="text-text-secondary">{t('shippingSection.domesticSubtitle')}</p>
            </div>
            {shippingLoading ? (
              <div className="py-10 text-center text-text-secondary">
                {t('pricingSection.loading')}
              </div>
            ) : (
              <>
                {renderShippingCards(shippingRates.domestic, DOMESTIC_COLUMNS)}
                <div className="hidden md:block overflow-auto border rounded-xl">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          {t('shippingSection.table.transporter')}
                        </th>
                        {DOMESTIC_COLUMNS.map((col) => (
                          <th key={col} className="px-4 py-3 text-center">
                            {col === '20' ? '20 kg' : `${col} kg`}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-left">{t('shippingSection.table.info')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shippingRates.domestic.map((row) =>
                        renderShippingRow(row, DOMESTIC_COLUMNS)
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="text-xs text-text-light">{t('shippingSection.domesticDisclaimer')}</p>
          </div>

          <div className="bg-white border rounded-3xl shadow-sm p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-text-primary">
                  {t('shippingSection.internationalTitle')}
                </h2>
                <p className="text-text-secondary">{t('shippingSection.internationalSubtitle')}</p>
              </div>
              <select
                value={shippingRegion}
                onChange={(e) => setShippingRegion(e.target.value)}
                className="border rounded-lg px-4 py-2"
                aria-label={t('shippingSection.dropdownLabel')}
              >
                {Object.keys(INTERNATIONAL_COLUMNS).map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            {shippingLoading ? (
              <div className="py-10 text-center text-text-secondary">
                {t('pricingSection.loading')}
              </div>
            ) : (
              <>
                {renderShippingCards(
                  shippingRates.international[shippingRegion] || [],
                  INTERNATIONAL_COLUMNS[shippingRegion] || []
                )}
                <div className="hidden md:block overflow-auto border rounded-xl">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          {t('shippingSection.table.transporter')}
                        </th>
                        {(INTERNATIONAL_COLUMNS[shippingRegion] || []).map((col) => (
                          <th key={col} className="px-4 py-3 text-center">
                            {col} kg
                          </th>
                        ))}
                        <th className="px-4 py-3 text-left">{t('shippingSection.table.info')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(shippingRates.international[shippingRegion] || []).map((row) =>
                        renderShippingRow(row, INTERNATIONAL_COLUMNS[shippingRegion] || [])
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {shippingError && <div className="text-xs text-red-500">{shippingError}</div>}
            <p className="text-xs text-text-light">
              {t('shippingSection.internationalDisclaimer')}
            </p>
          </div>
        </section>

        <section className="bg-white border rounded-3xl shadow-sm p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase text-text-light tracking-wide">{t('calculator.title')}</p>
              <h2 className="text-2xl font-semibold text-text-primary">{t('calculator.subtitle')}</h2>
              <p className="text-sm text-text-secondary">{t('calculator.selectorsHint')}</p>
            </div>
            <div className="text-left lg:text-right">
              <p className="text-xs uppercase text-text-light">{t('calculator.totalLabel')}</p>
              <p className="text-3xl font-bold text-primary">
                {currencyFormatter.format(calculatorTotal || 0)}
              </p>
            </div>
          </div>
          {calculatorSections.length === 0 ? (
            <div className="py-12 text-center text-text-secondary">{t('calculator.empty')}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
              <div className="space-y-5">
                <div className="rounded-3xl border bg-gray-50/80 p-5 space-y-5 shadow-inner">
                  <div className="space-y-2">
                    <label className="text-xs uppercase text-text-light">
                      {t('calculator.categoryLabel')}
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-text-light absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        placeholder={t('calculator.serviceSearchPlaceholder')}
                        className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <select
                      value={serviceSelection}
                      onChange={(e) => handleServiceSelection(e.target.value)}
                      disabled={!hasServiceResults}
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100"
                    >
                      {hasServiceResults ? (
                        <>
                          <option value="" disabled>
                            {t('calculator.pickerPlaceholder')}
                          </option>
                          {visibleServiceGroups.map((section) => (
                            <optgroup
                              key={section.id}
                              label={t(`pricingSection.groups.${section.key}.title`) || section.id}
                            >
                              {section.items.map((service) => (
                                <option key={service.id} value={service.id}>
                                  {service.service_name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </>
                      ) : (
                        <option value="">{t('calculator.noResults')}</option>
                      )}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs uppercase text-text-light">
                      {t('calculator.periodLabel')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PERIOD_OPTIONS.map((option) => {
                        const isActive = selectedPeriod === option.id;
                        return (
                          <button
                            type="button"
                            key={option.id}
                            onClick={() => setSelectedPeriod(option.id)}
                            className={`px-3 py-1.5 rounded-full text-sm border transition ${
                              isActive
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-text-secondary border-gray-200 hover:border-primary'
                            }`}
                          >
                            {t(`calculator.periodOptions.${option.labelKey}`)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-text-light">{t('calculator.periodHelper')}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {estimateSummary.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-white p-6 text-sm text-text-secondary text-center">
                      {t('calculator.emptySelection')}
                    </div>
                  ) : (
                    estimateSummary.map((item) => (
                      <div
                        key={`${item.service.id}-${item.period.id}`}
                        className="rounded-2xl border bg-white p-4 space-y-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-text-primary">
                              {item.service.service_name}
                            </p>
                            <p className="text-xs text-text-light">
                              {item.service.sectionId} ·{' '}
                              {t(`calculator.periodOptions.${item.period.labelKey}`)}
                            </p>
                            <p className="text-xs text-text-secondary">
                              {formatPriceHt(item.service.price)} · {item.service.unit}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveEstimateLine(item.service.id, item.period.id)}
                            className="text-xs text-primary hover:text-primary-dark"
                          >
                            {t('calculator.remove')}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <label
                            className="text-xs uppercase text-text-light"
                            htmlFor={`qty-inline-${item.service.id}-${item.period.id}`}
                          >
                            {t('calculator.quantity')}
                          </label>
                          <input
                            id={`qty-inline-${item.service.id}-${item.period.id}`}
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) =>
                              handleEstimateQtyChange(item.service.id, item.period.id, e.target.value)
                            }
                            className="w-24 rounded-lg border px-3 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <aside className="bg-[#0B1221] text-white rounded-3xl p-5 space-y-4 shadow-xl lg:sticky lg:top-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-white/50">{t('calculator.totalLabel')}</p>
                    <p className="text-2xl font-semibold">
                      {currencyFormatter.format(calculatorTotal || 0)}
                    </p>
                  </div>
                  {estimateSummary.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearCalculator}
                      className="text-xs underline decoration-dotted text-white/80 hover:text-white"
                    >
                      {t('calculator.clearAll')}
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                  {estimateSummary.length === 0 ? (
                    <p className="text-sm text-white/70">{t('calculator.emptySelection')}</p>
                  ) : (
                    estimateSummary.map((item) => (
                      <div
                        key={`${item.service.id}-${item.period.id}`}
                        className="flex items-start justify-between gap-3 border-b border-white/10 pb-2"
                      >
                        <div>
                          <p className="text-sm font-semibold">{item.service.service_name}</p>
                          <p className="text-[11px] text-white/60">
                            {item.service.sectionId} · {t(`calculator.periodOptions.${item.period.labelKey}`)}
                          </p>
                          <p className="text-[11px] text-white/60">
                            {item.qty} ×{' '}
                            {item.service.price == null
                              ? t('calculator.priceUnavailable')
                              : `${formatPriceHt(item.service.price)} · ${item.service.unit}`}
                          </p>
                        </div>
                        <p className="text-sm font-semibold">
                          {item.lineTotal == null
                            ? t('calculator.priceUnavailable')
                            : currencyFormatter.format(item.lineTotal)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-white/70">{t('calculator.note')}</p>
              </aside>
            </div>
          )}
        </section>
     </div>
   </div>
 );
}
