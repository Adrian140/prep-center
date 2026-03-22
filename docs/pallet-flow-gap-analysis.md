# Pallet Flow Gap Analysis

Date: 2026-03-22

## Scope

Audit for the palletized FBA flow only.

Goals:
- keep box/SPD UI and logic untouched
- verify current pallet implementation against Amazon SP-API
- identify what is already isolated correctly
- identify what is incomplete or incorrect from Step 1 through final tracking

Official Amazon sources reviewed:
- [Create a shipment with an Amazon-partnered carrier (PCP)](https://developer-docs.amazon.com/sp-api/lang-es_ES/docs/create-amazon-partnered-carrier-shipment)
- [Create a shipment with a non-partnered carrier](https://developer-docs.amazon.com/sp-api/lang-fr_FR/docs/create-non-partnered-carrier-shipment)
- [cancelInboundPlan](https://developer-docs.amazon.com/sp-api/reference/cancelinboundplan)
- [getBillOfLading](https://developer-docs.amazon.com/sp-api/reference/getbilloflading)

Key Amazon requirements confirmed from official docs:
- pallet shipments use the same inbound plan / placement flow, but Step 2 must provide pallet freight data
- `getLabels` for pallet shipments requires `NumberOfPallets`
- Amazon requires `getLabels` per shipment ID
- Amazon-partnered pallet shipments also require `getBillOfLading`
- non-partnered pallet tracking must be sent with `ltlTrackingDetail.freightBillNumber`
- `listInboundPlanPallets` is the pallet equivalent of `listInboundPlanBoxes`
- cancellation void window is 24h for SPD and 1h for LTL/FTL partnered shipments

## Current State

### What is already correct

1. Pallet flow is mostly isolated from box flow.
   - `src/components/dashboard/client/fba/FbaStep1Inventory.jsx`
   - `src/components/dashboard/client/fba/FbaStep1bPacking.jsx`
   - `src/components/dashboard/client/fba/FbaSendToAmazonWizard.jsx`
   - `src/api/fbaPalletTransport.ts`
   - `supabase/functions/fba-ltl-options/index.ts`

2. Step 1 and Step 1b already avoid breaking the box flow.
   - `palletOnlyMode` skips the normal box-detail workflow.
   - Step 1b pallet mode is read-only and does not force box dimensions/weights.
   - this is the right direction if we want a separate pallet path.

3. Shared Step 2 backend already contains real LTL/FTL support.
   - `supabase/functions/fba-step2-confirm-shipping/index.ts`
   - validates `pallets` and `freightInformation`
   - supports delivery-window generation/confirmation
   - confirms transportation options per shipment, not just once globally

4. The generic inbound actions function already supports one pallet-related capability.
   - `supabase/functions/fba-inbound-actions/index.ts`
   - `get_labels_v0` already accepts `NumberOfPallets`

### What is incomplete or incorrect

#### Step 1

1. Pallet-mode detection is heuristic, not explicit.
   - `src/components/dashboard/client/fba/FbaSendToAmazonWizard.jsx`
   - `palletOnlyMode` is inferred from packing types and units-per-box.
   - risk: a request can accidentally enter or skip pallet mode.

2. Step 1 inventory allows pallet mode, but there is no explicit pallet transport intent switch.
   - current behavior is inference-based, not user-confirmed
   - this is fragile for mixed or edge-case requests

#### Step 1b

1. Step 1b pallet mode is intentionally minimal, which is acceptable.
   - `src/components/dashboard/client/fba/FbaStep1bPacking.jsx`
   - but it stops at "continue to shipping" and does not establish pallet allocations per shipment
   - today it only preserves Amazon packing groups, not actual pallet distribution

#### Step 2

1. The dedicated pallet options edge function currently requires `company_id`, but the client does not send it.
   - client: `src/api/fbaPalletTransport.ts`
   - server: `supabase/functions/fba-ltl-options/index.ts`
   - current server validation:
     - `company_id`, `inboundPlanId`, `placementOptionId`, `shipmentId`, `readyToShipDate`
   - current client payload does not include `company_id`
   - result: pallet-only option generation can fail immediately

2. The dedicated pallet options flow only requests options for the first shipment.
   - `src/components/dashboard/client/fba/FbaSendToAmazonWizard.jsx`
   - `fetchShippingOptions()` uses:
     - first shipment ID only
     - one pallet payload only
   - Amazon transport selection is shipment-based
   - if one inbound plan has multiple shipments after placement, current pallet branch does not model them correctly

3. The pallet UI does not let the user edit pallet dimensions.
   - `src/components/dashboard/client/fba/FbaStep2Shipping.jsx`
   - current pallet inputs:
     - quantity
     - weight
     - stackability
     - freight class
     - declared value
     - currency
   - missing user-editable inputs:
     - pallet length
     - pallet width
     - pallet height
   - Amazon transport quotes for palletized LTL/FTL depend on dimensions and weight

4. `validatePalletDetails()` does not actually validate.
   - `src/components/dashboard/client/fba/FbaSendToAmazonWizard.jsx`
   - it silently autofills defaults and returns `null`
   - invalid or placeholder freight data can pass through to Amazon
   - especially risky:
     - `freightClass: FC_XX`
     - auto `declaredValue: 1`

5. Per-shipment pallet payload is not modeled correctly.
   - `buildShipmentConfigs()` applies the same pallet payload to every shipment in LTL/FTL mode
   - if Amazon split the plan into 2+ shipments, each shipment should carry its own pallet count / pallet measurements / freight data
   - current implementation duplicates the same pallet summary onto all shipments

6. The dedicated pallet options function only generates + lists options.
   - `supabase/functions/fba-ltl-options/index.ts`
   - its header comment says generate + list + confirm, but confirm is not implemented there
   - actual confirmation is done by the shared `fba-step2-confirm-shipping` function
   - this is not fatal, but the code and comments are out of sync

#### Step 3

1. Step 3 is still box-centric.
   - `src/components/dashboard/client/fba/FbaStep3Labels.jsx`
   - title, copy and actions are written for box labels only

2. Pallet labels are not requested correctly.
   - `src/components/dashboard/client/fba/FbaSendToAmazonWizard.jsx`
   - `handlePrintLabels()` sends:
     - `number_of_packages`
     - optional page params
   - it does not send:
     - `number_of_pallets`
   - Amazon docs explicitly require `NumberOfPallets` for pallet labels

3. Bill of lading is missing entirely.
   - no UI button
   - no `getBillOfLading` action in `supabase/functions/fba-inbound-actions/index.ts`
   - Amazon docs require BOL for Amazon-partnered LTL/FTL shipments

4. Pallet listing endpoints are missing.
   - `listInboundPlanPallets` and `listShipmentPallets` are not exposed in `fba-inbound-actions`
   - because of that, UI cannot show actual pallet package IDs returned by Amazon

#### Step 4

1. Tracking is box-only today.
   - `src/components/dashboard/client/fba/FbaStep4Tracking.jsx`
   - `loadInboundPlanBoxes()` uses `list_inbound_plan_boxes`
   - no pallet equivalent exists in UI

2. Non-partnered pallet tracking is not implemented.
   - `submitTrackingDetails()` sends only:
     - `spdTrackingDetail.spdTrackingItems`
   - Amazon requires pallet tracking as:
     - `ltlTrackingDetail.freightBillNumber`

3. Tracking update currently uses only the first shipment.
   - `src/components/dashboard/client/fba/FbaSendToAmazonWizard.jsx`
   - this is wrong for both:
     - multi-shipment SPD
     - multi-shipment pallet flows

4. Partnered pallet workflow is incomplete even if manual tracking is disabled.
   - disabling manual tracking is fine for partnered shipments
   - but Step 4 still lacks pallet-oriented visibility:
     - pallet IDs
     - shipment confirmation IDs
     - BOL access
     - final freight reference visibility

## Status By Step

### Step 1

Status: usable but heuristic

Good:
- box flow untouched
- pallet-friendly packing types exist

Missing:
- explicit user-level "pallet shipment" decision
- better control for mixed scenarios

### Step 1b

Status: acceptable as isolated placeholder

Good:
- does not interfere with box contents flow
- keeps packing groups visible

Missing:
- real pallet allocation model per shipment

### Step 2

Status: partially implemented, not production-safe yet

Good:
- shared backend supports LTL/FTL confirmation well
- separate fetch branch avoids touching SPD options

Missing / broken:
- `company_id` mismatch between client and pallet edge function
- first-shipment-only option generation
- no pallet dimensions inputs in UI
- fake validation instead of strict validation
- duplicated pallet payload across all shipments

### Step 3

Status: not pallet-ready

Good:
- per-shipment manual FBA ID support already exists

Missing:
- pallet labels via `NumberOfPallets`
- pallet package listing
- bill of lading
- pallet-specific copy/UI

### Step 4

Status: not pallet-ready

Good:
- SPD tracking flow works as a separate box-based model

Missing:
- pallet list
- pallet tracking payload
- multi-shipment LTL tracking
- partnered LTL post-confirmation artifacts

## Recommended Implementation Order

Do not touch SPD/box flow.

Build pallet flow in this order:

1. Fix Step 2 option generation for pallets.
   - send `company_id`
   - generate/list per shipment, not first shipment only
   - add strict pallet validation
   - add editable pallet dimensions in pallet-only UI

2. Persist pallet data per shipment.
   - store pallet config at shipment level inside `step2_shipments`
   - do not reuse one global pallet payload for all shipments

3. Add Step 3 pallet artifacts.
   - `getBillOfLading` action
   - `listInboundPlanPallets`
   - `listShipmentPallets`
   - print pallet labels with `NumberOfPallets`
   - show BOL button only for partnered LTL/FTL

4. Add Step 4 pallet tracking.
   - separate pallet table/UI from current box tracking table
   - non-partnered LTL/FTL should submit `ltlTrackingDetail.freightBillNumber`
   - partnerered LTL/FTL should show read-only status + BOL / pallet references

5. Add explicit regression protection.
   - keep pallet feature behind current pallet branch only
   - no shared UI changes for SPD unless strictly read-only and harmless

## Test Checklist

### Pallet-only happy path

1. Create request with pallet-friendly SKUs only.
2. Confirm Step 1 and Step 1b.
3. In Step 2:
   - edit pallet dimensions, weight, quantity, stackability, freight class
   - generate options
   - verify options exist for every shipment
4. Confirm an LTL/FTL option.
5. In Step 3:
   - print pallet labels
   - for partnered LTL/FTL also fetch BOL
6. In Step 4:
   - if non-partnered, send `freightBillNumber`
   - if partnered, verify read-only completion flow

### Multi-shipment pallet split

1. Use a plan that Amazon splits into 2+ shipments.
2. Verify Step 2 shows all shipments.
3. Verify pallet allocations are stored separately per shipment.
4. Verify labels are generated per shipment.
5. Verify tracking or partnered completion also works per shipment.

### Regression

1. Normal SPD flow must still:
   - use box dimensions
   - print box labels
   - use `spdTrackingDetail`
2. Existing Step 1b box flow must remain unchanged.

## Conclusion

Current pallet work is a solid start because it is already mostly isolated from the box flow.

However, the pallet flow is only partially complete today:
- Step 1 and Step 1b are acceptable
- Step 2 is close, but has structural gaps
- Step 3 and Step 4 are still box-oriented and must be extended for real pallet support

The safest next move is:
- finish Step 2 correctly first
- then add pallet-specific Step 3
- then add pallet-specific Step 4

This sequence preserves SPD stability and avoids mixing pallet behavior into the existing box workflow.
