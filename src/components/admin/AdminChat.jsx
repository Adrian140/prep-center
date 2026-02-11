import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
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

  const market = String(currentMarket || 'FR').toUpperCase();
  const staffLabel = staffLabelByCountry(market);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const load = async () => {
      const res = await supabaseHelpers.listChatConversations({
        country: market,
        search: search?.trim() || null
      });
      if (!mounted) return;
      setConversations(res.data || []);
      if (!activeId && res.data?.length) {
        setActiveId(res.data[0].id);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [user?.id, market, search, activeId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients"
            className="w-full text-sm outline-none"
          />
        </div>
        <div className="space-y-2">
          {conversations.length === 0 && (
            <div className="text-sm text-slate-500">No conversations yet.</div>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveId(conv.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                conv.id === activeId
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="font-medium">{conv.client_display_name}</div>
              <div className="text-[11px] text-slate-400">
                {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString() : 'No messages'}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="h-[640px] rounded-xl border border-slate-200 bg-white shadow-sm">
        {activeConversation ? (
          <ChatThread
            conversation={activeConversation}
            currentUserId={user?.id}
            senderRole="admin"
            staffLabel={staffLabel}
            clientName={activeConversation.client_display_name}
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
