# Master implementation plan

## Current phase

**REPORT-001 delivered; INV-010 acceptance and REPORT-003 are in progress — updated 2026-11-23.** Completed count remains **28/47**. REPORT-001's existing 13/13 PostgreSQL fixture and report API evidence remain recorded below. INV-010 has an added focused single-submit/sequential queue regression, but a real browser Enter-key/workspace-switch acceptance is still unavailable. REPORT-003 now has the additive export schema/migration applied, BullMQ queue/worker, private S3-compatible storage, authenticated tenant/warehouse-scoped history/retry/download APIs, CSV formula protection and the Reports UI. Isolated PostgreSQL + Redis/BullMQ + S3Mock export integration passed 13/13 for Inventory Summary and reconciled quantities, reservations and WAC valuation. Typecheck, lint, format, API build and production web build pass. The default API contract smoke cannot bind a local listener in this environment (`listen EPERM`); 2 opt-in PostgreSQL suites remain skipped by default. Remaining REPORT-003 export-type and authenticated UI/API checks are listed in the ledger and next-session handoff. Local Compose PostgreSQL, Redis and S3Mock report healthy; migration status is 20/20. Camera research still supports manual/USB/Bluetooth keyboard fallback. Registry audit access and interactive browser control remain unavailable; do not claim UAT.

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
