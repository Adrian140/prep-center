import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Calculator, ShieldAlert, Box, Save } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const MAX_BOX_KG = 23;

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
  let chosen = null;
  for (const box of boxesAsc) {
    const fill = fillSingleBox(remaining, box);
    if (!fill.packed.length) continue;

    if (!chosen) {
      chosen = { box, fill };
      continue;
    }

    const chosenUtil = chosen.fill.usedVol / Math.max(chosen.box.vol, 1);
    const nextUtil = fill.usedVol / Math.max(box.vol, 1);
    const chosenWeightUtil = chosen.fill.usedKg / Math.max(getBoxMaxKg(chosen.box), 1);
    const nextWeightUtil = fill.usedKg / Math.max(getBoxMaxKg(box), 1);

    // Prefer box that packs more items. On tie, prefer better utilization, then smaller box.
    if (
      fill.packed.length > chosen.fill.packed.length ||
      (fill.packed.length === chosen.fill.packed.length &&
        (nextUtil > chosenUtil ||
          (nextUtil === chosenUtil &&
            (nextWeightUtil > chosenWeightUtil ||
              (nextWeightUtil === chosenWeightUtil && box.vol < chosen.box.vol)))))
    ) {
      chosen = { box, fill };
    }
  }
  return chosen;
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
        max_kg: getBoxMaxKg(b),
        vol: volume(b.length_cm, b.width_cm, b.height_cm)
      })),
    [boxes]
  );

  const filteredBoxes = useMemo(
    () =>
      normalizedBoxes
        .filter((b) => (mode === 'dg' ? b.tag === 'dg' : b.tag !== 'dg'))
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
      return {
        index: idx,
        inst,
        volumePercent,
        weightPercent,
        completed: isBoxCompleted(volumePercent, weightPercent)
      };
    });
    const completed = stats.filter((s) => s.completed).length;
    const partial = stats.length - completed;
    return { stats, completed, partial, total: stats.length };
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
      setMessage(error.message || 'Failed to save dimensions.');
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
    setMessage('Dimensions saved.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 text-primary rounded-xl">
          <Boxes className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Box Estimator</h1>
          <p className="text-sm text-text-secondary">
            Select products, set quantities and dimensions, then estimate how many boxes you need.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-secondary flex items-center gap-1">
          <ShieldAlert className="w-4 h-4 text-amber-600" /> Mode:
        </span>
        <button
          onClick={() => setMode('standard')}
          className={`px-3 py-1 rounded border text-xs ${mode === 'standard' ? 'bg-primary text-white border-primary' : 'border-gray-300 text-text-primary'}`}
        >
          Non-DG
        </button>
        <button
          onClick={() => setMode('dg')}
          className={`px-3 py-1 rounded border text-xs ${mode === 'dg' ? 'bg-amber-600 text-white border-amber-600' : 'border-gray-300 text-text-primary'}`}
        >
          DG
        </button>
      </div>

      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-text-primary">Auto packing boxes</span>
        </div>
        {!hasQtyToEstimate ? (
          <div className="text-sm text-text-secondary">
            Adauga cantitati in tabel si sistemul va aloca automat cutiile potrivite.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-primary">
              {planStats.completed} boxes completed
              {planStats.partial > 0 ? `, ${planStats.partial} partial` : ''}
            </div>
            <div className="text-xs text-text-secondary">
              Plan: {livePlan.summary.length ? livePlan.summary.map((s) => `${s.count}× ${s.box.name}`).join(' + ') : '—'}
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {planStats.stats.map(({ inst, index, volumePercent, weightPercent, completed }) => {
                return (
                  <div
                    key={`${inst.box.id}-${index}`}
                    className={`border rounded-md p-2 flex flex-col gap-1 text-xs bg-gray-50 ${completed ? 'border-emerald-300' : 'border-amber-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Box className="w-3 h-3 text-primary" />
                      <span className="font-semibold text-text-primary truncate">{inst.box.name} #{index + 1}</span>
                    </div>
                    <div className="text-[11px] text-text-secondary">max {getBoxMaxKg(inst.box)} kg</div>
                    <div className="text-sm font-medium text-text-primary">{inst.box.length_cm} × {inst.box.width_cm} × {inst.box.height_cm}</div>
                    <div className="mt-2 flex items-center gap-3">
                      <ProgressCircle label="Volume fill" percent={volumePercent} />
                      <ProgressCircle label="Weight fill" percent={weightPercent} />
                    </div>
                    {!completed && (
                      <div className="text-[11px] text-amber-700 font-medium">
                        Partial box: {Math.round(Math.max(volumePercent, weightPercent))}% filled
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {!!livePlan?.impossibleItems?.length && (
              <div className="text-[11px] text-red-600">
                {livePlan.impossibleItems.length} produse nu incap in nicio cutie.
              </div>
            )}
          </div>
        )}
        <div className="pt-1 text-[11px] text-text-secondary">
          Tipuri disponibile: {filteredBoxes.map((b) => b.name).join(', ')}
        </div>
      </div>

      <div className="border rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder="Search products (ASIN / SKU / name)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full md:w-80"
          />
          <button
            type="button"
            onClick={() => setEditMode((prev) => !prev)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded text-sm border ${editMode ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-gray-300 text-text-primary'}`}
          >
            {editMode ? 'Disable edit' : 'Enable edit'}
          </button>
        </div>
        {message && <div className="text-sm text-primary mb-2">{message}</div>}
        {hasQtyToEstimate && livePlan?.impossibleItems?.length > 0 && (
          <div className="text-sm text-red-600 mb-2">
            • Unele produse nu incap in nicio cutie disponibila.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Photo</th>
                <th className="px-2 py-2 text-left">ASIN / SKU</th>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-right">Stock PrepCenter</th>
                <th className="px-2 py-2 text-right">Qty to estimate</th>
                <th className="px-2 py-2 text-right">L (cm)</th>
                <th className="px-2 py-2 text-right">W (cm)</th>
                <th className="px-2 py-2 text-right">H (cm)</th>
                <th className="px-2 py-2 text-right">Kg</th>
                {editMode && <th className="px-2 py-2 text-right">Save</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={editMode ? 10 : 9} className="px-2 py-4 text-center">Loading…</td></tr>
              ) : filteredSorted.length === 0 ? (
                <tr><td colSpan={editMode ? 10 : 9} className="px-2 py-4 text-center">No products</td></tr>
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
                            No Img
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
                            <Save className="w-3 h-3" /> Save
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
