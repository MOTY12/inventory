# Product requirements — Nigeria-first inventory SaaS

**Status:** proposed for owner review; no application code. **Product name:** undecided.

## Problem and users
Small and mid-sized Nigerian operators often manage stock in disconnected spreadsheets, paper forms, chat messages and accounting tools. This produces stock uncertainty, delayed purchasing, untraceable adjustments, missed orders and poor branch visibility. The product should provide a dependable record of what is stocked, where it is, why it moved, what is expected, and which orders need action.

## Product principles
1. Stock accuracy and auditability outrank feature breadth.
2. Every quantity-changing action has a business document, actor, timestamp and ledger entry.
3. Fast entry for clerks; useful controls for owners and managers.
4. Make branch and warehouse context visible throughout operations.
5. Work well on desktop and responsive mobile web; tolerate ordinary network interruptions through safe retries.
6. Design for NGN/Africa-Lagos defaults while keeping locale, currency and timezone configurable.
7. Keep the core API modular, documented and integration-ready; no early microservices.
8. Original branding and interaction design.

## Goals / success measures (targets to validate)
- New organization can configure a branch and warehouse, import products and start recording stock in one guided setup.
- All stock changes trace to a posted transaction; no silent balance writes.
- Inventory reports reconcile to ledger through a defined cutoff.
- Buyers can identify low-stock items by branch and draft a PO.
- Sales staff can create an order, allocate stock and fulfill partial quantities without overselling under strict policy.
- Initial product targets to validate with pilot: >=99.5% successful core transaction posts; <1% untraceable count variance after onboarding; task completion under 2 minutes for routine receive/pick once catalog exists.

## Personas and access needs
See `user-personas.md`. MVP supports owner/admin, operations manager, buyer, sales/fulfillment clerk, inventory controller and read-only auditor.

## Functional requirements
- Authentication, verified email, organization creation, membership/invitation, branch/warehouse setup.
- Tenant-scoped RBAC and warehouse scope.
- Catalog: product, SKU, category, base unit, purchase/sales unit conversion, barcode, prices/cost, active/archive state.
- Ledger-based location balances, adjustment/count, transfer, search/history.
- Supplier/customer directories.
- PO lifecycle with partial receiving and receipt history.
- Sales lifecycle with reservations, partial fulfillment, invoice and payment recording.
- Reorder points and low stock alerts.
- Dashboard, inventory/movement/reorder/purchase/sales reports; CSV export.
- Audit events, idempotency, asynchronous notifications/imports/exports.
- API docs, tenant-safe pagination/filter/search.

## Non-functional requirements
- Isolation: organization scope on all tenant data; authorization checks at every API boundary.
- Integrity: transactionally consistent movement posting, unique idempotency key, concurrency-safe allocation.
- Availability/recovery: target 99.5% initial service uptime; daily encrypted backups, restore rehearsal before production; RPO <=24h/RTO <=8h initially.
- Performance: p95 <500 ms for common list reads at pilot-scale, excluding exports; no broad table scans in tenant list endpoints.
- Security: TLS, password hashing, session revocation, rate limits, secrets manager, logs scrubbed of credentials/PII.
- Accessibility: WCAG 2.2 AA target for core workflows; keyboard and screen-reader support.
- Data portability: tenant can export product, transaction, and balance data; retention/deletion policy requires legal review.

## MVP boundaries
See `mvp-scope.md`. MVP excludes advanced accounting, manufacturing, native offline app and payment processing. Payment records are operational records, not settlement processing. Tax invoice compliance requires validation before public launch.

## Assumptions and risks
- **Assumption:** early adopters need NGN single-currency and basic VAT handling. Validate with Nigerian accountant and pilot users.
- **Assumption:** 1 stock base unit/product with purchase and sales conversion is sufficient for MVP; catch cases such as drums/liters and carton/pieces.
- **Risk:** tax invoicing, privacy/data protection, payments, retention and electronic records have legal and operational requirements requiring local review.
- **Risk:** intermittent power/network and low-end Android hardware affect warehouse workflow.
- **Risk:** imports can create duplicate/incorrect stock; require preview, validation and reversible opening-balance import.
- **Risk:** legacy stock quality leads to user distrust; onboarding and cycle-count process are part of MVP.

## Decisions requiring owner approval before implementation
1. Product name and initial customer segment/vertical.
2. Strict no-negative-available default and override roles.
3. Moving weighted-average valuation for MVP and landed-cost policy.
4. Reservation timing: order confirmation vs fulfillment start.
5. Local tax invoice scope and acceptable release gate.
6. Hosted cloud region, data residency expectations, and target operating budget.
7. Initial plan limits, pricing and payment provider.
8. Authentication method (email/password + MFA vs managed identity provider).
