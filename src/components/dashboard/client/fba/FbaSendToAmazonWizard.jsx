import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../../config/supabase';
import { CheckCircle2, Circle, Eye } from 'lucide-react';
import FbaStep1Inventory from './FbaStep1Inventory';
import FbaStep1bPacking from './FbaStep1bPacking';
import FbaStep2Shipping from './FbaStep2Shipping';
import FbaStep3Labels from './FbaStep3Labels';
import FbaStep4Tracking from './FbaStep4Tracking';
import { useMarket } from '@/contexts/MarketContext';
import { useDashboardTranslation } from '@/translations';

const getSafeNumber = (val) => {
  if (val === null || val === undefined) return null;
  const num = Number(String(val).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
};

const getPositiveNumber = (val) => {
  const num = getSafeNumber(val);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const getFiniteNumber = (val) => {
  const num = getSafeNumber(val);
  return Number.isFinite(num) ? num : null;
};

const HEAVY_PARCEL_THRESHOLD_KG = 15;
const HEAVY_PARCEL_LABELS_PER_BOX = 5;
const HEAVY_PARCEL_LABEL_UNIT_PRICE = 0.2;

const computeHeavyParcelFromBoxPlan = (plan) => {
  const groups = plan?.groups && typeof plan.groups === 'object' ? Object.values(plan.groups) : [];
  let heavyBoxes = 0;
  groups.forEach((group) => {
    const boxes = Array.isArray(group?.boxes) ? group.boxes : [];
    boxes.forEach((box) => {
      const weight = getPositiveNumber(box?.weight_kg ?? box?.weight ?? null);
      if (weight && weight > HEAVY_PARCEL_THRESHOLD_KG) {
        heavyBoxes += 1;
      }
    });
  });
  const labels = heavyBoxes * HEAVY_PARCEL_LABELS_PER_BOX;
  return {
    heavyBoxes,
    labels,
    unitPrice: HEAVY_PARCEL_LABEL_UNIT_PRICE,
    total: labels * HEAVY_PARCEL_LABEL_UNIT_PRICE
  };
};

const sumUnitsFromItems = (items) => {
  if (!Array.isArray(items)) return null;
  let sum = 0;
  let hasUnits = false;
  items.forEach((it) => {
    const qty = getFiniteNumber(it?.quantity ?? it?.qty ?? it?.units ?? it?.unitCount ?? it?.count);
    if (Number.isFinite(qty)) {
      sum += qty;
      hasUnits = true;
    }
  });
  return hasUnits ? sum : null;
};

const resolveShipmentUnits = (shipment, fallback, index, fallbackList) => {
  const candidates = [
    shipment?.units,
    shipment?.unitCount,
    shipment?.unitsCount,
    shipment?.totalUnits,
    shipment?.total_units,
    shipment?.quantity,
    shipment?.qty
  ];
  for (const val of candidates) {
    const num = getFiniteNumber(val);
    if (Number.isFinite(num)) return num;
  }
  const fromItems = sumUnitsFromItems(
    shipment?.items ||
      shipment?.shipmentItems ||
      shipment?.shipment_items ||
      shipment?.skuItems ||
      shipment?.sku_items
  );
  if (Number.isFinite(fromItems)) return fromItems;
  const fallbackUnits = getFiniteNumber(
    fallback?.units ?? fallbackList?.[index]?.units
  );
  if (Number.isFinite(fallbackUnits)) return fallbackUnits;
  return 0;
};

const getSafeDims = (dims = {}) => {
  // Accept null/undefined and bail out early to avoid runtime errors in callers.
  if (!dims || typeof dims !== 'object') return null;
  const length = getPositiveNumber(dims.length);
  const width = getPositiveNumber(dims.width);
  const height = getPositiveNumber(dims.height);
  if (!length || !width || !height) return null;
  return { length, width, height };
};

const normalizeShipDate = (val) => {
  if (!val) return null;
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return str;
  const dd = String(match[1]).padStart(2, '0');
  const mm = String(match[2]).padStart(2, '0');
  const yyyy = match[3];
  return `${yyyy}-${mm}-${dd}`;
};

const invokeAuthedFunction = async (functionName, body) => {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.access_token) {
    throw new Error('Session expired. Please refresh and sign in again.');
  }

  return await supabase.functions.invoke(functionName, {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    },
    body
  });
};

// Return an ISO datetime:
// - if input already contains time, normalize that exact moment to ISO
// - if input is a date only, keep previous logic (today/past => now+6h, future => 12:00 UTC)
const normalizeReadyStartIso = (dateStr) => {
  const raw = String(dateStr || '').trim();
  if (raw && raw.includes('T')) {
    const dt = new Date(raw);
    if (Number.isFinite(dt.getTime())) return dt.toISOString();
  }

  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const targetDate = raw ? new Date(`${raw}T00:00:00Z`) : todayStart;
  const isPast = targetDate < todayStart;
  const isToday = !isPast && targetDate.getTime() === todayStart.getTime();

  if (isPast || isToday) {
    const plusSixHours = new Date(today.getTime() + 6 * 60 * 60 * 1000);
    return plusSixHours.toISOString();
  }

  const base = new Date(targetDate);
  base.setUTCHours(12, 0, 0, 0);
  return base.toISOString();
};

const getTomorrowIsoDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const splitIntegerProportionally = (total, weights = []) => {
  const normalizedTotal = Math.max(0, Math.floor(Number(total) || 0));
  const safeWeights = (Array.isArray(weights) ? weights : []).map((weight) => {
    const num = Number(weight || 0);
    return Number.isFinite(num) && num > 0 ? num : 0;
  });
  if (!safeWeights.length) return [];
  if (normalizedTotal <= 0) return safeWeights.map(() => 0);
  const positiveCount = safeWeights.filter((weight) => weight > 0).length;
  const effectiveTotal = positiveCount > 0 ? Math.max(normalizedTotal, positiveCount) : normalizedTotal;
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (!(totalWeight > 0)) {
    const base = Array.from({ length: safeWeights.length }, () => 0);
    for (let i = 0; i < effectiveTotal; i += 1) {
      base[i % safeWeights.length] += 1;
    }
    return base;
  }
  const floors = safeWeights.map((weight) => {
    if (!(weight > 0)) return 0;
    return Math.floor((weight / totalWeight) * effectiveTotal);
  });
  let assigned = floors.reduce((sum, value) => sum + value, 0);
  safeWeights.forEach((weight, idx) => {
    if (weight > 0 && floors[idx] === 0) {
      floors[idx] = 1;
      assigned += 1;
    }
  });
  if (assigned > effectiveTotal) {
    let overflow = assigned - effectiveTotal;
    const ranked = floors
      .map((value, idx) => ({ idx, value, weight: safeWeights[idx] }))
      .filter((entry) => entry.value > 1)
      .sort((a, b) => b.value - a.value || a.weight - b.weight);
    for (const entry of ranked) {
      if (overflow <= 0) break;
      const reducible = Math.min(entry.value - 1, overflow);
      floors[entry.idx] -= reducible;
      overflow -= reducible;
    }
  } else if (assigned < effectiveTotal) {
    const remainders = safeWeights
      .map((weight, idx) => {
        if (!(weight > 0)) return { idx, remainder: -1 };
        const exact = (weight / totalWeight) * effectiveTotal;
        return { idx, remainder: exact - floors[idx] };
      })
      .sort((a, b) => b.remainder - a.remainder);
    let remaining = effectiveTotal - assigned;
    let cursor = 0;
    while (remaining > 0 && remainders.length) {
      const target = remainders[cursor % remainders.length];
      floors[target.idx] += 1;
      remaining -= 1;
      cursor += 1;
    }
  }
  return floors;
};

// Packing helpers (duplicated locally to avoid cross-file imports)
const normalizePackingType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'case') return 'case';
  if (raw === 'single_sku_pallet' || raw === 'single-sku-pallet') return 'single_sku_pallet';
  return 'individual';
};

const isPalletFriendlyPacking = (value) => {
  const norm = normalizePackingType(value);
  return norm === 'case' || norm === 'single_sku_pallet';
};

const isLtlLikeMode = (mode) => {
  const up = String(mode || '').toUpperCase();
  return up === 'LTL' || up === 'FTL' || up === 'FREIGHT_LTL' || up === 'FREIGHT_FTL';
};

const CARRIER_CODE_LABELS = {
  UPS: 'UPS',
  UPSN: 'UPS',
  DHL: 'DHL',
  DPD: 'DPD',
  GLS: 'GLS',
  TNT: 'TNT',
  USPS: 'USPS',
  FDEG: 'FedEx',
  FDXG: 'FedEx Ground',
  FDXE: 'FedEx Express'
};

const looksLikeInternalCarrierCode = (value) => /^[A-Z0-9]{4,6}$/.test(String(value || '').trim());

const resolveCarrierDisplayName = (carrier = {}, fallback = '') => {
  const rawName = String(carrier?.name || fallback || '').trim();
  const rawCode = String(carrier?.alphaCode || '').trim().toUpperCase();
  if (rawName) {
    const upperName = rawName.toUpperCase();
    if (!(looksLikeInternalCarrierCode(upperName) && !CARRIER_CODE_LABELS[upperName])) {
      return rawName;
    }
    if (CARRIER_CODE_LABELS[upperName]) return CARRIER_CODE_LABELS[upperName];
  }
  if (rawCode && CARRIER_CODE_LABELS[rawCode]) return CARRIER_CODE_LABELS[rawCode];
  if (rawCode && looksLikeInternalCarrierCode(rawCode)) return 'Other carrier';
  return rawName || rawCode || 'Carrier';
};

const detectPartneredOption = (opt = {}) => {
  const explicit =
    opt?.isPartnered ??
    opt?.is_partnered ??
    opt?.partneredCarrier ??
    opt?.partnered ??
    opt?.isAmazonPartnered ??
    opt?.amazonPartnered ??
    null;

  if (explicit === true) return true;

  const type = String(
    opt?.transportationOptionType ||
    opt?.transportation_option_type ||
    opt?.transportationOption?.transportationOptionType ||
    opt?.transportationOption?.type ||
    opt?.type ||
    ''
  ).toUpperCase();

  if (type.includes('AMAZON_PARTNERED') || type.includes('PARTNERED_CARRIER') || type === 'PARTNERED') {
    return true;
  }

  const solution = String(
    opt?.shippingSolution ||
    opt?.shippingSolutionId ||
    opt?.shipping_solution ||
    opt?.shipping_solution_id ||
    ''
  ).toUpperCase();

  if (solution.includes('AMAZON_PARTNERED') || solution.includes('PARTNERED_CARRIER')) {
    return true;
  }

  const seen = new Set();
  const stack = [opt];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;
    if (typeof cur === 'string') {
      const s = cur.toUpperCase();
      if (s.includes('AMAZON_PARTNERED') || s.includes('PARTNERED_CARRIER') || s === 'PARTNERED') return true;
      continue;
    }
    if (typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const v of Object.values(cur)) stack.push(v);
  }

  return false;
};

const normalizeTransportMode = (mode) => {
  const up = String(mode || '').toUpperCase();
  if (!up) return '';
  if (up === 'GROUND_SMALL_PARCEL' || up === 'SPD' || up === 'SMALL_PARCEL') return 'SPD';
  if (up === 'FREIGHT_LTL' || up === 'LTL') return 'LTL';
  if (up === 'FREIGHT_FTL' || up === 'FTL') return 'FTL';
  return up;
};

const extractOptionCharge = (opt) => {
  const candidate = [
    opt?.charge,
    opt?.quote?.cost?.amount,
    opt?.raw?.quote?.cost?.amount,
    opt?.raw?.charge?.totalCharge?.amount,
    opt?.raw?.totalCharge?.amount,
    opt?.raw?.chargeAmount?.amount,
    opt?.raw?.estimatedCharge?.amount,
    opt?.raw?.price?.amount
  ].find((v) => v !== null && v !== undefined);
  const val = Number(candidate);
  return Number.isFinite(val) ? val : null;
};

const aggregateTransportationOptions = (options = [], summary = null) => {
  const shipmentCount = Number(summary?.shipmentCount || summary?.shipment_count || 0) || 0;
  const seen = new Set();
  const list = (Array.isArray(options) ? options : [])
    .map((opt) => {
      const optionId =
        opt?.id ||
        opt?.transportationOptionId ||
        opt?.optionId ||
        opt?.raw?.transportationOptionId ||
        opt?.raw?.id ||
        opt?.raw?.optionId ||
        null;
      if (!optionId) return null;
      if (seen.has(optionId)) return null;
      seen.add(optionId);
      const partnered = detectPartneredOption(opt);
      const mode = opt?.mode || opt?.shippingMode || opt?.raw?.shippingMode || 'GROUND_SMALL_PARCEL';
      const shippingSolution =
        opt?.shippingSolution ||
        opt?.raw?.shippingSolution ||
        (partnered ? 'AMAZON_PARTNERED_CARRIER' : 'USE_YOUR_OWN_CARRIER');
      const carrierName = resolveCarrierDisplayName(
        opt?.raw?.carrier,
        opt?.carrierName || opt?.raw?.carrier?.alphaCode || opt?.raw?.carrier || ''
      ) || (partnered ? 'Amazon Partnered Carrier' : 'Non Amazon partnered carrier');
      return {
        ...opt,
        id: optionId,
        partnered,
        isPartnered: partnered,
        mode,
        shippingSolution,
        carrierName,
        charge: extractOptionCharge(opt),
        shipmentCount: shipmentCount || null
      };
    })
    .filter(Boolean);

  return list.sort((a, b) => {
    const modeA = normalizeTransportMode(a?.mode || a?.shippingMode);
    const modeB = normalizeTransportMode(b?.mode || b?.shippingMode);
    const modeRank = { SPD: 0, LTL: 1, FTL: 2 };
    const rankA = modeRank[modeA] ?? 9;
    const rankB = modeRank[modeB] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    if (Boolean(a?.partnered) !== Boolean(b?.partnered)) return a?.partnered ? -1 : 1;
    const chargeA = Number.isFinite(a?.charge) ? Number(a.charge) : Number.MAX_SAFE_INTEGER;
    const chargeB = Number.isFinite(b?.charge) ? Number(b.charge) : Number.MAX_SAFE_INTEGER;
    if (chargeA !== chargeB) return chargeA - chargeB;
    return String(a?.carrierName || '').localeCompare(String(b?.carrierName || ''));
  });
};

const parseMaybeJson = (raw) => {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const extractFunctionInvokeError = async (err) => {
  const ctx = err?.context || null;
  const response = ctx?.response || null;
  let payload = null;

  if (!payload && response && typeof response === 'object') {
    if (response?.data && typeof response.data === 'object') {
      payload = response.data;
    }
    if (!payload && typeof response?.json === 'function') {
      try {
        payload = await response.clone().json();
      } catch {
        // ignore json parse failures
      }
    }
    if (!payload && typeof response?.text === 'function') {
      try {
        const txt = await response.clone().text();
        payload = parseMaybeJson(txt) || (txt ? { error: txt } : null);
      } catch {
        // ignore text parse failures
      }
    }
  }

  if (!payload && ctx?.response?.data && typeof ctx.response.data === 'object') {
    payload = ctx.response.data;
  }
  if (!payload && ctx?.data && typeof ctx.data === 'object') {
    payload = ctx.data;
  }
  if (!payload && ctx?.error && typeof ctx.error === 'object') {
    payload = ctx.error;
  }

  const status =
    (typeof response?.status === 'number' ? response.status : null) ||
    (typeof ctx?.status === 'number' ? ctx.status : null) ||
    null;

  const code =
    payload?.code ||
    payload?.errorCode ||
    payload?.error_code ||
    null;

  const message =
    payload?.error ||
    payload?.message ||
    ctx?.error?.message ||
    err?.message ||
    'Edge Function returned a non-2xx status code';

  return {
    payload,
    status,
    code: code ? String(code) : null,
    message: String(message)
  };
};

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

const initialPackGroups = [];

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
  initialShipmentMode = {
    method: 'SPD',
    deliveryDate: '',
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
    carrier: null
  },
  initialShipmentList = initialShipments,
  initialTrackingList = initialTracking,
  initialTrackingIds = [],
  initialSkuStatuses = [],
  initialCompletedSteps = [],
  initialShippingOptions = [],
  initialShippingSummary = null,
  initialShippingConfirmed = false,
  initialSelectedTransportationOptionId = null,
  initialLabelFormat = 'thermal',
  initialCurrentStep = null,
  historyMode = false,
  autoLoadPlan = false,
  fetchPlan // optional async () => ({ shipFrom, marketplace, skus, packGroups, shipments, skuStatuses, warning, blocking })
}) {
  const { currentMarket } = useMarket();
  const { t, tp } = useDashboardTranslation();
  const tt = useCallback(
    (key, fallback) => {
      const val = t(`Wizard.${key}`);
      return val === `Wizard.${key}` ? fallback ?? val : val;
    },
    [t]
  );
  const wizardCopy = useMemo(
    () => ({
      missingIds: tt('missingIdsError', 'Missing inboundPlanId or requestId; reload the plan.'),
      packingWait: tt('packingGroupsWait', 'Amazon has not returned packing groups yet. Try again in a few seconds.'),
      inboundPlanWait: tt('inboundPlanMissingError', 'Waiting for inboundPlanId from Amazon. Try again in a few seconds.'),
      previewUnavailable: tt('packingPreviewUnavailable', 'Preview unavailable right now.'),
      inboundPlanEmpty: tt('inboundPlanEmpty', 'Inbound plan is still empty. Try again in a few seconds.'),
      banner: tt(
        'inboundPlanMissingBanner',
        'Amazon has not generated inboundPlanId yet. You can retry or continue without it if your box plan is ready.'
      ),
      waitBanner: tt(
        'inboundPlanMissingWait',
        'Waiting for inboundPlanId from Amazon; you can’t continue until the plan is loaded.'
      ),
      retry: tt('retry', 'Retry'),
      continueAnyway: tt('continueAnyway', 'Continue anyway')
    }),
    [tt]
  );
  const [plan, setPlan] = useState(initialPlan);
  const [carrierTouched, setCarrierTouched] = useState(false);
  const [shippingConfirmed, setShippingConfirmed] = useState(historyMode ? Boolean(initialShippingConfirmed) : false);
  // Nu mai colapsăm grupurile Amazon; le lăsăm distincte.
  const collapsePackGroups = useCallback((groups) => {
    const list = Array.isArray(groups) ? groups : [];
    return list;
  }, []);
  const allowPersistence = false; // dezactivăm persistența nouă până când schema DB este prezentă peste tot
  const normalizePackGroups = useCallback(
    (groups = []) => {
      const list = Array.isArray(groups) ? groups : [];
      // Dacă Amazon a trimis mai multe packing groups, nu le colapsăm într-unul singur.
      const source = list.length > 1 ? list : collapsePackGroups(list);
      return source.map((g, idx) => {
        const items = (g.items || [])
          .map((it) => ({
            sku: it.sku || it.msku || it.SellerSKU || it.sellerSku || it.asin || '',
            quantity: Number(it.quantity || it.units || 0) || 0,
            image: it.image || it.thumbnail || it.main_image || it.img || null,
            title: it.title || it.name || null,
            // stochează labelOwner din Amazon ca să nu-l suprascriem în payload
            apiLabelOwner: it.labelOwner || it.label_owner || it.label || null,
            expiration:
              it.expiration ||
              it.expiry ||
              it.expiryDate ||
              it.expirationDate ||
              null,
            prepOwner: it.prepOwner || it.prep_owner || it.prep || null,
            labelOwner: it.labelOwner || it.label_owner || it.label || null
          }))
          .filter((it) => Number(it.quantity || 0) > 0); // ignorăm item-ele cu cantitate 0
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
          packingConfirmed: Boolean(g.packingConfirmed),
          perBoxDetails: g.perBoxDetails || g.per_box_details || null,
          perBoxItems: g.perBoxItems || g.per_box_items || null,
          contentInformationSource: g.contentInformationSource || g.content_information_source || null
        };
      });
    },
    [collapsePackGroups]
  );
  const getPackGroupKey = useCallback((group) => group?.packingGroupId || group?.id || null, []);
  const getPackGroupSignature = useCallback((group) => {
    const items = Array.isArray(group?.items) ? group.items : [];
    const parts = items
      .map((it) => {
        const sku = String(it?.sku || it?.msku || it?.SellerSKU || '').trim().toUpperCase();
        const qty = Number(it?.quantity || it?.units || 0) || 0;
        if (!sku || qty <= 0) return null;
        return `${sku}:${qty}`;
      })
      .filter(Boolean)
      .sort();
    return parts.length ? parts.join('|') : null;
  }, []);
  const mergePackGroups = useCallback((prev = [], incoming = []) => {
    const prevByKey = new Map();
    prev.forEach((g) => {
      const key = getPackGroupKey(g);
      if (key) prevByKey.set(key, g);
    });
    return incoming.map((g, idx) => {
      const key = getPackGroupKey(g);
      let existing = key ? prevByKey.get(key) : null;
      if (!existing) {
        existing = prev[idx] || null;
      }
      if (!existing) return g;
      const resolvedDims = getSafeDims(g.boxDimensions)
        ? g.boxDimensions
        : getSafeDims(existing.boxDimensions)
          ? existing.boxDimensions
          : null;
      const incomingWeight = getPositiveNumber(g.boxWeight);
      const existingWeight = getPositiveNumber(existing.boxWeight);
      const resolvedPackMode = g.packMode ?? existing.packMode ?? 'single';
      const resolvedContentSource = g.contentInformationSource || existing.contentInformationSource || null;
      return {
        ...existing,
        ...g,
        // păstrează items/dims/weight locale dacă Amazon nu le trimite
        items: Array.isArray(g.items) && g.items.length ? g.items : existing.items || [],
        boxDimensions: resolvedDims,
        boxWeight: incomingWeight ?? existingWeight ?? null,
        boxes: g.boxes ?? existing.boxes ?? 1,
        packMode: resolvedPackMode,
        packingConfirmed: g.packingConfirmed || existing.packingConfirmed || false,
        perBoxDetails: g.perBoxDetails || existing.perBoxDetails || null,
        perBoxItems: g.perBoxItems || existing.perBoxItems || null,
        contentInformationSource: resolvedContentSource
      };
    });
  }, [getPackGroupKey, getPackGroupSignature]);
  const [packGroups, setPackGroups] = useState([]);
  const [packGroupsPreview, setPackGroupsPreview] = useState([]);
  const [packGroupsPreviewLoading, setPackGroupsPreviewLoading] = useState(false);
