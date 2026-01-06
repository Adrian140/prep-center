import React, { useMemo } from 'react';
import { AlertTriangle, Box, CheckCircle } from 'lucide-react';

export default function FbaStep1bPacking({
  packGroups,
  loading,
  error,
  submitting = false,
  onUpdateGroup,
  onNext,
  onBack
}) {
  const isEmpty = !loading && (!Array.isArray(packGroups) || packGroups.length === 0);
  const totals = useMemo(() => {
    if (!Array.isArray(packGroups)) return { skus: 0, units: 0 };
    return packGroups.reduce(
      (acc, g) => {
        const units = Array.isArray(g.items)
          ? g.items.reduce((s, it) => s + (Number(it.quantity || 0) || 0), 0)
          : Number(g.units || 0) || 0;
        const skuCount = Array.isArray(g.items) ? g.items.length : Number(g.skuCount || 0) || 0;
        return { skus: acc.skus + skuCount, units: acc.units + units };
      },
      { skus: 0, units: 0 }
    );
  }, [packGroups]);

  // Draft state to allow multi-digit input without instant save
  const [drafts, setDrafts] = React.useState({});
  const [continueError, setContinueError] = React.useState('');

  const getDraft = (group) => drafts[group.id] || {};
  const setDraftValue = (groupId, patch) => {
    setDrafts((prev) => ({ ...prev, [groupId]: { ...(prev[groupId] || {}), ...patch } }));
  };

  const commitDraft = (group, fields) => {
    const draft = drafts[group.id] || {};
    const payload = {};
    fields.forEach((f) => {
      if (draft[f] !== undefined) payload[f] = draft[f];
    });
    if (Object.keys(payload).length) {
      onUpdateGroup(group.id, payload);
    }
  };

  const resolveGroupNumber = (value) => {
    const num = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(num) ? num : 0;
  };

  const resolveBoxState = (group) => {
    const draft = drafts[group.id] || {};
    const dimsDraft = draft.boxDimensions || {};
    const dimsCurrent = group.boxDimensions || {};
    const dims = {
      length: dimsDraft.length ?? dimsCurrent.length ?? '',
      width: dimsDraft.width ?? dimsCurrent.width ?? '',
      height: dimsDraft.height ?? dimsCurrent.height ?? ''
    };
    return {
      dims,
      weight: draft.boxWeight ?? group.boxWeight ?? '',
      boxes: draft.boxes ?? group.boxes ?? 1
    };
  };

  const buildPackingPayload = () => {
    const packages = [];
    const packingGroups = [];
    (packGroups || []).forEach((group) => {
      const packingGroupId = group.packingGroupId || group.id || null;
      const { dims, weight, boxes } = resolveBoxState(group);
      const dimsNum = {
        length: resolveGroupNumber(dims.length),
        width: resolveGroupNumber(dims.width),
        height: resolveGroupNumber(dims.height)
      };
      const weightNum = resolveGroupNumber(weight);
      const boxCount = Math.max(1, resolveGroupNumber(boxes) || 1);

      if (packingGroupId) {
        packingGroups.push({
          packingGroupId,
          boxes: boxCount,
          packMode: group.packMode || 'single',
          dimensions:
            dimsNum.length || dimsNum.width || dimsNum.height
              ? { ...dimsNum, unit: 'CM' }
              : null,
          weight: weightNum ? { value: weightNum, unit: 'KG' } : null,
          items: Array.isArray(group.items)
            ? group.items.map((it) => ({
                sku: it.sku || it.msku || it.SellerSKU || null,
                quantity: Number(it.quantity || 0) || 0
              }))
            : []
        });
      }

      if (packingGroupId && dimsNum.length > 0 && dimsNum.width > 0 && dimsNum.height > 0 && weightNum > 0) {
        for (let i = 0; i < boxCount; i++) {
          packages.push({
            packingGroupId,
            dimensions: { ...dimsNum, unit: 'CM' },
            weight: { value: weightNum, unit: 'KG' }
          });
        }
      }
    });
    return { packages, packingGroups };
  };

  const validateGroups = () => {
    if (!Array.isArray(packGroups) || packGroups.length === 0) {
      return 'Completează cel puțin un pack group înainte de a continua.';
    }
    const missing = packGroups.find((group) => {
      const { dims, weight } = resolveBoxState(group);
      const length = resolveGroupNumber(dims.length);
      const width = resolveGroupNumber(dims.width);
      const height = resolveGroupNumber(dims.height);
      const w = resolveGroupNumber(weight);
      return !(length > 0 && width > 0 && height > 0 && w > 0);
    });
    if (missing) {
      return 'Completează dimensiunile și greutatea pentru fiecare grup (cutie) înainte de a continua.';
    }
    return '';
  };

  const handleContinue = async () => {
    const validationError = validateGroups();
    if (validationError) {
      setContinueError(validationError);
      return;
    }
    setContinueError('');
    const payload = buildPackingPayload();
    try {
      await onNext(payload);
    } catch (err) {
      setContinueError(err?.message || 'Nu am putut salva packing information.');
    }
  };

  const renderItemAvatar = (item) => {
    if (item?.image) {
      return (
        <img
          src={item.image}
          alt={item.title || item.sku || item.msku || 'Item'}
          className="w-10 h-10 rounded object-cover border border-slate-200"
        />
      );
    }
    const label = (item?.title || item?.sku || item?.msku || 'SKU').slice(0, 2).toUpperCase();
    return (
      <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
        {label}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Step 1b - Pack individual units</div>
        <div className="text-sm text-slate-500">You can start packing now</div>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 gap-4">
        <div className="col-span-1">
          {loading && (
            <div className="px-4 py-6 text-slate-600 text-sm">Loading pack groups from Amazon…</div>
          )}

          {error && !loading && (
            <div className="px-4 py-3 mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded">
              {error}
            </div>
          )}

          {isEmpty && (
            <div className="px-4 py-6 text-slate-600 text-sm">
              No pack groups received yet. Once we fetch the Amazon plan, groups will appear here.
            </div>
          )}

          {(packGroups || []).map((group) => (
            <div key={group.id} className="border border-slate-200 rounded-lg overflow-hidden mb-4">
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <Box className="w-5 h-5 text-slate-500" />
                <div>
                  <div className="font-semibold text-slate-900">{group.title || `Pack group ${group.id}`}</div>
                  <div className="text-sm text-slate-600">
                    These SKUs can be packed together – {(group.items || []).length || group.skuCount || 0} SKUs (
                    {(group.items || []).reduce((s, it) => s + (Number(it.quantity || 0) || 0), 0) || group.units || 0} units)
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 flex flex-col gap-3">
                <div className="space-y-3 text-sm text-slate-700">
                  {(() => {
                    const items = group.items || [];
                    if (!items.length) {
                      return <div className="text-xs text-slate-500">No items returned for this group yet.</div>;
                    }
                    const maxVisible = 4;
                    const visible = items.slice(0, maxVisible);
                    const totalUnits = items.reduce((s, it) => s + (Number(it.quantity || 0) || 0), 0);
                    const visibleUnits = visible.reduce((s, it) => s + (Number(it.quantity || 0) || 0), 0);
                    const hiddenUnits = Math.max(0, totalUnits - visibleUnits);
                    return (
                      <div className="flex flex-wrap gap-4">
                        {visible.map((item, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1 min-w-[72px]">
                            {renderItemAvatar(item)}
                            <div className="text-xs text-slate-600">x {Number(item.quantity || 0)}</div>
                          </div>
                        ))}
                        {hiddenUnits > 0 && (
                          <div className="flex flex-col items-center gap-1 min-w-[72px]">
                            <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                              +{hiddenUnits}
                            </div>
                            <div className="text-xs text-slate-600 whitespace-nowrap">more units</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                      onChange={() =>
                        onUpdateGroup(group.id, {
                          packMode: 'single',
                          boxes: 1,
                          boxDimensions: null,
                          boxWeight: null,
                          packingConfirmed: false
                        })
                      }
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

                {group.packMode === 'single' && (
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                    <div className="font-semibold text-slate-900 text-sm">Packing information for 1 box</div>
                    {(() => {
                      const draftDims = getDraft(group).boxDimensions || {};
                      const currentDims = {
                        length: draftDims.length ?? group.boxDimensions?.length ?? '',
                        width: draftDims.width ?? group.boxDimensions?.width ?? '',
                        height: draftDims.height ?? group.boxDimensions?.height ?? ''
                      };
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="sm:col-span-3">
                            <label className="text-xs text-slate-600 block mb-1">Box dimensions (cm)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={currentDims.length}
                                onChange={(e) =>
                                  setDraftValue(group.id, {
                                    boxDimensions: {
                                      ...(getDraft(group).boxDimensions || group.boxDimensions || {}),
                                      length: e.target.value
                                    }
                                  })
                                }
                                onBlur={() => commitDraft(group, ["boxDimensions"])}
                                className="border rounded-md px-3 py-2 w-20"
                                placeholder="L"
                              />
                              <span className="text-slate-500 text-sm">×</span>
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={currentDims.width}
                                onChange={(e) =>
                                  setDraftValue(group.id, {
                                    boxDimensions: {
                                      ...(getDraft(group).boxDimensions || group.boxDimensions || {}),
                                      width: e.target.value
                                    }
                                  })
                                }
                                onBlur={() => commitDraft(group, ["boxDimensions"])}
                                className="border rounded-md px-3 py-2 w-20"
                                placeholder="W"
                              />
                              <span className="text-slate-500 text-sm">×</span>
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={currentDims.height}
                                onChange={(e) =>
                                  setDraftValue(group.id, {
                                    boxDimensions: {
                                      ...(getDraft(group).boxDimensions || group.boxDimensions || {}),
                                      height: e.target.value
                                    }
                                  })
                                }
                                onBlur={() => commitDraft(group, ["boxDimensions"])}
                                className="border rounded-md px-3 py-2 w-20"
                                placeholder="H"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Box weight (kg)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={getDraft(group).boxWeight ?? group.boxWeight ?? ''}
                        onChange={(e) => setDraftValue(group.id, { boxWeight: e.target.value })}
                        onBlur={() => commitDraft(group, ["boxWeight"])}
                        className="border rounded-md px-3 py-2 w-24"
                        placeholder="kg"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateGroup(group.id, { packingConfirmed: true })}
                      className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-md"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Confirm packing information
                    </button>
                    {group.packingConfirmed && (
                      <div className="text-xs text-emerald-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Saved for this pack group
                      </div>
                    )}
                  </div>
                )}

                {group.packMode === 'multiple' && (
                  <div className="flex flex-col gap-3 text-sm text-slate-700 border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="font-semibold text-slate-900 text-sm">Packing information for multiple boxes</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="font-semibold">How many boxes?</label>
                      <input
                        type="number"
                        min={1}
                        value={getDraft(group).boxes ?? group.boxes}
                        onChange={(e) => setDraftValue(group.id, { boxes: e.target.value })}
                        onBlur={() => commitDraft(group, ["boxes"])}
                        className="border rounded-md px-3 py-2 w-28"
                      />
                      <div className="text-xs text-slate-500">Exact number not needed</div>
                    </div>
                    {(() => {
                      const draftDims = getDraft(group).boxDimensions || {};
                      const currentDims = {
                        length: draftDims.length ?? group.boxDimensions?.length ?? '',
                        width: draftDims.width ?? group.boxDimensions?.width ?? '',
                        height: draftDims.height ?? group.boxDimensions?.height ?? ''
                      };
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="sm:col-span-3">
                            <label className="text-xs text-slate-600 block mb-1">Box dimensions (cm)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={currentDims.length}
                                onChange={(e) =>
                                  setDraftValue(group.id, {
                                    boxDimensions: {
                                      ...(getDraft(group).boxDimensions || group.boxDimensions || {}),
                                      length: e.target.value
                                    }
                                  })
                                }
                                onBlur={() => commitDraft(group, ["boxDimensions"])}
                                className="border rounded-md px-3 py-2 w-20"
                                placeholder="L"
                              />
                              <span className="text-slate-500 text-sm">×</span>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={currentDims.width}
                                onChange={(e) =>
                                  setDraftValue(group.id, {
                                    boxDimensions: {
                                      ...(getDraft(group).boxDimensions || group.boxDimensions || {}),
                                      width: e.target.value
                                    }
                                  })
                                }
                                onBlur={() => commitDraft(group, ["boxDimensions"])}
                                className="border rounded-md px-3 py-2 w-20"
                                placeholder="W"
                              />
                              <span className="text-slate-500 text-sm">×</span>
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={currentDims.height}
                                onChange={(e) =>
                                  setDraftValue(group.id, {
                                    boxDimensions: {
                                      ...(getDraft(group).boxDimensions || group.boxDimensions || {}),
                                      height: e.target.value
                                    }
                                  })
                                }
                                onBlur={() => commitDraft(group, ["boxDimensions"])}
                                className="border rounded-md px-3 py-2 w-20"
                                placeholder="H"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <div>
                      <label className="text-xs text-slate-600 block mb-1">Box weight (kg)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={getDraft(group).boxWeight ?? group.boxWeight ?? ''}
                        onChange={(e) => setDraftValue(group.id, { boxWeight: e.target.value })}
                        onBlur={() => commitDraft(group, ["boxWeight"])}
                        className="border rounded-md px-3 py-2 w-24"
                        placeholder="kg"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600 space-y-1">
          <div>Pack groups received: {packGroups?.length || 0} · SKUs: {totals.skus} · Units: {totals.units}</div>
          {(continueError || error) && (
            <div className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {continueError || error}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onBack}
            className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md"
          >
            Back
          </button>
          <button
            onClick={handleContinue}
            disabled={submitting}
            className={`bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-semibold shadow-sm`}
          >
            {submitting ? 'Saving…' : 'Continue to shipping'}
          </button>
        </div>
      </div>
    </div>
  );
}
