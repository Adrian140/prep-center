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
      signOut:'Sign out',
      register:'Create account',
      whatsApp:'Chat on WhatsApp',
      quote:'Get a Quote'
    },
    market: {
      selectorLabel: 'Select market',
      new: 'new',
      promptTitle: 'New market',
      promptBody: 'Do you want to use the same account data or create a new account for this country?',
      promptCancel: 'Cancel',
      promptNew: 'Create new account',
      promptSame: 'Use same data'
    },
  },

  ro: {
    nav: { home: 'Acasă', services: 'Servicii & Prețuri', about: 'Despre', contact: 'Contact' },
    actions: {
      login:'Autentificare',
      admin:'Panou Admin',
      dashboard:'Panou client',
      signOut:'Sign out',
      register:'Creează cont',
      whatsApp:'Chat pe WhatsApp',
      quote:'Cere ofertă'
    },
    market: {
      selectorLabel: 'Selectează țara',
      new: 'nou',
      promptTitle: 'Țară nouă',
      promptBody: 'Dorești să folosești aceleași date ca în contul curent sau să creezi un cont nou pentru această țară?',
      promptCancel: 'Anulează',
      promptNew: 'Creează cont nou',
      promptSame: 'Folosește aceleași date'
    },
  },

  fr: {
    nav: { home: 'Accueil', services: 'Services & Tarifs', about: 'À propos', contact: 'Contact' },
    actions: {
      login:'Connexion',
      admin:'Panneau Admin',
      dashboard:'Tableau de bord',
      signOut:'Sign out',
      register:'Créer un compte',
      whatsApp:'Discuter sur WhatsApp',
      quote:'Obtenir un devis'
    },
    market: {
      selectorLabel: 'Sélectionner le pays',
      new: 'nouveau',
      promptTitle: 'Nouveau pays',
      promptBody: 'Souhaitez-vous utiliser les mêmes données de compte ou créer un nouveau compte pour ce pays ?',
      promptCancel: 'Annuler',
      promptNew: 'Créer un nouveau compte',
      promptSame: 'Utiliser les mêmes données'
    },
  },

  de: {
    nav: { home: 'Startseite', services: 'Leistungen & Preise', about: 'Über uns', contact: 'Kontakt' },
    actions: {
      login:'Anmelden',
      admin:'Adminbereich',
      dashboard:'Dashboard',
      signOut:'Sign out',
      register:'Konto erstellen',
      whatsApp:'Auf WhatsApp chatten',
      quote:'Angebot anfordern'
    },
    market: {
      selectorLabel: 'Markt auswählen',
      new: 'neu',
      promptTitle: 'Neuer Markt',
      promptBody: 'Möchtest du dieselben Kontodaten verwenden oder ein neues Konto für dieses Land erstellen?',
      promptCancel: 'Abbrechen',
      promptNew: 'Neues Konto erstellen',
      promptSame: 'Gleiche Daten verwenden'
    },
  },

  it: {
    nav: { home: 'Home', services: 'Servizi e Prezzi', about: 'Chi siamo', contact: 'Contatti' },
    actions: {
      login:'Accedi',
      admin:'Pannello Admin',
      dashboard:'Dashboard',
      signOut:'Sign out',
      register:'Crea account',
      whatsApp:'Chat su WhatsApp',
      quote:'Richiedi un preventivo'
    },
    market: {
      selectorLabel: 'Seleziona paese',
      new: 'nuovo',
      promptTitle: 'Nuovo paese',
      promptBody: 'Vuoi usare gli stessi dati dell’account o creare un nuovo account per questo paese?',
      promptCancel: 'Annulla',
      promptNew: 'Crea nuovo account',
      promptSame: 'Usa gli stessi dati'
    },
  },

  es: {
    nav: { home: 'Inicio', services: 'Servicios y Precios', about: 'Sobre nosotros', contact: 'Contacto' },
    actions: {
      login:'Iniciar sesión',
      admin:'Panel de administración',
      dashboard:'Panel',
      signOut:'Sign out',
      register:'Crear cuenta',
      whatsApp:'Chatear por WhatsApp',
      quote:'Solicitar presupuesto'
    },
    market: {
      selectorLabel: 'Seleccionar país',
      new: 'nuevo',
      promptTitle: 'Nuevo país',
      promptBody: '¿Quieres usar los mismos datos de la cuenta o crear una cuenta nueva para este país?',
      promptCancel: 'Cancelar',
      promptNew: 'Crear cuenta nueva',
      promptSame: 'Usar los mismos datos'
    },
  },

  pl: {
    nav: { home: 'Strona główna', services: 'Usługi i Cennik', about: 'O nas', contact: 'Kontakt' },
    actions: {
      login:'Zaloguj się',
      admin:'Panel administratora',
      dashboard:'Panel',
      signOut:'Sign out',
      register:'Utwórz konto',
      whatsApp:'Czat na WhatsApp',
      quote:'Poproś o wycenę'
    },
    market: {
      selectorLabel: 'Wybierz kraj',
      new: 'nowy',
      promptTitle: 'Nowy kraj',
      promptBody: 'Czy chcesz użyć tych samych danych konta czy utworzyć nowe konto dla tego kraju?',
      promptCancel: 'Anuluj',
      promptNew: 'Utwórz nowe konto',
      promptSame: 'Użyj tych samych danych'
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
