import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const getSafeDims = (dims = {}) => {
  const length = getSafeNumber(dims.length);
  const width = getSafeNumber(dims.width);
  const height = getSafeNumber(dims.height);
  if (length === null && width === null && height === null) return null;
  return { length: length || 0, width: width || 0, height: height || 0 };
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

const initialPackGroups = [
  {
    id: 'pack-1',
    title: 'Pack group 1',
    skuCount: 1,
    units: 33,
    boxes: 1,
    packMode: 'single',
    warning: 'Boxes that weigh more than 15 kg must be clearly marked “Heavy package” on the top and sides',
    image:
      'https://images.unsplash.com/photo-1582456891925-054d52d43a9c?auto=format&fit=crop&w=80&q=60'
  }
];

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
  initialShipmentMode = { method: 'SPD', deliveryDate: '01/12/2025', carrier: { partnered: false, name: 'UPS (non-partnered)' } },
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
  const normalizePackGroups = (groups = []) =>
    (Array.isArray(groups) ? groups : []).map((g, idx) => {
      const items = (g.items || []).map((it) => ({
        sku: it.sku || it.msku || it.SellerSKU || it.sellerSku || it.asin || '',
        quantity: Number(it.quantity || it.units || 0) || 0,
        image: it.image || it.thumbnail || it.main_image || it.img || null,
        title: it.title || it.name || null
      }));
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
    });
  const mergePackGroups = (prev = [], incoming = []) => {
    const prevByKey = new Map();
    prev.forEach((g) => {
      const key = g.id || g.packingGroupId;
      if (key) prevByKey.set(key, g);
    });
    return incoming.map((g) => {
      const key = g.id || g.packingGroupId;
      const existing = key ? prevByKey.get(key) : null;
      if (!existing) return g;
      return {
        ...g,
        boxDimensions: g.boxDimensions || existing.boxDimensions || null,
        boxWeight: g.boxWeight ?? existing.boxWeight ?? null,
        packingConfirmed: g.packingConfirmed || existing.packingConfirmed || false
      };
    });
  };
  const [packGroups, setPackGroups] = useState(normalizePackGroups(initialPacking));
  const [packingOptionId, setPackingOptionId] = useState(initialPlan?.packingOptionId || null);
  const [placementOptionId, setPlacementOptionId] = useState(initialPlan?.placementOptionId || null);
  const [shipmentMode, setShipmentMode] = useState(initialShipmentMode);
  const [shipments, setShipments] = useState(initialShipmentList);
  const [labelFormat, setLabelFormat] = useState('thermal');
  const [tracking, setTracking] = useState(initialTrackingList);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [skuStatuses, setSkuStatuses] = useState(initialSkuStatuses);
  const [blocking, setBlocking] = useState(false);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingSummary, setShippingSummary] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState('');

  // Persistăm ultimul pas vizitat ca să nu se piardă la refresh.
  const stepStorageKey = useMemo(() => {
    const reqId =
      plan?.requestId ||
      plan?.request_id ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      plan?.id ||
      initialPlan?.id ||
      "default";
    return `fba-wizard-step-${reqId}`;
  }, [plan?.requestId, plan?.request_id, plan?.id, initialPlan?.requestId, initialPlan?.request_id, initialPlan?.id]);
  const stateStorageKey = useMemo(() => {
    const reqId =
      plan?.requestId ||
      plan?.request_id ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      plan?.id ||
      initialPlan?.id ||
      "default";
    return `fba-wizard-state-${reqId}`;
  }, [plan?.requestId, plan?.request_id, plan?.id, initialPlan?.requestId, initialPlan?.request_id, initialPlan?.id]);
  const [restoredState, setRestoredState] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(stepStorageKey);
    if (saved && stepsOrder.includes(saved)) {
      setCurrentStep(saved);
    }
  }, [stepStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(stepStorageKey, String(currentStep));
  }, [currentStep, stepStorageKey]);

  // Rehidratează starea locală după refresh (similar cu "Active workflow" din Amazon)
  useEffect(() => {
    if (typeof window === 'undefined' || restoredState) return;
    const raw = window.localStorage.getItem(stateStorageKey);
    if (!raw) {
      setRestoredState(true);
      return;
    }
    try {
      const data = JSON.parse(raw);
      if (data?.plan) setPlan((prev) => ({ ...prev, ...data.plan }));
      if (Array.isArray(data?.packGroups)) setPackGroups(data.packGroups);
      if (data?.shipmentMode) setShipmentMode((prev) => ({ ...prev, ...data.shipmentMode }));
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
  }, [stateStorageKey, stepsOrder, restoredState]);

  // Persistă starea curentă ca să poți relua workflow-ul după refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const snapshot = {
      plan,
      packGroups,
      shipmentMode,
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
    plan,
    packGroups,
    shipmentMode,
    shipments,
    labelFormat,
    tracking,
    packingOptionId,
    placementOptionId,
    completedSteps,
    currentStep,
    stateStorageKey
  ]);

  useEffect(() => {
    if (!autoLoadPlan && !fetchPlan) return;
    let cancelled = false;
    loadPlan();
    return () => {
      cancelled = true;
    };

    async function loadPlan() {
      setLoadingPlan(true);
      setPlanError('');
      try {
        const response = fetchPlan ? await fetchPlan() : null;
        if (cancelled || !response) return;
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
        } else {
          setPlan((prev) => ({ ...prev, ...response }));
        }
        if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
        if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
        if (Array.isArray(pGroups)) {
          const normalized = normalizePackGroups(pGroups);
          setPackGroups((prev) => mergePackGroups(prev, normalized));
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
      } catch (e) {
        if (!cancelled) setPlanError(e?.message || 'Failed to load Amazon plan.');
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    }
  }, [autoLoadPlan, fetchPlan, normalizePackGroups]);

  const warning = useMemo(() => {
    if (shippingSummary && shippingSummary.partneredAllowed === false) {
      return 'Amazon a indicat că transportul partenereat nu este disponibil pentru aceste expedieri.';
    }
    return null;
  }, [shippingSummary]);

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
  };

  const handleExpiryChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, expiry: value } : sku))
    }));
    invalidateFrom('1');
  };

  const handlePackGroupUpdate = (groupId, patch) => {
    setPackGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
    invalidateFrom('1b');
  };

  const buildShipmentConfigs = () => {
    if (!Array.isArray(packGroups)) return [];

    const shipmentIdForGroup = (g, idx) => {
      if (Array.isArray(shipments) && shipments.length === 1) {
        const sh = shipments[0];
        return sh?.shipmentId || sh?.id || `s-1`;
      }
      return g.shipmentId || g.shipment_id || shipments?.[idx]?.shipmentId || shipments?.[idx]?.id || `s-${idx + 1}`;
    };

    return packGroups.map((g, idx) => {
      const dims = getSafeDims(g.boxDimensions);
      const weight = getSafeNumber(g.boxWeight);
      return {
        shipmentId: shipmentIdForGroup(g, idx),
        packingGroupId: g.packingGroupId || g.id,
        packages: [
          {
            dimensions: dims
              ? { length: dims.length, width: dims.width, height: dims.height, unit: "CM" }
              : null,
            weight: weight ? { value: weight, unit: "KG" } : null
          }
        ]
      };
    });
  };

  const fetchShippingOptions = async () => {
    if (typeof window === 'undefined') return; // rulează doar în browser
    const inboundPlanId =
      plan?.inboundPlanId || plan?.inbound_plan_id || plan?.planId || plan?.plan_id || null;
    let placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    const requestId =
      plan?.prepRequestId ||
      initialPlan?.prepRequestId ||
      plan?.requestId ||
      plan?.request_id ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      plan?.id ||
      initialPlan?.id ||
      null;
    if (!inboundPlanId || !requestId) {
      setShippingError('Lipsește inboundPlanId sau requestId; nu pot cere opțiunile de transport.');
      return;
    }

    // fallback: dacă nu avem placementOptionId, reapelează step1b edge func pentru a-l obține
    if (!placementOptId) {
      try {
        const { data: step1b, error: step1bErr } = await supabase.functions.invoke('fba-plan-step1b', {
          body: {
            request_id: requestId,
            inbound_plan_id: inboundPlanId,
            amazon_integration_id: plan?.amazonIntegrationId || plan?.amazon_integration_id || null
          }
        });
        if (step1bErr) throw step1bErr;
        placementOptId = step1b?.placementOptionId || step1b?.placement_option_id || null;
        if (placementOptId) {
          setPlacementOptionId(placementOptId);
          if (Array.isArray(step1b?.packingGroups)) {
            const normalized = normalizePackGroups(step1b.packingGroups);
            setPackGroups((prev) => mergePackGroups(prev, normalized));
          }
          if (Array.isArray(step1b?.shipments)) setShipments(step1b.shipments);
        }
      } catch (e) {
        console.warn('Step2 fallback placement fetch failed', e);
      }
    }
    if (!placementOptId) {
      setShippingError('Lipsește placementOptionId; finalizează Step 1b (placement) înainte de transport.');
      return;
    }

    // guard: avem nevoie de greutate + dimensiuni pentru toate grupurile
    const missingPack = (packGroups || []).find((g) => {
      const w = Number(g.boxWeight || 0);
      const d = g.boxDimensions || {};
      const L = Number(d.length || 0);
      const W = Number(d.width || 0);
      const H = Number(d.height || 0);
      return !(w > 0 && L > 0 && W > 0 && H > 0);
    });
    if (missingPack) {
      setShippingError('Completează greutatea și dimensiunile (L/W/H) pentru toate cutiile înainte de a cere tariful.');
      return;
    }

    // guard: validăm limitele Amazon pentru box (SPD) înainte de cerere
    const minDims = { L: 15.2, W: 10.0, H: 2.5 };
    const maxSide = 63.5;
    const minWeight = 0.15;
    const maxWeight = 23;
    const invalidBox = (packGroups || []).find((g) => {
      const w = Number(g.boxWeight || 0);
      const d = g.boxDimensions || {};
      const L = Number(d.length || 0);
      const W = Number(d.width || 0);
      const H = Number(d.height || 0);
      const sides = [L, W, H].sort((a, b) => b - a); // largest first
      return (
        w < minWeight ||
        w > maxWeight ||
        sides[0] > maxSide ||
        L < minDims.L ||
        W < minDims.W ||
        H < minDims.H
      );
    });
    if (invalidBox) {
      setShippingError(
        'Amazon limite: min 15.2×10×2.5 cm și 0.15 kg; max 63.5 cm pe orice latură și 23 kg per box (fără oversize). Ajustează dimensiunile/greutatea.'
      );
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
          shipping_mode: shipmentMode?.method || null,
          shipment_transportation_configurations: configs,
          ship_date: shipmentMode?.deliveryDate || null
        }
      });
      if (error) throw error;
      setShippingOptions(json.options || []);
      setShippingSummary(json.summary || null);
      if (Array.isArray(json.shipments) && json.shipments.length) {
        const fallbackShipments = deriveShipmentsFromPacking();
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
      // auto-select carrier from summary
      if (json.summary) {
        const preferredMode = shipmentMode.method || json.summary.defaultMode;
        const preferredRate = json.summary.defaultCharge ?? json.summary.partneredRate ?? shipmentMode.carrier?.rate ?? null;
        if (json.summary.partneredAllowed) {
          setShipmentMode((prev) => ({
            ...prev,
            carrier: { partnered: true, name: json.summary.defaultCarrier || "Amazon partnered", rate: preferredRate },
            method: preferredMode
          }));
        } else {
          setShipmentMode((prev) => ({
            ...prev,
            carrier: { partnered: false, name: json.summary.defaultCarrier || "Non Amazon partnered", rate: preferredRate },
            method: preferredMode
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

  useEffect(() => {
    if (currentStep !== '2') return;
    fetchShippingOptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, packGroups, packingOptionId, placementOptionId, plan?.inboundPlanId, plan?.requestId]);

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

  const deriveShipmentsFromPacking = () => {
    if (!Array.isArray(packGroups) || !packGroups.length) return [];
    const boxesDetail = [];
    packGroups.forEach((g) => {
      const boxCount = Math.max(1, Number(g.boxes) || 1);
      const dims = g.boxDimensions || {};
      for (let i = 0; i < boxCount; i++) {
        boxesDetail.push({
          groupId: g.id,
          length: dims.length || null,
          width: dims.width || null,
          height: dims.height || null,
          weight: g.boxWeight || null
        });
      }
    });

    const boxes = boxesDetail.length || packGroups.reduce((s, g) => s + (Number(g.boxes) || 0), 0);
    const skuCount = packGroups.reduce((s, g) => s + (Number(g.skuCount) || 0), 0);
    const units = packGroups.reduce((s, g) => s + (Number(g.units) || 0), 0);
    const weight = boxesDetail.reduce((s, b) => s + (Number(b.weight) || 0), 0);

    const baseShipment = Array.isArray(shipments) && shipments.length ? shipments[0] : null;
    const id = baseShipment?.id || baseShipment?.shipmentId || '1';
    const from = baseShipment?.from || formatAddress(plan?.shipFrom || {});
    const to = baseShipment?.to || plan?.marketplace || plan?.destination || '—';

    return [
      {
        id,
        name: baseShipment?.name || 'Shipment #1',
        from,
        to,
        boxes,
        skuCount,
        units,
        weight,
        capability: baseShipment?.capability || 'Standard',
        boxesDetail,
        source: 'local'
      }
    ];
  };

  // Dacă nu avem shipments din backend, sau avem doar cele derivate local, recalculăm din packGroups + shipFrom
  useEffect(() => {
    const hasApiShipments = Array.isArray(shipments) && shipments.some((s) => s.source === 'api' || s.confirmed);
    const derived = deriveShipmentsFromPacking();
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

  const handleTrackingChange = (id, value) => {
    setTracking((prev) => prev.map((row) => (row.id === id ? { ...row, trackingId: value } : row)));
  };

  const refreshStep = useCallback(
    async (stepKey) => {
      if (stepKey === '2' || stepKey === '3' || stepKey === '4') {
        await fetchShippingOptions();
        return;
      }
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
          } else {
            setPlan((prev) => ({ ...prev, ...response }));
          }
          if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
          if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
          if (Array.isArray(pGroups)) setPackGroups(normalizePackGroups(pGroups));
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
    },
    [fetchPlan, fetchShippingOptions, normalizePackGroups]
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
      setShipments([]);
      setTracking([]);
      setPackingOptionId(null);
      setPlacementOptionId(null);
    } else if (stepKey === '1b') {
      setShipments([]);
      setTracking([]);
      setPlacementOptionId(null);
    } else if (stepKey === '2') {
      setTracking([]);
    }
  };

  const completeAndNext = (stepKey) => {
    const idx = stepsOrder.indexOf(stepKey);
    setCompletedSteps((prev) => Array.from(new Set([...prev, stepKey])));
    const nextKey = stepsOrder[idx + 1] || stepKey;
    setCurrentStep(nextKey);
  };

  const goToStep = (stepKey) => {
    if (!stepsOrder.includes(stepKey)) return;
    setCurrentStep(stepKey);
  };

  const renderContent = (stepKey) => {
    if (stepKey === '1') {
      return (
        <FbaStep1Inventory
          data={plan}
          skuStatuses={skuStatuses}
          blocking={blocking}
          onChangePacking={handlePackingChange}
          onChangeQuantity={handleQuantityChange}
          onChangeExpiry={handleExpiryChange}
          onNext={() => completeAndNext('1')}
          error={planError}
        />
      );
    }
    if (stepKey === '1b') {
      return (
        <FbaStep1bPacking
          packGroups={packGroups}
          loading={loadingPlan}
          error={planError}
          onUpdateGroup={handlePackGroupUpdate}
          onNext={() => completeAndNext('1b')}
          onBack={() => goToStep('1')}
        />
      );
    }
    if (stepKey === '2') {
      return (
        <FbaStep2Shipping
          shipment={{
            deliveryDate: shipmentMode.deliveryDate,
            method: shipmentMode.method,
            carrier: shipmentMode.carrier,
            shipments,
            warning
          }}
          fetchPartneredQuote={shipmentMode.fetchPartneredQuote}
          onCarrierChange={handleCarrierChange}
          onModeChange={handleModeChange}
          onShipDateChange={(date) => setShipmentMode((prev) => ({ ...prev, deliveryDate: date }))}
          error={shippingError}
          onNext={() => completeAndNext('2')}
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
        onFinish={() => completeAndNext('4')}
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
