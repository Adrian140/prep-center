import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const MAX_INTEGRATIONS_PER_RUN_RAW = Number(
  process.env.SPAPI_CATALOG_DIM_MAX_INTEGRATIONS_PER_RUN ||
    process.env.SPAPI_MAX_INTEGRATIONS_PER_RUN ||
    20
);
const MAX_ASINS_PER_RUN_RAW = Number(
  process.env.SPAPI_CATALOG_DIM_ASINS_PER_RUN || process.env.SPAPI_ITEMS_PER_RUN || 1000
);
const RUN_TIME_BUDGET_SECONDS_RAW = Number(
  process.env.SPAPI_CATALOG_DIM_MAX_RUNTIME_SECONDS || 18000
); // 5h
const RUN_TIME_BUDGET_BUFFER_SECONDS_RAW = Number(
  process.env.SPAPI_CATALOG_DIM_RUNTIME_BUFFER_SECONDS || 180
); // 3m
const MAX_INTEGRATIONS_PER_RUN =
  Number.isFinite(MAX_INTEGRATIONS_PER_RUN_RAW) && MAX_INTEGRATIONS_PER_RUN_RAW > 0
    ? MAX_INTEGRATIONS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const MAX_ASINS_PER_RUN =
  Number.isFinite(MAX_ASINS_PER_RUN_RAW) && MAX_ASINS_PER_RUN_RAW > 0
    ? MAX_ASINS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const RUN_TIME_BUDGET_MS =
  Number.isFinite(RUN_TIME_BUDGET_SECONDS_RAW) && RUN_TIME_BUDGET_SECONDS_RAW > 0
    ? RUN_TIME_BUDGET_SECONDS_RAW * 1000
    : Number.POSITIVE_INFINITY;
const RUN_TIME_BUDGET_BUFFER_MS =
  Number.isFinite(RUN_TIME_BUDGET_BUFFER_SECONDS_RAW) && RUN_TIME_BUDGET_BUFFER_SECONDS_RAW > 0
    ? RUN_TIME_BUDGET_BUFFER_SECONDS_RAW * 1000
    : 180000;
const MARKETPLACE_FILTER = process.env.SPAPI_CATALOG_DIM_MARKETPLACE_ID || null;
const SYNC_STATE_KEY = process.env.SPAPI_CATALOG_DIM_SYNC_STATE_KEY || 'default';
const SYNC_STATE_APP_SETTINGS_KEY = `catalog_dimensions_sync_state:${SYNC_STATE_KEY}`;
const ALLOWED_MARKETPLACE_IDS = String(
  process.env.SPAPI_CATALOG_DIM_MARKETPLACE_IDS ||
    'A1PA6795UKMFR9,A13V1IB3VIYZZH,APJ6JRA9NG5V4,A1RKKUPIHCS9HS'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

function isRuntimeBudgetReached(runState) {
  if (!runState) return false;
  if (runState.stoppedByBudget) return true;
  if (!Number.isFinite(runState.budgetMs)) return false;

  const elapsed = Date.now() - runState.startedAt;
  const remaining = runState.budgetMs - elapsed;
  if (elapsed >= runState.budgetMs || remaining <= runState.bufferMs) {
    runState.stoppedByBudget = true;
    return true;
  }
  return false;
}

function isMissingRelationError(error, relationName) {
  if (!error) return false;
  if (String(error.code || '').trim() === '42P01') return true;
  const message = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const needle = String(relationName || '').toLowerCase();
  if (!needle) return message.includes('does not exist') || details.includes('does not exist');
  return (
    message.includes(needle) ||
    details.includes(needle) ||
    (message.includes('does not exist') && message.includes('relation'))
  );
}

function defaultSyncState() {
  return {
    key: SYNC_STATE_KEY,
    next_integration_index: 0,
    next_asin_index: 0,
    current_integration_id: null,
    cycle_started_at: null,
    cycle_completed_at: null,
    updated_at: new Date().toISOString()
  };
}

function assertBaseEnv() {
  const missing = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE) missing.push('SUPABASE_SERVICE_ROLE');
  if (!process.env.SPAPI_LWA_CLIENT_ID) missing.push('SPAPI_LWA_CLIENT_ID');
  if (!process.env.SPAPI_LWA_CLIENT_SECRET) missing.push('SPAPI_LWA_CLIENT_SECRET');
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.SPAPI_ROLE_ARN) missing.push('SPAPI_ROLE_ARN');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function singleModeIntegration() {
  if (
    process.env.SUPABASE_STOCK_COMPANY_ID &&
    process.env.SUPABASE_STOCK_USER_ID &&
    process.env.SPAPI_REFRESH_TOKEN
  ) {
    return [
      {
        id: 'single-mode',
        company_id: process.env.SUPABASE_STOCK_COMPANY_ID,
        user_id: process.env.SUPABASE_STOCK_USER_ID,
        marketplace_id: process.env.SPAPI_MARKETPLACE_ID || null,
        marketplace_ids: process.env.SPAPI_MARKETPLACE_ID
          ? [process.env.SPAPI_MARKETPLACE_ID]
          : [],
        region: process.env.SPAPI_REGION || 'eu',
        refresh_token: process.env.SPAPI_REFRESH_TOKEN,
        status: 'active'
      }
    ];
  }
  return null;
}

