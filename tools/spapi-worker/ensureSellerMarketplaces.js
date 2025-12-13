import 'dotenv/config';
import { supabase } from './supabaseClient.js';

const MARKETPLACE_REGIONS = {
  A13V1IB3VIYZZH: 'eu',
  A1PA6795UKMFR9: 'eu',
  A1RKKUPIHCS9HS: 'eu',
  A1F83G8C2ARO7P: 'eu',
  APJ6JRA9NG5V4: 'eu',
  A1805IZSGTT6HS: 'eu',
  A2NODRKZP88ZB9: 'eu',
  A1C3SOZRARQ6R3: 'eu',
  AMEN7PMS3EDWL: 'eu',
  ATVPDKIKX0DER: 'na',
  A21TJRUUN4KGV: 'in',
  A1VC38T7YXB528: 'jp'
};

async function fetchSellerTokens() {
  const { data, error } = await supabase
    .from('seller_tokens')
    .select(
      'seller_id, refresh_token, marketplace_ids, seller_links!inner(user_id, company_id)'
    )
    .not('refresh_token', 'is', null);
  if (error) throw error;
  return data || [];
}

async function upsertMissingIntegration({
  userId,
  companyId,
  sellerId,
  marketplaceId,
  refreshToken
}) {
  const region = MARKETPLACE_REGIONS[marketplaceId] || 'eu';
  const { error } = await supabase
    .from('amazon_integrations')
    .upsert(
      {
        user_id: userId,
        company_id: companyId,
        marketplace_id: marketplaceId,
        region,
        refresh_token: refreshToken,
        selling_partner_id: sellerId,
        status: 'active',
        last_error: null
      },
      { onConflict: 'user_id,marketplace_id' }
    );
  if (error) throw error;
}

async function ensureSellerMarketplaces(seller) {
  const companyId = seller?.seller_links?.company_id;
  const userId = seller?.seller_links?.user_id;
  const marketplaces = Array.isArray(seller.marketplace_ids)
    ? seller.marketplace_ids.filter(Boolean)
    : [];
  if (!companyId || !userId || !seller.refresh_token || !marketplaces.length) {
    return { sellerId: seller.seller_id, inserted: 0 };
  }

  const { data: existing, error } = await supabase
    .from('amazon_integrations')
    .select('marketplace_id')
    .eq('company_id', companyId);
  if (error) throw error;
  const existingSet = new Set((existing || []).map((row) => row.marketplace_id));

  let inserted = 0;
  for (const marketplaceId of marketplaces) {
    if (existingSet.has(marketplaceId)) continue;
    await upsertMissingIntegration({
      userId,
      companyId,
      sellerId: seller.seller_id,
      marketplaceId,
      refreshToken: seller.refresh_token
    });
    inserted += 1;
  }
  return { sellerId: seller.seller_id, inserted };
}

async function main() {
  const sellers = await fetchSellerTokens();
  if (!sellers.length) {
    console.log('No sellers with tokens found.');
    return;
  }
  let totalInserted = 0;
  for (const seller of sellers) {
    try {
      const result = await ensureSellerMarketplaces(seller);
      totalInserted += result.inserted;
      if (result.inserted) {
        console.log(
          `Inserted ${result.inserted} marketplace integrations for seller ${result.sellerId}`
        );
      }
    } catch (err) {
      console.error(`Failed to ensure marketplaces for seller ${seller.seller_id}`, err);
    }
  }
  console.log(`Done. Inserted ${totalInserted} missing integrations in total.`);
}

main().catch((err) => {
  console.error('Fatal error ensuring seller marketplaces', err);
  process.exit(1);
});
