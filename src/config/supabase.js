// FILE: src/config/supabase.js
import { createClient } from '@supabase/supabase-js';
import { tabSessionStorage } from '../utils/tabStorage';
import { getTabId } from '../utils/tabIdentity';
import { encodeRemainingAction, resolveFbaIntent } from '../utils/receivingFba';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be defined in .env file');
}

const tabId = typeof window === 'undefined' ? 'tab' : getTabId();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: tabSessionStorage,
    storageKey: `sb-${tabId}`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    multiTab: false
  }
});

const SITE_URL = import.meta.env.PROD
  ? 'https://prep-center.eu'
  : window.location.origin;

const PHOTO_SUBSCRIPTION_SERVICE = 'Photo storage subscription';
const PHOTO_MANUAL_SERVICE = 'Manual photo capture';
const PHOTO_SUBSCRIPTION_PRICE = 3;
const PHOTO_MANUAL_PRICE = 1;

const pad2 = (value) => String(value).padStart(2, '0');
const formatSqlDate = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

let supportsReceivingFbaMode = true;
let supportsReceivingItemFbaColumns = true;
let supportsReceivingShipmentArrays = true;
let receivingSupportPromise = null;

const isMissingColumnError = (error, column) => {
  if (!error) return false;
  const needle = column.toLowerCase();
  const parts = [
    String(error.message || ''),
    String(error.details || ''),
    String(error.hint || '')
  ].map((part) => part.toLowerCase());
  return parts.some((part) => part.includes(needle));
};

const receivingItemColumnMissing = (error) =>
  ['send_to_fba', 'fba_qty', 'stock_item_id'].some((col) =>
    isMissingColumnError(error, col)
  );

const receivingShipmentArrayColumnMissing = (error) =>
  ['tracking_ids', 'fba_shipment_ids'].some((col) => isMissingColumnError(error, col));

const normalizeCode = (value) => {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const normalizeAsin = (value) => {
  const trimmed = normalizeCode(value);
  return trimmed ? trimmed.toUpperCase() : null;
};
const normalizeSku = (value) => normalizeCode(value);
const isLikelyAsin = (value) => {
  if (!value) return false;
  return /^[A-Z0-9]{10}$/.test(String(value).toUpperCase());
};
const isDuplicateKeyError = (error) => {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  return (
    error.code === '23505' ||
    message.includes('duplicate key') ||
    details.includes('duplicate key')
  );
};

const ensureStockItemForReceiving = async (item, processedBy) => {
  if (item.stock_item_id) {
    const { data } = await supabase
      .from('stock_items')
      .select('*')
      .eq('id', item.stock_item_id)
      .maybeSingle();
    if (data) return data;
  }

  const rawEanAsin = normalizeCode(item.ean_asin);
  const eanLooksLikeAsin = isLikelyAsin(rawEanAsin);
  let normalizedAsin = normalizeAsin(item.asin);
  if (!normalizedAsin && eanLooksLikeAsin) {
    normalizedAsin = String(rawEanAsin).toUpperCase();
  }
  const normalizedEan = eanLooksLikeAsin ? null : rawEanAsin;
  if (normalizedEan) {
    const { data } = await supabase
      .from('stock_items')
      .select('*')
      .eq('company_id', item.company_id)
      .eq('ean', normalizedEan)
      .maybeSingle();
    if (data) return data;
  }

  if (normalizedAsin) {
    const { data } = await supabase
      .from('stock_items')
      .select('*')
      .eq('company_id', item.company_id)
      .ilike('asin', normalizedAsin)
      .maybeSingle();
    if (data) return data;
  }

  const normalizedSku = normalizeSku(item.sku);
  if (normalizedSku) {
    const { data } = await supabase
      .from('stock_items')
      .select('*')
      .eq('company_id', item.company_id)
      .ilike('sku', normalizedSku)
      .maybeSingle();
    if (data) return data;
  }

  if (!normalizedAsin && !normalizedSku && !normalizedEan) {
    throw new Error('Missing product identifiers (asin/sku/ean) for stock item.');
  }

  const insertPayload = {
    company_id: item.company_id,
    user_id: processedBy || null,
    ean: normalizedEan,
    name: item.product_name,
    asin: normalizedAsin,
    sku: normalizedSku,
    qty: 0,
    purchase_price: item.purchase_price
  };

  const { data: created, error } = await supabase
    .from('stock_items')
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    if (isDuplicateKeyError(error)) {
      if (normalizedEan) {
        const { data } = await supabase
          .from('stock_items')
          .select('*')
          .eq('company_id', item.company_id)
          .eq('ean', normalizedEan)
          .maybeSingle();
        if (data) return data;
      }
      if (normalizedAsin) {
        const { data } = await supabase
          .from('stock_items')
          .select('*')
          .eq('company_id', item.company_id)
          .ilike('asin', normalizedAsin)
          .maybeSingle();
        if (data) return data;
      }
      if (normalizedSku) {
        const { data } = await supabase
          .from('stock_items')
          .select('*')
          .eq('company_id', item.company_id)
          .ilike('sku', normalizedSku)
          .maybeSingle();
        if (data) return data;
      }
    }
    throw error;
  }
  return created;
};

const adjustStockForReceivingDelta = async (item, delta, processedBy) => {
  if (!delta) return { error: null };
  const stockRow = await ensureStockItemForReceiving(item, processedBy);
  if (!stockRow) return { error: new Error('Unable to resolve stock item') };
  const currentQty = Number(stockRow.qty || 0);
  const nextQty = Math.max(0, currentQty + delta);
  const { error: stockError } = await supabase
    .from('stock_items')
    .update({ qty: nextQty })
    .eq('id', stockRow.id);
  if (stockError) return { error: stockError };

  const note = delta >= 0 ? 'Auto sync from receiving' : 'Auto sync correction';
  const { error: logError } = await supabase
    .from('receiving_to_stock_log')
    .insert({
      receiving_item_id: item.id,
      stock_item_id: stockRow.id,
      quantity_moved: Math.abs(delta),
      moved_by: processedBy,
      notes: note
    });
  if (logError) return { error: logError };

  return { error: null, stock_item_id: stockRow.id };
};

const isRelationMissingError = (error, relation) => {
  if (!error || !relation) return false;
  const rel = relation.toLowerCase();
  return [error.message, error.details, error.hint]
    .map((part) => String(part || '').toLowerCase())
    .some((part) => part.includes('does not exist') && part.includes(rel));
};

const RECEIVING_TERMINAL_STATUSES = new Set(['processed', 'cancelled']);

async function syncReceivingShipmentStatus(shipmentId, receivedBy) {
  const [{ data: items, error: itemsError }, { data: shipment, error: shipmentError }] =
    await Promise.all([
      supabase
        .from('receiving_items')
        .select('is_received')
        .eq('shipment_id', shipmentId),
      supabase
        .from('receiving_shipments')
        .select('status, received_by')
        .eq('id', shipmentId)
        .single()
    ]);

  if (itemsError) return { error: itemsError };
  if (shipmentError) return { error: shipmentError };

  const currentStatus = shipment?.status || 'submitted';
  if (RECEIVING_TERMINAL_STATUSES.has(currentStatus)) {
    return { error: null };
  }

  const allReceived = items.length > 0 && items.every((it) => it.is_received);
  const someReceived = items.some((it) => it.is_received);

  let nextStatus = currentStatus;
  if (allReceived) {
    nextStatus = 'processed';
  } else if (someReceived) {
    nextStatus = 'partial';
  } else if (currentStatus === 'partial' || currentStatus === 'received') {
    nextStatus = 'submitted';
  }

  const patch = {};
  if (nextStatus !== currentStatus) {
    patch.status = nextStatus;
  }
  if (nextStatus === 'processed') {
    const nowIso = new Date().toISOString();
    const handler = receivedBy || shipment?.received_by || shipment?.processed_by || null;
    if (!shipment?.received_at) {
      patch.received_at = nowIso;
    }
    patch.received_by = handler;
    patch.processed_by = handler;
    patch.processed_at = nowIso;
  }

  if (Object.keys(patch).length === 0) return { error: null };

  const { error: updateError } = await supabase
    .from('receiving_shipments')
    .update(patch)
    .eq('id', shipmentId);
  return { error: updateError || null };
}

async function markItemsAsReceived(shipmentId, itemIds, receivedBy) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { error: null };
  }
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from('receiving_items')
    .update({
      is_received: true,
      received_at: timestamp,
      received_by: receivedBy || null
    })
    .in('id', itemIds)
    .eq('shipment_id', shipmentId);
  if (error) return { error };
  return await syncReceivingShipmentStatus(shipmentId, receivedBy);
}

async function markShipmentFullyReceived(shipmentId, receivedBy) {
  const { data: itemRows, error } = await supabase
    .from('receiving_items')
    .select('id')
    .eq('shipment_id', shipmentId);
  if (error) return { error };
  const ids = (itemRows || []).map((row) => row.id);
  if (ids.length === 0) {
    const handler = receivedBy || null;
    const patch = {
      status: 'processed',
      received_at: new Date().toISOString(),
      received_by: handler,
      processed_at: new Date().toISOString(),
      processed_by: handler
    };
    const { error: updateError } = await supabase
      .from('receiving_shipments')
      .update(patch)
      .eq('id', shipmentId);
    return { error: updateError || null };
  }
  return await markItemsAsReceived(shipmentId, ids, receivedBy);
}

const sanitizeShipmentPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  let changed = false;
  const clone = { ...payload };
  if (!supportsReceivingFbaMode && Object.prototype.hasOwnProperty.call(clone, 'fba_mode')) {
    delete clone.fba_mode;
    changed = true;
  }
  if (!supportsReceivingShipmentArrays) {
    ['tracking_ids', 'fba_shipment_ids'].forEach((col) => {
      if (Object.prototype.hasOwnProperty.call(clone, col)) {
        delete clone[col];
        changed = true;
      }
    });
  }
  return changed ? clone : payload;
};

const sanitizeItemPayload = (payload) => {
  if (supportsReceivingItemFbaColumns || !payload || typeof payload !== 'object') {
    return payload;
  }
  const clone = { ...payload };
  delete clone.stock_item_id;
  delete clone.send_to_fba;
  delete clone.fba_qty;
  delete clone.received_units;
  return clone;
};

export const ensureReceivingColumnSupport = async () => {
  // Always re-enable support before each request; if columns are truly missing,
  // the subsequent insert/update will throw and we'll disable again.
  supportsReceivingFbaMode = true;
  supportsReceivingItemFbaColumns = true;
  supportsReceivingShipmentArrays = true;
  receivingSupportPromise = null;
  return null;
};