async function fetchActiveIntegrations() {
  const single = singleModeIntegration();
  if (single) return single;

  let query = supabase
    .from('amazon_integrations')
    .select(
      'id, user_id, company_id, marketplace_id, region, selling_partner_id, refresh_token, status, last_synced_at'
    )
    .eq('status', 'active');

  if (MARKETPLACE_FILTER) {
    query = query.eq('marketplace_id', MARKETPLACE_FILTER);
  }

  const { data, error } = await query.order('id', { ascending: true });
  if (error) throw error;

  const integrations = data || [];
  const sellerIds = integrations
    .map((row) => row.selling_partner_id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  const tokenMap = new Map();
  if (sellerIds.length) {
    const { data: tokens, error: tokensError } = await supabase
      .from('seller_tokens')
      .select('seller_id, refresh_token, marketplace_ids')
      .in('seller_id', sellerIds);
    if (tokensError) throw tokensError;
    (tokens || []).forEach((t) => {
      if (!t?.seller_id) return;
      tokenMap.set(t.seller_id, {
        refresh_token: t.refresh_token,
        marketplace_ids: Array.isArray(t.marketplace_ids)
          ? t.marketplace_ids.filter(Boolean)
          : []
      });
    });
  }

  const sellerMarketplaceMap = new Map();
  integrations.forEach((row) => {
    if (!row?.selling_partner_id) return;
    if (!sellerMarketplaceMap.has(row.selling_partner_id)) {
      sellerMarketplaceMap.set(row.selling_partner_id, new Set());
    }
    if (row.marketplace_id) {
      sellerMarketplaceMap.get(row.selling_partner_id).add(row.marketplace_id);
    }
  });

  const withTokens = integrations
    .map((row) => {
      const token = row.selling_partner_id ? tokenMap.get(row.selling_partner_id) : null;
      const sellerMarkets = row.selling_partner_id
        ? sellerMarketplaceMap.get(row.selling_partner_id)
        : null;
      const mergedSet = new Set((token?.marketplace_ids || []).filter(Boolean));
      if (row.marketplace_id) mergedSet.add(row.marketplace_id);
      if (sellerMarkets?.size) {
        for (const m of sellerMarkets.values()) mergedSet.add(m);
      }
      const refreshToken = row.refresh_token || token?.refresh_token || null;
      if (!refreshToken) return null;
      return {
        ...row,
        refresh_token: refreshToken,
        marketplace_ids: Array.from(mergedSet).filter(Boolean)
      };
    })
    .filter(Boolean);

  if (withTokens.length <= MAX_INTEGRATIONS_PER_RUN) return withTokens;
  return withTokens.slice(0, MAX_INTEGRATIONS_PER_RUN);
}

async function getSyncStateFromAppSettings() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', SYNC_STATE_APP_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;

  if (data?.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
    return {
      ...defaultSyncState(),
      ...data.value,
      key: SYNC_STATE_KEY
    };
  }

  const seed = defaultSyncState();
  const { error: upsertError } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: SYNC_STATE_APP_SETTINGS_KEY,
        value: seed,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    );
  if (upsertError) throw upsertError;
  return seed;
}

async function saveSyncStateToAppSettings(patch) {
  const current = await getSyncStateFromAppSettings();
  const merged = { ...current, ...patch, key: SYNC_STATE_KEY, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: SYNC_STATE_APP_SETTINGS_KEY,
        value: merged,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    );
  if (error) throw error;
}

