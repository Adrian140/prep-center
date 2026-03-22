import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/config/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

const EXPERIENCE_START_YEAR = 2022;
const EXPERIENCE_START_MONTH_INDEX = 2; // March
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
      const { data, error } = await supabase.rpc('get_public_site_stats');

      if (!active) return;
      if (error) {
        console.error('Failed to load public client stats', error);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      setHappyClientsTotal(Number(row?.happy_clients_total || 0));
    };

    loadClientTotal();
    const intervalId = window.setInterval(loadClientTotal, 5 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
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
