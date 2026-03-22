import { useLanguage } from '@/contexts/LanguageContext';
import dict from '@/translations/adminPrepRequests.json';

const deepGet = (obj = {}, path = '') =>
  path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);

const interpolate = (str, vars = {}) =>
  typeof str === 'string'
    ? str.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`))
    : str;

const pickLocale = (lang) => dict[lang] || dict.en;

const LOCALE_MAP = {
  en: 'en-GB',
  fr: 'fr-FR',
  ro: 'ro-RO'
};

export const useAdminPrepRequestsTranslation = () => {
  const { currentLanguage } = useLanguage();
  const bundle = pickLocale(currentLanguage);
  const fallback = dict.en;

  const raw = (path) => {
    const val = deepGet(bundle, path);
    if (val !== undefined) return val;
    return deepGet(fallback, path);
  };

  const t = (path) => {
    const val = raw(path);
    return typeof val === 'string' ? val : path;
  };

  const tp = (path, vars) => interpolate(t(path), vars);
  const locale = LOCALE_MAP[currentLanguage] || LOCALE_MAP.en;

  return { t, tp, locale, lang: currentLanguage };
};
