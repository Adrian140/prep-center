export const DEFAULT_ISSUER_PROFILES = {
  FR: {
    country: 'FR',
    company_name: 'GLOBAL FULFILL HUB',
    vat_number: 'FR38941373110',
    registration_number: 'SIRET 941373110 00019',
    address_line1: '32 RUE DE LA LIBERATION',
    city: 'PLERGUER',
    postal_code: '35540',
    phone: '+33 675 11 62 18',
    email: 'contact@prep-center.eu',
    website: 'https://prep-center.eu',
    iban: 'BE28905309130620',
    bic: 'TRWIBEB1XXX'
  },
  DE: {
    country: 'DE',
    company_name: 'Prep Center Germany',
    vat_number: 'DE000000000',
    registration_number: 'HRB 000000',
    address_line1: 'Musterstrasse 1',
    city: 'Berlin',
    postal_code: '10115',
    phone: '+49 0 00 00 00 00',
    email: 'billing-de@prep-center.eu'
  }
};

const normalizeCountry = (value) => String(value || '').trim().toUpperCase();

export const getSimpleVatRule = ({ issuerCountry, customerCountry }) => {
  const issuer = normalizeCountry(issuerCountry);
  const customer = normalizeCountry(customerCountry);

  if (issuer === 'FR' && customer === 'FR') {
    return {
      vatRate: 0.2,
      vatLabel: 'TVA 20%',
      legalNote: 'TVA locale FR aplicată (B2B FR -> FR).'
    };
  }

  if (issuer === 'DE' && customer === 'FR') {
    return {
      vatRate: 0,
      vatLabel: 'TVA 0%',
      legalNote: 'Exonéré de TVA - livraison intracommunautaire / autoliquidation (B2B DE -> FR).'
    };
  }

  return {
    vatRate: 0,
    vatLabel: 'TVA 0%',
    legalNote: 'Regulă simplificată: TVA 0% pentru această combinație de țări în v1.'
  };
};

export const roundMoney = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
};
