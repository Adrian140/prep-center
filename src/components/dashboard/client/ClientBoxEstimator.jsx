import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Calculator, ShieldAlert, Box, Save } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '@/translations';

const MAX_BOX_KG = 23;
const HAZMAT_MAX_BOX_KG = 20;
const HEAVY_PARCEL_THRESHOLD_KG = 15;
const HEAVY_PARCEL_LABELS_PER_BOX = 5;
const HEAVY_PARCEL_LABEL_COST_EUR = 0.2;

const defaultBoxes = [
  { id: 'box-60', name: 'Box 60×40×40', length_cm: 60, width_cm: 40, height_cm: 40, max_kg: MAX_BOX_KG, tag: 'standard' },
  { id: 'box-60-cube', name: 'Box 60×60×60', length_cm: 60, width_cm: 60, height_cm: 60, max_kg: MAX_BOX_KG, tag: 'standard' },
  { id: 'box-42', name: 'Box 42×42×42', length_cm: 42, width_cm: 42, height_cm: 42, max_kg: MAX_BOX_KG, tag: 'standard' },
  { id: 'box-30', name: 'Box 30×30×30', length_cm: 30, width_cm: 30, height_cm: 30, max_kg: MAX_BOX_KG, tag: 'standard' }
];

const sortDims = (a, b) => b - a;

const canFit = (product, box) => {
  const pd = [product.length_cm || 0, product.width_cm || 0, product.height_cm || 0].map(Number).sort(sortDims);
  const bd = [box.length_cm || 0, box.width_cm || 0, box.height_cm || 0].map(Number).sort(sortDims);
  return pd[0] <= bd[0] && pd[1] <= bd[1] && pd[2] <= bd[2];
};

const volume = (l, w, h) => Math.max(0, Number(l) || 0) * Math.max(0, Number(w) || 0) * Math.max(0, Number(h) || 0);

const getBoxMaxKg = (box) => {
  const raw = Number(box?.max_kg);
  if (!Number.isFinite(raw) || raw <= 0) return MAX_BOX_KG;
  return Math.min(raw, MAX_BOX_KG);
};

const getBoxMaxKgForMode = (box, mode) => {
  const base = getBoxMaxKg(box);
  if (mode === 'dg') return Math.min(base, HAZMAT_MAX_BOX_KG);
  return base;
};

const is60Cube = (box) =>
  Number(box?.length_cm) === 60 && Number(box?.width_cm) === 60 && Number(box?.height_cm) === 60;

const getBoxPriceEur = (box) => (is60Cube(box) ? 6 : 3);

const canFitItemInBox = (item, box) =>
  canFit(item.dims, box) && item.vol <= box.vol && item.kg <= getBoxMaxKg(box);

const fillSingleBox = (items, box) => {
  let remainingVol = box.vol;
  let remainingKg = getBoxMaxKg(box);
  const packed = [];
  const notPacked = [];
  const sorted = [...items].sort((a, b) => b.vol - a.vol);

  for (const item of sorted) {
    const fits =
      canFitItemInBox(item, box) && item.vol <= remainingVol && item.kg <= remainingKg;
    if (fits) {
      packed.push(item);
      remainingVol -= item.vol;
      remainingKg -= item.kg;
    } else {
      notPacked.push(item);
    }
  }

  return {
    packed,
    remaining: notPacked,
    usedVol: box.vol - remainingVol,
    usedKg: getBoxMaxKg(box) - remainingKg
  };
};

