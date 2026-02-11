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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '' });
  const [resolvedCompanyId, setResolvedCompanyId] = useState(null);

  const companyId = resolvedCompanyId || profile?.company_id || user?.id || null;
  const market = String(currentMarket || profile?.country || 'FR').toUpperCase();
  const staffLabel = staffLabelByCountry(market);
  const clientName = useMemo(() => buildClientName(profile, user), [profile, user]);

  useEffect(() => {
    if (!user?.id || !market || !open) return;
    let mounted = true;
    const loadConversation = async () => {
      setLoading(true);
      setError('');
      let effectiveCompanyId = profile?.company_id || null;
      if (!effectiveCompanyId) {
        const prof = await supabaseHelpers.getProfile(user.id);
        if (prof?.data?.company_id) {
          effectiveCompanyId = prof.data.company_id;
        } else if (!prof?.error && prof?.data?.id) {
          effectiveCompanyId = prof.data.company_id || user.id;
        }
      }
      if (!effectiveCompanyId) {
        effectiveCompanyId = user.id;
      }
      if (mounted) setResolvedCompanyId(effectiveCompanyId);
      const res = await supabaseHelpers.getChatConversation({
        companyId: effectiveCompanyId,
        country: market,
        userId: user.id,
        clientDisplayName: clientName
      });
      if (!mounted) return;
      if (!res.error) {
        setConversation(res.data);
      } else {
        setConversation(null);
        setError(res.error?.message || 'Chat unavailable.');
      }
      setLoading(false);
    };
    loadConversation();
    return () => {
      mounted = false;
    };
  }, [user?.id, market, clientName, open, profile?.company_id]);

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

  if (!user || !companyId) return null;

  const needsProfileDetails =
    !profile?.first_name || !profile?.last_name;

  const submitProfile = async (e) => {
    e?.preventDefault?.();
    const first = profileForm.first_name.trim();
    const last = profileForm.last_name.trim();
    if (!first || !last || !user?.id) return;
    setLoading(true);
    setError('');
    const res = await supabaseHelpers.updateProfile(user.id, {
      first_name: first,
      last_name: last
    });
    if (res?.error) {
      setError(res.error.message || 'Failed to save profile.');
      setLoading(false);
      return;
    }
    setLoading(false);
    setProfileForm({ first_name: '', last_name: '' });
    const convo = await supabaseHelpers.getChatConversation({
      companyId: resolvedCompanyId || companyId,
      country: market,
      userId: user.id,
      clientDisplayName: `${first} ${last}`
    });
    if (!convo.error) setConversation(convo.data);
  };

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
                <div className="text-sm font-semibold text-slate-900">Chat</div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1 text-slate-500 hover:text-slate-700"
                  aria-label="Close chat"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 px-4 py-6 text-sm text-slate-600">
                {needsProfileDetails ? (
                  <form onSubmit={submitProfile} className="space-y-3">
                    <div className="text-slate-900 font-medium">
                      Completează numele pentru a porni chatul
                    </div>
                    <input
                      value={profileForm.first_name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))}
                      placeholder="Prenume"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                    <input
                      value={profileForm.last_name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))}
                      placeholder="Nume"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-lg bg-primary px-3 py-2 text-white"
                    >
                      {loading ? 'Se salvează...' : 'Continuă'}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <div>Inițializăm conversația...</div>
                    {loading && <div className="text-xs text-slate-400">Se încarcă...</div>}
                    {error && <div className="text-xs text-red-500">{error}</div>}
                  </div>
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
