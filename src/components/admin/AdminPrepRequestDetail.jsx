// FILE: src/components/admin/AdminPrepRequestDetail.jsx
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  Package,
  Boxes,
  Unlock,
} from "lucide-react";
import DestinationBadge from '@/components/common/DestinationBadge';
import { useSupabaseAuth } from "../../contexts/SupabaseAuthContext";
import { supabase, supabaseHelpers } from "../../config/supabase";
import FbaSendToAmazonWizard from '@/components/dashboard/client/fba/FbaSendToAmazonWizard';
import { useAdminPrepRequestsTranslation } from '@/i18n/useAdminPrepRequestsTranslation';

const StatusPill = ({ s, label }) => {
  const map = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs ${map[s] || "bg-gray-100 text-gray-700"}`}>
      {label || s}
    </span>
  );
};

const CLIENT_NOTE_MARKER = "[CLIENT_NOTE]";
const ADMIN_NOTE_MARKER = "[ADMIN_NOTE]";
const isFbaShipmentId = (value) => /^FBA[0-9A-Z]+$/i.test(String(value || '').trim());

const parseHeaderNotes = (raw) => {
  const text = String(raw || "");
  if (!text) return { clientNote: "", adminNote: "" };
  const hasMarkers =
    text.includes(CLIENT_NOTE_MARKER) || text.includes(ADMIN_NOTE_MARKER);
  if (!hasMarkers) {
    return { clientNote: "", adminNote: text };
  }
  const extract = (marker) => {
    const idx = text.indexOf(marker);
    if (idx === -1) return "";
    const after = text.slice(idx + marker.length);
    const nextIdxCandidates = [
      after.indexOf(`\n${CLIENT_NOTE_MARKER}`),
      after.indexOf(`\n${ADMIN_NOTE_MARKER}`)
    ].filter((i) => i >= 0);
    const nextIdx = nextIdxCandidates.length ? Math.min(...nextIdxCandidates) : -1;
    const body = nextIdx >= 0 ? after.slice(0, nextIdx) : after;
    return body.replace(/^\n/, "").trim();
  };
  return {
    clientNote: extract(CLIENT_NOTE_MARKER),
    adminNote: extract(ADMIN_NOTE_MARKER)
  };
};

const serializeHeaderNotes = ({ clientNote, adminNote }) => {
  const parts = [];
  if (clientNote) parts.push(`${CLIENT_NOTE_MARKER}\n${clientNote}`);
  if (adminNote) parts.push(`${ADMIN_NOTE_MARKER}\n${adminNote}`);
  return parts.join("\n");
};

export default function AdminPrepRequestDetail({ requestId, onBack, onChanged, openWizard = false }) {
  const { profile, session } = useSupabaseAuth();
  const { t, tp, locale } = useAdminPrepRequestsTranslation();

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState("");

  // header fields
  const [shipmentId, setShipmentId] = useState("");
  const [headerNote, setHeaderNote] = useState("");
  const [clientNote, setClientNote] = useState("");
  const [showHeaderNote, setShowHeaderNote] = useState(false);

  // tracking
  const [newTracking, setNewTracking] = useState("");

  const [saving, setSaving] = useState(false);
  const [boxes, setBoxes] = useState({});
  const boxesRef = useRef({});
  const [showBoxSummary, setShowBoxSummary] = useState(false);
  const boxSaveTimers = useRef({});
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [inventoryRemote, setInventoryRemote] = useState([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryDraftQty, setInventoryDraftQty] = useState({});

  const placeholderImg =
    'https://images.unsplash.com/photo-1582456891925-054d52d43a9c?auto=format&fit=crop&w=80&q=60';
  const MARKETPLACE_ID = {
    FR: 'A13V1IB3VIYZZH',
    DE: 'A1PA6795UKMFR9',
    IT: 'APJ6JRA9NG5V4',
    ES: 'A1RKKUPIHCS9HS',
    NL: 'A1805IZSGTT6HS',
    BE: 'AMEN7PMS3EDWL',
    PL: 'A1C3SOZRARQ6R3',
    SE: 'A2NODRKZP88ZB9',
    UK: 'A1F83G8C2ARO7P'
  };

  const wizardSnapshot = useMemo(() => {
    if (!row?.amazon_snapshot || typeof row.amazon_snapshot !== 'object') return {};
    return row.amazon_snapshot;
  }, [row]);

  const wizardInboundSnapshot = useMemo(() => {
    const inbound = wizardSnapshot?.fba_inbound;
    if (inbound && typeof inbound === 'object') return inbound;
    return wizardSnapshot && typeof wizardSnapshot === 'object' ? wizardSnapshot : {};
  }, [wizardSnapshot]);

  const wizardStep2Summary = useMemo(() => row?.step2_summary || null, [row]);
  const wizardStep2Shipments = useMemo(
    () => (Array.isArray(row?.step2_shipments) ? row.step2_shipments : []),
    [row]
  );

  const wizardPackGroups = useMemo(() => {
    const fromSnapshot = Array.isArray(wizardInboundSnapshot?.packingGroups)
      ? wizardInboundSnapshot.packingGroups
      : [];
    if (fromSnapshot.length) {
      return fromSnapshot.map((pg, idx) => {
        const items = Array.isArray(pg?.items) ? pg.items : [];
        const units =
          Number(pg?.units) ||
          items.reduce((sum, it) => sum + (Number(it?.quantity || it?.units || 0) || 0), 0);
        return {
          id: pg?.id || pg?.packingGroupId || `pg-${idx + 1}`,
          packingGroupId: pg?.packingGroupId || pg?.id || `pg-${idx + 1}`,
          title: pg?.title || pg?.destLabel || tp('detail.wizard.packGroup', { index: idx + 1 }),
          items,
          skuCount: Number(pg?.skuCount) || items.length || 0,
          units: units || 0,
          boxes: Math.max(1, Number(pg?.boxes) || 1),
          packMode: pg?.packMode || 'single',
          boxDimensions: pg?.boxDimensions || pg?.dimensions || null,
          boxWeight: pg?.boxWeight ?? pg?.weight ?? null,
          perBoxDetails: pg?.perBoxDetails || pg?.per_box_details || null,
          perBoxItems: pg?.perBoxItems || pg?.per_box_items || null,
          contentInformationSource: pg?.contentInformationSource || pg?.content_information_source || null,
          warning: null,
          image: pg?.image || placeholderImg
        };
      });
    }

    if (!row) return [];
    const items = Array.isArray(row.prep_request_items) ? row.prep_request_items : [];
    return items.map((it, idx) => ({
      id: it.id || `pack-${idx}`,
      title: tp('detail.wizard.packGroup', { index: idx + 1 }),
      skuCount: 1,
      units: Number(it.units_sent ?? it.units_requested ?? 0),
      boxes: 1,
      packMode: 'single',
      warning: null,
      image: it.stock_item?.image_url || placeholderImg
    }));
  }, [placeholderImg, row, wizardInboundSnapshot]);

  const wizardPlan = useMemo(() => {
    if (!row) return null;
    const items = Array.isArray(row.prep_request_items) ? row.prep_request_items : [];
    const sourceAddress =
      wizardInboundSnapshot?.sourceAddress ||
      wizardInboundSnapshot?.source_address ||
      null;
    const rawShipFrom = sourceAddress
      ? [
          sourceAddress?.name || sourceAddress?.companyName || '',
          sourceAddress?.addressLine1 || sourceAddress?.addressLine2 || '',
          sourceAddress?.city || '',
          sourceAddress?.postalCode || '',
          sourceAddress?.countryCode || ''
        ]
          .filter(Boolean)
          .join(', ')
      : null;
    const snapshotSkus = Array.isArray(wizardInboundSnapshot?.skus) ? wizardInboundSnapshot.skus : [];
    const skuMap = new Map();
    snapshotSkus.forEach((s) => {
      const key = String(s?.sku || s?.msku || '').trim().toUpperCase();
      if (key) skuMap.set(key, s);
    });

    const skus = items.map((it, idx) => {
      const key = String(it?.sku || '').trim().toUpperCase();
      const snap = (key && skuMap.get(key)) || {};
      return {
        id: it.id || `sku-${idx}`,
        stock_item_id: it.stock_item_id || it.stock_item?.id || null,
        title: it.product_name || snap?.title || snap?.name || it.stock_item?.name || tp('detail.wizard.skuFallback', { index: idx + 1 }),
        sku: it.sku || snap?.sku || snap?.msku || it.stock_item?.sku || '—',
        asin: it.asin || snap?.asin || it.stock_item?.asin || '—',
        ean: it.ean || snap?.ean || it.stock_item?.ean || '',
        image: snap?.image || snap?.thumbnail || snap?.main_image || it.stock_item?.image_url || null,
        storageType: snap?.storageType || 'Standard-size',
        packing: 'individual',
        units: Number(it.units_sent ?? it.units_requested ?? 0),
        expiry: it.expiration_date || snap?.expiration || '',
        prepRequired: false,
        readyToPack: true
      };
    });

    const inboundPlanId = row?.inbound_plan_id || wizardInboundSnapshot?.inboundPlanId || wizardInboundSnapshot?.inbound_plan_id || null;
    const packingOptionId = row?.packing_option_id || wizardInboundSnapshot?.packingOptionId || wizardInboundSnapshot?.packing_option_id || null;
    const placementOptionId = row?.placement_option_id || wizardInboundSnapshot?.placementOptionId || wizardInboundSnapshot?.placement_option_id || null;

    return {
      id: row.id,
      requestId: row.id,
      request_id: row.id,
      prepRequestId: row.id,
      inboundPlanId,
      inbound_plan_id: inboundPlanId,
      packingOptionId,
      packing_option_id: packingOptionId,
      placementOptionId,
      placement_option_id: placementOptionId,
      step1BoxPlan: row?.step1_box_plan || wizardInboundSnapshot?.step1BoxPlan || wizardInboundSnapshot?.step1_box_plan || {},
      step1_box_plan: row?.step1_box_plan || wizardInboundSnapshot?.step1BoxPlan || wizardInboundSnapshot?.step1_box_plan || {},
      shipFrom: {
        name: row.client_name || sourceAddress?.name || sourceAddress?.companyName || t('detail.wizard.prepCenter'),
        address: rawShipFrom || row.destination_country || t('common.none')
      },
      sourceAddress,
      marketplace: MARKETPLACE_ID[row.destination_country] || row.destination_country || 'FR',
      skus,
      packGroups: wizardPackGroups,
      shipments: wizardStep2Shipments
    };
  }, [row, wizardInboundSnapshot, wizardPackGroups, wizardStep2Shipments]);

  const fetchPlanFromEdge = useCallback(async () => {
    if (!row?.id) throw new Error('Missing request id');
    const {
      data: { session: freshSession },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;
    const activeSession = freshSession || session;

    if (!activeSession?.access_token) {
      const err = new Error(t('detail.planMissingSession'));
      setFlash(err.message);
      throw err;
    }

    const authHeaders = { Authorization: `Bearer ${activeSession.access_token}` };

    const { data, error } = await supabase.functions.invoke('fba-plan', {
      headers: authHeaders,
      body: { request_id: row.id }
    });
    if (error) {
      if (error?.status === 401) {
        const err = new Error(t('detail.planSessionExpired'));
        setFlash(err.message);
        throw err;
      }
      throw error;
    }
    const plan = data?.plan || null;
    if (!plan) return null;

    // Dacă planul nu are inboundPlanId, nu are sens să cerem step1b (packing groups)
    if (!plan.inboundPlanId) {
      setFlash(t('detail.planMissingInbound'));
      return {
        ...plan,
        prepRequestId: row.id,
        packGroups: [],
        packingOptionId: null,
        traceId: data?.traceId || plan.traceId || null,
        requestId: data?.requestId || plan.requestId || null,
        statusCode: data?.status || plan.statusCode || null,
        operationId: data?.operationId || plan.operationId || null,
        operationStatus: data?.operationStatus || plan.operationStatus || null,
        operationProblems:
          data?.operationProblems ||
          plan.operationProblems ||
          data?.operationRaw?.operationProblems ||
          plan.operationRaw?.operationProblems ||
          [],
        inboundPlanStatus: data?.inboundPlanStatus || plan.inboundPlanStatus || null,
        shipmentsPending: data?.shipmentsPending ?? plan.shipmentsPending ?? false
      };
    }

    const packingGroups = Array.isArray(plan?.packGroups)
      ? plan.packGroups
      : Array.isArray(plan?.packingGroups)
      ? plan.packingGroups
      : [];
    const packingOptionId =
      plan?.packingOptionId ||
      plan?.packing_option_id ||
      data?.packingOptionId ||
      null;
    return {
      ...plan,
      prepRequestId: row.id, // păstrăm id-ul intern pentru step2
      packingOptionId,
      packGroups: packingGroups,
      traceId: data?.traceId || plan.traceId || null,
      requestId: data?.requestId || plan.requestId || null,
      statusCode: data?.status || plan.statusCode || null,
      operationId: data?.operationId || plan.operationId || null,
      operationStatus: data?.operationStatus || plan.operationStatus || null,
      operationProblems:
        data?.operationProblems ||
        plan.operationProblems ||
        data?.operationRaw?.operationProblems ||
        plan.operationRaw?.operationProblems ||
        [],
      inboundPlanStatus: data?.inboundPlanStatus || plan.inboundPlanStatus || null,
      shipmentsPending: data?.shipmentsPending ?? plan.shipmentsPending ?? false
    };
  }, [row?.id, session]);

  const wizardShipments = useMemo(() => {
    if (wizardStep2Shipments.length) return wizardStep2Shipments;
    const fromSnapshot = Array.isArray(wizardInboundSnapshot?.shipments) ? wizardInboundSnapshot.shipments : [];
    if (fromSnapshot.length) return fromSnapshot;
    if (!row) return [];
    const totalUnits = (row.prep_request_items || []).reduce(
      (sum, it) => sum + Number(it.units_sent ?? it.units_requested ?? 0),
      0
    );
    return [
      {
        id: row.id?.slice(0, 6) || '1',
        name: tp('detail.wizard.shipmentLabel', { id: row.id?.slice(0, 6) || 1 }),
        from: row.destination_country || 'FR',
        to: row.destination_country || 'FR',
        boxes: Math.max(1, (row.prep_request_items || []).length),
        skuCount: (row.prep_request_items || []).length || 1,
        units: totalUnits || 0
      }
    ];
  }, [row, wizardInboundSnapshot, wizardStep2Shipments]);

  const wizardTrackingList = useMemo(
    () =>
      (row?.prep_request_tracking || []).map((tracking, idx) => ({
        id: tracking?.id || `trk-${idx + 1}`,
        box: idx + 1,
        label: tracking?.box_label || `BOX-${idx + 1}`,
        trackingId: tracking?.tracking_id || '',
        status: tracking?.tracking_id ? t('status.confirmed') : t('status.pending'),
        weight: null,
        dimensions: '',
        boxId: tracking?.box_id || null
      })),
    [row, t]
  );
  const wizardTrackingIds = useMemo(
    () => (row?.prep_request_tracking || []).map((t) => t?.tracking_id).filter(Boolean),
    [row]
  );
  const wizardSelectedOptionId =
    row?.transportation_option_id || wizardStep2Summary?.selectedOptionId || null;
  const wizardSelectedCarrier =
    wizardStep2Summary?.selectedCarrier || wizardStep2Summary?.defaultCarrier || null;
  const wizardSelectedMode =
    wizardStep2Summary?.selectedMode || wizardStep2Summary?.defaultMode || null;
  const wizardSelectedCharge =
    wizardStep2Summary?.selectedCharge ?? wizardStep2Summary?.defaultCharge ?? null;
  const wizardSelectedPartnered =
    wizardStep2Summary?.selectedPartnered ?? null;
  const wizardSelectedSolution =
    wizardStep2Summary?.selectedSolution ||
    wizardStep2Summary?.defaultSolution ||
    (wizardSelectedPartnered ? 'AMAZON_PARTNERED_CARRIER' : 'USE_YOUR_OWN_CARRIER');
  const wizardShippingOptions = useMemo(() => {
    if (!wizardSelectedOptionId) return [];
    return [
      {
        id: wizardSelectedOptionId,
        partnered: Boolean(wizardSelectedPartnered),
        carrierName: wizardSelectedCarrier || t('detail.wizard.carrierFallback'),
        charge: Number.isFinite(wizardSelectedCharge) ? wizardSelectedCharge : null,
        mode: wizardSelectedMode || 'GROUND_SMALL_PARCEL',
        shippingSolution: wizardSelectedSolution
      }
    ];
  }, [
    wizardSelectedOptionId,
    wizardSelectedPartnered,
    wizardSelectedCarrier,
    wizardSelectedCharge,
    wizardSelectedMode,
    wizardSelectedSolution
  ]);
  const wizardShipmentMode = useMemo(() => {
    const normalizeMethod = (mode) => {
      const up = String(mode || '').toUpperCase();
      if (!up) return 'SPD';
      if (up.includes('LTL')) return 'LTL';
      if (up.includes('FTL')) return 'FTL';
      if (up.includes('GROUND_SMALL_PARCEL') || up === 'SPD') return 'SPD';
      return up;
    };
    return {
      method: normalizeMethod(wizardSelectedMode),
      deliveryDate: wizardStep2Summary?.shipDate || (row?.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : ''),
      carrier: {
        partnered: Boolean(wizardSelectedPartnered),
        name: wizardSelectedCarrier || (wizardSelectedPartnered ? t('detail.wizard.amazonPartneredCarrier') : t('detail.wizard.nonAmazonPartneredCarrier'))
      }
    };
  }, [row, wizardSelectedCarrier, wizardSelectedMode, wizardSelectedPartnered, wizardStep2Summary]);

  const hasValidFbaShipmentId = isFbaShipmentId(row?.fba_shipment_id);
  const wizardHistoryMode = Boolean(
    row?.step2_confirmed_at ||
      row?.step4_confirmed_at ||
      hasValidFbaShipmentId ||
      row?.status === 'confirmed' ||
      wizardTrackingIds.length
  );
  const wizardHasStep1 = Boolean(Array.isArray(row?.prep_request_items) && row.prep_request_items.length);
  const wizardHasStep1b = Boolean(
    wizardPackGroups.length ||
      (row?.step1_box_plan && typeof row.step1_box_plan === 'object' && Object.keys(row.step1_box_plan || {}).length)
  );
  const wizardHasStep2 = Boolean(
    row?.step2_confirmed_at ||
      row?.transportation_option_id ||
      wizardStep2Summary?.selectedOptionId ||
      wizardStep2Shipments.length
  );
  const wizardHasStep3 = hasValidFbaShipmentId;
  const wizardHasStep4 = Boolean(wizardTrackingIds.length || row?.step4_confirmed_at);

  const wizardCompletedSteps = useMemo(() => {
    const steps = [];
    if (wizardHasStep1) steps.push('1');
    if (wizardHasStep1b || wizardHasStep1) steps.push('1b');
    if (wizardHasStep2) steps.push('2');
    if (wizardHasStep3) steps.push('3');
    if (wizardHasStep4) steps.push('4');
    return Array.from(new Set(steps));
  }, [wizardHasStep1, wizardHasStep1b, wizardHasStep2, wizardHasStep3, wizardHasStep4]);

  const wizardInitialStep = useMemo(() => {
    if (!wizardHistoryMode) return '1';
    if (wizardHasStep4) return '4';
    if (wizardHasStep3) return '3';
    if (wizardHasStep2) return '2';
    if (wizardHasStep1b) return '1b';
    return '1';
  }, [wizardHasStep1b, wizardHasStep2, wizardHasStep3, wizardHasStep4, wizardHistoryMode]);

  // ---- helpers (afisare cod + nume)
  const codeOf = (it) => (it?.asin || it?.sku || "");
  const nameOf = (it) => (it?.product_name || it?.stock_item?.name || it?.title || it?.name || "—");
async function persistAllItemEdits() {
  const items = row?.prep_request_items || [];

  // validări locale + clamp
  const prepared = items.map(it => {
    const req = Number(it.units_requested || 0);
    let snd = Number(it.units_sent ?? 0);
    if (!Number.isFinite(snd) || snd < 0) snd = 0;
    if (snd > req) snd = req;
    return {
      id: it.id,
      units_sent: snd,
      obs_admin: it.obs_admin ?? null,
    };
  });

  // dacă ai supabaseHelpers.bulkUpdatePrepItems, folosește-l:
  if (typeof supabaseHelpers.bulkUpdatePrepItems === 'function') {
    const { error } = await supabaseHelpers.bulkUpdatePrepItems(prepared);
    if (error) throw error;
    return;
  }

  // fallback: salvează pe rând
  const results = await Promise.all(
    prepared.map(p =>
      supabaseHelpers.updatePrepItem(p.id, {
        units_sent: p.units_sent,
        obs_admin: p.obs_admin,
      })
    )
  );
  const failed = results.find((r) => r?.error);
  if (failed?.error) throw failed.error;
}

const mapBoxRows = (rows = []) => {
  const grouped = {};
  rows.forEach((row) => {
    if (!row?.prep_request_item_id) return;
    const entry = {
      id: row.id || makeBoxId(),
      boxNumber: row.box_number,
      units: row.units,
      weightKg: row.weight_kg ?? '',
      lengthCm: row.length_cm ?? '',
      widthCm: row.width_cm ?? '',
      heightCm: row.height_cm ?? ''
    };
    if (!grouped[row.prep_request_item_id]) {
      grouped[row.prep_request_item_id] = [];
      }
      grouped[row.prep_request_item_id].push(entry);
    });
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => Number(a.boxNumber) - Number(b.boxNumber))
    );
    return grouped;
  };

  const loadBoxesFromServer = async (items = []) => {
    const ids = (items || []).map((it) => it.id).filter(Boolean);
    if (ids.length === 0) {
      setBoxes({});
      return;
    }
    const { data, error } = await supabaseHelpers.getPrepRequestBoxes(ids);
    if (error) {
      console.error("Failed to load boxes:", error);
      return;
    }
    setBoxes(mapBoxRows(data || []));
  };

  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);

  const persistBoxesForItem = useCallback(async (itemId) => {
    if (!itemId) return null;
    const toPositive = (value, min = 0) => {
      if (value === '' || value === null || value === undefined) return null;
      const num = Number(String(value).replace(",", "."));
      if (!Number.isFinite(num)) return null;
      return Math.max(min, Number(num.toFixed(2)));
    };
    const entries = (boxesRef.current[itemId] || [])
      .map((box) => ({
        boxNumber: Math.max(1, Number(box.boxNumber) || 1),
        units: Math.max(0, Number(box.units) || 0),
        weightKg: toPositive(box.weightKg),
        lengthCm: toPositive(box.lengthCm),
        widthCm: toPositive(box.widthCm),
        heightCm: toPositive(box.heightCm)
      }))
      .filter((box) => box.units > 0 || box.weightKg != null || box.lengthCm != null || box.widthCm != null || box.heightCm != null);
    const { error } = await supabaseHelpers.savePrepRequestBoxes(itemId, entries);
    if (error) return error;
    const { data, error: fetchErr } = await supabaseHelpers.getPrepRequestBoxes([itemId]);
    if (!fetchErr && data) {
      setBoxes((prev) => ({
        ...prev,
        ...mapBoxRows(data),
      }));
    }
    return fetchErr || null;
  }, []);

  const scheduleBoxPersist = useCallback((itemId) => {
    if (!itemId) return;
    if (boxSaveTimers.current[itemId]) {
      clearTimeout(boxSaveTimers.current[itemId]);
    }
    boxSaveTimers.current[itemId] = setTimeout(async () => {
      delete boxSaveTimers.current[itemId];
      const err = await persistBoxesForItem(itemId);
      if (err) {
        setFlash(tp('detail.products.boxSaveFailed', { error: err.message || err }));
      }
    }, 700);
  }, [persistBoxesForItem]);

  useEffect(() => {
    return () => {
      Object.values(boxSaveTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const makeBoxId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const addBoxForItem = (itemId) => {
    setBoxes((prev) => {
      const existing = prev[itemId] || [];
      const nextNumber =
        existing.length > 0
          ? Math.max(...existing.map((box) => Number(box.boxNumber) || 0)) + 1
          : 1;
      const entry = {
        id: makeBoxId(),
        boxNumber: nextNumber,
        units: "",
        weightKg: "",
        lengthCm: "",
        widthCm: "",
        heightCm: ""
      };
      return { ...prev, [itemId]: [...existing, entry] };
    });
  };

  const updateBoxValue = (itemId, boxId, field, raw) => {
    const norm = (val) => {
      if (val === "" || val === null || val === undefined) return "";
      const num = Number(String(val).replace(",", "."));
      return Number.isFinite(num) ? num : "";
    };
    setBoxes((prev) => {
      const existing = prev[itemId] || [];
      const next = existing.map((box) => {
        if (box.id !== boxId) return box;
        if (field === "boxNumber") {
          const value = Math.max(1, Number(raw) || 1);
          return { ...box, boxNumber: value };
        }
        if (field === "units") {
          if (raw === "") return { ...box, units: "" };
          const value = Math.max(0, Number(raw) || 0);
          return { ...box, units: value };
        }
        if (['weightKg', 'lengthCm', 'widthCm', 'heightCm'].includes(field)) {
          const parsed = norm(raw);
          if (parsed === "") return { ...box, [field]: "" };
          const value = Math.max(0, parsed);
          return { ...box, [field]: value };
        }
        return box;
      });
      return { ...prev, [itemId]: next };
    });
    scheduleBoxPersist(itemId);
  };

  const removeBox = (itemId, boxId) => {
    setBoxes((prev) => {
      const existing = prev[itemId] || [];
      const next = existing.filter((box) => box.id !== boxId);
      const map = { ...prev };
      if (next.length === 0) delete map[itemId];
      else map[itemId] = next;
      return map;
    });
    scheduleBoxPersist(itemId);
  };


  async function load() {
    setLoading(true);
    setFlash("");
    const { data, error } = await supabaseHelpers.getPrepRequest(requestId);

    if (error) {
      setRow(null);
      setFlash(error.message || t('detail.loadError'));
    } else {
      setRow(data);
      setShipmentId(
        isFbaShipmentId(data?.fba_shipment_id) ? String(data.fba_shipment_id).trim().toUpperCase() : ""
      );
      const parsed = parseHeaderNotes(data?.obs_admin || "");
      setHeaderNote(parsed.adminNote || "");
      setClientNote(parsed.clientNote || "");
      await loadBoxesFromServer(data?.prep_request_items || []);

      // ---- DEBUG
      window.__req = data;       // obiectul complet
      window.__reqId = data?.id; // UUID complet
      if (!import.meta.env.PROD) {
        console.log("DETAIL row:", {
          id: data?.id,
          items: (data?.prep_request_items || []).length,
          tracking: (data?.prep_request_tracking || []).length,
        });
      }
    }

    setLoading(false);
    return data;
  }

  useEffect(() => {
    if (requestId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);


  useEffect(() => {
    if (!row) return;
    setBoxes((prev) => {
      const allowed = new Set((row.prep_request_items || []).map((it) => it.id));
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([id, list]) => {
        if (!allowed.has(id)) {
          changed = true;
          return;
        }
        next[id] = list;
      });
      return changed ? next : prev;
    });
  }, [row]);

  useEffect(() => {
    if (!inventoryOpen || (!row?.company_id && !row?.user_id)) return;
    let cancelled = false;
    const columns = 'id, name, asin, sku, ean, qty, purchase_price';

    const fetchInventory = async () => {
      setInventoryLoading(true);
      try {
        let companyItems = [];
        let userItems = [];
        let errorMessage = null;

        const companyId = row?.company_id || row?.profiles?.company_id || null;
        const userId = row?.user_id || row?.profiles?.id || null;

        if (companyId) {
          const { data, error } = await supabase
            .from('stock_items')
            .select(columns)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(5000);
          if (error) errorMessage = error.message;
          companyItems = data || [];
        }

        if (userId) {
          const { data, error } = await supabase
            .from('stock_items')
            .select(columns)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5000);
          if (error) errorMessage = error.message;
          userItems = data || [];
        }

        if (cancelled) return;
        const merged = [...companyItems, ...userItems].filter(Boolean);
        const deduped = Array.from(new Map(merged.map((it) => [it.id, it])).values());
        setInventory(deduped);
        if (errorMessage && deduped.length === 0) {
          setFlash(errorMessage || t('detail.inventory.loadError'));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Inventory load failed', err);
          setInventory([]);
          setFlash(err.message || t('detail.inventory.loadError'));
        }
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    };

    fetchInventory();

    return () => {
      cancelled = true;
    };
  }, [inventoryOpen, row?.company_id, row?.user_id]);

  useEffect(() => {
    if (!inventoryOpen) {
      setInventorySearch("");
      setInventoryDraftQty({});
      setInventoryRemote([]);
    }
  }, [inventoryOpen]);

  const filteredInventory = useMemo(() => {
    const term = inventorySearch.trim().toLowerCase();
    const base = [...inventory, ...inventoryRemote];
    const unique = Array.from(new Map(base.map((it) => [it.id, it])).values());
    if (!term) return unique;
    return unique.filter((item) => {
      const haystack = `${item.name || ''} ${item.asin || ''} ${item.sku || ''} ${item.ean || ''}`
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [inventory, inventoryRemote, inventorySearch]);

  // Remote search fallback to catch items not in initial load
  useEffect(() => {
    const term = inventorySearch.trim();
    if (!inventoryOpen || term.length < 2) {
      setInventoryRemote([]);
      return;
    }
    const companyId = row?.company_id || row?.profiles?.company_id || null;
    const userId = row?.user_id || row?.profiles?.id || null;
    if (!companyId && !userId) return;
    let cancelled = false;
    const search = async () => {
      try {
        const sanitized = term.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
        if (!sanitized) {
          setInventoryRemote([]);
          return;
        }
        const pattern = `%${sanitized.replace(/[%_]/g, '\\$&')}%`;
        const or = [
          `asin.ilike.${pattern}`,
          `sku.ilike.${pattern}`,
          `ean.ilike.${pattern}`,
          `name.ilike.${pattern}`
        ].join(',');
        let query = supabase
          .from('stock_items')
          .select('id, name, asin, sku, ean, qty, purchase_price, company_id, user_id')
          .order('created_at', { ascending: false })
          .limit(200);
        if (companyId) query = query.eq('company_id', companyId);
        if (!companyId && userId) query = query.eq('user_id', userId);
        const { data, error } = await query.or(or);
        if (cancelled) return;
        if (error) {
          console.warn('Inventory search failed', error.message);
          setInventoryRemote([]);
          return;
        }
        setInventoryRemote(data || []);
      } catch (err) {
        if (!cancelled) {
          console.warn('Inventory search error', err?.message || err);
          setInventoryRemote([]);
        }
      }
    };
    search();
    return () => {
      cancelled = true;
    };
  }, [inventoryOpen, inventorySearch, row?.company_id, row?.user_id, row?.profiles?.company_id, row?.profiles?.id]);

  const handleInventoryQtyChange = (stockId, value) => {
    setInventoryDraftQty((prev) => ({
      ...prev,
      [stockId]: value
    }));
  };

  const handleAddInventoryItem = async (stockItem) => {
    if (!stockItem?.id) return;
    const raw = inventoryDraftQty[stockItem.id];
    const qty = Math.max(1, Number(raw) || 0);
    if (!qty) {
      setFlash(t('detail.inventory.enterQuantity'));
      return;
    }
    if (!requestId) {
      setFlash(t('detail.inventory.requestNotReady'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        stock_item_id: stockItem.id,
        ean: stockItem.ean || null,
        product_name: stockItem.name || stockItem.title || null,
        asin: stockItem.asin || null,
        sku: stockItem.sku || null,
        units_requested: qty
      };
      const { error } = await supabaseHelpers.createPrepItem(requestId, payload);
      if (error) throw error;
      setFlash(t('detail.inventory.productAdded'));
      setInventoryDraftQty((prev) => ({ ...prev, [stockItem.id]: "" }));
      await load();
      onChanged?.();
    } catch (error) {
      console.error('Add inventory item failed', error);
      setFlash(error.message || t('detail.inventory.addFailed'));
    } finally {
      setSaving(false);
    }
  };

  // --- header actions
  async function saveShipmentId() {
    setSaving(true);
    const { error } = await supabaseHelpers.setFbaShipmentId(requestId, shipmentId || null);
    setSaving(false);
    if (error) return setFlash(error.message);
    setFlash(t('detail.shipmentId.saved'));
    await load();
    onChanged?.();
  }

  async function saveHeaderNote() {
    setSaving(true);
    const obsAdmin = serializeHeaderNotes({
      clientNote,
      adminNote: headerNote
    });
    const { error } = await supabaseHelpers.updatePrepHeader(requestId, { obs_admin: obsAdmin || null });
    setSaving(false);
    if (error) return setFlash(error.message);
    setFlash(t('detail.headerNote.saved'));
    await load();
    onChanged?.();
  }

  // --- tracking
  async function addTracking() {
    if (!newTracking.trim()) return;
    const { error } = await supabaseHelpers.addTrackingId(requestId, newTracking.trim());
    if (error) return setFlash(error.message);
    setNewTracking("");
    await load();
    onChanged?.();
  }

  async function removeTracking(id) {
    if (!confirm(t('detail.tracking.deleteConfirm'))) return;
    const { error } = await supabaseHelpers.removeTrackingId(id);
    if (error) return setFlash(error.message);
    await load();
    onChanged?.();
  }

  // --- per-item edits
  function onItemFieldChange(itemId, field, value) {
    setRow((prev) => {
      const next = { ...prev };
      next.prep_request_items = (prev.prep_request_items || []).map((it) =>
        it.id === itemId ? { ...it, [field]: value } : it
      );
      return next;
    });
  }

  const handleUnitsSentChange = (itemId, rawValue, max) => {
    if (rawValue === "") {
      onItemFieldChange(itemId, "units_sent", "");
      return;
    }
    const parsed = Math.max(0, Math.floor(Number(rawValue)));
    const clamped = Math.min(parsed, max);
    onItemFieldChange(itemId, "units_sent", clamped);
  };

  const handleUnitsSentBlur = (item) => {
    // Auto-save when leaving the field to avoid relying on the row save button.
    saveItem(item);
  };

  async function saveItem(item) {
    // coerce number & clamp between 0 and requested
    const req = Number(item.units_requested || 0);
    let toSend = Number(item.units_sent ?? 0);
    if (!Number.isFinite(toSend) || toSend < 0) toSend = 0;
    if (toSend > req) toSend = req;

    const { error } = await supabaseHelpers.updatePrepItem(item.id, {
      units_sent: toSend,
      obs_admin: item.obs_admin ?? null,
    });
    if (error) return setFlash(error.message);
    const boxError = await persistBoxesForItem(item.id);
    if (boxError) {
      setFlash(tp('detail.products.saveItemBoxesFailed', { error: boxError.message || boxError }));
      return;
    }
    setFlash(t('detail.products.saveItemBoxes'));
    await load();
    onChanged?.();
  }

  function setAllToRequested() {
    setRow((prev) => ({
      ...prev,
      prep_request_items: (prev.prep_request_items || []).map((it) => ({
        ...it,
        units_sent: it.units_requested,
      })),
    }));
  }

  function setAllToZero() {
    setRow((prev) => ({
      ...prev,
      prep_request_items: (prev.prep_request_items || []).map((it) => ({
        ...it,
        units_sent: 0,
      })),
    }));
  }

  async function reopenRequest() {
    if (row?.status !== "confirmed") return;
    if (
      !confirm(t('detail.reopenPrompt'))
    )
      return;
    setSaving(true);
    setFlash("");
    try {
      const { error } = await supabaseHelpers.setPrepStatus(requestId, "pending");
      if (error) throw error;
      setRow((prev) => (prev ? { ...prev, status: "pending" } : prev));
      setFlash(t('detail.flash.reopenSuccess'));
      await load();
      onChanged?.();
    } catch (e) {
      console.error("Failed to reopen request:", e);
      setFlash(e?.message || t('detail.flash.reopenFailed'));
    } finally {
      setSaving(false);
    }
  }

async function confirmRequest() {
  if (row?.status !== "pending") {
    return setFlash(t('detail.flash.onlyPending'));
  }

  // 1) fiecare produs are ASIN sau SKU
  const missingCode = (row.prep_request_items || []).find((it) => !codeOf(it));
  if (missingCode) {
    return setFlash(t('detail.flash.missingCode'));
  }

  // 2) validare locală units_sent (pe state-ul curent)
  const bad = (row.prep_request_items || []).find((it) => {
    const req = Number(it.units_requested || 0);
    const snd = Number(it.units_sent ?? 0);
    return !Number.isFinite(snd) || snd < 0 || snd > req;
  });
  if (bad) return setFlash(t('detail.flash.fixUnits'));

  if (!confirm(t('detail.confirmPrompt'))) return;

  setSaving(true);
  setFlash("");

  try {
    // 3) persistă TOATE modificările curente în DB
    await persistAllItemEdits();

    // 4) reîncarcă pentru a fi sigur că RPC vede valorile curente din DB
    const freshRow = await load();
    if (!freshRow) throw new Error(t('detail.flash.reloadFailed'));

// 5) RPC de confirmare
console.log('[CONFIRM] calling RPC confirm_prep_request_v2 with:', {
  requestId,
  adminId: profile?.id || null
});

const { data, error } = await supabaseHelpers.confirmPrepRequestV2(
  requestId,
  profile?.id || null
);
if (error) throw error;

// 5.1) Marchează explicit statusul ca 'confirmed'
{
  const { error: statusErr } = await supabaseHelpers.setPrepStatus(requestId, 'confirmed');
  if (statusErr) console.warn('Status set failed:', statusErr);
}

// 5.2) Folosește FBA Shipment ID din starea proaspăt reîncărcată
const fallbackId = `FBA${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const subject_id = isFbaShipmentId(freshRow?.fba_shipment_id)
  ? String(freshRow.fba_shipment_id).trim().toUpperCase()
  : fallbackId;

// compune payloadul de email
const mailItems = (freshRow?.prep_request_items || []).map((item) => {
  const requested = Number(item.units_requested || 0);
  const sent = Number(item.units_sent || 0);
  return {
    asin: item.asin || item.stock_item?.asin || null,
    sku: item.sku || item.stock_item?.sku || null,
    requested,
    sent,
    removed: Math.max(requested - sent, 0),
    note: item.obs_admin || null,
  };
});

const mailPayload = {
  ...data,                               // ceea ce întoarce RPC-ul (items, removed, etc.)
  request_id: requestId,
  email: freshRow?.user_email || null,
  client_name: freshRow?.client_name || null,
  company_name: freshRow?.company_name || null,
  note: freshRow?.obs_admin || null,
  fba_shipment_id: isFbaShipmentId(freshRow?.fba_shipment_id)
    ? String(freshRow.fba_shipment_id).trim().toUpperCase()
    : null,
  tracking_ids: (freshRow?.prep_request_tracking || [])
    .map((t) => t.tracking_id)
    .filter(Boolean),
  country: freshRow?.warehouse_country || freshRow?.destination_country || null,
  subject_id,
  items: mailItems,
};

// 6) Trimite email
const { error: mailErr } = await supabaseHelpers.sendPrepConfirmationEmail(mailPayload);
if (mailErr) {
      setFlash(tp('detail.flash.emailFailed', { error: mailErr.message || t('detail.flash.unknownError') }));
} else {
  setFlash(t('detail.flash.emailSuccess'));
}

// reîncarcă detail + informează lista
await load();
onChanged?.();

  } catch (e) {
    console.error('[CONFIRM] failed:', e);
    setFlash(e?.message || t('detail.flash.confirmFailed'));
  } finally {
    setSaving(false);
  }
}

  const boxSummary = useMemo(() => {
    if (!row) return [];
    const summary = {};
    (row.prep_request_items || []).forEach((item) => {
      const entries = boxes[item.id] || [];
      entries.forEach(({ boxNumber, units, weightKg, lengthCm, widthCm, heightCm, id }) => {
        const qty = Number(units);
        if (!Number.isFinite(qty) || qty <= 0) return;
        const number = Number(boxNumber) || 1;
        if (!summary[number]) {
          summary[number] = {
            lines: [],
            meta: {
              weightKg: null,
              lengthCm: null,
              widthCm: null,
              heightCm: null
            },
            targets: []
          };
        }
        summary[number].targets.push({ itemId: item.id, boxId: id });
        const meta = summary[number].meta;
        const assignMeta = (field, value) => {
          if (meta[field] != null) return;
          const num = Number(value);
          if (!Number.isFinite(num) || num <= 0) return;
          meta[field] = num;
        };
        assignMeta('weightKg', weightKg);
        assignMeta('lengthCm', lengthCm);
        assignMeta('widthCm', widthCm);
        assignMeta('heightCm', heightCm);
        summary[number].lines.push({
          code: codeOf(item),
          name: nameOf(item),
          qty
        });
      });
    });
    return Object.keys(summary)
      .map((num) => ({
        boxNumber: Number(num),
        lines: summary[num].lines,
        meta: summary[num].meta,
        targets: summary[num].targets
      }))
      .sort((a, b) => a.boxNumber - b.boxNumber);
  }, [boxes, row]);

  const persistAllBoxes = async () => {
    const itemIds = Object.keys(boxes || {});
    if (!itemIds.length) return;
    setSaving(true);
    let lastError = null;
    for (const itemId of itemIds) {
      const err = await persistBoxesForItem(itemId);
      if (err) lastError = err;
    }
    if (lastError) {
      setFlash(tp('detail.products.boxSaveFailed', { error: lastError.message || lastError }));
    } else {
      setFlash(t('detail.products.boxDataSaved'));
    }
    setSaving(false);
  };

  const updateSummaryBoxValue = (targets, field, raw) => {
    const norm = (val) => {
      if (val === "" || val === null || val === undefined) return "";
      const num = Number(String(val).replace(",", "."));
      if (!Number.isFinite(num)) return "";
      return Math.max(0, num);
    };
    const sanitized = norm(raw);
    const affected = new Set();
    setBoxes((prev) => {
      const next = { ...prev };
      targets.forEach(({ itemId, boxId }) => {
        const list = next[itemId];
        if (!list) return;
        next[itemId] = list.map((box) => {
          if (box.id !== boxId) return box;
          affected.add(itemId);
          return { ...box, [field]: sanitized };
        });
      });
      return next;
    });
    affected.forEach((itemId) => {
      scheduleBoxPersist(itemId);
    });
  };

  if (loading) return <div>{t('common.loading')}</div>;
  if (!row)
    return (
      <div>
        <button onClick={onBack} className="inline-flex items-center text-sm mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('common.back')}
        </button>
        <div>{t('detail.requestNotFound')}</div>
      </div>
    );

  if (wizardPlan) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span />
          <button onClick={onBack} className="text-sm text-blue-700 hover:underline">
            {t('common.backToList')}
          </button>
        </div>
        <FbaSendToAmazonWizard
          initialPlan={wizardPlan}
          initialPacking={wizardPackGroups}
          initialShipmentMode={wizardShipmentMode}
          initialShipmentList={wizardStep2Shipments.length ? wizardStep2Shipments : wizardShipments}
          initialTrackingList={wizardTrackingList}
          initialTrackingIds={wizardTrackingIds}
          initialCompletedSteps={wizardCompletedSteps}
          initialShippingOptions={wizardShippingOptions}
          initialShippingSummary={wizardStep2Summary}
          initialShippingConfirmed={Boolean(row?.step2_confirmed_at)}
          initialSelectedTransportationOptionId={wizardSelectedOptionId}
          initialCurrentStep={wizardInitialStep}
          historyMode={wizardHistoryMode}
          showLegacyToggle={false}
          autoLoadPlan={!wizardHistoryMode}
          fetchPlan={wizardHistoryMode ? null : fetchPlanFromEdge}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        input.no-spin::-webkit-outer-spin-button,
        input.no-spin::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input.no-spin {
          -moz-appearance: textfield;
        }
      `}</style>
      <button onClick={onBack} className="inline-flex items-center text-sm">
        <ArrowLeft className="w-4 h-4 mr-1" /> {t('common.backToList')}
      </button>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Package className="w-5 h-5" />
              {tp('detail.requestLabel', { id: row.id.slice(0, 8) })}
            </h2>
            <div className="text-sm text-text-secondary">
              {new Date(row.created_at).toLocaleString(locale)} ·{" "}
              {row.client_name ? <b>{row.client_name}</b> : t('common.none')} ({row.user_email || t('common.none')}) ·
              {tp('detail.companyLabel', { company: row.company_name || t('common.none') })}
            </div>
            <div className="mt-1 text-sm flex flex-wrap items-center gap-2">
              <DestinationBadge code={row.destination_country || 'FR'} variant="loud" />
              <span className="text-text-secondary flex items-center gap-1">
                {t('detail.statusLabel')} <StatusPill s={row.status} label={t(`status.${String(row.status || '').toLowerCase()}`)} />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBoxSummary(true)}
              className="px-4 py-2 border rounded inline-flex items-center gap-2"
              type="button"
            >
              <Boxes className="w-4 h-4" />
              {t('detail.boxSummary.title')}
            </button>
            {row.status === "confirmed" && (
              <button
                onClick={reopenRequest}
                disabled={saving}
                className="px-4 py-2 border border-amber-500 text-amber-700 rounded inline-flex items-center gap-2 disabled:opacity-50"
                type="button"
                title={t('detail.actions.reopenTitle')}
              >
                <Unlock className="w-4 h-4" />
                {t('detail.actions.reopen')}
              </button>
            )}
            <button
              onClick={confirmRequest}
              disabled={row.status !== "pending" || saving}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50 inline-flex items-center gap-2"
              title={t('detail.actions.confirmTitle')}
            >
              <CheckCircle2 className="w-4 h-4" />
              {t('detail.actions.confirm')}
            </button>
          </div>
        </div>

        {flash && (
          <div className="mt-4 px-4 py-3 rounded bg-blue-50 border border-blue-200 text-blue-700">
            {flash}
          </div>
        )}

        {/* Shipment & Tracking */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-3">{t('detail.shipmentId.title')}</h4>
            <div className="flex items-center gap-2">
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder={t('detail.shipmentId.placeholder')}
                value={shipmentId}
                onChange={(e) => setShipmentId(e.target.value)}
              />
              <button
                onClick={saveShipmentId}
                disabled={saving}
                className="px-3 py-2 bg-primary text-white rounded inline-flex items-center gap-1"
              >
                <Save className="w-4 h-4" /> {t('common.save')}
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              {t('detail.shipmentId.help')}
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-3">{t('detail.tracking.title')}</h4>
            <div className="flex items-center gap-2 mb-3">
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder={t('detail.tracking.placeholder')}
                value={newTracking}
                onChange={(e) => setNewTracking(e.target.value)}
              />
              <button onClick={addTracking} className="px-3 py-2 border rounded inline-flex items-center gap-1">
                <Plus className="w-4 h-4" /> {t('common.add')}
              </button>
            </div>
            <ul className="space-y-2">
              {(row.prep_request_tracking || []).length === 0 ? (
                <li className="text-sm text-text-secondary">{t('detail.tracking.empty')}</li>
              ) : (
                row.prep_request_tracking.map((t) => (
                  <li key={t.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <span className="font-mono text-sm">
                      {t.tracking_id}
                      {t.created_at ? (
                        <span className="ml-2 text-xs text-text-secondary">
                          · {new Date(t.created_at).toLocaleString(locale)}
                        </span>
                      ) : null}
                    </span>
                    <button
                      onClick={() => removeTracking(t.id)}
                      className="text-red-600 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" /> {t('common.delete')}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Admin note (header) */}
        <div className="mt-6 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">{t('detail.headerNote.title')}</h4>
            <button
              type="button"
              onClick={() => setShowHeaderNote((prev) => !prev)}
              className="text-sm text-primary hover:underline"
            >
              {showHeaderNote ? t('detail.headerNote.hide') : headerNote ? t('detail.headerNote.edit') : t('detail.headerNote.add')}
            </button>
          </div>

          {clientNote && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="font-semibold">{t('detail.headerNote.clientNoted')}</span>{' '}
              <span className="whitespace-pre-line">{clientNote}</span>
            </div>
          )}

          {showHeaderNote && (
            <>
              <textarea
                className="mt-3 w-full border rounded p-2 min-h-[80px]"
                placeholder={t('detail.headerNote.placeholder')}
                value={headerNote}
                onChange={(e) => setHeaderNote(e.target.value)}
              />
              <div className="mt-2">
                <button
                  onClick={saveHeaderNote}
                  disabled={saving}
                  className="px-3 py-2 bg-primary text-white rounded inline-flex items-center gap-1"
                >
                  <Save className="w-4 h-4" /> {t('detail.headerNote.save')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Items editable */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">{t('detail.products.title')}</h4>
            <div className="flex items-center gap-2">
              <button onClick={setAllToRequested} className="px-3 py-1 border rounded">
                {t('detail.products.setAllRequested')}
              </button>
              <button onClick={setAllToZero} className="px-3 py-1 border rounded">
                {t('detail.products.setAllZero')}
              </button>
              <button
                onClick={() => setInventoryOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1 border rounded text-primary border-primary hover:bg-primary hover:text-white"
              >
                <Plus className="w-4 h-4" />
                {inventoryOpen ? t('detail.products.hideInventory') : t('detail.products.addInventory')}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            {t('detail.products.boxSaveHint')}
          </p>

          {inventoryOpen && (
            <div className="mb-4 border rounded-lg bg-gray-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  placeholder={t('detail.inventory.searchPlaceholder')}
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                />
                <span className="text-sm text-text-secondary">
                  {tp('detail.inventory.showing', { count: filteredInventory.length })}
                </span>
              </div>
              {inventoryLoading ? (
                <div className="py-6 text-center text-text-secondary text-sm">{t('detail.inventory.loading')}</div>
              ) : filteredInventory.length === 0 ? (
                <div className="py-6 text-center text-text-secondary text-sm">
                  {t('detail.inventory.empty')}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {filteredInventory.map((item) => (
                    <div key={item.id} className="bg-white border rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name || item.sku || item.asin || t('detail.products.columns.productName')}
                            className="w-12 h-12 rounded border object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded border bg-gray-100 text-[10px] text-text-secondary flex items-center justify-center">
                            {t('detail.inventory.noImage')}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-text-primary truncate">
                            {item.name || item.sku || item.asin || t('common.none')}
                          </p>
                          <p className="text-xs text-text-secondary">
                            ASIN: {item.asin || t('common.none')} · SKU: {item.sku || t('common.none')}
                          </p>
                          <p className="text-xs text-text-secondary">{tp('detail.inventory.inStock', { qty: item.qty ?? 0 })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          className="w-28 border rounded px-2 py-1 text-sm"
                          value={inventoryDraftQty[item.id] ?? ""}
                          placeholder={t('detail.inventory.qtyPlaceholder')}
                          onChange={(e) => handleInventoryQtyChange(item.id, e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddInventoryItem(item)}
                          className="px-3 py-1 bg-primary text-white rounded text-sm disabled:opacity-50"
                          disabled={saving}
                        >
                          {t('detail.inventory.addButton')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">{t('detail.products.columns.photo')}</th>
                  <th className="px-3 py-2 text-left">{t('detail.products.columns.asinSku')}</th>
                  <th className="px-3 py-2 text-left">{t('detail.products.columns.productName')}</th>
                  <th className="px-3 py-2 text-right">{t('detail.products.columns.unitsRequested')}</th>
                  <th className="px-3 py-2 text-right">{t('detail.products.columns.unitsToSend')}</th>
                  <th className="px-3 py-2 text-right">{t('detail.products.columns.unitsRemoved')}</th>
                  <th className="px-3 py-2 text-left">{t('detail.products.columns.boxes')}</th>
                  <th className="px-3 py-2 text-left">{t('detail.products.columns.adminNote')}</th>
                  <th className="px-3 py-2 text-right">{t('detail.products.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(row.prep_request_items || []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-text-secondary">
                      {t('detail.products.empty')}
                    </td>
                  </tr>
                ) : (
                  row.prep_request_items.map((it) => {
                    const req = Number(it.units_requested || 0);
                    const snd = Number(it.units_sent ?? 0);
                    const clamped = Math.min(Math.max(Number.isFinite(snd) ? snd : 0, 0), req);
                    const removed = req - clamped;
                    const itemBoxes = boxes[it.id] || [];
                    const assigned = itemBoxes.reduce(
                      (sum, entry) => sum + (Number(entry.units) || 0),
                      0
                    );
                    const imageUrl = it.stock_item?.image_url || it.image_url || '';

                    return (
                      <tr key={it.id} className="border-t align-top">
                        <td className="px-3 py-2">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={nameOf(it)}
                              className="w-12 h-12 rounded border object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded border bg-gray-50 text-[10px] text-text-secondary flex items-center justify-center">
                              {t('detail.inventory.noImage')}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono" title={nameOf(it)}>
                          {codeOf(it) || t('common.none')}
                        </td>
                        <td className="px-3 py-2">
                          {nameOf(it)}
                        </td>
                        <td className="px-3 py-2 text-right">{req}</td>

                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="1"
                            className="w-28 text-right border rounded px-2 py-1"
                            min={0}
                            max={req}
                            value={Number.isFinite(it.units_sent) ? it.units_sent : ""}
                            placeholder={t('detail.products.zeroPlaceholder')}
                            onChange={(e) => handleUnitsSentChange(it.id, e.target.value, req)}
                            onBlur={() => handleUnitsSentBlur(it)}
                          />
                        </td>

                        <td className="px-3 py-2 text-right">{removed}</td>

                        <td className="px-3 py-2">
                          <div className="space-y-2">
                            {itemBoxes.map((box) => (
                              <div key={box.id} className="flex items-center gap-2 text-xs whitespace-nowrap">
                                <span className="text-text-secondary">{t('detail.products.box')}</span>
                                <input
                                  type="number"
                                  min={1}
                                  className="w-16 border rounded px-2 py-1 text-right"
                                  value={box.boxNumber}
                                  onChange={(e) =>
                                    updateBoxValue(it.id, box.id, "boxNumber", e.target.value)
                                  }
                                />
                                <span className="text-text-secondary">{t('detail.products.units')}</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-20 border rounded px-2 py-1 text-right"
                                  value={box.units}
                                  onChange={(e) =>
                                    updateBoxValue(it.id, box.id, "units", e.target.value)
                                  }
                                />
                                <button
                                  type="button"
                                  className="text-red-600 text-xs"
                                  onClick={() => removeBox(it.id, box.id)}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline"
                              onClick={() => addBoxForItem(it.id)}
                            >
                              {t('detail.products.addBox')}
                            </button>
                            <div
                              className={`text-[11px] ${
                                assigned > clamped ? "text-red-600" : "text-text-secondary"
                              }`}
                            >
                              {tp('detail.products.assigned', { assigned: assigned || 0, total: clamped || 0 })}
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          <textarea
                            className="w-full border rounded p-1 min-h-[40px]"
                            placeholder={t('detail.products.removedPlaceholder')}
                            value={it.obs_admin || ""}
                            onChange={(e) => onItemFieldChange(it.id, "obs_admin", e.target.value)}
                          />
                        </td>

                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => saveItem(it)}
                            className="px-3 py-1 border rounded inline-flex items-center gap-1"
                          >
                            <Save className="w-4 h-4" /> {t('common.save')}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showBoxSummary && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DestinationBadge code={row.destination_country || 'FR'} variant="loud" />
                <h3 className="text-lg font-semibold">{t('detail.boxSummary.title')}</h3>
              </div>
              <button
                className="text-sm text-text-secondary hover:text-primary"
                onClick={() => setShowBoxSummary(false)}
              >
                {t('common.close')}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"
                onClick={persistAllBoxes}
                disabled={saving}
              >
                <Save className="w-4 h-4" />
                {saving ? t('detail.boxSummary.saving') : t('detail.boxSummary.saveBoxes')}
              </button>
              {flash && <span className="text-xs text-text-secondary">{flash}</span>}
            </div>
            {boxSummary.length === 0 ? (
              <p className="text-sm text-text-secondary">{t('detail.boxSummary.empty')}</p>
            ) : (
              <div className="flex flex-wrap gap-3 text-sm">
                {boxSummary.map((box) => (
                  <div
                    key={box.boxNumber}
                    className="flex-1 min-w-[260px] max-w-[320px] rounded-2xl border shadow-sm p-3 space-y-3 bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-start min-w-[52px]">
                        <div className="text-xs uppercase tracking-wide text-text-secondary leading-tight">{t('detail.boxSummary.box')}</div>
                        <div className="text-2xl font-semibold text-text-primary leading-none">{box.boxNumber}</div>
                      </div>
                      <div className="flex-1 flex items-center gap-2 text-[11px] text-text-secondary">
                        <label className="flex items-center gap-1">
                          <span>{t('detail.boxSummary.kg')}</span>
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            inputMode="decimal"
                            className="no-spin w-14 h-8 border rounded px-2 text-right text-xs appearance-none [appearance:textfield] [-moz-appearance:textfield] bg-blue-50 border-blue-200"
                            value={box.meta?.weightKg ?? ''}
                            onChange={(e) => updateSummaryBoxValue(box.targets, 'weightKg', e.target.value)}
                          />
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          inputMode="decimal"
                          placeholder={t('detail.boxSummary.lengthShort')}
                          aria-label={t('detail.boxSummary.length')}
                          className="no-spin w-12 h-8 border rounded px-2 text-right text-xs appearance-none [appearance:textfield] [-moz-appearance:textfield]"
                          value={box.meta?.lengthCm ?? ''}
                          onChange={(e) => updateSummaryBoxValue(box.targets, 'lengthCm', e.target.value)}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          inputMode="decimal"
                          placeholder={t('detail.boxSummary.widthShort')}
                          aria-label={t('detail.boxSummary.width')}
                          className="no-spin w-12 h-8 border rounded px-2 text-right text-xs appearance-none [appearance:textfield] [-moz-appearance:textfield]"
                          value={box.meta?.widthCm ?? ''}
                          onChange={(e) => updateSummaryBoxValue(box.targets, 'widthCm', e.target.value)}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          inputMode="decimal"
                          placeholder={t('detail.boxSummary.heightShort')}
                          aria-label={t('detail.boxSummary.height')}
                          className="no-spin w-12 h-8 border rounded px-2 text-right text-xs appearance-none [appearance:textfield] [-moz-appearance:textfield]"
                          value={box.meta?.heightCm ?? ''}
                          onChange={(e) => updateSummaryBoxValue(box.targets, 'heightCm', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-text-secondary">
                      {box.lines.map((line, idx) => (
                        <div key={`${box.boxNumber}-${idx}`} className="flex items-center justify-between">
                          <span className="truncate" title={line.code || line.name}>
                            {line.code || line.name || t('detail.boxSummary.item')}
                          </span>
                          <span className="font-semibold text-text-primary">{tp('detail.boxSummary.unitsValue', { qty: line.qty })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
