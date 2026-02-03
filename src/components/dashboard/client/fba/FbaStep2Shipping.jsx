import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export default function FbaStep2Shipping({
  shipment,
  shippingOptions = [],
  selectedTransportationOptionId = null,
  shippingConfirmed = false,
  onOptionSelect,
  onPalletDetailsChange,
  onShipDateChange,
  onDeliveryWindowChange,
  onNext,
  onBack,
  confirming = false,
  error = ''
}) {
  const {
    deliveryDate,
    deliveryWindowStart,
    deliveryWindowEnd,
    method,
    carrier,
    shipments,
    warning,
    palletDetails
  } = shipment;
  // Ship date pornește gol; utilizatorul îl setează manual
  const [shipDate, setShipDate] = useState('');
  const [etaEnd, setEtaEnd] = useState(deliveryWindowEnd || '');
  useEffect(() => {
    setEtaEnd(deliveryWindowEnd || '');
  }, [deliveryWindowEnd]);
  useEffect(() => {
    if (selectedOption?.partnered === false && shipDate) {
      autoSetEtaEnd(shipDate);
    }
  }, [selectedOption?.partnered, shipDate]);
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

  const options = Array.isArray(shippingOptions) ? shippingOptions : [];
  const shipmentList = useMemo(() => (Array.isArray(shipments) ? shipments : []), [shipments]);
  const normalizeOptionMode = (mode) => {
    const up = String(mode || '').toUpperCase();
    if (!up) return '';
    if (up === 'GROUND_SMALL_PARCEL') return 'SPD';
    if (up === 'FREIGHT_LTL') return 'LTL';
    if (up === 'FREIGHT_FTL') return 'FTL';
    return up;
  };
  const groupedOptions = useMemo(() => {
    const groups = { SPD: [], LTL: [], FTL: [], OTHER: [] };
    options.forEach((opt) => {
      const mode = normalizeOptionMode(opt?.mode || opt?.shippingMode || opt?.raw?.shippingMode);
      if (mode === 'SPD') groups.SPD.push(opt);
      else if (mode === 'LTL') groups.LTL.push(opt);
      else if (mode === 'FTL') groups.FTL.push(opt);
      else groups.OTHER.push(opt);
    });
    return groups;
  }, [options]);
  const selectedOption =
    options.find((opt) => opt?.id === selectedTransportationOptionId) || null;
  const selectedMode = normalizeOptionMode(selectedOption?.mode || method);

  const shipmentCount = shipmentList.length;
  const totalBoxes = shipmentList.reduce((s, sh) => s + (Number(sh.boxes) || 0), 0);
  const totalUnits = shipmentList.reduce((s, sh) => s + (Number(sh.units) || 0), 0);
  const totalSkus = shipmentList.reduce((s, sh) => s + (Number(sh.skuCount) || 0), 0);
  const lbToKg = (lb) => Number(lb || 0) * 0.45359237;
  const toKg = (weight, unit) => (String(unit || 'KG').toUpperCase() === 'LB' ? lbToKg(weight) : Number(weight || 0));
  const totalWeight = shipmentList.reduce((s, sh) => s + toKg(sh.weight, sh.weight_unit), 0);
  const carrierName = selectedOption?.carrierName || carrier?.name || 'Carrier';
  const summaryTitle = useMemo(() => {
    const modeLabel =
      selectedMode === 'LTL'
        ? 'Less-than-truckload (LTL)'
        : selectedMode === 'FTL'
          ? 'Full truckload (FTL)'
          : 'Small parcel delivery (SPD)';
    return `${carrierName} · ${modeLabel}`;
  }, [carrierName, selectedMode]);

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

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const needsTerms = Boolean(selectedOption?.partnered);
  const canContinue =
    Boolean(selectedOption) &&
    Boolean(shipDate) &&
    (!needsTerms || acceptedTerms) &&
    (selectedOption?.partnered === false ? Boolean(etaEnd) : true);
  useEffect(() => {
    setAcceptedTerms(false);
  }, [selectedOption?.id]);

  const extractCountryFromString = (val) => {
    if (!val || typeof val !== 'string') return null;
    const parts = val.split(',').map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1] || '';
    const maybeCode = last.toUpperCase();
    if (maybeCode.length === 2) return maybeCode;
    return null;
  };
  const sourceCountry = extractCountryFromString(shipment?.from);
  const destCountry = extractCountryFromString(shipment?.to);
  const isInternational = sourceCountry && destCountry && sourceCountry !== destCountry;

  const autoSetEtaEnd = (startDate) => {
    if (!startDate) return;
    const d = new Date(startDate);
    d.setDate(d.getDate() + (isInternational ? 13 : 6)); // 7 zile interne / 14 zile internaționale
    const autoEnd = d.toISOString().slice(0, 10);
    setEtaEnd(autoEnd);
    onDeliveryWindowChange?.({ start: startDate, end: autoEnd });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 2 - Confirm shipping</div>
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

        <div className="grid grid-cols-1 gap-3 text-sm">
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="font-semibold text-slate-800 mb-2">Shipping dates</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 mb-1">Ship date</div>
                <input
                  type="date"
                  id="ship-date"
                  name="ship-date"
                  value={shipDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setShipDate(next);
                    onShipDateChange?.(next);
                    if (selectedOption?.partnered === false) {
                      autoSetEtaEnd(next);
                    }
                  }}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              {selectedOption?.partnered === false && (
                <div>
                  <div className="text-xs text-slate-600 mb-1">
                    Estimated arrival (non-partnered)
                  </div>
                  <div className="text-[11px] text-slate-500 mb-1">
                    End (optional, default +7 zile interne / +14 zile internaționale)
                  </div>
                  <input
                    type="date"
                    id="eta-end"
                    name="eta-end"
                    value={etaEnd}
                    onChange={(e) => {
                      setEtaEnd(e.target.value);
                      onDeliveryWindowChange?.({ start: shipDate || '', end: e.target.value });
                    }}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-3">
            <div className="font-semibold text-slate-800 mb-1">Merge workflow</div>
            <div className="text-xs text-slate-500">Merge workflows is not available for small parcel shipments.</div>
          </div>
        </div>

        <div
          className="border border-slate-200 rounded-lg p-4 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold text-slate-900">Available shipping options</div>
          {!options.length && shippingConfirmed && (
            <div className="text-sm text-slate-700">
              Shipping already confirmed. {selectedTransportationOptionId ? `Option: ${selectedTransportationOptionId}` : ''}
            </div>
          )}
          {!options.length && !shippingConfirmed && (
            <div className="text-sm text-slate-600">No shipping options available yet.</div>
          )}
          {['SPD', 'LTL', 'FTL', 'OTHER'].map((modeKey) => {
            const list = groupedOptions[modeKey] || [];
            if (!list.length) return null;
            const title =
              modeKey === 'SPD'
                ? 'Small parcel delivery (SPD)'
                : modeKey === 'LTL'
                  ? 'Less-than-truckload (LTL)'
                  : modeKey === 'FTL'
                    ? 'Full truckload (FTL)'
                    : 'Other';
            return (
              <div key={modeKey} className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">{title}</div>
                <div className="space-y-2">
                  {list.map((opt) => {
                    const carrierLabel = opt?.carrierName || 'Carrier';
                    const optionId =
                      opt?.id ||
                      opt?.transportationOptionId ||
                      opt?.optionId ||
                      opt?.raw?.transportationOptionId ||
                      opt?.raw?.id ||
                      opt?.raw?.optionId ||
                      null;
                    const solution = String(opt?.shippingSolution || opt?.raw?.shippingSolution || '').toUpperCase();
                    const chargeText = Number.isFinite(opt?.charge) ? `€${opt.charge.toFixed(2)}` : '—';
                    const checked = Boolean(optionId) && optionId === selectedTransportationOptionId;
                    return (
                      <label
                        key={optionId || carrierLabel}
                        className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-md ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{carrierLabel}</span>
                          <span className="text-xs text-slate-500">{partneredLabel}</span>
                          {solution && <span className="text-xs text-slate-400">{solution}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{chargeText}</span>
                          <input
                            type="radio"
                            id={`shipping-option-${optionId || carrierLabel}`}
                            name="shipping-option"
                            checked={checked}
                            disabled={!optionId}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (!optionId) return;
                              onOptionSelect?.({ ...opt, id: optionId });
                            }}
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
                {modeKey !== 'SPD' && (
                  <div className="text-xs text-slate-500">
                    Pentru LTL/FTL sunt necesare paletizare și freight information.
                  </div>
                )}
              </div>
            );
          })}
          {options.length > 0 && !selectedOption && (
            <div className="text-xs text-red-600">
              Selectează o opțiune de transport înainte de confirmare.
            </div>
          )}
          {needsTerms && (
            <label className="flex items-start gap-2 text-xs text-slate-600 pt-2">
              <input
                type="checkbox"
                id="partner-terms"
                name="partner-terms"
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

        {selectedMode && selectedMode !== 'SPD' && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="font-semibold text-slate-900">Pallet and freight information</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">Pallet quantity</div>
                <input
                  type="number"
                  min="1"
                  id="pallet-quantity"
                  name="pallet-quantity"
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
                  id="pallet-weight"
                  name="pallet-weight"
                  value={safePalletDetails.weight ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, weight: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Stackability</div>
                <select
                  id="pallet-stackability"
                  name="pallet-stackability"
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
                  id="pallet-length"
                  name="pallet-length"
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
                  id="pallet-width"
                  name="pallet-width"
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
                  id="pallet-height"
                  name="pallet-height"
                  value={safePalletDetails.height ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, height: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Freight class</div>
                <input
                  type="text"
                  id="freight-class"
                  name="freight-class"
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
                  id="declared-value"
                  name="declared-value"
                  value={safePalletDetails.declaredValue ?? ''}
                  onChange={(e) => onPalletDetailsChange?.({ ...safePalletDetails, declaredValue: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Currency</div>
                <input
                  type="text"
                  id="declared-currency"
                  name="declared-currency"
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
          {shipmentList.map(renderShipmentCard)}
        </div>
        <div className="text-sm text-slate-700">
            Boxes: {totalBoxes} · SKUs: {totalSkus} · Units: {totalUnits} · Weight: {totalWeight || '—'} kg
        </div>
      </div>

      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600">{summaryTitle}</div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onBack}
            className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md"
          >
            Back
          </button>
          <button
            type="button"
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
