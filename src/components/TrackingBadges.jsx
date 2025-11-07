// FILE: src/components/TermsOfService.jsx
import React from 'react';
import { Scale } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation'; // calea ta reală; din ce-ai pus: același folder cu translations

export default function TermsOfService() {
  const { t } = useTranslation();

  const list = (items) => (
    <ul className="list-disc list-inside text-text-secondary space-y-2">
      {items?.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Scale className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-text-primary mb-4">
            {t('terms.title')}
          </h1>
          <p className="text-xl text-text-secondary">
            {t('terms.lastUpdated')}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-8">
          {/* 1. Intro */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.intro_h')}</h2>
            <p className="text-text-secondary leading-relaxed">{t('terms.sections.intro_p')}</p>
          </section>

          {/* 2. Services */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.services_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.services_p')}</p>
            {list(t('terms.sections.services_list'))}
          </section>

          {/* 3. Account */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.account_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.account_p')}</p>
            {list(t('terms.sections.account_list'))}
          </section>

          {/* 4. Pricing (include clauzele cerute) */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.pricing_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.pricing_intro')}</p>
            {list(t('terms.sections.pricing_list'))}
            <p className="text-text-secondary">{t('terms.sections.pricing_nonrefund')}</p>
            <p className="text-text-secondary">{t('terms.sections.pricing_extra')}</p>
            <p className="text-text-secondary">{t('terms.sections.pricing_accept')}</p>
            <p className="text-text-secondary">{t('terms.sections.pricing_notice')}</p>
          </section>

          {/* 5. Handling */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.handling_h')}</h2>
            <h3 className="text-lg font-semibold text-text-primary mb-2">{t('terms.sections.handling_client_h')}</h3>
            {list(t('terms.sections.handling_client_list'))}
            <h3 className="text-lg font-semibold text-text-primary mt-4 mb-2">{t('terms.sections.handling_company_h')}</h3>
            {list(t('terms.sections.handling_company_list'))}
          </section>

          {/* 6. Liability */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.liability_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.liability_p')}</p>
            {list(t('terms.sections.liability_list'))}
          </section>

          {/* 7. Forbidden */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.forbidden_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.forbidden_intro')}</p>
            {list(t('terms.sections.forbidden_list'))}
          </section>

          {/* 8. GDPR */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.gdpr_h')}</h2>
            <p className="text-text-secondary">
              {t('terms.sections.gdpr_p')}
              <a href="/privacy-policy" className="text-primary hover:text-primary-dark underline ml-1">
                {t('terms.sections.privacy_link')}
              </a>.
            </p>
          </section>

          {/* 9. Termination */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.termination_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.termination_p')}</p>
            {list(t('terms.sections.termination_list'))}
          </section>

          {/* 10. Law */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.law_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.law_p')}</p>
          </section>

          {/* 11. Contact */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.contact_h')}</h2>
            <div className="bg-primary-light bg-opacity-10 p-6 rounded-lg space-y-2">
              <p className="text-text-secondary">{t('terms.sections.contact_intro')}</p>
              <p className="text-text-secondary"><strong>{t('terms.sections.contact_email')}</strong></p>
              <p className="text-text-secondary"><strong>{t('terms.sections.contact_phone')}</strong></p>
              <p className="text-text-secondary"><strong>{t('terms.sections.contact_addr')}</strong></p>
            </div>
          </section>

          {/* 12. Updates */}
          <section>
            <h2 className="text-2xl font-bold text-text-primary mb-4">{t('terms.sections.updates_h')}</h2>
            <p className="text-text-secondary">{t('terms.sections.updates_p')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
