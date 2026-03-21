import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, ShoppingBag, MessageSquare, Package, Tag, Plus, Pencil, Check, Trash2, ExternalLink } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabaseHelpers } from '@/config/supabase';
import { useT } from '@/i18n/useT';

const OFFER_COUNTRY_OPTIONS = ['FR', 'DE'];

const BUTIC_COPY = {
  en: {
    heroTitle: 'B2B Exchange',
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
    inventorySectionHint: 'All inventory products are shown here. Products with stock are listed first.',
    inventorySearchPlaceholder: 'Search inventory: ASIN / EAN / name',
    noInventoryStock: 'No products found in inventory.',
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
    heroTitle: 'Schimb B2B',
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
    inventorySectionHint: 'Aici apar toate produsele din inventar. Cele cu stoc sunt afisate primele.',
    inventorySearchPlaceholder: 'Cauta in inventar: ASIN / EAN / nume',
    noInventoryStock: 'Nu ai produse in inventar.',
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
    heroTitle: 'Echange B2B',
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
    inventorySectionHint: 'Tous les produits de l inventaire sont affiches ici. Ceux avec stock apparaissent en premier.',
    inventorySearchPlaceholder: 'Rechercher en inventaire: ASIN / EAN / nom',
    noInventoryStock: 'Aucun produit trouve dans l inventaire.',
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
    heroTitle: 'B2B Austausch',
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
    inventorySectionHint: 'Hier werden alle Bestandsprodukte angezeigt. Produkte mit Bestand stehen oben.',
    inventorySearchPlaceholder: 'Im Bestand suchen: ASIN / EAN / Name',
    noInventoryStock: 'Keine Produkte im Bestand gefunden.',
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
    heroTitle: 'Scambio B2B',
    heroDescription: 'Offerte anonime. Aggiungi prodotti in vendita direttamente dal tuo inventario con prezzo e nota.',
    openChat: 'Apri chat', allOffers: 'Tutte le offerte', searchAllPlaceholder: 'ASIN / EAN / nome', loading: 'Caricamento...', noOffers: 'Nessuna offerta disponibile.', myOfferTag: 'La mia offerta', contact: 'Contatta', qtyUnit: 'pz', myOffersFromInventory: 'Le mie offerte (da inventario)', inventorySectionHint: 'Qui sono mostrati tutti i prodotti in inventario. Quelli con stock sono in alto.', inventorySearchPlaceholder: 'Cerca in inventario: ASIN / EAN / nome', noInventoryStock: 'Nessun prodotto trovato in inventario.', stockLabel: 'Stock', selectedLabel: 'Selezionato', selectHint: 'Seleziona un prodotto dall inventario, poi aggiungi prezzo + nota.', pricePlaceholder: 'Prezzo EUR', notePlaceholder: 'Nota (opzionale)', linkFrPlaceholder: 'Link FR (opzionale)', linkDePlaceholder: 'Link DE (opzionale)', linksLabel: 'Link', publishing: 'Pubblicazione...', addForSale: 'Aggiungi in vendita', listingCountryLabel: 'Paese di stoccaggio', listingCountryPlaceholder: 'Seleziona paese (FR/DE)', listingCountryHelp: 'Seleziona il paese del magazzino dove la merce e fisicamente stoccata.', countryNotSelected: 'non selezionato', locatedIn: 'Il prodotto "{name}" si trova in {country}.', quantityToSellLabel: 'Quantita da vendere', quantityToSellPlaceholder: 'Quantita da vendere', availableStockLabel: 'Stock disponibile', noMyOffers: 'Nessuna offerta pubblicata.', chatTitle: 'Chat Marketplace', chatSubtitle: 'Negoziazione tra clienti', closeChat: 'Chiudi chat', noConversations: 'Nessuna conversazione.', listingFallback: 'Annuncio', noCode: 'Nessun codice', selectConversation: 'Scegli una conversazione o premi "Contatta".', writeMessagePlaceholder: 'Scrivi un messaggio...', send: 'Invia', authOnly: 'Il marketplace e disponibile solo per clienti autenticati.', invalidPrice: 'Inserisci un prezzo valido maggiore di 0.', selectProductError: 'Seleziona prima un prodotto dall inventario.', selectCountryError: 'Seleziona il paese di stoccaggio (FR o DE).', quantityInvalidError: 'Inserisci una quantita valida da vendere.', quantityExceedsError: 'La quantita da vendere non puo superare lo stock disponibile.', publishFailed: 'Impossibile pubblicare l offerta. Riprova.', sendFailed: 'Impossibile inviare il messaggio. Riprova.', finalizeSale: 'Vendita completata', editListing: 'Modifica', saveChanges: 'Salva', cancelEdit: 'Annulla', removeFromSale: 'Rimuovi dalla vendita', editFailed: 'Impossibile aggiornare l offerta. Riprova.', finalizeSaleError: 'Impossibile completare la vendita. Riprova.', removeSaleError: 'Impossibile rimuovere l offerta. Riprova.', saleFeeHint: 'La chiusura applica una tariffa FBA di 0.05 EUR per unita.', asin: 'ASIN', ean: 'EAN',
  },
  es: {
    heroTitle: 'Intercambio B2B',
    heroDescription: 'Ofertas anonimas. Agrega productos para vender desde tu inventario con precio y nota.',
    openChat: 'Abrir chat', allOffers: 'Todas las ofertas', searchAllPlaceholder: 'ASIN / EAN / nombre', loading: 'Cargando...', noOffers: 'No hay ofertas disponibles.', myOfferTag: 'Mi oferta', contact: 'Contactar', qtyUnit: 'uds', myOffersFromInventory: 'Mis ofertas (desde inventario)', inventorySectionHint: 'Aqui se muestran todos los productos del inventario. Los que tienen stock aparecen primero.', inventorySearchPlaceholder: 'Buscar en inventario: ASIN / EAN / nombre', noInventoryStock: 'No hay productos en inventario.', stockLabel: 'Stock', selectedLabel: 'Seleccionado', selectHint: 'Selecciona un producto del inventario y agrega precio + nota.', pricePlaceholder: 'Precio EUR', notePlaceholder: 'Nota (opcional)', linkFrPlaceholder: 'Enlace FR (opcional)', linkDePlaceholder: 'Enlace DE (opcional)', linksLabel: 'Enlaces', publishing: 'Publicando...', addForSale: 'Agregar en venta', listingCountryLabel: 'Pais de almacen', listingCountryPlaceholder: 'Selecciona pais (FR/DE)', listingCountryHelp: 'Selecciona el pais del almacen donde la mercancia esta guardada fisicamente.', countryNotSelected: 'no seleccionado', locatedIn: 'El producto "{name}" esta en {country}.', quantityToSellLabel: 'Cantidad a vender', quantityToSellPlaceholder: 'Cantidad a vender', availableStockLabel: 'Stock disponible', noMyOffers: 'No tienes ofertas publicadas.', chatTitle: 'Chat Marketplace', chatSubtitle: 'Negociacion entre clientes', closeChat: 'Cerrar chat', noConversations: 'No tienes conversaciones aun.', listingFallback: 'Oferta', noCode: 'Sin codigo', selectConversation: 'Elige una conversacion o pulsa "Contactar".', writeMessagePlaceholder: 'Escribe un mensaje...', send: 'Enviar', authOnly: 'El marketplace esta disponible solo para clientes autenticados.', invalidPrice: 'Introduce un precio valido mayor que 0.', selectProductError: 'Selecciona primero un producto del inventario.', selectCountryError: 'Selecciona el pais de almacen (FR o DE).', quantityInvalidError: 'Introduce una cantidad valida para vender.', quantityExceedsError: 'La cantidad a vender no puede superar el stock disponible.', publishFailed: 'No se pudo publicar la oferta. Intentalo de nuevo.', sendFailed: 'No se pudo enviar el mensaje. Intentalo de nuevo.', finalizeSale: 'Venta finalizada', editListing: 'Editar', saveChanges: 'Guardar', cancelEdit: 'Cancelar', removeFromSale: 'Quitar de la venta', editFailed: 'No se pudo actualizar la oferta. Intentalo de nuevo.', finalizeSaleError: 'No se pudo finalizar la venta. Intentalo de nuevo.', removeSaleError: 'No se pudo quitar la oferta. Intentalo de nuevo.', saleFeeHint: 'Al finalizar se aplica una tarifa FBA de 0.05 EUR por unidad.', asin: 'ASIN', ean: 'EAN',
  }
};

