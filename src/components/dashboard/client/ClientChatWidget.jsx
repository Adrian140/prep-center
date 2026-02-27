import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Paperclip, Send } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { supabase, supabaseHelpers } from '@/config/supabase';
import ChatThread from '@/components/chat/ChatThread';

const SUPPORTED_CHAT_MARKETS = ['FR', 'DE'];
const CHAT_OPEN_B2B_EVENT = 'client-chat:open-b2b';
const MAX_B2B_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_B2B_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

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

const formatMessageTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const listingFromConversation = (conv) => {
  const row = conv?.client_market_listings;
  if (Array.isArray(row)) return row[0] || null;
  return row || null;
};

export default function ClientChatWidget() {
  const { user, profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('support'); // support | b2b
  const [isPageVisible, setIsPageVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );

  const [selectedMarket, setSelectedMarket] = useState('FR');
  const [conversationsByMarket, setConversationsByMarket] = useState({});
  const [unreadByMarket, setUnreadByMarket] = useState({});
  const [statusByMarket, setStatusByMarket] = useState({});

  const [b2bConversations, setB2bConversations] = useState([]);
  const [b2bProfileNamesById, setB2bProfileNamesById] = useState({});
  const [b2bCompanyNamesById, setB2bCompanyNamesById] = useState({});
  const [b2bUnreadByConversationId, setB2bUnreadByConversationId] = useState({});
  const [b2bReadByConversationId, setB2bReadByConversationId] = useState({});
  const [b2bLoading, setB2bLoading] = useState(false);
  const [b2bError, setB2bError] = useState('');
  const [activeB2bConversationId, setActiveB2bConversationId] = useState(null);
  const [b2bMessages, setB2bMessages] = useState([]);
  const [b2bInput, setB2bInput] = useState('');
  const [b2bFiles, setB2bFiles] = useState([]);
  const [b2bAttachmentUrls, setB2bAttachmentUrls] = useState({});
  const [b2bSending, setB2bSending] = useState(false);
  const [b2bSendError, setB2bSendError] = useState('');

  const widgetRef = useRef(null);
  const b2bScrollRef = useRef(null);
  const b2bFileInputRef = useRef(null);
  const b2bReadStorageKey = useMemo(
    () => (user?.id ? `client_b2b_read_v1_${user.id}` : ''),
    [user?.id]
  );

  const isAdmin = !!(
    profile?.account_type === 'admin' ||
    profile?.is_admin === true ||
    user?.user_metadata?.account_type === 'admin'
  );

  const companyId = profile?.company_id || user?.id || null;
  const clientName = useMemo(() => buildClientName(profile, user), [profile, user]);
  const trackedMarkets = SUPPORTED_CHAT_MARKETS;

  useEffect(() => {
    const preferred = String(currentMarket || 'FR').toUpperCase();
    const next = SUPPORTED_CHAT_MARKETS.includes(preferred) ? preferred : 'FR';
    if (next && next !== selectedMarket) setSelectedMarket(next);
  }, [currentMarket, selectedMarket]);

  useEffect(() => {
    if (!b2bReadStorageKey) return;
    try {
      const raw = localStorage.getItem(b2bReadStorageKey);
      if (!raw) {
        setB2bReadByConversationId({});
        return;
      }
      const parsed = JSON.parse(raw);
      setB2bReadByConversationId(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setB2bReadByConversationId({});
    }
  }, [b2bReadStorageKey]);

  useEffect(() => {
    if (!b2bReadStorageKey) return;
    try {
      localStorage.setItem(b2bReadStorageKey, JSON.stringify(b2bReadByConversationId || {}));
    } catch {
      // ignore storage write errors
    }
  }, [b2bReadStorageKey, b2bReadByConversationId]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const markB2bConversationRead = (conversationId, at) => {
    if (!conversationId) return;
    const stamp = String(at || new Date().toISOString());
    setB2bReadByConversationId((prev) => {
      const current = prev?.[conversationId];
      if (current && new Date(current).getTime() >= new Date(stamp).getTime()) return prev;
      return { ...(prev || {}), [conversationId]: stamp };
    });
  };

  const setMarketStatus = (market, patch) => {
    setStatusByMarket((prev) => ({ ...prev, [market]: { ...(prev[market] || {}), ...patch } }));
  };

  const loadSupportConversation = async (market, { silent = false } = {}) => {
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
      console.error('Failed to load client support conversation:', err);
    }
  };

  const loadB2bConversations = async ({ silent = false } = {}) => {
    if (!user?.id) return;
    if (!silent) setB2bLoading(true);
    setB2bError('');
    const res = await supabaseHelpers.listClientMarketConversations();
    if (res?.error) {
      console.error('Failed to load B2B conversations:', res.error);
      setB2bError(res.error.message || 'Could not load B2B chat.');
      if (!silent) setB2bLoading(false);
      return;
    }
    const rows = Array.isArray(res?.data) ? res.data : [];
    setB2bConversations(rows);
    setActiveB2bConversationId((prev) => {
      if (prev && rows.some((row) => row.id === prev)) return prev;
      return rows[0]?.id || null;
    });
    if (!silent) setB2bLoading(false);
  };

  useEffect(() => {
    const loadB2bProfileNames = async () => {
      const ids = Array.from(
        new Set(
          (b2bConversations || [])
            .flatMap((conv) => [conv?.seller_user_id, conv?.buyer_user_id])
            .filter(Boolean)
        )
      );
      if (!ids.length) {
        setB2bProfileNamesById({});
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, store_name, company_name')
        .in('id', ids);
      if (error) {
        setB2bProfileNamesById({});
        return;
      }
      const next = {};
      (Array.isArray(data) ? data : []).forEach((row) => {
        const fullName = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();
        next[row.id] = fullName || row?.store_name || row?.company_name || 'Client';
      });
      setB2bProfileNamesById(next);
    };
    loadB2bProfileNames();
  }, [b2bConversations]);

  useEffect(() => {
    const loadB2bCompanyNames = async () => {
      const companyIds = Array.from(
        new Set(
          (b2bConversations || [])
            .map((conv) => listingFromConversation(conv)?.owner_company_id)
            .filter(Boolean)
        )
      );
      if (!companyIds.length) {
        setB2bCompanyNamesById({});
        return;
      }
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds);
      if (error) {
        setB2bCompanyNamesById({});
        return;
      }
      const next = {};
      (Array.isArray(data) ? data : []).forEach((row) => {
        if (row?.id && row?.name) next[row.id] = row.name;
      });
      setB2bCompanyNamesById(next);
    };
    loadB2bCompanyNames();
  }, [b2bConversations]);

  const loadB2bMessages = async (conversationId) => {
    if (!conversationId) {
      setB2bMessages([]);
      return;
    }
    const res = await supabaseHelpers.listClientMarketMessages({
      conversationId,
      limit: 200
    });
    if (res?.error) {
      console.error('Failed to load B2B messages:', res.error);
      return;
    }
    const rows = Array.isArray(res?.data) ? res.data : [];
    setB2bMessages(rows);
    requestAnimationFrame(() => {
      if (b2bScrollRef.current) {
        b2bScrollRef.current.scrollTop = b2bScrollRef.current.scrollHeight;
      }
    });
  };

  useEffect(() => {
    if (!user?.id || !companyId || isAdmin || trackedMarkets.length === 0) return;
    trackedMarkets.forEach((market) => {
      loadSupportConversation(market);
    });
  }, [user?.id, companyId, clientName, isAdmin]);

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    loadB2bConversations();
    const timer = setInterval(() => loadB2bConversations({ silent: true }), 6000);
    return () => clearInterval(timer);
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (!activeB2bConversationId) return;
    loadB2bMessages(activeB2bConversationId);
    const timer = setInterval(() => loadB2bMessages(activeB2bConversationId), 5000);
    return () => clearInterval(timer);
  }, [activeB2bConversationId]);

  useEffect(() => {
    if (!open || mode !== 'b2b' || !activeB2bConversationId || !b2bMessages.length) return;
    const last = b2bMessages[b2bMessages.length - 1];
    if (!last?.created_at) return;
    markB2bConversationRead(activeB2bConversationId, last.created_at);
  }, [open, mode, activeB2bConversationId, b2bMessages]);

  useEffect(() => {
    if (!activeB2bConversationId) return;
    const channel = supabase
      .channel(`client-widget-b2b-${activeB2bConversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_market_messages',
          filter: `conversation_id=eq.${activeB2bConversationId}`
        },
        () => {
          loadB2bMessages(activeB2bConversationId);
          loadB2bConversations({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeB2bConversationId]);

  useEffect(() => {
    if (!user?.id || isAdmin || !isPageVisible) return;
    let cancelled = false;
    const shouldPoll = open && mode === 'support';
    const fetchUnread = async () => {
      const entries = await Promise.all(
        trackedMarkets.map(async (market) => {
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
    const timer = shouldPoll ? setInterval(fetchUnread, 5000) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [conversationsByMarket, open, mode, isPageVisible, user?.id, isAdmin]);

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    let cancelled = false;
    const fetchB2bUnread = async () => {
      const entries = await Promise.all(
        b2bConversations.map(async (conv) => {
          const res = await supabaseHelpers.getClientMarketConversationLatestMessage({
            conversationId: conv.id
          });
          const latest = res?.data || null;
          if (!latest?.created_at) return [conv.id, 0];
          if (latest.sender_user_id === user.id) return [conv.id, 0];
          const lastRead = b2bReadByConversationId?.[conv.id];
          if (!lastRead) return [conv.id, 1];
          return [conv.id, new Date(latest.created_at).getTime() > new Date(lastRead).getTime() ? 1 : 0];
        })
      );
      if (!cancelled) {
        setB2bUnreadByConversationId(Object.fromEntries(entries));
      }
    };
    fetchB2bUnread();
    const timer = setInterval(fetchB2bUnread, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [b2bConversations, b2bReadByConversationId, user?.id, isAdmin]);

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

  useEffect(() => {
    const handleOpenB2b = (event) => {
      const detail = event?.detail || {};
      const targetConversationId = detail?.conversationId || null;
      setMode('b2b');
      setOpen(true);
      if (targetConversationId) {
        setActiveB2bConversationId(targetConversationId);
      }
      if (detail?.market && SUPPORTED_CHAT_MARKETS.includes(String(detail.market).toUpperCase())) {
        setSelectedMarket(String(detail.market).toUpperCase());
      }
      loadB2bConversations({ silent: true });
    };
    window.addEventListener(CHAT_OPEN_B2B_EVENT, handleOpenB2b);
    return () => {
      window.removeEventListener(CHAT_OPEN_B2B_EVENT, handleOpenB2b);
    };
  }, []);

  const sendB2bMessage = async () => {
    if (!activeB2bConversationId || !user?.id || b2bSending) return;
    const body = b2bInput.trim();
    if (!body && b2bFiles.length === 0) return;
    setB2bSending(true);
    setB2bSendError('');
    const res = await supabaseHelpers.sendClientMarketMessage({
      conversationId: activeB2bConversationId,
      senderUserId: user.id,
      body: body || 'Attachment'
    });
    if (res?.error) {
      console.error('Failed to send B2B message:', res.error);
      setB2bSendError(res.error.message || 'Could not send message.');
      setB2bSending(false);
      return;
    }
    if (res?.data?.id && b2bFiles.length > 0) {
      for (const file of b2bFiles) {
        const uploadRes = await supabaseHelpers.uploadClientMarketAttachment({
          conversationId: activeB2bConversationId,
          messageId: res.data.id,
          file
        });
        if (uploadRes?.error) {
          console.error('Failed to upload B2B attachment:', uploadRes.error);
          setB2bSendError(uploadRes.error.message || 'Could not upload attachment.');
          break;
        }
      }
    }
    setB2bInput('');
    setB2bFiles([]);
    if (b2bFileInputRef.current) b2bFileInputRef.current.value = '';
    await loadB2bMessages(activeB2bConversationId);
    await loadB2bConversations({ silent: true });
    markB2bConversationRead(activeB2bConversationId);
    setB2bSending(false);
  };

  useEffect(() => {
    const pending = [];
    b2bMessages.forEach((msg) => {
      const attachments = Array.isArray(msg?.client_market_message_attachments)
        ? msg.client_market_message_attachments
        : [];
      attachments.forEach((att) => {
        if (att?.id && att?.storage_path && !b2bAttachmentUrls[att.id]) {
          pending.push(att);
        }
      });
    });
    if (!pending.length) return;
    let cancelled = false;
    const fetchUrls = async () => {
      const updates = {};
      for (const att of pending) {
        const res = await supabaseHelpers.getClientMarketAttachmentUrl({
          path: att.storage_path
        });
        if (res?.data?.signedUrl) updates[att.id] = res.data.signedUrl;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setB2bAttachmentUrls((prev) => ({ ...prev, ...updates }));
      }
    };
    fetchUrls();
    return () => {
      cancelled = true;
    };
  }, [b2bMessages, b2bAttachmentUrls]);

  const handleB2bFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    const valid = selected.filter(
      (file) =>
        ALLOWED_B2B_FILE_TYPES.includes(file.type) &&
        Number(file.size || 0) > 0 &&
        Number(file.size || 0) <= MAX_B2B_FILE_SIZE
    );
    setB2bFiles(valid);
  };

  if (!user || !companyId || isAdmin) return null;

  const selectedSupportConversation = conversationsByMarket[selectedMarket] || null;
  const selectedSupportStatus = statusByMarket[selectedMarket] || {};
  const staffLabel = staffLabelByCountry(selectedMarket);
  const supportUnreadTotal = Object.values(unreadByMarket).reduce((sum, n) => sum + Number(n || 0), 0);
  const b2bUnreadTotal = Object.values(b2bUnreadByConversationId).reduce((sum, n) => sum + Number(n || 0), 0);
  const totalUnread = supportUnreadTotal + b2bUnreadTotal;
  const activeB2bConversation = b2bConversations.find((row) => row.id === activeB2bConversationId) || null;
  const getB2bPartnerName = (conv) => {
    if (!conv || !user?.id) return 'Client';
    const isSeller = conv.seller_user_id === user.id;
    const listing = listingFromConversation(conv);
    const listingOwnerCompanyId = listing?.owner_company_id || null;
    const listingOwnerName = listingOwnerCompanyId ? b2bCompanyNamesById?.[listingOwnerCompanyId] : '';
    const partnerRoleFallback = isSeller ? 'Buyer' : 'Seller';
    const partnerId = isSeller ? conv.buyer_user_id : conv.seller_user_id;
    if (!isSeller && listingOwnerName) return listingOwnerName;
    if (b2bProfileNamesById?.[partnerId]) return b2bProfileNamesById[partnerId];
    if (partnerId) return `${partnerRoleFallback} ${String(partnerId).slice(0, 8)}`;
    return partnerRoleFallback;
  };

  return (
    <div ref={widgetRef} className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 h-[560px] w-[380px] max-w-[95vw] overflow-hidden rounded-2xl border border-slate-200 shadow-2xl">
          <div className="flex h-full flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMode('support')}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    mode === 'support'
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Support
                </button>
                <button
                  onClick={() => setMode('b2b')}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    mode === 'b2b'
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  B2B
                  {b2bUnreadTotal > 0 && (
                    <span className="ml-1 rounded-full bg-white/90 px-1 text-[10px] font-semibold text-red-600">
                      {b2bUnreadTotal > 99 ? '99+' : b2bUnreadTotal}
                    </span>
                  )}
                </button>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-slate-500 hover:text-slate-700"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>

            {mode === 'support' ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
                  <div className="flex items-center gap-2">
                    {trackedMarkets.map((market) => {
                      const active = market === selectedMarket;
                      const marketUnread = unreadByMarket[market] || 0;
                      const forbidden = statusByMarket[market]?.forbidden === true;
                      return (
                        <button
                          key={market}
                          onClick={() => setSelectedMarket(market)}
                          disabled={forbidden}
                          className={`relative rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                            active
                              ? 'border-primary bg-primary text-white'
                              : forbidden
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : marketUnread > 0
                              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{market}</span>
                          {marketUnread > 0 && (
                            <span className="ml-1 text-[10px] font-semibold">
                              {marketUnread > 99 ? '99+' : marketUnread}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <div className="leading-tight">
                      <div className="text-xs text-slate-500">{staffLabel.name}</div>
                      {staffLabel.person && (
                        <div className="text-[11px] text-slate-400">{staffLabel.person}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  {selectedSupportConversation ? (
                    <ChatThread
                      conversation={selectedSupportConversation}
                      currentUserId={user.id}
                      senderRole="client"
                      staffLabel={staffLabel}
                      clientName={clientName}
                      onClose={() => setOpen(false)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                      {selectedSupportStatus?.loading ? (
                        <span>Loading chat...</span>
                      ) : selectedSupportStatus?.error ? (
                        <div className="space-y-3">
                          <div>{selectedSupportStatus.error}</div>
                          <button
                            onClick={() => loadSupportConversation(selectedMarket)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            Retry
                          </button>
                        </div>
                      ) : selectedSupportStatus?.forbidden ? (
                        <span>Chat is not enabled for this market.</span>
                      ) : (
                        <span>Preparing chat...</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[130px_minmax(0,1fr)]">
                <div className="border-r border-slate-200 p-2">
                  <div className="max-h-full space-y-2 overflow-y-auto pr-1">
                    {b2bLoading && <div className="text-[11px] text-slate-500">Loading...</div>}
                    {!b2bLoading && b2bConversations.length === 0 && (
                      <div className="text-[11px] text-slate-500">No B2B chats yet.</div>
                    )}
                    {b2bConversations.map((conv) => {
                      const listing = listingFromConversation(conv);
                      const active = conv.id === activeB2bConversationId;
                      const unread = b2bUnreadByConversationId[conv.id] || 0;
                      const partnerName = getB2bPartnerName(conv);
                      return (
                        <button
                          key={conv.id}
                          onClick={() => {
                            setActiveB2bConversationId(conv.id);
                            markB2bConversationRead(conv.id);
                          }}
                          className={`w-full rounded-lg border p-2 text-left ${
                            active
                              ? 'border-primary bg-primary/10'
                              : unread > 0
                              ? 'border-red-200 bg-red-50 hover:bg-red-100'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="truncate text-[11px] font-semibold text-slate-800">
                              {listing?.product_name || 'B2B Listing'}
                            </div>
                            {unread > 0 && (
                              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-semibold text-white">
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {partnerName}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {listing?.country || conv.country || '-'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative flex min-h-0 flex-col">
                  <div className="border-b border-slate-200 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-800 truncate">
                      {listingFromConversation(activeB2bConversation)?.product_name || 'B2B chat'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {getB2bPartnerName(activeB2bConversation)}
                    </div>
                  </div>
                  <div ref={b2bScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-28">
                    {!activeB2bConversationId && (
                      <div className="text-xs text-slate-500">Select a B2B conversation.</div>
                    )}
                    {b2bMessages.map((msg) => {
                      const mine = msg.sender_user_id === user.id;
                      const attachments = Array.isArray(msg?.client_market_message_attachments)
                        ? msg.client_market_message_attachments
                        : [];
                      return (
                        <div key={msg.id} className={`mb-2 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${mine ? 'bg-primary text-white' : 'bg-slate-100 text-slate-900'}`}>
                            <div className="whitespace-pre-wrap">{msg.body}</div>
                            {attachments.map((att) => {
                              const url = b2bAttachmentUrls[att.id];
                              if (!url) return null;
                              if (String(att.mime_type || '').startsWith('image/')) {
                                return (
                                  <img
                                    key={att.id}
                                    src={url}
                                    alt={att.file_name || 'attachment'}
                                    className="mt-2 max-h-36 rounded border border-slate-200"
                                  />
                                );
                              }
                              return (
                                <a
                                  key={att.id}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`mt-2 block underline ${mine ? 'text-white' : 'text-primary'}`}
                                >
                                  {att.file_name || 'Attachment'}
                                </a>
                              );
                            })}
                            <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-slate-500'}`}>
                              {formatMessageTime(msg.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 bg-white p-2">
                    {b2bFiles.length > 0 && (
                      <div className="mb-1 text-[11px] text-slate-500">{b2bFiles.length} attachment(s) ready</div>
                    )}
                    <div className="flex items-end gap-2">
                      <label className="cursor-pointer rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                        <Paperclip size={14} />
                        <input
                          ref={b2bFileInputRef}
                          type="file"
                          accept=".jpg,.jpeg,.png,.pdf"
                          multiple
                          className="hidden"
                          onChange={handleB2bFiles}
                        />
                      </label>
                      <textarea
                        value={b2bInput}
                        onChange={(e) => setB2bInput(e.target.value)}
                        rows={2}
                        placeholder="Type your message..."
                        className="flex-1 resize-none rounded-lg border border-slate-200 p-2 text-xs"
                      />
                      <button
                        onClick={sendB2bMessage}
                        disabled={
                          !activeB2bConversationId || (b2bInput.trim().length === 0 && b2bFiles.length === 0) || b2bSending
                        }
                        className="rounded-lg bg-primary px-2.5 py-2 text-white hover:bg-primary/90 disabled:opacity-50"
                        aria-label="Send"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">Files: JPG, PNG, PDF up to 10MB</div>
                    {!!b2bError && <div className="mt-1 text-[11px] text-rose-600">{b2bError}</div>}
                    {!!b2bSendError && <div className="mt-1 text-[11px] text-rose-600">{b2bSendError}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ${
          totalUnread > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'
        }`}
        aria-label="Open chat"
      >
        <MessageCircle size={24} />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-red-600 ring-2 ring-red-600">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}
