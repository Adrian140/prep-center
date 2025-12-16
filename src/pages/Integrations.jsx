import React, { useEffect, useMemo, useState } from 'react';
import supabase, { supabaseHelpers } from '@/config/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

const CARD_KEYS = {
  import: 'import',
  notify: 'notify',
  prep: 'prep',
  reportSend: 'report-send',
  reportIncoming: 'report-incoming',
  reportEmail: 'report-email'
};

const COPY = {
  ro: {
    heroPill: 'Amazon Integration',
    heroTitle: 'Integrare Amazon fără complicații',
    heroSubtitle: 'Listări, titluri, stoc și poze aduse automat, fără dubluri. Totul într-o singură pagină, gata de folosit.',
    tags: ['Import complet', 'Expedieri simple', 'Rapoarte clare'],
    importTitle: 'Import complet al listingurilor Amazon',
    importList: [
      'Poză principală',
      'Titlu produs',
      'ASIN / SKU',
      'Stoc FBA (available / inbound / reserved)',
      'Stoc în PrepCenter',
      'Vânzări din ultimele 30 de zile'
    ],
    importNote: 'Totul într-un tabel clar, actualizat în timp real.',
    notifyTitle: 'Notifică marfa în tranzit',
    notifyBody: 'Anunți produsul și cantitatea care urmează să ajungă la noi, ca să pregătim recepția înainte de expediere.',
    notifyOptions: [
      'Nu trimitem acum: rămâne în stocul PrepCenter.',
      'Trimitem tot stocul: tot ce este disponibil merge la Amazon.',
      'Trimitem parțial: doar cantitatea selectată, restul rămâne în depozit.'
    ],
    prepTitle: 'Stoc deja în PrepCenter',
    prepBody: 'Dacă ai produsul la noi, selectezi cantitatea și folosești acțiunea Trimite în Prep (Amazon).',
    prepOption: 'Trimite în Prep (Amazon): trimitem cantitatea selectată către Amazon.',
    clickToEnlarge: 'Click pentru mărire',
    miniCards: {
      listTitle: 'Listări',
      listBody: 'Titlu + poză + ASIN/SKU',
      stockTitle: 'Stoc',
      stockBody: 'FBA & inbound',
      shipTitle: 'Expedieri',
      shipBody: '3 opțiuni',
      reportTitle: 'Rapoarte',
      reportBody: 'Totul la vedere'
    },
    placeholders: {
      import: 'Loc pentru captură de ecran (ex: listări Amazon)',
      notify: 'Loc pentru captură (ex: selector notificare marfă)',
      prep: 'Loc pentru captură (ex: selector Trimite în Prep)',
      reportSend: 'Captură „Trimite către Amazon”',
      reportIncoming: 'Captură „Marfă recepționată”',
      reportEmail: 'Captură raport / email'
    },
    reports: {
      sendTitle: 'Send to Amazon',
      sendDesc: 'Vezi cererile trimise și statusurile lor.',
      incomingTitle: 'Incoming goods',
      incomingDesc: 'Tot ce a fost recepționat, într-o listă clară.',
      emailTitle: 'Raport final & email',
      emailDesc: 'Status requested → processing → completed + email cu ce a plecat și ce a rămas.'
    }
  },
  en: {
    heroPill: 'Amazon Integration',
    heroTitle: 'Amazon integration without headaches',
    heroSubtitle: 'Listings, titles, stock and photos are imported automatically, no duplicates. Everything on one page, ready to use.',
    tags: ['Full import', 'Easy shipments', 'Clear reports'],
    importTitle: 'Full Amazon listings import',
    importList: [
      'Main image',
      'Product title',
      'ASIN / SKU',
      'FBA stock (available / inbound / reserved)',
      'PrepCenter stock',
      'Sales from last 30 days'
    ],
    importNote: 'All in one clear table, updated in real time.',
    notifyTitle: 'Notify incoming goods',
    notifyBody: 'Announce the product and quantity arriving so we prepare receiving before shipping.',
    notifyOptions: [
      'Do not send now: stays in PrepCenter, we ship nothing now.',
      'Send all units: we ship all available stock to Amazon.',
      'Partial shipment: ship only the selected quantity, keep the rest in storage.'
    ],
    prepTitle: 'Stock already in PrepCenter',
    prepBody: 'If the product is with us, pick the quantity and use Send to Prep (Amazon).',
    prepOption: 'Send to Prep (Amazon): we ship the selected quantity to Amazon.',
    clickToEnlarge: 'Click to enlarge',
    miniCards: {
      listTitle: 'Listings',
      listBody: 'Title + image + ASIN/SKU',
      stockTitle: 'Stock',
      stockBody: 'FBA & inbound',
      shipTitle: 'Shipments',
      shipBody: '3 options',
      reportTitle: 'Reports',
      reportBody: 'Everything visible'
    },
    placeholders: {
      import: 'Placeholder for screenshot (e.g., Amazon listings)',
      notify: 'Placeholder (Notify incoming goods selector)',
      prep: 'Placeholder (Send to Prep selector)',
      reportSend: 'Screenshot Send to Amazon',
      reportIncoming: 'Screenshot Incoming goods',
      reportEmail: 'Screenshot report / email'
    },
    reports: {
      sendTitle: 'Send to Amazon',
      sendDesc: 'See submitted requests and their statuses.',
      incomingTitle: 'Incoming goods',
      incomingDesc: 'Everything received, in a clear list.',
      emailTitle: 'Final report & email',
      emailDesc: 'Status requested → processing → completed + email with what shipped and what remained.'
    }
  },
  fr: {
    heroPill: 'Intégration Amazon',
    heroTitle: 'Intégration Amazon sans prise de tête',
    heroSubtitle: 'Titres, stock et photos importés automatiquement, sans doublons. Tout sur une seule page, prêt à l’emploi.',
    tags: ['Import complet', 'Expéditions simples', 'Rapports clairs'],
    importTitle: 'Import complet des listings Amazon',
    importList: [
      'Photo principale',
      'Titre du produit',
      'ASIN / SKU',
      'Stock FBA (available / inbound / reserved)',
      'Stock en PrepCenter',
      'Ventes des 30 derniers jours'
    ],
    importNote: 'Tout dans un tableau clair, mis à jour en temps réel.',
    notifyTitle: 'Notifier la réception',
    notifyBody: 'Déclare le produit et la quantité qui arrivent pour préparer la réception avant l’expédition.',
    notifyOptions: [
      'Ne pas expédier maintenant : reste en PrepCenter, aucun envoi pour l’instant.',
      'Envoyer toutes les unités : on expédie tout le stock disponible vers Amazon.',
      'Expédition partielle : tu envoies seulement la quantité choisie, le reste reste stocké.'
    ],
    prepTitle: 'Stock déjà en PrepCenter',
    prepBody: 'Si le produit est chez nous, choisis la quantité et utilise Send to Prep (Amazon).',
    prepOption: 'Envoyer en Prep (Amazon) : on expédie la quantité sélectionnée vers Amazon.',
    clickToEnlarge: 'Cliquer pour agrandir',
    miniCards: {
      listTitle: 'Listings',
      listBody: 'Titre + photo + ASIN/SKU',
      stockTitle: 'Stock',
      stockBody: 'FBA & inbound',
      shipTitle: 'Expéditions',
      shipBody: '3 options',
      reportTitle: 'Rapports',
      reportBody: 'Tout est visible'
    },
    placeholders: {
      import: 'Zone pour capture (ex: listings Amazon)',
      notify: 'Zone pour capture (Notifier la réception)',
      prep: 'Zone pour capture (Envoyer en Prep)',
      reportSend: 'Capture « Send to Amazon »',
      reportIncoming: 'Capture « Incoming goods »',
      reportEmail: 'Capture rapport / email'
    },
    reports: {
      sendTitle: 'Send to Amazon',
      sendDesc: 'Toutes les demandes envoyées et leurs statuts.',
      incomingTitle: 'Incoming goods',
      incomingDesc: 'Tout ce qui a été réceptionné, dans une liste claire.',
      emailTitle: 'Rapport final & email',
      emailDesc: 'Statut requested → processing → completed + email avec ce qui est parti et ce qui reste.'
    }
  },
  de: {
    heroPill: 'Amazon-Integration',
    heroTitle: 'Amazon-Integration ohne Kopfschmerzen',
    heroSubtitle: 'Listings, Titel, Bestand und Bilder werden automatisch importiert, ohne Duplikate. Alles auf einer Seite, einsatzbereit.',
    tags: ['Kompletter Import', 'Einfache Sendungen', 'Klare Reports'],
    importTitle: 'Vollständiger Import der Amazon-Listings',
    importList: [
      'Hauptbild',
      'Produkttitel',
      'ASIN / SKU',
      'FBA-Bestand (available / inbound / reserved)',
      'Bestand im PrepCenter',
      'Verkäufe der letzten 30 Tage'
    ],
    importNote: 'Alles in einer klaren Tabelle, in Echtzeit aktualisiert.',
    notifyTitle: 'Ankommende Ware melden',
    notifyBody: 'Melde Produkt und Menge im Anmarsch, damit wir den Wareneingang vor dem Versand vorbereiten.',
    notifyOptions: [
      'Jetzt nicht senden: bleibt im PrepCenter, kein Versand jetzt.',
      'Alle Einheiten senden: wir senden den gesamten verfügbaren Bestand zu Amazon.',
      'Teillieferung: du sendest nur die gewählte Menge, der Rest bleibt eingelagert.'
    ],
    prepTitle: 'Bestand bereits im PrepCenter',
    prepBody: 'Wenn der Artikel bei uns liegt, wähle die Menge und nutze Send to Prep (Amazon).',
    prepOption: 'An Prep senden (Amazon): wir senden die ausgewählte Menge zu Amazon.',
    clickToEnlarge: 'Zum Vergrößern klicken',
    miniCards: {
      listTitle: 'Listings',
      listBody: 'Titel + Bild + ASIN/SKU',
      stockTitle: 'Bestand',
      stockBody: 'FBA & inbound',
      shipTitle: 'Sendungen',
      shipBody: '3 Optionen',
      reportTitle: 'Reports',
      reportBody: 'Alles im Blick'
    },
    placeholders: {
      import: 'Platzhalter für Screenshot (z. B. Amazon-Listings)',
      notify: 'Platzhalter (Ankommende Ware melden)',
      prep: 'Platzhalter (An Prep senden)',
      reportSend: 'Screenshot „Send to Amazon“',
      reportIncoming: 'Screenshot „Incoming goods“',
      reportEmail: 'Screenshot Report / E-Mail'
    },
    reports: {
      sendTitle: 'Send to Amazon',
      sendDesc: 'Gesendete Anfragen und ihre Status.',
      incomingTitle: 'Incoming goods',
      incomingDesc: 'Alles, was empfangen wurde, in einer klaren Liste.',
      emailTitle: 'Abschlussbericht & E-Mail',
      emailDesc: 'Status requested → processing → completed + E-Mail mit Versand und Restbestand.'
    }
  },
  es: {
    heroPill: 'Integración Amazon',
    heroTitle: 'Integración con Amazon sin complicaciones',
    heroSubtitle: 'Listados, títulos, stock y fotos se importan automáticamente, sin duplicados. Todo en una sola página, listo para usar.',
    tags: ['Importación completa', 'Envíos fáciles', 'Reportes claros'],
    importTitle: 'Importación completa de listados Amazon',
    importList: [
      'Imagen principal',
      'Título del producto',
      'ASIN / SKU',
      'Stock FBA (available / inbound / reserved)',
      'Stock en PrepCenter',
      'Ventas de los últimos 30 días'
    ],
    importNote: 'Todo en una tabla clara, actualizada en tiempo real.',
    notifyTitle: 'Avisar mercancía entrante',
    notifyBody: 'Avísas el producto y la cantidad que llegan para preparar la recepción antes del envío.',
    notifyOptions: [
      'No enviar ahora: permanece en PrepCenter, no enviamos ahora.',
      'Enviar todas las unidades: enviamos todo el stock disponible a Amazon.',
      'Envío parcial: envías solo la cantidad elegida, el resto queda almacenado.'
    ],
    prepTitle: 'Stock ya en PrepCenter',
    prepBody: 'Si el producto está con nosotros, eliges la cantidad y usas Send to Prep (Amazon).',
    prepOption: 'Enviar al Prep (Amazon): enviamos la cantidad seleccionada a Amazon.',
    clickToEnlarge: 'Clic para ampliar',
    miniCards: {
      listTitle: 'Listados',
      listBody: 'Título + foto + ASIN/SKU',
      stockTitle: 'Stock',
      stockBody: 'FBA & inbound',
      shipTitle: 'Envíos',
      shipBody: '3 opciones',
      reportTitle: 'Reportes',
      reportBody: 'Todo visible'
    },
    placeholders: {
      import: 'Espacio para captura (ej: listados Amazon)',
      notify: 'Espacio para captura (Avisar mercancía entrante)',
      prep: 'Espacio para captura (Enviar al Prep)',
      reportSend: 'Captura «Send to Amazon»',
      reportIncoming: 'Captura «Incoming goods»',
      reportEmail: 'Captura reporte / email'
    },
    reports: {
      sendTitle: 'Send to Amazon',
      sendDesc: 'Solicitudes enviadas y sus estados.',
      incomingTitle: 'Incoming goods',
      incomingDesc: 'Todo lo recibido, en una lista clara.',
      emailTitle: 'Informe final y email',
      emailDesc: 'Estado requested → processing → completed + email con lo enviado y lo que queda.'
    }
  },
  it: {
    heroPill: 'Integrazione Amazon',
    heroTitle: 'Integrazione Amazon senza complicazioni',
    heroSubtitle: 'Listing, titoli, stock e foto importati automaticamente, senza duplicati. Tutto in una sola pagina, pronto all’uso.',
    tags: ['Import completo', 'Spedizioni semplici', 'Report chiari'],
    importTitle: 'Import completo dei listing Amazon',
    importList: [
      'Immagine principale',
      'Titolo prodotto',
      'ASIN / SKU',
      'Stock FBA (available / inbound / reserved)',
      'Stock in PrepCenter',
      'Vendite degli ultimi 30 giorni'
    ],
    importNote: 'Tutto in una tabella chiara, aggiornata in tempo reale.',
    notifyTitle: 'Segnala merce in arrivo',
    notifyBody: 'Segnali il prodotto e la quantità in arrivo, così prepariamo la ricezione prima della spedizione.',
    notifyOptions: [
      'Non spedire ora: resta in PrepCenter, nessuna spedizione ora.',
      'Spedisci tutte le unità: inviamo tutto lo stock disponibile ad Amazon.',
      'Spedizione parziale: spedisci solo la quantità scelta, il resto resta in deposito.'
    ],
    prepTitle: 'Stock già in PrepCenter',
    prepBody: 'Se il prodotto è da noi, scegli la quantità e usa Send to Prep (Amazon).',
    prepOption: 'Invia al Prep (Amazon): spediamo la quantità selezionata ad Amazon.',
    clickToEnlarge: 'Clicca per ingrandire',
    miniCards: {
      listTitle: 'Listing',
      listBody: 'Titolo + foto + ASIN/SKU',
      stockTitle: 'Stock',
      stockBody: 'FBA & inbound',
      shipTitle: 'Spedizioni',
      shipBody: '3 opzioni',
      reportTitle: 'Report',
      reportBody: 'Tutto visibile'
    },
    placeholders: {
      import: 'Spazio per screenshot (es: listing Amazon)',
      notify: 'Spazio per screenshot (Segnala merce in arrivo)',
      prep: 'Spazio per screenshot (Invia al Prep)',
      reportSend: 'Screenshot «Send to Amazon»',
      reportIncoming: 'Screenshot «Incoming goods»',
      reportEmail: 'Screenshot report / email'
    },
    reports: {
      sendTitle: 'Send to Amazon',
      sendDesc: 'Vedi le richieste inviate e i loro stati.',
      incomingTitle: 'Incoming goods',
      incomingDesc: 'Tutto ciò che è stato ricevuto, in una lista chiara.',
      emailTitle: 'Report finale & email',
      emailDesc: 'Status requested → processing → completed + email con ciò che è partito e ciò che è rimasto.'
    }
  }
};

