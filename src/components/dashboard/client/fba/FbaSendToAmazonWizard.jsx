import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../config/supabase';
import { CheckCircle2, Circle, Eye } from 'lucide-react';
import FbaStep1Inventory from './FbaStep1Inventory';
import FbaStep1bPacking from './FbaStep1bPacking';
import FbaStep2Shipping from './FbaStep2Shipping';
import FbaStep3Labels from './FbaStep3Labels';
import FbaStep4Tracking from './FbaStep4Tracking';

const getSafeNumber = (val) => {
  if (val === null || val === undefined) return null;
  const num = Number(String(val).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
};

const getPositiveNumber = (val) => {
  const num = getSafeNumber(val);
  return Number.isFinite(num) && num > 0 ? num : null;
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

const aggregateTransportationOptions = (options = []) => {
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

  const buildOption = (key, list) => {
    if (!list.length) return null;
    const rep = pickRepresentative(list);
    const charge = minCharge(list);
    const base = {
      ...rep,
      charge,
      id: rep?.id,
      isPartnered: detectPartneredOption(rep)
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
    deliveryDate: getTomorrowIsoDate(),
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
  const stepsOrder = ['1', '1b', '2', '3', '4'];
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
  const allowPersistence = false; // forțează reluarea workflow-ului de la Step 1; nu restaurăm din localStorage
  const normalizePackGroups = useCallback((groups = []) =>
    (Array.isArray(groups) ? groups : [])
      .map((g, idx) => {
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
      }),
  []);
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
  const [packGroupsLoaded, setPackGroupsLoaded] = useState(false);
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
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planError, setPlanError] = useState('');
  const [step1Saving, setStep1Saving] = useState(false);
  const [step1SaveError, setStep1SaveError] = useState('');
  const [skuStatuses, setSkuStatuses] = useState(initialSkuStatuses);
  const [blocking, setBlocking] = useState(false);
  const [shippingOptions, setShippingOptions] = useState(
    historyMode ? (Array.isArray(initialShippingOptions) ? initialShippingOptions : []) : []
  );
  const [shippingSummary, setShippingSummary] = useState(historyMode ? initialShippingSummary : null);
  const [selectedTransportationOptionId, setSelectedTransportationOptionId] = useState(
    historyMode ? initialSelectedTransportationOptionId : null
  );
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState('');
  const [packingSubmitLoading, setPackingSubmitLoading] = useState(false);
  const [packingSubmitError, setPackingSubmitError] = useState('');
  const [packingRefreshLoading, setPackingRefreshLoading] = useState(false);
  const [packingReadyError, setPackingReadyError] = useState('');
  const [step2Loaded, setStep2Loaded] = useState(false);
  const [shippingConfirming, setShippingConfirming] = useState(false);
  const [forcePartneredOnly, setForcePartneredOnly] = useState(false);
  const isFallbackId = useCallback((v) => typeof v === "string" && v.toLowerCase().startsWith("fallback-"), []);
  const hasRealPackGroups = useCallback(
    (groups) =>
      (Array.isArray(groups) ? groups : []).some((g) => g?.packingGroupId && !isFallbackId(g.packingGroupId)),
    [isFallbackId]
  );
  const serverUnitsRef = useRef(new Map());
  const packGroupsRef = useRef(packGroups);
  const planRef = useRef(plan);
  const packingOptionIdRef = useRef(packingOptionId);
  const placementOptionIdRef = useRef(placementOptionId);
  const packingRefreshLockRef = useRef({ inFlight: false, planId: null });
  const packingAutoRetryTimerRef = useRef(null);
  const packingPreviewFetchRef = useRef(false);
  const shippingRetryRef = useRef(0);
  const shippingRetryTimerRef = useRef(null);
  const planMissingRetryRef = useRef(0);
  const trackingPrefillRef = useRef(false);
  useEffect(() => {
    packGroupsRef.current = packGroups;
  }, [packGroups]);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const normalizeSkus = useCallback((skus = []) => {
    const firstMedia = (val) => (Array.isArray(val) && val.length ? val[0] : null);
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
      if (image && !sku.image) {
        return { ...sku, image };
      }
      return sku;
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
      return (
        currentPlan?.inboundPlanId ||
        currentPlan?.inbound_plan_id ||
        currentPlan?.planId ||
        currentPlan?.plan_id ||
        null
      );
    }

    return (
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
  const initialRequestKey = useMemo(
    () =>
      initialPlan?.prepRequestId ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      initialPlan?.id ||
      null,
    [initialPlan?.id, initialPlan?.prepRequestId, initialPlan?.requestId, initialPlan?.request_id]
  );

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

    const normalizedInitialGroups = normalizePackGroups(initialPackGroups || []);
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
    initialPackGroups,
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
      if (Array.isArray(data?.packingOptions)) setPackingOptions(data.packingOptions);
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
      if (Array.isArray(data?.completedSteps)) setCompletedSteps(data.completedSteps);
      if (data?.currentStep && stepsOrder.includes(data.currentStep)) setCurrentStep(data.currentStep);
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
    shipmentMode,
    palletDetails,
    shipments,
    labelFormat,
    tracking,
    packingOptionId,
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
      setStep1SaveError('');
      const hasCachedGroups = hasRealPackGroups(packGroupsRef.current);
      const workflowAlreadyStarted =
        Boolean(packingOptionIdRef.current || planRef.current?.packingOptionId || initialPlan?.packingOptionId) ||
        Boolean(placementOptionIdRef.current || planRef.current?.placementOptionId || initialPlan?.placementOptionId);
      if (!hasCachedGroups && !workflowAlreadyStarted) {
        setPackGroups([]); // doar dacă e plan nou / încă neconfirmat
      }
      try {
        const response = fetchPlan ? await fetchPlan() : null;
        if (cancelled) return;
        if (!response) {
          setPlanError((prev) => prev || 'Planul Amazon nu a răspuns. Reîncearcă refresh.');
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
        setBlocking(Boolean(pBlocking));
        if (typeof pWarning === 'string') {
          const reqId = response.requestId || response.request_id || null;
          const trId = response.traceId || response.trace_id || null;
          const extra = [pWarning, reqId ? `RequestId: ${reqId}` : null, trId ? `TraceId: ${trId}` : null]
            .filter(Boolean)
            .join(' · ');
          setPlanError((prevError) => prevError || extra);
        }
      } catch (e) {
        if (!cancelled) setPlanError(e?.message || 'Failed to load Amazon plan.');
      } finally {
        if (!cancelled) {
          setLoadingPlan(false);
          setPlanLoaded(true);
        }
      }
    }
  }, [autoLoadPlan, fetchPlan, normalizePackGroups, planLoaded, snapshotServerUnits]);

  useEffect(() => {
    if (!planLoaded) return;
    if (!fetchPlan) return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (inboundPlanId && requestId) {
      planMissingRetryRef.current = 0;
      return;
    }
    if (planMissingRetryRef.current >= 2) return;
    planMissingRetryRef.current += 1;
    let cancelled = false;
    (async () => {
      setLoadingPlan(true);
      try {
        const response = await fetchPlan();
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
        if (!cancelled) setLoadingPlan(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planLoaded, fetchPlan, resolveInboundPlanId, resolveRequestId, snapshotServerUnits]);
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
        return 'Completează dimensiunile și greutatea pentru toate cutiile înainte de Step 2.';
      }
    }
    const returnedModes = shippingSummary?.returnedModes || [];
    const returnedSolutions = (shippingSummary?.returnedSolutions || []).map((s) => String(s || '').toUpperCase());
    const wantsSpd = String(shipmentMode?.method || '').toUpperCase() === 'SPD';
    const hasPartnered = returnedSolutions.some((s) => s.includes('AMAZON_PARTNERED'));
    if (wantsSpd && returnedModes.length && !returnedModes.includes('GROUND_SMALL_PARCEL')) {
    return 'Amazon nu a returnat opțiuni SPD pentru aceste colete. Verifică dimensiuni/greutate la cutii (setPackingInformation). Paletii sunt doar pentru LTL/FTL.';
  }
  if (shippingSummary && shippingSummary.partneredAllowed === false && !shippingSummary?.alreadyConfirmed) {
    return 'Amazon a indicat că transportul partenereat nu este disponibil pentru aceste expedieri.';
  }
  if (shippingSummary && !shippingSummary?.alreadyConfirmed && returnedSolutions.length && !hasPartnered) {
    return 'Amazon nu a returnat AMAZON_PARTNERED_CARRIER. Verifică dimensiuni/greutate la cutii (setPackingInformation), contact information, packing options confirmate și regenerează transportation options. Paletii/freight info sunt doar pentru LTL/FTL.';
  }
  return null;
}, [shippingSummary, shippingLoading, step2Loaded, shipmentMode?.method]);


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

  const handleExpiryChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, expiry: value } : sku))
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
          const quantity = Number.isFinite(plannedUnits) ? plannedUnits : Number(it?.quantity || 0) || 0;
          if (!quantity) return null;
          return { ...it, quantity };
        })
        .filter(Boolean),
    [planUnitsByKey]
  );

  const packGroupsForUnits = useMemo(() => {
    if (!Array.isArray(packGroups)) return [];
    return packGroups
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
  }, [packGroups, normalizeGroupItemsForUnits]);

  const handlePackGroupUpdate = (groupId, patch) => {
    setPackGroups((prev) =>
      prev.map((g) =>
        g.id === groupId || g.packingGroupId === groupId ? { ...g, ...patch } : g
      )
    );
  };

  const handleSelectPackingOption = (id) => {
    if (!id) return;
    if (packingOptionIdRef.current && String(packingOptionIdRef.current) === String(id)) return;
    setPackingOptionId(id);
    refreshPackingGroups(id);
  };

  const buildPackingPayload = (groups = packGroups) => {
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
      const dims = getSafeDims(g.boxDimensions);
      const weight = getPositiveNumber(g.boxWeight);
      const count = Math.max(1, Number(g.boxes) || 1);
      const packingGroupId = g.packingGroupId || null;
      const normalizedDims = dims ? { length: dims.length, width: dims.width, height: dims.height, unit: "CM" } : null;
      const normalizedWeight = weight ? { value: weight, unit: "KG" } : null;

      if (!packingGroupId) {
        missingGroupId = true;
        return;
      }
      const normalizedItems = normalizeGroupItemsForUnits(g.items || []);
      if (!normalizedItems.length) {
        return;
      }

      const normalizedPackMode = g.packMode || "single";
      const contentInformationSource =
        g.contentInformationSource ||
        (normalizedPackMode === "multiple" ? "BOX_CONTENT_PROVIDED" : null);
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
        perBoxDetails: Array.isArray(g.perBoxDetails) ? g.perBoxDetails : null,
        perBoxItems: Array.isArray(g.perBoxItems) ? g.perBoxItems : null
      });
    });

    return { packingGroups: packingGroupsPayload, missingGroupId };
  };

  const submitPackingInformation = async (payload = {}) => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;

    if (!inboundPlanId || !requestId) {
      setPackingSubmitError('Lipsește inboundPlanId sau requestId; finalizează Step 1 înainte de confirmare.');
      return;
    }

    const derivedPayload = buildPackingPayload();
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
    if (missingGroupId) {
      setPackingSubmitError("Amazon nu a returnat packingGroupId pentru cutii (packingOptions). Reia Step 1b pentru a obține packing groups reale.");
      return;
    }
    if (hasFallback) {
      setPackingSubmitError("Amazon nu a returnat packingGroupId pentru cutii (packingOptions). Reia Step 1b pentru a obține packing groups reale.");
      return;
    }

    if (!packingGroupsPayload.length) {
      setPackingSubmitError('Completează dimensiunile și greutatea pentru cutie înainte de a continua.');
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
        throw new Error('Lipsește packingOptionId acceptat de Amazon; reîncearcă refresh Step 1b.');
      }
      if (!Array.isArray(payload.packingGroups) || !payload.packingGroups.length) {
        const refreshedPayload = buildPackingPayload(effectivePackGroups);
        packingGroupsPayload = refreshedPayload.packingGroups;
      }
      if (!refreshRes?.ok) {
        // dacă avem deja packing groups încărcate în UI, nu mai blocăm user-ul; continuăm cu ceea ce avem
        const hasLocalGroups = Array.isArray(packGroups) && packGroups.length > 0;
        if (!hasLocalGroups) {
          const trace = refreshRes?.traceId ? ` TraceId ${refreshRes.traceId}` : '';
          throw new Error(
            refreshRes?.message ||
            `Packing groups nu sunt gata încă.${trace}`
          );
        }
        console.warn('Proceeding with existing packing groups because Amazon refresh not ready', refreshRes);
      }

      const { data, error } = await supabase.functions.invoke('fba-set-packing-information', {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          packing_option_id: effectivePackingOptId,
          placement_option_id: placementOptId,
          packing_groups: packingGroupsPayload,
          generate_placement_options: true
        }
      });
      if (error) throw error;
      if (data?.traceId) console.log('setPackingInformation traceId', data.traceId);
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
      completeAndNext('1b');
    } catch (e) {
      setPackingSubmitError(e?.message || 'SetPackingInformation a eșuat.');
    } finally {
      setPackingSubmitLoading(false);
    }
  };

  async function refreshPackingGroups(selectedPackingOptionId = null) {
    if (typeof window === 'undefined') return { ok: false, code: 'NO_WINDOW' };
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setPackingReadyError('Lipsește inboundPlanId sau requestId; reîncarcă planul.');
      return { ok: false, code: 'MISSING_IDS' };
    }
    // păstrăm grupurile existente; doar marcăm loading
    setPackGroupsLoaded(hasRealPackGroups(packGroups));
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
      if (Array.isArray(data?.packingOptions)) setPackingOptions(data.packingOptions);
      if (data?.code === 'PACKING_GROUPS_NOT_READY') {
        const trace = data?.traceId || data?.trace_id || null;
        const msg = data?.message || 'Amazon nu a returnat încă packing groups. Reîncearcă în câteva secunde.';
        setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
        if (!hasRealPackGroups(packGroups)) {
          setPackGroups([]); // nu afișăm nimic local dacă nu avem packing groups reale
        }
        return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: msg, traceId: trace };
      }
      if (data?.code === 'PACKING_OPTIONS_NOT_READY') {
        const trace = data?.traceId || data?.trace_id || null;
        const msg = data?.message || 'Inbound plan-ul este încă gol. Reîncearcă în câteva secunde.';
        setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
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
            'Planul este deja ACCEPTED în Amazon, iar packing groups nu mai pot fi regenerate. Reia planul doar dacă ai packing groups salvate.';
          setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
          return { ok: false, code: 'PLACEMENT_ALREADY_ACCEPTED', message: msg, traceId: trace };
        }
        setPackingReadyError('Planul este deja ACCEPTED în Amazon; folosim packing groups salvate.');
        if (data?.packingOptionId) setPackingOptionId(data.packingOptionId);
        if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
        const normalized = normalizePackGroups(cachedGroups);
        setPackGroupsLoaded(true);
        setPackGroups((prev) => mergePackGroups(prev, normalized));
        if (Array.isArray(data?.shipments)) setShipments(data.shipments);
        setPlanError('');
        if (Array.isArray(data?.quantityMismatches) && data.quantityMismatches.length) {
          const first = data.quantityMismatches[0];
          const msg = `Cantitățile diferă între UI și Amazon (${first.sku}: Amazon ${first.amazon} vs confirmat ${first.confirmed}).`;
          setPackGroups([]); // nu folosi grupuri Amazon cu cantități vechi
          setPackingReadyError(msg);
          return { ok: false, code: 'PACKING_QTY_MISMATCH', quantityMismatches: data.quantityMismatches };
        }
        return { ok: true, code: 'PLACEMENT_ALREADY_ACCEPTED', packingOptionId: data?.packingOptionId || null, packingGroups: normalized };
      }
      if (data?.packingOptionId) setPackingOptionId(data.packingOptionId);
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
      if (Array.isArray(data?.packingOptions)) setPackingOptions(data.packingOptions);
      if (Array.isArray(data?.packingGroups)) {
        const normalized = normalizePackGroups(data.packingGroups);
        const filtered = normalized.filter((g) => g.packingGroupId && !isFallbackId(g.packingGroupId));
        if (!filtered.length) {
          const msg = 'Packing groups lipsesc din răspunsul Amazon. Reîncearcă peste câteva secunde.';
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
            const msg = `Cantitățile diferă între UI și Amazon (${first.sku}: Amazon ${first.amazon} vs confirmat ${first.confirmed}).`;
            setPackGroups([]); // evităm afișarea grupurilor cu cantități vechi
            setPackingReadyError(msg);
            return { ok: false, code: 'PACKING_QTY_MISMATCH', quantityMismatches: data.quantityMismatches };
          }
          return { ok: true, packingOptionId: data?.packingOptionId || null, packingGroups: filtered };
        }
        if (Array.isArray(data?.shipments)) setShipments(data.shipments);
        setPlanError('');
        return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: 'Packing groups lipsesc din răspunsul Amazon.' };
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
      return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: 'Amazon nu a returnat packing groups după mai multe încercări.' };
    } catch (e) {
      const msg = e?.message || 'Nu am putut reîncărca packing groups.';
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
    if (!inboundPlanId || !requestId) return;
    if (packGroupsLoaded) return;
    if (Array.isArray(packGroups) && packGroups.length) return;
    if (packingRefreshLoading || packingPreviewFetchRef.current) return;
    packingPreviewFetchRef.current = true;
    refreshPackingGroups();
  }, [currentStep, packGroupsLoaded, packGroups, packingRefreshLoading, resolveInboundPlanId, resolveRequestId]);

  const buildShipmentConfigs = () => {
    if (!Array.isArray(packGroups)) return [];
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
          freightClass: palletDetails.freightClass || 'FC_XX'
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
      const dims = getSafeDims(g.boxDimensions);
      const weight = getPositiveNumber(g.boxWeight);
      const boxCount = Math.max(1, Number(g.boxes) || 1);
      const hasPackageSpec = Boolean(dims && weight);
      const pkg = hasPackageSpec
        ? {
            dimensions: { length: dims.length, width: dims.width, height: dims.height, unit: "CM" },
            weight: { value: weight, unit: "KG" }
          }
        : null;
      const isMultiple = String(g?.packMode || '').toLowerCase() === 'multiple';
      const perBoxDetails = Array.isArray(g?.perBoxDetails) ? g.perBoxDetails : [];
      const perBoxPackages = isMultiple && perBoxDetails.length
        ? perBoxDetails
            .map((box) => {
              const perDims = getSafeDims(box);
              const perWeight = getPositiveNumber(box?.weight);
              if (!perDims || !perWeight) return null;
              return {
                dimensions: { length: perDims.length, width: perDims.width, height: perDims.height, unit: "CM" },
                weight: { value: perWeight, unit: "KG" }
              };
            })
            .filter(Boolean)
        : [];
      const packingGroupId = g.packingGroupId || null;
      if (!packingGroupId) return;
      const shId = shipmentIdForGroup(g, idx);
      const existing = byShipment.get(shId) || {
        shipmentId: shId,
        packages: [],
        pallets: null,
        freightInformation: null
      };
      if (usePallets) {
        existing.pallets = palletPayload;
        existing.freightInformation = freightInformation;
      } else if (perBoxPackages.length) {
        existing.packages.push(...perBoxPackages);
      } else if (pkg) {
        for (let i = 0; i < boxCount; i += 1) {
          existing.packages.push(pkg);
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

  const fetchShippingOptions = async () => {
    if (typeof window === 'undefined') return; // rulează doar în browser
    const inboundPlanId = resolveInboundPlanId();
    let placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setShippingError('Lipsește inboundPlanId sau requestId; nu pot cere opțiunile de transport.');
      return;
    }

    if (!Array.isArray(packGroups) || packGroups.length === 0) {
      setShippingError('Nu avem packing groups încă. Reia Step 1b ca să obții packingOptions înainte de transport.');
      return;
    }

    const missingPackingGroupId = (packGroups || []).some((g) => !g.packingGroupId || isFallbackId(g.packingGroupId) || isFallbackId(g.id));
    if (missingPackingGroupId) {
      setShippingError('Packing groups nu au packingGroupId valid de la Amazon. Reia Step 1b ca să obții packingOptions.');
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
        console.log('Step2 missing pack details', (packGroups || []).map((g) => ({
          packingGroupId: g?.packingGroupId || g?.id || null,
          packMode: g?.packMode || null,
          perBoxDetailsCount: Array.isArray(g?.perBoxDetails) ? g.perBoxDetails.length : 0,
          boxDimensions: g?.boxDimensions || null,
          boxWeight: g?.boxWeight ?? null
        })));
        setShippingError('Completează greutatea și dimensiunile (L/W/H) pentru toate cutiile înainte de a cere tariful.');
        return;
      }
    }
    const windowError = validateDeliveryWindow();
    if (windowError) {
      setShippingError(windowError);
      return;
    }

    setShippingLoading(true);
    setShippingError('');
    try {
      const configs = buildShipmentConfigs();
      const contactInformation = resolveContactInformation();
      // log local pentru debug (nu trimite date sensibile)
      console.log('Step2 invoke fba-step2-confirm-shipping', {
        requestId,
        inboundPlanId,
        placementOptionId: placementOptId,
        configsCount: configs.length,
        selectedTransportationOptionId
      });
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
            setShippingError(`Amazon procesează requestul... încercare ${attempt}/${maxRetries}. Reîncerc automat.`);
            if (shippingRetryTimerRef.current) clearTimeout(shippingRetryTimerRef.current);
            shippingRetryTimerRef.current = setTimeout(() => {
              fetchShippingOptions();
            }, nextDelay);
            return;
          }
          setShippingError('Amazon încă procesează opțiunile. Reîncearcă manual în câteva secunde.');
          return;
        }
        setShippingError(json.error);
        setShippingOptions([]);
        setShippingSummary(null);
        return;
      }
      setShippingOptions(aggregateTransportationOptions(json.options || []));
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
        const fallbackById = new Map(
          (fallbackShipments || []).map((sh) => [String(sh.id || ""), sh])
        );
        setShipments(
          json.shipments.map((s) => {
            const fb = fallbackById.get(String(s.id || "")) || {};
            return {
              ...fb,
              ...s,
              weight: s.weight ?? fb.weight ?? null,
              source: "api"
            };
          })
        );
      }
    } catch (e) {
      // Supabase aruncă "Edge Function returned a non-2xx status code" fără detalii; încercăm să extragem mesajul din payload.
      const detail =
        e?.context?.error?.message ||
        e?.context?.response?.error?.message ||
        e?.context?.response?.data?.error ||
        e?.message ||
        "Failed to load shipping options";
      console.error("fetchShippingOptions failed", e);
      setShippingError(detail);
    } finally {
      setShippingLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedTransportationOptionId) return;
    const exists = (shippingOptions || []).some((opt) => opt?.id === selectedTransportationOptionId);
    if (!exists) setSelectedTransportationOptionId(null);
  }, [shippingOptions, selectedTransportationOptionId]);

  const confirmShippingOptions = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const placementOptId = placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    if (!inboundPlanId || !requestId) {
      setShippingError('Lipsește inboundPlanId sau requestId pentru confirmarea transportului.');
      return;
    }
    if (!selectedTransportationOptionId) {
      setShippingError('Selectează o opțiune de transport înainte de confirmare.');
      return;
    }
    if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
      const palletError = validatePalletDetails();
      if (palletError) {
        setShippingError(palletError);
        return;
      }
    }
    const windowError = validateDeliveryWindow();
    if (windowError) {
      setShippingError(windowError);
      return;
    }
    setShippingConfirming(true);
    setShippingError('');
    try {
      const configs = buildShipmentConfigs();
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
          ship_date: normalizeShipDate(shipmentMode?.deliveryDate) || null,
          transportation_option_id: selectedTransportationOptionId,
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
          setShippingError('Amazon procesează încă transportul. Reîncearcă confirmarea în câteva secunde.');
          return;
        }
        setShippingError(json.error);
        return;
      }
      if (Array.isArray(json.shipments) && json.shipments.length) {
        const fallbackShipments = deriveShipmentsFromPacking(shipments);
        const fallbackById = new Map(
          (fallbackShipments || []).map((sh) => [String(sh.id || ""), sh])
        );
        setShipments(
          json.shipments.map((s) => {
            const fb = fallbackById.get(String(s.id || "")) || {};
            return {
              ...fb,
              ...s,
              weight: s.weight ?? fb.weight ?? null,
              source: "api"
            };
          })
        );
      }
      setShippingOptions(aggregateTransportationOptions(json.options || []));
      setShippingSummary(json.summary || null);
      setShippingConfirmed(true);
      setCarrierTouched(true);
      completeAndNext('2');
    } catch (e) {
      const detail =
        e?.context?.error?.message ||
        e?.context?.response?.error?.message ||
        e?.context?.response?.data?.error ||
        e?.message ||
        "Failed to confirm shipping";
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
    resolveInboundPlanId,
    resolveRequestId,
    shipmentMode?.carrier?.partnered,
    shipmentMode?.deliveryDate,
    shipmentMode?.method,
    shipments
  ]);


  useEffect(() => {
    if (currentStep !== '2') {
      setStep2Loaded(false);
      return;
    }
    if (step2Loaded) return;
    if (historyMode && shippingConfirmed && (shippingOptions.length || shippingSummary)) {
      setStep2Loaded(true);
      return;
    }
    if (!shipmentMode?.deliveryDate) {
      setShipmentMode((prev) => ({ ...prev, deliveryDate: getTomorrowIsoDate() }));
    }
    fetchShippingOptions().finally(() => setStep2Loaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, step2Loaded]);

  useEffect(() => {
    setStep2Loaded(false);
  }, [packGroups, packingOptionId, placementOptionId, shipmentMode.method, shipmentMode.deliveryDate]);

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

      return {
        id: g?.shipmentId || g?.shipment_id || base?.shipmentId || base?.id || `s-${idx + 1}`,
        name: base?.name || `Shipment #${idx + 1}`,
        from: base?.from || formatAddress(plan?.shipFrom || {}),
        to: base?.to || plan?.marketplace || plan?.destination || '—',
        boxes: boxCount,
        skuCount: Number(g.skuCount || 0) || 0,
        units: Number(g.units || 0) || 0,
        weight: Number(g.boxWeight || 0) || null,
        capability: base?.capability || 'Standard',
        boxesDetail,
        source: 'local'
      };
    });
  };

  // Dacă nu avem shipments din backend, sau avem doar cele derivate local, recalculăm din packGroups + shipFrom
  useEffect(() => {
    const hasApiShipments = Array.isArray(shipments) && shipments.some((s) => s.source === 'api' || s.confirmed);
    const derived = deriveShipmentsFromPacking(shipments);
    if (hasApiShipments) return;
    const currentLocal = JSON.stringify((shipments || []).filter((s) => s.source === 'local'));
    const nextLocal = JSON.stringify(derived);
    if (currentLocal === nextLocal) return;
    setShipments(derived);
  }, [packGroups, plan?.shipFrom, plan?.marketplace, shipments]);

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
      return 'Completează pallet quantity, dimensiuni și greutate pentru LTL/FTL.';
    }
    if (!(declaredValue > 0) || !palletDetails.freightClass) {
      return 'Completează freight class și declared value pentru LTL/FTL.';
    }
    return null;
  };

  const validateDeliveryWindow = () => {
    // Delivery window va fi generată/confirmată via SP-API; nu mai cerem manual end-date în UI.
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
      setLabelsError('Lipsește inboundPlanId sau requestId pentru labels.');
      return;
    }
    const shipmentId = shipment?.shipmentId || shipment?.id;
    if (!shipmentId) {
      setLabelsError('Lipsește shipmentId pentru labels.');
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
        setLabelsError('Lipsește shipmentConfirmationId pentru labels. Reîncearcă după confirmarea transportului.');
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
        setLabelsError('Amazon nu a returnat un URL pentru labels.');
      }
    } catch (e) {
      setLabelsError(e?.message || 'Nu am putut genera labels.');
    } finally {
      setLabelsLoadingId(null);
    }
  };

  const loadInboundPlanBoxes = async () => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) return;
    setTrackingLoading(true);
    setTrackingError('');
    try {
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
      let normalized = boxes.map((b, idx) => ({
        id: b?.boxId || b?.packageId || b?.id || `box-${idx + 1}`,
        boxId: b?.boxId || b?.packageId || b?.id || null,
        box: idx + 1,
        label: b?.packageId || b?.boxId || b?.externalContainerIdentifier || `BOX-${idx + 1}`,
        trackingId: '',
        status: 'Pending',
        weight: b?.weight?.value || b?.weight?.amount || null,
        dimensions: b?.dimensions
          ? `${b.dimensions.length || ''} x ${b.dimensions.width || ''} x ${b.dimensions.height || ''}`
          : ''
      }));
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
      setTrackingError(e?.message || 'Nu am putut încărca boxes.');
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep !== '4') return;
    if (Array.isArray(tracking) && tracking.length) return;
    loadInboundPlanBoxes();
  }, [currentStep, tracking]);

  const handleTrackingChange = (id, value) => {
    setTracking((prev) => prev.map((row) => (row.id === id ? { ...row, trackingId: value } : row)));
  };

  const submitTrackingDetails = async () => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const shipmentId = (Array.isArray(shipments) && shipments[0]?.shipmentId) || shipments?.[0]?.id || null;
    if (!inboundPlanId || !requestId || !shipmentId) {
      setTrackingError('Lipsește inboundPlanId, requestId sau shipmentId pentru tracking.');
      return;
    }
    const items = (tracking || [])
      .filter((t) => t.trackingId && t.boxId)
      .map((t) => ({ boxId: t.boxId, trackingId: t.trackingId }));
    if (!items.length) {
      setTrackingError('Adaugă tracking pentru cel puțin o cutie.');
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
      if (data?.traceId) console.log('updateTracking traceId', data.traceId);
      completeAndNext('4');
    } catch (e) {
      setTrackingError(e?.message || 'Nu am putut trimite tracking.');
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
        await fetchPlan().then((response) => {
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
          setBlocking(Boolean(pBlocking));
          if (typeof pWarning === 'string') {
            const reqId = response.requestId || response.request_id || null;
            const trId = response.traceId || response.trace_id || null;
        const extra = [pWarning, reqId ? `RequestId: ${reqId}` : null, trId ? `TraceId: ${trId}` : null]
          .filter(Boolean)
          .join(' · ');
        setPlanError((prevError) => prevError || extra);
      }
      // Nu declanșăm automat Step 1b la refresh Step 1.
    });
  }
      setLoadingPlan(false);
      setPlanLoaded(true);
    },
    [fetchPlan, fetchShippingOptions, normalizePackGroups, snapshotServerUnits]
  );

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
      refreshPackingGroups();
    }
  };

  const persistStep1AndReloadPlan = useCallback(async () => {
    const isUuid = (val) => typeof val === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
    const requestId = resolveRequestId();
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
      setStep1SaveError('Setează cel puțin un produs cu cantitate > 0 înainte de a continua.');
      return;
    }
    if (!requestId) {
      completeAndNext('1');
      return;
    }
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

      const { error: resetErr } = await supabase
        .from('prep_requests')
        .update({
          inbound_plan_id: null,
          placement_option_id: null,
          packing_option_id: null,
          fba_shipment_id: null,
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
          'Amazon nu a returnat încă packing groups. Reîncearcă în câteva secunde.';
        setStep1SaveError(msg);
        return;
      }
      // asigură-te că avem inboundPlanId după reîncărcare, altfel nu trecem în 1b
      const inboundPlanId = resolveInboundPlanId();
      if (!inboundPlanId) {
        setStep1SaveError('Așteptăm inboundPlanId de la Amazon. Reîncearcă după câteva secunde.');
        return;
      }
      completeAndNext('1');
    } catch (e) {
      const message = e?.message || 'Nu am putut salva cantitățile.';
      // cod 42501 -> RLS blocked (ex: insert din upsert)
      if (String(e?.code) === '42501') {
        setStep1SaveError(`${message} (permisie RLS; reautentifică-te sau contactează un admin).`);
      } else {
        setStep1SaveError(message);
      }
    } finally {
      setStep1Saving(false);
    }
  }, [completeAndNext, fetchPlan, plan?.skus, refreshStep, resolveRequestId, snapshotServerUnits]);

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
          packGroupsPreview={packGroupsForUnits}
          packGroupsPreviewLoading={packingRefreshLoading}
          packGroupsPreviewError={packingReadyError}
          onChangePacking={handlePackingChange}
          onChangeQuantity={handleQuantityChange}
          onChangeExpiry={handleExpiryChange}
          onChangePrep={handlePrepChange}
          onNext={persistStep1AndReloadPlan}
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
            shipments,
            warning
          }}
          shippingOptions={shippingOptions}
          selectedTransportationOptionId={selectedTransportationOptionId}
          carrierTouched={carrierTouched}
          shippingConfirmed={shippingConfirmed}
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
          onBack={() => goToStep('2')}
          onNext={() => completeAndNext('3')}
        />
      );
    }
    return (
      <FbaStep4Tracking
        tracking={tracking}
        onUpdateTracking={handleTrackingChange}
        onBack={() => goToStep('3')}
        onFinish={submitTrackingDetails}
      />
    );
  };

  const skuCount = useMemo(() => (Array.isArray(plan?.skus) ? plan.skus.length : 0), [plan?.skus]);
  const unitCount = useMemo(
    () => (Array.isArray(plan?.skus) ? plan.skus.reduce((s, it) => s + (Number(it.units) || 0), 0) : 0),
    [plan?.skus]
  );
  const packUnits = useMemo(
    () => (Array.isArray(packGroups) ? packGroups.reduce((s, g) => s + (Number(g.units) || 0), 0) : 0),
    [packGroups]
  );
  const boxesCount = useMemo(
    () => (Array.isArray(packGroups) ? packGroups.reduce((s, g) => s + (Number(g.boxes) || 0), 0) : 0),
    [packGroups]
  );

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

  const isCompleted = (key) => completedSteps.includes(key);
  const step2Complete = isCompleted('2') && shippingConfirmed;
  const step3Complete = isCompleted('3') && Boolean(labelFormat);
  const step4Complete = isCompleted('4') && trackingSummary.tracked > 0;

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
            <Eye className="w-4 h-4" /> View/Edit
          </button>
          {canRefresh && (
            <button
              onClick={() => refreshStep(stepKey)}
              className="ml-2 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded-md px-2 py-1"
            >
              Refresh
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
        Send to Amazon
        <span className="text-xs text-slate-500 font-normal">UI aliniat la pașii Amazon (live)</span>
      </div>

      <div className="space-y-2">
        <StepRow
          stepKey="1"
          title="Step 1 - Confirmed inventory to send"
          subtitle={`SKUs: ${skuCount} · Units: ${unitCount} · Ship from: ${plan?.shipFrom?.name || plan?.shipFrom?.address || '—'}`}
          summary={plan?.marketplace ? `Marketplace: ${plan.marketplace}` : null}
        />
        <StepRow
          stepKey="1b"
          title="Step 1b - Pack individual units"
          subtitle={`Pack groups: ${packGroups?.length || 0} · Units: ${packUnits} · Boxes: ${boxesCount}`}
          summary={packGroups?.length ? 'You can start packing now' : 'No pack groups yet'}
        />
        <StepRow
          stepKey="2"
          title="Step 2 - Confirm shipping"
          subtitle={
            step2Complete
              ? `Destinations: ${shipmentSummary.dests} · Method: ${shipmentSummary.method} · Carrier: ${shipmentSummary.carrierName}`
              : 'Not started'
          }
          summary={step2Complete && shipmentMode?.deliveryDate ? `Delivery date: ${shipmentMode.deliveryDate}` : null}
        />
        <StepRow
          stepKey="3"
          title="Step 3 - Box labels printed"
          subtitle={step3Complete ? `Shipments: ${shipments?.length || 0}` : 'Not started'}
          summary={step3Complete ? `Label format: ${labelFormat}` : null}
        />
        <StepRow
          stepKey="4"
          title="Final step: Tracking details"
          subtitle={
            step4Complete
              ? `Boxes: ${trackingSummary.totalBoxes} · Tracking IDs: ${trackingSummary.tracked}`
              : 'Not started'
          }
          summary={step4Complete ? 'Tracking captured' : null}
        />
      </div>
    </div>
  );
}
