// FILE: src/translations/index.js
import { useLanguage } from '../contexts/LanguageContext';
import CLIENT_EXPORTS_DICT from '../i18n/ClientExports';
import CLIENT_RECIVING_DICT from '../i18n/ClientReciving';

// (existente – pentru restul site-ului)
import { en } from './en';
import { fr } from './fr';
import { de } from './de';
import { it } from './it';
import { es } from './es';
import { ro } from './ro';

// (nou – dashboard)
import dashboardDict from './dashboard.json';

// (nou – legale)
import { terms as TERMS_I18N } from './legal/terms';
import { privacy as PRIVACY_I18N } from './legal/privacy';

export const translations = { en, fr, de, it, es, ro };

// ===== helper comun =====
const deepGet = (obj, path) =>
  path.split('.').reduce((a, k) => (a && a[k] != null ? a[k] : null), obj);

const mergeDeep = (base = {}, override = {}) => {
  const result = Array.isArray(base) ? base.slice() : { ...base };
  Object.entries(override || {}).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = mergeDeep(base[key], value);
    } else {
      result[key] = value;
    }
  });
  return result;
};

// FR implicit doar la inițializare; la selectarea unei limbi fără traduceri → EN
const pickLocale = (bundle, lang) => {
  if (bundle[lang]) return bundle[lang];
  if (lang !== 'fr' && bundle.en) return bundle.en;
  return bundle.fr || bundle.en || Object.values(bundle).find(Boolean) || {};
};

// ===== hook-ul vechi pentru restul textelor =====
export const useTranslation = () => {
  const { currentLanguage } = useLanguage();
  const t = (key) => translations?.[currentLanguage]?.[key] ?? translations.en?.[key] ?? key;
  return { t };
};

// ===== hook-uri noi pentru pagini legale =====
export const useTermsTranslation = () => {
  const { currentLanguage } = useLanguage();
  const dict = pickLocale(TERMS_I18N, currentLanguage);
  const t = (path) => deepGet(dict, path) ?? path;
  return { t };
};

export const usePrivacyTranslation = () => {
  const { currentLanguage } = useLanguage();
  const dict = pickLocale(PRIVACY_I18N, currentLanguage);
  const t = (path) => deepGet(dict, path) ?? path;
  const LA = (path) => {
    const v = t(path);
    return Array.isArray(v) ? v : [];
  };
  const LO = (path) => {
    const v = t(path);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  };
  return { t, LA, LO };
};

// ====== NOU: hook pentru Dashboard (merge dashboard.json + ClientExport) ======
const interpolate = (str, vars = {}) =>
  typeof str === 'string'
    ? str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
    : str;

const EXTRA_DICTIONARIES = [CLIENT_EXPORTS_DICT, CLIENT_RECIVING_DICT];

export const useDashboardTranslation = () => {
  const { currentLanguage } = useLanguage();

  const fallbackBase = dashboardDict.en || {};
  const requestedBase = pickLocale(dashboardDict, currentLanguage) || {};
  const base =
    currentLanguage === 'en'
      ? fallbackBase
      : mergeDeep(fallbackBase, requestedBase);

  // 2) merget extra dicționare (ClientExports, ClientReceiving, etc.)
  const extra = EXTRA_DICTIONARIES.reduce((acc, bundle) => {
    const fallbackFragment = bundle.en || {};
    const requestedFragment = pickLocale(bundle, currentLanguage) || {};
    const fragment =
      currentLanguage === 'en'
        ? fallbackFragment
        : mergeDeep(fallbackFragment, requestedFragment);
    if (bundle === CLIENT_RECIVING_DICT) {
      // namespace pentru ClientReceiving
      acc.ClientReceiving = fragment;
      return acc;
    }
    return { ...acc, ...fragment };
  }, {});
  // 3) lipește-le; cheile din extra au prioritate
  const dict = { ...base, ...extra };

  // t() caută mai întâi pe path (pt chei nested), apoi cheie plată, apoi lasă cheia
  const t = (path) => deepGet(dict, path) ?? dict[path] ?? path;

  const tp = (path, vars) => interpolate(t(path), vars);
  const LA = (path) => {
    const v = t(path);
    return Array.isArray(v) ? v : [];
  };
  const LO = (path) => {
    const v = t(path);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  };

  return { t, tp, LA, LO };
};
