const FALLBACK_ID = 'tab';
const TAB_ID_SESSION_KEY = 'pcf-tab-id';
const TAB_HEARTBEAT_PREFIX = 'pcf-tab-heartbeat:';
const TAB_HEARTBEAT_TTL_MS = 5000;
const TAB_HEARTBEAT_INTERVAL_MS = 2000;

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const getInstanceId = () => {
  if (typeof window === 'undefined') return FALLBACK_ID;
  if (window.__PCF_INSTANCE_ID) return window.__PCF_INSTANCE_ID;
  const id = randomId();
  window.__PCF_INSTANCE_ID = id;
  return id;
};

const readHeartbeat = (tabId) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${TAB_HEARTBEAT_PREFIX}${tabId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeHeartbeat = (tabId) => {
  if (typeof window === 'undefined') return;
  const instanceId = getInstanceId();
  try {
    window.localStorage.setItem(
      `${TAB_HEARTBEAT_PREFIX}${tabId}`,
      JSON.stringify({ instanceId, ts: Date.now() })
    );
  } catch {
    // ignore storage failures
  }
};

const startHeartbeat = (tabId) => {
  if (typeof window === 'undefined') return;
  if (window.__PCF_TAB_HEARTBEAT) return;
  writeHeartbeat(tabId);
  window.__PCF_TAB_HEARTBEAT = window.setInterval(() => {
    writeHeartbeat(tabId);
  }, TAB_HEARTBEAT_INTERVAL_MS);
  window.addEventListener('beforeunload', () => {
    try {
      window.localStorage.removeItem(`${TAB_HEARTBEAT_PREFIX}${tabId}`);
    } catch {
      // ignore
    }
  });
};

const ensureUniqueTabId = (candidate) => {
  if (typeof window === 'undefined') return candidate;
  const instanceId = getInstanceId();
  const existing = readHeartbeat(candidate);
  if (existing && existing.instanceId !== instanceId) {
    const age = Date.now() - Number(existing.ts || 0);
    if (Number.isFinite(age) && age < TAB_HEARTBEAT_TTL_MS) {
      return null;
    }
  }
  return candidate;
};

export const getTabId = () => {
  if (typeof window === 'undefined') return FALLBACK_ID;

  if (window.__PCF_TAB_ID) return window.__PCF_TAB_ID;

  let tabId = null;
  try {
    const params = new URLSearchParams(window.location.search);
    tabId = params.get('tabId');
  } catch {
    tabId = null;
  }

  if (!tabId) {
    try {
      tabId = window.sessionStorage.getItem(TAB_ID_SESSION_KEY);
    } catch {
      tabId = null;
    }
  }

  if (tabId) {
    tabId = ensureUniqueTabId(tabId);
  }

  if (!tabId) {
    tabId = randomId();
  }

  try {
    window.sessionStorage.setItem(TAB_ID_SESSION_KEY, tabId);
  } catch {
    // ignore write failures (private mode / disabled storage)
  }

  window.__PCF_TAB_ID = tabId;
  startHeartbeat(tabId);
  return tabId;
};

export const ensureTabIdInUrl = () => {
  if (typeof window === 'undefined') return null;
  const tabId = getTabId();
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tabId') === tabId) return tabId;
  } catch {
    return tabId;
  }
  return tabId;
};
