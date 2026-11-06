# Master implementation plan

## Current phase
**Phase 5 Catalog and Phase 6 Inventory — updated 2026-11-06.** INV-005/006 are COMPLETED (14/47 roadmap tasks total); isolated PostgreSQL tests cover immutable ledger behavior and transactional posting/reconciliation. INV-001/002/003 and INV-007 remain IN_PROGRESS pending authenticated browser/API workflow and remaining adjustment scope tests. Movement history is now implemented. INV-008 is dependency-ready; atomic transfers are not yet implemented. Reservation lifecycle belongs to SALES-002 after SALES-001, INV-006 and ARCH-001. Research/product/architecture planning was closed for implementation start by owner direction on 2026-10-31. ARCH-001 inventory transition semantics are documented using provisional defaults. PROD-002 and ARCH-002 release/security decisions remain open. REA public-page inspection remains unavailable as documented. Target-user interviews are deferred to pilot validation; no interview findings are claimed.

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
