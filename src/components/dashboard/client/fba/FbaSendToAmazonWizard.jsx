import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../config/supabase';
import { CheckCircle2, Circle, Eye } from 'lucide-react';
import FbaStep1Inventory from './FbaStep1Inventory';
import FbaStep1bPacking from './FbaStep1bPacking';
import FbaStep2Shipping from './FbaStep2Shipping';
import FbaStep3Labels from './FbaStep3Labels';
import FbaStep4Tracking from './FbaStep4Tracking';
import { useMarket } from '@/contexts/MarketContext';
import { useDashboardTranslation } from '@/translations';

const getSafeNumber = (val) => {
  if (val === null || val === undefined) return null;
  const num = Number(String(val).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
};

const getPositiveNumber = (val) => {
  const num = getSafeNumber(val);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const getFiniteNumber = (val) => {
  const num = getSafeNumber(val);
  return Number.isFinite(num) ? num : null;
};

const sumUnitsFromItems = (items) => {
  if (!Array.isArray(items)) return null;
  let sum = 0;
  let hasUnits = false;
  items.forEach((it) => {
    const qty = getFiniteNumber(it?.quantity ?? it?.qty ?? it?.units ?? it?.unitCount ?? it?.count);
    if (Number.isFinite(qty)) {
      sum += qty;
      hasUnits = true;
    }
  });
  return hasUnits ? sum : null;
};

const resolveShipmentUnits = (shipment, fallback, index, fallbackList) => {
  const candidates = [
    shipment?.units,
    shipment?.unitCount,
    shipment?.unitsCount,
    shipment?.totalUnits,
    shipment?.total_units,
    shipment?.quantity,
    shipment?.qty
  ];
  for (const val of candidates) {
    const num = getFiniteNumber(val);
    if (Number.isFinite(num)) return num;
  }
  const fromItems = sumUnitsFromItems(
    shipment?.items ||
      shipment?.shipmentItems ||
      shipment?.shipment_items ||
      shipment?.skuItems ||
      shipment?.sku_items
  );
  if (Number.isFinite(fromItems)) return fromItems;
  const fallbackUnits = getFiniteNumber(
    fallback?.units ?? fallbackList?.[index]?.units
  );
  if (Number.isFinite(fallbackUnits)) return fallbackUnits;
  return 0;
};

const getSafeDims = (dims = {}) => {
  // Accept null/undefined and bail out early to avoid runtime errors in callers.
  if (!dims || typeof dims !== 'object') return null;
  const length = getPositiveNumber(dims.length);
  const width = getPositiveNumber(dims.width);
  const height = getPositiveNumber(dims.height);
  if (!length || !width || !height) return null;
  return { length, width, height };
};

const normalizeShipDate = (val) => {
  if (!val) return null;
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return str;
  const dd = String(match[1]).padStart(2, '0');
  const mm = String(match[2]).padStart(2, '0');
  const yyyy = match[3];
  return `${yyyy}-${mm}-${dd}`;
};

// Return an ISO datetime; if the selected date is today, push it +6h from now; otherwise use 12:00 UTC.
// If the date is in the past, clamp to today +6h.
const normalizeReadyStartIso = (dateStr) => {
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const targetDate = dateStr ? new Date(`${dateStr}T00:00:00Z`) : todayStart;
  const isPast = targetDate < todayStart;
  const isToday = !isPast && targetDate.getTime() === todayStart.getTime();

  if (isPast || isToday) {
    const plusSixHours = new Date(today.getTime() + 6 * 60 * 60 * 1000);
    return plusSixHours.toISOString();
  }

  const base = new Date(targetDate);
  base.setUTCHours(12, 0, 0, 0);
  return base.toISOString();
};

const getTomorrowIsoDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const detectPartneredOption = (opt = {}) => {
  const explicit =
    opt?.isPartnered ??
    opt?.is_partnered ??
    opt?.partneredCarrier ??
    opt?.partnered ??
    opt?.isAmazonPartnered ??
    opt?.amazonPartnered ??
    null;

  if (explicit === true) return true;

  const type = String(
    opt?.transportationOptionType ||
    opt?.transportation_option_type ||
    opt?.transportationOption?.transportationOptionType ||
    opt?.transportationOption?.type ||
    opt?.type ||
    ''
  ).toUpperCase();

  if (type.includes('AMAZON_PARTNERED') || type.includes('PARTNERED_CARRIER') || type === 'PARTNERED') {
    return true;
  }

  const solution = String(
    opt?.shippingSolution ||
    opt?.shippingSolutionId ||
    opt?.shipping_solution ||
    opt?.shipping_solution_id ||
    ''
  ).toUpperCase();

  if (solution.includes('AMAZON_PARTNERED') || solution.includes('PARTNERED_CARRIER')) {
    return true;
  }

  const seen = new Set();
  const stack = [opt];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;
    if (typeof cur === 'string') {
      const s = cur.toUpperCase();
      if (s.includes('AMAZON_PARTNERED') || s.includes('PARTNERED_CARRIER') || s === 'PARTNERED') return true;
      continue;
    }
    if (typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const v of Object.values(cur)) stack.push(v);
  }

  return false;
};

const normalizeTransportMode = (mode) => {
  const up = String(mode || '').toUpperCase();
  if (!up) return '';
  if (up === 'GROUND_SMALL_PARCEL' || up === 'SPD' || up === 'SMALL_PARCEL') return 'SPD';
  if (up === 'FREIGHT_LTL' || up === 'LTL') return 'LTL';
  if (up === 'FREIGHT_FTL' || up === 'FTL') return 'FTL';
  return up;
};

const aggregateTransportationOptions = (options = [], summary = null) => {
  const shipmentCount = Number(summary?.shipmentCount || summary?.shipment_count || 0) || 0;
  const partneredChargeTotal = Number.isFinite(summary?.partneredChargeTotal)
    ? summary.partneredChargeTotal
    : null;
  const nonPartneredChargeTotal = Number.isFinite(summary?.nonPartneredChargeTotal)
    ? summary.nonPartneredChargeTotal
    : null;
  const grouped = {
    SPD_PARTNERED: [],
    SPD_NON_PARTNERED: [],
    LTL_FTL: []
  };
  (Array.isArray(options) ? options : []).forEach((opt) => {
    const mode =
      normalizeTransportMode(opt?.mode || opt?.shippingMode || opt?.raw?.shippingMode || opt?.transportationOption?.shippingMode);
    if (mode === 'SPD') {
      if (detectPartneredOption(opt)) grouped.SPD_PARTNERED.push(opt);
      else grouped.SPD_NON_PARTNERED.push(opt);
      return;
    }
    if (mode === 'LTL' || mode === 'FTL') {
      grouped.LTL_FTL.push(opt);
    }
  });

  const pickRepresentative = (list) => {
    if (!list.length) return null;
    return list.find((o) => Number.isFinite(o?.charge)) || list[0];
  };
  const minCharge = (list) => {
    const charges = list.map((o) => o?.charge).filter((c) => Number.isFinite(c));
    if (!charges.length) return null;
    return Math.min(...charges);
  };

  const resolveChargeOverride = (key) => {
    if (shipmentCount <= 1) return null;
    if (key === 'SPD_PARTNERED' && Number.isFinite(partneredChargeTotal)) return partneredChargeTotal;
    if (key === 'SPD_NON_PARTNERED' && Number.isFinite(nonPartneredChargeTotal)) return nonPartneredChargeTotal;
    return null;
  };

  const buildOption = (key, list) => {
    if (!list.length) return null;
    const rep = pickRepresentative(list);
    const overrideCharge = resolveChargeOverride(key);
    const charge = Number.isFinite(overrideCharge) ? overrideCharge : minCharge(list);
    const optionId =
      rep?.transportationOptionId ||
      rep?.id ||
      rep?.optionId ||
      rep?.raw?.transportationOptionId ||
      rep?.raw?.id ||
      rep?.raw?.optionId ||
      null;
    const base = {
      ...rep,
      charge,
      id: optionId,
      isPartnered: detectPartneredOption(rep),
      chargeScope: Number.isFinite(overrideCharge) ? 'total' : 'per_shipment',
      shipmentCount: shipmentCount || null
    };
    if (key === 'SPD_PARTNERED') {
      return {
        ...base,
        mode: 'GROUND_SMALL_PARCEL',
        carrierName: rep?.carrierName || 'Amazon Partnered Carrier',
        partnered: true,
        shippingSolution: rep?.shippingSolution || rep?.raw?.shippingSolution || 'AMAZON_PARTNERED_CARRIER'
      };
    }
    if (key === 'SPD_NON_PARTNERED') {
      return {
        ...base,
        mode: 'GROUND_SMALL_PARCEL',
        carrierName: rep?.carrierName || 'Non Amazon partnered carrier',
        partnered: false,
        shippingSolution: rep?.shippingSolution || rep?.raw?.shippingSolution || 'USE_YOUR_OWN_CARRIER'
      };
    }
    return {
      ...base,
      mode: 'FREIGHT_LTL',
      carrierName: rep?.carrierName || 'LTL/FTL (non-partnered)',
      partnered: false,
      shippingSolution: rep?.shippingSolution || rep?.raw?.shippingSolution || 'USE_YOUR_OWN_CARRIER'
    };
  };

  return [
    buildOption('SPD_PARTNERED', grouped.SPD_PARTNERED),
    buildOption('SPD_NON_PARTNERED', grouped.SPD_NON_PARTNERED),
    buildOption('LTL_FTL', grouped.LTL_FTL)
  ].filter(Boolean);
};

const parseMaybeJson = (raw) => {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const extractFunctionInvokeError = async (err) => {
  const ctx = err?.context || null;
  const response = ctx?.response || null;
  let payload = null;

  if (!payload && response && typeof response === 'object') {
    if (response?.data && typeof response.data === 'object') {
      payload = response.data;
    }
    if (!payload && typeof response?.json === 'function') {
      try {
        payload = await response.clone().json();
      } catch {
        // ignore json parse failures
      }
    }
    if (!payload && typeof response?.text === 'function') {
      try {
        const txt = await response.clone().text();
        payload = parseMaybeJson(txt) || (txt ? { error: txt } : null);
      } catch {
        // ignore text parse failures
      }
    }
  }

  if (!payload && ctx?.response?.data && typeof ctx.response.data === 'object') {
    payload = ctx.response.data;
  }
  if (!payload && ctx?.data && typeof ctx.data === 'object') {
    payload = ctx.data;
  }
  if (!payload && ctx?.error && typeof ctx.error === 'object') {
    payload = ctx.error;
  }

  const status =
    (typeof response?.status === 'number' ? response.status : null) ||
    (typeof ctx?.status === 'number' ? ctx.status : null) ||
    null;

  const code =
    payload?.code ||
    payload?.errorCode ||
    payload?.error_code ||
    null;

  const message =
    payload?.error ||
    payload?.message ||
    ctx?.error?.message ||
    err?.message ||
    'Edge Function returned a non-2xx status code';

  return {
    payload,
    status,
    code: code ? String(code) : null,
    message: String(message)
  };
};

const initialData = {
  shipFrom: {
    name: 'Bucur Adrian, 5B Rue des Enclos, Gouseniere, FR',
    address: '5B Rue des Enclos, Gouseniere, Ille-et-Vilaine, 35350, FR'
  },
  marketplace: 'France',
  skus: [
    {
      id: 'sku-1',
      title: 'Pure musk',
      sku: 'QF-XJUQ-5GFB',
      asin: 'B071VC3M1J',
      storageType: 'Standard-size',
      packing: 'individual',
      units: 33,
      expiry: '2026-12-04',
      prepRequired: false,
      readyToPack: true
    }
  ]
};

const initialPackGroups = [];

const initialShipments = [
  {
    id: '1',
    name: 'Shipment #1',
    from: 'Bucur Adrian, 5B Rue des Enclos, 35350, FR',
    to: 'LIL1 - 1 Rue Amazon - 59353 - LAUWIN PLANQUE CEDEX, FR',
    boxes: 1,
    skuCount: 1,
    units: 33
  }
];

const initialTracking = [
  {
    id: 'track-1',
    box: 1,
    label: 'FBA15L586BQWU000001',
    trackingId: '1Z984RF96806365273',
    status: 'Confirming',
    weight: 20,
    dimensions: '33 x 26 x 46'
  }
];

export default function FbaSendToAmazonWizard({
  initialPlan = initialData,
  initialPacking = initialPackGroups,
  initialShipmentMode = {
    method: 'SPD',
    deliveryDate: '',
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
    carrier: null
  },
  initialShipmentList = initialShipments,
  initialTrackingList = initialTracking,
  initialTrackingIds = [],
  initialSkuStatuses = [],
  initialCompletedSteps = [],
  initialShippingOptions = [],
  initialShippingSummary = null,
  initialShippingConfirmed = false,
  initialSelectedTransportationOptionId = null,
  initialLabelFormat = 'thermal',
  initialCurrentStep = null,
  historyMode = false,
  autoLoadPlan = false,
  fetchPlan // optional async () => ({ shipFrom, marketplace, skus, packGroups, shipments, skuStatuses, warning, blocking })
}) {
  const { currentMarket } = useMarket();
  const { t } = useDashboardTranslation();
  const tt = useCallback(
    (key, fallback) => {
      const val = t(`Wizard.${key}`);
      return val === `Wizard.${key}` ? fallback ?? val : val;
    },
    [t]
  );
  const stepsOrder = ['1', '1b', '2', '3', '4'];
  const wizardCopy = useMemo(
    () => ({
      missingIds: tt('missingIdsError', 'Missing inboundPlanId or requestId; reload the plan.'),
      packingWait: tt('packingGroupsWait', 'Amazon has not returned packing groups yet. Try again in a few seconds.'),
      inboundPlanWait: tt('inboundPlanMissingError', 'Waiting for inboundPlanId from Amazon. Try again in a few seconds.'),
      previewUnavailable: tt('packingPreviewUnavailable', 'Preview unavailable right now.'),
      inboundPlanEmpty: tt('inboundPlanEmpty', 'Inbound plan is still empty. Try again in a few seconds.'),
      banner: tt(
        'inboundPlanMissingBanner',
        'Amazon has not generated inboundPlanId yet. You can retry or continue without it if your box plan is ready.'
      ),
      waitBanner: tt(
        'inboundPlanMissingWait',
        'Waiting for inboundPlanId from Amazon; you can’t continue until the plan is loaded.'
      ),
      retry: tt('retry', 'Retry'),
      continueAnyway: tt('continueAnyway', 'Continue anyway')
    }),
    [tt]
  );
  const resolveInitialStep = () => {
    if (!historyMode) return '1';
    if (initialCurrentStep && stepsOrder.includes(initialCurrentStep)) return initialCurrentStep;
    if (Array.isArray(initialCompletedSteps) && initialCompletedSteps.length) {
      const last = initialCompletedSteps[initialCompletedSteps.length - 1];
      if (stepsOrder.includes(last)) return last;
    }
    return '1';
  };
  const [currentStep, setCurrentStep] = useState(resolveInitialStep);
  const [completedSteps, setCompletedSteps] = useState(historyMode ? initialCompletedSteps : []);
  const [plan, setPlan] = useState(initialPlan);
  const [carrierTouched, setCarrierTouched] = useState(false);
  const [shippingConfirmed, setShippingConfirmed] = useState(historyMode ? Boolean(initialShippingConfirmed) : false);
  // Nu mai colapsăm grupurile Amazon; le lăsăm distincte.
  const collapsePackGroups = useCallback((groups) => {
    const list = Array.isArray(groups) ? groups : [];
    return list;
  }, []);
const allowPersistence = false; // forțează reluarea workflow-ului de la Step 1; nu restaurăm din localStorage
  const normalizePackGroups = useCallback(
    (groups = []) => {
      const list = Array.isArray(groups) ? groups : [];
      // Dacă Amazon a trimis mai multe packing groups, nu le colapsăm într-unul singur.
      const source = list.length > 1 ? list : collapsePackGroups(list);
      return source.map((g, idx) => {
        const items = (g.items || [])
          .map((it) => ({
            sku: it.sku || it.msku || it.SellerSKU || it.sellerSku || it.asin || '',
            quantity: Number(it.quantity || it.units || 0) || 0,
            image: it.image || it.thumbnail || it.main_image || it.img || null,
            title: it.title || it.name || null,
            // stochează labelOwner din Amazon ca să nu-l suprascriem în payload
            apiLabelOwner: it.labelOwner || it.label_owner || it.label || null,
            expiration:
              it.expiration ||
              it.expiry ||
              it.expiryDate ||
              it.expirationDate ||
              null,
            prepOwner: it.prepOwner || it.prep_owner || it.prep || null,
            labelOwner: it.labelOwner || it.label_owner || it.label || null
          }))
          .filter((it) => Number(it.quantity || 0) > 0); // ignorăm item-ele cu cantitate 0
        const units = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        return {
          id: g.id || g.packingGroupId || `group-${idx + 1}`,
          packingGroupId: g.packingGroupId || g.id || `group-${idx + 1}`,
          title: g.title || g.destLabel || `Pack group ${idx + 1}`,
          items,
          skuCount: g.skuCount || items.length || 0,
          units: g.units || units || 0,
          packMode: g.packMode || 'single',
          boxes: g.boxes || 1,
          boxDimensions: g.boxDimensions || null,
          boxWeight: g.boxWeight ?? null,
          packingConfirmed: Boolean(g.packingConfirmed),
          perBoxDetails: g.perBoxDetails || g.per_box_details || null,
          perBoxItems: g.perBoxItems || g.per_box_items || null,
          contentInformationSource: g.contentInformationSource || g.content_information_source || null
        };
      });
    },
    [collapsePackGroups]
  );
  const getPackGroupKey = useCallback((group) => group?.packingGroupId || group?.id || null, []);
  const getPackGroupSignature = useCallback((group) => {
    const items = Array.isArray(group?.items) ? group.items : [];
    const parts = items
      .map((it) => {
        const sku = String(it?.sku || it?.msku || it?.SellerSKU || '').trim().toUpperCase();
        const qty = Number(it?.quantity || it?.units || 0) || 0;
        if (!sku || qty <= 0) return null;
        return `${sku}:${qty}`;
      })
      .filter(Boolean)
      .sort();
    return parts.length ? parts.join('|') : null;
  }, []);
  const mergePackGroups = useCallback((prev = [], incoming = []) => {
    const prevByKey = new Map();
    prev.forEach((g) => {
      const key = getPackGroupKey(g);
      if (key) prevByKey.set(key, g);
    });
    return incoming.map((g, idx) => {
      const key = getPackGroupKey(g);
      let existing = key ? prevByKey.get(key) : null;
      if (!existing) {
        existing = prev[idx] || null;
      }
      if (!existing) return g;
      const resolvedDims = getSafeDims(g.boxDimensions)
        ? g.boxDimensions
        : getSafeDims(existing.boxDimensions)
          ? existing.boxDimensions
          : null;
      const incomingWeight = getPositiveNumber(g.boxWeight);
      const existingWeight = getPositiveNumber(existing.boxWeight);
      const resolvedPackMode = g.packMode ?? existing.packMode ?? 'single';
      const resolvedContentSource = g.contentInformationSource || existing.contentInformationSource || null;
      return {
        ...existing,
        ...g,
        // păstrează items/dims/weight locale dacă Amazon nu le trimite
        items: Array.isArray(g.items) && g.items.length ? g.items : existing.items || [],
        boxDimensions: resolvedDims,
        boxWeight: incomingWeight ?? existingWeight ?? null,
        boxes: g.boxes ?? existing.boxes ?? 1,
        packMode: resolvedPackMode,
        packingConfirmed: g.packingConfirmed || existing.packingConfirmed || false,
        perBoxDetails: g.perBoxDetails || existing.perBoxDetails || null,
        perBoxItems: g.perBoxItems || existing.perBoxItems || null,
        contentInformationSource: resolvedContentSource
      };
    });
  }, [getPackGroupKey, getPackGroupSignature]);
  const [packGroups, setPackGroups] = useState([]);
  const [packGroupsPreview, setPackGroupsPreview] = useState([]);
  const [packGroupsPreviewLoading, setPackGroupsPreviewLoading] = useState(false);
const [packGroupsPreviewError, setPackGroupsPreviewError] = useState('');
  const [packGroupsLoaded, setPackGroupsLoaded] = useState(false);
  const [step1BoxPlanByMarket, setStep1BoxPlanByMarket] = useState({});
  const step1BoxPlanRef = useRef(step1BoxPlanByMarket);
  const [packingOptionId, setPackingOptionId] = useState(initialPlan?.packingOptionId || null);
  const [packingOptions, setPackingOptions] = useState([]);
  const [placementOptionId, setPlacementOptionId] = useState(initialPlan?.placementOptionId || null);
  const [shipmentMode, setShipmentMode] = useState(initialShipmentMode);
  const [palletDetails, setPalletDetails] = useState(
    initialShipmentMode?.palletDetails || {
      quantity: 1,
      length: '',
      width: '',
      height: '',
      weight: '',
      stackability: 'STACKABLE',
      freightClass: 'FC_XX',
      declaredValue: '',
      declaredValueCurrency: 'EUR'
    }
  );
  const [shipments, setShipments] = useState(initialShipmentList);
  const [labelFormat, setLabelFormat] = useState(initialLabelFormat || 'thermal');
  const [tracking, setTracking] = useState(initialTrackingList);
  const [labelsLoadingId, setLabelsLoadingId] = useState(null);
  const [labelsError, setLabelsError] = useState('');
  const [step3Confirming, setStep3Confirming] = useState(false);
  const [step3Error, setStep3Error] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planError, setPlanError] = useState('');
  const [planNotice, setPlanNotice] = useState('');
  const [step1Saving, setStep1Saving] = useState(false);
  const [step1SaveError, setStep1SaveError] = useState('');
  const [allowNoInboundPlan, setAllowNoInboundPlan] = useState(false);
  const [inboundPlanMissing, setInboundPlanMissing] = useState(false);
  const [skuStatuses, setSkuStatuses] = useState(initialSkuStatuses);
  const [operationProblems, setOperationProblems] = useState(
    Array.isArray(initialPlan?.operationProblems) ? initialPlan.operationProblems : []
  );
  const [blocking, setBlocking] = useState(false);
  const [shippingOptions, setShippingOptions] = useState(
    historyMode ? (Array.isArray(initialShippingOptions) ? initialShippingOptions : []) : []
  );
  const shippingOptionsRef = useRef(Array.isArray(initialShippingOptions) ? initialShippingOptions : []);
  const [readyWindowByShipment, setReadyWindowByShipment] = useState({});
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingSummary, setShippingSummary] = useState(historyMode ? initialShippingSummary : null);
  const [selectedTransportationOptionId, setSelectedTransportationOptionId] = useState(
    historyMode ? initialSelectedTransportationOptionId : null
  );
  const [shippingError, setShippingError] = useState('');
  const [packingSubmitLoading, setPackingSubmitLoading] = useState(false);
  const [packingSubmitError, setPackingSubmitError] = useState('');
  const [packingRefreshLoading, setPackingRefreshLoading] = useState(false);
  const [packingReadyError, setPackingReadyError] = useState('');
  const [step2Loaded, setStep2Loaded] = useState(false);
  const [shippingConfirming, setShippingConfirming] = useState(false);
  const [skipPacking, setSkipPacking] = useState(false);
  const [forcePartneredOnly, setForcePartneredOnly] = useState(false);
  useEffect(() => {
    shippingOptionsRef.current = Array.isArray(shippingOptions) ? shippingOptions : [];
  }, [shippingOptions]);
  const isLtlFtl = useCallback((method) => {
    const up = String(method || '').toUpperCase();
    return up === 'LTL' || up === 'FTL' || up === 'FREIGHT_LTL' || up === 'FREIGHT_FTL';
  }, []);

  const handleReadyWindowChange = useCallback((shipmentId, win) => {
    if (!shipmentId) return;
    const startInput = normalizeShipDate(win?.start);
    const startIso = startInput || normalizeShipDate(new Date().toISOString().slice(0, 10));
    const requireEnd = isLtlFtl(shipmentMode?.method);
    let endIso = normalizeShipDate(win?.end || '');
    // end nu este impus; îl lăsăm gol dacă userul nu completează
    if (!requireEnd) endIso = null;

    setReadyWindowByShipment((prev) => ({ ...prev, [shipmentId]: { start: startIso, end: endIso || undefined } }));
    setShipmentMode((prev) => ({
      ...prev,
      deliveryDate: startIso,
      deliveryWindowStart: startIso,
      deliveryWindowEnd: endIso || ''
    }));
    fetchShippingOptions({ force: true });
  }, [shipmentMode?.method, fetchShippingOptions]);
  const isFallbackId = useCallback((v) => typeof v === "string" && v.toLowerCase().startsWith("fallback-"), []);
  const hasRealPackGroups = useCallback(
    (groups) =>
      (Array.isArray(groups) ? groups : []).some((g) => g?.packingGroupId && !isFallbackId(g.packingGroupId)),
    [isFallbackId]
  );
  // Dacă Amazon returnează un inboundPlanId invalid (LOCK-* sau prea lung), intrăm automat în modul bypass.
  useEffect(() => {
    const raw =
      plan?.inboundPlanId ||
      plan?.inbound_plan_id ||
      initialPlan?.inboundPlanId ||
      initialPlan?.inbound_plan_id ||
      null;
    const bad = raw && (String(raw).startsWith('LOCK-') || String(raw).length > 38);
    if (bad) {
      setAllowNoInboundPlan(true);
      setInboundPlanMissing(true);
    }
  }, [plan?.inboundPlanId, plan?.inbound_plan_id, initialPlan?.inboundPlanId, initialPlan?.inbound_plan_id]);
  // Curăță planul local dacă primim un inboundPlanId invalid, ca să nu încerce call-urile de GET pe ID corupt.
  useEffect(() => {
    const raw = plan?.inboundPlanId || plan?.inbound_plan_id || null;
    const bad = raw && (String(raw).startsWith('LOCK-') || String(raw).length > 38);
    if (bad) {
      setPlan((prev) => ({
        ...prev,
        inboundPlanId: null,
        inbound_plan_id: null,
        planId: prev?.planId && String(prev.planId).startsWith('LOCK-') ? null : prev?.planId,
        plan_id: prev?.plan_id && String(prev.plan_id).startsWith('LOCK-') ? null : prev?.plan_id
      }));
    }
  }, [plan?.inboundPlanId, plan?.inbound_plan_id]);
  const serverUnitsRef = useRef(new Map());
  const packGroupsRef = useRef(packGroups);
  const planRef = useRef(plan);
  const packingOptionIdRef = useRef(packingOptionId);
  const placementOptionIdRef = useRef(placementOptionId);
  const packingRefreshLockRef = useRef({ inFlight: false, planId: null });
  const packingPreviewLockRef = useRef({ inFlight: false, planId: null });
  const packingAutoRetryTimerRef = useRef(null);
  const packingPreviewFetchRef = useRef(false);
  const fetchPlanInFlightRef = useRef(false);
  const servicesLoadedRef = useRef(false);
  const [skuServicesById, setSkuServicesById] = useState({});
  const [boxServices, setBoxServices] = useState([]);
  const shippingRetryRef = useRef(0);
  const shippingRetryTimerRef = useRef(null);
  const shippingFetchLockRef = useRef({ inFlight: false, lastKey: "", lastAt: 0 });
  const selectedOptionSignatureRef = useRef(null);
  const toFriendlyPlanNotice = useCallback((warning) => {
    const raw = String(warning || '').trim();
    if (!raw) return '';
    if (/shipments.+goal|fluxul continu[aă] normal|packing options/i.test(raw)) {
      return 'Planul Amazon a fost creat cu succes. Poți continua cu împachetarea (Step 1b).';
    }
    return raw
      .replace(/`/g, '')
      .replace(/\b(RequestId|TraceId)\s*:\s*[A-Za-z0-9-]+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }, []);
  const planMissingRetryRef = useRef(0);
  const trackingPrefillRef = useRef(false);
  const trackingLoadRequestedRef = useRef(false);
  const autoPackingRef = useRef({ planId: null, attempted: false });
  const sanitizePackingOptions = useCallback((options) => {
    const list = Array.isArray(options) ? options : [];
    const filtered = list.filter((opt) => {
      const discounts = opt?.discounts || opt?.Discounts || [];
      const groups = Array.isArray(opt?.packingGroups || opt?.PackingGroups)
        ? opt.packingGroups || opt.PackingGroups
        : [];
      const groupsCount = opt?.groupsCount ?? groups.length ?? 0;
      const hasDiscount = Array.isArray(discounts) && discounts.length > 0;
      const isMultiGroup = groupsCount > 1;
      return !hasDiscount && !isMultiGroup;
    });
    if (filtered.length) return filtered;
    return list.slice(0, 1);
  }, []);
  const resolvePackingOptionId = useCallback(
    (opt) => opt?.packingOptionId || opt?.PackingOptionId || opt?.id || null,
    []
  );
  const optionHasDiscount = useCallback((opt) => {
    const discounts = opt?.discounts || opt?.Discounts || [];
    return Array.isArray(discounts) && discounts.length > 0;
  }, []);
  const optionIsStandard = useCallback(
    (opt) => {
      const groups = Array.isArray(opt?.packingGroups || opt?.PackingGroups)
        ? opt.packingGroups || opt.PackingGroups
        : [];
      const groupsCount = opt?.groupsCount ?? groups.length ?? 0;
      return groupsCount === 1;
    },
    []
  );
  const maybeSelectStandardPackingOption = useCallback(
    (options) => {
      const list = Array.isArray(options) ? options : [];
      if (!list.length) return;
      const standard =
        list.find((opt) => optionIsStandard(opt)) ||
        list.find((opt) => !optionHasDiscount(opt)) ||
        list[0];
      if (!standard) return;
      const currentId = packingOptionIdRef.current;
      const currentOpt = list.find(
        (opt) => String(resolvePackingOptionId(opt)) === String(currentId)
      );
      const shouldSetDefault = !currentId || (currentOpt && !optionIsStandard(currentOpt));
      if (!shouldSetDefault) return;
      const standardId = resolvePackingOptionId(standard);
      if (!standardId) return;
      packingOptionIdRef.current = standardId;
      setPackingOptionId(standardId);
      setPlan((prev) => ({
        ...prev,
        packingOptionId: standardId,
        packing_option_id: standardId
      }));
    },
    [optionHasDiscount, optionIsStandard, resolvePackingOptionId]
  );
  useEffect(() => {
    packGroupsRef.current = packGroups;
  }, [packGroups]);
  useEffect(() => {
    step1BoxPlanRef.current = step1BoxPlanByMarket;
  }, [step1BoxPlanByMarket]);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const step1BoxPlanForMarket = useMemo(() => {
    const raw = step1BoxPlanByMarket || {};
    const planData = raw?.[currentMarket] || null;
    if (planData && typeof planData === 'object') return planData;
    return { groups: {} };
  }, [step1BoxPlanByMarket, currentMarket]);
  const step1PlanGroupsData = useMemo(() => {
    const groups = step1BoxPlanForMarket?.groups || {};
    const ordered = Object.entries(groups)
      .map(([key, value]) => ({
        key,
        value,
        label: value?.groupLabel || ''
      }))
      .sort((a, b) => {
        const numA = Number(String(a.label).match(/(\d+)/)?.[1] || 0);
        const numB = Number(String(b.label).match(/(\d+)/)?.[1] || 0);
        return numA - numB;
      });
    const buildPlanSignature = (planGroup) => {
      const boxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      if (!boxItems.length) return null;
      const totals = new Map();
      boxItems.forEach((box) => {
        Object.entries(box || {}).forEach(([key, qty]) => {
          const sku = String(key || '').trim().toUpperCase();
          if (!sku) return;
          const add = Number(qty || 0) || 0;
          totals.set(sku, (totals.get(sku) || 0) + add);
        });
      });
      const parts = Array.from(totals.entries())
        .filter(([, qty]) => Number(qty) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sku, qty]) => `${sku}:${qty}`);
      return parts.length ? parts.join('|') : null;
    };
    const signatureMap = new Map();
    ordered.forEach(({ key, value }) => {
      const sig = buildPlanSignature(value);
      if (sig && !signatureMap.has(sig)) {
        signatureMap.set(sig, { key, value });
      }
    });
    return { groups, ordered, signatureMap, buildPlanSignature };
  }, [step1BoxPlanForMarket]);
  const resolvePlanGroupForPackGroup = useCallback(
    (group) => {
      const key =
        group?.step1PlanGroupKey ||
        group?.packingGroupId ||
        group?.id ||
        null;
      const direct = key ? step1PlanGroupsData.groups?.[key] : null;
      if (direct) {
        return { planGroup: direct, planGroupKey: key };
      }
      const sig = getPackGroupSignature(group);
      if (sig && step1PlanGroupsData.signatureMap.has(sig)) {
        const entry = step1PlanGroupsData.signatureMap.get(sig);
        return { planGroup: entry?.value || null, planGroupKey: entry?.key || null };
      }
      // fallback: dacă nu găsim după id sau semnătură, ia primul grup din plan (evită payload gol)
      const fallback = Array.isArray(step1PlanGroupsData.ordered) ? step1PlanGroupsData.ordered[0] : null;
      if (fallback?.value) {
        return { planGroup: fallback.value, planGroupKey: fallback.key || key };
      }
      return { planGroup: null, planGroupKey: key };
    },
    [getPackGroupSignature, step1PlanGroupsData]
  );
  const handleStep1BoxPlanChange = useCallback(
    (nextPlan) => {
      if (!nextPlan || typeof nextPlan !== 'object') return;
      setStep1BoxPlanByMarket((prev) => ({
        ...(prev || {}),
        [currentMarket]: nextPlan
      }));
    },
    [currentMarket]
  );
  const normalizeSkus = useCallback((skus = []) => {
    const firstMedia = (val) => (Array.isArray(val) && val.length ? val[0] : null);
    const addMonths = (date, months) => {
      const next = new Date(date.getTime());
      const day = next.getDate();
      next.setMonth(next.getMonth() + months);
      if (next.getDate() !== day) {
        next.setDate(0);
      }
      return next;
    };
    const formatDateInput = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return (Array.isArray(skus) ? skus : []).map((sku) => {
      const locator = firstMedia(sku?.main_product_image_locator)?.media_location || null;
      const image =
        sku?.image ||
        sku?.thumbnail ||
        sku?.img ||
        sku?.main_image ||
        sku?.mainImage?.link ||
        sku?.mainImage ||
        locator;
      const existingExpiry =
        sku?.expiryDate ||
        sku?.expiry ||
        sku?.expiration ||
        sku?.expirationDate ||
        null;
      const needsExpiryDefault = Boolean(sku?.expiryRequired) && !existingExpiry;
      const expiryDefault = needsExpiryDefault ? formatDateInput(addMonths(new Date(), 18)) : null;
      const expiryDate = existingExpiry && !sku?.expiryDate ? existingExpiry : null;
      const nextSku = {
        ...sku,
        ...(image && !sku.image ? { image } : null),
        ...(needsExpiryDefault ? { expiryDate: expiryDefault, expiry: expiryDefault } : null),
        ...(expiryDate ? { expiryDate, expiry: sku?.expiry || expiryDate } : null)
      };
      return nextSku;
    });
  }, []);
  const snapshotServerUnits = useCallback((skus = []) => {
    const map = new Map();
    (Array.isArray(skus) ? skus : []).forEach((sku) => {
      if (!sku?.id) return;
      const qty = Number(sku.units ?? sku.units_sent ?? sku.units_requested ?? 0) || 0;
      map.set(String(sku.id), qty);
    });
    serverUnitsRef.current = map;
  }, []);
  useEffect(() => {
    packingOptionIdRef.current = packingOptionId;
  }, [packingOptionId]);
  useEffect(() => {
    maybeSelectStandardPackingOption(packingOptions);
  }, [packingOptions, maybeSelectStandardPackingOption]);
  useEffect(() => {
    placementOptionIdRef.current = placementOptionId;
  }, [placementOptionId]);
  useEffect(() => {
    return () => {
      if (shippingRetryTimerRef.current) {
        clearTimeout(shippingRetryTimerRef.current);
        shippingRetryTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (currentStep !== '2') {
      shippingRetryRef.current = 0;
      if (shippingRetryTimerRef.current) {
        clearTimeout(shippingRetryTimerRef.current);
        shippingRetryTimerRef.current = null;
      }
    }
  }, [currentStep]);
  useEffect(() => {
    if (currentStep !== '2') return;
    if (!forcePartneredOnly) return;
    if (shipmentMode?.carrier?.partnered !== false) return;
    setShipmentMode((prev) => ({ ...prev, carrier: null }));
  }, [currentStep, forcePartneredOnly, shipmentMode?.carrier?.partnered]);
  useEffect(() => {
    const required = Boolean(
      shippingSummary?.partneredRequired ||
      shippingSummary?.forcePartneredOnly ||
      shippingSummary?.partneredOnly ||
      shippingSummary?.mustUsePartnered
    );
    setForcePartneredOnly(required);
  }, [
    shippingSummary?.partneredRequired,
    shippingSummary?.forcePartneredOnly,
    shippingSummary?.partneredOnly,
    shippingSummary?.mustUsePartnered
  ]);
  const resolveRequestId = useCallback(() => {
    return (
      plan?.prepRequestId ||
      plan?.requestId ||
      plan?.id ||
      initialPlan?.prepRequestId ||
      initialPlan?.requestId ||
      initialPlan?.id ||
      plan?.requestId ||
      plan?.request_id ||
      initialPlan?.request_id ||
      null
    );
  }, [
    plan?.prepRequestId,
    plan?.requestId,
    plan?.id,
    plan?.request_id,
    initialPlan?.prepRequestId,
    initialPlan?.requestId,
    initialPlan?.id,
    initialPlan?.request_id
  ]);
  const sanitizeInboundPlanId = (id) => {
    if (!id) return null;
    const val = String(id);
    // Amazon poate returna un placeholder "LOCK-..." sau un id mai lung decât limita de 38.
    if (val.startsWith('LOCK-')) return null;
    if (val.length > 38) return null;
    return val;
  };
  const resolveInboundPlanId = useCallback(() => {
    // Evită revenirea la inboundPlanId din props atunci când am resetat planul curent (ex: după editarea cantităților).
    const currentPlan = planRef.current || plan;
    const hasExplicitInbound =
      currentPlan &&
      ('inboundPlanId' in currentPlan ||
        'inbound_plan_id' in currentPlan ||
        'planId' in currentPlan ||
        'plan_id' in currentPlan);

    if (hasExplicitInbound) {
      return sanitizeInboundPlanId(
        currentPlan?.inboundPlanId ||
          currentPlan?.inbound_plan_id ||
          currentPlan?.planId ||
          currentPlan?.plan_id ||
          null
      );
    }

    return sanitizeInboundPlanId(
      initialPlan?.inboundPlanId ||
        initialPlan?.inbound_plan_id ||
        initialPlan?.planId ||
        initialPlan?.plan_id ||
        null
    );
  }, [
    initialPlan?.inboundPlanId,
    initialPlan?.inbound_plan_id,
    initialPlan?.planId,
    initialPlan?.plan_id,
    plan
  ]);
  const runFetchPlan = useCallback(async () => {
    if (!fetchPlan) return null;
    if (fetchPlanInFlightRef.current) return { __skip: true };
    fetchPlanInFlightRef.current = true;
    try {
      return await fetchPlan();
    } finally {
      fetchPlanInFlightRef.current = false;
    }
  }, [fetchPlan]);
  const inboundPlanIdMemo = useMemo(() => resolveInboundPlanId(), [resolveInboundPlanId]);
  const initialRequestKey = useMemo(
    () =>
      initialPlan?.prepRequestId ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      initialPlan?.id ||
      null,
    [initialPlan?.id, initialPlan?.prepRequestId, initialPlan?.requestId, initialPlan?.request_id]
  );
  useEffect(() => {
    if (inboundPlanIdMemo) {
      setInboundPlanMissing(false);
    }
  }, [inboundPlanIdMemo]);

  // Dacă avem deja packGroups dar încă nu am primit inboundPlanId, permit continuarea fără să blocăm UI.
  useEffect(() => {
    const inboundId = resolveInboundPlanId();
    if (!inboundId && packGroupsLoaded && Array.isArray(packGroups) && packGroups.length) {
      setAllowNoInboundPlan(true);
      setInboundPlanMissing(false);
      setPlanError('');
    }
  }, [packGroupsLoaded, packGroups, resolveInboundPlanId]);

  const buildLocalSinglePackGroup = useCallback(
    (skus = []) => ({
      id: 'pack-1',
      packingGroupId: 'pack-1',
      title: 'Pack group 1',
      packMode: 'single',
      boxes: 1,
      boxDimensions: null,
      boxWeight: null,
      packingConfirmed: false,
      items: (Array.isArray(skus) ? skus : []).map((sku) => ({
        sku: sku.sku || sku.msku || sku.SellerSKU || sku.asin || sku.id || '',
        quantity: Number(sku.units || 0) || 0,
        image: sku.image || sku.thumbnail || sku.main_image || sku.img || null,
        title: sku.title || sku.product_name || sku.name || null,
        apiLabelOwner: sku.labelOwner || sku.label_owner || null,
        labelOwner: sku.labelOwner || sku.label_owner || null,
        prepOwner: sku.prepOwner || sku.prep_owner || null,
        expiration: sku.expiration || sku.expiry || sku.expiryDate || null
      }))
    }),
    []
  );

  const buildFallbackPackGroups = useCallback(
    (skus = []) => {
      const groups = step1PlanGroupsData?.groups || {};
      const entries = Object.entries(groups);
      if (!entries.length) {
        return [buildLocalSinglePackGroup(skus)];
      }
      return entries.map(([key, value], idx) => {
        const boxes = Array.isArray(value?.boxes) ? value.boxes : [];
        const boxCount = boxes.length || 1;
        const perBoxDetails = boxes.map((b) => ({
          length: b?.length_cm ?? b?.length ?? '',
          width: b?.width_cm ?? b?.width ?? '',
          height: b?.height_cm ?? b?.height ?? '',
          weight: b?.weight_kg ?? b?.weight ?? ''
        }));
        const perBoxItems = Array.isArray(value?.boxItems) ? value.boxItems : [];
        const totals = new Map();
        perBoxItems.forEach((box) => {
          Object.entries(box || {}).forEach(([skuKey, qty]) => {
            const keyUp = String(skuKey || '').trim().toUpperCase();
            if (!keyUp) return;
            const add = Number(qty || 0) || 0;
            totals.set(keyUp, (totals.get(keyUp) || 0) + add);
          });
        });
        const skuMap = new Map();
        (Array.isArray(skus) ? skus : []).forEach((sku) => {
          const k = String(sku.sku || sku.msku || sku.SellerSKU || sku.asin || sku.id || '').trim().toUpperCase();
          if (k) skuMap.set(k, sku);
        });
        const items =
          totals.size > 0
            ? Array.from(totals.entries())
                .filter(([, qty]) => qty > 0)
                .map(([k, qty]) => {
                  const match = skuMap.get(k);
                  return {
                    sku: match?.sku || match?.msku || match?.SellerSKU || match?.asin || match?.id || k,
                    quantity: qty,
                    image: match?.image || match?.thumbnail || match?.main_image || match?.img || null,
                    title: match?.title || match?.product_name || match?.name || null,
                    apiLabelOwner: match?.labelOwner || match?.label_owner || null,
                    labelOwner: match?.labelOwner || match?.label_owner || null,
                    prepOwner: match?.prepOwner || match?.prep_owner || null,
                    expiration: match?.expiration || match?.expiry || match?.expiryDate || null
                  };
                })
            : (Array.isArray(skus) ? skus : []).map((sku) => ({
                sku: sku.sku || sku.msku || sku.SellerSKU || sku.asin || sku.id || '',
                quantity: Number(sku.units || 0) || 0,
                image: sku.image || sku.thumbnail || sku.main_image || sku.img || null,
                title: sku.title || sku.product_name || sku.name || null,
                apiLabelOwner: sku.labelOwner || sku.label_owner || null,
                labelOwner: sku.labelOwner || sku.label_owner || null,
                prepOwner: sku.prepOwner || sku.prep_owner || null,
                expiration: sku.expiration || sku.expiry || sku.expiryDate || null
              }));
        const firstBox = boxes[0] || {};
        const singleDims =
          boxCount === 1
            ? {
                length: firstBox?.length_cm ?? firstBox?.length ?? '',
                width: firstBox?.width_cm ?? firstBox?.width ?? '',
                height: firstBox?.height_cm ?? firstBox?.height ?? ''
              }
            : null;
        const singleWeight = boxCount === 1 ? firstBox?.weight_kg ?? firstBox?.weight ?? '' : null;
        const isMultiple = boxCount > 1;
        return {
          id: key || `pack-${idx + 1}`,
          packingGroupId: key || `pack-${idx + 1}`,
          title: value?.groupLabel || value?.label || `Pack group ${idx + 1}`,
          packMode: isMultiple ? 'multiple' : 'single',
          boxes: boxCount,
          boxDimensions: isMultiple ? null : singleDims,
          boxWeight: isMultiple ? null : singleWeight,
          perBoxDetails: isMultiple ? perBoxDetails : null,
          perBoxItems: isMultiple ? perBoxItems : null,
          contentInformationSource: isMultiple ? 'BOX_CONTENT_PROVIDED' : null,
          packingConfirmed: false,
          items
        };
      });
    },
    [buildLocalSinglePackGroup, step1PlanGroupsData?.groups]
  );

  // Dacă nu avem inboundPlanId și Amazon nu a trimis packGroups, creează un grup unic local (Pack group 1)
  // pentru a permite UI să continue packing fără prompt suplimentar.
  useEffect(() => {
    const inboundId = resolveInboundPlanId();
    const hasGroups = Array.isArray(packGroups) && packGroups.length > 0;
    const hasSkus = Array.isArray(plan?.skus) && plan.skus.some((s) => Number(s?.units || 0) > 0);
    if (inboundId || hasGroups || !hasSkus) return;
    setAllowNoInboundPlan(true);
    const fallbackGroups = buildFallbackPackGroups(plan.skus);
    setPackGroups(fallbackGroups);
    setPackGroupsLoaded(true);
  }, [packGroups, plan?.skus, resolveInboundPlanId, buildFallbackPackGroups]);

  // Dacă avem inboundPlanId dar Amazon nu trimite packGroups, folosește fallback cu un singur grup local.
  useEffect(() => {
    const inboundId = resolveInboundPlanId();
    const hasGroups = Array.isArray(packGroups) && packGroups.length > 0;
    const hasSkus = Array.isArray(plan?.skus) && plan.skus.some((s) => Number(s?.units || 0) > 0);
    if (!inboundId || hasGroups || !hasSkus) return;
    const fallbackGroups = buildFallbackPackGroups(plan.skus);
    setPackGroups(fallbackGroups);
    setPackGroupsLoaded(true);
  }, [plan?.skus, packGroups, resolveInboundPlanId, buildFallbackPackGroups]);

  // Persistăm ultimul pas vizitat ca să nu se piardă la refresh (cheie per shipment).
  const storageKeyBase = useMemo(() => {
    const inboundId =
      plan?.inboundPlanId ||
      plan?.inbound_plan_id ||
      initialPlan?.inboundPlanId ||
      initialPlan?.inbound_plan_id ||
      null;
    if (inboundId) return inboundId;
    return (
      plan?.requestId ||
      plan?.request_id ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      plan?.id ||
      initialPlan?.id ||
      null
    );
  }, [
    plan?.inboundPlanId,
    plan?.inbound_plan_id,
    initialPlan?.inboundPlanId,
    initialPlan?.inbound_plan_id,
    plan?.requestId,
    plan?.request_id,
    plan?.id,
    initialPlan?.requestId,
    initialPlan?.request_id,
    initialPlan?.id
  ]);
  const stepStorageKey = useMemo(() => {
    if (!storageKeyBase) return null;
    return `fba-wizard-step-${storageKeyBase}`;
  }, [storageKeyBase]);
  const stateStorageKey = useMemo(() => {
    if (!storageKeyBase) return null;
    return `fba-wizard-state-${storageKeyBase}`;
  }, [storageKeyBase]);
  const [restoredState, setRestoredState] = useState(false);
  const prevStorageKeyRef = useRef(storageKeyBase);
  const requestKeyRef = useRef(initialRequestKey);

  useEffect(() => {
    if (prevStorageKeyRef.current === storageKeyBase) return;
    prevStorageKeyRef.current = storageKeyBase;

    const normalizedInitialGroups = normalizePackGroups(initialPacking || []);
    const hasInbound =
      Boolean(planRef.current?.inboundPlanId || planRef.current?.inbound_plan_id || plan?.inboundPlanId || plan?.inbound_plan_id);
    const hasRealGroups = hasRealPackGroups(packGroupsRef.current);

    const currentRequestKey = initialRequestKey;
    const isNewRequest = requestKeyRef.current !== currentRequestKey;
    requestKeyRef.current = currentRequestKey;

    // Dacă avem deja un inbound plan real pentru același request, nu resetăm planul/packing-ul.
    if (!isNewRequest && hasInbound) {
      if (hasRealGroups) {
        setPackGroupsLoaded(true);
      } else {
        setPackGroupsLoaded(hasRealPackGroups(normalizedInitialGroups));
      }
      return;
    }

    if (historyMode) {
      setCurrentStep(resolveInitialStep());
      setCompletedSteps(Array.isArray(initialCompletedSteps) ? initialCompletedSteps : []);
    } else {
      setCurrentStep('1');
      setCompletedSteps([]);
    }
    setPlan(initialPlan);
    snapshotServerUnits(initialPlan?.skus || []);
    setPackGroups(normalizedInitialGroups);
    setPackGroupsLoaded(hasRealPackGroups(normalizedInitialGroups));
    setShipmentMode(initialShipmentMode);
    setPalletDetails(
      initialShipmentMode?.palletDetails || {
        quantity: 1,
        length: '',
        width: '',
        height: '',
        weight: '',
        stackability: 'STACKABLE',
        freightClass: 'FC_XX',
        declaredValue: '',
        declaredValueCurrency: 'EUR'
      }
    );
    setShipments(initialShipmentList);
    setLabelFormat(initialLabelFormat || 'thermal');
    setTracking(initialTrackingList);
    setPackingOptionId(initialPlan?.packingOptionId || null);
    setPlacementOptionId(initialPlan?.placementOptionId || null);
    setPlanError('');
    setPackingSubmitError('');
    setPackingReadyError('');
    setShippingError('');
    setShippingOptions(historyMode ? (Array.isArray(initialShippingOptions) ? initialShippingOptions : []) : []);
    setShippingSummary(historyMode ? initialShippingSummary : null);
    setShippingConfirmed(historyMode ? Boolean(initialShippingConfirmed) : false);
    setSelectedTransportationOptionId(historyMode ? initialSelectedTransportationOptionId : null);
    setStep2Loaded(
      Boolean(historyMode && (initialShippingOptions?.length || initialShippingSummary || initialShippingConfirmed))
    );
    setRestoredState(false);
  }, [
    storageKeyBase,
    initialPlan,
    initialPacking,
    initialShipmentMode,
    initialShipmentList,
    initialTrackingList,
    initialTrackingIds,
    initialCompletedSteps,
    initialShippingOptions,
    initialShippingSummary,
    initialShippingConfirmed,
    initialSelectedTransportationOptionId,
    initialLabelFormat,
    initialCurrentStep,
    historyMode,
    normalizePackGroups,
    hasRealPackGroups,
    initialRequestKey,
    plan?.inboundPlanId,
    plan?.inbound_plan_id,
    snapshotServerUnits
  ]);

  useEffect(() => {
    if (!allowPersistence) return;
    if (typeof window === 'undefined' || !stepStorageKey) return;
    const saved = window.localStorage.getItem(stepStorageKey);
    if (saved && stepsOrder.includes(saved)) {
      setCurrentStep(saved);
    }
  }, [allowPersistence, stepStorageKey, stepsOrder]);

  useEffect(() => {
    if (!allowPersistence) return;
    if (typeof window === 'undefined' || !stepStorageKey) return;
    window.localStorage.setItem(stepStorageKey, String(currentStep));
  }, [allowPersistence, currentStep, stepStorageKey]);

  // Rehidratează starea locală după refresh (similar cu "Active workflow" din Amazon)
  useEffect(() => {
    if (!allowPersistence) {
      setRestoredState(true);
      return;
    }
    if (typeof window === 'undefined' || restoredState || !stateStorageKey) return;
    const raw = window.localStorage.getItem(stateStorageKey);
    if (!raw) {
      setRestoredState(true);
      return;
    }
    try {
      const data = JSON.parse(raw);
      if (data?.plan) setPlan((prev) => ({ ...prev, ...data.plan }));
      const normalized = Array.isArray(data?.packGroups) ? normalizePackGroups(data.packGroups) : [];
      if (normalized.length) setPackGroups((prev) => mergePackGroups(prev, normalized));
      const hasRealGroups = hasRealPackGroups(normalized);
      setPackGroupsLoaded(hasRealGroups);
      if (data?.shipmentMode) setShipmentMode((prev) => ({ ...prev, ...normalizeShipmentModeFromData(data.shipmentMode) }));
      if (data?.palletDetails) setPalletDetails((prev) => ({ ...prev, ...data.palletDetails }));
      if (Array.isArray(data?.shipments)) setShipments(data.shipments);
      if (data?.labelFormat) setLabelFormat(data.labelFormat);
      if (Array.isArray(data?.tracking)) setTracking(data.tracking);
      if (data?.packingOptionId) setPackingOptionId(data.packingOptionId);
      if (Array.isArray(data?.packingOptions)) setPackingOptions(sanitizePackingOptions(data.packingOptions));
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
      if (Array.isArray(data?.completedSteps)) setCompletedSteps(data.completedSteps);
      if (data?.currentStep && stepsOrder.includes(data.currentStep)) setCurrentStep(data.currentStep);
      if (data?.step1BoxPlanByMarket) setStep1BoxPlanByMarket(data.step1BoxPlanByMarket);
    } catch {
      // ignore corrupt cache
    } finally {
      setRestoredState(true);
    }
  }, [allowPersistence, stateStorageKey, stepsOrder, restoredState, normalizePackGroups, mergePackGroups, hasRealPackGroups]);

  // Persistă starea curentă ca să poți relua workflow-ul după refresh.
  useEffect(() => {
    if (!allowPersistence) return;
    if (typeof window === 'undefined') return;
    if (!stateStorageKey) return;
    const snapshot = {
      plan,
      packGroups,
      step1BoxPlanByMarket,
      shipmentMode,
      palletDetails,
      shipments,
      labelFormat,
      tracking,
      packingOptionId,
      packingOptions,
      placementOptionId,
      completedSteps,
      currentStep
    };
    window.localStorage.setItem(stateStorageKey, JSON.stringify(snapshot));
  }, [
    allowPersistence,
    plan,
    packGroups,
    step1BoxPlanByMarket,
    shipmentMode,
    palletDetails,
    shipments,
    labelFormat,
    tracking,
    packingOptionId,
    packingOptions,
    placementOptionId,
    completedSteps,
    currentStep,
    stateStorageKey
  ]);

  // Curăță localStorage la mount pentru a forța reluarea de la Step 1
  useEffect(() => {
    if (historyMode) return;
    if (typeof window === 'undefined') return;
    if (stepStorageKey) window.localStorage.removeItem(stepStorageKey);
    if (stateStorageKey) window.localStorage.removeItem(stateStorageKey);
    setCurrentStep('1');
    setCompletedSteps([]);
  }, [historyMode, stateStorageKey, stepStorageKey]);

  useEffect(() => {
    if (!autoLoadPlan && !fetchPlan) return;
    if (planLoaded) return;
    let cancelled = false;
    loadPlan();
    return () => {
      cancelled = true;
    };

    async function loadPlan() {
      setLoadingPlan(true);
      setPlanError('');
      setPlanNotice('');
      setStep1SaveError('');
      const hasCachedGroups = hasRealPackGroups(packGroupsRef.current);
      const workflowAlreadyStarted =
        Boolean(packingOptionIdRef.current || planRef.current?.packingOptionId || initialPlan?.packingOptionId) ||
        Boolean(placementOptionIdRef.current || planRef.current?.placementOptionId || initialPlan?.placementOptionId);
      if (!hasCachedGroups && !workflowAlreadyStarted) {
        setPackGroups([]); // doar dacă e plan nou / încă neconfirmat
      }
      let skip = false;
      try {
        const response = fetchPlan ? await runFetchPlan() : null;
        if (cancelled) return;
        if (response?.__skip) {
          skip = true;
          return;
        }
        if (!response) {
          setPlanError((prev) => prev || 'Amazon plan did not respond. Try refreshing.');
          return;
        }
        const {
          shipFrom: pFrom,
          marketplace: pMarket,
          skus: pSkus,
          packGroups: pGroups,
          shipments: pShipments,
          warning: pWarning,
          shipmentMode: pShipmentMode,
          skuStatuses: pSkuStatuses,
          operationProblems: pOperationProblems,
          blocking: pBlocking,
          sourceAddress: pSourceAddress,
          source_address: pSourceAddressAlt
        } = response;
        const sourceAddress = pSourceAddress || pSourceAddressAlt || null;
        if (pFrom && pMarket && Array.isArray(pSkus)) {
          const normSkus = normalizeSkus(pSkus);
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom, sourceAddress),
            marketplace: pMarket,
            skus: normSkus,
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          snapshotServerUnits(normSkus);
        } else {
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom || prev?.shipFrom, sourceAddress),
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          if (Array.isArray(response?.skus)) snapshotServerUnits(normalizeSkus(response.skus));
        }
        if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
        if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
        if (Array.isArray(pGroups)) {
          const normalized = normalizePackGroups(pGroups);
          setPackGroups((prev) => mergePackGroups(prev, normalized));
          setPackGroupsLoaded(hasRealPackGroups(normalized));
        }
        if (Array.isArray(pShipments) && pShipments.length) setShipments(pShipments);
        if (pShipmentMode) setShipmentMode((prev) => ({ ...prev, ...normalizeShipmentModeFromData(pShipmentMode) }));
        if (response?.palletDetails) setPalletDetails((prev) => ({ ...prev, ...response.palletDetails }));
        if (Array.isArray(pSkuStatuses)) setSkuStatuses(pSkuStatuses);
        setOperationProblems(Array.isArray(pOperationProblems) ? pOperationProblems : []);
        setBlocking(Boolean(pBlocking));
        if (typeof pWarning === 'string' && pWarning.trim()) {
          setPlanNotice((prevNotice) => prevNotice || toFriendlyPlanNotice(pWarning));
        }
      } catch (e) {
        if (!cancelled) setPlanError(e?.message || 'Failed to load Amazon plan.');
      } finally {
        if (!cancelled && !skip) {
          setLoadingPlan(false);
          setPlanLoaded(true);
        }
      }
    }
  }, [autoLoadPlan, fetchPlan, normalizePackGroups, planLoaded, runFetchPlan, snapshotServerUnits, toFriendlyPlanNotice]);

  useEffect(() => {
    if (!planLoaded) return;
    if (!fetchPlan) return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (inboundPlanId && requestId) {
      planMissingRetryRef.current = 0;
      setInboundPlanMissing(false);
      return;
    }
    if (planMissingRetryRef.current >= 2) {
      setInboundPlanMissing(true);
      return;
    }
    planMissingRetryRef.current += 1;
    let cancelled = false;
    (async () => {
      let skip = false;
      setLoadingPlan(true);
      try {
        const response = await runFetchPlan();
        if (response?.__skip) {
          skip = true;
          return;
        }
        if (cancelled || !response) return;
        const {
          shipFrom: pFrom,
          marketplace: pMarket,
          skus: pSkus,
          sourceAddress: pSourceAddress,
          source_address: pSourceAddressAlt
        } = response;
        const sourceAddress = pSourceAddress || pSourceAddressAlt || null;
        if (pFrom && pMarket && Array.isArray(pSkus)) {
          const normSkus = normalizeSkus(pSkus);
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom, sourceAddress),
            marketplace: pMarket,
            skus: normSkus,
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          snapshotServerUnits(normSkus);
        } else {
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom || prev?.shipFrom, sourceAddress),
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          if (Array.isArray(response?.skus)) snapshotServerUnits(normalizeSkus(response.skus));
        }
      } catch (e) {
        if (!cancelled) setPlanError((prev) => prev || e?.message || 'Failed to reload Amazon plan.');
      } finally {
        if (!cancelled && !skip) setLoadingPlan(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planLoaded, fetchPlan, resolveInboundPlanId, resolveRequestId, runFetchPlan, snapshotServerUnits]);
  useEffect(() => {
    const planBoxPlan = plan?.step1BoxPlan || plan?.step1_box_plan || null;
    if (!planBoxPlan || typeof planBoxPlan !== 'object') return;
    setStep1BoxPlanByMarket((prev) => {
      if (prev && Object.keys(prev).length) return prev;
      return planBoxPlan;
    });
  }, [plan?.step1BoxPlan, plan?.step1_box_plan]);
  // Când primim un nou inboundPlanId, resetăm box plan-ul ca să nu păstrăm grupuri vechi (evităm mismatch de packingGroupId).
  useEffect(() => {
    if (!plan?.inboundPlanId && !plan?.inbound_plan_id) return;
    const planBoxPlan = plan?.step1BoxPlan || plan?.step1_box_plan || {};
    setStep1BoxPlanByMarket(planBoxPlan && typeof planBoxPlan === 'object' ? planBoxPlan : {});
  }, [plan?.inboundPlanId, plan?.inbound_plan_id]);

  useEffect(() => {
    const requestId = resolveRequestId();
    if (!requestId) {
      servicesLoadedRef.current = false;
      setSkuServicesById({});
      setBoxServices([]);
      return;
    }
    if (servicesLoadedRef.current) return;
    let cancelled = false;
    const withLocalId = (entry) => ({
      ...entry,
      _local_id: entry?._local_id || `svc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    });
    (async () => {
      const { data, error } = await supabase
        .from('prep_request_services')
        .select('prep_request_item_id, service_id, service_name, unit_price, units, item_type')
        .eq('request_id', requestId);
      if (cancelled) return;
      if (error) {
        console.warn('Failed to load prep services', error);
        return;
      }
      const nextSkuServices = {};
      const nextBoxServices = [];
      (data || []).forEach((row) => {
        const entry = withLocalId({
          service_id: row.service_id || null,
          service_name: row.service_name,
          unit_price: Number(row.unit_price || 0),
          units: Number(row.units || 0)
        });
        if (row.item_type === 'box') {
          nextBoxServices.push(entry);
          return;
        }
        const key = row.prep_request_item_id;
        if (!key) return;
        if (!nextSkuServices[key]) nextSkuServices[key] = [];
        nextSkuServices[key].push(entry);
      });
      setSkuServicesById(nextSkuServices);
      setBoxServices(nextBoxServices);
      servicesLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveRequestId]);

  const buildServiceRows = useCallback((requestId, skuMap, boxList) => {
    const rows = [];
    Object.entries(skuMap || {}).forEach(([skuId, services]) => {
      (services || []).forEach((svc) => {
        const units = Number(svc?.units || 0);
        if (!svc?.service_name || units <= 0) return;
        rows.push({
          request_id: requestId,
          prep_request_item_id: skuId,
          service_id: svc?.service_id || null,
          service_name: svc.service_name,
          unit_price: Number(svc?.unit_price || 0),
          units,
          item_type: 'sku'
        });
      });
    });
    (boxList || []).forEach((svc) => {
      const units = Number(svc?.units || 0);
      if (!svc?.service_name || units <= 0) return;
      rows.push({
        request_id: requestId,
        prep_request_item_id: null,
        service_id: svc?.service_id || null,
        service_name: svc.service_name,
        unit_price: Number(svc?.unit_price || 0),
        units,
        item_type: 'box'
      });
    });
    return rows;
  }, []);

  const persistServicesToDb = useCallback(async () => {
    const requestId = resolveRequestId();
    if (!requestId) return;
    const rows = buildServiceRows(requestId, skuServicesById, boxServices);
    const { error: delErr } = await supabase
      .from('prep_request_services')
      .delete()
      .eq('request_id', requestId);
    if (delErr) throw delErr;
    if (rows.length) {
      const { error: insErr } = await supabase
        .from('prep_request_services')
        .insert(rows);
      if (insErr) throw insErr;
    }
  }, [buildServiceRows, boxServices, resolveRequestId, skuServicesById]);
  useEffect(() => {
    if (serverUnitsRef.current.size) return;
    snapshotServerUnits(initialPlan?.skus || []);
  }, [initialPlan?.skus, snapshotServerUnits]);

  const warning = useMemo(() => {
    if (!step2Loaded || shippingLoading) return null;
    const summaryWarnings = Array.isArray(shippingSummary?.warnings) ? shippingSummary.warnings.filter(Boolean) : [];
    if (summaryWarnings.length && !shippingSummary?.alreadyConfirmed) {
      return summaryWarnings.map((w) => String(w)).join(' | ');
    }
    if (currentStep === '1b') {
      const missingPack = (packGroups || []).some((g) => {
        const isMultiple = String(g?.packMode || '').toLowerCase() === 'multiple';
        if (isMultiple) {
          const perBox = Array.isArray(g?.perBoxDetails) ? g.perBoxDetails : [];
          if (!perBox.length) return true;
          return perBox.some((b) => {
            const perDims = getSafeDims(b);
            const perWeight = getPositiveNumber(b?.weight);
            return !(perDims && perWeight);
          });
        }
        const dims = getSafeDims(g.boxDimensions);
        const w = getPositiveNumber(g.boxWeight);
        return !(dims && w);
      });
      if (missingPack) {
        return 'Complete box dimensions and weight for all boxes before Step 2.';
      }
    }
    const returnedModes = shippingSummary?.returnedModes || [];
    const wantsSpd = String(shipmentMode?.method || '').toUpperCase() === 'SPD';
    if (wantsSpd && returnedModes.length && !returnedModes.includes('GROUND_SMALL_PARCEL')) {
      return 'Amazon nu a returnat opțiuni SPD pentru aceste colete. Verifică dimensiunile/greutatea (setPackingInformation). Paletii sunt doar pentru LTL/FTL.';
    }
    return null;
  }, [shippingSummary, shippingLoading, step2Loaded, shipmentMode?.method]);

  const isPartneredShipment = useMemo(
    () =>
      Boolean(
        shipmentMode?.carrier?.partnered ||
        forcePartneredOnly ||
        shippingSummary?.partneredRequired ||
        shippingSummary?.forcePartneredOnly ||
        shippingSummary?.partneredOnly ||
        shippingSummary?.mustUsePartnered
      ),
    [
      shipmentMode?.carrier?.partnered,
      forcePartneredOnly,
      shippingSummary?.partneredRequired,
      shippingSummary?.forcePartneredOnly,
      shippingSummary?.partneredOnly,
      shippingSummary?.mustUsePartnered
    ]
  );


  // Step 1b este încărcat doar la acțiune explicită a userului (View/Edit sau Refresh).

  // Dacă avem deja grupuri în memorie, marcăm ca loaded ca să nu le ștergem inutil.
  useEffect(() => {
    const hasRealGroups = hasRealPackGroups(packGroups);
    if (hasRealGroups) {
      setPackGroupsLoaded(true);
    }
  }, [packGroups]);

  const handlePackingChange = (skuId, patch) => {
    // patch poate fi string (packing) sau obiect cu packing + template info
    if (typeof patch === 'string') {
      setPlan((prev) => ({
        ...prev,
        skus: prev.skus.map((sku) =>
          sku.id === skuId ? { ...sku, packing: patch, packingTemplateId: null, packingTemplateName: null, unitsPerBox: null } : sku
        )
      }));
      invalidateFrom('1');
      return;
    }
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku))
    }));
    invalidateFrom('1');
  };

  const handleQuantityChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, units: Math.max(0, value) } : sku))
    }));
    invalidateFrom('1');
    setStep1SaveError('');
  };

  const handleRemoveSku = (skuId) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) =>
        sku.id === skuId ? { ...sku, units: 0, excluded: true } : sku
      )
    }));
    setSkuServicesById((prev) => {
      if (!prev || !prev[skuId]) return prev;
      const next = { ...prev };
      delete next[skuId];
      return next;
    });
    invalidateFrom('1');
    setStep1SaveError('');
  };

  const handleAddSku = async (skuInput) => {
    const skuId = typeof skuInput === 'string' ? skuInput : skuInput?.id || null;
    const requestId = resolveRequestId();

    if (skuId) {
      setPlan((prev) => ({
        ...prev,
        skus: (prev.skus || []).map((sku) =>
          sku.id === skuId
            ? { ...sku, excluded: false, units: Math.max(1, Number(sku.units || 0) || 1) }
            : sku
        )
      }));
      invalidateFrom('1');
      setStep1SaveError('');
      return;
    }

    if (!skuInput || skuInput?.source !== 'inventory') return;
    if (!requestId) {
      setStep1SaveError('Missing requestId. Reload page and retry adding product.');
      return;
    }
    const normalizedSku = String(skuInput.sku || '').trim().toUpperCase();
    const normalizedAsin = String(skuInput.asin || '').trim().toUpperCase();
    const existing = (Array.isArray(plan?.skus) ? plan.skus : []).find((row) => {
      const rowSku = String(row?.sku || '').trim().toUpperCase();
      const rowAsin = String(row?.asin || '').trim().toUpperCase();
      return (normalizedSku && rowSku === normalizedSku) || (normalizedAsin && rowAsin === normalizedAsin);
    });
    if (existing?.id) {
      setPlan((prev) => ({
        ...prev,
        skus: (prev.skus || []).map((row) =>
          row.id === existing.id
            ? { ...row, excluded: false, units: Math.max(1, Number(row.units || 0) || 1) }
            : row
        )
      }));
      invalidateFrom('1');
      setStep1SaveError('');
      return;
    }

    const payload = {
      prep_request_id: requestId,
      stock_item_id: skuInput.stockItemId || null,
      asin: String(skuInput.asin || '').trim() || null,
      sku: String(skuInput.sku || '').trim() || null,
      product_name: String(skuInput.title || '').trim() || null,
      units_requested: 1,
      units_sent: 1
    };
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('prep_request_items')
        .insert(payload)
        .select('id, stock_item_id, asin, sku, product_name, units_requested, units_sent')
        .single();
      if (insertErr) throw insertErr;
      const newSku = {
        id: inserted?.id,
        title: inserted?.product_name || skuInput?.title || skuInput?.sku || skuInput?.asin || 'New product',
        sku: inserted?.sku || skuInput?.sku || '',
        asin: inserted?.asin || skuInput?.asin || '',
        image: skuInput?.image || null,
        stock_item_id: inserted?.stock_item_id || skuInput?.stockItemId || null,
        storageType: 'Standard-size',
        packing: 'individual',
        units: Math.max(1, Number(inserted?.units_sent || inserted?.units_requested || 1)),
        excluded: false
      };
      setPlan((prev) => ({
        ...prev,
        skus: [...(Array.isArray(prev?.skus) ? prev.skus : []), newSku]
      }));
      invalidateFrom('1');
      setStep1SaveError('');
    } catch (e) {
      setStep1SaveError(e?.message || 'Could not add product from inventory.');
    }
  };

  const handleExpiryChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) =>
        sku.id === skuId ? { ...sku, expiry: value, expiryDate: value } : sku
      )
    }));
    invalidateFrom('1');
  };

  const handlePrepChange = (skuId, patch) => {
    setPlan((prev) => ({
      ...prev,
      skus: (prev.skus || []).map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku))
    }));
    invalidateFrom('1');
  };

  const planUnitsByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(plan?.skus) ? plan.skus : []).forEach((sku) => {
      const units = Number(sku?.units || 0);
      const add = (value) => {
        const key = String(value || '').trim().toUpperCase();
        if (!key) return;
        map.set(key, units);
      };
      add(sku?.sku);
      add(sku?.msku);
      add(sku?.SellerSKU);
      add(sku?.asin);
      add(sku?.id);
    });
    return map;
  }, [plan?.skus]);

  const normalizeGroupItemsForUnits = useCallback(
    (items = []) =>
      (Array.isArray(items) ? items : [])
        .map((it) => {
          const key = String(it?.sku || it?.msku || it?.SellerSKU || it?.asin || '').trim().toUpperCase();
          const plannedUnits = planUnitsByKey.get(key);
          const itemQty = Number(it?.quantity || 0) || 0;
          const quantity =
            Number.isFinite(plannedUnits) && plannedUnits > 0
              ? plannedUnits
              : itemQty > 0
                ? itemQty
                : Number.isFinite(plannedUnits)
                  ? plannedUnits
                  : itemQty;
          if (!quantity) return null;
          return { ...it, quantity };
        })
        .filter(Boolean),
    [planUnitsByKey]
  );

  const decoratePackGroup = useCallback(
    (g) => {
      const { planGroup } = resolvePlanGroupForPackGroup(g);
      const planBoxes = Array.isArray(planGroup?.boxes) ? planGroup.boxes : [];
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      const planPerBoxDetails = planBoxes
        .map((box) => {
          const length = getPositiveNumber(box?.length_cm ?? box?.length);
          const width = getPositiveNumber(box?.width_cm ?? box?.width);
          const height = getPositiveNumber(box?.height_cm ?? box?.height);
          const weight = getPositiveNumber(box?.weight_kg ?? box?.weight);
          if (!(length && width && height && weight)) return null;
          return { length, width, height, weight };
        })
        .filter(Boolean);
      const fallbackDims = planPerBoxDetails[0]
        ? { length: planPerBoxDetails[0].length, width: planPerBoxDetails[0].width, height: planPerBoxDetails[0].height }
        : null;
      const fallbackWeight = planPerBoxDetails[0]?.weight ?? null;
      const resolvedDims = getSafeDims(g?.boxDimensions) || getSafeDims(fallbackDims);
      const resolvedWeight = getPositiveNumber(g?.boxWeight) || getPositiveNumber(fallbackWeight);
      const uiBoxCount = Number(g?.boxes || 0);
      const planBoxCount = planBoxes.length || 0;
      const boxes = Math.max(1, planBoxCount || 0, uiBoxCount || 0);
      const packMode = g?.packMode || (boxes > 1 ? 'multiple' : 'single');
      const perBoxDetails =
        Array.isArray(g?.perBoxDetails) && g.perBoxDetails.length
          ? g.perBoxDetails
          : planPerBoxDetails.length
            ? planPerBoxDetails
            : null;
      const perBoxItems =
        Array.isArray(g?.perBoxItems) && g.perBoxItems.length
          ? g.perBoxItems
          : planBoxItems.length
            ? planBoxItems
            : null;
      return {
        ...g,
        boxes,
        packMode,
        boxDimensions: resolvedDims || null,
        boxWeight: resolvedWeight ?? null,
        perBoxDetails,
        perBoxItems
      };
    },
    [resolvePlanGroupForPackGroup]
  );

  const packGroupsDecorated = useMemo(() => {
    if (!Array.isArray(packGroups)) return [];
    return packGroups.map((g) => decoratePackGroup(g));
  }, [packGroups, decoratePackGroup]);

  const packGroupsForUnits = useMemo(() => {
    if (!Array.isArray(packGroupsDecorated)) return [];
    return packGroupsDecorated
      .map((g) => {
        const items = normalizeGroupItemsForUnits(g?.items || []);
        if (!items.length) return null;
        const units = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        return {
          ...g,
          items,
          units,
          skuCount: items.length
        };
      })
      .filter(Boolean);
  }, [packGroupsDecorated, normalizeGroupItemsForUnits]);

  const packGroupsPreviewForUnits = useMemo(() => {
    if (!Array.isArray(packGroupsPreview)) return [];
    return packGroupsPreview
      .map((g) => {
        const items = normalizeGroupItemsForUnits(g?.items || []);
        if (!items.length) return null;
        const units = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        return {
          ...g,
          items,
          units,
          skuCount: items.length
        };
      })
      .filter(Boolean);
  }, [packGroupsPreview, normalizeGroupItemsForUnits]);

  const packGroupsForAuto = useMemo(() => (Array.isArray(packGroupsDecorated) ? packGroupsDecorated : []), [packGroupsDecorated]);

  const autoPackingEnabled = useMemo(() => {
    if (historyMode) return false;
    const groupsPlan = step1BoxPlanForMarket?.groups || {};
    return Boolean(groupsPlan && Object.keys(groupsPlan).length);
  }, [historyMode, step1BoxPlanForMarket]);
  const autoPackingReady = useMemo(() => {
    if (!autoPackingEnabled || !Array.isArray(packGroupsForAuto) || !packGroupsForAuto.length) return false;
    const groupsPlan = step1BoxPlanForMarket?.groups || {};
    const hasGroupItems = (g) => {
      const normalized = normalizeGroupItemsForUnits(g?.items || []);
      if (normalized.length) return true;
      const planGroupKey = g?.step1PlanGroupKey || g?.packingGroupId || g?.id || null;
      const planGroup = planGroupKey ? groupsPlan?.[planGroupKey] : null;
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      if (!planBoxItems.length) return false;
      return planBoxItems.some((box) =>
        Object.values(box || {}).some((qty) => Number(qty || 0) > 0)
      );
    };
    return packGroupsForAuto.every((g) => {
      if (!hasGroupItems(g)) return false;
      const packMode = String(g?.packMode || 'single').toLowerCase();
      if (packMode === 'multiple') {
        const perBox = Array.isArray(g?.perBoxDetails) ? g.perBoxDetails : [];
        const perItems = Array.isArray(g?.perBoxItems) ? g.perBoxItems : [];
        if (!perBox.length || !perItems.length) return false;
        return perBox.every((b) => {
          const dims = getSafeDims(b);
          const w = getPositiveNumber(b?.weight);
          return Boolean(dims && w);
        });
      }
      const dims = getSafeDims(g?.boxDimensions);
      const w = getPositiveNumber(g?.boxWeight);
      return Boolean(dims && w);
    });
  }, [autoPackingEnabled, packGroupsForAuto, normalizeGroupItemsForUnits, step1BoxPlanForMarket]);

  // Active auto-packing only when we have valid groups with dimensions/weight; otherwise allow manual UI.
  const autoPackingActive = useMemo(() => autoPackingEnabled && autoPackingReady, [autoPackingEnabled, autoPackingReady]);

  const handlePackGroupUpdate = (groupId, patch) => {
    setPackGroups((prev) =>
      prev.map((g) =>
        g.id === groupId || g.packingGroupId === groupId ? { ...g, ...patch } : g
      )
    );
  };

  useEffect(() => {
    if (!packGroupsLoaded || !Array.isArray(packGroups) || packGroups.length === 0) return;
    const groupsPlan = step1BoxPlanForMarket?.groups || {};
    if (!groupsPlan || !Object.keys(groupsPlan).length) return;
    const planGroupsOrdered = Object.entries(groupsPlan)
      .map(([key, value]) => ({
        key,
        value,
        label: value?.groupLabel || ''
      }))
      .sort((a, b) => {
        const numA = Number(String(a.label).match(/(\d+)/)?.[1] || 0);
        const numB = Number(String(b.label).match(/(\d+)/)?.[1] || 0);
        return numA - numB;
      });
    const planGroupsBySignature = new Map();
    const buildPlanSignature = (planGroup) => {
      const boxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      if (!boxItems.length) return null;
      const totals = new Map();
      boxItems.forEach((box) => {
        Object.entries(box || {}).forEach(([key, qty]) => {
          const sku = String(key || '').trim().toUpperCase();
          if (!sku) return;
          const add = Number(qty || 0) || 0;
          totals.set(sku, (totals.get(sku) || 0) + add);
        });
      });
      const parts = Array.from(totals.entries())
        .filter(([, qty]) => Number(qty) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sku, qty]) => `${sku}:${qty}`);
      return parts.length ? parts.join('|') : null;
    };
    planGroupsOrdered.forEach(({ key, value }) => {
      const sig = buildPlanSignature(value);
      if (sig && !planGroupsBySignature.has(sig)) {
        planGroupsBySignature.set(sig, { key, value });
      }
    });
    setPackGroups((prev) => {
      let changed = false;
      const sameDims = (a, b) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return (
          String(a.length || '') === String(b.length || '') &&
          String(a.width || '') === String(b.width || '') &&
          String(a.height || '') === String(b.height || '')
        );
      };
      const sameJson = (a, b) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return JSON.stringify(a) === JSON.stringify(b);
      };
      const next = prev.map((g) => {
        const gid = g?.packingGroupId || g?.id || null;
        const planGroup = gid ? groupsPlan[gid] : null;
        const groupSignature = getPackGroupSignature(g);
        const signatureEntry = !planGroup && groupSignature ? planGroupsBySignature.get(groupSignature) : null;
        const signatureGroup = signatureEntry?.value || null;
        const fallbackEntry = !planGroup && !signatureGroup ? planGroupsOrdered.shift() || null : null;
        const fallbackGroup = fallbackEntry?.value || null;
        const resolvedPlan = planGroup || signatureGroup || fallbackGroup;
        if (!resolvedPlan) return g;
        const resolvedPlanKey =
          (planGroup && gid) || signatureEntry?.key || fallbackEntry?.key || g.step1PlanGroupKey || null;
        const boxes = Array.isArray(resolvedPlan?.boxes) ? resolvedPlan.boxes : [];
        const boxItems = Array.isArray(resolvedPlan?.boxItems) ? resolvedPlan.boxItems : [];
        if (!boxes.length) return g;
        const boxCount = boxes.length;
        const itemKeys = new Map();
        const items = Array.isArray(g.items) ? g.items : [];
        items.forEach((it) => {
          const sku = String(it.sku || it.msku || it.SellerSKU || '').trim();
          const asin = String(it.asin || '').trim();
          if (sku) itemKeys.set(sku.toUpperCase(), sku);
          if (asin) itemKeys.set(asin.toUpperCase(), sku || asin);
        });
        const normalizeBoxItems = (box) => {
          const normalized = {};
          Object.entries(box || {}).forEach(([key, qty]) => {
            const k = String(key || '').trim();
            if (!k) return;
            const mapped = itemKeys.get(k.toUpperCase()) || k;
            normalized[mapped] = Number(qty || 0) || 0;
          });
          return normalized;
        };
        const perBoxDetails = boxes.map((b) => ({
          length: b?.length_cm ?? b?.length ?? '',
          width: b?.width_cm ?? b?.width ?? '',
          height: b?.height_cm ?? b?.height ?? '',
          weight: b?.weight_kg ?? b?.weight ?? ''
        }));
        const perBoxItems = boxItems.length
          ? boxItems.map((box) => normalizeBoxItems(box))
          : Array.from({ length: boxCount }).map(() => ({}));
        const firstBox = boxes[0] || {};
        const singleDims =
          boxCount === 1
            ? {
                length: firstBox?.length_cm ?? firstBox?.length ?? '',
                width: firstBox?.width_cm ?? firstBox?.width ?? '',
                height: firstBox?.height_cm ?? firstBox?.height ?? ''
              }
            : g?.boxDimensions || null;
        const singleWeight =
          boxCount === 1 ? firstBox?.weight_kg ?? firstBox?.weight ?? '' : g?.boxWeight ?? null;
        const nextGroup = {
          ...g,
          boxes: boxCount,
          packMode: boxCount > 1 ? 'multiple' : 'single',
          boxDimensions: boxCount === 1 ? singleDims : g?.boxDimensions || null,
          boxWeight: boxCount === 1 ? singleWeight : g?.boxWeight ?? null,
          perBoxDetails: boxCount > 1 ? perBoxDetails : null,
          perBoxItems: boxCount > 1 ? perBoxItems : null,
          contentInformationSource: boxCount > 1 ? 'BOX_CONTENT_PROVIDED' : g?.contentInformationSource || null,
          step1PlanGroupKey: resolvedPlanKey
        };
        const unchanged =
          g.boxes === nextGroup.boxes &&
          g.packMode === nextGroup.packMode &&
          sameDims(g.boxDimensions, nextGroup.boxDimensions) &&
          g.boxWeight === nextGroup.boxWeight &&
          sameJson(g.perBoxDetails, nextGroup.perBoxDetails) &&
          sameJson(g.perBoxItems, nextGroup.perBoxItems) &&
          g.contentInformationSource === nextGroup.contentInformationSource &&
          g.step1PlanGroupKey === nextGroup.step1PlanGroupKey;
        if (!unchanged) changed = true;
        return unchanged ? g : nextGroup;
      });
      return changed ? next : prev;
    });
  }, [packGroupsLoaded, packGroups, step1BoxPlanForMarket]);

  const handleSelectPackingOption = (id) => {
    if (!id) return;
    if (packingOptionIdRef.current && String(packingOptionIdRef.current) === String(id)) return;
    setPackingOptionId(id);
    refreshPackingGroups(id);
  };

  async function refreshPackingGroupsPreview() {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setInboundPlanMissing(true);
      setPackGroupsPreviewError(wizardCopy.missingIds);
      return { ok: false, code: 'MISSING_IDS' };
    }
    if (packingRefreshLockRef.current.inFlight && packingRefreshLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'PACKING_IN_FLIGHT' };
    }
    if (packingPreviewLockRef.current.inFlight && packingPreviewLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'IN_FLIGHT' };
    }
    packingPreviewLockRef.current = { inFlight: true, planId: inboundPlanId };
    setPackGroupsPreviewLoading(true);
    setPackGroupsPreviewError('');
    try {
      const { data, error } = await supabase.functions.invoke('fba-plan-step1-preview', {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          amazon_integration_id: plan?.amazonIntegrationId || plan?.amazon_integration_id || null
        }
      });
      if (error) throw error;
      if (data?.code === 'PACKING_OPTIONS_NOT_READY' || data?.code === 'PACKING_GROUPS_NOT_READY') {
        setInboundPlanMissing(true);
        const msg = data?.message || wizardCopy.packingWait;
        setPackGroupsPreviewError(msg);
        setPackGroupsPreview([]);
        return { ok: false, code: data.code, message: msg };
      }
      if (data?.code === 'PACKING_OPTIONS_NOT_AVAILABLE') {
        setPackGroupsPreviewError(data?.message || 'Amazon did not return packingOptions for preview.');
        setPackGroupsPreview([]);
        return { ok: false, code: data.code, message: data?.message || '' };
      }
      if (Array.isArray(data?.packingGroups)) {
        const normalized = normalizePackGroups(data.packingGroups);
        setPackGroupsPreview(normalized);
        setPackGroupsPreviewError('');
        return { ok: true, packingGroups: normalized };
      }
      setPackGroupsPreview([]);
      setPackGroupsPreviewError(wizardCopy.previewUnavailable);
      return { ok: false, code: 'NO_PREVIEW' };
    } catch (e) {
      const msg = e?.message || 'Preview packing groups failed.';
      setPackGroupsPreviewError(msg);
      setPackGroupsPreview([]);
      return { ok: false, code: 'ERROR', message: msg };
    } finally {
      setPackGroupsPreviewLoading(false);
      packingPreviewLockRef.current = { inFlight: false, planId: inboundPlanId };
      packingPreviewFetchRef.current = false;
    }
  }

  const buildPackingPayload = (groups = packGroupsDecorated) => {
    if (!Array.isArray(groups) || groups.length === 0) {
      return { packingGroups: [], missingGroupId: false };
    }

    const planLabelOwnerBySku = new Map();
    (Array.isArray(plan?.skus) ? plan.skus : []).forEach((sku) => {
      const key = String(sku?.sku || sku?.msku || sku?.SellerSKU || '').trim().toUpperCase();
      if (!key) return;
      if (sku?.labelOwner) planLabelOwnerBySku.set(key, sku.labelOwner);
    });

    const packingGroupsPayload = [];
    let missingGroupId = false;

    groups.forEach((g) => {
      const { planGroup } = resolvePlanGroupForPackGroup(g);
      const planBoxesRaw = Array.isArray(planGroup?.boxes) ? planGroup.boxes : [];
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      const planPerBoxDetails = planBoxesRaw.map((box) => ({
        length: box?.length_cm ?? box?.length ?? '',
        width: box?.width_cm ?? box?.width ?? '',
        height: box?.height_cm ?? box?.height ?? '',
        weight: box?.weight_kg ?? box?.weight ?? ''
      }));
      const fallbackDims = planBoxesRaw[0]
        ? {
            length: planBoxesRaw[0]?.length_cm ?? planBoxesRaw[0]?.length ?? '',
            width: planBoxesRaw[0]?.width_cm ?? planBoxesRaw[0]?.width ?? '',
            height: planBoxesRaw[0]?.height_cm ?? planBoxesRaw[0]?.height ?? ''
          }
        : null;
      const fallbackWeight = planBoxesRaw[0]?.weight_kg ?? planBoxesRaw[0]?.weight ?? null;
      const dims = getSafeDims(g.boxDimensions) || getSafeDims(fallbackDims);
      const weight = getPositiveNumber(g.boxWeight) || getPositiveNumber(fallbackWeight);
      const planBoxCount = planBoxesRaw.length || 0;
      const uiBoxCount = Number(g.boxes) || 0;
      // Prefer the user's current UI box count; fall back to plan boxes only if UI has none.
      const count = uiBoxCount > 0 ? uiBoxCount : planBoxCount > 0 ? planBoxCount : 1;
      let normalizedPackMode = g.packMode || "single";
      if (count > 1) normalizedPackMode = "multiple";
      const isMultiple = String(normalizedPackMode || "").toLowerCase() === "multiple";
      const packingGroupId = g.packingGroupId || null;
      const normalizedDims = dims ? { length: dims.length, width: dims.width, height: dims.height, unit: "CM" } : null;
      const normalizedWeight = weight ? { value: weight, unit: "KG" } : null;

      if (!packingGroupId) {
        missingGroupId = true;
        return;
      }
      let normalizedItems = normalizeGroupItemsForUnits(g.items || []);
      if (!normalizedItems.length) {
        const perBoxItems = Array.isArray(g.perBoxItems) ? g.perBoxItems : [];
        const totals = new Map();
        perBoxItems.forEach((box) => {
          Object.entries(box || {}).forEach(([key, qty]) => {
            const skuKey = String(key || '').trim();
            if (!skuKey) return;
            const add = Number(qty || 0) || 0;
            totals.set(skuKey, (totals.get(skuKey) || 0) + add);
          });
        });
        if (totals.size) {
          normalizedItems = Array.from(totals.entries())
            .filter(([, qty]) => qty > 0)
            .map(([sku, quantity]) => ({ sku, quantity }));
        }
      }
      if (planBoxItems.length) {
        const totals = new Map();
        planBoxItems.forEach((box) => {
          Object.entries(box || {}).forEach(([key, qty]) => {
            const skuKey = String(key || '').trim();
            if (!skuKey) return;
            const add = Number(qty || 0) || 0;
            totals.set(skuKey, (totals.get(skuKey) || 0) + add);
          });
        });
        if (totals.size) {
          normalizedItems = Array.from(totals.entries())
            .filter(([, qty]) => qty > 0)
            .map(([sku, quantity]) => ({ sku, quantity }));
        }
      }
      if (!normalizedItems.length) {
        return;
      }

      // Default to BOX_CONTENT_PROVIDED so we don't silently fall back to MANUAL_PROCESS (which drops items).
      const contentInformationSource =
        g.contentInformationSource ||
        (isMultiple ? "BOX_CONTENT_PROVIDED" : "BOX_CONTENT_PROVIDED");
      packingGroupsPayload.push({
        packingGroupId,
        boxes: count,
        packMode: normalizedPackMode,
        dimensions: normalizedDims,
        weight: normalizedWeight,
        contentInformationSource,
        items: normalizedItems.map((it) => ({
          sku: it.sku || it.msku || it.SellerSKU || null,
          quantity: Number(it.quantity || 0) || 0,
          expiration:
            it.expiration ||
            it.expiry ||
            it.expiryDate ||
            it.expirationDate ||
            null,
          prepOwner: it.prepOwner || it.prep_owner || it.prep || null,
          // dacă avem valoarea din Amazon, trimite-o prioritar
          labelOwner:
            it.apiLabelOwner ||
            it.labelOwner ||
            it.label_owner ||
            it.label ||
            (planLabelOwnerBySku.get(String(it.sku || it.msku || it.SellerSKU || '').trim().toUpperCase()) || null)
        })),
        perBoxDetails:
          isMultiple
            ? Array.isArray(g.perBoxDetails) && g.perBoxDetails.length
              ? g.perBoxDetails
              : planPerBoxDetails.length > 1
                ? planPerBoxDetails
                : null
            : null,
        perBoxItems:
          isMultiple
            ? Array.isArray(g.perBoxItems) && g.perBoxItems.length
              ? g.perBoxItems
              : planBoxItems.length > 1
                ? planBoxItems
                : null
            : null
      });
    });

    return { packingGroups: packingGroupsPayload, missingGroupId };
  };

  const buildPackageGroupingsFromBoxPlan = useCallback(() => {
    const groups = step1BoxPlanForMarket?.groups || {};
    const packageGroupings = [];

    Object.entries(groups).forEach(([groupId, groupPlan]) => {
      const boxes = Array.isArray(groupPlan?.boxes) ? groupPlan.boxes : [];
      const itemsPerBox = Array.isArray(groupPlan?.boxItems) ? groupPlan.boxItems : [];

      const normBoxes = boxes
        .map((box, idx) => {
          const dims = {
            length: Number(box?.length_cm || box?.length || 0),
            width: Number(box?.width_cm || box?.width || 0),
            height: Number(box?.height_cm || box?.height || 0),
            unitOfMeasurement: 'CM'
          };
          const weight = {
            value: Number(box?.weight_kg || box?.weight || 0),
            unit: 'KG'
          };
          const content = itemsPerBox[idx] || {};
          const items = Object.entries(content)
            .filter(([, qty]) => Number(qty) > 0)
            .map(([msku, qty]) => ({
              msku,
              quantity: Number(qty)
            }));
          const hasDims =
            Number(dims.length) > 0 && Number(dims.width) > 0 && Number(dims.height) > 0;
          const hasWeight = Number(weight.value) > 0;
          if (!items.length || !hasDims || !hasWeight) return null;
          return {
            dimensions: dims,
            weight,
            quantity: 1,
            items,
            contentInformationSource: 'BOX_CONTENT_PROVIDED'
          };
        })
        .filter(Boolean);

      if (normBoxes.length) {
        packageGroupings.push({
          packingGroupId: groupId,
          boxes: normBoxes
        });
      }
    });

    return packageGroupings;
  }, [step1BoxPlanForMarket?.groups]);

  const submitPackingInformation = async (payload = {}) => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;

    if (!inboundPlanId || !requestId) {
      setPackingSubmitError('Missing inboundPlanId or requestId; finish Step 1 before confirming.');
      return;
    }

    const derivedPayload = buildPackingPayload();
    const packageGroupingsFallback = buildPackageGroupingsFromBoxPlan();
    let packingGroupsPayload =
      Array.isArray(payload.packingGroups) && payload.packingGroups.length ? payload.packingGroups : derivedPayload.packingGroups;

    // dacă UI a trimis un payload manual (include dimensiuni), sincronizăm imediat în state ca să nu le pierdem la refresh
    if (Array.isArray(payload.packingGroups) && payload.packingGroups.length) {
      const asStateShape = payload.packingGroups.map((g, idx) => ({
        id: g.packingGroupId || g.id || `pg-${idx + 1}`,
        packingGroupId: g.packingGroupId || g.id || `pg-${idx + 1}`,
        boxes: g.boxes ?? 1,
        packMode: g.packMode || g.pack_mode || 'single',
        boxDimensions: g.dimensions
          ? { length: g.dimensions.length, width: g.dimensions.width, height: g.dimensions.height }
          : null,
        boxWeight: g.weight?.value ?? g.weight?.amount ?? g.boxWeight ?? g.weight ?? null,
        items: g.items || [],
        perBoxDetails: g.perBoxDetails || g.per_box_details || null,
        perBoxItems: g.perBoxItems || g.per_box_items || null,
        contentInformationSource: g.contentInformationSource || g.content_information_source || null
      }));
      setPackGroups((prev) => mergePackGroups(prev, asStateShape));
    }

    const isFallback = (v) => typeof v === "string" && v.toLowerCase().startsWith("fallback-");
    const hasFallback = packingGroupsPayload.some((g) => isFallback(g.packingGroupId));
    const missingGroupId = derivedPayload.missingGroupId || packingGroupsPayload.some((g) => !g.packingGroupId);
    if ((missingGroupId || hasFallback) && !packageGroupingsFallback.length) {
      setPackingSubmitError('Amazon nu a returnat packingGroupId pentru cutii (packingOptions). Încearcă din nou Step 1b sau setează manual cutiile.');
      return;
    }

    if (!packingGroupsPayload.length && !packageGroupingsFallback.length) {
      setPackingSubmitError('Completează dimensiunile/greutatea cutiilor înainte de a continua.');
      return;
    }
    const invalid = packingGroupsPayload.find((g) => {
      const isMultiple = String(g.packMode || '').toLowerCase() === 'multiple';
      if (isMultiple) {
        const perBox = Array.isArray(g.perBoxDetails) ? g.perBoxDetails : [];
        if (!perBox.length) return true;
        return perBox.some((b) => {
          const l = Number(b?.length || 0);
          const w = Number(b?.width || 0);
          const h = Number(b?.height || 0);
          const wt = Number(b?.weight || 0);
          return !(l > 0 && w > 0 && h > 0 && wt > 0);
        });
      }
      return !(
        Number(g.dimensions?.length) > 0 &&
        Number(g.dimensions?.width) > 0 &&
        Number(g.dimensions?.height) > 0 &&
        Number(g.weight?.value) > 0
      );
    });
    if (invalid) {
      setPackingSubmitError('Dimensiuni/greutate incomplete pentru cutie.');
      return;
    }

    setPackingSubmitLoading(true);
    setPackingSubmitError('');
    try {
      // forțează o reîmprospătare rapidă a packing groups ca să nu trimitem ID-uri vechi
      const refreshRes = await refreshPackingGroups();
      const effectivePackGroups = Array.isArray(refreshRes?.packingGroups)
        ? refreshRes.packingGroups
        : packGroups;
      const effectivePackingOptId =
        refreshRes?.packingOptionId ||
        packingOptionId ||
        plan?.packingOptionId ||
        plan?.packing_option_id ||
        null;
      if (!effectivePackingOptId) {
        throw new Error('Missing packingOptionId accepted by Amazon; refresh Step 1b and try again.');
      }
      const refreshedPayload = buildPackingPayload(effectivePackGroups);
      const refreshedGroups = refreshedPayload.packingGroups;
      if (Array.isArray(payload.packingGroups) && payload.packingGroups.length) {
        const overrideById = new Map(
          payload.packingGroups
            .filter((g) => g?.packingGroupId)
            .map((g) => [String(g.packingGroupId), g])
        );
        packingGroupsPayload = refreshedGroups.map((g) => {
          const override = overrideById.get(String(g.packingGroupId));
          if (!override) return g;
          return {
            ...g,
            boxes: override.boxes ?? g.boxes,
            packMode: override.packMode || override.pack_mode || g.packMode,
            dimensions: override.dimensions || g.dimensions,
            weight: override.weight || g.weight,
            perBoxDetails: override.perBoxDetails || override.per_box_details || g.perBoxDetails,
            perBoxItems: override.perBoxItems || override.per_box_items || g.perBoxItems,
            contentInformationSource:
              override.contentInformationSource || override.content_information_source || g.contentInformationSource
          };
        });
      } else {
        packingGroupsPayload = refreshedGroups;
      }
      if (!refreshRes?.ok) {
        // dacă avem deja packing groups încărcate în UI, nu mai blocăm user-ul; continuăm cu ceea ce avem
        const hasLocalGroups = Array.isArray(packGroups) && packGroups.length > 0;
        if (!hasLocalGroups) {
          const trace = refreshRes?.traceId ? ` TraceId ${refreshRes.traceId}` : '';
          throw new Error(
            refreshRes?.message ||
            `Packing groups are not ready yet.${trace}`
          );
        }
        console.warn('Proceeding with existing packing groups because Amazon refresh not ready', refreshRes);
      }

      const packageGroupings = packageGroupingsFallback.length ? packageGroupingsFallback : null;
      const { data, error } = await supabase.functions.invoke('fba-set-packing-information', {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          packing_option_id: effectivePackingOptId,
          placement_option_id: placementOptId,
          packing_groups: packingGroupsPayload,
          package_groupings: packageGroupings || undefined,
          generate_placement_options: true
        }
      });
      if (error) throw error;
      if (data?.traceId && !import.meta.env.PROD) {
        console.log('setPackingInformation traceId', data.traceId);
      }
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
      completeAndNext('1b');
    } catch (e) {
      setPackingSubmitError(e?.message || 'SetPackingInformation failed.');
    } finally {
      setPackingSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep !== '1b') return;
    if (!autoPackingEnabled || !autoPackingReady) return;
    if (packingSubmitLoading) return;
    const inboundPlanId = resolveInboundPlanId();
    if (!inboundPlanId) return;
    if (autoPackingRef.current.planId !== inboundPlanId) {
      autoPackingRef.current = { planId: inboundPlanId, attempted: false };
    }
    if (autoPackingRef.current.attempted) return;
    autoPackingRef.current.attempted = true;
    const payload = buildPackingPayload(packGroupsForAuto);
    submitPackingInformation({ packingGroups: payload.packingGroups });
  }, [
    currentStep,
    autoPackingEnabled,
    autoPackingReady,
    packingSubmitLoading,
    packGroupsForAuto,
    resolveInboundPlanId,
    submitPackingInformation,
    buildPackingPayload
  ]);

  useEffect(() => {
    if (currentStep !== '2') return;
    const inboundPlanId = resolveInboundPlanId();
    if (!inboundPlanId) return;
    if (autoShipPlanRef.current.planId !== inboundPlanId) {
      autoShipPlanRef.current = { planId: inboundPlanId, attempted: false };
    }
    if (autoShipPlanRef.current.attempted) return;
    const pkgFallback = buildPackageGroupingsFromBoxPlan();
    if (!pkgFallback.length) return;
    const hasShipments = Array.isArray(shipments) && shipments.length > 0;
    if (hasShipments) return;
    autoShipPlanRef.current.attempted = true;
    submitPackingInformation({ packingGroups: [] });
  }, [
    currentStep,
    shipments,
    resolveInboundPlanId,
    buildPackageGroupingsFromBoxPlan,
    submitPackingInformation
  ]);

  async function refreshPackingGroups(selectedPackingOptionId = null) {
    if (typeof window === 'undefined') return { ok: false, code: 'NO_WINDOW' };
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setInboundPlanMissing(true);
      setPackingReadyError(wizardCopy.missingIds);
      return { ok: false, code: 'MISSING_IDS' };
    }
    // păstrăm grupurile existente; doar marcăm loading
    setPackGroupsLoaded(hasRealPackGroups(packGroups));
    if (packingPreviewLockRef.current.inFlight && packingPreviewLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'PREVIEW_IN_FLIGHT' };
    }
    if (packingRefreshLockRef.current.inFlight && packingRefreshLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'IN_FLIGHT' };
    }
    packingRefreshLockRef.current = { inFlight: true, planId: inboundPlanId };
    setPackingRefreshLoading(true);
    setPackingReadyError('');
    const attemptFetch = async () => {
      // trimite ultimele valori din UI ca snapshot override (dims/weight/boxes)
      const uiPayload = buildPackingPayload();
      const packingGroupUpdates = {};
      (uiPayload.packingGroups || []).forEach((g) => {
        if (!g?.packingGroupId) return;
        const next = {};
        const dims = g.dimensions;
        const length = Number(dims?.length || 0);
        const width = Number(dims?.width || 0);
        const height = Number(dims?.height || 0);
        if (length > 0 && width > 0 && height > 0) {
          next.dimensions = dims;
        }
        const weightVal = Number(g?.weight?.value ?? g?.weight?.amount ?? g?.weight ?? 0);
        if (weightVal > 0) {
          next.weight = g.weight;
        }
        const boxes = Number(g?.boxes || 0);
        if (boxes > 0) {
          next.boxes = boxes;
        }
        if (Array.isArray(g?.perBoxDetails) && g.perBoxDetails.length) {
          next.perBoxDetails = g.perBoxDetails;
        }
        if (Array.isArray(g?.perBoxItems) && g.perBoxItems.length) {
          next.perBoxItems = g.perBoxItems;
        }
        if (g?.contentInformationSource) {
          next.contentInformationSource = g.contentInformationSource;
        }
        if (g?.packMode) {
          next.packMode = g.packMode;
        }
        if (Object.keys(next).length) {
          packingGroupUpdates[String(g.packingGroupId)] = next;
        }
      });
      const resetSnapshot = false;
      const { data, error } = await supabase.functions.invoke('fba-plan-step1b', {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          amazon_integration_id: plan?.amazonIntegrationId || plan?.amazon_integration_id || null,
          packing_option_id: selectedPackingOptionId || packingOptionId || null,
          reset_snapshot: resetSnapshot,
          packing_group_updates: packingGroupUpdates
        }
      });
      if (error) throw error;
      if (Array.isArray(data?.packingOptions)) setPackingOptions(sanitizePackingOptions(data.packingOptions));
      if (data?.code === 'PACKING_GROUPS_NOT_READY') {
        const trace = data?.traceId || data?.trace_id || null;
        const msg = data?.message || wizardCopy.packingWait;
        setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
        setInboundPlanMissing(true);
        if (!hasRealPackGroups(packGroups)) {
          setPackGroups([]); // nu afișăm nimic local dacă nu avem packing groups reale
        }
        return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: msg, traceId: trace };
      }
      if (data?.code === 'PACKING_OPTIONS_NOT_READY') {
        const trace = data?.traceId || data?.trace_id || null;
        const msg = data?.message || wizardCopy.inboundPlanEmpty;
        setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
        setInboundPlanMissing(true);
        if (!hasRealPackGroups(packGroups)) {
          setPackGroups([]);
        }
        return { ok: false, code: 'PACKING_OPTIONS_NOT_READY', message: msg, traceId: trace };
      }
      if (data?.code === 'PLACEMENT_ALREADY_ACCEPTED') {
        const cachedGroups = Array.isArray(data?.packingGroups) ? data.packingGroups : [];
        const trace = data?.traceId || data?.trace_id || null;
        if (!cachedGroups.length) {
          const msg =
            'Plan is already ACCEPTED in Amazon and packing groups cannot be regenerated. Retry only if you have saved packing groups.';
          setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
          return { ok: false, code: 'PLACEMENT_ALREADY_ACCEPTED', message: msg, traceId: trace };
        }
        setPackingReadyError('Plan is already ACCEPTED in Amazon; using saved packing groups.');
        if (data?.packingOptionId) setPackingOptionId(data.packingOptionId);
        if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
        const normalized = normalizePackGroups(cachedGroups);
        setPackGroupsLoaded(true);
        setPackGroups((prev) => mergePackGroups(prev, normalized));
        if (Array.isArray(data?.shipments)) setShipments(data.shipments);
        setPlanError('');
        if (Array.isArray(data?.quantityMismatches) && data.quantityMismatches.length) {
          const first = data.quantityMismatches[0];
          const msg = `Quantities differ between UI and Amazon (${first.sku}: Amazon ${first.amazon} vs confirmed ${first.confirmed}).`;
          setPackGroups([]); // nu folosi grupuri Amazon cu cantități vechi
          setPackingReadyError(msg);
          return { ok: false, code: 'PACKING_QTY_MISMATCH', quantityMismatches: data.quantityMismatches };
        }
        return { ok: true, code: 'PLACEMENT_ALREADY_ACCEPTED', packingOptionId: data?.packingOptionId || null, packingGroups: normalized };
      }
      if (data?.packingOptionId) setPackingOptionId(data.packingOptionId);
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
      if (Array.isArray(data?.packingOptions)) setPackingOptions(sanitizePackingOptions(data.packingOptions));
      if (Array.isArray(data?.packingGroups)) {
        const normalized = normalizePackGroups(data.packingGroups);
        const filtered = normalized.filter((g) => g.packingGroupId && !isFallbackId(g.packingGroupId));
        if (!filtered.length) {
          const msg = 'Packing groups are missing from Amazon response. Try again in a few seconds.';
          setPackingReadyError(msg);
          return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: msg };
        } else {
          setPackGroupsLoaded(true);
        }
          // combinăm grupurile noi de la Amazon cu valorile introduse în UI (dimensiuni/greutate) ca să nu le pierdem
          setPackGroups((prev) => mergePackGroups(prev, filtered));
          setPackingReadyError('');
          // sincronizează packingOptionId în plan ca să nu trimitem un ID vechi la setPackingInformation
          setPlan((prev) => ({
            ...prev,
            packingOptionId: data?.packingOptionId || prev?.packingOptionId || null,
            packing_option_id: data?.packingOptionId || prev?.packing_option_id || null,
            inboundPlanId,
            inbound_plan_id: inboundPlanId
          }));
          if (Array.isArray(data?.quantityMismatches) && data.quantityMismatches.length) {
            const first = data.quantityMismatches[0];
            const msg = `Quantities differ between UI and Amazon (${first.sku}: Amazon ${first.amazon} vs confirmed ${first.confirmed}).`;
            setPackGroups([]); // evităm afișarea grupurilor cu cantități vechi
            setPackingReadyError(msg);
            return { ok: false, code: 'PACKING_QTY_MISMATCH', quantityMismatches: data.quantityMismatches };
          }
          return { ok: true, packingOptionId: data?.packingOptionId || null, packingGroups: filtered };
        }
        if (Array.isArray(data?.shipments)) setShipments(data.shipments);
        setPlanError('');
        return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: 'Packing groups are missing from Amazon response.' };
    };

    try {
      // Reîncercări agresive dacă Amazon întârzie packingGroupIds.
      const maxAttempts = 8;
      for (let i = 1; i <= maxAttempts; i += 1) {
        const res = await attemptFetch();
        if (res?.ok) return res;
        if (res?.code !== 'PACKING_GROUPS_NOT_READY') return res;
        // backoff mic înainte de următoarea încercare
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 800 * i));
      }
      return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: 'Amazon did not return packing groups after multiple attempts.' };
    } catch (e) {
      const msg = e?.message || 'Could not reload packing groups.';
      setPackingReadyError(msg);
      return { ok: false, code: 'ERROR', message: msg };
    } finally {
      setPackingRefreshLoading(false);
      packingRefreshLockRef.current = { inFlight: false, planId: null };
    }
  }

  useEffect(() => {
    if (currentStep !== '1') return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (allowNoInboundPlan && !inboundPlanId) return;
    if (!inboundPlanId || !requestId) return;
    if (packGroupsPreviewError) return;
    if (Array.isArray(packGroupsPreview) && packGroupsPreview.length) return;
    if (packGroupsPreviewLoading || packingPreviewFetchRef.current) return;
    packingPreviewFetchRef.current = true;
    refreshPackingGroupsPreview();
  }, [
    currentStep,
    packGroupsPreview,
    packGroupsPreviewLoading,
    packGroupsPreviewError,
    resolveInboundPlanId,
    resolveRequestId
  ]);

  const buildShipmentConfigs = () => {
    if (!Array.isArray(packGroups)) return [];
    const inboundPlanId = resolveInboundPlanId();
    if (allowNoInboundPlan && !inboundPlanId) return [];
    const shipDateIso = normalizeShipDate(shipmentMode?.deliveryDate) || null;
    const windowStart = normalizeShipDate(shipmentMode?.deliveryWindowStart) || null;
    const windowEnd = normalizeShipDate(shipmentMode?.deliveryWindowEnd) || null;
    const usePallets = shipmentMode?.method && shipmentMode.method !== 'SPD';
    const palletPayload = usePallets
      ? [
          {
            quantity: Number(palletDetails.quantity || 1),
            dimensions: {
              length: Number(palletDetails.length || 0),
              width: Number(palletDetails.width || 0),
              height: Number(palletDetails.height || 0),
              unit: 'CM'
            },
            weight: {
              value: Number(palletDetails.weight || 0),
              unit: 'KG'
            },
            stackability: palletDetails.stackability || 'STACKABLE'
          }
        ]
      : null;
    const freightInformation = usePallets
      ? {
          declaredValue: {
            amount: Number(palletDetails.declaredValue || 0),
            code: palletDetails.declaredValueCurrency || 'EUR'
          },
          freightClass: palletDetails.freightClass || null
        }
      : null;

    const shipmentIdForGroup = (g, idx) => {
      if (g?.shipmentId || g?.shipment_id) return g.shipmentId || g.shipment_id;
      const fromApi = Array.isArray(shipments) ? shipments?.[idx] || shipments?.[0] : null;
      if (fromApi?.shipmentId || fromApi?.id) return fromApi.shipmentId || fromApi.id;
      return `s-${idx + 1}`;
    };

    const byShipment = new Map();
    packGroups.forEach((g, idx) => {
      const { planGroup } = resolvePlanGroupForPackGroup(g);
      const planBoxesRaw = Array.isArray(planGroup?.boxes) ? planGroup.boxes : [];
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      const boxContentSummary = (boxIdx) => {
        const raw = planBoxItems?.[boxIdx] || {};
        const entries = Object.entries(raw).filter(([, qty]) => Number(qty || 0) > 0);
        const units = entries.reduce((sum, [, qty]) => sum + (Number(qty || 0) || 0), 0);
        return {
          contentUnits: units > 0 ? units : null,
          contentSkuCount: entries.length > 0 ? entries.length : null
        };
      };
      const planPerBoxDetails = planBoxesRaw
        .map((box) => {
          const length = getPositiveNumber(box?.length_cm ?? box?.length);
          const width = getPositiveNumber(box?.width_cm ?? box?.width);
          const height = getPositiveNumber(box?.height_cm ?? box?.height);
          const weight = getPositiveNumber(box?.weight_kg ?? box?.weight);
          if (!length || !width || !height || !weight) return null;
          return { length, width, height, weight };
        })
        .filter(Boolean);
      const dims = getSafeDims(g.boxDimensions) || (planPerBoxDetails[0] ? {
        length: planPerBoxDetails[0].length,
        width: planPerBoxDetails[0].width,
        height: planPerBoxDetails[0].height
      } : null);
      const weight = getPositiveNumber(g.boxWeight) || (planPerBoxDetails[0] ? planPerBoxDetails[0].weight : null);
      const fallbackBoxCount = planBoxesRaw.length > 0 ? planBoxesRaw.length : null;
      const boxCount = Math.max(1, Number(g.boxes) || fallbackBoxCount || 1);
      const hasPackageSpec = Boolean(dims && weight);
      const pkg = hasPackageSpec
        ? {
            dimensions: { length: dims.length, width: dims.width, height: dims.height, unit: "CM" },
            weight: { value: weight, unit: "KG" }
          }
        : null;
      const isMultiple = String(g?.packMode || '').toLowerCase() === 'multiple';
      const perBoxDetails = Array.isArray(g?.perBoxDetails) && g.perBoxDetails.length
        ? g.perBoxDetails
        : planPerBoxDetails;
      const perBoxPackages = isMultiple && perBoxDetails.length
        ? perBoxDetails
            .map((box, boxIdx) => {
              const perDims = getSafeDims(box);
              const perWeight = getPositiveNumber(box?.weight);
              if (!perDims || !perWeight) return null;
              const summary = boxContentSummary(boxIdx);
              return {
                dimensions: { length: perDims.length, width: perDims.width, height: perDims.height, unit: "CM" },
                weight: { value: perWeight, unit: "KG" },
                ...(summary.contentUnits ? { contentUnits: summary.contentUnits } : {}),
                ...(summary.contentSkuCount ? { contentSkuCount: summary.contentSkuCount } : {})
              };
            })
            .filter(Boolean)
        : [];
      const fallbackPerBoxPackages = !perBoxPackages.length && planPerBoxDetails.length
        ? planPerBoxDetails.map((box, boxIdx) => {
            const summary = boxContentSummary(boxIdx);
            return {
              dimensions: { length: box.length, width: box.width, height: box.height, unit: "CM" },
              weight: { value: box.weight, unit: "KG" },
              ...(summary.contentUnits ? { contentUnits: summary.contentUnits } : {}),
              ...(summary.contentSkuCount ? { contentSkuCount: summary.contentSkuCount } : {})
            };
          })
        : [];
      const packingGroupId = g.packingGroupId || null;
      if (!packingGroupId) return;
      const shId = shipmentIdForGroup(g, idx);
      const manualReady = readyWindowByShipment?.[shId] || {};
      const manualStart = normalizeShipDate(manualReady.start) || null;
      const manualEnd = normalizeShipDate(manualReady.end) || null;
      const requireEnd = isLtlFtl(shipmentMode?.method);
      const existing = byShipment.get(shId) || {
        shipmentId: shId,
        packages: [],
        pallets: null,
        freightInformation: null,
        readyToShipWindow: manualStart || windowStart || windowEnd ? {
          start: manualStart ? normalizeReadyStartIso(manualStart) : windowStart ? normalizeReadyStartIso(windowStart) : null,
          ...(requireEnd
            ? {
                end: manualEnd
                  ? normalizeReadyStartIso(manualEnd)
                  : windowEnd
                    ? normalizeReadyStartIso(windowEnd)
                    : null
              }
            : {})
        } : null
      };
      if (usePallets) {
        existing.pallets = palletPayload;
        existing.freightInformation = freightInformation;
      } else if (perBoxPackages.length) {
        existing.packages.push(...perBoxPackages);
      } else if (fallbackPerBoxPackages.length) {
        existing.packages.push(...fallbackPerBoxPackages);
      } else if (pkg) {
        for (let i = 0; i < boxCount; i += 1) {
          const summary = boxContentSummary(i);
          existing.packages.push({
            ...pkg,
            ...(summary.contentUnits ? { contentUnits: summary.contentUnits } : {}),
            ...(summary.contentSkuCount ? { contentSkuCount: summary.contentSkuCount } : {})
          });
        }
      }
      byShipment.set(shId, existing);
    });

    return Array.from(byShipment.values());
  };

  const resolveContactInformation = () => {
    const candidates = [
      plan?.sourceAddress,
      plan?.shipFrom,
      plan?.shipFrom?.address,
      shipments?.[0]?.shipFromAddress,
      shipments?.[0]?.sourceAddress,
      shipments?.[0]?.source?.address
    ].filter(Boolean);

    const normalize = (src = {}) => {
      const name =
        src.name ||
        src.contactName ||
        src.companyName ||
        src.person ||
        null;
      const phoneNumber =
        src.phoneNumber ||
        src.phone ||
        src.phone_number ||
        null;
      const email =
        src.email ||
        src.emailAddress ||
        src.email_address ||
        null;
      if (!name || !phoneNumber || !email) return null;
      return {
        name: String(name).trim(),
        phoneNumber: String(phoneNumber).trim(),
        email: String(email).trim()
      };
    };

    for (const src of candidates) {
      const info = normalize(src);
      if (info) return info;
    }
    return null;
  };

  const mergeShipFromWithSource = (shipFrom, sourceAddress) => {
    if (!shipFrom || typeof shipFrom !== 'object' || !sourceAddress) return shipFrom;
    return {
      ...shipFrom,
      phoneNumber: shipFrom.phoneNumber || sourceAddress.phoneNumber || null,
      email: shipFrom.email || sourceAddress.email || null,
      name: shipFrom.name || sourceAddress.name || null
    };
  };

  const fetchCooldownRef = useRef(0);

  async function fetchShippingOptions({ force = false } = {}) {
    if (typeof window === 'undefined') return; // rulează doar în browser
    if (shippingFetchLockRef.current.inFlight) return Promise.resolve();
    const now = Date.now();
    if (!force && now - fetchCooldownRef.current < 2000) return Promise.resolve(); // hard throttle 1 call / 2s
    fetchCooldownRef.current = now;
    const inboundPlanId = resolveInboundPlanId();
    let placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setShippingError('Missing inboundPlanId or requestId; cannot request shipping options.');
      return;
    }
    const missingReady = (shipments || []).some((sh) => {
      const shKey = String(sh?.id || sh?.shipmentId || '').trim();
      const rw = readyWindowByShipment?.[shKey] || {};
      if (!shKey || !rw.start) return true;
      return false;
    });
    if (missingReady) {
      setShippingError('Completează “Ready to ship” (start) pentru toate expedierile înainte de a cere opțiuni de curier.');
      return;
    }

    if (!Array.isArray(packGroups) || packGroups.length === 0) {
      setShippingError('We do not have packing groups yet. Run Step 1b again to get packingOptions before shipping.');
      return;
    }

    const missingPackingGroupId = (packGroups || []).some((g) => !g.packingGroupId || isFallbackId(g.packingGroupId) || isFallbackId(g.id));
    if (missingPackingGroupId) {
      setShippingError('Packing groups do not have a valid packingGroupId from Amazon. Run Step 1b again to get packingOptions.');
      return;
    }

    // placementOptionId poate lipsi; îl generează backend-ul în Step 2 (generatePlacementOptions)

    if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
      const palletError = validatePalletDetails();
      if (palletError) {
        setShippingError(palletError);
        return;
      }
    } else {
      // guard: avem nevoie de greutate + dimensiuni pentru toate grupurile
      const missingPack = (packGroups || []).find((g) => {
        const isMultiple = String(g?.packMode || '').toLowerCase() === 'multiple';
        if (isMultiple) {
          const perBox = Array.isArray(g?.perBoxDetails) ? g.perBoxDetails : [];
          if (!perBox.length) return true;
          return perBox.some((b) => {
            const perDims = getSafeDims(b);
            const perWeight = getPositiveNumber(b?.weight);
            return !(perDims && perWeight);
          });
        }
        const dims = getSafeDims(g.boxDimensions);
        const w = getPositiveNumber(g.boxWeight);
        return !(dims && w);
      });
      if (missingPack) {
        if (!import.meta.env.PROD) {
          console.log('Step2 missing pack details', (packGroups || []).map((g) => ({
            packingGroupId: g?.packingGroupId || g?.id || null,
            packMode: g?.packMode || null,
            perBoxDetailsCount: Array.isArray(g?.perBoxDetails) ? g.perBoxDetails.length : 0,
            boxDimensions: g?.boxDimensions || null,
            boxWeight: g?.boxWeight ?? null
          })));
        }
        setShippingError('Fill in weight and dimensions (L/W/H) for all boxes before requesting rates.');
        return;
      }
    }
    const windowError = validateDeliveryWindow(false);
    if (windowError) {
      setShippingError(windowError);
      return;
    }

    const configs = buildShipmentConfigs();
    const missingReadyConfirm = configs.some((cfg) => {
      const win = cfg?.readyToShipWindow || {};
      if (!win.start) return true;
      return false;
    });
    if (missingReadyConfirm) {
      setShippingError('Adaugă “Ready to ship” (start) pentru fiecare shipment înainte de confirmare.');
      return;
    }
    const contactInformation = resolveContactInformation();
    const requestKey = JSON.stringify({
      requestId,
      inboundPlanId,
      placementOptId,
      packingOptionId: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
      shippingMode: shipmentMode?.method || null,
      shipDate: normalizeShipDate(shipmentMode?.deliveryDate) || null,
      deliveryWindowStart: normalizeShipDate(shipmentMode?.deliveryWindowStart) || null,
      deliveryWindowEnd: normalizeShipDate(shipmentMode?.deliveryWindowEnd) || null,
      configsCount: configs.length,
      selectedTransportationOptionId
    });
    const now2 = Date.now();
    if (
      requestKey === shippingFetchLockRef.current.lastKey &&
      now2 - shippingFetchLockRef.current.lastAt < 4000
    ) {
      return Promise.resolve();
    }
    shippingFetchLockRef.current.inFlight = true;
    setShippingLoading(true);
    setShippingError('');
    try {
      // log local pentru debug (nu trimite date sensibile)
      if (!import.meta.env.PROD) {
        console.log('Step2 invoke fba-step2-confirm-shipping', {
          requestId,
          inboundPlanId,
          placementOptionId: placementOptId,
          configsCount: configs.length,
          selectedTransportationOptionId
        });
      }
      const { data: json, error } = await supabase.functions.invoke("fba-step2-confirm-shipping", {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptId,
          packing_option_id: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
          shipping_mode: shipmentMode?.method || null,
          ...(contactInformation ? { contact_information: contactInformation } : {}),
          shipment_transportation_configurations: configs,
          ship_date: normalizeShipDate(shipmentMode?.deliveryDate) || null,
          delivery_window_start: normalizeShipDate(shipmentMode?.deliveryWindowStart) || null,
          delivery_window_end: normalizeShipDate(shipmentMode?.deliveryWindowEnd) || null,
          transportation_option_id: selectedTransportationOptionId,
          auto_confirm_placement: true,
          confirm: false
        }
      });
      if (error) throw error;
      if (json?.error) {
        if (
          json?.code === 'SHIPMENTS_PENDING' ||
          json?.code === 'SHIPMENTS_PENDING_FOR_GENERATE_TRANSPORT' ||
          json?.code === 'TRANSPORTATION_OPTIONS_PENDING' ||
          json?.code === 'TRANSPORTATION_OPTIONS_UNKNOWN_STATE'
        ) {
          const maxRetries = 5;
          const nextDelay = Number(json?.retryAfterMs || 5000);
          const attempt = shippingRetryRef.current + 1;
          if (attempt <= maxRetries) {
            shippingRetryRef.current = attempt;
            setShippingError(`Amazon is processing the request... attempt ${attempt}/${maxRetries}. Will retry automatically.`);
            if (shippingRetryTimerRef.current) clearTimeout(shippingRetryTimerRef.current);
            shippingRetryTimerRef.current = setTimeout(() => {
              fetchShippingOptions();
            }, nextDelay);
            return;
          }
          setShippingError('Amazon is still processing options. Retry manually in a few seconds.');
          return;
        }
        setShippingError(json.error);
        setShippingOptions([]);
        setShippingSummary(null);
        return;
      }
      setShippingOptions(aggregateTransportationOptions(json.options || [], json.summary || null));
      setShippingSummary(json.summary || null);
      if (json?.selectedTransportationOptionId) {
        setSelectedTransportationOptionId(json.selectedTransportationOptionId);
      }
      shippingRetryRef.current = 0;
      if (json?.summary?.alreadyConfirmed) {
        setShippingConfirmed(true);
        setCarrierTouched(true);
        setCompletedSteps((prev) => (prev.includes('2') ? prev : [...prev, '2']));
      }
      if (Array.isArray(json.shipments) && json.shipments.length) {
        const fallbackShipments = deriveShipmentsFromPacking(shipments);
        const fallbackById = new Map();
        (fallbackShipments || []).forEach((sh, idx) => {
          const id = sh?.id || sh?.shipmentId || sh?.packingGroupId || null;
          if (id) fallbackById.set(String(id), sh);
          if (sh?.shipmentId) fallbackById.set(String(sh.shipmentId), sh);
          fallbackById.set(`index:${idx}`, sh);
        });
        setShipments(
          json.shipments.map((s, idx) => {
            const key = String(s?.id || s?.shipmentId || "");
            const fb =
              fallbackById.get(key) ||
              fallbackById.get(String(s?.packingGroupId || "")) ||
              fallbackById.get(`index:${idx}`) ||
              {};
            return {
              ...fb,
              ...s,
              units: resolveShipmentUnits(s, fb, idx, fallbackShipments),
              weight: s.weight ?? fb.weight ?? null,
              source: "api"
            };
          })
        );
      }
    } catch (e) {
      const parsed = await extractFunctionInvokeError(e);
      if (parsed?.code === 'INBOUND_PLAN_MISMATCH') {
        setSelectedTransportationOptionId(null);
        setShippingOptions([]);
        setShippingSummary(null);
        setPlanLoaded(false); // trigger reload so UI syncs requestId/inboundPlanId
        setShippingError('Inbound plan s-a schimbat pe server. Reîncarc planul, apoi încearcă din nou Step 2.');
        return;
      }
      const detail = parsed?.message || "Failed to load shipping options";
      console.error("fetchShippingOptions failed", e);
      setShippingError(detail);
    } finally {
      setShippingLoading(false);
      shippingFetchLockRef.current.lastKey = requestKey;
      shippingFetchLockRef.current.lastAt = Date.now();
      shippingFetchLockRef.current.inFlight = false;
    }
  };

  const ensureOptionsAvailable = async () => {
    const countBefore = Array.isArray(shippingOptions) ? shippingOptions.length : 0;
    if (!countBefore) {
      await fetchShippingOptions({ force: true });
    }
    const opts = Array.isArray(shippingOptionsRef.current) ? shippingOptionsRef.current : [];
    if (!opts.length) {
      setShippingError('Nu există opțiuni de curier încă. Completează datele și încearcă din nou.');
      return false;
    }
    if (!selectedTransportationOptionId && opts.length === 1) {
      const only = opts[0];
      setSelectedTransportationOptionId(
        only.id || only.transportationOptionId || only.optionId || only.raw?.transportationOptionId || null
      );
    }
    return true;
  };

  useEffect(() => {
    if (!selectedTransportationOptionId) return;
    const exists = (shippingOptions || []).some((opt) => opt?.id === selectedTransportationOptionId);
    if (exists) return;
    const signature = selectedOptionSignatureRef.current;
    if (signature) {
      const match = (shippingOptions || []).find((opt) => {
        const optMode = normalizeOptionMode(opt.mode || opt.shippingMode);
        const optSolution = String(opt?.shippingSolution || opt?.raw?.shippingSolution || '').toUpperCase();
        const optCarrierName = String(opt?.carrierName || opt?.raw?.carrier?.name || '').trim().toUpperCase();
        const optCarrierCode = String(opt?.raw?.carrier?.alphaCode || '').trim().toUpperCase();
        return (
          Boolean(opt?.partnered) === signature.partnered &&
          (signature.mode ? optMode === signature.mode : true) &&
          (signature.shippingSolution ? optSolution === signature.shippingSolution : true) &&
          (signature.carrierCode
            ? optCarrierCode === signature.carrierCode
            : signature.carrierName
              ? optCarrierName === signature.carrierName
              : true)
        );
      });
      if (match?.id) {
        setSelectedTransportationOptionId(match.id);
        return;
      }
    }
    setSelectedTransportationOptionId(null);
  }, [shippingOptions, selectedTransportationOptionId]);

  const confirmShippingOptions = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const placementOptId = placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    if (!inboundPlanId || !requestId) {
      setShippingError('Missing inboundPlanId or requestId to confirm shipping.');
      return;
    }
    await ensureOptionsAvailable();
    let latestOptions = Array.isArray(shippingOptionsRef.current) ? shippingOptionsRef.current : [];
    let selectedOpt = latestOptions.find((opt) => opt?.id === selectedTransportationOptionId);
    // Refresh only if current selection is missing from local options.
    // This avoids a full options re-fetch on every confirm click.
    if (!selectedOpt) {
      await fetchShippingOptions({ force: true });
      latestOptions = Array.isArray(shippingOptionsRef.current) ? shippingOptionsRef.current : [];
      selectedOpt = latestOptions.find((opt) => opt?.id === selectedTransportationOptionId);
    }
    if (!selectedOpt) {
      // dacă există doar una, o selectăm automat aici
      if (Array.isArray(latestOptions) && latestOptions.length === 1) {
        selectedOpt = latestOptions[0];
        setSelectedTransportationOptionId(selectedOpt.id || selectedOpt.transportationOptionId || selectedOpt.optionId || null);
      }
    }
    if (!selectedOpt) {
      setShippingError('Selectează o opțiune de curier înainte de confirmare.');
      return;
    }
    const enforcePartneredOnly = Boolean(forcePartneredOnly || selectedOpt?.partnered);
    const signature = selectedOptionSignatureRef.current || {};
    const optionShipmentId = String(selectedOpt?.shipmentId || selectedOpt?.raw?.shipmentId || '').trim();
    const shipmentIds = Array.isArray(shipments)
      ? shipments.map((s) => String(s.id || s.shipmentId || '')).filter(Boolean)
      : [];
    if (optionShipmentId && shipmentIds.length && !shipmentIds.includes(optionShipmentId)) {
      setShippingError('Shipping options are stale for this shipment. Regenerate and reselect.');
      await fetchShippingOptions();
      return;
    }
    if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
      const palletError = validatePalletDetails();
      if (palletError) {
        setShippingError(palletError);
        return;
      }
    }
    const windowError = validateDeliveryWindow(true);
    if (windowError) {
      setShippingError(windowError);
      return;
    }
    setShippingConfirming(true);
    setShippingError('');
    try {
      const configs = buildShipmentConfigs();
      if (!configs.length) {
        setShippingConfirming(false);
        setShippingError('Nu există pachete/paleți validați pentru confirmare (lipsește greutate/dimensiuni). Completează packing și reîncearcă.');
        return;
      }
      const shipDateIso = normalizeShipDate(shipmentMode?.deliveryDate) || null;
      let windowStart = normalizeShipDate(shipmentMode?.deliveryWindowStart);
      let windowEnd = normalizeShipDate(shipmentMode?.deliveryWindowEnd);
      const contactInformation = resolveContactInformation();
      const { data: json, error } = await supabase.functions.invoke("fba-step2-confirm-shipping", {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptId,
          packing_option_id: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
          shipping_mode: shipmentMode?.method || null,
          ...(contactInformation ? { contact_information: contactInformation } : {}),
          shipment_transportation_configurations: configs,
          ship_date: shipDateIso,
          delivery_window_start: windowStart,
          delivery_window_end: windowEnd,
          transportation_option_id: selectedTransportationOptionId,
          force_partnered_only: enforcePartneredOnly,
          selected_partnered: signature?.partnered ?? Boolean(selectedOpt?.partnered),
          selected_shipping_solution:
            signature?.shippingSolution ||
            String(selectedOpt?.shippingSolution || selectedOpt?.raw?.shippingSolution || '').toUpperCase() ||
            null,
          selected_carrier_name:
            signature?.carrierName ||
            String(selectedOpt?.carrierName || selectedOpt?.raw?.carrier?.name || '').trim().toUpperCase() ||
            null,
          selected_carrier_code:
            signature?.carrierCode ||
            String(selectedOpt?.raw?.carrier?.alphaCode || '').trim().toUpperCase() ||
            null,
          selected_mode: signature?.mode || normalizeOptionMode(selectedOpt?.mode || selectedOpt?.shippingMode) || null,
          auto_confirm_placement: true,
          confirm: true
        }
      });
      if (error) throw error;
      if (json?.error) {
        if (
          json?.code === 'SHIPMENTS_PENDING' ||
          json?.code === 'SHIPMENTS_PENDING_FOR_CONFIRM' ||
          json?.code === 'TRANSPORTATION_OPTIONS_PENDING' ||
          json?.code === 'TRANSPORTATION_OPTIONS_UNKNOWN_STATE'
        ) {
          setShippingError('Amazon is still processing the shipment. Retry confirmation in a few seconds.');
          return;
        }
        setShippingError(json.error);
        return;
      }
      if (Array.isArray(json.shipments) && json.shipments.length) {
        const fallbackShipments = deriveShipmentsFromPacking(shipments);
        const fallbackById = new Map();
        (fallbackShipments || []).forEach((sh, idx) => {
          const id = sh?.id || sh?.shipmentId || sh?.packingGroupId || null;
          if (id) fallbackById.set(String(id), sh);
          if (sh?.shipmentId) fallbackById.set(String(sh.shipmentId), sh);
          fallbackById.set(`index:${idx}`, sh);
        });
        setShipments(
          json.shipments.map((s, idx) => {
            const key = String(s?.id || s?.shipmentId || "");
            const fb =
              fallbackById.get(key) ||
              fallbackById.get(String(s?.packingGroupId || "")) ||
              fallbackById.get(`index:${idx}`) ||
              {};
            return {
              ...fb,
              ...s,
              units: resolveShipmentUnits(s, fb, idx, fallbackShipments),
              weight: s.weight ?? fb.weight ?? null,
              source: "api"
            };
          })
        );
      }
      setShippingOptions(aggregateTransportationOptions(json.options || [], json.summary || null));
      setShippingSummary(json.summary || null);
      setShippingConfirmed(true);
      setCarrierTouched(true);
      completeAndNext('2');
    } catch (e) {
      const parsed = await extractFunctionInvokeError(e);
      const payload = parsed?.payload || null;
      const code = parsed?.code || payload?.code || null;
      if (
        code === 'TRANSPORTATION_OPTION_NOT_FOUND' ||
        code === 'TRANSPORTATION_OPTION_NOT_AVAILABLE' ||
        code === 'TRANSPORTATION_OPTION_SHIPMENT_MISMATCH'
      ) {
        const refreshed = aggregateTransportationOptions(payload?.availableOptions || [], payload?.summary || null);
        if (refreshed.length) {
          setShippingOptions(refreshed);
        } else {
          await fetchShippingOptions({ force: true });
        }
        setSelectedTransportationOptionId(null);
      }
      if (code === 'INBOUND_PLAN_MISMATCH') {
        setSelectedTransportationOptionId(null);
        setShippingOptions([]);
        setShippingSummary(null);
        setPlanLoaded(false); // trigger reload so UI syncs requestId/inboundPlanId
      }
      const detail = parsed?.message || payload?.error || "Failed to confirm shipping";
      console.error("confirmShippingOptions failed", e);
      setShippingError(detail);
    } finally {
      setShippingConfirming(false);
    }
  }, [
    buildShipmentConfigs,
    completeAndNext,
    forcePartneredOnly,
    packingOptionId,
    placementOptionId,
    plan?.packingOptionId,
    plan?.packing_option_id,
    plan?.placementOptionId,
    plan?.placement_option_id,
    fetchShippingOptions,
    resolveInboundPlanId,
    resolveRequestId,
    shipmentMode?.carrier?.partnered,
    shipmentMode?.deliveryDate,
    shipmentMode?.method,
    shipments,
    readyWindowByShipment
  ]);


  useEffect(() => {
    if (currentStep !== '2') {
      setStep2Loaded(false);
      return;
    }
    // când intrăm în Step 2, nu precompletăm ship/ETA; lăsăm utilizatorul să seteze manual.
    setShipmentMode((prev) => ({
      ...prev,
      deliveryDate: '',
      deliveryWindowStart: '',
      deliveryWindowEnd: ''
    }));
    if (selectedTransportationOptionId) {
      const opt = (shippingOptions || []).find((o) => o?.id === selectedTransportationOptionId);
      const optShipmentId = String(opt?.shipmentId || opt?.raw?.shipmentId || '').trim();
      const ids = Array.isArray(shipments)
        ? shipments.map((s) => String(s.id || s.shipmentId || '')).filter(Boolean)
        : [];
      if (optShipmentId && ids.length && !ids.includes(optShipmentId)) {
        setSelectedTransportationOptionId(null);
      }
    }
    if (step2Loaded) return;
    if (historyMode && shippingConfirmed && (shippingOptions.length || shippingSummary)) {
      setStep2Loaded(true);
      return;
    }
    // nu mai cerem automat opțiuni; așteptăm să existe ready window și click pe “Generează opțiuni curier”
    setStep2Loaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, step2Loaded, shipmentMode?.deliveryDate]);

  // Prefill ready-to-ship windows from shipments (if backend already has them) and ensure map keys exist.
  useEffect(() => {
    setReadyWindowByShipment((prev) => {
      const next = { ...prev };
      (shipments || []).forEach((s) => {
        const shId = String(s?.id || s?.shipmentId || '').trim();
        if (!shId) return;
        if (!next[shId]) {
          const start =
            normalizeShipDate(s?.readyStart || s?.readyToShipWindow?.start || '') ||
            '';
          const end = normalizeShipDate(s?.readyToShipWindow?.end || '') || '';
          next[shId] = { start, end };
        }
      });
      return next;
    });
  }, [shipments]);

  // Reîncărcarea Step 2 este controlată manual; nu mai resetăm automat pe fiecare schimbare de state,
  // ca să evităm buclele de rerender.

  const formatAddress = (addr = {}) => {
    const parts = [
      addr.name,
      addr.addressLine1 || addr.line1 || addr.address,
      addr.city,
      addr.state || addr.region || addr.county,
      addr.postalCode || addr.zip,
      addr.country
    ]
      .filter(Boolean)
      .join(', ');
    return parts || addr.label || addr.raw || '—';
  };

  const deriveShipmentsFromPacking = (baseShipments = []) => {
    if (!Array.isArray(packGroups) || !packGroups.length) return [];
    const baseList = Array.isArray(baseShipments) ? baseShipments : [];
    return packGroups.map((g, idx) => {
      const boxCount = Math.max(1, Number(g.boxes) || 1);
      const dims = g.boxDimensions || {};
      const base = baseList[idx] || baseList[0] || {};
      const boxesDetail = Array.from({ length: boxCount }, () => ({
        groupId: g.id,
        length: dims.length || null,
        width: dims.width || null,
        height: dims.height || null,
        weight: g.boxWeight || null
      }));
      const totalWeight = boxesDetail.reduce(
        (sum, b) => sum + (getPositiveNumber(b.weight) || 0),
        0
      );

      return {
        id: g?.shipmentId || g?.shipment_id || base?.shipmentId || base?.id || `s-${idx + 1}`,
        name: base?.name || `Shipment #${idx + 1}`,
        from: base?.from || formatAddress(plan?.shipFrom || {}),
        to: base?.to || plan?.marketplace || plan?.destination || '—',
        boxes: boxCount,
        skuCount: Number(g.skuCount || 0) || 0,
        units: Number(g.units || 0) || 0,
        weight: totalWeight || null,
        capability: base?.capability || 'Standard',
        boxesDetail,
        source: 'local'
      };
    });
  };

  // Dacă nu avem shipments din backend, sau avem doar cele derivate local,
  // recalculăm din packGroups + shipFrom, dar evităm bucla prin setShipments(prev => ...).
  useEffect(() => {
    setShipments((prev) => {
      const hasApiShipments =
        Array.isArray(prev) && prev.some((s) => s.source === 'api' || s.confirmed);
      if (hasApiShipments) return prev;

      const derived = deriveShipmentsFromPacking(prev);
      const currentLocal = JSON.stringify((prev || []).filter((s) => s.source === 'local'));
      const nextLocal = JSON.stringify(derived);

      if (currentLocal === nextLocal) return prev;
      return derived;
    });
  }, [packGroups, plan?.shipFrom, plan?.marketplace]);

  const handleCarrierChange = (carrier) => {
    setCarrierTouched(true);
    setShipmentMode((prev) => ({ ...prev, carrier }));
    invalidateFrom('2');
  };

  const handleModeChange = (mode) => {
    setShipmentMode((prev) => ({ ...prev, method: mode }));
    invalidateFrom('2');
  };

  const normalizeUiMode = (mode) => {
    const up = String(mode || '').toUpperCase();
    if (!up) return null;
    if (up === 'GROUND_SMALL_PARCEL') return 'SPD';
    if (up === 'FREIGHT_LTL') return 'LTL';
    if (up === 'FREIGHT_FTL') return 'FTL';
    return up;
  };

  const normalizeShipmentModeFromData = (mode) => {
    if (!mode) return mode;
    const normalized = { ...mode };
    if (normalized?.method) {
      normalized.method = normalizeUiMode(normalized.method);
    }
    if (normalized?.carrier) {
      const name = String(normalized.carrier.name || '').trim();
      if (normalized.carrier.partnered === false && !name) {
        normalized.carrier = null;
      }
    }
    return normalized;
  };

  const normalizeOptionMode = (mode) => {
    const up = String(mode || '').toUpperCase();
    if (!up) return null;
    if (up === 'GROUND_SMALL_PARCEL') return 'SPD';
    if (up === 'FREIGHT_LTL') return 'LTL';
    if (up === 'FREIGHT_FTL') return 'FTL';
    return up;
  };

  const handleTransportationOptionSelect = (opt) => {
    if (!opt?.id) return;
    setSelectedTransportationOptionId(opt.id);
    const nextMethod = normalizeOptionMode(opt.mode || opt.shippingMode);
    selectedOptionSignatureRef.current = {
      mode: nextMethod || null,
      partnered: Boolean(opt.partnered),
      shippingSolution: String(opt?.shippingSolution || opt?.raw?.shippingSolution || '').toUpperCase(),
      carrierName: String(opt?.carrierName || opt?.raw?.carrier?.name || '').trim().toUpperCase(),
      carrierCode: String(opt?.raw?.carrier?.alphaCode || '').trim().toUpperCase()
    };
    setShipmentMode((prev) => ({
      ...prev,
      method: nextMethod || prev.method,
      carrier: {
        partnered: Boolean(opt.partnered),
        name: opt.carrierName || '',
        rate: typeof opt.charge === 'number' ? opt.charge : prev?.carrier?.rate ?? null
      }
    }));
    setCarrierTouched(true);
  };

  const validatePalletDetails = () => {
    if (!shipmentMode?.method || shipmentMode.method === 'SPD') return null;
    const qty = Number(palletDetails.quantity || 0);
    const length = Number(palletDetails.length || 0);
    const width = Number(palletDetails.width || 0);
    const height = Number(palletDetails.height || 0);
    const weight = Number(palletDetails.weight || 0);
    const declaredValue = Number(palletDetails.declaredValue || 0);
    if (!(qty > 0 && length > 0 && width > 0 && height > 0 && weight > 0)) {
      return 'Complete pallet quantity, dimensions and weight for LTL/FTL.';
    }
    if (!(declaredValue > 0) || !palletDetails.freightClass) {
      return 'Complete freight class and declared value for LTL/FTL.';
    }
    return null;
  };

  const validateDeliveryWindow = (strict = false) => {
    const selectedOpt = (shippingOptions || []).find((opt) => opt?.id === selectedTransportationOptionId);
    const isPartnered = detectPartneredOption(selectedOpt);
    if (!selectedOpt || isPartnered) return null;
    const start = shipmentMode?.deliveryWindowStart || '';
    const end = shipmentMode?.deliveryWindowEnd || '';
    if (strict && !start) {
      return 'Completează data de start a ferestrei de livrare (ETA) pentru transport non-partener.';
    }
    if (start && shipmentMode?.deliveryDate) {
      const sd = new Date(start);
      const ship = new Date(shipmentMode.deliveryDate);
      if (sd.getTime() < ship.getTime()) {
        return 'Data de sosire estimată trebuie să fie după ship date.';
      }
    }
    if (end && start) {
      const sd = new Date(start);
      const ed = new Date(end);
      if (ed.getTime() < sd.getTime()) {
        return 'Data de sfârșit a ferestrei nu poate fi înainte de start.';
      }
    }
    return null;
  };

  const formatToPageType = (format, partnered) => {
    if (format === 'letter') {
      return partnered ? 'PackageLabel_Letter_2' : 'PackageLabel_Letter_4';
    }
    if (format === 'a4') return 'PackageLabel_A4_2';
    return partnered ? 'PackageLabel_Thermal' : 'PackageLabel_Thermal_NonPCP';
  };

  const fetchShipmentDetails = async (shipmentId, inboundPlanId, requestId) => {
    const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
      body: {
        action: 'get_shipment',
        request_id: requestId,
        inbound_plan_id: inboundPlanId,
        shipment_id: shipmentId
      }
    });
    if (error) throw error;
    return data?.data || null;
  };

  const handlePrintLabels = async (shipment) => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setLabelsError('Missing inboundPlanId or requestId for labels.');
      return;
    }
    const shipmentId = shipment?.shipmentId || shipment?.id;
    if (!shipmentId) {
      setLabelsError('Missing shipmentId for labels.');
      return;
    }
    setLabelsLoadingId(shipment?.id || shipmentId);
    setLabelsError('');
    try {
      const details = await fetchShipmentDetails(shipmentId, inboundPlanId, requestId);
      const confirmationId =
        details?.shipmentConfirmationId ||
        details?.shipmentConfirmedId ||
        details?.shipmentConfirmationID ||
        shipment?.shipmentConfirmationId ||
        null;
      if (!confirmationId) {
        setLabelsError('Missing shipmentConfirmationId for labels. Try again after confirming shipping.');
        return;
      }
      const partnered = Boolean(shipmentMode?.carrier?.partnered);
      const packageCount = Number(shipment?.boxes || 0) || 1;
      const needsPageParams = !partnered || (shipmentMode?.method && shipmentMode.method !== 'SPD');
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'get_labels_v0',
          request_id: requestId,
          shipment_id: confirmationId,
          page_type: formatToPageType(labelFormat, partnered),
          label_type: 'BARCODE_2D',
          number_of_packages: packageCount || undefined,
          ...(needsPageParams
            ? { page_size: Math.min(1000, packageCount), page_start_index: 0 }
            : {})
        }
      });
      if (error) throw error;
      const url =
        data?.data?.payload?.DownloadURL ||
        data?.data?.payload?.downloadUrl ||
        data?.data?.DownloadURL ||
        null;
      if (url) {
        window.open(url, '_blank', 'noopener');
      } else {
        setLabelsError('Amazon did not return a URL for labels.');
      }
    } catch (e) {
      setLabelsError(e?.message || 'Could not generate labels.');
    } finally {
      setLabelsLoadingId(null);
    }
  };

  const resolveFbaShipmentId = () => {
    const list = Array.isArray(shipments) ? shipments : [];
    const fromApi = list.find((s) => s?.source === 'api' && (s?.amazonShipmentId || s?.shipmentConfirmationId || s?.shipmentId || s?.id));
    const fallback = fromApi || list.find((s) => s?.amazonShipmentId || s?.shipmentConfirmationId || s?.shipmentId || s?.id);
    const candidate =
      fallback?.amazonShipmentId ||
      fallback?.shipmentConfirmationId ||
      fallback?.shipmentId ||
      fallback?.id ||
      null;
    if (!candidate) return null;
    const asText = String(candidate);
    if (asText.startsWith('s-') || asText.toLowerCase().startsWith('fallback-')) return null;
    return asText;
  };

  const finalizeStep3 = async () => {
    if (step3Confirming) return;
    const requestId = resolveRequestId();
    if (!requestId) {
      setStep3Error('Missing requestId to confirm the request.');
      return;
    }
    if (!shippingConfirmed && !shippingSummary?.alreadyConfirmed) {
      setStep3Error('Confirm shipping before finishing the request.');
      return;
    }
    const existingId = plan?.fba_shipment_id || plan?.fba_shipmentId || null;
    const shipmentId = existingId || resolveFbaShipmentId();
    if (!shipmentId) {
      setStep3Error('Could not find FBA shipment ID from Amazon. Retry after confirming shipping.');
      return;
    }
    setStep3Confirming(true);
    setStep3Error('');
    try {
      const updatePayload = {};
      if (plan?.status !== 'confirmed') updatePayload.status = 'confirmed';
      if (!existingId || String(existingId) !== String(shipmentId)) {
        updatePayload.fba_shipment_id = shipmentId;
      }
      if (Object.keys(updatePayload).length) {
        const { error: updateErr } = await supabase
          .from('prep_requests')
          .update(updatePayload)
          .eq('id', requestId);
        if (updateErr) throw updateErr;
        setPlan((prev) => ({ ...prev, ...updatePayload }));
      }
      const { error: finalizeErr } = await supabase.rpc('finalize_prep_request_inventory', {
        p_request_id: requestId
      });
      if (finalizeErr) throw finalizeErr;

      completeAndNext('3');
    } catch (e) {
      setStep3Error(e?.message || 'Could not confirm request.');
    } finally {
      setStep3Confirming(false);
    }
  };

  const loadInboundPlanBoxes = async () => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) return;
    setTrackingLoading(true);
    setTrackingError('');
    try {
      const existingRows = Array.isArray(tracking) ? tracking : [];
      const existingByBoxId = new Map();
      const existingByLabel = new Map();
      existingRows.forEach((row) => {
        if (row?.boxId) existingByBoxId.set(String(row.boxId), row);
        if (row?.label) existingByLabel.set(String(row.label), row);
      });
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'list_inbound_plan_boxes',
          request_id: requestId,
          inbound_plan_id: inboundPlanId
        }
      });
      if (error) throw error;
      const boxes =
        data?.data?.payload?.boxes ||
        data?.data?.boxes ||
        data?.data?.payload?.boxList ||
        [];
      if (!Array.isArray(boxes) || boxes.length === 0) return;
      let normalized = boxes.map((b, idx) => {
        const boxId = b?.boxId || b?.packageId || b?.id || null;
        const label = b?.packageId || b?.boxId || b?.externalContainerIdentifier || `BOX-${idx + 1}`;
        const existing =
          (boxId && existingByBoxId.get(String(boxId))) ||
          (label && existingByLabel.get(String(label))) ||
          null;
        return {
          id: boxId || `box-${idx + 1}`,
          boxId,
          box: idx + 1,
          label,
          trackingId: existing?.trackingId || '',
          status: existing?.status || 'Pending',
          weight: b?.weight?.value || b?.weight?.amount || null,
          dimensions: b?.dimensions
            ? `${b.dimensions.length || ''} x ${b.dimensions.width || ''} x ${b.dimensions.height || ''}`
            : ''
        };
      });
      if (!trackingPrefillRef.current) {
        const savedTracking = Array.isArray(initialTrackingIds) ? initialTrackingIds.filter(Boolean) : [];
        if (savedTracking.length) {
          normalized = normalized.map((row, idx) => ({
            ...row,
            trackingId: row.trackingId || savedTracking[idx] || '',
            status: savedTracking[idx] ? 'Confirmed' : row.status
          }));
          trackingPrefillRef.current = true;
        }
      }
      setTracking(normalized);
    } catch (e) {
      setTrackingError(e?.message || 'Could not load boxes.');
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep !== '4') {
      trackingLoadRequestedRef.current = false;
      return;
    }
    if (trackingLoadRequestedRef.current) return;
    if (Array.isArray(tracking) && tracking.length) {
      const missingBoxId = tracking.some((row) => !row?.boxId);
      if (!missingBoxId) return;
    }
    trackingLoadRequestedRef.current = true;
    loadInboundPlanBoxes();
  }, [currentStep]);

  const handleTrackingChange = (id, value) => {
    setTracking((prev) => prev.map((row) => (row.id === id ? { ...row, trackingId: value } : row)));
  };

  const submitTrackingDetails = async () => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const shipmentId = (Array.isArray(shipments) && shipments[0]?.shipmentId) || shipments?.[0]?.id || null;
    if (!inboundPlanId || !requestId || !shipmentId) {
      setTrackingError('Missing inboundPlanId, requestId or shipmentId for tracking.');
      return;
    }
    const isPartnered = isPartneredShipment;
    if (isPartnered) {
      // Amazon-partnered shipments do not accept updateShipmentTrackingDetails.
      if (!Array.isArray(tracking) || !tracking.length || tracking.some((row) => !row?.boxId)) {
        await loadInboundPlanBoxes();
      }
      setTrackingError('');
      completeAndNext('4');
      return;
    }
    const items = (tracking || [])
      .filter((t) => t.trackingId && t.boxId)
      .map((t) => ({ boxId: t.boxId, trackingId: t.trackingId }));
    if (!items.length) {
      setTrackingError('Add tracking for at least one box.');
      return;
    }
    setTrackingLoading(true);
    setTrackingError('');
    try {
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'update_shipment_tracking_details',
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          shipment_id: shipmentId,
          tracking_details: {
            spdTrackingDetail: {
              spdTrackingItems: items
            }
          }
        }
      });
      if (error) throw error;
      if (data?.traceId && !import.meta.env.PROD) {
        console.log('updateTracking traceId', data.traceId);
      }
      completeAndNext('4');
    } catch (e) {
      setTrackingError(e?.message || 'Could not submit tracking.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const refreshStep = useCallback(
    async (stepKey) => {
      if (stepKey === '2' || stepKey === '3' || stepKey === '4') {
        setStep2Loaded(false);
        setShippingError('');
        setShippingSummary(null);
        setShippingOptions([]);
        await fetchShippingOptions();
        return;
      }
      if (stepKey === '1b') {
        await refreshPackingGroups();
        return;
      }
      setPlanLoaded(false);
      setLoadingPlan(true);
      if (fetchPlan) {
        let skip = false;
        await runFetchPlan().then((response) => {
          if (response?.__skip) {
            skip = true;
            return;
          }
          if (!response) return;
          const {
            shipFrom: pFrom,
            marketplace: pMarket,
            skus: pSkus,
            packGroups: pGroups,
            shipments: pShipments,
            warning: pWarning,
            shipmentMode: pShipmentMode,
            skuStatuses: pSkuStatuses,
            operationProblems: pOperationProblems,
            blocking: pBlocking,
            requestId: respReqId,
            inboundPlanId: respInboundId
          } = response;
          if (pFrom && pMarket && Array.isArray(pSkus)) {
            setPlan((prev) => ({ ...prev, ...response, shipFrom: pFrom, marketplace: pMarket, skus: pSkus }));
            snapshotServerUnits(pSkus);
          } else {
            setPlan((prev) => ({ ...prev, ...response }));
            if (Array.isArray(response?.skus)) snapshotServerUnits(response.skus);
          }
          if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
          if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
          if (Array.isArray(pGroups)) {
            const normalized = normalizePackGroups(pGroups);
            setPackGroups((prev) => mergePackGroups(prev, normalized));
            setPackGroupsLoaded(hasRealPackGroups(normalized));
          }
          if (Array.isArray(pShipments) && pShipments.length) setShipments(pShipments);
          if (pShipmentMode) setShipmentMode((prev) => ({ ...prev, ...pShipmentMode }));
          if (Array.isArray(pSkuStatuses)) setSkuStatuses(pSkuStatuses);
          setOperationProblems(Array.isArray(pOperationProblems) ? pOperationProblems : []);
          setBlocking(Boolean(pBlocking));
          if (typeof pWarning === 'string' && pWarning.trim()) {
            setPlanNotice((prevNotice) => prevNotice || toFriendlyPlanNotice(pWarning));
          }
          // Nu declanșăm automat Step 1b la refresh Step 1.
        });
        if (!skip) {
          setLoadingPlan(false);
          setPlanLoaded(true);
        }
        return;
      }
      setLoadingPlan(false);
      setPlanLoaded(true);
    },
    [fetchPlan, fetchShippingOptions, normalizePackGroups, runFetchPlan, snapshotServerUnits, toFriendlyPlanNotice]
  );

  const handleInboundPlanRetry = useCallback(() => {
    setAllowNoInboundPlan(false);
    setInboundPlanMissing(false);
    setStep1SaveError('');
    setPlanError('');
    refreshStep('1');
  }, [refreshStep]);

  const handleInboundPlanBypass = useCallback(() => {
    setAllowNoInboundPlan(true);
    setInboundPlanMissing(false);
    setStep1SaveError('');
    setPlanError('');
  }, []);

  const invalidateFrom = (stepKey) => {
    const idx = stepsOrder.indexOf(stepKey);
    if (idx === -1) return;
    const allowed = stepsOrder.slice(0, idx + 1);
    setCompletedSteps((prev) => prev.filter((s) => allowed.includes(s)));
    if (stepsOrder.indexOf(currentStep) > idx) {
      setCurrentStep(stepKey);
    }
    // Reset date pentru pașii următori
    if (stepKey === '1') {
      setPackGroups([]);
      setPackGroupsLoaded(false);
      setShipments([]);
      setTracking([]);
      setPackingOptionId(null);
      setPlacementOptionId(null);
      setCarrierTouched(false);
      setShippingConfirmed(false);
    } else if (stepKey === '1b') {
      setShipments([]);
      setTracking([]);
      setPackGroupsLoaded(false);
      setCarrierTouched(false);
      setShippingConfirmed(false);
    } else if (stepKey === '2') {
      setTracking([]);
      setShippingConfirmed(false);
    }
  };

  function completeAndNext(stepKey) {
    const idx = stepsOrder.indexOf(stepKey);
    setCompletedSteps((prev) => Array.from(new Set([...prev, stepKey])));
    const nextKey = stepsOrder[idx + 1] || stepKey;
    setCurrentStep(nextKey);
  }

  const goToStep = (stepKey) => {
    if (!stepsOrder.includes(stepKey)) return;
    setCurrentStep(stepKey);
    if (stepKey === '1b') {
      const inboundId = resolveInboundPlanId();
      if (allowNoInboundPlan && !inboundId) {
        setPackGroupsLoaded(true);
        if (!Array.isArray(packGroups) || !packGroups.length) {
          const fallbackGroups = buildFallbackPackGroups(plan?.skus || []);
          setPackGroups(fallbackGroups);
        }
        return;
      }
      refreshPackingGroups();
    }
  };

  const persistStep1AndReloadPlan = useCallback(async () => {
    const isUuid = (val) => typeof val === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
    const requestId = resolveRequestId();
    const inboundPlanIdCurrent = resolveInboundPlanId();
    const bypassMissingInbound = allowNoInboundPlan && !inboundPlanIdCurrent;
    const updates = (Array.isArray(plan?.skus) ? plan.skus : [])
      .map((sku) => {
        if (!sku?.id) return null;
        const qty = Math.max(0, Number(sku.units) || 0);
        return { id: sku.id, units_sent: qty };
      })
      .filter(Boolean);
    const updatesForDb = updates.filter((u) => isUuid(u.id));
    const hasAnyQty = updates.some((u) => Number(u.units_sent || 0) > 0);
    if (!updates.length || !hasAnyQty) {
      setStep1SaveError('Set at least one product with quantity > 0 before continuing.');
      return;
    }
    if (!requestId) {
      completeAndNext('1');
      return;
    }
    // dacă suntem în modul bypass (fără inboundPlanId) evităm așteptarea packing groups și continuăm direct după salvare
    setStep1Saving(true);
    setStep1SaveError('');
    setPlanError('');
    const waitForPackingGroups = async () => {
      const maxAttempts = 6;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const haveInbound = Boolean(resolveInboundPlanId());
        if (!haveInbound && fetchPlan) {
          // eslint-disable-next-line no-await-in-loop
          await refreshStep('1');
        }
        // eslint-disable-next-line no-await-in-loop
        const res = await refreshPackingGroups();
        if (res?.ok) return { ok: true };
        const transientCodes = ['PACKING_GROUPS_NOT_READY', 'PLAN_STILL_CREATING', 'MISSING_IDS'];
        if (!transientCodes.includes(res?.code)) return res;
        if (attempt < maxAttempts) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        }
      }
      return { ok: false, code: 'PACKING_GROUPS_NOT_READY' };
    };
    try {
      // upsert declanșa RLS pe INSERT; facem update punctual pe fiecare id (chiar dacă aparent nu s-au schimbat,
      // ca să sincronizăm serverul înainte de a recrea inbound plan-ul)
      for (const row of updatesForDb) {
        // eslint-disable-next-line no-await-in-loop
        const { error: saveErr } = await supabase
          .from('prep_request_items')
          .update({ units_sent: row.units_sent })
          .eq('id', row.id);
        if (saveErr) throw saveErr;
      }

      await persistServicesToDb();

      if (bypassMissingInbound) {
        setStep1SaveError('');
        setInboundPlanMissing(true);
        setPackGroupsLoaded(true);
        const fallbackGroups = buildFallbackPackGroups(plan?.skus || []);
        setPackGroups(fallbackGroups);
        setCompletedSteps((prev) => Array.from(new Set([...prev, '1'])));
        setCurrentStep('1b');
        return;
      }

      const { error: resetErr } = await supabase
        .from('prep_requests')
        .update({
          inbound_plan_id: null,
          placement_option_id: null,
          packing_option_id: null,
          fba_shipment_id: null,
          step1_box_plan: step1BoxPlanRef.current || {},
          // ștergem snapshot-ul Amazon ca să forțăm recrearea planului cu cantitățile noi
          amazon_snapshot: {}
        })
        .eq('id', requestId);
      if (resetErr) throw resetErr;

      setPlan((prev) => ({
        ...prev,
        inboundPlanId: null,
        inbound_plan_id: null,
        placementOptionId: null,
        placement_option_id: null,
        packingOptionId: null,
        packing_option_id: null
      }));
      setPackGroups([]);
      setPackGroupsLoaded(false);
      setShipments([]);
      setTracking([]);
      setShippingSummary(null);
      setShippingOptions([]);
      setStep2Loaded(false);
      snapshotServerUnits(updates.map((u) => ({ id: u.id, units: u.units_sent })));

      if (fetchPlan) {
        await refreshStep('1');
      }
      const packRes = await waitForPackingGroups();
      if (!packRes?.ok) {
        const msg =
          packRes?.message ||
          wizardCopy.packingWait;
        setInboundPlanMissing(true);
        if (allowNoInboundPlan) {
          completeAndNext('1');
          return;
        }
        setStep1SaveError(msg);
        return;
      }
      setInboundPlanMissing(false);
      // asigură-te că avem inboundPlanId după reîncărcare, altfel nu trecem în 1b
      const inboundPlanId = resolveInboundPlanId();
      if (!inboundPlanId) {
        setInboundPlanMissing(true);
        if (allowNoInboundPlan) {
          completeAndNext('1');
          return;
        }
        setStep1SaveError(wizardCopy.inboundPlanWait);
        return;
      }
      completeAndNext('1');
    } catch (e) {
      const message = e?.message || 'Could not save quantities.';
      // cod 42501 -> RLS blocked (ex: insert din upsert)
      if (String(e?.code) === '42501') {
        setStep1SaveError(`${message} (RLS permission; re-authenticate or contact an admin).`);
      } else {
        setStep1SaveError(message);
      }
    } finally {
      setStep1Saving(false);
    }
  }, [
    allowNoInboundPlan,
    completeAndNext,
    fetchPlan,
    plan?.skus,
    skuServicesById,
    boxServices,
    persistServicesToDb,
    refreshStep,
    resolveInboundPlanId,
    resolveRequestId,
    snapshotServerUnits,
    wizardCopy
  ]);

  const renderContent = (stepKey) => {
    if (stepKey === '1') {
      return (
        <FbaStep1Inventory
          data={plan}
          skuStatuses={skuStatuses}
          blocking={blocking}
          saving={step1Saving}
          loadingPlan={!planLoaded || loadingPlan}
          inboundPlanId={resolveInboundPlanId()}
          requestId={resolveRequestId()}
          packGroupsPreview={packGroupsPreviewForUnits}
          packGroupsPreviewLoading={packGroupsPreviewLoading}
          packGroupsPreviewError={packGroupsPreviewError}
          boxPlan={step1BoxPlanForMarket}
          onBoxPlanChange={handleStep1BoxPlanChange}
          marketCode={currentMarket}
          allowNoInboundPlan={allowNoInboundPlan}
          inboundPlanMissing={inboundPlanMissing}
          onRetryInboundPlan={handleInboundPlanRetry}
          onBypassInboundPlan={handleInboundPlanBypass}
          onChangePacking={handlePackingChange}
          onChangeQuantity={handleQuantityChange}
          onRemoveSku={handleRemoveSku}
          onAddSku={handleAddSku}
          onChangeExpiry={handleExpiryChange}
          onChangePrep={handlePrepChange}
          skuServicesById={skuServicesById}
          onSkuServicesChange={setSkuServicesById}
          boxServices={boxServices}
          onBoxServicesChange={setBoxServices}
          onPersistServices={persistServicesToDb}
          inboundPlanCopy={wizardCopy}
          onNext={persistStep1AndReloadPlan}
          operationProblems={operationProblems}
          notice={planNotice}
          error={planError || step1SaveError}
        />
      );
    }
    if (stepKey === '1b') {
      return (
        <FbaStep1bPacking
          packGroups={packGroupsForUnits}
          packGroupsLoaded={packGroupsLoaded}
          loading={loadingPlan || packingRefreshLoading}
          error={planError || packingReadyError || packingSubmitError}
          onRetry={refreshPackingGroups}
          retryLoading={packingRefreshLoading}
          submitting={packingSubmitLoading}
          autoPackingMode={autoPackingActive}
          onUpdateGroup={handlePackGroupUpdate}
          onNext={submitPackingInformation}
          onBack={() => goToStep('1')}
          packingOptions={packingOptions}
          packingOptionId={packingOptionId}
          onSelectPackingOption={handleSelectPackingOption}
        />
      );
    }
    if (stepKey === '2') {
      return (
        <FbaStep2Shipping
          shipment={{
            deliveryDate: shipmentMode.deliveryDate,
            deliveryWindowStart: shipmentMode.deliveryWindowStart,
            deliveryWindowEnd: shipmentMode.deliveryWindowEnd,
            method: shipmentMode.method,
            carrier: shipmentMode.carrier,
            palletDetails,
            shipments: shipmentsWithFallback,
            warning
          }}
          shippingOptions={shippingOptions}
          shippingSummary={shippingSummary}
          selectedTransportationOptionId={selectedTransportationOptionId}
          carrierTouched={carrierTouched}
          shippingConfirmed={shippingConfirmed}
          readyWindowByShipment={readyWindowByShipment}
          shippingLoading={shippingLoading}
          onOptionSelect={handleTransportationOptionSelect}
          onPalletDetailsChange={setPalletDetails}
          onShipDateChange={(date) => setShipmentMode((prev) => ({ ...prev, deliveryDate: date }))}
          onDeliveryWindowChange={(window) =>
            setShipmentMode((prev) => ({
              ...prev,
              deliveryWindowStart: window?.start || '',
              deliveryWindowEnd: window?.end || ''
            }))
          }
          onReadyWindowChange={handleReadyWindowChange}
          onGenerateOptions={fetchShippingOptions}
          error={shippingError}
          confirming={shippingConfirming}
          onNext={confirmShippingOptions}
          onBack={() => goToStep('1b')}
        />
      );
    }
    if (stepKey === '3') {
      return (
        <FbaStep3Labels
          shipments={shipments}
          labelFormat={labelFormat}
          onFormatChange={setLabelFormat}
          onPrint={handlePrintLabels}
          printLoadingId={labelsLoadingId}
          confirming={step3Confirming}
          error={step3Error || labelsError}
          onBack={() => goToStep('2')}
          onNext={finalizeStep3}
        />
      );
    }
    return (
      <FbaStep4Tracking
        tracking={tracking}
        onUpdateTracking={handleTrackingChange}
        onBack={() => goToStep('3')}
        onFinish={submitTrackingDetails}
        error={trackingError}
        loading={trackingLoading}
        trackingDisabled={isPartneredShipment}
      />
    );
  };

  const skuCount = useMemo(() => (Array.isArray(plan?.skus) ? plan.skus.length : 0), [plan?.skus]);
  const unitCount = useMemo(
    () => (Array.isArray(plan?.skus) ? plan.skus.reduce((s, it) => s + (Number(it.units) || 0), 0) : 0),
    [plan?.skus]
  );
  const packUnits = useMemo(() => {
    if (Array.isArray(packGroups) && packGroups.length) {
      return packGroups.reduce((s, g) => s + (Number(g.units) || 0), 0);
    }
    // Fallback: derive from step1 box plan if pack groups are empty
    const groups = step1BoxPlanForMarket?.groups || {};
    const fromPlan = Object.values(groups).reduce((sum, grp) => {
      const boxItems = Array.isArray(grp?.boxItems) ? grp.boxItems : [];
      const total = boxItems.reduce((acc, box) => {
        return (
          acc +
          Object.values(box || {}).reduce((a, qty) => a + (Number(qty) || 0), 0)
        );
      }, 0);
      return sum + total;
    }, 0);
    return fromPlan > 0 ? fromPlan : unitCount;
  }, [packGroups, step1BoxPlanForMarket?.groups, unitCount]);

  const boxesCount = useMemo(() => {
    if (Array.isArray(packGroups) && packGroups.length) {
      return packGroups.reduce((s, g) => s + (Number(g.boxes) || 0), 0);
    }
    const groups = step1BoxPlanForMarket?.groups || {};
    const fromPlan = Object.values(groups).reduce((sum, grp) => {
      const boxes = Array.isArray(grp?.boxes) ? grp.boxes.length : 0;
      return sum + boxes;
    }, 0);
    return fromPlan;
  }, [packGroups, step1BoxPlanForMarket?.groups]);

  const shipmentSummary = useMemo(() => {
    const dests = Array.isArray(shipments) ? shipments.length : 0;
    const method = shipmentMode?.method || '—';
    const carrierName = String(shipmentMode?.carrier?.name || shipmentMode?.carrier?.code || '—');
    return { dests, method, carrierName };
  }, [shipments, shipmentMode]);

  const trackingSummary = useMemo(() => {
    const totalBoxes = Array.isArray(shipments)
      ? shipments.reduce((s, sh) => s + (Number(sh.boxes) || 0), 0)
      : 0;
    const tracked = Array.isArray(tracking) ? tracking.filter((t) => t.trackingId).length : 0;
    return { totalBoxes, tracked };
  }, [shipments, tracking]);
  const shipmentFallbackTotals = useMemo(() => {
    const skuCountFallback = Array.isArray(plan?.skus) ? plan.skus.length : 0;
    const unitsFallback = packUnits || unitCount || 0;
    return { skuCountFallback, unitsFallback };
  }, [plan?.skus, packUnits, unitCount]);
  const shipmentsWithFallback = useMemo(() => {
    if (!Array.isArray(shipments)) return [];
    return shipments.map((sh) => ({
      ...sh,
      skuCount: sh?.skuCount ?? shipmentFallbackTotals.skuCountFallback,
      units: sh?.units ?? shipmentFallbackTotals.unitsFallback
    }));
  }, [shipments, shipmentFallbackTotals]);
  const autoShipPlanRef = useRef({ planId: null, attempted: false });

  const isCompleted = (key) => completedSteps.includes(key);
  const step2Complete = isCompleted('2') && shippingConfirmed;
  const step3Complete = isCompleted('3') && Boolean(labelFormat);
  const step4Complete = isCompleted('4') && (trackingSummary.tracked > 0 || isPartneredShipment);

  const StepRow = ({ stepKey, title, subtitle, summary }) => {
    const active = currentStep === stepKey;
    const done = isCompleted(stepKey);
    const canRefresh = stepKey === '2' || stepKey === '3' || stepKey === '4' || Boolean(fetchPlan);
    return (
      <div
        className={`px-3 py-2 border border-slate-200 bg-white rounded-lg transition-all ${active ? 'ring-2 ring-blue-500' : ''}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Circle className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm truncate">{title}</div>
              <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>
              {summary && <div className="text-xs text-slate-600 truncate">{summary}</div>}
            </div>
          </div>
          <button
            onClick={() => goToStep(stepKey)}
            className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 whitespace-nowrap"
          >
            <Eye className="w-4 h-4" /> {tt('viewEdit', 'View/Edit')}
          </button>
          {canRefresh && (
            <button
              onClick={() => refreshStep(stepKey)}
              className="ml-2 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded-md px-2 py-1"
            >
              {tt('refresh', 'Refresh')}
            </button>
          )}
        </div>
        {active && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            {renderContent(stepKey)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full mx-auto max-w-5xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm flex items-center gap-2 text-slate-800 font-semibold">
        {tt('title', 'Send to Amazon')}
        <span className="text-xs text-slate-500 font-normal">{tt('subtitle', 'UI aligned to Amazon steps (live)')}</span>
      </div>

      <div className="space-y-2">
        <StepRow
          stepKey="1"
          title={tt('step1Title', 'Step 1 - Confirmed inventory to send')}
          subtitle={`SKUs: ${skuCount} · Units: ${unitCount} · Ship from: ${plan?.shipFrom?.name || plan?.shipFrom?.address || '—'}`}
          summary={plan?.marketplace ? `Marketplace: ${plan.marketplace}` : null}
        />
        <StepRow
          stepKey="1b"
          title={tt('step1bTitle', 'Step 1b - Pack individual units')}
          subtitle={`Pack groups: ${packGroups?.length || 0} · Units: ${packUnits} · Boxes: ${boxesCount}`}
          summary={packGroups?.length ? tt('packReady', 'You can start packing now') : tt('noPackGroups', 'No pack groups yet')}
        />
        <StepRow
          stepKey="2"
          title={tt('step2Title', 'Step 2 - Confirm shipping')}
          subtitle={
            step2Complete
              ? `Destinations: ${shipmentSummary.dests} · Method: ${shipmentSummary.method} · Carrier: ${shipmentSummary.carrierName}`
              : tt('notStarted', 'Not started')
          }
          summary={null}
        />
        <StepRow
          stepKey="3"
          title={tt('step3Title', 'Step 3 - Box labels printed')}
          subtitle={step3Complete ? `Shipments: ${shipments?.length || 0}` : tt('notStarted', 'Not started')}
          summary={step3Complete ? `${tt('labelFormat', 'Label format')}: ${labelFormat}` : null}
        />
        <StepRow
          stepKey="4"
          title={tt('step4Title', 'Final step: Tracking details')}
          subtitle={
            step4Complete
              ? `Boxes: ${trackingSummary.totalBoxes} · Tracking IDs: ${trackingSummary.tracked}`
              : tt('notStarted', 'Not started')
          }
          summary={step4Complete ? tt('trackingCaptured', 'Tracking captured') : null}
        />
      </div>
    </div>
  );
}