export const canUseReceivingFbaMode = () => supportsReceivingFbaMode;
export const canUseReceivingItemFbaColumns = () => supportsReceivingItemFbaColumns;
export const canUseReceivingShipmentArrays = () => supportsReceivingShipmentArrays;
export const disableReceivingFbaModeSupport = () => {
  supportsReceivingFbaMode = false;
  receivingSupportPromise = null;
};
export const disableReceivingItemFbaSupport = () => {
  supportsReceivingItemFbaColumns = false;
  receivingSupportPromise = null;
};
export const disableReceivingShipmentArraySupport = () => {
  supportsReceivingShipmentArrays = false;
  receivingSupportPromise = null;
};

const currentMonthWindow = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start: formatSqlDate(start), next: formatSqlDate(next) };
};

const fetchCompanyStockIds = async (companyId) => {
  if (!companyId) return [];
  const { data, error } = await supabase
    .from('stock_items')
    .select('id')
    .eq('company_id', companyId);
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => row.id);
};

const countCompanyProductPhotos = async (companyId) => {
  if (!companyId) return 0;
  const ids = await fetchCompanyStockIds(companyId);
  if (!ids.length) return 0;
  const { count, error } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .in('stock_item_id', ids);
  if (error) return 0;
  return count || 0;
};

const ensurePhotoSubscriptionLine = async (companyId) => {
  if (!companyId) return;
  const { start, next } = currentMonthWindow(new Date());
  const { data, error } = await supabase
    .from('other_lines')
    .select('id')
    .eq('company_id', companyId)
    .eq('service', PHOTO_SUBSCRIPTION_SERVICE)
    .gte('service_date', start)
    .lt('service_date', next)
    .limit(1);
  if (error) return;
  if (data && data.length) return;
  await supabase.from('other_lines').insert({
    company_id: companyId,
    service: PHOTO_SUBSCRIPTION_SERVICE,
    service_date: formatSqlDate(new Date()),
    unit_price: PHOTO_SUBSCRIPTION_PRICE,
    units: 1,
    total: PHOTO_SUBSCRIPTION_PRICE,
    obs_admin: 'Auto photo subscription'
  });
};

const removePhotoSubscriptionLine = async (companyId) => {
  if (!companyId) return;
  const { start, next } = currentMonthWindow(new Date());
  await supabase
    .from('other_lines')
    .delete()
    .eq('company_id', companyId)
    .eq('service', PHOTO_SUBSCRIPTION_SERVICE)
    .gte('service_date', start)
    .lt('service_date', next);
};

const insertManualPhotoCharge = async ({ companyId, uploads = 1, stockItemName, stockItemAsin }) => {
  if (!companyId || uploads <= 0) return;
  await supabase.from('other_lines').insert({
    company_id: companyId,
    service: PHOTO_MANUAL_SERVICE,
    service_date: formatSqlDate(new Date()),
    unit_price: PHOTO_MANUAL_PRICE,
    units: uploads,
    total: PHOTO_MANUAL_PRICE * uploads,
    obs_admin: stockItemName
      ? `Produs: ${stockItemName}${stockItemAsin ? ` · ASIN: ${stockItemAsin}` : ''}`
      : stockItemAsin
        ? `ASIN: ${stockItemAsin}`
        : null
  });
};

const handlePhotoUploadBilling = async ({
  companyId,
  uploadedByAdmin,
  uploadedCount = 0,
  stockItemName,
  stockItemAsin
}) => {
  if (!companyId) return;
  await ensurePhotoSubscriptionLine(companyId);
  if (uploadedByAdmin && uploadedCount > 0) {
    await insertManualPhotoCharge({
      companyId,
      uploads: 1,
      stockItemName,
      stockItemAsin
    });
  }
};

const syncPhotoSubscription = async (companyId) => {
  if (!companyId) return;
  const totalPhotos = await countCompanyProductPhotos(companyId);
  if (totalPhotos > 0) {
    await ensurePhotoSubscriptionLine(companyId);
  } else {
    await removePhotoSubscriptionLine(companyId);
  }
};

// ---- User Guides helpers (upload + signed URL) ----
async function uploadUserGuideVideo(section, file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const name = `${section}-${Date.now()}.${ext}`;
  const path = `${section}/${name}`;

  const { error: upErr } = await supabase.storage
    .from('user-guides')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'video/mp4'
    });
  if (upErr) return { data: null, error: upErr };

  const { data, error } = await supabase
    .from('user_guides')
    .upsert(
      { section, video_path: path, source_type: 'upload' },
      { onConflict: 'section' }
    )
    .select()
    .single();

  return { data, error };
}

async function getUserGuideSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from('user-guides')
    .createSignedUrl(path, expiresIn);
  if (error) return { data: null, error };
  return { data: { signedUrl: data.signedUrl }, error: null };
}

export const supabaseHelpers = {
  adjustInventoryForReceiving: async (item, delta, processedBy) =>
    adjustStockForReceivingDelta(item, delta, processedBy),
  uploadUserGuideVideo,
  getUserGuideSignedUrl,

  async getUserGuides() {
    return await supabase.from('user_guides').select('*').order('section');
  },

  async getUserGuideBySection(section) {
    const { data, error } = await supabase
      .from('user_guides')
       .select('section, video_url, video_path, source_type')
      .eq('section', section)
      .maybeSingle()
    // dacă nu există, nu trata ca eroare
    if (error && error.code !== 'PGRST116') return { data: null, error };
    return { data: data || null, error: null };
  },

  async upsertUserGuide({ section, video_url }) {
    return await supabase.from('user_guides').upsert(
      { section, video_url },
      { onConflict: 'section' }
    );
  },
  async deleteUserGuide(section) {
    return await supabase.from('user_guides').delete().eq('section', section);
  },
  async getIntegrationPageContent(lang = 'ro') {
    const { data, error } = await supabase
      .from('integration_page_content')
      .select('*')
      .eq('lang', lang)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') return { data: null, error };
    return { data: data || null, error: null };
  },
  async upsertIntegrationPageContent(lang, content = {}) {
    if (!lang) return { data: null, error: new Error('lang is required') };
    return await supabase
      .from('integration_page_content')
      .upsert(
        { lang, ...content, updated_at: new Date().toISOString() },
        { onConflict: 'lang' }
      );
  },
  async getIntegrationMedia(lang = 'ro') {
    const { data, error } = await supabase
      .from('integration_media')
      .select('card_key, image_url')
      .eq('lang', lang);
    if (error) return { data: null, error };
    const cache = new Map();
    const signed = await Promise.all(
      (data || []).map(async (row) => {
        const url = row.image_url || '';
        if (!url) return row;
        if (/^https?:\/\//i.test(url)) return row;
        if (cache.has(url)) return { ...row, image_url: cache.get(url) };
        const { data: signedUrl } = await supabase
          .storage
          .from('integration-media')
          .createSignedUrl(url, 60 * 60 * 24 * 7);
        const href = signedUrl?.signedUrl || url;
        cache.set(url, href);
        return { ...row, image_url: href };
      })
    );
    return { data: signed, error: null };
  },
  async upsertIntegrationMedia({ lang, card_key, image_url }) {
    if (!lang || !card_key) {
      return { data: null, error: new Error('lang și card_key sunt obligatorii') };
    }
    if (!image_url) {
      return await supabase
        .from('integration_media')
        .delete()
        .eq('lang', lang)
        .eq('card_key', card_key);
    }
    return await supabase
      .from('integration_media')
      .upsert(
        { lang, card_key, image_url, updated_at: new Date().toISOString() },
        { onConflict: 'lang,card_key' }
      );
  },
  async uploadIntegrationMediaFile({ lang, card_key, file }) {
    if (!lang || !card_key || !file) {
      return { data: null, error: new Error('lang, card_key și fișierul sunt obligatorii') };
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const basePath = `${lang}/${card_key}`;
    // curăță fișierele vechi din folder
    const { data: existing } = await supabase.storage.from('integration-media').list(basePath);
    if (existing && existing.length) {
      const pathsToRemove = existing.map((f) => `${basePath}/${f.name}`);
      await supabase.storage.from('integration-media').remove(pathsToRemove);
    }
    const path = `${basePath}/image.${ext}`;
    const { error: upErr } = await supabase
      .storage
      .from('integration-media')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true
      });
    if (upErr) return { data: null, error: upErr };

    const { data: signed } = await supabase
      .storage
      .from('integration-media')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    const signedUrl = signed?.signedUrl || null;

    await supabase
      .from('integration_media')
      .upsert(
        { lang, card_key, image_url: path, updated_at: new Date().toISOString() },
        { onConflict: 'lang,card_key' }
      );

    return { data: { signedUrl, path }, error: null };
  },
  
  signUp: async (email, password, userData) => {
    const redirectTo = `${SITE_URL}/auth/callback?next=/admin-login`;
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
        emailRedirectTo: redirectTo,
      },
    });
  },

  // ===== Company Deals =====
  listCompanyDeals: async (companyId) => {
    return await supabase
      .from('company_deals')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('created_at', { ascending: false });
  },

  createCompanyDeal: async ({ company_id, title, amount, currency = 'EUR' }) => {
    return await supabase
      .from('company_deals')
      .insert({ company_id, title, amount, currency, active: true })
      .select()
      .single();
  },

  deleteCompanyDeal: async (dealId) => {
    // soft delete (active=false) ca să nu pierzi istoric
    return await supabase
      .from('company_deals')
      .update({ active: false })
      .eq('id', dealId);
  },

  resendConfirmation: async (email) => {
    const redirectTo = `${SITE_URL}/auth/callback?next=/admin-login`;
    return await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });
  },
  signIn: async (email, password) => {
    return await supabase.auth.signInWithPassword({ email, password });
  },

  signOut: async () => {
    return await supabase.auth.signOut();
  },

