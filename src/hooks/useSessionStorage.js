import { useCallback, useEffect, useRef, useState } from 'react';
import { tabSessionStorage } from '@/utils/tabStorage';

const readValue = (key, defaultValue) => {
  try {
    const raw = tabSessionStorage.getItem(key);
    if (raw === null || raw === undefined) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
};

const writeValue = (key, value) => {
  try {
    if (value === undefined) tabSessionStorage.removeItem(key);
    else tabSessionStorage.setItem(key, JSON.stringify(value));
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
