import 'dotenv/config';
import { supabase } from './supabaseClient.js';
import { createSpClient } from './spapiClient.js';

const ALLOWED_MARKETPLACES = new Set([
  'A13V1IB3VIYZZH', // FR
  'A1PA6795UKMFR9', // DE
  'A1RKKUPIHCS9HS', // ES
  'APJ6JRA9NG5V4', // IT
  'A1F83G8C2ARO7P', // UK
  'AMEN7PMS3EDWL', // BE
  'A1805IZSGTT6HS', // NL
  'A2NODRKZP88ZB9', // SE
  'A1C3SOZRARQ6R3' // PL
]);

const MARKETPLACE_REGIONS = {
  A13V1IB3VIYZZH: 'eu',
  A1PA6795UKMFR9: 'eu',
  A1RKKUPIHCS9HS: 'eu',
  A1F83G8C2ARO7P: 'eu',
  APJ6JRA9NG5V4: 'eu',
  A1805IZSGTT6HS: 'eu',
  A2NODRKZP88ZB9: 'eu',
  A1C3SOZRARQ6R3: 'eu',
  AMEN7PMS3EDWL: 'eu'
};

const REGION_PRIORITY = ['eu'];

function normalizeMarketplaces(list) {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(
      list
        .filter((id) => typeof id === 'string' && id.length > 0)
        .filter((id) => ALLOWED_MARKETPLACES.has(id))
    )
  );
}

function guessRegionFromMarketplaces(list) {
  for (const id of list || []) {
    const region = MARKETPLACE_REGIONS[id];
    if (region) return region;
  }
  return 'eu';
}

function extractMarketplaceIds(response) {
  const payload = response?.payload || response || {};
  const participationList =
    payload?.ListMarketplaceParticipations?.MarketplaceParticipations ||
    payload?.marketplaceParticipations ||
    payload?.MarketplaceParticipations ||
    payload?.ListingsParticipations ||
    payload?.Participations ||
    [];
  const ids = [];
  for (const entry of participationList || []) {
    const id =
      entry?.Marketplace?.id ||
      entry?.Marketplace?.Id ||
      entry?.MarketplaceId ||
      entry?.marketplaceId ||
      entry?.Marketplace?.marketplaceId ||
      entry?.Marketplace?.defaultMarketplaceId ||
      entry?.marketplace?.id;
    if (id) {
      ids.push(id);
    }
  }
  return normalizeMarketplaces(ids);
}

async function discoverSellerMarketplaceIds({ refreshToken, regionHint }) {
  if (!refreshToken) return [];
  const attempts = [];
  if (regionHint) attempts.push(regionHint);
  for (const region of REGION_PRIORITY) {
    if (!attempts.includes(region)) {
      attempts.push(region);
    }
  }
  for (const region of attempts) {
    try {
      const spClient = createSpClient({ refreshToken, region });
      const res = await spClient.callAPI({
        operation: 'getMarketplaceParticipations',
        endpoint: 'sellers'
      });
      const ids = extractMarketplaceIds(res);
      if (ids.length) {
        return ids;
      }
    } catch (err) {
      console.warn(
        `Failed to fetch marketplace participations for a seller (region ${region}): ${err?.message || err}`
      );
    }
  }
  return [];
}

function sortAndCompare(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function fetchSellerTokens() {
  const [{ data: tokens, error: tokenError }, { data: links, error: linkError }] = await Promise.all([
    supabase
      .from('seller_tokens')
      .select('seller_id, refresh_token, marketplace_ids')
      .not('refresh_token', 'is', null),
    supabase.from('seller_links').select('seller_id, user_id, company_id')
  ]);
  if (tokenError) throw tokenError;
  if (linkError) throw linkError;
  const linkMap = new Map((links || []).map((row) => [row.seller_id, row]));
  return (tokens || []).map((token) => ({
    ...token,
    seller_links: linkMap.get(token.seller_id) || null
  }));
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
  const storedMarketplaces = normalizeMarketplaces(seller.marketplace_ids);
  const regionHint = guessRegionFromMarketplaces(storedMarketplaces);
  const discoveredMarketplaces = await discoverSellerMarketplaceIds({
    refreshToken: seller.refresh_token,
    regionHint
  });
  const marketplaces = normalizeMarketplaces([
    ...storedMarketplaces,
    ...discoveredMarketplaces,
    ...ALLOWED_MARKETPLACES
  ]);

  if (!companyId || !userId || !seller.refresh_token) {
    return { sellerId: seller.seller_id, inserted: 0 };
  }

  if (!marketplaces.length) {
    return { sellerId: seller.seller_id, inserted: 0, reason: 'no marketplaces detected' };
  }

  const sortedStored = [...storedMarketplaces].sort();
  const sortedCurrent = [...marketplaces].sort();
  if (!sortAndCompare(sortedStored, sortedCurrent)) {
    await supabase
      .from('seller_tokens')
      .update({
        marketplace_ids: marketplaces,
        updated_at: new Date().toISOString()
      })
      .eq('seller_id', seller.seller_id);
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
