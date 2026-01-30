// FILE: src/components/dashboard/client/ClientBalanceBar.jsx
import React, { useEffect, useState } from "react";
import { supabaseHelpers } from "../../../config/supabase";
import { useDashboardTranslation } from "../../../translations";
import { useSupabaseAuth } from "../../../contexts/SupabaseAuthContext";
import { useMarket } from '@/contexts/MarketContext';

const fmt2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

export default function ClientBalanceBar({ companyId, variant = 'default' }) {
  const { t } = useDashboardTranslation();
  const { profile } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const isLimitedAdmin = Boolean(profile?.is_limited_admin);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);

  if (isLimitedAdmin) {
    return null;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) {
          setBalance(0);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      const { data, error } = await supabaseHelpers.getCompanyLiveBalance(
        companyId,
        currentMarket
      );
      const diff = error || !Number.isFinite(data) ? 0 : data;

      if (mounted) {
        setBalance(diff);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [companyId, currentMarket]);

  const isZero = !Number.isFinite(balance) || Math.abs(balance) < 1e-9;
  const cls = isZero
    ? "bg-gray-100 text-gray-700"
    : balance < 0
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";

  const compact = variant === 'compact';

  return (
    <div className={compact ? '' : 'mb-6'}>
      <div
        className={`bg-slate-50 border border-slate-200 rounded-xl ${
          compact ? 'p-3 w-[210px]' : 'p-4 flex flex-col items-end'
        }`}
      >
        <div className={`text-sm text-text-secondary ${compact ? 'mb-1' : 'self-start'}`}>
          {t('ClientBalanceBar.title')}
        </div>
        <div
          className={`px-3 py-1 rounded-md font-semibold ${cls} ${
            compact ? 'text-sm' : 'text-base'
          }`}
        >
          {loading
            ? t('common.calculating')
            : t('ClientBalanceBar.current').replace('{amount}', fmt2(Number(balance || 0)))}
        </div>
        {!loading && balance < 0 && (
          <div className="mt-1 text-xs text-green-600 italic">
            {t('ClientBalanceBar.prepayment').replace('{amount}', fmt2(Math.abs(balance)))}
          </div>
        )}
        {!loading && balance > 0 && (
          <div className="mt-1 text-xs text-red-600 italic">
            {t('ClientBalanceBar.outstanding').replace('{amount}', fmt2(balance))}
          </div>
        )}
      </div>
    </div>
  );
}
