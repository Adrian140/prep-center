import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { supabase, supabaseHelpers } from '@/config/supabase';
import { useT } from '@/i18n/useT';

export default function Butic() {
  const t = useT();
  const { user, profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [onlyMine, setOnlyMine] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);
  const [listings, setListings] = useState([]);
  const [creating, setCreating] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    asin: '',
    ean: '',
    productName: '',
    priceEur: '',
    quantity: 1,
    note: ''
  });
  const messagesRef = useRef(null);

  const isAdmin = !!(
    profile?.account_type === 'admin' ||
    profile?.is_admin === true ||
    user?.user_metadata?.account_type === 'admin'
  );
  const market = String(currentMarket || profile?.country || 'FR').toUpperCase();
  const me = user?.id || null;

  useEffect(() => {
    setCountryFilter(String(currentMarket || 'FR').toUpperCase());
  }, [currentMarket]);

  const loadListings = async () => {
    if (!me) return;
    setLoadingListings(true);
    const res = await supabaseHelpers.listClientMarketListings({
      country: countryFilter === 'ALL' ? null : countryFilter,
      search: search.trim() || null
    });
    const rows = (res?.data || []).filter((row) => (onlyMine ? row.owner_user_id === me : true));
    setListings(rows);
    setLoadingListings(false);
  };

  const loadConversations = async () => {
    if (!me) return;
    const res = await supabaseHelpers.listClientMarketConversations({ country: market });
    const rows = res?.data || [];
    setConversations(rows);
    if (!activeConversationId && rows.length) {
      setActiveConversationId(rows[0].id);
    }
    if (activeConversationId && rows.length && !rows.some((r) => r.id === activeConversationId)) {
      setActiveConversationId(rows[0].id);
    }
  };

  useEffect(() => {
    if (!me || isAdmin) return;
    loadListings();
    const t = setInterval(loadListings, 10000);
    return () => clearInterval(t);
  }, [me, isAdmin, market, search, onlyMine, countryFilter]);

  useEffect(() => {
    if (!me || isAdmin) return;
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, [me, isAdmin, market]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const loadMessages = async () => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    const res = await supabaseHelpers.listClientMarketMessages({
      conversationId: activeConversationId
    });
    setMessages(res?.data || []);
    setLoadingMessages(false);
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

  const createListing = async (event) => {
    event.preventDefault();
    if (!me || !form.productName.trim() || !form.priceEur) return;
    setCreating(true);
    const ownerCompanyId = profile?.company_id || me;
    const res = await supabaseHelpers.createClientMarketListing({
      ownerUserId: me,
      ownerCompanyId,
      country: market,
      asin: form.asin,
      ean: form.ean,
      productName: form.productName,
      priceEur: form.priceEur,
      quantity: form.quantity,
      note: form.note
    });
    if (res?.error) {
      console.error('Failed to create listing:', res.error);
    } else {
      setForm({ asin: '', ean: '', productName: '', priceEur: '', quantity: 1, note: '' });
      loadListings();
    }
    setCreating(false);
  };

  const openListingChat = async (listing) => {
    if (!listing?.id || !me) return;
    if (listing.owner_user_id === me) return;
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
    }
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
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
        <div className="text-lg font-semibold text-orange-800">
          {t('nav.exchange', 'Exchange')} & {t('nav.resale', 'Revente')}
        </div>
        <div className="text-sm text-orange-700">
          Listările afișează doar produsul. Fără nume companie. Discuțiile se fac privat în chat.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <form onSubmit={createListing} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-slate-800">Adaugă produs în Butic</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.asin}
                onChange={(e) => setForm((f) => ({ ...f, asin: e.target.value }))}
                placeholder="ASIN"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={form.ean}
                onChange={(e) => setForm((f) => ({ ...f, ean: e.target.value }))}
                placeholder="EAN"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <input
              value={form.productName}
              onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              placeholder="Nume produs"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.priceEur}
                onChange={(e) => setForm((f) => ({ ...f, priceEur: e.target.value }))}
                placeholder="Preț EUR"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="Cantitate"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Notă (opțional)"
              rows={2}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creating}
              className="mt-2 w-full rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {creating ? 'Se adaugă...' : 'Publică produs'}
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="ALL">All countries</option>
                <option value="FR">FR</option>
                <option value="DE">DE</option>
                <option value="IT">IT</option>
                <option value="ES">ES</option>
              </select>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Caută după ASIN / EAN / nume"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                />
                ale mele
              </label>
            </div>

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {loadingListings && <div className="text-sm text-slate-500">Se încarcă...</div>}
              {!loadingListings && listings.length === 0 && (
                <div className="text-sm text-slate-500">Nu există produse încă.</div>
              )}
              {listings.map((listing) => (
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
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-slate-400">
                      {new Date(listing.created_at).toLocaleString()}
                    </div>
                    {listing.owner_user_id === me ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        Listingul tău
                      </span>
                    ) : (
                      <button
                        onClick={() => openListingChat(listing)}
                        className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                      >
                        Contactează
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-0 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">Chat Butic</div>
            <div className="text-xs text-slate-500">Discuții anonime între clienți</div>
          </div>
          <div className="grid h-[760px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-r border-slate-200 p-3">
              <div className="max-h-[700px] space-y-2 overflow-y-auto pr-1">
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
                  <div className="text-sm text-slate-500">Alege o conversație sau apasă „Contactează” pe un produs.</div>
                )}
                {loadingMessages && <div className="text-sm text-slate-500">Se încarcă mesaje...</div>}
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
                <div className="mt-1 text-[11px] text-slate-400">
                  Pentru facturi: atașarea de fișiere vine în pasul următor.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
