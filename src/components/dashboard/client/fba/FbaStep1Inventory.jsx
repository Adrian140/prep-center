import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDashboardTranslation } from '@/translations';

const FieldLabel = ({ label, action = null, children }) => (
  <div className="flex flex-col gap-1 text-sm text-slate-700">
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-slate-800">{label}</span>
      {action}
    </div>
    {children}
  </div>
);

// Small inline placeholder (60x60 light gray) to avoid network failures
const placeholderImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="10">SKU</text></svg>';

const PREP_LABELS = {
  ITEM_POLYBAGGING: 'Polybagging',
  POLYBAGGING: 'Polybagging',
  ITEM_BUBBLEWRAP: 'Bubble wrapping',
  BUBBLEWRAPPING: 'Bubble wrapping',
  ITEM_BLACK_SHRINKWRAP: 'Black shrink wrapping',
  BLACKSHRINKWRAPPING: 'Black shrink wrapping',
  ITEM_TAPING: 'Taping',
  TAPING: 'Taping',
  ITEM_BOXING: 'Boxing / overbox',
  BOXING: 'Boxing / overbox',
  ITEM_DEBUNDLE: 'Debundle',
  DEBUNDLE: 'Debundle',
  ITEM_SUFFOSTK: 'Suffocation warning label',
  SUFFOCATIONSTICKERING: 'Suffocation warning label',
  ITEM_CAP_SEALING: 'Cap sealing',
  CAPSEALING: 'Cap sealing',
  HANGGARMENT: 'Hang garment',
  SETCREATION: 'Set creation',
  REMOVEFROMHANGER: 'Remove from hanger',
  SETSTICKERING: 'Set stickering',
  BLANKSTICKERING: 'Blank stickering',
  LABELING: 'Labeling',
  SHIPSINPRODUCTPACKAGING: 'Ships in product packaging',
  NOPREP: 'No prep'
};

const formatPrepList = (raw) => {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(',')
        .map((val) => val.trim())
        .filter(Boolean);
  const mapped = values
    .map((val) => {
      const key = String(val || '').replace(/[\s-]/g, '').toUpperCase();
      return PREP_LABELS[key] || val;
    })
    .filter((val) => String(val || '').toLowerCase() !== 'noprep');
  return Array.from(new Set(mapped));
};

