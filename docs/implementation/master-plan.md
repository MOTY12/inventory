# Master implementation plan

## Current phase

**REPORT-001, REPORT-003 and INV-010 delivered; SALES-004 remains IN_PROGRESS under owner-approved DEC-010; REPORT-002 remains IN_PROGRESS; QUALITY-002/003 remain open — updated 2026-11-24.** Completed count remains **30/47**. All three opted-in disposable PostgreSQL suites passed together (26 passed, 0 failed, 0 skipped). Evidence now includes populated purchase partial/full receipts and exact detail CSV worker/S3Mock outputs; customer invoice, effective payment after reversal and outstanding reconciliation; and receivable aging boundary coverage. Fixed aging reconciliation for missing due dates by returning `no_due_date_outstanding`, and zero-filled absent customer financial metrics. The Chrome session was logged out, so browser workflow acceptance remains unverified. Migration status is 22 found and schema up to date. Remaining REPORT-002 evidence: full filter/security matrix, multi-currency pagination, EXPLAIN ANALYZE/performance and authenticated browser acceptance. SALES-004 interactive browser acceptance also remains open. QUALITY-001 is NOT_STARTED because REPORT-002 is a dependency. See progress checkpoint docs for exact next steps.

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
