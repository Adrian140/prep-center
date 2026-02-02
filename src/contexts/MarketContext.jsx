import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSupabaseAuth } from './SupabaseAuthContext';
import { normalizeMarketCode } from '@/utils/market';

const MarketContext = createContext();

export const MARKETS = {
  FR: { name: 'France', flag: '🇫🇷' },
  DE: { name: 'Germany', flag: '🇩🇪' }
};

const DEFAULT_MARKET = 'FR';
const STORAGE_KEY = 'preferredMarket';
const LIST_KEY = 'enabledMarkets';

const sanitizeMarkets = (list = []) =>
  Array.from(
    new Set(
      list
        .map((item) => normalizeMarketCode(item))
        .filter((code) => code && MARKETS[code])
    )
  );

export const MarketProvider = ({ children }) => {
  const { user, profile } = useSupabaseAuth();
  const userId = user?.id || null;
  const isAdmin = profile?.account_type === 'admin' || profile?.is_admin === true;
  const isSuperAdmin = profile?.is_super_admin === true;
  const [availableMarkets, setAvailableMarkets] = useState([DEFAULT_MARKET]);
  const [currentMarket, setCurrentMarket] = useState(DEFAULT_MARKET);

  const listKey = userId ? `${LIST_KEY}:${userId}` : LIST_KEY;
  const currentKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;

  useEffect(() => {
    const bootstrap = () => {
      const seed = [];
      const profileCountry = normalizeMarketCode(profile?.country);
      if (profileCountry) seed.push(profileCountry);
      const profileAllowed = Array.isArray(profile?.allowed_markets)
        ? profile.allowed_markets
        : [];
      const adminAllowed = isSuperAdmin
        ? Object.keys(MARKETS)
        : profileAllowed;
      const adminAllMarkets = isAdmin ? Object.keys(MARKETS) : [];
      if (adminAllowed.length) seed.push(...adminAllowed);

      let storedList = [];
      let storedCurrent = '';
      try {
        storedCurrent = normalizeMarketCode(localStorage.getItem(currentKey));
        const rawList = localStorage.getItem(listKey);
        storedList = rawList ? JSON.parse(rawList) : [];
      } catch {
        storedList = [];
        storedCurrent = '';
      }

      const nextAvailable = sanitizeMarkets([...seed, ...storedList]);
      const adminScoped = isAdmin
        ? sanitizeMarkets(adminAllowed.length ? adminAllowed : adminAllMarkets)
        : null;
      const finalAvailable = adminScoped && adminScoped.length
        ? adminScoped
        : nextAvailable.length > 0
        ? nextAvailable
        : [DEFAULT_MARKET];
      const nextCurrent =
        finalAvailable.includes(storedCurrent) ? storedCurrent : finalAvailable[0];

      setAvailableMarkets(finalAvailable);
      setCurrentMarket(nextCurrent);
    };

    bootstrap();
  }, [userId, profile?.country, profile?.allowed_markets, profile?.is_super_admin, isAdmin, listKey, currentKey]);

  const persistAvailable = (list) => {
    try {
      localStorage.setItem(listKey, JSON.stringify(list));
    } catch {
      // ignore storage errors
    }
  };

  const setMarket = (code) => {
    const normalized = normalizeMarketCode(code);
    if (!normalized || !MARKETS[normalized]) return;
    setCurrentMarket(normalized);
    try {
      localStorage.setItem(currentKey, normalized);
      window.dispatchEvent(new CustomEvent('market:changed', { detail: normalized }));
    } catch {
      // ignore storage errors
    }
  };

  const enableMarket = (code) => {
    const normalized = normalizeMarketCode(code);
    if (!normalized || !MARKETS[normalized]) return;
    setAvailableMarkets((prev) => {
      const next = sanitizeMarkets([...prev, normalized]);
      persistAvailable(next);
      return next;
    });
    setMarket(normalized);
  };

  const value = useMemo(
    () => ({
      currentMarket,
      availableMarkets,
      setMarket,
      enableMarket,
      markets: MARKETS
    }),
    [currentMarket, availableMarkets]
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
};

export const useMarket = () => {
  const ctx = useContext(MarketContext);
  if (!ctx) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return ctx;
};