const pickBestBoxForRemaining = (remaining, boxesAsc) => {
  const candidates = [];
  for (const box of boxesAsc) {
    const fill = fillSingleBox(remaining, box);
    if (!fill.packed.length) continue;
    const volumePct = box.vol > 0 ? (fill.usedVol / box.vol) * 100 : 0;
    const weightPct = getBoxMaxKg(box) > 0 ? (fill.usedKg / getBoxMaxKg(box)) * 100 : 0;
    const maxPct = Math.max(volumePct, weightPct);
    const cost = getBoxPriceEur(box);
    const packsAll = fill.remaining.length === 0;
    candidates.push({ box, fill, volumePct, weightPct, maxPct, cost, packsAll });
  }

  if (!candidates.length) return null;

  const allFitCandidates = candidates.filter((c) => c.packsAll);
  if (allFitCandidates.length) {
    allFitCandidates.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      if (a.box.vol !== b.box.vol) return a.box.vol - b.box.vol;
      return b.maxPct - a.maxPct;
    });
    return allFitCandidates[0];
  }

  candidates.sort((a, b) => {
    if (b.fill.packed.length !== a.fill.packed.length) {
      return b.fill.packed.length - a.fill.packed.length;
    }
    if (b.maxPct !== a.maxPct) return b.maxPct - a.maxPct;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.box.vol - b.box.vol;
  });

  return candidates[0];
};

const buildAutoPlan = (items, boxesAsc) => {
  if (!Array.isArray(items) || !items.length) {
    return {
      boxInstances: [],
      summary: [],
      totalBoxes: 0,
      impossibleItems: []
    };
  }

  const impossible = [];
  let remaining = [];
  for (const item of items) {
    const fitsAny = boxesAsc.some((box) => canFitItemInBox(item, box));
    if (fitsAny) remaining.push(item);
    else impossible.push(item);
  }

  const instances = [];

  let guard = 0;
  while (remaining.length > 0 && guard < 10000) {
    guard += 1;
    const chosen = pickBestBoxForRemaining(remaining, boxesAsc);

    if (!chosen) {
      impossible.push(...remaining);
      break;
    }

    if (chosen.fill.remaining.length === remaining.length) {
      impossible.push(...remaining);
      break;
    }

    instances.push({
      box: chosen.box,
      usedVol: chosen.fill.usedVol,
      usedKg: chosen.fill.usedKg,
      countItems: chosen.fill.packed.length
    });
    remaining = chosen.fill.remaining;
  }

  const summaryMap = new Map();
  instances.forEach((inst) => {
    const key = inst.box.id;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, { box: inst.box, count: 0 });
    }
    summaryMap.get(key).count += 1;
  });

  return {
    boxInstances: instances,
    summary: Array.from(summaryMap.values()),
    totalBoxes: instances.length,
    impossibleItems: impossible
  };
};

const percentColor = (percent) => {
  if (percent >= 95) return '#dc2626';
  if (percent >= 80) return '#ea580c';
  return '#2563eb';
};

function ProgressCircle({ label, percent }) {
  const safe = Math.max(0, Math.min(999, Number(percent) || 0));
  const display = Math.round(safe);
  const fill = Math.min(100, safe);
  const color = percentColor(safe);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative h-14 w-14 rounded-full"
        style={{ background: `conic-gradient(${color} ${fill}%, #e5e7eb ${fill}% 100%)` }}
      >
        <div className="absolute inset-1 rounded-full bg-white flex items-center justify-center text-[10px] font-semibold text-text-primary">
          {display}%
        </div>
      </div>
      <span className="text-[10px] text-text-secondary">{label}</span>
    </div>
  );
}

const isBoxCompleted = (volPct, kgPct) => volPct >= 99 || kgPct >= 99;

