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
    deliveryDate: '01/12/2025',
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
    carrier: { partnered: false, name: 'UPS (non-partnered)' }
  },
  initialShipmentList = initialShipments,
  initialTrackingList = initialTracking,
  initialSkuStatuses = [],
  autoLoadPlan = false,
  fetchPlan // optional async () => ({ shipFrom, marketplace, skus, packGroups, shipments, skuStatuses, warning, blocking })
}) {
  const stepsOrder = ['1', '1b', '2', '3', '4'];
  const [currentStep, setCurrentStep] = useState('1');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [plan, setPlan] = useState(initialPlan);
  const allowPersistence = false; // forțează reluarea workflow-ului de la Step 1; nu restaurăm din localStorage
  const normalizePackGroups = useCallback((groups = []) =>
    (Array.isArray(groups) ? groups : [])
      .map((g, idx) => {
        const items = (g.items || [])
          .map((it) => ({
            sku: it.sku || it.msku || it.SellerSKU || it.sellerSku || it.asin || '',
            quantity: Number(it.quantity || it.units || 0) || 0,
            image: it.image || it.thumbnail || it.main_image || it.img || null,
            title: it.title || it.name || null
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
          packingConfirmed: Boolean(g.packingConfirmed)
        };
      })
      .filter((g) => Number(g.units || 0) > 0), // nu trimitem grupuri cu 0 unități
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
    const prevBySignature = new Map();
    prev.forEach((g) => {
      const key = getPackGroupKey(g);
      if (key) prevByKey.set(key, g);
      const signature = getPackGroupSignature(g);
      if (signature) prevBySignature.set(signature, g);
    });
    return incoming.map((g, idx) => {
      const key = getPackGroupKey(g);
      let existing = key ? prevByKey.get(key) : null;
      if (!existing) {
        const signature = getPackGroupSignature(g);
        if (signature) existing = prevBySignature.get(signature) || null;
      }
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
      return {
        ...g,
        boxDimensions: resolvedDims,
        boxWeight: incomingWeight ?? existingWeight ?? null,
        boxes: g.boxes ?? existing.boxes ?? 1,
        packingConfirmed: g.packingConfirmed || existing.packingConfirmed || false
      };
    });
  }, [getPackGroupKey, getPackGroupSignature]);
  const [packGroups, setPackGroups] = useState([]);
  const [packGroupsLoaded, setPackGroupsLoaded] = useState(false);
  const [packingOptionId, setPackingOptionId] = useState(initialPlan?.packingOptionId || null);
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
  const [labelFormat, setLabelFormat] = useState('thermal');
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
  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingSummary, setShippingSummary] = useState(null);
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
  const shippingRetryRef = useRef(0);
  const shippingRetryTimerRef = useRef(null);
  const planMissingRetryRef = useRef(0);
  useEffect(() => {
    packGroupsRef.current = packGroups;
  }, [packGroups]);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
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
    if (shipmentMode?.carrier?.partnered) return;
    setShipmentMode((prev) => ({
      ...prev,
      carrier: { partnered: true, name: 'UPS (Amazon-partnered carrier)', rate: prev?.carrier?.rate ?? null }
    }));
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

    setCurrentStep('1');
    setCompletedSteps([]);
    setPlan(initialPlan);
    snapshotServerUnits(initialPlan?.skus || []);
    setPackGroups(normalizedInitialGroups);
    setPackGroupsLoaded(hasRealPackGroups(normalizedInitialGroups));
    setShipmentMode(initialShipmentMode);
    setShipments(initialShipmentList);
    setLabelFormat('thermal');
    setTracking(initialTrackingList);
    setPackingOptionId(initialPlan?.packingOptionId || null);
    setPlacementOptionId(initialPlan?.placementOptionId || null);
    setPlanError('');
    setPackingSubmitError('');
    setPackingReadyError('');
    setShippingError('');
    setShippingOptions([]);
    setShippingSummary(null);
    setStep2Loaded(false);
    setRestoredState(false);
  }, [
    storageKeyBase,
    initialPlan,
    initialPackGroups,
    initialShipmentMode,
    initialShipmentList,
    initialTrackingList,
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
    if (typeof window === 'undefined') return;
    if (stepStorageKey) window.localStorage.removeItem(stepStorageKey);
    if (stateStorageKey) window.localStorage.removeItem(stateStorageKey);
    setCurrentStep('1');
    setCompletedSteps([]);
  }, [stateStorageKey, stepStorageKey]);

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
          blocking: pBlocking
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
          skus: pSkus
        } = response;
        if (pFrom && pMarket && Array.isArray(pSkus)) {
          setPlan((prev) => ({ ...prev, ...response, shipFrom: pFrom, marketplace: pMarket, skus: pSkus }));
          snapshotServerUnits(pSkus);
        } else {
          setPlan((prev) => ({ ...prev, ...response }));
          if (Array.isArray(response?.skus)) snapshotServerUnits(response.skus);
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
  const returnedModes = shippingSummary?.returnedModes || [];
  const wantsSpd = String(shipmentMode?.method || '').toUpperCase() === 'SPD';
  if (wantsSpd && returnedModes.length && !returnedModes.includes('GROUND_SMALL_PARCEL')) {
    return 'Amazon nu a returnat opțiuni SPD pentru aceste colete. Verifică dimensiuni/greutate sau alege LTL/FTL.';
  }
  if (shippingSummary && shippingSummary.partneredAllowed === false && !shippingSummary?.alreadyConfirmed) {
    return 'Amazon a indicat că transportul partenereat nu este disponibil pentru aceste expedieri.';
  }
  return null;
}, [shippingSummary, shippingLoading, step2Loaded, shipmentMode?.method]);

