const CARRIER_LINKS = {
  UPS: {
    name: 'UPS',
    url: 'https://www.ups.com/track'
  },
  COLISSIMO: {
    name: 'Colissimo',
    url: 'https://www.laposte.fr/outils/suivre-vos-envois'
  },
  CHRONOPOST: {
    name: 'Chronopost',
    url: 'https://www.chronopost.fr/tracking-no-cms/suivi-page'
  }
};

export const getFbmCarrierMeta = (carrierCode, carrierName) => {
  const normalizedCode = String(carrierCode || '').trim().toUpperCase();
  if (normalizedCode && CARRIER_LINKS[normalizedCode]) {
    return CARRIER_LINKS[normalizedCode];
  }

  const normalizedName = String(carrierName || '').trim().toLowerCase();
  if (!normalizedName) return null;

  return Object.values(CARRIER_LINKS).find((carrier) => carrier.name.toLowerCase() === normalizedName) || null;
};
