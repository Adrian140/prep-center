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

const StatusPill = ({ s }) => {
  const map = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs ${map[s] || "bg-gray-100 text-gray-700"}`}>
      {s}
    </span>
  );
};

export default function AdminPrepRequestDetail({ requestId, onBack, onChanged }) {
  const { profile } = useSupabaseAuth();

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState("");

  // header fields
  const [shipmentId, setShipmentId] = useState("");
  const [headerNote, setHeaderNote] = useState("");

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
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryDraftQty, setInventoryDraftQty] = useState({});
  const [useNewFlow, setUseNewFlow] = useState(false);

  const placeholderImg =
    'https://images.unsplash.com/photo-1582456891925-054d52d43a9c?auto=format&fit=crop&w=80&q=60';

  const wizardPlan = useMemo(() => {
    if (!row) return null;
    const items = Array.isArray(row.prep_request_items) ? row.prep_request_items : [];
    return {
      shipFrom: {
        name: row.client_name || 'Prep Center',
        address: row.destination_country || '—'
      },
      marketplace: row.destination_country || 'France',
      skus: items.map((it, idx) => ({
        id: it.id || `sku-${idx}`,
        title: it.product_name || it.stock_item?.name || `SKU ${idx + 1}`,
        sku: it.sku || it.stock_item?.sku || '—',
        asin: it.asin || it.stock_item?.asin || '—',
        storageType: 'Standard-size',
        packing: 'individual',
        units: Number(it.units_sent ?? it.units_requested ?? 0),
        expiry: '',
        prepRequired: false,
        readyToPack: true
      }))
    };
  }, [row]);

  const wizardPackGroups = useMemo(() => {
    if (!row) return [];
    const items = Array.isArray(row.prep_request_items) ? row.prep_request_items : [];
    return items.map((it, idx) => ({
      id: it.id || `pack-${idx}`,
      title: `Pack group ${idx + 1}`,
      skuCount: 1,
      units: Number(it.units_sent ?? it.units_requested ?? 0),
      boxes: 1,
      packMode: 'single',
      warning: null,
      image: it.stock_item?.image_url || placeholderImg
    }));
  }, [row]);

  const fetchPlanFromEdge = useCallback(async () => {
    if (!row?.id) throw new Error('Missing request id');
    const { data, error } = await supabase.functions.invoke('fba-plan', {
      body: { request_id: row.id }
    });
    if (error) throw error;
    return data?.plan;
  }, [row?.id]);

  const wizardShipments = useMemo(() => {
    if (!row) return [];
    const totalUnits = (row.prep_request_items || []).reduce(
      (sum, it) => sum + Number(it.units_sent ?? it.units_requested ?? 0),
      0
    );
    return [
      {
        id: row.id?.slice(0, 6) || '1',
        name: `Shipment #${row.id?.slice(0, 6) || 1}`,
        from: row.destination_country || 'FR',
        to: row.destination_country || 'FR',
        boxes: Math.max(1, (row.prep_request_items || []).length),
        skuCount: (row.prep_request_items || []).length || 1,
        units: totalUnits || 0
      }
    ];
  }, [row]);

  const wizardShipmentMode = useMemo(
    () => ({
      method: 'SPD',
      deliveryDate: row?.created_at ? new Date(row.created_at).toLocaleDateString() : '—',
      carrier: { partnered: false, name: 'UPS (non-partnered)' }
    }),
    [row]
  );

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
  await Promise.all(
    prepared.map(p =>
      supabaseHelpers.updatePrepItem(p.id, {
        units_sent: p.units_sent,
        obs_admin: p.obs_admin,
      })
    )
  );
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
        setFlash(`Box save failed: ${err.message || err}`);
      }
    }, 700);
  }, [persistBoxesForItem]);

  const persistImmediately = useCallback(
    (itemId) => {
      if (!itemId) return;
      setTimeout(() => {
        persistBoxesForItem(itemId);
      }, 40);
    },
    [persistBoxesForItem]
  );

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
    persistImmediately(itemId);
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
      setFlash(error.message || "Failed to load request");
    } else {
      setRow(data);
      setShipmentId(data?.fba_shipment_id || "");
      setHeaderNote(data?.obs_admin || "");
      await loadBoxesFromServer(data?.prep_request_items || []);

      // ---- DEBUG
      window.__req = data;       // obiectul complet
      window.__reqId = data?.id; // UUID complet
      console.log("DETAIL row:", {
        id: data?.id,
        items: (data?.prep_request_items || []).length,
        tracking: (data?.prep_request_tracking || []).length,
      });
    }

    setLoading(false);
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

        if (row?.company_id) {
          const { data, error } = await supabase
            .from('stock_items')
            .select(columns)
            .eq('company_id', row.company_id)
            .order('created_at', { ascending: false })
            .limit(5000);
          if (error) errorMessage = error.message;
          companyItems = data || [];
        }

        if (row?.user_id) {
          const { data, error } = await supabase
            .from('stock_items')
            .select(columns)
            .eq('user_id', row.user_id)
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
          setFlash(errorMessage || 'Failed to load inventory.');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Inventory load failed', err);
          setInventory([]);
          setFlash(err.message || 'Failed to load inventory.');
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
    }
  }, [inventoryOpen]);

  const filteredInventory = useMemo(() => {
    const term = inventorySearch.trim().toLowerCase();
    if (!term) return inventory;
    return inventory.filter((item) => {
      const haystack = `${item.name || ''} ${item.asin || ''} ${item.sku || ''} ${item.ean || ''}`
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [inventory, inventorySearch]);

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
      setFlash("Enter a quantity before adding the product.");
      return;
    }
    if (!requestId) {
      setFlash("Request not ready yet.");
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
      setFlash("Product added from inventory.");
      setInventoryDraftQty((prev) => ({ ...prev, [stockItem.id]: "" }));
      await load();
      onChanged?.();
    } catch (error) {
      console.error('Add inventory item failed', error);
      setFlash(error.message || "Failed to add product.");
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
    setFlash("Shipment ID saved.");
    await load();
    onChanged?.();
  }

  async function saveHeaderNote() {
    setSaving(true);
    const { error } = await supabaseHelpers.updatePrepHeader(requestId, { obs_admin: headerNote });
    setSaving(false);
    if (error) return setFlash(error.message);
    setFlash("Admin note saved.");
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
    if (!confirm("Delete this tracking ID?")) return;
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
      setFlash(`Item saved but boxes failed: ${boxError.message || boxError}`);
      return;
    }
    setFlash("Item & boxes saved.");
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
      !confirm(
        "This will move the request back to Pending so you can edit it. Make sure to adjust stock manually if needed. Continue?"
      )
    )
      return;
    setSaving(true);
    setFlash("");
    try {
      const { error } = await supabaseHelpers.setPrepStatus(requestId, "pending");
      if (error) throw error;
      setRow((prev) => (prev ? { ...prev, status: "pending" } : prev));
      setFlash("Request unlocked. Update the lines and confirm again when ready.");
      await load();
      onChanged?.();
    } catch (e) {
      console.error("Failed to reopen request:", e);
      setFlash(e?.message || "Unable to reopen request.");
    } finally {
      setSaving(false);
    }
  }

