// FILE: src/i18n/useT.js
import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

// Dicționar minimal pentru Header/Actions (fără fallback).
const translations = {
  en: {
    nav: { home: 'Home', services: 'Services & Pricing', about: 'About', contact: 'Contact' },
    actions: {
      login:'Login',
      admin:'Admin Panel',
      dashboard:'Dashboard',
      register:'Create account',
      whatsApp:'Chat on WhatsApp',
      quote:'Get a Quote'
    },
  },

  ro: {
    nav: { home: 'Acasă', services: 'Servicii & Prețuri', about: 'Despre', contact: 'Contact' },
    actions: {
      login:'Autentificare',
      admin:'Panou Admin',
      dashboard:'Panou client',
      register:'Creează cont',
      whatsApp:'Chat pe WhatsApp',
      quote:'Cere ofertă'
    },
  },

  fr: {
    nav: { home: 'Accueil', services: 'Services & Tarifs', about: 'À propos', contact: 'Contact' },
    actions: {
      login:'Connexion',
      admin:'Panneau Admin',
      dashboard:'Tableau de bord',
      register:'Créer un compte',
      whatsApp:'Discuter sur WhatsApp',
      quote:'Obtenir un devis'
    },
  },

  de: {
    nav: { home: 'Startseite', services: 'Leistungen & Preise', about: 'Über uns', contact: 'Kontakt' },
    actions: {
      login:'Anmelden',
      admin:'Adminbereich',
      dashboard:'Dashboard',
      register:'Konto erstellen',
      whatsApp:'Auf WhatsApp chatten',
      quote:'Angebot anfordern'
    },
  },

  it: {
    nav: { home: 'Home', services: 'Servizi e Prezzi', about: 'Chi siamo', contact: 'Contatti' },
    actions: {
      login:'Accedi',
      admin:'Pannello Admin',
      dashboard:'Dashboard',
      register:'Crea account',
      whatsApp:'Chat su WhatsApp',
      quote:'Richiedi un preventivo'
    },
  },

  es: {
    nav: { home: 'Inicio', services: 'Servicios y Precios', about: 'Sobre nosotros', contact: 'Contacto' },
    actions: {
      login:'Iniciar sesión',
      admin:'Panel de administración',
      dashboard:'Panel',
      register:'Crear cuenta',
      whatsApp:'Chatear por WhatsApp',
      quote:'Solicitar presupuesto'
    },
  },

  pl: {
    nav: { home: 'Strona główna', services: 'Usługi i Cennik', about: 'O nas', contact: 'Kontakt' },
    actions: {
      login:'Zaloguj się',
      admin:'Panel administratora',
      dashboard:'Panel',
      register:'Utwórz konto',
      whatsApp:'Czat na WhatsApp',
      quote:'Poproś o wycenę'
    },
  },
};

export function useT() {
  const { currentLanguage } = useLanguage();
  const dict = translations[currentLanguage] || translations.en; // doar ca „plasă” în caz că ai un cod necunoscut

  // t('a.b.c', 'fallback')
  return useMemo(() => {
    return (key, fallback) => {
      const parts = key.split('.');
      let cur = dict;
      for (const p of parts) cur = cur?.[p];
      return cur ?? fallback ?? key;
    };
  }, [dict]);
}
