// FILE: src/translations/legal/terms.js
const LAST = "27.09.2025";

export const terms = {
  // ============ FR (implicite) ============
  fr: {
    title: "Termes et Conditions (B2B)",
    lastUpdated: `Dernière mise à jour : ${LAST}`,
    sections: {
      // 0
      defs_h: "0. Définitions",
      defs_list: [
        "« La Société », « nous » : Prep Center France.",
        "« Le Client », « vous » : le client professionnel commandant les Services.",
        "« Marchandises » : biens confiés pour réception, manutention, préparation, stockage temporaire ou expédition.",
        "« Services » : réception, vérification, préparation (prep) et étiquetage, emballage, stockage temporaire, coordination des expéditions, y compris FBM/FBA.",
        "« Plateformes » : places de marché/systèmes tels qu’Amazon, eBay, Shopify, etc.",
      ],

      // 1
      scope_h: "1. Champ d’application et acceptation",
      scope_list: [
        "Ces conditions s’appliquent à tous les Services rendus par la Société.",
        "Nous opérons exclusivement en B2B (professionnels).",
        "En cas de conflit entre les présents Termes et des instructions/commandes ponctuelles, les Termes prévalent sauf accord écrit contraire.",
      ],

      // 2
      orders_h: "2. Commandes & Instructions",
      orders_list: [
        "Avant l’arrivée des Marchandises, le Client transmet un PO/ASN et des instructions écrites de préparation/emballage.",
        "En l’absence d’instructions, la réception peut être mise en attente.",
        "Les changements/annulations après check-in peuvent entraîner des frais.",
        "Si les instructions manquent/sont ambiguës/contradictoires, nous pouvons demander des précisions ou appliquer les pratiques FBA/industries standard aux frais du Client.",
      ],

      // 3
      sla_h: "3. Délais d’exécution (SLA)",
      sla_p:
        "Sauf accord écrit, les délais sont fournis en « best effort » (sans garantie ferme). Les pics saisonniers, contrôles de conformité et disponibilités transporteurs peuvent impacter les délais.",

      // 4
      receiving_h: "4. Réception, comptage & non-conformités",
      receiving_list: [
        "Contrôle visuel raisonnable et comptage au niveau colis/carton ; le comptage unitaire détaillé est disponible sur demande (service facturable).",
        "Les non-conformités visibles sont documentées (photos si pertinent) et communiquées.",
        "Réclamations à formuler sous 5 jours ouvrés après notre notification de réception ; passé ce délai, la réception est réputée acceptée.",
      ],

      // 5
      packaging_h: "5. Emballage & standards FBA/FBM",
      packaging_list: [
        "Le Client garantit l’éligibilité et la conformité aux exigences des Plateformes et de la loi (limites carton, codes-barres, avertissements, palettisation, hazmat/batteries).",
        "Les retraitements dus à la nature du produit ou à des instructions incorrectes/incomplètes sont facturés au tarif en vigueur.",
      ],

      // 6
      storage_h: "6. Stockage",
      storage_list: [
        "Le stockage est temporaire. Au-delà de 90 jours après check-in : frais supplémentaires possibles et/ou demande d’enlèvement.",
        "Nous pouvons refuser/ôter des Marchandises présentant des risques de sécurité, de conformité ou un impact disproportionné sur la capacité.",
      ],

      // 7
      abandoned_h: "7. Marchandises abandonnées & droit de rétention (lien)",
      abandoned_list: [
        "En cas d’impayés ou de non-retrait sous 30 jours après notification écrite, nous pouvons exercer un droit de rétention et retenir, vendre ou disposer des Marchandises pour recouvrer les sommes dues et frais associés.",
        "Les coûts de retour/élimination sont à la charge du Client.",
      ],

      // 8
      shipping_h: "8. Expédition & transfert des risques",
      shipping_list: [
        "Le risque est transféré au transporteur lors de la remise de la marchandise correctement préparée et étiquetée.",
        "Sauf accord contraire, expéditions en conditions standard (ex. EXW notre site). Les exigences spéciales doivent être convenues par écrit.",
      ],

      // 9
      insurance_h: "9. Assurance",
      insurance_p:
        "Nous n’assurons pas vos Marchandises. Le Client conserve une couverture adéquate pendant le stockage et le transport.",

      // 10 (reprend l’existant FR « Tarifs et Paiements »)
      pricing_h: "10. Tarifs & Paiements",
      pricing_intro: "Tous les prix sont en EUR, hors TVA.",
      pricing_list: [
        "TVA appliquée selon la loi.",
        "Facturation mensuelle ou à la tâche, selon accord.",
        "Paiements via prestataires agréés.",
        "Le non-paiement peut entraîner la suspension des Services.",
      ],
      pricing_nonrefund:
        "Les Services déjà effectués (réception, préparation, étiquetage, expédition) ne sont pas remboursables. En cas d’erreur confirmée imputable à la Société, correction gratuite ou avoir.",
      pricing_extra:
        "Travaux supplémentaires/imprévus (re-palettisation, manutention spéciale, documents douaniers) facturés au tarif communiqué.",
      pricing_accept:
        "Création de compte/commande/coche « J’accepte » = vous confirmez avoir lu et accepté la liste des prix dans la section « Tarifs ».",
      pricing_notice:
        "Mises à jour tarifaires possibles avec préavis de 30 jours (email et/ou compte). Pendant ce délai : résiliation sans pénalité ; l’usage après la date vaut acceptation.",

      // 11
      warranties_h: "11. Garanties & conformité",
      warranties_list: [
        "Vous garantissez que les Marchandises sont licites, correctement décrites, n’enfreignent pas les droits de tiers et respectent les exigences des Plateformes (éligibilité FBA, batteries/hazmat, etc.).",
        "Vous êtes seul responsable du respect des politiques des Plateformes (p. ex. frais « unplanned services » si des étiquettes/prep manquent chez Amazon).",
      ],

      // 12 (reprend « Limitation de Responsabilité »)
      liability_h: "12. Limitation de responsabilité",
      liability_p:
        "Notre responsabilité est limitée à la valeur des Services fournis.",
      liability_list: [
        "Aucune responsabilité pour taxes/douanes/retards/refus imputables à Amazon ou aux autorités.",
        "Perte/avarie sous notre garde due à vol/incendie/inondation/événements exceptionnels : limite à 30 % de la valeur d’achat déclarée (facture fournisseur), et non au prix de vente.",
        "Assurance complète des produits à la charge du Client.",
        "Acceptation par Amazon à sa seule discrétion ; refus liés à ses politiques non imputables à la Société.",
        "Après remise au transporteur, le risque du transport incombe au transporteur.",
        "Force majeure exonératoire.",
        "Les réclamations doivent être présentées sous 14 jours avec éléments probants.",
      ],

      // 13
      force_h: "13. Force majeure",
      force_p:
        "Aucune responsabilité en cas d’événements hors contrôle raisonnable (catastrophes, grèves, pannes, épidémies, guerre, actes gouvernementaux, indisponibilités de Plateformes, etc.).",

      // 14
      subcontractors_h: "14. Sous-traitants",
      subcontractors_p:
        "Nous pouvons recourir à des sous-traitants validés pour certaines opérations. Nous restons responsables de l’orchestration des Services.",

      // 15
      confidentiality_h: "15. Confidentialité & Propriété intellectuelle",
      confidentiality_p:
        "Les informations non publiques (prix, processus, photos, données de compte) sont confidentielles. Les documents, guides et processus de la Société restent notre propriété intellectuelle.",

      // 16
      data_h: "16. Protection des données",
      data_p:
        "Nous traitons les données de contact et opérationnelles selon le RGPD et notre Politique de Confidentialité. Un DPA peut être signé lorsque nous agissons comme sous-traitant. Voir la Politique de Confidentialité sur le site.",

      // 17
      notices_h: "17. Notifications",
      notices_p:
        "Les notifications peuvent être envoyées par email aux adresses du profil de compte et sont réputées reçues à l’envoi, sauf échec de livraison signalé.",

      // 18
      law_h: "18. Droit applicable & juridiction",
      law_p:
        "Les présents Termes sont régis par le droit français. Les litiges relèvent des juridictions françaises.",

      // 19
      language_h: "19. Langue & prévalence",
      language_p:
        "En cas de divergences entre versions linguistiques, la version française prévaut.",

      // 20
      severability_h: "20. Divisibilité ; Intégralité ; Renonciations",
      severability_p:
        "Si une clause est invalide, le reste demeure en vigueur. Les Termes constituent l’intégralité de l’accord pour les Services. Le non-exercice d’un droit ne vaut pas renonciation.",

      // capete
      contact_h: "Contact",
      contact_intro:
        "Pour toute question concernant ces Termes et Conditions :",
      contact_email: "Email : contact@prep-center.eu",
      contact_phone: "Téléphone : +33 6 75 11 62 18",
      contact_addr: "Adresse : 35350 La Gouesnière, France",

      updates_h: "Mises à jour",
      updates_p:
        "Nous pouvons modifier ces Termes ; la version à jour prend effet 30 jours après publication. L’usage continu vaut acceptation.",
    },
  },

  // ============ EN ============
  en: {
    title: "Terms & Conditions (B2B)",
    lastUpdated: `Last updated: ${LAST}`,
    sections: {
      defs_h: "0. Definitions",
      defs_list: [
        "“Company”, “we”: Prep Center France.",
        "“Client”, “you”: the business customer ordering the Services.",
        "“Goods”: items sent to us for receiving, handling, prep, temporary storage or shipping.",
        "“Services”: receiving, inspection, prep & labeling, packing, temporary storage, shipping coordination, including FBM/FBA.",
        "“Platforms”: marketplaces/systems such as Amazon, eBay, Shopify, etc.",
      ],
      scope_h: "1. Scope & Acceptance",
      scope_list: [
        "These Terms apply to all Services performed by the Company.",
        "We operate strictly B2B (professionals).",
        "If these Terms conflict with ad-hoc orders/instructions, these Terms prevail unless agreed otherwise in writing.",
      ],
      orders_h: "2. Ordering & Instructions",
      orders_list: [
        "Before arrival, the Client provides a PO/ASN and written prep/packing instructions.",
        "Without instructions, inbound may be placed on hold.",
        "Changes/cancellations after check-in may incur handling fees.",
        "If instructions are missing/unclear/conflicting, we may request clarification or apply standard FBA/industry practices at the Client’s expense.",
      ],
      sla_h: "3. Turnaround (SLA)",
      sla_p:
        "Unless agreed otherwise in writing, timelines are best-effort (no firm guarantee). Peak seasons, compliance checks and carrier availability may affect turnaround.",
      receiving_h: "4. Receiving, Count & Non-Conformities",
      receiving_list: [
        "Reasonable visual inspection and carton-level count; unit-level counts on request (billable).",
        "Visible discrepancies documented (photos when relevant) and communicated.",
        "Claims must be raised within 5 business days of our receipt notice; otherwise inbound is deemed accepted.",
      ],
      packaging_h: "5. Packaging & FBA/FBM Standards",
      packaging_list: [
        "Client is responsible for eligibility and compliance with Platform/legal requirements (carton limits, barcodes, warnings, palletization, hazmat/batteries).",
        "Rework due to product nature or incorrect/incomplete instructions is billable.",
      ],
      storage_h: "6. Storage",
      storage_list: [
        "Storage is temporary. After 90 days from check-in: extra storage fees and/or removal request may apply.",
        "We may refuse/remove Goods causing safety/compliance risks or disproportionate capacity impact.",
      ],
      abandoned_h: "7. Abandoned Goods & Lien",
      abandoned_list: [
        "If invoices remain unpaid or Goods are not collected within 30 days of written notice, we may exercise a warehouse lien and withhold, sell or dispose of Goods to recover amounts due and costs.",
        "Return/disposal costs are borne by the Client.",
      ],
      shipping_h: "8. Shipping & Risk Transfer",
      shipping_list: [
        "Risk passes to the carrier when we hand over properly prepared and labeled shipments.",
        "Unless agreed otherwise, shipments follow standard terms (e.g., EXW our facility). Special requirements must be agreed in writing.",
      ],
      insurance_h: "9. Insurance",
      insurance_p:
        "We do not insure Goods. Client maintains adequate cover during storage and transit.",
      pricing_h: "10. Pricing & Payments",
      pricing_intro: "All prices in EUR, excl. VAT.",
      pricing_list: [
        "VAT applies as required by law.",
        "Monthly or per-task billing as agreed.",
        "Payments via approved processors.",
        "Non-payment may result in suspension of Services.",
      ],
      pricing_nonrefund:
        "Services already performed (receiving, prep, labeling, shipping) are non-refundable. If a confirmed Company error occurs, we will correct it free of charge or issue a credit.",
      pricing_extra:
        "Additional/unforeseen work (re-palletization, special handling, customs paperwork) is charged at the communicated rates.",
      pricing_accept:
        "By creating an account/placing an order/ticking “I accept”, you confirm you have read and accepted the price list in the “Pricing” section.",
      pricing_notice:
        "We may update prices with 30 days’ prior notice (email and/or in your account). You may terminate during this period; continued use after the effective date constitutes acceptance.",
      warranties_h: "11. Warranties & Compliance",
      warranties_list: [
        "You warrant Goods are lawful, properly described, non-infringing and compliant with Platform requirements (FBA eligibility, batteries/hazmat where applicable).",
        "You remain solely responsible for Platform policies (including any unplanned services fees at Amazon).",
      ],
      liability_h: "12. Liability Limitation",
      liability_p: "Our liability is limited to the value of Services provided.",
      liability_list: [
        "No liability for taxes/customs/delays/refusals attributable to Amazon or authorities.",
        "For loss/damage in our custody due to theft/fire/flood/exceptional events, liability is limited to 30% of declared purchase value (supplier invoice), not retail price.",
        "Full product insurance remains the Client’s responsibility.",
        "Amazon acceptance at its sole discretion; policy-related refusals are not attributable to us.",
        "After hand-over to the carrier, transport risk lies with the carrier.",
        "Force majeure applies.",
        "Claims must be submitted within 14 days with reasonable evidence.",
      ],
      force_h: "13. Force Majeure",
      force_p:
        "No liability for events beyond reasonable control (natural disasters, strikes, outages, epidemics, war, governmental acts, Platform downtime, etc.).",
      subcontractors_h: "14. Subcontractors",
      subcontractors_p:
        "We may use vetted subcontractors for parts of the Services. We remain responsible for orchestration.",
      confidentiality_h: "15. Confidentiality & IP",
      confidentiality_p:
        "Non-public information (prices, processes, photos, account data) is confidential. Company materials, guides and processes remain our IP.",
      data_h: "16. Data Protection",
      data_p:
        "We process business contact and operational data under GDPR and our Privacy Policy. A DPA can be signed where we act as processor. See the website Privacy Policy.",
      notices_h: "17. Notices",
      notices_p:
        "Notices may be sent by email to the addresses in your account profile and are deemed received upon sending, unless a delivery failure is reported.",
      law_h: "18. Governing Law & Jurisdiction",
      law_p:
        "These Terms are governed by French law. French courts have jurisdiction.",
      language_h: "19. Language & Precedence",
      language_p:
        "If multiple language versions exist, the French version prevails in case of conflict.",
      severability_h: "20. Severability; Entire Agreement; Waivers",
      severability_p:
        "If any provision is invalid, the remainder remains effective. These Terms are the entire agreement for the Services. Failure to enforce is not a waiver.",
      contact_h: "Contact",
      contact_intro: "Questions about these Terms & Conditions:",
      contact_email: "Email: contact@prep-center.eu",
      contact_phone: "Phone: +33 6 75 11 62 18",
      contact_addr: "Address: 35350 La Gouesnière, France",
      updates_h: "Updates",
      updates_p:
        "We may amend these Terms; the updated version takes effect 30 days after publication. Continued use constitutes acceptance.",
    },
  },

  // ============ RO ============
  ro: {
    title: "Termeni și Condiții (B2B)",
    lastUpdated: `Ultima actualizare: ${LAST}`,
    sections: {
      defs_h: "0. Definiții",
      defs_list: [
        "„Compania”, „noi”: Prep Center France.",
        "„Clientul”, „dumneavoastră”: clientul persoană juridică ce comandă Serviciile.",
        "„Mărfuri”: bunurile trimise pentru recepție, manipulare, pregătire, depozitare temporară sau expediere.",
        "„Servicii”: recepție, verificare, pregătire (prep) și etichetare, ambalare, depozitare temporară, coordonare expediții, inclusiv FBM/FBA.",
        "„Platforme”: marketplace-uri și sisteme precum Amazon, eBay, Shopify etc.",
      ],
      scope_h: "1. Domeniu de aplicare și acceptare",
      scope_list: [
        "Acești Termeni se aplică tuturor Serviciilor prestate de Companie.",
        "Prestăm exclusiv servicii B2B (profesioniști).",
        "În caz de conflict între Termeni și instrucțiuni/comenzi punctuale, prevalează Termenii, cu excepția unui acord scris contrar.",
      ],
      orders_h: "2. Comenzi & Instrucțiuni",
      orders_list: [
        "Înainte de sosire, Clientul transmite PO/ASN și instrucțiuni scrise de pregătire/ambalare.",
        "În lipsa instrucțiunilor, recepția poate fi pusă în așteptare.",
        "Modificările/anulările după check-in pot genera costuri de manipulare.",
        "Dacă instrucțiunile lipsesc/sunt neclare/contradictorii, solicităm clarificări sau aplicăm practicile standard FBA/industriale, pe cheltuiala Clientului.",
      ],
      sla_h: "3. Timp de execuție (SLA)",
      sla_p:
        "Dacă nu s-a convenit altfel în scris, termenele sunt „best effort” (fără garanție fermă). Sezonalitatea, verificările de conformitate și disponibilitatea transportatorilor pot afecta timpii.",
      receiving_h: "4. Recepție, numărătoare & neconformități",
      receiving_list: [
        "Verificare vizuală rezonabilă și numărătoare la nivel de colet/carton; numărătoarea unitară se face la cerere (serviciu taxabil).",
        "Neconformitățile vizibile sunt documentate (foto, dacă e cazul) și comunicate.",
        "Reclamațiile se transmit în max. 5 zile lucrătoare de la notificarea noastră de recepție; altfel recepția se consideră acceptată.",
      ],
      packaging_h: "5. Ambalare & standarde FBA/FBM",
      packaging_list: [
        "Clientul răspunde de eligibilitate și conformitate cu cerințele Platformelor și ale legii (limite carton, coduri de bare, avertizări, paletizare, hazmat/baterii).",
        "Reprocesările cauzate de natura produsului sau instrucțiuni greșite/incomplete sunt facturate.",
      ],
      storage_h: "6. Depozitare",
      storage_list: [
        "Depozitarea este temporară. După 90 de zile de la check-in pot apărea costuri suplimentare și/sau solicitare de ridicare.",
        "Putem refuza/îndepărta Mărfuri ce creează riscuri de siguranță/conformitate sau impact disproporționat asupra capacității.",
      ],
      abandoned_h: "7. Mărfuri abandonate & drept de retenție (lien)",
      abandoned_list: [
        "Dacă facturile rămân neachitate sau Mărfurile nu sunt ridicate în 30 de zile de la notificarea scrisă, putem exercita un drept de retenție și reține, vinde sau dispune de Mărfuri pentru a recupera sumele datorate și costurile.",
        "Costurile de returnare/eliminare sunt în sarcina Clientului.",
      ],
      shipping_h: "8. Expediere & transferul riscului",
      shipping_list: [
        "Riscul se transferă transportatorului la predarea coletelor corect pregătite și etichetate.",
        "Dacă nu s-a convenit altfel, expedițiile se organizează în condiții standard (ex. EXW la sediul nostru); cerințele speciale se stabilesc în scris.",
      ],
      insurance_h: "9. Asigurare",
      insurance_p:
        "Nu asigurăm Mărfurile. Clientul păstrează asigurarea adecvată pe durata stocării și transportului.",
      pricing_h: "10. Prețuri & Plăți",
      pricing_intro: "Toate prețurile sunt în EUR, fără TVA.",
      pricing_list: [
        "TVA se aplică conform legii.",
        "Facturare lunară sau per sarcină, conform acordului.",
        "Plăți prin procesatori autorizați.",
        "Neplata poate duce la suspendarea Serviciilor.",
      ],
      pricing_nonrefund:
        "Serviciile deja efectuate (recepție, pregătire, etichetare, expediere) nu se rambursează. Dacă apare o eroare confirmată imputabilă Companiei, corectăm gratuit sau emitem un credit.",
      pricing_extra:
        "Lucrări suplimentare/neprevăzute (re-paletizare, manipulare specială, documente vamale) se facturează conform tarifelor comunicate.",
      pricing_accept:
        "Prin crearea contului/comandă/bifă „Accept”, confirmați că ați citit și acceptat lista de prețuri din secțiunea „Tarife”.",
      pricing_notice:
        "Putem actualiza prețurile cu preaviz de 30 de zile (email și/sau în cont). În această perioadă puteți rezilia; utilizarea după data efectivă înseamnă acceptare.",
      warranties_h: "11. Garanții & conformitate",
      warranties_list: [
        "Declarați că Mărfurile sunt legale, corect descrise, nu încalcă drepturi ale terților și respectă cerințele Platformelor (eligibilitate FBA, baterii/hazmat unde e cazul).",
        "Sunteți singurul responsabil pentru politicile Platformelor (inclusiv taxe de „unplanned services” la Amazon).",
      ],
      liability_h: "12. Limitarea răspunderii",
      liability_p: "Răspunderea noastră este limitată la valoarea Serviciilor.",
      liability_list: [
        "Nu răspundem pentru taxe/vamă/întârzieri/refuzuri ale Amazon sau autorităților.",
        "Pentru pierderi/daune în custodia noastră din furt/incendiu/inundații/evenimente excepționale, răspunderea se limitează la 30% din valoarea de achiziție declarată (factură furnizor), nu la prețul de vânzare.",
        "Asigurarea completă a produselor revine Clientului.",
        "Acceptarea de către Amazon este la discreția sa.",
        "După predarea la transportator, riscul transportului îi aparține acestuia.",
        "Se aplică forța majoră.",
        "Pretențiile se transmit în 14 zile, cu dovezi rezonabile.",
      ],
      force_h: "13. Forță majoră",
      force_p:
        "Nu răspundem pentru evenimente în afara controlului rezonabil (calamități, greve, întreruperi, epidemii, război, acte guvernamentale, indisponibilități ale Platformelor etc.).",
      subcontractors_h: "14. Subcontractori",
      subcontractors_p:
        "Putem utiliza subcontractori validați pentru părți din Servicii; rămânem responsabili de orchestrare.",
      confidentiality_h: "15. Confidențialitate & Proprietate intelectuală",
      confidentiality_p:
        "Informațiile nepublice (prețuri, procese, fotografii, date de cont) sunt confidențiale. Materialele și procesele Companiei rămân proprietatea noastră.",
      data_h: "16. Protecția datelor",
      data_p:
        "Prelucrăm date de contact și operaționale conform RGPD și Politicii de Confidențialitate. Putem semna un DPA când acționăm ca persoană împuternicită. Consultați Politica pe site.",
      notices_h: "17. Notificări",
      notices_p:
        "Notificările se pot transmite prin email la adresele din profilul contului și se consideră primite la expediere, cu excepția raportării unui eșec de livrare.",
      law_h: "18. Legea aplicabilă & jurisdicție",
      law_p:
        "Termenii sunt guvernați de legea franceză. Instanțele din Franța sunt competente.",
      language_h: "19. Limbă & prevalență",
      language_p:
        "Dacă există versiuni în mai multe limbi, versiunea în limba franceză prevalează.",
      severability_h: "20. Divizibilitate; Întreaga înțelegere; Renunțări",
      severability_p:
        "Dacă o clauză este invalidă, restul rămâne în vigoare. Acești Termeni reprezintă întreaga înțelegere. Neaplicarea unui drept nu înseamnă renunțare.",
      contact_h: "Contact",
      contact_intro: "Întrebări despre Termeni și Condiții:",
      contact_email: "Email: contact@prep-center.eu",
      contact_phone: "Telefon: +33 6 75 11 62 18",
      contact_addr: "Adresă: 35350 La Gouesnière, Franța",
      updates_h: "Modificări",
      updates_p:
        "Putem modifica acești Termeni; versiunea actualizată intră în vigoare la 30 de zile de la publicare. Utilizarea continuă înseamnă acceptare.",
    },
  },
// ============ DE ============
de: {
  title: "Allgemeine Geschäftsbedingungen (B2B)",
  lastUpdated: `Zuletzt aktualisiert: ${LAST}`,
  sections: {
    defs_h: "0. Definitionen",
    defs_list: [
      "„Unternehmen“, „wir“: Prep Center France.",
      "„Kunde“, „Sie“: der gewerbliche Kunde, der die Leistungen bestellt.",
      "„Waren“: an uns gesendete Güter zur Annahme, Handhabung, Vorbereitung, temporären Lagerung oder zum Versand.",
      "„Leistungen“: Annahme, Prüfung, Vorbereitung & Etikettierung, Verpackung, temporäre Lagerung, Versandkoordination, einschließlich FBM/FBA.",
      "„Plattformen“: Marktplätze/Systeme wie Amazon, eBay, Shopify usw.",
    ],

    scope_h: "1. Geltungsbereich & Annahme",
    scope_list: [
      "Diese AGB gelten für alle vom Unternehmen erbrachten Leistungen.",
      "Wir arbeiten ausschließlich B2B (gewerbliche Kunden).",
      "Bei Widersprüchen zwischen diesen AGB und ad-hoc Anweisungen/Bestellungen gelten diese AGB, sofern nichts anderes schriftlich vereinbart ist.",
    ],

    orders_h: "2. Bestellungen & Anweisungen",
    orders_list: [
      "Vor Anlieferung stellt der Kunde eine PO/ASN sowie schriftliche Prep-/Verpackungsanweisungen bereit.",
      "Ohne Anweisungen kann der Wareneingang zurückgestellt werden.",
      "Änderungen/Stornierungen nach Check-in können Bearbeitungsgebühren auslösen.",
      "Fehlende/unklare/widersprüchliche Anweisungen: Wir können Klarstellungen anfordern oder Standard-FBA/Industriepraxis auf Kosten des Kunden anwenden.",
    ],

    sla_h: "3. Durchlaufzeit (SLA)",
    sla_p:
      "Sofern nicht schriftlich anders vereinbart, gelten Fristen als Best-Effort (ohne feste Garantie). Saisonalität, Compliance-Prüfungen und Carrier-Verfügbarkeit können die Zeiten beeinflussen.",

    receiving_h: "4. Wareneingang, Zählung & Abweichungen",
    receiving_list: [
      "Angemessene Sichtprüfung und Karton-/Kolli-Zählung; Stück-Einzelzählung auf Anfrage (kostenpflichtig).",
      "Sichtbare Abweichungen werden dokumentiert (ggf. Fotos) und mitgeteilt.",
      "Ansprüche sind innerhalb von 5 Arbeitstagen nach unserer Wareneingangsmeldung zu erheben; andernfalls gilt der Eingang als akzeptiert.",
    ],

    packaging_h: "5. Verpackung & FBA/FBM-Standards",
    packaging_list: [
      "Der Kunde ist verantwortlich für Eignung und Compliance mit Plattform-/Gesetzesanforderungen (Kartonlimits, Barcodes, Warnhinweise, Palettierung, Gefahrgut/Batterien).",
      "Nacharbeiten aufgrund der Produktbeschaffenheit oder falscher/unvollständiger Anweisungen sind kostenpflichtig.",
    ],

    storage_h: "6. Lagerung",
    storage_list: [
      "Lagerung ist temporär. Nach 90 Tagen ab Check-in: zusätzliche Lagergebühren und/oder Aufforderung zur Abholung möglich.",
      "Wir können Waren ablehnen/entfernen, die Sicherheits-/Compliance-Risiken verursachen oder die Kapazität unverhältnismäßig belasten.",
    ],

    abandoned_h: "7. Verlassene Waren & Pfandrecht",
    abandoned_list: [
      "Bei offenen Rechnungen oder Nichtabholung innerhalb von 30 Tagen nach schriftlicher Mitteilung können wir ein Lagerpfandrecht geltend machen und Waren zurückhalten, veräußern oder entsorgen, um Forderungen und Kosten zu decken.",
      "Kosten für Rücksendung/Entsorgung trägt der Kunde.",
    ],

    shipping_h: "8. Versand & Gefahrenübergang",
    shipping_list: [
      "Die Gefahr geht auf den Frachtführer über, sobald korrekt vorbereitete und etikettierte Sendungen übergeben werden.",
      "Mangels abweichender Vereinbarung erfolgen Sendungen zu Standardbedingungen (z. B. EXW unser Standort). Besondere Anforderungen sind schriftlich zu vereinbaren.",
    ],

    insurance_h: "9. Versicherung",
    insurance_p:
      "Wir versichern die Waren nicht. Der Kunde hält geeigneten Versicherungsschutz während Lagerung und Transport vor.",

    pricing_h: "10. Preise & Zahlungen",
    pricing_intro: "Alle Preise in EUR, zzgl. USt.",
    pricing_list: [
      "Umsatzsteuer gemäß Gesetz.",
      "Monatliche oder auftragsbezogene Abrechnung gemäß Vereinbarung.",
      "Zahlungen über zugelassene Zahlungsdienstleister.",
      "Nichtzahlung kann zur Aussetzung der Leistungen führen.",
    ],
    pricing_nonrefund:
      "Bereits erbrachte Leistungen (Wareneingang, Prep, Etikettierung, Versand) sind nicht erstattungsfähig. Bei bestätigtem Unternehmensfehler: kostenlose Korrektur oder Gutschrift.",
    pricing_extra:
      "Zusätzliche/unvorhergesehene Arbeiten (Re-Palettierung, Spezialhandling, Zolldokumente) werden zum kommunizierten Tarif berechnet.",
    pricing_accept:
      "Mit Kontoerstellung/Bestellung/Anklicken von „Ich akzeptiere“ bestätigen Sie die Preisliste im Abschnitt „Tarife“ gelesen und akzeptiert zu haben.",
    pricing_notice:
      "Preisänderungen möglich mit 30 Tagen Vorankündigung (E-Mail und/oder im Konto). Kündigung in diesem Zeitraum möglich; Weiternutzung gilt als Zustimmung.",

    warranties_h: "11. Gewährleistungen & Compliance",
    warranties_list: [
      "Sie gewährleisten, dass Waren rechtmäßig, korrekt beschrieben, nicht rechtsverletzend und plattformkonform sind (FBA-Eignung, Batterien/Gefahrgut, falls zutreffend).",
      "Sie sind allein verantwortlich für Plattformrichtlinien (einschl. etwaiger „Unplanned Services“-Gebühren bei Amazon).",
    ],

    liability_h: "12. Haftungsbeschränkung",
    liability_p: "Unsere Haftung ist auf den Wert der erbrachten Leistungen begrenzt.",
    liability_list: [
      "Keine Haftung für Steuern/Zoll/Verzögerungen/Ablehnungen, die Amazon oder Behörden zuzurechnen sind.",
      "Bei Verlust/Beschädigung in unserer Obhut durch Diebstahl/Brand/Überschwemmung/außergewöhnliche Ereignisse ist die Haftung auf 30 % des deklarierten Einkaufspreises (Lieferantenrechnung) begrenzt, nicht auf den Verkaufspreis.",
      "Vollständige Produktversicherung obliegt dem Kunden.",
      "Amazon-Annahme nach eigenem Ermessen; politikbedingte Ablehnungen sind uns nicht zurechenbar.",
      "Nach Übergabe an den Frachtführer liegt das Transportrisiko beim Frachtführer.",
      "Höhere Gewalt gilt.",
      "Ansprüche sind binnen 14 Tagen mit angemessenen Nachweisen einzureichen.",
    ],

    force_h: "13. Höhere Gewalt",
    force_p:
      "Keine Haftung für Ereignisse außerhalb zumutbarer Kontrolle (Naturkatastrophen, Streiks, Ausfälle, Epidemien, Krieg, behördliche Maßnahmen, Plattform-Ausfälle etc.).",

    subcontractors_h: "14. Subunternehmer",
    subcontractors_p:
      "Wir können geprüfte Subunternehmer für Teile der Leistungen einsetzen; die Orchestrierung bleibt in unserer Verantwortung.",

    confidentiality_h: "15. Vertraulichkeit & IP",
    confidentiality_p:
      "Nicht-öffentliche Informationen (Preise, Prozesse, Fotos, Kontodaten) sind vertraulich. Unterlagen/Guides/Prozesse des Unternehmens bleiben unser geistiges Eigentum.",

    data_h: "16. Datenschutz",
    data_p:
      "Wir verarbeiten geschäftliche Kontakt- und operative Daten gemäß DSGVO und unserer Datenschutzrichtlinie. Ein AVV kann geschlossen werden, wenn wir als Auftragsverarbeiter handeln. Siehe Website.",

    notices_h: "17. Mitteilungen",
    notices_p:
      "Mitteilungen können per E-Mail an die im Konto hinterlegten Adressen erfolgen und gelten bei Versand als zugegangen, sofern keine Zustellfehlermeldung erfolgt.",

    law_h: "18. Anwendbares Recht & Gerichtsstand",
    law_p:
      "Diese AGB unterliegen französischem Recht. Zuständig sind die französischen Gerichte.",

    language_h: "19. Sprache & Vorrang",
    language_p:
      "Bei Abweichungen zwischen Sprachfassungen hat die französische Version Vorrang.",

    severability_h: "20. Salvatorische Klausel; Gesamte Vereinbarung; Verzicht",
    severability_p:
      "Ist eine Bestimmung unwirksam, bleibt der Rest wirksam. Diese AGB bilden die gesamte Vereinbarung. Die Nichtdurchsetzung eines Rechts gilt nicht als Verzicht.",

    contact_h: "Kontakt",
    contact_intro: "Fragen zu diesen AGB:",
    contact_email: "E-Mail: contact@prep-center.eu",
    contact_phone: "Telefon: +33 6 75 11 62 18",
    contact_addr: "Adresse: 35350 La Gouesnière, Frankreich",

    updates_h: "Änderungen",
    updates_p:
      "Wir können diese AGB ändern; die aktualisierte Fassung tritt 30 Tage nach Veröffentlichung in Kraft. Fortgesetzte Nutzung gilt als Zustimmung.",
  },
},

// ============ IT ============
it: {
  title: "Termini e Condizioni (B2B)",
  lastUpdated: `Ultimo aggiornamento: ${LAST}`,
  sections: {
    defs_h: "0. Definizioni",
    defs_list: [
      "“Società”, “noi”: Prep Center France.",
      "“Cliente”, “voi”: il cliente professionale che ordina i Servizi.",
      "“Merci”: beni inviati per ricezione, gestione, preparazione, deposito temporaneo o spedizione.",
      "“Servizi”: ricezione, ispezione, preparazione ed etichettatura, imballaggio, deposito temporaneo, coordinamento spedizioni, inclusi FBM/FBA.",
      "“Piattaforme”: marketplace/sistemi quali Amazon, eBay, Shopify, ecc.",
    ],

    scope_h: "1. Ambito di applicazione e accettazione",
    scope_list: [
      "I presenti Termini si applicano a tutti i Servizi resi dalla Società.",
      "Operiamo esclusivamente in ambito B2B (professionisti).",
      "In caso di conflitto tra questi Termini e istruzioni/ordini ad-hoc, prevalgono i Termini salvo diverso accordo scritto.",
    ],

    orders_h: "2. Ordini e Istruzioni",
    orders_list: [
      "Prima dell’arrivo, il Cliente fornisce PO/ASN e istruzioni scritte di preparazione/imballaggio.",
      "In assenza di istruzioni, l’inbound può essere messo in attesa.",
      "Modifiche/annulli dopo il check-in possono comportare costi di handling.",
      "Se le istruzioni mancano/sono poco chiare/in conflitto, possiamo chiedere chiarimenti o applicare pratiche standard FBA/industria a spese del Cliente.",
    ],

    sla_h: "3. Tempi di lavorazione (SLA)",
    sla_p:
      "Salvo diverso accordo scritto, le tempistiche sono Best-Effort (senza garanzia). Picchi stagionali, verifiche di conformità e disponibilità dei vettori possono incidere sui tempi.",

    receiving_h: "4. Ricezione, conteggio e non conformità",
    receiving_list: [
      "Ispezione visiva ragionevole e conteggio a livello collo/cartone; conteggio unitario su richiesta (a pagamento).",
      "Le non conformità visibili vengono documentate (foto, se del caso) e comunicate.",
      "Eventuali reclami devono essere presentati entro 5 giorni lavorativi dalla nostra notifica di ricezione; in difetto, la ricezione si intende accettata.",
    ],

    packaging_h: "5. Imballaggio & standard FBA/FBM",
    packaging_list: [
      "Il Cliente garantisce idoneità e conformità ai requisiti di Piattaforme/legge (limiti cartone, barcode, avvertenze, palletizzazione, hazmat/batterie).",
      "Reworking dovuto a natura del prodotto o a istruzioni errate/incomplete è a pagamento.",
    ],

    storage_h: "6. Deposito",
    storage_list: [
      "Il deposito è temporaneo. Dopo 90 giorni dal check-in possono applicarsi costi aggiuntivi e/o richiesta di ritiro.",
      "Possiamo rifiutare/rimuovere Merci che comportano rischi di sicurezza/conformità o un impatto sproporzionato sulla capacità.",
    ],

    abandoned_h: "7. Merci abbandonate & diritto di ritenzione",
    abandoned_list: [
      "Se le fatture restano insolute o le Merci non vengono ritirate entro 30 giorni dalla comunicazione scritta, possiamo esercitare un diritto di ritenzione e trattenere, vendere o smaltire le Merci per recuperare importi dovuti e costi.",
      "I costi di reso/smaltimento sono a carico del Cliente.",
    ],

    shipping_h: "8. Spedizione & trasferimento del rischio",
    shipping_list: [
      "Il rischio passa al vettore alla consegna delle spedizioni correttamente preparate ed etichettate.",
      "Salvo diverso accordo, le spedizioni seguono termini standard (es. EXW nostro stabilimento). Requisiti speciali devono essere concordati per iscritto.",
    ],

    insurance_h: "9. Assicurazione",
    insurance_p:
      "Non assicuriamo le Merci. Il Cliente mantiene una copertura adeguata durante deposito e trasporto.",

    pricing_h: "10. Prezzi & Pagamenti",
    pricing_intro: "Tutti i prezzi in EUR, IVA esclusa.",
    pricing_list: [
      "IVA applicata secondo legge.",
      "Fatturazione mensile o per attività, come concordato.",
      "Pagamenti tramite processori approvati.",
      "Il mancato pagamento può comportare la sospensione dei Servizi.",
    ],
    pricing_nonrefund:
      "I servizi già eseguiti (ricezione, prep, etichettatura, spedizione) non sono rimborsabili. In caso di errore confermato imputabile alla Società: correzione gratuita o nota di credito.",
    pricing_extra:
      "Lavori aggiuntivi/imprevisti (ri-pallettizzazione, handling speciale, documenti doganali) sono addebitati alle tariffe comunicate.",
    pricing_accept:
      "Creando l’account/effettuando l’ordine/spuntando “Accetto”, confermate di aver letto e accettato il listino prezzi nella sezione “Tariffe”.",
    pricing_notice:
      "Possiamo aggiornare i prezzi con un preavviso di 30 giorni (email e/o nel vostro account). È possibile recedere in tale periodo; l’uso successivo alla data vale accettazione.",

    warranties_h: "11. Garanzie & conformità",
    warranties_list: [
      "Dichiarate che le Merci sono lecite, correttamente descritte, non ledono diritti di terzi e rispettano i requisiti delle Piattaforme (idoneità FBA, batterie/hazmat se applicabile).",
      "Siete gli unici responsabili delle policy delle Piattaforme (incluse eventuali fee di „unplanned services“ presso Amazon).",
    ],

    liability_h: "12. Limitazione di responsabilità",
    liability_p: "La nostra responsabilità è limitata al valore dei Servizi forniti.",
    liability_list: [
      "Nessuna responsabilità per tasse/doganali/ritardi/rifiuti imputabili ad Amazon o alle autorità.",
      "Per perdita/danno in nostra custodia dovuti a furto/incendio/alluvione/eventi eccezionali, la responsabilità è limitata al 30% del valore d’acquisto dichiarato (fattura fornitore), non al prezzo al dettaglio.",
      "L’assicurazione completa dei prodotti resta a carico del Cliente.",
      "Accettazione Amazon a sua esclusiva discrezione; rifiuti legati alle policy non sono a noi imputabili.",
      "Dopo la consegna al vettore, il rischio del trasporto grava sul vettore.",
      "Si applica la forza maggiore.",
      "Le richieste vanno presentate entro 14 giorni con prove adeguate.",
    ],

    force_h: "13. Forza maggiore",
    force_p:
      "Nessuna responsabilità per eventi fuori dal controllo ragionevole (calamità, scioperi, interruzioni, epidemie, guerra, atti governativi, downtime delle Piattaforme, ecc.).",

    subcontractors_h: "14. Subappaltatori",
    subcontractors_p:
      "Possiamo impiegare subappaltatori qualificati per parti dei Servizi; restiamo responsabili del coordinamento.",

    confidentiality_h: "15. Riservatezza & IP",
    confidentiality_p:
      "Informazioni non pubbliche (prezzi, processi, foto, dati account) sono riservate. Materiali/guide/processi della Società restano nostra proprietà intellettuale.",

    data_h: "16. Protezione dei dati",
    data_p:
      "Trattiamo dati di contatto e operativi nel rispetto del GDPR e della nostra Privacy Policy. È possibile sottoscrivere un DPA quando agiamo come responsabile del trattamento. Vedi il sito.",

    notices_h: "17. Comunicazioni",
    notices_p:
      "Le comunicazioni possono essere inviate via email agli indirizzi presenti nel profilo account e si considerano ricevute all’invio, salvo notifica di mancata consegna.",

    law_h: "18. Legge applicabile & foro competente",
    law_p:
      "I presenti Termini sono regolati dalla legge francese. Foro competente: tribunali francesi.",

    language_h: "19. Lingua & prevalenza",
    language_p:
      "In caso di divergenze tra versioni linguistiche, prevale la versione francese.",

    severability_h: "20. Clausola di salvaguardia; Intero accordo; Rinunce",
    severability_p:
      "Se una clausola è invalida, il resto resta valido. I Termini costituiscono l’intero accordo. La mancata applicazione non costituisce rinuncia.",

    contact_h: "Contatti",
    contact_intro: "Domande su questi Termini e Condizioni:",
    contact_email: "Email: contact@prep-center.eu",
    contact_phone: "Telefono: +33 6 75 11 62 18",
    contact_addr: "Indirizzo: 35350 La Gouesnière, Francia",

    updates_h: "Aggiornamenti",
    updates_p:
      "Possiamo modificare questi Termini; la versione aggiornata entra in vigore 30 giorni dopo la pubblicazione. L’uso continuato implica accettazione.",
  },
},

// ============ ES ============
es: {
  title: "Términos y Condiciones (B2B)",
  lastUpdated: `Última actualización: ${LAST}`,
  sections: {
    defs_h: "0. Definiciones",
    defs_list: [
      "“Empresa”, “nosotros”: Prep Center France.",
      "“Cliente”, “usted”: cliente empresarial que contrata los Servicios.",
      "“Mercancías”: bienes enviados para recepción, manipulación, preparación, almacenamiento temporal o envío.",
      "“Servicios”: recepción, inspección, preparación y etiquetado, embalaje, almacenamiento temporal, coordinación de envíos, incluidos FBM/FBA.",
      "“Plataformas”: marketplaces/sistemas como Amazon, eBay, Shopify, etc.",
    ],

    scope_h: "1. Ámbito y aceptación",
    scope_list: [
      "Estos Términos se aplican a todos los Servicios prestados por la Empresa.",
      "Operamos estrictamente en B2B (profesionales).",
      "En caso de conflicto entre estos Términos y instrucciones/pedidos puntuales, prevalecen estos Términos salvo acuerdo escrito en contrario.",
    ],

    orders_h: "2. Pedidos e Instrucciones",
    orders_list: [
      "Antes de la llegada, el Cliente proporciona PO/ASN e instrucciones escritas de preparación/embalaje.",
      "Sin instrucciones, la recepción puede ponerse en espera.",
      "Cambios/cancelaciones tras el check-in pueden conllevar cargos de manipulación.",
      "Si faltan/son ambiguas/contradictorias, podremos solicitar aclaraciones o aplicar prácticas estándar FBA/industria a cargo del Cliente.",
    ],

    sla_h: "3. Plazos de ejecución (SLA)",
    sla_p:
      "Salvo pacto escrito en contrario, los plazos son de mejor esfuerzo (sin garantía firme). La estacionalidad, controles de cumplimiento y disponibilidad de transportistas pueden afectar los tiempos.",

    receiving_h: "4. Recepción, conteo y no conformidades",
    receiving_list: [
      "Inspección visual razonable y conteo a nivel de bulto/caja; conteo unitario bajo solicitud (con cargo).",
      "No conformidades visibles se documentan (fotos si procede) y se comunican.",
      "Reclamaciones dentro de 5 días laborables desde nuestro aviso de recepción; en su defecto, la recepción se considera aceptada.",
    ],

    packaging_h: "5. Embalaje y estándares FBA/FBM",
    packaging_list: [
      "El Cliente es responsable de la idoneidad y del cumplimiento con requisitos de Plataforma/ley (límites de caja, códigos, advertencias, paletización, hazmat/baterías).",
      "Retrabajos por naturaleza del producto o por instrucciones incorrectas/incompletas son facturables.",
    ],

    storage_h: "6. Almacenamiento",
    storage_list: [
      "El almacenamiento es temporal. Tras 90 días desde el check-in: pueden aplicarse cargos adicionales y/o requerirse retirada.",
      "Podemos rechazar/retirar Mercancías que generen riesgos de seguridad/cumplimiento o impacto desproporcionado en capacidad.",
    ],

    abandoned_h: "7. Mercancías abandonadas y derecho de retención",
    abandoned_list: [
      "Si hay facturas impagadas o no se retiran las Mercancías en 30 días desde la notificación escrita, podremos ejercer derecho de retención y retener, vender o disponer de las Mercancías para recuperar importes y costes.",
      "Los costes de devolución/eliminación corren a cargo del Cliente.",
    ],

    shipping_h: "8. Envío y transferencia del riesgo",
    shipping_list: [
      "El riesgo se transfiere al transportista cuando entregamos envíos correctamente preparados y etiquetados.",
      "Salvo acuerdo en contrario, los envíos siguen condiciones estándar (p. ej., EXW nuestra instalación). Requisitos especiales deben pactarse por escrito.",
    ],

    insurance_h: "9. Seguro",
    insurance_p:
      "No aseguramos las Mercancías. El Cliente mantiene cobertura adecuada durante almacenamiento y tránsito.",

    pricing_h: "10. Precios y Pagos",
    pricing_intro: "Todos los precios en EUR, sin IVA.",
    pricing_list: [
      "IVA aplicable según ley.",
      "Facturación mensual o por tarea, según acuerdo.",
      "Pagos mediante procesadores aprobados.",
      "El impago puede conllevar suspensión de los Servicios.",
    ],
    pricing_nonrefund:
      "Los servicios ya prestados (recepción, prep, etiquetado, envío) no son reembolsables. Si hay error confirmado imputable a la Empresa: corrección sin coste o abono.",
    pricing_extra:
      "Trabajos adicionales/imprevistos (re-paletización, manipulación especial, documentación aduanera) se facturan a la tarifa comunicada.",
    pricing_accept:
      "Al crear cuenta/pedir/marcar “Acepto”, confirma que ha leído y aceptado la lista de precios de la sección “Tarifas”.",
    pricing_notice:
      "Podemos actualizar precios con 30 días de preaviso (email y/o en su cuenta). Puede resolver en ese periodo; el uso posterior a la fecha implica aceptación.",

    warranties_h: "11. Garantías y cumplimiento",
    warranties_list: [
      "Usted garantiza que las Mercancías son legales, correctamente descritas, no infringen derechos y cumplen requisitos de Plataforma (idoneidad FBA, baterías/hazmat cuando proceda).",
      "Usted es el único responsable de las políticas de Plataforma (incluidas posibles tarifas de „unplanned services“ en Amazon).",
    ],

    liability_h: "12. Limitación de responsabilidad",
    liability_p: "Nuestra responsabilidad se limita al valor de los Servicios prestados.",
    liability_list: [
      "Sin responsabilidad por impuestos/aduanas/demoras/rechazos atribuibles a Amazon o autoridades.",
      "Por pérdidas/daños bajo nuestra custodia debidos a robo/incendio/inundación/eventos excepcionales, la responsabilidad se limita al 30% del valor de compra declarado (factura proveedor), no al PVP.",
      "El seguro completo del producto corresponde al Cliente.",
      "La aceptación por Amazon queda a su exclusiva discreción; rechazos por políticas no son imputables a nosotros.",
      "Tras la entrega al transportista, el riesgo del transporte es del transportista.",
      "Aplica fuerza mayor.",
      "Las reclamaciones deben presentarse en 14 días con pruebas razonables.",
    ],

    force_h: "13. Fuerza mayor",
    force_p:
      "No respondemos por eventos fuera del control razonable (desastres, huelgas, caídas de servicio, epidemias, guerra, actos gubernamentales, caídas de Plataforma, etc.).",

    subcontractors_h: "14. Subcontratistas",
    subcontractors_p:
      "Podemos emplear subcontratistas cualificados para partes del Servicio; seguimos siendo responsables de la orquestación.",

    confidentiality_h: "15. Confidencialidad & PI",
    confidentiality_p:
      "La información no pública (precios, procesos, fotos, datos de cuenta) es confidencial. Materiales/guías/procesos de la Empresa siguen siendo nuestra PI.",

    data_h: "16. Protección de datos",
    data_p:
      "Tratamos datos de contacto y operativos conforme al RGPD y a nuestra Política de Privacidad. Puede firmarse un DPA cuando actuamos como encargado. Véase el sitio web.",

    notices_h: "17. Notificaciones",
    notices_p:
      "Las notificaciones podrán enviarse por email a las direcciones del perfil y se considerarán recibidas al envío, salvo fallo de entrega notificado.",

    law_h: "18. Ley aplicable y jurisdicción",
    law_p:
      "Estos Términos se rigen por la ley francesa. Los tribunales franceses son competentes.",

    language_h: "19. Idioma y prevalencia",
    language_p:
      "Si existen varias versiones lingüísticas, prevalece la versión francesa en caso de conflicto.",

    severability_h: "20. Divisibilidad; Acuerdo íntegro; Renuncias",
    severability_p:
      "Si alguna disposición es inválida, el resto permanece vigente. Estos Términos constituyen el acuerdo íntegro. La falta de ejercicio no implica renuncia.",

    contact_h: "Contacto",
    contact_intro: "Consultas sobre estos Términos y Condiciones:",
    contact_email: "Email: contact@prep-center.eu",
    contact_phone: "Teléfono: +33 6 75 11 62 18",
    contact_addr: "Dirección: 35350 La Gouesnière, Francia",

    updates_h: "Cambios",
    updates_p:
      "Podemos modificar estos Términos; la versión actualizada entra en vigor 30 días después de su publicación. El uso continuado implica aceptación.",
  },
},

// ============ PL ============
pl: {
  title: "Regulamin (B2B)",
  lastUpdated: `Ostatnia aktualizacja: ${LAST}`,
  sections: {
    defs_h: "0. Definicje",
    defs_list: [
      "„Spółka”, „my”: Prep Center France.",
      "„Klient”, „Państwo”: klient biznesowy zamawiający Usługi.",
      "„Towary”: rzeczy wysyłane do nas w celu przyjęcia, obsługi, przygotowania, tymczasowego składowania lub wysyłki.",
      "„Usługi”: przyjęcie, kontrola, przygotowanie i etykietowanie, pakowanie, tymczasowe składowanie, koordynacja wysyłek, w tym FBM/FBA.",
      "„Platformy”: rynki/systemy takie jak Amazon, eBay, Shopify itp.",
    ],

    scope_h: "1. Zakres i akceptacja",
    scope_list: [
      "Niniejszy Regulamin ma zastosowanie do wszystkich Usług świadczonych przez Spółkę.",
      "Działamy wyłącznie w modelu B2B (profesjonalnym).",
      "W razie sprzeczności między Regulaminem a doraźnymi instrukcjami/zleceniami, obowiązuje Regulamin, chyba że uzgodniono pisemnie inaczej.",
    ],

    orders_h: "2. Zamówienia i instrukcje",
    orders_list: [
      "Przed dostawą Klient przekazuje PO/ASN oraz pisemne instrukcje przygotowania/pakowania.",
      "Brak instrukcji może skutkować wstrzymaniem przyjęcia.",
      "Zmiany/anulacje po check-in mogą generować opłaty manipulacyjne.",
      "Gdy instrukcje są brakujące/niejasne/sprzeczne, możemy żądać doprecyzowania lub zastosować standardowe praktyki FBA/branżowe na koszt Klienta.",
    ],

    sla_h: "3. Czas realizacji (SLA)",
    sla_p:
      "O ile nie uzgodniono pisemnie inaczej, terminy mają charakter Best-Effort (bez gwarancji). Szczyty sezonowe, kontrole zgodności i dostępność przewoźników mogą wpływać na czasy.",

    receiving_h: "4. Przyjęcie, liczenie i niezgodności",
    receiving_list: [
      "Racjonalna kontrola wzrokowa i liczenie na poziomie kartonu/kolli; liczenie jednostkowe na życzenie (płatne).",
      "Widoczne niezgodności są dokumentowane (zdjęcia, jeśli zasadne) i komunikowane.",
      "Reklamacje należy zgłosić w ciągu 5 dni roboczych od naszego potwierdzenia przyjęcia; w przeciwnym razie przyjęcie uznaje się za zaakceptowane.",
    ],

    packaging_h: "5. Pakowanie i standardy FBA/FBM",
    packaging_list: [
      "Klient odpowiada za zgodność z wymaganiami Platform/prawa (limity kartonów, kody kreskowe, ostrzeżenia, paletyzacja, materiały niebezpieczne/baterie).",
      "Prace naprawcze wynikające z natury produktu lub błędnych/niepełnych instrukcji są płatne.",
    ],

    storage_h: "6. Magazynowanie",
    storage_list: [
      "Magazynowanie jest tymczasowe. Po 90 dniach od check-in mogą obowiązywać dodatkowe opłaty i/lub żądanie odbioru.",
      "Możemy odmówić/przenieść Towary powodujące ryzyka bezpieczeństwa/zgodności lub nieproporcjonalne obciążenie pojemności.",
    ],

    abandoned_h: "7. Towary porzucone i prawo zastawu",
    abandoned_list: [
      "Jeśli faktury pozostają nieopłacone lub Towary nie zostaną odebrane w ciągu 30 dni od pisemnego powiadomienia, możemy wykonać prawo zastawu i zatrzymać, sprzedać lub zutylizować Towary w celu odzyskania należności i kosztów.",
      "Koszty zwrotu/utylizacji ponosi Klient.",
    ],

    shipping_h: "8. Wysyłka i przejście ryzyka",
    shipping_list: [
      "Ryzyko przechodzi na przewoźnika z chwilą przekazania prawidłowo przygotowanych i oznaczonych przesyłek.",
      "Jeśli nie uzgodniono inaczej, wysyłki odbywają się na standardowych warunkach (np. EXW nasz obiekt). Wymagania specjalne wymagają formy pisemnej.",
    ],

    insurance_h: "9. Ubezpieczenie",
    insurance_p:
      "Nie ubezpieczamy Towarów. Klient utrzymuje odpowiednie ubezpieczenie podczas magazynowania i transportu.",

    pricing_h: "10. Ceny i płatności",
    pricing_intro: "Wszystkie ceny w EUR, bez VAT.",
    pricing_list: [
      "VAT zgodnie z przepisami.",
      "Rozliczenia miesięczne lub za zadanie – zgodnie z ustaleniami.",
      "Płatności przez zatwierdzonych operatorów.",
      "Brak płatności może skutkować zawieszeniem Usług.",
    ],
    pricing_nonrefund:
      "Usługi już wykonane (przyjęcie, prep, etykietowanie, wysyłka) nie podlegają zwrotowi. W przypadku potwierdzonego błędu Spółki: bezpłatna korekta lub nota kredytowa.",
    pricing_extra:
      "Prace dodatkowe/nieprzewidziane (re-paletyzacja, specjalna obsługa, dokumenty celne) rozliczane według zakomunikowanych stawek.",
    pricing_accept:
      "Tworząc konto/składając zamówienie/zaznaczając „Akceptuję”, potwierdzają Państwo zapoznanie się z cennikiem w sekcji „Taryfy”.",
    pricing_notice:
      "Ceny mogą być aktualizowane z 30-dniowym wyprzedzeniem (e-mail i/lub w koncie). W tym czasie można wypowiedzieć; dalsze korzystanie oznacza akceptację.",

    warranties_h: "11. Gwarancje i zgodność",
    warranties_list: [
      "Oświadczają Państwo, że Towary są legalne, prawidłowo opisane, nie naruszają praw osób trzecich i spełniają wymagania Platform (kwalifikacja FBA, baterie/hazmat – jeśli dotyczy).",
      "Za polityki Platform odpowiada wyłącznie Klient (w tym ewentualne opłaty „unplanned services” w Amazon).",
    ],

    liability_h: "12. Ograniczenie odpowiedzialności",
    liability_p: "Nasza odpowiedzialność jest ograniczona do wartości świadczonych Usług.",
    liability_list: [
      "Brak odpowiedzialności za podatki/cło/opóźnienia/odmowy przypisywane Amazonowi lub organom.",
      "W przypadku utraty/uszkodzeń w naszej pieczy z powodu kradzieży/pożaru/powodzi/zdarzeń nadzwyczajnych – odpowiedzialność ograniczona do 30% zadeklarowanej wartości zakupu (faktura dostawcy), a nie ceny sprzedaży.",
      "Pełne ubezpieczenie produktów należy do Klienta.",
      "Akceptacja przez Amazon pozostaje w jego wyłącznej gestii; odmowy z przyczyn polityk nie są nam przypisywane.",
      "Po przekazaniu przewoźnikowi ryzyko transportu ponosi przewoźnik.",
      "Obowiązuje siła wyższa.",
      "Roszczenia należy zgłosić w ciągu 14 dni wraz z rozsądnymi dowodami.",
    ],

    force_h: "13. Siła wyższa",
    force_p:
      "Brak odpowiedzialności za zdarzenia poza rozsądną kontrolą (kataklizmy, strajki, awarie, epidemie, wojna, akty władz, awarie Platform itp.).",

    subcontractors_h: "14. Podwykonawcy",
    subcontractors_p:
      "Możemy korzystać ze sprawdzonych podwykonawców dla części Usług; pozostajemy odpowiedzialni za orkiestrację.",

    confidentiality_h: "15. Poufność i własność intelektualna",
    confidentiality_p:
      "Informacje niepubliczne (ceny, procesy, zdjęcia, dane konta) są poufne. Materiały/wytyczne/procesy Spółki pozostają naszą własnością intelektualną.",

    data_h: "16. Ochrona danych",
    data_p:
      "Przetwarzamy dane kontaktowe i operacyjne zgodnie z RODO oraz naszą Polityką prywatności. Możliwa jest umowa powierzenia (DPA), gdy działamy jako podmiot przetwarzający. Zob. strona WWW.",

    notices_h: "17. Zawiadomienia",
    notices_p:
      "Zawiadomienia mogą być wysyłane e-mailem na adresy z profilu konta i uznaje się je za doręczone z chwilą wysłania, o ile nie zgłoszono błędu doręczenia.",

    law_h: "18. Prawo właściwe i jurysdykcja",
    law_p:
      "Regulamin podlega prawu francuskiemu. Właściwe są sądy francuskie.",

    language_h: "19. Język i pierwszeństwo",
    language_p:
      "W razie rozbieżności między wersjami językowymi rozstrzygająca jest wersja francuska.",

    severability_h: "20. Rozdzielność; Całość umowy; Zrzeczenia",
    severability_p:
      "Nieważność postanowienia nie wpływa na ważność pozostałych. Regulamin stanowi całość uzgodnień. Brak egzekwowania nie stanowi zrzeczenia się prawa.",

    contact_h: "Kontakt",
    contact_intro: "Pytania dotyczące niniejszego Regulaminu:",
    contact_email: "E-mail: contact@prep-center.eu",
    contact_phone: "Telefon: +33 6 75 11 62 18",
    contact_addr: "Adres: 35350 La Gouesnière, Francja",

    updates_h: "Aktualizacje",
    updates_p:
      "Możemy zmieniać Regulamin; zaktualizowana wersja obowiązuje po 30 dniach od publikacji. Dalsze korzystanie oznacza akceptację.",
  },
},

};
