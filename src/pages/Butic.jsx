import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase, supabaseHelpers } from '@/config/supabase';
import { useT } from '@/i18n/useT';

const OFFER_COUNTRY_OPTIONS = ['FR', 'DE'];
const CHAT_OPEN_B2B_EVENT = 'client-chat:open-b2b';

const BUTIC_COPY = {
  en: {
    heroDescription: 'Anonymous offers. Add products for sale directly from your inventory with price and note.',
    openChat: 'Open chat',
    allOffers: 'All offers',
    searchAllPlaceholder: 'ASIN / EAN / name',
    loading: 'Loading...',
    noOffers: 'No offers available.',
    myOfferTag: 'My offer',
    contact: 'Contact',
    qtyUnit: 'pcs',
    myOffersFromInventory: 'My offers (from inventory)',
    inventorySectionHint: 'Only products with stock greater than 0 are shown here.',
    inventorySearchPlaceholder: 'Search inventory: ASIN / EAN / name',
    noInventoryStock: 'No products with available stock.',
    stockLabel: 'Stock',
    selectedLabel: 'Selected',
    selectHint: 'Select a product from inventory, then add price and note.',
    pricePlaceholder: 'Price EUR',
    notePlaceholder: 'Note (optional)',
    linkFrPlaceholder: 'FR link (optional)',
    linkDePlaceholder: 'DE link (optional)',
    linksLabel: 'Links',
    publishing: 'Publishing...',
    addForSale: 'Add for sale',
    listingCountryLabel: 'Storage country',
    listingCountryPlaceholder: 'Select country (FR/DE)',
    listingCountryHelp: 'Select the warehouse country where your goods are physically stored.',
    countryNotSelected: 'not selected',
    locatedIn: 'Product "{name}" is in {country}.',
    quantityToSellLabel: 'Quantity to sell',
    quantityToSellPlaceholder: 'Quantity to sell',
    availableStockLabel: 'Available stock',
    noMyOffers: 'You have no published offers yet.',
    chatTitle: 'Marketplace chat',
    chatSubtitle: 'Client-to-client negotiation',
    closeChat: 'Close chat',
    noConversations: 'No conversations yet.',
    listingFallback: 'Listing',
    noCode: 'No code',
    selectConversation: 'Choose a conversation or click "Contact".',
    writeMessagePlaceholder: 'Write a message...',
    send: 'Send',
    authOnly: 'Marketplace is available only for authenticated clients.',
    invalidPrice: 'Enter a valid price greater than 0.',
    selectProductError: 'Select a product from inventory first.',
    selectCountryError: 'Select storage country (FR or DE).',
    quantityInvalidError: 'Enter a valid quantity to sell.',
    quantityExceedsError: 'Quantity to sell cannot be greater than available stock.',
    publishFailed: 'Could not publish offer. Please try again.',
    sendFailed: 'Could not send message. Please try again.',
    finalizeSale: 'Finalize sale',
    editListing: 'Edit',
    saveChanges: 'Save',
    cancelEdit: 'Cancel',
    removeFromSale: 'Remove from sale',
    editFailed: 'Could not update the offer. Please try again.',
    finalizeSaleError: 'Could not finalize the sale. Please try again.',
    removeSaleError: 'Could not remove the offer. Please try again.',
    saleFeeHint: 'Finalizing applies an FBA fee of 0.05 EUR per unit.',
    asin: 'ASIN',
    ean: 'EAN',
  },
  ro: {
    heroDescription: 'Oferte anonime. Tu adaugi la vanzare direct din inventar, cu pret si nota.',
    openChat: 'Deschide chat',
    allOffers: 'Toate ofertele',
    searchAllPlaceholder: 'ASIN / EAN / nume',
    loading: 'Se incarca...',
    noOffers: 'Nu exista oferte.',
    myOfferTag: 'Oferta mea',
    contact: 'Contacteaza',
    qtyUnit: 'buc',
    myOffersFromInventory: 'Ofertele mele (din inventar)',
    inventorySectionHint: 'Aici apar doar produsele cu stoc mai mare de 0.',
    inventorySearchPlaceholder: 'Cauta in inventar: ASIN / EAN / nume',
    noInventoryStock: 'Nu ai produse cu stoc disponibil.',
    stockLabel: 'Stoc',
    selectedLabel: 'Selectat',
    selectHint: 'Selecteaza un produs din inventar, apoi adauga pret + nota.',
    pricePlaceholder: 'Pret EUR',
    notePlaceholder: 'Nota (optional)',
    linkFrPlaceholder: 'Link FR (optional)',
    linkDePlaceholder: 'Link DE (optional)',
    linksLabel: 'Linkuri',
    publishing: 'Se publica...',
    addForSale: 'Adauga la vanzare',
    listingCountryLabel: 'Tara depozitare',
    listingCountryPlaceholder: 'Selecteaza tara (FR/DE)',
    listingCountryHelp: 'Selecteaza tara depozitului unde marfa este stocata fizic.',
    countryNotSelected: 'neselectata',
    locatedIn: 'Produsul "{name}" se afla in {country}.',
    quantityToSellLabel: 'Cantitate de vandut',
    quantityToSellPlaceholder: 'Cantitate de vandut',
    availableStockLabel: 'Stoc disponibil',
    noMyOffers: 'Nu ai oferte publicate.',
    chatTitle: 'Chat Butic',
    chatSubtitle: 'Negociere intre clienti',
    closeChat: 'Inchide chat',
    noConversations: 'Nu ai conversatii inca.',
    listingFallback: 'Oferta',
    noCode: 'Fara cod',
    selectConversation: 'Alege o conversatie sau apasa "Contacteaza".',
    writeMessagePlaceholder: 'Scrie mesaj...',
    send: 'Trimite',
    authOnly: 'Buticul este disponibil doar pentru clienti autentificati.',
    invalidPrice: 'Introdu un pret valid mai mare ca 0.',
    selectProductError: 'Selecteaza mai intai un produs din inventar.',
    selectCountryError: 'Selecteaza tara de depozitare (FR sau DE).',
    quantityInvalidError: 'Introdu o cantitate valida pentru vanzare.',
    quantityExceedsError: 'Cantitatea de vandut nu poate depasi stocul disponibil.',
    publishFailed: 'Oferta nu a putut fi publicata. Incearca din nou.',
    sendFailed: 'Mesajul nu a putut fi trimis. Incearca din nou.',
    finalizeSale: 'Vanzare finalizata',
    editListing: 'Editeaza',
    saveChanges: 'Salveaza',
    cancelEdit: 'Anuleaza',
    removeFromSale: 'Sterge din vanzare',
    editFailed: 'Oferta nu a putut fi actualizata. Incearca din nou.',
    finalizeSaleError: 'Vanzarea nu a putut fi finalizata. Incearca din nou.',
    removeSaleError: 'Oferta nu a putut fi stearsa. Incearca din nou.',
    saleFeeHint: 'Finalizarea aplica taxa FBA de 0.05 EUR per produs.',
    asin: 'ASIN',
    ean: 'EAN',
  },
  fr: {
    heroDescription: 'Offres anonymes. Ajoutez des produits a vendre depuis votre inventaire avec prix et note.',
    openChat: 'Ouvrir le chat',
    allOffers: 'Toutes les offres',
    searchAllPlaceholder: 'ASIN / EAN / nom',
    loading: 'Chargement...',
    noOffers: 'Aucune offre disponible.',
    myOfferTag: 'Mon offre',
    contact: 'Contacter',
    qtyUnit: 'pcs',
    myOffersFromInventory: 'Mes offres (depuis inventaire)',
    inventorySectionHint: 'Seuls les produits avec un stock superieur a 0 sont affiches ici.',
    inventorySearchPlaceholder: 'Rechercher en inventaire: ASIN / EAN / nom',
    noInventoryStock: 'Aucun produit avec stock disponible.',
    stockLabel: 'Stock',
    selectedLabel: 'Selectionne',
    selectHint: 'Selectionnez un produit de votre inventaire, puis ajoutez prix + note.',
    pricePlaceholder: 'Prix EUR',
    notePlaceholder: 'Note (optionnelle)',
    linkFrPlaceholder: 'Lien FR (optionnel)',
    linkDePlaceholder: 'Lien DE (optionnel)',
    linksLabel: 'Liens',
    publishing: 'Publication...',
    addForSale: 'Ajouter a la vente',
    listingCountryLabel: 'Pays de stockage',
    listingCountryPlaceholder: 'Selectionnez le pays (FR/DE)',
    listingCountryHelp: 'Selectionnez le pays de l entrepot ou la marchandise est stockee physiquement.',
    countryNotSelected: 'non selectionne',
    locatedIn: 'Le produit "{name}" est en {country}.',
    quantityToSellLabel: 'Quantite a vendre',
    quantityToSellPlaceholder: 'Quantite a vendre',
    availableStockLabel: 'Stock disponible',
    noMyOffers: 'Aucune offre publiee.',
    chatTitle: 'Chat B2B',
    chatSubtitle: 'Negociation entre clients',
    closeChat: 'Fermer le chat',
    noConversations: 'Pas encore de conversations.',
    listingFallback: 'Annonce',
    noCode: 'Sans code',
    selectConversation: 'Choisissez une conversation ou cliquez sur "Contacter".',
    writeMessagePlaceholder: 'Ecrivez un message...',
    send: 'Envoyer',
    authOnly: 'Le marche est disponible uniquement pour les clients connectes.',
    invalidPrice: 'Entrez un prix valide superieur a 0.',
    selectProductError: 'Selectionnez d abord un produit de l inventaire.',
    selectCountryError: 'Selectionnez le pays de stockage (FR ou DE).',
    quantityInvalidError: 'Entrez une quantite valide a vendre.',
    quantityExceedsError: 'La quantite a vendre ne peut pas depasser le stock disponible.',
    publishFailed: 'Impossible de publier l offre. Reessayez.',
    sendFailed: 'Impossible d envoyer le message. Reessayez.',
    finalizeSale: 'Vente finalisee',
    editListing: 'Modifier',
    saveChanges: 'Sauvegarder',
    cancelEdit: 'Annuler',
    removeFromSale: 'Retirer de la vente',
    editFailed: 'Impossible de mettre a jour l offre. Reessayez.',
    finalizeSaleError: 'Impossible de finaliser la vente. Reessayez.',
    removeSaleError: 'Impossible de retirer l offre. Reessayez.',
    saleFeeHint: 'La finalisation applique des frais FBA de 0.05 EUR par unite.',
    asin: 'ASIN',
    ean: 'EAN',
  },
  de: {
    heroDescription: 'Anonyme Angebote. Produkte direkt aus dem Bestand mit Preis und Notiz anbieten.',
    openChat: 'Chat offnen',
    allOffers: 'Alle Angebote',
    searchAllPlaceholder: 'ASIN / EAN / Name',
    loading: 'Wird geladen...',
    noOffers: 'Keine Angebote vorhanden.',
    myOfferTag: 'Mein Angebot',
    contact: 'Kontaktieren',
    qtyUnit: 'Stk',
    myOffersFromInventory: 'Meine Angebote (aus Bestand)',
    inventorySectionHint: 'Hier werden nur Produkte mit Bestand grosser als 0 angezeigt.',
    inventorySearchPlaceholder: 'Im Bestand suchen: ASIN / EAN / Name',
    noInventoryStock: 'Keine Produkte mit verfugbarem Bestand.',
    stockLabel: 'Bestand',
    selectedLabel: 'Ausgewahlt',
    selectHint: 'Produkt aus dem Bestand auswahlen, dann Preis + Notiz hinzufugen.',
    pricePlaceholder: 'Preis EUR',
    notePlaceholder: 'Notiz (optional)',
    linkFrPlaceholder: 'FR-Link (optional)',
    linkDePlaceholder: 'DE-Link (optional)',
    linksLabel: 'Links',
    publishing: 'Wird veroffentlicht...',
    addForSale: 'Zum Verkauf hinzufugen',
    listingCountryLabel: 'Lagerland',
    listingCountryPlaceholder: 'Land auswahlen (FR/DE)',
    listingCountryHelp: 'Wahle das Land des Lagers, in dem die Ware physisch gelagert ist.',
    countryNotSelected: 'nicht ausgewahlt',
    locatedIn: 'Produkt "{name}" befindet sich in {country}.',
    quantityToSellLabel: 'Menge zum Verkauf',
    quantityToSellPlaceholder: 'Menge zum Verkauf',
    availableStockLabel: 'Verfugbarer Bestand',
    noMyOffers: 'Noch keine veroffentlichten Angebote.',
    chatTitle: 'Marketplace-Chat',
    chatSubtitle: 'Verhandlung zwischen Kunden',
    closeChat: 'Chat schliessen',
    noConversations: 'Noch keine Unterhaltungen.',
    listingFallback: 'Angebot',
    noCode: 'Kein Code',
    selectConversation: 'Wahle eine Unterhaltung oder klicke auf "Kontaktieren".',
    writeMessagePlaceholder: 'Nachricht schreiben...',
    send: 'Senden',
    authOnly: 'Der Marktplatz ist nur fur angemeldete Kunden verfugbar.',
    invalidPrice: 'Gib einen gultigen Preis grosser 0 ein.',
    selectProductError: 'Wahle zuerst ein Produkt aus dem Bestand.',
    selectCountryError: 'Wahle das Lagerland (FR oder DE).',
    quantityInvalidError: 'Gib eine gultige Verkaufsmenge ein.',
    quantityExceedsError: 'Die Verkaufsmenge darf den verfugbaren Bestand nicht ubersteigen.',
    publishFailed: 'Angebot konnte nicht veroffentlicht werden. Bitte erneut versuchen.',
    sendFailed: 'Nachricht konnte nicht gesendet werden. Bitte erneut versuchen.',
    finalizeSale: 'Verkauf abschliessen',
    editListing: 'Bearbeiten',
    saveChanges: 'Speichern',
    cancelEdit: 'Abbrechen',
    removeFromSale: 'Aus Verkauf entfernen',
    editFailed: 'Angebot konnte nicht aktualisiert werden. Bitte erneut versuchen.',
    finalizeSaleError: 'Verkauf konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
    removeSaleError: 'Angebot konnte nicht entfernt werden. Bitte erneut versuchen.',
    saleFeeHint: 'Beim Abschluss wird eine FBA-Gebuhr von 0.05 EUR pro Einheit berechnet.',
    asin: 'ASIN',
    ean: 'EAN',
  },
  it: {
    heroDescription: 'Offerte anonime. Aggiungi prodotti in vendita direttamente dal tuo inventario con prezzo e nota.',
    openChat: 'Apri chat',
    allOffers: 'Tutte le offerte',
    searchAllPlaceholder: 'ASIN / EAN / nome',
    loading: 'Caricamento...',
    noOffers: 'Nessuna offerta disponibile.',
    myOfferTag: 'La mia offerta',
    contact: 'Contatta',
    qtyUnit: 'pz',
    myOffersFromInventory: 'Le mie offerte (da inventario)',
    inventorySectionHint: 'Qui vengono mostrati solo i prodotti con stock maggiore di 0.',
    inventorySearchPlaceholder: 'Cerca in inventario: ASIN / EAN / nome',
    noInventoryStock: 'Nessun prodotto con stock disponibile.',
    stockLabel: 'Stock',
    selectedLabel: 'Selezionato',
    selectHint: 'Seleziona un prodotto dall inventario, poi aggiungi prezzo + nota.',
    pricePlaceholder: 'Prezzo EUR',
    notePlaceholder: 'Nota (opzionale)',
    linkFrPlaceholder: 'Link FR (opzionale)',
    linkDePlaceholder: 'Link DE (opzionale)',
    linksLabel: 'Link',
    publishing: 'Pubblicazione...',
    addForSale: 'Aggiungi in vendita',
    listingCountryLabel: 'Paese di stoccaggio',
    listingCountryPlaceholder: 'Seleziona paese (FR/DE)',
    listingCountryHelp: 'Seleziona il paese del magazzino dove la merce e fisicamente stoccata.',
    countryNotSelected: 'non selezionato',
    locatedIn: 'Il prodotto "{name}" si trova in {country}.',
    quantityToSellLabel: 'Quantita da vendere',
    quantityToSellPlaceholder: 'Quantita da vendere',
    availableStockLabel: 'Stock disponibile',
    noMyOffers: 'Nessuna offerta pubblicata.',
    chatTitle: 'Chat Marketplace',
    chatSubtitle: 'Negoziazione tra clienti',
    closeChat: 'Chiudi chat',
    noConversations: 'Nessuna conversazione.',
    listingFallback: 'Annuncio',
    noCode: 'Nessun codice',
    selectConversation: 'Scegli una conversazione o premi "Contatta".',
    writeMessagePlaceholder: 'Scrivi un messaggio...',
    send: 'Invia',
    authOnly: 'Il marketplace e disponibile solo per clienti autenticati.',
    invalidPrice: 'Inserisci un prezzo valido maggiore di 0.',
    selectProductError: 'Seleziona prima un prodotto dall inventario.',
    selectCountryError: 'Seleziona il paese di stoccaggio (FR o DE).',
    quantityInvalidError: 'Inserisci una quantita valida da vendere.',
    quantityExceedsError: 'La quantita da vendere non puo superare lo stock disponibile.',
    publishFailed: 'Impossibile pubblicare l offerta. Riprova.',
    sendFailed: 'Impossibile inviare il messaggio. Riprova.',
    finalizeSale: 'Vendita completata',
    editListing: 'Modifica',
    saveChanges: 'Salva',
    cancelEdit: 'Annulla',
    removeFromSale: 'Rimuovi dalla vendita',
    editFailed: 'Impossibile aggiornare l offerta. Riprova.',
    finalizeSaleError: 'Impossibile completare la vendita. Riprova.',
    removeSaleError: 'Impossibile rimuovere l offerta. Riprova.',
    saleFeeHint: 'La chiusura applica una tariffa FBA di 0.05 EUR per unita.',
    asin: 'ASIN',
    ean: 'EAN',
  },
  es: {
    heroDescription: 'Ofertas anonimas. Agrega productos para vender desde tu inventario con precio y nota.',
    openChat: 'Abrir chat',
    allOffers: 'Todas las ofertas',
    searchAllPlaceholder: 'ASIN / EAN / nombre',
    loading: 'Cargando...',
    noOffers: 'No hay ofertas disponibles.',
    myOfferTag: 'Mi oferta',
    contact: 'Contactar',
    qtyUnit: 'uds',
    myOffersFromInventory: 'Mis ofertas (desde inventario)',
    inventorySectionHint: 'Aqui se muestran solo productos con stock mayor que 0.',
    inventorySearchPlaceholder: 'Buscar en inventario: ASIN / EAN / nombre',
    noInventoryStock: 'No tienes productos con stock disponible.',
    stockLabel: 'Stock',
    selectedLabel: 'Seleccionado',
    selectHint: 'Selecciona un producto del inventario y agrega precio + nota.',
    pricePlaceholder: 'Precio EUR',
    notePlaceholder: 'Nota (opcional)',
    linkFrPlaceholder: 'Enlace FR (opcional)',
    linkDePlaceholder: 'Enlace DE (opcional)',
    linksLabel: 'Enlaces',
    publishing: 'Publicando...',
    addForSale: 'Agregar en venta',
    listingCountryLabel: 'Pais de almacen',
    listingCountryPlaceholder: 'Selecciona pais (FR/DE)',
    listingCountryHelp: 'Selecciona el pais del almacen donde la mercancia esta guardada fisicamente.',
    countryNotSelected: 'no seleccionado',
    locatedIn: 'El producto "{name}" esta en {country}.',
    quantityToSellLabel: 'Cantidad a vender',
    quantityToSellPlaceholder: 'Cantidad a vender',
    availableStockLabel: 'Stock disponible',
    noMyOffers: 'No tienes ofertas publicadas.',
    chatTitle: 'Chat Marketplace',
    chatSubtitle: 'Negociacion entre clientes',
    closeChat: 'Cerrar chat',
    noConversations: 'No tienes conversaciones aun.',
    listingFallback: 'Oferta',
    noCode: 'Sin codigo',
    selectConversation: 'Elige una conversacion o pulsa "Contactar".',
    writeMessagePlaceholder: 'Escribe un mensaje...',
    send: 'Enviar',
    authOnly: 'El marketplace esta disponible solo para clientes autenticados.',
    invalidPrice: 'Introduce un precio valido mayor que 0.',
    selectProductError: 'Selecciona primero un producto del inventario.',
    selectCountryError: 'Selecciona el pais de almacen (FR o DE).',
    quantityInvalidError: 'Introduce una cantidad valida para vender.',
    quantityExceedsError: 'La cantidad a vender no puede superar el stock disponible.',
    publishFailed: 'No se pudo publicar la oferta. Intentalo de nuevo.',
    sendFailed: 'No se pudo enviar el mensaje. Intentalo de nuevo.',
    finalizeSale: 'Venta finalizada',
    editListing: 'Editar',
    saveChanges: 'Guardar',
    cancelEdit: 'Cancelar',
    removeFromSale: 'Quitar de la venta',
    editFailed: 'No se pudo actualizar la oferta. Intentalo de nuevo.',
    finalizeSaleError: 'No se pudo finalizar la venta. Intentalo de nuevo.',
    removeSaleError: 'No se pudo quitar la oferta. Intentalo de nuevo.',
    saleFeeHint: 'Al finalizar se aplica una tarifa FBA de 0.05 EUR por unidad.',
    asin: 'ASIN',
    ean: 'EAN',
  }
};

