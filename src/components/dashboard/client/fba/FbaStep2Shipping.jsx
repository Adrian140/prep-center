import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export default function FbaStep2Shipping({
  // Default the whole shipment object so we don't crash if the caller hasn't loaded data yet.
  shipment = {},
  shippingOptions = [],
  selectedTransportationOptionId = null,
  shippingConfirmed = false,
  onOptionSelect,
  onPalletDetailsChange,
  onShipDateChange,
  onDeliveryWindowChange,
  onReadyWindowChange,
  onGenerateOptions,
  onNext,
  onBack,
  confirming = false,
  shippingLoading = false,
  error = '',
  readyWindowByShipment = {}
}) {
  const {
    deliveryDate = '',
    deliveryWindowStart = '',
    deliveryWindowEnd = '',
    method = '',
    carrier = null,
    shipments = [],
    warning = '',
    palletDetails = null,
    from = null,
    to = null
  } = shipment || {};
  const options = Array.isArray(shippingOptions) ? shippingOptions : [];
  const selectedOption =
    options.find((opt) => opt?.id === selectedTransportationOptionId) || null;
  const isSingleShipment = Array.isArray(shipments) && shipments.length === 1;
  const singleShipmentId = isSingleShipment
    ? String(shipments[0]?.id || shipments[0]?.shipmentId || '').trim()
    : null;

  // Ready window (global pentru single shipment); Ship date nu mai este cerut în UI.
  const [shipDate, setShipDate] = useState(deliveryDate || '');
  const [etaStart, setEtaStart] = useState(deliveryWindowStart || '');
  const [etaEnd, setEtaEnd] = useState(deliveryWindowEnd || '');
  useEffect(() => {
    setEtaStart(deliveryWindowStart || '');
    setEtaEnd(deliveryWindowEnd || '');
  }, [deliveryWindowStart, deliveryWindowEnd]);
  useEffect(() => {
    if (isSingleShipment && singleShipmentId && !readyWindowByShipment?.[singleShipmentId]?.start) {
      const today = new Date();
      const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), today.getUTCHours() + 6));
      const start = startDate.toISOString().slice(0, 10);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const end = endDate.toISOString().slice(0, 10);
      onReadyWindowChange?.(singleShipmentId, { start, end });
    }
  }, [isSingleShipment, singleShipmentId, readyWindowByShipment, onReadyWindowChange]);

  // Dacă avem start setat și nu avem încă opțiuni, lansează automat fetch-ul.
  useEffect(() => {
    if (!isSingleShipment || !singleShipmentId) return;
    const rw = readyWindowByShipment?.[singleShipmentId] || {};
    if (!rw.start) return;
    if (shippingLoading) return;
    if (options.length > 0) return;
    onGenerateOptions?.();
  }, [isSingleShipment, singleShipmentId, readyWindowByShipment, shippingLoading, options, onGenerateOptions]);
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
  const selectedMode = normalizeOptionMode(selectedOption?.mode || method);
  useEffect(() => {
    if (selectedOption?.partnered === false && shipDate) {
      // dacă deja avem fereastra setată din parent, nu recalculăm iar (previne loop)
      if (!deliveryWindowEnd) autoSetEtaEnd(shipDate);
    }
  }, [selectedOption?.partnered, shipDate, deliveryWindowEnd]);

  const shipmentCount = shipmentList.length;
  const totalBoxes = shipmentList.reduce((s, sh) => s + (Number(sh.boxes) || 0), 0);
  const totalUnits = shipmentList.reduce((s, sh) => s + (Number(sh.units) || 0), 0);
  const totalSkus = shipmentList.reduce((s, sh) => s + (Number(sh.skuCount) || 0), 0);
  const lbToKg = (lb) => Number(lb || 0) * 0.45359237;
  const toKg = (weight, unit) => (String(unit || 'KG').toUpperCase() === 'LB' ? lbToKg(weight) : Number(weight || 0));
  const totalWeight = shipmentList.reduce((s, sh) => s + toKg(sh.weight, sh.weight_unit), 0);
  const carrierName = selectedOption?.carrierName || carrier?.name || 'Carrier';
  const summaryTitle = useMemo(() => {
    if (!selectedOption) return 'Selectează un curier';
    const modeLabel =
      selectedMode === 'LTL'
        ? 'Less-than-truckload (LTL)'
        : selectedMode === 'FTL'
          ? 'Full truckload (FTL)'
          : 'Small parcel delivery (SPD)';
    return `${carrierName} · ${modeLabel}`;
  }, [carrierName, selectedMode, selectedOption]);

  const renderShipmentCard = (s) => {
    const shKey = String(s.id || s.shipmentId || '').trim();
    const showReadyInputs = !isSingleShipment; // pentru single shipment folosim câmpul global
    return (
    <div key={shKey || s.id} className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <div className="font-semibold text-slate-900">Shipment #{shKey || s.id}</div>
        <div className="text-sm text-slate-600">
          Boxes: {s.boxes} · SKUs: {s.skuCount} · Units: {s.units} · Weight:{' '}
          {Number.isFinite(toKg(s.weight, s.weight_unit)) && toKg(s.weight, s.weight_unit) > 0
            ? `${toKg(s.weight, s.weight_unit).toFixed(2)} kg`
            : '—'}
        </div>
      </div>
      <div className="px-4 py-3 text-sm text-slate-700 space-y-1">
        <div>Ship from: {s.from}</div>
        <div>
          Ship to:{' '}
          {/^A[A-Z0-9]{9,}$/i.test(String(s.to || '').trim())
            ? '—'
            : s.to || '—'}
        </div>
        <div>Fulfilment capability: {s.capability || 'Standard'}</div>
        {Array.isArray(s.boxesDetail) && s.boxesDetail.length > 0 && (
          <div className="text-xs text-slate-500">
            {s.boxesDetail.length} boxes with dimensions/weight captured from packing.
          </div>
        )}
        {showReadyInputs && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div>
              <div className="text-xs text-slate-600 mb-1">Ready to ship — start *</div>
              <input
                type="date"
                value={readyWindowByShipment?.[shKey]?.start || ''}
                onChange={(e) =>
                  onReadyWindowChange?.(shKey, { start: e.target.value, end: readyWindowByShipment?.[shKey]?.end || '' })
                }
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            {requireEnd && (
              <div>
                <div className="text-xs text-slate-600 mb-1">
                  Ready to ship — end {requireEnd ? '*' : '(opțional)'}
                </div>
                <input
                  type="date"
                  value={readyWindowByShipment?.[shKey]?.end || ''}
                  onChange={(e) =>
                    onReadyWindowChange?.(shKey, {
                      start: readyWindowByShipment?.[shKey]?.start || '',
                      end: e.target.value
                    })
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        )}
        {!isSingleShipment && (
          <div className="text-xs text-amber-700">
            Setează intervalul în care expediția este gata de predat curierului (start obligatoriu; end obligatoriu pentru LTL/FTL).
          </div>
        )}
      </div>
    </div>
  );};

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const needsTerms = Boolean(selectedOption?.partnered);
  const isLtlFtl = (mode) => ['LTL', 'FTL', 'FREIGHT_LTL', 'FREIGHT_FTL'].includes(String(mode || '').toUpperCase());
  const requireEnd = isLtlFtl(selectedOption?.mode || selectedMode);
  const missingReady = shipmentList.some((sh) => {
    const shKey = String(sh.id || sh.shipmentId || '').trim();
    const rw = readyWindowByShipment?.[shKey] || {};
    if (!shKey || !rw.start) return true;
    if (requireEnd && !rw.end) return true;
    return false;
  });
  const canContinue =
    Boolean(selectedOption) &&
    (!needsTerms || acceptedTerms) &&
    (selectedOption?.partnered === false ? Boolean(etaEnd) : true) &&
    !missingReady;
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
  const sourceCountry = extractCountryFromString(from);
  const destCountry = extractCountryFromString(to);
  const isInternational = sourceCountry && destCountry && sourceCountry !== destCountry;

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
            <div className="font-semibold text-slate-800 mb-2">Ready to ship</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:items-end">
              <div>
                <div className="text-xs text-slate-600 mb-1">Ready to ship — start *</div>
                <input
                  type="date"
                  value={singleShipmentId ? readyWindowByShipment?.[singleShipmentId]?.start || '' : ''}
                  onChange={(e) => {
                    if (!singleShipmentId) return;
                    onReadyWindowChange?.(singleShipmentId, {
                      start: e.target.value,
                      end: readyWindowByShipment?.[singleShipmentId]?.end || ''
                    });
                  }}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              {requireEnd ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-slate-600">
                    Ready to ship — end {requireEnd ? '*' : '(opțional)'}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={singleShipmentId ? readyWindowByShipment?.[singleShipmentId]?.end || '' : ''}
                      onChange={(e) => {
                        if (!singleShipmentId) return;
                        onReadyWindowChange?.(singleShipmentId, {
                          start: readyWindowByShipment?.[singleShipmentId]?.start || '',
                          end: e.target.value
                        });
                      }}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={onGenerateOptions}
                      disabled={!singleShipmentId || !readyWindowByShipment?.[singleShipmentId]?.start || shippingLoading}
                      className={`px-3 py-2 rounded-md text-xs font-semibold shadow-sm whitespace-nowrap ${
                        singleShipmentId && readyWindowByShipment?.[singleShipmentId]?.start && !shippingLoading
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {shippingLoading ? 'Se încarcă…' : 'Confirm ready date'}
                    </button>
                  </div>
                  <div className="text-[11px] text-amber-700">
                    Start obligatoriu; end devine obligatoriu dacă alegi LTL/FTL.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-[11px] text-slate-500" />
              )}
            </div>
          </div>
        </div>

        <div
          className="border border-slate-200 rounded-lg p-4 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="font-semibold text-slate-900">Available shipping options</div>
          </div>
          {!options.length && shippingConfirmed && (
            <div className="text-sm text-slate-700">
              Shipping already confirmed. {selectedTransportationOptionId ? `Option: ${selectedTransportationOptionId}` : ''}
            </div>
          )}
          {!options.length && !shippingConfirmed && (
            <div className="text-sm text-slate-600">
              No shipping options available yet. Complete “Ready to ship”.
            </div>
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
                    const partneredLabel = opt?.partnered ? 'Amazon partnered' : 'Non Amazon partnered carrier';
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
