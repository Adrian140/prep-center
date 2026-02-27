import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDashboardTranslation } from '@/translations';
import { STEP1_COPY } from './fbaStep1Copy';

const FieldLabel = ({ label, action = null, children }) => (
  <div className="flex flex-col gap-1 text-sm text-slate-700">
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-slate-800">{label}</span>
      {action}
    </div>
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

const parseLocalizedDecimal = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parsePositiveLocalizedDecimal = (value) => {
  const num = parseLocalizedDecimal(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const parsePositiveInteger = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
};

const PACKING_TYPE = {
  CASE: 'case',
  INDIVIDUAL: 'individual',
  SINGLE_SKU_PALLET: 'single_sku_pallet'
};

const normalizePackingType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === PACKING_TYPE.CASE) return PACKING_TYPE.CASE;
  if (raw === PACKING_TYPE.SINGLE_SKU_PALLET || raw === 'single-sku-pallet') return PACKING_TYPE.SINGLE_SKU_PALLET;
  return PACKING_TYPE.INDIVIDUAL;
};

export default function FbaStep1Inventory({
  data,
  skuStatuses = [],
  blocking = false,
  error = '',
  notice = '',
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
  onRemoveSku,
  onAddSku,
  onChangeExpiry,
  onChangePrep,
  onRecheckAssignment,
  skuServicesById = {},
  onSkuServicesChange,
  boxServices = [],
  onBoxServicesChange,
  onPersistServices,
  operationProblems = [],
  onSubmitListingAttributes,
  onNext
}) {
  const { currentLanguage } = useLanguage();
  const { t } = useDashboardTranslation();
  const copy = STEP1_COPY[currentLanguage] || STEP1_COPY.en;
  const tr = useCallback(
    (key, fallback = '', vars = {}) => {
      const path = `Wizard.${key}`;
      const fromDashboard = t(path);
      const template =
        fromDashboard !== path
          ? fromDashboard
          : copy[key] || STEP1_COPY.en[key] || fallback || key;
      return String(template).replace(/\{(\w+)\}/g, (_, varKey) => String(vars[varKey] ?? `{${varKey}}`));
    },
    [copy, t]
  );
  const normalizeReasonText = useCallback(
    (value) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim(),
    []
  );
  const translateSkuStatusReason = useCallback(
    (reason) => {
      const raw = String(reason || '').trim();
      if (!raw) return '';
      const normalized = normalizeReasonText(raw);
      if (
        normalized.includes('listing inexistent pe marketplace-ul destinatie') ||
        normalized.includes('listing inexistent pe marketplace-ul destinatiei') ||
        normalized.includes('listing missing on destination marketplace')
      ) {
        return tr('statusReasonListingMissingDestination');
      }
      if (
        normalized.includes('listing gasit cu status discoverable') ||
        normalized.includes('listing found with status discoverable')
      ) {
        return tr('statusReasonListingDiscoverable');
      }
      return raw;
    },
    [normalizeReasonText, tr]
  );
  const translatedNotice = useMemo(() => {
    const raw = String(notice || '').trim();
    if (!raw) return '';
    const missingSkuPattern =
      /^SKU\s+f[ăa]r[ăa]\s+listing\s+pe\s+marketplace\s+(.+?)\s*\((.+)\)\.\s*Verific[ăa]\s+dac[ăa]\s+exist[ăa]\s+ca\s+FBA\.?$/i;
    const match = raw.match(missingSkuPattern);
    if (match) {
      return tr('noticeMissingSkuOnMarketplace', '', {
        marketplace: String(match[1] || '').trim(),
        list: String(match[2] || '').trim()
      });
    }
    return raw;
  }, [notice, tr]);

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
  const skus = useMemo(
    () => rawSkus.filter((sku) => !sku?.excluded && Number(sku?.units || 0) > 0),
    [rawSkus]
  );
  const normalizeKey = useCallback((value) => String(value || '').trim().toUpperCase(), []);
  const getSkuCandidateKeys = useCallback(
    (sku) =>
      [
        sku?.sku,
        sku?.msku,
        sku?.SellerSKU,
        sku?.sellerSku,
        sku?.fnsku,
        sku?.fnSku,
        sku?.asin,
        sku?.id
      ]
        .map((v) => normalizeKey(v))
        .filter(Boolean),
    [normalizeKey]
  );
  const getItemCandidateKeys = useCallback(
    (item) =>
      [
        item?.sku,
        item?.msku,
        item?.SellerSKU,
        item?.sellerSku,
        item?.asin,
        item?.fnsku
      ]
        .map((v) => normalizeKey(v))
        .filter(Boolean),
    [normalizeKey]
  );
  const getSkuToken = useCallback(
    (sku, idx) => {
      const idKey = normalizeKey(sku?.id);
      if (idKey) return `ID:${idKey}`;
      const skuKey = normalizeKey(sku?.sku || sku?.msku || sku?.SellerSKU || sku?.sellerSku || sku?.asin || '');
      return `ROW:${idx}:${skuKey || 'UNKNOWN'}`;
    },
    [normalizeKey]
  );
  const companyId = data?.companyId || data?.company_id || null;
  const userId = data?.userId || data?.user_id || null;
  const [addSkuQuery, setAddSkuQuery] = useState('');
  const [addSkuOpen, setAddSkuOpen] = useState(false);
  const [inventoryResults, setInventoryResults] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [addSkuBusyKey, setAddSkuBusyKey] = useState('');
  const [recheckingSkuId, setRecheckingSkuId] = useState('');
  const [listingAttrDraftsBySku, setListingAttrDraftsBySku] = useState({});
  const [listingAttrSavingBySku, setListingAttrSavingBySku] = useState({});
  const [listingAttrErrorBySku, setListingAttrErrorBySku] = useState({});
  const [listingAttrLastSubmittedBySku, setListingAttrLastSubmittedBySku] = useState({});
  const ignoredItems = Array.isArray(data?.ignoredItems) ? data.ignoredItems : [];

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
  const addSkuCandidates = useMemo(() => {
    const normalizedQuery = String(addSkuQuery || '').trim().toLowerCase();
    const base = rawSkus.filter((sku) => sku?.excluded || Number(sku?.units || 0) <= 0);
    if (!normalizedQuery) return base;
    return base.filter((sku) => {
      const haystack = [sku?.title, sku?.product_name, sku?.sku, sku?.asin].map((v) => String(v || '').toLowerCase()).join(' ');
      return haystack.includes(normalizedQuery);
    });
  }, [addSkuQuery, rawSkus]);
  const activeSkuKeys = useMemo(() => {
    const set = new Set();
    skus.forEach((sku) => {
      const skuKey = String(sku?.sku || '').trim().toUpperCase();
      if (skuKey) set.add(`SKU:${skuKey}`);
      if (sku?.stock_item_id) set.add(`STOCK:${sku.stock_item_id}`);
    });
    return set;
  }, [skus]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!addSkuOpen) return;
      const q = String(addSkuQuery || '').trim();
      if (q.length < 2) {
        setInventoryResults([]);
        return;
      }
      if (!companyId && !userId) {
        setInventoryResults([]);
        return;
      }
      setInventoryLoading(true);
      try {
        let query = supabase
          .from('stock_items')
          .select('id, name, sku, asin, image_url, qty, company_id, user_id')
          .or(`name.ilike.%${q}%,sku.ilike.%${q}%,asin.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(30);
        if (companyId) {
          query = query.eq('company_id', companyId);
        } else if (userId) {
          query = query.eq('user_id', userId);
        }
        const { data: rows } = await query;
        if (cancelled) return;
        const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
          const skuKey = String(row?.sku || '').trim().toUpperCase();
          const stockKey = row?.id ? `STOCK:${row.id}` : '';
          if (stockKey && activeSkuKeys.has(stockKey)) return false;
          if (skuKey && activeSkuKeys.has(`SKU:${skuKey}`)) return false;
          return true;
        });
        setInventoryResults(filtered);
      } catch (e) {
        if (!cancelled) {
          setInventoryResults([]);
        }
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    };
    const timer = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addSkuOpen, addSkuQuery, activeSkuKeys, companyId, userId]);
  const missingInboundPlan = !resolvedInboundPlanId;
  const inboundCopy = {
    banner: '',
    wait: '',
    retry: '',
    continueAnyway: ''
  };
  const statusForSku = (sku) => {
    const skuKeys = getSkuCandidateKeys(sku);
    for (const key of skuKeys) {
        const match = skuStatuses.find((s) => {
          const statusKeys = [
            s?.sku,
            s?.msku,
            s?.SellerSKU,
            s?.sellerSku,
            s?.fnsku,
            s?.fnSku,
            s?.asin,
            s?.id
          ]
            .map((v) => normalizeKey(v))
            .filter(Boolean);
        return statusKeys.includes(key);
      });
      if (match) return match;
    }
    return { state: 'unknown', reason: '' };
  };
  const humanizeOperationProblem = useCallback((problem) => {
    const message = String(problem?.message || problem?.Message || '').trim();
    if (!message) return tr('opDefaultIssue');
    if (/prep classification/i.test(message)) {
      return tr('opMissingPrep');
    }
    if (/not available for inbound/i.test(message)) {
      return tr('opNotEligible');
    }
    const cleaned = message.replace(/\bFBA_INB_\d+\b[:\s-]*/gi, '').trim();
    return translateSkuStatusReason(cleaned);
  }, [tr, translateSkuStatusReason]);
  const listingAttrRequirementsBySku = useMemo(() => {
    const map = new Map();
    (Array.isArray(operationProblems) ? operationProblems : []).forEach((problem) => {
      const code = String(problem?.code || '').toUpperCase();
      const message = String(problem?.message || '').toLowerCase();
      const details = String(problem?.details || '').toLowerCase();
      const combined = `${message} ${details}`;
      const resourceMatch = String(problem?.details || '').match(/resource\s+'([^']+)'/i);
      const explicitSkuMatch = String(problem?.message || '').match(/\bSKU\s*[:=]\s*([A-Za-z0-9._\- ]+)/i);
      const resourceKey = normalizeKey(resourceMatch?.[1] || explicitSkuMatch?.[1] || '');
      if (!resourceKey) return;
      const needsDimensions =
        code === 'FBA_INB_0004' ||
        combined.includes('dimensions need to be provided');
      const needsWeight =
        code === 'FBA_INB_0005' ||
        combined.includes('weight need to be provided');
      if (!needsDimensions && !needsWeight) return;
      const current = map.get(resourceKey) || { needsDimensions: false, needsWeight: false, messages: [] };
      current.needsDimensions = current.needsDimensions || needsDimensions;
      current.needsWeight = current.needsWeight || needsWeight;
      if (problem?.message) current.messages.push(String(problem.message));
      map.set(resourceKey, current);
    });
    return map;
  }, [normalizeKey, operationProblems]);
  const operationProblemsBySkuKey = useMemo(() => {
    const map = new Map();
    const fnskuToSku = new Map();
    (Array.isArray(skuStatuses) ? skuStatuses : []).forEach((s) => {
      const fnskuKey = normalizeKey(s?.fnsku || s?.fnSku || '');
      const skuKey = normalizeKey(s?.sku || s?.msku || s?.SellerSKU || s?.sellerSku || '');
      if (fnskuKey && skuKey) fnskuToSku.set(fnskuKey, skuKey);
    });
    const add = (rawKey, message) => {
      const key = normalizeKey(rawKey);
      if (!key || !message) return;
      const list = map.get(key) || [];
      if (!list.includes(message)) list.push(message);
      map.set(key, list);
    };
    (Array.isArray(operationProblems) ? operationProblems : []).forEach((problem) => {
      const msg = humanizeOperationProblem(problem);
      if (!msg) return;
      const rawMessage = String(problem?.message || problem?.Message || '');
      const rawDetails = String(problem?.details || problem?.Details || '');
      const combined = `${rawMessage} ${rawDetails}`;

      const resourceMatch = combined.match(/resource\s+'([^']+)'/i);
      if (resourceMatch?.[1]) add(resourceMatch[1], msg);

      const skuMatch = combined.match(/\bSKU\s*[:=]\s*([A-Za-z0-9._\- ]+)/i);
      if (skuMatch?.[1]) add(skuMatch[1], msg);

      const asinMatch = combined.match(/\bASIN\s*[:=]\s*([A-Za-z0-9]{10})/i);
      if (asinMatch?.[1]) add(asinMatch[1], msg);

      const fnskuListMatch = combined.match(/\bfnskuList\s*:\s*([A-Za-z0-9,\s._\-]+)/i);
      if (fnskuListMatch?.[1]) {
        fnskuListMatch[1]
          .split(',')
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .forEach((fnsku) => {
            add(fnsku, msg);
            const mappedSku = fnskuToSku.get(normalizeKey(fnsku));
            if (mappedSku) add(mappedSku, msg);
          });
      }

      const fnskuMatch = combined.match(/\bFNSKU\s*[:=]\s*([A-Za-z0-9._\-]+)/i);
      if (fnskuMatch?.[1]) {
        add(fnskuMatch[1], msg);
        const mappedSku = fnskuToSku.get(normalizeKey(fnskuMatch[1]));
        if (mappedSku) add(mappedSku, msg);
      }
    });
    return map;
  }, [humanizeOperationProblem, normalizeKey, operationProblems, skuStatuses]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [boxOptions, setBoxOptions] = useState([]);
  const persistTimerRef = useRef(null);
  const serviceOptionsByCategory = useMemo(() => {
    const map = new Map();
    (serviceOptions || []).forEach((opt) => {
      const key = opt.category || 'Services';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(opt);
    });
    const order = ['FBA Prep Services', 'Extra Services'];
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      }
      return String(a[0]).localeCompare(String(b[0]));
    });
    return entries;
  }, [serviceOptions]);
  const boxOptionsByCategory = useMemo(() => {
    const map = new Map();
    (boxOptions || []).forEach((opt) => {
      const key = opt.category || 'Boxes';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(opt);
    });
    return Array.from(map.entries());
  }, [boxOptions]);
  const marketCodeForPricing = useMemo(() => {
    if (marketCode) return String(marketCode || '').toUpperCase();
    const map = {
      A13V1IB3VIYZZH: 'FR',
      A1PA6795UKMFR9: 'DE',
      A1RKKUPIHCS9HS: 'ES',
      APJ6JRA9NG5V4: 'IT'
    };
    return map[marketplaceId] || 'FR';
  }, [marketCode, marketplaceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('pricing_services')
        .select('id, category, service_name, price, unit, position, market')
        .eq('market', marketCodeForPricing)
        .order('category', { ascending: true })
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('Failed to load pricing services', error);
        return;
      }
      const list = data || [];
      const isBoxService = (item) => {
        const cat = String(item.category || '').toLowerCase();
        const name = String(item.service_name || '').toLowerCase();
        return cat.includes('box') || name.includes('box');
      };
      const nextServices = list.filter(
        (item) =>
          ['FBA Prep Services', 'Extra Services'].includes(item.category) &&
          !isBoxService(item)
      );
      const nextBoxes = list.filter((item) => isBoxService(item));
      setServiceOptions(nextServices);
      setBoxOptions(nextBoxes);
    })();
    return () => {
      cancelled = true;
    };
  }, [marketCodeForPricing]);

  const setSkuServices = useCallback((skuId, next) => {
    if (!onSkuServicesChange) return;
    onSkuServicesChange((prev) => ({ ...(prev || {}), [skuId]: next }));
  }, [onSkuServicesChange]);

  const withLocalId = useCallback(
    (entry) => ({ ...entry, _local_id: entry?._local_id || `svc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` }),
    []
  );

  const handleAddSkuService = useCallback((sku) => {
    const skuId = sku?.id;
    if (!skuId) return;
    const current = Array.isArray(skuServicesById?.[skuId]) ? skuServicesById[skuId] : [];
    const used = new Set(current.map((svc) => String(svc?.service_name || '')));
    const available = serviceOptions.filter((opt) => !used.has(String(opt.service_name || '')));
    const preferred =
      available.find((opt) => Number(opt.price || 0) === 0.5) ||
      available[0];
    const first = preferred;
    if (!first) return;
    const nextEntry = withLocalId({
      service_id: first.id,
      service_name: first.service_name,
      unit_price: Number(first.price || 0),
      units: Math.max(1, Number(sku.units || 0) || 1)
    });
    setSkuServices(skuId, [...current, nextEntry]);
  }, [serviceOptions, setSkuServices, skuServicesById, withLocalId]);

  const handleSkuServiceChange = useCallback((skuId, idx, patch) => {
    const current = Array.isArray(skuServicesById?.[skuId]) ? skuServicesById[skuId] : [];
    const next = current.map((row, i) => (i === idx ? withLocalId({ ...row, ...patch }) : row));
    setSkuServices(skuId, next);
  }, [setSkuServices, skuServicesById, withLocalId]);

  const handleRemoveSkuService = useCallback((skuId, idx) => {
    const current = Array.isArray(skuServicesById?.[skuId]) ? skuServicesById[skuId] : [];
    const next = current.filter((_, i) => i !== idx);
    setSkuServices(skuId, next);
  }, [setSkuServices, skuServicesById]);

  const setBoxes = useCallback((next) => {
    if (!onBoxServicesChange) return;
    onBoxServicesChange(next);
  }, [onBoxServicesChange]);

  const persistServicesSafely = useCallback(async () => {
    if (!onPersistServices) return;
    try {
      await onPersistServices();
    } catch (err) {
      console.warn('Failed to persist prep services', err);
    }
  }, [onPersistServices]);

  const schedulePersist = useCallback(() => {
    if (!onPersistServices) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistServicesSafely();
    }, 600);
  }, [onPersistServices, persistServicesSafely]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const handleAddBoxService = useCallback(() => {
    const first = boxOptions[0];
    if (!first) return;
    const nextEntry = withLocalId({
      service_id: first.id,
      service_name: first.service_name,
      unit_price: Number(first.price || 0),
      units: 1
    });
    const current = Array.isArray(boxServices) ? boxServices : [];
    setBoxes([...current, nextEntry]);
  }, [boxOptions, boxServices, setBoxes, withLocalId]);
  const skuEligibilityBlocking = skuStatuses.some((s) =>
    ['missing', 'inactive', 'restricted', 'inbound_unavailable'].includes(String(s.state))
  );
  const hasBlocking = blocking || skuEligibilityBlocking;

  const [packingModal, setPackingModal] = useState({
    open: false,
    sku: null,
    templateType: PACKING_TYPE.CASE,
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
  const LABEL_PRESETS = useMemo(() => {
    if (marketCodeForPricing === 'DE') {
      return {
        thermal: { width: '62', height: '29' },
        standard: { width: '63', height: '25' }
      };
    }
    return {
      thermal: { width: '50', height: '25' },
      standard: { width: '63', height: '25' }
    };
  }, [marketCodeForPricing]);

  const [labelModal, setLabelModal] = useState(() => ({
    open: false,
    sku: null,
    format: 'thermal',
    width: LABEL_PRESETS.thermal.width,
    height: LABEL_PRESETS.thermal.height,
    quantity: 1
  }));
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
  const boxScrollRefs = useRef({});

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
      return [{ groupId: 'ungrouped', label: tr('allItems') }];
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
            groupLabel: single.groupLabel || labelFallback || tr('singleBox'),
            boxes: Array.isArray(single.boxes) ? single.boxes : [],
            boxItems: Array.isArray(single.boxItems) ? single.boxItems : [],
            dimension_sets: Array.isArray(single.dimension_sets) ? single.dimension_sets : [],
            dimension_assignments:
              single.dimension_assignments && typeof single.dimension_assignments === 'object'
                ? single.dimension_assignments
                : {}
          };
        }
      }
      const existing = safeBoxPlan.groups?.[groupId];
      if (existing && typeof existing === 'object') {
        return {
          groupLabel: existing.groupLabel || labelFallback || groupId,
          boxes: Array.isArray(existing.boxes) ? existing.boxes : [],
          boxItems: Array.isArray(existing.boxItems) ? existing.boxItems : [],
          dimension_sets: Array.isArray(existing.dimension_sets) ? existing.dimension_sets : [],
          dimension_assignments:
            existing.dimension_assignments && typeof existing.dimension_assignments === 'object'
              ? existing.dimension_assignments
              : {}
        };
      }
      return {
        groupLabel: labelFallback || groupId,
        boxes: [],
        boxItems: [],
        dimension_sets: [],
        dimension_assignments: {}
      };
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
    const usedTokens = new Set();
    const skuByToken = new Map();
    const tokenById = new Map();
    const lookup = new Map();
    skus.forEach((sku, idx) => {
      const token = getSkuToken(sku, idx);
      skuByToken.set(token, sku);
      if (sku?.id) tokenById.set(sku.id, token);
      getSkuCandidateKeys(sku).forEach((key) => {
        if (!lookup.has(key)) lookup.set(key, []);
        lookup.get(key).push(token);
      });
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
      const token = sku?.id ? tokenById.get(sku.id) : null;
      if (token) usedTokens.add(token);
    };

    if (hasPackGroups) {
      normalizedPackGroups.forEach((group, idx) => {
        const groupId = group.packingGroupId || group.id || `pack-${idx + 1}`;
        const groupLabel = tr('packGroupN', '', { index: idx + 1 });
        const items = Array.isArray(group?.items) ? group.items : [];
        items.forEach((item) => {
          const keys = getItemCandidateKeys(item);
          if (!keys.length) return;
          let matched = null;
          for (const key of keys) {
            const candidates = lookup.get(key) || [];
            const freeToken = candidates.find((token) => !usedTokens.has(token));
            if (!freeToken) continue;
            matched = skuByToken.get(freeToken) || null;
            usedTokens.add(freeToken);
            break;
          }
          if (matched) {
            assignSku(matched, groupId, groupLabel);
          }
        });
      });
    }

    skus.forEach((sku, idx) => {
      const token = getSkuToken(sku, idx);
      if (usedTokens.has(token)) return;
      assignSku(sku, 'ungrouped', tr('allItems'));
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
  }, [getItemCandidateKeys, getSkuCandidateKeys, getSkuToken, hasPackGroups, normalizedPackGroups, skus, updateBoxPlan]);

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
  const getDimSetDraftKey = useCallback((groupId, setId, field) => {
    return `${groupId}::dimset::${setId}::${field}`;
  }, []);
  const setBoxScrollRef = useCallback((groupId, key) => (el) => {
    if (!el) return;
    if (!boxScrollRefs.current[groupId]) {
      boxScrollRefs.current[groupId] = {};
    }
    boxScrollRefs.current[groupId][key] = el;
  }, []);
  const syncBoxScroll = useCallback((groupId, sourceKey) => (event) => {
    const refs = boxScrollRefs.current[groupId];
    if (!refs) return;
    const targetKey = sourceKey === 'top' ? 'bottom' : 'top';
    const target = refs[targetKey];
    if (!target) return;
    const nextLeft = event.currentTarget.scrollLeft;
    if (target.scrollLeft !== nextLeft) {
      target.scrollLeft = nextLeft;
    }
  }, []);

  const deriveDimensionMetaFromBoxes = useCallback((groupId, groupPlan) => {
    const boxes = Array.isArray(groupPlan?.boxes) ? groupPlan.boxes : [];
    const keyToSetId = new Map();
    const sets = [];
    const assignments = {};
    boxes.forEach((box, idx) => {
      const length = Number(box?.length_cm ?? box?.length ?? 0);
      const width = Number(box?.width_cm ?? box?.width ?? 0);
      const height = Number(box?.height_cm ?? box?.height ?? 0);
      if (!length || !width || !height) return;
      const key = `${length}x${width}x${height}`;
      let setId = keyToSetId.get(key);
      if (!setId) {
        setId = `dimset-${groupId}-${keyToSetId.size + 1}`;
        keyToSetId.set(key, setId);
        sets.push({ id: setId, length_cm: length, width_cm: width, height_cm: height });
      }
      const boxId = box?.id || `${groupId}-box-${idx}`;
      assignments[boxId] = setId;
    });
    return { sets, assignments };
  }, []);

  const normalizeDimensionMeta = useCallback(
    (groupId, groupPlan) => {
      const existingSets = Array.isArray(groupPlan?.dimension_sets) ? groupPlan.dimension_sets : [];
      const existingAssignments =
        groupPlan?.dimension_assignments && typeof groupPlan.dimension_assignments === 'object'
          ? groupPlan.dimension_assignments
          : {};
      if (existingSets.length) {
        return { sets: existingSets, assignments: existingAssignments };
      }
      const derived = deriveDimensionMetaFromBoxes(groupId, groupPlan);
      if (derived.sets.length) return derived;
      return {
        sets: [{ id: `dimset-${groupId}-1`, length_cm: '', width_cm: '', height_cm: '' }],
        assignments: {}
      };
    },
    [deriveDimensionMetaFromBoxes]
  );

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
          const removedBox = current.boxes?.[boxIndex];
          const removedBoxId = removedBox?.id || `${groupId}-box-${boxIndex}`;
          const nextBoxes = (current.boxes || []).filter((_, idx) => idx !== boxIndex);
          const nextItems = (current.boxItems || []).filter((_, idx) => idx !== boxIndex);
          const nextAssignments = { ...(current.dimension_assignments || {}) };
          delete nextAssignments[removedBoxId];
          return { ...current, boxes: nextBoxes, boxItems: nextItems, dimension_assignments: nextAssignments };
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
          const prevValue = box[field];
          if (String(prevValue ?? '') === String(value ?? '')) {
            return current;
          }
          box[field] = value;
          nextBoxes[boxIndex] = box;
          return { ...current, boxes: nextBoxes };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const updateDimensionSet = useCallback(
    (groupId, setId, field, value, labelFallback, seedSet = null, seedAssignments = null) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextAssignments = {
            ...(seedAssignments && Object.keys(current.dimension_assignments || {}).length === 0
              ? seedAssignments
              : current.dimension_assignments || {})
          };
          const nextSets = Array.isArray(current.dimension_sets) ? [...current.dimension_sets] : [];
          let idx = nextSets.findIndex((s) => s.id === setId);
          if (idx < 0) {
            nextSets.push({
              id: setId,
              length_cm: seedSet?.length_cm ?? '',
              width_cm: seedSet?.width_cm ?? '',
              height_cm: seedSet?.height_cm ?? ''
            });
            idx = nextSets.length - 1;
          }
          const prevValue = nextSets[idx]?.[field];
          if (String(prevValue ?? '') === String(value ?? '')) {
            return current;
          }
          const nextSet = { ...nextSets[idx], [field]: value };
          nextSets[idx] = nextSet;
          nextBoxes.forEach((box, boxIdx) => {
            const boxId = box?.id || `${groupId}-box-${boxIdx}`;
            if (nextAssignments[boxId] === setId) {
              nextBoxes[boxIdx] = {
                ...box,
                length_cm: nextSet.length_cm ?? '',
                width_cm: nextSet.width_cm ?? '',
                height_cm: nextSet.height_cm ?? ''
              };
            }
          });
          return {
            ...current,
            boxes: nextBoxes,
            dimension_sets: nextSets,
            dimension_assignments: nextAssignments
          };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const handleBoxDetailsTab = useCallback((event) => {
    if (event.key !== 'Tab') return;
    const container = event.currentTarget.closest('[data-box-details]');
    if (!container) return;
    event.stopPropagation();
    const focusables = Array.from(
      container.querySelectorAll('[data-box-input="1"]')
    ).filter((el) => !el.disabled && el.tabIndex !== -1);
    if (focusables.length === 0) return;
    const currentIndex = focusables.indexOf(event.currentTarget);
    if (currentIndex === -1) return;
    const dir = event.shiftKey ? -1 : 1;
    let nextIndex = currentIndex + dir;
    if (nextIndex < 0) nextIndex = focusables.length - 1;
    if (nextIndex >= focusables.length) nextIndex = 0;
    event.preventDefault();
    const next = focusables[nextIndex];
    next?.focus?.();
  }, []);

  const handleBoxDetailsKeyDown = useCallback(
    (fallback) => (event) => {
      if (event.key === 'Tab') {
        handleBoxDetailsTab(event);
        return;
      }
      fallback?.(event);
    },
    [handleBoxDetailsTab]
  );

  const toggleDimensionAssignment = useCallback(
    (groupId, setId, box, boxIdx, checked, labelFallback, seedSet = null) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextAssignments = { ...(current.dimension_assignments || {}) };
          const nextSets = Array.isArray(current.dimension_sets) ? [...current.dimension_sets] : [];
          if (!nextSets.find((s) => s.id === setId)) {
            nextSets.push({
              id: setId,
              length_cm: seedSet?.length_cm ?? '',
              width_cm: seedSet?.width_cm ?? '',
              height_cm: seedSet?.height_cm ?? ''
            });
          }
          const set = nextSets.find((s) => s.id === setId);
          const boxId = box?.id || `${groupId}-box-${boxIdx}`;
          if (checked) {
            nextAssignments[boxId] = setId;
            nextBoxes[boxIdx] = {
              ...box,
              length_cm: set?.length_cm ?? '',
              width_cm: set?.width_cm ?? '',
              height_cm: set?.height_cm ?? ''
            };
          } else {
            if (nextAssignments[boxId] === setId) {
              delete nextAssignments[boxId];
            }
            nextBoxes[boxIdx] = {
              ...box,
              length_cm: '',
              width_cm: '',
              height_cm: ''
            };
          }
          return {
            ...current,
            boxes: nextBoxes,
            dimension_sets: nextSets,
            dimension_assignments: nextAssignments
          };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const addDimensionSet = useCallback(
    (groupId, labelFallback) => {
      const nextId = `dimset-${groupId}-${Date.now().toString(16)}`;
      updateGroupPlan(
        groupId,
        (current) => {
          const nextSets = Array.isArray(current.dimension_sets) ? [...current.dimension_sets] : [];
          nextSets.push({ id: nextId, length_cm: '', width_cm: '', height_cm: '' });
          return { ...current, dimension_sets: nextSets };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const removeDimensionSet = useCallback(
    (groupId, setId, labelFallback) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const currentSets = Array.isArray(current.dimension_sets) ? current.dimension_sets : [];
          if (currentSets.length <= 1) return current;
          const nextSets = currentSets.filter((set) => set?.id !== setId);
          const nextAssignments = { ...(current.dimension_assignments || {}) };
          const nextBoxes = [...(current.boxes || [])];
          nextBoxes.forEach((box, boxIdx) => {
            const boxId = box?.id || `${groupId}-box-${boxIdx}`;
            if (nextAssignments[boxId] !== setId) return;
            delete nextAssignments[boxId];
            nextBoxes[boxIdx] = {
              ...box,
              length_cm: '',
              width_cm: '',
              height_cm: ''
            };
          });
          return {
            ...current,
            boxes: nextBoxes,
            dimension_sets: nextSets,
            dimension_assignments: nextAssignments
          };
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
          return { ...current, boxes: nextBoxes, boxItems: nextItems };
        },
        labelFallback
      );
    },
    [updateGroupPlan]
  );

  const moveBoxItemQty = useCallback(
    (groupId, fromIdx, toIdx, skuKey, qty, labelFallback, keepZeroFrom = false, keepZeroTo = false) => {
      updateGroupPlan(
        groupId,
        (current) => {
          const nextBoxes = [...(current.boxes || [])];
          const nextItems = [...(current.boxItems || [])];
          while (nextBoxes.length <= Math.max(fromIdx, toIdx)) {
            nextBoxes.push({
              id: `box-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
              length_cm: '',
              width_cm: '',
              height_cm: '',
              weight_kg: ''
            });
          }
          while (nextItems.length <= Math.max(fromIdx, toIdx)) {
            nextItems.push({});
          }
          const fromItems = { ...(nextItems[fromIdx] || {}) };
          const toItems = { ...(nextItems[toIdx] || {}) };
          const nextQty = Number(qty || 0);
          if (nextQty <= 0) {
            if (keepZeroTo) {
              toItems[skuKey] = 0;
            } else {
              delete toItems[skuKey];
            }
          } else {
            toItems[skuKey] = nextQty;
          }
          if (keepZeroFrom) {
            fromItems[skuKey] = 0;
          } else {
            delete fromItems[skuKey];
          }
          nextItems[fromIdx] = fromItems;
          nextItems[toIdx] = toItems;
          return { ...current, boxes: nextBoxes, boxItems: nextItems };
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
        const currentIdxRaw = next[groupId];
        if (currentIdxRaw === undefined || currentIdxRaw === null) return;
        const currentIdx = Number(currentIdxRaw);
        if (!Number.isFinite(currentIdx)) return;
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
        groupLabel: tr('allItems')
      }));
    }
    const tokenToSku = new Map();
    const lookup = new Map();
    const usedTokens = new Set();
    skus.forEach((sku, idx) => {
      const token = getSkuToken(sku, idx);
      tokenToSku.set(token, sku);
      getSkuCandidateKeys(sku).forEach((key) => {
        if (!lookup.has(key)) lookup.set(key, []);
        lookup.get(key).push(token);
      });
    });
    const rows = [];
    normalizedPackGroups.forEach((group, idx) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      if (!items.length) return;
      const groupId = group.packingGroupId || group.id || `pack-${idx + 1}`;
      rows.push({
        type: 'group',
        label: tr('packGroupN', '', { index: idx + 1 }),
        subtitle: tr('itemsBelowPackedTogether'),
        key: groupId,
        groupId
      });
      items.forEach((it) => {
        const keys = getItemCandidateKeys(it);
        let matched = null;
        let matchedToken = null;
        for (const key of keys) {
          const candidates = lookup.get(key) || [];
          const freeToken = candidates.find((token) => !usedTokens.has(token));
          if (!freeToken) continue;
          matched = tokenToSku.get(freeToken) || null;
          matchedToken = freeToken;
          break;
        }
        if (matched && matchedToken) {
          usedTokens.add(matchedToken);
          rows.push({
            type: 'sku',
            sku: matched,
            key: matched.id,
            groupId,
            groupLabel: tr('packGroupN', '', { index: idx + 1 })
          });
        }
      });
    });
    const unassigned = skus.filter((sku, idx) => !usedTokens.has(getSkuToken(sku, idx)));
    if (unassigned.length) {
      rows.push({ type: 'group', label: tr('unassigned'), key: 'pack-unassigned', groupId: 'pack-unassigned' });
      unassigned.forEach((sku) =>
        rows.push({
          type: 'sku',
          sku,
          key: sku.id,
          groupId: 'pack-unassigned',
          groupLabel: tr('unassigned')
        })
      );
    }
    return rows;
  })();

  const planGroupsForDisplay = useMemo(() => {
    if (singleBoxMode) {
      return [{ groupId: 'single-box', label: tr('singleBox') }];
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
          map.set(row.sku.id, { groupId: 'single-box', groupLabel: tr('singleBox') });
        }
      });
      return map;
    }
    const map = new Map();
    groupedRows.forEach((row) => {
      if (row.type === 'sku') {
        map.set(row.sku.id, {
          groupId: row.groupId || 'ungrouped',
          groupLabel: row.groupLabel || tr('allItems')
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
      const groupInfo = skuGroupMap.get(sku.id) || { groupId: 'ungrouped', groupLabel: tr('allItems') };
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
        const isOversize = maxDim > MAX_STANDARD_BOX_CM;
        if (weight > MAX_STANDARD_BOX_KG) overweight += 1;
        const items = boxItems[idx] || {};
        const assigned = Object.values(items).reduce((sum, val) => sum + Number(val || 0), 0);
        if (assigned <= 0) emptyBoxes += 1;
        // EU SPD rule: boxes over 63.5 cm are acceptable only when that box contains exactly 1 unit.
        if (isOversize && assigned !== 1) oversize += 1;
      });
    });

    if (missingBoxes) issues.push(tr('validationMissingBoxes'));
    if (missingAssignments) issues.push(tr('validationMissingAssignments'));
    if (missingDims) issues.push(tr('validationMissingDims'));
    if (emptyBoxes) issues.push(tr('validationEmptyBoxes'));
    if (overweight) issues.push(tr('validationOverweight', '', { kg: MAX_STANDARD_BOX_KG }));
    if (oversize) {
      issues.push(tr('validationOversize', '', { cm: MAX_STANDARD_BOX_CM }));
    }

    return { isValid: issues.length === 0, messages: issues };
  }, [
    hasUnits,
    skus,
    skuGroupMap,
    getGroupPlan,
    planGroupsForDisplay,
    MAX_STANDARD_BOX_CM,
    MAX_STANDARD_BOX_KG,
    tr
  ]);

  const continueDisabled =
    hasBlocking ||
    saving ||
    (missingInboundPlan && !allowNoInboundPlan) ||
    !requestId ||
    !hasUnits ||
    !boxPlanValidation.isValid ||
    (loadingPlan && skus.length === 0);

  const renderSkuRow = (sku, groupId = 'ungrouped', groupLabel = tr('allItems')) => {
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
    const prepNeedsAction = prepList.length > 0 || sku.prepRequired;
    const prepNoticeClass = prepNeedsAction ? 'text-xs text-red-700' : 'text-xs text-emerald-700';
    const prepNoticeText = prepList.length
      ? tr('prepRequired', '', { list: prepList.join(', ') })
      : (sku.prepRequired ? tr('prepSetNeeded') : tr('prepSetNone'));
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
        ? tr('statusEligible')
        : state === 'missing'
          ? tr('statusListingMissing')
          : state === 'inactive'
            ? tr('statusListingInactive')
            : state === 'restricted'
              ? tr('statusRestricted')
              : tr('statusUnknown');
    const statusReason = translateSkuStatusReason(status.reason);

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
        ? Math.max(maxBoxIndex, 0)
        : Math.min(Math.max(0, Number(activeIndexRaw) || 0), Math.max(maxBoxIndex, 0));

    const servicesForSku = Array.isArray(skuServicesById?.[sku.id]) ? skuServicesById[sku.id] : [];
    const canRecheckAssignment = typeof onRecheckAssignment === 'function' && (groupLabel === tr('unassigned') || state === 'unknown');
    const isRechecking = recheckingSkuId === sku.id;
    const skuReqKey = normalizeKey(sku?.sku || sku?.msku || sku?.SellerSKU || sku?.sellerSku || sku?.asin || sku?.id || '');
    const listingAttrReq = listingAttrRequirementsBySku.get(skuReqKey) || null;
    const listingProblemMessages = [
      ...(operationProblemsBySkuKey.get(normalizeKey(sku?.sku)) || []),
      ...(operationProblemsBySkuKey.get(normalizeKey(sku?.asin)) || []),
      ...(operationProblemsBySkuKey.get(normalizeKey(sku?.fnsku)) || [])
    ];
    const listingProblem = listingProblemMessages.length ? listingProblemMessages[0] : '';
    const listingDraft = listingAttrDraftsBySku[skuReqKey] || { length_cm: '', width_cm: '', height_cm: '', weight_kg: '' };
    const listingSaving = Boolean(listingAttrSavingBySku[skuReqKey]);
    const listingError = listingAttrErrorBySku[skuReqKey] || '';
    const normalizedListingPayload = {
      length_cm: parsePositiveLocalizedDecimal(listingDraft.length_cm),
      width_cm: parsePositiveLocalizedDecimal(listingDraft.width_cm),
      height_cm: parsePositiveLocalizedDecimal(listingDraft.height_cm),
      weight_kg: parsePositiveLocalizedDecimal(listingDraft.weight_kg)
    };
    const hasRequiredDimensions =
      !listingAttrReq?.needsDimensions ||
      (normalizedListingPayload.length_cm && normalizedListingPayload.width_cm && normalizedListingPayload.height_cm);
    const hasRequiredWeight = !listingAttrReq?.needsWeight || normalizedListingPayload.weight_kg;
    const hasRequiredListingAttrs = Boolean(hasRequiredDimensions && hasRequiredWeight);
    const lastSubmittedListingAttrs = listingAttrLastSubmittedBySku[skuReqKey] || null;
    const listingFieldsToCompare = [
      ...(listingAttrReq?.needsDimensions ? ['length_cm', 'width_cm', 'height_cm'] : []),
      ...(listingAttrReq?.needsWeight ? ['weight_kg'] : [])
    ];
    const hasListingAttrChanges =
      !lastSubmittedListingAttrs ||
      listingFieldsToCompare.some((field) => normalizedListingPayload[field] !== lastSubmittedListingAttrs[field]);
    const canSubmitListingAttrs = Boolean(
      listingAttrReq && !listingSaving && hasRequiredListingAttrs && hasListingAttrChanges
    );
    const unitsPerBox = parsePositiveInteger(sku.unitsPerBox);
    const normalizedPackingType = normalizePackingType(sku.packing);
    const isCasePacked = normalizedPackingType === PACKING_TYPE.CASE || !!unitsPerBox;
    const computedBoxesCount = unitsPerBox
      ? Math.max(1, parsePositiveInteger(sku.boxesCount) || Math.ceil((Number(sku.units || 0) || 0) / unitsPerBox) || 1)
      : null;
    const effectiveUnits = Number(sku.units || 0) || 0;
    return (
      <tr key={sku.id} className="align-top">
        <td className="py-3 w-[320px] min-w-[320px]">
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
              <div className="text-xs text-slate-500">{tr('skuLabelShort')}: {sku.sku}</div>
              <div className="text-xs text-slate-500">ASIN: {sku.asin}</div>
              <div className="text-xs text-slate-500">{tr('storageLabel')}: {sku.storageType}</div>
              <div className={`mt-2 inline-flex items-center gap-2 text-xs border px-2 py-1 rounded ${badgeClass}`}>
                {badgeLabel}
                {statusReason ? <span className="text-slate-500">· {statusReason}</span> : null}
              </div>
              {listingProblem ? (
                <div className="mt-1 text-xs text-red-700 font-medium">{listingProblem}</div>
              ) : null}
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
                const templateUnits = parsePositiveInteger(template.units_per_box);
                const normalizedTemplateType = normalizePackingType(template.template_type);
                const nextBoxes = templateUnits
                  ? Math.max(1, Math.ceil((Number(sku.units || 0) || 0) / templateUnits))
                  : null;
                onChangePacking(sku.id, {
                  packing: normalizedTemplateType,
                  packingTemplateId: template.id,
                  packingTemplateName: template.name,
                  unitsPerBox: templateUnits,
                  boxesCount: nextBoxes,
                  boxLengthCm: template.box_length_cm ?? null,
                  boxWidthCm: template.box_width_cm ?? null,
                  boxHeightCm: template.box_height_cm ?? null,
                  boxWeightKg: template.box_weight_kg ?? null
                });
                return;
              }
              onChangePacking(sku.id, {
                packing: val,
                packingTemplateId: null,
                packingTemplateName: null,
                unitsPerBox: null,
                boxesCount: null,
                boxLengthCm: null,
                boxWidthCm: null,
                boxHeightCm: null,
                boxWeightKg: null
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
            <option value="individual">{tr('optionIndividualUnits')}</option>
            <option value="case">{tr('optionCasePacked')}</option>
            <option value="single_sku_pallet">{tr('optionSingleSkuPallet')}</option>
            <option value="__template__">{tr('optionCreatePackingTemplate')}</option>
          </select>
        </td>
        <td className="py-3">
          <div className="space-y-1">
            {labelOwner && (
              <div className="text-xs text-slate-500">
                {tr('labelOwner')}: <span className="font-semibold">{labelOwner}</span>
              </div>
            )}
            {needsPrepNotice && (
              <div className={prepNoticeClass}>
                {prepNoticeText}
              </div>
            )}
            {needsExpiry && <div className="text-xs text-amber-700">{tr('expirationDateRequired')}</div>}
            <div className="flex flex-col items-start gap-1">
              {showLabelButton && (
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => openLabelModal(sku)}
                >
                  {tr('printSkuLabels')}
                </button>
              )}
              <button
                className="text-xs text-blue-600 underline"
                onClick={() => openPrepModal(sku, sku.manufacturerBarcodeEligible !== false)}
              >
                {tr('moreInputs')}
              </button>
              {canRecheckAssignment && (
                <button
                  className="text-xs text-amber-700 underline disabled:opacity-60"
                  disabled={isRechecking}
                  onClick={async () => {
                    try {
                      setRecheckingSkuId(sku.id);
                      await onRecheckAssignment?.(sku);
                    } finally {
                      setRecheckingSkuId('');
                    }
                  }}
                >
                  {isRechecking ? tr('rechecking') : tr('recheckAssign')}
                </button>
              )}
            </div>
            {sku.readyToPack && (
              <div className="mt-2 flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                <CheckCircle className="w-4 h-4" /> {tr('readyToPack')}
              </div>
            )}
            {sku.packingTemplateName && (
              <div className="text-[11px] text-slate-600">
                {tr('templateLabel')}: <span className="font-semibold">{sku.packingTemplateName}</span>
                {unitsPerBox ? ` · ${tr('unitsPerBoxShort')}: ${unitsPerBox}` : ''}
              </div>
            )}
            {!sku.packingTemplateName && isCasePacked && unitsPerBox && (
              <div className="text-[11px] text-slate-600">
                {tr('casePackUnitsPerBox')}: <span className="font-semibold">{unitsPerBox}</span>
              </div>
            )}
            {!sku.packingTemplateName && normalizedPackingType === PACKING_TYPE.SINGLE_SKU_PALLET && (
              <div className="text-[11px] text-slate-600">{tr('optionSingleSkuPallet')}</div>
            )}
            {listingAttrReq && (
              <div className="mt-2 p-2 border border-amber-200 rounded-md bg-amber-50 space-y-2">
                <div className="text-[11px] font-semibold text-amber-800">
                  {tr('amazonNeedsPackageAttrs')}
                </div>
                {listingAttrReq.needsDimensions && (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={tr('dimLcmPlaceholder')}
                      value={listingDraft.length_cm}
                      onChange={(e) =>
                        setListingAttrDraftsBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: {
                            ...(prev?.[skuReqKey] || {}),
                            length_cm: e.target.value
                          }
                        }))
                      }
                      className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                    />
                    <span className="text-slate-400 text-[10px]">x</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={tr('dimWcmPlaceholder')}
                      value={listingDraft.width_cm}
                      onChange={(e) =>
                        setListingAttrDraftsBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: {
                            ...(prev?.[skuReqKey] || {}),
                            width_cm: e.target.value
                          }
                        }))
                      }
                      className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                    />
                    <span className="text-slate-400 text-[10px]">x</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={tr('dimHcmPlaceholder')}
                      value={listingDraft.height_cm}
                      onChange={(e) =>
                        setListingAttrDraftsBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: {
                            ...(prev?.[skuReqKey] || {}),
                            height_cm: e.target.value
                          }
                        }))
                      }
                      className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                    />
                  </div>
                )}
                {listingAttrReq.needsWeight && (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={tr('weightKg')}
                    value={listingDraft.weight_kg}
                    onChange={(e) =>
                      setListingAttrDraftsBySku((prev) => ({
                        ...(prev || {}),
                        [skuReqKey]: {
                          ...(prev?.[skuReqKey] || {}),
                          weight_kg: e.target.value
                        }
                      }))
                    }
                    className="w-24 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                  />
                )}
                <button
                  type="button"
                  disabled={!canSubmitListingAttrs}
                  className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-2 py-1 rounded"
                  onClick={async () => {
                    try {
                      setListingAttrErrorBySku((prev) => ({ ...(prev || {}), [skuReqKey]: '' }));
                      setListingAttrSavingBySku((prev) => ({ ...(prev || {}), [skuReqKey]: true }));
                      const payload = { ...normalizedListingPayload };
                      if (listingAttrReq.needsDimensions) {
                        const l = Number(payload.length_cm || 0);
                        const w = Number(payload.width_cm || 0);
                        const h = Number(payload.height_cm || 0);
                        if (!(l > 0 && w > 0 && h > 0)) {
                          throw new Error(tr('completeProductDimensions'));
                        }
                      }
                      if (listingAttrReq.needsWeight) {
                        const weight = Number(payload.weight_kg || 0);
                        if (!(weight > 0)) {
                          throw new Error(tr('completeProductWeight'));
                        }
                      }
                      if (typeof onSubmitListingAttributes === 'function') {
                        await onSubmitListingAttributes(sku?.sku || skuReqKey, payload);
                        setListingAttrLastSubmittedBySku((prev) => ({
                          ...(prev || {}),
                          [skuReqKey]: payload
                        }));
                      }
                    } catch (e) {
                      setListingAttrErrorBySku((prev) => ({
                        ...(prev || {}),
                        [skuReqKey]: e?.message || tr('couldNotSendAttrs')
                      }));
                    } finally {
                      setListingAttrSavingBySku((prev) => ({ ...(prev || {}), [skuReqKey]: false }));
                    }
                  }}
                >
                  {listingSaving ? tr('sending') : tr('sendProductAttrs')}
                </button>
                {!listingSaving && !hasListingAttrChanges ? (
                  <div className="text-[11px] text-slate-600">{tr('noChangesToSend')}</div>
                ) : null}
                {listingError ? <div className="text-[11px] text-red-700">{listingError}</div> : null}
              </div>
            )}
          </div>
        </td>
        <td className="py-3">
          <div className="flex flex-col gap-2">
            {isCasePacked && unitsPerBox ? (
              <div className="grid grid-cols-[72px_12px_72px] items-center gap-2">
                <input
                  type="number"
                  className="w-[72px] border rounded-md px-2 py-1 text-sm"
                  value={computedBoxesCount || 0}
                  min={0}
                  onKeyDown={preventEnterSubmit}
                  onChange={(e) => {
                    const nextBoxes = Math.max(0, parsePositiveInteger(e.target.value) || 0);
                    const nextUnits = nextBoxes * unitsPerBox;
                    onChangePacking?.(sku.id, { boxesCount: nextBoxes || null });
                    onChangeQuantity(sku.id, nextUnits);
                  }}
                />
                <span className="text-slate-400 text-xs text-center">=</span>
                <input
                  type="number"
                  className="w-[72px] border rounded-md px-2 py-1 text-sm bg-slate-100 text-slate-600"
                  value={effectiveUnits}
                  min={0}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
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
                  type="button"
                  className="px-2 py-1 border rounded-md text-sm"
                  onClick={() => onChangeQuantity(sku.id, Number(sku.units || 0) + 1)}
                >
                  +
                </button>
              </div>
            )}
            {needsExpiry && (
              <input
                type="date"
                value={sku.expiryDate || sku.expiry || ''}
                onChange={(e) => onChangeExpiry(sku.id, e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              />
            )}
            <button
              type="button"
              className="self-start text-xs text-red-600 underline"
              onClick={() => onRemoveSku?.(sku.id)}
            >
              {tr('removeListing')}
            </button>
            <div className="border border-slate-200 rounded-md p-2 bg-slate-50">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>{tr('boxes')}</span>
                <button
                  className="text-blue-600 underline"
                  type="button"
                  onClick={() => {
                    const currentCount = Math.max(0, boxes.length);
                    const hasAssignments = assignedEntries.length > 0;
                    const clampedActive = currentCount > 0 ? Math.max(0, Math.min(activeIndex, currentCount - 1)) : activeIndex;
                    const targetIdx = hasAssignments ? currentCount : clampedActive;
                    updateBoxItemQty(groupId, targetIdx, skuKey, 0, groupLabel, true);
                    setActiveBoxIndex(groupId, targetIdx);
                  }}
                >
                  {tr('addBox', '+ Add box')}
                </button>
              </div>
              {assignedEntries.length === 0 && boxes.length === 0 && (
                <div className="text-xs text-slate-500 mt-1">{tr('noBoxesAssignedYet')}</div>
              )}
              {(
                assignedEntries.length > 0
                  ? assignedEntries
                  : boxes.length
                    ? [{ boxIdx: activeIndex, qty: 0, hasKey: true, isPlaceholder: true }]
                    : []
              ).map((entry) => {
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
                  moveBoxItemQty(
                    groupId,
                    entry.boxIdx,
                    nextIdx,
                    skuKey,
                    entry.qty,
                    groupLabel,
                    entry.hasKey || entry.isPlaceholder,
                    true
                  );
                  setActiveBoxIndex(groupId, nextIdx);
                  setBoxIndexDrafts((prev) => {
                    const next = { ...(prev || {}) };
                    delete next[draftKey];
                    return next;
                  });
                };
                return (
                <div key={`${skuKey}-box-${entry.boxIdx}`} className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-500">{tr('box')}</span>
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
                  <span className="text-xs text-slate-500">{tr('units')}</span>
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
                    title={tr('remove')}
                  >
                    ✕
                  </button>
                </div>
              );
              })}
              <div className={`text-xs mt-2 ${assignedMismatch ? 'text-amber-700' : 'text-slate-500'}`}>
                {tr('assigned')}: {assignedTotal} / {Number(sku.units || 0)}
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 w-[320px] min-w-[320px]">
          <div className="space-y-2 w-[320px] min-w-[320px] max-w-[320px]">
            {servicesForSku.length === 0 && (
              <div className="text-xs text-slate-500">{tr('noServicesSelected')}</div>
            )}
            {servicesForSku.map((svc, idx) => {
              const total = Number(svc.unit_price || 0) * Number(svc.units || 0);
              const usedNames = new Set(
                servicesForSku
                  .map((entry, j) => (j === idx ? null : String(entry?.service_name || '')))
                  .filter(Boolean)
              );
              const availableOptions = serviceOptionsByCategory
                .map(([category, options]) => [
                  category,
                  options.filter((opt) => !usedNames.has(String(opt.service_name || '')))
                ])
                .filter(([, options]) => options.length > 0);
              return (
                <div
                  key={svc?._local_id || `${sku.id}-svc-${idx}`}
                  className="border border-slate-200 rounded-md p-2 w-full"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      className="border rounded-md px-2 py-1 text-xs flex-1 min-w-0 w-full whitespace-normal break-words"
                      value={svc.service_name || ''}
                      onChange={(e) => {
                        const selected = serviceOptions.find((opt) => opt.service_name === e.target.value);
                        if (!selected) return;
                        handleSkuServiceChange(sku.id, idx, {
                          service_id: selected.id,
                          service_name: selected.service_name,
                          unit_price: Number(selected.price || 0)
                        });
                        schedulePersist();
                      }}
                    >
                      {availableOptions.map(([category, options]) => (
                        <optgroup key={category} label={category}>
                          {options.map((opt) => (
                            <option key={opt.id || opt.service_name} value={opt.service_name}>
                              {opt.service_name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => handleRemoveSkuService(sku.id, idx)}
                    >
                      {tr('remove')}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                      <span>{tr('unit')}</span>
                      <span className="font-semibold">{Number(svc.unit_price || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{tr('qty')}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="w-16 border rounded-md px-2 py-1 text-xs text-right"
                        value={svc.units ?? 0}
                        onChange={(e) => {
                          handleSkuServiceChange(sku.id, idx, { units: Number(e.target.value || 0) });
                          schedulePersist();
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{tr('total')}</span>
                      <span className="font-semibold">{Number.isFinite(total) ? total.toFixed(2) : '0.00'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {serviceOptions.length > servicesForSku.length ? (
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={() => {
                  handleAddSkuService(sku);
                  schedulePersist();
                }}
              >
                {tr('addService')}
              </button>
            ) : (
              <div className="text-[11px] text-slate-500">{tr('allServicesAdded')}</div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderIgnoredSkuRow = (item, idx) => {
    const itemId = item?.id || `ignored-${idx + 1}`;
    const title = item?.product_name || `Line ${idx + 1}`;
    const asin = item?.asin || '—';
    const units = Number(item?.units || 0) || 0;
    const reason = translateSkuStatusReason(item?.reason || tr('skuMissing'));
    return (
      <tr key={`ignored-${itemId}`} className="align-top bg-slate-50 opacity-80">
        <td className="py-3 w-[320px] min-w-[320px]">
          <div className="flex gap-3">
            <img
              src={placeholderImg}
              alt={title}
              className="w-12 h-12 object-contain border border-slate-200 rounded"
            />
            <div>
              <div className="font-semibold text-slate-900">{title}</div>
              <div className="text-xs text-slate-500">{tr('skuMissing')}</div>
              <div className="text-xs text-slate-500">ASIN: {asin}</div>
              <div className="mt-2 inline-flex items-center gap-2 text-xs border px-2 py-1 rounded text-amber-800 bg-amber-50 border-amber-200">
                {tr('ignored')}
                <span className="text-slate-500">· {reason}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 text-xs text-slate-500">{tr('blockedUntilSkuCompleted')}</td>
        <td className="py-3 text-xs text-slate-500">{tr('excludedFromStep1bShipping')}</td>
        <td className="py-3">
          <div className="text-sm text-slate-600">{units}</div>
        </td>
        <td className="py-3 w-[320px] min-w-[320px]">
          <div className="text-xs text-slate-500">{tr('servicesLockedIgnored')}</div>
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
    setTemplateError('');
    const currentUnitsPerBox = parsePositiveInteger(sku?.unitsPerBox);
    setPackingModal({
      open: true,
      sku,
      templateType: normalizePackingType(sku?.packing || sku?.packingTemplateType || null),
      unitsPerBox: currentUnitsPerBox ? String(currentUnitsPerBox) : '',
      boxL: sku?.boxLengthCm ? String(sku.boxLengthCm) : '',
      boxW: sku?.boxWidthCm ? String(sku.boxWidthCm) : '',
      boxH: sku?.boxHeightCm ? String(sku.boxHeightCm) : '',
      boxWeight: sku?.boxWeightKg ? String(sku.boxWeightKg) : '',
      templateName: sku?.packingTemplateName || ''
    });
  };

  const closePackingModal = () => setPackingModal((prev) => ({ ...prev, open: false, sku: null }));

  const savePackingTemplate = async () => {
    if (!packingModal.sku) return;
    setTemplateError('');
    const derivedName =
      packingModal.templateName || (packingModal.unitsPerBox ? `${tr('packPrefix')} ${packingModal.unitsPerBox}` : '');
    if (!derivedName) {
      setTemplateError(tr('setNameOrUnitsTemplate'));
      return;
    }

    const templateType = normalizePackingType(packingModal.templateType);
    const unitsPerBox = parsePositiveInteger(packingModal.unitsPerBox);
    if (templateType === PACKING_TYPE.CASE && !unitsPerBox) {
      setTemplateError(tr('unitsPerBoxGreaterThanZero'));
      return;
    }
    const boxLengthCm = parsePositiveLocalizedDecimal(packingModal.boxL);
    const boxWidthCm = parsePositiveLocalizedDecimal(packingModal.boxW);
    const boxHeightCm = parsePositiveLocalizedDecimal(packingModal.boxH);
    const boxWeightKg = parsePositiveLocalizedDecimal(packingModal.boxWeight);
    const boxesCount = unitsPerBox
      ? Math.max(1, Math.ceil((Number(packingModal.sku.units || 0) || 0) / unitsPerBox))
      : null;
    let savedTemplateId = null;

    // Persist template if we have a name and companyId.
    // Keep modal open on any error so user can continue editing.
    if (!data?.companyId) {
      setTemplateError(tr('missingCompanyIdTemplate'));
      return;
    }
    try {
      const payload = {
        company_id: data.companyId,
        marketplace_id: marketplaceId,
        sku: packingModal.sku.sku || null,
        asin: packingModal.sku.asin || null,
        name: derivedName,
        template_type: templateType,
        units_per_box: unitsPerBox,
        box_length_cm: boxLengthCm,
        box_width_cm: boxWidthCm,
        box_height_cm: boxHeightCm,
        box_weight_kg: boxWeightKg
      };
      // Avoid relying on DB unique constraint for ON CONFLICT; some environments miss it.
      const { data: existingRow, error: existingErr } = await supabase
        .from('packing_templates')
        .select('id')
        .eq('company_id', payload.company_id)
        .eq('marketplace_id', payload.marketplace_id)
        .eq('sku', payload.sku)
        .eq('name', payload.name)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existingRow?.id) {
        const { data: updatedRow, error: updateErr } = await supabase
          .from('packing_templates')
          .update(payload)
          .eq('id', existingRow.id)
          .select('id')
          .maybeSingle();
        if (updateErr) throw updateErr;
        savedTemplateId = updatedRow?.id || existingRow.id;
      } else {
        const { data: insertedRow, error: insertErr } = await supabase
          .from('packing_templates')
          .insert(payload)
          .select('id')
          .maybeSingle();
        if (insertErr) throw insertErr;
        savedTemplateId = insertedRow?.id || null;
      }
      // Reload templates
      const { data: rows } = await supabase
        .from('packing_templates')
        .select('*')
        .eq('company_id', data.companyId)
        .eq('marketplace_id', marketplaceId);
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setTemplateError(e?.message || tr('couldNotSaveTemplate'));
      return;
    }

    onChangePacking(packingModal.sku.id, {
      packing: templateType,
      packingTemplateId: savedTemplateId,
      packingTemplateName: derivedName || null,
      unitsPerBox,
      boxesCount,
      boxLengthCm,
      boxWidthCm,
      boxHeightCm,
      boxWeightKg
    });
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
    const unitsToSend = Math.max(1, Number(sku.units || 0) || 0);
    setLabelModal({
      open: true,
      sku,
      format: 'thermal',
      width: LABEL_PRESETS.thermal.width,
      height: LABEL_PRESETS.thermal.height,
      quantity: unitsToSend
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
        throw new Error(error.message || tr('couldNotRequestLabels'));
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
        setLabelError(tr('labelRequestSentRetry'));
        return;
      }
      throw new Error(tr('missingDownloadUrlOrOperationId'));
    } catch (err) {
      console.error('fba-labels error', err);
      setLabelError(err?.message || tr('couldNotDownloadLabels'));
    } finally {
      setLabelLoading(false);
    }
  };

  const prepCategoryLabel = (value) => {
    switch (value) {
      case 'fragile':
        return tr('prepFragileGlass');
      case 'liquids':
        return tr('prepLiquidsNonGlass');
      case 'perforated':
        return tr('prepPerforatedPackaging');
      case 'powder':
        return tr('prepPowderPelletsGranular');
      case 'small':
        return tr('prepSmall');
      case 'none':
      default:
        return tr('noPrepNeeded');
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
        setTemplateError(e?.message || tr('couldNotLoadTemplates'));
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
          <div className="font-semibold text-slate-900">{tr('step1Title')}</div>
          <div className="text-sm text-slate-500">
            {tr('skusConfirmedShort', '', { count: skus.length })}
            {ignoredItems.length > 0 ? ` · ${tr('ignoredLinesShort', '', { count: ignoredItems.length })}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md shadow-sm"
            onClick={() => setAddSkuOpen((prev) => !prev)}
          >
            {addSkuOpen ? tr('closeAdd') : tr('addProduct')}
          </button>
        </div>
      </div>
      {addSkuOpen && (
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={addSkuQuery}
              onChange={(e) => setAddSkuQuery(e.target.value)}
              placeholder={tr('searchSkuAsinName')}
              className="border rounded-md px-3 py-2 text-sm w-full md:w-[420px] bg-white"
            />
            <div className="text-xs text-slate-500">{tr('searchInventoryHint')}</div>
            <div className="max-h-56 overflow-auto border border-slate-200 rounded-md bg-white">
              {inventoryLoading && (
                <div className="px-3 py-2 text-xs text-slate-500">{tr('searchingInventory')}</div>
              )}
              {!inventoryLoading && inventoryResults.map((item) => {
                const key = `inventory-${item.id}`;
                const busy = addSkuBusyKey === key;
                const stockQty = Number.isFinite(Number(item?.qty)) ? Number(item.qty) : 0;
                return (
                  <div key={key} className="px-3 py-2 flex items-center justify-between gap-3 border-b last:border-b-0 bg-emerald-50/40">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate">{item.name || item.sku || item.asin}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {tr('skuLabelShort')}: {item.sku || '—'} · {tr('asinLabelShort')}: {item.asin || '—'} · {tr('stockLabelShort')}: {stockQty}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-2 py-1 rounded"
                      onClick={async () => {
                        try {
                          setAddSkuBusyKey(key);
                          await onAddSku?.({
                            source: 'inventory',
                            stockItemId: item.id,
                            sku: item.sku || null,
                            asin: item.asin || null,
                            title: item.name || null,
                            image: item.image_url || null
                          });
                        } finally {
                          setAddSkuBusyKey('');
                        }
                      }}
                    >
                      {tr('add')}
                    </button>
                  </div>
                );
              })}
              {!inventoryLoading && addSkuQuery.trim().length >= 2 && inventoryResults.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500 border-b">{tr('noInventoryResults')}</div>
              )}
              {addSkuCandidates.length > 0 && (
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b">
                  {tr('hiddenInRequest')}
                </div>
              )}
              {addSkuCandidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">{tr('noHiddenProducts')}</div>
              ) : (
                addSkuCandidates.slice(0, 50).map((sku) => (
                  <div key={`add-${sku.id}`} className="px-3 py-2 flex items-center justify-between gap-3 border-b last:border-b-0">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate">{sku.title || sku.product_name || sku.sku || sku.asin}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {tr('skuLabelShort')}: {sku.sku || '—'} · {tr('asinLabelShort')}: {sku.asin || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={addSkuBusyKey === `existing-${sku.id}`}
                      className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-2 py-1 rounded"
                      onClick={async () => {
                        try {
                          const key = `existing-${sku.id}`;
                          setAddSkuBusyKey(key);
                          await onAddSku?.(sku.id);
                        } finally {
                          setAddSkuBusyKey('');
                        }
                      }}
                    >
                      {tr('add')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {(error || hasBlocking) && (
        <div
          className={`px-6 py-3 border-b text-sm ${error ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
        >
          {error ||
            (skuEligibilityBlocking
              ? tr('notEligibleBanner')
              : tr('inboundPlanNotReady'))}
        </div>
      )}
      {!error && translatedNotice && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          {translatedNotice}
        </div>
      )}
      {Array.isArray(operationProblems) && operationProblems.length > 0 && (
        <div className="px-6 py-3 border-b text-sm bg-red-50 text-red-700 border-red-200">
          <div className="font-semibold">{tr('operationIssuesTitle')}</div>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {operationProblems.slice(0, 8).map((p, idx) => {
              return (
                <li key={`op-problem-${idx}`}>
                  {humanizeOperationProblem(p)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {loadingPlan && skus.length === 0 && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          {tr('planStillLoading')}
        </div>
      )}
      {ignoredItems.length > 0 && (
        <div className="px-6 py-3 border-b text-sm bg-amber-50 text-amber-800 border-amber-200">
          {tr('ignoredLinesNotice', '', { count: ignoredItems.length })}
        </div>
      )}

      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border-b border-slate-200">
        <FieldLabel label={tr('shipFromLabel')}>
          <div className="text-slate-800">{shipFrom.name || '—'}</div>
          <div className="text-slate-600 text-sm">{shipFrom.address || '—'}</div>
        </FieldLabel>
        <FieldLabel
          label={tr('marketplaceDestinationCountry')}
          action={
            hasUnits ? (
              <button
                type="button"
                onClick={applySingleBox}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md shadow-sm flex items-center gap-1"
              >
                {tr('addAllUnitsOneBox')}
              </button>
            ) : null
          }
        >
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
        <table className="min-w-full text-sm text-slate-700 table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[320px] min-w-[320px]" />
          </colgroup>
          <thead>
            <tr className="text-left text-slate-500 uppercase text-xs">
              <th className="py-2">{tr('tableSkuDetails')}</th>
              <th className="py-2">{tr('tablePackingDetails')}</th>
              <th className="py-2">{tr('tableInfoAction')}</th>
              <th className="py-2">{tr('tableQuantityToSend')}</th>
              <th className="py-2 text-center w-[320px] min-w-[320px]">{tr('tableServices')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {skus.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">
                  {loadingPlan
                    ? tr('waitingSkusAndShipments')
                    : tr('noSkusToDisplay')}
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
            {ignoredItems.map((item, idx) => renderIgnoredSkuRow(item, idx))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 space-y-4">
        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-slate-800">{tr('boxes')}</div>
            <button
              type="button"
              className="text-xs text-blue-600 underline"
              onClick={() => {
                handleAddBoxService();
                schedulePersist();
              }}
            >
              {tr('addBox', '+ Add box')}
            </button>
          </div>
          {boxServices.length === 0 && (
            <div className="text-xs text-slate-500">{tr('noBoxServicesSelected')}</div>
          )}
          {boxServices.map((svc, idx) => {
            const total = Number(svc.unit_price || 0) * Number(svc.units || 0);
            return (
              <div
                key={svc?._local_id || `box-svc-${idx}`}
                className="flex flex-wrap items-center gap-3 border border-slate-200 rounded-md p-2"
              >
                <select
                  className="border rounded-md px-2 py-1 text-xs min-w-[220px]"
                  value={svc.service_name || ''}
                  onChange={(e) => {
                    const selected = boxOptions.find((opt) => opt.service_name === e.target.value);
                    if (!selected) return;
                    const next = boxServices.map((row, i) =>
                      i === idx
                        ? withLocalId({
                            ...row,
                            service_id: selected.id,
                            service_name: selected.service_name,
                            unit_price: Number(selected.price || 0)
                          })
                        : row
                    );
                    setBoxes(next);
                    schedulePersist();
                  }}
                >
                  {boxOptionsByCategory.map(([category, options]) => (
                    <optgroup key={category} label={category}>
                      {options.map((opt) => (
                        <option key={opt.id || opt.service_name} value={opt.service_name}>
                          {opt.service_name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="text-xs text-slate-600">
                  {tr('unit')} <span className="font-semibold">{Number(svc.unit_price || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <span>{tr('qty')}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="w-16 border rounded-md px-2 py-1 text-xs text-right"
                    value={svc.units ?? 0}
                    onChange={(e) => {
                      const next = boxServices.map((row, i) =>
                        i === idx ? withLocalId({ ...row, units: Number(e.target.value || 0) }) : row
                      );
                      setBoxes(next);
                      schedulePersist();
                    }}
                  />
                </div>
                <div className="text-xs text-slate-600">
                  {tr('total')} <span className="font-semibold">{Number.isFinite(total) ? total.toFixed(2) : '0.00'}</span>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => {
                    const next = boxServices.filter((_, i) => i !== idx);
                    setBoxes(next);
                  }}
                >
                  {tr('remove')}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-semibold text-slate-900">{tr('boxDetailsStep1')}</div>
          {hasUnits && (
            <button
              type="button"
              onClick={applySingleBox}
              className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-3 py-2 rounded-md"
            >
              {tr('putAllInOneBoxRo')}
            </button>
          )}
        </div>
        {planGroupsForDisplay.map((group) => {
          const groupPlan = getGroupPlan(group.groupId, group.label);
          const boxes = Array.isArray(groupPlan.boxes) ? groupPlan.boxes : [];
          const boxItems = Array.isArray(groupPlan.boxItems) ? groupPlan.boxItems : [];
          const { sets: dimensionSets, assignments: dimensionAssignments } = normalizeDimensionMeta(
            group.groupId,
            groupPlan
          );
          const groupSkus = skus.filter((sku) => {
            const info = skuGroupMap.get(sku.id);
            return (info?.groupId || 'ungrouped') === group.groupId;
          });
          const totalUnits = groupSkus.reduce((sum, sku) => sum + Number(sku.units || 0), 0);
          const boxedUnits = boxItems.reduce((sum, box) => {
            return (
              sum +
              Object.values(box || {}).reduce((acc, val) => acc + Number(val || 0), 0)
            );
          }, 0);
          const showScrollbars = boxes.length > 10;
          const labelColWidth = 260;
          const boxColWidth = 100;
          const tableWidth = labelColWidth + boxes.length * boxColWidth;
          return (
            <div key={group.groupId} className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">{group.label}</div>
              </div>
              {boxes.length === 0 && <div className="text-sm text-slate-500">{tr('noBoxesYet')}</div>}
              {boxes.length > 0 && (
                <div className="border border-slate-200 rounded-md bg-white" data-box-details>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-3 py-2 text-xs text-slate-600 border-b border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-800">{tr('totalSkus')}:</span> {groupSkus.length}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">{tr('unitsBoxed')}:</span> {boxedUnits} {tr('ofWord')} {totalUnits}
                    </div>
                    <div className="text-slate-500">
                      {tr('enterBoxContentsHint')}
                    </div>
                  </div>

                  {showScrollbars && (
                    <div
                      ref={setBoxScrollRef(group.groupId, 'top')}
                      onScroll={syncBoxScroll(group.groupId, 'top')}
                      className="overflow-x-auto border-b border-slate-200"
                    >
                      <div style={{ width: `${tableWidth}px`, height: 12 }} />
                    </div>
                  )}

                  <div
                    ref={setBoxScrollRef(group.groupId, 'bottom')}
                    onScroll={syncBoxScroll(group.groupId, 'bottom')}
                    className="overflow-x-auto"
                  >
                    <table
                      className="min-w-max w-full text-xs border-separate border-spacing-0"
                      style={{ minWidth: `${tableWidth}px` }}
                    >
                      <thead>
                        <tr>
                          <th className="sticky left-0 top-0 z-20 bg-slate-50 border-b border-slate-200 text-left px-3 py-2 w-[260px]">
                            &nbsp;
                          </th>
                          {boxes.map((box, idx) => (
                            <th
                              key={box.id || `${group.groupId}-box-head-${idx}`}
                              className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 py-2 text-center min-w-[100px]"
                            >
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-semibold text-slate-700">{tr('box')} {idx + 1}</span>
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-red-600 text-xs"
                                  onClick={() => removeBoxFromGroup(group.groupId, idx, group.label)}
                                  aria-label={tr('removeBoxNAria', { index: idx + 1 })}
                                >
                                  ×
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="sticky left-0 z-10 bg-white border-b border-slate-200 px-3 py-2">
                            <div className="text-xs font-semibold text-slate-700">{tr('boxWeightKg')}</div>
                          </td>
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
                              <td
                                key={box.id || `${group.groupId}-box-weight-${idx}`}
                                className="border-b border-slate-200 px-3 py-2 text-center"
                              >
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  data-box-input="1"
                                  value={valueForField('weight_kg', box?.weight_kg ?? box?.weight ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('weight_kg'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('weight_kg')]: e.target.value
                                    }))
                                  }
                                  onBlur={(e) => commitDim('weight_kg', e.target.value)}
                                  className="w-20 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                  placeholder={tr('zeroPlaceholder')}
                                />
                              </td>
                            );
                          })}
                        </tr>

                        {dimensionSets.map((set, setIdx) => {
                          const buildKey = (field) => getDimSetDraftKey(group.groupId, set.id, field);
                          const valueForField = (field, fallback) => {
                            const draft = boxDimDrafts[buildKey(field)];
                            return draft !== undefined && draft !== null ? draft : fallback;
                          };
                          const commitSet = (field, rawValue) => {
                            updateDimensionSet(
                              group.groupId,
                              set.id,
                              field,
                              rawValue,
                              group.label,
                              set,
                              dimensionAssignments
                            );
                            setBoxDimDrafts((prev) => {
                              const next = { ...(prev || {}) };
                              delete next[buildKey(field)];
                              return next;
                            });
                          };
                          const handleDimKeyDown = (field) => (event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSet(field, event.currentTarget.value);
                              event.currentTarget.blur();
                              return;
                            }
                            preventEnterSubmit(event);
                          };
                          return (
                            <tr key={set.id}>
                              <td className="sticky left-0 z-10 bg-white border-b border-slate-200 px-3 py-2 align-top">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-semibold text-slate-700">
                                    {tr('boxDimensionsCm')}{setIdx > 0 ? ` ${setIdx + 1}` : ''}
                                  </div>
                                  {setIdx > 0 && dimensionSets.length > 1 && (
                                    <button
                                      type="button"
                                      className="text-xs text-slate-400 hover:text-red-600"
                                      onClick={() => removeDimensionSet(group.groupId, set.id, group.label)}
                                      aria-label={tr('removeBoxDimensionsNAria', { index: setIdx + 1 })}
                                    >
                                      x
                                    </button>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                  data-box-input="1"
                                  value={valueForField('length_cm', set?.length_cm ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('length_cm'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('length_cm')]: e.target.value
                                    }))
                                    }
                                    onBlur={(e) => commitSet('length_cm', e.target.value)}
                                    className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                    placeholder={tr('dimLPlaceholder')}
                                  />
                                  <span className="text-slate-400 text-[10px]">x</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                  data-box-input="1"
                                  value={valueForField('width_cm', set?.width_cm ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('width_cm'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('width_cm')]: e.target.value
                                    }))
                                    }
                                    onBlur={(e) => commitSet('width_cm', e.target.value)}
                                    className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                    placeholder={tr('dimWPlaceholder')}
                                  />
                                  <span className="text-slate-400 text-[10px]">x</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                  data-box-input="1"
                                  value={valueForField('height_cm', set?.height_cm ?? '')}
                                  onKeyDown={handleBoxDetailsKeyDown(handleDimKeyDown('height_cm'))}
                                  onChange={(e) =>
                                    setBoxDimDrafts((prev) => ({
                                      ...(prev || {}),
                                      [buildKey('height_cm')]: e.target.value
                                    }))
                                    }
                                    onBlur={(e) => commitSet('height_cm', e.target.value)}
                                    className="w-16 h-8 border rounded-sm px-2 py-1 text-xs text-center"
                                    placeholder={tr('dimHPlaceholder')}
                                  />
                                </div>
                                {setIdx === 0 && (
                                  <button
                                    type="button"
                                    className="mt-1 text-xs text-blue-700 hover:text-blue-800"
                                    onClick={() => addDimensionSet(group.groupId, group.label)}
                                  >
                                    {tr('addAnotherBoxDimension')}
                                  </button>
                                )}
                              </td>
                              {boxes.map((box, idx) => {
                                const boxId = box?.id || `${group.groupId}-box-${idx}`;
                                const checked = dimensionAssignments[boxId] === set.id;
                                return (
                                  <td
                                    key={`${boxId}-${set.id}`}
                                    className="border-b border-slate-200 px-3 py-2 text-center align-middle"
                                  >
                                    <input
                                      type="checkbox"
                                      data-box-input="1"
                                      checked={checked}
                                      onKeyDown={handleBoxDetailsKeyDown()}
                                      onChange={(e) =>
                                        toggleDimensionAssignment(
                                          group.groupId,
                                          set.id,
                                          box,
                                          idx,
                                          e.target.checked,
                                          group.label,
                                          set
                                        )
                                      }
                                      className="h-4 w-4"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
        <div className="font-semibold text-slate-900">{tr('packGroupsPreviewTitle')}</div>
        {packGroupsPreviewLoading && (
          <div className="text-sm text-slate-600">{tr('loadingGroupingAmazon')}</div>
        )}
        {!packGroupsPreviewLoading && packGroupsPreviewError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
            {packGroupsPreviewError}
          </div>
        )}
        {!packGroupsPreviewLoading && !packGroupsPreviewError && (!packGroupsPreview || packGroupsPreview.length === 0) && (
          <div className="text-sm text-slate-600">
            {tr('noPackingGroupsYet')}
          </div>
        )}
        {!packGroupsPreviewLoading && hasPackGroups && (
          <div className="text-sm text-slate-600">
            {tr('groupedAboveNotice')}
          </div>
        )}
        {!packGroupsPreviewLoading && Array.isArray(packGroupsPreview) && packGroupsPreview.length > 0 && !hasPackGroups && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {packGroupsPreview.map((group, idx) => {
              const items = Array.isArray(group.items) ? group.items : [];
              return (
                <div key={group.packingGroupId || group.id || `pack-${idx + 1}`} className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{tr('packN', '', { index: idx + 1 })}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {items.map((it, itemIdx) => {
                      const label = it.title || it.name || it.sku || it.asin || tr('genericSkuLabel');
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
          {tr('skusConfirmedToSendSummary', '', { count: skus.length, units: totalUnits })}
        </div>
        <div className="flex gap-3 justify-end flex-wrap">
          {/* removed inboundPlan missing/wait banners */}
          {hasUnits && !boxPlanValidation.isValid && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
              {tr('completeBoxPlanning')}
            </div>
          )}
          {!hasUnits && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
              {tr('noUnitsWarning')}
            </div>
          )}
          <button
            onClick={() => {
              if (skuEligibilityBlocking) {
                alert(tr('alertNotEligible'));
                return;
              }
              if (hasBlocking) {
                alert(error || tr('alertPlanNotReady'));
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
              ? tr('waitingAmazon')
              : saving
                ? tr('saving')
                : hasBlocking
                  ? skuEligibilityBlocking
                    ? tr('resolveEligibility')
                    : tr('retryStep1')
                  : (!allowNoInboundPlan && (!inboundPlanId || !requestId))
                    ? tr('waitingPlan')
                    : !hasUnits
                      ? tr('addUnits')
                      : tr('continueToPacking')}
            </button>
          </div>
        </div>

      {packingModal.open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/25 px-4 pt-20">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[70vh] overflow-y-auto">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">{tr('packingDetailsTitle')}</div>
              <button onClick={closePackingModal} className="text-slate-500 hover:text-slate-700 text-xs">{tr('close')}</button>
            </div>
              <div className="px-3 py-2.5 space-y-2.5">
              {templateError ? (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                  {templateError}
                </div>
              ) : null}
              {packingModal.sku && (
                <div className="flex gap-2 items-center">
                  <img
                    src={packingModal.sku.image || placeholderImg}
                    alt={packingModal.sku.title}
                    className="w-8 h-8 object-contain border border-slate-200 rounded"
                  />
                  <div className="text-[11px] text-slate-800 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{packingModal.sku.title}</div>
                    <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {packingModal.sku.sku}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('templateName')}</label>
                  <input
                    type="text"
                    value={packingModal.templateName}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateName: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('templateNameExample')}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('type')}</label>
                  <select
                    value={packingModal.templateType}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, templateType: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                  >
                    <option value="case">{tr('optionCasePacked')}</option>
                    <option value="individual">{tr('optionIndividualUnits')}</option>
                    <option value="single_sku_pallet">{tr('optionSingleSkuPallet')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('unitsPerBoxShort')}</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.unitsPerBox}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, unitsPerBox: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-800">{tr('weightKg')}</label>
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxWeight}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxWeight: e.target.value }))}
                    className="mt-1 w-full border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('zeroDecimalPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-800">{tr('dimensionsCm')}</label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxL}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxL: e.target.value }))}
                    className="border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('dimLPlaceholder')}
                  />
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxW}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxW: e.target.value }))}
                    className="border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('dimWPlaceholder')}
                  />
                  <input
                    type="number"
                    min={0}
                    value={packingModal.boxH}
                    onChange={(e) => setPackingModal((prev) => ({ ...prev, boxH: e.target.value }))}
                    className="border rounded-md px-2 py-1 text-xs"
                    placeholder={tr('dimHPlaceholder')}
                  />
                </div>
              </div>

              <div className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">{tr('prep')}:</span> {tr('noPrepNeeded')}
              </div>
            </div>

            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={closePackingModal} className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 text-xs">
                {tr('cancel')}
              </button>
              <button
                onClick={savePackingTemplate}
                className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
              >
                {tr('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {prepModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">{tr('prepareFbaItems')}</div>
              <button onClick={closePrepModal} className="text-slate-500 hover:text-slate-700 text-sm">{tr('close')}</button>
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
                    <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {prepModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">{tr('asinLabelShort')}: {prepModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">{tr('storageLabel')}: {prepModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setPrepTab('prep')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'prep' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  {tr('prepGuidance')}
                </button>
                <button
                  onClick={() => setPrepTab('barcode')}
                  className={`px-4 py-2 text-sm font-semibold ${prepTab === 'barcode' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-600'}`}
                >
                  {tr('useManufacturerBarcode')}
                </button>
              </div>

              {prepTab === 'prep' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">{tr('choosePrepCategory')}</label>
                    <select
                      value={prepModal.prepCategory}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, prepCategory: e.target.value }))}
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">{tr('selectPlaceholder')}</option>
                      <option value="fragile">{tr('prepFragileGlass')}</option>
                      <option value="liquids">{tr('prepLiquidsNonGlass')}</option>
                      <option value="perforated">{tr('prepPerforatedPackaging')}</option>
                      <option value="powder">{tr('prepPowderPelletsGranular')}</option>
                      <option value="small">{tr('prepSmall')}</option>
                      <option value="none">{tr('noPrepNeeded')}</option>
                    </select>
                  </div>
                  {formatPrepList(prepModal.sku?.prepInstructions || prepModal.sku?.prepNotes || []).length > 0 && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2">
                      {tr('guidance')}: {formatPrepList(prepModal.sku?.prepInstructions || prepModal.sku?.prepNotes || []).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {prepTab === 'barcode' && (
                <div className="space-y-3">
                  {!prepModal.manufacturerBarcodeEligible ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                      {tr('notEligibleManufacturerBarcode')}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-700">{tr('eligibleManufacturerBarcode')}</div>
                  )}
                  <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={prepModal.useManufacturerBarcode}
                      onChange={(e) => setPrepModal((prev) => ({ ...prev, useManufacturerBarcode: e.target.checked }))}
                    />
                    {tr('useManufacturerBarcodeTracking')}
                  </label>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={closePrepModal} className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm">
                {tr('cancel')}
              </button>
              <button
                onClick={savePrepModal}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
              >
                {tr('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {labelModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">{tr('printSkuLabels')}</div>
              <button onClick={closeLabelModal} className="text-slate-500 hover:text-slate-700 text-sm">{tr('close')}</button>
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
                    <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {labelModal.sku.sku}</div>
                    <div className="text-xs text-slate-600">{tr('asinLabelShort')}: {labelModal.sku.asin}</div>
                    <div className="text-xs text-slate-600">{tr('fulfillmentStorageType')}: {labelModal.sku.storageType}</div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{tr('choosePrintingFormat')}</label>
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
                    <option value="thermal">{tr('thermalPrinting')}</option>
                    <option value="standard">{tr('standardFormats')}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{tr('widthMm')}</label>
                  <input
                    type="number"
                    min={1}
                    value={labelModal.width}
                    onChange={(e) => setLabelModal((prev) => ({ ...prev, width: e.target.value }))}
                    className="border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{tr('heightMm')}</label>
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
                <div className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-200">{tr('tableSkuDetails')}</div>
                {labelModal.sku && (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <img
                      src={labelModal.sku.image || placeholderImg}
                      alt={labelModal.sku.title}
                      className="w-10 h-10 object-contain border border-slate-200 rounded"
                    />
                    <div className="flex-1 text-sm text-slate-800">
                      <div className="font-semibold text-slate-900 leading-snug line-clamp-2">{labelModal.sku.title}</div>
                      <div className="text-xs text-slate-600">{tr('skuLabelShort')}: {labelModal.sku.sku}</div>
                      <div className="text-xs text-slate-600">{tr('asinLabelShort')}: {labelModal.sku.asin}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <label className="text-xs text-slate-600">{tr('printLabels')}</label>
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
                {tr('cancel')}
              </button>
              <button
                onClick={handleDownloadLabels}
                disabled={labelLoading}
                className={`px-4 py-2 rounded-md text-white text-sm font-semibold shadow-sm ${labelLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {labelLoading ? tr('downloading') : tr('downloadLabels')}
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
