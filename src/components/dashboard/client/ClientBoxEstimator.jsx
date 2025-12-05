import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Calculator, Save, ShieldAlert, Box } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '@/translations';

const defaultBoxes = [
  { id: 'box-60', name: 'Box 60×40×40', length_cm: 60, width_cm: 40, height_cm: 40, max_kg: 25, tag: 'standard' },
  { id: 'box-42', name: 'Box 42×42×42', length_cm: 42, width_cm: 42, height_cm: 42, max_kg: 20, tag: 'standard' },
  { id: 'box-30', name: 'Box 30×30×30', length_cm: 30, width_cm: 30, height_cm: 30, max_kg: 20, tag: 'standard' }
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
  const { t, tp } = useDashboardTranslation();
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [dimsDraft, setDimsDraft] = useState({});
  const [selection, setSelection] = useState({});
  const [boxes, setBoxes] = useState([]);
  const [mode, setMode] = useState('standard'); // 'standard' | 'dg'
  const [results, setResults] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

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
    const normalizedBoxes = (boxes || []).map((b) => ({
      ...b,
      tag: String(b.tag || '').toLowerCase().includes('dg') ? 'dg' : 'standard',
      vol: volume(b.length_cm, b.width_cm, b.height_cm)
    })).sort((a, b) => a.vol - b.vol);

    const filteredBoxes = normalizedBoxes.filter((b) =>
      mode === 'dg' ? b.tag === 'dg' : b.tag !== 'dg'
    );

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
      }))
      .filter((p) => p.qty > 0);

    const missing = selected.filter(
      (p) => !p.dims.l || !p.dims.w || !p.dims.h || !p.dims.kg
    );
    const warns = [];
    if (missing.length) warns.push(t('BoxEstimator.errorMissingDims'));
    if (!filteredBoxes.length) warns.push(t('BoxEstimator.errorNoBoxes'));
    setWarnings(warns);
    if (warns.length > 0 || selected.length === 0) {
      setResults([]);
      return;
    }

    // Încercăm pe rând fiecare tip de cutie (de la mic la mare) să împachetăm TOT setul
    const makeItems = () => {
      const arr = [];
      selected.forEach((p) => {
        const vol = volume(p.dims.l, p.dims.w, p.dims.h);
        for (let i = 0; i < p.qty; i++) {
          arr.push({
            sku: p.sku || p.asin || p.name,
            name: p.name,
            dims: p.dims,
            vol,
            kg: p.dims.kg
          });
        }
      });
      // sortăm descrescător pe volum pentru a umple mai bine
      arr.sort((a, b) => b.vol - a.vol);
      return arr;
    };

    const tryPackWithBox = (def) => {
      // dacă vreun item nu încape dim/greutate singur, eșec
      const invalid = selected.some((p) => !canFit(p.dims, def) || p.dims.kg > (def.max_kg || 999));
      if (invalid) return null;

      const boxesUsed = [];
      const items = makeItems();

      const fits = (it, state) =>
        state.volRemaining - it.vol >= 0 &&
        state.kgRemaining - it.kg >= 0 &&
        canFit(it.dims, def);

      const newState = () => ({
        boxType: def.id,
        name: def.name,
        l: def.length_cm,
        w: def.width_cm,
        h: def.height_cm,
        kg: def.max_kg || 999,
        volRemaining: def.vol,
        kgRemaining: def.max_kg || 999,
        items: []
      });

      items.forEach((it) => {
        let placed = false;
        for (const bx of boxesUsed) {
          if (fits(it, bx)) {
            bx.items.push(it);
            bx.volRemaining -= it.vol;
            bx.kgRemaining -= it.kg;
            placed = true;
            break;
          }
        }
        if (!placed) {
          const bx = newState();
          if (!fits(it, bx)) {
            // nu ar trebui să se întâmple (deja am verificat dim/greutate), dar protejăm
            placed = false;
          } else {
            bx.items.push(it);
            bx.volRemaining -= it.vol;
            bx.kgRemaining -= it.kg;
            boxesUsed.push(bx);
            placed = true;
          }
        }
      });

      return boxesUsed;
    };

    let chosen = null;
    for (const def of filteredBoxes) {
      const pack = tryPackWithBox(def);
      if (pack && pack.length > 0) {
        chosen = pack;
        break;
      }
    }

    // fallback: dacă nu a reușit niciuna (ar trebui să existe totuși), ia ultima cutie
    if (!chosen && filteredBoxes.length) {
      const last = filteredBoxes[filteredBoxes.length - 1];
      chosen = tryPackWithBox(last) || [];
    }

    const summaryMap = new Map();
    (chosen || []).forEach((b) => {
      const key = b.boxType;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, { name: b.name, l: b.l, w: b.w, h: b.h, kg: b.kg, count: 0 });
      }
      summaryMap.get(key).count += 1;
    });
    const summary = Array.from(summaryMap.values()).sort((a, b) => (a.l * a.w * a.h) - (b.l * b.w * b.h));
    setResults(summary);
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
          {boxes
            .filter((b) => mode === 'dg' ? b.tag === 'dg' : b.tag !== 'dg')
            .map((b) => (
              <div key={b.id} className="border rounded-md p-2 flex flex-col gap-1 text-xs bg-gray-50">
                <div className="flex items-center gap-2">
                  <Box className="w-3 h-3 text-primary" />
                  <span className="font-semibold text-text-primary truncate">{b.name}</span>
                </div>
                <div className="text-[11px] text-text-secondary">max {b.max_kg ?? '—'} kg</div>
                <div className="text-sm font-medium text-text-primary">{b.length_cm} × {b.width_cm} × {b.height_cm}</div>
              </div>
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
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded hover:bg-primary-dark text-sm"
          >
            <Calculator className="w-4 h-4" /> Estimate boxes
          </button>
        </div>

        {warnings.length > 0 && (
          <div className="text-sm text-red-600 mb-2">
            {warnings.map((w, i) => <div key={i}>• {w}</div>)}
          </div>
        )}
        {message && <div className="text-sm text-primary mb-2">{message}</div>}

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
