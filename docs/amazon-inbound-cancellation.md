# Amazon Inbound Cancellation

Date checked: 2026-03-22

Official Amazon SP-API references:

- `cancelInboundPlan`: https://developer-docs.amazon.com/sp-api/reference/cancelinboundplan
- `Create an inbound shipment` guide: https://developer-docs.amazon.com/sp-api/lang-en_US/docs/create-an-inbound-shipment

## What Amazon actually allows

For the inbound FBA flow used in this project, Amazon exposes cancellation at inbound plan level, not at individual pack-group level.

- Operation: `cancelInboundPlan`
- API path: `PUT /inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/cancellation`
- Effect: cancels the full inbound plan, which means all shipments generated inside that plan are cancelled together

Amazon documents the void window for Amazon Partnered Carrier as:

- SPD: up to 24 hours after transportation confirmation
- LTL / FTL: up to 1 hour after transportation confirmation

Outside that window, Amazon may still accept cancellation, but charges can apply.

## Product decision in this app

Because one prep request can contain multiple pack groups and multiple shipment splits under the same `inbound_plan_id`, the UI cancel action is implemented at request level.

When admin presses `Cancel`:

1. The app calls Amazon `cancelInboundPlan` for the request's `inbound_plan_id`.
2. Amazon cancellation applies to all shipment splits / pack groups in that inbound plan.
3. After Amazon cancellation succeeds, the app runs local rollback through `cancel_prep_request_inventory`.

## Local rollback behavior

Local cancellation currently does the following for the full prep request:

- marks request status as `cancelled`
- marks prep status as `cancelled`
- sets Amazon status to `CANCELLED`
- clears `step2_confirmed_at`, `step4_confirmed_at`, `completed_at`, `inventory_deducted_at`
- restores stock quantities into `stock_items.prep_qty_by_country`
- recomputes `stock_items.qty`
- removes generated `fba_lines` billing rows for prep services and heavy parcel labels that were created from that request

## Important limitation

This is not a per-shipment cancel action. If a request contains 4 pack groups, canceling the request cancels all 4 together because Amazon cancellation is bound to the inbound plan, not to one pack group.
