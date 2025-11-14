// FILE: src/config/supabase.js
import { createClient } from '@supabase/supabase-js';
import { tabSessionStorage } from '../utils/tabStorage';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be defined in .env file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: tabSessionStorage,
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
  ['send_to_fba', 'fba_qty', 'stock_item_id'].some((col) => isMissingColumnError(error, col));

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
    nextStatus = 'received';
  } else if (someReceived) {
    nextStatus = 'partial';
  } else if (currentStatus === 'partial' || currentStatus === 'received') {
    nextStatus = 'submitted';
  }

  const patch = {};
  if (nextStatus !== currentStatus) {
    patch.status = nextStatus;
  }
  if (nextStatus === 'received') {
    patch.received_by = receivedBy || shipment?.received_by || null;
    patch.received_at = new Date().toISOString();
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
    const patch = {
      status: 'received',
      received_at: new Date().toISOString(),
      received_by: receivedBy || null
    };
    const { error: updateError } = await supabase
      .from('receiving_shipments')
      .update(patch)
      .eq('id', shipmentId);
    return { error: updateError || null };
  }
  return await markItemsAsReceived(shipmentId, ids, receivedBy);
}

const sanitizeShipmentUpdate = (payload) => {
  if (supportsReceivingFbaMode || !payload || typeof payload !== 'object') return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'fba_mode')) return payload;
  const clone = { ...payload };
  delete clone.fba_mode;
  return clone;
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
  if (!receivingSupportPromise) {
    receivingSupportPromise = Promise.resolve();
  }
  return receivingSupportPromise;
};

