import { contactEn } from './en';
import { contactFr } from './fr';
import { contactDe } from './de';
import { contactIt } from './it';
import { contactEs } from './es';
import { contactRo } from './ro';
import { contactPl } from './pl';

export const contactTranslations = {
  en: contactEn,
  fr: contactFr,
  de: contactDe,
  it: contactIt,
  es: contactEs,
  ro: contactRo,
  pl: contactPl
};

export const useContactTranslation = (currentLanguage) => {
  const t = (key) => {
    return contactTranslations[currentLanguage]?.[key] || contactTranslations.en[key] || key;
  };

  return { t };
};
