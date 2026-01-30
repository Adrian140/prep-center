const MARKET_ALIASES = {
  FR: ['FR', 'FRA', 'FRANCE', 'FR-FR'],
  DE: ['DE', 'DEU', 'GERMANY', 'DEUTSCHLAND', 'DE-DE']
};

export const normalizeMarketCode = (value) => {
  if (!value) return '';
  const raw = String(value).trim().toUpperCase();
  if (!raw) return '';
  if (MARKET_ALIASES.FR.includes(raw)) return 'FR';
  if (MARKET_ALIASES.DE.includes(raw)) return 'DE';
  return raw;
};

export const formatMarketLabel = (code = '') => normalizeMarketCode(code) || String(code || '').toUpperCase();
