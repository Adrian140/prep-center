import React, { useMemo, useState } from 'react';
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

export default function FbaSendToAmazonWizard() {
  const [step, setStep] = useState(1);
  const [legacy, setLegacy] = useState(false);
  const [plan, setPlan] = useState(initialData);
  const [packGroups, setPackGroups] = useState(initialPackGroups);
  const [shipmentMode, setShipmentMode] = useState({ method: 'SPD', deliveryDate: '01/12/2025', carrier: { partnered: false, name: 'UPS (non-partnered)' } });
  const [shipments, setShipments] = useState(initialShipments);
  const [labelFormat, setLabelFormat] = useState('letter');
  const [tracking, setTracking] = useState(initialTracking);

  const warning = useMemo(
    () =>
      shipmentMode.carrier.partnered
        ? null
        : 'UPS (Amazon-partnered carrier) is unavailable because one or more shipments contain dangerous goods',
    [shipmentMode.carrier.partnered]
  );

  const handlePackingChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, packing: value } : sku))
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
          onChangePacking={handlePackingChange}
          onChangeQuantity={handleQuantityChange}
          onChangeExpiry={handleExpiryChange}
          onNext={() => setStep(1.5)}
        />
      );
    }
    if (step === 1.5) {
      return (
        <FbaStep1bPacking
          packGroups={packGroups}
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
          Send to Amazon (beta)
          <span className="text-xs text-slate-500 font-normal">Mock UI aligned to Amazon steps</span>
        </div>
        <button
          onClick={() => setLegacy((prev) => !prev)}
          className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800"
        >
          {legacy ? <ToggleLeft className="w-5 h-5" /> : <ToggleRight className="w-5 h-5" />}
          {legacy ? 'Use legacy flow' : 'Use new Send to Amazon'}
        </button>
      </div>

      {renderStep()}
    </div>
  );
}
