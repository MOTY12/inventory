# Master implementation plan

## Current phase

**REPORT-001, REPORT-003 and INV-010 delivered; SALES-004 and REPORT-002 remain IN_PROGRESS; QUALITY-001 is IN_PROGRESS for fixture tooling, with operational acceptance NOT RUN; QUALITY-002/003 remain open — updated 2026-11-27.** Completed count remains **30/47**. QA tests passed 18/18; typecheck, lint, formatting, default tests (62 API/shared + 4 web), and production build passed. The three opt-in PostgreSQL suites were skipped in `npm test`; the SALES-004 suite was explicitly run and passed 4/4 tests against an isolated randomized schema, including payment allocations/reversals, invoice totals and tax snapshots, customer balance reconciliation, PDF output, and inventory non-mutation. Docker reports PostgreSQL, Redis and S3Mock healthy; Prisma reports 22 migrations and schema up to date. QA fixture execution remains blocked by missing `NODE_ENV` and QA organization/actor values. Authenticated Chrome showed existing invoice/order data but no eligible order for invoice creation; no existing record was changed. Browser invoice/payment workflow and actual downloaded PDF capture remain unverified. No roadmap task became complete.

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
