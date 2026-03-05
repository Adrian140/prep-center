import 'dotenv/config';
import SellingPartnerAPI from 'amazon-sp-api';

const parseTimeout = (rawValue, fallback) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export function createSpClient({ refreshToken, region }) {
  const responseTimeoutMs = parseTimeout(process.env.SPAPI_TIMEOUT_RESPONSE_MS, 120_000);
  const idleTimeoutMs = parseTimeout(process.env.SPAPI_TIMEOUT_IDLE_MS, 120_000);
  const deadlineTimeoutMs = parseTimeout(process.env.SPAPI_TIMEOUT_DEADLINE_MS, 300_000);
  return new SellingPartnerAPI({
    region: region || process.env.SPAPI_REGION,
    refresh_token: refreshToken || process.env.SPAPI_REFRESH_TOKEN,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: process.env.SPAPI_LWA_CLIENT_ID,
      SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SPAPI_LWA_CLIENT_SECRET,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SELLING_PARTNER_ROLE: process.env.SPAPI_ROLE_ARN
    },
    options: {
      use_role: true,
      // Avoid long hangs on remote SP-API calls.
      timeouts: {
        response: responseTimeoutMs,
        idle: idleTimeoutMs,
        deadline: deadlineTimeoutMs
      },
      retry_remote_timeout: true
    }
  });
}
