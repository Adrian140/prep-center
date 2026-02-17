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
    company_name: 'Alina-Elena Cenusa',
    vat_number: 'DE360531094',
    registration_number: '',
    address_line1: 'Schondelgrund 15',
    city: 'Hornberg',
    postal_code: '87132',
    phone: '+49 176 24963618',
    email: 'logistics.de@prep-center.eu',
    website: 'https://prep-center.eu',
    iban: 'BE98 9676 6791 5993',
    bic: 'TRWIBEB1XXX'
  },
  RO: {
    country: 'RO',
    company_name: 'SHIFT MARKETING LOGIC S.R.L.',
    vat_number: 'RO45812121',
    registration_number: '',
    address_line1: 'Sat. Puiesti, Com. Puiesti, Nr. 590',
    city: 'Puiesti, Judet Vaslui',
    postal_code: '737425',
    phone: '',
    email: '',
    website: '',
    iban: '',
    bic: ''
  }
};

const normalizeCountry = (value) => String(value || '').trim().toUpperCase();

export const getSimpleVatRule = ({ issuerCountry, customerCountry }) => {
  const issuer = normalizeCountry(issuerCountry);
  const customer = normalizeCountry(customerCountry);

  if (issuer === 'FR' && customer === 'FR') {
    return {
      vatRate: 0.2,
      vatLabel: 'VAT 20%',
      legalNote: 'French domestic VAT applies (B2B FR to FR).'
    };
  }

  if ((issuer === 'DE' || issuer === 'RO') && customer === 'FR') {
    return {
      vatRate: 0,
      vatLabel: 'VAT 0%',
      legalNote: `VAT exempt intra-community B2B supply (reverse charge, ${issuer} to FR).`
    };
  }

  return {
    vatRate: 0,
    vatLabel: 'VAT 0%',
    legalNote: 'Simplified VAT rule: 0% VAT for this country combination (v1).'
  };
};

export const roundMoney = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
};