async function getSyncState() {
  const { data, error } = await supabase
    .from('amazon_catalog_dimensions_sync_state')
    .select('*')
    .eq('key', SYNC_STATE_KEY)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error, 'amazon_catalog_dimensions_sync_state')) {
      console.warn(
        '[Catalog dimension sync] Checkpoint table amazon_catalog_dimensions_sync_state not found; using app_settings fallback state.'
      );
      return await getSyncStateFromAppSettings();
    }
    throw error;
  }
  if (data) return data;

  const { data: inserted, error: insertErr } = await supabase
    .from('amazon_catalog_dimensions_sync_state')
    .insert({ key: SYNC_STATE_KEY, next_integration_index: 0, next_asin_index: 0 })
    .select('*')
    .single();
  if (insertErr) {
    if (isMissingRelationError(insertErr, 'amazon_catalog_dimensions_sync_state')) {
      console.warn(
        '[Catalog dimension sync] Checkpoint table unavailable on insert; using app_settings fallback state.'
      );
      return await getSyncStateFromAppSettings();
    }
    throw insertErr;
  }
  return inserted;
}

async function saveSyncState(patch) {
  const payload = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('amazon_catalog_dimensions_sync_state')
    .update(payload)
    .eq('key', SYNC_STATE_KEY);
  if (error) {
    if (isMissingRelationError(error, 'amazon_catalog_dimensions_sync_state')) {
      await saveSyncStateToAppSettings(payload);
      return;
    }
    throw error;
  }
}

function resolveMarketplaceIds(integration) {
  const allowed = new Set(ALLOWED_MARKETPLACE_IDS);
  const keepAllowed = (list) => list.filter((id) => allowed.has(id));
  if (Array.isArray(integration?.marketplace_ids) && integration.marketplace_ids.length) {
    const list = keepAllowed(integration.marketplace_ids);
    const preferred = integration?.marketplace_id;
    if (preferred && list.includes(preferred)) {
      return [preferred, ...list.filter((id) => id !== preferred)];
    }
    return list;
  }
  if (integration?.marketplace_id) return keepAllowed([integration.marketplace_id]);
  if (process.env.SPAPI_MARKETPLACE_ID) return keepAllowed([process.env.SPAPI_MARKETPLACE_ID]);
  return [];
}

