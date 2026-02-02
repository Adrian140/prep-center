import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '@/config/supabase';

const FieldLabel = ({ label, children }) => (
  <div className="flex flex-col gap-1 text-sm text-slate-700">
    <span className="font-semibold text-slate-800">{label}</span>
    {children}
  </div>
);

// Small inline placeholder (60x60 light gray) to avoid network failures
const placeholderImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="10">SKU</text></svg>';

const PREP_LABELS = {
  ITEM_POLYBAGGING: 'Polybagging',
  POLYBAGGING: 'Polybagging',
  ITEM_BUBBLEWRAP: 'Bubble wrapping',
  BUBBLEWRAPPING: 'Bubble wrapping',
  ITEM_BLACK_SHRINKWRAP: 'Black shrink wrapping',
  BLACKSHRINKWRAPPING: 'Black shrink wrapping',
  ITEM_TAPING: 'Taping',
  TAPING: 'Taping',
  ITEM_BOXING: 'Boxing / overbox',
  BOXING: 'Boxing / overbox',
  ITEM_DEBUNDLE: 'Debundle',
  DEBUNDLE: 'Debundle',
  ITEM_SUFFOSTK: 'Suffocation warning label',
  SUFFOCATIONSTICKERING: 'Suffocation warning label',
  ITEM_CAP_SEALING: 'Cap sealing',
  CAPSEALING: 'Cap sealing',
  HANGGARMENT: 'Hang garment',
  SETCREATION: 'Set creation',
  REMOVEFROMHANGER: 'Remove from hanger',
  SETSTICKERING: 'Set stickering',
  BLANKSTICKERING: 'Blank stickering',
  LABELING: 'Labeling',
  SHIPSINPRODUCTPACKAGING: 'Ships in product packaging',
  NOPREP: 'No prep'
};

const formatPrepList = (raw) => {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(',')
        .map((val) => val.trim())
        .filter(Boolean);
  const mapped = values
    .map((val) => {
      const key = String(val || '').replace(/[\s-]/g, '').toUpperCase();
      return PREP_LABELS[key] || val;
    })
    .filter((val) => String(val || '').toLowerCase() !== 'noprep');
  return Array.from(new Set(mapped));
};