async function confirmRequest() {
  if (row?.status !== "pending") {
    return setFlash("Only pending requests can be confirmed.");
  }

  // 1) fiecare produs are ASIN sau SKU
  const missingCode = (row.prep_request_items || []).find((it) => !codeOf(it));
  if (missingCode) {
    return setFlash("Fiecare produs trebuie să aibă completat ASIN sau SKU înainte de confirmare.");
  }

  // 2) validare locală units_sent (pe state-ul curent)
  const bad = (row.prep_request_items || []).find((it) => {
    const req = Number(it.units_requested || 0);
    const snd = Number(it.units_sent ?? 0);
    return !Number.isFinite(snd) || snd < 0 || snd > req;
  });
  if (bad) return setFlash("Please fix Units to send values first.");

  if (!confirm("Confirm this request? Stock will be adjusted accordingly.")) return;

  setSaving(true);
  setFlash("");

  try {
    // 3) persistă TOATE modificările curente în DB
    await persistAllItemEdits();

    // 4) reîncarcă pentru a fi sigur că RPC vede valorile curente din DB
    await load();

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

// 5.2) Folosește FBA Shipment ID din starea curentă (row)
const fallbackId = `FBA${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const subject_id = (row?.fba_shipment_id || '').trim() || fallbackId;

// compune payloadul de email
const mailItems = (row?.prep_request_items || []).map((item) => {
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
  email: row?.user_email || null,
  client_name: row?.client_name || null,
  company_name: row?.company_name || null,
  note: row?.obs_admin || null,
  fba_shipment_id: row?.fba_shipment_id || null,
  tracking_ids: (row?.prep_request_tracking || [])
    .map((t) => t.tracking_id)
    .filter(Boolean),
  subject_id,
  items: mailItems,
};

// 6) Trimite email
const { error: mailErr } = await supabaseHelpers.sendPrepConfirmationEmail(mailPayload);
if (mailErr) {
  setFlash(`Request confirmed (status updated). Email failed: ${mailErr.message || 'unknown'}`);
} else {
  setFlash('Request confirmed (status updated) and client notified by email.');
}

// reîncarcă detail + informează lista
await load();
onChanged?.();

  } catch (e) {
    console.error('[CONFIRM] failed:', e);
    setFlash(e?.message || "Confirmation failed.");
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
      setFlash(`Box save failed: ${lastError.message || lastError}`);
    } else {
      setFlash('Box data saved.');
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
      persistImmediately(itemId);
    });
  };

  if (loading) return <div>Loading…</div>;
  if (!row)
    return (
      <div>
        <button onClick={onBack} className="inline-flex items-center text-sm mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </button>
        <div>Request not found.</div>
      </div>
    );

  if (useNewFlow && wizardPlan) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setUseNewFlow(false)} className="inline-flex items-center text-sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Înapoi la varianta veche
          </button>
          <button onClick={onBack} className="text-sm text-blue-700 hover:underline">
            Înapoi la listă
          </button>
        </div>
        <FbaSendToAmazonWizard
          initialPlan={wizardPlan}
          initialPacking={wizardPackGroups}
          initialShipmentMode={wizardShipmentMode}
          initialShipmentList={wizardShipments}
          initialTrackingList={[]}
          showLegacyToggle={false}
          autoLoadPlan={true}
          fetchPlan={fetchPlanFromEdge}
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
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to list
      </button>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Package className="w-5 h-5" />
              Request #{row.id.slice(0, 8)}
            </h2>
            <div className="text-sm text-text-secondary">
              {new Date(row.created_at).toLocaleString()} ·{" "}
              {row.client_name ? <b>{row.client_name}</b> : "—"} ({row.user_email || "—"}) ·
              Company: <b>{row.company_name || "—"}</b>
            </div>
            <div className="mt-1 text-sm flex flex-wrap items-center gap-2">
              <DestinationBadge code={row.destination_country || 'FR'} variant="loud" />
              <span className="text-text-secondary flex items-center gap-1">
                Status: <StatusPill s={row.status} />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseNewFlow(true)}
              className="px-4 py-2 border border-blue-500 text-blue-700 rounded inline-flex items-center gap-2 hover:bg-blue-50"
              type="button"
            >
              Try new Send to Amazon (beta)
            </button>
            <button
              onClick={() => setShowBoxSummary(true)}
              className="px-4 py-2 border rounded inline-flex items-center gap-2"
              type="button"
            >
              <Boxes className="w-4 h-4" />
              Box summary
            </button>
            {row.status === "confirmed" && (
              <button
                onClick={reopenRequest}
                disabled={saving}
                className="px-4 py-2 border border-amber-500 text-amber-700 rounded inline-flex items-center gap-2 disabled:opacity-50"
                type="button"
                title="Move back to pending so you can edit and confirm again"
              >
                <Unlock className="w-4 h-4" />
                Reopen for edits
              </button>
            )}
            <button
              onClick={confirmRequest}
              disabled={row.status !== "pending" || saving}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50 inline-flex items-center gap-2"
              title="Confirm (will subtract stock)"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm
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
            <h4 className="font-semibold mb-3">FBA Shipment ID</h4>
            <div className="flex items-center gap-2">
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder="ex: FBA15KXYZ…"
                value={shipmentId}
                onChange={(e) => setShipmentId(e.target.value)}
              />
              <button
                onClick={saveShipmentId}
                disabled={saving}
                className="px-3 py-2 bg-primary text-white rounded inline-flex items-center gap-1"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              We store this ID so you can quickly find the shipment in Amazon.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-3">Tracking IDs</h4>
            <div className="flex items-center gap-2 mb-3">
              <input
                className="border rounded px-3 py-2 w-full"
                placeholder="Add a tracking ID (you can add multiple)"
                value={newTracking}
                onChange={(e) => setNewTracking(e.target.value)}
              />
              <button onClick={addTracking} className="px-3 py-2 border rounded inline-flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <ul className="space-y-2">
              {(row.prep_request_tracking || []).length === 0 ? (
                <li className="text-sm text-text-secondary">— none</li>
              ) : (
                row.prep_request_tracking.map((t) => (
                  <li key={t.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <span className="font-mono text-sm">
                      {t.tracking_id}
                      {t.created_at ? (
                        <span className="ml-2 text-xs text-text-secondary">
                          · {new Date(t.created_at).toLocaleString()}
                        </span>
                      ) : null}
                    </span>
                    <button
                      onClick={() => removeTracking(t.id)}
                      className="text-red-600 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Admin note (header) */}
        <div className="mt-6 border rounded-lg p-4">
          <h4 className="font-semibold mb-2">Admin note (header)</h4>
          <textarea
            className="w-full border rounded p-2 min-h-[80px]"
            placeholder="Explain why some units were removed / any packaging notes…"
            value={headerNote}
            onChange={(e) => setHeaderNote(e.target.value)}
          />
          <div className="mt-2">
            <button
              onClick={saveHeaderNote}
              disabled={saving}
              className="px-3 py-2 bg-primary text-white rounded inline-flex items-center gap-1"
            >
              <Save className="w-4 h-4" /> Save note
            </button>
          </div>
        </div>

        {/* Items editable */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">Products</h4>
            <div className="flex items-center gap-2">
              <button onClick={setAllToRequested} className="px-3 py-1 border rounded">
                Set all “Units to send” = Requested
              </button>
              <button onClick={setAllToZero} className="px-3 py-1 border rounded">
                Set all = 0
              </button>
              <button
                onClick={() => setInventoryOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1 border rounded text-primary border-primary hover:bg-primary hover:text-white"
              >
                <Plus className="w-4 h-4" />
                {inventoryOpen ? "Hide inventory" : "Add from inventory"}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Box assignments are saved when you click “Save” on each product row.
          </p>

          {inventoryOpen && (
            <div className="mb-4 border rounded-lg bg-gray-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  placeholder="Search inventory by name / SKU / ASIN / EAN"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                />
                <span className="text-sm text-text-secondary">
                  Showing {filteredInventory.length} item(s)
                </span>
              </div>
              {inventoryLoading ? (
                <div className="py-6 text-center text-text-secondary text-sm">Loading inventory…</div>
              ) : filteredInventory.length === 0 ? (
                <div className="py-6 text-center text-text-secondary text-sm">
                  No inventory items match this search.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {filteredInventory.map((item) => (
                    <div key={item.id} className="bg-white border rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name || item.sku || item.asin || 'Product'}
                            className="w-12 h-12 rounded border object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded border bg-gray-100 text-[10px] text-text-secondary flex items-center justify-center">
                            No Img
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-text-primary truncate">
                            {item.name || item.sku || item.asin || '—'}
                          </p>
                          <p className="text-xs text-text-secondary">
                            ASIN: {item.asin || '—'} · SKU: {item.sku || '—'}
                          </p>
                          <p className="text-xs text-text-secondary">In stock: {item.qty ?? 0}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          className="w-28 border rounded px-2 py-1 text-sm"
                          value={inventoryDraftQty[item.id] ?? ""}
                          placeholder="Qty"
                          onChange={(e) => handleInventoryQtyChange(item.id, e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddInventoryItem(item)}
                          className="px-3 py-1 bg-primary text-white rounded text-sm disabled:opacity-50"
                          disabled={saving}
                        >
                          Add
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
                  <th className="px-3 py-2 text-left">Photo</th>
                  <th className="px-3 py-2 text-left">ASIN / SKU</th>
                  <th className="px-3 py-2 text-left">Product name</th>
                  <th className="px-3 py-2 text-right">Units requested</th>
                  <th className="px-3 py-2 text-right">Units to send</th>
                  <th className="px-3 py-2 text-right">Units removed</th>
                  <th className="px-3 py-2 text-left">Boxes</th>
                  <th className="px-3 py-2 text-left">Admin note</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(row.prep_request_items || []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-text-secondary">
                      —
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
                              No Img
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono" title={nameOf(it)}>
                          {codeOf(it) || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {nameOf(it)}
                        </td>
                        <td className="px-3 py-2 text-right">{req}</td>

                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            className="w-28 text-right border rounded px-2 py-1"
                            min={0}
                            max={req}
                            value={Number.isFinite(it.units_sent) ? it.units_sent : ""}
                            placeholder="0"
                            onChange={(e) =>
                              onItemFieldChange(it.id, "units_sent", e.target.value === "" ? "" : Number(e.target.value))
                            }
                          />
                        </td>

                        <td className="px-3 py-2 text-right">{removed}</td>

                        <td className="px-3 py-2">
                          <div className="space-y-2">
                            {itemBoxes.map((box) => (
                              <div key={box.id} className="flex items-center gap-2 text-xs whitespace-nowrap">
                                <span className="text-text-secondary">Box</span>
                                <input
                                  type="number"
                                  min={1}
                                  className="w-16 border rounded px-2 py-1 text-right"
                                  value={box.boxNumber}
                                  onChange={(e) =>
                                    updateBoxValue(it.id, box.id, "boxNumber", e.target.value)
                                  }
                                />
                                <span className="text-text-secondary">Units</span>
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
                              + Add box
                            </button>
                            <div
                              className={`text-[11px] ${
                                assigned > clamped ? "text-red-600" : "text-text-secondary"
                              }`}
                            >
                              Assigned: {assigned || 0} / {clamped || 0}
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          <textarea
                            className="w-full border rounded p-1 min-h-[40px]"
                            placeholder="Explain what was removed (weight limit, out of stock, etc.)"
                            value={it.obs_admin || ""}
                            onChange={(e) => onItemFieldChange(it.id, "obs_admin", e.target.value)}
                          />
                        </td>

                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => saveItem(it)}
                            className="px-3 py-1 border rounded inline-flex items-center gap-1"
                          >
                            <Save className="w-4 h-4" /> Save
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
                <h3 className="text-lg font-semibold">Box shipping summary</h3>
              </div>
              <button
                className="text-sm text-text-secondary hover:text-primary"
                onClick={() => setShowBoxSummary(false)}
              >
                Close
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"
                onClick={persistAllBoxes}
                disabled={saving}
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save boxes'}
              </button>
              {flash && <span className="text-xs text-text-secondary">{flash}</span>}
            </div>
            {boxSummary.length === 0 ? (
              <p className="text-sm text-text-secondary">No boxes added yet.</p>
            ) : (
              <div className="flex flex-wrap gap-3 text-sm">
                {boxSummary.map((box) => (
                  <div
                    key={box.boxNumber}
                    className="flex-1 min-w-[260px] max-w-[320px] rounded-2xl border shadow-sm p-3 space-y-3 bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-start min-w-[52px]">
                        <div className="text-xs uppercase tracking-wide text-text-secondary leading-tight">Box</div>
                        <div className="text-2xl font-semibold text-text-primary leading-none">{box.boxNumber}</div>
                      </div>
                      <div className="flex-1 flex items-center gap-2 text-[11px] text-text-secondary">
                        <label className="flex items-center gap-1">
                          <span>Kg</span>
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
                          placeholder="L"
                          aria-label="Length"
                          className="no-spin w-12 h-8 border rounded px-2 text-right text-xs appearance-none [appearance:textfield] [-moz-appearance:textfield]"
                          value={box.meta?.lengthCm ?? ''}
                          onChange={(e) => updateSummaryBoxValue(box.targets, 'lengthCm', e.target.value)}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          inputMode="decimal"
                          placeholder="W"
                          aria-label="Width"
                          className="no-spin w-12 h-8 border rounded px-2 text-right text-xs appearance-none [appearance:textfield] [-moz-appearance:textfield]"
                          value={box.meta?.widthCm ?? ''}
                          onChange={(e) => updateSummaryBoxValue(box.targets, 'widthCm', e.target.value)}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          inputMode="decimal"
                          placeholder="H"
                          aria-label="Height"
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
                            {line.code || line.name || "Item"}
                          </span>
                          <span className="font-semibold text-text-primary">{line.qty} u</span>
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
