# PrepBusiness → EcomPrep Hub Sync Plan

Context from chat:
- Token Name is only a label; the secret token is shown once. If it was not saved, delete and recreate it.
- Best flow is webhook “push” (instant) with cron/polling as a fallback for reconciliation.
- Use merchant context (`X-Selected-Client-Id`) to fetch data per client.
- Idempotency is required on receptions/lines/products to avoid duplicates.

Environment secrets (added to `.env.example`):
- `PREPBUSINESS_API_BASE_URL` – e.g. `https://<your-company>.prepbusiness.com/api`
- `PREPBUSINESS_API_TOKEN` – API token created in PrepBusiness (keep server-side only)
- `PREPBUSINESS_WEBHOOK_SECRET` – optional shared secret for inbound webhooks
- `PREPBUSINESS_SYNC_MODE` – `manual` (accept payload) or `api` (poll PrepBusiness API)
- `PREPBUSINESS_INBOUNDS_PATH` – override endpoint path when polling (`/inbounds` default)

Implementation steps
1) Inputs & mapping
   - Create a `prep_merchants` mapping table (prepbusiness merchant_id → ecomprephub client_id + destination defaults).
   - Store `last_sync_at` per merchant for polling fallback.

2) Ingestion (choose one, keep both long term)
   - Webhook: expose `POST /api/webhooks/prepbusiness` (Vercel) with signature verification if available. On receive, enqueue a “process inbound” job.
   - Cron: Vercel Cron → `/api/sync/prepbusiness` every 30 min to fetch created/updated since `last_sync_at`.
   - Both paths call the same processor with a normalized payload: merchant_id, inbound/order id, lines (asin, sku, qty, name, notes), destination/country.

3) Reception upsert
   - Key: `source = 'prepbusiness'`, `source_id = <prep inbound/order id>`, `client_id = mapped`.
   - If exists → update lines/status; else create reception with status `submitted`.
   - Persist any shipment refs/tracking to show in UI.

4) Inventory upsert
   - Key: `unique(client_id, asin, sku)` (fallback to sku then asin if one is missing).
   - On missing product, create stub (asin, sku, name) so reception lines can link to `inventory_item_id`.
   - Amazon sync continues to upsert on the same key, enriching details without duplicates.

5) Reception lines upsert
   - Key: `unique(reception_id, inventory_item_id)` or `(reception_id, asin, sku)`.
   - Store requested qty; when physical check-in happens, adjust `received_qty` and move stock (reuse existing receiving logic in `supabase.js`).

6) Safety & monitoring
   - Idempotent processors (ignore repeats via `source_id`).
   - Retry queue for webhook failures; daily cron reconciliation to catch misses.
   - Metrics: count of imported receptions, duplicates prevented, errors per merchant.

Implemented scaffolding (ready for wiring to real PrepBusiness API):
- DB tables + RLS: `prep_business_integrations`, `prep_business_imports`, `prep_merchants`.
- Edge Function `prepbusiness-webhook`: accepts inbound payloads and creates receptions + items (idempotent).
- Edge Function `prepbusiness-sync`: accepts manual `inbounds[]` payloads; can poll API when `PREPBUSINESS_SYNC_MODE=api`.

Next actions
- Confirm which object to pull from PrepBusiness (Inbound vs Orders) and whether webhooks are available.
- Provide the webhook signing docs (if any) so we wire verification.
- Share field names for destination/country so mapping is accurate.***