export default function ClientBoxEstimator() {
  const { profile } = useSupabaseAuth();
  const { t, tp } = useDashboardTranslation();
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState({});
  const [dimsDraft, setDimsDraft] = useState({});
  const [boxes, setBoxes] = useState([]);
  const [mode, setMode] = useState('standard'); // 'standard' | 'dg'
  const [editMode, setEditMode] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!profile?.company_id && !profile?.id) return;
      setLoading(true);
      const { data: companyItems } = await supabase
        .from('stock_items')
        .select('id, name, asin, sku, qty, image_url, length_cm, width_cm, height_cm, weight_kg')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(5000);
      const { data: userItems } = await supabase
        .from('stock_items')
        .select('id, name, asin, sku, qty, image_url, length_cm, width_cm, height_cm, weight_kg')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5000);
      const merged = [...(companyItems || []), ...(userItems || [])].filter(Boolean);
      const deduped = Array.from(new Map(merged.map((it) => [it.id, it])).values());
      setInventory(deduped);
      // Fetch box definitions set by admin (optional table)
      try {
        const { data: boxData, error: boxError } = await supabase
          .from('boxes')
          .select('id, name, length_cm, width_cm, height_cm, max_kg, tag')
          .order('name', { ascending: true });
        if (!boxError && Array.isArray(boxData) && boxData.length) {
          setBoxes(boxData);
        } else {
          if (boxError) console.warn('Boxes fetch skipped:', boxError.message);
          setBoxes(defaultBoxes);
        }
      } catch (err) {
        console.warn('Boxes fetch failed:', err?.message || err);
      }
      setLoading(false);
    };
    load();
  }, [profile?.company_id, profile?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return inventory;
    return inventory.filter((it) => {
      const hay = `${it.name || ''} ${it.asin || ''} ${it.sku || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [inventory, search]);

  const filteredSorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aQty = Number(a?.qty || 0);
      const bQty = Number(b?.qty || 0);
      if (bQty !== aQty) return bQty - aQty;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
  }, [filtered]);

  const normalizedBoxes = useMemo(
    () =>
      (boxes || []).map((b) => ({
        ...b,
        tag: String(b.tag || '').toLowerCase().includes('dg') ? 'dg' : 'standard',
        max_kg: getBoxMaxKgForMode(b, mode),
        vol: volume(b.length_cm, b.width_cm, b.height_cm)
      })),
    [boxes, mode]
  );

  const filteredBoxes = useMemo(
    () =>
      normalizedBoxes
        .filter((b) => {
          if (mode === 'dg') return !is60Cube(b);
          return b.tag !== 'dg';
        })
        .sort((a, b) => {
          if (b.vol !== a.vol) return b.vol - a.vol;
          const aMax = Math.max(Number(a.length_cm || 0), Number(a.width_cm || 0), Number(a.height_cm || 0));
          const bMax = Math.max(Number(b.length_cm || 0), Number(b.width_cm || 0), Number(b.height_cm || 0));
          return bMax - aMax;
        }),
    [normalizedBoxes, mode]
  );

  const selectedProducts = useMemo(
    () =>
      inventory
        .filter((it) => (selection[it.id] || 0) > 0)
        .map((it) => ({
          ...it,
          qty: selection[it.id] || 0,
          dims: {
            l: Number(dimsDraft[it.id]?.length_cm ?? it.length_cm ?? 0),
            w: Number(dimsDraft[it.id]?.width_cm ?? it.width_cm ?? 0),
            h: Number(dimsDraft[it.id]?.height_cm ?? it.height_cm ?? 0),
            kg: Number(dimsDraft[it.id]?.weight_kg ?? it.weight_kg ?? 0)
          }
        }))
        .filter((p) => p.qty > 0),
    [inventory, selection, dimsDraft]
  );

  const expandedItems = useMemo(() => {
    const items = [];
    selectedProducts.forEach((p) => {
      const vol = volume(p.dims.l, p.dims.w, p.dims.h);
      for (let i = 0; i < p.qty; i += 1) {
        items.push({
          sku: p.sku || p.asin || p.name,
          name: p.name,
          dims: p.dims,
          vol,
          kg: p.dims.kg
        });
      }
    });
    return items;
  }, [selectedProducts]);

  const boxesAsc = useMemo(
    () => [...filteredBoxes].sort((a, b) => a.vol - b.vol),
    [filteredBoxes]
  );

  const livePlan = useMemo(
    () => buildAutoPlan(expandedItems, boxesAsc),
    [expandedItems, boxesAsc]
  );

  const hasQtyToEstimate = selectedProducts.length > 0;

  const planStats = useMemo(() => {
    const stats = (livePlan.boxInstances || []).map((inst, idx) => {
      const volumePercent = inst.box.vol > 0 ? (inst.usedVol / inst.box.vol) * 100 : 0;
      const weightPercent =
        getBoxMaxKg(inst.box) > 0 ? (inst.usedKg / getBoxMaxKg(inst.box)) * 100 : 0;
      const costEur = getBoxPriceEur(inst.box);
      const heavyParcel = Number(inst.usedKg || 0) > HEAVY_PARCEL_THRESHOLD_KG;
      const heavyLabelCostEur = heavyParcel
        ? HEAVY_PARCEL_LABELS_PER_BOX * HEAVY_PARCEL_LABEL_COST_EUR
        : 0;
      return {
        index: idx,
        inst,
        volumePercent,
        weightPercent,
        completed: isBoxCompleted(volumePercent, weightPercent),
        costEur,
        heavyParcel,
        heavyLabelCostEur
      };
    });
    const completed = stats.filter((s) => s.completed).length;
    const partial = stats.length - completed;
    const totalCostEur = stats.reduce((sum, s) => sum + s.costEur, 0);
    const totalHeavyLabelCostEur = stats.reduce((sum, s) => sum + s.heavyLabelCostEur, 0);
    const heavyParcelBoxes = stats.filter((s) => s.heavyParcel).length;
    const heavyParcelLabels = heavyParcelBoxes * HEAVY_PARCEL_LABELS_PER_BOX;
    return {
      stats,
      completed,
      partial,
      total: stats.length,
      totalCostEur,
      totalHeavyLabelCostEur,
      grandTotalEur: totalCostEur + totalHeavyLabelCostEur,
      heavyParcelBoxes,
      heavyParcelLabels
    };
  }, [livePlan]);

  const handleQty = (id, value) => {
    if (value === '') {
      setSelection((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const qty = Math.max(0, Number(value) || 0);
    setSelection((prev) => ({ ...prev, [id]: qty }));
  };

  const handleDimChange = (id, field, value) => {
    setDimsDraft((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const saveDims = async (item) => {
    if (!item?.id) return;
    const draft = dimsDraft[item.id] || {};
    const payload = {
      length_cm: draft.length_cm === '' ? null : Number(draft.length_cm ?? item.length_cm ?? 0) || null,
      width_cm: draft.width_cm === '' ? null : Number(draft.width_cm ?? item.width_cm ?? 0) || null,
      height_cm: draft.height_cm === '' ? null : Number(draft.height_cm ?? item.height_cm ?? 0) || null,
      weight_kg: draft.weight_kg === '' ? null : Number(draft.weight_kg ?? item.weight_kg ?? 0) || null
    };
    setSavingId(item.id);
    setMessage('');
    const { error } = await supabase.from('stock_items').update(payload).eq('id', item.id);
    if (error) {
      setMessage(error.message || t('BoxEstimator.flashSaveError'));
      setSavingId(null);
      return;
    }
    setInventory((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...payload } : row)));
    setDimsDraft((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    setSavingId(null);
    setMessage(t('BoxEstimator.flashSaved'));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 text-primary rounded-xl">
          <Boxes className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{t('BoxEstimator.title')}</h1>
          <p className="text-sm text-text-secondary">
            {t('BoxEstimator.subtitle')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-secondary flex items-center gap-1">
          <ShieldAlert className="w-4 h-4 text-amber-600" /> {t('BoxEstimator.modeLabel')}:
        </span>
        <button
          onClick={() => setMode('standard')}
          className={`px-3 py-1 rounded border text-xs ${mode === 'standard' ? 'bg-primary text-white border-primary' : 'border-gray-300 text-text-primary'}`}
        >
          {t('BoxEstimator.nonDG')}
        </button>
        <button
          onClick={() => setMode('dg')}
          className={`px-3 py-1 rounded border text-xs ${mode === 'dg' ? 'bg-amber-600 text-white border-amber-600' : 'border-gray-300 text-text-primary'}`}
        >
          {t('BoxEstimator.dg')}
        </button>
      </div>

      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-text-primary">{t('BoxEstimator.autoPackingTitle')}</span>
        </div>
        {!hasQtyToEstimate ? (
          <div className="text-sm text-text-secondary">
            {t('BoxEstimator.addQtyHint')}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-primary">
              {tp('BoxEstimator.completedSummary', {
                completed: planStats.completed,
                partial: planStats.partial,
                partialSuffix:
                  planStats.partial > 0
                    ? tp('BoxEstimator.partialSuffix', { partial: planStats.partial })
                    : ''
              })}
            </div>
            <div className="text-xs font-medium text-text-primary">
              {tp('BoxEstimator.totalsSummary', {
                total: planStats.total,
                heavyBoxes: planStats.heavyParcelBoxes,
                heavyLabels: planStats.heavyParcelLabels
              })}
            </div>
            <div className="text-xs font-medium text-text-primary">
              {tp('BoxEstimator.totalCostLabel', { amount: planStats.totalCostEur.toFixed(2) })}
            </div>
            <div className="text-xs font-medium text-text-primary">
              {tp('BoxEstimator.heavyLabelsCostLabel', {
                count: planStats.heavyParcelLabels,
                unit: HEAVY_PARCEL_LABEL_COST_EUR.toFixed(2),
                amount: planStats.totalHeavyLabelCostEur.toFixed(2)
              })}
            </div>
            <div className="text-xs font-semibold text-text-primary">
              {tp('BoxEstimator.grandTotalLabel', { amount: planStats.grandTotalEur.toFixed(2) })}
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {planStats.stats.map(({ inst, index, volumePercent, weightPercent, completed, costEur, heavyParcel, heavyLabelCostEur }) => {
                return (
                  <div
                    key={`${inst.box.id}-${index}`}
                    className={`border rounded-md p-2 flex flex-col gap-1 text-xs bg-gray-50 ${completed ? 'border-emerald-300' : 'border-amber-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Box className="w-3 h-3 text-primary" />
                      <span className="font-semibold text-text-primary truncate">{inst.box.name} #{index + 1}</span>
                    </div>
                    <div className="text-[11px] text-text-secondary">{tp('BoxEstimator.maxKg', { kg: getBoxMaxKg(inst.box) })}</div>
                    <div className="text-sm font-medium text-text-primary">{inst.box.length_cm} × {inst.box.width_cm} × {inst.box.height_cm}</div>
                    <div className="text-[11px] text-text-secondary">{tp('BoxEstimator.costLabel', { amount: costEur.toFixed(2) })}</div>
                    {heavyParcel && (
                      <div className="text-[11px] text-red-700 font-medium">
                        {tp('BoxEstimator.heavyParcelNotice', {
                          labels: HEAVY_PARCEL_LABELS_PER_BOX,
                          kg: HEAVY_PARCEL_THRESHOLD_KG
                        })}
                        {' '}
                        {tp('BoxEstimator.heavyParcelCost', {
                          amount: heavyLabelCostEur.toFixed(2),
                          labels: HEAVY_PARCEL_LABELS_PER_BOX,
                          unit: HEAVY_PARCEL_LABEL_COST_EUR.toFixed(2)
                        })}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressCircle label={t('BoxEstimator.volumeFill')} percent={volumePercent} />
                      <ProgressCircle label={t('BoxEstimator.weightFill')} percent={weightPercent} />
                    </div>
                    {!completed && (
                      <div className="text-[11px] text-amber-700 font-medium">
                        {tp('BoxEstimator.partialBox', {
                          percent: Math.round(Math.max(volumePercent, weightPercent))
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {!!livePlan?.impossibleItems?.length && (
              <div className="text-[11px] text-red-600">
                {tp('BoxEstimator.impossibleItems', { count: livePlan.impossibleItems.length })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder={t('BoxEstimator.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full md:w-80"
          />
          <button
            type="button"
            onClick={() => setEditMode((prev) => !prev)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded text-sm border ${editMode ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-gray-300 text-text-primary'}`}
          >
            {editMode ? t('BoxEstimator.disableEdit') : t('BoxEstimator.enableEdit')}
          </button>
        </div>
        {message && <div className="text-sm text-primary mb-2">{message}</div>}
        {hasQtyToEstimate && livePlan?.impossibleItems?.length > 0 && (
          <div className="text-sm text-red-600 mb-2">
            • {t('BoxEstimator.errorImpossible')}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">{t('BoxEstimator.colPhoto')}</th>
                <th className="px-2 py-2 text-left">{t('BoxEstimator.colAsinSku')}</th>
                <th className="px-2 py-2 text-left">{t('BoxEstimator.colName')}</th>
                <th className="px-2 py-2 text-right">{t('BoxEstimator.colStockPrep')}</th>
                <th className="px-2 py-2 text-right">{t('BoxEstimator.colQtyEstimate')}</th>
                <th className="px-2 py-2 text-right">L (cm)</th>
                <th className="px-2 py-2 text-right">W (cm)</th>
                <th className="px-2 py-2 text-right">H (cm)</th>
                <th className="px-2 py-2 text-right">Kg</th>
                {editMode && <th className="px-2 py-2 text-right">{t('BoxEstimator.colSave')}</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={editMode ? 10 : 9} className="px-2 py-4 text-center">{t('BoxEstimator.loading')}</td></tr>
              ) : filteredSorted.length === 0 ? (
                <tr><td colSpan={editMode ? 10 : 9} className="px-2 py-4 text-center">{t('BoxEstimator.noProducts')}</td></tr>
              ) : (
                filteredSorted.map((item) => {
                  const draft = dimsDraft[item.id] || {};
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-2 py-2">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name || item.asin || item.sku || 'Product'}
                            className="w-12 h-12 rounded border object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded border bg-gray-100 text-[10px] text-text-secondary flex items-center justify-center">
                            {t('BoxEstimator.noImage')}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono">{item.asin || item.sku || '—'}</td>
                      <td className="px-2 py-2 max-w-[260px] truncate">{item.name || '—'}</td>
                      <td className="px-2 py-2 text-right">{Number(item.qty || 0)}</td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          className="border rounded px-2 py-1 w-16 text-right"
                          value={selection[item.id] ?? ''}
                          onChange={(e) => handleQty(item.id, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {editMode ? (
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="border rounded px-2 py-1 w-20 text-right"
                            value={draft.length_cm ?? item.length_cm ?? ''}
                            onChange={(e) => handleDimChange(item.id, 'length_cm', e.target.value)}
                          />
                        ) : (
                          item.length_cm ?? '—'
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {editMode ? (
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="border rounded px-2 py-1 w-20 text-right"
                            value={draft.width_cm ?? item.width_cm ?? ''}
                            onChange={(e) => handleDimChange(item.id, 'width_cm', e.target.value)}
                          />
                        ) : (
                          item.width_cm ?? '—'
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {editMode ? (
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="border rounded px-2 py-1 w-20 text-right"
                            value={draft.height_cm ?? item.height_cm ?? ''}
                            onChange={(e) => handleDimChange(item.id, 'height_cm', e.target.value)}
                          />
                        ) : (
                          item.height_cm ?? '—'
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {editMode ? (
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            className="border rounded px-2 py-1 w-20 text-right"
                            value={draft.weight_kg ?? item.weight_kg ?? ''}
                            onChange={(e) => handleDimChange(item.id, 'weight_kg', e.target.value)}
                          />
                        ) : (
                          item.weight_kg ?? '—'
                        )}
                      </td>
                      {editMode && (
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => saveDims(item)}
                            disabled={savingId === item.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border rounded text-primary border-primary hover:bg-primary hover:text-white disabled:opacity-50"
                          >
                            <Save className="w-3 h-3" /> {t('BoxEstimator.save')}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
