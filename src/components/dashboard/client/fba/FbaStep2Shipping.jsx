import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { useDashboardTranslation } from '@/translations';

export default function FbaStep2Shipping({
  // Default the whole shipment object so we don't crash if the caller hasn't loaded data yet.
  shipment = {},
  shippingOptions = [],
  shippingSummary = null,
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
  const { t } = useDashboardTranslation();
  const tt = (key, fallback) => {
    const path = `Fba.step2.${key}`;
    const value = t(path);
    return value === path ? fallback : value;
  };
  const {
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
  const optionsList = useMemo(
    () => (Array.isArray(shippingOptions) ? shippingOptions : []),
    [shippingOptions]
  );
  const selectedOption =
    optionsList.find((opt) => opt?.id === selectedTransportationOptionId) || null;
  const partneredAvailableForAll = shippingSummary?.partneredAvailableForAll ?? null;
  const partneredAvailableForAny = shippingSummary?.partneredAvailableForAny ?? null;
  const partneredMissingShipments = Array.isArray(shippingSummary?.partneredMissingShipments)
    ? shippingSummary.partneredMissingShipments.map((s) => String(s))
    : [];
  const shipmentIds = useMemo(
    () =>
      (Array.isArray(shipments) ? shipments : [])
        .map((s) => String(s?.id || s?.shipmentId || '').trim())
        .filter(Boolean),
    [shipments]
  );

  // Ready window (global pentru single shipment); Ship date nu mai este cerut în UI.
  const formatLocalDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  useEffect(() => {
    if (!shipmentIds.length) return;
    const missing = shipmentIds.filter((id) => !readyWindowByShipment?.[id]?.start);
    if (!missing.length) return;
    const startDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const start = formatLocalDateInput(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const end = formatLocalDateInput(endDate);
    missing.forEach((id) => onReadyWindowChange?.(id, { start, end }));
  }, [shipmentIds, readyWindowByShipment, onReadyWindowChange]);

  // Dacă avem start setat și nu avem încă opțiuni, lansează automat fetch-ul.
  useEffect(() => {
    if (!shipmentIds.length) return;
    const allHaveStart = shipmentIds.every((id) => Boolean(readyWindowByShipment?.[id]?.start));
    if (!allHaveStart) return;
    if (shippingLoading) return;
    if (optionsList.length > 0) return;
    onGenerateOptions?.();
  }, [shipmentIds, readyWindowByShipment, shippingLoading, optionsList, onGenerateOptions]);
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
  const globalReadyStart = shipmentIds.length ? readyWindowByShipment?.[shipmentIds[0]]?.start || '' : '';
  const globalReadyEnd = shipmentIds.length ? readyWindowByShipment?.[shipmentIds[0]]?.end || '' : '';
  const normalizeOptionMode = (mode) => {
    const up = String(mode || '').toUpperCase();
    if (!up) return '';
    if (up === 'GROUND_SMALL_PARCEL') return 'SPD';
    if (up === 'FREIGHT_LTL') return 'LTL';
    if (up === 'FREIGHT_FTL') return 'FTL';
    return up;
  };
  const isLtlFtl = (mode) => ['LTL', 'FTL', 'FREIGHT_LTL', 'FREIGHT_FTL'].includes(String(mode || '').toUpperCase());
  const groupedOptions = useMemo(() => {
    const groups = { SPD: [], LTL: [], FTL: [], OTHER: [] };
    optionsList.forEach((opt) => {
      const mode = normalizeOptionMode(opt?.mode || opt?.shippingMode || opt?.raw?.shippingMode);
      if (mode === 'SPD') groups.SPD.push(opt);
      else if (mode === 'LTL') groups.LTL.push(opt);
      else if (mode === 'FTL') groups.FTL.push(opt);
      else groups.OTHER.push(opt);
    });
    return groups;
  }, [optionsList]);
  const getOptionId = (opt) =>
    opt?.id ||
    opt?.transportationOptionId ||
    opt?.optionId ||
    opt?.raw?.transportationOptionId ||
    opt?.raw?.id ||
    opt?.raw?.optionId ||
    null;
  const getCarrierLabel = (opt) => String(opt?.carrierName || opt?.raw?.carrier?.name || opt?.raw?.carrier?.alphaCode || 'Carrier');
  const dedupeByCarrier = (list = []) => {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((opt) => {
      const id = getOptionId(opt);
      if (!id) return;
      const key = getCarrierLabel(opt).trim().toUpperCase();
      const prev = map.get(key);
      const prevCharge = Number.isFinite(prev?.charge) ? Number(prev.charge) : Number.MAX_SAFE_INTEGER;
      const nextCharge = Number.isFinite(opt?.charge) ? Number(opt.charge) : Number.MAX_SAFE_INTEGER;
      if (!prev || nextCharge < prevCharge) map.set(key, { ...opt, id });
    });
    return Array.from(map.values());
  };
  const spdOptions = groupedOptions.SPD || [];
  const spdPartneredOptions = useMemo(() => dedupeByCarrier(spdOptions.filter((o) => Boolean(o?.partnered))), [spdOptions]);
  const spdNonPartneredOptions = useMemo(() => dedupeByCarrier(spdOptions.filter((o) => !o?.partnered)), [spdOptions]);
  const hasSpdOptions = spdOptions.length > 0;
  const modeKeys = useMemo(
    () => ['SPD', 'LTL', 'FTL', 'OTHER'].filter((k) => (groupedOptions[k] || []).length > 0),
    [groupedOptions]
  );
  const [selectedModeKey, setSelectedModeKey] = useState('SPD');
  useEffect(() => {
    const normalized = normalizeOptionMode(selectedOption?.mode || method);
    if (normalized && modeKeys.includes(normalized)) {
      setSelectedModeKey(normalized);
      return;
    }
    if (!selectedModeKey || !modeKeys.includes(selectedModeKey)) {
      setSelectedModeKey(modeKeys.includes('SPD') ? 'SPD' : modeKeys[0] || '');
    }
  }, [modeKeys, method, selectedModeKey, selectedOption?.mode]);
  const activeModeKey = useMemo(() => {
    if (selectedModeKey && modeKeys.includes(selectedModeKey)) return selectedModeKey;
    if (modeKeys.includes('SPD')) return 'SPD';
    return modeKeys[0] || '';
  }, [modeKeys, selectedModeKey]);
  const selectedMode = normalizeOptionMode(selectedOption?.mode || method);
  const requireEnd = ['LTL', 'FTL', 'FREIGHT_LTL', 'FREIGHT_FTL'].includes(String(selectedMode || '').toUpperCase());
  const needsDeliveryWindow = Array.isArray(selectedOption?.raw?.preconditions)
    ? selectedOption.raw.preconditions.map((p) => String(p).toUpperCase()).includes('CONFIRMED_DELIVERY_WINDOW')
    : false;

  // Nu auto-completăm end; îl lăsăm manual la LTL/FTL. Pentru SPD nu cerem end.

  const shipmentCount = shipmentList.length;
  const totalBoxes = shipmentList.reduce((s, sh) => s + (Number(sh.boxes) || 0), 0);
  const totalUnits = shipmentList.reduce((s, sh) => s + (Number(sh.units) || 0), 0);
  const totalSkus = shipmentList.reduce((s, sh) => s + (Number(sh.skuCount) || 0), 0);
  const lbToKg = (lb) => Number(lb || 0) * 0.45359237;
  const toKg = (weight, unit) => (String(unit || 'KG').toUpperCase() === 'LB' ? lbToKg(weight) : Number(weight || 0));
  const totalWeight = shipmentList.reduce((s, sh) => s + toKg(sh.weight, sh.weight_unit), 0);
  const carrierName = selectedOption?.carrierName || carrier?.name || 'Carrier';
  const summaryTitle = useMemo(() => {
    if (!selectedOption) return tt('selectCarrier', 'Select a carrier');
    const modeLabel =
      selectedMode === 'LTL'
        ? 'Less-than-truckload (LTL)'
        : selectedMode === 'FTL'
          ? 'Full truckload (FTL)'
          : 'Small parcel delivery (SPD)';
    return `${carrierName} · ${modeLabel}`;
  }, [carrierName, selectedMode, selectedOption, tt]);

  const renderShipmentCard = (s) => {
    const shKey = String(s.id || s.shipmentId || '').trim();
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
      </div>
    </div>
  );};

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const needsTerms = Boolean(selectedOption?.partnered);
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
    (!needsDeliveryWindow || Boolean(deliveryWindowStart)) &&
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
        <div className="font-semibold text-slate-900">{tt('title', 'Step 2 - Confirm shipping')}</div>
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
                  value={globalReadyStart}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    shipmentIds.forEach((id) => {
                      onReadyWindowChange?.(id, {
                        start: nextStart,
                        end: readyWindowByShipment?.[id]?.end || ''
                      });
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
                      value={globalReadyEnd}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        shipmentIds.forEach((id) => {
                          onReadyWindowChange?.(id, {
                            start: readyWindowByShipment?.[id]?.start || '',
                            end: nextEnd
                          });
                        });
                      }}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={onGenerateOptions}
                      disabled={!shipmentIds.length || !globalReadyStart || shippingLoading}
                      className={`px-3 py-2 rounded-md text-xs font-semibold shadow-sm whitespace-nowrap ${
                        shipmentIds.length && globalReadyStart && !shippingLoading
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {shippingLoading ? tt('loading', 'Loading…') : tt('confirmReadyDate', 'Confirm ready date')}
                    </button>
                  </div>
                  <div className="text-[11px] text-amber-700">
                    {tt('readyWindowHint', 'Start is required; end becomes required if you choose LTL/FTL.')}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-[11px] text-slate-500" />
              )}
            </div>
            {shipmentIds.length > 1 && (
              <div className="text-[11px] text-slate-500 mt-2">
                {tt('readyWindowAllShipments', 'The selected date applies to all shipments.')}
              </div>
            )}
          </div>
        </div>

        <div
          className="border border-slate-200 rounded-lg p-4 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="font-semibold text-slate-900">Available shipping options</div>
          </div>
          {needsDeliveryWindow && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-600 mb-1">Delivery window — start *</div>
                <input
                  type="datetime-local"
                  value={deliveryWindowStart || ''}
                  onChange={(e) => onDeliveryWindowChange?.({ start: e.target.value, end: deliveryWindowEnd || '' })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Delivery window — end (opțional)</div>
                <input
                  type="datetime-local"
                  value={deliveryWindowEnd || ''}
                  onChange={(e) => onDeliveryWindowChange?.({ start: deliveryWindowStart || '', end: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="text-[11px] text-amber-700 col-span-1 md:col-span-2">
                Opțiunea de curier cere delivery window confirmată (CONFIRMED_DELIVERY_WINDOW). Dacă nu alegi o fereastră, Amazon poate returna eroare la confirmare.
              </div>
            </div>
          )}
          {!optionsList.length && shippingConfirmed && (
            <div className="text-sm text-slate-700">
              Shipping already confirmed. {selectedTransportationOptionId ? `Option: ${selectedTransportationOptionId}` : ''}
            </div>
          )}
          {!optionsList.length && !shippingConfirmed && (
            <div className="text-sm text-slate-600">
              No shipping options available yet. Complete “Ready to ship”.
            </div>
          )}
          {partneredAvailableForAny && partneredAvailableForAll === false && (
            <div className="text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded-md px-3 py-2">
              Amazon partnered este disponibil doar pentru unele shipment-uri.
              {partneredMissingShipments.length
                ? ` Lipsă pentru: ${partneredMissingShipments.join(', ')}.`
                : ''}
            </div>
          )}
          {!hasSpdOptions && modeKeys.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {modeKeys.map((modeKey) => {
                const label =
                  modeKey === 'SPD'
                    ? 'Small parcel delivery (SPD)'
                    : modeKey === 'LTL'
                      ? 'Less-than-truckload (LTL)'
                      : modeKey === 'FTL'
                        ? 'Full truckload (FTL)'
                        : 'Other';
                const active = selectedModeKey === modeKey;
                return (
                  <button
                    key={`mode-tab-${modeKey}`}
                    type="button"
                    onClick={() => setSelectedModeKey(modeKey)}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {hasSpdOptions ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600">Small parcel delivery (SPD)</div>
              <div className="flex flex-wrap gap-3">
                {spdPartneredOptions.map((opt) => {
                  const carrierLabel = getCarrierLabel(opt);
                  const optionId = getOptionId(opt);
                  const chargeText = Number.isFinite(opt?.charge) ? `€${opt.charge.toFixed(2)}` : '—';
                  const checked = Boolean(optionId) && optionId === selectedTransportationOptionId;
                  const partneredDisabled =
                    Boolean(opt?.partnered) &&
                    partneredAvailableForAll === false &&
                    shipmentIds.length > 1;
                  const canSelect = Boolean(optionId) && !partneredDisabled;
                  return (
                    <label
                      key={optionId || carrierLabel}
                      className={`w-full sm:w-[220px] md:w-[240px] border rounded-md p-3 flex flex-col gap-1 ${
                        checked ? 'border-blue-600 bg-blue-50' : 'border-slate-300'
                      } ${canSelect ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canSelect) return;
                        onOptionSelect?.({ ...opt, id: optionId });
                      }}
                    >
                      <div className="font-semibold text-sm">{carrierLabel}</div>
                      <div className="text-xs text-slate-500">Amazon partnered carrier</div>
                      <div className="text-[11px] text-slate-400">AMAZON_PARTNERED_CARRIER</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-800">{chargeText}</div>
                    </label>
                  );
                })}
                {spdNonPartneredOptions.length > 0 && (
                  <div className="w-full sm:w-[220px] md:w-[260px] border border-slate-300 rounded-md p-3 flex flex-col gap-2">
                    <div className="font-semibold text-sm">Non Amazon partnered carrier</div>
                    <select
                      value={selectedOption?.partnered ? '' : (selectedTransportationOptionId || '')}
                      onChange={(e) => {
                        const id = e.target.value || '';
                        if (!id) return;
                        const chosen = spdNonPartneredOptions.find((o) => getOptionId(o) === id);
                        if (chosen) onOptionSelect?.({ ...chosen, id });
                      }}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select carrier</option>
                      {spdNonPartneredOptions.map((opt) => {
                        const id = getOptionId(opt);
                        if (!id) return null;
                        const carrierLabel = getCarrierLabel(opt);
                        const price = Number.isFinite(opt?.charge) ? ` (€${opt.charge.toFixed(2)})` : '';
                        return (
                          <option key={`non-pcp-${id}`} value={id}>
                            {carrierLabel}{price}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ) : (
            modeKeys.map((modeKey) => {
              if (!activeModeKey || modeKey !== activeModeKey) return null;
              const list = groupedOptions[modeKey] || [];
              if (!list.length) return null;
              const title =
                modeKey === 'LTL'
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
                      const optionId = getOptionId(opt);
                      const solution = String(opt?.shippingSolution || opt?.raw?.shippingSolution || '').toUpperCase();
                      const chargeText = Number.isFinite(opt?.charge) ? `€${opt.charge.toFixed(2)}` : '—';
                      const partneredLabel = opt?.partnered ? 'Amazon partnered' : 'Non Amazon partnered carrier';
                      const checked = Boolean(optionId) && optionId === selectedTransportationOptionId;
                      const partneredDisabled =
                        Boolean(opt?.partnered) &&
                        partneredAvailableForAll === false &&
                        shipmentIds.length > 1;
                      const canSelect = Boolean(optionId) && !partneredDisabled;
                      return (
                        <label
                          key={optionId || carrierLabel}
                          className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-md ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200'} ${canSelect ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canSelect) return;
                            onOptionSelect?.({ ...opt, id: optionId });
                          }}
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
                              disabled={!canSelect}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (!canSelect) return;
                                onOptionSelect?.({ ...opt, id: optionId });
                              }}
                            />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-xs text-slate-500">
                    {tt('ltlFtlRequirements', 'Palletization and freight information are required for LTL/FTL.')}
                  </div>
                </div>
              );
            })
          )}
          {optionsList.length > 0 && !selectedOption && (
            <div className="text-xs text-red-600">
              {tt('selectTransportBeforeConfirm', 'Select a transport option before confirmation.')}
            </div>
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
              {tt('palletFreightHint', 'Amazon uses these details for LTL/FTL options and PCP rates.')}
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
        <div className="flex flex-col items-end gap-3">
          {needsTerms && (
            <label className="flex items-start gap-2 text-xs text-slate-600">
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
    </div>
  );
}