function formatProductCodes(copy, asin, ean) {
  const a = String(asin || '').trim();
  const e = String(ean || '').trim();
  if (a && e) return `${copy.asin}: ${a} · ${copy.ean}: ${e}`;
  if (a) return `${copy.asin}: ${a}`;
  if (e) return `${copy.ean}: ${e}`;
  return copy.noCode;
}

function getListingImageUrl(listing) { return listing?.image_url || null; }

function toExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function getAvailableInventoryStock(item) {
  const qty = Number(item?.qty || 0);
  const byCountry = item?.prep_qty_by_country;
  if (!byCountry || typeof byCountry !== 'object') return qty;
  const prepSum = Object.values(byCountry).reduce((sum, v) => sum + (Number(v) || 0), 0);
  return Math.max(qty, prepSum);
}

const inputStyles = "w-full px-4 py-3 bg-white border border-gray-200 rounded-md text-lg text-text-primary placeholder:text-text-light focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-300 outline-none";

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
  const [editDraft, setEditDraft] = useState({ productName: '', asin: '', ean: '', country: '', quantity: '1', priceEur: '', note: '', linkFr: '', linkDe: '' });
  const [failedImageIds, setFailedImageIds] = useState(() => new Set());
  const me = user?.id || null;
  const market = String(currentMarket || profile?.country || 'FR').toUpperCase();
  const myCompanyId = profile?.company_id || null;

  const loadAllListings = async () => { if (!me) return; setLoadingListings(true); const res = await supabaseHelpers.listClientMarketListings({ country: null, search: allSearch.trim() || null }); setAllListings(res?.data || []); setLoadingListings(false); };
  const loadInventory = async () => { const res = await supabaseHelpers.listClientInventoryForMarket({ companyId: myCompanyId || null, search: inventorySearch.trim() || null }); const rows = (res?.data || []).slice(); rows.sort((a, b) => { const sA = getAvailableInventoryStock(a); const sB = getAvailableInventoryStock(b); if ((sA > 0 ? 1 : 0) !== (sB > 0 ? 1 : 0)) return (sB > 0 ? 1 : 0) - (sA > 0 ? 1 : 0); if (sA !== sB) return sB - sA; return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }); }); setInventoryItems(rows); };

  useEffect(() => { if (!me) return; loadAllListings(); }, [me, allSearch]);
  useEffect(() => { if (!me) return; loadInventory(); }, [me, inventorySearch, myCompanyId]);

  const selectedInventoryItem = useMemo(() => inventoryItems.find((item) => String(item.id) === String(selectedStockItemId)) || null, [inventoryItems, selectedStockItemId]);
  useEffect(() => { if (!selectedInventoryItem) { setQuantityToSell('1'); return; } const stock = Math.max(1, getAvailableInventoryStock(selectedInventoryItem)); setQuantityToSell((prev) => { const n = Number(prev); if (!Number.isFinite(n) || n < 1) return '1'; if (n > stock) return String(stock); return prev; }); }, [selectedInventoryItem?.id, selectedInventoryItem?.qty]);

  const marketListings = useMemo(() => allListings, [allListings]);

  const createListingFromInventory = async (event) => { event.preventDefault(); if (!selectedInventoryItem) { setCreateError(copy.selectProductError); return; } if (!offerCountry || !OFFER_COUNTRY_OPTIONS.includes(offerCountry)) { setCreateError(copy.selectCountryError); return; } const availableStock = Math.max(1, getAvailableInventoryStock(selectedInventoryItem)); const parsedQuantity = Number(quantityToSell); if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) { setCreateError(copy.quantityInvalidError); return; } if (parsedQuantity > availableStock) { setCreateError(copy.quantityExceedsError); return; } const parsedPrice = Number(priceEur); if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) { setCreateError(copy.invalidPrice); return; } if (!me) return; setCreateError(''); setCreating(true); setListingActionError(''); const res = await supabaseHelpers.createClientMarketListing({ ownerUserId: me, ownerCompanyId: myCompanyId || selectedInventoryItem?.company_id || me, stockItemId: selectedInventoryItem.id, country: offerCountry, asin: selectedInventoryItem.asin || null, ean: selectedInventoryItem.ean || null, imageUrl: selectedInventoryItem.image_url || null, productName: selectedInventoryItem.name || 'Product', priceEur: parsedPrice, quantity: Math.max(1, Math.floor(parsedQuantity)), note, linkFr, linkDe }); if (res?.error) { const errMsg = String(res.error?.message || ''); setCreateError(errMsg ? `${copy.publishFailed} (${errMsg})` : copy.publishFailed); } else { setPriceEur(''); setNote(''); setLinkFr(''); setLinkDe(''); setSelectedStockItemId(''); setOfferCountry(''); setQuantityToSell('1'); setCreateError(''); loadAllListings(); } setCreating(false); };

  const finalizeListingSale = async (listing) => { if (!listing?.id || busyListingId) return; setBusyListingId(listing.id); setListingActionError(''); const res = await supabaseHelpers.finalizeClientMarketSale({ listingId: listing.id, units: listing.quantity }); if (res?.error) { setListingActionError(copy.finalizeSaleError); } else { await loadAllListings(); } setBusyListingId(null); };
  const removeListing = async (listing) => { if (!listing?.id || busyListingId) return; setBusyListingId(listing.id); setListingActionError(''); const res = await supabaseHelpers.setClientMarketListingActive({ listingId: listing.id, isActive: false }); if (res?.error) { const errMsg = String(res.error?.message || ''); setListingActionError(errMsg ? `${copy.removeSaleError} (${errMsg})` : copy.removeSaleError); } else { await loadAllListings(); } setBusyListingId(null); };
  const beginEditListing = (listing) => { if (!listing?.id) return; setListingActionError(''); setEditingListingId(listing.id); setEditDraft({ productName: listing.product_name || '', asin: listing.asin || '', ean: listing.ean || '', country: String(listing.country || '').toUpperCase(), quantity: String(Math.max(1, Number(listing.quantity || 1))), priceEur: String(Number(listing.price_eur || 0)), note: listing.note || '', linkFr: listing.link_fr || '', linkDe: listing.link_de || '' }); };
  const cancelEditListing = () => { setEditingListingId(null); setEditDraft({ productName: '', asin: '', ean: '', country: '', quantity: '1', priceEur: '', note: '', linkFr: '', linkDe: '' }); };
  const saveEditListing = async (listing) => { if (!listing?.id || busyListingId) return; const parsedPrice = Number(editDraft.priceEur); const parsedQty = Number(editDraft.quantity); if (!editDraft.country || !OFFER_COUNTRY_OPTIONS.includes(editDraft.country)) { setListingActionError(copy.selectCountryError); return; } if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) { setListingActionError(copy.invalidPrice); return; } if (!Number.isFinite(parsedQty) || parsedQty < 1) { setListingActionError(copy.quantityInvalidError); return; } setBusyListingId(listing.id); setListingActionError(''); const res = await supabaseHelpers.updateClientMarketListing({ listingId: listing.id, productName: editDraft.productName, asin: editDraft.asin, ean: editDraft.ean, country: editDraft.country, priceEur: parsedPrice, quantity: Math.floor(parsedQty), note: editDraft.note, linkFr: editDraft.linkFr, linkDe: editDraft.linkDe }); if (res?.error) { const errMsg = String(res.error?.message || ''); setListingActionError(errMsg ? `${copy.editFailed} (${errMsg})` : copy.editFailed); } else { await loadAllListings(); cancelEditListing(); } setBusyListingId(null); };
  const openListingChat = async (listing) => {
    if (!listing?.id || !me) return;
    await supabaseHelpers.getOrCreateClientMarketConversation({ listingId: listing.id });
  };

  const handleImgError = (key) => { setFailedImageIds((prev) => { const next = new Set(prev); next.add(key); return next; }); };
  const imgSrc = (key, url) => failedImageIds.has(key) ? '/images/product-placeholder.png' : (url || '/images/product-placeholder.png');

  if (!user) {
    return (
      <div id="exchange_auth_gate" className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="bg-white rounded-md border border-gray-100 shadow-lg p-10 max-w-md w-full text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-orange-100 text-orange-600 mx-auto"><ShoppingBag className="w-7 h-7" /></div>
          <p className="text-xl text-text-primary font-semibold">{copy.heroTitle || 'Exchange'}</p>
          <p className="text-lg text-text-secondary font-light">{copy.authOnly}</p>
        </div>
      </div>
    );
  }

  return (
    <div id="exchange_root" className="min-h-screen">
      {/* HERO */}
      <section id="exchange_hero" className="relative overflow-hidden bg-[#060d19] pt-28 pb-16 lg:pt-36 lg:pb-24">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-orange-500/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-amber-500/8 rounded-full blur-[120px]" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-5 py-2.5 mb-8 backdrop-blur-md">
              <ShoppingBag className="w-4 h-4 text-orange-400" />
              <span className="text-lg text-white/60 font-medium">B2B Marketplace</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white mb-6 leading-[1.08] tracking-tight" style={{ textWrap: 'balance' }}>
              {copy.heroTitle || 'Exchange'}
            </h1>
            <p className="text-xl text-white/45 max-w-2xl leading-relaxed font-light">{copy.heroDescription}</p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent" />
      </section>

      {/* MAIN CONTENT */}
      <section id="exchange_content" className="py-12 lg:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

            {/* ALL OFFERS */}
            <div className="bg-white rounded-md border border-gray-100 hover:shadow-xl transition-all duration-500 overflow-hidden">
              <div className="h-1 bg-orange-500" />
              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-orange-500 flex items-center justify-center"><Tag className="w-5 h-5 text-white" /></div>
                    <h2 className="text-xl font-semibold text-text-primary">{copy.allOffers}</h2>
                  </div>
                  <span className="text-lg text-text-light font-light">{marketListings.length}</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-light" />
                  <input value={allSearch} onChange={(e) => setAllSearch(e.target.value)} placeholder={copy.searchAllPlaceholder} className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-md text-lg placeholder:text-text-light focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all" />
                </div>
                {listingActionError && <div className="px-4 py-3 rounded-md bg-red-50 border border-red-200 text-lg text-red-700">{listingActionError}</div>}
                <div className="max-h-[700px] space-y-3 overflow-y-auto pr-1">
                  {loadingListings && <div className="text-lg text-text-light font-light text-center py-8">{copy.loading}</div>}
                  {!loadingListings && marketListings.length === 0 && <div className="text-lg text-text-light font-light text-center py-8">{copy.noOffers}</div>}
                  {marketListings.map((listing) => (
                    <div key={listing.id} className="group rounded-md border border-gray-100 hover:border-gray-200 hover:shadow-md p-2.5 transition-all duration-300">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <img src={imgSrc(`listing-${listing.id}`, getListingImageUrl(listing))} onError={() => handleImgError(`listing-${listing.id}`)} alt={listing.product_name || 'Product'} className="h-10 w-10 shrink-0 rounded-md border border-gray-200 object-cover" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold leading-snug text-text-primary">{listing.product_name}</div>
                              {listing.owner_user_id === me && (<span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">{copy.myOfferTag}</span>)}
                            </div>
                            {editingListingId === listing.id ? (
                              <div className="mt-3 space-y-2">
                                <input value={editDraft.productName} onChange={(e) => setEditDraft((p) => ({ ...p, productName: e.target.value }))} className={inputStyles} placeholder="Product name" />
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={editDraft.asin} onChange={(e) => setEditDraft((p) => ({ ...p, asin: e.target.value }))} className={inputStyles} placeholder="ASIN" />
                                  <input value={editDraft.ean} onChange={(e) => setEditDraft((p) => ({ ...p, ean: e.target.value }))} className={inputStyles} placeholder="EAN" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input value={editDraft.linkFr} onChange={(e) => setEditDraft((p) => ({ ...p, linkFr: e.target.value }))} className={inputStyles} placeholder={copy.linkFrPlaceholder} />
                                  <input value={editDraft.linkDe} onChange={(e) => setEditDraft((p) => ({ ...p, linkDe: e.target.value }))} className={inputStyles} placeholder={copy.linkDePlaceholder} />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <select value={editDraft.country} onChange={(e) => setEditDraft((p) => ({ ...p, country: String(e.target.value || '').toUpperCase() }))} className={inputStyles}><option value="">Country</option>{OFFER_COUNTRY_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}</select>
                                  <input type="number" min="1" step="1" value={editDraft.quantity} onChange={(e) => setEditDraft((p) => ({ ...p, quantity: e.target.value }))} className={inputStyles} placeholder={copy.quantityToSellLabel} />
                                  <input type="number" min="0" step="0.01" value={editDraft.priceEur} onChange={(e) => setEditDraft((p) => ({ ...p, priceEur: e.target.value }))} className={inputStyles} placeholder={copy.pricePlaceholder} />
                                </div>
                                <textarea value={editDraft.note} onChange={(e) => setEditDraft((p) => ({ ...p, note: e.target.value }))} rows={2} className={inputStyles + " resize-none"} placeholder={copy.notePlaceholder} />
                              </div>
                            ) : (
                              <>
                                <div className="mt-1 text-sm text-text-secondary font-light">{formatProductCodes(copy, listing.asin, listing.ean)}</div>
                                <div className="mt-1 text-sm text-text-primary font-semibold">{listing.quantity} {copy.qtyUnit} · {Number(listing.price_eur || 0).toFixed(2)} EUR · {listing.country || '-'}</div>
                                {listing.note && <div className="mt-1 text-sm text-text-light font-light">{listing.note}</div>}
                                {(listing.link_fr || listing.link_de) && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {listing.link_fr && (<a href={toExternalUrl(listing.link_fr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ExternalLink className="w-3.5 h-3.5" />FR</a>)}
                                    {listing.link_de && (<a href={toExternalUrl(listing.link_de)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ExternalLink className="w-3.5 h-3.5" />DE</a>)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          {listing.owner_user_id === me ? (
                            editingListingId === listing.id ? (
                              <>
                                <button type="button" onClick={() => saveEditListing(listing)} disabled={busyListingId === listing.id} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-lg font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-all"><Check className="w-4 h-4" />{copy.saveChanges}</button>
                                <button type="button" onClick={cancelEditListing} disabled={busyListingId === listing.id} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-lg font-semibold text-text-secondary hover:bg-gray-50 disabled:opacity-60 transition-all">{copy.cancelEdit}</button>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => beginEditListing(listing)} disabled={busyListingId === listing.id} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-lg font-semibold text-text-secondary hover:bg-gray-50 disabled:opacity-60 transition-all"><Pencil className="w-4 h-4" />{copy.editListing}</button>
                                <button type="button" onClick={() => finalizeListingSale(listing)} disabled={busyListingId === listing.id} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-all"><Check className="w-4 h-4" />{copy.finalizeSale}</button>
                                <button type="button" onClick={() => removeListing(listing)} disabled={busyListingId === listing.id} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-lg font-semibold text-text-secondary hover:bg-gray-50 disabled:opacity-60 transition-all"><Trash2 className="w-4 h-4" />{copy.removeFromSale}</button>
                              </>
                            )
                          ) : (
                            <button onClick={() => openListingChat(listing)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark transition-all shadow-md shadow-primary/20"><MessageSquare className="w-3.5 h-3.5" />{copy.contact}</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* MY OFFERS / PUBLISH */}
            <div className="bg-white rounded-md border border-gray-100 hover:shadow-xl transition-all duration-500 overflow-hidden">
              <div className="h-1 bg-blue-600" />
              <div className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-blue-600 flex items-center justify-center"><Package className="w-5 h-5 text-white" /></div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">{copy.myOffersFromInventory}</h2>
                    <p className="text-lg text-text-light font-light">{copy.inventorySectionHint}</p>
                  </div>
                </div>
                <div className="rounded-md border border-gray-100 p-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-light" />
                    <input value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder={copy.inventorySearchPlaceholder} className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-md text-lg placeholder:text-text-light focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
                  </div>
                  <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                    {inventoryItems.length === 0 && <div className="text-lg text-text-light font-light text-center py-6">{copy.noInventoryStock}</div>}
                    {inventoryItems.map((item) => (
                      <button key={item.id} onClick={() => setSelectedStockItemId(String(item.id))} className={`w-full rounded-md border p-3 text-left transition-all duration-300 ${String(item.id) === String(selectedStockItemId) ? 'border-orange-400 bg-orange-50 shadow-md' : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'}`}>
                        <div className="flex items-center gap-3">
                          <img src={imgSrc(String(item.id), item.image_url)} onError={() => handleImgError(String(item.id))} alt={item.name || 'Product'} className="h-12 w-12 rounded-md border border-gray-200 object-cover" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-lg font-semibold text-text-primary">{item.name || 'Product'}</div>
                            <div className="truncate text-lg text-text-light font-light">{formatProductCodes(copy, item.asin, item.ean)}</div>
                          </div>
                          <div className="rounded-full bg-emerald-100 px-3 py-1.5 text-lg font-semibold text-emerald-700">{copy.stockLabel} {getAvailableInventoryStock(item)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <form onSubmit={createListingFromInventory} noValidate className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    <div className="text-lg text-text-secondary font-light">{selectedInventoryItem ? `${copy.selectedLabel}: ${selectedInventoryItem.name || 'Product'}` : copy.selectHint}</div>
                    {selectedInventoryItem && (
                      <div className="text-lg text-text-light font-light">{copy.locatedIn.replace('{name}', selectedInventoryItem.name || 'Product').replace('{country}', offerCountry || copy.countryNotSelected)}</div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <select value={offerCountry} onChange={(e) => setOfferCountry(e.target.value)} className={inputStyles}><option value="">{copy.listingCountryPlaceholder}</option>{OFFER_COUNTRY_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}</select>
                      <input type="number" min="1" step="1" value={quantityToSell} onChange={(e) => setQuantityToSell(e.target.value)} className={inputStyles} placeholder={copy.quantityToSellPlaceholder} />
                    </div>
                    {selectedInventoryItem && <div className="text-lg text-text-light font-light">{copy.availableStockLabel}: {getAvailableInventoryStock(selectedInventoryItem)}</div>}
                    <input type="number" min="0.01" step="0.01" value={priceEur} onChange={(e) => setPriceEur(e.target.value)} className={inputStyles} placeholder={copy.pricePlaceholder} />
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputStyles + " resize-none"} placeholder={copy.notePlaceholder} />
                    <div className="grid grid-cols-2 gap-3">
                      <input value={linkFr} onChange={(e) => setLinkFr(e.target.value)} className={inputStyles} placeholder={copy.linkFrPlaceholder} />
                      <input value={linkDe} onChange={(e) => setLinkDe(e.target.value)} className={inputStyles} placeholder={copy.linkDePlaceholder} />
                    </div>
                    {createError && <div className="px-4 py-3 rounded-md bg-red-50 border border-red-200 text-lg text-red-700">{createError}</div>}
                    <button type="submit" disabled={creating} className="group w-full inline-flex items-center justify-center gap-2 bg-primary text-white py-3.5 px-6 rounded-md font-semibold text-lg hover:bg-primary-dark transition-all duration-300 shadow-lg shadow-primary/20 disabled:opacity-50">
                      {creating ? copy.publishing : (<><Plus className="w-5 h-5" />{copy.addForSale}</>)}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
