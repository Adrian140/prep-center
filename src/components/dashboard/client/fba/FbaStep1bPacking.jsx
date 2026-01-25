import React, { useMemo, useRef, useState, useEffect } from 'react';
import { AlertTriangle, Box, CheckCircle } from 'lucide-react';

export default function FbaStep1bPacking({
  packGroups,
  packGroupsLoaded = false,
  loading,
  error,
  submitting = false,
  onUpdateGroup,
  onNext,
  onBack,
  onRetry,
  retryLoading = false,
  packingOptions = [],
  packingOptionId = null,
  onSelectPackingOption = () => {}
}) {
  const isFallbackId = (v) => typeof v === "string" && v.toLowerCase().startsWith("fallback-");
  const isAmazonGroupId = (v) => typeof v === "string" && v.toLowerCase().startsWith("pg");
  const visibleGroups = (Array.isArray(packGroups) ? packGroups : []).filter(
    (g) => {
      const gid = g?.packingGroupId || g?.id || "";
      return gid && !isFallbackId(gid); // nu ascundem grupuri valide chiar dacă id-ul nu începe cu pg
    }
  );
  const waitingForAmazon = loading || (!packGroupsLoaded && !error);
  const isEmpty = !waitingForAmazon && visibleGroups.length === 0;
  const showErrorOnly = Boolean(error) && !loading;
  const totals = useMemo(() => {
    if (!Array.isArray(visibleGroups)) return { skus: 0, units: 0 };
    return visibleGroups.reduce(
      (acc, g) => {
        const units = Array.isArray(g.items)
          ? g.items.reduce((s, it) => s + (Number(it.quantity || 0) || 0), 0)
          : Number(g.units || 0) || 0;
        const skuCount = Array.isArray(g.items) ? g.items.length : Number(g.skuCount || 0) || 0;
        return { skus: acc.skus + skuCount, units: acc.units + units };
      },
      { skus: 0, units: 0 }
    );
  }, [visibleGroups]);

  const normalizedPackingOptions = useMemo(() => {
    const normalizeStatus = (val) => String(val || '').toUpperCase();
    const shippingModes = (opt) => {
      const modes = new Set();
      const supportedShipping = opt?.supportedShippingConfigurations || opt?.SupportedShippingConfigurations || [];
      (Array.isArray(supportedShipping) ? supportedShipping : [supportedShipping]).forEach((cfg) => {
        const mode = cfg?.shippingMode || cfg?.shipping_mode || cfg?.mode;
        if (mode) modes.add(String(mode));
      });
      return Array.from(modes);
    };
    return (Array.isArray(packingOptions) ? packingOptions : []).map((opt, idx) => {
      const id = opt?.packingOptionId || opt?.PackingOptionId || opt?.id || `opt-${idx + 1}`;
      const status = normalizeStatus(opt?.status);
      const groups = Array.isArray(opt?.packingGroups || opt?.PackingGroups) ? opt.packingGroups || opt.PackingGroups : [];
      const discounts = Array.isArray(opt?.discounts || opt?.Discounts) ? opt.discounts || opt.Discounts : [];
      return {
        id,
        status,
        groupsCount: groups.length || 0,
        discounts,
        modes: shippingModes(opt),
        raw: opt
      };
    });
  }, [packingOptions]);

  // Draft state to allow multi-digit input without instant save
  const [drafts, setDrafts] = useState({});
  const [continueError, setContinueError] = useState('');
  const [activeWebFormGroupId, setActiveWebFormGroupId] = useState(null);
  const [isWebFormOpen, setIsWebFormOpen] = useState(false);
  const lastActiveGroupRef = useRef(null);

  const contentOptions = [
    { value: 'BOX_CONTENT_PROVIDED', label: 'Enter through a web form', enabled: true },
    { value: 'EXCEL_UPLOAD', label: 'Upload Excel file (.xls)', enabled: false },
    { value: 'MANUAL_PROCESS', label: 'Amazon manually processes box contents (€0.18 per unit)', enabled: false },
    { value: 'BARCODE_2D', label: 'Use 2D barcodes', enabled: false },
    { value: 'SCAN_AND_PACK', label: 'Use scan and pack', enabled: false }
  ];

  const getDraft = (group) => drafts[group.packingGroupId || group.id] || {};
  const getGroupKey = (group) => group?.packingGroupId || group?.id || null;
  const setDraftValue = (groupId, patch) => {
    setDrafts((prev) => ({ ...prev, [groupId]: { ...(prev[groupId] || {}), ...patch } }));
  };

  useEffect(() => {
    if (!activeWebFormGroupId) return;
    const activeGroup = visibleGroups.find((g) => getGroupKey(g) === activeWebFormGroupId);
    if (activeGroup) lastActiveGroupRef.current = activeGroup;
  }, [activeWebFormGroupId, visibleGroups]);

  const openWebForm = (group) => {
    const key = getGroupKey(group);
    if (!key) return;
    lastActiveGroupRef.current = group;
    setActiveWebFormGroupId(key);
    setIsWebFormOpen(true);
  };

  const closeWebForm = () => {
    setIsWebFormOpen(false);
    setActiveWebFormGroupId(null);
    lastActiveGroupRef.current = null;
  };

  const commitDraft = (group, fields) => {
    const key = group.packingGroupId || group.id;
    const draft = drafts[key] || {};
    const payload = {};
    fields.forEach((f) => {
      if (draft[f] !== undefined) payload[f] = draft[f];
    });
    if (Object.keys(payload).length) {
      onUpdateGroup(key, payload);
    }
  };

  const resolveGroupNumber = (value) => {
    const num = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(num) ? num : 0;
  };

  const clampBoxes = (value) => {
    const n = Math.floor(resolveGroupNumber(value));
    if (n <= 0) return 1;
    return Math.min(10, n);
  };

  const resolveBoxState = (group) => {
    const key = group.packingGroupId || group.id;
    const draft = drafts[key] || {};
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
      boxes: clampBoxes(draft.boxes ?? group.boxes ?? 1),
      contentInformationSource:
        draft.contentInformationSource ??
        group.contentInformationSource ??
        'BOX_CONTENT_PROVIDED',
      perBoxDetails: (() => {
        const boxCount = clampBoxes(draft.boxes ?? group.boxes ?? 1);
        const draftPer = Array.isArray(draft.perBoxDetails) ? draft.perBoxDetails : null;
        const groupPer = Array.isArray(group.perBoxDetails) ? group.perBoxDetails : null;
        const sharedDims = group.boxDimensions || {};
        const sharedWeight = group.boxWeight ?? '';

        return Array.from({ length: boxCount }).map((_, idx) => {
          const src = draftPer?.[idx] ?? groupPer?.[idx] ?? {};
          return {
            length: src.length ?? sharedDims.length ?? '',
            width: src.width ?? sharedDims.width ?? '',
            height: src.height ?? sharedDims.height ?? '',
            weight: src.weight ?? sharedWeight ?? ''
          };
        });
      })(),
      perBoxItems: (() => {
        const boxCount = clampBoxes(draft.boxes ?? group.boxes ?? 1);
        const draftItems = Array.isArray(draft.perBoxItems) ? draft.perBoxItems : null;
        const groupItems = Array.isArray(group.perBoxItems) ? group.perBoxItems : null;
        return Array.from({ length: boxCount }).map((_, idx) => {
          const src = draftItems?.[idx] ?? groupItems?.[idx] ?? {};
          return { ...(src || {}) };
        });
      })()
    };
  };

  const buildPackingPayload = () => {
    const packages = [];
    const packingGroups = [];
    let missingGroupId = false;
    (visibleGroups || []).forEach((group) => {
      const packingGroupId = group.packingGroupId || null;
      const { dims, weight, boxes, perBoxDetails, perBoxItems, contentInformationSource } = resolveBoxState(group);
      const dimsNum = {
        length: resolveGroupNumber(dims.length),
        width: resolveGroupNumber(dims.width),
        height: resolveGroupNumber(dims.height)
      };
      const weightNum = resolveGroupNumber(weight);
      const boxCount = clampBoxes(boxes);

      if (!packingGroupId) {
        missingGroupId = true;
        return;
      }

      const perBoxNormalized = Array.from({ length: boxCount }).map((_, idx) => {
        const src = perBoxDetails?.[idx] || {};
        const l = resolveGroupNumber(src.length);
        const w = resolveGroupNumber(src.width);
        const h = resolveGroupNumber(src.height);
        const wt = resolveGroupNumber(src.weight);
        return {
          dimensions: l && w && h ? { length: l, width: w, height: h, unit: 'CM' } : null,
          weight: wt ? { value: wt, unit: 'KG' } : null
        };
      });
      const allPerBoxComplete = perBoxNormalized.every(
        (b) => b.dimensions && b.weight
      );

      packingGroups.push({
        packingGroupId,
        boxes: boxCount,
        packMode: group.packMode || 'single',
        dimensions:
          dimsNum.length || dimsNum.width || dimsNum.height
            ? { ...dimsNum, unit: 'CM' }
            : null,
        weight: weightNum ? { value: weightNum, unit: 'KG' } : null,
        contentInformationSource,
        items: Array.isArray(group.items)
          ? group.items.map((it) => ({
              sku: it.sku || it.msku || it.SellerSKU || null,
              quantity: Number(it.quantity || 0) || 0
            }))
          : [],
        perBoxDetails: perBoxNormalized,
        perBoxItems
      });

      const baseDimensions =
        dimsNum.length > 0 && dimsNum.width > 0 && dimsNum.height > 0
          ? { ...dimsNum, unit: 'CM' }
          : null;
      const baseWeight = weightNum > 0 ? { value: weightNum, unit: 'KG' } : null;

      for (let i = 0; i < boxCount; i++) {
        const perBox = perBoxNormalized[i] || {};
        const dimsUse = perBox.dimensions || baseDimensions;
        const weightUse = perBox.weight || baseWeight;
        if (dimsUse && weightUse) {
          packages.push({
            packingGroupId,
            dimensions: dimsUse,
            weight: weightUse
          });
        }
      }
    });
    return { packages, packingGroups, missingGroupId };
  };

  const validateGroups = () => {
    if (!Array.isArray(visibleGroups) || visibleGroups.length === 0) {
      return 'Completează cel puțin un pack group înainte de a continua.';
    }
    const missingPackingId = (visibleGroups || []).find((g) => !g.packingGroupId);
    if (missingPackingId) {
      return 'Amazon nu a returnat packingGroupId pentru unul din grupuri. Reia Step 1b ca să obții packing groups reale.';
    }
    const missing = visibleGroups.find((group) => {
      const { dims, weight, boxes, perBoxDetails, perBoxItems, contentInformationSource } = resolveBoxState(group);
      const boxCount = clampBoxes(boxes);

      if (boxCount > 10) {
        return true;
      }

      // For multiple boxes we want per-box details complete
      if ((group.packMode || 'single') === 'multiple' && boxCount > 1) {
        const perBox = (perBoxDetails || []).slice(0, boxCount);
        return perBox.some((b) => {
          const l = resolveGroupNumber(b.length);
          const w = resolveGroupNumber(b.width);
          const h = resolveGroupNumber(b.height);
          const wt = resolveGroupNumber(b.weight);
          return !(l > 0 && w > 0 && h > 0 && wt > 0);
        });
      }

      const length = resolveGroupNumber(dims.length);
      const width = resolveGroupNumber(dims.width);
      const height = resolveGroupNumber(dims.height);
      const w = resolveGroupNumber(weight);
      if (!(length > 0 && width > 0 && height > 0 && w > 0)) return true;
      if ((group.packMode || 'single') !== 'multiple' || boxCount <= 1) return false;
      if (contentInformationSource !== 'BOX_CONTENT_PROVIDED') return false;

      const items = Array.isArray(group.items) ? group.items : [];
      const perBox = Array.isArray(perBoxItems) ? perBoxItems.slice(0, boxCount) : [];
      if (items.length === 0 || perBox.length !== boxCount) return true;

      const totals = new Map();
      items.forEach((it) => {
        const sku = String(it.sku || it.msku || it.SellerSKU || '').trim().toUpperCase();
        if (!sku) return;
        totals.set(sku, Number(it.quantity || 0) || 0);
      });

      const boxedTotals = new Map();
      let boxHasUnits = Array(boxCount).fill(false);
      perBox.forEach((box, idx) => {
        Object.entries(box || {}).forEach(([sku, qty]) => {
          const key = String(sku || '').trim().toUpperCase();
          const q = resolveGroupNumber(qty);
          if (!key || q <= 0) return;
          boxedTotals.set(key, (boxedTotals.get(key) || 0) + q);
          boxHasUnits[idx] = true;
        });
      });

      const totalsMismatch = Array.from(totals.entries()).some(([sku, qty]) => {
        const boxed = boxedTotals.get(sku) || 0;
        return qty !== boxed;
      });
      if (totalsMismatch) return true;
      if (boxHasUnits.some((has) => !has)) return true;

      return false;
    });
    if (missing) {
      return 'Completează dimensiunile și greutatea pentru fiecare cutie înainte de a continua. Maxim 10 cutii per grup.';
    }
    return '';
  };

  const handleContinue = async () => {
    // commit toate draft-urile în state înainte de validare
    (visibleGroups || []).forEach((g) => {
      commitDraft(g, ["boxes", "boxWeight", "boxDimensions", "perBoxDetails", "perBoxItems", "contentInformationSource"]);
    });

    const hasFallbackGroup = (visibleGroups || []).some(
      (g) => isFallbackId(g.packingGroupId) || isFallbackId(g.id)
    );
    if (hasFallbackGroup) {
      setContinueError("Amazon nu a returnat packingGroupId (packingOptions). Reia Step 1b ca să obții packing groups reale.");
      return;
    }

    const validationError = validateGroups();
    if (validationError) {
      setContinueError(validationError);
      return;
    }
    setContinueError('');
    const payload = buildPackingPayload();
    if (payload.missingGroupId) {
      setContinueError("Amazon nu a returnat packingGroupId (packingOptions). Reia Step 1b ca să obții packing groups reale.");
      return;
    }
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

  const getSkuKey = (item) =>
    String(item?.sku || item?.msku || item?.SellerSKU || '').trim().toUpperCase();

  const renderWebFormModal = (group) => {
    const { boxes, perBoxDetails, perBoxItems } = resolveBoxState(group);
    const boxCount = clampBoxes(boxes);
    const items = Array.isArray(group.items) ? group.items : [];
    const skuList = items
      .map((it) => ({ ...it, key: getSkuKey(it) }))
      .filter((it) => it.key);
    const key = getGroupKey(group);

    const ensurePerBoxItems = () =>
      Array.from({ length: boxCount }).map((_, idx) => ({
        ...(perBoxItems?.[idx] || {})
      }));

    const perBoxMatrix = ensurePerBoxItems();

    const updateBoxQty = (boxIdx, skuKey, value) => {
      const next = ensurePerBoxItems();
      next[boxIdx] = { ...(next[boxIdx] || {}), [skuKey]: value };
      setDraftValue(key, { perBoxItems: next });
    };

    const commitItems = () => commitDraft(group, ["perBoxItems"]);

    const updateBoxDetails = (boxIdx, field, value) => {
      const draft = getDraft(group);
      const base = Array.isArray(draft.perBoxDetails)
        ? [...draft.perBoxDetails]
        : [...perBoxDetails];
      base[boxIdx] = { ...(base[boxIdx] || {}), [field]: value };
      setDraftValue(key, { perBoxDetails: base });
    };

    const resolveDimensionSets = () => {
      const draft = getDraft(group);
      const existing = Array.isArray(draft.dimensionSets) ? draft.dimensionSets : [];
      const normalized = existing.map((set) => ({
        length: set?.length ?? '',
        width: set?.width ?? '',
        height: set?.height ?? '',
        boxes: Array.from({ length: boxCount }).map((_, idx) => Boolean(set?.boxes?.[idx]))
      }));
      if (normalized.length) return normalized;
      return [
        {
          length: '',
          width: '',
          height: '',
          boxes: Array.from({ length: boxCount }).map(() => false)
        }
      ];
    };

    const updateDimensionSets = (next) => {
      const normalized = (next || []).map((set) => ({
        length: set?.length ?? '',
        width: set?.width ?? '',
        height: set?.height ?? '',
        boxes: Array.from({ length: boxCount }).map((_, idx) => Boolean(set?.boxes?.[idx]))
      }));
      setDraftValue(key, { dimensionSets: normalized });

      const base = Array.isArray(getDraft(group).perBoxDetails)
        ? [...getDraft(group).perBoxDetails]
        : [...perBoxDetails];
      normalized.forEach((set) => {
        const l = resolveGroupNumber(set.length);
        const w = resolveGroupNumber(set.width);
        const h = resolveGroupNumber(set.height);
        if (!(l > 0 && w > 0 && h > 0)) return;
        set.boxes.forEach((checked, idx) => {
          if (!checked) return;
          base[idx] = { ...(base[idx] || {}), length: l, width: w, height: h };
        });
      });
      setDraftValue(key, { perBoxDetails: base });
    };

    const dimensionSets = resolveDimensionSets();

    const totalsBySku = new Map();
    skuList.forEach((it) => {
      totalsBySku.set(it.key, Number(it.quantity || 0) || 0);
    });
    const boxedBySku = new Map();
    perBoxMatrix.forEach((box) => {
      Object.entries(box || {}).forEach(([sku, qty]) => {
        const q = resolveGroupNumber(qty);
        if (q <= 0) return;
        boxedBySku.set(sku, (boxedBySku.get(sku) || 0) + q);
      });
    });

    const validationMessages = [];
    let hasOverfill = false;
    let hasMissingUnits = false;
    skuList.forEach((item) => {
      const total = totalsBySku.get(item.key) || 0;
      const boxed = boxedBySku.get(item.key) || 0;
      if (boxed > total) hasOverfill = true;
      if (boxed < total) hasMissingUnits = true;
    });

    if (hasMissingUnits) {
      validationMessages.push('Toate unitatile trebuie alocate in cutii.');
    }
    if (hasOverfill) {
      validationMessages.push('Ai alocat mai multe unitati decat exista in plan.');
    }

    const hasWeights = perBoxDetails.every((d) => resolveGroupNumber(d?.weight) > 0);
    if (!hasWeights) {
      validationMessages.push('Completeaza greutatea pentru fiecare cutie.');
    }

    const hasDimensions = perBoxDetails.every((d) => {
      const l = resolveGroupNumber(d?.length);
      const w = resolveGroupNumber(d?.width);
      const h = resolveGroupNumber(d?.height);
      return l > 0 && w > 0 && h > 0;
    });
    if (!hasDimensions) {
      validationMessages.push('Completeaza dimensiunile pentru fiecare cutie.');
    }

    const canConfirm = validationMessages.length === 0;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div>
              <div className="font-semibold text-slate-900">Web form for pack group {group.title || group.id}</div>
              <div className="text-xs text-slate-500">Enter box contents and box dimensions/weight.</div>
            </div>
            <button
              type="button"
              onClick={closeWebForm}
              className="text-slate-500 hover:text-slate-700 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(10, boxCount + 1);
                  setDraftValue(key, { boxes: next });
                  onUpdateGroup(key, { boxes: next });
                }}
                className="border border-slate-200 rounded px-2 py-1 hover:border-slate-300"
              >
                Add a new box
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, boxCount - 1);
                  setDraftValue(key, { boxes: next });
                  onUpdateGroup(key, { boxes: next });
                }}
                className="border border-slate-200 rounded px-2 py-1 hover:border-slate-300"
              >
                Remove last box
              </button>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-slate-600">
                    <th className="text-left py-2 pr-3">SKU details</th>
                    <th className="text-left py-2 pr-3">Units boxed</th>
                    {Array.from({ length: boxCount }).map((_, idx) => (
                      <th key={idx} className="text-left py-2 pr-3">
                        Box {idx + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {skuList.map((item) => {
                    const total = totalsBySku.get(item.key) || 0;
                    const boxed = boxedBySku.get(item.key) || 0;
                    return (
                      <tr key={item.key} className="border-t border-slate-200">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-3">
                            {renderItemAvatar(item)}
                            <div>
                              <div className="font-semibold text-slate-800">{item.title || item.sku || item.msku}</div>
                              <div className="text-xs text-slate-500">SKU: {item.sku || item.msku || item.SellerSKU}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-semibold text-slate-700">
                          {boxed} of {total}
                        </td>
                        {Array.from({ length: boxCount }).map((_, boxIdx) => (
                          <td key={boxIdx} className="py-2 pr-3">
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={perBoxMatrix?.[boxIdx]?.[item.key] ?? ''}
                              onChange={(e) => updateBoxQty(boxIdx, item.key, e.target.value)}
                              onBlur={commitItems}
                              className="border rounded-md px-2 py-1 w-20"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="text-sm text-slate-700 font-semibold">Box weight (kg)</div>
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: boxCount }).map((_, idx) => (
                  <input
                    key={idx}
                    type="number"
                    min={0}
                    step="0.1"
                    value={perBoxDetails?.[idx]?.weight ?? ''}
                    onChange={(e) => updateBoxDetails(idx, 'weight', e.target.value)}
                    onBlur={() => commitDraft(group, ["perBoxDetails"])}
                    className="border rounded-md px-2 py-1 w-20"
                    placeholder={`Box ${idx + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-700 font-semibold">Box dimensions (cm)</div>
                <button
                  type="button"
                  onClick={() => {
                    const next = [...dimensionSets, { length: '', width: '', height: '', boxes: Array(boxCount).fill(false) }];
                    updateDimensionSets(next);
                  }}
                  className="text-xs text-blue-700 hover:text-blue-800"
                >
                  + Add another box dimension
                </button>
              </div>
              {dimensionSets.map((set, setIdx) => (
                <div key={setIdx} className="flex items-center gap-3">
                  {['length', 'width', 'height'].map((field) => (
                    <input
                      key={field}
                      type="number"
                      min={0}
                      step="0.1"
                      value={set[field] ?? ''}
                      onChange={(e) => {
                        const next = [...dimensionSets];
                        next[setIdx] = { ...next[setIdx], [field]: e.target.value };
                        updateDimensionSets(next);
                      }}
                      onBlur={() => commitDraft(group, ["dimensionSets", "perBoxDetails"])}
                      className="border rounded-md px-2 py-1 w-20"
                      placeholder={field.toUpperCase()}
                    />
                  ))}
                  <div className="flex items-center gap-2">
                    {Array.from({ length: boxCount }).map((_, idx) => (
                      <label key={idx} className="flex items-center gap-1 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={Boolean(set.boxes?.[idx])}
                          onChange={() => {
                            const next = [...dimensionSets];
                            const row = { ...next[setIdx] };
                            const boxesFlags = Array.from({ length: boxCount }).map((_, boxIdx) =>
                              boxIdx === idx ? !row.boxes?.[boxIdx] : Boolean(row.boxes?.[boxIdx])
                            );
                            row.boxes = boxesFlags;
                            next[setIdx] = row;
                            updateDimensionSets(next);
                          }}
                        />
                        {idx + 1}
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = dimensionSets.filter((_, idx) => idx !== setIdx);
                      updateDimensionSets(next);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {validationMessages.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {validationMessages.map((msg) => (
                  <div key={msg}>{msg}</div>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeWebForm}
              className="border border-slate-300 text-slate-700 px-3 py-2 rounded-md"
            >
              Save as draft
            </button>
            <button
              type="button"
              onClick={() => {
                commitDraft(group, ["perBoxItems", "perBoxDetails", "boxes"]);
                onUpdateGroup(group.id, { packingConfirmed: true });
                closeWebForm();
              }}
              disabled={!canConfirm}
              className={`px-3 py-2 rounded-md ${
                canConfirm
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              Confirm packing information
            </button>
          </div>
        </div>
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
          {waitingForAmazon && (
            <div className="px-4 py-6 text-slate-600 text-sm">Loading pack groups from Amazon…</div>
          )}

          {error && !waitingForAmazon && (
            <div className="px-4 py-3 mb-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded">
              {error}
            </div>
          )}
          {onRetry && !waitingForAmazon && (error || isEmpty) && (
            <div className="px-4 py-3 mb-3 text-sm bg-blue-50 border border-blue-200 rounded flex flex-col gap-2">
              <div className="text-blue-800">
                Amazon nu a returnat încă packing groups sau a răspuns cu o eroare. Încearcă din nou peste câteva secunde.
              </div>
              <button
                type="button"
                onClick={onRetry}
                disabled={retryLoading}
                className="self-start inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm px-3 py-2 rounded-md"
              >
                {retryLoading ? 'Retry…' : 'Retry fetch packing groups'}
              </button>
            </div>
          )}

          {normalizedPackingOptions.length > 0 && (
            <div className="px-4 py-3 mb-3 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
              <div className="font-semibold text-slate-900">Select packing method</div>
              <div className="text-xs text-slate-600">
                Amazon poate oferi mai multe packing options (ex. recomandat vs. standard). Alege varianta cu care vrei să continui.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {normalizedPackingOptions.map((opt) => {
                  const selected = packingOptionId && String(packingOptionId) === String(opt.id);
                  const isDiscounted = (opt.discounts || []).length > 0;
                  const modesLabel = opt.modes.length ? opt.modes.join(', ') : 'N/A';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelectPackingOption(opt.id)}
                      className={`text-left border rounded-lg p-3 transition ${
                        selected ? 'border-blue-500 ring-2 ring-blue-200 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {isDiscounted ? 'Amazon recommended' : 'Standard packing method'}
                        </div>
                        <div className="text-xs text-slate-500">Groups: {opt.groupsCount || 0}</div>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Status: {opt.status || 'N/A'} · Shipping: {modesLabel}
                      </div>
                      {isDiscounted && (
                        <div className="text-xs text-emerald-700 font-semibold mt-1">
                          Packing discount disponibil ({opt.discounts.length})
                        </div>
                      )}
                      {selected && <div className="text-xs text-blue-600 mt-2">Selected</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isEmpty && (
            <div className="px-4 py-6 text-slate-600 text-sm">
              No pack groups received yet. Once we fetch the Amazon plan, groups will appear here.
            </div>
          )}

          {!waitingForAmazon && !showErrorOnly && visibleGroups.map((group) => (
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
                  <CheckCircle className="w-4 h-4" /> {resolveBoxState(group).boxes} boxes
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
                          packingConfirmed: false,
                          perBoxDetails: null,
                          perBoxItems: null
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
                      onChange={() =>
                        onUpdateGroup(group.id, {
                          packMode: 'multiple',
                          contentInformationSource: 'BOX_CONTENT_PROVIDED'
                        })
                      }
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
                      onClick={() => {
                        commitDraft(group, ["boxes", "boxWeight", "boxDimensions"]);
                        const { dims, weight } = resolveBoxState(group);
                        const length = resolveGroupNumber(dims.length);
                        const width = resolveGroupNumber(dims.width);
                        const height = resolveGroupNumber(dims.height);
                        const w = resolveGroupNumber(weight);
                        if (!(length > 0 && width > 0 && height > 0 && w > 0)) {
                          setContinueError('Completează dimensiunile și greutatea înainte de a salva grupul.');
                          return;
                        }
                        const key = group.packingGroupId || group.id;
                        onUpdateGroup(key, { packingConfirmed: true });
                        setContinueError('');
                      }}
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
                    <div className="flex flex-col gap-2">
                      <label className="font-semibold">How will box content information be provided?</label>
                      <select
                        value={resolveBoxState(group).contentInformationSource}
                        onChange={(e) =>
                          onUpdateGroup(group.id, {
                            contentInformationSource: e.target.value
                          })
                        }
                        className="border rounded-md px-3 py-2 text-sm max-w-md"
                      >
                        {contentOptions.map((opt) => (
                          <option key={opt.value} value={opt.value} disabled={!opt.enabled}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="text-xs text-slate-500">
                        You can enter box content information for up to 10 boxes using a web form.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="font-semibold">How many boxes?</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={getDraft(group).boxes ?? group.boxes}
                        onChange={(e) => setDraftValue(group.id, { boxes: e.target.value })}
                        onBlur={() => commitDraft(group, ["boxes", "perBoxDetails", "perBoxItems"])}
                        className="border rounded-md px-3 py-2 w-20"
                      />
                      <div className="text-xs text-slate-500">Maxim 10 cutii per grup</div>
                    </div>
                  <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openWebForm(group)}
                        disabled={resolveBoxState(group).contentInformationSource !== 'BOX_CONTENT_PROVIDED'}
                        className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md ${
                          resolveBoxState(group).contentInformationSource === 'BOX_CONTENT_PROVIDED'
                            ? 'bg-slate-900 hover:bg-slate-800 text-white'
                            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Open web form
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateGroup(group.id, {
                            boxes: 1,
                            packMode: 'single',
                            perBoxItems: null,
                            perBoxDetails: null
                          });
                        }}
                        className="text-sm text-blue-700 hover:text-blue-800"
                      >
                        Restart
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>
      {isWebFormOpen &&
        (() => {
          const activeGroup = visibleGroups.find(
            (g) => getGroupKey(g) === activeWebFormGroupId
          );
          const fallbackGroup = lastActiveGroupRef.current;
          const target = activeGroup || fallbackGroup;
          return target ? renderWebFormModal(target) : null;
        })()}

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
