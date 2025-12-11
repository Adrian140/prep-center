import 'dotenv/config';

const DEFAULT_DOMAIN = Number(
  process.env.KEEPA_DOMAIN || process.env.VITE_KEEPA_DOMAIN || 4
);
const parseDomainList = (raw, fallback) => {
  if (typeof raw === 'string' && raw.trim().length) {
    const numbers = raw
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (numbers.length) {
      return Array.from(new Set(numbers));
    }
  }
  const defaults = [fallback, 3, 8, 9];
  const unique = [];
  for (const candidate of defaults) {
    if (Number.isFinite(candidate) && candidate > 0 && !unique.includes(candidate)) {
      unique.push(candidate);
    }
  }
  return unique;
};
const KEEPA_DOMAINS = parseDomainList(
  process.env.KEEPA_DOMAINS || process.env.VITE_KEEPA_DOMAINS,
  DEFAULT_DOMAIN
);
const KEEPA_API_KEY =
  process.env.KEEPA_API_KEY || process.env.VITE_KEEPA_API_KEY || null;
const DEFAULT_IMAGE_SIZE = Number(
  process.env.KEEPA_IMAGE_SIZE ||
    process.env.VITE_KEEPA_IMAGE_SIZE ||
    1500
);
const MAIN_IMAGE_ONLY =
  String(
    process.env.KEEPA_MAIN_IMAGE_ONLY ||
      process.env.VITE_KEEPA_MAIN_IMAGE_ONLY ||
      'true'
  )
    .toLowerCase()
    .trim() === 'true';

const TOKENS_PER_MINUTE = Math.max(
  1,
  Number(
    process.env.KEEPA_TOKENS_PER_MINUTE ||
      process.env.VITE_KEEPA_TOKENS_PER_MINUTE ||
      1
  )
);

const TOKEN_SAFETY_REMAINING = Math.max(
  0,
  Number(
    process.env.KEEPA_TOKEN_SAFETY_REMAINING ||
      process.env.VITE_KEEPA_TOKEN_SAFETY_REMAINING ||
      0
  )
);

const MIN_INTERVAL_MS = Math.ceil(60000 / TOKENS_PER_MINUTE);

const imageCache = new Map();
let lastCallAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAsin = (asin) =>
  typeof asin === 'string' ? asin.trim().toUpperCase() : '';

const ensureApiKey = () => {
  if (!KEEPA_API_KEY) {
    throw new Error(
      'Missing Keepa API key. Set KEEPA_API_KEY (or VITE_KEEPA_API_KEY) in your env.'
    );
  }
};

const buildCacheKey = (asin, size, allImages, domain) =>
  `${asin}|${size}|${allImages ? 'all' : 'main'}|${domain}`;

const rateLimit = async () => {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastCallAt = Date.now();
};

const buildImageUrl = (imageId, size) => {
  if (!imageId) return null;
  const id = String(imageId).trim();
  if (!id) return null;

  const sizeIsOriginal = String(size).toLowerCase() === 'original';
  const hasExt = id.toLowerCase().endsWith('.jpg');
  const base = hasExt ? id.slice(0, -4) : id;
  const ext = '.jpg';

  if (sizeIsOriginal) {
    return `https://images-na.ssl-images-amazon.com/images/I/${base}${ext}`;
  }
  return `https://images-na.ssl-images-amazon.com/images/I/${base}._SL${size}_${ext}`;
};

const extractImageIds = (product) => {
  if (!product) return [];
  if (typeof product.imagesCSV === 'string' && product.imagesCSV.trim().length) {
    return product.imagesCSV
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (Array.isArray(product.images) && product.images.length) {
    return product.images
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          return entry.l || entry.m || null;
        }
        return null;
      })
      .filter(Boolean);
  }
  return [];
};

const maybeBackoff = async (response, attempt) => {
  if (response.status !== 429 && response.status !== 503) return false;
  if (attempt > 2) return false;
  const retryAfter =
    Number(response.headers.get('retry-after')) ||
    MIN_INTERVAL_MS + attempt * 500;
  await sleep(retryAfter);
  return true;
};

const fetchImpl = async (url) => {
  const impl =
    globalThis.fetch ||
    (await import('node-fetch').then((mod) => mod.default));
  return impl(url);
};

const fetchProductPayload = async (asin, domain, attempt = 0) => {
  await rateLimit();

  const url = `https://api.keepa.com/product?key=${KEEPA_API_KEY}&domain=${domain}&asin=${asin}`;
  const response = await fetchImpl(url);

  if (await maybeBackoff(response, attempt)) {
    return fetchProductPayload(asin, domain, attempt + 1);
  }

  if (response.status === 400) {
    return { product: null, tokensLeft: null };
  }

  if (!response.ok) {
    throw new Error(`Keepa API error (${response.status})`);
  }

  const payload = await response.json();
  const { tokensLeft } = payload || {};

  if (
    TOKEN_SAFETY_REMAINING > 0 &&
    typeof tokensLeft === 'number' &&
    tokensLeft < TOKEN_SAFETY_REMAINING
  ) {
    throw new Error(
      `Keepa tokens low: ${tokensLeft} remaining (safety floor ${TOKEN_SAFETY_REMAINING})`
    );
  }

  const product = payload?.products?.[0] || null;
  if (!product) {
    return { product: null, tokensLeft };
  }

  return { product, tokensLeft };
};

export const getKeepaImages = async ({
  asin,
  size = DEFAULT_IMAGE_SIZE,
  allImages = !MAIN_IMAGE_ONLY,
  forceRefresh = false
} = {}) => {
  const normalizedAsin = normalizeAsin(asin);
  if (!normalizedAsin) {
    throw new Error('ASIN is required for Keepa lookup.');
  }

  ensureApiKey();

  const domains = KEEPA_DOMAINS.length ? KEEPA_DOMAINS : [DEFAULT_DOMAIN];
  let tokensLeft = null;

  for (const domain of domains) {
    const cacheKey = buildCacheKey(normalizedAsin, size, allImages, domain);
    if (!forceRefresh && imageCache.has(cacheKey)) {
      const cached = imageCache.get(cacheKey);
      if (Array.isArray(cached) && cached.length) {
        return {
          images: cached,
          fromCache: true,
          tokensLeft: null,
          domain
        };
      }
      continue;
    }

    let product = null;
    try {
      const res = await fetchProductPayload(normalizedAsin, domain);
      product = res?.product || null;
      if (res?.tokensLeft != null) {
        tokensLeft = res.tokensLeft;
      }
    } catch (err) {
      const msg = err?.message || err;
      return { images: [], fromCache: false, tokensLeft, error: String(msg || '') };
    }

    if (!product) {
      imageCache.set(cacheKey, []);
      continue;
    }

    const ids = extractImageIds(product);
    if (!ids.length) {
      imageCache.set(cacheKey, []);
      continue;
    }

    const orderedIds = allImages ? ids : [ids[0]];
    const urls = orderedIds
      .map((id) => buildImageUrl(id, size))
      .filter(Boolean);

    if (urls.length) {
      imageCache.set(cacheKey, urls);
      return { images: urls, fromCache: false, tokensLeft, domain };
    }

    imageCache.set(cacheKey, []);
  }

  return { images: [], fromCache: false, tokensLeft };
};

export const getKeepaMainImage = async (options = {}) => {
  const res = await getKeepaImages({ ...options, allImages: false });
  return {
    image: res.images[0] || null,
    tokensLeft: res.tokensLeft,
    fromCache: res.fromCache,
    domain: res.domain,
    error: res.error || null
  };
};
