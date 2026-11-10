# Master implementation plan

## Current phase

**Reorder rules implementation milestone — updated 2026-11-09.** Completed count remains 15/47. SALES-003 and INV-004 remain IN_PROGRESS pending authenticated browser acceptance. INV-009 now has tenant-scoped per-warehouse reorder rules, immutable alert history, scheduled/manual evaluation, management pages and dashboard indicators; migration `20261108190000_reorder_rules_low_stock` is applied locally without reset/deletion. Its isolated PostgreSQL integration passed, and workspace checks/build passed. INV-009 remains IN_PROGRESS because dependency PROCUREMENT-002 and browser acceptance are still open. It excludes incoming PO/in-transit quantities and does not create POs. REPORT-001 remains gated on INV-009 completion. SALES-004 remains gated by unresolved tax/invoice/payment/accounting decisions. No push or production deployment was performed.

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
