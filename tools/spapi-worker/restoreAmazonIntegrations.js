import 'dotenv/config';
import { supabase } from './supabaseClient.js';

const DEFAULT_MARKETS = [
  'A13V1IB3VIYZZH', // FR
  'A1PA6795UKMFR9', // DE
  'A1RKKUPIHCS9HS', // ES
  'APJ6JRA9NG5V4', // IT
  'A1F83G8C2ARO7P', // UK
  'AMEN7PMS3EDWL', // BE
  'A1805IZSGTT6HS', // NL
  'A2NODRKZP88ZB9', // SE
  'A1C3SOZRARQ6R3' // PL
];
const MARKETPLACE_REGIONS = {
  A13V1IB3VIYZZH: 'eu',
  A1PA6795UKMFR9: 'eu',
  A1RKKUPIHCS9HS: 'eu',
  APJ6JRA9NG5V4: 'eu',
  A1F83G8C2ARO7P: 'eu',
  AMEN7PMS3EDWL: 'eu',
  A1805IZSGTT6HS: 'eu',
  A2NODRKZP88ZB9: 'eu',
  A1C3SOZRARQ6R3: 'eu'
};

async function fetchSellers() {
  const [{ data: tokens, error: tokenError }, { data: links, error: linkError }] =
    await Promise.all([
      supabase
        .from('seller_tokens')
        .select('seller_id, refresh_token, marketplace_ids')
        .not('refresh_token', 'is', null),
      supabase.from('seller_links').select('seller_id, company_id, user_id')
    ]);
  if (tokenError) throw tokenError;
  if (linkError) throw linkError;
  const linkMap = new Map(
    (links || []).map((row) => [row.seller_id, { company_id: row.company_id, user_id: row.user_id }])
  );
  return (tokens || []).map((token) => ({
    seller_id: token.seller_id,
    refresh_token: token.refresh_token,
    company_id: linkMap.get(token.seller_id)?.company_id || null,
    user_id: linkMap.get(token.seller_id)?.user_id || null,
    marketplace_ids: Array.isArray(token.marketplace_ids)
      ? token.marketplace_ids.filter(Boolean)
      : []
  }));
}

async function restoreForSeller(seller) {
  const companyId = seller?.company_id;
  const userId = seller?.user_id;
  if (!companyId || !userId || !seller?.refresh_token) {
    return { sellerId: seller?.seller_id, restored: 0, reason: 'missing company, user or token' };
  }

  const { data: integrations, error: integrationsError } = await supabase
    .from('amazon_integrations')
    .select('id, status, marketplace_id')
    .eq('company_id', companyId);
  if (integrationsError) {
    throw new Error(`Could not read integrations for ${companyId}: ${integrationsError.message}`);
  }

  const existingSet = new Set((integrations || []).map((row) => row.marketplace_id).filter(Boolean));
  const mergedMarketplaces = new Set([
    ...DEFAULT_MARKETS,
    ...seller.marketplace_ids,
    ...existingSet
  ]);

  let inserted = 0;
  for (const marketplaceId of mergedMarketplaces) {
    if (!marketplaceId || existingSet.has(marketplaceId)) continue;
    const { error: insertError } = await supabase.from('amazon_integrations').insert({
      user_id: userId,
      company_id: companyId,
      marketplace_id: marketplaceId,
      region: MARKETPLACE_REGIONS[marketplaceId] || 'eu',
      refresh_token: seller.refresh_token,
      selling_partner_id: seller.seller_id,
      status: 'active',
      last_error: null
    });
    if (insertError) {
      throw new Error(
        `Failed to insert marketplace ${marketplaceId} for seller ${seller.seller_id}: ${insertError.message}`
      );
    }
    inserted += 1;
  }

  await supabase
    .from('seller_tokens')
    .update({
      marketplace_ids: Array.from(mergedMarketplaces),
      updated_at: new Date().toISOString()
    })
    .eq('seller_id', seller.seller_id);

  const { error: updateError } = await supabase
    .from('amazon_integrations')
    .update({
      refresh_token: seller.refresh_token,
      status: 'active',
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', companyId);
  if (updateError) {
    throw new Error(`Failed to update integrations for seller ${seller.seller_id}: ${updateError.message}`);
  }
  const affected =
    integrations.filter((row) => (row?.status || '').toLowerCase() !== 'active').length ||
    integrations.length;
  return { sellerId: seller.seller_id, restored: affected, inserted };
}

async function main() {
  const sellers = await fetchSellers();
  if (!sellers.length) {
    console.log('No seller tokens found. Nothing to restore.');
    return;
  }
  let total = 0;
  for (const seller of sellers) {
    try {
      const result = await restoreForSeller(seller);
      total += result.restored;
      if (result.inserted) {
        console.log(
          `Inserted ${result.inserted} missing marketplaces for seller ${result.sellerId}.`
        );
      }
      if (result.restored) {
        console.log(`Restored ${result.restored} integrations for seller ${result.sellerId}.`);
      } else {
        console.log(
          `Skipped seller ${result.sellerId}: ${result.reason || 'already up to date'}.`
        );
      }
    } catch (err) {
      console.error(`Restore failed for seller ${seller?.seller_id}`, err);
    }
  }
  console.log(`Done. Restored ${total} integrations in total.`);
}

main().catch((err) => {
  console.error('Fatal error in restore script', err);
  process.exit(1);
});
