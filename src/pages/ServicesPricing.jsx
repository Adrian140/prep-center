import React, { useEffect, useMemo, useState } from 'react';
import { Star, RefreshCcw, FileDown } from 'lucide-react';
import { supabaseHelpers } from '../config/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useServicesTranslation } from '../translations/services';
import { exportPricingPdf } from '../utils/pricingPdf';

const CATEGORY_ORDER = [
  { id: 'FBA Prep Services', key: 'fba' },
  { id: 'FBM Fulfillment', key: 'fbm' },
  { id: 'Extra Services', key: 'extra' },
  { id: 'Storage', key: 'storage' }
];

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
  const [content, setContent] = useState({});
  const [pricingGroups, setPricingGroups] = useState({});
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchPricing = async () => {
    setPricingLoading(true);
    setPricingError('');
    try {
      const { data, error } = await supabaseHelpers.getPricingServices();
      if (error) throw error;
      setPricingGroups(groupPricing(data || []));
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Pricing fetch failed', err);
      setPricingError(t('pricingSection.error'));
    } finally {
      setPricingLoading(false);
    }
  };

  const fetchContent = async () => {
    const { data, error } = await supabaseHelpers.getContent();
    if (error) {
      console.error('Content fetch failed', error);
      return;
    }
    setContent(data || {});
  };

  useEffect(() => {
    fetchPricing();
    fetchContent();
  }, []);

  const sections = useMemo(() => {
    const manualCategories = CATEGORY_ORDER.filter((entry) => pricingGroups[entry.id]?.length);
    const otherCategories = Object.keys(pricingGroups)
      .filter((category) => !CATEGORY_ORDER.some((entry) => entry.id === category));
    const combined = [
      ...manualCategories,
      ...otherCategories.map((category) => ({ id: category, key: 'custom' }))
    ];
    return combined.map((entry) => ({
      ...entry,
      items: pricingGroups[entry.id] || []
    }));
  }, [pricingGroups]);

  const findPrice = (category, serviceName) => {
    const entry = (pricingGroups[category] || []).find(
      (row) => row.service_name?.toLowerCase() === serviceName.toLowerCase()
    );
    return entry?.price || null;
  };

  const fnskuPrice = findPrice('FBA Prep Services', 'FNSKU Labeling') || '€0.45';
  const standardRate = findPrice('FBA Prep Services', 'Polybagging') || '€0.50';

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

  return (
    <div className="min-h-screen py-20 bg-gradient-to-b from-white via-gray-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="flex justify-center mb-4">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-8 h-8 text-yellow-400 fill-current" />
          ))}
        </div>

        <div className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary">
            {content.services_title || t('pageTitle')}
          </h1>
          <p className="text-lg text-text-secondary max-w-3xl mx-auto">
            {content.services_subtitle || t('pageSubtitle')}
          </p>
        </div>

        <section className="bg-gradient-to-r from-accent to-accent-dark rounded-2xl p-8 text-white shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">{content.bonus_title || t('newCustomerBonus')}</h2>
              <p className="text-base opacity-90">
                {(content.bonus_subtitle1 || t('bonusFirstMonths'))
                  .replace('{new_customer_rate}', fnskuPrice)
                  .replace('{standard_rate}', standardRate)}
              </p>
            </div>
            <p className="text-sm opacity-80">
              {content.bonus_subtitle2 || t('bonusFreelabels')}
            </p>
          </div>
        </section>

        <section className="bg-white border rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-text-primary">
                {t('pricingSection.title')}
              </h2>
              <p className="text-sm text-text-secondary">
                {t('pricingSection.description')}
              </p>
              {lastUpdated && (
                <p className="text-xs text-text-light mt-1">
                  {t('pricingSection.updated', { date: lastUpdated.toLocaleString() })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={fetchPricing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50"
                aria-label={t('pricingSection.sync')}
              >
                <RefreshCcw className="w-4 h-4" />
                {t('pricingSection.sync')}
              </button>
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
                aria-label={t('pricingSection.export')}
              >
                <FileDown className="w-4 h-4" />
                {t('pricingSection.export')}
              </button>
            </div>
          </div>

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
            <div className="space-y-6">
              {sections.map((section) => (
                <section
                  key={section.id}
                  className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6"
                  aria-labelledby={`pricing-${section.key}`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-primary">
                        {t(`pricingSection.groups.${section.key}.title`) || section.id}
                      </p>
                      <h3
                        id={`pricing-${section.key}`}
                        className="text-2xl font-semibold text-text-primary"
                      >
                        {section.id}
                      </h3>
                      <p className="text-sm text-text-secondary">
                        {t(`pricingSection.groups.${section.key}.subtitle`) || section.id}
                      </p>
                    </div>
                    {section.items[0] && (
                      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-text-primary max-w-sm">
                        <p className="font-semibold">
                          {section.items[0].service_name}
                        </p>
                        <p>
                          {section.items[0].price || t('pricingSection.contact')} / {section.items[0].unit}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {t('pricingSection.groups.custom.subtitle')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
                    {section.items.map((item) => (
                      <article
                        key={item.id}
                        className="border border-gray-100 rounded-xl px-4 py-3 hover:border-primary/40 transition-colors"
                      >
                        <h4 className="text-base font-semibold text-text-primary">
                          {item.service_name}
                        </h4>
                        <p className="text-sm text-text-secondary">
                          {t(`pricingSection.groups.${section.key}.title`) || section.id}
                        </p>
                        <p className="mt-3 text-lg font-semibold text-text-primary">
                          {item.price || t('pricingSection.contact')}
                          <span className="text-sm font-normal text-text-secondary">
                            {' '}
                            / {item.unit}
                          </span>
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
