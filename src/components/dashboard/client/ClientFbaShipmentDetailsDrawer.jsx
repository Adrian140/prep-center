import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase, supabaseHelpers } from '../../../config/supabase';

const HEAVY_PARCEL_LABEL_UNIT_PRICE = 0.2;

const formatMoney2 = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
};

const formatDisplayDate = (value, withTime = false) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    const datePart = date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    if (!withTime) return datePart;
    const timePart = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  } catch {
    return value;
  }
};

const extractShipmentIds = (header) => {
  const step2 = Array.isArray(header?.step2_shipments) ? header.step2_shipments : [];
  const ids = step2
    .map((sh) => sh?.amazonShipmentId || sh?.amazon_shipment_id || sh?.shipmentId || sh?.shipment_id)
    .filter(Boolean);
  if (ids.length > 0) return Array.from(new Set(ids));
  if (header?.fba_shipment_id) return [header.fba_shipment_id];
  if (header?.amazon_snapshot?.shipment_id) return [header.amazon_snapshot.shipment_id];
  return [];
};

export default function ClientFbaShipmentDetailsDrawer({
  open,
  onClose,
  requestId,
  shipmentId
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [header, setHeader] = useState(null);
  const [lines, setLines] = useState([]);
  const [boxServices, setBoxServices] = useState([]);
  const [heavyParcel, setHeavyParcel] = useState(null);

  useEffect(() => {
    if (!open || !requestId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: prepError } = await supabaseHelpers.getPrepRequest(requestId);
        if (prepError) throw prepError;
        if (cancelled) return;

        const baseLines = Array.isArray(data?.prep_request_items) ? data.prep_request_items : [];
        const normalizedLines = baseLines.map((line) => ({
          ...line,
          services: []
        }));
        setHeader(data || null);
        setLines(normalizedLines);

        const { data: serviceRows, error: serviceError } = await supabase
          .from('prep_request_services')
          .select('prep_request_item_id, service_name, units, unit_price, item_type')
          .eq('request_id', requestId);

        if (!cancelled && !serviceError) {
          const byItem = {};
          const box = [];
          (serviceRows || []).forEach((svc) => {
            const qty = Math.max(0, Number(svc?.units || 0));
            if (!qty) return;
            const mapped = {
              service_name: String(svc?.service_name || '').trim() || 'Service',
              units: qty,
              unit_price: Number(svc?.unit_price || 0)
            };
            if (String(svc?.item_type || '').toLowerCase() === 'box') {
              box.push(mapped);
              return;
            }
            if (!svc?.prep_request_item_id) return;
            if (!byItem[svc.prep_request_item_id]) byItem[svc.prep_request_item_id] = [];
            byItem[svc.prep_request_item_id].push(mapped);
          });

          setBoxServices(box);
          setLines((prev) =>
            prev.map((line) => ({
              ...line,
              services: line?.id ? byItem[line.id] || [] : []
            }))
          );
        } else if (!cancelled) {
          setBoxServices([]);
        }

        const { data: heavyRows, error: heavyError } = await supabase
          .from('prep_request_heavy_parcel')
          .select('market, heavy_boxes, labels_count, unit_price, total_price')
          .eq('request_id', requestId);
        if (!cancelled) {
          if (!heavyError) {
            const list = Array.isArray(heavyRows) ? heavyRows : [];
            setHeavyParcel(list[0] || null);
          } else {
            setHeavyParcel(null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Unable to load shipment details.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, requestId]);

  const summary = useMemo(() => {
    const serviceTotal = lines.reduce((sum, line) => {
      const services = Array.isArray(line?.services) ? line.services : [];
      return (
        sum +
        services.reduce((svcSum, svc) => {
          const qty = Number(svc?.units || 0);
          const price = Number(svc?.unit_price || 0);
          if (!Number.isFinite(qty) || !Number.isFinite(price)) return svcSum;
          return svcSum + qty * price;
        }, 0)
      );
    }, 0);

    const boxesTotal = (boxServices || []).reduce((sum, svc) => {
      const qty = Number(svc?.units || 0);
      const price = Number(svc?.unit_price || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
      return sum + qty * price;
    }, 0);

    const heavyLabelsCount = Number(heavyParcel?.labels_count || 0);
    const heavyUnitPrice = Number(heavyParcel?.unit_price || HEAVY_PARCEL_LABEL_UNIT_PRICE);
    const heavyTotalFromTable = Number(heavyParcel?.total_price);
    const heavyTotal = Number.isFinite(heavyTotalFromTable)
      ? heavyTotalFromTable
      : heavyLabelsCount * heavyUnitPrice;

    return {
      serviceTotal,
      boxesTotal,
      heavyLabelsCount,
      heavyUnitPrice,
      heavyTotal,
      grandTotal: serviceTotal + boxesTotal + heavyTotal
    };
  }, [lines, boxServices, heavyParcel]);

  if (!open) return null;

  const shipmentIds = extractShipmentIds(header);
  const displayShipmentId = shipmentId || shipmentIds[0] || '—';

  return (
    <aside className="fixed right-0 top-0 z-[180] h-screen w-full max-w-4xl border-l border-gray-200 bg-white shadow-2xl">
      <div className="sticky top-0 z-10 border-b bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-secondary">FBA shipment details</div>
            <div className="text-lg font-semibold text-text-primary">{displayShipmentId}</div>
            <div className="text-xs text-text-secondary">
              Request ID: {requestId || '—'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded border px-2.5 py-1.5 text-sm text-text-secondary hover:bg-gray-50"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[calc(100vh-86px)] overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading shipment details...
          </div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border bg-slate-50/40 p-3 text-sm md:grid-cols-2">
              <div>
                <div className="text-xs uppercase text-text-secondary">Status</div>
                <div className="font-medium text-text-primary">
                  {header?.amazon_status || header?.status || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-text-secondary">Last updated</div>
                <div className="font-medium text-text-primary">
                  {formatDisplayDate(header?.amazon_last_updated || header?.updated_at, true)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-text-secondary">Created</div>
                <div className="font-medium text-text-primary">
                  {formatDisplayDate(header?.created_at, true)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-text-secondary">Shipment IDs</div>
                <div className="font-mono text-xs text-text-primary break-all">
                  {shipmentIds.length ? shipmentIds.join(' · ') : '—'}
                </div>
              </div>
            </div>

            <div className="overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">ASIN / SKU</th>
                    <th className="px-3 py-2 text-left">Line services</th>
                    <th className="px-3 py-2 text-right">Units expected</th>
                    <th className="px-3 py-2 text-right">Units located</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-5 text-center text-text-secondary">
                        No line details available.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const productName = line?.stock_item?.name || line?.product_name || '—';
                      const asin = line?.asin || line?.stock_item?.asin || '';
                      const sku = line?.sku || line?.stock_item?.sku || '';
                      const services = Array.isArray(line?.services) ? line.services : [];
                      return (
                        <tr key={line.id || `${productName}-${asin}-${sku}`} className="border-t">
                          <td className="px-3 py-2">{productName}</td>
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs">{asin || '—'}</div>
                            <div className="font-mono text-xs text-text-secondary">{sku ? `SKU: ${sku}` : '—'}</div>
                          </td>
                          <td className="px-3 py-2">
                            {services.length === 0 ? (
                              <span className="text-xs text-text-secondary">—</span>
                            ) : (
                              <div className="space-y-1 text-xs">
                                {services.map((svc, idx) => (
                                  <div key={`${line.id || 'line'}-svc-${idx}`} className="flex justify-between gap-2">
                                    <span>
                                      <span className="font-medium">{svc.service_name}</span>
                                      <span className="text-text-secondary">
                                        {' '}
                                        × {Number(svc.units || 0)} × {formatMoney2(svc.unit_price || 0)}
                                      </span>
                                    </span>
                                    <span className="font-medium">
                                      = {formatMoney2(Number(svc.units || 0) * Number(svc.unit_price || 0))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {line?.amazon_units_expected ?? line?.units_sent ?? line?.units_requested ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {line?.amazon_units_received ?? '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border bg-slate-50/60 p-3 text-sm">
              <div className="flex items-center justify-between py-0.5">
                <span>SKU services total</span>
                <span className="font-semibold">{formatMoney2(summary.serviceTotal)} EUR</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Boxes total</span>
                <span className="font-semibold">{formatMoney2(summary.boxesTotal)} EUR</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span>Heavy parcel labels</span>
                <span className="font-semibold">
                  {summary.heavyLabelsCount} × {formatMoney2(summary.heavyUnitPrice)} = {formatMoney2(summary.heavyTotal)} EUR
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>Grand total</span>
                <span>{formatMoney2(summary.grandTotal)} EUR</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