const fetchPartneredQuote = useCallback(
  ({ hazmat }) => {
    const allowed = shippingSummary?.alreadyConfirmed ? true : (shippingSummary?.partneredAllowed ?? !hazmat);
    const rate =
      typeof shippingSummary?.partneredRate === 'number'
        ? shippingSummary.partneredRate
        : typeof shippingSummary?.defaultCharge === 'number'
          ? shippingSummary.defaultCharge
            : null;
    const reason =
      shippingSummary?.alreadyConfirmed
        ? ''
        : shippingSummary?.partneredAllowed === false
          ? 'Amazon partnered carrier not available for this plan.'
          : hazmat
            ? 'Hazmat items are not eligible for partnered carrier.'
            : '';
    return { allowed, rate, reason };
  },
  [shippingSummary]
);

  // când intrăm în 1b și nu avem încă packing groups reale, declanșăm fetch automat
  useEffect(() => {
    if (currentStep !== '1b') return;
    const hasRealGroups = hasRealPackGroups(packGroups);
    if (packGroupsLoaded || hasRealGroups) return;
    if (packingRefreshLoading || loadingPlan) return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) return;
    refreshPackingGroups();
  }, [currentStep, packGroupsLoaded, packGroups, packingRefreshLoading, loadingPlan, resolveInboundPlanId, resolveRequestId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handlePackGroupUpdate = (groupId, patch) => {
    setPackGroups((prev) =>
      prev.map((g) =>
        g.id === groupId || g.packingGroupId === groupId ? { ...g, ...patch } : g
      )
    );
  };

  const buildPackingPayload = (groups = packGroups) => {
    if (!Array.isArray(groups) || groups.length === 0) {
      return { packingGroups: [], missingGroupId: false };
    }

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

      packingGroupsPayload.push({
        packingGroupId,
        boxes: count,
        packMode: g.packMode || "single",
        dimensions: normalizedDims,
        weight: normalizedWeight,
        items: Array.isArray(g.items)
          ? g.items.map((it) => ({
              sku: it.sku || it.msku || it.SellerSKU || null,
              quantity: Number(it.quantity || 0) || 0
            }))
          : []
      });
    });

    return { packingGroups: packingGroupsPayload, missingGroupId };
  };

  const submitPackingInformation = async (payload = {}) => {
    const inboundPlanId = resolveInboundPlanId();
    const packingOptId =
      packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null;
    const requestId = resolveRequestId();
    const placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;

    if (!inboundPlanId || !packingOptId || !requestId) {
      setPackingSubmitError('Lipsește inboundPlanId sau packingOptionId; finalizează Step 1 înainte de confirmare.');
      return;
    }

    const derivedPayload = buildPackingPayload();
    const packingGroupsPayload =
      Array.isArray(payload.packingGroups) && payload.packingGroups.length ? payload.packingGroups : derivedPayload.packingGroups;

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
      if (!refreshRes?.ok) {
        const trace = refreshRes?.traceId ? ` TraceId ${refreshRes.traceId}` : '';
        throw new Error(
          refreshRes?.message ||
          `Packing groups nu sunt gata încă.${trace}`
        );
      }

      const { data, error } = await supabase.functions.invoke('fba-set-packing-information', {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          packing_option_id: packingOptId,
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

  const refreshPackingGroups = async () => {
    if (typeof window === 'undefined') return { ok: false, code: 'NO_WINDOW' };
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setPackingReadyError('Lipsește inboundPlanId sau requestId; reîncarcă planul.');
      return { ok: false, code: 'MISSING_IDS' };
    }
    // păstrăm grupurile existente; doar marcăm loading
    setPackGroupsLoaded(hasRealPackGroups(packGroups));
    setPackingRefreshLoading(true);
    setPackingReadyError('');
    const attemptFetch = async () => {
      const { data, error } = await supabase.functions.invoke('fba-plan-step1b', {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          amazon_integration_id: plan?.amazonIntegrationId || plan?.amazon_integration_id || null
        }
      });
      if (error) throw error;
      if (data?.code === 'PACKING_GROUPS_NOT_READY') {
        const trace = data?.traceId || data?.trace_id || null;
        const msg = data?.message || 'Amazon nu a returnat încă packing groups. Reîncearcă în câteva secunde.';
        setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
        if (!hasRealPackGroups(packGroups)) {
          setPackGroups([]); // nu afișăm nimic local dacă nu avem packing groups reale
        }
        return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: msg, traceId: trace };
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
        return { ok: true, code: 'PLACEMENT_ALREADY_ACCEPTED' };
      }
      if (data?.packingOptionId) setPackingOptionId(data.packingOptionId);
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
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
          // înlocuim cu grupurile noi de la Amazon (evităm să rămână ID-uri vechi din alte planuri)
          setPackGroups(filtered);
          // sincronizează packingOptionId în plan ca să nu trimitem un ID vechi la setPackingInformation
          setPlan((prev) => ({
            ...prev,
            packingOptionId: data?.packingOptionId || prev?.packingOptionId || null,
            packing_option_id: data?.packingOptionId || prev?.packing_option_id || null,
            inboundPlanId,
            inbound_plan_id: inboundPlanId
          }));
          return { ok: true };
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
    }
  };

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
      } else if (pkg) {
        for (let i = 0; i < boxCount; i += 1) {
          existing.packages.push(pkg);
        }
      }
      byShipment.set(shId, existing);
    });

    return Array.from(byShipment.values());
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
        const dims = getSafeDims(g.boxDimensions);
        const w = getPositiveNumber(g.boxWeight);
        return !(dims && w);
      });
      if (missingPack) {
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
      // log local pentru debug (nu trimite date sensibile)
      console.log('Step2 invoke fba-step2-confirm-shipping', {
        requestId,
        inboundPlanId,
        placementOptionId: placementOptId,
        configsCount: configs.length
      });
      const { data: json, error } = await supabase.functions.invoke("fba-step2-confirm-shipping", {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptId,
          packing_option_id: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
          shipping_mode: shipmentMode?.method || null,
          shipment_transportation_configurations: configs,
          ship_date: normalizeShipDate(shipmentMode?.deliveryDate) || null,
          force_partnered_if_available: true,
          force_partnered_only: forcePartneredOnly,
          confirm: false
        }
      });
      if (error) throw error;
      if (json?.error) {
        if (json?.code === 'SHIPMENTS_PENDING') {
          const maxRetries = 5;
          const nextDelay = Number(json?.retryAfterMs || 5000);
          const attempt = shippingRetryRef.current + 1;
          if (attempt <= maxRetries) {
            shippingRetryRef.current = attempt;
            setShippingError(`Amazon generează shipments... încercare ${attempt}/${maxRetries}. Reîncerc automat.`);
            if (shippingRetryTimerRef.current) clearTimeout(shippingRetryTimerRef.current);
            shippingRetryTimerRef.current = setTimeout(() => {
              fetchShippingOptions();
            }, nextDelay);
            return;
          }
          setShippingError('Amazon încă nu a generat shipments. Reîncearcă manual în câteva secunde.');
          return;
        }
        setShippingError(json.error);
        setShippingOptions([]);
        setShippingSummary(null);
        return;
      }
      setShippingOptions(json.options || []);
      setShippingSummary(json.summary || null);
      shippingRetryRef.current = 0;
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
      // auto-select carrier (prefer partnered if available)
      if (json.summary || Array.isArray(json.options)) {
        const preferredMode = normalizeUiMode(shipmentMode.method || json.summary?.defaultMode);
        const preferredRate = json.summary?.defaultCharge ?? json.summary?.partneredRate ?? shipmentMode.carrier?.rate ?? null;
        const alreadyConfirmed = Boolean(json.alreadyConfirmed || json.summary?.alreadyConfirmed);
        const partneredOpt = Array.isArray(json.options)
          ? json.options.find((o) => detectPartneredOption(o))
          : null;
        const hasPartnered = Boolean(
          partneredOpt ||
          json.summary?.partneredAllowed === true ||
          typeof json.summary?.partneredRate === "number"
        );
        const allowPartnered = hasPartnered || alreadyConfirmed;
        if (forcePartneredOnly && !allowPartnered) {
          setShippingError('Amazon partnered carrier nu este disponibil pentru acest shipment.');
        }
        const nextMethod = shipmentMode.method || preferredMode;
        if (allowPartnered) {
          setShipmentMode((prev) => ({
            ...prev,
            carrier: {
              partnered: true,
              name: partneredOpt?.carrierName || json.summary?.defaultCarrier || (alreadyConfirmed ? "Amazon confirmed carrier" : "Amazon partnered"),
              rate: preferredRate
            },
            method: nextMethod
          }));
        } else {
          setShipmentMode((prev) => ({
            ...prev,
            carrier: { partnered: false, name: json.summary?.defaultCarrier || "Non Amazon partnered", rate: preferredRate },
            method: nextMethod
          }));
        }
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

  const confirmShippingOptions = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const placementOptId = placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    if (!inboundPlanId || !requestId) {
      setShippingError('Lipsește inboundPlanId sau requestId pentru confirmarea transportului.');
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
      const forcePartneredIfAvailable = forcePartneredOnly ? true : Boolean(shipmentMode?.carrier?.partnered);
      const configs = buildShipmentConfigs();
      const { data: json, error } = await supabase.functions.invoke("fba-step2-confirm-shipping", {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptId,
          packing_option_id: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
          shipping_mode: shipmentMode?.method || null,
          shipment_transportation_configurations: configs,
          ship_date: normalizeShipDate(shipmentMode?.deliveryDate) || null,
          force_partnered_if_available: forcePartneredIfAvailable,
          force_partnered_only: forcePartneredOnly,
          confirm: true
        }
      });
      if (error) throw error;
      if (json?.error) {
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
      setShippingOptions(json.options || []);
      setShippingSummary(json.summary || null);
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
    return normalized;
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

  const formatToPageType = (format) => {
    if (format === 'letter') return 'PackageLabel_Letter_2';
    if (format === 'a4') return 'PackageLabel_A4_2';
    return 'PackageLabel_Thermal';
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
        shipmentId;
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'get_labels_v0',
          request_id: requestId,
          shipment_id: confirmationId,
          page_type: formatToPageType(labelFormat),
          label_type: 'BARCODE_2D',
          number_of_packages: Number(shipment?.boxes || 0) || undefined
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
      const normalized = boxes.map((b, idx) => ({
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
            blocking: pBlocking
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
    } else if (stepKey === '1b') {
      setShipments([]);
      setTracking([]);
      setPackGroupsLoaded(false);
    } else if (stepKey === '2') {
      setTracking([]);
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
  };

  const persistStep1AndReloadPlan = useCallback(async () => {
    const requestId = resolveRequestId();
    const updates = (Array.isArray(plan?.skus) ? plan.skus : [])
      .map((sku) => {
        if (!sku?.id) return null;
        const qty = Math.max(0, Number(sku.units) || 0);
        return { id: sku.id, units_sent: qty };
      })
      .filter(Boolean);
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
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        const res = await refreshPackingGroups();
        if (res?.ok) return { ok: true };
        if (res?.code !== 'PACKING_GROUPS_NOT_READY') return res;
        if (attempt < maxAttempts) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        }
      }
      return { ok: false, code: 'PACKING_GROUPS_NOT_READY' };
    };
    try {
      // upsert declanșa RLS pe INSERT; facem update punctual pe fiecare id (chiar dacă aparent nu s-au schimbat,
      // ca să sincronizăm serverul înainte de a recrea inbound plan-ul)
      for (const row of updates) {
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
          fba_shipment_id: null
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
          packGroups={packGroups}
          packGroupsLoaded={packGroupsLoaded}
          loading={loadingPlan || packingRefreshLoading}
          error={planError || packingReadyError || packingSubmitError}
          onRetry={refreshPackingGroups}
          retryLoading={packingRefreshLoading}
          submitting={packingSubmitLoading}
          onUpdateGroup={handlePackGroupUpdate}
          onNext={submitPackingInformation}
          onBack={() => goToStep('1')}
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
          fetchPartneredQuote={fetchPartneredQuote}
          forcePartneredOnly={forcePartneredOnly}
          onCarrierChange={handleCarrierChange}
          onModeChange={handleModeChange}
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
          subtitle={`Destinations: ${shipmentSummary.dests} · Method: ${shipmentSummary.method} · Carrier: ${shipmentSummary.carrierName}`}
          summary={shipmentMode?.deliveryDate ? `Delivery date: ${shipmentMode.deliveryDate}` : null}
        />
        <StepRow
          stepKey="3"
          title="Step 3 - Box labels printed"
          subtitle={`Shipments: ${shipments?.length || 0}`}
          summary={`Label format: ${labelFormat}`}
        />
        <StepRow
          stepKey="4"
          title="Final step: Tracking details"
          subtitle={`Boxes: ${trackingSummary.totalBoxes} · Tracking IDs: ${trackingSummary.tracked}`}
          summary={trackingSummary.tracked ? 'Tracking captured' : 'Enter tracking details'}
        />
      </div>
    </div>
  );
}