function isValidAsin(value) {
  const v = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(v);
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCentimeters(measurement) {
  if (!measurement || typeof measurement !== 'object') return null;
  const value = toNumber(measurement.value);
  if (!isPositiveNumber(value)) return null;
  const unit = String(measurement.unit || measurement.Unit || '').trim().toUpperCase();
  const ratioByUnit = {
    CENTIMETERS: 1,
    CENTIMETRES: 1,
    CM: 1,
    MILLIMETERS: 0.1,
    MILLIMETRES: 0.1,
    MM: 0.1,
    METERS: 100,
    METRES: 100,
    M: 100,
    INCHES: 2.54,
    INCH: 2.54,
    IN: 2.54,
    FEET: 30.48,
    FOOT: 30.48,
    FT: 30.48,
    DECIMETERS: 10,
    DECIMETRES: 10,
    DM: 10
  };
  const ratio = ratioByUnit[unit] || null;
  if (!ratio) return null;
  return Number((value * ratio).toFixed(2));
}

function toKilograms(measurement) {
  if (!measurement || typeof measurement !== 'object') return null;
  const value = toNumber(measurement.value);
  if (!isPositiveNumber(value)) return null;
  const unit = String(measurement.unit || measurement.Unit || '').trim().toUpperCase();
  const ratioByUnit = {
    KILOGRAMS: 1,
    KILOGRAMMES: 1,
    KG: 1,
    GRAMS: 0.001,
    GRAMMES: 0.001,
    G: 0.001,
    POUNDS: 0.45359237,
    POUND: 0.45359237,
    LBS: 0.45359237,
    LB: 0.45359237,
    OUNCES: 0.0283495231,
    OUNCE: 0.0283495231,
    OZ: 0.0283495231
  };
  const ratio = ratioByUnit[unit] || null;
  if (!ratio) return null;
  return Number((value * ratio).toFixed(4));
}

function normalizeDims(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const dims = {
    length_cm: isPositiveNumber(candidate.length_cm) ? Number(candidate.length_cm) : null,
    width_cm: isPositiveNumber(candidate.width_cm) ? Number(candidate.width_cm) : null,
    height_cm: isPositiveNumber(candidate.height_cm) ? Number(candidate.height_cm) : null,
    weight_kg: isPositiveNumber(candidate.weight_kg) ? Number(candidate.weight_kg) : null
  };
  const score =
    Number(Boolean(dims.length_cm)) +
    Number(Boolean(dims.width_cm)) +
    Number(Boolean(dims.height_cm)) +
    Number(Boolean(dims.weight_kg));
  return score > 0 ? dims : null;
}

function scoreDims(dims) {
  if (!dims) return 0;
  return (
    Number(Boolean(dims.length_cm)) +
    Number(Boolean(dims.width_cm)) +
    Number(Boolean(dims.height_cm)) +
    Number(Boolean(dims.weight_kg))
  );
}

function normalizeEan(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

function scoreEan(ean) {
  const normalized = normalizeEan(ean);
  if (!normalized) return 0;
  if (normalized.length === 13) return 3;
  if (normalized.length === 14) return 2;
  return 1;
}

function pickCatalogEan(payload, preferredMarketplaceId) {
  const root = payload?.payload || payload || {};
  const identifiersByMarketplace = Array.isArray(root.identifiers) ? root.identifiers : [];

  let best = null;
  let bestScore = 0;

  const consider = (raw, type, marketplaceId) => {
    const ean = normalizeEan(raw);
    if (!ean) return;
    const typeNorm = String(type || '').trim().toUpperCase();
    let score = scoreEan(ean);
    if (typeNorm === 'EAN') score += 20;
    else if (typeNorm === 'GTIN') score += 10;
    else if (typeNorm === 'UPC') score += 1;
    if (preferredMarketplaceId && marketplaceId === preferredMarketplaceId) score += 5;
    if (score > bestScore) {
      best = ean;
      bestScore = score;
    }
  };

  for (const marketNode of identifiersByMarketplace) {
    const marketplaceId = String(marketNode?.marketplaceId || '').trim();
    const identifiers = Array.isArray(marketNode?.identifiers) ? marketNode.identifiers : [];
    for (const node of identifiers) {
      consider(node?.identifier, node?.identifierType, marketplaceId);
    }
  }

  return best;
}

function pickFromDimensionNode(node) {
  if (!node || typeof node !== 'object') return null;
  return normalizeDims({
    length_cm: toCentimeters(node.length),
    width_cm: toCentimeters(node.width),
    height_cm: toCentimeters(node.height),
    weight_kg: toKilograms(node.weight)
  });
}

function pickFromSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  return normalizeDims({
    length_cm: toCentimeters(summary.itemDimensions?.length),
    width_cm: toCentimeters(summary.itemDimensions?.width),
    height_cm: toCentimeters(summary.itemDimensions?.height),
    weight_kg: toKilograms(summary.itemWeight)
  });
}

function pickCatalogDimensions(payload) {
  const root = payload?.payload || payload || {};
  const dimensions = Array.isArray(root.dimensions) ? root.dimensions : [];

  let best = null;
  let bestScore = 0;

  for (const entry of dimensions) {
    const packageDims = pickFromDimensionNode(entry?.package);
    const itemDims = pickFromDimensionNode(entry?.item);
    const packageScore = scoreDims(packageDims);
    const itemScore = scoreDims(itemDims);

    // For shipping estimator package dimensions are preferred when available.
    const chosen = packageScore >= itemScore ? packageDims : itemDims;
    const chosenScore = scoreDims(chosen);
    if (chosenScore > bestScore) {
      best = chosen;
      bestScore = chosenScore;
    }
  }

  if (bestScore >= 4) return best;

  const summaries = Array.isArray(root.summaries) ? root.summaries : [];
  for (const summary of summaries) {
    const candidate = pickFromSummary(summary);
    const candidateScore = scoreDims(candidate);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  return best;
}

function isUnauthorizedError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return (
    code.includes('unauthorized') ||
    message.includes('unauthorized') ||
    message.includes('access to requested resource is denied')
  );
}

function isCatalogNotFoundError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  const details = String(err?.details || '').toLowerCase();
  return (
    code.includes('notfound') ||
    message.includes('not found in marketplace') ||
    message.includes('requested item') ||
    details.includes('not found in marketplace')
  );
}

