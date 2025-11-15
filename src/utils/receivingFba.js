const DIRECT_ACTION = 'direct_to_amazon';
const HOLD_ACTION = 'hold_for_prep';

export const encodeRemainingAction = (sendToFba) => (sendToFba ? DIRECT_ACTION : HOLD_ACTION);

export const parseRemainingAction = (value) => {
  if (typeof value !== 'string') {
    return { isDirect: false };
  }
  if (value === DIRECT_ACTION) {
    return { isDirect: true };
  }
  return { isDirect: false };
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
  return {
    hasIntent,
    qty,
    qtyHint: null,
    directFromAction: parsed.isDirect
  };
};
