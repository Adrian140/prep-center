import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, MessageCircle } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { supabase, supabaseHelpers } from '@/config/supabase';
import ChatThread from '@/components/chat/ChatThread';

const staffLabelByCountry = (country) => {
  const upper = String(country || 'FR').toUpperCase();
  if (upper === 'DE') {
    return { name: 'EcomPrepHub Germany', person: 'Radu Cenusa' };
  }
  return { name: 'EcomPrepHub France', person: 'Adrian Bucur' };
};

export default function AdminChatWidget() {
  const { user, profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [metaByConversationId, setMetaByConversationId] = useState({});
  const [unreadByConversationId, setUnreadByConversationId] = useState({});
  const widgetRef = useRef(null);

  const isAdmin = profile?.is_admin === true || profile?.account_type === 'admin';
  const market = String(currentMarket || 'FR').toUpperCase();
  const staffLabel = staffLabelByCountry(market);

  const hydrateConversationMeta = async (rows = []) => {
    if (!rows.length) {
      setMetaByConversationId({});
      setUnreadByConversationId({});
      return;
    }

    const userIds = Array.from(new Set(rows.map((r) => r.client_user_id).filter(Boolean)));
    const companyIds = Array.from(new Set(rows.map((r) => r.company_id).filter(Boolean)));
    const profileIds = Array.from(new Set([...userIds, ...companyIds]));
    const lastMessageIds = Array.from(new Set(rows.map((r) => r.last_message_id).filter(Boolean)));

    const [profilesRes, lastMessagesRes, unreadEntries] = await Promise.all([
      profileIds.length
        ? supabase
            .from('profiles')
            .select('id, company_id, first_name, last_name, company_name, store_name')
            .in('id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      lastMessageIds.length
        ? supabase
            .from('chat_messages')
            .select('id, body, created_at')
            .in('id', lastMessageIds)
        : Promise.resolve({ data: [], error: null }),
      Promise.all(
        rows.map(async (conv) => {
          const res = await supabaseHelpers.getChatUnreadCount({ conversationId: conv.id });
          return [conv.id, res?.data || 0];
        })
      )
    ]);

    const byProfileId = {};
    (profilesRes?.data || []).forEach((p) => {
      byProfileId[p.id] = p;
    });
    const byMessageId = {};
    (lastMessagesRes?.data || []).forEach((m) => {
      byMessageId[m.id] = m;
    });

    const nextMeta = {};
    rows.forEach((conv) => {
      const userProfile = byProfileId[conv.client_user_id] || null;
      const companyProfile = byProfileId[conv.company_id] || null;
      const clientName =
        [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(' ').trim() ||
        conv.client_display_name ||
        'Client';
      const companyName =
        userProfile?.company_name ||
        userProfile?.store_name ||
        companyProfile?.company_name ||
        companyProfile?.store_name ||
        'Company';
      nextMeta[conv.id] = {
        clientName,
        companyName,
        lastMessage: byMessageId[conv.last_message_id] || null
      };
    });

    setMetaByConversationId(nextMeta);
    setUnreadByConversationId(Object.fromEntries(unreadEntries));
  };

  useEffect(() => {
    if (!user?.id || !isAdmin) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const res = await supabaseHelpers.listChatConversations({ country: market });
      if (!mounted) return;
      const rows = res?.data || [];
      setConversations(rows);
      await hydrateConversationMeta(rows);
      if (!activeId && rows.length) {
        const withUnread = rows.find((r) => (unreadByConversationId[r.id] || 0) > 0);
        setActiveId(withUnread?.id || rows[0].id);
      }
      setLoading(false);
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [user?.id, isAdmin, market, activeId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!widgetRef.current) return;
      if (!widgetRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const unreadTotal = useMemo(
    () => Object.values(unreadByConversationId).reduce((sum, n) => sum + Number(n || 0), 0),
    [unreadByConversationId]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );
  const activeMeta = activeConversation ? metaByConversationId[activeConversation.id] : null;

  if (!isAdmin || !user?.id) return null;

  return (
    <div ref={widgetRef} className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 h-[560px] w-[760px] max-w-[96vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="grid h-full grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-r border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Conversations
              </div>
              <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '510px' }}>
                {loading && conversations.length === 0 && (
                  <div className="text-sm text-slate-500">Loading...</div>
                )}
                {!loading && conversations.length === 0 && (
                  <div className="text-sm text-slate-500">No conversations.</div>
                )}
                {conversations.map((conv) => {
                  const meta = metaByConversationId[conv.id] || {};
                  const unread = unreadByConversationId[conv.id] || 0;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveId(conv.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                        conv.id === activeId
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            <Building2 size={14} className="text-slate-400" />
                            <span className="truncate">{meta.companyName || 'Company'}</span>
                          </div>
                          <div className="truncate text-[12px] text-slate-500">
                            {meta.clientName || conv.client_display_name || 'Client'}
                          </div>
                        </div>
                        {unread > 0 && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">
                            {unread}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="h-full">
              {activeConversation ? (
                <ChatThread
                  conversation={activeConversation}
                  currentUserId={user.id}
                  senderRole="admin"
                  staffLabel={staffLabel}
                  clientName={activeMeta?.clientName || activeConversation.client_display_name}
                  headerTitle={activeMeta?.companyName || 'Company'}
                  headerSubtitle={activeMeta?.clientName || activeConversation.client_display_name}
                  isAdmin
                  onClose={() => setOpen(false)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Select a conversation
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-colors ${
          unreadTotal > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'
        }`}
        aria-label="Open admin chat"
      >
        <MessageCircle size={24} />
        {unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-red-600 ring-2 ring-red-600">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>
    </div>
  );
}