const parseLocalizedDecimal = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parsePositiveLocalizedDecimal = (value) => {
  const num = parseLocalizedDecimal(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const parsePositiveInteger = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
};

const PACKING_TYPE = {
  CASE: 'case',
  INDIVIDUAL: 'individual',
  SINGLE_SKU_PALLET: 'single_sku_pallet'
};

const STEP1_COPY = {
  en: {
    opDefaultIssue: 'Amazon reported an issue for this SKU. Review and try again.',
    opMissingPrep: 'Prep classification is missing for this SKU. Choose prep and submit again.',
    opNotEligible: 'This product is currently not eligible for inbound on the selected marketplace.',
    validationMissingBoxes: 'Add at least one box for every pack with units.',
    validationMissingAssignments: 'Distribute all units into boxes (Assigned must equal Units).',
    validationMissingDims: 'Add dimensions and weight for every box.',
    validationEmptyBoxes: 'Some boxes are empty. Remove them or add items.',
    validationOverweight: 'Weight exceeds the {kg} kg limit.',
    validationOversize: 'A dimension exceeds the {cm} cm limit for a box that does not contain exactly 1 unit.',
    prepRequired: 'Prep required: {list}',
    prepSetNeeded: 'Prep set: Prep needed',
    prepSetNone: 'Prep set: No prep needed',
    statusEligible: 'Eligible',
    statusListingMissing: 'Listing missing',
    statusListingInactive: 'Listing inactive',
    statusRestricted: 'Restricted',
    statusUnknown: 'Unknown',
    readyToPack: 'Ready to pack',
    removeListing: 'Remove listing',
    noBoxesAssignedYet: 'No boxes assigned yet.',
    noServicesSelected: 'No services selected.',
    notEligibleBanner: 'Some products are not eligible for the selected marketplace.',
    inboundPlanNotReady: 'Amazon inbound plan is not ready. Retry Step 1 to regenerate the plan.',
    operationIssuesTitle: 'Amazon reported issues for some SKUs:',
    planStillLoading: 'Amazon plan is still loading. Waiting for generated SKUs/shipments; nothing to show yet.',
    ignoredLinesNotice: '{count} line(s) without SKU were ignored. Complete SKU on those lines if you want to include them.',
    completeBoxPlanning: 'Complete box planning before continuing.',
    noUnitsWarning: 'No units to send. Set at least 1 unit.',
    alertNotEligible: 'Some SKUs are not eligible on Amazon; fix eligibility and try again.',
    alertPlanNotReady: 'Amazon inbound plan is not ready. Retry Step 1.',
    waitingAmazon: 'Waiting for Amazon response...',
    saving: 'Saving…',
    resolveEligibility: 'Resolve eligibility in Amazon',
    retryStep1: 'Retry Step 1',
    waitingPlan: 'Waiting for Amazon plan',
    addUnits: 'Add units',
    continueToPacking: 'Continue to packing',
    step1Title: 'Step 1 - Confirmed inventory to send',
    skusConfirmedShort: 'SKUs confirmed ({count})',
    ignoredLinesShort: 'Ignored lines ({count})',
    closeAdd: 'Close add',
    addProduct: 'Add product',
    searchSkuAsinName: 'Search SKU / ASIN / product name',
    searchInventoryHint: 'Search in inventory and add product into this shipment request.',
    searchingInventory: 'Searching inventory...',
    noInventoryResults: 'No inventory results.',
    hiddenInRequest: 'Already in request (hidden)',
    noHiddenProducts: 'No hidden products in this request.',
    add: 'Add',
    shipFromLabel: 'Ship from',
    marketplaceDestinationCountry: 'Marketplace destination (Country)',
    addAllUnitsOneBox: 'Add all units to one box',
    tableSkuDetails: 'SKU details',
    tablePackingDetails: 'Packing details',
    tableInfoAction: 'Information / action',
    tableQuantityToSend: 'Quantity to send',
    tableServices: 'Services',
    waitingSkusAndShipments: 'Waiting for Amazon response for SKUs and shipments...',
    noSkusToDisplay: 'No SKUs to display.',
    storageLabel: 'Storage',
    optionIndividualUnits: 'Individual units',
    optionCasePacked: 'Case packed',
    optionSingleSkuPallet: 'Single SKU pallet',
    optionCreatePackingTemplate: 'Create packing template',
    labelOwner: 'Label owner',
    expirationDateRequired: 'Expiration date required',
    printSkuLabels: 'Print SKU labels',
    moreInputs: 'More inputs',
    rechecking: 'Rechecking...',
    recheckAssign: 'Recheck assign',
    templateLabel: 'Template',
    unitsPerBoxShort: 'Units/box',
    casePackUnitsPerBox: 'Case pack - Units/box',
    amazonNeedsPackageAttrs: 'Amazon needs product package attributes for this SKU.',
    sendProductAttrs: 'Send product attributes to Amazon',
    sending: 'Sending...',
    noChangesToSend: 'No changes to send.',
    completeProductDimensions: 'Complete product dimensions (L/W/H).',
    completeProductWeight: 'Complete product weight.',
    couldNotSendAttrs: 'Could not send attributes to Amazon.',
    boxes: 'Boxes',
    box: 'Box',
    units: 'Units',
    remove: 'Remove',
    assigned: 'Assigned',
    addService: '+ Add service',
    allServicesAdded: 'All services already added.',
    noBoxServicesSelected: 'No box services selected.',
    unit: 'Unit',
    qty: 'Qty',
    total: 'Total',
    boxDetailsStep1: 'Box details (Step 1)',
    putAllInOneBoxRo: 'Put everything in one box',
    ignored: 'Ignored',
    skuMissing: 'SKU: missing',
    blockedUntilSkuCompleted: 'Blocked until SKU is completed.',
    excludedFromStep1bShipping: 'This line is excluded from Step 1b and Shipping.',
    servicesLockedIgnored: 'Services locked for ignored line.',
    missingCompanyIdTemplate: 'Missing companyId in plan; cannot save template.',
    setNameOrUnitsTemplate: 'Set a name or units per box for the template.',
    unitsPerBoxGreaterThanZero: 'Units per box must be greater than 0 for case pack.',
    couldNotSaveTemplate: 'Could not save template.',
    prepareFbaItems: 'Prepare your FBA items',
    close: 'Close',
    prepGuidance: 'Prep guidance',
    useManufacturerBarcode: 'Use manufacturer barcode',
    choosePrepCategory: 'Choose prep category',
    selectPlaceholder: 'Select...',
    guidance: 'Guidance',
    notEligibleManufacturerBarcode: 'This SKU is not eligible to use manufacturer barcode for tracking.',
    eligibleManufacturerBarcode: 'This SKU can use manufacturer barcode.',
    useManufacturerBarcodeTracking: 'Use manufacturer barcode for tracking',
    cancel: 'Cancel',
    save: 'Save',
    fulfillmentStorageType: 'Fulfilment by Amazon storage type',
    choosePrintingFormat: 'Choose printing format',
    thermalPrinting: 'Thermal printing',
    standardFormats: 'Standard formats',
    widthMm: 'Width (mm)',
    heightMm: 'Height (mm)',
    printLabels: 'Print labels',
    downloading: 'Downloading…',
    downloadLabels: 'Download labels',
    couldNotRequestLabels: 'Could not request labels from Amazon.',
    labelRequestSentRetry: 'Label request sent to Amazon; try again in a few seconds if the PDF did not open.',
    missingDownloadUrlOrOperationId: 'Amazon response missing downloadUrl/operationId',
    couldNotDownloadLabels: 'Could not download Amazon labels.',
    couldNotLoadTemplates: 'Could not load packing templates.',
    packGroupsPreviewTitle: 'Pack groups preview (Step 1)',
    loadingGroupingAmazon: 'Loading grouping from Amazon…',
    noPackingGroupsYet: 'No packing groups yet. Continue to Step 1b or reload the plan.',
    groupedAboveNotice: 'Products are grouped above in the list by pack groups.',
    packN: 'Pack {index}',
    skusConfirmedToSendSummary: 'SKUs confirmed to send: {count} ({units} units)',
    noBoxesYet: 'No boxes yet.',
    totalSkus: 'Total SKUs',
    unitsBoxed: 'Units boxed',
    enterBoxContentsHint: 'Enter the box contents above and the box weights and dimensions below',
    boxWeightKg: 'Box weight (kg)',
    boxDimensionsCm: 'Box dimensions (cm)',
    addAnotherBoxDimension: '+ Add another box dimension',
    allItems: 'All items',
    singleBox: 'Single box',
    unassigned: 'Unassigned',
    packGroupN: 'Pack group {index}',
    itemsBelowPackedTogether: 'Items below can be packed together.',
    packingDetailsTitle: 'Packing details',
    templateName: 'Template name',
    templateNameExample: 'e.g. 12/box',
    type: 'Type',
    skuLabelShort: 'SKU',
    asinLabelShort: 'ASIN',
    stockLabelShort: 'Stock',
    ofWord: 'of',
    genericSkuLabel: 'SKU',
    weightKg: 'Weight (kg)',
    dimensionsCm: 'Dimensions (cm)',
    dimLcmPlaceholder: 'L (cm)',
    dimWcmPlaceholder: 'W (cm)',
    dimHcmPlaceholder: 'H (cm)',
    dimLPlaceholder: 'L',
    dimWPlaceholder: 'W',
    dimHPlaceholder: 'H',
    zeroPlaceholder: '0',
    zeroDecimalPlaceholder: '0.0',
    removeBoxNAria: 'Remove box {index}',
    removeBoxDimensionsNAria: 'Remove box dimensions {index}',
    packPrefix: 'pack',
    prep: 'Prep',
    noPrepNeeded: 'No prep needed',
    prepFragileGlass: 'Fragile/glass',
    prepLiquidsNonGlass: 'Liquids (non glass)',
    prepPerforatedPackaging: 'Perforated packaging',
    prepPowderPelletsGranular: 'Powder, pellets and granular',
    prepSmall: 'Small'
  },
  ro: {
    opDefaultIssue: 'Amazon a raportat o problemă pentru acest SKU. Verifică și încearcă din nou.',
    opMissingPrep: 'Lipsește categoria de pregătire (prep) pentru acest SKU. Selectează prep și retrimite.',
    opNotEligible: 'Acest produs nu este eligibil momentan pentru inbound pe marketplace-ul selectat.',
    validationMissingBoxes: 'Adaugă cel puțin o cutie pentru fiecare grup cu unități.',
    validationMissingAssignments: 'Distribuie toate unitățile în cutii (Assigned trebuie să fie egal cu Units).',
    validationMissingDims: 'Completează dimensiunile și greutatea pentru fiecare cutie.',
    validationEmptyBoxes: 'Unele cutii sunt goale. Elimină-le sau adaugă produse.',
    validationOverweight: 'Greutatea depășește limita de {kg} kg.',
    validationOversize: 'O dimensiune depășește limita de {cm} cm pentru o cutie care nu conține exact 1 unitate.',
    prepRequired: 'Pregătire necesară: {list}',
    prepSetNeeded: 'Pregătire setată: necesară',
    prepSetNone: 'Pregătire setată: nu este necesară',
    statusEligible: 'Eligibil',
    statusListingMissing: 'Listing lipsă',
    statusListingInactive: 'Listing inactiv',
    statusRestricted: 'Restricționat',
    statusUnknown: 'Necunoscut',
    readyToPack: 'Gata de ambalare',
    removeListing: 'Elimină listing',
    noBoxesAssignedYet: 'Nicio cutie alocată încă.',
    noServicesSelected: 'Niciun serviciu selectat.',
    notEligibleBanner: 'Unele produse nu sunt eligibile pentru marketplace-ul selectat.',
    inboundPlanNotReady: 'Planul inbound Amazon nu este pregătit. Reîncearcă Pasul 1 pentru regenerare.',
    operationIssuesTitle: 'Amazon a raportat probleme pentru unele SKU-uri:',
    planStillLoading: 'Planul Amazon încă se încarcă. Așteptăm SKU-urile/shipments generate.',
    ignoredLinesNotice: '{count} linie(linii) fără SKU au fost ignorate. Completează SKU dacă vrei să le incluzi.',
    completeBoxPlanning: 'Finalizează planificarea cutiilor înainte de continuare.',
    noUnitsWarning: 'Nu există unități de trimis. Setează cel puțin 1 unitate.',
    alertNotEligible: 'Unele SKU-uri nu sunt eligibile în Amazon; corectează și încearcă din nou.',
    alertPlanNotReady: 'Planul inbound Amazon nu este gata. Reîncearcă Pasul 1.',
    waitingAmazon: 'Se așteaptă răspunsul Amazon...',
    saving: 'Se salvează…',
    resolveEligibility: 'Rezolvă eligibilitatea în Amazon',
    retryStep1: 'Reîncearcă Pasul 1',
    waitingPlan: 'Se așteaptă planul Amazon',
    addUnits: 'Adaugă unități',
    continueToPacking: 'Continuă la împachetare',
    step1Title: 'Pasul 1 - Inventar confirmat pentru trimitere',
    skusConfirmedShort: 'SKU-uri confirmate ({count})',
    ignoredLinesShort: 'Linii ignorate ({count})',
    closeAdd: 'Închide adăugarea',
    addProduct: 'Adaugă produs',
    searchSkuAsinName: 'Caută SKU / ASIN / nume produs',
    searchInventoryHint: 'Caută în inventar și adaugă produsul în această cerere.',
    searchingInventory: 'Se caută în inventar...',
    noInventoryResults: 'Niciun rezultat în inventar.',
    hiddenInRequest: 'Deja în cerere (ascunse)',
    noHiddenProducts: 'Nu există produse ascunse în această cerere.',
    add: 'Adaugă',
    shipFromLabel: 'Expeditor',
    marketplaceDestinationCountry: 'Marketplace destinație (Țară)',
    addAllUnitsOneBox: 'Adaugă toate unitățile într-o cutie',
    tableSkuDetails: 'Detalii SKU',
    tablePackingDetails: 'Detalii împachetare',
    tableInfoAction: 'Informații / acțiune',
    tableQuantityToSend: 'Cantitate de trimis',
    tableServices: 'Servicii',
    waitingSkusAndShipments: 'Se așteaptă răspunsul Amazon pentru SKU-uri și shipment-uri...',
    noSkusToDisplay: 'Nu există SKU-uri de afișat.',
    storageLabel: 'Depozitare',
    optionIndividualUnits: 'Unități individuale',
    optionCasePacked: 'Case pack',
    optionSingleSkuPallet: 'Palet SKU unic',
    optionCreatePackingTemplate: 'Creează șablon de împachetare',
    labelOwner: 'Proprietar etichetă',
    expirationDateRequired: 'Data expirării este necesară',
    printSkuLabels: 'Printează etichete SKU',
    moreInputs: 'Mai multe inputuri',
    rechecking: 'Se reverifică...',
    recheckAssign: 'Reverifică alocarea',
    templateLabel: 'Șablon',
    unitsPerBoxShort: 'Unități/cutie',
    casePackUnitsPerBox: 'Case pack - Unități/cutie',
    amazonNeedsPackageAttrs: 'Amazon are nevoie de atributele pachetului pentru acest SKU.',
    sendProductAttrs: 'Trimite atributele produsului la Amazon',
    sending: 'Se trimite...',
    noChangesToSend: 'Nu există modificări de trimis.',
    completeProductDimensions: 'Completează dimensiunile produsului (L/l/H).',
    completeProductWeight: 'Completează greutatea produsului.',
    couldNotSendAttrs: 'Nu s-au putut trimite atributele la Amazon.',
    boxes: 'Cutii',
    box: 'Cutie',
    units: 'Unități',
    remove: 'Șterge',
    assigned: 'Alocate',
    addService: '+ Adaugă serviciu',
    allServicesAdded: 'Toate serviciile au fost deja adăugate.',
    noBoxServicesSelected: 'Nu există servicii de cutii selectate.',
    unit: 'Unitar',
    qty: 'Cant.',
    total: 'Total',
    boxDetailsStep1: 'Detalii cutii (Pasul 1)',
    putAllInOneBoxRo: 'Pune totul într-o singură cutie',
    ignored: 'Ignorat',
    skuMissing: 'SKU: lipsă',
    blockedUntilSkuCompleted: 'Blocat până la completarea SKU.',
    excludedFromStep1bShipping: 'Această linie este exclusă din Pasul 1b și Shipping.',
    servicesLockedIgnored: 'Servicii blocate pentru linia ignorată.',
    missingCompanyIdTemplate: 'Lipsește companyId în plan; șablonul nu poate fi salvat.',
    setNameOrUnitsTemplate: 'Setează un nume sau unități/cutie pentru șablon.',
    unitsPerBoxGreaterThanZero: 'Unitățile per cutie trebuie să fie mai mari ca 0 pentru case pack.',
    couldNotSaveTemplate: 'Nu s-a putut salva șablonul.',
    prepareFbaItems: 'Pregătește articolele FBA',
    close: 'Închide',
    prepGuidance: 'Ghid prep',
    useManufacturerBarcode: 'Folosește codul producătorului',
    choosePrepCategory: 'Alege categoria prep',
    selectPlaceholder: 'Selectează...',
    guidance: 'Ghidaj',
    notEligibleManufacturerBarcode: 'Acest SKU nu este eligibil pentru codul producătorului.',
    eligibleManufacturerBarcode: 'Acest SKU poate folosi codul producătorului.',
    useManufacturerBarcodeTracking: 'Folosește codul producătorului pentru tracking',
    cancel: 'Anulează',
    save: 'Salvează',
    fulfillmentStorageType: 'Tip stocare Fulfilment by Amazon',
    choosePrintingFormat: 'Alege formatul de printare',
    thermalPrinting: 'Printare termică',
    standardFormats: 'Formate standard',
    widthMm: 'Lățime (mm)',
    heightMm: 'Înălțime (mm)',
    printLabels: 'Printează etichete',
    downloading: 'Se descarcă…',
    downloadLabels: 'Descarcă etichete',
    couldNotRequestLabels: 'Nu s-au putut solicita etichetele de la Amazon.',
    labelRequestSentRetry: 'Cererea de etichete a fost trimisă; reîncearcă în câteva secunde dacă PDF-ul nu s-a deschis.',
    missingDownloadUrlOrOperationId: 'Răspuns Amazon fără downloadUrl/operationId',
    couldNotDownloadLabels: 'Nu s-au putut descărca etichetele Amazon.',
    couldNotLoadTemplates: 'Nu s-au putut încărca șabloanele.',
    packGroupsPreviewTitle: 'Previzualizare grupuri de împachetare (Pasul 1)',
    loadingGroupingAmazon: 'Se încarcă gruparea de la Amazon…',
    noPackingGroupsYet: 'Nu există încă packing groups. Continuă la Pasul 1b sau reîncarcă planul.',
    groupedAboveNotice: 'Produsele sunt grupate mai sus în listă după pack groups.',
    packN: 'Pachet {index}',
    skusConfirmedToSendSummary: 'SKU-uri confirmate pentru trimitere: {count} ({units} unități)',
    noBoxesYet: 'Nu există încă cutii.',
    totalSkus: 'Total SKU-uri',
    unitsBoxed: 'Unități în cutii',
    enterBoxContentsHint: 'Introdu conținutul cutiilor mai sus și greutățile/dimensiunile mai jos',
    boxWeightKg: 'Greutate cutie (kg)',
    boxDimensionsCm: 'Dimensiuni cutie (cm)',
    addAnotherBoxDimension: '+ Adaugă alt set de dimensiuni',
    allItems: 'Toate produsele',
    singleBox: 'Cutie unică',
    unassigned: 'Nealocat',
    packGroupN: 'Grup pachet {index}',
    itemsBelowPackedTogether: 'Produsele de mai jos pot fi împachetate împreună.',
    packingDetailsTitle: 'Detalii împachetare',
    templateName: 'Nume șablon',
    templateNameExample: 'ex. 12/cutie',
    type: 'Tip',
    skuLabelShort: 'SKU',
    asinLabelShort: 'ASIN',
    stockLabelShort: 'Stoc',
    ofWord: 'din',
    genericSkuLabel: 'SKU',
    weightKg: 'Greutate (kg)',
    dimensionsCm: 'Dimensiuni (cm)',
    dimLcmPlaceholder: 'L (cm)',
    dimWcmPlaceholder: 'l (cm)',
    dimHcmPlaceholder: 'H (cm)',
    dimLPlaceholder: 'L',
    dimWPlaceholder: 'l',
    dimHPlaceholder: 'H',
    zeroPlaceholder: '0',
    zeroDecimalPlaceholder: '0,0',
    removeBoxNAria: 'Elimină cutia {index}',
    removeBoxDimensionsNAria: 'Elimină dimensiunile cutiei {index}',
    packPrefix: 'pachet',
    prep: 'Prep',
    noPrepNeeded: 'Fără prep necesar',
    prepFragileGlass: 'Fragil/sticlă',
    prepLiquidsNonGlass: 'Lichide (fără sticlă)',
    prepPerforatedPackaging: 'Ambalaj perforat',
    prepPowderPelletsGranular: 'Pulbere, pelete și granule',
    prepSmall: 'Mic'
  },
  fr: {
    opDefaultIssue: 'Amazon a signalé un problème pour ce SKU. Vérifiez et réessayez.',
    opMissingPrep: 'La classification prep est manquante pour ce SKU. Sélectionnez-la et renvoyez.',
    opNotEligible: 'Ce produit n’est pas éligible à l’inbound sur la marketplace sélectionnée.',
    validationMissingBoxes: 'Ajoutez au moins une boîte pour chaque groupe avec des unités.',
    validationMissingAssignments: 'Répartissez toutes les unités dans les boîtes (Assigned = Units).',
    validationMissingDims: 'Ajoutez dimensions et poids pour chaque boîte.',
    validationEmptyBoxes: 'Certaines boîtes sont vides. Supprimez-les ou ajoutez des articles.',
    validationOverweight: 'Le poids dépasse la limite de {kg} kg.',
    validationOversize: 'Une dimension dépasse la limite de {cm} cm pour une boîte qui ne contient pas exactement 1 unité.',
    prepRequired: 'Préparation requise : {list}',
    prepSetNeeded: 'Préparation définie : requise',
    prepSetNone: 'Préparation définie : non requise',
    statusEligible: 'Éligible',
    statusListingMissing: 'Annonce manquante',
    statusListingInactive: 'Annonce inactive',
    statusRestricted: 'Restreint',
    statusUnknown: 'Inconnu',
    readyToPack: 'Prêt à emballer',
    removeListing: 'Supprimer l’annonce',
    noBoxesAssignedYet: 'Aucune boîte assignée pour le moment.',
    noServicesSelected: 'Aucun service sélectionné.',
    notEligibleBanner: 'Certains produits ne sont pas éligibles pour la marketplace sélectionnée.',
    inboundPlanNotReady: 'Le plan inbound Amazon n’est pas prêt. Réessayez l’étape 1.',
    operationIssuesTitle: 'Amazon a signalé des problèmes pour certains SKU :',
    planStillLoading: 'Le plan Amazon est encore en cours de chargement.',
    ignoredLinesNotice: '{count} ligne(s) sans SKU ont été ignorées.',
    completeBoxPlanning: 'Complétez le plan de boîtes avant de continuer.',
    noUnitsWarning: 'Aucune unité à envoyer. Définissez au moins 1 unité.',
    alertNotEligible: 'Certains SKU ne sont pas éligibles sur Amazon ; corrigez puis réessayez.',
    alertPlanNotReady: 'Le plan inbound Amazon n’est pas prêt. Réessayez l’étape 1.',
    waitingAmazon: 'En attente de la réponse Amazon...',
    saving: 'Enregistrement…',
    resolveEligibility: 'Résoudre l’éligibilité dans Amazon',
    retryStep1: 'Réessayer l’étape 1',
    waitingPlan: 'En attente du plan Amazon',
    addUnits: 'Ajouter des unités',
    continueToPacking: 'Continuer vers l’emballage',
    step1Title: 'Étape 1 - Inventaire confirmé à expédier',
    skusConfirmedShort: 'SKU confirmés ({count})',
    ignoredLinesShort: 'Lignes ignorées ({count})',
    closeAdd: 'Fermer l’ajout',
    addProduct: 'Ajouter un produit',
    searchSkuAsinName: 'Rechercher SKU / ASIN / nom produit',
    searchInventoryHint: 'Recherchez dans le stock et ajoutez le produit à cette demande.',
    searchingInventory: 'Recherche dans le stock...',
    noInventoryResults: 'Aucun résultat dans le stock.',
    hiddenInRequest: 'Déjà dans la demande (masqués)',
    noHiddenProducts: 'Aucun produit masqué dans cette demande.',
    add: 'Ajouter',
    shipFromLabel: 'Expéditeur',
    marketplaceDestinationCountry: 'Marketplace de destination (Pays)',
    addAllUnitsOneBox: 'Mettre toutes les unités dans une boîte',
    tableSkuDetails: 'Détails SKU',
    tablePackingDetails: 'Détails d’emballage',
    tableInfoAction: 'Information / action',
    tableQuantityToSend: 'Quantité à envoyer',
    tableServices: 'Services',
    waitingSkusAndShipments: 'En attente de la réponse Amazon pour les SKU et expéditions...',
    noSkusToDisplay: 'Aucun SKU à afficher.',
    storageLabel: 'Stockage',
    optionIndividualUnits: 'Unités individuelles',
    optionCasePacked: 'Case pack',
    optionSingleSkuPallet: 'Palette SKU unique',
    optionCreatePackingTemplate: 'Créer un modèle d’emballage',
    labelOwner: 'Propriétaire des étiquettes',
    expirationDateRequired: 'Date d’expiration requise',
    printSkuLabels: 'Imprimer les étiquettes SKU',
    moreInputs: 'Plus de champs',
    rechecking: 'Vérification...',
    recheckAssign: 'Revérifier l’affectation',
    templateLabel: 'Modèle',
    unitsPerBoxShort: 'Unités/boîte',
    casePackUnitsPerBox: 'Case pack - Unités/boîte',
    amazonNeedsPackageAttrs: 'Amazon exige les attributs de colis pour ce SKU.',
    sendProductAttrs: 'Envoyer les attributs produit à Amazon',
    sending: 'Envoi...',
    noChangesToSend: 'Aucun changement à envoyer.',
    completeProductDimensions: 'Complétez les dimensions produit (L/l/H).',
    completeProductWeight: 'Complétez le poids du produit.',
    couldNotSendAttrs: 'Impossible d’envoyer les attributs à Amazon.',
    boxes: 'Boîtes',
    box: 'Boîte',
    units: 'Unités',
    remove: 'Supprimer',
    assigned: 'Affectées',
    addService: '+ Ajouter un service',
    allServicesAdded: 'Tous les services ont déjà été ajoutés.',
    noBoxServicesSelected: 'Aucun service de boîte sélectionné.',
    unit: 'Unité',
    qty: 'Qté',
    total: 'Total',
    boxDetailsStep1: 'Détails des boîtes (Étape 1)',
    putAllInOneBoxRo: 'Mettre tout dans une seule boîte',
    ignored: 'Ignoré',
    skuMissing: 'SKU : manquant',
    blockedUntilSkuCompleted: 'Bloqué jusqu’à compléter le SKU.',
    excludedFromStep1bShipping: 'Cette ligne est exclue de l’étape 1b et du transport.',
    servicesLockedIgnored: 'Services verrouillés pour la ligne ignorée.',
    missingCompanyIdTemplate: 'companyId manquant dans le plan ; impossible de sauvegarder le modèle.',
    setNameOrUnitsTemplate: 'Définissez un nom ou des unités/boîte pour le modèle.',
    unitsPerBoxGreaterThanZero: 'Les unités par boîte doivent être supérieures à 0 pour case pack.',
    couldNotSaveTemplate: 'Impossible de sauvegarder le modèle.',
    prepareFbaItems: 'Préparer vos articles FBA',
    close: 'Fermer',
    prepGuidance: 'Guide prep',
    useManufacturerBarcode: 'Utiliser le code fabricant',
    choosePrepCategory: 'Choisir une catégorie prep',
    selectPlaceholder: 'Sélectionner...',
    guidance: 'Guide',
    notEligibleManufacturerBarcode: 'Ce SKU n’est pas éligible au code fabricant.',
    eligibleManufacturerBarcode: 'Ce SKU peut utiliser le code fabricant.',
    useManufacturerBarcodeTracking: 'Utiliser le code fabricant pour le suivi',
    cancel: 'Annuler',
    save: 'Enregistrer',
    fulfillmentStorageType: 'Type de stockage Fulfilment by Amazon',
    choosePrintingFormat: 'Choisir le format d’impression',
    thermalPrinting: 'Impression thermique',
    standardFormats: 'Formats standards',
    widthMm: 'Largeur (mm)',
    heightMm: 'Hauteur (mm)',
    printLabels: 'Imprimer les étiquettes',
    downloading: 'Téléchargement…',
    downloadLabels: 'Télécharger les étiquettes',
    couldNotRequestLabels: 'Impossible de demander les étiquettes à Amazon.',
    labelRequestSentRetry: 'Demande envoyée à Amazon ; réessayez dans quelques secondes si le PDF ne s’ouvre pas.',
    missingDownloadUrlOrOperationId: 'Réponse Amazon sans downloadUrl/operationId',
    couldNotDownloadLabels: 'Impossible de télécharger les étiquettes Amazon.',
    couldNotLoadTemplates: 'Impossible de charger les modèles d’emballage.',
    packGroupsPreviewTitle: 'Aperçu des groupes d’emballage (Étape 1)',
    loadingGroupingAmazon: 'Chargement du regroupement Amazon…',
    noPackingGroupsYet: 'Aucun groupe d’emballage pour le moment. Continuez à l’étape 1b ou rechargez le plan.',
    groupedAboveNotice: 'Les produits sont regroupés ci-dessus dans la liste par groupes d’emballage.',
    packN: 'Colis {index}',
    skusConfirmedToSendSummary: 'SKU confirmés à envoyer : {count} ({units} unités)',
    noBoxesYet: 'Aucune boîte pour le moment.',
    totalSkus: 'Total SKU',
    unitsBoxed: 'Unités en boîtes',
    enterBoxContentsHint: 'Saisissez le contenu des boîtes ci-dessus, puis poids et dimensions ci-dessous',
    boxWeightKg: 'Poids de la boîte (kg)',
    boxDimensionsCm: 'Dimensions de la boîte (cm)',
    addAnotherBoxDimension: '+ Ajouter une autre dimension de boîte',
    allItems: 'Tous les articles',
    singleBox: 'Boîte unique',
    unassigned: 'Non assigné',
    packGroupN: 'Groupe de colis {index}',
    itemsBelowPackedTogether: 'Les articles ci-dessous peuvent être emballés ensemble.',
    packingDetailsTitle: 'Détails d’emballage',
    templateName: 'Nom du modèle',
    templateNameExample: 'ex. 12/boîte',
    type: 'Type',
    skuLabelShort: 'SKU',
    asinLabelShort: 'ASIN',
    stockLabelShort: 'Stock',
    ofWord: 'sur',
    genericSkuLabel: 'SKU',
    weightKg: 'Poids (kg)',
    dimensionsCm: 'Dimensions (cm)',
    dimLcmPlaceholder: 'L (cm)',
    dimWcmPlaceholder: 'l (cm)',
    dimHcmPlaceholder: 'H (cm)',
    dimLPlaceholder: 'L',
    dimWPlaceholder: 'l',
    dimHPlaceholder: 'H',
    zeroPlaceholder: '0',
    zeroDecimalPlaceholder: '0,0',
    removeBoxNAria: 'Supprimer la boîte {index}',
    removeBoxDimensionsNAria: 'Supprimer les dimensions de la boîte {index}',
    packPrefix: 'colis',
    prep: 'Prep',
    noPrepNeeded: 'Aucun prep requis',
    prepFragileGlass: 'Fragile/verre',
    prepLiquidsNonGlass: 'Liquides (hors verre)',
    prepPerforatedPackaging: 'Emballage perforé',
    prepPowderPelletsGranular: 'Poudre, granulés et matières granuleuses',
    prepSmall: 'Petit'
  },
  de: {
    opDefaultIssue: 'Amazon hat ein Problem für diese SKU gemeldet. Prüfen und erneut versuchen.',
    opMissingPrep: 'Die Prep-Klassifizierung fehlt für diese SKU. Bitte auswählen und erneut senden.',
    opNotEligible: 'Dieses Produkt ist für Inbound auf dem gewählten Marktplatz derzeit nicht berechtigt.',
    validationMissingBoxes: 'Füge mindestens eine Box für jede Gruppe mit Einheiten hinzu.',
    validationMissingAssignments: 'Verteile alle Einheiten auf Boxen (Assigned muss Units entsprechen).',
    validationMissingDims: 'Füge Maße und Gewicht für jede Box hinzu.',
    validationEmptyBoxes: 'Einige Boxen sind leer. Entferne sie oder füge Artikel hinzu.',
    validationOverweight: 'Gewicht überschreitet das Limit von {kg} kg.',
    validationOversize: 'Ein Maß überschreitet das Limit von {cm} cm für eine Box ohne genau 1 Einheit.',
    prepRequired: 'Vorbereitung erforderlich: {list}',
    prepSetNeeded: 'Vorbereitung gesetzt: erforderlich',
    prepSetNone: 'Vorbereitung gesetzt: nicht erforderlich',
    statusEligible: 'Berechtigt',
    statusListingMissing: 'Listing fehlt',
    statusListingInactive: 'Listing inaktiv',
    statusRestricted: 'Eingeschränkt',
    statusUnknown: 'Unbekannt',
    readyToPack: 'Packbereit',
    removeListing: 'Listing entfernen',
    noBoxesAssignedYet: 'Noch keine Box zugewiesen.',
    noServicesSelected: 'Keine Services ausgewählt.',
    notEligibleBanner: 'Einige Produkte sind für den gewählten Marktplatz nicht berechtigt.',
    inboundPlanNotReady: 'Amazon Inbound-Plan ist nicht bereit. Schritt 1 erneut versuchen.',
    operationIssuesTitle: 'Amazon hat für einige SKUs Probleme gemeldet:',
    planStillLoading: 'Amazon-Plan wird noch geladen.',
    ignoredLinesNotice: '{count} Zeile(n) ohne SKU wurden ignoriert.',
    completeBoxPlanning: 'Box-Planung vor dem Fortfahren abschließen.',
    noUnitsWarning: 'Keine Einheiten zum Senden. Mindestens 1 Einheit setzen.',
    alertNotEligible: 'Einige SKUs sind bei Amazon nicht berechtigt. Bitte korrigieren und erneut versuchen.',
    alertPlanNotReady: 'Amazon Inbound-Plan ist nicht bereit. Schritt 1 erneut versuchen.',
    waitingAmazon: 'Warte auf Amazon-Antwort...',
    saving: 'Speichern…',
    resolveEligibility: 'Berechtigung in Amazon lösen',
    retryStep1: 'Schritt 1 wiederholen',
    waitingPlan: 'Warte auf Amazon-Plan',
    addUnits: 'Einheiten hinzufügen',
    continueToPacking: 'Zum Packen weiter',
    step1Title: 'Schritt 1 - Bestätigter Bestand zum Versand',
    skusConfirmedShort: 'Bestätigte SKUs ({count})',
    ignoredLinesShort: 'Ignorierte Zeilen ({count})',
    closeAdd: 'Hinzufügen schließen',
    addProduct: 'Produkt hinzufügen',
    searchSkuAsinName: 'SKU / ASIN / Produktname suchen',
    searchInventoryHint: 'Im Bestand suchen und Produkt zu dieser Anfrage hinzufügen.',
    searchingInventory: 'Bestand wird durchsucht...',
    noInventoryResults: 'Keine Bestandsergebnisse.',
    hiddenInRequest: 'Bereits in Anfrage (ausgeblendet)',
    noHiddenProducts: 'Keine ausgeblendeten Produkte in dieser Anfrage.',
    add: 'Hinzufügen',
    shipFromLabel: 'Versand von',
    marketplaceDestinationCountry: 'Ziel-Marketplace (Land)',
    addAllUnitsOneBox: 'Alle Einheiten in eine Box',
    tableSkuDetails: 'SKU-Details',
    tablePackingDetails: 'Packdetails',
    tableInfoAction: 'Information / Aktion',
    tableQuantityToSend: 'Menge zum Versand',
    tableServices: 'Services',
    waitingSkusAndShipments: 'Warte auf Amazon-Antwort für SKUs und Sendungen...',
    noSkusToDisplay: 'Keine SKUs zum Anzeigen.',
    storageLabel: 'Lagerung',
    optionIndividualUnits: 'Einzelne Einheiten',
    optionCasePacked: 'Case Pack',
    optionSingleSkuPallet: 'Einzel-SKU-Palette',
    optionCreatePackingTemplate: 'Packvorlage erstellen',
    labelOwner: 'Label-Eigentümer',
    expirationDateRequired: 'Ablaufdatum erforderlich',
    printSkuLabels: 'SKU-Labels drucken',
    moreInputs: 'Weitere Eingaben',
    rechecking: 'Prüfe erneut...',
    recheckAssign: 'Zuweisung neu prüfen',
    templateLabel: 'Vorlage',
    unitsPerBoxShort: 'Einheiten/Box',
    casePackUnitsPerBox: 'Case Pack - Einheiten/Box',
    amazonNeedsPackageAttrs: 'Amazon benötigt Paketattribute für diese SKU.',
    sendProductAttrs: 'Produktattribute an Amazon senden',
    sending: 'Senden...',
    noChangesToSend: 'Keine Änderungen zum Senden.',
    completeProductDimensions: 'Produktmaße (L/B/H) vervollständigen.',
    completeProductWeight: 'Produktgewicht vervollständigen.',
    couldNotSendAttrs: 'Attribute konnten nicht an Amazon gesendet werden.',
    boxes: 'Boxen',
    box: 'Box',
    units: 'Einheiten',
    remove: 'Entfernen',
    assigned: 'Zugewiesen',
    addService: '+ Service hinzufügen',
    allServicesAdded: 'Alle Services wurden bereits hinzugefügt.',
    noBoxServicesSelected: 'Keine Box-Services ausgewählt.',
    unit: 'Einheit',
    qty: 'Menge',
    total: 'Gesamt',
    boxDetailsStep1: 'Boxdetails (Schritt 1)',
    putAllInOneBoxRo: 'Alles in eine einzige Box legen',
    ignored: 'Ignoriert',
    skuMissing: 'SKU: fehlt',
    blockedUntilSkuCompleted: 'Blockiert, bis SKU ergänzt ist.',
    excludedFromStep1bShipping: 'Diese Zeile ist von Schritt 1b und Versand ausgeschlossen.',
    servicesLockedIgnored: 'Services für ignorierte Zeile gesperrt.',
    missingCompanyIdTemplate: 'companyId im Plan fehlt; Vorlage kann nicht gespeichert werden.',
    setNameOrUnitsTemplate: 'Name oder Einheiten/Box für die Vorlage setzen.',
    unitsPerBoxGreaterThanZero: 'Einheiten pro Box müssen bei Case Pack größer als 0 sein.',
    couldNotSaveTemplate: 'Vorlage konnte nicht gespeichert werden.',
    prepareFbaItems: 'FBA-Artikel vorbereiten',
    close: 'Schließen',
    prepGuidance: 'Prep-Hinweis',
    useManufacturerBarcode: 'Herstellerbarcode verwenden',
    choosePrepCategory: 'Prep-Kategorie wählen',
    selectPlaceholder: 'Auswählen...',
    guidance: 'Hinweis',
    notEligibleManufacturerBarcode: 'Diese SKU ist für Herstellerbarcode nicht geeignet.',
    eligibleManufacturerBarcode: 'Diese SKU kann Herstellerbarcode verwenden.',
    useManufacturerBarcodeTracking: 'Herstellerbarcode für Tracking verwenden',
    cancel: 'Abbrechen',
    save: 'Speichern',
    fulfillmentStorageType: 'Fulfilment by Amazon Lagertyp',
    choosePrintingFormat: 'Druckformat wählen',
    thermalPrinting: 'Thermodruck',
    standardFormats: 'Standardformate',
    widthMm: 'Breite (mm)',
    heightMm: 'Höhe (mm)',
    printLabels: 'Labels drucken',
    downloading: 'Wird heruntergeladen…',
    downloadLabels: 'Labels herunterladen',
    couldNotRequestLabels: 'Labels konnten nicht bei Amazon angefordert werden.',
    labelRequestSentRetry: 'Label-Anfrage an Amazon gesendet; in einigen Sekunden erneut versuchen, falls PDF nicht öffnet.',
    missingDownloadUrlOrOperationId: 'Amazon-Antwort ohne downloadUrl/operationId',
    couldNotDownloadLabels: 'Amazon-Labels konnten nicht heruntergeladen werden.',
    couldNotLoadTemplates: 'Packvorlagen konnten nicht geladen werden.',
    packGroupsPreviewTitle: 'Packgruppen-Vorschau (Schritt 1)',
    loadingGroupingAmazon: 'Amazon-Gruppierung wird geladen…',
    noPackingGroupsYet: 'Noch keine Packgruppen. Mit Schritt 1b fortfahren oder Plan neu laden.',
    groupedAboveNotice: 'Produkte sind oben in der Liste nach Packgruppen gruppiert.',
    packN: 'Pack {index}',
    skusConfirmedToSendSummary: 'Bestätigte SKUs zum Versand: {count} ({units} Einheiten)',
    noBoxesYet: 'Noch keine Boxen.',
    totalSkus: 'Gesamt-SKUs',
    unitsBoxed: 'Einheiten in Boxen',
    enterBoxContentsHint: 'Boxinhalt oben eingeben, unten Gewichte und Maße',
    boxWeightKg: 'Boxgewicht (kg)',
    boxDimensionsCm: 'Boxmaße (cm)',
    addAnotherBoxDimension: '+ Weitere Boxmaße hinzufügen',
    allItems: 'Alle Artikel',
    singleBox: 'Einzelbox',
    unassigned: 'Nicht zugewiesen',
    packGroupN: 'Packgruppe {index}',
    itemsBelowPackedTogether: 'Die folgenden Artikel können zusammen verpackt werden.',
    packingDetailsTitle: 'Packdetails',
    templateName: 'Vorlagenname',
    templateNameExample: 'z. B. 12/Box',
    type: 'Typ',
    skuLabelShort: 'SKU',
    asinLabelShort: 'ASIN',
    stockLabelShort: 'Bestand',
    ofWord: 'von',
    genericSkuLabel: 'SKU',
    weightKg: 'Gewicht (kg)',
    dimensionsCm: 'Maße (cm)',
    dimLcmPlaceholder: 'L (cm)',
    dimWcmPlaceholder: 'B (cm)',
    dimHcmPlaceholder: 'H (cm)',
    dimLPlaceholder: 'L',
    dimWPlaceholder: 'B',
    dimHPlaceholder: 'H',
    zeroPlaceholder: '0',
    zeroDecimalPlaceholder: '0,0',
    removeBoxNAria: 'Box {index} entfernen',
    removeBoxDimensionsNAria: 'Boxmaße {index} entfernen',
    packPrefix: 'Pack',
    prep: 'Prep',
    noPrepNeeded: 'Kein Prep erforderlich',
    prepFragileGlass: 'Zerbrechlich/Glas',
    prepLiquidsNonGlass: 'Flüssigkeiten (ohne Glas)',
    prepPerforatedPackaging: 'Perforierte Verpackung',
    prepPowderPelletsGranular: 'Pulver, Pellets und Granulat',
    prepSmall: 'Klein'
  },
  it: {
    opDefaultIssue: 'Amazon ha segnalato un problema per questo SKU. Controlla e riprova.',
    opMissingPrep: 'Manca la classificazione prep per questo SKU. Selezionala e invia di nuovo.',
    opNotEligible: 'Questo prodotto non è idoneo all’inbound sul marketplace selezionato.',
    validationMissingBoxes: 'Aggiungi almeno una scatola per ogni gruppo con unità.',
    validationMissingAssignments: 'Distribuisci tutte le unità nelle scatole (Assigned deve essere uguale a Units).',
    validationMissingDims: 'Aggiungi dimensioni e peso per ogni scatola.',
    validationEmptyBoxes: 'Alcune scatole sono vuote. Rimuovile o aggiungi articoli.',
    validationOverweight: 'Il peso supera il limite di {kg} kg.',
    validationOversize: 'Una dimensione supera il limite di {cm} cm per una scatola che non contiene esattamente 1 unità.',
    prepRequired: 'Prep richiesto: {list}',
    prepSetNeeded: 'Prep impostato: richiesto',
    prepSetNone: 'Prep impostato: non richiesto',
    statusEligible: 'Idoneo',
    statusListingMissing: 'Listing mancante',
    statusListingInactive: 'Listing inattivo',
    statusRestricted: 'Limitato',
    statusUnknown: 'Sconosciuto',
    readyToPack: 'Pronto per l’imballaggio',
    removeListing: 'Rimuovi listing',
    noBoxesAssignedYet: 'Nessuna scatola assegnata.',
    noServicesSelected: 'Nessun servizio selezionato.',
    notEligibleBanner: 'Alcuni prodotti non sono idonei per il marketplace selezionato.',
    inboundPlanNotReady: 'Il piano inbound Amazon non è pronto. Riprova lo Step 1.',
    operationIssuesTitle: 'Amazon ha segnalato problemi per alcuni SKU:',
    planStillLoading: 'Il piano Amazon è ancora in caricamento.',
    ignoredLinesNotice: '{count} riga(e) senza SKU sono state ignorate.',
    completeBoxPlanning: 'Completa la pianificazione delle scatole prima di continuare.',
    noUnitsWarning: 'Nessuna unità da inviare. Imposta almeno 1 unità.',
    alertNotEligible: 'Alcuni SKU non sono idonei su Amazon; correggi e riprova.',
    alertPlanNotReady: 'Il piano inbound Amazon non è pronto. Riprova lo Step 1.',
    waitingAmazon: 'In attesa della risposta di Amazon...',
    saving: 'Salvataggio…',
    resolveEligibility: 'Risolvi idoneità in Amazon',
    retryStep1: 'Riprova Step 1',
    waitingPlan: 'In attesa del piano Amazon',
    addUnits: 'Aggiungi unità',
    continueToPacking: 'Continua al packing'
  },
  es: {
    opDefaultIssue: 'Amazon informó un problema para este SKU. Revísalo e inténtalo de nuevo.',
    opMissingPrep: 'Falta la clasificación prep para este SKU. Selecciónala y vuelve a enviar.',
    opNotEligible: 'Este producto no es apto para inbound en el marketplace seleccionado.',
    validationMissingBoxes: 'Añade al menos una caja para cada grupo con unidades.',
    validationMissingAssignments: 'Distribuye todas las unidades en cajas (Assigned debe ser igual a Units).',
    validationMissingDims: 'Añade dimensiones y peso para cada caja.',
    validationEmptyBoxes: 'Algunas cajas están vacías. Elimínalas o añade artículos.',
    validationOverweight: 'El peso supera el límite de {kg} kg.',
    validationOversize: 'Una dimensión supera el límite de {cm} cm para una caja que no contiene exactamente 1 unidad.',
    prepRequired: 'Preparación requerida: {list}',
    prepSetNeeded: 'Preparación configurada: requerida',
    prepSetNone: 'Preparación configurada: no requerida',
    statusEligible: 'Elegible',
    statusListingMissing: 'Listing faltante',
    statusListingInactive: 'Listing inactivo',
    statusRestricted: 'Restringido',
    statusUnknown: 'Desconocido',
    readyToPack: 'Listo para preparar',
    removeListing: 'Eliminar listing',
    noBoxesAssignedYet: 'Aún no hay cajas asignadas.',
    noServicesSelected: 'No hay servicios seleccionados.',
    notEligibleBanner: 'Algunos productos no son elegibles para el marketplace seleccionado.',
    inboundPlanNotReady: 'El plan inbound de Amazon no está listo. Reintenta el Paso 1.',
    operationIssuesTitle: 'Amazon informó problemas para algunos SKU:',
    planStillLoading: 'El plan de Amazon todavía se está cargando.',
    ignoredLinesNotice: 'Se ignoraron {count} línea(s) sin SKU.',
    completeBoxPlanning: 'Completa la planificación de cajas antes de continuar.',
    noUnitsWarning: 'No hay unidades para enviar. Define al menos 1 unidad.',
    alertNotEligible: 'Algunos SKU no son elegibles en Amazon; corrige e inténtalo de nuevo.',
    alertPlanNotReady: 'El plan inbound de Amazon no está listo. Reintenta el Paso 1.',
    waitingAmazon: 'Esperando respuesta de Amazon...',
    saving: 'Guardando…',
    resolveEligibility: 'Resolver elegibilidad en Amazon',
    retryStep1: 'Reintentar Paso 1',
    waitingPlan: 'Esperando plan de Amazon',
    addUnits: 'Agregar unidades',
    continueToPacking: 'Continuar al empaquetado'
  }
};

const normalizePackingType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === PACKING_TYPE.CASE) return PACKING_TYPE.CASE;
  if (raw === PACKING_TYPE.SINGLE_SKU_PALLET || raw === 'single-sku-pallet') return PACKING_TYPE.SINGLE_SKU_PALLET;
  return PACKING_TYPE.INDIVIDUAL;
};

