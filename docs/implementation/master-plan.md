# Master implementation plan

## Current phase

**REPORT-001 and REPORT-003 delivered; INV-010 browser acceptance and QUALITY-003 remain open — updated 2026-11-23.** Completed count is **29/47**, counted from task ledger entries. REPORT-003 passed isolated PostgreSQL + live Redis/BullMQ + S3Mock generation/download for all four exports, including multi-warehouse movement order, historical/current valuation and NGN/USD separation, low-stock data, retry, expiry and private download. Both opt-in PostgreSQL suites passed (13/13 inventory/report; 10/10 auth/organization); full `npm test` passed (51 passed, 0 failed, 2 opt-in suites skipped by default, plus 2 web tests passed). Typecheck, lint, format, Prisma validation, migration status (20/20), and production build passed. Local API readiness returned HTTP 200. No Chrome CDP target was reachable, so native Enter/workspace-switch UI acceptance remains open for INV-010. QUALITY-003 is IN_PROGRESS: initial PostgreSQL archive/restore script and local drill passed, while queue/object recovery, RPO/RTO approval and off-host storage policy remain. No commit or push was created.

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