async function getCatalogData(spClient, asin, marketplaceId) {
  const result = await spClient.callAPI({
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    path: { asin },
    query: {
      marketplaceIds: [marketplaceId],
      includedData: ['dimensions', 'summaries', 'identifiers']
    },
    options: {
      version: '2022-04-01'
    }
  });
  return {
    dims: pickCatalogDimensions(result),
    ean: pickCatalogEan(result, marketplaceId)
  };
}

async function fetchRowsMissingCatalogFields(companyId, limit) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, limit) : 5000;
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, asin, length_cm, width_cm, height_cm, weight_kg, ean')
    .eq('company_id', companyId)
    .or(
      'length_cm.is.null,width_cm.is.null,height_cm.is.null,weight_kg.is.null,length_cm.eq.0,width_cm.eq.0,height_cm.eq.0,weight_kg.eq.0,ean.is.null,ean.eq.""'
    )
    .order('asin', { ascending: true })
    .order('id', { ascending: true })
    .limit(safeLimit);
  if (error) throw error;
  return data || [];
}

async function fetchMissingAsinStats(companyId) {
  const { data, error } = await supabase
    .from('stock_items')
    .select('asin')
    .eq('company_id', companyId)
    .or(
      'length_cm.is.null,width_cm.is.null,height_cm.is.null,weight_kg.is.null,length_cm.eq.0,width_cm.eq.0,height_cm.eq.0,weight_kg.eq.0,ean.is.null,ean.eq.""'
    );
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const total = rows.length;
  const withAsin = rows.filter((r) => typeof r.asin === 'string' && r.asin.trim() !== '').length;
  const validAsin = rows.filter((r) => isValidAsin(r.asin)).length;
  const sampleNoAsin = rows
    .filter((r) => !r.asin)
    .slice(0, 5)
    .map((r) => r.asin || null);
  const sampleInvalidAsin = rows
    .filter((r) => r.asin && !isValidAsin(r.asin))
    .slice(0, 5)
    .map((r) => r.asin);
  return { total, withAsin, validAsin, sampleNoAsin, sampleInvalidAsin };
}

function normalizeCatalogSnapshot(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const dims = normalizeDims(candidate);
  const ean = normalizeEan(candidate.ean);
  if (!dims && !ean) return null;
  return { dims, ean };
}

function scoreCatalogSnapshot(snapshot) {
  if (!snapshot) return 0;
  return scoreDims(snapshot.dims) + scoreEan(snapshot.ean);
}

async function fetchKnownCatalogByAsin(companyId, asins) {
  if (!Array.isArray(asins) || !asins.length) return new Map();

  const known = new Map();
  const chunkSize = 500;
  for (let i = 0; i < asins.length; i += chunkSize) {
    const chunk = asins.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('stock_items')
      .select('asin, length_cm, width_cm, height_cm, weight_kg, ean')
      .eq('company_id', companyId)
      .in('asin', chunk);
    if (error) throw error;

    for (const row of data || []) {
      const asin = String(row?.asin || '').trim().toUpperCase();
      if (!asin) continue;
      const candidate = normalizeCatalogSnapshot(row);
      if (!candidate) continue;
      const prev = known.get(asin) || null;
      if (scoreCatalogSnapshot(candidate) > scoreCatalogSnapshot(prev)) known.set(asin, candidate);
    }
  }

  return known;
}

async function updateFieldIfMissing(companyId, asin, field, value) {
  if (!isPositiveNumber(value)) return;
  const miss = `${field}.is.null,${field}.eq.0`;
  const { error } = await supabase
    .from('stock_items')
    .update({ [field]: value })
    .eq('company_id', companyId)
    .eq('asin', asin)
    .or(miss);
  if (error) throw error;
}

async function fillMissingDimensionsForAsin(companyId, asin, dims) {
  if (!dims) return;
  await updateFieldIfMissing(companyId, asin, 'length_cm', dims.length_cm);
  await updateFieldIfMissing(companyId, asin, 'width_cm', dims.width_cm);
  await updateFieldIfMissing(companyId, asin, 'height_cm', dims.height_cm);
  await updateFieldIfMissing(companyId, asin, 'weight_kg', dims.weight_kg);
}

