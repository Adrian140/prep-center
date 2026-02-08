// FILE: src/contexts/LanguageContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const LanguageContext = createContext();

function toDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function flagFR() {
  return toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24">
    <rect width="12" height="24" x="0"  fill="#0055A4"/>
    <rect width="12" height="24" x="12" fill="#FFFFFF"/>
    <rect width="12" height="24" x="24" fill="#EF4135"/>
  </svg>`);
}

function flagIT() {
  return toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24">
    <rect width="12" height="24" x="0"  fill="#009246"/>
    <rect width="12" height="24" x="12" fill="#FFFFFF"/>
    <rect width="12" height="24" x="24" fill="#CE2B37"/>
  </svg>`);
}

function flagRO() {
  return toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24">
    <rect width="12" height="24" x="0"  fill="#002B7F"/>
    <rect width="12" height="24" x="12" fill="#FCD116"/>
    <rect width="12" height="24" x="24" fill="#CE1126"/>
  </svg>`);
}

function flagDE() {
  return toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24">
    <rect width="36" height="8" y="0"  fill="#000000"/>
    <rect width="36" height="8" y="8"  fill="#DD0000"/>
    <rect width="36" height="8" y="16" fill="#FFCE00"/>
  </svg>`);
}

function flagES() {
  return toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24">
    <rect width="36" height="6" y="0"  fill="#AA151B"/>
    <rect width="36" height="12" y="6" fill="#F1BF00"/>
    <rect width="36" height="6" y="18" fill="#AA151B"/>
  </svg>`);
}

function flagGB() {
  return toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24">
    <rect width="36" height="24" fill="#012169"/>
    <path d="M0,0 L4,0 L36,20 L36,24 L32,24 L0,4 Z" fill="#FFFFFF" opacity="0.95"/>
    <path d="M36,0 L32,0 L0,20 L0,24 L4,24 L36,4 Z" fill="#FFFFFF" opacity="0.95"/>
    <path d="M0,0 L2.6,0 L36,20.8 L36,24 L33.4,24 L0,3.2 Z" fill="#C8102E" opacity="0.95"/>
    <path d="M36,0 L33.4,0 L0,20.8 L0,24 L2.6,24 L36,3.2 Z" fill="#C8102E" opacity="0.95"/>
    <rect x="0" y="9" width="36" height="6" fill="#FFFFFF"/>
    <rect x="15" y="0" width="6" height="24" fill="#FFFFFF"/>
    <rect x="0" y="10.2" width="36" height="3.6" fill="#C8102E"/>
    <rect x="16.2" y="0" width="3.6" height="24" fill="#C8102E"/>
  </svg>`);
}

export const languages = {
  fr: { name: 'Français', flagSrc: flagFR() },
  en: { name: 'English',  flagSrc: flagGB() },
  de: { name: 'Deutsch',  flagSrc: flagDE() },
  it: { name: 'Italiano', flagSrc: flagIT() },
  es: { name: 'Español',  flagSrc: flagES() },
  ro: { name: 'Română',   flagSrc: flagRO() },
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
