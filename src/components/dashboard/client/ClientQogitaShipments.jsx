import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';
import { supabaseHelpers } from '@/config/supabaseHelpers';

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
  const [reqModal, setReqModal] = useState(null);
  const [reqMode, setReqMode] = useState('none'); // none | full | partial
  const [reqDestination, setReqDestination] = useState('FR');
  const [reqLines, setReqLines] = useState([]);
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqFlash, setReqFlash] = useState('');
  const [fetchingAsin, setFetchingAsin] = useState({});
  const [completed, setCompleted] = useState({});

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

  const DESTINATION_OPTIONS = [
    { code: 'FR', label: 'France' },
    { code: 'DE', label: 'Germany' },
    { code: 'IT', label: 'Italy' },
    { code: 'ES', label: 'Spain' },
    { code: 'UK', label: 'United Kingdom' }
  ];

  const openRequestModal = (ship) => {
    const lines = (ship.sale_lines || []).map((line) => {
      const matches = asinMap[line.gtin] || [];
      const match = matches[0] || {};
      const qty = line.shipped_qty ?? line.requested_qty ?? 0;
      const fallbackSku = line.gtin || '';
      return {
        gtin: line.gtin || '',
        name: line.name || '',
        shipped_qty: line.shipped_qty ?? line.requested_qty ?? 0,
        requested_qty: line.requested_qty ?? line.shipped_qty ?? 0,
        available_units: qty,
        units: qty,
        stock_item_id: match.id || null,
        asin: match.asin || null,
        sku: match.sku || fallbackSku || null,
        product_name: match.name || line.name || ''
      };
    });
    setReqLines(lines);
    setReqMode('none');
    setReqDestination('FR');
    setReqFlash('');
    setReqModal({ shipment_code: ship.shipment_code, order_qid: ship.order_qid, fid: ship.fid, seller: ship.seller, tracking: ship.tracking_links || [], country: ship.country });
  };

  const fetchKeepaForLine = async (gtin) => {
    if (!gtin || !user?.id || !reqModal) return;
    setFetchingAsin((prev) => ({ ...prev, [gtin]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('qogita-keepa', {
        body: { user_id: user.id, company_id: user.company_id || user.id, ean: gtin, country: reqModal.country || 'FR' }
      });
      if (error) throw error;
      if (data?.asin) {
        setReqLines((prev) =>
          prev.map((l) => (l.gtin === gtin ? { ...l, asin: data.asin, product_name: l.product_name || data.title || l.name } : l))
        );
        setAsinMap((prev) => ({
          ...prev,
          [gtin]: [{ asin: data.asin, sku: gtin, name: data.title || null, image_url: data.image || null }]
        }));
      } else {
        setReqFlash('Keepa nu a găsit ASIN pentru acest EAN.');
      }
    } catch (err) {
      setReqFlash(err?.message || 'Nu am putut lua ASIN din Keepa.');
    }
    setFetchingAsin((prev) => ({ ...prev, [gtin]: false }));
  };

  const submitRequest = async () => {
    if (!user?.id || !reqModal) return;
    setReqSubmitting(true);
    setReqFlash('');
    try {
      const invalid = reqLines.find((l) => Number(l.units || 0) <= 0 || !l.asin);
      if (invalid) {
        setReqFlash(t('ClientIntegrations.qogita.missingIdentifiers', 'Adaugă ASIN și unități > 0 pentru fiecare linie.'));
        setReqSubmitting(false);
        return;
      }
      const items = reqLines.map((l) => {
        const units = reqMode === 'partial' ? Number(l.units || 0) : Number(l.shipped_qty || l.requested_qty || 0);
        return {
          stock_item_id: l.stock_item_id,
          ean: l.gtin || null,
          product_name: l.product_name || l.name || null,
          asin: l.asin || null,
          sku: l.sku || l.gtin || null,
          units_requested: units,
          send_to_fba: false,
          fba_qty: 0
        };
      });
      const tracking = reqModal.tracking?.[0] || null;
      await supabaseHelpers.createReceptionRequest({
        user_id: user.id,
        company_id: user.company_id || user.id,
        destination_country: reqDestination,
        carrier: 'Qogita',
        tracking_id: tracking,
        tracking_ids: reqModal.tracking || (tracking ? [tracking] : []),
        items
      });
      setReqFlash(t('ClientIntegrations.qogita.requestCreated', 'Request confirmed. Vezi în Receptions.'));
      setCompleted((prev) => ({ ...prev, [reqModal.shipment_code || '']: true }));
      setTimeout(() => {
        setReqModal(null);
      }, 800);
    } catch (err) {
      setReqFlash(err?.message || 'Nu am putut crea request-ul.');
    }
    setReqSubmitting(false);
  };

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
                    {ship.order_qid ? ` · Order ${ship.fid || ship.order_qid}` : ''}
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
                <div className="flex items-center gap-3">
                  {completed[ship.shipment_code || ''] && (
                    <div className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                      <span className="w-4 h-4 rounded-full border border-emerald-600 flex items-center justify-center text-[10px]">✓</span>
                      Finalizat
                    </div>
                  )}
                  <button
                    onClick={() => openRequestModal(ship)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
                  >
                    {t('ClientIntegrations.qogita.createRequest', 'Create request')}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-text-secondary">
                    <tr>
                      <th className="py-2 pr-3 font-semibold w-14">Photo</th>
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
                      const thumb = matches[0]?.image_url || null;
                      return (
                        <tr key={`${line.gtin || 'line'}-${idx}`}>
                          <td className="py-2 pr-3 align-top">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={line.name || 'img'}
                                className="w-12 h-12 rounded object-cover border"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded border bg-gray-50 flex items-center justify-center text-[10px] text-text-secondary">
                                —
                              </div>
                            )}
                          </td>
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
                            {!matches.length && line.gtin && (
                              <button
                                onClick={() => fetchKeepaForLine(line.gtin)}
                                className="mt-2 text-[11px] text-primary underline inline-flex items-center gap-1 disabled:opacity-60"
                                disabled={!!fetchingAsin[line.gtin]}
                              >
                                {fetchingAsin[line.gtin] ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" /> {t('ClientIntegrations.qogita.fetching', 'Caut ASIN...')}
                                  </>
                                ) : (
                                  t('ClientIntegrations.qogita.fetchKeepa', 'Fetch ASIN')
                                )}
                              </button>
                            )}
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

      {reqModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-text-secondary mb-1">
                  {reqModal.shipment_code || 'Shipment'} {reqModal.fid ? `· Order ${reqModal.fid}` : ''}
                </div>
                <h3 className="text-lg font-semibold text-text-primary">{t('ClientIntegrations.qogita.createRequest', 'Create request')}</h3>
                {reqFlash && (
                  <div className="mt-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-3 py-2">
                    {reqFlash}
                  </div>
                )}
              </div>
              <button onClick={() => setReqModal(null)} className="text-text-secondary hover:text-text-primary text-sm">✕</button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Destination country</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={reqDestination}
                  onChange={(e) => setReqDestination(e.target.value)}
                >
                  {DESTINATION_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={reqMode === 'none'} onChange={() => setReqMode('none')} />
                  {t('ClientIntegrations.qogita.modeNone', 'Do not send now')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={reqMode === 'full'} onChange={() => setReqMode('full')} />
                  {t('ClientIntegrations.qogita.modeFull', 'Send all units to Amazon')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={reqMode === 'partial'} onChange={() => setReqMode('partial')} />
                  {t('ClientIntegrations.qogita.modePartial', 'Partial shipment')}
                </label>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">GTIN</th>
                    <th className="px-3 py-2 text-left">ASIN/SKU</th>
                    {reqMode === 'partial' ? (
                      <>
                        <th className="px-3 py-2 text-right">Available</th>
                        <th className="px-3 py-2 text-right">Units to send</th>
                      </>
                    ) : (
                      <th className="px-3 py-2 text-right">Units</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reqLines.map((line, idx) => (
                    <tr key={`${line.gtin || 'line'}-${idx}`}>
                      <td className="px-3 py-2">{line.name || line.product_name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{line.gtin || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-text-primary font-semibold">{line.asin || '—'}</div>
                        {line.sku && <div className="text-[11px] text-text-secondary">SKU: {line.sku}</div>}
                      </td>
                      {reqMode === 'partial' ? (
                        <>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {line.available_units ?? line.units ?? 0}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={line.available_units ?? undefined}
                              className="w-24 border rounded px-2 py-1 text-right"
                              value={line.units}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setReqLines((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, units: val } : l))
                                );
                              }}
                            />
                          </td>
                        </>
                      ) : (
                        <td className="px-3 py-2 text-right">{line.units}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setReqModal(null)}
                className="px-4 py-2 rounded-lg border text-sm text-text-secondary"
                disabled={reqSubmitting}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitRequest}
                disabled={reqSubmitting}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm inline-flex items-center gap-2 disabled:opacity-60"
              >
                {reqSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('ClientIntegrations.qogita.createRequest', 'Create request')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