async function updateEanIfMissing(companyId, asin, ean) {
  const normalized = normalizeEan(ean);
  if (!normalized) return;
  const { error } = await supabase
    .from('stock_items')
    .update({ ean: normalized })
    .eq('company_id', companyId)
    .eq('asin', asin)
    .or('ean.is.null,ean.eq.""');
  if (error) throw error;
}

async function fillMissingCatalogForAsin(companyId, asin, snapshot) {
  if (!snapshot) return;
  await fillMissingDimensionsForAsin(companyId, asin, snapshot.dims);
  await updateEanIfMissing(companyId, asin, snapshot.ean);
}

async function syncIntegrationDimensions(integration, runState, startAsinIndex = 0) {
  const marketplaceIds = resolveMarketplaceIds(integration);
  if (!marketplaceIds.length) {
    console.warn(
      `[Catalog dimension sync] Skipping integration ${integration.id} because no marketplace is configured.`
    );
    return { completed: true, nextAsinIndex: 0, totalValidAsins: 0, stoppedByBudget: false };
  }

  const remaining = Number.isFinite(MAX_ASINS_PER_RUN)
    ? Math.max(0, MAX_ASINS_PER_RUN - runState.processed)
    : Number.POSITIVE_INFINITY;
  if (remaining === 0) {
    return {
      completed: false,
      nextAsinIndex: Math.max(0, Number(startAsinIndex) || 0),
      totalValidAsins: 0,
      stoppedByBudget: false
    };
  }

  const rowBudget = Number.isFinite(remaining)
    ? Math.min(Math.max(remaining * 20, 200), 10000)
    : 10000;
  const rows = await fetchRowsMissingCatalogFields(integration.company_id, rowBudget);
  const missingStats = await fetchMissingAsinStats(integration.company_id);
  if (!rows.length) {
    console.log(
      `[Catalog dimension sync] Integration ${integration.id} has no stock_items with missing dimensions/EAN. Stats missing total=${missingStats.total} withAsin=${missingStats.withAsin} validAsin=${missingStats.validAsin} sampleNoAsin=${JSON.stringify(
        missingStats.sampleNoAsin
      )} sampleInvalidAsin=${JSON.stringify(missingStats.sampleInvalidAsin)}`
    );
    return { completed: true, nextAsinIndex: 0, totalValidAsins: 0, stoppedByBudget: false };
  }

  const uniqueAsins = Array.from(
    new Set(
      rows
        .map((r) => (typeof r.asin === 'string' ? r.asin.trim().toUpperCase() : ''))
        .filter(Boolean)
    )
  );
  const validAsins = uniqueAsins.filter(isValidAsin);
  const skippedInvalidAsins = uniqueAsins.length - validAsins.length;
  if (!validAsins.length) {
    console.log(
      `[Catalog dimension sync] Integration ${integration.id} has no valid ASINs among missing rows. Stats missing total=${missingStats.total} withAsin=${missingStats.withAsin} validAsin=${missingStats.validAsin} sampleNoAsin=${JSON.stringify(
        missingStats.sampleNoAsin
      )} sampleInvalidAsin=${JSON.stringify(missingStats.sampleInvalidAsin)}`
    );
    return { completed: true, nextAsinIndex: 0, totalValidAsins: 0, stoppedByBudget: false };
  }

  let normalizedStartAsinIndex = Number.isFinite(Number(startAsinIndex))
    ? Math.max(0, Math.floor(Number(startAsinIndex)))
    : 0;
  if (normalizedStartAsinIndex >= validAsins.length) {
    normalizedStartAsinIndex = 0;
  }

  const knownByAsin = await fetchKnownCatalogByAsin(integration.company_id, validAsins);

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `[Catalog dimension sync] Integration ${integration.id} company=${integration.company_id} marketplaces=${marketplaceIds.join(',')} uniqueAsins=${uniqueAsins.length} validAsins=${validAsins.length} skippedInvalid=${skippedInvalidAsins} resumeAsinIndex=${normalizedStartAsinIndex}`
  );

  const resolvedByAsin = new Map();

  for (let asinIndex = normalizedStartAsinIndex; asinIndex < validAsins.length; asinIndex += 1) {
    if (isRuntimeBudgetReached(runState)) {
      return {
        completed: false,
        nextAsinIndex: asinIndex,
        totalValidAsins: validAsins.length,
        stoppedByBudget: true
      };
    }
    if (Number.isFinite(MAX_ASINS_PER_RUN) && runState.processed >= MAX_ASINS_PER_RUN) {
      return {
        completed: false,
        nextAsinIndex: asinIndex,
        totalValidAsins: validAsins.length,
        stoppedByBudget: false
      };
    }

    const asin = validAsins[asinIndex];
    runState.processed += 1;

    try {
      const alreadyKnown = resolvedByAsin.get(asin) || knownByAsin.get(asin) || null;
      if (alreadyKnown) {
        await fillMissingCatalogForAsin(integration.company_id, asin, alreadyKnown);
        resolvedByAsin.set(asin, alreadyKnown);
        runState.reused += 1;
        if (alreadyKnown.ean) runState.eanReused += 1;
        continue;
      }

      let foundSnapshot = null;
      let hadNonNotFoundError = false;
      for (const marketplaceId of marketplaceIds) {
        try {
          const candidate = await getCatalogData(spClient, asin, marketplaceId);
          const candidateScore = scoreCatalogSnapshot(candidate);
          if (candidateScore > 0) {
            foundSnapshot = candidate;
            runState.foundByMarketplace[marketplaceId] =
              (runState.foundByMarketplace[marketplaceId] || 0) + 1;
            break;
          }
        } catch (err) {
          if (isCatalogNotFoundError(err)) {
            continue;
          }
          if (isUnauthorizedError(err)) {
            throw err;
          }
          hadNonNotFoundError = true;
          console.warn(
            `[Catalog dimension sync] Catalog lookup warning integration=${integration.id} asin=${asin} marketplace=${marketplaceId}: ${err?.message || err}`
          );
          continue;
        }
      }

      if (!foundSnapshot) {
        if (hadNonNotFoundError) {
          runState.failed += 1;
        } else {
          runState.notFound += 1;
        }
        continue;
      }

      await fillMissingCatalogForAsin(integration.company_id, asin, foundSnapshot);
      resolvedByAsin.set(asin, foundSnapshot);
      runState.found += 1;

      const foundScore = scoreDims(foundSnapshot.dims);
      if (foundSnapshot.ean) runState.eanFound += 1;
      if (foundScore > 0 && foundScore < 4) {
        runState.partial += 1;
      } else if (foundScore >= 4) {
        runState.complete += 1;
      }
    } catch (err) {
      if (isUnauthorizedError(err)) {
        console.warn(
          `[Catalog dimension sync] Unauthorized for integration ${integration.id}; skipping remaining ASINs for this integration.`
        );
        runState.unauthorized += 1;
        break;
      }
      const message = String(err?.message || err || '');
      console.error(
        `[Catalog dimension sync] Failed integration=${integration.id} company=${integration.company_id} asin=${asin}: ${message}`
      );
      runState.failed += 1;
    }
  }

  return { completed: true, nextAsinIndex: 0, totalValidAsins: validAsins.length, stoppedByBudget: false };
}

