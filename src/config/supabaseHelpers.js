import {
  supabase,
  ensureReceivingColumnSupport,
  canUseReceivingFbaMode,
  canUseReceivingItemFbaColumns,
  disableReceivingFbaModeSupport,
  disableReceivingItemFbaSupport
} from "./supabase";

const isMissingColumnError = (error, column) => {
  if (!error) return false;
  const columnName = column.toLowerCase();
  const message = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();
  return message.includes(columnName) || details.includes(columnName) || hint.includes(columnName);
};

const receivingItemColumnMissing = (error) =>
  ['send_to_fba', 'fba_qty', 'stock_item_id'].some((col) => isMissingColumnError(error, col));

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

  const trackingIds =
    Array.isArray(data.tracking_ids) && data.tracking_ids.length > 0
      ? data.tracking_ids
      : null;
  const fbaShipmentIds =
    Array.isArray(data.fba_shipment_ids) && data.fba_shipment_ids.length > 0
      ? data.fba_shipment_ids
      : null;

  let storeName = data.store_name || null;
  if (!storeName && data.user_id) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('store_name')
      .eq('id', data.user_id)
      .single();
    storeName = profileData?.store_name || null;
  }

  const buildHeaderPayload = (withFbaMode) => {
    const payload = {
    user_id: data.user_id,
    company_id: data.company_id,
    status: data.status || "submitted",
    created_at: new Date().toISOString(),
    carrier: data.carrier || null,
    carrier_other: data.carrier_other || null,
    tracking_id: data.tracking_id || null,
    tracking_ids: trackingIds,
    fba_shipment_ids: fbaShipmentIds,
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

  let headerPayload = buildHeaderPayload(useShipmentFba);

  let header;
  try {
    header = await insertHeader(headerPayload);
  } catch (error) {
    if (useShipmentFba && isMissingColumnError(error, 'fba_mode')) {
      disableReceivingFbaModeSupport();
      useShipmentFba = false;
      headerPayload = buildHeaderPayload(false);
      header = await insertHeader(headerPayload);
    } else {
      throw error;
    }
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    const buildItemsPayload = (withFbaFields) => {
      let lineCounter = 1;
      return data.items.map((it) => {
        const base = {
          shipment_id: header.id,
          line_number: lineCounter++,
          ean_asin: it.ean || it.asin || null,
          product_name: it.product_name || null,
          sku: it.sku || null,
          purchase_price: it.purchase_price || null,
          quantity_received: it.units_requested || 0,
          remaining_action: it.send_to_fba ? 'direct_to_amazon' : 'hold_for_prep'
        };
        if (withFbaFields) {
          base.stock_item_id = it.stock_item_id || null;
          const units = Math.max(0, Number(it.fba_qty ?? it.units_requested) || 0);
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
};
