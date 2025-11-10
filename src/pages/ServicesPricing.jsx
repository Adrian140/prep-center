import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, ArrowRight, Tag, Package, Boxes, Truck, Archive, Shield, Layers } from 'lucide-react';
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
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary leading-tight">
            {heroTitle}
          </h1>
          <p className="text-base md:text-lg text-text-secondary">
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

        <section className="bg-[#0B1221] text-white rounded-3xl p-8 space-y-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold">{t('pricingSection.finalTitle')}</h2>
            <p className="text-white/80">{t('pricingSection.finalNote')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleExport}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-gray-900 font-semibold hover:bg-gray-100"
            >
              <FileDown className="w-4 h-4" />
              {t('pricingSection.export')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