async function main() {
  assertBaseEnv();
  const startedAt = Date.now();
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('[Catalog dimension sync] No active amazon integrations found.');
    return;
  }

  const syncState = await getSyncState();
  let nextIntegrationIndex = Number(syncState?.next_integration_index || 0);
  let nextAsinIndex = Number(syncState?.next_asin_index || 0);
  if (!Number.isFinite(nextIntegrationIndex) || nextIntegrationIndex < 0) nextIntegrationIndex = 0;
  if (!Number.isFinite(nextAsinIndex) || nextAsinIndex < 0) nextAsinIndex = 0;
  if (nextIntegrationIndex >= integrations.length) {
    nextIntegrationIndex = 0;
    nextAsinIndex = 0;
  }
  if (!syncState?.cycle_started_at || (nextIntegrationIndex === 0 && nextAsinIndex === 0)) {
    await saveSyncState({
      cycle_started_at: new Date().toISOString(),
      cycle_completed_at: null,
      current_integration_id: null,
      next_integration_index: nextIntegrationIndex,
      next_asin_index: nextAsinIndex
    });
  }

  const runState = {
    startedAt,
    budgetMs: RUN_TIME_BUDGET_MS,
    bufferMs: RUN_TIME_BUDGET_BUFFER_MS,
    stoppedByBudget: false,
    processed: 0,
    found: 0,
    reused: 0,
    complete: 0,
    partial: 0,
    eanFound: 0,
    eanReused: 0,
    notFound: 0,
    failed: 0,
    unauthorized: 0,
    foundByMarketplace: {}
  };

  console.log(
    `[Catalog dimension sync] Start: integrations=${integrations.length} resumeIntegrationIndex=${nextIntegrationIndex} resumeAsinIndex=${nextAsinIndex} maxIntegrationsPerRun=${Number.isFinite(MAX_INTEGRATIONS_PER_RUN) ? MAX_INTEGRATIONS_PER_RUN : 'inf'} maxAsinsPerRun=${Number.isFinite(MAX_ASINS_PER_RUN) ? MAX_ASINS_PER_RUN : 'inf'} runtimeBudgetSec=${Math.round(RUN_TIME_BUDGET_MS / 1000)} bufferSec=${Math.round(RUN_TIME_BUDGET_BUFFER_MS / 1000)}`
  );

  let stoppedEarly = false;

  for (let integrationIndex = nextIntegrationIndex; integrationIndex < integrations.length; integrationIndex += 1) {
    const integration = integrations[integrationIndex];
    const resumeAsin = integrationIndex === nextIntegrationIndex ? nextAsinIndex : 0;

    if (isRuntimeBudgetReached(runState)) {
      await saveSyncState({
        next_integration_index: integrationIndex,
        next_asin_index: resumeAsin,
        current_integration_id: String(integration?.id || ''),
        cycle_completed_at: null
      });
      stoppedEarly = true;
      console.log(
        `[Catalog dimension sync] Runtime budget reached before integration ${integration.id}. Saved checkpoint integrationIndex=${integrationIndex} asinIndex=${resumeAsin}.`
      );
      break;
    }

    if (Number.isFinite(MAX_ASINS_PER_RUN) && runState.processed >= MAX_ASINS_PER_RUN) {
      await saveSyncState({
        next_integration_index: integrationIndex,
        next_asin_index: resumeAsin,
        current_integration_id: String(integration?.id || ''),
        cycle_completed_at: null
      });
      stoppedEarly = true;
      console.log(
        `[Catalog dimension sync] ASIN per-run limit reached before integration ${integration.id}. Saved checkpoint integrationIndex=${integrationIndex} asinIndex=${resumeAsin}.`
      );
      break;
    }

    const stats = await syncIntegrationDimensions(integration, runState, resumeAsin);
    if (!stats.completed) {
      await saveSyncState({
        next_integration_index: integrationIndex,
        next_asin_index: Math.max(0, Number(stats.nextAsinIndex || 0)),
        current_integration_id: String(integration?.id || ''),
        cycle_completed_at: null
      });
      stoppedEarly = true;
      const reason = stats.stoppedByBudget
        ? 'runtime budget'
        : Number.isFinite(MAX_ASINS_PER_RUN) && runState.processed >= MAX_ASINS_PER_RUN
        ? 'ASIN per-run limit'
        : 'checkpoint';
      console.log(
        `[Catalog dimension sync] Stopped early (${reason}) at integration ${integration.id}. Saved checkpoint integrationIndex=${integrationIndex} asinIndex=${stats.nextAsinIndex}.`
      );
      break;
    }

    await saveSyncState({
      next_integration_index: integrationIndex + 1,
      next_asin_index: 0,
      current_integration_id: null,
      cycle_completed_at: null
    });
  }

  if (!stoppedEarly) {
    await saveSyncState({
      next_integration_index: 0,
      next_asin_index: 0,
      current_integration_id: null,
      cycle_completed_at: new Date().toISOString()
    });
    console.log('[Catalog dimension sync] Cycle complete. Next run will restart from the first integration.');
  }

  console.log(
    `[Catalog dimension sync] Done. processed=${runState.processed} found=${runState.found} reused=${runState.reused} complete=${runState.complete} partial=${runState.partial} eanFound=${runState.eanFound} eanReused=${runState.eanReused} notFound=${runState.notFound} failed=${runState.failed} unauthorized=${runState.unauthorized}`
  );
  console.log(
    `[Catalog dimension sync] Found by marketplace: ${JSON.stringify(runState.foundByMarketplace)}`
  );
  if (stoppedEarly) {
    console.log('CATALOG_DIMENSIONS_CONTINUE=1');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[Catalog dimension sync] Fatal error:', err?.response?.data || err);
    process.exitCode = 1;
  });
}
