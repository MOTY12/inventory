# Master implementation plan

## Current phase
**Phase 5 Catalog and Phase 6 Inventory — INV-001/002/003/005/006/007 IN_PROGRESS (updated 2026-11-06).** Product/catalog, ledger, balance, and stock adjustment migrations are deployed to local `inventory_dev`; prior user/organization/membership row counts were preserved. Catalog/product APIs and UI, ledger schema, balance/reconciliation reads, and an internal single-warehouse posting service are implemented. INV-007 now has a single-product count draft/list/post API and UI, but its database posting/concurrency/tenant acceptance tests and browser workflow remain pending. Product CRUD/conversion DB workflows and INV-006 posting/immutability tests are also unverified. Atomic transfer and reservation lifecycle remain unimplemented. Research/product/architecture planning was closed for implementation start by owner direction on 2026-10-31. ARCH-001 inventory transition semantics are documented for provisional core implementation. PROD-002 and ARCH-002 release/security decisions remain open. REA public-page inspection remains unavailable as documented. Target-user interviews are deferred to pilot validation; no interview findings are claimed. Open product/security/accounting decisions remain explicit gates for domain-specific implementation, but do not block independent workflow work.

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