resetPassword: async (email) => {
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/reset-password`,
  });
},


  getProfile: async (userId) => {
    return await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
  },

  updateProfile: async (userId, updates) => {
    return await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select();
  },

  // ===== Content Management =====
  getContent: async () => {
    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();
    return { data, error };
  },

  updateContent: async (contentData) => {
    return await supabase
      .from('content')
      .update(contentData)
      .eq('id', '00000000-0000-0000-0000-000000000001');
  },


  // ===== Pricing =====
  getPricing: async () => {
    const { data, error } = await supabase
      .from('pricing')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();
    return { data, error };
  },

  updatePricing: async (pricingData) => {
    return await supabase
      .from('pricing')
      .update(pricingData)
      .eq('id', '00000000-0000-0000-0000-000000000001');
  },

  // ===== Pricing services v2 =====
  getPricingServices: async () => {
    return await supabase
      .from('pricing_services')
      .select('*')
      .order('category', { ascending: true })
      .order('position', { ascending: true });
  },

  upsertPricingServices: async (rows) => {
    return await supabase
      .from('pricing_services')
      .upsert(rows, { onConflict: 'id' })
      .select();
  },

  deletePricingServices: async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return { data: null, error: null };
    return await supabase
      .from('pricing_services')
      .delete()
      .in('id', ids);
  },

  getFbmShippingRates: async () => {
    return await supabase
      .from('fbm_shipping_rates')
      .select('*')
      .order('category')
      .order('region')
      .order('position');
  },

  upsertFbmShippingRates: async (rows) => {
    return await supabase
      .from('fbm_shipping_rates')
      .upsert(rows, { onConflict: 'id' })
      .select();
  },

  deleteFbmShippingRates: async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return { data: null, error: null };
    return await supabase
      .from('fbm_shipping_rates')
      .delete()
      .in('id', ids);
  },

  // ===== Services =====
  getServices: async () => {
    return await supabase
      .from('services')
      .select('*')
      .eq('active', true)
      .order('title');
  },

  createService: async (serviceData) => {
    return await supabase
      .from('services')
      .insert(serviceData);
  },

  updateService: async (serviceId, serviceData) => {
    return await supabase
      .from('services')
      .update(serviceData)
      .eq('id', serviceId);
  },

  deleteService: async (serviceId) => {
    return await supabase
      .from('services')
      .delete()
      .eq('id', serviceId);
  },

  // ===== Reviews =====
  getReviews: async () => {
    return await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });
  },

  createReview: async (reviewData) => {
    return await supabase
      .from('reviews')
      .insert(reviewData);
  },

  getUserReviewByName: async (reviewerName) => {
    if (!reviewerName) return { data: null, error: null };
    return await supabase
      .from('reviews')
      .select('id, created_at')
      .eq('reviewer_name', reviewerName)
      .maybeSingle();
  },

  getFirstReceptionDate: async (userId) => {
    if (!userId) return { data: null, error: null };
    const { data, error } = await supabase
      .from('receiving_shipments')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return { data: data?.created_at || null, error };
  },

  deleteReview: async (reviewId) => {
    return await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId);
  },

  // ===== Billing Profiles =====
  getBillingProfiles: async (userId) => {
    return await supabase
      .from('billing_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
  },

  createBillingProfile: async (profileData) => {
    return await supabase
      .from('billing_profiles')
      .insert(profileData);
  },

  updateBillingProfile: async (profileId, updates) => {
    return await supabase
      .from('billing_profiles')
      .update(updates)
      .eq('id', profileId);
  },

  deleteBillingProfile: async (profileId) => {
    return await supabase
      .from('billing_profiles')
      .delete()
      .eq('id', profileId);
  },
  seedBillingProfilesFromSignup: async (userId) => {
    if (!userId) return { error: new Error('Missing user id') };
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('first_name,last_name,account_type,company_name,cui,vat_number,company_address,company_city,company_postal_code,phone,country')
      .eq('id', userId)
      .single();
    if (error || !profile) {
      return { error };
    }

    const entries = [];
    const baseAddress = {
      country: profile.country || 'FR',
      address: profile.company_address || null,
      city: profile.company_city || null,
      postal_code: profile.company_postal_code || null,
      phone: profile.phone || null
    };

    const hasCompanyData =
      profile.company_name ||
      profile.cui ||
      profile.vat_number ||
      baseAddress.address ||
      baseAddress.city ||
      baseAddress.postal_code;

    if (hasCompanyData) {
      entries.push({
        user_id: userId,
        type: 'company',
        company_name: profile.company_name || null,
        vat_number: profile.vat_number || null,
        cui: profile.cui || null,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        ...baseAddress,
        is_default: true
      });
    }

    if (profile.first_name || profile.last_name) {
      entries.push({
        user_id: userId,
        type: 'individual',
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        ...baseAddress,
        is_default: entries.length === 0
      });
    }

    if (!entries.length) {
      return { data: [], error: null };
    }

    const { error: insertError } = await supabase
      .from('billing_profiles')
      .insert(entries);
    return { error: insertError || null };
  },

  // ===== Invoices =====
  getInvoices: async (userId) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!profile?.company_id) return { data: [], error: null };

    return await supabase
      .from('invoices')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('issue_date', { ascending: false });
  },

  uploadInvoice: async (file, userId, invoiceData) => {
    try {
      let filePath = null;
      
      if (file) {
        const fileExt = file.name.split('.').pop();
       const safeNumber = String(invoiceData.invoice_number || '')
         .normalize('NFKD')
         .replace(/[\u0300-\u036f]/g, '')   
         .replace(/[^A-Za-z0-9-_]/g, '_')     
         .slice(0, 100);
       const fileName = `${safeNumber}-${Date.now()}.${fileExt}`;
       filePath = `${userId}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
         .from('invoices')
         .upload(filePath, file, {
           contentType: 'application/pdf',
           upsert: true,
           cacheControl: '3600'
         });

        
        if (uploadError) throw uploadError;
      }

     const { data, error } = await supabase
       .from('invoices')
       .insert({ ...invoiceData, file_path: filePath })
       .select()
       .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  updateInvoice: async (invoiceId, updates) => {
    return await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId);
  },

  deleteInvoice: async (invoice) => {
    try {
      if (invoice.file_path) {
        await supabase.storage
          .from('invoices')
          .remove([invoice.file_path]);
      }
      
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoice.id);
      
      return { error };
    } catch (error) {
      return { error };
    }
  },

  createBillingInvoice: async ({
    company_id,
    user_id,
    invoice_number,
    invoice_date,
    total_amount = 0,
    lines = []
  } = {}) => {
    if (!company_id) {
      return { data: null, error: new Error('Missing company_id') };
    }
    if (!invoice_number || !String(invoice_number).trim()) {
      return { data: null, error: new Error('Invoice number is required') };
    }
    if (!invoice_date) {
      return { data: null, error: new Error('Invoice date is required') };
    }
    const payload = {
      company_id,
      user_id: user_id || null,
      invoice_number: String(invoice_number).trim(),
      invoice_date,
      total_amount: Number(total_amount) || 0
    };
    const { data: invoice, error: insertError } = await supabase
      .from('billing_invoices')
      .insert([payload])
      .select('*')
      .single();
    if (insertError) {
      return { data: null, error: insertError };
    }

    const buckets = lines.reduce((acc, entry) => {
      const key = String(entry.section || 'fba').toLowerCase();
      const id = entry.id;
      if (!id) return acc;
      if (!acc[key]) acc[key] = new Set();
      acc[key].add(id);
      return acc;
    }, {});

    const updates = Object.entries(buckets)
      .map(([section, ids]) => {
        const table =
          section === 'fbm'
            ? 'fbm_lines'
            : section === 'other'
              ? 'other_lines'
              : 'fba_lines';
        if (!ids.size) return null;
        return supabase
          .from(table)
          .update({ billing_invoice_id: invoice.id })
          .in('id', Array.from(ids));
      })
      .filter(Boolean);

    const results = await Promise.all(updates);
    const updateError = results.find((result) => result && result.error);
    return {
      data: invoice,
      error: updateError ? updateError.error : null
    };
  },

  downloadInvoice: async (filePath) => {
    const { data, error } = await supabase.storage
      .from('invoices')
      .download(filePath);
    return { data, error };
  },

  getInvoiceSignedUrl: async (filePath, expiresIn = 60) => {
    return await supabase.storage
      .from('invoices')
      .createSignedUrl(filePath, expiresIn);
  },

  // ===== Client Activity =====
  listFbaLinesByCompany: async (companyId) => {
    return await supabase
      .from('fba_lines')
      .select('*')
      .eq('company_id', companyId)
      .order('service_date', { ascending: false });
  },

  listFbmLinesByCompany: async (companyId) => {
    return await supabase
      .from('fbm_lines')
      .select('*')
      .eq('company_id', companyId)
      .order('service_date', { ascending: false });
  },

  listOtherLinesByCompany: async (companyId) => {
    return await supabase
      .from('other_lines')
      .select('*')
      .eq('company_id', companyId)
      .order('service_date', { ascending: false });
  },

  createOtherLine: async (payload) => {
    return await supabase
      .from('other_lines')
      .insert(payload)
      .select()
      .single();
  },

  updateOtherLine: async (id, updates) => {
    return await supabase
      .from('other_lines')
      .update(updates)
      .eq('id', id);
  },

  deleteOtherLine: async (id) => {
    return await supabase
      .from('other_lines')
      .delete()
      .eq('id', id);
  },

  listStockByCompany: async (companyId) => {
    return await supabase
      .from('stock_items')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
  },

  updateStockItem: async (itemId, updates) => {
    return await supabase
      .from('stock_items')
      .update(updates)
      .eq('id', itemId);
  },

  listProductImages: async (stockItemId) => {
    return await supabase
      .from('product_images')
      .select('*')
      .eq('stock_item_id', stockItemId)
      .order('created_at');
  },

  addProductImage: async ({ stock_item_id, storage_path, uploaded_by }) => {
    return await supabase
      .from('product_images')
      .insert({ stock_item_id, storage_path, uploaded_by })
      .select()
      .single();
  },

  deleteProductImage: async (imageId) => {
    return await supabase
      .from('product_images')
      .delete()
      .eq('id', imageId);
  },
  countCompanyProductPhotos,
  ensurePhotoSubscriptionLine,
  removePhotoSubscriptionLine,
  handlePhotoUploadBilling,
  syncPhotoSubscription,

  createPrepRequestDraft: async (draftData) => {
    try {
      // 1) Insert header cu user_id + destination_country normalizat
      const { data: request, error: requestError } = await supabase
        .from('prep_requests')
        .insert({
          company_id: draftData.company_id,
          user_id:
            draftData.user_id ??
            (await supabase.auth.getUser()).data?.user?.id ??
            null,
          destination_country:
            draftData.destination_country || draftData.country, // compat
          status: 'pending',
        })
        .select()
        .single();

      if (requestError) throw requestError;
      if (!request?.id) throw new Error('Prep request insert returned no id');

const items = (draftData.items || []).map((it) => ({
  prep_request_id: request.id,
  stock_item_id: it.stock_item_id ?? null,
  ean: it.ean ?? null,                 // 👈 ADD
  product_name: it.product_name ?? null, // 👈 ADD (snapshot nume)
  asin: (it.asin ?? '').trim() || null,
  sku: (it.sku ?? '').trim() || null,
  units_requested: Number(
    it.units_requested != null ? it.units_requested : it.units
  ),
}));

      if (items.length === 0) {
        throw new Error('No items to insert for prep request');
      }

      const { error: itemsError } = await supabase
        .from('prep_request_items')
        .insert(items);

      if (itemsError) throw itemsError;

      return { data: request, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  createPrepRequest(payload) {
  return this.createPrepRequestDraft(payload);
},

  // Client history (O SINGURĂ definiție)
  listClientPrepRequests: async (companyId) => {
    return await supabase
      .from('prep_requests')
      .select(
        `
        *,
        prep_request_items (*),
        prep_request_tracking (*)
      `
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
  },

  // ===== Prep Requests Management =====
  listPrepRequests: async (options = {}) => {
    let query = supabase
      .from('prep_requests')
      .select(
        `
        *,
        profiles(first_name, last_name, email, company_name, store_name),
        companies(name),
        prep_request_items(*),
        prep_request_tracking(*)
      `,
        { count: 'exact' }
      );

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.page && options.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;
    
    if (error) return { data: [], error, count: 0 };

    const allStockIds = new Set();
    (data || []).forEach((r) => {
      (r.prep_request_items || []).forEach((it) => {
        if (it.stock_item_id) allStockIds.add(it.stock_item_id);
      });
    });

    let stockMap = {};
    if (allStockIds.size > 0) {
      const { data: stockData } = await supabase
        .from('stock_items')
        .select('id, name, ean, sku, asin, image_url')
        .in('id', Array.from(allStockIds));
      stockMap = Object.fromEntries((stockData || []).map((s) => [s.id, s]));
    }

    const processed = (data || []).map((r) => {
      const profileFirstName = r.profiles?.first_name || '';
      const profileLastName = r.profiles?.last_name || '';
      const profileCompany = r.profiles?.company_name || null;
      const profileStore = r.profiles?.store_name || null;
      const companyFallback = r.companies?.name || null;
      return {
        ...r,
        prep_request_items: (r.prep_request_items || []).map((it) => ({
          ...it,
          stock_item: stockMap[it.stock_item_id] || null,
        })),
        client_name: [profileFirstName, profileLastName].filter(Boolean).join(' ').trim(),
        user_email: r.profiles?.email,
        client_company_name: profileCompany || companyFallback || null,
        company_name: profileStore || companyFallback || profileCompany || null,
        store_name: profileStore || null,
      };
    });

    return { data: processed, error: null, count };
  },

  getPrepRequest: async (requestId) => {
    const { data, error } = await supabase
      .from('prep_requests')
      .select(`
        *,
        profiles(first_name, last_name, email, company_name, store_name),
        companies(name),
        prep_request_items(*),
        prep_request_tracking(*)
      `)
      .eq('id', requestId)
      .single();
    if (error) return { data: null, error };

    let stockMap = {};
    const itemIds = (data.prep_request_items || [])
      .map((it) => it.stock_item_id)
      .filter(Boolean);
    if (itemIds.length > 0) {
      const { data: stockData } = await supabase
        .from('stock_items')
        .select('id, name, ean, sku, asin, image_url')
        .in('id', itemIds);
      stockMap = Object.fromEntries((stockData || []).map((s) => [s.id, s]));
    }

    const processed = {
      ...data,
      prep_request_items: (data.prep_request_items || []).map((it) => ({
        ...it,
        stock_item: stockMap[it.stock_item_id] || null,
      })),
      client_name: [data.profiles?.first_name, data.profiles?.last_name].filter(Boolean).join(' '),
      user_email: data.profiles?.email,
      company_name: data.profiles?.store_name || data.companies?.name || data.profiles?.company_name
    };

    return { data: processed, error: null };
  },

deletePrepRequest: async (requestId) => {
  // Client-side delete: rely on RLS + ON DELETE CASCADE (prep_request_items, tracking, boxes)
  // Admins pot șterge direct, funcția RPC este doar pentru admin; evităm să o apelăm din client.
  const { error } = await supabase
    .from('prep_requests')
    .delete()
    .eq('id', requestId);
  return { error };
},

  setFbaShipmentId: async (requestId, shipmentId) => {
    return await supabase
      .from('prep_requests')
      .update({ fba_shipment_id: shipmentId })
      .eq('id', requestId);
  },

  updatePrepHeader: async (requestId, updates) => {
    return await supabase
      .from('prep_requests')
      .update(updates)
      .eq('id', requestId);
  },

addTrackingId: async (requestId, trackingId) => {
  return await supabase
    .from('prep_request_tracking')
    .insert({
      request_id: requestId,       // 👈 corect
      tracking_id: trackingId
    });
},

  removeTrackingId: async (trackingId) => {
    return await supabase
      .from('prep_request_tracking')
      .delete()
      .eq('id', trackingId);
  },

  updatePrepItem: async (itemId, updates) => {
    const { error } = await supabase
      .from('prep_request_items')
      .update(updates)
      .eq('id', itemId);
    return { error };
  },
// Creează o linie nouă în prep_request_items
createPrepItem: async (requestId, item) => {
  const { data, error } = await supabase
    .from('prep_request_items')
   .insert({
  prep_request_id: requestId,
  stock_item_id: item.stock_item_id ?? null,
  ean: item.ean ?? null,               // 👈 ADD
  product_name: item.product_name ?? null, // 👈 ADD
  asin: (item.asin ?? '').trim() || null,
  sku: (item.sku ?? '').trim() || null,
  units_requested: Number(item.units_requested),
})
    .select()
    .single();
  return { data, error };
},

// Șterge o linie din prep_request_items
  deletePrepItem: async (itemId) => {
    const { data, error } = await supabase
      .from('prep_request_items')
      .delete()
      .eq('id', itemId)
      .select();
    return { data, error };
  },

  getPrepRequestBoxes: async (itemIds = []) => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return { data: [], error: null };
    }
    return await supabase
      .from('prep_request_boxes')
      .select('id, prep_request_item_id, box_number, units, weight_kg, length_cm, width_cm, height_cm, updated_at')
      .in('prep_request_item_id', itemIds);
  },

  savePrepRequestBoxes: async (itemId, boxes = []) => {
    if (!itemId) return { error: new Error('Missing prep request item id') };
    const { error: delErr } = await supabase
      .from('prep_request_boxes')
      .delete()
      .eq('prep_request_item_id', itemId);
    if (delErr) return { error: delErr };

    if (!Array.isArray(boxes) || boxes.length === 0) {
      return { error: null };
    }

    const normalizeNumber = (value) => {
      if (value === '' || value === null || value === undefined) return null;
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      return Number(num.toFixed(2));
    };

    const payload = boxes.map((box) => ({
      prep_request_item_id: itemId,
      box_number: box.boxNumber,
      units: box.units,
      weight_kg: normalizeNumber(box.weightKg),
      length_cm: normalizeNumber(box.lengthCm),
      width_cm: normalizeNumber(box.widthCm),
      height_cm: normalizeNumber(box.heightCm)
    }));

    const { error } = await supabase.from('prep_request_boxes').insert(payload);
    if (error) return { error };
    return { error: null };
  },

  bulkUpdatePrepItems: async (items) => {
    const updatePromises = items.map(item => 
      supabase
        .from('prep_request_items')
        .update({
          units_sent: item.units_sent,
          obs_admin: item.obs_admin
        })
        .eq('id', item.id)
    );
    
    const results = await Promise.all(updatePromises);
    const error = results.find(r => r.error)?.error;
    return { error };
  },

  confirmPrepRequestV2: async (requestId, adminId) => {
    const { data, error } = await supabase.rpc('confirm_prep_request_v2', {
  p_request_id: requestId,   // 👈 numele corect
  p_admin_id: adminId        // 👈 numele corect
});
    return { data, error };
  },

  setPrepStatus: async (requestId, status) => {
    return await supabase
      .from('prep_requests')
      .update({ status })
      .eq('id', requestId);
  },

  sendPrepConfirmationEmail: async (payload) => {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/send_prep_confirm_email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Email service error: ${text}`);
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  // ===== Analytics =====
  trackVisit: async (visitData) => {
    try {
      // generate a stable visitor id if caller doesn't provide one
      let visitorId = visitData?.userId || visitData?.visitorId || null;
      if (!visitorId && typeof window !== 'undefined') {
        try {
          const k = 'pcf_uid';
          visitorId = localStorage.getItem(k);
          if (!visitorId) {
            visitorId = Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem(k, visitorId);
          }
        } catch {
          visitorId = null;
        }
      }

      const payload = {
        path: visitData?.path || window?.location?.pathname || '/',
        referrer: visitData?.referrer || document?.referrer || null,
        visitor_id: visitorId,
        locale: visitData?.locale || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      };
      await supabase.from('analytics_visits').insert(payload);
    } catch (error) {
      console.error('Analytics error:', error);
    }
  },

  getAnalytics: async (options = {}) => {
    try {
      const days = Math.max(1, options.days || 30);
      const end = new Date();
      end.setUTCHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - (days - 1));

      // Prefer server-side aggregation (admin-only RPC). Falls back to client aggregation if RPC fails.
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_analytics_admin', { p_days: days });
        if (!rpcError && rpcData) {
          const payload = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
          return {
            byDay: payload?.byDay || [],
            topPaths: payload?.topPaths || [],
            topReferrers: payload?.topReferrers || [],
            totals: payload?.totals || {},
            error: null
          };
        }
      } catch (err) {
        console.warn('get_analytics_admin rpc failed, falling back to client aggregation', err);
      }

      const { data, error, count } = await supabase
        .from('analytics_visits')
        .select('id, created_at, path, referrer, visitor_id', { count: 'exact' })
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .limit(50000)
        .order('created_at', { ascending: true });

      if (error) {
        return { byDay: [], topPaths: [], topReferrers: [], totals: {}, error };
      }

      const visits = data || [];
      const visitorCounts = new Map();
      const perDay = new Map();

      visits.forEach((v, idx) => {
        const date = new Date(v.created_at);
        const dayKey = date.toISOString().slice(0, 10);
        const visitorKey =
          v.visitor_id ||
          v.visitorId ||
          v.visitor ||
          v.client_id ||
          v.user_id ||
          v.id ||
          `unknown-${idx}`;

        const day = perDay.get(dayKey) || {
          date: dayKey,
          visits: 0,
          uniqueVisitors: new Set(),
          returningVisitors: new Set()
        };

        day.visits += 1;
        day.uniqueVisitors.add(visitorKey);

        const prev = visitorCounts.get(visitorKey) || 0;
        visitorCounts.set(visitorKey, prev + 1);
        if (prev > 0) day.returningVisitors.add(visitorKey);

        perDay.set(dayKey, day);
      });

      const totals = {
        visits: typeof count === 'number' ? count : visits.length,
        uniqueVisitors: visitorCounts.size,
        returningVisitors: Array.from(visitorCounts.values()).filter((c) => c > 1).length
      };

      const normalizeDateKey = (d) => {
        const iso = new Date(d);
        iso.setUTCHours(0, 0, 0, 0);
        return iso.toISOString().slice(0, 10);
      };

      const startKey = normalizeDateKey(start);
      const endKey = normalizeDateKey(end);

      const existing = new Map(
        Array.from(perDay.values()).map((d) => [
          d.date,
          {
            date: d.date,
            visits: d.visits,
            uniqueVisitors: d.uniqueVisitors.size,
            returningVisitors: d.returningVisitors.size
          }
        ])
      );

      const byDay = [];
      let cursor = new Date(startKey);
      while (cursor <= new Date(endKey)) {
        const key = normalizeDateKey(cursor);
        const row =
          existing.get(key) ||
          {
            date: key,
            visits: 0,
            uniqueVisitors: 0,
            returningVisitors: 0
          };
        byDay.push(row);
        cursor.setDate(cursor.getDate() + 1);
      }

      const aggregateCounts = (key, fallbackLabel = '') => {
        const map = new Map();
        visits.forEach((v) => {
          const k = (v[key] || fallbackLabel).trim() || fallbackLabel;
          map.set(k, (map.get(k) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
      };

      return {
        byDay,
        topPaths: aggregateCounts('path', '/'),
        topReferrers: aggregateCounts('referrer', '(direct)'),
        totals,
        error: null
      };
    } catch (error) {
      return { byDay: [], topPaths: [], topReferrers: [], totals: {}, error };
    }
  },

  // ===== Client Analytics Snapshot =====
  getClientAnalyticsSnapshot: async ({
    companyId,
    userId,
    startDate,
    endDate
  } = {}) => {

    const normalizeDate = (value) => {
      if (!value) return formatSqlDate();
      try {
        return formatSqlDate(new Date(value));
      } catch {
        return String(value).slice(0, 10);
      }
    };

    const dateFrom = normalizeDate(startDate || new Date());
    const dateTo = normalizeDate(endDate || dateFrom);
    const endKey = dateTo;
    const startIso = `${dateFrom}T00:00:00.000Z`;
    const endIso = `${dateTo}T23:59:59.999Z`;

    const withCompany = (query) => {
      if (companyId) {
        return query.eq('company_id', companyId);
      }
      return query;
    };

    const stockPromise = withCompany(
      supabase
        .from('stock_items')
        .select('id, qty, length_cm, width_cm, height_cm, amazon_stock, amazon_reserved, amazon_inbound, amazon_unfulfillable')
    ).limit(20000);
    const stockAllPromise = supabase
      .from('stock_items')
      .select('qty')
      .limit(20000);
    // client_stock_items view nu are coloana qty; evităm apelul direct ca să nu generăm 400
    const clientStockPromise = Promise.resolve({ data: [], error: null });
    const stockTotalRpcPromise = supabase.rpc('get_total_stock_units');

    const invoicesPromise = withCompany(
      supabase
        .from('invoices')
        .select('id, status, amount, issue_date')
    )
      .gte('issue_date', dateFrom)
      .lte('issue_date', dateTo)
      .limit(5000);

    const returnsPromise = withCompany(
      supabase
        .from('returns')
        .select('id, status, created_at')
    )
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(2000);

    const prepPromise = withCompany(
      supabase
        .from('prep_requests')
        .select('id, status, confirmed_at')
        .eq('status', 'confirmed')
    )
      .gte('confirmed_at', startIso)
      .lte('confirmed_at', endIso)
      .limit(5000);

    const receivingPromise = withCompany(
      supabase
        .from('receiving_shipments')
        .select('id, status, created_at')
    )
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(5000);

    const prepItemsPromise = supabase
      .from('prep_request_items')
      .select('units_requested, units_sent, prep_requests!inner(confirmed_at, company_id, status)')
      .eq('prep_requests.status', 'confirmed')
      .gte('prep_requests.confirmed_at', startIso)
      .lte('prep_requests.confirmed_at', endIso)
      .limit(10000);
    const receivingItemsPromise = supabase
      .from('receiving_to_stock_log')
      .select('quantity_moved, moved_at, receiving_items!inner(shipment_id, receiving_shipments!inner(company_id))')
      .limit(20000);

    const balancePromise = userId
      ? supabase.from('profiles').select('current_balance').eq('id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const fbaLinesPromise = withCompany(
      supabase
        .from('fba_lines')
        .select('total, unit_price, units, service_date')
    )
      .gte('service_date', dateFrom)
      .lte('service_date', dateTo)
      .limit(20000);
    const fbmLinesPromise = withCompany(
      supabase
        .from('fbm_lines')
        .select('total, unit_price, orders_units, service_date')
    )
      .gte('service_date', dateFrom)
      .lte('service_date', dateTo)
      .limit(20000);
    const otherLinesPromise = withCompany(
      supabase
        .from('other_lines')
        .select('total, unit_price, units, service_date')
    )
      .gte('service_date', dateFrom)
      .lte('service_date', dateTo)
      .limit(20000);

    const [stockRes, stockAllRes, clientStockRes, stockTotalRpcRes, invoicesRes, returnsRes, prepRes, receivingRes, prepItemsRes, receivingItemsRes, fbaLinesRes, fbmLinesRes, otherLinesRes, balanceRes] = await Promise.all([
      stockPromise,
      stockAllPromise,
      clientStockPromise,
      stockTotalRpcPromise,
      invoicesPromise,
      returnsPromise,
      prepPromise,
      receivingPromise,
      prepItemsPromise,
      receivingItemsPromise,
      fbaLinesPromise,
      fbmLinesPromise,
      otherLinesPromise,
      balancePromise
    ]);

    const numberOrZero = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const volumeForRow = (row) => {
      const l = numberOrZero(row.length_cm);
      const w = numberOrZero(row.width_cm);
      const h = numberOrZero(row.height_cm);
      if (!l || !w || !h) return 0;
      return (l * w * h) / 1_000_000; // cm3 -> m3
    };

    const stockRows = Array.isArray(stockRes.data) ? stockRes.data : [];
    const inventoryUnits = stockRows.reduce((acc, row) => acc + Math.max(0, numberOrZero(row.qty)), 0);
    const activeSkus = stockRows.filter((row) => numberOrZero(row.qty) > 0).length;
    const inventoryVolume = stockRows.reduce(
      (acc, row) => acc + volumeForRow(row) * Math.max(0, numberOrZero(row.qty)),
      0
    );
    const inventoryUnitsAll = (Array.isArray(stockAllRes.data) ? stockAllRes.data : []).reduce(
      (acc, row) => acc + Math.max(0, numberOrZero(row.qty)),
      0
    );
    const inventoryUnitsClientView = (Array.isArray(clientStockRes.data) ? clientStockRes.data : []).reduce(
      (acc, row) => acc + Math.max(0, numberOrZero(row.qty)),
      0
    );
    const inventoryUnitsRpc = stockTotalRpcRes?.data
      ? numberOrZero(Array.isArray(stockTotalRpcRes.data) ? stockTotalRpcRes.data[0]?.total_qty : stockTotalRpcRes.data.total_qty)
      : 0;

    const fbaInStock = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_stock), 0);
    const fbaReserved = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_reserved), 0);
    const fbaIncoming = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_inbound), 0);
    const fbaUnfulfillable = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_unfulfillable), 0);

    const invoiceRows = Array.isArray(invoicesRes.data) ? invoicesRes.data : [];
    const pendingInvoices = invoiceRows.filter(
      (row) => (row.status || '').toLowerCase() !== 'paid'
    ).length;
    const invoicesTotalAmount = invoiceRows.reduce((acc, row) => acc + numberOrZero(row.amount), 0);
    const invoicesTodayAmount = invoiceRows
      .filter((row) => (row.issue_date || '').slice(0, 10) === dateFrom)
      .reduce((acc, row) => acc + numberOrZero(row.amount), 0);

    const returnsRows = Array.isArray(returnsRes.data) ? returnsRes.data : [];
    const prepRows = Array.isArray(prepRes.data) ? prepRes.data : [];
    const receivingRows = Array.isArray(receivingRes.data) ? receivingRes.data : [];
    const prepItemRows = Array.isArray(prepItemsRes.data) ? prepItemsRes.data : [];
    const receivingItemRows = Array.isArray(receivingItemsRes.data) ? receivingItemsRes.data : [];
    const fbaLines = Array.isArray(fbaLinesRes.data) ? fbaLinesRes.data : [];
    const fbmLines = Array.isArray(fbmLinesRes.data) ? fbmLinesRes.data : [];
    const otherLines = Array.isArray(otherLinesRes.data) ? otherLinesRes.data : [];

    const filterCompanyJoin = (rows, extractor) => {
      if (!companyId) return rows;
      return rows.filter((row) => extractor(row) === companyId);
    };
    const filteredPrepItems = filterCompanyJoin(prepItemRows, (r) => r.prep_requests?.company_id);
    const filteredReceivingItems = filterCompanyJoin(
      receivingItemRows,
      (r) => r.receiving_items?.receiving_shipments?.company_id
    );

    const prepUnitsTotal = filteredPrepItems.reduce(
      (acc, row) => acc + numberOrZero(row.units_sent ?? row.units_requested),
      0
    );
    const prepUnitsToday = filteredPrepItems
      .filter((row) => (row.prep_requests?.confirmed_at || '').slice(0, 10) === dateFrom)
      .reduce((acc, row) => acc + numberOrZero(row.units_sent ?? row.units_requested), 0);

    const getReceivingDate = (row) => (row.moved_at || '').slice(0, 10);

    const receivingItemsInRange = filteredReceivingItems.filter((row) => {
      const d = getReceivingDate(row);
      return d && d >= dateFrom && d <= dateTo;
    });

    const receivingUnitsTotalLocal = receivingItemsInRange.reduce(
      (acc, row) => acc + numberOrZero(row.quantity_moved ?? 0),
      0
    );
    const receivingUnitsTodayLocal = receivingItemsInRange
      .filter((row) => getReceivingDate(row) === dateFrom)
      .reduce((acc, row) => acc + numberOrZero(row.quantity_moved ?? 0), 0);

    const lastReceivingDateAll = (() => {
      const dates = filteredReceivingItems
        .map((row) => getReceivingDate(row))
        .filter(Boolean)
        .sort();
      return dates.length ? dates[dates.length - 1] : null;
    })();

    const receivingUnitsTotal = receivingUnitsTotalLocal;
    const receivingUnitsToday = receivingUnitsTodayLocal;

    const sumAmount = (rows, dateField, qtyField) =>
      rows.reduce((acc, row) => {
        const qty = qtyField ? numberOrZero(row[qtyField]) : 1;
        const val = row.total != null ? numberOrZero(row.total) : numberOrZero(row.unit_price) * qty;
        return acc + val;
      }, 0);

    const sumAmountByDate = (rows, dateField, qtyField) =>
      rows
        .filter((row) => (row[dateField] || '').slice(0, 10) === dateFrom)
        .reduce((acc, row) => {
          const qty = qtyField ? numberOrZero(row[qtyField]) : 1;
          const val = row.total != null ? numberOrZero(row.total) : numberOrZero(row.unit_price) * qty;
          return acc + val;
        }, 0);
    const sumAmountByExactDate = (rows, dateField, qtyField, target) =>
      rows
        .filter((row) => (row[dateField] || '').slice(0, 10) === target)
        .reduce((acc, row) => {
          const qty = qtyField ? numberOrZero(row[qtyField]) : 1;
          const val = row.total != null ? numberOrZero(row.total) : numberOrZero(row.unit_price) * qty;
          return acc + val;
        }, 0);

    const financeAmounts = {
      fba: sumAmount(fbaLines, 'service_date', 'units'),
      fbm: sumAmount(fbmLines, 'service_date', 'orders_units'),
      other: sumAmount(otherLines, 'service_date', 'units')
    };
    const financeAmountsToday = {
      fba: sumAmountByDate(fbaLines, 'service_date', 'units'),
      fbm: sumAmountByDate(fbmLines, 'service_date', 'orders_units'),
      other: sumAmountByDate(otherLines, 'service_date', 'units')
    };
    const financeAmountsTodayAbsolute = {
      fba: sumAmountByExactDate(fbaLines, 'service_date', 'units', endKey),
      fbm: sumAmountByExactDate(fbmLines, 'service_date', 'orders_units', endKey),
      other: sumAmountByExactDate(otherLines, 'service_date', 'units', endKey)
    };

    const buildDailyAmounts = (rows, dateField, qtyField) => {
      const map = new Map();
      rows.forEach((row) => {
        const dateKey = (row[dateField] || '').slice(0, 10);
        if (!dateKey) return;
        const qty = qtyField ? numberOrZero(row[qtyField]) : 1;
        const val = row.total != null ? numberOrZero(row.total) : numberOrZero(row.unit_price) * qty;
        map.set(dateKey, (map.get(dateKey) || 0) + val);
      });
      const daily = [];
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = formatSqlDate(d);
        daily.push({ date: key, amount: map.get(key) || 0 });
      }
      return daily;
    };

    const financeDailyAmounts = buildDailyAmounts(
      [...fbaLines, ...fbmLines, ...otherLines],
      'service_date',
      'units'
    );

    const balanceValue = balanceRes?.data?.current_balance ?? 0;

    const buildSeries = (rows, getDate) => {
      const byDate = new Map();
      const statusCounts = {};
      const statusKeys = new Set();
      const pickDate = getDate || ((row) => row.created_at);

      rows.forEach((row) => {
        const status = (row.status || 'unknown').toLowerCase();
        const value = pickDate(row);
        const dateKey = value ? new Date(value).toISOString().slice(0, 10) : dateFrom;
        const bucket = byDate.get(dateKey) || { total: 0, byStatus: {} };
        bucket.total += 1;
        bucket.byStatus[status] = (bucket.byStatus[status] || 0) + 1;
        byDate.set(dateKey, bucket);
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        statusKeys.add(status);
      });

      const allStatuses = Array.from(statusKeys);
      const daily = [];
      let cursor = new Date(dateFrom);
      const end = new Date(dateTo);
      while (cursor <= end) {
        const key = formatSqlDate(cursor);
        const dayBucket = byDate.get(key) || { total: 0, byStatus: {} };
        const entry = { date: key, total: dayBucket.total };
        allStatuses.forEach((key) => {
          entry[key] = dayBucket.byStatus[key] || 0;
        });
        daily.push(entry);
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      }

      const recent = rows
        .slice()
        .sort((a, b) => new Date(pickDate(b) || 0) - new Date(pickDate(a) || 0))
        .slice(0, 6);

      return { statusCounts, statusKeys: allStatuses, daily, recent };
    };

    const buildDailyUnits = (rows, getDate, getQty) => {
      const map = new Map();
      rows.forEach((row) => {
        const dateKey = getDate(row);
        if (!dateKey) return;
        const qty = Math.max(0, numberOrZero(getQty(row)));
        map.set(dateKey, (map.get(dateKey) || 0) + qty);
      });
      const daily = [];
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = formatSqlDate(d);
        daily.push({ date: key, units: map.get(key) || 0 });
      }
      return daily;
    };

    const ordersSeries = buildSeries(prepRows, (row) => row.confirmed_at);
    const shipmentsSeries = buildSeries(receivingRows);
    const returnsSeries = buildSeries(returnsRows);

    const preparedDailyUnits = buildDailyUnits(
      filteredPrepItems,
      (row) => (row.prep_requests?.confirmed_at || '').slice(0, 10),
      (row) => row.units_sent ?? row.units_requested
    );
    const receivingDailyUnits = buildDailyUnits(
      receivingItemsInRange,
      (row) => getReceivingDate(row),
      (row) => row.quantity_moved
    );

    return {
      data: {
        dateFrom,
        dateTo,
        inventory: {
          units: inventoryUnits,
          unitsAll: inventoryUnitsRpc || inventoryUnitsClientView || inventoryUnitsAll,
          activeSkus,
          volumeM3: Number(inventoryVolume.toFixed(3))
        },
        fbaStock: {
          inStock: fbaInStock,
          reserved: fbaReserved,
          inbound: fbaIncoming,
          unfulfillable: fbaUnfulfillable,
          total: fbaInStock + fbaReserved + fbaIncoming + fbaUnfulfillable
        },
        finance: {
          balance: numberOrZero(balanceValue),
          pendingInvoices,
          amountInvoiced: invoicesTotalAmount,
          amountInvoicedToday: invoicesTodayAmount,
          prepAmounts: financeAmounts,
          prepAmountsToday: financeAmountsToday,
          prepAmountsTodayAbsolute: financeAmountsTodayAbsolute,
          dailyAmounts: financeDailyAmounts
        },
        returns: {
          pending: returnsRows.filter((r) => ['pending', 'processing'].includes((r.status || '').toLowerCase())).length
        },
        prepared: {
          unitsToday: prepUnitsToday,
          unitsTotal: prepUnitsTotal,
          dailyUnits: preparedDailyUnits
        },
        receiving: {
          unitsToday: receivingUnitsToday,
          unitsTotal: receivingUnitsTotal,
          dailyUnits: receivingDailyUnits,
          lastReceivingDate: lastReceivingDateAll
        },
        series: {
          orders: { label: 'Prep requests', ...ordersSeries },
          shipments: { label: 'Receiving shipments', ...shipmentsSeries },
          returns: { label: 'Returns', ...returnsSeries }
        }
      },
      error:
        stockRes.error ||
        invoicesRes.error ||
        returnsRes.error ||
        prepRes.error ||
        receivingRes.error ||
        balanceRes.error ||
        null
    };
  },
  // ===== Analytics / Balances =====
  getPeriodBalances: async (...args) => {
    // compatibilitate: acceptă atât (companyId, startDate, endDate)
    // cât și (userId, companyId, startDate, endDate)
    let companyId, startDate, endDate;
  if (args.length === 4) {
    [, companyId, startDate, endDate] = args; // apel vechi
  } else {
    [companyId, startDate, endDate] = args;   // apel nou
  }

  const { data, error } = await supabase.rpc('get_period_balances', {
    p_company_id: companyId,
    p_start_date: startDate,   // 'YYYY-MM-DD'
    p_end_date: endDate        // 'YYYY-MM-DD'
  });

  // rpc întoarce o singură linie; normalizez ca obiect
  const row = Array.isArray(data) ? data[0] : data;
  return { data: row, error };
},

  getInventoryStaleness: async () => {
    try {
      const { data, error } = await supabase.rpc('get_inventory_staleness');
      if (!error) return { data: Array.isArray(data) ? data : [], error: null };

      // Fallback dacă funcția nu există în schema cache
      if (String(error?.message || '').toLowerCase().includes('get_inventory_staleness')) {
        const [companiesRes, stockRes, recvRes] = await Promise.all([
          supabase.from('companies').select('id,name').limit(1000),
          supabase.from('stock_items').select('company_id, qty').limit(50000),
          supabase
            .from('receiving_shipments')
            .select('company_id, processed_at, received_at, submitted_at, created_at')
            .limit(20000)
        ]);

        const companies = Array.isArray(companiesRes.data) ? companiesRes.data : [];
        const stockRows = Array.isArray(stockRes.data) ? stockRes.data : [];
        const recvRows = Array.isArray(recvRes.data) ? recvRes.data : [];

        const nameById = new Map(companies.map((c) => [c.id, c.name]));
        const unitsByCompany = new Map();
        stockRows.forEach((row) => {
          if (!row?.company_id) return;
          const qty = Number(row.qty) || 0;
          if (qty <= 0) return;
          unitsByCompany.set(row.company_id, (unitsByCompany.get(row.company_id) || 0) + qty);
        });
        const lastRecvByCompany = new Map();
        recvRows.forEach((row) => {
          if (!row?.company_id) return;
          const d = row.processed_at || row.received_at || row.submitted_at || row.created_at;
          if (!d) return;
          const prev = lastRecvByCompany.get(row.company_id);
          if (!prev || new Date(d) > new Date(prev)) {
            lastRecvByCompany.set(row.company_id, d);
          }
        });

        const rows = [];
        unitsByCompany.forEach((units, companyId) => {
          if (units <= 0) return; // only skip zero/negative stock
          const last = lastRecvByCompany.get(companyId) || null;
          const lastDate = last ? new Date(last) : null;
          const days =
            lastDate != null
              ? Math.floor((new Date().setHours(0, 0, 0, 0) - lastDate.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
              : null;
          rows.push({
            company_id: companyId,
            company_name: nameById.get(companyId) || companyId,
            units_in_stock: units,
            last_receiving_date: lastDate ? lastDate.toISOString().slice(0, 10) : null,
            days_since_last_receiving: days
          });
        });

        return { data: rows, error: null };
      }

      return { data: [], error };
    } catch (e) {
      return { data: [], error: e };
    }
  },

  // ===== NEW: Receiving System =====
  
  // Carriers
  getCarriers: async () => {
    return await supabase
      .from('carriers')
      .select('*')
      .eq('active', true)
      .order('sort_order');
  },

createReceivingShipment: async (shipmentData) => {
  const dataToInsert = {
    ...shipmentData,
    tracking_ids: shipmentData.tracking_ids || (shipmentData.tracking_id ? [shipmentData.tracking_id] : [])
  };
  const { data, error } = await supabase
    .from('receiving_shipments')
    .insert(dataToInsert)
    .select()
    .single();
  return { data, error };
},


  getClientReceivingShipments: async (companyId) => {
    const { data, error } = await supabase
      .from('receiving_shipments')
      .select(`
        *,
        receiving_items(*, stock_item:stock_items(*)),
        receiving_shipment_items(*)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error };

    const shipments = data || [];
    const missingIds = shipments
      .filter((row) => !row.receiving_items || row.receiving_items.length === 0)
      .map((row) => row.id)
      .filter(Boolean);

    const fallbackMap = {};

    if (missingIds.length > 0) {
      const { data: fallbackItems } = await supabase
        .from('receiving_items')
        .select('*')
        .in('shipment_id', missingIds);
      (fallbackItems || []).forEach((item) => {
        if (!item?.shipment_id) return;
        (fallbackMap[item.shipment_id] ||= []).push(item);
      });
      const stillMissing = missingIds.filter((id) => !(fallbackMap[id] && fallbackMap[id].length));
      if (stillMissing.length > 0) {
        const { data: legacyItems } = await supabase
          .from('receiving_shipment_items')
          .select('*')
          .in('shipment_id', stillMissing);
        (legacyItems || []).forEach((item) => {
          if (!item?.shipment_id) return;
          (fallbackMap[item.shipment_id] ||= []).push({
            ...item,
            quantity_received:
              item.quantity_received ??
              item.quantity ??
              item.qty ??
              item.requested ??
              0,
            received_units: item.received_units ?? item.quantity_received ?? item.quantity ?? 0
          });
        });
      }
    }

    const processed = shipments.map((row) => {
      const legacyItems = row.receiving_shipment_items || [];
      const modernItems = row.receiving_items || [];
      const fallbackItems = fallbackMap[row.id] || [];
      const resolvedItems =
        modernItems.length > 0
          ? modernItems
          : fallbackItems.length > 0
          ? fallbackItems
          : legacyItems;
      const { receiving_shipment_items, receiving_items, ...rest } = row;
      return {
        ...rest,
        receiving_items: resolvedItems
      };
    });

    return { data: processed, error: null };
  },

  updateReceivingShipment: async (shipmentId, updates) => {
    await ensureReceivingColumnSupport();
    const executeUpdate = async (payload) => {
      const { error } = await supabase
        .from('receiving_shipments')
        .update(payload)
        .eq('id', shipmentId);
      if (error) throw error;
    };

    const basePatch = { ...updates };

    while (true) {
      const patch = sanitizeShipmentPayload(basePatch);
      try {
        await executeUpdate(patch);
        break;
      } catch (error) {
        if (supportsReceivingFbaMode && isMissingColumnError(error, 'fba_mode')) {
          disableReceivingFbaModeSupport();
          continue;
        }
        if (receivingShipmentArrayColumnMissing(error)) {
          disableReceivingShipmentArraySupport();
          continue;
        }
        throw error;
      }
    }
  },

  deleteReceivingShipment: async (shipmentId) => {
    return await supabase
      .from('receiving_shipments')
      .delete()
      .eq('id', shipmentId);
  },

createReceivingItems: async (items) => {
  await ensureReceivingColumnSupport();
  // Acceptă un singur obiect sau un array de obiecte
  const arr = Array.isArray(items) ? items : [items];

  // Grupăm pe shipment_id, ca să numerotăm corect per shipment
  const byShipment = arr.reduce((acc, it) => {
    if (!it.shipment_id) {
      throw new Error('Missing shipment_id on receiving item');
    }
    (acc[it.shipment_id] ||= []).push(it);
    return acc;
  }, {});

  const rawRows = [];

  // Pentru fiecare shipment, aflăm ultimul line_number și continuăm numerotarea
  for (const [shipmentId, group] of Object.entries(byShipment)) {
    const { data: last } = await supabase
      .from('receiving_items')
      .select('line_number')
      .eq('shipment_id', shipmentId)
      .order('line_number', { ascending: false })
      .limit(1)
      .maybeSingle(); // evită 406 când nu există rânduri

    let next = (last?.line_number ?? 0) + 1;

    for (const it of group) {
      rawRows.push({
        ...it,
        line_number: next++,
      });
    }
  }

  const buildPayload = () =>
    rawRows.map((row) =>
      supportsReceivingItemFbaColumns ? row : sanitizeItemPayload(row)
    );

  const insertRows = async (rows) => {
    const { data, error } = await supabase
      .from('receiving_items')
      .insert(rows)
      .select('*');
    if (error) throw error;
    return data;
  };

  let payload = buildPayload();
  try {
    return await insertRows(payload);
  } catch (error) {
    if (supportsReceivingItemFbaColumns && receivingItemColumnMissing(error)) {
      disableReceivingItemFbaSupport();
      payload = buildPayload();
      return await insertRows(payload);
    }
    throw error;
  }
},

  updateReceivingItem: async (itemId, updates) => {
    await ensureReceivingColumnSupport();
    const executeUpdate = async (payload) => {
      const { error } = await supabase
        .from('receiving_items')
        .update(payload)
        .eq('id', itemId);
      if (error) throw error;
    };

    let patch = { ...updates };
    if (!supportsReceivingItemFbaColumns) patch = sanitizeItemPayload(patch);

    try {
      await executeUpdate(patch);
    } catch (error) {
      if (supportsReceivingItemFbaColumns && receivingItemColumnMissing(error)) {
        disableReceivingItemFbaSupport();
        patch = sanitizeItemPayload(patch);
        await executeUpdate(patch);
      } else {
        throw error;
      }
    }
  },

  deleteReceivingItem: async (itemId) => {
    return await supabase
      .from('receiving_items')
      .delete()
      .eq('id', itemId);
  },

  getReceivingItems: async (shipmentId) => {
    return await supabase
      .from('receiving_items')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('line_number');
  },

  deleteReceivingItemsByShipment: async (shipmentId) => {
  const { data, error } = await supabase
    .from('receiving_items')
    .delete()
    .eq('shipment_id', shipmentId);
  return { data, error };
},


getAllReceivingShipments: async (options = {}) => {
  const from = (options.page ? (options.page - 1) * (options.pageSize || 20) : 0);
  const to = from + ((options.pageSize || 20) - 1);

  // aduce ambele versiuni de tabele de items
  let query = supabase
    .from('receiving_shipments')
    .select(
      `
      *,
      companies:companies(name),
      receiving_shipment_items(*),
      receiving_items(*, stock_item:stock_items(*))
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (options.fetchAll) {
    query = query.limit(options.maxRows || 2000);
  } else {
    query = query.range(from, to);
  }

  if (options.status) query = query.eq('status', options.status);
  if (options.companyId) query = query.eq('company_id', options.companyId);

  const { data, error, count } = await query;
  if (error) return { data: [], error, count: 0 };

  // colectăm user_id-urile pentru a aduce store_name din profiles
  const userIds = [...new Set((data || []).map(r => r.user_id).filter(Boolean))];
  let profilesById = {};
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, store_name, first_name, last_name, email')
      .in('id', userIds);
    profilesById = Object.fromEntries(
      (profilesData || []).map((p) => [p.id, p])
    );
  }

  const shipments = data || [];

  const missingItemShipments = shipments
    .filter((row) => !row.receiving_items || row.receiving_items.length === 0)
    .map((row) => row.id)
    .filter(Boolean);

  const fallbackItemsMap = {};
  if (missingItemShipments.length > 0) {
    const { data: fallbackItems } = await supabase
      .from('receiving_items')
      .select('*, stock_item:stock_items(*)')
      .in('shipment_id', missingItemShipments);
    (fallbackItems || []).forEach((item) => {
      if (!item?.shipment_id) return;
      (fallbackItemsMap[item.shipment_id] ||= []).push(item);
    });

    const stillMissing = missingItemShipments.filter(
      (id) => !(fallbackItemsMap[id] && fallbackItemsMap[id].length)
    );
    if (stillMissing.length > 0) {
      const { data: legacyItems } = await supabase
        .from('receiving_shipment_items')
        .select('*')
        .in('shipment_id', stillMissing);
      (legacyItems || []).forEach((item) => {
        if (!item?.shipment_id) return;
        (fallbackItemsMap[item.shipment_id] ||= []).push({
          ...item,
          quantity_received:
            item.quantity_received ??
            item.quantity ??
            item.qty ??
            item.requested ??
            0,
          received_units: item.received_units ?? item.quantity_received ?? item.quantity ?? 0
        });
      });
    }
  }

  // pregătește metadate stock
  const allStockIds = new Set();
  const asinSet = new Set();
  const skuSet = new Set();
  const eanSet = new Set();
  shipments.forEach((r) => {
    (r.receiving_shipment_items || []).forEach((it) => {
      if (it.stock_item_id) allStockIds.add(it.stock_item_id);
      if (it.asin) asinSet.add(it.asin);
      if (it.sku) skuSet.add(it.sku);
      if (it.ean) eanSet.add(it.ean);
    });
    (r.receiving_items || []).forEach((it) => {
      if (it.stock_item_id) allStockIds.add(it.stock_item_id);
      if (it.asin) asinSet.add(it.asin);
      if (it.sku) skuSet.add(it.sku);
      if (it.ean_asin) eanSet.add(it.ean_asin);
    });
    (fallbackItemsMap[r.id] || []).forEach((it) => {
      if (it.stock_item_id) allStockIds.add(it.stock_item_id);
      if (it.asin) asinSet.add(it.asin);
      if (it.sku) skuSet.add(it.sku);
      if (it.ean_asin || it.ean) eanSet.add(it.ean_asin || it.ean);
    });
  });

  let stockMap = {};
  let stockByAsin = {};
  let stockBySku = {};
  let stockByEan = {};
  const collected = [];

  const addStockRows = (rows = []) => {
    rows.forEach((s) => {
      if (!s) return;
      stockMap[s.id] = s;
      if (s.asin) stockByAsin[s.asin] = s;
      if (s.sku) stockBySku[s.sku] = s;
      if (s.ean) stockByEan[s.ean] = s;
    });
  };

  if (allStockIds.size > 0) {
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('id, asin, name, sku, ean, image_url')
      .in('id', Array.from(allStockIds));
    addStockRows(stockData);
  }
  if (asinSet.size > 0) {
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('id, asin, name, sku, ean, image_url')
      .in('asin', Array.from(asinSet));
    addStockRows(stockData);
  }
  if (skuSet.size > 0) {
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('id, asin, name, sku, ean, image_url')
      .in('sku', Array.from(skuSet));
    addStockRows(stockData);
  }
  if (eanSet.size > 0) {
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('id, asin, name, sku, ean, image_url')
      .in('ean', Array.from(eanSet));
    addStockRows(stockData);
  }

  // combinăm datele din ambele tabele (receiving_shipment_items și receiving_items)
    const processed = shipments.map(r => {
      const fallback = fallbackItemsMap[r.id] || [];
      const items = [
        ...(r.receiving_shipment_items || []),
        ...(r.receiving_items || []),
        ...fallback
      ];

    const { companies, receiving_shipment_items, receiving_items, ...rest } = r;
    const profileMeta = profilesById[r.user_id] || {};
    const rawStore = (rest.client_store_name || rest.store_name || '').trim();
    const store_name = rawStore || null; // explicit: store reference provided by client, not profile fallback

    return {
      ...rest,
      receiving_items: items.map((it) => ({
        ...it,
        stock_item:
          stockMap[it.stock_item_id] ||
          (it.asin && stockByAsin[it.asin]) ||
          (it.sku && stockBySku[it.sku]) ||
          ((it.ean_asin || it.ean) &&
            (stockByAsin[it.ean_asin || it.ean] || stockByEan[it.ean_asin || it.ean])) ||
          null,
      })),
      produits_count: items.length,
      store_name,
      client_name:
        profileMeta.store_name ||
        [profileMeta.first_name, profileMeta.last_name].filter(Boolean).join(' ') ||
        rest.client_name ||
        null,
      client_email: profileMeta.email || rest.user_email || null,
      company_name: companies?.name || null
    };
  });

  return { data: processed, error: null, count };
},

  markReceivingItemsAsReceived: async (shipmentId, itemIds = [], receivedBy) =>
    await markItemsAsReceived(shipmentId, itemIds, receivedBy),

  markReceivingAsReceived: (shipmentId, receivedBy) =>
    markShipmentFullyReceived(shipmentId, receivedBy),

  markMultipleAsReceived: async (shipmentIds = [], receivedBy) => {
    for (const shipmentId of shipmentIds || []) {
      const result = await markShipmentFullyReceived(shipmentId, receivedBy);
      if (result?.error) return result;
    }
    return { error: null };
  },

  // Process to Stock
  processReceivingToStock: async (shipmentId, processedBy, itemsToProcess, options = {}) => {
    try {
      const opts = options || {};
      await ensureReceivingColumnSupport();
      const { data: shipment, error: shipmentFetchError } = await supabase
        .from('receiving_shipments')
        .select('id, company_id, user_id, destination_country')
        .eq('id', shipmentId)
        .single();
      if (shipmentFetchError) throw shipmentFetchError;

      const fbaLines = [];

      for (const sourceItem of itemsToProcess) {
        const item = {
          ...sourceItem,
          company_id: sourceItem.company_id || shipment.company_id
        };
        const quantityReceived = Math.max(
          0,
          Number(
            item.received_units != null ? item.received_units : item.quantity_received || 0
          )
        );
        const intent = resolveFbaIntent(item);
        let fbaQty = intent.hasIntent ? Math.max(0, Number(intent.qty) || 0) : 0;
        if (intent.hasIntent && fbaQty === 0 && intent.directFromAction) {
          fbaQty = quantityReceived;
        }
        if (fbaQty > quantityReceived) {
          fbaQty = quantityReceived;
        }
        const qtyToStock = Math.max(0, quantityReceived - fbaQty);

        const stockRow = await ensureStockItemForReceiving(item, processedBy);
        const normalizedAsin = normalizeCode(item.asin);
        const normalizedSku = normalizeCode(item.sku);
        const stockId = stockRow?.id || null;

        if (qtyToStock > 0 && stockRow) {
          const newQty = Number(stockRow.qty || 0) + qtyToStock;
          const updates = { qty: newQty };

          if (item.purchase_price != null && item.purchase_price !== stockRow.purchase_price) {
            updates.purchase_price = item.purchase_price;
          }
          if (item.product_name && item.product_name !== stockRow.name) {
            updates.name = item.product_name;
          }
          if (normalizedAsin && normalizedAsin !== stockRow.asin) {
            updates.asin = normalizedAsin;
          }
          if (normalizedSku && normalizedSku !== stockRow.sku) {
            updates.sku = normalizedSku;
          }

          await supabase
            .from('stock_items')
            .update(updates)
            .eq('id', stockRow.id);

          await supabase
            .from('receiving_to_stock_log')
            .insert({
              receiving_item_id: item.id,
              stock_item_id: stockRow.id,
              quantity_moved: qtyToStock,
              moved_by: processedBy,
              notes: 'Processed from receiving shipment'
            });
        }

        const applyItemUpdate = async (payload) => {
          const { error } = await supabase
            .from('receiving_items')
            .update(payload)
            .eq('id', item.id);
          if (error) throw error;
        };

        const sendDirect = intent.hasIntent && fbaQty > 0;
        let itemPatch = {
          stock_item_id: stockId,
          quantity_to_stock: qtyToStock,
          remaining_action: encodeRemainingAction(sendDirect, fbaQty || intent.qtyHint),
          send_to_fba: sendDirect,
          fba_qty: fbaQty
        };

        if (!supportsReceivingItemFbaColumns) itemPatch = sanitizeItemPayload(itemPatch);

        try {
          await applyItemUpdate(itemPatch);
        } catch (error) {
          if (supportsReceivingItemFbaColumns && receivingItemColumnMissing(error)) {
            disableReceivingItemFbaSupport();
            itemPatch = sanitizeItemPayload(itemPatch);
            await applyItemUpdate(itemPatch);
          } else {
            throw error;
          }
        }

        if (sendDirect && stockId) {
          fbaLines.push({
            stock_item_id: stockId,
            ean: stockRow?.ean || item.ean_asin || null,
            product_name: stockRow?.name || item.product_name || null,
            asin: stockRow?.asin || normalizedAsin || null,
            sku: stockRow?.sku || normalizedSku || null,
            units_requested: fbaQty
          });
        }
      }

      if (fbaLines.length && opts.createPrepRequest !== false) {
        await supabaseHelpers.createPrepRequest({
          company_id: shipment.company_id,
          user_id: shipment.user_id || processedBy,
          status: 'pending',
          destination_country: shipment.destination_country || 'FR',
          items: fbaLines
        });
      }

      if (!opts.skipShipmentUpdate) {
        const { error: shipmentError } = await supabase
          .from('receiving_shipments')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            processed_by: processedBy
          })
          .eq('id', shipmentId);
        if (shipmentError) throw shipmentError;
      }

      return { error: null, fbaLines };
    } catch (error) {
      return { error };
    }
  },

  // Stock matching for receiving
  findStockMatches: async (companyId, eanAsins) => {
    if (!eanAsins || eanAsins.length === 0) return { data: [], error: null };
    
    return await supabase
      .from('stock_items')
      .select('id, ean, name, asin, qty, purchase_price')
      .eq('company_id', companyId)
      .in('ean', eanAsins);
  },

  // EAN/UPC/GTIN & ASIN validation (Amazon-style)
  validateEAN: (ean) => {
    const raw0 = String(ean ?? '');

    // normalize: remove Excel leading apostrophe, BOM/NBSP/ZWSP, spaces & separators
    const raw = raw0
      .replace(/^\uFEFF/, '')                 // BOM
      .replace(/^[']+/, '')                   // '12345 -> 12345
      .replace(/[\u00A0\u200B\u200C\u200D]/g, '') // NBSP & zero-width
      .trim();

    // build two versions
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    const upperAlnum = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

    // generic GTIN check digit calculator (for 7/11/12/13 base lengths -> 8/12/13/14 total)
    function gtinCheckOk(d) {
      // last digit is check
      const digits = d.split('').map(n => Number(n));
      const base = digits.slice(0, -1);
      const check = digits[digits.length - 1];

      // From right over base digits, positions start at 1 with weight 3, then 1, then 3...
      let sum = 0;
      let pos = 1;
      for (let i = base.length - 1; i >= 0; i--, pos++) {
        const weight = (pos % 2 === 1) ? 3 : 1;
        sum += base[i] * weight;
      }
      const calc = (10 - (sum % 10)) % 10;
      return calc === check;
    }

    // 1) ASIN: 10 chars, alphanumeric uppercase, Amazon style (e.g., B00EXAMPLE)
    if (/^[A-Z0-9]{10}$/.test(upperAlnum) && /[A-Z]/.test(upperAlnum)) {
      return { valid: true, type: 'ASIN', formatted: upperAlnum };
    }

    // 2) GTIN/EAN/UPC: digits only with valid check digit
    //    Accept total lengths: 8 (EAN-8), 12 (UPC-A), 13 (EAN-13), 14 (GTIN-14)
    if (/^\d+$/.test(digitsOnly)) {
      const len = digitsOnly.length;
      if ((len === 8 || len === 12 || len === 13 || len === 14) && gtinCheckOk(digitsOnly)) {
        let label = 'GTIN';
        if (len === 8)  label = 'EAN-8';
        if (len === 12) label = 'UPC-A';
        if (len === 13) label = 'EAN-13';
        if (len === 14) label = 'GTIN-14';
        return { valid: true, type: label, formatted: digitsOnly };
      }
    }

    // 3) Anything else = invalid (Amazon nu acceptă alte lungimi/formate ca GTIN valid)
    return { valid: false, type: 'Unknown', formatted: raw0 };
 }
};

export { supabase as default };

export async function setPrepStatus(requestId, status) {
  return supabase
    .from('prep_requests')
    .update({ status })
    .eq('id', requestId);
}
