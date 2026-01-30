import { normalizeMarketCode } from './market';

const ensureMap = (value) => {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value)) return {};
  return value;
};

const sumMap = (map) =>
  Object.values(map).reduce((total, entry) => {
    const num = Number(entry || 0);
    return total + (Number.isFinite(num) ? num : 0);
  }, 0);

export const getPrepQtyForMarket = (row, market) => {
  if (!row) return 0;
  const key = normalizeMarketCode(market);
  const map = ensureMap(row.prep_qty_by_country);
  if (key && Object.prototype.hasOwnProperty.call(map, key)) {
    const num = Number(map[key] || 0);
    return Number.isFinite(num) ? num : 0;
  }
  const fallback = Number(row.qty || 0);
  return Number.isFinite(fallback) ? fallback : 0;
};

export const buildPrepQtyPatch = (row, market, nextQty) => {
  const key = normalizeMarketCode(market) || 'FR';
  const map = ensureMap(row?.prep_qty_by_country);
  const nextMap = { ...map, [key]: Math.max(0, Number(nextQty || 0)) };
  return {
    prep_qty_by_country: nextMap,
    qty: sumMap(nextMap)
  };
};

export const mapStockRowsForMarket = (rows, market) =>
  (rows || []).map((row) => ({
    ...row,
    qty: getPrepQtyForMarket(row, market)
  }));
