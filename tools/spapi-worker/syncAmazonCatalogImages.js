import 'dotenv/config';
import { createSpClient } from './spapiClient.js';
import { supabase } from './supabaseClient.js';

const MAX_INTEGRATIONS_PER_RUN_RAW = Number(
  process.env.SPAPI_CATALOG_IMAGE_MAX_INTEGRATIONS_PER_RUN ||
    process.env.SPAPI_MAX_INTEGRATIONS_PER_RUN ||
    20
);
const MAX_ITEMS_PER_RUN_RAW = Number(
  process.env.SPAPI_CATALOG_IMAGE_ITEMS_PER_RUN ||
    process.env.SPAPI_ITEMS_PER_RUN ||
    1000
);
const MAX_INTEGRATIONS_PER_RUN =
  Number.isFinite(MAX_INTEGRATIONS_PER_RUN_RAW) && MAX_INTEGRATIONS_PER_RUN_RAW > 0
    ? MAX_INTEGRATIONS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const MAX_ITEMS_PER_RUN =
  Number.isFinite(MAX_ITEMS_PER_RUN_RAW) && MAX_ITEMS_PER_RUN_RAW > 0
    ? MAX_ITEMS_PER_RUN_RAW
    : Number.POSITIVE_INFINITY;
const MARKETPLACE_FILTER = process.env.SPAPI_CATALOG_IMAGE_MARKETPLACE_ID || null;
const ALLOWED_MARKETPLACE_IDS = String(
  process.env.SPAPI_CATALOG_IMAGE_MARKETPLACE_IDS ||
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

function pickFirstCatalogImage(payload) {
  const root = payload?.payload || payload || {};
  const imageSets = Array.isArray(root.images) ? root.images : [];
  for (const set of imageSets) {
    const images = Array.isArray(set?.images) ? set.images : [];
    const preferred = images.find((img) => String(img?.variant || '').toUpperCase() === 'MAIN');
    const first = preferred || images[0];
    const link = first?.link || first?.url || first?.URL || null;
    if (typeof link === 'string' && link.trim().length) {
      return link.trim();
    }
  }
  return null;
}

function pickCatalogTitle(payload) {
  const root = payload?.payload || payload || {};
  const summaries = Array.isArray(root.summaries) ? root.summaries : [];
  for (const summary of summaries) {
    const title = summary?.itemName || summary?.item_name || summary?.displayName || null;
    if (typeof title === 'string' && title.trim().length) {
      return title.trim();
    }
  }
  const attrs = root?.attributes || {};
  const candidates = ['item_name', 'itemName', 'title', 'product_title'];
  for (const key of candidates) {
    const v = attrs?.[key];
    if (Array.isArray(v) && v.length) {
      const first = v[0];
      const title =
        first?.value ||
        first?.displayValue ||
        first?.item_name ||
        first?.itemName ||
        first?.title ||
        null;
      if (typeof title === 'string' && title.trim().length) {
        return title.trim();
      }
    }
    if (typeof v === 'string' && v.trim().length) {
      return v.trim();
    }
  }
  return null;
}

async function getCatalogData(spClient, asin, marketplaceId) {
  const result = await spClient.callAPI({
    operation: 'getCatalogItem',
    endpoint: 'catalogItems',
    path: { asin },
    query: {
      marketplaceIds: [marketplaceId],
      includedData: ['images', 'summaries']
    },
    options: {
      version: '2022-04-01'
    }
  });
  return {
    image: pickFirstCatalogImage(result),
    title: pickCatalogTitle(result)
  };
}

async function fetchMissingRows(companyId, limit) {
  const safeLimit = Number.isFinite(limit) ? limit : 5000;
  const query = supabase
    .from('stock_items')
    .select('id, asin, name')
    .eq('company_id', companyId)
    .or('image_url.is.null,image_url.eq.,name.is.null,name.eq.,name.eq.-')
    .not('asin', 'is', null);
  const { data: baseRows, error } = await query.limit(safeLimit);
  if (error) throw error;

  // Extra pass: include rows where title is placeholder equal to ASIN.
  const { data: candidateRows, error: candidateErr } = await supabase
    .from('stock_items')
    .select('id, asin, name')
    .eq('company_id', companyId)
    .not('asin', 'is', null)
    .not('name', 'is', null)
    .neq('name', '')
    .neq('name', '-')
    .limit(Math.max(2000, safeLimit * 2));
  if (candidateErr) throw candidateErr;

  const rowsById = new Map();
  for (const row of baseRows || []) {
    rowsById.set(row.id, row);
  }
  for (const row of candidateRows || []) {
    const asin = String(row?.asin || '').trim().toUpperCase();
    const name = String(row?.name || '').trim().toUpperCase();
    if (asin && name && asin === name) {
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values()).slice(0, safeLimit);
}

async function upsertAsinAsset(asin, imageUrl) {
  const { error } = await supabase.from('asin_assets').upsert({
    asin,
    image_urls: [imageUrl],
    source: 'amazon_catalog',
    fetched_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function fillStockImages(companyId, asin, imageUrl) {
  const { error } = await supabase
    .from('stock_items')
    .update({ image_url: imageUrl })
    .eq('company_id', companyId)
    .eq('asin', asin)
    .is('image_url', null);
  if (error) throw error;
}

async function fillStockTitles(companyId, asin, title) {
  if (!title || !String(title).trim().length) return;
  const clean = String(title).trim();
  const { error } = await supabase
    .from('stock_items')
    .update({ name: clean })
    .eq('company_id', companyId)
    .eq('asin', asin)
    .or('name.is.null,name.eq.,name.eq.-');
  if (error) throw error;

  // Also replace placeholder titles that are literally the ASIN.
  const { error: asinNameErr } = await supabase
    .from('stock_items')
    .update({ name: clean })
    .eq('company_id', companyId)
    .eq('asin', asin)
    .eq('name', asin);
  if (asinNameErr) throw asinNameErr;
}

async function syncIntegrationImages(integration, runState) {
  const marketplaceIds = resolveMarketplaceIds(integration);
  if (!marketplaceIds.length) {
    console.warn(
      `[Catalog image sync] Skipping integration ${integration.id} because no marketplace is configured.`
    );
    return;
  }

  const remaining = Number.isFinite(MAX_ITEMS_PER_RUN)
    ? Math.max(0, MAX_ITEMS_PER_RUN - runState.processed)
    : Number.POSITIVE_INFINITY;
  if (remaining === 0) return;

  const rows = await fetchMissingRows(integration.company_id, remaining);
  if (!rows.length) {
    console.log(
      `[Catalog image sync] Integration ${integration.id} has no stock_items with missing images.`
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
  const missingTitleAsins = new Set(
    rows
      .filter((r) => {
        const name = typeof r?.name === 'string' ? r.name.trim() : '';
        const asin = typeof r?.asin === 'string' ? r.asin.trim() : '';
        return !name || name === '-' || (asin && name.toUpperCase() === asin.toUpperCase());
      })
      .map((r) => (typeof r?.asin === 'string' ? r.asin.trim().toUpperCase() : ''))
      .filter(isValidAsin)
      .filter(Boolean)
  );

  const spClient = createSpClient({
    refreshToken: integration.refresh_token,
    region: integration.region || process.env.SPAPI_REGION
  });

  console.log(
    `[Catalog image sync] Integration ${integration.id} company=${integration.company_id} marketplaces=${marketplaceIds.join(',')} uniqueAsins=${uniqueAsins.length} validAsins=${validAsins.length} skippedInvalid=${skippedInvalidAsins}`
  );

  let integrationImagesFilled = 0;
  let integrationTitlesFilled = 0;

  for (const asin of validAsins) {
    if (Number.isFinite(MAX_ITEMS_PER_RUN) && runState.processed >= MAX_ITEMS_PER_RUN) break;
    runState.processed += 1;

    try {
      // Reuse cache first
      const { data: cache } = await supabase
        .from('asin_assets')
        .select('image_urls')
        .eq('asin', asin)
        .maybeSingle();
      const cached = Array.isArray(cache?.image_urls)
        ? cache.image_urls.find((u) => typeof u === 'string' && u.trim().length)
        : null;
      if (cached) {
        await fillStockImages(integration.company_id, asin, cached);
        if (!missingTitleAsins.has(asin)) {
          runState.reused += 1;
          continue;
        }
      }

      let foundImage = cached || null;
      let foundTitle = null;
      let hadNonNotFoundError = false;
      for (const marketplaceId of marketplaceIds) {
        try {
          const catalog = await getCatalogData(spClient, asin, marketplaceId);
          if (!foundImage && catalog?.image) {
            foundImage = catalog.image;
          }
          if (!foundTitle && catalog?.title) {
            foundTitle = catalog.title;
          }
          if (foundImage || foundTitle) {
            runState.foundByMarketplace[marketplaceId] =
              (runState.foundByMarketplace[marketplaceId] || 0) + 1;
            break;
          }
        } catch (err) {
          if (isCatalogNotFoundError(err)) {
            // ASIN not available in this marketplace; try next marketplace.
            continue;
          }
          if (isUnauthorizedError(err)) {
            throw err;
          }
          hadNonNotFoundError = true;
          console.warn(
            `[Catalog image sync] Catalog lookup warning integration=${integration.id} asin=${asin} marketplace=${marketplaceId}: ${err?.message || err}`
          );
          continue;
        }
      }

      if (!foundImage && !foundTitle) {
        if (hadNonNotFoundError) {
          runState.failed += 1;
        } else {
          runState.notFound += 1;
        }
        continue;
      }

      if (foundImage && !cached) {
        await upsertAsinAsset(asin, foundImage);
      }
      if (foundImage) {
        await fillStockImages(integration.company_id, asin, foundImage);
        integrationImagesFilled += 1;
      }
      if (foundTitle) {
        await fillStockTitles(integration.company_id, asin, foundTitle);
        integrationTitlesFilled += 1;
      }
      if (cached && !foundTitle) {
        runState.reused += 1;
      } else {
        runState.found += 1;
      }
    } catch (err) {
      if (isUnauthorizedError(err)) {
        console.warn(
          `[Catalog image sync] Unauthorized for integration ${integration.id}; skipping remaining ASINs for this integration.`
        );
        runState.unauthorized += 1;
        break;
      }
      const message = String(err?.message || err || '');
      console.error(
        `[Catalog image sync] Failed integration=${integration.id} company=${integration.company_id} asin=${asin}: ${message}`
      );
      runState.failed += 1;
    }
  }

  runState.imagesFilled += integrationImagesFilled;
  runState.titlesFilled += integrationTitlesFilled;
  console.log(
    `[Catalog image sync] Integration ${integration.id} results: imagesFilled=${integrationImagesFilled} titlesFilled=${integrationTitlesFilled}`
  );
}

async function main() {
  assertBaseEnv();
  const integrations = await fetchActiveIntegrations();
  if (!integrations.length) {
    console.log('[Catalog image sync] No active amazon integrations found.');
    return;
  }

  const runState = {
    processed: 0,
    found: 0,
    reused: 0,
    notFound: 0,
    failed: 0,
    unauthorized: 0,
    foundByMarketplace: {},
    imagesFilled: 0,
    titlesFilled: 0
  };

  for (const integration of integrations) {
    if (Number.isFinite(MAX_ITEMS_PER_RUN) && runState.processed >= MAX_ITEMS_PER_RUN) break;
    await syncIntegrationImages(integration, runState);
  }

  console.log(
    `[Catalog image sync] Done. processed=${runState.processed} found=${runState.found} reused=${runState.reused} notFound=${runState.notFound} failed=${runState.failed} unauthorized=${runState.unauthorized} imagesFilled=${runState.imagesFilled} titlesFilled=${runState.titlesFilled}`
  );
  console.log(
    `[Catalog image sync] Found by marketplace: ${JSON.stringify(runState.foundByMarketplace)}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[Catalog image sync] Fatal error:', err?.response?.data || err);
    process.exitCode = 1;
  });
}
