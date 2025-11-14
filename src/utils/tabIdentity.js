const FALLBACK_ID = 'tab';
const TAB_ID_SESSION_KEY = 'pcf-tab-id';

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

  if (!tabId) {
    tabId = randomId();
  }

  try {
    window.sessionStorage.setItem(TAB_ID_SESSION_KEY, tabId);
  } catch {
    // ignore write failures (private mode / disabled storage)
  }

  window.__PCF_TAB_ID = tabId;
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
