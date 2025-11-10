import { useCallback, useEffect, useRef, useState } from 'react';

const canAccessStorage = () => typeof window !== 'undefined' && !!window.sessionStorage;

const readValue = (key, defaultValue) => {
  if (!canAccessStorage()) return defaultValue;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
};

const writeValue = (key, value) => {
  if (!canAccessStorage()) return;
  try {
    if (value === undefined) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode errors
  }
};

export function useSessionStorage(key, defaultValue) {
  const keyRef = useRef(key);
  const [state, setState] = useState(() => readValue(key, defaultValue));

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setState(readValue(key, defaultValue));
    }
  }, [key, defaultValue]);

  const setValue = useCallback(
    (valueOrUpdater) => {
      setState((prev) => {
        const next =
          typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
        writeValue(keyRef.current, next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    writeValue(key, state);
  }, [key, state]);

  return [state, setValue];
}
