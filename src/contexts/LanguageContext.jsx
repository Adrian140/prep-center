// FILE: src/contexts/LanguageContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const LanguageContext = createContext();

export const languages = {
  fr: { name: 'Français', flag: '🇫🇷' },
  en: { name: 'English',  flag: '🇬🇧' },
  de: { name: 'Deutsch',  flag: '🇩🇪' },
  it: { name: 'Italiano', flag: '🇮🇹' },
  es: { name: 'Español',  flag: '🇪🇸' },
  ro: { name: 'Română',   flag: '🇷🇴' },
};

const STORAGE_KEY  = 'preferredLanguage';
const LEGACY_KEY   = 'appLang';
const DEFAULT_LANG = 'en';

export const LanguageProvider = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState(DEFAULT_LANG);

  // Init din URL lang, apoi localStorage (suportă și cheia veche)
  useEffect(() => {
    try {
      const urlLang = new URLSearchParams(window.location.search).get('lang');
      const saved =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem(LEGACY_KEY) ||
        localStorage.getItem('lang'); // compat cu cod existent
      const preferred = (urlLang && languages[urlLang]) ? urlLang : saved;
      const code = (preferred && languages[preferred]) ? preferred : DEFAULT_LANG;
      setCurrentLanguage(code);
      document.documentElement.setAttribute('lang', code);
      localStorage.setItem(STORAGE_KEY, code);
      localStorage.setItem(LEGACY_KEY, code);
      localStorage.setItem('lang', code);
    } catch {
      // ignore storage errors (privacy mode, etc)
    }
  }, []);

  const changeLanguage = (code) => {
    if (!languages[code]) return;
    setCurrentLanguage(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
      localStorage.setItem(LEGACY_KEY,  code); // compat cu cod vechi
      localStorage.setItem('lang', code);      // compat cu componente care citesc 'lang'
      document.documentElement.setAttribute('lang', code);
      const url = new URL(window.location.href);
      url.searchParams.set('lang', code);
      window.history.replaceState({}, '', url.toString());
      // notifică eventuale componente care ascultă schimbarea
      window.dispatchEvent(new CustomEvent('i18n:changed', { detail: code }));
      window.dispatchEvent(new Event('app:lang-changed')); // compat cu listener-ele existente
    } catch {
      // ignore storage errors
    }
  };

  return (
    <LanguageContext.Provider value={{ currentLanguage, changeLanguage, languages }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
};
