# Master implementation plan

## Current phase

**Sales fulfillment and import continuation — updated 2026-11-08.** Completed count remains 15/47. SALES-003 now implements persisted picking and the `fulfilled <= picked <= ordered` invariant, and INV-004 implements product CSV import plus opening balances. Additive migrations `20261108160000_sales_picking` and `20261108180000_product_imports` are applied locally without reset/deletion. Isolated PostgreSQL integration, default tests, typecheck, lint, format, Prisma validation, and production build passed; details and browser gaps are in the progress checkpoint and task ledger. Both tasks remain IN_PROGRESS because authenticated browser acceptance is unavailable in current Work settings. INV-009 reorder rules depend on procurement and is not started; its sequencing gate also requires SALES-003 and INV-004 completion. SALES-004 remains gated by unresolved tax/invoice/payment/accounting decisions. Other in-progress modules are tracked in the task ledger. No push or production deployment was performed.

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
