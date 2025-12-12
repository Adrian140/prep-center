import 'dotenv/config';
import { supabase } from './supabaseClient.js';

async function fetchSellers() {
  const [{ data: tokens, error: tokenError }, { data: links, error: linkError }] =
    await Promise.all([
      supabase
        .from('seller_tokens')
        .select('seller_id, refresh_token')
        .not('refresh_token', 'is', null),
      supabase.from('seller_links').select('seller_id, company_id')
    ]);
  if (tokenError) throw tokenError;
  if (linkError) throw linkError;
  const linkMap = new Map((links || []).map((row) => [row.seller_id, row.company_id]));
  return (tokens || []).map((token) => ({
    seller_id: token.seller_id,
    refresh_token: token.refresh_token,
    company_id: linkMap.get(token.seller_id) || null
  }));
}

async function restoreForSeller(seller) {
  const companyId = seller?.company_id;
  if (!companyId || !seller?.refresh_token) {
    return { sellerId: seller?.seller_id, restored: 0, reason: 'missing company or token' };
  }

  const { data: integrations, error: integrationsError } = await supabase
    .from('amazon_integrations')
    .select('id, status')
    .eq('company_id', companyId);
  if (integrationsError) {
    throw new Error(`Could not read integrations for ${companyId}: ${integrationsError.message}`);
  }
  if (!integrations?.length) {
    return { sellerId: seller.seller_id, restored: 0, reason: 'no integrations found' };
  }
  const affected =
    integrations.filter((row) => (row?.status || '').toLowerCase() !== 'active').length ||
    integrations.length;

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
  return { sellerId: seller.seller_id, restored: affected };
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
      if (result.restored) {
        console.log(
          `Restored ${result.restored} integrations for seller ${result.sellerId}.`
        );
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