const [packGroupsPreviewError, setPackGroupsPreviewError] = useState('');
  const [packGroupsLoaded, setPackGroupsLoaded] = useState(false);
  const [step1BoxPlanByMarket, setStep1BoxPlanByMarket] = useState({});
  const step1BoxPlanRef = useRef(step1BoxPlanByMarket);
  const [packingOptionId, setPackingOptionId] = useState(initialPlan?.packingOptionId || null);
  const [packingOptions, setPackingOptions] = useState([]);
  const [placementOptionId, setPlacementOptionId] = useState(initialPlan?.placementOptionId || null);
  const [shipmentMode, setShipmentMode] = useState(initialShipmentMode);

  const [palletDetails, setPalletDetails] = useState(
    initialShipmentMode?.palletDetails || {
      quantity: 1,
      length: '',
      width: '',
      height: '',
      weight: '',
      stackability: 'STACKABLE',
      freightClass: 'FC_XX',
      declaredValue: '',
      declaredValueCurrency: 'EUR'
    }
  );
  const [shipments, setShipments] = useState(initialShipmentList);
  const [labelFormat, setLabelFormat] = useState(initialLabelFormat || 'thermal');
  const [tracking, setTracking] = useState(initialTrackingList);
  const [labelsLoadingId, setLabelsLoadingId] = useState(null);
  const [labelsError, setLabelsError] = useState('');
  const [step3Confirming, setStep3Confirming] = useState(false);
  const [step3Error, setStep3Error] = useState('');
  const [manualFbaShipmentIds, setManualFbaShipmentIds] = useState({});
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planError, setPlanError] = useState('');
  const [planNotice, setPlanNotice] = useState('');
  const [step1Saving, setStep1Saving] = useState(false);
  const [step1SaveError, setStep1SaveError] = useState('');
  const [step1HiddenSkuIds, setStep1HiddenSkuIds] = useState({});
  const [allowNoInboundPlan, setAllowNoInboundPlan] = useState(false);
  const [inboundPlanMissing, setInboundPlanMissing] = useState(false);
  const [skuStatuses, setSkuStatuses] = useState(initialSkuStatuses);
  const [operationProblems, setOperationProblems] = useState(
    Array.isArray(initialPlan?.operationProblems) ? initialPlan.operationProblems : []
  );
  const [blocking, setBlocking] = useState(false);
  const [shippingOptions, setShippingOptions] = useState(
    historyMode ? (Array.isArray(initialShippingOptions) ? initialShippingOptions : []) : []
  );
  const shippingOptionsRef = useRef(Array.isArray(initialShippingOptions) ? initialShippingOptions : []);
  const [readyWindowByShipment, setReadyWindowByShipment] = useState({});
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingSummary, setShippingSummary] = useState(historyMode ? initialShippingSummary : null);
  const [selectedTransportationOptionId, setSelectedTransportationOptionId] = useState(
    historyMode ? initialSelectedTransportationOptionId : null
  );
  const [shippingError, setShippingError] = useState('');
  const [packingSubmitLoading, setPackingSubmitLoading] = useState(false);
  const [packingSubmitError, setPackingSubmitError] = useState('');
  const [packingRefreshLoading, setPackingRefreshLoading] = useState(false);
  const [packingReadyError, setPackingReadyError] = useState('');
  const [step2Loaded, setStep2Loaded] = useState(false);
  const [shippingConfirming, setShippingConfirming] = useState(false);
  const [skipPacking, setSkipPacking] = useState(false);
  const [forcePartneredOnly, setForcePartneredOnly] = useState(false);
  const [skuServicesById, setSkuServicesById] = useState({});
  const [boxServices, setBoxServices] = useState([]);
  const hasDangerousGoodsService = useMemo(() => {
    const dgPattern = /\bdg\b|dangerous|hazmat|lithium|battery/i;
    const allServices = [
      ...Object.values(skuServicesById || {}).flat(),
      ...(Array.isArray(boxServices) ? boxServices : [])
    ];
    return allServices.some((svc) => dgPattern.test(String(svc?.service_name || '')));
  }, [skuServicesById, boxServices]);
  const hasTrackingIds = useMemo(
    () => (Array.isArray(tracking) ? tracking.some((t) => String(t?.trackingId || '').trim().length > 0) : false),
    [tracking]
  );
  const skipReadyWindowValidationAfterPickup = useMemo(
    () => Boolean(shippingConfirmed && hasTrackingIds && !hasDangerousGoodsService),
    [shippingConfirmed, hasTrackingIds, hasDangerousGoodsService]
  );
  useEffect(() => {
    shippingOptionsRef.current = Array.isArray(shippingOptions) ? shippingOptions : [];
  }, [shippingOptions]);
  const isLtlFtl = useCallback((method) => {
    const up = String(method || '').toUpperCase();
    return up === 'LTL' || up === 'FTL' || up === 'FREIGHT_LTL' || up === 'FREIGHT_FTL';
  }, []);

  const palletLimits = useMemo(() => {
    const market = String(currentMarket || '').toUpperCase();
    const isEu = market === 'FR' || market === 'DE';
    return {
      maxWeightKg: isEu ? 500 : 680,
      maxHeightCm: isEu ? 180 : 182
    };
  }, [currentMarket]);

  const DEFAULT_EU_PALLET = useMemo(
    () => ({
      length: 120,
      width: 80
    }),
    []
  );

  const derivedWeightKg = useMemo(() => {
    const skus = Array.isArray(plan?.skus) ? plan.skus : [];
    if (!skus.length) return 0;
    return skus.reduce((sum, sku) => {
      const units = Number(sku?.units || sku?.quantity || 0) || 0;
      const g = Number(
        sku?.weight_g ??
          sku?.itemWeightGrams ??
          sku?.item_weight_grams ??
          (sku?.item_package_weight?.[0]?.unit === 'grams' ? sku?.item_package_weight?.[0]?.value : 0)
      );
      const kg =
        Number(sku?.weightKg ?? sku?.weight_kg ?? sku?.itemWeightKg ?? sku?.item_weight_kg ?? 0) ||
        (g > 0 ? g / 1000 : 0);
      return sum + (kg * units || 0);
    }, 0);
  }, [plan?.skus]);

  const palletOnlyMode = useMemo(() => {
    if (isLtlFtl(shipmentMode?.method)) return true;

    // Heuristic 1: toate SKU-urile sunt case/single_sku_pallet și au unitsPerBox
    const skus = Array.isArray(plan?.skus) ? plan.skus : [];
    if (!skus.length) return false;
    // dacă există măcar un SKU marcat ca "individual", nu e pallet-only
    const hasIndividual = skus.some((sku) => normalizePackingType(sku?.packing) === 'individual');
    if (hasIndividual) return false;
    const palletPacking = skus.every((sku) => isPalletFriendlyPacking(sku?.packing));
    const hasUnitsPerBox = skus.every((sku) => Number(sku?.unitsPerBox ?? sku?.units_per_box ?? 0) > 0);

    // Heuristic 2: pack groups vin deja cu boxes și units proporționale (case-pack)
    const groupsCasePacked = Array.isArray(packGroups) && packGroups.length > 0 && packGroups.every((g) => {
      const boxes = Number(g?.boxes || 0);
      const units = Number(g?.units || 0);
      if (!(boxes > 0 && units > 0)) return false;
      const ratio = units / boxes;
      return ratio >= 1; // acceptăm și non-int pentru placeholder Amazon
    });

    return (palletPacking && hasUnitsPerBox) || groupsCasePacked;
  }, [isLtlFtl, plan?.skus, shipmentMode?.method, packGroups]);

  const skipPackingStep = useMemo(() => {
    if (palletOnlyMode) return true;
    const skus = Array.isArray(plan?.skus) ? plan.skus : [];
    const activeSkus = skus.filter((sku) => Number(sku?.units || sku?.quantity || 0) > 0);
    if (!activeSkus.length) return false;
    return activeSkus.every((sku) => {
      const packingType = normalizePackingType(
        sku?.packing || sku?.packingTemplateType || sku?.packing_template_type || null
      );
      const unitsPerBox = Number(sku?.unitsPerBox ?? sku?.units_per_box ?? 0) || 0;
      return (packingType === 'case' || packingType === 'single_sku_pallet') && unitsPerBox > 0;
    });
  }, [palletOnlyMode, plan?.skus]);

  const derivedPalletSummary = useMemo(() => {
    if (!palletOnlyMode) return null;
    const market = String(currentMarket || '').toUpperCase();
    const isEu = market === 'FR' || market === 'DE';
    const footprint = isEu ? `${DEFAULT_EU_PALLET.length}x${DEFAULT_EU_PALLET.width} cm` : '120x100 cm';
    const totalWeight = derivedWeightKg || 0;
    const weightLimit = palletLimits.maxWeightKg || 500;
    const pallets = Math.max(1, totalWeight > 0 ? Math.ceil(totalWeight / weightLimit) : 1);
    const weightPerPallet = totalWeight > 0 ? Number((totalWeight / pallets).toFixed(2)) : '';
    const defaultHeight = isEu ? 120 : 120;
    return {
      pallets,
      totalWeightKg: totalWeight ? Number(totalWeight.toFixed(2)) : '',
      totalVolumeCm3: null,
      freightClass: 'FC_XX',
      footprint,
      stackability: 'STACKABLE',
      length: isEu ? DEFAULT_EU_PALLET.length : 120,
      width: isEu ? DEFAULT_EU_PALLET.width : 100,
      height: defaultHeight,
      weightPerPallet
    };
  }, [palletOnlyMode, currentMarket, DEFAULT_EU_PALLET, palletLimits.maxWeightKg, derivedWeightKg]);

  // Default transport to LTL when fluxul e doar pe paleți, ca să nu ceară box dims SPD.
  useEffect(() => {
    if (!palletOnlyMode) return;
    setShipmentMode((prev) => {
      const nextMethod = isLtlFtl(prev?.method) ? prev.method : 'LTL';
      if (nextMethod === prev?.method) return prev;
      return { ...prev, method: nextMethod };
    });
  }, [palletOnlyMode, isLtlFtl]);

  // Autocomplete EU standard pallet footprint (120x80) when lipsesc dimensiunile.
  useEffect(() => {
    const market = String(currentMarket || '').toUpperCase();
    const isEu = market === 'FR' || market === 'DE';
    if (!palletOnlyMode || !isEu) return;
    setPalletDetails((prev) => {
      const length = Number(prev.length || 0) || DEFAULT_EU_PALLET.length;
      const width = Number(prev.width || 0) || DEFAULT_EU_PALLET.width;
      const height = Number(prev.height || 0) || prev.height || '';
      const weight =
        Number(prev.weight || 0) ||
        (derivedWeightKg > 0 ? Number(derivedWeightKg.toFixed(2)) : 25); // fallback 25kg dacă nu avem greutate
      if (length === prev.length && width === prev.width && weight === prev.weight && height === prev.height) return prev;
      return { ...prev, length, width, weight, height };
    });
  }, [palletOnlyMode, currentMarket, DEFAULT_EU_PALLET, derivedWeightKg]);

  // Include Step 4 for both flows; pallet-only still skips Step 1b.
  const stepsOrder = useMemo(
    () => (skipPackingStep ? ['1', '2', '3', '4'] : ['1', '1b', '2', '3', '4']),
    [skipPackingStep]
  );

  const resolveInitialStep = useCallback(() => {
    if (!historyMode) return '1';
    if (initialCurrentStep && stepsOrder.includes(initialCurrentStep)) return initialCurrentStep;
    if (Array.isArray(initialCompletedSteps) && initialCompletedSteps.length) {
      const last = initialCompletedSteps[initialCompletedSteps.length - 1];
      if (stepsOrder.includes(last)) return last;
    }
    return '1';
  }, [historyMode, initialCurrentStep, initialCompletedSteps, stepsOrder]);
  const [currentStep, setCurrentStep] = useState(resolveInitialStep);
  const [completedSteps, setCompletedSteps] = useState(historyMode ? initialCompletedSteps : []);

  const handleReadyWindowChange = useCallback((shipmentId, win) => {
    if (!shipmentId) return;
    const startInput = normalizeShipDate(win?.start);
    const startIso = startInput || normalizeShipDate(new Date().toISOString().slice(0, 10));
    const requireEnd = isLtlFtl(shipmentMode?.method);
    let endIso = normalizeShipDate(win?.end || '');
    // end nu este impus; îl lăsăm gol dacă userul nu completează
    if (!requireEnd) endIso = null;

    setReadyWindowByShipment((prev) => ({ ...prev, [shipmentId]: { start: startIso, end: endIso || undefined } }));
    setShipmentMode((prev) => ({
      ...prev,
      deliveryDate: startIso,
      deliveryWindowStart: startIso,
      deliveryWindowEnd: endIso || ''
    }));
    if (!skipReadyWindowValidationAfterPickup) {
      fetchShippingOptions({ force: true });
    }
  }, [shipmentMode?.method, fetchShippingOptions, skipReadyWindowValidationAfterPickup]);
  const isFallbackId = useCallback((v) => typeof v === "string" && v.toLowerCase().startsWith("fallback-"), []);
  const hasRealPackGroups = useCallback(
    (groups) =>
      (Array.isArray(groups) ? groups : []).some((g) => g?.packingGroupId && !isFallbackId(g.packingGroupId)),
    [isFallbackId]
  );
  // Dacă Amazon returnează un inboundPlanId invalid (LOCK-* sau prea lung), intrăm automat în modul bypass.
  useEffect(() => {
    const raw =
      plan?.inboundPlanId ||
      plan?.inbound_plan_id ||
      initialPlan?.inboundPlanId ||
      initialPlan?.inbound_plan_id ||
      null;
    const bad = raw && (String(raw).startsWith('LOCK-') || String(raw).length > 38);
    if (bad) {
      setAllowNoInboundPlan(true);
      setInboundPlanMissing(true);
    }
  }, [plan?.inboundPlanId, plan?.inbound_plan_id, initialPlan?.inboundPlanId, initialPlan?.inbound_plan_id]);
  // Curăță planul local dacă primim un inboundPlanId invalid, ca să nu încerce call-urile de GET pe ID corupt.
  useEffect(() => {
    const raw = plan?.inboundPlanId || plan?.inbound_plan_id || null;
    const bad = raw && (String(raw).startsWith('LOCK-') || String(raw).length > 38);
    if (bad) {
      setPlan((prev) => ({
        ...prev,
        inboundPlanId: null,
        inbound_plan_id: null,
        planId: prev?.planId && String(prev.planId).startsWith('LOCK-') ? null : prev?.planId,
        plan_id: prev?.plan_id && String(prev.plan_id).startsWith('LOCK-') ? null : prev?.plan_id
      }));
    }
  }, [plan?.inboundPlanId, plan?.inbound_plan_id]);
  const serverUnitsRef = useRef(new Map());
  const packGroupsRef = useRef(packGroups);
  const planRef = useRef(plan);
  const packingOptionIdRef = useRef(packingOptionId);
  const placementOptionIdRef = useRef(placementOptionId);
  const packingRefreshLockRef = useRef({ inFlight: false, planId: null });
  const packingPreviewLockRef = useRef({ inFlight: false, planId: null });
  const packingAutoRetryTimerRef = useRef(null);
  const packingPreviewFetchRef = useRef(false);
  const fetchPlanInFlightRef = useRef(false);
  const servicesLoadedRef = useRef(false);
  const shippingRetryRef = useRef(0);
  const shippingRetryTimerRef = useRef(null);
  const shippingFetchLockRef = useRef({ inFlight: false, lastKey: "", lastAt: 0 });
  const selectedOptionSignatureRef = useRef(null);
  const toFriendlyPlanNotice = useCallback((warning) => {
    const raw = String(warning || '').trim();
    if (!raw) return '';
    if (/shipments.+goal|fluxul continu[aă] normal|packing options/i.test(raw)) {
      return 'Planul Amazon a fost creat cu succes. Poți continua cu împachetarea (Step 1b).';
    }
    return raw
      .replace(/`/g, '')
      .replace(/\b(RequestId|TraceId)\s*:\s*[A-Za-z0-9-]+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }, []);
  const planMissingRetryRef = useRef(0);
  const trackingPrefillRef = useRef(false);
  const trackingLoadRequestedRef = useRef(false);
  const autoPackingRef = useRef({ planId: null, attempted: false });
  const step1BoxPlanPersistTimerRef = useRef(null);
  const lastStep1BoxPlanPersistedRef = useRef("");
  const step1UnitsPersistTimerRef = useRef(null);
  const step1bDraftPersistTimerRef = useRef(null);
  const lastStep1bDraftPersistedRef = useRef("");
  const sanitizePackingOptions = useCallback((options) => {
    const list = Array.isArray(options) ? options : [];
    const filtered = list.filter((opt) => {
      const discounts = opt?.discounts || opt?.Discounts || [];
      const groups = Array.isArray(opt?.packingGroups || opt?.PackingGroups)
        ? opt.packingGroups || opt.PackingGroups
        : [];
      const groupsCount = opt?.groupsCount ?? groups.length ?? 0;
      const hasDiscount = Array.isArray(discounts) && discounts.length > 0;
      const isMultiGroup = groupsCount > 1;
      return !hasDiscount && !isMultiGroup;
    });
    if (filtered.length) return filtered;
    return list.slice(0, 1);
  }, []);
  const resolvePackingOptionId = useCallback(
    (opt) => opt?.packingOptionId || opt?.PackingOptionId || opt?.id || null,
    []
  );
  const optionHasDiscount = useCallback((opt) => {
    const discounts = opt?.discounts || opt?.Discounts || [];
    return Array.isArray(discounts) && discounts.length > 0;
  }, []);
  const optionIsStandard = useCallback(
    (opt) => {
      const groups = Array.isArray(opt?.packingGroups || opt?.PackingGroups)
        ? opt.packingGroups || opt.PackingGroups
        : [];
      const groupsCount = opt?.groupsCount ?? groups.length ?? 0;
      return groupsCount === 1;
    },
    []
  );
  const maybeSelectStandardPackingOption = useCallback(
    (options) => {
      const list = Array.isArray(options) ? options : [];
      if (!list.length) return;
      const standard =
        list.find((opt) => optionIsStandard(opt)) ||
        list.find((opt) => !optionHasDiscount(opt)) ||
        list[0];
      if (!standard) return;
      const currentId = packingOptionIdRef.current;
      const currentOpt = list.find(
        (opt) => String(resolvePackingOptionId(opt)) === String(currentId)
      );
      const shouldSetDefault = !currentId || (currentOpt && !optionIsStandard(currentOpt));
      if (!shouldSetDefault) return;
      const standardId = resolvePackingOptionId(standard);
      if (!standardId) return;
      packingOptionIdRef.current = standardId;
      setPackingOptionId(standardId);
      setPlan((prev) => ({
        ...prev,
        packingOptionId: standardId,
        packing_option_id: standardId
      }));
    },
    [optionHasDiscount, optionIsStandard, resolvePackingOptionId]
  );
  useEffect(() => {
    packGroupsRef.current = packGroups;
  }, [packGroups]);
  useEffect(() => {
    step1BoxPlanRef.current = step1BoxPlanByMarket;
  }, [step1BoxPlanByMarket]);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const step1BoxPlanForMarket = useMemo(() => {
    const raw = step1BoxPlanByMarket || {};
    const planData = raw?.[currentMarket] || null;
    if (planData && typeof planData === 'object') return planData;
    return { groups: {} };
  }, [step1BoxPlanByMarket, currentMarket]);
  const hasStep1BoxPlanData = useCallback((planByMarket) => {
    if (!planByMarket || typeof planByMarket !== 'object') return false;
    return Object.values(planByMarket).some((marketPlan) => {
      const groups = marketPlan?.groups && typeof marketPlan.groups === 'object' ? marketPlan.groups : {};
      return Object.values(groups).some((group) => {
        const boxes = Array.isArray(group?.boxes) ? group.boxes : [];
        const boxItems = Array.isArray(group?.boxItems) ? group.boxItems : [];
        const dimensionSets = Array.isArray(group?.dimension_sets) ? group.dimension_sets : [];
        const assignments =
          group?.dimension_assignments && typeof group.dimension_assignments === 'object'
            ? Object.keys(group.dimension_assignments)
            : [];
        return boxes.length > 0 || boxItems.length > 0 || dimensionSets.length > 0 || assignments.length > 0;
      });
    });
  }, []);
  const step1PlanGroupsData = useMemo(() => {
    const groups = step1BoxPlanForMarket?.groups || {};
    const ordered = Object.entries(groups)
      .map(([key, value]) => ({
        key,
        value,
        label: value?.groupLabel || ''
      }))
      .sort((a, b) => {
        const numA = Number(String(a.label).match(/(\d+)/)?.[1] || 0);
        const numB = Number(String(b.label).match(/(\d+)/)?.[1] || 0);
        return numA - numB;
      });
    const buildPlanSignature = (planGroup) => {
      const boxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      if (!boxItems.length) return null;
      const totals = new Map();
      boxItems.forEach((box) => {
        Object.entries(box || {}).forEach(([key, qty]) => {
          const sku = String(key || '').trim().toUpperCase();
          if (!sku) return;
          const add = Number(qty || 0) || 0;
          totals.set(sku, (totals.get(sku) || 0) + add);
        });
      });
      const parts = Array.from(totals.entries())
        .filter(([, qty]) => Number(qty) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sku, qty]) => `${sku}:${qty}`);
      return parts.length ? parts.join('|') : null;
    };
    const signatureMap = new Map();
    ordered.forEach(({ key, value }) => {
      const sig = buildPlanSignature(value);
      if (sig && !signatureMap.has(sig)) {
        signatureMap.set(sig, { key, value });
      }
    });
    return { groups, ordered, signatureMap, buildPlanSignature };
  }, [step1BoxPlanForMarket]);
  const resolvePlanGroupForPackGroup = useCallback(
    (group) => {
      const key =
        group?.step1PlanGroupKey ||
        group?.packingGroupId ||
        group?.id ||
        null;
      const direct = key ? step1PlanGroupsData.groups?.[key] : null;
      if (direct) {
        return { planGroup: direct, planGroupKey: key };
      }
      const sig = getPackGroupSignature(group);
      if (sig && step1PlanGroupsData.signatureMap.has(sig)) {
        const entry = step1PlanGroupsData.signatureMap.get(sig);
        return { planGroup: entry?.value || null, planGroupKey: entry?.key || null };
      }
      // fallback: dacă nu găsim după id sau semnătură, ia primul grup din plan (evită payload gol)
      const fallback = Array.isArray(step1PlanGroupsData.ordered) ? step1PlanGroupsData.ordered[0] : null;
      if (fallback?.value) {
        return { planGroup: fallback.value, planGroupKey: fallback.key || key };
      }
      return { planGroup: null, planGroupKey: key };
    },
    [getPackGroupSignature, step1PlanGroupsData]
  );
  const handleStep1BoxPlanChange = useCallback(
    (nextPlan) => {
      if (!nextPlan || typeof nextPlan !== 'object') return;
      setStep1BoxPlanByMarket((prev) => ({
        ...(prev || {}),
        [currentMarket]: nextPlan
      }));
    },
    [currentMarket]
  );
  const normalizeSkus = useCallback((skus = []) => {
    const firstMedia = (val) => (Array.isArray(val) && val.length ? val[0] : null);
    const addMonths = (date, months) => {
      const next = new Date(date.getTime());
      const day = next.getDate();
      next.setMonth(next.getMonth() + months);
      if (next.getDate() !== day) {
        next.setDate(0);
      }
      return next;
    };
    const formatDateInput = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return (Array.isArray(skus) ? skus : []).map((sku) => {
      const locator = firstMedia(sku?.main_product_image_locator)?.media_location || null;
      const image =
        sku?.image ||
        sku?.thumbnail ||
        sku?.img ||
        sku?.main_image ||
        sku?.mainImage?.link ||
        sku?.mainImage ||
        locator;
      const existingExpiry =
        sku?.expiryDate ||
        sku?.expiry ||
        sku?.expiration ||
        sku?.expirationDate ||
        null;
      const needsExpiryDefault = Boolean(sku?.expiryRequired) && !existingExpiry;
      const expiryDefault = needsExpiryDefault ? formatDateInput(addMonths(new Date(), 18)) : null;
      const expiryDate = existingExpiry && !sku?.expiryDate ? existingExpiry : null;
      const unitsPerBoxRaw = sku?.unitsPerBox ?? sku?.units_per_box ?? null;
      const unitsPerBoxNum = Number(unitsPerBoxRaw);
      const unitsPerBox = Number.isFinite(unitsPerBoxNum) && unitsPerBoxNum > 0 ? Math.floor(unitsPerBoxNum) : null;
      const boxesCountRaw = sku?.boxesCount ?? sku?.boxes_count ?? null;
      const boxesCountNum = Number(boxesCountRaw);
      const boxesCount = Number.isFinite(boxesCountNum) && boxesCountNum > 0 ? Math.floor(boxesCountNum) : null;
      const nextSku = {
        ...sku,
        ...(image && !sku.image ? { image } : null),
        ...(needsExpiryDefault ? { expiryDate: expiryDefault, expiry: expiryDefault } : null),
        ...(expiryDate ? { expiryDate, expiry: sku?.expiry || expiryDate } : null),
        packing: sku?.packing || sku?.packing_template_type || 'individual',
        packingTemplateId: sku?.packingTemplateId ?? sku?.packing_template_id ?? null,
        packingTemplateName: sku?.packingTemplateName ?? sku?.packing_template_name ?? null,
        unitsPerBox,
        boxesCount,
        boxLengthCm: sku?.boxLengthCm ?? sku?.box_length_cm ?? null,
        boxWidthCm: sku?.boxWidthCm ?? sku?.box_width_cm ?? null,
        boxHeightCm: sku?.boxHeightCm ?? sku?.box_height_cm ?? null,
        boxWeightKg: sku?.boxWeightKg ?? sku?.box_weight_kg ?? null
      };
      return nextSku;
    });
  }, []);
  const mergeSkusWithLocal = useCallback(
    (incomingSkus = [], localSkus = []) => {
      const normalizedIncoming = normalizeSkus(incomingSkus);
      const normalizedLocal = normalizeSkus(localSkus);
      const localById = new Map();
      const localBySku = new Map();
      normalizedLocal.forEach((sku) => {
        const idKey = String(sku?.id || '').trim();
        const skuKey = String(sku?.sku || sku?.msku || '').trim().toUpperCase();
        if (idKey) localById.set(idKey, sku);
        if (skuKey) localBySku.set(skuKey, sku);
      });

      return normalizedIncoming.map((serverSku) => {
        const idKey = String(serverSku?.id || '').trim();
        const skuKey = String(serverSku?.sku || serverSku?.msku || '').trim().toUpperCase();
        const localSku = (idKey && localById.get(idKey)) || (skuKey && localBySku.get(skuKey)) || null;
        if (!localSku) return serverSku;

        // Păstrează cantitatea introdusă de user dacă există; nu o suprascrie cu refresh-ul serverului
        const serverUnits =
          Number(serverSku?.units ?? serverSku?.units_sent ?? serverSku?.units_requested ?? 0) || 0;
        const localUnits =
          Number(localSku?.units ?? localSku?.units_sent ?? localSku?.units_requested ?? 0) || 0;
        const mergedUnits = localUnits > 0 ? localUnits : serverUnits;

        const serverPacking = String(serverSku?.packing || '').trim().toLowerCase();
        const localPacking = String(localSku?.packing || '').trim().toLowerCase();
        const serverHasTemplate = Boolean(serverSku?.packingTemplateId || serverSku?.packingTemplateName);
        const localHasTemplate = Boolean(localSku?.packingTemplateId || localSku?.packingTemplateName);
        const shouldKeepLocalTemplate =
          localHasTemplate && !serverHasTemplate && (serverPacking === '' || serverPacking === 'individual');

        const keepPositiveNumber = (serverVal, localVal) => {
          const serverNum = Number(serverVal);
          if (Number.isFinite(serverNum) && serverNum > 0) return serverNum;
          const localNum = Number(localVal);
          return Number.isFinite(localNum) && localNum > 0 ? localNum : null;
        };

        const merged = {
          ...serverSku,
          units: mergedUnits,
          unitsPerBox: keepPositiveNumber(serverSku?.unitsPerBox, localSku?.unitsPerBox),
          boxesCount: keepPositiveNumber(serverSku?.boxesCount, localSku?.boxesCount),
          boxLengthCm: keepPositiveNumber(serverSku?.boxLengthCm, localSku?.boxLengthCm),
          boxWidthCm: keepPositiveNumber(serverSku?.boxWidthCm, localSku?.boxWidthCm),
          boxHeightCm: keepPositiveNumber(serverSku?.boxHeightCm, localSku?.boxHeightCm),
          boxWeightKg: keepPositiveNumber(serverSku?.boxWeightKg, localSku?.boxWeightKg)
        };

        if (shouldKeepLocalTemplate) {
          return {
            ...merged,
            packing: localSku?.packing || serverSku?.packing || 'individual',
            packingTemplateId: localSku?.packingTemplateId || null,
            packingTemplateName: localSku?.packingTemplateName || null
          };
        }

        if ((!serverPacking || serverPacking === 'individual') && localPacking && localPacking !== 'individual') {
          return {
            ...merged,
            packing: localSku?.packing || serverSku?.packing || 'individual'
          };
        }

        return merged;
      });
    },
    [normalizeSkus]
  );
  const snapshotServerUnits = useCallback((skus = []) => {
    const map = new Map();
    (Array.isArray(skus) ? skus : []).forEach((sku) => {
      if (!sku?.id) return;
      const qty = Number(sku.units ?? sku.units_sent ?? sku.units_requested ?? 0) || 0;
      map.set(String(sku.id), qty);
    });
    serverUnitsRef.current = map;
  }, []);
  useEffect(() => {
    packingOptionIdRef.current = packingOptionId;
  }, [packingOptionId]);
  useEffect(() => {
    maybeSelectStandardPackingOption(packingOptions);
  }, [packingOptions, maybeSelectStandardPackingOption]);
  useEffect(() => {
    placementOptionIdRef.current = placementOptionId;
  }, [placementOptionId]);
  useEffect(() => {
    return () => {
      if (shippingRetryTimerRef.current) {
        clearTimeout(shippingRetryTimerRef.current);
        shippingRetryTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (currentStep !== '2') {
      shippingRetryRef.current = 0;
      if (shippingRetryTimerRef.current) {
        clearTimeout(shippingRetryTimerRef.current);
        shippingRetryTimerRef.current = null;
      }
    }
  }, [currentStep]);
  useEffect(() => {
    if (currentStep !== '2') return;
    if (!forcePartneredOnly) return;
    if (shipmentMode?.carrier?.partnered !== false) return;
    setShipmentMode((prev) => ({ ...prev, carrier: null }));
  }, [currentStep, forcePartneredOnly, shipmentMode?.carrier?.partnered]);
  useEffect(() => {
    const required = Boolean(
      shippingSummary?.partneredRequired ||
      shippingSummary?.forcePartneredOnly ||
      shippingSummary?.partneredOnly ||
      shippingSummary?.mustUsePartnered
    );
    setForcePartneredOnly(required);
  }, [
    shippingSummary?.partneredRequired,
    shippingSummary?.forcePartneredOnly,
    shippingSummary?.partneredOnly,
    shippingSummary?.mustUsePartnered
  ]);
  const resolveRequestId = useCallback(() => {
    return (
      plan?.prepRequestId ||
      plan?.requestId ||
      plan?.id ||
      initialPlan?.prepRequestId ||
      initialPlan?.requestId ||
      initialPlan?.id ||
      plan?.requestId ||
      plan?.request_id ||
      initialPlan?.request_id ||
      null
    );
  }, [
    plan?.prepRequestId,
    plan?.requestId,
    plan?.id,
    plan?.request_id,
    initialPlan?.prepRequestId,
    initialPlan?.requestId,
    initialPlan?.id,
    initialPlan?.request_id
  ]);
  const sanitizeInboundPlanId = (id) => {
    if (!id) return null;
    const val = String(id);
    // Amazon poate returna un placeholder "LOCK-..." sau un id mai lung decât limita de 38.
    if (val.startsWith('LOCK-')) return null;
    if (val.length > 38) return null;
    return val;
  };
  const resolveInboundPlanId = useCallback(() => {
    // Evită revenirea la inboundPlanId din props atunci când am resetat planul curent (ex: după editarea cantităților).
    const currentPlan = planRef.current || plan;
    const hasExplicitInbound =
      currentPlan &&
      ('inboundPlanId' in currentPlan ||
        'inbound_plan_id' in currentPlan ||
        'planId' in currentPlan ||
        'plan_id' in currentPlan);

    if (hasExplicitInbound) {
      return sanitizeInboundPlanId(
        currentPlan?.inboundPlanId ||
          currentPlan?.inbound_plan_id ||
          currentPlan?.planId ||
          currentPlan?.plan_id ||
          null
      );
    }

    return sanitizeInboundPlanId(
      initialPlan?.inboundPlanId ||
        initialPlan?.inbound_plan_id ||
        initialPlan?.planId ||
        initialPlan?.plan_id ||
        null
    );
  }, [
    initialPlan?.inboundPlanId,
    initialPlan?.inbound_plan_id,
    initialPlan?.planId,
    initialPlan?.plan_id,
    plan
  ]);
  const runFetchPlan = useCallback(async () => {
    if (!fetchPlan) return null;
    if (fetchPlanInFlightRef.current) return { __skip: true };
    fetchPlanInFlightRef.current = true;
    try {
      return await fetchPlan();
    } finally {
      fetchPlanInFlightRef.current = false;
    }
  }, [fetchPlan]);
  const inboundPlanIdMemo = useMemo(() => resolveInboundPlanId(), [resolveInboundPlanId]);
  const initialRequestKey = useMemo(
    () =>
      initialPlan?.prepRequestId ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      initialPlan?.id ||
      null,
    [initialPlan?.id, initialPlan?.prepRequestId, initialPlan?.requestId, initialPlan?.request_id]
  );
  useEffect(() => {
    if (inboundPlanIdMemo) {
      setInboundPlanMissing(false);
    }
  }, [inboundPlanIdMemo]);

  // Dacă avem deja packGroups dar încă nu am primit inboundPlanId, permit continuarea fără să blocăm UI.
  useEffect(() => {
    const inboundId = resolveInboundPlanId();
    if (!inboundId && packGroupsLoaded && Array.isArray(packGroups) && packGroups.length) {
      setAllowNoInboundPlan(true);
      setInboundPlanMissing(false);
      setPlanError('');
    }
  }, [packGroupsLoaded, packGroups, resolveInboundPlanId]);

  const buildLocalSinglePackGroup = useCallback(
    (skus = []) => ({
      id: 'pack-1',
      packingGroupId: 'pack-1',
      title: 'Pack group 1',
      packMode: 'single',
      boxes: 1,
      boxDimensions: null,
      boxWeight: null,
      packingConfirmed: false,
      items: (Array.isArray(skus) ? skus : []).map((sku) => ({
        sku: sku.sku || sku.msku || sku.SellerSKU || sku.asin || sku.id || '',
        quantity: Number(sku.units || 0) || 0,
        image: sku.image || sku.thumbnail || sku.main_image || sku.img || null,
        title: sku.title || sku.product_name || sku.name || null,
        apiLabelOwner: sku.labelOwner || sku.label_owner || null,
        labelOwner: sku.labelOwner || sku.label_owner || null,
        prepOwner: sku.prepOwner || sku.prep_owner || null,
        expiration: sku.expiration || sku.expiry || sku.expiryDate || null
      }))
    }),
    []
  );

  const buildFallbackPackGroups = useCallback(
    (skus = []) => {
      const groups = step1PlanGroupsData?.groups || {};
      const entries = Object.entries(groups);
      if (!entries.length) {
        return [buildLocalSinglePackGroup(skus)];
      }
      return entries.map(([key, value], idx) => {
        const boxes = Array.isArray(value?.boxes) ? value.boxes : [];
        const boxCount = boxes.length || 1;
        const perBoxDetails = boxes.map((b) => ({
          length: b?.length_cm ?? b?.length ?? '',
          width: b?.width_cm ?? b?.width ?? '',
          height: b?.height_cm ?? b?.height ?? '',
          weight: b?.weight_kg ?? b?.weight ?? ''
        }));
        const perBoxItems = Array.isArray(value?.boxItems) ? value.boxItems : [];
        const totals = new Map();
        perBoxItems.forEach((box) => {
          Object.entries(box || {}).forEach(([skuKey, qty]) => {
            const keyUp = String(skuKey || '').trim().toUpperCase();
            if (!keyUp) return;
            const add = Number(qty || 0) || 0;
            totals.set(keyUp, (totals.get(keyUp) || 0) + add);
          });
        });
        const skuMap = new Map();
        (Array.isArray(skus) ? skus : []).forEach((sku) => {
          const k = String(sku.sku || sku.msku || sku.SellerSKU || sku.asin || sku.id || '').trim().toUpperCase();
          if (k) skuMap.set(k, sku);
        });
        const items =
          totals.size > 0
            ? Array.from(totals.entries())
                .filter(([, qty]) => qty > 0)
                .map(([k, qty]) => {
                  const match = skuMap.get(k);
                  return {
                    sku: match?.sku || match?.msku || match?.SellerSKU || match?.asin || match?.id || k,
                    quantity: qty,
                    image: match?.image || match?.thumbnail || match?.main_image || match?.img || null,
                    title: match?.title || match?.product_name || match?.name || null,
                    apiLabelOwner: match?.labelOwner || match?.label_owner || null,
                    labelOwner: match?.labelOwner || match?.label_owner || null,
                    prepOwner: match?.prepOwner || match?.prep_owner || null,
                    expiration: match?.expiration || match?.expiry || match?.expiryDate || null
                  };
                })
            : (Array.isArray(skus) ? skus : []).map((sku) => ({
                sku: sku.sku || sku.msku || sku.SellerSKU || sku.asin || sku.id || '',
                quantity: Number(sku.units || 0) || 0,
                image: sku.image || sku.thumbnail || sku.main_image || sku.img || null,
                title: sku.title || sku.product_name || sku.name || null,
                apiLabelOwner: sku.labelOwner || sku.label_owner || null,
                labelOwner: sku.labelOwner || sku.label_owner || null,
                prepOwner: sku.prepOwner || sku.prep_owner || null,
                expiration: sku.expiration || sku.expiry || sku.expiryDate || null
              }));
        const firstBox = boxes[0] || {};
        const singleDims =
          boxCount === 1
            ? {
                length: firstBox?.length_cm ?? firstBox?.length ?? '',
                width: firstBox?.width_cm ?? firstBox?.width ?? '',
                height: firstBox?.height_cm ?? firstBox?.height ?? ''
              }
            : null;
        const singleWeight = boxCount === 1 ? firstBox?.weight_kg ?? firstBox?.weight ?? '' : null;
        const isMultiple = boxCount > 1;
        return {
          id: key || `pack-${idx + 1}`,
          packingGroupId: key || `pack-${idx + 1}`,
          title: value?.groupLabel || value?.label || `Pack group ${idx + 1}`,
          packMode: isMultiple ? 'multiple' : 'single',
          boxes: boxCount,
          boxDimensions: isMultiple ? null : singleDims,
          boxWeight: isMultiple ? null : singleWeight,
          perBoxDetails: isMultiple ? perBoxDetails : null,
          perBoxItems: isMultiple ? perBoxItems : null,
          contentInformationSource: isMultiple ? 'BOX_CONTENT_PROVIDED' : null,
          packingConfirmed: false,
          items
        };
      });
    },
    [buildLocalSinglePackGroup, step1PlanGroupsData?.groups]
  );

  // Dacă nu avem inboundPlanId și Amazon nu a trimis packGroups, creează un grup unic local (Pack group 1)
  // pentru a permite UI să continue packing fără prompt suplimentar.
  useEffect(() => {
    const inboundId = resolveInboundPlanId();
    const hasGroups = Array.isArray(packGroups) && packGroups.length > 0;
    const hasSkus = Array.isArray(plan?.skus) && plan.skus.some((s) => Number(s?.units || 0) > 0);
    if (inboundId || hasGroups || !hasSkus) return;
    setAllowNoInboundPlan(true);
    const fallbackGroups = buildFallbackPackGroups(plan.skus);
    setPackGroups(fallbackGroups);
    setPackGroupsLoaded(true);
  }, [packGroups, plan?.skus, resolveInboundPlanId, buildFallbackPackGroups]);

  // Dacă avem inboundPlanId dar Amazon nu trimite packGroups, folosește fallback cu un singur grup local.
  useEffect(() => {
    const inboundId = resolveInboundPlanId();
    const hasGroups = Array.isArray(packGroups) && packGroups.length > 0;
    const hasSkus = Array.isArray(plan?.skus) && plan.skus.some((s) => Number(s?.units || 0) > 0);
    if (!inboundId || hasGroups || !hasSkus) return;
    const fallbackGroups = buildFallbackPackGroups(plan.skus);
    setPackGroups(fallbackGroups);
    setPackGroupsLoaded(true);
  }, [plan?.skus, packGroups, resolveInboundPlanId, buildFallbackPackGroups]);

  // Persistăm ultimul pas vizitat ca să nu se piardă la refresh (cheie per shipment).
  const storageKeyBase = useMemo(() => {
    const requestScopedKey =
      plan?.requestId ||
      plan?.request_id ||
      initialPlan?.requestId ||
      initialPlan?.request_id ||
      plan?.id ||
      initialPlan?.id ||
      null;
    if (requestScopedKey) return requestScopedKey;
    return (
      plan?.inboundPlanId ||
      plan?.inbound_plan_id ||
      initialPlan?.inboundPlanId ||
      initialPlan?.inbound_plan_id ||
      null
    );
  }, [
    plan?.requestId,
    plan?.request_id,
    plan?.id,
    initialPlan?.requestId,
    initialPlan?.request_id,
    initialPlan?.id,
    plan?.inboundPlanId,
    plan?.inbound_plan_id,
    initialPlan?.inboundPlanId,
    initialPlan?.inbound_plan_id
  ]);
  const stepStorageKey = useMemo(() => {
    if (!storageKeyBase) return null;
    return `fba-wizard-step-${storageKeyBase}`;
  }, [storageKeyBase]);
  const stateStorageKey = useMemo(() => {
    if (!storageKeyBase) return null;
    return `fba-wizard-state-${storageKeyBase}`;
  }, [storageKeyBase]);
  const [restoredState, setRestoredState] = useState(false);
  const dbStateLoadedRef = useRef(false);
  const dbPersistTimerRef = useRef(null);
  const lastDbSnapshotRef = useRef('');
  const prevStorageKeyRef = useRef(storageKeyBase);
  const requestKeyRef = useRef(initialRequestKey);

  useEffect(() => {
    if (prevStorageKeyRef.current === storageKeyBase) return;
    prevStorageKeyRef.current = storageKeyBase;

    const normalizedInitialGroups = normalizePackGroups(initialPacking || []);
    const hasInbound =
      Boolean(planRef.current?.inboundPlanId || planRef.current?.inbound_plan_id || plan?.inboundPlanId || plan?.inbound_plan_id);
    const hasRealGroups = hasRealPackGroups(packGroupsRef.current);

    const currentRequestKey = initialRequestKey;
    const isNewRequest = requestKeyRef.current !== currentRequestKey;
    requestKeyRef.current = currentRequestKey;

    // Dacă avem deja un inbound plan real pentru același request, nu resetăm planul/packing-ul.
    if (!isNewRequest && hasInbound) {
      if (hasRealGroups) {
        setPackGroupsLoaded(true);
      } else {
        setPackGroupsLoaded(hasRealPackGroups(normalizedInitialGroups));
      }
      return;
    }

    if (historyMode) {
      setCurrentStep(resolveInitialStep());
      setCompletedSteps(Array.isArray(initialCompletedSteps) ? initialCompletedSteps : []);
    } else {
      setCurrentStep('1');
      setCompletedSteps([]);
    }
    setPlan(initialPlan);
    snapshotServerUnits(initialPlan?.skus || []);
    setPackGroups(normalizedInitialGroups);
    setPackGroupsLoaded(hasRealPackGroups(normalizedInitialGroups));
    setShipmentMode(initialShipmentMode);
    setPalletDetails(
      initialShipmentMode?.palletDetails || {
        quantity: 1,
        length: '',
        width: '',
        height: '',
        weight: '',
        stackability: 'STACKABLE',
        freightClass: 'FC_XX',
        declaredValue: '',
        declaredValueCurrency: 'EUR'
      }
    );
    setShipments(initialShipmentList);
    setLabelFormat(initialLabelFormat || 'thermal');
    setTracking(initialTrackingList);
    setPackingOptionId(initialPlan?.packingOptionId || null);
    setPlacementOptionId(initialPlan?.placementOptionId || null);
    setPlanError('');
    setPackingSubmitError('');
    setPackingReadyError('');
    setShippingError('');
    setShippingOptions(historyMode ? (Array.isArray(initialShippingOptions) ? initialShippingOptions : []) : []);
    setShippingSummary(historyMode ? initialShippingSummary : null);
    setShippingConfirmed(historyMode ? Boolean(initialShippingConfirmed) : false);
    setSelectedTransportationOptionId(historyMode ? initialSelectedTransportationOptionId : null);
    setStep2Loaded(
      Boolean(historyMode && (initialShippingOptions?.length || initialShippingSummary || initialShippingConfirmed))
    );
    setRestoredState(false);
  }, [
    storageKeyBase,
    initialPlan,
    initialPacking,
    initialShipmentMode,
    initialShipmentList,
    initialTrackingList,
    initialTrackingIds,
    initialCompletedSteps,
    initialShippingOptions,
    initialShippingSummary,
    initialShippingConfirmed,
    initialSelectedTransportationOptionId,
    initialLabelFormat,
    initialCurrentStep,
    historyMode,
    normalizePackGroups,
    hasRealPackGroups,
    initialRequestKey,
    plan?.inboundPlanId,
    plan?.inbound_plan_id,
    snapshotServerUnits
  ]);

  useEffect(() => {
    if (!allowPersistence) return;
    if (typeof window === 'undefined' || !stepStorageKey) return;
    const saved = window.localStorage.getItem(stepStorageKey);
    if (saved && stepsOrder.includes(saved)) {
      setCurrentStep(saved);
    }
  }, [allowPersistence, stepStorageKey, stepsOrder]);

  useEffect(() => {
    setCompletedSteps((prev) => prev.filter((step) => stepsOrder.includes(step)));
    if (!stepsOrder.includes(currentStep)) {
      setCurrentStep(resolveInitialStep());
    }
  }, [currentStep, resolveInitialStep, stepsOrder]);

  useEffect(() => {
    if (!allowPersistence) return;
    if (typeof window === 'undefined' || !stepStorageKey) return;
    window.localStorage.setItem(stepStorageKey, String(currentStep));
  }, [allowPersistence, currentStep, stepStorageKey]);

  // Rehidratează starea wizard-ului din DB (amazon_snapshot.fba_wizard) + localStorage fallback.
  useEffect(() => {
    if (!allowPersistence) {
      setRestoredState(true);
      return;
    }
    if (typeof window === 'undefined' || restoredState || !stateStorageKey) return;
    let cancelled = false;

    const parseSnapshot = (raw) => {
      if (!raw) return null;
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        return null;
      }
    };

    const ts = (val) => {
      const num = Date.parse(String(val || ''));
      return Number.isFinite(num) ? num : 0;
    };

    const applySnapshot = (data) => {
      if (!data || typeof data !== 'object') return;
      if (data?.plan) setPlan((prev) => ({ ...prev, ...data.plan }));
      const normalized = Array.isArray(data?.packGroups) ? normalizePackGroups(data.packGroups) : [];
      if (normalized.length) setPackGroups((prev) => mergePackGroups(prev, normalized));
      const hasRealGroups = hasRealPackGroups(normalized);
      setPackGroupsLoaded(hasRealGroups);
      if (data?.shipmentMode) setShipmentMode((prev) => ({ ...prev, ...normalizeShipmentModeFromData(data.shipmentMode) }));
      if (data?.palletDetails) setPalletDetails((prev) => ({ ...prev, ...data.palletDetails }));
      if (Array.isArray(data?.shipments)) setShipments(data.shipments);
      if (data?.labelFormat) setLabelFormat(data.labelFormat);
      if (Array.isArray(data?.tracking)) setTracking(data.tracking);
      if (data?.packingOptionId) setPackingOptionId(data.packingOptionId);
      if (Array.isArray(data?.packingOptions)) setPackingOptions(sanitizePackingOptions(data.packingOptions));
      if (data?.placementOptionId) setPlacementOptionId(data.placementOptionId);
      if (Array.isArray(data?.completedSteps)) setCompletedSteps(data.completedSteps);
      if (data?.currentStep && stepsOrder.includes(data.currentStep)) setCurrentStep(data.currentStep);
      if (data?.step1BoxPlanByMarket) setStep1BoxPlanByMarket(data.step1BoxPlanByMarket);
    };

    (async () => {
      try {
        const localData = parseSnapshot(window.localStorage.getItem(stateStorageKey));
        const initialDbData = parseSnapshot(initialPlan?.amazon_snapshot?.fba_wizard || null);
        let historyData = null;
        let dbData = initialDbData;
        const requestId = resolveRequestId();
        if (requestId && !dbStateLoadedRef.current) {
          const { data: historyRows, error: historyError } = await supabase
            .from('prep_request_wizard_history')
            .select('payload, created_at')
            .eq('request_ref_id', requestId)
            .order('created_at', { ascending: false })
            .limit(1);
          if (!historyError && Array.isArray(historyRows) && historyRows.length > 0) {
            historyData = parseSnapshot(historyRows[0]?.payload || null);
          }
          const { data, error } = await supabase
            .from('prep_requests')
            .select('amazon_snapshot')
            .eq('id', requestId)
            .maybeSingle();
          if (!error) {
            dbData = parseSnapshot(data?.amazon_snapshot?.fba_wizard || null) || dbData;
          }
          dbStateLoadedRef.current = true;
        }

        if (cancelled) return;
        const dbCandidate = ts(historyData?.updatedAt) >= ts(dbData?.updatedAt) ? historyData || dbData : dbData || historyData;
        const chosen = ts(dbCandidate?.updatedAt) >= ts(localData?.updatedAt)
          ? dbCandidate || localData
          : localData || dbCandidate;
        if (chosen) applySnapshot(chosen);
      } catch {
        // fallback: ignore restore failures
      } finally {
        if (!cancelled) setRestoredState(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    allowPersistence,
    stateStorageKey,
    stepsOrder,
    restoredState,
    normalizePackGroups,
    mergePackGroups,
    hasRealPackGroups,
    initialPlan?.amazon_snapshot,
    resolveRequestId
  ]);

  // Persistă starea curentă ca să poți relua workflow-ul după refresh.
  useEffect(() => {
    if (!allowPersistence) return;
    if (typeof window === 'undefined') return;
    if (!stateStorageKey) return;
    const snapshot = {
      plan,
      packGroups,
      step1BoxPlanByMarket,
      shipmentMode,
      palletDetails,
      shipments,
      labelFormat,
      tracking,
      packingOptionId,
      packingOptions,
      placementOptionId,
      completedSteps,
      currentStep,
      updatedAt: new Date().toISOString()
    };
    window.localStorage.setItem(stateStorageKey, JSON.stringify(snapshot));
  }, [
    allowPersistence,
    plan,
    packGroups,
    step1BoxPlanByMarket,
    shipmentMode,
    palletDetails,
    shipments,
    labelFormat,
    tracking,
    packingOptionId,
    packingOptions,
    placementOptionId,
    completedSteps,
    currentStep,
    stateStorageKey
  ]);

  // Persistă snapshot-ul wizard-ului în DB pentru resume cross-device/tab.
  useEffect(() => {
    if (!allowPersistence) return;
    const requestId = resolveRequestId();
    if (!requestId) return;
    const snapshot = {
      plan,
      packGroups,
      step1BoxPlanByMarket,
      shipmentMode,
      palletDetails,
      shipments,
      labelFormat,
      tracking,
      packingOptionId,
      packingOptions,
      placementOptionId,
      completedSteps,
      currentStep,
      updatedAt: new Date().toISOString()
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastDbSnapshotRef.current) return;
    if (dbPersistTimerRef.current) clearTimeout(dbPersistTimerRef.current);
    dbPersistTimerRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('prep_requests')
          .select('amazon_snapshot')
          .eq('id', requestId)
          .maybeSingle();
        if (error) throw error;
        const currentSnapshot =
          data?.amazon_snapshot && typeof data.amazon_snapshot === 'object' ? data.amazon_snapshot : {};
        const nextSnapshot = {
          ...currentSnapshot,
          fba_wizard: snapshot
        };
        const { error: updateError } = await supabase
          .from('prep_requests')
          .update({ amazon_snapshot: nextSnapshot })
          .eq('id', requestId);
        if (updateError) throw updateError;
        const { error: historyInsertError } = await supabase
          .from('prep_request_wizard_history')
          .insert({
            request_id: requestId,
            request_ref_id: requestId,
            step_key: String(snapshot?.currentStep || currentStep || '1'),
            payload: snapshot,
            source: 'client'
          });
        if (historyInsertError) {
          console.warn('Persist wizard history snapshot failed', historyInsertError);
        }
        lastDbSnapshotRef.current = serialized;
      } catch (e) {
        console.warn('Persist wizard snapshot failed', e);
      }
    }, 1200);
    return () => {
      if (dbPersistTimerRef.current) clearTimeout(dbPersistTimerRef.current);
    };
  }, [
    allowPersistence,
    resolveRequestId,
    plan,
    packGroups,
    step1BoxPlanByMarket,
    shipmentMode,
    palletDetails,
    shipments,
    labelFormat,
    tracking,
    packingOptionId,
    packingOptions,
    placementOptionId,
    completedSteps,
    currentStep
  ]);

  useEffect(() => {
    if (!autoLoadPlan && !fetchPlan) return;
    if (planLoaded) return;
    let cancelled = false;
    loadPlan();
    return () => {
      cancelled = true;
    };

    async function loadPlan() {
      setLoadingPlan(true);
      setPlanError('');
      setPlanNotice('');
      setStep1SaveError('');
      const hasCachedGroups = hasRealPackGroups(packGroupsRef.current);
      const workflowAlreadyStarted =
        Boolean(packingOptionIdRef.current || planRef.current?.packingOptionId || initialPlan?.packingOptionId) ||
        Boolean(placementOptionIdRef.current || planRef.current?.placementOptionId || initialPlan?.placementOptionId);
      if (!hasCachedGroups && !workflowAlreadyStarted) {
        setPackGroups([]); // doar dacă e plan nou / încă neconfirmat
      }
      let skip = false;
      try {
        const response = fetchPlan ? await runFetchPlan() : null;
        if (cancelled) return;
        if (response?.__skip) {
          skip = true;
          return;
        }
        if (!response) {
          setPlanError((prev) => prev || 'Amazon plan did not respond. Try refreshing.');
          return;
        }
        const {
          shipFrom: pFrom,
          marketplace: pMarket,
          skus: pSkus,
          packGroups: pGroups,
          shipments: pShipments,
          warning: pWarning,
          shipmentMode: pShipmentMode,
          skuStatuses: pSkuStatuses,
          operationProblems: pOperationProblems,
          blocking: pBlocking,
          sourceAddress: pSourceAddress,
          source_address: pSourceAddressAlt
        } = response;
        const sourceAddress = pSourceAddress || pSourceAddressAlt || null;
        if (pFrom && pMarket && Array.isArray(pSkus)) {
          const normSkus = mergeSkusWithLocal(pSkus, planRef.current?.skus || []);
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom, sourceAddress),
            marketplace: pMarket,
            skus: normSkus,
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          snapshotServerUnits(normSkus);
        } else {
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom || prev?.shipFrom, sourceAddress),
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          if (Array.isArray(response?.skus)) snapshotServerUnits(mergeSkusWithLocal(response.skus, planRef.current?.skus || []));
        }
        if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
        if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
        if (Array.isArray(pGroups)) {
          const normalized = normalizePackGroups(pGroups);
          setPackGroups((prev) => mergePackGroups(prev, normalized));
          setPackGroupsLoaded(hasRealPackGroups(normalized));
        }
        if (Array.isArray(pShipments) && pShipments.length) setShipments(pShipments);
        if (pShipmentMode) setShipmentMode((prev) => ({ ...prev, ...normalizeShipmentModeFromData(pShipmentMode) }));
        if (response?.palletDetails) setPalletDetails((prev) => ({ ...prev, ...response.palletDetails }));
        if (Array.isArray(pSkuStatuses)) setSkuStatuses(pSkuStatuses);
        setOperationProblems(Array.isArray(pOperationProblems) ? pOperationProblems : []);
        setBlocking(Boolean(pBlocking));
        if (typeof pWarning === 'string' && pWarning.trim()) {
          setPlanNotice((prevNotice) => prevNotice || toFriendlyPlanNotice(pWarning));
        }
      } catch (e) {
        if (!cancelled) setPlanError(e?.message || 'Failed to load Amazon plan.');
      } finally {
        if (!cancelled && !skip) {
          setLoadingPlan(false);
          setPlanLoaded(true);
        }
      }
    }
  }, [autoLoadPlan, fetchPlan, mergeSkusWithLocal, normalizePackGroups, planLoaded, runFetchPlan, snapshotServerUnits, toFriendlyPlanNotice]);

  useEffect(() => {
    if (!planLoaded) return;
    if (!fetchPlan) return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (inboundPlanId && requestId) {
      planMissingRetryRef.current = 0;
      setInboundPlanMissing(false);
      return;
    }
    if (planMissingRetryRef.current >= 2) {
      setInboundPlanMissing(true);
      return;
    }
    planMissingRetryRef.current += 1;
    let cancelled = false;
    (async () => {
      let skip = false;
      setLoadingPlan(true);
      try {
        const response = await runFetchPlan();
        if (response?.__skip) {
          skip = true;
          return;
        }
        if (cancelled || !response) return;
        const {
          shipFrom: pFrom,
          marketplace: pMarket,
          skus: pSkus,
          sourceAddress: pSourceAddress,
          source_address: pSourceAddressAlt
        } = response;
        const sourceAddress = pSourceAddress || pSourceAddressAlt || null;
        if (pFrom && pMarket && Array.isArray(pSkus)) {
          const normSkus = mergeSkusWithLocal(pSkus, planRef.current?.skus || []);
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom, sourceAddress),
            marketplace: pMarket,
            skus: normSkus,
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          snapshotServerUnits(normSkus);
        } else {
          setPlan((prev) => ({
            ...prev,
            ...response,
            shipFrom: mergeShipFromWithSource(pFrom || prev?.shipFrom, sourceAddress),
            sourceAddress: sourceAddress || prev?.sourceAddress || null
          }));
          if (Array.isArray(response?.skus)) snapshotServerUnits(mergeSkusWithLocal(response.skus, planRef.current?.skus || []));
        }
      } catch (e) {
        if (!cancelled) setPlanError((prev) => prev || e?.message || 'Failed to reload Amazon plan.');
      } finally {
        if (!cancelled && !skip) setLoadingPlan(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPlan, mergeSkusWithLocal, planLoaded, resolveInboundPlanId, resolveRequestId, runFetchPlan, snapshotServerUnits]);
  useEffect(() => {
    const planBoxPlan = plan?.step1BoxPlan || plan?.step1_box_plan || null;
    if (!planBoxPlan || typeof planBoxPlan !== 'object') return;
    setStep1BoxPlanByMarket((prev) => {
      const incomingHasData = hasStep1BoxPlanData(planBoxPlan);
      const prevHasData = hasStep1BoxPlanData(prev);
      if (!incomingHasData && prevHasData) return prev;
      if (!incomingHasData) return prev && Object.keys(prev).length ? prev : planBoxPlan;
      return {
        ...(prev || {}),
        ...planBoxPlan
      };
    });
  }, [hasStep1BoxPlanData, plan?.step1BoxPlan, plan?.step1_box_plan]);

  useEffect(() => {
    const requestId = resolveRequestId();
    if (!requestId) return;
    const nextPlan = step1BoxPlanByMarket && typeof step1BoxPlanByMarket === 'object' ? step1BoxPlanByMarket : {};
    const serialized = JSON.stringify(nextPlan);
    if (serialized === lastStep1BoxPlanPersistedRef.current) return;
    if (step1BoxPlanPersistTimerRef.current) clearTimeout(step1BoxPlanPersistTimerRef.current);
    step1BoxPlanPersistTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('prep_requests')
          .update({ step1_box_plan: nextPlan })
          .eq('id', requestId);
        if (error) throw error;

        const market = String(currentMarket || 'FR').trim().toUpperCase();
        const marketPlan =
          nextPlan?.[market] && typeof nextPlan[market] === 'object' ? nextPlan[market] : null;
        if (marketPlan) {
          const heavyMeta = computeHeavyParcelFromBoxPlan(marketPlan);
          if (heavyMeta.labels > 0) {
            const { error: heavyErr } = await supabase.from('prep_request_heavy_parcel').upsert(
              {
                request_id: requestId,
                market,
                heavy_boxes: heavyMeta.heavyBoxes,
                labels_count: heavyMeta.labels,
                unit_price: HEAVY_PARCEL_LABEL_UNIT_PRICE,
                total_price: heavyMeta.total
              },
              { onConflict: 'request_id,market' }
            );
            if (heavyErr) throw heavyErr;
          } else {
            const { error: heavyDelErr } = await supabase
              .from('prep_request_heavy_parcel')
              .delete()
              .eq('request_id', requestId)
              .eq('market', market);
            if (heavyDelErr) throw heavyDelErr;
          }
        }

        lastStep1BoxPlanPersistedRef.current = serialized;
      } catch (e) {
        console.warn('Persist step1_box_plan failed', e);
      }
    }, 700);
    return () => {
      if (step1BoxPlanPersistTimerRef.current) clearTimeout(step1BoxPlanPersistTimerRef.current);
    };
  }, [resolveRequestId, step1BoxPlanByMarket, currentMarket]);

  // Autosave Step 1 quantities so values survive refresh/re-entry even before pressing Next.
  useEffect(() => {
    const requestId = resolveRequestId();
    if (!requestId) return;
    const rows = (Array.isArray(plan?.skus) ? plan.skus : [])
      .filter((sku) => typeof sku?.id === 'string' && sku.id)
      .map((sku) => ({
        id: String(sku.id),
        qty: Math.max(0, Number(sku?.units || 0) || 0)
      }));
    if (!rows.length) return;

    const changed = rows.filter((row) => {
      const prevQty = Number(serverUnitsRef.current.get(row.id) || 0);
      return prevQty !== row.qty;
    });
    if (!changed.length) return;

    if (step1UnitsPersistTimerRef.current) clearTimeout(step1UnitsPersistTimerRef.current);
    step1UnitsPersistTimerRef.current = setTimeout(async () => {
      try {
        await Promise.all(
          changed.map(async (row) => {
            const { error } = await supabase
              .from('prep_request_items')
              .update({ units_sent: row.qty })
              .eq('id', row.id);
            if (error) throw error;
            serverUnitsRef.current.set(row.id, row.qty);
          })
        );
      } catch (e) {
        console.warn('Autosave units_sent failed', { requestId, error: e?.message || e });
      }
    }, 500);

    return () => {
      if (step1UnitsPersistTimerRef.current) clearTimeout(step1UnitsPersistTimerRef.current);
    };
  }, [plan?.skus, resolveRequestId]);


  useEffect(() => {
    const requestId = resolveRequestId();
    if (!requestId) {
      servicesLoadedRef.current = false;
      setSkuServicesById({});
      setBoxServices([]);
      return;
    }
    if (servicesLoadedRef.current) return;
    let cancelled = false;
    const withLocalId = (entry) => ({
      ...entry,
      _local_id: entry?._local_id || `svc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    });
    (async () => {
      const { data, error } = await supabase
        .from('prep_request_services')
        .select('prep_request_item_id, service_id, service_name, unit_price, units, item_type')
        .eq('request_id', requestId);
      if (cancelled) return;
      if (error) {
        console.warn('Failed to load prep services', error);
        return;
      }
      const nextSkuServices = {};
      const nextBoxServices = [];
      (data || []).forEach((row) => {
        const entry = withLocalId({
          service_id: row.service_id || null,
          service_name: row.service_name,
          unit_price: Number(row.unit_price || 0),
          units: Number(row.units || 0)
        });
        if (row.item_type === 'box') {
          nextBoxServices.push(entry);
          return;
        }
        const key = row.prep_request_item_id;
        if (!key) return;
        if (!nextSkuServices[key]) nextSkuServices[key] = [];
        nextSkuServices[key].push(entry);
      });
      setSkuServicesById(nextSkuServices);
      setBoxServices(nextBoxServices);
      servicesLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveRequestId]);

  const buildServiceRows = useCallback((requestId, skuMap, boxList) => {
    const rows = [];
    Object.entries(skuMap || {}).forEach(([skuId, services]) => {
      (services || []).forEach((svc) => {
        const units = Number(svc?.units || 0);
        if (!svc?.service_name || units <= 0) return;
        rows.push({
          request_id: requestId,
          prep_request_item_id: skuId,
          service_id: svc?.service_id || null,
          service_name: svc.service_name,
          unit_price: Number(svc?.unit_price || 0),
          units,
          item_type: 'sku'
        });
      });
    });
    (boxList || []).forEach((svc) => {
      const units = Number(svc?.units || 0);
      if (!svc?.service_name || units <= 0) return;
      rows.push({
        request_id: requestId,
        prep_request_item_id: null,
        service_id: svc?.service_id || null,
        service_name: svc.service_name,
        unit_price: Number(svc?.unit_price || 0),
        units,
        item_type: 'box'
      });
    });

    return rows;
  }, []);

  const persistServicesToDb = useCallback(async () => {
    const requestId = resolveRequestId();
    if (!requestId) return;
    const rows = buildServiceRows(requestId, skuServicesById, boxServices);
    const { error: delErr } = await supabase
      .from('prep_request_services')
      .delete()
      .eq('request_id', requestId);
    if (delErr) throw delErr;
    if (rows.length) {
      const { error: insErr } = await supabase
        .from('prep_request_services')
        .insert(rows);
      if (insErr) throw insErr;
    }
  }, [buildServiceRows, boxServices, resolveRequestId, skuServicesById]);
  useEffect(() => {
    if (serverUnitsRef.current.size) return;
    snapshotServerUnits(initialPlan?.skus || []);
  }, [initialPlan?.skus, snapshotServerUnits]);

  const warning = useMemo(() => {
    if (!step2Loaded || shippingLoading) return null;
    const warnings = [];

    const summaryWarnings = Array.isArray(shippingSummary?.warnings) ? shippingSummary.warnings.filter(Boolean) : [];
    if (summaryWarnings.length && !shippingSummary?.alreadyConfirmed) {
      const seen = new Set();
      summaryWarnings.forEach((raw) => {
        const msg = String(raw || '').trim();
        if (!msg) return;
        const key = msg.toLowerCase().includes('heavy parcel') ? 'heavy-parcel' : msg;
        if (seen.has(key)) return;
        seen.add(key);
        warnings.push(msg);
      });
    }

    if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
      const weight = Number(palletDetails?.weight || 0);
      const height = Number(palletDetails?.height || 0);
      const overWeight = palletLimits.maxWeightKg && weight > palletLimits.maxWeightKg;
      const overHeight = palletLimits.maxHeightCm && height > palletLimits.maxHeightCm;
      if (overWeight || overHeight) {
        const parts = [];
        if (overWeight) parts.push(`Greutate/palet > ${palletLimits.maxWeightKg} kg (limită Amazon).`);
        if (overHeight) parts.push(`Înălțime/palet > ${palletLimits.maxHeightCm} cm (include palet).`);
        warnings.push(parts.join(' '));
      }
    }

    if (currentStep === '1b') {
      const missingPack = (packGroups || []).some((g) => {
        const isMultiple = String(g?.packMode || '').toLowerCase() === 'multiple';
        if (isMultiple) {
          const perBox = Array.isArray(g?.perBoxDetails) ? g.perBoxDetails : [];
          if (!perBox.length) return true;
          return perBox.some((b) => {
            const perDims = getSafeDims(b);
            const perWeight = getPositiveNumber(b?.weight);
            return !(perDims && perWeight);
          });
        }
        const dims = getSafeDims(g.boxDimensions);
        const w = getPositiveNumber(g.boxWeight);
        return !(dims && w);
      });
      if (missingPack) {
        warnings.push('Complete box dimensions and weight for all boxes before Step 2.');
      }
    }

    const returnedModes = shippingSummary?.returnedModes || [];
    const wantsSpd = String(shipmentMode?.method || '').toUpperCase() === 'SPD';
    if (wantsSpd && returnedModes.length && !returnedModes.includes('GROUND_SMALL_PARCEL')) {
      warnings.push('Amazon nu a returnat opțiuni SPD pentru aceste colete. Verifică dimensiunile/greutatea (setPackingInformation). Paletii sunt doar pentru LTL/FTL.');
    }

    return warnings.length ? warnings.join(' | ') : null;
  }, [
    shippingSummary,
    shippingLoading,
    step2Loaded,
    shipmentMode?.method,
    palletDetails?.weight,
    palletDetails?.height,
    palletLimits.maxHeightCm,
    palletLimits.maxWeightKg,
    currentStep,
    packGroups
  ]);

  const isPartneredShipment = useMemo(
    () =>
      Boolean(
        shipmentMode?.carrier?.partnered ||
        forcePartneredOnly ||
        shippingSummary?.partneredRequired ||
        shippingSummary?.forcePartneredOnly ||
        shippingSummary?.partneredOnly ||
        shippingSummary?.mustUsePartnered
      ),
    [
      shipmentMode?.carrier?.partnered,
      forcePartneredOnly,
      shippingSummary?.partneredRequired,
      shippingSummary?.forcePartneredOnly,
      shippingSummary?.partneredOnly,
      shippingSummary?.mustUsePartnered
    ]
  );


  // Step 1b este încărcat doar la acțiune explicită a userului (View/Edit sau Refresh).

  // Dacă avem deja grupuri în memorie, marcăm ca loaded ca să nu le ștergem inutil.
  useEffect(() => {
    const hasRealGroups = hasRealPackGroups(packGroups);
    if (hasRealGroups) {
      setPackGroupsLoaded(true);
    }
  }, [packGroups]);

  const handlePackingChange = (skuId, patch) => {
    // patch poate fi string (packing) sau obiect cu packing + template info
    if (typeof patch === 'string') {
      setPlan((prev) => ({
        ...prev,
        skus: prev.skus.map((sku) =>
          sku.id === skuId
            ? {
                ...sku,
                packing: patch,
                packingTemplateId: null,
                packingTemplateName: null,
                unitsPerBox: null,
                boxesCount: null,
                boxLengthCm: null,
                boxWidthCm: null,
                boxHeightCm: null,
                boxWeightKg: null
              }
            : sku
        )
      }));
      invalidateFrom('1');
      return;
    }
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku))
    }));
    invalidateFrom('1');
  };

  const handleQuantityChange = (skuId, value) => {
    setPlan((prev) => {
      const nextSkus = (Array.isArray(prev?.skus) ? prev.skus : []).map((sku) =>
        sku.id === skuId ? { ...sku, units: Math.max(0, value) } : sku
      );
      return { ...prev, skus: nextSkus };
    });
    // Pentru schimbări de cantitate nu invalidăm planul/pack groups.
    setStep1SaveError('');
  };

  const normalizeStep1Key = useCallback((value) => String(value || '').trim().toUpperCase(), []);
  const collectSkuIdentifiers = useCallback(
    (sku) =>
      [
        sku?.id,
        sku?.sku,
        sku?.msku,
        sku?.SellerSKU,
        sku?.sellerSku,
        sku?.asin
      ]
        .map((v) => normalizeStep1Key(v))
        .filter(Boolean),
    [normalizeStep1Key]
  );
  const removeSkuFromStep1Plan = useCallback(
    (planByMarket, identifiers) => {
      if (!planByMarket || typeof planByMarket !== 'object') return planByMarket || {};
      const blocked = new Set((Array.isArray(identifiers) ? identifiers : []).map((v) => normalizeStep1Key(v)).filter(Boolean));
      if (!blocked.size) return planByMarket;
      const nextMarkets = {};
      Object.entries(planByMarket).forEach(([marketKey, marketPlan]) => {
        const groups = marketPlan?.groups && typeof marketPlan.groups === 'object' ? marketPlan.groups : {};
        const nextGroups = {};
        Object.entries(groups).forEach(([groupId, group]) => {
          const boxItems = Array.isArray(group?.boxItems) ? group.boxItems : [];
          const cleanedBoxItems = boxItems.map((box) => {
            if (!box || typeof box !== 'object') return {};
            const out = {};
            Object.entries(box).forEach(([k, qty]) => {
              const norm = normalizeStep1Key(k);
              if (blocked.has(norm)) return;
              out[k] = qty;
            });
            return out;
          });
          const hasAnyAssigned = cleanedBoxItems.some((box) =>
            Object.values(box || {}).some((qty) => Number(qty || 0) > 0)
          );
          if (!hasAnyAssigned) return;
          nextGroups[groupId] = {
            ...group,
            boxItems: cleanedBoxItems
          };
        });
        nextMarkets[marketKey] = {
          ...(marketPlan && typeof marketPlan === 'object' ? marketPlan : {}),
          groups: nextGroups
        };
      });
      return nextMarkets;
    },
    [normalizeStep1Key]
  );

  const handleRemoveSku = (skuId) => {
    const requestId = resolveRequestId();
    const removedSku = (Array.isArray(plan?.skus) ? plan.skus : []).find((sku) => sku.id === skuId) || null;
    const identifiers = collectSkuIdentifiers(removedSku || { id: skuId });
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) =>
        sku.id === skuId ? { ...sku, units: 0, excluded: true } : sku
      )
    }));
    setStep1BoxPlanByMarket((prev) => removeSkuFromStep1Plan(prev, identifiers));
    setStep1HiddenSkuIds((prev) => ({ ...(prev || {}), [String(skuId)]: true }));
    if (requestId && typeof skuId === 'string') {
      // Persist immediately so Step1 refresh doesn't resurrect removed SKU from stale DB quantities.
      supabase
        .from('prep_request_items')
        .update({ units_sent: 0 })
        .eq('id', skuId)
        .then(({ error }) => {
          if (error) {
            console.warn('remove sku units_sent persist failed', { requestId, skuId, error: error.message });
          }
        });
    }
    setSkuServicesById((prev) => {
      if (!prev || !prev[skuId]) return prev;
      const next = { ...prev };
      delete next[skuId];
      return next;
    });
    // La remove nu recalculăm pack groups și nu invalidăm planul curent.
    setStep1SaveError('');
  };

  const handleAddSku = async (skuInput) => {
    const skuId = typeof skuInput === 'string' ? skuInput : skuInput?.id || null;
    const requestId = resolveRequestId();

    if (skuId) {
      const existingRow = (Array.isArray(plan?.skus) ? plan.skus : []).find((sku) => sku.id === skuId) || null;
      const nextQty = Math.max(1, Number(existingRow?.units || 0) || 1);
      setPlan((prev) => ({
        ...prev,
        skus: (prev.skus || []).map((sku) =>
          sku.id === skuId
            ? { ...sku, excluded: false, units: nextQty }
            : sku
        )
      }));
      setStep1HiddenSkuIds((prev) => {
        if (!prev || !prev[String(skuId)]) return prev;
        const next = { ...prev };
        delete next[String(skuId)];
        return next;
      });
      if (requestId && typeof skuId === 'string') {
        supabase
          .from('prep_request_items')
          .update({ units_sent: nextQty })
          .eq('id', skuId)
          .then(({ error }) => {
            if (error) {
              console.warn('re-add sku units_sent persist failed', { requestId, skuId, error: error.message });
            }
          });
      }
      invalidateFrom('1');
      setStep1SaveError('');
      return;
    }

    if (!skuInput || skuInput?.source !== 'inventory') return;
    if (!requestId) {
      setStep1SaveError('Missing requestId. Reload page and retry adding product.');
      return;
    }
    const normalizedSku = String(skuInput.sku || '').trim().toUpperCase();
    const normalizedAsin = String(skuInput.asin || '').trim().toUpperCase();
    const existing = (Array.isArray(plan?.skus) ? plan.skus : []).find((row) => {
      const rowSku = String(row?.sku || '').trim().toUpperCase();
      const rowAsin = String(row?.asin || '').trim().toUpperCase();
      return (normalizedSku && rowSku === normalizedSku) || (normalizedAsin && rowAsin === normalizedAsin);
    });
    if (existing?.id) {
      const nextQty = Math.max(1, Number(existing.units || 0) || 1);
      setPlan((prev) => ({
        ...prev,
        skus: (prev.skus || []).map((row) =>
          row.id === existing.id
            ? { ...row, excluded: false, units: nextQty }
            : row
        )
      }));
      setStep1HiddenSkuIds((prev) => {
        if (!prev || !prev[String(existing.id)]) return prev;
        const next = { ...prev };
        delete next[String(existing.id)];
        return next;
      });
      supabase
        .from('prep_request_items')
        .update({ units_sent: nextQty })
        .eq('id', existing.id)
        .then(({ error }) => {
          if (error) {
            console.warn('re-enable existing sku units_sent persist failed', {
              requestId,
              skuId: existing.id,
              error: error.message
            });
          }
        });
      invalidateFrom('1');
      setStep1SaveError('');
      return;
    }

    const payload = {
      prep_request_id: requestId,
      stock_item_id: skuInput.stockItemId || null,
      asin: String(skuInput.asin || '').trim() || null,
      sku: String(skuInput.sku || '').trim() || null,
      product_name: String(skuInput.title || '').trim() || null,
      units_requested: 1,
      units_sent: 1
    };
    try {
      const { data: inserted, error: insertErr } = await supabase
        .from('prep_request_items')
        .insert(payload)
        .select('id, stock_item_id, asin, sku, product_name, units_requested, units_sent')
        .single();
      if (insertErr) throw insertErr;
      const newSku = {
        id: inserted?.id,
        title: inserted?.product_name || skuInput?.title || skuInput?.sku || skuInput?.asin || 'New product',
        sku: inserted?.sku || skuInput?.sku || '',
        asin: inserted?.asin || skuInput?.asin || '',
        image: skuInput?.image || null,
        stock_item_id: inserted?.stock_item_id || skuInput?.stockItemId || null,
        storageType: 'Standard-size',
        packing: 'individual',
        units: Math.max(1, Number(inserted?.units_sent || inserted?.units_requested || 1)),
        excluded: false
      };
      setPlan((prev) => ({
        ...prev,
        skus: [...(Array.isArray(prev?.skus) ? prev.skus : []), newSku]
      }));
      setStep1HiddenSkuIds((prev) => {
        if (!prev || !prev[String(newSku?.id)]) return prev;
        const next = { ...prev };
        delete next[String(newSku?.id)];
        return next;
      });
      invalidateFrom('1');
      setStep1SaveError('');
    } catch (e) {
      setStep1SaveError(e?.message || 'Could not add product from inventory.');
    }
  };

  async function handleRecheckAssignment(_sku) {
    setStep1SaveError('');
    setPackGroupsPreview([]);
    await refreshStep('1');
    const previewRes = await refreshPackingGroupsPreview();
    if (!previewRes?.ok) {
      setStep1SaveError(previewRes?.message || 'Could not recheck pack assignment for this SKU.');
    }
  }

  const handleExpiryChange = (skuId, value) => {
    setPlan((prev) => ({
      ...prev,
      skus: prev.skus.map((sku) =>
        sku.id === skuId ? { ...sku, expiry: value, expiryDate: value } : sku
      )
    }));
    invalidateFrom('1');
  };

  const handlePrepChange = (skuId, patch) => {
    setPlan((prev) => ({
      ...prev,
      skus: (prev.skus || []).map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku))
    }));
    invalidateFrom('1');
  };

  const planUnitsByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(plan?.skus) ? plan.skus : []).forEach((sku) => {
      const units = Number(sku?.units || 0);
      const add = (value) => {
        const key = String(value || '').trim().toUpperCase();
        if (!key) return;
        map.set(key, units);
      };
      add(sku?.sku);
      add(sku?.msku);
      add(sku?.SellerSKU);
      add(sku?.asin);
      add(sku?.id);
    });
    return map;
  }, [plan?.skus]);

  const normalizeGroupItemsForUnits = useCallback(
    (items = []) =>
      (Array.isArray(items) ? items : [])
        .map((it) => {
          const key = String(it?.sku || it?.msku || it?.SellerSKU || it?.asin || '').trim().toUpperCase();
          const plannedUnits = planUnitsByKey.get(key);
          const itemQty = Number(it?.quantity || 0) || 0;
          const quantity =
            Number.isFinite(plannedUnits) && plannedUnits > 0
              ? plannedUnits
              : itemQty > 0
                ? itemQty
                : Number.isFinite(plannedUnits)
                  ? plannedUnits
                  : itemQty;
          if (!quantity) return null;
          return { ...it, quantity };
        })
        .filter(Boolean),
    [planUnitsByKey]
  );

  const decoratePackGroup = useCallback(
    (g) => {
      const { planGroup } = resolvePlanGroupForPackGroup(g);
      const planBoxes = Array.isArray(planGroup?.boxes) ? planGroup.boxes : [];
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      const planPerBoxDetails = planBoxes
        .map((box) => {
          const length = getPositiveNumber(box?.length_cm ?? box?.length);
          const width = getPositiveNumber(box?.width_cm ?? box?.width);
          const height = getPositiveNumber(box?.height_cm ?? box?.height);
          const weight = getPositiveNumber(box?.weight_kg ?? box?.weight);
          if (!(length && width && height && weight)) return null;
          return { length, width, height, weight };
        })
        .filter(Boolean);
      const fallbackDims = planPerBoxDetails[0]
        ? { length: planPerBoxDetails[0].length, width: planPerBoxDetails[0].width, height: planPerBoxDetails[0].height }
        : null;
      const fallbackWeight = planPerBoxDetails[0]?.weight ?? null;
      const resolvedDims = getSafeDims(g?.boxDimensions) || getSafeDims(fallbackDims);
      const resolvedWeight = getPositiveNumber(g?.boxWeight) || getPositiveNumber(fallbackWeight);
      const uiBoxCount = Number(g?.boxes || 0);
      const planBoxCount = planBoxes.length || 0;
      const boxes = Math.max(1, planBoxCount || 0, uiBoxCount || 0);
      const packMode = g?.packMode || (boxes > 1 ? 'multiple' : 'single');
      const perBoxDetails =
        Array.isArray(g?.perBoxDetails) && g.perBoxDetails.length
          ? g.perBoxDetails
          : planPerBoxDetails.length
            ? planPerBoxDetails
            : null;
      const perBoxItems =
        Array.isArray(g?.perBoxItems) && g.perBoxItems.length
          ? g.perBoxItems
          : planBoxItems.length
            ? planBoxItems
            : null;
      return {
        ...g,
        boxes,
        packMode,
        boxDimensions: resolvedDims || null,
        boxWeight: resolvedWeight ?? null,
        perBoxDetails,
        perBoxItems
      };
    },
    [resolvePlanGroupForPackGroup]
  );

  const packGroupsDecorated = useMemo(() => {
    if (!Array.isArray(packGroups)) return [];
    return packGroups.map((g) => decoratePackGroup(g));
  }, [packGroups, decoratePackGroup]);

  const packGroupsForUnits = useMemo(() => {
    if (!Array.isArray(packGroupsDecorated)) return [];
    return packGroupsDecorated
      .map((g) => {
        const items = normalizeGroupItemsForUnits(g?.items || []);
        if (!items.length) return null;
        const units = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        return {
          ...g,
          items,
          units,
          skuCount: items.length
        };
      })
      .filter(Boolean);
  }, [packGroupsDecorated, normalizeGroupItemsForUnits]);

  const packGroupsPreviewForUnits = useMemo(() => {
    if (!Array.isArray(packGroupsPreview)) return [];
    return packGroupsPreview
      .map((g) => {
        const items = normalizeGroupItemsForUnits(g?.items || []);
        if (!items.length) return null;
        const units = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
        return {
          ...g,
          items,
          units,
          skuCount: items.length
        };
      })
      .filter(Boolean);
  }, [packGroupsPreview, normalizeGroupItemsForUnits]);

  // Persist Step 1b draft values (boxes/dimensions/weight/per-box allocations) in amazon_snapshot.
  useEffect(() => {
    const requestId = resolveRequestId();
    const inboundPlanId = resolveInboundPlanId();
    if (!requestId || !inboundPlanId) return;

    const groupsForDraft = (Array.isArray(packGroupsForUnits) ? packGroupsForUnits : [])
      .filter((g) => g?.packingGroupId && !isFallbackId(g.packingGroupId))
      .map((g) => ({
        id: g.id || g.packingGroupId,
        packingGroupId: g.packingGroupId,
        title: g.title || null,
        boxes: Number(g.boxes || 1) || 1,
        packMode: g.packMode || 'single',
        boxDimensions: g.boxDimensions || null,
        boxWeight: g.boxWeight ?? null,
        perBoxDetails: Array.isArray(g.perBoxDetails) ? g.perBoxDetails : null,
        perBoxItems: Array.isArray(g.perBoxItems) ? g.perBoxItems : null,
        contentInformationSource: g.contentInformationSource || null,
        items: Array.isArray(g.items)
          ? g.items.map((it) => ({
              sku: it?.sku || it?.msku || it?.SellerSKU || null,
              quantity: Number(it?.quantity || 0) || 0
            }))
          : []
      }));

    if (!groupsForDraft.length) return;
    const serialized = JSON.stringify(groupsForDraft);
    if (serialized === lastStep1bDraftPersistedRef.current) return;

    if (step1bDraftPersistTimerRef.current) clearTimeout(step1bDraftPersistTimerRef.current);
    step1bDraftPersistTimerRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('prep_requests')
          .select('amazon_snapshot')
          .eq('id', requestId)
          .maybeSingle();
        if (error) throw error;
        const snapshotBase =
          data?.amazon_snapshot && typeof data.amazon_snapshot === 'object' ? data.amazon_snapshot : {};
        const nextSnapshot = {
          ...snapshotBase,
          fba_inbound: {
            ...(snapshotBase?.fba_inbound || {}),
            inboundPlanId,
            packingOptionId: packingOptionIdRef.current || snapshotBase?.fba_inbound?.packingOptionId || null,
            placementOptionId: placementOptionIdRef.current || snapshotBase?.fba_inbound?.placementOptionId || null,
            packingGroups: groupsForDraft,
            savedAt: new Date().toISOString()
          }
        };
        const { error: updateErr } = await supabase
          .from('prep_requests')
          .update({ amazon_snapshot: nextSnapshot })
          .eq('id', requestId);
        if (updateErr) throw updateErr;
        lastStep1bDraftPersistedRef.current = serialized;
      } catch (e) {
        console.warn('Persist Step1b draft to snapshot failed', { requestId, error: e?.message || e });
      }
    }, 700);

    return () => {
      if (step1bDraftPersistTimerRef.current) clearTimeout(step1bDraftPersistTimerRef.current);
    };
  }, [packGroupsForUnits, resolveRequestId, resolveInboundPlanId, isFallbackId]);

  const packGroupsForAuto = useMemo(() => (Array.isArray(packGroupsDecorated) ? packGroupsDecorated : []), [packGroupsDecorated]);

  const autoPackingEnabled = useMemo(() => {
    if (historyMode) return false;
    if (palletOnlyMode) return true;
    const groupsPlan = step1BoxPlanForMarket?.groups || {};
    return Boolean(groupsPlan && Object.keys(groupsPlan).length);
  }, [historyMode, step1BoxPlanForMarket, palletOnlyMode]);
  const autoPackingReady = useMemo(() => {
    if (!autoPackingEnabled || !Array.isArray(packGroupsForAuto) || !packGroupsForAuto.length) return false;
    if (palletOnlyMode) {
      return packGroupsForAuto.every((g) => {
        const id = String(g?.packingGroupId || g?.id || '').trim();
        const boxes = Number(g?.boxes || 0);
        return Boolean(id) && boxes > 0;
      });
    }
    const groupsPlan = step1BoxPlanForMarket?.groups || {};
    const hasGroupItems = (g) => {
      const normalized = normalizeGroupItemsForUnits(g?.items || []);
      if (normalized.length) return true;
      const planGroupKey = g?.step1PlanGroupKey || g?.packingGroupId || g?.id || null;
      const planGroup = planGroupKey ? groupsPlan?.[planGroupKey] : null;
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      if (!planBoxItems.length) return false;
      return planBoxItems.some((box) =>
        Object.values(box || {}).some((qty) => Number(qty || 0) > 0)
      );
    };
    return packGroupsForAuto.every((g) => {
      if (!hasGroupItems(g)) return false;
      const packMode = String(g?.packMode || 'single').toLowerCase();
      if (packMode === 'multiple') {
        const perBox = Array.isArray(g?.perBoxDetails) ? g.perBoxDetails : [];
        const perItems = Array.isArray(g?.perBoxItems) ? g.perBoxItems : [];
        if (!perBox.length || !perItems.length) return false;
        return perBox.every((b) => {
          const dims = getSafeDims(b);
          const w = getPositiveNumber(b?.weight);
          return Boolean(dims && w);
        });
      }
      const dims = getSafeDims(g?.boxDimensions);
      const w = getPositiveNumber(g?.boxWeight);
      return Boolean(dims && w);
    });
  }, [autoPackingEnabled, packGroupsForAuto, normalizeGroupItemsForUnits, step1BoxPlanForMarket, palletOnlyMode]);

  // Active auto-packing only when we have valid groups with dimensions/weight; otherwise allow manual UI.
  const autoPackingActive = useMemo(() => autoPackingEnabled && autoPackingReady, [autoPackingEnabled, autoPackingReady]);

  const handlePackGroupUpdate = (groupId, patch) => {
    setPackGroups((prev) =>
      prev.map((g) =>
        g.id === groupId || g.packingGroupId === groupId ? { ...g, ...patch } : g
      )
    );
  };

  useEffect(() => {
    if (!packGroupsLoaded || !Array.isArray(packGroups) || packGroups.length === 0) return;
    const groupsPlan = step1BoxPlanForMarket?.groups || {};
    if (!groupsPlan || !Object.keys(groupsPlan).length) return;
    const planGroupsOrdered = Object.entries(groupsPlan)
      .map(([key, value]) => ({
        key,
        value,
        label: value?.groupLabel || ''
      }))
      .sort((a, b) => {
        const numA = Number(String(a.label).match(/(\d+)/)?.[1] || 0);
        const numB = Number(String(b.label).match(/(\d+)/)?.[1] || 0);
        return numA - numB;
      });
    const planGroupsBySignature = new Map();
    const buildPlanSignature = (planGroup) => {
      const boxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      if (!boxItems.length) return null;
      const totals = new Map();
      boxItems.forEach((box) => {
        Object.entries(box || {}).forEach(([key, qty]) => {
          const sku = String(key || '').trim().toUpperCase();
          if (!sku) return;
          const add = Number(qty || 0) || 0;
          totals.set(sku, (totals.get(sku) || 0) + add);
        });
      });
      const parts = Array.from(totals.entries())
        .filter(([, qty]) => Number(qty) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sku, qty]) => `${sku}:${qty}`);
      return parts.length ? parts.join('|') : null;
    };
    planGroupsOrdered.forEach(({ key, value }) => {
      const sig = buildPlanSignature(value);
      if (sig && !planGroupsBySignature.has(sig)) {
        planGroupsBySignature.set(sig, { key, value });
      }
    });
    setPackGroups((prev) => {
      let changed = false;
      const sameDims = (a, b) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return (
          String(a.length || '') === String(b.length || '') &&
          String(a.width || '') === String(b.width || '') &&
          String(a.height || '') === String(b.height || '')
        );
      };
      const sameJson = (a, b) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return JSON.stringify(a) === JSON.stringify(b);
      };
      const next = prev.map((g) => {
        const gid = g?.packingGroupId || g?.id || null;
        const planGroup = gid ? groupsPlan[gid] : null;
        const groupSignature = getPackGroupSignature(g);
        const signatureEntry = !planGroup && groupSignature ? planGroupsBySignature.get(groupSignature) : null;
        const signatureGroup = signatureEntry?.value || null;
        const fallbackEntry = !planGroup && !signatureGroup ? planGroupsOrdered.shift() || null : null;
        const fallbackGroup = fallbackEntry?.value || null;
        const resolvedPlan = planGroup || signatureGroup || fallbackGroup;
        if (!resolvedPlan) return g;
        const resolvedPlanKey =
          (planGroup && gid) || signatureEntry?.key || fallbackEntry?.key || g.step1PlanGroupKey || null;
        const boxes = Array.isArray(resolvedPlan?.boxes) ? resolvedPlan.boxes : [];
        const boxItems = Array.isArray(resolvedPlan?.boxItems) ? resolvedPlan.boxItems : [];
        if (!boxes.length) return g;
        const boxCount = boxes.length;
        const itemKeys = new Map();
        const items = Array.isArray(g.items) ? g.items : [];
        items.forEach((it) => {
          const sku = String(it.sku || it.msku || it.SellerSKU || '').trim();
          const asin = String(it.asin || '').trim();
          if (sku) itemKeys.set(sku.toUpperCase(), sku);
          if (asin) itemKeys.set(asin.toUpperCase(), sku || asin);
        });
        const normalizeBoxItems = (box) => {
          const normalized = {};
          Object.entries(box || {}).forEach(([key, qty]) => {
            const k = String(key || '').trim();
            if (!k) return;
            const mapped = itemKeys.get(k.toUpperCase()) || k;
            normalized[mapped] = Number(qty || 0) || 0;
          });
          return normalized;
        };
        const perBoxDetails = boxes.map((b) => ({
          length: b?.length_cm ?? b?.length ?? '',
          width: b?.width_cm ?? b?.width ?? '',
          height: b?.height_cm ?? b?.height ?? '',
          weight: b?.weight_kg ?? b?.weight ?? ''
        }));
        const perBoxItems = boxItems.length
          ? boxItems.map((box) => normalizeBoxItems(box))
          : Array.from({ length: boxCount }).map(() => ({}));
        const firstBox = boxes[0] || {};
        const singleDims =
          boxCount === 1
            ? {
                length: firstBox?.length_cm ?? firstBox?.length ?? '',
                width: firstBox?.width_cm ?? firstBox?.width ?? '',
                height: firstBox?.height_cm ?? firstBox?.height ?? ''
              }
            : g?.boxDimensions || null;
        const singleWeight =
          boxCount === 1 ? firstBox?.weight_kg ?? firstBox?.weight ?? '' : g?.boxWeight ?? null;
        const nextGroup = {
          ...g,
          boxes: boxCount,
          packMode: boxCount > 1 ? 'multiple' : 'single',
          boxDimensions: boxCount === 1 ? singleDims : g?.boxDimensions || null,
          boxWeight: boxCount === 1 ? singleWeight : g?.boxWeight ?? null,
          perBoxDetails: boxCount > 1 ? perBoxDetails : null,
          perBoxItems: boxCount > 1 ? perBoxItems : null,
          contentInformationSource: boxCount > 1 ? 'BOX_CONTENT_PROVIDED' : g?.contentInformationSource || null,
          step1PlanGroupKey: resolvedPlanKey
        };
        const unchanged =
          g.boxes === nextGroup.boxes &&
          g.packMode === nextGroup.packMode &&
          sameDims(g.boxDimensions, nextGroup.boxDimensions) &&
          g.boxWeight === nextGroup.boxWeight &&
          sameJson(g.perBoxDetails, nextGroup.perBoxDetails) &&
          sameJson(g.perBoxItems, nextGroup.perBoxItems) &&
          g.contentInformationSource === nextGroup.contentInformationSource &&
          g.step1PlanGroupKey === nextGroup.step1PlanGroupKey;
        if (!unchanged) changed = true;
        return unchanged ? g : nextGroup;
      });
      return changed ? next : prev;
    });
  }, [packGroupsLoaded, packGroups, step1BoxPlanForMarket]);

  const handleSelectPackingOption = (id) => {
    if (!id) return;
    if (packingOptionIdRef.current && String(packingOptionIdRef.current) === String(id)) return;
    setPackingOptionId(id);
    refreshPackingGroups(id);
  };

  async function refreshPackingGroupsPreview() {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setInboundPlanMissing(true);
      setPackGroupsPreviewError(wizardCopy.missingIds);
      return { ok: false, code: 'MISSING_IDS' };
    }
    if (packingRefreshLockRef.current.inFlight && packingRefreshLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'PACKING_IN_FLIGHT' };
    }
    if (packingPreviewLockRef.current.inFlight && packingPreviewLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'IN_FLIGHT' };
    }
    packingPreviewLockRef.current = { inFlight: true, planId: inboundPlanId };
    setPackGroupsPreviewLoading(true);
    setPackGroupsPreviewError('');
    try {
      const { data, error } = await invokeAuthedFunction('fba-plan-step1-preview', {
        request_id: requestId,
        inbound_plan_id: inboundPlanId,
        amazon_integration_id: plan?.amazonIntegrationId || plan?.amazon_integration_id || null
      });
      if (error) throw error;
      if (data?.code === 'PACKING_OPTIONS_NOT_READY' || data?.code === 'PACKING_GROUPS_NOT_READY') {
        setInboundPlanMissing(true);
        const msg = data?.message || wizardCopy.packingWait;
        setPackGroupsPreviewError(msg);
        setPackGroupsPreview([]);
        return { ok: false, code: data.code, message: msg };
      }
      if (data?.code === 'PACKING_OPTIONS_NOT_AVAILABLE') {
        setPackGroupsPreviewError(data?.message || 'Amazon did not return packingOptions for preview.');
        setPackGroupsPreview([]);
        return { ok: false, code: data.code, message: data?.message || '' };
      }
      if (Array.isArray(data?.packingGroups)) {
        const normalized = normalizePackGroups(data.packingGroups);
        const hasReal = Array.isArray(normalized) && normalized.some((g) => {
          const id = g?.packingGroupId || g?.id || '';
          return Boolean(id) && !String(id).toLowerCase().startsWith('fallback-');
        });
        setPackGroupsPreview(normalized);
        setPackGroupsPreviewError('');
        if (hasReal) {
          setInboundPlanMissing(false);
          setStep1SaveError('');
          setPlanError('');
        }
        return { ok: true, packingGroups: normalized };
      }
      setPackGroupsPreview([]);
      setPackGroupsPreviewError(wizardCopy.previewUnavailable);
      return { ok: false, code: 'NO_PREVIEW' };
    } catch (e) {
      const msg = e?.message || 'Preview packing groups failed.';
      setPackGroupsPreviewError(msg);
      setPackGroupsPreview([]);
      return { ok: false, code: 'ERROR', message: msg };
    } finally {
      setPackGroupsPreviewLoading(false);
      packingPreviewLockRef.current = { inFlight: false, planId: inboundPlanId };
      packingPreviewFetchRef.current = false;
    }
  }

  const buildPackingPayload = (groups = packGroupsDecorated) => {
    if (!Array.isArray(groups) || groups.length === 0) {
      return { packingGroups: [], missingGroupId: false };
    }

    const planLabelOwnerBySku = new Map();
    (Array.isArray(plan?.skus) ? plan.skus : []).forEach((sku) => {
      const key = String(sku?.sku || sku?.msku || sku?.SellerSKU || '').trim().toUpperCase();
      if (!key) return;
      if (sku?.labelOwner) planLabelOwnerBySku.set(key, sku.labelOwner);
    });

    const packingGroupsPayload = [];
    let missingGroupId = false;

    groups.forEach((g) => {
      const { planGroup } = resolvePlanGroupForPackGroup(g);
      const planBoxesRaw = Array.isArray(planGroup?.boxes) ? planGroup.boxes : [];
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      const planPerBoxDetails = planBoxesRaw.map((box) => ({
        length: box?.length_cm ?? box?.length ?? '',
        width: box?.width_cm ?? box?.width ?? '',
        height: box?.height_cm ?? box?.height ?? '',
        weight: box?.weight_kg ?? box?.weight ?? ''
      }));
      const fallbackDims = planBoxesRaw[0]
        ? {
            length: planBoxesRaw[0]?.length_cm ?? planBoxesRaw[0]?.length ?? '',
            width: planBoxesRaw[0]?.width_cm ?? planBoxesRaw[0]?.width ?? '',
            height: planBoxesRaw[0]?.height_cm ?? planBoxesRaw[0]?.height ?? ''
          }
        : null;
      const fallbackWeight = planBoxesRaw[0]?.weight_kg ?? planBoxesRaw[0]?.weight ?? null;
      const dims = getSafeDims(g.boxDimensions) || getSafeDims(fallbackDims);
      const weight = getPositiveNumber(g.boxWeight) || getPositiveNumber(fallbackWeight);
      const planBoxCount = planBoxesRaw.length || 0;
      const uiBoxCount = Number(g.boxes) || 0;
      // Prefer the user's current UI box count; fall back to plan boxes only if UI has none.
      const count = uiBoxCount > 0 ? uiBoxCount : planBoxCount > 0 ? planBoxCount : 1;
      let normalizedPackMode = g.packMode || "single";
      if (count > 1) normalizedPackMode = "multiple";
      const isMultiple = String(normalizedPackMode || "").toLowerCase() === "multiple";
      const packingGroupId = g.packingGroupId || null;
      const normalizedDims = dims ? { length: dims.length, width: dims.width, height: dims.height, unit: "CM" } : null;
      const normalizedWeight = weight ? { value: weight, unit: "KG" } : null;

      if (!packingGroupId) {
        missingGroupId = true;
        return;
      }
      let normalizedItems = normalizeGroupItemsForUnits(g.items || []);
      if (!normalizedItems.length) {
        const perBoxItems = Array.isArray(g.perBoxItems) ? g.perBoxItems : [];
        const totals = new Map();
        perBoxItems.forEach((box) => {
          Object.entries(box || {}).forEach(([key, qty]) => {
            const skuKey = String(key || '').trim();
            if (!skuKey) return;
            const add = Number(qty || 0) || 0;
            totals.set(skuKey, (totals.get(skuKey) || 0) + add);
          });
        });
        if (totals.size) {
          normalizedItems = Array.from(totals.entries())
            .filter(([, qty]) => qty > 0)
            .map(([sku, quantity]) => ({ sku, quantity }));
        }
      }
      if (planBoxItems.length) {
        const totals = new Map();
        planBoxItems.forEach((box) => {
          Object.entries(box || {}).forEach(([key, qty]) => {
            const skuKey = String(key || '').trim();
            if (!skuKey) return;
            const add = Number(qty || 0) || 0;
            totals.set(skuKey, (totals.get(skuKey) || 0) + add);
          });
        });
        if (totals.size) {
          normalizedItems = Array.from(totals.entries())
            .filter(([, qty]) => qty > 0)
            .map(([sku, quantity]) => ({ sku, quantity }));
        }
      }
      if (!normalizedItems.length) {
        return;
      }

      // Default to BOX_CONTENT_PROVIDED so we don't silently fall back to MANUAL_PROCESS (which drops items).
      const contentInformationSource =
        g.contentInformationSource ||
        (isMultiple ? "BOX_CONTENT_PROVIDED" : "BOX_CONTENT_PROVIDED");
      packingGroupsPayload.push({
        packingGroupId,
        boxes: count,
        packMode: normalizedPackMode,
        dimensions: normalizedDims,
        weight: normalizedWeight,
        contentInformationSource,
        items: normalizedItems.map((it) => ({
          sku: it.sku || it.msku || it.SellerSKU || null,
          quantity: Number(it.quantity || 0) || 0,
          expiration:
            it.expiration ||
            it.expiry ||
            it.expiryDate ||
            it.expirationDate ||
            null,
          prepOwner: it.prepOwner || it.prep_owner || it.prep || null,
          // dacă avem valoarea din Amazon, trimite-o prioritar
          labelOwner:
            it.apiLabelOwner ||
            it.labelOwner ||
            it.label_owner ||
            it.label ||
            (planLabelOwnerBySku.get(String(it.sku || it.msku || it.SellerSKU || '').trim().toUpperCase()) || null)
        })),
        perBoxDetails:
          isMultiple
            ? Array.isArray(g.perBoxDetails) && g.perBoxDetails.length
              ? g.perBoxDetails
              : planPerBoxDetails.length > 1
                ? planPerBoxDetails
                : null
            : null,
        perBoxItems:
          isMultiple
            ? Array.isArray(g.perBoxItems) && g.perBoxItems.length
              ? g.perBoxItems
              : planBoxItems.length > 1
                ? planBoxItems
                : null
            : null
      });
    });

    return { packingGroups: packingGroupsPayload, missingGroupId };
  };

  const buildPackageGroupingsFromBoxPlan = useCallback(() => {
    const groups = step1BoxPlanForMarket?.groups || {};
    const packageGroupings = [];

    Object.entries(groups).forEach(([groupId, groupPlan]) => {
      const boxes = Array.isArray(groupPlan?.boxes) ? groupPlan.boxes : [];
      const itemsPerBox = Array.isArray(groupPlan?.boxItems) ? groupPlan.boxItems : [];

      const normBoxes = boxes
        .map((box, idx) => {
          const dims = {
            length: Number(box?.length_cm || box?.length || 0),
            width: Number(box?.width_cm || box?.width || 0),
            height: Number(box?.height_cm || box?.height || 0),
            unitOfMeasurement: 'CM'
          };
          const weight = {
            value: Number(box?.weight_kg || box?.weight || 0),
            unit: 'KG'
          };
          const content = itemsPerBox[idx] || {};
          const items = Object.entries(content)
            .filter(([, qty]) => Number(qty) > 0)
            .map(([msku, qty]) => ({
              msku,
              quantity: Number(qty)
            }));
          const hasDims =
            Number(dims.length) > 0 && Number(dims.width) > 0 && Number(dims.height) > 0;
          const hasWeight = Number(weight.value) > 0;
          if (!items.length || !hasDims || !hasWeight) return null;
          return {
            dimensions: dims,
            weight,
            quantity: 1,
            items,
            contentInformationSource: 'BOX_CONTENT_PROVIDED'
          };
        })
        .filter(Boolean);

      if (normBoxes.length) {
        packageGroupings.push({
          packingGroupId: groupId,
          boxes: normBoxes
        });
      }
    });

    return packageGroupings;
  }, [step1BoxPlanForMarket?.groups]);

  const submitPackingInformation = async (payload = {}) => {
    const skipRefresh = Boolean(payload?.skipRefresh);
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    const allowPalletRelax = palletOnlyMode || isLtlFtl(shipmentMode?.method);

    if (!inboundPlanId || !requestId) {
      setPackingSubmitError('Missing inboundPlanId or requestId; finish Step 1 before confirming.');
      return;
    }

    const derivedPayload = buildPackingPayload();
    const packageGroupingsFallback = buildPackageGroupingsFromBoxPlan();
    let packingGroupsPayload =
      Array.isArray(payload.packingGroups) && payload.packingGroups.length ? payload.packingGroups : derivedPayload.packingGroups;

    // dacă UI a trimis un payload manual (include dimensiuni), sincronizăm imediat în state ca să nu le pierdem la refresh
    if (Array.isArray(payload.packingGroups) && payload.packingGroups.length) {
      const asStateShape = payload.packingGroups.map((g, idx) => ({
        id: g.packingGroupId || g.id || `pg-${idx + 1}`,
        packingGroupId: g.packingGroupId || g.id || `pg-${idx + 1}`,
        boxes: g.boxes ?? 1,
        packMode: g.packMode || g.pack_mode || 'single',
        boxDimensions: g.dimensions
          ? { length: g.dimensions.length, width: g.dimensions.width, height: g.dimensions.height }
          : null,
        boxWeight: g.weight?.value ?? g.weight?.amount ?? g.boxWeight ?? g.weight ?? null,
        items: g.items || [],
        perBoxDetails: g.perBoxDetails || g.per_box_details || null,
        perBoxItems: g.perBoxItems || g.per_box_items || null,
        contentInformationSource: g.contentInformationSource || g.content_information_source || null
      }));
      setPackGroups((prev) => mergePackGroups(prev, asStateShape));
    }

    const isFallback = (v) => typeof v === "string" && v.toLowerCase().startsWith("fallback-");
    const hasFallback = packingGroupsPayload.some((g) => isFallback(g.packingGroupId));
    const missingGroupId = derivedPayload.missingGroupId || packingGroupsPayload.some((g) => !g.packingGroupId);
    if ((missingGroupId || hasFallback) && !packageGroupingsFallback.length) {
      setPackingSubmitError('Amazon nu a returnat packingGroupId pentru cutii (packingOptions). Încearcă din nou Step 1b sau setează manual cutiile.');
      return;
    }

    if (!packingGroupsPayload.length && !packageGroupingsFallback.length) {
      setPackingSubmitError(
        allowPalletRelax
          ? 'Completează packing groups înainte de a continua.'
          : 'Completează dimensiunile/greutatea cutiilor înainte de a continua.'
      );
      return;
    }
    if (!allowPalletRelax) {
      const invalid = packingGroupsPayload.find((g) => {
        const isMultiple = String(g.packMode || '').toLowerCase() === 'multiple';
        const hasBaseDims =
          Number(g.dimensions?.length) > 0 &&
          Number(g.dimensions?.width) > 0 &&
          Number(g.dimensions?.height) > 0;
        const hasBaseWeight = Number(g.weight?.value) > 0;

        if (isMultiple) {
          const perBox = Array.isArray(g.perBoxDetails) ? g.perBoxDetails : [];

          if (!perBox.length) {
            return !(hasBaseDims && hasBaseWeight);
          }

          return perBox.some((b) => {
            const l = Number(b?.length || 0);
            const w = Number(b?.width || 0);
            const h = Number(b?.height || 0);
            const wt = Number(b?.weight || 0);
            return !(l > 0 && w > 0 && h > 0 && wt > 0);
          });
        }

        return !(hasBaseDims && hasBaseWeight);
      });
      if (invalid) {
        setPackingSubmitError('Dimensiuni/greutate incomplete pentru cutie.');
        return;
      }
    } else {
      const missingBoxes = packingGroupsPayload.some((g) => !(Number(g.boxes || 0) > 0));
      if (missingBoxes) {
        setPackingSubmitError('Setează numărul de cutii pentru fiecare packing group.');
        return;
      }
    }

    setPackingSubmitLoading(true);
    setPackingSubmitError('');
    try {
      // Pentru auto-flow evităm refresh-ul redundant (reduce semnificativ latența spre Step 2).
      const refreshRes = skipRefresh ? { ok: true } : await refreshPackingGroups();
      const effectivePackGroups = Array.isArray(refreshRes?.packingGroups)
        ? refreshRes.packingGroups
        : packGroups;
      const effectivePackingOptId =
        refreshRes?.packingOptionId ||
        packingOptionId ||
        plan?.packingOptionId ||
        plan?.packing_option_id ||
        null;
      if (!effectivePackingOptId) {
        throw new Error('Missing packingOptionId accepted by Amazon; refresh Step 1b and try again.');
      }
      const refreshedPayload = buildPackingPayload(effectivePackGroups);
      const refreshedGroups = refreshedPayload.packingGroups;
      if (Array.isArray(payload.packingGroups) && payload.packingGroups.length) {
        const overrideById = new Map(
          payload.packingGroups
            .filter((g) => g?.packingGroupId)
            .map((g) => [String(g.packingGroupId), g])
        );
        packingGroupsPayload = refreshedGroups.map((g) => {
          const override = overrideById.get(String(g.packingGroupId));
          if (!override) return g;
          return {
            ...g,
            boxes: override.boxes ?? g.boxes,
            packMode: override.packMode || override.pack_mode || g.packMode,
            dimensions: override.dimensions || g.dimensions,
            weight: override.weight || g.weight,
            perBoxDetails: override.perBoxDetails || override.per_box_details || g.perBoxDetails,
            perBoxItems: override.perBoxItems || override.per_box_items || g.perBoxItems,
            contentInformationSource:
              override.contentInformationSource || override.content_information_source || g.contentInformationSource
          };
        });
      } else {
        packingGroupsPayload = refreshedGroups;
      }
      if (!refreshRes?.ok) {
        // dacă avem deja packing groups încărcate în UI, nu mai blocăm user-ul; continuăm cu ceea ce avem
        const hasLocalGroups = Array.isArray(packGroups) && packGroups.length > 0;
        if (!hasLocalGroups) {
          const trace = refreshRes?.traceId ? ` TraceId ${refreshRes.traceId}` : '';
          throw new Error(
            refreshRes?.message ||
            `Packing groups are not ready yet.${trace}`
          );
        }
        console.warn('Proceeding with existing packing groups because Amazon refresh not ready', refreshRes);
      }

      const packageGroupings = packageGroupingsFallback.length ? packageGroupingsFallback : null;
      const invokeBody = {
        request_id: requestId,
        inbound_plan_id: inboundPlanId,
        packing_option_id: effectivePackingOptId,
        placement_option_id: placementOptId,
        packing_groups: packingGroupsPayload,
        package_groupings: packageGroupings || undefined,
        generate_placement_options: true
      };
      const invokeWithTimeout = Promise.race([
        supabase.functions.invoke('fba-set-packing-information', { body: invokeBody }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout while waiting for Amazon packing confirmation (70s). Please retry.')), 70000)
        )
      ]);
      const { data, error } = await invokeWithTimeout;
      let responseData = data;
      if (error) {
        const parsed = await extractFunctionInvokeError(error);
        const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : null;
        if (!payload) {
          throw new Error(parsed?.message || error?.message || 'SetPackingInformation failed.');
        }
        responseData = {
          ...payload,
          ...(parsed?.status ? { status: parsed.status } : {}),
          ...(parsed?.message ? { message: payload?.message || payload?.error || parsed.message } : {})
        };
      }
      const response = responseData && typeof responseData === 'object' ? responseData : {};
      if (!response?.ok) {
        const trace = response?.traceId || response?.trace_id || null;
        const detail =
          response?.message ||
          response?.error ||
          response?.detail ||
          'SetPackingInformation failed.';
        const withTrace = trace ? `${detail} · TraceId ${trace}` : detail;
        throw new Error(withTrace);
      }
      if (response?.traceId && !import.meta.env.PROD) {
        console.log('setPackingInformation traceId', response.traceId);
      }
      if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
      completeAndNext('1b');
    } catch (e) {
      const parsed = await extractFunctionInvokeError(e);
      const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : null;
      const trace = payload?.traceId || payload?.trace_id || null;
      const message =
        payload?.message ||
        payload?.error ||
        parsed?.message ||
        e?.message ||
        'SetPackingInformation failed.';
      setPackingSubmitError(trace ? `${message} · TraceId ${trace}` : message);
    } finally {
      setPackingSubmitLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep !== '1b') return;
    if (!autoPackingEnabled || !autoPackingReady) return;
    if (packingSubmitLoading) return;
    const inboundPlanId = resolveInboundPlanId();
    if (!inboundPlanId) return;
    if (autoPackingRef.current.planId !== inboundPlanId) {
      autoPackingRef.current = { planId: inboundPlanId, attempted: false };
    }
    if (autoPackingRef.current.attempted) return;
    autoPackingRef.current.attempted = true;
    const payload = buildPackingPayload(packGroupsForAuto);
    submitPackingInformation({ packingGroups: payload.packingGroups, skipRefresh: true });
  }, [
    currentStep,
    autoPackingEnabled,
    autoPackingReady,
    packingSubmitLoading,
    packGroupsForAuto,
    resolveInboundPlanId,
    submitPackingInformation,
    buildPackingPayload
  ]);

  useEffect(() => {
    if (currentStep !== '2') return;
    const inboundPlanId = resolveInboundPlanId();
    if (!inboundPlanId) return;
    if (autoShipPlanRef.current.planId !== inboundPlanId) {
      autoShipPlanRef.current = { planId: inboundPlanId, attempted: false };
    }
    if (autoShipPlanRef.current.attempted) return;
    const pkgFallback = buildPackageGroupingsFromBoxPlan();
    if (!pkgFallback.length) return;
    const hasShipments = Array.isArray(shipments) && shipments.length > 0;
    if (hasShipments) return;
    autoShipPlanRef.current.attempted = true;
    submitPackingInformation({ packingGroups: [] });
  }, [
    currentStep,
    shipments,
    resolveInboundPlanId,
    buildPackageGroupingsFromBoxPlan,
    submitPackingInformation
  ]);

  async function refreshPackingGroups(selectedPackingOptionId = null) {
    if (typeof window === 'undefined') return { ok: false, code: 'NO_WINDOW' };
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setInboundPlanMissing(true);
      setPackingReadyError(wizardCopy.missingIds);
      return { ok: false, code: 'MISSING_IDS' };
    }
    // păstrăm grupurile existente; doar marcăm loading
    setPackGroupsLoaded(hasRealPackGroups(packGroups));
    if (packingPreviewLockRef.current.inFlight && packingPreviewLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'PREVIEW_IN_FLIGHT' };
    }
    if (packingRefreshLockRef.current.inFlight && packingRefreshLockRef.current.planId === inboundPlanId) {
      return { ok: false, code: 'IN_FLIGHT' };
    }
    packingRefreshLockRef.current = { inFlight: true, planId: inboundPlanId };
    setPackingRefreshLoading(true);
    setPackingReadyError('');
    const attemptFetch = async () => {
      // trimite ultimele valori din UI ca snapshot override (dims/weight/boxes)
      const uiPayload = buildPackingPayload();
      const packingGroupUpdates = {};
      (uiPayload.packingGroups || []).forEach((g) => {
        if (!g?.packingGroupId) return;
        const next = {};
        const dims = g.dimensions;
        const length = Number(dims?.length || 0);
        const width = Number(dims?.width || 0);
        const height = Number(dims?.height || 0);
        if (length > 0 && width > 0 && height > 0) {
          next.dimensions = dims;
        }
        const weightVal = Number(g?.weight?.value ?? g?.weight?.amount ?? g?.weight ?? 0);
        if (weightVal > 0) {
          next.weight = g.weight;
        }
        const boxes = Number(g?.boxes || 0);
        if (boxes > 0) {
          next.boxes = boxes;
        }
        if (Array.isArray(g?.perBoxDetails) && g.perBoxDetails.length) {
          next.perBoxDetails = g.perBoxDetails;
        }
        if (Array.isArray(g?.perBoxItems) && g.perBoxItems.length) {
          next.perBoxItems = g.perBoxItems;
        }
        if (g?.contentInformationSource) {
          next.contentInformationSource = g.contentInformationSource;
        }
        if (g?.packMode) {
          next.packMode = g.packMode;
        }
        if (Object.keys(next).length) {
          packingGroupUpdates[String(g.packingGroupId)] = next;
        }
      });
      const resetSnapshot = false;
      const { data, error } = await invokeAuthedFunction('fba-plan-step1b', {
        request_id: requestId,
        inbound_plan_id: inboundPlanId,
        amazon_integration_id: plan?.amazonIntegrationId || plan?.amazon_integration_id || null,
        packing_option_id: selectedPackingOptionId || packingOptionId || null,
        include_placement: true,
        reset_snapshot: resetSnapshot,
        packing_group_updates: packingGroupUpdates
      });
      let resolvedData = data;
      if (error) {
        const parsed = await extractFunctionInvokeError(error);
        if (parsed?.payload && typeof parsed.payload === 'object') {
          resolvedData = {
            ...parsed.payload,
            ...(parsed?.status ? { status: parsed.status } : {}),
            ...(parsed?.message ? { message: parsed.message } : {})
          };
        } else {
          throw new Error(parsed?.message || error?.message || 'Could not reload packing groups.');
        }
      }
      const responseData = resolvedData && typeof resolvedData === 'object' ? resolvedData : {};
      if (Array.isArray(responseData?.packingOptions)) setPackingOptions(sanitizePackingOptions(responseData.packingOptions));
      if (['PACKING_GROUPS_NOT_READY', 'PACKING_GROUPS_PROCESSING'].includes(responseData?.code)) {
        const trace = responseData?.traceId || responseData?.trace_id || null;
        const msg = responseData?.message || wizardCopy.packingWait;
        setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
        setInboundPlanMissing(true);
        if (!hasRealPackGroups(packGroups)) {
          setPackGroups([]); // nu afișăm nimic local dacă nu avem packing groups reale
        }
        return { ok: false, code: responseData?.code || 'PACKING_GROUPS_NOT_READY', message: msg, traceId: trace };
      }
      if (['PACKING_OPTIONS_NOT_READY', 'PACKING_OPTIONS_PROCESSING'].includes(responseData?.code)) {
        const trace = responseData?.traceId || responseData?.trace_id || null;
        const msg = responseData?.message || wizardCopy.inboundPlanEmpty;
        setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
        setInboundPlanMissing(true);
        if (!hasRealPackGroups(packGroups)) {
          setPackGroups([]);
        }
        return { ok: false, code: responseData?.code || 'PACKING_OPTIONS_NOT_READY', message: msg, traceId: trace };
      }
      if (responseData?.code === 'PLACEMENT_ALREADY_ACCEPTED') {
        const cachedGroups = Array.isArray(responseData?.packingGroups) ? responseData.packingGroups : [];
        const trace = responseData?.traceId || responseData?.trace_id || null;
        if (!cachedGroups.length) {
          const msg =
            'Plan is already ACCEPTED in Amazon and packing groups cannot be regenerated. Retry only if you have saved packing groups.';
          setPackingReadyError(trace ? `${msg} · TraceId ${trace}` : msg);
          return { ok: false, code: 'PLACEMENT_ALREADY_ACCEPTED', message: msg, traceId: trace };
        }
        setPackingReadyError('Plan is already ACCEPTED in Amazon; using saved packing groups.');
        if (responseData?.packingOptionId) setPackingOptionId(responseData.packingOptionId);
        if (responseData?.placementOptionId) setPlacementOptionId(responseData.placementOptionId);
        const normalized = normalizePackGroups(cachedGroups);
        setPackGroupsLoaded(true);
        setPackGroups((prev) => mergePackGroups(prev, normalized));
        if (Array.isArray(responseData?.shipments)) setShipments(responseData.shipments);
        setPlanError('');
        if (Array.isArray(responseData?.quantityMismatches) && responseData.quantityMismatches.length) {
          const first = responseData.quantityMismatches[0];
          const msg = `Quantities differ between UI and Amazon (${first.sku}: Amazon ${first.amazon} vs confirmed ${first.confirmed}).`;
          setPackGroups([]); // nu folosi grupuri Amazon cu cantități vechi
          setPackingReadyError(msg);
          return { ok: false, code: 'PACKING_QTY_MISMATCH', quantityMismatches: responseData.quantityMismatches };
        }
        return { ok: true, code: 'PLACEMENT_ALREADY_ACCEPTED', packingOptionId: responseData?.packingOptionId || null, packingGroups: normalized };
      }
      if (responseData?.packingOptionId) setPackingOptionId(responseData.packingOptionId);
      if (responseData?.placementOptionId) setPlacementOptionId(responseData.placementOptionId);
      if (Array.isArray(responseData?.packingOptions)) setPackingOptions(sanitizePackingOptions(responseData.packingOptions));
      if (Array.isArray(responseData?.packingGroups)) {
        const normalized = normalizePackGroups(responseData.packingGroups);
        const filtered = normalized.filter((g) => g.packingGroupId && !isFallbackId(g.packingGroupId));
        if (!filtered.length) {
          const msg = 'Packing groups are missing from Amazon response. Try again in a few seconds.';
          setPackingReadyError(msg);
          return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: msg };
        } else {
          setPackGroupsLoaded(true);
          setInboundPlanMissing(false);
          setStep1SaveError('');
          setPlanError('');
        }
          // combinăm grupurile noi de la Amazon cu valorile introduse în UI (dimensiuni/greutate) ca să nu le pierdem
          setPackGroups((prev) => mergePackGroups(prev, filtered));
          setPackingReadyError('');
          // sincronizează packingOptionId în plan ca să nu trimitem un ID vechi la setPackingInformation
          setPlan((prev) => ({
            ...prev,
            packingOptionId: responseData?.packingOptionId || prev?.packingOptionId || null,
            packing_option_id: responseData?.packingOptionId || prev?.packing_option_id || null,
            inboundPlanId,
            inbound_plan_id: inboundPlanId
          }));
          if (Array.isArray(responseData?.quantityMismatches) && responseData.quantityMismatches.length) {
            const first = responseData.quantityMismatches[0];
            const msg = `Quantities differ between UI and Amazon (${first.sku}: Amazon ${first.amazon} vs confirmed ${first.confirmed}).`;
            setPackGroups([]); // evităm afișarea grupurilor cu cantități vechi
            setPackingReadyError(msg);
            return { ok: false, code: 'PACKING_QTY_MISMATCH', quantityMismatches: responseData.quantityMismatches };
          }
          return { ok: true, packingOptionId: responseData?.packingOptionId || null, packingGroups: filtered };
        }
        if (Array.isArray(responseData?.shipments)) setShipments(responseData.shipments);
        setPlanError('');
        return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: 'Packing groups are missing from Amazon response.' };
    };

    try {
      // Reîncercări agresive dacă Amazon întârzie packingGroupIds.
      const maxAttempts = 8;
      for (let i = 1; i <= maxAttempts; i += 1) {
        const res = await attemptFetch();
        if (res?.ok) return res;
        const transientCodes = [
          'PACKING_GROUPS_NOT_READY',
          'PACKING_GROUPS_PROCESSING',
          'PACKING_OPTIONS_NOT_READY',
          'PACKING_OPTIONS_PROCESSING',
          'PLAN_STILL_CREATING'
        ];
        if (!transientCodes.includes(res?.code)) return res;
        // backoff mic înainte de următoarea încercare
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 800 * i));
      }
      return { ok: false, code: 'PACKING_GROUPS_NOT_READY', message: 'Amazon did not return packing groups after multiple attempts.' };
    } catch (e) {
      const msg = e?.message || 'Could not reload packing groups.';
      setPackingReadyError(msg);
      return { ok: false, code: 'ERROR', message: msg };
    } finally {
      setPackingRefreshLoading(false);
      packingRefreshLockRef.current = { inFlight: false, planId: null };
    }
  }

  useEffect(() => {
    if (currentStep !== '1') return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (allowNoInboundPlan && !inboundPlanId) return;
    if (!inboundPlanId || !requestId) return;
    if (packGroupsPreviewError) return;
    if (Array.isArray(packGroupsPreview) && packGroupsPreview.length) return;
    if (packGroupsPreviewLoading || packingPreviewFetchRef.current) return;
    packingPreviewFetchRef.current = true;
    refreshPackingGroupsPreview();
  }, [
    currentStep,
    packGroupsPreview,
    packGroupsPreviewLoading,
    packGroupsPreviewError,
    resolveInboundPlanId,
    resolveRequestId
  ]);

  const buildShipmentConfigs = () => {
    if (!Array.isArray(packGroups)) return [];
    const inboundPlanId = resolveInboundPlanId();
    if (allowNoInboundPlan && !inboundPlanId) return [];
    const windowStart = normalizeShipDate(shipmentMode?.deliveryWindowStart) || null;
    const windowEnd = normalizeShipDate(shipmentMode?.deliveryWindowEnd) || null;
    const usePallets = shipmentMode?.method && shipmentMode.method !== 'SPD';
    const footprint = derivedPalletSummary;
    const palletPayload = usePallets
      ? [
          {
            quantity: Number(palletDetails.quantity || footprint?.pallets || 1),
            dimensions: {
              length: Number((((palletDetails.length || footprint?.length || 120) / 2.54)).toFixed(2)),
              width: Number((((palletDetails.width || footprint?.width || 100) / 2.54)).toFixed(2)),
              height: Number((((palletDetails.height || footprint?.height || 120) / 2.54)).toFixed(2)),
              unit: 'IN'
            },
            weight: {
              value: Number(
                (((palletDetails.weight || footprint?.weightPerPallet || derivedWeightKg || 25) || 0) * 2.20462).toFixed(2)
              ),
              unit: 'LB'
            },
            stackability: palletDetails.stackability || footprint?.stackability || 'STACKABLE'
          }
        ]
      : null;
    const freightInformation = usePallets
      ? {
          declaredValue: {
            amount: Number(palletDetails.declaredValue || 1),
            code: palletDetails.declaredValueCurrency || 'EUR'
          },
          freightClass: palletDetails.freightClass || footprint?.freightClass || 'FC_XX'
        }
      : null;

    const shipmentIdForGroup = (g, idx) => {
      if (g?.shipmentId || g?.shipment_id) return g.shipmentId || g.shipment_id;
      const fromApi = Array.isArray(shipments) ? shipments?.[idx] || shipments?.[0] : null;
      if (fromApi?.shipmentId || fromApi?.id) return fromApi.shipmentId || fromApi.id;
      return `s-${idx + 1}`;
    };

    if (usePallets) {
      const shipmentCandidates = Array.isArray(shipments) && shipments.length
        ? shipments
        : Array.from(
            new Map(
              packGroups.map((group, idx) => {
                const shipmentId = shipmentIdForGroup(group, idx);
                return [shipmentId, { shipmentId, id: shipmentId, units: Number(group?.units || 0) || 0 }];
              })
            ).values()
          );
      const normalizedShipments = shipmentCandidates
        .map((shipment, idx) => {
          const shipmentId = String(shipment?.shipmentId || shipment?.id || `s-${idx + 1}`).trim();
          if (!shipmentId) return null;
          const units = Number(shipment?.units || 0);
          return {
            shipmentId,
            units: Number.isFinite(units) && units > 0 ? units : 0,
            index: idx
          };
        })
        .filter(Boolean);
      if (!normalizedShipments.length) return [];
      const totalPalletQty = Math.max(1, Number(palletDetails.quantity || footprint?.pallets || 1));
      const palletCounts = splitIntegerProportionally(
        totalPalletQty,
        normalizedShipments.map((shipment) => shipment.units || 1)
      );
      return normalizedShipments.map((shipment, idx) => {
        const shId = shipment.shipmentId;
        const assignedPallets = Math.max(1, Number(palletCounts[idx] || 0));
        const manualReady = readyWindowByShipment?.[shId] || {};
        const manualStart = normalizeShipDate(manualReady.start) || null;
        const manualEnd = normalizeShipDate(manualReady.end) || null;
        return {
          shipmentId: shId,
          packages: [],
          pallets: [
            {
              ...palletPayload?.[0],
              quantity: assignedPallets
            }
          ],
          freightInformation,
          readyToShipWindow: manualStart || windowStart || windowEnd
            ? {
                start: manualStart
                  ? normalizeReadyStartIso(manualStart)
                  : windowStart
                    ? normalizeReadyStartIso(windowStart)
                    : null,
                end: manualEnd
                  ? normalizeReadyStartIso(manualEnd)
                  : windowEnd
                    ? normalizeReadyStartIso(windowEnd)
                    : null
              }
            : null,
          palletSummary: {
            quantity: assignedPallets,
            lengthCm: Number(palletDetails.length || footprint?.length || 120),
            widthCm: Number(palletDetails.width || footprint?.width || 80),
            heightCm: Number(palletDetails.height || footprint?.height || 120),
            weightKg: Number(palletDetails.weight || footprint?.weightPerPallet || derivedWeightKg || 25),
            stackability: palletDetails.stackability || footprint?.stackability || 'STACKABLE'
          }
        };
      });
    }

    const byShipment = new Map();
    packGroups.forEach((g, idx) => {
      const { planGroup } = resolvePlanGroupForPackGroup(g);
      const planBoxesRaw = Array.isArray(planGroup?.boxes) ? planGroup.boxes : [];
      const planBoxItems = Array.isArray(planGroup?.boxItems) ? planGroup.boxItems : [];
      const boxContentSummary = (boxIdx) => {
        const raw = planBoxItems?.[boxIdx] || {};
        const entries = Object.entries(raw).filter(([, qty]) => Number(qty || 0) > 0);
        const units = entries.reduce((sum, [, qty]) => sum + (Number(qty || 0) || 0), 0);
        return {
          contentUnits: units > 0 ? units : null,
          contentSkuCount: entries.length > 0 ? entries.length : null
        };
      };
      const planPerBoxDetails = planBoxesRaw
        .map((box) => {
          const length = getPositiveNumber(box?.length_cm ?? box?.length);
          const width = getPositiveNumber(box?.width_cm ?? box?.width);
          const height = getPositiveNumber(box?.height_cm ?? box?.height);
          const weight = getPositiveNumber(box?.weight_kg ?? box?.weight);
          if (!length || !width || !height || !weight) return null;
          return { length, width, height, weight };
        })
        .filter(Boolean);
      const dims = getSafeDims(g.boxDimensions) || (planPerBoxDetails[0] ? {
        length: planPerBoxDetails[0].length,
        width: planPerBoxDetails[0].width,
        height: planPerBoxDetails[0].height
      } : null);
      const weight = getPositiveNumber(g.boxWeight) || (planPerBoxDetails[0] ? planPerBoxDetails[0].weight : null);
      const fallbackBoxCount = planBoxesRaw.length > 0 ? planBoxesRaw.length : null;
      const boxCount = Math.max(1, Number(g.boxes) || fallbackBoxCount || 1);
      const hasPackageSpec = Boolean(dims && weight);
      const pkg = hasPackageSpec
        ? {
            dimensions: { length: dims.length, width: dims.width, height: dims.height, unit: "CM" },
            weight: { value: weight, unit: "KG" }
          }
        : null;
      const isMultiple = String(g?.packMode || '').toLowerCase() === 'multiple';
      const perBoxDetails = Array.isArray(g?.perBoxDetails) && g.perBoxDetails.length
        ? g.perBoxDetails
        : planPerBoxDetails;
      const perBoxPackages = isMultiple && perBoxDetails.length
        ? perBoxDetails
            .map((box, boxIdx) => {
              const perDims = getSafeDims(box);
              const perWeight = getPositiveNumber(box?.weight);
              if (!perDims || !perWeight) return null;
              const summary = boxContentSummary(boxIdx);
              return {
                dimensions: { length: perDims.length, width: perDims.width, height: perDims.height, unit: "CM" },
                weight: { value: perWeight, unit: "KG" },
                ...(summary.contentUnits ? { contentUnits: summary.contentUnits } : {}),
                ...(summary.contentSkuCount ? { contentSkuCount: summary.contentSkuCount } : {})
              };
            })
            .filter(Boolean)
        : [];
      const fallbackPerBoxPackages = !perBoxPackages.length && planPerBoxDetails.length
        ? planPerBoxDetails.map((box, boxIdx) => {
            const summary = boxContentSummary(boxIdx);
            return {
              dimensions: { length: box.length, width: box.width, height: box.height, unit: "CM" },
              weight: { value: box.weight, unit: "KG" },
              ...(summary.contentUnits ? { contentUnits: summary.contentUnits } : {}),
              ...(summary.contentSkuCount ? { contentSkuCount: summary.contentSkuCount } : {})
            };
          })
        : [];
      const packingGroupId = g.packingGroupId || null;
      if (!packingGroupId) return;
      const shId = shipmentIdForGroup(g, idx);
      const manualReady = readyWindowByShipment?.[shId] || {};
      const manualStart = normalizeShipDate(manualReady.start) || null;
      const manualEnd = normalizeShipDate(manualReady.end) || null;
      const requireEnd = isLtlFtl(shipmentMode?.method);
      const existing = byShipment.get(shId) || {
        shipmentId: shId,
        packages: [],
        pallets: null,
        freightInformation: null,
        readyToShipWindow: manualStart || windowStart || windowEnd ? {
          start: manualStart ? normalizeReadyStartIso(manualStart) : windowStart ? normalizeReadyStartIso(windowStart) : null,
          ...(requireEnd
            ? {
                end: manualEnd
                  ? normalizeReadyStartIso(manualEnd)
                  : windowEnd
                    ? normalizeReadyStartIso(windowEnd)
                    : null
              }
            : {})
        } : null
      };
      if (usePallets) {
        existing.pallets = palletPayload;
        existing.freightInformation = freightInformation;
      } else if (perBoxPackages.length) {
        existing.packages.push(...perBoxPackages);
      } else if (fallbackPerBoxPackages.length) {
        existing.packages.push(...fallbackPerBoxPackages);
      } else if (pkg) {
        for (let i = 0; i < boxCount; i += 1) {
          const summary = boxContentSummary(i);
          existing.packages.push({
            ...pkg,
            ...(summary.contentUnits ? { contentUnits: summary.contentUnits } : {}),
            ...(summary.contentSkuCount ? { contentSkuCount: summary.contentSkuCount } : {})
          });
        }
      }
      byShipment.set(shId, existing);
    });

    return Array.from(byShipment.values());
  };

  const resolveContactInformation = () => {
    const candidates = [
      plan?.sourceAddress,
      plan?.shipFrom,
      plan?.shipFrom?.address,
      shipments?.[0]?.shipFromAddress,
      shipments?.[0]?.sourceAddress,
      shipments?.[0]?.source?.address
    ].filter(Boolean);

    const normalize = (src = {}) => {
      const name =
        src.name ||
        src.contactName ||
        src.companyName ||
        src.person ||
        null;
      const phoneNumber =
        src.phoneNumber ||
        src.phone ||
        src.phone_number ||
        null;
      const email =
        src.email ||
        src.emailAddress ||
        src.email_address ||
        null;
      if (!name || !phoneNumber || !email) return null;
      return {
        name: String(name).trim(),
        phoneNumber: String(phoneNumber).trim(),
        email: String(email).trim()
      };
    };

    for (const src of candidates) {
      const info = normalize(src);
      if (info) return info;
    }
    return null;
  };

  const mergeShipFromWithSource = (shipFrom, sourceAddress) => {
    if (!shipFrom || typeof shipFrom !== 'object' || !sourceAddress) return shipFrom;
    return {
      ...shipFrom,
      phoneNumber: shipFrom.phoneNumber || sourceAddress.phoneNumber || null,
      email: shipFrom.email || sourceAddress.email || null,
      name: shipFrom.name || sourceAddress.name || null
    };
  };

  const fetchCooldownRef = useRef(0);
  const step2InitRef = useRef(false);

  async function fetchShippingOptions({ force = false } = {}) {
    if (typeof window === 'undefined') return; // rulează doar în browser
    if (shippingFetchLockRef.current.inFlight) return Promise.resolve();
    const now = Date.now();
    if (!force && now - fetchCooldownRef.current < 2000) return Promise.resolve(); // hard throttle 1 call / 2s
    fetchCooldownRef.current = now;
    const inboundPlanId = resolveInboundPlanId();
    let placementOptId =
      placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setShippingError(tt('missingIdsError', 'Missing inboundPlanId or requestId; reload the plan.'));
      return;
    }
    const missingReady = (shipments || []).some((sh) => {
      const shKey = String(sh?.id || sh?.shipmentId || '').trim();
      const rw = readyWindowByShipment?.[shKey] || {};
      if (!shKey || !rw.start) return true;
      return false;
    });
    if (missingReady) {
      if (skipReadyWindowValidationAfterPickup) {
        setShippingError('');
        return;
      }
      setShippingError(
        t('Fba.step2.deliveryWindowRequired') === 'Fba.step2.deliveryWindowRequired'
          ? 'Complete “Ready to ship” (start) for all shipments before requesting carrier options.'
          : t('Fba.step2.deliveryWindowRequired')
      );
      return;
    }

    if (!Array.isArray(packGroups) || packGroups.length === 0) {
      setShippingError(
        tt(
          'step2MissingPackingGroups',
          'We do not have packing groups yet. Run Step 1b again to get packing options before shipping.'
        )
      );
      return;
    }

    const missingPackingGroupId = (packGroups || []).some((g) => !g.packingGroupId || isFallbackId(g.packingGroupId) || isFallbackId(g.id));
    if (missingPackingGroupId) {
      setShippingError(
        tt(
          'step2MissingPackingGroupId',
          'Packing groups do not have a valid packingGroupId from Amazon. Run Step 1b again to get packing options.'
        )
      );
      return;
    }

    // placementOptionId poate lipsi; îl generează backend-ul în Step 2 (generatePlacementOptions)

    if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
      const palletError = validatePalletDetails();
      if (palletError) {
        setShippingError(palletError);
        return;
      }
    } else if (!palletOnlyMode) {
      // guard: avem nevoie de greutate + dimensiuni pentru toate grupurile
      const missingPack = (packGroups || []).find((g) => {
        const isMultiple = String(g?.packMode || '').toLowerCase() === 'multiple';
        if (isMultiple) {
          const perBox = Array.isArray(g?.perBoxDetails) ? g.perBoxDetails : [];
          if (!perBox.length) return true;
          return perBox.some((b) => {
            const perDims = getSafeDims(b);
            const perWeight = getPositiveNumber(b?.weight);
            return !(perDims && perWeight);
          });
        }
        const dims = getSafeDims(g.boxDimensions);
        const w = getPositiveNumber(g.boxWeight);
        return !(dims && w);
      });
      if (missingPack) {
        if (!import.meta.env.PROD) {
          console.log('Step2 missing pack details', (packGroups || []).map((g) => ({
            packingGroupId: g?.packingGroupId || g?.id || null,
            packMode: g?.packMode || null,
            perBoxDetailsCount: Array.isArray(g?.perBoxDetails) ? g.perBoxDetails.length : 0,
            boxDimensions: g?.boxDimensions || null,
            boxWeight: g?.boxWeight ?? null
          })));
        }
        setShippingError(
          t('Fba.step2.fillDimensionsBeforeRates') === 'Fba.step2.fillDimensionsBeforeRates'
            ? 'Fill in weight and dimensions (L/W/H) for all boxes before requesting rates.'
            : t('Fba.step2.fillDimensionsBeforeRates')
        );
        return;
      }
    }
    const windowError = validateDeliveryWindow(false);
    if (windowError) {
      setShippingError(windowError);
      return;
    }

    const configs = buildShipmentConfigs();
    const missingReadyConfirm = configs.some((cfg) => {
      const win = cfg?.readyToShipWindow || {};
      if (!win.start) return true;
      return false;
    });
    if (missingReadyConfirm) {
      setShippingError(
        t('Fba.step2.addReadyToShipBeforeConfirm') === 'Fba.step2.addReadyToShipBeforeConfirm'
          ? 'Add “Ready to ship” (start) for each shipment before confirmation.'
          : t('Fba.step2.addReadyToShipBeforeConfirm')
      );
      return;
    }
    const contactInformation = resolveContactInformation();
    if (shipmentMode?.method && shipmentMode.method !== 'SPD' && !contactInformation) {
      setShippingError('Contact information is required for pallet shipments. Complete ship-from contact name, phone and email first.');
      return;
    }
    const globalReadyStart =
      Object.values(readyWindowByShipment || {}).find((w) => w?.start)?.start || null;
    const globalReadyEnd =
      Object.values(readyWindowByShipment || {}).find((w) => w?.end)?.end || null;
    const requestKey = JSON.stringify({
      requestId,
      inboundPlanId,
      placementOptId,
      packingOptionId: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
      shippingMode: shipmentMode?.method || null,
      shipDate: normalizeShipDate(shipmentMode?.deliveryDate) || null,
      deliveryWindowStart: normalizeShipDate(shipmentMode?.deliveryWindowStart) || null,
      deliveryWindowEnd: normalizeShipDate(shipmentMode?.deliveryWindowEnd) || null,
      configsCount: configs.length,
      selectedTransportationOptionId
    });
    const now2 = Date.now();
    if (
      requestKey === shippingFetchLockRef.current.lastKey &&
      now2 - shippingFetchLockRef.current.lastAt < 4000
    ) {
      return Promise.resolve();
    }
    shippingFetchLockRef.current.inFlight = true;
    setShippingLoading(true);
    setShippingError('');
    try {
      // log local pentru debug (nu trimite date sensibile)
      if (!import.meta.env.PROD) {
        console.log('Step2 invoke fba-step2-confirm-shipping', {
          requestId,
          inboundPlanId,
          placementOptionId: placementOptId,
          configsCount: configs.length,
          selectedTransportationOptionId
        });
      }
      const { data: json, error } = await supabase.functions.invoke("fba-step2-confirm-shipping", {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptId,
          packing_option_id: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
          shipping_mode: shipmentMode?.method || null,
          ...(contactInformation ? { contact_information: contactInformation } : {}),
          shipment_transportation_configurations: configs,
          ready_to_ship_window: globalReadyStart
            ? {
                start: globalReadyStart,
                ...(globalReadyEnd ? { end: globalReadyEnd } : {})
              }
            : null,
          ship_date: normalizeShipDate(shipmentMode?.deliveryDate) || null,
          delivery_window_start: normalizeShipDate(shipmentMode?.deliveryWindowStart) || null,
          delivery_window_end: normalizeShipDate(shipmentMode?.deliveryWindowEnd) || null,
          transportation_option_id: selectedTransportationOptionId,
          auto_confirm_placement: false,
          confirm: false
        }
      });
      if (error) throw error;
      if (json?.error) {
        if (
          json?.code === 'SHIPMENTS_PENDING' ||
          json?.code === 'SHIPMENTS_PENDING_FOR_GENERATE_TRANSPORT' ||
          json?.code === 'TRANSPORTATION_OPTIONS_PENDING' ||
          json?.code === 'TRANSPORTATION_OPTIONS_UNKNOWN_STATE'
        ) {
          const maxRetries = 5;
          const nextDelay = Number(json?.retryAfterMs || 5000);
          const attempt = shippingRetryRef.current + 1;
          if (attempt <= maxRetries) {
            shippingRetryRef.current = attempt;
            setShippingError(
              tp('Wizard.step2AmazonProcessingRetry', { attempt, maxRetries })
            );
            if (shippingRetryTimerRef.current) clearTimeout(shippingRetryTimerRef.current);
            shippingRetryTimerRef.current = setTimeout(() => {
              fetchShippingOptions();
            }, nextDelay);
            return;
          }
          setShippingError(
            tt('step2AmazonProcessingManualRetry', 'Amazon is still processing options. Retry manually in a few seconds.')
          );
          return;
        }
        setShippingError(json.error);
        setShippingOptions([]);
        setShippingSummary(null);
        return;
      }
      setShippingOptions(aggregateTransportationOptions(json.options || [], json.summary || null));
      setShippingSummary(json.summary || null);
      if (json?.selectedTransportationOptionId) {
        setSelectedTransportationOptionId(json.selectedTransportationOptionId);
      }
      shippingRetryRef.current = 0;
      if (json?.summary?.alreadyConfirmed) {
        setShippingConfirmed(true);
        setCarrierTouched(true);
        setCompletedSteps((prev) => (prev.includes('2') ? prev : [...prev, '2']));
      }
      if (Array.isArray(json.shipments) && json.shipments.length) {
        const fallbackShipments = deriveShipmentsFromPacking(shipments);
        const configByShipment = new Map(
          (configs || []).map((cfg) => [String(cfg?.shipmentId || ''), cfg]).filter(([id]) => Boolean(id))
        );
        const fallbackById = new Map();
        (fallbackShipments || []).forEach((sh, idx) => {
          const id = sh?.id || sh?.shipmentId || sh?.packingGroupId || null;
          if (id) fallbackById.set(String(id), sh);
          if (sh?.shipmentId) fallbackById.set(String(sh.shipmentId), sh);
          fallbackById.set(`index:${idx}`, sh);
        });
        setShipments(
          json.shipments.map((s, idx) => {
            const key = String(s?.id || s?.shipmentId || "");
            const fb =
              fallbackById.get(key) ||
              fallbackById.get(String(s?.packingGroupId || "")) ||
              fallbackById.get(`index:${idx}`) ||
              {};
          return {
            ...fb,
            ...s,
            units: resolveShipmentUnits(s, fb, idx, fallbackShipments),
            weight: s.weight ?? fb.weight ?? null,
            palletQuantity:
              s?.palletQuantity ??
              configByShipment.get(key)?.palletSummary?.quantity ??
              fb?.palletQuantity ??
              null,
            palletSummary:
              s?.palletSummary ||
              configByShipment.get(key)?.palletSummary ||
              fb?.palletSummary ||
              null,
            source: "api"
          };
        })
      );
        const resolvedFbaFromResponse = resolveFbaShipmentIdFromList(json.shipments);
        if (resolvedFbaFromResponse) {
          setPlan((prev) => ({
            ...prev,
            fba_shipment_id: resolvedFbaFromResponse
          }));
          if (requestId) {
            try {
              const { error: persistErr } = await supabase
                .from('prep_requests')
                .update({ fba_shipment_id: resolvedFbaFromResponse })
                .eq('id', requestId);
              if (persistErr) {
                console.warn('persist fba_shipment_id failed', { requestId, error: persistErr });
              }
            } catch (persistErr) {
              console.warn('persist fba_shipment_id threw', { requestId, error: persistErr });
            }
          }
        }
      }
    } catch (e) {
      const parsed = await extractFunctionInvokeError(e);
      if (parsed?.code === 'INBOUND_PLAN_MISMATCH') {
        setSelectedTransportationOptionId(null);
        setShippingOptions([]);
        setShippingSummary(null);
        setPlanLoaded(false); // trigger reload so UI syncs requestId/inboundPlanId
        setShippingError(
          tt('step2InboundPlanChanged', 'Inbound plan changed on the server. Reloading the plan, then try Step 2 again.')
        );
        return;
      }
      const detail = parsed?.message || tt('step2LoadOptionsFailed', 'Failed to load shipping options');
      console.error("fetchShippingOptions failed", e);
      setShippingError(detail);
    } finally {
      setShippingLoading(false);
      shippingFetchLockRef.current.lastKey = requestKey;
      shippingFetchLockRef.current.lastAt = Date.now();
      shippingFetchLockRef.current.inFlight = false;
    }
  };

  const ensureOptionsAvailable = async () => {
    const countBefore = Array.isArray(shippingOptions) ? shippingOptions.length : 0;
    if (!countBefore) {
      await fetchShippingOptions({ force: true });
    }
    const opts = Array.isArray(shippingOptionsRef.current) ? shippingOptionsRef.current : [];
    if (!opts.length) {
      setShippingError(
        tt('step2NoOptionsYet', 'There are no carrier options yet. Complete the required data and try again.')
      );
      return false;
    }
    if (!selectedTransportationOptionId && opts.length === 1) {
      const only = opts[0];
      setSelectedTransportationOptionId(
        only.id || only.transportationOptionId || only.optionId || only.raw?.transportationOptionId || null
      );
    }
    return true;
  };

  useEffect(() => {
    if (!skipReadyWindowValidationAfterPickup) return;
    if (!shippingError) return;
    if (/ready to ship|opțiuni de curier|shipment/i.test(String(shippingError))) {
      setShippingError('');
    }
  }, [skipReadyWindowValidationAfterPickup, shippingError]);

  useEffect(() => {
    if (!selectedTransportationOptionId) return;
    const exists = (shippingOptions || []).some((opt) => opt?.id === selectedTransportationOptionId);
    if (exists) return;
    const signature = selectedOptionSignatureRef.current;
    if (signature) {
      const match = (shippingOptions || []).find((opt) => {
        const optMode = normalizeOptionMode(opt.mode || opt.shippingMode);
        const optSolution = String(opt?.shippingSolution || opt?.raw?.shippingSolution || '').toUpperCase();
        const optCarrierName = String(opt?.raw?.carrier?.name || opt?.carrierName || '').trim().toUpperCase();
        const optCarrierCode = String(opt?.raw?.carrier?.alphaCode || '').trim().toUpperCase();
        return (
          Boolean(opt?.partnered) === signature.partnered &&
          (signature.mode ? optMode === signature.mode : true) &&
          (signature.shippingSolution ? optSolution === signature.shippingSolution : true) &&
          (signature.carrierCode
            ? optCarrierCode === signature.carrierCode
            : signature.carrierName
              ? optCarrierName === signature.carrierName
              : true)
        );
      });
      if (match?.id) {
        setSelectedTransportationOptionId(match.id);
        return;
      }
    }
    setSelectedTransportationOptionId(null);
  }, [shippingOptions, selectedTransportationOptionId]);

  useEffect(() => {
    if (currentStep !== '2') return;
    if (selectedTransportationOptionId) return;
    const opts = Array.isArray(shippingOptions) ? shippingOptions : [];
    if (!opts.length) return;
    const pick =
      (forcePartneredOnly ? opts.find((o) => Boolean(o?.partnered)) : null) ||
      opts.find((o) => Boolean(o?.partnered) && normalizeOptionMode(o?.mode || o?.shippingMode) === 'SPD') ||
      opts.find((o) => Boolean(o?.partnered)) ||
      opts.find((o) => !o?.partnered && normalizeOptionMode(o?.mode || o?.shippingMode) === 'SPD') ||
      opts.find((o) => !o?.partnered) ||
      opts[0];
    if (!pick?.id) return;
    setSelectedTransportationOptionId(pick.id);
    const nextMethod = normalizeOptionMode(pick.mode || pick.shippingMode);
    selectedOptionSignatureRef.current = {
      mode: nextMethod || null,
      partnered: Boolean(pick.partnered),
      shippingSolution: String(pick?.shippingSolution || pick?.raw?.shippingSolution || '').toUpperCase(),
      carrierName: String(pick?.raw?.carrier?.name || pick?.carrierName || '').trim().toUpperCase(),
      carrierCode: String(pick?.raw?.carrier?.alphaCode || '').trim().toUpperCase()
    };
    setShipmentMode((prev) => ({
      ...prev,
      method: nextMethod || prev.method,
      carrier: {
        partnered: Boolean(pick.partnered),
        name: pick.carrierName || '',
        rate: typeof pick.charge === 'number' ? pick.charge : prev?.carrier?.rate ?? null
      }
    }));
    setCarrierTouched(false);
  }, [currentStep, shippingOptions, selectedTransportationOptionId, forcePartneredOnly]);

  const confirmShippingOptions = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const placementOptId = placementOptionId || plan?.placementOptionId || plan?.placement_option_id || null;
    if (!inboundPlanId || !requestId) {
      setShippingError(tt('step2ConfirmMissingIds', 'Missing inboundPlanId or requestId to confirm shipping.'));
      return;
    }
    await ensureOptionsAvailable();
    let latestOptions = Array.isArray(shippingOptionsRef.current) ? shippingOptionsRef.current : [];
    let selectedOpt = latestOptions.find((opt) => opt?.id === selectedTransportationOptionId);
    // Refresh only if current selection is missing from local options.
    // This avoids a full options re-fetch on every confirm click.
    if (!selectedOpt) {
      await fetchShippingOptions({ force: true });
      latestOptions = Array.isArray(shippingOptionsRef.current) ? shippingOptionsRef.current : [];
      selectedOpt = latestOptions.find((opt) => opt?.id === selectedTransportationOptionId);
    }
    if (!selectedOpt) {
      // dacă există doar una, o selectăm automat aici
      if (Array.isArray(latestOptions) && latestOptions.length === 1) {
        selectedOpt = latestOptions[0];
        setSelectedTransportationOptionId(selectedOpt.id || selectedOpt.transportationOptionId || selectedOpt.optionId || null);
      }
    }
    if (!selectedOpt) {
      setShippingError(
        tt('step2SelectCarrierFirst', 'Select a carrier option before confirming.')
      );
      return;
    }
    // Do not force PCP for every shipment just because the currently selected option is PCP.
    // Some placement splits can be mixed (PCP available for one shipment, OYC only for another).
    const enforcePartneredOnly = Boolean(forcePartneredOnly);
    const signature = selectedOptionSignatureRef.current || {};
    const optionShipmentId = String(selectedOpt?.shipmentId || selectedOpt?.raw?.shipmentId || '').trim();
    const shipmentIds = Array.isArray(shipments)
      ? shipments.map((s) => String(s.id || s.shipmentId || '')).filter(Boolean)
      : [];
    if (optionShipmentId && shipmentIds.length && !shipmentIds.includes(optionShipmentId)) {
      setShippingError('Shipping options are stale for this shipment. Regenerate and reselect.');
      await fetchShippingOptions();
      return;
    }
    if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
      const palletError = validatePalletDetails();
      if (palletError) {
        setShippingError(palletError);
        return;
      }
    }
    const windowError = validateDeliveryWindow(true);
    if (windowError) {
      setShippingError(windowError);
      return;
    }
    setShippingConfirming(true);
    setShippingError('');
    try {
      const configs = buildShipmentConfigs();
      if (!configs.length) {
        setShippingConfirming(false);
        setShippingError('Nu există pachete/paleți validați pentru confirmare (lipsește greutate/dimensiuni). Completează packing și reîncearcă.');
        return;
      }
      const shipDateIso = normalizeShipDate(shipmentMode?.deliveryDate) || null;
      let windowStart = normalizeShipDate(shipmentMode?.deliveryWindowStart);
      let windowEnd = normalizeShipDate(shipmentMode?.deliveryWindowEnd);
      const contactInformation = resolveContactInformation();
      if (shipmentMode?.method && shipmentMode.method !== 'SPD' && !contactInformation) {
        setShippingConfirming(false);
        setShippingError('Contact information is required for pallet shipments. Complete ship-from contact name, phone and email first.');
        return;
      }
      const globalReadyStart =
        Object.values(readyWindowByShipment || {}).find((w) => w?.start)?.start || null;
      const globalReadyEnd =
        Object.values(readyWindowByShipment || {}).find((w) => w?.end)?.end || null;
      const { data: json, error } = await supabase.functions.invoke("fba-step2-confirm-shipping", {
        body: {
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          placement_option_id: placementOptId,
          packing_option_id: packingOptionId || plan?.packingOptionId || plan?.packing_option_id || null,
          shipping_mode: shipmentMode?.method || null,
          ...(contactInformation ? { contact_information: contactInformation } : {}),
          shipment_transportation_configurations: configs,
          ready_to_ship_window: globalReadyStart
            ? {
                start: globalReadyStart,
                ...(globalReadyEnd ? { end: globalReadyEnd } : {})
              }
            : null,
          ship_date: shipDateIso,
          delivery_window_start: windowStart,
          delivery_window_end: windowEnd,
          transportation_option_id: selectedTransportationOptionId,
          force_partnered_only: enforcePartneredOnly,
          selected_partnered: signature?.partnered ?? Boolean(selectedOpt?.partnered),
          selected_shipping_solution:
            signature?.shippingSolution ||
            String(selectedOpt?.shippingSolution || selectedOpt?.raw?.shippingSolution || '').toUpperCase() ||
            null,
          selected_carrier_name:
            signature?.carrierName ||
            String(selectedOpt?.raw?.carrier?.name || selectedOpt?.carrierName || '').trim().toUpperCase() ||
            null,
          selected_carrier_code:
            signature?.carrierCode ||
            String(selectedOpt?.raw?.carrier?.alphaCode || '').trim().toUpperCase() ||
            null,
          selected_mode: signature?.mode || normalizeOptionMode(selectedOpt?.mode || selectedOpt?.shippingMode) || null,
          auto_confirm_placement: true,
          confirm: true
        }
      });
      if (error) throw error;
      if (json?.error) {
        if (
          json?.code === 'SHIPMENTS_PENDING' ||
          json?.code === 'SHIPMENTS_PENDING_FOR_CONFIRM' ||
          json?.code === 'TRANSPORTATION_OPTIONS_PENDING' ||
          json?.code === 'TRANSPORTATION_OPTIONS_UNKNOWN_STATE'
        ) {
          setShippingError('Amazon is still processing the shipment. Retry confirmation in a few seconds.');
          return;
        }
        setShippingError(json.error);
        return;
      }
      if (Array.isArray(json.shipments) && json.shipments.length) {
        const fallbackShipments = deriveShipmentsFromPacking(shipments);
        const configByShipment = new Map(
          (configs || []).map((cfg) => [String(cfg?.shipmentId || ''), cfg]).filter(([id]) => Boolean(id))
        );
        const fallbackById = new Map();
        (fallbackShipments || []).forEach((sh, idx) => {
          const id = sh?.id || sh?.shipmentId || sh?.packingGroupId || null;
          if (id) fallbackById.set(String(id), sh);
          if (sh?.shipmentId) fallbackById.set(String(sh.shipmentId), sh);
          fallbackById.set(`index:${idx}`, sh);
        });
        setShipments(
          json.shipments.map((s, idx) => {
            const key = String(s?.id || s?.shipmentId || "");
            const fb =
              fallbackById.get(key) ||
              fallbackById.get(String(s?.packingGroupId || "")) ||
              fallbackById.get(`index:${idx}`) ||
              {};
            return {
              ...fb,
              ...s,
              units: resolveShipmentUnits(s, fb, idx, fallbackShipments),
              weight: s.weight ?? fb.weight ?? null,
              palletQuantity:
                s?.palletQuantity ??
                configByShipment.get(key)?.palletSummary?.quantity ??
                fb?.palletQuantity ??
                null,
              palletSummary:
                s?.palletSummary ||
                configByShipment.get(key)?.palletSummary ||
                fb?.palletSummary ||
                null,
              source: "api"
            };
          })
        );
      }
      setShippingOptions(aggregateTransportationOptions(json.options || [], json.summary || null));
      setShippingSummary(json.summary || null);
      setShippingConfirmed(true);
      setCarrierTouched(true);
      completeAndNext('2');
    } catch (e) {
      const parsed = await extractFunctionInvokeError(e);
      const payload = parsed?.payload || null;
      const code = parsed?.code || payload?.code || null;
      if (
        code === 'TRANSPORTATION_OPTION_NOT_FOUND' ||
        code === 'TRANSPORTATION_OPTION_NOT_AVAILABLE' ||
        code === 'TRANSPORTATION_OPTION_SHIPMENT_MISMATCH'
      ) {
        const refreshed = aggregateTransportationOptions(payload?.availableOptions || [], payload?.summary || null);
        if (refreshed.length) {
          setShippingOptions(refreshed);
        } else {
          await fetchShippingOptions({ force: true });
        }
        setSelectedTransportationOptionId(null);
      }
      if (code === 'INBOUND_PLAN_MISMATCH') {
        setSelectedTransportationOptionId(null);
        setShippingOptions([]);
        setShippingSummary(null);
        setPlanLoaded(false); // trigger reload so UI syncs requestId/inboundPlanId
      }
      const detail = parsed?.message || payload?.error || "Failed to confirm shipping";
      console.error("confirmShippingOptions failed", e);
      setShippingError(detail);
    } finally {
      setShippingConfirming(false);
    }
  }, [
    buildShipmentConfigs,
    completeAndNext,
    forcePartneredOnly,
    packingOptionId,
    placementOptionId,
    plan?.packingOptionId,
    plan?.packing_option_id,
    plan?.placementOptionId,
    plan?.placement_option_id,
    fetchShippingOptions,
    resolveInboundPlanId,
    resolveRequestId,
    shipmentMode?.carrier?.partnered,
    shipmentMode?.deliveryDate,
    shipmentMode?.method,
    shipments,
    readyWindowByShipment
  ]);


  useEffect(() => {
    if (currentStep !== '2') {
      setStep2Loaded(false);
      step2InitRef.current = false;
      return;
    }
    if (!step2InitRef.current) {
      // Rulează o singură dată la intrarea în Step 2, ca să nu șteargă data setată de user.
      setShipmentMode((prev) => ({
        ...prev,
        deliveryDate: '',
        deliveryWindowStart: '',
        deliveryWindowEnd: ''
      }));
      step2InitRef.current = true;
    }
    if (selectedTransportationOptionId) {
      const opt = (shippingOptions || []).find((o) => o?.id === selectedTransportationOptionId);
      const optShipmentId = String(opt?.shipmentId || opt?.raw?.shipmentId || '').trim();
      const ids = Array.isArray(shipments)
        ? shipments.map((s) => String(s.id || s.shipmentId || '')).filter(Boolean)
        : [];
      if (optShipmentId && ids.length && !ids.includes(optShipmentId)) {
        setSelectedTransportationOptionId(null);
      }
    }
    if (step2Loaded) return;
    if (historyMode && shippingConfirmed && (shippingOptions.length || shippingSummary)) {
      setStep2Loaded(true);
      return;
    }
    // nu mai cerem automat opțiuni; așteptăm să existe ready window și click pe “Generează opțiuni curier”
    setStep2Loaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, step2Loaded]);

  // Prefill ready-to-ship windows from shipments (if backend already has them) and ensure map keys exist.
  useEffect(() => {
    setReadyWindowByShipment((prev) => {
      const next = { ...prev };
      (shipments || []).forEach((s) => {
        const shId = String(s?.id || s?.shipmentId || '').trim();
        if (!shId) return;
        if (!next[shId]) {
          const start =
            normalizeShipDate(s?.readyStart || s?.readyToShipWindow?.start || '') ||
            '';
          const end = normalizeShipDate(s?.readyToShipWindow?.end || '') || '';
          next[shId] = { start, end };
        }
      });
      return next;
    });
  }, [shipments]);

  // Reîncărcarea Step 2 este controlată manual; nu mai resetăm automat pe fiecare schimbare de state,
  // ca să evităm buclele de rerender.

  const formatAddress = (addr = {}) => {
    const parts = [
      addr.name,
      addr.addressLine1 || addr.line1 || addr.address,
      addr.city,
      addr.state || addr.region || addr.county,
      addr.postalCode || addr.zip,
      addr.country
    ]
      .filter(Boolean)
      .join(', ');
    return parts || addr.label || addr.raw || '—';
  };

  const deriveShipmentsFromPacking = (baseShipments = []) => {
    if (!Array.isArray(packGroups) || !packGroups.length) return [];
    const baseList = Array.isArray(baseShipments) ? baseShipments : [];
    return packGroups.map((g, idx) => {
      const boxCount = Math.max(1, Number(g.boxes) || 1);
      const dims = g.boxDimensions || {};
      const base = baseList[idx] || baseList[0] || {};
      const boxesDetail = Array.from({ length: boxCount }, () => ({
        groupId: g.id,
        length: dims.length || null,
        width: dims.width || null,
        height: dims.height || null,
        weight: g.boxWeight || null
      }));
      const baseWeight = boxesDetail.reduce(
        (sum, b) => sum + (getPositiveNumber(b.weight) || 0),
        0
      );
      const palletWeight = getPositiveNumber(palletDetails?.weight);
      const palletQty = getPositiveNumber(palletDetails?.quantity);
      const totalWeight = baseWeight || (palletWeight && palletQty ? palletWeight * palletQty : 0);

      return {
        id: g?.shipmentId || g?.shipment_id || base?.shipmentId || base?.id || `s-${idx + 1}`,
        name: base?.name || `Shipment #${idx + 1}`,
        from: base?.from || formatAddress(plan?.shipFrom || {}),
        to: base?.to || plan?.marketplace || plan?.destination || '—',
        boxes: boxCount,
        skuCount: Number(g.skuCount || 0) || 0,
        units: Number(g.units || 0) || 0,
        weight: totalWeight || null,
        capability: base?.capability || 'Standard',
        boxesDetail,
        source: 'local'
      };
    });
  };

  // Dacă nu avem shipments din backend, sau avem doar cele derivate local,
  // recalculăm din packGroups + shipFrom, dar evităm bucla prin setShipments(prev => ...).
  useEffect(() => {
    setShipments((prev) => {
      const hasApiShipments =
        Array.isArray(prev) && prev.some((s) => s.source === 'api' || s.confirmed);
      if (hasApiShipments) return prev;

      const derived = deriveShipmentsFromPacking(prev);
      const currentLocal = JSON.stringify((prev || []).filter((s) => s.source === 'local'));
      const nextLocal = JSON.stringify(derived);

      if (currentLocal === nextLocal) return prev;
      return derived;
    });
  }, [packGroups, plan?.shipFrom, plan?.marketplace]);

  const handleCarrierChange = (carrier) => {
    setCarrierTouched(true);
    setShipmentMode((prev) => ({ ...prev, carrier }));
    invalidateFrom('2');
  };

  const handleModeChange = (mode) => {
    setShipmentMode((prev) => ({ ...prev, method: mode }));
    invalidateFrom('2');
  };

  const normalizeUiMode = (mode) => {
    const up = String(mode || '').toUpperCase();
    if (!up) return null;
    if (up === 'GROUND_SMALL_PARCEL') return 'SPD';
    if (up === 'FREIGHT_LTL') return 'LTL';
    if (up === 'FREIGHT_FTL') return 'FTL';
    return up;
  };

  const normalizeShipmentModeFromData = (mode) => {
    if (!mode) return mode;
    const normalized = { ...mode };
    if (normalized?.method) {
      normalized.method = normalizeUiMode(normalized.method);
    }
    if (normalized?.carrier) {
      const name = String(normalized.carrier.name || '').trim();
      if (normalized.carrier.partnered === false && !name) {
        normalized.carrier = null;
      }
    }
    return normalized;
  };

  const normalizeOptionMode = (mode) => {
    const up = String(mode || '').toUpperCase();
    if (!up) return null;
    if (up === 'GROUND_SMALL_PARCEL') return 'SPD';
    if (up === 'FREIGHT_LTL') return 'LTL';
    if (up === 'FREIGHT_FTL') return 'FTL';
    return up;
  };

  const handleTransportationOptionSelect = (opt) => {
    if (!opt?.id) return;
    setSelectedTransportationOptionId(opt.id);
    const nextMethod = normalizeOptionMode(opt.mode || opt.shippingMode);
    selectedOptionSignatureRef.current = {
      mode: nextMethod || null,
      partnered: Boolean(opt.partnered),
      shippingSolution: String(opt?.shippingSolution || opt?.raw?.shippingSolution || '').toUpperCase(),
      carrierName: String(opt?.raw?.carrier?.name || opt?.carrierName || '').trim().toUpperCase(),
      carrierCode: String(opt?.raw?.carrier?.alphaCode || '').trim().toUpperCase()
    };
    setShipmentMode((prev) => ({
      ...prev,
      method: nextMethod || prev.method,
      carrier: {
        partnered: Boolean(opt.partnered),
        name: opt.carrierName || '',
        rate: typeof opt.charge === 'number' ? opt.charge : prev?.carrier?.rate ?? null
      }
    }));
    setCarrierTouched(true);
  };

  const validatePalletDetails = () => {
    if (!shipmentMode?.method || shipmentMode.method === 'SPD') return null;
    const market = String(currentMarket || '').toUpperCase();
    const isEu = market === 'FR' || market === 'DE';
    const qty = Number(palletDetails.quantity || 0) || (derivedPalletSummary?.pallets || 1);
    const length = Number(palletDetails.length || 0) || (isEu ? DEFAULT_EU_PALLET.length : 0);
    const width = Number(palletDetails.width || 0) || (isEu ? DEFAULT_EU_PALLET.width : 0);
    const height = Number(palletDetails.height || 0);
    const weight =
      Number(palletDetails.weight || 0) ||
      (derivedPalletSummary?.weightPerPallet || derivedWeightKg || 25);
    const declaredValue = Number(palletDetails.declaredValue || 0);
    const freightClass = String(palletDetails.freightClass || '').trim().toUpperCase();
    if (isEu && (!palletDetails.length || !palletDetails.width)) {
      setPalletDetails((prev) => ({
        ...prev,
        length,
        width
      }));
    }
    if (!(qty > 0)) return 'Amazon nu a putut estima numărul de paleți pentru acest shipment.';
    if (!(length > 0 && width > 0 && height > 0)) return 'Amazon nu a putut completa automat dimensiunile standard de europalet.';
    if (!(weight > 0)) return 'Amazon nu a putut estima greutatea totală pe palet.';
    if (palletLimits.maxWeightKg && weight > palletLimits.maxWeightKg) {
      return `Greutatea pe palet depășește limita Amazon de ${palletLimits.maxWeightKg} kg.`;
    }
    if (palletLimits.maxHeightCm && height > palletLimits.maxHeightCm) {
      return `Înălțimea paletului depășește limita Amazon de ${palletLimits.maxHeightCm} cm.`;
    }
    setPalletDetails((prev) => {
      const next = {
        ...prev,
        quantity: qty,
        length,
        width,
        height,
        weight,
        declaredValue: declaredValue > 0 ? declaredValue : 1,
        freightClass: freightClass || 'FC_XX',
        stackability: ['STACKABLE', 'NON_STACKABLE'].includes(String(prev.stackability || '').toUpperCase())
          ? prev.stackability
          : 'STACKABLE'
      };
      if (
        next.quantity === prev.quantity &&
        next.length === prev.length &&
        next.width === prev.width &&
        next.height === prev.height &&
        next.weight === prev.weight &&
        next.declaredValue === prev.declaredValue &&
        next.freightClass === prev.freightClass
      ) {
        return prev;
      }
      return next;
    });
    return null;
  };

  const validateDeliveryWindow = (strict = false) => {
    const selectedOpt = (shippingOptions || []).find((opt) => opt?.id === selectedTransportationOptionId);
    const isPartnered = detectPartneredOption(selectedOpt);
    if (!selectedOpt || isPartnered) return null;
    const start = shipmentMode?.deliveryWindowStart || '';
    const end = shipmentMode?.deliveryWindowEnd || '';
    if (strict && !start) {
      return 'Completează data de start a ferestrei de livrare (ETA) pentru transport non-partener.';
    }
    if (start && shipmentMode?.deliveryDate) {
      const sd = new Date(start);
      const ship = new Date(shipmentMode.deliveryDate);
      if (sd.getTime() < ship.getTime()) {
        return 'Data de sosire estimată trebuie să fie după ship date.';
      }
    }
    if (end && start) {
      const sd = new Date(start);
      const ed = new Date(end);
      if (ed.getTime() < sd.getTime()) {
        return 'Data de sfârșit a ferestrei nu poate fi înainte de start.';
      }
    }
    return null;
  };

  const formatToPageType = (format, partnered) => {
    if (format === 'letter') {
      return partnered ? 'PackageLabel_Letter_2' : 'PackageLabel_Letter_4';
    }
    if (format === 'a4') return 'PackageLabel_A4_2';
    return partnered ? 'PackageLabel_Thermal' : 'PackageLabel_Thermal_NonPCP';
  };

  const fetchShipmentDetails = async (shipmentId, inboundPlanId, requestId) => {
    const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
      body: {
        action: 'get_shipment',
        request_id: requestId,
        inbound_plan_id: inboundPlanId,
        shipment_id: shipmentId
      }
    });
    if (error) throw error;
    return data?.data || null;
  };

  const fetchShipmentPallets = async (shipmentId, inboundPlanId, requestId) => {
    const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
      body: {
        action: 'list_shipment_pallets',
        request_id: requestId,
        inbound_plan_id: inboundPlanId,
        shipment_id: shipmentId
      }
    });
    if (error) throw error;
    return data?.data || null;
  };

  const openAmazonDocumentUrl = (payload) => {
    const url =
      payload?.payload?.DownloadURL ||
      payload?.payload?.downloadUrl ||
      payload?.DownloadURL ||
      payload?.downloadUrl ||
      payload?.url ||
      null;
    if (url) {
      window.open(url, '_blank', 'noopener');
      return true;
    }
    return false;
  };

  const handlePrintLabels = async (shipment) => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) {
      setLabelsError(tt('labelsMissingIdsError', 'Missing inboundPlanId or requestId for labels.'));
      return;
    }
    const shipmentId = shipment?.shipmentId || shipment?.id;
    if (!shipmentId) {
      setLabelsError(tt('labelsMissingShipmentIdError', 'Missing shipmentId for labels.'));
      return;
    }
    setLabelsLoadingId(shipment?.id || shipmentId);
    setLabelsError('');
    try {
      const details = await fetchShipmentDetails(shipmentId, inboundPlanId, requestId);
      const confirmationId =
        details?.shipmentConfirmationId ||
        details?.shipmentConfirmedId ||
        details?.shipmentConfirmationID ||
        shipment?.shipmentConfirmationId ||
        null;
      if (!confirmationId) {
        setLabelsError(
          tt(
            'labelsMissingConfirmationIdError',
            'Missing shipmentConfirmationId for labels. Try again after confirming shipping.'
          )
        );
        return;
      }
      // Persistăm ID-ul confirmat ca să nu se piardă până la pasul 4.
      const normalizedConfirmationId = String(confirmationId).trim().toUpperCase();
      const shipmentKey = getShipmentKey(shipment);
      setManualFbaShipmentIds((prev) => ({
        ...prev,
        ...(shipmentKey ? { [shipmentKey]: normalizedConfirmationId } : {})
      }));
      await updateShipmentAmazonIds((current) => {
        const currentKey = getShipmentKey(current);
        if (currentKey !== shipmentKey) return current;
        return {
          ...current,
          amazonShipmentId: normalizedConfirmationId,
          shipmentConfirmationId: normalizedConfirmationId
        };
      });
      const partnered = Boolean(shipmentMode?.carrier?.partnered);
      const isPalletShipment = Boolean(shipmentMode?.method && shipmentMode.method !== 'SPD');
      let palletCount = Number(shipment?.palletQuantity || shipment?.palletSummary?.quantity || 0) || 0;
      if (isPalletShipment && !palletCount) {
        try {
          const palletData = await fetchShipmentPallets(shipmentId, inboundPlanId, requestId);
          const palletList =
            palletData?.payload?.pallets ||
            palletData?.pallets ||
            [];
          if (Array.isArray(palletList) && palletList.length) {
            palletCount = palletList.reduce((sum, pallet) => sum + (Number(pallet?.quantity || 0) || 1), 0);
          }
        } catch (_err) {
          // fallback on locally persisted quantity below
        }
      }
      const packageCount = Number(shipment?.boxes || 0) || 1;
      const needsPageParams = !partnered || isPalletShipment;
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'get_labels_v0',
          request_id: requestId,
          shipment_id: confirmationId,
          page_type: formatToPageType(labelFormat, partnered),
          label_type: 'BARCODE_2D',
          ...(isPalletShipment
            ? { number_of_pallets: palletCount || Number(palletDetails.quantity || 0) || undefined }
            : { number_of_packages: packageCount || undefined }),
          ...(needsPageParams
            ? {
                page_size: Math.min(1000, isPalletShipment ? (palletCount || Number(palletDetails.quantity || 1)) : packageCount),
                page_start_index: 0
              }
            : {})
        }
      });
      if (error) throw error;
      if (!openAmazonDocumentUrl(data?.data)) {
        setLabelsError(tt('labelsErrorMissingUrl', 'Amazon did not return a URL for labels.'));
      }
    } catch (e) {
      setLabelsError(e?.message || tt('labelsErrorGenerateFailed', 'Could not generate labels.'));
    } finally {
      setLabelsLoadingId(null);
    }
  };

  const [billOfLadingLoadingId, setBillOfLadingLoadingId] = useState(null);

  const handlePrintBillOfLading = async (shipment) => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const shipmentId = shipment?.shipmentId || shipment?.id;
    if (!inboundPlanId || !requestId || !shipmentId) {
      setLabelsError('Missing inboundPlanId, requestId or shipmentId for bill of lading.');
      return;
    }
    setBillOfLadingLoadingId(shipment?.id || shipmentId);
    setLabelsError('');
    try {
      const details = await fetchShipmentDetails(shipmentId, inboundPlanId, requestId);
      const confirmationId =
        details?.shipmentConfirmationId ||
        details?.shipmentConfirmedId ||
        details?.shipmentConfirmationID ||
        shipment?.shipmentConfirmationId ||
        shipment?.amazonShipmentId ||
        null;
      if (!confirmationId) {
        throw new Error('Missing shipmentConfirmationId for bill of lading.');
      }
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'get_bill_of_lading',
          request_id: requestId,
          shipment_id: confirmationId
        }
      });
      if (error) throw error;
      if (!openAmazonDocumentUrl(data?.data)) {
        throw new Error('Amazon did not return a URL for bill of lading.');
      }
    } catch (e) {
      setLabelsError(e?.message || 'Could not generate bill of lading.');
    } finally {
      setBillOfLadingLoadingId(null);
    }
  };

  const isFbaShipmentId = (value) => {
    const normalized = String(value || '').trim();
    return /^FBA[0-9A-Z]+$/i.test(normalized);
  };

  const getShipmentKey = (shipment, fallbackIndex = null) =>
    String(
      shipment?.shipmentId ||
        shipment?.id ||
        shipment?.packingGroupId ||
        (Number.isInteger(fallbackIndex) ? `shipment-${fallbackIndex}` : '')
    );

  const resolveFbaShipmentIdFromList = (inputList) => {
    const list = Array.isArray(inputList) ? inputList : [];
    const candidates = list.flatMap((s) => [
      s?.amazonShipmentId,
      s?.shipmentId,
      s?.id
    ]);
    const picked = candidates.find((candidate) => isFbaShipmentId(candidate));
    return picked ? String(picked).trim().toUpperCase() : null;
  };

  const normalizeManualFbaShipmentId = (value) => {
    const str = String(value || '').trim().toUpperCase();
    return isFbaShipmentId(str) ? str : null;
  };

  const buildManualFbaShipmentIds = (shipmentList, fallbackValue = null) => {
    const next = {};
    (Array.isArray(shipmentList) ? shipmentList : []).forEach((shipment, idx) => {
      const key = getShipmentKey(shipment, idx);
      if (!key) return;
      const resolved =
        normalizeManualFbaShipmentId(shipment?.amazonShipmentId) ||
        normalizeManualFbaShipmentId(shipment?.shipmentConfirmationId) ||
        (idx === 0 ? normalizeManualFbaShipmentId(fallbackValue) : null);
      if (resolved) next[key] = resolved;
    });
    return next;
  };

  const updateShipmentAmazonIds = async (updater) => {
    const requestId = resolveRequestId();
    let nextShipments = [];
    setShipments((prev) => {
      nextShipments = (Array.isArray(prev) ? prev : []).map(updater);
      return nextShipments;
    });
    const nextManualIds = buildManualFbaShipmentIds(
      nextShipments,
      plan?.fba_shipment_id || plan?.fba_shipmentId || null
    );
    setManualFbaShipmentIds(nextManualIds);
    if (!requestId) return;
    const firstResolvedId =
      resolveFbaShipmentIdFromList(nextShipments) ||
      Object.values(nextManualIds).find((value) => normalizeManualFbaShipmentId(value)) ||
      null;
    const payload = {
      step2_shipments: nextShipments,
      ...(firstResolvedId ? { fba_shipment_id: firstResolvedId } : {})
    };
    const { error: updateErr } = await supabase
      .from('prep_requests')
      .update(payload)
      .eq('id', requestId);
    if (updateErr) throw updateErr;
    setPlan((prev) => ({ ...prev, ...payload }));
  };

  useEffect(() => {
    const existingIdRaw = plan?.fba_shipment_id || plan?.fba_shipmentId || null;
    setManualFbaShipmentIds(buildManualFbaShipmentIds(shipments, existingIdRaw));
  }, [shipments, plan?.fba_shipment_id, plan?.fba_shipmentId]);

  const finalizeStep3 = async () => {
    if (step3Confirming) return;
    const requestId = resolveRequestId();
    if (!requestId) {
      setStep3Error(tt('step3ErrorMissingRequestId', 'Missing requestId to confirm the request.'));
      return;
    }
    if (!shippingConfirmed && !shippingSummary?.alreadyConfirmed) {
      setStep3Error(tt('step3ErrorConfirmShippingFirst', 'Confirm shipping before finishing the request.'));
      return;
    }
    const existingIdRaw = plan?.fba_shipment_id || plan?.fba_shipmentId || null;
    const existingFbaId = isFbaShipmentId(existingIdRaw) ? String(existingIdRaw).trim().toUpperCase() : null;
    const nextShipments = (Array.isArray(shipments) ? shipments : []).map((shipment, idx) => {
      const manualId = normalizeManualFbaShipmentId(manualFbaShipmentIds?.[getShipmentKey(shipment, idx)]);
      const resolvedId =
        normalizeManualFbaShipmentId(shipment?.amazonShipmentId) ||
        normalizeManualFbaShipmentId(shipment?.shipmentConfirmationId) ||
        manualId ||
        (idx === 0 ? existingFbaId : null);
      return resolvedId ? { ...shipment, amazonShipmentId: resolvedId } : shipment;
    });
    const missingShipment = nextShipments.find((shipment) => !normalizeManualFbaShipmentId(shipment?.amazonShipmentId));
    const shipmentId = resolveFbaShipmentIdFromList(nextShipments) || existingFbaId;
    if (missingShipment || !shipmentId) {
      setStep3Error(
        missingShipment
          ? `Missing FBA shipment ID for ${missingShipment?.name || missingShipment?.shipmentId || missingShipment?.packingGroupId || 'shipment'}.`
          : tt('step3ErrorMissingShipmentId', 'Could not find FBA shipment ID from Amazon. Please enter it manually.')
      );
      return;
    }
    setStep3Confirming(true);
    setStep3Error('');
    try {
      const updatePayload = {};
      if (plan?.status !== 'confirmed') updatePayload.status = 'confirmed';
      if (!existingFbaId || String(existingFbaId) !== String(shipmentId)) {
        updatePayload.fba_shipment_id = shipmentId;
      }
      updatePayload.step2_shipments = nextShipments;
      if (Object.keys(updatePayload).length) {
        const { error: updateErr } = await supabase
          .from('prep_requests')
          .update(updatePayload)
          .eq('id', requestId);
        if (updateErr) throw updateErr;
        setPlan((prev) => ({ ...prev, ...updatePayload }));
      }
      const { error: finalizeErr } = await supabase.rpc('finalize_prep_request_inventory', {
        p_request_id: requestId
      });
      if (finalizeErr) throw finalizeErr;

      completeAndNext('3');
    } catch (e) {
      setStep3Error(e?.message || tt('step3ErrorConfirmFailed', 'Could not confirm request.'));
    } finally {
      setStep3Confirming(false);
    }
  };

  const handleManualShipmentIdChange = (shipment, value) => {
    const key = getShipmentKey(shipment);
    if (!key) return;
    setManualFbaShipmentIds((prev) => ({
      ...prev,
      [key]: String(value || '').toUpperCase()
    }));
  };

  const loadInboundPlanBoxes = async () => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    if (!inboundPlanId || !requestId) return;
    setTrackingLoading(true);
    setTrackingError('');
    try {
      if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
        const existingByShipment = new Map(
          (Array.isArray(tracking) ? tracking : [])
            .map((row) => [String(row?.shipmentId || ''), row])
            .filter(([shipmentKey]) => Boolean(shipmentKey))
        );
        const shipmentRows = await Promise.all(
          (Array.isArray(shipments) ? shipments : []).map(async (shipment, idx) => {
            const shipmentId = shipment?.shipmentId || shipment?.id || `shipment-${idx + 1}`;
            const existing = existingByShipment.get(String(shipmentId)) || null;
            let palletCount = Number(shipment?.palletQuantity || shipment?.palletSummary?.quantity || 0) || 0;
            let detailsText = '';
            try {
              const palletData = await fetchShipmentPallets(shipmentId, inboundPlanId, requestId);
              const palletList =
                palletData?.payload?.pallets ||
                palletData?.pallets ||
                [];
              if (Array.isArray(palletList) && palletList.length) {
                palletCount = palletList.reduce((sum, pallet) => sum + (Number(pallet?.quantity || 0) || 1), 0);
              }
            } catch (_err) {
              // fallback to locally stored pallet summary
            }
            const palletSummary = shipment?.palletSummary || null;
            if (palletSummary) {
              detailsText = [
                palletCount ? `${palletCount} pallets` : null,
                palletSummary.lengthCm && palletSummary.widthCm && palletSummary.heightCm
                  ? `${palletSummary.lengthCm} x ${palletSummary.widthCm} x ${palletSummary.heightCm} cm`
                  : null,
                palletSummary.stackability || null
              ].filter(Boolean).join(' · ');
            } else if (palletCount) {
              detailsText = `${palletCount} pallets`;
            }
            return {
              id: `shipment-${shipmentId}`,
              shipmentId,
              shipment: shipment?.amazonShipmentId || shipment?.shipmentConfirmationId || shipmentId,
              label:
                shipment?.shipmentConfirmationId ||
                shipment?.amazonShipmentId ||
                shipment?.name ||
                shipmentId,
              trackingId: existing?.trackingId || '',
              status: existing?.status || tt('trackingStatusPending', 'Pending'),
              weight:
                shipment?.weight ||
                palletSummary?.weightKg ||
                null,
              details: detailsText || 'Pallet shipment',
              palletCount
            };
          })
        );
        setTracking(shipmentRows);
        return;
      }
      const existingRows = Array.isArray(tracking) ? tracking : [];
      const existingByBoxId = new Map();
      const existingByLabel = new Map();
      existingRows.forEach((row) => {
        if (row?.boxId) existingByBoxId.set(String(row.boxId), row);
        if (row?.label) existingByLabel.set(String(row.label), row);
      });
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'list_inbound_plan_boxes',
          request_id: requestId,
          inbound_plan_id: inboundPlanId
        }
      });
      if (error) throw error;
      const boxes =
        data?.data?.payload?.boxes ||
        data?.data?.boxes ||
        data?.data?.payload?.boxList ||
        [];
      if (!Array.isArray(boxes) || boxes.length === 0) return;
      let normalized = boxes.map((b, idx) => {
        const boxId = b?.boxId || b?.packageId || b?.id || null;
        const label = b?.packageId || b?.boxId || b?.externalContainerIdentifier || `BOX-${idx + 1}`;
        const existing =
          (boxId && existingByBoxId.get(String(boxId))) ||
          (label && existingByLabel.get(String(label))) ||
          null;
        return {
          id: boxId || `box-${idx + 1}`,
          boxId,
          box: idx + 1,
          label,
          trackingId: existing?.trackingId || '',
          status: existing?.status || tt('trackingStatusPending', 'Pending'),
          weight: b?.weight?.value || b?.weight?.amount || null,
          dimensions: b?.dimensions
            ? `${b.dimensions.length || ''} x ${b.dimensions.width || ''} x ${b.dimensions.height || ''}`
            : ''
        };
      });
      if (!trackingPrefillRef.current) {
        const savedTracking = Array.isArray(initialTrackingIds) ? initialTrackingIds.filter(Boolean) : [];
        if (savedTracking.length) {
          normalized = normalized.map((row, idx) => ({
            ...row,
            trackingId: row.trackingId || savedTracking[idx] || '',
            status: savedTracking[idx] ? tt('trackingStatusConfirmed', 'Confirmed') : row.status
          }));
          trackingPrefillRef.current = true;
        }
      }
      setTracking(normalized);
    } catch (e) {
      setTrackingError(e?.message || tt('trackingErrorLoadBoxes', 'Could not load boxes.'));
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    if (currentStep !== '4') {
      trackingLoadRequestedRef.current = false;
      return;
    }
    if (trackingLoadRequestedRef.current) return;
    if (Array.isArray(tracking) && tracking.length) {
      const missingBoxId = tracking.some((row) => !row?.boxId);
      if (!missingBoxId) return;
    }
    trackingLoadRequestedRef.current = true;
    loadInboundPlanBoxes();
  }, [currentStep]);

  const handleTrackingChange = (id, value) => {
    setTracking((prev) => prev.map((row) => (row.id === id ? { ...row, trackingId: value } : row)));
  };

  const submitTrackingDetails = async () => {
    const inboundPlanId = resolveInboundPlanId();
    const requestId = resolveRequestId();
    const shipmentId = (Array.isArray(shipments) && shipments[0]?.shipmentId) || shipments?.[0]?.id || null;
    if (!inboundPlanId || !requestId || !shipmentId) {
      setTrackingError(
        tt('trackingErrorMissingIds', 'Missing inboundPlanId, requestId or shipmentId for tracking.')
      );
      return;
    }
    const isPartnered = isPartneredShipment;
    if (isPartnered) {
      // Amazon-partnered shipments do not accept updateShipmentTrackingDetails.
      if (!Array.isArray(tracking) || !tracking.length || tracking.some((row) => !row?.boxId)) {
        await loadInboundPlanBoxes();
      }
      setTrackingError('');
      completeAndNext('4');
      return;
    }
    if (shipmentMode?.method && shipmentMode.method !== 'SPD') {
      const rows = (tracking || []).filter((row) => row?.shipmentId && String(row?.trackingId || '').trim());
      if (!rows.length) {
        setTrackingError('Adaugă cel puțin un freight bill number pentru shipment-urile pe paleți.');
        return;
      }
      setTrackingLoading(true);
      setTrackingError('');
      try {
        for (const row of rows) {
          // eslint-disable-next-line no-await-in-loop
          const { error } = await supabase.functions.invoke('fba-inbound-actions', {
            body: {
              action: 'update_shipment_tracking_details',
              request_id: requestId,
              inbound_plan_id: inboundPlanId,
              shipment_id: row.shipmentId,
              tracking_details: {
                ltlTrackingDetail: {
                  freightBillNumber: [String(row.trackingId).trim()]
                }
              }
            }
          });
          if (error) throw error;
        }
        completeAndNext('4');
      } catch (e) {
        setTrackingError(e?.message || 'Could not submit pallet tracking.');
      } finally {
        setTrackingLoading(false);
      }
      return;
    }
    const items = (tracking || [])
      .filter((t) => t.trackingId && t.boxId)
      .map((t) => ({ boxId: t.boxId, trackingId: t.trackingId }));
    if (!items.length) {
      setTrackingError(tt('trackingErrorAddOne', 'Add tracking for at least one box.'));
      return;
    }
    setTrackingLoading(true);
    setTrackingError('');
    try {
      const { data, error } = await supabase.functions.invoke('fba-inbound-actions', {
        body: {
          action: 'update_shipment_tracking_details',
          request_id: requestId,
          inbound_plan_id: inboundPlanId,
          shipment_id: shipmentId,
          tracking_details: {
            spdTrackingDetail: {
              spdTrackingItems: items
            }
          }
        }
      });
      if (error) throw error;
      if (data?.traceId && !import.meta.env.PROD) {
        console.log('updateTracking traceId', data.traceId);
      }
      completeAndNext('4');
    } catch (e) {
      setTrackingError(e?.message || tt('trackingErrorSubmitFailed', 'Could not submit tracking.'));
    } finally {
      setTrackingLoading(false);
    }
  };

  const reloadShippingOptions = useCallback(async () => {
    setStep2Loaded(false);
    setShippingError('');
    setShippingSummary(null);
    setShippingOptions([]);
    await fetchShippingOptions();
  }, [fetchShippingOptions]);

  const reloadPlan = useCallback(async () => {
    setPlanLoaded(false);
    setLoadingPlan(true);
    if (fetchPlan) {
      let skip = false;
      await runFetchPlan().then((response) => {
        if (response?.__skip) {
          skip = true;
          return;
        }
        if (!response) return;
        const {
          shipFrom: pFrom,
          marketplace: pMarket,
          skus: pSkus,
          packGroups: pGroups,
          shipments: pShipments,
          warning: pWarning,
          shipmentMode: pShipmentMode,
          skuStatuses: pSkuStatuses,
          operationProblems: pOperationProblems,
          blocking: pBlocking
        } = response;
        if (pFrom && pMarket && Array.isArray(pSkus)) {
          const mergedSkus = mergeSkusWithLocal(pSkus, planRef.current?.skus || []);
          setPlan((prev) => ({ ...prev, ...response, shipFrom: pFrom, marketplace: pMarket, skus: mergedSkus }));
          snapshotServerUnits(mergedSkus);
        } else {
          setPlan((prev) => ({ ...prev, ...response }));
          if (Array.isArray(response?.skus)) snapshotServerUnits(mergeSkusWithLocal(response.skus, planRef.current?.skus || []));
        }
        if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
        if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
        if (Array.isArray(pGroups)) {
          const normalized = normalizePackGroups(pGroups);
          setPackGroups((prev) => mergePackGroups(prev, normalized));
          setPackGroupsLoaded(hasRealPackGroups(normalized));
        }
        if (Array.isArray(pShipments) && pShipments.length) setShipments(pShipments);
        if (pShipmentMode) setShipmentMode((prev) => ({ ...prev, ...pShipmentMode }));
        if (Array.isArray(pSkuStatuses)) setSkuStatuses(pSkuStatuses);
        setOperationProblems(Array.isArray(pOperationProblems) ? pOperationProblems : []);
        setBlocking(Boolean(pBlocking));
        if (typeof pWarning === 'string' && pWarning.trim()) {
          setPlanNotice((prevNotice) => prevNotice || toFriendlyPlanNotice(pWarning));
        }
        // Nu declanșăm automat Step 1b la refresh Step 1.
      });
      if (!skip) {
        setLoadingPlan(false);
        setPlanLoaded(true);
      }
      return;
    }
    setLoadingPlan(false);
    setPlanLoaded(true);
  }, [
    fetchPlan,
    mergeSkusWithLocal,
    normalizePackGroups,
    runFetchPlan,
    snapshotServerUnits,
    toFriendlyPlanNotice
  ]);

  const refreshStep = useCallback(
    async (stepKey) => {
      if (stepKey === '3') {
        await reloadShippingOptions();
        await reloadPlan();
        return;
      }
      if (stepKey === '2' || stepKey === '4') {
        await reloadShippingOptions();
        return;
      }
      if (stepKey === '1b') {
        await refreshPackingGroups();
        return;
      }
      await reloadPlan();
    },
    [refreshPackingGroups, reloadPlan, reloadShippingOptions]
  );

  const handleInboundPlanRetry = useCallback(() => {
    setAllowNoInboundPlan(false);
    setInboundPlanMissing(false);
    setStep1SaveError('');
    setPlanError('');
    refreshStep('1');
  }, [refreshStep]);

  const handleInboundPlanBypass = useCallback(() => {
    setAllowNoInboundPlan(true);
    setInboundPlanMissing(false);
    setStep1SaveError('');
    setPlanError('');
  }, []);

  const submitListingAttributesForSku = useCallback(
    async (sku, attrs) => {
      const requestId = resolveRequestId();
      if (!requestId) throw new Error('Missing requestId.');
      const cleanSku = String(sku || '').trim();
      if (!cleanSku) throw new Error('Missing SKU.');
      const { data, error } = await invokeAuthedFunction('fba-plan', {
        request_id: requestId,
        listingAttributesBySku: {
          [cleanSku]: {
            length_cm: getPositiveNumber(attrs?.length_cm),
            width_cm: getPositiveNumber(attrs?.width_cm),
            height_cm: getPositiveNumber(attrs?.height_cm),
            weight_kg: getPositiveNumber(attrs?.weight_kg)
          }
        }
      });
      if (error) throw error;
      const response = data?.plan || null;
      if (!response) throw new Error('Amazon plan did not respond.');
      const {
        shipFrom: pFrom,
        marketplace: pMarket,
        skus: pSkus,
        packGroups: pGroups,
        shipments: pShipments,
        warning: pWarning,
        shipmentMode: pShipmentMode,
        skuStatuses: pSkuStatuses,
        operationProblems: pOperationProblems,
        blocking: pBlocking
      } = response;
      if (pFrom && pMarket && Array.isArray(pSkus)) {
        const mergedSkus = mergeSkusWithLocal(pSkus, planRef.current?.skus || []);
        setPlan((prev) => ({ ...prev, ...response, shipFrom: pFrom, marketplace: pMarket, skus: mergedSkus }));
        snapshotServerUnits(mergedSkus);
      } else {
        setPlan((prev) => ({ ...prev, ...response }));
        if (Array.isArray(response?.skus)) snapshotServerUnits(mergeSkusWithLocal(response.skus, planRef.current?.skus || []));
      }
      if (response?.packingOptionId) setPackingOptionId(response.packingOptionId);
      if (response?.placementOptionId) setPlacementOptionId(response.placementOptionId);
      if (Array.isArray(pGroups)) {
        const normalized = normalizePackGroups(pGroups);
        setPackGroups((prev) => mergePackGroups(prev, normalized));
        setPackGroupsLoaded(hasRealPackGroups(normalized));
      }
      if (Array.isArray(pShipments) && pShipments.length) setShipments(pShipments);
      if (pShipmentMode) setShipmentMode((prev) => ({ ...prev, ...pShipmentMode }));
      if (Array.isArray(pSkuStatuses)) setSkuStatuses(pSkuStatuses);
      setOperationProblems(Array.isArray(pOperationProblems) ? pOperationProblems : []);
      setBlocking(Boolean(pBlocking));
      if (typeof pWarning === 'string' && pWarning.trim()) {
        setPlanNotice(toFriendlyPlanNotice(pWarning));
      }
    },
    [
      resolveRequestId,
      mergeSkusWithLocal,
      snapshotServerUnits,
      normalizePackGroups,
      mergePackGroups,
      hasRealPackGroups,
      toFriendlyPlanNotice
    ]
  );

  const invalidateFrom = (stepKey) => {
    const idx = stepsOrder.indexOf(stepKey);
    if (idx === -1) return;
    const allowed = stepsOrder.slice(0, idx + 1);
    setCompletedSteps((prev) => prev.filter((s) => allowed.includes(s)));
    if (stepsOrder.indexOf(currentStep) > idx) {
      setCurrentStep(stepKey);
    }
    // Reset date pentru pașii următori
    if (stepKey === '1') {
      // Orice modificare de SKU/cantitate în Step 1 invalidează planul Amazon curent.
      // Setăm explicit ID-urile la null în state ca să nu mai reutilizăm accidental un plan vechi.
      setPlan((prev) => ({
        ...prev,
        inboundPlanId: null,
        inbound_plan_id: null,
        placementOptionId: null,
        placement_option_id: null,
        packingOptionId: null,
        packing_option_id: null
      }));
      setPackGroups([]);
      setPackGroupsPreview([]);
      setPackGroupsPreviewError('');
      setPackGroupsLoaded(false);
      setTracking([]);
      setPackingOptionId(null);
      setPlacementOptionId(null);
      setCarrierTouched(false);
      setShippingConfirmed(false);
    } else if (stepKey === '1b') {
      setTracking([]);
      setPackGroupsLoaded(false);
      setCarrierTouched(false);
      setShippingConfirmed(false);
    } else if (stepKey === '2') {
      setTracking([]);
      setShippingConfirmed(false);
    }
  };

  function completeAndNext(stepKey) {
    const idx = stepsOrder.indexOf(stepKey);
    setCompletedSteps((prev) => Array.from(new Set([...prev, stepKey])));
    const nextKey = stepsOrder[idx + 1] || stepKey;
    setCurrentStep(nextKey);
  }

  const goToStep = (stepKey) => {
    if (!stepsOrder.includes(stepKey)) return;
    if (stepKey === '1b' && skipPackingStep) {
      setCurrentStep('2');
      return;
    }
    setCurrentStep(stepKey);
    if (stepKey === '1b') {
      const inboundId = resolveInboundPlanId();
      if (allowNoInboundPlan && !inboundId) {
        setPackGroupsLoaded(true);
        if (!Array.isArray(packGroups) || !packGroups.length) {
          const fallbackGroups = buildFallbackPackGroups(plan?.skus || []);
          setPackGroups(fallbackGroups);
        }
        return;
      }
      refreshPackingGroups();
    }
  };

  const persistStep1AndReloadPlan = useCallback(async () => {
    const isUuid = (val) => typeof val === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
    const requestId = resolveRequestId();
    const inboundPlanIdCurrent = resolveInboundPlanId();
    const bypassMissingInbound = allowNoInboundPlan && !inboundPlanIdCurrent;
    const updates = (Array.isArray(plan?.skus) ? plan.skus : [])
      .map((sku) => {
        if (!sku?.id) return null;
        const qty = Math.max(0, Number(sku.units) || 0);
        const unitsPerBox = Number(sku.unitsPerBox);
        const boxesCount = Number(sku.boxesCount);
        const boxLengthCm = Number(sku.boxLengthCm);
        const boxWidthCm = Number(sku.boxWidthCm);
        const boxHeightCm = Number(sku.boxHeightCm);
        const boxWeightKg = Number(sku.boxWeightKg);
        return {
          id: sku.id,
          units_sent: qty,
          packing_template_id: sku.packingTemplateId || null,
          packing_template_name: sku.packingTemplateName || null,
          packing_template_type: sku.packing || null,
          units_per_box: Number.isFinite(unitsPerBox) && unitsPerBox > 0 ? Math.floor(unitsPerBox) : null,
          boxes_count: Number.isFinite(boxesCount) && boxesCount > 0 ? Math.floor(boxesCount) : null,
          box_length_cm: Number.isFinite(boxLengthCm) && boxLengthCm > 0 ? boxLengthCm : null,
          box_width_cm: Number.isFinite(boxWidthCm) && boxWidthCm > 0 ? boxWidthCm : null,
          box_height_cm: Number.isFinite(boxHeightCm) && boxHeightCm > 0 ? boxHeightCm : null,
          box_weight_kg: Number.isFinite(boxWeightKg) && boxWeightKg > 0 ? boxWeightKg : null
        };
      })
      .filter(Boolean);
    const updatesForDb = updates.filter((u) => isUuid(u.id));
    const hasAnyQty = updates.some((u) => Number(u.units_sent || 0) > 0);
    if (!updates.length || !hasAnyQty) {
      setStep1SaveError('Set at least one product with quantity > 0 before continuing.');
      return;
    }
    if (!requestId) {
      completeAndNext('1');
      return;
    }
    // dacă suntem în modul bypass (fără inboundPlanId) evităm așteptarea packing groups și continuăm direct după salvare
    setStep1Saving(true);
    setStep1SaveError('');
    setPlanError('');
    const waitForPackingGroups = async () => {
      const maxAttempts = 6;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const haveInbound = Boolean(resolveInboundPlanId());
        if (!haveInbound && fetchPlan) {
          // eslint-disable-next-line no-await-in-loop
          await refreshStep('1');
        }
        // eslint-disable-next-line no-await-in-loop
        const res = await refreshPackingGroups();
        if (res?.ok) return { ok: true };
        const transientCodes = [
          'PACKING_GROUPS_NOT_READY',
          'PACKING_GROUPS_PROCESSING',
          'PACKING_OPTIONS_NOT_READY',
          'PACKING_OPTIONS_PROCESSING',
          'PLAN_STILL_CREATING',
          'MISSING_IDS'
        ];
        if (!transientCodes.includes(res?.code)) return res;
        if (attempt < maxAttempts) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        }
      }
      return { ok: false, code: 'PACKING_GROUPS_NOT_READY' };
    };
    try {
      // upsert declanșa RLS pe INSERT; facem update punctual pe fiecare id (chiar dacă aparent nu s-au schimbat,
      // ca să sincronizăm serverul înainte de a recrea inbound plan-ul)
      for (const row of updatesForDb) {
        // eslint-disable-next-line no-await-in-loop
          const { error: saveErr } = await supabase
            .from('prep_request_items')
            .update({
              units_sent: row.units_sent,
              packing_template_id: row.packing_template_id,
              packing_template_name: row.packing_template_name,
              packing_template_type: row.packing_template_type,
              units_per_box: row.units_per_box,
              boxes_count: row.boxes_count,
              box_length_cm: row.box_length_cm,
              box_width_cm: row.box_width_cm,
              box_height_cm: row.box_height_cm,
              box_weight_kg: row.box_weight_kg
            })
            .eq('id', row.id);
        if (saveErr) throw saveErr;
      }

      await persistServicesToDb();

      if (bypassMissingInbound) {
        setStep1SaveError('');
        setInboundPlanMissing(true);
        setPackGroupsLoaded(true);
        const fallbackGroups = buildFallbackPackGroups(plan?.skus || []);
        setPackGroups(fallbackGroups);
        setCompletedSteps((prev) => Array.from(new Set([...prev, '1'])));
        setCurrentStep(skipPackingStep ? '2' : '1b');
        return;
      }

      const { error: resetErr } = await supabase
        .from('prep_requests')
        .update({
          inbound_plan_id: null,
          placement_option_id: null,
          packing_option_id: null,
          fba_shipment_id: null,
          step1_box_plan: step1BoxPlanRef.current || {},
          // ștergem snapshot-ul Amazon ca să forțăm recrearea planului cu cantitățile noi
          amazon_snapshot: {}
        })
        .eq('id', requestId);
      if (resetErr) throw resetErr;

      setPlan((prev) => ({
        ...prev,
        inboundPlanId: null,
        inbound_plan_id: null,
        placementOptionId: null,
        placement_option_id: null,
        packingOptionId: null,
        packing_option_id: null
      }));
      setPackGroups([]);
      setPackGroupsLoaded(false);
      setShipments([]);
      setTracking([]);
      setShippingSummary(null);
      setShippingOptions([]);
      setStep2Loaded(false);
      snapshotServerUnits(updates.map((u) => ({ id: u.id, units: u.units_sent })));

      if (fetchPlan) {
        await refreshStep('1');
      }
      const packRes = await waitForPackingGroups();
      if (!packRes?.ok) {
        const msg =
          packRes?.message ||
          wizardCopy.packingWait;
      setInboundPlanMissing(true);
      if (allowNoInboundPlan) {
        completeAndNext('1');
        return;
      }
      setStep1SaveError(msg);
      return;
    }
    setInboundPlanMissing(false);
    // asigură-te că avem inboundPlanId după reîncărcare, altfel nu trecem în 1b
    const inboundPlanId = resolveInboundPlanId();
    if (!inboundPlanId) {
      setInboundPlanMissing(true);
      if (allowNoInboundPlan) {
        completeAndNext('1');
        return;
      }
      setStep1SaveError(wizardCopy.inboundPlanWait);
      return;
    }

    // Dacă avem deja box plan complet (autoPackingReady) și nu suntem pe paleți,
    // sar peste UI-ul din Step1b și trimit direct packingInformation.
    if (!palletOnlyMode && autoPackingReady) {
      const payload = buildPackingPayload(packGroupsForAuto);
      submitPackingInformation({ packingGroups: payload.packingGroups, skipRefresh: true });
      setCompletedSteps((prev) => Array.from(new Set([...prev, '1', '1b'])));
      setCurrentStep('2');
      return;
    }

    completeAndNext('1');
  } catch (e) {
      const message = e?.message || 'Could not save quantities.';
      // cod 42501 -> RLS blocked (ex: insert din upsert)
      if (String(e?.code) === '42501') {
        setStep1SaveError(`${message} (RLS permission; re-authenticate or contact an admin).`);
      } else {
        setStep1SaveError(message);
      }
    } finally {
      setStep1Saving(false);
    }
  }, [
    allowNoInboundPlan,
    collectSkuIdentifiers,
    completeAndNext,
    fetchPlan,
    plan?.skus,
    removeSkuFromStep1Plan,
    skuServicesById,
    boxServices,
    persistServicesToDb,
    refreshStep,
    resolveInboundPlanId,
    resolveRequestId,
    skipPackingStep,
    snapshotServerUnits,
    wizardCopy
  ]);

  const renderContent = (stepKey) => {
    const step1VisibleSkus = (Array.isArray(plan?.skus) ? plan.skus : []).filter(
      (sku) => !step1HiddenSkuIds[String(sku?.id || '')]
    );
    const step1PlanData = { ...plan, skus: step1VisibleSkus };
    if (stepKey === '1') {
      const rawStep1Error = planError || step1SaveError;
      const step1HasPreviewGroups = Array.isArray(packGroupsPreviewForUnits)
        && packGroupsPreviewForUnits.some((g) => {
          const id = g?.packingGroupId || g?.id || '';
          return Boolean(id) && !String(id).toLowerCase().startsWith('fallback-');
        });
      const normalizedStep1Error = String(rawStep1Error || '').trim();
      const isTransientPackingWaitError =
        normalizedStep1Error === String(wizardCopy.packingWait || '').trim()
        || (/packing groups/i.test(normalizedStep1Error) && /try again/i.test(normalizedStep1Error));
      const suppressGenericStep1Error = step1HasPreviewGroups && isTransientPackingWaitError;
      return (
        <FbaStep1Inventory
          data={step1PlanData}
          skuStatuses={skuStatuses}
          blocking={blocking}
          saving={step1Saving}
          loadingPlan={!planLoaded || loadingPlan}
          inboundPlanId={resolveInboundPlanId()}
          requestId={resolveRequestId()}
          packGroupsPreview={packGroupsPreviewForUnits}
          packGroupsPreviewLoading={packGroupsPreviewLoading}
          packGroupsPreviewError={packGroupsPreviewError}
          boxPlan={step1BoxPlanForMarket}
          onBoxPlanChange={handleStep1BoxPlanChange}
          marketCode={currentMarket}
          allowNoInboundPlan={allowNoInboundPlan}
          inboundPlanMissing={inboundPlanMissing}
          onRetryInboundPlan={handleInboundPlanRetry}
          onBypassInboundPlan={handleInboundPlanBypass}
          onChangePacking={handlePackingChange}
          onChangeQuantity={handleQuantityChange}
          onRemoveSku={handleRemoveSku}
          onAddSku={handleAddSku}
          onChangeExpiry={handleExpiryChange}
          onChangePrep={handlePrepChange}
          onRecheckAssignment={handleRecheckAssignment}
          skuServicesById={skuServicesById}
          onSkuServicesChange={setSkuServicesById}
          boxServices={boxServices}
          onBoxServicesChange={setBoxServices}
          onPersistServices={persistServicesToDb}
          inboundPlanCopy={wizardCopy}
          palletOnlyMode={palletOnlyMode}
          skipPackingStep={skipPackingStep}
          onNext={persistStep1AndReloadPlan}
          operationProblems={operationProblems}
          onSubmitListingAttributes={submitListingAttributesForSku}
          notice={planNotice}
          error={suppressGenericStep1Error ? '' : rawStep1Error}
        />
      );
    }
    if (stepKey === '1b') {
      const rawStep1bError = planError || packingReadyError || packingSubmitError;
      const step1bHasPackGroups = Array.isArray(packGroupsForUnits)
        && packGroupsForUnits.some((g) => {
          const id = g?.packingGroupId || g?.id || '';
          return Boolean(id) && !String(id).toLowerCase().startsWith('fallback-');
        });
      const step1bHasPackingOptions = Array.isArray(packingOptions) && packingOptions.length > 0;
      const suppressGenericStep1bError = rawStep1bError === 'Edge Function returned a non-2xx status code'
        && step1bHasPackGroups
        && step1bHasPackingOptions;
      return (
        <FbaStep1bPacking
          packGroups={packGroupsForUnits}
          packGroupsLoaded={packGroupsLoaded}
          loading={loadingPlan || packingRefreshLoading}
          error={suppressGenericStep1bError ? '' : rawStep1bError}
          onRetry={refreshPackingGroups}
          retryLoading={packingRefreshLoading}
          submitting={packingSubmitLoading}
          autoPackingMode={autoPackingActive}
          palletMode={palletOnlyMode}
          onUpdateGroup={handlePackGroupUpdate}
          onNext={submitPackingInformation}
          onBack={() => goToStep('1')}
          packingOptions={packingOptions}
          packingOptionId={packingOptionId}
          onSelectPackingOption={handleSelectPackingOption}
        />
      );
    }
    if (stepKey === '2') {
      return (
        <FbaStep2Shipping
          shipment={{
            deliveryDate: shipmentMode.deliveryDate,
            deliveryWindowStart: shipmentMode.deliveryWindowStart,
            deliveryWindowEnd: shipmentMode.deliveryWindowEnd,
            method: shipmentMode.method,
            carrier: shipmentMode.carrier,
            palletDetails,
            shipments: shipmentsWithFallback,
            warning,
            palletSummary: derivedPalletSummary
          }}
          shippingOptions={shippingOptions}
          shippingSummary={shippingSummary}
          selectedTransportationOptionId={selectedTransportationOptionId}
          carrierTouched={carrierTouched}
          shippingConfirmed={shippingConfirmed}
          readyWindowByShipment={readyWindowByShipment}
          shippingLoading={shippingLoading}
          onOptionSelect={handleTransportationOptionSelect}
          onPalletDetailsChange={setPalletDetails}
          onShipDateChange={(date) => setShipmentMode((prev) => ({ ...prev, deliveryDate: date }))}
          onDeliveryWindowChange={(window) =>
            setShipmentMode((prev) => ({
              ...prev,
              deliveryWindowStart: window?.start || '',
              deliveryWindowEnd: window?.end || ''
            }))
          }
          onReadyWindowChange={handleReadyWindowChange}
          onGenerateOptions={fetchShippingOptions}
          error={shippingError}
          confirming={shippingConfirming}
          amazonLikePalletStep2={palletOnlyMode}
          onNext={confirmShippingOptions}
          onBack={() => goToStep(skipPackingStep ? '1' : '1b')}
        />
      );
    }
    if (stepKey === '3') {
      return (
        <FbaStep3Labels
          shipments={shipments}
          labelFormat={labelFormat}
          onFormatChange={setLabelFormat}
          onPrint={handlePrintLabels}
          onPrintBillOfLading={handlePrintBillOfLading}
          printLoadingId={labelsLoadingId}
          billOfLadingLoadingId={billOfLadingLoadingId}
          confirming={step3Confirming}
          error={step3Error || labelsError}
          manualFbaShipmentIds={manualFbaShipmentIds}
          onManualFbaShipmentIdChange={handleManualShipmentIdChange}
          isPalletFlow={Boolean(shipmentMode?.method && shipmentMode.method !== 'SPD')}
          isPartneredPalletFlow={Boolean(isPartneredShipment && shipmentMode?.method && shipmentMode.method !== 'SPD')}
          onBack={() => goToStep('2')}
          onNext={finalizeStep3}
        />
      );
    }
    return (
      <FbaStep4Tracking
        tracking={tracking}
        onUpdateTracking={handleTrackingChange}
        onBack={() => goToStep('3')}
        onFinish={submitTrackingDetails}
        error={trackingError}
        loading={trackingLoading}
        trackingDisabled={isPartneredShipment}
        trackingMode={shipmentMode?.method && shipmentMode.method !== 'SPD' ? 'pallet' : 'box'}
      />
    );
  };

  const skuCount = useMemo(() => {
    const visible = (Array.isArray(plan?.skus) ? plan.skus : []).filter(
      (sku) => !step1HiddenSkuIds[String(sku?.id || '')]
    );
    return visible.length;
  }, [plan?.skus, step1HiddenSkuIds]);
  const unitCount = useMemo(
    () => {
      const visible = (Array.isArray(plan?.skus) ? plan.skus : []).filter(
        (sku) => !step1HiddenSkuIds[String(sku?.id || '')]
      );
      return visible.reduce((s, it) => s + (Number(it.units) || 0), 0);
    },
    [plan?.skus, step1HiddenSkuIds]
  );
  const packUnits = useMemo(() => {
    if (Array.isArray(packGroups) && packGroups.length) {
      return packGroups.reduce((s, g) => s + (Number(g.units) || 0), 0);
    }
    // Fallback: derive from step1 box plan if pack groups are empty
    const groups = step1BoxPlanForMarket?.groups || {};
    const fromPlan = Object.values(groups).reduce((sum, grp) => {
      const boxItems = Array.isArray(grp?.boxItems) ? grp.boxItems : [];
      const total = boxItems.reduce((acc, box) => {
        return (
          acc +
          Object.values(box || {}).reduce((a, qty) => a + (Number(qty) || 0), 0)
        );
      }, 0);
      return sum + total;
    }, 0);
    return fromPlan > 0 ? fromPlan : unitCount;
  }, [packGroups, step1BoxPlanForMarket?.groups, unitCount]);

  const boxesCount = useMemo(() => {
    if (Array.isArray(packGroups) && packGroups.length) {
      return packGroups.reduce((s, g) => s + (Number(g.boxes) || 0), 0);
    }
    const groups = step1BoxPlanForMarket?.groups || {};
    const fromPlan = Object.values(groups).reduce((sum, grp) => {
      const boxes = Array.isArray(grp?.boxes) ? grp.boxes.length : 0;
      return sum + boxes;
    }, 0);
    return fromPlan;
  }, [packGroups, step1BoxPlanForMarket?.groups]);

  const shipmentSummary = useMemo(() => {
    const dests = Array.isArray(shipments) ? shipments.length : 0;
    const method = shipmentMode?.method || '—';
    const carrierName = String(shipmentMode?.carrier?.name || shipmentMode?.carrier?.code || '—');
    return { dests, method, carrierName };
  }, [shipments, shipmentMode]);

  const trackingSummary = useMemo(() => {
    const palletFlow = Boolean(shipmentMode?.method && shipmentMode.method !== 'SPD');
    const totalBoxes = Array.isArray(shipments)
      ? shipments.reduce((s, sh) => {
          if (palletFlow) return s + (Number(sh.palletQuantity || sh?.palletSummary?.quantity || 0) || 1);
          return s + (Number(sh.boxes) || 0);
        }, 0)
      : 0;
    const tracked = Array.isArray(tracking) ? tracking.filter((t) => t.trackingId).length : 0;
    return { totalBoxes, tracked };
  }, [shipments, tracking, shipmentMode?.method]);
  const shipmentFallbackTotals = useMemo(() => {
    const skuCountFallback = Array.isArray(plan?.skus) ? plan.skus.length : 0;
    const unitsFallback = packUnits || unitCount || 0;
    return { skuCountFallback, unitsFallback };
  }, [plan?.skus, packUnits, unitCount]);
  const shipmentsWithFallback = useMemo(() => {
    if (!Array.isArray(shipments)) return [];
    return shipments.map((sh) => ({
      ...sh,
      skuCount: sh?.skuCount ?? shipmentFallbackTotals.skuCountFallback,
      units: sh?.units ?? shipmentFallbackTotals.unitsFallback
    }));
  }, [shipments, shipmentFallbackTotals]);
  const autoShipPlanRef = useRef({ planId: null, attempted: false });

  const isCompleted = (key) => completedSteps.includes(key);
  const step2Complete = isCompleted('2') && shippingConfirmed;
  const step3Complete = isCompleted('3') && Boolean(labelFormat);
  const step4Complete = isCompleted('4') && (trackingSummary.tracked > 0 || isPartneredShipment);

  const renderStepRow = ({ stepKey, title, subtitle, summary }) => {
    const active = currentStep === stepKey;
    const done = isCompleted(stepKey);
    const canRefresh = stepKey === '2' || stepKey === '3' || stepKey === '4' || Boolean(fetchPlan);
    return (
      <div
        key={`step-row-${stepKey}`}
        className={`px-3 py-2 border border-slate-200 bg-white rounded-lg transition-all ${active ? 'ring-2 ring-blue-500' : ''}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Circle className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm truncate">{title}</div>
              <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>
              {summary && <div className="text-xs text-slate-600 truncate">{summary}</div>}
            </div>
          </div>
          <button
            onClick={() => goToStep(stepKey)}
            className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 whitespace-nowrap"
          >
            <Eye className="w-4 h-4" /> {tt('viewEdit', 'View/Edit')}
          </button>
          {canRefresh && (
            <button
              onClick={() => refreshStep(stepKey)}
              className="ml-2 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded-md px-2 py-1"
            >
              {tt('refresh', 'Refresh')}
            </button>
          )}
        </div>
        {active && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            {renderContent(stepKey)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full mx-auto max-w-5xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm flex items-center gap-2 text-slate-800 font-semibold">
        {tt('title', 'Send to Amazon')}
        <span className="text-xs text-slate-500 font-normal">{tt('subtitle', 'UI aligned to Amazon steps (live)')}</span>
      </div>

      <div className="space-y-2">
        {renderStepRow({
          stepKey: '1',
          title: tt('step1Title', 'Step 1 - Confirmed inventory to send'),
          subtitle: tp('Wizard.step1Subtitle', {
            skus: skuCount,
            units: unitCount,
            shipFrom: plan?.shipFrom?.name || plan?.shipFrom?.address || '—'
          }),
          summary: plan?.marketplace ? tp('Wizard.step1SummaryMarketplace', { marketplace: plan.marketplace }) : null
        })}
        {renderStepRow({
          stepKey: '1b',
          title: tt('step1bTitle', 'Step 1b - Pack individual units'),
          subtitle: tp('Wizard.step1bSubtitle', {
            groups: packGroups?.length || 0,
            units: packUnits,
            boxes: boxesCount
          }),
          summary: packGroups?.length ? tt('packReady', 'You can start packing now') : tt('noPackGroups', 'No pack groups yet')
        })}
        {renderStepRow({
          stepKey: '2',
          title: tt('step2Title', 'Step 2 - Confirm shipping'),
          subtitle:
            step2Complete
              ? tp('Wizard.step2SubtitleComplete', {
                  destinations: shipmentSummary.dests,
                  method: shipmentSummary.method,
                  carrier: shipmentSummary.carrierName
                })
              : tt('notStarted', 'Not started'),
          summary: null
        })}
        {renderStepRow({
          stepKey: '3',
          title: shipmentMode?.method && shipmentMode.method !== 'SPD'
            ? tt('step3TitlePallet', 'Step 3 - Pallet labels printed')
            : tt('step3Title', 'Step 3 - Box labels printed'),
          subtitle: step3Complete ? tp('Wizard.step3SubtitleComplete', { shipments: shipments?.length || 0 }) : tt('notStarted', 'Not started'),
          summary: step3Complete ? `${tt('labelFormat', 'Label format')}: ${labelFormat}` : null
        })}
        {renderStepRow({
          stepKey: '4',
          title: shipmentMode?.method && shipmentMode.method !== 'SPD'
            ? tt('step4TitlePallet', 'Final step: Pallet tracking details')
            : tt('step4Title', 'Final step: Tracking details'),
          subtitle:
            step4Complete
              ? tp('Wizard.step4SubtitleComplete', {
                  boxes: trackingSummary.totalBoxes,
                  tracking: trackingSummary.tracked
                })
              : tt('notStarted', 'Not started'),
          summary: step4Complete ? tt('trackingCaptured', 'Tracking captured') : null
        })}
      </div>
    </div>
  );
}
