import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/config/supabase';
import { normalizeMarketCode } from '@/utils/market';
import { useLanguage } from '@/contexts/LanguageContext';

const EXPERIENCE_START_YEAR = 2022;
const EXPERIENCE_START_MONTH_INDEX = 2; // March
const COUNTED_MARKETS = ['FR', 'DE'];

const countClientEntries = (rows = []) =>
  (rows || []).reduce((total, row) => {
    const accountType = String(row?.account_type || '').trim().toLowerCase();
    if (accountType === 'admin') return total;

    const allowedMarkets = Array.isArray(row?.allowed_markets)
      ? row.allowed_markets.map((value) => normalizeMarketCode(value)).filter(Boolean)
      : [];
    const country = normalizeMarketCode(row?.country);

    return total + COUNTED_MARKETS.reduce((sum, marketCode) => {
      if (allowedMarkets.includes(marketCode)) return sum + 1;
      if (allowedMarkets.length === 0 && country === marketCode) return sum + 1;
      return sum;
    }, 0);
  }, 0);

const getExperienceParts = () => {
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - EXPERIENCE_START_YEAR) * 12 +
    (now.getMonth() - EXPERIENCE_START_MONTH_INDEX);
  const clampedMonths = Math.max(0, totalMonths);
  return {
    years: Math.floor(clampedMonths / 12),
    months: clampedMonths % 12
  };
};

const formatExperienceDisplay = (language, years, months) => {
  switch (language) {
    case 'fr':
      return `${years} ans ${months} mois`;
    case 'de':
      return `${years} Jahre ${months} Monate`;
    case 'it':
      return `${years} anni ${months} mesi`;
    case 'es':
      return `${years} años ${months} meses`;
    case 'ro':
      return `${years} ani ${months} luni`;
    case 'en':
    default:
      return `${years} years ${months} months`;
  }
};

export const usePublicStats = () => {
  const { currentLanguage } = useLanguage();
  const [happyClientsTotal, setHappyClientsTotal] = useState(0);
  const [experienceTick, setExperienceTick] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    const loadClientTotal = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, account_type, allowed_markets, country');

      if (!active) return;
      if (error) {
        console.error('Failed to load public client stats', error);
        return;
      }

      setHappyClientsTotal(countClientEntries(data || []));
    };

    loadClientTotal();

    const channel = supabase
      .channel('public-stats-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          loadClientTotal();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setExperienceTick(Date.now());
    }, 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const experience = useMemo(() => {
    const { years, months } = getExperienceParts();
    return {
      years,
      months,
      display: formatExperienceDisplay(currentLanguage, years, months)
    };
  }, [currentLanguage, experienceTick]);

  return {
    happyClientsTotal,
    experienceDisplay: experience.display
  };
};
