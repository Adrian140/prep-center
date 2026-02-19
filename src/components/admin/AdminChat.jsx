import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Search } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { supabase } from '@/config/supabase';
import { supabaseHelpers } from '@/config/supabase';
import ChatThread from '@/components/chat/ChatThread';

const staffLabelByCountry = (country) => {
  const upper = String(country || 'FR').toUpperCase();
  if (upper === 'DE') {
    return { name: 'EcomPrepHub Germany', person: 'Radu Cenusa' };
  }
  return { name: 'EcomPrepHub France', person: 'Adrian Bucur' };
};

export default function AdminChat() {
  const { user } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState('');
  const [metaByConversationId, setMetaByConversationId] = useState({});
  const [unreadByConversationId, setUnreadByConversationId] = useState({});
  const [loading, setLoading] = useState(false);

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
            .select('id, body, created_at, sender_role')
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
    if (!user?.id) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const res = await supabaseHelpers.listChatConversations({
        country: market,
        search: search?.trim() || null
      });
      if (!mounted) return;
      const rows = res.data || [];
      setConversations(rows);
      await hydrateConversationMeta(rows);
      if (!activeId && rows.length) {
        setActiveId(rows[0].id);
      }
      if (activeId && rows.length && !rows.some((r) => r.id === activeId)) {
        setActiveId(rows[0].id);
      }
      setLoading(false);
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [user?.id, market, search, activeId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );
  const activeMeta = activeConversation ? metaByConversationId[activeConversation.id] : null;

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const meta = metaByConversationId[conv.id];
      const company = String(meta?.companyName || '').toLowerCase();
      const client = String(meta?.clientName || conv.client_display_name || '').toLowerCase();
      return company.includes(q) || client.includes(q);
    });
  }, [conversations, metaByConversationId, search]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or client"
            className="w-full text-sm outline-none"
          />
        </div>
        <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
          {loading && filteredConversations.length === 0 && (
            <div className="text-sm text-slate-500">Loading conversations...</div>
          )}
          {!loading && filteredConversations.length === 0 && (
            <div className="text-sm text-slate-500">No conversations yet.</div>
          )}
          {filteredConversations.map((conv) => {
            const meta = metaByConversationId[conv.id] || {};
            const unread = unreadByConversationId[conv.id] || 0;
            const preview = meta?.lastMessage?.body || 'No messages';
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
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-[11px] text-slate-500">
                {preview}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString() : 'No activity'}
              </div>
            </button>
          )})}
        </div>
      </div>
      <div className="h-[640px] rounded-xl border border-slate-200 bg-white shadow-sm">
        {activeConversation ? (
          <ChatThread
            conversation={activeConversation}
            currentUserId={user?.id}
            senderRole="admin"
            staffLabel={staffLabel}
            clientName={activeMeta?.clientName || activeConversation.client_display_name}
            headerTitle={activeMeta?.companyName || 'Company'}
            headerSubtitle={activeMeta?.clientName || activeConversation.client_display_name}
            isAdmin
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
