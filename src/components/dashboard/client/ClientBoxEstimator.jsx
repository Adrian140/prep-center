import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Calculator, Plus, Save } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '@/translations';

const defaultBoxes = [
  { id: 'box-60', name: 'Box 60×40×40', length_cm: 60, width_cm: 40, height_cm: 40, max_kg: 25 },
  { id: 'box-42', name: 'Box 42×42×42', length_cm: 42, width_cm: 42, height_cm: 42, max_kg: 20 }
];

const sortDims = (a, b) => b - a;

const canFit = (product, box) => {
  const pd = [product.length_cm || 0, product.width_cm || 0, product.height_cm || 0].map(Number).sort(sortDims);
  const bd = [box.length_cm || 0, box.width_cm || 0, box.height_cm || 0].map(Number).sort(sortDims);
  return pd[0] <= bd[0] && pd[1] <= bd[1] && pd[2] <= bd[2];
};

const volume = (l, w, h) => Math.max(0, Number(l) || 0) * Math.max(0, Number(w) || 0) * Math.max(0, Number(h) || 0);

export default function ClientBoxEstimator() {
  const { profile } = useSupabaseAuth();
  const { t } = useDashboardTranslation();
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [dimsDraft, setDimsDraft] = useState({});
  const [selection, setSelection] = useState({});
  const [boxes, setBoxes] = useState(defaultBoxes);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!profile?.company_id && !profile?.id) return;
      setLoading(true);
      const { data: companyItems } = await supabase
        .from('stock_items')
        .select('id, name, asin, sku, qty, length_cm, width_cm, height_cm, weight_kg')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(5000);
      const { data: userItems } = await supabase
        .from('stock_items')
        .select('id, name, asin, sku, qty, length_cm, width_cm, height_cm, weight_kg')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5000);
      const merged = [...(companyItems || []), ...(userItems || [])].filter(Boolean);
      const deduped = Array.from(new Map(merged.map((it) => [it.id, it])).values());
      setInventory(deduped);
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

  const handleDimChange = (id, field, value) => {
    setDimsDraft((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  };

  const saveDims = async (item) => {
    if (!item?.id) return;
    const draft = dimsDraft[item.id] || {};
    const payload = {
      length_cm: draft.length_cm ?? item.length_cm ?? null,
      width_cm: draft.width_cm ?? item.width_cm ?? null,
      height_cm: draft.height_cm ?? item.height_cm ?? null,
      weight_kg: draft.weight_kg ?? item.weight_kg ?? null
    };
    setSavingId(item.id);
    setMessage('');
    const { error } = await supabase
      .from('stock_items')
      .update(payload)
      .eq('id', item.id);
    if (!error) {
      setInventory((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, ...payload } : row))
      );
      setDimsDraft((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setMessage('Dimensions saved.');
    } else {
      setMessage(error.message || 'Failed to save dimensions.');
    }
    setSavingId(null);
  };

  const handleQty = (id, value) => {
    const qty = Math.max(0, Number(value) || 0);
    setSelection((prev) => ({ ...prev, [id]: qty }));
  };

  const runEstimate = () => {
    const selected = inventory
      .filter((it) => (selection[it.id] || 0) > 0)
      .map((it) => ({
        ...it,
        qty: selection[it.id] || 0,
        dims: {
          l: Number(it.length_cm || dimsDraft[it.id]?.length_cm || 0),
          w: Number(it.width_cm || dimsDraft[it.id]?.width_cm || 0),
          h: Number(it.height_cm || dimsDraft[it.id]?.height_cm || 0),
          kg: Number(it.weight_kg || dimsDraft[it.id]?.weight_kg || 0)
        }
      }));

    const missing = selected.filter(
      (p) => !p.dims.l || !p.dims.w || !p.dims.h || !p.dims.kg
    );
    if (missing.length) {
      setResults([
        { warning: `Missing dimensions/weight for ${missing.length} product(s). Please fill them.` }
      ]);
      return;
    }

    const packings = [];
    const boxDefs = boxes;

    selected.forEach((product) => {
      for (let i = 0; i < product.qty; i++) {
        const candidateBox = boxDefs.find(
          (b) =>
            canFit(product.dims, b) &&
            product.dims.kg <= (b.max_kg || 999)
        );
        if (!candidateBox) {
          packings.push({
            error: `Item ${product.asin || product.sku || product.name} does not fit any box.`
          });
          continue;
        }
        let placed = false;
        for (const box of packings) {
          if (box.boxId !== candidateBox.id) continue;
          const volRemaining = box.volumeRemaining - volume(product.dims.l, product.dims.w, product.dims.h);
          const weightRemaining = (box.maxKg || 999) - (box.kgUsed || 0) - product.dims.kg;
          if (volRemaining >= 0 && weightRemaining >= 0) {
            box.items.push(product.asin || product.sku || product.name);
            box.volumeRemaining = volRemaining;
            box.kgUsed = (box.kgUsed || 0) + product.dims.kg;
            placed = true;
            break;
          }
        }
        if (!placed) {
          packings.push({
            boxId: candidateBox.id,
            boxName: candidateBox.name,
            maxKg: candidateBox.max_kg || 999,
            kgUsed: product.dims.kg,
            volumeRemaining:
              volume(candidateBox.length_cm, candidateBox.width_cm, candidateBox.height_cm) -
              volume(product.dims.l, product.dims.w, product.dims.h),
            items: [product.asin || product.sku || product.name]
          });
        }
      }
    });

    setResults(packings);
  };

  const addBox = () => {
    const id = `box-${boxes.length + 1}-${Date.now()}`;
    setBoxes((prev) => [...prev, { id, name: `Custom box ${prev.length + 1}`, length_cm: 40, width_cm: 40, height_cm: 40, max_kg: 20 }]);
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

      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-text-primary">Boxes</span>
          <button onClick={addBox} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">
            <Plus className="w-3 h-3 inline" /> Add box
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {boxes.map((b, idx) => (
            <div key={b.id} className="grid grid-cols-5 gap-2 items-center text-xs">
              <input
                className="col-span-2 border rounded px-2 py-1"
                value={b.name}
                onChange={(e) =>
                  setBoxes((prev) =>
                    prev.map((box) => (box.id === b.id ? { ...box, name: e.target.value } : box))
                  )
                }
              />
              <input
                className="border rounded px-2 py-1"
                value={b.length_cm}
                onChange={(e) =>
                  setBoxes((prev) =>
                    prev.map((box) => (box.id === b.id ? { ...box, length_cm: e.target.value } : box))
                  )
                }
              />
              <input
                className="border rounded px-2 py-1"
                value={b.width_cm}
                onChange={(e) =>
                  setBoxes((prev) =>
                    prev.map((box) => (box.id === b.id ? { ...box, width_cm: e.target.value } : box))
                  )
                }
              />
              <input
                className="border rounded px-2 py-1"
                value={b.height_cm}
                onChange={(e) =>
                  setBoxes((prev) =>
                    prev.map((box) => (box.id === b.id ? { ...box, height_cm: e.target.value } : box))
                  )
                }
              />
              <input
                className="border rounded px-2 py-1"
                value={b.max_kg}
                onChange={(e) =>
                  setBoxes((prev) =>
                    prev.map((box) => (box.id === b.id ? { ...box, max_kg: e.target.value } : box))
                  )
                }
              />
            </div>
          ))}
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
            onClick={runEstimate}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded hover:bg-primary-dark text-sm"
          >
            <Calculator className="w-4 h-4" /> Estimate boxes
          </button>
        </div>

        {message && <div className="text-sm text-primary mb-2">{message}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">ASIN / SKU</th>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">L (cm)</th>
                <th className="px-2 py-2 text-right">W (cm)</th>
                <th className="px-2 py-2 text-right">H (cm)</th>
                <th className="px-2 py-2 text-right">Kg</th>
                <th className="px-2 py-2 text-right">Save</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-2 py-4 text-center">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-2 py-4 text-center">No products</td></tr>
              ) : (
                filtered.map((item) => {
                  const draft = dimsDraft[item.id] || {};
                  return (
                    <tr key={item.id} className="border-t">
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
                        <input
                          className="border rounded px-2 py-1 w-16 text-right"
                          value={draft.length_cm ?? item.length_cm ?? ''}
                          onChange={(e) => handleDimChange(item.id, 'length_cm', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          className="border rounded px-2 py-1 w-16 text-right"
                          value={draft.width_cm ?? item.width_cm ?? ''}
                          onChange={(e) => handleDimChange(item.id, 'width_cm', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          className="border rounded px-2 py-1 w-16 text-right"
                          value={draft.height_cm ?? item.height_cm ?? ''}
                          onChange={(e) => handleDimChange(item.id, 'height_cm', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          className="border rounded px-2 py-1 w-16 text-right"
                          value={draft.weight_kg ?? item.weight_kg ?? ''}
                          onChange={(e) => handleDimChange(item.id, 'weight_kg', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => saveDims(item)}
                          disabled={savingId === item.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border rounded text-primary border-primary hover:bg-primary hover:text-white disabled:opacity-50"
                        >
                          <Save className="w-3 h-3" /> Save
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

      <div className="border rounded-lg p-3">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Estimate result</h3>
        {results.length === 0 ? (
          <p className="text-sm text-text-secondary">No estimation yet. Select products and press Estimate.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {results.map((r, idx) => (
              <div key={idx} className="border rounded p-2">
                {r.warning && <div className="text-amber-700">{r.warning}</div>}
                {r.error && <div className="text-red-700">{r.error}</div>}
                {r.boxId && (
                  <>
                    <div className="font-semibold">{r.boxName || r.boxId}</div>
                    <div className="text-xs text-text-secondary">
                      Items: {r.items.join(', ')} · Kg used: {(r.kgUsed || 0).toFixed(2)}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
