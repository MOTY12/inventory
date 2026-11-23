# Master implementation plan

## Current phase

**Inventory reporting delivered; INV-010 underway — updated 2026-11-23.** REPORT-001 is complete based on API/UI implementation, report fixture reconciliation against immutable movements, historical weighted-average valuation and reservation cutoffs, tenant/warehouse authorization checks, route authentication/OpenAPI checks, and the 13/13 opt-in report-containing PostgreSQL suite. Typecheck, lint, format, default suite and optimized production build passed. Completed ledger count is **28/47**. The local database remains at 19/19 migrations; reporting required no schema change and no migration or user data was modified. Next eligible roadmap item INV-010 has begun with keyboard barcode scanning in sales-order creation; browser interaction and camera feasibility remain unverified. Next.js and eslint-config-next were updated from 16.4.3 to 16.4.6 to clear the previous security build blocker. Registry audit access was unavailable in the network-restricted environment. Interactive browser UAT remains unavailable and is tracked in QUALITY-001.

## Phases

0. Research: inspect REA docs/capabilities; review public official inFlow sources; distinguish verified/documented/inferred/unknown. (Draft complete; some direct UI research remains unknown.)
1. Product: interview target users, approve requirements/personas/stories, confirm MVP. (Draft complete; owner validation pending.)
2. Architecture: approve data semantics, transaction/tenant/security/API design. (Draft complete; key policy approvals pending.)
3. Foundation: monorepo, toolchain, Docker, CI, observability, API/web shells.
4. Identity & locations: users, organizations, roles, branches, warehouses.
5. Catalog: SKU, units, categories, products and responsive screens.
6. Inventory engine: movements, balances, adjustments, concurrency, transfers, reorder.
7. Procurement: suppliers, PO, receipt, partial delivery.
8. Sales: customers, order, reservation, fulfillment, invoices/payment records.
9. Reporting: dashboard, exports, purchase/sales/inventory reports.
10. Quality & launch: security/reliability, pilot, legal/accounting review, deployment and operations.
11. Phase 2: approved traceability, returns, integrations and advanced workflow.
12. Phase 3: manufacturing, B2B portal, offline/mobile and broader ecosystem.

## Estimation method and complexity

Relative engineering estimate is **XL** for a production-ready multi-tenant MVP, with 47 discrete tasks across the phases (task ledger). Assuming a small experienced team and user decisions delivered promptly, early delivery planning range is roughly 4–7 months to a controlled pilot and longer for production-grade regional support. This is a planning estimate, not a commitment; user research, compliance and integration decisions can move it materially. Complexity is highest in ledger/reservations/concurrency, tenant isolation, receiving/fulfillment state machines, valuation and migration/recovery.

## Exit gates

Each task's criteria and tests must pass before status COMPLETED. No phase marked shipped based on documentation alone. Product/security/legal decisions and production release gates in `mvp-scope.md` and `acceptance-criteria.md` remain mandatory.
