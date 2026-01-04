import React, { useEffect, useMemo, useState } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
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
  showLegacyToggle = true,
  autoLoadPlan = false,
  fetchPlan // optional async () => ({ shipFrom, marketplace, skus, packGroups, shipments, skuStatuses, warning, blocking })
}) {
  const [step, setStep] = useState(1);
  const [legacy, setLegacy] = useState(false);
  const [plan, setPlan] = useState(initialPlan);
  const normalizePackGroups = (groups = []) =>
    (Array.isArray(groups) ? groups : []).map((g, idx) => {
      const items = (g.items || []).map((it) => ({
        sku: it.sku || it.msku || it.SellerSKU || it.sellerSku || it.asin || '',
        quantity: Number(it.quantity || it.units || 0) || 0
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
    const saved = Number(window.localStorage.getItem(stepStorageKey));
    if (Number.isFinite(saved) && saved >= 1 && saved <= 5) {
      setStep(saved);
    }
  }, [stepStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(stepStorageKey, String(step));
  }, [step, stepStorageKey]);

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
      return;
    }
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku))
    }));
  };

  const handleQuantityChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, units: Math.max(0, value) } : sku))
    }));
  };

  const handleExpiryChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, expiry: value } : sku))
    }));
  };

  const handlePackGroupUpdate = (groupId, patch) => {
    setPackGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  };

  const handleCarrierChange = (carrier) => {
    setShipmentMode((prev) => ({ ...prev, carrier }));
  };

  const handleModeChange = (mode) => {
    setShipmentMode((prev) => ({ ...prev, method: mode }));
  };

  const handleTrackingChange = (id, value) => {
    setTracking((prev) => prev.map((row) => (row.id === id ? { ...row, trackingId: value } : row)));
  };

  const renderStep = () => {
    if (step === 1) {
      return (
        <FbaStep1Inventory
          data={plan}
          skuStatuses={skuStatuses}
          blocking={blocking}
          onChangePacking={handlePackingChange}
          onChangeQuantity={handleQuantityChange}
          onChangeExpiry={handleExpiryChange}
          onNext={() => setStep(1.5)}
          error={planError}
        />
      );
    }
    if (step === 1.5) {
      return (
        <FbaStep1bPacking
          packGroups={packGroups}
          loading={loadingPlan}
          error={planError}
          onUpdateGroup={handlePackGroupUpdate}
          onNext={() => setStep(2)}
          onBack={() => setStep(1)}
        />
      );
    }
    if (step === 2) {
      return (
        <FbaStep2Shipping
          shipment={{
            deliveryDate: shipmentMode.deliveryDate,
            method: shipmentMode.method,
            carrier: shipmentMode.carrier,
            shipments,
            warning
          }}
          onCarrierChange={handleCarrierChange}
          onModeChange={handleModeChange}
          onNext={() => setStep(3)}
          onBack={() => setStep(1.5)}
        />
      );
    }
    if (step === 3) {
      return (
        <FbaStep3Labels
          shipments={shipments}
          labelFormat={labelFormat}
          onFormatChange={setLabelFormat}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      );
    }
    return (
        <FbaStep4Tracking
          tracking={tracking}
          onUpdateTracking={handleTrackingChange}
          onBack={() => setStep(3)}
          onFinish={() => setStep(4)}
        />
      );
    };

  return (
    <div className="w-full mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-slate-800 font-semibold">
          Send to Amazon
          <span className="text-xs text-slate-500 font-normal">UI aliniat la pașii Amazon (live)</span>
        </div>
        {showLegacyToggle && (
          <button
            onClick={() => setLegacy((prev) => !prev)}
            className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800"
          >
            {legacy ? <ToggleLeft className="w-5 h-5" /> : <ToggleRight className="w-5 h-5" />}
            {legacy ? 'Folosește fluxul nou' : 'Revino la fluxul vechi'}
          </button>
        )}
      </div>

      {renderStep()}
    </div>
  );
}
