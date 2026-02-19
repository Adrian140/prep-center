import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { supabase, supabaseHelpers } from '@/config/supabase';
import { useT } from '@/i18n/useT';

const COUNTRY_OPTIONS = ['ALL', 'FR', 'DE', 'IT', 'ES'];

export default function Butic() {
  const t = useT();
  const { user, profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [allSearch, setAllSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [loadingListings, setLoadingListings] = useState(false);
  const [allListings, setAllListings] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedStockItemId, setSelectedStockItemId] = useState('');
  const [priceEur, setPriceEur] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef(null);

  const isAdmin = !!(
    profile?.account_type === 'admin' ||
    profile?.is_admin === true ||
    user?.user_metadata?.account_type === 'admin'
  );
  const me = user?.id || null;
  const market = String(currentMarket || profile?.country || 'FR').toUpperCase();
  const myCompanyId = profile?.company_id || me;

  useEffect(() => {
    setCountryFilter(String(currentMarket || 'FR').toUpperCase());
  }, [currentMarket]);

  const loadAllListings = async () => {
    if (!me) return;
    setLoadingListings(true);
    const res = await supabaseHelpers.listClientMarketListings({
      country: countryFilter === 'ALL' ? null : countryFilter,
      search: allSearch.trim() || null
    });
    setAllListings(res?.data || []);
    setLoadingListings(false);
  };

  const loadInventory = async () => {
    if (!myCompanyId) return;
    const res = await supabaseHelpers.listClientInventoryForMarket({
      companyId: myCompanyId,
      search: inventorySearch.trim() || null
    });
    setInventoryItems((res?.data || []).filter((row) => Number(row?.qty || 0) > 0));
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
    if (!me || isAdmin) return;
    loadAllListings();
    const timer = setInterval(loadAllListings, 10000);
    return () => clearInterval(timer);
  }, [me, isAdmin, countryFilter, allSearch]);

  useEffect(() => {
    if (!me || isAdmin) return;
    loadInventory();
  }, [me, isAdmin, myCompanyId, inventorySearch]);

  useEffect(() => {
    if (!me || isAdmin) return;
    loadConversations();
    const timer = setInterval(loadConversations, 5000);
    return () => clearInterval(timer);
  }, [me, isAdmin, market]);

  const selectedInventoryItem = useMemo(
    () => inventoryItems.find((item) => item.id === selectedStockItemId) || null,
    [inventoryItems, selectedStockItemId]
  );

  const myListings = useMemo(
    () => allListings.filter((row) => row.owner_user_id === me),
    [allListings, me]
  );
  const marketListings = useMemo(
    () => allListings.filter((row) => row.owner_user_id !== me),
    [allListings, me]
  );

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
    if (!selectedInventoryItem || !priceEur || !me) return;
    setCreating(true);
    const res = await supabaseHelpers.createClientMarketListing({
      ownerUserId: me,
      ownerCompanyId: myCompanyId,
      stockItemId: selectedInventoryItem.id,
      country: market,
      asin: selectedInventoryItem.asin || null,
      ean: selectedInventoryItem.ean || null,
      productName: selectedInventoryItem.name || 'Product',
      priceEur,
      quantity: Math.max(1, Number(selectedInventoryItem.qty || 1)),
      note
    });
    if (res?.error) {
      console.error('Failed to create listing:', res.error);
    } else {
      setPriceEur('');
      setNote('');
      setSelectedStockItemId('');
      loadAllListings();
    }
    setCreating(false);
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
    if (conv?.data?.id) setActiveConversationId(conv.data.id);
  };

  const sendMessage = async () => {
    if (!activeConversationId || !me || !messageInput.trim() || sending) return;
    setSending(true);
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
    }
    setSending(false);
  };

  if (!user || isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          Butic este disponibil doar pentru clienți autentificați.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
        <div className="text-lg font-semibold text-orange-800">
          {t('nav.exchange', 'Exchange')} & {t('nav.resale', 'Revente')}
        </div>
        <div className="text-sm text-orange-700">
          1) Toate ofertele clienților, 2) Ofertele tale din inventar, 3) Chat de negociere.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_420px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">Toate ofertele</div>
          <div className="mb-2 flex items-center gap-2">
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              {COUNTRY_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code === 'ALL' ? 'All' : code}
                </option>
              ))}
            </select>
            <input
              value={allSearch}
              onChange={(e) => setAllSearch(e.target.value)}
              placeholder="ASIN / EAN / nume"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1">
            {loadingListings && <div className="text-sm text-slate-500">Se încarcă...</div>}
            {!loadingListings && marketListings.length === 0 && (
              <div className="text-sm text-slate-500">Nu există oferte.</div>
            )}
            {marketListings.map((listing) => (
              <div key={listing.id} className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-900">{listing.product_name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {listing.asin ? `ASIN: ${listing.asin} · ` : ''}
                  {listing.ean ? `EAN: ${listing.ean}` : ''}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  {listing.quantity} buc · {Number(listing.price_eur || 0).toFixed(2)} EUR
                </div>
                {listing.note && <div className="mt-1 text-xs text-slate-500">{listing.note}</div>}
                <button
                  onClick={() => openListingChat(listing)}
                  className="mt-2 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                >
                  Contactează
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">Ofertele mele (din inventar)</div>
          <form onSubmit={createListingFromInventory} className="space-y-2 rounded-xl border border-slate-200 p-3">
            <input
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="Caută în inventar: ASIN / EAN / nume"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={selectedStockItemId}
              onChange={(e) => setSelectedStockItemId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            >
              <option value="">Selectează produs din inventar...</option>
              {inventoryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.name || 'Produs')} | ASIN {item.asin || '-'} | EAN {item.ean || '-'} | Qty {item.qty || 0}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceEur}
              onChange={(e) => setPriceEur(e.target.value)}
              placeholder="Preț EUR"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notă (opțional)"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!selectedStockItemId || !priceEur || creating}
              className="w-full rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {creating ? 'Se publică...' : 'Publică oferta'}
            </button>
          </form>

          <div className="mt-3 max-h-[440px] space-y-2 overflow-y-auto pr-1">
            {myListings.length === 0 && <div className="text-sm text-slate-500">Nu ai oferte publicate.</div>}
            {myListings.map((listing) => (
              <div key={listing.id} className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div className="text-sm font-semibold text-slate-900">{listing.product_name}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {listing.quantity} buc · {Number(listing.price_eur || 0).toFixed(2)} EUR
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Chat Butic</div>
            <div className="text-xs text-slate-500">Negociere între clienți</div>
          </div>
          <div className="grid h-[820px] grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="border-r border-slate-200 p-3">
              <div className="max-h-[770px] space-y-2 overflow-y-auto pr-1">
                {conversations.length === 0 && (
                  <div className="text-sm text-slate-500">Nu ai conversații încă.</div>
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
                        {listing?.product_name || 'Listing'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {listing?.asin ? `ASIN ${listing.asin}` : listing?.ean ? `EAN ${listing.ean}` : 'No code'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex h-full flex-col">
              <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-3">
                {!activeConversation && (
                  <div className="text-sm text-slate-500">Alege o conversație sau apasă „Contactează”.</div>
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
                    placeholder="Scrie mesaj..."
                    className="flex-1 resize-none rounded-lg border border-slate-200 p-2 text-sm"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!activeConversation || !messageInput.trim() || sending}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    Trimite
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