function formatProductCodes(copy, asin, ean) {
  const normalizedAsin = String(asin || '').trim();
  const normalizedEan = String(ean || '').trim();
  if (normalizedAsin && normalizedEan) {
    return `${copy.asin}: ${normalizedAsin} · ${copy.ean}: ${normalizedEan}`;
  }
  if (normalizedAsin) {
    return `${copy.asin}: ${normalizedAsin}`;
  }
  if (normalizedEan) {
    return `${copy.ean}: ${normalizedEan}`;
  }
  return copy.noCode;
}

function getListingImageUrl(listing) {
  return listing?.image_url || null;
}

function toExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function getAvailableInventoryStock(item) {
  const qty = Number(item?.qty || 0);
  const byCountry = item?.prep_qty_by_country;
  if (!byCountry || typeof byCountry !== 'object') return qty;
  const prepSum = Object.values(byCountry).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return Math.max(qty, prepSum);
}

export default function Butic() {
  const t = useT();
  const { currentLanguage } = useLanguage();
  const copy = BUTIC_COPY[currentLanguage] || BUTIC_COPY.en;

  const { user, profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const [allSearch, setAllSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [loadingListings, setLoadingListings] = useState(false);
  const [allListings, setAllListings] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedStockItemId, setSelectedStockItemId] = useState('');
  const [offerCountry, setOfferCountry] = useState('');
  const [quantityToSell, setQuantityToSell] = useState('1');
  const [priceEur, setPriceEur] = useState('');
  const [note, setNote] = useState('');
  const [linkFr, setLinkFr] = useState('');
  const [linkDe, setLinkDe] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [listingActionError, setListingActionError] = useState('');
  const [busyListingId, setBusyListingId] = useState(null);
  const [editingListingId, setEditingListingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    productName: '',
    asin: '',
    ean: '',
    country: '',
    quantity: '1',
    priceEur: '',
    note: '',
    linkFr: '',
    linkDe: ''
  });
  const [failedImageIds, setFailedImageIds] = useState(() => new Set());
  const [showChat, setShowChat] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const messagesRef = useRef(null);

  const isAdmin = !!(
    profile?.account_type === 'admin' ||
    profile?.is_admin === true ||
    user?.user_metadata?.account_type === 'admin'
  );
  const me = user?.id || null;
  const market = String(currentMarket || profile?.country || 'FR').toUpperCase();
  const myCompanyId = profile?.company_id || null;

  const loadAllListings = async () => {
    if (!me) return;
    setLoadingListings(true);
    const res = await supabaseHelpers.listClientMarketListings({
      country: null,
      search: allSearch.trim() || null
    });
    setAllListings(res?.data || []);
    setLoadingListings(false);
  };

  const loadInventory = async () => {
    const res = await supabaseHelpers.listClientInventoryForMarket({
      companyId: myCompanyId || null,
      search: inventorySearch.trim() || null
    });
    setInventoryItems((res?.data || []).filter((row) => getAvailableInventoryStock(row) > 0));
  };

  const loadConversations = async () => {
    if (!me) return;
    const res = await supabaseHelpers.listClientMarketConversations({ country: market });
    const rows = res?.data || [];
    setConversations(rows);
    if (!activeConversationId && rows.length) setActiveConversationId(rows[0].id);
    if (activeConversationId && rows.length && !rows.some((r) => r.id === activeConversationId)) {
      setActiveConversationId(rows[0].id);
    }
  };

  useEffect(() => {
    if (!me) return;
    loadAllListings();
    const timer = setInterval(loadAllListings, 10000);
    return () => clearInterval(timer);
  }, [me, allSearch]);

  useEffect(() => {
    if (!me) return;
    loadInventory();
  }, [me, inventorySearch, myCompanyId]);

  useEffect(() => {
    if (!me) return;
    loadConversations();
    const timer = setInterval(loadConversations, 5000);
    return () => clearInterval(timer);
  }, [me, market]);

  const selectedInventoryItem = useMemo(
    () => inventoryItems.find((item) => String(item.id) === String(selectedStockItemId)) || null,
    [inventoryItems, selectedStockItemId]
  );

  useEffect(() => {
    if (!selectedInventoryItem) {
      setQuantityToSell('1');
      return;
    }
    const stock = Math.max(1, getAvailableInventoryStock(selectedInventoryItem));
    setQuantityToSell((prev) => {
      const numeric = Number(prev);
      if (!Number.isFinite(numeric) || numeric < 1) return '1';
      if (numeric > stock) return String(stock);
      return prev;
    });
  }, [selectedInventoryItem?.id, selectedInventoryItem?.qty]);

  const marketListings = useMemo(() => allListings, [allListings]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const loadMessages = async () => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    const res = await supabaseHelpers.listClientMarketMessages({
      conversationId: activeConversationId
    });
    setMessages(res?.data || []);
    requestAnimationFrame(() => {
      if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    });
  };

  useEffect(() => {
    loadMessages();
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    const channel = supabase
      .channel(`client-market-${activeConversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_market_messages',
          filter: `conversation_id=eq.${activeConversationId}`
        },
        () => {
          loadMessages();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  const createListingFromInventory = async (event) => {
    event.preventDefault();
    if (!selectedInventoryItem) {
      setCreateError(copy.selectProductError);
      return;
    }
    if (!offerCountry || !OFFER_COUNTRY_OPTIONS.includes(offerCountry)) {
      setCreateError(copy.selectCountryError);
      return;
    }
    const availableStock = Math.max(1, getAvailableInventoryStock(selectedInventoryItem));
    const parsedQuantity = Number(quantityToSell);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      setCreateError(copy.quantityInvalidError);
      return;
    }
    if (parsedQuantity > availableStock) {
      setCreateError(copy.quantityExceedsError);
      return;
    }
    const parsedPrice = Number(priceEur);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setCreateError(copy.invalidPrice);
      return;
    }
    if (!me) return;

    setCreateError('');
    setCreating(true);
    setListingActionError('');
    const res = await supabaseHelpers.createClientMarketListing({
      ownerUserId: me,
      ownerCompanyId: myCompanyId || selectedInventoryItem?.company_id || me,
      stockItemId: selectedInventoryItem.id,
      country: offerCountry,
      asin: selectedInventoryItem.asin || null,
      ean: selectedInventoryItem.ean || null,
      imageUrl: selectedInventoryItem.image_url || null,
      productName: selectedInventoryItem.name || 'Product',
      priceEur: parsedPrice,
      quantity: Math.max(1, Math.floor(parsedQuantity)),
      note,
      linkFr,
      linkDe
    });
    if (res?.error) {
      console.error('Failed to create listing:', res.error);
      const errMessage = String(res.error?.message || '');
      setCreateError(errMessage ? `${copy.publishFailed} (${errMessage})` : copy.publishFailed);
    } else {
      setPriceEur('');
      setNote('');
      setLinkFr('');
      setLinkDe('');
      setSelectedStockItemId('');
      setOfferCountry('');
      setQuantityToSell('1');
      setCreateError('');
      loadAllListings();
    }
    setCreating(false);
  };

  const finalizeListingSale = async (listing) => {
    if (!listing?.id || busyListingId) return;
    setBusyListingId(listing.id);
    setListingActionError('');
    const res = await supabaseHelpers.finalizeClientMarketSale({
      listingId: listing.id,
      units: listing.quantity
    });
    if (res?.error) {
      console.error('Failed to finalize listing sale:', res.error);
      setListingActionError(copy.finalizeSaleError);
    } else {
      await loadAllListings();
    }
    setBusyListingId(null);
  };

  const removeListing = async (listing) => {
    if (!listing?.id || busyListingId) return;
    setBusyListingId(listing.id);
    setListingActionError('');
    const res = await supabaseHelpers.setClientMarketListingActive({
      listingId: listing.id,
      isActive: false
    });
    if (res?.error) {
      console.error('Failed to remove listing:', res.error);
      const errMessage = String(res.error?.message || '');
      setListingActionError(errMessage ? `${copy.removeSaleError} (${errMessage})` : copy.removeSaleError);
    } else {
      await loadAllListings();
    }
    setBusyListingId(null);
  };

  const beginEditListing = (listing) => {
    if (!listing?.id) return;
    setListingActionError('');
    setEditingListingId(listing.id);
    setEditDraft({
      productName: listing.product_name || '',
      asin: listing.asin || '',
      ean: listing.ean || '',
      country: String(listing.country || '').toUpperCase(),
      quantity: String(Math.max(1, Number(listing.quantity || 1))),
      priceEur: String(Number(listing.price_eur || 0)),
      note: listing.note || '',
      linkFr: listing.link_fr || '',
      linkDe: listing.link_de || ''
    });
  };

  const cancelEditListing = () => {
    setEditingListingId(null);
    setEditDraft({
      productName: '',
      asin: '',
      ean: '',
      country: '',
      quantity: '1',
      priceEur: '',
      note: '',
      linkFr: '',
      linkDe: ''
    });
  };

  const saveEditListing = async (listing) => {
    if (!listing?.id || busyListingId) return;
    const parsedPrice = Number(editDraft.priceEur);
    const parsedQty = Number(editDraft.quantity);
    if (!editDraft.country || !OFFER_COUNTRY_OPTIONS.includes(editDraft.country)) {
      setListingActionError(copy.selectCountryError);
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setListingActionError(copy.invalidPrice);
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty < 1) {
      setListingActionError(copy.quantityInvalidError);
      return;
    }
    setBusyListingId(listing.id);
    setListingActionError('');
    const res = await supabaseHelpers.updateClientMarketListing({
      listingId: listing.id,
      productName: editDraft.productName,
      asin: editDraft.asin,
      ean: editDraft.ean,
      country: editDraft.country,
      priceEur: parsedPrice,
      quantity: Math.floor(parsedQty),
      note: editDraft.note,
      linkFr: editDraft.linkFr,
      linkDe: editDraft.linkDe
    });
    if (res?.error) {
      console.error('Failed to update listing:', res.error);
      const errMessage = String(res.error?.message || '');
      setListingActionError(errMessage ? `${copy.editFailed} (${errMessage})` : copy.editFailed);
    } else {
      await loadAllListings();
      cancelEditListing();
    }
    setBusyListingId(null);
  };

  const openListingChat = async (listing) => {
    if (!listing?.id || !me) return;
    const conv = await supabaseHelpers.getOrCreateClientMarketConversation({
      listingId: listing.id
    });
    if (conv?.error) {
      console.error('Failed to open listing chat:', conv.error);
      return;
    }
    await loadConversations();
    if (conv?.data?.id) {
      setActiveConversationId(conv.data.id);
      window.dispatchEvent(
        new CustomEvent(CHAT_OPEN_B2B_EVENT, {
          detail: {
            conversationId: conv.data.id,
            market: listing?.country || market
          }
        })
      );
    }
  };

  const sendMessage = async () => {
    if (!activeConversationId || !me || !messageInput.trim() || sending) return;
    setSending(true);
    setSendError('');
    const res = await supabaseHelpers.sendClientMarketMessage({
      conversationId: activeConversationId,
      senderUserId: me,
      body: messageInput
    });
    if (!res?.error) {
      setMessageInput('');
      loadMessages();
      loadConversations();
    } else {
      console.error('Failed to send marketplace message:', res.error);
      setSendError(copy.sendFailed);
    }
    setSending(false);
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          {copy.authOnly}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">{copy.allOffers}</div>
          <div className="mb-2 flex items-center gap-2">
            <input
              value={allSearch}
              onChange={(e) => setAllSearch(e.target.value)}
              placeholder={copy.searchAllPlaceholder}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1">
            {loadingListings && <div className="text-sm text-slate-500">{copy.loading}</div>}
            {!loadingListings && marketListings.length === 0 && (
              <div className="text-sm text-slate-500">{copy.noOffers}</div>
            )}
            {listingActionError && <div className="text-xs font-medium text-red-600">{listingActionError}</div>}
            {marketListings.map((listing) => (
              <div key={listing.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <img
                      src={
                        failedImageIds.has(`listing-${listing.id}`)
                          ? '/images/product-placeholder.png'
                          : (getListingImageUrl(listing) || '/images/product-placeholder.png')
                      }
                      onError={() => {
                        setFailedImageIds((prev) => {
                          const next = new Set(prev);
                          next.add(`listing-${listing.id}`);
                          return next;
                        });
                      }}
                      alt={listing.product_name || 'Product'}
                      className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{listing.product_name}</div>
                        {listing.owner_user_id === me && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                            {copy.myOfferTag}
                          </span>
                        )}
                      </div>
                      {editingListingId === listing.id ? (
                        <div className="mt-2 space-y-2">
                          <input
                            value={editDraft.productName}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, productName: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            placeholder="Product name"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={editDraft.asin}
                              onChange={(e) => setEditDraft((prev) => ({ ...prev, asin: e.target.value }))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder="ASIN"
                            />
                            <input
                              value={editDraft.ean}
                              onChange={(e) => setEditDraft((prev) => ({ ...prev, ean: e.target.value }))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder="EAN"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editDraft.linkFr}
                              onChange={(e) => setEditDraft((prev) => ({ ...prev, linkFr: e.target.value }))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder={copy.linkFrPlaceholder}
                            />
                            <input
                              type="text"
                              value={editDraft.linkDe}
                              onChange={(e) => setEditDraft((prev) => ({ ...prev, linkDe: e.target.value }))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder={copy.linkDePlaceholder}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={editDraft.country}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, country: String(e.target.value || '').toUpperCase() }))
                              }
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            >
                              <option value="">Country</option>
                              {OFFER_COUNTRY_OPTIONS.map((code) => (
                                <option key={code} value={code}>{code}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={editDraft.quantity}
                              onChange={(e) => setEditDraft((prev) => ({ ...prev, quantity: e.target.value }))}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder={copy.quantityToSellLabel}
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editDraft.priceEur}
                              onChange={(e) => setEditDraft((prev) => ({ ...prev, priceEur: e.target.value }))}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              placeholder={copy.pricePlaceholder}
                            />
                          </div>
                          <textarea
                            value={editDraft.note}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, note: e.target.value }))}
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            placeholder={copy.notePlaceholder}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatProductCodes(copy, listing.asin, listing.ean)}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            {listing.quantity} {copy.qtyUnit} · {Number(listing.price_eur || 0).toFixed(2)} EUR · {listing.country || '-'}
                          </div>
                          {listing.note && <div className="mt-1 text-xs text-slate-500">{listing.note}</div>}
                          {(listing.link_fr || listing.link_de) && (
                            <div className="mt-1 space-y-1 text-xs text-slate-600">
                              {listing.link_fr && (
                                <a
                                  href={toExternalUrl(listing.link_fr)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-primary hover:underline"
                                >
                                  FR: {listing.link_fr}
                                </a>
                              )}
                              {listing.link_de && (
                                <a
                                  href={toExternalUrl(listing.link_de)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-primary hover:underline"
                                >
                                  DE: {listing.link_de}
                                </a>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {listing.owner_user_id === me ? (
                      <>
                        {editingListingId === listing.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEditListing(listing)}
                              disabled={busyListingId === listing.id}
                              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                            >
                              {copy.saveChanges}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditListing}
                              disabled={busyListingId === listing.id}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {copy.cancelEdit}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEditListing(listing)}
                              disabled={busyListingId === listing.id}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {copy.editListing}
                            </button>
                            <button
                              type="button"
                              onClick={() => finalizeListingSale(listing)}
                              disabled={busyListingId === listing.id}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {copy.finalizeSale}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeListing(listing)}
                              disabled={busyListingId === listing.id}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {copy.removeFromSale}
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => openListingChat(listing)}
                        className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                      >
                        {copy.contact}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">{copy.myOffersFromInventory}</div>
          <div className="mb-2 text-xs text-slate-500">{copy.inventorySectionHint}</div>
          <div className="rounded-xl border border-slate-200 p-3">
            <input
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder={copy.inventorySearchPlaceholder}
              className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />

            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {inventoryItems.length === 0 && (
                <div className="text-sm text-slate-500">{copy.noInventoryStock}</div>
              )}
              {inventoryItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedStockItemId(String(item.id))}
                  className={`w-full rounded-xl border p-2 text-left ${
                    String(item.id) === String(selectedStockItemId)
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        failedImageIds.has(String(item.id))
                          ? '/images/product-placeholder.png'
                          : (item.image_url || '/images/product-placeholder.png')
                      }
                      onError={() => {
                        setFailedImageIds((prev) => {
                          const next = new Set(prev);
                          next.add(String(item.id));
                          return next;
                        });
                      }}
                      alt={item.name || 'Product'}
                      className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{item.name || 'Product'}</div>
                      <div className="truncate text-xs text-slate-500">
                        {formatProductCodes(copy, item.asin, item.ean)}
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {copy.stockLabel} {getAvailableInventoryStock(item)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <form onSubmit={createListingFromInventory} className="mt-3 space-y-2 border-t border-slate-200 pt-3">
              <div className="text-xs text-slate-500">
                {selectedInventoryItem
                  ? `${copy.selectedLabel}: ${selectedInventoryItem.name || 'Product'} (${formatProductCodes(copy, selectedInventoryItem.asin, selectedInventoryItem.ean)})`
                  : copy.selectHint}
              </div>
              {selectedInventoryItem && (
                <div className="text-xs text-slate-500">
                  {copy.locatedIn
                    .replace('{name}', selectedInventoryItem.name || 'Product')
                    .replace('{country}', offerCountry || copy.countryNotSelected)}
                </div>
              )}
              <select
                value={offerCountry}
                onChange={(e) => setOfferCountry(String(e.target.value || '').toUpperCase())}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                aria-label={copy.listingCountryLabel}
                required
              >
                <option value="">{copy.listingCountryPlaceholder}</option>
                {OFFER_COUNTRY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500">{copy.listingCountryHelp}</div>
              <input
                type="number"
                min="1"
                step="1"
                value={quantityToSell}
                onChange={(e) => setQuantityToSell(e.target.value)}
                placeholder={copy.quantityToSellPlaceholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                aria-label={copy.quantityToSellLabel}
                required
              />
              {selectedInventoryItem && (
                <div className="text-xs text-slate-500">
                  {copy.availableStockLabel}: {Math.max(1, getAvailableInventoryStock(selectedInventoryItem))}
                </div>
              )}
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceEur}
                onChange={(e) => setPriceEur(e.target.value)}
                placeholder={copy.pricePlaceholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={copy.notePlaceholder}
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={linkFr}
                onChange={(e) => setLinkFr(e.target.value)}
                placeholder={copy.linkFrPlaceholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={linkDe}
                onChange={(e) => setLinkDe(e.target.value)}
                placeholder={copy.linkDePlaceholder}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              {createError && <div className="text-xs font-medium text-red-600">{createError}</div>}
              <button
                type="submit"
                disabled={!selectedStockItemId || !priceEur || !offerCountry || !quantityToSell || creating}
                className="w-full rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {creating ? copy.publishing : copy.addForSale}
              </button>
            </form>
          </div>

        </section>
      </div>

      {false && showChat && (
        <div className="fixed inset-0 z-[80] bg-black/35 p-4">
          <div className="mx-auto flex h-full max-h-[860px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{copy.chatTitle}</div>
                <div className="text-xs text-slate-500">{copy.chatSubtitle}</div>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="rounded-full p-1 text-slate-500 hover:text-slate-700"
                aria-label={copy.closeChat}
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="border-r border-slate-200 p-3">
                <div className="max-h-full space-y-2 overflow-y-auto pr-1">
                  {conversations.length === 0 && (
                    <div className="text-sm text-slate-500">{copy.noConversations}</div>
                  )}
                  {conversations.map((conv) => {
                    const listing = Array.isArray(conv.client_market_listings)
                      ? conv.client_market_listings[0]
                      : conv.client_market_listings;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setActiveConversationId(conv.id)}
                        className={`w-full rounded-lg border p-2 text-left ${
                          conv.id === activeConversationId
                            ? 'border-primary bg-primary/10'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="truncate text-xs font-semibold text-slate-800">
                          {listing?.product_name || copy.listingFallback}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {formatProductCodes(copy, listing?.asin, listing?.ean)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex h-full min-h-0 flex-col">
                <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-3">
                  {!activeConversation && (
                    <div className="text-sm text-slate-500">{copy.selectConversation}</div>
                  )}
                  {messages.map((msg) => {
                    const mine = msg.sender_user_id === me;
                    return (
                      <div key={msg.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-primary text-white' : 'bg-slate-100 text-slate-900'}`}>
                          <div className="whitespace-pre-wrap">{msg.body}</div>
                          <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-slate-500'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-slate-200 p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      rows={2}
                      placeholder={copy.writeMessagePlaceholder}
                      className="flex-1 resize-none rounded-lg border border-slate-200 p-2 text-sm"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!activeConversation || !messageInput.trim() || sending}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {copy.send}
                    </button>
                  </div>
                  {sendError && <div className="mt-2 text-xs font-medium text-red-600">{sendError}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
