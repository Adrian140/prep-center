import { useLanguage } from '@/contexts/LanguageContext';
import adminDict from '@/translations/admin.json';

const deepGet = (obj = {}, path = '') =>
  path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);

const pickLocale = (lang) => adminDict[lang] || adminDict.en;

const interpolate = (str, vars = {}) =>
  typeof str === 'string'
    ? str.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`))
    : str;

export const useAdminTranslation = () => {
  const { currentLanguage } = useLanguage();
  const bundle = pickLocale(currentLanguage);
  const fallback = adminDict.en;

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
  const LO = (path) => {
    const val = raw(path);
    return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
  };

  return { t, tp, LO, lang: currentLanguage };
};