function CardImage({ url, alt, fallback, clickText }) {
  if (!url) return fallback;
  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener')}
      className="relative h-56 w-full rounded-xl overflow-hidden border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <img
        src={url}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <span className="absolute bottom-2 right-2 bg-white/80 text-xs text-gray-700 px-2 py-1 rounded-full shadow-sm">
        {clickText}
      </span>
    </button>
  );
}

export default function Integrations() {
  const { currentLanguage } = useLanguage();
  const [media, setMedia] = useState({});
  const copy = COPY[currentLanguage] || COPY.ro;

  useEffect(() => {
    let active = true;
    (async () => {
      const loadForLang = async (lang) => {
        const { data, error } = await supabaseHelpers.getIntegrationMedia(lang);
        if (error) return { map: {}, found: false };
        const map = {};
        (data || []).forEach((row) => {
          const url = row.image_url;
          const validUrl = url && /^https?:\/\//i.test(url) && !url.includes('...');
          if (row.card_key && validUrl) {
            map[row.card_key] = row.image_url;
          }
        });
        return { map, found: Object.keys(map).length > 0 };
      };

      let finalMap = {};
      let { map, found } = await loadForLang(currentLanguage);
      finalMap = map;
      if (!found && currentLanguage !== 'ro') {
        const fallback = await loadForLang('ro');
        if (fallback.found) finalMap = fallback.map;
      }

      // Fallback la bucket dacă lipsesc carduri (în paralel, ca să răspundă mai repede)
      const missingKeys = Object.values(CARD_KEYS).filter((k) => !finalMap[k]);
      if (missingKeys.length) {
        const storageUrlFor = async (cardKey) => {
          const candidatePaths = [
            `${currentLanguage}/${cardKey}`,
            `${cardKey}/${currentLanguage}`,
            `${cardKey}`
          ];
          for (const path of candidatePaths) {
            const { data, error } = await supabase.storage
              .from('integration-media')
              .list(path, { limit: 1 });
            if (error || !data || !data.length) continue;
            const file = data[0]?.name;
            if (!file) continue;
            const fullPath = path ? `${path}/${file}` : file;
            const { data: signed } = await supabase.storage
              .from('integration-media')
              .createSignedUrl(fullPath, 60 * 60 * 24 * 7);
            if (signed?.signedUrl) return signed.signedUrl;
          }
          return null;
        };

        const urls = await Promise.all(missingKeys.map((k) => storageUrlFor(k)));
        urls.forEach((url, idx) => {
          const key = missingKeys[idx];
          if (url) finalMap[key] = url;
        });
      }

      if (!active) return;
      setMedia(finalMap);
    })();
    return () => {
      active = false;
    };
  }, [currentLanguage]);

  const placeholders = useMemo(
    () => ({
      import: (
        <div className="h-56 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-gray-200 flex items-center justify-center text-gray-500 text-xs">
          Loc pentru captură de ecran (ex: listări Amazon)
        </div>
      ),
      notify: (
        <div className="h-56 rounded-xl bg-gradient-to-r from-indigo-50 to-emerald-50 border border-gray-200 flex items-center justify-center text-gray-500 text-xs">
          {copy.placeholders.notify}
        </div>
      ),
      prep: (
        <div className="h-56 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-gray-200 flex items-center justify-center text-gray-500 text-xs">
          {copy.placeholders.prep}
        </div>
      ),
      reportSend: (
        <div className="h-32 rounded-lg bg-gradient-to-r from-slate-50 to-blue-50 border border-gray-200 flex items-center justify-center text-gray-500 text-xs">
          {copy.placeholders.reportSend}
        </div>
      ),
      reportIncoming: (
        <div className="h-32 rounded-lg bg-gradient-to-r from-indigo-50 to-emerald-50 border border-gray-200 flex items-center justify-center text-gray-500 text-xs">
          {copy.placeholders.reportIncoming}
        </div>
      ),
      reportEmail: (
        <div className="h-32 rounded-lg bg-gradient-to-r from-amber-50 to-blue-50 border border-gray-200 flex items-center justify-center text-gray-500 text-xs">
          {copy.placeholders.reportEmail}
        </div>
      )
    }),
    [copy]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* Hero */}
        <section className="grid lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <p className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wide">
              {copy.heroPill}
            </p>
            <h1 className="text-4xl font-bold text-gray-900 leading-tight">{copy.heroTitle}</h1>
            <p className="text-lg text-gray-700">{copy.heroSubtitle}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              {copy.tags.map((tag) => (
                <span key={tag} className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 lg:p-8">
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
              <div className="p-4 rounded-xl bg-blue-50">
                <p className="text-xs font-semibold text-blue-700">{copy.miniCards.listTitle}</p>
                <p className="text-lg font-bold text-blue-900">{copy.miniCards.listBody}</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50">
                <p className="text-xs font-semibold text-emerald-700">{copy.miniCards.stockTitle}</p>
                <p className="text-lg font-bold text-emerald-900">{copy.miniCards.stockBody}</p>
              </div>
              <div className="p-4 rounded-xl bg-amber-50">
                <p className="text-xs font-semibold text-amber-700">{copy.miniCards.shipTitle}</p>
                <p className="text-lg font-bold text-amber-900">{copy.miniCards.shipBody}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50">
                <p className="text-xs font-semibold text-slate-700">{copy.miniCards.reportTitle}</p>
                <p className="text-lg font-bold text-slate-900">{copy.miniCards.reportBody}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Import complet + expediții + rapoarte */}
        <section className="space-y-6">
          <div className="border border-gray-200 rounded-2xl p-6 grid md:grid-cols-2 gap-4 items-start bg-white shadow-sm">
            <div className="space-y-2">
              <p className="font-semibold text-primary">{copy.importTitle}</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                {copy.importList.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="text-gray-700 text-sm">{copy.importNote}</p>
            </div>
            <CardImage
              url={media[CARD_KEYS.import]}
              alt={`${copy.importTitle} - captură`}
              fallback={placeholders.import}
              clickText={copy.clickToEnlarge}
            />
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 grid md:grid-cols-2 gap-4 items-start bg-white shadow-sm">
            <div className="space-y-2">
              <p className="font-semibold text-primary">{copy.notifyTitle}</p>
              <p className="text-gray-700 text-sm">{copy.notifyBody}</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                {copy.notifyOptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <CardImage
              url={media[CARD_KEYS.notify]}
              alt={`${copy.notifyTitle} - captură`}
              fallback={placeholders.notify}
              clickText={copy.clickToEnlarge}
            />
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 grid md:grid-cols-2 gap-4 items-start bg-white shadow-sm">
            <div className="space-y-2">
              <p className="font-semibold text-primary">{copy.prepTitle}</p>
              <p className="text-gray-700 text-sm">{copy.prepBody}</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                <li>{copy.prepOption}</li>
              </ul>
            </div>
            <CardImage
              url={media[CARD_KEYS.prep]}
              alt={`${copy.prepTitle} - captură`}
              fallback={placeholders.prep}
              clickText={copy.clickToEnlarge}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-2">
              <p className="font-semibold text-primary">{copy.reports.sendTitle}</p>
              <p className="text-gray-700 text-sm">{copy.reports.sendDesc}</p>
              <CardImage
                url={media[CARD_KEYS.reportSend]}
                alt={`${copy.reports.sendTitle} - captură`}
                fallback={placeholders.reportSend}
                clickText={copy.clickToEnlarge}
              />
            </div>
            <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-2">
              <p className="font-semibold text-primary">{copy.reports.incomingTitle}</p>
              <p className="text-gray-700 text-sm">{copy.reports.incomingDesc}</p>
              <CardImage
                url={media[CARD_KEYS.reportIncoming]}
                alt={`${copy.reports.incomingTitle} - captură`}
                fallback={placeholders.reportIncoming}
                clickText={copy.clickToEnlarge}
              />
            </div>
            <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm space-y-2">
              <p className="font-semibold text-primary">{copy.reports.emailTitle}</p>
              <p className="text-gray-700 text-sm">{copy.reports.emailDesc}</p>
              <CardImage
                url={media[CARD_KEYS.reportEmail]}
                alt={`${copy.reports.emailTitle} - captură`}
                fallback={placeholders.reportEmail}
                clickText={copy.clickToEnlarge}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
