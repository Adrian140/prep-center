import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

export async function refreshAndStoreToken() {
  const sp = createSpClient({ refreshToken: process.env.SPAPI_REFRESH_TOKEN });
  const t = await sp.refreshAccessToken(); // { access_token, expires_in }
  const expiresAt = new Date(Date.now() + (t.expires_in - 60) * 1000); // buffer 60s

  const { error } = await supabase
    .from('amazon_tokens')
    .insert({
      access_token: t.access_token,
      expires_at: expiresAt.toISOString()
    });

  if (error) throw error;

  return { expiresAt };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshAndStoreToken()
    .then(({ expiresAt }) => console.log('Token salvat. Expiră la:', expiresAt.toISOString()))
    .catch((e) => {
      console.error('Eroare refresh token:', e?.response?.data || e);
      process.exit(1);
    });
}
