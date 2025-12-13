import 'dotenv/config';
import { supabase } from './supabaseClient.js';

const PAGE_SIZE = 1000;
const DELETE_CHUNK = 500;

const normalize = (value) => (value || '').trim().toUpperCase();

function keyFromRow(row) {
  const companyId = row?.company_id || '';
  const sku = normalize(row?.sku);
  const asin = normalize(row?.asin);
  if (!companyId || !sku || !asin) return null;
  return `${companyId}::${sku}::${asin}`;
}

function pickTimestamp(row) {
  return new Date(row?.created_at || 0).getTime() || 0;
}

async function fetchCompanyIds() {
  const { data, error } = await supabase
    .from('stock_items')
    .select('company_id', { distinct: true })
    .not('company_id', 'is', null);
  if (error) throw error;
  return (data || []).map((row) => row.company_id).filter(Boolean);
}

async function fetchStockItems(companyId) {
  const rows = [];
  let from = 0;
  let to = PAGE_SIZE - 1;
  while (true) {
    const { data, error } = await supabase
      .from('stock_items')
      .select('id, company_id, sku, asin, created_at')
      .eq('company_id', companyId)
      .range(from, to);
    if (error) throw error;
    if (Array.isArray(data) && data.length) {
      rows.push(...data);
    }
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    to += PAGE_SIZE;
  }
  return rows;
}

function collectDuplicateIds(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFromRow(row);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  });

  const idsToRemove = [];
  groups.forEach((list) => {
    if (list.length <= 1) return;
    const sorted = list.sort((a, b) => pickTimestamp(b) - pickTimestamp(a));
    const [, ...duplicates] = sorted;
    duplicates.forEach((row) => {
      if (row?.id != null) {
        idsToRemove.push(row.id);
      }
    });
  });
  return idsToRemove;
}

async function deleteIds(ids, companyId) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const chunk = ids.slice(i, i + DELETE_CHUNK);
    const { error, count } = await supabase
      .from('stock_items')
      .delete({ count: 'exact' })
      .in('id', chunk);
    if (error) throw error;
    deleted += count || chunk.length;
  }
  console.log(
    `Deleted ${deleted} duplicate stock rows for company ${companyId}.`
  );
}

async function main() {
  const companyIds = await fetchCompanyIds();
  if (!companyIds.length) {
    console.log('No stock items found. Nothing to clean.');
    return;
  }
  let totalDeleted = 0;
  for (const companyId of companyIds) {
    const rows = await fetchStockItems(companyId);
    if (!rows.length) continue;
    const ids = collectDuplicateIds(rows);
    if (!ids.length) continue;
    await deleteIds(ids, companyId);
    totalDeleted += ids.length;
  }
  if (totalDeleted === 0) {
    console.log('No duplicate stock rows detected.');
  } else {
    console.log(`Done. Removed ${totalDeleted} duplicate stock rows in total.`);
  }
}

main().catch((err) => {
  console.error('Fatal error while cleaning stock duplicates', err);
  process.exit(1);
});
