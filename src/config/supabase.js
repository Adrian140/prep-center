// FILE: src/config/supabase.js
import { createClient } from '@supabase/supabase-js';
import { tabSessionStorage } from '../utils/tabStorage';
import { getTabId } from '../utils/tabIdentity';
import { encodeRemainingAction, resolveFbaIntent } from '../utils/receivingFba';
import { normalizeMarketCode } from '../utils/market';
import { mapStockRowsForMarket } from '../utils/marketStock';
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
const normalizePrepDestinationCountry = (value) => {
  const code = String(value || 'FR').trim().toUpperCase();
  return code === 'GB' ? 'UK' : code;
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
const sumLineRows = (rows = [], qtyField = 'units') =>
  (rows || []).reduce((acc, row) => {
    const total =
      row?.total != null
        ? Number(row.total)
        : Number(row?.unit_price || 0) * Number(row?.[qtyField] || 0);
    return acc + (Number.isFinite(total) ? total : 0);
  }, 0);
const sumPaidInvoices = (rows = []) =>
  (rows || []).reduce((acc, row) => {
    const status = String(row?.status || '').trim().toLowerCase();
    const amount = Number(row?.amount);
    if (!['paid', 'settled'].includes(status) || !Number.isFinite(amount)) {
      return acc;
    }
    return acc + amount;
  }, 0);
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

const sanitizeStorageName = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');

const blobToBase64 = async (blob) => {
  if (!blob) return '';
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
  const note = delta >= 0 ? 'Auto sync from receiving' : 'Auto sync correction';
  // Stock quantities are updated via receiving_to_stock_log trigger.
  const { error: logError } = await supabase
    .from('receiving_to_stock_log')
    .insert({
      receiving_item_id: item.id,
      stock_item_id: stockRow.id,
      quantity_moved: delta,
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
  getPricingServices: async (market) => {
    const marketCode = normalizeMarketCode(market);
    let query = supabase
      .from('pricing_services')
      .select('*');
    if (marketCode) {
      query = query.eq('market', marketCode);
    }
    return await query
      .order('category', { ascending: true })
      .order('position', { ascending: true });
  },

  upsertPricingServices: async (rows, market) => {
    const marketCode = normalizeMarketCode(market) || 'FR';
    const payload = (rows || []).map((row) => ({
      ...row,
      market: row?.market || marketCode
    }));
    return await supabase
      .from('pricing_services')
      .upsert(payload, { onConflict: 'id' })
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

     const payload = { ...invoiceData, file_path: filePath };
     let { data, error } = await supabase
       .from('invoices')
       .insert(payload)
       .select()
       .single();

      const hasMissingColumnError =
        error &&
        ['document_type', 'converted_to_invoice_id', 'converted_from_proforma_id', 'document_payload', 'billing_invoice_id']
          .some((column) => isMissingColumnError(error, column));
      if (hasMissingColumnError) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.document_type;
        delete fallbackPayload.converted_to_invoice_id;
        delete fallbackPayload.converted_from_proforma_id;
        delete fallbackPayload.document_payload;
        delete fallbackPayload.billing_invoice_id;
        const retry = await supabase
          .from('invoices')
          .insert(fallbackPayload)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

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
      .upsert([payload], { onConflict: 'company_id,invoice_number' })
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

  // ===== UPS Integrations / Shipping / Invoices =====
  getUpsIntegrationForUser: async (userId) => {
    if (!userId) return { data: null, error: new Error('Missing user id') };
    const { data, error } = await supabase
      .from('ups_integrations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  },

  upsertUpsIntegration: async (payload = {}) => {
    if (!payload?.user_id) return { data: null, error: new Error('Missing user id') };
    const record = {
      id: payload.id,
      user_id: payload.user_id,
      company_id: payload.company_id || null,
      status: payload.status || 'pending',
      ups_account_number: payload.ups_account_number || null,
      account_label: payload.account_label || null,
      oauth_scope: payload.oauth_scope || null,
      connected_at: payload.connected_at || null,
      last_synced_at: payload.last_synced_at || null,
      last_error: payload.last_error || null,
      metadata: payload.metadata || {},
      created_at: payload.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('ups_integrations')
      .upsert(record, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();
    return { data, error };
  },

  listUpsIntegrations: async () => {
    const { data, error } = await supabase
      .from('ups_integrations')
      .select('*')
      .order('updated_at', { ascending: false });
    return { data: data || [], error };
  },

  listUpsShippingOrders: async ({ userId, companyId, limit = 200 } = {}) => {
    let query = supabase
      .from('ups_shipping_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (userId) query = query.eq('user_id', userId);
    if (companyId) query = query.eq('company_id', companyId);
    return await query;
  },

  createUpsShippingOrder: async (payload = {}) => {
    if (!payload?.integration_id) return { data: null, error: new Error('Missing integration id') };
    if (!payload?.user_id) return { data: null, error: new Error('Missing user id') };
    const row = {
      integration_id: payload.integration_id,
      user_id: payload.user_id,
      company_id: payload.company_id || null,
      external_order_id: payload.external_order_id || null,
      status: payload.status || 'draft',
      service_code: payload.service_code || null,
      packaging_type: payload.packaging_type || null,
      payment_type: payload.payment_type || 'BillShipper',
      currency: payload.currency || null,
      total_charge: payload.total_charge ?? null,
      tracking_number: payload.tracking_number || null,
      label_file_path: payload.label_file_path || null,
      label_format: payload.label_format || null,
      ship_from: payload.ship_from || {},
      ship_to: payload.ship_to || {},
      package_data: payload.package_data || {},
      request_payload: payload.request_payload || null,
      response_payload: payload.response_payload || null,
      last_error: payload.last_error || null
    };
    return await supabase
      .from('ups_shipping_orders')
      .insert(row)
      .select('*')
      .single();
  },

  updateUpsShippingOrder: async (orderId, patch = {}) => {
    if (!orderId) return { data: null, error: new Error('Missing order id') };
    return await supabase
      .from('ups_shipping_orders')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('*')
      .maybeSingle();
  },

  processUpsShippingLabel: async ({ order_id, integration_id } = {}) => {
    if (!order_id) return { data: null, error: new Error('Missing order_id') };
    return await supabase.functions.invoke('ups-create-label', {
      body: { order_id, integration_id: integration_id || null }
    });
  },

  getUpsRateQuote: async (payload = {}) => {
    return await supabase.functions.invoke('ups-rate-quote', {
      body: payload || {}
    });
  },

  listUpsInvoiceFiles: async ({ userId, companyId, integrationId, orderId, limit = 300 } = {}) => {
    let query = supabase
      .from('ups_invoice_files')
      .select('*, order:ups_shipping_orders(id, external_order_id, tracking_number, service_code, status, created_at)')
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (userId) query = query.eq('user_id', userId);
    if (companyId) query = query.eq('company_id', companyId);
    if (integrationId) query = query.eq('integration_id', integrationId);
    if (orderId) query = query.eq('order_id', orderId);
    let result = await query;
    if (result.error && /relationship|foreign key|ups_shipping_orders/i.test(String(result.error.message || ''))) {
      let fallback = supabase
        .from('ups_invoice_files')
        .select('*')
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      if (userId) fallback = fallback.eq('user_id', userId);
      if (companyId) fallback = fallback.eq('company_id', companyId);
      if (integrationId) fallback = fallback.eq('integration_id', integrationId);
      if (orderId) fallback = fallback.eq('order_id', orderId);
      result = await fallback;
    }
    return result;
  },

  uploadUpsInvoiceFile: async ({
    file,
    integration_id,
    user_id,
    company_id,
    order_id = null,
    invoice_number = null,
    invoice_date = null,
    currency = 'EUR',
    amount_total = null,
    source = 'manual',
    status = 'received',
    payload = null
  } = {}) => {
    if (!integration_id) return { data: null, error: new Error('Missing integration_id') };
    if (!user_id) return { data: null, error: new Error('Missing user_id') };
    if (!company_id) return { data: null, error: new Error('Missing company_id') };
    if (!file) return { data: null, error: new Error('Missing file') };

    const ext = (file.name?.split('.').pop() || 'pdf').toLowerCase();
    const baseName = sanitizeStorageName(invoice_number || file.name || 'ups-invoice');
    const fileName = `${Date.now()}-${baseName}.${ext}`;
    const filePath = `${company_id}/invoices/${fileName}`;
    const upload = await supabase.storage
      .from('ups-documents')
      .upload(filePath, file, { upsert: true, cacheControl: '3600' });
    if (upload.error) return { data: null, error: upload.error };

    const { data, error } = await supabase
      .from('ups_invoice_files')
      .insert({
        integration_id,
        order_id,
        user_id,
        company_id,
        invoice_number,
        invoice_date,
        currency,
        amount_total,
        file_path: filePath,
        file_name: file.name || fileName,
        source,
        status,
        payload: payload || {}
      })
      .select('*')
      .single();
    return { data, error };
  },

  downloadUpsDocument: async (filePath) => {
    if (!filePath) return { data: null, error: new Error('Missing file path') };
    return await supabase.storage
      .from('ups-documents')
      .download(filePath);
  },

  getUpsDocumentSignedUrl: async (filePath, expiresIn = 60 * 60) => {
    if (!filePath) return { data: null, error: new Error('Missing file path') };
    return await supabase.storage
      .from('ups-documents')
      .createSignedUrl(filePath, expiresIn);
  },

  listUpsPostalCodes: async ({ countryCode, postalCode } = {}) => {
    let query = supabase
      .from('ups_postal_codes')
      .select('*')
      .order('country_code', { ascending: true })
      .order('postal_code', { ascending: true })
      .limit(500);
    if (countryCode) query = query.eq('country_code', String(countryCode).toUpperCase());
    if (postalCode) query = query.eq('postal_code', String(postalCode).trim());
    return await query;
  },

  searchUpsPostalCodes: async ({ countryCode, postalPrefix, cityPrefix, limit = 30 } = {}) => {
    let query = supabase
      .from('ups_postal_codes')
      .select('country_code,postal_code,city,state_code,is_serviceable')
      .order('postal_code', { ascending: true })
      .limit(Math.max(1, Math.min(200, Number(limit) || 30)));
    if (countryCode) query = query.eq('country_code', String(countryCode).trim().toUpperCase());
    if (postalPrefix) query = query.ilike('postal_code', `${String(postalPrefix).trim()}%`);
    if (cityPrefix) query = query.ilike('city', `${String(cityPrefix).trim()}%`);
    return await query;
  },

  listUpsPostalCountries: async ({ limit = 5000 } = {}) => {
    const { data, error } = await supabase
      .from('ups_postal_codes')
      .select('country_code')
      .limit(Math.max(10, Math.min(10000, Number(limit) || 5000)));
    if (error) return { data: [], error };
    const unique = Array.from(
      new Set((data || []).map((row) => String(row.country_code || '').trim().toUpperCase()).filter(Boolean))
    ).sort();
    return { data: unique, error: null };
  },

  // ===== Client Activity =====
  listFbaLinesByCompany: async (companyId, country) => {
    const run = async (useCountry, withInvoice = true) => {
      let query = supabase
        .from('fba_lines')
        .select(
          withInvoice
            ? '*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)'
            : '*'
        )
        .eq('company_id', companyId);
      if (useCountry) query = query.eq('country', useCountry);
      return await query.order('service_date', { ascending: false });
    };
    let { data, error } = await run(country, true);
    if (error && /relationship|foreign key|billing_invoice/i.test(String(error.message || ''))) {
      const fallback = await run(country, false);
      data = fallback.data;
      error = fallback.error;
    }
    if (error && country && isMissingColumnError(error, 'country')) {
      return await run(null, true);
    }
    return { data, error };
  },

  listFbmLinesByCompany: async (companyId, country) => {
    const run = async (useCountry, withInvoice = true) => {
      let query = supabase
        .from('fbm_lines')
        .select(
          withInvoice
            ? '*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)'
            : '*'
        )
        .eq('company_id', companyId);
      if (useCountry) query = query.eq('country', useCountry);
      return await query.order('service_date', { ascending: false });
    };
    let { data, error } = await run(country, true);
    if (error && /relationship|foreign key|billing_invoice/i.test(String(error.message || ''))) {
      const fallback = await run(country, false);
      data = fallback.data;
      error = fallback.error;
    }
    if (error && country && isMissingColumnError(error, 'country')) {
      return await run(null, true);
    }
    return { data, error };
  },

  listOtherLinesByCompany: async (companyId, country) => {
    const run = async (useCountry, withInvoice = true) => {
      let query = supabase
        .from('other_lines')
        .select(
          withInvoice
            ? '*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)'
            : '*'
        )
        .eq('company_id', companyId);
      if (useCountry) query = query.eq('country', useCountry);
      return await query.order('service_date', { ascending: false });
    };
    let { data, error } = await run(country, true);
    if (error && /relationship|foreign key|billing_invoice/i.test(String(error.message || ''))) {
      const fallback = await run(country, false);
      data = fallback.data;
      error = fallback.error;
    }
    if (error && country && isMissingColumnError(error, 'country')) {
      return await run(null, true);
    }
    return { data, error };
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
      const warehouseCountry = (
        draftData.warehouse_country ||
        draftData.warehouseCountry ||
        draftData.market ||
        draftData.country ||
        'FR'
      ).toUpperCase();
      // 1) Insert header cu user_id + destination_country normalizat
      const headerPayload = {
        company_id: draftData.company_id,
        user_id:
          draftData.user_id ??
          (await supabase.auth.getUser()).data?.user?.id ??
          null,
        destination_country: normalizePrepDestinationCountry(
          draftData.destination_country || draftData.country
        ),
        warehouse_country: warehouseCountry,
        status: 'pending',
      };
      let { data: request, error: requestError } = await supabase
        .from('prep_requests')
        .insert(headerPayload)
        .select()
        .single();
      if (requestError && isMissingColumnError(requestError, 'warehouse_country')) {
        const { warehouse_country, ...fallback } = headerPayload;
        const retry = await supabase
          .from('prep_requests')
          .insert(fallback)
          .select()
          .single();
        request = retry.data;
        requestError = retry.error;
      }

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
    const isWarehouseColumnMissing = (error) =>
      isMissingColumnError(error, 'warehouse_country');
    const listSelect = `
      id,
      created_at,
      completed_at,
      confirmed_at,
      status,
      destination_country,
      warehouse_country,
      fba_shipment_id,
      amazon_reference_id,
      amazon_shipment_name,
      amazon_destination_code,
      amazon_status,
      amazon_snapshot,
      step2_shipments,
      step2_confirmed_at,
      step4_confirmed_at,
      prep_request_tracking(tracking_id),
      profiles(first_name, last_name, email, company_name, store_name),
      companies(name)
    `;
    let query = supabase
      .from('prep_requests')
      .select(listSelect, { count: 'planned' });

    if (options.status) {
      query = query.eq('status', options.status);
    }
    const filterCountry = options.warehouseCountry || options.destinationCountry;
    if (filterCountry) {
      query = query.eq('warehouse_country', filterCountry);
    }

    if (options.page && options.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }

    query = query.order('created_at', { ascending: false });

    let { data, error, count } = await query;
    if (error && isWarehouseColumnMissing(error) && filterCountry) {
      let retry = supabase
        .from('prep_requests')
        .select(listSelect, { count: 'planned' });
      if (options.status) {
        retry = retry.eq('status', options.status);
      }
      if (options.page && options.pageSize) {
        const from = (options.page - 1) * options.pageSize;
        const to = from + options.pageSize - 1;
        retry = retry.range(from, to);
      }
      retry = retry.order('created_at', { ascending: false });
      const retryRes = await retry;
      data = retryRes.data;
      error = retryRes.error;
      count = retryRes.count;
    }
    
    if (error) return { data: [], error, count: 0 };

    const processed = (data || []).map((r) => {
      const profileFirstName = r.profiles?.first_name || '';
      const profileLastName = r.profiles?.last_name || '';
      const profileCompany = r.profiles?.company_name || null;
      const profileStore = r.profiles?.store_name || null;
      const companyFallback = r.companies?.name || null;
      return {
        ...r,
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

  sendInvoiceEmail: async (payload, pdfBlob) => {
    try {
      const attachmentBase64 = pdfBlob ? await blobToBase64(pdfBlob) : '';
      const body = {
        ...payload,
        attachment_base64: attachmentBase64 || undefined
      };
      const { error } = await supabase.functions.invoke('send_invoice_email', { body });
      return { error: error || null };
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
    endDate,
    country
  } = {}) => {
    const isWarehouseMissing = (error) => isMissingColumnError(error, 'warehouse_country');

    const normalizeDate = (value) => {
      if (!value) return formatSqlDate();
      const str = String(value).trim();
      // accept DD.MM.YYYY / DD-MM-YYYY / DD/MM/YYYY from UI date pickers
      const m = str.match(/^(\d{2})[\\.\\/-](\d{2})[\\.\\/-](\d{4})$/);
      if (m) {
        const [, dd, mm, yyyy] = m;
        return `${yyyy}-${mm}-${dd}`;
      }
      try {
        return formatSqlDate(new Date(str));
      } catch {
        return str.slice(0, 10);
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
    const marketCode = normalizeMarketCode(country);
    const withCountry = (query, column = 'country') => {
      if (!marketCode) return query;
      return query.eq(column, marketCode);
    };

    const stockPromise = withCompany(
      supabase
        .from('stock_items')
        .select('id, qty, prep_qty_by_country, length_cm, width_cm, height_cm, amazon_stock, amazon_reserved, amazon_inbound, amazon_unfulfillable')
    ).limit(20000);
    const stockAllPromise = supabase
      .from('stock_items')
      .select('qty, prep_qty_by_country')
      .limit(20000);
    // client_stock_items view nu are coloana qty; evităm apelul direct ca să nu generăm 400
    const clientStockPromise = Promise.resolve({ data: [], error: null });
    const stockTotalRpcPromise = supabase.rpc('get_total_stock_units');
    const stockTotalByCountryRpcPromise = marketCode
      ? supabase.rpc('get_total_stock_units_by_country', { p_country: marketCode })
      : Promise.resolve({ data: null, error: null });

    const invoicesPromise = withCountry(
      withCompany(
        supabase
          .from('invoices')
          .select('id, status, amount, issue_date')
      )
    )
      .gte('issue_date', dateFrom)
      .lte('issue_date', dateTo)
      .limit(5000);

    const returnsPromise = withCountry(
      withCompany(
        supabase
          .from('returns')
          .select('id, status, created_at')
      ),
      'warehouse_country'
    )
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(2000);

    const prepPromise = withCountry(
      withCompany(
        supabase
          .from('prep_requests')
          .select('id, status, confirmed_at')
          .eq('status', 'confirmed')
      ),
      'warehouse_country'
    )
      .gte('confirmed_at', startIso)
      .lte('confirmed_at', endIso)
      .limit(5000);

    const receivingPromise = withCountry(
      withCompany(
        supabase
          .from('receiving_shipments')
          .select('id, status, received_at, created_at')
          .in('status', ['received', 'Received', 'RECEIVED'])
      ),
      'warehouse_country'
    )
      .gte('received_at', startIso)
      .lte('received_at', endIso)
      .limit(5000);

    let prepItemsQuery = supabase
      .from('prep_request_items')
      .select('units_requested, units_sent, prep_requests!inner(confirmed_at, company_id, status, warehouse_country, step4_confirmed_at)');
    const prepItemsPromise = prepItemsQuery
      .gte('prep_requests.confirmed_at', startIso)
      .lte('prep_requests.confirmed_at', endIso)
      .limit(10000);
    let pendingItemsQuery = supabase
      .from('prep_request_items')
      .select('units_requested, units_sent, prep_requests!inner(id, created_at, company_id, status, warehouse_country)')
      .eq('prep_requests.status', 'pending');
    const pendingItemsPromise = pendingItemsQuery
      .gte('prep_requests.created_at', startIso)
      .lte('prep_requests.created_at', endIso)
      .limit(10000);

    // Reception units – unități efectiv intrate în stock (log de mișcări)
    let receivingItemsQuery = supabase
      .from('receiving_to_stock_log')
      .select(
        'quantity_moved, moved_at, receiving_items!inner(id, shipment_id, receiving_shipments!inner(company_id, warehouse_country))'
      );
    if (marketCode) {
      receivingItemsQuery = receivingItemsQuery.eq('receiving_items.receiving_shipments.warehouse_country', marketCode);
    }
    if (companyId) {
      receivingItemsQuery = receivingItemsQuery.eq('receiving_items.receiving_shipments.company_id', companyId);
    }
    receivingItemsQuery = receivingItemsQuery
      .gte('moved_at', startIso)
      .lte('moved_at', endIso)
      .limit(20000);
    const receivingItemsPromise = receivingItemsQuery;

    const balancePromise = userId
      ? supabase.from('profiles').select('current_balance').eq('id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const fbaStandalonePromise = withCountry(
      withCompany(
        supabase
          .from('fba_lines')
          .select('id, total, unit_price, units, service_date, prep_request_id, obs_admin')
      )
    )
      .is('prep_request_id', null)
      .gte('service_date', dateFrom)
      .lte('service_date', dateTo)
      .limit(20000);
    const finalizedPrepRequestsPromise = withCountry(
      withCompany(
        supabase
          .from('prep_requests')
          .select('id, fba_shipment_id, completed_at, step4_confirmed_at, confirmed_at')
          .eq('status', 'confirmed')
      )
    )
      .gte('completed_at', startIso)
      .lte('completed_at', endIso)
      .limit(20000);
    const fbmLinesPromise = withCountry(
      withCompany(
        supabase
          .from('fbm_lines')
          .select('total, unit_price, orders_units, service_date')
      )
    )
      .gte('service_date', dateFrom)
      .lte('service_date', dateTo)
      .limit(20000);
    const otherLinesPromise = withCountry(
      withCompany(
        supabase
          .from('other_lines')
          .select('total, unit_price, units, service_date')
      )
    )
      .gte('service_date', dateFrom)
      .lte('service_date', dateTo)
      .limit(20000);

    let [stockRes, stockAllRes, clientStockRes, stockTotalRpcRes, stockTotalByCountryRpcRes, invoicesRes, returnsRes, prepRes, receivingRes, prepItemsRes, receivingItemsRes, fbaStandaloneRes, finalizedPrepRequestsRes, fbmLinesRes, otherLinesRes, balanceRes] = await Promise.all([
      stockPromise,
      stockAllPromise,
      clientStockPromise,
      stockTotalRpcPromise,
      stockTotalByCountryRpcPromise,
      invoicesPromise,
      returnsPromise,
      prepPromise,
      receivingPromise,
      prepItemsPromise,
      receivingItemsPromise,
      fbaStandalonePromise,
      finalizedPrepRequestsPromise,
      fbmLinesPromise,
      otherLinesPromise,
      balancePromise
    ]);
    let pendingItemsRes = await pendingItemsPromise;
    if (fbaStandaloneRes?.error && isMissingColumnError(fbaStandaloneRes.error, 'prep_request_id')) {
      fbaStandaloneRes = await withCountry(
        withCompany(
          supabase
            .from('fba_lines')
            .select('id, total, unit_price, units, service_date, obs_admin')
        )
      )
        .gte('service_date', dateFrom)
        .lte('service_date', dateTo)
        .limit(20000);
    }
    if (finalizedPrepRequestsRes?.error && isMissingColumnError(finalizedPrepRequestsRes.error, 'completed_at')) {
      finalizedPrepRequestsRes = await withCountry(
        withCompany(
          supabase
            .from('prep_requests')
            .select('id, fba_shipment_id, step4_confirmed_at, confirmed_at')
            .eq('status', 'confirmed')
        )
      )
        .gte('confirmed_at', startIso)
        .lte('confirmed_at', endIso)
        .limit(20000);
    }
    const needsWarehouseRetry =
      marketCode &&
      [returnsRes, prepRes, receivingRes, prepItemsRes, receivingItemsRes]
        .some((res) => isWarehouseMissing(res?.error));
    if (needsWarehouseRetry) {
      const returnsRetry = withCompany(
        supabase
          .from('returns')
          .select('id, status, created_at')
      )
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .limit(2000);
      const prepRetry = withCompany(
        supabase
          .from('prep_requests')
          .select('id, status, confirmed_at')
          .eq('status', 'confirmed')
      )
        .gte('confirmed_at', startIso)
        .lte('confirmed_at', endIso)
        .limit(5000);
      const receivingRetry = withCompany(
        supabase
          .from('receiving_shipments')
          .select('id, status, received_at, created_at')
          .in('status', ['received', 'Received', 'RECEIVED'])
      )
        .gte('received_at', startIso)
        .lte('received_at', endIso)
        .limit(5000);
      const prepItemsRetry = supabase
        .from('prep_request_items')
        .select('units_requested, units_sent, prep_requests!inner(confirmed_at, company_id, status, step4_confirmed_at)')
        .limit(10000);
      const pendingItemsRetry = supabase
        .from('prep_request_items')
        .select('units_requested, units_sent, prep_requests!inner(id, created_at, company_id, status)')
        .eq('prep_requests.status', 'pending')
        .gte('prep_requests.created_at', startIso)
        .lte('prep_requests.created_at', endIso)
        .limit(10000);
      let receivingItemsRetry = supabase
        .from('receiving_to_stock_log')
        .select('quantity_moved, moved_at, receiving_items!inner(id, shipment_id, receiving_shipments!inner(company_id))')
        .gte('moved_at', startIso)
        .lte('moved_at', endIso)
        .limit(20000);
      if (companyId) {
        receivingItemsRetry = receivingItemsRetry.eq('receiving_items.receiving_shipments.company_id', companyId);
      }
      const [returnsRetryRes, prepRetryRes, receivingRetryRes, prepItemsRetryRes, pendingItemsRetryRes, receivingItemsRetryRes] =
        await Promise.all([
          returnsRetry,
          prepRetry,
          receivingRetry,
          prepItemsRetry,
          pendingItemsRetry,
          receivingItemsRetry
        ]);
      if (isWarehouseMissing(returnsRes?.error)) returnsRes = returnsRetryRes;
      if (isWarehouseMissing(prepRes?.error)) prepRes = prepRetryRes;
      if (isWarehouseMissing(receivingRes?.error)) receivingRes = receivingRetryRes;
      if (isWarehouseMissing(prepItemsRes?.error)) prepItemsRes = prepItemsRetryRes;
      if (isWarehouseMissing(pendingItemsRes?.error)) {
        pendingItemsRes = pendingItemsRetryRes;
      }
      if (isWarehouseMissing(receivingItemsRes?.error)) receivingItemsRes = receivingItemsRetryRes;
    }

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

    let stockRows = Array.isArray(stockRes.data) ? stockRes.data : [];
    if (marketCode) {
      stockRows = mapStockRowsForMarket(stockRows, marketCode);
    }
    const inventoryUnits = stockRows.reduce((acc, row) => acc + Math.max(0, numberOrZero(row.qty)), 0);
    const activeSkus = stockRows.filter((row) => numberOrZero(row.qty) > 0).length;
    const inventoryVolume = stockRows.reduce(
      (acc, row) => acc + volumeForRow(row) * Math.max(0, numberOrZero(row.qty)),
      0
    );
    let stockAllRows = Array.isArray(stockAllRes.data) ? stockAllRes.data : [];
    if (marketCode) {
      stockAllRows = mapStockRowsForMarket(stockAllRows, marketCode);
    }
    const inventoryUnitsAll = stockAllRows.reduce(
      (acc, row) => acc + Math.max(0, numberOrZero(row.qty)),
      0
    );
    const inventoryUnitsClientView = (Array.isArray(clientStockRes.data) ? clientStockRes.data : []).reduce(
      (acc, row) => acc + Math.max(0, numberOrZero(row.qty)),
      0
    );
    const parseRpcTotal = (res) => {
      if (!res || res.error || res.data == null) return null;
      return numberOrZero(
        Array.isArray(res.data) ? res.data[0]?.total_qty : res.data.total_qty
      );
    };
    const inventoryUnitsRpc = marketCode
      ? parseRpcTotal(stockTotalByCountryRpcRes)
      : parseRpcTotal(stockTotalRpcRes);

    const fbaInStockRaw = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_stock), 0);
    const fbaReservedRaw = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_reserved), 0);
    const fbaIncomingRaw = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_inbound), 0);
    const fbaUnfulfillableRaw = stockRows.reduce((acc, row) => acc + numberOrZero(row.amazon_unfulfillable), 0);
    // amazon_* nu sunt pe țară; pentru market specific folosim qty per țară (prep_qty_by_country)
    const fbaInStock = marketCode ? inventoryUnits : fbaInStockRaw;
    const fbaReserved = marketCode ? 0 : fbaReservedRaw;
    const fbaIncoming = marketCode ? 0 : fbaIncomingRaw;
    const fbaUnfulfillable = marketCode ? 0 : fbaUnfulfillableRaw;

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
    const pendingItemRows = Array.isArray(pendingItemsRes?.data) ? pendingItemsRes.data : [];
    const receivingItemRows = Array.isArray(receivingItemsRes.data) ? receivingItemsRes.data : [];
    const fbaStandaloneLines = Array.isArray(fbaStandaloneRes.data) ? fbaStandaloneRes.data : [];
    const finalizedPrepRequestsRows = Array.isArray(finalizedPrepRequestsRes.data) ? finalizedPrepRequestsRes.data : [];
    const fbmLines = Array.isArray(fbmLinesRes.data) ? fbmLinesRes.data : [];
    const otherLines = Array.isArray(otherLinesRes.data) ? otherLinesRes.data : [];
    const fbaFinalizedDateByRequestId = new Map();
    const fbaFinalizedDateByShipmentId = new Map();
    finalizedPrepRequestsRows.forEach((row) => {
      const effectiveDate = row?.completed_at || row?.step4_confirmed_at || row?.confirmed_at || null;
      if (!effectiveDate) return;
      const day = String(effectiveDate).slice(0, 10);
      fbaFinalizedDateByRequestId.set(row.id, day);
      const shipmentId = (row?.fba_shipment_id || '').trim();
      if (shipmentId) fbaFinalizedDateByShipmentId.set(shipmentId, day);
    });

    const fbaPrepRequestIds = Array.from(fbaFinalizedDateByRequestId.keys());
    const fbaPrepRequestLines = [];
    if (fbaPrepRequestIds.length) {
      const chunkSize = 500;
      for (let i = 0; i < fbaPrepRequestIds.length; i += chunkSize) {
        const idChunk = fbaPrepRequestIds.slice(i, i + chunkSize);
        let chunkQuery = withCompany(
          supabase
            .from('fba_lines')
            .select('id, total, unit_price, units, service_date, prep_request_id, obs_admin')
        )
          .in('prep_request_id', idChunk)
          .limit(20000);
        const chunkRes = await chunkQuery;
        if (chunkRes?.error && !isMissingColumnError(chunkRes.error, 'prep_request_id')) {
          throw chunkRes.error;
        }
        if (!chunkRes?.error) {
          fbaPrepRequestLines.push(...(Array.isArray(chunkRes.data) ? chunkRes.data : []));
        }
      }
    }

    const fbaLegacyLinesByShipment = [];
    const shipmentIds = Array.from(fbaFinalizedDateByShipmentId.keys());
    if (shipmentIds.length) {
      const chunkSize = 500;
      for (let i = 0; i < shipmentIds.length; i += chunkSize) {
        const shipmentChunk = shipmentIds.slice(i, i + chunkSize);
        const chunkRes = await withCompany(
          supabase
            .from('fba_lines')
            .select('id, total, unit_price, units, service_date, prep_request_id, obs_admin')
        )
          .is('prep_request_id', null)
          .in('obs_admin', shipmentChunk)
          .limit(20000);
        if (chunkRes?.error) throw chunkRes.error;
        fbaLegacyLinesByShipment.push(...(Array.isArray(chunkRes.data) ? chunkRes.data : []));
      }
    }

    const isDateWithinRange = (value) => {
      if (!value) return false;
      const d = String(value).slice(0, 10);
      return d >= dateFrom && d <= dateTo;
    };
    const dedupedFbaLines = Array.from(
      new Map(
        [...fbaStandaloneLines, ...fbaPrepRequestLines, ...fbaLegacyLinesByShipment].map((row) => [row?.id || JSON.stringify(row), row])
      ).values()
    );
    const fbaLinesForFinance = dedupedFbaLines.map((row) => {
      const requestId = row?.prep_request_id || null;
      const finalizedDate = requestId ? fbaFinalizedDateByRequestId.get(requestId) : null;
      if (finalizedDate) return { ...row, service_date: finalizedDate };
      const shipmentId = String(row?.obs_admin || '').trim();
      const shipmentFinalizedDate = shipmentId ? fbaFinalizedDateByShipmentId.get(shipmentId) : null;
      if (shipmentFinalizedDate) return { ...row, service_date: shipmentFinalizedDate };
      return row;
    }).filter((row) => isDateWithinRange(row?.service_date));

    const filterCompanyJoin = (rows, extractor) => {
      if (!companyId) return rows;
      return rows.filter((row) => extractor(row) === companyId);
    };
    const prepItemsBase = (Array.isArray(prepItemRows) ? prepItemRows : []).filter((r) => r?.prep_requests);
    const pendingItemsBase = (Array.isArray(pendingItemRows) ? pendingItemRows : []).filter((r) => r?.prep_requests);
    const prepItemsMarket = marketCode
      ? prepItemsBase.filter((r) => normalizeMarketCode(r.prep_requests?.warehouse_country) === marketCode)
      : prepItemsBase;
    const pendingItemsMarket = marketCode
      ? pendingItemsBase.filter((r) => normalizeMarketCode(r.prep_requests?.warehouse_country) === marketCode)
      : pendingItemsBase;
    const prepItemsByCompany = filterCompanyJoin(prepItemsMarket, (r) => r.prep_requests?.company_id);
    const pendingItemsByCompany = filterCompanyJoin(pendingItemsMarket, (r) => r.prep_requests?.company_id);
    const inRangeDate = (value) => {
      if (!value) return false;
      const d = String(value).slice(0, 10);
      return d >= dateFrom && d <= dateTo;
    };
    const pickUnits = (row) => {
      const sent = numberOrZero(row.units_sent);
      const requested = numberOrZero(row.units_requested);
      return sent > 0 ? sent : requested;
    };
    const preparedItems = prepItemsByCompany.filter((row) => inRangeDate(row.prep_requests?.confirmed_at));
    let filteredShippedItems = prepItemsByCompany.filter((row) => inRangeDate(row.prep_requests?.step4_confirmed_at));
    const filteredReceivingItems = receivingItemRows;
    const pendingUnitsTotal = pendingItemsByCompany.reduce(
      (acc, row) => acc + pickUnits(row),
      0
    );
    const pendingShipmentsTotal = new Set(
      pendingItemsByCompany.map((row) => row.prep_requests?.id).filter(Boolean)
    ).size;

    const prepUnitsTotal = preparedItems.reduce(
      (acc, row) => acc + pickUnits(row),
      0
    );
    const prepUnitsToday = preparedItems
      .filter((row) => (row.prep_requests?.confirmed_at || '').slice(0, 10) === dateFrom)
      .reduce((acc, row) => acc + pickUnits(row), 0);

    let shippedUnitsTotal = filteredShippedItems.reduce(
      (acc, row) => acc + pickUnits(row),
      0
    );
    let shippedShipmentsTotal = new Set(
      filteredShippedItems.map((row) => row.prep_requests?.id).filter(Boolean)
    ).size;
    let shippedUnitsToday = filteredShippedItems
      .filter((row) => (row.prep_requests?.step4_confirmed_at || '').slice(0, 10) === dateFrom)
      .reduce((acc, row) => acc + pickUnits(row), 0);

    const getReceivingDate = (row) =>
      (row.moved_at || '').slice(0, 10);

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
      fba: sumAmount(fbaLinesForFinance, 'service_date', 'units'),
      fbm: sumAmount(fbmLines, 'service_date', 'orders_units'),
      other: sumAmount(otherLines, 'service_date', 'units')
    };
    const financeAmountsToday = {
      fba: sumAmountByDate(fbaLinesForFinance, 'service_date', 'units'),
      fbm: sumAmountByDate(fbmLines, 'service_date', 'orders_units'),
      other: sumAmountByDate(otherLines, 'service_date', 'units')
    };
    const financeAmountsTodayAbsolute = {
      fba: sumAmountByExactDate(fbaLinesForFinance, 'service_date', 'units', endKey),
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
      [...fbaLinesForFinance, ...fbmLines, ...otherLines],
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
      preparedItems,
      (row) => (row.prep_requests?.confirmed_at || '').slice(0, 10),
      (row) => pickUnits(row)
    );
    let shippedDailyUnits = buildDailyUnits(
      filteredShippedItems,
      (row) => (row.prep_requests?.step4_confirmed_at || '').slice(0, 10),
      (row) => pickUnits(row)
    );

    const shippedDayById = new Map();
    const shippedPriorityById = new Map();
    const setShippedDay = (id, dateValue, priority) => {
      if (!id || !dateValue) return;
      const day = String(dateValue).slice(0, 10);
      if (!day) return;
      const prevPriority = shippedPriorityById.get(id) || 0;
      if (priority >= prevPriority) {
        shippedPriorityById.set(id, priority);
        shippedDayById.set(id, day);
      }
    };

    let step4ReqQuery = supabase
      .from('prep_requests')
      .select('id, step4_confirmed_at, company_id, warehouse_country')
      .gte('step4_confirmed_at', startIso)
      .lte('step4_confirmed_at', endIso)
      .limit(10000);
    if (companyId) step4ReqQuery = step4ReqQuery.eq('company_id', companyId);
    if (marketCode) step4ReqQuery = step4ReqQuery.eq('warehouse_country', marketCode);

    let confirmedReqQuery = supabase
      .from('prep_requests')
      .select('id, confirmed_at, company_id, warehouse_country')
      .gte('confirmed_at', startIso)
      .lte('confirmed_at', endIso)
      .limit(10000);
    if (companyId) confirmedReqQuery = confirmedReqQuery.eq('company_id', companyId);
    if (marketCode) confirmedReqQuery = confirmedReqQuery.eq('warehouse_country', marketCode);

    let trackingQuery = supabase
      .from('prep_request_tracking')
      .select('request_id, added_at')
      .gte('added_at', startIso)
      .lte('added_at', endIso)
      .limit(20000);

    const [step4ReqRes, confirmedReqRes, trackingRes] = await Promise.all([
      step4ReqQuery,
      confirmedReqQuery,
      trackingQuery
    ]);

    const step4Reqs = Array.isArray(step4ReqRes.data) ? step4ReqRes.data : [];
    const confirmedReqs = Array.isArray(confirmedReqRes.data) ? confirmedReqRes.data : [];
    const trackingRows = Array.isArray(trackingRes.data) ? trackingRes.data : [];

    step4Reqs.forEach((row) => setShippedDay(row.id, row.step4_confirmed_at, 3));
    confirmedReqs.forEach((row) => setShippedDay(row.id, row.confirmed_at, 1));

    const trackingIds = Array.from(new Set(trackingRows.map((row) => row.request_id).filter(Boolean)));
    if (trackingIds.length) {
      let trackingReqQuery = supabase
        .from('prep_requests')
        .select('id, company_id, warehouse_country')
        .in('id', trackingIds)
        .limit(10000);
      if (companyId) trackingReqQuery = trackingReqQuery.eq('company_id', companyId);
      if (marketCode) trackingReqQuery = trackingReqQuery.eq('warehouse_country', marketCode);
      const trackingReqRes = await trackingReqQuery;
      const trackingReqs = Array.isArray(trackingReqRes.data) ? trackingReqRes.data : [];
      const trackingReqSet = new Set(trackingReqs.map((row) => row.id));
      const trackingDateById = new Map();
      trackingRows.forEach((row) => {
        if (!trackingReqSet.has(row.request_id)) return;
        const day = String(row.added_at || '').slice(0, 10);
        if (!day) return;
        const prev = trackingDateById.get(row.request_id);
        if (!prev || day < prev) trackingDateById.set(row.request_id, day);
      });
      trackingDateById.forEach((day, id) => setShippedDay(id, day, 2));
    }

    const shippedIds = Array.from(shippedDayById.keys());
    shippedShipmentsTotal = shippedIds.length;

    if (shippedIds.length) {
      const itemsRes = await supabase
        .from('prep_request_items')
        .select('prep_request_id, units_requested, units_sent')
        .in('prep_request_id', shippedIds)
        .limit(20000);
      const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];
      filteredShippedItems = items.map((it) => ({
        ...it,
        prep_requests: { id: it.prep_request_id, step4_confirmed_at: shippedDayById.get(it.prep_request_id) }
      }));
      shippedUnitsTotal = filteredShippedItems.reduce(
        (acc, row) => acc + pickUnits(row),
        0
      );
      shippedUnitsToday = filteredShippedItems
        .filter((row) => (row.prep_requests?.step4_confirmed_at || '').slice(0, 10) === dateFrom)
        .reduce((acc, row) => acc + pickUnits(row), 0);
      shippedDailyUnits = buildDailyUnits(
        filteredShippedItems,
        (row) => (row.prep_requests?.step4_confirmed_at || '').slice(0, 10),
        (row) => pickUnits(row)
      );
    } else {
      filteredShippedItems = [];
      shippedUnitsTotal = 0;
      shippedUnitsToday = 0;
      shippedDailyUnits = buildDailyUnits([], () => null, () => 0);
    }
    const receivingDailyUnits = buildDailyUnits(
      receivingItemsInRange,
      (row) => getReceivingDate(row),
      (row) => row.quantity_moved ?? row.quantity
    );

    return {
      data: {
        dateFrom,
        dateTo,
        inventory: {
          units: inventoryUnits,
          unitsAll: marketCode
            ? (inventoryUnitsRpc ?? inventoryUnitsAll)
            : (inventoryUnitsRpc ?? inventoryUnitsClientView ?? inventoryUnitsAll),
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
        shipped: {
          unitsToday: shippedUnitsToday,
          unitsTotal: shippedUnitsTotal,
          shipmentsTotal: shippedShipmentsTotal,
          dailyUnits: shippedDailyUnits
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
        },
        ordersPending: {
          unitsTotal: pendingUnitsTotal,
          shipmentsTotal: pendingShipmentsTotal
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
  getCompanyLiveBalance: async (companyId, market) => {
    if (!companyId) return { data: 0, error: null };
    const marketCode = normalizeMarketCode(market);
    const withCountry = (query) =>
      marketCode ? query.eq('country', marketCode) : query;

    const [fbaRes, fbmRes, otherRes, invoicesRes] = await Promise.all([
      withCountry(
        supabase
          .from('fba_lines')
          .select('unit_price, units, total')
          .eq('company_id', companyId)
      ),
      withCountry(
        supabase
          .from('fbm_lines')
          .select('unit_price, orders_units, total')
          .eq('company_id', companyId)
      ),
      withCountry(
        supabase
          .from('other_lines')
          .select('unit_price, units, total')
          .eq('company_id', companyId)
      ),
      withCountry(
        supabase
          .from('invoices')
          .select('amount, status')
          .eq('company_id', companyId)
      )
    ]);

    const error =
      fbaRes.error ||
      fbmRes.error ||
      otherRes.error ||
      invoicesRes.error ||
      null;
    if (error) return { data: 0, error };

    const services =
      sumLineRows(fbaRes.data, 'units') +
      sumLineRows(fbmRes.data, 'orders_units') +
      sumLineRows(otherRes.data, 'units');
    const paid = sumPaidInvoices(invoicesRes.data);
    return { data: services - paid, error: null };
  },
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

  getInventoryStaleness: async (market) => {
    try {
      const marketCode = normalizeMarketCode(market);
      if (!marketCode) {
        const { data, error } = await supabase.rpc('get_inventory_staleness');
        if (!error) return { data: Array.isArray(data) ? data : [], error: null };
      }

      // Fallback dacă funcția nu există în schema cache
      const [companiesRes, stockRes, recvRes] = await Promise.all([
        supabase.from('companies').select('id,name').limit(1000),
        supabase.from('stock_items').select('company_id, qty, prep_qty_by_country').limit(50000),
        (() => {
          let query = supabase
            .from('receiving_shipments')
            .select('company_id, processed_at, received_at, submitted_at, created_at, warehouse_country')
            .limit(20000);
          if (marketCode) {
            query = query.eq('warehouse_country', marketCode);
          }
          return query;
        })()
      ]);

      const companies = Array.isArray(companiesRes.data) ? companiesRes.data : [];
      let stockRows = Array.isArray(stockRes.data) ? stockRes.data : [];
      const recvRows = Array.isArray(recvRes.data) ? recvRes.data : [];

      if (marketCode) {
        stockRows = mapStockRowsForMarket(stockRows, marketCode);
      }

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
    } catch (e) {
      if (isMissingColumnError(e, 'warehouse_country')) {
        try {
          const [companiesRes, stockRes, recvRes] = await Promise.all([
            supabase.from('companies').select('id,name').limit(1000),
            supabase.from('stock_items').select('company_id, qty, prep_qty_by_country').limit(50000),
            supabase
              .from('receiving_shipments')
              .select('company_id, processed_at, received_at, submitted_at, created_at')
              .limit(20000)
          ]);
          const companies = Array.isArray(companiesRes.data) ? companiesRes.data : [];
          const nameById = new Map(companies.map((c) => [c.id, c.name]));
          let stockRows = Array.isArray(stockRes.data) ? stockRes.data : [];
          const recvRows = Array.isArray(recvRes.data) ? recvRes.data : [];
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
            if (units <= 0) return;
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
        } catch (fallbackError) {
          return { data: [], error: fallbackError };
        }
      }
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


  getClientReceivingShipments: async (companyId, warehouseCountry) => {
    let query = supabase
      .from('receiving_shipments')
      .select(`
        *,
        receiving_items(*, stock_item:stock_items(*)),
        receiving_shipment_items(*)
      `)
      .eq('company_id', companyId);
    if (warehouseCountry) {
      query = query.eq('warehouse_country', warehouseCountry);
    }
    let { data, error } = await query.order('created_at', { ascending: false });
    if (error && isMissingColumnError(error, 'warehouse_country') && warehouseCountry) {
      const retry = await supabase
        .from('receiving_shipments')
        .select(`
        *,
        receiving_items(*, stock_item:stock_items(*)),
        receiving_shipment_items(*)
      `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      data = retry.data;
      error = retry.error;
    }
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
            received_units: item.received_units ?? 0
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
    const { data: importRow, error: importLookupError } = await supabase
      .from('prep_business_imports')
      .select('source_id, merchant_id')
      .eq('receiving_shipment_id', shipmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (importLookupError) {
      return { data: null, error: importLookupError };
    }

    if (importRow?.source_id && importRow?.merchant_id) {
      const { data: archiveData, error: archiveError } = await supabase.functions.invoke('prepbusiness-sync', {
        body: {
          action: 'archive',
          receiving_shipment_id: shipmentId,
          source_id: importRow.source_id,
          merchant_id: importRow.merchant_id
        }
      });

      if (archiveError) {
        return {
          data: null,
          error: { message: `PrepBusiness archive failed: ${archiveError.message || 'Unknown error'}` }
        };
      }

      if (archiveData?.error) {
        return {
          data: null,
          error: { message: `PrepBusiness archive failed: ${archiveData.error}` }
        };
      }
    }

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
  const filterCountry = options.warehouseCountry || options.destinationCountry;
  if (filterCountry) {
    query = query.eq('warehouse_country', filterCountry);
  }

  let { data, error, count } = await query;
  if (error && isMissingColumnError(error, 'warehouse_country') && filterCountry) {
    let retry = supabase
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
      retry = retry.limit(options.maxRows || 2000);
    } else {
      retry = retry.range(from, to);
    }
    if (options.status) retry = retry.eq('status', options.status);
    if (options.companyId) retry = retry.eq('company_id', options.companyId);
    const retryRes = await retry;
    data = retryRes.data;
    error = retryRes.error;
    count = retryRes.count;
  }
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
          received_units: item.received_units ?? 0
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
        .select('id, company_id, user_id, destination_country, warehouse_country')
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
            item.received_units != null ? item.received_units : 0
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
        const prevToStock = Math.max(0, Number(item.quantity_to_stock || 0));
        const deltaToStock = qtyToStock - prevToStock;

        const stockRow = await ensureStockItemForReceiving(item, processedBy);
        const normalizedAsin = normalizeCode(item.asin);
        const normalizedSku = normalizeCode(item.sku);
        const stockId = stockRow?.id || null;

        if (deltaToStock !== 0 && stockRow) {
          const updates = {};
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

          if (Object.keys(updates).length > 0) {
            await supabase
              .from('stock_items')
              .update(updates)
              .eq('id', stockRow.id);
          }

          // Stock quantities are updated via receiving_to_stock_log trigger (positive and negative deltas).
          await supabase
            .from('receiving_to_stock_log')
            .insert({
              receiving_item_id: item.id,
              stock_item_id: stockRow.id,
              quantity_moved: deltaToStock,
              moved_by: processedBy,
              notes: deltaToStock > 0 ? 'Processed from receiving shipment' : 'Correction from receiving shipment'
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
          warehouse_country: shipment.warehouse_country || shipment.warehouseCountry || 'FR',
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
  },

  // ===== Chat =====
  getChatConversation: async ({ companyId, country, userId, clientDisplayName }) => {
    if (!companyId || !country || !userId) {
      return { data: null, error: new Error('Missing chat conversation parameters') };
    }
    const rawMarket = String(country || 'FR').toUpperCase();
    const market = ['FR', 'DE', 'IT', 'ES'].includes(rawMarket) ? rawMarket : 'FR';
    const display = clientDisplayName?.trim() || 'Client';

    // Preferred path: server-side get-or-create to avoid client RLS edge-cases.
    const rpcRes = await supabase.rpc('chat_get_or_create_conversation', {
      p_country: market,
      p_client_display_name: display
    });
    if (!rpcRes?.error && rpcRes?.data) {
      return { data: rpcRes.data, error: null };
    }

    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('company_id', companyId)
      .eq('country', market)
      .maybeSingle();
    const fallbackByUser = async () => {
      const byUser = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('client_user_id', userId)
        .eq('country', market)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!byUser?.error && byUser?.data) return { data: byUser.data, error: null };
      return null;
    };
    const isForbiddenSelect =
      error &&
      (error.code === '42501' ||
        error.status === 403 ||
        /forbidden|permission denied|row-level security/i.test(
          String(error.message || '')
        ));
    if (isForbiddenSelect) {
      const fallback = await fallbackByUser();
      if (fallback) return fallback;
      return { data: null, error: null, forbidden: true };
    }
    if (error && error.code !== 'PGRST116') {
      return { data: null, error };
    }
    if (data) return { data, error: null };
    const fallback = await fallbackByUser();
    if (fallback) return fallback;

    const payload = {
      company_id: companyId,
      client_user_id: userId,
      client_display_name: display,
      country: market,
      created_by: userId
    };
    const created = await supabase
      .from('chat_conversations')
      .insert(payload)
      .select('*')
      .single();
    const isForbiddenInsert =
      created?.error &&
      (created.error.code === '42501' ||
        created.error.status === 403 ||
        /forbidden|permission denied|row-level security/i.test(
          String(created.error.message || '')
        ));
    if (isForbiddenInsert && companyId !== userId) {
      const createdByUser = await supabase
        .from('chat_conversations')
        .insert({
          ...payload,
          company_id: userId
        })
        .select('*')
        .single();
      if (!createdByUser?.error && createdByUser?.data) return createdByUser;
    }
    if (isForbiddenInsert) {
      const fallbackAfterInsert = await fallbackByUser();
      if (fallbackAfterInsert) return fallbackAfterInsert;
      return { data: null, error: null, forbidden: true };
    }
    return created;
  },

  listChatConversations: async ({ country, search } = {}) => {
    let query = supabase
      .from('chat_conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (country) query = query.eq('country', String(country).toUpperCase());
    if (search) query = query.ilike('client_display_name', `%${search}%`);
    return await query;
  },

  listChatMessages: async ({ conversationId, limit = 50, before } = {}) => {
    if (!conversationId) return { data: [], error: null };
    let query = supabase
      .from('chat_messages')
      .select(
        'id, conversation_id, sender_id, sender_role, body, created_at, updated_at, edited_at, chat_message_reads(user_id, read_at), chat_message_attachments(id, storage_path, file_name, mime_type, size_bytes)'
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) query = query.lt('created_at', before);
    const res = await query;
    if (res.data) {
      res.data = res.data.slice().reverse();
    }
    return res;
  },

  sendChatMessage: async ({ conversationId, senderId, senderRole = 'client', body }) => {
    if (!conversationId || !senderId || !body?.trim()) {
      return { data: null, error: new Error('Missing chat message data') };
    }
    return await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        sender_role: senderRole,
        body: body.trim()
      })
      .select('*')
      .single();
  },

  updateChatMessage: async ({ messageId, body }) => {
    if (!messageId || !body?.trim()) {
      return { data: null, error: new Error('Missing chat update data') };
    }
    return await supabase
      .from('chat_messages')
      .update({ body: body.trim() })
      .eq('id', messageId)
      .select('*')
      .single();
  },

  deleteChatMessage: async ({ messageId }) => {
    if (!messageId) return { data: null, error: new Error('Missing message id') };
    return await supabase.from('chat_messages').delete().eq('id', messageId);
  },

  getChatUnreadCount: async ({ conversationId }) => {
    if (!conversationId) return { data: 0, error: null };
    return await supabase.rpc('chat_unread_count', {
      p_conversation_id: conversationId
    });
  },

  markChatRead: async ({ conversationId }) => {
    if (!conversationId) return { data: 0, error: null };
    return await supabase.rpc('chat_mark_read', {
      p_conversation_id: conversationId
    });
  },

  uploadChatAttachment: async ({ conversationId, messageId, file }) => {
    if (!conversationId || !messageId || !file) {
      return { data: null, error: new Error('Missing attachment data') };
    }
    const safeName = String(file.name || 'attachment')
      .replace(/[^\w.\-]+/g, '_')
      .slice(0, 120);
    const path = `chat/${conversationId}/${messageId}/${Date.now()}_${safeName}`;
    const upload = await supabase
      .storage
      .from('chat-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream'
      });
    if (upload.error) return upload;
    const meta = await supabase
      .from('chat_message_attachments')
      .insert({
        message_id: messageId,
        storage_path: path,
        file_name: file.name || 'attachment',
        mime_type: file.type || null,
        size_bytes: Number(file.size || 0) || null
      })
      .select('*')
      .single();
    return meta;
  },

  getChatAttachmentUrl: async ({ path, expiresIn = 3600 }) => {
    if (!path) return { data: null, error: null };
    return await supabase
      .storage
      .from('chat-attachments')
      .createSignedUrl(path, expiresIn);
  },

  // ===== Client Marketplace (Butic) =====
  listClientMarketListings: async ({ country, search, limit = 200 } = {}) => {
    let query = supabase
      .from('client_market_listings')
      .select('id, owner_user_id, owner_company_id, stock_item_id, country, asin, ean, image_url, product_name, price_eur, quantity, note, link_fr, link_de, is_active, sale_finalized_at, sale_finalized_units, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (country) query = query.eq('country', String(country).toUpperCase());
    const q = String(search || '').trim();
    if (q) {
      query = query.or(
        `asin.ilike.%${q}%,ean.ilike.%${q}%,product_name.ilike.%${q}%`
      );
    }
    return await query;
  },

  createClientMarketListing: async ({
    ownerUserId,
    ownerCompanyId,
    stockItemId,
    country,
    asin,
    ean,
    imageUrl,
    productName,
    priceEur,
    quantity,
    note,
    linkFr,
    linkDe
  }) => {
    if (!ownerUserId || !productName?.trim()) {
      return { data: null, error: new Error('Missing listing data') };
    }
    const isUuid = (value) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const safeOwnerCompanyId = isUuid(ownerCompanyId) ? ownerCompanyId : ownerUserId;
    const payload = {
        owner_user_id: ownerUserId,
        owner_company_id: safeOwnerCompanyId,
        stock_item_id: stockItemId || null,
        country: String(country || 'FR').toUpperCase(),
        asin: asin?.trim() || null,
        ean: ean?.trim() || null,
        image_url: imageUrl?.trim() || null,
        product_name: productName.trim(),
        price_eur: Number(priceEur || 0),
        quantity: Number(quantity || 1),
        note: note?.trim() || null,
        link_fr: linkFr?.trim() || null,
        link_de: linkDe?.trim() || null
      };

    const primary = await supabase
      .from('client_market_listings')
      .insert(payload)
      .select('*')
      .single();
    if (!primary?.error) return primary;

    const msg = String(primary.error?.message || '').toLowerCase();
    const canRetryWithoutOptionalColumns =
      msg.includes('stock_item_id') ||
      msg.includes('link_fr') ||
      msg.includes('link_de') ||
      msg.includes('image_url');
    if (!canRetryWithoutOptionalColumns) return primary;

    const minimalPayload = {
      owner_user_id: payload.owner_user_id,
      owner_company_id: payload.owner_company_id,
      country: payload.country,
      asin: payload.asin,
      ean: payload.ean,
      product_name: payload.product_name,
      price_eur: payload.price_eur,
      quantity: payload.quantity,
      note: payload.note
    };

    return await supabase
      .from('client_market_listings')
      .insert(minimalPayload)
      .select('*')
      .single();
  },

  listClientInventoryForMarket: async ({ companyId, search, limit = 50000 } = {}) => {
    let query = supabase
      .from('stock_items')
      .select('id, company_id, name, asin, ean, qty, prep_qty_by_country, image_url')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (companyId) query = query.eq('company_id', companyId);
    const q = String(search || '').trim();
    if (q) {
      query = query.or(`name.ilike.%${q}%,asin.ilike.%${q}%,ean.ilike.%${q}%`);
    }
    const primary = await query;
    if (!primary?.error) return primary;

    // Fallback for environments where direct stock_items access is blocked by stricter RLS.
    let fallback = supabase
      .from('client_stock_items')
      .select('stock_item_id, company_id, product_name, asin, ean, qty')
      .order('stock_item_id', { ascending: false })
      .limit(limit);
    if (companyId) fallback = fallback.eq('company_id', companyId);
    if (q) {
      fallback = fallback.or(`product_name.ilike.%${q}%,asin.ilike.%${q}%,ean.ilike.%${q}%`);
    }
    const fallbackRes = await fallback;
    if (fallbackRes?.error) return primary;

    const mapped = (fallbackRes.data || []).map((row) => ({
      id: row.stock_item_id,
      company_id: row.company_id || null,
      name: row.product_name || null,
      asin: row.asin || null,
      ean: row.ean || null,
      qty: Number(row.qty || 0) || 0,
      prep_qty_by_country: {},
      image_url: null
    }));
    return { data: mapped, error: null };
  },

  setClientMarketListingActive: async ({ listingId, isActive }) => {
    if (!listingId) return { data: null, error: new Error('Missing listing id') };
    if (isActive === false) {
      const del = await supabase
        .from('client_market_listings')
        .delete()
        .eq('id', listingId);
      if (!del?.error) {
        return {
          data: { id: listingId, is_active: false, deleted: true },
          error: null
        };
      }
      const updateFallback = await supabase
        .from('client_market_listings')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', listingId);
      if (updateFallback?.error) return updateFallback;
      return {
        data: { id: listingId, is_active: false },
        error: null
      };
    }
    const res = await supabase
      .from('client_market_listings')
      .update({ is_active: !!isActive, updated_at: new Date().toISOString() })
      .eq('id', listingId);
    if (res?.error) return res;
    return {
      data: {
        id: listingId,
        is_active: !!isActive
      },
      error: null
    };
  },

  updateClientMarketListing: async ({
    listingId,
    productName,
    asin,
    ean,
    country,
    priceEur,
    quantity,
    note,
    linkFr,
    linkDe
  } = {}) => {
    if (!listingId) return { data: null, error: new Error('Missing listing id') };
    const payload = {
      product_name: productName?.trim() || 'Product',
      asin: asin?.trim() || null,
      ean: ean?.trim() || null,
      country: String(country || 'FR').toUpperCase(),
      price_eur: Number(priceEur || 0),
      quantity: Math.max(1, Number(quantity || 1)),
      note: note?.trim() || null,
      link_fr: linkFr?.trim() || null,
      link_de: linkDe?.trim() || null,
      updated_at: new Date().toISOString()
    };
    const res = await supabase
      .from('client_market_listings')
      .update(payload)
      .eq('id', listingId);
    if (res?.error) return res;
    return { data: { id: listingId, ...payload }, error: null };
  },

  finalizeClientMarketSale: async ({ listingId, units } = {}) => {
    if (!listingId) return { data: null, error: new Error('Missing listing id') };
    return await supabase.rpc('client_market_finalize_sale', {
      p_listing_id: listingId,
      p_units: Number.isFinite(Number(units)) ? Number(units) : null
    });
  },

  getOrCreateClientMarketConversation: async ({ listingId }) => {
    if (!listingId) return { data: null, error: new Error('Missing listing id') };
    return await supabase.rpc('client_market_get_or_create_conversation', {
      p_listing_id: listingId
    });
  },

  listClientMarketConversations: async ({ country } = {}) => {
    let query = supabase
      .from('client_market_conversations')
      .select('id, listing_id, country, seller_user_id, buyer_user_id, created_at, last_message_at, client_market_listings(id, owner_user_id, owner_company_id, asin, ean, product_name, price_eur, quantity, country)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (country) query = query.eq('country', String(country).toUpperCase());
    return await query;
  },

  listClientMarketMessages: async ({ conversationId, limit = 200 } = {}) => {
    if (!conversationId) return { data: [], error: null };
    const res = await supabase
      .from('client_market_messages')
      .select(
        'id, conversation_id, sender_user_id, body, created_at, client_market_message_attachments(id, storage_path, file_name, mime_type, size_bytes)'
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);
    return res;
  },

  getClientMarketConversationLatestMessage: async ({ conversationId } = {}) => {
    if (!conversationId) return { data: null, error: null };
    return await supabase
      .from('client_market_messages')
      .select('id, conversation_id, sender_user_id, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  sendClientMarketMessage: async ({ conversationId, senderUserId, body }) => {
    if (!conversationId || !senderUserId || !body?.trim()) {
      return { data: null, error: new Error('Missing marketplace message data') };
    }
    return await supabase
      .from('client_market_messages')
      .insert({
        conversation_id: conversationId,
        sender_user_id: senderUserId,
        body: body.trim()
      })
      .select('*')
      .single();
  },

  uploadClientMarketAttachment: async ({ conversationId, messageId, file }) => {
    if (!conversationId || !messageId || !file) {
      return { data: null, error: new Error('Missing marketplace attachment data') };
    }
    const safeName = String(file.name || 'attachment')
      .replace(/[^\w.\-]+/g, '_')
      .slice(0, 120);
    const path = `client-market/${conversationId}/${messageId}/${Date.now()}_${safeName}`;
    const upload = await supabase
      .storage
      .from('client-market-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream'
      });
    if (upload.error) return upload;
    return await supabase
      .from('client_market_message_attachments')
      .insert({
        message_id: messageId,
        storage_path: path,
        file_name: file.name || 'attachment',
        mime_type: file.type || null,
        size_bytes: Number(file.size || 0) || null
      })
      .select('*')
      .single();
  },

  getClientMarketAttachmentUrl: async ({ path, expiresIn = 3600 }) => {
    if (!path) return { data: null, error: null };
    return await supabase
      .storage
      .from('client-market-attachments')
      .createSignedUrl(path, expiresIn);
  }
};

export { supabase as default };

export async function setPrepStatus(requestId, status) {
  return supabase
    .from('prep_requests')
    .update({ status })
    .eq('id', requestId);
}
