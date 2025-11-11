import React, { useMemo, useState } from 'react';
import { Upload, FileSpreadsheet, Trash2, Plus } from 'lucide-react';
import { supabase, supabaseHelpers } from '@/config/supabase';

const defaultLabels = {
  title: 'Manual inventory intake',
  subtitle:
    'Add each product manually or upload the Excel template with EAN/ASIN, product name and quantity received.',
  manualTitle: 'Manual entry',
  eanLabel: 'EAN/ASIN *',
  nameLabel: 'Product Name *',
  qtyLabel: 'Quantity Received *',
  addLine: 'Add line',
  uploadTitle: 'Import from XLSX/CSV',
  uploadHint: 'Required columns: EAN/ASIN, Product Name, Quantity Received.',
  template: 'Download template',
  previewTitle: 'Pending lines',
  empty: 'No pending lines yet.',
  remove: 'Remove',
  addInventory: 'Add to inventory',
  errors: {
    missingFields: 'Fill all required fields before adding the line.',
    invalidCode: 'Enter a valid EAN or ASIN.',
    qty: 'Quantity must be at least 1.',
    fileType: 'Please upload a .xlsx or .csv file.',
    fileHeaders:
      'Missing required columns. Expected headers: EAN/ASIN, Product Name, Quantity Received.',
    fileRows: 'No valid rows were detected in the file.',
    save: 'Unable to add products: {msg}'
  },
  success: '{count} lines added to inventory.'
};

const normalizeHeader = (value) =>
  String(value || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)).toString();

const buildCodeKey = (code, type) => {
  if (!code) return null;
  return `${type}:${String(code).trim().toUpperCase()}`;
};

const parseQty = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

const parseCode = (raw) => {
  const validator = supabaseHelpers?.validateEAN;
  const value = String(raw || '').trim();
  if (!value) return null;
  if (typeof validator === 'function') {

    const result = validator(value);
    if (result?.valid) {
      if (result.type === 'ASIN') {
        return { asin: result.formatted };
      }
      return { ean: result.formatted };
    }
    return null;
  }
  return { ean: value };
};