export default function FbaStep1Inventory({
  data,
  skuStatuses = [],
  blocking = false,
  error = '',
  loadingPlan = false,
  saving = false,
  inboundPlanId = null,
  requestId = null,
  packGroupsPreview = [],
  packGroupsPreviewLoading = false,
  packGroupsPreviewError = '',
  boxPlan = null,
  onBoxPlanChange,
  marketCode = '',
  allowNoInboundPlan = false,
  inboundPlanMissing = false,
  onRetryInboundPlan,
  onBypassInboundPlan,
  inboundPlanCopy = {},
  onChangePacking,
  onChangeQuantity,
  onChangeExpiry,
  onChangePrep,
  onNext
}) {
  const resolvedInboundPlanId =
    inboundPlanId ||
    data?.inboundPlanId ||
    data?.inbound_plan_id ||
    data?.planId ||
    data?.plan_id ||
    null;
  const shipFrom = data?.shipFrom || {};
  const marketplaceRaw = data?.marketplace || '';
  const rawSkus = Array.isArray(data?.skus) ? data.skus : [];
  const skus = rawSkus;

  const marketplaceIdByCountry = {
    FR: 'A13V1IB3VIYZZH',
    DE: 'A1PA6795UKMFR9',
    ES: 'A1RKKUPIHCS9HS',
    IT: 'APJ6JRA9NG5V4',
    FRANCE: 'A13V1IB3VIYZZH',
    GERMANY: 'A1PA6795UKMFR9',
    SPAIN: 'A1RKKUPIHCS9HS',
    ITALY: 'APJ6JRA9NG5V4'
  };
  const marketplaceId = (() => {
    const upper = String(marketplaceRaw || '').trim().toUpperCase();
    return marketplaceIdByCountry[upper] || marketplaceRaw;
  })();
  const marketplaceName = (() => {
    const map = {
      A13V1IB3VIYZZH: 'France',
      A1PA6795UKMFR9: 'Germany',
      A1RKKUPIHCS9HS: 'Spain',
      APJ6JRA9NG5V4: 'Italy'
    };
    return map[marketplaceId] || marketplaceRaw || '—';
  })();
  const totalUnits = skus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);
  const hasUnits = totalUnits > 0;
  const missingInboundPlan = !resolvedInboundPlanId;
  const inboundCopy = {
    banner:
      inboundPlanCopy.banner ||
      'Amazon has not generated inboundPlanId yet. You can retry or continue without it if your box plan is ready.',
    wait:
      inboundPlanCopy.waitBanner ||
      'Waiting for inboundPlanId from Amazon; you can’t continue until the plan is loaded.',
    retry: inboundPlanCopy.retry || 'Retry',
    continueAnyway: inboundPlanCopy.continueAnyway || 'Continue anyway'
  };
  const statusForSku = (sku) => {
    const match =
      skuStatuses.find((s) => s.sku === sku.sku) ||
      skuStatuses.find((s) => s.asin && s.asin === sku.asin) ||
      skuStatuses.find((s) => s.id && s.id === sku.id);
    return match || { state: 'unknown', reason: '' };
  };
  const skuEligibilityBlocking = skuStatuses.some((s) =>
    ['missing', 'inactive', 'restricted', 'inbound_unavailable'].includes(String(s.state))
  );
  const hasBlocking = blocking || skuEligibilityBlocking;

  const [packingModal, setPackingModal] = useState({
    open: false,
    sku: null,
    templateType: 'case',
    unitsPerBox: '',
    boxL: '',
    boxW: '',
    boxH: '',
    boxWeight: '',
    templateName: ''
  });
  const [prepModal, setPrepModal] = useState({
    open: false,
    sku: null,
    prepCategory: '',
    useManufacturerBarcode: false,
    manufacturerBarcodeEligible: true
  });
  const LABEL_PRESETS = {
    thermal: { width: '50', height: '25' },
    standard: { width: '63', height: '25' }
  };

  const [labelModal, setLabelModal] = useState({
    open: false,
    sku: null,
    format: 'thermal',
    width: LABEL_PRESETS.thermal.width,
    height: LABEL_PRESETS.thermal.height,
    quantity: 1
  });
  const [prepTab, setPrepTab] = useState('prep');
  const [prepSelections, setPrepSelections] = useState({});
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState('');
  const [activeBoxByGroup, setActiveBoxByGroup] = useState({});
  const [boxIndexDrafts, setBoxIndexDrafts] = useState({});
  const [boxQtyDrafts, setBoxQtyDrafts] = useState({});
  const [boxDimDrafts, setBoxDimDrafts] = useState({});
  const [singleBoxMode, setSingleBoxMode] = useState(false);

  const normalizedPackGroups = Array.isArray(packGroupsPreview) ? packGroupsPreview : [];
  const hasPackGroups = normalizedPackGroups.some((g) => Array.isArray(g?.items) && g.items.length > 0);
  const MAX_STANDARD_BOX_KG = 23;
  const MAX_STANDARD_BOX_CM = 63.5;

  const safeBoxPlan = useMemo(() => {
    const raw = boxPlan && typeof boxPlan === 'object' ? boxPlan : {};
    const groups = raw?.groups && typeof raw.groups === 'object' ? raw.groups : {};
    return { groups };
  }, [boxPlan]);
  useEffect(() => {
    const keys = Object.keys(safeBoxPlan.groups || {});
    const isSingle = keys.length === 1 && keys[0] === 'single-box';
    setSingleBoxMode(isSingle);
  }, [safeBoxPlan.groups]);
  const packGroupMeta = useMemo(() => {
    if (!hasPackGroups) {
      return [{ groupId: 'ungrouped', label: 'All items' }];
    }
    return normalizedPackGroups
      .map((group, idx) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        if (!items.length) return null;
        return {
          groupId: group.packingGroupId || group.id || `pack-${idx + 1}`,
          label: `Pack ${idx + 1}`
        };
      })
      .filter(Boolean);
  }, [hasPackGroups, normalizedPackGroups]);

  const getGroupPlan = useCallback(
    (groupId, labelFallback) => {
      if (singleBoxMode) {
        const single = safeBoxPlan.groups?.['single-box'];
        if (single) {
          return {
            groupLabel: single.groupLabel || labelFallback || 'Single box',
            boxes: Array.isArray(single.boxes) ? single.boxes : [],
            boxItems: Array.isArray(single.boxItems) ? single.boxItems : []
          };
        }
      }
      const existing = safeBoxPlan.groups?.[groupId];
      if (existing && typeof existing === 'object') {
        return {
          groupLabel: existing.groupLabel || labelFallback || groupId,
          boxes: Array.isArray(existing.boxes) ? existing.boxes : [],
          boxItems: Array.isArray(existing.boxItems) ? existing.boxItems : []
        };
      }
      return { groupLabel: labelFallback || groupId, boxes: [], boxItems: [] };
    },
    [safeBoxPlan.groups]
  );

  const updateBoxPlan = useCallback(
    (nextGroups) => {
      onBoxPlanChange?.({ groups: nextGroups });
    },
    [onBoxPlanChange]
  );

  const applySingleBox = useCallback(() => {
    const makeBox = () => ({
      id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      length_cm: '',
      width_cm: '',
      height_cm: '',
      weight_kg: ''
    });

    const nextGroups = {};
    const matchedSkuIds = new Set();
    const skuLookup = new Map();
    skus.forEach((sku) => {
      const skuKey = String(sku.sku || '').trim().toUpperCase();
      const asinKey = String(sku.asin || '').trim().toUpperCase();
      if (skuKey) skuLookup.set(skuKey, sku);
      if (asinKey) skuLookup.set(asinKey, sku);
    });

    const ensureGroup = (groupId, label) => {
      if (!nextGroups[groupId]) {
        nextGroups[groupId] = {
          groupLabel: label || groupId,
          boxes: [makeBox()],
          boxItems: [{}]
        };
      }
    };

    const assignSku = (sku, groupId, label) => {
      const qty = Math.max(0, Number(sku.units || 0));
      if (!qty) return;
      const key = sku.sku || sku.asin || sku.id;
      ensureGroup(groupId, label);
      nextGroups[groupId].boxItems[0][key] = qty;
      matchedSkuIds.add(sku.id);
    };

    if (hasPackGroups) {
      normalizedPackGroups.forEach((group, idx) => {
        const groupId = group.packingGroupId || group.id || `pack-${idx + 1}`;
        const groupLabel = `Pack group ${idx + 1}`;
        const items = Array.isArray(group?.items) ? group.items : [];
        items.forEach((item) => {
          const key = String(item?.sku || item?.msku || item?.SellerSKU || item?.asin || '').trim().toUpperCase();
          if (!key) return;
          const matched = skuLookup.get(key);
          if (matched) {
            assignSku(matched, groupId, groupLabel);
          }
        });
      });
    }

    skus.forEach((sku) => {
      if (matchedSkuIds.has(sku.id)) return;
      assignSku(sku, 'ungrouped', 'All items');
    });

    updateBoxPlan(nextGroups);
    setSingleBoxMode(false);
    setActiveBoxByGroup(
      Object.keys(nextGroups).reduce(
        (acc, groupId) => ({
          ...acc,
          [groupId]: 0
        }),
        {}
      )
    );
    setBoxIndexDrafts({});
    setBoxQtyDrafts({});
    setBoxDimDrafts({});
  }, [hasPackGroups, normalizedPackGroups, skus, updateBoxPlan]);

  const preventEnterSubmit = useCallback((event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  }, []);

  const updateGroupPlan = useCallback(
    (groupId, updater, labelFallback) => {
      const current = getGroupPlan(groupId, labelFallback);
      const next = updater(current);
      const nextGroups = { ...(safeBoxPlan.groups || {}), [groupId]: next };
      updateBoxPlan(nextGroups);
    },
    [getGroupPlan, safeBoxPlan.groups, updateBoxPlan]
  );

  const setActiveBoxIndex = useCallback((groupId, idx) => {
    setActiveBoxByGroup((prev) => ({
      ...(prev || {}),
      [groupId]: Math.max(0, Number(idx) || 0)
    }));
  }, []);

  const getBoxDraftKey = useCallback((groupId, skuKey, boxIdx) => {
    return `${groupId}::${skuKey}::${boxIdx}`;
  }, []);

  const getDimDraftKey = useCallback((groupId, boxIdx, field) => {
    return `${groupId}::${boxIdx}::${field}`;
  }, []);

  const ensureGroupBoxCount = useCallback(
    (groupId, count, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          while (nextBoxes.length < count) {
            nextBoxes.push({
              id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
              length_cm: '',
              width_cm: '',
              height_cm: '',
              weight_kg: ''
            });
            nextItems.push({});
          }
          return { ...current, groupLabel: current.groupLabel || labelFallback, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const addBoxToGroup = useCallback(
    (groupId, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          nextBoxes.push({
            id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            length_cm: '',
            width_cm: '',
            height_cm: '',
            weight_kg: ''
          });
          nextItems.push({});
          return { ...current, groupLabel: current.groupLabel || labelFallback, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const removeBoxFromGroup = useCallback(
    (groupId, boxIndex, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = (current.boxes || []).filter((_, idx) => idx !== boxIndex);
          const nextItems = (current.boxItems || []).filter((_, idx) => idx !== boxIndex);
          return { ...current, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const updateBoxDim = useCallback(
    (groupId, boxIndex, field, value, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const box = { ...(nextBoxes[boxIndex] || {}) };
          box[field] = value;
          nextBoxes[boxIndex] = box;
          return { ...current, boxes: nextBoxes };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const updateBoxItemQty = useCallback(
    (groupId, boxIndex, skuKey, value, labelFallback, keepZero = false) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          while (nextBoxes.length <= boxIndex) {
            nextBoxes.push({
              id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
              length_cm: '',
              width_cm: '',
              height_cm: '',
              weight_kg: ''
            });
          }
          while (nextItems.length <= boxIndex) {
            nextItems.push({});
          }
          const boxItems = { ...(nextItems[boxIndex] || {}) };
          if (value === null || value === undefined || Number(value) <= 0) {
            if (keepZero) {
              boxItems[skuKey] = 0;
            } else {
              delete boxItems[skuKey];
            }
          } else {
            boxItems[skuKey] = Number(value);
          }
          nextItems[boxIndex] = boxItems;
          const lastUsedIndex = nextItems.reduce((lastIdx, items, idx) => {
            const hasItems = Object.keys(items || {}).length > 0;
            return hasItems ? idx : lastIdx;
          }, -1);
          const trimmedCount = lastUsedIndex + 1;
          const trimmedBoxes = nextBoxes.slice(0, Math.max(0, trimmedCount));
          const trimmedItems = nextItems.slice(0, Math.max(0, trimmedCount));
          return { ...current, boxes: trimmedBoxes, boxItems: trimmedItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  useEffect(() => {
    setActiveBoxByGroup((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      Object.entries(safeBoxPlan.groups || {}).forEach(([groupId, groupPlan]) => {
        const boxes = Array.isArray(groupPlan?.boxes) ? groupPlan.boxes : [];
        const maxIdx = Math.max(0, boxes.length - 1);
        const currentIdx = Number(next[groupId] ?? -1);
        const boxItems = Array.isArray(groupPlan?.boxItems) ? groupPlan.boxItems : [];
        const lastUsedIndex = boxItems.reduce((lastIdx, items, idx) => {
          const hasItems = Object.values(items || {}).some((qty) => Number(qty || 0) > 0);
          return hasItems ? idx : lastIdx;
        }, -1);
        if (currentIdx < 0 && lastUsedIndex >= 0) {
          next[groupId] = Math.min(lastUsedIndex, maxIdx);
          changed = true;
          return;
        }
        if (currentIdx > maxIdx) {
          next[groupId] = maxIdx;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [safeBoxPlan.groups]);

  const groupedRows = (() => {
    if (!hasPackGroups) {
      return skus.map((sku) => ({
        type: 'sku',
        sku,
        groupId: 'ungrouped',
        groupLabel: 'All items'
      }));
    }
    const skuByKey = new Map();
    skus.forEach((sku) => {
      const skuKey = String(sku.sku || '').trim().toUpperCase();
      const asinKey = String(sku.asin || '').trim().toUpperCase();
      if (skuKey) skuByKey.set(skuKey, sku);
      if (asinKey) skuByKey.set(asinKey, sku);
    });
    const usedSkuIds = new Set();
    const rows = [];
    normalizedPackGroups.forEach((group, idx) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      if (!items.length) return;
      const groupId = group.packingGroupId || group.id || `pack-${idx + 1}`;
      rows.push({
        type: 'group',
        label: `Pack group ${idx + 1}`,
        subtitle: 'Items below can be packed together.',
        key: groupId,
        groupId
      });
      items.forEach((it) => {
        const key = String(it?.sku || it?.msku || it?.SellerSKU || it?.asin || '').trim().toUpperCase();
        const matched = key ? skuByKey.get(key) : null;
        if (matched && !usedSkuIds.has(matched.id)) {
          usedSkuIds.add(matched.id);
          rows.push({
            type: 'sku',
            sku: matched,
            key: matched.id,
            groupId,
            groupLabel: `Pack group ${idx + 1}`
          });
        }
      });
    });
    const unassigned = skus.filter((sku) => !usedSkuIds.has(sku.id));
    if (unassigned.length) {
      rows.push({ type: 'group', label: 'Unassigned', key: 'pack-unassigned', groupId: 'pack-unassigned' });
      unassigned.forEach((sku) =>
        rows.push({
          type: 'sku',
          sku,
          key: sku.id,
          groupId: 'pack-unassigned',
          groupLabel: 'Unassigned'
        })
      );
    }
    return rows;
  })();

  const planGroupsForDisplay = useMemo(() => {
    if (singleBoxMode) {
      return [{ groupId: 'single-box', label: 'Single box' }];
    }
    const groupRows = groupedRows
      .filter((row) => row.type === 'group')
      .map((row) => ({
        groupId: row.groupId || row.key || row.label,
        label: row.label || 'Pack'
      }));
    if (groupRows.length) return groupRows;
    return packGroupMeta;
  }, [groupedRows, packGroupMeta, singleBoxMode]);

  const skuGroupMap = useMemo(() => {
    if (singleBoxMode) {
      const map = new Map();
      groupedRows.forEach((row) => {
        if (row.type === 'sku') {
          map.set(row.sku.id, { groupId: 'single-box', groupLabel: 'Single box' });
        }
      });
      return map;
    }
    const map = new Map();
    groupedRows.forEach((row) => {
      if (row.type === 'sku') {
        map.set(row.sku.id, {
          groupId: row.groupId || 'ungrouped',
          groupLabel: row.groupLabel || 'All items'
        });
      }
    });
    return map;
  }, [groupedRows, singleBoxMode]);

  const boxPlanValidation = useMemo(() => {
    const issues = [];
    if (!hasUnits) {
      return { isValid: true, messages: issues };
    }
    if (allowNoInboundPlan && missingInboundPlan) {
      return { isValid: true, messages: [] };
    }
    let missingBoxes = 0;
    let missingAssignments = 0;
    let missingDims = 0;
    let emptyBoxes = 0;
    let overweight = 0;
    let oversize = 0;

    skus.forEach((sku) => {
      const units = Number(sku.units || 0);
      if (units <= 0) return;
      const groupInfo = skuGroupMap.get(sku.id) || { groupId: 'ungrouped', groupLabel: 'All items' };
      const groupPlan = getGroupPlan(groupInfo.groupId, groupInfo.groupLabel);
      const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
      const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
      if (!boxes.length) {
        missingBoxes += 1;
        return;
      }
      const skuKey = String(sku.sku || sku.asin || sku.id);
      const assignedTotal = boxes.reduce((sum, _, idx) => {
        const perBox = boxItems[idx] || {};
        return sum + Number(perBox[skuKey] || 0);
      }, 0);
      if (assignedTotal !== units) {
        missingAssignments += 1;
      }
    });

    planGroupsForDisplay.forEach((group) => {
      const groupPlan = getGroupPlan(group.groupId, group.label);
      const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
      const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
      boxes.forEach((box, idx) => {
        const length = Number(box?.length_cm || box?.length || 0);
        const width = Number(box?.width_cm || box?.width || 0);
        const height = Number(box?.height_cm || box?.height || 0);
        const weight = Number(box?.weight_kg || box?.weight || 0);
        if (!length || !width || !height || !weight) missingDims += 1;
        const maxDim = Math.max(length, width, height);
        if (maxDim > MAX_STANDARD_BOX_CM) oversize += 1;
        if (weight > MAX_STANDARD_BOX_KG) overweight += 1;
        const items = boxItems[idx] || {};
        const assigned = Object.values(items).reduce((sum, val) => sum + Number(val || 0), 0);
        if (assigned <= 0) emptyBoxes += 1;
      });
    });

    if (missingBoxes) issues.push('Add at least one box for every pack with units.');
    if (missingAssignments) issues.push('Distribute all units into boxes (Assigned must equal Units).');
    if (missingDims) issues.push('Add dimensions and weight for every box.');
    if (emptyBoxes) issues.push('Some boxes are empty. Remove them or add items.');
    if (overweight) issues.push(`Weight exceeds the ${MAX_STANDARD_BOX_KG} kg limit.`);
    if (oversize) issues.push(`A dimension exceeds the ${MAX_STANDARD_BOX_CM} cm limit.`);

    return { isValid: issues.length === 0, messages: issues };
  }, [
    hasUnits,
    skus,
    skuGroupMap,
    getGroupPlan,
    planGroupsForDisplay,
    MAX_STANDARD_BOX_CM,
    MAX_STANDARD_BOX_KG
  ]);

  const continueDisabled =
    hasBlocking ||
    saving ||
    (missingInboundPlan && !allowNoInboundPlan) ||
    !requestId ||
    !hasUnits ||
    (!allowNoInboundPlan && !boxPlanValidation.isValid) ||
    (loadingPlan && skus.length === 0);

  const renderSkuRow = (sku, groupId = 'ungrouped', groupLabel = 'All items') => {
    const status = statusForSku(sku);
    const state = String(status.state || '').toLowerCase();
    const prepSelection = prepSelections[sku.id] || {};
    const labelOwner =
      sku.labelOwner ||
      (prepSelection.useManufacturerBarcode === true
        ? 'NONE'
        : sku.manufacturerBarcodeEligible === false
          ? 'SELLER'
          : null);
    const labelOwnerSource = sku.labelOwnerSource || 'unknown';
    const labelRequired = labelOwner && labelOwner !== 'NONE';
    const showLabelButton =
      (labelRequired || labelOwner === null) &&
      (['amazon-override', 'prep-guidance'].includes(labelOwnerSource) || true);
    const prepList = formatPrepList(sku.prepInstructions || sku.prepNotes || []);
    const needsPrepNotice =
      sku.prepRequired || prepList.length > 0 || sku.manufacturerBarcodeEligible === false;
    const prepResolved = prepSelection.resolved;
    const needsExpiry = Boolean(sku.expiryRequired);
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
        ? 'Eligible'
        : state === 'missing'
          ? 'Listing missing'
          : state === 'inactive'
            ? 'Listing inactive'
            : state === 'restricted'
              ? 'Restricted'
              : 'Unknown';

    const skuKey = String(sku.sku || sku.asin || sku.id);
    const groupPlan = getGroupPlan(groupId, groupLabel);
    const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
    const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
    const assignedTotal = boxes.reduce((sum, _, idx) => {
      const perBox = boxItems[idx] || {};
      return sum + Number(perBox[skuKey] || 0);
    }, 0);
    const assignedMismatch = Number(sku.units || 0) !== assignedTotal && Number(sku.units || 0) > 0;
    const assignedEntries = boxes
      .map((_, idx) => ({
        boxIdx: idx,
        qty: Number((boxItems[idx] || {})[skuKey] || 0),
        hasKey: Object.prototype.hasOwnProperty.call(boxItems[idx] || {}, skuKey)
      }))
      .filter((entry) => entry.qty > 0 || entry.hasKey);
    const maxBoxIndex = Math.max(0, boxes.length - 1);
    const activeIndexRaw = activeBoxByGroup[groupId];
    const activeIndex =
      activeIndexRaw === undefined || activeIndexRaw === null
        ? maxBoxIndex
        : Math.min(Math.max(0, Number(activeIndexRaw) || 0), Math.max(maxBoxIndex, 0));

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
            value={sku.packingTemplateName || sku.packing || 'individual'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__template__') {
                openPackingModal(sku);
                return;
              }
              const template = templates.find(
                (t) => t.name === val && (t.sku === sku.sku || (t.asin && t.asin === sku.asin))
              );
              if (template) {
                onChangePacking(sku.id, {
                  packing: template.template_type === 'case' ? 'case' : 'individual',
                  packingTemplateId: template.id,
                  packingTemplateName: template.name,
                  unitsPerBox: template.units_per_box || null
                });
                return;
              }
              onChangePacking(sku.id, {
                packing: val,
                packingTemplateId: null,
                packingTemplateName: null,
                unitsPerBox: null
              });
            }}
            className="border rounded-md px-3 py-2 text-sm w-full"
          >
            {templates
              .filter((t) => t.sku === sku.sku || (t.asin && t.asin === sku.asin))
              .map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            <option value="individual">Individual units</option>
            <option value="case">Case packed</option>
            <option value="__template__">Create packing template</option>
          </select>
        </td>
        <td className="py-3">
          <div className="space-y-1">
            {labelOwner && (
              <div className="text-xs text-slate-500">
                Label owner: <span className="font-semibold">{labelOwner}</span>
              </div>
            )}
            {needsPrepNotice && (
              <div className="text-xs text-amber-700">
                {prepList.length
                  ? `Prep required: ${prepList.join(', ')}`
                  : `Prep set: ${sku.prepRequired ? 'Prep needed' : 'No prep needed'}`}
              </div>
            )}
            {needsExpiry && <div className="text-xs text-amber-700">Expiration date required</div>}
            <div className="flex flex-col items-start gap-1">
              {showLabelButton && (
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => setLabelModal({ ...labelModal, open: true, sku })}
                >
                  Print SKU labels
                </button>
              )}
              <button
                className="text-xs text-blue-600 underline"
                onClick={() => openPrepModal(sku, sku.manufacturerBarcodeEligible !== false)}
              >
                More inputs
              </button>
            </div>
            {sku.readyToPack && (
              <div className="mt-2 flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                <CheckCircle className="w-4 h-4" /> Ready to pack
              </div>
            )}
          </div>
        </td>
        <td className="py-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 border rounded-md text-sm"
                onClick={() => onChangeQuantity(sku.id, Math.max(0, Number(sku.units || 0) - 1))}
              >
                -
              </button>
              <input
                type="number"
                className="w-16 border rounded-md px-2 py-1 text-sm"
                value={sku.units || 0}
                min={0}
                onKeyDown={preventEnterSubmit}
                onChange={(e) => onChangeQuantity(sku.id, Number(e.target.value || 0))}
              />
              <button
                className="px-2 py-1 border rounded-md text-sm"
                onClick={() => onChangeQuantity(sku.id, Number(sku.units || 0) + 1)}
              >
                +
              </button>
            </div>
            {needsExpiry && (
              <input
                type="date"
                value={sku.expiryDate || sku.expiry || ''}
                onChange={(e) => onChangeExpiry(sku.id, e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              />
            )}
            <div className="border border-slate-200 rounded-md p-2 bg-slate-50">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Boxes</span>
                <button
                  className="text-blue-600 underline"
                  type="button"
                  onClick={() => {
                    const currentCount = Math.max(0, boxes.length);
                    const defaultIdx = currentCount > 0 ? Math.max(0, Math.min(activeIndex, currentCount - 1)) : 0;
                    const shouldAppend = assignedEntries.length > 0 && activeIndex >= currentCount - 1;
                    const targetIdx = shouldAppend ? currentCount : defaultIdx;
                    const desiredCount = shouldAppend ? currentCount + 1 : Math.max(1, currentCount || defaultIdx + 1);
                    ensureGroupBoxCount(groupId, desiredCount, groupLabel);
                    updateBoxItemQty(groupId, targetIdx, skuKey, 0, groupLabel, true);
                    setActiveBoxIndex(groupId, targetIdx);
                  }}
                >
                  + Add box
                </button>
              </div>
              {assignedEntries.length === 0 && (
                <div className="text-xs text-slate-500 mt-1">No boxes assigned yet.</div>
              )}
              {assignedEntries.map((entry) => {
                const draftKey = getBoxDraftKey(groupId, skuKey, entry.boxIdx);
                const draftValue = boxIndexDrafts[draftKey];
                const boxInputValue = draftValue === undefined || draftValue === null ? entry.boxIdx + 1 : draftValue;
                const commitBoxIndexChange = () => {
                  const raw = Number(boxInputValue || 0);
                  if (!raw || raw < 1) {
                    setBoxIndexDrafts((prev) => {
                      const next = { ...(prev || {}) };
                      delete next[draftKey];
                      return next;
                    });
                    return;
                  }
                  const nextIdx = raw - 1;
                  if (nextIdx === entry.boxIdx) {
                    setBoxIndexDrafts((prev) => {
                      const next = { ...(prev || {}) };
                      delete next[draftKey];
                      return next;
                    });
                    return;
                  }
                  ensureGroupBoxCount(groupId, nextIdx + 1, groupLabel);
                  updateBoxItemQty(groupId, nextIdx, skuKey, entry.qty, groupLabel, true);
                  updateBoxItemQty(groupId, entry.boxIdx, skuKey, 0, groupLabel);
                  setBoxIndexDrafts((prev) => {
                    const next = { ...(prev || {}) };
                    delete next[draftKey];
                    return next;
                  });
                };
                return (
                <div key={`${skuKey}-box-${entry.boxIdx}`} className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">Box</span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={boxInputValue}
                    onChange={(e) => {
                      setBoxIndexDrafts((prev) => ({
                        ...(prev || {}),
                        [draftKey]: e.target.value
                      }));
                    }}
                    onBlur={commitBoxIndexChange}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitBoxIndexChange();
                        event.currentTarget.blur();
                        return;
                      }
                      preventEnterSubmit(event);
                    }}
                    className="w-16 border rounded-md px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-slate-500">Units</span>
                  {(() => {
                    const qtyDraftKey = `${groupId}::${skuKey}::${entry.boxIdx}::qty`;
                    const draftValue = boxQtyDrafts[qtyDraftKey];
                    const inputValue =
                      draftValue !== undefined && draftValue !== null ? draftValue : entry.qty;
                    const commitBoxQtyChange = () => {
                      const raw = String(boxQtyDrafts[qtyDraftKey] ?? '').trim();
                      const num = raw === '' ? 0 : Number(raw);
                      const nextValue = Number.isFinite(num) ? num : 0;
                      updateBoxItemQty(groupId, entry.boxIdx, skuKey, nextValue, groupLabel, entry.hasKey);
                      if (nextValue > 0 && entry.boxIdx >= activeIndex) {
                        setActiveBoxIndex(groupId, entry.boxIdx);
                      }
                      setBoxQtyDrafts((prev) => {
                        const next = { ...(prev || {}) };
                        delete next[qtyDraftKey];
                        return next;
                      });
                    };
                    return (
                  <input
                    type="number"
                    min={0}
                    value={inputValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBoxQtyDrafts((prev) => ({
                        ...(prev || {}),
                        [qtyDraftKey]: val
                      }));
                    }}
                    onBlur={commitBoxQtyChange}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitBoxQtyChange();
                        event.currentTarget.blur();
                        return;
                      }
                      preventEnterSubmit(event);
                    }}
                    className="w-16 border rounded-md px-2 py-1 text-xs"
                  />
                    );
                  })()}
                  <button
                    className="text-xs text-red-600"
                    type="button"
                    onClick={() => updateBoxItemQty(groupId, entry.boxIdx, skuKey, 0, groupLabel)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              );
              })}
              <div className={`text-xs mt-2 ${assignedMismatch ? 'text-amber-700' : 'text-slate-500'}`}>
                Assigned: {assignedTotal} / {Number(sku.units || 0)}
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  // Prefill prep selections as "No prep needed" for all SKUs (Amazon expects a choice).
  useEffect(() => {
    setPrepSelections((prev) => {
      const next = { ...prev };
      skus.forEach((sku) => {
        if (!next[sku.id]) {
          next[sku.id] = {
            resolved: true,
            prepCategory: 'none',
            useManufacturerBarcode: false,
            manufacturerBarcodeEligible: sku.manufacturerBarcodeEligible !== false
          };
        }
      });
      return next;
    });
  }, [skus]);

  const openPackingModal = (sku) => {
    setPackingModal({
      open: true,
      sku,
      templateType: 'case',
      unitsPerBox: '',
      boxL: '',
      boxW: '',
      boxH: '',
      boxWeight: '',
      templateName: ''
    });
  };

  const closePackingModal = () => setPackingModal((prev) => ({ ...prev, open: false, sku: null }));

  const savePackingTemplate = async () => {
    if (packingModal.sku) {
      const derivedName =
        packingModal.templateName || (packingModal.unitsPerBox ? `pack ${packingModal.unitsPerBox}` : '');
      if (!derivedName) {
        setTemplateError('Set a name or units per box for the template.');
        return;
      }

      const templateType = packingModal.templateType === 'case' ? 'case' : 'individual';
      const unitsPerBox = packingModal.unitsPerBox ? Number(packingModal.unitsPerBox) : null;

      // Persist template if we have a name and companyId
      if (!data?.companyId) {
        setTemplateError('Missing companyId in plan; cannot save template.');
      } else {
        try {
          const payload = {
            company_id: data.companyId,
            marketplace_id: marketplaceId,
            sku: packingModal.sku.sku || null,
            asin: packingModal.sku.asin || null,
            name: derivedName,
            template_type: templateType,
            units_per_box: unitsPerBox,
            box_length_cm: packingModal.boxL ? Number(packingModal.boxL) : null,
            box_width_cm: packingModal.boxW ? Number(packingModal.boxW) : null,
            box_height_cm: packingModal.boxH ? Number(packingModal.boxH) : null,
            box_weight_kg: packingModal.boxWeight ? Number(packingModal.boxWeight) : null
          };
          const { error } = await supabase
            .from('packing_templates')
            .upsert(payload, { onConflict: 'company_id,marketplace_id,sku,name' });
          if (error) {
            console.error('packing template upsert error', error);
            throw error;
          }
          // Reload templates
          const { data: rows } = await supabase
            .from('packing_templates')
            .select('*')
            .eq('company_id', data.companyId)
            .eq('marketplace_id', marketplaceId);
          setTemplates(Array.isArray(rows) ? rows : []);
        } catch (e) {
          setTemplateError(e?.message || 'Could not save template.');
        }
      }

      onChangePacking(packingModal.sku.id, {
        packing: templateType,
        packingTemplateName: derivedName || null,
        unitsPerBox
      });
    }
    closePackingModal();
  };

  const openPrepModal = (sku, eligible = true) => {
    setPrepModal({
      open: true,
      sku,
      prepCategory: prepSelections[sku.id]?.prepCategory || '',
      useManufacturerBarcode: prepSelections[sku.id]?.useManufacturerBarcode || false,
      manufacturerBarcodeEligible: eligible
    });
  };

  const closePrepModal = () => setPrepModal((prev) => ({ ...prev, open: false, sku: null }));

  const savePrepModal = () => {
    if (!prepModal.sku) return;
    const patch = {
      resolved: true,
      prepCategory: prepModal.prepCategory || 'none',
      useManufacturerBarcode: prepModal.useManufacturerBarcode,
      manufacturerBarcodeEligible: prepModal.manufacturerBarcodeEligible
    };
    const labelOwnerFromSku = prepModal.sku.labelOwner || null;
    const derivedLabelOwner =
      labelOwnerFromSku ||
      (patch.useManufacturerBarcode
        ? 'NONE'
        : prepModal.sku.manufacturerBarcodeEligible === false
          ? 'SELLER'
          : null);
    const prepOwner = patch.prepCategory && patch.prepCategory !== 'none' ? 'SELLER' : 'NONE';

    setPrepSelections((prev) => ({
      ...prev,
      [prepModal.sku.id]: patch
    }));
    onChangePrep?.(prepModal.sku.id, {
      prepCategory: patch.prepCategory,
      useManufacturerBarcode: patch.useManufacturerBarcode,
      prepOwner,
      labelOwner: derivedLabelOwner
    });
    closePrepModal();
  };

  const openLabelModal = (sku) => {
    setLabelModal({
      open: true,
      sku,
      format: 'thermal',
      width: '50',
      height: '25',
      quantity: Number(sku.units || 1) || 1
    });
  };

  const closeLabelModal = () => setLabelModal((prev) => ({ ...prev, open: false, sku: null }));

  const handleDownloadLabels = async () => {
    if (!labelModal.sku) return;
    setLabelError('');
    setLabelLoading(true);

    try {
      const payload = {
        company_id: data.companyId,
        marketplace_id: marketplaceId,
        items: [
          {
            sku: labelModal.sku.sku,
            asin: labelModal.sku.asin,
            fnsku: labelModal.sku.fnsku,
            quantity: Math.max(1, Number(labelModal.quantity) || 1)
          }
        ]
      };

      const { data: resp, error } = await supabase.functions.invoke('fba-labels', { body: payload });
      if (error) {
        throw new Error(error.message || 'Could not request labels from Amazon.');
      }
      if (resp?.error) {
        throw new Error(resp.error);
      }
      if (resp?.downloadUrl) {
        window.open(resp.downloadUrl, '_blank', 'noopener');
        closeLabelModal();
        return;
      }
      if (resp?.operationId) {
        setLabelError('Label request sent to Amazon; try again in a few seconds if the PDF did not open.');
        return;
      }
      throw new Error('Amazon response missing downloadUrl/operationId');
    } catch (err) {
      console.error('fba-labels error', err);
      setLabelError(err?.message || 'Could not download Amazon labels.');
    } finally {
      setLabelLoading(false);
    }
  };

  const prepCategoryLabel = (value) => {
    switch (value) {
      case 'fragile':
        return 'Fragile/glass';
      case 'liquids':
        return 'Liquids (non glass)';
      case 'perforated':
        return 'Perforated packaging';
      case 'powder':
        return 'Powder, pellets and granular';
      case 'small':
        return 'Small';
      case 'none':
      default:
        return 'No prep needed';
    }
  };

  // Load packing templates for this company/marketplace
  useEffect(() => {
    const loadTemplates = async () => {
      if (!data?.companyId) return;
      setLoadingTemplates(true);
      setTemplateError('');
      try {
        const { data: rows, error } = await supabase
          .from('packing_templates')
          .select('*')
          .eq('company_id', data.companyId)
          .eq('marketplace_id', marketplaceId);
        if (error) throw error;
        setTemplates(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setTemplateError(e?.message || 'Could not load packing templates.');
      } finally {
        setLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, [data?.companyId, marketplaceId]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <div className="font-semibold text-slate-900">Step 1 - Confirmed inventory to send</div>
          <div className="text-sm text-slate-500">SKUs confirmed ({skus.length})</div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={applySingleBox}
            className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-3 py-2 rounded-md"
          >
            Put everything in one box
          </button>
        </div>
      </div>

      {(error || hasBlocking) && (
        <div
          className={`px-6 py-3 border-b text-sm ${error ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
        >
          {error ||
            (skuEligibilityBlocking
              ? 'Some products are not eligible for the selected marketplace.'
              : 'Amazon inbound plan is not ready. Retry Step 1 to regenerate the plan.')}
        </div>
      )}
      {loadingPlan && skus.length === 0 && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          Amazon plan is still loading. Waiting for generated SKUs/shipments; nothing to show yet.
        </div>
      )}

      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-b border-slate-200">
        <FieldLabel label="Ship from">
          <div className="text-slate-800">{shipFrom.name || '—'}</div>
          <div className="text-slate-600 text-sm">{shipFrom.address || '—'}</div>
        </FieldLabel>
        <FieldLabel label="Marketplace destination (Country)">
          <select
            value={marketplaceId}
            className="border rounded-md px-3 py-2 text-sm w-full bg-slate-100 text-slate-800"
            disabled
          >
            <option value={marketplaceId}>{marketplaceName}</option>
          </select>
        </FieldLabel>
      </div>

      <div className="px-6 py-4 overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[22%]" />
            <col className="w-[24%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-slate-500 uppercase text-xs">
              <th className="py-2">SKU details</th>
              <th className="py-2">Packing details</th>
              <th className="py-2">Information / action</th>
              <th className="py-2">Quantity to send</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {skus.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  {loadingPlan
                    ? 'Waiting for Amazon response for SKUs and shipments...'
                    : 'No SKUs to display.'}
                </td>
              </tr>
            )}
            {groupedRows.map((row, rowIdx) => {
              if (row.type === 'group') {
                return (
                  <tr key={`group-${row.key}-${rowIdx}`} className="bg-slate-50">
                    <td colSpan={4} className="py-2 text-slate-700 border-t border-slate-200">
                      <div className="font-semibold">{row.label}</div>
                      {row.subtitle && (
                        <div className="text-xs text-slate-500">{row.subtitle}</div>
                      )}
                    </td>
                  </tr>
                );
              }
              if (row.type === 'sku') {
                return renderSkuRow(row.sku, row.groupId, row.groupLabel);
              }
              return null;
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 space-y-4">
        <div className="font-semibold text-slate-900">Box details (Step 1)</div>
        {planGroupsForDisplay.map((group) => {
          const groupPlan = getGroupPlan(group.groupId, group.label);
          const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
          return (
            <div key={group.groupId} className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">{group.label}</div>
              </div>
              {boxes.length === 0 && <div className="text-sm text-slate-500">No boxes yet.</div>}
              {boxes.map((box, idx) => {
                const buildKey = (field) => getDimDraftKey(group.groupId, idx, field);
                const valueForField = (field, fallback) => {
                  const draft = boxDimDrafts[buildKey(field)];
                  return draft !== undefined && draft !== null ? draft : fallback;
                };
                const commitDim = (field, rawValue) => {
                  updateBoxDim(group.groupId, idx, field, rawValue, group.label);
                  setBoxDimDrafts((prev) => {
                    const next = { ...(prev || {}) };
                    delete next[buildKey(field)];
                    return next;
                  });
                };
                const handleDimKeyDown = (field) => (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitDim(field, event.currentTarget.value);
                    event.currentTarget.blur();
                    return;
                  }
                  preventEnterSubmit(event);
                };
                return (
                  <div
                    key={box.id || `${group.groupId}-box-${idx}`}
                    className="border border-slate-200 rounded-md p-3 bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">Box {idx + 1}</div>
                      <button
                        className="text-sm text-red-600"
                        onClick={() => removeBoxFromGroup(group.groupId, idx, group.label)}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={valueForField('length_cm', box?.length_cm ?? box?.length ?? '')}
                        onChange={(e) =>
                          setBoxDimDrafts((prev) => ({
                            ...(prev || {}),
                            [buildKey('length_cm')]: e.target.value
                          }))
                        }
                        onBlur={(e) => commitDim('length_cm', e.target.value)}
                        onKeyDown={handleDimKeyDown('length_cm')}
                        className="border rounded-md px-3 py-2 text-sm"
                        placeholder="Length (cm)"
                      />
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={valueForField('width_cm', box?.width_cm ?? box?.width ?? '')}
                        onChange={(e) =>
                          setBoxDimDrafts((prev) => ({
                            ...(prev || {}),
                            [buildKey('width_cm')]: e.target.value
                          }))
                        }
                        onBlur={(e) => commitDim('width_cm', e.target.value)}
                        onKeyDown={handleDimKeyDown('width_cm')}
                        className="border rounded-md px-3 py-2 text-sm"
                        placeholder="Width (cm)"
                      />
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={valueForField('height_cm', box?.height_cm ?? box?.height ?? '')}
                        onChange={(e) =>
                          setBoxDimDrafts((prev) => ({
                            ...(prev || {}),
                            [buildKey('height_cm')]: e.target.value
                          }))
                        }
                        onBlur={(e) => commitDim('height_cm', e.target.value)}
                        onKeyDown={handleDimKeyDown('height_cm')}
                        className="border rounded-md px-3 py-2 text-sm"
                        placeholder="Height (cm)"
                      />
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={valueForField('weight_kg', box?.weight_kg ?? box?.weight ?? '')}
                        onChange={(e) =>
                          setBoxDimDrafts((prev) => ({
                            ...(prev || {}),
                            [buildKey('weight_kg')]: e.target.value
                          }))
                        }
                        onBlur={(e) => commitDim('weight_kg', e.target.value)}
                        onKeyDown={handleDimKeyDown('weight_kg')}
                        className="border rounded-md px-3 py-2 text-sm"
                        placeholder="Weight (kg)"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {boxPlanValidation.messages.length > 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md space-y-1">
            {boxPlanValidation.messages.map((msg) => (
              <div key={msg}>{msg}</div>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-slate-200 space-y-3">
        <div className="font-semibold text-slate-900">Pack groups preview (Step 1)</div>
        {packGroupsPreviewLoading && (
          <div className="text-sm text-slate-600">Loading grouping from Amazon…</div>
        )}
        {!packGroupsPreviewLoading && packGroupsPreviewError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
            {packGroupsPreviewError}
          </div>
        )}
        {!packGroupsPreviewLoading && !packGroupsPreviewError && (!packGroupsPreview || packGroupsPreview.length === 0) && (
          <div className="text-sm text-slate-600">
            No packing groups yet. Continue to Step 1b or reload the plan.
          </div>
        )}
        {!packGroupsPreviewLoading && hasPackGroups && (
          <div className="text-sm text-slate-600">
            Products are grouped above in the list by pack groups.
          </div>
        )}
        {!packGroupsPreviewLoading && Array.isArray(packGroupsPreview) && packGroupsPreview.length > 0 && !hasPackGroups && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {packGroupsPreview.map((group, idx) => {
              const items = Array.isArray(group.items) ? group.items : [];
              return (
                <div key={group.packingGroupId || group.id || `pack-${idx + 1}`} className="px-4 py-3">
                  <div className="font-semibold text-slate-900">Pack {idx + 1}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {items.map((it, itemIdx) => {
                      const label = it.title || it.name || it.sku || it.asin || 'SKU';
                      const skuLabel = it.sku || it.msku || it.SellerSKU || it.asin || '—';
                      const qty = Number(it.quantity || 0) || 0;
                      return (
                        <div key={`${skuLabel}-${itemIdx}`} className="flex items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <span className="font-semibold">{label}</span>
                            <span className="text-xs text-slate-500">{skuLabel}</span>
                          </div>
                          <div className="text-sm font-semibold">{qty}</div>
                        </div>
                      );
                    })}
                  </div>
                  {idx < packGroupsPreview.length - 1 && <div className="border-t border-slate-200 mt-3" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200">
        <div className="text-sm text-slate-600">
          SKUs confirmed to send: {skus.length} ({totalUnits} units)
        </div>
        <div className="flex gap-3 justify-end flex-wrap">
          {inboundPlanMissing && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md flex flex-col gap-2">
              <span>{inboundCopy.banner}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onRetryInboundPlan?.()}
                  className="px-3 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                >
                  {inboundCopy.retry}
                </button>
                <button
                  type="button"
                  onClick={() => onBypassInboundPlan?.()}
                  className="px-3 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  {inboundCopy.continueAnyway}
                </button>
              </div>
            </div>
          )}
          {!resolvedInboundPlanId && !inboundPlanMissing && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
              {inboundCopy.wait}
            </div>
          )}
          {hasUnits && !boxPlanValidation.isValid && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
              Complete box planning before continuing.
            </div>
          )}
          {!hasUnits && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
              No units to send. Set at least 1 unit.
            </div>
          )}
          <button
            onClick={() => {
              if (skuEligibilityBlocking) {
                alert('Some SKUs are not eligible on Amazon; fix eligibility and try again.');
                return;
              }
              if (hasBlocking) {
                alert(error || 'Amazon inbound plan is not ready. Retry Step 1.');
                return;
              }
              const disabled = continueDisabled;
              if (disabled) return;
              onNext?.();
            }}
            disabled={continueDisabled}
            className={`px-4 py-2 rounded-md font-semibold shadow-sm text-white ${
              continueDisabled ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loadingPlan && skus.length === 0
              ? 'Waiting for Amazon response...'
              : saving
                ? 'Saving…'
                : hasBlocking
                  ? skuEligibilityBlocking
                    ? 'Resolve eligibility in Amazon'
                    : 'Retry Step 1'
                  : (!allowNoInboundPlan && (!inboundPlanId || !requestId))
                    ? 'Waiting for Amazon plan'
                    : !hasUnits
                      ? 'Add units'
                      : 'Continue to packing'}
            </button>
          </div>
        </div>

      {packingModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">Packing details</div>
              <button onClick={closePackingModal} className="text-slate-500 hover:text-slate-700 text-sm">Close</button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {packingModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={packingModal.sku.image || placeholderImg}
                    alt={packingModal.sku.title}
                    className="w-14 h-14 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{packingModal.sku.title}</div>
                    <div className="text-xs text-slate-600">SKU: {packingModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">ASIN: {packingModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">Storage: {packingModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-800">Packing template name</label>
                  <input
                    type="text"
                    value={packingModal.templateName}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateName: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. 12 units per box"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Template type</label>
                  <select
                    value={packingModal.templateType}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateType: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="case">Case pack</option>
                    <option value="individual">Individual units</option>
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-800">Units per box</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.unitsPerBox}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, unitsPerBox: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-sm font-semibold text-slate-800">Box dimensions (cm)</label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={0}
                      value={packingModal.boxL}
                      onChange={(e) => setPackingModal((prev) => ({ ...prev, boxL: e.target.value }))}
                      className="border rounded-md px-3 py-2 text-sm"
                      placeholder="L"
                    />
                    <input
                      type="number"
                      min={0}
                      value={packingModal.boxW}
                      onChange={(e) => setPackingModal((prev) => ({ ...prev, boxW: e.target.value }))}
                      className="border rounded-md px-3 py-2 text-sm"
                      placeholder="W"
                    />
                    <input
                      type="number"
                      min={0}
                      value={packingModal.boxH}
                      onChange={(e) => setPackingModal((prev) => ({ ...prev, boxH: e.target.value }))}
                      className="border rounded-md px-3 py-2 text-sm"
                      placeholder="H"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Box weight (kg)</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxWeight}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxWeight: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    placeholder="0.0"
                  />
                </div>
              </div>

              <div className="text-sm text-slate-700">
                <div className="font-semibold text-slate-800">Prep category:</div>
                <div className="text-emerald-700">No prep needed</div>
                <div className="text-slate-600 mt-1">Manufacturer barcode required (no additional labelling needed)</div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closePackingModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                Cancel
              </button>
              <button
                onClick={savePackingTemplate}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {prepModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">Prepare your FBA items</div>
              <button onClick={closePrepModal} className="text-slate-500 hover:text-slate-700 text-sm">Close</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {prepModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={prepModal.sku.image || placeholderImg}
                    alt={prepModal.sku.title}
                    className="w-12 h-12 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{prepModal.sku.title}</div>
                    <div className="text-xs text-slate-600">SKU: {prepModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">ASIN: {prepModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">Storage: {prepModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setPrepTab('prep')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'prep' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  Prep guidance
                </button>
                <button
                  onClick={() => setPrepTab('barcode')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'barcode' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  Use manufacturer barcode
                </button>
              </div>

              {prepTab === 'prep' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Choose prep category</label>
                    <select
                      value={prepModal.prepCategory}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, prepCategory: e.target.value }))}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Select...</option>
                      <option value="fragile">Fragile/glass</option>
                      <option value="liquids">Liquids (non glass)</option>
                      <option value="perforated">Perforated packaging</option>
                      <option value="powder">Powder, pellets and granular</option>
                      <option value="small">Small</option>
                      <option value="none">No prep needed</option>
                    </select>
                  </div>
                  {formatPrepList(prepModal.sku?.prepInstructions || prepModal.sku?.prepNotes || []).length > 0 && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                      Guidance: {formatPrepList(prepModal.sku?.prepInstructions || prepModal.sku?.prepNotes || []).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {prepTab === 'barcode' && (
                <div className="space-y-3">
                  {!prepModal.manufacturerBarcodeEligible ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      This SKU is not eligible to use manufacturer barcode for tracking.
                    </div>
                  ) : (
                    <div className="text-sm text-slate-700">This SKU can use manufacturer barcode.</div>
                  )}
                  <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={prepModal.useManufacturerBarcode}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, useManufacturerBarcode: e.target.checked }))}
                    />
                    Use manufacturer barcode for tracking
                  </label>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closePrepModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                Cancel
              </button>
              <button
                onClick={savePrepModal}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {labelModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">Print SKU labels</div>
              <button onClick={closeLabelModal} className="text-slate-500 hover:text-slate-700 text-sm">Close</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {labelModal.sku && (
                <div className="flex gap-3">
                  <img
                    src={labelModal.sku.image || placeholderImg}
                    alt={labelModal.sku.title}
                    className="w-12 h-12 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-sm text-slate-800">
                    <div className="font-semibold text-slate-900 leading-snug">{labelModal.sku.title}</div>
                    <div className="text-xs text-slate-600">SKU: {labelModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">ASIN: {labelModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">Fulfilment by Amazon storage type: {labelModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">Choose printing format</label>
                  <select
                    value={labelModal.format}
                    onChange={(e) => {
                      const nextFormat = e.target.value;
                      const preset = LABEL_PRESETS[nextFormat] || LABEL_PRESETS.thermal;
                      setLabelModal((prev) => ({
                        ...prev,
                        format: nextFormat,
                        width: preset.width,
                        height: preset.height
                      }));
                    }}
                    className="border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="thermal">Thermal printing</option>
                    <option value="standard">Standard formats</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">Width (mm)</label>
                  <input
                    type="number"
                    min={1}
                    value={labelModal.width}
                    onChange={(e) => setLabelModal((prev) => ({ ...prev, width: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">Height (mm)</label>
                  <input
                    type="number"
                    min={1}
                    value={labelModal.height}
                    onChange={(e) => setLabelModal((prev) => ({ ...prev, height: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-md">
                <div className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-200">SKU details</div>
                {labelModal.sku && (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <img
                      src={labelModal.sku.image || placeholderImg}
                      alt={labelModal.sku.title}
                      className="w-10 h-10 object-contain border border-slate-200 rounded"
                    />
                    <div className="flex-1 text-sm text-slate-800">
                      <div className="font-semibold text-slate-900 leading-snug line-clamp-2">{labelModal.sku.title}</div>
                      <div className="text-xs text-slate-600">SKU: {labelModal.sku.sku}</div>
                      <div className="text-xs text-slate-600">ASIN: {labelModal.sku.asin}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <label className="text-xs text-slate-600">Print labels</label>
                      <input
                        type="number"
                        min={1}
                        value={labelModal.quantity}
                        onChange={(e) => setLabelModal((prev) => ({ ...prev, quantity: e.target.value }))}
                        className="border rounded-md px-3 py-2 text-sm w-24 text-right"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closeLabelModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                Cancel
              </button>
              <button
                onClick={handleDownloadLabels}
                disabled={labelLoading}
                className={`px-4 py-2 rounded-md text-white text-sm font-semibold shadow-sm ${labelLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {labelLoading ? 'Downloading…' : 'Download labels'}
              </button>
            </div>
            {labelError && (
              <div className="px-6 pb-4 text-sm text-red-600">
                {labelError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
