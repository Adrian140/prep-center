import { supabase } from './supabaseClient.js';

export async function getCompanyNameMap(rows) {
  const ids = Array.from(
    new Set(
      (rows || [])
        .map((r) => r?.company_id)
        .filter(Boolean)
        .map((id) => String(id))
    )
  );
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('companies').select('id, name').in('id', ids);
  if (error) {
    console.warn(`[companies] Failed to fetch company names: ${error.message || error}`);
    return new Map();
  }
  return new Map((data || []).map((c) => [String(c.id), c.name || null]));
}

export function companyLabel(id, nameMap) {
  const key = id != null ? String(id) : '';
  return (nameMap && nameMap.get(key)) || key;
}
