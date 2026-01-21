import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../../translations';
import { supabaseHelpers } from '@/config/supabaseHelpers';

function AsinCell({ matches, onToggle, expanded, t, onSelect, gtin, onStartEdit }) {
  if (!matches || matches.length === 0) {
    return <span className="text-text-secondary text-sm">—</span>;
  }
  const primary = matches[0];
  const rest = matches
    .slice(1)
    .filter((m) => !(m.asin === primary.asin && m.sku === primary.sku));
  return (
    <div className="text-sm text-text-primary">
      <div className="font-semibold flex items-center gap-2">
        {primary.asin || '—'}
        <button
          className="text-[11px] text-primary underline underline-offset-2"
          onClick={() => onStartEdit?.(gtin)}
        >
          Edit
        </button>
      </div>
      {primary.sku && <div className="text-xs text-text-secondary">SKU: {primary.sku}</div>}
      {rest.length > 0 && (
        <button
          onClick={onToggle}
          className="text-[11px] text-primary underline underline-offset-2"
        >
          {expanded ? t('common.hide', 'Hide') : t('ClientIntegrations.qogita.seeAll', 'see all')}
        </button>
      )}
      {expanded && rest.length > 0 && (
        <div className="mt-1 border rounded-lg p-2 bg-gray-50 space-y-1">
          {rest.map((m, idx) => (
            <div
              key={`${m.asin || 'N/A'}-${idx}`}
              className="text-xs text-text-secondary cursor-pointer hover:text-text-primary"
              title="Double click to set as primary"
              onDoubleClick={() => onSelect?.(m)}
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
  const [asinLoading, setAsinLoading] = useState({});
  const [loginModal, setLoginModal] = useState({ open: false, email: '', password: '', loading: false, error: '' });
  const [editAsin, setEditAsin] = useState({ gtin: '', value: '', saving: false, error: '' });

  const loadShipments = async () => {
    if (!user?.id) return;
    setLoading(true);
    setFlash('');
    // încercăm să aflăm emailul pentru autofill
    const { data: connData } = await supabase
      .from('qogita_connections')
      .select('qogita_email, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (connData?.qogita_email && !loginModal.email) {
      setLoginModal((prev) => ({ ...prev, email: connData.qogita_email }));
    }
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
      if (error?.message?.includes('auth_failed')) {
        setLoginModal((prev) => ({ ...prev, open: true, error: '' }));
      }
    } else {
      setShipments(data?.shipments || []);
      setLoginModal((prev) => ({ ...prev, open: false, error: '' }));
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
      const map = {};
      // 1) stoc
      const { data: stockData, error: stockErr } = await supabase
        .from('stock_items')
        .select('asin, sku, ean, name, image_url')
        .in('ean', gtins)
        .eq('user_id', user.id);
      if (stockErr) console.error('ASIN lookup error', stockErr);
      (stockData || []).forEach((row) => {
        const key = row.ean;
        if (!map[key]) map[key] = [];
        map[key].push(row);
      });
      // 2) asin_eans fallback
      const { data: asinMapRows, error: asinErr } = await supabase
        .from('asin_eans')
        .select('asin, ean')
        .in('ean', gtins)
        .eq('user_id', user.id);
      if (asinErr) console.error('ASIN map error', asinErr);
      (asinMapRows || []).forEach((row) => {
        const key = row.ean;
        if (!map[key]) map[key] = [];
        // evită duplicate dacă există deja din stoc
        if (!map[key].some((m) => m.asin === row.asin)) {
          map[key].push({ asin: row.asin, ean: row.ean, sku: null, image_url: null });
        }
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

  const setPrimaryAsin = (gtin, match) => {
    if (!gtin || !match) return;
    setAsinMap((prev) => {
      const current = prev[gtin] || [];
      const filtered = current.filter((m) => !(m.asin === match.asin && m.sku === match.sku));
      return { ...prev, [gtin]: [match, ...filtered] };
    });
    // sincronizează și liniile din modal, dacă e deschis
    setReqLines((prev) =>
      prev.map((l) =>
        l.gtin === gtin
          ? {
              ...l,
              asin: match.asin || l.asin,
              sku: match.sku || l.sku
            }
          : l
      )
    );
  };

  const saveManualAsin = async () => {
    if (!editAsin.gtin || !editAsin.value || !user?.id) return;
    const asin = editAsin.value.trim().toUpperCase();
    setEditAsin((p) => ({ ...p, saving: true, error: '' }));
    try {
      const { data: stockRow, error: stockErr } = await supabase
        .from('stock_items')
        .select('asin, sku, image_url')
        .eq('user_id', user.id)
        .eq('asin', asin)
        .maybeSingle();
      if (stockErr) throw stockErr;
      const entry = {
        asin,
        sku: stockRow?.sku || '-',
        image_url: stockRow?.image_url || null
      };
      setAsinMap((prev) => {
        const current = prev[editAsin.gtin] || [];
        const filtered = current.filter((m) => m.asin !== asin);
        return { ...prev, [editAsin.gtin]: [entry, ...filtered] };
      });
      setEditAsin({ gtin: '', value: '', saving: false, error: '' });
      setReqLines((prev) =>
        prev.map((l) =>
          l.gtin === editAsin.gtin
            ? { ...l, asin, sku: entry.sku, product_name: l.product_name }
            : l
        )
      );
    } catch (err) {
      setEditAsin((p) => ({ ...p, saving: false, error: err?.message || 'Save failed' }));
    }
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

  const handleAsinChange = async (idx, newAsinRaw) => {
    const asin = (newAsinRaw || '').trim().toUpperCase();
    setReqLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, asin, sku: asin ? l.sku : '-' } : l))
    );
    if (!asin || !user?.id) {
      setReqLines((prev) => prev.map((l, i) => (i === idx ? { ...l, sku: '-' } : l)));
      return;
    }
    setAsinLoading((prev) => ({ ...prev, [idx]: true }));
    const { data } = await supabase
      .from('stock_items')
      .select('sku')
      .eq('asin', asin)
      .eq('user_id', user.id)
      .maybeSingle();
    setReqLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, sku: data?.sku || '-' } : l))
    );
    setAsinLoading((prev) => ({ ...prev, [idx]: false }));
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

  const submitLogin = async () => {
    if (!loginModal.email || !loginModal.password) {
      setLoginModal((prev) => ({ ...prev, error: 'Completează email și parolă.' }));
      return;
    }
    setLoginModal((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const { error } = await supabase.functions.invoke('qogita-connect', {
        body: { email: loginModal.email, password: loginModal.password, user_id: user?.id }
      });
      if (error) {
        setLoginModal((prev) => ({ ...prev, error: error.message || 'Login failed', loading: false }));
        return;
      }
      setLoginModal((prev) => ({ ...prev, loading: false, open: false, password: '', error: '' }));
      await loadShipments();
    } catch (err) {
      setLoginModal((prev) => ({ ...prev, error: err?.message || 'Login error', loading: false }));
    }
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
                              onSelect={(m) => setPrimaryAsin(line.gtin, m)}
                              gtin={line.gtin}
                              onStartEdit={(gtin) =>
                                setEditAsin({ gtin, value: '', saving: false, error: '' })
                              }
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
                                  'Fetch ASIN'
                                )}
                              </button>
                            )}
                            {editAsin.gtin === line.gtin && (
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  className="border rounded px-2 py-1 text-xs w-32"
                                  placeholder="Set ASIN"
                                  value={editAsin.value}
                                  onChange={(e) => setEditAsin((p) => ({ ...p, value: e.target.value }))}
                                />
                                <button
                                  className="text-[11px] text-primary underline disabled:opacity-60"
                                  disabled={!editAsin.value || editAsin.saving}
                                  onClick={saveManualAsin}
                                >
                                  {editAsin.saving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  className="text-[11px] text-text-secondary underline"
                                  onClick={() => setEditAsin({ gtin: '', value: '', saving: false, error: '' })}
                                  disabled={editAsin.saving}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                            {editAsin.error && editAsin.gtin === line.gtin && (
                              <div className="text-[11px] text-rose-600">{editAsin.error}</div>
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
                        <div className="flex items-center gap-2">
                          <input
                            className="border rounded px-2 py-1 text-xs w-32"
                            value={line.asin || ''}
                            placeholder="B0..."
                            onChange={(e) => handleAsinChange(idx, e.target.value)}
                          />
                          {asinLoading[idx] && <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />}
                        </div>
                        <div className="text-[11px] text-text-secondary mt-1">SKU: {line.sku || '-'}</div>
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

      {loginModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-text-primary">Reconnect Qogita</h3>
              <button onClick={() => setLoginModal((prev) => ({ ...prev, open: false }))} className="text-text-secondary hover:text-text-primary">✕</button>
            </div>
            {loginModal.error && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded px-3 py-2">
                {loginModal.error}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Email Qogita</label>
                <input
                  name="email"
                  autoComplete="email"
                  type="email"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={loginModal.email}
                  onChange={(e) => setLoginModal((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Parolă</label>
                <input
                  name="password"
                  autoComplete="current-password"
                  type="password"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={loginModal.password}
                  onChange={(e) => setLoginModal((prev) => ({ ...prev, password: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setLoginModal((prev) => ({ ...prev, open: false }))}
                className="px-4 py-2 rounded-lg border text-sm text-text-secondary"
                disabled={loginModal.loading}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitLogin}
                disabled={loginModal.loading}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm inline-flex items-center gap-2 disabled:opacity-60"
              >
                {loginModal.loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Reconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
