import React from 'react';
import { AlertTriangle, Box, CheckCircle } from 'lucide-react';

export default function FbaStep1bPacking({ packGroups, loading, error, onUpdateGroup, onNext, onBack }) {
  const isEmpty = !loading && (!Array.isArray(packGroups) || packGroups.length === 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 1b - Pack individual units</div>
        <div className="text-sm text-slate-500">You can start packing now</div>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {loading && (
            <div className="px-4 py-6 text-slate-600 text-sm">Loading pack groups from Amazon…</div>
          )}

          {error && !loading && (
            <div className="px-4 py-3 mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded">
              {error}
            </div>
          )}

          {isEmpty && (
            <div className="px-4 py-6 text-slate-600 text-sm">No pack groups received yet. Once we fetch the Amazon plan, groups will appear here.</div>
          )}

          {(packGroups || []).map((group) => (
            <div key={group.id} className="border border-slate-200 rounded-lg overflow-hidden mb-4">
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <Box className="w-5 h-5 text-slate-500" />
                <div>
                  <div className="font-semibold text-slate-900">{group.title}</div>
                  <div className="text-sm text-slate-600">These SKUs can be packed together – {group.skuCount} SKUs ({group.units} units)</div>
                </div>
              </div>

              <div className="px-4 py-3 flex flex-col gap-3">
                <div className="flex items-center gap-3 text-slate-700 text-sm">
                  <img src={group.image} alt={group.title} className="w-10 h-10 object-contain" />
                  <div className="text-xs text-slate-500">x {group.units}</div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-emerald-700 font-semibold">
                  <CheckCircle className="w-4 h-4" /> {group.boxes} boxes
                </div>

                {group.warning && (
                  <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-md text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <div>{group.warning}</div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`boxes-${group.id}`}
                      checked={group.packMode === 'single'}
                      onChange={() => onUpdateGroup(group.id, { packMode: 'single' })}
                    />
                    Everything will fit into one box
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`boxes-${group.id}`}
                      checked={group.packMode === 'multiple'}
                      onChange={() => onUpdateGroup(group.id, { packMode: 'multiple' })}
                    />
                    Multiple boxes will be needed
                  </label>
                </div>

                {group.packMode === 'multiple' && (
                  <div className="flex flex-col gap-2 text-sm text-slate-700">
                    <label className="font-semibold">How many boxes?</label>
                    <input
                      type="number"
                      min={1}
                      value={group.boxes}
                      onChange={(e) => onUpdateGroup(group.id, { boxes: Number(e.target.value) })}
                      className="border rounded-md px-3 py-2 w-28"
                    />
                    <div className="text-xs text-slate-500">Exact number not needed</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
          <div className="font-semibold text-slate-900 mb-2">Frequently asked questions</div>
          <ul className="space-y-2 list-disc list-inside text-slate-600">
            <li>Pack groups are SKUs that can be packed together.</li>
            <li>Dangerous goods cannot be packed with other SKUs.</li>
            <li>Number your boxes so labels match correctly.</li>
          </ul>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600">SKUs already case-packed: 0 (0 units)</div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onBack}
            className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md"
          >
            Back
          </button>
          <button
            onClick={onNext}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold shadow-sm"
          >
            Continue to shipping
          </button>
        </div>
      </div>
    </div>
  );
}
