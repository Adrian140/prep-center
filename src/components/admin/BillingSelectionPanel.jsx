import React, { useMemo, useState } from 'react';

const todayIso = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value) =>
  Number.isFinite(value) ? value.toFixed(2) : '0.00';
const formatUnits = (value) => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

export default function BillingSelectionPanel({
  selections = {},
  onSave,
  onClear,
  isSaving = false,
  error: externalError
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [feedback, setFeedback] = useState('');

  const aggregated = useMemo(() => {
    const groups = {};
    const lineRefs = [];
    let total = 0;
    Object.values(selections).forEach(({ section, row }) => {
      if (!row?.id) return;
      const units = Number(row.units ?? row.orders_units ?? 0);
      const unitPrice = Number(row.unit_price ?? 0);
      const candidateTotal =
        row.total != null ? Number(row.total) : Number.isFinite(unitPrice * units) ? unitPrice * units : 0;
      const lineTotal = Number.isFinite(candidateTotal) ? candidateTotal : 0;
      total += lineTotal;
      const key = `${section}:${String(row.service || '—')}:${unitPrice}`;
      if (!groups[key]) {
        groups[key] = {
          section,
          service: row.service || 'Serviciu necunoscut',
          unitPrice,
          units: 0,
          total: 0
        };
      }
      groups[key].units += units;
      groups[key].total += lineTotal;
      lineRefs.push({ section, id: row.id });
    });
    const items = Object.values(groups).sort((a, b) =>
      a.service.localeCompare(b.service)
    );
    return {
      items,
      total,
      count: lineRefs.length,
      lineRefs
    };
  }, [selections]);

  const handleClear = () => {
    onClear?.();
    setFeedback('');
  };

  const handleSave = async () => {
    if (!aggregated.count) {
      setFeedback('Selectează cel puțin o linie.');
      return;
    }
    if (!invoiceNumber.trim()) {
      setFeedback('Completează numărul facturii.');
      return;
    }
    const payload = {
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: invoiceDate || todayIso(),
      total: aggregated.total,
      lines: aggregated.lineRefs
    };
    setFeedback('');
    const result = onSave ? await onSave(payload) : { error: null };
    if (result?.error) {
      setFeedback(result.error.message || 'Nu am putut salva factura.');
      return;
    }
    setFeedback('Factura a fost salvată.');
    setInvoiceNumber('');
    setInvoiceDate(todayIso());
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-text-secondary">Panou facturare</p>
        <p className="flex items-baseline justify-between text-lg font-semibold text-text-primary">
          <span>Coș: {aggregated.count} {aggregated.count === 1 ? 'linie' : 'linii'}</span>
          <span className="text-sm text-text-secondary">
            Total: {formatMoney(aggregated.total)} €
          </span>
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-gray-200 p-3 text-sm">
        {aggregated.items.length === 0 ? (
          <p className="text-xs text-text-secondary">
            Selectează linii din FBA/FBM/Other pentru a începe.
          </p>
        ) : (
          <ul className="space-y-2">
            {aggregated.items.map((item) => (
              <li key={`${item.section}-${item.service}-${item.unitPrice}`} className="flex justify-between">
                <div>
                  <p className="font-medium text-text-primary">{item.service}</p>
                  <p className="text-xs text-text-secondary">
                    {item.section.toUpperCase()} · {formatUnits(item.units)} unități
                    {Number.isFinite(item.unitPrice) && (
                      <> · @{formatMoney(item.unitPrice)} €</>
                    )}
                  </p>
                </div>
                <div className="text-sm font-semibold text-text-primary">
                  {formatMoney(item.total)} €
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <label className="block text-[13px] font-medium text-text-secondary">
          Număr factură
        </label>
        <input
          type="text"
          className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
          placeholder="Ex: 2025-123"
        />
        <label className="block text-[13px] font-medium text-text-secondary">
          Data facturii
        </label>
        <input
          type="date"
          className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          value={invoiceDate}
          onChange={(event) => setInvoiceDate(event.target.value)}
        />
      </div>

      {(feedback || externalError) && (
        <p className="text-sm text-red-600">
          {feedback || externalError}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || aggregated.count === 0}
          className="flex-1 rounded bg-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Salvez...' : 'Salvează factură'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded border border-gray-200 px-3 py-2 text-sm font-semibold text-text-primary"
        >
          Golește selecția
        </button>
      </div>
    </div>
  );
}
