import React from 'react';
import { Shield, Mail } from 'lucide-react'; // ← scos Phone
import { usePrivacyTranslation } from '@/translations';

export default function PrivacyPolicy() {
  const { t, LA, LO } = usePrivacyTranslation();

  const dataLists = LO('sections.data_lists');
  const dataLabels = LO('sections.data_labels');

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-text-primary mb-4">{t('title')}</h1>
          <p className="text-xl text-text-secondary">{t('lastUpdated')}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('sections.intro_h')}</h2>
            <p className="text-text-secondary leading-relaxed">{t('sections.intro_p')}</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('sections.controller_h')}</h2>
            <ul className="list-disc list-inside text-text-secondary space-y-1">
              {LA('sections.controller_lines').map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('sections.data_h')}</h2>
            <div className="space-y-4">
              {['id','billing','tech'].map((bucket) => (
                <div key={bucket}>
                  {dataLabels[bucket] && (
                    <h3 className="text-lg font-semibold text-text-primary mb-2">
                      {dataLabels[bucket]}
                    </h3>
                  )}
                  <ul className="list-disc list-inside text-text-secondary space-y-1">
                    {(Array.isArray(dataLists[bucket]) ? dataLists[bucket] : []).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('sections.purposes_h')}</h2>
            <ul className="list-disc list-inside text-text-secondary space-y-2">
              {LA('sections.purposes_list').map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>

          {['recipients','transfers'].map((key) => (
            <section key={key}>
              <h2 className="text-2xl font-bold text-text-primary mb-4">{t(`sections.${key}_h`)}</h2>
              <p className="text-text-secondary">{t(`sections.${key}_p`)}</p>
            </section>
          ))}

          {['security','retention'].map((key) => (
            <section key={key}>
              <h2 className="text-2xl font-bold text-text-primary mb-4">{t(`sections.${key}_h`)}</h2>
              <ul className="list-disc list-inside text-text-secondary space-y-1">
                {LA(`sections.${key}_list`).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </section>
          ))}

          {['rights','children','dpa','cookies','changes'].map((key) => {
            const list = LA(`sections.${key}_list`);
            return (
              <section key={key}>
                <h2 className="text-2xl font-bold text-text-primary mb-4">{t(`sections.${key}_h`)}</h2>
                {list.length ? (
                  <ul className="list-disc list-inside text-text-secondary space-y-1">
                    {list.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                ) : (
                  <p className="text-text-secondary">{t(`sections.${key}_p`)}</p>
                )}
              </section>
            );
          })}

          <section>
            <div className="bg-primary-light bg-opacity-10 p-6 rounded-lg">
              <div className="space-y-2">
                <div className="flex items-center">
                  <Mail className="w-4 h-4 text-primary mr-2" />
                  <span className="text-text-secondary">
                    {LA('sections.controller_lines')[0] || 'contact@prep-center.eu'}
                  </span>
                </div>
                {/* Blocul de telefon a fost eliminat */}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
