import { servicesEn } from './en';
import { servicesFr } from './fr';
import { servicesDe } from './de';
import { servicesIt } from './it';
import { servicesEs } from './es';
import { servicesRo } from './ro';
import { servicesAr } from './ar';

export const servicesTranslations = {
  en: servicesEn,
  fr: servicesFr,
  de: servicesDe,
  it: servicesIt,
  es: servicesEs,
  ro: servicesRo,
  ar: servicesAr
};

const deepGet = (obj, path) =>
  path.split('.').reduce((acc, segment) => (acc && acc[segment] !== undefined ? acc[segment] : undefined), obj);

export const useServicesTranslation = (currentLanguage) => {
  const t = (key) => {
    const locale = servicesTranslations[currentLanguage] || servicesTranslations.en;
    return deepGet(locale, key) ?? deepGet(servicesTranslations.en, key) ?? key;
  };

  return { t };
};
