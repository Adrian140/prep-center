import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Calculator, ShieldAlert, Box } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '@/translations';

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

const packItemsFirstFitDecreasing = (items, box) => {
  const boxVol = volume(box.length_cm, box.width_cm, box.height_cm);
  const boxMaxKg = getBoxMaxKg(box);
  const bins = [];
  const tooLarge = [];

  const sorted = [...items].sort((a, b) => b.vol - a.vol);
  for (const item of sorted) {
    const fitsGeometry = canFit(item.dims, box);
    const fitsBoxCapacity = item.vol <= boxVol && item.kg <= boxMaxKg;
    if (!fitsGeometry || !fitsBoxCapacity) {
      tooLarge.push(item);
      continue;
    }

    let placed = false;
    for (const bin of bins) {
      if (bin.remainingVol >= item.vol && bin.remainingKg >= item.kg) {
        bin.remainingVol -= item.vol;
        bin.remainingKg -= item.kg;
        bin.usedVol += item.vol;
        bin.usedKg += item.kg;
        bin.items.push(item);
        placed = true;
        break;
      }
    }

    if (!placed) {
      bins.push({
        remainingVol: boxVol - item.vol,
        remainingKg: boxMaxKg - item.kg,
        usedVol: item.vol,
        usedKg: item.kg,
        items: [item]
      });
    }
  }

  return { bins, tooLarge, boxVol, boxMaxKg };
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

export default function ClientBoxEstimator() {
  const { profile } = useSupabaseAuth();
  const { t, tp } = useDashboardTranslation();
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState({});
  const [boxes, setBoxes] = useState([]);
  const [mode, setMode] = useState('standard'); // 'standard' | 'dg'
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [results, setResults] = useState([]);
  const [warnings, setWarnings] = useState([]);
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
    () => normalizedBoxes.filter((b) => (mode === 'dg' ? b.tag === 'dg' : b.tag !== 'dg')),
    [normalizedBoxes, mode]
  );

  useEffect(() => {
    if (!selectedBoxId) return;
    const stillVisible = filteredBoxes.some((box) => box.id === selectedBoxId);
    if (!stillVisible) setSelectedBoxId(null);
  }, [filteredBoxes, selectedBoxId]);

  const selectedProducts = useMemo(
    () =>
      inventory
        .filter((it) => (selection[it.id] || 0) > 0)
        .map((it) => ({
          ...it,
          qty: selection[it.id] || 0,
          dims: {
            l: Number(it.length_cm || 0),
            w: Number(it.width_cm || 0),
            h: Number(it.height_cm || 0),
            kg: Number(it.weight_kg || 0)
          }
        }))
        .filter((p) => p.qty > 0),
    [inventory, selection]
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

  const selectedBox = useMemo(
    () => filteredBoxes.find((box) => box.id === selectedBoxId) || null,
    [filteredBoxes, selectedBoxId]
  );

  const selectedBoxUtilization = useMemo(() => {
    if (!selectedBox || expandedItems.length === 0) {
      return { volumePercent: 0, weightPercent: 0, boxCount: 0 };
    }
    const packed = packItemsFirstFitDecreasing(expandedItems, selectedBox);
    const binsCount = packed.bins.length;
    if (!binsCount) {
      return { volumePercent: 0, weightPercent: 0, boxCount: 0 };
    }
    const totalVolUsed = packed.bins.reduce((sum, bin) => sum + bin.usedVol, 0);
    const totalKgUsed = packed.bins.reduce((sum, bin) => sum + bin.usedKg, 0);
    const totalVolCap = packed.boxVol * binsCount;
    const totalKgCap = packed.boxMaxKg * binsCount;
    return {
      volumePercent: totalVolCap > 0 ? (totalVolUsed / totalVolCap) * 100 : 0,
      weightPercent: totalKgCap > 0 ? (totalKgUsed / totalKgCap) * 100 : 0,
      boxCount: binsCount
    };
  }, [selectedBox, expandedItems]);

  const handleQty = (id, value) => {
    const qty = Math.max(0, Number(value) || 0);
    setSelection((prev) => ({ ...prev, [id]: qty }));
  };

  const runEstimate = () => {
    const missing = selectedProducts.filter(
      (p) => !p.dims.l || !p.dims.w || !p.dims.h || !p.dims.kg
    );
    const warns = [];
    if (missing.length) warns.push(t('BoxEstimator.errorMissingDims'));
    if (!selectedBox) warns.push('Select one box before estimate.');
    setWarnings(warns);
    if (warns.length > 0 || selectedProducts.length === 0) {
      setResults([]);
      return;
    }

    const packed = packItemsFirstFitDecreasing(expandedItems, selectedBox);
    if (packed.tooLarge.length > 0) {
      setWarnings(['Some products cannot fit in the selected box.']);
      setResults([]);
      return;
    }
    setResults([
      {
        name: selectedBox.name,
        l: selectedBox.length_cm,
        w: selectedBox.width_cm,
        h: selectedBox.height_cm,
        kg: selectedBox.max_kg,
        count: packed.bins.length
      }
    ]);
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
          <span className="text-sm font-semibold text-text-primary">Boxes</span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {filteredBoxes
            .map((b) => (
              <button
                type="button"
                key={b.id}
                onClick={() => setSelectedBoxId(b.id)}
                className={`border rounded-md p-2 flex flex-col gap-1 text-xs bg-gray-50 text-left transition ${selectedBoxId === b.id ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200'}`}
              >
                <div className="flex items-center gap-2">
                  <Box className="w-3 h-3 text-primary" />
                  <span className="font-semibold text-text-primary truncate">{b.name}</span>
                </div>
                <div className="text-[11px] text-text-secondary">max {getBoxMaxKg(b)} kg</div>
                <div className="text-sm font-medium text-text-primary">{b.length_cm} × {b.width_cm} × {b.height_cm}</div>
                {selectedBoxId === b.id && (
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressCircle label="Volume fill" percent={selectedBoxUtilization.volumePercent} />
                    <ProgressCircle label="Weight fill" percent={selectedBoxUtilization.weightPercent} />
                    <div className="text-[11px] text-text-secondary">
                      Est. boxes: <span className="font-semibold text-text-primary">{selectedBoxUtilization.boxCount || 0}</span>
                    </div>
                  </div>
                )}
              </button>
            ))}
        </div>
      </div>

      <div className="border rounded-lg p-3">
        <h3 className="text-sm font-semibold text-text-primary mb-2">{t('BoxEstimator.summaryTitle')}</h3>
        {results.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('BoxEstimator.summaryNone')}</p>
        ) : (
          <div className="space-y-1 text-sm">
            {results.map((r, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="font-semibold">
                  {tp('BoxEstimator.summaryLine', { count: r.count, name: r.name, l: r.l, w: r.w, h: r.h, kg: r.kg })}
                </span>
              </div>
            ))}
          </div>
        )}
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
            onClick={runEstimate}
            disabled={!selectedBoxId}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded hover:bg-primary-dark text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Calculator className="w-4 h-4" /> Estimate boxes
          </button>
        </div>

        {warnings.length > 0 && (
          <div className="text-sm text-red-600 mb-2">
            {warnings.map((w, i) => <div key={i}>• {w}</div>)}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Photo</th>
                <th className="px-2 py-2 text-left">ASIN / SKU</th>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">L (cm)</th>
                <th className="px-2 py-2 text-right">W (cm)</th>
                <th className="px-2 py-2 text-right">H (cm)</th>
                <th className="px-2 py-2 text-right">Kg</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-2 py-4 text-center">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-2 py-4 text-center">No products</td></tr>
              ) : (
                filtered.map((item) => {
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
                      <td className="px-2 py-2">{item.name || '—'}</td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          className="border rounded px-2 py-1 w-16 text-right"
                          value={selection[item.id] ?? 0}
                          onChange={(e) => handleQty(item.id, e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {item.length_cm ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {item.width_cm ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {item.height_cm ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {item.weight_kg ?? '—'}
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
  );
}
