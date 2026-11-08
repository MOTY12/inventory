# Master implementation plan

## Current phase

**Phase 8, sales — updated 2026-11-08.** Roadmap progress is 15/47: SALES-002 is COMPLETED against its documented backend acceptance; SALES-003 is IN_PROGRESS. SALES-002/003 schemas and additive migrations `20261108120000_sales_orders_reservations` and `20261108140000_sales_fulfillment` are applied locally. Reservation/fulfillment APIs, transaction services, order/fulfillment UI, and isolated PostgreSQL cases for stock races, replay, partial/full fulfillment, tenant scope and reconciliation are implemented. SALES-003 still lacks a distinct pick stage and dedicated fulfillment rollback injection; authenticated browser workflows are also unverified. INV-008 transfer and SALES-001 customer implementations remain IN_PROGRESS pending browser review. PROCUREMENT-001/002/003 and INV-001/002/003/007 remain IN_PROGRESS as detailed in the task ledger. Browser control is disabled in Work settings. SALES-004 is not started: invoice/tax and payment/accounting decisions remain open under PROD-002 and must not be guessed. The roadmap dependency cycle between SALES-003 and INV-010 was removed: core fulfillment precedes barcode workflow enhancement. Planning was closed by owner direction on 2026-10-31; unresolved product/security/accounting commitments remain release gates.

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
