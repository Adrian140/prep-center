import React, { useEffect, useState, useRef } from 'react';
import { supabaseHelpers } from '@/config/supabase';
import { useDashboardTranslation } from '@/translations';

export default function ClientDealsPopover({ companyId }) {
  const { t } = useDashboardTranslation();
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!companyId) {
      setDeals([]);
      return;
    }
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabaseHelpers.listCompanyDeals(companyId);
      if (mounted) {
        setDeals(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
        setShowAll(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!companyId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-primary border border-primary px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white transition-colors"
      >
        {t('ClientDeals.button')}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-30 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-text-primary">{t('ClientDeals.title')}</h4>
            <button
              className="text-xs text-text-secondary hover:text-primary"
              onClick={() => {
                setOpen(false);
                setShowAll(false);
              }}
            >
              ✕
            </button>
          </div>

          {loading ? (
            <div className="text-xs text-text-secondary">{t('ClientDeals.loading')}</div>
          ) : deals.length === 0 ? (
            <div className="text-xs text-text-secondary">{t('ClientDeals.empty')}</div>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 text-sm max-h-56 overflow-auto mb-3">
                {(showAll ? deals : deals.slice(0, 4)).map((deal) => (
                  <li key={deal.id} className="py-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{deal.title}</span>
                      <span className="text-xs text-text-secondary whitespace-nowrap">
                        {deal.amount != null ? `${Number(deal.amount).toFixed(2)} € HT` : '—'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {deals.length > 4 && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? t('ClientDeals.hide') : t('ClientDeals.showAll')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
