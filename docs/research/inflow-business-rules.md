# Business rules extracted from public inFlow documentation and proposed rules

Every row distinguishes product evidence from our new platform policy. Source URLs and dates are indexed in `research-sources.md`.

| Topic | inFlow evidence | Proposed rule for our SaaS |
|---|---|---|
| On hand | **DOCUMENTED:** physical shelf quantity; official help differentiates picked quantities. | Quantity physically in an available warehouse bin/location, excluding dispatched/in-transit units. Define consistently in architecture. |
| Reserved | **DOCUMENTED:** quantities required for open sales/work orders. | Commit stock at explicit order confirmation (decision pending); release on cancellation; convert reservation to picked/shipped exactly once. |
| Available | **DOCUMENTED:** help gives on-hand less reserved. | `available = on_hand - reserved`; reservations may not exceed allocatable on-hand under strict policy, with exception workflow if approved. |
| On order | **DOCUMENTED:** incoming vendor/transfer/manufacturing quantities; anticipated quantity includes on-order. | Purchase ordered qty less accepted receipts; transfers are separate in-transit and not sellable at destination until received. |
| Anticipated | **DOCUMENTED:** on hand − reserved + on order for reorder. | `projected = on_hand + incoming_PO + incoming_transfer - reserved`; exclude canceled/closed/expired docs. Include the formula in UI. |
| Negative stock | **DOCUMENTED:** inFlow help explains it can occur. | Organization policy `prevent_negative_available` defaults true; controlled override only for authorized role and reason. Never mutate ledger silently. |
| Product/SKU | **DOCUMENTED:** SKU and product-type options exist. | Unique normalized SKU per tenant among active products, optionally scoped by variant after variants are supported. Decide case sensitivity before schema migration. |
| Purchase receiving | **DOCUMENTED:** receive individual lines, partial quantity/date/UoM. | Posted receipt quantity must be positive and not exceed outstanding ordered amount unless an authorized over-receipt policy is enabled. Unique idempotency key; same PO line/receipt may not post twice. |
| Sales fulfillment | **DOCUMENTED:** partial pick/ship and backorder/split workflows exist. | Picking is warehouse-scoped; shipped qty cannot exceed picked qty; reservations release/decrement exactly once. Return posts a separate reverse movement. |
| Transfers | **DOCUMENTED:** send/destination roles and in-transit stage described. | Dispatch atomically removes source on-hand and writes in-transit; receipt atomically removes in-transit and adds destination; shortage/damage reconciled with reason. |
| Adjustments | **DOCUMENTED:** stock count/adjust reasons and history. | Adjustment stores before, counted/expected, delta, reason, user, location and timestamp; approved/posting creates ledger entry, no direct stock editing. |
| Valuation | **DOCUMENTED:** costing/COGS/valuation supported; methods not fully verified. | MVP moving weighted-average costing; reverse/return accounting policy and landed-cost allocation need decision. Preserve cost snapshot per movement. |
| Money | **DOCUMENTED:** prices, discounts, taxes, freight, payment history, multiple currencies. | PostgreSQL numeric; tenant base currency default NGN; round at documented currency precision; payment allocations cannot exceed invoice balance unless a credit/refund flow is used. |
| Order statuses | **DOCUMENTED:** open, partial, fulfilled, unpaid, invoiced, canceled groups/filters. | Use explicit state machine, immutable event history, legal transitions, and separate fulfillment from financial state. Exact enum in API spec. |
| Reorder | **DOCUMENTED:** per-location threshold, reorder qty/method and scheduled alerts. | Alert if projected quantity `<= reorder_point`; suppress duplicate alert until recovery or cooldown. Suggested quantity is explicit minimum-to-target calculation; never auto-submit PO. |
| Audit | **DOCUMENTED:** movement history records stock changes tied to documents. | Immutable append-only stock ledger plus business audit events; tenant and actor included; corrections are reversing entries. |
| Tenant isolation | No public product evidence relevant; **INFERRED** SaaS requirement from this platform brief. | Every tenant row has `organization_id`; enforce application scope plus PostgreSQL RLS as defense-in-depth where practical; test cross-tenant denial. |
| Branch access | **DOCUMENTED:** inFlow location access rights; exact details not exhaustively observed. | Role grants are organization plus branch/warehouse scopes; every command and report checks scope server-side. |
| Nigerian localization | **UNKNOWN** in inFlow materials reviewed. | NGN, Africa/Lagos timezone, Nigerian address/phone conventions, CSV imports, connectivity tolerance; tax rules subject to local accounting/legal validation. |