export default function FbaStep1Inventory({
  data,
  skuStatuses = [],
  blocking = false,
  error = '',
  notice = '',
  loadingPlan = false,
  saving = false,
  inboundPlanId = null,
  requestId = null,
  packGroupsPreview = [],
  packGroupsPreviewLoading = false,
  packGroupsPreviewError = '',
  boxPlan = null,
  onBoxPlanChange,
  marketCode = '',
  allowNoInboundPlan = false,
  inboundPlanMissing = false,
  onRetryInboundPlan,
  onBypassInboundPlan,
  inboundPlanCopy = {},
  onChangePacking,
  onChangeQuantity,
  onRemoveSku,
  onAddSku,
  onChangeExpiry,
  onChangePrep,
  onRecheckAssignment,
  skuServicesById = {},
  onSkuServicesChange,
  boxServices = [],
  onBoxServicesChange,
  onPersistServices,
  operationProblems = [],
  onSubmitListingAttributes,
  onNext
}) {
  const { currentLanguage } = useLanguage();
  const { t } = useDashboardTranslation();
  const copy = STEP1_COPY[currentLanguage] || STEP1_COPY.en;
  const tr = useCallback(
    (key, fallback = '', vars = {}) => {
      const path = `Wizard.${key}`;
      const fromDashboard = t(path);
      const template =
        fromDashboard !== path
          ? fromDashboard
          : copy[key] || STEP1_COPY.en[key] || fallback || key;
      return String(template).replace(/\{(\w+)\}/g, (_, varKey) => String(vars[varKey] ?? `{${varKey}}`));
    },
    [copy, t]
  );

  const resolvedInboundPlanId =
    inboundPlanId ||
    data?.inboundPlanId ||
    data?.inbound_plan_id ||
    data?.planId ||
    data?.plan_id ||
    null;
  const shipFrom = data?.shipFrom || {};
  const marketplaceRaw = data?.marketplace || '';
  const rawSkus = Array.isArray(data?.skus) ? data.skus : [];
  const skus = useMemo(
    () => rawSkus.filter((sku) => !sku?.excluded && Number(sku?.units || 0) > 0),
    [rawSkus]
  );
  const normalizeKey = useCallback((value) => String(value || '').trim().toUpperCase(), []);
  const getSkuCandidateKeys = useCallback(
    (sku) =>
      [
        sku?.sku,
        sku?.msku,
        sku?.SellerSKU,
        sku?.sellerSku,
        sku?.fnsku,
        sku?.fnSku,
        sku?.asin,
        sku?.id
      ]
        .map((v) => normalizeKey(v))
        .filter(Boolean),
    [normalizeKey]
  );
  const getItemCandidateKeys = useCallback(
    (item) =>
      [
        item?.sku,
        item?.msku,
        item?.SellerSKU,
        item?.sellerSku,
        item?.asin,
        item?.fnsku
      ]
        .map((v) => normalizeKey(v))
        .filter(Boolean),
    [normalizeKey]
  );
  const getSkuToken = useCallback(
    (sku, idx) => {
      const idKey = normalizeKey(sku?.id);
      if (idKey) return `ID:${idKey}`;
      const skuKey = normalizeKey(sku?.sku || sku?.msku || sku?.SellerSKU || sku?.sellerSku || sku?.asin || '');
      return `ROW:${idx}:${skuKey || 'UNKNOWN'}`;
    },
    [normalizeKey]
  );
  const companyId = data?.companyId || data?.company_id || null;
  const userId = data?.userId || data?.user_id || null;
  const [addSkuQuery, setAddSkuQuery] = useState('');
  const [addSkuOpen, setAddSkuOpen] = useState(false);
  const [inventoryResults, setInventoryResults] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [addSkuBusyKey, setAddSkuBusyKey] = useState('');
  const [recheckingSkuId, setRecheckingSkuId] = useState('');
  const [listingAttrDraftsBySku, setListingAttrDraftsBySku] = useState({});
  const [listingAttrSavingBySku, setListingAttrSavingBySku] = useState({});
  const [listingAttrErrorBySku, setListingAttrErrorBySku] = useState({});
  const [listingAttrLastSubmittedBySku, setListingAttrLastSubmittedBySku] = useState({});
  const ignoredItems = Array.isArray(data?.ignoredItems) ? data.ignoredItems : [];

  const marketplaceIdByCountry = {
    FR: 'A13V1IB3VIYZZH',
    DE: 'A1PA6795UKMFR9',
    ES: 'A1RKKUPIHCS9HS',
    IT: 'APJ6JRA9NG5V4',
    FRANCE: 'A13V1IB3VIYZZH',
    GERMANY: 'A1PA6795UKMFR9',
    SPAIN: 'A1RKKUPIHCS9HS',
    ITALY: 'APJ6JRA9NG5V4'
  };
  const marketplaceId = (() => {
    const upper = String(marketplaceRaw || '').trim().toUpperCase();
    return marketplaceIdByCountry[upper] || marketplaceRaw;
  })();
  const marketplaceName = (() => {
    const map = {
      A13V1IB3VIYZZH: 'France',
      A1PA6795UKMFR9: 'Germany',
      A1RKKUPIHCS9HS: 'Spain',
      APJ6JRA9NG5V4: 'Italy'
    };
    return map[marketplaceId] || marketplaceRaw || '—';
  })();
  const totalUnits = skus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);
  const hasUnits = totalUnits > 0;
  const addSkuCandidates = useMemo(() => {
    const normalizedQuery = String(addSkuQuery || '').trim().toLowerCase();
    const base = rawSkus.filter((sku) => sku?.excluded || Number(sku?.units || 0) <= 0);
    if (!normalizedQuery) return base;
    return base.filter((sku) => {
      const haystack = [sku?.title, sku?.product_name, sku?.sku, sku?.asin].map((v) => String(v || '').toLowerCase()).join(' ');
      return haystack.includes(normalizedQuery);
    });
  }, [addSkuQuery, rawSkus]);
  const activeSkuKeys = useMemo(() => {
    const set = new Set();
    skus.forEach((sku) => {
      const skuKey = String(sku?.sku || '').trim().toUpperCase();
      if (skuKey) set.add(`SKU:${skuKey}`);
      if (sku?.stock_item_id) set.add(`STOCK:${sku.stock_item_id}`);
    });
    return set;
  }, [skus]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!addSkuOpen) return;
      const q = String(addSkuQuery || '').trim();
      if (q.length < 2) {
        setInventoryResults([]);
        return;
      }
      if (!companyId && !userId) {
        setInventoryResults([]);
        return;
      }
      setInventoryLoading(true);
      try {
        let query = supabase
          .from('stock_items')
          .select('id, name, sku, asin, image_url, qty, company_id, user_id')
          .or(`name.ilike.%${q}%,sku.ilike.%${q}%,asin.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(30);
        if (companyId) {
          query = query.eq('company_id', companyId);
        } else if (userId) {
          query = query.eq('user_id', userId);
        }
        const { data: rows } = await query;
        if (cancelled) return;
        const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
          const skuKey = String(row?.sku || '').trim().toUpperCase();
          const stockKey = row?.id ? `STOCK:${row.id}` : '';
          if (stockKey && activeSkuKeys.has(stockKey)) return false;
          if (skuKey && activeSkuKeys.has(`SKU:${skuKey}`)) return false;
          return true;
        });
        setInventoryResults(filtered);
      } catch (e) {
        if (!cancelled) {
          setInventoryResults([]);
        }
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    };
    const timer = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addSkuOpen, addSkuQuery, activeSkuKeys, companyId, userId]);
  const missingInboundPlan = !resolvedInboundPlanId;
  const inboundCopy = {
    banner: '',
    wait: '',
    retry: '',
    continueAnyway: ''
  };
  const statusForSku = (sku) => {
    const skuKeys = getSkuCandidateKeys(sku);
    for (const key of skuKeys) {
        const match = skuStatuses.find((s) => {
          const statusKeys = [
            s?.sku,
            s?.msku,
            s?.SellerSKU,
            s?.sellerSku,
            s?.fnsku,
            s?.fnSku,
            s?.asin,
            s?.id
          ]
            .map((v) => normalizeKey(v))
            .filter(Boolean);
        return statusKeys.includes(key);
      });
      if (match) return match;
    }
    return { state: 'unknown', reason: '' };
  };
  const humanizeOperationProblem = useCallback((problem) => {
    const message = String(problem?.message || problem?.Message || '').trim();
    if (!message) return tr('opDefaultIssue');
    if (/prep classification/i.test(message)) {
      return tr('opMissingPrep');
    }
    if (/not available for inbound/i.test(message)) {
      return tr('opNotEligible');
    }
    return message.replace(/\bFBA_INB_\d+\b[:\s-]*/gi, '').trim();
  }, [tr]);
  const listingAttrRequirementsBySku = useMemo(() => {
    const map = new Map();
    (Array.isArray(operationProblems) ? operationProblems : []).forEach((problem) => {
      const code = String(problem?.code || '').toUpperCase();
      const message = String(problem?.message || '').toLowerCase();
      const details = String(problem?.details || '').toLowerCase();
      const combined = `${message} ${details}`;
      const resourceMatch = String(problem?.details || '').match(/resource\s+'([^']+)'/i);
      const explicitSkuMatch = String(problem?.message || '').match(/\bSKU\s*[:=]\s*([A-Za-z0-9._\- ]+)/i);
      const resourceKey = normalizeKey(resourceMatch?.[1] || explicitSkuMatch?.[1] || '');
      if (!resourceKey) return;
      const needsDimensions =
        code === 'FBA_INB_0004' ||
        combined.includes('dimensions need to be provided');
      const needsWeight =
        code === 'FBA_INB_0005' ||
        combined.includes('weight need to be provided');
      if (!needsDimensions && !needsWeight) return;
      const current = map.get(resourceKey) || { needsDimensions: false, needsWeight: false, messages: [] };
      current.needsDimensions = current.needsDimensions || needsDimensions;
      current.needsWeight = current.needsWeight || needsWeight;
      if (problem?.message) current.messages.push(String(problem.message));
      map.set(resourceKey, current);
    });
    return map;
  }, [normalizeKey, operationProblems]);
  const operationProblemsBySkuKey = useMemo(() => {
    const map = new Map();
    const fnskuToSku = new Map();
    (Array.isArray(skuStatuses) ? skuStatuses : []).forEach((s) => {
      const fnskuKey = normalizeKey(s?.fnsku || s?.fnSku || '');
      const skuKey = normalizeKey(s?.sku || s?.msku || s?.SellerSKU || s?.sellerSku || '');
      if (fnskuKey && skuKey) fnskuToSku.set(fnskuKey, skuKey);
    });
    const add = (rawKey, message) => {
      const key = normalizeKey(rawKey);
      if (!key || !message) return;
      const list = map.get(key) || [];
      if (!list.includes(message)) list.push(message);
      map.set(key, list);
    };
    (Array.isArray(operationProblems) ? operationProblems : []).forEach((problem) => {
      const msg = humanizeOperationProblem(problem);
      if (!msg) return;
      const rawMessage = String(problem?.message || problem?.Message || '');
      const rawDetails = String(problem?.details || problem?.Details || '');
      const combined = `${rawMessage} ${rawDetails}`;

      const resourceMatch = combined.match(/resource\s+'([^']+)'/i);
      if (resourceMatch?.[1]) add(resourceMatch[1], msg);

      const skuMatch = combined.match(/\bSKU\s*[:=]\s*([A-Za-z0-9._\- ]+)/i);
      if (skuMatch?.[1]) add(skuMatch[1], msg);

      const asinMatch = combined.match(/\bASIN\s*[:=]\s*([A-Za-z0-9]{10})/i);
      if (asinMatch?.[1]) add(asinMatch[1], msg);

      const fnskuListMatch = combined.match(/\bfnskuList\s*:\s*([A-Za-z0-9,\s._\-]+)/i);
      if (fnskuListMatch?.[1]) {
        fnskuListMatch[1]
          .split(',')
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .forEach((fnsku) => {
            add(fnsku, msg);
            const mappedSku = fnskuToSku.get(normalizeKey(fnsku));
            if (mappedSku) add(mappedSku, msg);
          });
      }

      const fnskuMatch = combined.match(/\bFNSKU\s*[:=]\s*([A-Za-z0-9._\-]+)/i);
      if (fnskuMatch?.[1]) {
        add(fnskuMatch[1], msg);
        const mappedSku = fnskuToSku.get(normalizeKey(fnskuMatch[1]));
        if (mappedSku) add(mappedSku, msg);
      }
    });
    return map;
  }, [humanizeOperationProblem, normalizeKey, operationProblems, skuStatuses]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [boxOptions, setBoxOptions] = useState([]);
  const persistTimerRef = useRef(null);
  const serviceOptionsByCategory = useMemo(() => {
    const map = new Map();
    (serviceOptions || []).forEach((opt) => {
      const key = opt.category || 'Services';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(opt);
    });
    const order = ['FBA Prep Services', 'Extra Services'];
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      }
      return String(a[0]).localeCompare(String(b[0]));
    });
    return entries;
  }, [serviceOptions]);
  const boxOptionsByCategory = useMemo(() => {
    const map = new Map();
    (boxOptions || []).forEach((opt) => {
      const key = opt.category || 'Boxes';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(opt);
    });
    return Array.from(map.entries());
  }, [boxOptions]);
  const marketCodeForPricing = useMemo(() => {
    if (marketCode) return String(marketCode || '').toUpperCase();
    const map = {
      A13V1IB3VIYZZH: 'FR',
      A1PA6795UKMFR9: 'DE',
      A1RKKUPIHCS9HS: 'ES',
      APJ6JRA9NG5V4: 'IT'
    };
    return map[marketplaceId] || 'FR';
  }, [marketCode, marketplaceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('pricing_services')
        .select('id, category, service_name, price, unit, position, market')
        .eq('market', marketCodeForPricing)
        .order('category', { ascending: true })
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('Failed to load pricing services', error);
        return;
      }
      const list = data || [];
      const isBoxService = (item) => {
        const cat = String(item.category || '').toLowerCase();
        const name = String(item.service_name || '').toLowerCase();
        return cat.includes('box') || name.includes('box');
      };
      const nextServices = list.filter(
        (item) =>
          ['FBA Prep Services', 'Extra Services'].includes(item.category) &&
          !isBoxService(item)
      );
      const nextBoxes = list.filter((item) => isBoxService(item));
      setServiceOptions(nextServices);
      setBoxOptions(nextBoxes);
    })();
    return () => {
      cancelled = true;
    };
  }, [marketCodeForPricing]);

  const setSkuServices = useCallback((skuId, next) => {
    if (!onSkuServicesChange) return;
    onSkuServicesChange((prev) => ({ ...(prev || {}), [skuId]: next }));
  }, [onSkuServicesChange]);

  const withLocalId = useCallback(
    (entry) => ({ ...entry, _local_id: entry?._local_id || `svc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` }),
    []
  );

  const handleAddSkuService = useCallback((sku) => {
    const skuId = sku?.id;
    if (!skuId) return;
    const current = Array.isArray(skuServicesById?.[skuId]) ? skuServicesById[skuId] : [];
    const used = new Set(current.map((svc) => String(svc?.service_name || '')));
    const available = serviceOptions.filter((opt) => !used.has(String(opt.service_name || '')));
    const preferred =
      available.find((opt) => Number(opt.price || 0) === 0.5) ||
      available[0];
    const first = preferred;
    if (!first) return;
    const nextEntry = withLocalId({
      service_id: first.id,
      service_name: first.service_name,
      unit_price: Number(first.price || 0),
      units: Math.max(1, Number(sku.units || 0) || 1)
    });
    setSkuServices(skuId, [...current, nextEntry]);
  }, [serviceOptions, setSkuServices, skuServicesById, withLocalId]);

  const handleSkuServiceChange = useCallback((skuId, idx, patch) => {
    const current = Array.isArray(skuServicesById?.[skuId]) ? skuServicesById[skuId] : [];
    const next = current.map((row, i) => (i === idx ? withLocalId({ ...row, ...patch }) : row));
    setSkuServices(skuId, next);
  }, [setSkuServices, skuServicesById, withLocalId]);

  const handleRemoveSkuService = useCallback((skuId, idx) => {
    const current = Array.isArray(skuServicesById?.[skuId]) ? skuServicesById[skuId] : [];
    const next = current.filter((_, i) => i !== idx);
    setSkuServices(skuId, next);
  }, [setSkuServices, skuServicesById]);

  const setBoxes = useCallback((next) => {
    if (!onBoxServicesChange) return;
    onBoxServicesChange(next);
  }, [onBoxServicesChange]);

  const persistServicesSafely = useCallback(async () => {
    if (!onPersistServices) return;
    try {
      await onPersistServices();
    } catch (err) {
      console.warn('Failed to persist prep services', err);
    }
  }, [onPersistServices]);

  const schedulePersist = useCallback(() => {
    if (!onPersistServices) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistServicesSafely();
    }, 600);
  }, [onPersistServices, persistServicesSafely]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const handleAddBoxService = useCallback(() => {
    const first = boxOptions[0];
    if (!first) return;
    const nextEntry = withLocalId({
      service_id: first.id,
      service_name: first.service_name,
      unit_price: Number(first.price || 0),
      units: 1
    });
    const current = Array.isArray(boxServices) ? boxServices : [];
    setBoxes([...current, nextEntry]);
  }, [boxOptions, boxServices, setBoxes, withLocalId]);
  const skuEligibilityBlocking = skuStatuses.some((s) =>
    ['missing', 'inactive', 'restricted', 'inbound_unavailable'].includes(String(s.state))
  );
  const hasBlocking = blocking || skuEligibilityBlocking;

  const [packingModal, setPackingModal] = useState({
    open: false,
    sku: null,
    templateType: PACKING_TYPE.CASE,
    unitsPerBox: '',
    boxL: '',
    boxW: '',
    boxH: '',
    boxWeight: '',
    templateName: ''
  });
  const [prepModal, setPrepModal] = useState({
    open: false,
    sku: null,
    prepCategory: '',
    useManufacturerBarcode: false,
    manufacturerBarcodeEligible: true
  });
  const LABEL_PRESETS = useMemo(() => {
    if (marketCodeForPricing === 'DE') {
      return {
        thermal: { width: '62', height: '29' },
        standard: { width: '63', height: '25' }
      };
    }
    return {
      thermal: { width: '50', height: '25' },
      standard: { width: '63', height: '25' }
    };
  }, [marketCodeForPricing]);

  const [labelModal, setLabelModal] = useState(() => ({
    open: false,
    sku: null,
    format: 'thermal',
    width: LABEL_PRESETS.thermal.width,
    height: LABEL_PRESETS.thermal.height,
    quantity: 1
  }));
  const [prepTab, setPrepTab] = useState('prep');
  const [prepSelections, setPrepSelections] = useState({});
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState('');
  const [activeBoxByGroup, setActiveBoxByGroup] = useState({});
  const [boxIndexDrafts, setBoxIndexDrafts] = useState({});
  const [boxQtyDrafts, setBoxQtyDrafts] = useState({});
  const [boxDimDrafts, setBoxDimDrafts] = useState({});
  const [singleBoxMode, setSingleBoxMode] = useState(false);
  const boxScrollRefs = useRef({});

  const normalizedPackGroups = Array.isArray(packGroupsPreview) ? packGroupsPreview : [];
  const hasPackGroups = normalizedPackGroups.some((g) => Array.isArray(g?.items) && g.items.length > 0);
  const MAX_STANDARD_BOX_KG = 23;
  const MAX_STANDARD_BOX_CM = 63.5;

  const safeBoxPlan = useMemo(() => {
    const raw = boxPlan && typeof boxPlan === 'object' ? boxPlan : {};
    const groups = raw?.groups && typeof raw.groups === 'object' ? raw.groups : {};
    return { groups };
  }, [boxPlan]);
  useEffect(() => {
    const keys = Object.keys(safeBoxPlan.groups || {});
    const isSingle = keys.length === 1 && keys[0] === 'single-box';
    setSingleBoxMode(isSingle);
  }, [safeBoxPlan.groups]);
  const packGroupMeta = useMemo(() => {
    if (!hasPackGroups) {
      return [{ groupId: 'ungrouped', label: tr('allItems') }];
    }
    return normalizedPackGroups
      .map((group, idx) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        if (!items.length) return null;
        return {
          groupId: group.packingGroupId || group.id || `pack-${idx + 1}`,
          label: `Pack ${idx + 1}`
        };
      })
      .filter(Boolean);
  }, [hasPackGroups, normalizedPackGroups]);

  const getGroupPlan = useCallback(
    (groupId, labelFallback) => {
      if (singleBoxMode) {
        const single = safeBoxPlan.groups?.['single-box'];
        if (single) {
          return {
            groupLabel: single.groupLabel || labelFallback || tr('singleBox'),
            boxes: Array.isArray(single.boxes) ? single.boxes : [],
            boxItems: Array.isArray(single.boxItems) ? single.boxItems : [],
            dimension_sets: Array.isArray(single.dimension_sets) ? single.dimension_sets : [],
            dimension_assignments:
              single.dimension_assignments && typeof single.dimension_assignments === 'object'
                ? single.dimension_assignments
                : {}
          };
        }
      }
      const existing = safeBoxPlan.groups?.[groupId];
      if (existing && typeof existing === 'object') {
        return {
          groupLabel: existing.groupLabel || labelFallback || groupId,
          boxes: Array.isArray(existing.boxes) ? existing.boxes : [],
          boxItems: Array.isArray(existing.boxItems) ? existing.boxItems : [],
          dimension_sets: Array.isArray(existing.dimension_sets) ? existing.dimension_sets : [],
          dimension_assignments:
            existing.dimension_assignments && typeof existing.dimension_assignments === 'object'
              ? existing.dimension_assignments
              : {}
        };
      }
      return {
        groupLabel: labelFallback || groupId,
        boxes: [],
        boxItems: [],
        dimension_sets: [],
        dimension_assignments: {}
      };
    },
    [safeBoxPlan.groups]
  );

  const updateBoxPlan = useCallback(
    (nextGroups) => {
      onBoxPlanChange?.({ groups: nextGroups });
    },
    [onBoxPlanChange]
  );

  const applySingleBox = useCallback(() => {
    const makeBox = () => ({
      id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      length_cm: '',
      width_cm: '',
      height_cm: '',
      weight_kg: ''
    });

    const nextGroups = {};
    const usedTokens = new Set();
    const skuByToken = new Map();
    const tokenById = new Map();
    const lookup = new Map();
    skus.forEach((sku, idx) => {
      const token = getSkuToken(sku, idx);
      skuByToken.set(token, sku);
      if (sku?.id) tokenById.set(sku.id, token);
      getSkuCandidateKeys(sku).forEach((key) => {
        if (!lookup.has(key)) lookup.set(key, []);
        lookup.get(key).push(token);
      });
    });

    const ensureGroup = (groupId, label) => {
      if (!nextGroups[groupId]) {
        nextGroups[groupId] = {
          groupLabel: label || groupId,
          boxes: [makeBox()],
          boxItems: [{}]
        };
      }
    };

    const assignSku = (sku, groupId, label) => {
      const qty = Math.max(0, Number(sku.units || 0));
      if (!qty) return;
      const key = sku.sku || sku.asin || sku.id;
      ensureGroup(groupId, label);
      nextGroups[groupId].boxItems[0][key] = qty;
      const token = sku?.id ? tokenById.get(sku.id) : null;
      if (token) usedTokens.add(token);
    };

    if (hasPackGroups) {
      normalizedPackGroups.forEach((group, idx) => {
        const groupId = group.packingGroupId || group.id || `pack-${idx + 1}`;
        const groupLabel = tr('packGroupN', '', { index: idx + 1 });
        const items = Array.isArray(group?.items) ? group.items : [];
        items.forEach((item) => {
          const keys = getItemCandidateKeys(item);
          if (!keys.length) return;
          let matched = null;
          for (const key of keys) {
            const candidates = lookup.get(key) || [];
            const freeToken = candidates.find((token) => !usedTokens.has(token));
            if (!freeToken) continue;
            matched = skuByToken.get(freeToken) || null;
            usedTokens.add(freeToken);
            break;
          }
          if (matched) {
            assignSku(matched, groupId, groupLabel);
          }
        });
      });
    }

    skus.forEach((sku, idx) => {
      const token = getSkuToken(sku, idx);
      if (usedTokens.has(token)) return;
      assignSku(sku, 'ungrouped', tr('allItems'));
    });

    updateBoxPlan(nextGroups);
    setSingleBoxMode(false);
    setActiveBoxByGroup(
      Object.keys(nextGroups).reduce(
        (acc, groupId) => ({
          ...acc,
          [groupId]: 0
        }),
        {}
      )
    );
    setBoxIndexDrafts({});
    setBoxQtyDrafts({});
    setBoxDimDrafts({});
  }, [getItemCandidateKeys, getSkuCandidateKeys, getSkuToken, hasPackGroups, normalizedPackGroups, skus, updateBoxPlan]);

  const preventEnterSubmit = useCallback((event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  }, []);

  const updateGroupPlan = useCallback(
    (groupId, updater, labelFallback) => {
      const current = getGroupPlan(groupId, labelFallback);
      const next = updater(current);
      const nextGroups = { ...(safeBoxPlan.groups || {}), [groupId]: next };
      updateBoxPlan(nextGroups);
    },
    [getGroupPlan, safeBoxPlan.groups, updateBoxPlan]
  );

  const setActiveBoxIndex = useCallback((groupId, idx) => {
    setActiveBoxByGroup((prev) => ({
      ...(prev || {}),
      [groupId]: Math.max(0, Number(idx) || 0)
    }));
  }, []);

  const getBoxDraftKey = useCallback((groupId, skuKey, boxIdx) => {
    return `${groupId}::${skuKey}::${boxIdx}`;
  }, []);

  const getDimDraftKey = useCallback((groupId, boxIdx, field) => {
    return `${groupId}::${boxIdx}::${field}`;
  }, []);
  const getDimSetDraftKey = useCallback((groupId, setId, field) => {
    return `${groupId}::dimset::${setId}::${field}`;
  }, []);
  const setBoxScrollRef = useCallback((groupId, key) => (el) => {
    if (!el) return;
    if (!boxScrollRefs.current[groupId]) {
      boxScrollRefs.current[groupId] = {};
    }
    boxScrollRefs.current[groupId][key] = el;
  }, []);
  const syncBoxScroll = useCallback((groupId, sourceKey) => (event) => {
    const refs = boxScrollRefs.current[groupId];
    if (!refs) return;
    const targetKey = sourceKey === 'top' ? 'bottom' : 'top';
    const target = refs[targetKey];
    if (!target) return;
    const nextLeft = event.currentTarget.scrollLeft;
    if (target.scrollLeft !== nextLeft) {
      target.scrollLeft = nextLeft;
    }
  }, []);

  const deriveDimensionMetaFromBoxes = useCallback((groupId, groupPlan) => {
    const boxes = Array.isArray(groupPlan?.boxes) ? groupPlan.boxes : [];
    const keyToSetId = new Map();
    const sets = [];
    const assignments = {};
    boxes.forEach((box, idx) => {
      const length = Number(box?.length_cm ?? box?.length ?? 0);
      const width = Number(box?.width_cm ?? box?.width ?? 0);
      const height = Number(box?.height_cm ?? box?.height ?? 0);
      if (!length || !width || !height) return;
      const key = `${length}x${width}x${height}`;
      let setId = keyToSetId.get(key);
      if (!setId) {
        setId = `dimset-${groupId}-${keyToSetId.size + 1}`;
        keyToSetId.set(key, setId);
        sets.push({ id: setId, length_cm: length, width_cm: width, height_cm: height });
      }
      const boxId = box?.id || `${groupId}-box-${idx}`;
      assignments[boxId] = setId;
    });
    return { sets, assignments };
  }, []);

  const normalizeDimensionMeta = useCallback(
    (groupId, groupPlan) => {
      const existingSets = Array.isArray(groupPlan?.dimension_sets) ? groupPlan.dimension_sets : [];
      const existingAssignments =
        groupPlan?.dimension_assignments && typeof groupPlan.dimension_assignments === 'object'
          ? groupPlan.dimension_assignments
          : {};
      if (existingSets.length) {
        return { sets: existingSets, assignments: existingAssignments };
      }
      const derived = deriveDimensionMetaFromBoxes(groupId, groupPlan);
      if (derived.sets.length) return derived;
      return {
        sets: [{ id: `dimset-${groupId}-1`, length_cm: '', width_cm: '', height_cm: '' }],
        assignments: {}
      };
    },
    [deriveDimensionMetaFromBoxes]
  );

  const ensureGroupBoxCount = useCallback(
    (groupId, count, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          while (nextBoxes.length < count) {
            nextBoxes.push({
              id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
              length_cm: '',
              width_cm: '',
              height_cm: '',
              weight_kg: ''
            });
            nextItems.push({});
          }
          return { ...current, groupLabel: current.groupLabel || labelFallback, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const addBoxToGroup = useCallback(
    (groupId, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          nextBoxes.push({
            id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            length_cm: '',
            width_cm: '',
            height_cm: '',
            weight_kg: ''
          });
          nextItems.push({});
          return { ...current, groupLabel: current.groupLabel || labelFallback, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const removeBoxFromGroup = useCallback(
    (groupId, boxIndex, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const removedBox = current.boxes?.[boxIndex];
          const removedBoxId = removedBox?.id || `${groupId}-box-${boxIndex}`;
          const nextBoxes = (current.boxes || []).filter((_, idx) => idx !== boxIndex);
          const nextItems = (current.boxItems || []).filter((_, idx) => idx !== boxIndex);
          const nextAssignments = { ...(current.dimension_assignments || {}) };
          delete nextAssignments[removedBoxId];
          return { ...current, boxes: nextBoxes, boxItems: nextItems, dimension_assignments: nextAssignments };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const updateBoxDim = useCallback(
    (groupId, boxIndex, field, value, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const box = { ...(nextBoxes[boxIndex] || {}) };
          const prevValue = box[field];
          if (String(prevValue ?? '') === String(value ?? '')) {
            return current;
          }
          box[field] = value;
          nextBoxes[boxIndex] = box;
          return { ...current, boxes: nextBoxes };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const updateDimensionSet = useCallback(
    (groupId, setId, field, value, labelFallback, seedSet = null, seedAssignments = null) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextAssignments = {
            ...(seedAssignments && Object.keys(current.dimension_assignments || {}).length === 0
              ? seedAssignments
              : current.dimension_assignments || {})
          };
          const nextSets = Array.isArray(current.dimension_sets) ? [...current.dimension_sets] : [];
          let idx = nextSets.findIndex((s) => s.id === setId);
          if (idx < 0) {
            nextSets.push({
              id: setId,
              length_cm: seedSet?.length_cm ?? '',
              width_cm: seedSet?.width_cm ?? '',
              height_cm: seedSet?.height_cm ?? ''
            });
            idx = nextSets.length - 1;
          }
          const prevValue = nextSets[idx]?.[field];
          if (String(prevValue ?? '') === String(value ?? '')) {
            return current;
          }
          const nextSet = { ...nextSets[idx], [field]: value };
          nextSets[idx] = nextSet;
          nextBoxes.forEach((box, boxIdx) => {
            const boxId = box?.id || `${groupId}-box-${boxIdx}`;
            if (nextAssignments[boxId] === setId) {
              nextBoxes[boxIdx] = {
                ...box,
                length_cm: nextSet.length_cm ?? '',
                width_cm: nextSet.width_cm ?? '',
                height_cm: nextSet.height_cm ?? ''
              };
            }
          });
          return {
            ...current,
            boxes: nextBoxes,
            dimension_sets: nextSets,
            dimension_assignments: nextAssignments
          };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const handleBoxDetailsTab = useCallback((event) => {
    if (event.key !== 'Tab') return;
    const container = event.currentTarget.closest('[data-box-details]');
    if (!container) return;
    event.stopPropagation();
    const focusables = Array.from(
      container.querySelectorAll('[data-box-input="1"]')
    ).filter((el) => !el.disabled && el.tabIndex !== -1);
    if (focusables.length === 0) return;
    const currentIndex = focusables.indexOf(event.currentTarget);
    if (currentIndex === -1) return;
    const dir = event.shiftKey ? -1 : 1;
    let nextIndex = currentIndex + dir;
    if (nextIndex < 0) nextIndex = focusables.length - 1;
    if (nextIndex >= focusables.length) nextIndex = 0;
    event.preventDefault();
    const next = focusables[nextIndex];
    next?.focus?.();
  }, []);

  const handleBoxDetailsKeyDown = useCallback(
    (fallback) => (event) => {
      if (event.key === 'Tab') {
        handleBoxDetailsTab(event);
        return;
      }
      fallback?.(event);
    },
    [handleBoxDetailsTab]
  );

  const toggleDimensionAssignment = useCallback(
    (groupId, setId, box, boxIdx, checked, labelFallback, seedSet = null) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextAssignments = { ...(current.dimension_assignments || {}) };
          const nextSets = Array.isArray(current.dimension_sets) ? [...current.dimension_sets] : [];
          if (!nextSets.find((s) => s.id === setId)) {
            nextSets.push({
              id: setId,
              length_cm: seedSet?.length_cm ?? '',
              width_cm: seedSet?.width_cm ?? '',
              height_cm: seedSet?.height_cm ?? ''
            });
          }
          const set = nextSets.find((s) => s.id === setId);
          const boxId = box?.id || `${groupId}-box-${boxIdx}`;
          if (checked) {
            nextAssignments[boxId] = setId;
            nextBoxes[boxIdx] = {
              ...box,
              length_cm: set?.length_cm ?? '',
              width_cm: set?.width_cm ?? '',
              height_cm: set?.height_cm ?? ''
            };
          } else {
            if (nextAssignments[boxId] === setId) {
              delete nextAssignments[boxId];
            }
            nextBoxes[boxIdx] = {
              ...box,
              length_cm: '',
              width_cm: '',
              height_cm: ''
            };
          }
          return {
            ...current,
            boxes: nextBoxes,
            dimension_sets: nextSets,
            dimension_assignments: nextAssignments
          };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const addDimensionSet = useCallback(
    (groupId, labelFallback) => {
      const nextId = `dimset-${groupId}-${Date.now().toString(16)}`;
      updateGroupPlan(
        groupId,
        (current) => {
          const nextSets = Array.isArray(current.dimension_sets) ? [...current.dimension_sets] : [];
          nextSets.push({ id: nextId, length_cm: '', width_cm: '', height_cm: '' });
          return { ...current, dimension_sets: nextSets };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const removeDimensionSet = useCallback(
    (groupId, setId, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const currentSets = Array.isArray(current.dimension_sets) ? current.dimension_sets : [];
          if (currentSets.length <= 1) return current;
          const nextSets = currentSets.filter((set) => set?.id !== setId);
          const nextAssignments = { ...(current.dimension_assignments || {}) };
          const nextBoxes = [...(current.boxes || [])];
          nextBoxes.forEach((box, boxIdx) => {
            const boxId = box?.id || `${groupId}-box-${boxIdx}`;
            if (nextAssignments[boxId] !== setId) return;
            delete nextAssignments[boxId];
            nextBoxes[boxIdx] = {
              ...box,
              length_cm: '',
              width_cm: '',
              height_cm: ''
            };
          });
          return {
            ...current,
            boxes: nextBoxes,
            dimension_sets: nextSets,
            dimension_assignments: nextAssignments
          };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const updateBoxItemQty = useCallback(
    (groupId, boxIndex, skuKey, value, labelFallback, keepZero = false) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          while (nextBoxes.length <= boxIndex) {
            nextBoxes.push({
              id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
              length_cm: '',
              width_cm: '',
              height_cm: '',
              weight_kg: ''
            });
          }
          while (nextItems.length <= boxIndex) {
            nextItems.push({});
          }
          const boxItems = { ...(nextItems[boxIndex] || {}) };
          if (value === null || value === undefined || Number(value) <= 0) {
            if (keepZero) {
              boxItems[skuKey] = 0;
            } else {
              delete boxItems[skuKey];
            }
          } else {
            boxItems[skuKey] = Number(value);
          }
          nextItems[boxIndex] = boxItems;
          return { ...current, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const moveBoxItemQty = useCallback(
    (groupId, fromIdx, toIdx, skuKey, qty, labelFallback, keepZeroFrom = false, keepZeroTo = false) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          while (nextBoxes.length <= Math.max(fromIdx, toIdx)) {
            nextBoxes.push({
              id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
              length_cm: '',
              width_cm: '',
              height_cm: '',
              weight_kg: ''
            });
          }
          while (nextItems.length <= Math.max(fromIdx, toIdx)) {
            nextItems.push({});
          }
          const fromItems = { ...(nextItems[fromIdx] || {}) };
          const toItems = { ...(nextItems[toIdx] || {}) };
          const nextQty = Number(qty || 0);
          if (nextQty <= 0) {
            if (keepZeroTo) {
              toItems[skuKey] = 0;
            } else {
              delete toItems[skuKey];
            }
          } else {
            toItems[skuKey] = nextQty;
          }
          if (keepZeroFrom) {
            fromItems[skuKey] = 0;
          } else {
            delete fromItems[skuKey];
          }
          nextItems[fromIdx] = fromItems;
          nextItems[toIdx] = toItems;
          return { ...current, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  useEffect(() => {
    setActiveBoxByGroup((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      Object.entries(safeBoxPlan.groups || {}).forEach(([groupId, groupPlan]) => {
        const boxes = Array.isArray(groupPlan?.boxes) ? groupPlan.boxes : [];
        const maxIdx = Math.max(0, boxes.length - 1);
        const currentIdxRaw = next[groupId];
        if (currentIdxRaw === undefined || currentIdxRaw === null) return;
        const currentIdx = Number(currentIdxRaw);
        if (!Number.isFinite(currentIdx)) return;
        if (currentIdx > maxIdx) {
          next[groupId] = maxIdx;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [safeBoxPlan.groups]);

  const groupedRows = (() => {
    if (!hasPackGroups) {
      return skus.map((sku) => ({
        type: 'sku',
        sku,
        groupId: 'ungrouped',
        groupLabel: tr('allItems')
      }));
    }
    const tokenToSku = new Map();
    const lookup = new Map();
    const usedTokens = new Set();
    skus.forEach((sku, idx) => {
      const token = getSkuToken(sku, idx);
      tokenToSku.set(token, sku);
      getSkuCandidateKeys(sku).forEach((key) => {
        if (!lookup.has(key)) lookup.set(key, []);
        lookup.get(key).push(token);
      });
    });
    const rows = [];
    normalizedPackGroups.forEach((group, idx) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      if (!items.length) return;
      const groupId = group.packingGroupId || group.id || `pack-${idx + 1}`;
      rows.push({
        type: 'group',
        label: tr('packGroupN', '', { index: idx + 1 }),
        subtitle: tr('itemsBelowPackedTogether'),
        key: groupId,
        groupId
      });
      items.forEach((it) => {
        const keys = getItemCandidateKeys(it);
        let matched = null;
        let matchedToken = null;
        for (const key of keys) {
          const candidates = lookup.get(key) || [];
          const freeToken = candidates.find((token) => !usedTokens.has(token));
          if (!freeToken) continue;
          matched = tokenToSku.get(freeToken) || null;
          matchedToken = freeToken;
          break;
        }
        if (matched && matchedToken) {
          usedTokens.add(matchedToken);
          rows.push({
            type: 'sku',
            sku: matched,
            key: matched.id,
            groupId,
            groupLabel: tr('packGroupN', '', { index: idx + 1 })
          });
        }
      });
    });
    const unassigned = skus.filter((sku, idx) => !usedTokens.has(getSkuToken(sku, idx)));
    if (unassigned.length) {
      rows.push({ type: 'group', label: tr('unassigned'), key: 'pack-unassigned', groupId: 'pack-unassigned' });
      unassigned.forEach((sku) =>
        rows.push({
          type: 'sku',
          sku,
          key: sku.id,
          groupId: 'pack-unassigned',
          groupLabel: tr('unassigned')
        })
      );
    }
    return rows;
  })();

  const planGroupsForDisplay = useMemo(() => {
    if (singleBoxMode) {
      return [{ groupId: 'single-box', label: tr('singleBox') }];
    }
    const groupRows = groupedRows
      .filter((row) => row.type === 'group')
      .map((row) => ({
        groupId: row.groupId || row.key || row.label,
        label: row.label || 'Pack'
      }));
    if (groupRows.length) return groupRows;
    return packGroupMeta;
  }, [groupedRows, packGroupMeta, singleBoxMode]);

  const skuGroupMap = useMemo(() => {
    if (singleBoxMode) {
      const map = new Map();
      groupedRows.forEach((row) => {
        if (row.type === 'sku') {
          map.set(row.sku.id, { groupId: 'single-box', groupLabel: tr('singleBox') });
        }
      });
      return map;
    }
    const map = new Map();
    groupedRows.forEach((row) => {
      if (row.type === 'sku') {
        map.set(row.sku.id, {
          groupId: row.groupId || 'ungrouped',
          groupLabel: row.groupLabel || tr('allItems')
        });
      }
    });
    return map;
  }, [groupedRows, singleBoxMode]);

  const boxPlanValidation = useMemo(() => {
    const issues = [];
    if (!hasUnits) {
      return { isValid: true, messages: issues };
    }
    if (allowNoInboundPlan && missingInboundPlan) {
      return { isValid: true, messages: [] };
    }
    let missingBoxes = 0;
    let missingAssignments = 0;
    let missingDims = 0;
    let emptyBoxes = 0;
    let overweight = 0;
    let oversize = 0;

    skus.forEach((sku) => {
      const units = Number(sku.units || 0);
      if (units <= 0) return;
      const groupInfo = skuGroupMap.get(sku.id) || { groupId: 'ungrouped', groupLabel: tr('allItems') };
      const groupPlan = getGroupPlan(groupInfo.groupId, groupInfo.groupLabel);
      const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
      const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
      if (!boxes.length) {
        missingBoxes += 1;
        return;
      }
      const skuKey = String(sku.sku || sku.asin || sku.id);
      const assignedTotal = boxes.reduce((sum, _, idx) => {
        const perBox = boxItems[idx] || {};
        return sum + Number(perBox[skuKey] || 0);
      }, 0);
      if (assignedTotal !== units) {
        missingAssignments += 1;
      }
    });

    planGroupsForDisplay.forEach((group) => {
      const groupPlan = getGroupPlan(group.groupId, group.label);
      const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
      const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
      boxes.forEach((box, idx) => {
        const length = Number(box?.length_cm || box?.length || 0);
        const width = Number(box?.width_cm || box?.width || 0);
        const height = Number(box?.height_cm || box?.height || 0);
        const weight = Number(box?.weight_kg || box?.weight || 0);
        if (!length || !width || !height || !weight) missingDims += 1;
        const maxDim = Math.max(length, width, height);
        const isOversize = maxDim > MAX_STANDARD_BOX_CM;
        if (weight > MAX_STANDARD_BOX_KG) overweight += 1;
        const items = boxItems[idx] || {};
        const assigned = Object.values(items).reduce((sum, val) => sum + Number(val || 0), 0);
        if (assigned <= 0) emptyBoxes += 1;
        // EU SPD rule: boxes over 63.5 cm are acceptable only when that box contains exactly 1 unit.
        if (isOversize && assigned !== 1) oversize += 1;
      });
    });

    if (missingBoxes) issues.push(tr('validationMissingBoxes'));
    if (missingAssignments) issues.push(tr('validationMissingAssignments'));
    if (missingDims) issues.push(tr('validationMissingDims'));
    if (emptyBoxes) issues.push(tr('validationEmptyBoxes'));
    if (overweight) issues.push(tr('validationOverweight', '', { kg: MAX_STANDARD_BOX_KG }));
    if (oversize) {
      issues.push(tr('validationOversize', '', { cm: MAX_STANDARD_BOX_CM }));
    }

    return { isValid: issues.length === 0, messages: issues };
  }, [
    hasUnits,
    skus,
    skuGroupMap,
    getGroupPlan,
    planGroupsForDisplay,
    MAX_STANDARD_BOX_CM,
    MAX_STANDARD_BOX_KG,
    tr
  ]);

  const continueDisabled =
    hasBlocking ||
    saving ||
    (missingInboundPlan && !allowNoInboundPlan) ||
    !requestId ||
    !hasUnits ||
    !boxPlanValidation.isValid ||
    (loadingPlan && skus.length === 0);

  const renderSkuRow = (sku, groupId = 'ungrouped', groupLabel = tr('allItems')) => {
    const status = statusForSku(sku);
    const state = String(status.state || '').toLowerCase();
    const prepSelection = prepSelections[sku.id] || {};
    const labelOwner =
      sku.labelOwner ||
      (prepSelection.useManufacturerBarcode === true
        ? 'NONE'
        : sku.manufacturerBarcodeEligible === false
          ? 'SELLER'
          : null);
    const labelOwnerSource = sku.labelOwnerSource || 'unknown';
    const labelRequired = labelOwner && labelOwner !== 'NONE';
    const showLabelButton =
      (labelRequired || labelOwner === null) &&
      (['amazon-override', 'prep-guidance'].includes(labelOwnerSource) || true);
    const prepList = formatPrepList(sku.prepInstructions || sku.prepNotes || []);
    const needsPrepNotice =
      sku.prepRequired || prepList.length > 0 || sku.manufacturerBarcodeEligible === false;
    const prepNeedsAction = prepList.length > 0 || sku.prepRequired;
    const prepNoticeClass = prepNeedsAction ? 'text-xs text-red-700' : 'text-xs text-emerald-700';
    const prepNoticeText = prepList.length
      ? tr('prepRequired', '', { list: prepList.join(', ') })
      : (sku.prepRequired ? tr('prepSetNeeded') : tr('prepSetNone'));
    const prepResolved = prepSelection.resolved;
    const needsExpiry = Boolean(sku.expiryRequired);
    const badgeClass =
      state === 'ok'
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
        : state === 'missing' || state === 'restricted'
          ? 'text-red-700 bg-red-50 border-red-200'
          : state === 'inactive'
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-slate-600 bg-slate-100 border-slate-200';

    const badgeLabel =
      state === 'ok'
        ? tr('statusEligible')
        : state === 'missing'
          ? tr('statusListingMissing')
          : state === 'inactive'
            ? tr('statusListingInactive')
            : state === 'restricted'
              ? tr('statusRestricted')
              : tr('statusUnknown');

    const skuKey = String(sku.sku || sku.asin || sku.id);
    const groupPlan = getGroupPlan(groupId, groupLabel);
    const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
    const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
    const assignedTotal = boxes.reduce((sum, _, idx) => {
      const perBox = boxItems[idx] || {};
      return sum + Number(perBox[skuKey] || 0);
    }, 0);
    const assignedMismatch = Number(sku.units || 0) !== assignedTotal && Number(sku.units || 0) > 0;
    const assignedEntries = boxes
      .map((_, idx) => ({
        boxIdx: idx,
        qty: Number((boxItems[idx] || {})[skuKey] || 0),
        hasKey: Object.prototype.hasOwnProperty.call(boxItems[idx] || {}, skuKey)
      }))
      .filter((entry) => entry.qty > 0 || entry.hasKey);
    const maxBoxIndex = Math.max(0, boxes.length - 1);
    const activeIndexRaw = activeBoxByGroup[groupId];
    const activeIndex =
      activeIndexRaw === undefined || activeIndexRaw === null
        ? Math.max(maxBoxIndex, 0)
        : Math.min(Math.max(0, Number(activeIndexRaw) || 0), Math.max(maxBoxIndex, 0));

    const servicesForSku = Array.isArray(skuServicesById?.[sku.id]) ? skuServicesById[sku.id] : [];
    const canRecheckAssignment = typeof onRecheckAssignment === 'function' && (groupLabel === tr('unassigned') || state === 'unknown');
    const isRechecking = recheckingSkuId === sku.id;
    const skuReqKey = normalizeKey(sku?.sku || sku?.msku || sku?.SellerSKU || sku?.sellerSku || sku?.asin || sku?.id || '');
    const listingAttrReq = listingAttrRequirementsBySku.get(skuReqKey) || null;
    const listingProblemMessages = [
      ...(operationProblemsBySkuKey.get(normalizeKey(sku?.sku)) || []),
      ...(operationProblemsBySkuKey.get(normalizeKey(sku?.asin)) || []),
      ...(operationProblemsBySkuKey.get(normalizeKey(sku?.fnsku)) || [])
    ];
    const listingProblem = listingProblemMessages.length ? listingProblemMessages[0] : '';
    const listingDraft = listingAttrDraftsBySku[skuReqKey] || { length_cm: '', width_cm: '', height_cm: '', weight_kg: '' };
    const listingSaving = Boolean(listingAttrSavingBySku[skuReqKey]);
    const listingError = listingAttrErrorBySku[skuReqKey] || '';
    const normalizedListingPayload = {
      length_cm: parsePositiveLocalizedDecimal(listingDraft.length_cm),
      width_cm: parsePositiveLocalizedDecimal(listingDraft.width_cm),
      height_cm: parsePositiveLocalizedDecimal(listingDraft.height_cm),
      weight_kg: parsePositiveLocalizedDecimal(listingDraft.weight_kg)
    };
    const hasRequiredDimensions =
      !listingAttrReq?.needsDimensions ||
      (normalizedListingPayload.length_cm && normalizedListingPayload.width_cm && normalizedListingPayload.height_cm);
    const hasRequiredWeight = !listingAttrReq?.needsWeight || normalizedListingPayload.weight_kg;
    const hasRequiredListingAttrs = Boolean(hasRequiredDimensions && hasRequiredWeight);
    const lastSubmittedListingAttrs = listingAttrLastSubmittedBySku[skuReqKey] || null;
    const listingFieldsToCompare = [
      ...(listingAttrReq?.needsDimensions ? ['length_cm', 'width_cm', 'height_cm'] : []),
      ...(listingAttrReq?.needsWeight ? ['weight_kg'] : [])
    ];
    const hasListingAttrChanges =
      !lastSubmittedListingAttrs ||
      listingFieldsToCompare.some((field) => normalizedListingPayload[field] !== lastSubmittedListingAttrs[field]);
    const canSubmitListingAttrs = Boolean(
      listingAttrReq && !listingSaving && hasRequiredListingAttrs && hasListingAttrChanges
    );
    const unitsPerBox = parsePositiveInteger(sku.unitsPerBox);
    const normalizedPackingType = normalizePackingType(sku.packing);
    const isCasePacked = normalizedPackingType === PACKING_TYPE.CASE || !!unitsPerBox;
    const computedBoxesCount = unitsPerBox
      ? Math.max(1, parsePositiveInteger(sku.boxesCount) || Math.ceil((Number(sku.units || 0) || 0) / unitsPerBox) || 1)
      : null;
    const effectiveUnits = Number(sku.units || 0) || 0;
    return (
      <tr key={sku.id} className="align-top">
        <td className="py-3 w-[320px] min-w-[320px]">
          <div className="flex gap-3">
            <img
              src={sku.image || placeholderImg}
              alt={sku.title}
              className="w-12 h-12 object-contain border border-slate-200 rounded"
            />
            <div>
              <div className="font-semibold text-slate-900 hover:text-blue-700 cursor-pointer">
                {sku.title}
              </div>
              <div className="text-xs text-slate-500">{tr('skuLabelShort')}: {sku.sku}</div>
              <div className="text-xs text-slate-500">ASIN: {sku.asin}</div>
              <div className="text-xs text-slate-500">{tr('storageLabel')}: {sku.storageType}</div>
              <div className={`mt-2 inline-flex items-center gap-2 text-xs border px-2 py-1 rounded ${badgeClass}`}>
                {badgeLabel}
                {status.reason ? <span className="text-slate-500">· {status.reason}</span> : null}
              </div>
              {listingProblem ? (
                <div className="mt-1 text-xs text-red-700 font-medium">{listingProblem}</div>
              ) : null}
            </div>
          </div>
        </td>
        <td className="py-3">
          <select
            value={sku.packingTemplateName || sku.packing || 'individual'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__template__') {
                openPackingModal(sku);
                return;
              }
              const template = templates.find(
                (t) => t.name === val && (t.sku === sku.sku || (t.asin && t.asin === sku.asin))
              );
              if (template) {
                const templateUnits = parsePositiveInteger(template.units_per_box);
                const normalizedTemplateType = normalizePackingType(template.template_type);
                const nextBoxes = templateUnits
                  ? Math.max(1, Math.ceil((Number(sku.units || 0) || 0) / templateUnits))
                  : null;
                onChangePacking(sku.id, {
                  packing: normalizedTemplateType,
                  packingTemplateId: template.id,
                  packingTemplateName: template.name,
                  unitsPerBox: templateUnits,
                  boxesCount: nextBoxes,
                  boxLengthCm: template.box_length_cm ?? null,
                  boxWidthCm: template.box_width_cm ?? null,
                  boxHeightCm: template.box_height_cm ?? null,
                  boxWeightKg: template.box_weight_kg ?? null
                });
                return;
              }
              onChangePacking(sku.id, {
                packing: val,
                packingTemplateId: null,
                packingTemplateName: null,
                unitsPerBox: null,
                boxesCount: null,
                boxLengthCm: null,
                boxWidthCm: null,
                boxHeightCm: null,
                boxWeightKg: null
              });
            }}
            className="border rounded-md px-3 py-2 text-sm w-full"
          >
            {templates
              .filter((t) => t.sku === sku.sku || (t.asin && t.asin === sku.asin))
              .map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            <option value="individual">{tr('optionIndividualUnits')}</option>
            <option value="case">{tr('optionCasePacked')}</option>
            <option value="single_sku_pallet">{tr('optionSingleSkuPallet')}</option>
            <option value="__template__">{tr('optionCreatePackingTemplate')}</option>
          </select>
        </td>
        <td className="py-3">
          <div className="space-y-1">
            {labelOwner && (
              <div className="text-xs text-slate-500">
                {tr('labelOwner')}: <span className="font-semibold">{labelOwner}</span>
              </div>
            )}
            {needsPrepNotice && (
              <div className={prepNoticeClass}>
                {prepNoticeText}
              </div>
            )}
            {needsExpiry && <div className="text-xs text-amber-700">{tr('expirationDateRequired')}</div>}
            <div className="flex flex-col items-start gap-1">
              {showLabelButton && (
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => openLabelModal(sku)}
                >
                  {tr('printSkuLabels')}
                </button>
              )}
              <button
                className="text-xs text-blue-600 underline"
                onClick={() => openPrepModal(sku, sku.manufacturerBarcodeEligible !== false)}
              >
                {tr('moreInputs')}
              </button>
              {canRecheckAssignment && (
                <button
                  className="text-xs text-amber-700 underline disabled:opacity-60"
                  disabled={isRechecking}
                  onClick={async () => {
                    try {
                      setRecheckingSkuId(sku.id);
                      await onRecheckAssignment?.(sku);
                    } finally {
                      setRecheckingSkuId('');
                    }
                  }}
                >
                  {isRechecking ? tr('rechecking') : tr('recheckAssign')}
                </button>
              )}
            </div>
            {sku.readyToPack && (
              <div className="mt-2 flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                <CheckCircle className="w-4 h-4" /> {tr('readyToPack')}
              </div>
            )}
            {sku.packingTemplateName && (
              <div className="text-[11px] text-slate-600">
                {tr('templateLabel')}: <span className="font-semibold">{sku.packingTemplateName}</span>
                {unitsPerBox ? ` · ${tr('unitsPerBoxShort')}: ${unitsPerBox}` : ''}
              </div>
            )}
            {!sku.packingTemplateName && isCasePacked && unitsPerBox && (
              <div className="text-[11px] text-slate-600">
                {tr('casePackUnitsPerBox')}: <span className="font-semibold">{unitsPerBox}</span>
              </div>
            )}
            {!sku.packingTemplateName && normalizedPackingType === PACKING_TYPE.SINGLE_SKU_PALLET && (
              <div className="text-[11px] text-slate-600">{tr('optionSingleSkuPallet')}</div>
            )}
            {listingAttrReq && (
              <div className="mt-2 p-2 border border-amber-200 rounded-md bg-amber-50 space-y-2">
                <div className="text-[11px] font-semibold text-amber-800">
                  {tr('amazonNeedsPackageAttrs')}
                </div>
                {listingAttrReq.needsDimensions && (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={tr('dimLcmPlaceholder')}
                      value={listingDraft.length_cm}
                      onChange={(e) =>
                        setListingAttrDraftsBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: {
                            ...(prev?.[skuReqKey] || {}),
                            length_cm: e.target.value
                          }
                        }))
                      }
                      className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                    />
                    <span className="text-slate-400 text-[10px]">x</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={tr('dimWcmPlaceholder')}
                      value={listingDraft.width_cm}
                      onChange={(e) =>
                        setListingAttrDraftsBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: {
                            ...(prev?.[skuReqKey] || {}),
                            width_cm: e.target.value
                          }
                        }))
                      }
                      className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                    />
                    <span className="text-slate-400 text-[10px]">x</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={tr('dimHcmPlaceholder')}
                      value={listingDraft.height_cm}
                      onChange={(e) =>
                        setListingAttrDraftsBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: {
                            ...(prev?.[skuReqKey] || {}),
                            height_cm: e.target.value
                          }
                        }))
                      }
                      className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                    />
                  </div>
                )}
                {listingAttrReq.needsWeight && (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={tr('weightKg')}
                    value={listingDraft.weight_kg}
                    onChange={(e) =>
                      setListingAttrDraftsBySku((prev) => ({
                        ...(prev || {}),
                        [skuReqKey]: {
                          ...(prev?.[skuReqKey] || {}),
                          weight_kg: e.target.value
                        }
                      }))
                    }
                    className="w-24 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                  />
                )}
                <button
                  type="button"
                  disabled={!canSubmitListingAttrs}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-2 py-1 rounded"
                  onClick={async () => {
                    try {
                      setListingAttrErrorBySku((prev) => ({ ...(prev || {}), [skuReqKey]: '' }));
                      setListingAttrSavingBySku((prev) => ({ ...(prev || {}), [skuReqKey]: true }));
                      const payload = { ...normalizedListingPayload };
                      if (listingAttrReq.needsDimensions) {
                        const l = Number(payload.length_cm || 0);
                        const w = Number(payload.width_cm || 0);
                        const h = Number(payload.height_cm || 0);
                        if (!(l > 0 && w > 0 && h > 0)) {
                          throw new Error(tr('completeProductDimensions'));
                        }
                      }
                      if (listingAttrReq.needsWeight) {
                        const weight = Number(payload.weight_kg || 0);
                        if (!(weight > 0)) {
                          throw new Error(tr('completeProductWeight'));
                        }
                      }
                      if (typeof onSubmitListingAttributes === 'function') {
                        await onSubmitListingAttributes(sku?.sku || skuReqKey, payload);
                        setListingAttrLastSubmittedBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: payload
                        }));
                      }
                    } catch (e) {
                      setListingAttrErrorBySku((prev) => ({
                        ...(prev || {}),
                        [skuReqKey]: e?.message || tr('couldNotSendAttrs')
                      }));
                    } finally {
                      setListingAttrSavingBySku((prev) => ({ ...(prev || {}), [skuReqKey]: false }));
                    }
                  }}
                >
                  {listingSaving ? tr('sending') : tr('sendProductAttrs')}
                </button>
                {!listingSaving && !hasListingAttrChanges ? (
                  <div className="text-[11px] text-slate-600">{tr('noChangesToSend')}</div>
                ) : null}
                {listingError ? <div className="text-[11px] text-red-700">{listingError}</div> : null}
              </div>
            )}
          </div>
        </td>
        <td className="py-3">
          <div className="flex flex-col gap-2">
            {isCasePacked && unitsPerBox ? (
              <div className="grid grid-cols-[72px_12px_72px] items-center gap-2">
                <input
                  type="number"
                  className="w-[72px] border rounded-md px-2 py-1 text-sm"
                  value={computedBoxesCount || 0}
                  min={0}
                  onKeyDown={preventEnterSubmit}
                  onChange={(e) => {
                    const nextBoxes = Math.max(0, parsePositiveInteger(e.target.value) || 0);
                    const nextUnits = nextBoxes * unitsPerBox;
                    onChangePacking?.(sku.id, { boxesCount: nextBoxes || null });
                    onChangeQuantity(sku.id, nextUnits);
                  }}
                />
                <span className="text-slate-400 text-xs text-center">=</span>
                <input
                  type="number"
                  className="w-[72px] border rounded-md px-2 py-1 text-sm bg-slate-100 text-slate-600"
                  value={effectiveUnits}
                  min={0}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2 py-1 border rounded-md text-sm"
                  onClick={() => onChangeQuantity(sku.id, Math.max(0, Number(sku.units || 0) - 1))}
                >
                  -
                </button>
                <input
                  type="number"
                  className="w-16 border rounded-md px-2 py-1 text-sm"
                  value={sku.units || 0}
                  min={0}
                  onKeyDown={preventEnterSubmit}
                  onChange={(e) => onChangeQuantity(sku.id, Number(e.target.value || 0))}
                />
                <button
                  type="button"
                  className="px-2 py-1 border rounded-md text-sm"
                  onClick={() => onChangeQuantity(sku.id, Number(sku.units || 0) + 1)}
                >
                  +
                </button>
              </div>
            )}
            {needsExpiry && (
              <input
                type="date"
                value={sku.expiryDate || sku.expiry || ''}
                onChange={(e) => onChangeExpiry(sku.id, e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              />
            )}
            <button
              type="button"
              className="self-start text-xs text-red-600 underline"
              onClick={() => onRemoveSku?.(sku.id)}
            >
              {tr('removeListing')}
            </button>
            <div className="border border-slate-200 rounded-md p-2 bg-slate-50">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>{tr('boxes')}</span>
                <button
                  className="text-blue-600 underline"
                  type="button"
                  onClick={() => {
                    const currentCount = Math.max(0, boxes.length);
                    const hasAssignments = assignedEntries.length > 0;
                    const clampedActive = currentCount > 0 ? Math.max(0, Math.min(activeIndex, currentCount - 1)) : activeIndex;
                    const targetIdx = hasAssignments ? currentCount : clampedActive;
                    updateBoxItemQty(groupId, targetIdx, skuKey, 0, groupLabel, true);
                    setActiveBoxIndex(groupId, targetIdx);
                  }}
                >
                  {tr('addBox', '+ Add box')}
                </button>
              </div>
              {assignedEntries.length === 0 && boxes.length === 0 && (
                <div className="text-xs text-slate-500 mt-1">{tr('noBoxesAssignedYet')}</div>
              )}
              {(
                assignedEntries.length > 0
                  ? assignedEntries
                  : boxes.length
                    ? [{ boxIdx: activeIndex, qty: 0, hasKey: true, isPlaceholder: true }]
                    : []
              ).map((entry) => {
                const draftKey = getBoxDraftKey(groupId, skuKey, entry.boxIdx);
                const draftValue = boxIndexDrafts[draftKey];
                const boxInputValue = draftValue === undefined || draftValue === null ? entry.boxIdx + 1 : draftValue;
                const commitBoxIndexChange = () => {
                  const raw = Number(boxInputValue || 0);
                  if (!raw || raw < 1) {
                    setBoxIndexDrafts((prev) => {
                      const next = { ...(prev || {}) };
                      delete next[draftKey];
                      return next;
                    });
                    return;
                  }
                  const nextIdx = raw - 1;
                  if (nextIdx === entry.boxIdx) {
                    setBoxIndexDrafts((prev) => {
                      const next = { ...(prev || {}) };
                      delete next[draftKey];
                      return next;
                    });
                    return;
                  }
                  moveBoxItemQty(
                    groupId,
                    entry.boxIdx,
                    nextIdx,
                    skuKey,
                    entry.qty,
                    groupLabel,
                    entry.hasKey || entry.isPlaceholder,
                    true
                  );
                  setActiveBoxIndex(groupId, nextIdx);
                  setBoxIndexDrafts((prev) => {
                    const next = { ...(prev || {}) };
                    delete next[draftKey];
                    return next;
                  });
                };
                return (
                <div key={`${skuKey}-box-${entry.boxIdx}`} className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">{tr('box')}</span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={boxInputValue}
                    onChange={(e) => {
                      setBoxIndexDrafts((prev) => ({
                        ...(prev || {}),
                        [draftKey]: e.target.value
                      }));
                    }}
                    onBlur={commitBoxIndexChange}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitBoxIndexChange();
                        event.currentTarget.blur();
                        return;
                      }
                      preventEnterSubmit(event);
                    }}
                    className="w-16 border rounded-md px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-slate-500">{tr('units')}</span>
                  {(() => {
                    const qtyDraftKey = `${groupId}::${skuKey}::${entry.boxIdx}::qty`;
                    const draftValue = boxQtyDrafts[qtyDraftKey];
                    const inputValue =
                      draftValue !== undefined && draftValue !== null ? draftValue : entry.qty;
                    const commitBoxQtyChange = () => {
                      const raw = String(boxQtyDrafts[qtyDraftKey] ?? '').trim();
                      const num = raw === '' ? 0 : Number(raw);
                      const nextValue = Number.isFinite(num) ? num : 0;
                      updateBoxItemQty(groupId, entry.boxIdx, skuKey, nextValue, groupLabel, entry.hasKey);
                      setBoxQtyDrafts((prev) => {
                        const next = { ...(prev || {}) };
                        delete next[qtyDraftKey];
                        return next;
                      });
                    };
                    return (
                  <input
                    type="number"
                    min={0}
                    value={inputValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBoxQtyDrafts((prev) => ({
                        ...(prev || {}),
                        [qtyDraftKey]: val
                      }));
                    }}
                    onBlur={commitBoxQtyChange}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitBoxQtyChange();
                        event.currentTarget.blur();
                        return;
                      }
                      preventEnterSubmit(event);
                    }}
                    className="w-16 border rounded-md px-2 py-1 text-xs"
                  />
                    );
                  })()}
                  <button
                    className="text-xs text-red-600"
                    type="button"
                    onClick={() => updateBoxItemQty(groupId, entry.boxIdx, skuKey, 0, groupLabel)}
                    title={tr('remove')}
                  >
                    ✕
                  </button>
                </div>
              );
              })}
              <div className={`text-xs mt-2 ${assignedMismatch ? 'text-amber-700' : 'text-slate-500'}`}>
                {tr('assigned')}: {assignedTotal} / {Number(sku.units || 0)}
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 w-[320px] min-w-[320px]">
          <div className="space-y-2 w-[320px] min-w-[320px] max-w-[320px]">
            {servicesForSku.length === 0 && (
              <div className="text-xs text-slate-500">{tr('noServicesSelected')}</div>
            )}
            {servicesForSku.map((svc, idx) => {
              const total = Number(svc.unit_price || 0) * Number(svc.units || 0);
              const usedNames = new Set(
                servicesForSku
                  .map((entry, j) => (j === idx ? null : String(entry?.service_name || '')))
                  .filter(Boolean)
              );
              const availableOptions = serviceOptionsByCategory
                .map(([category, options]) => [
                  category,
                  options.filter((opt) => !usedNames.has(String(opt.service_name || '')))
                ])
                .filter(([, options]) => options.length > 0);
              return (
                <div
                  key={svc?._local_id || `${sku.id}-svc-${idx}`}
                  className="border border-slate-200 rounded-md p-2 w-full"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      className="border rounded-md px-2 py-1 text-xs flex-1 min-w-0 w-full whitespace-normal break-words"
                      value={svc.service_name || ''}
                      onChange={(e) => {
                        const selected = serviceOptions.find((opt) => opt.service_name === e.target.value);
                        if (!selected) return;
                        handleSkuServiceChange(sku.id, idx, {
                          service_id: selected.id,
                          service_name: selected.service_name,
                          unit_price: Number(selected.price || 0)
                        });
                        schedulePersist();
                      }}
                    >
                      {availableOptions.map(([category, options]) => (
                        <optgroup key={category} label={category}>
                          {options.map((opt) => (
                            <option key={opt.id || opt.service_name} value={opt.service_name}>
                              {opt.service_name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => handleRemoveSkuService(sku.id, idx)}
                    >
                      {tr('remove')}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <span>{tr('unit')}</span>
                      <span className="font-semibold">{Number(svc.unit_price || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{tr('qty')}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="w-16 border rounded-md px-2 py-1 text-xs text-right"
                        value={svc.units ?? 0}
                        onChange={(e) => {
                          handleSkuServiceChange(sku.id, idx, { units: Number(e.target.value || 0) });
                          schedulePersist();
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{tr('total')}</span>
                      <span className="font-semibold">{Number.isFinite(total) ? total.toFixed(2) : '0.00'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {serviceOptions.length > servicesForSku.length ? (
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={() => {
                  handleAddSkuService(sku);
                  schedulePersist();
                }}
              >
                {tr('addService')}
              </button>
            ) : (
              <div className="text-[11px] text-slate-500">{tr('allServicesAdded')}</div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderIgnoredSkuRow = (item, idx) => {
    const itemId = item?.id || `ignored-${idx + 1}`;
    const title = item?.product_name || `Line ${idx + 1}`;
    const asin = item?.asin || '—';
    const units = Number(item?.units || 0) || 0;
    const reason = item?.reason || tr('skuMissing');
    return (
      <tr key={`ignored-${itemId}`} className="align-top bg-slate-50 opacity-80">
        <td className="py-3 w-[320px] min-w-[320px]">
          <div className="flex gap-3">
            <img
              src={placeholderImg}
              alt={title}
              className="w-12 h-12 object-contain border border-slate-200 rounded"
            />
            <div>
              <div className="font-semibold text-slate-900">{title}</div>
              <div className="text-xs text-slate-500">{tr('skuMissing')}</div>
              <div className="text-xs text-slate-500">ASIN: {asin}</div>
              <div className="mt-2 inline-flex items-center gap-2 text-xs border px-2 py-1 rounded text-amber-800 bg-amber-50 border-amber-200">
                {tr('ignored')}
                <span className="text-slate-500">· {reason}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 text-xs text-slate-500">{tr('blockedUntilSkuCompleted')}</td>
        <td className="py-3 text-xs text-slate-500">{tr('excludedFromStep1bShipping')}</td>
        <td className="py-3">
          <div className="text-sm text-slate-600">{units}</div>
        </td>
        <td className="py-3 w-[320px] min-w-[320px]">
          <div className="text-xs text-slate-500">{tr('servicesLockedIgnored')}</div>
        </td>
      </tr>
    );
  };

  // Prefill prep selections as "No prep needed" for all SKUs (Amazon expects a choice).
  useEffect(() => {
    setPrepSelections((prev) => {
      const next = { ...prev };
      skus.forEach((sku) => {
        if (!next[sku.id]) {
          next[sku.id] = {
            resolved: true,
            prepCategory: 'none',
            useManufacturerBarcode: false,
            manufacturerBarcodeEligible: sku.manufacturerBarcodeEligible !== false
          };
        }
      });
      return next;
    });
  }, [skus]);

  const openPackingModal = (sku) => {
    setTemplateError('');
    const currentUnitsPerBox = parsePositiveInteger(sku?.unitsPerBox);
    setPackingModal({
      open: true,
      sku,
      templateType: normalizePackingType(sku?.packing || sku?.packingTemplateType || null),
      unitsPerBox: currentUnitsPerBox ? String(currentUnitsPerBox) : '',
      boxL: sku?.boxLengthCm ? String(sku.boxLengthCm) : '',
      boxW: sku?.boxWidthCm ? String(sku.boxWidthCm) : '',
      boxH: sku?.boxHeightCm ? String(sku.boxHeightCm) : '',
      boxWeight: sku?.boxWeightKg ? String(sku.boxWeightKg) : '',
      templateName: sku?.packingTemplateName || ''
    });
  };

  const closePackingModal = () => setPackingModal((prev) => ({ ...prev, open: false, sku: null }));

  const savePackingTemplate = async () => {
    if (!packingModal.sku) return;
    setTemplateError('');
    const derivedName =
      packingModal.templateName || (packingModal.unitsPerBox ? `${tr('packPrefix')} ${packingModal.unitsPerBox}` : '');
    if (!derivedName) {
      setTemplateError(tr('setNameOrUnitsTemplate'));
      return;
    }

    const templateType = normalizePackingType(packingModal.templateType);
    const unitsPerBox = parsePositiveInteger(packingModal.unitsPerBox);
    if (templateType === PACKING_TYPE.CASE && !unitsPerBox) {
      setTemplateError(tr('unitsPerBoxGreaterThanZero'));
      return;
    }
    const boxLengthCm = parsePositiveLocalizedDecimal(packingModal.boxL);
    const boxWidthCm = parsePositiveLocalizedDecimal(packingModal.boxW);
    const boxHeightCm = parsePositiveLocalizedDecimal(packingModal.boxH);
    const boxWeightKg = parsePositiveLocalizedDecimal(packingModal.boxWeight);
    const boxesCount = unitsPerBox
      ? Math.max(1, Math.ceil((Number(packingModal.sku.units || 0) || 0) / unitsPerBox))
      : null;
    let savedTemplateId = null;

    // Persist template if we have a name and companyId.
    // Keep modal open on any error so user can continue editing.
    if (!data?.companyId) {
      setTemplateError(tr('missingCompanyIdTemplate'));
      return;
    }
    try {
      const payload = {
        company_id: data.companyId,
        marketplace_id: marketplaceId,
        sku: packingModal.sku.sku || null,
        asin: packingModal.sku.asin || null,
        name: derivedName,
        template_type: templateType,
        units_per_box: unitsPerBox,
        box_length_cm: boxLengthCm,
        box_width_cm: boxWidthCm,
        box_height_cm: boxHeightCm,
        box_weight_kg: boxWeightKg
      };
      // Avoid relying on DB unique constraint for ON CONFLICT; some environments miss it.
      const { data: existingRow, error: existingErr } = await supabase
        .from('packing_templates')
        .select('id')
        .eq('company_id', payload.company_id)
        .eq('marketplace_id', payload.marketplace_id)
        .eq('sku', payload.sku)
        .eq('name', payload.name)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existingRow?.id) {
        const { data: updatedRow, error: updateErr } = await supabase
          .from('packing_templates')
          .update(payload)
          .eq('id', existingRow.id)
          .select('id')
          .maybeSingle();
        if (updateErr) throw updateErr;
        savedTemplateId = updatedRow?.id || existingRow.id;
      } else {
        const { data: insertedRow, error: insertErr } = await supabase
          .from('packing_templates')
          .insert(payload)
          .select('id')
          .maybeSingle();
        if (insertErr) throw insertErr;
        savedTemplateId = insertedRow?.id || null;
      }
      // Reload templates
      const { data: rows } = await supabase
        .from('packing_templates')
        .select('*')
        .eq('company_id', data.companyId)
        .eq('marketplace_id', marketplaceId);
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setTemplateError(e?.message || tr('couldNotSaveTemplate'));
      return;
    }

    onChangePacking(packingModal.sku.id, {
      packing: templateType,
      packingTemplateId: savedTemplateId,
      packingTemplateName: derivedName || null,
      unitsPerBox,
      boxesCount,
      boxLengthCm,
      boxWidthCm,
      boxHeightCm,
      boxWeightKg
    });
    closePackingModal();
  };

  const openPrepModal = (sku, eligible = true) => {
    setPrepModal({
      open: true,
      sku,
      prepCategory: prepSelections[sku.id]?.prepCategory || '',
      useManufacturerBarcode: prepSelections[sku.id]?.useManufacturerBarcode || false,
      manufacturerBarcodeEligible: eligible
    });
  };

  const closePrepModal = () => setPrepModal((prev) => ({ ...prev, open: false, sku: null }));

  const savePrepModal = () => {
    if (!prepModal.sku) return;
    const patch = {
      resolved: true,
      prepCategory: prepModal.prepCategory || 'none',
      useManufacturerBarcode: prepModal.useManufacturerBarcode,
      manufacturerBarcodeEligible: prepModal.manufacturerBarcodeEligible
    };
    const labelOwnerFromSku = prepModal.sku.labelOwner || null;
    const derivedLabelOwner =
      labelOwnerFromSku ||
      (patch.useManufacturerBarcode
        ? 'NONE'
        : prepModal.sku.manufacturerBarcodeEligible === false
          ? 'SELLER'
          : null);
    const prepOwner = patch.prepCategory && patch.prepCategory !== 'none' ? 'SELLER' : 'NONE';

    setPrepSelections((prev) => ({
      ...prev,
      [prepModal.sku.id]: patch
    }));
    onChangePrep?.(prepModal.sku.id, {
      prepCategory: patch.prepCategory,
      useManufacturerBarcode: patch.useManufacturerBarcode,
      prepOwner,
      labelOwner: derivedLabelOwner
    });
    closePrepModal();
  };

  const openLabelModal = (sku) => {
    const unitsToSend = Math.max(1, Number(sku.units || 0) || 0);
    setLabelModal({
      open: true,
      sku,
      format: 'thermal',
      width: LABEL_PRESETS.thermal.width,
      height: LABEL_PRESETS.thermal.height,
      quantity: unitsToSend
    });
  };

  const closeLabelModal = () => setLabelModal((prev) => ({ ...prev, open: false, sku: null }));

  const handleDownloadLabels = async () => {
    if (!labelModal.sku) return;
    const downloadWindow = window.open('', '_blank', 'noopener');
    setLabelError('');
    setLabelLoading(true);

    try {
      const payload = {
        company_id: data.companyId,
        marketplace_id: marketplaceId,
        items: [
          {
            sku: labelModal.sku.sku,
            asin: labelModal.sku.asin,
            fnsku: labelModal.sku.fnsku,
            quantity: Math.max(1, Number(labelModal.quantity) || 1)
          }
        ]
      };

      const { data: resp, error } = await supabase.functions.invoke('fba-labels', { body: payload });
      if (error) {
        throw new Error(error.message || tr('couldNotRequestLabels'));
      }
      if (resp?.error) {
        throw new Error(resp.error);
      }
      if (resp?.downloadUrl) {
        if (downloadWindow) {
          downloadWindow.location.href = resp.downloadUrl;
        } else {
          window.location.assign(resp.downloadUrl);
        }
        closeLabelModal();
        return;
      }
      if (resp?.operationId) {
        if (downloadWindow) downloadWindow.close();
        setLabelError(tr('labelRequestSentRetry'));
        return;
      }
      if (downloadWindow) downloadWindow.close();
      throw new Error(tr('missingDownloadUrlOrOperationId'));
    } catch (err) {
      if (downloadWindow) downloadWindow.close();
      console.error('fba-labels error', err);
      setLabelError(err?.message || tr('couldNotDownloadLabels'));
    } finally {
      setLabelLoading(false);
    }
  };

  const prepCategoryLabel = (value) => {
    switch (value) {
      case 'fragile':
        return tr('prepFragileGlass');
      case 'liquids':
        return tr('prepLiquidsNonGlass');
      case 'perforated':
        return tr('prepPerforatedPackaging');
      case 'powder':
        return tr('prepPowderPelletsGranular');
      case 'small':
        return tr('prepSmall');
      case 'none':
      default:
        return tr('noPrepNeeded');
    }
  };

  // Load packing templates for this company/marketplace
  useEffect(() => {
    const loadTemplates = async () => {
      if (!data?.companyId) return;
      setLoadingTemplates(true);
      setTemplateError('');
      try {
        const { data: rows, error } = await supabase
          .from('packing_templates')
          .select('*')
          .eq('company_id', data.companyId)
          .eq('marketplace_id', marketplaceId);
        if (error) throw error;
        setTemplates(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setTemplateError(e?.message || tr('couldNotLoadTemplates'));
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, [data?.companyId, marketplaceId]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <div className="font-semibold text-slate-900">{tr('step1Title')}</div>
          <div className="text-sm text-slate-500">
            {tr('skusConfirmedShort', '', { count: skus.length })}
            {ignoredItems.length > 0 ? ` · ${tr('ignoredLinesShort', '', { count: ignoredItems.length })}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md shadow-sm"
            onClick={() => setAddSkuOpen((prev) => !prev)}
          >
            {addSkuOpen ? tr('closeAdd') : tr('addProduct')}
          </button>
        </div>
      </div>
      {addSkuOpen && (
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={addSkuQuery}
              onChange={(e) => setAddSkuQuery(e.target.value)}
              placeholder={tr('searchSkuAsinName')}
              className="border rounded-md px-3 py-2 text-sm w-full md:w-[420px] bg-white"
            />
            <div className="text-xs text-slate-500">{tr('searchInventoryHint')}</div>
            <div className="max-h-56 overflow-auto border border-slate-200 rounded-md bg-white">
              {inventoryLoading && (
                <div className="px-3 py-2 text-xs text-slate-500">{tr('searchingInventory')}</div>
              )}
              {!inventoryLoading && inventoryResults.map((item) => {
                const key = `inventory-${item.id}`;
                const busy = addSkuBusyKey === key;
                const stockQty = Number.isFinite(Number(item?.qty)) ? Number(item.qty) : 0;
                return (
                  <div key={key} className="px-3 py-2 flex items-center justify-between gap-3 border-b last:border-b-0 bg-emerald-50/40">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate">{item.name || item.sku || item.asin}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {tr('skuLabelShort')}: {item.sku || '—'} · {tr('asinLabelShort')}: {item.asin || '—'} · {tr('stockLabelShort')}: {stockQty}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-2 py-1 rounded"
                      onClick={async () => {
                        try {
                          setAddSkuBusyKey(key);
                          await onAddSku?.({
                            source: 'inventory',
                            stockItemId: item.id,
                            sku: item.sku || null,
                            asin: item.asin || null,
                            title: item.name || null,
                            image: item.image_url || null
                          });
                        } finally {
                          setAddSkuBusyKey('');
                        }
                      }}
                    >
                      {tr('add')}
                    </button>
                  </div>
                );
              })}
              {!inventoryLoading && addSkuQuery.trim().length >= 2 && inventoryResults.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500 border-b">{tr('noInventoryResults')}</div>
              )}
              {addSkuCandidates.length > 0 && (
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b">
                  {tr('hiddenInRequest')}
                </div>
              )}
              {addSkuCandidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">{tr('noHiddenProducts')}</div>
              ) : (
                addSkuCandidates.slice(0, 50).map((sku) => (
                  <div key={`add-${sku.id}`} className="px-3 py-2 flex items-center justify-between gap-3 border-b last:border-b-0">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate">{sku.title || sku.product_name || sku.sku || sku.asin}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {tr('skuLabelShort')}: {sku.sku || '—'} · {tr('asinLabelShort')}: {sku.asin || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={addSkuBusyKey === `existing-${sku.id}`}
                      className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-2 py-1 rounded"
                      onClick={async () => {
                        try {
                          const key = `existing-${sku.id}`;
                          setAddSkuBusyKey(key);
                          await onAddSku?.(sku.id);
                        } finally {
                          setAddSkuBusyKey('');
                        }
                      }}
                    >
                      {tr('add')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(error || hasBlocking) && (
        <div
          className={`px-6 py-3 border-b text-sm ${error ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
        >
          {error ||
            (skuEligibilityBlocking
              ? tr('notEligibleBanner')
              : tr('inboundPlanNotReady'))}
        </div>
      )}
      {!error && notice && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          {notice}
        </div>
      )}
      {Array.isArray(operationProblems) && operationProblems.length > 0 && (
        <div className="px-6 py-3 border-b text-sm bg-red-50 text-red-700 border-red-200">
          <div className="font-semibold">{tr('operationIssuesTitle')}</div>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {operationProblems.slice(0, 8).map((p, idx) => {
              return (
                <li key={`op-problem-${idx}`}>
                  {humanizeOperationProblem(p)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {loadingPlan && skus.length === 0 && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          {tr('planStillLoading')}
        </div>
      )}
      {ignoredItems.length > 0 && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          {tr('ignoredLinesNotice', '', { count: ignoredItems.length })}
        </div>
      )}

      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-b border-slate-200">
        <FieldLabel label={tr('shipFromLabel')}>
          <div className="text-slate-800">{shipFrom.name || '—'}</div>
          <div className="text-slate-600 text-sm">{shipFrom.address || '—'}</div>
        </FieldLabel>
        <FieldLabel
          label={tr('marketplaceDestinationCountry')}
          action={
            hasUnits ? (
              <button
                type="button"
                onClick={applySingleBox}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md shadow-sm flex items-center gap-1"
              >
                {tr('addAllUnitsOneBox')}
              </button>
            ) : null
          }
        >
          <select
            value={marketplaceId}
            className="border rounded-md px-3 py-2 text-sm w-full bg-slate-100 text-slate-800"
            disabled
          >
            <option value={marketplaceId}>{marketplaceName}</option>
          </select>
        </FieldLabel>
      </div>

      <div className="px-6 py-4 overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700 table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[320px] min-w-[320px]" />
          </colgroup>
          <thead>
            <tr className="text-left text-slate-500 uppercase text-xs">
              <th className="py-2">{tr('tableSkuDetails')}</th>
              <th className="py-2">{tr('tablePackingDetails')}</th>
              <th className="py-2">{tr('tableInfoAction')}</th>
              <th className="py-2">{tr('tableQuantityToSend')}</th>
              <th className="py-2 text-center w-[320px] min-w-[320px]">{tr('tableServices')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {skus.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">
                  {loadingPlan
                    ? tr('waitingSkusAndShipments')
                    : tr('noSkusToDisplay')}
                </td>
              </tr>
            )}
            {groupedRows.map((row, rowIdx) => {
              if (row.type === 'group') {
                return (
                  <tr key={`group-${row.key}-${rowIdx}`} className="bg-slate-50">
                    <td colSpan={4} className="py-2 text-slate-700 border-t border-slate-200">
                      <div className="font-semibold">{row.label}</div>
                      {row.subtitle && (
                        <div className="text-xs text-slate-500">{row.subtitle}</div>
                      )}
                    </td>
                  </tr>
                );
              }
              if (row.type === 'sku') {
                return renderSkuRow(row.sku, row.groupId, row.groupLabel);
              }
              return null;
            })}
            {ignoredItems.map((item, idx) => renderIgnoredSkuRow(item, idx))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 space-y-4">
        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-800">{tr('boxes')}</div>
            <button
              type="button"
              className="text-xs text-blue-600 underline"
              onClick={() => {
                handleAddBoxService();
                schedulePersist();
              }}
            >
              {tr('addBox', '+ Add box')}
            </button>
          </div>
          {boxServices.length === 0 && (
            <div className="text-xs text-slate-500">{tr('noBoxServicesSelected')}</div>
          )}
          {boxServices.map((svc, idx) => {
            const total = Number(svc.unit_price || 0) * Number(svc.units || 0);
            return (
              <div
                key={svc?._local_id || `box-svc-${idx}`}
                className="flex flex-wrap items-center gap-3 border border-slate-200 rounded-md p-2"
              >
                <select
                  className="border rounded-md px-2 py-1 text-xs min-w-[220px]"
                  value={svc.service_name || ''}
                  onChange={(e) => {
                    const selected = boxOptions.find((opt) => opt.service_name === e.target.value);
                    if (!selected) return;
                    const next = boxServices.map((row, i) =>
                      i === idx
                        ? withLocalId({
                            ...row,
                            service_id: selected.id,
                            service_name: selected.service_name,
                            unit_price: Number(selected.price || 0)
                          })
                        : row
                    );
                    setBoxes(next);
                    schedulePersist();
                  }}
                >
                  {boxOptionsByCategory.map(([category, options]) => (
                    <optgroup key={category} label={category}>
                      {options.map((opt) => (
                        <option key={opt.id || opt.service_name} value={opt.service_name}>
                          {opt.service_name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="text-xs text-slate-600">
                  {tr('unit')} <span className="font-semibold">{Number(svc.unit_price || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <span>{tr('qty')}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="w-16 border rounded-md px-2 py-1 text-xs text-right"
                    value={svc.units ?? 0}
                    onChange={(e) => {
                      const next = boxServices.map((row, i) =>
                        i === idx ? withLocalId({ ...row, units: Number(e.target.value || 0) }) : row
                      );
                      setBoxes(next);
                      schedulePersist();
                    }}
                  />
                </div>
                <div className="text-xs text-slate-600">
                  {tr('total')} <span className="font-semibold">{Number.isFinite(total) ? total.toFixed(2) : '0.00'}</span>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => {
                    const next = boxServices.filter((_, i) => i !== idx);
                    setBoxes(next);
                  }}
                >
                  {tr('remove')}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-semibold text-slate-900">{tr('boxDetailsStep1')}</div>
          {hasUnits && (
            <button
              type="button"
              onClick={applySingleBox}
              className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-3 py-2 rounded-md"
            >
              {tr('putAllInOneBoxRo')}
            </button>
          )}
        </div>
        {planGroupsForDisplay.map((group) => {
          const groupPlan = getGroupPlan(group.groupId, group.label);
          const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
          const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
          const { sets: dimensionSets, assignments: dimensionAssignments } = normalizeDimensionMeta(
            group.groupId,
            groupPlan
          );
          const groupSkus = skus.filter((sku) => {
            const info = skuGroupMap.get(sku.id);
            return (info?.groupId || 'ungrouped') === group.groupId;
          });
          const totalUnits = groupSkus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);
          const boxedUnits = boxItems.reduce((sum, box) => {
            return (
              sum +
              Object.values(box || {}).reduce((acc, val) => acc + Number(val || 0), 0)
            );
          }, 0);
          const showScrollbars = boxes.length > 10;
          const labelColWidth = 260;
          const boxColWidth = 100;
          const tableWidth = labelColWidth + boxes.length * boxColWidth;
          return (
            <div key={group.groupId} className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">{group.label}</div>
              </div>
              {boxes.length === 0 && <div className="text-sm text-slate-500">{tr('noBoxesYet')}</div>}
              {boxes.length > 0 && (
                <div className="border border-slate-200 rounded-md bg-white" data-box-details>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-3 py-2 text-xs text-slate-600 border-b border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-800">{tr('totalSkus')}:</span> {groupSkus.length}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">{tr('unitsBoxed')}:</span> {boxedUnits} {tr('ofWord')} {totalUnits}
                    </div>
                    <div className="text-slate-500">
                      {tr('enterBoxContentsHint')}
                    </div>
                  </div>

                  {showScrollbars && (
                    <div
                      ref={setBoxScrollRef(group.groupId, 'top')}
                      onScroll={syncBoxScroll(group.groupId, 'top')}
                      className="overflow-x-auto border-b border-slate-200"
                    >
                      <div style={{ width: `${tableWidth}px`, height: 12 }} />
                    </div>
                  )}

                  <div
                    ref={setBoxScrollRef(group.groupId, 'bottom')}
                    onScroll={syncBoxScroll(group.groupId, 'bottom')}
                    className="overflow-x-auto"
                  >
                    <table
                      className="min-w-max w-full text-xs border-separate border-spacing-0"
                      style={{ minWidth: `${tableWidth}px` }}
                    >
                      <thead>
                        <tr>
                          <th className="sticky left-0 top-0 z-20 bg-slate-50 border-b border-slate-200 text-left px-3 py-2 w-[260px]">
                            &nbsp;
                          </th>
                          {boxes.map((box, idx) => (
                            <th
                              key={box.id || `${group.groupId}-box-head-${idx}`}
                              className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 py-2 text-center min-w-[100px]"
                            >
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-semibold text-slate-700">{tr('box')} {idx + 1}</span>
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-red-600 text-xs"
                                  onClick={() => removeBoxFromGroup(group.groupId, idx, group.label)}
                                  aria-label={tr('removeBoxNAria', { index: idx + 1 })}
                                >
                                  ×
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="sticky left-0 z-10 bg-white border-b border-slate-200 px-3 py-2">
                            <div className="text-xs font-semibold text-slate-700">{tr('boxWeightKg')}</div>
                          </td>
                          {boxes.map((box, idx) => {
                            const buildKey = (field) => getDimDraftKey(group.groupId, idx, field);
                            const valueForField = (field, fallback) => {
                              const draft = boxDimDrafts[buildKey(field)];
                              return draft !== undefined && draft !== null ? draft : fallback;
                            };
                            const commitDim = (field, rawValue) => {
                              updateBoxDim(group.groupId, idx, field, rawValue, group.label);
                              setBoxDimDrafts((prev) => {
                                const next = { ...(prev || {}) };
                                delete next[buildKey(field)];
                                return next;
                              });
                            };
                            const handleDimKeyDown = (field) => (event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commitDim(field, event.currentTarget.value);
                                event.currentTarget.blur();
                                return;
                              }
                              preventEnterSubmit(event);
                            };
                            return (
                              <td
                                key={box.id || `${group.groupId}-box-weight-${idx}`}
                                className="border-b border-slate-200 px-3 py-2 text-center"
                              >
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  data-box-input="1"
                                  value={valueForField('weight_kg', box?.weight_kg ?? box?.weight ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('weight_kg'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('weight_kg')]: e.target.value
                                    }))
                                  }
                                  onBlur={(e) => commitDim('weight_kg', e.target.value)}
                                  className="w-20 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                  placeholder={tr('zeroPlaceholder')}
                                />
                              </td>
                            );
                          })}
                        </tr>

                        {dimensionSets.map((set, setIdx) => {
                          const buildKey = (field) => getDimSetDraftKey(group.groupId, set.id, field);
                          const valueForField = (field, fallback) => {
                            const draft = boxDimDrafts[buildKey(field)];
                            return draft !== undefined && draft !== null ? draft : fallback;
                          };
                          const commitSet = (field, rawValue) => {
                            updateDimensionSet(
                              group.groupId,
                              set.id,
                              field,
                              rawValue,
                              group.label,
                              set,
                              dimensionAssignments
                            );
                            setBoxDimDrafts((prev) => {
                              const next = { ...(prev || {}) };
                              delete next[buildKey(field)];
                              return next;
                            });
                          };
                          const handleDimKeyDown = (field) => (event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSet(field, event.currentTarget.value);
                              event.currentTarget.blur();
                              return;
                            }
                            preventEnterSubmit(event);
                          };
                          return (
                            <tr key={set.id}>
                              <td className="sticky left-0 z-10 bg-white border-b border-slate-200 px-3 py-2 align-top">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-semibold text-slate-700">
                                    {tr('boxDimensionsCm')}{setIdx > 0 ? ` ${setIdx + 1}` : ''}
                                  </div>
                                  {setIdx > 0 && dimensionSets.length > 1 && (
                                    <button
                                      type="button"
                                      className="text-xs text-slate-400 hover:text-red-600"
                                      onClick={() => removeDimensionSet(group.groupId, set.id, group.label)}
                                      aria-label={tr('removeBoxDimensionsNAria', { index: setIdx + 1 })}
                                    >
                                      x
                                    </button>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                  data-box-input="1"
                                  value={valueForField('length_cm', set?.length_cm ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('length_cm'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('length_cm')]: e.target.value
                                    }))
                                    }
                                    onBlur={(e) => commitSet('length_cm', e.target.value)}
                                    className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                    placeholder={tr('dimLPlaceholder')}
                                  />
                                  <span className="text-slate-400 text-[10px]">x</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                  data-box-input="1"
                                  value={valueForField('width_cm', set?.width_cm ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('width_cm'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('width_cm')]: e.target.value
                                    }))
                                    }
                                    onBlur={(e) => commitSet('width_cm', e.target.value)}
                                    className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                    placeholder={tr('dimWPlaceholder')}
                                  />
                                  <span className="text-slate-400 text-[10px]">x</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                  data-box-input="1"
                                  value={valueForField('height_cm', set?.height_cm ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('height_cm'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('height_cm')]: e.target.value
                                    }))
                                    }
                                    onBlur={(e) => commitSet('height_cm', e.target.value)}
                                    className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                    placeholder={tr('dimHPlaceholder')}
                                  />
                                </div>
                                {setIdx === 0 && (
                                  <button
                                    type="button"
                                    className="mt-1 text-xs text-blue-700 hover:text-blue-800"
                                    onClick={() => addDimensionSet(group.groupId, group.label)}
                                  >
                                    {tr('addAnotherBoxDimension')}
                                  </button>
                                )}
                              </td>
                              {boxes.map((box, idx) => {
                                const boxId = box?.id || `${group.groupId}-box-${idx}`;
                                const checked = dimensionAssignments[boxId] === set.id;
                                return (
                                  <td
                                    key={`${boxId}-${set.id}`}
                                    className="border-b border-slate-200 px-3 py-2 text-center align-middle"
                                  >
                                    <input
                                      type="checkbox"
                                      data-box-input="1"
                                      checked={checked}
                                      onKeyDown={handleBoxDetailsKeyDown()}
                                      onChange={(e) =>
                                        toggleDimensionAssignment(
                                          group.groupId,
                                          set.id,
                                          box,
                                          idx,
                                          e.target.checked,
                                          group.label,
                                          set
                                        )
                                      }
                                      className="h-4 w-4"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {boxPlanValidation.messages.length > 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md space-y-1">
            {boxPlanValidation.messages.map((msg) => (
              <div key={msg}>{msg}</div>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 space-y-3">
        <div className="font-semibold text-slate-900">{tr('packGroupsPreviewTitle')}</div>
        {packGroupsPreviewLoading && (
          <div className="text-sm text-slate-600">{tr('loadingGroupingAmazon')}</div>
        )}
        {!packGroupsPreviewLoading && packGroupsPreviewError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
            {packGroupsPreviewError}
          </div>
        )}
        {!packGroupsPreviewLoading && !packGroupsPreviewError && (!packGroupsPreview || packGroupsPreview.length === 0) && (
          <div className="text-sm text-slate-600">
            {tr('noPackingGroupsYet')}
          </div>
        )}
        {!packGroupsPreviewLoading && hasPackGroups && (
          <div className="text-sm text-slate-600">
            {tr('groupedAboveNotice')}
          </div>
        )}
        {!packGroupsPreviewLoading && Array.isArray(packGroupsPreview) && packGroupsPreview.length > 0 && !hasPackGroups && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {packGroupsPreview.map((group, idx) => {
              const items = Array.isArray(group.items) ? group.items : [];
              return (
                <div key={group.packingGroupId || group.id || `pack-${idx + 1}`} className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{tr('packN', '', { index: idx + 1 })}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {items.map((it, itemIdx) => {
                      const label = it.title || it.name || it.sku || it.asin || tr('genericSkuLabel');
                      const skuLabel = it.sku || it.msku || it.SellerSKU || it.asin || '—';
                      const qty = Number(it.quantity || 0) || 0;
                      return (
                        <div key={`${skuLabel}-${itemIdx}`} className="flex items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <span className="font-semibold">{label}</span>
                            <span className="text-xs text-slate-500">{skuLabel}</span>
                          </div>
                          <div className="text-sm font-semibold">{qty}</div>
                        </div>
                      );
                    })}
                  </div>
                  {idx < packGroupsPreview.length - 1 && <div className="border-t border-slate-200 mt-3" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200">
        <div className="text-sm text-slate-600">
          {tr('skusConfirmedToSendSummary', '', { count: skus.length, units: totalUnits })}
        </div>
        <div className="flex gap-3 justify-end flex-wrap">
          {/* removed inboundPlan missing/wait banners */}
          {hasUnits && !boxPlanValidation.isValid && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
              {tr('completeBoxPlanning')}
            </div>
          )}
          {!hasUnits && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
              {tr('noUnitsWarning')}
            </div>
          )}
          <button
            onClick={() => {
              if (skuEligibilityBlocking) {
                alert(tr('alertNotEligible'));
                return;
              }
              if (hasBlocking) {
                alert(error || tr('alertPlanNotReady'));
                return;
              }
              const disabled = continueDisabled;
              if (disabled) return;
              onNext?.();
            }}
            disabled={continueDisabled}
            className={`px-4 py-2 rounded-md font-semibold shadow-sm text-white ${
              continueDisabled ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loadingPlan && skus.length === 0
              ? tr('waitingAmazon')
              : saving
                ? tr('saving')
                : hasBlocking
                  ? skuEligibilityBlocking
                    ? tr('resolveEligibility')
                    : tr('retryStep1')
                  : (!allowNoInboundPlan && (!inboundPlanId || !requestId))
                    ? tr('waitingPlan')
                    : !hasUnits
                      ? tr('addUnits')
                      : tr('continueToPacking')}
            </button>
          </div>
        </div>

      {packingModal.open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/25 px-4 pt-20">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[70vh] overflow-y-auto">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">{tr('packingDetailsTitle')}</div>
              <button onClick={closePackingModal} className="text-slate-500 hover:text-slate-700 text-xs">{tr('close')}</button>
            </div>
              <div className="px-3 py-2.5 space-y-2.5">
              {templateError ? (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                  {templateError}
                </div>
              ) : null}
              {packingModal.sku && (
                <div className="flex gap-2 items-center">
                  <img
                    src={packingModal.sku.image || placeholderImg}
                    alt={packingModal.sku.title}
                    className="w-8 h-8 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-[11px] text-slate-800 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{packingModal.sku.title}</div>
                    <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {packingModal.sku.sku}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('templateName')}</label>
                  <input
                    type="text"
                    value={packingModal.templateName}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateName: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('templateNameExample')}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('type')}</label>
                  <select
                    value={packingModal.templateType}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateType: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                  >
                    <option value="case">{tr('optionCasePacked')}</option>
                    <option value="individual">{tr('optionIndividualUnits')}</option>
                    <option value="single_sku_pallet">{tr('optionSingleSkuPallet')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('unitsPerBoxShort')}</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.unitsPerBox}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, unitsPerBox: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('weightKg')}</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxWeight}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxWeight: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('zeroDecimalPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-800">{tr('dimensionsCm')}</label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxL}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxL: e.target.value }))}
                    className="border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('dimLPlaceholder')}
                  />
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxW}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxW: e.target.value }))}
                    className="border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('dimWPlaceholder')}
                  />
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxH}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxH: e.target.value }))}
                    className="border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('dimHPlaceholder')}
                  />
                </div>
              </div>

              <div className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">{tr('prep')}:</span> {tr('noPrepNeeded')}
              </div>
            </div>

            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={closePackingModal} className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 text-xs">
                {tr('cancel')}
              </button>
              <button
                onClick={savePackingTemplate}
                className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
              >
                {tr('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {prepModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">{tr('prepareFbaItems')}</div>
              <button onClick={closePrepModal} className="text-slate-500 hover:text-slate-700 text-sm">{tr('close')}</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {prepModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={prepModal.sku.image || placeholderImg}
                    alt={prepModal.sku.title}
                    className="w-12 h-12 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{prepModal.sku.title}</div>
                    <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {prepModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">{tr('asinLabelShort')}: {prepModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">{tr('storageLabel')}: {prepModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setPrepTab('prep')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'prep' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  {tr('prepGuidance')}
                </button>
                <button
                  onClick={() => setPrepTab('barcode')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'barcode' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  {tr('useManufacturerBarcode')}
                </button>
              </div>

              {prepTab === 'prep' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">{tr('choosePrepCategory')}</label>
                    <select
                      value={prepModal.prepCategory}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, prepCategory: e.target.value }))}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">{tr('selectPlaceholder')}</option>
                      <option value="fragile">{tr('prepFragileGlass')}</option>
                      <option value="liquids">{tr('prepLiquidsNonGlass')}</option>
                      <option value="perforated">{tr('prepPerforatedPackaging')}</option>
                      <option value="powder">{tr('prepPowderPelletsGranular')}</option>
                      <option value="small">{tr('prepSmall')}</option>
                      <option value="none">{tr('noPrepNeeded')}</option>
                    </select>
                  </div>
                  {formatPrepList(prepModal.sku?.prepInstructions || prepModal.sku?.prepNotes || []).length > 0 && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                      {tr('guidance')}: {formatPrepList(prepModal.sku?.prepInstructions || prepModal.sku?.prepNotes || []).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {prepTab === 'barcode' && (
                <div className="space-y-3">
                  {!prepModal.manufacturerBarcodeEligible ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      {tr('notEligibleManufacturerBarcode')}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-700">{tr('eligibleManufacturerBarcode')}</div>
                  )}
                  <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={prepModal.useManufacturerBarcode}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, useManufacturerBarcode: e.target.checked }))}
                    />
                    {tr('useManufacturerBarcodeTracking')}
                  </label>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closePrepModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                {tr('cancel')}
              </button>
              <button
                onClick={savePrepModal}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
              >
                {tr('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {labelModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">{tr('printSkuLabels')}</div>
              <button onClick={closeLabelModal} className="text-slate-500 hover:text-slate-700 text-sm">{tr('close')}</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {labelModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={labelModal.sku.image || placeholderImg}
                    alt={labelModal.sku.title}
                    className="w-12 h-12 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{labelModal.sku.title}</div>
                    <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {labelModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">{tr('asinLabelShort')}: {labelModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">{tr('fulfillmentStorageType')}: {labelModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{tr('choosePrintingFormat')}</label>
                  <select
                    value={labelModal.format}
                    onChange={(e) => {
                      const nextFormat = e.target.value;
                      const preset = LABEL_PRESETS[nextFormat] || LABEL_PRESETS.thermal;
                      setLabelModal((prev) => ({
                        ...prev,
                        format: nextFormat,
                        width: preset.width,
                        height: preset.height
                      }));
                    }}
                    className="border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="thermal">{tr('thermalPrinting')}</option>
                    <option value="standard">{tr('standardFormats')}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{tr('widthMm')}</label>
                  <input
                    type="number"
                    min={1}
                    value={labelModal.width}
                    onChange={(e) => setLabelModal((prev) => ({ ...prev, width: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{tr('heightMm')}</label>
                  <input
                    type="number"
                    min={1}
                    value={labelModal.height}
                    onChange={(e) => setLabelModal((prev) => ({ ...prev, height: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-md">
                <div className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-200">{tr('tableSkuDetails')}</div>
                {labelModal.sku && (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <img
                      src={labelModal.sku.image || placeholderImg}
                      alt={labelModal.sku.title}
                      className="w-10 h-10 object-contain border border-slate-200 rounded"
                    />
                    <div className="flex-1 text-sm text-slate-800">
                      <div className="font-semibold text-slate-900 leading-snug line-clamp-2">{labelModal.sku.title}</div>
                      <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {labelModal.sku.sku}</div>
                      <div className="text-xs text-slate-600">{tr('asinLabelShort')}: {labelModal.sku.asin}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <label className="text-xs text-slate-600">{tr('printLabels')}</label>
                      <input
                        type="number"
                        min={1}
                        value={labelModal.quantity}
                        onChange={(e) => setLabelModal((prev) => ({ ...prev, quantity: e.target.value }))}
                        className="border rounded-md px-3 py-2 text-sm w-24 text-right"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closeLabelModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                {tr('cancel')}
              </button>
              <button
                onClick={handleDownloadLabels}
                disabled={labelLoading}
                className={`px-4 py-2 rounded-md text-white text-sm font-semibold shadow-sm ${labelLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {labelLoading ? tr('downloading') : tr('downloadLabels')}
              </button>
            </div>
            {labelError && (
              <div className="px-6 pb-4 text-sm text-red-600">
                {labelError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
