// FILE: src/analytics/RouteTracker.jsx
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { supabaseHelpers } from '../config/supabase';

function randomId() {
  const k = 'pcf_uid';
  let v = localStorage.getItem(k);
  if (!v) {
    v = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(k, v);
  }
  return v;
}

export default function RouteTracker() {
  const location = useLocation();
  const userId = useMemo(() => randomId(), []);

  useEffect(() => {
    const path = location.pathname + location.search;
    const ref = document.referrer ? new URL(document.referrer).host : null;
    const locale = navigator.language || 'en';
    supabaseHelpers.trackVisit({ path, referrer: ref, locale, userId });
  }, [location, userId]);

  return null;
}
