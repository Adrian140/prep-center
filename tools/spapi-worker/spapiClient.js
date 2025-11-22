import 'dotenv/config';
import SellingPartnerAPI from 'amazon-sp-api';

export function createSpClient({ refreshToken, region }) {
  return new SellingPartnerAPI({
    region: region || process.env.SPAPI_REGION,
    refresh_token: refreshToken || process.env.SPAPI_REFRESH_TOKEN,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_LWA_CLIENT_ID,
      SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_LWA_CLIENT_SECRET,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SELLING_PARTNER_ROLE: process.env.SPAPI_ROLE_ARN
    options: {
      use_role: true
    }
  });
}
