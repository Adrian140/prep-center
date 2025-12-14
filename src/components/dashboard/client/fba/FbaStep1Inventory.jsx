import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

const FieldLabel = ({ label, children }) => (
  <div className="flex flex-col gap-1 text-sm text-slate-700">
    <span className="font-semibold text-slate-800">{label}</span>
    {children}
  </div>
);

// Small inline placeholder (60x60 light gray) to avoid network failures
const placeholderImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="10">SKU</text></svg>';

export default function FbaStep1Inventory({
  data,
  skuStatuses = [],
  blocking = false,
  error = '',
  onChangePacking,
  onChangeQuantity,
  onChangeExpiry,
  onNext
}) {
  const { shipFrom, marketplace, skus } = data;
  const totalUnits = skus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);
  const statusForSku = (sku) => {
    const match =
      skuStatuses.find((s) => s.sku === sku.sku) ||
      skuStatuses.find((s) => s.asin && s.asin === sku.asin) ||
      skuStatuses.find((s) => s.id && s.id === sku.id);
    return match || { state: 'unknown', reason: '' };
  };
  const hasBlocking = blocking || skuStatuses.some((s) => ['missing', 'inactive', 'restricted'].includes(String(s.state)));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 1 - Confirmed inventory to send</div>
        <div className="text-sm text-slate-500">SKUs confirmed ({skus.length})</div>
      </div>

      {(error || hasBlocking) && (
        <div className="px-6 py-3 border-b border-amber-200 bg-amber-50 text-amber-800 text-sm">
          {error || 'Unele produse nu sunt eligibile pentru marketplace-ul selectat.'}
        </div>
      )}

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
            {skus.map((sku) => {
              const status = statusForSku(sku);
              const state = String(status.state || '').toLowerCase();
              const badgeClass =
                state === 'ok'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : state === 'missing' || state === 'restricted'
                    ? 'text-red-700 bg-red-50 border-red-200'
                    : state === 'inactive'
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-slate-600 bg-slate-100 border-slate-200';

              const badgeLabel =
                state === 'ok'
                  ? 'Eligibil'
                  : state === 'missing'
                    ? 'Nu există listing'
                    : state === 'inactive'
                      ? 'Listing inactiv'
                      : state === 'restricted'
                        ? 'Restricționat'
                        : 'Necunoscut';

              return (
                <tr key={sku.id} className="align-top">
                <td className="py-3">
                  <div className="flex gap-3">
                    <img
                      src={sku.image || placeholderImg}
                      alt={sku.title}
                      className="w-12 h-12 object-contain border border-slate-200 rounded"
                    />
                    <div>
                      <div className="font-semibold text-slate-900 hover:text-blue-700 cursor-pointer">
                        {sku.title}
                      </div>
                      <div className="text-xs text-slate-500">SKU: {sku.sku}</div>
                      <div className="text-xs text-slate-500">ASIN: {sku.asin}</div>
                      <div className="text-xs text-slate-500">Storage: {sku.storageType}</div>
                      <div className={`mt-2 inline-flex items-center gap-2 text-xs border px-2 py-1 rounded ${badgeClass}`}>
                        {badgeLabel}
                        {status.reason ? <span className="text-slate-500">· {status.reason}</span> : null}
                      </div>
                    </div>
                  </div>
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
              );
            })}
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
            disabled={hasBlocking}
            className={`px-4 py-2 rounded-md font-semibold shadow-sm text-white ${hasBlocking ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {hasBlocking ? 'Rezolvă eligibilitatea în Amazon' : 'Continue to packing'}
          </button>
        </div>
      </div>
    </div>
  );
}
