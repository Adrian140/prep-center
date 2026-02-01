import React from 'react';
import { CheckCircle, Printer } from 'lucide-react';

export default function FbaStep3Labels({
  shipments,
  labelFormat,
  onFormatChange,
  onPrint,
  printLoadingId,
  confirming,
  error,
  onBack,
  onNext
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 3 - Box labels printed</div>
        <div className="text-sm text-slate-500">After printing, shipment becomes Ready to ship</div>
      </div>

      {error ? (
        <div className="px-6 pt-4 text-sm text-rose-600">{error}</div>
      ) : null}

      <div className="px-6 py-4 space-y-4">
        {shipments.map((s) => (
          <div key={s.id} className="border border-slate-200 rounded-lg">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">{s.name}</div>
                <div className="text-sm text-slate-600">Ship from: {s.from}</div>
                <div className="text-sm text-slate-600">Ship to: {s.to}</div>
              </div>
              <div className="text-sm text-slate-600">Boxes: {s.boxes} · Units: {s.units}</div>
            </div>

            <div className="px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Printer className="w-5 h-5" />
                <span className="font-semibold">Print box labels</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={labelFormat}
                  onChange={(e) => onFormatChange(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm"
                >
                  <option value="letter">8.5" x 5.5" (US Letter)</option>
                  <option value="a4">99.1 x 139 mm (A4)</option>
                  <option value="thermal">Thermal 4" x 6"</option>
                </select>
                <button
                  onClick={() => onPrint?.(s)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold shadow-sm"
                  disabled={printLoadingId === s.id}
                >
                  {printLoadingId === s.id ? 'Generating…' : 'Print'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600">Apply the FBA box ID label to each box and carrier labels afterward.</div>
        <div className="flex gap-3 justify-end">
          <button onClick={onBack} className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md">
            Back
          </button>
          <button
            onClick={onNext}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold shadow-sm"
            disabled={confirming}
          >
            {confirming ? 'Finalizing…' : 'Continue to tracking'}
          </button>
        </div>
      </div>
    </div>
  );
}
