import {
  supabase,
  ensureReceivingColumnSupport,
  canUseReceivingFbaMode,
  canUseReceivingItemFbaColumns,
  canUseReceivingShipmentArrays,
  disableReceivingFbaModeSupport,
  disableReceivingItemFbaSupport,
  disableReceivingShipmentArraySupport
} from "./supabase";
import { encodeRemainingAction } from "../utils/receivingFba";

const isMissingColumnError = (error, column) => {
  if (!error) return false;
  const columnName = column.toLowerCase();
  const message = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();
  return message.includes(columnName) || details.includes(columnName) || hint.includes(columnName);
};

const receivingItemColumnMissing = (error) =>
  ['send_to_fba', 'fba_qty', 'stock_item_id'].some((col) =>
    isMissingColumnError(error, col)
  );

const receivingShipmentArrayColumnMissing = (error) =>
  ['tracking_ids', 'fba_shipment_ids'].some((col) => isMissingColumnError(error, col));

export const supabaseHelpers = {
  /* =========================
     Prep Requests Management
     ========================= */
  createPrepRequest: async (data) => {
    // 1️⃣ Inserăm headerul în prep_requests
    const { data: header, error: err1 } = await supabase
      .from("prep_requests")
      .insert([
        {
          user_id: data.user_id,
          company_id: data.company_id,
          destination_country: data.destination_country || "FR",
          status: data.status || "pending",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (err1) throw err1;

    // 2️⃣ Inserăm liniile în prep_request_items
    if (Array.isArray(data.items) && data.items.length > 0) {
      const insertItems = data.items.map((it) => ({
        prep_request_id: header.id,
        stock_item_id: it.stock_item_id,
        ean: it.ean || null,
        product_name: it.product_name || null,
        asin: it.asin || null,
        sku: it.sku || null,
        units_requested: it.units_requested || 0,
      }));

      const { error: err2 } = await supabase
        .from("prep_request_items")
        .insert(insertItems);
      if (err2) throw err2;
    }

    return header;
  },

  getPrepRequest: async (id) => {
    return await supabase
      .from("prep_requests")
      .select("*, prep_request_items(*), prep_request_tracking(*)")
      .eq("id", id)
      .single();
  },

  createPrepItem: async (requestId, item) => {
    const { data, error } = await supabase
      .from("prep_request_items")
      .insert([{ ...item, prep_request_id: requestId }])
      .select()
      .single();
    return { data, error };
  },

  updatePrepItem: async (id, patch) => {
    const { data, error } = await supabase
      .from("prep_request_items")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    return { data, error };
  },

  deletePrepItem: async (id) => {
    return await supabase
      .from("prep_request_items")
      .delete()
      .eq("id", id);
  },

  /* =========================
     Reception Announcements
     ========================= */
createReceptionRequest: async (data) => {
  await ensureReceivingColumnSupport();
  let useShipmentFba = canUseReceivingFbaMode();
  let useItemsFba = canUseReceivingItemFbaColumns();
  let useShipmentArrays = canUseReceivingShipmentArrays();
  const destinationCountry = (data.destination_country || 'FR').toUpperCase();

  const trackingIds =
    Array.isArray(data.tracking_ids) && data.tracking_ids.length > 0
      ? data.tracking_ids
      : null;
  const fbaShipmentIds =
    Array.isArray(data.fba_shipment_ids) && data.fba_shipment_ids.length > 0
      ? data.fba_shipment_ids
      : null;
  const primaryTrackingId = data.tracking_id || (trackingIds?.[0] || null);

  let storeName = data.store_name || null;
  if (!storeName && data.user_id) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('store_name')
      .eq('id', data.user_id)
      .single();
    storeName = profileData?.store_name || null;
  }

  const buildHeaderPayload = (withFbaMode, withArrays) => {
    const payload = {
      user_id: data.user_id,
      company_id: data.company_id,
      status: data.status || "submitted",
      created_at: new Date().toISOString(),
      destination_country: destinationCountry,
      carrier: data.carrier || null,
      carrier_other: data.carrier_other || null,
      tracking_id: primaryTrackingId,
      tracking_ids: withArrays ? trackingIds : null,
      fba_shipment_ids: withArrays ? fbaShipmentIds : null,
      notes: data.notes || null,
      client_store_name: storeName
    };
    if (withFbaMode) {
      payload.fba_mode = data.fba_mode || 'none';
    }
    return payload;
  };

  const insertHeader = async (payload) => {
    const { data, error } = await supabase
      .from("receiving_shipments")
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  let header;
  while (true) {
    const headerPayload = buildHeaderPayload(useShipmentFba, useShipmentArrays);
    try {
      header = await insertHeader(headerPayload);
      break;
    } catch (error) {
      if (useShipmentFba && isMissingColumnError(error, 'fba_mode')) {
        disableReceivingFbaModeSupport();
        useShipmentFba = false;
        continue;
      }
      if (useShipmentArrays && receivingShipmentArrayColumnMissing(error)) {
        disableReceivingShipmentArraySupport();
        useShipmentArrays = false;
        continue;
      }
      throw error;
    }
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    const buildItemsPayload = (withFbaFields) => {
      let lineCounter = 1;
      return data.items.map((it) => {
        const rawEan = (it.ean || '').trim();
        const rawAsin = (it.asin || '').trim();
        const rawName = (it.product_name || '').trim();
        const rawSku = (it.sku || '').trim();

        const safeEanAsin =
          rawEan ||
          rawAsin ||
          rawSku ||
          'UNKNOWN';
        const safeName =
          rawName ||
          rawSku ||
          rawAsin ||
          rawEan ||
          'Unknown product';

        const unitsRequested = Math.max(1, Number(it.units_requested) || 0);

        const normalizedPrice = (() => {
          if (
            it.purchase_price === undefined ||
            it.purchase_price === null ||
            it.purchase_price === ''
          )
            return null;
          const raw = String(it.purchase_price).replace(',', '.');
          const num = Number(raw);
          if (!Number.isFinite(num)) return null;
          return Number(num.toFixed(2));
        })();

        const base = {
          shipment_id: header.id,
          line_number: lineCounter++,
          ean_asin: safeEanAsin,
          product_name: safeName,
          sku: rawSku || null,
          purchase_price: normalizedPrice,
          quantity_received: unitsRequested,
          remaining_action: encodeRemainingAction(
            !!it.send_to_fba,
            it.fba_qty ?? unitsRequested
          )
        };
        if (withFbaFields) {
          base.stock_item_id = it.stock_item_id || null;
          const units = Math.max(0, Number(it.fba_qty ?? unitsRequested) || 0);
          const sendToFba = !!it.send_to_fba && units > 0;
          base.send_to_fba = sendToFba;
          base.fba_qty = sendToFba ? Math.max(0, Number(it.fba_qty) || 0) : 0;
        }
        return base;
      });
    };

    const insertItems = async (payload) => {
      if (!payload.length) return;
      const { error } = await supabase
        .from("receiving_items")
        .insert(payload);
      if (error) throw error;
    };

    let itemPayload = buildItemsPayload(useItemsFba);
    try {
      await insertItems(itemPayload);
    } catch (error) {
      if (useItemsFba && receivingItemColumnMissing(error)) {
        disableReceivingItemFbaSupport();
        useItemsFba = false;
        itemPayload = buildItemsPayload(false);
        await insertItems(itemPayload);
      } else {
        throw error;
      }
    }
  }

  return header;
},


  /* =========================
     Stock Management
     ========================= */
  updateStockItem: async (id, patch) => {
    return await supabase
      .from("stock_items")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
  },

  createStockItem: async (profile, item) => {
    if (!profile?.company_id) {
      throw new Error("Missing company_id in profile");
    }

    const payload = {
      company_id: profile.company_id,
      user_id: profile.id,
      asin: item.asin || null,
      qty: item.qty || 0,
      ean: item.ean || null,
      sku: item.sku || null,
      product_link: item.product_link || null,
      purchase_price: item.purchase_price || null,
      created_by: profile.id,
      created_at: new Date().toISOString(),
      name: item.name || null,
    };

    const { data, error } = await supabase
      .from("stock_items")
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  createProductBlueprint: async (profile, stockItemId, details = {}) => {
    if (!profile?.company_id) {
      throw new Error("Missing company profile");
    }
    if (!stockItemId) {
      throw new Error("Missing stock item id");
    }

    const payload = {
      company_id: profile.company_id,
      user_id: profile.id,
      stock_item_id: stockItemId,
      supplier_name: details.supplierName || null,
      supplier_number: details.supplierNumber || null,
      supplier_url: details.supplierUrl || null,
      supplier_price: details.supplierPrice ?? null,
      manufacturer: details.manufacturer || null,
      manufacturer_number: details.manufacturerNumber || null,
      product_ext_id: details.productExtId || null,
      approx_price_ebay: details.approxPriceEbay ?? null,
      approx_price_fbm: details.approxPriceFbm ?? null,
      weight_value: details.weightValue ?? null,
      weight_unit: details.weightUnit || null,
      package_width: details.packageWidth ?? null,
      package_height: details.packageHeight ?? null,
      package_length: details.packageLength ?? null,
      package_unit: details.packageUnit || null,
      units_measure: details.unitsMeasure || null,
      units_count: details.unitsCount ?? null,
      condition: details.condition || null,
      ship_template: details.shipTemplate || null,
      notes: details.notes || null
    };

    const { error } = await supabase.from("product_blueprints").insert([payload]);
    if (error) throw error;
  },

  getClientStock: async (companyId) => {
    const { data, error } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", companyId);
    if (error) throw error;
    return data;
  },

  listAffiliateRequests: async () => {
    return await supabase
      .from('affiliate_requests')
      .select(`
        *,
        profile:profiles!inner (
          id,
          first_name,
          last_name,
          company_name,
          store_name,
          country
        )
      `)
      .order('created_at', { ascending: false });
  },

  createAffiliateRequest: async ({ profile_id, preferred_code, notes } = {}) => {
    return await supabase
      .from('affiliate_requests')
      .insert([{
        profile_id,
        preferred_code: preferred_code ? preferred_code.trim().toUpperCase() : null,
        notes: notes || null,
        status: 'pending'
      }])
      .select('*')
      .single();
  },

  cancelAffiliateRequest: async (id) => {
    return await supabase.from('affiliate_requests').delete().eq('id', id);
  },

  listAffiliateOwnerOptions: async () => {
    return await supabase
      .from('profiles')
      .select('id, first_name, last_name, company_name, store_name, affiliate_code_input, affiliate_code_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500);
  },

  respondAffiliateRequest: async (requestId, patch = {}) => {
    return await supabase
      .from('affiliate_requests')
      .update(patch)
      .eq('id', requestId)
      .select()
      .single();
  },

  lookupAffiliateCode: async (code) => {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) return { data: null, error: null };
    return await supabase
      .from('affiliate_codes')
      .select('*')
      .eq('code', trimmed)
      .eq('active', true)
      .maybeSingle();
  },

  listAffiliateCodes: async () => {
    return await supabase
      .from('affiliate_codes')
      .select('*, owner:profiles!affiliate_codes_owner_profile_id_fkey(id, first_name, last_name, company_name, store_name)')
      .order('created_at', { ascending: false });
  },

  createAffiliateCode: async (payload = {}) => {
    return await supabase
      .from('affiliate_codes')
      .insert([payload])
      .select('*')
      .single();
  },

  updateAffiliateCode: async (id, patch = {}) => {
    return await supabase
      .from('affiliate_codes')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
  },

  deleteAffiliateCode: async (id) => {
    return await supabase.from('affiliate_codes').delete().eq('id', id);
  },

  getAffiliateOwnerSnapshot: async (profileId) => {
    const { data: code, error } = await supabase
      .from('affiliate_codes')
      .select('*')
      .eq('owner_profile_id', profileId)
      .maybeSingle();
    if (error || !code) return { data: null, error };

    const { data: assigned } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, company_name, store_name, company_id, country')
      .eq('affiliate_code_id', code.id);

    const companyIds = (assigned || [])
      .map((client) => client.company_id)
      .filter(Boolean);

    let totals = {};
    if (companyIds.length > 0) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('company_id, total_amount, amount, status')
        .in('company_id', companyIds)
        .eq('status', 'paid');
      (invoices || []).forEach((inv) => {
        const amount = Number(
          inv.total_amount != null ? inv.total_amount : inv.amount != null ? inv.amount : 0
        );
        totals[inv.company_id] = (totals[inv.company_id] || 0) + amount;
      });
    }

    return {
      data: {
        code,
        members: (assigned || []).map((client) => ({
          ...client,
          billing_total: client.company_id ? totals[client.company_id] || 0 : 0
        }))
      },
      error: null
    };
  },

  getAffiliateClientStatus: async (profileId) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('affiliate_code_id, affiliate_code_input')
      .eq('id', profileId)
      .single();

    const { data: request } = await supabase
      .from('affiliate_requests')
      .select('*')
      .eq('profile_id', profileId)
      .in('status', ['pending', 'review'])
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (profile?.affiliate_code_id) {
      const { data: code } = await supabase
        .from('affiliate_codes')
        .select('*')
        .eq('id', profile.affiliate_code_id)
        .maybeSingle();
      const { data: members } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, company_name, store_name')
        .eq('affiliate_code_id', profile.affiliate_code_id);
      return { profile, code, members: members || [], request: request || null };
    }

    return { profile, code: null, members: [], request: request || null };
  },

  getAffiliateCodeMembers: async (codeId, codeValue) => {
    const assignedPromise = supabase
      .from('profiles')
      .select('id, first_name, last_name, company_name, store_name, country, company_id, affiliate_code_input, affiliate_code_id, updated_at')
      .eq('affiliate_code_id', codeId)
      .order('updated_at', { ascending: true });
    const candidatesPromise = supabase
      .from('profiles')
      .select('id, first_name, last_name, company_name, store_name, country, affiliate_code_input, updated_at')
      .is('affiliate_code_id', null)
      .eq('affiliate_code_input', (codeValue || '').toUpperCase())
      .order('updated_at', { ascending: true })
      .limit(50);
    const [{ data: assigned, error: assignedErr }, { data: candidates, error: cErr }] =
      await Promise.all([assignedPromise, candidatesPromise]);

    let totals = {};
    const companyIds = (assigned || [])
      .map((client) => client.company_id)
      .filter(Boolean);
    if (companyIds.length > 0) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('company_id, total_amount, amount, status')
        .in('company_id', companyIds)
        .eq('status', 'paid');
      (invoices || []).forEach((invoice) => {
        const amount = Number(
          invoice.total_amount != null ? invoice.total_amount : invoice.amount != null ? invoice.amount : 0
        );
        totals[invoice.company_id] = (totals[invoice.company_id] || 0) + amount;
      });
    }

    const assignedWithTotals = (assigned || []).map((client) => ({
      ...client,
      billing_total: client.company_id ? totals[client.company_id] || 0 : 0
    }));
    return {
      assigned: assignedErr ? [] : assignedWithTotals,
      candidates: cErr ? [] : candidates || [],
      error: assignedErr || cErr || null
    };
  },

  assignAffiliateCodeToProfile: async (profileId, codeId) => {
    return await supabase
      .from('profiles')
      .update({ affiliate_code_id: codeId })
      .eq('id', profileId)
      .select('id')
      .single();
  },

  removeAffiliateCodeFromProfile: async (profileId) => {
    return await supabase
      .from('profiles')
      .update({ affiliate_code_id: null })
      .eq('id', profileId)
      .select('id')
      .single();
  }
};