export const canUseReceivingFbaMode = () => supportsReceivingFbaMode;
export const canUseReceivingItemFbaColumns = () => supportsReceivingItemFbaColumns;
export const disableReceivingFbaModeSupport = () => {
  supportsReceivingFbaMode = false;
  receivingSupportPromise = null;
};
export const disableReceivingItemFbaSupport = () => {
  supportsReceivingItemFbaColumns = false;
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
        .select('id, name, ean, sku, asin')
        .in('id', Array.from(allStockIds));
      stockMap = Object.fromEntries((stockData || []).map((s) => [s.id, s]));
    }

    const processed = (data || []).map(r => ({
      ...r,
      prep_request_items: (r.prep_request_items || []).map((it) => ({
        ...it,
        stock_item: stockMap[it.stock_item_id] || null,
      })),
      client_name: [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(' '),
      user_email: r.profiles?.email,
      company_name: r.profiles?.store_name || r.companies?.name || r.profiles?.company_name,
      store_name: r.profiles?.store_name || null
    }));

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
        .select('id, name, ean, sku, asin')
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
  const { data: itemRows, error: fetchItemsErr } = await supabase
    .from('prep_request_items')
    .select('id')
    .eq('prep_request_id', requestId);
  if (fetchItemsErr) return { error: fetchItemsErr };
  const itemIds = (itemRows || []).map((it) => it.id).filter(Boolean);

  if (itemIds.length > 0) {
    const { error: boxesErr } = await supabase
      .from('prep_request_boxes')
      .delete()
      .in('prep_request_item_id', itemIds);
    if (boxesErr && !isRelationMissingError(boxesErr, 'prep_request_boxes')) {
      return { error: boxesErr };
    }
  }

  // fallback JS cascade (tracking -> items -> header)
  const { error: trackErr } = await supabase
    .from('prep_request_tracking')
    .delete()
    .eq('request_id', requestId);
  if (trackErr) return { error: trackErr };

  const { error: itemsErr } = await supabase
    .from('prep_request_items')
    .delete()
    .eq('prep_request_id', requestId);
  if (itemsErr) return { error: itemsErr };

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
    const { data, error } = await supabase
      .from('prep_request_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();
    return { data, error };
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
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return await supabase
      .from('prep_request_boxes')
      .select('id, prep_request_item_id, box_number, units, updated_at')
      .in('prep_request_item_id', itemIds)
      .gte('updated_at', cutoff);
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

    const payload = boxes.map((box) => ({
      prep_request_item_id: itemId,
      box_number: box.boxNumber,
      units: box.units,
    }));

    const { error } = await supabase.from('prep_request_boxes').insert(payload);
    if (error) return { error };

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('prep_request_boxes').delete().lt('updated_at', cutoff);
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
    const payload = {
      path: visitData?.path || window?.location?.pathname || '/',
      referrer: visitData?.referrer || document?.referrer || null
    };
    await supabase.from('analytics_visits').insert(payload);
  } catch (error) {
    console.error('Analytics error:', error);
  }
},

  getAnalytics: async (options = {}) => {
    try {
      const days = options.days || 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const [byDayRes, pathRes, refRes] = await Promise.all([
        supabase
          .from('analytics_visits')
          .select('created_at')
          .gte('created_at', cutoff.toISOString()),
        supabase
          .from('analytics_visits')
          .select('path')
          .gte('created_at', cutoff.toISOString()),
        supabase
          .from('analytics_visits')
          .select('referrer')
          .gte('created_at', cutoff.toISOString())
      ]);

      return {
        byDay: byDayRes.data || [],
        topPaths: pathRes.data || [],
        topReferrers: refRes.data || [],
        error: byDayRes.error || pathRes.error || refRes.error
      };
    } catch (error) {
      return { byDay: [], topPaths: [], topReferrers: [], error };
    }
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
        receiving_items(*),
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
      const merged = [...legacyItems, ...modernItems, ...fallbackItems];
      const { receiving_shipment_items, receiving_items, ...rest } = row;
      return {
        ...rest,
        receiving_items: merged
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

    let patch = { ...updates };
    if (!supportsReceivingFbaMode) patch = sanitizeShipmentUpdate(patch);

    try {
      await executeUpdate(patch);
    } catch (error) {
      if (supportsReceivingFbaMode && isMissingColumnError(error, 'fba_mode')) {
        disableReceivingFbaModeSupport();
        patch = sanitizeShipmentUpdate(patch);
        await executeUpdate(patch);
      } else {
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
    rawRows.map((row) => {
      const baseRow = {
        ...row,
        received_units:
          typeof row.received_units === 'number'
            ? row.received_units
            : row.quantity_received
      };
      return supportsReceivingItemFbaColumns ? baseRow : sanitizeItemPayload(baseRow);
    });

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
    .select(`
      *,
      companies:companies(name),
      receiving_shipment_items(*),
      receiving_items(*)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

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
      .select('*')
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
  shipments.forEach((r) => {
    (r.receiving_shipment_items || []).forEach((it) => {
      if (it.stock_item_id) allStockIds.add(it.stock_item_id);
    });
    (r.receiving_items || []).forEach((it) => {
      if (it.stock_item_id) allStockIds.add(it.stock_item_id);
    });
    (fallbackItemsMap[r.id] || []).forEach((it) => {
      if (it.stock_item_id) allStockIds.add(it.stock_item_id);
    });
  });

  let stockMap = {};
  if (allStockIds.size > 0) {
    const { data: stockData } = await supabase
      .from('stock_items')
      .select('id, asin, name, sku')
      .in('id', Array.from(allStockIds));
    stockMap = Object.fromEntries((stockData || []).map((s) => [s.id, s]));
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

    return {
      ...rest,
      receiving_items: items.map((it) => ({
        ...it,
        stock_item: stockMap[it.stock_item_id] || null,
      })),
      produits_count: items.length,
      store_name: rest.client_store_name || profileMeta.store_name || rest.client_name || null,
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
  processReceivingToStock: async (shipmentId, processedBy, itemsToProcess) => {
    try {
      await ensureReceivingColumnSupport();
      const { data: shipment, error: shipmentFetchError } = await supabase
        .from('receiving_shipments')
        .select('id, company_id, user_id')
        .eq('id', shipmentId)
        .single();
      if (shipmentFetchError) throw shipmentFetchError;

      const fbaLines = [];

      const ensureStockItem = async (item) => {
        if (item.stock_item_id) {
          const { data } = await supabase
            .from('stock_items')
            .select('*')
            .eq('id', item.stock_item_id)
            .maybeSingle();
          if (data) return data;
        }

        if (item.ean_asin) {
          const { data } = await supabase
            .from('stock_items')
            .select('*')
            .eq('company_id', item.company_id)
            .eq('ean', item.ean_asin)
            .maybeSingle();
          if (data) return data;
        }

        const insertPayload = {
          company_id: item.company_id,
          ean: item.ean_asin,
          name: item.product_name,
          asin: item.sku,
          qty: 0,
          purchase_price: item.purchase_price,
          created_by: processedBy
        };

        const { data: created, error } = await supabase
          .from('stock_items')
          .insert(insertPayload)
          .select()
          .single();
        if (error) throw error;
        return created;
      };

      for (const item of itemsToProcess) {
        const quantityReceived = Math.max(
          0,
          Number(
            item.received_units != null ? item.received_units : item.quantity_received || 0
          )
        );
        const fbaQty = item.send_to_fba ? Math.max(0, Number(item.fba_qty) || 0) : 0;
        const qtyToStock = Math.max(0, quantityReceived - fbaQty);

        const stockRow = await ensureStockItem(item);
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
          if (item.sku && item.sku !== stockRow.asin) {
            updates.asin = item.sku;
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

        let itemPatch = {
          stock_item_id: stockId,
          quantity_to_stock: qtyToStock,
          remaining_action: fbaQty > 0 ? 'direct_to_amazon' : 'hold_for_prep',
          send_to_fba: item.send_to_fba,
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

        if (fbaQty > 0 && stockId) {
          fbaLines.push({
            stock_item_id: stockId,
            ean: stockRow?.ean || item.ean_asin || null,
            product_name: stockRow?.name || item.product_name || null,
            asin: stockRow?.asin || item.sku || null,
            sku: item.sku || null,
            units_requested: fbaQty
          });
        }
      }

      if (fbaLines.length) {
        await supabaseHelpers.createPrepRequest({
          company_id: shipment.company_id,
          user_id: shipment.user_id || processedBy,
          status: 'pending',
          destination_country: 'FR',
          items: fbaLines
        });
      }

      const { error: shipmentError } = await supabase
        .from('receiving_shipments')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          processed_by: processedBy
        })
        .eq('id', shipmentId);

      if (shipmentError) throw shipmentError;

      return { error: null };
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
