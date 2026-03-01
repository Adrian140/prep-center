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
const MAX_INTEGRATIONS_PER_RUN =
  Number.isFinite(MAX_INTEGRATIONS_PER_RUN_RAW) && MAX_INTEGRATIONS_PER_RUN_RAW > 0
    ? MAX_INTEGRATIONS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const MAX_ASINS_PER_RUN =
  Number.isFinite(MAX_ASINS_PER_RUN_RAW) && MAX_ASINS_PER_RUN_RAW > 0
    ? MAX_ASINS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const MARKETPLACE_FILTER = process.env.SPAPI_CATALOG_DIM_MARKETPLACE_ID || null;
const ALLOWED_MARKETPLACE_IDS = String(
  process.env.SPAPI_CATALOG_DIM_MARKETPLACE_IDS ||
    'A1PA6795UKMFR9,A13V1IB3VIYZZH,APJ6JRA9NG5V4,A1RKKUPIHCS9HS'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

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

  const { data, error } = await query.order('last_synced_at', { ascending: true });
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

async function getCatalogDimensions(spClient, asin, marketplaceId) {
  const result = await spClient.callAPI({
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    path: { asin },
    query: {
      marketplaceIds: [marketplaceId],
      includedData: ['dimensions', 'summaries']
    },
    options: {
      version: '2022-04-01'
    }
  });
  return pickCatalogDimensions(result);
}

async function fetchRowsMissingDimensions(companyId, limit) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, limit) : 5000;
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, asin, length_cm, width_cm, height_cm, weight_kg')
    .eq('company_id', companyId)
    .not('asin', 'is', null)
    .or(
      'length_cm.is.null,width_cm.is.null,height_cm.is.null,weight_kg.is.null,length_cm.eq.0,width_cm.eq.0,height_cm.eq.0,weight_kg.eq.0'
    )
    .limit(safeLimit);
  if (error) throw error;
  return data || [];
}

async function fetchKnownDimensionsByAsin(companyId, asins) {
  if (!Array.isArray(asins) || !asins.length) return new Map();

  const known = new Map();
  const chunkSize = 500;
  for (let i = 0; i < asins.length; i += chunkSize) {
    const chunk = asins.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('stock_items')
      .select('asin, length_cm, width_cm, height_cm, weight_kg')
      .eq('company_id', companyId)
      .in('asin', chunk);
    if (error) throw error;

    for (const row of data || []) {
      const asin = String(row?.asin || '').trim().toUpperCase();
      if (!asin || known.has(asin)) continue;
      const dims = normalizeDims(row);
      if (scoreDims(dims) > 0) {
        known.set(asin, dims);
      }
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

async function syncIntegrationDimensions(integration, runState) {
  const marketplaceIds = resolveMarketplaceIds(integration);
  if (!marketplaceIds.length) {
    console.warn(
      `[Catalog dimension sync] Skipping integration ${integration.id} because no marketplace is configured.`
    );
    return;
  }

  const remaining = Number.isFinite(MAX_ASINS_PER_RUN)
    ? Math.max(0, MAX_ASINS_PER_RUN - runState.processed)
    : Number.POSITIVE_INFINITY;
  if (remaining === 0) return;

  const rowBudget = Number.isFinite(remaining)
    ? Math.min(Math.max(remaining * 20, 200), 10000)
    : 10000;
  const rows = await fetchRowsMissingDimensions(integration.company_id, rowBudget);
  if (!rows.length) {
    console.log(
      `[Catalog dimension sync] Integration ${integration.id} has no stock_items with missing dimensions.`
    );
    return;
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
      `[Catalog dimension sync] Integration ${integration.id} has no valid ASINs among missing rows.`
    );
    return;
  }

  const knownDimsByAsin = await fetchKnownDimensionsByAsin(integration.company_id, validAsins);

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `[Catalog dimension sync] Integration ${integration.id} company=${integration.company_id} marketplaces=${marketplaceIds.join(',')} uniqueAsins=${uniqueAsins.length} validAsins=${validAsins.length} skippedInvalid=${skippedInvalidAsins}`
  );

  const resolvedByAsin = new Map();

  for (const asin of validAsins) {
    if (Number.isFinite(MAX_ASINS_PER_RUN) && runState.processed >= MAX_ASINS_PER_RUN) break;
    runState.processed += 1;

    try {
      const alreadyKnown = resolvedByAsin.get(asin) || knownDimsByAsin.get(asin) || null;
      if (alreadyKnown) {
        await fillMissingDimensionsForAsin(integration.company_id, asin, alreadyKnown);
        resolvedByAsin.set(asin, alreadyKnown);
        runState.reused += 1;
        continue;
      }

      let foundDims = null;
      let hadNonNotFoundError = false;
      for (const marketplaceId of marketplaceIds) {
        try {
          const candidate = await getCatalogDimensions(spClient, asin, marketplaceId);
          const candidateScore = scoreDims(candidate);
          if (candidateScore > 0) {
            foundDims = candidate;
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

      if (!foundDims) {
        if (hadNonNotFoundError) {
          runState.failed += 1;
        } else {
          runState.notFound += 1;
        }
        continue;
      }

      await fillMissingDimensionsForAsin(integration.company_id, asin, foundDims);
      resolvedByAsin.set(asin, foundDims);
      runState.found += 1;

      const foundScore = scoreDims(foundDims);
      if (foundScore < 4) {
        runState.partial += 1;
      } else {
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
}

async function main() {
  assertBaseEnv();
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('[Catalog dimension sync] No active amazon integrations found.');
    return;
  }

  const runState = {
    processed: 0,
    found: 0,
    reused: 0,
    complete: 0,
    partial: 0,
    notFound: 0,
    failed: 0,
    unauthorized: 0,
    foundByMarketplace: {}
  };

  for (const integration of integrations) {
    if (Number.isFinite(MAX_ASINS_PER_RUN) && runState.processed >= MAX_ASINS_PER_RUN) break;
    await syncIntegrationDimensions(integration, runState);
  }

  console.log(
    `[Catalog dimension sync] Done. processed=${runState.processed} found=${runState.found} reused=${runState.reused} complete=${runState.complete} partial=${runState.partial} notFound=${runState.notFound} failed=${runState.failed} unauthorized=${runState.unauthorized}`
  );
  console.log(
    `[Catalog dimension sync] Found by marketplace: ${JSON.stringify(runState.foundByMarketplace)}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[Catalog dimension sync] Fatal error:', err?.response?.data || err);
    process.exitCode = 1;
  });
}
