const OAUTH_STATE_STORAGE_PREFIX = 'oauth_state_nonce:';

const base64UrlEncode = (input) =>
  btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const base64UrlDecode = (input) => {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return atob(`${normalized}${padding}`);
};

export const createOAuthNonce = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${crypto.randomUUID()}`;

export const storeOAuthNonce = (provider, nonce) => {
  if (!provider || !nonce) return;
  sessionStorage.setItem(`${OAUTH_STATE_STORAGE_PREFIX}${provider}:${nonce}`, '1');
};

export const consumeOAuthNonce = (provider, nonce) => {
  if (!provider || !nonce) return false;
  const key = `${OAUTH_STATE_STORAGE_PREFIX}${provider}:${nonce}`;
  const present = sessionStorage.getItem(key) === '1';
  sessionStorage.removeItem(key);
  return present;
};

export const peekOAuthStatePayload = (token) => {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    return JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
};

export const issueOAuthState = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('issue_oauth_state', {
    body: payload
  });
  if (error) throw error;
  if (!data?.state || !data?.nonce) {
    throw new Error(data?.error || 'Unable to issue secure OAuth state.');
  }
  return { state: data.state, nonce: data.nonce };
};

export { OAUTH_STATE_STORAGE_PREFIX, base64UrlEncode };
