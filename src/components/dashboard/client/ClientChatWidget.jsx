import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { supabaseHelpers } from '@/config/supabase';
import ChatThread from '@/components/chat/ChatThread';

const SUPPORTED_CHAT_MARKETS = ['FR', 'DE'];

const buildClientName = (profile, user) => {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  return 'Client';
};

const staffLabelByCountry = (country) => {
  const upper = String(country || 'FR').toUpperCase();
  if (upper === 'DE') {
    return { name: 'EcomPrepHub Germany', person: 'Radu Cenusa' };
  }
  return { name: 'EcomPrepHub France', person: 'Adrian Bucur' };
};

export default function ClientChatWidget() {
  const { user, profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const [open, setOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState('FR');
  const [conversationsByMarket, setConversationsByMarket] = useState({});
  const [unreadByMarket, setUnreadByMarket] = useState({});
  const [statusByMarket, setStatusByMarket] = useState({});

  const companyId = profile?.company_id || user?.id || null;
  const clientName = useMemo(() => buildClientName(profile, user), [profile, user]);
  const availableMarkets = useMemo(() => {
    const seed = [];
    if (Array.isArray(profile?.allowed_markets)) seed.push(...profile.allowed_markets);
    if (profile?.country) seed.push(profile.country);
    if (currentMarket) seed.push(currentMarket);
    const normalized = Array.from(
      new Set(seed.map((m) => String(m || '').toUpperCase()).filter(Boolean))
    ).filter((m) => SUPPORTED_CHAT_MARKETS.includes(m));
    return normalized.length ? normalized : ['FR'];
  }, [profile?.allowed_markets, profile?.country, currentMarket]);

  useEffect(() => {
    const preferred = String(currentMarket || '').toUpperCase();
    const next =
      availableMarkets.includes(preferred)
        ? preferred
        : availableMarkets.includes(selectedMarket)
        ? selectedMarket
        : availableMarkets[0];
    if (next && next !== selectedMarket) setSelectedMarket(next);
  }, [availableMarkets, currentMarket, selectedMarket]);

  const setMarketStatus = (market, patch) => {
    setStatusByMarket((prev) => ({ ...prev, [market]: { ...(prev[market] || {}), ...patch } }));
  };

  const loadConversation = async (market, { silent = false } = {}) => {
    if (!user?.id || !companyId || !market) return;
    if (!silent) setMarketStatus(market, { loading: true, error: '', forbidden: false });
    try {
      const res = await supabaseHelpers.getChatConversation({
        companyId,
        country: market,
        userId: user.id,
        clientDisplayName: clientName
      });
      if (res?.forbidden) {
        setConversationsByMarket((prev) => ({ ...prev, [market]: null }));
        setMarketStatus(market, { loading: false, error: '', forbidden: true });
        return;
      }
      if (res?.error) {
        setConversationsByMarket((prev) => ({ ...prev, [market]: null }));
        setMarketStatus(market, {
          loading: false,
          error: res.error.message || 'Could not load chat.',
          forbidden: false
        });
        return;
      }
      setConversationsByMarket((prev) => ({ ...prev, [market]: res?.data || null }));
      setMarketStatus(market, { loading: false, error: '', forbidden: false });
    } catch (err) {
      setConversationsByMarket((prev) => ({ ...prev, [market]: null }));
      setMarketStatus(market, {
        loading: false,
        error: err?.message || 'Could not load chat.',
        forbidden: false
      });
      console.error('Failed to load client chat conversation:', err);
    }
  };

  useEffect(() => {
    if (!user?.id || !companyId || availableMarkets.length === 0) return;
    availableMarkets.forEach((market) => {
      loadConversation(market);
    });
  }, [user?.id, companyId, clientName, availableMarkets.join('|')]);

  useEffect(() => {
    let cancelled = false;
    const fetchUnread = async () => {
      const entries = await Promise.all(
        availableMarkets.map(async (market) => {
          const conv = conversationsByMarket[market];
          if (!conv?.id) return [market, 0];
          const res = await supabaseHelpers.getChatUnreadCount({
            conversationId: conv.id
          });
          return [market, res?.data != null ? Number(res.data) : 0];
        })
      );
      if (!cancelled) {
        setUnreadByMarket((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [availableMarkets.join('|'), conversationsByMarket, open]);

  if (!user || !companyId) return null;

  const selectedConversation = conversationsByMarket[selectedMarket] || null;
  const selectedStatus = statusByMarket[selectedMarket] || {};
  const staffLabel = staffLabelByCountry(selectedMarket);
  const unreadTotal = Object.values(unreadByMarket).reduce((sum, n) => sum + Number(n || 0), 0);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 h-[520px] w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 shadow-2xl">
          <div className="flex h-full flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                {availableMarkets.map((market) => {
                  const active = market === selectedMarket;
                  const marketUnread = unreadByMarket[market] || 0;
                  return (
                    <button
                      key={market}
                      onClick={() => setSelectedMarket(market)}
                      className={`relative rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        active
                          ? 'border-primary bg-primary text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {market}
                      {marketUnread > 0 && (
                        <span
                          className={`absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] ${
                            active ? 'bg-white text-red-600' : 'bg-red-600 text-white'
                          }`}
                        >
                          {marketUnread > 9 ? '9+' : marketUnread}
                        </span>
                      )}
                    </button>
                  );
                })}
                <div className="text-xs text-slate-500">{staffLabel.name}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-slate-500 hover:text-slate-700"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {selectedConversation ? (
                <ChatThread
                  conversation={selectedConversation}
                  currentUserId={user.id}
                  senderRole="client"
                  staffLabel={staffLabel}
                  clientName={clientName}
                  onClose={() => setOpen(false)}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                  {selectedStatus?.loading ? (
                    <span>Loading chat...</span>
                  ) : selectedStatus?.error ? (
                    <div className="space-y-3">
                      <div>{selectedStatus.error}</div>
                      <button
                        onClick={() => loadConversation(selectedMarket)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Retry
                      </button>
                    </div>
                  ) : selectedStatus?.forbidden ? (
                    <span>Chat is not enabled for this market.</span>
                  ) : (
                    <span>Preparing chat...</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ${
          unreadTotal > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'
        }`}
        aria-label="Open chat"
      >
        <MessageCircle size={24} />
        {unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-red-600 ring-2 ring-red-600">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>
    </div>
  );
}
