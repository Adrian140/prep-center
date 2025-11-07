import { supabase } from "./supabase";

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
    return await supabase
      .from("prep_request_items")
      .insert([{ ...item, prep_request_id: requestId }])
      .select()
      .single();
  },

  updatePrepItem: async (id, patch) => {
    return await supabase
      .from("prep_request_items")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
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
  const trackingIds =
    Array.isArray(data.tracking_ids) && data.tracking_ids.length > 0
      ? data.tracking_ids
      : null;
  const fbaShipmentIds =
    Array.isArray(data.fba_shipment_ids) && data.fba_shipment_ids.length > 0
      ? data.fba_shipment_ids
      : null;

  const headerPayload = {
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
  };

  const { data: header, error: err1 } = await supabase
    .from("receiving_shipments")
    .insert([headerPayload])
    .select()
    .single();

  if (err1) throw err1;

  if (Array.isArray(data.items) && data.items.length > 0) {
    let lineCounter = 1;
    const insertItems = data.items.map((it) => ({
      shipment_id: header.id,                  // aici e fixul
      line_number: lineCounter++,
      ean_asin: it.asin || it.ean || null,
      product_name: it.product_name || null,
      sku: it.sku || null,
      purchase_price: it.purchase_price || null,
      quantity_received: it.units_requested || 0,
    }));

    const { error: err2 } = await supabase
      .from("receiving_items")
      .insert(insertItems);

    if (err2) throw err2;
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

  getClientStock: async (companyId) => {
    const { data, error } = await supabase
      .from("stock_items")
      .select("*")
      .eq("company_id", companyId);
    if (error) throw error;
    return data;
  },
};
