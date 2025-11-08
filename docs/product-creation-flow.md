## Create Product – Logic Proposal

### Objectives
- Permite clienților să creeze manual produse care nu pot fi importate din Amazon.
- Oferă două niveluri de detaliu (formular simplu și unul avansat) pentru a acoperi atât scenariile rapide, cât și cele care cer detalii logistice.
- Sincronizează produsul în `stock_items` (sau într-o nouă tabelă `products`) și pregătește datele pentru viitoare sincronizări SP-API.

### Flux general
1. **CTA vizibil în tab-ul „Products”** – buton „Create product”.
2. **Drawer/Modal cu 2 tab-uri**:
   - **Simple form**: Title, Manufacturer SKU, Quantity, Purchase price, Optional image URL.
   - **Advanced form** (inspirat din screenshots): secțiuni Supplier, Product info, Pricing, Weight & Dimensions, Units, Condition.
3. **Validări**:
   - câmpuri obligatorii diferite pe tab; la Advanced se validează numeric + unități + enum-uri (`condition`, `measure_unit`).
   - EAN/UPC opțional dar dacă e completat se verifică formatul.
4. **Salvare**:
   - se rulează `supabase.from('products').insert(...)`;
   - dacă există company_id > 1, se setează `user_id`, `company_id`, `created_by`.
   - pentru Advanced se normalizează structurile (ex: `dimensions: { width, height, length, unit }`).
5. **După insert**:
   - se afișează toast success și se alimentează `stock_items` cu un rând inițial (qty = 0) dacă produsul nu există acolo.
   - se scrie un eveniment în `product_events` pentru audit.
6. **Integrare viitoare cu Amazon**:
   - se stochează un flag `requires_spapi_sync = true`.
   - când contul Amazon devine disponibil, un worker poate analiza produsele nesincronizate și să trimită feed-ul necesar.

### Structuri recomandate
```sql
-- products
id uuid PK
company_id uuid
user_id uuid
title text
manufacturer text
manufacturer_sku text
asin text
ean text
condition text
units jsonb -- { measure_unit, measure_count }
dimensions jsonb -- { width, height, length, unit }
weight jsonb -- { value, unit }
approx_prices jsonb -- { ebay, fbm }
notes text
requires_spapi_sync boolean default true
created_at timestamptz default now()

-- product_suppliers (optional)
product_id uuid references products
name text
reference text
url text
price numeric
```

### UI details
- **Simple tab** (4 câmpuri + preview).
- **Advanced tab** organizat pe carduri:
  1. Supplier (dropdown + inline add).
  2. Product info (manufacturer, SKU, ext ID, title, GTIN).
  3. Approximate price (Ebay, FBM).
  4. Weight (value + unit select).
  5. Product dimensions (width/height/length + unit select).
  6. Units (measure_unit select: pcs, kg, m etc.).
  7. Other (condition dropdown, ship template).
- Quick actions: „Duplicate existing product” (pre-populează formularul), „Save as draft”.

### API helpers
```ts
export const productHelpers = {
  createSimple: (payload) => supabase.rpc('create_product_simple', payload),
  createAdvanced: (payload) => supabase.rpc('create_product_advanced', payload),
  listUnits: () => ['pcs','m','l','kg','100 ml','100 gr'],
  listConditions: () => ['New','UsedLikeNew','Defect','UsedVeryGood','UsedGood','UsedAcceptable'],
};
```

### Roadmap
1. Implementare UI (modal + validări) și hooks pentru salvare.
2. Migrare date într-o nouă tabelă `products` + legare cu `stock_items`.
3. Automatizare feed Amazon pentru produsele cu `requires_spapi_sync = true`.
4. Versiunea 2: import CSV pentru produse + atașare fișiere (MSDS, fișe tehnice).

