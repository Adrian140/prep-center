import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

const FieldLabel = ({ label, children }) => (
  <div className="flex flex-col gap-1 text-sm text-slate-700">
    <span className="font-semibold text-slate-800">{label}</span>
    {children}
  </div>
);

export default function FbaStep1Inventory({
  data,
  onChangePacking,
  onChangeQuantity,
  onChangeExpiry,
  onNext
}) {
  const { shipFrom, marketplace, skus } = data;
  const totalUnits = skus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 1 - Confirmed inventory to send</div>
        <div className="text-sm text-slate-500">SKUs confirmed ({skus.length})</div>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-b border-slate-200">
        <FieldLabel label="Ship from">
          <div className="text-slate-800">{shipFrom.name}</div>
          <div className="text-slate-600 text-sm">{shipFrom.address}</div>
        </FieldLabel>
        <FieldLabel label="Marketplace destination">
          <select
            value={marketplace}
            className="border rounded-md px-3 py-2 text-sm w-full bg-slate-100 text-slate-800"
            disabled
          >
            <option value={marketplace}>{marketplace}</option>
          </select>
        </FieldLabel>
      </div>

      <div className="px-6 py-4 overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead>
            <tr className="text-left text-slate-500 uppercase text-xs">
              <th className="py-2">SKU details</th>
              <th className="py-2">Packing details</th>
              <th className="py-2">Information / action</th>
              <th className="py-2">Quantity to send</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {skus.map((sku) => (
              <tr key={sku.id} className="align-top">
                <td className="py-3">
                  <div className="font-semibold text-slate-900 hover:text-blue-700 cursor-pointer">
                    {sku.title}
                  </div>
                  <div className="text-xs text-slate-500">SKU: {sku.sku}</div>
                  <div className="text-xs text-slate-500">ASIN: {sku.asin}</div>
                  <div className="text-xs text-slate-500">Storage: {sku.storageType}</div>
                </td>
                <td className="py-3">
                  <select
                    value={sku.packing}
                    onChange={(e) => onChangePacking(sku.id, e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm w-full"
                  >
                    <option value="individual">Individual units</option>
                    <option value="case">Case packed</option>
                  </select>
                </td>
                <td className="py-3">
                  {sku.prepRequired ? (
                    <div className="flex items-start gap-2 text-amber-700">
                      <AlertCircle className="w-4 h-4 mt-0.5" />
                      <div>
                        <div className="font-semibold">Prep required</div>
                        <div className="text-xs text-slate-600">{sku.prepNotes}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-700">Prep not required</div>
                  )}
                  <div className="text-xs text-blue-600 mt-1 cursor-pointer">Print SKU labels</div>
                </td>
                <td className="py-3 w-44">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={sku.units}
                      onChange={(e) => onChangeQuantity(sku.id, Number(e.target.value))}
                      className="border rounded-md px-2 py-1 w-20"
                    />
                    <div className="text-xs text-slate-500">Units</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="date"
                      value={sku.expiry || ''}
                      onChange={(e) => onChangeExpiry(sku.id, e.target.value)}
                      className="border rounded-md px-2 py-1 text-xs"
                    />
                    <span className="text-slate-500">Expiry</span>
                  </div>
                  {sku.readyToPack && (
                    <div className="mt-2 flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                      <CheckCircle className="w-4 h-4" /> Ready to pack
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200">
        <div className="text-sm text-slate-600">
          SKUs confirmed to send: {skus.length} ({totalUnits} units)
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onNext}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold shadow-sm"
          >
            Continue to packing
          </button>
        </div>
      </div>
    </div>
  );
}
