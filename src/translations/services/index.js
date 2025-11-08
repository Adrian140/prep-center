import { servicesEn } from './en';
import { servicesFr } from './fr';
import { servicesDe } from './de';
import { servicesIt } from './it';
import { servicesEs } from './es';
import { servicesRo } from './ro';

export const servicesTranslations = {
  en: servicesEn,
  fr: servicesFr,
  de: servicesDe,
  it: servicesIt,
  es: servicesEs,
  ro: servicesRo
};

export const useServicesTranslation = (currentLanguage) => {
  const t = (key) => {
    return servicesTranslations[currentLanguage]?.[key] || servicesTranslations.en[key] || key;
  };

  return { t };
};
