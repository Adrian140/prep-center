import { getTabId } from './tabIdentity';

const FALLBACK_STORES = {
  session: {},
  local: {},
};

const safeGetStorage = (type) => {
  if (typeof window === 'undefined') return null;
  try {
    return window[`${type}Storage`];
  } catch {
    return null;
  }
};

const createScopedStorage = (type) => {
  const backing = safeGetStorage(type);
  const memory = FALLBACK_STORES[type];
  const prefix = `${getTabId()}:`;

  const buildKey = (key) => `${prefix}${key}`;

  return {
    getItem(key) {
      const target = buildKey(key);
      if (backing) {
        try {
          const value = backing.getItem(target);
          if (value !== null && value !== undefined) return value;
        } catch {
          // fall through to memory store
        }
      }
      return Object.prototype.hasOwnProperty.call(memory, target) ? memory[target] : null;
    },
    setItem(key, value) {
      const target = buildKey(key);
      if (backing) {
        try {
          backing.setItem(target, value);
          return;
        } catch {
          // write to fallback memory store
        }
      }
      memory[target] = value;
    },
    removeItem(key) {
      const target = buildKey(key);
      if (backing) {
        try {
          backing.removeItem(target);
          return;
        } catch {
          // remove from memory store
        }
      }
      delete memory[target];
    },
  };
};

export const tabSessionStorage = createScopedStorage('session');
export const tabLocalStorage = createScopedStorage('local');

export const readJSON = (storage, key, fallbackValue = null) => {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
};

export const writeJSON = (storage, key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore serialization errors
  }
};
