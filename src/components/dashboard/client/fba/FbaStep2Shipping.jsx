import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Truck } from 'lucide-react';

export default function FbaStep2Shipping({
  shipment,
  hazmat = false,
  fetchPartneredQuote, // optional async ({ method, hazmat }) => { allowed: boolean; rate: number; reason?: string }
  onCarrierChange,
  onModeChange,
  onShipDateChange,
  onNext,
  onBack,
  error = ''
}) {
  const { deliveryDate, method, carrier, shipments, warning } = shipment;
  const [shipDate, setShipDate] = useState(deliveryDate || '');
  const [partneredAllowed, setPartneredAllowed] = useState(true);
  const [partneredReason, setPartneredReason] = useState('');
  const [partneredRate, setPartneredRate] = useState(
    typeof carrier?.rate === 'number' ? carrier.rate : null
  );
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const runQuote = async () => {
      if (typeof fetchPartneredQuote !== 'function') {
        setPartneredAllowed(!hazmat);
        setPartneredReason(hazmat ? 'Hazmat items are not eligible for partnered carrier.' : '');
        return;
      }
      const res = await fetchPartneredQuote({ method, hazmat });
      if (cancelled) return;
      setPartneredAllowed(res?.allowed ?? true);
      setPartneredReason(res?.reason || '');
      if (typeof res?.rate === 'number') setPartneredRate(res.rate);
    };
    runQuote().catch(() => {
      if (!cancelled) {
        setPartneredAllowed(!hazmat);
        setPartneredReason('');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPartneredQuote, hazmat, method]);

  const shipmentCount = shipments?.length || 0;
  const totalBoxes = shipments?.reduce((s, sh) => s + (Number(sh.boxes) || 0), 0) || 0;
  const totalUnits = shipments?.reduce((s, sh) => s + (Number(sh.units) || 0), 0) || 0;
  const totalSkus = shipments?.reduce((s, sh) => s + (Number(sh.skuCount) || 0), 0) || 0;
  const totalWeight = shipments?.reduce((s, sh) => s + (Number(sh.weight) || 0), 0) || 0;
  const carrierName = carrier?.partnered ? 'UPS (Amazon-partnered carrier)' : carrier?.name || 'Non Amazon partnered carrier';

  const summaryTitle = useMemo(() => {
    const modeLabel = method === 'SPD' ? 'Small parcel delivery (SPD)' : 'Less than truckload (LTL/FTL)';
    return `${carrierName} · ${modeLabel}`;
  }, [carrierName, method]);

  const renderShipmentCard = (s) => (
    <div key={s.id} className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <div className="font-semibold text-slate-900">Shipment #{s.id}</div>
        <div className="text-sm text-slate-600">Boxes: {s.boxes} · SKUs: {s.skuCount} · Units: {s.units} · Weight: {s.weight || '—'} kg</div>
      </div>
      <div className="px-4 py-3 text-sm text-slate-700 space-y-1">
        <div>Ship from: {s.from}</div>
        <div>Ship to: {s.to}</div>
        <div>Fulfilment capability: {s.capability || 'Standard'}</div>
        {Array.isArray(s.boxesDetail) && s.boxesDetail.length > 0 && (
          <div className="text-xs text-slate-500">
            {s.boxesDetail.length} boxes with dimensions/weight captured from packing.
          </div>
        )}
      </div>
    </div>
  );

  const disablePartnered = !partneredAllowed;
  const partneredLabel = partneredReason || 'Estimated charge';
  const partneredChargeText =
    disablePartnered || partneredRate === null ? 'Not available' : `€${partneredRate.toFixed(2)}`;
  const canContinue = carrier?.partnered ? termsAccepted && partneredAllowed : true;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 2 - Confirm shipping</div>
        <div className="text-sm text-slate-500">Delivery date: {shipDate || '—'}</div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 text-red-800 border border-red-200 px-3 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
        {warning && (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 rounded-md text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5" /> {warning}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="font-semibold text-slate-800 mb-1">Ship date</div>
            <input
              type="date"
              value={shipDate}
              onChange={(e) => {
                setShipDate(e.target.value);
                onShipDateChange?.(e.target.value);
              }}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="font-semibold text-slate-800 mb-1">Shipping mode</div>
            <div className="flex flex-col gap-2">
              <label className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${method === 'SPD' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <span className="flex items-center gap-2"><Truck className="w-4 h-4" /> Small parcel delivery (SPD)</span>
                <input type="radio" checked={method === 'SPD'} onChange={() => onModeChange('SPD')} />
              </label>
              <label className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${method === 'LTL' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <span>Less than and full truckload (LTL/FTL)</span>
                <input type="radio" checked={method === 'LTL'} onChange={() => onModeChange('LTL')} />
              </label>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="font-semibold text-slate-800 mb-1">Merge workflow</div>
            <div className="text-xs text-slate-500">Merge workflows is not available for small parcel shipments.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="font-semibold text-slate-900">Select shipping carrier</div>
            <div className="flex flex-col gap-2 text-sm">
              <label className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${carrier.partnered ? 'border-blue-500 bg-blue-50' : 'border-slate-200'} ${disablePartnered ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="flex flex-col">
                  <span className="font-semibold">UPS (Amazon-partnered carrier)</span>
                  <span className="text-xs text-slate-500">{partneredLabel}: {partneredChargeText}</span>
                </div>
                <input
                  type="radio"
                  disabled={disablePartnered}
                  checked={carrier.partnered && partneredAllowed}
                  onChange={() => onCarrierChange({ partnered: true, name: 'UPS (Amazon-partnered carrier)', rate: partneredRate })}
                />
              </label>
              <label className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${!carrier.partnered ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <div className="flex flex-col">
                  <span className="font-semibold">Non Amazon partnered carrier</span>
                  <span className="text-xs text-slate-500">Select carrier</span>
                </div>
                <input
                  type="radio"
                  checked={!carrier.partnered}
                  onChange={() => onCarrierChange({ partnered: false, name: carrier.name || 'Non Amazon partnered carrier' })}
                />
              </label>
              {!carrier.partnered && (
                <select
                  value={carrier.name || ''}
                  onChange={(e) => onCarrierChange({ partnered: false, name: e.target.value })}
                  className="border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select carrier</option>
                  <option value="UPS (non-partnered)">UPS (non-partnered)</option>
                  <option value="DHL">DHL</option>
                  <option value="Chronopost">Chronopost</option>
                </select>
              )}
              <div className="text-xs text-slate-500">
                The Amazon Partnered Carrier programme offers discounted rates, buying/printing labels, and automated tracking.
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
            <div className="font-semibold text-slate-900">Shipment charges</div>
            <div className="flex items-center justify-between">
              <span>Estimated carrier charges</span>
              <span className="font-semibold">{partneredChargeText}</span>
            </div>
            <div className="text-xs text-slate-500">
              Review charges before continuing. You have up to 24h to void Amazon partnered shipping charges.
            </div>
          </div>
        </div>

        <div className="space-y-3">
        <div className="font-semibold text-slate-900 text-sm">Number of shipments: {shipmentCount}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shipments.map(renderShipmentCard)}
        </div>
        <div className="text-sm text-slate-700">
            Boxes: {totalBoxes} · SKUs: {totalSkus} · Units: {totalUnits} · Weight: {totalWeight || '—'} kg
        </div>
      </div>

        {carrier.partnered && partneredAllowed && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
            <div className="font-semibold text-slate-900">Ready to continue?</div>
            <div className="text-xs text-slate-600">
              Before we generate shipping labels, review details and confirm charges.
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span className="text-xs text-slate-700">
                I agree to the Amazon Partnered Carrier Terms and Conditions and the Carrier Terms and Conditions.
              </span>
            </div>
            <div className="text-xs text-slate-500">
              When using an Amazon partnered carrier, you have up to 24 hours to void charges.
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600">{summaryTitle}</div>
        <div className="flex gap-3 justify-end">
          <button onClick={onBack} className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md">
            Back
          </button>
          <button
            onClick={onNext}
            disabled={!canContinue}
            className={`px-4 py-2 rounded-md font-semibold shadow-sm ${canContinue ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
          >
            Continue to labels
          </button>
        </div>
      </div>
    </div>
  );
}
