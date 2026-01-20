import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';

function AsinCell({ matches, onToggle, expanded, t }) {
  if (!matches || matches.length === 0) {
    return <span className="text-text-secondary text-sm">—</span>;
  }
  const primary = matches[0];
  return (
    <div className="text-sm text-text-primary">
      <div className="font-semibold">{primary.asin || '—'}</div>
      {primary.sku && <div className="text-xs text-text-secondary">SKU: {primary.sku}</div>}
      {matches.length > 1 && (
        <button
          onClick={onToggle}
          className="text-[11px] text-primary underline underline-offset-2"
        >
          {expanded ? t('common.hide', 'Hide') : t('ClientIntegrations.qogita.seeAll', 'see all')}
        </button>
      )}
      {expanded && matches.length > 1 && (
        <div className="mt-1 border rounded-lg p-2 bg-gray-50 space-y-1">
          {matches.map((m, idx) => (
            <div
              key={`${m.asin || 'N/A'}-${idx}`}
              className="text-xs text-text-secondary cursor-pointer hover:text-text-primary"
              title="Double click to copy"
              onDoubleClick={() => navigator.clipboard.writeText(String(m.asin || ''))}
            >
              {m.asin || '—'} {m.sku ? `· ${m.sku}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientQogitaShipments() {
  const { user } = useSupabaseAuth();
  const { t } = useDashboardTranslation();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState('');
  const [asinMap, setAsinMap] = useState({});
  const [expanded, setExpanded] = useState({});

  const loadShipments = async () => {
    if (!user?.id) return;
    setLoading(true);
    setFlash('');
    const { data, error } = await supabase.functions.invoke('qogita-shipments', {
      body: { user_id: user.id }
    });
    if (error) {
      const msg =
        error?.message?.includes('auth_failed')
          ? t('ClientIntegrations.qogita.authFailed', 'Token expirat/invalid. Te rog reconectează din Integrations.')
          : error.message || 'Nu am putut încărca livrările Qogita.';
      setFlash(msg);
      setShipments([]);
    } else {
      setShipments(data?.shipments || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const loadAsins = async () => {
      if (!user?.id) return;
      const gtins = Array.from(
        new Set(
          shipments
            .flatMap((s) => s.sale_lines || [])
            .map((line) => line.gtin)
            .filter(Boolean)
        )
      );
      if (!gtins.length) {
        setAsinMap({});
        return;
      }
      const { data, error } = await supabase
        .from('stock_items')
        .select('asin, sku, ean, name, image_url')
        .in('ean', gtins)
        .eq('user_id', user.id);
      if (error) {
        console.error('ASIN lookup error', error);
        return;
      }
      const map = {};
      (data || []).forEach((row) => {
        const key = row.ean;
        if (!map[key]) map[key] = [];
        map[key].push(row);
      });
      setAsinMap(map);
    };
    loadAsins();
  }, [shipments, user?.id]);

  const shipmentsWithLines = useMemo(() => shipments || [], [shipments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{t('reportsMenu.qogita', 'Qogita')}</h2>
          <p className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.instructions')}</p>
        </div>
        <button
          onClick={loadShipments}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
        >
          <RefreshCw className="w-4 h-4" /> {t('ClientIntegrations.refresh')}
        </button>
      </div>

      {flash && (
        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {flash}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
        </div>
      ) : shipmentsWithLines.length === 0 ? (
        <div className="text-sm text-text-secondary">{t('ClientIntegrations.qogita.empty')}</div>
      ) : (
        <div className="grid gap-4">
          {shipmentsWithLines.map((ship) => (
            <div key={`${ship.order_qid || ''}-${ship.shipment_code || ''}`} className="border rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-text-primary flex items-center gap-2">
                    {ship.shipment_code || 'Shipment'} {ship.country && <span className="text-xs text-text-secondary">· {ship.country}</span>}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {ship.seller ? `${ship.seller}` : ''}
                    {ship.order_qid ? ` · Order ${ship.order_qid}` : ''}
                  </div>
                </div>
                {ship.tracking_links?.length ? (
                  <div className="text-xs text-text-secondary">
                    {t('ClientIntegrations.qogita.tracking', 'Tracking')}:{" "}
                    {ship.tracking_links.map((tr, idx) => (
                      <a
                        key={tr}
                        href={tr}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {tr}
                        {idx < ship.tracking_links.length - 1 ? ', ' : ''}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-text-secondary">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">{t('ClientIntegrations.qogita.product', 'Product')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('ClientIntegrations.qogita.shipped', 'Shipped')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('ClientIntegrations.qogita.requested', 'Requested')}</th>
                      <th className="py-2 pr-3 font-semibold">{t('ClientIntegrations.qogita.asin', 'ASIN')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(ship.sale_lines || []).map((line, idx) => {
                      const matches = asinMap[line.gtin] || [];
                      const isExpanded = expanded[line.gtin];
                      return (
                        <tr key={`${line.gtin || 'line'}-${idx}`}>
                          <td className="py-2 pr-3 align-top">
                            <div className="flex flex-col">
                              <span className="font-medium text-text-primary text-sm">{line.name || '—'}</span>
                              <span className="text-xs text-text-secondary">GTIN: {line.gtin || '—'}</span>
                            </div>
                          </td>
                          <td className="py-2 pr-3 align-top">{line.shipped_qty ?? '—'}</td>
                          <td className="py-2 pr-3 align-top">{line.requested_qty ?? '—'}</td>
                          <td className="py-2 pr-3 align-top">
                            <AsinCell
                              matches={matches}
                              expanded={isExpanded}
                              onToggle={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [line.gtin]: !prev[line.gtin]
                                }))
                              }
                              t={t}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
