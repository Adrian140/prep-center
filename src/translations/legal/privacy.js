// FILE: src/translations/legal/privacy.js
export const privacy = {
  fr: {
    title: "Politique de Confidentialité",
    lastUpdated: "Dernière mise à jour : 22.11.2025",
    sections: {
      intro_h: "1. Introduction",
      intro_p:
        "Prep Center France (« nous ») respecte vos données personnelles et les protège conformément au RGPD et à la loi française. Cette politique explique comment nous collectons, utilisons et protégeons vos informations.",

      controller_h: "Responsable du Traitement",
      // ⇩ Doar emailul, conform cerinței
      controller_lines: ["contact@prep-center.eu"],

      data_h: "2. Données Collectées",
      data_labels: { id: "Données d’identification", billing: "Données de facturation", tech: "Données techniques" },
      data_lists: {
        id: ["Nom et prénom", "Adresse e-mail", "Numéro de téléphone", "Adresses de livraison et facturation"],
        billing: ["Nom de l’entreprise", "Numéro de TVA", "SIREN/SIRET (France)", "Adresse de facturation"],
        tech: ["Adresse IP", "Type et version du navigateur", "Système d’exploitation", "Pages visitées et temps passé"],
      },

      purposes_h: "3. Finalités du Traitement",
      purposes_list: [
        "Exécution du contrat (commandes, facturation, services FBA, communications)",
        "Obligations légales (comptabilité, fiscalité, e-commerce)",
        "Intérêts légitimes (amélioration des services, analytique, prévention de la fraude, marketing avec consentement)",
      ],

      recipients_h: "4. Destinataires",
      recipients_p:
        "Nous ne vendons ni ne louons vos données. Partage uniquement avec transporteurs, prestataires de paiement, hébergement/cloud et autorités lorsque la loi l’exige.",

      transfers_h: "5. Transferts",
      transfers_p: "Si des transferts hors UE/EEE sont nécessaires, nous appliquons des garanties appropriées (clauses types, etc.).",

      spapi_data_h: "5 bis. Données SP-API Amazon",
      spapi_data_list: [
        "Identifiants d’autorisation (refresh/access tokens) chiffrés et stockés côté serveur ; pas exposés au front-end",
        "Identifiants de compte vendeur, marketplaces, ASIN/SKU, intégrations Amazon",
        "Données d’inventaire et de stock (quantités, statut, logs techniques)",
        "Commandes / items : uniquement données opérationnelles non PII ; pas de stockage d’adresses complètes, noms ou numéros de téléphone des acheteurs",
        "Journaux d’erreurs techniques pouvant contenir IDs Amazon (SellerId, MarketplaceId) mais pas PII",
      ],

      spapi_usage_h: "5 ter. Finalité SP-API",
      spapi_usage_list: [
        "Synchronisation de l’inventaire/stock pour nos comptes ou ceux connectés avec consentement",
        "Aucune vente/partage des données Amazon à des tiers sans consentement",
        "Accès limité aux rôles déclarés (Inventory, Fulfillment, Listings/Orders sans PII)",
      ],

      security_h: "6. Sécurité",
      security_list: [
        "Chiffrement en transit et, lorsque approprié, au repos",
        "Authentification à deux facteurs",
        "Accès au moindre privilège",
        "Surveillance et audits réguliers",
        "Sauvegardes et plans de reprise",
        "Clés SP-API/Supabase et tokens Amazon stockés dans des coffres/« secrets », avec rotation et accès restreint",
        "Journalisation et alertes en cas d’accès non autorisé ; révocation des tokens à la déconnexion",
      ],

      retention_h: "7. Conservation",
      retention_list: [
        "Comptes : tant que le compte est actif ou selon obligations légales (min. 5 ans)",
        "Facturation : 10 ans",
        "Marketing : jusqu’au retrait du consentement ou max. 3 ans après la dernière interaction",
        "Tokens SP-API : supprimés/invalidés à la révocation ou à la clôture ; logs techniques ≤ 90 jours",
      ],

      rights_h: "8. Vos Droits",
      rights_list: [
        "Accès, rectification, effacement",
        "Portabilité",
        "Opposition et limitation",
        "Retrait du consentement",
        "Plainte auprès de l’autorité de contrôle",
      ],

      children_h: "9. Enfants",
      children_p: "Nos services ne s’adressent pas aux enfants de moins de 16 ans.",

      dpa_h: "10. Sous-traitants",
      dpa_p: "Nous concluons des accords de traitement (DPA) avec des prestataires conformes au RGPD.",

      cookies_h: "11. Cookies",
      cookies_p:
        "Cookies essentiels, de performance (analytics) et de marketing (avec consentement). Détails dans la bannière de cookies.",

      changes_h: "12. Modifications",
      changes_p:
        "Nous pouvons mettre à jour cette politique. La date de mise à jour figure en haut de la page.",
    },
  },

  en: {
    title: "Privacy Policy",
    lastUpdated: "Last updated: 22.11.2025",
    sections: {
      intro_h: "1. Introduction",
      intro_p:
        "Prep Center France (“we”) respects your personal data and protects it under GDPR and applicable law. This policy explains how we collect, use and protect your information.",

      controller_h: "Controller",
      controller_lines: ["contact@prep-center.eu"],

      data_h: "2. Data Collected",
      data_labels: { id: "Identification data", billing: "Billing data", tech: "Technical data" },
      data_lists: {
        id: ["Full name", "Email address", "Phone number", "Shipping & billing addresses"],
        billing: ["Company name", "VAT / Tax ID", "SIREN/SIRET (France)", "Billing address"],
        tech: ["IP address", "Browser type & version", "Operating system", "Pages visited & time on site"],
      },

      purposes_h: "3. Purposes",
      purposes_list: [
        "Contract performance (orders, invoicing, FBA services, communications)",
        "Legal obligations (accounting, tax, e-commerce regulations)",
        "Legitimate interests (service improvement, analytics, fraud prevention, direct marketing with consent)",
      ],

      recipients_h: "4. Recipients",
      recipients_p:
        "We do not sell or rent your data. We share it only with carriers, payment processors, hosting/cloud, and authorities when required by law.",

      transfers_h: "5. Transfers",
      transfers_p:
        "If transfers outside the EU/EEA are required, we apply appropriate safeguards (e.g., SCCs).",

      spapi_data_h: "5 bis. Amazon SP-API Data",
      spapi_data_list: [
        "Auth identifiers (refresh/access tokens) encrypted and stored server-side; never exposed to the front-end",
        "Seller account IDs, marketplaces, ASIN/SKU, Amazon integration metadata",
        "Inventory/stock data (quantities, status, technical logs)",
        "Orders/items: only operational, non-PII fields; we do not store full buyer names, phone numbers, or full addresses",
        "Error logs may contain Amazon IDs (SellerId, MarketplaceId), no buyer PII",
      ],

      spapi_usage_h: "5 ter. SP-API Purpose",
      spapi_usage_list: [
        "Inventory sync for our own/authorized seller accounts",
        "No selling or sharing Amazon data with third parties without consent",
        "Access limited to declared roles (Inventory, Fulfillment, Listings/Orders non-PII)",
      ],

      security_h: "6. Security",
      security_list: [
        "Encryption in transit and, where appropriate, at rest",
        "Two-factor authentication",
        "Least-privilege access",
        "Regular monitoring & audits",
        "Backups and recovery plans",
        "SP-API/Supabase keys and Amazon tokens kept in secrets vaults with rotation and restricted access",
        "Logging and alerting for unauthorized access; token revocation on disconnect",
      ],

      retention_h: "7. Retention",
      retention_list: [
        "Account data: while the account is active or as legally required (min. 5 years)",
        "Billing data: 10 years",
        "Marketing data: until consent is withdrawn or up to 3 years after the last interaction",
        "SP-API tokens: removed/invalidated on revoke or account closure; technical logs retained ≤ 90 days",
      ],

      rights_h: "8. Your Rights",
      rights_list: [
        "Access, rectification, erasure",
        "Portability",
        "Objection and restriction",
        "Withdraw consent",
        "Complain to the supervisory authority",
      ],

      children_h: "9. Children",
      children_p: "Our services are not directed to children under 16.",

      dpa_h: "10. Data Processors",
      dpa_p: "We sign DPAs with GDPR-compliant processors.",

      cookies_h: "11. Cookies",
      cookies_p:
        "We use essential, performance (analytics) and marketing cookies (with consent). See the cookie banner for details.",

      changes_h: "12. Changes",
      changes_p:
        "We may update this policy. The update date appears at the top of the page.",
    },
  },

  ro: {
    title: "Politica de Confidențialitate",
    lastUpdated: "Ultima actualizare: 22.11.2025",
    sections: {
      intro_h: "1. Introducere",
      intro_p:
        "Prep Center France (\"noi\") respectă datele dvs. personale și le protejează conform GDPR și legislației aplicabile. Această politică explică modul în care colectăm, folosim și protejăm informațiile.",

      controller_h: "Operator",
      controller_lines: ["contact@prep-center.eu"],

      data_h: "2. Date Colectate",
      data_labels: { id: "Date de identificare", billing: "Date de facturare", tech: "Date tehnice" },
      data_lists: {
        id: ["Nume și prenume", "Adresă de email", "Număr de telefon", "Adrese de livrare și facturare"],
        billing: ["Denumirea companiei", "CUI/VAT", "SIREN/SIRET (Franța)", "Adresa de facturare"],
        tech: ["Adresă IP", "Tip și versiune browser", "Sistem de operare", "Pagini vizitate și timp petrecut"],
      },

      purposes_h: "3. Scopuri",
      purposes_list: [
        "Executarea contractului (comenzi, facturare, servicii FBA, comunicări)",
        "Obligații legale (contabilitate, fiscalitate, reglementări e-commerce)",
        "Interese legitime (îmbunătățirea serviciilor, analytics, prevenire fraudă, marketing cu consimțământ)",
      ],

      recipients_h: "4. Destinatari",
      recipients_p:
        "Nu vindem sau închiriem datele. Le partajăm doar cu transportatori, procesatori de plăți, servicii de hosting/cloud și autorități când legea o cere.",

      transfers_h: "5. Transferuri",
      transfers_p:
        "Dacă sunt necesare transferuri în afara UE/SEE, aplicăm garanții adecvate (de ex., SCC).",

      spapi_data_h: "5 bis. Date Amazon SP-API",
      spapi_data_list: [
        "Identificatori de autorizare (refresh/access tokens) criptate și stocate doar server-side; nu sunt expuse în front-end",
        "ID cont vânzător, marketplaces, ASIN/SKU, metadate ale integrării Amazon",
        "Date de inventar/stock (cantități, stare, log-uri tehnice)",
        "Comenzi/items: doar câmpuri operaționale non-PII; nu stocăm nume complete, telefoane sau adrese complete ale cumpărătorilor",
        "Log-uri de erori pot conține IDs Amazon (SellerId, MarketplaceId), nu PII cumpărător",
      ],

      spapi_usage_h: "5 ter. Scop utilizare SP-API",
      spapi_usage_list: [
        "Sync inventar pentru conturile proprii sau autorizate explicit",
        "Nu vindem și nu partajăm date Amazon cu terți fără consimțământ",
        "Acces limitat la rolurile declarate (Inventory, Fulfillment, Listings/Orders non-PII)",
      ],

      security_h: "6. Securitate",
      security_list: [
        "Criptare în tranzit și, după caz, în repaus",
        "Autentificare cu doi factori",
        "Acces minim necesar (least privilege)",
        "Monitorizare și audit periodic",
        "Backup-uri și planuri de recuperare",
        "Chei SP-API/Supabase și token-uri Amazon păstrate în seifuri/secrets, cu rotație și acces limitat",
        "Logare și alertare pentru acces neautorizat; revocare token la deconectare",
      ],

      retention_h: "7. Păstrare",
      retention_list: [
        "Date de cont: cât timp contul este activ sau min. 5 ani conform legii",
        "Date de facturare: 10 ani",
        "Date de marketing: până la retragerea consimțământului sau max. 3 ani de la ultima interacțiune",
        "Token-uri SP-API: șterse/invalidated la revocare sau închiderea contului; log-uri tehnice ≤ 90 zile",
      ],

      rights_h: "8. Drepturile Dvs.",
      rights_list: [
        "Acces, rectificare, ștergere",
        "Portabilitate",
        "Opoziție și restricționare",
        "Retragerea consimțământului",
        "Plângere la autoritatea de supraveghere",
      ],

      children_h: "9. Copii",
      children_p: "Serviciile noastre nu se adresează copiilor sub 16 ani.",

      dpa_h: "10. Persoane Împuternicite",
      dpa_p: "Încheiem DPA cu procesatori conformi GDPR.",

      cookies_h: "11. Cookie-uri",
      cookies_p:
        "Folosim cookie-uri esențiale, de performanță (analytics) și de marketing (cu consimțământ). Detalii în bannerul de cookies.",

      changes_h: "12. Modificări",
      changes_p:
        "Putem actualiza această politică. Data actualizării este indicată în partea de sus a paginii.",
    },
  },

  de: {
    title: "Datenschutzerklärung",
    lastUpdated: "Zuletzt aktualisiert: 27.09.2025",
    sections: {
      intro_h: "1. Einleitung",
      intro_p:
        "Prep Center France („wir“) respektiert Ihre personenbezogenen Daten und schützt sie gemäß der DSGVO und dem geltenden Recht. Diese Richtlinie erklärt, wie wir Informationen erheben, verwenden und schützen.",

      controller_h: "Verantwortlicher",
      controller_lines: ["contact@prep-center.eu"],

      data_h: "2. Erhobene Daten",
      data_labels: { id: "Identifikationsdaten", billing: "Abrechnungsdaten", tech: "Technische Daten" },
      data_lists: {
        id: ["Vollständiger Name", "E-Mail-Adresse", "Telefonnummer", "Liefer- und Rechnungsadressen"],
        billing: ["Firmenname", "USt-IdNr./Steuer-ID", "SIREN/SIRET (Frankreich)", "Rechnungsadresse"],
        tech: ["IP-Adresse", "Browsertyp & Version", "Betriebssystem", "Besuchte Seiten & Verweildauer"],
      },

      purposes_h: "3. Zwecke",
      purposes_list: [
        "Vertragserfüllung (Bestellungen, Rechnungen, FBA-Services, Kommunikation)",
        "Gesetzliche Pflichten (Buchhaltung, Steuern, E-Commerce-Vorgaben)",
        "Berechtigtes Interesse (Serviceverbesserung, Analysen, Betrugsprävention, Direktmarketing mit Einwilligung)",
      ],

      recipients_h: "4. Empfänger",
      recipients_p:
        "Wir verkaufen oder vermieten Ihre Daten nicht. Weitergabe nur an Carrier, Zahlungsdienstleister, Hosting/Cloud und Behörden, wenn gesetzlich erforderlich.",

      transfers_h: "5. Übermittlungen",
      transfers_p:
        "Bei Übermittlungen außerhalb der EU/des EWR wenden wir geeignete Garantien an (z. B. Standardvertragsklauseln).",

      spapi_data_h: "5 bis. Amazon SP-API Daten",
      spapi_data_list: [
        "Auth-Identifikatoren (Refresh/Access Tokens) verschlüsselt und serverseitig gespeichert; nicht im Frontend sichtbar",
        "Seller-Account-IDs, Marktplätze, ASIN/SKU, Metadaten der Amazon-Integration",
        "Inventar-/Bestandsdaten (Mengen, Status, technische Logs)",
        "Bestellungen/Artikel: nur operative, nicht-PII-Felder; keine Speicherung vollständiger Käufernamen, Telefonnummern oder Adressen",
        "Error-Logs können Amazon-IDs (SellerId, MarketplaceId) enthalten, keine Käufer-PII",
      ],

      spapi_usage_h: "5 ter. SP-API Zweck",
      spapi_usage_list: [
        "Bestandssync für eigene bzw. autorisierte Verkäuferkonten",
        "Kein Verkauf/Weitergabe von Amazon-Daten an Dritte ohne Einwilligung",
        "Zugriff beschränkt auf deklarierte Rollen (Inventory, Fulfillment, Listings/Orders ohne PII)",
      ],

      security_h: "6. Sicherheit",
      security_list: [
        "Verschlüsselung bei Übertragung und ggf. im Ruhezustand",
        "Zwei-Faktor-Authentifizierung",
        "Least-Privilege-Zugriffsprinzip",
        "Regelmäßiges Monitoring & Audits",
        "Backups und Wiederherstellungspläne",
        "SP-API/Supabase Keys und Amazon Tokens in Secret-Vaults mit Rotation und eingeschränktem Zugriff",
        "Logging & Alerts bei unbefugtem Zugriff; Token-Widerruf bei Disconnect",
      ],

      retention_h: "7. Aufbewahrung",
      retention_list: [
        "Kontodaten: solange das Konto aktiv ist oder mind. 5 Jahre gesetzlich vorgeschrieben",
        "Abrechnungsdaten: 10 Jahre",
        "Marketingdaten: bis zum Widerruf der Einwilligung oder max. 3 Jahre nach der letzten Interaktion",
        "SP-API Tokens: gelöscht/invalidiert bei Widerruf oder Kontoschließung; technische Logs ≤ 90 Tage",
      ],

      rights_h: "8. Ihre Rechte",
      rights_list: [
        "Auskunft, Berichtigung, Löschung",
        "Datenübertragbarkeit",
        "Widerspruch und Einschränkung",
        "Widerruf der Einwilligung",
        "Beschwerde bei der Aufsichtsbehörde",
      ],

      children_h: "9. Kinder",
      children_p: "Unsere Dienste richten sich nicht an Kinder unter 16 Jahren.",

      dpa_h: "10. Auftragsverarbeiter",
      dpa_p: "Wir schließen Auftragsverarbeitungsverträge (DPA) mit DSGVO-konformen Dienstleistern.",

      cookies_h: "11. Cookies",
      cookies_p:
        "Wir verwenden essenzielle, Performance- (Analytics) und Marketing-Cookies (mit Einwilligung). Details im Cookie-Banner.",

      changes_h: "12. Änderungen",
      changes_p:
        "Wir können diese Richtlinie aktualisieren. Das Aktualisierungsdatum steht oben auf der Seite.",
    },
  },

  it: {
    title: "Informativa sulla Privacy",
    lastUpdated: "Ultimo aggiornamento: 27.09.2025",
    sections: {
      intro_h: "1. Introduzione",
      intro_p:
        "Prep Center France (“noi”) rispetta i dati personali e li protegge in conformità al GDPR e alla normativa applicabile. Questa informativa spiega come raccogliamo, utilizziamo e proteggiamo le informazioni.",

      controller_h: "Titolare del trattamento",
      controller_lines: ["contact@prep-center.eu"],

      data_h: "2. Dati raccolti",
      data_labels: { id: "Dati identificativi", billing: "Dati di fatturazione", tech: "Dati tecnici" },
      data_lists: {
        id: ["Nome e cognome", "Indirizzo e-mail", "Numero di telefono", "Indirizzi di spedizione e fatturazione"],
        billing: ["Ragione sociale", "Partita IVA/ID fiscale", "SIREN/SIRET (Francia)", "Indirizzo di fatturazione"],
        tech: ["Indirizzo IP", "Tipo e versione del browser", "Sistema operativo", "Pagine visitate e tempo di permanenza"],
      },

      purposes_h: "3. Finalità",
      purposes_list: [
        "Esecuzione del contratto (ordini, fatturazione, servizi FBA, comunicazioni)",
        "Obblighi di legge (contabilità, imposte, normative e-commerce)",
        "Legittimo interesse (miglioramento servizi, analisi, prevenzione frodi, marketing con consenso)",
      ],

      recipients_h: "4. Destinatari",
      recipients_p:
        "Non vendiamo o noleggiamo i dati. Condivisione solo con vettori, processori di pagamento, hosting/cloud e autorità quando richiesto dalla legge.",

      transfers_h: "5. Trasferimenti",
      transfers_p:
        "Se necessari trasferimenti fuori da UE/SEE, applichiamo garanzie adeguate (es. SCC).",

      spapi_data_h: "5 bis. Dati Amazon SP-API",
      spapi_data_list: [
        "Identificativi di autorizzazione (refresh/access token) crittografati e conservati lato server; non esposti al front-end",
        "ID account venditore, marketplace, ASIN/SKU, metadati di integrazione Amazon",
        "Dati di inventario/stock (quantità, stato, log tecnici)",
        "Ordini/articoli: solo campi operativi non PII; non memorizziamo nomi completi, telefoni o indirizzi completi degli acquirenti",
        "Log di errore possono contenere ID Amazon (SellerId, MarketplaceId), nessuna PII acquirente",
      ],

      spapi_usage_h: "5 ter. Scopo SP-API",
      spapi_usage_list: [
        "Sync inventario per account propri o autorizzati",
        "Nessuna vendita/condivisione di dati Amazon a terzi senza consenso",
        "Accesso limitato ai ruoli dichiarati (Inventory, Fulfillment, Listings/Orders senza PII)",
      ],

      security_h: "6. Sicurezza",
      security_list: [
        "Crittografia in transito e, ove opportuno, a riposo",
        "Autenticazione a due fattori",
        "Accesso secondo il principio del minimo privilegio",
        "Monitoraggio e audit regolari",
        "Backup e piani di ripristino",
        "Chiavi SP-API/Supabase e token Amazon conservati in vault/secret, con rotazione e accesso limitato",
        "Log e alert per accessi non autorizzati; revoca token alla disconnessione",
      ],

      retention_h: "7. Conservazione",
      retention_list: [
        "Dati account: finché l’account è attivo o minimo 5 anni secondo legge",
        "Dati di fatturazione: 10 anni",
        "Dati marketing: fino alla revoca del consenso o max. 3 anni dall’ultima interazione",
        "Token SP-API: rimossi/invalidati a revoca o chiusura account; log tecnici ≤ 90 giorni",
      ],

      rights_h: "8. Diritti dell’interessato",
      rights_list: [
        "Accesso, rettifica, cancellazione",
        "Portabilità",
        "Opposizione e limitazione",
        "Revoca del consenso",
        "Reclamo all’autorità di controllo",
      ],

      children_h: "9. Minori",
      children_p: "I nostri servizi non sono rivolti ai minori di 16 anni.",

      dpa_h: "10. Responsabili del trattamento",
      dpa_p: "Sottoscriviamo DPA con fornitori conformi al GDPR.",

      cookies_h: "11. Cookie",
      cookies_p:
        "Utilizziamo cookie essenziali, di prestazione (analytics) e di marketing (con consenso). Dettagli nel banner cookie.",

      changes_h: "12. Modifiche",
      changes_p:
        "Possiamo aggiornare questa informativa. La data di aggiornamento è indicata in cima alla pagina.",
    },
  },

  es: {
    title: "Política de Privacidad",
    lastUpdated: "Última actualización: 27.09.2025",
    sections: {
      intro_h: "1. Introducción",
      intro_p:
        "Prep Center France («nosotros») respeta sus datos personales y los protege conforme al RGPD y la normativa aplicable. Esta política explica cómo recopilamos, usamos y protegemos su información.",

      controller_h: "Responsable",
      controller_lines: ["contact@prep-center.eu"],

      data_h: "2. Datos recopilados",
      data_labels: { id: "Datos de identificación", billing: "Datos de facturación", tech: "Datos técnicos" },
      data_lists: {
        id: ["Nombre y apellidos", "Correo electrónico", "Número de teléfono", "Direcciones de envío y facturación"],
        billing: ["Nombre de la empresa", "NIF/IVA", "SIREN/SIRET (Francia)", "Dirección de facturación"],
        tech: ["Dirección IP", "Tipo y versión del navegador", "Sistema operativo", "Páginas visitadas y tiempo de permanencia"],
      },

      purposes_h: "3. Finalidades",
      purposes_list: [
        "Ejecución del contrato (pedidos, facturación, servicios FBA, comunicaciones)",
        "Obligaciones legales (contabilidad, impuestos, normativa de comercio electrónico)",
        "Intereses legítimos (mejora del servicio, analítica, prevención del fraude, marketing con consentimiento)",
      ],

      recipients_h: "4. Destinatarios",
      recipients_p:
        "No vendemos ni alquilamos sus datos. Solo se comparten con transportistas, procesadores de pagos, hosting/cloud y autoridades cuando la ley lo requiera.",

      transfers_h: "5. Transferencias",
      transfers_p:
        "Si se requieren transferencias fuera de la UE/EEE, aplicamos garantías adecuadas (p. ej., SCC).",

      spapi_data_h: "5 bis. Datos de Amazon SP-API",
      spapi_data_list: [
        "Identificadores de autorización (tokens refresh/access) cifrados y guardados en el servidor; no se exponen en el front-end",
        "IDs de cuenta de vendedor, marketplaces, ASIN/SKU, metadatos de integración Amazon",
        "Datos de inventario/stock (cantidades, estado, logs técnicos)",
        "Pedidos/artículos: solo campos operativos no PII; no almacenamos nombres completos, teléfonos o direcciones completas de compradores",
        "Logs de error pueden contener IDs Amazon (SellerId, MarketplaceId), no PII de compradores",
      ],

      spapi_usage_h: "5 ter. Finalidad SP-API",
      spapi_usage_list: [
        "Sincronización de inventario/stock para nuestras cuentas o cuentas autorizadas",
        "No vendemos ni compartimos datos de Amazon con terceros sin consentimiento",
        "Acceso limitado a los roles declarados (Inventory, Fulfillment, Listings/Orders sin PII)",
      ],

      security_h: "6. Seguridad",
      security_list: [
        "Cifrado en tránsito y, cuando proceda, en reposo",
        "Autenticación de dos factores",
        "Acceso con mínimo privilegio",
        "Supervisión y auditorías periódicas",
        "Copias de seguridad y planes de recuperación",
        "Claves SP-API/Supabase y tokens de Amazon en vault/secret con rotación y acceso restringido",
        "Registro y alertas ante acceso no autorizado; revocación de tokens al desconectar",
      ],

      retention_h: "7. Conservación",
      retention_list: [
        "Datos de cuenta: mientras la cuenta esté activa o mínimo 5 años según ley",
        "Datos de facturación: 10 años",
        "Datos de marketing: hasta retirar el consentimiento o máx. 3 años desde la última interacción",
        "Tokens SP-API: eliminados/invalidado al revocar o cerrar la cuenta; logs técnicos ≤ 90 días",
      ],

      rights_h: "8. Sus derechos",
      rights_list: [
        "Acceso, rectificación, supresión",
        "Portabilidad",
        "Oposición y limitación",
        "Retirada del consentimiento",
        "Reclamación ante la autoridad de control",
      ],

      children_h: "9. Menores",
      children_p: "Nuestros servicios no están dirigidos a menores de 16 años.",

      dpa_h: "10. Encargados del tratamiento",
      dpa_p: "Firmamos DPAs con procesadores conformes al RGPD.",

      cookies_h: "11. Cookies",
      cookies_p:
        "Usamos cookies esenciales, de rendimiento (analítica) y de marketing (con consentimiento). Detalles en el banner de cookies.",

      changes_h: "12. Cambios",
      changes_p:
        "Podemos actualizar esta política. La fecha de actualización aparece en la parte superior de la página.",
    },
  }
};
