import React from 'react';

const LABELS = {
  FR: 'France',
  DE: 'Germany',
  IT: 'Italy',
  ES: 'Spain',
  UK: 'United Kingdom',
  GB: 'United Kingdom'
};

const VARIANTS = {
  hero: {
    wrap: 'px-4 py-1 text-sm',
    colors: 'bg-red-100 text-red-700',
    label: 'text-red-700'
  },
  loud: {
    wrap: 'px-3 py-1 text-xs',
    colors: 'bg-red-100 text-red-700',
    label: 'text-red-700'
  },
  subtle: {
    wrap: 'px-2 py-0.5 text-xs',
    colors: 'bg-rose-50 text-rose-600',
    label: 'text-rose-600'
  }
};

const normalizeCode = (code) => {
  if (!code) return 'FR';
  const upper = code.toUpperCase();
  if (LABELS[upper]) return upper;
  if (upper === 'GB' || upper === 'UK') return 'UK';
  return upper;
};

const DestinationBadge = ({ code = 'FR', variant = 'loud', showLabel = true, className = '' }) => {
  const normalized = normalizeCode(code);
  const label = LABELS[normalized] || normalized;
  const styles = VARIANTS[variant] || VARIANTS.loud;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase ${styles.colors} ${styles.wrap} ${className}`.trim()}
    >
      {normalized}
      {showLabel && (
        <span className={`normal-case font-medium text-[11px] ${styles.label}`}>
          {label}
        </span>
      )}
    </span>
  );
};

export const getDestinationLabel = (code) => {
  const normalized = normalizeCode(code);
  return LABELS[normalized] || normalized;
};

export default DestinationBadge;
