export const FALLBACK_CARRIERS = [
  { code: 'AMAZON', label: 'Amazon Logistics' },
  { code: 'COLISPRIVE', label: 'Colis Privé' },
  { code: 'COLISSIMO', label: 'Colissimo' },
  { code: 'CHRONOPOST', label: 'Chronopost' },
  { code: 'DHL', label: 'DHL' },
  { code: 'DPD', label: 'DPD' },
  { code: 'ELOGISTICS', label: 'eLogistics' },
  { code: 'FEDEX', label: 'FedEx' },
  { code: 'GLS', label: 'GLS' },
  { code: 'KUEHNE', label: 'Kuehne + Nagel' },
  { code: 'MONDIAL', label: 'Mondial Relay' },
  { code: 'RELAISCOLIS', label: 'Relais Colis' },
  { code: 'SCHENKER', label: 'SCHENKER' },
  { code: 'TNT', label: 'TNT' },
  { code: 'UPS', label: 'UPS' },
  { code: 'OTHER', label: 'Other' }
];

const FALLBACK_MAP = new Map(FALLBACK_CARRIERS.map((item) => [item.code, item]));

export const normalizeCarriers = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [...FALLBACK_CARRIERS];
  }
  const registry = new Map();
  rows.forEach((row) => {
    const code = String(row.code || '').trim().toUpperCase();
    if (!code) return;
    if (registry.has(code)) return;
    const label =
      row.label ||
      row.name ||
      FALLBACK_MAP.get(code)?.label ||
      code;
    registry.set(code, { code, label });
  });

  // Ensure "Other" option is always present
  if (!registry.has('OTHER')) {
    const fallbackOther = FALLBACK_MAP.get('OTHER');
    if (fallbackOther) registry.set('OTHER', fallbackOther);
  }

  const normalized = Array.from(registry.values());
  normalized.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  );
  return normalized;
};
