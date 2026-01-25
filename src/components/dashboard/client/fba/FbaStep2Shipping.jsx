import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Truck } from 'lucide-react';

export default function FbaStep2Shipping({
  shipment,
  hazmat = false,
  fetchPartneredQuote, // optional async ({ method, hazmat }) => { allowed: boolean; rate: number; reason?: string }
  forcePartneredOnly = false,
  onCarrierChange,
  onModeChange,
  onPalletDetailsChange,
  onShipDateChange,
  onNext,
  onBack,
  confirming = false,
  error = ''
}) {
  const { deliveryDate, method, carrier, shipments, warning, palletDetails } = shipment;
  const [shipDate, setShipDate] = useState(deliveryDate || '');
  const [partneredAllowed, setPartneredAllowed] = useState(true);
  const [partneredReason, setPartneredReason] = useState('');
  const [partneredRate, setPartneredRate] = useState(
    typeof carrier?.rate === 'number' ? carrier.rate : null
  );
  const safePalletDetails = useMemo(
    () =>
      palletDetails || {
        quantity: 1,
        length: '',
        width: '',
        height: '',
        weight: '',
        stackability: 'STACKABLE',
        freightClass: 'FC_XX',
        declaredValue: '',
        declaredValueCurrency: 'EUR'
      },
    [palletDetails]
  );

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
  const lbToKg = (lb) => Number(lb || 0) * 0.45359237;
  const toKg = (weight, unit) => (String(unit || 'KG').toUpperCase() === 'LB' ? lbToKg(weight) : Number(weight || 0));
  const totalWeight = shipments?.reduce((s, sh) => s + toKg(sh.weight, sh.weight_unit), 0) || 0;
  const carrierName = carrier?.partnered
    ? 'UPS (Amazon-partnered carrier)'
    : typeof carrier?.name === 'string'
      ? carrier.name
      : 'Non Amazon partnered carrier';

  const summaryTitle = useMemo(() => {
    const modeLabel =
      method === 'LTL'
        ? 'Less-than-truckload (LTL)'
        : method === 'FTL'
          ? 'Full truckload (FTL)'
          : 'Small parcel delivery (SPD)';
    return `${carrierName} · ${modeLabel}`;
  }, [carrierName, method]);

  const renderShipmentCard = (s) => (
    <div key={s.id} className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <div className="font-semibold text-slate-900">Shipment #{s.id}</div>
        <div className="text-sm text-slate-600">
          Boxes: {s.boxes} · SKUs: {s.skuCount} · Units: {s.units} · Weight:{' '}
          {Number.isFinite(toKg(s.weight, s.weight_unit)) && toKg(s.weight, s.weight_unit) > 0
            ? `${toKg(s.weight, s.weight_unit).toFixed(2)} kg`
            : '—'}
        </div>
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

  const allowPartnered = partneredAllowed;
  const allowNonPartnered = !forcePartneredOnly || !allowPartnered;
  const disablePartnered = !allowPartnered;
  const partneredLabel = partneredReason || 'Estimated charge';
  const partneredChargeText =
    disablePartnered || partneredRate === null ? 'Not available' : `€${partneredRate.toFixed(2)}`;
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const needsTerms = Boolean(carrier?.partnered && allowPartnered);
  const needsCarrierSelection = Boolean(!carrier?.partnered && allowNonPartnered);
  const hasCarrierSelection = !needsCarrierSelection || Boolean(String(carrier?.name || '').trim());
  const canContinue =
    (carrier?.partnered ? allowPartnered : allowNonPartnered) &&
    (!needsTerms || acceptedTerms) &&
    hasCarrierSelection;

  useEffect(() => {
    if (allowPartnered || !allowNonPartnered || !carrier?.partnered) return;
    onCarrierChange?.({ partnered: false, name: carrier?.name || '' });
  }, [allowPartnered, allowNonPartnered, carrier?.partnered, carrier?.name, onCarrierChange]);

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
                <input type="radio" checked={method === 'SPD'} onChange={() => onModeChange?.('SPD')} />
              </label>
              <label className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${method === 'LTL' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <span className="flex items-center gap-2"><Truck className="w-4 h-4" /> Less-than-truckload (LTL)</span>
                <input type="radio" checked={method === 'LTL'} onChange={() => onModeChange?.('LTL')} />
              </label>
              <label className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${method === 'FTL' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <span className="flex items-center gap-2"><Truck className="w-4 h-4" /> Full truckload (FTL)</span>
                <input type="radio" checked={method === 'FTL'} onChange={() => onModeChange?.('FTL')} />
              </label>
              <div className="text-xs text-slate-500">
                Pentru LTL/FTL sunt necesare paletizare și freight information.
              </div>
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
                  checked={carrier.partnered && allowPartnered}
                  onChange={() => onCarrierChange({ partnered: true, name: 'UPS (Amazon-partnered carrier)', rate: partneredRate })}
                />
              </label>
              {allowNonPartnered && (
                <>
                  <label className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${!carrier.partnered ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                    <div className="flex flex-col">
                      <span className="font-semibold">Non Amazon partnered carrier</span>
                      <span className="text-xs text-slate-500">Select carrier</span>
                    </div>
                    <input
                      type="radio"
                      checked={!carrier.partnered}
                      onChange={() => onCarrierChange({ partnered: false, name: carrier.name || '' })}
                    />
                  </label>
                  {!carrier.partnered && (
                    <select
                      value={carrier.name || ''}
                      onChange={(e) => onCarrierChange({ partnered: false, name: e.target.value })}
                      className="border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select carrier</option>
                      <option value="Chronopost">Chronopost</option>
                      <option value="Exapaq">Exapaq</option>
                      <option value="FedEx">FedEx</option>
                      <option value="FedEx Ground">FedEx Ground</option>
                      <option value="France Express">France Express</option>
                      <option value="Global Logistics Services (GLS)">Global Logistics Services (GLS)</option>
                      <option value="La Poste">La Poste</option>
                      <option value="TNT">TNT</option>
                      <option value="UPS (non-partnered carrier)">UPS (non-partnered carrier)</option>
                      <option value="Other">Other</option>
                    </select>
                  )}
                  {!carrier.partnered && !hasCarrierSelection && (
                    <div className="text-xs text-red-600">
                      Selectează un curier non-partener înainte de a continua.
                    </div>
                  )}
                </>
              )}
              {!allowNonPartnered && (
                <div className="text-xs text-slate-500">
                  Non-partnered carriers are disabled. This shipment must use Amazon partnered carrier.
                </div>
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
            {needsTerms && (
              <label className="flex items-start gap-2 text-xs text-slate-600 pt-2">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I agree to the Amazon Partnered Carrier Terms and Conditions and the Carrier Terms and Conditions.
                </span>
              </label>
            )}
          </div>

          {!carrier?.partnered && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="font-semibold text-amber-900">Delivery window</div>
              <div className="text-xs text-amber-800">
                Pentru non-partener, Amazon cere fereastra estimată de sosire; vom genera și confirma automat fereastra disponibilă/cea mai apropiată pe baza “Ship date”.
              </div>
            </div>
          )}
        </div>

        {method !== 'SPD' && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="font-semibold text-slate-900">Pallet and freight information</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">Pallet quantity</div>
                <input
                  type="number"
                  min="1"
                  value={safePalletDetails.quantity ?? 1}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, quantity: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Pallet weight (kg)</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={safePalletDetails.weight ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, weight: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Stackability</div>
                <select
                  value={safePalletDetails.stackability || 'STACKABLE'}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, stackability: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="STACKABLE">STACKABLE</option>
                  <option value="NON_STACKABLE">NON_STACKABLE</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Length (cm)</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={safePalletDetails.length ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, length: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Width (cm)</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={safePalletDetails.width ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, width: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Height (cm)</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={safePalletDetails.height ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, height: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Freight class</div>
                <input
                  type="text"
                  value={safePalletDetails.freightClass ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, freightClass: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Declared value</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={safePalletDetails.declaredValue ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, declaredValue: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Currency</div>
                <input
                  type="text"
                  value={safePalletDetails.declaredValueCurrency ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, declaredValueCurrency: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Amazon folosește aceste date pentru opțiuni LTL/FTL și tarife PCP.
            </div>
          </div>
        )}

        <div className="space-y-3">
        <div className="font-semibold text-slate-900 text-sm">Number of shipments: {shipmentCount}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shipments.map(renderShipmentCard)}
        </div>
        <div className="text-sm text-slate-700">
            Boxes: {totalBoxes} · SKUs: {totalSkus} · Units: {totalUnits} · Weight: {totalWeight || '—'} kg
        </div>
      </div>

      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600">{summaryTitle}</div>
        <div className="flex gap-3 justify-end">
          <button onClick={onBack} className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md">
            Back
          </button>
          <button
            onClick={onNext}
            disabled={!canContinue || confirming}
            className={`px-4 py-2 rounded-md font-semibold shadow-sm ${canContinue && !confirming ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
          >
            {confirming ? 'Confirming…' : 'Accept charges and confirm shipping'}
          </button>
        </div>
      </div>
    </div>
  );
}
