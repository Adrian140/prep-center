const STORAGE_PREFIX = 'admin_chat_manual_unread_v1';
export const ADMIN_CHAT_UNREAD_EVENT = 'admin-chat-manual-unread-change';

const normalizeMarket = (market) => String(market || 'FR').toUpperCase();

const buildStorageKey = ({ userId, market }) =>
  `${STORAGE_PREFIX}:${userId}:${normalizeMarket(market)}`;

const canUseStorage = () =>
  typeof window !== 'undefined' && typeof localStorage !== 'undefined';

export const getAdminManualUnreadConversationIds = ({ userId, market }) => {
  if (!userId || !canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(buildStorageKey({ userId, market }));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

export const setAdminManualUnreadConversation = ({
  userId,
  market,
  conversationId,
  unread
}) => {
  if (!userId || !conversationId || !canUseStorage()) return [];
  const next = new Set(getAdminManualUnreadConversationIds({ userId, market }));
  if (unread) next.add(conversationId);
  else next.delete(conversationId);
  const conversationIds = Array.from(next);
  try {
    localStorage.setItem(
      buildStorageKey({ userId, market }),
      JSON.stringify(conversationIds)
    );
  } catch {
    return conversationIds;
  }
  window.dispatchEvent(
    new CustomEvent(ADMIN_CHAT_UNREAD_EVENT, {
      detail: {
        userId,
        market: normalizeMarket(market),
        conversationIds
      }
    })
  );
  return conversationIds;
};

export const mergeAdminManualUnreadCounts = ({ userId, market, serverCounts = {} }) => {
  const merged = { ...(serverCounts || {}) };
  getAdminManualUnreadConversationIds({ userId, market }).forEach((conversationId) => {
    merged[conversationId] = Math.max(Number(merged[conversationId] || 0), 1);
  });
  return merged;
};

export const subscribeAdminManualUnread = ({ userId, market, onChange }) => {
  if (!userId || typeof window === 'undefined') return () => {};

  const emit = () => {
    onChange(getAdminManualUnreadConversationIds({ userId, market }));
  };

  const onCustomChange = (event) => {
    const detail = event?.detail || {};
    if (detail.userId && detail.userId !== userId) return;
    if (detail.market && normalizeMarket(detail.market) !== normalizeMarket(market)) return;
    emit();
  };

  const onStorage = (event) => {
    if (event.key && event.key !== buildStorageKey({ userId, market })) return;
    emit();
  };

  window.addEventListener(ADMIN_CHAT_UNREAD_EVENT, onCustomChange);
  window.addEventListener('storage', onStorage);
  emit();

  return () => {
    window.removeEventListener(ADMIN_CHAT_UNREAD_EVENT, onCustomChange);
    window.removeEventListener('storage', onStorage);
  };
};
