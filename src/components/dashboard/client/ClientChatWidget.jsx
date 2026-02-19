import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { supabaseHelpers } from '@/config/supabase';
import ChatThread from '@/components/chat/ChatThread';

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
  const [conversation, setConversation] = useState(null);
  const [unread, setUnread] = useState(0);
  const [chatUnavailable, setChatUnavailable] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [conversationError, setConversationError] = useState('');

  const companyId = profile?.company_id || user?.id || null;
  const market = String(currentMarket || profile?.country || 'FR').toUpperCase();
  const staffLabel = staffLabelByCountry(market);
  const clientName = useMemo(() => buildClientName(profile, user), [profile, user]);

  const loadConversation = async () => {
    if (!user?.id || !companyId || !market) return;
    setLoadingConversation(true);
    setConversationError('');
    try {
      const res = await supabaseHelpers.getChatConversation({
        companyId,
        country: market,
        userId: user.id,
        clientDisplayName: clientName
      });
      if (res?.forbidden) {
        setChatUnavailable(true);
        setConversation(null);
        return;
      }
      if (res?.error) {
        setConversation(null);
        setConversationError(res.error.message || 'Could not load chat.');
        return;
      }
      setConversation(res?.data || null);
      setChatUnavailable(false);
    } catch (err) {
      setConversation(null);
      setConversationError(err?.message || 'Could not load chat.');
      console.error('Failed to load client chat conversation:', err);
    } finally {
      setLoadingConversation(false);
    }
  };

  useEffect(() => {
    if (!user?.id || !companyId || !market) return;
    let mounted = true;
    const run = async () => {
      await loadConversation();
      if (!mounted) return;
    };
    run();
    return () => {
      mounted = false;
    };
  }, [user?.id, companyId, market, clientName]);

  useEffect(() => {
    if (!conversation?.id || open) {
      if (open) setUnread(0);
      return;
    }
    let cancelled = false;
    const fetchUnread = async () => {
      const res = await supabaseHelpers.getChatUnreadCount({
        conversationId: conversation.id
      });
      if (!cancelled && res?.data != null) setUnread(res.data);
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversation?.id, open]);

  if (!user || !companyId || chatUnavailable) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 h-[520px] w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 shadow-2xl">
          {conversation ? (
            <ChatThread
              conversation={conversation}
              currentUserId={user.id}
              senderRole="client"
              staffLabel={staffLabel}
              clientName={clientName}
              onClose={() => setOpen(false)}
            />
          ) : (
            <div className="flex h-full flex-col bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Chat support</div>
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
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
                {loadingConversation ? (
                  <span>Loading chat...</span>
                ) : conversationError ? (
                  <div className="space-y-3">
                    <div>{conversationError}</div>
                    <button
                      onClick={loadConversation}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <span>Preparing chat...</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90"
        aria-label="Open chat"
      >
        <MessageCircle size={24} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
        )}
      </button>
    </div>
  );
}
