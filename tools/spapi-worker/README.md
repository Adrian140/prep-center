# Amazon SP-API Worker

Scripts from this directory run outside the Vite app and talk directly to
Amazon’s Selling Partner API, then push the data into Supabase with the service
role key. Install dependencies once:

```bash
cd tools/spapi-worker
npm install
```

## Required environment

Add a `.env` next to this README (or export the variables before running a
command). All scripts share the same credentials:

| Var | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE` | Service role key (needed for inserts/updates) |
| `SUPABASE_STOCK_COMPANY_ID` / `SUPABASE_STOCK_USER_ID` | (Optional) fallback to sync a single company without the `amazon_integrations` table |
| `SPAPI_REGION` | Amazon SP-API region (e.g. `eu`) |
| `SPAPI_MARKETPLACE_ID` | Marketplace ID used when querying inventory (default: `A13V1IB3VIYZZH` for Amazon FR) |
| `SPAPI_REFRESH_TOKEN` | Long-lived refresh token (only needed in single-company fallback mode) |
| `SPAPI_LWA_CLIENT_ID` / `SPAPI_LWA_CLIENT_SECRET` | Login With Amazon app keys |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM user used to assume the Selling Partner role |
| `SPAPI_ROLE_ARN` | ARN of the Selling Partner role |

Optional knobs for the inventory sync:

| Var | Purpose |
| --- | --- |
| `SPAPI_FETCH_TITLES` | `true/1` to fetch product titles from the Catalog API for new ASINs |
| `SPAPI_TITLE_LOOKUPS` | Max ASINs to enrich per run (default `20`) |
| `SPAPI_TITLE_DELAY_MS` | Delay between catalog lookups to respect rate limits (default `350`) |

## Available scripts

| Command | Description |
| --- | --- |
| `npm run refresh-token` | Calls `authRefreshAndStore.js` and writes a fresh access token to the `amazon_tokens` table |
| `npm run sync-inventory` | Runs `syncInventoryToSupabase.js`, downloads Amazon FBA inventory and upserts `stock_items` pentru toate intrările din `amazon_integrations` (actualizează `amazon_stock`, inserează SKUs lipsă și resetează produsele dispărute) |
| `node printEnvDebug.js` | Quick helper that prints/masks the loaded env vars |

### `syncInventoryToSupabase.js` flow

1. Citește toate integrările active din tabela `amazon_integrations` (sau folosește perechea din `.env` dacă rulezi în modul single-company).
2. Pentru fiecare integrare schimbă refresh token-ul pe access token și apelează `getInventorySummaries` (endpoint `fbaInventory`).
3. Normalizează răspunsul (SKU/ASIN + cantitatea disponibilă) și îl scrie în `stock_items` pentru `company_id`/`user_id` respectivi.
4. Resetează la `0` produsele care nu mai apar în Amazon și actualizează `last_synced_at` / `last_error` în `amazon_integrations`.
5. Opțional, îmbogățește produsele noi cu titluri din Catalog API.

Because the script uses the service-role key, treat the `.env` with the same
care as any other backend secret. Always run it from a trusted environment (CI
job, cron on a secure server, etc.).
