import React from 'react';
import { AlertTriangle, CheckCircle, Truck } from 'lucide-react';

export default function FbaStep2Shipping({ shipment, onCarrierChange, onModeChange, onNext, onBack }) {
  const { deliveryDate, method, carrier, shipments, warning } = shipment;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 2 - Confirm shipping</div>
        <div className="text-sm text-slate-500">Delivery date: {deliveryDate}</div>
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="flex flex-wrap gap-3 text-sm text-slate-700">
          <div className="px-3 py-2 rounded-md border border-slate-200 bg-slate-50">
            Method: <strong>{method}</strong>
          </div>
          <div className="px-3 py-2 rounded-md border border-slate-200 bg-slate-50">Number of shipments: {shipments.length}</div>
        </div>

        {warning && (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 rounded-md text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5" /> {warning}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="font-semibold text-slate-900">Select shipping carrier</div>
            <div className="flex flex-col gap-2">
              <label className={`flex items-center gap-2 px-3 py-2 border rounded-md ${carrier.partnered ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <input
                  type="radio"
                  checked={carrier.partnered}
                  onChange={() => onCarrierChange({ partnered: true, name: 'UPS (partnered)' })}
                />
                UPS (Amazon-partnered carrier)
              </label>
              <label className={`flex items-center gap-2 px-3 py-2 border rounded-md ${!carrier.partnered ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <input
                  type="radio"
                  checked={!carrier.partnered}
                  onChange={() => onCarrierChange({ partnered: false, name: carrier.name || 'Non-partnered carrier' })}
                />
                Non Amazon partnered carrier
              </label>
              {!carrier.partnered && (
                <select
                  value={carrier.name || ''}
                  onChange={(e) => onCarrierChange({ partnered: false, name: e.target.value })}
                  className="border rounded-md px-3 py-2 text-sm"
                >
                  <option value="UPS (non-partnered)">UPS (non-partnered)</option>
                  <option value="DHL">DHL</option>
                  <option value="Chronopost">Chronopost</option>
                </select>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="font-semibold text-slate-900">Shipping mode</div>
            <div className="flex flex-col gap-2">
              <label className={`flex items-center gap-2 px-3 py-2 border rounded-md ${method === 'SPD' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <input type="radio" checked={method === 'SPD'} onChange={() => onModeChange('SPD')} />
                <span className="flex items-center gap-2"><Truck className="w-4 h-4" /> Small parcel delivery (SPD)</span>
              </label>
              <label className={`flex items-center gap-2 px-3 py-2 border rounded-md ${method === 'LTL' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                <input type="radio" checked={method === 'LTL'} onChange={() => onModeChange('LTL')} />
                Less than truckload (LTL / FTL)
              </label>
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg">
          {shipments.map((s) => (
            <div key={s.id} className="px-4 py-3 border-b last:border-b-0 border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">Shipment #{s.id}</div>
                <div className="text-sm text-slate-600">Boxes: {s.boxes} · SKUs: {s.skuCount} · Units: {s.units}</div>
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Ship from: {s.from}
              </div>
              <div className="text-sm text-slate-600">Ship to: {s.to}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600">Review carrier charges before continuing.</div>
        <div className="flex gap-3 justify-end">
          <button onClick={onBack} className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md">
            Back
          </button>
          <button
            onClick={onNext}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold shadow-sm"
          >
            Continue to labels
          </button>
        </div>
      </div>
    </div>
  );
}
