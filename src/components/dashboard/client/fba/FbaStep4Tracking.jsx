import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function FbaStep4Tracking({
  tracking,
  onUpdateTracking,
  onBack,
  onFinish,
  error = '',
  loading = false
}) {
  const formatNumber = (value) => {
    const num = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(num)) return null;
    const fixed = num % 1 === 0 ? String(num) : num.toFixed(2);
    return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  };

  const formatWeight = (value) => {
    const num = formatNumber(value);
    return num ? `${num} kg` : '—';
  };

  const formatDimensions = (value) => {
    if (!value) return '—';
    if (typeof value === 'object') {
      const l = formatNumber(value.length);
      const w = formatNumber(value.width);
      const h = formatNumber(value.height);
      return l && w && h ? `${l} x ${w} x ${h} cm` : '—';
    }
    const parts = String(value)
      .split(/[xX]/)
      .map((part) => formatNumber(part.trim()))
      .filter(Boolean);
    if (parts.length >= 3) {
      return `${parts[0]} x ${parts[1]} x ${parts[2]} cm`;
    }
    const fallback = formatNumber(value);
    return fallback ? `${fallback} cm` : String(value);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <div className="font-semibold text-slate-900">Final step: Tracking details</div>
        <div className="text-sm text-slate-500">Provide carrier tracking IDs</div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">
            {error}
          </div>
        </div>
      )}

      <div className="px-6 py-4 overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 text-left">Box #</th>
              <th className="py-2 text-left">FBA box label #</th>
              <th className="py-2 text-left">Tracking ID #</th>
              <th className="py-2 text-left">Status</th>
              <th className="py-2 text-left">Weight (kg)</th>
              <th className="py-2 text-left">Dimensions (cm)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tracking.map((row) => (
              <tr key={row.id} className="align-middle">
                <td className="py-3">{row.box}</td>
                <td className="py-3 text-slate-800 font-semibold">{row.label}</td>
                <td className="py-3">
                  <input
                    type="text"
                    value={row.trackingId}
                    onChange={(e) => onUpdateTracking(row.id, e.target.value)}
                    className="border rounded-md px-2 py-1 w-full min-w-[200px]"
                    placeholder="Enter tracking ID"
                    disabled={loading}
                  />
                </td>
                <td className="py-3 text-emerald-700 font-semibold">{row.status}</td>
                <td className="py-3">{formatWeight(row.weight)}</td>
                <td className="py-3">{formatDimensions(row.dimensions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-slate-600">Shipments are complete once tracking is provided.</div>
        <div className="flex gap-3 justify-end">
          <button onClick={onBack} className="border border-slate-300 text-slate-700 px-4 py-2 rounded-md">
            Back
          </button>
          <button
            onClick={onFinish}
            disabled={loading}
            className={`px-4 py-2 rounded-md font-semibold shadow-sm ${
              loading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {loading ? 'Submitting…' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  );
}
