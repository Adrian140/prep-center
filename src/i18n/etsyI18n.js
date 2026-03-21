import { useLanguage } from '@/contexts/LanguageContext';

const ETSY_I18N = {
  en: {
    client: {
      panelSubtitle: 'Shop, orders, tracking and Product Etsy',
      title: 'Etsy',
      desc: 'Connect your Etsy shop using the official Etsy OAuth flow.',
      loading: 'Loading Etsy...',
      statusConnected: 'Etsy connected',
      statusPending: 'Etsy not connected',
      lastSync: 'Last sync: {date}',
      connectedAt: 'Connected: {date}',
      connectTitle: 'How it works',
      steps: [
        'Click Connect Etsy.',
        'Log in to Etsy and approve access for your shop.',
        'You will be redirected back to Prep Center automatically.',
        'After the first sync, orders, listings and tracking appear in your Etsy views.'
      ],
      actions: {
        refresh: 'Refresh',
        connect: 'Connect Etsy',
        reconnect: 'Reconnect Etsy',
        disconnect: 'Disconnect Etsy',
        back: 'Back to dashboard'
      },
      flash: {
        loadError: 'Could not load Etsy integration.',
        missingOauth: 'Etsy OAuth is not fully configured: set VITE_ETSY_CLIENT_ID and VITE_ETSY_REDIRECT_URI.',
        connectError: 'Etsy connection failed.',
        disconnectError: 'Could not disconnect Etsy.',
        disconnected: 'Etsy has been disconnected.'
      },
      confirmDisconnect: 'Disconnect Etsy for this account?',
      accountHint: 'The initial Etsy connection uses the official OAuth redirect. Refresh tokens are stored server-side after authorization.',
      callback: {
        processing: 'Processing Etsy authorization...',
        saving: 'Saving Etsy integration...',
        success: 'Etsy connected successfully. Redirecting...',
        missingVerifier: 'Missing PKCE verifier. Please reconnect Etsy from the dashboard.',
        missingData: 'Missing authorization data from Etsy callback.',
        failed: 'Etsy authorization failed.',
        titleSuccess: 'Etsy Connected',
        titleError: 'Etsy Error',
        titlePending: 'Please wait'
      }
    },
    admin: {
      title: 'Etsy',
      subtitle: 'Standalone overview for Etsy shops, orders, receipt ID, track ID and tracking status.',
      metrics: {
        integrations: 'Integrations',
        orders: 'Orders',
        trackingEvents: 'Tracking Events'
      },
      shopsTitle: 'Connected Etsy shops',
      shopsSubtitle: 'Select a shop and review all its Etsy orders.',
      loading: 'Loading Etsy Admin...',
      emptyIntegrations: 'No Etsy integrations yet.',
      shopFallback: 'Etsy shop',
      urlMissing: 'Missing URL',
      userLabel: 'User: {user} · Last sync: {date}',
      ordersTitle: 'Etsy orders',
      ordersSubtitle: 'Receipt ID, totals, shop, tracking code and live status from Etsy tables.',
      emptyOrders: 'No Etsy orders for the selected shop.',
      table: {
        receiptId: 'Receipt ID',
        shop: 'Shop',
        status: 'Status',
        trackId: 'Track ID',
        trackingStatus: 'Tracking status',
        date: 'Date',
        total: 'Total',
        shipped: 'Shipped: {date}'
      },
      timelineTitle: 'Tracking timeline',
      timelineSubtitle: 'Latest events for Etsy track IDs.',
      emptyTracking: 'No tracking events yet.',
      trackingUpdate: 'Tracking update',
      noStatusDetail: 'No additional details',
      unknownLocation: 'Unknown location',
      status: {
        active: 'Active',
        error: 'Error',
        pending: 'Pending'
      },
      flash: {
        loadError: 'Could not load Etsy.'
      }
    },
    product: {
      title: 'Product Etsy',
      listings: 'Listings: {value}',
      orders: 'Orders: {orders} · Units sold: {units}',
      receipt: 'Receipt {receipt} · {shop} · {status}',
      tracking: 'Qty {qty} · Track ID {tracking} · {trackingStatus}',
      dates: 'Created {created} · Shipped {shipped}',
      noTrackingStatus: 'No tracking status'
    }
  },
  fr: {
    client: {
      panelSubtitle: 'Boutique, commandes, suivi et produit Etsy',
      title: 'Etsy',
      desc: 'Connectez votre boutique Etsy via le flux OAuth officiel Etsy.',
      loading: 'Chargement de Etsy...',
      statusConnected: 'Etsy connecté',
      statusPending: 'Etsy non connecté',
      lastSync: 'Dernière synchronisation : {date}',
      connectedAt: 'Connecté : {date}',
      connectTitle: 'Fonctionnement',
      steps: [
        'Cliquez sur Connecter Etsy.',
        'Connectez-vous à Etsy et autorisez l’accès à votre boutique.',
        'Vous serez automatiquement redirigé vers Prep Center.',
        'Après la première synchronisation, les commandes, annonces et suivis apparaîtront dans vos vues Etsy.'
      ],
      actions: { refresh: 'Actualiser', connect: 'Connecter Etsy', reconnect: 'Reconnecter Etsy', disconnect: 'Déconnecter Etsy', back: 'Retour au tableau de bord' },
      flash: {
        loadError: "Impossible de charger l'intégration Etsy.",
        missingOauth: 'OAuth Etsy n’est pas configuré : définissez VITE_ETSY_CLIENT_ID et VITE_ETSY_REDIRECT_URI.',
        connectError: 'La connexion Etsy a échoué.',
        disconnectError: 'Impossible de déconnecter Etsy.',
        disconnected: 'Etsy a été déconnecté.'
      },
      confirmDisconnect: 'Déconnecter Etsy pour ce compte ?',
      accountHint: 'La connexion initiale Etsy utilise la redirection OAuth officielle. Les refresh tokens sont stockés côté serveur après autorisation.',
      callback: {
        processing: "Traitement de l'autorisation Etsy...",
        saving: "Enregistrement de l'intégration Etsy...",
        success: 'Etsy connecté avec succès. Redirection...',
        missingVerifier: 'PKCE verifier manquant. Merci de reconnecter Etsy depuis le tableau de bord.',
        missingData: "Données d'autorisation Etsy manquantes.",
        failed: "L'autorisation Etsy a échoué.",
        titleSuccess: 'Etsy connecté',
        titleError: 'Erreur Etsy',
        titlePending: 'Veuillez patienter'
      }
    },
    admin: {
      title: 'Etsy',
      subtitle: 'Vue séparée pour les boutiques Etsy, commandes, receipt ID, track ID et statut de suivi.',
      metrics: { integrations: 'Intégrations', orders: 'Commandes', trackingEvents: 'Événements de suivi' },
      shopsTitle: 'Boutiques Etsy connectées',
      shopsSubtitle: 'Sélectionnez une boutique et consultez toutes ses commandes Etsy.',
      loading: 'Chargement de Etsy Admin...',
      emptyIntegrations: 'Aucune intégration Etsy.',
      shopFallback: 'Boutique Etsy',
      urlMissing: 'URL manquante',
      userLabel: 'Utilisateur : {user} · Dernière synchro : {date}',
      ordersTitle: 'Commandes Etsy',
      ordersSubtitle: 'Receipt ID, totaux, boutique, code de suivi et statut en direct depuis les tables Etsy.',
      emptyOrders: 'Aucune commande Etsy pour la boutique sélectionnée.',
      table: { receiptId: 'Receipt ID', shop: 'Boutique', status: 'Statut', trackId: 'Track ID', trackingStatus: 'Statut de suivi', date: 'Date', total: 'Total', shipped: 'Expédié : {date}' },
      timelineTitle: 'Chronologie du suivi',
      timelineSubtitle: 'Derniers événements pour les track IDs Etsy.',
      emptyTracking: 'Aucun événement de suivi pour le moment.',
      trackingUpdate: 'Mise à jour du suivi',
      noStatusDetail: 'Aucun détail supplémentaire',
      unknownLocation: 'Lieu inconnu',
      status: { active: 'Actif', error: 'Erreur', pending: 'En attente' },
      flash: { loadError: 'Impossible de charger Etsy.' }
    },
    product: {
      title: 'Produit Etsy',
      listings: 'Annonces : {value}',
      orders: 'Commandes : {orders} · Unités vendues : {units}',
      receipt: 'Receipt {receipt} · {shop} · {status}',
      tracking: 'Qté {qty} · Track ID {tracking} · {trackingStatus}',
      dates: 'Créé {created} · Expédié {shipped}',
      noTrackingStatus: 'Aucun statut de suivi'
    }
  },
  de: {
    client: {
      panelSubtitle: 'Shop, Bestellungen, Tracking und Produkt Etsy',
      title: 'Etsy',
      desc: 'Verbinde deinen Etsy-Shop über den offiziellen Etsy-OAuth-Flow.',
      loading: 'Etsy wird geladen...',
      statusConnected: 'Etsy verbunden',
      statusPending: 'Etsy nicht verbunden',
      lastSync: 'Letzte Synchronisierung: {date}',
      connectedAt: 'Verbunden: {date}',
      connectTitle: 'So funktioniert es',
      steps: [
        'Klicke auf Etsy verbinden.',
        'Melde dich bei Etsy an und erteile Zugriff auf deinen Shop.',
        'Du wirst automatisch zurück zu Prep Center weitergeleitet.',
        'Nach der ersten Synchronisierung erscheinen Bestellungen, Listings und Tracking in deinen Etsy-Ansichten.'
      ],
      actions: { refresh: 'Aktualisieren', connect: 'Etsy verbinden', reconnect: 'Etsy neu verbinden', disconnect: 'Etsy trennen', back: 'Zurück zum Dashboard' },
      flash: {
        loadError: 'Etsy-Integration konnte nicht geladen werden.',
        missingOauth: 'Etsy OAuth ist nicht vollständig konfiguriert: setze VITE_ETSY_CLIENT_ID und VITE_ETSY_REDIRECT_URI.',
        connectError: 'Etsy-Verbindung fehlgeschlagen.',
        disconnectError: 'Etsy konnte nicht getrennt werden.',
        disconnected: 'Etsy wurde getrennt.'
      },
      confirmDisconnect: 'Etsy für dieses Konto trennen?',
      accountHint: 'Die erste Etsy-Verbindung nutzt die offizielle OAuth-Weiterleitung. Refresh-Tokens werden nach der Autorisierung serverseitig gespeichert.',
      callback: {
        processing: 'Etsy-Autorisierung wird verarbeitet...',
        saving: 'Etsy-Integration wird gespeichert...',
        success: 'Etsy erfolgreich verbunden. Weiterleitung...',
        missingVerifier: 'PKCE-Verifier fehlt. Bitte verbinde Etsy erneut aus dem Dashboard.',
        missingData: 'Fehlende Autorisierungsdaten aus dem Etsy-Callback.',
        failed: 'Etsy-Autorisierung fehlgeschlagen.',
        titleSuccess: 'Etsy verbunden',
        titleError: 'Etsy-Fehler',
        titlePending: 'Bitte warten'
      }
    },
    admin: {
      title: 'Etsy',
      subtitle: 'Separate Übersicht für Etsy-Shops, Bestellungen, Receipt ID, Track ID und Tracking-Status.',
      metrics: { integrations: 'Integrationen', orders: 'Bestellungen', trackingEvents: 'Tracking-Ereignisse' },
      shopsTitle: 'Verbundene Etsy-Shops',
      shopsSubtitle: 'Wähle einen Shop aus und prüfe alle Etsy-Bestellungen.',
      loading: 'Etsy Admin wird geladen...',
      emptyIntegrations: 'Noch keine Etsy-Integrationen.',
      shopFallback: 'Etsy-Shop',
      urlMissing: 'URL fehlt',
      userLabel: 'Benutzer: {user} · Letzter Sync: {date}',
      ordersTitle: 'Etsy-Bestellungen',
      ordersSubtitle: 'Receipt ID, Gesamtbetrag, Shop, Tracking-Code und Live-Status aus den Etsy-Tabellen.',
      emptyOrders: 'Keine Etsy-Bestellungen für den ausgewählten Shop.',
      table: { receiptId: 'Receipt ID', shop: 'Shop', status: 'Status', trackId: 'Track ID', trackingStatus: 'Tracking-Status', date: 'Datum', total: 'Gesamt', shipped: 'Versandt: {date}' },
      timelineTitle: 'Tracking-Zeitleiste',
      timelineSubtitle: 'Neueste Ereignisse für Etsy-Track-IDs.',
      emptyTracking: 'Noch keine Tracking-Ereignisse.',
      trackingUpdate: 'Tracking-Update',
      noStatusDetail: 'Keine zusätzlichen Details',
      unknownLocation: 'Unbekannter Ort',
      status: { active: 'Aktiv', error: 'Fehler', pending: 'Ausstehend' },
      flash: { loadError: 'Etsy konnte nicht geladen werden.' }
    },
    product: {
      title: 'Produkt Etsy',
      listings: 'Listings: {value}',
      orders: 'Bestellungen: {orders} · Verkaufte Einheiten: {units}',
      receipt: 'Receipt {receipt} · {shop} · {status}',
      tracking: 'Menge {qty} · Track ID {tracking} · {trackingStatus}',
      dates: 'Erstellt {created} · Versandt {shipped}',
      noTrackingStatus: 'Kein Tracking-Status'
    }
  },
  it: {
    client: {
      panelSubtitle: 'Shop, ordini, tracking e prodotto Etsy',
      title: 'Etsy',
      desc: 'Collega il tuo shop Etsy tramite il flusso OAuth ufficiale Etsy.',
      loading: 'Caricamento Etsy...',
      statusConnected: 'Etsy connesso',
      statusPending: 'Etsy non connesso',
      lastSync: 'Ultima sincronizzazione: {date}',
      connectedAt: 'Connesso: {date}',
      connectTitle: 'Come funziona',
      steps: [
        'Clicca su Collega Etsy.',
        'Accedi a Etsy e autorizza l’accesso al tuo shop.',
        'Verrai reindirizzato automaticamente a Prep Center.',
        'Dopo la prima sincronizzazione, ordini, inserzioni e tracking appariranno nelle viste Etsy.'
      ],
      actions: { refresh: 'Aggiorna', connect: 'Collega Etsy', reconnect: 'Ricollega Etsy', disconnect: 'Disconnetti Etsy', back: 'Torna alla dashboard' },
      flash: {
        loadError: "Impossibile caricare l'integrazione Etsy.",
        missingOauth: 'OAuth Etsy non configurato completamente: imposta VITE_ETSY_CLIENT_ID e VITE_ETSY_REDIRECT_URI.',
        connectError: 'Connessione Etsy non riuscita.',
        disconnectError: 'Impossibile disconnettere Etsy.',
        disconnected: 'Etsy è stato disconnesso.'
      },
      confirmDisconnect: 'Disconnettere Etsy per questo account?',
      accountHint: 'La connessione iniziale Etsy usa il redirect OAuth ufficiale. I refresh token vengono salvati lato server dopo l’autorizzazione.',
      callback: {
        processing: 'Elaborazione autorizzazione Etsy...',
        saving: 'Salvataggio integrazione Etsy...',
        success: 'Etsy connesso correttamente. Reindirizzamento...',
        missingVerifier: 'Verifier PKCE mancante. Ricollega Etsy dalla dashboard.',
        missingData: 'Dati di autorizzazione mancanti dal callback Etsy.',
        failed: 'Autorizzazione Etsy non riuscita.',
        titleSuccess: 'Etsy connesso',
        titleError: 'Errore Etsy',
        titlePending: 'Attendere'
      }
    },
    admin: {
      title: 'Etsy',
      subtitle: 'Panoramica separata per shop Etsy, ordini, receipt ID, track ID e stato tracking.',
      metrics: { integrations: 'Integrazioni', orders: 'Ordini', trackingEvents: 'Eventi di tracking' },
      shopsTitle: 'Shop Etsy collegati',
      shopsSubtitle: 'Seleziona uno shop e controlla tutti i suoi ordini Etsy.',
      loading: 'Caricamento Etsy Admin...',
      emptyIntegrations: 'Nessuna integrazione Etsy.',
      shopFallback: 'Shop Etsy',
      urlMissing: 'URL mancante',
      userLabel: 'Utente: {user} · Ultimo sync: {date}',
      ordersTitle: 'Ordini Etsy',
      ordersSubtitle: 'Receipt ID, totale, shop, codice tracking e stato live dalle tabelle Etsy.',
      emptyOrders: 'Nessun ordine Etsy per lo shop selezionato.',
      table: { receiptId: 'Receipt ID', shop: 'Shop', status: 'Stato', trackId: 'Track ID', trackingStatus: 'Stato tracking', date: 'Data', total: 'Totale', shipped: 'Spedito: {date}' },
      timelineTitle: 'Timeline tracking',
      timelineSubtitle: 'Ultimi eventi per i track ID Etsy.',
      emptyTracking: 'Nessun evento di tracking ancora.',
      trackingUpdate: 'Aggiornamento tracking',
      noStatusDetail: 'Nessun dettaglio aggiuntivo',
      unknownLocation: 'Posizione sconosciuta',
      status: { active: 'Attivo', error: 'Errore', pending: 'In attesa' },
      flash: { loadError: 'Impossibile caricare Etsy.' }
    },
    product: {
      title: 'Prodotto Etsy',
      listings: 'Inserzioni: {value}',
      orders: 'Ordini: {orders} · Unità vendute: {units}',
      receipt: 'Receipt {receipt} · {shop} · {status}',
      tracking: 'Qtà {qty} · Track ID {tracking} · {trackingStatus}',
      dates: 'Creato {created} · Spedito {shipped}',
      noTrackingStatus: 'Nessuno stato tracking'
    }
  },
  es: {
    client: {
      panelSubtitle: 'Tienda, pedidos, seguimiento y producto Etsy',
      title: 'Etsy',
      desc: 'Conecta tu tienda Etsy mediante el flujo OAuth oficial de Etsy.',
      loading: 'Cargando Etsy...',
      statusConnected: 'Etsy conectado',
      statusPending: 'Etsy no conectado',
      lastSync: 'Última sincronización: {date}',
      connectedAt: 'Conectado: {date}',
      connectTitle: 'Cómo funciona',
      steps: [
        'Haz clic en Conectar Etsy.',
        'Inicia sesión en Etsy y autoriza el acceso a tu tienda.',
        'Serás redirigido automáticamente a Prep Center.',
        'Después de la primera sincronización, pedidos, listings y tracking aparecerán en tus vistas Etsy.'
      ],
      actions: { refresh: 'Actualizar', connect: 'Conectar Etsy', reconnect: 'Reconectar Etsy', disconnect: 'Desconectar Etsy', back: 'Volver al panel' },
      flash: {
        loadError: 'No se pudo cargar la integración de Etsy.',
        missingOauth: 'OAuth de Etsy no está configurado completamente: define VITE_ETSY_CLIENT_ID y VITE_ETSY_REDIRECT_URI.',
        connectError: 'Falló la conexión de Etsy.',
        disconnectError: 'No se pudo desconectar Etsy.',
        disconnected: 'Etsy ha sido desconectado.'
      },
      confirmDisconnect: '¿Desconectar Etsy para esta cuenta?',
      accountHint: 'La conexión inicial de Etsy usa el redireccionamiento OAuth oficial. Los refresh tokens se guardan del lado del servidor tras la autorización.',
      callback: {
        processing: 'Procesando autorización de Etsy...',
        saving: 'Guardando integración de Etsy...',
        success: 'Etsy conectado correctamente. Redirigiendo...',
        missingVerifier: 'Falta el PKCE verifier. Vuelve a conectar Etsy desde el panel.',
        missingData: 'Faltan datos de autorización del callback de Etsy.',
        failed: 'La autorización de Etsy falló.',
        titleSuccess: 'Etsy conectado',
        titleError: 'Error de Etsy',
        titlePending: 'Espera'
      }
    },
    admin: {
      title: 'Etsy',
      subtitle: 'Vista separada para tiendas Etsy, pedidos, receipt ID, track ID y estado de seguimiento.',
      metrics: { integrations: 'Integraciones', orders: 'Pedidos', trackingEvents: 'Eventos de seguimiento' },
      shopsTitle: 'Tiendas Etsy conectadas',
      shopsSubtitle: 'Selecciona una tienda y revisa todos sus pedidos Etsy.',
      loading: 'Cargando Etsy Admin...',
      emptyIntegrations: 'Todavía no hay integraciones Etsy.',
      shopFallback: 'Tienda Etsy',
      urlMissing: 'Falta URL',
      userLabel: 'Usuario: {user} · Último sync: {date}',
      ordersTitle: 'Pedidos Etsy',
      ordersSubtitle: 'Receipt ID, total, tienda, código de seguimiento y estado en vivo desde las tablas Etsy.',
      emptyOrders: 'No hay pedidos Etsy para la tienda seleccionada.',
      table: { receiptId: 'Receipt ID', shop: 'Tienda', status: 'Estado', trackId: 'Track ID', trackingStatus: 'Estado de seguimiento', date: 'Fecha', total: 'Total', shipped: 'Enviado: {date}' },
      timelineTitle: 'Línea de tiempo de seguimiento',
      timelineSubtitle: 'Últimos eventos para los track IDs de Etsy.',
      emptyTracking: 'Aún no hay eventos de seguimiento.',
      trackingUpdate: 'Actualización de seguimiento',
      noStatusDetail: 'Sin detalles adicionales',
      unknownLocation: 'Ubicación desconocida',
      status: { active: 'Activo', error: 'Error', pending: 'Pendiente' },
      flash: { loadError: 'No se pudo cargar Etsy.' }
    },
    product: {
      title: 'Producto Etsy',
      listings: 'Listings: {value}',
      orders: 'Pedidos: {orders} · Unidades vendidas: {units}',
      receipt: 'Receipt {receipt} · {shop} · {status}',
      tracking: 'Cant. {qty} · Track ID {tracking} · {trackingStatus}',
      dates: 'Creado {created} · Enviado {shipped}',
      noTrackingStatus: 'Sin estado de seguimiento'
    }
  },
  ro: {
    client: {
      panelSubtitle: 'Shop, comenzi, tracking și Product Etsy',
      title: 'Etsy',
      desc: 'Conectează shop-ul Etsy prin fluxul oficial Etsy OAuth.',
      loading: 'Se încarcă Etsy...',
      statusConnected: 'Etsy conectat',
      statusPending: 'Etsy neconectat',
      lastSync: 'Ultimul sync: {date}',
      connectedAt: 'Conectat: {date}',
      connectTitle: 'Cum funcționează',
      steps: [
        'Apasă Connect Etsy.',
        'Autentifică-te în Etsy și aprobă accesul pentru shop-ul tău.',
        'Vei fi redirecționat automat înapoi în Prep Center.',
        'După primul sync, comenzile, listing-urile și trackingul apar în vizualizările Etsy.'
      ],
      actions: { refresh: 'Refresh', connect: 'Connect Etsy', reconnect: 'Reconnect Etsy', disconnect: 'Disconnect Etsy', back: 'Înapoi în dashboard' },
      flash: {
        loadError: 'Nu am putut încărca integrarea Etsy.',
        missingOauth: 'Etsy OAuth nu este configurat complet: setează VITE_ETSY_CLIENT_ID și VITE_ETSY_REDIRECT_URI.',
        connectError: 'Conectarea Etsy a eșuat.',
        disconnectError: 'Nu am putut deconecta Etsy.',
        disconnected: 'Etsy a fost deconectat.'
      },
      confirmDisconnect: 'Deconectezi Etsy pentru acest cont?',
      accountHint: 'Conectarea inițială Etsy folosește redirect-ul oficial OAuth. Refresh token-urile sunt stocate server-side după autorizare.',
      callback: {
        processing: 'Procesăm autorizarea Etsy...',
        saving: 'Salvăm integrarea Etsy...',
        success: 'Etsy conectat cu succes. Redirecționăm...',
        missingVerifier: 'Lipsește verifier-ul PKCE. Reconectează Etsy din dashboard.',
        missingData: 'Lipsesc datele de autorizare din callback-ul Etsy.',
        failed: 'Autorizarea Etsy a eșuat.',
        titleSuccess: 'Etsy conectat',
        titleError: 'Eroare Etsy',
        titlePending: 'Te rugăm așteaptă'
      }
    },
    admin: {
      title: 'Etsy',
      subtitle: 'Overview separat pentru shop-uri Etsy, comenzi, receipt ID, track ID și tracking status.',
      metrics: { integrations: 'Integrări', orders: 'Comenzi', trackingEvents: 'Evenimente tracking' },
      shopsTitle: 'Shop-uri Etsy conectate',
      shopsSubtitle: 'Selectezi shop-ul și vezi toate comenzile lui Etsy.',
      loading: 'Se încarcă Etsy Admin...',
      emptyIntegrations: 'Nicio integrare Etsy încă.',
      shopFallback: 'Shop Etsy',
      urlMissing: 'URL lipsă',
      userLabel: 'User: {user} · Ultimul sync: {date}',
      ordersTitle: 'Comenzi Etsy',
      ordersSubtitle: 'Receipt ID, total, shop, tracking code și status live din tabelele Etsy.',
      emptyOrders: 'Nicio comandă Etsy pentru shop-ul selectat.',
      table: { receiptId: 'Receipt ID', shop: 'Shop', status: 'Status', trackId: 'Track ID', trackingStatus: 'Tracking status', date: 'Date', total: 'Total', shipped: 'Shipped: {date}' },
      timelineTitle: 'Tracking timeline',
      timelineSubtitle: 'Ultimele evenimente pentru track ID-urile Etsy.',
      emptyTracking: 'Nu există încă evenimente de tracking.',
      trackingUpdate: 'Tracking update',
      noStatusDetail: 'Fără detalii suplimentare',
      unknownLocation: 'Locație necunoscută',
      status: { active: 'Activ', error: 'Eroare', pending: 'Pending' },
      flash: { loadError: 'Nu am putut încărca Etsy.' }
    },
    product: {
      title: 'Product Etsy',
      listings: 'Listings: {value}',
      orders: 'Orders: {orders} · Units sold: {units}',
      receipt: 'Receipt {receipt} · {shop} · {status}',
      tracking: 'Qty {qty} · Track ID {tracking} · {trackingStatus}',
      dates: 'Created {created} · Shipped {shipped}',
      noTrackingStatus: 'No tracking status'
    }
  }
};

const interpolate = (text, vars = {}) =>
  typeof text === 'string'
    ? text.replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : `{${key}}`))
    : text;

const deepGet = (obj, path) => path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);

export function useEtsyI18n() {
  const { currentLanguage } = useLanguage();
  const bundle = ETSY_I18N[currentLanguage] || ETSY_I18N.en;
  const fallback = ETSY_I18N.en;
  const t = (path, vars) => {
    const raw = deepGet(bundle, path) ?? deepGet(fallback, path) ?? path;
    return interpolate(raw, vars);
  };
  const list = (path) => {
    const raw = deepGet(bundle, path) ?? deepGet(fallback, path) ?? [];
    return Array.isArray(raw) ? raw : [];
  };
  return { t, list, lang: currentLanguage };
}

