// Lightweight Keepa client for fetching product images with a strict 1 token/min cap.
// Requests only the minimal payload and returns the main image at a configurable size.

const KEEPA_DOMAIN = Number(import.meta.env.VITE_KEEPA_DOMAIN || 4);
const KEEPA_API_KEY = import.meta.env.VITE_KEEPA_API_KEY;
const DEFAULT_IMAGE_SIZE = Number(import.meta.env.VITE_KEEPA_IMAGE_SIZE || 1500);
const MAIN_IMAGE_ONLY =
  String(import.meta.env.VITE_KEEPA_MAIN_IMAGE_ONLY || 'true').toLowerCase() === 'true';
const TOKENS_PER_MINUTE = Math.max(1, Number(import.meta.env.VITE_KEEPA_TOKENS_PER_MINUTE || 1));
const TOKEN_SAFETY_REMAINING = Math.max(
  0,
  Number(import.meta.env.VITE_KEEPA_TOKEN_SAFETY_REMAINING || 0)
);
const MIN_INTERVAL_MS = Math.ceil(60000 / TOKENS_PER_MINUTE);

const imageCache = new Map();
let lastCallAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAsin = (asin) =>
  typeof asin === 'string' ? asin.trim().toUpperCase() : '';

const ensureApiKey = () => {
  if (!KEEPA_API_KEY) {
    throw new Error('Missing Keepa API key. Set VITE_KEEPA_API_KEY in your env.');
  }
};

const buildCacheKey = (asin, size, allImages) =>
  `${asin}|${size}|${allImages ? 'all' : 'main'}`;

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
  if (String(size).toLowerCase() === 'original') {
    return `https://images-na.ssl-images-amazon.com/images/I/${imageId}.jpg`;
  }
  return `https://images-na.ssl-images-amazon.com/images/I/${imageId}._SL${size}_.jpg`;
};

const extractImageIds = (product) => {
  if (!product) return [];
  if (Array.isArray(product.images) && product.images.length) {
    return product.images;
  }
  if (typeof product.imagesCSV === 'string' && product.imagesCSV.trim().length) {
    return product.imagesCSV.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return [];
};

const maybeBackoff = async (response, attempt) => {
  if (response.status !== 429 && response.status !== 503) return false;
  if (attempt > 2) return false;
  const retryAfter = Number(response.headers.get('retry-after')) || MIN_INTERVAL_MS + attempt * 500;
  await sleep(retryAfter);
  return true;
};

const fetchProductPayload = async (asin, attempt = 0) => {
  await rateLimit();
  // Minimal payload; some flags (offers=0/history=0/buybox=0) trigger 400 invalidParameter on certain subscriptions.
  const url = `https://api.keepa.com/product?key=${KEEPA_API_KEY}&domain=${KEEPA_DOMAIN}&asin=${asin}`;
  const response = await fetch(url);

  if (await maybeBackoff(response, attempt)) {
    return fetchProductPayload(asin, attempt + 1);
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
    throw new Error(`Keepa tokens low: ${tokensLeft} remaining (safety floor ${TOKEN_SAFETY_REMAINING})`);
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

  const cacheKey = buildCacheKey(normalizedAsin, size, allImages);
  if (!forceRefresh && imageCache.has(cacheKey)) {
    return { images: imageCache.get(cacheKey), fromCache: true, tokensLeft: null };
  }

  const { product, tokensLeft } = await fetchProductPayload(normalizedAsin);

  if (!product) {
    return { images: [], fromCache: false, tokensLeft };
  }

  const ids = extractImageIds(product);
  if (!ids.length) {
    return { images: [], fromCache: false, tokensLeft };
  }

  const orderedIds = allImages ? ids : [ids[0]];
  const urls = orderedIds
    .map((id) => buildImageUrl(id, size))
    .filter(Boolean);

  imageCache.set(cacheKey, urls);

  return { images: urls, fromCache: false, tokensLeft };
};

export const getKeepaMainImage = async (options = {}) => {
  const res = await getKeepaImages({ ...options, allImages: false });
  return { image: res.images[0] || null, tokensLeft: res.tokensLeft, fromCache: res.fromCache };
};
