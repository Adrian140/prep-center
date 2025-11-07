import 'dotenv/config';

function mask(v) {
  if (!v) return 'MISSING';
  const s = String(v);
  return s.length <= 8 ? '****' : s.slice(0,4) + '…' + s.slice(-4);
}

console.log('SPAPI_LWA_CLIENT_ID =', mask(process.env.SPAPI_LWA_CLIENT_ID));
console.log('SPAPI_LWA_CLIENT_SECRET =', mask(process.env.SPAPI_LWA_CLIENT_SECRET));
console.log('SPAPI_REFRESH_TOKEN =', mask(process.env.SPAPI_REFRESH_TOKEN));
console.log('SPAPI_REGION =', process.env.SPAPI_REGION);
console.log('AWS_ACCESS_KEY_ID =', mask(process.env.AWS_ACCESS_KEY_ID));
console.log('AWS_SECRET_ACCESS_KEY =', mask(process.env.AWS_SECRET_ACCESS_KEY));