const downloadTemplate = () => {
  const csv =
    'EAN/ASIN,Product Name,Quantity Received\n' +
    'B0ABC12345,Sample Amazon Listing,12\n' +
    '1234567890123,Generic Product,24\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'product-intake-template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const setRowIndexKeys = (map, row) => {
  if (!row) return;
  if (row.ean) {
    map.set(buildCodeKey(row.ean, 'EAN'), row);
  }
  if (row.asin) {
    map.set(buildCodeKey(row.asin, 'ASIN'), row);
  }
};

function ProductQuickAdd({
  companyId,
  userId,
  createdBy,
  existingRows = [],
  onComplete,
  onError,
  labels = defaultLabels
}) {
  const [manual, setManual] = useState({ code: '', name: '', qty: '' });
  const [pending, setPending] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizedRows = useMemo(() => {
    const map = new Map();
    existingRows.forEach((row) => setRowIndexKeys(map, row));
    return map;
  }, [existingRows]);

  const addManualLine = () => {
    setError('');
    const { code, name, qty } = manual;
    if (!code.trim() || !name.trim()) {
      setError(labels.errors?.missingFields || defaultLabels.errors.missingFields);
      return;
    }
    const parsedCode = parseCode(code);
    if (!parsedCode) {
      setError(labels.errors?.invalidCode || defaultLabels.errors.invalidCode);
      return;
    }
    const parsedQty = parseQty(qty);
    if (!parsedQty) {
      setError(labels.errors?.qty || defaultLabels.errors.qty);
      return;
    }
    const next = {
      id: randomId(),
      name: name.trim(),
      qty: parsedQty,
      ...parsedCode
    };
    setPending((prev) => [...prev, next]);
    setManual({ code: '', name: '', qty: '' });
    setMessage('');
  };

  const ingestRows = (rows) => {
    if (!rows.length) {
      setError(labels.errors?.fileRows || defaultLabels.errors.fileRows);
      return;
    }
    setPending((prev) => [...prev, ...rows]);
    setMessage(`${rows.length} ${rows.length === 1 ? 'line' : 'lines'} ready`);
    setError('');
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const validExt = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!validExt) {
      setError(labels.errors?.fileType || defaultLabels.errors.fileType);
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      if (!rows.length) {
        setError(labels.errors?.fileRows || defaultLabels.errors.fileRows);
        return;
      }
      const headers = rows.shift().map(normalizeHeader);
      const idxCode = headers.findIndex((h) => h.includes('ean') || h.includes('asin'));
      const idxName = headers.findIndex((h) => h.includes('product') && h.includes('name'));
      const idxQty = headers.findIndex((h) => h.includes('quantity') || h.includes('qty'));
      if (idxCode === -1 || idxName === -1 || idxQty === -1) {
        setError(labels.errors?.fileHeaders || defaultLabels.errors.fileHeaders);
        return;
      }
      const parsed = [];
      rows.forEach((row) => {
        const code = row[idxCode];
        const name = row[idxName];
        const qty = row[idxQty];
        if (!code || !name || qty == null) return;
        const parsedCode = parseCode(code);
        const parsedQty = parseQty(qty);
        if (!parsedCode || !parsedQty) return;
        parsed.push({
          id: randomId(),
          name: String(name).trim(),
          qty: parsedQty,
          ...parsedCode
        });
      });
      ingestRows(parsed);
    } catch (err) {
      setError(err.message || (labels.errors?.fileRows ?? defaultLabels.errors.fileRows));
    }
  };

  const removeLine = (id) => {
    setPending((prev) => prev.filter((line) => line.id !== id));
  };

  const upsertRow = async (line, localIndexMap) => {
    const key = line.ean
      ? buildCodeKey(line.ean, 'EAN')
      : line.asin
      ? buildCodeKey(line.asin, 'ASIN')
      : null;
    const matchedRow = key ? localIndexMap.get(key) : null;
    if (matchedRow) {
      const newQty = (Number(matchedRow.qty) || 0) + line.qty;
      const patch = { qty: newQty };
      if (!matchedRow.name && line.name) patch.name = line.name;
      if (line.ean && !matchedRow.ean) patch.ean = line.ean;
      if (line.asin && !matchedRow.asin) patch.asin = line.asin;
      await supabase.from('stock_items').update(patch).eq('id', matchedRow.id);
      const updated = { ...matchedRow, ...patch };
      setRowIndexKeys(localIndexMap, updated);
      return { type: 'update', row: updated };
    }
    const payload = {
      company_id: companyId || null,
      user_id: companyId ? null : userId || null,
      created_by: createdBy || userId || null,
      ean: line.ean || null,
      asin: line.asin || null,
      name: line.name,
      qty: line.qty
    };
    const { data, error } = await supabase.from('stock_items').insert(payload).select().single();
    if (error) throw error;
    const inserted = data;
    setRowIndexKeys(localIndexMap, inserted);
    return { type: 'insert', row: inserted };
  };

  const handleSubmit = async () => {
    if (!pending.length) return;
    if (!companyId && !userId) {
      setError('Missing account context.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const totalLines = pending.length;
      const localIndex = new Map(normalizedRows);
      const results = [];
      for (const line of pending) {
        const result = await upsertRow(line, localIndex);
        results.push(result);
      }
      setPending([]);
      const inserted = results.filter((r) => r.type === 'insert').map((r) => r.row);
      const updated = results.filter((r) => r.type === 'update').map((r) => r.row);
      const successText =
        labels.success?.replace('{count}', totalLines) ||
        defaultLabels.success.replace('{count}', totalLines);
      setMessage(successText);
      onComplete?.({
        inserted,
        updated,
        count: totalLines
      });
    } catch (err) {
      const msg =
        labels.errors?.save?.replace('{msg}', err.message) ||
        defaultLabels.errors.save.replace('{msg}', err.message);
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{labels.title}</h3>
          <p className="text-sm text-text-secondary max-w-2xl">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-text-primary hover:bg-gray-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {labels.template}
          </button>
          <label className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3 py-2 text-sm font-semibold cursor-pointer hover:bg-primary-dark">
            <Upload className="w-4 h-4" />
            {labels.uploadTitle}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-text-secondary">{labels.manualTitle}</label>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder={labels.eanLabel}
            value={manual.code}
            onChange={(e) => setManual((prev) => ({ ...prev, code: e.target.value }))}
          />
        </div>
        <input
          className="mt-6 w-full rounded-lg border px-3 py-2 text-sm"
          placeholder={labels.nameLabel}
          value={manual.name}
          onChange={(e) => setManual((prev) => ({ ...prev, name: e.target.value }))}
        />
        <div className="flex gap-2 mt-6">
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder={labels.qtyLabel}
            value={manual.qty}
            onChange={(e) => setManual((prev) => ({ ...prev, qty: e.target.value }))}
          />
          <button
            type="button"
            onClick={addManualLine}
            className="inline-flex items-center justify-center rounded-lg border border-primary text-primary px-3 py-2 text-sm font-semibold hover:bg-primary hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" />
            {labels.addLine}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-text-secondary">{labels.uploadHint}</p>

      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-text-primary">{labels.previewTitle}</h4>
          <span className="text-xs text-text-secondary">{pending.length} lines</span>
        </div>
        <div className="overflow-x-auto border rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 w-1/4">{labels.eanLabel}</th>
                <th className="px-3 py-2">{labels.nameLabel}</th>
                <th className="px-3 py-2 w-24 text-right">{labels.qtyLabel}</th>
                <th className="px-3 py-2 w-16 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-sm text-text-secondary" colSpan={4}>
                    {labels.empty}
                  </td>
                </tr>
              )}
              {pending.map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">
                    {line.ean || line.asin || '—'}
                  </td>
                  <td className="px-3 py-2">{line.name}</td>
                  <td className="px-3 py-2 text-right font-semibold">{line.qty}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-red-500 hover:text-red-600"
                      title={labels.remove}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-green-700">{message}</div>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending.length === 0 || loading}
          className="inline-flex items-center justify-center rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? 'Saving…' : labels.addInventory}
        </button>
      </div>
    </div>
  );
}

export default ProductQuickAdd;
