import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, ArrowRight, Tag, Package, Boxes, Truck, Archive, Shield, Layers, Settings } from 'lucide-react';
import { supabaseHelpers } from '../config/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useServicesTranslation } from '../translations/services';
import { exportPricingBundlePdf } from '../utils/pricingPdfBundles';

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

const PUBLIC_GROUPS = [
  { key: 'prep', icon: Package },
  { key: 'fulfillment', icon: Truck },
  { key: 'storage', icon: Archive },
  { key: 'extras', icon: Boxes }
];

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
  const { user, profile } = useSupabaseAuth();
  const isAdmin = Boolean(
    profile?.account_type === 'admin' || user?.user_metadata?.account_type === 'admin'
  );
  const canViewPrices = Boolean(isAdmin || profile?.can_view_prices);
  const canManagePricing = isAdmin;
  const [content, setContent] = useState({});
  const [pricingGroups, setPricingGroups] = useState({});
  const [shippingRates, setShippingRates] = useState({ domestic: [], international: {} });
  const [shippingRegion, setShippingRegion] = useState('Germany/Austria');
  const [shippingError, setShippingError] = useState('');
  const [shippingLoading, setShippingLoading] = useState(true);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState('');
  const [serviceSelection, setServiceSelection] = useState('');
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

  const heroTitle = canViewPrices
    ? getLocalizedContent('services_title', 'pageTitle')
    : t('publicSection.pageTitle');
  const heroSubtitle = canViewPrices
    ? getLocalizedContent('services_subtitle', 'pageSubtitle')
    : t('publicSection.pageSubtitle');

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
    if (canViewPrices) {
      fetchPricing();
    } else {
      setPricingGroups({});
      setPricingError('');
      setPricingLoading(false);
    }
    fetchContent();
    fetchShipping();
  }, [fetchPricing, fetchContent, fetchShipping, canViewPrices]);

  useEffect(() => {
    if (canViewPrices || currentLanguage !== 'en') return;
    document.title = 'Prep, Fulfillment & Storage Services in France | PrepCenter';
    const metaDescription =
      'Fast reception, labeling, quality checks, order fulfillment and storage in France. Flexible workflows, quick turnaround and tailored quotes.';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', metaDescription);
  }, [canViewPrices, currentLanguage]);

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

  const visibleServiceGroups = calculatorSections;
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

  const defaultPeriodForService = useCallback((service) => {
    if (service?.sectionId === 'Storage') return PERIOD_OPTIONS[0]?.id || '1m';
    return '1m';
  }, []);

  const addServiceToEstimate = useCallback(
    (serviceId, overridePeriodId = null) => {
      if (!serviceId) return;
      const service = serviceLookup[serviceId];
      const periodId = overridePeriodId || defaultPeriodForService(service);
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
    },
    [serviceLookup, defaultPeriodForService]
  );

  const handleServiceSelection = (serviceId) => {
    if (!serviceId) return;
    addServiceToEstimate(serviceId);
    setServiceSelection('');
  };

  const estimateSummary = useMemo(
    () =>
      estimateItems
        .map((item) => {
          const service = serviceLookup[item.serviceId];
          if (!service) return null;
          const qty = Math.max(1, Number(item.qty) || 1);
          const isStorage = service.sectionId === 'Storage';
          const isCustom = isStorage && item.periodId === 'custom';
          const periodOption = periodMap[item.periodId] || periodMap['1m'];
          const customMonths = isCustom ? Math.max(1, Number(item.customPeriodMonths) || 1) : null;
          const multiplier = customMonths ?? periodOption?.multiplier ?? 1;
          const displayLabel = isCustom
            ? t('calculator.customPeriodLabel', { months: multiplier })
            : t(`calculator.periodOptions.${periodOption?.labelKey || 'oneMonth'}`);
          const lineTotal =
            service.numericPrice == null ? null : service.numericPrice * qty * multiplier;
          return {
            ...item,
            qty,
            service,
            period: {
              id: isCustom ? 'custom' : periodOption?.id || '1m',
              labelKey: isCustom ? 'other' : periodOption?.labelKey || 'oneMonth',
              multiplier,
              displayLabel
            },
            customPeriodMonths: customMonths,
            lineTotal
          };
        })
        .filter(Boolean),
    [estimateItems, serviceLookup, periodMap, t]
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

  const handleEstimatePeriodChange = (serviceId, currentPeriodId, nextPeriodId) => {
    if (!nextPeriodId || currentPeriodId === nextPeriodId) return;
    setEstimateItems((prev) => {
      const currentIndex = prev.findIndex(
        (entry) => entry.serviceId === serviceId && entry.periodId === currentPeriodId
      );
      if (currentIndex === -1) return prev;
      const next = [...prev];
      const duplicateIndex = next.findIndex(
        (entry, idx) =>
          idx !== currentIndex && entry.serviceId === serviceId && entry.periodId === nextPeriodId
      );
      if (duplicateIndex >= 0) {
        next[duplicateIndex] = {
          ...next[duplicateIndex],
          qty: (next[duplicateIndex].qty || 1) + (next[currentIndex].qty || 1)
        };
        next.splice(currentIndex, 1);
      } else {
        next[currentIndex] = { ...next[currentIndex], periodId: nextPeriodId, customPeriodMonths: null };
      }
      return next;
    });
  };

  const handleActivateCustomPeriod = (serviceId, currentPeriodId, months = 12) => {
    const numeric = Math.max(1, Number(months) || 1);
    setEstimateItems((prev) =>
      prev.map((entry) =>
        entry.serviceId === serviceId && entry.periodId === currentPeriodId
          ? { ...entry, periodId: 'custom', customPeriodMonths: numeric }
          : entry
      )
    );
  };

  const handleCustomPeriodMonthsChange = (serviceId, value) => {
    const numeric = Math.max(1, Number(value) || 1);
    setEstimateItems((prev) =>
      prev.map((entry) =>
        entry.serviceId === serviceId && entry.periodId === 'custom'
          ? { ...entry, customPeriodMonths: numeric }
          : entry
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

  const handleBundleExport = async ({ title, categories, filename }) => {
    if (!Object.keys(pricingGroups).length) {
      setPricingError(t('pricingSection.error'));
      return;
    }
    try {
      await exportPricingBundlePdf({
        title,
        categories,
        groups: pricingGroups,
        filename
      });
    } catch (err) {
      console.error('Bundle PDF export failed', err);
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

  const publicGroups = useMemo(
    () =>
      PUBLIC_GROUPS.map((group) => ({
        ...group,
        title: t(`publicSection.groups.${group.key}.title`),
        subtitle: t(`publicSection.groups.${group.key}.subtitle`),
        bullets: t(`publicSection.groups.${group.key}.bullets`)
      })),
    [t]
  );
  const publicBadge = t('publicSection.heroBadge');
  const publicHighlights = useMemo(() => {
    const value = t('publicSection.highlights');
    return Array.isArray(value) ? value : [];
  }, [t]);

  return (
    <div className="min-h-screen py-20 bg-gradient-to-b from-white via-gray-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <header className="relative overflow-hidden rounded-3xl border bg-white/90 shadow-sm p-8 md:p-10 text-center">
          <div className="absolute -top-24 -left-32 h-72 w-72 rounded-full bg-blue-100/60 blur-3xl" />
          <div className="absolute -bottom-20 -right-32 h-72 w-72 rounded-full bg-emerald-100/60 blur-3xl" />
          <div className="relative z-10 space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              {publicBadge}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold text-text-primary leading-tight">
              {heroTitle}
            </h1>
            <p className="text-sm md:text-base text-text-secondary max-w-2xl mx-auto">
              {heroSubtitle}
            </p>
            {publicHighlights.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-text-secondary">
                {publicHighlights.map((item) => (
                  <span key={item} className="rounded-full border border-gray-200 bg-white px-3 py-1">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {canViewPrices ? (
          <>
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
              {canManagePricing && (
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="/admin?tab=pricing"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/30 text-white font-semibold hover:border-white"
                  >
                    <Settings className="w-4 h-4" />
                    {t('pricingSection.manage')}
                  </a>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() =>
                        handleBundleExport({
                          title: CATEGORY_ORDER[0].id,
                          categories: ['FBA Prep Services', 'Extra Services', 'Storage'],
                          filename: 'FBA-Prep-Services.pdf'
                        })
                      }
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-gray-900 font-semibold hover:bg-gray-100"
                    >
                      <FileDown className="w-4 h-4" />
                      {t('pricingSection.exportFba')}
                    </button>
                    <button
                      onClick={() =>
                        handleBundleExport({
                          title: CATEGORY_ORDER[1].id,
                          categories: ['FBM Fulfillment', 'Extra Services', 'Storage'],
                          filename: 'FBM-Fulfillment.pdf'
                        })
                      }
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-white/40 text-white font-semibold hover:border-white"
                    >
                      <FileDown className="w-4 h-4" />
                      {t('pricingSection.exportFbm')}
                    </button>
                  </div>
                </div>
              )}
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
                        <select
                          value={serviceSelection}
                          onChange={(e) => handleServiceSelection(e.target.value)}
                          disabled={!hasServiceResults}
                          className="block w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100"
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
                                      {`${service.service_name} — ${service.price ?? t('calculator.priceUnavailable')} · ${service.unit}`}
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
                    </div>
                    <div className="space-y-2">
                      {estimateSummary.length === 0 ? (
                        <div className="rounded-2xl border border-dashed bg-white p-6 text-sm text-text-secondary text-center">
                          {t('calculator.emptySelection')}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {estimateSummary.map((item) => (
                            <div
                              key={`${item.service.id}-${item.period.id}`}
                              className="relative rounded-2xl border bg-white p-3 text-xs shadow-sm flex flex-col gap-2 min-h-[140px]"
                            >
                              <button
                                type="button"
                                aria-label={t('calculator.remove')}
                                onClick={() => handleRemoveEstimateLine(item.service.id, item.period.id)}
                                className="absolute top-2 right-2 text-text-light hover:text-text-primary text-sm"
                              >
                                ×
                              </button>
                              <div className="space-y-1 pr-4">
                                <p className="font-semibold text-text-primary text-sm leading-tight">
                                  {item.service.service_name}
                                </p>
                                <p className="text-[11px] text-text-light">
                                  {item.service.sectionId} · {item.period.displayLabel}
                                </p>
                                <p className="text-[11px] text-text-secondary">
                                  {item.service.price == null
                                    ? t('calculator.priceUnavailable')
                                    : `${formatPriceHt(item.service.price)} · ${item.service.unit}`}
                                </p>
                              </div>
                              {item.service.sectionId === 'Storage' && (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1">
                                    {PERIOD_OPTIONS.map((option) => {
                                      const isActive = item.period.id === option.id;
                                      return (
                                        <button
                                          type="button"
                                          key={option.id}
                                          onClick={() =>
                                            handleEstimatePeriodChange(item.service.id, item.period.id, option.id)
                                          }
                                          className={`px-2 py-1 rounded-full text-[11px] border transition ${
                                            isActive
                                              ? 'bg-primary text-white border-primary'
                                              : 'bg-white text-text-secondary border-gray-200 hover:border-primary'
                                          }`}
                                        >
                                          {t(`calculator.periodOptions.${option.labelKey}`)}
                                        </button>
                                      );
                                    })}
                                    <button
                                      type="button"
                                      onClick={() => handleActivateCustomPeriod(item.service.id, item.period.id)}
                                      className={`px-2 py-1 rounded-full text-[11px] border transition ${
                                        item.period.id === 'custom'
                                          ? 'bg-primary text-white border-primary'
                                          : 'bg-white text-text-secondary border-gray-200 hover:border-primary'
                                      }`}
                                    >
                                      {t('calculator.periodOptions.other')}
                                    </button>
                                  </div>
                                  {item.period.id === 'custom' && (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min="1"
                                        value={item.customPeriodMonths || ''}
                                        onChange={(e) =>
                                          handleCustomPeriodMonthsChange(item.service.id, e.target.value)
                                        }
                                        className="w-20 rounded-lg border px-2 py-1 text-xs"
                                        placeholder={t('calculator.customPeriodPlaceholder')}
                                      />
                                      <span className="text-[11px] text-text-light">
                                        {t('calculator.customPeriodHint')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-2 mt-auto">
                                <span className="text-[10px] uppercase text-text-light">
                                  {t('calculator.quantity')}
                                </span>
                                <input
                                  id={`qty-inline-${item.service.id}-${item.period.id}`}
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) =>
                                    handleEstimateQtyChange(item.service.id, item.period.id, e.target.value)
                                  }
                                  className="w-14 rounded-lg border px-2 py-1 text-xs text-center"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
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
                                {item.service.sectionId} · {item.period.displayLabel}
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
          </>
        ) : (
          <>
            <section className="bg-white border rounded-3xl shadow-sm p-6 space-y-8 -mt-4">
              <div className="grid gap-6 md:grid-cols-2">
                {publicGroups.map((group) => {
                  const Icon = group.icon;
                  const bullets = Array.isArray(group.bullets) ? group.bullets : [];
                  return (
                  <article key={group.key} className="rounded-3xl border bg-white/90 p-5 space-y-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-white p-3 shadow-sm">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-text-light">
                            {t('publicSection.groupLabel')}
                          </p>
                          <h2 className="text-xl font-semibold text-text-primary">{group.title}</h2>
                          <p className="text-sm text-text-secondary">{group.subtitle}</p>
                        </div>
                      </div>
                      {bullets.length > 0 && (
                        <ul className="grid gap-2 text-sm text-text-secondary">
                          {bullets.map((item) => (
                            <li key={item} className="flex items-center gap-2">
                              <span className="inline-flex h-2 w-2 rounded-full bg-primary/70" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/contact"
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark"
                >
                  {t('publicSection.ctaPrimary')}
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="https://wa.me/33675116218"
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-[#25D366] text-white font-semibold hover:bg-[#1ebe5d]"
                >
                  {t('publicSection.ctaSecondary')}
                </a>
              </div>
              <p className="text-xs text-text-light">{t('publicSection.note')}</p>
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
          </>
        )}
     </div>
   </div>
 );
}
