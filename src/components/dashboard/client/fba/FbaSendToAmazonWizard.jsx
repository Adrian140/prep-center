import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../../config/supabase';
import { CheckCircle2, Circle, Eye } from 'lucide-react';
import FbaStep1Inventory from './FbaStep1Inventory';
import FbaStep1bPacking from './FbaStep1bPacking';
import FbaStep2Shipping from './FbaStep2Shipping';
import FbaStep3Labels from './FbaStep3Labels';
import FbaStep4Tracking from './FbaStep4Tracking';

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
  const [packGroups, setPackGroups] = useState(normalizePackGroups(initialPacking));
  const [packingOptionId, setPackingOptionId] = useState(initialPlan?.packingOptionId || null);
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

  useEffect(() => {
    if (!autoLoadPlan && !fetchPlan) return;
    let cancelled = false;
    const loadPlan = async () => {
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
          // păstrează și câmpuri suplimentare (ex. companyId) din response
          setPlan((prev) => ({ ...prev, ...response, shipFrom: pFrom, marketplace: pMarket, skus: pSkus }));
        } else {
          // fallback: măcar atașează restul câmpurilor (companyId etc.)
          setPlan((prev) => ({ ...prev, ...response }));
        }
        if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
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
      } catch (e) {
        if (!cancelled) setPlanError(e?.message || 'Failed to load Amazon plan.');
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    };
    loadPlan();
    return () => {
      cancelled = true;
    };
  }, [autoLoadPlan, fetchPlan]);

  const warning = useMemo(() => {
    if (!shipmentMode?.carrier) return null;
    return shipmentMode.carrier.partnered
      ? null
      : 'UPS (Amazon-partnered carrier) is unavailable because one or more shipments contain dangerous goods';
  }, [shipmentMode?.carrier?.partnered]);

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
    return packGroups.map((g, idx) => {
      const dims = getSafeDims(g.boxDimensions);
      const weight = getSafeNumber(g.boxWeight);
      return {
        shipmentId: `s-${idx + 1}`,
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
    const inboundPlanId =
      plan?.inboundPlanId || plan?.inbound_plan_id || plan?.planId || plan?.plan_id || null;
    const placementOptionId = packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null;
    const requestId = plan?.requestId || plan?.request_id || initialPlan?.requestId || initialPlan?.request_id || null;
    if (!inboundPlanId || !requestId) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;
    if (!accessToken) {
      setShippingError('Autentificare necesară pentru a încărca opțiunile de transport.');
      return;
    }
    setShippingLoading(true);
    setShippingError('');
    try {
      const configs = buildShipmentConfigs();
      const { data: json, error } = await supabase.functions.invoke("fba-step2-confirm-shipping", {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptionId,
          shipment_transportation_configurations: configs
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (error) throw error;
      setShippingOptions(json.options || []);
      setShippingSummary(json.summary || null);
      if (Array.isArray(json.shipments) && json.shipments.length) {
        setShipments(json.shipments.map((s) => ({ ...s, source: "api" })));
      }
      // auto-select carrier from summary
      if (json.summary) {
        if (json.summary.partneredAllowed) {
          setShipmentMode((prev) => ({
            ...prev,
            carrier: { partnered: true, name: json.summary.defaultCarrier || "Amazon partnered", rate: json.summary.partneredRate },
            method: json.summary.defaultMode || prev.method
          }));
        } else {
          setShipmentMode((prev) => ({
            ...prev,
            carrier: { partnered: false, name: json.summary.defaultCarrier || "Non Amazon partnered" },
            method: json.summary.defaultMode || prev.method
          }));
        }
      }
    } catch (e) {
      setShippingError(e?.message || "Failed to load shipping options");
    } finally {
      setShippingLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep !== '2') return;
    fetchShippingOptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, packGroups, packingOptionId, plan?.inboundPlanId, plan?.requestId]);

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

    const from = formatAddress(plan?.shipFrom || {});
    const to = plan?.marketplace || plan?.destination || '—';

    return [
      {
        id: '1',
        name: 'Shipment #1',
        from,
        to,
        boxes,
        skuCount,
        units,
        weight,
        capability: 'Standard',
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
    } else if (stepKey === '1b') {
      setShipments([]);
      setTracking([]);
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
    const carrierName = shipmentMode?.carrier?.name || shipmentMode?.carrier?.code || '—';
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
