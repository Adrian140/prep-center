import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, Send, Trash2, Pencil, X } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { supabaseHelpers } from '@/config/supabase';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const PAGE_SIZE = 50;

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const canEditWithinWindow = (createdAt) => {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  return Date.now() - created <= 60 * 60 * 1000;
};

export default function ChatThread({
  conversation,
  currentUserId,
  senderRole,
  staffLabel,
  clientName,
  headerTitle,
  headerSubtitle,
  isAdmin = false,
  onClose
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const scrollRef = useRef(null);
  const subscriptionRef = useRef(null);
  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const staffName = staffLabel?.name || 'EcomPrepHub';
  const staffPerson = staffLabel?.person || '';
  const displayClient = clientName || 'Client';

  const conversationId = conversation?.id;

  const mergeMessages = (incoming = []) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setMessages((prev) => {
      const map = new Map();
      prev.forEach((msg) => {
        if (msg?.id) map.set(msg.id, msg);
      });
      incoming.forEach((msg) => {
        if (!msg?.id) return;
        const prevMsg = map.get(msg.id) || {};
        map.set(msg.id, { ...prevMsg, ...msg });
      });
      return Array.from(map.values()).sort(
        (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime()
      );
    });
  };

  useEffect(() => {
    if (!conversationId) return;
    let mounted = true;

    const loadInitial = async () => {
      setLoading(true);
      const res = await supabaseHelpers.listChatMessages({
        conversationId,
        limit: PAGE_SIZE
      });
      if (!mounted) return;
      if (res.data) {
        setMessages(res.data);
        setHasMore(res.data.length >= PAGE_SIZE);
      }
      setLoading(false);
      supabaseHelpers.markChatRead({ conversationId }).catch(() => {});
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      });
    };

    loadInitial();

    const refreshAttachments = async (messageId) => {
      if (!messageId) return;
      const res = await supabase
        .from('chat_message_attachments')
        .select('id, storage_path, file_name, mime_type, size_bytes')
        .eq('message_id', messageId);
      if (res.data) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, chat_message_attachments: res.data } : msg
          )
        );
      }
    };

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          if (!mounted) return;
          if (payload.eventType === 'INSERT') {
            mergeMessages([payload.new]);
            requestAnimationFrame(scrollToBottom);
            if (payload.new?.sender_id !== currentUserId) {
              supabaseHelpers.markChatRead({ conversationId }).catch(() => {});
            }
          }
          if (payload.eventType === 'UPDATE') {
            mergeMessages([payload.new]);
            refreshAttachments(payload.new?.id).catch(() => {});
          }
          if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      mounted = false;
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [conversationId, currentUserId]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const refresh = async () => {
      const res = await supabaseHelpers.listChatMessages({
        conversationId,
        limit: PAGE_SIZE
      });
      if (cancelled || res?.error || !res?.data) return;
      mergeMessages(res.data);
    };
    const timer = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId]);

  const loadMore = async () => {
    if (!conversationId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const first = messages[0];
    const res = await supabaseHelpers.listChatMessages({
      conversationId,
      limit: PAGE_SIZE,
      before: first?.created_at
    });
    if (res.data && res.data.length > 0) {
      setMessages((prev) => [...res.data, ...prev]);
      setHasMore(res.data.length >= PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setLoadingMore(false);
  };

  const handleFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    const valid = selected.filter(
      (file) => ALLOWED_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE
    );
    setFiles(valid);
  };

  const submitMessage = async () => {
    if (!conversationId || !currentUserId || sending) return;
    const body = input.trim();
    if (!body && files.length === 0) return;
    setSending(true);
    setSendError('');
    const messageBody = body || 'Attachment';
    const res = await supabaseHelpers.sendChatMessage({
      conversationId,
      senderId: currentUserId,
      senderRole,
      body: messageBody
    });
    if (res?.error) {
      setSendError(res.error.message || 'Could not send message.');
      setSending(false);
      return;
    }
    if (res.data) {
      mergeMessages([res.data]);
      requestAnimationFrame(scrollToBottom);
      if (files.length > 0) {
        for (const file of files) {
          await supabaseHelpers.uploadChatAttachment({
            conversationId,
            messageId: res.data.id,
            file
          });
        }
      }
      setInput('');
      setFiles([]);
      supabaseHelpers.markChatRead({ conversationId }).catch(() => {});
    }
    setSending(false);
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(msg.body || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    await supabaseHelpers.updateChatMessage({ messageId: editingId, body: editText });
    cancelEdit();
  };

  const removeMessage = async (msgId) => {
    if (!msgId) return;
    await supabaseHelpers.deleteChatMessage({ messageId: msgId });
  };

  useEffect(() => {
    const pending = [];
    messages.forEach((msg) => {
      const attachments = msg?.chat_message_attachments || [];
      attachments.forEach((att) => {
        if (!attachmentUrls[att.id]) {
          pending.push(att);
        }
      });
    });
    if (!pending.length) return;
    let cancelled = false;
    const fetchUrls = async () => {
      const updates = {};
      for (const att of pending) {
        const res = await supabaseHelpers.getChatAttachmentUrl({ path: att.storage_path });
        if (res?.data?.signedUrl) updates[att.id] = res.data.signedUrl;
      }
      if (!cancelled && Object.keys(updates).length) {
        setAttachmentUrls((prev) => ({ ...prev, ...updates }));
      }
    };
    fetchUrls();
    return () => {
      cancelled = true;
    };
  }, [messages, attachmentUrls]);

  const renderAttachment = (att) => {
    const url = attachmentUrls[att.id];
    if (!url) return null;
    if (att.mime_type && att.mime_type.startsWith('image/')) {
      return (
        <img
          key={att.id}
          src={url}
          alt={att.file_name}
          className="mt-2 max-h-48 rounded-lg border border-slate-200"
        />
      );
    }
    return (
      <a
        key={att.id}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block text-sm text-primary underline"
      >
        {att.file_name}
      </a>
    );
  };

  const renderStatus = (msg) => {
    if (msg.sender_id !== currentUserId) return null;
    const reads = msg?.chat_message_reads || [];
    const seen = reads.some((r) => r.user_id && r.user_id !== currentUserId);
    return (
      <span className="text-[10px] text-slate-400">
        {seen ? 'Seen' : 'Delivered'}
      </span>
    );
  };

  const header = useMemo(() => {
    const title = headerTitle || staffName;
    const subtitle = headerSubtitle ?? (staffPerson || '');
    return (
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle && (
            <div className="text-xs text-slate-500">{subtitle}</div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:text-slate-700"
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        )}
      </div>
    );
  }, [staffName, staffPerson, onClose, headerTitle, headerSubtitle]);

  return (
    <div className="flex h-full flex-col bg-white">
      {header}
      <div className="flex-1 overflow-y-auto px-4 py-3" ref={scrollRef}>
        {hasMore && (
          <div className="mb-3 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
        {loading && (
          <div className="text-center text-xs text-slate-400">Loading messages...</div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          const canEdit = isAdmin || (isMine && canEditWithinWindow(msg.created_at));
          const canDelete = isAdmin || (isMine && canEditWithinWindow(msg.created_at));
          const senderLabel = msg.sender_role === 'admin' ? staffName : displayClient;
          return (
            <div key={msg.id} className={`mb-4 flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMine ? 'bg-primary text-white' : 'bg-slate-100 text-slate-900'}`}>
                <div className="mb-1 text-[11px] opacity-70">{senderLabel}</div>
                {editingId === msg.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-900"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm">{msg.body}</div>
                )}
                {(msg.chat_message_attachments || []).map(renderAttachment)}
                <div className="mt-2 flex items-center justify-between text-[10px] opacity-70">
                  <span>{formatTime(msg.created_at)}</span>
                  {renderStatus(msg)}
                </div>
                {(canEdit || canDelete) && editingId !== msg.id && (
                  <div className="mt-2 flex gap-2 text-[11px]">
                    {canEdit && (
                      <button
                        onClick={() => startEdit(msg)}
                        className="inline-flex items-center gap-1 text-white/80 hover:text-white"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => removeMessage(msg.id)}
                        className="inline-flex items-center gap-1 text-white/80 hover:text-white"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-200 p-3">
        {files.length > 0 && (
          <div className="mb-2 text-xs text-slate-500">
            {files.length} attachment(s) ready
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="cursor-pointer rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <Paperclip size={16} />
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="Type your message..."
            className="flex-1 resize-none rounded-lg border border-slate-200 p-2 text-sm"
          />
          <button
            onClick={submitMessage}
            disabled={sending}
            className="rounded-lg bg-primary px-3 py-2 text-white hover:bg-primary/90"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Files: JPG, PNG, PDF up to 10MB
        </div>
        {!!sendError && (
          <div className="mt-1 text-[11px] text-rose-600">{sendError}</div>
        )}
      </div>
    </div>
  );
}
