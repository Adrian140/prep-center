// Syncs images from the "integration-media" bucket into the integration_media table,
// so front-end can load fast without listing the bucket on each language change.
// Requires env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
// accept either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = 'integration-media';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const LANGS = ['ro', 'fr', 'en', 'de', 'es', 'it'];
const CARD_KEYS = ['import', 'notify', 'prep', 'report-send', 'report-incoming', 'report-email'];

async function findFirstFile(lang, cardKey) {
  // Try these path layouts, in order
  const candidatePaths = [
    `${lang}/${cardKey}`,
    `${cardKey}/${lang}`,
    `${cardKey}`
  ];
  for (const path of candidatePaths) {
    const { data, error } = await supabase.storage.from(BUCKET).list(path, { limit: 1 });
    if (error || !data || !data.length) continue;
    const file = data[0]?.name;
    if (!file) continue;
    const fullPath = path ? `${path}/${file}` : file;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
    if (pub?.publicUrl) return pub.publicUrl;
  }
  return null;
}

async function syncOne(lang, cardKey) {
  const url = await findFirstFile(lang, cardKey);
  if (!url) return { synced: false, reason: 'no-file' };
  const { error } = await supabase
    .from('integration_media')
    .upsert(
      { lang, card_key: cardKey, image_url: url, updated_at: new Date().toISOString() },
      { onConflict: 'lang,card_key' }
    );
  if (error) return { synced: false, reason: error.message };
  return { synced: true, url };
}

async function main() {
  console.log('Sync integration-media bucket -> integration_media table');
  for (const lang of LANGS) {
    for (const cardKey of CARD_KEYS) {
      const res = await syncOne(lang, cardKey);
      if (res.synced) {
        console.log(`✔ ${lang}/${cardKey} -> ${res.url}`);
      } else {
        console.log(`… ${lang}/${cardKey} skipped (${res.reason})`);
      }
    }
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
