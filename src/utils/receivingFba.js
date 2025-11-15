const DIRECT_ACTION = 'direct_to_amazon';
const HOLD_ACTION = 'hold_for_prep';
const DIRECT_QTY_REGEX = /^direct_to_amazon[:|](\d+)$/;

const normalizeQty = (value) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const encodeRemainingAction = (sendToFba, qty) => {
  if (!sendToFba) return HOLD_ACTION;
  const normalized = normalizeQty(qty);
  return normalized ? `${DIRECT_ACTION}:${normalized}` : DIRECT_ACTION;
};

export const parseRemainingAction = (value) => {
  if (typeof value !== 'string') {
    return { isDirect: false, qtyHint: null };
  }
  if (value === DIRECT_ACTION) {
    return { isDirect: true, qtyHint: null };
  }
  const match = value.match(DIRECT_QTY_REGEX);
  if (match) {
    const qty = Number(match[1]);
    if (Number.isFinite(qty) && qty > 0) {
      return { isDirect: true, qtyHint: qty };
    }
    return { isDirect: true, qtyHint: null };
  }
  return { isDirect: false, qtyHint: null };
};

export const hasDirectAmazonIntent = (value) => parseRemainingAction(value).isDirect;

export const resolveFbaIntent = (item) => {
  if (!item || typeof item !== 'object') {
    return { hasIntent: false, qty: 0, qtyHint: null, directFromAction: false };
  }
  const parsed = parseRemainingAction(item.remaining_action);
  const hasSendProp = Object.prototype.hasOwnProperty.call(item, 'send_to_fba');
  const hasIntent = hasSendProp ? Boolean(item.send_to_fba) : parsed.isDirect;
  const storedQty = Math.max(0, Number(item.fba_qty) || 0);
  let qty = hasIntent ? storedQty : 0;
  if (hasIntent && qty === 0 && parsed.qtyHint) {
    qty = parsed.qtyHint;
  }
  return {
    hasIntent,
    qty,
    qtyHint: parsed.qtyHint,
    directFromAction: parsed.isDirect
  };
};
