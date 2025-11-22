import { aboutEn } from './en';
import { aboutFr } from './fr';
import { aboutDe } from './de';
import { aboutIt } from './it';
import { aboutEs } from './es';
import { aboutRo } from './ro';
export const aboutTranslations = {
  en: aboutEn,
  fr: aboutFr,
  de: aboutDe,
  it: aboutIt,
  es: aboutEs,
  ro: aboutRo
};

export const useAboutTranslation = (currentLanguage) => {
  const t = (key) => {
    return aboutTranslations[currentLanguage]?.[key] || aboutTranslations.en[key] || key;
  };

  return { t };
};
