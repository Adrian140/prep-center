# Etsy integration plan

## Goal

Build a standalone Etsy integration, fully separate from UPS, so both client and admin can see:

- Etsy shop connection status
- Etsy orders and receipt IDs
- product-level Etsy visibility in `Products`
- tracking codes and tracking status timeline
- sync health and operational errors

## Current product decision

- Etsy stays separate from UPS in data, UI, and sync logic.
- Client sees `Etsy` under `Integrations`.
- Client sees `Product Etsy` inside `Products` for each SKU/stock item that has Etsy listings or orders.
- Admin sees a dedicated `Etsy` tab in the main sidebar.
- Admin `Etsy` sits below `Invoices` and above `UPS`.

## Etsy API reality

- The Etsy app key for `ecomprephub` is currently pending personal approval.
- Until Etsy activates the key, the integration can only remain in `pending` state.
- UI already supports this state and lets the client submit shop details in advance.

## Database model

### `etsy_integrations`

Stores one Etsy connection per user/company:

- `status`
- `shop_id`
- `shop_name`
- `shop_url`
- `etsy_user_id`
- `access_scopes`
- `connected_at`
- `last_synced_at`
- `last_error`
- `metadata`

### `etsy_orders`

Stores one row per Etsy receipt/order:

- `receipt_id`
- `status`
- `status_label`
- `tracking_code`
- `tracking_url`
- `tracking_status`
- `tracking_status_label`
- `carrier_name`
- buyer/recipient fields
- order totals
- `order_created_at`
- `shipped_at`
- `last_tracking_sync_at`
- `last_synced_at`
- `raw_payload`

### `etsy_order_items`

Stores Etsy line items linked to `stock_items` whenever SKU mapping is possible:

- `order_id`
- `stock_item_id`
- `listing_id`
- `product_id`
- `offering_id`
- `sku`
- `title`
- `variation`
- `quantity`
- price fields

### `etsy_tracking_events`

Stores tracking timeline snapshots:

- `tracking_code`
- `carrier_name`
- `status`
- `status_label`
- `status_detail`
- `location`
- `event_time`
- `raw_payload`

### `etsy_shop_listings`

Stores Etsy listing visibility for products:

- `listing_id`
- `stock_item_id`
- `shop_id`
- `shop_name`
- `sku`
- `title`
- `state`
- `quantity`
- `price_amount`
- `currency_code`
- `url`
- `synced_at`

## Client UX

### `Integrations > Etsy`

Client must see:

1. Etsy status badge: `pending`, `active`, `error`
2. A short step-by-step block explaining what the client must do
3. Fields for `Shop name`, `Shop URL`, `Shop ID`
4. A note that the app key is pending approval and activation is required before OAuth can complete
5. Confirmation that Etsy data will show in `Products` after first sync

### `Products > Product Etsy`

For each stock item, show:

- active Etsy listings for that item
- recent Etsy receipt IDs
- quantity sold through Etsy
- tracking code
- tracking status
- created/shipped timestamps

This is read directly from Etsy tables and updates through Supabase realtime subscriptions.

## Admin UX

### Main admin sidebar

Order required:

1. `Invoices`
2. `Etsy`
3. `UPS`

### `Admin > Etsy`

Admin must see:

- connected Etsy shops
- shop status
- last sync
- order list
- receipt ID
- tracking code
- tracking status
- tracking event timeline

## Sync strategy

### Phase 1: connection capture

- Client saves Etsy shop metadata in `etsy_integrations`
- status remains `pending` until Etsy activates the app and OAuth is completed

### Phase 2: OAuth activation

After Etsy activates the key:

1. redirect client/admin to Etsy OAuth
2. exchange auth code for access token
3. persist secure token server-side
4. set integration `active`

### Phase 3: order and listing sync

Recommended server jobs:

1. sync shop identity
2. sync receipts/orders
3. sync receipt transactions and map SKU to `stock_items`
4. sync shipments/tracking
5. sync listings

### Phase 4: realtime tracking

`Realtime` in UI should mean:

- Etsy sync job writes new order/tracking data into Supabase
- Supabase realtime broadcasts DB changes
- client/admin pages refresh automatically when Etsy rows change

This is already wired for:

- `etsy_orders`
- `etsy_order_items`
- `etsy_shop_listings`
- `etsy_tracking_events`

## Mapping rules

- Primary match: `etsy_order_items.sku` -> `stock_items.sku`
- Secondary match: listing-specific metadata -> `stock_items.id`
- If no match exists, keep line item in Etsy tables but leave `stock_item_id` null
- Unmapped items should still appear in admin Etsy, but not under a product until mapped

## Tracking data policy

For each order, preserve:

- track ID / tracking code
- carrier
- latest tracking status
- event timeline
- shipped timestamp
- raw API payload for debugging

## Official references

- OAuth and auth model: [Etsy Open API v3 docs](https://developers.etsy.com/documentation/)
- rate limit model: [Etsy rate limits](https://developers.etsy.com/documentation/essentials/rate-limits/)

## What is implemented in this repo now

- Supabase schema for Etsy integrations, orders, items, tracking, listings
- client Etsy integration card
- product-level `Product Etsy` block in `ClientStock`
- admin `Etsy` tab with order and tracking overview
- visibility toggle support for Etsy in admin integrations settings

## What remains after Etsy approves the key

- OAuth callback endpoint for Etsy
- token exchange and secure token storage
- scheduled sync worker / edge function
- optional webhook ingestion if Etsy exposes the needed events for this scope
