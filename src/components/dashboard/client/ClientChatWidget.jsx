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

  const companyId = profile?.company_id || user?.id || null;
  const market = String(currentMarket || profile?.country || 'FR').toUpperCase();
  const staffLabel = staffLabelByCountry(market);
  const clientName = useMemo(() => buildClientName(profile, user), [profile, user]);

  useEffect(() => {
    if (!user?.id || !companyId || !market) return;
    let mounted = true;
    const loadConversation = async () => {
      try {
        const res = await supabaseHelpers.getChatConversation({
          companyId,
          country: market,
          userId: user.id,
          clientDisplayName: clientName
        });
        if (!mounted) return;
        if (res?.forbidden) {
          setChatUnavailable(true);
          setConversation(null);
          return;
        }
        if (!res?.error) {
          setConversation(res.data || null);
          setChatUnavailable(false);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load client chat conversation:', err);
      }
    };
    loadConversation();
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
      {open && conversation && (
        <div className="mb-3 h-[520px] w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200 shadow-2xl">
          <ChatThread
            conversation={conversation}
            currentUserId={user.id}
            senderRole="client"
            staffLabel={staffLabel}
            clientName={clientName}
            onClose={() => setOpen(false)}
          />
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
